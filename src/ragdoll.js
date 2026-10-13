import * as THREE from 'three';
import { PHYS } from './config.js';

// A physics ragdoll for the runner (wipeouts and hard crashes). Eleven verlet particles joined by
// distance constraints: a rigid torso cage (pelvis, chest, both shoulders and hips), a head that
// swings on the chest, arms and legs that swing at the shoulders and hips. They fall under the
// planet's gravity and collide with the ground and the buildings, so no two falls play the same: the
// tumble axis, the spin and every limb's kick are random, and what the body hits decides the rest.
// The model is then posed from the particles: the whole runner is rigidly fitted to the torso cage
// and each limb pivot aims at its particle. The player's own body keeps its momentum and its
// controls: the ragdoll is kept over it (a tether on the sideways drift) so the two never part.
// When it has settled it gets back up, blending into the normal pose.

const PEL = 0, CHE = 1, HED = 2, SHL = 3, SHR = 4, HPL = 5, HPR = 6, HNL = 7, HNR = 8, FTL = 9, FTR = 10;
const RAD = [0.28, 0.28, 0.26, 0.2, 0.2, 0.22, 0.22, 0.16, 0.16, 0.18, 0.18]; // (how thick each part is)
const STEP = 1 / 90, ITER = 6, GRAV = 1.5; // (x the game's gravity: a fall should read as a fall)
const TETHER = 8; // per second
const GETUP = 0.55;

// [a, b, kind]: 0 rigid, -1 no closer than k x rest (min)
const RIGID = [[PEL, CHE], [SHL, SHR], [HPL, HPR], [SHL, HPL], [SHR, HPR], [SHL, HPR], [SHR, HPL], [PEL, SHL], [PEL, SHR],
  [CHE, HPL], [CHE, HPR], [CHE, SHL], [CHE, SHR], [PEL, HPL], [PEL, HPR], [CHE, HED], [SHL, HNL], [SHR, HNR], [HPL, FTL], [HPR, FTR]];
const MIN = [[HED, PEL, 0.9], [HED, SHL, 0.85], [HED, SHR, 0.85], [HNL, HNR, 0.5], [FTL, FTR, 0.55], [HNL, SHR, 0.5], [HNR, SHL, 0.5],
  [FTL, HPR, 0.5], [FTR, HPL, 0.5], [HNL, CHE, 0.5], [HNR, CHE, 0.5], [HNL, PEL, 0.4], [HNR, PEL, 0.4]];

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _d = new THREE.Vector3();
const _n = new THREE.Vector3(), _w = new THREE.Vector3(), _vel = new THREE.Vector3(), _sh = new THREE.Vector3();
const _near = [];
const _mc = new THREE.Matrix4(), _mr = new THREE.Matrix4();
const _qr = new THREE.Quaternion(), _ql = new THREE.Quaternion();

// orthonormal torso frame from four particles
function basis(out, pel, che, shl, shr) {
  _y.subVectors(che, pel).normalize();
  _x.subVectors(shr, shl);
  _x.addScaledVector(_y, -_x.dot(_y)).normalize();
  _z.crossVectors(_x, _y);
  return out.makeBasis(_x, _y, _z);
}

export class Ragdoll {
  // sign: +1 pitches forward (head first over the skates), -1 backward (thrown back off a wall)
  constructor(game, model, body, sign = 1) {
    this.g = game;
    this.m = model;
    this.b = body;
    this.t = 0;
    this.acc = 0;
    this.calm = 0;
    this.getUp = -1;
    const m = model;
    // the model's rest pose, to measure the skeleton from
    this.zero();
    m.root.updateMatrixWorld(true);
    const s = m.root.scale.x || 1;
    const loc = (o) => m.root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
    const J = [];
    J[PEL] = loc(m.torso);
    J[SHL] = loc(m.armL); J[SHR] = loc(m.armR);
    J[HPL] = loc(m.legL); J[HPR] = loc(m.legR);
    J[CHE] = J[SHL].clone().add(J[SHR]).multiplyScalar(0.5);
    J[HED] = loc(m.head).add(new THREE.Vector3(0, 0.3, 0));
    J[HNL] = J[SHL].clone().add(new THREE.Vector3(0, -0.7, 0));
    J[HNR] = J[SHR].clone().add(new THREE.Vector3(0, -0.7, 0));
    J[FTL] = J[HPL].clone().add(new THREE.Vector3(0, -J[HPL].y, 0));
    J[FTR] = J[HPR].clone().add(new THREE.Vector3(0, -J[HPR].y, 0));
    this.P0 = m.root.position.clone();
    this.Q0 = m.root.quaternion.clone();
    this.rest = J.map((j) => m.root.localToWorld(j.clone())); // world rest positions
    this.W = this.rest;
    this.Br = basis(new THREE.Matrix4(), this.rest[PEL], this.rest[CHE], this.rest[SHL], this.rest[SHR]).clone();
    this.Brinv = this.Br.clone().invert();
    const dist = (a, c) => this.rest[a].distanceTo(this.rest[c]);
    this.rigid = RIGID.map(([a, c]) => [a, c, dist(a, c)]);
    this.min = MIN.map(([a, c, k]) => [a, c, dist(a, c) * k]);
    this.dRest = {
      armL: J[HNL].clone().sub(J[SHL]).normalize(), armR: J[HNR].clone().sub(J[SHR]).normalize(),
      legL: J[FTL].clone().sub(J[HPL]).normalize(), legR: J[FTR].clone().sub(J[HPR]).normalize(),
      head: J[HED].clone().sub(J[CHE]).normalize(),
    };
    this.stand = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), q: [], bodyY: 0 };
    this.limbs = [m.armL, m.armR, m.legL, m.legR, m.head, m.torso];
    for (let i = 0; i < this.limbs.length; i++) this.stand.q.push(new THREE.Quaternion());
    this.p = this.rest.map((w) => w.clone());
    this.prev = this.rest.map((w) => w.clone());
    this.G = (PHYS.gravity || 6) * GRAV;

    // launch: every particle gets the body's velocity plus a random tumble about a horizontal axis
    // (pitching forward or back), a random spin about the vertical and a kick of its own
    const up = body.up;
    const vel = _vel.copy(body.vel);
    const vH = vel.clone().addScaledVector(up, -vel.dot(up));
    const sp = vH.length();
    const dir = sp > 1 ? vH.divideScalar(sp) : new THREE.Vector3(0, 0, 1).applyQuaternion(m.root.quaternion);
    const axis = new THREE.Vector3().crossVectors(up, dir).multiplyScalar(sign);
    axis.addScaledVector(new THREE.Vector3().crossVectors(up, dir).cross(up), (Math.random() - 0.5) * 0.8); // (a bit of sideways roll)
    axis.normalize();
    const w = (3.5 + Math.min(sp, 60) * 0.1) * (0.6 + Math.random() * 0.9);
    const omega = axis.multiplyScalar(w).addScaledVector(up, (Math.random() - 0.5) * 6);
    const com = this.p[PEL].clone().lerp(this.p[CHE], 0.5);
    for (let i = 0; i < this.p.length; i++) {
      const r = _d.subVectors(this.p[i], com);
      const v = new THREE.Vector3().crossVectors(omega, r).add(body.vel);
      if (i >= HNL || i === HED) v.add(new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5)); // (limbs kick)
      this.prev[i].copy(this.p[i]).addScaledVector(v, -STEP);
    }
  }

  // the model's pivots back at their rest values (animate() takes over again from here)
  zero() {
    const m = this.m;
    m.trick.position.y = 1.2;
    m.trick.rotation.set(0, 0, 0);
    m.body.position.y = m.bodyBase;
    for (const o of [m.armL, m.armR, m.legL, m.legR, m.head, m.torso]) o.rotation.set(0, 0, 0);
  }

  release() { this.zero(); }

  // one particle against the ground and buildings: pushed out, with a little bounce and plenty of friction
  collide(i, solids) {
    const g = this.g;
    const p = this.p[i], prev = this.prev[i], rad = RAD[i];
    const resolve = (n, pen, fric) => {
      _vel.subVectors(p, prev);
      p.addScaledVector(n, pen);
      const vn = _vel.dot(n);
      if (vn < 0) {
        _vel.addScaledVector(n, -vn).multiplyScalar(1 - fric).addScaledVector(n, -vn * 0.3);
        prev.copy(p).sub(_vel);
      }
    };
    const sr = g.planet.surface(p, _n);
    const pen = sr + rad - p.length();
    if (pen > 0) resolve(_n, pen, 0.2);
    if (!solids) return;
    for (const col of g.colliders.query(p, 1.2, _near)) {
      if (col.platform) continue;
      const pn = g.colliders.contact(col, p, rad, _w);
      if (pn > 0) resolve(_w, pn, 0.12);
    }
  }

  simulate(h) {
    const p = this.p, prev = this.prev;
    const b = this.b;
    for (let i = 0; i < p.length; i++) {
      _vel.subVectors(p[i], prev[i]).multiplyScalar(0.996);
      prev[i].copy(p[i]);
      const len = p[i].length() || 1;
      p[i].add(_vel).addScaledVector(p[i], -this.G * h * h / len);
    }
    // the tether: the sideways drift towards the player's body (it moves the whole figure, not its spin)
    _sh.copy(b.pos).addScaledVector(b.up, 0.9).sub(p[PEL]);
    _sh.addScaledVector(b.up, -_sh.dot(b.up)).multiplyScalar(Math.min(1, TETHER * h));
    for (let i = 0; i < p.length; i++) { p[i].add(_sh); prev[i].add(_sh); }
    for (let it = 0; it < ITER; it++) {
      for (const [a, c, d] of this.rigid) {
        _d.subVectors(p[c], p[a]);
        const l = _d.length() || 1e-6;
        _d.multiplyScalar((l - d) / l * 0.5);
        p[a].add(_d); p[c].sub(_d);
      }
      for (const [a, c, d] of this.min) {
        _d.subVectors(p[c], p[a]);
        const l = _d.length() || 1e-6;
        if (l >= d) continue;
        _d.multiplyScalar((l - d) / l * 0.5);
        p[a].add(_d); p[c].sub(_d);
      }
      for (let i = 0; i < p.length; i++) this.collide(i, it === ITER - 1);
    }
    // settled? (the pelvis has nearly stopped)
    this.calm = _vel.subVectors(p[PEL], prev[PEL]).length() / h < 4 ? this.calm + h : 0;
  }

  // false when it's done and the runner is back on their feet
  update(dt) {
    const m = this.m;
    const st = this.stand;
    // (animate() has just posed the runner normally: that's what we get back up into)
    st.pos.copy(m.root.position);
    st.quat.copy(m.root.quaternion);
    st.bodyY = m.body.position.y;
    this.limbs.forEach((o, i) => st.q[i].copy(o.quaternion));
    this.t += dt;
    if (this.getUp < 0) {
      this.acc = Math.min(this.acc + dt, STEP * 6);
      while (this.acc >= STEP) { this.simulate(STEP); this.acc -= STEP; }
      if ((this.calm > 0.6 && this.t > 1.1) || this.t > 2.8) this.getUp = 0;
    } else this.getUp += dt / GETUP;

    // pose: fit the whole runner to the torso cage, then aim each limb at its particle
    const p = this.p;
    this.zero();
    basis(_mc, p[PEL], p[CHE], p[SHL], p[SHR]);
    _mr.multiplyMatrices(_mc, this.Brinv);
    _qr.setFromRotationMatrix(_mr);
    const qn = _qr.clone().multiply(this.Q0);
    m.root.quaternion.copy(qn);
    m.root.position.copy(this.rest[PEL]).sub(this.P0).applyQuaternion(_qr).negate().add(p[PEL]);
    _ql.copy(qn).invert();
    const aim = (obj, from, to, rest) => {
      _d.subVectors(p[to], p[from]).applyQuaternion(_ql).normalize();
      obj.quaternion.setFromUnitVectors(rest, _d);
    };
    aim(m.armL, SHL, HNL, this.dRest.armL);
    aim(m.armR, SHR, HNR, this.dRest.armR);
    aim(m.legL, HPL, FTL, this.dRest.legL);
    aim(m.legR, HPR, FTR, this.dRest.legR);
    aim(m.head, CHE, HED, this.dRest.head);

    if (this.getUp >= 0) {
      const k = Math.min(1, this.getUp);
      const s = k * k * (3 - 2 * k);
      m.root.position.lerp(st.pos, s);
      m.root.quaternion.slerp(st.quat, s);
      this.limbs.forEach((o, i) => o.quaternion.slerp(st.q[i], s));
      m.body.position.y = m.bodyBase + (st.bodyY - m.bodyBase) * s;
      if (this.getUp >= 1) return false;
    }
    return true;
  }
}

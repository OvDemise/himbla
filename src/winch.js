// The Kepler Hitch-Line Winch (Kepler's unique upgrade, an active on Z). Fire a steel cable onto a passing
// vehicle or a structure and let the drum reel you in: the pull builds up, runs at a steady speed and eases
// off to leave about two metres of cable between you and the hook. Hooked on a vehicle you then ride its pull:
// swing under a flying transit like a pendulum (momentum and all), or trail along behind a rover or a land-train.
// It holds as long as you hold Z, up to twenty seconds.
//
// Targeting: with the winch equipped, a faint tow-line marker sits on whatever Z would hook (hud: markerFor).
// Whatever the reticle is on wins (the nearest such surface); otherwise the target nearest the reticle. The hook
// bites the nearest surface of the thing, not its middle, and the cable is only as long as the gap.
//
// The cable is a cable, not a rod: it only pulls when it's taut, and when it is, the pull goes both
// ways, split by mass. A hover-car weighs a couple of you and goes where you drag it, well off the
// road; rovers (pirate rigs, patrols, allies, bosses) are a handful; a transit shuttle takes some
// hauling but still gives a few metres; freighters and land-trains barely notice, and a building (any
// structure's collider) doesn't budge at all. A traffic vehicle you've dragged off its route eases back onto
// it when you let go (traffic.js applyTug), and a rover's own driving takes it back. SAT-7 doesn't move
// at all: hook it and you go round with it.
import * as THREE from 'three';
import { upAt } from './geo.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { rayCollider } from './physics.js';
import { toon } from './toon.js';
import markUrl from './assets/towmark.png?inline';

const RANGE = 120;       // how far the cable reaches
const HOLD = 20;         // seconds before the line lets go on its own
const SEG = 20;          // cable points (for the sag when it's slack)
const REST = 2;          // metres of cable left between you and the hook when the reel has finished
const REEL_MAX = 18;     // m/s: the drum's top speed
const REEL_ACC = 6;      // m/s²: how gently the drum spools up
const REEL_DEC = 5;      // m/s²: and winds down, so it eases to a stop at REST
const PULL_ACC = 14;     // m/s²: the most the cable tugs you up to the drum's speed
const LEAD = 0.6;        // the drum never gets further than this ahead of you (so a blocked pull doesn't snap)
const PICK_EVERY = 0.1;  // seconds between targeting scans
const MIN_COS = 0.35;    // how far off the reticle a target can be (cosine of the angle)
const MIN_GAP = 4;       // too close to hook
const MIN_STRUCT_R = 2.5; // (smaller colliders are props and rocks, not structures)
const EMBED = 0.42;      // how far the claw is driven into the surface it bites
const EYE_OUT = 1.08;    // the grapple's eye, this far back from its tip along the shank (the cable ends there)
const SLOT = { gold: 0xffd23f, steel: 0x9aa3b2, dark: 0x2a2540, tracer: 0xff9f1c }; // (the Kepler orange tracer strand is in every cable)
const MAX_PIECES = Math.ceil(RANGE * 1.6) + 8; // (a metre of cable each, up to where the line snaps)

const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _look = new THREE.Vector3();
const _pt = new THREE.Vector3();
const _to = new THREE.Vector3();
const _lo = new THREE.Vector3();
const _ld = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _inv = new THREE.Matrix4();
const _ray = new THREE.Ray();
const _cols = [];
const _eye = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3(1, 1, 1);
const _z = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3();
const _hn = new THREE.Vector3();
const _nv = new THREE.Vector3();
const _nn = new THREE.Vector3();
const ZERO = new THREE.Vector3();

// what's worth hooking, and how heavy it is
function massOf(v) {
  if (v.kind === 'ship') return 16;
  if (v.kind === 'bus') return 6; // (the little transit shuttles)
  if (v.kind === 'landtrain') return 14;
  if (v.kind === 'buggy') return 5; // (the crawler buggies)
  if (v.kind === 'car') return 2.6;
  return 6;
}

// ---- aiming at a model: its real meshes (not a box round them, which for a long hull with a boom and a gantry is mostly air) ----
const _parts = new WeakMap();
const _rc = new THREE.Raycaster();
const _rinv = new THREE.Matrix4();
const _im = new THREE.Matrix4();
const _wp = new THREE.Vector3();
const _wl = new THREE.Vector3();
const _np = new THREE.Vector3();
const _lc = new THREE.Vector3();
const _wc = new THREE.Vector3();
const _bb = new THREE.Box3();
const _hits = [];
const aim = { point: new THREE.Vector3(), nrm: new THREE.Vector3(), looked: false };

// A model's solid meshes (not the shadow blob, the glow or the flames), and the height below which it's underside: the
// bottom third of its hull, so the hook goes on the body and not on whatever hangs beneath. Measured once, in its own frame.
function partsOf(root) {
  let p = _parts.get(root);
  if (p) return p;
  root.updateWorldMatrix(true, true);
  _rinv.copy(root.matrixWorld).invert();
  const list = [], hull = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.transparent || m.depthWrite === false || m.side === THREE.BackSide || m.blending === THREE.AdditiveBlending) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    list.push(o);
    if (shown(o, root)) hull.union(_bb.copy(o.geometry.boundingBox).applyMatrix4(_im.multiplyMatrices(_rinv, o.matrixWorld)));
  });
  p = { list, cutY: hull.isEmpty() ? -Infinity : hull.min.y + (hull.max.y - hull.min.y) * 0.3 };
  _parts.set(root, p);
  return p;
}

function shown(o, root) {
  for (let q = o; q; q = q.parent) { if (!q.visible) return false; if (q === root) break; }
  return true;
}

// a hit's surface normal (world), facing the side the ray came from
function hitNormal(h, dir, out) {
  if (h.face) out.copy(h.face.normal).transformDirection(h.object.matrixWorld); else out.copy(dir).negate();
  if (out.dot(dir) > 0) out.negate();
  return out.normalize();
}

// Where the sightline meets a model's surface; failing that, the spot on it nearest the reticle (snapped onto the surface).
// Fills `aim` (all in the pose last drawn, the meshes' own matrices being from the same pass) and returns it, or null.
function modelHit(root, eye, look) {
  const P = partsOf(root);
  _rinv.copy(root.matrixWorld).invert();
  _hits.length = 0;
  let near = null, nearAng = Infinity;
  for (const o of P.list) {
    if (!shown(o, root)) continue;
    const bb = o.geometry.boundingBox;
    _im.copy(o.matrixWorld).invert();
    _lo.copy(eye).applyMatrix4(_im);
    _ld.copy(look).transformDirection(_im);
    _ray.origin.copy(_lo);
    _ray.direction.copy(_ld);
    if (!bb.containsPoint(_lo) && _ray.intersectBox(bb, _hp)) {
      _wp.copy(_hp).applyMatrix4(o.matrixWorld);
      if (_wl.copy(_wp).applyMatrix4(_rinv).y >= P.cutY) _hits.push({ o, t: eye.distanceTo(_wp) });
    }
    nearestOnBox(bb, _lo, _hp);
    _wp.copy(_hp).applyMatrix4(o.matrixWorld);
    if (_wl.copy(_wp).applyMatrix4(_rinv).y < P.cutY) continue;
    _to.copy(_wp).sub(eye);
    const d = _to.length();
    const c = d > 1e-3 ? _to.dot(look) / d : 0;
    if (c > 0.2 && 1 - c < nearAng) { nearAng = 1 - c; near = o; _np.copy(_wp); }
  }
  if (_hits.length) {
    _hits.sort((a, b) => a.t - b.t);
    _rc.set(eye, look);
    _rc.far = 400;
    for (let i = 0; i < _hits.length && i < 6; i++) {
      const h = _rc.intersectObject(_hits[i].o, false)[0];
      if (!h || _wl.copy(h.point).applyMatrix4(_rinv).y < P.cutY) continue;
      aim.point.copy(h.point);
      aim.looked = true;
      hitNormal(h, look, aim.nrm);
      return aim;
    }
  }
  if (!near) return null;
  // the spot nearest the reticle: in from there toward the middle of that piece finds the surface under it
  near.geometry.boundingBox.getCenter(_lc);
  _wc.copy(_lc).applyMatrix4(near.matrixWorld);
  _dir.copy(_wc).sub(_np);
  const L = _dir.length();
  aim.looked = false;
  if (L > 1e-3) {
    _dir.divideScalar(L);
    _rc.set(_np, _dir);
    _rc.far = L + 1;
    const h = _rc.intersectObject(near, false)[0];
    if (h) { aim.point.copy(h.point); hitNormal(h, _dir, aim.nrm); return aim; }
  }
  aim.point.copy(_np);
  aim.nrm.copy(eye).sub(_np).normalize();
  return aim;
}

// the point on (or in) box b nearest to p; from inside, the nearest face
function nearestOnBox(b, p, out) {
  out.copy(p).clamp(b.min, b.max);
  if (!out.equals(p)) return out;
  const dx0 = p.x - b.min.x, dx1 = b.max.x - p.x, dy0 = p.y - b.min.y, dy1 = b.max.y - p.y, dz0 = p.z - b.min.z, dz1 = b.max.z - p.z;
  const m = Math.min(dx0, dx1, dy0, dy1, dz0, dz1);
  if (m === dx0) out.x = b.min.x; else if (m === dx1) out.x = b.max.x;
  else if (m === dy0) out.y = b.min.y; else if (m === dy1) out.y = b.max.y;
  else if (m === dz0) out.z = b.min.z; else out.z = b.max.z;
  return out;
}

// the point on a structure's surface nearest to p (colliders: sphere, box or cylinder), and the surface's normal there
function colliderPoint(c, p, out, nOut) {
  _d.copy(p).sub(c.c);
  if (c.type === 'sphere') {
    const l = _d.length() || 1;
    nOut.copy(_d).divideScalar(l);
    return out.copy(c.c).addScaledVector(_d, c.r / l);
  }
  if (c.type === 'cyl') {
    const a = c.axis;
    const h = _d.dot(a);
    const qh = Math.min(Math.max(h, c.y0), c.y1);
    _n.copy(_d).addScaledVector(a, -h); // (the radial part)
    const rad = _n.length();
    const cap = h < c.y0 || h > c.y1;
    out.copy(c.c).addScaledVector(a, qh);
    if (rad > 1e-5) out.addScaledVector(_n, (cap ? Math.min(rad, c.r) : c.r) / rad);
    if (cap) nOut.copy(a).multiplyScalar(h > c.y1 ? 1 : -1); else if (rad > 1e-5) nOut.copy(_n).divideScalar(rad); else nOut.copy(a);
    return out;
  }
  const axes = [c.ax, c.ay, c.az], h = [c.hx, c.hy, c.hz];
  const lp = [_d.dot(c.ax), _d.dot(c.ay), _d.dot(c.az)];
  let k = 0, best = -Infinity;
  for (let i = 0; i < 3; i++) { const ex = Math.abs(lp[i]) - h[i]; if (ex > best) { best = ex; k = i; } } // (the face it's nearest, or past most)
  const l = lp.map((v, i) => Math.max(-h[i], Math.min(h[i], v)));
  const sg = Math.sign(lp[k] || 1);
  if (best < 0) l[k] = sg * h[k]; // (from inside: out through that face)
  nOut.copy(axes[k]).multiplyScalar(sg);
  return out.copy(c.c).addScaledVector(c.ax, l[0]).addScaledVector(c.ay, l[1]).addScaledVector(c.az, l[2]);
}

export class Winch {
  constructor(game) {
    this.game = game;
    this.on = null; // { target, off, len, t, reel, dist }
    this.cd = 0;
    this.cand = null; // what Z would hook right now (while the winch is equipped)
    this.pickT = 0;
    this.pts = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
    this.old = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
    this.strand = null; // the cable: an instance per metre of the model's twisted strand (winch.glb), once it has loaded
    this.tracer = null;
    this.hook = new THREE.Group(); // (the grapple goes on it when winch.glb arrives)
    this.hook.visible = false;
    game.scene.add(this.hook);
    loadParts().then((P) => {
      this.hook.add(P.hook.clone());
      const mk = (geo, color) => {
        const im = new THREE.InstancedMesh(geo, toon(color), MAX_PIECES);
        im.count = 0;
        im.frustumCulled = false;
        im.visible = false;
        game.scene.add(im);
        return im;
      };
      this.strand = mk(P.strand, SLOT.steel);
      this.tracer = mk(P.tracer, SLOT.tracer);
    }).catch((e) => console.warn('winch.glb:', e));
    this.markEl = null;
    this.markTxt = '';
    this.tick = 0;
  }

  get owned() { return (this.game.upgrades.winch || 0) > 0; }

  // Everything hookable in reach: road and air traffic, crawlers, and any rover (allies, pirates,
  // patrols). Each comes back as a target with its model, velocity and a way to push on it.
  targets() {
    const g = this.game;
    const P = g.player;
    const out = [];
    const tr = g.world.traffic;
    const near = (p) => p.distanceToSquared(P.pos) < (RANGE + 25) * (RANGE + 25);
    // (a land-train's trailers are targets in their own right: each has a model and a position, and pulling on one pulls the whole train)
    const traffic = (v, t = null) => ({
      obj: t || v, mass: massOf(v), flying: !v.piece && !v.offroad && !!v.path, root: t ? t.root : v.root,
      pos: () => (t ? t.plat.pos : v.pos),
      vel: () => (t ? t.plat.vel : v.vel),
      alive: () => v.root.visible && v.state !== 'dead' && v.state !== 'wreck' && !(v.captured > 0),
      push: (J) => { v.tug ||= new THREE.Vector3(); v.tugVel ||= new THREE.Vector3(); v.tugVel.addScaledVector(J, 1 / massOf(v)); },
      shift: (d) => { v.tug ||= new THREE.Vector3(); v.tugVel ||= new THREE.Vector3(); v.tug.add(d); },
    });
    if (tr) {
      for (const v of tr.vehicles) {
        if (!v.root || !v.root.visible || v.state === 'dead') continue;
        if (near(v.pos)) out.push(traffic(v));
        if (v.trailers) for (const t of v.trailers) if (t.root && t.root.visible && near(t.plat.pos)) out.push(traffic(v, t));
      }
      for (const c of tr.crawlers || []) if (c.root && c.root.visible && near(c.pos)) out.push(traffic(c));
    }
    // rovers of every side (pirate rigs, patrols, allies, the bosses, Kade's truck): yank them around in a fight
    for (const e of g.enemies.list) {
      if (e.dead || !e.body || !(e.kind === 'rover' || e.kind === 'milrover' || e.kind === 'kade') || !near(e.body.pos)) continue;
      const m = e.kind === 'kade' ? 9 : e.bossName ? 10 : 3.5;
      out.push({
        obj: e, mass: m, flying: false, root: e.model && e.model.root,
        pos: () => e.body.pos, vel: () => e.body.vel, alive: () => !e.dead,
        push: (J) => { e.body.vel.addScaledVector(J, 1 / m); e.body.grounded = false; },
        shift: (d) => e.body.pos.add(d),
      });
    }
    // SAT-7: the derelict in its low orbit is an anchor that doesn't budge
    const S = g.secrets && g.secrets.sat;
    if (S && S.root && S.root.visible !== false && near(S.pos)) {
      out.push({ obj: { kind: 'sat7' }, mass: 1e6, flying: true, root: S.root, pos: () => S.pos, vel: () => S.vel, alive: () => true, push: () => {}, shift: () => {} });
    }
    return out;
  }

  // a structure (a collider) as a target: it never moves, and neither does the cable's end
  structure(c) {
    return { obj: { kind: 'structure' }, col: c, mass: 1e6, flying: false, root: null, pos: () => c.mid, vel: () => ZERO, alive: () => true, push: () => {}, shift: () => {} };
  }

  // A hook point on target T, and the surface's normal there, kept in the frame of what you see (its model; a structure has none and
  // keeps them as they are, the point as an offset from its middle), so the hook rides the vehicle however it bobs, banks or is dragged.
  handle(T, point, nrm, looked, dist) {
    let off, n;
    if (T.root) { _rinv.copy(T.root.matrixWorld).invert(); off = point.clone().applyMatrix4(_rinv); n = nrm.clone().transformDirection(_rinv); } // (the pose it was found in)
    else { off = point.clone().sub(T.pos()); n = nrm.clone(); }
    return { target: T, off, goal: off.clone(), nrm: n, looked, dist, len: dist, t: 0, reel: 0 };
  }

  // where a handle's hook point is now
  anchorOf(h, out) {
    const T = h.target;
    if (T.root) return T.root.localToWorld(out.copy(h.off));
    return out.copy(h.off).add(T.pos());
  }

  // which way the surface faces there now
  normalOf(h, out) {
    out.copy(h.nrm);
    if (h.target.root) out.applyQuaternion(h.target.root.getWorldQuaternion(_q));
    return out.normalize();
  }

  // What Z would hook: the nearest surface of whatever the reticle is on; failing that, whatever's closest to
  // the reticle (nearer wins a near tie). Vehicles and structures compete alike; the first of the best few that
  // you could actually see is the one (a vehicle behind a wall is out).
  pick() {
    const g = this.game;
    const P = g.player;
    const eye = g.camera.position;
    const look = g.camera.getWorldDirection(_look);
    const prev = this.cand && this.cand.target; // (what's marked now keeps a lead, so the lock doesn't flicker between two near ones)
    const best = []; // (the top four, best first)
    const offer = (T, col, looked, nrm) => {
      const dP = P.center.distanceTo(_pt);
      if (dP > RANGE || dP < MIN_GAP) return;
      _to.copy(_pt).sub(eye);
      const dE = _to.length() || 1e-6;
      const cos = _to.divideScalar(dE).dot(look);
      if (cos < MIN_COS) return;
      const sticky = prev && (col ? prev.col === col : T.obj === prev.obj) ? 0.6 : 0;
      const score = (looked ? 10 : cos * 4) - dP / RANGE + sticky;
      if (best.length >= 4 && score <= best[3].score) return;
      best.push({ T, col, looked, dP, score, point: _pt.clone(), nrm: nrm.clone() });
      best.sort((p, q) => q.score - p.score);
      if (best.length > 4) best.pop();
    };
    for (const T of this.targets()) {
      if (!T.alive()) continue;
      if (T.root) {
        const hit = modelHit(T.root, eye, look);
        if (hit) { _pt.copy(hit.point); offer(T, null, hit.looked, hit.nrm); }
      } else { _pt.copy(T.pos()); offer(T, null, false, _nv.copy(eye).sub(_pt).normalize()); }
    }
    for (const c of g.colliders.query(P.pos, RANGE + 20, _cols)) {
      if (c.platform || c.br < MIN_STRUCT_R) continue;
      if (c.mid.distanceTo(P.pos) - c.br > RANGE) continue;
      const t = rayCollider(c, eye, look, RANGE + 80);
      const looked = t < Infinity;
      if (looked) { _pt.copy(look).multiplyScalar(t).add(eye); colliderPoint(c, _pt, _wp, _nv); _nv.normalize(); } else colliderPoint(c, eye, _pt, _nv);
      offer(null, c, looked, _nv);
    }
    for (const b of best) {
      // (the line is clear of everything but the thing itself: its own solid boxes round the hull must not hide it from its own hook)
      if (!g.enemies.clearShot(eye, b.point, b.T ? b.T.obj.plat || b.T.obj : null)) continue;
      return this.handle(b.T || this.structure(b.col), b.point, b.nrm, b.looked, b.dP);
    }
    return null;
  }

  hasHand() {
    const P = this.game.player;
    return !(P.dead || P.vehicle || P.seat || P.rag) && this.game.state === 'play';
  }

  // Z pressed with the winch selected
  fire() {
    const g = this.game;
    if (this.on || this.cd > 0 || !this.hasHand()) return;
    let h = this.cand && this.cand.target.alive() ? this.cand : null; // (what the marker is on, exactly)
    if (h && this.hand(_a).distanceTo(this.anchorOf(h, _b)) > RANGE + 5) h = null;
    h = h || this.pick();
    if (!h) {
      g.hud.toast(`Hitch-Line: nothing in reach. Aim at a vehicle or a structure within ${RANGE} m.`, 1.6);
      g.audio.tone(220, 0.12, 'square', 0.06, 0.7);
      return;
    }
    const anchor = this.anchorOf(h, _b);
    const hand = this.hand(_a);
    h.len = hand.distanceTo(anchor); // (the cable is as long as the gap: taut from the start, and the drum takes it in)
    h.dist = h.len;
    this.on = h;
    this.cand = null;
    this.tick = h.len;
    for (let i = 0; i <= SEG; i++) { this.pts[i].lerpVectors(hand, anchor, i / SEG); this.old[i].copy(this.pts[i]); }
    g.fx.pop('HITCHED!', null, { color: '#ff9f1c', size: 46, life: 0.7 });
    g.audio.burst(0.12, 3000, 0.25);
    g.audio.tone(380, 0.25, 'sawtooth', 0.08, 2.2);
  }

  release(quiet = false) {
    if (!this.on) return;
    this.on = null;
    this.cd = 1.5;
    this.hook.visible = false;
    if (this.strand) this.strand.visible = this.tracer.visible = false;
    if (!quiet) this.game.audio.tone(900, 0.06, 'square', 0.06, 0.5);
  }

  hand(out) { const P = this.game.player; return out.copy(P.center).addScaledVector(P.up, 0.4); }

  // every frame (after the player has moved): the drum reels you in and the cable pulls when it's taut
  update(dt, held) {
    const g = this.game;
    const P = g.player;
    if (this.cd > 0) this.cd -= dt;
    const equipped = this.owned && g.powers && g.powers.current() === 'winch' && this.hasHand();
    if (equipped && !this.on) {
      if ((this.pickT -= dt) <= 0) {
        this.pickT = PICK_EVERY;
        const old = this.cand, nc = this.pick();
        // (the same target again: its hook point eases to the new spot rather than jumping there)
        if (nc && old && (nc.target.col ? nc.target.col === old.target.col : nc.target.obj === old.target.obj)) { nc.goal.copy(nc.off); nc.off.copy(old.off); }
        this.cand = nc;
      }
      if (this.cand) this.cand.off.lerp(this.cand.goal, 1 - Math.exp(-dt * 12));
    } else { this.cand = null; this.pickT = 0; }
    this.drawMarker(equipped);
    const o = this.on;
    if (!o) return;
    o.t += dt;
    const T = o.target;
    if (!held || o.t > HOLD || !this.hasHand() || !T.alive()) { this.release(); return; }
    const anchor = this.anchorOf(o, _b);
    const hand = this.hand(_a);
    _d.copy(hand).sub(anchor);
    let len = _d.length();
    if (len > RANGE * 1.6) { this.release(); g.hud.toast('The line snapped!', 1.5); return; }
    if (len > 1e-3) _n.copy(_d).divideScalar(len); // from the hook to you

    o.len = Math.min(o.len, Math.max(REST, len + 0.1)); // (the cable is only ever as long as the gap: a ratchet takes up any slack)
    // the drum: spools up gently, runs steady, and eases to a stop with REST metres of cable left
    const remain = o.len - REST;
    if (remain > 0.02) {
      const want = Math.min(REEL_MAX, Math.sqrt(2 * REEL_DEC * 0.6 * remain) + 0.4); // (a braking curve the drum can follow, with a slow creep at the end)
      o.reel += Math.max(-REEL_DEC * 2.5 * dt, Math.min(REEL_ACC * dt, want - o.reel)); // (it spools up slower than it winds down)
      o.len = Math.min(o.len, Math.max(REST, o.len - o.reel * dt, len - LEAD));
      // you're drawn up to the drum's speed (and held back from overshooting it), a bounded tug each frame
      const closing = -(P.vel.dot(_n) - T.vel().dot(_n));
      if (closing < o.reel) {
        const dv = Math.min(o.reel - closing, PULL_ACC * dt);
        P.vel.addScaledVector(_n, -dv);
        T.push(_a.copy(_n).multiplyScalar(dv)); // (the other end takes the reaction; a building takes none)
      } else if (closing > o.reel + 0.4) {
        P.vel.addScaledVector(_n, Math.min(closing - o.reel, PULL_ACC * dt));
      }
      // the drum's ratchet: a tick for every metre taken in
      if (this.tick - o.len > 1.5) { this.tick = o.len; g.audio.tone(170 + Math.min(o.reel, REEL_MAX) * 5, 0.03, 'square', 0.035, 1); }
    } else {
      if (o.reel > 0) { o.reel = 0; g.audio.tone(120, 0.12, 'square', 0.07, 0.6); } // the clunk as the drum locks
      // (the arrival: whatever inward speed is left is taken off in a couple of strides, so you stop short of the hook)
      const closing = -(P.vel.dot(_n) - T.vel().dot(_n));
      if (closing > 0.05 && len < REST + 1.5) P.vel.addScaledVector(_n, Math.min(closing, PULL_ACC * dt));
    }

    if (len > o.len && len > 1e-3) {
      const mP = 1, mT = T.mass;
      const share = mT / (mP + mT); // (you take almost all of the correction; it takes a little)
      // positions: back to the cable's length
      const over = len - o.len;
      P.body.pos.addScaledVector(_n, -over * share);
      T.shift(_d.copy(_n).multiplyScalar(over * (1 - share)));
      // velocities: no moving apart along the cable (the swing, the tow, the drag all come from this)
      const rel = P.vel.dot(_n) - T.vel().dot(_n);
      if (rel > 0) {
        const j = rel / (1 / mP + 1 / mT);
        P.vel.addScaledVector(_n, -j / mP);
        T.push(_d.copy(_n).multiplyScalar(j));
      }
      // a taut cable lifts you off the ground (so it can swing you)
      if (_n.dot(upAt(P.pos)) < -0.3) { P.body.grounded = false; P.body.sinceContact = 1; }
      if (o.reel === 0 && Math.random() < dt * 3) g.audio.tone(140 + Math.random() * 60, 0.08, 'sawtooth', 0.025, 1.3); // the cable creaks
    }
    o.dist = this.hand(_a).distanceTo(this.anchorOf(o, _b));
    if (o.t > HOLD - 2 && Math.floor(o.t * 4) !== Math.floor((o.t - dt) * 4)) g.audio.tone(1200, 0.05, 'square', 0.04); // (running out)
    this.drawRope(dt, this.hand(_a), this.anchorOf(o, _b), o.len, this.normalOf(o, _nn));
  }

  // A verlet cable between your hand and the hook: dead straight when taut, a stiff steel hang when it's slack.
  drawRope(dt, a, b, len, nrm = null) {
    const g = this.game;
    const pts = this.pts, old = this.old;
    const up = upAt(a, new THREE.Vector3());
    const hookEnd = b; // (the surface point the claw is driven into, along the surface's normal; the cable runs to the grapple's eye)
    const N = (nrm ? _hn.copy(nrm) : _hn.copy(a).sub(hookEnd)).normalize();
    b = _eye.copy(hookEnd).addScaledVector(N, EYE_OUT - EMBED);
    const dist = a.distanceTo(b);
    const rest = Math.max(len - (EYE_OUT - EMBED), dist) / SEG;
    const gdt = 3.5 * dt * dt;
    for (let i = 1; i < SEG; i++) {
      const p = pts[i], q = old[i];
      const vx = (p.x - q.x) * 0.9, vy = (p.y - q.y) * 0.9, vz = (p.z - q.z) * 0.9;
      q.copy(p);
      p.x += vx - up.x * gdt; p.y += vy - up.y * gdt; p.z += vz - up.z * gdt;
    }
    pts[0].copy(a); pts[SEG].copy(b);
    for (let it = 0; it < 10; it++) {
      for (let i = 0; i < SEG; i++) {
        const p = pts[i], q = pts[i + 1];
        _d.subVectors(q, p);
        const l = _d.length() || 1e-6;
        const k = (l - rest) / l;
        if (i === 0) q.addScaledVector(_d, -k);
        else if (i === SEG - 1) p.addScaledVector(_d, k);
        else { p.addScaledVector(_d, k * 0.5); q.addScaledVector(_d, -k * 0.5); }
      }
      // (the stiffness: a steel cable resists bending, so each point is eased toward the line through its neighbours)
      for (let i = 1; i < SEG; i++) pts[i].lerp(_d.addVectors(pts[i - 1], pts[i + 1]).multiplyScalar(0.5), 0.2);
      pts[0].copy(a); pts[SEG].copy(b);
    }
    this.hook.visible = true;
    this.hook.position.copy(hookEnd).addScaledVector(N, -EMBED);
    this.hook.quaternion.setFromUnitVectors(_z, N); // (the claw faces into the surface, the eye out along its normal)
    if (!this.strand) return;
    // the cable model, a metre at a time, laid along the line (each stretched to the length of its stretch of it)
    const curve = new THREE.CatmullRomCurve3(pts);
    const n = Math.min(MAX_PIECES, Math.max(1, Math.round(curve.getLength())));
    let p0 = curve.getPointAt(0, _a), p1 = _b;
    for (let i = 0; i < n; i++) {
      curve.getPointAt((i + 1) / n, p1);
      _dir.subVectors(p1, p0);
      const l = _dir.length() || 1e-6;
      _q.setFromUnitVectors(_z, _dir.divideScalar(l));
      _m.compose(p0, _q, _s.set(1, 1, l));
      this.strand.setMatrixAt(i, _m);
      this.tracer.setMatrixAt(i, _m);
      p0.copy(p1);
    }
    this.strand.count = this.tracer.count = n;
    this.strand.instanceMatrix.needsUpdate = this.tracer.instanceMatrix.needsUpdate = true;
    this.strand.visible = this.tracer.visible = true;
  }

  // The tow-line marker: a faint bracket on the HUD where Z would hook (brighter when it's what the reticle is
  // on), and, once hooked, at the hook with the cable still to reel.
  drawMarker(equipped) {
    const g = this.game;
    const h = this.on || (equipped ? this.cand : null);
    let el = this.markEl;
    if (!h || !h.target.alive()) { if (el) el.classList.add('hidden'); return; }
    if (!el) {
      el = this.markEl = document.createElement('div');
      el.id = 'towmark';
      el.innerHTML = '<i></i><span></span>'; // (the bracket is a Blender render, tinted by the CSS mask)
      el.style.setProperty('--tm', `url(${markUrl})`);
      document.getElementById('hud').appendChild(el);
    }
    this.anchorOf(h, _pt);
    const v = _to.copy(_pt).project(g.camera);
    if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) { el.classList.add('hidden'); return; }
    const W = window.innerWidth, H = window.innerHeight;
    el.classList.remove('hidden');
    el.classList.toggle('looked', !!h.looked && !this.on);
    el.classList.toggle('hooked', !!this.on);
    el.style.transform = `translate(${((v.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * H).toFixed(1)}px) translate(-50%, -50%)`;
    const m = Math.round(g.player.center.distanceTo(_pt));
    if (m !== this.markTxt) { this.markTxt = m; el.querySelector('span').textContent = `${m} m`; }
  }

  // the Z chip's line
  status() {
    if (this.on) return this.on.reel > 0 ? `REELING ${Math.round(this.on.dist)} m` : `HITCHED ${Math.ceil(HOLD - this.on.t)} s`;
    if (this.cd > 0) return `${Math.ceil(this.cd)} s`;
    const equipped = this.game.powers && this.game.powers.current() === 'winch';
    const c = equipped ? this.cand : this.hasHand() ? this.pick() : null; // (the power wheel asks for the ones not equipped)
    return c ? 'TARGET IN REACH' : 'NO TARGET';
  }
}

// winch.glb (tools/blender/build_winch.py): the grapple and a metre of cable, loaded once
let partsP = null;
function loadParts() {
  return partsP ||= import('./assets/winch.glb?inline').then(async (m) => {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(m.default);
    gltf.scene.updateMatrixWorld(true);
    const hook = gltf.scene.getObjectByName('winch_hook');
    const strand = gltf.scene.getObjectByName('winch_strand'), tracer = gltf.scene.getObjectByName('winch_tracer');
    if (!hook || !strand || !tracer) throw new Error('winch.glb is missing a part');
    hook.traverse((o) => { if (o.isMesh) o.material = toon(SLOT[o.material.name] ?? SLOT.steel); });
    const geo = (o) => o.geometry.clone().applyMatrix4(o.matrixWorld); // (in the cable's own frame: a metre along +z)
    return { hook, strand: geo(strand), tracer: geo(tracer) };
  });
}

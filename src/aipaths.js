import * as THREE from 'three';

// Dev overlay: draws where every AI is headed. Pirates, allies, base patrols and bosses get a line to
// their current steering goal (enemies.js records it in e.dbgGoal while this is on); road vehicles
// and transit craft get the route they will drive (rest of this piece plus the planned pieces);
// walkers get the rest of their walk. Toggled from the dev menu (cheats.js).

const MAX_VERTS = 40000;
const RANGE = 1800; // only AI within this distance of the camera
const PLAN_PIECES = 8;
const COLORS = {
  pirate: 0xff3b3b, ally: 0x2ee6ff, base: 0xffd23f, boss: 0xff2e88,
  road: 0xffffff, flyer: 0xc77dff, walker: 0x7dff3a,
};

export class AIPaths {
  constructor(game) {
    this.game = game;
    this.pos = new Float32Array(MAX_VERTS * 3);
    this.col = new Float32Array(MAX_VERTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    this.lines.visible = false;
    game.scene.add(this.lines);
    this.n = 0;
    this._c = new THREE.Color();
    this._u = new THREE.Vector3();
  }

  hide() { this.lines.visible = false; }

  seg(a, b, color) {
    if (this.n + 2 > MAX_VERTS) return;
    const i = this.n * 3, c = this._c.setHex(color), u = this._u;
    // (lifted a little off the ground so the line doesn't z-fight; depth test is off anyway)
    u.copy(a).normalize().multiplyScalar(0.8);
    this.pos[i] = a.x + u.x; this.pos[i + 1] = a.y + u.y; this.pos[i + 2] = a.z + u.z;
    u.copy(b).normalize().multiplyScalar(0.8);
    this.pos[i + 3] = b.x + u.x; this.pos[i + 4] = b.y + u.y; this.pos[i + 5] = b.z + u.z;
    this.col[i] = this.col[i + 3] = c.r; this.col[i + 1] = this.col[i + 4] = c.g; this.col[i + 2] = this.col[i + 5] = c.b;
    this.n += 2;
  }

  // a polyline through pts[from..] (Vector3s), optionally starting at `start`
  poly(pts, from, color, start = null) {
    let prev = start;
    for (let i = Math.max(0, from); i < pts.length; i++) {
      if (prev) this.seg(prev, pts[i], color);
      prev = pts[i];
    }
    return prev;
  }

  update() {
    const g = this.game, cam = g.camera.position;
    this.n = 0;
    // --- enemies, allies, base patrols, bosses: line to the steering goal ---
    for (const e of g.enemies.list) {
      if (e.dead || !e.dbgGoal || g.time - e.dbgT > 0.25 || !e.body) continue;
      if (e.body.pos.distanceTo(cam) > RANGE) continue;
      const color = e.boss ? COLORS.boss : e.kind === 'ally' ? COLORS.ally : e.base ? COLORS.base : COLORS.pirate;
      this.seg(e.center || e.body.pos, e.dbgGoal, color);
    }
    // --- traffic ---
    const T = g.world && g.world.traffic;
    if (T) {
      for (const v of T.roadVehicles || []) {
        if (!v.piece || !v.root.visible || v.hp <= 0 || v.pos.distanceTo(cam) > RANGE) continue;
        const cum = v.piece.path.cum;
        let i = 0;
        while (i < cum.length - 1 && cum[i] < v.s) i++;
        let at = this.poly(v.piece.path.pts, i, COLORS.road, v.pos);
        const plan = v.plan || [];
        for (let k = 0; k < plan.length && k < PLAN_PIECES; k++) at = this.poly(plan[k].path.pts, 0, COLORS.road, at);
      }
      for (const v of T.vehicles || []) {
        if (v.piece || v.offroad || !v.path || !v.root.visible || v.pos.distanceTo(cam) > RANGE * 2) continue;
        const cum = v.path.cum, pts = v.path.pts;
        let i = 0;
        while (i < cum.length - 1 && cum[i] < v.s) i++;
        if (v.dir > 0) this.poly(pts, i, COLORS.flyer, v.pos);
        else { let at = v.pos; for (let k = i - 1; k >= 0; k--) { this.seg(at, pts[k], COLORS.flyer); at = pts[k]; } }
      }
      for (const wk of T.walkers || []) {
        if (wk.done || wk.idle || !wk.loc.group || !wk.fig.root.visible) continue;
        const p = wk.fig.root.getWorldPosition(this._p ||= new THREE.Vector3());
        if (p.distanceTo(cam) > RANGE * 0.4) continue;
        let at = p.clone();
        for (let k = wk.seg + 1; k < wk.pts.length; k++) {
          const q = wk.pts[k];
          const w = wk.loc.group.localToWorld(new THREE.Vector3(q.x, q.y, q.z));
          this.seg(at, w, COLORS.walker);
          at = w;
        }
      }
    }
    const geo = this.lines.geometry;
    geo.setDrawRange(0, this.n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    this.lines.visible = this.n > 0;
  }
}

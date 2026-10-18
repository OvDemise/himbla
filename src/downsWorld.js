import * as THREE from 'three';
import { settle } from './settlements.js';
import { T, G } from './outpostModels.js';
import { downsNode, downsSlot } from './models.js';
import {
  LAP, SEGS, RAIL_IN, RAIL_OUT, DIRT, FINISH_U, FINISH_X, STAND, FAR, CLUB, ENTRIES, ARCADE, WEDGE, STALLS, STALL_ORDER, CROSSINGS, CROSS_GAP, FORECOURT, oval, lapLen,
} from './downsPlan.js';

// Chimera Downs' scenery, built from the Blender kits (tools/blender/build_downs_*.py) and a few code-made surfaces. race.js builds the racecourse itself (the live screens, the
// gate, the crowd) and calls buildDowns for everything that stands still. The layout is docs/downs-layouts.md, Layout B: The Horseshoe.
//
// The palette: Gold Gleam, Saddle Brown, Black, Money, Barn Red, Touch of Mint (a darker tint of each for shading).
export const PAL = { gold: 0xcfb352, saddle: 0xb07c57, black: 0x3b393a, money: 0x7b9a6e, barn: 0x8b4044, mint: 0xf8fff8 };
const MINT2 = 0xdfe8dd, MONEY2 = 0x5b7a52, SADDLE2 = 0x8c5f3f, BLACK2 = 0x5a5760, CONC = 0xc6d1c4, CONC2 = 0xb2bfb0;
export const FG = { gold: '#cfb352', mint: '#f8fff8' }, BG = { black: '#3b393a', money: '#5b7a52', barn: '#6a2e33' };
// width of a Kit.text sign for a given letter height (the pixel font is ~square per character)
export const tw = (str, h) => h * (0.347 * str.length + 0.667);

const _o = {};
const _M = new THREE.Matrix4(), _P = new THREE.Vector3(), _Q = new THREE.Quaternion(), _S = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
const matFor = (slot, over) => { const c = downsSlot(slot, over); return c.glow ? G(c.color) : T(c.color); };

// Bake a kit part into `k` in its current frame: at (x, y, z) turned `ry` about y, scaled (sx, sy, sz); `over` maps a slot to the colour it should wear instead.
export function bake(k, name, x = 0, y = 0, z = 0, { ry = 0, sx = 1, sy = 1, sz = 1, over } = {}) {
  _M.compose(_P.set(x, y, z), _Q.setFromAxisAngle(_Y, ry), _S.set(sx, sy, sz));
  k.baked(downsNode(name), (slot) => matFor(slot, over), _M);
}

// A flat band round the oval between radii r0 and r1 (track surface, lane lines, turf stripes).
function ovalStrip(r0, r1, y, perCurve = 48) {
  const us = [0, SEGS[0] / 2];
  for (let i = 0; i <= perCurve; i++) us.push(SEGS[0] + (SEGS[1] * i) / perCurve);
  us.push(SEGS[0] + SEGS[1] + SEGS[2] / 2);
  for (let i = 0; i <= perCurve; i++) us.push(SEGS[0] + SEGS[1] + SEGS[2] + (SEGS[3] * i) / perCurve);
  const pos = [], nor = [], idx = [];
  for (const u of us) for (const r of [r0, r1]) { oval(u, r, _o); pos.push(_o.x, y, _o.z); nor.push(0, 1, 0); }
  for (let i = 0; i < us.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// ---- the oval: the turf, the dirt, the lanes, the rails, the finish ----
function course(k) {
  // the infield mown in bands, the dirt raked in strips, one white line per lane
  k.add(ovalStrip(0, DIRT[0], 0.05), T(PAL.money), 0, 0, 0, { outline: 0 });
  for (let r = 4; r < 42; r += 8) k.add(ovalStrip(r, r + 4, 0.07), T(0x86a578), 0, 0, 0, { outline: 0 });
  k.add(ovalStrip(DIRT[0], DIRT[1], 0.08), T(PAL.saddle), 0, 0, 0, { outline: 0 });
  for (let i = 0; i < 5; i++) k.add(ovalStrip(DIRT[0] + i * 4, DIRT[0] + i * 4 + 2, 0.09, 64), T(0xa4714e), 0, 0, 0, { outline: 0 });   // (a raked strip in each lane)
  for (const r of [46.5, 50.5, 54.5, 58.5, 62.5]) k.add(ovalStrip(r - 0.08, r + 0.08, 0.1, 64), T(PAL.mint), 0, 0, 0, { outline: 0 });
  // rails: a bay every 5 m (dn_rail), inside and out, with a thin wall to hop under each
  for (const [r, h] of [[RAIL_IN, 1.0], [RAIL_OUT, 1.2]]) {
    const n = Math.round(lapLen(r) / 5);
    let prev = oval(0, r, {});
    for (let i = 1; i <= n; i++) {
      const p = oval((i / n) * LAP, r, {});
      const dx = p.x - prev.x, dz = p.z - prev.z, l = Math.hypot(dx, dz);
      if (Math.abs(dz) < 0.01 && CROSSINGS.some((cx) => Math.abs((p.x + prev.x) / 2 - cx) < CROSS_GAP / 2 + 0.5)) { prev = p; continue; }     // (a crossing: the rail leaves a gap)
      k.at(prev.x, prev.z, Math.atan2(-dz, dx));
      bake(k, 'dn_rail', 0, 0, 0, { sx: l / 5, sy: h });
      k.at();
      k.solid(0.15, h / 2, l / 2, (p.x + prev.x) / 2, (p.z + prev.z) / 2, Math.atan2(dx, dz));
      prev = p;
    }
  }
  // the crossings: planks across the dirt and a barrier post at each end of each rail's gap
  for (const cx of CROSSINGS) for (const sz of [-1, 1]) {
    const zc = sz * (DIRT[0] + DIRT[1]) / 2;
    k.box(CROSS_GAP, 0.05, DIRT[1] - DIRT[0] + 0.4, T(MINT2), cx, 0.09, zc, { outline: 0 });
    for (let i = 0; i < 4; i++) k.box(CROSS_GAP, 0.06, 0.5, T(i % 2 ? PAL.barn : PAL.mint), cx, 0.1, zc + (i - 1.5) * 4.6, { outline: 0 });
    for (const [rz, side] of [[RAIL_IN, 1], [RAIL_OUT, 1]]) for (const dx of [-1, 1]) {
      k.at(cx + dx * (CROSS_GAP / 2 + 0.4), sz * rz, dx > 0 ? Math.PI : 0);
      bake(k, 'dn_crossing');
      k.at();
      k.column(0.3, 1.5, cx + dx * (CROSS_GAP / 2 + 0.4), sz * rz);
    }
  }
  // the finish: a chequered strip across the dirt, the arch over it, the photo-finish tower on the apron
  for (let i = 0; i < 20; i++) for (let j = 0; j < 2; j++) k.box(0.9, 0.03, 0.9, T((i + j) % 2 ? PAL.black : PAL.mint), FINISH_X - 0.45 + j * 0.9, 0.08, 45.2 + i * 0.95, { outline: 0 });
  k.at(FINISH_X, 54.7, -Math.PI / 2);
  bake(k, 'dn_finish_arch');
  for (const sz of [-1, 1]) k.text('FINISH', 0, 10.1, sz * 0.85, sz > 0 ? 0 : Math.PI, tw('FINISH', 1.4), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
  for (const sx of [-1, 1]) k.solid(0.7, 5.7, 0.8, sx * 11.8, 0);
  k.solid(12.7, 0.9, 0.8, 0, 0, 0, 9.2);
  k.at();
  k.at(FINISH_X + 1, 70.2, 0);
  bake(k, 'dn_photo_tower');
  k.solid(1.5, 4.2, 1.5, 0, 0);
  k.solid(2.6, 1.4, 2.1, 0, 0, 0, 5.1);
  k.at();
  // distance poles counting down to the finish, on the inside rail, the board facing the stands' side of each straight
  for (let d = 100; d <= 600; d += 100) {
    oval(FINISH_U - d, RAIL_IN - 0.6, _o);
    k.at(_o.x, _o.z, Math.atan2(-_o.hz, _o.hx));
    bake(k, 'dn_furlong', 0, 0, 0, { over: { barn: d % 200 ? PAL.barn : PAL.mint } });
    k.text(`${d}`, 0, 2.86, 0.27, 0, tw(`${d}`, 0.5), { fg: FG.mint, bg: BG.money, back: false, off: 0.01 });
    k.at();
    k.column(0.2, 3.4, _o.x, _o.z);
  }
}

// ---- a grandstand: tiers of seats, aisles, a parapet, the suites over the top tier, the roof, the towers and the back wall. Built in the stand's own frame
// (spectators face -z, the front edge is z = 0), turned half way round for the far stand ----
function grandstand(k, S, { far = false } = {}) {
  const sign = far ? -1 : 1;
  k.at(0, sign * S.z0, far ? Math.PI : 0);
  const len = S.x1 - S.x0, hw = len / 2;
  const topY = S.tiers * S.rise;
  const seatTiers = far ? S.tiers : S.tiers - 1;           // (the main stand's top tier carries the suites)
  const towerW = far ? 7.7 : 8.7, towerD = far ? 8.7 : 9.7;
  const edges = [S.x0 + 0.8, ...S.aisles.flatMap((a) => [a - 1.2, a + 1.2]), S.x1 - 0.8];
  for (let i = 0; i < S.tiers; i++) {
    const top = (i + 1) * S.rise, z0 = i * S.depth;
    const d = !far && i === S.tiers - 1 ? S.depth + 0.6 : S.depth;     // (the top tier is deeper, under the suites)
    const zc = z0 + d / 2;
    // each step its own block, with a dark nosing along its front edge so the rake reads
    k.box(len, top, d, T(i % 2 ? CONC : CONC2), 0, 0, zc, { outline: 0.03 });
    k.box(len, 0.12, 0.16, T(PAL.black), 0, top - 0.12, z0 + 0.06, { outline: 0 });
    k.solid(hw, top / 2, d / 2, 0, zc);
    if (i < seatTiers) {
      // seats: strips of three, a run in each section between the aisles; the members' enclosure (the middle sections' upper tiers) in Barn Red
      const clip = z0 < towerD + 0.5 ? hw - towerW - 0.5 : hw;     // (the tower stands in each front corner)
      for (let e = 0; e < edges.length; e += 2) {
        const xa = Math.max(edges[e], -clip), xb = Math.min(edges[e + 1], clip);
        const n = Math.floor((xb - xa) / 2.7);
        if (n < 1) continue;
        const mid = Math.abs((xa + xb) / 2) < 30;
        const col = mid && i > S.tiers - 6 ? PAL.barn : i % 2 ? PAL.mint : PAL.money;
        const x0 = xa + ((xb - xa) - n * 2.7) / 2 + 1.35;
        for (let s = 0; s < n; s++) bake(k, 'dn_seat3', x0 + s * 2.7, top, z0 + 0.95, { over: { seat: col } });
      }
    }
  }
  // aisle stairs: half-steps down the middle of each aisle, brass handrails up both sides
  for (const ax of S.aisles) {
    for (let i = 0; i < S.tiers; i++) {
      const top = (i + 1) * S.rise;
      k.box(2.4, top - S.rise / 2, S.depth / 2, T(CONC2), ax, 0, i * S.depth + S.depth / 4, { outline: 0.015 });
      k.box(2.4, 0.06, 0.12, T(PAL.gold), ax, top - S.rise / 2 - 0.06, i * S.depth + 0.06, { outline: 0 });
    }
    for (const s of [-1, 1]) k.beam([ax + s * 1.25, 1.9, 0], [ax + s * 1.25, topY + 0.9, S.tiers * S.depth - 1], 0.05, T(PAL.gold), { outline: 0.01 });
  }
  const back = (far ? S.tiers * S.depth : (S.tiers - 1) * S.depth + 3.2) + S.wall;   // the back wall's rear face: past the suites on the main stand
  // the front parapet, its sponsor boards and a gold rail along the top
  k.box(len, 1.3, 0.35, T(MONEY2), 0, 0, -0.2, { outline: 0.04 });
  k.beam([-hw, 1.45, -0.2], [hw, 1.45, -0.2], 0.06, T(PAL.gold), { outline: 0.01 });
  const ads = far ? [['THE FAR TURN CLUB', FG.gold]]
    : [['ANTIMATTER LAB · WE BREED WINNERS', '#9bd37a'], ['LUCKY CRATER CASINO', FG.gold], ['MERIDIAN EXCHANGE', '#9bd7ff'], ['QUANTUM-LOCK SKATES', FG.gold]];
  ads.forEach(([t, c], i) => k.text(t, far ? 0 : -75 + i * 50, 0.66, -0.38, Math.PI, Math.min(far ? 60 : 44, tw(t, 1.0)), { fg: c, bg: BG.black, back: false, off: 0.02 }));
  // the back wall, bay by bay, with a way in under each aisle's end; the end walls close the sides
  const bays = Math.round(len / 19);
  const wallName = far ? 'dn_back_s' : 'dn_back';
  const wallH = far ? 14.6 : 22.4;
  for (let i = 0; i < bays; i++) bake(k, wallName, S.x0 + 9.5 + i * 19, 0, back);
  for (const ex of ENTRIES) bake(k, 'dn_entry', ex, 0, back + 0.02);
  k.solid(hw + 1, wallH / 2, 0.4, 0, back - 0.4);
  for (const sx of [-1, 1]) {
    k.box(0.8, wallH - 2, back, T(PAL.mint), sx * (hw + 0.4), 0, back / 2, { outline: 0.06 });
    k.box(0.9, 0.5, back, T(MONEY2), sx * (hw + 0.4), 2.6, back / 2, { outline: 0 });
    k.solid(0.4, (wallH - 2) / 2, back / 2, sx * (hw + 0.4), back / 2);
  }
  if (!far) for (let i = 0; i < bays; i++) bake(k, 'dn_suite', S.x0 + 9.5 + i * 19, topY, (S.tiers - 1) * S.depth);
  // the roof: a bay over each 19 m between the end towers, with its columns
  const roof = far ? 'dn_roof_bay_s' : 'dn_roof_bay';
  const rb = Math.floor((len - 2 * towerW) / 19);
  const colz = far ? 22.2 : 38.2;
  for (let i = 0; i < rb; i++) {
    const x = -((rb - 1) * 19) / 2 + i * 19;
    bake(k, roof, x, 0, 0);
    for (const e of [-1, 1]) k.column(0.5, far ? 14 : 22, x + e * 9.3, colz);
  }
  const names = far ? [] : [['CHIMERA DOWNS', 0], ['EST. YEAR ONE', -57], ['EST. YEAR ONE', 57]];
  for (const [t, x] of names) k.text(t, x, 22.1, -4.62, Math.PI, Math.min(14, tw(t, 1.1)), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
  // the end towers (one in each front corner)
  for (const sx of [-1, 1]) {
    bake(k, far ? 'dn_tower_s' : 'dn_tower', sx * (hw - towerW / 2), 0, 0);
    k.solid(towerW / 2, (far ? 14 : 26) / 2, towerD / 2, sx * (hw - towerW / 2), towerD / 2 - 0.35);
  }
  k.at();
}

// ---- the clubhouse and tote hall: behind the main stand's centre, its front toward the forecourt ----
function clubhouse(k) {
  k.at(0, CLUB.z1, 0);
  bake(k, 'dn_club');
  k.solid(30, 9.4, 11, 0, -16, 0, 0);                              // the body (the portico's counters stand clear of it)
  for (let i = 0; i < 10; i++) k.column(0.62, 9, -27 + i * 6, -0.8);
  k.solid(6, 12, 6, 0, -13, 0, 18);                                // the tower's foot, up on the roof
  k.at();
}

// ---- the apron: a timber promenade along the front of each stand, and lamps along it ----
function aprons(k) {
  for (const s of [-1, 1]) {
    const z0 = s * (RAIL_OUT + 1.2), z1 = s * (STAND.z0 - 0.4), zc = (z0 + z1) / 2;
    k.box(STAND.x1 - STAND.x0 + 12, 0.12, Math.abs(z1 - z0), T(SADDLE2), 0, 0, zc, { outline: 0 });
    for (let x = -(STAND.x1 - STAND.x0 + 12) / 2 + 4; x < (STAND.x1 - STAND.x0 + 12) / 2; x += 8) k.box(0.1, 0.13, Math.abs(z1 - z0), T(0x7a5236), x, 0, zc, { outline: 0 });
    for (let x = -100; x <= 100; x += 20) {
      if (Math.abs(x - FINISH_X) < 7) continue;
      k.at(x, s * (STAND.z0 - 3), 0);
      bake(k, 'dn_lamp');
      k.at();
      k.column(0.4, 6.5, x, s * (STAND.z0 - 3));
    }
  }
}

// ---- the arcades round the turns ----
// A wedge's origin is the middle of its inner chord; its local +z points outward along the radius. The east arcade is the west one's mirror (x negated, yaws negated).
function arcades(k) {
  for (const mir of [1, -1]) {                                       // 1 = west, -1 = east
    const at = (r, th) => [mir * (-ARCADE.cx + r * Math.cos(th * Math.PI / 180)), r * Math.sin(th * Math.PI / 180)];
    const yawOf = (th) => mir * (Math.PI / 2 - th * Math.PI / 180);
    ARCADE.runs.forEach((run, ri) => {
      for (let i = 0; i < run.n; i++) {
        const th = run.a0 + ARCADE.step * (i + 0.5);
        const [x, z] = at(WEDGE.r0, th), yaw = yawOf(th);
        k.at(x, z, yaw);
        bake(k, 'dn_arcade');
        k.solid(WEDGE.wo, 4.2, 0.4, 0, WEDGE.d - 0.35);                // the back wall
        k.column(0.4, 6.5, -WEDGE.wi + 0.55, 0.55);                    // the colonnade
        if (i % 2 === 1 && i < 10) {
          // a stall in this bay: its front toward the walk, its body against the back wall
          const slot = ri * 5 + (i - 1) / 2;
          const st = STALLS[STALL_ORDER[mir > 0 ? 0 : 1][slot]];
          const sx = x + 7.6 * Math.sin(yaw), sz = z + 7.6 * Math.cos(yaw);
          k.at(sx, sz, yaw + Math.PI);
          bake(k, `dn_stall_${st.d}`, 0, 0, 0, { over: { accent: st.accent } });
          k.text(st.name, 0, 4.65, -0.5, 0, Math.min(7.6, tw(st.name, 0.9)), { fg: FG.gold, bg: BG.black, back: false, off: 0.01 });
          k.solid(4.4, 1.9, 3.5, 0, -3.9);
          k.solid(4.5, 0.6, 0.7, 0, 0.15);
        } else {
          // an open bay: a bench against the back wall, a planter each side of it
          k.at(x, z, yaw);
          bake(k, 'dn_bench', 0, 0, WEDGE.d - 1.6, { ry: Math.PI });
          for (const px of [-3.6, 3.6]) { bake(k, 'dn_planter', px, 0, WEDGE.d - 1.7); k.solid(1.2, 0.45, 0.5, px, WEDGE.d - 1.7); }
        }
        k.at();
      }
    });
    // the gate hall, at the middle of the arcade
    const [gx, gz] = at(ARCADE.ri + 8, ARCADE.gate), gyaw = yawOf(ARCADE.gate);
    k.at(gx, gz, gyaw);
    bake(k, 'dn_gate_hall');
    const nm = mir > 0 ? 'WEST GATE' : 'EAST GATE';
    k.text(nm, 0, 9.3, 11.27, 0, tw(nm, 1.7), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
    k.text('CHIMERA DOWNS', 0, 9.3, -11.27, Math.PI, tw('CHIMERA DOWNS', 1.5), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
    for (const sx of [-1, 1]) k.solid(5, 6.6, 11, sx * 11, 0);
    k.at();
    // the rail walk: a timber ring between the rail and the arcade
    const lo = ARCADE.walk[0], hi = ARCADE.walk[1];
    const [t0, t1] = mir > 0 ? [lo, hi] : [180 - hi, 180 - lo];
    const g = new THREE.RingGeometry(RAIL_OUT + 1.5, ARCADE.ri, 96, 1, -t1 * Math.PI / 180, (t1 - t0) * Math.PI / 180).rotateX(-Math.PI / 2);
    k.add(g, T(SADDLE2), mir * -ARCADE.cx, 0.1, 0, { outline: 0 });
  }
}

// ---- the concourse behind the main stand and the grand forecourt: paving, a timber avenue, the fountain, masts with festoons, lamps, benches, planters, valet bays and the gate ----
function forecourt(k) {
  const F = FORECOURT, w = F.x1 - F.x0, zc = (F.z0 + F.z1) / 2, dz = F.z1 - F.z0;
  k.box(w, 0.12, dz, T(MINT2), 0, 0, zc, { outline: 0 });                                                              // the paving
  for (let x = F.x0 + 8; x < F.x1; x += 12) k.box(0.14, 0.13, dz, T(0xc9d4c6), x, 0, zc, { outline: 0 });
  k.box(2 * F.avenue, 0.16, F.z1 - F.promenade[0], T(SADDLE2), 0, 0, (F.promenade[0] + F.z1) / 2, { outline: 0 });       // the avenue, in timber
  for (let z = F.promenade[0] + 3; z < F.z1; z += 3) k.box(2 * F.avenue, 0.17, 0.08, T(0x7a5236), 0, 0, z, { outline: 0 });
  for (const s of [-1, 1]) k.box(0.3, 0.18, F.z1 - F.promenade[0], T(PAL.gold), s * F.avenue, 0, (F.promenade[0] + F.z1) / 2, { outline: 0 });
  k.box(w, 0.16, F.promenade[1] - F.promenade[0], T(SADDLE2), 0, 0, (F.promenade[0] + F.promenade[1]) / 2, { outline: 0 });   // the promenade along the clubhouse's front
  for (const ex of ENTRIES) k.box(8, 0.16, F.promenade[0] - 114.5, T(SADDLE2), ex, 0, (114.5 + F.promenade[0]) / 2, { outline: 0 });   // the ways from the stand's entries
  // the fountain, ringed in gold
  const [fx, fz] = F.fountain;
  k.at(fx, fz, 0);
  bake(k, 'dn_fountain');
  k.at();
  k.column(12, 1.2, fx, fz);
  k.ring(13.2, 0.12, G(PAL.gold), fx, 0.17, fz);
  // masts down both sides of the avenue, a string of lights across it at every other pair
  const cols = [PAL.barn, PAL.gold, PAL.money, PAL.mint, PAL.saddle, PAL.black];
  for (let i = 0; i < 9; i++) {
    const z = 150.5 + i * 4.5;
    for (const s of [-1, 1]) {
      k.at(s * (F.avenue + 1.2), z, 0);
      bake(k, 'dn_mast', 0, 0, 0, { over: { cloth: cols[(i + (s > 0 ? 3 : 0)) % 6] }, ry: s > 0 ? 0 : Math.PI });
      k.at();
      k.column(0.3, 10, s * (F.avenue + 1.2), z);
    }
    if (i % 2 === 0) { k.at(0, z, 0); bake(k, 'dn_festoon', 0, 10.3, 0, { sx: (2 * (F.avenue + 1.2)) / 30 }); k.at(); }
  }
  for (const s of [-1, 1]) for (let z = 154; z < 190; z += 12) {                                                   // lamps just outside the masts
    k.at(s * (F.avenue + 4.2), z, 0);
    bake(k, 'dn_lamp', 0, 0, 0, { ry: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
    k.at();
    k.column(0.4, 6.5, s * (F.avenue + 4.2), z);
  }
  // benches facing the avenue with planters between them, either side
  for (const s of [-1, 1]) for (let z = 156; z < 188; z += 10) {
    k.at(s * 26, z, 0);
    bake(k, 'dn_bench', 0, 0, 0, { ry: -s * Math.PI / 2 });
    bake(k, 'dn_planter', s * 3.5, 0, 0, { ry: s * Math.PI / 2 });
    k.at();
    k.solid(1.2, 0.45, 0.5, s * 26, z + 3.5);
  }
  // valet bays: two blocks of six, diagonal, their heads toward the sides
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
    const hx = s * (56 + 1.8 * i), hz = 152 + 2.14 * i;
    k.at(hx, hz, -s * (50 * Math.PI) / 180);
    bake(k, 'dn_bay');
    k.text(String(i + 1 + (s > 0 ? 6 : 0)), 0, 0.78, -0.37, 0, 0.36, { fg: '#3b393a', bg: '#cfb352', back: false, off: 0.01 });
    k.at();
  }
  // the gate
  k.at(0, F.gate, 0);
  bake(k, 'dn_gate_main');
  k.text('CHIMERA DOWNS', 0, 13.0, 0.56, 0, tw('CHIMERA DOWNS', 0.95), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
  k.text('EST. YEAR ONE', 0, 13.0, -0.56, Math.PI, tw('EST. YEAR ONE', 0.95), { fg: FG.gold, bg: BG.black, back: false, off: 0.0 });
  for (const s of [-1, 1]) k.solid(1.5, 6.6, 1.5, s * 12.5, 0);
  k.at();
}

// ---- flood masts round the course (dn_flood), their heads turned toward the middle of the oval ----
function floods(k) {
  for (const [x, z] of [[-74, 146], [74, 146], [-74, 188], [74, 188], [-102, -106], [102, -106], [-38, -108], [38, -108]]) {
    k.at(x, z, Math.atan2(-x, -z));
    bake(k, 'dn_flood');
    k.at();
    k.column(0.5, 14, x, z);
  }
}

export function buildDowns(w, loc) {
  return settle(w, loc, 9091, (k) => {
    course(k);
    aprons(k);
    grandstand(k, STAND);
    grandstand(k, FAR, { far: true });
    clubhouse(k);
    arcades(k);
    forecourt(k);
    floods(k);
  });
}

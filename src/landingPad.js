import * as THREE from 'three';
import { T, G } from './outpostModels.js';

// The landing pad that shuttles and freighters set down on: a round deck up on steel legs, a safety railing all the way round
// it, and one straight flight of stairs down to the ground for the people walking to and from the ships.
//
// Built in the pad's own frame: the deck's centre on (0, 0), y in the frame of whatever it stands in (a settlement's, or a
// plot's), the stairs running out along local +z from the deck's edge. One builder for every size (the shuttle's deck is
// about 14 m round, the freighter's 21) and any ground under it: `ground(x, z)` gives the height of the ground at a point
// of the pad's frame, so the legs reach down to it and the stairs end on it. traffic.js lays the pads its lines use,
// world.js the ones a settlement is built with (World.pad), hometown.js the Shuttle Pad on your town's plot.

export const PAD_H = 3;      // the deck stands this far above the highest ground under it
const DECK_T = 0.7;          // deck slab thickness
const RAIL_H = 1.15;         // the railing's height over the deck
const RAIL_IN = 0.35;        // ...and how far in from the deck's edge it stands
const STAIR_W = 2.6;         // the flight's width (between its handrails)
const RISE = 0.25, RUN = 0.34; // one step: about 36 degrees, gentle enough for physics to count the flight as ground
const STEEL = 0x55607a, DARK = 0x3a3550, DECK = 0x5b5870, TOP = 0x4a4660, YEL = 0xffd23f, CONC = 0x8a8698, LIGHT = 0xd8d4e8;

// Where everything goes, before anything is drawn (the builder, the colliders and the walkers all read it).
// r: the deck's radius. top: the deck's height (or null: PAD_H over the highest ground under it).
export function padPlan(r, ground = () => 0, top = null) {
  let hi = -Infinity;
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2, rr = i === 12 ? 0 : r;
    hi = Math.max(hi, ground(Math.cos(a) * rr, Math.sin(a) * rr));
  }
  if (top === null) top = hi + PAD_H;
  // the flight: from the deck's edge out along +z until it meets the ground (measured where it lands, twice over, for a slope)
  let footY = ground(0, r + (top / RISE) * RUN);
  let n = 1, run = RUN;
  for (let k = 0; k < 3; k++) {
    n = Math.max(2, Math.round((top - footY) / RISE));
    run = n * RUN;
    footY = ground(0, r + run);
  }
  const rise = (top - footY) / n;
  // the legs: a ring at 0.7 r (and a second at 0.35 r on a freighter's deck), each down to its own ground
  const legs = [];
  const ring = (rad, count, off) => {
    for (let i = 0; i < count; i++) {
      const a = off + (i / count) * Math.PI * 2, x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      legs.push({ x, z, y0: ground(x, z) - 1.2 });
    }
  };
  ring(r * 0.72, Math.max(6, Math.round((Math.PI * 2 * r * 0.72) / 7.5)), Math.PI / 8);
  if (r > 17) ring(r * 0.36, 6, 0);
  // the railing's posts: every ~2.4 m round the edge, leaving the gap the stairs come up into
  const rr = r - RAIL_IN, gap = (STAIR_W / 2 + 0.25) / rr; // (half the gap's angle, either side of +z)
  const nPost = Math.max(16, Math.round((Math.PI * 2 * rr) / 2.4));
  const posts = [];
  const span = Math.PI * 2 - 2 * gap;
  for (let i = 0; i <= nPost; i++) {
    const a = Math.PI / 2 + gap + (i / nPost) * span; // (+z is angle pi/2 in the x-z plane: start beside the gap, go all the way round)
    posts.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr });
  }
  return {
    r, top, hi, legs, posts,
    stairs: { w: STAIR_W, n, rise, run, z0: r, z1: r + run, footY },
    // where a walker steps onto the deck, and off the flight onto the ground (pad frame)
    deckEdge: { x: 0, y: top, z: r - 0.9 },
    foot: { x: 0, y: footY, z: r + run + 0.9 },
  };
}

// Draw the pad into a Kit (outpostModels.js), in the frame the Kit is at. color: the markings and the lamps.
export function padKit(k, plan, color = YEL) {
  const { r, top, legs, posts, stairs: S } = plan;
  const bot = top - DECK_T;
  const seg = Math.max(32, Math.round(r * 3));
  // deck: the slab, a darker landing surface, a hazard band round the edge and the markings
  k.cyl(r, r * 0.97, DECK_T, seg, T(DECK), 0, bot, 0, { outline: 0.08 });
  k.cyl(r - 0.25, r - 0.25, 0.04, seg, T(TOP), 0, top, 0, { outline: 0 });
  const bands = Math.round(seg / 2) * 2;
  for (let i = 0; i < bands; i++) {
    const g = new THREE.CylinderGeometry(r + 0.03, r * 0.97 + 0.03, 0.3, 2, 1, true, (i / bands) * Math.PI * 2, (Math.PI * 2) / bands);
    k.add(g, T(i % 2 ? DARK : YEL), 0, top - 0.17, 0, { outline: 0 });
  }
  k.ring(r * 0.72, Math.max(0.12, r * 0.022), T(color), 0, top + 0.05, 0);
  k.ring(r * 0.56, Math.max(0.08, r * 0.012), T(color), 0, top + 0.05, 0);
  // an H in the middle (the stairs' side at its foot), and a chevron on the deck pointing to the stairs
  const h = r * 0.34, bw = Math.max(0.5, r * 0.06);
  for (const s of [-1, 1]) k.box(bw, 0.05, h, T(LIGHT), s * h * 0.36, top + 0.02, 0, { outline: 0 });
  k.box(h * 0.72, 0.05, bw, T(LIGHT), 0, top + 0.02, 0, { outline: 0 });
  for (const s of [-1, 1]) k.box(0.35, 0.05, 1.6, T(YEL), s * 0.55, top + 0.02, r - 2.2, { ry: s * 0.6, outline: 0 });
  // underneath: a ring girder over the legs, the legs on footings, and knee braces up to the slab
  for (const L of legs) {
    const len = bot - L.y0;
    k.box(0.6, len, 0.6, T(STEEL), L.x, L.y0, L.z, { outline: 0.05 });
    k.box(1.5, 0.35, 1.5, T(CONC), L.x, L.y0 + 1.0, L.z, { outline: 0.04 }); // (the footing, where the leg meets the ground)
    const d = Math.hypot(L.x, L.z) || 1, tx = -L.z / d, tz = L.x / d;
    for (const s of [-1, 1]) k.beam([L.x, bot - 1.1, L.z], [L.x + tx * s * 1.3, bot - 0.05, L.z + tz * s * 1.3], 0.09, T(DARK), { outline: 0.02 });
  }
  const outer = legs.filter((L) => Math.hypot(L.x, L.z) > r * 0.5);
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i], b = outer[(i + 1) % outer.length];
    k.beam([a.x, bot - 0.2, a.z], [b.x, bot - 0.2, b.z], 0.18, T(DARK), { outline: 0.03 });
  }
  // the railing: posts, a top rail and a knee rail, and a lamp on every third post
  const pTop = top + RAIL_H;
  posts.forEach((p, i) => {
    k.cyl(0.07, 0.07, RAIL_H, 5, T(STEEL), p.x, top, p.z, { outline: 0.02 });
    if (i % 3 === 0) k.add(new THREE.SphereGeometry(0.15, 6, 4), G(color), p.x, pTop + 0.1, p.z, { outline: 0 });
    const q = posts[i + 1];
    if (!q) return;
    k.beam([p.x, pTop, p.z], [q.x, pTop, q.z], 0.06, T(YEL), { outline: 0.02, seg: 4 });
    k.beam([p.x, top + 0.55, p.z], [q.x, top + 0.55, q.z], 0.04, T(STEEL), { outline: 0, seg: 3 });
    k.box(Math.hypot(q.x - p.x, q.z - p.z), 0.12, 0.04, T(YEL), (p.x + q.x) / 2, top + 0.06, (p.z + q.z) / 2, { ry: -Math.atan2(q.z - p.z, q.x - p.x), outline: 0 }); // (the kick plate along the edge)
  });
  // the stairs: a landing plate at the top, treads between two stringers, handrails both sides, a slab at the foot
  const { w, n, rise, run, z0, footY } = S, hw = w / 2;
  k.box(w + 0.3, 0.12, 1.2, T(DECK), 0, top - 0.12, z0 - 0.3, { outline: 0.03 });
  for (let i = 0; i < n; i++) {
    const y = top - (i + 1) * rise, z = z0 + i * RUN + RUN / 2;
    k.box(w, 0.08, RUN + 0.04, T(i === n - 1 ? YEL : STEEL), 0, y - 0.04, z, { outline: 0.015 });
    k.box(w - 0.2, 0.03, 0.08, T(YEL), 0, y + 0.01, z + RUN / 2 - 0.06, { outline: 0 }); // (a nosing stripe)
  }
  const pitch = Math.atan2(top - footY, run), len = Math.hypot(top - footY, run);
  for (const s of [-1, 1]) {
    // stringer (a deep plate under the treads' ends), handrail at 0.95 m over the step line, posts at both ends and the middle
    k.add(new THREE.BoxGeometry(0.14, 0.4, len), T(DARK), s * (hw + 0.07), (top + footY) / 2 - 0.25, z0 + run / 2, { rx: pitch, outline: 0.03 });
    k.beam([s * (hw + 0.07), top + 0.95, z0 - 0.4], [s * (hw + 0.07), footY + 0.95, z0 + run + 0.2], 0.06, T(YEL), { outline: 0.02 });
    k.beam([s * (hw + 0.07), top + 0.5, z0 - 0.4], [s * (hw + 0.07), footY + 0.5, z0 + run + 0.2], 0.04, T(STEEL), { outline: 0 });
    for (const t of [0, 0.5, 1]) {
      const z = z0 - 0.4 + t * (run + 0.6), y = top + (footY - top) * Math.min(1, Math.max(0, (z - z0) / run));
      k.cyl(0.07, 0.07, 0.95, 6, T(STEEL), s * (hw + 0.07), y, z, { outline: 0.02 });
    }
  }
  k.box(w + 1.2, 0.18, 1.8, T(CONC), 0, footY - 0.08, z0 + run + 0.8, { outline: 0.04 });
  // a lamp each side of the stairs' head, so the way down reads at night
  for (const s of [-1, 1]) {
    k.cyl(0.09, 0.09, 1.6, 6, T(STEEL), s * (hw + 0.3), top, z0 - 0.75, { outline: 0.02 });
    k.ball(0.22, G(color), s * (hw + 0.3), top + 1.7, z0 - 0.75, { outline: 0 });
  }
}

// The colliders, in the pad's frame (the same specs world.col takes): the deck, the legs, the railing, the flight as a slope
// and its handrails.
export function padCols(plan) {
  const { r, top, legs, posts, stairs: S } = plan;
  // (the deck and the flight are `stick`: physics keeps a walker on them over the stairs' head; see physics.js)
  const cols = [{ type: 'cyl', x: 0, z: 0, y0: top - DECK_T, y1: top, r, stick: true }];
  for (const L of legs) cols.push({ type: 'cyl', x: L.x, z: L.z, y0: L.y0, y1: top - DECK_T, r: 0.42 });
  for (let i = 0; i + 1 < posts.length; i++) {
    const p = posts[i], q = posts[i + 1];
    cols.push({ type: 'box', x: (p.x + q.x) / 2, y: top + 0.6, z: (p.z + q.z) / 2, hx: Math.hypot(q.x - p.x, q.z - p.z) / 2 + 0.05, hy: 0.6, hz: 0.1, yaw: -Math.atan2(q.z - p.z, q.x - p.x) });
  }
  // the flight: a slab whose top face runs from the foot up to the deck (settlements.js slope(), as the skate park's ramps)
  // (its top edge meets the deck's rim exactly, so there is no lip to stub a toe on: past the rim its face would stand above the deck)
  const A = [0, S.footY - 0.3 * (S.rise / RUN), S.z1 + 0.3], B = [0, top, S.z0];
  cols.push({ ...slab(A, B, S.w + 0.2, 0.5), stick: true });
  for (const s of [-1, 1]) cols.push(slab([s * (S.w / 2 + 0.1), S.footY + 1.1, S.z1 + 0.2], [s * (S.w / 2 + 0.1), top + 1.1, S.z0 - 0.4], 0.16, 0.55));
  return cols;
}

// a box collider whose top face runs from A (x, y, z) to B, w wide and thick deep (below that face)
function slab(A, B, w, thick) {
  const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
  const run = Math.hypot(dx, dz), len = Math.hypot(run, dy);
  const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, run);
  const n = [Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch), Math.sin(pitch) * Math.cos(yaw)];
  return { type: 'box', hx: w / 2, hy: thick, hz: len / 2, yaw, pitch, x: (A[0] + B[0]) / 2 - n[0] * thick, y: (A[1] + B[1]) / 2 - n[1] * thick, z: (A[2] + B[2]) / 2 - n[2] * thick };
}

// A pad-frame point (x, z) turned by `yaw` and moved to (px, pz): where it is in the frame the pad stands in. (A three.js turn
// about y: local +z ends up along (sin yaw, cos yaw).)
export function padToFrame(px, pz, yaw, x, z) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: px + x * c + z * s, z: pz - x * s + z * c };
}

// A collider spec from the pad's frame to the frame it stands in
export function colToFrame(px, pz, yaw, c) {
  const p = padToFrame(px, pz, yaw, c.x, c.z);
  return c.type === 'box' ? { ...c, x: p.x, z: p.z, yaw: (c.yaw || 0) + yaw } : { ...c, x: p.x, z: p.z };
}

// The walkers' waypoints for a pad stood at (px, pz) turned by yaw, in the frame it stands in: `edge` on the deck at the stairs'
// head, `head` at the top step, `foot` at the bottom one, and `out` on the ground a little beyond. `face` is the way the stairs
// run out (an angle as Math.atan2(z, x)).
export function padStairs(px, pz, yaw, plan) {
  const S = plan.stairs, at = (z, y) => ({ ...padToFrame(px, pz, yaw, 0, z), y });
  return {
    edge: at(plan.r - 1.6, plan.top), head: at(S.z0 - 0.2, plan.top), foot: at(S.z1 + 0.5, S.footY), out: at(S.z1 + 2.6, S.footY),
    face: Math.PI / 2 - yaw, w: S.w, run: S.run,
  };
}

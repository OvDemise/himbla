// Dev-only: the Bounce Dome Funpark's floor plan, as it stands and as two proposed rebuilds (docs/funpark-layouts.md): where every bouncy thing, skate feature, grind rail and ride goes.
//   node tools/funpark-layouts.mjs            checks the layouts (spacing, the build circle, the lines' links) and prints a report
//   node tools/funpark-layouts.mjs docs       also writes docs/funpark-layout-{current,a,b}.svg
//   node tools/funpark-layouts.mjs json       prints the layouts as json (the page that shows them reads this)
// The frame is the funpark's own (metres, x across, z down the page): the plateau is flat out to the place's radius (180 m), the build circle for new work is 150 m.
// Every element is a convex footprint on the ground (a rectangle or a circle) with a height, and, for the things you ride, ports: where a line enters it (`in`) and leaves it (`out`, with a heading).
// A *line* is a chain of elements you can really ride in one go: each *link* names the two elements and how it is made (a launch off a kicker, a bounce, a rail you pop off) with the gap it needs
// between the exit and the entry: a kicker throws 6-24 m by its size, a bounce lands within a radius, a rail you pop off carries on along its line and lands 3-14 m on.
import { writeFileSync } from 'node:fs';

export const BUILD_R = 150, GAP = 3, RIDE_GAP = 6;

// ---- footprints ----
const rectPoly = (cx, cz, w, d, yaw) => {
  const c = Math.cos(yaw), s = Math.sin(yaw), P = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  return P.map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);          // (yaw 0: local +z is +z; yaw pi/2: local +z is +x)
};
const circPoly = (cx, cz, r, n = 28) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cz + r * Math.sin((i / n) * 2 * Math.PI)]);
const toWorld = (cx, cz, yaw, lx, lz) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [cx + lx * c + lz * s, cz - lx * s + lz * c]; };

// ---- the kinds of element (sizes in metres: the footprint, the height, what the kit builds) ----
// kind: bounce (inflatable or springy: a bouncy collider), skate (ramps and bowls), grind (a rail on posts or a ledge), ride, service
const K = {
  // bouncy
  pad:    { kind: 'bounce', w: 9, d: 9, h: 1.3, label: 'Pillow pad', omni: true, land: 4.5 },
  bed:    { kind: 'bounce', w: 6.4, d: 6.4, h: 0.9, label: 'Trampoline bed', omni: true, land: 3.2 },
  mush:   { kind: 'bounce', r: 5.8, h: 6.5, label: 'Mushroom', omni: true, land: 5.8 },
  humps:  { kind: 'bounce', w: 8, d: 26, h: 2.6, label: 'Hump line', inz: -13, outz: 13 },
  donut:  { kind: 'bounce', r: 9.2, h: 4.4, label: 'Donut ring', omni: true, land: 9 },
  jarch:  { kind: 'bounce', w: 15, d: 5, h: 6, label: 'Jelly arch', rail: 'crest', inz: -2.5, outz: 2.5 },
  castle: { kind: 'bounce', w: 29, d: 29, h: 14, label: 'Bouncy castle', omni: true, land: 14, rails: 'battlements' },
  // skate
  kickS:  { kind: 'skate', w: 5, d: 6, h: 1.4, label: 'Small kicker', inz: -3, outz: 3, reach: [6, 14] },
  kickM:  { kind: 'skate', w: 6, d: 9, h: 2.8, label: 'Medium kicker', inz: -4.5, outz: 4.5, reach: [9, 18] },
  kickL:  { kind: 'skate', w: 7, d: 14, h: 5, label: 'Big launch', inz: -7, outz: 7, reach: [14, 26] },
  bowl:   { kind: 'skate', r: 26, h: 4.2, label: 'Volcano bowl', omni: true, land: 12, rails: 'lip loop' },
  pipe:   { kind: 'skate', w: 46, d: 40, h: 9, label: 'Half-pipe', omni: true, land: 14, rails: 'coping' },
  funbox: { kind: 'skate', w: 21, d: 21, h: 2.6, label: 'Pyramid funbox', omni: true, land: 7, rails: 'ledge' },
  // grind
  flat:   { kind: 'grind', w: 1.4, d: 12, h: 0.9, label: 'Flat bar', inz: -6, outz: 6 },
  ledge:  { kind: 'grind', w: 1.8, d: 14, h: 0.8, label: 'Hubba ledge', inz: -7, outz: 7 },
  kink:   { kind: 'grind', w: 3.2, d: 10, h: 2.6, label: 'Kink rail (stairs)', inz: -5, outz: 5 },
  snake:  { kind: 'grind', w: 6, d: 34, h: 1.0, label: 'S-bend rail', inz: -17, outz: 17 },
  rainbow:{ kind: 'grind', w: 2.2, d: 16, h: 3.2, label: 'Rainbow rail', inz: -8, outz: 8 },
  // rides and service
  wheel:  { kind: 'ride', w: 48, d: 10, h: 50, label: 'Ferris wheel (platform and plane)' },
  carou:  { kind: 'ride', r: 10.5, h: 11, label: 'Carousel' },
  kiosk:  { kind: 'service', w: 4, d: 3, h: 3, label: 'Ticket kiosk' },
};
const shape = (type, x, z, yaw = 0) => {
  const t = K[type];
  return t.r ? circPoly(x, z, t.r) : rectPoly(x, z, t.w, t.d, yaw);
};
// an element placed: type, where, which way it faces (the yaw of its local +z), and an id
const E = (id, type, x, z, yaw = 0, extra = {}) => {
  const t = K[type];
  const e = { id, type, kind: t.kind, label: t.label, x, z, yaw, h: t.h, poly: shape(type, x, z, yaw), ...extra };
  if (t.inz !== undefined) e.inP = toWorld(x, z, yaw, 0, t.inz);
  if (t.outz !== undefined) e.outP = toWorld(x, z, yaw, 0, t.outz);
  if (t.omni) { e.inP = [x, z]; e.outP = [x, z]; e.omni = true; e.land = t.land; }
  if (t.reach) e.reach = t.reach;
  return e;
};
const head = (e) => [Math.sin(e.yaw), Math.cos(e.yaw)];

// ---- today's park ----
const current = () => {
  const items = [
    E('Dome', 'donut', 0, 0), E('Dome 2', 'donut', -50, 30), E('Dome 3', 'donut', 20, -60), E('Dome 4', 'donut', -40, -50), E('Dome 5', 'donut', -80, -10),
    E('Castle', 'castle', 0, 70), E('Wheel', 'wheel', -40, 62), E('Carousel', 'carou', -58, -22),
    E('Bowl', 'bowl', 148, -4), E('Pipe', 'pipe', 129, 53), E('Funbox', 'funbox', 100, -32),
    E('Kicker', 'kickS', 120, -52, Math.PI / 2), E('Kicker 2', 'kickM', 134, -52, Math.PI / 2), E('Launch', 'kickL', 151, -52, Math.PI / 2),
  ];
  for (let i = 0; i < 4; i++) items.push(E('Trampoline ' + (i + 1), 'bed', -34 + i * 8, -73 + (i % 2) * 4));
  items[0].poly = circPoly(0, 0, 26); items[1].poly = circPoly(-50, 30, 18); items[2].poly = circPoly(20, -60, 20); items[3].poly = circPoly(-40, -50, 14); items[4].poly = circPoly(-80, -10, 12);
  items.forEach((e, i) => { if (i < 5) e.label = 'Bounce dome'; });
  return { name: 'Today', items, links: [], lines: [], notes: ['Five domes of one shape, a castle and a row of trampolines stand apart, 40-60 m between groups: nothing chains.', 'The skate park is a separate block on the east side, 100 m from the nearest inflatable.', 'Nothing in it grinds.'] };
};

// ---- paths: a ring or a street that elements are strung along (by arc length), with side pieces off it ----
// Path.at(s) gives the point and heading; `put` places an element at arc length s with a lateral offset (positive: to the path's left, toward a ring's middle) and a turn from the heading.
const ringPath = (R, deg0 = -90) => {
  const len = 2 * Math.PI * R, a0 = (deg0 * Math.PI) / 180;
  return { len, at: (s) => { const a = a0 + s / R; return { x: R * Math.cos(a), z: R * Math.sin(a), tx: -Math.sin(a), tz: Math.cos(a) }; } };
};
const polyPath = (S) => {
  const seg = []; let tot = 0;
  for (let i = 0; i < S.length - 1; i++) { const l = Math.hypot(S[i + 1][0] - S[i][0], S[i + 1][1] - S[i][1]); seg.push([tot, l]); tot += l; }
  return { len: tot, at: (s) => { let i = 0; while (i < seg.length - 1 && s > seg[i][0] + seg[i][1]) i++; const f = (s - seg[i][0]) / seg[i][1], [a, b] = [S[i], S[i + 1]], l = seg[i][1]; return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l }; } };
};
const builder = (path, items) => ({
  // an element at arc length s, `off` to the left of the path (a ring: toward its middle), turned `rot` from the heading
  put(id, type, s, off = 0, rot = 0, extra = {}) {
    const p = path.at(s), nx = -p.tz, nz = p.tx, yaw = Math.atan2(p.tx, p.tz) + rot;
    const e = E(id, type, p.x + nx * off, p.z + nz * off, yaw, extra); items.push(e); return e;
  },
  // a run of elements one after another along the path, each `gap` m of ground after the last (along the heading; its extent along the heading is its depth, or its width if turned a quarter)
  run(s, list) {
    const out = [];
    for (const [id, type, gap, off = 0, rot = 0] of list) {
      const t = K[type], ext = t.r ? 2 * t.r : (rot ? t.w : t.d);
      s += gap; out.push(this.put(id, type, s + ext / 2, off, rot)); s += ext;
    }
    out.end = s; return out;
  },
});
const link = (links) => (a, b, how, lo, hi, tol = 90) => links.push({ a: a.id, b: b.id, how, lo, hi, tol });

// ---- LAYOUT A: THE LOOP: a ring of one continuous line round a hub of rides ----
const layoutA = () => {
  const items = [], links = [], lines = [], L = link(links), R = 82, ring = ringPath(R, -100), B = builder(ring, items);
  // the hub: the rides with their queue room, the ticket kiosk
  items.push(E('Wheel', 'wheel', -2, -4, 0), E('Carousel', 'carou', 41, 2), E('Kiosk', 'kiosk', 6, 22, 0));
  // 1. the warm-up on the north-west: small things a stride apart
  const w = B.run(0, [['Kicker S', 'kickS', 0], ['Pad 1', 'pad', 8], ['Mushroom 1', 'mush', 6], ['Hump line', 'humps', 6], ['Flat bar', 'flat', 4], ['Bed 1', 'bed', 5], ['Bed 2', 'bed', 5]]);
  // 2. off the end by a radial launch into the volcano bowl on the outside, which sits against the ring
  const s2 = w.end + 12;
  const kl = B.put('Big launch', 'kickL', s2, 0, Math.PI / 2);   // (turned a quarter to the left of the heading: outward, on a ring whose heading has its middle on the left)
  const bowl = B.put('Volcano bowl', 'bowl', s2 + 4, -40);
  const fb = B.put('Funbox', 'funbox', s2 + 64, 0);
  const t2 = B.run(s2 + 84, [['Hubba ledge', 'ledge', 0], ['S-bend rail', 'snake', 6]]);
  // 3. the half-pipe outside the ring on the south, a kink rail, the castle on the west with a launch into it, then a donut and the jelly arch
  const pipe = B.put('Half-pipe', 'pipe', t2.end + 26, -42, Math.PI / 2);
  const kk = B.run(t2.end + 8, [['Kink rail', 'kink', 0], ['Kicker M', 'kickM', 8]]);
  const castle = B.put('Bouncy castle', 'castle', kk.end + 36, -40);
  const t3 = B.run(kk.end + 12, [['Donut', 'donut', 0], ['Jelly arch', 'jarch', 8, 0, Math.PI / 2], ['Mushroom 2', 'mush', 8], ['Kicker S 2', 'kickS', 8], ['Pad 2', 'pad', 8], ['Rainbow rail', 'rainbow', 10], ['Pad 3', 'pad', 8], ['Bed 3', 'bed', 6], ['Bed 4', 'bed', 5], ['Mushroom 3', 'mush', 6], ['Flat bar 2', 'flat', 7]]);
  void [kl, bowl, fb, pipe, castle, t3];
  const A = (id) => items.find((e) => e.id === id);
  L(A('Kicker S'), A('Pad 1'), 'launch', 6, 22, 40); L(A('Pad 1'), A('Mushroom 1'), 'bounce', 4, 26); L(A('Mushroom 1'), A('Hump line'), 'bounce', 4, 30); L(A('Hump line'), A('Flat bar'), 'carry', 3, 22, 50);
  L(A('Flat bar'), A('Bed 1'), 'pop', 3, 14, 50); L(A('Bed 1'), A('Bed 2'), 'bounce', 3, 14); L(A('Bed 2'), A('Big launch'), 'bounce', 6, 30); L(A('Big launch'), A('Volcano bowl'), 'launch', 14, 40, 40);
  L(A('Hubba ledge'), A('S-bend rail'), 'pop', 3, 14, 40); L(A('Kink rail'), A('Kicker M'), 'carry', 3, 22, 50);
  L(A('Donut'), A('Jelly arch'), 'bounce', 3, 28); L(A('Jelly arch'), A('Mushroom 2'), 'pop', 3, 26, 50); L(A('Mushroom 2'), A('Kicker S 2'), 'bounce', 4, 28); L(A('Kicker S 2'), A('Pad 2'), 'launch', 6, 22, 40); L(A('Rainbow rail'), A('Pad 3'), 'pop', 3, 14, 40); L(A('Pad 3'), A('Bed 3'), 'bounce', 3, 16); L(A('Bed 3'), A('Bed 4'), 'bounce', 3, 14); L(A('Bed 4'), A('Mushroom 3'), 'bounce', 3, 18); L(A('Mushroom 3'), A('Flat bar 2'), 'bounce', 3, 20);
  lines.push({ name: 'The ring', ids: [...w.map((e) => e.id), 'Big launch', 'Hubba ledge', 'S-bend rail', 'Kink rail', 'Kicker M', 'Donut', 'Jelly arch', 'Mushroom 2', 'Kicker S 2', 'Pad 2', 'Rainbow rail', 'Pad 3', 'Bed 3', 'Bed 4', 'Mushroom 3', 'Flat bar 2'], loop: true });
  return {
    name: 'A: The Loop', items, links, lines, ring: R,
    notes: [
      'One continuous circuit (a ring of R 82 m), ridden either way, round a hub of rides; the big features stand just outside the ring and are reached by a launch off it.',
      'Each step is 4-30 m from the last: a small kicker into a pad, a pad into a mushroom, the mushroom into the hump line, off its end onto a flat bar, off the bar onto two beds, then the big launch out over the gap into the bowl.',
      'Grinds: a flat bar, a hubba ledge, an S-bend rail, a kink down stairs, the volcano lip (a loop), the half-pipe copings, the funbox ledge, the castle battlements and the jelly arch crest.',
      'The wheel, carousel and kiosk stand in the middle, 30 m or more clear of the ring, so walkers and riders do not cross.',
    ],
  };
};

// ---- LAYOUT B: THE SPINE: one long S-curved street from the gate to the far end, a gradient from soft to hard, the rides along its flanks ----
const layoutB = () => {
  const items = [], links = [], lines = [], L = link(links);
  const S = [[120, -70], [60, -95], [0, -90], [-60, -70], [-105, -30], [-115, 25], [-95, 75], [-50, 100], [10, 100], [70, 84], [112, 44]];
  const sp = polyPath(S), B = builder(sp, items);
  // 1. the gate end: soft and small, with the kiosk and the carousel at the gate
  items.push(E('Kiosk', 'kiosk', 112, -52, 0));
  const a = B.run(14, [['Bed 1', 'bed', 0], ['Bed 2', 'bed', 6], ['Bed 3', 'bed', 6], ['Hump line', 'humps', 8], ['Flat bar', 'flat', 5], ['Pad 1', 'pad', 6]]);
  B.put('Carousel', 'carou', 40, -40);
  // 2. the middle: mushrooms and the donut, the jelly arch, the funbox with its ledge; the wheel across from the castle
  const b = B.run(a.end + 6, [['Mushroom 1', 'mush', 0], ['Donut', 'donut', 6], ['Jelly arch', 'jarch', 8, 0, Math.PI / 2], ['Funbox', 'funbox', 8], ['Hubba ledge', 'ledge', 8]]);
  B.put('Wheel', 'wheel', 156, 52, Math.PI / 2);
  B.put('Bouncy castle', 'castle', 205, -52);
  // 3. the big end: the kink, a kicker, the S-bend, the big launch and the volcano bowl at the end of the line; the half-pipe off to the side
  const c = B.run(b.end + 8, [['Kink rail', 'kink', 0], ['Kicker M', 'kickM', 6], ['S-bend rail', 'snake', 16], ['Big launch', 'kickL', 12]]);
  const bowl = B.put('Volcano bowl', 'bowl', c.end + 34, 0);
  B.put('Half-pipe', 'pipe', c.end + 34 + 26 + 10 + 23, 0, Math.PI / 2);
  B.put('Mushroom 2', 'mush', c.end - 70, -26);
  const d = B.run(c.end + 34 + 26 + 10 + 46 + 8, [['Kicker S', 'kickS', 0], ['Pad 2', 'pad', 8], ['Rainbow rail', 'rainbow', 8], ['Bed 4', 'bed', 8]]);   // (the cool-down, back toward the gate)
  const A = (id) => items.find((e) => e.id === id);
  L(A('Bed 1'), A('Bed 2'), 'bounce', 3, 16); L(A('Bed 2'), A('Bed 3'), 'bounce', 3, 16); L(A('Bed 3'), A('Hump line'), 'bounce', 3, 30); L(A('Hump line'), A('Flat bar'), 'carry', 3, 24, 50); L(A('Flat bar'), A('Pad 1'), 'pop', 3, 22, 60);
  L(A('Pad 1'), A('Mushroom 1'), 'bounce', 3, 30); L(A('Mushroom 1'), A('Donut'), 'bounce', 3, 34); L(A('Donut'), A('Jelly arch'), 'bounce', 3, 30); L(A('Jelly arch'), A('Funbox'), 'pop', 3, 30, 70); L(A('Funbox'), A('Hubba ledge'), 'ride', 3, 28);
  L(A('Hubba ledge'), A('Kink rail'), 'pop', 3, 30, 70); L(A('Kink rail'), A('Kicker M'), 'carry', 3, 22, 50); L(A('Kicker M'), A('S-bend rail'), 'launch', 9, 40, 40); L(A('S-bend rail'), A('Big launch'), 'pop', 3, 24, 50);
  L(A('Big launch'), A('Volcano bowl'), 'launch', 14, 70, 40); L(A('Volcano bowl'), A('Half-pipe'), 'drop', 3, 40); L(A('Kicker S'), A('Pad 2'), 'launch', 6, 22, 40); L(A('Rainbow rail'), A('Bed 4'), 'pop', 3, 16, 50);
  void [bowl, d];
  lines.push({ name: 'The spine', ids: ['Bed 1', 'Bed 2', 'Bed 3', 'Hump line', 'Flat bar', 'Pad 1', 'Mushroom 1', 'Donut', 'Jelly arch', 'Funbox', 'Hubba ledge', 'Kink rail', 'Kicker M', 'S-bend rail', 'Big launch', 'Volcano bowl', 'Half-pipe', 'Kicker S', 'Pad 2', 'Rainbow rail', 'Bed 4'], loop: false });
  return {
    name: 'B: The Spine', items, links, lines, spine: S,
    notes: [
      'One long street from the gate to the far end, bending twice: a gradient from soft and small (beds, pads, humps) to hard and big (the half-pipe and the volcano bowl at the end).',
      'The rides stand on the flanks (the carousel at the gate, the wheel mid-way), the castle off the street opposite; a side line (a mushroom into the half-pipe) branches off near the end.',
      'Grinds: a flat bar, a hubba ledge, an S-bend rail, a kink down stairs, the jelly arch crest, the funbox ledge, the castle battlements, the half-pipe copings and the bowl lip loop.',
    ],
  };
};

// ---- geometry for the checks ----
const segDist = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0; return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t); };
const inPoly = (p, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > p[1]) !== (P[j][1] > p[1]) && p[0] < ((P[j][0] - P[i][0]) * (p[1] - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
const polyGap = (A, B) => {                                              // distance between convex footprints, negative when they overlap
  if (A.some((p) => inPoly(p, B)) || B.some((p) => inPoly(p, A))) return -1;
  let d = Infinity;
  for (const [P, Q] of [[A, B], [B, A]]) for (const p of P) for (let i = 0; i < Q.length; i++) d = Math.min(d, segDist(p, Q[i], Q[(i + 1) % Q.length]));
  return d;
};
export function check(L) {
  const issues = [], byId = new Map(L.items.map((e) => [e.id, e]));
  for (const e of L.items) { const far = Math.max(...e.poly.map(([x, z]) => Math.hypot(x, z))); if (far > BUILD_R + 1e-6) issues.push(`${e.id}: reaches ${far.toFixed(0)} m (the build circle is ${BUILD_R})`); }
  let tight = Infinity, tightPair = '';
  for (let i = 0; i < L.items.length; i++) for (let j = i + 1; j < L.items.length; j++) {
    const a = L.items[i], b = L.items[j];
    if (a.grp && a.grp === b.grp) continue;
    const g = polyGap(a.poly, b.poly), need = a.kind === 'ride' || b.kind === 'ride' ? RIDE_GAP : GAP;
    if (g < need) issues.push(`${a.id} / ${b.id}: ${g < 0 ? 'overlap' : g.toFixed(1) + ' m'} (needs ${need})`);
    else if (g < tight) { tight = g; tightPair = `${a.id} / ${b.id}`; }
  }
  const lens = [];
  for (const k of L.links) {
    const a = byId.get(k.a), b = byId.get(k.b);
    if (!a || !b) { issues.push(`link ${k.a} -> ${k.b}: unknown element`); continue; }
    const from = a.outP, to = b.inP, d = Math.hypot(to[0] - from[0], to[1] - from[1]);
    // (an element you land on is entered anywhere on it: measure to its edge by its landing radius)
    const eff = b.omni ? Math.max(0, d - (b.land || 0)) : d;
    const effFrom = a.omni ? Math.max(0, eff - (a.land || 0) * 0.5) : eff;
    let ok = effFrom >= k.lo - 1e-6 && effFrom <= k.hi + 1e-6;
    let ang = 0;
    if (!a.omni && k.how !== 'bounce') { const h = head(a), v = [(to[0] - from[0]) / (d || 1), (to[1] - from[1]) / (d || 1)]; ang = (Math.acos(Math.max(-1, Math.min(1, h[0] * v[0] + h[1] * v[1]))) * 180) / Math.PI; if (k.how === 'launch' && ang > k.tol) ok = false; }
    if (a.reach && k.how === 'launch' && (effFrom < a.reach[0] - 3 || effFrom > a.reach[1] + 6)) ok = false;
    lens.push(`${k.a} -> ${k.b} (${k.how}) ${effFrom.toFixed(0)} m${ang ? ', ' + ang.toFixed(0) + ' deg off' : ''}${ok ? '' : '  <-- OUT OF RANGE'}`);
    if (!ok) issues.push(`link ${k.a} -> ${k.b} (${k.how}): ${effFrom.toFixed(0)} m${ang ? ', ' + ang.toFixed(0) + ' deg off its heading' : ''}, wants ${k.lo}-${k.hi} m`);
  }
  return { issues, tight: tight === Infinity ? null : `${tightPair} ${tight.toFixed(1)} m`, links: lens };
}

// ---- drawing ----
const PXM = 3.2, R = 190, OX = R, OZ = R;
const px = (x) => ((x + OX) * PXM).toFixed(1), pz = (z) => ((z + OZ) * PXM).toFixed(1);
const FILL = { bounce: '#ff2e88', skate: '#2ee6ff', grind: '#ffd23f', ride: '#c77dff', service: '#7dff6a' };
export function svg(L) {
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${2 * R * PXM} ${2 * R * PXM}" font-family="ui-monospace,Menlo,monospace">`, '<rect width="100%" height="100%" fill="#241d3a"/>'];
  for (let g = -180; g <= 180; g += 30) o.push(`<line x1="${px(g)}" y1="0" x2="${px(g)}" y2="${2 * R * PXM}" stroke="#352c52" stroke-width="${g === 0 ? 1.4 : 0.6}"/><line x1="0" y1="${pz(g)}" x2="${2 * R * PXM}" y2="${pz(g)}" stroke="#352c52" stroke-width="${g === 0 ? 1.4 : 0.6}"/>`);
  o.push(`<circle cx="${px(0)}" cy="${pz(0)}" r="${180 * PXM}" fill="#2c2446" stroke="#5a4a88" stroke-width="1.5"/><circle cx="${px(0)}" cy="${pz(0)}" r="${BUILD_R * PXM}" fill="none" stroke="#7a68b0" stroke-width="1" stroke-dasharray="6 5"/>`);
  if (L.spine) o.push(`<polyline points="${L.spine.map(([x, z]) => `${px(x)},${pz(z)}`).join(' ')}" fill="none" stroke="#fff4e0" stroke-opacity="0.18" stroke-width="${16 * PXM}" stroke-linejoin="round" stroke-linecap="round"/>`);
  for (const ln of L.lines) {
    const pts = ln.ids.map((id) => L.items.find((e) => e.id === id)).filter(Boolean).map((e) => `${px(e.x)},${pz(e.z)}`);
    if (pts.length > 1) o.push(`<polyline points="${pts.join(' ')}${ln.loop ? ' ' + pts[0] : ''}" fill="none" stroke="#fff4e0" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="7 6"/>`);
  }
  for (const e of L.items) {
    o.push(`<polygon points="${e.poly.map(([x, z]) => `${px(x)},${pz(z)}`).join(' ')}" fill="${FILL[e.kind]}" fill-opacity="0.62" stroke="#120a1e" stroke-width="1.2"/>`);
    if (e.kind === 'grind') o.push(`<line x1="${px(e.inP[0])}" y1="${pz(e.inP[1])}" x2="${px(e.outP[0])}" y2="${pz(e.outP[1])}" stroke="#fff4e0" stroke-width="3" stroke-linecap="round"/>`);
    else if (e.outP && !e.omni) o.push(`<line x1="${px(e.x)}" y1="${pz(e.z)}" x2="${px(e.outP[0])}" y2="${pz(e.outP[1])}" stroke="#120a1e" stroke-width="1.6"/><circle cx="${px(e.outP[0])}" cy="${pz(e.outP[1])}" r="3" fill="#120a1e"/>`);
  }
  for (const e of L.items) o.push(`<text x="${px(e.x)}" y="${(+pz(e.z) - 5 * PXM * 0.18).toFixed(1)}" fill="#f3efff" font-size="11" text-anchor="middle" paint-order="stroke" stroke="#120a1e" stroke-width="3">${e.id}</text>`);
  o.push('</svg>');
  return o.join('\n');
}

const all = () => ({ current: current(), a: layoutA(), b: layoutB() });
if (import.meta.url === `file://${process.argv[1]}`) {
  const Ls = all(), mode = process.argv[2];
  if (mode === 'docs') for (const k of ['current', 'a', 'b']) writeFileSync(new URL(`../docs/funpark-layout-${k}.svg`, import.meta.url), svg(Ls[k]));
  if (mode === 'json') console.log(JSON.stringify(Ls));
  if (mode === 'md') for (const k of ['a', 'b']) { console.log(`\n### ${Ls[k].name}\n\n| Element | Kind | Where (x, z) | Footprint |\n|---|---|---|---|`); for (const e of Ls[k].items) console.log(`| ${e.id} | ${e.label} | ${e.x.toFixed(0)}, ${e.z.toFixed(0)} | ${K[e.type].r ? 'r ' + K[e.type].r : K[e.type].w + ' x ' + K[e.type].d} m, ${e.h} m tall |`); }
  let bad = false;
  for (const k of ['current', 'a', 'b']) {
    const L = Ls[k], r = check(L), count = (kind) => L.items.filter((e) => e.kind === kind).length;
    console.log(`\n${L.name}: ${L.items.length} elements (${count('bounce')} bouncy, ${count('skate')} skate, ${count('grind')} grind, ${count('ride')} rides)`);
    if (k !== 'current') { for (const l of r.links) console.log('  ' + l); console.log(r.issues.length ? r.issues.map((i) => '  PROBLEM  ' + i).join('\n') : '  clear: every check holds'); console.log('  tightest:', r.tight); if (r.issues.length) bad = true; }
  }
  process.exitCode = bad ? 1 : 0;
}

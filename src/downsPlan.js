// Chimera Downs' plan: the numbers of the racecourse and its grounds (no three.js, so tools/downs-layouts.mjs can read them), in the location's own frame: metres, +x along the
// straights, +z toward the main grandstand (the home straight is at z = +r). docs/downs-layouts.md has the layout these follow (Layout B, The Horseshoe).

// ---- the oval: two 180 m straights joined by half circles of radius 55 (the centre line), four lanes, rails at 45 and 64.4 ----
export const STRAIGHT = 180, HALF = STRAIGHT / 2, R0 = 55;
export const SEGS = [STRAIGHT, Math.PI * R0, STRAIGHT, Math.PI * R0];
export const LAP = SEGS[0] + SEGS[1] + SEGS[2] + SEGS[3]; // ~706 m round the centre line
export const LANES = [48.5, 52.5, 56.5, 60.5];
export const RAIL_IN = 45, RAIL_OUT = 64.4;
export const DIRT = [44.6, 64.8];                         // the dirt band's inner and outer radius
export const FINISH_U = 135;                              // finish line: x = +45 on the home straight (in front of the grandstand)
export const FINISH_X = 45;

// The plateau (locations.js `r`): the plan's farthest solid is 257 m out.
export const LOC_R = 280;

// Where centre-line distance u (wrapped) puts you on the oval at offset r from the centre line, plus the heading.
export function oval(u, r, out = {}) {
  u = ((u % LAP) + LAP) % LAP;
  if (u < SEGS[0]) {
    out.x = -HALF + u; out.z = r; out.hx = 1; out.hz = 0;
  } else if ((u -= SEGS[0]) < SEGS[1]) {
    const a = Math.PI / 2 - Math.PI * (u / SEGS[1]);
    out.x = HALF + r * Math.cos(a); out.z = r * Math.sin(a); out.hx = Math.sin(a); out.hz = -Math.cos(a);
  } else if ((u -= SEGS[1]) < SEGS[2]) {
    out.x = HALF - u; out.z = -r; out.hx = -1; out.hz = 0;
  } else {
    u -= SEGS[2];
    const a = -Math.PI / 2 - Math.PI * (u / SEGS[3]);
    out.x = -HALF + r * Math.cos(a); out.z = r * Math.sin(a); out.hx = Math.sin(a); out.hz = -Math.cos(a);
  }
  return out;
}
export const lapLen = (r) => 2 * STRAIGHT + 2 * Math.PI * r;

// ---- the grandstands: spectators face the track; tier i is rise * (i + 1) high and its seats stand `depth` deeper than the tier below ----
// The main stand's front is z = 76 (an 11.6 m apron from the rail, for the photo-finish tower, the crossings and the camera crews); 14 tiers carry it to 15.4 m and z = 112.4.
export const STAND = { x0: -114, x1: 114, z0: 76, tiers: 14, rise: 1.1, depth: 2.6, aisles: [-76, -38, 0, 38, 76], wall: 0.8, roof: 8.5 };
// The far stand is across the course (z negative) and a little smaller.
export const FAR = { x0: -95, x1: 95, z0: 76, tiers: 8, rise: 1.0, depth: 2.4, aisles: [-47.5, 0, 47.5], wall: 0.8 };
export const standBack = (S) => S.z0 + S.tiers * S.depth;   // the back wall's front face

// ---- the clubhouse and tote hall, behind the main stand's centre, its front (the forecourt side) at z = 142 ----
export const CLUB = { x0: -30, x1: 30, z0: 115, z1: 142 };
export const WINDOW = [0, 144];                             // where you stand to talk to the bookie, at the middle of the clubhouse's six windows
export const BOARD = { x: 0, y: 13.2, w: 13.3, h: 7.8 };    // the race card board's live canvas, in the recess on the clubhouse's face

// ---- the stand's own ways in (through its back wall) and the posters' places ----
export const ENTRIES = [-47.5, 47.5];

// ---- the screen drum at the infield's centre: faces 40 x 20 on the long sides, 14 x 20 on the ends, its underside 18 m up ----
export const DRUM = { x: 0, z: 0, w: 40, d: 14, h: 20, y: 18, core: 10 };

// ---- the arcades: a covered market hall round each turn (docs/downs-layouts.md). Each is a run of 6.3 degree wedges between radius 84 and 100 round the turn's centre (the west
// one's is (-90, 0), the east one's (90, 0), its mirror), with a gate hall in the middle (at 180 degrees on the west one). Angles are in degrees, measured from the turn's centre
// (x = cx + r cos a, z = r sin a), the west arcade's way round: from the main stand's end (108) through the gate (180) to the far stand's (264.6) ----
export const ARCADE = { cx: 90, ri: 84, ro: 100, step: 6.3, runs: [{ a0: 108, n: 10 }, { a0: 189, n: 12 }], gate: 180, walk: [112, 262] };
export const WEDGE = (() => {
  const a2 = (ARCADE.step / 2) * Math.PI / 180, s = Math.sin(a2), c = Math.cos(a2);
  return { a2, wi: ARCADE.ri * s, wo: ARCADE.ro * s, d: (ARCADE.ro - ARCADE.ri) * c, r0: ARCADE.ri * c };
})();
// a stall stands in every second bay of a run (the others hold a bench and two planters): five on each run, ten on each arcade
export const STALLS = [
  { d: 0, name: 'MOON DOGS', accent: 0x8b4044 }, { d: 1, name: 'CRATER FRIES', accent: 0xcfb352 }, { d: 2, name: 'HE-3 FIZZ', accent: 0x7b9a6e },
  { d: 3, name: 'CHIMERA CHOW', accent: 0xb07c57 }, { d: 4, name: 'ROCK CANDY', accent: 0x8b4044 }, { d: 5, name: 'TOTE · BETS', accent: 0x3b393a },
  { d: 6, name: 'SPACE SLUSH', accent: 0x7b9a6e }, { d: 7, name: 'LUNAR COFFEE', accent: 0xb07c57 }, { d: 8, name: 'DERBY DONUTS', accent: 0x8b4044 },
  { d: 9, name: "JOCKEY'S GRILL", accent: 0xcfb352 }, { d: 10, name: 'FOAM FINGERS', accent: 0x7b9a6e }, { d: 11, name: 'RAIL BAR', accent: 0x3b393a },
];
// which stall goes in which slot: [west, east], slot 0 to 9 along the arcade from the main stand
export const STALL_ORDER = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [10, 11, 0, 2, 4, 1, 3, 5, 7, 9]];

// ---- the track's crossings: the rails leave an 8 m gap at x = +-70 on both straights, a barrier post at each end ----
export const CROSSINGS = [-70, 70];
export const CROSS_GAP = 8;

// ---- the forecourt and the concourse behind the main stand ----
export const FORECOURT = { x0: -76, x1: 76, z0: 114, z1: 191, avenue: 14, fountain: [0, 166], gate: 193, promenade: [143, 149] };

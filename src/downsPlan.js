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

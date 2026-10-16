// Your town (Kepler story finale): a real settlement on the map, founded at the site you surveyed,
// with eight building plots round the Moon Council hall. You fill the plots from the hall's terminal;
// each building does something (income, healing, militia guns, a clinic to redeploy at, a motor pool,
// a shuttle pad, roads, a radio tower). The hall is also where you call Moon Council votes: each
// member faction votes with you more readily the better it thinks of you, and a motion that passes
// changes the Moon (worldstate.js applies it on the next load, after a "one week later" cut).
import * as THREE from 'three';
import { Kit, T, G, GLASS, crate, sandbags } from './outpostModels.js';
import { habDome, cabin, quonset, lattice, warehouse } from './settlements.js';
import { makeTurret, makeRover } from './models.js';
import { FACTIONS } from './locations.js';
import { saveWorldState } from './worldstate.js';

const DK = 0x3a3550, LT = 0xd8d4e8, CONC = 0x8a8698, CREAM = 0xfff4e0, WARM = 0xfff6a8, KEP = 0xff9f1c, GRN = 0x7dff6a;
export const SLOT_R = 64, SLOTS = 8;
// plot i: round the hall, the entrance (local +z) left clear
export const slotAt = (i) => { const a = Math.PI / 8 + (i * Math.PI * 2) / SLOTS; return { x: Math.sin(a) * SLOT_R, z: Math.cos(a) * SLOT_R, face: a + Math.PI }; };

// a point in plot i's own frame (x across, z toward the hall: what the building kits are baked in) as a position in the town's frame
export const plotPoint = (i, x, z) => { const p = slotAt(i), c = Math.cos(p.face), s = Math.sin(p.face); return { x: p.x + x * c + z * s, z: p.z - x * s + z * c }; };
// where you stand to use a building (F), in its plot's frame: the kit draws a glowing ring there. And the motor pool's bay: the apron in front
// of the quonset's door where a vehicle is set down, nose to the plaza (+z)
export const SPOTS = { farm: { x: 0, z: 12.8 }, motorpool: { x: -3, z: 9.8 }, radio: { x: 0, z: 6.5 }, clinic: { x: 0, z: 7.5 } };
export const BAY = { x: -3, z: 15.5 };
const PAD_R = 11.5, PAD_TOP = 0.78; // the shuttle pad's disc and the height of its deck (the kit's marking lines) over the plot's ground

export const BANK_CAP = 1500; // what the town bank holds (₵); a full bank stops earning until you collect

// Key order is the order of the hall's tiles and number keys. icon / tint / feature are what a building's
// tile shows (icon names are terminalUI.js's); income is ₵ a minute into the town bank.
export const BUILDINGS = {
  housing: { name: 'Housing Domes', cost: 1500, icon: 'housing', tint: '#ffd23f', feature: '+₵20 a minute', income: 20, desc: 'Families move in: +₵20 a minute to the town bank.' },
  market: { name: 'Market Hall', cost: 2000, icon: 'market', tint: '#ff2e88', feature: '+₵60 a minute', income: 60, desc: `Traders set up shop: +₵60 a minute to the town bank (it holds up to ₵${BANK_CAP}).` },
  clinic: { name: 'Clinic', cost: 1200, icon: 'clinic', tint: '#ff2a4a', feature: 'K.O. respawn point', desc: 'You redeploy here after a K.O. unless you have set a charted headquarters as your respawn point (set it here).' },
  farm: { name: 'Greenhouse Farm', cost: 1000, icon: 'greenhouse', tint: '#7dff6a', feature: 'Heals · +₵15/min · saplings', income: 15, desc: 'Heals you anywhere in town, +₵15 a minute, and a free sapling for your jar from the nursery bench every 5 minutes.' },
  motorpool: { name: 'Motor Pool', cost: 1800, icon: 'garage', tint: '#ffd23f', feature: 'Your vehicles · militia', desc: 'A Homestead Mule of your own; roll any vehicle out of its door (F), and your vehicles are patched up whenever you\'re in town. When raiders reach the town, two militia rovers roll out (every 10 minutes).' },
  barracks: { name: 'Militia Barracks', cost: 2200, icon: 'turret2', tint: '#ff9f1c', feature: '2 guns, 400 m', desc: 'Two militia guns that shoot any pirate within 400 m of town.' },
  roads: { name: 'Roads', cost: 1800, icon: 'roads', tint: '#c9c3d9', feature: 'Ring road + links', desc: 'Road crews lay a ring road round the town and link it to the settlements around it. Land-trains and hover-cars start calling.' },
  radio: { name: 'Radio Tower', cost: 1600, icon: 'beacon', tint: '#2ee6ff', feature: 'Charts 3 km · sweeps', desc: 'Charts 3 km of map round town and lets you sweep the rest of the Moon from the tower; you can call a council vote twice as often.' },
  pad: { name: 'Shuttle Pad', cost: 2500, icon: 'pad', tint: '#c77dff', feature: 'Shuttle · home base', desc: 'A landing pad and a shuttle service to the nearest settlement; the town is also your home base.' },
};

// ---------------------------------------------------------------------------------------------
// Moon Council motions. Members are the five non-pirate factions still standing; Kepler (you) always
// votes yes; a motion needs a majority. hidden(ws): not on the table (already passed, or moot).
// ---------------------------------------------------------------------------------------------
export const MOTIONS = {
  ceasefire: {
    name: 'Vostok–Daedalus Ceasefire',
    desc: 'Vostok and Daedalus stand down. Their militarised zones open up, and their armour (the BTR-M APC and the Phase Skimmer), their weapons and Daedalus\' Phase Dash go on sale to anyone.',
    stance: { vostok: -0.15, daedalus: -0.15 },
    hidden: (ws) => Object.keys(ws.conquered || {}).length > 0,
  },
  openSkies: {
    name: 'Open Skies Accord',
    desc: 'SPACECOM opens its motor pool and its labs: the Lunar Interceptor and the Deflector Shield go on sale at the ILMB.',
    stance: { spacecom: -0.05 },
    hidden: (ws) => !!ws.lawless,
  },
  freeTrade: {
    name: 'Free Trade Charter',
    desc: 'Meridian drops its tariffs: 10% off every shop on the Moon, and the Courier Light-Bike and the Personal Teleporter go on sale at the Exchange.',
    stance: {},
  },
  militiaPact: {
    name: 'Militia Pact',
    desc: 'Every Kepler town gets two more militia turrets, and the Homestead Mule goes on sale at Kepler Civic Center.',
    stance: {},
  },
};
const COUNCIL = ['spacecom', 'vostok', 'daedalus', 'meridian', 'kepler'];
const VOTE_CD = 8 * 60 * 1000; // between votes (real time; the radio tower halves it)

// ---------------------------------------------------------------------------------------------
// The town itself (built by the world like any settlement: world.js 'hometown').
// ---------------------------------------------------------------------------------------------
const kits = new Map();
function bake(key, fn) {
  let r = kits.get(key);
  if (!r) { const k = new Kit(KEP, 11, false); fn(k); r = k.finish(); kits.set(key, r); }
  return r;
}

// the Moon Council hall: a round domed chamber behind a colonnade, the council's flags, the
// terminal on the steps
function hallKit(k) {
  k.at();
  k.cyl(30, 31, 0.3, 48, T(0xd8d4e8), 0, 0, 0, { outline: 0.05 });
  k.ring(29.5, 0.2, T(KEP), 0, 0.32, 0);
  k.cyl(13, 13.6, 1.2, 24, T(CONC), 0, 0.3, 0, { outline: 0.08 });
  k.cyl(11.5, 11.5, 8, 24, T(CREAM), 0, 1.5, 0, { outline: 0.14 });
  for (let i = 0; i < 12; i++) k.box(1.6, 2.2, 0.15, G(WARM), Math.sin((i / 12) * Math.PI * 2) * 11.6, 4, Math.cos((i / 12) * Math.PI * 2) * 11.6, { ry: (i / 12) * Math.PI * 2, outline: 0 });
  k.cyl(12.2, 12.2, 0.8, 24, T(KEP), 0, 9.5, 0, { outline: 0.05 });
  k.add(new THREE.SphereGeometry(10.5, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), GLASS(0x9bffb0, 0.4), 0, 10.3, 0, { outline: 0 });
  for (let i = 0; i < 8; i++) k.add(new THREE.TorusGeometry(10.55, 0.14, 4, 24, Math.PI).rotateY((i / 8) * Math.PI), T(LT), 0, 10.3, 0, { outline: 0 });
  k.cyl(0.25, 0.3, 5, 6, T(DK), 0, 20.8, 0, { outline: 0.03 });
  k.ball(0.6, G(GRN), 0, 26, 0, { outline: 0 });
  // the colonnade and steps facing the entrance (+z)
  k.box(16, 0.5, 6, T(CONC), 0, 0.3, 14, { outline: 0.05 });
  for (let i = 0; i < 3; i++) k.box(16, 0.35, 1, T(LT), 0, 0, 17.5 + i, { outline: 0.02 });
  for (let i = 0; i < 6; i++) k.cyl(0.45, 0.55, 7, 12, T(0xfffaf0), -6.25 + i * 2.5, 0.8, 15.5, { outline: 0.04 });
  k.box(17, 1.2, 4, T(CREAM), 0, 7.8, 14.6, { outline: 0.08 });
  k.box(17.2, 0.3, 4.2, T(KEP), 0, 9, 14.6, { outline: 0.03 });
  k.text('MOON COUNCIL', 0, 8.4, 16.62, 0, 10, { fg: '#ff9f1c', bg: '#241a3a', back: false, off: 0.02 });
  k.box(4, 5, 0.3, T(0x8a5a3a), 0, 0.8, 11.6, { outline: 0.03 });
  // the terminal on the steps
  k.box(1.4, 1.6, 0.8, T(DK), 4, 0.8, 19.5, { outline: 0.04 });
  k.box(1.1, 0.7, 0.06, G(GRN), 4, 1.7, 19.92, { outline: 0 });
  // the council's flags: one per member faction
  const fl = [0xffd23f, 0xff3b5c, 0x2ec4ff, 0xff9f1c, 0xc77dff];
  for (let i = 0; i < 5; i++) k.flag(-14 + i * 7, 24, 12, fl[i]);
  // plaza paths out to the plots and the entrance
  for (let i = 0; i < SLOTS; i++) { const p = slotAt(i); k.strip([p.x * 0.45, p.z * 0.45], [p.x * 0.82, p.z * 0.82], 3, 0.05, T(0x6b6880), 0.3); }
  k.strip([0, 30], [0, 118], 4, 0.05, T(0x6b6880), 0.3);
  k.solid(11.5, 5, 11.5, 0, 0);
  k.solid(8, 4, 2.5, 0, 14.6, 0, 0.8);
}
export const TERMINAL = { x: 4, z: 20.4 };

// the glowing ring where you stand to use a building, in the building's tile colour (kit frame: call it after k.at())
const spotRing = (k, type) => k.raidAt(SPOTS[type].x, SPOTS[type].z, parseInt(BUILDINGS[type].tint.slice(1), 16));

// one plot's building, baked with its origin at the plot centre, facing the hall (local -z → +z
// out of the hall: the door looks back at the plaza)
function buildingKit(type) {
  return (k) => {
    k.at();
    k.cyl(13, 13.5, 0.3, 32, T(0xb8b4c8), 0, 0, 0, { outline: 0.04 });
    switch (type) {
      case 'housing':
        habDome(k, -5, -2, 6.5, 0x9be7ff, { door: Math.PI, trim: KEP });
        habDome(k, 6, -1, 5.5, 0xffd23f, { door: Math.PI, trim: GRN });
        habDome(k, 0, 7, 5, 0xff7ad9, { door: Math.PI, trim: KEP });
        break;
      case 'market':
        warehouse(k, 0, 2, 16, 11, 6, 0xd8d4e8, 0, KEP);
        k.at();
        for (let i = 0; i < 3; i++) {
          const x = -6 + i * 6;
          for (const sx of [-1, 1]) k.cyl(0.1, 0.1, 3, 6, T(DK), x + sx * 2, 0.3, -7, { outline: 0.02 });
          for (let j = 0; j < 4; j++) k.box(1.0, 0.12, 3.6, T(j % 2 ? CREAM : [0xff2e88, 0x2ec4ff, GRN][i]), x - 1.5 + j * 1.0, 3.3, -7.2, { rz: 0.1, outline: 0.02 });
          crate(k, x, 0.3, -7.5, 0.8, [0xff9f1c, 0x7dff6a, 0x2ec4ff][i], i);
        }
        break;
      case 'clinic':
        cabin(k, 0, 0, 12, 9, 5, 0xffffff, 0, { trim: 0xff2a4a });
        k.at();
        k.box(3, 0.8, 0.14, T(0xff2a4a), 0, 3.4, -4.62, { outline: 0 });
        k.box(0.8, 3, 0.14, T(0xff2a4a), 0, 2.3, -4.63, { outline: 0 });
        k.cyl(4, 4, 0.1, 24, T(0x5b5870), 7, 0.3, 6, { outline: 0.02 });
        k.ring(3.6, 0.12, G(0xff2a4a), 7, 0.42, 6);
        k.ball(0.4, G(0xff2a4a), 0, 6.2, 0, { outline: 0 });
        spotRing(k, 'clinic');
        break;
      case 'farm':
        for (const x of [-4.5, 4.5]) {
          k.add(new THREE.CylinderGeometry(3.6, 3.6, 16, 16, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), GLASS(0x9bffb0, 0.32), x, 0.3, 0, { outline: 0 });
          for (let t = -7; t <= 7; t += 3.5) k.add(new THREE.TorusGeometry(3.62, 0.07, 4, 16, Math.PI), T(LT), x, 0.3, t, { outline: 0 });
          for (let r = -1; r <= 1; r++) k.box(1.2, 0.4, 14, T(0x6b4a2a), x + r * 1.6, 0.3, 0, { outline: 0.02 });
          k.hcyl(3.6, 16, x, 0, 0, 0.3);
          for (let r = -1; r <= 1; r++) for (let j = 0; j < 6; j++) k.add(new THREE.SphereGeometry(0.4, 6, 4), T(0x3f9a3a), x + r * 1.6, 1.0, -6 + j * 2.4, { outline: 0.02 });
        }
        spotRing(k, 'farm');
        break;
      case 'motorpool':
        quonset(k, -3, 0, 5, 13, 0xd8d4e8, 0, KEP);
        k.at();
        k.box(8, 0.12, 6, T(0x5b5870), 7, 0.3, -2, { outline: 0 });
        for (let i = 0; i < 3; i++) crate(k, 9, 0.3 + i * 0.9, 4, 0.9, 0x55607a, i);
        k.solid(2.2, 1.2, 2.6, 7, -2, 0.4, 0.3); // (the Mule parked on its apron)
        spotRing(k, 'motorpool'); // (at the quonset's door)
        break;
      case 'barracks':
        quonset(k, 0, 3, 4.5, 12, 0x6b6f78, 0, KEP);
        k.at();
        sandbags(k, 0, -6, 6, -1.4, 1.4, 2);
        k.flag(-8, -6, 12, KEP);
        break;
      case 'roads': // the road crew's depot: fresh blacktop with lane dashes, a bitumen silo, a road roller, cones and a barrier across the front
        k.box(18, 0.12, 11, T(0x2f2d3d), 0, 0.3, -0.5, { outline: 0 });
        for (let i = -2; i <= 2; i++) k.box(0.4, 0.05, 2.2, T(CREAM), i * 3.2, 0.42, 3.6, { outline: 0 });
        k.cyl(2.4, 2.4, 7.5, 14, T(LT), 6.5, 2.0, -4, { outline: 0.08 });
        k.add(new THREE.ConeGeometry(2.4, 1.8, 14), T(CONC), 6.5, 10.4, -4, { outline: 0.05 });
        for (const [sx, sz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) k.cyl(0.18, 0.22, 2.0, 6, T(DK), 6.5 + sx, 0.3, -4 + sz, { outline: 0.03 });
        k.cyl(0.4, 0.4, 3.2, 8, T(KEP), 6.5, 0.3, -1.2, { outline: 0.04 }); // (the silo's spout)
        k.column(2.5, 11, 6.5, -4);
        k.box(3.2, 1.3, 5.2, T(0xffd23f), -5.2, 1.5, -3.4, { outline: 0.06 }); // (the road roller)
        k.box(2.6, 1.9, 2.0, T(0x2ec4ff), -5.2, 2.8, -4.2, { outline: 0.05 });
        for (const dz of [-1.4, -5.4]) k.add(new THREE.CylinderGeometry(1.2, 1.2, 3.0, 14).rotateZ(Math.PI / 2), T(0x7a7790), -5.2, 1.5, dz, { outline: 0.05 });
        k.solid(1.7, 1.6, 3.0, -5.2, -3.4, 0, 0.3);
        for (let i = 0; i < 7; i++) k.add(new THREE.ConeGeometry(0.34, 0.95, 6), T(0xff7a1a), -9 + i * 3, 0.8, 7.2, { outline: 0.03 });
        k.box(5, 0.5, 0.18, T(CREAM), 3.5, 0.9, 7.2, { outline: 0.02 });
        k.box(5, 0.16, 0.2, T(0xff3b5c), 3.5, 1.15, 7.2, { outline: 0 });
        k.solid(2.5, 0.5, 0.3, 3.5, 7.2, 0, 0);
        k.sign('ROAD CREW', 0, -9, { ry: 0, w: 7, y: 3.6 });
        k.lamp(-8.5, 4.8, 6);
        break;
      case 'radio':
        k.box(5, 0.5, 5, T(CONC), 0, 0.3, 0, { outline: 0.03 });
        lattice(k, 0, 0, 30, 2.2, 0.5, 8, T(LT), T(DK), { r: 0.2 });
        k.at();
        k.add(new THREE.SphereGeometry(2, 14, 6, 0, Math.PI * 2, 0, 0.8).rotateX(-1.2), T(CREAM), 0.8, 20, 0.5, { outline: 0.05 });
        k.ball(0.6, G(0xff2a4a), 0, 30.6, 0, { outline: 0 });
        cabin(k, 6, 5, 5, 4, 3, 0xd8d4e8, 0, { trim: KEP });
        k.at();
        spotRing(k, 'radio');
        break;
      case 'pad':
        k.cyl(11, 11.5, 0.4, 32, T(0x5b5870), 0, 0.3, 0, { outline: 0.04 });
        k.ring(10.5, 0.2, G(KEP), 0, 0.72, 0);
        k.box(1.2, 0.06, 7, T(CREAM), -2, 0.72, 0, { outline: 0 });
        k.box(1.2, 0.06, 7, T(CREAM), 2, 0.72, 0, { outline: 0 });
        k.box(3, 0.06, 1.2, T(CREAM), 0, 0.72, 0, { outline: 0 });
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.ball(0.25, G(WARM), Math.cos(a) * 11.2, 0.8, Math.sin(a) * 11.2, { outline: 0 }); }
        break;
      default: break;
    }
  };
}

// The world builds the town at load (and adds a building the moment you buy it).
export function buildHomeTown(world, loc) {
  const hall = bake('hall', hallKit);
  const root = hall.root.clone();
  world.put(root, loc, 0, 0, 0, 0, true);
  for (const c of hall.cols) world.col(loc, c);
  const flags = [];
  root.traverse((o) => { if (o.userData.flag) flags.push(o); });
  if (flags.length) world.anims.push({ loc, list: flags, seed: 5 });
  // ground the town keeps for itself, built on or not: traffic's pads and stops, the road crews and the defence pylons keep off the hall's
  // disc and every plot's (their disc is 13.5 m; 14.5 leaves the apron's edge clear)
  (loc.keep ||= []).push({ x: 0, z: 0, r: 34 });
  for (let i = 0; i < SLOTS; i++) { const p = slotAt(i); loc.keep.push({ x: p.x, z: p.z, r: 14.5 }); }
  (loc.slots || []).forEach((type, i) => { if (type) addBuilding(world, loc, i, type); });
  for (let i = 0; i < SLOTS; i++) if (!(loc.slots || [])[i]) addPlot(world, loc, i);
}

function addPlot(world, loc, i) {
  const p = slotAt(i);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(10, 0.18, 4, 32).rotateX(Math.PI / 2), G(KEP));
  ring.name = `plot${i}`;
  world.put(ring, loc, p.x, p.z, 0.4, 0, false);
}

export function addBuilding(world, loc, i, type) {
  const p = slotAt(i);
  const plot = loc.group.getObjectByName(`plot${i}`);
  if (plot) plot.removeFromParent();
  const b = bake(`b|${type}`, buildingKit(type));
  const root = b.root.clone();
  world.put(root, loc, p.x, p.z, 0, p.face, false);
  // colliders: the kit's boxes, turned to the plot's facing
  const c = Math.cos(p.face), s = Math.sin(p.face);
  for (const col of b.cols) {
    const { x, z } = plotPoint(i, col.x, col.z);
    world.col(loc, { ...col, x, z, yaw: (col.yaw || 0) + p.face });
  }
  // the shuttle pad is a real pad: traffic lands on this record and never drops it. One record per pad plot, however often it is built
  // (a rebuilt town gets its old records back: world.rebuildLocation)
  if (type === 'pad' && !(loc.pads || []).some((q) => q.plot === i)) (loc.pads ||= []).push({ x: p.x, z: p.z, r: PAD_R, spare: false, mesh: null, plot: i, top: PAD_TOP });
  // the barracks' guns and the motor pool's Mule are proper models
  if (type === 'barracks') for (const sx of [-1, 1]) {
    const t = makeTurret({ color: KEP });
    world.put(t.root, loc, p.x + (sx * 6 * c), p.z - (sx * 6 * s), 0.3, p.face, false);
  }
  if (type === 'motorpool') {
    const m = makeRover({ color: 0x7dff6a, trim: KEP, pirate: false, flag: KEP, style: 'civil' });
    world.put(m.root, loc, p.x + 7 * c - 2 * s, p.z - 7 * s - 2 * c, 0.3, p.face + 0.4, false);
  }
}

// ---------------------------------------------------------------------------------------------
// Running the town: income, healing, guns, the hall's terminal, council votes.
// ---------------------------------------------------------------------------------------------
export class HomeTown {
  constructor(game) {
    this.game = game;
    this.loc = game.locations.find((l) => l.id === 'hometown') || null;
    this.fireCd = 0;
    this.saveT = 0;
    this.spots = {}; // building type -> where you stand to use it (world position; see spot())
    if (this.loc) {
      this.terminal = game.world.toWorld(this.loc, TERMINAL.x, 0, TERMINAL.z);
      if (this.has('radio')) this.chart();
    }
  }

  get ws() { return this.game.ws; }
  get state() { return this.ws.town; }
  has(type) { return !!this.state && this.state.slots.includes(type); }
  slotWorld(type) { const i = this.state.slots.indexOf(type); if (i < 0) return null; const p = slotAt(i); return this.game.world.toWorld(this.loc, p.x * 0.75, 0, p.z * 0.75); }

  chart() {
    const G2 = this.game.globe;
    if (!G2 || !G2.cells) return;
    const cos = Math.cos(3000 / 3600), d = this.loc.dir;
    for (let k = 0; k < G2.explored.length; k++) if (G2.cells[k * 3] * d.x + G2.cells[k * 3 + 1] * d.y + G2.cells[k * 3 + 2] * d.z > cos) G2.explored[k] = 1;
    G2.save();
  }

  // a point in a building's plot frame (x across, z toward the hall), in the world; null until it's built
  pt(type, x, z) {
    const i = this.state.slots.indexOf(type);
    if (i < 0) return null;
    const q = plotPoint(i, x, z);
    return this.game.world.toWorld(this.loc, q.x, 0, q.z);
  }

  // where you stand to use a building (cached: a building never moves once built)
  spot(type) { return this.spots[type] || (SPOTS[type] && this.has(type) ? (this.spots[type] = this.pt(type, SPOTS[type].x, SPOTS[type].z)) : null); }

  // a building went up: what the traffic and the game cached about the town's buildings (passengers' doors, the home spot) is stale
  afterBuild() {
    delete this.loc._bld;
    for (const s of this.game.world.traffic.stops) if (s.loc === this.loc) delete s.doors;
    this.game._homes = {};
  }

  // F at the hall's terminal
  interact(P) {
    const g = this.game;
    if (!this.loc || !this.loc.active || P.pos.distanceTo(this.terminal) > 4.5) return false;
    g.hud.prompt('<b>F</b> — MOON COUNCIL HALL');
    if (g.input.pressed('KeyF') && g.boardCooldown <= 0) this.menu();
    return true;
  }

  menu() {
    const g = this.game;
    const st = this.state;
    const buttons = [];
    if (st.bank >= 1) buttons.push({ label: `COLLECT THE TOWN BANK — ₵${Math.floor(st.bank)}`, fn: () => { g.addCredits(Math.floor(st.bank), st.name); st.bank = 0; saveWorldState(this.ws); this.menu(); } });
    buttons.push({ label: 'BUILD ON A PLOT…', fn: () => this.buildMenu() });
    buttons.push({ label: 'THE MOON COUNCIL…', fn: () => this.councilMenu() });
    buttons.push({ label: 'CLOSE' });
    const built = st.slots.filter(Boolean).map((t) => BUILDINGS[t].name).join(', ') || 'nothing yet';
    g.dialog(`${st.name.toUpperCase()} · COUNCIL HALL`, `<small>Councillor's terminal.</small><br><br>Built: <b>${built}</b> (${st.slots.filter(Boolean).length}/${SLOTS} plots)<br>Town bank: <b>₵${Math.floor(st.bank)}</b>`, buttons.map((b, i) => ({ ...b, label: `${i + 1} · ${b.label}` })));
  }

  buildMenu() {
    const g = this.game;
    const st = this.state;
    const free = st.slots.indexOf(null);
    if (free < 0) { g.hud.toast('Every plot is built on. The town is complete.', 3); return; }
    const opts = Object.entries(BUILDINGS).filter(([k]) => !st.slots.includes(k));
    g.dialog('BUILD ON A PLOT', `<small>${opts.map(([, b]) => `<b>${b.name}</b>: ${b.desc}`).join('<br>')}</small>`,
      opts.map(([k, b], i) => ({ label: `${i + 1} · ${b.name.toUpperCase()} — ₵${b.cost}`, fn: () => this.build(k) })).concat([{ label: `${opts.length + 1} · BACK`, fn: () => this.menu() }]));
  }

  build(type) {
    const g = this.game;
    const st = this.state;
    const B = BUILDINGS[type];
    const i = st.slots.indexOf(null);
    if (i < 0) return;
    if (g.credits < B.cost) { g.hud.toast(`Not enough credits (need ₵${B.cost}).`, 2.5); return; }
    g.credits -= B.cost;
    st.slots[i] = type;
    this.loc.slots = st.slots;
    addBuilding(g.world, this.loc, i, type);
    if (type === 'motorpool' && !g.story.vehicles.includes('mule')) { g.story.vehicles.push('mule'); g.story.save(); g.hud.toast('Homestead Mule in the motor pool. Press V.', 3); }
    if (type === 'radio') this.chart();
    this.afterBuild();
    saveWorldState(this.ws);
    g.save();
    g.audio.cash();
    g.fx.pop(`${B.name.toUpperCase()} BUILT!`, null, { color: '#ff9f1c', size: 56 });
  }

  // ---------- the council ----------
  members() { return COUNCIL.filter((f) => FACTIONS[f] && !FACTIONS[f].absorbedBy && !FACTIONS[f].gone && !FACTIONS[f].fallen); }

  chance(f, motion) {
    if (f === 'kepler') return 1; // your own seat
    const rep = this.game.rep.get(f);
    return Math.min(0.97, Math.max(0.03, 0.15 + rep / 50 + (motion.stance[f] || 0)));
  }

  cooldown() { const c = this.ws.council; return Math.max(0, (c.next || 0) - Date.now()); }

  councilMenu() {
    const g = this.game;
    const c = this.ws.council;
    const open = Object.entries(MOTIONS).filter(([k, m]) => !c.passed.includes(k) && !(m.hidden && m.hidden(this.ws)));
    const passed = c.passed.map((k) => MOTIONS[k] && MOTIONS[k].name).filter(Boolean);
    const cd = this.cooldown();
    if (!open.length) { g.dialog('THE MOON COUNCIL', `Every motion on the table has passed.${passed.length ? `<br><br><small>Passed: ${passed.join(', ')}</small>` : ''}`, [{ label: '1 · BACK', fn: () => this.menu() }]); return; }
    const forecast = (m) => this.members().map((f) => {
      const p = this.chance(f, m);
      const word = p >= 0.7 ? 'likely yes' : p >= 0.4 ? 'leaning' : 'unlikely';
      return `<span style="color:${FACTIONS[f].color}">${FACTIONS[f].name}</span> ${word}`;
    }).join(' · ');
    const body = `${cd > 0 ? `<b>The next session sits in ${Math.ceil(cd / 60000)} min.</b><br><br>` : 'Call a vote. Each member votes with you more readily the better its standing with you; a majority carries the motion.<br><br>'}`
      + `<small>${open.map(([, m]) => `<b>${m.name}</b>: ${m.desc}<br>${forecast(m)}`).join('<br><br>')}</small>`
      + (passed.length ? `<br><br><small>Passed: ${passed.join(', ')}</small>` : '');
    g.dialog('THE MOON COUNCIL', body, open.map(([k, m], i) => ({ label: `${i + 1} · CALL A VOTE: ${m.name.toUpperCase()}`, fn: () => this.vote(k) }))
      .concat([{ label: `${open.length + 1} · BACK`, fn: () => this.menu() }]));
  }

  vote(key) {
    const g = this.game;
    const m = MOTIONS[key];
    if (this.cooldown() > 0) { g.hud.toast(`The council sits again in ${Math.ceil(this.cooldown() / 60000)} min.`, 3); return; }
    const members = this.members();
    const ballots = members.map((f) => ({ f, yes: Math.random() < this.chance(f, m) }));
    const yes = ballots.filter((b) => b.yes).length;
    const pass = yes > members.length / 2;
    const c = this.ws.council;
    c.next = Date.now() + VOTE_CD / (this.has('radio') ? 2 : 1);
    const roll = ballots.map((b) => `<span style="color:${FACTIONS[b.f].color}">${FACTIONS[b.f].name}</span>: <b style="color:${b.yes ? '#7dff6a' : '#ff3b5c'}">${b.yes ? 'AYE' : 'NAY'}</b>`).join('<br>');
    g.audio.tone(pass ? 880 : 220, 0.4, 'triangle', 0.25);
    if (!pass) {
      saveWorldState(this.ws);
      g.dialog(`THE VOTE: ${m.name.toUpperCase()}`, `${roll}<br><br><b>${yes} to ${members.length - yes}. THE MOTION FAILS.</b><br><small>Raise your standing with the doubters and call it again next session.</small>`, [{ label: 'NEXT TIME', fn: () => this.menu() }]);
      return;
    }
    c.passed.push(key);
    saveWorldState(this.ws);
    g.dialog(`THE VOTE: ${m.name.toUpperCase()}`, `${roll}<br><br><b>${yes} to ${members.length - yes}. THE MOTION CARRIES.</b><br><small>${m.desc}</small>`, [{ label: 'ONE WEEK LATER…' }]);
    g.story.pendingDawn = () => g.newDawn(`THE COUNCIL HAS SPOKEN: ${m.name.toUpperCase()}`, `<b>${m.name.toUpperCase()}.</b> ${m.desc}<br><br><small>Carried by the Moon Council, sitting in ${this.state.name}.</small>`);
  }

  // ---------- per frame ----------
  update(dt) {
    const g = this.game;
    if (!this.loc || !this.state) return;
    const st = this.state;
    const P = g.player;
    let rate = 0;
    if (this.has('market')) rate += 60;
    if (this.has('housing')) rate += 20;
    if (this.has('farm')) rate += 15;
    st.bank = Math.min(BANK_CAP, (st.bank || 0) + (rate / 60) * dt);
    this.saveT -= dt;
    if (this.saveT <= 0) { this.saveT = 30; saveWorldState(this.ws); }
    const d = P.pos.distanceTo(this.loc.pos);
    if (this.has('farm') && d < this.loc.r && !P.dead) P.health = Math.min(P.maxHealth, P.health + 4 * dt);
    if (this.has('motorpool') && d < this.loc.r && g.garage) for (const k of Object.keys(g.garage.hp || {})) g.garage.hp[k] = Math.min(g.garage.maxHp(k), g.garage.hp[k] + 20 * dt);
    if (this.has('barracks') && d < 1200) {
      this.fireCd -= dt;
      if (this.fireCd <= 0) {
        this.fireCd = 0.8;
        const from = g.world.toWorld(this.loc, 0, 30, 0);
        let target = null, bd = 400;
        for (const e of g.enemies.list) {
          if (e.dead || e.faction !== 'pirate' || !e.center || e.kind === 'core' || g.enemies.friendly(e)) continue;
          const dd = e.center.distanceTo(this.loc.pos);
          if (dd < bd) { bd = dd; target = e; }
        }
        if (target) g.projectiles.fire('mil', from, target.center.clone().sub(from).normalize().multiplyScalar(150), { damage: 28, splash: 4, color: 0xff9f1c, size: 0.45, knock: 0.5, spare: true });
      }
    }
  }
}

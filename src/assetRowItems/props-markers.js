import * as THREE from 'three';
import { animate, lineUp } from './common.js';
import { seat, hexOf } from './props-util.js';
import { toon, glow, ink, textSprite } from '../toon.js';
import { mulberry32 } from '../rng.js';
import { FACTIONS, CARGO, MIL_CARGO } from '../locations.js';
import { makeCrate, makeSeismo, makeTube, makePylon, makeDish, makeTurret, makeRocket, engineModel, caseModel, plinkoConsoleModel, plinkoFrameModel, makeLampPost, makeFountain, makeChandelier, makeCasinoSign } from '../models.js';
import { makeProp } from '../storyAssets.js';
import { makeStretcher } from '../medevac.js';
import { makeLoot } from '../alchemy.js';
import { slotCabinet, updateSlot, PLK } from '../casinoWorld.js';
import { SLOTS, SPACING, DROP_Y } from '../plinko.js';
import { Events } from '../events.js';
import { World } from '../world.js';
import { Traffic } from '../traffic.js';

// 04 · PROPS & MARKERS: the small things the game scatters or plants (crates, pickups, event and mission props, the turrets and
// dishes of the bases, the helper pieces of a settlement) and the light columns and rings that mark where to go.

const FACTION_ORDER = ['spacecom', 'vostok', 'meridian', 'kepler', 'daedalus', 'rustmoon'];
const fcol = (f) => hexOf(FACTIONS[f].color);

// ---- crates (models.js makeCrate) ---------------------------------------------------------------
// All 14 cargo colours the contracts use (locations.js CARGO + MIL_CARGO) at the usual 0.9 m, then the sizes the game uses:
// 0.6 med-kit (events.js:677), 0.7 carried / on a pirate's back (player.js:110, enemies.js:1264), 1.2 a pirate's loot
// (enemies.js:1386), 1.4 a dropped cargo (enemies.js:772), 1.6 supply pods and Kade's mortar crate.
function crates() {
  const parts = [];
  for (const c of [...CARGO, ...MIL_CARGO]) parts.push(seat(makeCrate(c.color, 0.9)));
  for (const s of [0.6, 0.7, 1.2, 1.4, 1.6]) parts.push(seat(makeCrate(0xffd23f, s)));
  const row = lineUp(parts, 0.7);
  return { root: row.root };
}

// ---- loot pickups (alchemy.js makeLoot, extracted from dropLoot) ----------------------------------
function loot() {
  const kinds = [['wiring'], ['engine'], ['lens'], ['transponder'], ['plating'], ['junkbot'], ['sapling'], [null, { credits: 100 }], [null, { crate: true }]];
  const spin = [];
  const parts = kinds.map(([k, o]) => {
    const L = makeLoot(k, o || {});
    L.root.position.y = 0.9; // (dropLoot lands them 0.9 m above the ground)
    spin.push(L.core);
    return { root: L.root, w: 2.4, d: 2.4 };
  });
  const row = lineUp(parts, 1.4);
  return {
    root: row.root,
    update: (dt, t) => { spin.forEach((c, i) => { c.rotation.y += dt * 2; c.position.y = Math.sin(t * 3 + i) * 0.15; }); }, // (alchemy.updateLoot)
  };
}

// ---- wreck salvage: the engine and the credits briefcase (models.js engineModel / caseModel; tools/blender/build_engine.py, build_briefcase.py) ----
// In the game they lie on the ground as pickups, spinning and bobbing (alchemy.js makeLoot: they are also in LOOT PICKUPS above, small among the
// others). Here each stands on the floor at its real size and turns slowly, so every side can be seen.
function salvage(build, what) {
  const m = build();
  if (!m) throw new Error(`${what} has not loaded`); // (null until the models have loaded)
  const p = seat(m);
  const root = new THREE.Group();
  root.add(p.root);
  return { root, update: (dt) => { p.root.rotation.y += dt * 0.5; } };
}
const engine = () => salvage(engineModel, 'engine.glb');
const briefcase = () => salvage(caseModel, 'briefcase.glb');

// ---- the casino's slot machines (casinoWorld.js slotCabinet; the cabinet is tools/blender/build_slots.py) --------------------------------
// The seven paints of the carousels (buildCasino), each with its own marquee word and side pictures (the marquee and the pixel sprites are
// planes the casino hangs on the model), facing the walker. Every few seconds one is worked: the lever swings, the lamp bar flashes and the
// reels run and stop one after another (updateSlot).
function slotMachines() {
  const paints = [0xff2e88, 0x2ee6ff, 0x7dff6a, 0xff9f1c, 0xc77dff, 0xffd23f, 0x4d7cff];
  const users = [];
  const parts = paints.map((c, i) => {
    const cab = slotCabinet(c, i);
    const g = new THREE.Group();
    g.add(cab.userData.stat, cab); // (the casino places the frozen part and the moving part alike)
    users.push(cab.userData);
    return seat(g);
  });
  const row = lineUp(parts, 0.9);
  let acc = 2, k = 0;
  return {
    root: row.root,
    update: (dt, t) => {
      acc -= dt;
      if (acc <= 0) { acc = 3.2; const u = users[k++ % users.length]; u.playing = 2.4; u.pullT = 0.3; }
      for (const u of users) updateSlot(u, dt, t);
    },
  };
}

// ---- the Plinko booth and the board's cabinet frame (models.js plinkoConsoleModel / plinkoFrameModel; tools/blender/build_plinko.py) ------
// As buildCasino stands them: the frame (a plinth, two pillars, a cornice and the sign backing) with the board's dark panel in it, and the
// booth you play from 6 m in front. The pegs, the ball, the slot labels and the neon sign are built inline in buildCasino and are seen with
// the casino itself (places: LUCKY CRATER CASINO); the board's own colliders are the casino's (a box for the frame, one for the booth).
function plinko() {
  const frame = plinkoFrameModel(), booth = plinkoConsoleModel();
  if (!frame || !booth) throw new Error('plinko.glb has not loaded');
  const bw = SLOTS * SPACING + 2.4, bh = DROP_Y + 2.4;
  const z0 = -2.2; // (the frame's origin: puts the middle of frame and booth on the item's own)
  const root = new THREE.Group();
  frame.position.set(0, 0, z0);
  booth.position.set(0, 0, z0 + 6);
  const board = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.5), toon(0x1a0f2e));
  ink(board, 0.1);
  board.position.set(0, PLK.y + bh / 2 - 0.9, z0 - 0.45);
  root.add(frame, booth, board);
  return {
    root,
    cols: [
      { type: 'box', x: 0, y: 6.9, z: z0 - 0.675, hx: bw / 2 + 0.95, hy: 6.9, hz: 1.375, yaw: 0 },
      { type: 'box', x: 0, y: 0.7, z: z0 + 6, hx: 1.8, hy: 0.7, hz: 0.7, yaw: 0 },
    ],
  };
}

// ---- event props ---------------------------------------------------------------------------------
function seismograph() {
  const m = makeSeismo();
  const p = seat(m.root);
  return { root: p.root, update: (dt, t) => { m.light.visible = Math.sin(t * 8) > 0; } }; // (events.js update_seismic)
}

function tubes() {
  const parts = [], fluids = [];
  for (const fill of [0.02, 0.4, 0.75, 1]) {
    const m = makeTube();
    m.fluid.scale.y = fill; // (events.js update_blackLake: the level it has filled to)
    fluids.push(m.fluid);
    parts.push(seat(m.root));
  }
  return { root: lineUp(parts, 0.8).root };
}

// The prop you walk up to to begin an event: Events.startProp reads only the faction table and the toon helpers, so it is called
// on a bare object. One of each of the nine types, tinted by the faction that posts it.
const START_TYPES = [
  ['seismic', 'meridian'], ['blackLake', 'spacecom'], ['escort', 'kepler'], ['pods', 'kepler'], ['relay', 'spacecom'],
  ['strike', 'vostok'], ['raid', 'rustmoon'], ['wreck', 'rustmoon'], ['clearCamp', 'daedalus'],
];
function startProps() {
  const rings = [];
  const parts = START_TYPES.map(([type, faction]) => {
    const g = Events.prototype.startProp.call({}, { type, faction });
    g.traverse((o) => { if (o.userData.pulse) rings.push(o); });
    return seat(g);
  });
  const row = lineUp(parts, 2);
  return { root: row.root, update: (dt, t) => { for (const r of rings) r.scale.setScalar(1 + Math.sin(t * 3) * 0.08); } }; // (events.js:726)
}

// ---- story props (storyAssets.js makeProp) --------------------------------------------------------
const STORY_KINDS = ['sensor', 'ballot', 'jammer', 'charge', 'relay', 'homegen', 'fieldgen', 'emitter', 'node', 'gate', 'reactor'];
function storyProps() {
  const parts = STORY_KINDS.map((k) => {
    const o = makeProp(k);
    if (k === 'node') o.position.y = 2.4; // (a flying ring: the mission hangs it 5+ m up; here just off the ground)
    return seat(o, { lift: k !== 'node', y: k === 'node' ? 0.4 : 0 });
  });
  const root = lineUp(parts, 3).root;
  root.traverse((o) => { if (o.userData.spin) o.userData.spin = 2; }); // (story.js turns them at dt * 2)
  return { root, update: animate(root) };
}

function launchComplex() {
  const o = makeProp('launch');
  const cols = o.userData.cols;
  const p = seat(o);
  const root = p.root;
  root.traverse((n) => { if (n.userData.spin) n.userData.spin = 2; });
  return { root, update: animate(root), cols };
}

// ---- the bases' own props: pylon, dishes, turrets, rocket ------------------------------------------
function signalPylon() {
  const m = makePylon();
  const p = seat(m.root);
  return { root: p.root, update: (dt, t) => { m.orb.scale.setScalar(1 + Math.sin(t * 4) * 0.12); } }; // (enemies.js:977)
}

function dishes() {
  const ds = [];
  const parts = [8, 12, 18, 26, 34].map((size, i) => {
    const d = makeDish(size, ['spacecom', 'vostok', 'kepler', 'meridian', 'daedalus'][i]); // (one in each faction's paint)
    ds.push({ ...d, speed: 0.6, ph: i });
    return seat(d.root);
  });
  const root = lineUp(parts, 4).root;
  return { root, update: (dt, t) => { for (const d of ds) { d.yaw.rotation.y += d.speed * dt; d.tilt.rotation.x = -0.6 + Math.sin(t * d.speed * 2 + d.ph) * 0.25; for (const l of d.lamps) l.visible = Math.sin(t * 4 + l.userData.seed) > -0.3; } } }; // (world.js update)
}

function turrets() {
  const hs = [];
  const parts = [['spacecom', 1.35], ['vostok', 1], ['daedalus', 1]].map(([f, s]) => {
    const t = makeTurret({ color: fcol(f) });
    if (s !== 1) t.root.scale.setScalar(s); // (the ILMB's guns are x1.35)
    hs.push(t.head);
    return seat(t.root);
  });
  const root = lineUp(parts, 4).root;
  return { root, update: (dt, t) => { hs.forEach((h, i) => { h.rotation.y = Math.sin(t * 0.7 + i * 2) * 1.2; }); } };
}

// The ILMB arrivals rocket (world.js updateRocket): it stands on its legs, then lifts off on its flame and comes back down.
function rocket() {
  const r = makeRocket();
  const p = seat(r.root);
  const y0 = r.root.position.y, cyc = 16;
  return {
    root: p.root,
    cols: [{ type: 'cyl', x: 0, z: 0, y0: 0, y1: 40, r: 4.6 }],
    update: (dt, t) => {
      const u = t % cyc;
      let alt = 0, flame = 0;
      if (u > 5 && u < 11) { const k = Math.sin(((u - 5) / 6) * Math.PI); alt = 30 * k * k; flame = 1; }
      r.root.position.y = y0 + alt;
      r.flame.visible = r.core.visible = flame > 0;
      r.flame.scale.set(1, flame * (0.8 + Math.random() * 0.4), 1);
    },
  };
}

// ---- settlement helpers (World.prototype pad / flag / lamp / tower / solarField / defensePylons, Traffic.prototype.shelter) ----
// They only ever call put / col / toWorld / mount (and rand, blinkers for the tower, glow and pool materials for the rest) on
// their World, so a bare stand-in with the real put and the real material helpers runs them as they are.
function stubWorld() {
  const W = World.prototype, rr = mulberry32(9);
  return {
    put: W.put, toWorld: W.toWorld, mount: W.mount, glowM: W.glowM, poolMat: W.poolMat, _mats: new Map(),
    col() {}, colAdd() {}, r: rr, rand: rr, blinkers: [], colliders: { query: () => [], contact: () => 0 },
  };
}
const stubLoc = (faction = 'meridian') => ({ group: new THREE.Group(), faction, pads: [], keep: [], dir: new THREE.Vector3(0, 1, 0) });

// (World.prototype.pad needs its own `this.put`; bound here)
const padFn = (w, ...a) => World.prototype.pad.call(w, ...a);

function landingPads() {
  const w = stubWorld(), loc = stubLoc();
  let x = 0;
  for (const [r, c] of [[12, 0xffd23f], [16, 0x2ec4ff], [13, 0x7dff6a]]) { x += r; padFn(w, loc, x, 0, r, c); x += r + 4; }
  return { root: seat(loc.group, { lift: false }).root };
}
function rocketPad() {
  const w = stubWorld(), loc = stubLoc();
  padFn(w, loc, 0, 0, 30, 0xff4f2e); // world.js:973, the launch pad under the ILMB's rocket
  return { root: seat(loc.group, { lift: false }).root };
}

function solarField() {
  const w = stubWorld(), loc = stubLoc();
  World.prototype.solarField.call(w, loc, 0, 0, 3, 8, 0); // world.js:1541 (a base's field)
  return { root: seat(loc.group, { lift: false }).root };
}

function furniture() {
  const w = stubWorld(), loc = stubLoc('vostok'), blinkers = w.blinkers;
  const items = [];
  const at = (fn) => { const l = stubLoc('vostok'); fn(l); l.group.updateMatrixWorld(true); items.push(seat(l.group)); };
  at((l) => World.prototype.flag.call(w, l, 0, 0, [0xff3b5c, 0xffd23f, 0xff3b5c], 20)); // a Vostok base's flag (world.js:1572)
  at((l) => World.prototype.flag.call(w, l, 0, 0, [0xc77dff, 0x111111, 0xc77dff], 20)); // a Daedalus one
  at((l) => World.prototype.lamp.call(w, l, 0, 0, 0xfff1b0, 9, 20)); // a town's lamp (world.js:872)
  at((l) => World.prototype.lamp.call(w, l, 0, 0, 0xff9f1c, 5, 14)); // a Rustmoon camp's
  at((l) => World.prototype.tower.call(w, l, 0, 0, 30, 1.6, 0xe0e0e0, 0x6aff9e)); // the bio-lab's beacon tower (world.js:1558)
  at((l) => World.prototype.defensePylons.call(w, l, [[0, 0]], 6)); // a free-standing settlement's gun pylon
  at((l) => {
    const traffic = { w: { put: World.prototype.put, col() {} }, groundY: () => 0 };
    Traffic.prototype.shelter.call(traffic, l, 0, 0, 0, 'SHUTTLE > ILMB', 0xff9f1c); // a transit stop (traffic.js:421)
  });
  const root = lineUp(items, 4).root;
  return {
    root,
    update: (dt, t) => { for (const b of blinkers) b.mat.color.copy(b.base).multiplyScalar(Math.sin(t * 3 + b.phase) > 0.2 ? 1 : 0.25); }, // (world.js update)
  };
}

function stretcher() {
  const m = makeStretcher();
  return { root: seat(m.root).root };
}

// What is left of a destroyed outpost with no wreck model of its own (territory.js, the rubble branch): ten broken blocks, and
// the farm dome's ring of foundation
function rubble() {
  const make = (seed, farm) => {
    const root = new THREE.Group();
    const rr = mulberry32(seed + 7);
    const mats = [toon(0x2a2433), toon(0x3a3550), toon(0x4a3f3a)];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.8 + rr() * 2.2, 0.3 + rr() * 1.2, 0.8 + rr() * 2.2), mats[i % 3]);
      m.position.set(-5 + rr() * 10, 0.3, -5 + rr() * 10);
      m.rotation.set(rr() * 0.6, rr() * 3, rr() * 0.6);
      ink(m, 0.04);
      root.add(m);
    }
    if (farm) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.3, 6, 24, Math.PI * 1.3).rotateX(Math.PI / 2), toon(0x55607a));
      ring.position.y = 0.3;
      root.add(ring);
    }
    return seat(root, { lift: false });
  };
  return { root: lineUp([make(3, false), make(9, true)], 4).root };
}

// ---- markers ----
const beamMat = (color, opacity, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, ...extra });

// the objective's light column (story.js setMarker, line 677), in each faction's colour
function objectivePillars() {
  const parts = FACTION_ORDER.map((f) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 160, 10, 1, true).translate(0, 80, 0), beamMat(fcol(f), 0.3, { side: THREE.DoubleSide }));
    return seat(m);
  });
  return { root: lineUp(parts, 6).root };
}

// an event's beacon with its sign (events.js marker, line 80)
function eventBeacons() {
  const parts = FACTION_ORDER.map((f) => {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 400, 10, 1, true), beamMat(fcol(f), 0.28));
    beam.position.y = 200;
    g.add(beam);
    const s = textSprite(FACTIONS[f].name.split(' ')[0].toUpperCase(), { color: '#ffffff', size: 64, scale: 0.7, bg: FACTIONS[f].color });
    s.position.y = 22;
    g.add(s);
    return seat(g);
  });
  return { root: lineUp(parts, 14).root };
}

// a dropped crate with its beam: pirates' cargo (enemies.js:772), Kade's mortar (kade.js:176), event pods (events.js:610)
function cargoDrops() {
  const spec = [[0xffd23f, 1.4, 0x2ee6ff, 0.6, 120, 0.35], [0x7dff3a, 1.6, 0x7dff3a, 0.6, 120, 0.35], [0x2ec4ff, 1.6, 0x2ec4ff, 0.7, 90, 0.4], [0xff9f1c, 1.6, 0xff9f1c, 0.7, 90, 0.4]];
  const crates = [];
  const parts = spec.map(([cc, size, bc, br, bh, bo]) => {
    const c = makeCrate(cc, size);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(br, br, bh, 8, 1, true), new THREE.MeshBasicMaterial({ color: bc, transparent: true, opacity: bo, depthWrite: false }));
    beam.position.y = bh / 2;
    c.add(beam);
    crates.push(c);
    return seat(c, { y: 0 });
  });
  const row = lineUp(parts, 6);
  return { root: row.root, update: (dt) => { for (const c of crates) c.rotation.y += dt * 1.2; } };
}

// the story leader's podium beacon: a faction ring and a soft column (story.js:395-420; the leader stands on the podium)
function leaderBeacons() {
  const parts = FACTION_ORDER.slice(0, 5).map((f) => {
    const fc = fcol(f);
    const g = new THREE.Group();
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.4, 16), toon(fc));
    ink(pod, 0.05);
    pod.position.y = 0.2;
    g.add(pod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.18, 8, 40), glow(fc));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.15;
    g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 40, 20, 1, true).translate(0, 20, 0), beamMat(fc, 0.16, { side: THREE.DoubleSide }));
    g.add(beam);
    return seat(g);
  });
  return { root: lineUp(parts, 4).root };
}

// the Daedalus phase-field experiment area (story.js:1448): a glowing ring 80 m across, lying on the ground
function phaseRing() {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(40, 0.6, 6, 64), glow(0xc77dff));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.6;
  return { root: seat(ring, { lift: false }).root };
}

// a survey site's ground ring (story.js siteRing, line 1548; flat ground, so every vertex at y = 0.5)
function surveyRing() {
  const r = 40, N = 96, HW = 1.25;
  const P = [], idx = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    for (const rr of [r - HW, r + HW]) P.push(Math.cos(a) * rr, 0.5, Math.sin(a) * rr);
  }
  for (let i = 0; i < N; i++) { const a0 = i * 2, a1 = ((i + 1) % N) * 2; idx.push(a0, a0 + 1, a1, a1, a0 + 1, a1 + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: FACTIONS.meridian.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  return { root: seat(mesh, { lift: false }).root };
}

// the zone walls: a red banded curtain round a hostile town's defence ring (enemies.js:170) and round a restricted base (world.js:1600)
function zoneWall(R, height, y, hostile) {
  return () => {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0xff2a4a) }, alert: { value: hostile ? 0.5 : 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: hostile
        ? 'uniform float time; uniform vec3 color; uniform float alert; varying vec2 vUv; varying vec3 vW; void main(){ float s = step(0.5, fract((vW.x+vW.z)*0.04 + vW.y*0.04 - time*0.3)); gl_FragColor = vec4(color, (0.1 + 0.22*s + alert*0.2) * (1.0 - vUv.y)); }'
        : `uniform float time; uniform vec3 color; uniform float alert; varying vec2 vUv; varying vec3 vW;
        void main(){ float s = step(0.5, fract((vW.x+vW.z)*0.04 + vW.y*0.04 - time*0.3));
          float fade = (1.0 - vUv.y);
          float a = (0.12 + 0.25*s + alert*0.25) * fade;
          gl_FragColor = vec4(color, a); }`,
    });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, height, 96, 1, true), mat);
    wall.position.y = y;
    const root = new THREE.Group();
    root.add(wall);
    return { root, update: (dt, t) => { mat.uniforms.time.value = t; } };
  };
}

// ---- the casino's lamp posts, fountain, chandelier and signs (casino.glb, tools/blender/build_casino.py): the boulevard's lamp post in pink and cyan and
// the plaza's scaled-down one, the plaza fountain (the chip turns, the water runs), a hall chandelier (hung 3.6 m up, turning) and the welcome and blackjack signs ----
function casinoProps() {
  const parts = [], movers = [];
  const scaled = (g, k) => { const w = new THREE.Group(); g.scale.setScalar(k); w.add(g); return w; };
  parts.push({ root: makeLampPost(0xff2e88), w: 3.2, d: 2 }, { root: makeLampPost(0x2ee6ff), w: 3.2, d: 2 }, { root: scaled(makeLampPost(0xff2e88), 0.62), w: 2.2, d: 1.4 });
  const fnt = makeFountain();
  movers.push((dt, t) => fnt.update(t, dt));
  parts.push({ root: fnt.root, w: 20, d: 20 });
  const ch = makeChandelier();
  ch.root.position.y = 3.6;
  movers.push((dt) => { ch.spin.rotation.y += dt * 0.3; });
  parts.push({ root: ch.root, w: 4, d: 4 });
  for (const [kind, y, w] of [['welcome_sign', 5, 10], ['wall_sign', 3, 8]]) {
    const sg = makeCasinoSign(kind);
    sg.root.position.y = y;
    parts.push({ root: sg.root, w, d: 0.5 });
  }
  return { root: lineUp(parts, 3).root, update: (dt, t) => { for (const f of movers) f(dt, t); } };
}

export default {
  id: 'props.markers',
  title: '04 · PROPS & MARKERS',
  items: [
    { id: 'prop.crate', label: 'CRATES', w: 33, d: 2, make: crates },
    { id: 'prop.loot-drop', label: 'LOOT PICKUPS', w: 33, d: 2.4, solid: false, make: loot },
    { id: 'prop.engine', label: 'SALVAGED ENGINE', w: 2.4, d: 2.4, make: engine },
    { id: 'prop.briefcase', label: 'CREDITS BRIEFCASE', w: 1.4, d: 1.4, make: briefcase },
    { id: 'prop.seismograph', label: 'SEISMOGRAPH', w: 2, d: 2.2, make: seismograph },
    { id: 'prop.vacuum-tube', label: 'VACUUM TUBES', w: 6, d: 1.3, make: tubes },
    { id: 'prop.casino-props', label: 'CASINO LAMPS · FOUNTAIN · CHANDELIER · SIGNS', w: 68, d: 21, make: casinoProps },
    { id: 'prop.slot-machines', label: 'SLOT MACHINES', w: 7 * 2.5 + 6 * 0.9, d: 1.8, make: slotMachines },
    { id: 'prop.plinko', label: 'PLINKO BOOTH & FRAME', w: 16.7, d: 9.2, make: plinko },
    { id: 'event.start-props', label: 'EVENT START PROPS', w: 82, d: 7.2, make: startProps },
    { id: 'story.props', label: 'STORY PROPS', w: 94, d: 17, make: storyProps },
    { id: 'prop.launch-complex', label: 'MERIDIAN LAUNCH COMPLEX', w: 39, d: 39, make: launchComplex },
    { id: 'prop.signal-pylon', label: 'SIGNAL PYLON', w: 7, d: 7, make: signalPylon },
    { id: 'prop.dish', label: 'DISHES', w: 110, d: 30, make: dishes },
    { id: 'prop.turret', label: 'TURRETS', w: 26, d: 9, make: turrets },
    { id: 'prop.rocket', label: 'ILMB ROCKET', w: 11, d: 11, make: rocket },
    { id: 'prop.landing-pads', label: 'LANDING PADS', w: 90, d: 33, solid: false, make: landingPads },
    { id: 'prop.rocket-pad', label: 'ROCKET PAD', w: 62, d: 62, solid: false, make: rocketPad },
    { id: 'prop.solar-field', label: 'SOLAR FIELD', w: 52, d: 16, make: solarField },
    { id: 'prop.site-furniture', label: 'FLAGS · LAMPS · TOWER · PYLON · STOP', w: 124, d: 40, make: furniture },
    { id: 'prop.stretcher', label: 'STRETCHER', w: 1, d: 2.7, make: stretcher },
    { id: 'prop.outpost-rubble', label: 'OUTPOST RUBBLE', w: 31, d: 14, make: rubble },
    { id: 'marker.objective-pillar', label: 'OBJECTIVE PILLARS', w: 40, d: 3, solid: false, make: objectivePillars },
    { id: 'marker.event-beacon', label: 'EVENT BEACONS', w: 204, d: 5, big: true, solid: false, make: eventBeacons },
    { id: 'marker.cargo-drop', label: 'CARGO DROPS', w: 20, d: 2, solid: false, make: cargoDrops },
    { id: 'marker.leader-beacon', label: 'LEADER PODIUM BEACONS', w: 45, d: 8, solid: false, make: leaderBeacons },
    { id: 'marker.phase-ring', label: 'PHASE-FIELD RING', w: 81, d: 81, solid: false, make: phaseRing },
    { id: 'marker.survey-ribbon', label: 'SURVEY RING', w: 83, d: 83, solid: false, make: surveyRing },
    { id: 'marker.hostile-wall', label: 'HOSTILE ZONE WALL', w: 250, d: 250, big: true, solid: false, make: zoneWall(125, 120, 40, true) },
    { id: 'marker.restricted-zone', label: 'RESTRICTED ZONE WALL', w: 520, d: 520, big: true, solid: false, make: zoneWall(260, 170, 15, false) },
  ],
};

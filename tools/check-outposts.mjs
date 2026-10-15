#!/usr/bin/env node
// Checks a static outposts GLB against the contract in docs/outpost-glb.md, before it is committed.
//
//   npm run check:outposts                       checks src/assets/outposts.glb
//   node tools/check-outposts.mjs file.glb [--kind mast --kind kiosk] [--json]
//
// Reads the GLB's JSON directly (no three.js), applying the same rules as the game (src/staticContract.js).
// Errors (exit 1) are things the game would mis-handle or fall back on; warnings are things it ignores.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { slotOf, roleOf, animOf, ROLES, SHAPES, stripSuffix, rootName } from '../src/staticContract.js';

const args = process.argv.slice(2);
const kinds = [];
let file = fileURLToPath(new URL('../src/assets/outposts.glb', import.meta.url)), asJson = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--kind') kinds.push(args[++i]);
  else if (args[i] === '--json') asJson = true;
  else file = args[i];
}

// GLTFLoader's node-name sanitising (PropertyBinding.sanitizeNodeName): the game sees these names
const gameName = (n) => String(n || '').replace(/\s/g, '_').replace(/[[\]./:]/g, '');

// ---- 4x4 column-major helpers (only what a node-relative transform needs) ----
const ID = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function local(n) {
  if (n.matrix) return n.matrix.slice();
  const [qx, qy, qz, qw] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [
    (1 - 2 * (qy * qy + qz * qz)) * sx, 2 * (qx * qy + qz * qw) * sx, 2 * (qx * qz - qy * qw) * sx, 0,
    2 * (qx * qy - qz * qw) * sy, (1 - 2 * (qx * qx + qz * qz)) * sy, 2 * (qy * qz + qx * qw) * sy, 0,
    2 * (qx * qz + qy * qw) * sz, 2 * (qy * qz - qx * qw) * sz, (1 - 2 * (qx * qx + qy * qy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const col = (m, c) => [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
function decompose(m) {
  const cx = col(m, 0), cy = col(m, 1), cz = col(m, 2), s = [len(cx), len(cy), len(cz)];
  return { pos: [m[12], m[13], m[14]], scale: s, yaxis: cy.map((x) => x / (s[1] || 1)), zaxis: cz.map((x) => x / (s[2] || 1)) };
}
const yawOf = (z) => Math.atan2(z[0], z[2]);

// ---- load ----
const buf = readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67 || buf.readUInt32LE(4) !== 2) { console.error(`${file}: not a GLB 2.0 file`); process.exit(2); }
const j = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
const nodes = j.nodes || [], roots = (j.scenes?.[j.scene ?? 0]?.nodes || []).map((i) => ({ i, name: gameName(nodes[i].name) }));
const byRoot = new Map(roots.map((r) => [r.name, r.i]));
const report = { file, kinds: {}, errors: [], warnings: [] };
const E = (m) => report.errors.push(m), W = (m) => report.warnings.push(m);

for (const k of ['images', 'textures', 'skins', 'animations', 'cameras']) if (j[k]?.length) W(`${j[k].length} ${k} in the file: ignored by the game`);
if (j.extensionsRequired?.length) E(`required extensions ${j.extensionsRequired.join(', ')}: the game's loader may not support them`);
else if (j.extensionsUsed?.length) W(`extensions used: ${j.extensionsUsed.join(', ')}`);

const wanted = kinds.length ? kinds : roots.map((r) => r.name).filter((n) => !n.endsWith('_wreck'));
if (!wanted.length) E('no root nodes in the scene');

for (const kind of wanted) {
  for (const wreck of [false, true]) {
    const name = rootName(kind, wreck);
    if (!byRoot.has(name)) { (wreck ? W : E)(`no root node "${name}"${wreck ? ': its wreck will stay Kit-built' : ''}`); continue; }
    report.kinds[name] = checkRoot(name, byRoot.get(name), wreck);
  }
}

function checkRoot(name, rootIdx, wreck) {
  const e = (m) => E(`${name}: ${m}`), w = (m) => W(`${name}: ${m}`);
  const root = nodes[rootIdx];
  if (root.mesh !== undefined) w('the root node is a mesh: use an empty');
  const st = { meshes: 0, verts: 0, tris: 0, materials: {}, cols: [], hits: [], points: {}, pointPos: {}, texts: 0, anims: { flag: 0, blink: 0, spin: 0 }, buckets: new Set(), suffixed: new Set(), inkMeshes: 0 };
  const names = new Map();
  const walk = (idx, m, group) => {
    const n = nodes[idx], nm = gameName(n.name), x = n.extras || {};
    if (nm) names.set(nm, (names.get(nm) || 0) + 1);
    const mm = mul(m, local(n));
    const anim = n.mesh === undefined ? animOf(x) : null;
    if (n.mesh === undefined && x.anim !== undefined && !anim) e(`node "${n.name}": unknown anim "${x.anim}" (flag, blink or spin)`);
    let g = group; // (the bake group the meshes below land in: the static body, or one animated node)
    if (anim) {
      st.anims[anim]++;
      if (group === 'body') g = `${anim}:${idx}`; else w(`animated node "${n.name}" inside another: treated as part of it`);
    }
    const role = n.mesh === undefined ? roleOf(nm, x) : null;
    if (n.mesh === undefined && x.role !== undefined && !ROLES.includes(x.role)) e(`node "${n.name}": unknown role "${x.role}"`);
    if (role) { gameplay(role, n, mm, x, e, w, st); return; }
    if (n.mesh !== undefined) mesh(n, x, g, e, w, st);
    for (const c of n.children || []) walk(c, mm, g);
  };
  for (const c of root.children || []) walk(c, ID(), 'body');
  for (const [nm, c] of names) if (c > 1) w(`${c} nodes named "${nm}" (names should be unique)`);
  if (!st.meshes) e('no meshes');
  const cnt = (r) => st.points[r] || 0;
  if (!wreck && !cnt('raid')) e('no raid point: the outpost could not be raided');
  if (wreck && cnt('raid')) w('a wreck should have no raid point');
  for (const r of ['smoke', 'drop']) { if (!cnt(r)) w(`no ${r} point: the game falls back to a default`); if (cnt(r) > 1) w(`${cnt(r)} ${r} points: the last one wins`); }
  if (cnt('raid') > 1) w(`${cnt('raid')} raid points: the last one wins`);
  if (!st.hits.length) w('no hit boxes: blast damage falls back to the distance from the outpost centre');
  if (!st.cols.length) w('no colliders: you could walk through it');
  return {
    meshes: st.meshes, verts: st.verts, tris: st.tris, inkMeshes: st.inkMeshes, draws: st.buckets.size,
    materials: st.materials, cols: st.cols, hits: st.hits, points: st.points, pointPos: st.pointPos, texts: st.texts, anims: st.anims,
  };
}

function mesh(n, x, group, e, w, st) {
  const md = j.meshes[n.mesh], nm = n.name;
  if (md.primitives.length !== 1) e(`mesh "${nm}" has ${md.primitives.length} materials: use one per mesh`);
  for (const p of md.primitives) {
    if (p.mode !== undefined && p.mode !== 4) { e(`mesh "${nm}": not triangles`); continue; }
    if (p.attributes.NORMAL === undefined) e(`mesh "${nm}": no normals`);
    if (p.indices === undefined) w(`mesh "${nm}": not indexed`);
    for (const a of ['TEXCOORD_0', 'COLOR_0', 'JOINTS_0']) if (p.attributes[a] !== undefined) { w(`mesh "${nm}": ${a} is ignored`); break; }
    st.verts += j.accessors[p.attributes.POSITION].count;
    st.tris += (p.indices !== undefined ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count) / 3;
    const mat = p.material !== undefined ? j.materials[p.material] : null;
    if (!mat) { w(`mesh "${nm}": no material (renders white)`); continue; }
    const slot = slotOf(mat.name), side = mat.doubleSided ? 'ds' : 'fs';
    const label = stripSuffix(mat.name) || '(unnamed)';
    if (!mat.name) w('a material has no name');
    if (stripSuffix(mat.name) !== mat.name && !st.suffixed.has(mat.name)) { st.suffixed.add(mat.name); w(`material "${mat.name}": the ${mat.name.slice(stripSuffix(mat.name).length)} suffix is ignored`); }
    const pbr = mat.pbrMetallicRoughness || {};
    if (pbr.baseColorTexture) w(`material "${mat.name}": a texture: ignored (flat base colour only)`);
    if (mat.alphaMode === 'BLEND' || mat.alphaMode === 'MASK') w(`material "${mat.name}": ${mat.alphaMode} is not supported: renders opaque`);
    if (mat.emissiveFactor && mat.emissiveFactor.some((v) => v > 0)) w(`material "${mat.name}": emission is ignored (use a glow* material for unlit)`);
    st.materials[label] = { treatment: `${slot.faction ? 'faction ' : ''}${slot.kind}`, color: slot.faction ? null : (pbr.baseColorFactor || [1, 1, 1, 1]).slice(0, 3).map((v) => +v.toFixed(3)), doubleSided: !!mat.doubleSided };
    st.buckets.add(`${group}|${slot.kind}|${side}`);
  }
  st.meshes++;
  if (x.ink !== undefined && !(typeof x.ink === 'number' && x.ink >= 0)) e(`mesh "${nm}": ink must be a number >= 0`);
  if (x.ink > 0) { st.inkMeshes++; st.buckets.add(`${group}|ink`); }
}

function gameplay(role, n, m, x, e, w, st) {
  const d = decompose(m), nm = n.name, [sx, sy, sz] = d.scale, r3 = (v) => +v.toFixed(4);
  if (role === 'col' || role === 'hit') {
    const shape = role === 'hit' ? 'box' : (x.shape === undefined ? 'box' : x.shape);
    if (!SHAPES.includes(shape)) { e(`collider "${nm}": unknown shape "${shape}" (box, cyl or sphere)`); return; }
    if (![sx, sy, sz].every((v) => v > 1e-6 && Number.isFinite(v))) e(`${role} "${nm}": zero or invalid scale (scale = half-extents)`);
    if (shape === 'box' && d.yaxis[1] < 0.9998) w(`${role} "${nm}" is tilted: only its turn about the vertical is used`);
    if (shape === 'cyl' && Math.abs(sx - sz) > 0.01 * Math.max(sx, sz)) w(`cylinder "${nm}": scale x and z differ: radius is scale x`);
    const rec = shape === 'box'
      ? { type: 'box', hx: r3(sx), hy: r3(sy), hz: r3(sz), x: r3(d.pos[0]), y: r3(d.pos[1]), z: r3(d.pos[2]), yaw: r3(yawOf(d.zaxis)) }
      : shape === 'cyl' ? { type: 'cyl', r: r3(sx), y0: r3(d.pos[1] - sy), y1: r3(d.pos[1] + sy), x: r3(d.pos[0]), z: r3(d.pos[2]) }
        : { type: 'sphere', r: r3(sx), x: r3(d.pos[0]), y: r3(d.pos[1]), z: r3(d.pos[2]) };
    if (role === 'hit') { delete rec.type; st.hits.push(rec); } else st.cols.push(rec);
    if (d.pos.some((v) => !Number.isFinite(v))) e(`${role} "${nm}": invalid position`);
  } else if (role === 'text') {
    if (typeof x.str !== 'string' || !x.str) e(`text "${nm}": needs a string property str`);
    if (!(Number(x.w) > 0)) e(`text "${nm}": needs a number property w > 0 (the board width in metres)`);
    st.texts++;
  } else { st.points[role] = (st.points[role] || 0) + 1; st.pointPos[role] = d.pos.map(r3); }
}

// ---- report ----
if (asJson) console.log(JSON.stringify(report, null, 1));
else {
  console.log(`${file}  (${(buf.length / 1024).toFixed(0)} KB)`);
  for (const [name, k] of Object.entries(report.kinds)) {
    const pts = Object.entries(k.points).map(([r, c]) => `${r}${c > 1 ? '×' + c : ''}`).join(' ');
    console.log(`  ${name}: ${k.meshes} meshes (${k.verts} verts, ${k.tris} tris) -> about ${k.draws} draw calls; ${k.cols.length} colliders, ${k.hits.length} hit boxes, ${k.texts} signs, points: ${pts || 'none'}; moving: ${k.anims.flag} flag, ${k.anims.blink} blink, ${k.anims.spin} spin`);
    const mats = Object.entries(k.materials).map(([m, v]) => `${m}${v.doubleSided ? '(2s)' : ''}→${v.treatment}`);
    console.log(`    materials: ${mats.join(', ')}`);
  }
  for (const m of report.errors) console.log(`ERROR  ${m}`);
  for (const m of report.warnings) console.log(`warn   ${m}`);
  console.log(report.errors.length ? `\n${report.errors.length} error(s), ${report.warnings.length} warning(s)` : `\nok: ${report.warnings.length} warning(s)`);
}
process.exit(report.errors.length ? 1 : 0);

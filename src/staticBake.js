import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { inkMat, vcMaterial, paintVertices, dropFloorFaces } from './toon.js';
import { slotOf, roleOf, animOf, SHAPES } from './staticContract.js';

// Static GLBs (outposts.glb): a Blender-authored structure turned into what the Kit (outpostModels.js)
// makes: { root, cols, hits, raid, smoke, drop } in the structure's own frame. The contract is written
// up for artists in docs/outpost-glb.md; the rules both sides share are in staticContract.js.
//
// Two steps, so a structure that is met in several faction colours is only parsed once:
//   parseStaticGlb(scene)         the loaded glTF scene -> one neutral `asset` per root node
//   bakeStatic(asset, { color })  an asset -> the template for one faction colour
//
// Like the runner and ship bakes (models.js) only geometry is read: positions, normals, the index,
// each mesh's material name and flat base colour, and the `ink` extra. The game's own toon material
// does the shading. Unlike them the result is vertex-coloured, so a structure of hundreds of Blender
// objects bakes to a handful of meshes (one lit, one unlit, one outline hull), as Kit.finish does.

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _z = new THREE.Vector3();
const ZAXIS = new THREE.Vector3(0, 0, 1), YAXIS = new THREE.Vector3(0, 1, 0);

// a rotation's turn about +y (the direction its +z axis points in the ground plane)
const yawOf = (q) => { _z.copy(ZAXIS).applyQuaternion(q); return Math.atan2(_z.x, _z.z); };

// ---------------------------------------------------------------- parse
export function parseStaticGlb(scene, { warn = console.warn } = {}) {
  scene.updateMatrixWorld(true);
  const assets = new Map();
  for (const root of scene.children) {
    if (!root.name) continue;
    const warnRoot = (m) => warn(`${root.name}: ${m}`);
    assets.set(root.name, parseRoot(root, warnRoot));
  }
  return assets;
}

function parseRoot(root, warn) {
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const asset = { name: root.name, groups: [], cols: [], hits: [], raid: null, smoke: null, drop: null, texts: [] };
  // groups[0] is the static body (frame: the root). Each animated node adds a group in its own frame.
  const body = { anim: null, matrix: null, parts: [] };
  asset.groups.push(body);
  const walk = (o, group, groupInv) => {
    for (const c of o.children) {
      const anim = c.isMesh ? null : animOf(c.userData);
      if (anim) {
        if (group !== body) { warn(`animated node "${c.name}" inside another animated node: treated as part of it`); walk(c, group, groupInv); continue; }
        const g = { anim, matrix: new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld), parts: [] };
        asset.groups.push(g);
        walk(c, g, new THREE.Matrix4().copy(c.matrixWorld).invert());
        continue;
      }
      const role = c.isMesh ? null : roleOf(c.name, c.userData);
      if (role) { gameplay(asset, role, c, inv, warn); continue; }
      if (c.isMesh) addPart(group, c, groupInv, warn);
      walk(c, group, groupInv);
    }
  };
  walk(root, body, inv);
  if (!body.parts.length) warn('no meshes');
  return asset;
}

function addPart(group, mesh, groupInv, warn) {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const src = mesh.geometry;
  if (!src.attributes.position || !src.attributes.normal) { warn(`mesh "${mesh.name}" has no normals: skipped`); return; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', src.attributes.position.clone());
  geo.setAttribute('normal', src.attributes.normal.clone());
  if (src.index) geo.setIndex(src.index.clone());
  else {
    const n = src.attributes.position.count, idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  const rel = new THREE.Matrix4().multiplyMatrices(groupInv, mesh.matrixWorld);
  geo.applyMatrix4(rel);
  if (rel.determinant() < 0) { // (a mirrored node: baking it into the vertices turns its faces inside out)
    const ix = geo.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  const ink = Number(mesh.userData.ink ?? (mesh.parent && mesh.parent.userData.ink)) || 0;
  group.parts.push({
    geo,
    slot: slotOf(mat.name),
    side: mat.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide,
    color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
    ink: ink > 0 ? ink : 0,
  });
}

// An empty with a role: collider, blast box, a point, or a sign face. Frame: the root's.
function gameplay(asset, role, node, inv, warn) {
  const m = new THREE.Matrix4().multiplyMatrices(inv, node.matrixWorld);
  m.decompose(_p, _q, _s);
  const sx = Math.abs(_s.x), sy = Math.abs(_s.y), sz = Math.abs(_s.z);
  const u = node.userData;
  if (role === 'col' || role === 'hit') {
    const shape = role === 'hit' ? 'box' : (SHAPES.includes(u.shape) ? u.shape : 'box');
    if (u.shape !== undefined && role === 'col' && !SHAPES.includes(u.shape)) warn(`collider "${node.name}": unknown shape "${u.shape}", using box`);
    if (shape === 'box' && _z.copy(YAXIS).applyQuaternion(_q).y < 0.9998) warn(`${role} "${node.name}" is tilted: only its turn about the vertical is used`);
    if (shape === 'box') {
      const b = { hx: sx, hy: sy, hz: sz, x: _p.x, y: _p.y, z: _p.z, yaw: yawOf(_q) };
      if (role === 'hit') asset.hits.push(b); else asset.cols.push({ type: 'box', ...b });
    } else if (shape === 'cyl') asset.cols.push({ type: 'cyl', r: sx, y0: _p.y - sy, y1: _p.y + sy, x: _p.x, z: _p.z });
    else asset.cols.push({ type: 'sphere', r: sx, x: _p.x, y: _p.y, z: _p.z });
  } else if (role === 'raid' || role === 'smoke' || role === 'drop') {
    if (asset[role]) warn(`more than one "${role}" point: the last one wins`);
    asset[role] = _p.clone();
  } else if (role === 'text') {
    if (typeof u.str !== 'string' || !(Number(u.w) > 0)) { warn(`text "${node.name}" needs str and w: skipped`); return; }
    asset.texts.push({
      str: u.str, w: Number(u.w), fg: u.fg, bg: u.bg, stroke: u.stroke,
      back: u.back === undefined ? true : Number(u.back) !== 0, off: u.off === undefined ? 0.17 : Number(u.off), rz: Number(u.rz) || 0,
      x: _p.x, y: _p.y, z: _p.z, yaw: yawOf(_q),
    });
  }
}

// ---------------------------------------------------------------- bake
// The shell of an outline: a copy of the geometry pushed out along its smoothed normals (normals are
// averaged over the vertices that share a position, so seams stay closed), as models.js does for the runner.
function inkShell(geo, t) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, n = pos.count;
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const sum = new Map();
  for (let i = 0; i < n; i++) {
    const k = key(i);
    const s = sum.get(k) || [0, 0, 0];
    s[0] += nor.getX(i); s[1] += nor.getY(i); s[2] += nor.getZ(i);
    sum.set(k, s);
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = sum.get(key(i)), l = Math.hypot(s[0], s[1], s[2]) || 1;
    out[i * 3] = pos.getX(i) + (s[0] / l) * t; out[i * 3 + 1] = pos.getY(i) + (s[1] / l) * t; out[i * 3 + 2] = pos.getZ(i) + (s[2] / l) * t;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  g.setIndex(geo.index.clone());
  return g;
}

// stand-ins vcMaterial() derives its shared vertex-coloured materials from (it reads type and side only)
const PROTO = new Map();
const proto = (kind, side) => {
  const k = `${kind}|${side}`;
  if (!PROTO.has(k)) PROTO.set(k, kind === 'glow' ? new THREE.MeshBasicMaterial({ side }) : new THREE.MeshToonMaterial({ side }));
  return PROTO.get(k);
};

// parts -> merged meshes: one vertex-coloured mesh per (lit | unlit, side), plus one outline hull.
// `fixed` is the static body, standing on the ground (y = 0): like a Kit built onGround, the downward-facing
// faces lying on it (and their outline shells') can never be seen, so they are left out (toon.dropFloorFaces).
function bakeParts(parts, faction, fixed) {
  const buckets = new Map(), shells = [], out = [];
  for (const p of parts) {
    const g = p.geo.clone();
    paintVertices(g, p.slot.faction ? faction : p.color);
    const k = `${p.slot.kind}|${p.side}`;
    if (!buckets.has(k)) buckets.set(k, { kind: p.slot.kind, side: p.side, list: [] });
    buckets.get(k).list.push(fixed && p.side === THREE.FrontSide ? dropFloorFaces(g) : g);
    if (p.ink) { const sh = inkShell(p.geo, p.ink); shells.push(fixed ? dropFloorFaces(sh) : sh); }
  }
  for (const b of buckets.values()) {
    const m = new THREE.Mesh(mergeGeometries(b.list), vcMaterial(proto(b.kind, b.side)));
    // (a moving part only casts: like the Kit's flags and dishes, a thin double-sided cloth that also received
    // shadow would speckle with its own)
    m.castShadow = b.kind === 'toon';
    m.receiveShadow = fixed && b.kind === 'toon';
    if (fixed) m.userData.kitMesh = true; // (fixed in its structure's frame: world.mergeLocation may fold it in)
    for (const g of b.list) g.dispose();
    out.push(m);
  }
  if (shells.length) {
    const h = new THREE.Mesh(mergeGeometries(shells), inkMat);
    h.userData.isInk = true;
    if (fixed) h.userData.kitMesh = true;
    h.castShadow = h.receiveShadow = false;
    for (const g of shells) g.dispose();
    out.push(h);
  }
  return out;
}

// asset -> template. `textMat(str, fg, bg, stroke)` makes the canvas-textured material of a sign face
// (outpostModels.js owns those, so signs are drawn the same way as the Kit's).
export function bakeStatic(asset, { color, textMat }) {
  const faction = new THREE.Color(color);
  const root = new THREE.Group();
  root.name = `static:${asset.name}`;
  for (const g of asset.groups) {
    if (!g.anim) { for (const m of bakeParts(g.parts, faction, true)) root.add(m); continue; }
    // holder (placed, turned) > pivot (what territory.js swings / spins / blinks) > the part's meshes
    const holder = new THREE.Group(), pivot = new THREE.Group();
    g.matrix.decompose(holder.position, holder.quaternion, holder.scale);
    pivot.userData[g.anim] = true;
    for (const m of bakeParts(g.parts, faction, false)) pivot.add(m);
    holder.add(pivot);
    root.add(holder);
  }
  for (const t of asset.texts) {
    const mat = textMat(t.str, t.fg || '#ffd23f', t.bg || '#241a3a', t.stroke || '#120a1e');
    const geo = new THREE.PlaneGeometry(t.w, t.w / mat.userData.aspect);
    for (const side of t.back ? [0, 1] : [0]) {
      const lz = side ? -1 : 1, m = new THREE.Mesh(geo, mat);
      m.position.set(t.x + Math.sin(t.yaw) * t.off * lz, t.y, t.z + Math.cos(t.yaw) * t.off * lz);
      m.rotation.set(0, t.yaw + (side ? Math.PI : 0), side ? -t.rz : t.rz);
      root.add(m);
    }
  }
  return {
    root,
    cols: asset.cols.map((c) => ({ ...c })),
    hits: asset.hits.map((h) => ({ ...h })),
    raid: asset.raid ? asset.raid.clone() : null,
    smoke: asset.smoke ? asset.smoke.clone() : null,
    drop: asset.drop ? asset.drop.clone() : null,
  };
}

// Dev-only model viewer: renders one model through the game's comic post pass on a turntable.
import * as THREE from 'three';
import { loadFonts } from '../src/fonts.js';
import { loadRunnerParts, loadShipParts, makeShuttle, makeFreighter, makeHoverCar, makeApc, makeLandTrain, makeTowerCrane, CRANE_TROLLEY_MIN, CRANE_TROLLEY_SPAN } from '../src/models.js';
import { outpostTemplate } from '../src/outpostModels.js';
import { loadOutpostParts, GLB_KINDS } from '../src/outpostGlb.js';
import { makeChimera, makeMite, LIVING, MODIFIERS, spliceGenes } from '../src/chimera.js';
import { ComicPost } from '../src/post.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);

await Promise.all([loadFonts(), loadRunnerParts(), loadShipParts(), loadOutpostParts({ force: true })]);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(Q.get('bg') || '#2a2440');
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 3000);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
sun.position.set(30, 60, 40);
sun.castShadow = true;
scene.add(sun, new THREE.HemisphereLight(0x9a8cff, 0x40305a, 0.85));
const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 48).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x8a8398 }));
ground.receiveShadow = true;
scene.add(ground);
const post = new ComicPost(renderer, camera);

// ---- outposts: what a template holds, drawn: colliders, blast boxes and the gameplay points ----
const lineMat = (c) => new THREE.LineBasicMaterial({ color: c, depthTest: false, transparent: true });
function outpostOverlay(t) {
  const g = new THREE.Group();
  const edges = (geo, mat) => { const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat); l.renderOrder = 10; return l; };
  for (const c of t.cols) {
    let l;
    if (c.type === 'box') { l = edges(new THREE.BoxGeometry(c.hx * 2, c.hy * 2, c.hz * 2), lineMat(0x2ee6ff)); l.position.set(c.x, c.y, c.z); l.rotation.y = c.yaw; }
    else if (c.type === 'cyl') { l = edges(new THREE.CylinderGeometry(c.r, c.r, c.y1 - c.y0, 20), lineMat(0x2ee6ff)); l.position.set(c.x, (c.y0 + c.y1) / 2, c.z); }
    else { l = edges(new THREE.SphereGeometry(c.r, 12, 8), lineMat(0x2ee6ff)); l.position.set(c.x, c.y, c.z); }
    g.add(l);
  }
  for (const h of t.hits) {
    const l = edges(new THREE.BoxGeometry(h.hx * 2, h.hy * 2, h.hz * 2), lineMat(0xff9f1c));
    l.position.set(h.x, h.y, h.z); l.rotation.y = h.yaw;
    g.add(l);
  }
  const mark = (p, color, r) => { if (!p) return; const l = edges(new THREE.OctahedronGeometry(r), lineMat(color)); l.position.copy(p); g.add(l); };
  mark(t.raid, 0x7dff3a, 1.2); mark(t.smoke, 0xff2a4a, 1.2); mark(t.drop, 0x5a8bff, 1.2);
  return g;
}
// Does template b hold the same gameplay data as template a (within tol metres)? A box may be written
// as (hx, hz, yaw) or turned a quarter: both count as the same box.
function outpostParity(a, b, tol = 0.01) {
  const same = (x, y) => Math.abs(x - y) <= tol;
  const turn = (p, q) => { const d = Math.abs(Math.sin(p - q)); return d <= tol; };
  const eq = {
    box: (p, q) => same(p.x, q.x) && same(p.y, q.y) && same(p.z, q.z) && same(p.hy, q.hy) &&
      ((same(p.hx, q.hx) && same(p.hz, q.hz) && turn(p.yaw, q.yaw)) || (same(p.hx, q.hz) && same(p.hz, q.hx) && turn(p.yaw + Math.PI / 2, q.yaw))),
    cyl: (p, q) => same(p.r, q.r) && same(p.y0, q.y0) && same(p.y1, q.y1) && same(p.x, q.x) && same(p.z, q.z),
    sphere: (p, q) => same(p.r, q.r) && same(p.x, q.x) && same(p.y, q.y) && same(p.z, q.z),
  };
  const lists = (what, xs, ys, typed) => {
    const left = ys.slice(), miss = [];
    for (const p of xs) {
      const k = left.findIndex((q) => (typed ? p.type === q.type : true) && eq[typed ? p.type : 'box'](p, q));
      if (k < 0) miss.push(p); else left.splice(k, 1);
    }
    return { what, of: xs.length, matched: xs.length - miss.length, missing: miss, extra: left };
  };
  const pt = (what, p, q) => { const ok = !!(p && q && p.distanceTo(q) <= tol); return { what, of: p ? 1 : 0, matched: ok ? 1 : 0, missing: p && !ok ? [p] : [], extra: q && !ok ? [q] : [] }; };
  const rows = [lists('colliders', a.cols, b.cols, true), lists('hit boxes', a.hits, b.hits, false), pt('raid', a.raid, b.raid), pt('smoke', a.smoke, b.smoke), pt('drop', a.drop, b.drop)];
  return { ok: rows.every((r) => !r.missing.length && !r.extra.length), rows };
}
function outpostStats(t) {
  let draws = 0, tris = 0, verts = 0;
  t.root.traverse((o) => {
    if (!o.isMesh) return;
    draws++;
    verts += o.geometry.attributes.position.count;
    tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  return { draws, verts, tris };
}

const m = Q.get('m') || 'shuttle';
let model, rig = null, anim = null, height = 2;
if (m === 'shuttle' || m === 'freighter') {
  rig = m === 'shuttle' ? makeShuttle({ stripe: Q.has('stripe') ? parseInt(Q.get('stripe'), 16) : undefined }) : makeFreighter({});
  model = rig.root;
  rig.setGear(num('gear', 1));
  rig.setRamp(num('ramp', 0));
  model.position.y = rig.gearH * num('gear', 1) + (num('gear', 1) < 1 ? 4 : 0);
  height = m === 'shuttle' ? 8 : 20;
} else if (m === 'apc') {
  // &turret=<yaw rad>&barrel=<elevation rad> to pose it; the faction colours as in the game
  const apc = makeApc({ color: Q.has('color') ? parseInt(Q.get('color'), 16) : 0x6b6f78, trim: Q.has('trim') ? parseInt(Q.get('trim'), 16) : 0xff3b5c });
  apc.turret.rotation.y = num('turret', 0);
  apc.barrel.rotation.x = -num('barrel', 0);
  model = apc.root;
  model.scale.setScalar(1.35);
  model.position.y = 0.2;
  height = 4;
} else if (m === 'landtrain') {
  // &type=moonliner|prospector  &faction=spacecom|vostok|kepler|meridian  &cars=pax,pax,pax | tank,cargo,blast
  // &unit=0 for the tractor alone, 1..n for that trailer alone
  const lt = makeLandTrain({ faction: Q.get('faction') || 'kepler', type: Q.get('type') || 'moonliner', cars: Q.has('cars') ? Q.get('cars').split(',').filter(Boolean) : undefined });
  model = new THREE.Group();
  const only = Q.has('unit') ? num('unit', 0) : -1; // (alone: the camera frames just that unit)
  if (only <= 0) model.add(lt.root);
  lt.trailers.forEach((t, i) => {
    t.root.position.set(0, 0, only > 0 ? 0 : -9.9 * (i + 1));
    t.rod.scale.z = 1.5;
    t.eye.position.z = 1.5;
    if (only < 0 || only === i + 1) model.add(t.root);
  });
  height = 3;
} else if (m === 'crane') {
  // &h=34 (the mast, m; the model is 34)  &slew=<rad>  &trolley=0..1 (along its run)  &rope=<m of rope>  &color=hex  &faction=kepler|meridian|spacecom|vostok (the cargo)
  const c = makeTowerCrane({ color: Q.has('color') ? parseInt(Q.get('color'), 16) : 0xffd23f, faction: Q.get('faction') || 'kepler', h: num('h', 34) });
  const sc = num('h', 34) / 34;
  c.slew.rotation.y = num('slew', 0);
  c.trolley.position.x = (CRANE_TROLLEY_MIN + CRANE_TROLLEY_SPAN * num('trolley', 0.5)) * sc;
  c.cable.scale.y = num('rope', 14);
  c.hook.position.y = (-0.7 - num('rope', 14)) * sc;
  model = c.root;
  height = 25;
} else if (m === 'hovercar') {
  model = makeHoverCar({}).root;
  model.position.y = 2;
} else if (m === 'lineup') {
  // &list=body/legs/head[/extra][/mod+mod],...  laid out in a row
  model = new THREE.Group();
  const anims = [];
  const list = (Q.get('list') || 'person/person/person,mite/mite/mite,car/car/car,junkbot/junkbot/junkbot,sapling/sapling/sapling,alien/alien/alien,pirate/pirate/pirate,voidling/voidling/voidling').split(',');
  list.forEach((spec, i) => {
    const [body, legs, head, extra, mods] = spec.split('/');
    const genes = { seed: 11 + i, body, legs, head, extraHead: extra && extra !== '-' ? extra : null, mods: (mods || '').split(/[+ ]/).filter(Boolean), size: 1.0, tint: { person: 0xff9f1c, voidling: 0xc77dff, mite: 0xb8e986, car: 0xff7ad9, pirate: 0x3a2b4f, sapling: 0x5fbf4a, junkbot: 0xffb347, alien: 0x7dd87a }[body] };
    const c = makeChimera(genes);
    c.root.position.x = (i - (list.length - 1) / 2) * 3.2;
    model.add(c.root);
    anims.push(c.anim);
  });
  anim = (t, sp) => anims.forEach((a) => a(t, sp));
} else if (m === 'outpost') {
  // &kind=mast  &src=kit|glb|both (default both, side by side)  &wreck=1  &color=rrggbb  &cols=0 hides the colliders
  const kind = Q.get('kind') || 'mast', wreck = Q.get('wreck') === '1', color = Q.has('color') ? parseInt(Q.get('color'), 16) : 0x2ec4ff;
  const srcs = Q.get('src') === 'kit' ? ['kit'] : Q.get('src') === 'glb' ? ['glb'] : ['kit', 'glb'];
  model = new THREE.Group();
  const lines = [];
  const stats = {}, tpls = {};
  srcs.forEach((s, i) => {
    let t;
    try { t = outpostTemplate(kind, color, 0, wreck, s); } catch (e) { lines.push(`${s}: ${e.message}${GLB_KINDS.has(kind) ? '' : ' (not a GLB kind: see GLB_KINDS in src/outpostGlb.js)'}`); return; }
    const g = new THREE.Group();
    g.position.x = (i - (srcs.length - 1) / 2) * 70;
    g.add(t.root.clone());
    if (Q.get('cols') !== '0') g.add(outpostOverlay(t));
    model.add(g);
    tpls[s] = t;
    stats[s] = outpostStats(t);
    lines.push(`${s}: ${stats[s].draws} draws, ${stats[s].tris} tris, ${t.cols.length} colliders, ${t.hits.length} hit boxes`);
  });
  if (tpls.kit && tpls.glb) {
    const par = outpostParity(tpls.kit, tpls.glb);
    window.outpostParity = par;
    lines.push(`GLB vs Kit gameplay data: ${par.ok ? 'same' : 'DIFFERENT'} (${par.rows.map((r) => `${r.what} ${r.matched}/${r.of}${r.extra.length ? ' +' + r.extra.length : ''}`).join(', ')})`);
  }
  document.getElementById('ui').innerHTML = `${kind}${wreck ? ' (wreck)' : ''}<br>${lines.join('<br>')}<br>cyan = collider, orange = blast box, green = raid, red = smoke, blue = drop`;
  const swing = [];
  model.traverse((o) => { if (o.userData.spin || o.userData.blink || o.userData.flag) swing.push(o); });
  anim = (t) => { // (what territory.js does to a placed outpost)
    for (const o of swing) {
      if (o.userData.spin) o.rotation.y = t * 0.6;
      if (o.userData.blink) o.visible = Math.sin(t * 4) > -0.3;
      if (o.userData.flag) o.rotation.y = Math.sin(t * 2) * 0.25;
    }
  };
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, far: 400 });
  sun.shadow.camera.updateProjectionMatrix();
  window.outpostStats = stats;
} else {
  let genes;
  if (m === 'mite') genes = null;
  else if (Q.has('parts')) {
    const [body, legs, head, extraHead] = Q.get('parts').split(',');
    genes = { seed: num('seed', 1) | 0, body, legs, head, extraHead: extraHead || null, mods: (Q.get('mods') || '').split(',').filter(Boolean), size: num('size', 1.1), tint: Q.has('tint') ? parseInt(Q.get('tint'), 16) : 0xff9f1c };
  } else {
    const rr = (() => { let s = num('seed', 7) | 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    const items = [{ kind: LIVING[Math.floor(rr() * LIVING.length)] }, { kind: LIVING[Math.floor(rr() * LIVING.length)] }];
    if (rr() < 0.5) items.push({ kind: Object.keys(MODIFIERS)[Math.floor(rr() * 10)] });
    genes = spliceGenes(items, num('seed', 7) | 0);
  }
  const c = genes ? makeChimera(genes) : makeMite();
  model = c.root;
  anim = c.anim;
  height = c.height;
  document.getElementById('ui').textContent = genes ? `${genes.body}/${genes.legs}/${genes.head}${genes.extraHead ? '+' + genes.extraHead : ''} [${genes.mods.join(',')}] size ${genes.size.toFixed(2)}` : 'mite';
}
scene.add(model);
model.traverse((o) => { if (o.isMesh && !o.userData.isInk) o.castShadow = true; });
const box = new THREE.Box3().setFromObject(model);
const ctr = box.getCenter(new THREE.Vector3());
if (Q.has('at')) ctr.set(...Q.get('at').split(',').map(parseFloat)); // &at=x,y,z: look at this point instead (to zoom in on a part)
const rad = box.getSize(new THREE.Vector3()).length() / 2;
let yaw = THREE.MathUtils.degToRad(num('yaw', 35)), pitch = THREE.MathUtils.degToRad(num('pitch', 18));
const dist = num('dist', rad * 2.6);
let t = 0, last = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  const sz = renderer.getSize(new THREE.Vector2());
  if (innerWidth > 0 && (sz.x !== innerWidth || sz.y !== innerHeight)) {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    post.setSize();
  }
  if (Q.get('spin') === '1') yaw += dt * 0.4;
  camera.position.set(ctr.x + Math.sin(yaw) * Math.cos(pitch) * dist, ctr.y + Math.sin(pitch) * dist, ctr.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(ctr);
  if (rig) rig.setThrust(num('thrust', 0), num('lift', 0), t);
  if (anim) anim(t, num('speed', 6));
  post.material.uniforms.time.value = t;
  post.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
window.viewer = { scene, camera, model, rig };

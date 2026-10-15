import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parseStaticGlb } from './staticBake.js';
import { rootName } from './staticContract.js';

// Outposts authored in Blender (src/assets/outposts.glb, built by tools/blender/build_outposts.py; contract in
// docs/outpost-glb.md). A PILOT: off unless asked for, and only for the kinds listed in GLB_KINDS.
//
//   switch on:   ?outpostGlb in the URL, or localStorage['mr-outpost-glb'] = '1'
//   fall back:   a missing file, kind or wreck, or a bake that throws, quietly gives the Kit-built outpost
//                (outpostModels.js), unlike the ship GLBs this can never stop the game starting
//   cost:        the file is a separate chunk (a dynamic import), fetched only when switched on
//
// To make it the default: drop the `outpostGlbOn()` test below, and import the GLB statically if the
// extra request matters (the desktop build runs from file://, which is why the other GLBs are inlined).
export const GLB_KINDS = new Set(['mast']);

let ASSETS = null; // Map(root name -> parsed asset), null until loaded

export function outpostGlbOn() {
  try {
    return new URLSearchParams(location.search).has('outpostGlb') || localStorage.getItem('mr-outpost-glb') === '1';
  } catch { return false; }
}

// Resolves true when the GLB is loaded. Never rejects. `force` loads it even when switched off (the viewer).
export async function loadOutpostParts({ force = false } = {}) {
  if (ASSETS) return true;
  if (!force && !outpostGlbOn()) return false;
  try {
    const { default: url } = await import('./assets/outposts.glb?inline');
    const gltf = await new GLTFLoader().loadAsync(url);
    const assets = parseStaticGlb(gltf.scene, { warn: (m) => console.warn('[outposts.glb]', m) });
    for (const kind of GLB_KINDS) {
      if (!assets.has(rootName(kind, false))) { console.warn(`[outposts.glb] no "${kind}": using the Kit-built one`); continue; }
      if (!assets.has(rootName(kind, true))) console.warn(`[outposts.glb] no "${kind}_wreck": its wreck stays Kit-built`);
    }
    ASSETS = assets;
  } catch (e) {
    console.warn('outposts.glb unavailable, using the Kit-built outposts', e);
  }
  return !!ASSETS;
}

// The parsed asset for a kind (or its wreck), or null: not loaded, not a GLB kind, or not in the file.
export function outpostAsset(kind, wreck) {
  if (!ASSETS || !GLB_KINDS.has(kind)) return null;
  return ASSETS.get(rootName(kind, wreck)) || null;
}

---
name: blender
description: Build, change, compress and check the game's Blender-made models (src/assets/*.glb, idles.json) with headless bpy, and the GLB contract the game relies on. Use for any edit under tools/blender or any .glb in src/assets.
---

# Blender models

## Setup

`tools/setup-blender.sh` installs `bpy==5.2.2` (Python 3.13; about 30 s, 1 GB) and is a no-op when present. The
SessionStart hook runs it; run it by hand if `python3 -c "import bpy"` fails.

## Build

Every builder is `tools/blender/build_<name>.py`, authored in three.js axes (x right, y up, +z forward) and
converted by `kit.py`'s `tb()`; the exporter's +Y-up option converts back. Each execs `kit.py` (shared helpers:
`mesh`, `material`, `export`...) and some also `decals.py`.

```bash
MOONRUNNER_REPO=. python3 tools/blender/build_crane.py    # -> src/assets/crane.glb
MOONRUNNER_REPO=. python3 tools/blender/build_idles.py    # -> src/assets/idles.json
```

Each run takes 1 to 3 s. Builders: runner, idles, ships, skimmer, warrig, apc, landtrain, crane, garage, slots, dish,
outposts. In the Blender app they run with `exec(open(r"<repo>/tools/blender/build_x.py").read())`.

## After a build

1. `npm run optimize:glb` for the compressed models (ships, skimmer, warrig, apc, landtrain, crane, garage, slots, dish).
   `runner.glb` and `outposts.glb` stay plain. A build overwrites a compressed file with a plain one, so a
   model you did not change shows as modified if you rebuilt it: `git checkout` it.
2. `npm run check:outposts` after touching outposts.
3. Check the diff touches only the models you meant to change. `runner.glb` can differ by a few bytes between
   runs; that is not a change.
4. Update the README source map if a model or builder was added or renamed.

## The GLB contract (what the game reads)

- **Material name = slot** (runner: suit, accent, helmet, visor, dark, metal, glow, skate, scarf, collar, lens,
  glint). The game swaps in its own toon materials per slot, which is how faction outfits recolour things. One
  material per mesh. `kit.mesh(name, geo, slot, parent, ink=...)` sets this up.
- **Custom property `ink`** = outline thickness in metres (0 = none); `slot` is also stored. Export with custom
  properties on (`export_extras`).
- **Pivot empties** are the animated parts (runner: legL, legR, torso, head, armL, armR, foreL, foreR (forearms, on the elbows, children of the arm pivots), scarfLinks). `padL`, `padR`, `band`, `crest` and `antenna` are outfit extras: baked apart from the always-worn parts and hung on by `cosmetics.js` only when an outfit asks (`runnerExtra` in `models.js`). Geometry is
  read in its pivot's frame. Vehicles have named pivots for wheels, turret, barrel, gear and so on; check the
  builder and `src/models.js` for the names before renaming anything.
- **Colliders** are empties named `col.*` (outposts: `cols`, `hits`, `raid`, `smoke`, `drop`), never read from
  visible meshes. Full outpost contract, with its naming rules: `docs/outpost-glb.md`.
- Object names are unique across a file; Blender's `.001` suffixes are stripped from material names only.
- Renaming a slot, pivot or collider is a game-code change too: grep `src/` for the name.

## Outlines

Every inked part is drawn with a black shell round it (the `ink` custom property is how far out, in metres). Two things follow:
- A detail with `ink` 0 (a stripe, a trim ring) that sticks out of an inked part by more than a few millimetres has its colour drawn across
  that part's black band at its silhouette. Keep such details within about 6 mm of the surface (`flush()` in `build_runner.py` sinks the
  stripes), or give them an ink of their own. `python3 tools/blender/audit_outline.py` lists the candidates. The bodies are low-poly
  lathes, so a flat ribbon closer than ~6 mm to the nearest vertex surface dips under the facets.
- A part that enters another (the crest into the helmet) must have its base INSIDE it all along its length: a base that stops above the
  surface shows its own outline under it as a second line.
- The courier's shells are thinned with the camera's distance (`inkMatNear` in `src/toon.js`; full thickness from 7 m). Anything built the
  baked way (`bakeRunnerParts`) gets that for free.

## Not covered

Rendering previews from headless Blender is untried. To look at a model, use `tools/viewer.html` (three.js, `?m=runner&outfit=...` for the courier) or the game's Asset Row. Screenshots from headless Chromium work (swiftshader, a few seconds a frame).

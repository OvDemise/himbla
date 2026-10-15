# Outposts from Blender (`src/assets/outposts.glb`)

The small faction structures (watchtower, depot, farm dome, relay mast, kiosk, scrap shack, junk pile) are built in
code by `Kit` (`src/outpostModels.js`). This is the contract for building one in Blender instead. It is a **pilot**:
the Relay Mast (`mast`) is the first kind to go through it, and it is **off by default** (see "Switching it on").

Read the file with `src/outpostGlb.js`, bake it with `src/staticBake.js`, check it with `npm run check:outposts`.

## What the game does with the file

An outpost template is `{ root, cols, hits, raid, smoke, drop }` in the outpost's own frame (metres, +y up, ground at
y = 0, the yard's centre at the origin, +z towards the gate). `territory.js` clones `root`, drops a collider for
every entry of `cols`, damages the building when a blast reaches a box in `hits`, lets you raid it at `raid`, makes
the wreck smoulder at `smoke` and throws loot to `drop`. A GLB supplies all of that:

- **Geometry** is baked once per kind × faction colour × wreck into a handful of merged meshes: one vertex-coloured
  toon mesh, one unlit glow mesh, one outline hull. Hundreds of Blender objects cost the same as a Kit build
  (about a dozen draw calls).
- **Gameplay data** (`cols`, `hits`, `raid`, `smoke`, `drop`) comes from **empties**, not from the visible meshes.
  Collision is never read from a mesh: draw the building however you like, then place the colliders by hand.

If the file, a kind, or the bake fails, the game falls back to the Kit-built outpost and logs a warning.

## Axes and names

Author in three.js axes (x right, y up, +z forward/gate), as `tools/blender/kit.py` does (`tb()` converts to Blender's
axes and the exporter's +Y-up option converts back). Export with **custom properties on** (`export_extras`).

Scene roots, one empty at the origin per variant, everything else a descendant:

| Root | Meaning |
|---|---|
| `mast` | the intact compound |
| `mast_wreck` | the same compound with the main building in ruins (shared yard props are repeated) |

Blender appends `.001` to duplicate names; the game strips a trailing `.NNN` from material names, but keep node names
unique anyway.

## Meshes

- Any depth under a root. **One material per mesh**, indexed triangles, `POSITION` + `NORMAL` only. UVs, textures,
  skins, animations and lights are ignored (the checker warns).
- Custom property `ink` (number, metres) on a mesh = outline thickness (smoothed-normal shell). Absent or 0 = none.
- Flat colours only. The look is the game's 3-step toon ramp over the material's **base colour**.
- Do not use alpha blending (not supported in the pilot: the checker warns, the mesh renders opaque).

### Materials

The material **name** (a trailing `.NNN` is ignored) picks the treatment; everything else comes from the base colour.

| Name | Treatment |
|---|---|
| `faction…` (`faction`, `faction_cloth`, …) | lit toon in the owning faction's accent colour |
| `faction_glow…` | unlit, in the faction's accent colour |
| `glow…` (`glow`, `glow_red`, …) | unlit, in the material's own base colour (lamps, screens) |
| anything else | lit toon in the material's own base colour |

Turn **backface culling off** on a material to make it double-sided (dishes, cloth).
Colours are sRGB hex in the game and **linear** in Blender: convert (the build script has `srgb()`).

## Gameplay empties

Non-mesh nodes anywhere under a root. Position and rotation are relative to the root. The role comes from the custom
property `role`, or failing that from the name's prefix (`col_…`, `hit_…`, `raid`, `smoke`, `drop`, `text_…`).

| Role | Meaning | How it is read |
|---|---|---|
| `col` | collider | custom property `shape` = `box` \| `cyl` \| `sphere` (default `box`) |
| `hit` | blast box that damages the building | a `box`, as below |
| `raid` | where you stand to raid (intact only) | position |
| `smoke` | where the wreck smoulders; also the building's centre for damage pops | position |
| `drop` | open apron spot where loot lands | position |
| `text` | a sign face (a canvas-texture plane drawn at runtime, so the font can change) | see below |

A **box** is an empty (cube display, size 1) whose **scale is the half-extents**, rotated about Y only; its position is
the box's centre. A **cyl** is a vertical cylinder: radius = scale.x, its axis runs from `y - scale.y` to `y + scale.y`
at the node's x/z. A **sphere** takes its radius from scale.x. Tilt on boxes is ignored (the checker warns).

A **text** empty needs `str` (the words) and `w` (board width in metres); optional `fg`, `bg`, `stroke` (CSS colours),
`back` (1 = a second face on the back, default 1) and `off` (distance of each face from the node, default 0.17). The
plane faces the node's +z.

## Moving parts

A group node (an empty) with a custom property `anim` = `flag` \| `blink` \| `spin` keeps its mesh children as a
separate object that the game animates, instead of merging them into the static mesh:

| `anim` | What the game does to the node |
|---|---|
| `flag` | swings it ±0.25 rad about Y (put the node at the hinge, the cloth to one side) |
| `blink` | shows and hides it |
| `spin` | turns it 0.6 rad/s about Y (put the node on the spin axis) |

Author an animated part's meshes relative to the node's origin.

## Switching it on

Off by default. Turn it on with `?outpostGlb` in the URL or `localStorage['mr-outpost-glb'] = '1'`. The dev viewer
(`/tools/viewer.html?m=outpost&kind=mast`) shows it beside the Kit build with every collider drawn
(`&src=kit|glb|both`, `&wreck=1`, `&cols=0`).

## Adding a kind

1. Add its builder to `tools/blender/build_outposts.py` (or author it in Blender) with both roots.
2. Run the script, commit `src/assets/outposts.glb`.
3. `npm run check:outposts`.
4. Add the kind to `GLB_KINDS` in `src/outpostGlb.js` once it matches the Kit version's gameplay data.

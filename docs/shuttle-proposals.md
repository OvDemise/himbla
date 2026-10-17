# Shuttle-bus nose and route board: two proposals

The shuttle-bus (`tools/blender/build_ships.py` -> `src/assets/ships.glb`) is a good size and shape; this pass is
polish on two things:

1. **The front windscreen.** The glass was a flat, unlit cyan slab with a stair-stepped edge (the old script kept or
   dropped whole hull faces, so a cut across the quads came out as a sawtooth), a heavy black frame, and headlights
   that sat inside the hull (so they drew as dark blobs). The hull's nose was also faceted (five long panels).
2. **The route board.** It was a small amber box on a stand amidships, with no text. It now sits at the front of the
   roof (where the sensor disc was), and **shows where the bus is bound**, in the game's pixel font on a dot-matrix
   panel.

Both proposals share the fixes underneath, and differ in how the nose and the board look.

![the current nose beside proposals A and B](shuttle-proposals/compare-nose.png)
![the board, side and rear views](shuttle-proposals/compare-sign.png)
![destination text fitting the board](shuttle-proposals/sign-destinations.png)

## What both fix

- **Clean glass edges.** The new `clipf()` cuts a dense patch of the hull's skin exactly where a smooth field crosses
  zero, so every edge of the glass, frame and bezel is a clean curve, with rounded corners.
- **Glass with some depth.** The glass is split into three tints (new slots `glass`, `glassDeep`, `glassHi`: a sky
  tint, a deeper tint under a horizon line, and white reflection streaks), cut from the same patch so nothing
  overlaps or fights for depth.
- **Nose lamps set on the skin** (`stick()` finds the hull surface and its normal), with rims, instead of buried in it.
- **A rounder nose** (the hull sections are re-cut along monotone cubic curves, same shape, no facets), with the
  livery belt following it, and a slim skid plate under the nose instead of two dark lumps.
- **The route board pivot.** A new pivot role, `board`, in the model: it sits at the middle of the display face
  (`+z` out of it) and carries `w`, `h`, `faces` and `depth` as custom properties. The game draws the lit text on it
  (`makeShip` in `src/models.js`: a canvas in the pixel font, amber lettering on a dark dot-matrix panel, shrunk to
  fit). `ship.setSign(text)` changes it.
- **The sign follows the route.** `Traffic.updateFlyer` sets each visible bus's board to the short name of the stop it
  is bound for (the far end while it flies, the other end while it waits at a pad: `> TRANQ`, `> VOSTOK-9`). The
  medevac, recall and spindle-pod shuttles label themselves `MEDEVAC`, `RECALL` and `EXTRACT`. Until a model with a
  `board` pivot is installed none of this shows: the shipped `ships.glb` has no board, so `setSign` does nothing.

Cost: about 25k triangles for the shuttle (the old one was 23k), before outlines.

## Proposal A: "Cockpit"

A classic airliner flight deck.

- **Windscreen:** a three-pane wraparound visor. Two body-coloured pillars split the glass; a thin dark gasket runs
  round it; the header is a shallow arch, so there is a hull-coloured brow over the glass. Reflection streaks cross
  all three panes as one continuous glint.
- **Lamps:** slim, wide LED bars on the cheeks under the visor, in light-grey rims.
- **Board:** a header board **integrated into the roof, just over the windscreen** (3.4 x 0.85 m, one face). It is a
  hull-coloured housing on a plinth that runs back into the roofline, with a livery-colour cap, its face leaning
  forward and down a little (like the nose, and so it reads from a pad below). The sensor blister moves back behind it.
- Reads as: the bus's "headboard", part of the vehicle.

## Proposal B: "Bubble"

A friendlier face: the shuttle's "fat, friendly hopper" character turned up.

- **Windscreen:** one big goggle-shaped visor with a chunky light-grey trim bezel and a slim dark gasket inside it,
  a horizon tint and a single bold reflection streak. No pillars: nothing between you and the view.
- **Lamps:** big round headlights with round rims (the bus gets two eyes).
- **Board:** a **double-faced lightbox on a swept roof fin, standing on the sensor puck** where the old disc sat
  (3.4 x 0.85 m, the text reads from the front and the back). Dark housing with livery caps and port/starboard
  pips on its ends, tipped forward a little.
- Reads as: a rooftop sign, like a taxi's: a separate object you can see from a long way off, and from behind.

## Preview them

Run `npm run dev` and open (the models are in `src/assets/proposals/`, with the same numbers and rig as `ships.glb`):

```
/tools/viewer.html?m=shuttle&ships=/src/assets/proposals/ships_A.glb&sign=TRANQ&yaw=30&pitch=6&dist=20&at=0,5.5,4
/tools/viewer.html?m=shuttle&ships=/src/assets/proposals/ships_B.glb&sign=MERIDIAN&yaw=30&pitch=6&dist=20&at=0,5.5,4
```

`ships=` loads any ships file in place of `src/assets/ships.glb` (dev viewer only), and `sign=` sets the board's text.
(The viewer lifts the shuttle by its gear height, 4.6 m, so add that to the `y` of `at=`.)

## Rebuild or adopt one

`tools/blender/build_ships.py` has all three builds in it; `SHUTTLE_VARIANT` picks one: `current` (the default: what
ships now, unchanged), `A` or `B`. `SHIPS_OUT` sets where the file goes (default `src/assets/ships.glb`).

```
MOONRUNNER_REPO=. SHUTTLE_VARIANT=A blender -b -P tools/blender/build_ships.py   # (or `pip install bpy` and run it with python)
npm run optimize:glb                                              # compress it like the others
```

To adopt a proposal: either copy its file over `src/assets/ships.glb` (the proposals are already compressed and
contain the freighter unchanged), or rebuild as above. Once one is chosen, the other builds and the `current` branch
can be deleted from the script.

# Hover-car builder for Blender (4.2+ / 5.x): the smallest road vehicle, in two sets.
#
# Builds the two hover-cars from one body style and exports src/assets/hovercar.glb. In Blender's Python console or via MCP:
#   exec(open(r"<repo>/tools/blender/build_hovercar.py").read())
# Headless:  MOONRUNNER_REPO=<repo> python3 tools/blender/build_hovercar.py   (needs `pip install bpy`)
#
#   car_faction   the FACTION car: a low, sharp hull in the faction's livery: a racing stripe down the spine, a roof light bar,
#                 swept tail fins, a dark splitter, and the faction's emblem on a plate on each door (one `livery` pivot per
#                 faction, extra `faction`; the game keeps only the matching one).
#   car_civilian  the CIVILIAN car: the same hull, rounder and a hand taller: a big glass bubble under a two-tone roof, chrome
#                 bumpers, round headlamps, a roof rack with a luggage pod, a soft swoosh instead of a stripe, stubby tail fins.
#
# Both are about 6.5 m long and 3.9 m over the pods (1.18 x the old car's footprint of 5.5 x 3.3 m), authored in three.js axes
# (x right, y up, +z nose), centred on the hull's middle like the old car.
# - Pivot roles: lift (a hover-pad glow under each corner, breathes), beacon (the faction car's roof lamps, blink; extra `phase`),
#   livery (see above). Everything else is static.
# - Each mesh has ONE material named after a slot (body, roof, stripe, trim, dark, glass, lamp, tail, lift, beaconA, beaconB); the
#   game swaps in its own toon / glow materials per slot (faction: LAND_TRAIN_FACTIONS-style palette; civilian: CIVILIAN_PAINTS).
#   Custom property "ink" = outline thickness in metres (0 = none).

import bpy, math, os

def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_hovercar.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("HOVERCAR_OUT") or os.path.join(REPO, "src", "assets", "hovercar.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Hover-car export ->", OUT)
COLL = "MoonHovercar"

# preview colours only (SPACECOM livery on the faction car, a pink two-tone on the civilian one)
SLOT_COLORS = {
    "body": (0.95, 0.93, 0.86), "roof": (1.0, 0.96, 0.88), "stripe": (1.0, 0.82, 0.25), "trim": (0.54, 0.53, 0.63),
    "dark": (0.16, 0.14, 0.25), "glass": (0.61, 0.9, 1.0), "lamp": (1.0, 0.96, 0.66), "tail": (1.0, 0.16, 0.29),
    "lift": (0.5, 0.9, 1.0), "beaconA": (1.0, 0.2, 0.25), "beaconB": (0.2, 0.5, 1.0),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "decals.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)

PI = math.pi
W_POD = 1.6     # the pods' distance from the centreline: 3.9 m over the pods with their own width


def hull_sections(civ):
    """The one hull both cars share: a flattened capsule. The civilian's is a little taller and blunter at the nose."""
    k = 1.12 if civ else 1.0
    nose = 3.1 if civ else 3.25
    return [
        {"z": -3.25, "w": 0.5, "t": 0.26 * k, "b": 0.24, "eT": 2.4, "eB": 2.6},
        {"z": -2.85, "w": 1.05, "t": 0.52 * k, "b": 0.4, "eT": 2.4, "eB": 2.6},
        {"z": -1.8, "w": 1.4, "t": 0.64 * k, "b": 0.5, "eT": 2.4, "eB": 2.6},
        {"z": 0.0, "w": 1.5, "t": 0.68 * k, "b": 0.52, "eT": 2.4, "eB": 2.6},
        {"z": 1.6, "w": 1.36, "t": 0.58 * k, "b": 0.47, "eT": 2.4, "eB": 2.6},
        {"z": nose - 0.5, "w": 0.95 if civ else 0.88, "t": 0.42 * k, "b": 0.34, "eT": 2.4, "eB": 2.6},
        {"z": nose, "w": 0.42 if civ else 0.3, "t": 0.22 * k, "b": 0.2, "eT": 2.4, "eB": 2.6},
    ]


def build_pods(R, civ):
    """Side pods, the belly pan and the four hover pads: shared, dressed differently."""
    pod = [
        {"z": -2.45, "w": 0.26, "t": 0.22, "b": 0.22},
        {"z": -2.0, "w": 0.34, "t": 0.29, "b": 0.27},
        {"z": 1.1, "w": 0.34, "t": 0.29, "b": 0.27},
        {"z": 2.2, "w": 0.23, "t": 0.19, "b": 0.21},
    ]
    for side in (-1, 1):
        tag = "LR"[side > 0]
        mesh(f"pod{tag}", xf(loft(pod, 20), (side * W_POD, -0.52, -0.1)), "trim" if civ else "body", R, 0.04)
        if not civ:  # (the faction car's pods wear the body colour, with a livery band round each)
            mesh(f"podBand{tag}", xf(loft([{"z": -1.3, "w": 0.36, "t": 0.31, "b": 0.29}, {"z": -0.85, "w": 0.36, "t": 0.31, "b": 0.29}], 20, False, False), (side * W_POD, -0.52, -0.1)), "stripe", R, 0)
        mesh(f"podIntake{tag}", xf(torus(0.26, 0.055, 16, 6), (side * W_POD, -0.52, 1.15), (PI / 2, 0, 0)), "dark", R, 0)
        mesh(f"podVent{tag}", xf(lathe([(0, 0), (0.17, 0), (0.17, 0.08), (0, 0.08)], 12), (side * W_POD, -0.52, -2.56), (-PI / 2, 0, 0)), "tail" if not civ else "lift", R, 0)
        # a strut from each pod to the hull
        mesh(f"strut{tag}", xf(rbox(0.2, 0.06, 0.8, 0.3, 8, 4), (side * 1.45, -0.34, -0.1), (0, 0, side * -0.15)), "dark", R, 0.02)
    # belly pan and the hover pads (pivots with role lift: glow discs that breathe)
    mesh("belly", xf(loft([{"z": -2.7, "w": 0.8, "t": 0.08, "b": 0.12}, {"z": 0, "w": 1.15, "t": 0.1, "b": 0.14}, {"z": 2.7, "w": 0.7, "t": 0.08, "b": 0.1}], 20), (0, -0.62, 0)), "dark", R, 0.03)
    for i, (x, z) in enumerate([(-1.0, 1.7), (1.0, 1.7), (-1.0, -1.7), (1.0, -1.7)]):
        P = pivot(f"lift{i}", (x, -0.86, z), R, role="lift")
        mesh(f"lift{i}_pad", xf(lathe([(0, 0), (0.34, 0), (0.34, 0.05), (0, 0.05)], 16)), "lift", P, 0)
        mesh(f"lift{i}_ring", xf(torus(0.38, 0.045, 16, 5)), "trim", P, 0)


def build_faction(R):
    hull = hull_sections(False)
    mesh("hull", loft(hull, 40), "body", R, 0.07)
    # the livery stripe down the spine and a chine line down each flank
    mesh("spine", keep(loft(grow(hull, 0.02), 40, False, False), lambda c: abs(c[0]) < 0.2 and c[1] > 0.3), "stripe", R, 0)
    mesh("chine", keep(loft(grow(hull, 0.025), 40, False, False), lambda c: abs(c[1] + 0.02) < 0.06 and abs(c[0]) > 0.5), "stripe", R, 0)
    # a low, tinted canopy: a long teardrop, set back
    cano = [
        {"z": -1.5, "w": 0.55, "t": 0.1, "b": 0.0, "yc": 0.6, "eT": 2.6},
        {"z": -0.9, "w": 0.95, "t": 0.5, "b": 0.0, "yc": 0.6, "eT": 2.6},
        {"z": 0.3, "w": 1.0, "t": 0.56, "b": 0.0, "yc": 0.58, "eT": 2.6},
        {"z": 1.2, "w": 0.82, "t": 0.4, "b": 0.0, "yc": 0.56, "eT": 2.6},
        {"z": 1.75, "w": 0.4, "t": 0.12, "b": 0.0, "yc": 0.52, "eT": 2.6},
    ]
    mesh("canopy", loft(cano, 28), "glass", R, 0.04)
    mesh("canopyFrame", keep(loft(grow(cano, 0.02), 28, False, False), lambda c: abs(c[0]) < 0.16 and c[1] > 1.0), "stripe", R, 0)
    # hood vents and a dark front splitter
    for sx in (-1, 1):
        mesh(f"vent{sx}", xf(rbox(0.1, 0.03, 0.55, 0.3, 8, 4), (sx * 0.38, 0.66, 2.1), (0.3, 0, 0)), "dark", R, 0)
    mesh("splitter", xf(extrude([(2.6, 0), (3.45, 0), (3.2, 0.07), (2.6, 0.1)], 1.2, "x"), (0, -0.46, 0)), "dark", R, 0.02)
    # headlamps: angular slits in the nose, a brake bar and tail lamps at the back
    for sx in (-1, 1):
        mesh(f"head{sx}", xf(rbox(0.3, 0.05, 0.06, 0.4, 8, 4), (sx * 0.55, 0.02, 3.03), (0, sx * -0.35, 0)), "lamp", R, 0)
        mesh(f"tail{sx}", xf(rbox(0.28, 0.05, 0.05, 0.4, 8, 4), (sx * 0.62, 0.18, -3.1), (0, sx * 0.3, 0)), "tail", R, 0)
    mesh("brake", xf(rbox(0.8, 0.04, 0.05, 0.4, 8, 4), (0, 0.5, -2.75), (-0.5, 0, 0)), "tail", R, 0)
    mesh("plate", xf(rbox(0.5, 0.17, 0.04, 0.3, 6, 4), (0, -0.2, -3.2), (0.2, 0, 0)), "trim", R, 0.015)
    # swept tail fins, striped at the tips
    for sx in (-1, 1):
        mesh(f"fin{sx}", xf(rbox(0.04, 0.3, 0.46, 0.3, 8, 5), (sx * 0.72, 0.78, -2.5), (-0.45, 0, sx * -0.25)), "body", R, 0.035)
        mesh(f"finTip{sx}", xf(rbox(0.045, 0.07, 0.3, 0.3, 6, 4), (sx * 0.8, 1.03, -2.7), (-0.45, 0, sx * -0.25)), "stripe", R, 0)
    # a roof light bar: two lamps that alternate (pivots with role beacon, extra phase)
    mesh("barBase", xf(rbox(0.5, 0.06, 0.12, 0.3, 8, 4), (0, 1.2, 0.35)), "dark", R, 0.02)
    for sx, slot in ((-1, "beaconA"), (1, "beaconB")):
        B_ = pivot(f"beacon{sx}", (sx * 0.27, 1.26, 0.35), R, role="beacon", phase=0 if sx < 0 else 1)
        mesh(f"beacon{sx}_lens", xf(superquad(0.2, 0.08, 0.09, 0.8, 0.8, 10, 6)), slot, B_, 0)
    # a whip antenna with a lamp
    mesh("whip", B((-0.5, 0.68, -1.8), (-0.62, 1.7, -2.15), 0.022, 5, True), "dark", R, 0)
    # the faction's emblem on a plate on each door (one livery pivot per faction)
    for side in (-1, 1):
        mesh(f"doorPlate{side}", xf(rbox(0.03, 0.34, 0.66, 0.2, 8, 5), (side * 1.46, 0.03, 0.15)), "dark", R, 0.015)
    for f in FACTIONS:
        L = pivot(f"livery_{f}", (0, 0, 0), R, role="livery", faction=f)
        for side in (-1, 1):
            d = side_dec(side, 1.478, 0.03, 0.15)
            emblem(d, f, 0, 0, 0.29, 0)
            d.build(f"emblem_{f}_{side}", L)


def build_civilian(R):
    hull = hull_sections(True)
    mesh("hull", loft(hull, 40), "body", R, 0.07)
    # a soft swoosh down each flank, in place of the faction car's racing stripe
    mesh("swoosh", keep(loft(grow(hull, 0.022), 40, False, False), lambda c: abs(c[1] - 0.06) < 0.07 and abs(c[0]) > 0.7), "stripe", R, 0)
    # a big glass bubble, set forward and high, under a two-tone roof cap
    cano = [
        {"z": -1.65, "w": 0.7, "t": 0.2, "b": 0.0, "yc": 0.66, "eT": 2.2},
        {"z": -1.1, "w": 1.15, "t": 0.78, "b": 0.0, "yc": 0.66, "eT": 2.2},
        {"z": 0.2, "w": 1.22, "t": 0.92, "b": 0.0, "yc": 0.66, "eT": 2.2},
        {"z": 1.3, "w": 1.0, "t": 0.7, "b": 0.0, "yc": 0.64, "eT": 2.2},
        {"z": 2.0, "w": 0.5, "t": 0.22, "b": 0.0, "yc": 0.6, "eT": 2.2},
    ]
    mesh("canopy", loft(cano, 28), "glass", R, 0.04)
    mesh("roof", keep(loft(grow(cano, 0.03), 28, False, False), lambda c: c[1] > 1.34), "roof", R, 0.02)
    mesh("collar", xf(torus(1.0, 0.045, 24, 5), (0, 0.66, 0.15), (PI / 2, 0, 0), (1.22, 1.9, 1)), "trim", R, 0)
    # a roof rack with a luggage pod
    for sx in (-1, 1):
        mesh(f"rail{sx}", B((sx * 0.55, 1.62, -0.9), (sx * 0.55, 1.62, 0.9), 0.03, 6, True), "trim", R, 0.01)
        for z in (-0.9, 0.9):
            mesh(f"post{sx}{z}", B((sx * 0.55, 1.55, z), (sx * 0.55, 1.65, z), 0.03, 6, True), "trim", R, 0)
    for z in (-0.5, 0.5):
        mesh(f"cross{z}", B((-0.55, 1.65, z), (0.55, 1.65, z), 0.025, 6, True), "trim", R, 0)
    mesh("luggage", xf(rbox(0.46, 0.17, 0.62, 0.35, 12, 6), (0, 1.84, -0.05)), "stripe", R, 0.03)
    # round headlamps in chrome bezels, a chrome bumper front and back, round tail lamps
    for sx in (-1, 1):
        mesh(f"head{sx}", xf(lathe([(0, 0), (0.2, 0), (0.2, 0.05), (0, 0.05)], 14), (sx * 0.62, 0.0, 2.95), (PI / 2, 0, 0)), "lamp", R, 0)
        mesh(f"bezel{sx}", xf(torus(0.22, 0.04, 14, 5), (sx * 0.62, 0.0, 2.94), (PI / 2, 0, 0)), "trim", R, 0.01)
        mesh(f"tail{sx}", xf(lathe([(0, 0), (0.16, 0), (0.16, 0.05), (0, 0.05)], 12), (sx * 0.7, 0.12, -3.05), (-PI / 2, 0, 0)), "tail", R, 0)
        mesh(f"tailBezel{sx}", xf(torus(0.18, 0.035, 12, 5), (sx * 0.7, 0.12, -3.06), (PI / 2, 0, 0)), "trim", R, 0)
    mesh("bumperF", xf(rbox(0.75, 0.08, 0.1, 0.4, 14, 5), (0, -0.28, 3.05)), "trim", R, 0.025)
    mesh("bumperR", xf(rbox(0.7, 0.08, 0.1, 0.4, 14, 5), (0, -0.2, -3.18)), "trim", R, 0.025)
    mesh("plate", xf(rbox(0.4, 0.14, 0.03, 0.3, 6, 4), (0, 0.0, -3.22)), "roof", R, 0.015)
    # stubby tail fins, no sharp edges, and a hood ornament
    for sx in (-1, 1):
        mesh(f"fin{sx}", xf(rbox(0.07, 0.16, 0.34, 0.5, 10, 6), (sx * 0.9, 0.58, -2.6), (-0.3, 0, sx * -0.2)), "body", R, 0.03)
        mesh(f"door{sx}", xf(rbox(0.02, 0.5, 0.02, 0.2, 4, 3), (sx * 1.505, 0.15, 0.35)), "dark", R, 0)
        mesh(f"handle{sx}", xf(rbox(0.03, 0.04, 0.22, 0.4, 6, 4), (sx * 1.51, 0.3, 0.05)), "trim", R, 0.01)
        mesh(f"mirror{sx}", xf(superquad(0.12, 0.09, 0.07, 0.8, 0.8, 8, 5), (sx * 1.35, 0.95, 1.1)), "body", R, 0.02)
    mesh("ornament", xf(superquad(0.07, 0.09, 0.07, 0.8, 0.8, 8, 5), (0, 0.78, 2.55)), "trim", R, 0.01)


RF = pivot("car_faction", (0, 0, 0))
RC = pivot("car_civilian", (0, 0, 0))
build_pods(RF, False)
build_faction(RF)
build_pods(RC, True)
build_civilian(RC)
for r in (RF, RC):
    r["radius"] = 3.4
    r["length"] = 6.5
    r["width"] = 3.9
print("built", len(C.objects), "objects")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)

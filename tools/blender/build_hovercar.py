# Hover-car builder for Blender (4.2+ / 5.x): the smallest road vehicle, in two sets.
#
# Builds the two hover-cars from one body style and exports src/assets/hovercar.glb. In Blender's Python console or via MCP:
#   exec(open(r"<repo>/tools/blender/build_hovercar.py").read())
# Headless:  MOONRUNNER_REPO=<repo> python3 tools/blender/build_hovercar.py   (needs `pip install bpy`)
#
#   car_faction   the FACTION car: a low, sharp hull in the faction's livery: a racing stripe down the spine, swept tail fins and
#                 a dark splitter. SPACECOM's car alone has a roof light bar (the `livery_spacecom` pivot, extra `faction`: the
#                 game keeps only the matching one); the other factions' cars have none. No emblems yet (the logos aren't made).
#   car_civilian  the CIVILIAN car: the same hull, rounder and a hand taller: a big glass bubble under a two-tone roof, chrome
#                 side bumpers, a single oval headlamp on the nose cone, a roof rack with a luggage pod, a soft swoosh instead of a stripe, stubby tail fins.
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


# ---------------- the hull's own surface: everything mounted on it is placed from these, so nothing floats or clips ----------------
def sec_at(S, z):
    """The loft's section at z (linear between sections, like the faces themselves)."""
    z = max(S[0]["z"], min(S[-1]["z"], z))
    for a, b in zip(S, S[1:]):
        if a["z"] <= z <= b["z"]:
            f = (z - a["z"]) / (b["z"] - a["z"]) if b["z"] != a["z"] else 0.0
            lerp = lambda k, d=0.0: a.get(k, d) + (b.get(k, d) - a.get(k, d)) * f
            return {"w": lerp("w"), "t": lerp("t"), "b": lerp("b"), "yc": lerp("yc"), "eT": lerp("eT", 2.5), "eB": lerp("eB", 2.5)}
    return dict(S[-1])


def top_y(S, x, z):
    """Height of the loft's upper surface at (x, z); None outside it."""
    s = sec_at(S, z)
    r = abs(x) / s["w"]
    return None if r >= 1 else s["yc"] + s["t"] * (1 - r ** s["eT"]) ** (1 / s["eT"])


def bot_y(S, x, z):
    s = sec_at(S, z)
    r = abs(x) / s["w"]
    return None if r >= 1 else s["yc"] - s["b"] * (1 - r ** s["eB"]) ** (1 / s["eB"])


def side_x(S, y, z):
    """Half-width of the loft at height y and station z (None above or below it)."""
    s = sec_at(S, z)
    up = y >= s["yc"]
    h, e = (s["t"], s["eT"]) if up else (s["b"], s["eB"])
    r = abs(y - s["yc"]) / h
    return None if r >= 1 else s["w"] * (1 - r ** e) ** (1 / e)


def flank(S, side, y, z, d=0.04):
    """A point on the flank (side = +/-1) at height y and station z, and the yaw that turns a part's +z face to the outward normal."""
    X = side_x(S, y, z)
    slope = (side_x(S, y, z + d) - side_x(S, y, z - d)) / (2 * d)
    return (side * X, y, z), math.atan2(side, -slope)


def mount(p, yaw, depth):
    """Sink a part's centre `depth` into the surface along its normal (so it is half-buried, never hovering)."""
    nx, nz = math.sin(yaw), math.cos(yaw)
    return (p[0] - nx * depth, p[1], p[2] - nz * depth)


def gsec(S, z, d):
    """The loft's section at z, grown by d all round (for a layer laid over it)."""
    a = sec_at(S, z)
    return {"z": z, "w": a["w"] + d, "t": a["t"] + d, "b": a["b"] + d, "yc": a["yc"], "eT": a["eT"], "eB": a["eB"]}


def above(S, c, f):
    """True when the face centre c lies in the top part of the loft: more than fraction f of the way up from its centre line to its crown."""
    a = sec_at(S, c[2])
    return c[1] > a["yc"] + f * a["t"]


def slab(S, z0, z1, d, pred, n=64, k=8):
    """A patch of the loft's skin between z0 and z1, standing d proud of it, cut to the faces `pred` keeps (a roof panel, a frame, a vent)."""
    return keep(loft([gsec(S, z0 + (z1 - z0) * i / k, d) for i in range(k + 1)], n, False, False), pred)


HULL_F, HULL_C = None, None


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


HULL_F, HULL_C = hull_sections(False), hull_sections(True)


def build_pods(R, civ, H):
    """Side pods, their struts, the belly pan and the four hover pads on stems: shared, dressed differently."""
    pod = [
        {"z": -2.45, "w": 0.26, "t": 0.22, "b": 0.22},
        {"z": -2.0, "w": 0.34, "t": 0.29, "b": 0.27},
        {"z": 1.1, "w": 0.34, "t": 0.29, "b": 0.27},
        {"z": 2.2, "w": 0.23, "t": 0.19, "b": 0.21},
    ]
    for side in (-1, 1):
        tag = "LR"[side > 0]
        at = (side * W_POD, -0.52, -0.1)
        mesh(f"pod{tag}", xf(loft(pod, 20), at), "trim" if civ else "body", R, 0.04)
        if not civ:  # (the faction car's pods wear the body colour, with a livery band round each)
            mesh(f"podBand{tag}", xf(loft([{"z": -1.3, "w": 0.36, "t": 0.31, "b": 0.29}, {"z": -0.85, "w": 0.36, "t": 0.31, "b": 0.29}], 20, False, False), at), "stripe", R, 0)
        # a dark intake collar round the pod's nose, and the vent at its tail
        mesh(f"podIntake{tag}", xf(loft([{"z": 1.3, "w": 0.355, "t": 0.305, "b": 0.285}, {"z": 1.62, "w": 0.34, "t": 0.29, "b": 0.27}], 20, False, False), at), "dark", R, 0)
        mesh(f"podVent{tag}", xf(lathe([(0, 0), (0.16, 0), (0.16, 0.08), (0, 0.08)], 12), (side * W_POD, -0.52, -2.5), (-PI / 2, 0, 0)), "lift" if civ else "tail", R, 0)
        # two struts tie each pod to the hull: they start inside the hull wall and end inside the pod
        for z in (-1.3, 1.0):
            xh = side_x(H, -0.34, z)          # the hull's flank at the strut's height
            x0, x1 = xh - 0.1, side * 0 + W_POD - 0.12
            mesh(f"strut{tag}{z}", xf(rbox((x1 - x0) / 2 + 0.02, 0.06, 0.2, 0.3, 8, 4), (side * (x0 + x1) / 2, -0.4, z)), "dark", R, 0.02)
    # belly pan, and the four hover pads: each hangs from the hull's underside on a stem
    mesh("belly", xf(loft([{"z": -2.7, "w": 0.8, "t": 0.08, "b": 0.12}, {"z": 0, "w": 1.15, "t": 0.1, "b": 0.14}, {"z": 2.7, "w": 0.7, "t": 0.08, "b": 0.1}], 20), (0, -0.62, 0)), "dark", R, 0.03)
    for i, (x, z) in enumerate([(-1.0, 1.7), (1.0, 1.7), (-1.0, -1.7), (1.0, -1.7)]):
        yb = bot_y(H, x, z)
        mesh(f"lift{i}_stem", B((x, yb + 0.06, z), (x, -0.84, z), 0.09, 8, True), "dark", R, 0.015)
        P = pivot(f"lift{i}", (x, -0.9, z), R, role="lift")
        mesh(f"lift{i}_pad", xf(lathe([(0, 0), (0.34, 0), (0.34, 0.05), (0, 0.05)], 16)), "lift", P, 0)
        mesh(f"lift{i}_ring", xf(torus(0.36, 0.045, 16, 5), (0, 0.04, 0)), "trim", P, 0)


def build_faction(R, roof="none"):
    H = HULL_F
    mesh("hull", loft(H, 40), "body", R, 0.07)
    # the livery stripe down the spine, and a chine line down each flank
    mesh("spine", keep(loft(grow(H, 0.02), 40, False, False), lambda c: abs(c[0]) < 0.2 and c[1] > 0.3), "stripe", R, 0)
    mesh("chine", keep(loft(grow(H, 0.025), 40, False, False), lambda c: abs(c[1] + 0.02) < 0.06 and abs(c[0]) > 0.5), "stripe", R, 0)
    # a low, tinted teardrop canopy whose flat base sits inside the hull (its rim buried under the deck)
    cano = [
        {"z": -1.5, "w": 0.55, "t": 0.2, "b": 0.0, "yc": 0.5, "eT": 2.6},
        {"z": -0.9, "w": 0.95, "t": 0.6, "b": 0.0, "yc": 0.5, "eT": 2.6},
        {"z": 0.3, "w": 1.0, "t": 0.66, "b": 0.0, "yc": 0.5, "eT": 2.6},
        {"z": 1.2, "w": 0.82, "t": 0.5, "b": 0.0, "yc": 0.5, "eT": 2.6},
        {"z": 1.75, "w": 0.4, "t": 0.22, "b": 0.0, "yc": 0.5, "eT": 2.6},
    ]
    mesh("canopy", loft(cano, 28), "glass", R, 0.04)
    mesh("canopyFrame", keep(loft(grow(cano, 0.02), 28, False, False), lambda c: abs(c[0]) < 0.16 and c[1] > 1.0), "stripe", R, 0)
    # ROOF A, ribbed canopy: the glass is broken into panes by three arched ribs in the body colour, and a sensor dome sits on the rear deck.
    # ROOF B, sport roof: a solid body-colour roof panel over the middle of the canopy (glass left at the windscreen, the back and the
    # side strips), a stripe down it, and a ramped air scoop with a dark mouth on the back of the panel.
    if roof == "A":
        for z in (-0.85, -0.2, 0.75):
            mesh(f"rib{z}", loft([gsec(cano, z - 0.05, 0.03), gsec(cano, z + 0.05, 0.03)], 40, False, False), "body", R, 0.02)
        dx, dz = 0.5, -1.95
        dy = top_y(H, dx, dz) - 0.03
        mesh("domeBase", xf(lathe([(0, 0), (0.2, 0), (0.2, 0.06), (0, 0.06)], 16), (dx, dy, dz)), "dark", R, 0.015)
        mesh("dome", xf(lathe([(0, 0.05), (0.16, 0.05), (0.15, 0.1), (0.11, 0.17), (0.05, 0.21), (0, 0.22)], 16), (dx, dy, dz)), "trim", R, 0.015)
        mesh("domeEye", xf(superquad(0.045, 0.03, 0.045, 0.8, 0.8, 8, 5), (dx, dy + 0.15, dz + 0.1)), "lamp", R, 0)
    elif roof == "B":
        mesh("roofPanel", slab(cano, -1.2, 0.55, 0.03, lambda c: above(cano, c, 0.55)), "body", R, 0.03)
        mesh("roofStripe", slab(cano, -1.2, 0.55, 0.04, lambda c: above(cano, c, 0.55) and abs(c[0]) < 0.1), "stripe", R, 0)
        yb = top_y(cano, 0, -0.7) + 0.03
        mesh("scoop", xf(extrude([(-1.0, yb - 0.06), (-0.4, yb - 0.06), (-0.4, yb + 0.17), (-1.0, yb + 0.02)], 0.6, "x")), "trim", R, 0.02)
        mesh("scoopMouth", xf(rbox(0.24, 0.06, 0.02, 0.3, 8, 4), (0, yb + 0.07, -0.395)), "dark", R, 0)
        for sx in (-1, 1):
            mesh(f"scoopFin{sx}", xf(rbox(0.012, 0.09, 0.3, 0.3, 4, 3), (sx * 0.3, yb + 0.02, -0.7)), "stripe", R, 0)
    # hood vents laid on the hood's slope
    for sx in (-1, 1):
        x, z = sx * 0.4, 2.15
        y = top_y(H, x, z) - 0.012
        slope = (top_y(H, x, z + 0.1) - top_y(H, x, z - 0.1)) / 0.2
        mesh(f"vent{sx}", xf(rbox(0.09, 0.025, 0.28, 0.3, 8, 4), (x, y, z), (-math.atan(slope), 0, 0)), "dark", R, 0)
    # a dark splitter under the nose: it starts inside the hull's underside and reaches past the nose
    mesh("splitter", xf(extrude([(2.5, 0), (3.5, 0), (3.28, 0.07), (2.5, 0.13)], 1.0, "x"), (0, -0.44, 0)), "dark", R, 0.02)
    # lamps set into the nose and tail flanks: placed on the hull's surface, turned to its normal, half buried. The headlamp sits above
    # the chine stripe in a dark housing, so it reads whatever colour the trim is; the tail lamp is a slit on the tail flank
    for sx in (-1, 1):
        p, yaw = flank(H, sx, 0.16, 2.86)
        mesh(f"headHousing{sx}", xf(rbox(0.14, 0.055, 0.05, 0.3, 8, 4), mount(p, yaw, 0.01), (0, yaw, 0)), "dark", R, 0.012)
        mesh(f"head{sx}", xf(rbox(0.1, 0.032, 0.035, 0.4, 8, 4), mount(p, yaw, -0.022), (0, yaw, 0)), "lamp", R, 0)
        p, yaw = flank(H, sx, 0.15, -3.0)
        mesh(f"tail{sx}", xf(rbox(0.2, 0.045, 0.06, 0.4, 8, 4), mount(p, yaw, 0.03), (0, yaw, 0)), "tail", R, 0)
    # a brake bar across the deck's tail, a number plate on the tail face
    yb = top_y(H, 0, -2.78)
    mesh("brake", xf(rbox(0.38, 0.025, 0.04, 0.4, 8, 4), (0, yb - 0.01, -2.78)), "tail", R, 0)
    yt = (top_y(H, 0, -3.2) + bot_y(H, 0, -3.2)) / 2
    mesh("plate", xf(rbox(0.28, 0.1, 0.04, 0.3, 6, 4), (0, yt, -3.2)), "trim", R, 0.012)
    # swept tail fins: a slab on each side of the spine, its foot buried in the deck, the livery tip a thicker cap of the same outline
    for sx in (-1, 1):
        x, z0 = sx * 0.72, -2.5
        yb = min(top_y(H, abs(x), -2.05), top_y(H, abs(x), -2.95)) - 0.08
        outline = [(0.42, 0.0), (-0.42, 0.0), (-0.6, 0.66), (-0.12, 0.66)]
        tip = [(-0.5, 0.5), (-0.0, 0.5), (-0.12, 0.66), (-0.6, 0.66)]
        t = (x, yb, z0)
        r = (0, 0, sx * -0.2)
        mesh(f"fin{sx}", xf(extrude(outline, 0.06, "x"), t, r), "body", R, 0.03)
        mesh(f"finTip{sx}", xf(extrude(tip, 0.075, "x"), t, r), "stripe", R, 0)
    # SPACECOM's roof light bar standing on the canopy: it belongs to the spacecom `livery` pivot, so only that faction's car has it
    # (two alternating lamps: pivots with role beacon, extra phase)
    LS = pivot("livery_spacecom", (0, 0, 0), R, role="livery", faction="spacecom")
    yc = top_y(cano, 0, 0.35) + (0.03 if roof == "B" else 0.0)
    mesh("barBase", xf(rbox(0.5, 0.06, 0.12, 0.3, 8, 4), (0, yc, 0.35)), "dark", LS, 0.02)
    for sx, slot in ((-1, "beaconA"), (1, "beaconB")):
        B_ = pivot(f"beacon{sx}", (sx * 0.27, yc + 0.07, 0.35), LS, role="beacon", phase=0 if sx < 0 else 1)
        mesh(f"beacon{sx}_lens", xf(superquad(0.2, 0.08, 0.09, 0.8, 0.8, 10, 6)), slot, B_, 0)
    # a whip antenna rooted in the rear deck, on a little base
    ax, az = -0.5, -1.9
    ay = top_y(H, ax, az)
    mesh("whipBase", xf(lathe([(0.0, -0.05), (0.07, -0.05), (0.07, 0.04), (0.03, 0.07), (0, 0.07)], 10), (ax, ay, az)), "dark", R, 0)
    mesh("whip", B((ax, ay, az), (ax - 0.1, ay + 1.0, az - 0.3), 0.02, 5, True), "dark", R, 0)


def build_civilian(R, roof="none"):
    H = HULL_C
    mesh("hull", loft(H, 40), "body", R, 0.07)
    # a soft swoosh down each flank, in place of the faction car's racing stripe
    mesh("swoosh", keep(loft(grow(H, 0.022), 40, False, False), lambda c: abs(c[1] - 0.06) < 0.07 and abs(c[0]) > 0.7), "stripe", R, 0)
    # a big glass bubble, set well down into the hull so its rim is buried, under a two-tone roof cap
    cano = [
        {"z": -1.65, "w": 0.7, "t": 0.41, "b": 0.0, "yc": 0.45, "eT": 2.2},
        {"z": -1.1, "w": 1.15, "t": 0.99, "b": 0.0, "yc": 0.45, "eT": 2.2},
        {"z": 0.2, "w": 1.22, "t": 1.13, "b": 0.0, "yc": 0.45, "eT": 2.2},
        {"z": 1.3, "w": 1.0, "t": 0.91, "b": 0.0, "yc": 0.45, "eT": 2.2},
        {"z": 2.0, "w": 0.5, "t": 0.43, "b": 0.0, "yc": 0.45, "eT": 2.2},
    ]
    mesh("canopy", loft(cano, 28), "glass", R, 0.04)
    mesh("roof", keep(loft(grow(cano, 0.03), 28, False, False), lambda c: c[1] > 1.34), "roof", R, 0.02)
    # ROOF A, sunroof: a framed glass sunroof on the cream cap, a vent hatch behind it and an accent-coloured sun-visor ridge over the
    # windscreen (no rack).  ROOF B, cargo box: the rack with a long streamlined roof box on it, a seam round the lid and a pair of
    # roof lamps on a front crossbar.  (With neither, the original rack and luggage pod.)
    if roof == "A":
        mesh("sunroofFrame", slab(cano, -0.45, 0.85, 0.045, lambda c: c[1] > 1.3 and abs(c[0]) < 0.42), "trim", R, 0.01)
        mesh("sunroof", slab(cano, -0.38, 0.78, 0.06, lambda c: c[1] > 1.3 and abs(c[0]) < 0.34), "glass", R, 0)
        mesh("ventFrame", slab(cano, -1.06, -0.76, 0.045, lambda c: c[1] > 1.2 and abs(c[0]) < 0.3), "trim", R, 0.01)
        mesh("vent", slab(cano, -1.0, -0.82, 0.055, lambda c: c[1] > 1.2 and abs(c[0]) < 0.24), "dark", R, 0)
        for k in range(3):
            z = -0.97 + k * 0.07
            mesh(f"louver{k}", slab(cano, z - 0.012, z + 0.012, 0.065, lambda c: c[1] > 1.2 and abs(c[0]) < 0.24), "trim", R, 0)
        mesh("visor", slab(cano, 0.95, 1.2, 0.07, lambda c: c[1] > 1.15 and abs(c[0]) < 0.75), "stripe", R, 0.01)
    else:
        # a roof rack on the cream cap: four posts each standing on the roof (their feet buried in it), two rails and two cross bars, and the pod strapped on top
        RY = 1.66
        for sx in (-1, 1):
            for z in (-0.6, 0.6):
                yr = top_y(cano, 0.42, z) - 0.05
                mesh(f"post{sx}{z}", B((sx * 0.42, yr, z), (sx * 0.42, RY, z), 0.03, 6, True), "trim", R, 0.01)
                mesh(f"foot{sx}{z}", xf(rbox(0.07, 0.03, 0.07, 0.4, 6, 4), (sx * 0.42, yr + 0.04, z)), "trim", R, 0)
            mesh(f"rail{sx}", B((sx * 0.42, RY, -0.66), (sx * 0.42, RY, 0.66), 0.03, 6, True), "trim", R, 0.01)
        for z in (-0.3, 0.3):
            mesh(f"cross{z}", B((-0.42, RY, z), (0.42, RY, z), 0.025, 6, True), "trim", R, 0)
        if roof == "none":
            mesh("luggage", xf(rbox(0.36, 0.15, 0.46, 0.35, 12, 6), (0, RY + 0.12, 0.0)), "stripe", R, 0.03)
            for z in (-0.2, 0.2):
                mesh(f"strap{z}", xf(rbox(0.375, 0.17, 0.025, 0.2, 10, 4), (0, RY + 0.12, z)), "trim", R, 0)
    if roof == "B":
        RYb = 1.66
        BX = [{"z": -0.62, "w": 0.26, "t": 0.1, "b": 0.08}, {"z": -0.3, "w": 0.36, "t": 0.18, "b": 0.1}, {"z": 0.3, "w": 0.36, "t": 0.18, "b": 0.1}, {"z": 0.62, "w": 0.26, "t": 0.1, "b": 0.08}]
        mesh("boxHull", xf(loft(BX, 24), (0, RYb + 0.1, 0)), "stripe", R, 0.03)
        mesh("boxSeam", xf(rbox(0.36, 0.012, 0.012, 0.3, 8, 3), (0, RYb + 0.275, 0.0)), "dark", R, 0)
        mesh("crossFront", B((-0.42, RYb, 0.66), (0.42, RYb, 0.66), 0.025, 6, True), "trim", R, 0)
        for sx in (-1, 1):
            mesh(f"roofLampMount{sx}", B((sx * 0.3, RYb, 0.66), (sx * 0.3, RYb + 0.07, 0.7), 0.025, 6, True), "trim", R, 0)
            mesh(f"roofLamp{sx}", xf(lathe([(0, -0.03), (0.075, -0.03), (0.075, 0.03), (0, 0.03)], 12), (sx * 0.3, RYb + 0.09, 0.73), (PI / 2, 0, 0)), "lamp", R, 0)
            mesh(f"roofLampRing{sx}", xf(torus(0.085, 0.015, 12, 5), (sx * 0.3, RYb + 0.09, 0.74), (PI / 2, 0, 0)), "trim", R, 0)
    # round tail lamps in chrome bezels, set into the tail flanks and turned to the surface
    for sx in (-1, 1):
        p, yaw = flank(H, sx, 0.12, -3.0)
        q = mount(p, yaw, 0.03)
        mesh(f"tail{sx}", xf(lathe([(0, 0), (0.13, 0), (0.13, 0.06), (0, 0.06)], 12), q, (PI / 2, yaw, 0)), "tail", R, 0)
        mesh(f"tailBezel{sx}", xf(torus(0.145, 0.03, 12, 5), (q[0] + math.sin(yaw) * 0.05, q[1], q[2] + math.cos(yaw) * 0.05), (PI / 2, yaw, 0)), "trim", R, 0)
    # one oval headlamp filling the nose cone, in a chrome bezel, its back half inside the cone (the end cap sits at z = 3.1)
    zn = H[-1]["z"]
    yn = H[-1].get("yc", 0.0) + (H[-1]["t"] - H[-1]["b"]) / 2
    ea, eb = 0.31, 0.155    # the lamp's half width and half height
    mesh("head", xf(lathe([(0, -0.05), (1.0, -0.05), (1.0, 0.04), (0, 0.04)], 24), (0, yn, zn), (PI / 2, 0, 0), (ea, 1, eb)), "lamp", R, 0)
    ring = [(math.cos(2 * PI * k / 28) * (ea + 0.015), yn + math.sin(2 * PI * k / 28) * (eb + 0.015), zn + 0.035) for k in range(29)]
    mesh("headBezel", tube(ring, [0.026] * len(ring), 6, False), "trim", R, 0.008)
    # chrome bumpers that wrap the nose and the tail along the hull's own flank (no bar hanging in the air)
    def bumper(name, zs, y, tip_z=None):
        """A tube along the left flank, 5 cm proud of the surface, and (with a tip) round the tip and back up the right flank;
        without a tip, a separate piece on each flank."""
        L = [(-(side_x(H, y, z) + 0.05), y, z) for z in zs]
        Rr = [(side_x(H, y, z) + 0.05, y, z) for z in reversed(zs)]
        if tip_z is None:
            mesh(name + "L", tube(L, [0.04] * len(L), 8, True), "trim", R, 0.02)
            mesh(name + "R", tube(Rr, [0.04] * len(Rr), 8, True), "trim", R, 0.02)
        else:
            pts = L + [(0.0, y, tip_z)] + Rr
            mesh(name, tube(pts, [0.04] * len(pts), 8, True), "trim", R, 0.02)
    bumper("bumperF", [1.9, 2.3, 2.7, 2.95], -0.1)
    bumper("bumperR", [-2.2, -2.6, -2.95, -3.15], -0.1, -3.3)
    yp = (top_y(H, 0, -3.22) + bot_y(H, 0, -3.22)) / 2 + 0.05
    mesh("plate", xf(rbox(0.22, 0.07, 0.03, 0.3, 6, 4), (0, yp, -3.22)), "roof", R, 0.012)
    # stubby tail fins with their feet in the deck, door handles on the flanks, mirrors on stalks
    for sx in (-1, 1):
        x, z = sx * 0.9, -2.6
        mesh(f"fin{sx}", xf(rbox(0.07, 0.17, 0.34, 0.5, 10, 6), (x, top_y(H, abs(x), z) + 0.07, z), (-0.3, 0, sx * -0.2)), "body", R, 0.03)
        p, yaw = flank(H, sx, 0.3, 0.0)
        mesh(f"handle{sx}", xf(rbox(0.03, 0.035, 0.2, 0.4, 6, 4), (p[0] - sx * 0.01, p[1], p[2])), "trim", R, 0.01)
        p, yaw = flank(H, sx, 0.4, 1.2)
        mesh(f"mirrorStalk{sx}", B((p[0] - sx * 0.04, p[1], p[2]), (p[0] + sx * 0.2, p[1] + 0.18, p[2] + 0.05), 0.025, 6, True), "trim", R, 0)
        mesh(f"mirror{sx}", xf(superquad(0.1, 0.075, 0.06, 0.8, 0.8, 8, 5), (p[0] + sx * 0.24, p[1] + 0.2, p[2] + 0.05)), "body", R, 0.02)
    # a hood ornament on a stem rooted in the hood
    oy = top_y(H, 0, 2.4)
    mesh("ornamentStem", B((0, oy - 0.03, 2.4), (0, oy + 0.1, 2.4), 0.03, 6, True), "trim", R, 0)
    mesh("ornament", xf(superquad(0.06, 0.08, 0.06, 0.8, 0.8, 8, 5), (0, oy + 0.15, 2.4)), "trim", R, 0.01)
    # a whip antenna rooted in the rear deck, on a little base, with a lamp at its tip
    ax, az = -0.6, -2.1
    ay = top_y(H, ax, az)
    mesh("whipBase", xf(lathe([(0.0, -0.05), (0.07, -0.05), (0.07, 0.04), (0.03, 0.07), (0, 0.07)], 10), (ax, ay, az)), "trim", R, 0)
    mesh("whip", B((ax, ay, az), (ax - 0.08, ay + 1.1, az - 0.28), 0.018, 5, True), "dark", R, 0)
    mesh("whipTip", xf(superquad(0.05, 0.05, 0.05, 1, 1, 8, 5), (ax - 0.08, ay + 1.1, az - 0.28)), "tail", R, 0)


def build_set(suffix, roof):
    RF = pivot("car_faction" + suffix, (0, 0, 0))
    RC = pivot("car_civilian" + suffix, (0, 0, 0))
    build_pods(RF, False, HULL_F)
    build_faction(RF, roof)
    build_pods(RC, True, HULL_C)
    build_civilian(RC, roof)
    for r in (RF, RC):
        r["radius"] = 3.4
        r["length"] = 6.5
        r["width"] = 3.9


# the game's cars (the roofs it uses); MOONRUNNER_ROOF_PREVIEW=1 also builds every roof option beside them, as car_faction_A and so on
build_set("", os.environ.get("HOVERCAR_ROOF", "none"))
if os.environ.get("MOONRUNNER_ROOF_PREVIEW") == "1":
    for _r in ("none", "A", "B"):
        build_set("_" + _r, _r)
print("built", len(C.objects), "objects")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)

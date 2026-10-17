# Gantry crane builder for Blender (4.2+ / 5.x): a rail-mounted portal gantry crane, exported to src/assets/gantry.glb.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_gantry.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_gantry.py
#
# The tower crane's little sibling for a container yard (the Meridian Exchange's), in the same family as build_crane.py: the same
# lattice work (square chords, a diagonal per face, splice plates, ladders and rest platforms), the same slot colours, and the very
# same trolley, rope falls, hook block and bridle slings, lifting the land-train's cargo container (cargo.py) on a spreader. Everything
# is authored in three.js axes; the origin is on the ground, midway between the rails. The girder runs along z between two legs at
# z = +-LEG, each on a sill with two rail bogies; the whole crane travels along x on its rails (the game moves the root). Pivots:
#   trolley   the carriage under the girder's bottom chords, a child of the root; the game slides it along z (it sits at z = 0)
#   cable     the two rope falls, a child of `trolley`: one metre long, hanging from its origin; the game scales y
#   hook      the hook block, hook and slings, a child of `trolley`; the game sets its y to minus the rope length
#   load      under `hook`: the spreader frame, and under that a `cargo` pivot (cargo.py's box container, lying along the girder) with
#             a `livery` pivot per faction; the game builds the livery of the crane's cargo and leaves the rest out
#   blinker   the aircraft warning lamps (the girder's ends, each leg's top); the game puts a blinking lamp on each
# The file also holds `gantry_box`, one box container of its own (a top-level `cargo` pivot, its origin the middle of its footprint on
# the ground) for the yard's stacks: the game bakes it per stack in a faction's colours.
# Slots: body (the crane's colour) is swapped by the game, the rest are fixed, as the tower crane's (craneSlot in src/models.js); the
# meshes under a `cargo` pivot take the land-train palette of a faction (cargoSlot). The `drop` extra on the hook is the distance from
# its origin to the container's bottom.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_gantry.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("GANTRY_OUT") or os.path.join(REPO, "src", "assets", "gantry.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Gantry crane export ->", OUT)
COLL = "MoonGantryCrane"

# preview colours (the game swaps in its own materials): the crane's slots, and the land-train's for the cargo units
SLOT_COLORS = {
    "body": (1.0, 0.82, 0.25), "dark": (0.16, 0.14, 0.25), "steel": (0.33, 0.38, 0.48), "concrete": (0.66, 0.65, 0.72),
    "white": (1.0, 0.96, 0.88), "glass": (0.81, 0.94, 1.0), "lamp": (1.0, 0.96, 0.66), "rope": (0.1, 0.09, 0.14),
    "metal": (0.54, 0.53, 0.63), "stripe": (1.0, 0.96, 0.88), "label": (0.16, 0.14, 0.25), "accent": (0.42, 0.56, 0.23),
    "hazard": (1.0, 0.82, 0.25), "tail": (1.0, 0.16, 0.29), "tire": (0.1, 0.09, 0.14), "hot": (1.0, 0.62, 0.11),
    "tank": (0.78, 0.84, 0.92), "brand": (0.08, 0.64, 0.72), "redsafe": (0.79, 0.13, 0.18), "orange": (1.0, 0.48, 0.1), "blue": (0.11, 0.39, 0.84),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "decals.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "cargo.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)

PI = math.pi
LEG = 15.0        # the legs (and the rails) at z = +-LEG
YB, YT, JW = 23.0, 24.9, 0.85   # the girder: bottom chords (the trolley's rails) at y YB, x +-JW; the top chord at y YT
GL = LEG + 2.2    # the girder's half length (it overhangs the legs)
MW = 1.0          # a leg's half width (the tower crane's mast section)
Y0 = 1.9          # the legs stand on the sills from here


def M(name, geo, slot, parent, ink=0.04, **kw):
    return mesh("gantry_" + name, geo, slot, parent, ink, **kw)


def PV(name, pos, parent=None, **props):
    return pivot("gantry_" + name if parent is not None else name, pos, parent, **props)


def rb(name, hx, hy, hz, pos, slot, parent, ink=0.04, e=0.08, rot=(0, 0, 0), nu=6, nv=3):
    return M(name, xf(rbox(hx, hy, hz, e, nu, nv), pos, rot), slot, parent, ink)


def box(hx, hy, hz, pos, e=0.05):
    return xf(rbox(hx, hy, hz, e, 4, 2), pos)


def wheel(r, hw, pos, axis):
    """A wheel of radius r, hw half-wide, its axle along `axis` ('x' or 'z')."""
    g = lathe([(0.0, -hw), (r, -hw), (r, hw), (0.0, hw)], 12)
    return xf(g, pos, (0, 0, PI / 2) if axis == "x" else (PI / 2, 0, 0))


# ---------------------------------------------------------------------------------------------------------------
root = PV("gantry", (0, 0, 0), None)
root["height"] = YB
root["leg"] = LEG
root["travel"] = 0.0

corners = [(-MW, -MW), (MW, -MW), (MW, MW), (-MW, MW)]
for side, sz in (("N", -1), ("P", 1)):
    zc = sz * LEG
    # ---- the sill: a box beam along x on two bogies, each with two flanged wheels on the rail, buffers at its ends, a rail sweep ----
    rb(f"sill{side}", 3.4, 0.36, 0.55, (0, 1.5, zc), "body", root, 0.05, e=0.06)
    rb(f"sillCap{side}", 3.5, 0.08, 0.62, (0, 1.9, zc), "dark", root, 0.03, e=0.05)
    for bx in (-2.3, 2.3):
        rb(f"bogie{side}{bx}", 0.95, 0.28, 0.42, (bx, 0.72, zc), "dark", root, 0.04, e=0.06)
        rb(f"bogieArm{side}{bx}", 0.3, 0.28, 0.3, (bx, 1.14, zc), "steel", root, 0.03, e=0.06)
        for wx in (-0.55, 0.55):
            M(f"wheel{side}{bx}{wx}", wheel(0.36, 0.14, (bx + wx, 0.36, zc), "z"), "steel", root, 0.03)
            M(f"flange{side}{bx}{wx}", wheel(0.42, 0.04, (bx + wx, 0.36, zc + 0.17), "z"), "dark", root, 0.02)
        rb(f"sweep{side}{bx}", 1.1, 0.06, 0.2, (bx, 0.07, zc), "dark", root, 0.02, e=0.05)
    for bx in (-3.55, 3.55):
        rb(f"buffer{side}{bx}", 0.15, 0.22, 0.22, (bx, 1.5, zc), "dark", root, 0.03, e=0.1)
    # ---- the leg: the tower crane's lattice mast section, Y0 up to the girder, on a foot plate ----
    rb(f"foot{side}", 1.35, 0.12, 1.35, (0, Y0 - 0.12, zc), "steel", root, 0.04, e=0.04)
    SECT = 6
    levels = [Y0 + (YB - Y0) * i / SECT for i in range(SECT + 1)]
    cn = [(cx, zc + cz) for cx, cz in corners]
    M(f"legChords{side}", join([B((cx, Y0 - 0.1, cz), (cx, YB - 0.1, cz), 0.19, 6) for cx, cz in cn]), "body", root, 0.05)
    diags = []
    for i in range(SECT):
        ya, yb = levels[i], levels[i + 1]
        for f in range(4):
            (ax, az), (bx, bz) = cn[f], cn[(f + 1) % 4]
            if (i + f) % 2:
                diags.append(B((ax, ya, az), (bx, yb, bz), 0.09))
            else:
                diags.append(B((bx, ya, bz), (ax, yb, az), 0.09))
    for y in levels[:-1]:
        for f in range(4):
            (ax, az), (bx, bz) = cn[f], cn[(f + 1) % 4]
            diags.append(B((ax, y, az), (bx, y, bz), 0.1))
    M(f"legBracing{side}", join(diags), "body", root, 0.03)
    M(f"splice{side}", join([box(0.3, 0.18, 0.3, (cx, y, cz), 0.03) for y in levels[1:-1] for cx, cz in cn]), "steel", root, 0.03)
    # the head: a steel cap the girder sits on, with a gusset knee down the girder's underside either way along z
    rb(f"legCap{side}", 1.25, 0.22, 1.25, (0, YB - 0.1, zc), "steel", root, 0.04, e=0.05)
    knees = []
    for dz in (-1, 1):
        for cx in (-JW, JW):
            knees.append(B((cx, YB - 3.6, zc + dz * MW), (cx, YB - 0.2, zc + dz * 4.2), 0.11, 5))
    M(f"knees{side}", join(knees), "body", root, 0.03)
    # a ladder up the leg's outer face (the side away from the other leg), a rest platform half way, a platform at the top
    lz = zc + sz * (MW + 0.22)
    lad = [B((-0.28, Y0, lz), (-0.28, YB - 0.6, lz), 0.03), B((0.28, Y0, lz), (0.28, YB - 0.6, lz), 0.03)]
    y = Y0 + 0.4
    while y < YB - 0.7:
        lad.append(B((-0.28, y, lz), (0.28, y, lz), 0.022))
        y += 0.55
    M(f"ladder{side}", join(lad), "steel", root, 0)
    pl, rails = [], []
    for y in (levels[2], YB + 0.3):
        pl.append(box(1.55, 0.05, 1.55, (0, y - 0.08, zc), 0.02))
        ring = [(-1.55, zc - 1.55), (1.55, zc - 1.55), (1.55, zc + 1.55), (-1.55, zc + 1.55)]
        posts = ring + [(0, zc - 1.55), (1.55, zc), (0, zc + 1.55), (-1.55, zc)]
        for px, pz in posts:
            rails.append(B((px, y - 0.05, pz), (px, y + 1.1, pz), 0.045, 5, True))
        for hh in (0.55, 1.1):
            for a in range(4):
                (ax, az), (bx, bz) = ring[a], ring[(a + 1) % 4]
                rails.append(B((ax, y + hh, az), (bx, y + hh, bz), 0.04, 5, True))
    M(f"platforms{side}", join(pl), "steel", root, 0.03)
    M(f"handrails{side}", join(rails), "body", root, 0)
    # a floodlight on each leg's top platform, shining into the yard
    rb(f"floodArm{side}", 0.06, 0.06, 0.9, (1.2, YB + 1.3, zc - sz * 1.5), "dark", root, 0, e=0.2)
    rb(f"flood{side}", 0.32, 0.2, 0.2, (1.2, YB + 1.3, zc - sz * 2.4), "dark", root, 0.03, e=0.1, rot=(sz * 0.6, 0, 0))
    rb(f"floodLamp{side}", 0.26, 0.14, 0.03, (1.2, YB + 1.3 - 0.13 * sz, zc - sz * 2.55), "lamp", root, 0, e=0.2, rot=(sz * 0.6, 0, 0))
    PV(f"blinkLeg{side}", (0, YB + 1.75, zc), root, role="blinker", radius=0.28)

# ---- the girder: the tower crane's jib truss laid across the legs, two bottom chords with the trolley's rails and one top chord ----
NZ = 14
zs = [-GL + 2 * GL * i / NZ for i in range(NZ + 1)]
gb = [B((-JW, YB, -GL), (-JW, YB, GL), 0.18, 6, True), B((JW, YB, -GL), (JW, YB, GL), 0.18, 6, True), B((0, YT, -GL), (0, YT, GL), 0.18, 6, True)]
gd = []
for i in range(NZ):
    za, zm, zb = zs[i], (zs[i] + zs[i + 1]) / 2, zs[i + 1]
    for x in (-JW, JW):
        gd.append(B((x, YB, za), (0, YT, zm), 0.095))
        gd.append(B((0, YT, zm), (x, YB, zb), 0.095))
    gd.append(B((-JW, YB, za), (JW, YB, za), 0.1))
gd.append(B((-JW, YB, zs[-1]), (JW, YB, zs[-1]), 0.1))
M("girderChords", join(gb), "body", root, 0.05)
M("girderLattice", join(gd), "body", root, 0.03)
M("girderRails", join([box(0.16, 0.05, GL - 0.3, (-0.62, YB - 0.18, 0)), box(0.16, 0.05, GL - 0.3, (0.62, YB - 0.18, 0))]), "steel", root, 0.02)
for sz in (-1, 1):
    rb(f"girderEnd{sz}", 1.0, 1.0, 0.14, (0, YB + 0.95, sz * (GL + 0.1)), "steel", root, 0.04, e=0.05)
    for x in (-0.62, 0.62):
        rb(f"stop{sz}{x}", 0.2, 0.2, 0.18, (x, YB - 0.1, sz * (GL - 1.0)), "dark", root, 0.02, e=0.1)
    PV(f"blinkEnd{sz}", (0, YT + 0.45, sz * (GL + 0.3)), root, role="blinker", radius=0.3)
# a walkway along the girder's top chord: a grating with a handrail one side
M("walkway", join([box(0.55, 0.03, GL - 0.5, (0, YT + 0.25, 0), 0.01)]), "steel", root, 0.02)
wr = [B((0.6, YT + 0.25, -GL + 0.5), (0.6, YT + 1.3, -GL + 0.5), 0.035, 4, True)]
z = -GL + 0.5
while z <= GL - 0.5:
    wr.append(B((0.6, YT + 0.25, z), (0.6, YT + 1.3, z), 0.035, 4, True))
    z += 3.0
for hh in (0.65, 1.3):
    wr.append(B((0.6, YT + hh, -GL + 0.5), (0.6, YT + hh, GL - 0.5), 0.035, 4, True))
M("walkRail", join(wr), "body", root, 0)
# the hoist house on the girder's end over the -z leg, and its electrical cabinet
rb("hoistHouse", 1.0, 0.95, 1.65, (0, YT + 0.3 + 0.95, -LEG + 0.6), "body", root, 0.05, e=0.06)
rb("hoistRoof", 1.1, 0.07, 1.75, (0, YT + 0.3 + 1.95, -LEG + 0.6), "dark", root, 0.03, e=0.06)
M("hoistVents", join([box(0.02, 0.035, 1.0, (1.01, YT + 0.3 + 0.55 + k * 0.28, -LEG + 0.6), 0.01) for k in range(5)]), "dark", root, 0)
M("hoistStack", B((-0.5, YT + 0.3 + 1.9, -LEG + 1.8), (-0.5, YT + 0.3 + 3.0, -LEG + 1.8), 0.13, 6, True), "dark", root, 0.03)

# ---- the operator's cab: the tower crane's, hung under the girder beside the +z leg's knee, looking along the yard ----
cab_p = (2.15, YB - 3.3, LEG - 6.0)
rb("cabBody", 1.05, 1.0, 1.15, (cab_p[0], cab_p[1] + 1.0, cab_p[2]), "white", root, 0.05, e=0.1)
rb("cabFloor", 1.1, 0.08, 1.2, (cab_p[0], cab_p[1] - 0.05, cab_p[2]), "dark", root, 0.03, e=0.06)
rb("cabRoof", 1.15, 0.07, 1.25, (cab_p[0], cab_p[1] + 2.09, cab_p[2]), "dark", root, 0.03, e=0.08)
rb("cabFront", 0.82, 0.66, 0.03, (cab_p[0], cab_p[1] + 1.15, cab_p[2] - 1.17), "glass", root, 0, e=0.2)
rb("cabSide", 0.03, 0.6, 0.8, (cab_p[0] + 1.07, cab_p[1] + 1.2, cab_p[2] + 0.1), "glass", root, 0, e=0.2)
rb("cabSideB", 0.03, 0.6, 0.5, (cab_p[0] - 1.07, cab_p[1] + 1.2, cab_p[2] + 0.1), "glass", root, 0, e=0.2)
rb("cabAC", 0.42, 0.2, 0.55, (cab_p[0], cab_p[1] + 2.3, cab_p[2] + 0.3), "steel", root, 0.03, e=0.1)
M("cabHangers", join([B((cab_p[0] - 0.8, cab_p[1] + 2.1, cab_p[2] + dz), (JW, YB - 0.1, cab_p[2] + dz), 0.07, 5, True) for dz in (-0.8, 0.8)] + [B((cab_p[0] + 0.8, cab_p[1] + 2.1, cab_p[2] + dz), (JW, YB - 0.1, cab_p[2] + dz), 0.07, 5, True) for dz in (-0.8, 0.8)]), "steel", root, 0)
for k, dx in enumerate((-0.5, 0.5)):
    rb(f"flood{k}", 0.13, 0.13, 0.2, (cab_p[0] + dx, cab_p[1] + 2.33, cab_p[2] - 1.0), "dark", root, 0.02, e=0.15)
    rb(f"floodLamp{k}", 0.1, 0.1, 0.03, (cab_p[0] + dx, cab_p[1] + 2.33, cab_p[2] - 1.22), "lamp", root, 0, e=0.2)

# ---------------------------------------------------------------------------------------------------------------
# the trolley: the tower crane's carriage, turned to run along z under the girder's bottom chords
trolley = PV("trolley", (0, YB - 0.2, 0), root, role="trolley")
M("trolleyPlates", join([box(0.05, 0.34, 0.9, (x, 0.3, 0), 0.02) for x in (-0.98, 0.98)]), "dark", trolley, 0.03)
M("trolleyBars", join([box(1.0, 0.09, 0.09, (0, 0.45, z), 0.02) for z in (-0.65, 0.65)]), "steel", trolley, 0.02)
for x in (-0.98, 0.98):
    for z in (-0.55, 0.55):
        M(f"trolleyWheel{x}_{z}", wheel(0.22, 0.06, (x, 0.38, z), "x"), "steel", trolley, 0.02)
rb("sheaveHouse", 0.5, 0.38, 0.55, (0, -0.32, 0), "body", trolley, 0.04, e=0.1)
for dz in (-0.2, 0.2):
    M(f"sheave{dz}", wheel(0.3, 0.45, (0, -0.55, dz), "x"), "dark", trolley, 0.02)

# the rope: two falls, one metre long, hanging from the trolley (the game stretches them to the hook)
cable = PV("cable", (0, -0.7, 0), trolley, role="cable")
M("ropes", join([B((x, 0, 0), (x, -1.0, 0), 0.05, 4, True) for x in (-0.22, 0.22)]), "rope", cable, 0.02)

# the hook block: the tower crane's, with its sheaves, swivel and hook, and the slings to the load's spreader
hook = PV("hook", (0, -0.7, 0), trolley, role="hook")
rb("hookBlock", 0.4, 0.55, 0.52, (0, -0.55, 0), "body", hook, 0.04, e=0.12)
M("hookSheave", wheel(0.3, 0.5, (0, -0.22, 0), "x"), "dark", hook, 0.02)
M("hookSwivel", xf(lathe([(0.0, 0.0), (0.2, 0.0), (0.2, 0.4), (0.0, 0.4)], 8), (0, -1.45, 0)), "steel", hook, 0.02)
arc = [(0.0, -1.75), (0.0, -2.0)]
for t in range(1, 13):
    a = PI - t / 12 * PI * 1.5
    arc.append((0.34 + 0.34 * math.cos(a), -2.0 + 0.34 * math.sin(a)))
M("hookIron", tube([(0, y, x) for x, y in arc], [0.1] * len(arc), 6, True), "dark", hook, 0.03)
rb("hookLatch", 0.05, 0.2, 0.04, (0, -2.28, 0.46), "body", hook, 0, e=0.2)

# ---- the load: a spreader frame (four beams on the top castings with a twist-lock stub in each, a spine with a lifting eye, a lug at
# each corner) over the land-train's box container (cargo.py, at the land-train's size: 7.2 m along z), on the bottom of four bridle
# slings from the hook. The container's origin (the middle of its footprint, under its rack) is the load pivot's.
SY = 5.05 - CARGO_BASE               # the spreader's height over the container's origin (on the top castings)
LOAD_Y = -(2.0 + 3.2 + SY + 0.3)     # hook origin -> container bottom: the slings' 3.2 m plus the spreader
LOAD_DROP = -LOAD_Y
load = PV("load", (0, LOAD_Y, 0), hook, role="load")


def rbj(items, e=0.3, nu=6, nv=4):
    return join([xf(rbox(hx, hy, hz, e, nu, nv), pos) for hx, hy, hz, pos in items])


M("spreader", rbj([(0.1, 0.08, 3.75, (sx * 1.5, SY, 0)) for sx in (-1, 1)] + [(1.6, 0.08, 0.1, (0, SY, sz * 3.55)) for sz in (-1, 1)] + [(0.16, 0.1, 3.4, (0, SY + 0.05, 0))], e=0.2), "steel", load, 0.04)
M("twistLocks", join([xf(lathe([(0.0, SY - 0.27), (0.1, SY - 0.27), (0.1, SY - 0.07), (0.0, SY - 0.07)], 8), (sx * 1.5, 0, sz * 3.55)) for sx in (-1, 1) for sz in (-1, 1)]), "dark", load, 0.02)
M("lugs", rbj([(0.16, 0.12, 0.16, (sx * 1.5, SY + 0.17, sz * 3.55)) for sx in (-1, 1) for sz in (-1, 1)], e=0.3), "dark", load, 0.03)
M("liftEye", join([xf(torus(0.2, 0.05, 12, 6), (0, SY + 0.35, 0), (PI / 2, 0, 0))]), "dark", load, 0.02)
M("slings", join([B((0, -2.0, 0), (sx * 1.5, LOAD_Y + SY + 0.3, sz * 3.55), 0.04, 4, True) for sx in (-1, 1) for sz in (-1, 1)]), "dark", hook, 0)
cargo_unit("box", "gantry_cargo", load, (0, 0, 0), 1.0)
hook["drop"] = round(LOAD_DROP, 3)

# ---------------------------------------------------------------------------------------------------------------
# a box container on its own, for the yard's stacks (the game paints and bakes it per stack)
yard = cargo_unit("box", "gantry_box", None, (0, 0, 0), 1.0)

objs = [o for o in C.objects]
tris = sum(len(o.data.polygons) for o in objs if o.type == "MESH")
print("meshes:", sum(1 for o in objs if o.type == "MESH"), "polygons:", tris)
export(OUT, objs)
if os.environ.get("GANTRY_BLEND"):
    bpy.ops.wm.save_as_mainfile(filepath=os.environ["GANTRY_BLEND"])

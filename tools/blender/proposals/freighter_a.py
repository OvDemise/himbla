# PROPOSAL A for the large freighter: "ATLAS", an armoured refit of today's hammerhead.
#
# The same silhouette and the same rig (see build_ships.py: legs, belly ramp, lift jets, four bells, the walkable roof with its
# landing pad, container racks down both flanks) but heavier and more industrial: a squared, plated hull; a stepped bridge block;
# a proper gantry cage round each side's four cargo slots (portal frames, crane rail with a trolley, status lamps, clamp pistons);
# a dorsal landing deck with a kerb, tie-down grid and approach lights; shorter, bolted radiator wings; pipe runs and junction
# boxes along the shoulders; an armoured stern block with an exhaust manifold.
#
#   MOONRUNNER_REPO=<repo> python3 freighter_a.py [<out-prefix for previews>]      (or exec() it in Blender)
# Authored in three.js axes (x right, y up, +z nose), origin = hull centre, belly y = -5, deck top y = +5, like the current ship.

import bpy, bmesh, math, os, sys
from mathutils import Vector, Euler

REPO = os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", ".")), "..", "..", ".."))
os.environ["MOONRUNNER_REPO"] = REPO
_src = open(os.path.join(REPO, "tools", "blender", "build_ships.py"), encoding="utf-8").read()
exec(_src[:_src.index("# SHUTTLE-BUS")], globals())   # the shared helpers, slots, leg / bay / plume builders
COLL = "MoonFreighterA"
C = coll()
PI = math.pi

GEAR_F = 10.0
BELLY_F = -5.0
F = ship_root("freighter")
FR, FH = F["root"], F["_hull"]


def M(name, geo, slot, parent=None, ink=0.06):
    return mesh("a_" + name, geo, slot, parent or FH, ink)


def RB(name, h, pos, slot, parent=None, ink=0.05, e=0.12, rot=(0, 0, 0), nu=8, nv=4):
    """A rounded box (half extents h) placed at pos."""
    return M(name, xf(rbox(h[0], h[1], h[2], e, nu, nv), pos, rot), slot, parent, ink)


# ---- the hull: squared and plated, a blunt chisel bow ----
SECS = [
    {"z": -28.4, "w": 7.2, "t": 4.6, "b": 4.6, "eT": 9, "eB": 9},
    {"z": -27.2, "w": 8.0, "t": 5.0, "b": 5.0, "eT": 10, "eB": 12},
    {"z": 18.0, "w": 8.0, "t": 5.0, "b": 5.0, "eT": 10, "eB": 12},
    {"z": 23.0, "w": 7.7, "t": 4.7, "b": 5.0, "eT": 8, "eB": 11},
    {"z": 27.5, "w": 6.4, "t": 3.5, "b": 4.5, "eT": 6, "eB": 8},
    {"z": 31.0, "w": 4.2, "t": 1.9, "b": 3.5, "eT": 4, "eB": 5},
    {"z": 33.0, "w": 2.0, "t": 0.7, "b": 1.9, "eT": 3, "eB": 3.5},
    {"z": 33.7, "w": 0.6, "t": -0.3, "b": 0.6, "eT": 2.2, "eB": 2.2},
]
M("hull", loft(SECS, 48), "body", FH, 0.28)
# livery belt (broad) with a trim pinstripe above it, a hazard sill below
M("belt", cband(SECS, 0.05, 0.4, 2.0, zlo=-26.5, zhi=27.0, step=0.5, n=170), "stripe", FH, 0)
M("pin", cband(SECS, 0.055, 2.3, 2.55, zlo=-26.5, zhi=27.0, step=0.5, n=170), "trim", FH, 0)
M("sill", cband(SECS, 0.05, -3.7, -3.35, zlo=-26.5, zhi=24.0, step=0.5, n=170), "hazard", FH, 0)
# armour: vertical frame ribs (chunkier than the old straps), and bolted plates between them
for k, z in enumerate(range(-24, 21, 6)):
    sec = lerp_sec(SECS, z)
    M(f"rib{k}", keep(loft(grow([{**sec, "z": z - 0.5}, {**sec, "z": z + 0.5}], 0.13), 48, False, False), lambda c: c[1] < 4.6), "trim", FH, 0.06)
for side in (-1, 1):
    for k, z in enumerate(range(-21, 18, 6)):
        sec = lerp_sec(SECS, z)
        x = surf_x(sec, 3.1) + 0.05
        M(f"plate{side}{k}", xf(rbox(0.07, 0.75, 1.9, 0.2, 6, 3), (side * x, 3.1, z)), "dark", FH, 0.03)
        for dz in (-1.5, 1.5):
            M(f"bolt{side}{k}{dz}", xf(superquad(0.12, 0.12, 0.12, 1, 1, 6, 4), (side * (x + 0.08), 3.1, z + dz)), "steel", FH, 0)

# ---- the dorsal landing deck: a plated roof, a kerb with lights, a tie-down grid, a big pad with approach lights ----
M("deck", xf(rbox(6.9, 0.14, 22.6, 0.08, 16, 4), (0, 5.0, -3.0)), "deck", FH, 0.06)
for side in (-1, 1):
    M(f"kerb{side}", xf(rbox(0.22, 0.2, 22.5, 0.3, 8, 4), (side * 6.75, 5.12, -3.0)), "hazard", FH, 0)
    for k in range(10):
        z = -23.5 + k * 4.9
        M(f"kerbLamp{side}{k}", xf(superquad(0.2, 0.2, 0.2, 1, 1, 8, 4), (side * 6.75, 5.45, z)), "window", FH, 0)
        M(f"kerbPost{side}{k}", xf(lathe([(0, 0), (0.3, 0), (0.22, 0.25), (0.22, 0.3), (0, 0.3)], 8), (side * 6.75, 5.2, z)), "steel", FH, 0.02)
for xi in (-3.6, 3.6):          # tie-down rails with eyelets, flush with the roof
    M(f"tieRail{xi}", xf(rbox(0.12, 0.05, 20.0, 0.3, 6, 3), (xi, 5.12, -3.0)), "dark", FH, 0)
    for k in range(9):
        M(f"tie{xi}{k}", xf(torus(0.22, 0.05, 10, 4), (xi, 5.17, -20.0 + k * 4.5)), "steel", FH, 0)
PAD_Z = -7.0
M("padDisc", xf(lathe([(0, 0), (5.2, 0), (5.2, 0.04), (0, 0.04)], 40), (0, 5.1, PAD_Z)), "dark", FH, 0)
M("padRing", xf(torus(4.7, 0.2, 40, 4), (0, 5.17, PAD_Z)), "hazard", FH, 0)
M("padRing2", xf(torus(3.0, 0.1, 32, 4), (0, 5.17, PAD_Z)), "hazard", FH, 0)
M("padH", merge(xf(rbox(0.3, 0.05, 1.9, 0.3, 6, 4), (-1.15, 5.18, PAD_Z)), xf(rbox(0.3, 0.05, 1.9, 0.3, 6, 4), (1.15, 5.18, PAD_Z)), xf(rbox(1.15, 0.05, 0.28, 0.3, 6, 4), (0, 5.18, PAD_Z))), "hazard", FH, 0)
for k in range(8):               # lights set into the pad's rim
    a = k * PI / 4
    M(f"padLamp{k}", xf(superquad(0.22, 0.1, 0.22, 1, 1, 8, 4), (math.sin(a) * 5.4, 5.14, PAD_Z + math.cos(a) * 5.4)), "cabin", FH, 0)
for k in range(5):               # approach lights toward the bow, and chevrons
    M(f"approach{k}", xf(superquad(0.2, 0.08, 0.2, 1, 1, 8, 4), (0, 5.14, 1.0 + k * 2.4)), "cabin" if k % 2 else "window", FH, 0)
for k in range(3):
    M(f"chevron{k}", xf(extrude([(0, 0), (1.5, -1.2), (1.5, -1.9), (0, -0.7), (-1.5, -1.9), (-1.5, -1.2)], 0.1, "y"), (0, 5.12, -19.0 - k * 1.7)), "hazard", FH, 0)

# ---- the bridge: a stepped block with a glass slit, buttresses, a radar dish and a sign ----
RB("bridgeLo", (5.3, 2.3, 7.0), (0, 7.2, 19.0), "trim", ink=0.2, e=0.2)
RB("bridgeBelt", (5.36, 0.35, 7.05), (0, 6.3, 19.0), "stripe", ink=0, e=0.2)
for side in (-1, 1):             # raked buttresses where the block meets the hull
    M(f"buttress{side}", xf(extrude([(-7.0, 0), (7.0, 0), (5.2, 3.6), (-5.6, 3.6)], 0.5, "x"), (side * 4.9, 5.0, 19.0)), "trim", FH, 0.1)
RB("bridgeHi", (3.9, 1.7, 4.3), (0, 11.2, 20.6), "trim", ink=0.18, e=0.25)
RB("bridgeGlass", (4.0, 0.62, 4.4), (0, 11.5, 20.7), "glass", ink=0, e=0.25)
for side in (-1, 1):
    RB(f"bridgePost{side}", (0.2, 0.7, 0.3), (side * 3.5, 11.5, 24.9), "dark", ink=0.03, e=0.2)
    RB(f"bridgeSide{side}", (0.06, 0.55, 3.0), (side * 3.96, 11.5, 19.8), "glass", ink=0, e=0.3)
RB("bridgeRoof", (3.5, 0.28, 4.0), (0, 13.2, 20.2), "dark", ink=0.06, e=0.25)
for side in (-1, 1):             # searchlights on the roof's front corners
    M(f"search{side}", xf(lathe([(0, 0), (0.55, 0), (0.7, 0.5), (0, 0.5)], 12), (side * 2.8, 13.45, 23.2), (-1.2, 0, 0)), "dark", FH, 0.03)
    M(f"searchLens{side}", xf(superquad(0.5, 0.5, 0.12, 1, 1, 10, 5), (side * 2.8, 13.9, 23.75), (-0.55, 0, 0)), "window", FH, 0)
M("mast", beam((1.9, 13.4, 17.0), (1.9, 19.2, 16.6), 0.14, 6), "dark", FH, 0.03)
M("mastLight", xf(superquad(0.3, 0.3, 0.3, 1, 1, 10, 6), (1.9, 19.4, 16.6)), "white", FH, 0)
M("dishPost", beam((-1.6, 13.4, 20.2), (-1.6, 15.0, 20.2), 0.25, 8), "dark", FH, 0.03)
M("dish", xf(lathe([(0, 0.0), (1.4, 0.15), (2.2, 0.62), (2.25, 0.7), (0, 0.25)], 20), (-1.6, 15.2, 20.2), (0.5, 0, 0.25)), "white", FH, 0.05)
RB("sign", (2.4, 0.5, 0.08), (0, 7.4, 26.15), "dark", ink=0.04, e=0.2)
RB("signLit", (2.2, 0.36, 0.1), (0, 7.4, 26.2), "sign", ink=0, e=0.25)
for side in (-1, 1):
    M(f"head{side}", xf(superquad(0.75, 0.32, 0.18, 0.4, 0.5, 12, 6), (side * 2.4, -1.7, 32.4), (0.1, side * 0.5, 0)), "window", FH, 0)
M("chin", xf(rbox(5.0, 0.55, 1.8, 0.25), (0, -4.7, 29.0)), "dark", FH, 0.08)
for k in range(5):               # a bumper's hazard ribs
    M(f"chinRib{k}", xf(rbox(0.5, 0.58, 0.12, 0.3), (-2.0 + k, -4.7, 30.0)), "hazard", FH, 0)

# bow plating: armour plates following the taper, a hazard bumper, tow lugs
for side in (-1, 1):
    for z, yaw in ((24.5, 0.18), (28.0, 0.5)):
        sec = lerp_sec(SECS, z)
        RB(f"bowPlate{side}{z}", (0.09, 1.7, 1.7), (side * (surf_x(sec, 1.0) + 0.05), 1.0, z), "dark", ink=0.03, e=0.2, rot=(0, -side * yaw, 0))
        for dz in (-1.1, 1.1):
            M(f"bowBolt{side}{z}{dz}", xf(superquad(0.13, 0.13, 0.13, 1, 1, 6, 4), (side * (surf_x(sec, 1.0) + 0.12), 1.0 + (0.9 if dz > 0 else -0.9), z + dz * 0.5)), "steel", FH, 0)
    M(f"towLug{side}", xf(torus(0.5, 0.12, 12, 5), (side * 3.2, -3.4, 31.6), (0, 0, PI / 2)), "steel", FH, 0.03)
for k in range(4):
    M(f"bumper{k}", xf(extrude([(0, 0), (0.9, 0.9), (0.9, 0.0)], 0.4, "x"), (-1.8 + k * 0.9, -4.1, 30.2)), "hazard", FH, 0)
# bridge windows and vents
for side in (-1, 1):
    for k in range(4):
        RB(f"bridgeWin{side}{k}", (0.06, 0.3, 0.7), (side * 5.34, 8.0, 14.5 + k * 2.6), "window", ink=0, e=0.3)
for k in range(5):
    RB(f"bridgeVent{k}", (2.6, 0.08, 0.12), (0, 7.0 + k * 0.32, 12.0), "dark", ink=0, e=0.3)
# ---- the cargo gantry: four slots down each flank, in a portal-frame cage with a crane rail and status lamps ----
SLOT_Z = [-18.5, -9.5, -0.5, 8.5]
FRAME_Z = [-23.0, -14.0, -5.0, 4.0, 13.0]
CX = 10.7                    # a container's centre (x), clear of the hull flank at 8
EMPTY = {(-1, 2), (1, 1)}    # one slot per side stands empty, to show the guides and the crane
CY = -1.6


def container(side, k, slot, z):
    X = side * CX
    n = f"c{side}{k}"
    RB(n, (2.6, 2.5, 4.0), (X, CY, z), slot, ink=0.12, e=0.07, nu=16, nv=6)
    for i in range(-4, 5):       # corrugation: slim vertical ribs down the outer face
        RB(f"{n}r{i}", (0.06, 2.3, 0.1), (X + side * 2.63, CY, z + i * 0.85), slot, ink=0, e=0.4, nu=4, nv=3)
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):   # corner castings
                RB(f"{n}k{sx}{sy}{sz}", (0.3, 0.3, 0.32), (X + sx * 2.45, CY + sy * 2.3, z + sz * 3.8), "dark", ink=0.03, e=0.25, nu=6, nv=3)
    RB(f"{n}band", (0.07, 0.42, 3.2), (X + side * 2.66, CY + 1.2, z), "trim", ink=0, e=0.3)
    RB(f"{n}num", (0.08, 0.22, 0.9), (X + side * 2.7, CY + 1.2, z - 1.4), "dark", ink=0, e=0.3)


def empty_slot(side, k, z):
    X = side * CX
    n = f"e{side}{k}"
    RB(n + "floor", (2.5, 0.12, 3.9), (X, CY - 2.4, z), "dark", ink=0.04, e=0.2)
    for sz in (-1, 1):           # guide posts with angled lead-ins
        RB(f"{n}g{sz}", (0.16, 2.4, 0.16), (X + side * 2.2, CY, z + sz * 3.8), "steel", ink=0.03, e=0.3)
        M(f"{n}lead{sz}", xf(extrude([(0, 0), (0.6, 0.5), (0.6, 0.0)], 0.3, "x"), (X + side * 2.2 - 0.15, CY - 2.4, z + sz * 3.8 - 0.1)), "hazard", FH, 0)
    RB(n + "back", (0.05, 2.3, 3.7), (X - side * 2.2, CY, z), "bay", ink=0, e=0.3)


for side in (-1, 1):
    # rails: the top beam (trim, hazard end caps), a lower steel rail, and the hull-side runners
    RB(f"railTop{side}", (0.4, 0.34, 19.2), (side * 13.4, 1.55, -5.0), "trim", ink=0.06, e=0.3)
    RB(f"railTopH{side}", (0.42, 0.06, 19.2), (side * 13.4, 1.9, -5.0), "hazard", ink=0, e=0.4)
    RB(f"railLow{side}", (0.34, 0.3, 19.2), (side * 13.4, -4.55, -5.0), "steel", ink=0.05, e=0.3)
    RB(f"railIn{side}", (0.3, 0.28, 19.0), (side * 8.3, -4.3, -5.0), "steel", ink=0.05, e=0.3)
    RB(f"craneRail{side}", (0.12, 0.1, 19.0), (side * 13.4, 2.05, -5.0), "dark", ink=0.02, e=0.4)
    for zi, z in enumerate(FRAME_Z):   # a portal frame between each pair of slots: an outer post and ties to the hull
        RB(f"post{side}{zi}", (0.3, 3.35, 0.3), (side * 13.4, -1.5, z), "steel", ink=0.06, e=0.25)
        M(f"tieT{side}{zi}", beam((side * 8.2, 1.4, z), (side * 13.4, 1.4, z), 0.2, 6), "steel", FH, 0.03)
        M(f"tieB{side}{zi}", beam((side * 8.2, -4.3, z), (side * 13.4, -4.3, z), 0.2, 6), "steel", FH, 0.03)
        M(f"knee{side}{zi}", beam((side * 13.4, -3.4, z), (side * 11.4, -4.3, z), 0.14, 5), "dark", FH, 0.02)
        M(f"kneeT{side}{zi}", beam((side * 13.4, 0.4, z), (side * 11.4, 1.4, z), 0.14, 5), "dark", FH, 0.02)
    for k, z in enumerate(SLOT_Z):
        # clamp pistons: a pair of rams from the lower rail up under the container, and a hold-down at the top
        for dz in (-2.4, 2.4):
            M(f"ram{side}{k}{dz}", beam((side * 11.4, -4.3, z + dz), (side * 11.4, -3.6, z + dz), 0.2, 8), "metal", FH, 0.03)
        # the slot's lamp board on the top rail: green occupied, red empty, and its number plate
        lamp = "red" if (side, k) in EMPTY else "green"
        M(f"lamp{side}{k}", xf(superquad(0.22, 0.22, 0.22, 1, 1, 8, 5), (side * 13.4, 2.25, z - 3.2)), lamp, FH, 0)
        RB(f"slotNo{side}{k}", (0.07, 0.3, 0.7), (side * 13.78, 1.55, z), "dark", ink=0, e=0.3)
        RB(f"slotNoLit{side}{k}", (0.08, 0.2, 0.5), (side * 13.82, 1.55, z), "sign", ink=0, e=0.3)
        if (side, k) in EMPTY:
            empty_slot(side, k, z)
        else:
            container(side, k, f"cargo{(k + (side > 0) * 2) % 4}", z)
# a gantry crane trolley on the starboard rail, over the empty slot, with a spreader on its cables
TZ = SLOT_Z[1]
RB("trolley", (1.1, 0.4, 1.6), (13.4, 2.6, TZ), "hazard", ink=0.08, e=0.2)
RB("trolleyCab", (0.7, 0.45, 0.8), (13.4, 3.4, TZ + 0.5), "trim", ink=0.05, e=0.25)
for dz in (-1.2, 1.2):
    M(f"trolleyWheel{dz}", xf(lathe([(0, -0.15), (0.45, -0.15), (0.45, 0.15), (0, 0.15)], 12), (13.4 - 0.8, 2.2, TZ + dz), (0, 0, PI / 2)), "dark", FH, 0.02)
    M(f"trolleyWheelB{dz}", xf(lathe([(0, -0.15), (0.45, -0.15), (0.45, 0.15), (0, 0.15)], 12), (13.4 + 0.8, 2.2, TZ + dz), (0, 0, PI / 2)), "dark", FH, 0.02)
for dz in (-1.2, 1.2):
    M(f"cable{dz}", beam((CX, 2.4, TZ + dz), (CX, 0.2, TZ + dz * 1.9), 0.05, 5), "dark", FH, 0)
RB("spreader", (2.3, 0.15, 3.0), (CX, 0.0, TZ), "steel", ink=0.05, e=0.3)

# ---- radiator wings: shorter, swept, with a bolted frame and striped fins ----
RAD_DIH = 0.2


def wing_pt(span, up, chord, side):
    p = Vector((span, up, -chord))
    p.rotate(Euler((0, 0, RAD_DIH)))
    return (side * (p.x + 7.6), p.y + 3.8, p.z - 6.0)


for side in (-1, 1):
    wing = [(0.0, 0.0), (6.0, 0.0), (13.0, 3.0), (13.0, 7.2), (5.5, 9.2), (0.0, 9.2)]
    verts, faces = extrude(wing, 0.55, "y")
    out = [wing_pt(vx, vy, vz, side) for vx, vy, vz in verts]
    M(f"rad{side}", (out, [tuple(reversed(f)) for f in faces] if side < 0 else faces), "steel", FH, 0.12)
    for k in range(6):
        sp = 1.6 + k * 2.0
        lead = 3.0 * max(0.0, sp - 6.0) / 7.0 + 0.5
        trail = 9.0 if sp < 5.5 else 9.0 - (sp - 5.5) * (1.8 / 7.5)
        M(f"radFin{side}{k}", beam(wing_pt(sp, 0.34, lead, side), wing_pt(sp, 0.34, trail, side), 0.14, 4), "stripe", FH, 0)
    M(f"radEdge{side}", beam(wing_pt(6.0, 0.0, 0.0, side), wing_pt(13.0, 0.0, 3.0, side), 0.32, 6), "trim", FH, 0.04)
    M(f"radRoot{side}", xf(rbox(1.5, 1.1, 5.0, 0.2), (side * 8.0, 3.7, -10.2), (0, 0, side * 0.15)), "dark", FH, 0.06)
    M(f"navLight{side}", xf(superquad(0.5, 0.5, 0.5, 1, 1, 10, 6), wing_pt(13.2, 0.0, 5.0, side)), "green" if side > 0 else "red", FH, 0)

# ---- pipe runs and junction boxes down the upper shoulders (outside the walkable roof) ----
for side in (-1, 1):
    for yy, rr in ((4.0, 0.22), (3.4, 0.16)):
        x = surf_x(lerp_sec(SECS, 0.0), yy) + 0.28
        M(f"pipe{side}{yy}", beam((side * x, yy, -26.0), (side * x, yy, 12.0), rr, 8), "steel", FH, 0.04)
    for k in range(7):
        z = -24.0 + k * 5.6
        x = surf_x(lerp_sec(SECS, z), 3.7) + 0.28
        M(f"clip{side}{k}", xf(rbox(0.16, 0.6, 0.18, 0.3, 6, 3), (side * x, 3.7, z)), "dark", FH, 0.02)
    RB(f"junc{side}", (0.5, 0.55, 0.9), (side * (surf_x(lerp_sec(SECS, -3.0), 3.7) + 0.5), 3.7, -3.0), "hazard", ink=0.05, e=0.25)
    RB(f"juncCap{side}", (0.52, 0.12, 0.92), (side * (surf_x(lerp_sec(SECS, -3.0), 3.7) + 0.5), 4.3, -3.0), "dark", ink=0.03, e=0.3)

# ---- the stern: an armoured thrust block, a manifold, four bells ----
M("thrustFrame", loft([
    {"z": -31.8, "w": 8.0, "t": 5.2, "b": 5.2, "eT": 7, "eB": 7},
    {"z": -31.0, "w": 8.8, "t": 5.8, "b": 5.8, "eT": 7, "eB": 7},
    {"z": -27.4, "w": 8.8, "t": 5.8, "b": 5.8, "eT": 7, "eB": 7},
    {"z": -26.2, "w": 7.6, "t": 4.8, "b": 4.8, "eT": 7, "eB": 7},
], 32), "steel", FH, 0.22)
M("frameBand", keep(loft(grow([{"z": -30.6, "w": 8.8, "t": 5.8, "b": 5.8, "eT": 7, "eB": 7}, {"z": -29.2, "w": 8.8, "t": 5.8, "b": 5.8, "eT": 7, "eB": 7}], 0.07), 32, False, False), lambda c: True), "hazard", FH, 0)
for k in range(5):               # cooling ribs on the block
    M(f"blockRib{k}", xf(rbox(8.95, 5.9, 0.16, 0.12, 12, 4), (0, 0, -27.8 - k * 0.5)), "dark", FH, 0.02)
M("heatShield", xf(rbox(8.0, 5.2, 0.28, 0.12, 16, 6), (0, 0, -32.0)), "dark", FH, 0.06)
THROAT_Z, BELL_L = -33.4, 5.0
bell = [(1.2, 0.0), (1.25, 0.5), (1.5, 1.8), (1.85, 3.2), (2.2, 4.4), (2.35, 4.85), (2.35, BELL_L)]
for i, (x, y) in enumerate([(-4.2, 2.6), (4.2, 2.6), (-4.2, -2.6), (4.2, -2.6)]):
    M(f"pump{i}", xf(lathe([(r, -h) for r, h in [(0, 0), (1.8, 0), (1.85, 0.3), (1.7, 1.0), (1.4, 1.25), (1.25, 1.5), (0, 1.5)]], 20), (x, y, -32.1), (PI / 2, 0, 0)), "steel", FH, 0.06)
    M(f"gimbal{i}", xf(torus(1.4, 0.24, 20, 6), (x, y, THROAT_Z + 0.15), (PI / 2, 0, 0)), "stripe", FH, 0.02)
    for k in range(3):           # hydraulic actuators
        a = k * 2 * PI / 3 + 0.5
        M(f"act{i}{k}", beam((x + math.cos(a) * 1.7, y + math.sin(a) * 1.7, -32.2), (x + math.cos(a) * 1.95, y + math.sin(a) * 1.95, THROAT_Z - 1.6), 0.13, 6), "metal", FH, 0.02)
    M(f"bell{i}", xf(lathe([(r, -h) for r, h in bell], 24), (x, y, THROAT_Z), (PI / 2, 0, 0)), "dark", FH, 0.1)
    M(f"bellRing{i}", xf(torus(2.35, 0.15, 24, 6), (x, y, THROAT_Z - BELL_L), (PI / 2, 0, 0)), "stripe", FH, 0)
    M(f"bellGlow{i}", xf(lathe([(0, 0), (1.3, 0), (1.3, 0.06), (0, 0.06)], 20), (x, y, THROAT_Z - 0.4), (PI / 2, 0, 0)), "engine", FH, 0)
    M(f"bellCore{i}", xf(lathe([(0, 0), (0.7, 0), (0.7, 0.08), (0, 0.08)], 16), (x, y, THROAT_Z - 0.5), (PI / 2, 0, 0)), "core", FH, 0)
    plume(FR, f"a_plume{i}", (x, y, THROAT_Z - BELL_L - 0.05), 2.0, 13.0)
for side in (-1, 1):             # the exhaust manifold: pipes from the block's shoulders to the outer bells
    M(f"manifold{side}", beam((side * 8.6, 0.0, -29.0), (side * 8.6, 2.6, -31.0), 0.4, 8), "steel", FH, 0.04)
M("tailLight", xf(superquad(0.35, 0.35, 0.35, 1, 1, 10, 6), (0, 6.2, -30.2)), "white", FH, 0)

# ---- belly: lift-jet grilles, skid keels, four hydraulic legs, the ramp ----
for i, (x, z) in enumerate([(-3.6, 9.0), (3.6, 9.0), (-3.6, -21.5), (3.6, -21.5)]):
    M(f"grille{i}", xf(rbox(1.3, 0.08, 1.3, 0.2, 10, 4), (x, BELLY_F - 0.04, z)), "dark", FH, 0.03)
    M(f"grilleLit{i}", xf(rbox(1.05, 0.08, 1.05, 0.2, 10, 4), (x, BELLY_F - 0.08, z)), "engine", FH, 0)
    plume(FR, f"a_lift{i}", (x, BELLY_F - 0.12, z), 1.0, 6.5, axis="y")
for side in (-1, 1):
    M(f"keel{side}", xf(rbox(0.28, 0.32, 14.0, 0.3), (side * 6.8, BELLY_F + 0.1, 3.0)), "dark", FH, 0.05)
HF = BELLY_F + 0.7
leg_f = (GEAR_F + BELLY_F) + 0.7
for name, (x, z) in (("a_legFL", (-5.0, 17.0)), ("a_legFR", (5.0, 17.0)), ("a_legRL", (-5.0, -13.0)), ("a_legRR", (5.0, -13.0))):
    landing_leg(FR, name, (x, HF, z), leg_f, 1.57, r=0.55, pad=1.7, ink=0.08, scale=2.2)
    gear_bay(F, name + "Bay", x, BELLY_F, z + 0.9, z - leg_f - 1.6, 2.8, ink=0.05)
F_RAMP_H = (0, BELLY_F - 0.05, -4.0)
F_RAMP_L = 11.0
f_drop = GEAR_F + BELLY_F - 0.15
f_open = -math.asin(min(1.0, f_drop / F_RAMP_L))
FRamp = pivot("a_ramp", F_RAMP_H, FR, role="ramp", closed=0.0, opened=f_open)
M("rampPlate", xf(rbox(2.3, 0.16, F_RAMP_L / 2, 0.1, 12, 4), (0, 0, -F_RAMP_L / 2)), "trim", FRamp, 0.07)
for k in range(9):
    M(f"rampRib{k}", xf(rbox(2.0, 0.06, 0.1, 0.4, 6, 4), (0, 0.17, -0.8 - k * 1.2)), "dark", FRamp, 0)
for side in (-1, 1):
    M(f"rampEdge{side}", xf(rbox(0.12, 0.08, F_RAMP_L / 2 - 0.15, 0.4, 6, 4), (side * 2.15, 0.18, -F_RAMP_L / 2)), "hazard", FRamp, 0)
M("rampBay", xf(rbox(2.45, 0.06, F_RAMP_L / 2 + 0.1, 0.1, 12, 4), (0, BELLY_F + 0.04, -4.0 - F_RAMP_L / 2)), "bay", FH, 0)
FHatch = pivot("a_hatch", (0, BELLY_F + 0.08, -4.0 - F_RAMP_L / 2), FR, role="hatch")
M("hatchLight", rbox(2.2, 0.03, F_RAMP_L / 2 - 0.2, 0.2, 10, 4), "cabin", FHatch, 0)

FR["gearH"] = GEAR_F
FR["deck"] = [6.9, 2.6, 22.6]
FR["deckY"] = 2.5
FR["deckZ"] = -3.0
FR["inside"] = [0, -4.6, -1.5]
FR["rampTop"] = [0, -5.0, -4.4]
FR["rampBottom"] = [0, BELLY_F - 0.05 - F_RAMP_L * math.sin(-f_open), -4.0 - F_RAMP_L * math.cos(f_open) - 0.6]
FR["radius"] = 26.0
FR["padR"] = 21.0
print("freighter A:", len(C.objects), "objects,", sum(len(o.data.polygons) for o in C.objects if o.type == "MESH"), "polygons")

if __name__ == "__main__" or "__file__" not in globals():
    if len(sys.argv) > 1 and not sys.argv[-1].endswith(".py"):
        exec(open(os.path.join(REPO, "tools", "blender", "proposals", "preview.py"), encoding="utf-8").read(), globals())
        render_views(FR, sys.argv[-1])

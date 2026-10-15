# Tower crane builder for Blender (4.2+ / 5.x): a hammerhead tower crane, exported to src/assets/crane.glb.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_crane.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_crane.py
#
# One crane, 34 m of lattice mast under a 30 m jib (the game scales it uniformly for the smaller cranes). Everything is
# authored in three.js axes with the jib pointing +x at zero slew; the origin is on the ground in the middle of the base.
#
# The static parts (the root's own meshes) are the foundation, the ballasted base frame and the mast. Pivots (empties with a
# `role`) carry everything that moves:
#   slew      at the top of the mast (y = 34), turned about y by the game. Under it: the slewing ring and turntable, the
#             tower head with the pendant bars, the jib (out to +x) and counter-jib (-x) with its counterweights and hoist
#             house, the operator's cab, the lamps and the wind gauge.
#   blinker   the aircraft warning lights (apex, jib tip, counter-jib end); the game puts a blinking lamp on each
#   trolley   the carriage on the jib's rails, a child of `slew`; the game slides it along x (it sits at x = 14)
#   cable     the two rope falls, a child of `trolley`: one metre long, hanging down from its origin; the game scales y
#   hook      the hook block, hook and bridle slings, a child of `trolley`; the game sets its y to minus the rope length
#   load      under `hook`: the cargo container (the Prospector's, see build_landtrain.py) on its spreader frame, turned to lie along
#             the jib. `livery` pivots under it (extra `faction`) carry each faction's plate and number; the game builds the one
#             that matches the crane's cargo and leaves the rest out
# Each mesh has ONE material named after a slot: body (the crane's colour) is swapped by the game, and so are the container's
# load (its body), stripe and label (its trim and lettering) for the faction whose cargo it carries; the rest are fixed (see
# craneSlot in src/models.js). The `drop` extra on the hook is the distance from its origin to the container's bottom.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_crane.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("CRANE_OUT") or os.path.join(REPO, "src", "assets", "crane.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Tower crane export ->", OUT)
COLL = "MoonTowerCrane"

# preview colours (the game swaps in its own materials)
SLOT_COLORS = {
    "body": (1.0, 0.82, 0.25), "dark": (0.16, 0.14, 0.25), "steel": (0.33, 0.38, 0.48), "concrete": (0.66, 0.65, 0.72),
    "white": (1.0, 0.96, 0.88), "glass": (0.81, 0.94, 1.0), "lamp": (1.0, 0.96, 0.66), "load": (1.0, 0.23, 0.36),
    "rope": (0.1, 0.09, 0.14), "metal": (0.54, 0.53, 0.63), "stripe": (1.0, 0.96, 0.88), "label": (0.16, 0.14, 0.25),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "decals.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)

PI = math.pi
H = 34.0          # the top of the mast (the slewing ring sits on it)
JIB = 30.0        # the jib's reach from the slew axis


def M(name, geo, slot, parent, ink=0.04, **kw):
    return mesh("crane_" + name, geo, slot, parent, ink, **kw)


def PV(name, pos, parent=None, **props):
    return pivot("crane_" + name if parent is not None else name, pos, parent, **props)


def rb(name, hx, hy, hz, pos, slot, parent, ink=0.04, e=0.08, rot=(0, 0, 0), nu=6, nv=3):
    """A rounded box (half extents), crisp corners by default."""
    return M(name, xf(rbox(hx, hy, hz, e, nu, nv), pos, rot), slot, parent, ink)


def join(geos):
    verts, faces = [], []
    for v, f in geos:
        o = len(verts)
        verts.extend(v)
        faces.extend([tuple(i + o for i in fc) for fc in f])
    return verts, faces


def B(a, b, r, seg=4, cap=False):
    """One strut between two points (open ends by default: they sit inside the members they join)."""
    return tube([a, b], [r, r], seg, cap)


def box(hx, hy, hz, pos, e=0.05):
    return xf(rbox(hx, hy, hz, e, 4, 2), pos)


# ---------------------------------------------------------------------------------------------------------------
root = PV("crane", (0, 0, 0), None)
root["height"] = H
root["jib"] = JIB

# ---- the foundation and the ballasted base frame ----
rb("pad", 4.3, 0.55, 4.3, (0, 0.55, 0), "concrete", root, 0.07, e=0.05)
rb("frameX", 3.9, 0.38, 0.62, (0, 1.1 + 0.38, 0), "body", root, 0.05, e=0.05)
rb("frameZ", 0.62, 0.38, 3.9, (0, 1.1 + 0.38, 0), "body", root, 0.05, e=0.05)
rb("hub", 1.35, 0.5, 1.35, (0, 1.1 + 0.5, 0), "body", root, 0.05, e=0.05)
for i, (sx, sz) in enumerate(((1, 0), (-1, 0), (0, 1), (0, -1))):
    # two slabs of ballast on the end of each arm, with a lifting plate and a pair of tie rods
    hx, hz = (1.1, 1.0) if sx else (1.0, 1.1)
    px, pz = sx * 2.75, sz * 2.75
    for k in range(2):
        rb(f"ballast{i}_{k}", hx, 0.42, hz, (px, 1.1 + 0.76 + 0.43 + k * 0.88, pz), "concrete", root, 0.05, e=0.04)
    rb(f"ballastPlate{i}", hx + 0.05, 0.05, hz + 0.05, (px, 1.1 + 0.76 + 1.78 + 0.05, pz), "steel", root, 0.03, e=0.04)
    for t in (-1, 1):
        o = (0, 0, t * 0.7) if sx else (t * 0.7, 0, 0)
        M(f"tie{i}_{t}", B((px + o[0], 1.2, pz + o[2]), (px + o[0], 3.7, pz + o[2]), 0.045, 5, True), "steel", root, 0)
rb("footPlate", 1.4, 0.1, 1.4, (0, 1.1 + 1.0 + 0.1, 0), "steel", root, 0.04, e=0.04)

# ---- the mast: 8 lattice sections of 4.1 m, square chords, a diagonal per face, splice plates at every joint ----
MW = 1.0
Y0 = 2.3
SECT = 8
levels = [Y0 + (H - Y0) * i / SECT for i in range(SECT + 1)]
corners = [(-MW, -MW), (MW, -MW), (MW, MW), (-MW, MW)]
chords = join([B((cx, Y0 - 0.2, cz), (cx, H, cz), 0.19, 6) for cx, cz in corners])
M("mastChords", chords, "body", root, 0.05)
diags, rungs = [], []
for i in range(SECT):
    ya, yb = levels[i], levels[i + 1]
    for f in range(4):
        (ax, az), (bx, bz) = corners[f], corners[(f + 1) % 4]
        if (i + f) % 2:
            diags.append(B((ax, ya, az), (bx, yb, bz), 0.09))
        else:
            diags.append(B((bx, ya, bz), (ax, yb, az), 0.09))
for y in levels[:-1]:
    for f in range(4):
        (ax, az), (bx, bz) = corners[f], corners[(f + 1) % 4]
        diags.append(B((ax, y, az), (bx, y, bz), 0.1))
M("mastBracing", join(diags), "body", root, 0.03)
plates = []
for y in levels[1:-1]:
    for cx, cz in corners:
        plates.append(box(0.3, 0.18, 0.3, (cx, y, cz), 0.03))
M("splicePlates", join(plates), "steel", root, 0.03)
# the ladder inside the front face, and a rest platform with a handrail every second joint
lad = [B((-0.28, Y0, MW - 0.22), (-0.28, H - 0.6, MW - 0.22), 0.03), B((0.28, Y0, MW - 0.22), (0.28, H - 0.6, MW - 0.22), 0.03)]
y = Y0 + 0.4
while y < H - 0.7:
    lad.append(B((-0.28, y, MW - 0.22), (0.28, y, MW - 0.22), 0.022))
    y += 0.55
M("ladder", join(lad), "steel", root, 0)
pl, rails = [], []
for k in (2, 4, 6):
    y = levels[k]
    # a grated deck round the mast, a post at each corner and mid-edge, a toe board and two rails
    pl.append(box(1.55, 0.05, 1.55, (0, y - 0.08, 0), 0.02))
    ring = [(-1.55, -1.55), (1.55, -1.55), (1.55, 1.55), (-1.55, 1.55)]
    posts = ring + [(0, -1.55), (1.55, 0), (0, 1.55), (-1.55, 0)]
    for px, pz in posts:
        rails.append(B((px, y - 0.05, pz), (px, y + 1.1, pz), 0.045, 5, True))
    for hh in (0.55, 1.1):
        for a in range(4):
            (ax, az), (bx, bz) = ring[a], ring[(a + 1) % 4]
            rails.append(B((ax, y + hh, az), (bx, y + hh, bz), 0.04, 5, True))
    for a in range(4):
        (ax, az), (bx, bz) = ring[a], ring[(a + 1) % 4]
        pl.append(box(abs(bx - ax) / 2 + 0.03 if ax != bx else 0.03, 0.09, abs(bz - az) / 2 + 0.03 if az != bz else 0.03, ((ax + bx) / 2, y + 0.03, (az + bz) / 2), 0.01))
M("platforms", join(pl), "steel", root, 0.03)
M("handrails", join(rails), "body", root, 0)

# ---------------------------------------------------------------------------------------------------------------
# the slewing assembly (local frame: y = 0 on top of the mast)
slew = PV("slew", (0, H, 0), root, role="slew")

M("slewRing", lathe([(0, 0.0), (1.32, 0.0), (1.46, 0.08), (1.46, 0.5), (1.36, 0.6), (0, 0.6)], 20), "dark", slew, 0.04)
M("slewGear", xf(torus(1.18, 0.09, 20, 6), (0, 0.62, 0)), "steel", slew, 0.02)
rb("turntable", 2.1, 0.2, 1.95, (0.1, 0.82, 0), "body", slew, 0.05, e=0.05)

# the tower head: a tapering four-legged pylon with its pendant bars to the jib and counter-jib
HEAD = 9.8
hw = lambda y: 0.8 + (0.16 - 0.8) * (y - 1.0) / (HEAD - 1.0)
hc = lambda y: [(sx * hw(y), y, sz * hw(y)) for sx, sz in corners]
head = [B(hc(1.0)[i], hc(HEAD)[i], 0.15, 5) for i in range(4)]
ly = [1.0 + (HEAD - 1.0) * i / 4 for i in range(5)]
for i in range(4):
    a, b = ly[i], ly[i + 1]
    for f in range(4):
        pa, pb = hc(a), hc(b)
        if (i + f) % 2:
            head.append(B(pa[f], pb[(f + 1) % 4], 0.075))
        else:
            head.append(B(pa[(f + 1) % 4], pb[f], 0.075))
for y in ly[1:-1]:
    p = hc(y)
    for f in range(4):
        head.append(B(p[f], p[(f + 1) % 4], 0.085))
M("towerHead", join(head), "body", slew, 0.04)
rb("headCap", 0.34, 0.26, 0.34, (0, HEAD + 0.2, 0), "dark", slew, 0.04, e=0.1)
M("headSheaves", xf(lathe([(0.0, -0.1), (0.3, -0.1), (0.3, 0.1), (0.0, 0.1)], 12), (0, HEAD + 0.55, 0), (PI / 2, 0, 0)), "steel", slew, 0.02)

# the jib: a triangular truss, two bottom chords with the trolley's rails and one top chord, Warren diagonals
NX = 12
J0 = 1.2
xs = [J0 + (JIB - J0) * i / NX for i in range(NX + 1)]
YB, YT, JW = 1.3, 3.05, 0.85
jb = [B((J0, YB, -JW), (JIB, YB, -JW), 0.18, 6, True), B((J0, YB, JW), (JIB, YB, JW), 0.18, 6, True), B((J0, YT, 0), (JIB, YT, 0), 0.18, 6, True)]
jd = []
for i in range(NX):
    xa, xm, xb = xs[i], (xs[i] + xs[i + 1]) / 2, xs[i + 1]
    for z in (-JW, JW):
        jd.append(B((xa, YB, z), (xm, YT, 0), 0.095))
        jd.append(B((xm, YT, 0), (xb, YB, z), 0.095))
    jd.append(B((xa, YB, -JW), (xa, YB, JW), 0.1))
jd.append(B((xs[-1], YB, -JW), (xs[-1], YB, JW), 0.1))
M("jibChords", join(jb), "body", slew, 0.05)
M("jibLattice", join(jd), "body", slew, 0.03)
M("jibRails", join([box((JIB - J0) / 2, 0.05, 0.16, ((JIB + J0) / 2, YB - 0.18, -0.62)), box((JIB - J0) / 2, 0.05, 0.16, ((JIB + J0) / 2, YB - 0.18, 0.62))]), "steel", slew, 0.02)
rb("jibRoot", 0.55, 1.15, 1.05, (J0 - 0.1, 2.15, 0), "steel", slew, 0.04, e=0.06)
rb("jibTip", 0.14, 0.98, 1.0, (JIB + 0.1, 2.15, 0), "steel", slew, 0.04, e=0.05)
for z in (-0.62, 0.62):
    rb(f"stop{z}", 0.18, 0.2, 0.2, (JIB - 0.5, YB - 0.1, z), "dark", slew, 0.02, e=0.1)
    rb(f"stopN{z}", 0.18, 0.2, 0.2, (J0 + 2.7, YB - 0.1, z), "dark", slew, 0.02, e=0.1)
lugs = join([box(0.18, 0.28, 0.14, (x, YT + 0.3, 0), 0.02) for x in (9.0, 20.0)])
M("jibLugs", lugs, "steel", slew, 0.02)

# the counter-jib: a boxed lattice deck with a handrail, the hoist house, the counterweights
CX = [-1.2 - 2.85 * i for i in range(5)]
CB, CT = 1.3, 2.3
cj = []
for z in (-JW, JW):
    cj.append(B((CX[0], CB, z), (CX[-1], CB, z), 0.17, 6, True))
    cj.append(B((CX[0], CT, z), (CX[-1], CT, z), 0.17, 6, True))
for i, x in enumerate(CX):
    for z in (-JW, JW):
        cj.append(B((x, CB, z), (x, CT, z), 0.07))
    cj.append(B((x, CT, -JW), (x, CT, JW), 0.08))
    cj.append(B((x, CB, -JW), (x, CB, JW), 0.07))
for i in range(4):
    for z in (-JW, JW):
        if i % 2:
            cj.append(B((CX[i], CT, z), (CX[i + 1], CB, z), 0.06))
        else:
            cj.append(B((CX[i], CB, z), (CX[i + 1], CT, z), 0.06))
M("counterJib", join(cj), "body", slew, 0.04)
rb("counterDeck", 5.6, 0.05, 0.98, (-6.9, CT + 0.08, 0), "steel", slew, 0.03, e=0.04)
rl = []
for z in (-JW - 0.1, JW + 0.1):
    for x in CX:
        rl.append(B((x, CT + 0.1, z), (x, CT + 1.1, z), 0.03, 4, True))
    for hh in (0.6, 1.1):
        rl.append(B((CX[0], CT + hh, z), (CX[-1], CT + hh, z), 0.03, 4, True))
M("counterRail", join(rl), "body", slew, 0)
# counterweights: stacks of slabs with a seam between each, bound by a top plate
for name, x, n in (("cwA", -11.0, 3), ("cwB", -8.5, 2)):
    for k in range(n):
        rb(f"{name}{k}", 1.15, 0.41, 0.95, (x, CT + 0.13 + 0.42 + k * 0.84, 0), "concrete", slew, 0.05, e=0.04)
    rb(f"{name}Plate", 1.2, 0.05, 1.0, (x, CT + 0.13 + n * 0.84 + 0.05, 0), "steel", slew, 0.03, e=0.04)
    for sx in (-1, 1):
        for sz in (-1, 1):
            M(f"{name}Rod{sx}{sz}", B((x + sx * 1.0, CT + 0.1, sz * 0.8), (x + sx * 1.0, CT + 0.13 + n * 0.84 + 0.05, sz * 0.8), 0.035, 4, True), "steel", slew, 0)
# the hoist house, its louvres, door and exhaust, and an electrical cabinet
rb("hoistHouse", 1.65, 0.95, 1.0, (-4.9, CT + 0.13 + 0.95, 0), "body", slew, 0.05, e=0.06)
rb("hoistRoof", 1.75, 0.07, 1.1, (-4.9, CT + 0.13 + 1.95, 0), "dark", slew, 0.03, e=0.06)
vents = [box(1.0, 0.035, 0.02, (-5.6, CT + 0.13 + 0.55 + k * 0.28, 1.01), 0.01) for k in range(5)]
vents += [box(0.5, 0.75, 0.02, (-3.6, CT + 0.13 + 0.8, 1.02), 0.01)]
M("hoistVents", join(vents), "dark", slew, 0)
M("hoistStack", B((-6.1, CT + 0.13 + 1.9, -0.5), (-6.1, CT + 0.13 + 3.0, -0.5), 0.13, 6, True), "dark", slew, 0.03)
rb("cabinet", 0.5, 0.7, 0.4, (-2.2, CT + 0.13 + 0.7, 0.55), "steel", slew, 0.04, e=0.06)

# the pendant bars: apex down to the jib lugs and to the counter-jib's top chords
pend = [B((0, HEAD + 0.1, 0), (9.0, YT + 0.4, 0), 0.085, 5, True), B((0, HEAD + 0.1, 0), (20.0, YT + 0.4, 0), 0.085, 5, True)]
for z in (-JW, JW):
    pend.append(B((0, HEAD + 0.1, 0), (CX[1], CT, z), 0.085, 5, True))
    pend.append(B((0, HEAD + 0.1, 0), (CX[3], CT, z), 0.085, 5, True))
M("pendants", join(pend), "dark", slew, 0.02)

# the operator's cab, bracketed out beside the jib root, with its big front window, side window, roof unit and lamps
cab_p = (1.9, 0, 2.15)
rb("cabBody", 1.15, 1.0, 1.05, (cab_p[0], 1.05 + 1.0, cab_p[2]), "white", slew, 0.05, e=0.1)
rb("cabFloor", 1.2, 0.08, 1.1, (cab_p[0], 1.0, cab_p[2]), "dark", slew, 0.03, e=0.06)
rb("cabRoof", 1.25, 0.07, 1.15, (cab_p[0], 3.14, cab_p[2]), "dark", slew, 0.03, e=0.08)
rb("cabFront", 0.03, 0.66, 0.82, (cab_p[0] + 1.17, 2.2, cab_p[2]), "glass", slew, 0, e=0.2)
rb("cabSide", 0.8, 0.6, 0.03, (cab_p[0] - 0.1, 2.25, cab_p[2] + 1.07), "glass", slew, 0, e=0.2)
rb("cabSideB", 0.5, 0.6, 0.03, (cab_p[0] - 0.1, 2.25, cab_p[2] - 1.07), "glass", slew, 0, e=0.2)
rb("cabAC", 0.55, 0.2, 0.42, (cab_p[0] - 0.3, 3.35, cab_p[2]), "steel", slew, 0.03, e=0.1)
M("cabBrackets", join([B((cab_p[0] - 0.9, 1.0, cab_p[2] - 0.8), (cab_p[0] - 1.6, 1.0, 0.9), 0.07, 5, True), B((cab_p[0] + 0.9, 1.0, cab_p[2] - 0.8), (cab_p[0] + 0.3, 1.0, 0.9), 0.07, 5, True)]), "steel", slew, 0)
M("cabDoorStep", join([box(0.5, 0.05, 0.3, (cab_p[0] - 0.4, 0.95, cab_p[2] + 1.35), 0.01)]), "steel", slew, 0)
for k, dx in enumerate((-0.5, 0.5)):
    rb(f"flood{k}", 0.2, 0.13, 0.13, (cab_p[0] + 1.0, 3.38, cab_p[2] + dx), "dark", slew, 0.02, e=0.15)
    rb(f"floodLamp{k}", 0.03, 0.1, 0.1, (cab_p[0] + 1.22, 3.38, cab_p[2] + dx), "lamp", slew, 0, e=0.2)

# the wind gauge on the apex: a pole, a cup arm and a vane, topped with the red warning lamp
M("windPole", B((0, HEAD + 0.4, 0), (0, HEAD + 1.7, 0), 0.04, 5, True), "dark", slew, 0)
M("windArm", join([B((0, HEAD + 1.4, -0.4), (0, HEAD + 1.4, 0.4), 0.025, 4, True)]), "dark", slew, 0)
for z in (-0.4, 0.4):
    M(f"windCup{z}", xf(lathe([(0.0, -0.1), (0.1, -0.1), (0.1, 0.05), (0.0, 0.1)], 8), (0, HEAD + 1.4, z)), "steel", slew, 0)
rb("windVane", 0.22, 0.1, 0.015, (-0.25, HEAD + 1.15, 0), "dark", slew, 0, e=0.1)

# warning lamps: the game blinks a lamp on each of these
PV("blinkApex", (0, HEAD + 1.95, 0), slew, role="blinker", radius=0.3)
PV("blinkTip", (JIB + 0.3, 3.3, 0), slew, role="blinker", radius=0.3)
PV("blinkCounter", (CX[-1] - 0.3, CT + 0.9, 0), slew, role="blinker", radius=0.3)

# ---------------------------------------------------------------------------------------------------------------
# the trolley: a carriage under the jib's bottom chords on four wheels, with the hoist's sheave housing under it
TROLLEY_X = 14.0
trolley = PV("trolley", (TROLLEY_X, YB - 0.2, 0), slew, role="trolley")
plates = [box(0.9, 0.34, 0.05, (0, 0.3, z), 0.02) for z in (-0.98, 0.98)]
M("trolleyPlates", join(plates), "dark", trolley, 0.03)
M("trolleyBars", join([box(0.09, 0.09, 1.0, (x, 0.45, 0), 0.02) for x in (-0.65, 0.65)]), "steel", trolley, 0.02)
for x in (-0.55, 0.55):
    for z in (-0.98, 0.98):
        M(f"trolleyWheel{x}_{z}", xf(lathe([(0.0, -0.06), (0.22, -0.06), (0.22, 0.06), (0.0, 0.06)], 10), (x, 0.38, z), (PI / 2, 0, 0)), "steel", trolley, 0.02)
rb("sheaveHouse", 0.55, 0.38, 0.5, (0, -0.32, 0), "body", trolley, 0.04, e=0.1)
for dx in (-0.2, 0.2):
    M(f"sheave{dx}", xf(lathe([(0.0, -0.45), (0.3, -0.45), (0.3, 0.45), (0.0, 0.45)], 10), (dx, -0.55, 0), (PI / 2, 0, 0)), "dark", trolley, 0.02)

# the rope: two falls, one metre long, hanging from the trolley (the game stretches them to the hook)
cable = PV("cable", (0, -0.7, 0), trolley, role="cable")
M("ropes", join([B((0, 0, z), (0, -1.0, z), 0.05, 4, True) for z in (-0.22, 0.22)]), "rope", cable, 0.02)

# the hook block: a heavy yellow block with its sheaves, a swivel and the hook, slings to the load, and the load
hook = PV("hook", (0, -0.7, 0), trolley, role="hook")
rb("hookBlock", 0.52, 0.55, 0.4, (0, -0.55, 0), "body", hook, 0.04, e=0.12)
M("hookSheave", xf(lathe([(0.0, -0.5), (0.3, -0.5), (0.3, 0.5), (0.0, 0.5)], 10), (0, -0.22, 0), (PI / 2, 0, 0)), "dark", hook, 0.02)
M("hookSwivel", xf(lathe([(0.0, 0.0), (0.2, 0.0), (0.2, 0.4), (0.0, 0.4)], 8), (0, -1.45, 0)), "steel", hook, 0.02)
arc = [(0.0, -1.75), (0.0, -2.0)]
for t in range(1, 13):
    a = PI - t / 12 * PI * 1.5
    arc.append((0.34 + 0.34 * math.cos(a), -2.0 + 0.34 * math.sin(a)))
M("hookIron", tube([(x, y, 0) for x, y in arc], [0.1] * len(arc), 6, True), "dark", hook, 0.03)
rb("hookLatch", 0.04, 0.2, 0.05, (0.46, -2.28, 0), "body", hook, 0, e=0.2)
# ---- the load: the Prospector's cargo container (faction-coloured corrugated steel, corner castings, roof rails, barred rear doors,
# a branding plate and the container number on each flank), hung from a spreader frame by four bridle slings. Built in the
# container's own frame (long axis z, deck level 0, box centre at y 3.3, as in build_landtrain.py), then the pivot is turned a
# quarter so it lies along the jib.
LOAD_Y = -10.55
LOAD_DROP = -(LOAD_Y + 1.9)          # hook origin to the container's bottom: 8.65
load = PV("load", (0, LOAD_Y, 0), hook, role="load")
load.rotation_euler = (0, 0, PI / 2)  # (three.js: a quarter turn about y)
LB = (1.55, 1.4, 3.62)               # the box's half extents


def rbj(items, e=0.3, nu=6, nv=4):
    return join([xf(rbox(hx, hy, hz, e, nu, nv), pos) for hx, hy, hz, pos in items])


rb("box", *LB, (0, 3.3, 0), "load", load, 0.07, e=0.06)
M("ribs", rbj([(0.035, 1.28, 0.055, (sx * 1.57, 3.3, -3.3 + k * 0.388)) for sx in (-1, 1) for k in range(18)], nu=4, nv=2), "load", load, 0.02)
M("roofRibs", rbj([(1.42, 0.03, 0.06, (0, 4.72, -3.2 + k * 0.7)) for k in range(10)], nu=4, nv=2), "load", load, 0.02)
M("roofRails", rbj([(0.08, 0.06, 3.62, (sx * 1.52, 4.74, 0)) for sx in (-1, 1)], e=0.2), "dark", load, 0.03)
M("castings", rbj([(0.2, 0.17, 0.22, (sx * 1.5, y, sz * 3.55)) for sx in (-1, 1) for sz in (-1, 1) for y in (1.95, 4.62)], e=0.2), "dark", load, 0.03)
# the rear doors: four locking bars, their cams and the seam
M("doorBars", join([beam((x, 1.95, -3.66), (x, 4.6, -3.66), 0.05, 6) for x in (-1.0, -0.35, 0.35, 1.0)]), "metal", load, 0.02)
M("doorCams", rbj([(0.12, 0.05, 0.05, (x, 2.7, -3.7)) for x in (-1.0, -0.35, 0.35, 1.0)]), "steel", load, 0.01)
rb("doorSeam", 0.02, 1.35, 0.02, (0, 3.3, -3.65), "dark", load, 0, e=0.3, nu=6, nv=4)
for sx in (-1, 1):
    rb(f"plate{sx}", 0.04, 0.62, 1.8, (sx * 1.64, 3.5, 0.3), "dark", load, 0.03, e=0.08)

# the spreader: four beams in a frame on the top castings (a twist-lock stub in each), a spine with a lifting eye, a lug at each corner
SY = 5.05
M("spreader", rbj([(0.1, 0.08, 3.75, (sx * 1.5, SY, 0)) for sx in (-1, 1)] + [(1.6, 0.08, 0.1, (0, SY, sz * 3.55)) for sz in (-1, 1)] + [(0.16, 0.1, 3.4, (0, SY + 0.05, 0))], e=0.2), "steel", load, 0.04)
M("twistLocks", join([xf(lathe([(0.0, 4.78), (0.1, 4.78), (0.1, 4.98), (0.0, 4.98)], 8), (sx * 1.5, 0, sz * 3.55)) for sx in (-1, 1) for sz in (-1, 1)]), "dark", load, 0.02)
M("lugs", rbj([(0.16, 0.12, 0.16, (sx * 1.5, SY + 0.17, sz * 3.55)) for sx in (-1, 1) for sz in (-1, 1)], e=0.3), "dark", load, 0.03)
M("liftEye", join([xf(torus(0.2, 0.05, 12, 6), (0, SY + 0.35, 0), (PI / 2, 0, 0))]), "dark", load, 0.02)

# the four bridle slings from the hook to the spreader's corners (in the hook's frame the container's z runs along x, and x along -z)
M("slings", join([B((0, -2.0, 0), (sz * 3.55, LOAD_Y + SY + 0.3, -sx * 1.5), 0.04, 4, True) for sx in (-1, 1) for sz in (-1, 1)]), "dark", hook, 0)


def cg_livery(f, piv):
    s = NAMES[f]
    code = f"{CODES[f]} 204117 6"
    for side in (-1, 1):
        d = side_dec(side, 1.68, 3.5, 0.3)
        d.rect(-1.7, -0.56, 1.7, 0.56, "stripe", 0)
        d.rect(-1.66, -0.52, 1.66, 0.52, "dark", 1)
        emblem(d, f, -1.1, 0.0, 0.4, 2)
        d.text(s, -0.55, 0.06, 0.045, "stripe", 2)
        d.text("LOGISTICS", -0.55, -0.4, 0.035, "white", 2)
        d.build(f"crane_plate{'P' if side > 0 else 'S'}_{f}", piv)
        d2 = side_dec(side, 1.6, 4.3, 0.3)
        d2.text(code, -1.55, 0, 0.04, "label", 0)
        d2.build(f"crane_id{'P' if side > 0 else 'S'}_{f}", piv)


for f in FACTIONS:
    cg_livery(f, pivot(f"crane_livery_{f}", (0, 0, 0), load, role="livery", faction=f))
hook["drop"] = round(LOAD_DROP, 3)

# ---------------------------------------------------------------------------------------------------------------
objs = [o for o in C.objects]
tris = sum(len(o.data.polygons) for o in objs if o.type == "MESH")
print("meshes:", sum(1 for o in objs if o.type == "MESH"), "polygons:", tris)
export(OUT, objs)
if os.environ.get("CRANE_BLEND"):
    bpy.ops.wm.save_as_mainfile(filepath=os.environ["CRANE_BLEND"])

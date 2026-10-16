# Vehicle garage builder for Blender (4.2+ / 5.x): the Meridian Exchange's motor pool, exported to src/assets/garage.glb.
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_garage.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_garage.py
#
# Two service garages for land-trains and rovers, both exported (roots `garage` and `garage_small`):
#   garage        the main one: three tall bays with sectional doors under a name board, a clerestory over a lit workshop, a
#                 service office built onto one end and a fuel and coolant yard at the other (38 m by 20 m)
#   garage_small  about the old sheds' size (32 m by 17 m): two bays, the same design, no office, fuel yard or antenna
# Authored in three.js axes (x right, y up, +z forward, the bay doors face +z); the origin is on the ground in the middle of the hall.
#
# The root's own meshes are the shell, the roof and what is outside. Pivots (empties with a `role`, all at the origin unless
# they spin) carry what the game chooses between:
#   door   one pair per bay (extras `bay` and `state` "open" / "closed"): the sectional door shut, or rolled up and
#          its status lamp. The game builds the state each bay is in, so the four garages need not look alike
#   fit    one per bay (extra `bay`): what is working inside it (a rover on a two-post lift, an engine stand and drums, a
#          bench with parts shelves and tyres). Only built for a bay that is open
#   fan    a roof turbine ventilator's head, at its own centre; the game spins it about y (extra `speed`, rad/s)
#   blinker  the aircraft lamp on the antenna mast (extra `radius`)
# `interior` (the lining) and `shopfloor` are drawn self-lit, so the open bays read as a lit workshop whatever the sun does.
# Each mesh has ONE material named after a slot (see GARAGE_TOON / GARAGE_GLOW in src/models.js); `trim` (the cyan band and the
# sign's frame) is the one the game may recolour for another faction.

import bpy, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_garage.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("GARAGE_OUT") or os.path.join(REPO, "src", "assets", "garage.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Garage export ->", OUT)
COLL = "MoonGarage"

# preview colours (the game swaps in its own materials)
SLOT_COLORS = {
    "body": (1.0, 0.96, 0.88), "trim": (0.18, 0.77, 1.0), "navy": (0.11, 0.23, 0.56), "gold": (1.0, 0.82, 0.25),
    "dark": (0.16, 0.14, 0.25), "steel": (0.33, 0.38, 0.48), "metal": (0.54, 0.53, 0.63), "concrete": (0.54, 0.52, 0.6),
    "floor": (0.29, 0.27, 0.36), "shopfloor": (0.42, 0.4, 0.51), "interior": (0.72, 0.71, 0.8), "door": (0.78, 0.8, 0.86), "roof": (0.23, 0.2, 0.33),
    "panel": (0.11, 0.23, 0.54), "tire": (0.1, 0.09, 0.14), "white": (0.95, 0.93, 0.89), "label": (0.16, 0.14, 0.25),
    "stripe": (1.0, 0.96, 0.88), "hazard": (1.0, 0.82, 0.25), "redsafe": (0.79, 0.13, 0.18), "orange": (1.0, 0.48, 0.1),
    "blue": (0.11, 0.39, 0.84), "tank": (0.78, 0.84, 0.92), "hot": (1.0, 0.62, 0.11), "lamp": (1.0, 0.96, 0.66),
    "glass": (0.81, 0.94, 1.0), "window": (1.0, 0.96, 0.65), "green": (0.49, 1.0, 0.42), "red": (1.0, 0.16, 0.29),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "decals.py"), encoding="utf-8").read(), globals())

C = coll()
for s in SLOT_COLORS:
    material(s)

PI = math.pi
PFX = "garage_"   # the prefix of every object name in the garage being built (Blender names are unique across the file)


# ---------------------------------------------------------------------------------------------------------------
# geometry helpers: hard-edged boxes and the kit's cylinders, gathered per material slot into a few merged meshes
# ---------------------------------------------------------------------------------------------------------------
class Acc:
    """Boxes and tubes that share a material slot and a parent, merged into one mesh when flushed."""
    all = []

    def __init__(self, name, slot, parent, ink=0.04, dz=0.0):
        self.name, self.slot, self.parent, self.ink, self.geos, self.dz = name, slot, parent, ink, [], dz   # (dz: shifts everything in z)
        Acc.all.append(self)

    def box(self, cx, y0, cz, w, h, d, rot=(0, 0, 0)):
        self.geos.append(xf(cuboid(w, h, d)[:2], (cx, y0 + h / 2, cz + self.dz), rot))
        return self

    def cyl(self, cx, y0, cz, r, h, seg=10, axis="y", rt=None):
        """A cylinder standing on y0 (axis y), or lying with its centre at height y0 + h/2 (axis x or z)."""
        g = cylinder(r if rt is None else rt, r, h, seg)[:2]
        rot = {"y": (0, 0, 0), "z": (PI / 2, 0, 0), "x": (0, 0, PI / 2)}[axis]
        self.geos.append(xf(g, (cx, y0 + h / 2, cz + self.dz), rot))
        return self

    def tube(self, a, b, r, seg=5):
        self.geos.append(beam((a[0], a[1], a[2] + self.dz), (b[0], b[1], b[2] + self.dz), r, seg))
        return self

    def add(self, geo, t=(0, 0, 0), rot=(0, 0, 0)):
        self.geos.append(xf(geo, (t[0], t[1], t[2] + self.dz), rot))
        return self

    def flush(self):
        if self.geos:
            mesh(f"{PFX}{self.name}", join(self.geos), self.slot, self.parent, self.ink)
        self.geos = []


def flush_all():
    for a in Acc.all:
        a.flush()
    Acc.all = []


def capsule(r, length, end, seg=12):
    """A tank on its side: the axis along z, `length` of straight with a rounded end of depth `end` at each."""
    prof = []
    for i in range(0, 5):
        a = (PI / 2) * i / 4
        prof.append((r * math.sin(a), -length / 2 - end * math.cos(a)))
    for i in range(3, -1, -1):
        a = (PI / 2) * i / 4
        prof.append((r * math.sin(a), length / 2 + end * math.cos(a)))
    return xf(lathe(prof, seg), r=(PI / 2, 0, 0))


def build(NAME, PFX_, kind):
    """One garage: kind "main" (three bays, a service office and a fuel yard) or "small" (two bays, about an old shed's size)."""
    global PFX
    PFX = PFX_
    FULL = kind == "main"
    root = pivot(NAME, (0, 0, 0), None)

    # ---------------------------------------------------------------------------------------------------------------
    # the plan
    # ---------------------------------------------------------------------------------------------------------------
    W, D = (38.0, 20.0) if FULL else (32.0, 17.0)      # the hall's outside (the small one is about the old sheds' 34 by 18)
    HX, HZ = W / 2, D / 2
    FY = 0.08                          # the floor, a thin plinth proud of the ground (the road runs right up to the doors: no apron, no ramp)
    TOP = 9.0 if FULL else 8.6         # the wall tops (the parapet stands on the roof above them)
    BAYS = (-10.0, 0.0, 10.0) if FULL else (-8.0, 8.0)   # the bay centres
    BH = 3.5                           # half a bay's width
    OPEN = 5.85 if FULL else 5.4       # the top of the openings
    JAMBS = [(-HX, BAYS[0] - BH)] + [(BAYS[i] + BH, BAYS[i + 1] - BH) for i in range(len(BAYS) - 1)] + [(BAYS[-1] + BH, HX)]  # the wall between openings
    LMID, RMID = (JAMBS[0][0] + JAMBS[0][1]) / 2, (JAMBS[-1][0] + JAMBS[-1][1]) / 2   # the middle of the end piers
    FIT_DZ = 10.0 - HZ                 # the fit-outs are laid out for a hall 20 m deep: slide them forward to the back wall of a shallower one
    BX0, BX1 = BAYS[0] - BH, BAYS[-1] + BH

    # ---- the plinth (the road runs right up to it) ----
    A = Acc("plinth", "concrete", root, 0.06)
    A.box(0, 0, 0, W + 1.2, FY, D + 1.2)
    A.flush()
    A = Acc("shopFloor", "shopfloor", root, 0.0)
    A.box(0, FY, 0, W - 1.0, 0.02, D - 1.0)                    # the workshop floor (lit: the game draws it self-lit)
    A.flush()

    # ---- the shell: front wall in pieces round the openings, the back and the sides, the lining inside ----
    A = Acc("walls", "body", root, 0.07)
    for x0, x1 in JAMBS:
        A.box((x0 + x1) / 2, FY, HZ - 0.25, x1 - x0, OPEN - FY, 0.5)
    A.box(0, OPEN, HZ - 0.25, W, TOP - OPEN, 0.5)              # the lintel across all three openings
    A.box(0, FY, -HZ + 0.25, W, TOP - FY, 0.5)
    for s in (-1, 1):
        A.box(s * (HX - 0.25), FY, 0, 0.5, TOP - FY, D)
    A.flush()
    A = Acc("lining", "interior", root, 0.0)
    A.box(0, FY, -HZ + 0.52, W - 1.1, 7.35, 0.04)
    for s in (-1, 1):
        A.box(s * (HX - 0.52), FY, 0, 0.04, 7.35, D - 1.1)
    A.flush()
    A = Acc("liningRibs", "steel", root, 0.0)
    for x in [-(HX - 2.5) + 3.0 * i for i in range(int((W - 5.0) / 3.0) + 1)]:
        A.box(x, FY, -HZ + 0.56, 0.16, 7.35, 0.1)
    A.flush()
    A = Acc("ceiling", "dark", root, 0.0)
    A.box(0, 7.6, 0, W - 1.0, 0.3, D - 1.0)
    A.flush()
    A = Acc("lights", "lamp", root, 0.0)
    for z in (HZ - 2.8, (HZ - 2.8) / 3, -(HZ - 2.8) / 3, -(HZ - 2.8)):
        A.box(0, 7.45, z, W - 4.0, 0.08, 0.35)
    A.flush()

    # ---- the roof, its parapet and cap ----
    A = Acc("roof", "roof", root, 0.06)
    A.box(0, TOP, 0, W + 0.4, 0.3, D + 0.4)
    A.flush()
    A = Acc("parapet", "body", root, 0.06)
    A.box(0, TOP + 0.3, HZ - 0.05, W + 0.4, 0.75, 0.35)
    A.box(0, TOP + 0.3, -HZ + 0.05, W + 0.4, 0.75, 0.35)
    for s in (-1, 1):
        A.box(s * (HX - 0.05), TOP + 0.3, 0, 0.35, 0.75, D - 0.3)
    A.flush()
    A = Acc("cap", "trim", root, 0.04)
    A.box(0, TOP + 1.05, HZ - 0.05, W + 0.9, 0.16, 0.6)
    A.box(0, TOP + 1.05, -HZ + 0.05, W + 0.9, 0.16, 0.6)
    for s in (-1, 1):
        A.box(s * (HX - 0.05), TOP + 1.05, 0, 0.6, 0.16, D - 0.3)
    A.flush()

    # ---- the walls' dressing: a navy base course, a cyan band between two gold pinstripes, steel pilasters ----
    # (round the sides and back whole, on the front only on the wall between the openings)
    runs = [(x0, x1, HZ) for x0, x1 in JAMBS]


    def dress(name, slot, y0, h, out, ink=0.0):
        a = Acc(name, slot, root, ink)
        for x0, x1, z in runs:
            a.box((x0 + x1) / 2, y0, z + out / 2, x1 - x0, h, out)
        a.box(0, y0, -HZ - out / 2, W, h, out)
        for s in (-1, 1):
            a.box(s * (HX + out / 2), y0, 0, out, h, D)
        a.flush()


    dress("base", "navy", FY, 0.95, 0.07, 0.03)
    dress("band", "trim", 3.9, 0.7, 0.08, 0.02)
    dress("pinLow", "gold", 3.74, 0.09, 0.1)
    dress("pinHigh", "gold", 4.67, 0.09, 0.1)
    A = Acc("pilasters", "navy", root, 0.04)
    for z in (-0.375 * D, -0.125 * D, 0.125 * D, 0.375 * D):
        for s in (-1, 1):
            A.box(s * (HX + 0.15), FY, z, 0.3, TOP - FY, 0.5)
    for x in (-0.4 * W, -0.2 * W, 0.0, 0.2 * W, 0.4 * W):
        A.box(x, FY, -HZ - 0.15, 0.5, TOP - FY, 0.3)
    A.flush()

    # ---- the front: door hoods with the bay plates, the name board, the jamb posts and the wall lamps ----
    A = Acc("hoods", "dark", root, 0.04)
    for cx in BAYS:
        A.box(cx, OPEN, HZ, 7.6, 0.9, 0.9)
    A.flush()
    A = Acc("jambPosts", "dark", root, 0.02)
    for cx in BAYS:
        for s in (-1, 1):
            A.box(cx + s * (BH + 0.2), FY, HZ + 0.03, 0.4, OPEN - FY, 0.06)
    A.flush()
    BW = BX1 - BX0 + 0.6                           # the name board spans the openings
    BY0, BHT = (7.0, 1.5) if FULL else (6.55, 1.1)
    A = Acc("board", "navy", root, 0.05)
    A.box(0, BY0, HZ + 0.09, BW, BHT, 0.18)
    A.flush()
    A = Acc("boardFrame", "trim", root, 0.03)
    A.box(0, BY0 - 0.08, HZ + 0.1, BW + 0.3, 0.1, 0.22)
    A.box(0, BY0 + BHT - 0.02, HZ + 0.1, BW + 0.3, 0.1, 0.22)
    for s in (-1, 1):
        A.box(s * (BW + 0.2) / 2, BY0 - 0.08, HZ + 0.1, 0.1, BHT + 0.16, 0.22)
    A.flush()
    # the lamp over each pier and each end of the front
    A = Acc("wallLamps", "dark", root, 0.03)
    L = Acc("wallLampGlow", "lamp", root, 0.0)
    for x in [(a + b) / 2 for a, b in JAMBS]:
        A.box(x, 5.2, HZ + 0.02, 0.9, 0.4, 0.5)
        A.box(x, 4.95, HZ + 0.02, 0.15, 0.25, 0.15)
        L.box(x, 5.1, HZ + 0.3, 0.7, 0.06, 0.34)
    A.flush()
    L.flush()

    # the personnel door at the left end, with its canopy, and (on the main one) a louvre beside it
    PDX = LMID - (0.45 if FULL else 0.0)
    A = Acc("pdoor", "dark", root, 0.03)
    A.box(PDX, FY, HZ + 0.02, 1.6, 2.7, 0.1)
    A.box(PDX, 3.0, HZ + 0.35, 2.8, 0.12, 1.2)
    A.box(PDX, 2.7, HZ + 0.86, 2.8, 0.38, 0.1)
    for s in (-1, 1):
        A.tube((PDX + s * 1.3, 2.7, HZ + 0.9), (PDX + s * 1.3, 3.0, HZ + 0.6), 0.04)
    if FULL:
        A.box(PDX + 2.4, 1.2, HZ + 0.02, 1.1, 1.3, 0.08)
    A.flush()
    A = Acc("pdoorLeaf", "door", root, 0.02)
    A.box(PDX, FY, HZ + 0.1, 1.2, 2.45, 0.08)
    A.flush()
    A = Acc("pdoorGlass", "glass", root, 0.0)
    A.box(PDX, 1.55, HZ + 0.16, 0.5, 0.9, 0.04)
    A.flush()
    A = Acc("louvre", "steel", root, 0.0)
    for k in range(6 if FULL else 0):
        A.box(PDX + 2.4, 1.1 + k * 0.2, HZ + 0.08, 0.95, 0.06, 0.1)
    A.flush()
    # the right end: a fire cabinet, the electrical cabinet and a conduit run to the roof
    A = Acc("cabinets", "redsafe", root, 0.03)
    A.box(RMID - 1.45, 1.1, HZ + 0.1, 0.55, 0.85, 0.2)
    A.flush()
    A = Acc("cabinetsSteel", "steel", root, 0.03)
    A.box(RMID + 1.05, 1.0, HZ + 0.15, 1.1, 1.7, 0.3)
    A.tube((RMID + 1.05, 2.7, HZ + 0.1), (RMID + 1.05, TOP, HZ + 0.1), 0.06, 5)
    A.flush()

    # high windows between the pilasters along the sides and the back, a side door and a lamp on the fuel-yard side
    A = Acc("highFrames", "dark", root, 0.03)
    Gl = Acc("highGlass", "glass", root, 0.0)
    for s_ in (-1, 1):
        for z in (-0.25 * D, 0.0, 0.25 * D):
            A.box(s_ * (HX + 0.04), 6.1, z, 0.08, 1.1, 0.19 * D)
            Gl.box(s_ * (HX + 0.09), 6.25, z, 0.04, 0.8, 0.19 * D - 0.3)
    for x in (-0.3 * W, -0.1 * W, 0.1 * W, 0.3 * W):
        A.box(x, 6.1, -HZ - 0.04, 0.137 * W, 1.1, 0.08)
        Gl.box(x, 6.25, -HZ - 0.09, 0.137 * W - 0.3, 0.8, 0.04)
    SDZ = -HZ + 1.8
    A.box(-HX - 0.04, FY, SDZ, 0.1, 2.7, 1.6)
    A.box(-HX - 0.4, 3.0, SDZ, 1.0, 0.12, 2.8)
    A.flush()
    Gl.flush()
    A = Acc("sideDoor", "door", root, 0.02)
    A.box(-HX - 0.1, FY, SDZ, 0.08, 2.45, 1.2)
    A.flush()
    A = Acc("sideLamp", "dark", root, 0.03)
    A.box(-HX - 0.25, 3.3, SDZ + 2.2, 0.5, 0.35, 0.8)
    A.flush()
    Lm = Acc("sideLampGlow", "lamp", root, 0.0)
    Lm.box(-HX - 0.4, 3.2, SDZ + 2.2, 0.34, 0.06, 0.7)
    Lm.flush()

    # bollards in front of every pier
    A = Acc("bollards", "hazard", root, 0.03)
    for x in [b + s * (BH + 0.4) for b in BAYS for s in (-1, 1)]:
        A.cyl(x, 0.0, HZ + 2.4, 0.17, 1.0, 6)
    A.flush()
    A = Acc("bollardCaps", "dark", root, 0.02)
    for x in [b + s * (BH + 0.4) for b in BAYS for s in (-1, 1)]:
        A.cyl(x, 1.0, HZ + 2.4, 0.19, 0.09, 6)
    A.flush()

    # ---- the lettering: the name board, the bay plates, the hazard stripes on the jambs and the thresholds ----
    d = Dec("+z", (0, BY0 + BHT / 2, HZ + 0.18))      # (the middle of the board)
    txt = "MERIDIAN MOTOR POOL" if FULL else "MERIDIAN SERVICE"
    ps = 0.17 if FULL else 0.15
    tw = text_width(txt, ps)
    er = 0.6 if FULL else 0.5
    total = 2 * er + 0.5 + tw
    u0 = -total / 2
    emblem(d, "meridian", u0 + er, 0.0, er, 0)
    d.text(txt, u0 + 2 * er + 0.5, -3.5 * ps, ps, "stripe", 1)
    d.build(PFX + "name", root)
    d = Dec("+z", (0, 0, HZ + 0.9))
    for cx, n in zip(BAYS, "123"):
        # the plate is centred on the bay, and so is the lettering on the plate (a lamp either side, in the door's own pivot)
        d.rect(cx - 1.15, OPEN + 0.22, cx + 1.15, OPEN + 0.72, "white", 0)
        d.text(f"BAY {n}", cx, OPEN + 0.47 - 3.5 * 0.05, 0.05, "label", 1, "c")
    d.build(PFX + "bayPlates", root)
    d = Dec("+z", (0, FY, HZ + 0.07))
    for cx in BAYS:
        for s in (-1, 1):
            u = cx + s * (BH + 0.2)
            d.hazard(u - 0.17, 0.0, u + 0.17, OPEN - FY, "dark", "hazard", 0, 0.16, 0.9)
    d.build(PFX + "jambStripes", root)
    # the floor: a hazard strip at each threshold (a page lying on the floor: u = +x, v = -z)
    d = Dec("+z", (0, FY + 0.01, HZ + 0.6))
    d.right, d.up, d.n = (1.0, 0.0, 0.0), (0.0, 0.0, -1.0), (0.0, 1.0, 0.0)
    for cx in BAYS:
        d.hazard(cx - BH, 0.05, cx + BH, 0.75, "dark", "hazard", 0, 0.2, 0.8)
    d.build(PFX + "thresholds", root)

    # ---------------------------------------------------------------------------------------------------------------
    # the bay doors: for each bay one closed and one open, as pivots the game picks between
    # ---------------------------------------------------------------------------------------------------------------
    for b, cx in enumerate(BAYS):
        # the tracks and the hood are static; what differs is the panels and the status lamp
        for state in ("closed", "open"):
            P = pivot(f"{PFX}door{b}_{state}", (0, 0, 0), root, role="door", bay=b, state=state)
            A = Acc(f"door{b}{state}", "door", P, 0.04)
            G = Acc(f"door{b}{state}Grooves", "dark", P, 0.0)
            if state == "closed":
                A.box(cx, FY, HZ - 0.36, 2 * BH - 0.04, OPEN - FY, 0.12)
                for k in range(1, int((OPEN - FY) / 0.7)):
                    G.box(cx, FY + k * (OPEN - FY) / int((OPEN - FY) / 0.7), HZ - 0.29, 2 * BH - 0.04, 0.05, 0.04)
                G.box(cx, FY, HZ - 0.29, 2 * BH - 0.04, 0.12, 0.05)
                Gl = Acc(f"door{b}{state}Glass", "glass", P, 0.0)
                for x in (-2.55, -0.85, 0.85, 2.55):
                    Gl.box(cx + x, OPEN - 1.45, HZ - 0.28, 1.4, 0.65, 0.05)
                Gl.flush()
                H = Acc(f"door{b}{state}Bumper", "hazard", P, 0.0)
                H.box(cx, FY + 0.12, HZ - 0.27, 2 * BH - 0.04, 0.3, 0.05)
                H.flush()
                lamp = "red"
            else:
                A.box(cx, OPEN - 1.0, HZ - 0.36, 2 * BH - 0.04, 1.0, 0.12)   # the last panels, still in the opening
                for k in (1, 2):
                    G.box(cx, OPEN - 1.0 + k * 0.33, HZ - 0.29, 2 * BH - 0.04, 0.05, 0.04)
                R = Acc(f"door{b}{state}Rails", "steel", P, 0.0)
                for s in (-1, 1):                                              # the overhead tracks the door runs back on
                    R.box(cx + s * 3.15, OPEN - 0.25, 1.2, 0.12, 0.12, D - 2.4)
                    for z in (HZ - 4.0, HZ - 8.5, HZ - 13.0):
                        R.box(cx + s * 3.15, OPEN - 0.15, z, 0.1, 0.4, 0.1)
                R.flush()
                lamp = "green"
            A.flush()
            G.flush()
            # the track on each jamb, and the lamp on the plate
            T = Acc(f"door{b}{state}Tracks", "steel", P, 0.0)
            for s in (-1, 1):
                T.box(cx + s * (BH - 0.04), FY, HZ - 0.5, 0.14, OPEN - FY, 0.16)
            T.flush()
            Lp = Acc(f"door{b}{state}Lamp", lamp, P, 0.0)
            for s in (-1, 1):
                Lp.box(cx + s * 1.55, OPEN + 0.4, HZ + 0.92, 0.3, 0.3, 0.06)
            Lp.flush()

    # ---------------------------------------------------------------------------------------------------------------
    # what is working inside each bay (only built for a bay that is open)
    # ---------------------------------------------------------------------------------------------------------------
    # ---- what is working inside each bay (built only for a bay that is open) ----
    def fit_lift(b):
        # a rover on a two-post lift, its engine out on the frame
        cx = BAYS[b]
        F = pivot(f"{PFX}fit{b}", (0, 0, 0), root, role="fit", bay=b)
        A = Acc("fit0Lift", "gold", F, 0.04, dz=FIT_DZ)
        for s in (-1, 1):
            A.box(cx + s * 2.65, FY, 0.6, 0.45, 4.8, 0.55)
        A.box(cx, 4.85, 0.6, 5.75, 0.18, 0.22)
        A.flush()
        A = Acc("fit0LiftMetal", "metal", F, 0.0, dz=FIT_DZ)
        for s in (-1, 1):
            A.box(cx + s * 2.65, FY, 0.6, 1.0, 0.1, 0.95)
            A.box(cx + s * 2.65, 1.8, 0.6, 0.55, 0.4, 0.62)
            for t in (-1, 1):
                A.box(cx + s * 1.82, 1.85, 0.6 + t * 0.9, 1.7, 0.13, 0.2)
                A.cyl(cx + s * 1.0, 1.98, 0.6 + t * 0.9, 0.2, 0.12, 8)
        A.flush()
        A = Acc("fit0Frame", "steel", F, 0.04, dz=FIT_DZ)
        for s in (-1, 1):
            A.box(cx + s * 0.95, 2.1, 0.6, 0.24, 0.26, 6.8)
        for z in (-2.2, 0.0, 2.2, 3.4):
            A.box(cx, 2.2, 0.6 + z, 2.1, 0.16, 0.2)
        A.box(cx, 2.36, -1.7, 1.7, 0.95, 1.3)                       # the engine block
        A.flush()
        A = Acc("fit0Wheels", "tire", F, 0.04, dz=FIT_DZ)
        for s in (-1, 1):
            for z in (-2.2, 2.2):
                A.cyl(cx + s * 1.95, 2.3 - 0.8, 0.6 + z, 0.8, 0.5, 12, "x")
        A.flush()
        A = Acc("fit0Hubs", "metal", F, 0.02, dz=FIT_DZ)
        for s in (-1, 1):
            for z in (-2.2, 2.2):
                A.cyl(cx + s * 1.95, 2.3 - 0.35, 0.6 + z, 0.35, 0.56, 10, "x")
        A.flush()
        A = Acc("fit0Cage", "dark", F, 0.0, dz=FIT_DZ)
        for sx in (-1, 1):
            for sz in (-1, 1):
                A.tube((cx + sx * 0.8, 2.3, 0.6 + 0.2 + sz * 1.1), (cx + sx * 0.8, 3.8, 0.6 + 0.2 + sz * 1.1), 0.07, 5)
            A.tube((cx + sx * 0.8, 3.8, 0.6 - 0.9), (cx + sx * 0.8, 3.8, 0.6 + 1.3), 0.07, 5)
        A.tube((cx - 0.8, 3.8, 0.6 + 1.3), (cx + 0.8, 3.8, 0.6 + 1.3), 0.07, 5)
        A.tube((cx - 0.8, 3.8, 0.6 - 0.9), (cx + 0.8, 3.8, 0.6 - 0.9), 0.07, 5)
        A.flush()
        A = Acc("fit0Seat", "orange", F, 0.0, dz=FIT_DZ)
        A.box(cx, 2.36, 1.0, 0.9, 0.18, 0.8)
        A.box(cx, 2.5, 0.55, 0.9, 0.7, 0.16)
        A.flush()
        A = Acc("fit0Pack", "blue", F, 0.0, dz=FIT_DZ)
        A.box(cx, 2.36, 3.0, 1.4, 0.5, 0.9)
        A.flush()
        A = Acc("fit0Glow", "hot", F, 0.0, dz=FIT_DZ)
        A.cyl(cx, 3.3, -1.7, 0.22, 0.12, 8)
        A.flush()
        A = Acc("fit0Cell", "green", F, 0.0, dz=FIT_DZ)
        A.box(cx, 2.65, 3.46, 1.1, 0.07, 0.05)
        A.flush()
        # a rolling toolbox and a hose reel
        A = Acc("fit0Box", "redsafe", F, 0.0, dz=FIT_DZ)
        A.box(cx - 3.0, FY, -6.2, 1.3, 1.25, 0.8)
        A.flush()
        A = Acc("fit0BoxDrawers", "dark", F, 0.0, dz=FIT_DZ)
        for k in range(4):
            A.box(cx - 3.0, FY + 0.2 + k * 0.28, -5.78, 1.12, 0.05, 0.03)
        A.flush()
        A = Acc("fit0Reel", "orange", F, 0.0, dz=FIT_DZ)
        A.cyl(cx + 2.8, 3.4, -9.2, 0.6, 0.35, 10, "z")
        A.flush()


    def fit_stand(b):
        # an engine on a stand, an oil drain and drums
        cx = BAYS[b]
        F = pivot(f"{PFX}fit{b}", (0, 0, 0), root, role="fit", bay=b)
        A = Acc("fit1Stand", "steel", F, 0.0, dz=FIT_DZ)
        A.box(cx - 1.4, FY + 0.5, -2.6, 1.5, 0.9, 1.2)
        for sx in (-1, 1):
            for sz in (-1, 1):
                A.tube((cx - 1.4 + sx * 0.6, FY, -2.6 + sz * 0.5), (cx - 1.4 + sx * 0.6, FY + 0.5, -2.6 + sz * 0.5), 0.05, 5)
        A.flush()
        A = Acc("fit1Hot", "hot", F, 0.0, dz=FIT_DZ)
        A.cyl(cx - 1.4, FY + 1.35, -2.6, 0.2, 0.1, 8)
        A.flush()
        A = Acc("fit1Drums", "blue", F, 0.0, dz=FIT_DZ)
        for k, (x, z) in enumerate(((cx + 2.2, -8.6), (cx + 3.0, -8.6), (cx + 2.6, -7.7))):
            A.cyl(x, FY, z, 0.4, 1.0, 12)
        A.flush()
        A = Acc("fit1DrumsRed", "redsafe", F, 0.0, dz=FIT_DZ)
        A.cyl(cx + 1.4, FY, -8.6, 0.4, 1.0, 12)
        A.flush()
        A = Acc("fit1Pit", "dark", F, 0.0, dz=FIT_DZ)
        A.box(cx + 1.2, FY, 1.0, 1.6, 0.03, 5.0)
        A.flush()
        A = Acc("fit1PitRail", "hazard", F, 0.0, dz=FIT_DZ)
        for s in (-1, 1):
            A.box(cx + 1.2 + s * 0.85, FY, 1.0, 0.1, 0.03, 5.2)
        A.flush()
        A = Acc("fit1Cart", "metal", F, 0.0, dz=FIT_DZ)
        A.box(cx - 3.0, FY + 0.35, 2.0, 0.9, 0.08, 1.6)
        for sx in (-1, 1):
            for sz in (-1, 1):
                A.cyl(cx - 3.0 + sx * 0.42, FY, 2.0 + sz * 0.7, 0.18, 0.1, 8, "x")
        A.flush()


    def fit_bench(b):
        # a workbench with a vice, a pegboard and parts shelves, a stack of tyres, a work lamp on a lead
        cx = BAYS[b]
        F = pivot(f"{PFX}fit{b}", (0, 0, 0), root, role="fit", bay=b)
        A = Acc("fit2Bench", "steel", F, 0.0, dz=FIT_DZ)
        A.box(cx - 0.5, FY, -8.7, 5.6, 0.9, 0.9)
        A.flush()
        A = Acc("fit2Top", "metal", F, 0.0, dz=FIT_DZ)
        A.box(cx - 0.5, 1.15, -8.65, 5.8, 0.08, 1.05)
        A.flush()
        A = Acc("fit2Drawers", "dark", F, 0.0, dz=FIT_DZ)
        for k in range(5):
            A.box(cx - 2.6 + k * 1.1, FY + 0.15, -8.23, 0.95, 0.5, 0.03)
        A.flush()
        A = Acc("fit2Peg", "metal", F, 0.0, dz=FIT_DZ)
        A.box(cx - 0.5, 1.8, -9.42, 5.8, 2.0, 0.05)
        A.flush()
        A = Acc("fit2Tools", "dark", F, 0.0, dz=FIT_DZ)
        for k in range(11):
            A.box(cx - 2.8 + k * 0.5, 2.1 + (k % 3) * 0.35, -9.37, 0.1, 0.5 + (k % 2) * 0.2, 0.04)
        A.flush()
        A = Acc("fit2Vice", "redsafe", F, 0.0, dz=FIT_DZ)
        A.box(cx + 1.6, 1.23, -8.6, 0.4, 0.3, 0.35)
        A.flush()
        A = Acc("fit2Shelf", "steel", F, 0.0, dz=FIT_DZ)
        for s in (-1, 1):
            A.box(cx + 4.3 + s * 1.55, FY, -9.1, 0.1, 3.6, 0.6)
        for k in range(4):
            A.box(cx + 4.3, FY + 0.15 + k * 1.0, -9.1, 3.2, 0.08, 0.6)
        A.flush()
        for slot, ks in (("orange", (0, 3)), ("blue", (1,)), ("green", (2,))):
            A = Acc(f"fit2Bins{slot}", slot, F, 0.02, dz=FIT_DZ)
            for k in ks:
                for j in range(4):
                    A.box(cx + 3.0 + j * 0.8 + (k % 2) * 0.2, FY + 0.23 + k * 1.0, -9.1, 0.6, 0.5, 0.5)
            A.flush()
        A = Acc("fit2Tyres", "tire", F, 0.0, dz=FIT_DZ)
        for k in range(5):
            A.cyl(cx - 3.3, FY + k * 0.32, -4.6, 0.78, 0.3, 10)
        A.flush()
        A = Acc("fit2TyreHubs", "metal", F, 0.0, dz=FIT_DZ)
        A.cyl(cx - 3.3, FY + 1.6, -4.6, 0.4, 0.02, 10)
        A.flush()
        A = Acc("fit2Lamp", "lamp", F, 0.0, dz=FIT_DZ)
        A.box(cx + 1.0, 4.4, -2.9, 0.3, 0.3, 0.3)
        A.flush()
        A = Acc("fit2Lead", "dark", F, 0.0, dz=FIT_DZ)
        A.tube((cx + 1.0, 7.45, -2.9), (cx + 1.0, 4.7, -2.9), 0.02, 4)
        A.flush()


    # which fit-out goes in which bay
    for b, fit in enumerate((fit_lift, fit_stand, fit_bench) if FULL else (fit_lift, fit_bench)):
        fit(b)

    # ---------------------------------------------------------------------------------------------------------------
    # the roof: a glazed clerestory, two plant units, a row of solar panels, stacks, the ladder and the antenna mast
    # ---------------------------------------------------------------------------------------------------------------
    RY = TOP + 0.3
    CW = 18.0 if FULL else 13.0                  # the clerestory's length
    A = Acc("clerestory", "body", root, 0.06)
    A.box(0, RY, 0.5, CW, 1.6, 4.0)
    A.flush()
    A = Acc("clerestoryCap", "roof", root, 0.04)
    A.box(0, RY + 1.6, 0.5, CW + 0.8, 0.25, 4.8)
    A.flush()
    A = Acc("clerestoryGlass", "glass", root, 0.0)
    A.box(0, RY + 0.4, 2.55, CW - 1.0, 0.9, 0.04)
    A.box(0, RY + 0.4, -1.55, CW - 1.0, 0.9, 0.04)
    A.flush()
    A = Acc("clerestoryMullions", "dark", root, 0.0)
    for k in range(7):
        A.box(-CW / 2 + CW * k / 6.0, RY + 0.35, 2.54, 0.12, 1.0, 0.06)
        A.box(-CW / 2 + CW * k / 6.0, RY + 0.35, -1.54, 0.12, 1.0, 0.06)
    A.flush()
    # plant units on the roof, each with a fan
    PLX = -14.0 if FULL else -10.5
    for z in ((-6.8, -2.8) if FULL else (-4.5,)):
        A = Acc("plant", "metal", root, 0.05)
        A.box(PLX, RY, z, 3.4, 1.6, 2.2)
        A.flush()
        A = Acc("plantFan", "dark", root, 0.03)
        A.cyl(PLX - 0.7, RY + 1.6, z, 0.75, 0.12, 14)
        A.cyl(PLX + 0.7, RY + 1.6, z, 0.75, 0.12, 14)
        A.flush()
        A = Acc("plantGrille", "steel", root, 0.0)
        for k in range(5):
            A.box(PLX, RY + 0.35 + k * 0.22, z + 1.12, 2.4, 0.07, 0.04)
        A.flush()
    # the solar array: panels tilted toward the front, in two rows on the back half
    rot = (PI / 9, 0, 0)
    A = Acc("solarPanels", "panel", root, 0.03)
    F = Acc("solarFrames", "steel", root, 0.02)
    SX0, SN = (3.9, 5) if FULL else (3.0, 3)
    for zr in ((-4.2, -7.6) if FULL else (-4.0,)):
        for i in range(SN):
            x = SX0 + i * 2.7
            A.box(x, RY + 0.72, zr, 2.5, 0.07, 1.6, rot)
            F.box(x, RY + 0.66, zr, 2.62, 0.05, 1.72, rot)
        for x in (SX0 - 0.5, SX0 + 2.7 * (SN - 1) + 0.5):
            F.tube((x, RY, zr - 0.55), (x, RY + 0.55, zr - 0.5), 0.05, 4)
            F.tube((x, RY, zr + 0.7), (x, RY + 0.9, zr + 0.55), 0.05, 4)
    A.flush()
    F.flush()
    # exhaust stacks
    A = Acc("stacks", "steel", root, 0.04)
    STK = ((-18.0, 7.2, 2.6), (-16.9, 7.6, 2.0), (-17.4, 5.9, 3.0)) if FULL else ((-HX + 1.0, HZ - 3.0, 2.4),)
    for x, z, h in STK:
        A.cyl(x, RY, z, 0.2, h, 8)
    A.flush()
    A = Acc("stackCaps", "dark", root, 0.03)
    for x, z, h in STK:
        A.cyl(x, RY + h, z, 0.32, 0.12, 8, rt=0.05)
    A.flush()
    # the roof ladder up the back wall: rails, rungs and cage hoops
    A = Acc("ladder", "steel", root, 0.02)
    LX, LZ = HX - 2.0, -HZ - 0.5
    for s in (-1, 1):
        A.tube((LX + s * 0.3, 0.12, LZ), (LX + s * 0.3, TOP + 1.2, LZ), 0.04, 4)
    y = 0.6
    while y < TOP + 1.0:
        A.tube((LX - 0.3, y, LZ), (LX + 0.3, y, LZ), 0.025, 3)
        y += 0.6
    for y in (3.2, 5.4, 7.6):
        A.add(torus(0.5, 0.025, 8, 3), (LX, y, LZ - 0.0), (PI / 2, 0, 0))
    for s in (-1, 1):
        for y in (1.0, 5.0, 8.5):
            A.tube((LX + s * 0.3, y, LZ), (LX + s * 0.3, y, LZ + 0.5), 0.03, 4)
    A.flush()
    if FULL:
        # the antenna mast with its dish and the warning lamp
        A = Acc("mast", "steel", root, 0.03)
        A.tube((-17.0, RY, -8.0), (-17.0, RY + 7.2, -8.0), 0.09, 6)
        for y, w in ((RY + 4.5, 1.8), (RY + 5.6, 1.2)):
            A.tube((-17.0 - w / 2, y, -8.0), (-17.0 + w / 2, y, -8.0), 0.05, 5)
        A.flush()
        A = Acc("dish", "white", root, 0.03)
        A.add(sphere(0.6, 12, 4, PI * 0.45)[:2], (-17.0, RY + 3.4, -7.4), (-PI / 2 + 0.25, 0, 0))
        A.flush()
        pivot(PFX + "beacon", (-17.0, RY + 7.4, -8.0), root, role="blinker", radius=0.25)
    # the turbine vents: a fixed neck on the roof, and the head that spins
    for i, (x, z) in enumerate(((14.0, 3.0), (-3.0, -6.0)) if FULL else ((10.0, 2.5),)):
        A = Acc(f"vent{i}", "steel", root, 0.04)
        A.cyl(x, RY, z, 0.4, 0.95, 10)
        A.cyl(x, RY + 0.9, z, 0.62, 0.1, 12)
        A.flush()
        Pf = pivot(f"{PFX}fan{i}", (x, RY + 1.0, z), root, role="fan", speed=1.2 + 0.4 * i)
        prof = [(0.62, 0.0), (0.7, 0.12), (0.74, 0.5), (0.55, 0.85), (0.2, 1.02), (0.0, 1.06)]
        mesh(f"{PFX}fanHead{i}", lathe(prof, 14), "metal", Pf, 0.03)
        vanes = []
        for k in range(12):
            a = 2 * PI * k / 12
            vanes.append(xf(cuboid(0.07, 0.8, 0.5)[:2], (math.sin(a) * 0.72, 0.45, math.cos(a) * 0.72), (0, a + 0.5, 0)))
        mesh(f"{PFX}fanVanes{i}", join(vanes), "steel", Pf, 0.0)

    if FULL:
        # ---------------------------------------------------------------------------------------------------------------
        # the service office on the right: windows, a door under a canopy with its lettering, steps and a roof plant
        # ---------------------------------------------------------------------------------------------------------------
        OX0, OX1, OZ0, OZ1, OH = HX, HX + 8.5, -3.0, HZ, 4.45
        A = Acc("office", "body", root, 0.06)
        A.box((OX0 + OX1) / 2, FY, (OZ0 + OZ1) / 2, OX1 - OX0, OH - FY, OZ1 - OZ0)
        A.box((OX0 + OX1) / 2, FY - 0.25, (OZ0 + OZ1) / 2, OX1 - OX0 + 1.0, 0.25, OZ1 - OZ0 + 1.0)
        A.flush()
        A = Acc("officeRoof", "roof", root, 0.05)
        A.box((OX0 + OX1) / 2, OH, (OZ0 + OZ1) / 2, OX1 - OX0 + 0.4, 0.25, OZ1 - OZ0 + 0.4)
        A.flush()
        A = Acc("officeParapet", "body", root, 0.04)
        A.box((OX0 + OX1) / 2, OH + 0.25, OZ1 - 0.05, OX1 - OX0 + 0.4, 0.55, 0.3)
        A.box((OX0 + OX1) / 2, OH + 0.25, OZ0 + 0.05, OX1 - OX0 + 0.4, 0.55, 0.3)
        A.box(OX1 - 0.05, OH + 0.25, (OZ0 + OZ1) / 2, 0.3, 0.55, OZ1 - OZ0)
        A.flush()
        A = Acc("officeCap", "trim", root, 0.03)
        A.box((OX0 + OX1) / 2, OH + 0.8, OZ1 - 0.05, OX1 - OX0 + 0.8, 0.14, 0.55)
        A.box((OX0 + OX1) / 2, OH + 0.8, OZ0 + 0.05, OX1 - OX0 + 0.8, 0.14, 0.55)
        A.box(OX1 - 0.05, OH + 0.8, (OZ0 + OZ1) / 2, 0.55, 0.14, OZ1 - OZ0 + 0.4)
        A.flush()
        A = Acc("officeBase", "navy", root, 0.03)
        A.box((OX0 + OX1) / 2 + 0.03, FY, OZ1 + 0.035, OX1 - OX0, 0.95, 0.07)
        A.box(OX1 + 0.035, FY, (OZ0 + OZ1) / 2, 0.07, 0.95, OZ1 - OZ0)
        A.box((OX0 + OX1) / 2 + 0.03, FY, OZ0 - 0.035, OX1 - OX0, 0.95, 0.07)
        A.flush()
        A = Acc("officeBand", "trim", root, 0.02)
        A.box((OX0 + OX1) / 2 + 0.03, 3.45, OZ1 + 0.04, OX1 - OX0, 0.5, 0.08)
        A.box(OX1 + 0.04, 3.45, (OZ0 + OZ1) / 2, 0.08, 0.5, OZ1 - OZ0)
        A.box((OX0 + OX1) / 2 + 0.03, 3.45, OZ0 - 0.04, OX1 - OX0, 0.5, 0.08)
        A.flush()
        # windows: lit panes in dark frames with sills, on the front and the end
        A = Acc("officeFrames", "dark", root, 0.03)
        Gw = Acc("officeGlass", "window", root, 0.0)
        for x in (23.3, 25.8):
            A.box(x, 1.75, OZ1 + 0.04, 1.9, 1.5, 0.08)
            A.box(x, 1.65, OZ1 + 0.14, 2.1, 0.1, 0.22)
            Gw.box(x, 1.9, OZ1 + 0.1, 1.7, 1.2, 0.04)
        for z in (-1.5, 1.7, 4.9, 8.1):
            A.box(OX1 + 0.04, 1.75, z, 0.08, 1.5, 2.0)
            A.box(OX1 + 0.14, 1.65, z, 0.22, 0.1, 2.2)
            Gw.box(OX1 + 0.1, 1.9, z, 0.04, 1.2, 1.8)
        A.flush()
        Gw.flush()
        A = Acc("officeMullions", "dark", root, 0.0)
        for x in (23.3, 25.8):
            A.box(x, 1.9, OZ1 + 0.13, 0.08, 1.2, 0.05)
        for z in (-1.5, 1.7, 4.9, 8.1):
            A.box(OX1 + 0.13, 1.9, z, 0.05, 1.2, 0.08)
        A.flush()
        # the door, canopy, steps and a lamp
        A = Acc("officeDoor", "steel", root, 0.03)
        A.box(21.0, FY, OZ1 + 0.05, 1.5, 2.6, 0.1)
        A.box(21.0, 2.75, OZ1 + 0.6, 2.9, 0.12, 1.4)
        for s in (-1, 1):
            A.tube((21.0 + s * 1.35, 2.7, OZ1 + 1.25), (21.0 + s * 1.35, 3.0, OZ1 + 0.9), 0.04)
        A.flush()
        A = Acc("officeFascia", "trim", root, 0.03)
        A.box(21.0, 2.7, OZ1 + 1.3, 2.9, 0.42, 0.1)
        A.flush()
        A = Acc("officeLeaf", "door", root, 0.02)
        A.box(21.0, FY, OZ1 + 0.12, 1.2, 2.45, 0.08)
        A.flush()
        A = Acc("officeLeafGlass", "glass", root, 0.0)
        A.box(21.0, 1.5, OZ1 + 0.18, 0.7, 1.0, 0.04)
        A.flush()
        A = Acc("officeSteps", "concrete", root, 0.04)
        A.box(21.0, 0.0, OZ1 + 1.2, 2.6, 0.18, 1.0)
        A.box(21.0, 0.0, OZ1 + 1.0, 2.6, 0.36, 0.5)
        A.flush()
        A = Acc("officeLamp", "lamp", root, 0.0)
        A.box(22.3, 2.9, OZ1 + 0.18, 0.2, 0.2, 0.08)
        A.flush()
        d = Dec("+z", (21.0, 2.7, OZ1 + 1.36))
        d.text("SERVICE", -text_width("SERVICE", 0.045) / 2, 0.42 / 2 - 3.5 * 0.045, 0.045, "stripe", 0)
        d.build(PFX + "officeSign", root)
        # the roof plant, a dish and a vent on the office
        A = Acc("officePlant", "metal", root, 0.04)
        A.box(24.5, OH + 0.25, 1.0, 2.4, 1.2, 1.8)
        A.flush()
        A = Acc("officeFan", "dark", root, 0.03)
        A.cyl(24.5, OH + 1.45, 1.0, 0.7, 0.1, 12)
        A.flush()
        A = Acc("officeDish", "white", root, 0.03)
        A.tube((20.8, OH + 0.25, -1.4), (20.8, OH + 1.7, -1.4), 0.06, 5)
        A.add(sphere(0.7, 12, 4, PI * 0.45)[:2], (20.8, OH + 2.0, -1.1), (-PI / 2 + 0.5, 0.4, 0))
        A.flush()

        # ---------------------------------------------------------------------------------------------------------------
        # the fuel and coolant yard on the left: two tanks on cradles, ladders, a manifold into the wall, a pump and drums
        # ---------------------------------------------------------------------------------------------------------------
        TX = -HX - 4.6
        TR = 1.3
        TY = 2.0
        for i, tz in enumerate((5.0, -4.2)):
            tank = pivot(f"{PFX}tank{i}", (0, 0, 0), root)
            mesh(f"{PFX}tankBody{i}", xf(capsule(TR, 6.4, 0.9), (TX, TY, tz)), "tank", tank, 0.05)
            A = Acc(f"tank{i}Cradle", "concrete", tank, 0.04)
            for dz in (-2.3, 2.3):
                A.box(TX, 0, tz + dz, 2.8, 0.85, 0.7)
            A.flush()
            A = Acc(f"tank{i}Bands", "trim", tank, 0.03)
            for dz in (-1.1, 1.1):
                A.cyl(TX, TY - 0.25, tz + dz, TR + 0.04, 0.5, 16, "z")
            A.flush()
            A = Acc(f"tank{i}Hazard", "hazard", tank, 0.02)
            A.cyl(TX, TY - 0.08, tz, TR + 0.04, 0.16, 16, "z")
            A.flush()
            A = Acc(f"tank{i}Fit", "steel", tank, 0.03)
            A.cyl(TX, TY + TR - 0.1, tz - 1.2, 0.38, 0.25, 10)             # the manway
            A.cyl(TX, TY + TR + 0.12, tz - 1.2, 0.45, 0.07, 10)
            A.cyl(TX + 0.5, TY + TR - 0.1, tz + 1.4, 0.1, 0.8, 8)           # the relief stack
            A.cyl(TX + 0.5, TY + TR + 0.7, tz + 1.4, 0.2, 0.08, 8)
            for s in (-1, 1):                                                # a ladder up the end
                A.tube((TX + s * 0.3, 0.1, tz + 3.65), (TX + s * 0.3, TY + TR, tz + 3.2), 0.035, 4)
            for k in range(5):
                t = (k + 0.5) / 5
                A.tube((TX - 0.3, 0.1 + t * (TY + TR - 0.1), tz + 3.65 - 0.45 * t), (TX + 0.3, 0.1 + t * (TY + TR - 0.1), tz + 3.65 - 0.45 * t), 0.022, 4)
            # the manifold: a pipe along the ground to the wall and up
            A.tube((TX + TR + 0.2, 0.55, tz), (-HX - 0.3, 0.55, tz), 0.12, 6)
            A.tube((-HX - 0.3, 0.55, tz), (-HX - 0.3, 2.2, tz), 0.12, 6)
            A.flush()
            A = Acc(f"tank{i}Valve", "redsafe", tank, 0.02)
            A.add(torus_arc(0.22, 0.04, 12, 5)[:2], (TX + TR + 0.9, 0.7, tz), (0, 0, 0))
            A.flush()
            A = Acc(f"tank{i}Gauge", "white", tank, 0.0)
            A.cyl(TX - TR - 0.05, TY - 0.2, tz, 0.22, 0.08, 12, "x")
            A.flush()
        # bollards round the cradles, a stack of drums and a pump island out front
        A = Acc("yardBollards", "hazard", root, 0.03)
        for x, z in ((TX - 2.1, 8.6), (TX + 2.1, 8.6), (TX - 2.1, -7.8), (TX + 2.1, -7.8), (TX - 2.1, 0.4), (TX + 2.1, 0.4)):
            A.cyl(x, 0, z, 0.15, 0.9, 6)
        A.flush()
        A = Acc("yardDrums", "blue", root, 0.04)
        A.cyl(-HX - 2.1, 0, -9.4, 0.4, 1.0, 12)
        A.cyl(-HX - 3.0, 0, -9.4, 0.4, 1.0, 12)
        A.flush()
        A = Acc("yardDrumsRed", "redsafe", root, 0.04)
        A.cyl(-HX - 2.55, 0, -8.6, 0.4, 1.0, 12)
        A.flush()
        A = Acc("island", "concrete", root, 0.05)
        A.box(-21.5, 0, HZ + 4.2, 4.6, 0.22, 1.4)
        A.flush()
        A = Acc("pump", "trim", root, 0.04)
        A.box(-21.5, 0.22, HZ + 4.2, 0.8, 1.7, 0.6)
        A.box(-21.5, 1.92, HZ + 4.2, 1.0, 0.16, 0.8)
        A.flush()
        A = Acc("pumpFace", "glass", root, 0.0)
        A.box(-21.5, 1.3, HZ + 4.52, 0.55, 0.45, 0.04)
        A.flush()
        A = Acc("pumpHose", "dark", root, 0.0)
        A.tube((-21.1, 1.2, HZ + 4.2), (-20.7, 0.8, HZ + 4.2), 0.04, 5)
        A.tube((-20.7, 0.8, HZ + 4.2), (-20.8, 0.5, HZ + 4.2), 0.04, 5)
        A.flush()
        A = Acc("pumpNozzle", "redsafe", root, 0.0)
        A.box(-20.8, 0.38, HZ + 4.2, 0.16, 0.2, 0.1)
        A.flush()

    flush_all()
    return root


build("garage", "garage_", "main")
build("garage_small", "gs_", "small")


# ---------------------------------------------------------------------------------------------------------------
objs = [o for o in C.objects]
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == "MESH")
print("meshes:", sum(1 for o in objs if o.type == "MESH"), "triangles:", tris)
for n in ("garage", "garage_small"):
    if n not in bpy.data.objects or bpy.data.objects[n].parent is not None:
        raise RuntimeError(f"root {n!r} is missing or was renamed")
export(OUT, objs)
if os.environ.get("GARAGE_BLEND"):
    bpy.ops.wm.save_as_mainfile(filepath=os.environ["GARAGE_BLEND"])

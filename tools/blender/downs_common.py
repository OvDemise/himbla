# Shared set-up for the Chimera Downs builders (build_downs_*.py): the palette, the accumulator that merges a model's boxes and cylinders per slot, and the export.
# Each builder sets DOWNS_OUT (the file name under src/assets) and DOWNS_COLL, then execs this file into its own globals:
#   DOWNS_OUT = "downs-stand.glb"; DOWNS_COLL = "MoonDownsStand"
#   exec(open(os.path.join(REPO, "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())
# Authored in three.js axes (x right, y up, +z front), each model standing on y = 0 with its origin on the ground, one material per mesh named after a slot (DOWNS_TOON /
# DOWNS_GLOW in src/models.js; the glow slots are lit), `ink` the outline shell's thickness in metres. The palette is the Downs' own (docs/downs-layouts.md):
#   Gold Gleam cfb352, Saddle Brown b07c57, Black 3b393a, Money 7b9a6e, Barn Red 8b4044, Touch of Mint f8fff8 (and a darker tint of each for shading)
import bpy, bmesh, math, os


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "downs_common.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.environ.get("DOWNS_OUT") or os.path.join(REPO, "src", "assets", DOWNS_OUT)
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Downs export ->", OUT)
COLL = DOWNS_COLL
PI = math.pi


def S(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


HEX = {
    "mint": "f8fff8", "mint2": "dfe8dd", "gold": "cfb352", "gold2": "a8903a", "saddle": "b07c57", "saddle2": "8c5f3f", "black": "3b393a", "black2": "5a5760",
    "money": "7b9a6e", "money2": "5b7a52", "barn": "8b4044", "barn2": "6a2e33",
    "seat": "7b9a6e", "cloth": "8b4044", "accent": "8b4044", "glasswarm": "fff0c0", "glowgold": "ffe9a0", "glowmint": "e8fff0", "glowred": "ff5a4a",
}
SLOT_COLORS = {k: S(v) for k, v in HEX.items()}
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
C = coll()
for s in SLOT_COLORS:
    material(s)


class Acc:
    all = []

    def __init__(self, name, slot, parent, ink=0.015):
        self.name, self.slot, self.parent, self.ink, self.geos = name, slot, parent, ink, []
        Acc.all.append(self)

    def boxc(self, cx, cy, cz, w, h, d, rot=(0, 0, 0)):
        self.geos.append(xf(cuboid(w, h, d)[:2], (cx, cy, cz), rot)); return self

    def box(self, x0, x1, y0, y1, z0, z1):
        x0, x1, y0, y1, z0, z1 = min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1), min(z0, z1), max(z0, z1)
        return self.boxc((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0)

    def rbc(self, cx, cy, cz, w, h, d, e=0.3, rot=(0, 0, 0), nu=14, nv=8):
        self.geos.append(xf(rbox(w / 2, h / 2, d / 2, e, nu, nv), (cx, cy, cz), rot)); return self

    def cylc(self, cx, cy, cz, r, h, seg=12, rt=None, rot=(0, 0, 0)):
        self.geos.append(xf(cylinder(r if rt is None else rt, r, h, seg)[:2], (cx, cy, cz), rot)); return self

    def tor(self, R, r, t=(0, 0, 0), rot=(0, 0, 0), n=24, rs=6, s=(1, 1, 1)):
        self.geos.append(xf(torus(R, r, n, rs), t, rot, s)); return self

    def path(self, pts, r, seg=6):
        self.geos.append(tube(pts, r if isinstance(r, (list, tuple)) else [r] * len(pts), seg)); return self

    def bm(self, a, b, r, seg=5):
        """a strut of radius r between two points"""
        self.geos.append(beam(a, b, r, seg)); return self

    def poly(self, pts, z0, z1, t=(0, 0, 0)):
        """a flat outline [(x, y)] extruded from z0 to z1"""
        self.geos.append(xf(extrude(pts, z1 - z0, "z"), (t[0], t[1], (z0 + z1) / 2 + t[2]))); return self

    def polyx(self, pts, x0, x1):
        """a flat outline [(z, y)] extruded along x from x0 to x1 (a side profile)"""
        self.geos.append(xf(extrude(pts, x1 - x0, "x"), ((x0 + x1) / 2, 0, 0))); return self

    def polyy(self, pts, y0, y1, t=(0, 0, 0), rot=(0, 0, 0)):
        """a flat outline [(x, z)] extruded upward from y0 to y1 (a floor, a roof deck); `t` and `rot` move it afterwards"""
        area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
        if area > 0:                                                                        # (it needs to run clockwise on the x-right, z-up plan to face its cap up)
            pts = pts[::-1]
        self.geos.append(xf(extrude(pts, y1 - y0, "y"), (t[0], t[1] + (y0 + y1) / 2, t[2]), rot)); return self

    def lath(self, profile, t=(0, 0, 0), segs=24, rot=(0, 0, 0)):
        """a solid of revolution: profile [(r, y)] bottom to top"""
        self.geos.append(xf(lathe(profile, segs)[:2], t, rot)); return self

    def add(self, geo, t=(0, 0, 0), rot=(0, 0, 0), s=(1, 1, 1)):
        self.geos.append(xf(geo[:2], t, rot, s)); return self

    def flush(self):
        if self.geos:
            mesh(self.name, join(self.geos), self.slot, self.parent, self.ink)
        self.geos = []


def flush_all():
    for a in Acc.all:
        a.flush()


def parts(root, prefix, specs):
    """accumulators for a model: specs is {slot: ink}; returns {slot: Acc} named <prefix>_<slot>"""
    return {s: Acc(f"{prefix}_{s}", s, root, ink) for s, ink in specs.items()}


def finish_and_export():
    flush_all()
    audit_coplanar(C.objects)
    dg = bpy.context.evaluated_depsgraph_get()
    tris = {}
    for o in C.objects:
        if o.type != "MESH":
            continue
        p = o
        while p.parent:
            p = p.parent
        tris[p.name] = tris.get(p.name, 0) + sum(len(q.vertices) - 2 for q in o.evaluated_get(dg).to_mesh().polygons)
    print("built", len(C.objects), "objects; triangles per root:", tris)
    if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
        export(OUT, list(C.objects))

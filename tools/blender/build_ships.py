# Transit ship builder for Blender (4.2+ / 5.x): the shuttle-bus and the cargo freighter.
#
# Builds both flyers from code and exports src/assets/ships.glb. In Blender's Python console or
# via MCP:  exec(open(r"<repo>/tools/blender/build_ships.py").read())
#
# Conventions the game relies on (see loadShipParts / makeShip in src/models.js):
# - One root empty per ship ("shuttle", "freighter") holding its numbers as custom properties
#   (gearH, deck, deckY, deckZ, inside, rampTop, rampBottom...) in three.js axes.
# - Every mesh is a child of a pivot empty, and is read in that pivot's frame. Pivots carry a
#   "role" the game animates:
#     hull    static
#     leg     landing leg, authored deployed (pointing down); folds by rotating "fold" rad about x
#     foot    child of a leg; counter-rotates so the pad stays level while the leg folds
#     door    gear-bay door, authored closed; opens by rotating "open" rad about z
#     ramp    authored open-flat along -z; "closed" / "opened" are its x rotations
#     hatch   lit doorway, only shown while the ramp is open
#     plume   main thruster flame along -z (pulses while flying)
#     lift    belly lift-jet flame along -y (on while climbing off / settling onto a pad)
# - Each mesh has ONE material whose name is a slot (body, stripe, trim, dark, ...). The game
#   swaps in its own toon / glow materials per slot, which is how liveries recolour.
# - Custom property "ink" = outline thickness in metres (0 = none).
#
# Everything below is authored in three.js axes (x right, y up, +z forward/nose) and converted
# to Blender's (x, -z, y) on the way in, which the glTF exporter's +Y-up option converts back.

import bpy, bmesh, math, os
from mathutils import Vector, Euler


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_ships.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.path.join(REPO, "src", "assets", "ships.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Ships export ->", OUT)
COLL = "MoonShips"

# preview colours only: the game replaces every slot with its own material
SLOT_COLORS = {
    "body": (0.95, 0.93, 0.86), "stripe": (0.18, 0.77, 1.0), "trim": (0.85, 0.83, 0.91),
    "dark": (0.13, 0.11, 0.2), "metal": (0.54, 0.53, 0.63), "steel": (0.33, 0.38, 0.48),
    "bay": (0.06, 0.05, 0.1), "deck": (0.36, 0.35, 0.44), "hazard": (1.0, 0.82, 0.25),
    "glass": (0.6, 0.9, 1.0), "window": (1.0, 0.96, 0.66), "cabin": (1.0, 0.95, 0.69),
    "engine": (1.0, 0.62, 0.11), "core": (1.0, 0.95, 0.75), "red": (1.0, 0.16, 0.29),
    "green": (0.49, 1.0, 0.42), "white": (1.0, 1.0, 1.0), "sign": (1.0, 0.82, 0.25),
    "plume": (1.0, 0.55, 0.15), "plumeCore": (1.0, 0.95, 0.8), "lift": (0.55, 0.85, 1.0),
    "cargo0": (1.0, 0.82, 0.25), "cargo1": (0.18, 0.77, 1.0), "cargo2": (1.0, 0.23, 0.36), "cargo3": (0.49, 1.0, 0.42),
    # (the land-train cargo units in the bays: under a "cargo" pivot the game uses its land-train palette for every slot)
    "accent": (0.42, 0.56, 0.23), "label": (0.16, 0.14, 0.25), "tire": (0.1, 0.09, 0.14), "lamp": (1.0, 0.96, 0.66), "tail": (1.0, 0.16, 0.29),
    "hot": (1.0, 0.62, 0.11), "tank": (0.78, 0.84, 0.92), "brand": (0.08, 0.64, 0.72), "redsafe": (0.79, 0.13, 0.18),
    "orange": (1.0, 0.48, 0.1), "blue": (0.11, 0.39, 0.84),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "decals.py"), encoding="utf-8").read(), globals())
exec(open(os.path.join(REPO, "tools", "blender", "cargo.py"), encoding="utf-8").read(), globals())


# ---------------- geometry helpers (three.js axes, return (verts, faces)) ----------------

def ring_pts(w, top, bot, eT, eB, yc=0.0, n=32):
    """A superellipse cross-section in the x-y plane: half-width w, top/bot heights above/below
    yc, exponents eT/eB (2 = ellipse, 4+ = squircle, big = flat). Starts at +x, goes over the top."""
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        e = eT if s >= 0 else eB
        h = top if s >= 0 else bot
        pts.append((w * spe(c, 2 / e), yc + h * spe(s, 2 / e)))
    return pts


def surf_x(sec, y):
    """Half-width of a cross-section at height y (for sticking things on the flank)."""
    yc = sec.get("yc", 0.0)
    h = sec["t"] if y >= yc else sec["b"]
    e = sec.get("eT", 2.5) if y >= yc else sec.get("eB", 2.5)
    k = min(1.0, abs(y - yc) / h)
    return sec["w"] * (1 - k ** e) ** (1 / e)


def lerp_sec(sections, z):
    for a, b in zip(sections, sections[1:]):
        if a["z"] <= z <= b["z"]:
            t = (z - a["z"]) / ((b["z"] - a["z"]) or 1)
            out = {"z": z}
            for k in ("w", "t", "b", "eT", "eB", "yc"):
                out[k] = a.get(k, 2.5 if k[0] == "e" else 0.0) * (1 - t) + b.get(k, 2.5 if k[0] == "e" else 0.0) * t
            return out
    return dict(sections[-1] if z > sections[-1]["z"] else sections[0])


def densify(sections, step=0.4):
    """Extra cross-sections every `step` metres, so bands cut from the hull have clean edges."""
    out = []
    for a, b in zip(sections, sections[1:]):
        n = max(1, int(math.ceil((b["z"] - a["z"]) / step)))
        for i in range(n):
            out.append(lerp_sec(sections, a["z"] + (b["z"] - a["z"]) * i / n))
    out.append(dict(sections[-1]))
    return out


def band(sections, d, pred, n=220, step=0.14):
    """A skin laid over the hull (pushed out by d), cut to the faces whose centre passes pred."""
    return keep(loft(grow(densify(sections, step), d), n, False, False), pred)


def clip(geo, axis, lo, hi):
    """Every face cut exactly to lo <= coord[axis] <= hi (Sutherland-Hodgman against both planes).
    keep() drops or keeps whole faces, so a band cut across the hull's quads at a slant came out
    with a sawtooth edge; this one is ruler-straight. (Shared cut vertices are welded in mesh().)"""
    verts, faces = geo
    out_v, out_f = [], []

    def cut(poly, inside, t_of):
        res = []
        for i, a in enumerate(poly):
            b = poly[(i + 1) % len(poly)]
            ia, ib = inside(a), inside(b)
            if ia:
                res.append(a)
            if ia != ib:
                t = t_of(a, b)
                res.append(tuple(a[k] + (b[k] - a[k]) * t for k in range(3)))
        return res

    for f in faces:
        poly = [tuple(verts[i]) for i in f]
        poly = cut(poly, lambda v: v[axis] >= lo, lambda a, b: (lo - a[axis]) / (b[axis] - a[axis]))
        if len(poly) >= 3:
            poly = cut(poly, lambda v: v[axis] <= hi, lambda a, b: (hi - a[axis]) / (b[axis] - a[axis]))
        if len(poly) >= 3:
            o = len(out_v)
            out_v += poly
            out_f.append(tuple(range(o, o + len(poly))))
    return out_v, out_f


def cband(sections, d, ylo, yhi, zlo=-1e9, zhi=1e9, n=220, step=0.14):
    """A level band laid over the hull between two heights (and optionally two stations), with
    clean, straight edges."""
    return clip(clip(loft(grow(densify(sections, step), d), n, False, False), 1, ylo, yhi), 2, zlo, zhi)


def grow(sections, d):
    """The same hull pushed out by d (for bands and glazing laid over it)."""
    return [{**s, "w": s["w"] + d, "t": s["t"] + d, "b": s["b"] + d} for s in sections]


def superquad(sx, sy, sz, e1=0.35, e2=0.35, nu=16, nv=10):
    """Superellipsoid with half-sizes sx, sy, sz. e ~0.2 = boxy, 1 = sphere."""
    verts, faces = [], []
    verts.append((0.0, -sy, 0.0))
    for j in range(1, nv):
        v = -math.pi / 2 + math.pi * j / nv
        cv, sv = spe(math.cos(v), e1), spe(math.sin(v), e1)
        for i in range(nu):
            u = 2 * math.pi * i / nu
            verts.append((sx * cv * spe(math.sin(u), e2), sy * sv, sz * cv * spe(math.cos(u), e2)))
    verts.append((0.0, sy, 0.0))
    top = len(verts) - 1
    ring = lambda j, i: 1 + (j - 1) * nu + (i % nu)
    for i in range(nu):
        faces.append((0, ring(1, i + 1), ring(1, i)))
    for j in range(1, nv - 1):
        for i in range(nu):
            faces.append((ring(j, i), ring(j, i + 1), ring(j + 1, i + 1), ring(j + 1, i)))
    for i in range(nu):
        faces.append((ring(nv - 1, i), ring(nv - 1, i + 1), top))
    return verts, faces


def rbox(sx, sy, sz, e=0.18, nu=16, nv=8):
    """Rounded box (half-sizes)."""
    return superquad(sx, sy, sz, e, e, nu, nv)


def tube(path, radii, seg=8, cap=True):
    """Round tube along a polyline with a radius per point."""
    verts, faces = [], []
    P = [Vector(p) for p in path]
    for idx, p in enumerate(P):
        t = (P[min(idx + 1, len(P) - 1)] - P[max(idx - 1, 0)]).normalized()
        ref = Vector((0, 1, 0)) if abs(t.y) < 0.95 else Vector((1, 0, 0))
        n = t.cross(ref).normalized()
        b = t.cross(n).normalized()
        for k in range(seg):
            a = 2 * math.pi * k / seg
            verts.append(tuple(p + (n * math.cos(a) + b * math.sin(a)) * radii[idx]))
    for i in range(len(P) - 1):
        for k in range(seg):
            k2 = (k + 1) % seg
            faces.append((i * seg + k, i * seg + k2, (i + 1) * seg + k2, (i + 1) * seg + k))
    if cap:
        faces.append(tuple(range(seg - 1, -1, -1)))
        base = (len(P) - 1) * seg
        faces.append(tuple(base + k for k in range(seg)))
    return verts, faces


def extrude(outline, depth, axis="x"):
    """Flat profile [(a, b)] extruded symmetrically. axis x: profile is (z, y); y: (x, z); z: (x, y)."""
    n = len(outline)
    verts, faces = [], []
    for s in (-depth / 2, depth / 2):
        for a, b in outline:
            verts.append((s, b, a) if axis == "x" else (a, s, b) if axis == "y" else (a, b, s))
    faces.append(tuple(range(n - 1, -1, -1)))
    faces.append(tuple(range(n, 2 * n)))
    for i in range(n):
        i2 = (i + 1) % n
        faces.append((i, i2, n + i2, n + i))
    return verts, faces


def xf(geo, t=(0, 0, 0), r=(0, 0, 0), s=(1, 1, 1), fn=None, order="XYZ"):
    """Scale, then rotate (euler, three.js axes), then translate; fn(v) deforms first."""
    verts, faces = geo
    rot = Euler(r, order).to_matrix()
    out = []
    for v in verts:
        v = Vector(v)
        if fn:
            v = Vector(fn(v))
        v = Vector((v.x * s[0], v.y * s[1], v.z * s[2]))
        out.append(tuple(rot @ v + Vector(t)))
    flip = (s[0] * s[1] * s[2]) < 0
    return out, ([tuple(reversed(f)) for f in faces] if flip else faces)


def keep(geo, pred):
    """Only the faces whose centre passes pred: cuts a band / panel off a shape."""
    verts, faces = geo
    out = [f for f in faces if pred(tuple(sum(verts[i][k] for i in f) / len(f) for k in range(3)))]
    used = sorted({i for f in out for i in f})
    remap = {o: n for n, o in enumerate(used)}
    return [verts[i] for i in used], [tuple(remap[i] for i in f) for f in out]


def mirror_x(geo):
    return merge(geo, xf(geo, s=(-1, 1, 1)))


# ---------------- scene plumbing ----------------

def pivot(name, pos, parent=None, **props):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = 0.5
    C.objects.link(e)
    e.parent = parent
    e.location = tb(pos)
    for k, v in props.items():
        e[k] = v
    return e


SHARP = math.radians(38)


def mesh(name, geo, slot, parent, ink=0.06, sharp=SHARP):
    """sharp: edges creased more than this shade hard (None = all smooth, 0 = all flat)."""
    verts, faces = geo
    me = bpy.data.meshes.new(name)
    me.from_pydata([tb(v) for v in verts], [], [tuple(reversed(f)) for f in faces])
    me.validate()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = sharp != 0
    if sharp:
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0) > sharp:
                e.smooth = False
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    C.objects.link(o)
    o.parent = parent
    me.materials.append(material(slot))
    o["ink"] = ink
    o["slot"] = slot
    return o


C = coll()
for s in SLOT_COLORS:
    material(s)


# =============================================================================================
# Shared parts
# =============================================================================================

def landing_leg(ship, name, hinge, length, fold, r=0.22, pad=0.65, ink=0.04, scale=1.0):
    """A folding leg pivot at the hinge (inside the hull), deployed straight down, foot pad at
    -length. fold: x rotation that stows it (+ = swings the foot back toward -z)."""
    L = pivot(name, hinge, ship, role="leg", fold=fold)
    s = scale
    mesh(name + "_knuckle", rbox(r * 1.5, r * 1.3, r * 1.6, 0.3), "dark", L, ink)
    mesh(name + "_strut", tube([(0, -0.1 * s, 0), (0, -length * 0.55, 0)], [r, r * 0.9], 10), "metal", L, ink)
    mesh(name + "_collar", xf(torus(r * 1.05, r * 0.32, 14, 6), (0, -length * 0.5, 0)), "hazard", L, 0)
    mesh(name + "_oleo", tube([(0, -length * 0.5, 0), (0, -length + 0.25 * s, 0)], [r * 0.62, r * 0.6], 10), "trim", L, ink)
    # drag brace from the strut back up to the bay roof (folds with the leg)
    mesh(name + "_brace", beam((0, -length * 0.42, 0.0), (0, -0.05 * s, -length * 0.38), r * 0.35), "steel", L, ink * 0.6)
    F = pivot(name + "_foot", (hinge[0], hinge[1] - length, hinge[2]), L, role="foot")
    F.location = tb((0, -length, 0))
    mesh(name + "_pad", lathe([(0, 0), (pad, 0.02 * s), (pad, 0.12 * s), (pad * 0.55, 0.3 * s), (r * 0.7, 0.42 * s), (0, 0.42 * s)], 16), "dark", F, ink)
    mesh(name + "_padLight", xf(torus(pad * 0.82, 0.04 * s, 16, 4), (0, 0.14 * s, 0)), "hazard", F, 0)
    return L


def gear_bay(ship, name, x, y, z0, z1, w, ink=0.03, open_ang=1.75):
    """A dark bay on the belly from z0 (front) back to z1, w wide, with two doors hinged on its
    long edges that swing down and out."""
    hull = ship["_hull"]
    zc, ln = (z0 + z1) / 2, abs(z0 - z1)
    mesh(name + "_bay", xf(rbox(w / 2, 0.06, ln / 2, 0.1, 12, 4), (x, y + 0.03, zc)), "bay", hull, 0)
    for side in (-1, 1):
        D = pivot(f"{name}_door{'LR'[side > 0]}", (x + side * w / 2, y, zc), ship["root"], role="door", open=side * open_ang)
        # plate authored closed, reaching from the hinge to the bay centreline
        mesh(D.name + "_plate", xf(rbox(w / 4 - 0.02, 0.05, ln / 2 - 0.03, 0.12, 12, 4), (-side * w / 4, -0.04, 0)), "trim", D, ink)
        mesh(D.name + "_stripe", xf(rbox(0.05, 0.055, ln / 2 - 0.25, 0.3, 8, 4), (-side * (w / 2 - 0.25), -0.05, 0)), "hazard", D, 0)


def plume(ship, name, pos, radius, length, axis="z", ring_r=None):
    """A flame cone pivot at a nozzle: outer plume + hot core. axis z: points -z; y: points -y."""
    P = pivot(name, pos, ship, role="plume" if axis == "z" else "lift")
    prof = [(0, 0), (radius * 0.98, 0.0), (radius * 0.9, 0.18 * length), (radius * 0.62, 0.5 * length), (radius * 0.25, 0.85 * length), (0, length)]
    core = [(0, 0), (radius * 0.6, 0.0), (radius * 0.5, 0.2 * length), (radius * 0.25, 0.45 * length), (0, 0.62 * length)]
    rot = (-math.pi / 2, 0, 0) if axis == "z" else (math.pi, 0, 0)
    mesh(name + "_flame", xf(lathe(prof, 16), r=rot), "plume", P, 0, None)
    mesh(name + "_core", xf(lathe(core, 12), r=rot), "plumeCore", P, 0, None)
    return P


def ship_root(name, **props):
    root = pivot(name, (0, 0, 0), None, **props)
    hull = pivot(name + "_hull", (0, 0, 0), root, role="hull")
    return {"root": root, "_hull": hull, "name": name}


# =============================================================================================
# SHUTTLE-BUS: a fat, friendly lifting-body "hopper" ~19 m long. Wraparound windscreen, a row of
# porthole windows, two ducted lift-fans on pylons at the back, a canted V-tail, a lit route
# board on the roof, three folding legs and a rear door that drops down into a ramp.
# Origin = hull centre. Belly flat at y = -2.6. On the pad the hull centre sits GEAR_S above it.
# =============================================================================================
GEAR_S = 4.6
BELLY_S = -2.6
S = ship_root("shuttle")
SR, SH = S["root"], S["_hull"]

SHUTTLE_SECS = [
    {"z": -9.5, "w": 2.3, "t": 1.9, "b": 2.0, "eT": 3.0, "eB": 6.0, "yc": -0.4},
    {"z": -9.2, "w": 2.75, "t": 2.35, "b": 2.2, "eT": 3.0, "eB": 6.0, "yc": -0.4},
    {"z": -8.2, "w": 3.05, "t": 2.75, "b": 2.2, "eT": 3.2, "eB": 7.0, "yc": -0.4},
    {"z": -6.0, "w": 3.3, "t": 3.15, "b": 2.2, "eT": 3.4, "eB": 8.0, "yc": -0.4},
    {"z": 2.0, "w": 3.35, "t": 3.25, "b": 2.2, "eT": 3.4, "eB": 8.0, "yc": -0.4},
    {"z": 5.5, "w": 3.25, "t": 3.05, "b": 2.2, "eT": 3.0, "eB": 8.0, "yc": -0.4},
    {"z": 7.6, "w": 2.95, "t": 2.45, "b": 2.15, "eT": 2.6, "eB": 6.0, "yc": -0.4},
    {"z": 8.9, "w": 2.45, "t": 1.7, "b": 1.95, "eT": 2.3, "eB": 4.5, "yc": -0.45},
    {"z": 9.7, "w": 1.6, "t": 0.95, "b": 1.45, "eT": 2.1, "eB": 3.0, "yc": -0.5},
    {"z": 10.05, "w": 0.6, "t": 0.35, "b": 0.6, "eT": 2.0, "eB": 2.2, "yc": -0.55},
]
hull_geo = loft(SHUTTLE_SECS, 40)
mesh("s_hull", hull_geo, "body", SH, 0.13)
# wraparound windscreen: the front of the hull, grown a hair, between two heights
# (the screen sweeps back along the flanks a little, lower edge dipping toward the nose)
mesh("s_windscreen", band(SHUTTLE_SECS, 0.035, lambda c: c[2] > 5.4 and 0.1 - (c[2] - 5.4) * 0.12 < c[1] < 2.0 and (c[2] > 6.9 or abs(c[0]) > 2.2)), "glass", SH, 0)
mesh("s_windFrame", band(SHUTTLE_SECS, 0.05, lambda c: c[2] > 5.2 and (1.98 < c[1] < 2.22 or (c[2] < 5.6 and 0.0 < c[1] < 2.2 and abs(c[0]) > 2.0))), "dark", SH, 0)
# livery: a broad level belt and a pinstripe, stopping short of the flat tail cap (a belt that swept
# up toward the tail cut diagonally across the hull's faces and came out as ragged splotches)
mesh("s_belt", cband(SHUTTLE_SECS, 0.03, -1.35, -0.6, -9.2, 9.0), "stripe", SH, 0)
mesh("s_pin", cband(SHUTTLE_SECS, 0.032, -0.38, -0.22, -9.2, 8.6), "trim", SH, 0)
# porthole windows down both flanks
for i in range(7):
    z = -5.6 + i * 1.55
    sec = lerp_sec(SHUTTLE_SECS, z)
    for side in (-1, 1):
        x = surf_x(sec, 0.75) + 0.02
        mesh(f"s_win{i}{side}", xf(superquad(0.12, 0.55, 0.48, 0.5, 0.5, 12, 6), (side * x, 0.75, z), (0, 0, side * -0.12)), "window", SH, 0)
        mesh(f"s_winRim{i}{side}", xf(superquad(0.1, 0.68, 0.6, 0.5, 0.5, 12, 6), (side * (x - 0.04), 0.75, z), (0, 0, side * -0.12)), "trim", SH, 0.02)
# nose: headlights and a chin bumper
for side in (-1, 1):
    mesh(f"s_head{side}", xf(superquad(0.36, 0.2, 0.12, 0.4, 0.5, 12, 6), (side * 1.0, -1.05, 9.72), (0.15, side * 0.38, 0)), "window", SH, 0)
mesh("s_chin", xf(rbox(2.0, 0.22, 0.5, 0.25), (0, -1.75, 9.1)), "dark", SH, 0.04)
# roof: a lit route board on a stand, a sensor blister and a whip antenna
mesh("s_boardStand", xf(rbox(0.7, 0.35, 1.2, 0.3), (0, 3.0, 0.8)), "dark", SH, 0.04)
mesh("s_board", xf(rbox(1.6, 0.42, 0.14, 0.15), (0, 3.55, 0.8)), "dark", SH, 0.04)
mesh("s_boardLit", xf(rbox(1.45, 0.3, 0.17, 0.12), (0, 3.55, 0.8)), "sign", SH, 0)
mesh("s_blister", xf(superquad(0.55, 0.32, 0.55, 0.6, 0.6, 12, 6), (0, 2.82, 4.6)), "trim", SH, 0.03)
mesh("s_whip", beam((0.9, 2.7, -2.4), (1.05, 4.4, -2.9), 0.04, 5), "dark", SH, 0)
mesh("s_whipTip", xf(superquad(0.1, 0.1, 0.1, 1, 1, 8, 5), (1.05, 4.45, -2.9)), "red", SH, 0)
# V-tail: two canted, swept fins at the back (hull-coloured, thin, raked back), each capped in the
# livery colour with a light on the tip
fin = [(1.4, 0), (-0.3, 0), (-1.55, 2.35), (-1.0, 2.6), (0.25, 2.6)]          # (z, y): root to swept tip
cap = [(0.5, 2.05), (-1.39, 2.05), (-1.57, 2.36), (-1.01, 2.62), (0.26, 2.62)]  # the top of the fin, chord-wide
for side in (-1, 1):
    fg = xf(extrude(fin, 0.2, "x"), (side * 1.2, 2.15, -6.2), (0, 0, -side * 0.6))
    mesh(f"s_fin{side}", fg, "body", SH, 0.04)
    cg = xf(extrude(cap, 0.24, "x"), (side * 1.2, 2.15, -6.2), (0, 0, -side * 0.6))
    mesh(f"s_finCap{side}", cg, "stripe", SH, 0)
    tip = Vector((0, 2.62, -1.3))
    tip.rotate(Euler((0, 0, -side * 0.6)))
    mesh(f"s_finTip{side}", xf(superquad(0.13, 0.13, 0.13, 1, 1, 8, 5), (side * 1.2 + tip.x, 2.15 + tip.y, -6.2 + tip.z)), "green" if side > 0 else "red", SH, 0)
# ducted lift-fans on swept pylons
FAN_X, FAN_Y, FAN_Z, FAN_R = 5.55, 0.15, -5.0, 1.55
duct = [(FAN_R + 0.15, -1.5), (FAN_R + 0.55, -1.2), (FAN_R + 0.62, 0.3), (FAN_R + 0.35, 1.45), (FAN_R + 0.02, 1.55), (FAN_R - 0.05, 1.3), (FAN_R, -1.3), (FAN_R + 0.08, -1.5)]
for side in (-1, 1):
    X = side * FAN_X
    # shroud: the duct profile revolved round the fan axis (+z)
    mesh(f"s_duct{side}", xf(lathe(duct, 28), (X, FAN_Y, FAN_Z), (math.pi / 2, 0, 0)), "body", SH, 0.07)
    mesh(f"s_ductBand{side}", xf(torus(FAN_R + 0.6, 0.12, 28, 6), (X, FAN_Y, FAN_Z + 0.2), (math.pi / 2, 0, 0)), "stripe", SH, 0)
    mesh(f"s_spinner{side}", xf(lathe([(0, -1.0), (0.5, -0.6), (0.62, 0.2), (0.45, 0.9), (0, 1.25)], 14), (X, FAN_Y, FAN_Z), (math.pi / 2, 0, 0)), "trim", SH, 0.03)
    for k in range(6):
        a = k * math.pi / 3
        mesh(f"s_vane{side}{k}", xf(rbox(0.08, FAN_R * 0.5, 0.35, 0.3, 8, 4), (X + math.cos(a) * FAN_R * 0.55, FAN_Y + math.sin(a) * FAN_R * 0.55, FAN_Z - 0.6), (0, 0, a - math.pi / 2)), "dark", SH, 0)
    mesh(f"s_nozzle{side}", xf(lathe([(0, 0), (FAN_R - 0.02, 0), (FAN_R - 0.02, 0.05), (0, 0.05)], 24), (X, FAN_Y, FAN_Z - 1.35), (math.pi / 2, 0, 0)), "engine", SH, 0)
    mesh(f"s_nozzleCore{side}", xf(lathe([(0, 0), (0.8, 0), (0.8, 0.06), (0, 0.06)], 16), (X, FAN_Y, FAN_Z - 1.4), (math.pi / 2, 0, 0)), "core", SH, 0)
    # pylon: a fat swept wing root from the hull flank to the duct
    pyl = [(1.6, 0.25), (1.3, 0.55), (-1.4, 0.4), (-1.9, 0.05), (-1.5, -0.3), (1.2, -0.25)]
    verts, faces = extrude(pyl, 1.0, "x")
    x0 = surf_x(lerp_sec(SHUTTLE_SECS, FAN_Z), FAN_Y) - 0.3
    span = FAN_X - FAN_R - 0.3 - x0
    pv = [((v[0] + 0.5) * span + x0, v[1] + FAN_Y + (v[0] + 0.5) * -0.05, v[2] + FAN_Z + 0.2 - (v[0] + 0.5) * 0.4) for v in verts]
    mesh(f"s_pylon{side}", xf((pv, faces), s=(side, 1, 1)), "stripe", SH, 0.05)
    mesh(f"s_navLight{side}", xf(superquad(0.16, 0.16, 0.16, 1, 1, 8, 5), (X + side * (FAN_R + 0.65), FAN_Y, FAN_Z + 0.1)), "green" if side > 0 else "red", SH, 0)
    plume(S["root"], f"s_plume{'LR'[side > 0]}", (X, FAN_Y, FAN_Z - 1.45), FAN_R * 0.82, 6.5)
# belly: skid strakes, lift-jet grilles and their flames
for side in (-1, 1):
    mesh(f"s_strake{side}", xf(rbox(0.12, 0.16, 5.6, 0.3), (side * 2.85, BELLY_S + 0.05, 0.6)), "dark", SH, 0.03)
for i, (x, z) in enumerate([(-1.6, 1.4), (1.6, 1.4), (-1.6, -7.2), (1.6, -7.2)]):
    mesh(f"s_grille{i}", xf(rbox(0.55, 0.05, 0.55, 0.2, 10, 4), (x, BELLY_S - 0.03, z)), "dark", SH, 0.02)
    mesh(f"s_grilleLit{i}", xf(rbox(0.42, 0.05, 0.42, 0.2, 10, 4), (x, BELLY_S - 0.06, z)), "engine", SH, 0)
    plume(S["root"], f"s_lift{i}", (x, BELLY_S - 0.08, z), 0.45, 3.2, axis="y")
# landing gear: a nose leg and two mains, each folding back into a bay with clamshell doors
H = BELLY_S + 0.38
leg_len = (GEAR_S + BELLY_S) + 0.38  # hinge is 0.38 inside the belly; pad bottom touches the pad
for name, (x, z) in (("s_legN", (0, 6.0)), ("s_legL", (-2.0, -2.1)), ("s_legR", (2.0, -2.1))):
    landing_leg(SR, name, (x, H, z), leg_len, 1.57, r=0.2, pad=0.55, ink=0.035)
    gear_bay(S, name + "Bay", x, BELLY_S, z + 0.45, z - leg_len - 0.75, 1.3)
# rear door / ramp: hinged at the bottom of the tail, closed = standing up as the back wall
R_HINGE = (0, -2.35, -9.62)  # just behind the flat tail cap (z -9.5)
RAMP_L = 3.9
ramp_drop = GEAR_S - 2.35 - 0.2  # hinge height above the pad deck (a hair of clearance)
ramp_open = -math.asin(min(1.0, ramp_drop / RAMP_L))
R = pivot("s_ramp", R_HINGE, SR, role="ramp", closed=math.pi / 2, opened=ramp_open)
mesh("s_rampPlate", xf(rbox(1.25, 0.1, RAMP_L / 2, 0.15, 12, 4), (0, 0.0, -RAMP_L / 2)), "trim", R, 0.04)
for k in range(5):
    mesh(f"s_rampRib{k}", xf(rbox(1.0, 0.05, 0.06, 0.4, 6, 4), (0, 0.11, -0.5 - k * 0.7)), "dark", R, 0)
for side in (-1, 1):
    mesh(f"s_rampEdge{side}", xf(rbox(0.06, 0.06, RAMP_L / 2 - 0.1, 0.4, 6, 4), (side * 1.18, 0.12, -RAMP_L / 2)), "hazard", R, 0)
# (outer face of the door when closed = the plate's underside: give it the livery)
mesh("s_rampLivery", xf(rbox(1.1, 0.03, RAMP_L / 2 - 0.25, 0.2, 10, 4), (0, -0.1, -RAMP_L / 2 - 0.05)), "stripe", R, 0)
mesh("s_doorFrame", xf(rbox(1.42, 0.12, 0.12, 0.2), (0, -2.35 + RAMP_L + 0.06, -9.6)), "dark", SH, 0.03)
Hh = pivot("s_hatch", (0, -2.35 + RAMP_L / 2, -9.515), SR, role="hatch")
mesh("s_hatchLight", rbox(1.15, RAMP_L / 2 - 0.15, 0.03, 0.2, 10, 4), "cabin", Hh, 0)
for side in (-1, 1):
    mesh(f"s_tailLight{side}", xf(rbox(0.16, 0.5, 0.08, 0.3), (side * 1.72, -0.5, -9.53)), "red", SH, 0)

SR["gearH"] = GEAR_S
SR["deck"] = [2.9, 1.5, 8.2]   # half-extents of the walkable roof box
SR["deckY"] = 1.25             # its centre above the hull origin (top = 2.75)
SR["deckZ"] = -0.3
SR["inside"] = [0, -2.2, -7.4]
SR["rampTop"] = [0, -2.25, -9.65]
SR["rampBottom"] = [0, -2.35 - RAMP_L * math.sin(-ramp_open), R_HINGE[2] - RAMP_L * math.cos(ramp_open) - 0.5]
SR["radius"] = 9.0
SR["padR"] = 11.0


# =============================================================================================
# FREIGHTER ("Atlas"): a ~66 m armoured deep-haul hammerhead. A squared, plated hull with a raked bridge tower that runs down into
# the bow, a dorsal landing deck you can ride (kerb, tie-down rails, a big pad, approach lights), a gantry cage round each side's four
# cargo bays (portal frames, crane rail with a trolley, status lamps) holding the land-train's own cargo units (corrugated box,
# Helium-3 tanker, explosives magazine; cargo.py) painted for the faction it serves, short bolted radiator wings, a four-bell armoured
# stern block, four folding legs and a belly ramp. Origin = hull centre; deck top y = +5, belly y = -5.
# =============================================================================================
GEAR_F = 10.0
BELLY_F = -5.0
F = ship_root("freighter")
FR, FH = F["root"], F["_hull"]


def FM(name, geo, slot, parent=None, ink=0.06):
    return mesh("f_" + name, geo, slot, parent or FH, ink)


def FRB(name, h, pos, slot, parent=None, ink=0.05, e=0.12, rot=(0, 0, 0), nu=8, nv=4):
    """A rounded box (half extents h) placed at pos."""
    return FM(name, xf(rbox(h[0], h[1], h[2], e, nu, nv), pos, rot), slot, parent, ink)


# ---- the hull: squared and plated, a blunt chisel bow (closed properly at the tip) ----
FSECS = [
    {"z": -28.4, "w": 7.2, "t": 4.6, "b": 4.6, "eT": 9, "eB": 9},
    {"z": -27.2, "w": 8.0, "t": 5.0, "b": 5.0, "eT": 10, "eB": 12},
    {"z": 18.0, "w": 8.0, "t": 5.0, "b": 5.0, "eT": 10, "eB": 12},
    {"z": 23.0, "w": 7.7, "t": 4.7, "b": 5.0, "eT": 8, "eB": 11},
    {"z": 27.5, "w": 6.4, "t": 3.5, "b": 4.5, "eT": 6, "eB": 8},
    {"z": 31.0, "w": 4.2, "t": 1.9, "b": 3.5, "eT": 4, "eB": 5},
    {"z": 33.0, "w": 2.3, "t": 1.0, "b": 2.2, "eT": 3, "eB": 3.5},
    {"z": 33.8, "w": 1.0, "t": 0.6, "b": 1.0, "eT": 2.4, "eB": 2.4},
]
FM("hull", loft(FSECS, 48), "body", FH, 0.28)
# livery: a broad belt with a trim pinstripe above it and a hazard sill below, running right round the bow
FM("belt", cband(FSECS, 0.05, 0.4, 2.0, zlo=-26.5, zhi=31.0, step=0.5, n=170), "stripe", FH, 0)
FM("pin", cband(FSECS, 0.055, 2.3, 2.55, zlo=-26.5, zhi=30.6, step=0.5, n=170), "trim", FH, 0)
FM("sill", cband(FSECS, 0.05, -3.7, -3.35, zlo=-26.5, zhi=29.0, step=0.5, n=170), "hazard", FH, 0)
# frame ribs, down the whole hull and onto the bow (chunkier than the old straps)
for k, z in enumerate((-24, -18, -12, -6, 0, 6, 12, 18, 24, 28)):
    sec = lerp_sec(FSECS, z)
    FM(f"rib{k}", keep(loft(grow([{**sec, "z": z - 0.5}, {**sec, "z": z + 0.5}], 0.13), 48, False, False), lambda c: c[1] < 4.6), "trim", FH, 0.06)
# bolted armour panels along the flanks, in the hull's own colour with trim edges (no black plates)
for side in (-1, 1):
    for k, z in enumerate(range(-21, 18, 6)):
        sec = lerp_sec(FSECS, z)
        x = surf_x(sec, 3.1) + 0.05
        FM(f"plate{side}{k}", xf(rbox(0.07, 0.75, 1.9, 0.2, 6, 3), (side * x, 3.1, z)), "trim", FH, 0.03)
        for dz in (-1.5, 1.5):
            FM(f"bolt{side}{k}{dz}", xf(superquad(0.12, 0.12, 0.12, 1, 1, 6, 4), (side * (x + 0.08), 3.1, z + dz)), "steel", FH, 0)

# ---- the dorsal landing deck: a plated roof, a kerb with lights, a tie-down grid, a big pad with approach lights ----
FM("deck", xf(rbox(6.9, 0.14, 22.6, 0.08, 16, 4), (0, 5.0, -3.0)), "deck", FH, 0.06)
for side in (-1, 1):
    FM(f"kerb{side}", xf(rbox(0.22, 0.2, 22.5, 0.3, 8, 4), (side * 6.75, 5.12, -3.0)), "hazard", FH, 0)
    for k in range(10):
        z = -23.5 + k * 4.9
        FM(f"kerbLamp{side}{k}", xf(superquad(0.2, 0.2, 0.2, 1, 1, 8, 4), (side * 6.75, 5.45, z)), "window", FH, 0)
        FM(f"kerbPost{side}{k}", xf(lathe([(0, 0), (0.3, 0), (0.22, 0.25), (0.22, 0.3), (0, 0.3)], 8), (side * 6.75, 5.2, z)), "steel", FH, 0.02)
for xi in (-3.6, 3.6):          # tie-down rails with eyelets, flush with the roof
    FM(f"tieRail{xi}", xf(rbox(0.12, 0.05, 20.0, 0.3, 6, 3), (xi, 5.12, -3.0)), "dark", FH, 0)
    for k in range(9):
        FM(f"tie{xi}{k}", xf(torus(0.22, 0.05, 10, 4), (xi, 5.17, -20.0 + k * 4.5)), "steel", FH, 0)
PAD_Z = -7.0
FM("padDisc", xf(lathe([(0, 0), (5.2, 0), (5.2, 0.04), (0, 0.04)], 40), (0, 5.1, PAD_Z)), "dark", FH, 0)
FM("padRing", xf(torus(4.7, 0.2, 40, 4), (0, 5.17, PAD_Z)), "hazard", FH, 0)
FM("padRing2", xf(torus(3.0, 0.1, 32, 4), (0, 5.17, PAD_Z)), "hazard", FH, 0)
FM("padH", merge(xf(rbox(0.3, 0.05, 1.9, 0.3, 6, 4), (-1.15, 5.18, PAD_Z)), xf(rbox(0.3, 0.05, 1.9, 0.3, 6, 4), (1.15, 5.18, PAD_Z)), xf(rbox(1.15, 0.05, 0.28, 0.3, 6, 4), (0, 5.18, PAD_Z))), "hazard", FH, 0)
for k in range(8):               # lights set into the pad's rim
    a = k * math.pi / 4
    FM(f"padLamp{k}", xf(superquad(0.22, 0.1, 0.22, 1, 1, 8, 4), (math.sin(a) * 5.4, 5.14, PAD_Z + math.cos(a) * 5.4)), "cabin", FH, 0)
for k in range(5):               # approach lights toward the bow, and chevrons
    FM(f"approach{k}", xf(superquad(0.2, 0.08, 0.2, 1, 1, 8, 4), (0, 5.14, 1.0 + k * 2.4)), "cabin" if k % 2 else "window", FH, 0)
for k in range(3):
    FM(f"chevron{k}", xf(extrude([(0, 0), (1.5, -1.2), (1.5, -1.9), (0, -0.7), (-1.5, -1.9), (-1.5, -1.2)], 0.1, "y"), (0, 5.12, -19.0 - k * 1.7)), "hazard", FH, 0)

# ---- the bridge: a raked tower lofted from the deck down onto the bow (no step, no gap), a pilot house with a glass belt on top ----
BRIDGE = [
    {"z": 12.0, "w": 5.4, "t": 4.6, "b": 4.0, "eT": 8, "eB": 12, "yc": 5.0},
    {"z": 23.0, "w": 5.4, "t": 4.6, "b": 4.0, "eT": 8, "eB": 12, "yc": 5.0},
    {"z": 26.5, "w": 5.2, "t": 3.4, "b": 3.8, "eT": 6, "eB": 12, "yc": 4.9},
    {"z": 29.0, "w": 4.4, "t": 1.6, "b": 3.2, "eT": 4, "eB": 8, "yc": 4.0},
    {"z": 31.0, "w": 3.2, "t": 0.5, "b": 2.4, "eT": 3, "eB": 5, "yc": 2.0},
]
FM("bridgeLo", loft(BRIDGE, 40), "trim", FH, 0.2)
FM("bridgeBelt", cband(BRIDGE, 0.05, 6.1, 6.8, zlo=12.3, zhi=26.5, step=0.4, n=160), "stripe", FH, 0)
FRB("bridgeHi", (3.9, 1.7, 3.9), (0, 11.3, 20.0), "trim", ink=0.18, e=0.25)
FRB("bridgeGlass", (4.0, 0.62, 4.0), (0, 11.6, 20.1), "glass", ink=0, e=0.25)
for side in (-1, 1):
    FRB(f"bridgePost{side}", (0.2, 0.7, 0.3), (side * 3.5, 11.6, 24.2), "dark", ink=0.03, e=0.2)
    FRB(f"bridgeSide{side}", (0.06, 0.55, 3.0), (side * 3.96, 11.6, 19.2), "glass", ink=0, e=0.3)
FRB("bridgeRoof", (3.5, 0.28, 3.7), (0, 13.3, 19.7), "dark", ink=0.06, e=0.25)
for side in (-1, 1):             # searchlights on the roof's front corners
    FM(f"search{side}", xf(lathe([(0, 0), (0.55, 0), (0.7, 0.5), (0, 0.5)], 12), (side * 2.8, 13.5, 22.4), (-1.2, 0, 0)), "dark", FH, 0.03)
    FM(f"searchLens{side}", xf(superquad(0.5, 0.5, 0.12, 1, 1, 10, 5), (side * 2.8, 13.95, 22.95), (-0.55, 0, 0)), "window", FH, 0)
FM("mast", beam((1.9, 13.5, 17.0), (1.9, 19.2, 16.6), 0.14, 6), "dark", FH, 0.03)
FM("mastLight", xf(superquad(0.3, 0.3, 0.3, 1, 1, 10, 6), (1.9, 19.4, 16.6)), "white", FH, 0)
FM("dishPost", beam((-1.6, 13.5, 19.7), (-1.6, 15.0, 19.7), 0.25, 8), "dark", FH, 0.03)
FM("dish", xf(lathe([(0, 0.0), (1.4, 0.15), (2.2, 0.62), (2.25, 0.7), (0, 0.25)], 20), (-1.6, 15.2, 19.7), (0.5, 0, 0.25)), "white", FH, 0.05)
# the lit sign on the raked face, and windows and vents on the flanks and the back
FRB("sign", (2.4, 0.5, 0.08), (0, 7.0, 27.15), "dark", ink=0.04, e=0.2, rot=(-0.75, 0, 0))
FRB("signLit", (2.2, 0.36, 0.1), (0, 7.05, 27.2), "sign", ink=0, e=0.25, rot=(-0.75, 0, 0))
for side in (-1, 1):
    for k in range(4):
        FRB(f"bridgeWin{side}{k}", (0.06, 0.3, 0.7), (side * 5.44, 8.0, 14.5 + k * 2.6), "window", ink=0, e=0.3)
for k in range(5):
    FRB(f"bridgeVent{k}", (2.6, 0.08, 0.12), (0, 7.0 + k * 0.32, 11.9), "dark", ink=0, e=0.3)
for side in (-1, 1):
    FM(f"head{side}", xf(superquad(0.75, 0.32, 0.18, 0.4, 0.5, 12, 6), (side * 2.4, -1.7, 32.2), (0.1, side * 0.5, 0)), "window", FH, 0)
    FM(f"towLug{side}", xf(torus(0.5, 0.12, 12, 5), (side * 3.0, -3.3, 30.4), (0, 0, math.pi / 2)), "steel", FH, 0.03)

# ---- the cargo gantry: four bays down each flank in a portal-frame cage with a crane rail and status lamps ----
SLOT_Z = [-18.5, -9.5, -0.5, 8.5]
FRAME_Z = [-23.0, -14.0, -5.0, 4.0, 13.0]
RX = 12.9                    # the cage's outer posts and rails
UX = 10.3                    # a unit's centre (x)
UY = -4.05                   # the floor of a bay
CARGO = {                    # what each bay holds: a land-train unit (box / tank / blast) or None (empty, with the crane over it)
    (-1, 0): "tank", (-1, 1): "box", (-1, 2): None, (-1, 3): "blast",
    (1, 0): "box", (1, 1): "tank", (1, 2): "box", (1, 3): None,
}


def empty_slot(side, k, z):
    n = f"e{side}{k}"
    FRB(n + "floor", (2.1, 0.1, 3.95), (side * UX, UY - 0.1, z), "dark", ink=0.04, e=0.2)
    for sz in (-1, 1):           # guide posts at the unit's outer corners, with angled lead-ins
        FRB(f"{n}g{sz}", (0.16, 1.8, 0.16), (side * (UX + 2.1), UY + 1.7, z + sz * 3.9), "steel", ink=0.03, e=0.3)
        FM(f"{n}lead{sz}", xf(extrude([(0, 0), (0.6, 0.5), (0.6, 0.0)], 0.3, "x"), (side * (UX + 2.1) - 0.15, UY, z + sz * 3.9 - 0.1)), "hazard", FH, 0)
    FRB(n + "back", (0.05, 2.0, 3.7), (side * (UX - 2.2), UY + 2.0, z), "bay", ink=0, e=0.3)


for side in (-1, 1):
    FRB(f"railTop{side}", (0.4, 0.34, 19.2), (side * RX, 1.0, -5.0), "trim", ink=0.06, e=0.3)
    FRB(f"railTopH{side}", (0.42, 0.06, 19.2), (side * RX, 1.38, -5.0), "hazard", ink=0, e=0.4)
    FRB(f"railLow{side}", (0.34, 0.3, 19.2), (side * RX, -4.55, -5.0), "steel", ink=0.05, e=0.3)
    FRB(f"railIn{side}", (0.3, 0.28, 19.0), (side * 8.3, -4.3, -5.0), "steel", ink=0.05, e=0.3)
    FRB(f"craneRail{side}", (0.12, 0.1, 19.0), (side * RX, 1.55, -5.0), "dark", ink=0.02, e=0.4)
    for zi, z in enumerate(FRAME_Z):   # a portal frame between each pair of bays: an outer post and ties to the hull
        FRB(f"post{side}{zi}", (0.26, 2.75, 0.26), (side * RX, -1.75, z), "steel", ink=0.06, e=0.25)
        FM(f"tieT{side}{zi}", beam((side * 8.2, 0.9, z), (side * RX, 0.9, z), 0.2, 6), "steel", FH, 0.03)
        FM(f"tieB{side}{zi}", beam((side * 8.2, -4.3, z), (side * RX, -4.3, z), 0.2, 6), "steel", FH, 0.03)
        FM(f"knee{side}{zi}", beam((side * RX, -3.3, z), (side * (RX - 1.9), -4.3, z), 0.14, 5), "dark", FH, 0.02)
        FM(f"kneeT{side}{zi}", beam((side * RX, -0.2, z), (side * (RX - 1.9), 0.9, z), 0.14, 5), "dark", FH, 0.02)
    for k, z in enumerate(SLOT_Z):
        for dz in (-2.4, 2.4):         # clamp rams from the posts, pressing in on the unit's lower flank
            FM(f"ram{side}{k}{dz}", beam((side * (RX - 0.1), -3.3, z + dz), (side * (UX + 2.0), -3.3, z + dz), 0.16, 8), "metal", FH, 0.03)
            FM(f"ramPad{side}{k}{dz}", xf(rbox(0.12, 0.3, 0.3, 0.3, 4, 3), (side * (UX + 2.0), -3.3, z + dz)), "hazard", FH, 0.02)
        unit = CARGO[(side, k)]
        FM(f"lamp{side}{k}", xf(superquad(0.22, 0.22, 0.22, 1, 1, 8, 5), (side * RX, 1.85, z - 3.2)), "red" if unit is None else "green", FH, 0)
        FRB(f"slotNo{side}{k}", (0.07, 0.3, 0.7), (side * (RX + 0.4), 1.0, z), "dark", ink=0, e=0.3)
        FRB(f"slotNoLit{side}{k}", (0.08, 0.2, 0.5), (side * (RX + 0.44), 1.0, z), "sign", ink=0, e=0.3)
        if unit is None:
            empty_slot(side, k, z)
        else:
            cargo_unit(unit, f"f_cargo{'P' if side > 0 else 'S'}{k}", FH, (side * UX, UY, z), 1.1)
# a gantry crane trolley on the starboard rail, over the empty bay, with a boom and a spreader on its cables
TZ = SLOT_Z[3]
FRB("trolley", (1.1, 0.4, 1.6), (RX, 2.1, TZ), "hazard", ink=0.08, e=0.2)
FRB("trolleyCab", (0.7, 0.45, 0.8), (RX, 2.95, TZ + 0.5), "trim", ink=0.05, e=0.25)
FRB("trolleyBoom", (1.4, 0.14, 0.3), (RX - 1.5, 2.15, TZ), "steel", ink=0.05, e=0.3)
for dz in (-1.2, 1.2):
    FM(f"trolleyWheel{dz}", xf(lathe([(0, -0.15), (0.45, -0.15), (0.45, 0.15), (0, 0.15)], 12), (RX - 0.8, 1.75, TZ + dz), (0, 0, math.pi / 2)), "dark", FH, 0.02)
    FM(f"trolleyWheelB{dz}", xf(lathe([(0, -0.15), (0.45, -0.15), (0.45, 0.15), (0, 0.15)], 12), (RX + 0.8, 1.75, TZ + dz), (0, 0, math.pi / 2)), "dark", FH, 0.02)
    FM(f"cable{dz}", beam((UX, 2.0, TZ + dz), (UX, 0.2, TZ + dz * 1.9), 0.05, 5), "dark", FH, 0)
FRB("spreader", (2.0, 0.15, 2.8), (UX, 0.1, TZ), "steel", ink=0.05, e=0.3)

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
    FM(f"rad{side}", (out, [tuple(reversed(f)) for f in faces] if side < 0 else faces), "steel", FH, 0.12)
    for k in range(6):
        sp = 1.6 + k * 2.0
        lead = 3.0 * max(0.0, sp - 6.0) / 7.0 + 0.5
        trail = 9.0 if sp < 5.5 else 9.0 - (sp - 5.5) * (1.8 / 7.5)
        FM(f"radFin{side}{k}", beam(wing_pt(sp, 0.34, lead, side), wing_pt(sp, 0.34, trail, side), 0.14, 4), "stripe", FH, 0)
    FM(f"radEdge{side}", beam(wing_pt(6.0, 0.0, 0.0, side), wing_pt(13.0, 0.0, 3.0, side), 0.32, 6), "trim", FH, 0.04)
    FM(f"radRoot{side}", xf(rbox(1.5, 1.1, 5.0, 0.2), (side * 8.0, 3.7, -10.2), (0, 0, side * 0.15)), "steel", FH, 0.06)
    FM(f"navLight{side}", xf(superquad(0.5, 0.5, 0.5, 1, 1, 10, 6), wing_pt(13.2, 0.0, 5.0, side)), "green" if side > 0 else "red", FH, 0)

# ---- pipe runs and junction boxes down the upper shoulders (outside the walkable roof) ----
for side in (-1, 1):
    for yy, rr in ((4.0, 0.22), (3.4, 0.16)):
        x = surf_x(lerp_sec(FSECS, 0.0), yy) + 0.28
        FM(f"pipe{side}{yy}", beam((side * x, yy, -26.0), (side * x, yy, 12.0), rr, 8), "steel", FH, 0.04)
    for k in range(7):
        z = -24.0 + k * 5.6
        x = surf_x(lerp_sec(FSECS, z), 3.7) + 0.28
        FM(f"clip{side}{k}", xf(rbox(0.16, 0.6, 0.18, 0.3, 6, 3), (side * x, 3.7, z)), "dark", FH, 0.02)
    FRB(f"junc{side}", (0.5, 0.55, 0.9), (side * (surf_x(lerp_sec(FSECS, -3.0), 3.7) + 0.5), 3.7, -3.0), "hazard", ink=0.05, e=0.25)
    FRB(f"juncCap{side}", (0.52, 0.12, 0.92), (side * (surf_x(lerp_sec(FSECS, -3.0), 3.7) + 0.5), 4.3, -3.0), "dark", ink=0.03, e=0.3)

# ---- the stern: an armoured thrust block, a manifold, four bells ----
FM("thrustFrame", loft([
    {"z": -31.8, "w": 8.0, "t": 5.2, "b": 5.2, "eT": 7, "eB": 7},
    {"z": -31.0, "w": 8.8, "t": 5.8, "b": 5.8, "eT": 7, "eB": 7},
    {"z": -27.4, "w": 8.8, "t": 5.8, "b": 5.8, "eT": 7, "eB": 7},
    {"z": -26.2, "w": 7.6, "t": 4.8, "b": 4.8, "eT": 7, "eB": 7},
], 32), "steel", FH, 0.22)
FM("frameBand", keep(loft(grow([{"z": -30.6, "w": 8.8, "t": 5.8, "b": 5.8, "eT": 7, "eB": 7}, {"z": -29.2, "w": 8.8, "t": 5.8, "b": 5.8, "eT": 7, "eB": 7}], 0.07), 32, False, False), lambda c: True), "hazard", FH, 0)
for k in range(5):               # cooling ribs on the block
    FM(f"blockRib{k}", xf(rbox(8.95, 5.9, 0.16, 0.12, 12, 4), (0, 0, -27.8 - k * 0.5)), "dark", FH, 0.02)
FM("heatShield", xf(rbox(8.0, 5.2, 0.28, 0.12, 16, 6), (0, 0, -32.0)), "dark", FH, 0.06)
THROAT_Z, BELL_L = -33.4, 5.0
bell = [(1.2, 0.0), (1.25, 0.5), (1.5, 1.8), (1.85, 3.2), (2.2, 4.4), (2.35, 4.85), (2.35, BELL_L)]
for i, (x, y) in enumerate([(-4.2, 2.6), (4.2, 2.6), (-4.2, -2.6), (4.2, -2.6)]):
    FM(f"pump{i}", xf(lathe([(r, -h) for r, h in [(0, 0), (1.8, 0), (1.85, 0.3), (1.7, 1.0), (1.4, 1.25), (1.25, 1.5), (0, 1.5)]], 20), (x, y, -32.1), (math.pi / 2, 0, 0)), "steel", FH, 0.06)
    FM(f"gimbal{i}", xf(torus(1.4, 0.24, 20, 6), (x, y, THROAT_Z + 0.15), (math.pi / 2, 0, 0)), "stripe", FH, 0.02)
    for k in range(3):           # hydraulic actuators
        a = k * 2 * math.pi / 3 + 0.5
        FM(f"act{i}{k}", beam((x + math.cos(a) * 1.7, y + math.sin(a) * 1.7, -32.2), (x + math.cos(a) * 1.95, y + math.sin(a) * 1.95, THROAT_Z - 1.6), 0.13, 6), "metal", FH, 0.02)
    FM(f"bell{i}", xf(lathe([(r, -h) for r, h in bell], 24), (x, y, THROAT_Z), (math.pi / 2, 0, 0)), "dark", FH, 0.1)
    FM(f"bellRing{i}", xf(torus(2.35, 0.15, 24, 6), (x, y, THROAT_Z - BELL_L), (math.pi / 2, 0, 0)), "stripe", FH, 0)
    FM(f"bellGlow{i}", xf(lathe([(0, 0), (1.3, 0), (1.3, 0.06), (0, 0.06)], 20), (x, y, THROAT_Z - 0.4), (math.pi / 2, 0, 0)), "engine", FH, 0)
    FM(f"bellCore{i}", xf(lathe([(0, 0), (0.7, 0), (0.7, 0.08), (0, 0.08)], 16), (x, y, THROAT_Z - 0.5), (math.pi / 2, 0, 0)), "core", FH, 0)
    plume(FR, f"f_plume{i}", (x, y, THROAT_Z - BELL_L - 0.05), 2.0, 13.0)
for side in (-1, 1):             # the exhaust manifold: pipes from the block's shoulders to the outer bells
    FM(f"manifold{side}", beam((side * 8.6, 0.0, -29.0), (side * 8.6, 2.6, -31.0), 0.4, 8), "steel", FH, 0.04)
FM("tailLight", xf(superquad(0.35, 0.35, 0.35, 1, 1, 10, 6), (0, 6.2, -30.2)), "white", FH, 0)

# ---- belly: lift-jet grilles, skid keels, four hydraulic legs, the ramp ----
for i, (x, z) in enumerate([(-3.6, 9.0), (3.6, 9.0), (-3.6, -21.5), (3.6, -21.5)]):
    FM(f"grille{i}", xf(rbox(1.3, 0.08, 1.3, 0.2, 10, 4), (x, BELLY_F - 0.04, z)), "dark", FH, 0.03)
    FM(f"grilleLit{i}", xf(rbox(1.05, 0.08, 1.05, 0.2, 10, 4), (x, BELLY_F - 0.08, z)), "engine", FH, 0)
    plume(FR, f"f_lift{i}", (x, BELLY_F - 0.12, z), 1.0, 6.5, axis="y")
for side in (-1, 1):
    FM(f"keel{side}", xf(rbox(0.28, 0.32, 14.0, 0.3), (side * 6.8, BELLY_F + 0.1, 3.0)), "dark", FH, 0.05)
HF = BELLY_F + 0.7
leg_f = (GEAR_F + BELLY_F) + 0.7
for name, (x, z) in (("f_legFL", (-5.0, 17.0)), ("f_legFR", (5.0, 17.0)), ("f_legRL", (-5.0, -13.0)), ("f_legRR", (5.0, -13.0))):
    landing_leg(FR, name, (x, HF, z), leg_f, 1.57, r=0.55, pad=1.7, ink=0.08, scale=2.2)
    gear_bay(F, name + "Bay", x, BELLY_F, z + 0.9, z - leg_f - 1.6, 2.8, ink=0.05)
# belly ramp: hinged at its front edge, closed flush with the belly
F_RAMP_H = (0, BELLY_F - 0.05, -4.0)
F_RAMP_L = 11.0
f_drop = GEAR_F + BELLY_F - 0.15
f_open = -math.asin(min(1.0, f_drop / F_RAMP_L))
FRamp = pivot("f_ramp", F_RAMP_H, FR, role="ramp", closed=0.0, opened=f_open)
FM("rampPlate", xf(rbox(2.3, 0.16, F_RAMP_L / 2, 0.1, 12, 4), (0, 0, -F_RAMP_L / 2)), "trim", FRamp, 0.07)
for k in range(9):
    FM(f"rampRib{k}", xf(rbox(2.0, 0.06, 0.1, 0.4, 6, 4), (0, 0.17, -0.8 - k * 1.2)), "dark", FRamp, 0)
for side in (-1, 1):
    FM(f"rampEdge{side}", xf(rbox(0.12, 0.08, F_RAMP_L / 2 - 0.15, 0.4, 6, 4), (side * 2.15, 0.18, -F_RAMP_L / 2)), "hazard", FRamp, 0)
FM("rampBay", xf(rbox(2.45, 0.06, F_RAMP_L / 2 + 0.1, 0.1, 12, 4), (0, BELLY_F + 0.04, -4.0 - F_RAMP_L / 2)), "bay", FH, 0)
FHatch = pivot("f_hatch", (0, BELLY_F + 0.08, -4.0 - F_RAMP_L / 2), FR, role="hatch")
FM("hatchLight", rbox(2.2, 0.03, F_RAMP_L / 2 - 0.2, 0.2, 10, 4), "cabin", FHatch, 0)

FR["gearH"] = GEAR_F
FR["deck"] = [6.9, 2.6, 22.6]
FR["deckY"] = 2.5   # top = 5.1
FR["deckZ"] = -3.0
FR["inside"] = [0, -4.6, -1.5]
FR["rampTop"] = [0, -5.0, -4.4]
FR["rampBottom"] = [0, BELLY_F - 0.05 - F_RAMP_L * math.sin(-f_open), -4.0 - F_RAMP_L * math.cos(f_open) - 0.6]
FR["radius"] = 26.0
FR["padR"] = 21.0

# side by side for previewing
FR.location = tb((40, 0, 0))

print("built", len(C.objects), "objects")


def export():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    keep_loc = FR.location.copy()
    FR.location = (0, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    for o in C.objects:
        o.select_set(True)
    kw = dict(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
              export_extras=True, export_normals=True, export_texcoords=False, export_materials="EXPORT",
              export_animations=False, export_cameras=False, export_lights=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in props})
    FR.location = keep_loc
    print("exported", OUT, os.path.getsize(OUT), "bytes")


if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export()

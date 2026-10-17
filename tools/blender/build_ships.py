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
#     board   a route board (the shuttle's destination sign): the pivot sits at the middle of the display
#             face, +z out of the face; "w" / "h" = the face in metres, "faces" = 1 (front) or 2 (back too).
#             Its meshes are the housing; the game draws the lit text on the face.
# - Each mesh has ONE material whose name is a slot (body, stripe, trim, dark, ...). The game
#   swaps in its own toon / glow materials per slot, which is how liveries recolour.
# - Custom property "ink" = outline thickness in metres (0 = none).
#
# Everything below is authored in three.js axes (x right, y up, +z forward/nose) and converted
# to Blender's (x, -z, y) on the way in, which the glTF exporter's +Y-up option converts back.

import bpy, bmesh, math, os
from mathutils import Vector, Euler, Matrix


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
OUT = os.environ.get("SHIPS_OUT") or os.path.join(REPO, "src", "assets", "ships.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
# The shuttle's nose and route board come in three builds: "current" (what shipped), and the
# two proposals "A" and "B" (see docs/shuttle-proposals.md). SHUTTLE_VARIANT picks one.
VARIANT = os.environ.get("SHUTTLE_VARIANT", "current")
if VARIANT not in ("current", "A", "B"):
    raise RuntimeError(f"SHUTTLE_VARIANT must be current, A or B (got {VARIANT!r})")
print("Ships export ->", OUT, "| shuttle variant:", VARIANT)
COLL = "MoonShips"

# preview colours only: the game replaces every slot with its own material
SLOT_COLORS = {
    "body": (0.95, 0.93, 0.86), "stripe": (0.18, 0.77, 1.0), "trim": (0.85, 0.83, 0.91),
    "dark": (0.13, 0.11, 0.2), "metal": (0.54, 0.53, 0.63), "steel": (0.33, 0.38, 0.48),
    "bay": (0.06, 0.05, 0.1), "deck": (0.36, 0.35, 0.44), "hazard": (1.0, 0.82, 0.25),
    "glass": (0.6, 0.9, 1.0), "glassDeep": (0.38, 0.74, 0.94), "glassHi": (0.93, 0.99, 1.0), "window": (1.0, 0.96, 0.66), "cabin": (1.0, 0.95, 0.69),
    "engine": (1.0, 0.62, 0.11), "core": (1.0, 0.95, 0.75), "red": (1.0, 0.16, 0.29),
    "green": (0.49, 1.0, 0.42), "white": (1.0, 1.0, 1.0), "sign": (1.0, 0.82, 0.25),
    "plume": (1.0, 0.55, 0.15), "plumeCore": (1.0, 0.95, 0.8), "lift": (0.55, 0.85, 1.0),
    "cargo0": (1.0, 0.82, 0.25), "cargo1": (0.18, 0.77, 1.0), "cargo2": (1.0, 0.23, 0.36), "cargo3": (0.49, 1.0, 0.42),
}

exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())


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


def clipf(geo, *fields):
    """Every face cut exactly where each field f(v) crosses zero (kept where f >= 0): edges are split at
    the crossing, so on a dense mesh the cut follows f's curve with no sawtooth (keep() drops or keeps
    whole faces). Several fields cut one after another, so corners stay sharp; -f is the complement."""
    verts, faces = geo
    polys = [[tuple(verts[i]) for i in f] for f in faces]
    for fn in fields:
        out = []
        for poly in polys:
            vals = [fn(p) for p in poly]
            res = []
            for i, a in enumerate(poly):
                j = (i + 1) % len(poly)
                b, fa, fb = poly[j], vals[i], vals[j]
                if fa >= 0:
                    res.append(a)
                if (fa >= 0) != (fb >= 0):
                    t = fa / (fa - fb)
                    res.append(tuple(a[k] + (b[k] - a[k]) * t for k in range(3)))
            if len(res) >= 3:
                out.append(res)
        polys = out
    out_v, out_f = [], []
    for poly in polys:
        o = len(out_v)
        out_v += poly
        out_f.append(tuple(range(o, o + len(poly))))
    return out_v, out_f


def pl(pts):
    """A piecewise-linear function through (x, y) points, flat beyond the ends."""
    def f(x):
        if x <= pts[0][0]:
            return pts[0][1]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if x <= x1:
                return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
        return pts[-1][1]
    return f


def smin(vals, k):
    """Smooth minimum: the intersection of several fields with its corners rounded by about k."""
    m = min(vals)
    return m if k <= 0 else m - k * math.log(sum(math.exp(-(v - m) / k) for v in vals))


def pchip(xs, ys):
    """A monotone cubic through the points (no overshoot between them): returns f(x)."""
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    for i in range(1, n - 1):
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def end(h0, h1, d0, d1):
        v = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1)
        if v * d0 <= 0:
            return 0.0
        if d0 * d1 <= 0 and abs(v) > 3 * abs(d0):
            return 3 * d0
        return v
    m[0] = end(h[0], h[1], d[0], d[1])
    m[-1] = end(h[-1], h[-2], d[-1], d[-2])

    def f(x):
        i = max(0, min(n - 2, next((k for k in range(n - 1) if x <= xs[k + 1]), n - 2)))
        t = (x - xs[i]) / h[i]
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
                + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1])
    return f


def smooth_sections(sections, z_from, step=0.3):
    """The hull from z_from forward, re-cut every `step` metres along monotone curves through its
    sections: the same shape, with the facets of a few long panels rounded off."""
    tail = [s for s in sections if s["z"] >= z_from]
    zs = [s["z"] for s in tail]
    curves = {k: pchip(zs, [s.get(k, 2.5 if k[0] == "e" else 0.0) for s in tail]) for k in ("w", "t", "b", "eT", "eB", "yc")}
    n = int(round((zs[-1] - zs[0]) / step))
    pts = [zs[0] + (zs[-1] - zs[0]) * i / n for i in range(n + 1)]
    return [s for s in sections if s["z"] < z_from] + [{"z": z, **{k: c(z) for k, c in curves.items()}} for z in pts]


def hull_field(sections, x, y, z):
    """< 1 inside the lofted hull, 1 on its skin, > 1 outside."""
    s = lerp_sec(sections, z)
    top = y >= s["yc"]
    e = s["eT"] if top else s["eB"]
    h = s["t"] if top else s["b"]
    return (abs(x) / s["w"]) ** e + (abs(y - s["yc"]) / h) ** e


def hull_pt(sections, x, y, z0=5.0, z1=10.3):
    """Where the nose skin is at (x, y), and the outward normal there: (point, normal)."""
    lo, hi = z0, z1
    for _ in range(40):
        mid = (lo + hi) / 2
        if hull_field(sections, x, y, mid) <= 1.0:
            lo = mid
        else:
            hi = mid
    e = 1e-3
    g = Vector((hull_field(sections, x + e, y, lo) - hull_field(sections, x - e, y, lo),
                hull_field(sections, x, y + e, lo) - hull_field(sections, x, y - e, lo),
                hull_field(sections, x, y, lo + e) - hull_field(sections, x, y, lo - e)))
    return Vector((x, y, lo)), g.normalized()


def stick(geo, sections, x, y, lift=0.0):
    """geo (authored facing +z, origin at its back) set onto the nose skin at (x, y): +z along the skin's
    normal, x kept level, lifted `lift` off it."""
    p, n = hull_pt(sections, x, y)
    right = Vector((0, 1, 0)).cross(n).normalized()
    up = n.cross(right)
    e = Matrix((right, up, n)).transposed().to_euler("XYZ")
    return xf(geo, tuple(p + n * lift), (e.x, e.y, e.z))


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
# The shuttle's reworked nose (proposals A and B): the windscreen, the nose lamps and the route board.
# =============================================================================================

def route_board(name, pos, w, h, tilt, faces=1, depth=0.0):
    """The route board's pivot: at the middle of the display face, +z out of it (the game draws the lit
    destination there), leaning its face down by `tilt` rad. Meshes added to it are the housing."""
    P = pivot(name, pos, SR, role="board", w=w, h=h, faces=faces, depth=depth)
    P.rotation_euler = (tilt, 0.0, 0.0)  # (x turns the same way in both axes; +x tips the face down)
    return P


def build_nose(v):
    A = v == "A"
    # ---- the glass: a patch of the hull's skin, cut by smooth fields (clipf), so every edge is a clean curve
    # (two heights that follow the roof and the chin, and a rear edge, with the corners rounded by k)
    if A:
        head = lambda x: 1.75 - 0.07 * x * x
        yl = pl([(5.4, 0.3), (7.0, 0.05), (8.6, -0.55), (9.6, -0.95), (10.3, -1.0)])
        zr, k = 5.7, 0.2
    else:
        head = lambda x: 2.0 - 0.1 * x * x
        yl = pl([(5.2, 0.45), (7.0, 0.2), (8.6, -0.5), (9.6, -0.9), (10.3, -1.0)])
        zr, k = 5.5, 0.55
    region = lambda g=0.0: (lambda p: smin([head(p[0]) - p[1] + g, p[1] - yl(p[2]) + g, p[2] - zr + g], k))
    base = [lerp_sec(HS, 4.6)] + [s for s in HS if s["z"] > 4.6]
    def skin(d, n=130, step=0.11):
        dense = densify(base, step)
        return loft([{**t, "z": t["z"] + (d if i == len(dense) - 1 else 0.0)} for i, t in enumerate(grow(dense, d))], n, False, True)
    GD = 0.035
    glass = clipf(skin(GD), region())
    # reflections: diagonal streaks across the front, then a horizon splitting the rest into two tints
    if A:
        bands = [(0.35, 0.62), (0.78, 0.9)]
        hor = 0.0
    else:
        bands = [(0.15, 0.75), (0.95, 1.1)]
        hor = 0.15
    vv = lambda p: p[1] - 0.8 * p[0]
    streak = lambda p: max(min(vv(p) - a, b - vv(p)) for a, b in bands)
    hi = clipf(glass, lambda p: min(streak(p), 2.35 - abs(p[0]), 0.0 - 1e-9 + 1.0))
    rest = clipf(glass, lambda p: -min(streak(p), 2.35 - abs(p[0])))
    mesh("s_windHi", hi, "glassHi", SH, 0)
    mesh("s_windDeep", clipf(rest, lambda p: hor - p[1]), "glassDeep", SH, 0)
    mesh("s_windscreen", clipf(rest, lambda p: p[1] - hor), "glass", SH, 0)
    if A:
        # a thin dark gasket round the glass, and two body-coloured pillars splitting it into three panes
        mesh("s_windFrame", clipf(skin(0.045), region(0.1), lambda p: -region()(p)), "dark", SH, 0)
        for side in (-1, 1):
            lo, hi_ = (1.15, 1.45) if side > 0 else (-1.45, -1.15)
            mesh(f"s_windPillar{side}", clipf(clip(skin(0.07), 0, lo, hi_), region(0.03)), "body", SH, 0.025)
    else:
        # a fat trim bezel round the whole screen, with a slim dark gasket inside it
        mesh("s_windBezel", clipf(skin(0.08), region(0.2), lambda p: -region(0.0)(p)), "trim", SH, 0.035)
        mesh("s_windFrame", clipf(skin(0.05), region(0.03), lambda p: -region(0.0)(p)), "dark", SH, 0)

    # ---- the chin: a skid plate along the bottom of the nose, cut to follow the hull (no lumps)
    belly = lambda z: lerp_sec(HS, z)["yc"] - lerp_sec(HS, z)["b"]
    mesh("s_chin", clipf(skin(0.05, 64, 0.25), lambda p: p[2] - 7.6, lambda p: 9.3 - p[2], lambda p: belly(p[2]) + 0.3 - p[1]), "dark" if A else "trim", SH, 0.04)

    # ---- nose lamps, set on the skin (so they face out of it, not buried in it)
    if A:
        for side in (-1, 1):
            rim = xf(rbox(0.62, 0.2, 0.08, 0.35, 14, 6), (0, 0, 0.0))
            lit = xf(rbox(0.5, 0.11, 0.08, 0.4, 14, 6), (0, 0, 0.05))
            mesh(f"s_headRim{side}", stick(rim, HS, side * 1.2, -1.2, 0.0), "trim", SH, 0.02)
            mesh(f"s_head{side}", stick(lit, HS, side * 1.2, -1.2, 0.03), "window", SH, 0)
    else:
        for side in (-1, 1):
            disc = lambda r, hz: xf(lathe([(0, 0), (r, 0), (r, hz), (0, hz)], 20), r=(math.pi / 2, 0, 0))
            mesh(f"s_headRim{side}", stick(disc(0.46, 0.1), HS, side * 1.05, -1.1, -0.02), "trim", SH, 0.025)
            mesh(f"s_head{side}", stick(disc(0.34, 0.1), HS, side * 1.05, -1.1, 0.05), "window", SH, 0)

    # ---- the route board (destination display) and the roof gear
    if A:
        # a header board just over the screen, its face leaning forward-down like the nose, on a body-coloured
        # plinth that runs back into the roof
        P = route_board("s_board", (0, 3.3, 6.1), 3.4, 0.85, 0.16)
        mesh("s_boardBody", xf(rbox(2.1, 0.6, 0.5, 0.2), (0, 0.0, -0.56)), "body", P, 0.05)
        mesh("s_boardPlinth", xf(rbox(1.5, 0.5, 1.0, 0.3), (0, -0.62, -1.2), (-0.12, 0, 0)), "body", P, 0.04)
        mesh("s_boardBezel", xf(rbox(1.85, 0.49, 0.05, 0.2), (0, 0, -0.06)), "dark", P, 0)
        mesh("s_boardCap", xf(rbox(2.14, 0.07, 0.46, 0.35), (0, 0.61, -0.54)), "stripe", P, 0)
        mesh("s_blister", xf(superquad(0.55, 0.32, 0.55, 0.6, 0.6, 12, 6), (0, 2.82, 3.2)), "trim", SH, 0.03)
    else:
        # a double-faced lightbox on a swept roof fin, standing on the sensor puck (where the old blister sat)
        mesh("s_puck", xf(superquad(0.95, 0.2, 0.95, 0.5, 0.5, 16, 6), (0, 2.8, 4.7)), "trim", SH, 0.03)
        P = route_board("s_board", (0, 4.3, 4.95), 3.4, 0.85, 0.1, faces=2, depth=0.41)
        mesh("s_boardBody", xf(rbox(1.9, 0.54, 0.2, 0.2), (0, 0, -0.21)), "dark", P, 0.05)
        mesh("s_boardCap", xf(rbox(1.96, 0.07, 0.25, 0.35), (0, 0.56, -0.21)), "stripe", P, 0.03)
        mesh("s_boardBase", xf(rbox(1.96, 0.07, 0.25, 0.35), (0, -0.56, -0.21)), "stripe", P, 0.03)
        mesh("s_boardFin", xf(extrude([(0.0, -0.5), (-0.45, -0.5), (-2.0, -1.8), (0.3, -1.8)], 0.34, "x"), (0, 0, 0)), "body", P, 0.04)
        for side in (-1, 1):
            mesh(f"s_boardPip{side}", xf(superquad(0.1, 0.1, 0.1, 1, 1, 8, 5), (side * 2.04, 0.56, -0.21)), "green" if side > 0 else "red", P, 0)



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
# (the reworked builds round the nose off: the same sections, re-cut every 0.4 m along smooth curves)
HS = SHUTTLE_SECS if VARIANT == "current" else smooth_sections(SHUTTLE_SECS, 2.0, 0.4)
hull_geo = loft(HS, 40 if VARIANT == "current" else 56)
mesh("s_hull", hull_geo, "body", SH, 0.13)
if VARIANT == "current":
    # wraparound windscreen: the front of the hull, grown a hair, between two heights
    # (the screen sweeps back along the flanks a little, lower edge dipping toward the nose)
    mesh("s_windscreen", band(SHUTTLE_SECS, 0.035, lambda c: c[2] > 5.4 and 0.1 - (c[2] - 5.4) * 0.12 < c[1] < 2.0 and (c[2] > 6.9 or abs(c[0]) > 2.2)), "glass", SH, 0)
    mesh("s_windFrame", band(SHUTTLE_SECS, 0.05, lambda c: c[2] > 5.2 and (1.98 < c[1] < 2.22 or (c[2] < 5.6 and 0.0 < c[1] < 2.2 and abs(c[0]) > 2.0))), "dark", SH, 0)
# livery: a broad level belt and a pinstripe, stopping short of the flat tail cap (a belt that swept
# up toward the tail cut diagonally across the hull's faces and came out as ragged splotches)
mesh("s_belt", cband(HS, 0.03, -1.35, -0.6, -9.2, 9.0), "stripe", SH, 0)
mesh("s_pin", cband(HS, 0.032, -0.38, -0.22, -9.2, 8.6), "trim", SH, 0)
# porthole windows down both flanks
for i in range(7):
    z = -5.6 + i * 1.55
    sec = lerp_sec(HS, z)
    for side in (-1, 1):
        x = surf_x(sec, 0.75) + 0.02
        mesh(f"s_win{i}{side}", xf(superquad(0.12, 0.55, 0.48, 0.5, 0.5, 12, 6), (side * x, 0.75, z), (0, 0, side * -0.12)), "window", SH, 0)
        mesh(f"s_winRim{i}{side}", xf(superquad(0.1, 0.68, 0.6, 0.5, 0.5, 12, 6), (side * (x - 0.04), 0.75, z), (0, 0, side * -0.12)), "trim", SH, 0.02)
if VARIANT == "current":
    mesh("s_chin", xf(rbox(2.0, 0.22, 0.5, 0.25), (0, -1.75, 9.1)), "dark", SH, 0.04)
    # nose: headlights
    for side in (-1, 1):
        mesh(f"s_head{side}", xf(superquad(0.36, 0.2, 0.12, 0.4, 0.5, 12, 6), (side * 1.0, -1.05, 9.72), (0.15, side * 0.38, 0)), "window", SH, 0)
    # roof: a lit route board on a stand, a sensor blister and a whip antenna
    mesh("s_boardStand", xf(rbox(0.7, 0.35, 1.2, 0.3), (0, 3.0, 0.8)), "dark", SH, 0.04)
    mesh("s_board", xf(rbox(1.6, 0.42, 0.14, 0.15), (0, 3.55, 0.8)), "dark", SH, 0.04)
    mesh("s_boardLit", xf(rbox(1.45, 0.3, 0.17, 0.12), (0, 3.55, 0.8)), "sign", SH, 0)
    mesh("s_blister", xf(superquad(0.55, 0.32, 0.55, 0.6, 0.6, 12, 6), (0, 2.82, 4.6)), "trim", SH, 0.03)
else:
    build_nose(VARIANT)
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
# FREIGHTER: a ~66 m deep-haul "hammerhead": a long flat-topped cargo spine you can ride, a tall
# bridge tower at the bow with a wraparound glass band, container racks clamped down both
# flanks, V-swept radiator wings, a four-bell engine cluster at the stern, four folding legs
# and a belly ramp. Origin = hull centre; deck top y = +5, belly y = -5.
# =============================================================================================
GEAR_F = 10.0
BELLY_F = -5.0
F = ship_root("freighter")
FR, FH = F["root"], F["_hull"]

FREIGHT_SECS = [
    {"z": -27.0, "w": 6.8, "t": 4.4, "b": 4.4, "eT": 5, "eB": 5},
    {"z": -25.5, "w": 7.5, "t": 5.0, "b": 5.0, "eT": 6, "eB": 10},
    {"z": 21.0, "w": 7.5, "t": 5.0, "b": 5.0, "eT": 6, "eB": 10},
    {"z": 26.0, "w": 7.0, "t": 4.6, "b": 5.0, "eT": 5, "eB": 8},
    {"z": 29.5, "w": 5.8, "t": 3.2, "b": 4.4, "eT": 3.5, "eB": 5},
    {"z": 32.0, "w": 3.8, "t": 1.6, "b": 3.2, "eT": 2.6, "eB": 3.5},
    {"z": 33.4, "w": 1.6, "t": 0.4, "b": 1.8, "eT": 2.2, "eB": 2.5},
    {"z": 33.8, "w": 0.4, "t": -0.4, "b": 0.6, "eT": 2.0, "eB": 2.0},
]
mesh("f_hull", loft(FREIGHT_SECS, 44), "body", FH, 0.28)
# deck plating (a slightly raised flat top) with hazard edges and a landing circle
mesh("f_deck", xf(rbox(6.6, 0.12, 22.5, 0.08, 16, 4), (0, 5.0, -3.2)), "deck", FH, 0.06)
for side in (-1, 1):
    mesh(f"f_deckEdge{side}", xf(rbox(0.18, 0.15, 22.4, 0.3, 8, 4), (side * 6.5, 5.1, -3.2)), "hazard", FH, 0)
    for k in range(9):
        mesh(f"f_bollard{side}{k}", xf(lathe([(0, 0), (0.22, 0), (0.18, 0.5), (0.28, 0.55), (0.28, 0.7), (0, 0.7)], 10), (side * 6.9, 5.0, -24 + k * 5.4)), "steel", FH, 0.02)
mesh("f_padRing", xf(torus(4.2, 0.18, 32, 4), (0, 5.14, -8)), "hazard", FH, 0)
mesh("f_padH", merge(xf(rbox(0.25, 0.05, 1.6, 0.3, 6, 4), (-1.0, 5.14, -8)), xf(rbox(0.25, 0.05, 1.6, 0.3, 6, 4), (1.0, 5.14, -8)), xf(rbox(1.0, 0.05, 0.22, 0.3, 6, 4), (0, 5.14, -8))), "hazard", FH, 0)
for k in range(3):
    mesh(f"f_chevron{k}", xf(extrude([(0, 0), (1.4, -1.2), (1.4, -1.9), (0, -0.7), (-1.4, -1.9), (-1.4, -1.2)], 0.1, "y"), (0, 5.15, -19.5 - k * 1.6)), "hazard", FH, 0)
# livery belt down the flanks, and rib bands
mesh("f_belt", cband(FREIGHT_SECS, 0.05, 0.6, 2.4, zhi=27, step=0.5, n=160), "stripe", FH, 0)
for k, z in enumerate(range(-22, 21, 6)):
    sec = lerp_sec(FREIGHT_SECS, z)
    mesh(f"f_rib{k}", keep(loft(grow([{**sec, "z": z - 0.35}, {**sec, "z": z + 0.35}], 0.09), 44, False, False), lambda c: c[1] < 4.6), "trim", FH, 0.05)
# bridge tower at the bow: a raked superstructure with a wraparound glass band
BRIDGE = [
    {"z": 12.5, "w": 4.6, "t": 0.6, "b": 0.6, "eT": 6, "eB": 6, "yc": 5.2},
    {"z": 13.2, "w": 5.0, "t": 2.6, "b": 0.6, "eT": 6, "eB": 6, "yc": 5.6},
    {"z": 15.0, "w": 5.4, "t": 4.2, "b": 0.6, "eT": 5, "eB": 6, "yc": 5.6},
    {"z": 22.0, "w": 5.6, "t": 4.6, "b": 0.6, "eT": 4.5, "eB": 6, "yc": 5.6},
    {"z": 25.5, "w": 5.4, "t": 3.8, "b": 0.6, "eT": 3.5, "eB": 6, "yc": 5.4},
    {"z": 27.6, "w": 4.6, "t": 2.0, "b": 0.6, "eT": 2.8, "eB": 6, "yc": 5.0},
    {"z": 28.6, "w": 3.0, "t": 0.6, "b": 0.6, "eT": 2.2, "eB": 6, "yc": 4.6},
]
mesh("f_bridge", loft(BRIDGE, 36), "trim", FH, 0.2)
mesh("f_bridgeGlass", cband(BRIDGE, 0.06, 7.6, 9.0, zlo=14.0, step=0.2, n=180), "glass", FH, 0)
mesh("f_bridgeStripe", cband(BRIDGE, 0.05, 6.4, 7.0, step=0.3, n=180), "stripe", FH, 0)
mesh("f_bridgeRoof", xf(rbox(3.2, 0.3, 4.0, 0.2), (0, 10.25, 19.5)), "dark", FH, 0.06)
mesh("f_mast", beam((1.6, 10.4, 17.5), (1.6, 15.5, 17.0), 0.14), "dark", FH, 0.03)
mesh("f_mastLight", xf(superquad(0.3, 0.3, 0.3, 1, 1, 10, 6), (1.6, 15.6, 17.0)), "white", FH, 0)
mesh("f_dish", xf(lathe([(0, 0.0), (0.9, 0.12), (1.5, 0.45), (1.55, 0.5), (0, 0.18)], 18), (-1.8, 11.2, 21.0), (0.6, 0, 0.3)), "white", FH, 0.04)
mesh("f_dishPost", beam((-1.8, 10.4, 21.0), (-1.8, 11.2, 21.0), 0.18), "dark", FH, 0)
# nose: running lights and a chin bumper
for side in (-1, 1):
    mesh(f"f_head{side}", xf(superquad(0.7, 0.32, 0.18, 0.4, 0.5, 12, 6), (side * 2.2, -1.6, 32.6), (0.1, side * 0.5, 0)), "window", FH, 0)
mesh("f_chin", xf(rbox(4.6, 0.5, 1.6, 0.25), (0, -4.6, 29.5)), "dark", FH, 0.08)
# container racks clamped down both flanks
CONT = [(-18.5, 0), (-9.5, 1), (-0.5, 2), (8.5, 3)]
for side in (-1, 1):
    X = side * 10.6
    for z, ci in CONT:
        mesh(f"f_box{side}{ci}", xf(rbox(2.6, 2.5, 4.0, 0.08, 16, 6), (X, -1.6, z)), f"cargo{ci}", FH, 0.12)
        for k in (-1, 1):
            mesh(f"f_boxRib{side}{ci}{k}", xf(rbox(2.68, 2.58, 0.18, 0.15, 10, 4), (X, -1.6, z + k * 3.6)), "trim", FH, 0)
        mesh(f"f_boxDoor{side}{ci}", xf(rbox(0.06, 2.0, 2.8, 0.2, 8, 4), (X + side * 2.62, -1.6, z)), "dark", FH, 0)
    # rack frame: top and bottom rails, struts back to the hull
    for y in (1.2, -4.4):
        mesh(f"f_rail{side}{y}", xf(rbox(0.32, 0.32, 18.6, 0.3, 8, 4), (side * 8.0, y, -5.0)), "steel", FH, 0.05)
        mesh(f"f_railO{side}{y}", xf(rbox(0.22, 0.22, 18.6, 0.3, 8, 4), (side * 13.3, y, -5.0)), "steel", FH, 0.04)
    for z in (-23.0, -14.0, -5.0, 4.0, 13.0):
        mesh(f"f_clampT{side}{z}", beam((side * 7.4, 1.2, z), (side * 13.3, 1.2, z), 0.22), "steel", FH, 0.03)
        mesh(f"f_clampB{side}{z}", beam((side * 7.4, -4.4, z), (side * 13.3, -4.4, z), 0.22), "steel", FH, 0.03)
        mesh(f"f_post{side}{z}", beam((side * 13.3, -4.4, z), (side * 13.3, 1.2, z), 0.2), "steel", FH, 0.03)
# swept radiator wings: broad panels angled up off the aft shoulders, fins striped in the livery
RAD_DIH = 0.2
def wing_pt(span, up, chord, side):
    p = Vector((span, up, -chord))
    p.rotate(Euler((0, 0, RAD_DIH)))
    return (side * (p.x + 7.0), p.y + 3.8, p.z - 6.0)
for side in (-1, 1):
    wing = [(0.0, 0.0), (7.0, 0.0), (17.0, 3.4), (17.0, 7.6), (6.0, 9.4), (0.0, 9.4)]  # (span, chord)
    verts, faces = extrude(wing, 0.5, "y")
    out = [wing_pt(vx, vy, vz, side) for vx, vy, vz in verts]
    mesh(f"f_rad{side}", (out, [tuple(reversed(f)) for f in faces] if side < 0 else faces), "steel", FH, 0.12)
    for k in range(7):
        sp = 1.8 + k * 2.2
        lead = 3.4 * max(0.0, sp - 7.0) / 10.0 + 0.5
        trail = 9.0 if sp < 6.0 else 9.0 - (sp - 6.0) * (1.8 / 11.0)
        mesh(f"f_radFin{side}{k}", beam(wing_pt(sp, 0.32, lead, side), wing_pt(sp, 0.32, trail, side), 0.12, 4), "stripe", FH, 0)
    mesh(f"f_radEdge{side}", beam(wing_pt(7.0, 0.0, 0.0, side), wing_pt(17.0, 0.0, 3.4, side), 0.3, 6), "trim", FH, 0.04)
    mesh(f"f_navLight{side}", xf(superquad(0.5, 0.5, 0.5, 1, 1, 10, 6), wing_pt(17.2, 0.0, 5.5, side)), "green" if side > 0 else "red", FH, 0)
# stern engine cluster: a thrust frame and four bells, plume pivots at the bell mouths
mesh("f_thrustFrame", loft([
    {"z": -31.5, "w": 7.6, "t": 5.0, "b": 5.0, "eT": 4, "eB": 4},
    {"z": -30.8, "w": 8.4, "t": 5.6, "b": 5.6, "eT": 4, "eB": 4},
    {"z": -27.6, "w": 8.4, "t": 5.6, "b": 5.6, "eT": 4, "eB": 4},
    {"z": -26.4, "w": 7.2, "t": 4.6, "b": 4.6, "eT": 4, "eB": 4},
], 32), "steel", FH, 0.2)
mesh("f_frameBand", keep(loft(grow([{"z": -30.6, "w": 8.4, "t": 5.6, "b": 5.6, "eT": 4, "eB": 4}, {"z": -29.4, "w": 8.4, "t": 5.6, "b": 5.6, "eT": 4, "eB": 4}], 0.06), 32, False, False), lambda c: True), "stripe", FH, 0)
# a heat-shield plate over the frame's back face, then four engines mounted on it: a pump housing
# and gimbal ring bolted to the plate, the bell's narrow throat on that, flaring out to the mouth
mesh("f_heatShield", xf(rbox(7.6, 5.0, 0.25, 0.12, 16, 6), (0, 0, -31.6)), "dark", FH, 0.06)
THROAT_Z, BELL_L = -33.0, 5.0
bell = [(1.15, 0.0), (1.2, 0.5), (1.45, 1.8), (1.8, 3.2), (2.15, 4.4), (2.3, 4.85), (2.3, BELL_L)]
for i, (x, y) in enumerate([(-4.0, 2.6), (4.0, 2.6), (-4.0, -2.6), (4.0, -2.6)]):
    # pump housing + gimbal ring between the plate and the throat
    mesh(f"f_pump{i}", xf(lathe([(r, -h) for r, h in [(0, 0), (1.7, 0), (1.75, 0.3), (1.6, 1.0), (1.3, 1.25), (1.2, 1.5), (0, 1.5)]], 20), (x, y, -31.7), (math.pi / 2, 0, 0)), "steel", FH, 0.06)
    mesh(f"f_gimbal{i}", xf(torus(1.35, 0.22, 20, 6), (x, y, THROAT_Z + 0.15), (math.pi / 2, 0, 0)), "stripe", FH, 0.02)
    for k in range(3):
        a = k * 2 * math.pi / 3 + 0.5
        mesh(f"f_strut{i}{k}", beam((x + math.cos(a) * 1.55, y + math.sin(a) * 1.55, -31.8), (x + math.cos(a) * 1.75, y + math.sin(a) * 1.75, THROAT_Z - 1.8), 0.1, 5), "steel", FH, 0.02)
    mesh(f"f_bell{i}", xf(lathe([(r, -h) for r, h in bell], 24), (x, y, THROAT_Z), (math.pi / 2, 0, 0)), "dark", FH, 0.1)
    mesh(f"f_bellRing{i}", xf(torus(2.3, 0.14, 24, 6), (x, y, THROAT_Z - BELL_L), (math.pi / 2, 0, 0)), "stripe", FH, 0)
    # the glow deep in the bell, at the throat
    mesh(f"f_bellGlow{i}", xf(lathe([(0, 0), (1.25, 0), (1.25, 0.06), (0, 0.06)], 20), (x, y, THROAT_Z - 0.4), (math.pi / 2, 0, 0)), "engine", FH, 0)
    mesh(f"f_bellCore{i}", xf(lathe([(0, 0), (0.7, 0), (0.7, 0.08), (0, 0.08)], 16), (x, y, THROAT_Z - 0.5), (math.pi / 2, 0, 0)), "core", FH, 0)
    plume(FR, f"f_plume{i}", (x, y, THROAT_Z - BELL_L - 0.05), 2.0, 13.0)
mesh("f_tailLight", xf(superquad(0.35, 0.35, 0.35, 1, 1, 10, 6), (0, 5.9, -30.0)), "white", FH, 0)
# belly: lift-jet grilles (and their flames), skid keels
for i, (x, z) in enumerate([(-3.6, 9.0), (3.6, 9.0), (-3.6, -21.5), (3.6, -21.5)]):
    mesh(f"f_grille{i}", xf(rbox(1.25, 0.08, 1.25, 0.2, 10, 4), (x, BELLY_F - 0.04, z)), "dark", FH, 0.03)
    mesh(f"f_grilleLit{i}", xf(rbox(1.0, 0.08, 1.0, 0.2, 10, 4), (x, BELLY_F - 0.08, z)), "engine", FH, 0)
    plume(FR, f"f_lift{i}", (x, BELLY_F - 0.12, z), 1.0, 6.5, axis="y")
for side in (-1, 1):
    mesh(f"f_keel{side}", xf(rbox(0.25, 0.3, 14.0, 0.3), (side * 6.6, BELLY_F + 0.1, 3.0)), "dark", FH, 0.05)
# landing gear: four legs, each folding back into its own bay
HF = BELLY_F + 0.7
leg_f = (GEAR_F + BELLY_F) + 0.7
for name, (x, z) in (("f_legFL", (-5.0, 17.0)), ("f_legFR", (5.0, 17.0)), ("f_legRL", (-5.0, -13.0)), ("f_legRR", (5.0, -13.0))):
    landing_leg(FR, name, (x, HF, z), leg_f, 1.57, r=0.5, pad=1.5, ink=0.08, scale=2.2)
    gear_bay(F, name + "Bay", x, BELLY_F, z + 0.9, z - leg_f - 1.6, 2.6, ink=0.05)
# belly ramp: hinged at its front edge, closed flush with the belly
F_RAMP_H = (0, BELLY_F - 0.05, -4.0)
F_RAMP_L = 11.0
f_drop = GEAR_F + BELLY_F - 0.15
f_open = -math.asin(min(1.0, f_drop / F_RAMP_L))
FRamp = pivot("f_ramp", F_RAMP_H, FR, role="ramp", closed=0.0, opened=f_open)
mesh("f_rampPlate", xf(rbox(2.3, 0.16, F_RAMP_L / 2, 0.1, 12, 4), (0, 0, -F_RAMP_L / 2)), "trim", FRamp, 0.07)
for k in range(9):
    mesh(f"f_rampRib{k}", xf(rbox(2.0, 0.06, 0.1, 0.4, 6, 4), (0, 0.17, -0.8 - k * 1.2)), "dark", FRamp, 0)
for side in (-1, 1):
    mesh(f"f_rampEdge{side}", xf(rbox(0.12, 0.08, F_RAMP_L / 2 - 0.15, 0.4, 6, 4), (side * 2.15, 0.18, -F_RAMP_L / 2)), "hazard", FRamp, 0)
mesh("f_rampBay", xf(rbox(2.45, 0.06, F_RAMP_L / 2 + 0.1, 0.1, 12, 4), (0, BELLY_F + 0.04, -4.0 - F_RAMP_L / 2)), "bay", FH, 0)
FHatch = pivot("f_hatch", (0, BELLY_F + 0.08, -4.0 - F_RAMP_L / 2), FR, role="hatch")
mesh("f_hatchLight", rbox(2.2, 0.03, F_RAMP_L / 2 - 0.2, 0.2, 10, 4), "cabin", FHatch, 0)

FR["gearH"] = GEAR_F
FR["deck"] = [6.9, 2.6, 22.6]
FR["deckY"] = 2.5   # top = 5.1
FR["deckZ"] = -3.2
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

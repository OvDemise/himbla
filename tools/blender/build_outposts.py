# Rustmoon faction outposts builder for Blender (4.2+ / 5.x).
#
# Builds the small faction structures from code and exports src/assets/outposts.glb, the file
# docs/outpost-glb.md describes (read it first: axes, root names, material names, the gameplay empties,
# the `anim` groups and the `ink` property). So far only the Relay Mast is here, as two roots at the origin:
# `mast` (intact) and `mast_wreck` (main building in ruins), a port of mast() in src/outpostModels.js
# (same positions, sizes, colours and outline values; the wreck replays the game's own random stream).
#
# Run it with any Python that has the bpy module (pip install bpy):
#     MOONRUNNER_REPO=<checkout> python tools/blender/build_outposts.py
# or inside Blender:  exec(open(r"<repo>/tools/blender/build_outposts.py").read())
# MOONRUNNER_EXPORT=0 builds the scene without writing the file.
#
# Everything is authored in three.js axes (x right, y up, +z towards the gate, ground at y = 0) like the other
# build scripts. To add a kind: write build_<kind>(wreck) the way build_mast does (a Kit on a root pivot) and
# register it in BUILDERS together with its seed in KIND_SEED (must equal the one in src/outpostModels.js).

import bpy, math, os
from mathutils import Matrix, Vector


def find_repo():
    env = os.environ.get("MOONRUNNER_REPO")
    if env:
        return env
    here = globals().get("__file__", "")
    if here and os.path.isfile(here):
        root = os.path.abspath(os.path.join(os.path.dirname(here), "..", ".."))
        if os.path.isfile(os.path.join(root, "tools", "blender", "build_outposts.py")):
            return root
    return r"C:\Users\starb\projects\himbla"


REPO = find_repo()
OUT = os.path.join(REPO, "src", "assets", "outposts.glb")
if not os.path.isdir(os.path.dirname(OUT)):
    raise RuntimeError(f"No src/assets in {REPO}; set MOONRUNNER_REPO to the himbla checkout")
print("Outposts export ->", OUT)
COLL = "MoonOutposts"


def srgb(h):
    """sRGB hex (the game's colours) -> linear floats (what Blender and glTF store)."""
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(h >> 16 & 255), lin(h >> 8 & 255), lin(h & 255))


# colours from outpostModels.js
STEEL, DARK, LIGHT, CONC, CHAR = 0x55607A, 0x3A3550, 0xD8D4E8, 0x8A8698, 0x2A2433
FACTION = 0x2EC4FF  # preview accent: the game paints its own per owner
F = 0.3  # apron top: small props stand on this
KIND_SEED = {"mast": 41}  # the seeds of outpostModels.js (a kind's random streams start at KIND_SEED * 977)

# material name -> (sRGB hex, double sided). The name picks the game's treatment: faction* take the owner's accent,
# glow* are unlit in their own colour, anything else is lit toon in its own colour. Same hex and side = one material.
MATERIALS = {
    "faction": (FACTION, False), "faction_glow": (FACTION, False), "faction_cloth": (FACTION, True),
    "apron": (0x7A7686, False), "apron_edge": (0x5A566A, False),
    "concrete": (CONC, False), "dark": (DARK, False), "steel": (STEEL, False), "light": (LIGHT, False),
    "mast_red": (0xFF4F2E, False), "mast_white": (0xF5F5F5, False),
    "dish_white": (0xF5F5F5, True), "dish_grey": (0xB8B4C8, True),
    "navy": (0x2A2540, False), "shed_wall": (0xE8E4F0, False), "cabinet": (0x3A3F50, False),
    "cable_orange": (0xFF9F1C, False), "cable_blue": (0x2EC4FF, False), "cable_black": (0x111111, False),
    "char": (CHAR, False), "rubble_dark": (0x3A3540, False), "rubble_brown": (0x4A3F3A, False),
    "rubble_grey": (0x55505E, False), "burnt_wall": (0x4A4652, False),
    "glow_red": (0xFF2A4A, False), "glow_green": (0x7DFF3A, False), "glow_cyan": (0x2EE6FF, False),
    "glow_lamp": (0xFFF3B0, False),
}
SLOT_COLORS = {name: srgb(h) for name, (h, _) in MATERIALS.items()}

# geometry and scene helpers shared with the other build scripts
exec(open(os.path.join(REPO, "tools", "blender", "kit.py"), encoding="utf-8").read(), globals())

C = coll()
for _name, (_hex, _double) in MATERIALS.items():
    material(_name).use_backface_culling = not _double  # (off = double sided in glTF)


# ---------------- port of the game's Kit (src/outpostModels.js) ----------------

def mulberry32(a):
    """src/rng.js, bit for bit."""
    a &= 0xFFFFFFFF
    imul = lambda x, y: (x * y) & 0xFFFFFFFF

    def rng():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = imul(a ^ (a >> 15), 1 | a)
        t = ((t + imul(t ^ (t >> 7), 61 | t)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return rng


def js_round(v):
    return math.floor(v + 0.5)  # Math.round (halves go up), not Python's banker's rounding


def euler_xyz(rx, ry, rz):
    """THREE.Euler 'XYZ' as a matrix: Rx * Ry * Rz (mathutils' own 'XYZ' is the reverse product)."""
    return Matrix.Rotation(rx, 4, "X") @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rz, 4, "Z")


def dish_geo(r):
    """A shallow dish facing local +z (dishGeo in outpostModels.js)."""
    return place(sphere(r, 14, 6, 0.75), Matrix.Translation((0, 0, r * 0.85)) @ Matrix.Rotation(-math.pi / 2, 4, "X"))


class Kit:
    """The parts of the game's Kit this builder needs. Parts are meshes (verts in the root's frame) under `root`;
    colliders, blast boxes, the raid spot, smoke, drop and sign faces are empties; flags, blinkers and the
    spinning dish are `anim` empties with their meshes as children. Every method takes `name=` (the object's
    name; a wreck's names all end in _wreck so they stay unique) and `ink=` (the JS `outline`, 0 = none)."""

    def __init__(self, root, seed, wreck):
        self.root, self.wreck = root, wreck
        self.rr, self.mr, self.wr = mulberry32(seed), mulberry32(seed + 1), mulberry32(seed + 2)
        self.sfx = "_wreck" if wreck else ""
        self.names, self.counts = set(), {}
        self.base, self.yaw = Matrix.Identity(4), 0.0

    # -- plumbing
    def name(self, base, auto="part"):
        n = (base or f"{auto}_{self.count(auto)}") + self.sfx
        assert n not in self.names, f"duplicate object name {n}"
        self.names.add(n)
        return n

    def count(self, key):
        self.counts[key] = self.counts.get(key, -1) + 1
        return self.counts[key]

    def at(self, x=0, z=0, yaw=0, y=0):
        """Frame for the following parts: position and yaw (about +y)."""
        self.base = Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw, 4, "Y")
        self.yaw = yaw
        return self

    def P(self, x, y, z):
        return self.base @ Vector((x, y, z))

    # -- meshes
    def add(self, geo, slot, x=0, y=0, z=0, rx=0, ry=0, rz=0, rot=None, ink=0.06, name=None):
        m = self.base @ Matrix.Translation((x, y, z)) @ (rot if rot is not None else euler_xyz(rx, ry, rz))
        return mesh_smooth(self.name(name), place(geo, m), slot, self.root, ink)

    def box(self, w, h, d, slot, x, y0, z, ink=0.06, name=None, **rot):
        return self.add(cuboid(w, h, d), slot, x, y0 + h / 2, z, ink=ink, name=name, **rot)

    def cyl(self, rt, rb, h, seg, slot, x, y0, z, ink=0.06, name=None):
        return self.add(cylinder(rt, rb, h, seg), slot, x, y0 + h / 2, z, ink=ink, name=name)

    def ball(self, r, slot, x, y, z, ink=0.06, name=None):
        return self.add(sphere(r, 8, 6), slot, x, y, z, ink=ink, name=name)

    def ring(self, r, tube, slot, x, y, z, ink=0, name=None):
        return self.add(torus_arc(r, tube, max(12, js_round(r * 5)), 4), slot, x, y, z, ink=ink, name=name)

    def beam(self, a, b, r, slot, ink=0.03, seg=5, name=None):
        """A strut between two points."""
        d = Vector(b) - Vector(a)
        rot = Vector((0, 1, 0)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        return self.add(cylinder(r, r, d.length, seg), slot, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, rot=rot, ink=ink, name=name)

    def strip(self, a, b, w, h, slot, y0, ink=0.02, name=None):
        """A flat strip between two ground points (a, b = (x, z))."""
        dx, dz = b[0] - a[0], b[1] - a[1]
        return self.box(w, h, math.hypot(dx, dz), slot, (a[0] + b[0]) / 2, y0, (a[1] + b[1]) / 2, ink=ink, name=name, ry=math.atan2(dx, dz))

    # -- empties
    def empty(self, name, pos, display="PLAIN_AXES", size=0.3, scale=(1, 1, 1), yaw=0.0, **props):
        e = pivot(name, pos, self.root, **props)
        e.empty_display_type, e.empty_display_size = display, size
        e.rotation_euler = (0, 0, yaw)  # yaw about three.js +y is a turn about Blender +z
        e.scale = scale
        return e

    def dyn(self, name, anim, x, y, z, ry=0):
        """The animated group's node (the game swings / blinks / spins it); author its meshes relative to it."""
        p = self.P(x, y, z)
        return self.empty(self.name(name), (p.x, p.y, p.z), yaw=self.yaw + ry, anim=anim)

    def child(self, parent, name, geo, slot, ink=0):
        """A mesh under an anim node, with `geo` in the node's own frame."""
        n = self.name(name)
        return mesh_smooth(n, geo, slot, parent, ink)

    # -- gameplay data (colliders / blast boxes in the current frame)
    def box_empty(self, role, hx, hy, hz, x, z, ry, y0, name):
        p = self.P(x, 0, z)
        return self.empty(self.name(name, role), (p.x, y0 + hy, p.z), "CUBE", 1, (hx, hz, hy), self.yaw + ry, role=role, shape="box")

    def solid(self, hx, hy, hz, x, z, ry=0, y0=0, name=None):
        return self.box_empty("col", hx, hy, hz, x, z, ry, y0, name)

    def hit(self, hx, hy, hz, x, z, ry=0, name=None):
        return self.box_empty("hit", hx, hy, hz, x, z, ry, 0, name)

    def column(self, r, h, x, z, y0=0, name=None):
        p = self.P(x, 0, z)
        return self.empty(self.name(name, "col"), (p.x, (y0 + h) / 2, p.z), "CIRCLE", 1, (r, r, (h - y0) / 2), role="col", shape="cyl")

    def point(self, role, x, y, z, name=None):
        p = self.P(x, y, z)
        return self.empty(self.name(name or role), (p.x, p.y, p.z), "ARROWS", 0.6, role=role)

    # -- dynamic things
    def blinker(self, x, y, z, slot="glow_red", r=0.4):
        n = self.count("blink")
        node = self.dyn(f"blink_{n}", "blink", x, y, z)
        self.child(node, f"blink_{n}_lamp", sphere(r, 8, 6), slot)
        return node

    def flag(self, x, z, h=10, y0=0):
        n = self.count("flag")
        self.cyl(0.1, 0.13, h, 6, "dark", x, y0, z, ink=0.03, name=f"flag_pole_{n}")
        self.ball(0.22, "faction_glow", x, y0 + h + 0.15, z, ink=0, name=f"flag_ball_{n}")
        node = self.dyn(f"flag_{n}", "flag", x, y0 + h - 1.0, z)
        self.child(node, f"flag_{n}_cloth", place(plane(3, 1.8), Matrix.Translation((1.55, 0, 0))), "faction_cloth")
        return node

    def sign(self, text, x, z, w=8, y=3.4, ph=2.0, ry=0, fg="#ffd23f", bg="#241a3a", stroke="#120a1e"):
        """A name board on two posts, face towards local +z. The game draws the words from the `text` empty, so
        the board's height `ph` is the text plane's height for width w - 0.5 (measured: Kit.sign takes it from the
        canvas aspect)."""
        pw = w - 0.5
        save, save_yaw = self.base, self.yaw
        self.base = self.base @ Matrix.Translation((x, 0, z)) @ Matrix.Rotation(ry, 4, "Y")
        self.yaw += ry
        for i, s in enumerate((-1, 1)):
            self.box(0.3, y + ph / 2 + 0.2, 0.3, "dark", s * (w / 2 - 0.6), 0, 0, ink=0.04, name=f"sign_post_{i}")
        self.box(w, ph + 0.5, 0.26, "dark", 0, y - ph / 2 - 0.25, 0, ink=0.06, name="sign_board")
        self.box(w + 0.2, 0.3, 0.4, "faction", 0, y + ph / 2 + 0.2, 0, ink=0.04, name="sign_trim")
        p = self.P(0, y, 0)
        self.empty(self.name("text_sign"), (p.x, p.y, p.z), yaw=self.yaw, role="text", str=text, w=pw, fg=fg, bg=bg, stroke=stroke, back=1, off=0.17)
        self.base, self.yaw = save, save_yaw

    # -- shared yard props
    def lamp(self, x, z, h=7, slot="glow_lamp"):
        n = self.count("lamp")
        l = math.hypot(x, z) or 1
        dx, dz = -x / l, -z / l
        self.cyl(0.12, 0.17, h, 6, "dark", x, 0, z, ink=0.03, name=f"lamp_{n}_pole")
        self.column(0.25, h, x, z, name=f"col_lamp_{n}")
        self.beam((x, h, z), (x + dx * 1.5, h, z + dz * 1.5), 0.08, "dark", name=f"lamp_{n}_arm")
        self.box(0.8, 0.3, 0.55, "dark", x + dx * 1.6, h - 0.05, z + dz * 1.6, ink=0.03, name=f"lamp_{n}_head", ry=math.atan2(dx, dz))
        self.box(0.66, 0.08, 0.42, slot, x + dx * 1.6, h - 0.12, z + dz * 1.6, ink=0, name=f"lamp_{n}_light", ry=math.atan2(dx, dz))

    def apron(self, r, color, edge):
        self.cyl(r, r + 0.6, 0.3, 48, color, 0, 0, 0, ink=0.05, name="apron")
        self.ring(r - 0.3, 0.16, edge, 0, 0.3, 0, name="apron_edge")

    def perimeter(self, r, step=0.32, gap=0.3):
        """Little glowing marker posts round the apron edge, with a gap at the entrance (+z)."""
        a, n = gap, 0
        while a < math.pi * 2 - gap + 1e-3:
            x, z = math.sin(a) * r, math.cos(a) * r
            self.box(0.26, 1.3, 0.26, "dark", x, 0, z, ink=0.03, name=f"perimeter_post_{n}")
            self.box(0.32, 0.22, 0.32, "faction_glow", x, 1.3, z, ink=0, name=f"perimeter_cap_{n}")
            a += step
            n += 1

    def raid_at(self, x, z, slot):
        """The raid marker: two glowing rings on the ground, plus the stand point (nothing on a wreck)."""
        if self.wreck:
            return
        self.ring(1.7, 0.14, slot, x, F + 0.04, z, name="raid_ring_outer")
        self.ring(1.1, 0.07, slot, x, F + 0.04, z, name="raid_ring_inner")
        self.point("raid", x, F, z)

    def scatter_debris(self, cx, cz, hx, hz, n, rr, colors=("char", "rubble_dark", "rubble_brown", "rubble_grey")):
        for i in range(n):  # (every rr() call in the order the JS argument list evaluates them)
            s = 0.6 + rr() * 2.2
            h = 0.3 + rr() * 1.1
            d = 0.6 + rr() * 2
            x = cx + (rr() * 2 - 1) * hx
            z = cz + (rr() * 2 - 1) * hz
            rx, ry, rz = (rr() - 0.5) * 0.7, rr() * 3, (rr() - 0.5) * 0.7
            self.add(cuboid(s, h, d), colors[i % len(colors)], x, F + 0.3, z, rx=rx, ry=ry, rz=rz, ink=0.04, name=f"debris_{self.count('debris')}")


# ---------------- Relay mast ----------------
# A 40 m guyed lattice mast in aviation red and white with dishes and beacons, an equipment shed, a cable tray
# and a big dish on the ground. The wreck: the mast buckled at the base and came down in two folded lengths,
# the shed burnt out.

def build_mast(wreck):
    root = pivot("mast_wreck" if wreck else "mast", (0, 0, 0), None)
    k = Kit(root, KIND_SEED["mast"] * 977 + 0 * 131, wreck)
    k.apron(24, "apron", "apron_edge")
    MX, MZ, H, SX, SZ = -3, -6, 40.7, 10, 8
    if not wreck:
        k.box(3.6, 0.7, 3.6, "concrete", MX, 0, MZ, ink=0.05, name="mast_base")
        legs = [(MX + math.cos(a) * 0.95, MZ + math.sin(a) * 0.95) for a in ((i * math.pi * 2) / 3 + 0.3 for i in range(3))]
        for s in range(8):
            for i, (lx, lz) in enumerate(legs):
                k.beam((lx, 0.7 + s * 5, lz), (lx, 0.7 + (s + 1) * 5, lz), 0.13, "mast_red" if s % 2 else "mast_white", ink=0.03, name=f"mast_leg_{s}_{i}")
        for l in range(16):
            for f in range(3):
                a, b = legs[f], legs[(f + 1) % 3]
                y0 = 0.7 + l * 2.5
                y1 = y0 + 2.5
                if l % 2:
                    k.beam((a[0], y0, a[1]), (b[0], y1, b[1]), 0.05, "steel", ink=0, name=f"mast_diag_{l}_{f}")
                else:
                    k.beam((b[0], y0, b[1]), (a[0], y1, a[1]), 0.05, "steel", ink=0, name=f"mast_diag_{l}_{f}")
                if l % 2 == 0:
                    k.beam((a[0], y0, a[1]), (b[0], y0, b[1]), 0.06, "steel", ink=0, name=f"mast_brace_{l}_{f}")
        for i, y in enumerate((20.7, 32.7)):
            k.add(cylinder(2.3, 2.3, 0.2, 3), "dark", MX, y, MZ, ry=0.3, ink=0.04, name=f"mast_platform_{i}")
            k.blinker(MX + 2.0, y + 0.45, MZ, "glow_red", 0.3)
        k.cyl(0.08, 0.12, 2.6, 5, "light", MX, H, MZ, ink=0.02, name="mast_pole")
        k.blinker(MX, H + 2.9, MZ, "glow_red", 0.45)
        for i, (h, ry, r) in enumerate(((17, 0.5, 1.6), (25, 2.6, 1.9), (28.5, 4.4, 1.4))):
            k.at(MX, MZ, ry)
            k.add(dish_geo(r), "dish_white", 0, h, 1.2, ink=0.04, name=f"mast_dish_{i}")
            k.beam((0, h, 0.4), (0, h, 1.4), 0.08, "dark", name=f"mast_dish_{i}_arm")
            k.beam((0, h, 1.4), (0, h, 1.2 + r * 1.2), 0.04, "dark", ink=0, name=f"mast_dish_{i}_feed")
            k.at()
        for i in range(3):
            k.at(MX, MZ, (i * math.pi * 2) / 3 + 1.2)
            k.box(0.55, 2.8, 0.2, "light", 0, 35.6, 1.15, ink=0.03, name=f"mast_fin_{i}")
            k.at()
        # the spinning dish on the top platform
        spin = k.dyn("spinner", "spin", MX, 32.8, MZ)
        k.child(spin, "spinner_dish", place(dish_geo(1.5), Matrix.Translation((0, 1.0, 1.6)) @ Matrix.Rotation(-0.4, 4, "X")), "dish_white")
        k.child(spin, "spinner_arm", place(cuboid(0.2, 0.2, 1.6), Matrix.Translation((0, 1.0, 0.8))), "dark")
        # guy wires to three anchors
        for i in range(3):
            a = 0.5 + (i * math.pi * 2) / 3
            ax, az = MX + math.cos(a) * 17, MZ + math.sin(a) * 17
            k.box(1.8, 1, 1.8, "concrete", ax, 0, az, ink=0.04, name=f"guy_anchor_{i}")
            k.box(1.0, 0.3, 1.0, "faction", ax, 1, az, ink=0.02, name=f"guy_cap_{i}")
            for j, h in enumerate((14, 27, 39.5)):
                k.beam((ax, 1.1, az), (MX + math.cos(a) * 0.9, h, MZ + math.sin(a) * 0.9), 0.045, "navy", ink=0, seg=3, name=f"guy_wire_{i}_{j}")
        k.column(1.6, H, MX, MZ, name="col_mast")
        # equipment shed
        k.box(8, 3.4, 5.5, "shed_wall", SX, 0, SZ, ink=0.1, name="shed")
        k.box(8.5, 0.35, 6, "faction", SX, 3.4, SZ, ink=0.04, name="shed_roof")
        k.box(0.2, 2.4, 1.4, "navy", SX - 4.02, F, SZ + 0.8, ink=0.02, name="shed_door")
        for i, slot in enumerate(("glow_green", "glow_green", "glow_red")):
            k.box(0.08, 0.18, 0.18, slot, SX - 4.06, 1.8 + i * 0.3, SZ - 0.6, ink=0, name=f"shed_led_{i}")
        for i, dx in enumerate((-2, 1.2)):
            k.box(1.6, 1.3, 0.9, "light", SX + dx, F, SZ + 3.2, ink=0.04, name=f"shed_unit_{i}")
            k.add(place(cylinder(0.5, 0.5, 0.06, 12), Matrix.Rotation(math.pi / 2, 4, "X")), "dark", SX + dx, F + 0.65, SZ + 3.66, ink=0, name=f"shed_vent_{i}")
        for i in range(3):
            k.box(1.2, 1.6, 0.9, "cabinet", SX + 4.6, F, SZ - 1.8 + i * 1.3, ink=0.03, name=f"shed_cabinet_{i}")
        k.solid(4, 1.9, 2.75, SX, SZ, name="col_shed")
    else:
        wr = k.wr
        k.box(3.6, 0.7, 3.6, "concrete", MX, 0, MZ, ink=0.05, name="mast_base")
        k.box(5, 0.06, 5, "char", MX, 0.7, MZ, ink=0, name="mast_scorch")
        for i in range(3):
            a = (i * math.pi * 2) / 3 + 0.3
            ex = MX + math.cos(a) * 1.3 + (wr() - 0.5)
            ey = 2.5 + wr() * 3
            ez = MZ + math.sin(a) * 1.3 + (wr() - 0.5)
            k.beam((MX + math.cos(a) * 0.95, 0.7, MZ + math.sin(a) * 0.95), (ex, ey, ez), 0.13, "mast_red" if i % 2 else "mast_white", ink=0.03, name=f"mast_stump_{i}")

        def lying(n, a, b):
            dx, dz = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dz)
            ux, uz = dx / L, dz / L
            px, pz = -uz * 0.8, ux * 0.8
            rails = [(px, F + 0.2), (-px, F + 0.2), (0, F + 1.4)]
            for s in range(math.floor(L / 5)):
                for j, (o, y) in enumerate(rails):
                    t0 = s * 5
                    t1 = min(L, t0 + 5)
                    oz = 0 if o == 0 else (pz if o == px else -pz)
                    k.beam((a[0] + ux * t0 + o, y, a[1] + uz * t0 + oz), (a[0] + ux * t1 + o, y, a[1] + uz * t1 + oz), 0.13, "mast_red" if s % 2 else "mast_white", ink=0.03, name=f"lying_{n}_rail_{s}_{j}")
            t, j = 0.0, 0
            while t < L - 1:
                k.beam((a[0] + ux * t + px, F + 0.2, a[1] + uz * t + pz), (a[0] + ux * (t + 2.5), F + 1.4, a[1] + uz * (t + 2.5)), 0.05, "steel", ink=0, name=f"lying_{n}_brace_{j}")
                t += 2.5
                j += 1

        lying(0, (MX + 1, MZ - 2), (5, -20))
        lying(1, (5.5, -19), (17, -12))
        k.add(dish_geo(1.9), "dish_grey", -8, F + 0.6, -14, rx=-1.3, ry=0.7, ink=0.04, name="fallen_dish_0")
        k.add(dish_geo(1.5), "dish_grey", 9, F + 0.5, -16, rx=1.2, ry=2.1, ink=0.04, name="fallen_dish_1")
        for i in range(3):
            a = 0.5 + (i * math.pi * 2) / 3
            ax, az = MX + math.cos(a) * 17, MZ + math.sin(a) * 17
            k.box(1.8, 1, 1.8, "concrete", ax, 0, az, ink=0.04, name=f"guy_anchor_{i}")
            k.beam((ax, 1.1, az), (ax - math.cos(a) * 3, F, az - math.sin(a) * 3 + 0.5), 0.045, "navy", ink=0, seg=3, name=f"guy_wire_{i}_0")
        k.scatter_debris(MX, MZ, 4, 4, 8, wr)
        # the shed burnt out
        k.box(8.6, 0.06, 6, "char", SX, F, SZ, ink=0, name="shed_floor")
        n = 0
        x = -3.5
        while x <= 3.5:
            for s in (-1, 1):
                h = 0.4 + wr() * 1.8
                slot = "concrete" if wr() < 0.5 else "burnt_wall"
                k.box(1.7, h, 0.3, slot, SX + x, 0, SZ + s * 2.6, ink=0.04, name=f"shed_wall_{n}")
                n += 1
            x += 1.75
        for i, s in enumerate((-1, 1)):
            k.box(0.3, 0.4 + wr() * 1.5, 5, "burnt_wall", SX + s * 3.85, 0, SZ, ink=0.04, name=f"shed_side_{i}")
        k.box(8, 0.3, 5, "faction", SX + 0.5, 0.9, SZ + 0.4, rx=0.18, rz=-0.22, ink=0.05, name="shed_roof_fallen")
        k.box(1.6, 1.3, 0.9, "light", SX - 2, F, SZ + 3.6, rz=1.4, ink=0.04, name="shed_unit_fallen")
        k.scatter_debris(SX, SZ, 3.5, 2.5, 8, wr)
    k.hit(1.8, 20.6, 1.8, MX, MZ, name="hit_mast")
    k.hit(4, 1.9, 2.75, SX, SZ, name="hit_shed")
    k.point("smoke", MX, 2, MZ)
    k.point("drop", -4, F, 10)
    # transponder rack by the shed door: the raid spot
    k.box(0.8, 2.2, 1.2, "dark", SX - 4.6, F, SZ + 2.8, ink=0.05, name="rack")
    for i in range(4):
        k.box(0.05, 0.1, 0.9, "glow_cyan" if i % 2 else "glow_green", SX - 5.02, F + 0.5 + i * 0.4, SZ + 2.8, ink=0, name=f"rack_led_{i}")
    k.box(0.84, 0.2, 1.24, "faction", SX - 4.6, F + 2.2, SZ + 2.8, ink=0, name="rack_top")
    k.cyl(0.03, 0.03, 1.6, 4, "light", SX - 4.6, F + 2.4, SZ + 3.2, ink=0, name="rack_antenna")
    k.ball(0.1, "glow_red", SX - 4.6, F + 4.05, SZ + 3.2, ink=0, name="rack_beacon")
    k.raid_at(SX - 6.6, SZ + 1.2, "glow_cyan")
    # cable tray from the shed to the mast
    t0, t1 = (SX - 4.2, SZ - 1.5), (MX + 1.4, MZ + 1.6)
    k.strip(t0, t1, 0.7, 0.15, "steel", 1.3, name="tray")
    for i, (off, slot) in enumerate(((0.2, "cable_orange"), (0, "cable_blue"), (-0.2, "cable_black"))):
        k.strip((t0[0], t0[1] + off), (t1[0], t1[1] + off), 0.12, 0.1, slot, 1.45, ink=0, name=f"tray_cable_{i}")
    for i in range(5):
        t = i / 4
        k.cyl(0.06, 0.06, 1.3, 4, "dark", t0[0] + (t1[0] - t0[0]) * t, 0, t0[1] + (t1[1] - t0[1]) * t, ink=0, name=f"tray_post_{i}")
    # the big ground dish
    k.at(-13, 10, 2.4)
    k.cyl(0.6, 0.9, 2.4, 8, "light", 0, 0, 0, ink=0.05, name="dish_ground_base")
    k.box(1.4, 0.8, 1.0, "dark", 0, 2.2, 0, ink=0.03, name="dish_ground_head")
    k.add(dish_geo(3.2), "dish_white", 0, 3.2, -0.4, rx=-0.8, ink=0.05, name="dish_ground")
    k.beam((0, 3.2, 0.3), (0, 5.2, 2.2), 0.06, "dark", ink=0, name="dish_ground_feed")
    k.column(1.2, 3, 0, 0, name="col_dish_ground")
    k.at()
    # name board, flags, perimeter, lights
    k.sign("RELAY MAST", 0, 21.6, w=9, ph=2.0537)  # (2.0537 m: the board's text plane height at width 8.5, measured in the game)
    k.flag(-5.8, 21.4, 9)
    k.flag(5.8, 21.4, 9)
    k.perimeter(23.4, 0.32, 0.32)
    k.lamp(17, -6, 7)
    k.lamp(-17, -10, 7)
    return root


BUILDERS = {"mast": build_mast}  # kind -> build(wreck) -> root pivot (named kind / kind_wreck)

for _kind, _build in BUILDERS.items():
    _build(False)
    _build(True)
print("built", len(C.objects), "objects:", sum(o.type == "MESH" for o in C.objects), "meshes,", sum(o.type == "EMPTY" for o in C.objects), "empties")

if os.environ.get("MOONRUNNER_EXPORT", "1") == "1":
    export(OUT, C.objects)

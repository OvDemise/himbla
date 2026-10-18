# Chimera Downs' arcades, gates and forecourt furniture for Blender (4.2+ / 5.x), exported to src/assets/downs-arcade.glb (docs/downs-layouts.md, layout B).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_arcade.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_arcade.py
#
# Authored in three.js axes (x right, y up, +z front), each model standing on y = 0 with its origin on the ground. One material per mesh named after a slot (DOWNS_TOON / DOWNS_GLOW in src/models.js).
#   dn_arcade     one 6.3 degree wedge of an arcade round a turn, as a bay of a market hall: its inner chord is at z = 0 (84 m from the turn's centre) and its outer wall at z = 15.98 (100 m);
#                 x is tangential, the bay's middle at x = 0. A timber floor, a Mint colonnade column at its left corner, a Mint architrave, a raked Barn Red roof with Mint ribs and a gold-lipped
#                 fascia with pennants, a back wall with lit windows, two pendant lamps. Neighbouring wedges meet on the radial lines, so a run of them closes without a gap
#   dn_gate_hall  a gate hall, 32 m across (x) and 22 m deep (z = -11 to 11), +z outward: two Mint blocks with Barn Red hip roofs either side of a 12 m passage under a gabled Barn Red lintel hall,
#                 Black name boards (on both faces, 4.4 m by 2 m, centre 9.3 m up) and lit slits
#   dn_gate_main  the forecourt's gate, 28 m between the outer faces of its pylons (x) and 3 m deep: two Mint pylons 12 m tall with gold bands and lanterns, and a Barn Red segmental arch between
#                 them with a Black name board on both faces (centre y 13, 6.8 x 1.1)
#   dn_fountain   the forecourt's fountain, 24 m across: a Money planter ring, a Mint rim, lit water, a three-tier centre with a gold finial, a ring of lit jets
#   dn_bay        a valet bay's head: a wheel stop, two paint lines running 5.6 m toward +z, a post with a gold number plate (0.5 x 0.35, facing +z, centre 0.78 m up)
#   dn_bench      a bench 2.2 m long: Saddle slats on Black legs, gold end caps, facing +z
#   dn_planter    a planter 2.4 x 1 x 0.9 m: Money2 box, a gold edge, a mound of Money
#   dn_festoon    a string of lights 30 m between two points at the same height: x from -15 to 15, hanging 2.2 m at the middle, 25 lit bulbs
DOWNS_OUT = "downs-arcade.glb"
DOWNS_COLL = "MoonDownsArcade"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

# =====================================================================================================
# dn_arcade
# =====================================================================================================
RI, RO = 84.0, 100.0
A2 = math.radians(3.15)
WI, WO = RI * math.sin(A2), RO * math.sin(A2)
D = (RO - RI) * math.cos(A2)
hw = lambda z: WI + (WO - WI) * z / D


def trap(z0, z1, shrink=0.0):
    return [(-hw(z0) + shrink, z0), (hw(z0) - shrink, z0), (hw(z1) - shrink, z1), (-hw(z1) + shrink, z1)]


root = pivot("dn_arcade", (0, 0, 0))
P = parts(root, "dn_arcade", {"saddle2": 0.0, "gold": 0.012, "mint": 0.03, "mint2": 0.012, "money2": 0.0, "black": 0.02, "barn": 0.025, "glasswarm": 0.0, "glowgold": 0.0, "gold2": 0.0})
YF, YB = 6.6, 8.6                      # the roof's front edge (at z = -0.8) and back edge (at z = D + 0.2)
# floor
P["saddle2"].polyy(trap(0.0, D), 0.0, 0.14)
P["gold"].box(-WI, WI, 0.14, 0.17, 0.0, 0.35)                                           # a gold inlay along the walk's edge
# back wall
WH = 8.3
P["mint"].box(-WO, WO, 0.14, WH, D - 0.7, D)
P["money2"].box(-WO + 0.01, WO - 0.01, 0.14, 2.4, D - 0.84, D - 0.7)                    # the wainscot
P["money2"].box(-WO + 0.01, WO - 0.01, 4.4, 4.75, D - 0.78, D - 0.7)                    # a string course
for x in (-2.6, 2.6):                                                                   # two lit windows, frames behind the panes
    P["black"].box(x - 1.3, x + 1.3, 5.1, 7.7, D - 0.74, D - 0.7)
    P["glasswarm"].box(x - 1.15, x + 1.15, 5.25, 7.55, D - 0.78, D - 0.74)
    P["black"].box(x - 0.04, x + 0.04, 5.25, 7.55, D - 0.82, D - 0.78)
    P["gold"].box(x - 1.4, x + 1.4, 7.7, 7.88, D - 0.84, D - 0.7)
P["gold"].box(-WO + 0.01, WO - 0.01, WH - 0.2, WH + 0.1, D - 1.0, D + 0.1)             # cornice
# the column at the left corner, an architrave along the inner edge
cx = -WI + 0.55
P["mint2"].cylc(cx, 0.31, 0.55, 0.52, 0.3, 14)
P["mint"].cylc(cx, 0.46 + 3.1, 0.55, 0.36, 6.2, 14, rt=0.3)
P["gold"].cylc(cx, 6.5, 0.55, 0.5, 0.22, 14)
P["mint2"].box(-WI - 0.2, WI + 0.2, 6.5, 7.1, 0.1, 1.0)                                 # the architrave over the colonnade
P["gold"].box(-WI - 0.21, WI + 0.21, 6.44, 6.58, 0.08, 1.06)
# the roof: a deck raked up toward the back, tilted about x; its plan is the wedge, extended to z = -0.8 and D + 0.2
z0, z1 = -0.8, D + 0.2
zm = (z0 + z1) / 2
ang = -math.atan2(YB - YF, z1 - z0)
ym = (YF + YB) / 2 + 0.55
shift = lambda pts: [(x, z - zm) for x, z in pts]
P["barn"].polyy(shift(trap(z0, z1)), 0.0, 0.32, t=(0, ym, zm), rot=(ang, 0, 0))
P["mint2"].polyy(shift(trap(z0 + 0.1, z1 - 0.1, 0.1)), -0.07, 0.0, t=(0, ym - 0.0, zm), rot=(ang, 0, 0))
for x in (-2.6, 0.0, 2.6):                                                              # standing seams
    P["mint"].boxc(x, ym + 0.38, zm, 0.14, 0.12, z1 - z0 - 0.4, rot=(ang, 0, 0))
P["mint"].box(-hw(z0) + 0.02, hw(z0) - 0.02, YF - 0.45, YF + 0.5, z0 - 0.12, z0 + 0.12)  # the fascia
P["gold"].box(-hw(z0) + 0.02, hw(z0) - 0.02, YF - 0.55, YF - 0.45, z0 - 0.18, z0 + 0.18)
for i, x in enumerate((-2.2, 2.2)):                                                     # pennants
    (P["barn"] if i == 0 else P["gold"]).poly([(-0.4, 0), (0.4, 0), (0, -1.0)], z0 - 0.04, z0 + 0.04, t=(x, YF - 0.57, 0))
P["black"].bm((-WI + 0.4, 6.55, 0.6), (-WO + 0.5, YB - 0.7, D - 0.8), 0.1)               # a rafter from the column to the wall
# pendant lamps: a cord, a gold cap, a lit globe
for z in (3.0, 10.0):
    yroof = YF + (z - z0) * (YB - YF) / (z1 - z0) - 0.1
    P["black"].bm((0, yroof, z), (0, yroof - 0.9, z), 0.025)
    P["gold"].cylc(0, yroof - 0.95, z, 0.14, 0.12, 10)
    P["glowgold"].add(sphere(0.26, 12, 8), t=(0, yroof - 1.2, z))

# =====================================================================================================
# dn_gate_hall
# =====================================================================================================
root = pivot("dn_gate_hall", (0, 0, 0))
P = parts(root, "dn_gate_hall", {"mint": 0.05, "mint2": 0.02, "money2": 0.0, "gold": 0.02, "black": 0.025, "barn": 0.035, "glasswarm": 0.0, "saddle2": 0.0})
P["saddle2"].box(-6.0, 6.0, 0.0, 0.14, -11.0, 11.0)                                     # the passage floor
for sx in (-1, 1):
    x0, x1 = (6.0, 16.0) if sx > 0 else (-16.0, -6.0)
    P["mint2"].box(x0 - (0 if sx > 0 else 0.3), x1 + (0.3 if sx > 0 else 0), 0.0, 1.0, -11.3, 11.3)       # plinth
    P["mint"].box(x0, x1, 1.0, 12.0, -11.0, 11.0)                                       # the block
    P["gold"].box(x0 - 0.2, x1 + 0.2, 11.6, 12.4, -11.4, 11.4)                            # cornice
    P["barn"].add(cylinder(4.6, 11.2, 4.4, 4), t=((x0 + x1) / 2, 12.3 + 2.2, 0), rot=(0, PI / 4, 0), s=(0.9, 1.0, 1.85))   # the hip roof
    P["gold"].bm(((x0 + x1) / 2, 16.6, 0), ((x0 + x1) / 2, 18.4, 0), 0.07)
    P["gold"].add(sphere(0.28, 10, 8), t=((x0 + x1) / 2, 18.6, 0))
    for zf in (-1, 1):                                                                  # lit slits on both faces, frames behind the panes
        a, b = (11.0, 11.04) if zf > 0 else (-11.04, -11.0)
        P["black"].box((x0 + x1) / 2 - 0.9, (x0 + x1) / 2 + 0.9, 4.0, 10.0, a, b)
        c, d = (11.04, 11.07) if zf > 0 else (-11.07, -11.04)
        P["glasswarm"].box((x0 + x1) / 2 - 0.7, (x0 + x1) / 2 + 0.7, 4.2, 9.8, c, d)
    # the passage's wall: Money2 wainscot
    xi = 6.0 if sx > 0 else -6.0
    P["money2"].box(min(xi, xi - sx * 0.12), max(xi, xi - sx * 0.12), 0.14, 2.6, -11.0, 11.0)
# the lintel hall over the passage
P["mint"].box(-6.0, 6.0, 7.5, 11.5, -11.0, 11.0)
P["gold"].box(-6.0, 6.0, 7.2, 7.5, -11.2, 11.2)
P["barn"].poly([(-6.6, 11.5), (6.6, 11.5), (0, 14.6)], -11.3, 11.3)                      # the gabled roof
P["gold"].poly([(-6.7, 11.4), (6.7, 11.4), (6.7, 11.6), (0, 14.8), (-6.7, 11.6)], -11.42, -11.3)    # a gold edge on each gable
P["gold"].poly([(-6.7, 11.4), (6.7, 11.4), (6.7, 11.6), (0, 14.8), (-6.7, 11.6)], 11.3, 11.42)
for zf in (-1, 1):                                                                      # the name board on each face
    a, b = (11.0, 11.2) if zf > 0 else (-11.2, -11.0)
    P["gold"].box(-5.0, 5.0, 8.0, 10.6, a, b)
    c, d = (11.2, 11.26) if zf > 0 else (-11.26, -11.2)
    P["black"].box(-4.8, 4.8, 8.2, 10.4, c, d)

# =====================================================================================================
# dn_gate_main
# =====================================================================================================
root = pivot("dn_gate_main", (0, 0, 0))
P = parts(root, "dn_gate_main", {"mint": 0.05, "mint2": 0.02, "gold": 0.02, "black": 0.025, "barn": 0.035, "glowgold": 0.0})
for sx in (-1, 1):
    x = sx * 12.5
    P["mint2"].boxc(x, 0.4, 0, 3.4, 0.8, 3.4)
    P["mint"].boxc(x, 0.8 + 5.6, 0, 2.8, 11.2, 2.8)
    for y in (3.0, 9.4):
        P["gold"].boxc(x, y, 0, 3.0, 0.5, 3.0)
    P["gold"].boxc(x, 12.1, 0, 3.2, 0.3, 3.2)
    P["mint2"].boxc(x, 12.6, 0, 2.2, 0.7, 2.2)
    P["gold"].bm((x, 12.9, 0), (x, 14.6, 0), 0.07)
    P["gold"].add(sphere(0.3, 10, 8), t=(x, 14.8, 0))
    for zf in (-1, 1):                                                                  # a lantern on each face
        P["black"].boxc(x, 5.6, zf * 1.55, 0.5, 0.9, 0.2)
        P["glowgold"].boxc(x, 5.6, zf * 1.68, 0.36, 0.7, 0.08)
# the arch: a segmental band between the pylons' inner faces (x = +-11.1), spring at y = 9, crown at 12.4 (inner edge)
SPR, CROWN, CHORD = 9.0, 12.4, 11.1
RR = (CHORD ** 2 + (CROWN - SPR) ** 2) / (2 * (CROWN - SPR))
YC = CROWN - RR
HALFANG = math.asin(CHORD / RR)
def arc_band(r_in, r_out, depth, k=1.0, n=16):
    h = HALFANG * k
    pts = [(r_out * math.sin(-h + 2 * h * i / n), YC + r_out * math.cos(-h + 2 * h * i / n)) for i in range(n + 1)]
    pts += [(r_in * math.sin(h - 2 * h * i / n), YC + r_in * math.cos(h - 2 * h * i / n)) for i in range(n + 1)]
    return pts
P["barn"].poly(arc_band(RR, RR + 1.3, 0.9), -0.45, 0.45)
P["gold"].poly(arc_band(RR - 0.08, RR + 0.02, 1.0, 0.99), -0.5, 0.5)                          # gold on the intrados
P["gold"].poly(arc_band(RR + 1.28, RR + 1.42, 1.0, 0.99), -0.5, 0.5)                           # and the extrados
for zf in (-1, 1):                                                                      # the name board on each face
    a, b = (0.45, 0.5) if zf > 0 else (-0.5, -0.45)
    P["gold"].box(-3.5, 3.5, 12.4, 13.6, a, b)
    c, d = (0.5, 0.55) if zf > 0 else (-0.55, -0.5)
    P["black"].box(-3.4, 3.4, 12.45, 13.55, c, d)

# =====================================================================================================
# dn_fountain
# =====================================================================================================
root = pivot("dn_fountain", (0, 0, 0))
P = parts(root, "dn_fountain", {"money2": 0.02, "money": 0.0, "mint2": 0.03, "mint": 0.03, "gold": 0.02, "glowmint": 0.0})
P["money2"].lath([(12.0, 0.0), (12.0, 0.7), (10.4, 0.7), (10.4, 0.0)], segs=48)           # the planter ring
P["money"].lath([(10.5, 0.72), (11.9, 0.72)], segs=48)                                    # (its turf, a hair above the rim's inside)
P["mint2"].lath([(9.4, 0.0), (9.4, 1.0), (8.7, 1.0), (8.7, 0.1)], segs=48)                # the basin's rim
P["gold"].tor(9.05, 0.07, t=(0, 1.04, 0), n=48, rs=6)                                    # a gold bead along the rim
P["glowmint"].lath([(0.0, 0.8), (8.65, 0.8)], segs=48)                                    # the water
for r in (3.6, 5.2, 6.8):
    P["mint"].tor(r, 0.05, t=(0, 0.84, 0), n=40, rs=5)                                   # ripples
P["mint2"].lath([(0.0, 0.0), (1.7, 0.0), (1.7, 1.3), (1.0, 1.7), (0.7, 3.0)], segs=24)      # the pedestal and its first tier
P["mint"].lath([(0.7, 2.9), (2.6, 3.0), (3.0, 3.5), (2.5, 3.65), (0.6, 3.3)], segs=32)    # the lower bowl
P["mint2"].lath([(0.6, 3.3), (0.45, 4.6), (0.9, 5.0)], segs=16)
P["mint"].lath([(0.5, 4.9), (1.7, 5.0), (1.95, 5.35), (1.6, 5.45), (0.4, 5.25)], segs=24)  # the upper bowl
P["gold"].bm((0, 5.2, 0), (0, 6.6, 0), 0.1)
P["gold"].add(sphere(0.38, 12, 8), t=(0, 6.9, 0))
for i in range(12):                                                                       # a ring of lit jets, arching from the lower bowl into the basin
    a = 2 * PI * i / 12
    P["glowmint"].bm((2.7 * math.sin(a), 3.55, 2.7 * math.cos(a)), (3.9 * math.sin(a), 3.05, 3.9 * math.cos(a)), 0.05)
    P["glowmint"].bm((3.9 * math.sin(a), 3.05, 3.9 * math.cos(a)), (5.0 * math.sin(a), 1.2, 5.0 * math.cos(a)), 0.05)
for i in range(4):                                                                        # four gold spouts on the rim
    a = PI / 4 + i * PI / 2
    P["gold"].cylc(9.0 * math.sin(a), 1.25, 9.0 * math.cos(a), 0.14, 0.5, 8)

# =====================================================================================================
# dn_bay
# =====================================================================================================
root = pivot("dn_bay", (0, 0, 0))
P = parts(root, "dn_bay", {"barn": 0.015, "saddle2": 0.0, "black2": 0.012, "gold": 0.012})
P["barn"].box(-1.1, 1.1, 0.0, 0.14, 0.0, 0.3)                                             # the wheel stop
for sx in (-1, 1):
    P["saddle2"].box(sx * 1.4 - 0.07, sx * 1.4 + 0.07, 0.0, 0.015, 0.0, 5.6)             # the paint lines (brown on the pale paving)
P["saddle2"].box(-1.4, 1.4, 0.0, 0.015, 5.53, 5.6)
P["black2"].box(-0.04, 0.04, 0.0, 0.7, -0.5, -0.42)                                      # a post behind the stop
P["gold"].box(-0.25, 0.25, 0.6, 0.95, -0.42, -0.38)                                      # the number plate (facing +z toward the car)

# =====================================================================================================
# dn_bench
# =====================================================================================================
root = pivot("dn_bench", (0, 0, 0))
P = parts(root, "dn_bench", {"saddle": 0.015, "black2": 0.012, "gold": 0.01})
for i in range(4):
    P["saddle"].box(-1.1, 1.1, 0.42, 0.48, -0.25 + i * 0.13, -0.15 + i * 0.13)           # the seat slats
for i in range(3):
    P["saddle"].boxc(0, 0.62 + i * 0.16, -0.3, 2.2, 0.1, 0.05, rot=(-0.15, 0, 0))       # the back slats, raked
for sx in (-1, 1):
    P["black2"].box(sx * 1.0 - 0.04, sx * 1.0 + 0.04, 0.0, 0.42, -0.25, 0.25)           # legs
    P["black2"].box(sx * 1.0 - 0.04, sx * 1.0 + 0.04, 0.42, 1.0, -0.36, -0.3)
    P["gold"].box(sx * 1.1 - (0.0 if sx > 0 else 0.06), sx * 1.1 + (0.06 if sx > 0 else 0), 0.4, 0.55, -0.27, 0.27)    # end caps

# =====================================================================================================
# dn_planter
# =====================================================================================================
root = pivot("dn_planter", (0, 0, 0))
P = parts(root, "dn_planter", {"money2": 0.02, "gold": 0.012, "money": 0.012})
P["money2"].box(-1.2, 1.2, 0.0, 0.9, -0.5, 0.5)
P["gold"].box(-1.26, 1.26, 0.8, 0.92, -0.56, 0.56)
for i, (x, r) in enumerate(((-0.6, 0.42), (0.1, 0.5), (0.75, 0.36))):
    P["money"].add(sphere(r, 10, 8), t=(x, 0.95, 0.0))

# =====================================================================================================
# dn_festoon
# =====================================================================================================
root = pivot("dn_festoon", (0, 0, 0))
P = parts(root, "dn_festoon", {"black2": 0.0, "glowgold": 0.0})
SAG, SPAN, NB = 2.2, 30.0, 25
cat = lambda x: -SAG * (1 - (x / (SPAN / 2)) ** 2)
P["black2"].path([(-15 + SPAN * i / 40, cat(-15 + SPAN * i / 40), 0) for i in range(41)], 0.03, 4)
for i in range(NB):
    x = -14.4 + i * 1.2
    P["glowgold"].add(sphere(0.1, 8, 6), t=(x, cat(x) - 0.14, 0))

finish_and_export()

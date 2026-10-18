# Chimera Downs' concession stall PROPOSALS for Blender (4.2+ / 5.x), exported to src/assets/downs-stall-proposals.glb: two sets of designs for the stalls rebuilt as part of the arcade's bays
# (not yet in the game: the Asset Row shows them in front of an arcade bay, `downs.stall-proposals`).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_stall_proposals.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_stall_proposals.py
#
# Both sets are authored in an ARCADE WEDGE's frame (tools/blender/build_downs_arcade.py dn_arcade: z = 0 on the walk's edge, +z outward to the back wall, whose inner face is z = 15.27, the floor
# top y = 0.14, x tangential, the bay about 10.2 m wide at z = 9.7 and 10.5 at the back), so a stall stands IN its bay against the back wall instead of in front of it, and the bay's roof is its
# roof. Each is about 10 m wide, 5.9 m deep and 7.2 m tall (the old free-standing stalls were 9.2 x 7.4 x 5.4 m, with a roof of their own). The name is raised lettering, not a painted texture; the
# `accent` slot is the stall's colour (the game picks it per stall). Three names are built of each set to show the range: MOON DOGS, CRATER FRIES and HE-3 FIZZ.
#   dn_stallA_*  SET A, "THE SHOPFRONT": a shop unit in a timber-and-plaster frame: party walls either side, a lit back wall of shelves and jars, a long counter with a panelled front, a striped
#                pitched awning with a scalloped valance and a string of bulbs, a hung menu board, and a tall black sign board across the top with the name in gold.
#   dn_stallB_*  SET B, "THE ALCOVE": a market alcove behind a Mint screen wall with an arched opening, a gold keystone and a name plate above it; inside, a lit tiled niche, a rounded counter,
#                a barrel-vaulted striped hood, pendant lanterns; a blade sign with a lit emblem hangs out from the screen's corner.
DOWNS_OUT = "downs-stall-proposals.glb"
DOWNS_COLL = "MoonDownsStallProposals"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

SLOTS = {"mint": 0.04, "mint2": 0.02, "money2": 0.0, "gold": 0.015, "black": 0.025, "black2": 0.012, "saddle": 0.02, "accent": 0.02, "glasswarm": 0.0, "glowgold": 0.0, "barn": 0.02}
ZB = 15.27           # the bay's back wall, its inner face
FL = 0.14            # the bay's floor top
NAMES = [("moondogs", "MOON DOGS"), ("fries", "CRATER FRIES"), ("fizz", "HE-3 FIZZ")]


def pix_for(label, width):
    return min(0.16, width / (6 * len(label) - 1))


def jars(P, y, z, xs, slot, h=0.5, r=0.17):
    for x in xs:
        P[slot].cylc(x, y + h / 2, z, r, h, 10)
        P["gold"].cylc(x, y + h + 0.03, z, r + 0.02, 0.06, 10)


# =====================================================================================================
# SET A: THE SHOPFRONT
# =====================================================================================================
def stall_a(key, label):
    name = f"dn_stallA_{key}"
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, SLOTS)
    Z0 = 9.5                                                                            # the unit's front
    CT = 1.3                                                                            # the counter's top
    P["mint2"].box(-5.0, 5.0, FL, FL + 0.2, Z0 - 0.1, ZB)                               # a raised timber-edged floor
    for sx in (-1, 1):                                                                  # party walls, capped in gold
        x0, x1 = (4.8, 5.0) if sx > 0 else (-5.0, -4.8)
        P["mint"].box(x0, x1, FL + 0.2, 5.4, Z0 + 0.2, ZB)
        P["gold"].box(x0 - 0.06, x1 + 0.06, 5.4, 5.52, Z0 + 0.12, ZB)
        P["money2"].box(x0 - (0 if sx > 0 else 0.03), x1 + (0.03 if sx > 0 else 0), FL + 0.2, 1.5, Z0 + 0.12, Z0 + 0.2)       # a dado at each end
    # the back wall: a lit panel with shelves and jars (the frame behind the pane, so it shows as a border)
    P["black"].box(-4.5, 4.5, 1.7, 5.0, ZB - 0.05, ZB)
    P["glasswarm"].box(-4.38, 4.38, 1.82, 4.88, ZB - 0.09, ZB - 0.05)
    for y in (2.7, 3.7):
        P["saddle"].box(-4.38, 4.38, y, y + 0.1, ZB - 0.75, ZB - 0.09)
    jars(P, 2.8, ZB - 0.45, [-3.9 + i * 0.98 for i in range(9)], "accent")
    jars(P, 3.8, ZB - 0.45, [-3.4 + i * 1.7 for i in range(5)], "barn", 0.55, 0.2)
    # the counter: a black cabinet with five panels, a Saddle top with a gold nosing, a griddle and a hot tray
    CZ0, CZ1 = 10.4, 11.5
    P["black2"].box(-4.7, 4.7, FL + 0.2, CT - 0.12, CZ0, CZ1)
    for i in range(5):
        P["accent"].box(-4.5 + i * 1.8 + 0.1, -4.5 + i * 1.8 + 1.7, 0.6, 1.1, CZ0 - 0.04, CZ0)
    P["saddle"].box(-4.8, 4.8, CT - 0.12, CT, CZ0 - 0.15, CZ1 + 0.3)
    P["gold"].box(-4.8, 4.8, CT - 0.15, CT - 0.04, CZ0 - 0.2, CZ0 - 0.15)
    P["black2"].box(-3.9, -1.4, CT, CT + 0.28, CZ0 + 0.3, CZ1 + 0.1)                    # the griddle
    P["gold"].box(1.4, 3.9, CT, CT + 0.16, CZ0 + 0.3, CZ1 + 0.1)                        # a hot tray
    for i in range(4):
        P["barn"].box(1.65 + i * 0.6, 1.95 + i * 0.6, CT + 0.16, CT + 0.4, CZ0 + 0.5, CZ1 - 0.1)
    # a hung menu board, lit
    for sx in (-1, 1):
        P["black2"].bm((sx * 2.2, 4.25, 11.5), (sx * 2.2, 3.55, 11.5), 0.03)
    P["black"].box(-2.4, 2.4, 2.75, 3.6, 11.42, 11.5)
    for j in range(3):
        P["glowgold"].box(-2.1, 2.1 - j * 0.7, 2.9 + j * 0.22, 3.0 + j * 0.22, 11.38, 11.42)
    # the awning: nine striped boards pitched down toward the walk, a scalloped valance, a gold lip and a string of bulbs
    YF, YB, ZF = 4.1, 5.4, 9.5
    ang = -math.atan2(YB - YF, ZB - ZF)
    L = math.hypot(ZB - ZF, YB - YF)
    for i in range(10):
        c = P["accent"] if i % 2 == 0 else P["mint"]
        c.boxc(-4.5 + i * 1.0 + 0.0, (YF + YB) / 2 + 0.05, (ZF + ZB) / 2, 0.98, 0.1, L, rot=(ang, 0, 0))
        P["accent" if i % 2 == 0 else "mint"].poly([(-0.5, 0), (0.5, 0), (0, -0.45)], ZF - 0.06, ZF + 0.06, t=(-4.5 + i * 1.0, YF - 0.12, 0))
    P["gold"].box(-5.0, 5.0, YF - 0.12, YF - 0.02, ZF - 0.12, ZF + 0.12)
    for i in range(11):
        P["glowgold"].add(sphere(0.075, 6, 4), t=(-5.0 + i * 1.0, YF - 0.2, ZF - 0.14))
    # the sign: a black board across the top with a gold frame and the name in raised gold letters
    P["black"].box(-4.7, 4.7, 5.6, 7.2, ZB - 0.16, ZB - 0.04)
    P["gold"].box(-4.82, 4.82, 5.52, 5.6, ZB - 0.2, ZB - 0.02)
    P["gold"].box(-4.82, 4.82, 7.2, 7.32, ZB - 0.2, ZB - 0.02)
    P["gold"].letters(label, 0, 6.4, ZB - 0.16, pix_for(label, 9.0), 0.07, ry=math.pi)
    for sx in (-1, 1):                                                                  # lit sconces at the sign's ends
        P["glowgold"].box(sx * 4.95 - 0.08, sx * 4.95 + 0.08, 6.2, 6.6, ZB - 0.3, ZB - 0.2)
    return P


# =====================================================================================================
# SET B: THE ALCOVE
# =====================================================================================================
def stall_b(key, label):
    name = f"dn_stallB_{key}"
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, SLOTS)
    ZS = 11.6                                                                           # the screen wall's front face
    ZT = ZS + 0.5                                                                       # (it is 0.5 m thick)
    CT = 1.3
    SPR, CRN, HC = 4.0, 5.6, 4.3                                                        # the arch: spring, crown, half-chord
    RR = (HC ** 2 + (CRN - SPR) ** 2) / (2 * (CRN - SPR))
    YC = CRN - RR
    P["mint2"].box(-5.0, 5.0, FL, FL + 0.2, ZS - 0.1, ZB)                               # a raised floor
    # the screen wall: Mint, an arched opening, a gold arch band and keystone, a Black name plate above with raised letters
    pts = [(-5.0, SPR)]
    n = 28
    for i in range(n + 1):
        x = -HC + 2 * HC * i / n
        pts.append((x, YC + math.sqrt(RR * RR - x * x)))
    pts += [(5.0, SPR), (5.0, 7.7), (-5.0, 7.7)]
    P["mint"].poly(pts, ZS, ZT)
    for sx in (-1, 1):
        x0, x1 = (HC, 5.0) if sx > 0 else (-5.0, -HC)
        P["mint"].box(x0, x1, FL + 0.2, SPR, ZS, ZT)                                    # the piers
        P["gold"].box(x0 - 0.04, x1 + 0.04, SPR - 0.01, SPR + 0.16, ZS - 0.06, ZT + 0.02)    # their capitals
        P["money2"].box(x0, x1, FL + 0.2, 1.3, ZS - 0.05, ZS)                           # a tiled dado on each
    ring_o = [(( RR + 0.12) * math.sin(-math.asin(HC / RR) + 2 * math.asin(HC / RR) * i / n), YC + (RR + 0.12) * math.cos(-math.asin(HC / RR) + 2 * math.asin(HC / RR) * i / n)) for i in range(n + 1)]
    ring_i = [(( RR - 0.02) * math.sin(math.asin(HC / RR) - 2 * math.asin(HC / RR) * i / n), YC + (RR - 0.02) * math.cos(math.asin(HC / RR) - 2 * math.asin(HC / RR) * i / n)) for i in range(n + 1)]
    P["gold"].poly(ring_o + ring_i, ZS - 0.06, ZS - 0.01)                               # a gold band round the opening, proud of the screen
    P["gold"].box(-0.4, 0.4, CRN + 0.05, CRN + 0.5, ZS - 0.12, ZS - 0.01)               # the keystone
    P["black"].box(-4.6, 4.6, 6.2, 7.4, ZS - 0.1, ZS - 0.01)                            # the name plate
    P["gold"].box(-4.72, 4.72, 6.12, 6.2, ZS - 0.13, ZS - 0.005)
    P["gold"].box(-4.72, 4.72, 7.4, 7.5, ZS - 0.13, ZS - 0.005)
    P["gold"].letters(label, 0, 6.8, ZS - 0.1, pix_for(label, 8.8), 0.07, ry=math.pi)
    # the alcove: side walls and a roof, a lit tiled niche on the back wall with shelves and jars
    for sx in (-1, 1):
        x0, x1 = (4.8, 5.0) if sx > 0 else (-5.0, -4.8)
        P["mint"].box(x0, x1, FL + 0.2, 7.7, ZT, ZB)
    P["mint2"].box(-5.0, 5.0, 7.7, 7.9, ZS - 0.04, ZB)                                   # the roof over it all
    P["gold"].box(-5.06, 5.06, 7.9, 8.02, ZS - 0.08, ZB)
    P["money2"].box(-4.8, 4.8, FL + 0.2, 1.9, ZB - 0.1, ZB)                             # tiles up the back wall
    P["gold"].box(-4.8, 4.8, 1.9, 2.0, ZB - 0.14, ZB)
    P["black"].box(-4.4, 4.4, 2.2, 5.6, ZB - 0.05, ZB)
    P["glasswarm"].box(-4.28, 4.28, 2.32, 5.48, ZB - 0.09, ZB - 0.05)
    for y in (3.2, 4.3):
        P["saddle"].box(-4.28, 4.28, y, y + 0.1, ZB - 0.8, ZB - 0.09)
    jars(P, 3.3, ZB - 0.45, [-3.7 + i * 1.06 for i in range(8)], "accent")
    jars(P, 4.4, ZB - 0.45, [-3.2 + i * 1.6 for i in range(5)], "barn", 0.55, 0.2)
    # the counter: a rounded bar, its ends round in the accent colour, a Saddle top with a gold nosing
    CZ0, CZ1 = 12.3, 13.4
    P["black2"].box(-3.7, 3.7, FL + 0.2, CT - 0.12, CZ0, CZ1)
    for sx in (-1, 1):
        P["accent"].cylc(sx * 3.7, (FL + 0.2 + CT - 0.12) / 2, (CZ0 + CZ1) / 2, (CZ1 - CZ0) / 2, CT - 0.12 - FL - 0.2 - 0.04, 16)
        P["saddle"].cylc(sx * 3.7, CT - 0.06, (CZ0 + CZ1) / 2, (CZ1 - CZ0) / 2 + 0.12, 0.12, 16)
    P["saddle"].box(-3.7, 3.7, CT - 0.12, CT, CZ0 - 0.12, CZ1 + 0.12)
    P["gold"].box(-3.7, 3.7, CT - 0.15, CT - 0.04, CZ0 - 0.17, CZ0 - 0.12)
    for i in range(7):
        P["accent"].box(-3.5 + i * 1.0 + 0.1, -3.5 + i * 1.0 + 0.9, 0.55, 1.0, CZ0 - 0.04, CZ0)
    P["black2"].box(-3.2, -1.0, CT, CT + 0.28, CZ0 + 0.25, CZ1 - 0.1)                   # a machine on the bar
    P["gold"].box(1.0, 3.2, CT, CT + 0.16, CZ0 + 0.25, CZ1 - 0.1)                       # a hot tray
    # the hood: a barrel vault of striped boards over the bar, spanning z 11.4 to 15, its springing 3.2 m up
    CZc, R1, R2, Y0 = 13.2, 1.8, 1.92, 3.3
    for i in range(9):
        x0 = -4.5 + i * 1.0 + 0.01
        prof = [(CZc + R2 * math.cos(math.pi * k / 12), Y0 + R2 * math.sin(math.pi * k / 12)) for k in range(13)] + [(CZc + R1 * math.cos(math.pi * (12 - k) / 12), Y0 + R1 * math.sin(math.pi * (12 - k) / 12)) for k in range(13)]
        (P["accent"] if i % 2 == 0 else P["mint"]).polyx(prof, x0, x0 + 0.98)
    # (the vault's front edge: a gold lip, and a row of bulbs)
    P["gold"].box(-4.5, 4.5, Y0 - 0.02, Y0 + 0.1, CZc - R2 - 0.04, CZc - R2 + 0.12)
    for i in range(9):
        P["glowgold"].add(sphere(0.075, 6, 4), t=(-4.0 + i * 1.0, Y0 - 0.1, CZc - R1 + 0.02))
    # pendant lanterns inside the niche
    for x in (-2.6, 2.6):
        P["black2"].bm((x, 5.0, 14.2), (x, 4.2, 14.2), 0.03)
        P["glowgold"].add(sphere(0.24, 10, 8), t=(x, 4.0, 14.2))
        P["gold"].cylc(x, 4.28, 14.2, 0.14, 0.1, 10)
    # the blade sign: a bracket out from the screen's front corner, a black plate with a gold ring and a lit emblem, lettered on both faces (the first word)
    BX = 4.55
    P["black2"].bm((BX, 5.6, ZS - 0.01), (BX, 5.6, ZS - 1.7), 0.05)
    P["black2"].bm((BX, 5.3, ZS - 0.01), (BX, 5.6, ZS - 1.2), 0.04)
    P["black"].box(BX - 0.07, BX + 0.07, 4.5, 5.55, ZS - 1.7, ZS - 0.5)
    P["gold"].box(BX - 0.1, BX + 0.1, 4.45, 4.5, ZS - 1.75, ZS - 0.45)
    P["gold"].box(BX - 0.1, BX + 0.1, 5.55, 5.6, ZS - 1.75, ZS - 0.45)
    P["glowgold"].cylc(BX, 5.02, ZS - 1.1, 0.34, 0.3, 14, rot=(0, 0, math.pi / 2))
    return P


for key, label in NAMES:
    stall_a(key, label)
    stall_b(key, label)

finish_and_export()

# Chimera Downs' concession stalls for Blender (4.2+ / 5.x), exported to src/assets/downs-stalls.glb (docs/downs-layouts.md: twenty stalls in the two arcades).
#
# In Blender's Python console or via MCP:   exec(open(r"<repo>/tools/blender/build_downs_stalls.py").read())
# or headless, with the bpy module:         MOONRUNNER_REPO=<repo> python3 build_downs_stalls.py
#
# Twelve stalls on one kit, each authored with its front toward +z, the origin on the ground at the middle of the front, the body behind it (to z = -7.2): a Mint body 8.6 m wide and
# 3.4 m tall, a Saddle Brown counter with a front panel, a lit service hatch, a pitched awning in the `accent` slot (the game picks its colour per stall) striped with Mint, a lantern
# roof, a Black name board (the game writes the name on it, facing +z, at y 4.65) and the stall's own props on the counter (top at y 1.17).
#   dn_stall_0  MOON DOGS      a roller grill of sausages, buns, mustard and ketchup
#   dn_stall_1  CRATER FRIES   two fryer baskets and a rack of paper cones
#   dn_stall_2  HE-3 FIZZ      a soda fountain: a row of taps over a drip tray, tall lit glasses
#   dn_stall_3  CHIMERA CHOW   a big pot with a ladle, a stack of bowls
#   dn_stall_4  ROCK CANDY     rows of jars of rock candy
#   dn_stall_5  TOTE BETS      a tote screen, three betting terminals and a brass grille
#   dn_stall_6  SPACE SLUSH    three slush machines
#   dn_stall_7  LUNAR COFFEE   an espresso machine, two urns and a tower of cups
#   dn_stall_8  DERBY DONUTS   a rack of donuts on pegs
#   dn_stall_9  JOCKEY'S GRILL a grill with a chimney, a rack of steaks
#   dn_stall_10 FOAM FINGERS   a pegboard of foam fingers and caps, a shelf of programmes
#   dn_stall_11 RAIL BAR       a back bar of bottles, barrels with taps
DOWNS_OUT = "downs-stalls.glb"
DOWNS_COLL = "MoonDownsStalls"
import os
exec(open(os.path.join(os.environ.get("MOONRUNNER_REPO") or os.path.abspath(os.path.join(os.path.dirname(globals().get("__file__", "")), "..", "..")), "tools", "blender", "downs_common.py"), encoding="utf-8").read(), globals())

SLOTS = {"mint": 0.05, "mint2": 0.02, "money2": 0.0, "gold": 0.015, "black": 0.025, "black2": 0.012, "saddle": 0.02, "saddle2": 0.012, "accent": 0.02, "glasswarm": 0.0, "glowgold": 0.0, "glowmint": 0.0, "barn": 0.012, "money": 0.012}
CT = 1.17          # the counter's top


def base(name):
    root = pivot(name, (0, 0, 0))
    P = parts(root, name, SLOTS)
    P["mint2"].box(-4.4, 4.4, 0.0, 0.2, -7.4, 0.6)                                      # a plinth under the whole stall
    P["mint"].box(-4.3, 4.3, 0.2, 3.4, -7.2, -0.6)                                      # the body
    for sx in (-1, 1):
        x0, x1 = (sx * 4.3 - 0.3, sx * 4.3 + 0.04) if sx > 0 else (sx * 4.3 - 0.04, sx * 4.3 + 0.3)
        P["money2"].box(x0, x1, 0.25, 3.5, -0.62, -0.44)                                 # a pilaster at each corner of the front
    P["black"].box(-3.55, 3.55, 1.4, 3.1, -0.6, -0.56)                                  # the hatch's frame (behind its pane, so it shows as a border)
    P["glasswarm"].box(-3.4, 3.4, 1.5, 3.0, -0.56, -0.52)                               # the lit service hatch
    for x in (-1.7, 0.0, 1.7):
        P["black"].box(x - 0.04, x + 0.04, 1.5, 3.0, -0.52, -0.48)                      # mullions
    P["saddle"].box(-4.5, 4.5, CT - 0.12, CT, -0.5, 0.9)                                # the counter's top, proud of the front
    P["black2"].box(-4.4, 4.4, 0.2, CT - 0.12, -0.6, 0.82)                              # the counter's cabinet
    P["gold"].box(-4.5, 4.5, CT - 0.12, CT - 0.04, 0.9, 0.96)                           # a gold nosing
    P["accent"].box(-4.4, 4.4, 0.45, 0.7, 0.82, 0.88)                                   # a stripe along the cabinet
    for i in range(9):                                                                  # the awning: nine boards, accent and Mint, pitched down toward the customer
        c = P["accent"] if i % 2 == 0 else P["mint"]
        c.boxc(-4.0 + i * 1.0, 3.5, 0.4, 0.98, 0.1, 2.3, rot=(0.3, 0, 0))
    P["accent"].box(-4.5, 4.5, 2.55, 3.0, 1.38, 1.46)                                   # its valance
    P["gold"].box(-4.52, 4.52, 2.5, 2.56, 1.37, 1.47)
    P["black"].box(-4.0, 4.0, 3.9, 5.3, -0.8, -0.52)                                    # the name board, 8 x 1.4 (the game's text sits at z = -0.5, y 4.65)
    P["gold"].box(-4.1, 4.1, 5.3, 5.42, -0.86, -0.46)
    P["gold"].box(-4.1, 4.1, 3.84, 3.9, -0.86, -0.46)
    for sx in (-1, 1):
        P["black2"].bm((sx * 3.8, 3.5, -0.65), (sx * 3.8, 3.95, -0.65), 0.07)           # its two posts
    P["mint2"].box(-4.5, 4.5, 3.4, 3.65, -7.4, -0.4)                                    # the roof
    P["accent"].box(-4.55, 4.55, 3.62, 3.75, -7.45, -0.34)
    P["black2"].box(-1.0, 1.0, 3.75, 4.35, -4.6, -3.4)                                  # the lantern: a small hip on the roof
    P["glowgold"].box(-0.8, 0.8, 3.9, 4.2, -4.64, -4.6)
    P["glowgold"].box(-0.8, 0.8, 3.9, 4.2, -3.4, -3.36)
    P["black"].box(-0.5, 0.5, 4.35, 4.45, -4.4, -3.6)
    return P


def jar(P, x, y, z, r, h, slot):
    P[slot].cylc(x, y + h / 2, z, r, h, 10)


# ---- 0: MOON DOGS ----
P = base("dn_stall_0")
P["black2"].box(-2.8, 0.8, CT, CT + 0.14, 0.0, 0.6)                                     # the roller grill: a tray, four rollers, sausages
for i in range(4):
    P["saddle2"].cylc(-2.4 + i * 0.7, CT + 0.3, 0.3, 0.12, 1.2, 8, rot=(0, 0, PI / 2))
P["black"].box(-3.0, 1.0, CT + 0.14, CT + 0.2, 0.0, 0.1)
for i in range(3):                                                                      # buns, stacked
    P["saddle"].boxc(1.9, CT + 0.14 + i * 0.22, 0.35, 0.9, 0.2, 0.5)
P["gold"].cylc(3.0, CT + 0.35, 0.3, 0.1, 0.5, 8)                                        # mustard
P["barn"].cylc(3.4, CT + 0.35, 0.3, 0.1, 0.5, 8)                                        # ketchup
P["gold"].cylc(3.0, CT + 0.62, 0.3, 0.04, 0.12, 8)
# ---- 1: CRATER FRIES ----
P = base("dn_stall_1")
for x in (-2.8, -1.6):
    P["black2"].box(x - 0.5, x + 0.5, CT, CT + 0.7, 0.0, 0.7)                           # a fryer
    P["glowgold"].box(x - 0.4, x + 0.4, CT + 0.7, CT + 0.76, 0.1, 0.6)                  # lit oil
    P["black"].bm((x + 0.4, CT + 0.7, 0.35), (x + 0.4, CT + 1.3, 0.8), 0.04)            # a basket handle
for i in range(5):                                                                      # a rack of paper cones with fries
    x = 0.4 + i * 0.8
    P["mint"].cylc(x, CT + 0.4, 0.3, 0.05, 0.6, 8, rt=0.26)
    P["gold"].cylc(x, CT + 0.82, 0.3, 0.2, 0.16, 8)
# ---- 2: HE-3 FIZZ ----
P = base("dn_stall_2")
P["black2"].box(-3.2, 0.2, CT, CT + 0.12, 0.0, 0.7)                                     # drip tray
P["black"].box(-3.0, 0.0, CT + 0.12, CT + 1.4, -0.3, 0.1)                               # the font
for i in range(5):
    P["gold"].cylc(-2.7 + i * 0.6, CT + 1.05, 0.2, 0.06, 0.3, 8, rot=(PI / 2, 0, 0))    # taps
P["gold"].box(-3.05, 0.05, CT + 1.4, CT + 1.52, -0.35, 0.15)
for i in range(4):
    P["glowmint"].cylc(1.0 + i * 0.6, CT + 0.45, 0.3, 0.17, 0.9, 10)                    # tall glasses, lit
    P["accent"].cylc(1.0 + i * 0.6, CT + 0.95, 0.3, 0.19, 0.1, 10)
# ---- 3: CHIMERA CHOW ----
P = base("dn_stall_3")
P["black"].cylc(-1.8, CT + 0.55, 0.2, 0.75, 1.1, 14, rt=0.6)                            # a big pot
P["saddle2"].cylc(-1.8, CT + 1.1, 0.2, 0.62, 0.06, 14)
P["black2"].bm((-1.0, CT + 1.4, 0.2), (-0.3, CT + 0.7, 0.45), 0.05)                     # the ladle
P["black2"].add(sphere(0.14, 8, 6), t=(-0.3, CT + 0.66, 0.45))
for i in range(5):
    P["mint"].cylc(1.6, CT + 0.12 + i * 0.16, 0.3, 0.42, 0.14, 12, rt=0.3)             # a stack of bowls
for i in range(3):
    P["money2"].cylc(2.9, CT + 0.12 + i * 0.16, 0.3, 0.42, 0.14, 12, rt=0.3)
# ---- 4: ROCK CANDY ----
P = base("dn_stall_4")
for r in range(2):
    for i in range(7):
        x = -3.0 + i * 1.0
        P["glasswarm"].cylc(x, CT + 0.35 + r * 0.9, 0.35, 0.26, 0.7, 10)
        (P["accent"] if (i + r) % 2 == 0 else P["gold"]).cylc(x, CT + 0.22 + r * 0.9, 0.35, 0.2, 0.4, 7)
        P["gold"].cylc(x, CT + 0.74 + r * 0.9, 0.35, 0.28, 0.07, 10)
# ---- 5: TOTE · BETS ----
P = base("dn_stall_5")
P["black"].box(-1.4, 1.4, CT + 0.6, CT + 2.0, -0.4, -0.2)                               # the tote screen
P["glowgold"].box(-1.25, 1.25, CT + 0.75, CT + 1.85, -0.2, -0.18)
for x in (-3.0, -2.2, 2.2, 3.0):
    P["black2"].box(x - 0.3, x + 0.3, CT, CT + 0.55, 0.0, 0.6)                          # terminals
    P["glowmint"].box(x - 0.24, x + 0.24, CT + 0.3, CT + 0.5, 0.6, 0.62)
for i in range(6):
    P["gold"].box(-0.9 + i * 0.36 - 0.02, -0.9 + i * 0.36 + 0.02, CT, CT + 0.55, 0.5, 0.54)    # a brass grille
# ---- 6: SPACE SLUSH ----
P = base("dn_stall_6")
for i, s in enumerate(("barn", "gold", "money")):
    x = -2.4 + i * 1.6
    P["black2"].box(x - 0.55, x + 0.55, CT, CT + 0.35, 0.0, 0.7)
    P["glowmint"].cylc(x, CT + 0.95, 0.35, 0.5, 1.2, 14)                                # a lit tank
    P[s].cylc(x, CT + 1.6, 0.35, 0.52, 0.12, 14)
    P["gold"].cylc(x, CT + 0.2, 0.7, 0.05, 0.3, 8, rot=(PI / 2, 0, 0))                  # tap
P["accent"].cylc(3.1, CT + 0.3, 0.3, 0.22, 0.6, 10)
# ---- 7: LUNAR COFFEE ----
P = base("dn_stall_7")
P["gold"].box(-3.2, -1.2, CT, CT + 0.9, -0.2, 0.5)                                      # the espresso machine
P["black2"].box(-3.0, -1.4, CT + 0.9, CT + 1.05, -0.2, 0.5)
for x in (-2.7, -1.7):
    P["black"].cylc(x, CT + 0.45, 0.55, 0.05, 0.3, 8)
for x in (0.0, 1.0):
    P["saddle2"].cylc(x, CT + 0.7, 0.2, 0.4, 1.4, 12)                                   # urns
    P["gold"].cylc(x, CT + 1.45, 0.2, 0.2, 0.1, 10)
    P["black"].cylc(x, CT + 0.45, 0.6, 0.04, 0.3, 8, rot=(PI / 2, 0, 0))
for i in range(6):
    P["mint"].cylc(2.6, CT + 0.1 + i * 0.14, 0.4, 0.28, 0.13, 10, rt=0.24)              # a tower of cups
# ---- 8: DERBY DONUTS ----
P = base("dn_stall_8")
P["saddle2"].box(-3.0, 3.0, CT, CT + 0.1, 0.0, 0.6)
for r in range(3):
    for i in range(6):
        x = -2.5 + i * 1.0
        P["saddle"].tor(0.2, 0.08, t=(x, CT + 0.35 + r * 0.45, 0.3 - 0.0), rot=(PI / 2, 0, 0), n=14, rs=6)
        if (i + r) % 2:
            P["mint"].tor(0.19, 0.04, t=(x, CT + 0.41 + r * 0.45, 0.3), rot=(PI / 2, 0, 0), n=14, rs=5)
    P["black2"].box(-3.0, 3.0, CT + 0.2 + r * 0.45, CT + 0.24 + r * 0.45, 0.0, 0.5)
# ---- 9: JOCKEY'S GRILL ----
P = base("dn_stall_9")
P["black"].box(-3.2, -0.4, CT, CT + 0.7, 0.0, 0.8)                                      # the grill
P["glowgold"].box(-3.0, -0.6, CT + 0.7, CT + 0.74, 0.1, 0.7)
P["black2"].cylc(-3.0, CT + 1.6, -0.3, 0.2, 1.8, 8)                                     # a chimney
for i in range(4):
    P["barn"].boxc(0.4 + i * 0.6, CT + 0.15, 0.4, 0.5, 0.1, 0.35, rot=(0, 0.25, 0))     # steaks on a rack
P["accent"].cylc(3.3, CT + 0.35, 0.4, 0.16, 0.7, 8)
# ---- 10: FOAM FINGERS ----
P = base("dn_stall_10")
P["saddle"].box(-3.3, 3.3, 1.85, 3.15, -0.62, -0.54)                                    # a pegboard on the hatch's glass
for i in range(6):
    x = -2.6 + i * 1.04
    P["gold"].cylc(x, 2.5, -0.45, 0.02, 0.9, 7, rt=0.18)
    P["accent"].cylc(x, 2.05, -0.45, 0.05, 0.3, 7)
for i in range(4):
    P["barn"].cylc(-2.7 + i * 0.9, CT + 0.15, 0.3, 0.3, 0.26, 12, rt=0.2)               # caps on the counter
    P["black2"].boxc(-2.7 + i * 0.9, CT + 0.3, 0.6, 0.4, 0.04, 0.2)
P["mint"].box(1.4, 3.6, CT, CT + 0.6, 0.0, 0.5)                                         # a stack of programmes
P["accent"].box(1.38, 3.62, CT + 0.38, CT + 0.48, -0.02, 0.52)
# ---- 11: RAIL BAR ----
P = base("dn_stall_11")
for r in range(2):
    P["black2"].box(-3.35, 3.35, 1.7 + r * 0.7, 1.76 + r * 0.7, -0.64, -0.3)              # shelves
    for i in range(12):
        s = ("accent", "gold", "money", "barn", "glowmint")[(i + r) % 5]
        P[s].cylc(-3.1 + i * 0.56, 1.76 + r * 0.7 + 0.25, -0.46, 0.09, 0.5, 8)          # bottles
for x in (-2.6, 2.6):
    P["saddle2"].cylc(x, CT + 0.45, 0.3, 0.5, 0.9, 12, rt=0.44)                         # barrels
    P["gold"].cylc(x, CT + 0.95, 0.3, 0.46, 0.06, 12)
    P["gold"].cylc(x, CT + 0.45, 0.8, 0.04, 0.25, 8, rot=(PI / 2, 0, 0))
P["black2"].box(-0.9, 0.9, CT, CT + 0.12, 0.0, 0.6)

finish_and_export()

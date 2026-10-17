# The Lucky Crater Casino's forecourt: the Valet Court (proposal)

Status: a proposal, nothing of it is built. The numbers come from `tools/casino-forecourt.mjs` (`node tools/casino-forecourt.mjs docs` redraws the two plans, which are
`docs/casino-forecourt-current.svg` and `docs/casino-forecourt-proposed.svg`; the same run checks the proposed spacing and exits non-zero if it breaks).
The frame is the casino's: x across, z out from the doors' wall (its outer face is z 16.4). The fountain plaza is at z 98 (radius 17).

## What stands there today

- **The boulevard:** asphalt from the doors (z 16.4) the whole 65 m to the plaza, 17 m wide at the doors and 15 m after z 44, with a gold edge line, a red carpet on it for the first 36 m, and
  three pairs of neon lamp posts (`lamp_post` from `casino.glb`) at z 50, 61 and 72.
- **Two car parks** (`dressCasinoLot` in `src/settlements.js`): 44 x 34 m rectangles centred at x = +/-52, z 70, **22 m clear of the boulevard**, each with 16 bays (about 12 cars), a cream curb,
  a flat-colour **hedge** on three sides, a flat blue P sign and two **old thin lamp poles** (`k.lamp`).
- The slot carousels stand at x +/-19.5, z 40; chip stacks at (+/-14, 21.4), (-27, 44), (27, 46) (the last two touch the carousels' plinths).

## The proposal

**One court, one walkway.** The asphalt now ends halfway between the fountain and the doors (z 58; the doors are at 16.4 and the fountain at 98, so the middle is 57). From there to the plaza the
boulevard is a **paved walkway**, 10 m wide, with the red carpet running on down its middle the whole way from the doors to the fountain.

| Part | Where (x, z) | What |
|---|---|---|
| Avenue | x +/-8.6, z 16.4..58 | the asphalt that meets the gate (the same width as the entrance flare), carpet and ropes down it, lamp pairs at z 25 and 36 |
| Wings | x +/-8.6..41.6, z 39.6..58 | two rows of six 5 x 5 m bays either side of a 6 m aisle: **24 bays** (it was 32), the aisle open to the outside at each end |
| Walkway | x +/-5.2, z 58..81 | cream-and-plum paving with gold edge lines and a chip inlay every 6 m; lamp pairs at z 63 and 72 (x +/-7.2); chip-stack bollards every 3 m at x +/-5.6 |
| Crossing | z 56..58 | a card-stripe crossing (gold and plum) where the court gives way to the walkway |
| Carousels | x +/-19.5, **z 29.5** (10 m nearer the doors) | so the wings sit behind them with 2.5 m between |
| Chip stacks | (+/-11, 20.6) and (+/-45, 61) | the doors' pair clear of the carousels; the other pair marks each wing's outer corner |

**Barrier (the hedges are cut).** A low **card wall** edges the wings: giant playing cards stand on a plum kerb with a gold cap, dominoed (each leaning 6 degrees on the last), suits alternating, 1.2 m high, 0.6 m thick;
it is a collider for the player and a visual edge for the cars. The walkway is edged by **chip-stack bollards** (stacked poker chips in the casino's colours, a cyan glow ring on top).

**Lamps.** Every lamp is the casino's neon post (`lamp_post`, scaled 0.92 as on the boulevard now): 4 at each wing's corners (on the kerb outside the wall), 2 on the avenue and 2 on the walkway per side:
16 in all, and the two old thin poles per lot are gone.

**Spacing, checked by the script:** carousels to wings 2.5 m or more, bays to the card wall 0.6 m, lamp posts to bays 0.5 m or more, bollards and lamps 1.5 m clear of each other, chip stacks 1.5 m or more clear of the carousels.

## What gets remodelled in Blender (`tools/blender/build_lot.py` -> `src/assets/lot.glb`)

1. `lot_card_wall`: a 2.4 m module (four cards dominoed on a plum kerb with a gold cap; one material per slot, a suit on each face from `suits.py`), so a run is the module repeated.
2. `lot_kerb`: plum and gold kerb runs (4 m straight, an outside corner, an end cap) in place of the cream curb.
3. `lot_chip_bollard`: the walkway bollard (0.45 m radius, 1 m tall: eight chips in four colours, a glowing ring).
4. `lot_pylon_p`: the P sign as a neon pylon (plum post, brass frame, a lit P in the casino's lettering and a suit finial) in place of the flat blue plate.
5. `lot_bay_stud`: a half-chip stud that marks each bay's head, instead of the flat gold bar.
6. The parked hover-cars keep their model (`makeCar`), re-tinted from the casino's palette, each with a faint cyan glow under it.

Each is checked by `audit_coplanar` (no two faces on one plane), gets an Asset Row item, and is baked into the static world the way the hall's kit is.

## What changes in the game if this is approved

- `dressCasinoLot`: the boulevard's asphalt stops at z 58; the walkway, crossing, bollards and wings are added; the car parks, their hedges and `k.lamp` poles go; the carpet runs on to the plaza.
- `casinoWorld.js`: the carousels' `cz` from `FRONT_OUT + 23.6` to 29.5 and the chip stacks' places; the yard spots (patrons) follow because they are computed from those numbers.
- Open question for you: **where do cars come from?** The lot's two outer ends are open, so a road could be joined to either; today nothing connects to the lots, and the plan assumes the same.

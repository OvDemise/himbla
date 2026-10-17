# Winch hand-off: the cable and thin structures (Lucky Crater Casino sign post)

For a fresh session picking up the Hitch-Line winch (`src/winch.js`). Read `CLAUDE.md` first (conventions: CHANGELOG entry with every
commit, README source map in step, no PRs unless asked, commit and push to the branch the session names, which was
`claude/magical-brown-8csbeq`). This note says what the user reported, what was found and changed, what is still open, and how to reproduce.

## What the user reported

1. (Earlier, done) The cable snagged too often, then a small teleport when it bumped the player round an edge. Fixed over several commits
   (`5bb3d5f` .. `93b337e`); the user said it "feels much, much better".
2. **Targeting** (done, commit `4c75046`): the reticle should outweigh distance. See "Targeting" below.
3. **The cable passes through a structure that is not its target.** The user's words: "if I were to winch to the center of the poker chip
   fountain at Lucky Crater Casino and wrap myself around the sign, the cable would just phase through the sign post." They sent a still (the
   player on the road by the casino sign, the cable running from them to the right-hand post and on to the fountain, drawn through the post)
   and a 13 s screen recording: the player runs up the road toward the casino, hooks the fountain (reticle bracket reads about 70 m), is
   reeled along the road toward the pylon sign and the cable is drawn through its right-hand post. The recording is not in the repo (it was an
   upload to the earlier session); the next session can ask the user for it again if it needs it.

The user has **not yet confirmed** that the fix below cures what they saw in the game.

## The sign

`dressCasinoLot` in `src/settlements.js` (about line 2413): "the pylon sign out by the road". At the casino's local (26, 118), turned -0.35 rad:
two posts (`k.box(1.2, 23, 1.2 ...)` with colliders `k.solid(0.6, 11.5, 0.6, ...)`: half extents 0.6 x 11.5 x 0.6, at +-6.6 m from the
sign's middle) and a marquee/board between them (collider half extents 6.2 x 5.6 x 0.7, centre 10.2 + 5.6 = 15.8 m up). Under the board
(y < 10 m) the gap between the posts is open; people and the cable can pass through it. The chip fountain is at the casino's local (0, 98),
the plaza's middle (`FZ = 98`, `PR = 17`).

## Cause found and fixed (commit `f31fe59`)

In `tendWrapsIn` the cable gave up on a structure (`o.ignore.add(hit.c)`: from then on `blocker()` skips it, so the cable is drawn
straight through) once `o.bends.get(hit.c) >= 4` for a box. That count was cumulative over the whole ride and never went down when a bend
unwound, and **four is exactly one lap of a post's corners** (the wrap points stand at the four corners, +-0.9 m). So winding once round a
post made the winch ignore it. Reproduced in the real casino lot (see "Repro"): at 4.1 s the fourth bend set the ignore, 11 frames later the
cable ran through the post.

Changes in `src/winch.js`:

- `BOX_BENDS = 12`: a box is now counted by the bend points it holds *now* (`o.grp` entries equal to it), capped at 12 (three laps). Cylinders and
  spheres keep the old cumulative count of 2 (their bends are arcs, many points each).
- Bends are checked **every frame once the cable has any** (`o.wT = o.wraps.length ? 0 : WRAP_EVERY`) instead of at 20 Hz: at 15 m/s you cover
  0.75 m between 20 Hz checks, so the leg from you to the last bend ran through the post for those frames. `tendWraps(o, el)` takes the elapsed
  time, and the unwrap hold (`UNWRAP_HOLD`, 0.2 s) counts it (`o.free[k] += el`), so it still takes 0.2 s however often it runs. Cost measured at
  0.086 ms per `update`.
- Result in the repro: no give-up on the post; frames of cable through the post fell from 5 to 11 to 2 to 5 per run.

## Still open

1. **A fifth bend ends in a fling and a snap (in the repro).** With the player pulled round the post at about 1.3 m radius and 13 to 18 m/s,
   the cable coils round all four corners and starts a second lap; at the fifth bend (about 4.1 s in) the body is moved by 1 to 2 m a frame
   away from the post (velocity stays near 12 m/s, so it is a **position correction by the winch**, not the velocity) and `update` ends the
   ride at `len > RANGE * 1.6` ("The line snapped!") with the player 150 to 200 m from the hook. Look at the length correction in `update`
   (`LEAD`, the "length corrections" eased in `93b337e`) when the path length jumps as bends are added: the path with five wraps may exceed
   `o.len`, and the correction then drags the body along the path. I did not confirm whether the real player (with its collision push-out and
   skater physics) does this; the repro's stand-in physics is crude (it pushes the body out of the post boxes with a 0.7 m radius and keeps no
   gravity). Reproducing it with the real player (teleport near the sign, hook the fountain by aiming, hold Z and steer) would settle it.
2. **A few frames of cable inside the post remain** while you are rounding a post faster than one bend can be added per frame
   (`tendWrapsIn` returns after adding one bend). Possible: allow several bends per call, or test the first leg against the post it is
   rounding every frame and clamp the drawn leg to the bend.
3. **Giving up still means passing through.** At the caps (12 bends on a box, `WRAP_MAX = 5` structures, `WRAP_PTS = 40` points, no free place
   to bend) the cable is drawn through the structure. The user earlier suggested a snap instead of a snag ("getting snagged might snap the
   connection"), and now dislikes phasing; consider releasing the cable with the snap sound and toast rather than ignoring the structure.
4. **Thin things:** `thin(c)` (box: any half extent under 0.6; cylinder radius under 1.6; sphere under 2) are skipped by `blocker()` entirely, so
   posts at or below that thickness are never wrapped. The sign's posts are exactly 0.6 half-width, so `0.6 < 0.6` is false and they count as
   not thin, but this is a knife edge; lamp posts, rails and similar slim colliders pass the cable by design (an earlier decision to avoid
   knots). Ask the user whether they want those wrapped too before changing it.
5. **Targeting range** (a remark in the last message, not a request): a target whose reticle-nearest point is beyond `RANGE` (120 m) is dropped
   even if a lower part of it is in range (an 82 m tower seen from 115 m has its top at about 141 m). Not changed.

## Targeting (done, commit `4c75046`) in brief

`pick()` scores candidates: a surface under the reticle (`looked`) scores `10 - dist / RANGE` (+0.6 if it is the current marker); one off the
reticle scores `6 - acos(cos) * AIM_W - dist / RANGE * 0.3` with `AIM_W = 12`. A structure the reticle misses now gets the point on it nearest
the reticle's line (four rounds of projecting between the line and the shape), not the point nearest the eye. Checked in the game with the
aim at and above tall structures near the spawn: same picks where the reticle was on a surface; where it was in the sky the old scoring took a
5 m prop over the tall structure (`0.2 rad` above a 38 m tower) and the new one keeps the tower.

## Code map (`src/winch.js`)

- Constants: lines 34 to 57 (`RANGE`, `PULL_ACC`, `LEAD`, `AIM_W`, `WRAP_MAX`, `WRAP_PTS`, `BOX_BENDS`, `WRAP_MIN_R`, `WRAP_EVERY`, `WRAP_MARGIN`).
- `thin(c)` about 274; `blocker(cols, a, b, skip, only, endSkip)` about 284 (skips `_ignore`, platforms, `br < WRAP_MIN_R`, thin);
  `pointFree` 311; `clearFat` 318; `wrapCandidates` 338 (box edges / rims); `arcPoints` 385 (cylinders, spheres).
- `pick()` about 533; `buildPath` about 633; `tendWrapsIn` about 656 (letting go, then bending, then the ignore caps); `releaseFirst`
  about 715 (the bend nearest you, every frame, no hold); `update(dt, held)` about 730 (path, pull, strain, slip, the `RANGE * 1.6` snap).
- Per-ride state on the handle `o`: `wraps` (bend points), `grp` (the collider each belongs to), `free` (how long each has been clear), `bends`
  (cumulative count per collider; only cylinders and spheres still use it), `ignore` (colliders the cable passes through), `wT`/`wDt`
  (check timer and elapsed time).

## Repro

`tools/winch-sign-repro.mjs` (dev only): starts the real game headless, finds the casino's real sign colliders, hooks the fountain and runs the
winch for 14 s of game time from each spot, with a stand-in for the player's physics (the body moves with the winch's velocity and is pushed
out of the two post boxes). It prints, per spot: how it ended, the player's distance to the hook, the most bend points, the first structure
the cable gave up on, and the number of frames a cable leg was inside a post, plus the average `update` time.

```bash
npx vite --port 5199 --host 127.0.0.1 &          # the dev server (wait for it to answer)
node tools/winch-sign-repro.mjs                  # the default seven spots (about 2 minutes under swiftshader)
node tools/winch-sign-repro.mjs 60,140           # one spot: x,z in the casino's frame
```

Spots (casino frame, player 1 m up): `60,140` and `66,145` are the two that wind round a post (fling and 2 to 5 frames through the post after
the fix; before it, the ignore at the fourth bend and 11 frames through); the rest hold or reach the hook with nothing through the sign. To
trace one run, print per frame: the player's and the wrap points' coordinates in the post's own frame (`d.dot(c.ax)`, `c.ay`, `c.az`), `o.bends`,
`o.grp`, `o.strain` and `o.len`. That is how the lap (corners (0.9,-0.9), (0.9,0.9), (-0.9,0.9), (-0.9,-0.9), then (0.9,-0.9) again) was
seen.

Tips from this session:

- The headless game needs the player to be in `state === 'play'`: the scripts press Enter until it is.
- `window.game` exists in the dev build only. `g.upgrades.winch = 1` gives the winch; a synthetic target object (`{ obj, col: null, mass,
  pos, vel, alive, push, shift }`) with `W.handle(T, point, normal, false, dist)` and `W.on = handle` starts a ride without the targeting.
- One run at a time: several headless Chromium runs together starve each other and the page dies ("Target page, context or browser has been
  closed"). Don't `pkill -f <name>` from Bash (it matches the shell's own command line and kills the shell); filter `ps -eo pid,comm,args`
  by `comm` instead.
- `g.colliders.query(p, r, out)` returns colliders from a grid by cell, so filter by `c.mid.distanceTo(p)` yourself.

## Done when

The user can winch to the chip fountain from the road, run past and round the sign's posts, and the cable always bends round the post (never
through it), lets go as the line clears, and never throws the player. Add a CHANGELOG entry with the commit, keep the README's tools list in
step (`tools/winch-sign-repro.mjs` is listed there), build with `npx vite build`, push to the session's branch.

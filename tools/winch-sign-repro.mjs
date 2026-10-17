// Dev-only repro for docs/winch-handoff.md (the winch cable through the Lucky Crater Casino sign post). Not part of the build.
//   npx vite --port 5199 --host 127.0.0.1      (in one shell)
//   node tools/winch-sign-repro.mjs [x,z x,z ...]   (spots in the casino's frame; default list below; prints one line per spot)
// Playwright comes from PLAYWRIGHT (default /opt/node-tools/node_modules/playwright/index.mjs); the game from GAME_URL (default http://127.0.0.1:5199/).
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');
const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 900, height: 560 } });
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(process.env.GAME_URL || 'http://127.0.0.1:5199/', { waitUntil: 'load' });
await pg.waitForFunction('window.game && window.game.world', null, { timeout: 120000 });
await pg.keyboard.press('Enter'); await pg.waitForTimeout(4000);
await pg.waitForFunction('window.game && window.game.world', null, { timeout: 120000 });
for (let i = 0; i < 14; i++) { let st = null; try { st = await pg.evaluate('window.game.state'); } catch (e) { await pg.waitForTimeout(2500); continue; } if (st === 'play') break; await pg.keyboard.press('Enter'); await pg.waitForTimeout(1500); }
await pg.waitForTimeout(2000);
const r = await pg.evaluate((cfg) => {
  const g = window.game, W = g.winch, P = g.player, V = P.pos.constructor;
  g.upgrades.winch = 1;
  const loc = g.locations.find(l => l.id === 'casino');
  const L = (x, y, z) => g.world.toWorld(loc, x, y, z);
  const out = [];
  // the real sign colliders: boxes about 23 m tall and 1.2 m thick, around loc (26, 118)
  const sc = L(26, 12, 118);
  const near = []; g.colliders.query(sc, 14, near); for (let i = near.length - 1; i >= 0; i--) if (near[i].mid.distanceTo(sc) > 14) near.splice(i, 1);
  const info = (c) => c.type === 'box' ? `box h=(${c.hx.toFixed(1)},${c.hy.toFixed(1)},${c.hz.toFixed(1)}) d=${c.mid.distanceTo(sc).toFixed(1)}` : `${c.type} d=${c.mid.distanceTo(sc).toFixed(1)}`;
  out.push('colliders near the sign: ' + near.map(info).join(' | '));
  const hookPt = L(0, 3, 98);
  const T = { obj: { kind: 'structure' }, col: null, mass: 1e6, flying: false, root: null, pos: () => hookPt, vel: () => new V(), alive: () => true, push: () => {}, shift: () => {} };
  const segHitsBox = (c, a, b) => { // segment vs oriented box, sampling (cheap and enough here)
    for (let i = 1; i < 120; i++) {
      const p = a.clone().lerp(b, i / 120), d = p.clone().sub(c.c);
      if (Math.abs(d.dot(c.ax)) < c.hx - 0.05 && Math.abs(d.dot(c.ay)) < c.hy - 0.05 && Math.abs(d.dot(c.az)) < c.hz - 0.05) return true;
    }
    return false;
  };
  const dt = 1 / 60;
  const posts = near.filter(c => c.type === 'box' && c.hy > 11);
  const boxPush = (c, p) => { // push a body out of an oriented box (radius 0.7), return true if pushed
    const d = p.clone().sub(c.c);
    const lp = [d.dot(c.ax), d.dot(c.ay), d.dot(c.az)], hh = [c.hx, c.hy, c.hz], ax = [c.ax, c.ay, c.az];
    const q = lp.map((v, i) => Math.max(-hh[i], Math.min(hh[i], v)));
    const diff = new V().addScaledVector(ax[0], lp[0] - q[0]).addScaledVector(ax[1], lp[1] - q[1]).addScaledVector(ax[2], lp[2] - q[2]);
    const dl = diff.length();
    if (dl < 0.7 && dl > 1e-6) { diff.divideScalar(dl); p.addScaledVector(diff, 0.7 - dl); return diff; }
    return null;
  };
  let tU = 0, nU = 0;
  for (const [x, z] of cfg.spots) {
    const up = P.up.clone();
    const start = L(x, 1.0, z);
    P.body.pos.copy(start); P.vel.set(0, 0, 0); P.center.copy(start);
    const h = W.handle(T, hookPt.clone(), up.clone(), false, start.distanceTo(hookPt));
    W.on = h; W.cd = 0; h.len = start.distanceTo(hookPt); h.dist = h.len; W.ropeDirty = true;
    let bad = 0, worst = null, maxWraps = 0, igAt = null, ended = null;
    for (let i = 0; i < 60 * 14; i++) {
      const t0 = performance.now(); W.update(dt, true); tU += performance.now() - t0; nU++;
      if (!W.on) { ended = (i / 60).toFixed(1); break; }
      P.body.pos.addScaledVector(P.vel, dt);
      for (const c of posts) { const n = boxPush(c, P.body.pos); if (n) { const vin = P.vel.dot(n); if (vin < 0) P.vel.addScaledVector(n, -vin); } }
      P.center.copy(P.body.pos);
      maxWraps = Math.max(maxWraps, W.on.wraps.length);
      if (W.on.ignore.size && igAt === null) igAt = (i / 60).toFixed(1) + ' ' + [...W.on.ignore].map(info).join(';');
      const pts = [P.center.clone(), ...W.on.wraps.map(q => q.clone()), hookPt.clone()];
      for (let k = 0; k < pts.length - 1; k++) for (const c of posts.concat(near.filter(c => c.type === 'box' && c.hy < 11 && c.hx > 5))) if (segHitsBox(c, pts[k], pts[k + 1])) { bad++; worst = `${info(c)} leg ${k}/${pts.length - 1} t=${(i / 60).toFixed(1)}`; }
    }
    out.push(`spot (${x},${z}): end=${ended || 'held'} dist-to-hook=${P.center.distanceTo(hookPt).toFixed(1)} maxWraps=${maxWraps} firstIgnored=${igAt || '-'} frames-through-sign=${bad} ${worst || ''}`);
    if (W.on) W.release(true);
  }
  out.push('update ms avg ' + (tU / nU).toFixed(3));
  return out;
}, { spots: process.argv.length > 2 ? process.argv.slice(2).map((a) => a.split(',').map(Number)) : [[60, 140], [58, 150], [72, 150], [76, 150], [66, 145], [64, 138], [70, 142]] });
for (const l of r) console.log(l);
console.log(errs.slice(0, 3).join('\n') || 'no errors');
await b.close();

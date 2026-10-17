// Controller feedback: the pad's rumble motors (the browser Gamepad API's `vibrationActuator`, dual-rumble:
// `strong` is the big low-frequency motor, `weak` the small high-frequency one; older browsers only have
// `hapticActuators[0].pulse`, one intensity, which gets the louder of the two).
//
// Two layers are mixed into one effect and re-sent a dozen times a second (a pad can only play one effect, and a
// new one replaces it, so everything has to go out as a single mix):
//   impulses   short kicks the game asks for: play('jump'), land(speed), hit(damage), boom(distance, big), ...
//              each fades out over its own length, and several at once add up
//   continuous the skates' rumble with speed, the thrusters, a rail under the skates, a vehicle's engine
// Only while the pad is the thing being played with (Gamepad.setActive), scaled by the Settings' vibration
// strength, and off for the keyboard, a hidden tab, a pause (the continuous layer) or no actuator at all.
const SEND_MS = 80;   // re-send a steady effect this often (each one is played for LONG_MS, so there's no gap)
const LONG_MS = 140;
const MIN_MS = 40;    // but never changes faster than this (the pad takes a moment to spin up)
const EPS = 0.025;    // a change smaller than this isn't worth sending

// name: [strong, weak, seconds] (an impulse starts at that strength and fades to nothing)
const PRESETS = {
  jump:    [0.0, 0.35, 0.07],  // a tick off the ground
  grind:   [0.45, 0.7, 0.14],  // the skates biting a rail
  stick:   [0.55, 0.55, 0.16], // a trick landed clean
  wipeout: [1.0, 0.8, 0.45],   // a trick landed badly
  death:   [1.0, 1.0, 0.95],
  pulse:   [0.0, 0.5, 0.06],   // the pulse pistol
  scatter: [0.7, 0.9, 0.13],
  rail:    [1.0, 0.55, 0.28],
  mortar:  [0.8, 0.3, 0.2],
  cannon:  [1.0, 0.7, 0.3],    // the APC's turret
  pickup:  [0.0, 0.5, 0.09],
  cash:    [0.0, 0.45, 0.07],  // (twice, a moment apart)
  tick:    [0.0, 0.22, 0.04],  // a menu highlight moving
  press:   [0.12, 0.4, 0.06],  // a menu button pressed
  test:    [0.7, 0.7, 0.3],    // changing the strength in Settings
};
const ECHO = { cash: 0.09 }; // presets that play a second time this many seconds later

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export class Haptics {
  constructor(game) {
    this.game = game;
    this.on = true;       // Settings: controller vibration
    this.level = 1;       // Settings: strength
    this.act = null;      // the actuator of the pad in use
    this.key = null;      // which pad that is
    this.failed = false;  // the browser refused an effect
    this.mode = 'none';   // 'dual' | 'pulse' | 'none'
    this.imp = [];        // live impulses: { s, w, t, d, at }
    this.t = 0;           // own clock (s)
    this.cont = { s: 0, w: 0 }; // the continuous layer, smoothed
    this.sent = { s: 0, w: 0 };
    this.sentAt = -9;
    this.ready = false;   // (the first configure() is the settings loading: no test buzz for that)
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
  }

  // the pad the Gamepad is reading this frame (null when there is none)
  attach(gp) {
    const act = gp && (gp.vibrationActuator && gp.vibrationActuator.playEffect ? gp.vibrationActuator : gp.hapticActuators && gp.hapticActuators[0] && gp.hapticActuators[0].pulse ? gp.hapticActuators[0] : null);
    const key = act ? `${gp.index}:${gp.id}` : null; // (some browsers hand out a fresh object for the same pad each poll)
    if (key !== this.key) { this.stop(); this.key = key; this.failed = false; }
    this.act = act;
    this.mode = !act || this.failed ? 'none' : act.playEffect ? 'dual' : 'pulse';
  }

  get supported() { return this.mode !== 'none'; }

  // Settings: `on` and `level` (0..1.5)
  configure(on, level) {
    const changed = on && (!this.on || level !== this.level);
    this.on = !!on; this.level = level;
    if (!this.on) this.stop();
    else if (changed && this.ready) this.play('test', 1, true);
    this.ready = true;
  }

  // A kick by name, scaled by `k` (0..1+). `force`: even when the keyboard is what's being played with.
  play(name, k = 1, force = false) {
    const p = PRESETS[name];
    if (!p || !this.live(force)) return;
    this.add(p[0] * k, p[1] * k, p[2]);
    if (ECHO[name]) this.add(p[0] * k, p[1] * k, p[2], ECHO[name]);
  }

  add(s, w, d, at = 0) {
    if (s <= 0.01 && w <= 0.01) return;
    if (this.imp.length > 24) this.imp.shift();
    this.imp.push({ s: clamp01(s), w: clamp01(w), t: 0, d, at });
    this.dirty = true;
  }

  // landing at `speed` m/s into the ground / a wall
  land(speed) {
    if (!this.live()) return;
    const k = clamp01((speed - 5) / 32);
    this.add(0.2 + 0.8 * k, 0.15 + 0.6 * k, 0.1 + 0.2 * k);
  }

  // the player took `amount` damage
  hit(amount) {
    if (!this.live()) return;
    const k = clamp01(amount / 30);
    this.add(0.3 + 0.7 * k, 0.5 + 0.4 * k, 0.16 + 0.3 * k);
  }

  // a blast `dist` m from the camera (big: a large one)
  boom(dist, big) {
    if (!this.live()) return;
    const reach = big ? 170 : 70;
    if (dist > reach) return;
    const k = 1 - dist / reach;
    this.add((big ? 1 : 0.65) * k, (big ? 0.8 : 0.6) * k, (big ? 0.55 : 0.28) * (0.5 + 0.5 * k));
  }

  // is there a pad to feel it on, and is it the one in use?
  live(force = false) {
    if (!this.on || this.mode === 'none' || document.hidden) return false;
    return force || !!(this.game.input && this.game.input.padActive);
  }

  // Per frame (real seconds), late in the frame so that this frame's events go out at once.
  update(dt) {
    this.t += dt;
    if (!this.act) { this.imp.length = 0; return; }
    const g = this.game;
    let ts = 0, tw = 0;
    if (this.live() && g.state === 'play') {
      const P = g.player, b = P && P.body;
      if (b && !P.dead) {
        const sp = P.speed;
        if (g.grind && g.grind.active) { // metal under the skates
          const k = clamp01(sp / 60);
          ts = 0.1 + 0.1 * k; tw = 0.35 + 0.25 * k;
        } else if (P.vehicle) { // an engine, rising with speed
          const k = clamp01(sp / 70);
          ts = 0.1 + 0.25 * k; tw = 0.03 + 0.15 * k;
        } else if (b.skating && b.grounded && !P.rag && sp > 3) { // skates on the ground
          const k = clamp01(sp / 70);
          ts = 0.04 * k; tw = 0.06 + 0.3 * k;
        }
        if (b.thrusting) { ts = Math.max(ts, 0.25); tw = Math.max(tw, 0.32); }
      }
    }
    // (a little smoothing, so the layer swells in and out rather than jumping)
    const a = 1 - Math.exp(-dt * 12);
    this.cont.s += (ts - this.cont.s) * a;
    this.cont.w += (tw - this.cont.w) * a;
    if (this.cont.s < 0.01 && ts === 0) this.cont.s = 0;
    if (this.cont.w < 0.01 && tw === 0) this.cont.w = 0;

    // the impulses: a linear fade, summed softly with each other and with the continuous layer
    let is = 0, iw = 0;
    for (let i = this.imp.length - 1; i >= 0; i--) {
      const m = this.imp[i];
      if (m.at > 0) { m.at -= dt; continue; }
      const f = 1 - m.t / m.d; // (heard once at its full strength before it ages: a kick shorter than a frame still goes out)
      is = 1 - (1 - is) * (1 - m.s * f);
      iw = 1 - (1 - iw) * (1 - m.w * f);
      m.t += dt;
      if (m.t >= m.d) this.imp.splice(i, 1);
    }
    const k = this.level;
    const s = clamp01((1 - (1 - this.cont.s) * (1 - is)) * k);
    const w = clamp01((1 - (1 - this.cont.w) * (1 - iw)) * k);
    this.send(s, w);
  }

  send(s, w) {
    const now = this.t;
    const since = (now - this.sentAt) * 1000;
    const sc = this.sent;
    const moved = Math.abs(s - sc.s) > EPS || Math.abs(w - sc.w) > EPS;
    const none = s < 0.01 && w < 0.01;
    if (none) {
      if (sc.s || sc.w) { this.silence(); this.sent = { s: 0, w: 0 }; this.sentAt = now; }
      this.dirty = false;
      return;
    }
    const rising = s > sc.s + EPS || w > sc.w + EPS;
    if (!(rising && this.dirty) && since < MIN_MS) return;       // (a fresh kick goes out at once)
    if (!moved && since < SEND_MS) return;
    this.dirty = false;
    this.sentAt = now; this.sent = { s, w };
    try {
      if (this.mode === 'dual') {
        const p = this.act.playEffect('dual-rumble', { startDelay: 0, duration: LONG_MS, strongMagnitude: s, weakMagnitude: w });
        if (p && p.catch) p.catch(() => { this.failed = true; this.mode = 'none'; }); // (the browser refused: stop trying)
      } else this.act.pulse(Math.max(s, w), LONG_MS);
    } catch { this.failed = true; this.mode = 'none'; }
  }

  silence() {
    if (!this.act) return;
    try {
      if (this.act.reset) { const p = this.act.reset(); if (p && p.catch) p.catch(() => {}); }
      else if (this.mode === 'dual') { const p = this.act.playEffect('dual-rumble', { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 }); if (p && p.catch) p.catch(() => {}); }
    } catch { /* the pad went away */ }
  }

  // everything off (a pause, the tab hidden, the pad gone, vibration switched off)
  stop() {
    this.imp.length = 0;
    this.cont.s = this.cont.w = 0;
    if (this.sent.s || this.sent.w) this.silence();
    this.sent = { s: 0, w: 0 };
    this.dirty = false;
  }
}

import { padKind } from './gamepad.js';

// Dev overlay (dev menu → INPUT & CONTROLLER MONITOR): the connected pad drawn live next to what the game
// thinks is held, plus the trick state. For chasing stuck inputs: if the game has Q down while neither the
// keyboard's Q nor the pad's Circle / B is, the readout goes red.
//
// The pad is read straight from navigator.getGamepads() (standard mapping), so it shows even when the game
// is ignoring it. Button indexes: 0-3 face (bottom, right, left, top), 4/5 bumpers, 6/7 triggers, 8 View /
// Create, 9 Start / Options, 10/11 stick clicks, 12-15 d-pad, 16 Home, 17 PlayStation touchpad.

// what each standard-mapping button does in play (gamepad.js)
const ACTION = {
  0: 'jump / dive', 1: 'trick (Q)', 2: 'interact', 3: 'vehicle', 4: 'skates', 5: 'power', 6: 'thrust / scope', 7: 'fire',
  8: 'map / recall', 9: 'pause', 10: 'thrust', 11: 'scoop', 12: 'next power', 13: 'radial menu', 14: 'prev weapon', 15: 'next weapon',
};
// button names per pad family (the face buttons are drawn as symbols on the pad itself)
const NAMES = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', '↑', '↓', '←', '→', 'Guide'],
  ps: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', '↑', '↓', '←', '→', 'PS', 'Touchpad'],
  switch: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'LS', 'RS', '↑', '↓', '←', '→', 'Home'],
};
const KEYS = [['KeyQ', 'Q'], ['KeyW', 'W'], ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'], ['ShiftLeft', 'Shift'], ['Space', 'Space'], ['KeyE', 'E']];
const FACE_COL = {
  xbox: ['#62d84e', '#ff4d4d', '#4da3ff', '#ffd23f'], // A, B, X, Y
  ps: ['#6aa8ff', '#ff5470', '#ff8ad8', '#4ff0a0'], // cross, circle, square, triangle
};
const NS = 'http://www.w3.org/2000/svg';
const STICK = 11; // how far a stick cap travels at full tilt, in drawing units
const DEAD = 0.18;
const TAU = Math.PI * 2;
const f2 = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
// "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)" -> "Wireless Controller · 054c:0ce6"
const padName = (id = '') => {
  const m = id.match(/Vendor: (\w+) Product: (\w+)/i);
  return id.replace(/\s*\(.*$/, '').slice(0, 30) + (m ? ` · ${m[1]}:${m[2]}` : '');
};

// ---- shapes (drawing space 360 x 240; the right-hand shoulder pieces are the left ones mirrored) ----
const SHAPE = {
  trigger: 'M92 40 C94 24 112 14 138 14 L138 36 C120 34 104 36 92 40 Z',
  bumper: 'M68 76 C80 58 112 50 152 50 L152 60 C120 60 96 66 82 84 Z',
  xbox: 'M104 60 C140 50 220 50 256 60 C292 66 326 96 338 150 C346 190 336 220 312 222 C290 224 274 204 258 184 C250 174 240 170 228 170 L132 170 C120 170 110 174 102 184 C86 204 70 224 48 222 C24 220 14 190 22 150 C34 96 68 66 104 60 Z',
  ps: 'M100 66 C140 56 220 56 260 66 C296 72 328 98 340 152 C348 196 334 226 310 226 C288 226 274 206 260 186 C252 174 242 170 230 170 L130 170 C118 170 108 174 100 186 C86 206 72 226 50 226 C26 226 12 196 20 152 C32 98 64 72 100 66 Z',
  psCore: 'M122 60 C150 55 210 55 238 60 C262 68 270 118 258 162 C252 176 240 178 228 177 L132 177 C120 178 108 176 102 162 C90 118 98 68 122 60 Z',
};
// PlayStation symbols, centred on 0,0 (stroked, ~±4.6)
const SYM = {
  0: 'M-4.4 -4.4L4.4 4.4M4.4 -4.4L-4.4 4.4',
  1: 'M4.6 0A4.6 4.6 0 1 1 -4.6 0A4.6 4.6 0 1 1 4.6 0Z',
  2: 'M-4.2 -4.2H4.2V4.2H-4.2Z',
  3: 'M0 -5.2L5 3.6H-5Z',
};

export class InputMonitor {
  constructor(game) {
    this.game = game;
    this.rawKeys = new Set(); // physical keys as the window sees them (translated to the game's default codes, like Input does)
    this.on = false;
    this.kind = null;
    const I = game.input;
    window.addEventListener('keydown', (e) => this.rawKeys.add(I.translate(e.code)), true);
    window.addEventListener('keyup', (e) => this.rawKeys.delete(I.translate(e.code)), true);
    window.addEventListener('blur', () => this.rawKeys.clear());
    const el = this.el = document.createElement('div');
    el.id = 'input-mon';
    el.className = 'hidden';
    el.innerHTML = `
      <div class="im-top"><b class="im-badge"></b><span class="im-name"></span></div>
      <div class="im-sub"></div>
      <div class="im-map"></div>
      <div class="im-sec">INPUT</div><dl class="im-in"></dl>
      <div class="im-sec">GAME</div><dl class="im-game"></dl>
      <div class="im-sec">TRICK</div><dl class="im-trick"></dl>
      <div class="im-alert hidden"></div>`;
    const q = (s) => el.querySelector(s);
    this.badge = q('.im-badge'); this.nameEl = q('.im-name'); this.sub = q('.im-sub');
    this.mapEl = q('.im-map'); this.inEl = q('.im-in'); this.gameEl = q('.im-game'); this.trickEl = q('.im-trick'); this.alertEl = q('.im-alert');
    document.body.appendChild(el);
  }

  setOn(on) {
    this.on = on;
    this.el.classList.toggle('hidden', !on);
    if (!on) this.kind = null;
  }

  // the pad gamepad.js would use: the first connected, preferring one with the standard mapping
  pad() {
    let gp = null;
    for (const p of (navigator.getGamepads ? navigator.getGamepads() : [])) if (p && p.connected) { gp = p; if (p.mapping === 'standard') break; }
    return gp;
  }

  // ---- the drawing ----
  mk(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  build(kind) {
    this.kind = kind;
    const ps = kind === 'ps';
    const mk = (t, a, p) => this.mk(t, a, p);
    const svg = mk('svg', { viewBox: '0 0 360 240', class: `im-svg im-${ps ? 'ps' : 'xbox'}` });
    const defs = mk('defs', {}, svg);
    const grad = (id, a, b) => { const g = mk('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs); mk('stop', { offset: 0, 'stop-color': a }, g); mk('stop', { offset: 1, 'stop-color': b }, g); };
    grad('im-g-xbox', '#3a3e4b', '#1b1d25');
    grad('im-g-ps', '#f6f8fc', '#c9cfdb');
    grad('im-g-core', '#252733', '#12131a');
    this.btn = {};
    this.trig = {};

    // triggers and bumpers: a left piece and its mirror
    const side = (parent, mirror) => mk('g', mirror ? { transform: 'translate(360 0) scale(-1 1)' } : {}, parent);
    for (const [i, mirror] of [[6, false], [7, true]]) {
      const g = side(svg, mirror), id = `im-clip-${i}`;
      mk('path', { d: SHAPE.trigger, class: 'im-trig' }, g);
      const cp = mk('clipPath', { id }, g); mk('path', { d: SHAPE.trigger }, cp);
      this.trig[i] = mk('rect', { x: 60, y: 40, width: 100, height: 0, class: 'im-fill', 'clip-path': `url(#${id})` }, g);
    }
    mk('path', { d: ps ? SHAPE.ps : SHAPE.xbox, class: ps ? 'im-body-ps' : 'im-body-xbox' }, svg);
    if (ps) {
      mk('path', { d: SHAPE.psCore, class: 'im-core' }, svg);
      // the light bar either side of the touchpad
      mk('path', { d: 'M126 64 C122 84 122 106 130 126 M234 64 C238 84 238 106 230 126', class: 'im-bar' }, svg);
    }
    for (const [i, mirror] of [[4, false], [5, true]]) {
      const g = side(svg, mirror);
      this.btn[i] = { el: mk('path', { d: SHAPE.bumper, class: 'im-key' }, g) };
    }
    const text = (s, x, y, size) => { const t = mk('text', { x, y, 'font-size': size, class: 'im-lab' }, svg); t.textContent = s; };
    const N = NAMES[kind] || NAMES.xbox;
    text(N[6], 116, 26, 8.5); text(N[7], 244, 26, 8.5);
    text(N[4], 112, 56, 7.5); text(N[5], 248, 56, 7.5);

    // d-pad: a plus of four arms
    const [dx, dy] = ps ? [88, 104] : [142, 146];
    mk('circle', { cx: dx, cy: dy, r: 22, class: 'im-well' }, svg);
    for (const [i, x, y, w, h] of [[12, -6, -21, 12, 15], [13, -6, 6, 12, 15], [14, -21, -6, 15, 12], [15, 6, -6, 15, 12]]) {
      this.btn[i] = { el: mk('rect', { x: dx + x, y: dy + y, width: w, height: h, rx: 2.5, class: 'im-key' }, svg) };
    }
    // face buttons (bottom, right, left, top)
    const [fx, fy] = ps ? [272, 104] : [262, 100];
    const cols = FACE_COL[ps ? 'ps' : 'xbox'];
    for (const [i, ox, oy] of [[0, 0, 19], [1, 19, 0], [2, -19, 0], [3, 0, -19]]) {
      const g = mk('g', { class: 'im-face', style: `--c:${cols[i]}`, transform: `translate(${fx + ox} ${fy + oy})` }, svg);
      mk('circle', { r: 10, class: 'im-cap' }, g);
      if (ps) mk('path', { d: SYM[i], class: 'im-sym' }, g);
      else { const t = mk('text', { y: 0.5, 'font-size': 11, class: 'im-sym-t' }, g); t.textContent = N[i]; }
      this.btn[i] = { el: g };
    }
    // View / Menu (Create / Options), Guide (PS), touchpad
    if (ps) {
      this.btn[17] = { el: mk('rect', { x: 146, y: 66, width: 68, height: 40, rx: 9, class: 'im-pad' }, svg) };
      this.btn[8] = { el: mk('rect', { x: 112, y: 78, width: 14, height: 7, rx: 3.5, class: 'im-key' }, svg) };
      this.btn[9] = { el: mk('rect', { x: 234, y: 78, width: 14, height: 7, rx: 3.5, class: 'im-key' }, svg) };
      this.btn[16] = { el: mk('circle', { cx: 180, cy: 146, r: 6, class: 'im-key' }, svg) };
      mk('rect', { x: 174, y: 160, width: 12, height: 4, rx: 2, class: 'im-dim' }, svg); // mic mute, not a pad button
    } else {
      this.btn[8] = { el: mk('circle', { cx: 152, cy: 100, r: 6, class: 'im-key' }, svg) };
      this.btn[9] = { el: mk('circle', { cx: 208, cy: 100, r: 6, class: 'im-key' }, svg) };
      this.btn[16] = { el: mk('circle', { cx: 180, cy: 78, r: 10, class: 'im-key' }, svg) };
      mk('circle', { cx: 180, cy: 78, r: 5, class: 'im-guide' }, svg);
    }
    // sticks: a well, a cap that follows the axes, and a ring that lights when the stick is clicked
    const spec = ps ? [[10, 142, 146, 0, 1], [11, 218, 146, 2, 3]] : [[10, 100, 100, 0, 1], [11, 218, 146, 2, 3]];
    this.sticks = spec.map(([i, x, y, ax, ay]) => {
      mk('circle', { cx: x, cy: y, r: 22, class: 'im-well' }, svg);
      const ring = mk('circle', { cx: x, cy: y, r: 22, class: 'im-ring' }, svg);
      mk('circle', { cx: x, cy: y, r: STICK * DEAD * 3, class: 'im-dead' }, svg);
      const g = mk('g', {}, svg);
      const cap = mk('circle', { cx: x, cy: y, r: 14, class: 'im-stick' }, g);
      mk('circle', { cx: x, cy: y, r: 8, class: 'im-stick-in' }, g);
      this.btn[i] = { el: ring };
      return { g, cap, x, y, ax, ay };
    });
    this.mapEl.replaceChildren(svg);
  }

  // ---- per frame ----
  update() {
    if (!this.on) return;
    const g = this.game, I = g.input, P = g.player, b = P && P.body;
    const gp = this.pad();
    const kind = gp ? padKind(gp.id) : null;
    if (kind !== this.kind) { if (kind) this.build(kind); else { this.kind = null; this.mapEl.replaceChildren(); } }
    const N = NAMES[kind] || NAMES.xbox;
    const lab = (i) => `${N[i] || '#' + i}`;

    // header
    this.badge.textContent = kind ? { ps: 'PS', xbox: 'XBOX', switch: 'SWITCH' }[kind] : '—';
    this.badge.className = 'im-badge' + (kind ? '' : ' off');
    this.nameEl.textContent = gp ? padName(gp.id) : 'no controller';
    this.sub.innerHTML = (gp
      ? (gp.mapping === 'standard' ? 'standard mapping' : '<span class="bad">non-standard mapping: the buttons below may be wrong</span>')
      : 'press a button on the pad (browsers hide pads until one is used)')
      + ` · <span class="${I.padActive ? 'src-on' : ''}">${I.padActive ? 'pad in control' : 'keyboard / mouse in control'}</span>`;
    this.mapEl.classList.toggle('empty', !gp);

    // the pad
    const pressed = [];
    if (gp) {
      gp.buttons.forEach((bt, i) => {
        const v = bt.value || (bt.pressed ? 1 : 0), on = !!bt.pressed || v > 0.5;
        if (i === 6 || i === 7) {
          const c = this.trig[i];
          if (c) { const h = 28 * Math.min(1, v); c.setAttribute('y', (42 - h).toFixed(1)); c.setAttribute('height', h.toFixed(1)); }
        } else if (this.btn[i]) this.btn[i].el.classList.toggle('on', on);
        if (on) pressed.push(i);
      });
      for (const s of this.sticks) {
        const ax = gp.axes[s.ax] || 0, ay = gp.axes[s.ay] || 0, m = Math.hypot(ax, ay), k = m > 1 ? 1 / m : 1;
        s.g.setAttribute('transform', `translate(${(ax * k * STICK).toFixed(1)} ${(ay * k * STICK).toFixed(1)})`);
        s.cap.classList.toggle('live', m > DEAD);
      }
    }

    // INPUT: what the pad is doing
    const lx = gp ? gp.axes[0] || 0 : 0, ly = gp ? gp.axes[1] || 0 : 0, rx = gp ? gp.axes[2] || 0 : 0, ry = gp ? gp.axes[3] || 0 : 0;
    const chips = pressed.filter((i) => i !== 6 && i !== 7).map((i) => `<i class="on">${esc(lab(i))}${ACTION[i] ? ` <small>${ACTION[i]}</small>` : ''}</i>`);
    for (const i of [6, 7]) { const v = gp && gp.buttons[i] ? gp.buttons[i].value : 0; if (v > 0.05) chips.push(`<i class="on">${esc(lab(i))} <small>${v.toFixed(2)}</small></i>`); }
    const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
    this.inEl.innerHTML = gp
      ? row('buttons', chips.join('') || '<span class="dim">none</span>') + row('left stick', `${f2(lx)}  ${f2(ly)}`) + row('right stick', `${f2(rx)}  ${f2(ry)}`)
      : row('buttons', '<span class="dim">-</span>');

    // GAME: what the game thinks
    const chip = (code, txt) => `<i class="${I.down(code) ? 'on' : ''}">${txt}</i>`;
    const hold = g.pad && g.pad.holding ? [...g.pad.holding].map((c) => c.replace('Key', '')) : [];
    this.gameEl.innerHTML = row('keys down', KEYS.map(([c, t]) => chip(c, t)).join(''))
      + row('from the pad', hold.length ? hold.join(' ') : '<span class="dim">none</span>')
      + row('move input', I.padMove.on ? `${f2(I.padMove.x)}  ${f2(I.padMove.y)}` : '<span class="dim">idle</span>');

    // TRICK
    if (P && b) {
      const t = P.trick, held = I.down('KeyQ') && !b.grounded && b.airTime > 0.12 && !P.rag;
      this.trickEl.innerHTML = row('button', held ? '<b class="hot">HELD</b>' : '<span class="dim">not held</span>')
        + row('state', `${t.active ? 'active' : 'idle'} · ${t.tucked ? 'tucked' : 'upright'}${P.rag ? ' · <span class="bad">ragdoll</span>' : ''}`)
        + row('flip · spin', `${(t.flip / TAU).toFixed(2)} · ${(t.spin / TAU).toFixed(2)} turns`)
        + row('air', `${b.grounded ? 'grounded' : 'airborne'} · ${b.airTime.toFixed(2)} s`);
    }
    const gy = g.pad && g.pad.gyro;
    if (gy && (gy.dev || kind === 'ps')) this.trickEl.insertAdjacentHTML('beforeend', row('gyro', `${gy.live() ? '<b class="hot">live</b>' : '<span class="dim">off</span>'}${g.pad.gyroOn ? ' · steering' : ''} <small>${esc(gy.status)}</small>`));

    // a stuck trick button: the game has Q down but nothing physical does
    const gameQ = I.down('KeyQ'), physQ = this.rawKeys.has('KeyQ'), padB = !!(gp && gp.buttons[1] && (gp.buttons[1].pressed || gp.buttons[1].value > 0.5));
    const stuck = gameQ && !physQ && !padB;
    this.alertEl.classList.toggle('hidden', !stuck);
    if (stuck) this.alertEl.textContent = `STUCK: the game has Q (trick) down, but neither the keyboard Q nor the pad's ${kind === 'ps' ? '○' : 'B'} is.`;
  }
}

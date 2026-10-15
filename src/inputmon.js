import { faceInfo } from './glyphs.js';
import { padKind } from './gamepad.js';

// Dev overlay (dev menu → INPUT & CONTROLLER MONITOR): what the controller is really sending next to
// what the game thinks is held, plus the trick state. For chasing stuck inputs: if the game says Q is
// down while neither the keyboard's Q nor the pad's Circle / B is, the readout goes red.
//
// The map reads navigator.getGamepads() itself (standard mapping), so it shows the pad even when the game
// is ignoring it. Pad button indexes: 0-3 face (bottom, right, left, top), 4/5 bumpers, 6/7 triggers,
// 8 View / Create, 9 Start / Options, 10/11 stick clicks, 12-15 d-pad, 16 Home, 17 PlayStation touchpad.

// what each standard-mapping button does in play (gamepad.js)
const ACTION = {
  0: 'JUMP / DIVE', 1: 'TRICK (Q)', 2: 'INTERACT', 3: 'VEHICLE', 4: 'SKATES', 5: 'POWER', 6: 'THRUST / SCOPE', 7: 'FIRE',
  8: 'MAP / RECALL', 9: 'PAUSE', 10: 'THRUST', 11: 'SCOOP', 12: 'NEXT POWER', 13: 'RADIAL MENU', 14: 'PREV WEAPON', 15: 'NEXT WEAPON',
  16: 'HOME', 17: 'TOUCHPAD',
};
const TOKEN = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'VIEW', 'START', 'L3', 'R3', 'DU', 'DD', 'DL', 'DR'];
const KEYS = [['KeyQ', 'Q'], ['KeyW', 'W'], ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'], ['ShiftLeft', 'SHIFT'], ['Space', 'SPACE'], ['KeyE', 'E']];
const STICK_R = 13;
const NS = 'http://www.w3.org/2000/svg';
// "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)" -> "Wireless Controller 054c:0ce6"
const padName = (id = '') => {
  const m = id.match(/Vendor: (\w+) Product: (\w+)/i);
  return id.replace(/\s*\(.*$/, '').slice(0, 32) + (m ? ` ${m[1]}:${m[2]}` : '');
};
const f2 = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);

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
    el.innerHTML = '<div class="im-head"></div><div class="im-map"></div><div class="im-rows"></div>';
    document.body.appendChild(el);
    this.head = el.querySelector('.im-head');
    this.mapEl = el.querySelector('.im-map');
    this.rows = el.querySelector('.im-rows');
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

  svg(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // the controller drawing for a pad family; sticks and d-pad swap places on a PlayStation pad
  build(kind) {
    this.kind = kind;
    const ps = kind === 'ps';
    const root = this.svg('svg', { viewBox: '0 0 300 172', class: 'im-svg' });
    this.svg('path', { d: 'M60 40 Q150 22 240 40 Q282 52 290 110 Q292 150 262 150 Q240 150 226 124 L74 124 Q60 150 38 150 Q8 150 10 110 Q18 52 60 40Z', class: 'im-body' }, root);
    this.btn = {}; // index -> { el, kind, ... }
    const label = (tok, x, y, size = 9) => {
      const [txt] = faceInfo(tok, kind);
      const t = this.svg('text', { x, y, 'font-size': size, class: 'im-lab' }, root);
      t.textContent = txt;
      return t;
    };
    // triggers: a bar that fills with the analog value
    for (const [i, x] of [[6, 46], [7, 220]]) {
      this.svg('rect', { x, y: 2, width: 34, height: 14, rx: 3, class: 'im-shape' }, root);
      const fill = this.svg('rect', { x, y: 2, width: 0, height: 14, rx: 3, class: 'im-fill' }, root);
      this.btn[i] = { fill, w: 34, trig: true };
      label(TOKEN[i], x + 17, 9.5, 8);
    }
    for (const [i, x] of [[4, 44], [5, 212]]) {
      this.btn[i] = { el: this.svg('rect', { x, y: 20, width: 44, height: 10, rx: 4, class: 'im-shape' }, root) };
      label(TOKEN[i], x + 22, 25.5, 7.5);
    }
    // d-pad
    const dx = ps ? 80 : 114, dy = ps ? 72 : 110;
    for (const [i, x, y, w, h] of [[12, -6, -20, 12, 14], [13, -6, 6, 12, 14], [14, -20, -6, 14, 12], [15, 6, -6, 14, 12]]) {
      this.btn[i] = { el: this.svg('rect', { x: dx + x, y: dy + y, width: w, height: h, rx: 2, class: 'im-shape' }, root) };
    }
    // face buttons: bottom, right, left, top
    for (const [i, x, y] of [[0, 222, 90], [1, 240, 72], [2, 204, 72], [3, 222, 54]]) {
      this.btn[i] = { el: this.svg('circle', { cx: x, cy: y, r: 9, class: 'im-shape' }, root) };
      label(TOKEN[i], x, y + 0.5, 10);
    }
    // View / Start, Home, touchpad
    for (const [i, x] of [[8, 124], [9, 160]]) {
      this.btn[i] = { el: this.svg('rect', { x, y: 62, width: 18, height: 8, rx: 3, class: 'im-shape' }, root) };
      label(TOKEN[i], x + 9, 78, 5.5);
    }
    this.btn[16] = { el: this.svg('circle', { cx: 150, cy: 96, r: 5, class: 'im-shape' }, root) };
    if (ps) this.btn[17] = { el: this.svg('rect', { x: 128, y: 40, width: 44, height: 16, rx: 4, class: 'im-shape' }, root) };
    // sticks (click = L3 / R3): the dot follows the raw axes
    const sticks = [[10, ps ? 112 : 80, ps ? 110 : 72, 0, 1], [11, 190, 110, 2, 3]];
    this.sticks = sticks.map(([i, x, y, ax, ay]) => {
      const ring = this.svg('circle', { cx: x, cy: y, r: STICK_R + 5, class: 'im-shape' }, root);
      this.svg('circle', { cx: x, cy: y, r: STICK_R * 0.18, class: 'im-dead' }, root);
      const dot = this.svg('circle', { cx: x, cy: y, r: 6, class: 'im-dot' }, root);
      label(i === 10 ? 'L3' : 'R3', x, y + STICK_R + 14, 6);
      this.btn[i] = { el: ring };
      return { ring, dot, x, y, ax, ay };
    });
    this.mapEl.replaceChildren(root);
  }

  update() {
    if (!this.on) return;
    const g = this.game, I = g.input, P = g.player, b = P && P.body;
    const gp = this.pad();
    const kind = gp ? padKind(gp.id) : null;
    if (kind !== this.kind) { if (kind) this.build(kind); else { this.kind = null; this.mapEl.replaceChildren(); } }
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

    // ---- the pad itself ----
    const pressed = [];
    if (gp) {
      gp.buttons.forEach((bt, i) => {
        const v = bt.value || (bt.pressed ? 1 : 0), on = bt.pressed || v > 0.5;
        const c = this.btn[i];
        if (c) {
          if (c.trig) c.fill.setAttribute('width', (c.w * Math.min(1, v)).toFixed(1));
          else c.el.classList.toggle('on', on);
        }
        if (on) pressed.push(i);
      });
      for (const s of this.sticks) {
        const ax = gp.axes[s.ax] || 0, ay = gp.axes[s.ay] || 0;
        s.dot.setAttribute('cx', (s.x + ax * STICK_R).toFixed(1));
        s.dot.setAttribute('cy', (s.y + ay * STICK_R).toFixed(1));
        s.dot.classList.toggle('on', Math.hypot(ax, ay) > 0.18);
      }
    }
    const name = (i) => `${faceInfo(TOKEN[i], this.kind)[0] || '#' + i}${ACTION[i] ? ' ' + ACTION[i].toLowerCase() : ''}`;
    this.head.innerHTML = gp
      ? `<b>${this.kind.toUpperCase()}</b> · ${esc(padName(gp.id))} · ${gp.mapping || 'no'} mapping${gp.mapping !== 'standard' ? ' <span class="bad">(buttons below may be wrong)</span>' : ''}<br>game input: <b>${I.padActive ? 'PAD' : 'KEYBOARD / MOUSE'}</b>`
      : 'no controller detected (press a button; browsers hide pads until then)<br>game input: <b>' + (I.padActive ? 'PAD' : 'KEYBOARD / MOUSE') + '</b>';

    // ---- rows ----
    const rows = [];
    const lx = gp ? gp.axes[0] || 0 : 0, ly = gp ? gp.axes[1] || 0 : 0, rx = gp ? gp.axes[2] || 0 : 0, ry = gp ? gp.axes[3] || 0 : 0;
    if (gp) {
      rows.push(`<span class="k">pad held</span> ${pressed.length ? pressed.map((i) => esc(name(i))).join(' · ') : '-'}`);
      rows.push(`<span class="k">sticks</span> L ${f2(lx)} ${f2(ly)} · R ${f2(rx)} ${f2(ry)} · trig ${(gp.buttons[6] ? gp.buttons[6].value : 0).toFixed(2)} ${(gp.buttons[7] ? gp.buttons[7].value : 0).toFixed(2)}`);
    }
    const chip = (code, txt) => `<i class="${I.down(code) ? 'on' : ''}">${txt}</i>`;
    rows.push(`<span class="k">game keys</span> ${KEYS.map(([c, t]) => chip(c, t)).join('')}`);
    const hold = g.pad && g.pad.holding ? [...g.pad.holding] : [];
    rows.push(`<span class="k">pad → keys</span> ${hold.length ? hold.map((c) => c.replace('Key', '')).join(' ') : '-'} · padMove ${f2(I.padMove.x)} ${f2(I.padMove.y)}${I.padMove.on ? '' : ' (idle)'}`);
    const gameQ = I.down('KeyQ'), physQ = this.rawKeys.has('KeyQ'), padB = !!(gp && gp.buttons[1] && (gp.buttons[1].pressed || gp.buttons[1].value > 0.5));
    if (gameQ && !physQ && !padB) rows.push('<span class="bad">STUCK: the game has Q down, but neither the keyboard Q nor the pad ○ / B is</span>');

    if (P && b) {
      const t = P.trick, held = gameQ && !b.grounded && b.airTime > 0.12 && !P.rag;
      rows.push(`<span class="k">trick</span> ${held ? '<b class="hot">HELD</b>' : 'not held'} · active ${t.active ? 'yes' : 'no'} · tucked ${t.tucked ? 'yes' : 'no'}`);
      rows.push(`<span class="k">flip / spin</span> ${(t.flip / (Math.PI * 2)).toFixed(2)} / ${(t.spin / (Math.PI * 2)).toFixed(2)} turns · air ${b.airTime.toFixed(2)}s · ${b.grounded ? 'grounded' : 'airborne'}${P.rag ? ' · RAGDOLL' : ''}`);
    }
    const gy = g.pad && g.pad.gyro;
    if (gy) rows.push(`<span class="k">gyro</span> ${gy.live() ? '<b class="hot">live</b>' : 'off'}${g.pad.gyroOn ? ' · circle held (steering with tilt)' : ''} · ${esc(gy.status)}`);
    this.rows.innerHTML = rows.map((r) => `<div>${r}</div>`).join('');
  }
}

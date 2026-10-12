// Controller support (the browser Gamepad API, standard mapping: Xbox / PlayStation / Switch Pro).
//
// In play the pad drives the same actions the keyboard and mouse do, by their default key codes
// straight into Input (so keyboard rebinding never gets in the way): the left stick moves (analog,
// and as WASD for anything that reads keys), the right stick looks, the triggers are the mouse
// buttons. In menus it's a highlight you move with the d-pad or left stick over whatever is on
// screen (buttons, cards, tiles, sliders): A presses it, B backs out (Escape), the right stick
// scrolls. The title menu has its own arrow-key navigation, so there the pad just sends arrows.
//
//   PLAY                                        DERBY (watching your chimera race)
//   left stick   move / steer / carve           A        cheer (Space)
//   right stick  look                           Y        switch camera (C)
//   A            mag-jump · dive (Shift)        right stick  orbit the camera
//   B            tricks, hold in the air (Q)
//   X            interact (F)                   MENUS
//   Y            vehicle (V)                    d-pad / left stick  move the highlight
//   LB           Quantum-Lock skates, hold      A  press   B  back   right stick  scroll
//   RB           power (Z, hold for the winch)  LB / RB  previous / next tab (where there are tabs)
//   LT           thrusters / Rail Lance scope
//   RT           fire                           Start        pause / resume
//   L3           thrusters (E)                  View, tap    globe map (M)
//   R3           scoop into the jar (G)         View, hold   emergency recall (R)
//   d-pad ←/→    previous / next weapon
//   d-pad ↑      next power (the mouse wheel)    GLOBE MAP
//                                               left stick  move the cursor   right stick  zoom
//                                               RT, hold    grab the globe and drag it round
//                                               LB / RB, hold  turn the map round
//                                               B / View    close
//                                               PLINKO
//                                               left stick / d-pad ←/→  aim the chute
//                                               A / RT      drop a ball (hold: keep them coming)
//                                               LB / RB     lower / raise the bet   B  stand up
//                                               BLACKJACK
//                                               A  deal · hit   X  stand   Y  double   R3  zoom
//                                               LB / RB     lower / raise the bet   B  stand up
//                                               ROULETTE (the casino panel's table)
//                                               left stick  move the cursor
//                                               A / RT      a chip on what it's over (or press it)
//                                               d-pad ←/→   bet size   X  spin   Y  clear
//                                               DUCK DERBY
//                                               left stick / d-pad  pick a duck   A  race · new race
//                                               LB / RB     lower / raise the bet   B  stand up
//   d-pad ↓      the quick slot: tap to use it, or hold it and press LB / RB to pick what it is
//                (previous / next): empty the jar, wardrobe, reputation log, pen
//                link, Teleporter, help, music. The chip under the power chip shows which.
import { WEAPONS, weaponUnlocked } from './weapons.js';
import { Glyphs, glyphState, glyphHtml } from './glyphs.js';

const DEAD = 0.18; // stick deadzone (radial)
const AIM_SHOW = 10; // seconds the crosshair stays up after the last shot
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
// buttons held straight onto default key codes in play
const HOLD = { [B.A]: 'ShiftLeft', [B.B]: 'KeyQ', [B.X]: 'KeyF', [B.Y]: 'KeyV', [B.LB]: 'Space', [B.RB]: 'KeyZ', [B.L3]: 'KeyE', [B.R3]: 'KeyG' };
// the quick slot on d-pad down: everything that has no button of its own (has: is it yours yet)
const QUICK = [
  { code: 'KeyX', name: 'EMPTY JAR', has: (g) => (g.upgrades.jar || 0) > 0 },
  { code: 'KeyC', name: 'WARDROBE' },
  { code: 'KeyJ', name: 'REPUTATION LOG' },
  { code: 'KeyP', name: 'PEN LINK', has: (g) => (g.upgrades.penlink || 0) > 0 },
  { code: 'KeyT', name: 'TELEPORTER', has: (g) => g.story && g.story.tech.includes('teleport') },
  { code: 'KeyH', name: 'HELP' },
  { code: 'KeyN', name: 'MUSIC ON / OFF' },
];
const QUICK_KEY = 'mr-pad-quick';
// the panels a highlight can work in, topmost first
const UI_ROOTS = ['settings', 'dialog', 'board', 'replog', 'wardrobe', 'casino', 'help', 'pause', 'death', 'globe-wrap'];
const FOCUSABLE = 'button, [data-i], [data-k], [data-f], [data-tab], a[href], input, select, .wd-tile, [role="button"]';

// which glyph set to show: PlayStation (Sony 054c) and Switch (Nintendo 057e) pads, else Xbox
function padKind(id = '') {
  if (/054c|dualsense|dualshock|playstation|wireless controller/i.test(id)) return 'ps';
  if (/057e|nintendo|switch|pro controller|joy-?con/i.test(id)) return 'switch';
  return 'xbox';
}

export class Gamepad {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.prev = [];
    this.holding = new Set(); // codes this pad is holding down in Input
    this.viewT = -1; // how long View has been held (tap = map, hold = recall)
    this.navT = 0; // menu navigation key-repeat
    this.navDir = null;
    this.focus = null;
    this.aimT = AIM_SHOW; // seconds since the last shot (starts faded out)
    this.held = false; // d-pad down is down (the bumpers now pick the quick slot)
    this.bumpMask = {}; // bumpers that picked it and are still down: not a skate / power press
    try { this.quick = localStorage.getItem(QUICK_KEY) || 'KeyX'; } catch { this.quick = 'KeyX'; }
    this.input.padMove = { x: 0, y: 0, on: false };
    this.kind = 'xbox';
    this.glyphs = new Glyphs();
    window.addEventListener('gamepadconnected', (e) => {
      this.game.hud.toast(`Controller connected: ${(e.gamepad.id || 'gamepad').replace(/\(.*\)/, '').trim().slice(0, 40)}`, 2.5);
    });
    window.addEventListener('gamepaddisconnected', () => { this.releaseAll(); this.setActive(false); });
    // back on the keyboard or mouse: the pad steps aside
    window.addEventListener('keydown', (e) => { if (!e.padSynth) this.setActive(false); }, true);
    window.addEventListener('mousedown', () => this.setActive(false), true);
  }

  setActive(on) {
    const I = this.input;
    if (I.padActive === on) return;
    I.padActive = on;
    document.body.classList.toggle('pad-on', on);
    if (on) this.game.hud.show('clickhint', false);
    else { this.clearFocus(); this.hideCursor(); this.releaseAll(); I.padMove.on = false; }
    // key names across the UI become this pad's buttons (and back), and so do the help tables
    this.glyphs.set(on, this.kind);
    const s = this.game.settings;
    if (s) s.updateHelp();
    // (the settings controls tab shows pad buttons or key binds, whichever is in use)
    if (s && s.open && s.tab === 'controls' && !s.rebinding) s.render();
  }

  // ---- per frame ----
  update(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; if (p.mapping === 'standard') break; }
    if (!gp) return;
    const kind = padKind(gp.id);
    if (kind !== this.kind) { this.kind = kind; if (this.input.padActive) { this.glyphs.set(false); this.glyphs.set(true, kind); } else glyphState.kind = kind; }
    const btn = gp.buttons.map((b) => !!b && (b.pressed || b.value > 0.5));
    if (this.comboMask && !btn[this.comboMask]) this.comboMask = 0;
    if (this.comboMask) btn[this.comboMask] = false; // (the Y that finished the combo isn't also "vehicle")
    const trig = (i) => (gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0);
    const stick = (ax, ay) => {
      const x = gp.axes[ax] || 0, y = gp.axes[ay] || 0;
      const m = Math.hypot(x, y);
      if (m < DEAD) return [0, 0];
      const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m; // (rescaled past the deadzone: no dead patch at the edge of it)
      return [x * k, y * k];
    };
    const [lx, ly] = stick(0, 1), [rx, ry] = stick(2, 3);
    const any = btn.some(Boolean) || lx || ly || rx || ry;
    if (any && !this.input.padActive) this.setActive(true);
    if (!this.input.padActive) { this.prev = btn; return; }
    const pressed = (i) => btn[i] && !this.prev[i];
    const released = (i) => !btn[i] && this.prev[i];
    const g = this.game;
    const menu = g.menu && g.menu.open;
    const st = g.state;
    if (st === 'play' && !menu && !(g.settings && g.settings.open)) this.devCombo(pressed, dt);
    const setOpen = g.settings && g.settings.open;
    const roul = st === 'casino' && !g.casino.mode && g.casino.tab === 'roulette' && !setOpen && !menu;
    if (!roul) this.hideCursor();
    if (setOpen) this.ui(btn, pressed, lx, ly, ry, dt); // settings sit over the title / pause card: they get the highlight
    else if (menu) this.titleMenu(btn, pressed, lx, ly, dt);
    else if (st === 'play') this.play(gp, btn, pressed, released, trig, lx, ly, rx, ry, dt);
    else if (st === 'derby') this.derby(btn, pressed, rx, ry, dt);
    else if (st === 'map') this.map(btn, pressed, released, trig, lx, ly, ry, dt);
    else if (roul) this.roulette(btn, pressed, trig, lx, ly, dt);
    else if (st === 'casino' && g.casino.mode) this.seated(g.casino.mode, btn, pressed, trig, lx, ly, dt);
    else if (st === 'dead') { this.releaseAll(); if (pressed(B.A) || pressed(B.START)) document.getElementById('death').click(); }
    else this.ui(btn, pressed, lx, ly, ry, dt);
    this.prev = btn;
  }

  // hidden dev menu: B, B, X, Y, each within 1.5 s of the last
  devCombo(pressed, dt) {
    const SEQ = [B.B, B.B, B.X, B.Y];
    this.comboT = (this.comboT || 0) - dt;
    if (this.comboT <= 0) this.comboI = 0;
    for (const i of SEQ) {
      if (!pressed(i)) continue;
      this.comboI = i === SEQ[this.comboI || 0] ? (this.comboI || 0) + 1 : i === SEQ[0] ? 1 : 0;
      this.comboT = 1.5;
      if (this.comboI === SEQ.length) {
        this.comboI = 0;
        this.comboMask = B.Y;
        this.releaseAll();
        this.game.cheats.dev();
      }
      break;
    }
  }

  // the crosshair (pad or mouse) shows while firing and fades away AIM_SHOW seconds after the last shot
  crosshair(dt) {
    const firing = this.game.state === 'play' && this.input.mouse[0];
    this.aimT = firing ? 0 : Math.min(this.aimT + dt, AIM_SHOW);
    document.body.classList.toggle('aim', this.aimT < AIM_SHOW);
  }

  // ---- play ----
  play(gp, btn, pressed, released, trig, lx, ly, rx, ry, dt) {
    const g = this.game, I = this.input;
    this.clearFocus();
    // sticks: analog movement (and WASD past halfway, for vehicles, tricks and anything reading keys)
    I.padMove.x = lx; I.padMove.y = ly; I.padMove.on = !!(lx || ly);
    this.set('KeyW', ly < -0.45); this.set('KeyS', ly > 0.45); this.set('KeyA', lx < -0.45); this.set('KeyD', lx > 0.45);
    this.look(rx, ry, dt);
    for (const i of [B.LB, B.RB]) if (!btn[i]) this.bumpMask[i] = false;
    for (const [i, code] of Object.entries(HOLD)) this.set(code, btn[i] && !((i == B.LB || i == B.RB) && (btn[B.DOWN] || this.bumpMask[i])));
    I.mouse[0] = trig(B.RT) > 0.35;
    I.mouse[2] = trig(B.LT) > 0.35;
    // (left/right are the weapons; with d-pad down held the bumpers pick the quick slot instead)
    if (pressed(B.LEFT) && !btn[B.DOWN]) this.cycleWeapon(-1);
    if (pressed(B.RIGHT) && !btn[B.DOWN]) this.cycleWeapon(1);
    if (pressed(B.UP)) I.wheelSteps += 1;
    // View: a tap opens the map, holding it is the emergency recall (R, held)
    if (btn[B.VIEW]) { this.viewT = this.viewT < 0 ? 0 : this.viewT + dt; this.set('KeyR', this.viewT > 0.35); }
    else if (this.viewT >= 0) { if (this.viewT <= 0.35) this.tap('KeyM'); this.set('KeyR', false); this.viewT = -1; }
    this.quickSlot(btn, pressed, dt);
    if (pressed(B.START)) this.pause();
  }

  // d-pad down: tap = use the quick slot; hold it and press LB / RB to pick which one (previous / next)
  quickSlot(btn, pressed) {
    const g = this.game;
    const list = QUICK.filter((q) => !q.has || q.has(g));
    let i = Math.max(0, list.findIndex((q) => q.code === this.quick));
    if (btn[B.DOWN]) {
      this.held = true;
      const step = pressed(B.LB) ? -1 : pressed(B.RB) ? 1 : 0;
      if (step) {
        this.picking = true; // (picked something: letting go of d-pad down won't also use it)
        this.bumpMask[step < 0 ? B.LB : B.RB] = true; // (and the bumper that picked it isn't a skate / power press)
        i = (i + step + list.length) % list.length;
        this.quick = list[i].code;
        try { localStorage.setItem(QUICK_KEY, this.quick); } catch { /* unavailable */ }
        if (g.audio && g.audio.tone) g.audio.tone(760, 0.04, 'square', 0.04);
      }
    } else if (this.held) {
      // let go: a quick tap uses it; after picking, it just stays picked
      if (!this.picking && list[i]) this.pulse(list[i].code);
      this.held = false;
      this.picking = false;
    }
    this.drawQuick(list, i);
  }

  // the chip: which feature d-pad down does (and, while it's held, the bumpers that change it)
  drawQuick(list, i) {
    let el = document.getElementById('padquick');
    if (!el) {
      el = document.createElement('div');
      el.id = 'padquick';
      el.className = 'chip';
      const p = document.getElementById('powerchip') || document.getElementById('weaponchip');
      if (p) p.after(el); else document.getElementById('hud').appendChild(el);
    }
    const cur = list[i] ? list[i].name : '—';
    const html = this.held
      ? `${glyphHtml(['LB'])} <span class="pq-on">${cur}</span> ${glyphHtml(['RB'])} <small>${i + 1}/${list.length}</small>`
      : `<b>↓</b> ${cur}`;
    if (el.innerHTML !== html) el.innerHTML = html;
    el.classList.toggle('picking', !!this.held);
  }
  // a key held for a couple of frames (some actions read it held, some on the press)
  pulse(code) {
    this.set(code, true);
    setTimeout(() => this.set(code, false), 60);
  }

  look(rx, ry, dt) {
    // a curve for precision near the centre, full speed at the edge (in mouse-pixel terms, so the
    // game's own look sensitivity and invert settings apply)
    this.input.dx += Math.sign(rx) * rx * rx * 1450 * dt;
    this.input.dy += Math.sign(ry) * ry * ry * 1000 * dt;
  }

  cycleWeapon(dir) {
    const g = this.game;
    const P = g.player;
    const n = WEAPONS.length;
    let i = P.weapon || 0;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (weaponUnlocked(WEAPONS[i], g.upgrades)) { this.tap('Digit' + (i + 1)); return; }
    }
  }

  pause() {
    const g = this.game;
    this.releaseAll();
    g.resumeState = g.state;
    g.state = 'paused';
    g.hud.show('pause', true);
    g.input.unlock();
  }

  // ---- watching a race ----
  derby(btn, pressed, rx, ry, dt) {
    this.clearFocus();
    this.look(rx, ry, dt);
    if (pressed(B.A)) this.tap('Space');
    if (pressed(B.Y) || pressed(B.RB)) this.tap('KeyC');
    if (pressed(B.START)) this.pause();
  }

  // ---- the globe map: a cursor on the left stick; RT, held, grabs the globe to drag it round ----
  map(btn, pressed, released, trig, lx, ly, ry, dt) {
    this.releaseAll();
    this.clearFocus();
    this.game.globe.padUpdate(lx, ly, trig(B.RT) > 0.35, ry, (btn[B.RB] ? 1 : 0) - (btn[B.LB] ? 1 : 0), dt);
    // (View closes on the release, so letting go of it can't be read as the tap that opens the map)
    if (pressed(B.B) || pressed(B.START)) this.key('Escape');
    else if (released(B.VIEW)) this.tap('KeyM');
  }

  // ---- seated at a casino game. Plinko: the left stick (or d-pad) aims, A or RT drops (held: a
  // stream). Blackjack: A deals and hits, X stands, Y doubles. Duck Derby: the left stick (or
  // d-pad) picks a duck, A starts the race. All three: LB / RB bet, B stands up ----
  seated(mode, btn, pressed, trig, lx, ly, dt) {
    const I = this.input;
    const games = this.game.casino.games;
    this.clearFocus();
    // (whatever was held walking up is let go; Space is Plinko's own)
    for (const code of [...this.holding]) if (code !== 'Space') this.set(code, false);
    I.padMove.on = false; I.mouse[0] = false; I.mouse[2] = false;
    if (mode === 'plinko') {
      games.padAim(lx || (btn[B.RIGHT] ? 1 : 0) - (btn[B.LEFT] ? 1 : 0), dt);
      this.set('Space', btn[B.A] || trig(B.RT) > 0.35);
    } else if (mode === 'duck') {
      this.set('Space', false);
      // (the ducks sit two by two on the bar: the highlight moves the way they're laid out)
      const d = games.dk;
      const dir = this.navigate(btn, lx, ly, dt);
      const to = d.pick + ({ left: d.pick % 2 ? -1 : 0, right: d.pick % 2 ? 0 : 1, up: d.pick > 1 ? -2 : 0, down: d.pick < 2 ? 2 : 0 }[dir] || 0);
      if (to !== d.pick && (d.phase === 'bet' || d.phase === 'done')) this.tap('Digit' + (to + 1));
      if (pressed(B.A)) this.tap('Space');
    } else {
      this.set('Space', false);
      // (A is whatever the big button is: deal between hands, hit during one)
      if (pressed(B.A)) this.tap(games.bj.phase === 'play' ? 'KeyH' : 'Space');
      if (pressed(B.X)) this.tap('KeyS');
      if (pressed(B.Y)) this.tap('KeyD');
      if (pressed(B.R3)) this.tap('KeyZ');
    }
    if (pressed(B.LB)) this.tap('ArrowLeft');
    if (pressed(B.RB)) this.tap('ArrowRight');
    if (pressed(B.B) || pressed(B.START)) { this.set('Space', false); this.key('Escape'); }
  }

  // ---- the casino's roulette table: the map's cursor again. The left stick moves it over the
  // panel; A or RT drops a chip on what it's over (or presses the button or tab it's on) ----
  roulette(btn, pressed, trig, lx, ly, dt) {
    this.releaseAll();
    const root = this.game.casino.root;
    const r = root.getBoundingClientRect();
    let c = this.cur;
    if (!c) {
      c = this.cur = { el: document.createElement('div'), x: 0, y: 0, on: false, down: false };
      c.el.id = 'padcursor';
      document.body.appendChild(c.el);
    }
    if (!c.on) {
      // (it starts in the middle of the numbers)
      const b = (root.querySelector('.rl-board') || root).getBoundingClientRect();
      c.x = b.left + b.width / 2; c.y = b.top + b.height / 2;
      c.on = true;
      c.el.style.display = '';
    }
    // (a curve for precision near the centre, full speed at the edge)
    const sp = Math.hypot(lx, ly) * 700 * dt;
    c.x = Math.max(Math.max(0, r.left), Math.min(Math.min(window.innerWidth, r.right), c.x + lx * sp));
    c.y = Math.max(Math.max(0, r.top), Math.min(Math.min(window.innerHeight, r.bottom), c.y + ly * sp));
    c.el.style.left = c.x + 'px'; c.el.style.top = c.y + 'px';
    const under = document.elementFromPoint(c.x, c.y);
    let hit = under && root.contains(under) ? under.closest('[data-rb], button, [data-act], [data-tab]') : null;
    if (hit && hit.disabled) hit = null;
    this.setFocus(hit);
    const down = btn[B.A] || trig(B.RT) > 0.35;
    if (down && !c.down && hit) hit.click();
    c.down = down;
    c.el.classList.toggle('down', down);
    if (pressed(B.LEFT)) this.tap('ArrowLeft');
    if (pressed(B.RIGHT)) this.tap('ArrowRight');
    if (pressed(B.X)) this.tap('Space');
    if (pressed(B.Y)) this.tap('KeyC');
    if (pressed(B.LB) || pressed(B.RB)) this.tab(root, pressed(B.RB) ? 1 : -1);
    if (pressed(B.B) || pressed(B.START)) this.key('Escape');
  }

  hideCursor() {
    const c = this.cur;
    if (!c || !c.on) return;
    c.on = false; c.down = false;
    c.el.style.display = 'none';
  }

  // ---- the title menu (it navigates by arrow keys itself) ----
  titleMenu(btn, pressed, lx, ly, dt) {
    this.releaseAll();
    const dir = this.navigate(btn, lx, ly, dt);
    if (dir) this.key({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[dir]);
    if (pressed(B.A) || pressed(B.START)) this.key('Enter');
    if (pressed(B.B)) this.key('Escape');
  }

  // ---- every other screen: a highlight over what's on it ----
  ui(btn, pressed, lx, ly, ry, dt) {
    const g = this.game;
    this.releaseAll();
    const root = this.uiRoot();
    if (!root) { if (pressed(B.START) && g.state === 'paused') this.resume(); return; }
    const items = [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    // (start on what's selected, or the first real choice: not the close button)
    // (a panel that redraws itself, like settings after a toggle, replaces the highlighted element: carry the highlight to its twin)
    if (this.focus && !items.includes(this.focus) && this.focusSig) {
      const twin = items.find((el) => this.sig(el) === this.focusSig);
      if (twin) { this.focus = null; this.setFocus(twin, true); }
    }
    if (!this.focus || !items.includes(this.focus)) this.setFocus(items.find((el) => el.matches('.sel, .is-on, .pad-default')) || items.find((el) => !/close|✕|leave|back/i.test(el.textContent || '')) || items[0] || null);
    const dir = this.navigate(btn, lx, ly, dt);
    const f = this.focus;
    if (dir && f && f.type === 'range' && (dir === 'left' || dir === 'right')) {
      // a slider: left and right move it
      const step = +f.step || ((+f.max - +f.min) / 20) || 1;
      f.value = String(Math.max(+f.min, Math.min(+f.max, +f.value + (dir === 'right' ? step : -step))));
      f.dispatchEvent(new Event('input', { bubbles: true }));
      f.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (dir && f && f.dataset.adj && (dir === 'left' || dir === 'right')) {
      // an adjustable row (the dev menu's speed multiplier): left and right change it
      f.dispatchEvent(new CustomEvent('adj', { detail: dir === 'right' ? 1 : -1 }));
    } else if (dir) this.setFocus(this.nearest(items, f, dir) || f);
    if (pressed(B.A) && this.focus) {
      const el = this.focus;
      if (el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change', { bubbles: true })); }
      else el.click();
    }
    // (settings close back to whatever opened them: resuming from under them would leave them up)
    const setOpen = g.settings && g.settings.open;
    if (pressed(B.B) || pressed(B.START)) { if (g.state === 'paused' && !setOpen) this.resume(); else this.key('Escape'); }
    if (pressed(B.LB) || pressed(B.RB)) this.tab(root, pressed(B.RB) ? 1 : -1);
    // the right stick scrolls whatever scrolls
    if (ry) {
      let s = this.focus && this.focus.parentElement;
      while (s && s !== document.body && !(s.scrollHeight > s.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
      // (focus on a tab or footer button sits outside the scroller: fall back to the panel's own)
      if (!s || s === document.body) s = [...root.querySelectorAll('*')].find((el) => el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.getClientRects().length);
      if (s && s !== document.body) s.scrollTop += ry * 900 * dt;
    }
  }

  resume() {
    const g = this.game;
    document.getElementById('pause').click();
    g.hud.show('clickhint', false);
  }

  uiRoot() {
    for (const id of UI_ROOTS) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('hidden') && el.getClientRects().length) return el;
    }
    return null;
  }

  // tabs: the selected one's siblings (wardrobe tabs, casino tabs, settings tabs)
  tab(root, dir) {
    const tabs = [...root.querySelectorAll('[data-tab], .tabs button, .wd-tabs button, .set-tabs button')].filter((el) => el.getClientRects().length);
    if (!tabs.length) return;
    let i = tabs.findIndex((t) => t.classList.contains('on') || t.classList.contains('active') || t.getAttribute('aria-selected') === 'true');
    i = ((i < 0 ? 0 : i) + dir + tabs.length) % tabs.length;
    tabs[i].click();
    this.focus = null;
  }

  // d-pad or left stick, with a key repeat: 'up' | 'down' | 'left' | 'right' | null
  navigate(btn, lx, ly, dt) {
    let d = btn[B.UP] ? 'up' : btn[B.DOWN] ? 'down' : btn[B.LEFT] ? 'left' : btn[B.RIGHT] ? 'right' : null;
    if (!d && Math.hypot(lx, ly) > 0.55) d = Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 'right' : 'left') : (ly > 0 ? 'down' : 'up');
    if (!d) { this.navDir = null; return null; }
    if (d !== this.navDir) { this.navDir = d; this.navT = 0.38; return d; }
    this.navT -= dt;
    if (this.navT <= 0) { this.navT = 0.11; return d; }
    return null;
  }

  // the closest item in that direction (straight ahead counts for more than off to the side)
  nearest(items, from, dir) {
    if (!from) return items[0];
    const a = from.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestS = Infinity;
    for (const el of items) {
      if (el === from || from.contains(el) || el.contains(from)) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
      const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
      const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 2) continue;
      // (up / down take the next row first, then the closest across it: a slider's centre is far from a button at the row's end)
      const s = dir === 'up' || dir === 'down' ? along * 6 + side * 0.5 : along + side * 2.2;
      if (s < bestS) { bestS = s; best = el; }
    }
    return best;
  }

  // what identifies an element across a redraw: its data-* attributes (the settings rows are all keyed that way)
  sig(el) {
    return Object.entries(el.dataset).map(([k, v]) => `${k}=${v}`).join('&') || null;
  }

  setFocus(el, quiet) {
    if (this.focus === el) return;
    if (this.focus) this.focus.classList.remove('pad-focus');
    this.focus = el;
    this.focusSig = el ? this.sig(el) : null;
    if (!el) return;
    if (quiet) { el.classList.add('pad-focus'); return; }
    el.classList.add('pad-focus');
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    // (hover effects follow the highlight: the wardrobe previews what it's on, tips show)
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    if (this.game.audio && this.game.audio.tone) this.game.audio.tone(900, 0.03, 'square', 0.03);
  }

  clearFocus() { if (this.focus) { this.focus.classList.remove('pad-focus'); this.focus = null; } }

  // ---- into Input ----
  set(code, on) {
    const I = this.input;
    if (on) {
      if (this.holding.has(code)) return;
      this.holding.add(code);
      if (!I.keys.has(code)) I.justPressed.add(code);
      I.keys.add(code);
      if (I.onKey) I.onKey(code, { padSynth: true });
    } else if (this.holding.has(code)) {
      this.holding.delete(code);
      I.keys.delete(code);
    }
  }

  tap(code) {
    const I = this.input;
    I.justPressed.add(code);
    if (I.onKey) I.onKey(code, { padSynth: true });
  }

  // a real key event, for screens that listen to the DOM (the title menu, Escape everywhere)
  key(code) {
    const e = new KeyboardEvent('keydown', { code, key: code === 'Escape' ? 'Escape' : code, bubbles: true, cancelable: true });
    e.padSynth = true;
    window.dispatchEvent(e);
    const u = new KeyboardEvent('keyup', { code, key: code, bubbles: true });
    u.padSynth = true;
    window.dispatchEvent(u);
  }

  releaseAll() {
    for (const code of [...this.holding]) this.set(code, false);
    const I = this.input;
    I.padMove.on = false;
    if (I.padActive) { I.mouse[0] = false; I.mouse[2] = false; }
  }
}

import * as THREE from 'three';
import { toon, ink, glow, glowShared, textSprite, nameTag } from './toon.js';
import { makeFigure, makeSlotCabinet, SLOT_LAMP_OFF, plinkoConsoleModel, plinkoFrameModel, makeBouncer, makeChandelier, makeCasinoSign, makeBlackjackTable, makeClawMachine, makeDerbyPart, makeRacer } from './models.js';
import { pxCanvas } from './pixelIcons.js';
import { pixelFont } from './fonts.js';
import { faceInfo, glyphState } from './glyphs.js';
import { PEGS, SEGS, SLOTS, MULTS, SPACING, DROP_Y, DIVIDER_TOP, slotEdge, slotCentre } from './plinko.js';

// The Lucky Crater Casino: a neon box in the sun with a spinning sign, a giant tumbling die, a
// roulette wheel the size of a house and a carpet lined with slot machines. Walk in through the
// open doors for the big three: a BLACKJACK table, the DUCK DERBY track and a giant PLINKO board,
// plus the CLASSIC GAMES cabinets (the old overlay casino) and the prize counter.
// Game logic lives in casinoGames.js; this file only builds the place and hands back the props.

function mesh(geo, mat, outline = 0.12) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (outline) ink(m, outline);
  return m;
}

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// canvas text uses the game's pixel display face (Press Start 2P is wide: scale sizes ~0.6x)
export const FONT = (px) => pixelFont(px * 0.6);

function signTex() {
  return canvasTex(1024, 224, (x, w, h) => {
    x.fillStyle = '#120a1e'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#5a1a8f'; x.fillRect(10, 10, w - 20, h - 20);
    // marquee bulbs around the edge
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const p = t < 0.5 ? [30 + t * 2 * (w - 60), 26] : [30 + (t - 0.5) * 2 * (w - 60), h - 26];
      x.fillStyle = i % 2 ? '#fff6a8' : '#ff2e88';
      x.beginPath(); x.arc(p[0], p[1], 9, 0, Math.PI * 2); x.fill();
    }
    fitText(x, 'LUCKY CRATER CASINO', w - 80, 118);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 16; x.strokeStyle = '#120a1e'; x.lineJoin = 'round';
    x.strokeText('LUCKY CRATER CASINO', w / 2, h / 2 + 6);
    const g = x.createLinearGradient(0, 60, 0, 170);
    g.addColorStop(0, '#fff6a8'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#ff9f1c');
    x.fillStyle = g;
    x.fillText('LUCKY CRATER CASINO', w / 2, h / 2 + 6);
  });
}

// shrink the font until the text fits
export function fitText(x, text, maxW, px) {
  let s = px;
  x.font = FONT(s);
  while (s > 10 && x.measureText(text).width > maxW) { s -= 4; x.font = FONT(s); }
  return s;
}

// A controller face button drawn on a canvas, the way the pad's own family shows it (Xbox: dark button,
// coloured letter; PlayStation: dark button, coloured symbol; Switch: dark button, white letter)
const PAD_COL = { g: '#8ad63a', r: '#ff4a4a', b: '#3a8fe8', y: '#f0b020', p: '#ff7ad9' };
function drawFaceGlyph(x, token, kind, cx, cy, r) {
  const [txt, col] = faceInfo(token, kind);
  x.save();
  x.shadowBlur = 0;
  x.fillStyle = '#26232e'; x.strokeStyle = '#0a0810'; x.lineWidth = r * 0.16;
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); x.stroke();
  const c = kind === 'switch' ? '#fff4e0' : PAD_COL[col === 'b' && kind === 'ps' ? 'b' : col] || '#fff4e0';
  x.strokeStyle = c; x.fillStyle = c; x.lineWidth = r * 0.2; x.lineCap = 'round'; x.lineJoin = 'round';
  const s = r * 0.5;
  if (txt === '✕') { x.beginPath(); x.moveTo(cx - s, cy - s); x.lineTo(cx + s, cy + s); x.moveTo(cx + s, cy - s); x.lineTo(cx - s, cy + s); x.stroke(); }
  else if (txt === '○') { x.beginPath(); x.arc(cx, cy, s * 1.05, 0, Math.PI * 2); x.stroke(); }
  else if (txt === '□') { x.strokeRect(cx - s, cy - s, s * 2, s * 2); }
  else if (txt === '△') { x.beginPath(); x.moveTo(cx, cy - s * 1.1); x.lineTo(cx + s * 1.1, cy + s * 0.8); x.lineTo(cx - s * 1.1, cy + s * 0.8); x.closePath(); x.stroke(); }
  else { x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = FONT(r * 1.3); x.fillText(txt, cx, cy + r * 0.06); }
  x.restore();
}

// A neon sign board: dark panel, glowing border, big text. `pad` (a pad family, or null for the keyboard)
// picks how a "{F}" in the sub line is drawn: the letter F, or that family's button for the same action.
export function neonTex(text, { w = 1024, h = 256, color = '#ffd23f', edge = '#ff2e88', bg = '#120a1e', sub = null, pad = null } = {}) {
  return canvasTex(w, h, (x) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.strokeStyle = edge; x.lineWidth = 14; x.strokeRect(12, 12, w - 24, h - 24);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    fitText(x, text, w - 80, sub ? h * 0.5 : h * 0.62);
    x.shadowColor = color; x.shadowBlur = 24;
    x.lineWidth = 10; x.strokeStyle = '#120a1e'; x.lineJoin = 'round';
    const y = sub ? h * 0.4 : h / 2 + 4;
    x.strokeText(text, w / 2, y);
    x.fillStyle = color; x.fillText(text, w / 2, y);
    if (sub) {
      x.shadowBlur = 0;
      const plain = sub.replace('{F}', pad ? 'XX' : 'F');
      const px = fitText(x, plain, w - 80, h * 0.2);
      x.fillStyle = '#fff4e0';
      if (pad && sub.includes('{F}')) {
        const [a, b] = sub.split('{F}');
        const gr = px * 0.62, gap = px * 0.35;
        const wa = x.measureText(a).width, wb = x.measureText(b).width, total = wa + gr * 2 + gap * 2 + wb;
        let cx = w / 2 - total / 2;
        x.textAlign = 'left'; x.fillText(a, cx, h * 0.76); cx += wa + gap;
        drawFaceGlyph(x, 'X', pad, cx + gr, h * 0.76, gr); cx += gr * 2 + gap;
        x.fillStyle = '#fff4e0'; x.fillText(b, cx, h * 0.76);
        x.textAlign = 'center';
      } else x.fillText(plain, w / 2, h * 0.76);
    }
  });
}

function pipTex(n) {
  return canvasTex(128, 128, (x, w) => {
    x.fillStyle = '#fff4e0'; x.fillRect(0, 0, w, w);
    x.strokeStyle = '#120a1e'; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, w - 8);
    const P = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]] }[n];
    x.fillStyle = n === 1 ? '#ff2a4a' : '#120a1e';
    for (const [a, b] of P) { x.beginPath(); x.arc(a * 32, b * 32, n === 1 ? 18 : 12, 0, Math.PI * 2); x.fill(); }
  });
}

const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function wheelTex() {
  return canvasTex(512, 512, (x, w) => {
    const c = w / 2, n = WHEEL.length;
    x.fillStyle = '#120a1e'; x.beginPath(); x.arc(c, c, c, 0, Math.PI * 2); x.fill();
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const v = WHEEL[i];
      x.fillStyle = v === 0 ? '#1f8a4a' : REDS.has(v) ? '#d7263d' : '#1a1426';
      x.beginPath(); x.moveTo(c, c); x.arc(c, c, c - 10, a0, a1); x.closePath(); x.fill();
      x.save();
      x.translate(c, c); x.rotate((a0 + a1) / 2 + Math.PI / 2);
      x.fillStyle = '#fff4e0'; x.font = FONT(30); x.textAlign = 'center';
      x.fillText(String(v), 0, -c + 44);
      x.restore();
    }
    x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(c, c, c * 0.52, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#5a1a8f'; x.beginPath(); x.arc(c, c, c * 0.44, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#ffd23f'; x.lineWidth = 14;
    for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.cos(i * Math.PI / 2) * c * 0.44, c + Math.sin(i * Math.PI / 2) * c * 0.44); x.stroke(); }
    x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(c, c, 26, 0, Math.PI * 2); x.fill();
  });
}

function screenTex(text, bg) {
  return canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = '#120a1e'; x.fillRect(0, 0, w, h);
    x.fillStyle = bg; x.fillRect(8, 8, w - 16, h - 16);
    fitText(x, text, w - 30, 84);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 10; x.strokeStyle = '#120a1e'; x.strokeText(text, w / 2, h / 2 + 4);
    x.fillStyle = '#ffd23f'; x.fillText(text, w / 2, h / 2 + 4);
  });
}

function carpetTex() {
  const t = canvasTex(256, 256, (x, w) => {
    x.fillStyle = '#3b0f4f'; x.fillRect(0, 0, w, w);
    x.strokeStyle = '#ffd23f'; x.lineWidth = 6;
    for (const [cx, cy] of [[0, 0], [w, 0], [0, w], [w, w], [w / 2, w / 2]]) {
      x.beginPath(); x.moveTo(cx, cy - 60); x.lineTo(cx + 60, cy); x.lineTo(cx, cy + 60); x.lineTo(cx - 60, cy); x.closePath(); x.stroke();
    }
    x.fillStyle = '#ff2e88';
    for (const [cx, cy] of [[w / 2, 0], [0, w / 2], [w, w / 2], [w / 2, w]]) { x.beginPath(); x.arc(cx, cy, 14, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#2ee6ff';
    x.beginPath(); x.arc(w / 2, w / 2, 9, 0, Math.PI * 2); x.fill();
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 9);
  return t;
}

// The blackjack felt's print (a half disc, the dealer's flat edge at the top; the plane is 2R by R, so 1024 px across is 2R metres). Laid out to
// the table's zones (tools/blender/build_blackjack.py ZONES), which nothing of the model may stand in: the two card rows are the red areas, each with
// a gold bracket at every corner exactly on its edge, the bet circle is on its own, and the lettering runs round the rim outside the bet stacks.
export const BJ_AREAS = { x: 1.6, dealer: [0.26, 0.98], player: [1.39, 2.26] }; // (x: half the width; z from, to: table-local metres)
function feltTex(R) {
  return canvasTex(1024, 512, (x, w, h) => {
    const PX = w / (2 * R), mx = (m) => w / 2 + m * PX, mz = (m) => m * PX;
    x.clearRect(0, 0, w, h);
    x.fillStyle = '#14603a';
    x.beginPath(); x.moveTo(0, 0); x.arc(w / 2, 0, w / 2, 0, Math.PI); x.closePath(); x.fill();
    const g = x.createRadialGradient(w / 2, 0, 40, w / 2, 0, w / 2);
    g.addColorStop(0, 'rgba(125,255,106,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
    x.fillStyle = g; x.fill();
    // a double gold pinstripe round the edge and an inner arc
    x.strokeStyle = '#ffd23f'; x.lineWidth = 5;
    x.beginPath(); x.arc(w / 2, 0, w / 2 - 8, 0.02 * Math.PI, 0.98 * Math.PI); x.stroke();
    x.lineWidth = 2; x.beginPath(); x.arc(w / 2, 0, w / 2 - 19, 0.02 * Math.PI, 0.98 * Math.PI); x.stroke();
    x.lineWidth = 3; x.beginPath(); x.arc(w / 2, 0, mz(2.42), 0.17 * Math.PI, 0.83 * Math.PI); x.stroke();
    // the lettering along the rim, outside the bet stacks
    x.font = FONT(26); x.textAlign = 'center'; x.textBaseline = 'middle';
    const msg = 'BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON 17', r = mz(3.12);
    let a = Math.PI / 2 + (x.measureText(msg).width / r) / 2;
    for (const ch of msg) {
      const cw = x.measureText(ch).width;
      a -= cw / 2 / r;
      x.save(); x.translate(w / 2 + Math.cos(a) * r, Math.sin(a) * r); x.rotate(a - Math.PI / 2);
      x.lineWidth = 6; x.lineJoin = 'round'; x.strokeStyle = '#0a3a22'; x.strokeText(ch, 0, 0);
      x.fillStyle = '#ffd23f'; x.fillText(ch, 0, 0); x.restore();
      a -= cw / 2 / r;
    }
    // the card rows: a red area each (the cards lie in them), a gold bracket on each corner
    for (const [z0, z1] of [BJ_AREAS.dealer, BJ_AREAS.player]) {
      const x0 = mx(-BJ_AREAS.x), x1 = mx(BJ_AREAS.x), y0 = mz(z0), y1 = mz(z1);
      x.fillStyle = '#a81c3e';
      x.beginPath(); x.roundRect(x0, y0, x1 - x0, y1 - y0, 8); x.fill();
      x.strokeStyle = '#ffd23f'; x.lineWidth = 4; x.lineJoin = 'miter'; x.lineCap = 'butt';
      const L = 28, o = 2; // (the line's own centre on the edge, so it covers the area's edge exactly)
      for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
        x.beginPath(); x.moveTo(cx + sx * L, cy + sy * o); x.lineTo(cx + sx * o, cy + sy * o); x.lineTo(cx + sx * o, cy + sy * L); x.stroke();
      }
    }
    // the bet circle, a double ring with BET in it
    x.strokeStyle = '#fff4e0'; x.lineWidth = 4; x.beginPath(); x.arc(mx(0), mz(2.72), 0.34 * PX, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 2; x.beginPath(); x.arc(mx(0), mz(2.72), 0.28 * PX, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#fff4e0'; x.font = FONT(22); x.fillText('BET', mx(0), mz(2.72));
    // the strip between the two rows: the house's one joke, small
    x.fillStyle = 'rgba(255,244,224,0.8)'; x.font = FONT(20); x.fillText('INSURANCE IS FOR COWARDS', mx(0), mz(1.18));
    // the suits at the corners of the arc, and a gold crescent at the dealer's edge
    x.fillStyle = '#ffd23f'; x.font = '52px serif';
    x.fillText('♠', mx(-2.9), mz(0.52)); x.fillText('♥', mx(2.9), mz(0.52));
    x.fillText('♦', mx(-2.55), mz(1.55)); x.fillText('♣', mx(2.55), mz(1.55));
    x.fillStyle = 'rgba(255,210,63,0.9)'; x.beginPath(); x.arc(mx(0), mz(0.1), 22, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#14603a'; x.beginPath(); x.arc(mx(0) + 8, mz(0.1) - 4, 19, 0, Math.PI * 2); x.fill();
  });
}

// the finish line itself: a strip of two columns of squares across the lanes (the plane is 0.5 m along the track by the basin's width)
export function finishTex() {
  return canvasTex(32, 256, (x) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 16; j++) { x.fillStyle = (i + j) % 2 ? '#120a1e' : '#fff4e0'; x.fillRect(i * 16, j * 16, 16, 16); } });
}
export function checkerTex() {
  return canvasTex(256, 64, (x, w, h) => {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#120a1e' : '#fff4e0'; x.fillRect(i * 16, j * 16, 16, 16); }
    void w; void h;
  });
}

export function waterTex() {
  const t = canvasTex(128, 64, (x, w, h) => {
    x.fillStyle = '#1aa9d6'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#7fe8ff'; x.lineWidth = 5;
    for (let k = 0; k < 2; k++) {
      x.beginPath();
      for (let i = 0; i <= w; i += 4) x.lineTo(i, h * (0.3 + k * 0.45) + Math.sin((i / w) * Math.PI * 4) * 5);
      x.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 1);
  return t;
}

// ---- Slot-machine cabinets (the carousels outside, and the Classic Games corner inside) ----
// The model is built in Blender (tools/blender/build_slots.py, models.js makeSlotCabinet); here it gets its pictures: the marquee with the
// cabinet's name, the pixel sprites on its sides and the pixel-reel screen, which scrolls while a patron plays. What never moves is frozen
// (`userData.stat`, which the world merges: the marquee and each side picture share one material, so a whole carousel is a few draw calls);
// the cabinet itself is the lever, the lamp bar and the screen, which a patron works through its userData.
const SLOT_FACES = ['777', 'BAR', '$$$', 'JKP', '7♦7', 'WIN', 'SPIN'];
const SLOT_REELS = ['moon', 'comet', 'rocket', 'alien', 'ufo', 'diamond', 'wild']; // (the symbols of the overlay's slots)
const SLOT_ART = { low: ['ufo', 'alien', 'rocket', 'moon', 'comet', 'diamond', 'wild'], up: ['star', 'crown', 'coin', 'chip', 'flame', 'heart', 'spade'] };
const SLOT_POLY = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }; // (planes a few mm off a cabinet's face)
const slotMats = { marquee: new Map(), art: new Map(), idle: new Map() };
const slotLampOff = glowShared(SLOT_LAMP_OFF), slotLampOn = glowShared(0xffd23f);

function marqueeMat(face, color) {
  const key = face + color;
  let m = slotMats.marquee.get(key);
  if (!m) {
    const hex = '#' + color.toString(16).padStart(6, '0');
    m = new THREE.MeshBasicMaterial({
      map: canvasTex(256, 92, (x, w, h) => {
        x.fillStyle = '#120a1e'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#3d1366'; x.fillRect(5, 5, w - 10, h - 10);
        for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#fff6a8' : hex; x.fillRect(10 + i * 15.6, 8, 6, 6); x.fillRect(10 + i * 15.6, h - 14, 6, 6); }
        fitText(x, face, w - 40, 56);
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineWidth = 8; x.lineJoin = 'round'; x.strokeStyle = '#120a1e'; x.strokeText(face, w / 2, h / 2 + 2);
        x.fillStyle = '#ffd23f'; x.fillText(face, w / 2, h / 2 + 2);
      }),
      ...SLOT_POLY,
    });
    slotMats.marquee.set(key, m);
  }
  return m;
}

// a pixel sprite in a gold-framed dark square, for a cabinet's side
function artMat(name) {
  let m = slotMats.art.get(name);
  if (!m) {
    const t = canvasTex(64, 64, (x, w, h) => {
      x.fillStyle = '#ffd23f'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#1b1430'; x.fillRect(3, 3, w - 6, h - 6);
      const cv = pxCanvas(name);
      if (cv) {
        const k = Math.max(1, Math.floor(46 / Math.max(cv.width, cv.height)));
        x.imageSmoothingEnabled = false;
        x.drawImage(cv, Math.round((w - cv.width * k) / 2), Math.round((h - cv.height * k) / 2), cv.width * k, cv.height * k);
      }
    });
    t.magFilter = THREE.NearestFilter;
    m = new THREE.MeshBasicMaterial({ map: t, ...SLOT_POLY });
    slotMats.art.set(name, m);
  }
  return m;
}

// The pixel-reel screen: three reels of the overlay's sprites, `pos` the position of each in symbols (a fraction scrolls it)
function drawReels(x, w, h, pos) {
  x.fillStyle = '#0b0820'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#1b1040'; x.fillRect(6, 6, w - 12, h - 12);
  x.save();
  x.beginPath(); x.rect(8, 8, w - 16, h - 16); x.clip();
  x.imageSmoothingEnabled = false;
  const n = SLOT_REELS.length;
  for (let c = 0; c < 3; c++) {
    const base = Math.floor(pos[c]), f = pos[c] - base;
    for (let r = -1; r <= 3; r++) {
      const cv = pxCanvas(SLOT_REELS[(((base - r + c * 2) % n) + n) % n]);
      if (cv) x.drawImage(cv, 14 + c * 78, 12 + (r + f) * 56, 52, 52);
    }
  }
  x.restore();
  x.fillStyle = '#ff2a4a'; x.fillRect(6, h / 2 - 1, w - 12, 3);
}
const reelPos = (seed) => [seed, seed + 1, seed + 2];
function idleMat(seed) { // (the screen of a cabinet nobody has played yet: shared, one picture per seed)
  let m = slotMats.idle.get(seed);
  if (!m) slotMats.idle.set(seed, m = new THREE.MeshBasicMaterial({ map: canvasTex(256, 192, (x, w, h) => drawReels(x, w, h, reelPos(seed))), ...SLOT_POLY }));
  return m;
}

export function slotCabinet(color, idx) {
  const M = makeSlotCabinet(color);
  const sp = M.spots, n = SLOT_FACES.length;
  const plane = (spot, mat, ry = 0) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(spot.w, spot.h), mat);
    p.position.copy(spot.pos);
    p.rotation.set(-spot.tilt, ry, 0);
    return p;
  };
  M.stat.add(plane(sp.screen, marqueeMat(SLOT_FACES[idx % n], color)));
  for (const d of sp.decals) M.stat.add(plane(d, artMat(SLOT_ART[d.id][(idx + (d.side > 0 ? 0 : 3)) % SLOT_ART[d.id].length]), d.side * Math.PI / 2));
  const display = plane(sp.display, idleMat(idx % n));
  M.dyn.add(display);
  M.dyn.userData = { stat: M.stat, pull: M.pull, lamp: M.lamp, display, seed: idx % n, playing: 0, pullT: 0, lampOn: false, reel: null };
  return M.dyn;
}

// One frame of a cabinet being worked: the lever swings back, the lamp bar flashes while it is played, and the reels run, stopping one after
// another (a cabinet that has been played keeps its last picture on a screen of its own).
const REEL_STOP = [1.0, 0.65, 0.3];
export function updateSlot(u, dt, time) {
  u.playing = Math.max(0, u.playing - dt);
  const flash = u.playing > 0 && Math.sin(time * 18) > 0;
  if (flash !== u.lampOn) { u.lampOn = flash; u.lamp.material = flash ? slotLampOn : slotLampOff; }
  u.pull.rotation.x += ((u.pullT > 0 ? 1.1 : 0) - u.pull.rotation.x) * Math.min(1, dt * 14);
  u.pullT = Math.max(0, u.pullT - dt);
  if (u.playing > 0 && !u.reel) {
    const tex = canvasTex(256, 192, () => {});
    u.reel = { tex, ctx: tex.image.getContext('2d'), mat: new THREE.MeshBasicMaterial({ map: tex, ...SLOT_POLY }), pos: reelPos(u.seed), acc: 1, live: [true, true, true] };
    u.display.material = u.reel.mat;
  }
  const r = u.reel;
  if (!r || (!u.playing && !r.live.some(Boolean))) return;
  let draw = false;
  r.acc += dt;
  for (let c = 0; c < 3; c++) {
    if (u.playing > REEL_STOP[c]) { r.pos[c] += dt * 16; r.live[c] = true; }
    else if (r.live[c]) { r.pos[c] = Math.ceil(r.pos[c]); r.live[c] = false; draw = true; } // (lands on a symbol)
  }
  if (draw || r.acc > 1 / 15) {
    r.acc = 0;
    drawReels(r.ctx, 256, 192, r.pos);
    r.tex.needsUpdate = true;
  }
}

// A racing duck, ~1.3 m long, facing +x (tools/blender/build_duck.py): { root, bob, head, wings }. `n` picks which of the four (1 QUACKERS, 2 SIR WADDLES, 3 DUCKTOR WHO, 4 MOONBILL).
export function makeDuck(color, bill = 0xff9f1c, n = 1) {
  return makeRacer(n, color, bill);
}

// ---- layout (casino local frame; the facade faces +z) ----
export const HALL = { W: 26, FRONT: 12, BACK: -34, H: 16, DOOR: 5, DOOR_H: 9 };
// The blackjack table stands against the left wall, turned a quarter (its dealer's back counter on the wall, the players coming from +x): (x, z) is the middle of its
// flat edge on the floor, `yaw` its turn. The game thinks in the table's own frame (x right, z toward the player: cards and chips go in `bj.group`); bjPt gives a
// point of it in the casino's frame.
export const BJ = { x: -22.96, z: -8, R: 3.4, top: 1.16, yaw: Math.PI / 2 };
export const bjPt = (lx, y, lz) => { const c = Math.cos(BJ.yaw), s = Math.sin(BJ.yaw); return [BJ.x + lx * c + lz * s, y, BJ.z - lx * s + lz * c]; };
// The zero-g claw's machine stands on the front wall left of the doors, turned to face the hall (its back on the wallpaper at z = `z`); the claw's own frame (the
// machine's: x along the tank, y up, z toward the glass) goes to the hall's through clawPt.
export const CLAW = { x: -15.6, z: 10.98, yaw: Math.PI };
export const clawPt = (lx, y, lz) => [CLAW.x - lx, y, CLAW.z - lz];
export const BJ_RACK = new THREE.Vector3(-0.85, 1.3, -0.26); // (where the dealer's chips come from and go back to, table-local)
export const DUCK = { x0: -22, x1: 2, lanes: [-21.5, -23.1, -24.7, -26.3], water: 0.86, kiosk: [-10, -17.4] };
export const PLK = { x: 14, y: 1.2, z: -31 };
export const CLASSIC = { x: 22.4, mid: 2.5, zs: [-2.3, 0.9, 4.1, 7.3] };   // (the corner's slot cabinets: facing -x, 3.2 m apart)
export const PRIZE = { x: 22, z: -13 };

// The blackjack table with its felt (a Group at the table's own origin and frame; buildCasino stands it at BJ, turned, and freezes it): the Blender model
// (build_blackjack.py) and the felt plane the game prints (feltTex) laid at the model's `felt` pivot.
export function blackjackTable() {
  const bjt = makeBlackjackTable();
  const felt = new THREE.Mesh(new THREE.PlaneGeometry(bjt.spots.felt.w, bjt.spots.felt.h), new THREE.MeshToonMaterial({ map: feltTex(BJ.R), gradientMap: toon(0).gradientMap, transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  felt.rotation.x = -Math.PI / 2;
  felt.position.copy(bjt.spots.felt.pos);
  felt.receiveShadow = true;
  bjt.stat.add(felt);
  return bjt.stat;
}

export function buildCasino(w, loc) {
  // signs that name a button: redrawn with the pad's own glyph whenever a controller is in use
  const padSigns = [];
  const padSign = (mesh, text, opts) => padSigns.push({ mesh, text, opts, key: 'kb', cache: { kb: mesh.material.map } });
  const { W, FRONT: D, BACK, H, DOOR, DOOR_H } = HALL;
  const CZ = (D + BACK) / 2, DEP = D - BACK;
  const put = (o, x, z, y = 0, yaw = 0, dyn = false) => w.put(o, loc, x, z, y, yaw, dyn);
  const col = (spec) => w.col(loc, spec);
  // a slot cabinet: its frozen body (merged by the world) and the cabinet itself, which is frozen too unless a patron works it
  const placeSlot = (cab, x, z, yaw, animated) => { put(cab.userData.stat, x, z, 0, yaw); put(cab, x, z, 0, yaw, animated); };
  // glow materials shared by colour, so a run of trim pieces merges into a draw call or two (glow() makes a new one each time)
  const glowS = glowShared;

  // ---------- the hall: four walls with a wide door gap, a roof, a stepped crown ----------
  const wallM = toon(0x2a1450);
  const wall = (x, z, sx, sz, y0 = 0, y1 = H) => {
    const m = mesh(new THREE.BoxGeometry(sx, y1 - y0, sz), wallM, 0.15);
    put(m, x, z, (y0 + y1) / 2);
    col({ type: 'box', x, y: (y0 + y1) / 2, z, hx: sx / 2, hy: (y1 - y0) / 2, hz: sz / 2 });
  };
  wall(0, BACK, W * 2 + 2, 2);
  wall(-W, CZ, 2, DEP);
  wall(W, CZ, 2, DEP);
  wall(-(W + DOOR) / 2, D, W - DOOR, 2);
  wall((W + DOOR) / 2, D, W - DOOR, 2);
  wall(0, D, DOOR * 2, 2, DOOR_H, H);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 2, 1, DEP + 2), wallM);
  roof.receiveShadow = true; // no shadow cast: the hall stays bright inside (comic licence)
  ink(roof, 0.15);
  put(roof, 0, CZ, H + 0.5);
  col({ type: 'box', x: 0, y: H + 0.5, z: CZ, hx: W + 1, hy: 0.5, hz: DEP / 2 + 1 });
  put(new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 3.5, 1, DEP + 3.5), toon(0xffd23f)), 0, CZ, H + 1.4);
  put(mesh(new THREE.BoxGeometry(30, 4, 22), toon(0x5a1a8f), 0.15), 0, CZ, H + 4);
  put(mesh(new THREE.SphereGeometry(7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xffd23f), 0.15), 0, CZ, H + 6);
  col({ type: 'box', x: 0, y: H + 4, z: CZ, hx: 15, hy: 3, hz: 11 });
  // neon trim: pink roofline, cyan corners, gold belt
  const neon = (geo, color, x, z, y) => put(new THREE.Mesh(geo, glow(color)), x, z, y);
  neon(new THREE.BoxGeometry(W * 2 + 2.4, 0.5, 0.5), 0xff2e88, 0, D + 1.2, H - 0.4);
  neon(new THREE.BoxGeometry(W - DOOR + 0.4, 0.4, 0.4), 0xffd23f, -(W + DOOR) / 2, D + 1.2, H * 0.62);
  neon(new THREE.BoxGeometry(W - DOOR + 0.4, 0.4, 0.4), 0xffd23f, (W + DOOR) / 2, D + 1.2, H * 0.62);
  for (const sx of [-1, 1]) {
    neon(new THREE.BoxGeometry(0.5, H, 0.5), 0x2ee6ff, sx * (W + 1.2), D + 1.2, H / 2);
    neon(new THREE.BoxGeometry(0.5, H, 0.5), 0x2ee6ff, sx * (W + 1.2), BACK - 1.2, H / 2);
    neon(new THREE.BoxGeometry(0.5, 0.5, DEP + 2.4), 0xff2e88, sx * (W + 1.2), CZ, H - 0.4);
    // glowing door frame
    neon(new THREE.BoxGeometry(0.6, DOOR_H, 0.6), 0xffd23f, sx * DOOR, D + 1.1, DOOR_H / 2);
  }
  neon(new THREE.BoxGeometry(DOOR * 2 + 0.6, 0.6, 0.6), 0xffd23f, 0, D + 1.1, DOOR_H);
  // ...and the front's gold belt and pink roofline carry on round the sides and the back, so the hall is dressed all the way round
  const neonS = (geo, color, x, z, y) => put(new THREE.Mesh(geo, glowS(color)), x, z, y);
  neonS(new THREE.BoxGeometry(W * 2 + 2.4, 0.5, 0.5), 0xff2e88, 0, BACK - 1.2, H - 0.4);
  neonS(new THREE.BoxGeometry(W * 2 + 2.4, 0.4, 0.4), 0xffd23f, 0, BACK - 1.2, H * 0.62);
  for (const sx of [-1, 1]) neonS(new THREE.BoxGeometry(0.4, 0.4, DEP + 2.4), 0xffd23f, sx * (W + 1.2), CZ, H * 0.62);
  // card suits: the four icons run all the way round (the front's two pairs either side of the doors, then six down each side
  // wall and six along the back), in order, so the sequence carries on round the corners
  const suitMats = ['♠', '♥', '♦', '♣'].map((s, i) => new THREE.MeshBasicMaterial({
    transparent: true,
    map: canvasTex(128, 128, (x) => {
      x.font = '110px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 10; x.strokeStyle = '#120a1e'; x.strokeText(s, 64, 70);
      x.fillStyle = i % 3 ? '#ff2a4a' : '#fff4e0'; x.fillText(s, 64, 70);
    }),
  }));
  const suitGeo = new THREE.PlaneGeometry(4, 4);
  // (every suit icon is just a place: they're drawn at the end as four instanced meshes, one per suit, so the 20-odd icons cost four draws)
  const suitSpots = [[], [], [], []];
  const suitAt = (i, x, z, yaw, y = H * 0.8, size = 4) => suitSpots[i % 4].push({ x, y, z, yaw, size });
  [-19, -11, 11, 19].forEach((x, i) => suitAt(i, x, D + 1.05, 0)); // front: ♠ ♥ [doors] ♦ ♣
  const SUIT_N = 6, rowZ = (j) => BACK + 6 + j * ((DEP - 12) / (SUIT_N - 1)), rowX = (j) => -21 + j * 8.4;
  for (let j = 0; j < SUIT_N; j++) {
    suitAt(j, W + 1.05, rowZ(SUIT_N - 1 - j), Math.PI / 2); // right wall, front to back
    suitAt(j + 2, rowX(SUIT_N - 1 - j), BACK - 1.05, Math.PI); // back, right to left
    suitAt(j, -(W + 1.05), rowZ(j), -Math.PI / 2); // left wall, back to front
  }
  // marquee canopy over the open doors
  put(mesh(new THREE.BoxGeometry(14, 0.8, 7), toon(0xff2e88), 0.1), 0, D + 4.5, 9.6);
  for (const sx of [-1, 1]) put(mesh(new THREE.CylinderGeometry(0.3, 0.3, 9.6, 8), toon(0xffd23f), 0.06), sx * 6.5, D + 7.6, 4.8);
  const bulbMats = [glow(0xfff6a8), glow(0xfff6a8), glow(0xfff6a8)];
  const bulbGeo = new THREE.SphereGeometry(0.28, 8, 6);
  let k = 0;
  const bulb = (x, z, y) => put(new THREE.Mesh(bulbGeo, bulbMats[k++ % 3]), x, z, y);
  const bulbAt = bulb;
  const edgeM = toon(0xffd23f);
  const slotsSignM = new THREE.MeshBasicMaterial({ map: neonTex('SLOTS', { w: 512, h: 160, color: '#ffd23f', edge: '#ff2e88' }) });
  for (let i = 0; i <= 18; i++) bulb(-7 + i * (14 / 18), D + 8.05, 9.2);
  for (const sx of [-1, 1]) for (let i = 1; i <= 8; i++) bulb(sx * 7.05, D + 8 - i * (7 / 8), 9.2);
  for (let i = 0; i <= 40; i++) bulb(-W + i * (W * 2 / 40), D + 1.5, H + 2.1);
  // (the same chasing bulbs along the roof's other three edges: a coarser sphere, they're 17 m up)
  const edgeBulbGeo = new THREE.SphereGeometry(0.28, 6, 4);
  const edgeBulb = (x, z, y) => put(new THREE.Mesh(edgeBulbGeo, bulbMats[k++ % 3]), x, z, y);
  const nEdge = Math.round((DEP + 3) / 1.3);
  for (let i = 1; i <= nEdge; i++) for (const sx of [-1, 1]) edgeBulb(sx * (W + 1.5), D + 1.5 - i * ((DEP + 3) / nEdge), H + 2.1);
  for (let i = 1; i <= 41; i++) edgeBulb(-(W + 1.5) + i * ((W + 1.5) * 2 / 42), BACK - 1.5, H + 2.1);
  // red carpet + velvet ropes outside, and on inside up to the games
  const ASPH = 0.1; // the asphalt's thickness
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(6, 34), toon(0xd7263d));
  carpet.rotation.x = -Math.PI / 2;
  put(carpet, 0, D + 18, ASPH + 0.03); // (laid on the asphalt that runs from the doors to the plaza: settlements.js dressCasinoLot)
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) put(mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.4, 6), toon(0xffd23f), 0.04), sx * 3.6, D + 4 + i * 5.5, ASPH + 0.7);
    put(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 27.5, 5).rotateX(Math.PI / 2), toon(0x8a1030)), sx * 3.6, D + 4 + 13.75, ASPH + 1.1);
  }

  // the giant rotating sign
  put(mesh(new THREE.CylinderGeometry(0.6, 0.8, 10, 8), toon(0x3a3550), 0.08), 0, CZ, H + 12);
  const signMat = new THREE.MeshBasicMaterial({ map: signTex() });
  const edge = toon(0xffd23f);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(32, 7, 1.2), [edge, edge, edge, edge, signMat, signMat]);
  ink(sign, 0.25);
  put(sign, 0, CZ, H + 19.5, 0, true);

  // a huge tumbling die on a pedestal
  put(mesh(new THREE.CylinderGeometry(4, 4.8, 3, 16), toon(0xff2e88), 0.12), -36, 22, 1.5);
  col({ type: 'cyl', x: -36, z: 22, y0: -2, y1: 3, r: 4.8 });
  const dieMats = [1, 6, 2, 5, 3, 4].map((n) => new THREE.MeshToonMaterial({ map: pipTex(n), gradientMap: toon(0).gradientMap }));
  const die = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 7), dieMats);
  ink(die, 0.2);
  put(die, -36, 22, 10, 0, true);
  col({ type: 'sphere', x: -36, y: 10, z: 22, r: 5 });

  // the upright roulette wheel
  for (const sx of [-1, 1]) {
    const leg = mesh(new THREE.BoxGeometry(1.2, 13, 1.2), toon(0xffd23f), 0.08);
    leg.rotation.z = sx * 0.28;
    put(leg, 36 + sx * 3, 20, 6);
  }
  col({ type: 'box', x: 36, y: 5, z: 20, hx: 5, hy: 5, hz: 1 });
  const face = new THREE.MeshBasicMaterial({ map: wheelTex() });
  const wheel = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 1.4, 48), [toon(0x5a1a8f), face, face]);
  disc.rotation.x = Math.PI / 2;
  ink(disc, 0.2);
  wheel.add(disc);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(9.2, 0.45, 8, 48), toon(0xffd23f)));
  put(wheel, 36, 20, 12.5, 0, true);
  const pointer = mesh(new THREE.ConeGeometry(1, 2.4, 4), toon(0xfff4e0), 0.08);
  pointer.rotation.x = Math.PI;
  put(pointer, 36, 20.9, 22.6);
  col({ type: 'box', x: 36, y: 12.5, z: 20, hx: 9.5, hy: 9.5, hz: 1 });

  // slot carousels either side of the carpet: seven cabinets facing out round a glowing pillar with a
  // spinning SLOTS topper, under a canopy ringed with chasing bulbs, a stool at every machine
  const cols = [0xff2e88, 0x2ee6ff, 0x7dff6a, 0xff9f1c, 0xc77dff, 0xffd23f, 0x4d7cff];
  const cabinets = [], toppers = [], yardSpots = [];
  const CAR_R = 3.6, STAND_R = 6.2, CAR_N = 7;
  let n = 0;
  for (const sx of [-1, 1]) {
    const cx = sx * 15.8, cz = D + 19; // (a little out from the asphalt that runs to the doors, so a verge of dust is left between the two)
    put(mesh(new THREE.CylinderGeometry(7.4, 7.6, 0.3, 32), toon(0x2a1450), 0.06), cx, cz, 0.15);
    put(new THREE.Mesh(new THREE.TorusGeometry(7.3, 0.12, 6, 40).rotateX(Math.PI / 2), glow(sx < 0 ? 0xff2e88 : 0x2ee6ff)), cx, cz, 0.33);
    put(mesh(new THREE.CylinderGeometry(1.4, 1.6, 7.5, 16), toon(0x5a1a8f), 0.08), cx, cz, 3.75);
    for (const y of [1.5, 3.5, 5.5]) put(new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.1, 6, 20).rotateX(Math.PI / 2), glow(0xffd23f)), cx, cz, y);
    // the canopy (a ring roof on the pillar) with its chase bulbs
    const canopy = mesh(new THREE.CylinderGeometry(6.6, 6.9, 0.6, 32), toon(0xff2e88), 0.08);
    put(canopy, cx, cz, 7.6);
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; bulbAt(cx + Math.cos(a) * 6.95, cz + Math.sin(a) * 6.95, 7.6); }
    const topper = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.6, 0.3), [edgeM, edgeM, edgeM, edgeM, slotsSignM, slotsSignM]);
    ink(topper, 0.06);
    put(topper, cx, cz, 9.4, 0, true);
    toppers.push(topper);
    col({ type: 'cyl', x: cx, z: cz, y0: -1, y1: 8, r: CAR_R + 1.2 });   // (the cabinets' fronts and corners reach 4.7 m)
    for (let k2 = 0; k2 < CAR_N; k2++) {
      const a = (k2 / CAR_N) * Math.PI * 2 + (sx < 0 ? 0.3 : 0);
      const ox = Math.cos(a), oz = Math.sin(a);
      const yaw = Math.atan2(ox, oz); // the cabinet's front (+z) faces out from the pillar
      const cab = slotCabinet(cols[n % cols.length], n);
      placeSlot(cab, cx + ox * CAR_R, cz + oz * CAR_R, yaw, true);
      cabinets.push(cab);
      put(mesh(new THREE.CylinderGeometry(0.45, 0.3, 0.9, 10), toon(0xd7263d), 0.04), cx + ox * (CAR_R + 1.65), cz + oz * (CAR_R + 1.65), 0.45);
      // where a patron stands to play it, and a clear point further out to walk via
      yardSpots.push({ kind: 'slot', cab, x: cx + ox * STAND_R, z: cz + oz * STAND_R, yaw: yaw + Math.PI, ax: cx + ox * (STAND_R + 2.4), az: cz + oz * (STAND_R + 2.4), busy: false });
      n++;
    }
  }
  // places to stand and gawp: round the giant die, in front of the roulette wheel, by the chip
  // towers, and chatting by the doors
  for (let i = 0; i < 3; i++) { const a = 0.5 + i * 0.55; yardSpots.push({ kind: 'watch', x: -36 + Math.cos(a) * 8, z: 22 + Math.sin(a) * 8, look: [-36, 22], busy: false }); }
  for (let i = 0; i < 3; i++) yardSpots.push({ kind: 'watch', x: 32 + i * 4, z: 27, look: [36, 20], busy: false });
  for (const [x, z] of [[-24, D + 4], [24, D + 4], [-27, D + 32], [27, D + 34]]) yardSpots.push({ kind: 'watch', x: x * 0.85, z: z + 3, look: [x, z], busy: false });
  for (const [x, z] of [[-4.6, D + 6], [4.6, D + 8], [-4.6, D + 24], [4.6, D + 26]]) yardSpots.push({ kind: 'chat', x, z, look: [0, z], busy: false });
  for (const sp of yardSpots) if (sp.ax === undefined) { sp.ax = sp.x; sp.az = sp.z; }
  if (yardSpots.some((sp) => sp.look)) for (const sp of yardSpots) if (sp.look) sp.yaw = Math.atan2(sp.look[0] - sp.x, sp.look[1] - sp.z);
  // the patrons: wander from game to game
  const patrons = [];
  const suitCols = [0x16121f, 0xffc83a, 0xff7ad9, 0x2ee6ff, 0x7dff6a, 0xc77dff, 0xff9f1c, 0xfff4e0];
  for (let i = 0; i < 12; i++) {
    const f = makeFigure({ suit: suitCols[i % suitCols.length], helmet: 0xfff4e0, visor: [0xff2e88, 0x2ee6ff, 0xffd23f][i % 3], seed: 900 + i });
    const free = yardSpots.filter((sp) => !sp.busy);
    const sp = free[(i * 7) % free.length];
    sp.busy = true;
    f.root.position.set(sp.x, 0, sp.z);
    f.root.rotation.y = sp.yaw;
    loc.group.add(f.root);
    patrons.push({ ...f, spot: sp, path: [], stay: 3 + ((i * 1.7) % 9), phase: i, pull: 0 });
  }
  // the bouncer by the door (build_casino.py): a buff alien in a tux, arms crossed; he turns his head to watch people go in and breathes
  const bouncer = makeBouncer();
  bouncer.root.scale.setScalar(0.94);
  put(bouncer.root, 7.6, D + 2.6, 0, 0, true); // (no collider: the people here, like the patrons, are walked through, not round)

  // chip stacks out front
  const chipCols = [0xff2a4a, 0x2ee6ff, 0x111111, 0x7dff6a, 0xffd23f];
  [[-24, D + 4], [24, D + 4], [-27, D + 32], [27, D + 34]].forEach(([x, z], i) => {
    const hgt = 4 + (i % 2) * 3;
    for (let s = 0; s < hgt; s++) {
      const c = mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.6, 16), toon(chipCols[(s + i) % chipCols.length]), 0.05);
      c.rotation.y = s;
      put(c, x + Math.sin(s * 1.7) * 0.15, z, 0.3 + s * 0.62);
    }
    col({ type: 'cyl', x, z, y0: -2, y1: hgt * 0.62, r: 1.7 });
  });

  // sweeping searchlights on the roof
  const beamGeo = new THREE.ConeGeometry(7, 80, 16, 1, true).rotateX(Math.PI).translate(0, 40, 0);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff6a8, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beams = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    const b = new THREE.Mesh(beamGeo, beamMat);
    b.rotation.z = 0.4;
    pivot.add(b);
    put(pivot, sx * 20, CZ - 6, H + 2, sx, true);
    put(mesh(new THREE.CylinderGeometry(1, 1.3, 1.2, 10), toon(0x3a3550), 0.06), sx * 20, CZ - 6, H + 2);
    beams.push(pivot);
  }

  const small = textSprite('THE HOUSE ALWAYS WINS. USUALLY.', { color: '#ff7ad9', size: 50, scale: 0.2, bg: '#120a1e' });
  small.position.set(0, 11.2, D + 8.5);
  loc.group.add(small);
  const open = textSprite('OPEN 25/8 · WALK RIGHT IN', { color: '#7dff6a', size: 50, scale: 0.3, bg: '#120a1e' });
  open.position.set(0, 13.6, D + 8.5);
  loc.group.add(open);

  // ================= INTERIOR =================
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 - 1, DEP - 1), new THREE.MeshToonMaterial({ map: carpetTex(), gradientMap: toon(0).gradientMap }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  put(floor, 0, CZ, 0.05);
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(5, 16), toon(0xd7263d));
  runner.rotation.x = -Math.PI / 2;
  put(runner, 0, D - 8, 0.08);
  // wallpaper panels just inside each wall + neon bands
  const paper = toon(0x45207a);
  const panel = (x, z, len, yaw) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, H - 0.2), paper);
    put(p, x, z, H / 2, yaw);
  };
  panel(0, BACK + 1.02, W * 2 - 2, 0);
  panel(-W + 1.02, CZ, DEP - 2, Math.PI / 2);
  panel(W - 1.02, CZ, DEP - 2, -Math.PI / 2);
  for (const [x0, x1] of [[-W + 1, -DOOR - 1], [DOOR + 1, W - 1]]) panel((x0 + x1) / 2, D - 1.02, x1 - x0, Math.PI);
  const bandMats = [glow(0xff2e88), glow(0x2ee6ff)];
  for (const [y, m] of [[H - 0.8, bandMats[0]], [3.2, bandMats[1]]]) {
    put(new THREE.Mesh(new THREE.BoxGeometry(W * 2 - 2, 0.25, 0.25), m), 0, BACK + 1.1, y);
    for (const sx of [-1, 1]) put(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, DEP - 2), m), sx * (W - 1.1), CZ, y);
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 - 2, DEP - 2), toon(0x1c0f33));
  ceiling.rotation.x = Math.PI / 2;
  put(ceiling, 0, CZ, H - 0.02);
  // ceiling strip lights
  for (const z of [-26, -16, -6, 4]) put(new THREE.Mesh(new THREE.BoxGeometry(W * 2 - 6, 0.2, 0.5), glow(0xfff6a8)), 0, z, H - 0.15);
  // chandeliers (build_casino.py): the rose and chain are frozen (merged by the world), the crystal tiers turn slowly
  const chandeliers = [];
  for (const [x, z] of [[-12, -14], [12, -14], [0, -2]]) {
    const ch = makeChandelier();
    ch.root.remove(ch.spin);
    put(ch.root, x, z, H - 3.3);
    put(ch.spin, x, z, H - 3.3, 0, true);
    chandeliers.push(ch.spin);
  }
  // a welcome sign hanging inside the door, on chains from the ceiling (the frame is built in Blender)
  {
    const sg = makeCasinoSign('welcome_sign');
    const face = new THREE.Mesh(new THREE.PlaneGeometry(sg.face.w, sg.face.h), new THREE.MeshBasicMaterial({ map: neonTex('BLACKJACK · DUCK DERBY · PLINKO', { color: '#fff6a8', edge: '#2ee6ff' }) }));
    face.position.copy(sg.face.pos);
    sg.root.add(face);
    put(sg.root, 0, 5, 9.6);
  }

  // ---------- BLACKJACK TABLE (build_blackjack.py) ----------
  // `bjStat` is the frozen table (the world merges it); `bj` is the part that moves: the dealer, and the cards and chips the game puts down (casinoGames.js)
  const bj = new THREE.Group();
  const R = BJ.R;
  const bjStat = blackjackTable();
  const dealer = makeFigure({ suit: 0x16121f, helmet: 0xfff4e0, visor: 0xffd23f, scale: 1.05 });
  const bow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), glow(0xd7263d));
  bow.position.set(0, 1.62, 0.33);
  dealer.root.add(bow);
  dealer.root.position.set(0, 0, -0.9);
  bj.add(dealer.root);
  put(bjStat, BJ.x, BJ.z, 0, BJ.yaw);
  put(bj, BJ.x, BJ.z, 0, BJ.yaw, true);
  // the table, and the dealer's station behind it (the counter against the wall, so you cannot walk in behind the dealer)
  const [tx, , tz] = bjPt(0, 0, R / 2), [dx, , dz] = bjPt(0, 0, -1.05);
  col({ type: 'box', x: tx, y: 0.7, z: tz, hx: R + 0.2, hy: 0.7, hz: R / 2 + 0.2, yaw: BJ.yaw });
  col({ type: 'box', x: dx, y: 0.7, z: dz, hx: R + 0.2, hy: 0.7, hz: 0.95, yaw: BJ.yaw });
  // the BLACKJACK sign, mounted flat on the left wall over the dealer's counter
  {
    const sg = makeCasinoSign('wall_sign');
    const bjSign = new THREE.Mesh(new THREE.PlaneGeometry(sg.face.w, sg.face.h), new THREE.MeshBasicMaterial({ map: neonTex('BLACKJACK', { color: '#7dff6a', edge: '#ffd23f', sub: 'PAYS 3 TO 2 · {F} AT THE STOOL TO PLAY' }) }));
    bjSign.position.copy(sg.face.pos);
    sg.root.add(bjSign);
    put(sg.root, -W + 1.06, BJ.z, 5.0, Math.PI / 2); // (against the wallpaper panel, facing +x, over the dealer's counter and the wall's neon band)
    padSign(bjSign, 'BLACKJACK', { color: '#7dff6a', edge: '#ffd23f', sub: 'PAYS 3 TO 2 · {F} AT THE STOOL TO PLAY' });
  }

  // ---------- ZERO-G CLAW (build_claw.py): a glass tank on the front wall left of the doors, facing the hall ----------
  // `cm.stat` is the frozen machine (the world merges it, the glass stays); `clawDyn` is where casinoGames.js hangs the claw's moving parts and its boards.
  const cm = makeClawMachine();
  put(cm.stat, CLAW.x, CLAW.z, 0, CLAW.yaw);
  const clawDyn = new THREE.Group();
  put(clawDyn, CLAW.x, CLAW.z, 0, CLAW.yaw, true);
  col({ type: 'box', x: CLAW.x, y: 3.3, z: CLAW.z - 2.7, hx: 8.3, hy: 3.3, hz: 2.75 });
  // patrons come to watch (and shake their heads)
  for (const dx of [-4.8, 3.6, 7.2]) yardSpots.push({ kind: 'watch', x: CLAW.x + dx, z: CLAW.z - 7.4, ax: CLAW.x + dx, az: CLAW.z - 7.4, look: [CLAW.x + dx, CLAW.z - 3], yaw: Math.PI, busy: false });

  // ---------- DUCK DERBY TRACK (tools/blender/build_duck.py): a gilded basin with lane floats, a brass start gate, a finish arch with a photo-finish camera, the odds board's frame,
  // a bookmaker's kiosk and a velvet-roped brass rail. The game gives the pieces their pictures: the water, the lane numbers, the finish line, the banner, the board and the screen. ----------
  const L0 = DUCK.x0 - 2, L1 = DUCK.x1 + 2;
  const tlen = L1 - L0, tcx = (L0 + L1) / 2;
  const lz0 = DUCK.lanes[0] + 0.95, lz1 = DUCK.lanes[3] - 0.95, tcz = (lz0 + lz1) / 2, tdep = lz0 - lz1;
  const trough = makeDerbyPart('dd_trough');
  put(trough, tcx, tcz, 0);
  col({ type: 'box', x: tcx, y: 1.1, z: tcz, hx: tlen / 2 + 0.3, hy: 1.1, hz: tdep / 2 + 0.6 });
  const water = waterTex();
  const waterMat = new THREE.MeshBasicMaterial({ map: water });
  const laneCols = [0xffd23f, 0xff2e88, 0x2ee6ff, 0x7dff6a];
  const flat = (geo, mat, p) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; put(m, tcx + p.x, tcz + p.z, p.y); return m; };
  laneCols.forEach((c, i) => {
    const wp = trough.getObjectByName('water' + (i + 1)), np = trough.getObjectByName('num' + (i + 1));
    flat(new THREE.PlaneGeometry(wp.userData.w, wp.userData.h), waterMat, wp.position);
    flat(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (x) => {
      x.fillStyle = '#' + c.toString(16).padStart(6, '0'); x.beginPath(); x.arc(32, 32, 30, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#120a1e'; x.font = FONT(44); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(i + 1), 32, 35);
    }) }), np.position);
  });
  const checker = new THREE.MeshBasicMaterial({ map: checkerTex(), side: THREE.DoubleSide });
  const fl = trough.getObjectByName('finishLine');
  flat(new THREE.PlaneGeometry(fl.userData.w, fl.userData.h), new THREE.MeshBasicMaterial({ map: finishTex() }), fl.position);
  // the front rail: a brass post every 3.5 m along the player's side with a velvet rope between
  const railZ = lz0 + 0.55;
  for (let x = L0, k = 0; k <= 8; x += 3.5, k++) {
    put(makeDerbyPart('dd_railpost'), x, railZ, 0);
    if (k < 8) put(makeDerbyPart('dd_rope'), x, railZ, 0);
  }
  // the start gate: the frame stands, the brass grille is what lifts; three lamps count the start down (a lit disc each side of each lens)
  const gate = makeDerbyPart('dd_grille');
  put(gate, DUCK.x0 - 0.9, tcz, 1.35, 0, true);
  const gateFrame = makeDerbyPart('dd_gate');
  put(gateFrame, DUCK.x0 - 0.9, tcz, 0);
  const lamps = [0xff2a4a, 0xff9f1c, 0x7dff6a].map((c, k) => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(0.22) });
    const lp = gateFrame.getObjectByName('lamp' + (k + 1));
    for (const sx of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 14), mat);
      d.rotation.z = Math.PI / 2;
      put(d, DUCK.x0 - 0.9 + sx * lp.position.x, tcz + lp.position.z, lp.position.y, 0, true);
    }
    return { mat, color: new THREE.Color(c) };
  });
  const startPlate = gateFrame.getObjectByName('startSign');
  for (const sx of [-1, 1]) {
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(startPlate.userData.w, startPlate.userData.h), new THREE.MeshBasicMaterial({ map: canvasTex(256, 64, (x, pw, ph) => {
      x.fillStyle = '#120a1e'; x.fillRect(0, 0, pw, ph); x.fillStyle = '#ffd23f'; x.font = FONT(40); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('START', pw / 2, ph / 2 + 2);
    }) }));
    put(sp, DUCK.x0 - 0.9 + sx * (startPlate.position.x + 0.012), tcz + startPlate.position.z, startPlate.position.y, sx * Math.PI / 2);   // (faces along the track, like the lane plaques)
  }
  // the finish arch, its banner (the checker both ways) and the finish line
  const arch = makeDerbyPart('dd_finish');
  put(arch, DUCK.x1, tcz, 0);
  const bn = arch.getObjectByName('banner');
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(bn.userData.w, bn.userData.h), checker);
  put(banner, DUCK.x1, tcz, bn.position.y, Math.PI / 2);   // (across the lanes, like its beam)
  const ducks = laneCols.map((c, i) => {
    const d = makeDuck(c, i === 0 ? 0xff5a1f : 0xff9f1c, i + 1);
    put(d.root, DUCK.x0, DUCK.lanes[i], DUCK.water - 0.25, 0, true);
    return d;
  });
  // odds board on the back wall: its gilded frame (the Blender model faces +x, turned to face the hall) and the plane the game paints
  const oddsCanvas = document.createElement('canvas');
  oddsCanvas.width = 1024; oddsCanvas.height = 384;
  const oddsTex = new THREE.CanvasTexture(oddsCanvas);
  oddsTex.colorSpace = THREE.SRGBColorSpace;
  const board = makeDerbyPart('dd_board');
  put(board, tcx, BACK + 1.0, 8.4, -Math.PI / 2);
  const oddsFace = board.getObjectByName('face');
  // (clearly in front of its frame: it used to share the frame's front face and z-fought)
  const oddsBoard = new THREE.Mesh(new THREE.PlaneGeometry(oddsFace.userData.w, oddsFace.userData.h), new THREE.MeshBasicMaterial({ map: oddsTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  put(oddsBoard, tcx, BACK + 1.0 + oddsFace.position.x, 8.4);
  // betting kiosk: a bookmaker's window with its screen, a button in each duck's colour on the counter
  const kiosk = makeDerbyPart('dd_kiosk');
  const ksp = kiosk.getObjectByName('screen');
  const kscr = new THREE.Mesh(new THREE.PlaneGeometry(ksp.userData.w, ksp.userData.h), new THREE.MeshBasicMaterial({ map: neonTex('DUCK DERBY', { w: 512, h: 256, color: '#ffd23f', edge: '#2ee6ff', sub: '{F} · PICK A DUCK' }) }));
  padSign(kscr, 'DUCK DERBY', { w: 512, h: 256, color: '#ffd23f', edge: '#2ee6ff', sub: '{F} · PICK A DUCK' });
  kscr.position.copy(ksp.position);
  kscr.position.z += 0.02;
  kiosk.add(kscr);
  put(kiosk, DUCK.kiosk[0], DUCK.kiosk[1], 0, 0);
  col({ type: 'box', x: DUCK.kiosk[0], y: 0.9, z: DUCK.kiosk[1] - 0.1, hx: 1.5, hy: 0.9, hz: 0.85 });

  // ---------- PLINKO ----------
  const P = PLK;
  const bw = SLOTS * SPACING + 2.4, bh = DROP_Y + 2.4;
  put(mesh(new THREE.BoxGeometry(bw, bh, 0.5), toon(0x1a0f2e), 0.1), P.x, P.z - 0.45, P.y + bh / 2 - 0.9);
  // the cabinet that ties the board to the back wall: a plinth, two pillars, a cornice and the sign backing (tools/blender/build_plinko.py)
  const plkFrame = plinkoFrameModel();
  if (plkFrame) put(plkFrame, P.x, P.z, 0);
  col({ type: 'box', x: P.x, y: 6.9, z: P.z - 0.675, hx: bw / 2 + 0.95, hy: 6.9, hz: 1.375 });
  // header
  const plkSign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: neonTex('PLINKO', { color: '#2ee6ff', edge: '#ffd23f', sub: 'UP TO 50× · REAL MOON PHYSICS' }) }));
  put(plkSign, P.x, P.z - 0.1, P.y + bh + 0.4); // sits on the frame's sign backing
  // pegs: one instanced mesh, per-peg colour so hits can flash
  const pegGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.55, 10).rotateX(Math.PI / 2);
  const pegs = new THREE.InstancedMesh(pegGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), PEGS.length);
  const m4 = new THREE.Matrix4();
  const pegBase = new THREE.Color(0xd8d0ff);
  PEGS.forEach((p, i) => { m4.makeTranslation(p.x, p.y, 0); pegs.setMatrixAt(i, m4); pegs.setColorAt(i, pegBase); });
  pegs.frustumCulled = false;
  put(pegs, P.x, P.z, P.y, 0, true);
  // rails, dividers, floor
  for (const s of SEGS) {
    const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, s.divider ? 0.1 : 0.14, 0.6), glow(s.divider ? 0xfff4e0 : 0x2ee6ff));
    bar.rotation.z = Math.atan2(s.by - s.ay, s.bx - s.ax);
    bar.position.set(P.x + (s.ax + s.bx) / 2, P.y + (s.ay + s.by) / 2, P.z);
    bar.updateMatrix();
    bar.matrixAutoUpdate = false;
    loc.group.add(bar);
  }
  // slots: glowing back panels that light up, with the multiplier underneath
  const slotMats = [];
  const slotCol = (m) => (m >= 20 ? 0xff2a4a : m >= 5 ? 0xff9f1c : m >= 2 ? 0xffd23f : m >= 1 ? 0x7dff6a : m >= 0.5 ? 0x2ee6ff : 0x7b5cff);
  for (let s = 0; s < SLOTS; s++) {
    const c = new THREE.Color(slotCol(MULTS[s]));
    const mat = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(0.45) });
    mat.userData.base = c;
    slotMats.push(mat);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(SPACING - 0.08, DIVIDER_TOP), mat);
    put(back, P.x + slotCentre(s), P.z - 0.18, P.y + DIVIDER_TOP / 2);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(SPACING - 0.05, 0.62), new THREE.MeshBasicMaterial({ map: canvasTex(128, 88, (x, w, h) => {
      x.fillStyle = '#120a1e'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#' + c.getHexString(); x.fillRect(5, 5, w - 10, h - 10);
      const t = `${MULTS[s]}×`;
      fitText(x, t, w - 16, 60);
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = '#120a1e'; x.fillText(t, w / 2, h / 2 + 3);
    }) }));
    put(label, P.x + slotCentre(s), P.z + 0.08, P.y - 0.42);
  }
  void slotEdge;
  // the aim ball that rides the top of the chute, plus an arrow
  const aim = new THREE.Group();
  const aimBall = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), glow(0xffd23f));
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 4), glow(0xff2e88));
  arrow.rotation.x = Math.PI;
  arrow.position.y = 0.7;
  aim.add(aimBall, arrow);
  put(aim, P.x, P.z + 0.1, P.y + DROP_Y, 0, true);
  // the booth you stand at: the prize counter's gold and plum with card-suit panels (tools/blender/build_plinko.py)
  const con = plinkoConsoleModel();
  if (con) put(con, P.x, P.z + 6, 0);
  col({ type: 'box', x: P.x, y: 0.7, z: P.z + 6, hx: 1.8, hy: 0.7, hz: 0.7 });

  // ---------- CLASSIC GAMES corner + prize counter ----------
  CLASSIC.zs.forEach((z, i) => {
    placeSlot(slotCabinet([0xc77dff, 0x2ee6ff, 0xff9f1c, 0x7dff6a][i], [0, 3, 1, 5][i]), CLASSIC.x, z, -Math.PI / 2, false);
    col({ type: 'box', x: CLASSIC.x - 0.1, y: 2.2, z: z + 0.2, hx: 0.85, hy: 2.2, hz: 1.3 }); // (the lever side is +z)
  });
  const clSign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: neonTex('CLASSIC GAMES', { color: '#ff7ad9', edge: '#7dff6a', sub: 'SLOTS · ROULETTE · PRIZE WHEEL · HIGH-LOW' }) }));
  put(clSign, W - 1.15, CLASSIC.mid, 8.2, -Math.PI / 2);
  const vinnie = makeFigure({ suit: 0x1f8a4a, helmet: 0x7dff6a, visor: 0xffd23f, scale: 1.1 });
  put(vinnie.root, CLASSIC.x - 2.5, CLASSIC.zs[0] - 2.2, 0, -Math.PI / 2 - 0.5);
  const vin = nameTag(textSprite('VINNIE "THE VISOR" · PIT BOSS', { color: '#7dff6a', size: 44, scale: 0.22, bg: '#120a1e' }), 'VINNIE "THE VISOR" · PIT BOSS', '#7dff6a');
  vin.position.set(CLASSIC.x - 2.5, 3.4, CLASSIC.zs[0] - 2.2);
  loc.group.add(vin);
  // ---------- the prize counter: a gold booth against the right-hand wall, with a glass display case, a till, a header with
  // pennants and a lit prize wall behind the staff. Built in the booth's own frame: pcPut(o, lx, y, lz) takes lx along the
  // counter and lz out from its back toward the player (the booth faces -x). The collider below is the whole booth. ----------
  const pcPut = (o, lx, y, lz, yaw = 0, dyn = false) => put(o, PRIZE.x - lz, PRIZE.z + lx, y, yaw - Math.PI / 2, dyn);
  const pcBox = (sx, sy, sz, mat, lx, y, lz, ol = 0.03) => pcPut(mesh(new THREE.BoxGeometry(sx, sy, sz), mat, ol), lx, y, lz);
  const pcGlow = (sx, sy, sz, color, lx, y, lz) => pcPut(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), glowS(color)), lx, y, lz);
  const PCL = 7.2; // counter length (the collider's length)
  const pm = {
    gold: toon(0xffd23f), brass: toon(0xc79a1f), plum: toon(0x3b0f4f), dark: toon(0x1a1030), pink: toon(0xff2e88), white: toon(0xfff4e0),
    red: toon(0xd7263d), green: toon(0x7dff6a), cyan: toon(0x2ee6ff), steel: toon(0xc9c3d9), felt: toon(0x5a1a8f),
  };
  const prizeSpin = []; // the prizes that turn on their stands

  // the prizes: small models (about half a metre tall, standing on y = 0) for the display case and the prize wall
  const PRIZES_3D = ['trophy', 'rocket', 'crown', 'mite', 'duck', 'gem', 'helmet', 'hover', 'star', 'disco', 'rock'];
  const prize = (kind) => {
    const g = new THREE.Group();
    const add = (geo, mat, x = 0, y = 0, z = 0, ol = 0.02) => { const m = mesh(geo, mat, ol); m.position.set(x, y, z); g.add(m); return m; };
    if (kind === 'trophy') {
      add(new THREE.BoxGeometry(0.3, 0.06, 0.3), pm.felt, 0, 0.03, 0);
      add(new THREE.CylinderGeometry(0.035, 0.05, 0.18, 8), pm.gold, 0, 0.15, 0);
      add(new THREE.CylinderGeometry(0.2, 0.09, 0.26, 12), pm.gold, 0, 0.37, 0);
      for (const sx of [-1, 1]) add(new THREE.TorusGeometry(0.07, 0.022, 6, 12), pm.gold, sx * 0.22, 0.38, 0, 0.01);
    } else if (kind === 'rocket') {
      add(new THREE.CylinderGeometry(0.12, 0.14, 0.05, 10), pm.felt, 0, 0.025, 0);
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.38, 10), pm.white, 0, 0.24, 0);
      add(new THREE.ConeGeometry(0.1, 0.2, 10), pm.red, 0, 0.53, 0);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        add(new THREE.BoxGeometry(0.02, 0.14, 0.12), pm.red, Math.cos(a) * 0.12, 0.14, Math.sin(a) * 0.12, 0.01).rotation.y = Math.PI / 2 - a;
      }
      add(new THREE.SphereGeometry(0.045, 8, 6), glowS(0x2ee6ff), 0, 0.32, 0.095, 0);
    } else if (kind === 'crown') {
      add(new THREE.CylinderGeometry(0.17, 0.2, 0.1, 12), pm.pink, 0, 0.05, 0);
      add(new THREE.CylinderGeometry(0.2, 0.17, 0.12, 12), pm.gold, 0, 0.16, 0);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2, cx = Math.cos(a) * 0.17, cz = Math.sin(a) * 0.17;
        add(new THREE.ConeGeometry(0.05, 0.16, 6), pm.gold, cx, 0.3, cz, 0.01);
        add(new THREE.SphereGeometry(0.03, 6, 5), glowS(i % 2 ? 0xff2a4a : 0x2ee6ff), cx, 0.4, cz, 0);
      }
    } else if (kind === 'mite') { // a moon-mite plush
      add(new THREE.SphereGeometry(0.2, 12, 10), pm.green, 0, 0.19, 0, 0.025).scale.set(1.1, 0.9, 1);
      for (const sx of [-1, 1]) {
        add(new THREE.SphereGeometry(0.05, 8, 6), pm.white, sx * 0.08, 0.26, 0.17, 0.01);
        add(new THREE.SphereGeometry(0.025, 6, 5), pm.dark, sx * 0.08, 0.26, 0.215, 0);
        add(new THREE.CylinderGeometry(0.01, 0.01, 0.17, 5), pm.dark, sx * 0.07, 0.43, 0, 0).rotation.z = -sx * 0.35;
        add(new THREE.SphereGeometry(0.03, 6, 5), glowS(0xff2e88), sx * 0.105, 0.5, 0, 0);
      }
    } else if (kind === 'duck') {
      const d = makeDuck(0xffd23f);
      d.root.scale.setScalar(0.32);
      d.root.rotation.y = -Math.PI / 2; // (the duck faces +x; the prizes face the player, +z)
      g.add(d.root);
    } else if (kind === 'gem') {
      add(new THREE.CylinderGeometry(0.08, 0.12, 0.06, 10), pm.felt, 0, 0.03, 0);
      add(new THREE.OctahedronGeometry(0.2), pm.cyan, 0, 0.3, 0, 0.02).scale.y = 1.3;
    } else if (kind === 'helmet') {
      add(new THREE.CylinderGeometry(0.09, 0.13, 0.05, 10), pm.felt, 0, 0.025, 0);
      add(new THREE.CylinderGeometry(0.15, 0.17, 0.05, 10), pm.steel, 0, 0.09, 0, 0.01);
      add(new THREE.SphereGeometry(0.2, 14, 10), pm.white, 0, 0.26, 0, 0.025).scale.y = 0.95;
      add(new THREE.SphereGeometry(0.15, 10, 8), glowS(0xffd23f), 0, 0.27, 0.11, 0).scale.set(1, 0.65, 0.6);
    } else if (kind === 'hover') { // a toy hover-car
      add(new THREE.CylinderGeometry(0.1, 0.13, 0.08, 10), pm.felt, 0, 0.04, 0);
      add(new THREE.BoxGeometry(0.5, 0.1, 0.24), pm.pink, 0, 0.17, 0, 0.02);
      add(new THREE.SphereGeometry(0.11, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), pm.cyan, 0.03, 0.22, 0, 0.015);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8), glowS(0x2ee6ff), sx * 0.18, 0.115, sz * 0.09, 0);
    } else if (kind === 'star') {
      const sh = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.1 : 0.22;
        if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false });
      geo.translate(0, 0, -0.035);
      add(new THREE.CylinderGeometry(0.03, 0.05, 0.2, 8), pm.brass, 0, 0.1, 0);
      add(geo, pm.gold, 0, 0.42, 0, 0.015);
    } else if (kind === 'disco') {
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.15, 6), pm.steel, 0, 0.075, 0, 0);
      add(new THREE.IcosahedronGeometry(0.2, 1), pm.steel, 0, 0.35, 0, 0.02);
    } else { // a certified moon rock on a cushion
      add(new THREE.CylinderGeometry(0.17, 0.2, 0.08, 10), pm.red, 0, 0.04, 0);
      add(new THREE.DodecahedronGeometry(0.17), toon(0x6a5a52), 0, 0.2, 0, 0.02).scale.set(1.2, 0.8, 1);
    }
    return g;
  };
  // (a prize that spins is its own draw call, so only the gem and the star in the display case turn; the rest merge into the building)
  const stand = (kind, lx, y, lz, spin = false) => {
    const o = prize(kind);
    pcPut(o, lx, y, lz, 0, spin);
    if (spin) prizeSpin.push(o);
  };

  // the dais, and the counter: kick plate, gold body with five recessed panels (a card suit in each), neon and a pink top
  pcBox(PCL + 1.0, 0.08, 5.0, pm.felt, 0, 0.04, -1.1, 0.02);
  pcBox(PCL + 1.0, 0.1, 0.12, pm.gold, 0, 0.05, 1.4, 0.01);
  pcBox(PCL, 0.3, 1.5, pm.dark, 0, 0.23, 0);
  pcBox(PCL, 1.1, 1.6, pm.gold, 0, 0.93, 0, 0.06);
  pcBox(PCL + 0.4, 0.16, 1.95, pm.pink, 0, 1.56, 0, 0.04);
  pcBox(PCL + 0.5, 0.06, 0.1, pm.gold, 0, 1.67, 0.9, 0.01);
  pcGlow(PCL - 0.2, 0.06, 0.06, 0xff2e88, 0, 1.44, 0.83);
  pcGlow(PCL - 0.2, 0.05, 0.05, 0x2ee6ff, 0, 0.42, 0.78);
  for (let i = 0; i < 5; i++) {
    const lx = (i - 2) * 1.44;
    pcBox(1.22, 0.84, 0.04, pm.brass, lx, 0.93, 0.8, 0.01);
    pcBox(1.04, 0.68, 0.05, pm.plum, lx, 0.93, 0.81, 0);
    suitAt(i, PRIZE.x - 0.845, PRIZE.z + lx, -Math.PI / 2, 0.93, 0.6);
  }

  // the glass display case on the counter: two lit tiers of prizes
  const CX = -0.5;
  pcBox(3.6, 0.12, 0.9, pm.felt, CX, 1.70, 0, 0.02);
  // (the glass stands 2 cm clear of the felt floor: its bottom face used to sit exactly on the floor's top, y = 1.76, and the two
  // surfaces fought for the same pixels, a patchwork of tints across the case floor)
  pcPut(new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.38, 0.8), new THREE.MeshBasicMaterial({ color: 0xbff8ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })), CX, 2.47, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pcBox(0.07, 1.44, 0.07, pm.gold, CX + sx * 1.77, 2.46, sz * 0.42, 0.01);
  pcBox(3.65, 0.07, 0.95, pm.gold, CX, 3.2, 0, 0.02);
  pcBox(3.45, 0.04, 0.7, pm.felt, CX, 2.46, 0, 0);
  pcGlow(3.4, 0.04, 0.04, 0xfff6a8, CX, 3.14, 0.4);
  ['trophy', 'rocket', 'crown', 'helmet'].forEach((kind, i) => stand(kind, CX - 1.35 + i * 0.9, 1.76, 0));
  ['duck', 'mite', 'gem', 'star'].forEach((kind, i) => stand(kind, CX - 1.35 + i * 0.9, 2.48, 0, kind === 'gem' || kind === 'star'));

  // the till at the clerk's end, a service bell and the chip stacks at the other end
  const till = new THREE.Group();
  till.add(mesh(new THREE.BoxGeometry(0.7, 0.34, 0.55), pm.steel, 0.03));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshBasicMaterial({ map: screenTex('CHIPS', '#16703d') }));
  const screenTilt = new THREE.Group();
  screen.rotation.x = -0.5;
  screenTilt.add(screen);
  screenTilt.position.set(0, 0.34, -0.05);
  till.add(screenTilt);
  [pm.red, pm.green, pm.cyan, pm.gold].forEach((m, i) => { const key = mesh(new THREE.BoxGeometry(0.1, 0.04, 0.1), m, 0); key.position.set(-0.24 + i * 0.16, 0.18, 0.17); till.add(key); });
  pcPut(till, -3.05, 1.82, 0);
  const bell = new THREE.Group();
  const bellBase = mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 12), pm.dark, 0.01);
  bellBase.position.y = 0.02;
  const bellDome = mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), pm.gold, 0.01);
  bellDome.position.y = 0.04;
  const bellKnob = mesh(new THREE.SphereGeometry(0.03, 6, 5), pm.steel, 0);
  bellKnob.position.y = 0.18;
  bell.add(bellBase, bellDome, bellKnob);
  pcPut(bell, 1.95, 1.64, 0.4);
  [5, 8, 3].forEach((n, i) => {
    for (let s = 0; s < n; s++) pcPut(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 12), toon(chipCols[(s + i) % chipCols.length]), 0.01), 2.6 + i * 0.36, 1.67 + s * 0.065, 0.25);
  });

  // the header: two gold posts, a plum bar with a PRIZES board, chase bulbs, pennants
  for (const sx of [-1, 1]) pcPut(mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.0, 8), pm.gold, 0.04), sx * 3.45, 3.14, -0.1);
  pcBox(PCL, 0.9, 0.26, pm.plum, 0, 4.25, -0.1, 0.04);
  pcBox(PCL + 0.1, 0.07, 0.3, pm.gold, 0, 4.72, -0.1, 0.01);
  pcBox(PCL + 0.1, 0.07, 0.3, pm.gold, 0, 3.8, -0.1, 0.01);
  pcPut(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: neonTex('PRIZES', { w: 512, h: 128, color: '#ffd23f', edge: '#ff2e88' }) })), 0, 4.25, 0.05);
  const smallBulb = new THREE.SphereGeometry(0.07, 6, 5);
  for (let i = 0; i <= 22; i++) {
    const lx = -3.45 + i * 0.3;
    put(new THREE.Mesh(smallBulb, bulbMats[k++ % 3]), PRIZE.x - 0.1, PRIZE.z + lx, 4.82);
  }
  const flagGeo = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.17, 0), new THREE.Vector2(0.17, 0), new THREE.Vector2(0, -0.38)]));
  const flagMats = [0xff2e88, 0x2ee6ff, 0xffd23f, 0x7dff6a].map((c) => toon(c)); // (seen from the front only)
  for (let i = 0; i < 15; i++) pcPut(mesh(flagGeo, flagMats[i % 4], 0), -3.3 + i * 0.47, 3.77, 0.06);

  // the prize wall: three lit shelves of prizes against the wall behind the staff
  pcBox(PCL - 0.2, 3.9, 0.1, pm.plum, 0, 2.0, -2.93, 0.02);
  for (const sx of [-1, 1]) pcBox(0.14, 3.9, 0.6, pm.gold, sx * 3.45, 2.0, -2.65, 0.02);
  [1.5, 2.4, 3.3].forEach((y, row) => {
    pcBox(PCL - 0.6, 0.07, 0.56, pm.felt, 0, y, -2.62, 0.015);
    pcBox(PCL - 0.6, 0.1, 0.05, pm.gold, 0, y + 0.01, -2.34, 0.01);
    pcGlow(PCL - 0.7, 0.035, 0.035, row % 2 ? 0xff2e88 : 0x2ee6ff, 0, y - 0.07, -2.35);
    for (let i = 0; i < 6; i++) stand(PRIZES_3D[(row * 5 + i * 3) % PRIZES_3D.length], -2.75 + i * 1.1, y + 0.04, -2.62);
  });
  col({ type: 'box', x: PRIZE.x + 1.5, y: 1.5, z: PRIZE.z, hx: 2.4, hy: 1.5, hz: 3.6 });
  suitSpots.forEach((spots, i) => {
    const inst = new THREE.InstancedMesh(suitGeo, suitMats[i], spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), at = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    spots.forEach((sp, j) => inst.setMatrixAt(j, m4.compose(at.set(sp.x, sp.y, sp.z), q.setFromAxisAngle(Y, sp.yaw), sc.setScalar(sp.size / 4))));
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false; // (spread right round the building: always one draw)
    put(inst, 0, 0);
  });
  const prSign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: neonTex('PRIZE COUNTER', { color: '#ffd23f', edge: '#ff2e88', sub: 'CHIPS → DRIP' }) }));
  put(prSign, W - 1.15, PRIZE.z, 6.5, -Math.PI / 2);
  const clerk = makeFigure({ suit: 0xff7ad9, helmet: 0xfff4e0, visor: 0x2ee6ff });
  put(clerk.root, PRIZE.x + 1.5, PRIZE.z - 1.5, 0, -Math.PI / 2);

  // a handful of spectators who bob along
  const crowd = [];
  const spots = [[-4, -18.6, Math.PI], [-16, -18.4, Math.PI], [-21, -18.8, Math.PI + 0.3], [8.5, -23, 2.5], [19.5, -23.5, -2.6], [-8.5, -4, -1.2], [5, 2, 0.6]];
  spots.forEach(([x, z, yaw], i) => {
    const f = makeFigure({ suit: [0xffc83a, 0x2ee6ff, 0xff7ad9, 0x16121f, 0x7dff6a, 0xc77dff, 0xff9f1c][i], helmet: 0xfff4e0, visor: [0xff2e88, 0x241a5c, 0xffd23f][i % 3] });
    put(f.root, x, z, 0, yaw, true); // (no collider: a skater used to stop dead on these)
    crowd.push({ root: f.root, phase: i * 1.7, cheer: 0 });
  });

  loc.group.updateMatrixWorld(true);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(loc.group.quaternion);

  let chase = 0;
  // Patrons walk from spot to spot via the spots' clear approach points; at a slot machine they
  // stand and yank the handle every few seconds (the cabinet's lamp flashes, the screen jitters),
  // anywhere else they look at the attraction and shift about
  function pickSpot(pt) {
    const free = yardSpots.filter((sp) => !sp.busy && sp !== pt.spot);
    const sp = free[Math.floor(Math.random() * free.length)];
    if (!sp) return;
    pt.spot.busy = false;
    pt.path = [{ x: pt.spot.ax, z: pt.spot.az }, { x: sp.ax, z: sp.az }, { x: sp.x, z: sp.z }];
    sp.busy = true;
    pt.spot = sp;
    pt.stay = sp.kind === 'slot' ? 8 + Math.random() * 14 : 4 + Math.random() * 8;
  }
  function updatePatrons(dt, time) {
    for (const c of cabinets) updateSlot(c.userData, dt, time);
    for (const pt of patrons) {
      const p = pt.root.position;
      const tgt = pt.path[0];
      if (tgt) {
        const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.4) { pt.path.shift(); continue; }
        const k = Math.min(d, 1.5 * dt) / d;
        p.x += dx * k; p.z += dz * k;
        pt.root.rotation.y = Math.atan2(dx, dz);
        pt.phase += dt * 6;
        pt.legL.rotation.x = Math.sin(pt.phase) * 0.6;
        pt.legR.rotation.x = -Math.sin(pt.phase) * 0.6;
        if (pt.armL) { pt.armL.rotation.x = -Math.sin(pt.phase) * pt.swing; pt.armR.rotation.x = Math.sin(pt.phase) * pt.swing; }
        p.y = Math.abs(Math.sin(pt.phase)) * 0.12;
        continue;
      }
      // arrived: face the attraction
      const sp = pt.spot;
      let dy = sp.yaw - pt.root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      pt.root.rotation.y += dy * Math.min(1, dt * 5);
      pt.legL.rotation.x = pt.legR.rotation.x = 0;
      p.y = 0;
      if (sp.kind === 'slot') {
        // yank the handle every few seconds
        pt.pull -= dt;
        if (pt.pull <= 0) { pt.pull = 2.5 + Math.random() * 3; sp.cab.userData.pullT = 0.35; sp.cab.userData.playing = 1.6; }
        if (pt.armR) pt.armR.rotation.x = sp.cab.userData.pullT > 0 ? -2.0 : -0.9;
        if (pt.armL) pt.armL.rotation.x = -0.3;
      } else {
        if (pt.armL) { pt.armL.rotation.x = Math.sin(time * 1.3 + pt.phase) * 0.1; pt.armR.rotation.x = sp.kind === 'chat' ? -0.6 + Math.sin(time * 4 + pt.phase) * 0.4 : 0; }
      }
      pt.stay -= dt;
      if (pt.stay <= 0) pickSpot(pt);
    }
  }

  return {
    loc,
    up,
    entrance: w.toWorld(loc, 0, 1, D + 3),
    near(p) { return p.distanceTo(this.entrance) < 10; },
    toWorld: (x, y, z, out) => w.toWorld(loc, x, y, z, out),
    toLocal: (p, out = new THREE.Vector3()) => loc.group.worldToLocal(out.copy(p)),
    bj: { group: bj, dealer },
    claw: { dyn: clawDyn, spots: cm.spots },
    duck: { ducks, gate, lamps, water, oddsCanvas, oddsTex, crowd },
    plinko: { pegs, pegBase, slotMats, aim },
    crowd,
    onUpdate: null, // set by the game logic (casinoGames.js)
    update(dt, time) {
      const gm = globalThis.game;
      const want = gm && gm.input && gm.input.padActive ? glyphState.kind : 'kb';
      for (const s of padSigns) {
        if (s.key === want) continue;
        s.key = want;
        s.mesh.material.map = s.cache[want] || (s.cache[want] = neonTex(s.text, { ...s.opts, pad: want === 'kb' ? null : want }));
      }
      sign.rotation.y += dt * 0.45;
      die.rotation.x += dt * 0.7; die.rotation.y += dt * 1.1;
      die.position.y = 10 + Math.sin(time * 1.6) * 0.8;
      wheel.rotation.z -= dt * 1.4;
      beams[0].rotation.y = 1 + Math.sin(time * 0.5) * 1.3;
      beams[1].rotation.y = -1 + Math.sin(time * 0.5 + 2) * 1.3;
      chase += dt;
      const step = Math.floor(chase * 7) % 3;
      bulbMats.forEach((m, i) => m.color.setHex(i === step ? 0xfff6a8 : 0x8a5a2a));
      for (const c of chandeliers) c.rotation.y += dt * 0.3;
      bouncer.head.rotation.y = Math.sin(time * 0.55) * 0.55 * Math.max(0, Math.sin(time * 0.17) + 0.4); // (glances left and right, now and then)
      bouncer.root.scale.y = 0.94 * (1 + Math.sin(time * 1.6) * 0.006);
      const pulse = 0.75 + 0.25 * Math.sin(time * 3);
      bandMats[0].color.setRGB(1 * pulse, 0.18 * pulse, 0.53 * pulse);
      bandMats[1].color.setRGB(0.18 * (1.75 - pulse), 0.9 * (1.75 - pulse), 1 * (1.75 - pulse));
      water.offset.x -= dt * 0.25;
      for (const t of toppers) t.rotation.y += dt * 0.6;
      for (const o of prizeSpin) o.rotation.y += dt * 0.9;
      updatePatrons(dt, time);
      for (const c of crowd) {
        c.cheer = Math.max(0, c.cheer - dt);
        c.root.position.y = c.cheer > 0 ? Math.abs(Math.sin(time * 9 + c.phase)) * 0.5 : Math.abs(Math.sin(time * 2 + c.phase)) * 0.05;
      }
      if (this.onUpdate) this.onUpdate(dt, time);
    },
  };
}

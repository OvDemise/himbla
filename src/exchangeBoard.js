import * as THREE from 'three';
import { pixelFont, bodyFont } from './fonts.js';
import { market, REFRESH, fmtPrice, fmtChange, fmtPct, fmtVol } from './market.js';

// The Meridian Exchange's big board: a canvas texture redrawn from the market, for the screens on
// the trading tower. Left, every stock with its price, move, % move and a sparkline of the session;
// right, one stock in detail (open, high, low, volume, a bigger chart), a different one each refresh.
// Footer, the session's best and worst. Nothing here is built unless the settlement is.

export const BOARD_W = 1536, BOARD_H = 1024;
const C = {
  bg: '#060f1c', head: '#0b2c4d', panel: '#0c1f36', row: '#0a1830', rowAlt: '#0d1d36', line: '#1c3a5e',
  text: '#e8f4ff', dim: '#7f9dc0', up: '#4cf08c', down: '#ff4d6a', cyan: '#2ec4ff', gold: '#ffd23f',
};
const TBL_X = 24, TBL_W = 980, ROW_Y = 150, ROW_H = 98;
const DET_X = 1034, DET_W = 478;

const tone = (v) => (v >= 0 ? C.up : C.down);

function tri(g, x, y, s, up) {
  g.beginPath();
  if (up) { g.moveTo(x, y - s); g.lineTo(x + s, y + s * 0.7); g.lineTo(x - s, y + s * 0.7); } else { g.moveTo(x, y + s); g.lineTo(x + s, y - s * 0.7); g.lineTo(x - s, y - s * 0.7); }
  g.closePath(); g.fill();
}

// a line chart of `h` inside [x, x+w] x [y, y+hh], scaled to its own min and max
function chart(g, h, x, y, w, hh, color, { fill = false, dot = true, lo = Math.min(...h), hi = Math.max(...h) } = {}) {
  const span = hi - lo || 1;
  const px = (i) => x + (i / (h.length - 1)) * w;
  const py = (v) => y + hh - ((v - lo) / span) * hh;
  if (fill) {
    const grad = g.createLinearGradient(0, y, 0, y + hh);
    grad.addColorStop(0, color + '55'); grad.addColorStop(1, color + '05');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(px(0), y + hh);
    for (let i = 0; i < h.length; i++) g.lineTo(px(i), py(h[i]));
    g.lineTo(px(h.length - 1), y + hh); g.closePath(); g.fill();
  }
  g.strokeStyle = color; g.lineWidth = fill ? 4 : 3; g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i < h.length; i++) (i ? g.lineTo(px(i), py(h[i])) : g.moveTo(px(i), py(h[i])));
  g.stroke();
  if (dot) { g.fillStyle = color; g.beginPath(); g.arc(px(h.length - 1), py(h[h.length - 1]), fill ? 8 : 6, 0, Math.PI * 2); g.fill(); }
  return py;
}

// time: game seconds (the countdown, the blinking LIVE dot); featured: index of the stock in detail
export function drawBoard(g, m = market, time = 0, featured = 0) {
  g.fillStyle = C.bg; g.fillRect(0, 0, BOARD_W, BOARD_H);
  g.textBaseline = 'middle';

  // header: name, LIVE, the countdown to the next refresh along its foot
  g.fillStyle = C.head; g.fillRect(0, 0, BOARD_W, 100);
  g.fillStyle = C.cyan; g.font = pixelFont(40); g.textAlign = 'left';
  g.fillText('MERIDIAN EXCHANGE', 32, 46);
  const left = m.countdown(time);
  g.textAlign = 'right'; g.fillStyle = C.dim; g.font = pixelFont(24);
  g.fillText(`NEXT QUOTE ${Math.ceil(left)}s`, BOARD_W - 32, 46);
  const blink = Math.floor(time * 1.5) % 2 === 0;
  g.fillStyle = blink ? C.down : '#6a2a38'; g.beginPath(); g.arc(BOARD_W - 470, 46, 11, 0, Math.PI * 2); g.fill();
  g.fillStyle = C.text; g.font = pixelFont(24); g.textAlign = 'right'; g.fillText('LIVE', BOARD_W - 490, 46);
  g.fillStyle = '#12395f'; g.fillRect(0, 94, BOARD_W, 6);
  g.fillStyle = C.cyan; g.fillRect(0, 94, BOARD_W * (1 - left / REFRESH), 6);

  // table
  g.font = bodyFont(24, 700); g.fillStyle = C.dim;
  const cx = { sym: TBL_X + 16, price: TBL_X + 440, chg: TBL_X + 590, pct: TBL_X + 746, spark: TBL_X + 760 };
  g.textAlign = 'left'; g.fillText('STOCK', cx.sym, 126);
  g.textAlign = 'right';
  g.fillText('PRICE', cx.price, 126); g.fillText('CHG', cx.chg, 126); g.fillText('% CHG', cx.pct, 126);
  g.textAlign = 'left'; g.fillText('SESSION', cx.spark + 64, 126);
  m.stocks.forEach((s, i) => {
    const y = ROW_Y + i * ROW_H, mid = y + ROW_H / 2, col = tone(s.change);
    g.fillStyle = i === featured ? '#12365c' : i % 2 ? C.rowAlt : C.row;
    g.fillRect(TBL_X, y, TBL_W, ROW_H - 4);
    if (i === featured) { g.fillStyle = C.cyan; g.fillRect(TBL_X, y, 8, ROW_H - 4); }
    g.textAlign = 'left'; g.fillStyle = s.index ? C.gold : C.text; g.font = pixelFont(32);
    g.fillText(s.sym, cx.sym, mid - 14);
    g.fillStyle = C.dim; g.font = bodyFont(22); g.fillText(s.name, cx.sym, mid + 24);
    g.textAlign = 'right'; g.fillStyle = C.text; g.font = pixelFont(30); // (the display face: its digits read cleanest)
    g.fillText(fmtPrice(s.price), cx.price, mid - 6);
    g.fillStyle = col; g.font = bodyFont(32, 700);
    g.fillText(fmtChange(s.change), cx.chg, mid);
    g.fillText(fmtPct(s.pct), cx.pct, mid);
    tri(g, cx.chg - g.measureText(fmtChange(s.change)).width - 22, mid, 11, s.change >= 0);
    chart(g, s.hist, cx.spark + 64, mid - 26, TBL_W - (cx.spark - TBL_X) - 88, 52, col);
  });

  // footer under the table: who is up and who is down
  const [gain, lose] = m.movers();
  const fy = ROW_Y + 8 * ROW_H + 40;
  g.textAlign = 'left'; g.font = bodyFont(30, 700);
  g.fillStyle = C.dim; g.fillText('BEST', TBL_X + 16, fy);
  g.fillStyle = C.up; g.fillText(`${gain.sym} ${fmtPct(gain.pct)}`, TBL_X + 110, fy);
  g.fillStyle = C.dim; g.fillText('WORST', TBL_X + 380, fy);
  g.fillStyle = C.down; g.fillText(`${lose.sym} ${fmtPct(lose.pct)}`, TBL_X + 510, fy);
  g.fillStyle = C.dim; g.font = bodyFont(22); g.textAlign = 'right'; g.fillText('PRICES IN CREDITS', TBL_X + TBL_W - 8, fy);

  // detail panel: the featured stock
  const s = m.stocks[featured % m.stocks.length], col = tone(s.change), px = DET_X + 28, pw = DET_W - 56;
  g.fillStyle = C.panel; g.fillRect(DET_X, 118, DET_W, BOARD_H - 118 - 24);
  g.strokeStyle = C.line; g.lineWidth = 3; g.strokeRect(DET_X + 1.5, 119.5, DET_W - 3, BOARD_H - 118 - 24 - 3);
  g.textAlign = 'left'; g.fillStyle = s.index ? C.gold : C.cyan; g.font = pixelFont(44); g.fillText(s.sym, px, 176);
  g.fillStyle = C.dim; g.font = bodyFont(26, 700); g.fillText(s.name, px, 226);
  g.fillStyle = C.text; g.font = pixelFont(50); g.fillText(fmtPrice(s.price), px, 304);
  g.fillStyle = col; g.font = bodyFont(38, 700);
  tri(g, px + 14, 376, 13, s.change >= 0);
  g.fillText(`${fmtChange(s.change)}   ${fmtPct(s.pct)}`, px + 44, 376);
  // the chart, with the session's high and low marked
  const cy = 430, chh = 250;
  g.fillStyle = '#081628'; g.fillRect(px - 8, cy - 14, pw + 16, chh + 28);
  const py = chart(g, s.hist, px, cy, pw - 4, chh, col, { fill: true, lo: s.low, hi: s.high });
  g.setLineDash([8, 8]); g.lineWidth = 2; g.strokeStyle = '#3a587c';
  for (const v of [s.high, s.low]) { g.beginPath(); g.moveTo(px, py(v)); g.lineTo(px + pw, py(v)); g.stroke(); }
  g.setLineDash([]);
  g.font = bodyFont(22, 700); g.textAlign = 'right';
  g.fillStyle = C.up; g.fillText('H ' + fmtPrice(s.high), px + pw - 4, py(s.high) - 14);
  g.fillStyle = C.down; g.fillText('L ' + fmtPrice(s.low), px + pw - 4, py(s.low) + 16);
  g.textAlign = 'left'; g.fillStyle = C.dim; g.font = bodyFont(20);
  g.fillText('12 MIN', px, cy + chh + 34);
  g.textAlign = 'right'; g.fillText('NOW', px + pw, cy + chh + 34);
  // the figures
  const rows = [['OPEN', fmtPrice(s.open)], ['HIGH', fmtPrice(s.high)], ['LOW', fmtPrice(s.low)], ['VOLUME', fmtVol(s.volume)], ['LAST QUOTE', fmtChange(s.tick)], ['RANGE', ((s.high - s.low) / s.open * 100).toFixed(1) + '%']];
  rows.forEach(([label, v], i) => {
    const x = px + (i % 2) * (pw / 2 + 4), y = 744 + Math.floor(i / 2) * 76;
    g.textAlign = 'left'; g.fillStyle = C.dim; g.font = bodyFont(22, 700); g.fillText(label, x, y);
    g.fillStyle = label === 'LAST QUOTE' ? tone(s.tick) : C.text; g.font = pixelFont(24); g.fillText(v, x, y + 36);
  });
  // which stock this is, of how many
  for (let i = 0; i < m.stocks.length; i++) {
    g.fillStyle = i === featured % m.stocks.length ? C.cyan : '#25415f';
    g.beginPath(); g.arc(DET_X + DET_W / 2 + (i - (m.stocks.length - 1) / 2) * 30, BOARD_H - 46, 8, 0, Math.PI * 2); g.fill();
  }
}

// The live texture for the tower's screens. `redraw(time)` repaints it when the market has moved on
// (each refresh, which also advances the featured stock) or the countdown has ticked over a second.
export function exchangeTexture(m = market) {
  const c = document.createElement('canvas');
  c.width = BOARD_W; c.height = BOARD_H;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const st = { version: -1, sec: -1, featured: 0 };
  tex.userData.state = st;
  tex.userData.redraw = (time) => {
    m.update(time);
    const sec = Math.ceil(m.countdown(time));
    if (m.version === st.version && sec === st.sec) return false;
    if (m.version !== st.version) { if (st.version >= 0) st.featured = (st.featured + 1) % m.stocks.length; st.version = m.version; }
    st.sec = sec;
    drawBoard(g, m, time, st.featured);
    tex.needsUpdate = true;
    return true;
  };
  tex.userData.redraw(0);
  return tex;
}

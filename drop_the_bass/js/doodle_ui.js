// doodle_ui.js: the DOODLE icon set. Glyphs, gear stickers, treasure crates and rarity frames, all drawn as crayon doodles on doodle_kit.js.
// Everything is baked once into small boil-frame canvases (per glyph, colour and size bucket) and replayed, so a menu full of icons costs a few drawImage calls.
// Glyph names, signatures and anchors match the classic art_ui.js: drawGlyph/drawIcon centred on (x,y); drawGear centred; drawCrate centred;
// drawRarityFrame centred on (x,y) with a width and a height. No Math.random, no Date, safe in node with a mock ctx.
import { Pen, C, clamp, arc, rect, star, heart, getScale, setScale, makeCanvas } from './doodle_kit.js';
import { RARITY } from './data_core.js';
import { GLYPH_NAMES } from './art_ui.js';

export { GLYPH_NAMES };
const INK = C.ink;
const TAU = Math.PI * 2;
const BOIL_FPS = 7;
const FRAMES = 2;

export function setArtScale(n) { setScale(n); cache.clear(); }
const cache = new Map();

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
const BUCKETS = [16, 24, 32, 48, 64, 96, 128, 192, 256];
const bucket = (n) => { for (const b of BUCKETS) if (n <= b) return b; return 256; };

// Bake `draw(pen, ctx, ink)` into FRAMES canvases covering a box of w x h units. `unit` is device px per unit. Returns the entry (direct = draw live, no canvas).
function bake(key, w, h, unit, draw, seed) {
  const k = key + '|' + getScale();
  let e = cache.get(k);
  if (e) return e;
  if (cache.size > 1500) cache.clear();
  e = { w, h, frames: [], direct: false, draw, unit, seed };
  for (let f = 0; f < FRAMES; f++) {
    const cv = makeCanvas(w * unit, h * unit);
    const c = cv && cv.getContext && cv.getContext('2d');
    if (!c) { e.direct = true; break; }
    c.scale(unit, unit); c.translate(w / 2, h / 2);
    draw(new Pen(c, seed + f * 977, unit), c);
    e.frames.push(cv);
  }
  cache.set(k, e);
  return e;
}
// draw a baked entry centred at (x, y) into a destination box dw x dh
function put(ctx, e, x, y, dw, dh, t) {
  if (e.direct) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dw / e.w, dh / e.h);
    e.draw(new Pen(ctx, e.seed, 1), ctx); ctx.restore(); return;
  }
  const cv = e.frames[Math.floor((t || 0) * BOIL_FPS) % e.frames.length];
  ctx.drawImage(cv, x - dw / 2, y - dh / 2, dw, dh);
}

// ================================================================================================================ glyphs
// every glyph is drawn in a 100 x 100 unit box centred on 0,0 (content within about -46..46). g = the tools for this bake.
const DEFAULT = {
  note: C.purple, notes: C.blue, wave: C.cyan, clock: C.orange, skull: '#dcd8e8', magnet: C.red, hat: C.blue, shoe: C.lime, mic: C.pink, disc: C.lav, speaker: C.purple,
  plug: C.yellow, battery: C.green, dice: C.red, double: C.orange, eye: C.teal, hourglass: C.yellow, tape: C.orange, horn: C.red, guitar: C.orange, merge: C.green,
  sell: C.yellow, reroll: C.blue, plus: C.green, minus: C.red, arrow_up: C.green, 
  coin: C.gold, diamond: C.cyan, record: C.pink, fans: C.pink, heart: C.red, star: C.yellow, bolt: C.yellow, fire: C.orange, shield: C.blue, crown: C.gold,
  check: C.green, cross: C.red, lock: C.gold, bag: C.tan, gift: C.pink, drop: C.sky, snow: C.sky, flower: C.pink, clover: C.green, sparkle: C.yellow, bell: C.gold,
  ticket: C.orange, target: C.red, rocket: C.red, bomb: C.ink, cat: C.orange, van: C.yellow, play: C.green, pause: C.blue, ff: C.blue, gear: C.grey,
};
const W = '#ffffff';
const GL = {
  note: (g, col) => { g.f(g.blob(-8, 24, 17, 13, 10), col); g.l([8, 22, 8, -36]); g.f([8, -36, 34, -26, 30, -6, 8, -16], col, 0); },
  notes: (g, col) => { g.f(g.blob(-26, 28, 14, 11, 10), col); g.f(g.blob(14, 20, 14, 11, 10), col); g.l([-13, 28, -13, -22]); g.l([27, 20, 27, -30]); g.f([-13, -22, 27, -30, 27, -16, -13, -8], col, 0); },
  wave: (g, col) => { g.f(g.blob(-30, 0, 9, 9, 8), col); for (let i = 1; i <= 3; i++) g.l(arc(-30, 0, 16 * i, 16 * i, -45, 45), i % 2 ? col : INK, g.LW * 1.2); },
  bolt: (g, col) => g.f([10, -46, -24, 8, -2, 8, -12, 46, 26, -10, 4, -10], col),
  shield: (g, col) => { g.f([-34, -36, 0, -46, 34, -36, 34, 4, 0, 46, -34, 4], col); g.l([0, -30, 0, 30], W, g.LW * 0.9); g.l([-20, -8, 20, -8], W, g.LW * 0.9); },
  heart: (g, col) => { g.f(heart(0, 4, 46), col); g.l([-18, -12, -12, -20], W, g.LW * 0.9); },
  bag: (g, col) => { g.f(g.blob(0, 14, 34, 30, 12), col); g.f([-14, -14, 14, -14, 10, -30, -10, -30], col, 0); g.l([-12, -30, 12, -30]); g.l(arc(0, 18, 9, 9, 60, 300), W, g.LW); g.l([0, 8, 0, 28], W, g.LW); },
  clock: (g, col) => { g.f(g.blob(0, 0, 38, 38, 14), col === C.paper ? W : W); g.l(arc(0, 0, 38, 38, 0, 360, 14), INK, g.LW, true); g.l([0, 0, 0, -24]); g.l([0, 0, 16, 8]); g.dot(0, 0, 4, col); g.l([-4, -46, 4, -46]); },
  star: (g, col) => g.f(star(0, 2, 46, 0.46, 0), col),
  fire: (g, col) => { g.f([0, -46, 14, -24, 30, -4, 26, 24, 10, 44, -10, 44, -28, 26, -28, -2, -14, -14, -10, -34], col); g.f([0, -6, 10, 10, 8, 30, -8, 30, -10, 10], C.yellow, 0); },
  snow: (g, col) => { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3, x = Math.cos(a) * 42, y = Math.sin(a) * 42; g.l([-x, -y, x, y], col, g.LW * 1.2); for (const s of [-1, 1]) { const bx = Math.cos(a) * 26 * s, by = Math.sin(a) * 26 * s; g.l([bx + Math.cos(a + 2.2) * 12 * s, by + Math.sin(a + 2.2) * 12 * s, bx, by, bx + Math.cos(a - 2.2) * 12 * s, by + Math.sin(a - 2.2) * 12 * s], col, g.LW * 0.9); } } },
  target: (g, col) => { g.f(g.blob(0, 0, 42, 42, 14), W); g.f(g.blob(0, 0, 30, 30, 12), col); g.f(g.blob(0, 0, 18, 18, 10), W); g.dot(0, 0, 8, col); g.l([4, -4, 40, -40], INK, g.LW * 1.2); g.l([40, -40, 30, -40, 40, -30], INK, g.LW); },
  skull: (g, col) => { g.f(g.blob(0, -6, 36, 34, 14), col); g.f(rect(-18, 18, 36, 24, 6), col); g.dot(-14, -8, 10, INK); g.dot(14, -8, 10, INK); g.l([0, 4, -4, 12, 4, 12, 0, 4], INK, g.LW); for (const x of [-9, 0, 9]) g.l([x, 20, x, 40], INK, g.LW * 0.8); },
  crown: (g, col) => { g.f([-40, 24, -40, -18, -20, 2, 0, -30, 20, 2, 40, -18, 40, 24], col); g.l([-40, 14, 40, 14], INK, g.LW * 0.9); for (const [x, y, c] of [[-40, -22, C.red], [0, -34, C.sky], [40, -22, C.pink]]) g.dot(x, y, 6, c); },
  magnet: (g, col) => { g.f([-34, 40, -34, -6].concat(arc(0, -6, 34, 34, 180, 360, 14), [34, 40, 14, 40, 14, -6], arc(0, -6, 14, 14, 360, 180, 10), [-14, 40]), col); g.f(rect(-34, 22, 20, 18), W); g.f(rect(14, 22, 20, 18), W); },
  gift: (g, col) => { g.f(rect(-34, -6, 68, 46, 4), col); g.f(rect(-40, -22, 80, 18, 4), C.yellow); g.l([0, -22, 0, 40], C.red, g.LW * 1.6); g.f(g.blob(-12, -34, 12, 10, 8), C.red); g.f(g.blob(12, -34, 12, 10, 8), C.red); },
  hat: (g, col) => { g.f(arc(0, 14, 38, 44, 180, 360, 12).concat([38, 14, -38, 14]), col); g.f([-30, 14, 44, 14, 44, 24, -30, 24], C.ink, null, 0); g.f(rect(-6, -34, 12, 6, 2), W, null); g.dot(0, -32, 5, C.yellow); },
  shoe: (g, col) => { g.f([-42, 8, -38, -30, -14, -30, -10, -14, 12, -4, 38, 8, 44, 28, 44, 34, -42, 34], col); g.f(rect(-44, 28, 90, 12, 5), W); g.l([-24, -14, -6, -4], W, g.LW); g.l([-26, -4, -8, 6], W, g.LW); },
  mic: (g, col) => { g.f(g.blob(-10, -14, 24, 24, 12), col); g.l(arc(-10, -14, 24, 24, 0, 360, 12), INK, g.LW, true); for (const a of [-0.5, 0.2]) g.l([-28 + a * 40, -22, -4 + a * 40, -8], W, g.LW * 0.7); g.f([-2, 4, 12, 6, 36, 40, 26, 46], INK, INK, g.LW * 0.4, {}); g.f([14, 10, 40, 36, 32, 44, 8, 18], C.grey, INK, g.LW * 0.6); },
  disc: (g, col) => { g.f(g.blob(0, 0, 42, 42, 16), INK); g.l(arc(0, 0, 30, 30, 20, 160, 8), '#6a6577', g.LW * 0.7); g.l(arc(0, 0, 30, 30, 200, 340, 8), '#6a6577', g.LW * 0.7); g.f(g.blob(0, 0, 15, 15, 10), col); g.dot(0, 0, 3, W); },
  speaker: (g, col) => { g.f(rect(-32, -42, 64, 84, 8), col); g.f(g.blob(0, -18, 14, 14, 10), INK); g.f(g.blob(0, 16, 22, 22, 12), INK); g.dot(0, 16, 8, C.grey); g.dot(0, -18, 4, C.grey); },
  plug: (g, col) => { g.f(rect(-22, -14, 44, 38, 8), col); g.f(rect(-14, -40, 8, 26, 2), C.grey); g.f(rect(6, -40, 8, 26, 2), C.grey); g.l([0, 24, 0, 40, 14, 46], INK, g.LW * 1.4); },
  battery: (g, col) => { g.f(rect(-40, -20, 72, 40, 6), W); g.f(rect(32, -10, 10, 20, 3), INK); g.f(rect(-34, -14, 34, 28, 3), col); g.l([6, -10, -4, 4, 4, 4, -4, 18], C.yellow, g.LW * 1.1); },
  dice: (g, col) => { g.f(rect(-36, -36, 72, 72, 12), W); for (const [x, y] of [[-18, -18], [18, -18], [0, 0], [-18, 18], [18, 18]]) g.dot(x, y, 7, col); },
  clover: (g, col) => { for (const [x, y] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) g.f(g.blob(x, y, 20, 20, 10), col); g.l([0, 4, 6, 44], INK, g.LW * 1.3); },
  rocket: (g, col) => { g.f(g.blob(0, -4, 22, 40, 12), W); g.f([-22, -6, 0, -48, 22, -6, 14, -14, -14, -14], col); g.f([-22, 10, -40, 34, -22, 28], col); g.f([22, 10, 40, 34, 22, 28], col); g.dot(0, -2, 9, C.sky); g.f([-10, 36, 0, 54, 10, 36], C.orange, null); },
  bomb: (g, col) => { g.f(g.blob(-4, 8, 34, 34, 14), col); g.l([8, -22, 18, -34, 30, -34], INK, g.LW * 1.2); g.l([34, -42, 34, -50, 28, -46, 40, -46, 34, -42], C.orange, g.LW); g.l([-18, 0, -10, -10], W, g.LW); },
  arrow_up: (g, col) => g.f([0, -46, 36, -6, 14, -6, 14, 42, -14, 42, -14, -6, -36, -6], col),
  double: (g, col) => { g.f(rect(-40, -36, 56, 56, 10), col); g.f(rect(-16, -12, 56, 56, 10), W); g.l([4, 4, 28, 30], INK, g.LW); g.l([28, 4, 4, 30], INK, g.LW); },
  eye: (g, col) => { g.f([-44, 0, -22, -22, 0, -28, 22, -22, 44, 0, 22, 22, 0, 28, -22, 22], W); g.dot(0, 0, 18, col); g.dot(0, 0, 8, INK); g.dot(-5, -5, 3, W); },
  hourglass: (g, col) => { g.f([-26, -40, 26, -40, 4, 0, 26, 40, -26, 40, -4, 0], W); g.f([-18, 38, 18, 38, 6, 20, -6, 20], col, null); g.f([-20, -36, 20, -36, 6, -14, -6, -14], col, null); g.l([-34, -44, 34, -44], INK, g.LW * 1.4); g.l([-34, 44, 34, 44], INK, g.LW * 1.4); },
  ticket: (g, col) => { g.f([-44, -22, 44, -22, 44, -8, 38, 0, 44, 8, 44, 22, -44, 22, -44, 8, -38, 0, -44, -8], col); g.l([14, -22, 14, 22], W, g.LW * 0.8, false); g.f(star(-12, 0, 11, 0.5, 0), W, INK, g.LW * 0.6); },
  tape: (g, col) => { g.f(rect(-42, -26, 84, 52, 6), col); g.f(rect(-26, -14, 52, 22, 8), W); g.dot(-14, -3, 7, INK); g.dot(14, -3, 7, INK); g.l([-24, 18, -14, 26, 14, 26, 24, 18], INK, g.LW * 0.8); },
  van: (g, col) => { g.f([-44, 14, -44, -14, -28, -34, 22, -34, 30, -14, 44, -8, 44, 14], col); g.f([-30, -14, -22, -28, 8, -28, 8, -14], C.sky, INK, g.LW * 0.8); g.dot(-24, 18, 11, INK); g.dot(26, 18, 11, INK); g.dot(-24, 18, 4, W); g.dot(26, 18, 4, W); },
  cat: (g, col) => { g.f(g.blob(0, 8, 36, 32, 14), col); g.f([-34, -4, -30, -40, -8, -18], col); g.f([34, -4, 30, -40, 8, -18], col); g.dot(-13, 4, 6, INK); g.dot(13, 4, 6, INK); g.l([-4, 16, 0, 20, 4, 16], INK, g.LW * 0.8); for (const s of [-1, 1]) { g.l([s * 14, 14, s * 40, 8], INK, g.LW * 0.6); g.l([s * 14, 18, s * 40, 22], INK, g.LW * 0.6); } },
  drop: (g, col) => { g.f([0, -46, 22, -8].concat(arc(0, 14, 26, 28, -20, 200, 12), [-22, -8]), col); g.l([-10, 6, -6, 16], W, g.LW); },
  flower: (g, col) => { for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - 1.57; g.f(g.blob(Math.cos(a) * 22, Math.sin(a) * 22 - 4, 17, 17, 9), col); } g.dot(0, -4, 11, C.yellow); g.l([0, 20, 2, 46], C.green, g.LW * 1.4); },
  bell: (g, col) => { g.f([-40, 30, -26, -4, -20, -30, 20, -30, 26, -4, 40, 30], col); g.f(rect(-44, 28, 88, 10, 4), INK, INK, g.LW * 0.5, {}); g.dot(0, 44, 7, INK); g.l([0, -30, 0, -42], INK, g.LW * 1.2); },
  horn: (g, col) => { g.f([-38, -10, 8, -30, 8, 38, -38, 18], col); g.f(rect(-46, -12, 14, 32, 4), INK, INK, g.LW * 0.5, {}); g.f(rect(-30, 20, 14, 24, 4), C.grey); g.l(arc(14, 4, 14, 22, -70, 70), INK, g.LW); g.l(arc(14, 4, 28, 36, -60, 60), INK, g.LW); },
  guitar: (g, col) => { g.f(g.blob(-12, 16, 28, 26, 12), col); g.f(g.blob(-12, -8, 18, 18, 10), col); g.dot(-12, 14, 8, INK); g.l([2, -10, 40, -42], INK, g.LW * 2.2); g.f(rect(32, -50, 14, 16, 3), INK); },
  sparkle: (g, col) => { g.f(star(0, 0, 46, 0.18, 0, 4), col); g.f(star(26, -26, 14, 0.2, 0, 4), W); g.f(star(-28, 28, 12, 0.2, 0, 4), W); },
  coin: (g, col) => { g.f(g.blob(0, 0, 42, 42, 16), col); g.l(arc(0, 0, 32, 32, 0, 360, 14), INK, g.LW * 0.8, true); g.f(g.blob(-8, 14, 8, 6, 8), INK, INK, 1); g.l([-1, 12, -1, -16, 14, -10], INK, g.LW * 1.1); },
  diamond: (g, col) => { g.f([-34, -16, -18, -38, 18, -38, 34, -16, 0, 44], col); g.l([-34, -16, 34, -16], INK, g.LW * 0.9); g.l([-18, -38, -8, -16, 0, 44], INK, g.LW * 0.7); g.l([18, -38, 8, -16, 0, 44], INK, g.LW * 0.7); g.l([-12, -30, -6, -22], W, g.LW); g.f(star(34, -36, 10, 0.2, 0, 4), W, INK, g.LW * 0.5); },
  record: (g, col) => { g.f(g.blob(0, 0, 42, 42, 16), INK); g.l(arc(0, 0, 30, 30, 20, 160, 8), '#6a6577', g.LW * 0.7); g.f(g.blob(0, 0, 17, 17, 10), col); g.dot(0, 0, 3.5, W); g.l([-30, -26, -18, -34], W, g.LW * 0.8); },
  fans: (g, col) => { g.f(heart(0, 6, 44), col); g.f(star(26, -26, 15, 0.42, 0), C.yellow, INK, g.LW * 0.7); g.f(star(-30, -28, 9, 0.42, 0), W, INK, g.LW * 0.6); },
  lock: (g, col) => { g.l(arc(0, -14, 20, 24, 180, 360, 10).concat([20, 0]), INK, g.LW * 2.2); g.f(rect(-30, -8, 60, 50, 8), col); g.dot(0, 12, 6, INK); g.l([0, 14, 0, 28], INK, g.LW * 1.2); },
  check: (g, col) => { g.l([-36, 2, -12, 28, 38, -30], INK, g.LW * 3.4); g.l([-36, 2, -12, 28, 38, -30], col, g.LW * 2.0); },
  cross: (g, col) => { g.l([-30, -30, 30, 30], INK, g.LW * 3.4); g.l([30, -30, -30, 30], INK, g.LW * 3.4); g.l([-30, -30, 30, 30], col, g.LW * 2); g.l([30, -30, -30, 30], col, g.LW * 2); },
  plus: (g, col) => { g.f([-12, -38, 12, -38, 12, -12, 38, -12, 38, 12, 12, 12, 12, 38, -12, 38, -12, 12, -38, 12, -38, -12, -12, -12], col || C.green); },
  minus: (g, col) => { g.f(rect(-38, -12, 76, 24, 6), col || C.red); },
  play: (g, col) => g.f([-26, -40, 40, 0, -26, 40], col),
  pause: (g, col) => { g.f(rect(-34, -38, 26, 76, 6), col); g.f(rect(8, -38, 26, 76, 6), col); },
  ff: (g, col) => { g.f([-42, -34, 0, 0, -42, 34], col); g.f([0, -34, 42, 0, 0, 34], col); },
  gear: (g, col) => { const p = []; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = (i % 2 ? 36 : 46); p.push(Math.cos(a) * r, Math.sin(a) * r, Math.cos(a + 0.2) * r, Math.sin(a + 0.2) * r); } g.f(p, col); g.f(g.blob(0, 0, 15, 15, 10), W); },
  merge: (g, col) => { g.l([-34, -40, -34, -8, 0, 12, 0, 40], col, g.LW * 2.6); g.l([34, -40, 34, -8, 0, 12], col, g.LW * 2.6); g.f([-14, 26, 0, 46, 14, 26], col); },
  sell: (g, col) => { g.f([-42, 0, -14, -30, 40, -30, 40, 30, -14, 30], col); g.dot(-10, 0, 6, W); g.l([4, 8, 4, -8, 18, -2], INK, g.LW); g.l([14, 12, 14, 8], INK, g.LW * 0.8); },
  reroll: (g, col) => { g.l(arc(0, 0, 32, 32, -150, 30, 10), col, g.LW * 2.6); g.l(arc(0, 0, 32, 32, 30, 210, 10), col, g.LW * 2.6); g.f([22, -34, 44, -24, 26, -10], col); g.f([-22, 34, -44, 24, -26, 10], col); },
};
const NAME_SET = new Set(GLYPH_NAMES);

function tools(pen, B) {
  const px = B * getScale();
  const LW = clamp(px * 0.062, 1.7, 6.5), GAP = clamp(px * 0.05, 2.4, 6), J = clamp(px * 0.004, 0.25, 1.1);
  const g = {
    LW, GAP,
    blob: (cx, cy, rx, ry, n) => pen.blob(cx, cy, rx, ry, n || 12, 0.05),
    f: (p, fill, line, lw, o) => pen.shp(p, fill, line === undefined ? INK : line, lw == null ? LW : lw, Object.assign({ gap: GAP, j: J }, o || {})),
    l: (p, c, w, closed) => pen.ln(p, c || INK, w || LW, !!closed, J),
    dot: (x, y, r, c) => pen.dot(x, y, r, c),
  };
  return g;
}

export function drawGlyph(ctx, name, x, y, size, color) {
  if (!(size > 0)) return;
  const fn = GL[name] || GL.sparkle;
  const B = bucket(size * 1.0), col = color || DEFAULT[name] || C.pink;
  const e = bake('gl:' + name + ':' + col + ':' + B, 100, 100, B * getScale() / 100, (pen) => { fn(tools(pen, B), col); }, hashStr(name + col));
  put(ctx, e, x, y, size, size, 0);
}
export const drawIcon = drawGlyph;
export { NAME_SET as _glyphNames };

// ================================================================================================================ gear stickers
const RANK = ['common', 'rare', 'epic', 'legendary', 'mythic'];
const GEAR_PAL = [[C.pink, C.lav], [C.lime, C.green], [C.sky, C.blue], [C.orange, C.yellow], [C.purple, C.lav], [C.red, C.orange], [C.teal, C.cyan], [C.yellow, C.gold]];
function rarityBorder(g, pen, rarity, w, h) {   // draws the rarity border and decoration for a box centred on 0,0
  const R = RARITY[rarity] || RARITY.common, rank = Math.max(0, RANK.indexOf(rarity)), col = R.color;
  const rad = Math.min(w, h) * 0.16, p = rect(-w / 2, -h / 2, w, h, rad);
  if (rank === 0) { pen.ln(p, '#8e8a99', g.LW * 0.8, true, g.LW * 0.25); }
  else if (rank === 1) { pen.ln(p, col, g.LW * 1.4, true, g.LW * 0.3); pen.ln(rect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, rad * 0.8), col, g.LW * 0.7, true, g.LW * 0.3); }
  else if (rank === 2) { pen.ln(p, col, g.LW * 2, true, g.LW * 0.35); for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pen.shp(star(x * w / 2, y * h / 2, Math.min(w, h) * 0.1, 0.42, 0.3), C.yellow, INK, g.LW * 0.55, { gap: g.GAP }); }
  else if (rank === 3) {
    pen.ln(p, '#e0a000', g.LW * 2.6, true, g.LW * 0.3); pen.ln(p, C.gold, g.LW * 1.5, true, g.LW * 0.3);
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + 0.4; pen.dot(Math.cos(a) * w * 0.5, Math.sin(a) * h * 0.5, g.LW * 0.8, i % 2 ? '#fff6c0' : C.gold); }
    pen.shp([-14, 0, -14, -14, -7, -7, 0, -18, 7, -7, 14, -14, 14, 0].map((v, i) => (i % 2 ? v * 0.7 - h / 2 : v * 0.7)), C.gold, INK, g.LW * 0.5, { gap: g.GAP });
  } else {
    const cols = [C.red, C.orange, C.yellow, C.green, C.sky, C.purple, C.pink];
    for (let i = 0; i < 14; i++) { const t0 = i / 14, t1 = (i + 1.15) / 14; const seg = []; for (let k = 0; k <= 4; k++) { const tt = t0 + (t1 - t0) * k / 4, a = tt * TAU; seg.push(Math.cos(a) * w * 0.5 * 1.02, Math.sin(a) * h * 0.5 * 1.02); } pen.ln(seg, cols[i % cols.length], g.LW * 2.2, false, g.LW * 0.25); }
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1.05]]) pen.shp(star(x * w * 0.5, y * h * 0.5, Math.min(w, h) * 0.1, 0.42, 0.2), C.yellow, INK, g.LW * 0.5, { gap: g.GAP });
  }
}
function gearItem(g, pen, slot, h, c1, c2, v) {
  switch (slot) {
    case 'head':
      if (v === 0) { g.f(arc(0, 6, 32, 34, 180, 360, 12), c1); g.f([-30, 6, 40, 6, 44, 16, -30, 16], c2); g.dot(0, -24, 4, W); }
      else if (v === 1) { g.l(arc(0, 6, 30, 32, 190, 350, 10), INK, g.LW * 2.4); g.f(rect(-40, 0, 16, 28, 6), c1); g.f(rect(24, 0, 16, 28, 6), c1); }
      else { g.f([-34, 20, -34, -10, -17, 4, 0, -22, 17, 4, 34, -10, 34, 20], c1); g.dot(0, -24, 5, c2); }
      break;
    case 'mic':
      g.f(g.blob(-6, -18, 20, 20, 11), c1); g.f([-2, 0, 12, 4, 30, 40, 18, 44], v === 1 ? c2 : C.grey);
      if (v === 2) g.f(rect(-22, -26, 32, 12, 4), c2, INK, g.LW * 0.6); break;
    case 'body':
      g.f([-18, -34, -4, -26, 4, -26, 18, -34, 40, -20, 30, -4, 20, -8, 20, 36, -20, 36, -20, -8, -30, -4, -40, -20], c1);
      if (v === 0) { g.dot(0, 4, 10, c2); g.l([-5, 4, 5, 4], INK, g.LW * 0.6); } else if (v === 1) { g.l([-20, -4, 20, -4], c2, g.LW * 1.6); g.l([-20, 12, 20, 12], c2, g.LW * 1.6); } else g.f(star(0, 8, 12, 0.46, 0), c2, INK, g.LW * 0.5, { gap: g.GAP }); break;
    case 'chain':
      g.l(arc(0, -4, 34, 40, 20, 160, 14), INK, g.LW * 1.3); g.l(arc(0, -4, 34, 40, 20, 160, 14), c2, g.LW * 0.6);
      if (v === 0) g.f(heart(0, 30, 24), c1); else if (v === 1) g.f(g.blob(0, 30, 13, 13, 10), c1); else g.f(star(0, 30, 15, 0.46, 0), c1); break;
    default:
      g.f([-40, 4, -36, -22, -14, -22, -8, -8, 14, 0, 38, 8, 42, 24, -40, 24], c1); g.f(rect(-42, 22, 86, 12, 5), W);
      if (v === 1) g.l([-24, -4, -6, 6], c2, g.LW); else g.f(star(-18, -4, 8, 0.46, 0), c2, INK, g.LW * 0.4, { gap: g.GAP });
  }
}
export function drawGear(ctx, slot, id, rarity, x, y, size) {
  if (!(size > 0)) return;
  const hs = hashStr(String(id)), [c1, c2] = GEAR_PAL[(hs >>> 0) % GEAR_PAL.length], v = ((hs >>> 4) >>> 0) % 3;
  const B = bucket(size);
  const e = bake('gear:' + slot + ':' + id + ':' + rarity + ':' + B, 100, 100, B * getScale() / 100, (pen) => {
    const g = tools(pen, B);
    // die-cut white sticker body, a soft paper tint, the rarity border, then the item doodle
    pen.shp(rect(-42, -42, 84, 84, 16), '#ffffff', null, 0, { gap: g.GAP, alpha: 1 });
    pen.shp(rect(-36, -36, 72, 72, 12), (RARITY[rarity] || RARITY.common).color, null, 0, { gap: g.GAP * 1.6, alpha: 0.2, ang: 0.6 });
    rarityBorder(g, pen, rarity, 76, 76);
    pen.ln(rect(-45, -45, 90, 90, 18), '#cfc9db', g.LW * 0.5, true, g.LW * 0.2);
    ctxScale(pen, 0.62); gearItem(g, pen, slot, hs, c1, c2, v);
  }, hs);
  put(ctx, e, x, y, size, size, 0);
}
function ctxScale(pen, s) { pen.ctx.scale(s, s); }

// ================================================================================================================ treasure crates
const CRATE = {
  garage: { body: '#d9a15f', dark: '#9a6a34', trim: C.tan, glow: C.yellow },
  studio: { body: C.blue, dark: '#1f4f9a', trim: C.gold, glow: C.cyan },
  platinum: { body: '#e6e3f2', dark: '#9c98b8', trim: C.gold, glow: C.pink },
};
function crateBody(g, pen, tier) {
  const T = CRATE[tier] || CRATE.garage;
  pen.shp(pen.blob(0, 46, 50, 8, 10, 0.1), '#8d8aa0', null, 0, { gap: g.GAP * 1.2, alpha: 0.5 });
  g.f(rect(-38, -6, 76, 48, 6), T.body);
  g.l([-38, 12, 38, 12], T.dark, g.LW * 0.9); g.l([-38, 28, 38, 28], T.dark, g.LW * 0.9);
  if (tier === 'garage') { g.f(rect(-9, -6, 18, 48, 2), '#f3e3b8', INK, g.LW * 0.6); g.l([-26, 26, -16, 36, -6, 26], INK, g.LW * 0.7); g.l([16, 22, 28, 22], INK, g.LW * 0.7); }
  else { for (const sx of [-30, 30]) { g.f(rect(sx - 5, -6, 10, 48, 2), T.trim); for (const yy of [2, 18, 34]) g.dot(sx, yy, 2.6, INK); } g.f(rect(-9, 6, 18, 18, 4), T.trim); g.dot(0, 14, 3, INK); }
}
function crateLid(g, pen, tier) {
  const T = CRATE[tier] || CRATE.garage;
  g.f(rect(-42, -34, 84, 30, 8), T.body);
  g.l([-42, -20, 42, -20], T.dark, g.LW * 0.7);
  if (tier === 'garage') g.f(rect(-9, -34, 18, 30, 2), '#f3e3b8', INK, g.LW * 0.6);
  else { for (const sx of [-30, 30]) g.f(rect(sx - 5, -34, 10, 30, 2), T.trim); if (tier === 'platinum') { g.f([-14, -34, -14, -46, -7, -40, 0, -50, 7, -40, 14, -46, 14, -34], C.gold); } }
}
function crateRays(g, pen, tier) {
  const T = CRATE[tier] || CRATE.garage;
  for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.2, L = 52 + (i % 2) * 14; g.l([Math.cos(a) * 14, -4 + Math.sin(a) * 6, Math.cos(a) * L, -4 + Math.sin(a) * L], i % 2 ? T.glow : C.yellow, g.LW * 1.4); }
  pen.shp(pen.blob(0, -4, 30, 8, 10, 0.1), T.glow, null, 0, { gap: g.GAP, alpha: 0.85 });
}
export function drawCrate(ctx, tier, x, y, size, o) {
  if (!(size > 0)) return;
  o = o || {};
  const t = o.t || 0, open = clamp(o.open || 0, 0, 1), shake = clamp(o.shake || 0, 0, 1), tr = CRATE[tier] ? tier : 'garage';
  const B = bucket(size), unit = B * getScale() / 100, k = size / 100;
  const body = bake('crate:b:' + tr + ':' + B, 110, 110, unit, (pen) => crateBody(tools(pen, B), pen, tr), hashStr('cb' + tr));
  const lid = bake('crate:l:' + tr + ':' + B, 110, 110, unit, (pen) => crateLid(tools(pen, B), pen, tr), hashStr('cl' + tr));
  const inside = bake('crate:i:' + tr + ':' + B, 110, 110, unit, (pen) => { const g = tools(pen, B); pen.shp(pen.blob(0, -5, 33, 8, 12, 0.05), '#3b2a2a', INK, g.LW * 0.8, { gap: g.GAP }); pen.shp(pen.blob(0, -4, 24, 4.5, 10, 0.05), (CRATE[tr] || CRATE.garage).glow, null, 0, { gap: g.GAP, alpha: 0.9 }); }, hashStr('ci' + tr));
  const rays = bake('crate:r:' + tr + ':' + B, 110, 110, unit, (pen) => crateRays(tools(pen, B), pen, tr), hashStr('cr' + tr));
  const d = size * 1.1;
  ctx.save();
  ctx.translate(x + Math.sin(t * 41) * 3 * shake * k, y + Math.abs(Math.sin(t * 29)) * -2 * shake * k);
  ctx.rotate(Math.sin(t * 33) * 0.07 * shake);
  if (open > 0.02) { ctx.globalAlpha *= clamp(open * 1.4, 0, 1); put(ctx, rays, 0, -4 * k - open * 8 * k, d, d, t); ctx.globalAlpha /= clamp(open * 1.4, 0, 1) || 1; }
  put(ctx, body, 0, 0, d, d, t);
  if (open > 0.04) { ctx.globalAlpha *= clamp(open * 3, 0, 1); put(ctx, inside, 0, 0, d, d, t); ctx.globalAlpha /= clamp(open * 3, 0, 1) || 1; }
  ctx.save(); ctx.translate(-open * 3 * k, -open * 30 * k); ctx.translate(0, -4 * k); ctx.scale(1, 1 - 0.32 * open); ctx.rotate(-0.1 * open); ctx.translate(0, 4 * k);
  put(ctx, lid, 0, 0, d, d, t); ctx.restore();
  if (tr === 'platinum') { // glitter that twinkles on the best crate
    for (let i = 0; i < 4; i++) { const a = t * 1.3 + i * 1.7, s = (0.5 + 0.5 * Math.sin(t * 5 + i * 2)) * 7 * k; if (s > 1.2) { ctx.save(); ctx.translate(Math.cos(a) * 40 * k, Math.sin(a * 1.3) * 28 * k - 4 * k); ctx.strokeStyle = C.gold; ctx.lineWidth = Math.max(1, 1.6 * k); ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke(); ctx.restore(); } }
  }
  ctx.restore();
}

// ================================================================================================================ rarity frames
export function drawRarityFrame(ctx, rarity, x, y, w, h, t) {
  if (!(w > 0 && h > 0)) return;
  t = t || 0;
  const R = RARITY[rarity] || RARITY.common, rank = Math.max(0, RANK.indexOf(rarity));
  const bw = Math.max(16, Math.round(w / 8) * 8), bh = Math.max(16, Math.round(h / 8) * 8), B = bucket(Math.max(bw, bh));
  const unit = getScale() * Math.min(2, 128 / Math.max(32, Math.min(bw, bh)) + 1.4);
  const e = bake('rf:' + rarity + ':' + bw + 'x' + bh, bw + 24, bh + 24, Math.min(unit, getScale() * 2), (pen) => {
    const g = tools(pen, B > 64 ? 64 : B);
    pen.shp(rect(-bw / 2, -bh / 2, bw, bh, Math.min(bw, bh) * 0.16), '#fffdf4', null, 0, { gap: g.GAP, alpha: 1 });
    pen.shp(rect(-bw / 2 + 3, -bh / 2 + 3, bw - 6, bh - 6, Math.min(bw, bh) * 0.14), R.color, null, 0, { gap: g.GAP * 1.8, alpha: 0.13 + rank * 0.03, ang: 0.8 });
    rarityBorder(g, pen, rarity, bw, bh);
  }, hashStr('rf' + rarity + bw + bh));
  put(ctx, e, x, y, bw + 24, bh + 24, t);
  if (rank >= 3) {   // twinkling glitter on legendary and mythic
    for (let i = 0; i < 3; i++) {
      const a = t * 0.9 + i * 2.1, s = (0.5 + 0.5 * Math.sin(t * 4.5 + i * 2.4)) * Math.min(w, h) * 0.07;
      if (s < 1) continue;
      const px = x + Math.cos(a) * w * 0.34, py = y + Math.sin(a * 1.2) * h * 0.34;
      ctx.save(); ctx.translate(px, py); ctx.strokeStyle = rank === 4 ? '#fff' : C.gold; ctx.lineWidth = Math.max(1, s * 0.3); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke(); ctx.restore();
    }
  }
}

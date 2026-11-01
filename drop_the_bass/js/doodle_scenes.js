// doodle_scenes.js: the DOODLE cutscenes and title screen. Every panel is a child's crayon storybook spread on notebook paper:
// big scribbled washes, wobbly ink outlines, taped labels, the duo and Loopy standing in the middle, the Static scribbled as grey fuzz creeping in.
// Big layers are baked once into 2 boil frames and replayed (kept for the 3 most recent scenes only); small sprites use the kit cache.
// o.progress (0..1 over the panel) drives a pen-by-pen reveal of the layers and a slow push in. No unseeded randomness or clock, safe in node with a mock ctx.
import { Pen, C, clamp, arc, rect, star, heart, getScale, setScale, makeCanvas, sprite, blit, paper } from './doodle_kit.js';
import { drawHero, drawBust, drawLoopy } from './doodle_heroes.js';
import { WORLD_BY_ID, BOSSES } from './data_core.js';
import { SCENE_IDS as CLASSIC_IDS } from './art_scenes.js';
import { ART_PIECES as AP } from './doodle_env.js';
import { paintBoss } from './doodle_enemies.js';

// the 19 original scenes plus the second tour: seven epilogues, two world cards, two boss cards and the moon credits
export const NEW_IDS = ['epilogue_garage', 'epilogue_busk', 'epilogue_club', 'epilogue_festival', 'epilogue_arena', 'epilogue_beach', 'epilogue_moon', 'world_beach', 'world_moon', 'boss_lowpass', 'boss_silence', 'credits_moon'];
export const SCENE_IDS = CLASSIC_IDS.concat(NEW_IDS);
export function setArtScale(n) { setScale(n); layers.clear(); recent.length = 0; }
const INK = C.ink;
const TAU = Math.PI * 2;
const ease = (x) => x * x * (3 - 2 * x);
const hn = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ===================================================================================================== big layer cache (3 scenes at most)
const layers = new Map(), recent = [];
function touch(id) {
  const i = recent.indexOf(id); if (i >= 0) recent.splice(i, 1); recent.push(id);
  while (recent.length > 3) { const old = recent.shift(); for (const k of [...layers.keys()]) if (k.startsWith(old + '|')) layers.delete(k); }
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
// a 540 x 960 layer baked at up to 1.5 px per unit, 2 boil frames; draw(P, c) paints in top-left unit coordinates
function layer(scene, name, draw) {
  const key = scene + '|' + name + '|' + getScale();
  let e = layers.get(key);
  if (e) return e;
  const s = Math.min(getScale(), 1.5);
  e = { frames: [], direct: false, draw, s, seed: hashStr(key) };
  for (let f = 0; f < 2; f++) {
    const cv = makeCanvas(540 * s, 960 * s), c = cv && cv.getContext && cv.getContext('2d');
    if (!c) { e.direct = true; break; }
    c.scale(s, s); draw(new Pen(c, e.seed + f * 7919, s), c); e.frames.push(cv);
  }
  layers.set(key, e);
  return e;
}
function putLayer(ctx, e, t, alpha, dx, dy) {
  if (alpha <= 0.01) return;
  const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * alpha;
  if (e.direct) { ctx.save(); ctx.translate(dx || 0, dy || 0); e.draw(new Pen(ctx, e.seed, 1), ctx); ctx.restore(); }
  else ctx.drawImage(e.frames[(((Math.floor(t * 6) || 0) % e.frames.length) + e.frames.length) % e.frames.length], dx || 0, dy || 0, 540, 960);
  ctx.globalAlpha = a0;
}
const sp = (key, w, h, draw, seed) => sprite('dsc:' + key, w, h, draw, { seed: seed || 5 });

// ===================================================================================================== doodle props (all take the pen P)
const wash = (P, x, y, w, h, col, a = 0.88, gap = 12, ang = -0.55) => P.hatch(rect(x, y, w, h), col, gap, ang, a);
const poly = (P, p, fill, lw = 4.5, o) => P.shp(p, fill, INK, lw, Object.assign({ gap: 8 }, o || {}));
function ragged(P, x, y, w, h, col, a = 0.9, gap = 12, ang = -0.55) {   // a washed page area with a hand-cut ragged edge
  const p = []; const n = 14;
  for (let i = 0; i <= n; i++) p.push(x + w * i / n, y + (P.rnd() - 0.5) * 9);
  for (let i = 1; i <= n; i++) p.push(x + w + (P.rnd() - 0.5) * 9, y + h * i / n);
  for (let i = n - 1; i >= 0; i--) p.push(x + w * i / n, y + h + (P.rnd() - 0.5) * 9);
  for (let i = n - 1; i >= 1; i--) p.push(x + (P.rnd() - 0.5) * 9, y + h * i / n);
  P.hatch(p, col, gap, ang, a);
}
function sun(P, x, y, r, col = C.yellow) {
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; P.ln([x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r * 1.25, x + Math.cos(a) * r * (i % 2 ? 1.6 : 1.85), y + Math.sin(a) * r * (i % 2 ? 1.6 : 1.85)], C.orange, 4, false, 1); }
  poly(P, P.blob(x, y, r, r, 14, 0.04), col, 4.5, { gap: 7 });
}
function cloud(P, x, y, s = 1, col = '#ffffff') {
  const p = []; for (const [cx, cy, r, a0, a1] of [[-34, 6, 20, 90, 270], [-14, -10, 24, 180, 360], [16, -8, 22, 180, 360], [34, 8, 18, 270, 450]]) p.push(...arc(x + cx * s, y + cy * s, r * s, r * s, a0, a1, 6));
  poly(P, p, col, 4, { gap: 9, alpha: 0.95 });
}
function moon(P, x, y, r) { poly(P, P.blob(x, y, r, r, 16, 0.03), '#fff3b0', 4.5, { gap: 8 }); for (const [dx, dy, rr] of [[-r * 0.3, -r * 0.2, r * 0.18], [r * 0.25, r * 0.15, r * 0.14]]) P.ln(arc(x + dx, y + dy, rr, rr, 0, 360, 8), '#d9c870', 3, true, 0.8); }
function stars(P, n, y0, y1, seed = 1) { for (let i = 0; i < n; i++) { const x = 20 + hn(i * 3 + seed) * 500, y = y0 + hn(i * 5 + seed + 1) * (y1 - y0); P.shp(star(x, y, 6 + hn(i + seed) * 7, 0.42, hn(i) * 2), C.yellow, INK, 2.4, { gap: 4 }); } }
function house(P, x, y, w, h, col, roof = C.red) {
  poly(P, rect(x, y, w, h), col, 4.5, { gap: 9 });
  poly(P, [x - 10, y + 2, x + w / 2, y - h * 0.5, x + w + 10, y + 2], roof, 4.5, { gap: 8 });
  for (let i = 0; i < 2; i++) { poly(P, rect(x + w * (0.14 + i * 0.5), y + h * 0.18, w * 0.3, h * 0.28), C.sky, 3.5, { gap: 6 }); P.ln([x + w * (0.14 + i * 0.5) + w * 0.15, y + h * 0.18, x + w * (0.14 + i * 0.5) + w * 0.15, y + h * 0.46], INK, 2.4); }
  poly(P, rect(x + w * 0.38, y + h * 0.6, w * 0.24, h * 0.4), C.brown, 3.5, { gap: 6 });
}
function lamp(P, x, y) { P.ln([x, y, x, y + 130], INK, 4); poly(P, [x - 24, y + 135, x + 24, y + 135, x + 14, y + 100, x - 14, y + 100], C.orange, 4, { gap: 6 }); wash(P, x - 80, y + 138, 160, 8, C.yellow, 0.0); }
function lightCone(P, x, y, spread, len, col, a = 0.5) { P.hatch([x - 8, y, x + 8, y, x + spread, y + len, x - spread, y + len], col, 9, 0.9, a); }
function speaker(P, x, y, w, h, col = C.purple) { poly(P, rect(x, y, w, h, 6), col, 4.5, { gap: 7 }); P.shp(P.blob(x + w / 2, y + h * 0.3, w * 0.28, w * 0.28, 10), '#4b4458', INK, 3.5, { gap: 5 }); P.shp(P.blob(x + w / 2, y + h * 0.7, w * 0.38, w * 0.38, 12), '#4b4458', INK, 3.5, { gap: 5 }); P.dot(x + w / 2, y + h * 0.7, w * 0.1, C.grey); }
function drumKit(P, x, y, s = 1) {
  poly(P, P.blob(x, y, 62 * s, 50 * s, 14, 0.04), C.red, 4.5, { gap: 8 }); P.ln(arc(x, y, 40 * s, 32 * s, 0, 360, 12), '#fff', 4, true, 1); P.txt('BASS', x, y + 10 * s, 18 * s, '#fff', { align: 'c', w: 3 });
  poly(P, P.blob(x - 80 * s, y - 40 * s, 34 * s, 14 * s, 12), C.yellow, 4, { gap: 6 }); P.ln([x - 80 * s, y - 30 * s, x - 80 * s, y + 40 * s], INK, 4);
  poly(P, P.blob(x + 78 * s, y - 24 * s, 30 * s, 18 * s, 12), C.orange, 4, { gap: 6 }); P.ln([x + 70 * s, y - 6 * s, x + 66 * s, y + 40 * s], INK, 4);
}
function fuzzDraw(P, c, r = 26, look = 0.6, mad = false) {   // a Static: grey spiky fuzz, googly eyes, glitch felt-tip offsets
  const body = P.spiky(r, r * 0.92, 11, 0.18);
  P.ln(body.map((v, i) => v + (i % 2 ? 2.5 : -2.5)), C.cyan, 2.6, true, 1); P.ln(body.map((v, i) => v + (i % 2 ? -2.5 : 2.5)), C.mag, 2.6, true, 1);
  P.shp(body, '#b8b6c4', INK, 3.6, { gap: 6, f2: '#8f8c9c' });
  P.eye(-r * 0.32, -r * 0.1, r * 0.3, look); P.eye(r * 0.3, -r * 0.1, r * 0.34, look + 0.3);
  if (mad) { P.ln([-r * 0.7, -r * 0.5, -r * 0.1, -r * 0.3], INK, 3.4); P.ln([r * 0.7, -r * 0.5, r * 0.1, -r * 0.3], INK, 3.4); }
  P.ln([-r * 0.3, r * 0.4, 0, r * 0.52, r * 0.3, r * 0.38], INK, 3);
}
const fuzzSprite = (r, mad) => sp('fuzz:' + r + (mad ? 'm' : ''), r * 2.8, r * 2.8, (P, c) => fuzzDraw(P, c, r, 0.6, mad), r);
function crowdHead(P, x, y, col) { poly(P, P.blob(x, y, 20, 22, 10), col, 4, { gap: 6 }); P.dot(x - 7, y - 3, 3, INK); P.dot(x + 7, y - 3, 3, INK); P.ln(arc(x, y + 4, 8, 6, 20, 160, 6), INK, 2.6); poly(P, rect(x - 24, y + 22, 48, 40, 12), col === C.skin ? C.pink : col, 4, { gap: 7 }); }
function banner(P, x, y, w, h, label, col = '#fff7c9') {   // a taped paper label with crayon lettering
  poly(P, rect(x, y, w, h), col, 4, { gap: 9, alpha: 0.95 });
  P.shp(rect(x + w * 0.42, y - 12, w * 0.16, 22), 'rgba(255,230,120,0.0)', null, 0);
  P.hatch(rect(x + w * 0.4, y - 12, w * 0.2, 24), '#ffe98f', 5, 0.5, 0.8); P.ln(rect(x + w * 0.4, y - 12, w * 0.2, 24), '#d6b84a', 2, true, 0.6);
  const fit = (w - 36) / (String(label).length * 5.2 / 6), ts = Math.min(h * 0.62, 38, fit);
  P.txt(label, x + w / 2, y + h / 2 + Math.min(h * 0.34, 20) * ts / 38 * (38 / Math.min(h * 0.62, 38)), ts, INK, { align: 'c', w: Math.max(2.6, ts * 0.1) });
}
function bunting(P, y, col = [C.red, C.yellow, C.sky, C.green, C.pink]) { P.ln(arc(270, y - 160, 300, 170, 28, 152, 14), INK, 3, false, 1.2); for (let i = 0; i < 11; i++) { const a = (36 + i * 10.8) * Math.PI / 180, x = 270 + Math.cos(a) * 300, yy = y - 160 + Math.sin(a) * 170; P.shp([x - 12, yy, x + 12, yy, x, yy + 26], col[i % col.length], INK, 2.6, { gap: 5 }); } }
function note(P, x, y, s, col) { P.shp(P.blob(x, y, 9 * s, 7 * s, 8), col, INK, 2.6, { gap: 4 }); P.ln([x + 8 * s, y - 2 * s, x + 8 * s, y - 28 * s, x + 20 * s, y - 20 * s], INK, 3.2); }
const noteSprite = (col) => sp('note:' + col, 40, 52, (P) => note(P, -6, 12, 1.2, col), 9);
const starSprite = (col, r) => sp('star:' + col + r, r * 3, r * 3, (P) => P.shp(star(0, 0, r, 0.44, 0.2), col, INK, 2.6, { gap: 4 }), 3);
function floor(P, y, col, line = true) { wash(P, 0, y, 540, 960 - y, col, 0.9, 12, -0.3); if (line) for (let i = 0; i < 6; i++) P.ln([0, y + 40 + i * 60 + (i % 2) * 5, 540, y + 36 + i * 60], INK, 2, false, 2); P.ln([0, y, 540, y + 3], INK, 4.5, false, 2); }
function brick(P, x, y, w, h, col = '#d68a6a') { wash(P, x, y, w, h, col, 0.85, 14, 0.5); for (let r = 0; r * 26 < h; r++) { P.ln([x, y + r * 26, x + w, y + r * 26], '#9b5a42', 2.2, false, 1.5); for (let k = (r % 2) * 25; k < w; k += 50) P.ln([x + k, y + r * 26, x + k, y + (r + 1) * 26], '#9b5a42', 2, false, 1); } }
function tvRobot(P, x, y, s, col = C.pink) {   // Mr. Playback: a grinning TV head with play and pause eyes
  P.ln([x, y - 150 * s, x, y - 185 * s], INK, 5); P.dot(x, y - 190 * s, 12 * s, C.yellow);
  poly(P, rect(x - 130 * s, y - 150 * s, 260 * s, 220 * s, 40 * s), col, 5.5, { gap: 9 });
  poly(P, rect(x - 100 * s, y - 118 * s, 200 * s, 100 * s, 22 * s), '#2a1633', 5, { gap: 7 });
  P.shp([x - 62 * s, y - 100 * s, x - 62 * s, y - 38 * s, x - 14 * s, y - 69 * s], C.pink, INK, 3, { gap: 5 });
  P.shp(rect(x + 20 * s, y - 100 * s, 18 * s, 62 * s), C.cyan, INK, 3, { gap: 5 }); P.shp(rect(x + 50 * s, y - 100 * s, 18 * s, 62 * s), C.cyan, INK, 3, { gap: 5 });
  P.ln(arc(x, y + 6 * s, 70 * s, 38 * s, 20, 160, 12), INK, 6); for (let i = -3; i <= 3; i++) P.ln([x + i * 18 * s, y + 38 * s, x + i * 18 * s, y + 48 * s], '#fff', 4);
  poly(P, rect(x - 150 * s, y + 70 * s, 300 * s, 60 * s, 22 * s), C.pink, 5, { gap: 8 });
  for (const [i, sh] of [[-1, 'p'], [0, 'q'], [1, 'f']]) { P.dot(x + i * 90 * s, y + 100 * s, 22 * s, '#2a1633'); if (sh === 'p') P.shp([x - 96 * s, y + 90 * s, x - 96 * s, y + 110 * s, x - 78 * s, y + 100 * s], C.pink, null, 0, { gap: 4 }); }
}

// ===================================================================================================== standing characters
const STAND = { roxor: [186, 738, 272], jasmin: [356, 738, 262] };
function duo(ctx, t, o) {
  o = o || {};
  const [ax, ay, as] = o.a || STAND.roxor, [bx, by, bs] = o.b || STAND.jasmin;
  drawHero(ctx, 'roxor', ax, ay + Math.sin(t * 2.2) * (o.bob == null ? 2 : o.bob), as * (o.k || 1), { t, pose: o.pa || 'cheer', talk: !!o.talk, flip: !!o.flipA, outfit: o.outfit });
  drawHero(ctx, 'jasmin', bx, by + Math.sin(t * 2.2 + 1) * (o.bob == null ? 2 : o.bob), bs * (o.k || 1), { t: t + 0.37, pose: o.pb || 'cheer', talk: !!o.talk, flip: !!o.flipB, outfit: o.outfit });
}
function pal(P, c) { }

// ===================================================================================================== scene definitions
// Each scene: bg(P), mid(P) optional, fg(P) optional baked layers, and live(ctx, t, p, u) that draws the animated bits and the characters between mid and fg.
function garageBg(P, dim) {
  wash(P, 0, 0, 540, 600, '#f6c98a', 0.95, 13); brick(P, 0, 0, 540, 560, '#e2a070');
  poly(P, rect(110, 90, 320, 360), C.sky, 5.5, { gap: 10 }); for (let i = 1; i < 7; i++) P.ln([110, 90 + i * 50, 430, 90 + i * 50], INK, 3, false, 1.5);   // open garage door with a sunny outside
  P.hatch(rect(116, 96, 308, 100), C.sky, 8, 0.4, 0.9); sun(P, 360, 150, 32);
  floor(P, 560, '#c28a55');
  poly(P, rect(20, 60, 70, 100), C.pink, 4, { gap: 8 }); P.txt('ROCK', 55, 122, 22, INK, { align: 'c', w: 3 }); poly(P, rect(445, 70, 74, 96), C.lime, 4, { gap: 8 }); P.shp(star(482, 118, 20, 0.45, 0), C.yellow, INK, 3, { gap: 5 });
  lamp(P, 270, -10); lightCone(P, 270, 128, 150, 400, C.yellow, 0.28);
  poly(P, rect(20, 190, 90, 12), C.brown, 3.5, { gap: 6 });
  speaker(P, 436, 380, 84, 120, C.purple); speaker(P, 440, 270, 78, 106, C.violet || C.purple);
  if (dim) { wash(P, 0, 0, 540, 960, '#6d6a80', 0.5, 11, 0.3); }
}
const SCENES = {
  garage_day: {
    bg: (P) => garageBg(P, false), mid: (P) => { drumKit(P, 92, 640, 1); },
    live(ctx, t, p) { notes(ctx, t, ['#ff5fb0', '#9dff3a', '#2fe6ff']); duo(ctx, t, { pa: 'sing', pb: 'sing' }); drawLoopy(ctx, 270, 704, 70, { t, mood: 'happy' }); },
  },
  static_arrives: {
    bg: (P) => garageBg(P, true), mid: (P) => { drumKit(P, 92, 640, 1); radio(P); },
    fg: (P) => { for (const [x, y, w, h] of [[0, 0, 540, 70], [0, 890, 540, 70], [0, 0, 60, 960], [480, 0, 60, 960]]) wash(P, x, y, w, h, '#8f8c9c', 0.8, 9, 0.6); },
    live(ctx, t, p) { creepers(ctx, t, p); duo(ctx, t, { pa: 'shock', pb: 'shock', bob: 0 }); drawLoopy(ctx, 270, 704, 70, { t, mood: 'worried' }); },
  },
  silent_town: {
    bg: (P) => { wash(P, 0, 0, 540, 900, '#b9c2d6', 0.95, 13); cloud(P, 120, 90, 1.3, '#dcdce6'); cloud(P, 400, 140, 1.1, '#dcdce6'); [[10, 260, 120, 200, '#aeb1c7'], [140, 230, 130, 230, '#b9b2c4'], [280, 270, 120, 190, '#a8b3c9'], [410, 240, 125, 220, '#b4b0c8']].forEach(([x, y, w, h, c], i) => house(P, x, y, w, h, c, '#8c88a0')); floor(P, 520, '#9a9aa6', false); P.ln([0, 600, 540, 604], INK, 3, false, 2); },
    mid: (P) => { [[70, 560], [210, 586], [330, 560], [450, 590]].forEach(([x, y], i) => frozen(P, x, y, i)); },
    live(ctx, t, p) { creepers(ctx, t, p * 0.4, 6); duo(ctx, t, { a: [170, 900, 330], b: [372, 900, 320], pa: 'sad', pb: 'shock', bob: 1 }); },
  },
  build: {
    bg: (P) => { wash(P, 0, 0, 540, 640, '#cdeaa0', 0.95, 13); brick(P, 0, 0, 540, 40, '#c9b27a'); blueprint(P); floor(P, 640, '#c9a06a'); poly(P, rect(40, 640, 460, 34), C.brown, 4.5, { gap: 7 }); P.ln([60, 674, 60, 760], INK, 5); P.ln([480, 674, 480, 760], INK, 5); },
    mid: (P) => { poly(P, rect(300, 590, 150, 50), C.red, 4, { gap: 6 }); P.ln([320, 590, 320, 570, 430, 570, 430, 590], INK, 4); [[100, 620, C.yellow], [130, 626, C.orange]].forEach(([x, y, c]) => poly(P, rect(x, y, 22, 14), c, 3, { gap: 5 })); },
    live(ctx, t, p) { duo(ctx, t, { a: [150, 800, 290], b: [400, 800, 280], pa: 'beat', pb: 'point', bob: 3 }); drawLoopy(ctx, 270, 590, 80, { t, mood: 'excited', talk: true }); sparks(ctx, t, 270, 520); },
  },
  van_night: {
    bg: (P) => { wash(P, 0, 0, 540, 640, '#8a96e8', 0.8, 12); stars(P, 24, 20, 360, 2); moon(P, 410, 150, 62); P.hatch([0, 560, 130, 470, 260, 540, 390, 450, 540, 520, 540, 640, 0, 640], '#7a68d0', 11, 0.4, 0.85); P.ln([0, 560, 130, 470, 260, 540, 390, 450, 540, 520], INK, 4, false, 2); wash(P, 0, 640, 540, 320, '#9a96ac', 0.8, 12, 0.3); P.ln([0, 640, 540, 644], INK, 4.5, false, 2); sign(P); },
    live(ctx, t, p) { road(ctx, t); van(ctx, 270, 690, 1.35, t); },
    fg: (P) => { for (const [x, y] of [[40, 880], [470, 900]]) { fuzzDraw(P, null, 16, 0.2, true); } },
  },
  boss_reveal: {
    bg: (P) => { wash(P, 0, 0, 540, 960, '#c9a0e8', 0.85, 11, 0.4); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; P.ln([270, 330, 270 + Math.cos(a) * 520, 330 + Math.sin(a) * 520], i % 2 ? '#ff5fb0' : '#9a6ad0', 6, false, 1); } },
    mid: (P) => { floor(P, 800, '#9a86b8', false); tvRobot(P, 270, 330, 1.3); },
    live(ctx, t, p) { duo(ctx, t, { a: [150, 900, 190], b: [392, 900, 186], pa: 'shock', pb: 'shock', bob: 0 }); },
  },
};
// world and boss scenes share a builder
for (const id of ['world_garage', 'world_busk', 'world_club', 'world_festival', 'world_arena', 'world_beach', 'world_moon']) SCENES[id] = worldScene(id);
for (const id of ['boss_compressor', 'boss_noisegate', 'boss_reverb', 'boss_djglitch', 'boss_playback', 'boss_lowpass', 'boss_silence']) SCENES[id] = bossScene(id);
SCENES.victory_stage = {
  bg: (P) => { wash(P, 0, 0, 540, 640, '#ffe27a', 0.95, 12); for (let i = 0; i < 7; i++) { const cols = [C.red, C.orange, C.yellow, C.green, C.sky, C.blue, C.purple]; P.ln(arc(270, 520, 330 - i * 14, 330 - i * 14, 180, 360, 14), cols[i], 11, false, 2); } bunting(P, 140); floor(P, 640, '#c2884f'); poly(P, rect(40, 640, 460, 50), '#8a5a2b', 4.5, { gap: 8 }); speaker(P, 20, 470, 90, 170, C.purple); speaker(P, 430, 470, 90, 170, C.purple); stars(P, 14, 40, 300, 4); },
  mid: (P) => { for (let i = 0; i < 6; i++) crowdHead(P, 40 + i * 92 + (i % 2) * 22, 880 - (i % 2) * 10, [C.skin, C.tan, '#ffd7b0', C.lime, C.sky, C.pink][i]); },
  live(ctx, t, p) { confetti(ctx, t); duo(ctx, t, { a: [190, 700, 290], b: [352, 700, 282], pa: 'cheer', pb: 'cheer', bob: 5 }); drawLoopy(ctx, 270, 660, 74, { t, mood: 'excited' }); },
};
SCENES.credits_van = {
  bg: (P) => { wash(P, 0, 0, 540, 260, '#ff9ac0', 0.95, 12); wash(P, 0, 260, 540, 200, '#ffb36b', 0.95, 12); wash(P, 0, 460, 540, 160, '#ffe27a', 0.95, 12); sun(P, 270, 470, 90); P.hatch([0, 620, 0, 540, 130, 500, 300, 560, 440, 490, 540, 530, 540, 620], '#6fbf5c', 10, 0.5, 0.95); P.ln([0, 540, 130, 500, 300, 560, 440, 490, 540, 530], INK, 4.5, false, 2); wash(P, 0, 620, 540, 340, '#5b5870', 0.95, 12, 0.3); P.ln([0, 620, 540, 624], INK, 4.5, false, 2); cloud(P, 90, 120, 1.2); cloud(P, 420, 80, 1); },
  live(ctx, t, p) { road(ctx, t); birds(ctx, t); van(ctx, 270 + Math.sin(t * 0.5) * 8, 720, 1.4, t, true); },
};
SCENES.defeat_quiet = {
  bg: (P) => { wash(P, 0, 0, 540, 960, '#a9a7b8', 0.97, 11, 0.3); floor(P, 700, '#6f6c80', false); for (let i = 0; i < 4; i++) { const x = 60 + i * 140; house(P, x, 380 + (i % 2) * 40, 100, 140, '#8f8c9c', '#6f6c80'); } },
  mid: (P) => { for (const [x, y, r] of [[60, 930, 34], [490, 920, 38], [270, 950, 28]]) fuzzDraw(P, null, r, 0.5, false); },
  live(ctx, t, p) { rain(ctx, t); duo(ctx, t, { a: [170, 820, 250], b: [376, 820, 244], pa: 'sad', pb: 'sad', bob: 0.5 }); halo(ctx, t); drawLoopy(ctx, 270, 800, 82, { t, mood: 'sleepy' }); },
};

// ===================================================================================================== the second tour: epilogues, credits
function chair(P, x, y, s = 1, col = C.sky) {   // an empty folding chair
  P.ln([x - 24 * s, y - 70 * s, x - 22 * s, y], INK, 4); P.ln([x + 24 * s, y - 70 * s, x + 28 * s, y], INK, 4); P.ln([x - 18 * s, y - 28 * s, x + 24 * s, y - 4 * s], INK, 3);
  poly(P, [x - 30 * s, y - 36 * s, x + 30 * s, y - 36 * s, x + 38 * s, y - 20 * s, x - 22 * s, y - 20 * s], col, 4, { gap: 6 }); poly(P, rect(x - 28 * s, y - 100 * s, 56 * s, 56 * s, 8 * s), col, 4, { gap: 6 });
}
function catDoodle(P, x, y, s = 1) {   // the garage cat: orange, curious
  P.ln(arc(x + 34 * s, y + 10 * s, 24 * s, 30 * s, -80, 80, 8), INK, 5); P.ln(arc(x + 34 * s, y + 10 * s, 24 * s, 30 * s, -80, 80, 8), C.orange, 2.6);
  poly(P, P.blob(x, y + 18 * s, 34 * s, 28 * s, 10), C.orange, 4.2, { gap: 6 });
  poly(P, P.blob(x - 6 * s, y - 14 * s, 24 * s, 21 * s, 10), C.orange, 4.2, { gap: 6 });
  P.shp([x - 24 * s, y - 28 * s, x - 22 * s, y - 46 * s, x - 10 * s, y - 32 * s], C.orange, INK, 3, { gap: 4 }); P.shp([x + 4 * s, y - 32 * s, x + 14 * s, y - 46 * s, x + 14 * s, y - 24 * s], C.orange, INK, 3, { gap: 4 });
  P.dot(x - 14 * s, y - 16 * s, 3.6 * s, INK); P.dot(x + 2 * s, y - 16 * s, 3.6 * s, INK); P.shp([x - 8 * s, y - 10 * s, x - 4 * s, y - 10 * s, x - 6 * s, y - 6 * s], C.pink, INK, 1.6, { gap: 3 });
  P.ln([x - 8 * s, y - 6 * s, x - 14 * s, y - 2 * s], INK, 2.4); P.ln([x - 4 * s, y - 6 * s, x + 2 * s, y - 2 * s], INK, 2.4);
  for (const sd of [-1, 1]) { P.ln([x - 6 * s + sd * 10 * s, y - 8 * s, x - 6 * s + sd * 30 * s, y - 12 * s], INK, 2); P.ln([x - 6 * s + sd * 10 * s, y - 5 * s, x - 6 * s + sd * 30 * s, y - 3 * s], INK, 2); }
}
function thumbsUp(P, x, y, s = 1) {
  poly(P, rect(x - 28 * s, y - 8 * s, 62 * s, 52 * s, 18 * s), C.skin, 4.5, { gap: 6 }); poly(P, rect(x - 26 * s, y - 56 * s, 20 * s, 54 * s, 10 * s), C.skin, 4.5, { gap: 6 });
  for (let i = 0; i < 3; i++) P.ln([x + 4 * s, y + (6 + i * 13) * s, x + 30 * s, y + (6 + i * 13) * s], INK, 3);
  poly(P, rect(x - 34 * s, y + 42 * s, 74 * s, 20 * s, 4), C.pink, 4, { gap: 6 });
}
function fogMachine(P, x, y, s = 1) {   // dances: box body, grumpy face, stubby arms, a nozzle
  poly(P, rect(x - 46 * s, y - 40 * s, 92 * s, 70 * s, 10 * s), '#4b4458', 4.5, { gap: 7, f2: '#8a82a0' });
  poly(P, rect(x + 40 * s, y - 24 * s, 34 * s, 22 * s, 6), C.grey, 4, { gap: 5 }); P.eye(x - 18 * s, y - 14 * s, 11 * s, 0.2); P.eye(x + 12 * s, y - 14 * s, 11 * s, 0.2); P.ln(arc(x - 3 * s, y + 8 * s, 16 * s, 8 * s, 20, 160, 8), '#fff', 3.4);
  P.ln([x - 46 * s, y - 10 * s, x - 70 * s, y - 36 * s], INK, 5); P.ln([x - 20 * s, y + 30 * s, x - 24 * s, y + 52 * s], INK, 5); P.ln([x + 20 * s, y + 30 * s, x + 28 * s, y + 52 * s], INK, 5);
}
function drinkGlass(P, x, y, s = 1) {
  poly(P, [x - 22 * s, y - 50 * s, x + 22 * s, y - 50 * s, x + 14 * s, y, x - 14 * s, y], '#ffb347', 4, { gap: 5, f2: '#fff' }); P.ln([x + 4 * s, y - 52 * s, x + 18 * s, y - 84 * s], C.red, 4); P.shp([x + 18 * s, y - 84 * s, x + 44 * s, y - 80 * s, x + 28 * s, y - 68 * s], C.pink, INK, 2.6, { gap: 4 });
  P.ln([x - 16 * s, y + 4 * s, x + 16 * s, y + 4 * s], INK, 4);
}
function mapScroll(P, x, y, w, h, rot) {   // the tour map: fold lines, a dotted route to a beach and the moon
  const c = P.ctx; c.save(); c.translate(x, y); c.rotate(rot);
  poly(P, rect(-w / 2, -h / 2, w, h), '#fff3c4', 5, { gap: 9, alpha: 0.96 }); P.ln([-w / 6, -h / 2, -w / 6, h / 2], '#d9c98a', 2.2, false, 0.8); P.ln([w / 6, -h / 2, w / 6, h / 2], '#d9c98a', 2.2, false, 0.8);
  P.ln([-w * 0.38, h * 0.3, -w * 0.18, h * 0.05, w * 0.02, h * 0.18, w * 0.2, -h * 0.12, w * 0.34, -h * 0.34], C.red, 4, false, 1.2, [10, 9]);
  P.shp(star(-w * 0.38, h * 0.3, 14, 0.46, 0), C.yellow, INK, 2.6, { gap: 4 });   // we are here
  P.ln(arc(w * 0.06, h * 0.32, 22, 8, 200, 340, 6), C.blue, 3); P.ln(arc(w * 0.06 + 14, h * 0.4, 22, 8, 200, 340, 6), C.blue, 3);
  P.ln([w * 0.0, h * 0.16, w * 0.0, h * 0.0], '#7a4d28', 4); for (let i = 0; i < 4; i++) P.ln([w * 0.0, h * 0.0, w * 0.0 + Math.cos(-2.6 + i * 0.7) * 20, h * 0.0 + Math.sin(-2.6 + i * 0.7) * 14], C.green, 4);   // the beach palm
  P.shp(P.blob(w * 0.34, -h * 0.34, 18, 18, 10), '#fff3b0', INK, 3, { gap: 4 }); P.shp(star(w * 0.34 + 28, -h * 0.34 - 16, 6, 0.46, 0), C.cyan, INK, 1.8, { gap: 3 });   // the moon
  P.txt('TOUR 2', 0, -h * 0.36, 22, C.red, { align: 'c', w: 3.4 });
  c.restore();
}
function campfire(P, x, y, s = 1) { AP.logsAndStones(P, x, y, 140 * s); }
function beachFire(ctx, t, x, y, s = 1) { AP.flames(ctx, x, y, 90 * s, t, 0); }
function lowGrav(ctx, t) {   // slow floaty bubbles and glow sticks
  ctx.save(); ctx.lineWidth = 2.4; const cols = [C.cyan, C.pink, '#fff3b0', C.lime];
  for (let i = 0; i < 16; i++) { const k = (t * (0.03 + hn(i) * 0.025) + hn(i * 2 + 4)) % 1, x = 540 * hn(i * 5 + 2) + Math.sin(t * 0.6 + i * 1.7) * 18, y = 980 - k * 1000; ctx.globalAlpha = Math.sin(k * Math.PI) * 0.8; ctx.strokeStyle = cols[i % 4]; ctx.beginPath(); ctx.arc(x, y, 4 + hn(i + 9) * 6, 0, TAU); ctx.stroke(); }
  ctx.restore();
}
const stage = (P, x, y, w, h, col = '#c58ad8') => { poly(P, rect(x, y, w, h, 8), col, 5, { gap: 8 }); P.ln([x + 10, y + h, x + 6, y + h + 40], INK, 4); P.ln([x + w - 10, y + h, x + w - 6, y + h + 40], INK, 4); };
function crowdRow(P, y, n, seed, cols, s = 1) { for (let i = 0; i < n; i++) { const x = 30 + (i + 0.5) * (480 / n) + (hn(seed + i) - 0.5) * 12; crowdHead(P, x, y + (hn(seed + i * 3) - 0.5) * 14, cols[(i + seed) % cols.length]); } }
const CROWD = [C.skin, C.tan, '#ffd7b0', C.lime, C.sky, C.pink, C.orange, C.lav];
function clapLines(ctx, t, x, y) { ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.lineCap = 'round'; const k = Math.abs(Math.sin(t * 5)); ctx.globalAlpha = 0.4 + k * 0.6; ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = -2.5 + i * 0.5; ctx.moveTo(x + Math.cos(a) * (14 + k * 6), y + Math.sin(a) * (14 + k * 6)); ctx.lineTo(x + Math.cos(a) * (26 + k * 8), y + Math.sin(a) * (26 + k * 8)); } ctx.stroke(); ctx.restore(); }
function fogPuffs(ctx, t, x, y) { for (let i = 0; i < 5; i++) { const k = (t * 0.35 + i * 0.2) % 1; ctx.save(); ctx.globalAlpha = Math.sin(k * Math.PI) * 0.85; blit(ctx, fogSprite(), x + k * 150 + Math.sin(i * 3) * 8, y - 30 - k * 120 + Math.sin(t * 2 + i) * 6, t, { scale: 0.5 + k * 1.0 }); ctx.restore(); } }
const fogSprite = () => sp('fog', 120, 80, (P) => cloud(P, 0, 6, 1.0, '#f4f0ff'), 17);
const rays = (P, cx, cy, n, col, len = 560, w = 6, a0 = 0) => { for (let i = 0; i < n; i++) { const a = a0 + i / n * TAU; P.ln([cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len], col, w, false, 1); } };

SCENES.epilogue_garage = {
  bg: (P) => {
    wash(P, 0, 0, 540, 600, '#ffd9ae', 0.95, 13); wash(P, 0, 0, 540, 170, '#ffb7a0', 0.55, 12, 0.3); brick(P, 0, 0, 110, 560, '#e8ad82'); brick(P, 430, 0, 110, 560, '#e8ad82');
    poly(P, rect(110, 90, 320, 360), '#ffe3a8', 5.5, { gap: 10 }); P.hatch(rect(116, 96, 308, 160), '#ffc2a0', 9, 0.4, 0.6); rays(P, 270, 430, 11, 'rgba(255,214,90,0.7)', 330, 6, -Math.PI);
    sun(P, 270, 430, 50, '#ffb347'); P.hatch(rect(116, 380, 308, 64), '#c9946a', 9, 0.3, 0.9); P.ln([110, 450, 430, 450], INK, 5, false, 1);
    poly(P, rect(110, 60, 320, 40), '#cfc7dd', 5, { gap: 8 }); for (let i = 1; i < 3; i++) P.ln([110, 60 + i * 13, 430, 60 + i * 13], INK, 3, false, 1.4);
    floor(P, 560, '#c9925c'); lightCone(P, 270, 450, 200, 420, '#ffe27a', 0.3);
    speaker(P, 440, 380, 84, 120, C.purple); drumKit(P, 70, 600, 0.8);
  },
  mid: (P) => { chair(P, 230, 700, 0.8); chair(P, 316, 706, 0.7, C.orange); catDoodle(P, 462, 570, 0.8); P.txt('MEOW', 470, 500, 20, C.red, { align: 'c', rot: -0.15, w: 3.2 }); },
  live(ctx, t) { notes(ctx, t, [C.orange, C.pink, C.sky]); duo(ctx, t, { a: [140, 870, 272], b: [402, 870, 262], k: 0.8, pa: 'cheer', pb: 'cheer' }); drawLoopy(ctx, 270, 850, 64, { t, mood: 'happy' }); ctx.save(); ctx.translate(430, 300 + Math.sin(t * 2.4) * 6); ctx.rotate(-0.15); blit(ctx, sp('thumb', 120, 130, (P) => thumbsUp(P, 0, -4, 1.1), 11), 0, 0, t, { scale: 1.25 }); ctx.restore(); },
};
SCENES.epilogue_busk = {
  bg: (P) => {
    wash(P, 0, 0, 540, 640, '#f5a97a', 0.95, 12); wash(P, 0, 0, 540, 200, '#c9a0e0', 0.5, 12, 0.3); cloud(P, 400, 90, 1.2, '#ffe3d0');
    [[0, 270, 150, 340, '#e9a0b0'], [140, 240, 140, 370, '#f0d28a'], [270, 280, 130, 330, '#9ed0a0'], [390, 250, 150, 360, '#b8a2e0']].forEach(([x, y, w, h, c]) => house(P, x, y, w, h, c, C.brown));
    for (const x of [80, 270, 460]) { P.ln([x, 500, x, 640], INK, 5); P.dot(x, 490, 15, C.yellow); P.hatch([x - 8, 500, x + 8, 500, x + 60, 700, x - 60, 700], '#ffe27a', 9, 0.9, 0.22); }
    bunting(P, 330); floor(P, 650, '#a9a6ba', false); for (let r = 0; r < 6; r++) for (let q = 0; q < 12; q++) P.ln(arc(q * 46 + (r % 2) * 23, 672 + r * 44, 22, 14, 180, 360, 5), '#6f6c80', 2, false, 1);
  },
  mid: (P) => {
    poly(P, rect(60, 820, 210, 90, 10), '#5a3d7a', 5, { gap: 8 }); P.hatch([66, 826, 264, 826, 252, 880, 78, 880], '#2a1633', 8, 0.2, 0.9);   // open guitar case
    P.dot(110, 850, 11, C.red); P.dot(110, 850, 4, C.yellow); P.shp([150, 846, 178, 846, 164, 868], C.pink, INK, 3, { gap: 4 });   // a button and a pick
    P.shp(P.blob(220, 856, 28, 12, 8), '#e8c17a', INK, 3, { gap: 4 }); P.ln([196, 856, 244, 856], '#7aa04a', 4);   // a very old sandwich
    crowdRow(P, 936, 7, 3, CROWD);
  },
  live(ctx, t) { duo(ctx, t, { a: [160, 800, 272], b: [382, 800, 262], k: 0.8, pa: 'cheer', pb: 'sing', bob: 3 }); for (const x of [150, 250, 330, 430]) clapLines(ctx, t + x, x, 912); },
};
SCENES.epilogue_club = {
  bg: (P) => {
    wash(P, 0, 0, 540, 960, '#c0a0f0', 0.9, 11, 0.4); wash(P, 0, 0, 540, 220, '#7a4fd0', 0.45, 11, 0.5);
    for (let i = 0; i < 6; i++) { const col = ['#ff2fb9', '#19d3ff', '#9dff3a', '#ffd60a', '#ff5fb0', '#ff9226'][i], a = -1.0 + i * 0.4; P.hatch([270, 70, 270 + Math.sin(a) * 700 - 14, 70 + Math.cos(a) * 700, 270 + Math.sin(a) * 700 + 14, 70 + Math.cos(a) * 700], col, 8, 0.9, 0.5); }
    ball(P, 270, 90); speaker(P, 20, 420, 96, 200, '#3b3158'); speaker(P, 424, 420, 96, 200, '#3b3158');
    for (let r = 0; r < 5; r++) for (let q = 0; q < 6; q++) P.shp(rect(q * 90 + (r % 2) * 10, 700 + r * 52, 88, 50), (q + r) % 2 ? C.mag : C.cyan, INK, 2.6, { gap: 7, alpha: 0.8 });
  },
  mid: (P) => { poly(P, rect(440, 800, 100, 36, 6), '#4b4458', 5, { gap: 8 }); drinkGlass(P, 494, 800, 0.8); },
  live(ctx, t, p) { fogPuffs(ctx, t, 90, 810); ctx.save(); ctx.translate(70, 780 + Math.abs(Math.sin(t * 4)) * -10); blit(ctx, sp('fogm', 160, 150, (P) => fogMachine(P, 0, 0, 1), 19), 0, 0, t, { scale: 1 }); ctx.restore(); duo(ctx, t, { a: [226, 840, 272], b: [380, 840, 262], k: 0.8, pa: 'hype', pb: 'hype', bob: 4 }); sparks(ctx, t, 270, 560); },
};
SCENES.epilogue_festival = {
  bg: (P) => {
    ['#ffd95a', '#ffb347', '#ff8a5a', '#f2619a', '#9b6bd8'].forEach((col, i) => wash(P, 0, i * 110, 540, 120, col, 0.9, 11, 0.15)); sun(P, 270, 440, 110, '#ffd05a'); bunting(P, 230); cloud(P, 100, 180, 1.2); cloud(P, 440, 150, 1.1);
    for (let i = 0; i < 3; i++) P.hatch([0, 640 - i * 26, 540, 620 - i * 26, 540, 700, 0, 700], ['#4fb85a', '#5fc84a', '#6fd85a'][i], 9, -0.3 + i * 0.1, 0.9); floor(P, 700, '#5a8a3a', false);
    for (let i = 0; i < 5; i++) P.ln([40 + i * 110, 340, 40 + i * 110, 600], INK, 3, false, 1); for (let i = 0; i < 5; i++) { for (let k = 0; k < 4; k++) P.shp([50 + i * 110, 350 + k * 22, 90 + i * 110, 356 + k * 22, 50 + i * 110, 370 + k * 22], [C.red, C.yellow, C.sky, C.pink][(i + k) % 4], INK, 2.4, { gap: 4 }); }
  },
  mid: (P) => { crowdRow(P, 905, 8, 7, CROWD); crowdRow(P, 950, 9, 12, CROWD); for (let i = 0; i < 4; i++) { P.ln(arc(270, 220 + i * 6, 240 - i * 4, 50, 200, 340, 14), 'rgba(43,39,51,0.4)', 2.6, false, 2); } },
  live(ctx, t) { for (let i = 0; i < 9; i++) { const x = 40 + i * 56, y = 130 + Math.sin(t * 2 + i * 0.7) * 24 + (i % 3) * 22; ctx.save(); ctx.globalAlpha = 0.9; blit(ctx, noteSprite([C.red, C.yellow, C.pink, C.sky][i % 4]), x, y, t, { scale: 1.1 + 0.15 * Math.sin(t * 3 + i) }); ctx.restore(); } confetti(ctx, t); duo(ctx, t, { a: [170, 810, 272], b: [372, 810, 262], k: 0.8, pa: 'sing', pb: 'sing', bob: 3 }); },
};
SCENES.epilogue_arena = {
  bg: (P) => {
    wash(P, 0, 0, 540, 960, '#a8a0e8', 0.9, 11, 0.4); wash(P, 0, 0, 540, 220, '#5a4ab8', 0.5, 11, 0.4); for (let r = 0; r < 6; r++) P.ln(arc(270, 700, 310 - r * 38, 270 - r * 32, 180, 360, 18), ['#5a6ad0', '#7a5ad0', '#9a5ac0', '#c05aa0', '#e05a80', '#f06060'][r], 16, false, 3);
    for (let i = 0; i < 4; i++) P.hatch([60 + i * 130, 0, 90 + i * 130, 0, 190 + i * 40, 560, 140 + i * 40, 560], '#fff7a0', 9, 0.9, 0.16); stars(P, 14, 20, 260, 9); floor(P, 690, '#34346a', false);
    for (let i = 0; i < 14; i++) P.dot(30 + i * 36 + (i % 2) * 8, 640 + (i % 3) * 14, 9, [C.pink, C.sky, C.yellow, C.lime][i % 4]);
  },
  mid: (P) => { mapScroll(P, 270, 380, 340, 210, -0.05); P.ln([140, 276, 120, 210], INK, 4); P.ln([400, 276, 420, 210], INK, 4); },
  live(ctx, t) { duo(ctx, t, { a: [150, 860, 272], b: [392, 860, 262], k: 0.8, pa: 'point', pb: 'cheer', bob: 3 }); drawLoopy(ctx, 270, 840, 66, { t, mood: 'excited', talk: true }); sparks(ctx, t, 270, 270); },
};
SCENES.epilogue_beach = {
  bg: (P) => {
    wash(P, 0, 0, 540, 200, '#3a3a98', 0.95, 11, 0.2); ['#ffe08a', '#ffb56a', '#f7808f', '#9a6ad0'].forEach((col, i) => wash(P, 0, 300 - i * 82, 540, 96, col, 0.9, 11, 0.2 + i * 0.05)); stars(P, 14, 10, 200, 14); moon(P, 420, 120, 54);
    wash(P, 0, 380, 540, 130, '#2fc4b2', 0.95, 11, 0.1); P.ln([0, 380, 540, 384], INK, 4, false, 2); for (let q = 0; q < 12; q++) P.ln(arc(q * 48 + 10, 420 + (q % 3) * 26, 20, 7, 200, 340, 5), '#eafffb', 3, false, 1);
    floor(P, 510, '#f6d38a', false); wash(P, 0, 510, 540, 26, '#d9b070', 0.7, 9, 0.3); AP.palmTree(P, 36, 760, 340, 0.3); AP.palmTree(P, 506, 780, 300, -0.3); AP.logsAndStones(P, 270, 770, 150);
    AP.surfboard(P, 70, 900, 200, -1.25, C.pink, '#fff'); AP.beachBall(P, 470, 910, 30); AP.starfish(P, 330, 930, 18, C.orange);
  },
  live(ctx, t) { AP.flames(ctx, 270, 774, 120, t, 0); for (let i = 0; i < 8; i++) { const k = (t * 0.3 + i * 0.125) % 1; ctx.save(); ctx.globalAlpha = 1 - k; blit(ctx, starSprite(C.yellow, 5), 270 + Math.sin(i * 5 + t) * 50, 700 - k * 300, t, { scale: 0.5 }); ctx.restore(); }
    duo(ctx, t, { a: [140, 880, 272], b: [410, 880, 262], k: 0.8, pa: 'cheer', pb: 'point', bob: 2 });
    ctx.save(); ctx.strokeStyle = '#7a4d28'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(210, 760); ctx.lineTo(252, 690); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(256, 684, 11, 8, -0.8, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();   // the surviving marshmallow
    drawLoopy(ctx, 270, 600, 62, { t, mood: 'excited', talk: true }); },
};
SCENES.epilogue_moon = {
  bg: (P) => {
    wash(P, 0, 0, 540, 960, '#2a3ad0', 0.5, 11, 0.5); wash(P, 0, 0, 540, 960, '#7a3ad0', 0.25, 13, -0.4); stars(P, 50, 10, 640, 21);
    for (let i = 0; i < 9; i++) { const col = [C.mag, C.cyan, C.lime, C.yellow, C.pink, C.orange, C.red, C.blue, C.purple][i]; P.ln(arc(270, 270, 120 + i * 11, 120 + i * 11, 180 + i * 6, 360 - i * 4, 16), col, 7, false, 1.4); }
    moon(P, 270, 270, 110); P.ln(arc(270, 270, 124, 124, 0, 360, 24), C.cyan, 5, true, 2); P.ln(arc(274, 274, 132, 132, 0, 360, 24), C.mag, 3.4, true, 2);
    AP.planet(P, 80, 180, 30, '#5f8cff', false); AP.planet(P, 470, 120, 20, '#ff8ac8', true);
    AP.floatRock(P, 90, 640, 170, 100); AP.floatRock(P, 460, 600, 160, 90); AP.floatRock(P, 270, 850, 380, 100, '#b4baff');
    for (const [x, y, r, col] of [[50, 620, -0.8, C.lime], [120, 620, 0.8, C.pink], [430, 580, 0.4, C.cyan], [490, 580, -0.6, C.yellow]]) AP.glowStick(P, x, y, 64, r, col);
    wash(P, 0, 930, 540, 30, '#7c82d8', 0.9, 11, 0.3);
  },
  live(ctx, t) { lowGrav(ctx, t); confetti(ctx, t); for (let i = 0; i < 6; i++) { const a = t * 0.8 + i * 1.05; ctx.save(); ctx.strokeStyle = [C.mag, C.cyan, C.lime, C.yellow, C.pink, C.orange][i]; ctx.globalAlpha = 0.5; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(270, 270); ctx.lineTo(270 + Math.cos(a) * 560, 270 + Math.sin(a) * 560); ctx.stroke(); ctx.restore(); }
    duo(ctx, t, { a: [170, 860, 272], b: [372, 860, 262], k: 0.8, pa: 'cheer', pb: 'sing', bob: 5 }); drawLoopy(ctx, 270, 830, 58, { t, mood: 'excited' }); },
};
SCENES.credits_moon = {
  bg: (P) => {
    wash(P, 0, 0, 540, 960, '#1e2a8c', 0.6, 11, 0.5); wash(P, 0, 0, 540, 960, '#5a2fb0', 0.3, 13, -0.4); stars(P, 60, 10, 600, 31);
    P.shp(P.blob(420, 190, 70, 70, 16, 0.03), '#5f8cff', INK, 4.5, { gap: 7, f2: '#bfe9ff' }); for (const [dx, dy, rr] of [[-18, -12, 22], [16, 12, 18]]) P.hatch(P.blob(420 + dx, 190 + dy, rr, rr * 0.8, 9), '#43b94a', 6, 0.5, 0.9);   // Earth, far away
    wash(P, 0, 640, 540, 320, '#8a90e0', 0.95, 11, 0.3); P.ln([0, 640, 130, 620, 300, 650, 440, 615, 540, 640], INK, 4.5, false, 2); for (const [cx, cy, rw] of [[90, 760, 70], [330, 820, 90], [480, 730, 50], [200, 900, 70]]) P.shp(arc(cx, cy, rw, rw * 0.3, 0, 360, 12), '#6a70c8', INK, 3.4, { gap: 6 });
    P.ln([0, 930, 120, 880, 200, 940, 330, 870, 440, 930, 540, 860], '#ffd60a', 8, false, 2); P.ln([0, 930, 120, 880, 200, 940, 330, 870, 440, 930, 540, 860], INK, 2.6, false, 2);   // one very long cable
    stage(P, 110, 600, 320, 40, '#c58ad8'); speaker(P, 80, 470, 70, 130, '#3b3158'); speaker(P, 390, 470, 70, 130, '#3b3158');
    bunting(P, 140);
  },
  mid: (P) => { for (let i = 0; i < 5; i++) { const x = 60 + i * 100, y = 760 + (i % 2) * 70; P.shp(P.blob(x, y, 24, 28, 10), [C.lime, C.cyan, C.pink, C.yellow, C.orange][i], INK, 3.6, { gap: 5 }); P.eye(x - 8, y - 6, 7, 0.3); P.eye(x + 8, y - 6, 7, 0.3); P.ln([x - 6, y + 10, x, y + 14, x + 6, y + 10], INK, 2.6); P.ln([x, y - 28, x, y - 40], INK, 3); P.dot(x, y - 42, 4, C.red); } },
  live(ctx, t) { lowGrav(ctx, t); notes(ctx, t, [C.cyan, C.pink, C.yellow]); confetti(ctx, t); duo(ctx, t, { a: [196, 650, 250], b: [346, 650, 240], pa: 'sing', pb: 'beat', bob: 4 }); drawLoopy(ctx, 270, 635, 56, { t, mood: 'excited' }); for (let i = 0; i < 4; i++) { const k = (t * 0.5 + i * 0.25) % 1; ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = C.cyan; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(270, 560, 40 + k * 260, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); ctx.restore(); } },
};

function radio(P) { poly(P, rect(40, 130, 90, 56, 8), C.orange, 4.5, { gap: 7 }); P.dot(60, 160, 14, '#4b4458'); P.ln([84, 150, 92, 150, 96, 130, 100, 168, 104, 150, 118, 150], INK, 3); P.ln([130, 130, 150, 100], INK, 3); }
function blueprint(P) {
  poly(P, rect(90, 70, 360, 300), '#dff1ff', 5, { gap: 10, alpha: 0.95 });
  for (const [x, y] of [[104, 82], [436, 82]]) P.dot(x, y, 6, C.red);
  P.ln(arc(270, 250, 70, 70, 0, 360, 14), C.blue, 4, true, 1.5); P.ln(arc(270, 250, 38, 38, 0, 360, 12), C.blue, 3.5, true, 1.2);
  P.ln([270, 250, 380, 160, 392, 176, 296, 262], C.blue, 4, false, 1.5); P.ln([160, 340, 380, 340], C.blue, 3, false, 1.5, [10, 8]); P.txt('KICK CANNON', 270, 118, 26, C.blue, { align: 'c', w: 3.5 });
  P.ln([420, 120, 430, 110, 440, 120], C.red, 3); P.txt('X2', 380, 345, 20, C.red, { align: 'c', w: 3 });
}
function frozen(P, x, y, i) {
  poly(P, P.blob(x, y - 62, 24, 26, 10), '#d2d0dc', 4, { gap: 6 }); P.dot(x - 8, y - 66, 3, INK); P.dot(x + 8, y - 66, 3, INK); P.shp(P.blob(x, y - 50, 7, 9, 8), INK, INK, 1, { gap: 3 });
  poly(P, [x - 22, y - 34, x + 22, y - 34, x + 26, y + 40, x - 26, y + 40], '#c4c2d2', 4, { gap: 7 }); P.ln([x - 22, y - 28, x - 44, y - 56], INK, 4); P.ln([x + 22, y - 28, x + 44, y - 56], INK, 4);
  note(P, x + 52, y - 94, 1.0, '#bdbdcb'); P.ln([x + 36, y - 112, x + 74, y - 70], C.red, 4); P.ln([x + 74, y - 112, x + 36, y - 70], C.red, 4);
}
function sign(P) { P.ln([430, 640, 430, 520], INK, 5); poly(P, rect(340, 470, 180, 64), '#ffe98f', 4.5, { gap: 8 }); P.txt('MEGA ARENA', 430, 515, 22, INK, { align: 'c', w: 3.4 }); P.ln([356, 548, 400, 548, 392, 540, 400, 548, 392, 556], INK, 3.4); }
function worldScene(id) {
  const W = WORLD_BY_ID[id.slice(6)];
  const title = W.name.toUpperCase();
  const sky = { garage: '#f6c98a', busk: '#8fc3f0', club: '#b79af0', festival: '#ff8f5a', arena: '#8fa0f0', beach: '#ffb07a', moon: '#1e2a8c' }[id.slice(6)];
  return {
    bg: (P) => {
      const k = id.slice(6);
      wash(P, 0, 0, 540, 700, sky, 0.96, 12);
      if (k === 'garage') { brick(P, 0, 120, 540, 400); house(P, 150, 330, 240, 200, '#f1dfae', C.red); poly(P, rect(190, 380, 160, 150), '#2a1633', 5, { gap: 8 }); sun(P, 450, 100, 40); cloud(P, 120, 90, 1.1); floor(P, 700, '#8a8a99', false); }
      if (k === 'busk') { [[0, 280, 150, 330, '#e9a0b0'], [140, 250, 140, 360, '#f0d28a'], [270, 290, 130, 320, '#9ed0a0'], [390, 260, 150, 350, '#b8a2e0']].forEach(([x, y, w, h, c]) => house(P, x, y, w, h, c, C.brown)); for (const x of [90, 270, 450]) { P.ln([x, 480, x, 620], INK, 5); P.dot(x, 470, 14, C.yellow); } bunting(P, 330); floor(P, 640, '#a9a6ba', false); for (let r = 0; r < 6; r++) for (let q = 0; q < 12; q++) P.ln(arc(q * 46 + (r % 2) * 23, 660 + r * 44, 22, 14, 180, 360, 5), '#6f6c80', 2, false, 1); cloud(P, 380, 90, 1.2); }
      if (k === 'club') { for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.45; P.hatch([60 + i * 100, 0, 80 + i * 100, 0, 200 + i * 60 + Math.sin(a) * 200, 520, 160 + i * 60, 520], ['#ff2fb9', '#19d3ff', '#9dff3a', '#ffd60a', '#ff5fb0'][i], 8, 0.9, 0.55); } poly(P, rect(110, 150, 320, 110), '#fff1b8', 6, { gap: 7 }); P.txt('CLUB', 270, 238, 74, '#ff5fb0', { align: 'c', w: 8, out: INK, ow: 5 }); ball(P, 460, 60); for (let r = 0; r < 4; r++) for (let q = 0; q < 6; q++) P.shp(rect(q * 90 + (r % 2) * 10, 640 + r * 70, 88, 68), (q + r) % 2 ? C.mag : C.cyan, INK, 2.6, { gap: 7, alpha: 0.8 }); }
      if (k === 'festival') { sun(P, 270, 400, 120, '#ffd05a'); for (const [x, y, c] of [[40, 380, C.red], [210, 340, C.yellow], [380, 380, C.sky]]) { poly(P, [x - 20, y + 140, x + 70, y - 40, x + 160, y + 140], c, 5, { gap: 8 }); poly(P, rect(x + 10, y + 100, 120, 80), '#fff7e0', 4, { gap: 9 }); } bunting(P, 250); floor(P, 640, '#6fbf5c', false); for (let i = 0; i < 20; i++) P.ln([20 + i * 27, 650 + (i % 3) * 20, 22 + i * 27, 638 + (i % 3) * 20], '#3e8a3a', 3); poly(P, rect(130, 500, 280, 140), '#5a3d7a', 5, { gap: 8 }); speaker(P, 100, 480, 50, 160, C.purple); speaker(P, 390, 480, 50, 160, C.purple); }
      if (k === 'beach') { for (const [i, col] of ['#ffe08a', '#ffb56a', '#f7808f', '#b88ae0'].entries()) wash(P, 0, 360 - i * 90, 540, 100, col, 0.85, 11, 0.2 + i * 0.05); sun(P, 270, 400, 70, '#ffd05a'); wash(P, 0, 400, 540, 130, '#2fc4b2', 0.95, 11, 0.1); P.ln([0, 400, 540, 404], INK, 4, false, 2); for (let q = 0; q < 12; q++) P.ln(arc(q * 48 + 10, 440 + (q % 3) * 24, 20, 7, 200, 340, 5), '#eafffb', 3, false, 1); floor(P, 530, '#f6d38a', false); wash(P, 0, 530, 540, 26, '#d9b070', 0.7, 9, 0.3); AP.palmTree(P, 56, 700, 300, 0.3); AP.palmTree(P, 488, 720, 340, -0.32); AP.sailboat(P, 420, 402, 22); AP.logsAndStones(P, 270, 640, 130); P.ln(arc(270, 70, 330, 90, 20, 160, 16), INK, 3, false, 1.2); for (let q = 0; q < 12; q++) { const a = (24 + q * 11) * Math.PI / 180; P.dot(270 + Math.cos(a) * 330, 70 + Math.sin(a) * 90, 7, [C.yellow, C.pink, C.cyan, C.lime][q % 4]); } }
      if (k === 'moon') { wash(P, 0, 0, 540, 700, '#3a4ad0', 0.4, 12, 0.5); stars(P, 40, 20, 540, 8); for (let q = 0; q < 14; q++) { const a = q / 14 * TAU; P.ln([270, 300, 270 + Math.cos(a) * 520, 300 + Math.sin(a) * 520], q % 2 ? 'rgba(95,232,255,0.35)' : 'rgba(255,95,200,0.3)', 6, false, 1); } P.ln(arc(270, 300, 166, 166, 0, 360, 24), C.cyan, 6, true, 2); P.ln(arc(274, 304, 176, 176, 0, 360, 24), C.mag, 4, true, 2); moon(P, 270, 300, 150); AP.planet(P, 80, 160, 36, '#5f8cff', false); AP.planet(P, 470, 200, 24, '#ff8ac8', true); AP.floatRock(P, 130, 640, 190, 110); AP.floatRock(P, 420, 600, 170, 100); AP.floatRock(P, 270, 700, 240, 130, '#b4baff'); P.ln(arc(270, 640, 80, 80, 180, 360, 14), C.mag, 8, false, 1); P.ln(arc(270, 640, 56, 56, 180, 360, 12), C.cyan, 6, false, 1); AP.glowStick(P, 100, 618, 70, -0.8, C.lime); AP.glowStick(P, 160, 618, 70, 0.9, C.pink); AP.glowStick(P, 440, 580, 70, 0.4, C.cyan); wash(P, 0, 780, 540, 180, '#7c82d8', 0.9, 11, 0.3); P.ln([0, 780, 540, 786], INK, 4, false, 2); for (const [cx, cy, rw] of [[90, 860, 60], [300, 900, 80], [460, 850, 50]]) P.shp(arc(cx, cy, rw, rw * 0.3, 0, 360, 12), '#5a5fb8', INK, 3.4, { gap: 6 }); }
      if (k === 'arena') { for (let r = 0; r < 6; r++) P.ln(arc(270, 680, 300 - r * 36, 250 - r * 30, 180, 360, 18), ['#5a6ad0', '#7a5ad0', '#9a5ac0', '#c05aa0', '#e05a80', '#f06060'][r], 16, false, 3); for (let i = 0; i < 4; i++) P.hatch([60 + i * 130, 0, 90 + i * 130, 0, 190 + i * 40, 520, 140 + i * 40, 520], '#fff7a0', 9, 0.9, 0.18); poly(P, rect(60, 70, 130, 90), '#ffe9a0', 5, { gap: 6 }); poly(P, rect(350, 70, 130, 90), '#ffe9a0', 5, { gap: 6 }); P.txt('LIVE', 125, 130, 40, C.red, { align: 'c', w: 5, out: INK, ow: 4 }); P.txt('LIVE', 415, 130, 40, C.blue, { align: 'c', w: 5, out: INK, ow: 4 }); floor(P, 660, '#34346a', false); for (const x of [90, 270, 450]) P.ln([x, 960, 270, 700], '#e9e5f5', 8, false, 2, [18, 14]); }
    },
    mid: (P) => { if (id === 'world_garage' || id === 'world_busk') for (let i = 0; i < 4; i++) fuzzDraw(P, null, 16, 0.4, i % 2 === 0); },
    fg: (P) => { banner(P, 60, 24, 420, 70, title, '#fff7c9'); },
    live(ctx, t, p) { creepers(ctx, t, p * 0.5, id === 'world_arena' ? 8 : 5); if (id === 'world_beach') beachFire(ctx, t, 270, 640, 1.2); duo(ctx, t, { a: [190, 860, 330], b: [352, 860, 320], pa: 'point', pb: 'cheer', bob: 2 }); if (id === 'world_moon') lowGrav(ctx, t); },
  };
}
function ball(P, x, y) { P.ln([x, 0, x, y - 40], INK, 4); poly(P, P.blob(x, y, 40, 40, 14), '#d6d6e6', 5, { gap: 6, f2: '#fff' }); for (let i = -1; i <= 1; i++) P.ln([x - 38, y + i * 20, x + 38, y + i * 20], INK, 2, false, 1); for (let i = -1; i <= 1; i++) P.ln([x + i * 20, y - 38, x + i * 20, y + 38], INK, 2, false, 1); }
function bossScene(id) {
  const key = id.slice(5), B = BOSSES[key];
  const skyCol = { compressor: '#c0c6e0', noisegate: '#ffe08a', reverb: '#c9b3ff', djglitch: '#9ff0d8', playback: '#c9a0e8', lowpass: '#9ad8e8', silence: '#d6d4ea' }[key];
  return {
    bg: (P) => { wash(P, 0, 0, 540, 960, skyCol, 0.96, 12, -0.4); for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; P.ln([270, 380, 270 + Math.cos(a) * 560, 380 + Math.sin(a) * 560], key === 'playback' ? (i % 2 ? '#ff5fb0' : '#9a6ad0') : 'rgba(255,255,255,0.7)', 5, false, 1); } floor(P, 740, key === 'playback' ? '#9a86b8' : '#8f8aa0', false); },
    mid: (P) => bossArt(P, key),
    fg: (P) => { banner(P, 40, 22, 460, 74, B.name.toUpperCase(), key === 'playback' ? '#ffd1ea' : '#fff7c9'); },
    live(ctx, t, p) { duo(ctx, t, { a: [150, 920, 200], b: [392, 920, 196], pa: 'shock', pb: 'shock', bob: 0 }); },
  };
}
function bossArt(P, key) {
  const x = 270, y = 400;
  if (key === 'playback') { tvRobot(P, x, y, 1.45); return; }
  if (key === 'lowpass' || key === 'silence') {   // the real boss doodles, drawn big
    const r = key === 'lowpass' ? 84 : 74;   // painted at half size and drawn at double size: fat crayon strokes
    P.ctx.save(); P.ctx.translate(x, key === 'lowpass' ? y + 20 : y + 80); P.ctx.scale(2, 2); const eyes = paintBoss(P, key, r, { phase: 1 });
    for (const e of eyes) P.dot(e.x + e.r * 0.2, e.y + e.r * 0.15, e.r * 0.5, key === 'silence' ? '#fff' : INK);
    P.ctx.restore(); P.ctx.save();
    if (key === 'silence') for (const [nx, ny] of [[70, 250], [470, 230], [90, 560], [450, 600], [270, 120]]) { note(P, nx, ny, 1.3, '#a9a5c0'); P.ln([nx - 20, ny + 8, nx + 26, ny - 40], C.red, 4); P.ln([nx + 26, ny + 8, nx - 20, ny - 40], C.red, 4); }
    P.ctx.restore(); return;
  }
  if (key === 'compressor') {
    poly(P, rect(x - 150, y - 200, 300, 70, 14), '#8f9ab8', 5.5, { gap: 9 }); P.ln([x - 100, y - 130, x - 100, y - 20], INK, 6); P.ln([x + 100, y - 130, x + 100, y - 20], INK, 6);
    poly(P, rect(x - 170, y + 20, 340, 80, 14), '#8f9ab8', 5.5, { gap: 9 }); for (let i = -2; i <= 2; i++) P.dot(x + i * 60, y + 62, 8, INK);
    poly(P, P.blob(x, y - 50, 110, 60, 16, 0.05), '#b3b9d2', 5.5, { gap: 8 }); P.eye(x - 40, y - 62, 24, 0.8); P.eye(x + 40, y - 62, 24, 0.8); P.ln([x - 70, y - 100, x - 20, y - 82], INK, 7); P.ln([x + 70, y - 100, x + 20, y - 82], INK, 7); P.ln(arc(x, y - 30, 44, 20, 20, 160, 10), INK, 6);
    P.ln([x - 126, y - 130, x - 126, y - 230, x - 98, y - 230], INK, 4); P.txt('SQUASH', x, y - 236, 28, C.red, { align: 'c', w: 4 });
  } else if (key === 'noisegate') {
    poly(P, rect(x - 150, y - 230, 300, 340, 24), '#ffd24a', 5.5, { gap: 9 }); for (let i = -3; i <= 3; i++) P.ln([x + i * 40, y - 230, x + i * 40, y + 110], INK, 6);
    poly(P, rect(x - 56, y - 40, 112, 96, 14), C.gold, 5.5, { gap: 7 }); P.ln(arc(x, y - 40, 32, 40, 180, 360, 10), INK, 9); P.dot(x, y + 8, 12, INK); P.ln([x, y + 10, x, y + 36], INK, 5);
    P.eye(x - 60, y - 140, 28, 0.9); P.eye(x + 60, y - 140, 28, 0.9); P.ln([x - 100, y - 190, x - 30, y - 160], INK, 8); P.ln([x + 100, y - 190, x + 30, y - 160], INK, 8);
    for (let i = 0; i < 3; i++) P.txt('SHH', x - 160 + i * 20, y - 250 + i * 6, 22, C.red, { rot: -0.2, w: 3.2 });
  } else if (key === 'reverb') {
    for (let i = 3; i >= 0; i--) P.ln(P.blob(x + i * 8, y + i * 6, 140 + i * 30, 130 + i * 30, 18, 0.04), ['#5a2aa0', '#7b4fd0', '#a58cf0', '#d9ccf5'][3 - i], 6 - i, true, 1.5);
    poly(P, P.blob(x, y, 150, 140, 18, 0.05), '#9f7bff', 5.5, { gap: 8 }); P.eye(x - 50, y - 40, 32, 0.8); P.eye(x + 50, y - 40, 36, 0.9); P.ln([x - 90, y - 90, x - 20, y - 70], INK, 8); P.ln([x + 90, y - 90, x + 20, y - 70], INK, 8);
    poly(P, P.blob(x, y + 60, 46, 36, 12), '#2a1633', 5, { gap: 6 }); for (let i = 1; i <= 3; i++) P.ln(arc(x, y + 60, 46 + i * 24, 36 + i * 18, 20, 160, 8), INK, 4, false, 1.5);
  } else {
    P.ln([x - 150, y - 150, x + 160, y - 160], C.cyan, 6, false, 2); P.ln([x - 150, y - 142, x + 160, y - 152], C.mag, 6, false, 2);
    poly(P, P.blob(x, y - 60, 90, 100, 14, 0.04), '#35f0c8', 5.5, { gap: 8 }); P.ln(arc(x, y - 90, 100, 90, 190, 350, 12), INK, 12); poly(P, rect(x - 118, y - 100, 36, 60, 12), C.pink, 5, { gap: 6 }); poly(P, rect(x + 82, y - 100, 36, 60, 12), C.pink, 5, { gap: 6 });
    P.shp(rect(x - 66, y - 88, 52, 24, 6), '#2a1633', INK, 4, { gap: 5 }); P.shp(rect(x + 14, y - 88, 52, 24, 6), '#2a1633', INK, 4, { gap: 5 }); P.ln(arc(x, y - 20, 36, 22, 20, 160, 10), INK, 6);
    poly(P, rect(x - 200, y + 60, 180, 70, 10), '#3b2a4a', 5, { gap: 8 }); poly(P, rect(x + 20, y + 60, 180, 70, 10), '#3b2a4a', 5, { gap: 8 }); P.dot(x - 110, y + 95, 26, C.cyan); P.dot(x + 110, y + 95, 26, C.mag); P.ln([x + 150, y - 230, x + 120, y - 190, x + 150, y - 190, x + 120, y - 150], C.yellow, 7, false, 1);
  }
}

// ===================================================================================================== live animated bits
function notes(ctx, t, cols) { for (let i = 0; i < 6; i++) { const k = (t * 0.18 + i / 6) % 1, x = 120 + i * 60 + Math.sin(t * 1.7 + i) * 20, y = 560 - k * 480; ctx.save(); ctx.globalAlpha = Math.min(1, k * 5, (1 - k) * 2); blit(ctx, noteSprite(cols[i % cols.length]), x, y, t, { scale: 1.2 }); ctx.restore(); } }
function sparks(ctx, t, x, y) { for (let i = 0; i < 5; i++) { const k = (t * 1.3 + i * 0.2) % 1; ctx.save(); ctx.globalAlpha = 1 - k; blit(ctx, starSprite(C.yellow, 9), x + Math.cos(i * 1.9 + t) * 36 * k, y - k * 50 + Math.sin(i * 2.7) * 10, t, { scale: 0.6 + k * 0.5 }); ctx.restore(); } }
function creepers(ctx, t, p, n = 7) {   // the Static oozing in from the edges, more and closer as the panel goes on
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, reach = clamp(p * 1.6 - i * 0.07, 0, 1) * (1 + 0.04 * Math.sin(t * 2 + i));
    if (reach <= 0.01) continue;
    const x = side < 0 ? -40 + reach * (110 + (i % 3) * 36) : 580 - reach * (110 + (i % 3) * 36), y = 360 + (i * 71) % 460 + Math.sin(t * 1.5 + i) * 6;
    blit(ctx, fuzzSprite(i % 3 ? 22 : 30, i % 4 === 0), x, y, t, { scale: 1, phase: i * 0.13 });
  }
}
function confetti(ctx, t) { const cols = [C.pink, C.lime, C.sky, C.yellow, C.orange, C.purple]; for (let i = 0; i < 26; i++) { const k = (t * 0.28 + hn(i) ) % 1, x = hn(i + 3) * 540 + Math.sin(t * 2 + i) * 12, y = k * 780 - 20; ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3 + i); ctx.fillStyle = cols[i % cols.length]; ctx.globalAlpha = 0.9; ctx.fillRect(-5, -2.5, 10, 5); ctx.restore(); } }
function rain(ctx, t) { ctx.save(); ctx.strokeStyle = 'rgba(70,90,150,0.6)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath(); for (let i = 0; i < 48; i++) { const k = (t * 0.9 + hn(i) * 3) % 1, x = hn(i + 7) * 580 - 20 - k * 40, y = k * 980 - 20; ctx.moveTo(x, y); ctx.lineTo(x - 7, y + 24); } ctx.stroke(); ctx.restore(); }
function halo(ctx, t) { const pulse = 0.6 + 0.4 * Math.sin(t * 2); ctx.save(); const e = sp('halo', 200, 200, (P) => { P.hatch(P.blob(0, 0, 80, 80, 16, 0.04), '#ffe27a', 7, 0.5, 0.75); P.ln(P.blob(0, 0, 82, 82, 16, 0.05), '#e8b923', 4, true, 2); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; P.ln([Math.cos(a) * 92, Math.sin(a) * 92, Math.cos(a) * 118, Math.sin(a) * 118], '#e8b923', 4, false, 1); } }, 12); ctx.globalAlpha = 0.55 + 0.35 * pulse; blit(ctx, e, 270, 790, t, { scale: 1.0 + 0.04 * pulse }); ctx.restore(); }
function road(ctx, t) { ctx.save(); ctx.strokeStyle = '#fffbe6'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.setLineDash([46, 40]); ctx.lineDashOffset = (t * 160) % 86; ctx.beginPath(); ctx.moveTo(-20, 860); ctx.lineTo(560, 856); ctx.stroke(); ctx.restore(); }
function birds(ctx, t) { ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 3.6; ctx.lineCap = 'round'; for (let i = 0; i < 4; i++) { const x = 90 + i * 110 + Math.sin(t * 0.5 + i) * 20, y = 250 + (i % 2) * 40 + Math.sin(t * 1.2 + i) * 6, f = Math.sin(t * 6 + i) * 6; ctx.beginPath(); ctx.moveTo(x - 14, y - f); ctx.quadraticCurveTo(x - 6, y - 8, x, y); ctx.quadraticCurveTo(x + 6, y - 8, x + 14, y - f); ctx.stroke(); } ctx.restore(); }
function van(ctx, x, y, s, t, happy) {
  const e = sp('van', 260, 150, (P) => {
    P.shp(P.blob(0, 66, 120, 10, 10), '#8d8aa0', null, 0, { gap: 6, alpha: 0.5 });
    poly(P, [-112, 40, -112, -30, -70, -62, 70, -62, 98, -24, 118, -16, 118, 40], C.yellow, 5, { gap: 8 }); P.hatch(rect(-112, 14, 230, 18), C.pink, 6, 0.3, 0.9); P.ln([-112, 14, 118, 14], INK, 3.4, false, 1); P.ln([-112, 32, 118, 32], INK, 3.4, false, 1);
    poly(P, [-64, -48, -64, -6, -8, -6, -8, -48], C.sky, 4, { gap: 6 }); poly(P, [6, -48, 6, -6, 62, -6, 90, -20, 66, -48], C.sky, 4, { gap: 6 });
    for (const wx of [-62, 64]) { P.shp(P.blob(wx, 44, 24, 24, 12), INK, INK, 4, { gap: 5 }); P.dot(wx, 44, 9, C.grey); }
    poly(P, rect(-30, -78, 70, 14, 4), C.brown, 4, { gap: 6 }); P.ln([-24, -78, -24, -92, 30, -92, 30, -78], INK, 3);
  }, 33);
  ctx.save(); ctx.translate(x, y + Math.sin(t * 9) * 2.2); ctx.scale(s, s); blit(ctx, e, 0, 0, t);
  ctx.save(); ctx.scale(1, 1);
  drawBust(ctx, 'roxor', -36, -28, 46, { t, pose: happy ? 'cheer' : 'idle' }); drawBust(ctx, 'jasmin', 34, -26, 44, { t: t + 0.3, pose: happy ? 'cheer' : 'idle' });
  ctx.restore(); ctx.restore();
  if (!happy) { ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = '#ffe98f'; ctx.beginPath(); ctx.moveTo(x + 118 * s, y - 10 * s); ctx.lineTo(x + 330 * s, y - 60 * s); ctx.lineTo(x + 330 * s, y + 50 * s); ctx.closePath(); ctx.fill(); ctx.restore(); }
}

// ===================================================================================================== compose a scene
const LAYER_AT = { bg: 0, mid: 0.07, live: 0.14, fg: 0.2 };
export function drawScene(ctx, id, w, h, t, o) {
  o = o || {}; t = t || 0;
  const def = SCENES[id] || SCENES.garage_day;
  const p = clamp(o.progress == null ? 0.5 : o.progress, 0, 1);
  touch(id);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  paper(ctx, 0, 0, w, h, { holes: false });
  const s = Math.min(w / 540, h / 960);
  // a slow push in on the middle of the page, plus a drift between the washes and the foreground
  const z = 1 + 0.045 * ease(p);
  ctx.translate(w / 2, h / 2); ctx.scale(s * z, s * z); ctx.translate(-270 + (0.5 - p) * 6, -480);
  const reveal = (at) => ease(clamp((p - at) / 0.1, 0, 1)), settle = (at) => (1 - reveal(at)) * 14;
  if (def.bg) putLayer(ctx, layer(id, 'bg', def.bg), t, reveal(LAYER_AT.bg), 0, settle(LAYER_AT.bg));
  if (def.mid) putLayer(ctx, layer(id, 'mid', def.mid), t, reveal(LAYER_AT.mid), 0, settle(LAYER_AT.mid));
  if (def.live) { ctx.save(); ctx.globalAlpha *= reveal(LAYER_AT.live); ctx.translate(0, settle(LAYER_AT.live)); def.live(ctx, t, p); ctx.restore(); }
  if (def.fg) putLayer(ctx, layer(id, 'fg', def.fg), t, reveal(LAYER_AT.fg), (0.5 - p) * -8, 0);
  ctx.restore();
}

// ===================================================================================================== title screen: a rooftop concert doodled on notebook paper
const TITLE_BG = (P) => {
  wash(P, 0, 0, 540, 700, '#8d94ee', 0.8, 12); stars(P, 30, 20, 380, 6); moon(P, 440, 120, 50);
  for (const [x, y, w, h, c] of [[-10, 520, 90, 220, '#7a68d0'], [70, 470, 110, 270, '#d96aa8'], [170, 540, 100, 200, '#4f9fd8'], [260, 500, 120, 240, '#8a76dc'], [370, 460, 90, 280, '#e8905a'], [450, 520, 100, 220, '#5bb86a']]) { poly(P, rect(x, y, w, h), c, 4.5, { gap: 9, alpha: 0.95 }); for (let r = 0; r < 6; r++) for (let q = 0; q < 3; q++) if ((r * 3 + q + x) % 3) P.shp(rect(x + 12 + q * (w - 24) / 3, y + 16 + r * 34, 14, 18), C.yellow, null, 0, { gap: 4, alpha: 0.9 }); }
  wash(P, 0, 735, 540, 225, '#8f88b8', 0.7, 12, 0.3); P.ln([0, 740, 540, 743], INK, 5, false, 2); poly(P, rect(60, 740, 420, 36), '#c58ad8', 5, { gap: 8 });
  speaker(P, 6, 590, 96, 150, C.purple); speaker(P, 438, 590, 96, 150, C.purple);
};
const spotLeft = () => layer('title', 'spotL', (P) => lightCone(P, 90, 20, 120, 740, C.yellow, 0.4));
const spotRight = () => layer('title', 'spotR', (P) => lightCone(P, 450, 20, 120, 740, C.pink, 0.4));
export function drawTitle(ctx, w, h, t, o) {
  o = o || {}; t = t || 0;
  const beat = clamp(o.beat == null ? Math.pow(Math.max(0, 1 - ((t * 2) % 1) * 2.4), 2) : o.beat, 0, 1);
  touch('title');
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  paper(ctx, 0, 0, w, h, { holes: true });
  const s = Math.min(w / 540, h / 960), z = 1 + 0.012 * Math.sin(t * 0.4) + beat * 0.006;
  ctx.translate(w / 2, h / 2); ctx.scale(s * z, s * z); ctx.translate(-270, -480);
  putLayer(ctx, layer('title', 'bg', TITLE_BG), t, 1, 0, 0);
  putLayer(ctx, spotLeft(), t, 0.5 + beat * 0.3 + 0.08 * Math.sin(t * 1.3), 0, 0); putLayer(ctx, spotRight(), t, 0.5 + beat * 0.3 + 0.08 * Math.sin(t * 1.1 + 1), 0, 0);
  // equalizer along the roof edge, bouncing on the beat
  const bar = sp('eqbar', 22, 90, (P) => P.shp(rect(-8, -40, 16, 80, 4), C.lime, INK, 3, { gap: 4 }), 8);
  for (let i = 0; i < 12; i++) { const hgt = 0.25 + 0.75 * Math.abs(Math.sin(t * (2 + hn(i) * 3) + i)) * (0.5 + beat * 0.5); ctx.save(); ctx.translate(100 + i * 31, 736); ctx.scale(1, hgt); ctx.globalAlpha = 0.95; blit(ctx, bar, 0, -40, t, { phase: i * 0.1 }); ctx.restore(); }
  // twinkling stars
  for (let i = 0; i < 8; i++) { const k = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7); blit(ctx, starSprite(C.yellow, 8), 30 + hn(i) * 480, 30 + hn(i + 4) * 330, t, { scale: 0.5 + k * 0.7, alpha: 0.4 + k * 0.6 }); }
  // the Static peeking in from the sides
  blit(ctx, fuzzSprite(30, true), -4 + Math.sin(t * 1.4) * 5, 600, t); blit(ctx, fuzzSprite(26, false), 548 + Math.sin(t * 1.2 + 1) * 5, 560, t);
  duo(ctx, t, { a: [190, 800, 265 + beat * 6], b: [352, 800, 258 + beat * 6], pa: 'sing', pb: 'beat', bob: 2 + beat * 3 });
  drawLoopy(ctx, 270, 770, 62, { t, mood: 'happy' });
  // the crowd along the bottom bobbing on the beat
  for (let i = 0; i < 7; i++) { const x = 40 + i * 76 + (i % 2) * 14, y = 930 + (i % 2) * 12 - Math.abs(Math.sin(t * 3.2 + i * 1.3)) * (4 + beat * 8); blit(ctx, crowd(i), x, y, t, { phase: i * 0.11 }); }
  ctx.restore();
}
const CROWD_COLS = [C.skin, C.tan, '#ffd7b0', C.lime, C.sky, C.pink, C.orange];
const crowd = (i) => sp('crowd' + i, 60, 100, (P) => crowdHead(P, 0, -8, CROWD_COLS[i % 7]), 40 + i);

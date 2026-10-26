// Stacking Cats: the anime style intro cutscene. Six short scenes drawn live on one canvas (960x540) from the game's own sprites:
// speed lines, impact frames, camera pushes, name slams and a typed caption. drawIntro is a pure function of time so tests can run it;
// playIntro wraps it with the canvas, the skip controls and the sound cues.
import { INTRO, INTRO_LEN, introAt, typed, wrapCaption, EPILOGUE, EPILOGUE_LEN, epilogueAt } from './story.js';
import { TAU, mulberry } from './art_util.js';
import { makeBackdrop, drawBackdrop, drawFront, freeBackdrop, enemySprite, nestSprite } from './art_world.js';
import { THEMES, CAT_BY_ID } from './cats.js';

const W = 960, H = 540, GROUND = 440;
const FONT = '"Lilita One", "Baloo 2", system-ui, sans-serif';
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
const outBack = (u) => { u = clamp(u); const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
const seg = (p, a, b) => clamp((p - a) / (b - a));

// the three heroes of the story, in the order they are revealed
export const HEROES = [
  { id: 'tabby', color: '#ffb347' },
  { id: 'ember', color: '#ff6a3a' },
  { id: 'buckshot', color: '#e0c070' },
];
const GUARD = ['tabby', 'mochi', 'yuki', 'pudding'];

// ---------------------------------------------------------------- small drawing helpers
function cat(ctx, R, id, x, y, s = 1, o = {}) {
  const c = R.cat(id);
  if (!c) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0); ctx.scale(o.flip ? -s : s, s * (o.sy || 1));
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  ctx.drawImage(c, -60, -107, 120, 120);
  ctx.restore();
}
function mouse(ctx, type, x, y, s = 1, o = {}) {
  const sp = enemySprite(type, !!o.elite);
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0); ctx.scale(o.flip ? -s : s, s);
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  ctx.drawImage(sp.c, -sp.ax, -sp.ay, sp.w, sp.h);
  ctx.restore();
}
function nest(ctx, kind, x, y, s = 1) {
  const sp = nestSprite(kind);
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.drawImage(sp.c, -sp.ax, -sp.ay, sp.w, sp.h); ctx.restore();
}
function tint(ctx, color, a) { if (a <= 0) return; ctx.save(); ctx.globalAlpha = clamp(a); ctx.fillStyle = color; ctx.fillRect(-40, -40, W + 80, H + 80); ctx.restore(); }
function vignette(ctx, a = 0.55) {
  const g = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 620);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(8,2,20,${a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
// thin wedges fanning out from a point: the classic anime "focus" lines
function speedLines(ctx, cx, cy, T, o = {}) {
  const n = o.n || 52, inner = o.inner || 170, a = o.alpha == null ? 0.55 : o.alpha, rnd = mulberry(Math.floor(T * (o.rate || 16)) * 977 + 11);
  ctx.save(); ctx.fillStyle = o.color || '#ffffff'; ctx.globalAlpha = a;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU + rnd() * 0.08, r0 = inner + rnd() * 120, r1 = 900, w = 0.012 + rnd() * 0.03;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    ctx.lineTo(cx + Math.cos(ang - w) * r1, cy + Math.sin(ang - w) * r1); ctx.lineTo(cx + Math.cos(ang + w) * r1, cy + Math.sin(ang + w) * r1); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
// long horizontal streaks that sell speed
function streaks(ctx, T, dir = -1, a = 0.35, n = 26) {
  const rnd = mulberry(Math.floor(T * 22) * 131 + 3);
  ctx.save(); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = a;
  for (let i = 0; i < n; i++) { const y = rnd() * H, len = 120 + rnd() * 300, x = rnd() * (W + len) - len * 0.4; ctx.fillRect(dir < 0 ? x : x - len, y, len, 1.5 + rnd() * 2.5); }
  ctx.restore();
}
function burst(ctx, x, y, r, fill = '#fff6c0', rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = fill; ctx.strokeStyle = '#2a1840'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, rr = i % 2 ? r * 0.55 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}
function label(ctx, text, x, y, size, fill, o = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0); ctx.transform(1, 0, o.skew == null ? -0.18 : o.skew, 1, 0, 0);
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = o.lw || size * 0.2; ctx.strokeStyle = o.stroke || '#2a1840'; ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill; ctx.fillText(text, 0, 0); ctx.restore();
}
// "POW!" style comic hit text with a spiky burst behind it
function pow(ctx, word, x, y, a, rot = -0.12) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = clamp(a * 2); const s = 0.6 + 0.6 * ease(1 - a);
  ctx.translate(x, y); ctx.scale(s, s); burst(ctx, 0, 0, 62, '#fff070', rot); label(ctx, word, 0, 2, 38, '#ff4a3a', { rot }); ctx.restore();
}
function bars(ctx, k) { const h = 46 * k; ctx.fillStyle = '#05010c'; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h); }
function caption(ctx, text, p) {
  const full = text, shown = typed(full, clamp(p / 0.62));
  if (!shown) return;
  ctx.save(); ctx.font = `26px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = wrapCaption(full, (s) => ctx.measureText(s).width, 800);
  let shownLeft = shown.length;
  const y0 = H - 54 - lines.length * 17;
  ctx.fillStyle = 'rgba(8,2,20,.62)'; const bw = Math.min(900, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 56), bh = lines.length * 34 + 14;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(W / 2 - bw / 2, y0 - 22, bw, bh, 12) : ctx.rect(W / 2 - bw / 2, y0 - 22, bw, bh); ctx.fill();
  lines.forEach((ln, i) => {
    const part = ln.slice(0, Math.max(0, shownLeft)); shownLeft -= ln.length + 1;
    if (!part) return;
    ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = '#2a1840'; ctx.textAlign = 'left';
    const x = W / 2 - ctx.measureText(ln).width / 2, y = y0 + i * 34;
    ctx.strokeText(part, x, y); ctx.fillStyle = '#fff6dc'; ctx.fillText(part, x, y);
  });
  ctx.restore();
}
function shock(R, k = 7) { return R.motion ? (Math.random() - 0.5) * k : 0; }

// ---------------------------------------------------------------- the six scenes. Each gets p (0..1 through the scene) and T (seconds in the scene)
function peace(ctx, R, p, T) {
  ctx.save();
  const z = 1 + 0.07 * ease(p); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
  drawBackdrop(ctx, R.bd, T * 6, T);
  tint(ctx, '#ff9a4a', 0.22);
  moon(ctx, 790, 118, 1, T, 0);
  GUARD.forEach((id, i) => {
    const x = 250 + i * 120, y = GROUND + 18 + (i % 2) * 8, hop = Math.sin(T * 1.4 + i) * 0.015;
    cat(ctx, R, id, x, y, 1.05, { rot: hop });
    const h = (T * 0.5 + i * 0.27) % 1; // little hearts drift up
    ctx.save(); ctx.globalAlpha = Math.sin(h * Math.PI) * 0.9; ctx.fillStyle = '#ff7aa8'; ctx.font = `20px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('♥', x + Math.sin(h * 6) * 8, y - 100 - h * 46); ctx.restore();
  });
  drawFront(ctx, R.bd, T * 6);
  ctx.restore();
  vignette(ctx, 0.4);
}
// the Cheese Moon, optionally nibbled: bite 0..1 eats chunks out of it
function moon(ctx, x, y, a, T, bite) {
  ctx.save(); ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(x, y, 20, x, y, 130); g.addColorStop(0, 'rgba(255,236,140,.55)'); g.addColorStop(1, 'rgba(255,236,140,0)');
  ctx.fillStyle = g; ctx.fillRect(x - 140, y - 140, 280, 280);
  ctx.beginPath(); ctx.arc(x, y, 56, 0, TAU); ctx.fillStyle = '#ffe780'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#c99a2a'; ctx.stroke();
  ctx.save(); ctx.clip();
  ctx.fillStyle = '#e6bd4a';
  for (const [dx, dy, r] of [[-20, -16, 11], [18, -26, 8], [24, 10, 13], [-26, 20, 9], [2, 30, 7], [-4, 0, 6]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#241a46';
  const bites = [[54, -8, 36, 0.15], [46, 44, 30, 0.4], [-20, -54, 34, 0.62], [-52, 30, 26, 0.8]];
  for (const [dx, dy, r, at] of bites) { const k = clamp((bite - at) / 0.2); if (k > 0) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r * k, 0, TAU); ctx.fill(); } }
  ctx.restore(); ctx.restore();
}
function moonScene(ctx, R, p, T) {
  ctx.save();
  drawBackdrop(ctx, R.bd, 20, T);
  tint(ctx, '#1c1040', 0.18 + 0.62 * ease(seg(p, 0, 0.7)));
  moon(ctx, 790, 118, 1 - 0.3 * p, T, p);
  // red glow creeping up from the far edge
  const g = ctx.createLinearGradient(0, H, 0, H - 260); g.addColorStop(0, `rgba(255,40,70,${0.45 * ease(seg(p, 0.3, 1))})`); g.addColorStop(1, 'rgba(255,40,70,0)'); ctx.fillStyle = g; ctx.fillRect(0, H - 260, W, 260);
  // eyes in the dark
  const rnd = mulberry(77);
  for (let i = 0; i < 14; i++) {
    const ex = 560 + rnd() * 380, ey = GROUND + 6 + rnd() * 70, at = 0.18 + i * 0.045, k = seg(p, at, at + 0.06);
    if (k <= 0 || Math.sin(T * 3 + i * 2) < -0.85) continue;
    ctx.save(); ctx.globalAlpha = k; ctx.fillStyle = '#ff3a4a'; ctx.shadowColor = '#ff2040'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.ellipse(ex, ey, 4, 2.6, 0, 0, TAU); ctx.ellipse(ex + 14, ey, 4, 2.6, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  const alarm = seg(p, 0.45, 0.6);
  GUARD.forEach((id, i) => {
    const x = 250 + i * 120 + (alarm > 0 ? Math.sin(T * 40 + i) * 2.4 * (R.motion ? 1 : 0.3) : 0), y = GROUND + 18 + (i % 2) * 8 - Math.sin(alarm * Math.PI) * 28;
    cat(ctx, R, id, x, y, 1.05);
    if (alarm > 0.1) label(ctx, '!', x, y - 118, 40, '#ff4a4a', { skew: 0 });
  });
  // the lightning strike
  const lf = seg(p, 0.5, 0.56);
  if (lf > 0 && lf < 1) {
    ctx.save(); ctx.strokeStyle = '#fffbe0'; ctx.lineWidth = 6; ctx.shadowColor = '#bfe0ff'; ctx.shadowBlur = 24; ctx.lineJoin = 'miter'; ctx.beginPath();
    [[700, -10], [668, 90], [696, 130], [640, 250], [668, 280], [616, 420]].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore();
  }
  if (R.motion) tint(ctx, '#ffffff', (1 - seg(p, 0.5, 0.6)) * (p > 0.5 ? 0.8 : 0));
  ctx.restore();
  vignette(ctx, 0.7);
}
function horde(ctx, R, p, T) {
  ctx.save();
  ctx.translate(shock(R, 3), shock(R, 3));
  drawBackdrop(ctx, R.bd, T * 70, T);
  tint(ctx, '#3a0620', 0.62);
  const types = ['mouse', 'scout', 'brute', 'armored', 'mouse', 'slinger'];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 8; i++) {
      const spd = 250 + row * 55 + (i % 3) * 20, x = 1150 - ((T * spd + i * 168 + row * 53) % 1500), bob = Math.abs(Math.sin(T * 13 + i + row)) * 9;
      const ty = types[(i + row) % types.length], big = ty === 'brute' ? 1.25 : 1;
      mouse(ctx, ty, x, GROUND + 16 + row * 30 - bob, (0.9 + row * 0.12) * big, { alpha: 1 });
    }
  }
  // nests burst out of the ground
  [['cheese', 640, 0.5], ['pipe', 780, 0.58], ['castle', 900, 0.66]].forEach(([kind, x, at]) => {
    const k = outBack(seg(p, at, at + 0.14)); if (k <= 0) return;
    nest(ctx, kind, x, GROUND + 70, 0.62 * k);
    if (seg(p, at, at + 0.2) < 1) { ctx.fillStyle = 'rgba(210,190,160,.5)'; for (let d = 0; d < 6; d++) { ctx.beginPath(); ctx.arc(x - 60 + d * 24, GROUND + 66 - ((T * 60 + d * 9) % 30), 7 + d % 3 * 3, 0, TAU); ctx.fill(); } }
  });
  // the king
  const kk = ease(seg(p, 0.66, 0.84));
  if (kk > 0) {
    ctx.save(); ctx.translate(730, GROUND + 80 + (1 - kk) * 120); ctx.scale(2.9, 2.9);
    ctx.fillStyle = '#7a0f2e'; ctx.beginPath(); ctx.moveTo(-26, -40); ctx.lineTo(30, -40); ctx.lineTo(42, 4); ctx.lineTo(-38, 4); ctx.closePath(); ctx.fill();
    ctx.shadowColor = '#ff2040'; ctx.shadowBlur = 14; ctx.drawImage(enemySprite('brute', true).c, -65, -110, 130, 130); ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#2a1840'; ctx.lineWidth = 1.5; ctx.beginPath(); [[-14, -86], [-14, -102], [-6, -94], [0, -106], [6, -94], [14, -102], [14, -86]].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    label(ctx, 'KING SQUEAKIMUS', W / 2 + 40, 118, 54 * (0.8 + 0.2 * outBack(seg(p, 0.7, 0.8))), '#ffd23f', { rot: -0.04 });
  }
  streaks(ctx, T, -1, 0.3);
  ctx.restore();
  vignette(ctx, 0.75);
  if (R.motion) tint(ctx, '#ffffff', Math.max(0, 0.7 - Math.abs(p - 0.66) * 14));
}
function nap(ctx, R, p, T) {
  ctx.save();
  drawBackdrop(ctx, R.bd, 60 + Math.min(p, 0.55) * 260, T);
  tint(ctx, '#2a0a40', 0.6);
  const calls = ['MEOW!', 'HELP!', 'NYAA!'];
  for (let i = 0; i < 3; i++) {
    const u = seg(p, 0.0 + i * 0.1, 0.55 + i * 0.08), x = -170 + u * 1180, y = GROUND + 20 + i * 24 - Math.abs(Math.sin(T * 14 + i)) * 7;
    if (u <= 0 || u >= 1) continue;
    mouse(ctx, i === 1 ? 'brute' : 'mouse', x - 90, y, i === 1 ? 0.9 : 1, { flip: true });
    // the netted cat, dangling behind
    ctx.save(); ctx.translate(x, y - 18); ctx.rotate(Math.sin(T * 9 + i) * 0.1);
    cat(ctx, R, GUARD[(i + 1) % GUARD.length], 0, 20, 0.8);
    ctx.strokeStyle = 'rgba(190,150,90,.9)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, -22, 46, 0, TAU); ctx.stroke();
    for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * 14, -22 - 40); ctx.lineTo(k * 14, -22 + 40); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-44, -22 + k * 12); ctx.lineTo(44, -22 + k * 12); ctx.stroke(); }
    ctx.restore();
    if (u > 0.08) label(ctx, calls[i], x + shock(R, 3), y - 128, 30, '#fff6dc', { rot: Math.sin(T * 20 + i) * 0.06 });
  }
  // the cages: one by one, each royal guard locked up
  const ids = ['tabby', 'mochi', 'yuki', 'pudding', 'ember', 'sparky'];
  for (let i = 0; i < 6; i++) {
    const at = 0.6 + i * 0.06, k = seg(p, at, at + 0.07), drop = k < 1 ? outBack(k) : 1; if (k <= 0) continue;
    const x = 160 + i * 128, y = GROUND + 56 - (1 - drop) * 220;
    cat(ctx, R, ids[i], x, y + 2, 0.6);
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(20,8,40,.55)'; ctx.fillRect(-46, -86, 92, 92);
    ctx.strokeStyle = '#9aa0b4'; ctx.lineWidth = 3.5;
    for (let b = -3; b <= 3; b++) { ctx.beginPath(); ctx.moveTo(b * 13, -86); ctx.lineTo(b * 13, 6); ctx.stroke(); }
    ctx.strokeStyle = '#c8ccdc'; ctx.lineWidth = 5; ctx.strokeRect(-47, -88, 94, 96);
    ctx.restore();
  }
  ctx.restore();
  vignette(ctx, 0.75);
}
function heroes(ctx, R, p, T) {
  ctx.save();
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#120a3a'); bg.addColorStop(1, '#4a1a6a'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const eyeP = seg(p, 0, 0.3);
  if (eyeP > 0 && eyeP < 1) {
    // close up: the brave one's eyes, in a letterboxed strip
    const c = R.cat('tabby');
    speedLines(ctx, W / 2, 270, T, { n: 40, inner: 90, alpha: 0.35, color: '#ffd0f0' });
    ctx.save(); ctx.beginPath(); ctx.rect(0, 170, W, 200); ctx.clip();
    const z = 4.6 + eyeP * 0.5; ctx.translate(W / 2, 270); ctx.scale(z, z);
    if (c) ctx.drawImage(c, -60, -52, 120, 120);
    ctx.restore();
    // the glint in each eye
    const gl = ease(seg(eyeP, 0.35, 0.8));
    if (gl > 0.2) { burst(ctx, W / 2 - 84, 260, 18 * gl, '#ffffff', T * 3); burst(ctx, W / 2 + 84, 260, 18 * gl, '#ffffff', -T * 3); }
    ctx.fillStyle = '#05010c'; ctx.fillRect(0, 0, W, 170); ctx.fillRect(0, 370, W, H - 370);
    ctx.restore(); return;
  }
  speedLines(ctx, W / 2, 290, T, { n: 60, inner: 120, alpha: 0.28, color: '#ffc0ff', rate: 12 });
  // pink streak clouds
  ctx.fillStyle = 'rgba(255,120,200,.16)'; for (let i = 0; i < 4; i++) ctx.fillRect(0, 70 + i * 90 + Math.sin(T + i) * 6, W, 22);
  const xs = [230, 480, 730], ats = [0.32, 0.52, 0.72];
  HEROES.forEach((h, i) => {
    const k = seg(p, ats[i], ats[i] + 0.1); if (k <= 0) return;
    const sc = 2.1 * (0.8 + 0.2 * outBack(k)), y = 462 + (1 - ease(k)) * 140, x = xs[i];
    ctx.save(); ctx.shadowColor = h.color; ctx.shadowBlur = 26 * (R.motion ? 1 : 0.5);
    cat(ctx, R, h.id, x, y, sc);
    ctx.restore();
    const nk = ease(seg(p, ats[i] + 0.06, ats[i] + 0.14));
    if (nk > 0) {
      const info = CAT_BY_ID[h.id];
      label(ctx, info.name.toUpperCase(), x, 120 - (1 - nk) * 30, 56 * (0.7 + 0.3 * nk), h.color, { rot: -0.05 });
      label(ctx, info.title, x, 164 - (1 - nk) * 30, 24, '#fff6dc', { rot: -0.05, lw: 5 });
    }
    // slam flash
    if (R.motion) tint(ctx, '#ffffff', Math.max(0, 0.55 - seg(p, ats[i], ats[i] + 0.05) * 0.55) * (k > 0 ? 1 : 0));
  });
  ctx.restore();
  vignette(ctx, 0.5);
}
function charge(ctx, R, p, T) {
  ctx.save();
  ctx.translate(shock(R, 3), shock(R, 3));
  drawBackdrop(ctx, R.bd, T * 520, T);
  tint(ctx, '#ffb060', 0.3);
  // mice get launched across the screen
  const N = 7;
  for (let i = 0; i < N; i++) {
    const u = (T * 0.85 + i / N) % 1, run = 0.5;
    if (u < run) { const k = u / run; mouse(ctx, i % 3 === 2 ? 'armored' : 'mouse', 1120 - k * 540, GROUND + 14 + (i % 3) * 26 - Math.abs(Math.sin(T * 14 + i)) * 6, 1); }
    else {
      const k = (u - run) / (1 - run), x = 580 + k * 640, y = GROUND + 10 - Math.sin(Math.min(1, k * 1.15) * Math.PI) * 210;
      mouse(ctx, i % 3 === 2 ? 'armored' : 'mouse', x, y, 1, { rot: k * 14, flip: false });
      pow(ctx, ['POW!', 'BAM!', 'WHAM!', 'ZAP!'][i % 4], 580, y - 30, 1 - k * 5);
    }
  }
  // the three heroes sprint with after-images
  HEROES.forEach((h, i) => {
    const x = 220 + i * 128 + Math.sin(T * 3 + i) * 6, bob = Math.abs(Math.sin(T * 17 + i * 1.3)) * 16, y = GROUND + 28 - bob + (i === 1 ? -10 : 0);
    for (let g = 3; g >= 1; g--) cat(ctx, R, h.id, x - g * 26, y, 1.2, { rot: 0.1, alpha: 0.18 / g * 1.6 });
    ctx.save(); ctx.shadowColor = h.color; ctx.shadowBlur = 16; cat(ctx, R, h.id, x, y, 1.2, { rot: 0.1 }); ctx.restore();
  });
  streaks(ctx, T, -1, 0.5, 34);
  ctx.restore();
  // the finale: impact frame, then the title
  const imp = seg(p, 0.6, 0.66);
  if (imp > 0 && imp < 1) {
    ctx.fillStyle = imp < 0.5 ? '#ffffff' : '#000000'; ctx.fillRect(0, 0, W, H);
    speedLines(ctx, W / 2, H / 2, T, { n: 70, inner: 60, alpha: 0.9, color: imp < 0.5 ? '#000000' : '#ffffff', rate: 30 });
  }
  const tk = seg(p, 0.64, 0.8);
  if (tk > 0) {
    tint(ctx, '#140830', 0.55 * ease(tk));
    speedLines(ctx, W / 2, 250, T, { n: 50, inner: 190, alpha: 0.18 * tk, color: '#ffe080', rate: 10 });
    const ring = seg(p, 0.64, 0.78); if (ring < 1) { ctx.save(); ctx.strokeStyle = `rgba(255,240,180,${1 - ring})`; ctx.lineWidth = 14 * (1 - ring) + 2; ctx.beginPath(); ctx.arc(W / 2, 250, 60 + ring * 560, 0, TAU); ctx.stroke(); ctx.restore(); }
    const a = outBack(seg(p, 0.64, 0.74)), b = outBack(seg(p, 0.68, 0.78));
    label(ctx, 'STACKING', W / 2 - (1 - a) * 700, 210, 120, '#ffd23f', { rot: -0.03 });
    label(ctx, 'CATS', W / 2 + (1 - b) * 700, 318, 150, '#ff8ac0', { rot: -0.03 });
  }
  ctx.restore();
  vignette(ctx, 0.45);
}

const SCENES = [peace, moonScene, horde, nap, heroes, charge];

// draw the whole intro at time t (seconds); R = { cat(id) -> 240px sprite canvas, bd, motion }
export function drawIntro(ctx, t, R) {
  const s = introAt(t);
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // lift and enlarge the picture a little so the caption plate never covers the cats' feet
  ctx.save(); ctx.translate(W / 2, H / 2 - 26); ctx.scale(1.07, 1.07); ctx.translate(-W / 2, -H / 2);
  SCENES[s.i](ctx, R, s.p, s.t);
  ctx.restore();
  const open = ease(seg(t, 0, 0.9)); // letterbox slides in at the start
  bars(ctx, 0.35 + 0.65 * open);
  if (s.i !== 5 || s.p < 0.6) caption(ctx, INTRO[s.i].text, s.p);
  else if (s.p > 0.74) caption(ctx, INTRO[s.i].text, clamp((s.p - 0.74) / 0.12) * 0.62);
  // fade in from and out to black
  const f = Math.max(1 - seg(t, 0, 0.7), seg(t, INTRO_LEN - 0.6, INTRO_LEN));
  if (f > 0) { ctx.globalAlpha = f; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  // a flash between scenes
  ctx.restore();
  return s;
}

// sound cues: [scene, progress, action]; each fires once when the intro passes it
export const CUES = [
  [0, 0.0, 'music calm'], [0, 0.32, 'meow tabby happy'], [0, 0.6, 'meow mochi happy'],
  [1, 0.5, 'play thunder'], [1, 0.56, 'meow tabby worried'], [1, 0.6, 'meow yuki worried'],
  [2, 0.0, 'music boss'], [2, 0.02, 'play roar'], [2, 0.5, 'play boom'], [2, 0.58, 'play boom'], [2, 0.66, 'play boss'],
  [3, 0.1, 'meow mochi worried'], [3, 0.22, 'meow yuki worried'], [3, 0.6, 'play shield'], [3, 0.66, 'play shield'], [3, 0.72, 'play shield'], [3, 0.78, 'play shield'], [3, 0.84, 'play shield'], [3, 0.9, 'play shield'],
  [4, 0.0, 'music fight'], [4, 0.3, 'play special'], [4, 0.52, 'play special'], [4, 0.72, 'play special'], [4, 0.8, 'meow tabby cheer'], [4, 0.85, 'meow ember cheer'], [4, 0.9, 'meow buckshot cheer'],
  [5, 0.05, 'play zoom'], [5, 0.12, 'play hit'], [5, 0.22, 'play bang'], [5, 0.32, 'play hit'], [5, 0.42, 'play bang'], [5, 0.52, 'play hit'], [5, 0.6, 'play boom'], [5, 0.7, 'play win'], [5, 0.74, 'meow tabby cheer'],
];
export function cuesBetween(t0, t1) {
  const out = [];
  for (const [si, p, act] of CUES) {
    let at = 0; for (let i = 0; i < si; i++) at += INTRO[i].dur;
    const when = at + p * INTRO[si].dur;
    if (when >= t0 && when < t1) out.push(act);
  }
  return out;
}

// ---------------------------------------------------------------- the epilogue (shown from the finale card)
const PARTY = ['tabby', 'ember', 'buckshot', 'mochi', 'yuki', 'pudding', 'sparky'];
function party(ctx, R, p, T) {
  ctx.save();
  drawBackdrop(ctx, R.bd, T * 4, T);
  tint(ctx, '#202a5c', 0.42 * (1 - ease(seg(p, 0.5, 1))));
  tint(ctx, '#ffb86a', 0.2 * ease(seg(p, 0.5, 1)));
  moon(ctx, 480, 104, 1, T, 0);
  // fireworks bursting over the party
  const rnd = mulberry(5);
  for (let i = 0; i < 6; i++) {
    const at = 0.1 + i * 0.13, k = seg(p, at, at + 0.16); if (k <= 0 || k >= 1) continue;
    const fx = 160 + rnd() * 640, fy = 120 + rnd() * 130, r = 20 + k * 60;
    ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = ['#ffd23f', '#ff8ac0', '#7af0ff'][i % 3]; ctx.lineWidth = 4;
    for (let a = 0; a < 12; a++) { const ang = (a / 12) * TAU; ctx.beginPath(); ctx.moveTo(fx + Math.cos(ang) * r * 0.55, fy + Math.sin(ang) * r * 0.55); ctx.lineTo(fx + Math.cos(ang) * r, fy + Math.sin(ang) * r); ctx.stroke(); }
    ctx.restore();
  }
  PARTY.forEach((id, i) => {
    const x = 150 + i * 110, hop = Math.abs(Math.sin(T * 5 + i * 0.9)) * 26;
    cat(ctx, R, id, x, GROUND + 20 + (i % 2) * 8 - hop, 1.05, { rot: Math.sin(T * 5 + i) * 0.06 });
    const h = (T * 0.6 + i * 0.19) % 1; ctx.save(); ctx.globalAlpha = Math.sin(h * Math.PI); ctx.fillStyle = '#ff7aa8'; ctx.font = `22px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('\u2665', x + Math.sin(h * 7 + i) * 10, GROUND - 90 - h * 80); ctx.restore();
  });
  // confetti
  const cr = mulberry(9);
  for (let i = 0; i < 46; i++) {
    const cx = cr() * W, speed = 50 + cr() * 90, cy = ((T * speed + cr() * H) % (H + 20)) - 10;
    ctx.fillStyle = ['#ffd23f', '#ff8ac0', '#7af0ff', '#9aff9a'][i % 4]; ctx.save(); ctx.translate(cx + Math.sin(T * 3 + i) * 10, cy); ctx.rotate(T * 4 + i); ctx.fillRect(-4, -2, 8, 4); ctx.restore();
  }
  ctx.restore();
  vignette(ctx, 0.35);
}
function dawn(ctx, R, p, T) {
  ctx.save();
  drawBackdrop(ctx, R.bd, T * 90, T);
  tint(ctx, '#ffb060', 0.3);
  // the sun rises
  const sy = 330 - 210 * ease(seg(p, 0, 0.6));
  const g = ctx.createRadialGradient(700, sy, 10, 700, sy, 200); g.addColorStop(0, 'rgba(255,240,170,.9)'); g.addColorStop(1, 'rgba(255,240,170,0)'); ctx.fillStyle = g; ctx.fillRect(480, sy - 210, 480, 420);
  HEROES.forEach((h, i) => {
    const x = 250 + i * 120 + ease(seg(p, 0, 1)) * 60, bob = Math.abs(Math.sin(T * 6 + i)) * 8;
    cat(ctx, R, h.id, x, GROUND + 24 - bob, 1.2, { rot: 0.05 });
  });
  // a pair of beady eyes in the grass: the mice are not done
  if (p > 0.55) { const k = ease(seg(p, 0.55, 0.7)); ctx.save(); ctx.globalAlpha = k; ctx.fillStyle = '#ff3a4a'; ctx.beginPath(); ctx.ellipse(840, GROUND + 40, 5, 3, 0, 0, TAU); ctx.ellipse(858, GROUND + 40, 5, 3, 0, 0, TAU); ctx.fill(); ctx.restore(); }
  if (p > 0.78) { const k = outBack(seg(p, 0.78, 0.9)); label(ctx, 'KEEP PLAYING!', W / 2, 150, 70 * k, '#ffd23f', { rot: -0.04 }); }
  ctx.restore();
  vignette(ctx, 0.35);
}
const EPI_SCENES = [party, dawn];
export function drawEpilogue(ctx, t, R) {
  const s = epilogueAt(t);
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.save(); ctx.translate(W / 2, H / 2 - 26); ctx.scale(1.07, 1.07); ctx.translate(-W / 2, -H / 2);
  EPI_SCENES[s.i](ctx, R, s.p, s.t);
  ctx.restore();
  bars(ctx, 1);
  caption(ctx, EPILOGUE[s.i].text, s.p);
  const f = Math.max(1 - seg(t, 0, 0.6), seg(t, EPILOGUE_LEN - 0.6, EPILOGUE_LEN));
  if (f > 0) { ctx.globalAlpha = f; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
  return s;
}
const EPI_CUES = [
  [0, 0.0, 'music calm'], [0, 0.1, 'play win'], [0, 0.23, 'play special'], [0, 0.36, 'meow tabby cheer'], [0, 0.5, 'play special'], [0, 0.62, 'meow ember cheer'], [0, 0.75, 'meow mochi happy'],
  [1, 0.0, 'play clear'], [1, 0.55, 'meow tabby worried'], [1, 0.78, 'play boss'], [1, 0.82, 'meow buckshot cheer'],
];
export function epilogueCuesBetween(t0, t1) {
  const out = [];
  for (const [si, p, act] of EPI_CUES) {
    let at = 0; for (let i = 0; i < si; i++) at += EPILOGUE[i].dur;
    const when = at + p * EPILOGUE[si].dur;
    if (when >= t0 && when < t1) out.push(act);
  }
  return out;
}

// run a cutscene full screen inside host (the scaled game box). o: { cat(id), sfx, motion, onDone }. Returns { skip }.
function runScenes(host, o, spec) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.className = 'introcv';
  cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:95;background:#000;touch-action:manipulation';
  const skip = document.createElement('button'); skip.className = 'introskip'; skip.textContent = 'Skip \u203A'; skip.setAttribute('aria-label', 'Skip the cutscene');
  skip.style.cssText = 'position:absolute;right:14px;bottom:12px;z-index:96;font:700 16px "Baloo 2",system-ui,sans-serif;color:#fff;background:rgba(8,2,20,.7);border:1.5px solid rgba(255,255,255,.4);border-radius:999px;padding:6px 16px;cursor:pointer';
  host.appendChild(cv); host.appendChild(skip);
  const ctx = cv.getContext('2d');
  const R = { cat: o.cat, motion: o.motion !== false, bd: makeBackdrop(THEMES[0], 0) };
  const t0 = performance.now(); let last = -0.01, raf = 0, ended = false;
  const finish = () => {
    if (ended) return; ended = true; cancelAnimationFrame(raf);
    removeEventListener('keydown', onKey, true); cv.remove(); skip.remove(); try { freeBackdrop(R.bd); } catch (e) { /* ignore */ }
    try { o.sfx && o.sfx.music('calm'); } catch (e) { /* ignore */ }
    o.onDone && o.onDone();
  };
  const onKey = (e) => { if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); finish(); } };
  addEventListener('keydown', onKey, true);
  skip.addEventListener('click', (e) => { e.stopPropagation(); finish(); });
  cv.addEventListener('pointerdown', () => { if (performance.now() - t0 > 500) finish(); });
  const act = (a) => {
    const [kind, x, y] = a.split(' ');
    try { if (kind === 'music') o.sfx.music(x); else if (kind === 'play') o.sfx.play(x); else if (kind === 'meow') o.sfx.meow(x, y); } catch (e) { /* sound is optional */ }
  };
  const frame = (now) => {
    if (ended) return;
    const t = (now - t0) / 1000;
    for (const a of spec.cues(last, t)) act(a);
    last = t;
    const s = spec.draw(ctx, Math.min(t, spec.len), R);
    if (t >= spec.len || s.done) { finish(); return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { skip: finish };
}
export const playIntro = (host, o) => runScenes(host, o, { len: INTRO_LEN, draw: drawIntro, cues: cuesBetween });
export const playEpilogue = (host, o) => runScenes(host, o, { len: EPILOGUE_LEN, draw: drawEpilogue, cues: epilogueCuesBetween });

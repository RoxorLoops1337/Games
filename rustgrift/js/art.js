'use strict';
// ===================== ART: hand-inked procedural drawing =====================
function jit(seed, i, amp) {
  const x = Math.sin(seed * 127.1 + i * 311.7 + G.boil * 74.7) * 43758.5453;
  return ((x - Math.floor(x)) - 0.5) * 2 * amp;
}
function shapePath(c, pts, seed, amp, sharp) {
  const n = pts.length;
  const p = pts.map((q, i) => [q[0] + jit(seed, i * 2, amp), q[1] + jit(seed, i * 2 + 1, amp)]);
  c.beginPath();
  if (sharp) {
    c.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < n; i++) c.lineTo(p[i][0], p[i][1]);
    c.closePath(); return;
  }
  c.moveTo((p[n - 1][0] + p[0][0]) / 2, (p[n - 1][1] + p[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    c.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  c.closePath();
}
// the signature look: flat fill offset from a thick, wobbly ink outline, with a hatched shade side
function ellPts(cx, cy, rx, ry, n = 10, rot = 0) {
  const a = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; const x = Math.cos(t) * rx, y = Math.sin(t) * ry; a.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); }
  return a;
}
function inkEll(c, cx, cy, rx, ry, fill, o = {}) { inkShape(c, ellPts(cx, cy, rx, ry, o.n || 10, o.rot || 0), fill, o); }
function rectPts(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
function limb(c, x1, y1, x2, y2, w, col, seed = 1, bend = 0) {
  const mx = (x1 + x2) / 2 + jit(seed, 1, 1.5) + bend, my = (y1 + y2) / 2 + jit(seed, 2, 1.5);
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(mx, my, x2, y2); c.lineWidth = w + 7; c.strokeStyle = C.ink; c.stroke();
  c.beginPath(); c.moveTo(x1 + 1, y1 + 1); c.quadraticCurveTo(mx + 1, my + 1, x2 + 1, y2 + 1); c.lineWidth = w; c.strokeStyle = col; c.stroke();
}
function inkLine(c, x1, y1, x2, y2, lw = 3, col = C.ink, seed = 1) {
  c.lineCap = 'round'; c.beginPath(); c.moveTo(x1 + jit(seed, 1, 1), y1 + jit(seed, 2, 1));
  c.quadraticCurveTo((x1 + x2) / 2 + jit(seed, 3, 2), (y1 + y2) / 2 + jit(seed, 4, 2), x2 + jit(seed, 5, 1), y2 + jit(seed, 6, 1));
  c.lineWidth = lw; c.strokeStyle = col; c.stroke();
}
function shade(col, k) { // lighten (k>0) or darken (k<0) hex
  const n = parseInt(col.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k > 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ---------- paper texture ----------
let PAPER = null;
function makePaper() {
  const p = document.createElement('canvas'); p.width = W; p.height = H; const c = p.getContext('2d');
  c.fillStyle = C.paper; c.fillRect(0, 0, W, H);
  const g = c.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 800); g.addColorStop(0, 'rgba(255,245,210,.35)'); g.addColorStop(1, 'rgba(90,50,10,.35)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(${Math.random() < .5 ? '90,60,20' : '255,250,220'},${Math.random() * .08})`; c.fillRect(Math.random() * W, Math.random() * H, rnd(1, 3), rnd(1, 3)); }
  c.strokeStyle = 'rgba(100,70,30,.06)'; c.lineWidth = 1;
  for (let i = 0; i < 160; i++) { const x = Math.random() * W, y = Math.random() * H, l = rnd(10, 60), a = rnd(0, 6.3); c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
  PAPER = p;
}
function drawPaper(c, tint, alpha = 1) {
  if (!PAPER) makePaper();
  c.globalAlpha = alpha; c.drawImage(PAPER, 0, 0, W, H); c.globalAlpha = 1;
  if (tint) { c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = tint; c.fillRect(0, 0, W, H); c.restore(); }
}
function halftone(c, x, y, w, h, col, spacing = 10, maxR = 3, dir = 'diag') {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = col;
  for (let yy = y; yy < y + h; yy += spacing) for (let xx = x + ((yy - y) / spacing % 2 ? spacing / 2 : 0); xx < x + w; xx += spacing) {
    let k = dir === 'diag' ? ((xx - x) / w + (yy - y) / h) / 2 : dir === 'down' ? (yy - y) / h : dir === 'up' ? 1 - (yy - y) / h : 1;
    const r = maxR * k; if (r > .4) { c.beginPath(); c.arc(xx, yy, r, 0, 6.3); c.fill(); }
  }
  c.restore();
}
function vignette(c, a = .55) {
  const g = c.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 820); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(20,8,0,${a})`);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}

// ---------- icons ----------
const ICC = { m: C.metal, y: C.mustard, b: C.brown, r: C.red, w: C.cream, k: C.ink, o: C.orange, t: C.teal, p: C.plum, g: C.green, s: C.sky, u: C.blue, d: '#555', pk: C.pink };
const IC = {
  sword: { r: .78, parts: [{ p: [[-.13, .5], [-.13, -.72], [0, -.98], [.13, -.72], [.13, .5]], f: 'm' }, { p: [[-.42, .5], [.42, .5], [.42, .66], [-.42, .66]], f: 'y' }, { p: [[-.08, .66], [.08, .66], [.08, .95], [-.08, .95]], f: 'b' }] },
  dagger: { r: .78, parts: [{ p: [[-.1, .3], [-.1, -.5], [0, -.9], [.1, -.5], [.1, .3]], f: 'm' }, { p: [[-.3, .3], [.3, .3], [.3, .42], [-.3, .42]], f: 'r' }, { p: [[-.07, .42], [.07, .42], [.07, .8], [-.07, .8]], f: 'b' }] },
  axe: { r: .6, parts: [{ p: [[-.07, -.9], [.07, -.9], [.07, .95], [-.07, .95]], f: 'b' }, { p: [[.07, -.85], [.6, -.95], [.7, -.4], [.6, .1], [.07, -.05]], f: 'm' }] },
  hammer: { r: .6, parts: [{ p: [[-.07, -.5], [.07, -.5], [.07, .95], [-.07, .95]], f: 'b' }, { p: [[-.55, -.95], [.55, -.95], [.55, -.4], [-.55, -.4]], f: 'd' }] },
  shield: { r: 0, parts: [{ p: [[-.7, -.7], [0, -.9], [.7, -.7], [.7, .1], [0, .95], [-.7, .1]], f: 'u' }, { p: [[-.4, -.45], [0, -.58], [.4, -.45], [.4, .02], [0, .55], [-.4, .02]], f: 'y' }] },
  fist: { r: 0, parts: [{ p: [[-.55, -.1], [-.5, -.55], [.5, -.55], [.6, -.1], [.5, .6], [-.4, .6]], f: 'pk' }, { e: [-.38, -.52, .17, .2], f: 'pk' }, { e: [-.13, -.6, .17, .2], f: 'pk' }, { e: [.13, -.6, .17, .2], f: 'pk' }, { e: [.38, -.52, .17, .2], f: 'pk' }] },
  bolt: { r: 0, sharp: 1, parts: [{ p: [[.2, -.95], [-.5, .1], [-.05, .1], [-.25, .95], [.55, -.2], [.05, -.2]], f: 'y' }] },
  drop: { r: 0, parts: [{ p: [[0, -.95], [.5, -.1], [.55, .35], [0, .85], [-.55, .35], [-.5, -.1]], f: 'r' }, { e: [-.18, .25, .1, .18], f: 'pk', stroke: 0 }] },
  heart: { r: 0, parts: [{ p: [[0, .85], [-.75, .0], [-.7, -.55], [-.3, -.7], [0, -.4], [.3, -.7], [.7, -.55], [.75, 0]], f: 'r' }] },
  coin: { r: 0, parts: [{ e: [0, 0, .85, .85], f: 'y' }, { e: [0, 0, .55, .55], f: 'y', line: 1 }] },
  skull: { r: 0, parts: [{ e: [0, -.15, .75, .7], f: 'w' }, { p: [[-.35, .35], [.35, .35], [.3, .9], [-.3, .9]], f: 'w' }, { e: [-.28, -.1, .2, .24], f: 'k' }, { e: [.28, -.1, .2, .24], f: 'k' }] },
  eye: { r: 0, parts: [{ p: [[-.95, 0], [-.4, -.5], [.4, -.5], [.95, 0], [.4, .5], [-.4, .5]], f: 'w' }, { e: [0, 0, .32, .36], f: 't' }, { e: [0, 0, .13, .15], f: 'k' }] },
  mouth: { r: 0, parts: [{ p: [[-.9, -.6], [.9, -.6], [.9, .35], [.2, .35], [-.2, .85], [-.25, .35], [-.9, .35]], f: 'w' }, { e: [-.4, -.12, .1, .1], f: 'k', stroke: 0 }, { e: [0, -.12, .1, .1], f: 'k', stroke: 0 }, { e: [.4, -.12, .1, .1], f: 'k', stroke: 0 }] },
  smoke: { r: 0, parts: [{ e: [-.35, .2, .45, .4], f: 'd' }, { e: [.35, .25, .45, .4], f: 'd' }, { e: [0, -.2, .5, .45], f: 'grey' }, { e: [.1, -.55, .3, .28], f: 'grey' }] },
  fire: { r: 0, parts: [{ p: [[0, -.98], [.35, -.4], [.7, .1], [.5, .8], [0, .95], [-.5, .8], [-.7, .1], [-.3, -.35]], f: 'o' }, { p: [[0, -.2], [.28, .25], [.15, .7], [-.15, .7], [-.28, .25]], f: 'y' }] },
  cards: { r: 0, parts: [{ p: [[-.75, -.5], [-.1, -.65], [.1, .55], [-.55, .7]], f: 'w', rot: -.2 }, { p: [[-.15, -.7], [.55, -.55], [.65, .5], [-.05, .65]], f: 'r' }] },
  clock: { r: 0, parts: [{ e: [0, 0, .85, .85], f: 'w' }, { p: [[-.05, -.6], [.05, -.6], [.05, .05], [-.05, .05]], f: 'k', stroke: 0 }, { p: [[0, -.05], [.45, -.05], [.45, .05], [0, .05]], f: 'k', stroke: 0 }] },
  mask: { r: 0, parts: [{ p: [[-.75, -.6], [0, -.8], [.75, -.6], [.7, .1], [.2, .8], [-.2, .8], [-.7, .1]], f: 'w' }, { p: [[-.5, -.2], [-.15, -.3], [-.1, 0], [-.45, .05]], f: 'k' }, { p: [[.5, -.2], [.15, -.3], [.1, 0], [.45, .05]], f: 'k' }] },
  thorn: { r: 0, sharp: 1, parts: [{ p: [[0, -.95], [.18, -.3], [.8, -.5], [.35, -.05], [.9, .35], [.2, .25], [0, .95], [-.2, .25], [-.9, .35], [-.35, -.05], [-.8, -.5], [-.18, -.3]], f: 'g' }] },
  boot: { r: 0, parts: [{ p: [[-.4, -.8], [.15, -.8], [.15, .1], [.8, .4], [.8, .8], [-.4, .8]], f: 'b' }] },
  body: { r: 0, parts: [{ e: [0, -.55, .3, .3], f: 'pk' }, { p: [[-.7, -.2], [.7, -.2], [.55, .9], [-.55, .9]], f: 'u' }] },
  quake: { r: 0, sharp: 1, parts: [{ p: [[-.95, .3], [-.4, .1], [-.2, .5], [.2, 0], [.5, .4], [.95, .15], [.95, .8], [-.95, .8]], f: 'b' }, { p: [[0, -.9], [.15, -.3], [.4, -.35], [.1, .15], [-.1, .05], [-.05, -.4], [-.3, -.35]], f: 'y' }] },
  dust: { r: 0, parts: [{ e: [-.4, -.3, .3, .3], f: 'paper' }, { e: [.35, -.1, .35, .35], f: 'paper' }, { e: [-.1, .4, .4, .35], f: 'paper' }] },
  bottle: { r: .3, parts: [{ p: [[-.15, -.95], [.15, -.95], [.15, -.45], [.45, -.1], [.45, .9], [-.45, .9], [-.45, -.1], [-.15, -.45]], f: 'g' }, { p: [[-.4, .1], [.4, .1], [.4, .75], [-.4, .75]], f: 'y' }] },
  needle: { r: .78, parts: [{ p: [[-.05, -.95], [.05, -.95], [.05, .9], [-.05, .9]], f: 'm' }, { e: [0, .8, .12, .16], f: 'k' }] },
  gear: { r: 0, parts: [{ p: ellPts(0, 0, .85, .85, 16).map((q, i) => i % 2 ? [q[0] * .8, q[1] * .8] : q), f: 'm', sharp: 1 }, { e: [0, 0, .3, .3], f: 'k' }] },
  star: { r: 0, sharp: 1, parts: [{ p: Array.from({ length: 10 }, (_, i) => [Math.sin(i * .628) * (i % 2 ? .4 : .95), -Math.cos(i * .628) * (i % 2 ? .4 : .95)]), f: 'y' }] },
  up: { r: 0, sharp: 1, parts: [{ p: [[0, -.9], [.8, 0], [.3, 0], [.3, .8], [-.3, .8], [-.3, 0], [-.8, 0]], f: 'g' }] },
  down: { r: 0, sharp: 1, parts: [{ p: [[0, .9], [.8, 0], [.3, 0], [.3, -.8], [-.3, -.8], [-.3, 0], [-.8, 0]], f: 'p' }] },
  crack: { r: 0, parts: [{ e: [0, 0, .85, .85], f: 'o' }, { p: [[-.1, -.85], [.15, -.3], [-.2, .0], [.2, .4], [0, .85], [-.05, .4], [-.4, 0], [-.05, -.3]], f: 'k', stroke: 0, sharp: 1 }] },
  talk: { r: 0, parts: [{ p: [[-.9, -.6], [.9, -.6], [.9, .35], [.3, .35], [-.2, .85], [-.1, .35], [-.9, .35]], f: 'y' }, { p: [[-.5, -.2], [.5, -.2], [.5, -.12], [-.5, -.12]], f: 'k', stroke: 0 }, { p: [[-.5, .05], [.3, .05], [.3, .13], [-.5, .13]], f: 'k', stroke: 0 }] },
  curse: { r: 0, parts: [{ e: [0, 0, .85, .85], f: 'p' }, { p: [[-.4, -.4], [.4, .4]], f: null }] },
  ap: { r: 0, sharp: 1, parts: [{ p: Array.from({ length: 8 }, (_, i) => [Math.sin(i * .785) * (i % 2 ? .5 : .9), -Math.cos(i * .785) * (i % 2 ? .5 : .9)]), f: 'y' }] },
  graft: { r: 0, parts: [{ e: [0, 0, .8, .8], f: 't' }, { p: [[-.45, 0], [-.1, .4], [.5, -.4]], f: null, line: 1 }] },
  compass: { r: 0, parts: [{ e: [0, 0, .85, .85], f: 'w' }, { p: [[0, -.7], [.18, 0], [-.18, 0]], f: 'r', sharp: 1 }, { p: [[0, .7], [.18, 0], [-.18, 0]], f: 'u', sharp: 1 }] },
  tent: { r: 0, sharp: 1, parts: [{ p: [[0, -.8], [.9, .7], [-.9, .7]], f: 'o' }, { p: [[0, .05], [.3, .7], [-.3, .7]], f: 'k' }] },
  anvil: { r: 0, sharp: 1, parts: [{ p: [[-.9, -.5], [.9, -.5], [.6, -.1], [.3, .0], [.4, .5], [.7, .8], [-.7, .8], [-.4, .5], [-.3, 0], [-.6, -.1]], f: 'd' }] },
  question: { r: 0, parts: [{ e: [0, 0, .85, .85], f: 'p' }] },
  chest: { r: 0, sharp: 1, parts: [{ p: [[-.85, -.3], [.85, -.3], [.85, .7], [-.85, .7]], f: 'b' }, { p: [[-.85, -.3], [-.7, -.8], [.7, -.8], [.85, -.3]], f: 'o' }, { p: [[-.1, -.1], [.1, -.1], [.1, .2], [-.1, .2]], f: 'y' }] },
  crown: { r: 0, sharp: 1, parts: [{ p: [[-.85, .6], [-.85, -.5], [-.4, -.1], [0, -.7], [.4, -.1], [.85, -.5], [.85, .6]], f: 'y' }] },
  skullx: { r: 0, parts: [] },
  plus: { r: 0, sharp: 1, parts: [{ p: [[-.25, -.8], [.25, -.8], [.25, -.25], [.8, -.25], [.8, .25], [.25, .25], [.25, .8], [-.25, .8], [-.25, .25], [-.8, .25], [-.8, -.25], [-.25, -.25]], f: 'g' }] },
  shop: { r: 0, sharp: 1, parts: [{ p: [[-.8, -.2], [-.8, .8], [.8, .8], [.8, -.2]], f: 'w' }, { p: [[-.95, -.2], [-.7, -.8], [.7, -.8], [.95, -.2]], f: 'r' }] }
};
function icon(c, name, x, y, s, o = {}) {
  if (typeof SPR !== 'undefined' && SPR.icon(c, name, x, y, s)) return;
  const d = IC[name]; if (!d) return;
  c.save(); c.translate(x, y); c.scale(s, s); if (d.r) c.rotate(d.r); if (o.rot) c.rotate(o.rot);
  const lw = Math.max(1.7 / s, (o.lw || 4.2) / s * (s > 30 ? 1 : s / 30 + .4));
  d.parts.forEach((pt, i) => {
    let fill = pt.f ? (ICC[pt.f] || (pt.f === 'grey' ? '#8a8378' : pt.f === 'paper' ? '#efe6c8' : pt.f)) : null;
    if (o.col && i === (o.ci || 0) && pt.f) fill = o.col;
    const sd = (o.seed || 7) + i;
    const oo = { seed: sd, lw: pt.stroke === 0 ? 0.01 : lw, off: .06 * 1, amp: .015, sharp: pt.sharp || d.sharp, stroke: pt.stroke !== 0, shade: s > 14, pad: .2, shadeSz: .11 };
    if (pt.e) { inkShape(c, ellPts(pt.e[0], pt.e[1], pt.e[2], pt.e[3], 10), fill, Object.assign(oo, { sharp: false })); }
    else if (pt.rot) { c.save(); c.rotate(pt.rot); inkShape(c, pt.p, fill, oo); c.restore(); }
    else if (!fill && pt.line) { c.beginPath(); c.moveTo(pt.p[0][0], pt.p[0][1]); for (const q of pt.p.slice(1)) c.lineTo(q[0], q[1]); c.lineWidth = lw * 1.4; c.strokeStyle = C.ink; c.lineCap = 'round'; c.stroke(); }
    else if (pt.p.length > 2) inkShape(c, pt.p, fill, oo);
    else if (pt.p.length === 2) { c.beginPath(); c.moveTo(pt.p[0][0], pt.p[0][1]); c.lineTo(pt.p[1][0], pt.p[1][1]); c.lineWidth = lw * 1.6; c.strokeStyle = C.ink; c.stroke(); }
  });
  if (name === 'question') { c.restore(); disp(c, '?', x, y + s * .05, s * 1.3, C.cream); return; }
  c.restore();
}

// ---------- figures ----------
function drawFigure(c, s, pose) {
  if (s.spriteKey && typeof SPR !== 'undefined' && SPR.draw(c, s, pose)) return;
  drawFigureProc(c, s, pose);
}
function drawFigureProc(c, s, pose) {
  const k = s.kind || 'human';
  if (k === 'human') drawHuman(c, s, pose);
  else if (k === 'beast') drawBeast(c, s, pose);
  else if (k === 'blob') drawBlob(c, s, pose);
  else if (k === 'bot') drawBot(c, s, pose);
}
function drawHuman(c, s, p) {
  const w = s.build || 1, seed = s.seed || 3, t = p.t;
  const bob = Math.sin(t * 2.4 + seed) * 2, br = Math.sin(t * 2.4 + seed + 1.2) * 2;
  const skin = s.skin, coat = s.coat, pants = s.pants || shade(coat, -.45), acc = s.accent || C.mustard;
  const bootC = s.boot || '#6b4328', gloveC = s.glove || '#4a2e1e', hairC = s.hair || '#6a4428', gold = '#e8b53a', scarfC = s.scarf || acc;
  const hy = -198 + bob;
  const atk = p.atk || 0, talk = p.talk || 0, sit = !!p.sit;
  const LW = 5.5;
  c.save();
  if (!p.noShadow) { c.fillStyle = 'rgba(30,15,5,.28)'; c.beginPath(); c.ellipse(0, 4, 54 * w, 10, 0, 0, 6.3); c.fill(); }
  // ---- boot helper ----
  const boot = (x, toe) => {
    inkShape(c, [[x - 13 * w, -58], [x + 13 * w, -58], [x + 14 * w, -18], [x + (14 + toe) * w, -13], [x + (18 + toe) * w, -2], [x + (14 + toe) * w, 5], [x - 15 * w, 5], [x - 17 * w, -12]], bootC, { seed: seed + 3 + x, lw: LW - 1 });
    inkShape(c, [[x - 14 * w, -42], [x + 14 * w, -42], [x + 14 * w, -34], [x - 14 * w, -34]], shade(bootC, -.3), { seed: seed + 4, lw: 3, shade: false, sharp: 1 });
    inkShape(c, [[x + 3 * w, -44], [x + 11 * w, -44], [x + 11 * w, -32], [x + 3 * w, -32]], gold, { seed: seed + 5, lw: 2.2, shade: false, sharp: 1 });
    inkShape(c, [[x - 14 * w, -58], [x + 14 * w, -58], [x + 14 * w, -51], [x - 14 * w, -51]], shade(bootC, .2), { seed: seed + 6, lw: 2.5, shade: false, sharp: 1 });
    inkLine(c, x - 15 * w, 3, x + (15 + toe) * w, 3, 3, '#e6d6b4', seed + x);
  };
  const legTop = (xa, xb, x1, x2) => inkShape(c, [[xa, -104], [xb, -104], [x2, -54], [x1, -54]], pants, { seed: seed + 1 + xa, lw: LW - 1 });
  if (sit) {
    limb(c, -4, -30, 62 * w, -34, 24 * w, pants, seed + 1, 0); limb(c, 62 * w, -34, 66 * w, -14, 20 * w, pants, seed + 2, 0);
    boot(62 * w, 8);
    c.translate(0, 50);
  } else {
    // scarf tail flutters behind
    const wv = Math.sin(t * 5 + seed) * 6, wv2 = Math.sin(t * 6 + seed + 1) * 8;
    inkShape(c, [[-12, -182 + bob], [-38, -192 + bob + wv], [-70, -180 + wv2], [-62, -172 + wv], [-82, -166 + wv2], [-52, -162], [-14, -168 + bob]], scarfC, { seed: seed + 50, lw: 3.5, sharp: 1, amp: 1 });
    legTop(-19 * w, 1 * w, -34 * w, -10 * w); boot(-22 * w, 12);
    legTop(-1 * w, 19 * w, 8 * w, 32 * w); boot(20 * w, 14);
  }
  // ---- back arm ----
  const bsx = -26 * w, bsy = -164 + bob;
  limb(c, bsx, bsy, bsx - 12 * w, bsy + 34, 15 * w, coat, seed + 4, -3);
  limb(c, bsx - 12 * w, bsy + 34, bsx - 8 * w, bsy + 64 + br, 13 * w, coat, seed + 5, 2);
  limb(c, bsx - 9 * w, bsy + 54 + br, bsx - 8 * w, bsy + 62 + br, 16 * w, shade(coat, .3), seed + 6, 0);
  inkEll(c, bsx - 8 * w, bsy + 72 + br, 10 * w, 11, gloveC, { seed: seed + 7, lw: 3.2, n: 8 });
  // ---- torso / jacket ----
  const cw = 31 * w;
  inkShape(c, [[-cw, -168 + bob], [0, -178 + bob], [cw, -168 + bob], [cw + 4, -132], [cw - 5, -104], [cw + 1, -88], [0, -84], [-cw - 1, -88], [-cw + 5, -104], [-cw - 4, -132]], coat, { seed: seed + 6, lw: LW });
  inkShape(c, [[-9, -176 + bob], [9, -176 + bob], [4, -116], [-4, -116]], s.shirt || '#efe2c4', { seed: seed + 9, lw: 2.5, shade: false, amp: .3 });
  inkLine(c, -9, -176 + bob, -5, -116, 2.5, shade(coat, -.5), seed + 41); inkLine(c, 9, -176 + bob, 6, -116, 2.5, shade(coat, -.5), seed + 42);
  // belt, buckle, strap, pouch
  inkShape(c, [[-cw + 4, -110], [cw - 2, -110], [cw - 2, -99], [-cw + 4, -99]], '#4a3020', { seed: seed + 7, lw: 3, shade: false, sharp: 1, amp: .3 });
  inkShape(c, [[-24 * w, -170 + bob], [-14 * w, -172 + bob], [cw - 2, -102], [cw - 12, -98]], '#5a3a22', { seed: seed + 8, lw: 3, sharp: 1, amp: .3 });
  inkShape(c, [[-3, -112], [11, -112], [11, -97], [-3, -97]], gold, { seed: seed + 8, lw: 2.5, shade: false, sharp: 1, amp: .3 }); inkShape(c, [[0, -109], [8, -109], [8, -100], [0, -100]], '#4a3020', { seed: seed + 8, lw: 1.5, shade: false, sharp: 1, amp: 0 });
  inkShape(c, [[cw - 14, -100], [cw + 8, -100], [cw + 8, -78], [cw - 14, -78]], '#7a4a2a', { seed: seed + 9, lw: 3, amp: .3 }); inkLine(c, cw - 14, -92, cw + 8, -92, 2, shade('#7a4a2a', -.4), seed);
  // popped collar + bandana
  inkShape(c, [[-cw + 2, -170 + bob], [-14, -194 + bob], [-4, -172 + bob]], shade(coat, .15), { seed: seed + 40, lw: 3, sharp: 1, amp: .5 });
  inkShape(c, [[8, -172 + bob], [20, -196 + bob], [cw - 2, -168 + bob]], shade(coat, .15), { seed: seed + 41, lw: 3, sharp: 1, amp: .5 });
  inkShape(c, [[-18 * w, -178 + bob], [20 * w, -176 + bob], [4, -148 + bob]], scarfC, { seed: seed + 10, lw: 3.2, sharp: 1, amp: .5 });
  // ---- head ----
  const hx = 6;
  inkShape(c, [[hx - 24, hy - 4], [hx - 32, hy + 18], [hx - 14, hy + 8], [hx - 8, hy - 16]], hairC, { seed: seed + 51, lw: 3, sharp: 1, amp: .6 });
  inkEll(c, hx, hy, 23, 27, skin, { seed: seed + 11, lw: LW - .5, n: 9 });
  inkEll(c, hx - 21, hy + 2, 5, 8, skin, { seed: seed + 12, lw: 2.5, off: 1, shade: false });
  const mood = s.face || 'grim', ex = hx + 9, ey = hy - 2;
  const blink = (Math.sin(t * .9 + seed * 3) > .985) ? .2 : 1;
  const eye = cx => {
    inkShape(c, [[cx - 7, ey + 1], [cx - 2, ey - 5 * blink], [cx + 5, ey - 4 * blink], [cx + 8, ey + 2], [cx + 2, ey + 5 * blink], [cx - 4, ey + 5 * blink]], C.white, { seed: seed + 13 + cx, lw: 2, shade: false, amp: 0 });
    c.fillStyle = C.ink; c.beginPath(); c.arc(cx + 2.5, ey + .5, 3.4 * blink + .3, 0, 6.3); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(cx + 3.6, ey - .8, 1.1, 0, 6.3); c.fill();
    inkLine(c, cx - 8, ey - 1, cx + 7, ey - 5 * blink - .5, 3.2, C.ink, seed + cx);
  };
  eye(ex - 4); eye(ex + 14);
  const bAng = mood === 'angry' ? 5 : mood === 'grin' ? -1 : mood === 'sad' ? -4 : 1.5;
  inkLine(c, ex - 11, ey - 10 - bAng * .3, ex + 3, ey - 10 + bAng, 3.4, '#3a2214', seed + 15);
  inkLine(c, ex + 9, ey - 10 + bAng, ex + 23, ey - 10 - bAng * .3, 3.4, '#3a2214', seed + 16);
  if (s.patch) { inkEll(c, ex + 14, ey, 9, 9, C.ink, { seed: seed + 17, lw: 2, off: 0, shade: false, n: 7 }); inkLine(c, ex + 5, ey - 7, hx - 20, hy - 22, 3, C.ink, seed + 18); }
  inkShape(c, [[hx + 13, hy + 4], [hx + 22, hy + 11], [hx + 11, hy + 13]], shade(skin, -.18), { seed: seed + 19, lw: 2.2, off: 0, shade: false, sharp: 1 });
  const my = hy + 17, mo = talk > 0 ? (Math.abs(Math.sin(t * 14)) * 7 * talk) : 0;
  if (mo > 1.5) { inkEll(c, hx + 12, my + 2, 8, 2 + mo, C.ink, { seed: seed + 20, lw: 2, off: 0, shade: false, n: 7 }); }
  else if (mood === 'grin') { c.beginPath(); c.moveTo(hx + 3, my - 2); c.quadraticCurveTo(hx + 12, my + 9, hx + 22, my - 4); c.lineWidth = 3; c.strokeStyle = C.ink; c.stroke(); inkLine(c, hx + 8, my + 1.5, hx + 18, my - .5, 2.4, C.white, seed); }
  else if (mood === 'angry' || mood === 'grim') { c.beginPath(); c.moveTo(hx + 4, my + 2); c.quadraticCurveTo(hx + 12, my - 3, hx + 21, my + 3); c.lineWidth = 3; c.strokeStyle = C.ink; c.stroke(); }
  else inkLine(c, hx + 4, my, hx + 20, my, 3, C.ink, seed + 21);
  if (s.scar) { inkLine(c, hx - 10, hy - 20, hx + 2, hy + 6, 2.5, C.red, seed + 22); inkLine(c, hx - 12, hy - 8, hx, hy - 8, 2, C.red, seed + 23); }
  if (s.beard) inkShape(c, [[hx - 18, hy + 10], [hx + 22, hy + 12], [hx + 14, hy + 38], [hx - 4, hy + 44], [hx - 16, hy + 30]], s.beard, { seed: seed + 24, lw: 3.5 });
  // hats / hair
  const hat = s.hat, hc = s.hatCol || acc;
  if (hat === 'cap') {
    inkShape(c, [[hx - 28, hy - 6], [hx - 26, hy - 30], [hx - 4, hy - 42], [hx + 22, hy - 36], [hx + 30, hy - 14], [hx + 28, hy - 6]], hc, { seed: seed + 25, lw: LW - 1 });
    inkLine(c, hx - 2, hy - 42, hx + 2, hy - 12, 2, shade(hc, -.35), seed + 26); c.fillStyle = shade(hc, -.3); c.beginPath(); c.arc(hx - 4, hy - 42, 3, 0, 6.3); c.fill();
    inkShape(c, [[hx + 14, hy - 16], [hx + 58, hy - 10], [hx + 62, hy - 2], [hx + 32, hy - 3], [hx + 14, hy - 7]], shade(hc, -.15), { seed: seed + 27, lw: 3.5 });
  }
  else if (hat === 'tophat') { inkShape(c, [[hx - 36, hy - 22], [hx + 38, hy - 22], [hx + 36, hy - 14], [hx - 34, hy - 14]], shade(hc, -.3), { seed: seed + 25, lw: 4 }); inkShape(c, [[hx - 22, hy - 20], [hx - 20, hy - 72], [hx + 24, hy - 72], [hx + 26, hy - 20]], hc, { seed: seed + 26, lw: 4 }); inkShape(c, [[hx - 22, hy - 30], [hx + 26, hy - 30], [hx + 26, hy - 22], [hx - 22, hy - 22]], C.red, { seed: seed + 27, lw: 2, off: 0, shade: false }); }
  else if (hat === 'hood') { inkShape(c, [[hx - 34, hy + 22], [hx - 36, hy - 14], [hx - 14, hy - 40], [hx + 20, hy - 38], [hx + 34, hy - 12], [hx + 28, hy - 4], [hx + 20, hy - 24], [hx - 6, hy - 28], [hx - 22, hy - 8], [hx - 18, hy + 22]], hc, { seed: seed + 25, lw: 4.5 }); }
  else if (hat === 'helm') { inkShape(c, [[hx - 30, hy - 4], [hx - 28, hy - 34], [hx, hy - 44], [hx + 28, hy - 34], [hx + 30, hy - 4], [hx + 22, hy - 12], [hx - 22, hy - 12]], C.metal, { seed: seed + 25, lw: 4.5 }); c.fillStyle = C.ink; for (const q of [-16, 0, 16]) { c.beginPath(); c.arc(hx + q, hy - 26, 2.6, 0, 6.3); c.fill(); } }
  else if (hat === 'bandana') { inkShape(c, [[hx - 28, hy - 14], [hx + 30, hy - 14], [hx + 30, hy - 26], [hx, hy - 36], [hx - 28, hy - 26]], hc, { seed: seed + 25, lw: 4 }); inkShape(c, [[hx - 28, hy - 18], [hx - 46, hy - 8], [hx - 40, hy - 22]], hc, { seed: seed + 26, lw: 3, sharp: 1 }); }
  else if (hat === 'mohawk') { inkShape(c, [[hx - 14, hy - 26], [hx - 10, hy - 56], [hx - 2, hy - 30], [hx + 4, hy - 64], [hx + 10, hy - 30], [hx + 18, hy - 54], [hx + 20, hy - 24]], hc, { seed: seed + 25, lw: 3.5, sharp: 1 }); }
  else if (hat === 'bowler') { inkShape(c, [[hx - 34, hy - 14], [hx + 34, hy - 14], [hx + 30, hy - 8], [hx - 30, hy - 8]], shade(hc, -.3), { seed: seed + 25, lw: 3.5 }); inkShape(c, [[hx - 22, hy - 14], [hx - 20, hy - 40], [hx, hy - 48], [hx + 22, hy - 40], [hx + 24, hy - 14]], hc, { seed: seed + 26, lw: 4 }); }
  else if (hat === 'hair') { inkShape(c, [[hx - 28, hy + 2], [hx - 28, hy - 26], [hx - 6, hy - 38], [hx + 22, hy - 30], [hx + 30, hy - 12], [hx + 16, hy - 20], [hx - 6, hy - 18], [hx - 18, hy - 4], [hx - 22, hy + 24]], hc, { seed: seed + 25, lw: 4 }); }
  // ---- front arm + weapon ----
  const sx = 28 * w, sy = -164 + bob;
  const ang = p.mug ? -1.4 : p.armAng != null ? p.armAng : (atk > 0 ? (atk < .35 ? lerp(.5, -1.9, ease.out(atk / .35)) : lerp(-1.9, 1.2, ease.out((atk - .35) / .65))) : (.5 + Math.sin(t * 2.4 + seed) * .05));
  const al = p.mug ? 46 : 74;
  const hxn = sx + Math.cos(ang) * al, hyn = sy + Math.sin(ang) * al;
  const ex2 = sx + Math.cos(ang - .35) * al * .52, ey2 = sy + Math.sin(ang - .35) * al * .52;
  limb(c, sx, sy, ex2, ey2, 15 * w, coat, seed + 30, 0);
  limb(c, ex2, ey2, hxn, hyn, 13 * w, coat, seed + 29, 0);
  limb(c, ex2 + (hxn - ex2) * .62, ey2 + (hyn - ey2) * .62, ex2 + (hxn - ex2) * .8, ey2 + (hyn - ey2) * .8, 17 * w, shade(coat, .3), seed + 28, 0);
  inkEll(c, hxn, hyn, 10 * w, 10.5, gloveC, { seed: seed + 31, lw: 3.2, n: 8 });
  const wp = p.mug ? 'mug' : (s.weapon || 'knife');
  c.save(); c.translate(hxn, hyn); c.rotate(ang + (atk > 0 ? 0.2 : 0.7) - 1.57 + (wp === 'pistol' ? 1.1 : 0));
  if (wp === 'knife') { inkShape(c, [[-5, 0], [-6, -34], [0, -50], [6, -34], [5, 0]], '#d8dde0', { seed: seed + 32, lw: 3.5, sharp: 1 }); inkLine(c, 0, -4, 0, -42, 1.8, 'rgba(120,130,140,.8)', seed); inkShape(c, [[-10, 0], [10, 0], [10, 6], [-10, 6]], gold, { seed: seed + 33, lw: 3, shade: false, sharp: 1 }); }
  else if (wp === 'club') { inkShape(c, [[-5, 8], [-6, -20], [-14, -52], [0, -66], [14, -52], [6, -20], [5, 8]], C.brown, { seed: seed + 32, lw: 4 }); c.fillStyle = C.metal; for (const q of [[-6, -48], [6, -42], [0, -58]]) { c.beginPath(); c.arc(q[0], q[1], 3, 0, 6.3); c.fill(); c.stroke(); } }
  else if (wp === 'pistol') { inkShape(c, [[-6, 6], [-6, -10], [-4, -14], [34, -14], [34, -2], [10, -2], [8, 8]], C.metal, { seed: seed + 32, lw: 3.5, sharp: 1 }); inkShape(c, [[-8, 8], [4, 8], [2, 22], [-10, 22]], C.brown, { seed: seed + 33, lw: 3 }); }
  else if (wp === 'cane') { inkLine(c, 0, 8, 0, -62, 7, C.ink, seed); inkLine(c, 0, 8, 0, -62, 4, C.brown, seed); inkEll(c, 0, -66, 9, 9, acc, { seed: seed + 33, lw: 3, n: 7 }); }
  else if (wp === 'axe') { inkShape(c, [[-3, 10], [-3, -60], [3, -60], [3, 10]], C.brown, { seed: seed + 32, lw: 3 }); inkShape(c, [[3, -58], [30, -66], [34, -34], [3, -30]], C.metal, { seed: seed + 33, lw: 3.5 }); }
  else if (wp === 'wrench') { inkShape(c, [[-4, 10], [-4, -50], [4, -50], [4, 10]], C.metal, { seed: seed + 32, lw: 3.5 }); inkShape(c, [[-12, -50], [-12, -70], [-4, -62], [4, -62], [12, -70], [12, -50]], C.metal, { seed: seed + 33, lw: 3.5 }); }
  else if (wp === 'mug') { c.rotate(-(ang + .7 - 1.57)); inkShape(c, [[-9, -22], [9, -22], [8, 2], [-8, 2]], '#e8e2d4', { seed: seed + 32, lw: 3 }); c.strokeStyle = C.ink; c.lineWidth = 3; c.beginPath(); c.arc(11, -10, 6, -1.4, 1.4); c.stroke(); inkLine(c, -5, -26, -3, -34, 2, 'rgba(255,255,255,.6)', 3); }
  else if (wp === 'bottle') { inkShape(c, [[-7, 6], [-7, -24], [-3, -34], [-3, -46], [3, -46], [3, -34], [7, -24], [7, 6]], C.green, { seed: seed + 32, lw: 3.5 }); }
  c.restore();
  c.restore();
}
function drawBeast(c, s, p) {
  const t = p.t, seed = s.seed || 5, col = s.coat, bob = Math.sin(t * 4 + seed) * 2.5, run = p.atk > 0 ? 1 : 0;
  c.save();
  if (!p.noShadow) { c.fillStyle = 'rgba(30,15,5,.28)'; c.beginPath(); c.ellipse(0, 4, 80, 10, 0, 0, 6.3); c.fill(); }
  const lg = (x, ph) => { const sw = Math.sin(t * (run ? 14 : 3) + ph) * (run ? 16 : 5); limb(c, x, -52 + bob, x + sw, -4, 15, shade(col, -.25), seed + ph, 0); };
  lg(-48, 0); lg(32, 2);
  inkShape(c, [[-56, -44 + bob], [-40, -86 + bob], [10, -96 + bob], [52, -78 + bob], [56, -44 + bob], [10, -30 + bob], [-40, -30 + bob]], col, { seed: seed + 1, lw: 4.5 });
  // spikes
  for (let i = 0; i < 4; i++) inkShape(c, [[-34 + i * 24, -88 + bob + i * 2], [-28 + i * 24, -112 + bob + i * 2], [-18 + i * 24, -90 + bob + i * 2]], s.accent || C.orange, { seed: seed + 5 + i, lw: 3, sharp: 1 });
  // tail
  c.beginPath(); c.moveTo(-54, -62 + bob); c.quadraticCurveTo(-90, -80 + Math.sin(t * 5) * 8, -86, -110); c.lineWidth = 12; c.strokeStyle = C.ink; c.lineCap = 'round'; c.stroke(); c.lineWidth = 6; c.strokeStyle = col; c.stroke();
  lg(-26, 1); lg(52, 3);
  // head
  const hx = 62 + (p.atk > 0 ? 14 : 0), hy = -86 + bob;
  inkShape(c, [[hx - 24, hy - 24], [hx + 16, hy - 28], [hx + 60, hy - 6], [hx + 62, hy + 10], [hx + 16, hy + 20], [hx - 20, hy + 14]], col, { seed: seed + 2, lw: 4.5 });
  inkShape(c, [[hx - 18, hy - 22], [hx - 24, hy - 52], [hx - 4, hy - 28]], shade(col, -.3), { seed: seed + 3, lw: 3.5, sharp: 1 });
  inkShape(c, [[hx + 2, hy - 26], [hx + 8, hy - 54], [hx + 22, hy - 28]], shade(col, -.3), { seed: seed + 4, lw: 3.5, sharp: 1 });
  inkEll(c, hx + 12, hy - 6, 7, 7, C.white, { seed: seed + 6, lw: 2.5, off: 0, shade: false, n: 7 });
  c.fillStyle = s.eye || C.red; c.beginPath(); c.arc(hx + 14, hy - 5, 3.6, 0, 6.3); c.fill();
  inkLine(c, hx + 2, hy - 18, hx + 22, hy - 12, 4, C.ink, seed);
  // teeth
  inkShape(c, [[hx + 20, hy + 8], [hx + 60, hy + 4], [hx + 44, hy + 16], [hx + 30, hy + 12]], C.white, { seed: seed + 7, lw: 2, off: 0, shade: false, sharp: 1 });
  inkEll(c, hx + 62, hy - 2, 7, 6, C.ink, { seed: seed + 8, lw: 1, off: 0, shade: false, n: 6 });
  c.restore();
}
function drawBlob(c, s, p) {
  const t = p.t, seed = s.seed || 9, col = s.coat;
  const sq = 1 + Math.sin(t * 3 + seed) * .06, sy = 1 / sq;
  c.save(); if (!p.noShadow) { c.fillStyle = 'rgba(30,15,5,.28)'; c.beginPath(); c.ellipse(0, 4, 84, 11, 0, 0, 6.3); c.fill(); }
  c.translate(0, 0); c.scale(sq, sy * (p.atk > 0 ? 1.15 : 1));
  const pts = [];
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; const r = 1 + Math.sin(a * 3 + t * 2 + seed) * .08; pts.push([Math.cos(a) * 78 * r, -66 + Math.sin(a) * 66 * r]); }
  pts.forEach(q => { if (q[1] > -8) q[1] = -4; });
  inkShape(c, pts, col, { seed, lw: 5 });
  // drips
  for (let i = 0; i < 3; i++) { const dx = -40 + i * 40, dl = 12 + (Math.sin(t * 2 + i * 2) + 1) * 8; inkShape(c, [[dx - 7, -8], [dx + 7, -8], [dx + 5, -8 + dl], [dx - 5, -8 + dl]], col, { seed: seed + i, lw: 3 }); }
  inkEll(c, -22, -80, 17, 20, C.white, { seed: seed + 3, lw: 3.5, off: 0, shade: false, n: 8 });
  inkEll(c, 26, -70, 12, 14, C.white, { seed: seed + 4, lw: 3.5, off: 0, shade: false, n: 8 });
  c.fillStyle = C.ink; c.beginPath(); c.arc(-18, -78, 7, 0, 6.3); c.fill(); c.beginPath(); c.arc(30, -68, 5, 0, 6.3); c.fill();
  c.beginPath(); c.moveTo(-30, -38); c.quadraticCurveTo(0, -22 + Math.sin(t * 3) * 6, 34, -42); c.lineWidth = 4; c.strokeStyle = C.ink; c.stroke();
  for (let i = 0; i < 4; i++) { const bx = Math.sin(t * 1.3 + i * 1.7) * 50, by = -90 - ((t * 20 + i * 25) % 60); c.strokeStyle = C.ink; c.lineWidth = 2; c.beginPath(); c.arc(bx, by + 20, 4 + i, 0, 6.3); c.stroke(); }
  c.restore();
}
function drawBot(c, s, p) {
  const t = p.t, seed = s.seed || 11, col = s.coat, bob = Math.sin(t * 2.6 + seed) * 6 - 18;
  c.save(); if (!p.noShadow) { c.fillStyle = 'rgba(30,15,5,.28)'; c.beginPath(); c.ellipse(0, 4, 56 - bob * .4, 9, 0, 0, 6.3); c.fill(); }
  // thruster
  inkShape(c, [[-18, -50 + bob], [18, -50 + bob], [8, -10 + bob + Math.sin(t * 30) * 4], [-8, -10 + bob + Math.sin(t * 29) * 4]], C.orange, { seed: seed + 9, lw: 3, sharp: 1 });
  limb(c, -48, -100 + bob, -66, -60 + bob + Math.sin(t * 3) * 4, 11, C.metal, seed + 1, 0);
  limb(c, 48, -100 + bob, 66 + (p.atk > 0 ? 20 : 0), -64 + bob + Math.cos(t * 3) * 4, 11, C.metal, seed + 2, 0);
  inkShape(c, [[-30, -150 + bob], [30, -150 + bob], [30, -82 + bob], [-30, -82 + bob]], col, { seed, lw: 4.5, sharp: 1 });
  inkShape(c, [[-48, -112 + bob], [48, -112 + bob], [48, -80 + bob], [-48, -80 + bob]], col, { seed: seed + 3, lw: 4.5, sharp: 1 });
  inkShape(c, [[-18, -104 + bob], [18, -104 + bob], [18, -90 + bob], [-18, -90 + bob]], C.ink, { seed: seed + 4, lw: 2, shade: false, off: 0, sharp: 1 });
  c.fillStyle = C.mustard; for (let i = 0; i < 3; i++) c.fillRect(-12 + i * 10, -100 + bob, 6, 6);
  // head
  inkShape(c, ellPts(0, -176 + bob, 34, 28, 10), shade(col, .1), { seed: seed + 5, lw: 4.5 });
  const pulse = .6 + Math.sin(t * 6) * .4;
  inkEll(c, 8, -176 + bob, 14, 14, C.white, { seed: seed + 6, lw: 3, off: 0, shade: false, n: 8 });
  c.fillStyle = s.eye || C.red; c.globalAlpha = .6 + pulse * .4; c.beginPath(); c.arc(10, -176 + bob, 8, 0, 6.3); c.fill(); c.globalAlpha = 1;
  inkLine(c, -4, -208 + bob, -8, -230 + bob, 3, C.ink, seed); c.fillStyle = C.red; c.beginPath(); c.arc(-9, -232 + bob, 5, 0, 6.3); c.fill(); c.stroke();
  c.restore();
}

// ---------- card drawing ----------
const CW = 150, CH = 210;
function cardFrameColor(d) {
  if (d.kind === 'n') return d.pwr ? C.plum : d.comp && !d.inf ? C.blue : d.arg ? C.plum : C.mustard;
  if (d.type === 'curse') return C.grey;
  return d.type === 'atk' ? C.red : d.type === 'pwr' ? C.plum : C.teal;
}

// ---------- backgrounds ----------
const BG_CACHE = {};

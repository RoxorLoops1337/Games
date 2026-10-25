// Stacking Cats: cosmetics. Purely visual hats, glasses and neckwear bought with coins (a coin sink), drawn over the cat sprite.
// Data and pure save helpers live here; `drawCosmetic(ctx, id, catId)` paints one item into the same 120x120 box the cats use
// (head centre 60,54; ears up to y 14; eyes at 46,59 and 74,59; chin y 81). One item per slot per cat.
import { TAU, INK, mix, shade, lineOf, ell, poly, fillPath, star, line } from './art_util.js';
import { CAT_BY_ID } from './cats.js';

export const SLOTS = ['head', 'face', 'neck'];
export const SLOT_NAMES = { head: 'Head', face: 'Face', neck: 'Neck' };

export const COSMETICS = [
  { id: 'bow',        slot: 'head', name: 'Ear Bow',        cost: 60,  desc: 'A little bow tucked by the ear.' },
  { id: 'flower',     slot: 'head', name: 'Daisy',          cost: 80,  desc: 'A fresh flower behind the ear.' },
  { id: 'starclip',   slot: 'head', name: 'Star Clip',      cost: 90,  desc: 'A sparkly clip for a bright cat.' },
  { id: 'partyhat',   slot: 'head', name: 'Party Hat',      cost: 150, desc: 'Every day is a birthday.' },
  { id: 'headphones', slot: 'head', name: 'Headphones',     cost: 200, desc: 'Big beats for small ears.' },
  { id: 'tophat',     slot: 'head', name: 'Top Hat',        cost: 220, desc: 'Very fancy. Very serious.' },
  { id: 'halo',       slot: 'head', name: 'Halo',           cost: 280, desc: 'A floating ring. Totally innocent.' },
  { id: 'crown',      slot: 'head', name: 'Tiny Crown',     cost: 400, desc: 'For the ruler of the tower.' },
  { id: 'glasses',    slot: 'face', name: 'Round Specs',    cost: 100, desc: 'Smart cats wear specs.' },
  { id: 'mustache',   slot: 'face', name: 'Mustache',       cost: 110, desc: 'A very distinguished curl.' },
  { id: 'sunglasses', slot: 'face', name: 'Shades',         cost: 120, desc: 'Too cool to dodge.' },
  { id: 'collar',     slot: 'neck', name: 'Bell Collar',    cost: 70,  desc: 'Jingle jingle.' },
  { id: 'bandana',    slot: 'neck', name: 'Bandana',        cost: 100, desc: 'Dotted and dashing.' },
  { id: 'bowtie',     slot: 'neck', name: 'Bow Tie',        cost: 120, desc: 'Formal wear for brawls.' },
  { id: 'scarf',      slot: 'neck', name: 'Cozy Scarf',     cost: 130, desc: 'Striped and warm.' },
  { id: 'medal',      slot: 'neck', name: "Master's Medal", cost: 0,   desc: 'Free for a cat at Mastery level 5.', mastery: 5 },
];
export const COSMETIC_BY_ID = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
export const BUYABLE = COSMETICS.filter((c) => !c.mastery);

// ---------------------------------------------------------------- save helpers (pure, no DOM)
export const emptyLook = () => ({ head: null, face: null, neck: null });
export function lookOf(save, catId) {
  const w = save && save.wardrobe && save.wardrobe[catId];
  return { head: (w && w.head) || null, face: (w && w.face) || null, neck: (w && w.neck) || null };
}
// short string that changes whenever the cat's look changes (part of the sprite cache key)
export function lookSig(save, catId) {
  const w = save && save.wardrobe && save.wardrobe[catId];
  return w ? (w.head || '') + '.' + (w.face || '') + '.' + (w.neck || '') : '';
}
export const isOwned = (save, id) => !!(save.owned && save.owned.includes(id));
// can this cat wear the item right now? masteryLv is the cat's mastery level
export function canWear(save, id, masteryLv = 1) {
  const c = COSMETIC_BY_ID[id];
  if (!c) return false;
  return c.mastery ? masteryLv >= c.mastery : isOwned(save, id);
}
export function buyCosmetic(save, id) {
  const c = COSMETIC_BY_ID[id];
  if (!c || c.mastery || isOwned(save, id) || save.kingdom.coins < c.cost) return false;
  save.kingdom.coins -= c.cost;
  (save.owned || (save.owned = [])).push(id);
  return true;
}
// wear an item (or take it off when it is already worn). Returns true when something changed.
export function toggleWear(save, catId, id, masteryLv = 1) {
  const c = COSMETIC_BY_ID[id];
  if (!c || !CAT_BY_ID[catId] || !canWear(save, id, masteryLv)) return false;
  const wd = save.wardrobe || (save.wardrobe = {});
  const w = wd[catId] || (wd[catId] = emptyLook());
  w[c.slot] = w[c.slot] === id ? null : id;
  if (!w.head && !w.face && !w.neck) delete wd[catId];
  return true;
}
// cleaning for imports: drop unknown ids, wrong slots, unowned items; masteryOf(catId) gives a level for the medal
export function cleanWardrobe(rawOwned, rawWardrobe, masteryOf = () => 1) {
  const owned = [...new Set((Array.isArray(rawOwned) ? rawOwned : []).filter((id) => COSMETIC_BY_ID[id] && !COSMETIC_BY_ID[id].mastery))];
  const wardrobe = {};
  for (const catId in rawWardrobe || {}) {
    if (!CAT_BY_ID[catId]) continue;
    const raw = rawWardrobe[catId] || {}, w = emptyLook();
    for (const slot of SLOTS) {
      const c = COSMETIC_BY_ID[raw[slot]];
      if (c && c.slot === slot && (c.mastery ? masteryOf(catId) >= c.mastery : owned.includes(c.id))) w[slot] = c.id;
    }
    if (w.head || w.face || w.neck) wardrobe[catId] = w;
  }
  return { owned, wardrobe };
}

// ---------------------------------------------------------------- drawing
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h)); if (!m) return [200, 160, 120]; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const dist = (a, b) => { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
// first colour that stands out from the cat's fur, else the one that stands out most
function pick(catId, options) {
  const d = CAT_BY_ID[catId], fur = d && d.art ? d.art.fur : '#c8a070';
  let best = options[0], bd = -1;
  for (const o of options) { const k = dist(o, fur); if (k > 95) return o; if (k > bd) { bd = k; best = o; } }
  return best;
}
const P = (fn) => { const p = new Path2D(); fn(p); return p; };
const K = (ctx, path, fill, lw = 1.1) => fillPath(ctx, path, fill, lw);
const shine = (ctx, x, y, rx, ry, rot = -0.5) => { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill(); };
const sparkle = (ctx, x, y, r) => { ctx.fillStyle = '#fff'; ctx.fill(star(x, y, r, r * 0.3, 4)); };
function stripes(ctx, path, cols, ang, step, box) {
  ctx.save(); ctx.clip(path);
  ctx.translate(box[0], box[1]); ctx.rotate(ang);
  for (let i = -20; i < 40; i++) { ctx.fillStyle = cols[((i % cols.length) + cols.length) % cols.length]; ctx.fillRect(i * step, -40, step, 160); }
  ctx.restore();
}

const DRAW = {
  bow(ctx, catId) {
    const c = pick(catId, ['#ff7aa8', '#6fb6ff', '#ffd23a', '#a47cf0']);
    ctx.save(); ctx.translate(82, 32); ctx.rotate(0.25);
    K(ctx, P((p) => { p.moveTo(0, 0); p.quadraticCurveTo(-8, -10, -15, -6); p.quadraticCurveTo(-13, 0, -15, 6); p.quadraticCurveTo(-8, 10, 0, 0); }), c);
    K(ctx, P((p) => { p.moveTo(0, 0); p.quadraticCurveTo(8, -10, 15, -6); p.quadraticCurveTo(13, 0, 15, 6); p.quadraticCurveTo(8, 10, 0, 0); }), c);
    K(ctx, ell(ctx, 0, 0, 4, 4.4), shade(c, -0.15));
    shine(ctx, -9, -3.4, 3, 1.3, -0.3);
    ctx.restore();
  },
  flower(ctx) {
    const cx = 41, cy = 33;
    K(ctx, ell(ctx, cx - 7, cy + 6, 6, 2.8, 0.6), '#7ed56f', 0.9);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; K(ctx, ell(ctx, cx + Math.cos(a) * 5.4, cy + Math.sin(a) * 5.4, 4.2, 3, a), '#fffaf2', 0.9); }
    K(ctx, ell(ctx, cx, cy, 3.4, 3.4), '#ffc83a', 0.9);
    shine(ctx, cx - 1, cy - 1, 1.2, 0.8);
  },
  starclip(ctx) {
    ctx.save(); ctx.translate(78, 36); ctx.rotate(0.3);
    K(ctx, star(0, 0, 9, 4.2, 5), '#ffd23a', 1.1);
    sparkle(ctx, -2, -2.5, 3);
    ctx.restore();
  },
  partyhat(ctx, catId) {
    const c1 = pick(catId, ['#ff6fa5', '#5ab4f0', '#7ed56f', '#ffd23a']), c2 = '#fff6d8';
    const cone = poly(ctx, [[62, 3], [45, 33], [79, 30]]);
    ctx.save();
    ctx.fillStyle = c1; ctx.fill(cone);
    ctx.clip(cone);
    ctx.fillStyle = c2;
    for (const [x, y] of [[56, 24], [66, 19], [60, 12], [70, 27], [52, 31]]) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.ellipse(55, 20, 2.4, 11, 0.45, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = lineOf(c1); ctx.lineWidth = 1.2; ctx.stroke(cone);
    K(ctx, ell(ctx, 62, 31.5, 18, 3.4, -0.07), '#fff6d8', 1);
    K(ctx, ell(ctx, 62, 3.6, 4.6, 4.6), '#ffd23a', 1);
  },
  headphones(ctx, catId) {
    const c = pick(catId, ['#6fa8ff', '#ff6fa5', '#2f2748']);
    ctx.lineCap = 'round';
    const band = (col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(30, 52); ctx.bezierCurveTo(28, 14, 92, 14, 90, 52); ctx.stroke(); };
    band(lineOf(c), 6); band(c, 4);
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(40, 27); ctx.bezierCurveTo(48, 21, 58, 20, 66, 21); ctx.stroke();
    for (const x of [28, 92]) {
      K(ctx, ell(ctx, x, 57, 7.4, 10.4), shade(c, -0.1), 1.2);
      K(ctx, ell(ctx, x + (x < 60 ? -0.6 : 0.6), 57, 4.6, 7.4), shade(c, 0.28), 0.9);
      shine(ctx, x - 1.6, 52, 1.6, 3.2, 0.1);
    }
  },
  tophat(ctx) {
    ctx.save(); ctx.translate(60, 29); ctx.rotate(-0.1);
    K(ctx, P((p) => { p.moveTo(-14, 0); p.lineTo(-13, -22); p.quadraticCurveTo(0, -24, 13, -22); p.lineTo(14, 0); p.closePath(); }), '#3a3350', 1.2);
    K(ctx, P((p) => { p.moveTo(-13.6, -7); p.lineTo(13.8, -7); p.lineTo(14, 0); p.lineTo(-14, 0); p.closePath(); }), '#e0566a', 1);
    K(ctx, ell(ctx, 0, 1, 21, 4.6), '#2d2742', 1.2);
    shine(ctx, -8, -15, 1.6, 6, 0.1);
    ctx.restore();
  },
  halo(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,230,120,.35)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(60, 13, 17, 5, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = lineOf('#ffd23a'); ctx.lineWidth = 5.4; ctx.beginPath(); ctx.ellipse(60, 13, 17, 5, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ffe36a'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.ellipse(60, 13, 17, 5, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(60, 12.2, 15, 3.6, 0, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
    ctx.restore();
  },
  crown(ctx) {
    ctx.save(); ctx.translate(60, 30); ctx.rotate(0.05);
    K(ctx, poly(ctx, [[-15, 2], [-17, -15], [-8, -7], [0, -19], [8, -7], [17, -15], [15, 2]]), '#ffc83a', 1.25);
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(-8, -6, 1.6, 5, 0.3, 0, TAU); ctx.fill();
    K(ctx, P((p) => { p.rect(-15.5, -1, 31, 5); }), '#e8962a', 1);
    for (const [x, y, c] of [[0, -22, '#ff6fa5'], [-17, -18, '#7ee0ff'], [17, -18, '#7ee0ff']]) K(ctx, ell(ctx, x, y, 2.6, 2.6), c, 0.9);
    K(ctx, ell(ctx, 0, 1.5, 2.2, 2.2), '#ff5a7a', 0.8);
    ctx.restore();
  },
  glasses(ctx) {
    const rim = '#8a5a30';
    for (const x of [46, 74]) {
      ctx.fillStyle = 'rgba(190,230,255,.22)'; ctx.beginPath(); ctx.arc(x, 59, 10.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = lineOf(rim); ctx.lineWidth = 3.6; ctx.beginPath(); ctx.arc(x, 59, 10.4, 0, TAU); ctx.stroke();
      ctx.strokeStyle = rim; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(x, 59, 10.4, 0, TAU); ctx.stroke();
      shine(ctx, x - 4, 54.5, 3.2, 1.3, -0.7);
    }
    ctx.strokeStyle = rim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(56.2, 57); ctx.quadraticCurveTo(60, 54.4, 63.8, 57); ctx.stroke();
    line(ctx, [[35.6, 58], [29, 56]], rim, 1.6); line(ctx, [[84.4, 58], [91, 56]], rim, 1.6);
  },
  mustache(ctx) {
    const c = '#4a3226';
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(60, 70.2); ctx.scale(s, 1);
      K(ctx, P((p) => { p.moveTo(0.6, -1.4); p.bezierCurveTo(5, -4.2, 11, -3, 13.4, 1.4); p.bezierCurveTo(14, 3.8, 11.6, 4.8, 10.6, 3.2); p.bezierCurveTo(9.4, 1.6, 4, 2.8, 0.6, 1.8); p.closePath(); }), c, 0.8);
      ctx.restore();
    }
    shine(ctx, 54, 68.6, 2.4, 0.8, 0.3);
  },
  sunglasses(ctx) {
    const rim = '#26203a';
    const lens = (x, sx) => P((p) => { p.moveTo(x - 12 * sx, 52.6); p.lineTo(x + 11.4 * sx, 52.6); p.quadraticCurveTo(x + 12.4 * sx, 62, x + 5 * sx, 66); p.quadraticCurveTo(x - 6 * sx, 68, x - 11.6 * sx, 61); p.closePath(); });
    for (const [x, sx] of [[46, 1], [74, -1]]) {
      const l = lens(x, sx);
      ctx.fillStyle = '#2a2548'; ctx.fill(l);
      ctx.save(); ctx.clip(l);
      const g = ctx.createLinearGradient(x - 10, 52, x + 10, 68); g.addColorStop(0, 'rgba(120,170,255,.55)'); g.addColorStop(0.5, 'rgba(60,40,120,0)'); g.addColorStop(1, 'rgba(255,120,200,.25)');
      ctx.fillStyle = g; ctx.fillRect(x - 14, 50, 28, 20);
      ctx.restore();
      ctx.strokeStyle = rim; ctx.lineWidth = 1.8; ctx.stroke(l);
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 7 * sx, 56.4); ctx.lineTo(x - 3 * sx, 55.6); ctx.stroke();
    }
    ctx.strokeStyle = rim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(56.4, 54.6); ctx.quadraticCurveTo(60, 52.4, 63.6, 54.6); ctx.stroke();
    line(ctx, [[34, 55], [28, 53]], rim, 1.8); line(ctx, [[86, 55], [92, 53]], rim, 1.8);
  },
  collar(ctx, catId) {
    const c = pick(catId, ['#e0566a', '#4aa8e8', '#8a5ae0']);
    const band = P((p) => { p.moveTo(38, 77.4); p.quadraticCurveTo(60, 90, 82, 77.4); p.lineTo(82.4, 82.6); p.quadraticCurveTo(60, 95.6, 37.6, 82.6); p.closePath(); });
    K(ctx, band, c, 1.1);
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.ellipse(48, 81, 6, 1.2, 0.4, 0, TAU); ctx.fill();
    K(ctx, ell(ctx, 60, 92.4, 5.2, 5.2), '#ffc83a', 1.1);
    line(ctx, [[55.2, 92.8], [64.8, 92.8]], lineOf('#ffc83a'), 0.9);
    ctx.fillStyle = lineOf('#ffc83a'); ctx.beginPath(); ctx.arc(60, 95, 0.9, 0, TAU); ctx.fill();
    shine(ctx, 58.2, 90.2, 1.5, 1, -0.6);
  },
  bandana(ctx, catId) {
    const c = pick(catId, ['#e0566a', '#4aa8e8', '#7ed56f', '#ffb13a']);
    const path = P((p) => { p.moveTo(36, 76.6); p.quadraticCurveTo(60, 90, 84, 76.6); p.quadraticCurveTo(80, 92, 60, 103); p.quadraticCurveTo(40, 92, 36, 76.6); p.closePath(); });
    ctx.fillStyle = c; ctx.fill(path);
    ctx.save(); ctx.clip(path);
    ctx.fillStyle = '#fff6e0';
    for (const [x, y] of [[48, 84], [60, 90], [72, 84], [54, 96], [66, 96], [60, 80]]) { ctx.beginPath(); ctx.arc(x, y, 1.7, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(70,40,120,.18)'; ctx.beginPath(); ctx.ellipse(66, 96, 22, 11, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = lineOf(c); ctx.lineWidth = 1.1; ctx.stroke(path);
  },
  bowtie(ctx, catId) {
    const c = pick(catId, ['#8a5ae0', '#e0566a', '#4aa8e8', '#2f2748']);
    ctx.save(); ctx.translate(60, 87);
    K(ctx, poly(ctx, [[0, 0], [-13, -7], [-12, 8]]), c, 1.1);
    K(ctx, poly(ctx, [[0, 0], [13, -7], [12, 8]]), c, 1.1);
    ctx.fillStyle = '#fff6e0';
    for (const [x, y] of [[-8, 0], [8, 0]]) { ctx.beginPath(); ctx.arc(x, y, 1.3, 0, TAU); ctx.fill(); }
    K(ctx, ell(ctx, 0, 0, 3.6, 4.4), shade(c, -0.2), 1);
    ctx.restore();
  },
  scarf(ctx, catId) {
    const c1 = pick(catId, ['#e0566a', '#4aa8e8', '#7ed56f']), c2 = '#fff3d6';
    const wrap = P((p) => { p.moveTo(35, 76.6); p.quadraticCurveTo(60, 90, 85, 76.6); p.lineTo(85.4, 84.4); p.quadraticCurveTo(60, 98, 34.6, 84.4); p.closePath(); });
    ctx.fillStyle = c1; ctx.fill(wrap);
    ctx.save(); ctx.clip(wrap); ctx.fillStyle = c2;
    for (let x = 38; x < 90; x += 10) ctx.fillRect(x, 70, 4.5, 34);
    ctx.restore();
    ctx.strokeStyle = lineOf(c1); ctx.lineWidth = 1.2; ctx.stroke(wrap);
    const tail = P((p) => { p.moveTo(70, 88); p.lineTo(82, 86); p.lineTo(86, 106); p.lineTo(76, 107); p.closePath(); });
    ctx.fillStyle = c1; ctx.fill(tail);
    ctx.save(); ctx.clip(tail); ctx.fillStyle = c2;
    for (let y = 92; y < 110; y += 8) { ctx.beginPath(); ctx.moveTo(66, y); ctx.lineTo(90, y - 2); ctx.lineTo(90, y + 2); ctx.lineTo(66, y + 4); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = lineOf(c1); ctx.lineWidth = 1.2; ctx.stroke(tail);
  },
  medal(ctx) {
    K(ctx, poly(ctx, [[50, 77.6], [58, 86], [62, 86], [70, 77.6], [66, 77], [60, 82], [54, 77]]), '#4aa8e8', 1);
    K(ctx, poly(ctx, [[56, 86], [64, 86], [67, 97], [60, 94], [53, 97]]), '#e0566a', 1);
    K(ctx, ell(ctx, 60, 97, 7.2, 7.2), '#ffc83a', 1.2);
    ctx.fillStyle = '#e8962a'; ctx.fill(star(60, 97, 4.6, 1.9, 5));
    sparkle(ctx, 57.4, 94.2, 2.2);
  },
};

export function drawCosmetic(ctx, id, catId) {
  const fn = DRAW[id];
  if (!fn) return false;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  fn(ctx, catId);
  ctx.restore();
  return true;
}
// a whole outfit in a fixed layering order: neck, face, head
export function drawLook(ctx, look, catId) {
  for (const slot of ['neck', 'face', 'head']) if (look[slot]) drawCosmetic(ctx, look[slot], catId);
}

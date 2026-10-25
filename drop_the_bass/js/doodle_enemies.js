// doodle_enemies.js: the Static and the five bosses as crayon notebook doodles (the DOODLE style). Same API as art_enemies.js:
//   drawEnemy(ctx, type, x, y, o)   o: { t, ang, hp (0..1), hit (0..1), slow, stun, burn, mark, shield (0..1), affix, scale, rage, alpha, id }
//   drawBoss(ctx, id, x, y, o)      o: { t, ang, hp (0..1), hit, gated, phase, scale, alpha }
// Every creature body is baked once into 3 "boil" frames (doodle_kit sprite) keyed by type and affix; per frame we only blit, bob, squash,
// move the googly pupils and draw a few cheap overlays. Fully seeded and time-driven (no platform randomness or clock); safe in node with a mock ctx.
import { ENEMIES, BOSSES, AFFIXES } from './data_core.js';
import { C, Pen, arc, rect, star, sprite, blit, setScale, getScale, clamp } from './doodle_kit.js';

const TAU = Math.PI * 2;
const INK = C.ink, CY = '#19d3ff', MG = '#ff2fb9', PALE = '#eeeaf6';
export function setArtScale(n) { setScale(n); }

const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const shift = (p, dx, dy) => { const o = p.slice(); for (let i = 0; i < o.length; i += 2) { o[i] += dx; o[i + 1] += dy; } return o; };

// ---------------------------------------------------------------- small doodle parts (all take a Pen)
function eyeWhite(pen, e, brow) {   // the googly eye white; pupils are drawn live
  pen.dot(e.x, e.y, e.r, '#fff');
  pen.ln(arc(e.x, e.y, e.r, e.r, 0, 360, 12), INK, Math.max(2, e.r * 0.2), true, 0.7);
  if (brow) { const s = e.x < 0 ? 1 : -1; pen.ln([e.x - s * e.r * 1.2, e.y - e.r * 1.55, e.x + s * e.r * 1.1, e.y - e.r * 0.85], INK, Math.max(2.6, e.r * 0.36), false, 0.6); }
}
function crown(pen, x, y, w, col = C.gold) {
  const h = w * 0.55, p = [x - w / 2, y, x - w / 2, y - h * 0.7, x - w / 4, y - h * 0.3, x, y - h, x + w / 4, y - h * 0.3, x + w / 2, y - h * 0.7, x + w / 2, y];
  pen.shp(p, col, INK, 3, { gap: 4, f2: '#fff6c0' });
  pen.dot(x, y - h - 2, w * 0.07, C.red);
}
function sparkle(pen, x, y, r, col) { pen.ln([x - r, y, x + r, y], col, 2.4, false, 0.4); pen.ln([x, y - r, x, y + r], col, 2.4, false, 0.4); }
function notes(pen, x, y, s, col) { pen.dot(x, y, s * 0.28, col); pen.ln([x + s * 0.26, y, x + s * 0.26, y - s * 0.9, x + s * 0.7, y - s * 0.7], col, 2.2, false, 0.4); }
function mouthSmile(pen, x, y, w, up = 1) { pen.ln(arc(x, y - up * w * 0.15, w / 2, w * 0.35, up > 0 ? 20 : 200, up > 0 ? 160 : 340, 6), INK, 2.8, false, 0.7); }
function fur(pen, outline, col, f2) { pen.shp(outline, col, INK, 3.6, { gap: 5, f2: f2 || PALE }); }
// cyan and magenta felt-tip offsets behind a body outline (the glitch)
function glitchLines(pen, outline, k = 1) { pen.ln(shift(outline, 3.2 * k, -1.4 * k), CY, 2.6, true, 1.0); pen.ln(shift(outline, -3.2 * k, 1.6 * k), MG, 2.6, true, 1.0); }

// ---------------------------------------------------------------- enemy bodies: geo(pen, r) -> { outline, eyes[], ... } ; paint(pen, r, geo, def)
const EYES2 = (dx, y, er) => [{ x: -dx, y, r: er }, { x: dx, y, r: er }];
const BODY = {
  fuzz: {
    geo: (pen, r) => ({ outline: pen.spiky(r, r * 0.95, 12, 0.18), eyes: EYES2(r * 0.38, -r * 0.12, r * 0.34) }),
    paint(pen, r, g, def) {
      glitchLines(pen, g.outline); fur(pen, g.outline, def.color);
      for (const e of g.eyes) eyeWhite(pen, e);
      mouthSmile(pen, 0, r * 0.5, r * 0.5, -1);
      pen.ln([-r * 0.25, -r * 1.0, -r * 0.1, -r * 1.35], INK, 2.6, false, 0.5); pen.ln([r * 0.1, -r * 1.02, r * 0.3, -r * 1.3], INK, 2.6, false, 0.5);   // tufts
    },
  },
  zip: {   // points along +x, the body is rotated to the heading
    geo: (pen, r) => ({ outline: pen.spiky(r * 1.25, r * 0.72, 9, 0.14), eyes: [{ x: r * 0.4, y: -r * 0.3, r: r * 0.36 }, { x: r * 0.45, y: r * 0.28, r: r * 0.36 }] }),
    paint(pen, r, g, def) {
      for (let i = -1; i <= 1; i++) pen.ln([-r * 1.5, i * r * 0.45, -r * 2.5 - Math.abs(i) * r * 0.3, i * r * 0.45], INK, 2.4, false, 0.6);   // speed lines
      glitchLines(pen, g.outline); fur(pen, g.outline, def.color);
      for (const e of g.eyes) eyeWhite(pen, e);
      pen.ln([r * 0.1, -r * 0.08, r * 0.45, r * 0.08, r * 0.8, -r * 0.05], INK, 2.6, false, 0.5);
      pen.ln([-r * 0.2, -r * 0.55, r * 0.0, -r * 0.1, -r * 0.3, 0.05 * r, -r * 0.05, r * 0.5], C.yellow, 3, false, 0.4);   // zig-zag bolt on the side
    },
  },
  brick: {
    geo: (pen, r) => ({ outline: rect(-r * 0.98, -r * 0.82, r * 1.96, r * 1.64, 5), eyes: EYES2(r * 0.4, -r * 0.14, r * 0.25) }),
    paint(pen, r, g, def) {
      glitchLines(pen, g.outline); pen.shp(g.outline, def.color, INK, 4, { gap: 5.5, f2: '#cfc9de' });
      for (let i = 1; i < 4; i++) pen.ln([-r * 0.98, -r * 0.82 + i * r * 0.41, r * 0.98, -r * 0.82 + i * r * 0.41], INK, 2, false, 0.6);
      for (let row = 0; row < 4; row++) for (let k = 0; k < 2; k++) { const x = -r * 0.5 + k * r * 1.0 + (row % 2 ? r * 0.5 : 0); pen.ln([x, -r * 0.82 + row * r * 0.41, x, -r * 0.82 + (row + 1) * r * 0.41], INK, 2, false, 0.5); }
      for (const e of g.eyes) eyeWhite(pen, e, true);
      pen.ln([-r * 0.3, r * 0.42, -r * 0.1, r * 0.34, r * 0.1, r * 0.44, r * 0.3, r * 0.34], INK, 3, false, 0.6);
    },
  },
  echo: {
    geo: (pen, r) => ({ outline: pen.spiky(r, r * 0.95, 11, 0.17), eyes: EYES2(r * 0.38, -r * 0.1, r * 0.32) }),
    paint(pen, r, g, def) {
      for (const s of [-1, 1]) pen.ln(shift(g.outline, s * r * 0.5, -s * r * 0.08), '#a98be6', 2.4, true, 1.2, [10, 8]);   // ghost copies
      glitchLines(pen, g.outline); fur(pen, g.outline, def.color, '#eadfff');
      for (const e of g.eyes) eyeWhite(pen, e);
      pen.ln(arc(0, r * 0.45, r * 0.22, r * 0.18, 0, 360, 10), INK, 2.6, true, 0.5);
      for (const s of [-1, 1]) for (let i = 0; i < 2; i++) pen.ln(arc(s * r * 1.15, 0, r * (0.25 + i * 0.22), r * (0.45 + i * 0.3), s > 0 ? -50 : 130, s > 0 ? 50 : 230, 5), '#8e6ad8', 2.2, false, 0.5);   // echo arcs
    },
  },
  mini: {
    geo: (pen, r) => ({ outline: pen.spiky(r, r * 0.95, 9, 0.2), eyes: EYES2(r * 0.34, -r * 0.05, r * 0.4) }),
    paint(pen, r, g, def) { glitchLines(pen, g.outline, 0.6); fur(pen, g.outline, def.color, '#fff'); for (const e of g.eyes) eyeWhite(pen, e); pen.ln([-r * 0.2, r * 0.55, r * 0.2, r * 0.55], INK, 2.2, false, 0.4); },
  },
  leech: {
    geo: (pen, r) => ({ outline: pen.spiky(r, r * 0.95, 12, 0.15), eyes: EYES2(r * 0.38, -r * 0.05, r * 0.3) }),
    paint(pen, r, g, def) {
      pen.ln(arc(0, -r * 1.25, r * 0.6, r * 0.2, 0, 360, 14), C.gold, 3.4, true, 0.8);   // halo
      glitchLines(pen, g.outline); fur(pen, g.outline, def.color, '#e6ffe0');
      for (const e of g.eyes) eyeWhite(pen, e);
      pen.ln(arc(0, r * 0.5, r * 0.18, r * 0.2, 0, 360, 8), INK, 2.8, true, 0.4);   // humming mouth
      const pl = [-r * 0.1, -r * 0.7, r * 0.1, -r * 0.7, r * 0.1, -r * 0.5, r * 0.3, -r * 0.5, r * 0.3, -r * 0.3, r * 0.1, -r * 0.3, r * 0.1, -r * 0.1, -r * 0.1, -r * 0.1, -r * 0.1, -r * 0.3, -r * 0.3, -r * 0.3, -r * 0.3, -r * 0.5, -r * 0.1, -r * 0.5];
      pen.shp(shift(pl, r * 0.0, -r * 0.35).map((v, i) => (i % 2 ? v : v)), '#fff', C.red, 2.4, { gap: 3 });
      notes(pen, -r * 1.3, -r * 0.4, r * 0.7, C.green); notes(pen, r * 1.25, -r * 0.8, r * 0.6, C.teal);
    },
  },
  drone: {
    geo: (pen, r) => ({ outline: pen.blob(0, 0, r * 0.95, r * 0.85, 14, 0.06), eyes: EYES2(r * 0.34, -r * 0.05, r * 0.3) }),
    paint(pen, r, g, def) {
      for (const s of [-1, 1]) { pen.ln([s * r * 0.5, -r * 0.6, s * r * 1.1, -r * 0.85], INK, 3, false, 0.5); pen.dot(s * r * 1.15, -r * 0.88, r * 0.12, INK); }
      glitchLines(pen, g.outline, 0.8); fur(pen, g.outline, def.color, '#ffe0f0');
      for (const e of g.eyes) eyeWhite(pen, e);
      pen.ln([r * 0.0, r * 0.82, r * 0.0, r * 1.15], INK, 2.4, false, 0.4); pen.dot(0, r * 1.2, r * 0.1, C.red);
      mouthSmile(pen, 0, r * 0.4, r * 0.5, 1);
    },
  },
  gate: {
    geo: (pen, r) => ({ outline: pen.spiky(r, r * 0.95, 12, 0.14), eyes: EYES2(r * 0.36, r * 0.02, r * 0.28) }),
    paint(pen, r, g, def) {
      glitchLines(pen, g.outline); fur(pen, g.outline, def.color, '#fff0b0');
      for (const e of g.eyes) eyeWhite(pen, e);
      const hat = [...arc(0, -r * 0.55, r * 0.85, r * 0.7, 180, 360, 10), r * 0.95, -r * 0.5, -r * 0.95, -r * 0.5];   // hard hat with stripes
      pen.shp(hat, C.orange, INK, 3.2, { gap: 4.5 });
      pen.ln([-r * 0.2, -r * 1.2, -r * 0.2, -r * 0.55], INK, 2.4, false, 0.4); pen.ln([r * 0.2, -r * 1.2, r * 0.2, -r * 0.55], INK, 2.4, false, 0.4);
      pen.ln([-r * 0.3, r * 0.5, r * 0.3, r * 0.5], INK, 2.8, false, 0.5);
    },
  },
  squeal: {
    geo: (pen, r) => ({ outline: pen.spiky(r, r * 0.95, 13, 0.18), eyes: EYES2(r * 0.4, -r * 0.38, r * 0.3) }),
    paint(pen, r, g, def) {
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const k = 1.25 + i * 0.4; pen.ln(arc(s * r * 0.3, 0, r * k, r * k * 0.8, s > 0 ? -35 : 145, s > 0 ? 35 : 215, 6), C.red, 2.6, false, 0.8); }   // screech arcs
      glitchLines(pen, g.outline); fur(pen, g.outline, def.color, '#ffd0d0');
      for (const e of g.eyes) eyeWhite(pen, e, true);
      const m = pen.blob(0, r * 0.38, r * 0.5, r * 0.4, 12, 0.05);
      pen.shp(m, '#3a1020', INK, 3, { gap: 3 }); pen.ln([-r * 0.3, r * 0.16, -r * 0.1, r * 0.3, r * 0.1, r * 0.16, r * 0.3, r * 0.3], '#fff', 3, false, 0.4);
    },
  },
  mute: {   // a ghost: dome with a wavy hem, zipper mouth
    geo: (pen, r) => {
      const o = arc(0, -r * 0.1, r * 0.95, r * 0.95, 180, 360, 12);
      for (let i = 0; i <= 6; i++) o.push(r * 0.95 - i * r * 0.317, r * 0.85 + (i % 2 ? -r * 0.2 : r * 0.1));
      return { outline: o, eyes: EYES2(r * 0.36, -r * 0.2, r * 0.3) };
    },
    paint(pen, r, g, def) {
      glitchLines(pen, g.outline, 0.8); fur(pen, g.outline, def.color, '#e6eeff');
      for (const e of g.eyes) eyeWhite(pen, e);
      pen.ln([-r * 0.45, r * 0.35, r * 0.45, r * 0.35], INK, 3, false, 0.4);
      for (let i = -3; i <= 3; i++) pen.ln([i * r * 0.14, r * 0.28, i * r * 0.14, r * 0.42], INK, 2, false, 0.2);
      sparkle(pen, -r * 1.2, -r * 0.6, r * 0.2, '#fff'); sparkle(pen, r * 1.15, r * 0.1, r * 0.16, C.sky);
    },
  },
  rager: {
    geo: (pen, r) => ({ outline: pen.spiky(r, r * 0.95, 11, 0.2), eyes: EYES2(r * 0.38, -r * 0.1, r * 0.3) }),
    paint(pen, r, g, def) {
      const fl = [-r * 0.5, -r * 0.85, -r * 0.3, -r * 1.5, -r * 0.1, -r * 1.0, r * 0.1, -r * 1.7, r * 0.3, -r * 1.0, r * 0.55, -r * 1.4, r * 0.5, -r * 0.8];   // flame crest
      pen.shp(fl, C.yellow, C.red, 2.8, { gap: 3.5 });
      glitchLines(pen, g.outline); fur(pen, g.outline, def.color, '#ffe2c0');
      for (const e of g.eyes) eyeWhite(pen, e, true);
      pen.ln([-r * 0.35, r * 0.45, -r * 0.15, r * 0.35, r * 0.15, r * 0.35, r * 0.35, r * 0.45], INK, 3, false, 0.5);
      pen.ln([-r * 0.2, r * 0.36, -r * 0.14, r * 0.6], '#fff', 2.4, false, 0.2); pen.ln([r * 0.2, r * 0.36, r * 0.14, r * 0.6], '#fff', 2.4, false, 0.2);   // fangs
      for (const s of [-1, 1]) { pen.ln(arc(s * r * 1.12, -r * 0.4, r * 0.2, r * 0.2, 0, 360, 8), '#fff', 3, true, 0.8); }   // steam
    },
  },
};
const ROT_BODY = { zip: true };

// ---------------------------------------------------------------- affixes (extra doodles baked into the body sprite)
function affixPaint(pen, r, aff) {
  switch (aff) {
    case 'armored': pen.shp([-r * 0.95, -r * 0.55, -r * 0.55, -r * 1.0, r * 0.55, -r * 1.0, r * 0.95, -r * 0.55, r * 0.7, -r * 0.4, -r * 0.7, -r * 0.4], '#aab4d0', INK, 3, { gap: 4, f2: '#fff' }); pen.dot(-r * 0.55, -r * 0.7, 2.6, INK); pen.dot(r * 0.55, -r * 0.7, 2.6, INK); break;
    case 'giant': for (const s of [-1, 1]) pen.shp([s * r * 0.45, -r * 0.8, s * r * 0.7, -r * 1.5, s * r * 0.95, -r * 0.7], C.orange, INK, 3, { gap: 4 }); break;
    case 'golden': crown(pen, 0, -r * 0.98, r * 1.0); sparkle(pen, -r * 1.1, -r * 0.3, r * 0.22, C.gold); sparkle(pen, r * 1.05, r * 0.4, r * 0.18, C.gold); break;
    case 'regen': pen.shp([0, -r * 0.95, -r * 0.45, -r * 1.35, -r * 0.1, -r * 1.55], C.green, INK, 2.6, { gap: 3 }); pen.shp([0, -r * 0.95, r * 0.45, -r * 1.3, r * 0.1, -r * 1.5], C.lime, INK, 2.6, { gap: 3 }); break;
    case 'swift': pen.ln([-r * 0.9, -r * 0.2, -r * 1.5, -r * 0.5, -r * 1.2, -r * 0.1, -r * 1.7, -r * 0.2], C.cyan, 3, false, 0.5); pen.ln([-r * 0.9, r * 0.3, -r * 1.5, r * 0.15], C.cyan, 3, false, 0.5); break;
    default: break;
  }
}
const SBOX = (r) => Math.ceil(r * 3.6);
function bodySprite(type, aff) {
  const def = ENEMIES[type], r = def.r, b = BODY[type], S = SBOX(r);
  return sprite('en|' + type + '|' + (aff || ''), S, S, (pen) => {
    const col = aff === 'golden' ? '#ffd44d' : def.color;
    const g = b.geo(pen, r); b.paint(pen, r, g, aff === 'golden' ? Object.assign({}, def, { color: col }) : def);
    if (aff) affixPaint(pen, r, aff);
  }, { seed: 3 + (hashStr(type) % 97) });
}
function flashSprite(type, color = '#fff') {
  const def = ENEMIES[type], r = def.r, S = SBOX(r);
  return sprite('enf|' + type + '|' + color, S, S, (pen) => { const g = BODY[type].geo(pen, r); pen.hatch(g.outline, color, 4.5, -0.7, 0.95); }, { seed: 5 });
}

// ---------------------------------------------------------------- status doodles (baked per radius)
function slowSprite(r) {
  const S = Math.ceil(r * 3.4);
  return sprite('en|slow|' + r, S, S, (pen) => {
    pen.ln(arc(0, 0, r * 1.2, r * 1.15, 0, 360, 16), '#5aa8ff', 3, true, 1.2, [9, 7]);
    const fx = 0, fy = -r * 1.55, q = r * 0.34;   // a snowflake scribble
    for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; pen.ln([fx - Math.cos(a) * q, fy - Math.sin(a) * q, fx + Math.cos(a) * q, fy + Math.sin(a) * q], C.blue, 2.8, false, 0.3); }
  }, { seed: 11 });
}
function burnSprite(r) { const S = Math.ceil(r * 1.6); return sprite('en|burn|' + r, S, S, (pen) => { const p = [-S * 0.28, S * 0.4, -S * 0.3, 0, -S * 0.05, S * 0.15, 0, -S * 0.4, S * 0.15, 0.0, S * 0.3, S * 0.05, S * 0.28, S * 0.4]; pen.shp(p, C.orange, C.red, 2.6, { gap: 3.2, f2: C.yellow }); }, { seed: 13 }); }
function markSprite(r) {
  const S = Math.ceil(r * 3.8);
  return sprite('en|mark|' + r, S, S, (pen) => { pen.ln(arc(0, 0, r * 1.5, r * 1.5, 20, 340, 18), C.red, 3.2, false, 1); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; pen.ln([Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15, Math.cos(a) * r * 1.8, Math.sin(a) * r * 1.8], C.red, 3.2, false, 0.4); } }, { seed: 17 });
}
function shieldSprite(r) {
  const S = Math.ceil(r * 3.9);
  return sprite('en|shield|' + r, S, S, (pen) => { const o = arc(0, 0, r * 1.62, r * 1.62, 0, 360, 6 * 4); pen.shp(o.filter((v, i) => true), '#bfe8ff', '#3a8fe0', 3.2, { gap: 7, alpha: 0.28 }); pen.ln([-r * 0.9, -r * 0.9, -r * 0.5, -r * 1.35], '#fff', 3.4, false, 0.3); }, { seed: 19 });
}
function starPoly(x, y, r) { return star(x, y, r, 0.45, 0, 5); }

// ---------------------------------------------------------------- the public enemy draw
const sat = (v) => clamp(v, 0, 1);
export function drawEnemy(ctx, type, x, y, o) {
  const def = ENEMIES[type], b = BODY[type];
  if (!def || !b) return;
  o = o || {};
  const t = o.t || 0, r = def.r, sc = o.scale == null ? 1 : o.scale;
  const hs = (hashStr(type + (o.id || '')) % 628) / 100;
  const aff = o.affix && AFFIXES[o.affix] ? o.affix : null;
  const ang = o.ang || 0;
  const fl = !!def.flying, ghost = type === 'mute';
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  ctx.translate(x, y);
  const hop = fl ? 0 : Math.abs(Math.sin(t * 6 + hs));
  const bob = fl ? Math.sin(t * 4 + hs) * 3 - 5 : ghost ? Math.sin(t * 2.4 + hs) * 3 - 4 : -hop * 2.4;
  const wob = o.stun ? 0 : Math.sin(t * 8 + hs);
  const sx = sc * (1 + wob * 0.05 + hop * 0.03), sy = sc * (1 - wob * 0.05 - hop * 0.03);
  // scribbled shadow on the page
  const lift = fl ? r * 0.9 : ghost ? r * 0.6 : hop * 3;
  ctx.save(); ctx.globalAlpha *= clamp(0.34 - lift * 0.01, 0.12, 0.34); ctx.fillStyle = '#4a4258';
  ctx.beginPath(); ctx.ellipse(0, (fl ? r * 1.6 + 8 : r * 0.92) * sc, r * 1.1 * sc, r * 0.32 * sc, 0, 0, TAU); ctx.fill(); ctx.restore();
  // swift: speed ticks behind the heading
  if (aff === 'swift') { ctx.save(); ctx.strokeStyle = CY; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.globalAlpha *= 0.8; for (let i = -1; i <= 1; i++) { const px = -Math.sin(ang) * i * r * 0.5, py = Math.cos(ang) * i * r * 0.5; ctx.beginPath(); ctx.moveTo(-Math.cos(ang) * r * 1.5 + px, -Math.sin(ang) * r * 1.5 + py + bob); ctx.lineTo(-Math.cos(ang) * r * 2.4 + px, -Math.sin(ang) * r * 2.4 + py + bob); ctx.stroke(); } ctx.restore(); }
  // body
  const body = bodySprite(type, aff);
  ctx.save(); ctx.translate(0, bob * sc);
  if (ghost) { ctx.globalAlpha *= 0.88; ctx.transform(1, 0, Math.sin(t * 2 + hs) * 0.07, 1, 0, 0); }
  if (ROT_BODY[type]) ctx.rotate(ang);
  ctx.save(); ctx.scale(sx, sy); blit(ctx, body, 0, 0, t, { phase: hs }); ctx.restore();
  if (o.slow) { ctx.save(); ctx.globalAlpha *= 0.4; ctx.scale(sx, sy); blit(ctx, flashSprite(type, '#5aa8ff'), 0, 0, t, { phase: hs }); ctx.restore(); }
  if (o.rage) { ctx.save(); ctx.globalAlpha *= 0.3 + 0.12 * Math.sin(t * 14); ctx.scale(sx, sy); blit(ctx, flashSprite(type, '#ff4a2a'), 0, 0, t, { phase: hs }); ctx.restore(); }
  ctx.restore();
  // moving parts and the live googly pupils
  ctx.save(); ctx.scale(sc, sc); ctx.translate(0, bob);
  if (type === 'drone') {   // spinning rotors
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const s of [-1, 1]) { const a = t * 30 * s; ctx.beginPath(); ctx.moveTo(s * r * 1.15 + Math.cos(a) * r * 0.5, -r * 0.88 + Math.sin(a) * r * 0.14); ctx.lineTo(s * r * 1.15 - Math.cos(a) * r * 0.5, -r * 0.88 - Math.sin(a) * r * 0.14); ctx.stroke(); }
  }
  const eyes = BODY_EYES(type, r);
  const blink = ((t * 0.9 + hs) % 3.4) < 0.1;
  const jx = Math.sin(t * 9 + hs) * 0.18;
  const lookx = Math.cos(ang) * (ROT_BODY[type] ? 0.0 : 1), looky = Math.sin(ang) * (ROT_BODY[type] ? 0.0 : 0.6) + 0.3;
  ctx.save(); if (ROT_BODY[type]) ctx.rotate(ang);
  for (let i = 0; i < eyes.length; i++) {
    const e = eyes[i];
    if (blink && !o.stun) { ctx.fillStyle = def.color; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.98, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(e.x - e.r, e.y); ctx.lineTo(e.x + e.r, e.y); ctx.stroke(); continue; }
    ctx.fillStyle = INK; ctx.beginPath();
    if (o.stun) { ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(e.x - e.r * 0.5, e.y - e.r * 0.5); ctx.lineTo(e.x + e.r * 0.5, e.y + e.r * 0.5); ctx.moveTo(e.x + e.r * 0.5, e.y - e.r * 0.5); ctx.lineTo(e.x - e.r * 0.5, e.y + e.r * 0.5); ctx.stroke(); continue; }
    const px = e.x + (lookx + (i ? -jx : jx)) * e.r * 0.34, py = e.y + looky * e.r * 0.34;
    ctx.arc(px, py, e.r * 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px - e.r * 0.14, py - e.r * 0.16, e.r * 0.15, 0, TAU); ctx.fill();
  }
  if (o.rage && !(BODY_BROWS[type])) { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'round'; for (const e of eyes) { const s = e.x < 0 ? 1 : -1; ctx.beginPath(); ctx.moveTo(e.x - s * e.r * 1.2, e.y - e.r * 1.5); ctx.lineTo(e.x + s * e.r * 1.1, e.y - e.r * 0.8); ctx.stroke(); } }
  ctx.restore();
  // statuses
  if (o.slow) blit(ctx, slowSprite(r), 0, 0, t, { phase: hs });
  if (o.burn) for (let i = 0; i < 3; i++) { const k = (t * 1.5 + i * 0.33) % 1; blit(ctx, burnSprite(r), (i - 1) * r * 0.7, -r * 0.9 - k * r * 0.8, t, { scale: 0.7 * (1 - k * 0.4), alpha: 1 - k * 0.6 }); }
  if (o.mark) { ctx.save(); ctx.rotate(t * 1.6); blit(ctx, markSprite(r), 0, 0, t); ctx.restore(); }
  if (o.shield > 0) { const s = sat(o.shield); ctx.save(); ctx.globalAlpha *= 0.4 + 0.6 * s; blit(ctx, shieldSprite(r), 0, 0, t, { phase: hs }); ctx.restore(); ctx.save(); ctx.strokeStyle = '#3a8fe0'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, r * 1.62, -Math.PI / 2, -Math.PI / 2 + TAU * s); ctx.stroke(); ctx.restore(); }
  if (o.stun) for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.094; const sp = starPoly(Math.cos(a) * r * 0.85, -r * 1.35 + Math.sin(a) * 3.4, 5); ctx.beginPath(); ctx.moveTo(sp[0], sp[1]); for (let k = 2; k < sp.length; k += 2) ctx.lineTo(sp[k], sp[k + 1]); ctx.closePath(); ctx.fillStyle = C.yellow; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke(); }
  if (aff === 'regen') for (let i = 0; i < 3; i++) { const k = (t * 1.2 + i / 3) % 1, px = (i - 1) * r * 0.55, py = -r * 1.2 - k * r * 0.9; ctx.save(); ctx.globalAlpha *= 1 - k; ctx.strokeStyle = C.green; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px - 3, py); ctx.lineTo(px + 3, py); ctx.moveTo(px, py - 3); ctx.lineTo(px, py + 3); ctx.stroke(); ctx.restore(); }
  if (aff === 'golden') for (let i = 0; i < 3; i++) { const a = t * 2.4 + i * 2.094 + hs, rad = r * (1.2 + 0.1 * Math.sin(t * 5 + i)); ctx.save(); ctx.strokeStyle = C.gold; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; const px = Math.cos(a) * rad, py = Math.sin(a) * rad * 0.9, q = 3 + 1.5 * Math.sin(t * 7 + i); ctx.beginPath(); ctx.moveTo(px - q, py); ctx.lineTo(px + q, py); ctx.moveTo(px, py - q); ctx.lineTo(px, py + q); ctx.stroke(); ctx.restore(); }
  ctx.restore();
  // hit: a white crayon scribble over the body
  if ((o.hit || 0) > 0) { ctx.save(); ctx.globalAlpha *= clamp(o.hit * 0.85, 0, 0.85); ctx.translate(0, bob * sc); if (ROT_BODY[type]) ctx.rotate(ang); ctx.scale(sx, sy); blit(ctx, flashSprite(type), 0, 0, t, { phase: hs }); ctx.restore(); }
  if (o.hp != null && o.hp < 0.999) hpBar(ctx, 0, -r * 1.35 * sc - 9, r * 1.7 * sc + 6, o.hp);
  ctx.restore();
}
const BODY_BROWS = { brick: true, squeal: true, rager: true };
const EYE_CACHE = new Map();
function BODY_EYES(type, r) {   // eye geometry is deterministic and does not need a pen's randomness
  const k = type; let e = EYE_CACHE.get(k);
  if (!e) { e = BODY[type].geo(new Pen(null, 1, 1), r).eyes; EYE_CACHE.set(k, e); }
  return e;
}

// a doodled health bar, only drawn when damaged: a scribbled box and a crayon fill
function hpBar(ctx, cx, y, w, f) {
  f = sat(f); const h = 5, x = cx - w / 2; w = Math.min(w, 56);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = '#fbf6e6'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = f > 0.5 ? C.green : f > 0.25 ? C.orange : C.red; ctx.globalAlpha = 0.95; ctx.fillRect(x + 1, y + 1, Math.max(2, (w - 2) * f), h - 2);
  ctx.globalAlpha = 1; ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x - 1, y + 0.5); ctx.lineTo(x + w + 1, y - 0.5); ctx.lineTo(x + w, y + h + 0.5); ctx.lineTo(x, y + h - 0.5); ctx.closePath(); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- bosses: giant doodles with crowns and angry brows
// BOSS[id](pen, r, st) paints a baked body (st: { phase, gated }) and returns its eyes (pupils are drawn live)
function bossEyes(id, r, st) {
  const mk = (dx, y, er) => [{ x: -dx * r, y: y * r, r: er * r }, { x: dx * r, y: y * r, r: er * r }];
  switch (id) {
    case 'compressor': return mk(0.27, -0.08, 0.2);
    case 'noisegate': return st.gated ? [] : mk(0.3, -0.2, 0.22);
    case 'reverb': return mk(0.33, -0.12, 0.26);
    case 'djglitch': return mk(0.3, -0.12, 0.22);
    default: return mk(0.38, -0.3, 0.22);
  }
}
const BOSS = {
  compressor(pen, r, st) {
    const body = rect(-r * 0.95, -r * 0.55, r * 1.9, r * 1.1, 10);
    glitchLines(pen, body, 1.4);
    for (const s of [-1, 1]) pen.shp(rect(-r * 1.1, s * r * 0.76 - r * 0.19, r * 2.2, r * 0.38, 6), '#aab4d0', INK, 4, { gap: 6, f2: '#fff' });   // the press plates
    pen.shp(body, '#7d8bb0', INK, 5, { gap: 6.5, f2: '#c9d0e6' });
    for (const s of [-1, 1]) { pen.ln([s * r * 1.3, -r * 0.35, s * r * 1.3, -r * 0.05], INK, 4, false, 0.6); pen.ln([s * r * 1.3 - s * 9, -r * 0.15, s * r * 1.3, -r * 0.0, s * r * 1.3 + s * 0, -r * 0.0], INK, 4, false, 0.4); }
    pen.shp(rect(-r * 0.58, -r * 0.36, r * 1.16, r * 0.7, 12), '#3a4a7a', INK, 4, { gap: 5, f2: '#6a7ab0' });
    const eyes = bossEyes('compressor', r, st);
    for (const e of eyes) eyeWhite(pen, e, true);
    pen.ln([-r * 0.3, r * 0.22, -r * 0.1, r * 0.17, r * 0.1, r * 0.27, r * 0.3, r * 0.2], '#fff', 3.4, false, 0.5);
    for (const [bx, by] of [[-0.8, -0.38], [0.8, -0.38], [-0.8, 0.38], [0.8, 0.38]]) pen.dot(bx * r, by * r, r * 0.05, INK);
    crown(pen, 0, -r * 1.0, r * 0.9);
    return eyes;
  },
  noisegate(pen, r, st) {
    const frame = [-r * 1.0, r * 0.9, -r * 1.0, -r * 0.2, ...arc(0, -r * 0.2, r * 1.0, r * 0.8, 180, 360, 12), r * 1.0, r * 0.9];
    glitchLines(pen, frame, 1.4);
    pen.shp(frame, '#ffcf4a', INK, 5, { gap: 6.5, f2: '#fff0b0' });
    const eyes = bossEyes('noisegate', r, { gated: false });
    if (!st.gated) {
      pen.shp(rect(-r * 0.62, -r * 0.65, r * 1.24, r * 1.45, 6), '#3a2a4a', INK, 3.4, { gap: 5, f2: '#6a4a7a' });   // dark doorway
      for (const e of eyes) eyeWhite(pen, e, true);
      pen.shp(rect(-r * 0.4, r * 0.18, r * 0.8, r * 0.26, 6), '#fff', INK, 3, { gap: 4 });   // grin
      for (let i = -1; i <= 1; i++) pen.ln([i * r * 0.2 + r * 0.0, r * 0.18, i * r * 0.2, r * 0.44], INK, 2, false, 0.3);
      for (const s of [-1, 1]) pen.shp([s * r * 0.62, -r * 0.65, s * r * 1.05, -r * 0.5, s * r * 1.05, r * 0.8, s * r * 0.62, r * 0.8], '#ffcf4a', INK, 3.4, { gap: 6 });   // doors swung open
    } else {
      for (const s of [-1, 1]) pen.shp([s * 0.02 * r, -r * 0.65, s * r * 0.62, -r * 0.65, s * r * 0.62, r * 0.8, s * 0.02 * r, r * 0.8], '#ffcf4a', INK, 3.6, { gap: 6, f2: '#fff0b0' });   // doors shut
      for (let i = 0; i < 5; i++) pen.ln([-r * 0.62 + i * r * 0.31, -r * 0.65, -r * 0.62 + i * r * 0.31 + r * 0.25, r * 0.8], INK, 3, false, 0.4);   // hazard stripes
      const lk = [...arc(0, 0.05 * r, r * 0.3, r * 0.3, 180, 360, 8), r * 0.3, r * 0.4, -r * 0.3, r * 0.4];   // a big padlock
      pen.ln(arc(0, -r * 0.1, r * 0.2, r * 0.26, 180, 360, 8), INK, 5, false, 0.6);
      pen.shp(rect(-r * 0.3, 0, r * 0.6, r * 0.5, 4), C.gold, INK, 3.4, { gap: 4 }); pen.dot(0, r * 0.22, r * 0.06, INK);
    }
    crown(pen, 0, -r * 1.0, r * 0.9);
    return st.gated ? [] : eyes;
  },
  reverb(pen, r, st) {
    const body = pen.blob(0, 0, r * 0.95, r * 0.9, 18, 0.1);
    for (let i = 3; i >= 1; i--) pen.ln(shift(body.map((v, k) => (v * (1 + i * 0.18))), 0, 0), '#a98be6', 2.6, true, 1.4, [12, 9]);   // echo rings
    glitchLines(pen, body, 1.3);
    pen.shp(body, '#9f7bff', INK, 5, { gap: 6.5, f2: '#e2d6ff' });
    for (const s of [-1, 1]) { const gp = pen.blob(s * r * 0.95, -r * 0.1, r * 0.33, r * 0.3, 10, 0.1); pen.shp(gp, '#cbb8ff', INK, 3, { gap: 5, alpha: 0.6 }); pen.dot(s * r * 0.95, -r * 0.12, r * 0.08, INK); }   // ghost faces
    const eyes = bossEyes('reverb', r, st);
    for (const e of eyes) eyeWhite(pen, e, true);
    pen.ln(arc(0, r * 0.35, r * 0.3, r * 0.2, 0, 360, 10), INK, 3.4, true, 0.5);
    crown(pen, 0, -r * 1.02, r * 0.9);
    return eyes;
  },
  djglitch(pen, r, st) {
    const body = pen.blob(0, r * 0.05, r * 0.9, r * 0.9, 16, 0.05);
    pen.ln(shift(body, 6, -2), CY, 3.4, true, 1.4); pen.ln(shift(body, -6, 2), MG, 3.4, true, 1.4);
    pen.shp(body, '#35f0c8', INK, 5, { gap: 6.5, f2: '#c8fff0' });
    for (let i = 1; i <= 3; i++) pen.ln(arc(0, r * 0.05, r * 0.25 * i, r * 0.25 * i, 0, 360, 14), 'rgba(43,39,51,0.35)', 2, true, 0.5);   // vinyl grooves
    pen.ln(arc(0, -r * 0.1, r * 1.05, r * 1.0, 200, 340, 10), INK, 6, false, 0.6);   // headphone band
    for (const s of [-1, 1]) pen.shp(rect(s * r * 1.0 - r * 0.2, -r * 0.35, r * 0.4, r * 0.6, 6), C.mag, INK, 3.4, { gap: 4.5 });
    const eyes = bossEyes('djglitch', r, st);
    for (const e of eyes) eyeWhite(pen, e, true);
    pen.ln([-r * 0.4, r * 0.36, -r * 0.1, r * 0.46, r * 0.2, r * 0.38, r * 0.45, r * 0.3], INK, 3.6, false, 0.5);   // smug grin
    for (const s of [-1, 1]) pen.ln([s * r * 1.45, -r * 0.7, s * r * 1.25, -r * 0.3, s * r * 1.5, -r * 0.3, s * r * 1.2, r * 0.2], C.yellow, 3.6, false, 0.5);   // glitch bolts
    crown(pen, 0, -r * 1.12, r * 0.85, C.cyan);
    return eyes;
  },
  playback(pen, r, st) {
    const ph = st.phase || 1;
    if (ph >= 3) for (let i = 0; i < 5; i++) { const a = -Math.PI + i * Math.PI / 4; pen.shp([Math.cos(a) * r * 1.0, Math.sin(a) * r * 0.9, Math.cos(a - 0.2) * r * 1.5, Math.sin(a - 0.2) * r * 1.4, Math.cos(a + 0.2) * r * 1.4, Math.sin(a + 0.2) * r * 1.35], C.orange, C.red, 2.6, { gap: 4, f2: C.yellow }); }   // flames
    const mon = rect(-r * 0.98, -r * 0.82, r * 1.96, r * 1.4, 16);
    glitchLines(pen, mon, 1.5);
    pen.shp(rect(-r * 0.5, r * 0.55, r * 1.0, r * 0.3, 6), '#c8205f', INK, 3.4, { gap: 5 });   // stand
    pen.shp(mon, '#ff4fa0', INK, 5.5, { gap: 6.5, f2: '#ffc8e2' });
    pen.shp(rect(-r * 0.78, -r * 0.62, r * 1.56, r * 1.0, 10), '#2a1840', INK, 4, { gap: 5, f2: '#5a3a80' });   // screen
    pen.shp([-r * 0.14, -r * 0.0, -r * 0.14, r * 0.36, r * 0.22, r * 0.18], '#fff', INK, 2.8, { gap: 3.5 });   // the play triangle
    for (const s of [0, 1]) pen.shp(rect(r * 0.4 + s * r * 0.17, r * 0.0, r * 0.1, r * 0.36), C.cyan, INK, 2.4, { gap: 3 });   // pause bars
    const eyes = bossEyes('playback', r, { phase: ph });
    for (const e of eyes) eyeWhite(pen, e, true);
    pen.ln([0, -r * 0.82, 0, -r * 1.15], INK, 3.4, false, 0.4); pen.dot(0, -r * 1.2, r * 0.08, C.yellow);
    if (ph >= 2) { pen.ln([-r * 0.9, -r * 0.5, -r * 0.55, -r * 0.2, -r * 0.7, 0.0, -r * 0.4, r * 0.3], '#fff', 3, false, 0.4); pen.ln([r * 0.9, -r * 0.1, r * 0.6, r * 0.1, r * 0.75, r * 0.4], '#fff', 3, false, 0.4); for (const s of [-1, 1]) pen.ln([s * r * 0.98, r * 0.1, s * r * 1.35, r * 0.4, s * r * 1.2, r * 0.8], INK, 3.4, false, 1); }   // cracks and cables
    if (ph >= 3) { for (let i = 0; i < 4; i++) pen.ln([-r * 0.9 + i * r * 0.55, -r * 0.95, -r * 0.8 + i * r * 0.55, -r * 1.25], C.red, 3.4, false, 0.5); }   // angry scribbles
    crown(pen, 0, -r * (ph >= 3 ? 1.12 : 1.0), r * (ph >= 3 ? 1.1 : 0.9), C.gold);
    return eyes;
  },
};
function bossSprite(id, phase, gated) {
  const def = BOSSES[id], r = def.r, S = Math.ceil(r * 3.9);
  const sp = sprite('bo|' + id + '|' + phase + '|' + (gated ? 1 : 0), S, S, (pen) => { BOSS[id](pen, r, { phase, gated }); }, { seed: 23 + (hashStr(id) % 61) });
  return { sp, eyes: bossEyes(id, r, { gated }) };
}
export function drawBoss(ctx, id, x, y, o) {
  const def = BOSSES[id];
  if (!def || !BOSS[id]) return;
  o = o || {};
  const t = o.t || 0, sc = o.scale == null ? 1 : o.scale, r = def.r;
  const phase = clamp(Math.round(o.phase || 1), 1, 3), gated = !!o.gated;
  const ang = o.ang || 0;
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  ctx.translate(x, y);
  ctx.save(); ctx.globalAlpha *= 0.3; ctx.fillStyle = '#4a4258'; ctx.beginPath(); ctx.ellipse(0, r * 0.95 * sc, r * 1.2 * sc, r * 0.3 * sc, 0, 0, TAU); ctx.fill(); ctx.restore();
  const bobY = Math.sin(t * 2.2) * 2.5 * sc;
  let sxs = 1, sys = 1;
  if (id === 'compressor') { const sq = Math.sin(t * 2.2) * 0.07; sxs = 1 + sq; sys = 1 - sq; }
  else if (id === 'reverb') { const p = 1 + Math.sin(t * 3) * 0.03; sxs = p; sys = p; }
  else if (id === 'djglitch') { const j = Math.sin(t * 17) > 0.92 ? 4 : 0; ctx.translate(j, 0); }
  const bs = bossSprite(id, phase, gated);
  ctx.save(); ctx.translate(0, bobY); ctx.scale(sc * sxs, sc * sys);
  blit(ctx, bs.sp, 0, 0, t);
  if (id === 'reverb') for (let i = 0; i < 2; i++) { const k = (t * 0.7 + i * 0.5) % 1; ctx.save(); ctx.globalAlpha *= 0.6 * (1 - k); ctx.strokeStyle = '#a98be6'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.arc(0, 0, r * (1.1 + k * 0.9), 0, TAU); ctx.stroke(); ctx.restore(); }
  if (id === 'djglitch') { ctx.save(); ctx.rotate(t * 5); ctx.strokeStyle = 'rgba(43,39,51,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(r * 0.1, 0); ctx.lineTo(r * 0.6, 0); ctx.stroke(); ctx.restore(); }
  const ax = Math.cos(ang), ay = Math.sin(ang) * 0.5 + 0.3;
  for (const e of bs.eyes) { const px = e.x + ax * e.r * 0.34, py = e.y + ay * e.r * 0.34; ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(px, py, e.r * 0.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px - e.r * 0.14, py - e.r * 0.16, e.r * 0.15, 0, TAU); ctx.fill(); }
  if (id === 'playback' && phase >= 2) { ctx.save(); ctx.strokeStyle = C.yellow; ctx.lineWidth = 3; ctx.lineCap = 'round'; for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.1, px = Math.cos(a) * r * 1.25, py = Math.sin(a) * r * 1.1 - r * 0.2; ctx.beginPath(); ctx.moveTo(px - 4, py); ctx.lineTo(px + 4, py); ctx.moveTo(px, py - 4); ctx.lineTo(px, py + 4); ctx.stroke(); } ctx.restore(); }
  if ((o.hit || 0) > 0) { ctx.save(); ctx.globalAlpha *= clamp(o.hit * 0.5, 0, 0.5); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.0, r * 0.9, 0, 0, TAU); ctx.fill(); ctx.restore(); }
  ctx.restore();
  if (o.hp != null && o.hp < 0.999) hpBar(ctx, 0, -r * 1.35 * sc - 14, r * 1.9 * sc, o.hp);
  ctx.restore();
}

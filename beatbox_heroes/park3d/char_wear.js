// CHARACTER WEAR: tops, bottoms, shoes. Every catalog id maps onto a family with parameters, unknown ids fall back to a sensible default.
import { C, mix, shade, lite, K, K2, MB, loft, ball, box, tube, lerp, clamp, sstep, mat } from './char_geo.js';
import { armRad, armSkin, legSkin, legRad } from './char_body.js';

const T = (f, o) => Object.assign({ f, hem: 0.45, w: 1.04, sl: 0.4, flare: 0 }, o);
export const TOPS = {
  tee: T('tee'), bbhtee: T('tee', { print: 'star' }), hawaiian: T('tee', { sl: 0.36, pat: 'flower', w: 1.1 }), flannel: T('tee', { sl: 1, pat: 'plaid', w: 1.08, collar: 1 }),
  tank: T('tank', { sl: 0 }), croptop: T('tank', { hem: 0.6, sl: 0.0, crop: 1 }), dress: T('dress', { hem: 0.3, sl: 0.3, flare: 1 }), overalls: T('tee', { sl: 0.4, bib: 1 }),
  oversized: T('tee', { hem: 0.35, w: 1.42, sl: 0.66, flare: 0.1, print: 'bolt', drop: 1 }),
  hoodie: T('hoodie', { hem: 0.43, w: 1.14, sl: 1 }), hoodiebig: T('hoodie', { hem: 0.36, w: 1.38, sl: 1, drop: 1 }),
  sweater: T('sweater', { hem: 0.43, w: 1.12, sl: 1 }), turtleneck: T('sweater', { w: 1.03, sl: 1, turtle: 1 }), poncho: T('sweater', { hem: 0.32, w: 1.4, sl: 0.7, flare: 0.2 }),
  windbreaker: T('jacket', { w: 1.16, sl: 1, stripes: 1, block: 1, zip: 1, hem: 0.42 }), tracktop: T('jacket', { w: 1.1, sl: 1, stripes: 1, zip: 1 }),
  bomber: T('jacket', { w: 1.18, sl: 1, rib: 1, zip: 1, hem: 0.45 }), varsity: T('jacket', { w: 1.16, sl: 1, rib: 1, sleeve2: 1, letter: 1 }),
  jacket: T('jacket', { w: 1.1, sl: 1, lapel: 1, zip: 1 }), denimjacket: T('jacket', { w: 1.14, sl: 1, collar: 1, pockets: 1, stitch: 1, hem: 0.44 }),
  puffer: T('jacket', { w: 1.3, sl: 1, puff: 1, hem: 0.4 }), puffvest: T('jacket', { w: 1.26, sl: 0.0, puff: 1, hem: 0.42 }),
  kimono: T('jacket', { w: 1.2, sl: 1, lapel: 1, hem: 0.34, flare: 0.1 }), tux: T('jacket', { w: 1.04, sl: 1, lapel: 1, hem: 0.4 }),
  jersey: T('jersey', { w: 1.3, sl: 0, hem: 0.38, trim: 1 }), stagesuit: T('jacket', { w: 1.1, sl: 1, stripes: 1, zip: 1 }), champ: T('jacket', { w: 1.3, sl: 1, lapel: 1, hem: 0.3, flare: 0.1 }),
};
const B = (f, o) => Object.assign({ f, w: 1.0, end: 0.09 }, o);
export const BOTTOMS = {
  jeans: B('pants', { w: 1.0, stitch: 1 }), cargo: B('pants', { w: 1.22, pockets: 1 }), camo: B('pants', { w: 1.22, pockets: 1, camo: 1 }), shorts: B('shorts'), skirt: B('skirt'), joggers: B('pants', { w: 1.1, cuff: 1 }),
  baggy: B('pants', { w: 1.5, stitch: 1 }), leggings: B('pants', { w: 0.84 }), trackpants: B('pants', { w: 1.04, stripe: 1 }), kilt: B('skirt', { plaid: 1 }), slacks: B('pants', { w: 0.98, crease: 1 }),
  flares: B('pants', { w: 0.98, flare: 1.7 }), goldpants: B('pants', { w: 1.0, shiny: 1 }), sweatpants: B('pants', { w: 1.12, cuff: 1 }), ripped: B('pants', { w: 1.5, stitch: 1, rip: 1 }), techpants: B('pants', { w: 0.98, stripe: 1, zips: 1 }),
};
export const SHOES = {
  sneakers: { f: 'sneaker' }, hightops: { f: 'high' }, retro: { f: 'high', retro: 1 }, boots: { f: 'boot' }, combat: { f: 'boot', lace: 1 }, timbs: { f: 'boot', tall: 0.04 }, platform: { f: 'sneaker', plat: 1 }, skate: { f: 'sneaker', fat: 1 },
  loafers: { f: 'loafer' }, fatlaces: { f: 'sneaker', fat: 1, lace: 1 }, goldkicks: { f: 'sneaker', gold: 1 }, sandals: { f: 'sandal' }, slides: { f: 'sandal', socks: 1 },
};
export function wearMeta(look) {
  const t = TOPS[(look.top && look.top.id) || 'tee'] || TOPS.tee, b = BOTTOMS[(look.bottom && look.bottom.id) || 'jeans'] || BOTTOMS.jeans;
  const dress = t.f === 'dress';
  return { top: t, bottom: b, sleeveEnd: t.sl, torsoVisible: t.f === 'tank' && t.crop ? 'mid' : t.f === 'tank' && false ? true : false, legEnd: dress || b.f === 'skirt' ? 0.3 : b.f === 'shorts' ? 0.31 : -1 };
}

// ------------------------------------------------------------------ torso profile (absolute y -> half widths). Shared with accessories so chains sit on the cloth.
const PY = [0.38, 0.45, 0.52, 0.6, 0.66, 0.72, 0.78, 0.84, 0.885, 0.915];
export function bodyR(y, d) {
  const rx = [d.hipRx - 0.005, d.hipRx + 0.003, d.hipRx - 0.002, d.waistRx, d.chestRx - 0.012, d.chestRx, d.chestRx + 0.012, d.shoulderRx - 0.01, d.shoulderRx - 0.04, 0.1];
  const rz = [0.118, 0.13, 0.128, 0.122, 0.132, 0.14, 0.14, 0.13, 0.118, 0.092];
  if (y <= PY[0]) return { rx: rx[0], rz: rz[0] }; if (y >= PY[PY.length - 1]) return { rx: rx[rx.length - 1], rz: rz[rz.length - 1] };
  let j = 0; while (PY[j + 1] < y) j++; const t = (y - PY[j]) / (PY[j + 1] - PY[j]); return { rx: lerp(rx[j], rx[j + 1], t), rz: lerp(rz[j], rz[j + 1], t) };
}
export const torsoSk = (y) => (y < 0.45 ? K2('hem', 'hips', clamp((y - 0.3) / 0.15, 0, 1)) : y < 0.52 ? K('hips') : y < 0.72 ? K2('hips', 'chest', (y - 0.52) / 0.2) : y < 0.89 ? K('chest') : K2('chest', 'neck', (y - 0.89) / 0.03));
const torsoFrontCache = new Map();
export function torsoFront(look, d, y) { const m = wearMeta(look).top; const w = m.f === 'dress' ? 1 : m.w; return bodyR(y, d).rz * w + 0.02; }

// ------------------------------------------------------------------ tops
export function buildTop(mb, ctx, d) {
  const look = ctx.look, id = (look.top && look.top.id) || 'tee', spec = TOPS[id] || TOPS.tee, col = C(look.top && look.top.color || '#ffd23f'), c2 = C(look.top && look.top.color2 || mix(col, '#ffffff', 0.5).getStyle()), sk = ctx.skin;
  const w = spec.w, ease = 0.016, f = spec.f, hemY = spec.hem, long = spec.sl >= 0.9;
  const ys = []; PY.forEach((y) => { if (y > hemY + 0.02 && y < 0.9) ys.push(y); }); ys.unshift(hemY); ys.push(0.905);
  if (f === 'tank' && spec.crop) { /* crop: skin midriff handled in body */ }
  const tint = (y) => { const t = clamp((y - hemY) / 0.5, 0, 1); return mix(shade(col, 0.78), col, Math.sqrt(t)); };
  const colorFor = (y) => { if (spec.block && y <= 0.6) return c2; if (spec.rib && y < hemY + 0.05) return shade(c2, 0.9); return tint(y); };
  if (spec.block) { const k = ys.indexOf(0.6); if (k >= 0) ys.splice(k + 1, 0, 0.6001); }
  const rings = ys.map((y, i) => {
    const b = bodyR(y, d), flare = y < 0.5 && spec.flare ? 1 + (0.5 - y) * spec.flare * 1.2 + (spec.flare >= 1 ? (0.5 - y) * 1.6 : 0) : 1, sc = (f === 'dress' ? 1.02 : w) * flare;
    let rx = b.rx * sc + ease, rz = b.rz * sc + ease; if (spec.puff && i % 2) { rx += 0.012; rz += 0.012; }
    if (y > 0.88) { rx = b.rx * (w > 1.25 ? 1.1 : 1.04) + 0.012; rz = b.rz + 0.015; }
    return { y, rx, rz, cz: 0.005, sk: torsoSk(y), c: colorFor(y), sq: 0.8 };
  });
  if (f === 'dress') { rings.length = 0; [0.3, 0.38, 0.45, 0.52, 0.6, 0.66, 0.72, 0.78, 0.84, 0.885, 0.905].forEach((y) => { const b = bodyR(y, d), fl = y < 0.45 ? 1 + (0.45 - y) * 2.2 : 1; rings.push({ y, rx: b.rx * fl + ease, rz: b.rz * fl + ease, cz: 0.005, sk: torsoSk(y), c: mix(shade(col, 0.82), col, clamp((y - 0.3) / 0.45, 0, 1)), sq: 0.9 }); }); }
  const n = 8;
  loft(mb, rings, { hullHalf: true, n, sq: 0.8, caps: 't', capCol: col, fc: spec.pat ? (i, j) => patFC(spec.pat, col, c2, i, j, mb) : undefined });
  // neck opening trim / collar
  const nb = bodyR(0.905, d), nc = f === 'sweater' ? (spec.turtle ? col : shade(col, 0.9)) : c2;
  if (f === 'sweater') loft(mb, [0.9, 0.96].map((y, i) => ({ y, rx: spec.turtle ? 0.105 : 0.115, rz: spec.turtle ? 0.1 : 0.105, cz: 0.012, sk: i ? K('neck') : K2('chest', 'neck', 0.5), c: i ? lite(col, 0.06) : shade(col, 0.85) })), { n: 8, caps: '' });
  else if (f !== 'tank') loft(mb, [0.895, 0.925].map((y, i) => ({ y, rx: 0.104, rz: 0.1, cz: 0.012, sk: K2('chest', 'neck', 0.5), c: i ? c2 : shade(c2, 0.85) })), { n: 8, caps: '' });
  void nb; void nc;
  // hem band / rib
  if (spec.rib || f === 'sweater') loft(mb, [hemY - 0.0, hemY + 0.05].map((y, i) => { const b = bodyR(Math.max(y, 0.4), d); return { y, rx: b.rx * w + ease + 0.004, rz: b.rz * w + ease + 0.004, cz: 0.005, sk: torsoSk(y), c: shade(spec.rib ? c2 : col, i ? 0.9 : 0.78), sq: 0.8 }; }), { n, sq: 0.8, caps: 'b' });
  // sleeves
  [1, -1].forEach((s) => {
    if (spec.sl <= 0.02 && f !== 'jersey') { if (f === 'tank') return; }
    const sl = Math.max(spec.sl, f === 'jersey' ? 0.0 : 0), uMax = clamp(sl, 0, 1), rs = (w > 1.3 ? 1.5 : w > 1.1 ? 1.25 : 1.1), loose = spec.drop ? 1.55 : 1;
    if (sl <= 0.02) return;
    const us = [0, 0.12, 0.3, 0.55, 0.8, 1].filter((u) => u <= uMax + 0.001); if (us[us.length - 1] < uMax - 0.01) us.push(uMax);
    const R = us.map((u, i) => { const y = 0.915 - u * 0.405 + (u === 0 ? 0 : 0), r0 = u === 0 ? 0.55 : 1, r = (armRad(u) + 0.022) * rs * (u > 0.2 ? loose : 1.0) * (long && u > 0.8 ? 0.82 : 1) * (i === us.length - 1 && !long ? 1.05 : 1) * r0; let c = tint(0.7 + u * 0.1); if (spec.sleeve2) c = c2; if (spec.block) c = col; if (i === us.length - 1 && !long) c = spec.rib || f === 'tee' ? shade(c2, 0.95) : shade(col, 0.82); if (i === us.length - 1 && long && (spec.rib || f === 'hoodie' || f === 'sweater' || f === 'jacket')) c = shade(spec.rib ? c2 : col, 0.78); return { y, rx: r, rz: r * 0.95, cx: s * d.shX * (u === 0 ? 0.86 : 1), sk: armSkin(s, Math.min(y, 0.87)), c }; });
    loft(mb, R, { hullHalf: R.length >= 4, n: 6, caps: 'bt', capCol: shade(col, 0.5), capColB: col, fc: spec.stripes ? (i, j) => ((s > 0 ? i === 1 : i === 4) ? c2 : null) : undefined });
  });
  // ----- family details
  const frontZ = (y) => bodyR(y, d).rz * (f === 'dress' ? 1.02 : w) + ease + 0.005;
  if (spec.print === 'bolt') { const cy = 0.66, z = frontZ(cy) + 0.012, sc = 1.35; const q = (pts) => mb.poly(pts.map(([u, v]) => [u * sc, cy + v * sc, z + 0.0]), c2, K('chest'), [0, 0, 1], { nh: true, flat: true }); q([[0.02, 0.13], [0.075, 0.13], [0.03, 0.02], [-0.015, 0.02]]); q([[-0.02, 0.035], [0.07, 0.035], [-0.03, -0.12], [-0.03, -0.01]]); q([[0.0, 0.05], [0.06, 0.05], [0.02, -0.02], [-0.04, -0.02]]); }
  if (spec.print === 'star') { const cy = 0.67, z = frontZ(cy) + 0.012, st = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.03 : 0.07; st.push([Math.cos(a) * r, cy + Math.sin(a) * r, z]); } mb.poly(st, c2, K('chest'), [0, 0, 1], { nh: true, flat: true }); }
  if (f === 'jersey') {
    [1, -1].forEach((s) => loft(mb, [0.86, 0.9].map((y, i) => ({ y, rx: 0.09, rz: 0.085, cx: s * d.shX, sk: K(s > 0 ? 'shL' : 'shR'), c: i ? c2 : shade(c2, 0.8) })), { n: 8, caps: '' }));
    const z = frontZ(0.68) + 0.012; [[-0.045, 0.12], [0.02, 0.12], [0.02, 0.1], [-0.025, 0.1]].forEach(() => 0);
    mb.poly([[-0.05, 0.75], [0.05, 0.75], [0.05, 0.72], [-0.01, 0.72], [-0.03, 0.6], [-0.07, 0.6]].map(([x, y]) => [x * 1.2, y, z]), c2, K('chest'), [0, 0, 1], { nh: true, flat: true });
    [0.45, 0.5].forEach((y, i) => { const b = bodyR(y, d); loft(mb, [{ y: y - 0.012, rx: b.rx * w + ease + 0.003, rz: b.rz * w + ease + 0.003, cz: 0.005, sk: torsoSk(y), c: c2, sq: 0.8 }, { y: y + 0.008, rx: b.rx * w + ease + 0.003, rz: b.rz * w + ease + 0.003, cz: 0.005, sk: torsoSk(y), c: c2, sq: 0.8 }], { n, sq: 0.8, caps: '' }); void i; });
  }
  if (f === 'hoodie') {
    ball(mb, [0, 0.9, -0.11], [0.15, 0.1, 0.1], shade(col, 0.88), K2('chest', 'cape', 0.0), { detail: 1, col2: col, jit: 0.02 });
    [0.045, -0.045].forEach((x) => tube(mb, [[x, 0.86, frontZ(0.86) + 0.004], [x, 0.78, frontZ(0.78) + 0.01], [x * 1.1, 0.7, frontZ(0.7) + 0.012]], 0.007, '#f2e6d0', { n: 3, sk: K('chest'), tip: 0.012, nh: true }));
    box(mb, [0, 0.52, frontZ(0.52) - 0.004], [0.22 * w, 0.1, 0.03], shade(col, 0.85), torsoSk(0.52), { taper: 1 });
  }
  if (f === 'jacket') {
    ball(mb, [0, 0.905, -0.03], [0.125, 0.045, 0.11], shade(spec.lapel || spec.collar ? c2 : col, 0.9), K('chest'), { detail: 0, nh: true });
    if (spec.zip) tube(mb, [[0, 0.9, frontZ(0.9) - 0.006], [0, 0.7, frontZ(0.7) + 0.008], [0, hemY + 0.02, frontZ(hemY) + 0.006]].map((p, i) => p), 0.006, spec.block ? shade(c2, 0.6) : '#cfcfdc', { n: 3, sk: K('chest'), nh: true });
    if (spec.letter) { const z = frontZ(0.72) + 0.012; mb.poly([[0.07, 0.76], [0.14, 0.76], [0.14, 0.73], [0.1, 0.73], [0.1, 0.64], [0.07, 0.64]].map(([x, y]) => [x, y, z - 0.01]), c2, K('chest'), [0, 0, 1], { nh: true, flat: true }); }
    if (spec.pockets) [1, -1].forEach((s) => box(mb, [s * 0.1, 0.72, frontZ(0.72) - 0.002], [0.07, 0.06, 0.02], shade(col, 0.9), K('chest')));
    if (spec.lapel) [1, -1].forEach((s) => mb.poly([[s * 0.02, 0.9], [s * 0.12, 0.9], [s * 0.06, 0.74], [s * 0.015, 0.8]].map(([x, y]) => [x, y, frontZ(y) + 0.008]), c2, K('chest'), [0, 0, 1], { nh: true, flat: true }));
  }
  if (spec.bib) { box(mb, [0, 0.66, frontZ(0.66) + 0.004], [0.22, 0.15, 0.02], c2, K('chest')); [1, -1].forEach((s) => tube(mb, [[s * 0.09, 0.73, frontZ(0.73)], [s * 0.1, 0.88, 0.02], [s * 0.1, 0.9, -0.08]], 0.014, c2, { n: 3, sk: K('chest'), nh: true })); }
  if (f === 'dress') { void 0; }
}
function patFC(pat, col, c2, i, j, mb) {
  if (pat === 'plaid') return (i + j) % 2 ? mix(col, c2, 0.55) : shade(col, 0.9);
  if (pat === 'flower') { const r = ((i * 7 + j * 13) % 5); return r === 0 ? c2 : r === 1 ? mix(col, '#ffd23f', 0.5) : null; }
  return null;
}

// ------------------------------------------------------------------ bottoms
export function buildBottom(mb, ctx, d) {
  const look = ctx.look, id = (look.bottom && look.bottom.id) || 'jeans', spec = BOTTOMS[id] || BOTTOMS.jeans, col = C(look.bottom && look.bottom.color || '#34303f'), sk = ctx.skin;
  const camoCols = [lite(col, 0.04), shade(col, 0.7), mix(col, '#c9b26a', 0.45), shade(mix(col, '#7a4a2a', 0.55), 0.95)], rr = (i, j) => camoCols[((i * 5 + j * 3 + ((i * j) % 3)) * 7) % 4];
  const f = spec.f, w = spec.w;
  const beltC = shade(col, 0.55);
  // pelvis / waist
  const topY = 0.6, pr = [0.6, 0.55, 0.5, 0.45, 0.4].map((y) => { const b = bodyR(Math.max(y, 0.4), d); return { y, rx: b.rx * (f === 'skirt' ? 1.0 : Math.max(1, w * 0.92)) + 0.012, rz: b.rz * Math.max(1, w * 0.92) + 0.012, cz: 0.004, sk: y > 0.5 ? K2('hips', 'spine', 0.5) : K('hips'), c: y > 0.57 ? beltC : mix(col, shade(col, 0.8), (0.55 - y) / 0.2 * 0.5) }; });
  loft(mb, f === 'skirt' ? pr.slice(0, 3) : pr, { n: 8, sq: 0.85, caps: f === 'skirt' ? 't' : 'bt', capCol: beltC });
  if (f === 'skirt') {
    const hemY = 0.3; const rows = [0.5, 0.42, 0.34, hemY].map((y, i) => { const b = bodyR(Math.max(y, 0.4), d); return { y, rx: b.rx * 1.0 + 0.012 + i * 0.045 + (i === 3 ? 0.03 : 0), rz: b.rz + 0.012 + i * 0.045 + (i === 3 ? 0.03 : 0), cz: 0.004, sk: K2('hips', 'hem', clamp(i / 3, 0, 1)), c: spec.plaid ? col : mix(col, shade(col, 0.82), i / 3) }; });
    loft(mb, rows, { n: 12, sq: 0.9, caps: '', fc: spec.plaid ? (i, j) => ((i + j) % 2 ? shade(mix(col, '#d4a017', 0.35), 0.9) : col) : undefined });
    return;
  }
  const legTop = 0.47, end = f === 'shorts' ? 0.3 : spec.end;
  [1, -1].forEach((s) => {
    const rs = f === 'shorts' ? [0.47, 0.4, 0.34, 0.3] : [0.47, 0.37, 0.27, 0.19, end + 0.0];
    const R = rs.map((y, i, a) => {
      const base = legRad(y), flare = spec.flare && y < 0.2 ? 1 + (0.2 - y) / 0.12 * (spec.flare - 1) : 1, cuff = spec.cuff && i === a.length - 1 ? 0.78 : 1;
      let r = (base + 0.014) * (w * (f === 'shorts' ? 1.05 : 1)) * flare * cuff; if (f === 'pants' && y > 0.4) r = Math.max(r, 0.088); r = Math.max(r, y > 0.35 ? 0.082 : 0.06);
      const c = spec.shiny ? mix(col, '#fff2a8', 0.12 * (i % 2)) : mix(shade(col, 0.92), col, 0.5); return { y, rx: r, rz: r, cx: s * d.hipX, sk: legSkin(s, y), c: i === a.length - 1 && (spec.cuff || f === 'shorts') ? shade(col, 0.72) : c };
    });
    loft(mb, R, { hullHalf: R.length >= 4, n: 6, caps: 'bt', capCol: shade(col, 0.5), capColB: col, fc: spec.camo ? (i, j) => rr(i + (s > 0 ? 0 : 3), j) : spec.plaid ? undefined : undefined });
    // side details
    if (spec.pockets) box(mb, [s * (d.hipX + 0.11 * w * 0.9), 0.35, 0.02], [0.03, 0.1, 0.085], spec.camo ? camoCols[1] : shade(col, 0.82), K(side(s, 'th')), { rot: [0, 0, s * 0.05] });
    if (spec.stripe) tube(mb, [[s * (d.hipX + 0.088 * w), 0.45, 0.005], [s * (d.hipX + 0.08 * w), 0.3, 0.0], [s * (d.hipX + 0.062 * w), 0.14, 0.0]], 0.009, lite(col, 0.55), { n: 3, sk: (t) => legSkin(s, 0.45 - t * 0.3), nh: true });
    if (spec.stitch) { /* denim seam */ }
    if (spec.cuff) loft(mb, [end + 0.02, end - 0.01].map((y) => ({ y, rx: 0.06 * 1.0, rz: 0.06, cx: s * d.hipX, sk: K2(side(s, 'kn'), side(s, 'an'), 0.6), c: shade(col, 0.7) })), { n: 8, caps: '' });
  });
}
function side(s, n) { return n + (s > 0 ? 'L' : 'R'); }

// ------------------------------------------------------------------ shoes (bound to the ankle bone; ankle joint at (+-hipX, .085, 0))
// footprint slab: pts [[x,z]...] extruded between y0 and y1
function slab(mb, pts, y0, y1, ax, colTop, colSide, sk) {
  const n = pts.length, ctr = pts.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n], [0, 0]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], a = [ax + p[0], y0, p[1]], b = [ax + q[0], y0, q[1]], c = [ax + q[0], y1, q[1]], d = [ax + p[0], y1, p[1]], hint = [(p[0] + q[0]) / 2 - ctr[0], 0, (p[1] + q[1]) / 2 - ctr[1]];
    mb.triH(a, b, c, hint, colSide, colSide, colSide, sk, sk, sk); mb.triH(a, c, d, hint, colSide, colSide, colSide, sk, sk, sk);
    mb.triH([ax + ctr[0], y1, ctr[1]], d, c, [0, 1, 0], colTop, colTop, colTop, sk, sk, sk, true);
  }
}
export function buildShoes(mb, ctx, d) {
  const look = ctx.look, sh = look.shoes || {}, id = sh.id || 'sneakers', spec = SHOES[id] || SHOES.sneakers, col = C(sh.color || '#f7f2e8');
  const lum = col.r * 0.3 + col.g * 0.59 + col.b * 0.11, c2 = sh.color2 ? C(sh.color2) : lum > 0.45 ? C('#3a6fd0') : C('#f2e6d0'), f = spec.f;
  const sole = spec.gold ? C('#ffe27a') : f === 'boot' ? C('#4a3a30') : C('#f2e6d0'), body = spec.gold ? C('#ffd23f') : col, sk = ctx.skin;
  [1, -1].forEach((s) => {
    const an = K(side(s, 'an')), ax = s * d.hipX, plat = spec.plat ? 0.04 : 0, fat = (spec.fat ? 1.1 : 1) * 1.12, SY = 0.034 + plat;
    const foot = [[0, -0.1], [0.046, -0.085], [0.07, -0.01], [0.075, 0.08], [0.058, 0.165], [0, 0.2], [-0.058, 0.165], [-0.075, 0.08], [-0.07, -0.01], [-0.046, -0.085]].map(([x, z]) => [x * fat, z]);
    if (f === 'sandal') {
      slab(mb, foot, 0, SY * 0.7, ax, shade(sole, 0.95), shade(sole, 0.75), an);
      const R = (z, rx, ry, cy, c) => ({ y: z, rx, rz: ry, cx: ax, cz: -cy, sk: an, c });
      loft(mb, [R(-0.07, 0.042, 0.03, 0.06, spec.socks ? '#f2e6d0' : shade(sk, 0.9)), R(0.04, 0.06, 0.03, 0.062, spec.socks ? '#f2e6d0' : sk), R(0.15, 0.05, 0.024, 0.05, spec.socks ? '#f2e6d0' : sk), R(0.18, 0.025, 0.018, 0.045, sk)], { n: 6, m: mat([0, 0, 0], [Math.PI / 2, 0, 0]), caps: 'bt' });
      box(mb, [ax, SY + 0.045, 0.06], [0.15, 0.014, 0.034], col, an); return;
    }
    slab(mb, foot, 0, SY, ax, shade(sole, 0.95), sole, an);
    const R = (z, rx, ry, cy, c) => ({ y: z, rx: rx * fat, rz: ry, cx: ax, cz: -(SY + cy), sk: an, c, sq: 0.8 });
    const loaf = f === 'loafer';
    const upper = [R(-0.1, 0.044, 0.034, 0.04, shade(body, 0.8)), R(-0.055, 0.062, 0.05, 0.05, shade(body, 0.92)), R(0.02, 0.066, 0.052, 0.052, body), R(0.1, 0.07, 0.044, 0.042, lite(body, 0.04)), R(0.17, 0.056, 0.034, 0.032, lite(body, 0.06))];
    loft(mb, upper, { hullHalf: true, n: 6, m: mat([0, 0, 0], [Math.PI / 2, 0, 0]), caps: 'bt', sq: 0.8, capCol: lite(body, 0.05) });
    // toe cap and heel tab, side swoosh panel in the accent colour
    mb.poly([[ax + s * 0.07, SY + 0.075, -0.045], [ax + s * 0.073, SY + 0.052, 0.05], [ax + s * 0.073, SY + 0.02, 0.02], [ax + s * 0.07, SY + 0.03, -0.06]], c2, an, [s, 0, 0], { nh: true, flat: true });
    mb.poly([[ax - s * 0.07, SY + 0.075, -0.045], [ax - s * 0.073, SY + 0.052, 0.05], [ax - s * 0.073, SY + 0.02, 0.02], [ax - s * 0.07, SY + 0.03, -0.06]], c2, an, [-s, 0, 0], { nh: true, flat: true });
    // collar
    const tall = f === 'boot' ? 0.14 + (spec.tall || 0) : f === 'high' ? 0.09 : 0.0;
    if (tall > 0) {
      const top = SY + 0.06 + tall, sr = f === 'boot' ? 0.068 : 0.062;
      loft(mb, [{ y: SY + 0.04, rx: 0.064, rz: 0.06, cx: ax, cz: 0.0, sk: an, c: shade(body, 0.85) }, { y: SY + 0.1, rx: sr, rz: sr * 0.95, cx: ax, cz: 0, sk: an, c: body }, { y: top - 0.012, rx: sr, rz: sr * 0.96, cx: ax, cz: 0, sk: K2(side(s, 'kn'), side(s, 'an'), 0.6), c: lite(body, 0.05) }, { y: top, rx: sr * 1.1, rz: sr * 1.08, cx: ax, cz: 0, sk: K2(side(s, 'kn'), side(s, 'an'), 0.8), c: f === 'boot' ? shade(body, 0.7) : c2 }], { n: 6, caps: 'b' });
    }
    // laces and tongue
    if (!loaf) { mb.poly([[ax - 0.03, SY + 0.095, 0.0], [ax + 0.03, SY + 0.095, 0.0], [ax + 0.026, SY + 0.062, 0.1], [ax - 0.026, SY + 0.062, 0.1]], spec.lace ? c2 : C('#f2e6d0'), an, [0, 1, 0.3], { nh: true, flat: true }); [0.02, 0.055, 0.085].forEach((z, i) => mb.poly([[ax - 0.032, SY + 0.094 - i * 0.013, z - 0.006], [ax + 0.032, SY + 0.094 - i * 0.013, z - 0.006], [ax + 0.032, SY + 0.094 - i * 0.013, z + 0.006], [ax - 0.032, SY + 0.094 - i * 0.013, z + 0.006]], shade(body, 0.65), an, [0, 1, 0], { nh: true, flat: true })); }
    else box(mb, [ax, SY + 0.07, 0.07], [0.05, 0.02, 0.035], shade(body, 0.7), an);
  });
}
void ball; void box; void tube; void sstep; void MB;

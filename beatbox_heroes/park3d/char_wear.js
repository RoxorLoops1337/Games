// CHARACTER WEAR: tops, bottoms, shoes. Every catalog id maps onto a family with parameters, unknown ids fall back to a sensible default.
import { C, mix, shade, lite, K, K2, MB, loft, ball, box, tube, tubePT, lerp, clamp, sstep, mat } from './char_geo.js';
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
// sleeveEnd / legEnd tell char_body where bare skin starts: always a few cm INSIDE the sleeve or hem, so no slit opens between cloth and limb.
// Under a skirt the thigh starts high (it shows when the skirt swings or the character sits) but below the hip joint, where it would poke out through the
// top's sides; pants hide the leg, under a dress it starts at the hem.
export function wearMeta(look) {
  const t = TOPS[(look.top && look.top.id) || 'tee'] || TOPS.tee, b = BOTTOMS[(look.bottom && look.bottom.id) || 'jeans'] || BOTTOMS.jeans;
  const dress = t.f === 'dress', crop = !!(t.f === 'tank' && t.crop);
  return { top: t, bottom: b, crop, sleeveEnd: t.sl <= 0.02 ? 0 : t.sl >= 0.9 ? t.sl : Math.max(0.03, t.sl - 0.2), torsoVisible: crop ? 'mid' : false, legEnd: b.f === 'pants' ? -1 : b.f === 'skirt' && !dress ? 0.4 : 0.33 };
}
// re-skin the vertices emitted since a mark: fn(x, y, z) returns a skin descriptor or null (keep). Covers the decimated hull copy too.
const mark = (mb) => [mb.P.length, mb.hull.P.length];
function reskin(mb, m, fn) {
  [[mb, m[0]], [mb.hull, m[1]]].forEach(([dst, from]) => { for (let i = from; i < dst.P.length; i += 3) { const s = fn(dst.P[i], dst.P[i + 1], dst.P[i + 2]); if (s) { dst.S[i] = s[0]; dst.S[i + 1] = s[1]; dst.S[i + 2] = s[2]; } } });
}
// inward-facing loft (linings): loft keeps normals outward even under a mirrored matrix, so the winding of the emitted triangles is reversed afterwards
function lining(mb, rings, o) { const m = mark(mb); loft(mb, rings, Object.assign({ caps: '', nh: true, flat: true }, o)); for (let i = m[0]; i < mb.P.length; i += 9) for (const A of [mb.P, mb.Cl, mb.S]) for (let k = 0; k < 3; k++) { const t = A[i + 3 + k]; A[i + 3 + k] = A[i + 6 + k]; A[i + 6 + k] = t; } return m; }
// drop the outline hull from triangles emitted since a mark whose rest centroid passes pred: an inner layer hidden under an outer one must not carry
// a hull, the 0.013 m inflated shell would poke through the outer cloth as dark patches. Removes the decimated hull-only copies too.
function unhull(mb, m, pred) {
  const P = mb.P; for (let i = m[0]; i < P.length; i += 9) if (pred((P[i] + P[i + 3] + P[i + 6]) / 3, (P[i + 1] + P[i + 4] + P[i + 7]) / 3, (P[i + 2] + P[i + 5] + P[i + 8]) / 3)) mb.H[i / 9] = 1;
  const h = mb.hull, keep = { P: [], Cl: [], S: [] }; for (let i = m[1]; i < h.P.length; i += 9) { if (pred((h.P[i] + h.P[i + 3] + h.P[i + 6]) / 3, (h.P[i + 1] + h.P[i + 4] + h.P[i + 7]) / 3, (h.P[i + 2] + h.P[i + 5] + h.P[i + 8]) / 3)) continue; for (const k of ['P', 'Cl', 'S']) for (let j = 0; j < 9; j++) keep[k].push(h[k][i + j]); }
  for (const k of ['P', 'Cl', 'S']) { h[k].length = m[1]; for (const v of keep[k]) h[k].push(v); }
}
// cloth below the hip joints follows the thighs (blended with the swinging hem bone): skirts, dresses and long coats drape over the lap when sitting
// and swing with the stride instead of letting the legs punch through. The centre line stays on the hem so left and right never tear apart, and the
// weight fades out toward the back: cloth behind the legs is not dragged into the seat when the thighs come up.
export const drapeSk = (k) => (x, y, z) => { const dep = clamp((0.47 - y) / 0.15, 0, 1), w = (k || 0.72) * dep * sstep(0.015, 0.1, Math.abs(x)) * sstep(-0.55, 0.25, z / (Math.hypot(x, z) + 1e-6)); return w > 0.01 ? K2('hem', x > 0 ? 'thL' : 'thR', w) : null; };
// bare midriff under a crop top: same facet count and squareness as the cloth around it, strictly inside the waistband and the top
export function buildMidriff(mb, ctx, d) {
  const m0 = mark(mb); loft(mb, [0.5, 0.56, 0.63].map((y, i) => { const b = bodyR(y, d); return { y, rx: b.rx + 0.004, rz: b.rz + 0.004, cz: 0.004, sk: torsoSk(y), c: shade(ctx.skin, 0.9 + i * 0.04) }; }), { n: 8, sq: 0.8, caps: '' }); unhull(mb, m0, (x, y) => y > 0.59);
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
// the torso shell of a top at height y (ring radii before the puffer quilting); bottoms use it to stay inside the top wherever the two overlap
const EASE = 0.016;
export function topRad(spec, d, y) {
  const b = bodyR(y, d);
  if (spec.f === 'dress') { const fl = y < 0.45 ? 1 + (0.45 - y) * 2.2 : 1; return { rx: b.rx * fl + EASE, rz: b.rz * fl + EASE }; }
  const flare = y < 0.5 && spec.flare ? 1 + (0.5 - y) * spec.flare * 1.2 + (spec.flare >= 1 ? (0.5 - y) * 1.6 : 0) : 1, sc = spec.w * flare;
  return { rx: b.rx * sc + EASE, rz: b.rz * sc + EASE };
}
// what a bottom needs from the top: its hem, its squareness (a layer must be at least as round as the shell around it, a squarer superellipse pokes
// out sideways near the front and back), and a clamp that keeps a ring (centred at cx, with n sides vs the top's 8) strictly inside the top shell
export function topShell(look, d) {
  const m = wearMeta(look), t = m.top, hem = m.crop ? 9 : t.f === 'dress' ? 0.3 : t.hem;
  const fit = (y, cx, rx, rz, inr, gap, below) => { if (y < hem - (below || 0.002)) return [rx, rz]; const r = topRad(t, d, Math.max(y, hem)), k = inr || 0.9, g = gap === undefined ? 0.01 : gap; return [Math.min(rx, r.rx * k - g - Math.abs(cx || 0)), Math.min(rz, r.rz * k - g)]; };
  return { hem, fit, long: hem < 0.45, sq: t.f === 'dress' ? 0.9 : 0.8 };
}
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
    let { rx, rz } = topRad(spec, d, y); if (spec.puff && i % 2 && !(spec.sl <= 0.02 && y >= 0.76)) { rx += 0.012; rz += 0.012; }
    // sleeveless: the armhole is cut inside the arm, so a wide vest never swallows the shoulder and the arm leaves the cloth at its side
    if (spec.sl <= 0.02 && y >= 0.76) rx = Math.min(rx, d.shX - 0.012);
    if (y > 0.88) { rx = bodyR(y, d).rx * (w > 1.25 ? 1.1 : 1.04) + 0.012; rz = bodyR(y, d).rz + 0.015; }
    return { y, rx, rz, cz: 0.005, sk: torsoSk(y), c: colorFor(y), sq: 0.8 };
  });
  if (f === 'dress') { rings.length = 0; [0.3, 0.38, 0.45, 0.52, 0.6, 0.66, 0.72, 0.78, 0.84, 0.885, 0.905].forEach((y) => { const r = topRad(spec, d, y); rings.push({ y, rx: r.rx, rz: r.rz, cz: 0.005, sk: torsoSk(y), c: mix(shade(col, 0.82), col, clamp((y - 0.3) / 0.45, 0, 1)), sq: 0.9 }); }); }
  const n = 8, m0 = mark(mb);
  loft(mb, rings, { hullHalf: true, n, sq: 0.8, caps: 't', capCol: col, fc: spec.pat ? (i, j) => patFC(spec.pat, col, c2, i, j, mb) : undefined });
  if (rings[0].y < 0.47) reskin(mb, m0, drapeSk());
  // long hems get an inner lining up to the waist (inward facing, dark): a low camera looking up a coat or a dress sees cloth, not the culled far wall
  if (rings[0].y < 0.44) { const top = 0.56, lr = rings.filter((r) => r.y <= top - 0.01); if (lr[lr.length - 1].y < top - 0.01) lr.push(Object.assign({}, topRad(spec, d, top), { y: top, sk: torsoSk(top) }));
    const m1 = lining(mb, lr.map((r) => ({ y: r.y, rx: r.rx - 0.006, rz: r.rz - 0.006, cz: 0.005, sk: r.sk, c: shade(col, 0.42) })), { n, sq: f === 'dress' ? 0.9 : 0.8 }); if (rings[0].y < 0.47) reskin(mb, m1, drapeSk()); }
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
    const R = us.map((u, i) => { const y = 0.915 - u * 0.405 + (u === 0 ? 0 : 0), r0 = u === 0 ? 0.55 : 1, r = (armRad(u) + 0.022) * rs * (u > 0.2 ? loose : 1.0) * (long && u > 0.8 ? 0.82 : 1) * (i === us.length - 1 && !long ? 1.05 : 1) * r0; let c = tint(0.7 + u * 0.1); if (spec.sleeve2) c = c2; if (spec.block) c = col; if (i === us.length - 1 && !long) c = spec.rib || (f === 'tee' && !spec.print) ? shade(c2, 0.95) : shade(col, 0.8); if (i === us.length - 1 && long && (spec.rib || f === 'hoodie' || f === 'sweater' || f === 'jacket')) c = shade(spec.rib ? c2 : col, 0.78); return { y, rx: r, rz: r * 0.95, cx: s * d.shX * (u === 0 ? 0.86 : 1), sk: armSkin(s, Math.min(y, 0.87)), c }; });
    // the open end folds in to a dark lip that hugs the arm (or wrist), so the end cap is a thin rim around the limb instead of a flat lid
    { const e = R[R.length - 1], lr = armRad(uMax) + 0.007; loft(mb, [e, { y: e.y - 0.004, rx: lr, rz: lr * 0.95, cx: e.cx, sk: e.sk, c: shade(e.c, 0.42) }], { n: 6, caps: 't', capCol: shade(e.c, 0.3), nh: true }); }
    loft(mb, R, { hullHalf: R.length >= 4, n: 6, caps: 'b', capCol: shade(col, 0.5), capColB: col, fc: spec.stripes ? (i, j) => ((s > 0 ? i === 1 : i === 4) ? c2 : null) : undefined });
  });
  // ----- family details: every decal, zip and pocket is seated on the actual torso loft (surf) and skinned like the cloth under it (torsoSk per vertex),
  // so nothing floats off the curved sides or slides off the hem when the spine bends and twists
  const surf = (x, y, back) => {
    let j = 0; while (j < rings.length - 2 && rings[j + 1].y < y) j++; const a = rings[j], b = rings[j + 1], t = clamp((y - a.y) / (b.y - a.y), 0, 1), rx = lerp(a.rx, b.rx, t), rz = lerp(a.rz, b.rz, t), e = a.sq || 0.8;
    const P = []; for (let i = 0; i < n; i++) { const th = Math.PI / n + (i / n) * Math.PI * 2; P.push([rx * Math.sign(Math.sin(th)) * Math.pow(Math.abs(Math.sin(th)), e), 0.005 + rz * Math.sign(Math.cos(th)) * Math.pow(Math.abs(Math.cos(th)), e)]); }
    let best = back ? 1e9 : -1e9; for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; if ((p[0] - x) * (q[0] - x) <= 0 && p[0] !== q[0]) { const z = p[1] + (x - p[0]) / (q[0] - p[0]) * (q[1] - p[1]); best = back ? Math.min(best, z) : Math.max(best, z); } }
    return Math.abs(best) > 1e8 ? (back ? -rz : rz) : best;
  };
  const onS = (x, y, off, back) => [x, y, surf(x, y, back) + (back ? -off : off)];
  // convex-ish decal fanned from its centre (quad: two triangles, for the small cells of patches and strips), each vertex on the surface with its own skin
  const decal = (pts, colr, off, quad) => { const P = pts.map(([x, y]) => onS(x, y, off)); if (quad) { const cc = C(colr), sk4 = P.map((p) => torsoSk(p[1])); mb.triH(P[0], P[1], P[2], [0, 0, 1], cc, cc, cc, sk4[0], sk4[1], sk4[2], true, true); mb.triH(P[0], P[2], P[3], [0, 0, 1], cc, cc, cc, sk4[0], sk4[2], sk4[3], true, true); return; } const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length, C0 = onS(cx, cy, off), cc = C(colr); for (let i = 0; i < P.length; i++) { const A = P[i], B2 = P[(i + 1) % P.length]; mb.triH(C0, A, B2, [0, 0, 1], cc, cc, cc, torsoSk(C0[1]), torsoSk(A[1]), torsoSk(B2[1]), true, true); } };
  // any quad [[x,y] x4], bilinearly subdivided into cells of a few cm so it follows the curved, ringed torso
  const decalQ = (q, colr, off) => { const L2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), nu = Math.max(1, Math.ceil(Math.max(L2(q[0], q[1]), L2(q[3], q[2])) / 0.04)), nv = Math.max(1, Math.ceil(Math.max(L2(q[0], q[3]), L2(q[1], q[2])) / 0.05)), at = (u, v) => [0, 1].map((k) => lerp(lerp(q[0][k], q[1][k], u), lerp(q[3][k], q[2][k], u), v)); for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) decal([at(i / nu, j / nv), at((i + 1) / nu, j / nv), at((i + 1) / nu, (j + 1) / nv), at(i / nu, (j + 1) / nv)], colr, off, true); };
  // rectangular (optionally tapered) patch split into narrow columns so it bends round the torso instead of cutting chords through it
  const patch = (x0, x1, y0, y1, colr, off, topK) => {
    const k = Math.max(1, Math.ceil((x1 - x0) / 0.045)), ky = Math.max(1, Math.ceil(Math.abs(y1 - y0) / 0.06)), tk = topK || 1, xm = (x0 + x1) / 2, X = (u, v) => { const k2 = 1 + (tk - 1) * v; return xm + (lerp(x0, x1, u) - xm) * k2; };
    for (let j = 0; j < ky; j++) for (let i = 0; i < k; i++) { const u0 = i / k, u1 = (i + 1) / k, v0 = j / ky, v1 = (j + 1) / ky, ya = lerp(y0, y1, v0), yb = lerp(y0, y1, v1); decal([[X(u0, v0), ya], [X(u1, v0), ya], [X(u1, v1), yb], [X(u0, v1), yb]], colr, off, true); }
  };
  // a flat strip on the surface (zips, drawstrings) from (x0, y0) to (x1, y1)
  const seam = (x0, x1, y0, y1, r, colr, off) => { const N = Math.max(1, Math.ceil(Math.abs(y1 - y0) / 0.06)); for (let i = 0; i < N; i++) { const t0 = i / N, t1 = (i + 1) / N, xa = lerp(x0, x1, t0), xb = lerp(x0, x1, t1); decal([[xa - r, lerp(y0, y1, t0)], [xa + r, lerp(y0, y1, t0)], [xb + r, lerp(y0, y1, t1)], [xb - r, lerp(y0, y1, t1)]], colr, off + 0.002, true); } };
  if (spec.print === 'bolt') { const cy = 0.66, sc = 1.35, q = (pts) => decalQ(pts.map(([u, v]) => [u * sc, cy + v * sc]), c2, 0.006); q([[0.02, 0.13], [0.075, 0.13], [0.03, 0.02], [-0.015, 0.02]]); q([[-0.02, 0.035], [0.07, 0.035], [-0.03, -0.12], [-0.03, -0.01]]); q([[0.0, 0.05], [0.06, 0.05], [0.02, -0.02], [-0.04, -0.02]]); }
  if (spec.print === 'star') { const cy = 0.67, st = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.03 : 0.07; st.push([Math.cos(a) * r, cy + Math.sin(a) * r]); } decal(st, c2, 0.006); }
  if (f === 'jersey') {
    [1, -1].forEach((s) => loft(mb, [0.86, 0.9].map((y, i) => ({ y, rx: 0.09, rz: 0.085, cx: s * d.shX, sk: K(s > 0 ? 'shL' : 'shR'), c: i ? c2 : shade(c2, 0.8) })), { n: 8, caps: '' }));
    decalQ([[-0.06, 0.75], [0.06, 0.75], [0.06, 0.72], [-0.06, 0.72]], c2, 0.006); decalQ([[0.06, 0.72], [-0.012, 0.72], [-0.036, 0.6], [-0.084, 0.6]], c2, 0.006);
    [0.45, 0.5].forEach((y) => { const b = bodyR(y, d); loft(mb, [{ y: y - 0.012, rx: b.rx * w + ease + 0.003, rz: b.rz * w + ease + 0.003, cz: 0.005, sk: torsoSk(y), c: c2, sq: 0.8 }, { y: y + 0.008, rx: b.rx * w + ease + 0.003, rz: b.rz * w + ease + 0.003, cz: 0.005, sk: torsoSk(y), c: c2, sq: 0.8 }], { n, sq: 0.8, caps: '' }); });
  }
  if (f === 'hoodie') {
    // dropped hood: a cowl ring that wraps the neck (low in front, rolled high at the back) and folds down onto the upper back, all on the chest bone
    const hc = shade(col, 0.9), hw = w > 1.25 ? 1.08 : 1, tilt = [0.34, 0, 0], at = [0, 0.905, -0.012];
    loft(mb, [[-0.035, 0.165, 0.155, -0.02, shade(col, 0.82)], [0.012, 0.158, 0.15, -0.022, hc], [0.048, 0.132, 0.132, -0.016, lite(col, 0.03)]].map(([y, rx, rz, cz, c]) => ({ y, rx: rx * hw, rz: rz * hw, cz, sk: K('chest'), c })), { n: 8, sq: 0.85, caps: '', m: mat(at, tilt) });
    lining(mb, [{ y: 0.046, rx: 0.126 * hw, rz: 0.126 * hw, cz: -0.016, sk: K('chest'), c: shade(col, 0.45) }, { y: -0.01, rx: 0.112, rz: 0.11, cz: -0.012, sk: K('chest'), c: shade(col, 0.32) }], { n: 8, sq: 0.85, m: mat(at, tilt) });
    ball(mb, [0, 0.85, -0.13 * w - 0.012], [0.15 * hw, 0.085, 0.05], hc, K('chest'), { detail: 0, col2: col });
    [0.045, -0.045].forEach((x) => seam(x, x * 1.1, 0.86, 0.7, 0.007, '#f2e6d0', 0.002));
    // kangaroo pocket: a tapered patch on the belly with darker hand openings at its sides
    const pw = 0.11 * Math.min(w, 1.2); patch(-pw, pw, Math.max(hemY + 0.02, 0.47), 0.575, shade(col, 0.86), 0.006, 0.72); [1, -1].forEach((s) => decal([[s * pw, Math.max(hemY + 0.02, 0.47)], [s * pw * 0.84, Math.max(hemY + 0.02, 0.47)], [s * pw * 0.66, 0.575], [s * pw * 0.72, 0.575]], shade(col, 0.6), 0.008));
  }
  if (f === 'jacket') {
    ball(mb, [0, 0.905, -0.03], [0.125, 0.045, 0.11], shade(spec.lapel || spec.collar ? c2 : col, 0.9), K('chest'), { detail: 0, nh: true });
    if (spec.zip) seam(0, 0, 0.89, hemY + 0.015, 0.006, spec.block ? shade(c2, 0.6) : '#cfcfdc', 0.001);
    if (spec.letter) { decalQ([[0.07, 0.76], [0.14, 0.76], [0.14, 0.73], [0.07, 0.73]], c2, 0.006); decalQ([[0.07, 0.73], [0.1, 0.73], [0.1, 0.64], [0.07, 0.64]], c2, 0.006); }
    if (spec.pockets) [1, -1].forEach((s) => { patch(s * 0.1 - 0.035, s * 0.1 + 0.035, 0.69, 0.75, shade(col, 0.88), 0.006); patch(s * 0.1 - 0.037, s * 0.1 + 0.037, 0.735, 0.755, shade(col, 0.7), 0.009); });
    if (spec.lapel) [1, -1].forEach((s) => decalQ([[s * 0.02, 0.9], [s * 0.12, 0.9], [s * 0.062, 0.745], [s * 0.054, 0.745]], c2, 0.007));
  }
  // overalls: bib on the chest, straps that run over the shoulders on the cloth surface (not through the body) down to the back
  if (spec.bib) {
    patch(-0.11, 0.11, 0.58, 0.73, c2, 0.008); patch(-0.11, 0.11, 0.715, 0.73, shade(c2, 0.8), 0.01);
    const sx = 0.125; [1, -1].forEach((s) => { tubePT(mb, [onS(s * 0.085, 0.72, 0.012), onS(s * 0.11, 0.82, 0.01), [s * sx, 0.893, surf(s * sx, 0.885) * 0.62], [s * sx, 0.912, 0], [s * sx, 0.893, surf(s * sx, 0.885, true) * 0.62], onS(s * 0.11, 0.8, 0.01, true), onS(s * 0.07, 0.66, 0.012, true)], 0.011, c2, { n: 4, a0: Math.PI / 4, sk: K('chest'), nh: true }); box(mb, onS(s * 0.085, 0.722, 0.016), [0.026, 0.026, 0.01], '#e8d27a', K('chest')); });
  }
  if (f === 'dress') { void 0; }
}
function patFC(pat, col, c2, i, j, mb) {
  if (pat === 'plaid') return (i + j) % 2 ? mix(col, c2, 0.55) : shade(col, 0.9);
  if (pat === 'flower') { const r = ((i * 7 + j * 13) % 5); return r === 0 ? c2 : r === 1 ? mix(col, '#ffd23f', 0.5) : null; }
  return null;
}

// the shoe collar a pant leg meets: shaft top height and radius (0 for low shoes), and whether narrow pants tuck into it
function shaftOf(look) {
  const sp = SHOES[(look.shoes && look.shoes.id) || 'sneakers'] || SHOES.sneakers, SY = 0.04 + (sp.plat ? 0.045 : 0), tall = sp.f === 'boot' ? 0.16 + (sp.tall || 0) : sp.f === 'high' ? 0.11 : 0;
  const r = sp.f === 'boot' ? 0.074 : 0.068, b = BOTTOMS[(look.bottom && look.bottom.id) || 'jeans'] || BOTTOMS.jeans, last = (legRad(0.19) + 0.014) * b.w * (b.flare || 1);
  return { top: tall ? SY + 0.06 + tall : 0, r, tuck: tall > 0 && last <= r + 0.015, low: !tall && sp.f !== 'sandal' };
}
// ------------------------------------------------------------------ bottoms
export function buildBottom(mb, ctx, d) {
  const look = ctx.look, id = (look.bottom && look.bottom.id) || 'jeans', spec = BOTTOMS[id] || BOTTOMS.jeans, col = C(look.bottom && look.bottom.color || '#34303f'), sk = ctx.skin;
  const camoCols = [lite(col, 0.02), shade(col, 0.55), lite(mix(col, '#a9b35a', 0.5), 0.0), shade(mix(col, '#5a3a22', 0.6), 0.7)], rr = (i, j) => camoCols[(((i * 7 + j * 3) ^ (i * j + 5)) >>> 0) % 4];
  const f = spec.f, w = spec.w;
  const beltC = shade(col, 0.55);
  // under the top the bottom is a layer: wherever the top covers it, every ring is clamped inside the top's shell and skinned exactly like the top there,
  // so the two move together and the bottom never pokes through (a waistband, baggy thighs, a skirt under a dress or a long coat)
  const sh = topShell(look, d), under = (y) => y >= sh.hem - 0.002, hid = (x, y) => y >= sh.hem - 0.012, topSk = (x, y, z) => drapeSk()(x, y, z) || torsoSk(y);
  // pelvis / waist (a crop top sits on low-rise bottoms so the bare midriff band shows between the two)
  const crop = sh.hem > 1, topY = crop ? 0.535 : 0.6, pys = crop ? [topY, 0.5, 0.45, 0.4] : [0.6, 0.55, 0.5, 0.45, 0.4];
  const pr = pys.map((y) => { const b = bodyR(Math.max(y, 0.4), d), [rx, rz] = sh.fit(y, 0, b.rx * (f === 'skirt' ? 1.0 : Math.max(1, w * 0.92)) + 0.012, b.rz * Math.max(1, w * 0.92) + 0.012, 0.975, 0.01); return { y, rx, rz, cz: 0.004, sk: under(y) ? torsoSk(y) : y > 0.5 ? K2('hips', 'spine', 0.5) : K('hips'), c: y > topY - 0.03 ? beltC : mix(col, shade(col, 0.8), (0.55 - y) / 0.2 * 0.5) }; });
  const mp = mark(mb); loft(mb, f === 'skirt' ? pr.slice(0, 3) : pr, { n: 8, sq: Math.max(0.85, sh.sq), caps: 'bt', capCol: beltC, capColB: shade(col, 0.6) }); reskin(mb, mp, (x, y, z) => (under(y) ? topSk(x, y, z) : null)); unhull(mb, mp, hid);
  if (f === 'skirt') {
    // A-line skirt: its top edge overlaps the waistband, it widens to clear the thighs; 12 sides so pleats read, lower rows drape with the thighs
    const hemY = 0.3, m0 = mark(mb), G = [[0.525, 0.005], [0.42, 0.034], [0.35, 0.068], [hemY, 0.1]];
    // a top's hem between two rows gets its own row there: the skirt stays inside the top above it and flares out right under it
    for (let i = 0; i < G.length - 1; i++) if (sh.hem < G[i][0] - 0.01 && sh.hem > G[i + 1][0] + 0.004) { G.splice(i + 1, 0, [sh.hem - 0.004, lerp(G[i][1], G[i + 1][1], (G[i][0] - sh.hem) / (G[i][0] - G[i + 1][0]))]); break; }
    const rows = G.map(([y, g], i) => { const b = bodyR(Math.max(y, 0.4), d), [rx, rz] = sh.fit(y, 0, b.rx + 0.012 + g * 1.1, b.rz + 0.012 + g, 0.9, 0.01, 0.006); return { y, rx, rz, cz: 0.004, sk: K2('hips', 'hem', clamp((0.525 - y) / 0.225, 0, 1)), c: spec.plaid ? col : mix(col, shade(col, 0.82), (0.525 - y) / 0.225) }; });
    loft(mb, rows, { n: 12, sq: 0.9, caps: '', fc: spec.plaid ? (i, j) => ((i + j) % 2 ? shade(mix(col, '#d4a017', 0.35), 0.9) : col) : undefined });
    const skirtSk = (x, y, z) => (under(y) ? topSk(x, y, z) : drapeSk()(x, y, z)); reskin(mb, m0, skirtSk); unhull(mb, m0, hid);
    // inner lining (z-mirrored loft = inward facing): looking up the skirt shows dark cloth, never a see-through void
    const m1 = lining(mb, rows.map((r) => Object.assign({}, r, { rx: r.rx * 0.95 - 0.004, rz: r.rz * 0.95 - 0.004, c: shade(col, 0.5) })), { n: 8, sq: 0.9 }); reskin(mb, m1, skirtSk);
    return;
  }
  const end = f === 'shorts' ? 0.3 : spec.end, sf = shaftOf(look);
  // pants meet the shoes: narrow legs tuck into a boot or high top shaft (inside it, no hull), wide legs clear it; the hem hidden in a low shoe has no hull
  const fitShoe = (y, r) => (f !== 'pants' || !sf.top || y > sf.top + 0.005 ? r : sf.tuck ? Math.min(r, sf.r - 0.012) : Math.max(r, sf.r * 1.1 + 0.02));
  [1, -1].forEach((s) => {
    const rs = f === 'shorts' ? [0.47, 0.4, 0.34, 0.3] : [0.47, 0.37, 0.27, 0.19, end + 0.0];
    const R = rs.map((y, i, a) => {
      const base = legRad(y), flare = spec.flare && y < 0.2 ? 1 + (0.2 - y) / 0.12 * (spec.flare - 1) : 1, cuff = spec.cuff && i === a.length - 1 ? 0.78 : 1;
      let r = (base + 0.014) * (w * (f === 'shorts' ? 1.05 : 1)) * flare * cuff; if (f === 'pants' && y > 0.4) r = Math.max(r, 0.088); r = Math.max(r, y > 0.35 ? 0.082 : 0.06);
      const [fx, fz] = sh.fit(y, d.hipX, r, r, 0.9, 0.012, 0.07); r = Math.max(0.05, Math.min(fx, fz)); r = fitShoe(y, r);
      const c = spec.shiny ? mix(col, '#fff2a8', 0.12 * (i % 2)) : mix(shade(col, 0.92), col, 0.5); return { y, rx: r, rz: r, cx: s * d.hipX, sk: legSkin(s, y), c: i === a.length - 1 && (spec.cuff || f === 'shorts') ? shade(col, 0.72) : c };
    });
    const ml = mark(mb); loft(mb, R, { hullHalf: R.length >= 4, n: 6, caps: 'bt', capCol: shade(col, 0.5), capColB: col, fc: spec.camo ? (i, j) => rr(i + (s > 0 ? 0 : 3), j) : spec.plaid ? undefined : undefined });
    reskin(mb, ml, (x, y, z) => (under(y) ? topSk(x, y, z) : null)); unhull(mb, ml, (x, y, z) => hid(x, y, z) || (f === 'pants' && (sf.tuck || (sf.low && R[R.length - 1].rx < 0.085)) && y < Math.max(sf.top, 0.125)));
    const rAt = (y) => { for (let i = 0; i < R.length - 1; i++) if (y <= R[i].y && y >= R[i + 1].y) return lerp(R[i + 1].rx, R[i].rx, (y - R[i + 1].y) / (R[i].y - R[i + 1].y)); return R[R.length - 1].rx; };
    // side details start below a long top's hem (they would poke through it) and sit on the leg's actual surface
    const dTop = Math.min(0.45, sh.hem - 0.03);
    if (spec.pockets && dTop > 0.33) { const py = Math.min(0.35, dTop - 0.05); box(mb, [s * (d.hipX + rAt(py) - 0.004), py, 0.0], [0.03, 0.1, 0.085], spec.camo ? camoCols[1] : shade(col, 0.82), K(side(s, 'th')), { rot: [0, 0, s * 0.05] }); }
    if (spec.stripe && dTop > 0.2) { const ys = [dTop, (dTop + 0.14) / 2, 0.14]; tubePT(mb, ys.map((y) => [s * (d.hipX + rAt(y) + 0.003), y, 0.0]), 0.009, lite(col, 0.55), { n: 3, sk: (t) => legSkin(s, lerp(ys[0], 0.14, t)), nh: true }); }
    if (spec.stitch) { /* denim seam */ }
    // rib cuff: same 6 sides and skin as the leg, just proud of it (an 8-sided ring at the leg's own radius z-fought with it)
    if (spec.cuff) { const r = R[R.length - 1].rx + 0.007; loft(mb, [end + 0.03, end - 0.004].map((y) => ({ y, rx: r, rz: r, cx: s * d.hipX, sk: legSkin(s, y), c: shade(col, 0.7) })), { n: 6, caps: '' }); }
    // ripped: frayed knee holes showing skin, laid on the front facet of the knee
    if (spec.rip) { const y = 0.236, r = lerp(R[3].rx, R[2].rx, (y - 0.19) / 0.08), z = r * Math.cos(Math.PI / 6) + 0.004; mb.poly([[-0.03, 0.02], [0.012, 0.03], [0.034, 0.006], [0.02, -0.024], [-0.026, -0.018]].map(([u, v]) => [s * d.hipX + u, y + v, z]), sk, K(side(s, 'kn')), [0, 0, 1], { nh: true }); }
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
    const an = K(side(s, 'an')), ax = s * d.hipX, plat = spec.plat ? 0.045 : 0, fat = (spec.fat ? 1.1 : 1) * 1.14, SY = 0.04 + plat, Z = 1.2, HH = 1.28;
    const foot = [[0, -0.1], [0.046, -0.085], [0.07, -0.01], [0.075, 0.08], [0.058, 0.165], [0, 0.2], [-0.058, 0.165], [-0.075, 0.08], [-0.07, -0.01], [-0.046, -0.085]].map(([x, z]) => [x * fat, z * Z]);
    if (f === 'sandal') {
      slab(mb, foot, 0, SY * 0.7, ax, shade(sole, 0.95), shade(sole, 0.75), an);
      const R = (z, rx, ry, cy, c) => ({ y: z, rx, rz: ry, cx: ax, cz: -cy, sk: an, c });
      loft(mb, [R(-0.07, 0.042, 0.03, 0.06, spec.socks ? '#f2e6d0' : shade(sk, 0.9)), R(0.04, 0.06, 0.03, 0.062, spec.socks ? '#f2e6d0' : sk), R(0.15, 0.05, 0.024, 0.05, spec.socks ? '#f2e6d0' : sk), R(0.18, 0.025, 0.018, 0.045, sk)], { n: 6, m: mat([0, 0, 0], [Math.PI / 2, 0, 0]), caps: 'bt' });
      box(mb, [ax, SY + 0.045, 0.06], [0.15, 0.014, 0.034], col, an); return;
    }
    slab(mb, foot, 0, SY, ax, shade(sole, 0.95), sole, an);
    const R = (z, rx, ry, cy, c) => ({ y: z * Z, rx: rx * fat, rz: ry * HH, cx: ax, cz: -(SY + cy * HH), sk: an, c, sq: 0.8 });
    const loaf = f === 'loafer';
    const upper = [R(-0.1, 0.046, 0.04, 0.04, shade(body, 0.8)), R(-0.055, 0.064, 0.056, 0.05, shade(body, 0.92)), R(0.02, 0.068, 0.056, 0.052, body), R(0.1, 0.073, 0.05, 0.044, lite(body, 0.04)), R(0.17, 0.06, 0.04, 0.034, lite(body, 0.06)), R(0.2, 0.03, 0.026, 0.026, lite(body, 0.08))];
    loft(mb, upper, { hullHalf: true, n: 6, m: mat([0, 0, 0], [Math.PI / 2, 0, 0]), caps: 'bt', sq: 0.8, capCol: lite(body, 0.05) });
    // toe cap and heel tab, side swoosh panel in the accent colour
    [1, -1].forEach((q) => mb.poly([[ax + q * 0.078 * fat, SY + 0.095, -0.06], [ax + q * 0.08 * fat, SY + 0.06, 0.06], [ax + q * 0.08 * fat, SY + 0.022, 0.03], [ax + q * 0.078 * fat, SY + 0.034, -0.08]], c2, an, [q, 0, 0], { nh: true, flat: true }));
    // collar
    const tall = f === 'boot' ? 0.16 + (spec.tall || 0) : f === 'high' ? 0.11 : 0.0;
    if (tall > 0) {
      const top = SY + 0.06 + tall, sr = f === 'boot' ? 0.074 : 0.068;
      // the shaft hugs the shin: its weights match the leg skin (ankle at the foot, shin bone above), so a bent knee never pushes the shin out through the front
      const kn = side(s, 'kn'), shin = (y) => (y < 0.12 ? K2(kn, side(s, 'an'), 0.85) : y < 0.16 ? K2(kn, side(s, 'an'), 0.5) : K(kn));
      loft(mb, [{ y: SY + 0.04, rx: 0.07, rz: 0.066, cx: ax, cz: -0.01, sk: an, c: shade(body, 0.85) }, { y: SY + 0.1, rx: sr + 0.006, rz: sr * 0.98, cx: ax, cz: 0, sk: shin(SY + 0.1), c: body }, { y: top - 0.012, rx: sr, rz: sr * 0.96, cx: ax, cz: 0, sk: shin(top), c: lite(body, 0.05) }, { y: top, rx: sr * 1.1, rz: sr * 1.08, cx: ax, cz: 0, sk: shin(top), c: f === 'boot' ? shade(body, 0.7) : c2 }], { n: 6, caps: 'b' });
      // dark collar lining so the open top reads as an opening
      lining(mb, [{ y: top - 0.002, rx: sr * 1.04, rz: sr * 1.02, cx: ax, cz: 0, sk: shin(top), c: shade(body, 0.35) }, { y: top - 0.05, rx: sr * 0.96, rz: sr * 0.94, cx: ax, cz: 0, sk: shin(top - 0.05), c: shade(body, 0.3) }], { n: 6 });
    }
    // laces and tongue
    if (!loaf) { mb.poly([[ax - 0.03, SY + 0.095, 0.0], [ax + 0.03, SY + 0.095, 0.0], [ax + 0.026, SY + 0.062, 0.1], [ax - 0.026, SY + 0.062, 0.1]], spec.lace ? c2 : C('#f2e6d0'), an, [0, 1, 0.3], { nh: true, flat: true }); [0.02, 0.055, 0.085].forEach((z, i) => mb.poly([[ax - 0.032, SY + 0.094 - i * 0.013, z - 0.006], [ax + 0.032, SY + 0.094 - i * 0.013, z - 0.006], [ax + 0.032, SY + 0.094 - i * 0.013, z + 0.006], [ax - 0.032, SY + 0.094 - i * 0.013, z + 0.006]], shade(body, 0.65), an, [0, 1, 0], { nh: true, flat: true })); }
    else box(mb, [ax, SY + 0.07, 0.07], [0.05, 0.02, 0.035], shade(body, 0.7), an);
  });
}
void ball; void box; void tube; void sstep; void MB;

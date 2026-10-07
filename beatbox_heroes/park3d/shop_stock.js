// Thrift Shop stock (Interior Artist INT-A): hats and the 20-peg hat wall, shirts, jeans, folded piles, the two clothes rails, the shades case, a mannequin.
// All writers push into the flat_kit stores (S.B main, S.GLOW emissive, S.DEC decals, S.SOFT contact shadows, S.GLASS panes).
import { P, mix, mul, bar, col } from './flat_kit.js';
import { sneaker } from './flat_living.js';
import { wallDecal } from './shop_shell.js';

const C = (h) => col(h);
export const FIT = { // clothes colours: loud, mismatched, thrifty
  shirt: [C('#e8604a'), C('#34a199'), C('#dba53f'), C('#8f5a98'), C('#ff4f8b'), C('#6f7fc0'), C('#9bc18c'), C('#efe1c4'), C('#c8704a'), C('#35b6d8')],
  denim: [C('#4a62a3'), C('#34467d'), C('#6f86c0'), C('#2d3a63'), C('#8da0d0')], aloha: [C('#ff7a4a'), C('#2fb8a6'), C('#ff5a8a'), C('#f2c14a')],
};

// ---------------------------------------------------------------- hats. hat frame: crown up (+y), brim forward (+z). kind: cap | snap | beanie | bucket | fedora | trucker
export function hat(B, kind, x, y, z, ry, rx, c, c2, s) {
  s = s || 1; B.push(x, y, z, ry, s, rx);
  if (kind === 'cap' || kind === 'snap' || kind === 'trucker') {
    const front = kind === 'trucker' ? C('#f1e8d8') : c;
    B.lathe([[0.1, 0, mul(c, 0.8)], [0.1, 0.05, c], [0.088, 0.1, front], [0.045, 0.14, front], [0.0, 0.152, c2]], 8, 0, 0, 0, { tint: 0.02 });
    B.box(0, 0.0, 0.17, 0.2, 0.016, 0.17, kind === 'snap' ? c2 : mix(c, c2, 0.5), { base: 0.1, taper: 0.75, rx: -0.12 }); B.box(0, 0.145, 0, 0.022, 0.02, 0.022, c2, { base: 0 });
  } else if (kind === 'beanie') {
    B.lathe([[0.1, 0, c2], [0.104, 0.05, c2], [0.094, 0.052, c], [0.09, 0.12, c], [0.06, 0.17, c], [0.0, 0.195, mul(c, 1.08)]], 8, 0, 0, 0, { tint: 0.03 }); B.blob(0, 0.205, 0, 0.032, 0.03, 0.032, c2, mul(c2, 1.1), { detail: 0, jit: 0.1 });
  } else if (kind === 'bucket') {
    B.lathe([[0.19, 0, mul(c2, 0.9)], [0.105, 0.02, c], [0.1, 0.11, c], [0.082, 0.12, mul(c, 1.08)], [0.0, 0.12, mul(c, 1.1)]], 8, 0, 0, 0, { tint: 0.03 });
  } else { // fedora: pinched crown, wide brim, ribbon
    B.lathe([[0.2, 0, mul(c, 0.85)], [0.18, 0.012, c], [0.1, 0.02, c], [0.1, 0.07, c2], [0.095, 0.075, c], [0.085, 0.14, c], [0.05, 0.145, mul(c, 1.1)], [0.0, 0.14, mul(c, 0.9)]], 8, 0, 0, 0, { tint: 0.03 });
  }
  B.pop();
}
const KINDS = ['cap', 'beanie', 'bucket', 'fedora', 'trucker', 'snap'];

// ---------------------------------------------------------------- the hat wall: pegboard, 4 rows of 5 pegs, a hand-painted sign, price tags, a gallery of caps on top
export function buildHatWall(S, F) {
  const B = S.B, f = F.N, R = S.rand, X0 = -4.8, X1 = -1.2, Y0 = 0.82, Y1 = 2.26, cx = (X0 + X1) / 2;
  // board with a thin wood frame; the pegboard decal carries the hole pattern
  const u = cx - F.N.ox; wallDecal(S, f, 'pegboard', u, 0.045, (Y0 + Y1) / 2, X1 - X0, Y1 - Y0, [1.0, 0.98, 0.95]);
  B.box(cx, Y0 - 0.04, -3.94, X1 - X0 + 0.14, 0.05, 0.1, P.woodD, { base: 0.2, tint: 0.03 }); B.box(cx, Y1 - 0.01, -3.94, X1 - X0 + 0.14, 0.05, 0.1, P.woodD, { base: 0.1, tint: 0.03 });
  B.box(X0 - 0.04, Y0, -3.94, 0.06, Y1 - Y0, 0.1, P.woodD, { base: 0.2 }); B.box(X1 + 0.04, Y0, -3.94, 0.06, Y1 - Y0, 0.1, P.woodD, { base: 0.2 });
  // the four shelves of fitted caps get a plank ledge so they do not float
  const rows = [1.96, 1.63, 1.3, 0.97], cols = [-4.35, -3.65, -3.0, -2.35, -1.65], tags = [0, 1, 2, 3], hats = [];
  const hc = [[P.pink, P.ink], [P.cyan, P.ink], [P.yellow, P.coral], [P.ink, P.pink], [P.teal, P.cream], [P.coral, P.cream], [P.violet, P.yellow], [P.lime, P.ink], [C('#f1e8d8'), P.red], [P.denim, P.cream], [P.mustard, P.ink], [P.pinkL, P.violet], [P.sage, P.woodD], [P.indigo, P.yellow], [P.red, P.cream], [P.orange, P.ink], [P.plum, P.cream], [P.tealL, P.pink], [C('#8a5a3a'), P.cream], [P.black, P.cyan]];
  let k = 0, pegs = 0;
  rows.forEach((y, r) => cols.forEach((x, c) => {
    const px = x + (r % 2 ? 0.1 : -0.04);
    bar(B, [px, y + 0.05, -3.9], [px, y + 0.05, -3.74], 0.024, 0.024, P.woodL); B.box(px, y + 0.03, -3.76, 0.045, 0.045, 0.012, P.steelL, { base: 0 }); pegs++;
    const empty = (r === 3 && c === 4) || (r === 1 && c === 0) || (r === 2 && c === 2); if (empty) return; // two or three bare pegs: the shop is never full
    const kind = KINDS[(k * 5 + r) % 6], col2 = hc[k % hc.length]; k++;
    hat(B, kind, px, y - 0.1, -3.66, (R() - 0.5) * 0.7, 0.62 + R() * 0.15, col2[0], col2[1], 1.65 + R() * 0.15);
    hats.push([px, y]);
    if (R() < 0.55) S.decal('price' + ((R() * 4) | 0), px + 0.1, y - 0.2, -3.7, 0.12, 0.075, (R() - 0.5) * 0.5, 0, [1.05, 1.05, 1.05], (R() - 0.5) * 0.6);
  }));
  S.pegCount = pegs; S.hatCount = hats.length;
  wallDecal(S, f, 'hatsign', u, 0.05, 2.46, 1.1, 0.33, [1.05, 1.05, 1.05]);
  // a shelf under the board with hat boxes and a stack of sun visors
  B.box(cx, 0.36, -3.78, X1 - X0, 0.04, 0.36, P.woodL, { base: 0.2, tint: 0.03 }); B.box(X0 + 0.1, 0, -3.78, 0.06, 0.38, 0.34, P.woodD, { base: 0.3 }); B.box(X1 - 0.1, 0, -3.78, 0.06, 0.38, 0.34, P.woodD, { base: 0.3 });
  for (let i = 0; i < 6; i++) B.box(-4.5 + i * 0.5, 0.4, -3.78, 0.34, 0.2 + (i % 3) * 0.05, 0.28, [P.cream, P.mustard, P.coral, P.teal, P.pinkL, P.ink][i], { base: 0.1, tint: 0.05, ry: (i - 2) * 0.05 });
  [[-4.5, 0.62], [-3.5, 0.65], [-2.5, 0.6]].forEach(([x, y], i) => hat(B, ['bucket', 'fedora', 'cap'][i], x, y, -3.78, 0.2 * i, 0, hc[(i * 3 + 5) % 20][0], hc[(i * 3 + 5) % 20][1], 0.95));
  S.soft(cx, -3.7, 1.9, 0.35, 0.35);
}

// ---------------------------------------------------------------- garments
export function shirt(B, x, yt, z, ry, c, c2, o) {
  o = o || {}; const L = o.len || 0.6, w = o.w || 0.4, f = o.flowers;
  B.push(x, yt, z, ry);
  bar(B, [0, -0.01, 0], [0, 0.07, 0], 0.011, 0.011, P.steelD); bar(B, [-0.2, -0.07, 0], [0, -0.01, 0], 0.012, 0.012, P.steelL); bar(B, [0.2, -0.07, 0], [0, -0.01, 0], 0.012, 0.012, P.steelL);
  B.box(0, -0.1 - L, 0, w, L, 0.1, c, { base: 0.3, tint: 0.04, top: mix(c, P.cream, 0.15) });
  [-1, 1].forEach((sd) => { B.push(sd * w * 0.5, -0.1, 0, 0, 1, 0, sd * 0.95); B.box(0, -0.2, 0, 0.14, 0.2, 0.1, o.sleeve || c, { base: 0.2, tint: 0.04 }); B.pop(); });
  B.box(0, -0.13, 0, 0.14, 0.04, 0.12, c2 || mix(c, P.cream, 0.45), { base: 0 });
  if (f) for (let i = 0; i < 3; i++) { const fx = (i - 1) * 0.12 + (i % 2) * 0.03, fy = -0.3 - ((i * 37) % 5) * 0.07; B.box(fx, fy, 0.052, 0.07, 0.07, 0.012, f[i % f.length], { base: 0, ry: i }); B.box(fx, fy, -0.052, 0.07, 0.07, 0.012, f[(i + 1) % f.length], { base: 0, ry: i }); }
  B.pop();
}
export function jeans(B, x, yt, z, ry, c, c2) {
  B.push(x, yt, z, ry);
  bar(B, [0, -0.01, 0], [0, 0.07, 0], 0.011, 0.011, P.steelD); bar(B, [-0.17, -0.05, 0], [0.17, -0.05, 0], 0.012, 0.012, P.steelL);
  B.box(0, -0.2, 0, 0.36, 0.14, 0.09, mul(c, 1.05), { base: 0.2, tint: 0.03 }); B.box(-0.09, -0.86, 0, 0.16, 0.66, 0.085, c, { base: 0.25, tint: 0.04, taper: 0.88 }); B.box(0.09, -0.86, 0, 0.16, 0.66, 0.085, mul(c, 0.95), { base: 0.25, tint: 0.04, taper: 0.88 });
  B.box(0, -0.2, 0.048, 0.36, 0.015, 0.01, c2 || P.mustard, { base: 0 });
  B.pop();
}
export function folded(B, x, y, z, ry, cs, n) { for (let i = 0; i < n; i++) B.box(x + (i % 2 ? 0.01 : -0.01), y + i * 0.065, z, 0.34, 0.06, 0.28, cs[i % cs.length], { base: 0.15, tint: 0.05, ry: ry + (i - 1) * 0.06, top: mix(cs[i % cs.length], P.cream, 0.15) }); return y + n * 0.065; }
export function shades(B, x, y, z, ry, c, lens, s) {
  s = s || 1; B.push(x, y, z, ry, s); B.box(-0.032, 0, 0, 0.05, 0.03, 0.008, lens, { base: 0 }); B.box(0.032, 0, 0, 0.05, 0.03, 0.008, lens, { base: 0 }); B.box(0, 0.008, 0, 0.02, 0.008, 0.008, c, { base: 0 }); B.box(-0.058, 0.005, -0.04, 0.006, 0.006, 0.08, c, { base: 0 }); B.box(0.058, 0.005, -0.04, 0.006, 0.006, 0.08, c, { base: 0 }); B.box(-0.032, -0.0005, 0.0, 0.056, 0.036, 0.006, c, { base: 0 }); B.box(0.032, -0.0005, 0.0, 0.056, 0.036, 0.006, c, { base: 0 }); B.pop();
}

// ---------------------------------------------------------------- clothes rails. dir 'x': rail along x at fixed z (tops, facing the aisle). Returns the collider rect.
function rail(S, x0, x1, z, h, items, o) {
  const B = S.B, hit = S.hit, R = S.rand, len = x1 - x0, cxm = (x0 + x1) / 2; o = o || {};
  S.soft(cxm, z, len / 2 + 0.2, 0.5, 0.4);
  [x0, x1].forEach((x) => { B.box(x, 0.0, z, 0.04, h, 0.04, P.steelD, { base: 0.2 }); B.box(x, 0.0, z, 0.06, 0.03, 0.62, P.steelD, { base: 0 }); [-0.28, 0.28].forEach((dz) => B.box(x, 0, z + dz, 0.07, 0.04, 0.07, P.ink, { base: 0 })); });
  bar(S.B, [x0, h, z], [x1, h, z], 0.026, 0.026, P.steelL); bar(S.B, [x0, 0.28, z], [x1, 0.28, z], 0.02, 0.02, P.steelD);
  const n = Math.floor(len / 0.15); for (let i = 0; i < n; i++) items(x0 + 0.12 + i * ((len - 0.24) / (n - 1)), h, z, i, R);
  hit.box(cxm, z, len / 2 + 0.05, 0.3, 0);
}
export function buildRacks(S) {
  const B = S.B, hit = S.hit, R = S.rand;
  // tops rail (z = -1.3): shirts in every colour, a few Hawaiian ones that want attention
  rail(S, -2.85, -0.35, -1.3, 1.5, (x, h, z, i, r) => {
    const aloha = i % 5 === 2, c = aloha ? FIT.aloha[(i / 5 | 0) % 4] : FIT.shirt[(i * 3 + 1) % 10];
    shirt(B, x, h - 0.03, z, (i % 2 ? 0.9 : -0.8) + (r() - 0.5) * 0.3, c, aloha ? P.cream : null, { len: 0.55 + (i % 3) * 0.03, flowers: aloha ? [P.cream, P.yellow, P.teal] : null, w: aloha ? 0.44 : 0.4 });
  });
  // lower shelf on the tops rail: shoe pairs and a basket of scarves
  B.box(-1.6, 0.26, -1.3, 2.4, 0.025, 0.46, P.woodL, { base: 0.2, tint: 0.03 });
  [[-2.5, P.pink, P.cream, P.ink], [-2.0, P.cyan, P.ink, P.cream], [-1.5, P.yellow, P.cream, P.red], [-1.0, P.ink, P.lime, P.cream]].forEach(([x, a, b, c], i) => sneaker(B, x, 0.285, -1.3, 0.35 + i * 0.1, a, b, c));
  B.box(-0.62, 0.285, -1.3, 0.34, 0.16, 0.34, P.woodD, { base: 0.2 }); for (let i = 0; i < 5; i++) B.blob(-0.62 + (i % 2) * 0.05, 0.46, -1.3 + (i - 2) * 0.05, 0.1, 0.05, 0.07, FIT.shirt[i * 2 % 10], mul(FIT.shirt[i * 2 % 10], 1.12), { detail: 0, jit: 0.1 });
  // bottoms rail (z = 0.55): jeans, a few cords, belts on a hook bar
  rail(S, -2.85, -0.35, 0.55, 1.5, (x, h, z, i, r) => jeans(B, x, h - 0.03, z, (i % 2 ? 0.7 : -0.7) + (r() - 0.5) * 0.3, FIT.denim[(i * 2 + 1) % 5], i % 4 === 0 ? P.coral : P.mustard));
  B.box(-1.6, 0.26, 0.55, 2.4, 0.025, 0.46, P.woodL, { base: 0.2, tint: 0.03 }); folded(B, -2.4, 0.285, 0.55, 0.1, [FIT.denim[1], FIT.denim[3], FIT.shirt[1]], 4); folded(B, -1.5, 0.285, 0.55, -0.1, [FIT.shirt[3], FIT.shirt[0]], 3); folded(B, -0.7, 0.285, 0.55, 0.05, [FIT.denim[0], P.sage], 4);
  // price tags and hang tags on the rail ends
  S.decal('tag_blank', -2.7, 1.2, -1.0, 0.1, 0.065, 0.2, 0, [1, 1, 1]); S.decal('price1', -0.5, 1.2, -0.97, 0.12, 0.075, -0.3, 0, [1, 1, 1]); S.decal('price0', -2.7, 1.2, 0.85, 0.12, 0.075, 0.3, 0, [1, 1, 1]);
  // round table of folded tees and a Hawaiian-shirt wheel at the north window
  { const tx = 1.0, tz = -1.45; S.soft(tx, tz, 0.8, 0.8, 0.4); B.cyl(tx, 0, tz, 0.45, 0.5, 0.74, 10, P.woodD); B.cyl(tx, 0.74, tz, 0.62, 0.62, 0.05, 10, P.woodL, { tint: 0.03 });
    folded(B, tx - 0.22, 0.79, tz - 0.12, 0.2, [FIT.shirt[0], FIT.shirt[2], FIT.shirt[5]], 4); folded(B, tx + 0.2, 0.79, tz - 0.05, -0.3, [FIT.shirt[1], FIT.shirt[4], FIT.shirt[7]], 3); folded(B, tx, 0.79, tz + 0.24, 0.05, [FIT.shirt[3], FIT.shirt[8]], 5); hit.circle(tx, tz, 0.62); }
  { const hx = 1.0, hz = 0.45; S.soft(hx, hz, 0.7, 0.7, 0.35); B.cyl(hx, 0, hz, 0.28, 0.28, 0.04, 8, P.steelD); B.cyl(hx, 0.04, hz, 0.025, 0.025, 1.45, 6, P.steelL); for (let k = 0; k < 5; k++) { const a = k * 1.2566; bar(B, [hx, 1.45, hz], [hx + Math.cos(a) * 0.5, 1.5, hz + Math.sin(a) * 0.5], 0.02, 0.02, P.steelL); B.box(hx + Math.cos(a) * 0.5, 1.46, hz + Math.sin(a) * 0.5, 0.025, 0.05, 0.025, P.steelL, { base: 0 }); }
    for (let k = 0; k < 5; k++) { const a = k * 1.2566 + 0.1; shirt(B, hx + Math.cos(a) * 0.46, 1.44, hz + Math.sin(a) * 0.46, -a + 1.57, FIT.aloha[k % 4], P.cream, { len: 0.52, flowers: [P.cream, P.yellow, P.pink] }); }
    S.decal('price3', hx + 0.12, 1.2, hz - 0.04, 0.12, 0.075, 0.3, 0, [1, 1, 1]); hit.circle(hx, hz, 0.7); }
}

// ---------------------------------------------------------------- shades case (glass-top counter with a velvet tray) and a spinner rack
export function buildShadesCase(S) {
  const B = S.B, G = S.GLOW, GL = S.GLASS, hit = S.hit, x = -0.55, z = 3.3, W = 1.5, D = 0.55, h = 0.82;
  S.soft(x, z, W / 2 + 0.3, D / 2 + 0.4, 0.4);
  B.box(x, 0, z, W, h, D, P.woodD, { base: 0.3, tint: 0.03, top: P.woodL }); B.box(x, h - 0.06, z, W - 0.12, 0.012, D - 0.12, C('#4a2a5e'), { base: 0, top: C('#6a3a7e') }); // velvet tray
  const lens = [C('#2a2040'), C('#ff7ab0'), C('#35c8e0'), C('#ffd23f')];
  for (let i = 0; i < 8; i++) shades(B, x - 0.58 + (i % 4) * 0.37, h - 0.04, z - 0.1 + Math.floor(i / 4) * 0.2, (i * 0.7) % 0.6 - 0.3, [P.ink, P.pink, P.cream, P.yellow, P.teal, P.coral, P.black, P.cyan][i], lens[i % 4], 1.15);
  const gy = h + 0.02, hw = W / 2, hd = D / 2, gc = [0.7, 0.9, 1.0, 0.2];
  GL.quad([x - hw, h + 0.0, z - hd], [x + hw, h + 0.0, z - hd], [x + hw, h + 0.22, z - hd], [x - hw, h + 0.22, z - hd], gc); GL.quad([x - hw, h, z + hd], [x - hw, h + 0.22, z + hd], [x + hw, h + 0.22, z + hd], [x + hw, h, z + hd], gc);
  GL.quad([x - hw, h + 0.22, z - hd], [x + hw, h + 0.22, z - hd], [x + hw, h + 0.22, z + hd], [x - hw, h + 0.22, z + hd], [0.8, 0.95, 1.0, 0.26]); GL.quad([x - hw, h, z - hd], [x - hw, h + 0.22, z - hd], [x - hw, h + 0.22, z + hd], [x - hw, h, z + hd], gc); GL.quad([x + hw, h, z - hd], [x + hw, h, z + hd], [x + hw, h + 0.22, z + hd], [x + hw, h + 0.22, z - hd], gc);
  [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].forEach(([dx, dz]) => B.box(x + dx, h, z + dz, 0.03, 0.23, 0.03, P.steelL, { base: 0 })); B.box(x, h + 0.22, z, W + 0.03, 0.02, D + 0.03, P.steelL, { base: 0 }); void gy;
  G.box(x - hw + 0.04, h - 0.06, z + hd - 0.05, W - 0.08, 0.008, 0.012, [0.5, 2.4, 2.8], { base: 0, tint: 0 }); // LED strip lights the tray
  hit.box(x, z, W / 2 + 0.03, D / 2 + 0.03, 0);
  // a card sign and the spinner rack beside it
  S.decal('tag_blank', x - 0.55, h + 0.26, z + 0.23, 0.14, 0.09, 0.0, -0.3, [1, 1, 1]);
  { const sx = 0.75, sz = 3.15; S.soft(sx, sz, 0.4, 0.4, 0.35); B.cyl(sx, 0, sz, 0.22, 0.22, 0.04, 8, P.ink); B.cyl(sx, 0.04, sz, 0.025, 0.025, 1.45, 6, P.steelL);
    for (let t = 0; t < 3; t++) for (let k = 0; k < 6; k++) { const a = k * 1.0472 + t * 0.5, y = 0.8 + t * 0.26; B.box(sx + Math.cos(a) * 0.17, y - 0.05, sz + Math.sin(a) * 0.17, 0.12, 0.1, 0.01, P.steelD, { base: 0, ry: -a + 1.57 }); shades(B, sx + Math.cos(a) * 0.19, y, sz + Math.sin(a) * 0.19, -a + 1.57, [P.pink, P.cyan, P.yellow, P.ink, P.coral, P.cream][(k + t) % 6], lens[(k + t * 2) % 4], 1.25); }
    B.box(sx, 1.46, sz, 0.1, 0.06, 0.1, P.pink, { base: 0.1, taper: 0.6 }); hit.circle(sx, sz, 0.3); }
}

// ---------------------------------------------------------------- mannequin in the window display, wearing a Hawaiian shirt and a bucket hat
export function mannequin(S, x, y0, z, ry) {
  const B = S.B; B.push(x, y0, z, ry);
  B.cyl(0, 0, 0, 0.2, 0.2, 0.03, 8, P.ink); B.cyl(0, 0.03, 0, 0.022, 0.022, 0.55, 6, P.steelD);
  B.lathe([[0.1, 0, FIT.aloha[0]], [0.17, 0.12, FIT.aloha[0]], [0.19, 0.3, mix(FIT.aloha[0], P.cream, 0.1)], [0.17, 0.45, FIT.aloha[0]], [0.1, 0.52, P.cream], [0.0, 0.52, P.cream]], 8, 0, 0.55, 0, { tint: 0.03, sz: 0.62 });
  [-1, 1].forEach((sd) => { B.push(sd * 0.19, 1.0, 0, 0, 1, 0, sd * 0.35); B.box(0, -0.28, 0, 0.08, 0.3, 0.08, FIT.aloha[0], { base: 0.1, tint: 0.03 }); B.box(0, -0.52, 0, 0.055, 0.24, 0.055, C('#e8c9a8'), { base: 0.1 }); B.pop(); });
  B.cyl(0, 1.05, 0, 0.04, 0.04, 0.06, 6, C('#e8c9a8')); B.blob(0, 1.2, 0, 0.1, 0.12, 0.1, C('#e8c9a8'), mul(C('#e8c9a8'), 1.1), { detail: 1, jit: 0.04 });
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.5, fx = Math.cos(a) * 0.17, fz = Math.sin(a) * 0.12; B.box(fx, 0.8 + (i % 2) * 0.14, fz, 0.06, 0.06, 0.015, [P.cream, P.yellow, P.pink, P.teal][i], { base: 0, ry: -a }); }
  hat(B, 'bucket', 0, 1.27, 0, 0.3, 0.1, P.yellow, P.coral, 1.0);
  B.pop(); S.soft(x, z, 0.35, 0.35, 0.35); S.hit.circle(x, z, 0.24);
}

// The Great Project of Hearthvale: ONE communal landmark in the plaza centre, built together by all 16 villages, in six stages.
//   0 construction plot (scaffolding, plinth, flags)      1 stone plinth with a fountain and bunting     2 clock tower with a bell
//   3 windmill-like Tower of Friendship (sails `spinz`)    4 lighthouse with a glowing lantern + sweeping `beam`
//   5 the Great Tree of Hearthvale: pastel blossom tree, fruit lanterns (`lanterns`), bunting, benches, a sparkling pond
// The same dais, lamp posts, flower planters and round plinth are reused by every stage, so the landmark visibly GROWS.
// Footprint about 4 x 4 units (dais radius 2.06), up to 9.4 units tall. Same look rules as buildings.js ("Happy Light"): pastel, round, bright.
// Named animated children (the game drives them): flag (wave, rotation.y), bell (swing, rotation.z), spinz (sails, rotation.z), beam (sweep, rotation.y),
// lanterns (sway, rotation.z / x). Stages: 0 flag | 1 flag | 2 bell, flag | 3 spinz, flag | 4 flag, beam | 5 lanterns, flag. Shared glow materials: windowMat, lanternMat (emissiveIntensity driven by day/night), waterMat.
// Budget: <= 6000 triangles per stage, <= 14 meshes after merge. Use monumentTopY(stage) for the upgrade-star height.
import { KIT } from './buildings.js';

const { THREE, K, P, G, add, rb, bx, cyl, cone, sp, bl, lcyl, ring, fdisc, disc, bar, poly, qd, arch, bunting, lantern, pot, bed, butterfly, cat, shade, finish, lit, col, place, windowMat, lanternMat, waterMat, BUNL, SPT, FLOWER, C } = KIT;
const { TIM, TIM2, WOODL, WOOD, PLANK, STONE, STONEL, STONED, IRON, GOLD, GOLDD, CREAM, CHIM, BUNT, DEEP } = C;

export const MONUMENT_STAGES = 6;
const TOPY = [2.9, 3.0, 6.9, 7.4, 9.2, 9.6];
/** height (in units) where the game puts the upgrade star for a stage */
export const monumentTopY = (stage) => TOPY[Math.max(0, Math.min(MONUMENT_STAGES - 1, stage | 0))];

const PINK = '#ffd2e2', PINKD = '#ffb0cb', SKY = '#8fd0ff', ROOFC = '#7fc4f5', HONEY = '#e2aa76', LEAF = '#8fe06a';
const TAU = Math.PI * 2;
const rng = K.rng;
/** place n items around a circle: fn(x, z, angle, i) */
const around = (n, r, a0, fn) => { for (let i = 0; i < n; i++) { const a = a0 + i * TAU / n; fn(Math.sin(a) * r, Math.cos(a) * r, a, i); } };
const tagged = (m, kind, axis) => { m.userData.kind = kind; if (axis !== undefined) m.userData.axis = axis; return m; };
const flatDisc = (r, c, x, y, z, seg = 8) => { const m = fdisc(r, c, x, y, z, 0, false, seg); m.rotation.set(-Math.PI / 2, 0, 0); return m; };
const heartPts = (() => { const p = []; for (let i = 0; i < 20; i++) { const t = i / 20 * TAU; p.push([16 * Math.pow(Math.sin(t), 3) / 17, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17]); } return p; })();
let _sg = null;
/** flat 5-point star (8 tris). lying: flat on the ground; otherwise two crossed vertical stars (a sparkle) */
function starf(r, c, x, y, z, ry = 0, lying = false) {
  if (!_sg) { const pts = Array.from({ length: 10 }, (_, i) => { const a = i * Math.PI / 5 + Math.PI / 2, rr = i % 2 ? 0.42 : 1; return new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr); }); _sg = new THREE.ShapeGeometry(new THREE.Shape(pts)); }
  const k = new THREE.Group(), m = new THREE.Mesh(_sg, col(c)); m.scale.set(r, r, r); m.castShadow = false; m.receiveShadow = true; k.add(m);
  if (lying) m.rotation.x = -Math.PI / 2; else { const m2 = new THREE.Mesh(_sg, col(c)); m2.scale.set(r, r, r); m2.rotation.y = Math.PI / 2; m2.castShadow = false; k.add(m2); }
  k.position.set(x, y, z); k.rotation.y = ry; return k;
}
/** flat gold-ish heart emblem facing +z */
const heart = (r, c, x, y, z, ry = 0) => { const m = poly(heartPts, 0.05 / Math.max(0.01, r), c, 0, 0, 0, 0); m.scale.set(r, r, r); m.position.set(x, y, z); m.rotation.y = ry; return m; };

// ---------------------------------------------------------------- the dais, the lamp posts, the planters (every stage)
function dais(g, st) {
  add(g, tagged(K.lathe([[0.001, 0], [2.0, 0], [2.07, 0.05], [2.07, 0.13], [1.93, 0.18]], STONE, 0, 0, 0, { seg: 40 }), 4));
  add(g, tagged(disc(1.93, st === 0 ? '#ead6a6' : '#fcefd8', 0, 0.181, 0, 36), st === 0 ? 7 : 4));
  if (st >= 1) around(18, 1.55, 0.1, (x, z, a, i) => add(g, flatDisc(0.085, BUNT[i % 6], x, 0.19, z, 8)));
}
function lampPosts(g, st) {
  around(4, 1.84, Math.PI / 4, (x, z, a) => {
    add(g, cyl(0.07, 0.09, 1.5, CREAM, x, 0.17, z, 8), sp(0.1, STONEL, x, 0.2, z, { q: 1, sy: 0.8 }), cyl(0.1, 0.06, 0.08, GOLDD, x, 1.6, z, 8));
    lantern(g, x, 1.68, z, 1.45, st >= 4);
  });
  const pts = []; around(4, 1.84, Math.PI / 4, (x, z) => pts.push([x, 1.72, z]));
  if (st !== 5) for (let i = 0; i < 4; i++) bunting(g, pts[i], pts[(i + 1) % 4], 9, 0.34, 0.11, i * 2);
}
function planters(g, st) {
  around(4, 1.74, 0, (x, z, a, i) => {
    const u = G(); add(u, rb(0.95, 0.24, 0.36, CREAM, 0, 0, 0, 0.07), bx(0.86, 0.04, 0.28, '#b88a62', 0, 0.22, 0));
    for (let k = 0; k < 4; k++) add(u, bl(0.1, P.leafLight, -0.33 + k * 0.22, 0.3, 0, 0.7, k + i), bl(0.065, [P.blossomDeep, P.butter, '#ffffff', '#c9a8ff', '#ffa970'][(k + i) % 5], -0.33 + k * 0.22 + 0.01, 0.4 + (k % 2) * 0.05, 0.02, 1, k + i));
    u.position.set(x, 0.17, z); u.rotation.y = a + Math.PI / 2; g.add(u);
  });
}
function benches(g) {
  around(4, 1.8, 0, (x, z, a) => {
    const u = G(); add(u, rb(0.84, 0.07, 0.3, WOODL, 0, 0.3, 0, 0.03), rb(0.84, 0.28, 0.06, WOODL, 0, 0.42, -0.13, 0.03), rb(0.08, 0.3, 0.3, '#b9e8d4', -0.36, 0.0, 0, 0.03), rb(0.08, 0.3, 0.3, '#b9e8d4', 0.36, 0.0, 0, 0.03), bx(0.9, 0.04, 0.05, '#b9e8d4', 0, 0.62, -0.14), sp(0.05, GOLD, -0.4, 0.66, -0.14, { q: 0 }), sp(0.05, GOLD, 0.4, 0.66, -0.14, { q: 0 }));
    u.position.set(x, 0.17, z); u.rotation.y = a; g.add(u); // faces the centre: local +z toward the middle after rotation a + PI
    u.rotation.y = a + Math.PI;
  });
}

// ---------------------------------------------------------------- stage 0: the construction plot
function site(g) {
  const found = rb(1.6, 0.5, 1.6, STONEL, 0, 0.18, 0, 0.08); found.userData.kind = 4; add(g, found);
  for (const [x, z, r] of [[-0.35, 0.2, 0.2], [0.3, -0.25, 0.4]]) add(g, tagged(rb(0.6, 0.12, 0.3, CHIM, x, 0.68, z, 0.03), 9));
  add(g, tagged(rb(0.5, 0.12, 0.28, '#ffa08c', 0.1, 0.8, 0.3, 0.03), 9));
  // scaffolding
  const hp = 1.05, ph = 2.3; for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, bar(sx * hp, 0.17, sz * hp, sx * hp, ph, sz * hp, 0.1, TIM2), bx(0.22, 0.05, 0.22, WOODL, sx * hp - 0.11, 0.17, sz * hp - 0.11));
  for (const y of [0.95, 1.75]) { for (const s of [-1, 1]) add(g, bar(-hp, y, s * hp, hp, y, s * hp, 0.075, TIM), bar(s * hp, y, -hp, s * hp, y, hp, 0.075, TIM)); }
  add(g, bar(-hp, 0.2, hp, hp, 0.95, hp, 0.05, TIM2), bar(hp, 0.2, hp, -hp, 0.95, hp, 0.05, TIM2), bar(hp, 0.95, hp, hp, 1.75, -hp, 0.05, TIM2), bar(-hp, 0.95, -hp, hp, 1.75, -hp, 0.05, TIM2));
  const deck = rb(1.0, 0.06, 2.2, PLANK, -hp + 0.05, 0.95, 0, 0.02); deck.userData.kind = 6; deck.userData.axis = 2; add(g, deck);
  const deck2 = rb(2.2, 0.06, 1.0, PLANK, 0, 1.75, -hp + 0.05, 0.02); deck2.userData.kind = 6; deck2.userData.axis = 0; add(g, deck2);
  for (let i = 0; i < 5; i++) add(g, bar(hp + 0.2, 0.2 + i * 0.4, 0.55, hp + 0.2, 0.2 + i * 0.4, 0.9, 0.05, WOODL)); add(g, bar(hp + 0.2, 0.17, 0.5, hp + 0.2, 2.0, 0.5, 0.06, TIM2), bar(hp + 0.2, 0.17, 0.95, hp + 0.2, 2.0, 0.95, 0.06, TIM2));
  // hoist: a beam over the plinth with a rope and a hanging stone block
  add(g, bar(-hp, ph, 0.0, 0.5, ph, 0.0, 0.1, TIM), bar(-hp, ph - 0.05, 0.0, -hp, ph - 0.3, 0.0, 0.1, TIM2), sp(0.07, IRON, 0.3, ph - 0.1, 0, { q: 0 }), bar(0.3, ph - 0.1, 0, 0.3, ph - 0.8, 0, 0.02, CREAM), tagged(rb(0.42, 0.32, 0.42, STONEL, 0.1, ph - 1.12, -0.21, 0.06), 4), bar(0.3, ph - 0.82, 0, 0.3, ph - 0.78, 0.0, 0.04, IRON));
  add(g, bar(0.3, ph - 0.8, 0.0, 0.3, ph - 0.82, 0.0, 0.05, GOLDD));
  // flag mast on the scaffold corner (the named flag), pennants and bunting
  add(g, bar(-hp, ph, -hp, -hp, ph + 0.8, -hp, 0.05, GOLDD), sp(0.07, GOLD, -hp, ph + 0.84, -hp, { q: 1 }));
  const flag = G(); flag.name = 'flag'; add(flag, rb(0.78, 0.46, 0.04, '#ff8fb5', 0.4, -0.25, 0, 0.02), bx(0.78, 0.07, 0.05, GOLD, 0.4, -0.12, 0), heart(0.1, '#ffffff', 0.4, -0.27, 0.03)); flag.position.set(-hp + 0.02, ph + 0.78, -hp); g.add(flag);
  for (const [sx, sz, c] of [[1, 1, '#ffe27a'], [1, -1, '#8fd0ff'], [-1, 1, '#9be88a']]) { add(g, bar(sx * hp, ph, sz * hp, sx * hp, ph + 0.5, sz * hp, 0.04, TIM2), poly([[0, 0], [0.5, -0.12], [0, -0.28]], 0.02, c, sx * hp, ph + 0.48, sz * hp)); }
  bunting(g, [-hp, ph + 0.05, hp], [hp, ph + 0.05, hp], 9, 0.28, 0.1, 0); bunting(g, [hp, ph + 0.05, hp], [hp, ph + 0.05, -hp], 9, 0.28, 0.1, 3);
  // materials and tools
  add(g, tagged(rb(0.7, 0.34, 0.42, CHIM, 1.35, 0.18, 0.1, 0.05), 9), tagged(rb(0.62, 0.3, 0.38, '#ffa08c', 1.38, 0.52, 0.1, 0.05), 9));
  for (let i = 0; i < 4; i++) add(g, tagged(rb(0.56, 0.06, 0.24, i % 2 ? WOODL : PLANK, -1.45 + (i % 2) * 0.02, 0.18 + i * 0.07, 0.95, 0.02), 6));
  KIT.barrel(g, -1.5, -0.55, WOOD, 1.5, 0.17); KIT.barrel(g, -1.28, -0.85, TIM2, 1.4, 0.17); KIT.barrel(g, 1.5, -0.8, WOOD, 1.3, 0.17);
  KIT.sack(g, -1.45, 0.4, '#fff0c8', 1.6, 0.17); KIT.sack(g, -1.2, 0.58, P.cream, 1.4, 0.17, 1);
  // wheelbarrow
  const wb = G(); add(wb, rb(0.3, 0.14, 0.42, '#7fc4f5', 0, 0.2, 0, 0.04), lcyl('x', 0.12, 0.05, IRON, 0, 0.12, -0.3, 10), bar(-0.1, 0.22, 0.2, -0.13, 0.28, -0.4, 0.035, TIM2), bar(0.1, 0.22, 0.2, 0.13, 0.28, -0.4, 0.035, TIM2), bar(-0.1, 0.0, 0.2, -0.1, 0.22, 0.2, 0.035, TIM2), bar(0.1, 0.0, 0.2, 0.1, 0.22, 0.2, 0.035, TIM2), sp(0.13, '#ffe9b0', 0, 0.36, 0.0, { q: 1, sy: 0.55 })); wb.position.set(0.95, 0.17, 1.3); wb.rotation.y = -0.7; g.add(wb);
  // sign: the Great Project
  add(g, bar(-0.3, 0.17, 1.5, -0.3, 1.0, 1.5, 0.06, TIM2), bar(0.3, 0.17, 1.5, 0.3, 1.0, 1.5, 0.06, TIM2), rb(0.95, 0.5, 0.06, '#fff2c8', 0, 0.78, 1.5, 0.03), bx(1.0, 0.06, 0.08, TIM, 0, 1.28, 1.5), heart(0.15, '#ff8fb5', 0, 1.03, 1.55));
  add(g, starf(0.12, GOLD, -0.3, 1.25, 1.55), starf(0.12, GOLD, 0.3, 1.25, 1.55));
  cat(g, -0.7, 0.17, 1.55, '#ffc890', 0.5);
  around(4, 1.74, 0, (x, z, a, i) => { if (i === 1) return; const u = G(); add(u, bl(0.22, '#d9b684', 0, 0.1, 0, 0.5), bl(0.15, '#d9b684', 0.3, 0.1, 0.04, 0.5), bl(0.08, P.leafLight, 0.1, 0.22, 0.05, 0.8), bl(0.06, P.blossomDeep, 0.1, 0.28, 0.05)); u.position.set(x, 0.17, z); u.rotation.y = a; g.add(u); });
  butterfly(g, 1.4, 0.8, 1.3, '#ffa6c9'); butterfly(g, -1.2, 1.0, -0.3, '#ffd24a', 1);
}

// ---------------------------------------------------------------- stage 1: pedestal fountain
function basin(g, st) {
  add(g, K.lathe([[0.001, 0.17], [1.6, 0.17], [1.66, 0.3], [1.68, 0.58], [1.55, 0.66], [1.42, 0.6], [1.42, 0.47]], '#fff6e8', 0, 0, 0, { seg: 32 }));
  add(g, ring(1.42, 0.02, '#ffd0e0', 0, 0.56, 0, 32));
  add(g, disc(1.43, waterMat, 0, 0.51, 0, 32));
  const r = rng(7); for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.4, d = 1.15 + r() * 0.2; add(g, flatDisc(0.1 + r() * 0.05, '#7fdc6a', Math.sin(a) * d, 0.525, Math.cos(a) * d, 8)); }
  for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.2, d = 1.0 + r() * 0.3; const f = new THREE.Mesh(FLOWER, col(['#ffffff', '#ffb0cb', '#c9a8ff'][i % 3])); f.scale.setScalar(0.085); f.position.set(Math.sin(a) * d, 0.53, Math.cos(a) * d); f.rotation.y = i; add(g, f); }
}
function fountain(g) {
  add(g, K.lathe([[0.001, 0.5], [0.98, 0.5], [1.0, 0.62], [0.52, 0.64], [0.36, 0.8], [0.27, 1.3], [0.46, 1.44], [0.84, 1.64], [0.86, 1.76], [0.76, 1.72], [0.5, 1.6], [0.001, 1.58]], STONEL, 0, 0, 0, { seg: 22 }));
  add(g, K.lathe([[0.001, 1.58], [0.2, 1.62], [0.16, 2.02], [0.3, 2.12], [0.47, 2.28], [0.48, 2.36], [0.4, 2.31], [0.001, 2.18]], '#fff0f6', 0, 0, 0, { seg: 20 }));
  add(g, disc(0.74, waterMat, 0, 1.69, 0, 20), disc(0.4, waterMat, 0, 2.28, 0, 16), sp(0.2, GOLD, 0, 2.58, 0, { q: 1, sy: 1.2 }), cone(0.07, 0.3, GOLD, 0, 2.7, 0, 6, 0));
  around(8, 0.55, 0.2, (x, z) => add(g, sp(0.05, waterMat, x, 2.0, z, { q: 0 })));
  around(8, 1.05, 0.6, (x, z) => add(g, sp(0.055, waterMat, x, 1.28, z, { q: 0 })));
  around(8, 1.2, 0.0, (x, z) => add(g, sp(0.05, waterMat, x, 0.85, z, { q: 0 })));
  around(6, 0.5, 0.1, (x, z, a, i) => add(g, bl(0.07, i % 2 ? '#ffb0cb' : '#ffffff', x, 1.78, z)));
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.78; add(g, starf(0.13, GOLD, Math.sin(a) * 0.5, 2.4 + (i % 2) * 0.25, Math.cos(a) * 0.5, a)); }
  const flag = G(); flag.name = 'flag'; add(flag, rb(0.5, 0.3, 0.03, '#ff8fb5', 0.27, -0.17, 0, 0.015), bx(0.5, 0.05, 0.04, GOLD, 0.27, -0.08, 0)); add(g, bar(0, 2.7, 0, 0, 3.15, 0, 0.025, GOLDD)); flag.position.set(0.02, 3.12, 0); g.add(flag);
}

// ---------------------------------------------------------------- stage 2, 3, 4: the tower grows
const BW = 1.36;
function keep(g, st) {
  // round plinth in the basin, square keep with pilasters, clock faces on all four sides
  add(g, tagged(K.lathe([[0.001, 0.2], [1.02, 0.2], [1.08, 0.34], [1.0, 0.7], [0.92, 0.78], [0.001, 0.8]], STONEL, 0, 0, 0, { seg: 24 }), 4));
  const H = 3.2, y0 = 0.74, wall = rb(BW, H, BW, PINK, 0, y0, 0, 0.14); wall.userData.kind = 1; add(g, wall);
  add(g, rb(BW + 0.16, 0.26, BW + 0.16, STONEL, 0, y0, 0, 0.06));
  around(4, BW / 2 * 1.41, Math.PI / 4, (x, z) => add(g, cyl(0.1, 0.11, H - 0.15, CREAM, x, y0 + 0.05, z, 8)));
  const ct = y0 + H;
  add(g, rb(BW + 0.34, 0.16, BW + 0.34, CREAM, 0, ct - 0.02, 0, 0.05), rb(BW + 0.1, 0.1, BW + 0.1, '#ffe48a', 0, ct - 0.12, 0, 0.04));
  // door, windows
  add(g, place((() => { const d = G(); add(d, arch(0.62, 1.0, CREAM, 0, 0, 0.012), arch(0.5, 0.9, '#9fd6ff', 0, 0, 0.034), qd(0.02, 0.7, '#cfeaff', -0.12, 0.3, 0.046), qd(0.02, 0.7, '#cfeaff', 0.12, 0.3, 0.046), qd(0.02, 0.5, '#cfeaff', 0, 0.55, 0.046), sp(0.04, GOLD, 0.16, 0.45, 0.06, { q: 0 }), fdisc(0.1, windowMat, 0, 0.78, 0.05, 0, false, 10), bx(1.1, 0.07, 0.4, STONEL, 0, -0.04, 0.16), bx(0.9, 0.07, 0.3, STONE, 0, -0.1, 0.34)); return d; })(), 0, y0 + 0.02, BW / 2));
  for (const s of [-1, 1]) add(g, place((() => { const w = G(); add(w, arch(0.34, 0.8, CREAM, 0, 0, 0.012), arch(0.24, 0.7, windowMat, 0, 0.05, 0.03), qd(0.02, 0.7, CREAM, 0, 0.4, 0.04), bx(0.44, 0.05, 0.12, CREAM, 0, -0.03, 0.05)); return w; })(), s * 0.42, y0 + 1.02, BW / 2));
  for (const s of [-1, 1]) add(g, place((() => { const w = G(); add(w, arch(0.3, 0.7, CREAM, 0, 0, 0.012), arch(0.22, 0.62, windowMat, 0, 0.04, 0.03), qd(0.02, 0.62, CREAM, 0, 0.35, 0.04)); return w; })(), BW / 2, y0 + 1.5, s * 0.3, Math.PI / 2), place((() => { const w = G(); add(w, arch(0.3, 0.7, CREAM, 0, 0, 0.012), arch(0.22, 0.62, windowMat, 0, 0.04, 0.03), qd(0.02, 0.62, CREAM, 0, 0.35, 0.04)); return w; })(), -BW / 2, y0 + 1.5, s * 0.3, -Math.PI / 2));
  // clock faces
  const cy = y0 + 2.4;
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const f = G(); add(f, fdisc(0.46, GOLD, 0, 0, 0.02, 0, false, 20), fdisc(0.4, '#fffaf0', 0, 0, 0.034, 0, false, 20), qd(0.04, 0.12, DEEP, 0, 0.3, 0.05), qd(0.04, 0.12, DEEP, 0, -0.3, 0.05), qd(0.12, 0.04, DEEP, 0.3, 0, 0.05), qd(0.12, 0.04, DEEP, -0.3, 0, 0.05), bar(0, 0, 0.05, 0.0, 0.26, 0.06, 0.04, IRON), bar(0, 0, 0.055, 0.17, -0.06, 0.065, 0.045, IRON), sp(0.035, GOLD, 0, 0, 0.07, { q: 0 }));
    f.position.set(Math.sin(a) * (BW / 2 - 0.0), cy, Math.cos(a) * (BW / 2)); f.rotation.y = a; g.add(f);
  }
  heart(0.15, '#ff8fb5', 0, y0 + 1.72, BW / 2 + 0.03);
  return ct + 0.14;
}
function belfry(g, st, top) {
  // open belfry with the bell, pyramid roof and a flag
  const bh = 0.95;
  add(g, rb(BW + 0.06, 0.1, BW + 0.06, '#fff4d6', 0, top, 0, 0.04));
  around(4, 0.52 * 1.41, Math.PI / 4, (x, z) => add(g, rb(0.17, bh, 0.17, CREAM, x, top + 0.08, z, 0.05)));
  add(g, rb(BW + 0.22, 0.14, BW + 0.22, '#fff4d6', 0, top + bh + 0.06, 0, 0.05));
  const ry = top + bh + 0.2;
  add(g, cone(1.12, 1.0, ROOFC, 0, ry, 0, 4, Math.PI / 4), ring(0.82, 0.05, shade(ROOFC, 0.2), 0, ry + 0.02, 0, 4)); g.children[g.children.length - 1].rotation.y = Math.PI / 4;
  add(g, cyl(0.04, 0.04, 0.3, GOLDD, 0, ry + 0.98, 0, 6), sp(0.1, GOLD, 0, ry + 1.3, 0, { q: 1 }));
  const bell = G(); bell.name = 'bell'; add(bell, K.lathe([[0.001, 0.0], [0.07, 0.02], [0.2, 0.0], [0.28, -0.3], [0.3, -0.42], [0.2, -0.38], [0.18, -0.2], [0.001, -0.14]].map(([r, y]) => [r, y]), GOLD, 0, 0, 0, { seg: 14 }), sp(0.07, GOLDD, 0, -0.44, 0, { q: 0 }), bar(0, 0.0, 0, 0, 0.14, 0, 0.04, IRON));
  bell.position.set(0, top + bh - 0.1, 0); g.add(bell); add(g, bar(-0.4, top + bh + 0.04, 0, 0.4, top + bh + 0.04, 0, 0.06, TIM2), bar(0, top + bh + 0.04, 0, 0, top + bh - 0.1, 0, 0.03, IRON));
  const flag = G(); flag.name = 'flag'; add(flag, rb(0.8, 0.46, 0.04, '#ff8fb5', 0.42, -0.26, 0, 0.02), bx(0.8, 0.07, 0.05, GOLD, 0.42, -0.12, 0), heart(0.1, '#ffffff', 0.42, -0.28, 0.03)); add(g, bar(0, ry + 1.3, 0, 0, ry + 1.8, 0, 0.035, GOLDD)); flag.position.set(0.02, ry + 1.78, 0); g.add(flag);
  return ry + 1.6;
}
function windmillCap(g, st, top) {
  // octagonal drum, pink dome, a gold heart, four colourful sails on a hub (named spinz)
  add(g, rb(BW + 0.06, 0.1, BW + 0.06, '#fff4d6', 0, top, 0, 0.04), K.lathe([[0.001, 0], [0.82, 0], [0.84, 0.1], [0.78, 1.0]], '#fff8e6', 0, top + 0.08, 0, { seg: 20 }));
  const dy = top + 1.08;
  add(g, K.lathe([[0.9, 0], [0.88, 0.1], [0.74, 0.4], [0.5, 0.65], [0.22, 0.82], [0.001, 0.88]], '#ff9fbd', 0, dy, 0, { seg: 22 }), cyl(0.92, 0.9, 0.06, GOLDD, 0, dy - 0.03, 0, 22));
  add(g, cyl(0.035, 0.035, 0.4, GOLDD, 0, dy + 0.84, 0, 6), sp(0.1, GOLD, 0, dy + 1.28, 0, { q: 1 }));
  add(g, place((() => { const w = G(); add(w, fdisc(0.2, CREAM, 0, 0, 0.02, 0, false, 14), fdisc(0.15, windowMat, 0, 0, 0.034, 0, false, 14)); return w; })(), 0, top + 0.6, 0.8));
  const hub = new THREE.Vector3(0, dy + 0.05, 1.0);
  add(g, lcyl('z', 0.06, 0.45, TIM2, hub.x, hub.y, hub.z - 0.15, 8));
  const sails = G(); sails.name = 'spinz'; sails.position.copy(hub);
  const cols = ['#ff8fb5', '#ffe27a', '#8fd0ff', '#9be88a'], len = 1.9;
  for (let i = 0; i < 4; i++) {
    const s = G();
    add(s, bx(0.07, len, 0.06, TIM2, 0, 0.08, 0), bx(0.5, 0.04, 0.05, TIM2, 0.26, 0.5, 0), bx(0.5, 0.04, 0.05, TIM2, 0.26, len - 0.1, 0), bx(0.04, len - 0.4, 0.05, TIM2, 0.5, 0.5, 0), bx(0.5, 0.04, 0.05, TIM2, 0.26, 1.2, 0));
    for (let k = 0; k < 3; k++) { const p = qd(0.42, (len - 0.62) / 3 - 0.04, cols[(i + k) % 4], 0.27, 0.54 + k * ((len - 0.62) / 3) + (len - 0.62) / 6, -0.005); p.userData.kind = 10; s.add(p); }
    s.rotation.z = i * Math.PI / 2 + 0.3; sails.add(s);
  }
  sails.add(sp(0.14, GOLD, 0, 0, 0.05, { q: 1 }), cyl(0.07, 0.07, 0.2, TIM2, 0, 0, 0, 8)); sails.children[sails.children.length - 1].rotation.x = Math.PI / 2; sails.children[sails.children.length - 1].position.set(0, 0, -0.06);
  g.add(sails);
  const flag = G(); flag.name = 'flag'; add(flag, rb(0.7, 0.4, 0.04, '#8fd0ff', 0.38, -0.23, 0, 0.02), bx(0.7, 0.06, 0.05, GOLD, 0.38, -0.11, 0), heart(0.09, '#ffffff', 0.38, -0.24, 0.03)); add(g, bar(0, dy + 1.28, 0, 0, dy + 2.0, 0, 0.03, GOLDD)); flag.position.set(0.02, dy + 1.95, 0); g.add(flag);
  return dy + 2.0;
}
function lighthouse(g, st, top) {
  // round striped tower above the clock keep, gallery, glowing lantern room, gold dome, sweeping beam
  add(g, rb(BW + 0.06, 0.1, BW + 0.06, '#fff4d6', 0, top, 0, 0.04), K.lathe([[0.001, 0], [0.86, 0], [0.88, 0.08], [0.7, 0.3]], '#fff8e6', 0, top + 0.08, 0, { seg: 24 }));
  const y0 = top + 0.4, n = 5, h = 0.5;
  for (let i = 0; i < n; i++) { const r0 = 0.7 - i * 0.035, r1 = 0.7 - (i + 1) * 0.035; add(g, K.cyl(r1, r0, h, i % 2 ? '#fff4e4' : '#ff9fbd', 0, y0 + i * h, 0, { seg: 24 })); }
  const gy = y0 + n * h;
  add(g, cyl(0.86, 0.66, 0.14, GOLDD, 0, gy, 0, 24), cyl(0.9, 0.9, 0.06, '#fff4d6', 0, gy + 0.14, 0, 24));
  around(14, 0.84, 0.0, (x, z) => add(g, cyl(0.025, 0.025, 0.36, CREAM, x, gy + 0.2, z, 5)));
  add(g, ring(0.84, 0.04, GOLD, 0, gy + 0.52, 0, 14));
  const ly = gy + 0.2;
  add(g, K.cyl(0.46, 0.46, 0.66, null, 0, ly, 0, { seg: 14, mat: lanternMat }), cyl(0.52, 0.52, 0.08, GOLDD, 0, ly - 0.02, 0, 14), cyl(0.52, 0.52, 0.08, GOLDD, 0, ly + 0.66, 0, 14));
  around(7, 0.47, 0.1, (x, z) => add(g, bx(0.05, 0.66, 0.05, CREAM, x - 0.025, ly, z - 0.025)));
  add(g, K.lathe([[0.62, 0], [0.58, 0.1], [0.44, 0.3], [0.2, 0.5], [0.001, 0.58]], GOLD, 0, ly + 0.72, 0, { seg: 18 }), cyl(0.03, 0.03, 0.3, GOLDD, 0, ly + 1.28, 0, 6), sp(0.09, GOLD, 0, ly + 1.62, 0, { q: 1 }));
  // doorway and round windows on the stripes
  for (const [yy, a] of [[y0 + 0.5, 0.6], [y0 + 1.3, -0.7], [y0 + 2.1, 0.5]]) { const w = G(); add(w, fdisc(0.15, CREAM, 0, 0, 0.0, 0, false, 12), fdisc(0.11, windowMat, 0, 0, 0.02, 0, false, 12)); const rr = 0.66 - ((yy - y0) / h) * 0.035; w.position.set(Math.sin(a) * rr, yy, Math.cos(a) * rr); w.rotation.y = a; g.add(w); }
  const flag = G(); flag.name = 'flag'; add(flag, rb(0.7, 0.4, 0.04, '#ff8fb5', 0.38, -0.23, 0, 0.02), bx(0.7, 0.06, 0.05, GOLD, 0.38, -0.11, 0), heart(0.09, '#ffffff', 0.38, -0.24, 0.03)); add(g, bar(0, ly + 1.62, 0, 0, ly + 2.0, 0, 0.03, GOLDD)); flag.position.set(0.02, ly + 1.97, 0); g.add(flag);
  // the sweeping light: two soft fans from the lantern (the game rotates `beam` about Y)
  const beam = new THREE.Group(); beam.name = 'beam'; beam.position.set(0, ly + 0.33, 0);
  const pos = [], colr = [], idx = [], N = 6, L = 7.5, wide = 0.13;
  for (const s of [1, -1]) { const o = pos.length / 3; pos.push(0, 0, 0); colr.push(1, 0.95, 0.7); for (let i = 0; i <= N; i++) { const t = (i / N - 0.5) * 2 * wide; pos.push(s * L * Math.cos(t), (i / N - 0.5) * 0.2, L * Math.sin(t)); colr.push(0, 0, 0); } for (let i = 0; i < N; i++) idx.push(o, o + 1 + i, o + 2 + i); }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); bg.setIndex(idx);
  // fade along the length: vertex colour 0 at the far edge, 1 at the lantern; additive blending keeps it a soft glow
  const bm = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); bm.userData.special = true;
  const bmesh = new THREE.Mesh(bg, bm); bmesh.renderOrder = 3; bmesh.castShadow = false; beam.add(bmesh); g.add(beam);
  return ly + 2.0;
}

// ---------------------------------------------------------------- stage 5: the Great Tree of Hearthvale
function greatTree(g) {
  const r = rng(21);
  // pond (the old basin): the tree stands in sparkling water
  add(g, K.lathe([[0.001, 0.17], [1.6, 0.17], [1.66, 0.3], [1.68, 0.58], [1.55, 0.66], [1.42, 0.6], [1.42, 0.47]], '#fff6e8', 0, 0, 0, { seg: 32 }));
  add(g, ring(1.42, 0.02, '#ffd0e0', 0, 0.56, 0, 32), disc(1.43, waterMat, 0, 0.51, 0, 32));
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3, d = 1.12 + r() * 0.15; add(g, flatDisc(0.1 + r() * 0.04, '#7fdc6a', Math.sin(a) * d, 0.525, Math.cos(a) * d, 8)); }
  for (let i = 0; i < 9; i++) { const a = i * 0.7 + 0.1, d = 1.0 + r() * 0.35; add(g, starf(0.09 + r() * 0.05, i % 2 ? '#ffffff' : GOLD, Math.sin(a) * d, 0.56 + r() * 0.03, Math.cos(a) * d, a, true)); }
  for (let i = 0; i < 6; i++) { const a = i * 1.1 + 0.2, d = 1.05 + r() * 0.3; const f = new THREE.Mesh(FLOWER, col(['#ffffff', '#ffb0cb', '#c9a8ff'][i % 3])); f.scale.setScalar(0.09); f.position.set(Math.sin(a) * d, 0.53, Math.cos(a) * d); f.rotation.y = i; add(g, f); }
  // trunk with flared roots, honey wood
  const trunk = K.lathe([[0.001, 0.2], [1.1, 0.2], [0.98, 0.6], [0.8, 1.2], [0.7, 2.2], [0.72, 3.2], [0.84, 4.2], [0.001, 4.4]], HONEY, 0, 0, 0, { seg: 20 }); trunk.userData.kind = 5; trunk.userData.axis = 1; add(g, trunk);
  around(6, 0.95, 0.4, (x, z, a) => { const m = cone(0.3, 0.95, shade(HONEY, -0.06), x * 1.12, 0.2, z * 1.12, 5, 0); m.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9); add(g, m); });
  around(6, 1.0, 0.1, (x, z) => add(g, bar(0, 3.6, 0, x * 1.6, 5.0, z * 1.6, 0.3, HONEY)));
  // trunk door (glowing round window), round windows, steps
  add(g, place((() => { const d = G(); add(d, arch(0.7, 1.15, CREAM, 0, 0, 0.012), arch(0.58, 1.05, '#ff9fbd', 0, 0, 0.04), qd(0.02, 0.8, '#ffc6dc', -0.14, 0.34, 0.056), qd(0.02, 0.8, '#ffc6dc', 0.14, 0.34, 0.056), fdisc(0.15, CREAM, 0, 0.82, 0.056, 0, false, 12), fdisc(0.115, windowMat, 0, 0.82, 0.064, 0, false, 12), sp(0.045, GOLD, 0.2, 0.5, 0.07, { q: 0 }), bx(1.0, 0.07, 0.32, STONEL, 0, -0.03, 0.22), bx(0.8, 0.07, 0.25, STONE, 0, -0.09, 0.4)); return d; })(), 0, 0.64, 0.84));
  for (const [a, y] of [[0.95, 1.9], [-0.95, 2.1], [2.3, 2.0]]) { const w = G(); add(w, fdisc(0.2, CREAM, 0, 0, 0.0, 0, false, 14), fdisc(0.15, windowMat, 0, 0, 0.02, 0, false, 14), qd(0.02, 0.3, CREAM, 0, 0, 0.03), qd(0.3, 0.02, CREAM, 0, 0, 0.03)); w.position.set(Math.sin(a) * 0.72, y, Math.cos(a) * 0.72); w.rotation.y = a; g.add(w); }
  // canopy: big smooth pastel clumps (kind 8 dapple), light on top
  const clumps = [], PK = ['#ffa8c8', '#ffb8d2', '#ffc6dc', '#ff9cc0', '#f4b8ff', '#ffb0cb'];
  around(7, 1.6, 0.2, (x, z, a, i) => clumps.push([x, 5.3 + (i % 2) * 0.25, z, 0.88, PK[i % 6]]));
  around(6, 1.15, 0.6, (x, z, a, i) => clumps.push([x, 6.5 + (i % 2) * 0.2, z, 0.98, PK[(i + 2) % 6]]));
  around(3, 0.55, 0.0, (x, z, a, i) => clumps.push([x, 7.6, z, 0.9, i % 2 ? '#ffd2e2' : '#ffc0d8']));
  clumps.push([0, 8.5, 0, 0.9, '#ffdbe8']);
  for (const [x, y, z, rad, c] of clumps) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), col(c)); m.scale.set(rad, rad * 0.86, rad); m.position.set(x, y, z); m.userData.kind = 8; add(g, KIT.sh(m)); }
  // blossoms scattered on the canopy
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), q = new THREE.Quaternion();
  for (let i = 0; i < 26; i++) {
    const [x, y, z, rad] = clumps[(r() * clumps.length) | 0]; const th = r() * TAU, ph = Math.acos(r() * 1.4 - 0.4); dir.set(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)).normalize();
    const f = new THREE.Mesh(FLOWER, col(['#ffffff', '#fff0f6', '#ff9fc2', '#e6d0ff', '#ffe27a'][i % 5])); f.scale.setScalar(0.2 + r() * 0.1); q.setFromUnitVectors(up, dir); f.quaternion.copy(q); f.rotateY(r() * 6); f.position.set(x + dir.x * rad * 1.0, y + dir.y * rad * 0.88, z + dir.z * rad * 1.0); add(g, KIT.sh(f));
  }
  // swing on a branch
  add(g, bar(1.0, 5.0, 0.9, 1.0, 2.0, 0.9, 0.025, CREAM), bar(1.4, 5.0, 0.9, 1.4, 2.0, 0.9, 0.025, CREAM), rb(0.55, 0.07, 0.24, '#ffb5cf', 1.2, 1.9, 0.9, 0.03));
  // fruit lanterns
  const lan = new THREE.Group(); lan.name = 'lanterns'; lan.position.set(0, 4.9, 0);
  const spots = [[1.6, 0.3, 0.2], [-1.5, 0.5, 0.4], [0.3, 0.2, 1.7], [-0.4, 0.4, -1.7], [1.2, 0.6, -1.2], [-1.2, 0.4, 1.3], [1.9, 0.5, 1.0], [-1.9, 0.2, -0.7]];
  spots.forEach(([x, dy, z], i) => { const hh = 0.5 + (i % 3) * 0.2, c = ['#ffc43a', '#ffd86a', '#ffb347'][i % 3]; add(lan, bar(x, dy, z, x, dy - hh, z, 0.02, CREAM), K.cyl(0.0, 0.1, 0.12, null, x, dy - hh - 0.0, z, { seg: 8, mat: lit(GOLD, 0.4) })); const b = sp(0.26, lanternMat, x, dy - hh - 0.26, z, { q: 1, sy: 1.15 }); b.castShadow = false; lan.add(b); lan.add(cone(0.08, 0.12, GOLD, x, dy - hh - 0.58, z, 6, 0)); });
  g.add(lan);
  // bunting from the branches to the lamp posts
  around(4, 1.84, Math.PI / 4, (x, z, a, i) => bunting(g, [x, 1.72, z], [Math.sin(a) * 0.9, 5.0, Math.cos(a) * 0.9], 13, 0.45, 0.12, i * 2));
  { const flag = G(); flag.name = 'flag'; add(flag, rb(0.6, 0.34, 0.03, '#ff8fb5', 0.32, -0.2, 0, 0.015), bx(0.6, 0.05, 0.04, GOLD, 0.32, -0.09, 0), heart(0.07, '#ffffff', 0.32, -0.21, 0.03)); add(g, bar(0, 9.0, 0, 0, 9.6, 0, 0.03, GOLDD)); flag.position.set(0.02, 9.58, 0); g.add(flag); }
  // sparkles
  for (let i = 0; i < 6; i++) { const a = r() * TAU, d = 0.6 + r() * 1.5; add(g, starf(0.12, i % 2 ? '#ffffff' : GOLD, Math.sin(a) * d, 2.6 + r() * 4.5, Math.cos(a) * d, a)); }
  butterfly(g, 1.0, 2.2, 1.4, '#ffa6c9'); butterfly(g, -1.0, 3.0, 1.2, '#ffd24a', 1); butterfly(g, 0.3, 4.2, -1.3, '#c9a8ff', 2);
}

// ---------------------------------------------------------------- the model
/** stage 0..5. Origin = plaza centre on the ground; footprint ~4 x 4; see the header for the named children. */
export function monumentModel(stage = 0) {
  const st = Math.max(0, Math.min(MONUMENT_STAGES - 1, stage | 0)), g = G();
  dais(g, st);
  if (st === 0) { site(g); }
  else {
    lampPosts(g, st);
    if (st === 5) { benches(g); } else planters(g, st);
    if (st === 1) { basin(g, st); fountain(g); }
    else if (st >= 2 && st <= 4) { basin(g, st); const top = keep(g, st); if (st === 2) belfry(g, st, top); else if (st === 3) windmillCap(g, st, top); else lighthouse(g, st, top); }
    else greatTree(g);
  }
  const out = finish(g, TOPY[st], [4.7, 4.7, 0.8]);
  out.userData.stage = st; return out;
}

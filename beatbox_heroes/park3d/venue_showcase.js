// VENUE 'showcase' (Stage and Club Artist INT-B): the Friday showcase, a bigger gold stage: 11 x 4.8 m deck with a gold lip, a triptych LED wall, a gold truss arch with par cans (the sweeping beams come from lighting.js),
// pyro spark fountains at both stage corners (api.pyro(sec); also fires by itself when the crowd energy peaks), velvet drapes, LED towers, VIP barrier with rope along the highway, a boom camera and 30 spectators.
// Performer at the local origin, deck top at opts.stageH. api: setTitle(title, sub), pyro(sec), cheer().
import { THREE, rng } from './kit.js';
import { createCrowd } from './char_crowd.js';
import { makeLed, speaker, wedge, truss, parCan, curtain, stageDeck, lightPool, K, mix, mul, bar, col, aoTint, cylT, GOLDN, ORANGEN, PINKN, CYANN, WARMS } from './venue_kit.js';
import { makeBarAtlas } from './bar_atlas.js';
import { W3, paintFloor, makeSparks } from './venue_base.js';

export function buildVenueShowcase(V) {
  const { S, TA, TB, o } = V, B = S.B, GL = S.GLOW, h = o.stageH, R = rng(o.seed * 17 + 3); S.atlas = makeBarAtlas();
  const gold = K.gold, goldD = K.goldD, black = col('#1d1830');
  // ---------------------------------------------------------------- deck: gold lip, back riser, side steps
  stageDeck(B, GL, { x0: -5.5, x1: 5.5, z0: -2.7, z1: 2.3, h, color: mix(col('#2a2142'), K.plumD, 0.5), segments: 14, glow: [GOLDN, ORANGEN], litTop: GL, litK: 0.5, glowK: 0.4 });
  B.box(0, h, 2.28, 11.1, 0.07, 0.1, gold, { base: 0.1 }); B.box(0, h, -2.2, 8.0, 0.3, 2.0, mix(K.deckD, K.plumD, 0.3), { base: 0.3, top: mix(K.deckL, K.plumL, 0.3) });
  GL.box(0, h + 0.3, -1.19, 8.0, 0.025, 0.03, GOLDN, { base: 0, tint: 0 });
  [-1, 1].forEach((s) => { for (let i = 0; i < 3; i++) B.box(s * (5.9 + i * 0.3), 0, 0.5, 0.3, h * (3 - i) / 3, 1.6, K.deckL, { base: 0.3 }); });
  lightPool(S.SOFT, 0, h + 0.02, 0.2, 4.2, 2.0, '#ffd890', 0.3); lightPool(S.SOFT, 0, 0.02, 4.0, 5.5, 1.8, '#ffd890', 0.16);
  // ---------------------------------------------------------------- floor and walls: glossy black with gold inlay, black cloth walls
  paintFloor(B, -14, 14, -3.2, 34, 1.0, (x, z, i, j) => mul(((i + j) % 2 ? col('#34284c') : col('#2b2142')), 1.0 + 0.06 * Math.sin(x * 0.7 + z * 0.4)));
  [-3.6, 3.6].forEach((x) => B.box(x, 0, 14, 0.12, 0.012, 38, goldD, { base: 0, tint: 0 })); B.box(0, 0, 3.8, 28, 0.012, 0.12, goldD, { base: 0, tint: 0 });
  B.box(0, 0, -3.5, 28.6, 11, 0.3, black, { base: 0.35, tint: 0.02 }); B.box(-14.15, 0, 15.4, 0.3, 11, 37.6, black, { base: 0.35, tint: 0.02 }); B.box(14.15, 0, 15.4, 0.3, 11, 37.6, black, { base: 0.35, tint: 0.02 });
  // ---------------------------------------------------------------- LED triptych, gold frames
  const led = makeLed(9.2, 4.6, 80); led.mesh.position.set(0, 5.6, -3.0); S.group.add(led.mesh);
  [-1, 1].forEach((s) => { const sp = makeLed(3.4, 4.6, 40); sp.mesh.position.set(s * 6.4, 5.6, -2.5); sp.mesh.rotation.y = -s * 0.42; S.group.add(sp.mesh); sp.text([{ t: s < 0 ? 'LIVE' : 'ON AIR', c: s < 0 ? '#ff5a5a' : '#ffd23f', k: 1 }], { bg: ['#2a1058', '#120a2c'], gridA: 0.3 }); V.side = (V.side || []).concat(sp); });
  B.box(0, 3.15, -3.08, 9.7, 0.22, 0.22, gold, { base: 0.1 }); B.box(0, 8.15, -3.08, 9.7, 0.22, 0.22, gold, { base: 0.1 }); [-4.75, 4.75].forEach((x) => B.box(x, 3.15, -3.08, 0.22, 5.2, 0.22, gold, { base: 0.1 }));
  TA.box(0, 8.4, -3.0, 9.8, 0.07, 0.07, W3, { base: 0, tint: 0 }); TB.box(0, 3.0, -2.95, 9.8, 0.07, 0.07, W3, { base: 0, tint: 0 });
  // ---------------------------------------------------------------- truss arch with par cans, posts
  const N = 16, arc = []; for (let i = 0; i <= N; i++) { const a = -1.4 + 2.8 * i / N; arc.push([7.4 * Math.sin(a), 1.2 + 7.2 * Math.cos(a), -1.2]); }
  for (let i = 0; i < N; i++) truss(B, arc[i], arc[i + 1], 0.42, gold, goldD, 0.8);
  [arc[0], arc[N]].forEach((p) => { truss(B, [p[0], h, p[2]], [p[0], p[1], p[2]], 0.42, gold, goldD, 0.8); B.box(p[0], h, p[2], 0.8, 0.07, 0.8, K.steelD, { base: 0 }); });
  const cans = [2, 4, 6, 8, 10, 12, 14]; cans.forEach((i, k) => { const p = arc[i]; parCan(B, GL, p[0], p[1] - 0.3, p[2] + 0.1, -p[0] * 0.05, 0.85, k % 2 ? GOLDN : PINKN, 0.18); });
  V.anchors.rig = [2, 4, 7, 9, 12, 14].map((i) => ({ x: arc[i][0], y: arc[i][1] - 0.3, z: arc[i][2] })); V.anchors.stageCenter = { x: 0, z: 0 };
  // ---------------------------------------------------------------- PA, wedges, drapes, LED towers, VIP rope, boom camera
  speaker(B, -6.6, 1.0, 0.35, { y0: 0, h: 4, s: 1.6 }); speaker(B, 6.6, 1.0, -0.35, { y0: 0, h: 4, s: 1.6 }); wedge(B, -2.6, h, 2.0, 0.1, 1.2); wedge(B, 0, h, 2.0, 0, 1.2); wedge(B, 2.6, h, 2.0, -0.1, 1.2);
  curtain(GL, { x0: -13.6, x1: -9.2, y0: 0, y1: 10.5, z: -2.7, depth: 0.4, a: K.velvet, b: K.velvetD, rand: R, valance: 0, k: 0.45, fw: 0.45 }); curtain(GL, { x0: 9.2, x1: 13.6, y0: 0, y1: 10.5, z: -2.7, depth: 0.4, a: K.velvet, b: K.velvetD, rand: R, valance: 0, k: 0.45, fw: 0.45 });
  [-9.0, 9.0].forEach((x, i) => { B.box(x, 0, 0, 0.9, 7.6, 0.9, K.ink, { base: 0.2 }); TA.box(x - 0.46 + (i ? 0.92 : 0), 0.6, 0.0, 0.05, 6.5, 0.6, W3, { base: 0, tint: 0 }); TB.box(x, 0.6, 0.47, 0.5, 6.5, 0.05, W3, { base: 0, tint: 0 }); });
  const rope = (x) => { const zs = []; for (let z = 4.4; z <= 22; z += 2.2) zs.push(z); zs.forEach((z) => { cylT(B, x, 0, z, 0.06, 0.05, 1.0, 6, gold); B.lathe([[0.2, 0, goldD], [0.2, 0.04, gold], [0, 0.04, gold]], 8, x, 0, z, {}); B.lathe([[0.08, 1.0, gold], [0, 1.1, gold]], 6, x, 0, z, {}); });
    for (let i = 0; i < zs.length - 1; i++) { const a = [x, 0.92, zs[i]], b = [x, 0.92, zs[i + 1]]; const m = [x, 0.72, (zs[i] + zs[i + 1]) / 2]; bar(B, a, m, 0.035, 0.035, K.velvetD); bar(B, m, b, 0.035, 0.035, K.velvetD); } };
  rope(-3.9); rope(3.9);
  { const cx = 7.8, cz = 9; B.box(cx, 0, cz, 0.9, 0.5, 0.9, K.ink, { base: 0.2 }); B.box(cx, 0.5, cz, 0.18, 1.6, 0.18, K.steelD, { base: 0 }); bar(B, [cx, 2.0, cz], [cx - 1.8, 2.4, cz - 2.0], 0.09, 0.09, K.steel); B.box(cx - 1.9, 2.25, cz - 2.1, 0.55, 0.4, 0.7, K.ink, { base: 0, ry: 0.7 }); GL.box(cx - 2.12, 2.4, cz - 2.4, 0.07, 0.07, 0.07, [3.2, 0.4, 0.4], { base: 0, tint: 0 }); }
  // (the sweeping beams come from lighting.js: anchors.rig = the arch cans)
  const sparks = makeSparks([[-5.2, h, 1.9], [5.2, h, 1.9]], '#ffc83d', 70); S.group.add(sparks.points); let lastFire = -9, T = 0;
  V.ups.push((dt, t, e, pulse, v) => { T = t;
    if (e > 0.88 && t - lastFire > 5) { lastFire = t; sparks.fire(1.6); } sparks.update(dt); });
  // ---------------------------------------------------------------- crowd, 30 on the flanks behind the rope
  let crowd = null; const n = o.crowd !== undefined ? o.crowd : (o.q === 'low' ? 14 : o.q === 'med' ? 22 : 30);
  if (n > 0) { const pos = []; for (let i = 0; i < n; i++) { const side = i % 2 ? 1 : -1, x = side * (4.5 + R() * 5.0), z = 4.6 + R() * 15; pos.push([x, z, Math.atan2(-x * 0.4, -z - 6) + (R() - 0.5) * 0.3]); } crowd = createCrowd(V.ctx, n, { positions: pos, seed: o.seed + 9, energy: 0.55, bpm: 110 }); S.group.add(crowd.object); }
  const title = () => led.text([{ t: String(o.title || 'SHOWCASE'), c: '#ffd23f', k: 1.1 }, { t: String(o.sub || 'FRIDAY NIGHT'), c: '#ff9ab8', k: 0.45 }], { bg: ['#4a1f6a', '#150a2e'], rays: ['rgba(255,220,120,0.10)', 'rgba(255,255,255,0)'] }); title();
  V.anchors.performer = { x: 0, y: h, z: 0 }; V.anchors.stageFront = { x: 0, y: h, z: 2.3 }; V.anchors.led = { x: 0, y: 5.6, z: -3.0 };
  const P = (x, y, z) => [x + o.x, y, z + o.z];
  V.cams.play = { pos: P(0, 6.0, 23.8), look: P(0, 0.5, 5.4), fov: 0 }; V.cams.stage = { pos: P(0, 3.2, 9), look: P(0, 2.8, 0), fov: 46 }; V.cams.wide = { pos: P(0, 8, 28), look: P(0, 2, 3), fov: 56 };
  return { led, crowd, hint: { profile: 'stage', theme: 'gold', interior: true, ceilY: 10 }, api: { setTitle(t, s) { o.title = t; o.sub = s || o.sub; title(); }, pyro(sec) { sparks.fire(sec || 1.6); lastFire = T; }, cheer(sec) { if (crowd) crowd.cheer(sec); sparks.fire(1.4); lastFire = T; } } };
}

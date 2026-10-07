// VENUE 'bar' (Stage and Club Artist INT-B): the pub stage for open mic and karaoke, built around the rhythm game's busking stage footprint (performer at the local origin, deck top at opts.stageH).
// Brick back wall with an LED lyric screen above the performer, velvet curtains, big PA stacks, par cans on a truss, string lights across the room, tables with candles on both flanks, a bottle shelf
// and neon signs, plank floor, side walls. Instanced crowd on the flanks (the highway corridor x -3.4..3.4 stays free). LED api: setLyrics(lines, o), setTitle(title, sub).
//   buildVenueBar(V) is called by venue.js; returns the extras for finishVenue.
import { createCrowd } from './char_crowd.js';
import { rng } from './kit.js';
import { makeLed, speaker, wedge, truss, parCan, curtain, stageDeck, brickFace, plankFloor, stringLights, candleTable, lightPool, steps, K, mix, mul, bar, PINKN, CYANN, WARMS, GOLDN, VIOLETN } from './venue_kit.js';
import { makeBarAtlas } from './bar_atlas.js';
import { W3 } from './venue_base.js';

export function buildVenueBar(V) {
  const { S, TA, TB, o } = V, B = S.B, GL = S.GLOW, h = o.stageH, R = rng(o.seed * 31 + 7); S.atlas = makeBarAtlas();
  const karaoke = o.programme === 'karaoke' || o.mode === 'karaoke';
  // ---------------------------------------------------------------- deck and steps
  stageDeck(B, GL, { x0: -4.7, x1: 4.7, z0: -2.1, z1: 2.3, h, color: mix(K.deckL, K.plumL, 0.45), segments: 12, litTop: GL, litK: 0.6, glowK: 0.4 });
  B.box(0, 0, 2.62, 4.0, 0.3, 0.6, K.deckL, { base: 0.3 }); B.box(0, 0, 2.4, 4.4, 0.3, 0.3, K.deckL, { base: 0.3 }); void steps;
  lightPool(S.SOFT, 0, h + 0.02, 0, 3.4, 1.8, '#ff7ad0', 0.3); lightPool(S.SOFT, 0, 0.02, 3.4, 4.5, 1.6, '#ff7ad0', 0.16);
  // ---------------------------------------------------------------- floor, back wall, side walls
  plankFloor(B, -13, 13, -2.6, 32, null, R, 1.15);
  const WH = 9.5; brickFace(B, [-13, -2.6], [13, -2.6], [0, 1], WH, { wain: 1.5, rowH: 0.35, step: 0.7, seed: 3 });
  brickFace(B, [-13, 32], [-13, -2.6], [1, 0], WH, { wain: 1.5, rowH: 0.35, step: 1.0, seed: 5 }); brickFace(B, [13, -2.6], [13, 32], [-1, 0], WH, { wain: 1.5, rowH: 0.35, step: 1.0, seed: 7 });
  B.box(0, WH, -2.7, 26.6, 0.3, 0.6, K.creamD, { base: 0.1 });
  // ---------------------------------------------------------------- back wall: LED lyric screen with neon frame, signs, posters, bottle shelf
  const led = makeLed(6.8, 3.0, 96); led.mesh.position.set(0, 5.0, -2.52); S.group.add(led.mesh);
  B.box(0, 3.35, -2.6, 7.3, 0.2, 0.2, K.ink, { base: 0 }); B.box(0, 6.45, -2.6, 7.3, 0.2, 0.2, K.ink, { base: 0 }); [-3.55, 3.55].forEach((x) => B.box(x, 3.35, -2.6, 0.2, 3.3, 0.2, K.ink, { base: 0 }));
  TA.box(-3.75, 3.2, -2.48, 0.07, 3.5, 0.07, W3, { base: 0, tint: 0 }); TB.box(3.75, 3.2, -2.48, 0.07, 3.5, 0.07, W3, { base: 0, tint: 0 }); TA.box(0, 6.7, -2.48, 7.6, 0.07, 0.07, W3, { base: 0, tint: 0 });
  S.screen('sign_beer', -8.8, 4.6, -2.55, 2.2, 2.2, 0, 0, [1.2, 1.2, 1.2]); S.screen('sign_open', 8.6, 4.8, -2.55, 3.0, 1.3, 0, 0, [1.2, 1.2, 1.2]);
  S.decal('poster_open', -6.9, 3.4, -2.55, 1.2, 1.7, 0, 0, [1.05, 1.05, 1.05]); S.decal('poster_batt', -11.2, 3.4, -2.55, 1.2, 1.7, 0, 0, [1.05, 1.05, 1.05]); S.decal('poster_show', 11.0, 3.2, -2.55, 1.2, 1.7, 0, 0, [1.05, 1.05, 1.05]); S.decal('poster_kara', 6.8, 3.2, -2.55, 1.2, 1.7, 0, 0, [1.05, 1.05, 1.05]);
  S.decal('menu', 11.0, 5.3, -2.55, 2.2, 1.4, 0, 0, [1.05, 1.05, 1.05]);
  // ---------------------------------------------------------------- stage dressing: curtains, valance, PA, wedges, truss with par cans, a stool and a guitar
  curtain(GL, { x0: -6.6, x1: -4.8, y0: h, y1: 7.4, z: -2.45, depth: 0.3, rand: R, valance: 0, k: 0.62, fw: 0.3 }); curtain(GL, { x0: 4.8, x1: 6.6, y0: h, y1: 7.4, z: -2.45, depth: 0.3, rand: R, valance: 0, k: 0.62, fw: 0.3 });
  curtain(GL, { x0: -6.6, x1: 6.6, y0: 6.5, y1: 7.5, z: -2.45, depth: 0.3, rand: R, fringe: false, valance: 0.7, fw: 0.4, k: 0.62 });
  speaker(B, -5.7, 0.8, 0.28, { y0: h, h: 3, s: 1.5 }); speaker(B, 5.7, 0.8, -0.28, { y0: h, h: 3, s: 1.5 });
  wedge(B, -2.4, h, 1.9, 0.12, 1.1); wedge(B, 2.4, h, 1.9, -0.12, 1.1);
  const ty = 7.2, tz = -0.9; truss(B, [-5.3, ty, tz], [5.3, ty, tz], 0.4, K.steel, K.steelD, 0.7); [-5.3, 5.3].forEach((x) => { truss(B, [x, h, tz], [x, ty - 0.2, tz], 0.36, K.steel, K.steelD, 0.7); B.box(x, h, tz, 0.7, 0.06, 0.7, K.steelD, { base: 0 }); });
  [-4.2, -2.4, -0.8, 0.8, 2.4, 4.2].forEach((x, i) => parCan(B, GL, x, ty - 0.3, tz + 0.1, x * -0.05, 0.6, i % 2 ? CYANN : PINKN, 0.16));
  B.lathe([[0.3, 0, K.woodD], [0.28, 0.06, K.woodL], [0.24, 0.8, K.woodL], [0.25, 0.83, K.wood], [0, 0.84, K.wood]], 8, 3.7, h, -1.1, {});
  // ---------------------------------------------------------------- tables with candles, bottle shelf and counter on the left flank, string lights
  [[-11.3, 9, 0.2], [-11.3, 15, -0.1], [-11.3, 21, 0.1], [11.3, 9, -0.2], [11.3, 15, 0.1], [11.3, 21, -0.1]].forEach(([x, z, ry]) => candleTable(B, GL, x, z, ry));
  B.box(-12.5, 0, 14, 1.3, 1.25, 12, K.woodD, { base: 0.3 }); B.box(-12.45, 1.25, 14, 1.5, 0.12, 12.2, K.woodL, { base: 0.1 }); 
  for (let z = 9; z < 20; z += 2.2) S.decal('bottles', -12.93, 2.6, z + 1.1, 2.2, 0.6, Math.PI / 2, 0, [1, 1, 1]); B.box(-12.85, 2.3, 14, 0.25, 0.08, 12, K.woodL, { base: 0.1 }); B.box(-12.85, 3.2, 14, 0.25, 0.08, 12, K.woodL, { base: 0.1 });
  S.screen('sign_juice', -12.95, 4.8, 14, 3.6, 1.4, Math.PI / 2, 0, [1.2, 1.2, 1.2]);
  stringLights(B, GL, [-12.6, 8.4, 6], [12.6, 8.4, 6], 26, 0.9, null, [[3.2, 2.1, 0.9], [3.2, 0.7, 1.6], [0.6, 2.4, 3.0], [3.2, 2.1, 0.9]]); stringLights(B, GL, [-12.6, 8.4, 14], [12.6, 8.4, 14], 26, 0.9, null, [[3.2, 2.1, 0.9], [0.6, 2.4, 3.0], [3.2, 2.1, 0.9], [3.2, 0.7, 1.6]]);
  S.decal('poster_tour', 12.95, 3.2, 11.5, 1.2, 1.7, -Math.PI / 2, 0, [1.05, 1.05, 1.05]); S.decal('poster_open', 12.95, 3.2, 26, 1.2, 1.7, -Math.PI / 2, 0, [1.05, 1.05, 1.05]); S.decal('photos', 12.95, 3.4, 17.5, 2.4, 1.2, -Math.PI / 2, 0, [1.05, 1.05, 1.05]);
  // ---------------------------------------------------------------- the lyric / title screen
  const defaults = () => led.text(karaoke ? [{ t: 'KARAOKE', c: '#a6ff3d', k: 1.05 }, { t: 'SING ALONG', c: '#ffd8a0', k: 0.5 }] : [{ t: String(o.title || 'OPEN MIC'), c: '#35f2e0', k: 1.05 }, { t: String(o.sub || 'THE BAR'), c: '#ffd8a0', k: 0.5 }], { bg: ['#34166e', '#0f0826'], rays: ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)'] });
  defaults();
  const api = {
    setLyrics(lines, opt) { if (!lines || !lines.length) { defaults(); return; } led.text(lines.map((l, i) => (typeof l === 'string' ? { t: l, c: i === 0 ? '#ffe9a0' : '#cfe8ff', k: i === 0 ? 1.1 : 0.8 } : l)), Object.assign({ bg: ['#1b0a46', '#0a0620'], rays: ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] }, opt || {})); },
    setTitle(title, sub) { led.text([{ t: String(title || 'OPEN MIC'), c: '#35f2e0', k: 1.05 }, { t: String(sub || ''), c: '#ffd8a0', k: 0.5 }], { bg: ['#34166e', '#0f0826'], rays: ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)'] }); },
  };
  // ---------------------------------------------------------------- crowd on the flanks (corridor -3.5..3.5 stays free for the highway)
  let crowd = null; const n = o.crowd !== undefined ? o.crowd : (o.q === 'low' ? 8 : o.q === 'med' ? 12 : 16);
  if (n > 0) { const pos = []; for (let i = 0; i < n; i++) { const side = i % 2 ? 1 : -1, x = side * (4.3 + R() * 5.6), z = 5 + R() * 13; pos.push([x, z, Math.atan2(-x * 0.5, -z - 4) + (R() - 0.5) * 0.4]); } crowd = createCrowd(V.ctx, n, { positions: pos, seed: o.seed + 3, energy: 0.35, bpm: 100 }); S.group.add(crowd.object); }
  V.anchors.performer = { x: 0, y: h, z: 0 }; V.anchors.stageFront = { x: 0, y: h, z: 2.3 }; V.anchors.led = { x: 0, y: 5, z: -2.52 };
  V.anchors.rig = [-4.2, -2.4, -0.8, 0.8, 2.4, 4.2].map((x) => ({ x, y: ty - 0.3, z: tz })); V.anchors.stageCenter = { x: 0, z: 0 };
  const P = (x, y, z) => [x + o.x, y, z + o.z];
  V.cams.play = { pos: P(0, 6.0, 23.8), look: P(0, 0.5, 5.4), fov: 0 }; V.cams.stage = { pos: P(0, 3.4, 8.5), look: P(0, 2.6, 0), fov: 44 }; V.cams.wide = { pos: P(0, 7.5, 27), look: P(0, 1.0, 3), fov: 54 };
  return { led, crowd, api, hint: { profile: 'club', theme: 'pink', interior: true, ceilY: 8.5, note: 'lighting.setProfile(club) + setStageTheme(pink); terrain stand-in needs interior:true and ceilY 8.5' } };
}

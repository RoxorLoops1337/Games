// Bar stage (Stage and Club Artist INT-B): the 5 x 2.5 m stage in the right-back corner. Deck with LED front lip, velvet curtains and a gold valance around a framed LED screen
// (programme, karaoke lyrics), neon proscenium rods, PA stacks, monitors, mic stand, a stool and guitar, a DJ table with a glowing laptop and a LIVE sign.
import { mix, mul, K, bar, stageDeck, steps, speaker, wedge, micStand, guitar, curtain, makeLed, PINKN, CYANN, GOLDN, VIOLETN, WARMS, GREENN, LIMEN, aoTint } from './venue_kit.js';
import { BAR } from './bar_shell.js';

export function buildStage(S) {
  const B = S.B, GL = S.GLOW, st = BAR.stage, h = st.h, R = S.rand, cx = (st.x0 + st.x1) / 2, zb = st.z0 + 0.08;
  stageDeck(B, GL, { x0: st.x0, x1: st.x1, z0: st.z0, z1: st.z1, h, color: mix(K.deckL, K.plumL, 0.45), segments: 10 });
  steps(B, cx, 1.1, st.z1, h, 2, K.deckL); S.soft(cx, st.z1 + 0.35, 0.9, 0.5, 0.35);
  // dark runner and a gaffer-taped X where the singer stands
  B.box(cx, h, -3.5, 2.6, 0.012, 1.4, mix(K.deckD, K.velvetD, 0.3), { base: 0, tint: 0.02 }); B.box(cx, h + 0.012, -3.25, 0.5, 0.004, 0.04, K.yellow, { base: 0 });
  // back wall: curtains left and right, framed LED screen in the middle, gold valance on top
  const lcw = 0.95;
  curtain(B, { x0: st.x0 + 0.04, x1: st.x0 + lcw, y0: h, y1: 3.05, z: zb, depth: 0.2, rand: R, valance: 0 });
  curtain(B, { x0: st.x1 - lcw, x1: st.x1 - 0.04, y0: h, y1: 3.05, z: zb, depth: 0.2, rand: R, valance: 0 });
  curtain(B, { x0: st.x0 + 0.04, x1: st.x1 - 0.04, y0: 2.55, y1: 3.12, z: zb, depth: 0.2, rand: R, fringe: false, valance: 0.4, fw: 0.3 });
  // dark backdrop behind the screen and its frame
  const sx0 = st.x0 + lcw + 0.1, sx1 = st.x1 - lcw - 0.1, sy0 = 0.85, sy1 = 2.5, scx = (sx0 + sx1) / 2;
  B.box(scx, h, zb + 0.01, sx1 - sx0 + 0.3, 2.65 - h, 0.06, K.deckD, { base: 0.2, tint: 0.02 });
  B.box(scx, sy1 + 0.02, zb + 0.06, sx1 - sx0 + 0.2, 0.1, 0.1, K.ink, { base: 0 }); B.box(scx, sy0 - 0.08, zb + 0.06, sx1 - sx0 + 0.2, 0.1, 0.1, K.ink, { base: 0 });
  [sx0 - 0.05, sx1 + 0.05].forEach((x) => B.box(x, sy0 - 0.08, zb + 0.06, 0.1, sy1 - sy0 + 0.2, 0.1, K.ink, { base: 0 }));
  // neon rods framing the screen
  GL.box(sx0 - 0.1, sy0 - 0.06, zb + 0.12, 0.035, sy1 - sy0 + 0.14, 0.035, PINKN, { base: 0, tint: 0 }); GL.box(sx1 + 0.1, sy0 - 0.06, zb + 0.12, 0.035, sy1 - sy0 + 0.14, 0.035, CYANN, { base: 0, tint: 0 });
  GL.box(scx, sy1 + 0.1, zb + 0.12, sx1 - sx0 + 0.2, 0.035, 0.035, VIOLETN, { base: 0, tint: 0 });
  // gold logo above the screen row is replaced by the programme on the LED; LIVE sign next to the stage on the north wall
  S.screen('sign_live', st.x0 - 0.5, 2.2, -4.88, 0.62, 0.31, 0, 0, [1.25, 1.25, 1.25]); S.lights.push({ x: st.x0 - 0.5, y: 2.2, z: -4.5, color: '#ff4a4a', r: 1.7, i: 0.42, kind: 'neon' });
  // LED screen (canvas, live)
  const led = makeLed(sx1 - sx0, sy1 - sy0, 118); led.mesh.position.set(scx, (sy0 + sy1) / 2, zb + 0.065); led.rect = { x0: sx0, x1: sx1, y0: sy0, y1: sy1, cx: scx };
  // PA stacks and monitors
  speaker(B, st.x0 + 0.62, st.z1 - 0.7, 0.3, { y0: h, h: 2, s: 1.0 }); speaker(B, st.x1 - 0.62, st.z1 - 0.7, -0.3, { y0: h, h: 2, s: 1.0 });
  wedge(B, cx - 1.05, h, st.z1 - 0.3, 0.12); wedge(B, cx + 1.05, h, st.z1 - 0.3, -0.12);
  S.hit.box(cx, (st.z0 + st.z1) / 2, (st.x1 - st.x0) / 2 + 0.05, (st.z1 - st.z0) / 2 + 0.05, 0);
  // singer: mic stand and a cable loop, stool + guitar, DJ table
  micStand(B, GL, cx, h, -3.35, 0, 1.4);
  B.lathe([[0.2, 0, K.woodD], [0.19, 0.04, K.woodL], [0.16, 0.5, K.woodL], [0.17, 0.52, K.wood], [0.0, 0.52, K.wood]], 8, 2.05, h, -4.05, {});
  guitar(B, 1.78, h, -3.55, 0.5, 0.18, K.orange);
  { const tx = 5.0, tz = -4.35; B.box(tx, h, tz, 1.1, 0.72, 0.6, K.ink, { base: 0.2, tint: 0.03, top: K.inkL }); B.box(tx - 0.28, h + 0.72, tz, 0.5, 0.012, 0.32, K.steelD, { base: 0 }); B.lathe([[0.15, 0, K.ink], [0.15, 0.015, K.steelD], [0, 0.016, K.steel]], 10, tx + 0.3, h + 0.72, tz + 0.05, {});
    B.box(tx - 0.26, h + 0.73, tz, 0.34, 0.012, 0.24, K.steelL, { base: 0 }); B.quad([tx - 0.43, h + 0.735, tz - 0.14], [tx - 0.43, h + 0.735 + 0.22, tz - 0.17], [tx - 0.09, h + 0.735 + 0.22, tz - 0.17], [tx - 0.09, h + 0.735, tz - 0.14], K.ink);
    GL.quad([tx - 0.4, h + 0.76, tz - 0.152], [tx - 0.4, h + 0.93, tz - 0.168], [tx - 0.12, h + 0.93, tz - 0.168], [tx - 0.12, h + 0.76, tz - 0.152], GREENN); S.lights.push({ x: tx - 0.3, y: h + 1.0, z: tz + 0.1, color: '#9dff9a', r: 0.9, i: 0.32, kind: 'tv' }); }
  // stage lights (practical glow for the lighting module)
  S.lights.push({ x: cx, y: 2.5, z: -3.4, color: '#ff3ea5', r: 2.5, i: 0.59, flicker: 0.1, kind: 'neon' }, { x: st.x1 - 0.8, y: 2.2, z: -4.4, color: '#35f2e0', r: 1.9, i: 0.49, kind: 'neon' });
  // a floor strip of rope-light along the front of the stage (cyan), cable runs
  GL.box(cx, 0.02, st.z1 + 0.05, st.x1 - st.x0 - 0.3, 0.014, 0.03, CYANN, { base: 0, tint: 0 });
  S.soft(cx, st.z1 + 0.3, (st.x1 - st.x0) / 2 + 0.2, 0.5, 0.4);
  S.anchors.stageCenter = { x: cx, z: -3.6 }; S.anchors.stageSpot = { x: cx, z: st.z1 + 0.85, rot: Math.PI };
  S.stageDeck = { cx, h };
  return { led };
}
// what the stage LED shows when nobody is singing: the programme tag over an equaliser
export function drawLedProgramme(led, prog, day) {
  const tag = (prog && prog.tag) || 'OPEN MIC', c = (prog && prog.color) || '#35f2e0';
  led.text([{ t: tag, c, k: 1.05 }, { t: (day || '').toUpperCase(), c: '#ffd8a0', k: 0.55 }], { bg: ['#34166e', '#0f0826'], rays: ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)'] });
}

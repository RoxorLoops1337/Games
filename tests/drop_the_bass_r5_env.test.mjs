// Round 5: the world sign is left out when the battle layout would cover it; the lane chevrons are not stroked point by point every frame.
import assert from 'node:assert/strict';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const made = [];
function fakeCtx(cv) {
  const log = { ops: 0, lineTo: 0, texts: 0 };
  const base = { canvas: cv, __log: log, globalAlpha: 1, getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) };
  return new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => { log.ops++; if (k === 'lineTo') log.lineTo++; if (k === 'fillText' || k === 'strokeText') log.texts++; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
globalThis.document = { createElement: () => { const cv = { width: 0, height: 0 }; cv.getContext = () => (cv.__c || (cv.__c = fakeCtx(cv))); made.push(cv); return cv; } };
const E = await import('../drop_the_bass/js/doodle_env.js');
const main = (a) => { const cv = { width: 780, height: 1688 }; const c = fakeCtx(cv); c.getTransform = () => ({ a, b: 0, c: 0, d: a, e: 0, f: 0 }); return c; };
const lines = (from) => made.slice(from).reduce((s, cv) => s + (cv.__c ? cv.__c.__log.lineTo : 0), 0);
const texts = (from) => made.slice(from).reduce((s, cv) => s + (cv.__c ? cv.__c.__log.ops : 0), 0);

// 1. the sign box and the avoid rect
const b = E.signBox('garage', 1280, 720); ok(b && b.x0 < 640 && b.x1 > 640, 'garage sign is centred');
ok(E.signBox('nope', 100, 100) === null, 'no sign for an unknown world');
E.setArtScale(2);
let m0 = made.length; E.drawBackdrop(main(2), 'garage', 1280, 720, 1, {}); const withSign = texts(m0);
E.setArtScale(2); m0 = made.length; E.drawBackdrop(main(2), 'garage', 1280, 720, 1, { avoid: { x: 370, y: 8, w: 540, h: 712 } }); const covered = texts(m0);
E.setArtScale(2); m0 = made.length; E.drawBackdrop(main(2), 'garage', 1280, 720, 1, { avoid: { x: 0, y: 700, w: 100, h: 20 } }); const clear = texts(m0);
ok(covered < withSign, 'a sign under the board column is not drawn (' + covered + ' vs ' + withSign + ' bake ops)');
ok(clear === withSign, 'a sign in a clear area is drawn');

// 2. chevrons: Path2D replay while marching, baked into the floor in Low graphics
const strokes = []; globalThis.Path2D = class { moveTo() { strokes.push('m'); } lineTo() { strokes.push('l'); } };
E.setArtScale(2); m0 = made.length; E.drawBoard(main(1.44), 'garage', 'garage', 1, {}); const bakeNormal = lines(m0);
m0 = made.length; E.drawBoard(main(1.44), 'garage', 'garage', 1, { lite: true }); const bakeLite = lines(m0);
ok(bakeLite > bakeNormal, 'Low graphics bakes the chevrons into the floor (' + bakeLite + ' vs ' + bakeNormal + ' lineTo)');
const warm = main(1.44); E.drawBoard(warm, 'garage', 'garage', 2, {}); const lite = main(1.44); E.drawBoard(lite, 'garage', 'garage', 2, { lite: true });
const frame = main(1.44); E.drawBoard(frame, 'garage', 'garage', 2.01, {});
ok(frame.__log.lineTo < 10, 'a normal frame builds no chevron points live (Path2D replay): ' + frame.__log.lineTo);
const f2 = main(1.44); E.drawBoard(f2, 'garage', 'garage', 2.01, { lite: true });
ok(f2.__log.ops < frame.__log.ops, 'Low graphics frame has fewer ops: ' + f2.__log.ops + ' vs ' + frame.__log.ops);
delete globalThis.Path2D;
const live = main(1.44); E.drawBoard(live, 'garage', 'garage', 2.02, {});
ok(live.__log.lineTo - frame.__log.lineTo > 50, 'without Path2D the chevrons are built live (node fallback): ' + live.__log.lineTo);
console.log('drop_the_bass r5 env: ' + n + ' checks ok');

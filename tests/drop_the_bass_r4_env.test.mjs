// Round 4: the backdrop and board floor are baked at the device scale and blitted 1:1; Low graphics drops the live bits; a language change rebakes the titles.
import assert from 'node:assert/strict';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
// a fake DOM: every canvas records what is drawn into it, so the test can see the bake sizes and the blits
const made = [];
function fakeCtx(cv) {
  const log = { ops: 0, images: [], transforms: [] };
  const base = { canvas: cv, __log: log, globalAlpha: 1, getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) };
  return new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'drawImage') return (...a) => { log.ops++; log.images.push(a); };
      if (k === 'setTransform') return (...a) => { log.transforms.push(a); };
      return () => { log.ops++; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
globalThis.document = { createElement: () => { const cv = { width: 0, height: 0 }; cv.getContext = () => (cv.__c || (cv.__c = fakeCtx(cv))); made.push(cv); return cv; } };
const E = await import('../drop_the_bass/js/doodle_env.js');
const I = await import('../drop_the_bass/js/i18n.js');
const main = (a, e = 0, f = 0) => { const cv = { width: 780, height: 1688 }; const c = fakeCtx(cv); c.getTransform = () => ({ a, b: 0, c: 0, d: a, e, f }); return c; };

// 1. the backdrop is baked at the device scale (2) and every frame is one integer 1:1 blit
E.setArtScale(2); made.length = 0;
let c = main(2); c.getTransform = () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
E.drawBackdrop(c, 'garage', 390, 844, 1, { beat: 0.2 });
const bg = made.filter((m) => m.width === 780 && m.height === 1688);
ok(bg.length === 2, 'two boil frames baked at 780x1688 (390x844 at scale 2): ' + made.map((m) => m.width + 'x' + m.height).join(','));
let blit = c.__log.images.find((a) => a.length === 3);
ok(blit && blit[1] === 0 && blit[2] === 0, 'a 3-argument drawImage at integer device pixels (1:1)');
// a different device scale is a different bake, not a stretched blit
made.length = 0; c = main(1.5); E.drawBackdrop(c, 'garage', 390, 844, 1, { beat: 0.2 });
ok(made.some((m) => m.width === Math.ceil(390 * 1.5) && m.height === Math.ceil(844 * 1.5)), 'bake follows the context scale');
// repeated frames bake nothing new
made.length = 0; c = main(1.5); for (let i = 0; i < 5; i++) E.drawBackdrop(c, 'garage', 390, 844, 1 + i * 0.016, { beat: 0.2 });
ok(made.length === 0, 'no new canvases while drawing frames');

// 2. Low graphics: only the baked page, no twinkles, flames, bubbles or beat pulse
for (const id of ['moon', 'beach', 'club', 'festival', 'arena', 'busk', 'title']) {
  const a = main(1.5), b = main(1.5); E.drawBackdrop(a, id, 390, 844, 4.4, { beat: 0.5 }); E.drawBackdrop(b, id, 390, 844, 4.4, { beat: 0.5, lite: true });
  ok(b.__log.ops < a.__log.ops && b.__log.ops <= 6, id + ' lite is just the blit: ' + b.__log.ops + ' ops vs ' + a.__log.ops);
}
for (const [id, extra] of [['moon', 40], ['beach', 20]]) {
  const a = main(1.5), b = main(1.5); E.drawBoard(a, id, id, 4.4, { beat: 0.5 }); E.drawBoard(b, id, id, 4.4, { beat: 0.5, lite: true });
  ok(a.__log.ops - b.__log.ops > extra, id + ' board lite drops the live bits: ' + a.__log.ops + ' -> ' + b.__log.ops);
}

// 3. the world sign is drawn text: switching the language rebakes the backdrop, switching back is a cache hit
I.setLang('en'); const lang0 = I.getLang(); E.setArtScale(2); made.length = 0; c = main(1);
E.drawBackdrop(c, 'moon', 390, 844, 1, {}); const first = made.length; ok(first >= 2, 'baked once');
E.drawBackdrop(c, 'moon', 390, 844, 1, {}); ok(made.length === first, 'cached');
I.setLang('de'); E.drawBackdrop(c, 'moon', 390, 844, 1, {});
if (I.getLang() !== lang0) ok(made.length > first, 'a language change rebakes the titles'); else ok(true, 'de not loaded in this runtime');
I.setLang('en');

// 4. static creep: four strip blits (not one full-screen blit), nothing when calm
E.setArtScale(2); c = main(1.5); E.drawBackdrop(c, 'club', 390, 844, 1, { staticAmt: 0 });
const calm = c.__log.images.filter((a) => a.length === 9).length; ok(calm === 0, 'no creep when calm');
c = main(1.5); E.drawBackdrop(c, 'club', 390, 844, 1, { staticAmt: 0.6 });
const strips = c.__log.images.filter((a) => a.length === 9);
ok(strips.length >= 2 && strips.length <= 4, 'creep is drawn as strips: ' + strips.length);
ok(strips.every((a) => a[3] * a[4] < 390 * 844 * 1.5 * 1.5 * 0.5), 'each strip is a fraction of the screen');

// 5. the board floor follows its settled scale (a punch-in zoom does not rebake it)
E.setArtScale(2); made.length = 0; c = main(1.44); E.drawBoard(c, 'garage', 'garage', 1, {});
const baked = made.length; ok(baked >= 2, 'board baked');
const z = main(1.44 * 1.02); for (let i = 0; i < 5; i++) E.drawBoard(z, 'garage', 'garage', 1 + i * 0.1, {});
ok(made.length === baked, 'zoom frames reuse the settled bake');
const exact = main(1.44, 3.3, 7.8); E.drawBoard(exact, 'garage', 'garage', 1, {});
ok(exact.__log.images.some((a) => a.length === 3 && Number.isInteger(a[1]) && Number.isInteger(a[2])), 'board blit is snapped to whole device pixels');
console.log('drop_the_bass r4 env: ' + n + ' checks ok');

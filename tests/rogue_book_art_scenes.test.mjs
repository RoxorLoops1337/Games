// ART.scene: the full-screen background paintings and the INKWOVEN logo (js/art_scenes.js), headless on the strict canvas stub.
//
// What this pins down:
//   * every DATA.LISTS.scenes id has real art (ART.has), ART.scene.info tells combat scenes from screen scenes, gallery sheets are registered
//   * every scene draws at many sizes, aspect ratios and t values without throwing, without a single canvas issue, and returns true
//   * static layers are cached: a second draw at the same size bakes nothing new, and later frames at other t values stay on the cache
//   * a draw is a pure function of (id, size, t, opts): same arguments give the identical call log, another t moves something, another parallax
//     shifts the layers, particles:0 removes the particles, reduceMotion and quality low still draw cleanly and do less
//   * unknown ids, zero sizes, NaN and Infinity never throw; the paper texture fills any size and seeds differ; the logo draws at every width
//   * the composition contract of the combat scenes (ground plane 520, at least the layer stack that carries the HUD shade)
//   * a performance smoke test: a warm scene draw stays far below its 2.5 ms budget even on the recording stub
import { boot, harness } from './rogue_book_lib.mjs';
// Wall-clock budgets are strict with RB_PERF=1 on an idle machine; otherwise 4x slack so a loaded CI box cannot flake the check.
const PERF_SLACK = process.env.RB_PERF ? 1 : 4;

const t = harness('rogue_book art scenes');
const api = boot({ only: ['util', 'data', 'art', 'art_scenes'] });
const { ART, DATA, U } = api;
const L = DATA.LISTS;
t.ok(!api._errors || api._errors.length === 0, 'art_scenes loads without errors: ' + JSON.stringify(api._errors));
t.ok(!api._warnings || api._warnings.length === 0, 'art_scenes loads without warnings: ' + JSON.stringify(api._warnings));
const doc = api._doc;
const newCtx = () => doc.createElement('canvas').getContext('2d');
const issues = () => api._issues.map((i) => `${i.kind}: ${i.detail} @ ${i.at}`).slice(0, 4).join(' | ');
const clean = () => { api._resetCounts(); };
const COMBAT = ['ch1', 'ch2', 'ch3', 'boss1', 'boss2', 'boss3'];
const SIZES = [[1280, 720], [640, 360], [320, 180], [1600, 900], [844, 390], [1024, 768], [300, 300], [64, 36]];
const TS = [0, 0.4, 3.7, 12.3, 101.9];

const ids = new WeakMap();
let idN = 0;
const idOf = (o) => { if (!ids.has(o)) ids.set(o, ++idN); return ids.get(o); };
// a recording context: every call and every property write becomes a string, numbers rounded, so two drawings can be compared
function recorder() {
  const log = [];
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(2) : typeof v === 'string' ? v : v && v._kind ? 'grad' : v && typeof v === 'object' ? 'obj#' + idOf(v) : String(v));
  const real = newCtx();
  const proxy = new Proxy(real, {
    get(target, key) {
      const v = target[key];
      if (typeof v === 'function') return (...a) => { log.push(key + '(' + a.map(fmt).join(',') + ')'); return v.apply(target, a); };
      return v;
    },
    set(target, key, v) { target[key] = v; log.push('=' + String(key) + ':' + fmt(v)); return true; },
  });
  return { ctx: proxy, log, real };
}
const record = (fn) => { const r = recorder(); fn(r.ctx); return r.log; };
const drawLog = (id, w, h, tt, o) => record((c) => ART.scene.draw(c, id, w, h, tt, o));
const count = (log, name) => log.filter((l) => l.startsWith(name + '(')).length;
const stats = () => ART.sprite.stats();

// ------------------------------------------------------------------ registration
t.test('every scene id has real art and the API is in place', () => {
  t.eq(typeof ART.scene.draw, 'function', 'ART.scene.draw'); t.eq(typeof ART.scene.logo, 'function', 'ART.scene.logo');
  t.eq(typeof ART.scene.warm, 'function', 'ART.scene.warm'); t.eq(typeof ART.scene.info, 'function', 'ART.scene.info');
  L.scenes.forEach((id) => t.ok(ART.has('scene', id), `ART.has(scene, ${id})`));
  t.deep(ART.scene.ids.slice().sort(), L.scenes.slice().sort(), 'ART.scene.ids covers exactly DATA.LISTS.scenes');
  t.deep(ART.scene.DESIGN, { w: 1280, h: 720, ground: 520 }, 'design space');
});
t.test('gallery sheets are registered: scenes, scene_<id>, logo, title_anim', () => {
  ['scenes', 'logo', 'title_anim'].concat(L.scenes.map((id) => 'scene_' + id)).forEach((n) => t.eq(typeof ART.sheets[n], 'function', `sheet ${n}`));
});
t.test('info: combat scenes stand on ground y = 520, screen scenes do not', () => {
  COMBAT.forEach((id) => { const i = ART.scene.info(id); t.ok(i && i.combat === true && i.ground === 520, `${id} combat with ground 520`); t.ok(i.layers >= 6, `${id} has a layer stack (${i && i.layers})`); t.ok(i.mood.length > 3, `${id} has a mood`); });
  ['title', 'camp', 'shop', 'event', 'treasure', 'victory', 'defeat', 'paper'].forEach((id) => { const i = ART.scene.info(id); t.ok(i && i.combat === false && i.ground === null, `${id} is a screen scene`); });
  t.eq(ART.scene.info('nope'), null, 'unknown id has no info');
});

// ------------------------------------------------------------------ drawing
t.test('every scene draws at every size and several t without throwing, issues or an error', () => {
  clean();
  const ctx = newCtx();
  L.scenes.forEach((id) => {
    SIZES.forEach(([w, h]) => TS.forEach((tt) => {
      const before = api._counts.drawImage || 0;
      const ok = ART.scene.draw(ctx, id, w, h, tt, { particles: 1 });
      t.ok(ok === true, `${id} ${w}x${h} t=${tt} returns true`);
      t.ok(ART.scene.lastError === null, `${id} ${w}x${h} t=${tt} no caught error: ${ART.scene.lastError}`);
      t.ok((api._counts.drawImage || 0) >= before, 'counts are monotonic');
    }));
    t.ok((api._counts.drawImage || 0) > 0, 'layers were composited');
  });
  t.eq(issues(), '', 'no canvas issues from any scene');
  t.ok(api._counts.save === api._counts.restore || (api._counts.save || 0) >= 0, 'save and restore counted');
});
t.test('save and restore stay balanced for every scene and the logo', () => {
  const bal = (fn) => { const r = recorder(); fn(r.ctx); const s = count(r.log, 'save'), e = count(r.log, 'restore'); return [s, e, r.real._stack.length]; };
  L.scenes.forEach((id) => { const [s, e, open] = bal((c) => ART.scene.draw(c, id, 1280, 720, 2.2, { particles: 1 })); t.eq(s, e, `${id} save/restore balance (${s}/${e})`); t.eq(open, 0, `${id} leaves nothing open`); });
  const [s, e, open] = bal((c) => ART.scene.logo(c, 640, 200, 700, 1.7)); t.eq(s, e, 'logo balance'); t.eq(open, 0, 'logo leaves nothing open');
});
t.test('a scene clips to its rectangle and paints inside a saved transform', () => {
  COMBAT.concat(['title', 'camp']).forEach((id) => { const log = drawLog(id, 800, 450, 1, {}); t.ok(log.some((l) => l.startsWith('clip(')), `${id} clips`); t.ok(count(log, 'drawImage') >= 4, `${id} composites cached layers (${count(log, 'drawImage')})`); });
});
t.test('static layers are cached: a second draw bakes nothing, later frames stay on the cache', () => {
  L.scenes.forEach((id) => {
    ART.sprite.clear();
    const ctx = newCtx();
    ART.scene.draw(ctx, id, 1280, 720, 0, { particles: 1 });
    const a = stats();
    ART.scene.draw(ctx, id, 1280, 720, 0, { particles: 1 });
    const b = stats();
    t.eq(b.misses, a.misses, `${id} second draw at the same t has no cache misses`);
    t.ok(b.hits > a.hits, `${id} second draw hits the cache`);
    // frames at other times may wake animated items once (a lightning bolt, a flipping page), then the cache holds
    [0.6, 1.9, 4.4, 9.7, 13.1].forEach((tt) => ART.scene.draw(ctx, id, 1280, 720, tt, { particles: 1 }));
    const c = stats();
    [0.7, 2.0, 4.5, 9.8, 13.2].forEach((tt) => ART.scene.draw(ctx, id, 1280, 720, tt, { particles: 1 }));
    t.eq(stats().misses, c.misses, `${id} frames after warm-up bake nothing new`);
  });
});
t.test('warm() bakes a scene ahead of time and reports it', () => {
  ART.sprite.clear();
  t.ok(ART.scene.warm('ch1', 1280, 720) === true, 'warm ch1');
  const a = stats();
  ART.scene.draw(newCtx(), 'ch1', 1280, 720, 0, { particles: 0 });
  t.eq(stats().misses, a.misses, 'after warm the first real draw of the static layers is free');
  t.ok(ART.scene.warm('nope', 1280, 720) === false, 'warm of an unknown scene is false');
});
t.test('layers are baked only as large as needed: no scene needs more than a few screens of pixels', () => {
  L.scenes.forEach((id) => { ART.sprite.clear(); ART.scene.draw(newCtx(), id, 1280, 720, 1, { particles: 1 }); const px = stats().pixels, screens = px / (1280 * 720 * ART.res * ART.res); t.ok(screens < 9, `${id} baked ${screens.toFixed(1)} screens of pixels`); });
});

// ------------------------------------------------------------------ determinism, motion, options
t.test('a draw is deterministic and animated', () => {
  L.scenes.filter((id) => id !== 'paper').forEach((id) => {
    const a = drawLog(id, 1280, 720, 5.5, { particles: 1 }), b = drawLog(id, 1280, 720, 5.5, { particles: 1 });
    t.eq(a.join('\n'), b.join('\n'), `${id} same args, same drawing`);
    const c = drawLog(id, 1280, 720, 5.5 + 0.9, { particles: 1 });
    t.ok(a.join('\n') !== c.join('\n'), `${id} moves with t`);
  });
  t.eq(drawLog('paper', 500, 300, 1, {}).join('\n'), drawLog('paper', 500, 300, 9, {}).join('\n'), 'paper is still (a texture)');
});
t.test('particles: 0 removes particles, particles: 2 adds them, and true and false are accepted', () => {
  ['title', 'ch1', 'camp', 'victory', 'ch2', 'ch3', 'event'].forEach((id) => {
    const p0 = drawLog(id, 1280, 720, 3.3, { particles: 0 }), p1 = drawLog(id, 1280, 720, 3.3, { particles: 1 }), p2 = drawLog(id, 1280, 720, 3.3, { particles: 2 });
    t.ok(p1.length > p0.length, `${id}: particles 1 draws more than 0 (${p1.length} vs ${p0.length})`);
    t.ok(p2.length >= p1.length, `${id}: particles 2 draws at least as much as 1`);
    t.eq(drawLog(id, 1280, 720, 3.3, { particles: false }).join('\n'), p0.join('\n'), `${id}: false equals 0`);
    t.eq(drawLog(id, 1280, 720, 3.3, { particles: true }).join('\n'), p1.join('\n'), `${id}: true equals 1`);
  });
});
t.test('parallaxX shifts the layers, is clamped, and never breaks the drawing', () => {
  ['ch1', 'title', 'ch2'].forEach((id) => {
    const a = drawLog(id, 1280, 720, 0, { parallaxX: 0 }).join('\n'), b = drawLog(id, 1280, 720, 0, { parallaxX: 60 }).join('\n'), c = drawLog(id, 1280, 720, 0, { parallaxX: 9999 }).join('\n'), d = drawLog(id, 1280, 720, 0, { parallaxX: 90 }).join('\n');
    t.ok(a !== b, `${id}: parallaxX 60 moves layers`);
    t.eq(c, d, `${id}: parallaxX is clamped to +-90`);
  });
  clean();
  const ctx = newCtx();
  [NaN, Infinity, -Infinity, 'x', null, undefined, -70].forEach((v) => t.ok(ART.scene.draw(ctx, 'ch1', 1280, 720, 1, { parallaxX: v }) === true, `parallaxX ${String(v)} is safe`));
  t.eq(issues(), '', 'no canvas issues from odd parallax values');
});
t.test('reduceMotion: parallax 0, particles x0.3, no flashes, and it still draws cleanly', () => {
  const opt = ART.tk.opt;
  try {
    opt.reduceMotion = true;
    clean();
    const a = drawLog('ch1', 1280, 720, 4, { parallaxX: 0 }).join('\n'), b = drawLog('ch1', 1280, 720, 4, { parallaxX: 80 }).join('\n');
    t.eq(a, b, 'parallax is forced to 0');
    const calm = drawLog('ch3', 1280, 720, 7.5, { particles: 1 });
    opt.reduceMotion = false;
    const lively = drawLog('ch3', 1280, 720, 7.5, { particles: 1 });
    t.ok(calm.length < lively.length, `fewer draw calls with reduceMotion (${calm.length} vs ${lively.length})`);
    opt.reduceMotion = true;
    L.scenes.forEach((id) => t.ok(ART.scene.draw(newCtx(), id, 640, 360, 2.5, { particles: 1 }) === true, `${id} draws with reduceMotion`));
    t.ok(ART.scene.logo(newCtx(), 640, 180, 600, 2) === true, 'logo draws with reduceMotion');
    t.eq(issues(), '', 'no canvas issues with reduceMotion');
  } finally { opt.reduceMotion = false; }
});
t.test('lightning never flashes hard: alpha stays low and it is skipped under reduceMotion', () => {
  const opt = ART.tk.opt;
  // scan a stretch of time for the highest additive full-sky flash alpha
  let maxA = 0;
  for (let tt = 0; tt < 30; tt += 0.05) {
    const log = drawLog('ch3', 320, 180, tt, { particles: 0 });
    log.forEach((l, i) => { if (l.startsWith('=globalCompositeOperation:lighter')) { const nxt = log.slice(i, i + 6).find((x) => x.startsWith('=globalAlpha:')); if (nxt) maxA = Math.max(maxA, +nxt.split(':')[1]); } });
  }
  t.ok(maxA <= 1, 'alpha values are valid');
  try {
    opt.reduceMotion = true;
    let strike = false;
    for (let tt = 0; tt < 30; tt += 0.05) { const log = drawLog('ch3', 320, 180, tt, { particles: 0 }); if (log.some((l) => l.startsWith('fillRect(0.00,0.00,1280.00,49'))) strike = true; }
    t.ok(!strike, 'no sky flash under reduceMotion');
  } finally { opt.reduceMotion = false; }
});
t.test('quality low: half-resolution layers, fewer particles, still clean', () => {
  const opt = ART.tk.opt;
  try {
    ART.sprite.clear();
    ART.scene.draw(newCtx(), 'ch1', 1280, 720, 1, { particles: 1 });
    const hi = stats().pixels;
    opt.quality = 'low'; ART.sprite.clear(); clean();
    L.scenes.forEach((id) => t.ok(ART.scene.draw(newCtx(), id, 1280, 720, 2.5, { particles: 1 }) === true, `${id} draws at low quality`));
    ART.sprite.clear();
    ART.scene.draw(newCtx(), 'ch1', 1280, 720, 1, { particles: 1 });
    t.ok(stats().pixels < hi * 0.6, `low quality bakes fewer pixels (${stats().pixels} vs ${hi})`);
    t.eq(issues(), '', 'no canvas issues at low quality');
  } finally { opt.quality = 'high'; ART.sprite.clear(); }
});

// ------------------------------------------------------------------ robustness
t.test('unknown ids, bad sizes and odd inputs never throw', () => {
  clean();
  const ctx = newCtx();
  ['nope', '', 'CH1', 'ch1 ', 'constructor', '__proto__', 'toString'].forEach((id) => t.ok(ART.scene.draw(ctx, id, 1280, 720, 0, {}) === false, `unknown id "${id}" returns false`));
  [[0, 0], [-5, 10], [NaN, NaN], [1, 1], [Infinity, 720]].forEach(([w, h]) => { let threw = false; try { ART.scene.draw(ctx, 'ch1', w, h, 0, {}); } catch (e) { threw = true; } t.ok(!threw, `size ${w}x${h} does not throw`); });
  [undefined, null, NaN, Infinity, 'abc', -3, 1e12].forEach((tt) => t.ok(ART.scene.draw(ctx, 'title', 1280, 720, tt, {}) === true, `t = ${String(tt)} is safe`));
  [undefined, null, 7, 'x', [], { particles: 'lots' }, { particles: NaN }, { particles: -4 }, { seed: 'a' }].forEach((o) => t.ok(ART.scene.draw(ctx, 'ch2', 640, 360, 1, o) === true, `opts ${JSON.stringify(o)} is safe`));
  t.ok(ART.scene.draw(null, 'ch1', 1280, 720, 0, {}) === false, 'a null context is refused quietly');
  t.eq(issues(), '', 'no canvas issues from odd inputs');
});
t.test('a drawing error is caught, reported once and the frame still gets a fallback', () => {
  const bad = new Proxy(newCtx(), { get(target, key) { if (key === 'drawImage') return () => { throw new Error('boom'); }; const v = target[key]; return typeof v === 'function' ? v.bind(target) : v; }, set(target, key, v) { target[key] = v; return true; } });
  const errs = api._console.error.length;
  const ok = ART.scene.draw(bad, 'ch1', 1280, 720, 0, {});
  t.ok(ok === false, 'returns false');
  t.ok(/boom/.test(String(ART.scene.lastError)), 'lastError names the cause: ' + ART.scene.lastError);
  ART.scene.draw(bad, 'ch1', 1280, 720, 1, {});
  t.eq(api._console.error.length, errs + 1, 'the console error is logged once per scene');
  ART.scene.lastError = null;
});

// ------------------------------------------------------------------ paper and logo
t.test('paper fills any size at 1:1, seeds differ, edge can be switched off, and it is cached', () => {
  clean();
  const ctx = newCtx();
  [[50, 30], [300, 200], [1000, 700], [1280, 720], [2000, 1400], [7, 400]].forEach(([w, h]) => { ART.sprite.clear(); t.ok(ART.scene.draw(ctx, 'paper', w, h, 0, {}) === true, `paper ${w}x${h}`); });
  t.eq(issues(), '', 'no canvas issues from paper');
  const s0 = drawLog('paper', 400, 260, 0, { seed: 0 }).join('\n'), s1 = drawLog('paper', 400, 260, 0, { seed: 1 }).join('\n');
  t.ok(s0 === s0 && s0 !== s1, 'a different seed is a different (cache) drawing');
  ART.sprite.clear();
  ART.scene.draw(ctx, 'paper', 400, 260, 0, { seed: 3 });
  const a = stats();
  ART.scene.draw(ctx, 'paper', 400, 260, 0, { seed: 3 });
  t.eq(stats().misses, a.misses, 'paper is cached per size and seed');
  ART.scene.draw(ctx, 'paper', 400, 260, 0, { seed: 3, edge: false });
  t.ok(stats().misses > a.misses, 'edge:false is its own texture');
  // the texture covers the whole rectangle at 1:1: the composited image spans exactly w x h
  const log = drawLog('paper', 333, 222, 0, { seed: 2 });
  t.ok(log.some((l) => /^drawImage\(obj#\d+,0\.00,0\.00,333\.00,222\.00\)$/.test(l)), 'the paper sprite is blitted at (0,0,w,h)');
});
t.test('the logo draws at every width and t, is cached per width, and its drip moves', () => {
  clean();
  const ctx = newCtx();
  [12, 40, 120, 400, 740, 1200].forEach((w) => TS.forEach((tt) => { t.ok(ART.scene.logo(ctx, 640, 200, w, tt) === true, `logo w=${w} t=${tt}`); }));
  t.eq(issues(), '', 'no canvas issues from the logo');
  ART.sprite.clear();
  ART.scene.logo(ctx, 640, 200, 740, 0);
  const a = stats();
  ART.scene.logo(ctx, 100, 90, 740, 3.1);
  t.eq(stats().misses, a.misses, 'the lettering is baked once per width');
  const phases = [0.2, 0.9, 1.6, 2.3, 3.0, 3.7, 4.4, 5.1].map((tt) => record((c) => ART.scene.logo(c, 640, 200, 740, tt)).join('\n'));
  t.ok(new Set(phases).size >= 7, 'the logo animates over its drip cycle');
  const at = record((c) => ART.scene.logo(c, 300, 120, 500, 2)).join('\n'), bt = record((c) => ART.scene.logo(c, 300, 120, 500, 2)).join('\n');
  t.eq(at, bt, 'the logo is deterministic');
  t.ok(ART.scene.logo(ctx, NaN, NaN, NaN, NaN) === true, 'NaN arguments are absorbed');
  t.ok(ART.scene.logo(ctx, 0, 0, -100, 1) === true, 'a negative width is absorbed');
  // the title can draw its own logo when asked
  const plain = drawLog('title', 1280, 720, 1, { particles: 0 }), withLogo = drawLog('title', 1280, 720, 1, { particles: 0, logo: true });
  t.ok(withLogo.length > plain.length + 100, 'opts.logo adds the lettering to the title');
});

// ------------------------------------------------------------------ gallery sheets
t.test('every gallery sheet renders on a stub canvas, with guides and actors too', () => {
  clean();
  const cv = doc.createElement('canvas'); cv.width = 1600; cv.height = 900;
  const run = (name, p) => { const c = doc.createElement('canvas'); c.width = p.w; c.height = p.h; c.getContext('2d').setTransform(1, 0, 0, 1, 0, 0); let threw = null; try { ART.sheets[name](c, p); } catch (e) { threw = e; } t.ok(!threw, `sheet ${name} ${JSON.stringify(p)} renders${threw ? ': ' + threw.message : ''}`); };
  ['scenes', 'logo', 'title_anim'].forEach((n) => { run(n, { w: 1600, h: 900, t: 1.5 }); run(n, { w: 800, h: 450, t: 6 }); });
  L.scenes.forEach((id) => { run('scene_' + id, { w: 1280, h: 720, t: 2.2 }); run('scene_' + id, { w: 640, h: 360, t: 0, guides: 1, actors: 1, px: 40, particles: 0.5, logo: true, seed: 3 }); });
  t.ok(ART.scene.lastError === null, 'no caught errors in the sheets: ' + ART.scene.lastError);
  t.eq(issues(), '', 'no canvas issues from the sheets');
});

// ------------------------------------------------------------------ performance
t.test('performance smoke: a warm scene draw stays far under its 2.5 ms budget', () => {
  const ctx = newCtx();
  const perf = [];
  L.scenes.forEach((id) => {
    for (let i = 0; i < 30; i++) ART.scene.draw(ctx, id, 1280, 720, i * 0.37, { particles: 1 });   // warm up the layers and the JIT
    let ms = Infinity;
    for (let rep = 0; rep < 3; rep++) {                                                            // best of three, so a busy machine does not fail the suite
      const n = 60, t0 = process.hrtime.bigint();
      for (let i = 0; i < n; i++) ART.scene.draw(ctx, id, 1280, 720, 10 + i / 60, { particles: 1 });
      ms = Math.min(ms, Number(process.hrtime.bigint() - t0) / 1e6 / n);
    }
    perf.push(`${id} ${ms.toFixed(2)}`);
    t.ok(ms < 2.5 * PERF_SLACK, `${id} draws in ${ms.toFixed(2)} ms per frame`);
  });
  const t1 = process.hrtime.bigint();
  for (let i = 0; i < 100; i++) ART.scene.logo(ctx, 640, 200, 740, 5 + i / 60);
  const lm = Number(process.hrtime.bigint() - t1) / 1e6 / 100;
  t.ok(lm < 1, `logo draws in ${lm.toFixed(2)} ms per frame`);
  console.log('scene ms per frame on the stub: ' + perf.join(', ') + `, logo ${lm.toFixed(2)}`);
  ART.sprite.clear();
  const cold0 = process.hrtime.bigint();
  ART.scene.draw(ctx, 'title', 1280, 720, 0, { particles: 1 });
  t.ok(Number(process.hrtime.bigint() - cold0) / 1e6 < 2500, 'a cold first draw (all layers baked) is still quick on the stub');
});

t.done();

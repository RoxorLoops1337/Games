// ART core: the toolkit (art.js) and the four heroes (the chibi cast: art_cast_kit.js and the ART.hero adapter in art_cast.js), headless on the
// strict canvas stub.
//
// What this pins down:
//   * the ART namespace skeleton exists (every DESIGN 5.6 member, placeholders that never throw) and the palette mirrors the CSS tokens
//   * toolkit helpers are deterministic (same seed, same drawing; different seed, different drawing) and never emit a canvas issue
//   * the sprite cache memoises, evicts by count and by pixels, and survives a canvas stub
//   * every hero x pose x several t draws without throwing, issues draw calls, stays deterministic and animates
//   * unknown ids draw placeholders, portraits and medallions cover every expression and ratio, bounds and anchors are sane
//   * a performance smoke test (the cost per hero draw must stay far below a frame)
import fs from 'node:fs';
import { boot, harness } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus art core');
const api = boot({ only: ['util', 'data', 'art', 'art_cast_kit', 'art_cast'] });
const { ART, DATA, U } = api;
const L = DATA.LISTS;
t.ok(!api._errors || api._errors.length === 0, 'art files load without errors: ' + JSON.stringify(api._errors));
t.ok(!api._warnings || api._warnings.length === 0, 'art files load without warnings: ' + JSON.stringify(api._warnings));
const doc = api._doc;
const newCtx = () => doc.createElement('canvas').getContext('2d');
const clean = () => { api._resetCounts(); };
const issues = () => api._issues.map((i) => `${i.kind}: ${i.detail}`).slice(0, 5).join(' | ');

const ids = new WeakMap();
let idN = 0;
const idOf = (o) => { if (!ids.has(o)) ids.set(o, ++idN); return ids.get(o); };
// a recording context: every call and every property write becomes a string, numbers rounded, so drawings can be compared
function recorder() {
  const log = [];
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(3) : typeof v === 'string' ? v : v && v._kind ? 'grad' : v && typeof v === 'object' ? 'obj#' + idOf(v) : String(v));
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
const call = (fn) => { const r = recorder(); fn(r.ctx); return r.log.join('\n'); };

// ------------------------------------------------------------------ namespace skeleton
t.test('the ART namespace has every DESIGN 5.6 member', () => {
  ['hero', 'enemy', 'card', 'icon', 'scene', 'map', 'fx', 'sheets', 'tk'].forEach((k) => t.ok(ART[k] && typeof ART[k] === 'object', `ART.${k}`));
  ['sprite', 'sheet', 'sheetGrid', 'placeholder', 'has', 'declare', 'blit'].forEach((k) => t.eq(typeof ART[k], 'function', `ART.${k}`));
  t.ok(typeof ART.res === 'number' && ART.res > 0, 'ART.res is a positive number');
  ['draw', 'portrait', 'medallion', 'bounds', 'poseMs'].forEach((k) => t.eq(typeof ART.hero[k], 'function', `ART.hero.${k}`));
  ['register', 'draw', 'bounds', 'poseMs'].forEach((k) => t.eq(typeof ART.enemy[k], 'function', `ART.enemy.${k}`));
  t.eq(typeof ART.card.draw, 'function', 'ART.card.draw'); t.eq(typeof ART.card.motif, 'function', 'ART.card.motif');
  t.eq(typeof ART.icon.draw, 'function', 'ART.icon.draw');
  t.eq(typeof ART.scene.draw, 'function', 'ART.scene.draw'); t.eq(typeof ART.scene.logo, 'function', 'ART.scene.logo');
  ['hex', 'paintBloom', 'token'].forEach((k) => t.eq(typeof ART.map[k], 'function', `ART.map.${k}`));
  t.deep(ART.fx.names, L.fx, 'ART.fx.names equals LISTS.fx');
  L.fx.forEach((n) => { t.eq(typeof ART.fx[n], 'function', `ART.fx.${n}`); t.ok(ART.fx.ms[n] > 0, `ART.fx.ms.${n}`); });
  t.ok(ART.tk.opt && ART.tk.opt.reduceMotion === false && ART.tk.opt.quality === 'high', 'ART.tk.opt defaults');
});
t.test('placeholders never throw and leave the canvas clean', () => {
  clean();
  const ctx = newCtx();
  ART.hero.draw(ctx, 'hanae', { x: 100, y: 200 });
  ART.card.draw(ctx, 'hanae_slash', 170, 116); ART.card.draw(ctx, { id: 'nope' }, 100, 70); ART.card.motif(ctx, 'slash', 50, 50, 40, 'rose', 0);
  ART.icon.draw(ctx, 'status', 'might', 20, 20, 24, { n: 3 }); ART.icon.draw(ctx, 'gem', 'slot:red', 20, 20, 24);
  ['title', 'ch1', 'boss3', 'victory', 'paper', 'unknown'].forEach((s) => ART.scene.draw(ctx, s, 1280, 720, 1.2, {}));
  ART.scene.logo(ctx, 640, 200, 500, 0);
  ['fog', 'painted', 'target', 'nope'].forEach((k) => ART.map.hex(ctx, k, 100, 100, 46, { tile: 'enemy', seed: 3, done: true, t: 1 }));
  ART.map.paintBloom(ctx, 100, 100, 46, 0.5); ART.map.token(ctx, ['hanae', 'kuro'], 100, 100, 0, true);
  L.fx.forEach((n) => [0, 0.5, 1].forEach((p) => ART.fx[n](ctx, { x: 200, y: 200, x2: 400, y2: 300, seed: 1, text: 'ZAN!', w: 100, h: 60 }, p)));
  t.eq(issues(), '', 'no canvas issues from placeholders');
});
t.test('ART.has is true only for declared real art', () => {
  t.ok(ART.has('hero', 'hanae') && ART.has('hero', 'raiga'), 'heroes are real art');
  t.ok(!ART.has('hero', 'nobody'), 'unknown hero');
  t.ok(!ART.has('motif', 'slash'), 'a motif nobody declared is not real');
  ART.declare('motif', ['slash']);
  t.ok(ART.has('motif', 'slash'), 'declare marks it real');
});
t.test('ART.sheet registers, refuses duplicates and bad input', () => {
  ['toolkit', 'heroes', 'hero_lineup', 'portraits', 'hero_anim'].forEach((n) => t.eq(typeof ART.sheets[n], 'function', `sheet ${n}`));
  t.throws(() => ART.sheet('toolkit', () => {}), 'duplicate sheet name', /duplicate/);
  t.throws(() => ART.sheet('', () => {}), 'empty name');
  t.throws(() => ART.sheet('x_no_fn', 5), 'not a function');
  const fn = () => {};
  t.eq(ART.sheet('art_core_test_sheet', fn), fn, 'returns fn');
  t.eq(ART.sheets.art_core_test_sheet, fn, 'registered on ART.sheets');
});

// ------------------------------------------------------------------ palette and colour helpers
t.test('the palette mirrors the ART_BIBLE tokens exactly', () => {
  const want = { ink: '#140f2e', night: '#0d0b1e', indigo: '#1a1340', violet: '#3b2a7a', dusk: '#5b3fa8', paper: '#f3e6c8', paper2: '#e6d3a3', sumi: '#241a3a', gold: '#f5c96a', gold2: '#ffe9a8', vermilion: '#e8383d', sakura: '#ff7eb6', sakura2: '#ffc2dc', jade: '#3fd6b0', azure: '#5fb4ff', cyan: '#5ff5ff', amber: '#ff9a2e', bloodmoon: '#b0245c', ash: '#8a86a8', white: '#fff8f0' };
  Object.keys(want).forEach((k) => t.eq(ART.tk.pal[k], want[k], `pal.${k}`));
  // the Hocus Vocus skin keys (HV_ART_AUDIO 9.1) are new: every old key above keeps its value, these are only added
  const skin = { hvPink: '#ff7eb6', hvPinkD: '#c93f78', hvPinkL: '#ffc9de', hvGreen: '#3fcf6a', hvGreenD: '#1f7a3a', hvLime: '#c6ff3d', hvViolet: '#a77bff', hvOrange: '#ff9a2e', hvTeal: '#2ec4b6', hvCream: '#fff4e6', hvLine: '#2d170f', gloss: '#f4f1fb', glossLilac: '#e6d9ff', glossMint: '#d9fff4', glossBlush: '#ffe3f1' };
  Object.keys(skin).forEach((k) => t.eq(ART.tk.pal[k], skin[k], `pal.${k} (new skin key)`));
  t.ok(/^#[0-9a-f]{6}$/.test(ART.tk.pal.vox), 'pal.vox is a colour (the light tint of the Vox orb)');
  // and the mirror is real: css/base.css defines every skin token with the same value (the CSS names are --hv-pink-d for hvPinkD, --gloss-lilac for glossLilac)
  const css = fs.readFileSync(new URL('../hocus_vocus/css/base.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  Object.keys(skin).forEach((k) => {
    const name = '--' + k.replace(/([A-Z])/g, (m) => '-' + m.toLowerCase());
    const m = new RegExp(name.replace(/-/g, '\\-') + '\\s*:\\s*(#[0-9a-fA-F]{6})').exec(css);
    t.ok(m && m[1].toLowerCase() === skin[k], `${name} in css/base.css equals pal.${k} (${m ? m[1] : 'missing'})`);
  });
  t.ok(/--vox\s*:\s*url\("data:image\/svg\+xml,/.test(css), '--vox is an inline SVG in css/base.css');
  L.palettes.forEach((p) => { const f = ART.tk.fam(p); t.ok(f && f.base && f.light && f.dark && f.glow, `family ${p}`); t.ok(f !== ART.tk.fam('ash') || p === 'ash', `family ${p} is its own`); });
  t.eq(ART.tk.fam('no_such'), ART.tk.fam('ash'), 'unknown family falls back to ash');
});
t.test('colour helpers are memoised and pure', () => {
  const tk = ART.tk;
  t.eq(tk.shade('#ff7eb6'), tk.shade('#ff7eb6'), 'shade is stable');
  t.eq(tk.shade('#ff7eb6'), U.color.shadow('#ff7eb6'), 'shade is the house cel shadow');
  t.ok(/^rgba\(/.test(tk.rgba('#ff7eb6', 0.5)), 'rgba format');
  t.eq(tk.rgba('#ffffff', 5), tk.rgba('#ffffff', 1), 'alpha clamps high');
  t.eq(tk.rgba('#ffffff', NaN), tk.rgba('#ffffff', 0), 'NaN alpha becomes 0');
  t.ok(/^#[0-9a-f]{6}$/.test(tk.tint('#336699')), 'tint is a hex');
});

// ------------------------------------------------------------------ seeded helpers
t.test('seeded helpers are deterministic and spread out', () => {
  const tk = ART.tk;
  t.eq(tk.vary('id', 'a'), tk.vary('id', 'a'), 'vary is stable');
  t.ok(tk.vary('id', 'a') !== tk.vary('id', 'b'), 'vary differs per salt');
  const xs = []; for (let i = 0; i < 200; i++) xs.push(tk.vary(7, 'k' + i));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  t.ok(xs.every((v) => v >= 0 && v < 1), 'vary is in 0..1');
  t.near(mean, 0.5, 0.08, 'vary is not clustered (near uniform mean)');
  t.ok(Math.max(...xs) - Math.min(...xs) > 0.9, 'vary covers the range');
  t.eq(tk.rng('a', 1)(), tk.rng('a', 1)(), 'rng streams repeat');
  t.ok(tk.rng('a', 1)() !== tk.rng('a', 2)(), 'rng streams differ per seed');
  t.eq(tk.pick('h', ['x', 'y', 'z'], 's'), tk.pick('h', ['x', 'y', 'z'], 's'), 'pick is stable');
  t.eq(tk.noise1(3.3, 4), tk.noise1(3.3, 4), 'noise is pure');
});
t.test('easing, tracks and pose blending', () => {
  const tk = ART.tk;
  ['linear', 'outBack', 'outElastic', 'snap', 'inOutSine', 'outCubic'].forEach((n) => { t.near(tk.ease[n](0), 0, 1e-9, `${n}(0)`); t.near(tk.ease[n](1), 1, 1e-9, `${n}(1)`); });
  t.ok(tk.ease.snap(0.15) < 0, 'snap anticipates below zero');
  t.near(tk.track([[0, 0], [1, 10]], 0.5, 'linear'), 5, 1e-9, 'track midpoint');
  t.eq(tk.track([[0, 3], [1, 9]], -5), 3, 'track holds the start');
  t.eq(tk.track([[0, 3], [1, 9]], 5), 9, 'track holds the end');
  const b = tk.blendPose({ a: 0, s: 'x' }, { a: 10, s: 'y', z: 4 }, 0.5);
  t.eq(b.a, 5, 'blendPose numbers'); t.eq(b.z, 2, 'blendPose missing key counts as 0'); t.eq(b.s, 'y', 'blendPose strings step at the midpoint');
  const p = tk.poseTrack([[0, { v: 0 }], [1, { v: 8 }]], 0.25, 'linear');
  t.near(p.v, 2, 1e-9, 'poseTrack');
  t.ok(tk.spring(0.3, 14, 6) > 0 && tk.spring(0, 14, 6) === 0, 'spring starts at 0');
});
t.test('geometry helpers', () => {
  const tk = ART.tk;
  const c = tk.circlePts(0, 0, 10, 8);
  t.eq(c.length, 8, 'circlePts count');
  t.ok(c.every((p) => Math.abs(Math.hypot(p[0], p[1]) - 10) < 1e-9), 'circlePts radius');
  const moved = tk.xf(c, { dx: 5, dy: -3 });
  t.near(moved[0][0], c[0][0] + 5, 1e-9, 'xf translates'); t.eq(c[0][0], 10, 'xf does not mutate its input');
  t.eq(tk.mirrorPts([[3, 1, 1]], 0)[0][2], 1, 'mirrorPts keeps corner flags');
  const bx = tk.bbox([[1, 2], [5, -4], [3, 9]]);
  t.deep(bx, [1, -4, 5, 9], 'bbox');
  const flat = tk.flatten([[0, 0], [10, 0], [10, 10]], { step: 2 });
  t.ok(flat.length > 12 && flat.length % 2 === 0, 'flatten subdivides');
  t.deep([flat[0], flat[1]], [0, 0], 'flatten starts at the first point');
  t.deep([flat[flat.length - 2], flat[flat.length - 1]], [10, 10], 'flatten ends at the last point');
  const bent = tk.bendPts([[0, 0], [0, 10], [0, 20]], { ang: 0.5 });
  t.eq(bent[0][0], 0, 'bendPts keeps the root'); t.ok(bent[2][0] !== 0, 'bendPts swings the tip');
  const half = tk.lerpPts([[0, 0], [10, 0]], [[0, 10], [10, 10]], 0.5);
  t.deep(half, [[0, 5], [10, 5]], 'lerpPts');
});

// ------------------------------------------------------------------ toolkit drawing: determinism and cleanliness
t.test('inkPath is deterministic per seed and varies with seed, taper and width', () => {
  const pts = [[10, 10], [60, 30], [120, 12], [170, 40]];
  const a = call((c) => ART.tk.inkPath(c, pts, { w: 5, seed: 3 }));
  const b = call((c) => ART.tk.inkPath(c, pts, { w: 5, seed: 3 }));
  const d = call((c) => ART.tk.inkPath(c, pts, { w: 5, seed: 4 }));
  const e = call((c) => ART.tk.inkPath(c, pts, { w: 9, seed: 3 }));
  t.eq(a, b, 'same seed, same drawing');
  t.ok(a !== d, 'a different seed wobbles differently');
  t.ok(a !== e, 'a different width draws differently');
  t.ok(a.indexOf('fill(') >= 0, 'the stroke is a filled polygon');
  const still = call((c) => ART.tk.inkPath(c, pts, { w: 5, seed: 3 }));
  t.eq(a, still, 'a line without t never moves');
  const boil1 = call((c) => ART.tk.inkPath(c, pts, { w: 5, seed: 3, t: 1 })), boil2 = call((c) => ART.tk.inkPath(c, pts, { w: 5, seed: 3, t: 2 }));
  t.ok(boil1 !== boil2, 'a line given t boils');
});
t.test('every toolkit drawing function runs clean on the strict stub', () => {
  clean();
  const c = newCtx(), tk = ART.tk;
  const shape = [[20, 20], [80, 14], [110, 60], [70, 100], [24, 70]];
  tk.inkStroke(c, 0, 0, 50, 50, { bend: 6 }); tk.inkCurve(c, 0, 0, 30, 60, 90, 10); tk.inkBlot(c, 40, 40, 12, { drips: 3 }); tk.inkBleed(c, shape, {});
  tk.inkPath(c, shape, { closed: true, w: 4 }); tk.inkPath(c, { poly: shape }, { closed: true }); tk.inkPath(c, (g) => { g.moveTo(0, 0); g.lineTo(10, 10); }, {});
  tk.celFill(c, shape, '#ff7eb6', { rim: '#ffffff', halftone: true }); tk.celFill(c, shape, '#5b8bff', { shadowShape: [[30, 40], [100, 40], [100, 100], [30, 100]], line: false });
  tk.celFill(c, (g) => { g.rect(0, 0, 20, 20); }, '#aaaaaa', { bbox: [0, 0, 20, 20] }); tk.celCircle(c, 50, 50, 20, '#ff9a2e'); tk.celEllipse(c, 50, 50, 30, 10, '#3fd6b0', { shadow: false });
  tk.ribbon(c, [[10, 0], [20, 40], [12, 90]], '#ff7eb6', { wMax: 14, sway: { amp: 0.3 }, t: 1.2, tipColor: '#ffffff', cap: 'round' }); tk.hairLock(c, [[0, 0], [10, 50]], '#a9c4ff', { wMax: 12 }); tk.gloss(c, [[0, 0], [10, 30], [4, 60]], { w: 4 });
  tk.halftone(c, 0, 0, 80, 60, { d: 6, force: true }); tk.halftoneRamp(c, 0, 0, 80, 60, { dir: 0.4 });
  tk.glow(c, 50, 50, 30, '#5ff5ff', 0.8); tk.glow(c, 50, 50, 30, 'notahex', 0.8); tk.glow(c, 50, 50, -3, '#ffffff');
  tk.sparkle(c, 30, 30, 10, { rot: 1 }); tk.sparkle(c, 30, 30, 0); tk.kirakira(c, 0, 0, 100, 80, 1.5, { n: 12 }); tk.speedLines(c, 50, 50, { n: 12 }); tk.speedLines(c, 50, 50, { mode: 'dir', angle: 0.3 });
  ['neutral', 'happy', 'closed', 'angry', 'determined', 'hurt', 'sad', 'wide', 'half', 'sleepy', 'smirk', 'bogus'].forEach((e) => { tk.eye(c, 40, 40, 26, 34, { expr: e, side: e.length % 2 ? 1 : -1 }); tk.eye(c, 40, 40, 26, 34, { expr: e, open: 0.3, glow: 0.5 }); });
  tk.eye(c, 40, 40, 0, -4, {});
  ['smile', 'smirk', 'flat', 'frown', 'open', 'grin', 'shout', 'grit', 'cat', 'tiny', 'bogus'].forEach((k) => tk.mouth(c, 40, 60, 20, k));
  tk.brow(c, 30, 20, 20, { tilt: 0.5 }); tk.blush(c, 30, 60, 16); tk.nose(c, 40, 50, 40);
  tk.paperGrain(c, 0, 0, 200, 100, { alpha: 0.4 }); tk.vignette(c, 300, 200, {}); tk.vignette(c, 300, 200, { hard: true });
  Object.keys(tk.skies).forEach((k) => tk.sky(c, 0, 0, 200, 100, k)); tk.sky(c, 0, 0, 200, 100, [[0, '#000000'], [1, '#ffffff']], { key: 'test' }); tk.sky(c, 0, 0, 200, 100, 'nope');
  tk.mist(c, 0, 0, 200, 100, 2, { seed: 1 }); tk.stars(c, 0, 0, 200, 100, 3, { n: 20 }); tk.moon(c, 50, 50, 20, { phase: 0.4 });
  tk.inkText(c, 'ZAN!', 100, 50, 30, { shadow: '#e8383d', grad: ['#ffffff', '#ffd889'] }); tk.inkText(c, 'x', 0, 0, -5, {});
  ART.placeholder(c, 'label', 0, 0, 40, 30); ART.placeholder(c, undefined, 0, 0, -1, 0, { round: true });
  t.eq(issues(), '', 'no canvas issues from any toolkit function');
});
t.test('bad numbers never reach the canvas', () => {
  clean();
  const c = newCtx(), tk = ART.tk;
  tk.inkPath(c, [[NaN, 0], [Infinity, 4], [5, 5]], { w: NaN });
  tk.glow(c, NaN, 0, 10, '#ffffff', NaN); tk.sparkle(c, 0, 0, NaN); tk.eye(c, NaN, NaN, NaN, NaN, {});
  ART.hero.draw(c, 'hanae', { x: NaN, y: NaN, s: NaN, t: NaN, pt: NaN, alpha: NaN });
  ART.hero.portrait(c, 'kuro', { x: NaN, w: NaN, h: NaN, t: NaN });
  t.eq(issues(), '', 'NaN and Infinity inputs are absorbed: ' + issues());
});
t.test('celFill draws the base, one shadow and the outline in a fixed order', () => {
  const log = call((c) => ART.tk.celFill(c, [[0, 0], [40, 0], [40, 40], [0, 40]], '#ff7eb6', {}));
  const iBase = log.indexOf('=fillStyle:#ff7eb6'), iShadow = log.indexOf('=fillStyle:' + ART.tk.shade('#ff7eb6'));
  t.ok(iBase >= 0 && iShadow > iBase, 'base fill before the shadow fill');
  t.ok(log.lastIndexOf('fill(evenodd)') > iShadow, 'the outline (an evenodd loop pair) comes last');
  t.ok(log.indexOf('clip(evenodd)') > 0, 'the shadow is a boolean clip');
});
t.test('ART.tk.chain slices a spine into slabs and draws them', () => {
  const ch = ART.tk.chain('test|chain', { spine: [[0, 0], [0, 40], [0, 80], [0, 120]], cuts: [0.33, 0.66], reach: 20, draw: (g) => { g.fillStyle = '#ff0000'; g.fillRect(-10, 0, 20, 120); } });
  t.eq(ch.segs.length, 3, 'two cuts make three slabs');
  t.eq(ch.joints.length, 2, 'two joints');
  const r = recorder();
  ch.draw(r.ctx, [0, 0.3, 0.2], 1);
  t.eq(r.log.filter((l) => l.indexOf('drawImage(') === 0).length, 3, 'one drawImage per slab');
  t.eq(ch.warm(1), 3, 'warm bakes every slab');
  const r2 = recorder(); ch.draw(r2.ctx, null, 2);
  t.eq(r2.log.filter((l) => l.indexOf('drawImage(') === 0).length, 3, 'null bends are the rest pose');
  t.eq(issues(), '', 'chain is clean');
});

t.test('small shared shapes: petal, bolt, gradients, withAlpha and flipX', () => {
  clean();
  const c = newCtx(), tk = ART.tk;
  tk.petal(c, 30, 30, 10, 0.6, 0.8); tk.petal(c, 30, 30, 10, 0.6, 0.8, '#ffffff'); tk.petal(c, 30, 30, 0, 0, 1); tk.petal(c, 30, 30, 9, NaN, 0);
  tk.bolt(c, 0, 0, 100, 80, { seed: 3 }); tk.bolt(c, 5, 5, 5, 5, {}); tk.bolt(c, 0, 0, 40, 10, { n: 1, w: -3, jag: NaN, color: '#ff0000', core: '#ffffff' }); tk.bolt(c, 0, 0, 40, 10);
  t.eq(call((g) => tk.bolt(g, 0, 0, 100, 80, { seed: 3 })), call((g) => tk.bolt(g, 0, 0, 100, 80, { seed: 3 })), 'a bolt is deterministic per seed');
  t.ok(call((g) => tk.bolt(g, 0, 0, 100, 80, { seed: 3 })) !== call((g) => tk.bolt(g, 0, 0, 100, 80, { seed: 4 })), 'a different seed jags differently');
  const g1 = tk.lin(c, 0, 0, 10, 10, [[0, '#000000'], [2, '#ffffff'], [-1, '#ff0000']]), g2 = tk.rad(c, 5, 5, -2, 5, 5, 20, [[0, '#ffffff'], [1, '#000000']]);
  t.ok(g1 && g1._kind === 'linear' && g2 && g2._kind === 'radial', 'lin and rad return gradients (offsets clamp, negative radius clamps)');
  const al = recorder(); c.globalAlpha = 1;
  al.ctx.globalAlpha = 0.5; tk.withAlpha(al.ctx, 0.5, (g) => { g.fillRect(0, 0, 4, 4); });
  t.ok(al.log.some((l) => l === '=globalAlpha:0.250'), 'withAlpha multiplies the alpha');
  t.eq(al.real.globalAlpha, 0.5, 'withAlpha restores the alpha');
  const fl = recorder(); tk.flipX(fl.ctx, 50, (g) => { g.fillRect(0, 0, 10, 10); });
  t.deep(fl.log.filter((l) => /^(save|restore|scale)/.test(l)), ['save()', 'scale(-1.000,1.000)', 'restore()'], 'flipX mirrors inside a save/restore pair');
  t.eq(issues(), '', 'small shapes are clean');
});
t.test('celFill options: hi, tension, decor, tipColor and the rim sides', () => {
  clean();
  const c = newCtx(), tk = ART.tk;
  const sq = [[0, 0], [60, 0], [60, 60], [0, 60]];
  const plain = call((g) => tk.celFill(g, sq, '#5b8bff', {})), lit = call((g) => tk.celFill(g, sq, '#5b8bff', { hi: true })), col = call((g) => tk.celFill(g, sq, '#5b8bff', { hi: '#ffffff', hiW: 4, hiAlpha: 0.5 }));
  t.ok(lit !== plain && col !== lit, 'hi adds a highlight edge and takes a colour');
  const t1 = call((g) => tk.celFill(g, sq, '#5b8bff', { tension: 1 })), t3 = call((g) => tk.celFill(g, sq, '#5b8bff', { tension: 0.2 }));
  t.ok(t1 !== t3, 'tension changes the outline smoothing');
  let hits = 0;
  const dec = call((g) => tk.celFill(g, sq, '#5b8bff', { decor: (gg) => { hits++; gg.fillRect(0, 0, 10, 10); } }));
  t.eq(hits, 1, 'decor runs once');
  t.ok(dec.indexOf('fillRect(0.000,0.000,10.000,10.000)') > dec.indexOf('=fillStyle:#5b8bff') && dec.indexOf('fillRect(0.000,0.000,10.000,10.000)') < dec.lastIndexOf('fill(evenodd)'), 'decor is drawn after the base and before the outline');
  ['shadow', 'light', 1.3].forEach((side) => tk.celFill(c, sq, '#ff7eb6', { rim: '#ffffff', rimSide: side, rimAlpha: 0.7, rimW: 3 }));
  const rb = [[0, 0], [10, 60], [4, 120]];
  const a = call((g) => tk.ribbon(g, rb, '#ff7eb6', { wMax: 12, tipColor: '#ffffff' })), b = call((g) => tk.ribbon(g, rb, '#ff7eb6', { wMax: 12 }));
  t.ok(a !== b && a.indexOf('=fillStyle:#ffffff') >= 0, 'tipColor dips the end of a ribbon');
  tk.ribbon(c, rb, '#ff7eb6', { wMax: 12, tipColor: '#ffffff', tipFrac: 0.6, tipShadow: '#8888aa', t: 3, sway: { amp: 0.4 } });
  t.eq(issues(), '', 'celFill and ribbon options are clean');
});
t.test('hero extras: keyPt, ids, expressions and the portrait developer sheet', () => {
  t.deep(ART.hero.ids().slice().sort(), L.heroIds.slice().sort(), 'hero ids are the four heroes');
  t.deep(ART.hero.expressions(), ['neutral', 'smile', 'angry', 'hurt', 'determined'], 'the five portrait expressions');
  ['idle', 'attack', 'cast', 'hurt', 'block', 'down', 'cheer', 'walk'].forEach((p) => {
    const k = ART.hero.keyPt(p);
    t.ok(Number.isFinite(k) && k >= 0 && k <= ART.hero.poseMs(p) / 1000 + 1e-9, `keyPt(${p}) sits inside the pose`);
  });
  t.ok(ART.hero.keyPt('attack') > 0 && ART.hero.keyPt('attack') < ART.hero.poseMs('attack') / 1000, 'attack freezes mid swing');
  t.eq(ART.hero.keyPt('nonsense'), 0, 'an unknown pose gives 0');
  clean();
  const canvas = doc.createElement('canvas');
  ['neutral', 'smile', 'angry', 'hurt', 'determined', 'zzz'].forEach((expr) => ART.sheets.hero_dev(canvas, { w: 700, h: 500, hero: 'suzu', mode: 'portrait', expr }));
  t.eq(issues(), '', 'hero_dev portrait mode is clean for every expression');
});

// ------------------------------------------------------------------ sprite cache
t.test('ART.sprite memoises by key and honours ART.res', () => {
  ART.sprite.clear();
  let n = 0;
  const a = ART.sprite('t|a', 20, 10, () => { n++; });
  const b = ART.sprite('t|a', 20, 10, () => { n++; });
  t.ok(a === b && n === 1, 'the second request is a cache hit');
  t.eq(a.width, 20 * ART.res, 'canvas width is w * res'); t.eq(a.height, 10 * ART.res, 'canvas height is h * res');
  const old = ART.res; ART.res = 2;
  const c = ART.sprite('t|a', 20, 10, () => { n++; });
  t.ok(c !== a && c.width === 40 && n === 2, 'a new res rebuilds');
  ART.res = old;
  t.ok(ART.sprite.has('t|a'), 'has()');
  const st = ART.sprite.stats();
  t.ok(st.hits >= 1 && st.misses >= 2 && st.count >= 2, 'stats count hits, misses and entries');
  ART.sprite.clear();
  t.eq(ART.sprite.stats().count, 0, 'clear empties the cache'); t.ok(!ART.sprite.has('t|a'), 'has() after clear');
  const tiny = ART.sprite('t|tiny', 0, -3, () => {});
  t.ok(tiny.width >= 1 && tiny.height >= 1, 'a degenerate size still makes a drawable canvas');
  api._resetCounts();
  newCtx().drawImage(tiny, 0, 0, 1, 1);
  t.eq(issues(), '', 'the tiny sprite is drawable');
  ART.sprite.clear();
});
t.test('ART.sprite evicts by count and by pixels, least recently used first', () => {
  ART.sprite.clear();
  const oldCount = ART.sprite.maxCount, oldPx = ART.sprite.maxPixels;
  ART.sprite.maxCount = 3;
  ['a', 'b', 'c'].forEach((k) => ART.sprite('lru|' + k, 4, 4, () => {}));
  ART.sprite('lru|a', 4, 4, () => {});                        // touch a: b is now the oldest
  ART.sprite('lru|d', 4, 4, () => {});
  t.ok(ART.sprite.has('lru|a') && ART.sprite.has('lru|c') && ART.sprite.has('lru|d'), 'recent entries stay');
  t.ok(!ART.sprite.has('lru|b'), 'the least recently used entry is evicted');
  ART.sprite.maxCount = oldCount;
  ART.sprite.maxPixels = 1000;
  ART.sprite('lru|big', 100, 100, () => {});
  t.ok(ART.sprite.stats().count <= 2, 'a pixel budget evicts older sprites');
  ART.sprite.maxPixels = oldPx;
  ART.sprite.drop('lru|');
  t.eq(ART.sprite.stats().count, 0, 'drop by prefix');
  ART.sprite.clear();
});
t.test('ART.sprite draws into its canvas with the context pre-scaled', () => {
  ART.sprite.clear();
  let seen = null;
  ART.sprite('t|scale', 30, 20, (g, w, h) => { seen = [w, h, g.getTransform().a]; });
  t.deep(seen.slice(0, 2), [30, 20], 'drawFn paints in w x h');
  t.near(seen[2], ART.res, 1e-9, 'the context is scaled by res');
  ART.sprite.clear();
});

// ------------------------------------------------------------------ heroes: every hero x pose x t
const HEROES = L.heroIds, POSES = L.poses, TS = [0, 0.37, 1.9, 12.345];
const dur = (p) => ART.hero.poseMs(p) / 1000;
t.test('poseMs matches DESIGN 5.6', () => {
  const want = { idle: 0, walk: 0, attack: 420, cast: 500, hurt: 260, block: 300, down: 500, cheer: 800 };
  Object.keys(want).forEach((p) => t.eq(ART.hero.poseMs(p), want[p], `poseMs(${p})`));
  t.eq(ART.hero.poseMs('bogus'), 0, 'unknown pose is 0');
});
t.test('every hero x pose x t draws, issues draw calls and stays clean', () => {
  let drawn = 0;
  HEROES.forEach((id) => POSES.forEach((pose) => TS.forEach((tt) => [0, dur(pose) * 0.5, dur(pose), dur(pose) + 3].forEach((pt) => {
    clean();
    const ctx = newCtx();
    let threw = null;
    try { ART.hero.draw(ctx, id, { x: 300, y: 500, s: 1, pose, t: tt, pt }); } catch (e) { threw = e; }
    t.ok(!threw, `${id} ${pose} t=${tt} pt=${pt} does not throw ${threw ? threw.message : ''}`);
    // the cast draws live paths (HV_ART_AUDIO 2.12: the Echowake heroes blitted 12+ part sprites; a chibi figure fills and strokes its shapes)
    const paths = (api._counts.fill || 0) + (api._counts.stroke || 0), blits = api._counts.drawImage || 0;
    t.ok(paths >= 40 || blits >= 1, `${id} ${pose} issues real paths or blits a cached frame (${paths} paths, ${blits} blits)`);
    if (api._issues.length) t.ok(false, `${id} ${pose} t=${tt} pt=${pt} canvas issues: ${issues()}`);
    drawn++;
  }))));
  t.eq(drawn, HEROES.length * POSES.length * TS.length * 4, 'covered every combination');
});
t.test('hero draw is deterministic, balanced and alive', () => {
  HEROES.forEach((id) => {
    const a = call((c) => ART.hero.draw(c, id, { x: 100, y: 300, s: 1, pose: 'idle', t: 2.5 }));
    const b = call((c) => ART.hero.draw(c, id, { x: 100, y: 300, s: 1, pose: 'idle', t: 2.5 }));
    t.eq(a, b, `${id} idle is a pure function of (t)`);
    const later = call((c) => ART.hero.draw(c, id, { x: 100, y: 300, s: 1, pose: 'idle', t: 2.9 }));
    t.ok(a !== later, `${id} idle animates over time`);
    const atk = call((c) => ART.hero.draw(c, id, { x: 100, y: 300, s: 1, pose: 'attack', t: 2.5, pt: 0.15 }));
    t.ok(atk !== a, `${id} attack differs from idle`);
    const held1 = call((c) => ART.hero.draw(c, id, { x: 100, y: 300, s: 1, pose: 'down', t: 2.5, pt: 2 })), held2 = call((c) => ART.hero.draw(c, id, { x: 100, y: 300, s: 1, pose: 'down', t: 2.5, pt: 9 }));
    t.eq(held1, held2, `${id} one-shot poses hold their end pose for any larger pt`);
    const r = recorder();
    ART.hero.draw(r.ctx, id, { x: 100, y: 300, s: 1, pose: 'cast', t: 1, pt: 0.3, glow: 1 });
    const saves = r.log.filter((l) => l === 'save()').length, restores = r.log.filter((l) => l === 'restore()').length;
    t.eq(saves, restores, `${id} save and restore balance`);
    t.eq(r.real._depth, 0, `${id} leaves the context stack empty`);
  });
});
t.test('hero draw options: flip, alpha, glow, scale, shadow', () => {
  clean();
  const ctx = newCtx();
  HEROES.forEach((id) => {
    ART.hero.draw(ctx, id, { x: 200, y: 400, s: 2.5, flip: true, alpha: 0.5, glow: 1, pose: 'cast', t: 1, pt: 0.2 });
    ART.hero.draw(ctx, id, { x: 200, y: 400, s: 0.3, glow: '#ff0000', shadow: false });
    ART.hero.draw(ctx, id, { x: 200, y: 400, pose: 'not_a_pose' });
    ART.hero.draw(ctx, id);
    ART.hero.draw(ctx, id, { s: -2, t: -5, pt: -1 });
  });
  t.eq(issues(), '', 'options are clean');
  const a = call((c) => ART.hero.draw(c, 'hanae', { x: 100, y: 300, t: 1 })), f = call((c) => ART.hero.draw(c, 'hanae', { x: 100, y: 300, t: 1, flip: true }));
  t.ok(a !== f && /scale\(-(\d+\.\d+),\1\)/.test(f), 'flip mirrors with a negative x scale (the cast scales by s * CAST_K, so any scale(-a,a))');
  const half = call((c) => ART.hero.draw(c, 'hanae', { x: 100, y: 300, t: 1, alpha: 0.4 }));
  t.ok(half.indexOf('=globalAlpha:0.400') >= 0, 'alpha is applied');
  const noSh = call((c) => ART.hero.draw(c, 'hanae', { x: 100, y: 300, t: 1, shadow: false }));
  t.ok(noSh.split('\n').length < a.split('\n').length, 'shadow:false skips the ground smear');
});
t.test('reduceMotion calms breathing and hair', () => {
  const on = call((c) => ART.hero.draw(c, 'suzu', { x: 0, y: 0, pose: 'idle', t: 1.7 }));
  ART.tk.opt = { reduceMotion: true, quality: 'high' };
  const r1 = call((c) => ART.hero.draw(c, 'suzu', { x: 0, y: 0, pose: 'idle', t: 1.7 })), r2 = call((c) => ART.hero.draw(c, 'suzu', { x: 0, y: 0, pose: 'idle', t: 2.9 }));
  ART.tk.opt = { reduceMotion: false, quality: 'high' };
  t.ok(on !== r1, 'reduceMotion changes the drawing');
  const drift = (x, y) => { const A = x.split('\n'), B = y.split('\n'); let d = 0; for (let i = 0; i < Math.min(A.length, B.length); i++) if (A[i] !== B[i]) d++; return d; };
  const full = drift(call((c) => ART.hero.draw(c, 'suzu', { pose: 'idle', t: 1.7 })), call((c) => ART.hero.draw(c, 'suzu', { pose: 'idle', t: 2.9 })));
  t.ok(drift(r1, r2) <= full, 'less of the drawing moves between two times');
});
t.test('unknown hero ids draw a labelled placeholder', () => {
  clean();
  const log = call((c) => { ART.hero.draw(c, 'nobody', { x: 100, y: 200 }); ART.hero.portrait(c, 'nobody', { x: 0, y: 0, w: 60, h: 80, expr: 'smile' }); ART.hero.medallion(c, 'nobody', 40, 40, 20); });
  t.ok(log.indexOf('fillText(nobody') >= 0, 'the placeholder says the id');
  t.eq(issues(), '', 'placeholder is clean');
});
t.test('hero bounds are sane', () => {
  HEROES.forEach((id) => {
    const b = ART.hero.bounds(id);
    t.ok(b.w > 60 && b.w < 260, `${id} width`); t.ok(b.h >= 240 && b.h <= 260, `${id} height is the nominal 250`);
    t.ok(b.head.y < b.hand.y && b.hand.y < b.feet.y + 1, `${id} head above hand above feet (y up is negative)`);
    t.ok(b.head.y < -150 && b.head.y > -250, `${id} head height`);
    t.ok(Math.abs(b.head.x) < b.w / 2 && Math.abs(b.hand.x) < b.w, `${id} anchors inside the box`);
    t.deep(b.feet, { x: 0, y: 0 }, `${id} feet at the origin`);
    t.ok(b.weapon && Number.isFinite(b.weapon.x) && Number.isFinite(b.weapon.y), `${id} weapon anchor`);
    b.w = 1; t.ok(ART.hero.bounds(id).w > 1, `${id} bounds returns a copy`);
  });
  const d = ART.hero.bounds('nobody');
  t.ok(d.w > 0 && d.h > 0, 'unknown id has default bounds');
});
t.test('hero anchors follow the pose, the scale and the flip', () => {
  HEROES.forEach((id) => {
    const rest = ART.hero.pointAt(id, 'tip', { x: 100, y: 500, s: 1, pose: 'idle', t: 0 });
    t.ok(Number.isFinite(rest.x) && Number.isFinite(rest.y), `${id} tip is finite`);
    const flipped = ART.hero.pointAt(id, 'tip', { x: 100, y: 500, s: 1, pose: 'idle', t: 0, flip: true });
    t.near(flipped.x - 100, -(rest.x - 100), 1e-6, `${id} flip mirrors the anchor about the origin x`); t.near(flipped.y, rest.y, 1e-6, `${id} flip keeps y`);
    const big = ART.hero.pointAt(id, 'tip', { x: 100, y: 500, s: 2, pose: 'idle', t: 0 });
    t.near((big.x - 100) / 2, rest.x - 100, 1e-6, `${id} anchors scale with s`);
    const strike = ART.hero.pointAt(id, 'tip', { x: 100, y: 500, s: 1, pose: 'attack', t: 0, pt: 0.16 });
    t.ok(Math.hypot(strike.x - rest.x, strike.y - rest.y) > 20, `${id} the tip moves in an attack`);
    const head = ART.hero.pointAt(id, 'head', { x: 100, y: 500, s: 1 });
    t.ok(head.y < 500 - 150 && head.y > 500 - 250, `${id} head anchor height`);
    const feet = ART.hero.pointAt(id, 'feet', { x: 100, y: 500, s: 1 });
    t.near(feet.y, 500, 8, `${id} feet anchor is on the ground`);
  });
  const dflt = ART.hero.pointAt('nobody', 'tip', { x: 5, y: 6 });
  t.deep(dflt, { x: 5, y: 6 }, 'unknown hero anchors at the origin');
});
t.test('hero.warm pre-bakes sprites and the audit finds no clipped part', () => {
  ART.sprite.clear();
  HEROES.forEach((id) => { t.ok(ART.hero.warm(id, 1) >= 12, `${id} warm bakes 12 or more frames`); });
  const cnt = ART.sprite.stats().count;
  clean();
  HEROES.forEach((id) => ART.hero.draw(newCtx(), id, { x: 100, y: 300, s: 1, pose: 'idle', t: 0.5 }));
  t.ok(ART.sprite.stats().count - cnt <= HEROES.length * 12, 'after warm the first frame bakes little more');
  HEROES.forEach((id) => t.deep(ART.hero.audit(id), [], `${id} no pose of either outfit is clipped by the bake box`));
});
t.test('sprite sets stay bounded as scale changes', () => {
  ART.sprite.clear();
  const ctx = newCtx();
  for (let s = 0.3; s <= 2.4; s += 0.05) ART.hero.draw(ctx, 'hanae', { x: 0, y: 0, s, pose: 'idle', t: 0 });
  t.ok(ART.sprite.stats().count < 400, 'raster scale is quantised, not per s');
  ART.sprite.clear();
});

// ------------------------------------------------------------------ portraits and medallions
t.test('portraits: every hero, five expressions, several ratios', () => {
  const exprs = L.expressions;
  t.deep(ART.hero.expressions(), exprs, 'ART.hero.expressions equals LISTS.expressions');
  HEROES.forEach((id) => exprs.forEach((expr) => [[150, 200], [300, 400], [200, 200], [90, 300], [40, 40], [600, 300]].forEach(([w, h]) => {
    clean();
    const ctx = newCtx();
    let threw = null;
    try { ART.hero.portrait(ctx, id, { x: 10, y: 20, w, h, expr, t: 1.3 }); } catch (e) { threw = e; }
    t.ok(!threw, `${id} ${expr} ${w}x${h} does not throw ${threw ? threw.message : ''}`);
    t.ok((api._counts.drawImage || 0) >= 3, `${id} ${expr} ${w}x${h} draws sprites`);
    t.eq(issues(), '', `${id} ${expr} ${w}x${h} clean`);
  })));
  HEROES.forEach((id) => {
    const a = call((c) => ART.hero.portrait(c, id, { x: 0, y: 0, w: 150, h: 200, expr: 'angry', t: 1 })), b = call((c) => ART.hero.portrait(c, id, { x: 0, y: 0, w: 150, h: 200, expr: 'angry', t: 1 }));
    t.eq(a, b, `${id} portrait is deterministic`);
    t.ok(a !== call((c) => ART.hero.portrait(c, id, { x: 0, y: 0, w: 150, h: 200, expr: 'smile', t: 1 })), `${id} expressions differ`);
    t.ok(a !== call((c) => ART.hero.portrait(c, id, { x: 0, y: 0, w: 150, h: 200, expr: 'angry', t: 1.8 })), `${id} portraits breathe over time`);
    t.eq(call((c) => ART.hero.portrait(c, id, { x: 0, y: 0, w: 150, h: 200, expr: 'no_such', t: 1 })), call((c) => ART.hero.portrait(c, id, { x: 0, y: 0, w: 150, h: 200, expr: 'neutral', t: 1 })), `${id} an unknown expression is neutral`);
  });
  const r = recorder();
  ART.hero.portrait(r.ctx, 'hanae', { x: 10, y: 20, w: 60, h: 300, expr: 'neutral' });
  t.ok(r.log.some((l) => l.indexOf('clip(') === 0), 'a portrait is clipped to its rectangle (cover and crop)');
  t.eq(r.real._depth, 0, 'portrait balances save and restore');
});
t.test('medallions: round icons cached per radius', () => {
  clean();
  const ctx = newCtx();
  HEROES.forEach((id) => [8, 18, 24, 44, 80].forEach((r) => ART.hero.medallion(ctx, id, 100, 100, r)));
  ART.hero.medallion(ctx, 'hanae', 0, 0, 0); ART.hero.medallion(ctx, 'hanae', NaN, NaN, NaN);
  t.eq(issues(), '', 'medallions are clean');
  const before = ART.sprite.stats().misses;
  ART.hero.medallion(ctx, 'hanae', 5, 5, 24); ART.hero.medallion(ctx, 'hanae', 5, 5, 24);
  t.eq(ART.sprite.stats().misses, before, 'a repeat medallion is a cache hit');
});

// ------------------------------------------------------------------ enemy registry (art.js owns the shell)
t.test('enemy registry: register, bounds, tier scale, placeholder', () => {
  const id = 'kappa';
  const before = ART.enemy.bounds(id);
  t.ok(before.w > 0 && before.h > 0, 'unregistered roster id has size-based bounds');
  t.eq(before.h, L.sizeHeight.m, 'medium enemies are 170 px tall');
  const elite = ART.enemy.bounds('oni_brute');
  t.near(elite.h, L.sizeHeight.l * 1.08, 1e-6, 'elite height includes the 1.08 tier scale');
  t.ok(ART.enemy.bounds('boss_kuzunoha').h >= L.sizeHeight.xl, 'boss is xl');
  t.ok(ART.enemy.bounds('not_an_enemy').h > 0, 'unknown id has default bounds');
  clean();
  const ctx = newCtx();
  ART.enemy.draw(ctx, id, { x: 500, y: 520 }); ART.enemy.draw(ctx, 'not_an_enemy', { x: 500, y: 520, flip: true, pose: 'die', pt: 0.3 });
  t.eq(issues(), '', 'placeholder enemies are clean');
  t.ok(!ART.has('enemy', id), 'not real yet');
  let got = null;
  ART.enemy.register(id, { draw(g, o) { got = o; g.fillRect(-20, -100, 40, 100); }, bounds: { w: 90, h: 120, head: { x: 0, y: -110 }, body: { x: 0, y: -60 }, feet: { x: 0, y: 0 } } });
  t.ok(ART.has('enemy', id), 'registered enemies are real');
  t.eq(ART.enemy.bounds(id).w, 90, 'registered bounds win');
  ART.enemy.draw(ctx, id, { x: 500, y: 520, s: 1.5, pose: 'attack', t: 2, pt: 0.1, hpPct: 0.4, phase: 1, flip: true });
  t.ok(got && got.pose === 'attack' && got.hpPct === 0.4 && got.phase === 1 && got.s === 1.5 && got.pt === 0.1, 'the entry receives pose, hpPct, phase and s');
  const e2 = call((c) => ART.enemy.draw(c, 'oni_brute', { x: 100, y: 100, t: 1 })), m2 = call((c) => ART.enemy.draw(c, 'kappa', { x: 100, y: 100, t: 1 }));
  t.ok(e2 !== m2, 'elites and normals draw differently');
  const boss = call((c) => ART.enemy.draw(c, 'boss_kuzunoha', { x: 100, y: 100, t: 1 }));
  t.ok(boss.indexOf('drawImage(') >= 0, 'bosses get an aura sprite');
  t.throws(() => ART.enemy.register('x', {}), 'register needs a draw function');
  t.eq(ART.enemy.poseMs('die'), 700, 'enemy poseMs die');
  t.eq(ART.enemy.poseMs('telegraph'), 0, 'telegraph holds');
  t.eq(issues(), '', 'clean');
});

// ------------------------------------------------------------------ gallery sheets
t.test('sheetGrid lays out labelled cells inside the canvas', () => {
  clean();
  const canvas = doc.createElement('canvas');
  const seen = [];
  const lay = ART.sheetGrid(canvas, { w: 800, h: 600 }, ['a', { label: 'b' }, 'c', 'd', 'e'], (g, cell, w, h, i, info) => { seen.push([i, w, h, info.col, info.row]); g.fillRect(0, 0, w, h); }, { title: 'x' });
  t.eq(seen.length, 5, 'every cell drawn');
  t.ok(lay.cols >= 1 && lay.rows * lay.cols >= 5, 'the grid holds every cell');
  t.ok(lay.rects.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= 800 + 1e-6 && r.y + r.h <= 600 + 1e-6), 'rects stay inside the canvas');
  t.ok(seen.every((s) => s[1] > 20 && s[2] > 20), 'cells have a drawable size');
  const fixed = ART.sheetGrid(canvas, { w: 800, h: 600 }, ['1', '2', '3', '4'], () => {}, { cols: 2 });
  t.eq(fixed.cols, 2, 'opts.cols is honoured'); t.eq(fixed.rows, 2, 'rows follow');
  const thrower = ART.sheetGrid(canvas, { w: 400, h: 300 }, ['boom'], () => { throw new Error('cell failure'); }, {});
  t.eq(thrower.rects.length, 1, 'a throwing cell is contained and reported in the cell');
  t.ok(api._console.error.some((line) => /sheetGrid cell 0/.test(String(line))), 'the failure is logged');
  t.eq(issues(), '', 'sheetGrid is clean');
});
t.test('every registered sheet draws without throwing at several sizes and times', () => {
  ['toolkit', 'heroes', 'hero_lineup', 'portraits', 'hero_anim', 'hero_dev'].forEach((name) => [[1600, 900, 0], [800, 450, 1.7], [400, 300, 9.3]].forEach(([w, h, tt]) => {
    clean();
    const canvas = doc.createElement('canvas');
    canvas.width = w; canvas.height = h;
    let threw = null;
    try { ART.sheets[name](canvas, { w, h, t: tt, scale: 1, dpr: 1, res: 1 }); } catch (e) { threw = e; }
    t.ok(!threw, `${name} ${w}x${h} t=${tt} does not throw ${threw ? threw.message : ''}`);
    t.eq(issues(), '', `${name} ${w}x${h} clean`);
  }));
  ['hero_dev'].forEach((name) => ['all', 'kuro', 'raiga,suzu'].forEach((hero) => { const canvas = doc.createElement('canvas'); ART.sheets[name](canvas, { w: 900, h: 500, hero, pose: 'attack', mode: hero === 'kuro' ? 'portrait' : undefined, expr: 'hurt', zoom: 1.5 }); }));
  const c2 = doc.createElement('canvas');
  ART.sheets.hero_anim(c2, { w: 1200, h: 400, hero: 'raiga', pose: 'cast' });
  t.eq(issues(), '', 'hero_anim options are clean');
});

// ------------------------------------------------------------------ performance smoke
t.test('performance smoke: a hero draw costs a small fraction of a frame', () => {
  ART.sprite.clear();
  const ctx = newCtx();
  const miss0 = ART.sprite.stats().misses;
  HEROES.forEach((id) => ART.hero.warm(id, 1));
  const N = 120, t0 = Date.now();
  let n = 0;
  for (let i = 0; i < N; i++) HEROES.forEach((id) => { ART.hero.draw(ctx, id, { x: 300, y: 500, s: 1, pose: i % 3 ? 'idle' : 'attack', t: i * 0.016, pt: (i % 26) * 0.016 }); n++; });
  const wall = Date.now() - t0;
  const per = wall / n;
  // The Echowake heroes blitted cached part sprites (about 0.2 ms on a real canvas, limit 8 ms here). The chibi cast draws live paths
  // (HV_ART_AUDIO 2.8: budget 1.2 ms a figure in a browser, about 0.7 to 0.9 ms on the cast_perf sheet); this stub validates every call, so
  // one figure costs about 3 to 4 ms here alone and up to about 9 ms under the four-way parallel runner. The limit still catches a runaway.
  t.ok(per < 16, `average hero draw ${per.toFixed(2)} ms on the checking stub (limit 16 ms; the cast_perf sheet holds the real 1.2 ms budget)`);
  const st = ART.sprite.stats();
  t.ok(st.misses - miss0 < 700, `sprite misses stay bounded (${st.misses - miss0})`);
  const before = st.misses;
  for (let i = 0; i < 30; i++) HEROES.forEach((id) => ART.hero.draw(ctx, id, { x: 300, y: 500, s: 1, pose: 'idle', t: 50 + i * 0.016 }));
  t.ok(ART.sprite.stats().misses - before <= 4, 'steady state bakes nothing');
});

t.done();

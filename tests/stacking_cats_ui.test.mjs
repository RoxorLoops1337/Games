// Stacking Cats: headless smoke test for the art and the page wiring (no browser needed).
// A recording fake canvas lets every cat, mouse, nest and backdrop run its drawing code.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

const calls = { n: 0 };
function fakeCtx() {
  const grad = { addColorStop() {} };
  const target = { canvas: null };
  return new Proxy(target, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      return (...a) => { calls.n++; return undefined; };
    },
    set(o, k, v) { o[k] = v; return true; },
  });
}
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx() }) };
globalThis.Path2D = class { constructor() { return new Proxy(this, { get: (o, k) => (k in o ? o[k] : () => {}) }); } };

const { CATS, ENEMY_TYPES, THEMES, NESTS } = await import('../stacking_cats/cats.js');
const { drawCat } = await import('../stacking_cats/art_cats.js');
const art = await import('../stacking_cats/art_world.js');
// a stand in for the Web Audio API that accepts every call, so the sound code can run headless
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
const node = () => ({ connect() {}, start() {}, stop() {}, frequency: param(), gain: param(), Q: param(), type: '', buffer: null });
class FakeAudio {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = {}; this.calls = 0; }
  resume() {}
  createGain() { this.calls++; return node(); } createOscillator() { this.calls++; return node(); } createBiquadFilter() { this.calls++; return node(); } createBufferSource() { this.calls++; return node(); }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
}
globalThis.window = { AudioContext: FakeAudio };
globalThis.document.hidden = false;
const { Sfx } = await import('../stacking_cats/audio.js');
const { drawBuilding } = await import('../stacking_cats/art_kingdom.js');
const { BUILDINGS, WONDERS, emptyKingdom } = await import('../stacking_cats/cats.js');
const scene = await import('../stacking_cats/kingdom_scene.js');

const postMod = await import('../stacking_cats/post.js');
t('lighting and post stack runs and ambient colours resolve for every theme', () => {
  const ctx = fakeCtx(); ctx.canvas = { width: 960, height: 540 };
  ctx.createImageData = () => ({ data: new Uint8ClampedArray(128 * 128 * 4) });
  const orig = globalThis.document.createElement;
  globalThis.document.createElement = () => { const c = { width: 0, height: 0 }; const x = fakeCtx(); x.createImageData = ctx.createImageData; c.getContext = () => x; return c; };
  const post = postMod.createPost(960, 540);
  post.light(ctx, "rgb(200,200,220)", [{ x: 100, y: 100, r: 80, col: "#ffcc66", a: 0.8 }], [{ x: 50, y: 50, rx: 40, ry: 10, a: 0.2 }], ["rgba(0,0,255,.2)", "rgba(255,0,0,.1)", 0.5]);
  post.bloom(ctx, { width: 960, height: 540 }, 0.3); post.grade(ctx, 'rgba(0,0,255,.2)', 'rgba(255,0,0,.1)', 0.5);
  post.grain(ctx, 1.2, 0.05); post.flare(ctx, 740, 120, 0.1);
  globalThis.document.createElement = orig;
  for (const th of THEMES) for (const boss of [false, true]) assert.ok(postMod.ambientFor(th, 2, 5, boss, boss));
});

const icons = await import('../stacking_cats/art_icons.js');
t('every drawn icon runs, and every emoji the game shows has one', () => {
  for (const k of icons.ICON_KEYS) assert.ok(icons.iconCanvas(k), k);
  const seen = new Set();
  const rx = /[\u2600-\u27BF\u2B50\u23F3\u2728\u2764\u{1F000}-\u{1FFFF}]\uFE0F?/gu;
  for (const f of ['cats.js', 'main.js', 'index.html', 'kingdom_scene.js']) {
    let src = readFileSync(new URL('../stacking_cats/' + f, import.meta.url), 'utf8');
    src = src.replace(/&#(x?[0-9a-fA-F]+);/g, (m, d) => String.fromCodePoint(d[0] === 'x' ? parseInt(d.slice(1), 16) : +d)).replace(/\\u([0-9a-fA-F]{4})\\u([0-9a-fA-F]{4})/g, (m, a, b) => String.fromCharCode(parseInt(a, 16), parseInt(b, 16)));
    for (const m of src.matchAll(rx)) seen.add(m[0].replace(/\uFE0F/g, ''));
  }
  const missing = [...seen].filter((e) => !icons.hasIcon(e));
  assert.deepEqual(missing, [], 'emoji without a drawn icon: ' + missing.join(' '));
});

t('every cat draws without errors', () => {
  for (const d of CATS) for (const v of ['open', 'blink', 'hurt', 'happy']) drawCat(fakeCtx(), d, v);
  assert.ok(calls.n > 1000);
});

t('every mouse type, elite and nest draws', () => {
  for (const type of Object.keys(ENEMY_TYPES)) for (const elite of [false, true]) { const s = art.enemySprite(type, elite); assert.ok(s.c && s.w > 0); }
  for (const nest of NESTS) { const s = art.nestSprite(nest.id); assert.ok(s.c); art.nestOverlay(fakeCtx(), 0.3, 1.2); }
});

t('sound: every effect, every cat voice and every music track runs without errors', () => {
  const sfx = new Sfx();
  sfx.play('coin');                       // before unlock: must be a silent no-op
  sfx.unlock();
  for (const name of ['coin', 'chest', 'equip', 'upgrade', 'reroll', 'hover', 'achieve', 'synergy', 'route', 'swipe', 'hit', 'shoot', 'bang', 'flame', 'zap', 'boom', 'pop', 'ko', 'heal', 'ui', 'pick', 'merge', 'wave', 'boss', 'clear', 'win', 'over', 'zoom', 'roar', 'nope', 'special', 'shield']) sfx.play(name, 1.3);
  for (const c of CATS) for (const kind of ['pick', 'happy', 'sad']) { sfx.last.meow = 0; sfx.meow(c.id, kind); }
  for (const mode of ['calm', 'fight', 'boss']) {
    sfx.music(mode);
    for (let i = 0; i < 16 * 8; i++) { sfx.ctx.currentTime += 0.12; sfx.pump(); }
    sfx.setIntensity(0.9);
  }
  clearInterval(sfx.timer);
  sfx.setVolumes(0.3, 0.2);
  assert.ok(sfx.ctx.calls > 500, 'the sequencer scheduled notes: ' + sfx.ctx.calls);
});

t('every kingdom building draws at every level', () => {
  for (const b of BUILDINGS) for (let l = 0; l <= b.max; l++) drawBuilding(fakeCtx(), b.id, l);
});

t('kingdom scene draws, and taps land on the right building or wonder', () => {
  const k = emptyKingdom(); k.coins = 5000; k.lv = { dojo: 2, tent: 1 }; k.wonders = { paw: true };
  scene.drawKingdom(fakeCtx(), { kingdom: k, selected: { type: 'building', id: 'dojo' }, bumps: { dojo: 0 } }, 0.3);
  scene.drawKingdom(fakeCtx(), { kingdom: k, selected: { type: 'wonder', id: 'bench' }, bumps: {} }, 5);
  assert.deepEqual(scene.hitTest(92, 120), { type: 'building', id: 'dojo' });
  assert.deepEqual(scene.hitTest(562, 190), { type: 'building', id: 'tent' });
  assert.deepEqual(scene.hitTest(110, 46), { type: 'wonder', id: WONDERS[0].id });
  assert.equal(scene.hitTest(5, 5), null);
  for (const b of BUILDINGS) { assert.ok(scene.hitTest(...({ dojo: [92, 130], beds: [282, 130], yarn: [472, 130], spa: [662, 130], tower: [836, 130], shrine: [182, 200], vault: [372, 200], tent: [562, 200], stall: [752, 200] })[b.id]), b.id); }
});

t('every theme builds a backdrop and scrolls', () => {
  THEMES.forEach((th, i) => { const bd = art.makeBackdrop(th, i); art.drawBackdrop(fakeCtx(), bd, 123.4, 2); art.drawRays(fakeCtx(), bd, 1); art.drawFront(fakeCtx(), bd, 55); art.freeBackdrop(bd); });
  art.resetWorldArt(); art.freeBackdrop(null);
});

t('main.js parses and the ids it uses exist in index.html', () => {
  execFileSync(process.execPath, ['--check', 'stacking_cats/main.js']);
  const js = readFileSync('stacking_cats/main.js', 'utf8'), html = readFileSync('stacking_cats/index.html', 'utf8');
  const ids = new Set([...js.matchAll(/\$\('([A-Za-z]+)'\)/g)].map((m) => m[1]));
  assert.ok(ids.size >= 10);
  const dynamic = new Set(['earn', 'boardBody', 'dailyMsg', 'dailyBox', 'kscene', 'kdetail']); // created by the game over screen
  for (const id of ids) assert.ok(dynamic.has(id) || html.includes(`id="${id}"`), 'index.html misses #' + id);
  assert.ok(html.includes('type="module" src="main.js"'));
});

t('auto special moves: a Settings toggle, an A key and the default off are all wired', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/autoSpecial: false/.test(js), 'default must be off');
  assert.ok(js.includes("tog('autoSpecial'"), 'Settings toggle missing');
  assert.ok(js.includes("k === 'a'") && js.includes('save.opt.autoSpecial = !save.opt.autoSpecial'), 'A key missing');
});

t('tutorial tips are held back while the game is paused', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const m = js.match(/function coach\([^)]*\) \{\n([^\n]*)\n/);
  assert.ok(m, 'coach() not found');
  assert.ok(/\bpaused\b/.test(m[1]), 'coach() must return early while paused');
});

t('no em dashes anywhere in the game files', () => {
  for (const f of ['main.js', 'index.html', 'cats.js', 'sim.js', 'art_cats.js', 'art_world.js', 'art_kingdom.js', 'audio.js', 'kingdom_scene.js', 'savecode.js', 'daily.js', 'post.js', 'art_icons.js', 'share.js', 'haptics.js', 'pwa.js', 'sw.js', 'manifest.webmanifest']) {
    assert.ok(!readFileSync('stacking_cats/' + f, 'utf8').includes('—'), f);
  }
});

t('the game is registered for the build and the change map', () => {
  assert.ok(readFileSync('build.js', 'utf8').includes("'stacking_cats'"));
  assert.ok(readFileSync('tools/check-changed.mjs', 'utf8').includes('stacking_cats'));
  assert.ok(readFileSync('index.html', 'utf8').includes('/stacking_cats/'));
});

console.log(`${n} tests passed`);

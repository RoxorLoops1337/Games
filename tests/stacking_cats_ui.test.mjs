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

const { CATS, ENEMY_TYPES, THEMES, NESTS, ITEMS } = await import('../stacking_cats/cats.js');
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

t('cat art keeps its fine detail layers (tapered tail, toes, ear fur, whisker pairs) for every breed and mood', () => {
  const count = (d, v) => { const before = calls.n; drawCat(fakeCtx(), d, v); return calls.n - before; };
  for (const d of CATS) {
    const open = count(d, 'open');
    assert.ok(open > 260, d.id + ' draws only ' + open + ' calls: detail layers missing');
    assert.ok(count(d, 'happy') > 200 && count(d, 'hurt') > 200 && count(d, 'blink') > 200, d.id + ' expression states');
  }
});

t('costume accessories (hats, capes, wings, weapons) carry gradient, rim light and stitch detail and stay cached cheap', () => {
  const withGrad = (d) => { let g = 0, o = 0; const c = fakeCtx(); const p = new Proxy(c, { get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? (...a) => { g++; return t[k](...a); } : k === 'setLineDash' ? (...a) => { o++; } : t[k]), set: (t, k, v) => { t[k] = v; return true; } }); drawCat(p, d, 'open'); return { g, o }; };
  const dressed = ['buckshot', 'yuki', 'hawkeye', 'boomer', 'biscuit', 'pearl', 'pudding', 'shadow', 'ronin', 'merlin', 'cutlass', 'dusty', 'mecha', 'hexa', 'nori', 'leo', 'nebula', 'nibbles', 'blizzard', 'halo', 'draco', 'lyra'];
  for (const id of dressed) {
    const d = CATS.find((x) => x.id === id), r = withGrad(d);
    assert.ok(r.g >= 1, id + ' accessory has no gradient material');
  }
  for (const id of ['buckshot', 'hawkeye', 'boomer', 'dusty', 'shadow', 'nori', 'pudding']) assert.ok(withGrad(CATS.find((x) => x.id === id)).o >= 1, id + ' lost its stitched seam');
  for (const d of CATS) { const c0 = calls.n; drawCat(fakeCtx(), d, 'open'); assert.ok(calls.n - c0 < 4000, d.id + ' draw cost grew past the cached sprite budget'); }
  assert.ok(!readFileSync(new URL('../stacking_cats/art_cats.js', import.meta.url), 'utf8').includes('\u2014'), 'no em dashes in art_cats.js');
});

t('held weapons and props carry material detail (wood grain, metal bands, collars, steam) within the draw budget', () => {
  const src = readFileSync(new URL('../stacking_cats/art_cats.js', import.meta.url), 'utf8');
  for (const fn of ['grain', 'band', 'collar', 'steam', 'shine']) assert.ok(new RegExp('function ' + fn + '\\(').test(src), fn + ' helper missing');
  const uses = (id, h) => { const i = src.indexOf('\n  ' + id + ': {'); const seg = src.slice(i, src.indexOf('\n  },', i)); return seg.includes(h + '(ctx'); };
  for (const [id, h] of [['buckshot', 'grain'], ['buckshot', 'band'], ['hawkeye', 'grain'], ['hawkeye', 'band'], ['gizmo', 'band'], ['merlin', 'collar'], ['hexa', 'collar'], ['biscuit', 'steam']]) assert.ok(uses(id, h), id + ' lost its ' + h + ' detail');
  for (const id of ['buckshot', 'hawkeye', 'dusty', 'cyber', 'gizmo', 'merlin', 'hexa', 'blizzard', 'halo', 'biscuit', 'nori']) { const c0 = calls.n; drawCat(fakeCtx(), CATS.find((x) => x.id === id), 'open'); assert.ok(calls.n - c0 < 4000, id + ' over budget'); }
});

t('every mouse type, elite and nest draws', () => {
  for (const type of Object.keys(ENEMY_TYPES)) for (const elite of [false, true]) { const s = art.enemySprite(type, elite); assert.ok(s.c && s.w > 0); }
  for (const nest of NESTS) { const s = art.nestSprite(nest.id); assert.ok(s.c); art.nestOverlay(fakeCtx(), 0.3, 1.2); }
});

t('elites carry cape, shoulder plate and jewelled crown, and nest cracks and door glow grow with damage', () => {
  const draws = (f) => { const c0 = calls.n; f(); return calls.n - c0; };
  for (const nest of NESTS) {
    const hurt = draws(() => art.nestOverlay(fakeCtx(), 0.1, 1.2)), fresh = draws(() => art.nestOverlay(fakeCtx(), 1, 1.2));
    assert.ok(hurt > fresh, nest.id + ': more cracks when hurt');
    assert.ok(art.nestSprite(nest.id) === art.nestSprite(nest.id), 'nest sprite cached');
  }
  const src = readFileSync(new URL('../stacking_cats/art_world.js', import.meta.url), 'utf8');
  assert.ok(src.includes('eliteCape') && src.includes('eliteCrown') && src.includes('nestDetail'));
  for (const type of Object.keys(ENEMY_TYPES)) assert.ok(art.enemySprite(type, true) === art.enemySprite(type, true), 'elite sprite cached');
});

t('sound: every effect, every cat voice and every music track runs without errors', () => {
  const sfx = new Sfx();
  sfx.play('coin');                       // before unlock: must be a silent no-op
  sfx.unlock();
  for (const name of ['coin', 'chest', 'equip', 'upgrade', 'reroll', 'hover', 'achieve', 'synergy', 'route', 'swipe', 'hit', 'shoot', 'bang', 'flame', 'zap', 'boom', 'pop', 'ko', 'heal', 'ui', 'pick', 'merge', 'wave', 'boss', 'clear', 'win', 'over', 'zoom', 'roar', 'nope', 'special', 'shield', 'heart']) sfx.play(name, 1.3);
  for (const c of CATS) for (const kind of ['pick', 'happy', 'sad', 'cheer', 'worried']) { sfx.last.meow = 0; sfx.meow(c.id, kind); }
  for (const mode of ['calm', 'fight', 'boss']) {
    sfx.music(mode);
    for (let i = 0; i < 16 * 8; i++) { sfx.ctx.currentTime += 0.12; sfx.pump(); }
    sfx.setIntensity(0.9);
  }
  clearInterval(sfx.timer);
  sfx.setVolumes(0.3, 0.2);
  assert.ok(sfx.ctx.calls > 500, 'the sequencer scheduled notes: ' + sfx.ctx.calls);
});

t('Cat meows can be switched off: the voices go quiet but other sounds keep playing', () => {
  const sfx = new Sfx(); sfx.unlock();
  sfx.meowsOn = false; sfx.ctx.currentTime += 1;
  const before = sfx.ctx.calls; sfx.meow('tabby', 'pick');
  assert.equal(sfx.ctx.calls, before, 'a muted meow schedules nothing');
  sfx.play('coin'); assert.ok(sfx.ctx.calls > before, 'effects still play');
  sfx.meowsOn = true; sfx.ctx.currentTime += 1; const mid = sfx.ctx.calls; sfx.meow('tabby', 'pick');
  assert.ok(sfx.ctx.calls > mid, 'meows are back when switched on');
  const js = readFileSync(new URL('../stacking_cats/main.js', import.meta.url), 'utf8');
  assert.ok(/tog\('meows'/.test(js), 'Settings has a Cat meows toggle');
  assert.ok(/sfx\.meowsOn = o\.meows !== false/.test(js), 'applyOptions passes the setting to the audio');
  assert.ok(/DEFAULT_OPT = \{[^}]*meows: true/.test(js), 'on by default');
});

t('every kingdom building draws at every level', () => {
  for (const b of BUILDINGS) for (let l = 0; l <= b.max; l++) drawBuilding(fakeCtx(), b.id, l);
});

t('the Kingdom scene is a cached painted world: day and night, growth props, cats, no em dashes', () => {
  const k = emptyKingdom(); k.coins = 100; k.wonders = { paw: true };
  const draw = (night, lv) => { k.lv = {}; for (const b of BUILDINGS) k.lv[b.id] = lv; scene.drawKingdom(fakeCtx(), { kingdom: k, selected: null, bumps: {}, night }, 3.7); };
  for (const night of [false, true]) for (const lv of [0, 2, 3, 4, 5]) draw(night, lv);
  assert.equal(typeof scene.freeKingdomArt, 'function', 'the scene can release its cached layers');
  let made = 0; const old = globalThis.document.createElement;
  globalThis.document.createElement = (...a) => { made++; return old(...a); };
  draw(true, 5); draw(true, 5);
  assert.equal(made, 0, 'a second frame builds no new canvases: the world is cached');
  globalThis.document.createElement = old;
  scene.freeKingdomArt(); draw(false, 1);
  const dash = String.fromCharCode(0x2014);
  for (const f of ['kingdom_scene.js', 'art_kingdom.js']) assert.ok(!readFileSync(new URL('../stacking_cats/' + f, import.meta.url), 'utf8').includes(dash), f + ' has no em dash');
  const js = readFileSync(new URL('../stacking_cats/kingdom_scene.js', import.meta.url), 'utf8');
  assert.ok(js.includes('WALKERS') && js.includes('LANTERNS') && js.includes('cloudSprite'), 'cats, lanterns and clouds are part of the scene');
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
  assert.ok(js.includes("k === 'a'") && js.includes('setAutoSpecial(!save.opt.autoSpecial)'), 'A key missing');
  assert.ok(js.includes("className = 'autob'"), 'tappable AUTO button missing (phones have no keyboard)');
});

t('the x2 speed choice is saved and a new run starts at that speed', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/fast: false/.test(js), 'default must be normal speed');
  assert.ok(js.includes('save.opt.fast = speed === 2'), 'toggling speed must be saved');
  assert.ok(js.includes('speed = save.opt.fast ? 2 : 1'), 'a new run must start at the saved speed');
  assert.ok(js.includes("$('bSpeed').textContent = 'x' + speed"), 'the speed button must show the starting speed');
});

t('number keys pick the nth card on pick screens and the cards show their number', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const css = readFileSync('stacking_cats/index.html', 'utf8');
  assert.ok(js.includes("document.body.classList.contains('scr') && k >= '1' && k <= '9'"), 'digit keys must be routed to the open screen');
  assert.ok(js.includes(".cards > .card[data-act]"), 'digit keys must target the cards of the open screen');
  assert.ok(/counter\(cn\)/.test(css), 'cards must show their number for keyboard players');
});

t('each wave shows an incoming strip with the mouse types and counts it brings', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(js.includes('for (const q of g.queue) {') && js.includes('inc.set(q.type, o)'), 'the strip must count the wave queue by type');
  assert.ok(js.includes('if (q.elite) o.el++'), 'the strip must count elites so it can crown them');
  assert.ok(js.includes('drawIncoming();'), 'the strip must be drawn in the frame');
  assert.ok(/function drawIncoming\(\)[\s\S]*mode !== 'play'/.test(js), 'the strip must only show while playing');
});

t('Enter presses the main button of an open screen but never steals a focused control', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(js.includes("k === 'enter' && document.body.classList.contains('scr')"), 'Enter must only act while a screen is open');
  assert.ok(js.includes('INPUT|TEXTAREA|SELECT|BUTTON|A'), 'Enter must leave inputs and focused buttons alone');
  assert.ok(js.includes(".btn.big:not([disabled]), .btn.green:not([disabled])"), 'Enter must target the main button');
});

t('Escape backs out of sub screens through their Back button', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(js.includes("k === 'escape' && document.body.classList.contains('scr')"), 'Escape must act only while a screen is open');
  assert.ok(js.includes('[data-act="back"]:not([disabled])'), 'Escape must press the screen\'s Back button');
  assert.ok(js.includes("k === 'p' || k === 'escape'"), 'Escape must still pause and resume during a run');
});

t('arrow keys move focus through the cards of a pick screen', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(js.includes("k === 'arrowleft' || k === 'arrowright'"), 'arrow keys must be handled');
  assert.ok(js.includes("cards.indexOf(document.activeElement)"), 'focus must move relative to the focused card');
  assert.ok(/\.card:focus-visible/.test(readFileSync('stacking_cats/index.html', 'utf8')), 'a focused card must be visibly marked');
});

t('the Kingdom can be browsed with the arrow keys and only while its scene is on screen', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(js.includes('kNav = (step) =>'), 'the Kingdom must register a keyboard walker');
  assert.ok(js.includes("if (kNav && kScene && $('kscene')"), 'arrows must only drive the Kingdom while its canvas exists');
  assert.ok(/\.\.\.WONDERS\.map/.test(js), 'the walk must include the wonders');
});

t('the Kingdom canvas has a text description and its detail panel is announced to screen readers', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(js.includes('id="kscene" width="1840" height="512" role="img" aria-label="Your cat village'), 'the village canvas needs an accessible name');
  assert.ok(js.includes('id="kdetail" aria-live="polite"'), 'the detail panel must be a polite live region');
});

t('the wave banner and the toasts are live regions so screen readers announce wave starts, clears and tips', () => {
  const html = readFileSync('stacking_cats/index.html', 'utf8');
  assert.ok(/id="banner" role="status" aria-live="polite"/.test(html), 'the banner must be announced');
  assert.ok(/id="toasts" role="status" aria-live="polite"/.test(html), 'toasts must be announced');
});

t('the fight HUD pills have accessible names', () => {
  const html = readFileSync('stacking_cats/index.html', 'utf8');
  for (const id of ['waveBox', 'coinBox', 'chestBox', 'bossBar']) assert.ok(new RegExp(`id="${id}" role="group" aria-label="`).test(html), `${id} needs a name`);
  assert.ok(!/id="zoom"[^>]*aria-label=/.test(html), 'the Zoomies button must keep its own text (with the percentage) as its name');
});

t('tutorial tips are held back while the game is paused', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const m = js.match(/function coach\([^)]*\) \{\n([^\n]*)\n/);
  assert.ok(m, 'coach() not found');
  assert.ok(/\bpaused\b/.test(m[1]), 'coach() must return early while paused');
});

t('no em dashes anywhere in the game files', () => {
  for (const f of ['main.js', 'index.html', 'cats.js', 'sim.js', 'art_cats.js', 'art_world.js', 'art_kingdom.js', 'audio.js', 'kingdom_scene.js', 'savecode.js', 'daily.js', 'post.js', 'art_icons.js', 'share.js', 'haptics.js', 'pwa.js', 'sw.js', 'manifest.webmanifest']) {
    assert.ok(!readFileSync('stacking_cats/' + f, 'utf8').includes('\u2014'), f);
  }
});

t('the game is registered for the build and the change map', () => {
  assert.ok(readFileSync('build.js', 'utf8').includes("'stacking_cats'"));
  assert.ok(readFileSync('tools/check-changed.mjs', 'utf8').includes('stacking_cats'));
  assert.ok(readFileSync('index.html', 'utf8').includes('/stacking_cats/'));
});

t('a coach bubble clears the toasts it would cover', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/function coach\([\s\S]*?\$\('toasts'\)\.replaceChildren\(\)/.test(js), 'showing a tip must clear the toast stack so the two never overlap');
});

t('mouse health bars follow the colourblind palette like the cat bars do', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/e\.elite \? '#ffd23f' : save\.opt\.colorblind \? '#ff8a2a' : '#ff7a8a'/.test(js), 'the mouse hp bar must switch to orange in colourblind mode');
});

t('the low health edge has a heartbeat that quickens as health drops', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8'), au = readFileSync('stacking_cats/audio.js', 'utf8');
  assert.ok(au.includes("case 'heart':"), 'audio.js must define the heartbeat effect');
  assert.ok(/sfx\.play\('heart'/.test(js), 'the frame must play the heartbeat while the danger edge shows');
});

t('the first-run title hint mentions Enter for keyboard players', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(js.includes("coarse ? 'Tap Play to begin' : 'Click Play or press Enter to begin'"), 'mouse and keyboard players must see the Enter shortcut, touch players keep the tap hint');
});

t('opening the pause menu clears the toasts so they do not smear behind the blur', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/function showPause\(\)[\s\S]*?\$\('toasts'\)\.replaceChildren\(\)/.test(js), 'showPause must clear the toast stack');
});

t('the Kingdom hint mentions arrow keys and Enter for keyboard players', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(js.includes("coarse ? '' : ' Arrow keys move between them and Enter buys.'"), 'mouse and keyboard players must be told about the keys, touch players keep the short hint');
});

t('a wave 1 coach tip is dismissed when the wave clears so it never covers the banner', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/function onClear\(\)[\s\S]*?coachEl\.dataset\.key === 'c2'\) hideCoach\(\)/.test(js), 'onClear must hide the c2 tip');
});

t('meows: a voice with two vowel formants and a breath, cheers on a clear, a worried mew on low health', () => {
  const sfx = new Sfx(); sfx.unlock(); sfx.ctx.currentTime = 5;
  const before = sfx.ctx.calls; sfx.last.meow = 0; sfx.meow('tabby', 'pick');
  assert.ok(sfx.ctx.calls - before >= 9, 'a meow needs a source, two formant filters, a breath of noise and their gains (' + (sfx.ctx.calls - before) + ' nodes)');
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/mode === 'celebrate'\) \{[^}]*sfx\.meow\(c\.id, 'cheer'/.test(js), 'cats meow when the wave is cleared');
  assert.ok(js.includes("sfx.meow(lowCat.id, 'worried'"), 'a cat that drops below a third of its health gives a worried mew');
});

t('tapping a cat that is not charged gives it a happy meow and a bounce instead of nothing', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/if \(S\.specialReady\(c\)\) doSpecial\(c\.uid\); else \{[^}]*sfx\.meow\(c\.id, 'happy'\)[^}]*moods\.set\(c\.uid/.test(js), 'a tap on an uncharged cat must answer');
});

t('every sound effect the game plays actually makes a sound (nope used to be silent)', () => {
  const sfx = new Sfx(); sfx.unlock(); sfx.ctx.currentTime = 5;
  const names = new Set(); const re = /sfx\.play\('([a-z]+)'/g; let m;
  for (const f of ['stacking_cats/main.js']) { const js = readFileSync(f, 'utf8'); while ((m = re.exec(js))) names.add(m[1]); }
  assert.ok(names.has('nope') && names.size > 20, 'found the effect names used by the game');
  for (const nm of names) {
    const before = sfx.ctx.calls; sfx.last = {}; sfx.play(nm);
    assert.ok(sfx.ctx.calls > before, `sfx.play('${nm}') must create at least one audio node`);
  }
});

t('tapping a cat in the title tower makes it meow', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/mode !== 'title'[\s\S]{0,600}sfx\.meow\(titleStack\[/.test(js), 'a tap on the title tower must meow that cat');
  assert.ok(js.includes('function stagePoint(e)'), 'the quarter-turn aware tap position is shared by the field and the title');
});

t('a merge makes the cat meow right after the chime (a louder cheer at max level)', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/case 'merge': \{[\s\S]{0,400}sfx\.meow\(mc\.id, max \? 'cheer' : 'happy', 0\.1\)/.test(js), 'the merge event must meow the merged cat');
});

t('buying a Kingdom building or wonder gets a cheer meow from a village cat', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const n = (js.match(/sfx\.play\('upgrade'\); sfx\.meow\(villageCat\(\), 'cheer', 0\.12\)/g) || []).length;
  assert.equal(n, 2, 'both the building upgrade and the wonder purchase cheer');
  assert.ok(/const villageCat = \(\) =>/.test(js), 'a helper picks a cat that lives in the village');
});

t('holding a finger on an uncharged cat makes it purr, and letting go stops the purr from starting', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/purrTimer = setTimeout\([\s\S]{0,200}sfx\.play\('purr'\)/.test(js), 'a held tap must start a purr after a short wait');
  assert.ok(/addEventListener\('pointerup', stopPurr\)/.test(js), 'releasing must cancel it');
});

t('toasts sit above coach tips so a new toast is never hidden under a tip', () => {
  const html = readFileSync('stacking_cats/index.html', 'utf8');
  const z = (html.match(/#toasts\{[^}]*z-index:(\d+)/) || [])[1], cz = (html.match(/\.coach\{[^}]*z-index:(\d+)/) || [])[1];
  assert.ok(+z > +cz, `toast z-index ${z} must be above the coach z-index ${cz}`);
});

t('a long press on the field does not open the browser menu (it would cancel the purr)', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8'), html = readFileSync('stacking_cats/index.html', 'utf8');
  assert.ok(/cv\.addEventListener\('contextmenu', \(e\) => e\.preventDefault\(\)\)/.test(js), 'the canvas must swallow contextmenu');
  assert.ok(html.includes('-webkit-touch-callout:none'), 'iOS long-press callout must be off');
});

t('How to play tells players they can tap and hold their cats', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const how = js.slice(js.indexOf('function showHow'), js.indexOf('function showDex'));
  assert.ok(/Tap a cat/i.test(how) && /hold/i.test(how) && /purr/i.test(how), 'How to play must mention tapping and holding a cat to hear it purr');
});

t('the game over buttons stay docked at the bottom so a long results screen never hides them', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8'), html = readFileSync('stacking_cats/index.html', 'utf8');
  assert.ok(/<div class="row overbtns">[\s\S]{0,120}data-act="again"/.test(js), 'the game over button row must carry the overbtns class');
  assert.ok(/\.overbtns\{[^}]*position:sticky[^}]*bottom:/.test(html), 'overbtns must be sticky at the bottom of the scrolling screen');
});

const introMod = await import('../stacking_cats/intro.js');
const storyMod = await import('../stacking_cats/story.js');
t('the intro cutscene draws every moment, and every sound cue names a real sound or cat', () => {
  const R = { cat: () => ({ width: 240, height: 240 }), motion: true, bd: art.makeBackdrop(THEMES[0], 0) };
  for (let tt = 0; tt <= storyMod.INTRO_LEN + 0.2; tt += 0.2) introMod.drawIntro(fakeCtx(), tt, R);
  introMod.drawIntro(fakeCtx(), 3, { ...R, motion: false });
  const audio = readFileSync('stacking_cats/audio.js', 'utf8');
  const kinds = ['pick', 'happy', 'cheer', 'sad', 'worried'];
  const seen = new Set();
  for (const a of introMod.cuesBetween(0, storyMod.INTRO_LEN + 1)) {
    const [kind, x, y] = a.split(' ');
    seen.add(a);
    if (kind === 'play') assert.ok(audio.includes(`case '${x}':`), 'unknown sound ' + x);
    else if (kind === 'meow') { assert.ok(CATS.some((c) => c.id === x), 'unknown cat ' + x); assert.ok(kinds.includes(y), 'unknown meow kind ' + y); }
    else assert.ok(kind === 'music' && ['calm', 'fight', 'boss'].includes(x), 'bad cue ' + a);
  }
  assert.ok(seen.size >= 20, 'the intro has plenty of cues');
  assert.equal(introMod.cuesBetween(0, 0.001).length, 1, 'the opening music cue fires at time zero');
  assert.deepEqual(introMod.HEROES.map((h) => h.id), ['tabby', 'ember', 'buckshot'], 'three brave cats set out');
});
t('the intro plays before the first run, can be replayed, and the story shows up in the game screens', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/play: \(\) => \(save\.seenIntro \? startRun\(\) : watchIntro\(/.test(js), 'the first Play must show the intro');
  assert.ok(/function watchIntro[\s\S]*?save\.seenIntro = true; persist\(\)/.test(js), 'watching it is remembered');
  assert.ok(js.includes('Watch the intro'), 'How to play can replay it');
  assert.ok(/rescueLine\(/.test(js) && /fallLine\(/.test(js), 'the rescue and game over screens use the story lines');
});

t('the wave banner opens each chapter with its story line, and a nest rising gets a taunt from the mouse king', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/isChapterStart\(g\.wave\)[\s\S]{0,60}chapterTitle\(g\.wave, THEMES\)/.test(js) && /toast\(chapterBeat\(g\.wave\)\)/.test(js), 'the first wave of a chapter shows the chapter title and its story beat');
  assert.ok(/King Squeakimus: [\s\S]{0,80}taunt\(/.test(js), 'a nest wave toasts a taunt');
});

t('the cat freed from a nest says its own line when it joins', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/function showCatReward[\s\S]*?toast\(freedToast\(CAT_BY_ID\[d\.id\]\.name, g\.run\.bossKills\)\)/.test(js), 'the nest reward must toast the freed cat line');
});

t('the Cat Dex shows the story line of an unlocked cat', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/function dexDetail[\s\S]*?catStory\(id\)/.test(js), 'dexDetail must show catStory');
});

t('the title has a Story button that replays the intro and comes back to the title', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/data-act="story"[^>]*>Story</.test(js), 'the title needs a Story button');
  assert.ok(/story: \(\) => watchIntro\(\(\) => showTitle\(\)\)/.test(js), 'Story replays the intro then shows the title');
});

t('the chapter beat toast asks beatToastWanted so it never races the first coach tip', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/beatToastWanted\(g\.wave, save\.opt\.tutorial && !save\.tips\.c2\)/.test(js), 'beginWave must pass whether the c2 tip is pending');
});

t('clearing the last nest of the map shows the finale card, pays once and lets the run go on', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/finaleDue\(g\.wave, !!g\.run\.finale\)[\s\S]{0,80}queue\.unshift\('finale'\)/.test(js), 'a wave clear queues the finale card first');
  assert.ok(/r === 'finale'\) showFinale\(\)/.test(js), 'nextReward must open it');
  const f = js.slice(js.indexOf('function showFinale'));
  assert.ok(/g\.run\.finale = true/.test(f) && /!save\.storyDone/.test(f) && /finaleGems\(/.test(f), 'one time reward flagged in the save');
  assert.ok(/Keep playing/.test(f) && /nextReward\(\)/.test(f), 'the player can keep going');
});

t('the finale card hands out the king trophy straight away', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const f = js.slice(js.indexOf('function showFinale'));
  assert.ok(/checkAch\(/.test(f.slice(0, 900)) && /Trophy: /.test(f.slice(0, 900)), 'showFinale must check trophies and announce them');
});

t('the title keeps Story on the Play row so no button is left alone on a last row', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const play = js.slice(js.indexOf('data-act="play"'), js.indexOf('data-act="daily"'));
  assert.ok(play.includes('data-act="story"'), 'Story sits next to Play and the difficulty button');
  const last = js.slice(js.indexOf('data-act="trophies"'), js.indexOf('class="hint"', js.indexOf('data-act="trophies"')));
  assert.ok(!last.includes('data-act="story"'), 'and not in the crowded bottom row');
});

t('the epilogue draws every moment and its cues are real', () => {
  const R = { cat: () => ({ width: 240, height: 240 }), motion: true, bd: art.makeBackdrop(THEMES[0], 0) };
  for (let tt = 0; tt <= storyMod.EPILOGUE_LEN + 0.2; tt += 0.2) introMod.drawEpilogue(fakeCtx(), tt, R);
  introMod.drawEpilogue(fakeCtx(), 4, { ...R, motion: false });
  const audio = readFileSync('stacking_cats/audio.js', 'utf8');
  const cues = introMod.epilogueCuesBetween(0, storyMod.EPILOGUE_LEN + 1);
  assert.ok(cues.length >= 5, 'the epilogue has cues');
  for (const a of cues) {
    const [kind, x, y] = a.split(' ');
    if (kind === 'play') assert.ok(audio.includes(`case '${x}':`), 'unknown sound ' + x);
    else if (kind === 'meow') { assert.ok(CATS.some((c) => c.id === x), 'unknown cat ' + x); assert.ok(['pick', 'happy', 'cheer', 'sad', 'worried'].includes(y), y); }
    else assert.ok(kind === 'music' && ['calm', 'fight', 'boss'].includes(x), 'bad cue ' + a);
  }
});
t('the finale card can show the ending cutscene and comes back to the card afterwards', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const f = js.slice(js.indexOf('function showFinale'), js.indexOf('function nextReward'));
  assert.ok(f.includes('Watch the ending') && /playEpilogue\(/.test(f), 'a button plays the epilogue');
  assert.ok(/onDone: \(\) => (\{[^}]*)?card\(\)/.test(f), 'afterwards the finale card is shown again');
  assert.ok((f.match(/finaleGems\(/g) || []).length === 1, 'the reward is still computed once');
});

t('the nest cleared banner announces the chapter that just ended', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/g\.bossWave \? chapterDoneLine\(g\.wave\) : clearLine\(g\.report\)/.test(js), 'onClear must use chapterDoneLine for nests');
});

t('the game over screen names the chapter the run ended in', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const f = js.slice(js.indexOf('function showOver'), js.indexOf('function showOver') + 2600);
  assert.ok(/Chapter \$\{chapterOf\(r\.wave\)\.n\}/.test(f), 'showOver must show the chapter number');
});

t('the pause screen shows the chapter next to the wave', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const f = js.slice(js.indexOf('function showPause'), js.indexOf('function showPause') + 900);
  assert.ok(/Chapter <b>\$\{chapterOf\(g\.wave\)\.n\}<\/b>/.test(f), 'showPause must list the chapter');
});

t('the Cat Dex grid keeps every cat within three rows so the title and Back button stay on screen', () => {
  const html = readFileSync('stacking_cats/index.html', 'utf8');
  const cols = +(/\.dex\{[^}]*grid-template-columns:repeat\((\d+),/.exec(html) || [])[1];
  assert.ok(cols > 0, 'the dex grid has a column count');
  assert.ok(cols * 3 >= CATS.length, `${CATS.length} cats need at most 3 rows but ${cols} columns give ${Math.ceil(CATS.length / cols)}`);
});

t('the wardrobe cat strip fades at the right edge to show it scrolls and keeps the chosen cat in view', () => {
  const html = readFileSync('stacking_cats/index.html', 'utf8'), js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/\.wstrip\{[^}]*mask-image:linear-gradient/.test(html), 'the strip needs a fade mask');
  const f = js.slice(js.indexOf('function showWardrobe'), js.indexOf('function showWardrobe') + 4500);
  assert.ok(/scrollIntoView\(\{[^}]*inline: 'center'/.test(f), 'the selected cat must be scrolled into view');
});

t('the Cheddar Crusher trophy shows how close the player is (best wave out of the finale wave)', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const f = js.slice(js.indexOf('function troProgress'), js.indexOf('function troProgress') + 900);
  assert.ok(/king: \[st\.bestWave, FINALE_WAVE\]/.test(f), 'troProgress needs a king entry that counts toward FINALE_WAVE');
});

t('locked cats in the Cat Dex are caged by the Gnaw Army, with the unlock hint kept', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const f = js.slice(js.indexOf('function dexDetail'), js.indexOf('function dexDetail') + 1800);
  assert.ok(/Still caged/.test(f) && /Gnaw Army/.test(f) && /d\.unlock\.text/.test(f), 'locked detail tells the story and the unlock rule');
  assert.ok(!/\u2014/.test(f), 'no em dash');
  assert.ok(/'Caged'/.test(js), 'locked tile says Caged');
});

t('the forge toast names the rarity of the new item', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const i = js.indexOf('forge: () =>');
  const f = js.slice(i, i + 400);
  assert.ok(/Forged \$\{ITEM_BY_ID\[id\]\.name\} \(\$\{ITEM_BY_ID\[id\]\.rarity\}\)!/.test(f), 'toast reads Forged Name (rarity)!');
});

t('every nest shows the caged cat it is holding (cage, ears and eyes drawn live)', () => {
  const js = readFileSync('stacking_cats/art_world.js', 'utf8');
  const i = js.indexOf('export function nestOverlay');
  const f = js.slice(i, js.indexOf('// ----', i));
  assert.ok(/caged cat/.test(f) && /cageBars|bars/.test(f), 'nestOverlay draws a small cage with a cat inside');
  assert.ok(!/\u2014/.test(f), 'no em dash');
});

t('when a nest falls the caged cat is freed: hearts and sparks rise from where its cage hung', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const i = js.indexOf("case 'bossDown'");
  const f = js.slice(i, i + 1200);
  assert.ok(/freed cat/.test(f) && /k: 'h'/.test(f) && /e\.x \+ 68/.test(f), 'bossDown spawns hearts at the cage spot (nest x + 68)');
});

t('the nest cage is drawn at 1.35 times size so the captive reads on a phone', () => {
  const js = readFileSync('stacking_cats/art_world.js', 'utf8');
  const i = js.indexOf('export function nestOverlay');
  const f = js.slice(i, js.indexOf('// ----', i));
  assert.ok(/ctx\.scale\(1\.35, 1\.35\)/.test(f) && /translate\(ex, bot\)/.test(f), 'cage scaled about its base');
});

t('the wave 30 nest wears King Squeakimus\'s crown (nestOverlay king flag, passed by the renderer)', () => {
  const art = readFileSync('stacking_cats/art_world.js', 'utf8'), js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/export function nestOverlay\(ctx, hpFrac, t, king\)/.test(art) && /if \(king\)/.test(art), 'overlay takes a king flag');
  assert.ok(/nestOverlay\(ctx, e\.hp \/ e\.maxHp, t, g\.wave === FINALE_WAVE\)/.test(js), 'renderer passes wave === FINALE_WAVE');
});

t('the nest bar shows the story title', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/setText\('bossName', nestTitle\(g\.wave, nest\.name\)\)/.test(js), 'HUD uses nestTitle');
});

t('delayed story and hint toasts wait while the game is paused instead of covering the pause menu', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/function toastWhenPlaying\(m\)/.test(js) && /paused\) return setTimeout\(\(\) => toastWhenPlaying/.test(js), 'helper retries while paused');
  const i = js.indexOf('const intro = [];');
  assert.ok(/toastWhenPlaying\(m\)/.test(js.slice(i, i + 700)), 'new mouse hints use it');
  assert.ok(/toastWhenPlaying\(`King Squeakimus/.test(js), 'the nest taunt uses it');
});

t('the nest wave banner uses the story title helpers', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/banner\(boss \? nestBannerTitle\(g\.wave\)/.test(js) && /boss \? nestTitle\(g\.wave, nest\.name\)/.test(js), 'banner and sub line come from story.js');
});

t('locked Dex cats are drawn behind cage bars', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const i = js.indexOf('function paintThumbs');
  const f = js.slice(i, i + 900);
  assert.ok(/function cageBars\(/.test(js) && /if \(c\.dataset\.lock\) cageBars\(x, c\.width, c\.height\)/.test(f), 'silhouettes get bars');
});

t('the event stop tip sits below the buttons so it never covers the stop title or its cards', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const m = js.match(/coach\('c8', '[^']*', (\d+), (\d+), '(\w+)'/);
  assert.ok(m, 'c8 tip exists with an explicit direction');
  assert.ok(+m[2] >= 400 && m[3] === 'up', 'placed low on the stage with the tail pointing up');
});

t('the start pick screen uses the story subtitle', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/<p class="sub">\$\{pickLine\(pickN\)\}<\/p>/.test(js), 'subtitle from pickLine');
});

t('the road choice screen subtitle comes from roadLine', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/Choose your road<\/h2><p class="sub">\$\{roadLine\(g\.wave, THEMES\)\}<\/p>/.test(js), 'wired');
});

t('the cutscene caption wraps with wrapCaption', () => {
  const js = readFileSync('stacking_cats/intro.js', 'utf8');
  const i = js.indexOf('function caption(');
  assert.ok(/wrapCaption\(full, \(s\) => ctx\.measureText\(s\)\.width, 800\)/.test(js.slice(i, i + 700)), 'caption uses the balanced wrap');
});

t('the first two cutscene scenes seat the cats above the caption plate', () => {
  const js = readFileSync('stacking_cats/intro.js', 'utf8');
  const hits = js.match(/y = GROUND - 12 \+ \(i % 2\) \* 8/g) || [];
  assert.equal(hits.length, 2, 'peace and moon scenes lift the guard');
  assert.ok(!/y = GROUND \+ 18 \+ \(i % 2\) \* 8/.test(js), 'no scene keeps the old low seat');
});

t('the cutscene cages are seated above the caption plate so the caged cats stay visible', () => {
  const js = readFileSync('stacking_cats/intro.js', 'utf8');
  assert.ok(/y = GROUND \+ 2 - \(1 - drop\) \* 220/.test(js), 'cages sit at ground level, not below the plate');
  assert.ok(!/GROUND \+ 56 - \(1 - drop\)/.test(js), 'old low seat is gone');
});

t('the epilogue seats the guard above the caption plate too', () => {
  const js = readFileSync('stacking_cats/intro.js', 'utf8');
  assert.ok(/GROUND - 10 \+ \(i % 2\) \* 8 - hop/.test(js) && /GROUND - 6 - bob/.test(js), 'both epilogue scenes lifted');
});

t('the finale trophy is written into the card, not floated over its title as a toast', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const i = js.indexOf('function showFinale()');
  const f = js.slice(i, i + 1800);
  assert.ok(!/toast\(`Trophy:/.test(f), 'no trophy toast in showFinale');
  assert.ok(/const trophies = checkAch/.test(f) && /\$\{trophyHtml\}/.test(f), 'trophies are rendered inside the card');
});

t('toasts drop to the bottom edge while a full screen is open so they never cover its title', () => {
  const html = readFileSync('stacking_cats/index.html', 'utf8');
  assert.ok(/body\.scr #toasts\{[^}]*top:auto[^}]*bottom:\d+px/.test(html), 'screen mode moves the toast layer to the bottom');
});

t('over a full screen only the latest toast shows, so a stack of them cannot cover the buttons', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const i = js.indexOf('function toast(txt)');
  assert.ok(/classList\.contains\('scr'\)\) \$\('toasts'\)\.replaceChildren\(\)/.test(js.slice(i, i + 300)), 'toast replaces older ones in screen mode');
});

t('Larger text also grows the title tagline, hints and Dex detail text', () => {
  const html = readFileSync('stacking_cats/index.html', 'utf8');
  assert.ok(/body\.bigtext \.tag\{font-size:1[89]px\}/.test(html), 'tagline');
  assert.ok(/body\.bigtext \.hint\{font-size:1[67]px\}/.test(html), 'hints');
  assert.ok(/body\.bigtext \.detail\.dexd\{font-size:1[67]px\}/.test(html), 'dex detail');
});

t('the nest cage rattles harder as the nest takes damage (the captive panics)', () => {
  const js = readFileSync('stacking_cats/art_world.js', 'utf8');
  const i = js.indexOf('export function nestOverlay');
  const f = js.slice(i, js.indexOf('// ----', i));
  assert.ok(/Math\.sin\(t \* 14\) \* \(1 - hpFrac\)/.test(f), 'rattle scales with missing health');
});

t('Claw Frenzy slashes the mice it hits with triple claw marks', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const i = js.indexOf("case 'frenzy':");
  const f = js.slice(i, js.indexOf("case 'fortress':", i));
  assert.ok(/for \(const m of foes\.slice\(0, 4\)\)/.test(f) && /for \(const o of \[-9, 0, 9\]\)/.test(f), 'three parallel slashes on the first four mice');
});

t('in a fight the toasts sit right of centre so they do not hide the special move name over the tower', () => {
  const html = readFileSync('stacking_cats/index.html', 'utf8');
  assert.ok(/#toasts\{[^}]*left:6\d%/.test(html), 'fight toasts are shifted right');
  assert.ok(/body\.scr #toasts\{[^}]*left:50%/.test(html), 'menu screens keep them centred at the bottom');
});

t('Battle Anthem sends music notes drifting across the field', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const i = js.indexOf("case 'anthem':");
  const f = js.slice(i, js.indexOf("case 'hex':", i));
  assert.ok(/for \(let i = 0; i < 12; i\+\+\) txtFx\(/.test(f) && /\\u266A/.test(f), 'twelve rising notes');
});

t('the volley special (Buckshot, Dusty) has a muzzle flash, white-hot tracers and impact flashes', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const i = js.indexOf("case 'volley':");
  const f = js.slice(i, js.indexOf("case 'freeze':", i));
  assert.ok(/flashGlow\(p\.x \+ 24, top/.test(f), 'muzzle flash');
  assert.ok(/'#ffffff', 1\.2/.test(f) && /flashGlow\(m\.x, m\.y - 12/.test(f), 'white core tracer and impact flash');
});

t('King Leo\'s Royal Roar adds golden roar shockwaves on top of the shared claw effect', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const i = js.indexOf("case 'frenzy':");
  const f = js.slice(i, js.indexOf("case 'fortress':", i));
  assert.ok(/if \(e\.id === 'leo'\)/.test(f) && /for \(let r = 0; r < 4; r\+\+\) ring\(p\.x \+ 60 \+ r \* 70/.test(f), 'leo gets four expanding roar rings');
});

t('Hexa\'s Hex stamps a floating curse mark above every hexed mouse', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const i = js.indexOf("case 'hex':");
  const f = js.slice(i, js.indexOf('break;', i));
  assert.ok(/txtFx\(m\.x, m\.y - m\.h - 12, 'HEX!'/.test(f), 'text mark over each foe');
});

t('the title stack is built from the player\'s own most used cats', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/titleStack = titleStackIds\(save\.unlocked, save\.catStats\)/.test(js), 'showTitle refreshes the stack');
});

t('the idle Kingdom hint opens with the village story line', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/hint2">\$\{kingdomLine\(kingdomLevel\(k\)\)\} Tap a building to upgrade it/.test(js), 'kingdomLine in the idle hint');
});

t('the equip tip on the arrange screen sits below the backpack, clear of the title and team DPS', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const m = js.match(/coach\('c6', '[^']*', (\d+), (\d+), '(\w+)'/);
  assert.ok(m && +m[2] >= 340 && m[3] === 'up', 'c6 is low with its tail pointing up at the backpack');
});

t('a dodged bite shows a Dodge! pop with a swish ring and sparkles, not a plain Miss', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const i = js.indexOf("case 'dodge':");
  const f = js.slice(i, js.indexOf("case 'ehit':", i));
  assert.ok(/'Dodge!'/.test(f) && /ring\(p\.x/.test(f) && /sparks\(p\.x/.test(f) && !/'Miss!'/.test(f));
});

t('the game over screen announces unlocked cats as freed from the Gnaw Army', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/<p class="sub">\$\{freedLineFor\(fresh\.length\)\}<\/p>/.test(js) && !/New friends unlocked/.test(js));
});

t('How to play explains dodge', () => {
  const js = readFileSync(new URL('../stacking_cats/main.js', import.meta.url), 'utf8');
  const how = js.slice(js.indexOf('function showHow'), js.indexOf('function showDex'));
  assert.ok(/Dodge/.test(how) && /Pearl|Lucky Shell/.test(how), 'How to play must mention dodge and where it comes from');
});

t('barrage specials tint by the cat color and Pearl gets a water splash instead of the fire burst', () => {
  const js = readFileSync(new URL('../stacking_cats/main.js', import.meta.url), 'utf8');
  const a = js.indexOf("case 'barrage':"), blk = js.slice(a, js.indexOf("case 'heal':", a));
  assert.ok(blk.includes('col'), 'barrage must use the special color');
  assert.ok(!blk.includes("'#ffb05a'") && !blk.includes("'#ff8a2b'"), 'barrage must not hardcode the fire colors for every cat');
  assert.ok(/e\.id === 'pearl'/.test(blk), 'Tidal Wave needs its own splash');
});

t('the caged cat meows when its nest breaks, after the boom, with a different voice per nest', () => {
  const js = readFileSync(new URL('../stacking_cats/main.js', import.meta.url), 'utf8');
  const a = js.indexOf("case 'bossDown':"), blk = js.slice(a, js.indexOf("case 'zoom':", a));
  const m = blk.match(/sfx\.meow\(('caged'|`caged)[^;]*?'cheer',\s*([0-9.]+)\)/);
  assert.ok(m, 'bossDown plays a cheer meow for the freed cat');
  assert.ok(+m[2] >= 0.3, 'it comes a little after the boom, not on top of it');
  assert.ok(/g\.wave|bossKills/.test(blk.slice(blk.indexOf('sfx.meow'))), 'the voice depends on the nest so it is not always the same cat');
});

t('every relic icon is in ICON_KEYS, so the page swaps its emoji for the drawing instead of showing a system glyph', () => {
  const { ICON_KEYS } = icons;
  const missing = ITEMS.map((it) => it.icon.replace(/\uFE0F/g, '')).filter((k) => !ICON_KEYS.includes(k));
  assert.deepEqual(missing, [], 'drawn but not swapped in the page: ' + missing.join(' '));
});

t('lootbox drop bounces, rests and flies; reduced motion keeps the direct flight; Kingdom explains the slow economy', () => {
  const src = readFileSync(new URL('../stacking_cats/main.js', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../stacking_cats/index.html', import.meta.url), 'utf8');
  assert.ok(/DROP_T = 1\.6/.test(src) && /function dropPos\(/.test(src), 'drop timeline is 1.6 s');
  assert.ok(/case 'chest': if \(save\.opt\.motion && !document\.body\.classList\.contains\('nomotion'\)\)/.test(src), 'drop only with motion on');
  assert.ok(/else spawnFx\(\{ k: 'fly'[^\n]*life: 1\.0, max: 1\.0, kind: 'chest'/.test(src), 'old direct flight kept for reduced motion');
  for (const tier of ['cardboard', 'basket', 'silver', 'golden']) assert.ok(new RegExp(tier + ": \\['#").test(src), 'tint for ' + tier);
  assert.ok(/upgrades cost coins from runs/.test(src) && /gems are rare/.test(src), 'Kingdom header says upgrades cost coins and gems are rare');
  const tips = /const KINGDOM_TIPS = \[([\s\S]*?)\];/.exec(src);
  assert.ok(tips && /Slow on purpose/.test(tips[1]), 'slow on purpose tip');
  assert.ok(!/\u2014/.test(tips[1]) && !/\u2014/.test(src.slice(src.indexOf('DROP_T = 1.6'), src.indexOf('DROP_T = 1.6') + 1500)), 'no em dashes');
  assert.ok(/\.ktip\{/.test(page), 'tip styled');
});

t('new sfx (waveclear, nestdown, merge sparkle, back, pip) exist, are wired into main.js, rate limited and keep conservative gains', () => {
  const au = readFileSync(new URL('../stacking_cats/audio.js', import.meta.url), 'utf8');
  const mj = readFileSync(new URL('../stacking_cats/main.js', import.meta.url), 'utf8');
  for (const nm of ['waveclear', 'nestdown', 'merge', 'back', 'pip']) {
    const m = au.match(new RegExp("case '" + nm + "':([^\\n]*)"));
    assert.ok(m, nm + ' case exists');
    const vs = [...m[1].matchAll(/ v: ([0-9.]+)/g)].map((x) => +x[1]);
    assert.ok(vs.length && vs.every((v) => v <= 0.3), nm + ' tone gains stay conservative');
    assert.ok(new RegExp('\\b' + nm + ': \\d+[ ,}]').test(au.match(/const gap = \{[^}]*\}/)[0]), nm + ' has a gap');
  }
  assert.ok(/'win' : 'waveclear'/.test(mj), 'wave cleared plays waveclear');
  assert.ok(/sfx\.play\('nestdown'\)/.test(mj), 'bossDown plays nestdown');
  assert.ok(/sfx\.play\('pip'\)/.test(mj), 'toasts pip');
  assert.ok(/'back' : 'ui'/.test(mj), 'back taps get their own sound');
  assert.ok(!au.includes(String.fromCharCode(0x2014)), 'no literal em dash in audio.js');
});

console.log(`${n} tests passed`);

t('backpack cells tell rarity without colour: one pip more per tier, a star for mythic', () => {
  const css = readFileSync('stacking_cats/index.html', 'utf8');
  const pips = { rare: 1, epic: 2, legendary: 3 };
  for (const [r, n] of Object.entries(pips)) {
    const m = css.match(new RegExp('\\.bag\\.' + r + '::after\\{content:\'([^\']*)\'\\}'));
    assert.ok(m, r + ' has a content rule');
    assert.equal((m[1].match(/\\25CF/g) || []).length, n, r + ' shows ' + n + ' pip(s)');
  }
  assert.ok(/\.bag\.mythic::after\{content:'\\2605'\}/.test(css), 'mythic shows a star');
  assert.ok(!/\.bag\.common::after/.test(css), 'common has no mark');
});

t('backpack cells and Relic Book tiles have spoken labels with the rarity (screen readers, no colour needed)', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/class="bag \$\{ITEM_BY_ID\[id\]\.rarity\}[^`]*aria-label="\$\{ITEM_BY_ID\[id\]\.name\}, \$\{ITEM_BY_ID\[id\]\.rarity\}"/.test(js), 'bag cell label');
  assert.ok(/data-act="rtile"[^`]*aria-label="\$\{f \? `\$\{it\.name\}, \$\{r\}` : `Unknown \$\{r\} relic`\}"/.test(js), 'book tile label');
});

t('every menu screen is a labelled dialog that takes focus, so keyboard and screen reader players know it opened', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8'), css = readFileSync('stacking_cats/index.html', 'utf8');
  const fn = js.slice(js.indexOf('function setScreen'), js.indexOf('const closeScreen'));
  assert.ok(/setAttribute\('role', 'dialog'\)/.test(fn) && /aria-label/.test(fn) && /querySelector\('h2, \.logo'\)/.test(fn), 'role and a label taken from the heading');
  assert.ok(/tabIndex = -1/.test(fn) && /focus\(\{ preventScroll: true \}\)/.test(fn), 'focus moves into the screen without scrolling');
  assert.ok(/\.screen:focus\{outline:none\}/.test(css), 'no focus ring on the container itself');
  assert.ok(/if \(html\)/.test(fn), 'closing a screen never steals focus');
});

t('the set and best-cat lines on relic cards are readable on the cream card (WCAG contrast 4.5), and scale with big text', () => {
  const css = readFileSync('stacking_cats/index.html', 'utf8');
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const sel of ['setl', 'gainl']) {
    const m = css.match(new RegExp('\\.card \\.' + sel + '\\{[^}]*?color:(#[0-9a-fA-F]{6})'));
    assert.ok(m, sel + ' has a colour');
    assert.ok(ratio(m[1], '#fff1de') >= 4.5, sel + ' contrast ' + ratio(m[1], '#fff1de').toFixed(2));
  }
  assert.ok(/body\.bigtext \.card \.setl/.test(css) && /body\.bigtext \.card \.gainl/.test(css), 'big text covers both lines');
  assert.ok(/body\.cb \.card \.gainl/.test(css), 'colour blind mode swaps the green');
});

t('the title logo is small enough that the whole title column fits the 540 high stage (it clipped at the top once the Relics row was added)', () => {
  const css = readFileSync('stacking_cats/index.html', 'utf8');
  const sizes = [...css.matchAll(/(?:^|\n)\.logo\{font-size:(\d+)px/g)].map((m) => +m[1]);
  assert.ok(sizes.length >= 1);
  assert.ok(sizes[sizes.length - 1] <= 74, 'the last .logo font size wins, got ' + sizes[sizes.length - 1]);
  assert.ok(/\n\.logo\{font-size:72px[^}]*padding-top:10px/.test(css), 'room above the letters (their tops stick out of the line box)');
});

t('How to play fits the stage: short rows, and if it ever grows it scrolls from the top instead of cutting off the heading and Back button', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8'), css = readFileSync('stacking_cats/index.html', 'utf8');
  const how = js.slice(js.indexOf('function showHow'), js.indexOf('function showHow') + 4000);
  const rows = [...how.matchAll(/row\('[^']*', [`']([^`']*)[`']\)/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
  assert.ok(rows.length >= 10, 'found the rows, got ' + rows.length);
  for (const r of rows) assert.ok(r.length <= 150, 'a row of ' + r.length + ' characters wraps to a third line: ' + r.slice(0, 40));
  assert.ok(/\.screen:has\(\.how\)\{[^}]*justify-content:safe center[^}]*overflow-y:auto/.test(css), 'safe centering and scrolling for the how screen');
});

t('cat level stars on the Arrange rows are not faded by the mastery star rule that shares their class', () => {
  const css = readFileSync('stacking_cats/index.html', 'utf8');
  const rule = css.match(/\.slot \.st\{([^}]*)\}/);
  assert.ok(rule, 'a slot star rule exists');
  assert.ok(/opacity:1/.test(rule[1]) && /filter:none/.test(rule[1]), 'it resets the opacity and grayscale of the generic .st (mastery) rule: ' + rule[1]);
});

t('shop and shady deal relics show the same set and best-cat notes as loot cards (one shared helper)', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/function relicNotes\(id\)/.test(js), 'a shared helper');
  const helper = js.slice(js.indexOf('function relicNotes'), js.indexOf('function relicNotes') + 1200);
  assert.ok(/setHint\(id, g\.cats\)/.test(helper) && /relicGain\(g, id\)/.test(helper), 'the helper holds both notes');
  const card = js.slice(js.indexOf('function itemCard'), js.indexOf('function itemCard') + 700);
  assert.ok(/relicNotes\(id\)/.test(card), 'loot cards use it');
  const ev = js.slice(js.indexOf('function eventOptionHtml'), js.indexOf('function showEvent'));
  assert.ok(/case 'buy': return head\([^\n]*relicNotes\(o\.item\)/.test(ev), 'shop uses it');
  assert.ok(/case 'curse': return head\([^\n]*relicNotes\(o\.item\)/.test(ev), 'shady deal uses it');
  assert.ok(/case 'blood': return head\([^\n]*relicNotes\(o\.item\)/.test(ev) && /case 'gamble': return head\([^\n]*relicNotes\(o\.item\)/.test(ev), 'the shrine offers use it too');
});

t('the rarity badge on shop and deal cards is not dimmed (white text on a coloured pill needs full opacity)', () => {
  const css = readFileSync('stacking_cats/index.html', 'utf8');
  const m = css.match(/\.card\.ev \.rar\{([^}]*)\}/);
  assert.ok(m, 'rule exists');
  const op = m[1].match(/opacity:([\d.]+)/);
  assert.ok(!op || +op[1] >= 1, 'opacity ' + (op && op[1]));
});

t('Training Yard options tell two cats of the same kind apart (level stars in the name)', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8');
  const ev = js.slice(js.indexOf('function eventOptionHtml'), js.indexOf('function showEvent'));
  assert.ok(/case 'train':[^\n]*CAT_BY_ID\[c\.id\]\.name \+ ' ' \+ stars\(c\.lvl\)/.test(ev), 'name plus stars');
});

t('Relic Book rarity labels carry their own dark backing, so they read on any backdrop', () => {
  const css = readFileSync('stacking_cats/index.html', 'utf8');
  const m = css.match(/\.rlabel\{([^}]*)\}/);
  assert.ok(m, 'rule exists');
  assert.ok(/background:rgba\(\d+,\s*\d+,\s*\d+,\s*\.[7-9]\d*\)/.test(m[1]), 'a mostly opaque dark background: ' + m[1].slice(0, 120));
});

t('lootbox screens: every box has a drawn icon, rewards open boxes, the reveal leads to the equip screen', async () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8'), css = readFileSync('stacking_cats/index.html', 'utf8');
  const { ICON_KEYS } = await import('../stacking_cats/art_icons.js'), { BOXES } = await import('../stacking_cats/cats.js');
  for (const b of BOXES) assert.ok(ICON_KEYS.includes(b.icon), b.id + ' needs a drawing');
  assert.ok(/else if \(r\.startsWith\('box:'\)\) showBox\(r\.slice\(4\)\)/.test(js), 'nextReward opens boxes');
  assert.ok(!/showItemReward/.test(js), 'the old pick one of three screen is gone');
  const box = js.slice(js.indexOf('function showBox('), js.indexOf('function showSnackReward'));
  assert.ok(/S\.openBox\(g, tier\)/.test(box) && /showBoxReveal\(tier, id\)/.test(box), 'opening rolls through the sim');
  assert.ok(/take: \(\) => \{[^}]*showTower\(\(\) => nextReward\(\), \{ item: g\.stash\.lastIndexOf\(id\) \}\)/.test(box), 'equip leads to the arrange screen with the relic selected');
  assert.ok(/\.boxic\.shaking\{animation:boxshake/.test(css) && /@keyframes boxshake/.test(css), 'shake animation');
  assert.ok(/body\.nomotion \*/.test(css), 'reduced motion stops animations (the open still works)');
});

t('lootbox hero art: a fine detail layer for every box, the opening screen shows it, the reveal has rays and confetti by rarity', async () => {
  const art = readFileSync('stacking_cats/art_boxes.js', 'utf8'), js = readFileSync('stacking_cats/main.js', 'utf8'), css = readFileSync('stacking_cats/index.html', 'utf8');
  const { BOXES } = await import('../stacking_cats/cats.js');
  const det = art.slice(art.indexOf('const DETAIL = {'), art.indexOf('const heroCache'));
  for (const b of BOXES) assert.ok(new RegExp('\\n  ' + b.id + ': \\(c\\) =>').test(det), b.id + ' has a detail layer');
  assert.ok(/export function boxHero\(tier, px = 320\)/.test(art), 'hero renderer');
  assert.ok(/import \{[^}]*boxHero[^}]*\} from '\.\/art_boxes\.js'/.test(js) && /boxHero\(bx\.id\)\.toDataURL\(\)/.test(js), 'the box screen uses it');
  assert.ok(/class="revealstage r-\$\{it\.rarity\}"/.test(js) && /class="rays"/.test(js) && /class="confetti"/.test(js), 'rays and confetti on the reveal');
  assert.ok(/\.rays\{/.test(css) && /@keyframes conf/.test(css), 'their styles');
});

t('the fight HUD and the fly effect show the drawn lootbox, not the gift emoji', () => {
  const rd = (f) => readFileSync(new URL('../stacking_cats/' + f, import.meta.url), 'utf8');
  const js = rd('main.js');
  assert.ok(/id="chestIco"/.test(rd('index.html')), 'HUD icon slot');
  assert.ok(/\$\('chestIco'\)\.innerHTML = `<img class="gi"[^`]*iconURL\(topBox\.icon\)/.test(js), 'HUD uses the best queued box art');
  assert.ok(/tier: e\.tier/.test(js) && /BOX_BY_ID\[f\.tier\]\.icon/.test(js), 'the flying box uses its tier art');
});

t('relic icons: every relic key still has a drawing, each draws without throwing, and the fine detail pass is in place', async () => {
  const { RELIC_ICONS } = await import('../stacking_cats/art_relics.js');
  const { ITEMS } = await import('../stacking_cats/cats.js');
  const art = readFileSync('stacking_cats/art_relics.js', 'utf8');
  for (const it of ITEMS) assert.ok(icons.hasIcon(it.icon), it.id + ' needs a drawing');
  assert.ok(Object.keys(RELIC_ICONS).length >= 36, 'no relic drawing was dropped');
  for (const k of ['🍪', '🏅', '🌻', '🌟', '⭐', '🔱', '🥠']) assert.ok(new RegExp("\\n  '" + k + "': \\(c\\) =>").test(art.slice(art.indexOf('const DETAIL = {'))), k + ' has a detail layer');
  assert.ok(/EPIC = new Set\(\[/.test(art) && /rimLight\(cv/.test(art), 'epic glow and rim light finish');
  for (const [k, f] of Object.entries(RELIC_ICONS)) f(fakeCtx());
  assert.ok(!/\u2014/.test(art), 'no em dashes');
});

t('world art: backdrops carry depth layers (cloud sprites, birds, motes), mice have fine detail and no scratch texture, fight VFX are richer', () => {
  const rd = (f) => readFileSync(new URL('../stacking_cats/' + f, import.meta.url), 'utf8');
  const aw = rd('art_world.js'), js = rd('main.js');
  for (const th of THEMES) {
    const bd = art.makeBackdrop(th, 3);
    assert.ok(bd.cloudSpr && bd.motes.length > 0 && Array.isArray(bd.birds), th.name + ' ambient lists');
    art.drawBackdrop(fakeCtx(), bd, 120, 3.3); art.drawRays(fakeCtx(), bd, 3.3); art.drawFront(fakeCtx(), bd, 120);
    art.freeBackdrop(bd);
  }
  const mice = aw.slice(aw.indexOf('function mouseBody'), aw.indexOf('function dagger'));
  assert.ok(/earShade\(/.test(mice) && /furShade\(/.test(mice) && /whiskers/.test(mice) && /tapers/.test(mice), 'mouse fine detail');
  assert.ok(!/texturize/.test(aw.slice(aw.indexOf('export function enemySprite'), aw.indexOf('function nestBody'))), 'no noisy scratch texture on mice');
  assert.ok(/case 'cathit':[^\n]*sparks\([^\n]*flashGlow\(/.test(js), 'tower damage burst');
  assert.ok(/case 'coin': if \(fx\.length < 300\) \{ sparks\(/.test(js) && /case 'chest':[^\n]*ring\([^\n]*flashGlow\(/.test(js), 'coin pop and box glint');
  assert.ok(!/\u2014/.test(aw), 'no em dashes');
});

t('lootbox opening: lid pop, glow, beams and sparks, a flash and pedestal on the reveal, all under the nomotion rule', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8'), css = readFileSync('stacking_cats/index.html', 'utf8');
  assert.ok(/class="boxglow"/.test(js) && /class="boxbeams"/.test(js) && /boxsparks/.test(js) && /classList\.add\('opening'\)/.test(js), 'opening layers');
  assert.ok(/@keyframes lidpop/.test(css) && /@keyframes beamsburst/.test(css) && /\.boxstage\.opening/.test(css), 'opening styles');
  assert.ok(/class="pedestal"/.test(js) && /class="revealflash"/.test(js) && /class="cheercat"/.test(js) && /@keyframes rflash/.test(css), 'reveal polish');
  assert.ok(/body\.nomotion \*/.test(css), 'nomotion still stops animations');
});

t('tower and scenes polish: rug, feathered contact shadows, title fireflies, finale light and trophy', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8'), it = readFileSync('stacking_cats/intro.js', 'utf8');
  assert.ok(/function drawRug/.test(js) && /drawRug\(cx, GROUND/.test(js) && /createRadialGradient\(32, 32/.test(js), 'rug and soft shadow');
  assert.ok(/fireflies|ffe58a/.test(js), 'title fireflies');
  assert.ok(/trophy flare/.test(it) && /light shafts/.test(it), 'finale light');
  assert.ok(!/\u2014/.test(it), 'no em dashes');
});

t('UI chrome detail pass: ornate corner studs, bevels, recessed progress bars, Relic Book frames, vignette, and keeps the a11y hooks', () => {
  const css = readFileSync('stacking_cats/index.html', 'utf8');
  const r5 = css.slice(css.indexOf('round 5: UI chrome detail'));
  assert.ok(r5.length > 500, 'round 5 block exists');
  assert.ok(/\.detail,\.dcard,\.kd,\.bcard[^{]*\{--cs:radial-gradient/.test(r5), 'corner studs on paper panels');
  assert.ok(/\.pbar,\.mbar,\.rb \.bar,\.slot \.hp[^{]*\{box-shadow:inset/.test(r5), 'recessed bars');
  assert.ok(/\.rlabel\.r-legendary\{border-color/.test(r5) && /\.rtile\.sel\{/.test(r5) && /\.rtile\.locked\{/.test(r5), 'Relic Book frames');
  assert.ok(/\.screen\{background-image:radial-gradient/.test(r5) && /\.screen\.clear\{background-image:none\}/.test(r5), 'vignette that leaves clear screens alone');
  assert.ok(/body\.nomotion \.dcell:hover/.test(r5), 'nomotion covers new hover lifts');
  assert.ok(/body\.nomotion \*/.test(css) && /body\.bigtext \.card p/.test(css) && /body\.cb \.impact\.up/.test(css), 'a11y modes intact');
  assert.ok(/\.bag\.rare::after\{content/.test(css), 'rarity pips kept');
  assert.ok(!/\u2014/.test(r5), 'no em dashes');
});

t('opening a full screen clears the wave banner (under a blurred panel it showed as a mirrored ghost)', async () => {
  const js = readFileSync(new URL('../stacking_cats/main.js', import.meta.url), 'utf8');
  assert.ok(/function setScreen[\s\S]{0,400}getElementById\('banner'\)[\s\S]{0,80}className = ''/.test(js), 'setScreen clears the banner');
});

t('opening a lootbox has its own sound: rattle, lid pop, sparkle', async () => {
  const au = readFileSync(new URL('../stacking_cats/audio.js', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../stacking_cats/main.js', import.meta.url), 'utf8');
  assert.ok(/case 'boxopen':/.test(au), 'the sound exists');
  assert.ok(/sfx\.play\('boxopen'\)/.test(js), 'the Open button plays it');
});

t('phone polish: tall tap targets on short screens, and the Cat Dex and Trophies get progress bars and tiered frames', () => {
  const html = readFileSync('stacking_cats/index.html', 'utf8'), js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/@media \(max-height:400px\)\{[^@]*min-height:60px/.test(html), 'short screens get 60px stage high buttons (about 36px on a phone)');
  assert.ok(/\.dexbar\{/.test(html) && /\.tile \.tpb\{/.test(html) && /\.tro\.t-legendary\{/.test(html), 'dex and trophy styles exist');
  assert.ok(/class="dexbar"/.test(js) && /class="tpb"/.test(js) && /function troTier/.test(js) && /t-\$\{troTier\(a\)\}/.test(js), 'markup uses them');
  assert.ok(!/\u2014/.test(html + js), 'no em dash');
});

t('phone audit round 2: Relic Book tiles are 60 stage px in a scrolling grid, Back/Done reach 60, event cards keep the price pill clear', () => {
  const html = readFileSync('stacking_cats/index.html', 'utf8');
  assert.ok(/body \.rtile\{width:60px;height:60px/.test(html), 'big relic tiles on short screens');
  assert.ok(/body \.relbook\{[^}]*overflow-y:auto/.test(html) && /body \.screen:has\(\.relbook\)\{overflow:hidden\}/.test(html), 'relic grid scrolls so Back stays visible');
  assert.ok(/body \.screen\.arr \.btn\.big2\.btn[^{]*\{min-height:60px\}/.test(html), 'Settings Back and Arrange Done reach 35px real');
  assert.ok(/\.card\.ev\{width:150px;min-height:176px;padding:6px 6px 18px/.test(html), 'event card text clears the price pill');
  assert.ok(!/\u2014/.test(html), 'no em dash');
});

t('coach bubbles on full screens step clear of buttons and cards, and merge dust respects reduced motion', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8'), html = readFileSync('stacking_cats/index.html', 'utf8');
  assert.ok(/function coachClear\(el, hl\)/.test(js) && /classList\.contains\('scr'\)\) \{[\s\S]*?coachClear\(el, hl\)/.test(js), 'coach() repositions on a full screen');
  assert.ok(/querySelectorAll\('button, \.card,/.test(js), 'buttons and cards are avoided');
  assert.ok(/\.coach\.notail::after\{display:none\}/.test(html), 'a bubble with no target drops its tail');
  assert.ok(/for \(const k of \['c1'/.test(js) || /coach\('c5'/.test(js), 'coach keys stay');
  assert.ok(/if \(save\.opt\.motion && !document\.body\.classList\.contains\('nomotion'\)\) \{[^}]*pops\.set\(e\.uid[\s\S]*?puff\(p\.x, GROUND/.test(js), 'merge squash and base dust only with motion on');
});

t('phone in-fight HUD: tools, specials, Zoomies reach about 35 real px, text stays near 9 real px, Auto has a taller hit area', () => {
  const html = readFileSync('stacking_cats/index.html', 'utf8'), js = readFileSync('stacking_cats/main.js', 'utf8');
  const blk = html.slice(html.indexOf('round 10: in-fight HUD on phones'));
  assert.ok(/@media \(max-height:400px\)/.test(blk), 'phone only block');
  assert.ok(/body \.ib,body\.touch \.ib[^{]*\{width:60px;height:60px/.test(blk), 'tool buttons 60 stage px');
  assert.ok(/body \.spb,body\.touch \.spb\{width:64px;height:64px/.test(blk), 'special buttons 64 stage px');
  assert.ok(/#specials \.autob::before\{content:'';/.test(blk), 'Auto hit area grows');
  assert.ok(/#zoom span[^{]*\{font-size:17px/.test(blk) && /#meter \.mr\{font-size:15px/.test(blk), 'Zoomies and DPS text readable');
  assert.ok(/window\.innerHeight <= 400 \? 16 : 13/.test(js) && /Math\.max\(f\.size, 20\)/.test(js), 'canvas HP names and damage numbers scale up on phones');
  for (const id of ['specials', 'zoom', 'meter', 'banner', 'waveBox']) assert.ok(html.includes(`id="${id}"`), id);
});

t('icons: the shared shaded finish is in place and every non-relic icon still draws visible pixels', async () => {
  const src = readFileSync('stacking_cats/art_icons.js', 'utf8');
  assert.ok(/rimLight/.test(src) && /createLinearGradient/.test(src) && /const DETAIL = \{/.test(src), 'finish present');
  assert.ok(!src.includes(String.fromCharCode(0x2014)), 'no em dash in art_icons.js');
  for (const k of ['🍗', '🍣', '🥛', '🍦', '🥤', '🔥', '🐟', '🧱', '⚙']) {
    assert.ok(icons.iconCanvas(k), k + ' still has a drawing');
  }
});

t('cutscene polish: jewelled king on a cheese throne, barred cages, depth haze, cached layers, motion respected', () => {
  const it = readFileSync('stacking_cats/intro.js', 'utf8');
  assert.ok(/function kingCourt/.test(it) && /cheese/.test(it) && /#3aa0ff/.test(it) && /glowEye/.test(it), 'king throne, jewels and glowing eyes');
  assert.ok(/function layer\(/.test(it) && /function haze\(/.test(it) && /function rays\(/.test(it) && /function silhouette\(/.test(it), 'cached layers, haze, light shafts, rim lit silhouettes');
  assert.ok(/t = R\.motion \? T : 0/.test(it), 'motes hold still when motion is reduced');
  const R = { cat: () => ({ width: 240, height: 240 }), motion: false, bd: art.makeBackdrop(THEMES[0], 0) };
  for (let tt = 0; tt <= storyMod.INTRO_LEN; tt += 0.5) introMod.drawIntro(fakeCtx(), tt, R);
  for (let tt = 0; tt <= storyMod.EPILOGUE_LEN; tt += 0.5) introMod.drawEpilogue(fakeCtx(), tt, R);
});

t('the Cat Dex detail panel has a portrait plate, chips, stats and a progress bar for locked cats', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8'), html = readFileSync('stacking_cats/index.html', 'utf8');
  const f = js.slice(js.indexOf('function dexDetail'), js.indexOf('// ----', js.indexOf('function dexDetail')));
  assert.ok(/dexPlate\(id, false\)/.test(f) && /dexPlate\(id, true\)/.test(f), 'both panels show the portrait plate');
  assert.ok(/data-lock/.test(js.slice(js.indexOf('const dexPlate'), js.indexOf('function dexDetail'))), 'locked plate is caged');
  assert.ok(/Best wave/.test(f) && /Runs/.test(f) && /Mice/.test(f) && /ATK_NAME/.test(f), 'stats and attack chip');
  assert.ok(/dxprog/.test(f) && /class="pbar"/.test(f), 'locked cats show the unlock progress bar');
  assert.ok(!/\u2014/.test(f), 'no em dash');
  assert.ok(/\.dxplate\{/.test(html) && /\.dxtg\{/.test(html) && /\.dx-legendary\{/.test(html), 'styles exist');
  assert.ok(/data-act="wardrobe"/.test(f) && /data-act="back"/.test(js.slice(js.indexOf('function showDex'), js.indexOf('function dexDetail'))), 'wardrobe and Back stay');
});

t('phone layout round 11: AUTO joins the special row at the bottom edge, the nest bar clears the wave box, the Dex mastery bar is wider', () => {
  const html = readFileSync('stacking_cats/index.html', 'utf8');
  const blk = html.slice(html.indexOf('round 11: AUTO joins the row'));
  const phone = html.slice(html.lastIndexOf('@media (max-height:400px){', html.indexOf('round 11: AUTO joins the row')));
  assert.ok(phone.includes('round 11'), 'rules sit inside the phone media block');
  assert.ok(/#specials,body\.touch #specials\{bottom:4px/.test(blk), 'specials row at the bottom edge');
  assert.ok(/#specials \.autob,body\.touch #specials \.autob\{position:relative;order:99;[^}]*height:60px/.test(blk), 'AUTO is in the row with a 60 stage px (about 36 real) tap height');
  assert.ok(/body #bossBar\{top:66px/.test(blk), 'nest bar sits below the wave box');
  assert.ok(/\.dx \.mast \.mbar\{width:130px/.test(html), 'Dex mastery bar wider on phones');
});

t('nest destroyed celebration: cheese confetti, crumbling nest, hopping caged cat and meow text; reduced motion keeps only a soft glow and text; tower cats fidget', async () => {
  const js = readFileSync(new URL('../stacking_cats/main.js', import.meta.url), 'utf8');
  const blk = js.slice(js.indexOf("case 'bossDown'"), js.indexOf("case 'zoom'"));
  assert.ok(/confetti\([^)]*CHEESE\)/.test(blk) && /k: 'nest'/.test(blk) && /k: 'sil'/.test(blk) && /'Meow!'/.test(blk), 'celebration pieces');
  assert.ok(/const calm = !save\.opt\.motion/.test(blk) && /if \(!calm\) confetti/.test(blk) && /\} else flashGlow/.test(blk), 'reduced motion branch');
  assert.ok(/f\.k === 'nest'/.test(js) && /f\.k === 'sil'/.test(js), 'both fx are drawn');
  assert.ok(/idle fidget/.test(js) && /save\.opt\.motion && atk < 0\.02\) \{ const per/.test(js), 'idle fidget is gated by motion');
  assert.ok(!/\u2014/.test(blk), 'no em dashes');
});

t('polish: banner ribbon variants, trophy toast medal, pause plaque, reduced motion still shows the banner', async () => {
  const html = readFileSync(new URL('../stacking_cats/index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../stacking_cats/main.js', import.meta.url), 'utf8');
  assert.ok(/#banner::before\{/.test(html) && /#banner\.boss\{[^}]*--crack/.test(html) && /#banner\.clear\{/.test(html), 'ribbon plus boss crack and gold clear variants');
  assert.ok(/pointer-events:none/.test(html.match(/#banner\{[^}]*\}/)[0]), 'banner never blocks taps');
  assert.ok(/body\.nomotion #banner\.show\{opacity:1/.test(html) && /nomotion'\)\) banner\.t = setTimeout/.test(js), 'reduced motion shows then hides the banner by timer');
  assert.ok(/WAVE CLEARED\/\.test\(txt\) \? ' clear'/.test(js) && /NEST DESTROYED\/\.test\(txt\)/.test(js), 'banner picks its variant from the text');
  assert.ok(/'toast trophy'/.test(js) && /\.toast\.trophy::before/.test(html) && /#toasts \.toast::before/.test(html), 'toasts get a medal icon, trophies a gold one');
  assert.ok(/\.screen h2\.paused\{/.test(html) && /max-width:700px\)\{\.screen \.row \.btn\.grey\{min-height:6\d/.test(html), 'pause plaque and tall phone buttons');
  assert.ok(!html.includes('\u2014'), 'no em dashes in index.html');
});

t('arrange and event polish: grip handle, strong selection, rarity framed event cards, merge flash respects reduced motion', () => {
  const html = readFileSync('stacking_cats/index.html', 'utf8'), js = readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/\.screen\.arr \.slot\.has::before\{content:'\\22EE/.test(html), 'drag grip on cat rows');
  assert.ok(/\.screen\.arr \.slot\.has\.sel\{[^}]*outline:3px solid #fff/.test(html), 'selected cat is clearly highlighted');
  assert.ok(/body\.touch \.screen\.arr \.btn\.small\{min-height:36px\}/.test(html), 'arrange buttons reach 35px on phone');
  assert.ok(/\.card\.ev:has\(\.rar\.epic\)\{border-color:#b83ad0\}/.test(html) && /\.card\.ev \.evp\{[^}]*display:flex/.test(html), 'event card rarity frame and coin price pill');
  assert.ok(/function mergeFlash\([^)]*\)[\s\S]{0,500}save\.opt\.motion[\s\S]{0,200}u2605/.test(js), 'star burst gated by reduced motion');
  assert.ok(/case 'merge': \{[\s\S]{0,400}mergeFlash\(p\.x, p\.y, max\)/.test(js), 'merge event flashes');
  assert.ok(!html.includes('\u2014') && !js.includes('\u2014'), 'no em dashes');
});

t('the sticky game over button footer is soft: a light fade and edges that fade out, not a hard dark band', () => {
  const html = readFileSync(new URL('../stacking_cats/index.html', import.meta.url), 'utf8');
  const m = html.match(/\.screen\.wide \.overbtns\{[^}]*\}/);
  assert.ok(m, 'rule found');
  assert.ok(/position:sticky/.test(m[0]) && /rgba\(24,14,48,\.5\)/.test(m[0]) && /mask-image/.test(m[0]), 'sticky, light fade, faded edges');
  assert.ok(!/rgba\(24,14,48,\.92\)/.test(m[0]), 'the old heavy band is gone');
});

t('epic, legendary and mythic relic cards have a solid colour (the grain rule once left them see-through, rays and scene showed through the text)', () => {
  const html = readFileSync(new URL('../stacking_cats/index.html', import.meta.url), 'utf8');
  for (const r of ['epic', 'legendary', 'mythic']) {
    const re = new RegExp('\\.card\\.item\\.r-' + r + '\\{[^}]*background-color:#[0-9a-f]{6}');
    assert.ok(re.test(html), r + ' card has a solid background-colour');
  }
});

t('arrange drag and drop: pointer handlers with capture, a ghost, drop targets, sim calls and the tap fallback all stay', () => {
  const js = readFileSync('stacking_cats/main.js', 'utf8'), html = readFileSync('stacking_cats/index.html', 'utf8');
  assert.ok(/function bindDrag\(root, h\)[\s\S]{0,400}'pointerdown'[\s\S]{0,900}setPointerCapture[\s\S]{0,1500}'pointermove'[\s\S]{0,200}'pointerup'[\s\S]{0,200}'pointercancel'/.test(js), 'pointer events with capture');
  assert.ok(/elementFromPoint/.test(js) && /className = 'dghost'/.test(js), 'hit test and a floating ghost');
  assert.ok(/act === 'equip'\) \{ equipTo\(s\.i, t\.uid\)/.test(js) && /S\.equipItem\(g, idx, uid\)/.test(js), 'dropping a relic on a cat calls equipItem');
  assert.ok(/S\.moveItem\(g, s\.uid, s\.i, t\.uid\)/.test(js) && /S\.unequipItem\(g, s\.uid, s\.i\)/.test(js), 'worn relics move and unequip');
  assert.ok(/S\.mergeCats\(g, a\.uid, b\.uid\)/.test(js) && /S\.swapCats\(g, a\.uid, b\.uid\)/.test(js) && /S\.moveCat\(g, s\.uid, t\.zone\)/.test(js), 'cats merge, swap and move by drop');
  assert.ok(/acts\.sell\(\)/.test(js) && /acts\.forge\(\)/.test(js) && /data-drop="sell"/.test(js) && /data-drop="forge"/.test(js), 'sell and forge zones');
  assert.ok(/bag: \(d\) => \{ selItem = selItem === \+d\.i/.test(js) && /slot: \(d\) => \{/.test(js) && /equipTo\(selItem, cat\.uid\)/.test(js) && /unequip: \(d\)/.test(js), 'tap to select then tap a target still works');
  assert.ok(/aria-label="\$\{it\.name\}, \$\{it\.rarity\}, worn by/.test(js) && /data-act="done"/.test(js), 'labels and Done kept');
  assert.ok(/click', \(e\) => \{ if \(performance\.now\(\) < dragSuppress\)/.test(js), 'the click ending a drag is swallowed');
  assert.ok(/ARRANGE START \*\//.test(html) && /ARRANGE END \*\//.test(html), 'css block present');
  const css = html.slice(html.indexOf('ARRANGE START'), html.indexOf('ARRANGE END'));
  assert.ok(/\.screen\.arr \.slot\.has\{[^}]*touch-action:none/.test(css) && /\.screen\.arr \.bag\{touch-action:none/.test(css), 'draggables stop the browser from scrolling');
  assert.ok(/\.dghost\{[^}]*pointer-events:none/.test(css) && /body\.nomotion \.dghost/.test(css), 'ghost never catches the pointer, calm under reduced motion');
  assert.ok(/\.islot\.full\.r-mythic/.test(css) && /\.screen\.arr \.slot \.nm\{overflow:hidden;text-overflow:ellipsis/.test(css), 'rarity sockets and ellipsis names');
  assert.ok(/'upgrade'|'pop'/.test(js) && /sfx\.play\('equip'\)/.test(js), 'soft sounds use existing names');
  assert.ok(!js.includes('\u2014') && !html.includes('\u2014'), 'no em dashes');
});

t('arrange drag: dropAction picks the right move and moveItem swaps worn relics without backpack room', async () => {
  const { dropAction } = await import('../stacking_cats/art_util.js');
  assert.equal(dropAction({ k: 'bag' }, { k: 'cat' }), 'equip');
  assert.equal(dropAction({ k: 'bag' }, { k: 'sell' }), 'sell');
  assert.equal(dropAction({ k: 'bag' }, { k: 'forge' }), 'forge');
  assert.equal(dropAction({ k: 'bag' }, { k: 'empty' }), null);
  assert.equal(dropAction({ k: 'worn' }, { k: 'cat', self: true }), null);
  assert.equal(dropAction({ k: 'worn' }, { k: 'cat' }), 'moveItem');
  assert.equal(dropAction({ k: 'worn' }, { k: 'bag' }), 'unequip');
  assert.equal(dropAction({ k: 'cat' }, { k: 'cat' }), 'catSwap');
  assert.equal(dropAction({ k: 'cat' }, { k: 'zone' }), 'catMove');
  assert.equal(dropAction({ k: 'cat' }, { k: 'release' }), 'release');
  assert.equal(dropAction({ k: 'cat' }, { k: 'cat', self: true }), null);
  const S = await import('../stacking_cats/sim.js');
  const g = S.newGame({ seed: 5, unlocked: ['tabby', 'mochi', 'yuki'] });
  S.addCat(g, 'tabby'); S.addCat(g, 'mochi');
  const [a, b] = g.cats;
  g.stash.push('scythe', 'mask');
  assert.ok(S.equipItem(g, 0, a.uid) && S.equipItem(g, 0, b.uid));
  const ia = a.items[0], ib = b.items[0], len = g.stash.length;
  assert.ok(S.moveItem(g, a.uid, 0, b.uid));
  assert.deepEqual([a.items[0], b.items[0]], [ib, ia], 'a full target trades its relic back');
  assert.equal(g.stash.length, len, 'the backpack is untouched');
  assert.ok(!S.moveItem(g, a.uid, 0, a.uid) && !S.moveItem(g, a.uid, 5, b.uid));
});

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
const { drawBuilding } = await import('../stacking_cats/art_kingdom.js');
const { BUILDINGS } = await import('../stacking_cats/cats.js');

t('every cat draws without errors', () => {
  for (const d of CATS) for (const v of ['open', 'blink', 'hurt']) drawCat(fakeCtx(), d, v);
  assert.ok(calls.n > 1000);
});

t('every mouse type, elite and nest draws', () => {
  for (const type of Object.keys(ENEMY_TYPES)) for (const elite of [false, true]) { const s = art.enemySprite(type, elite); assert.ok(s.c && s.w > 0); }
  for (const nest of NESTS) { const s = art.nestSprite(nest.id); assert.ok(s.c); art.nestOverlay(fakeCtx(), 0.3, 1.2); }
});

t('every kingdom building draws at every level', () => {
  for (const b of BUILDINGS) for (let l = 0; l <= b.max; l++) drawBuilding(fakeCtx(), b.id, l);
});

t('every theme builds a backdrop and scrolls', () => {
  THEMES.forEach((th, i) => { const bd = art.makeBackdrop(th, i); art.drawBackdrop(fakeCtx(), bd, 123.4, 2); art.drawRays(fakeCtx(), bd, 1); art.drawFront(fakeCtx(), bd, 55); });
});

t('main.js parses and the ids it uses exist in index.html', () => {
  execFileSync(process.execPath, ['--check', 'stacking_cats/main.js']);
  const js = readFileSync('stacking_cats/main.js', 'utf8'), html = readFileSync('stacking_cats/index.html', 'utf8');
  const ids = new Set([...js.matchAll(/\$\('([A-Za-z]+)'\)/g)].map((m) => m[1]));
  assert.ok(ids.size >= 10);
  const dynamic = new Set(['earn']); // created by the game over screen
  for (const id of ids) assert.ok(dynamic.has(id) || html.includes(`id="${id}"`), 'index.html misses #' + id);
  assert.ok(html.includes('type="module" src="main.js"'));
});

t('no em dashes anywhere in the game files', () => {
  for (const f of ['main.js', 'index.html', 'cats.js', 'sim.js', 'art_cats.js', 'art_world.js', 'art_kingdom.js', 'audio.js']) {
    assert.ok(!readFileSync('stacking_cats/' + f, 'utf8').includes('—'), f);
  }
});

t('the game is registered for the build and the change map', () => {
  assert.ok(readFileSync('build.js', 'utf8').includes("'stacking_cats'"));
  assert.ok(readFileSync('tools/check-changed.mjs', 'utf8').includes('stacking_cats'));
  assert.ok(readFileSync('index.html', 'utf8').includes('/stacking_cats/'));
});

console.log(`${n} tests passed`);

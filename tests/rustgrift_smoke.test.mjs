// Rustgrift smoke test: every script the page loads exists and compiles, and the page
// is phone-ready. The game itself is canvas-only, so this is a load-time gate rather
// than a simulation (the headless playthrough lives with the author's local bot).
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = new URL('../rustgrift/', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');

const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
assert.ok(scripts.length >= 10, 'index.html loads the game scripts');
assert.equal(scripts.at(-1), 'js/main.js', 'main.js boots last');

for (const src of scripts) {
  assert.ok(!src.startsWith('/') && !src.includes('..'), `${src}: relative path (the game is served under /rustgrift/)`);
  const url = new URL(src, root);
  assert.ok(existsSync(url), `${src} exists`);
  assert.doesNotThrow(() => new vm.Script(readFileSync(url, 'utf8'), { filename: src }), `${src} compiles`);
}

assert.match(html, /name="viewport"/, 'viewport meta (phone)');
assert.match(html, /touch-action:\s*none/, 'canvas ignores browser touch gestures');
assert.match(html, /<canvas id="c">/, 'game canvas present');

// Art overrides must load after the base files they replace.
const idx = (f) => scripts.indexOf(`js/${f}.js`);
for (const f of ['art_humans', 'art_creatures', 'art_env', 'art_ui', 'art_fx', 'art_icons', 'art_scenes']) {
  assert.ok(idx(f) > idx('scenes'), `${f}.js loads after scenes.js`);
  assert.ok(idx(f) < idx('main'), `${f}.js loads before main.js`);
}
console.log(`rustgrift smoke: ${scripts.length} scripts OK`);

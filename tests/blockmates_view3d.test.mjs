// Structural checks for the 3D view (the renderer itself needs a browser/WebGL, so it is checked by hand).
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = new URL('../blockmates/', import.meta.url).pathname;
const html = readFileSync(root + 'index.html', 'utf8');
const m = html.match(/"three"\s*:\s*"\.\/([^"]+)"/);
assert.ok(m, 'importmap maps three');
assert.ok(existsSync(root + m[1]), 'vendored three exists');
assert.ok(html.includes('id="gl"'), 'gl canvas present');
for (const f of ['client/render3d.js', 'client/r3/atlas.js', 'client/r3/terrain.js', 'client/r3/entities.js', 'client/r3/sky.js', 'client/r3/preview.js', 'client/r3/menu3d.js']) {
  assert.ok(existsSync(root + f), f + ' exists');
  execFileSync(process.execPath, ['--check', root + f]);
}
console.log('blockmates view3d ok');

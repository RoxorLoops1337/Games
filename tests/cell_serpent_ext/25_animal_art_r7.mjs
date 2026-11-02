// Batch 7 animal art: duo life and cheer frame helpers behave headless, slump faces and the arms-up frame exist in the source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cheerFrame } from '../../cell_serpent/duo_cheer.js';
import { drawDuoLife } from '../../cell_serpent/duo_idle.js';
assert.equal(cheerFrame(null), null);
assert.equal(cheerFrame({ width: 520, height: 460 }), null);   // no document in node: no frame, no crash
// drawDuoLife issues a fixed number of draws and keeps every strip inside the picture box
const calls = []; const ctx = { drawImage: (...a) => calls.push(a) };
const im = { width: 520, height: 460 };
drawDuoLife(ctx, im, 192, 170, 3.1, 1, 1);
assert.equal(calls.length, 16);
for (const a of calls) { assert.ok(a[8] > 0 && a[8] < 40, 'strip height'); assert.ok(a[5] >= -102 && a[5] <= 102, 'strip x'); }
calls.length = 0; drawDuoLife(ctx, im, 192, 170, 0, 0, 0);
const top = calls[0], bottom = calls[7];
assert.equal(top[6], -85); assert.ok(Math.abs(top[8] * 8 - 170) < 8);   // no life: a plain picture
assert.ok(bottom[6] + bottom[8] <= 85.6 + 0.01 + 0.5);
const src = fs.readFileSync(new URL('../../cell_serpent/art_draw.js', import.meta.url), 'utf8');
assert.ok(src.includes('MOOD === 7'));   // slump faces
const r = fs.readFileSync(new URL('../../cell_serpent/render.js', import.meta.url), 'utf8');
assert.ok(r.includes('cheerFrame(') && r.includes('drawDuoLife('));
assert.ok(!/—/.test(src + r + fs.readFileSync(new URL('../../cell_serpent/duo_cheer.js', import.meta.url), 'utf8')));
console.log('25_animal_art_r7 ok');

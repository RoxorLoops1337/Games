// Batch 13 (agent b): juice module wiring and sounds. Offline checks only (no browser).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const src = f => readFileSync(join(root, f), 'utf8');
const m = await import(join(root, 'juice_b13b.js'));

// the registrar adds the four sounds, each callable and gated
const sfx = {}, calls = [], gates = {};
m.registerB13b(sfx, (...a) => calls.push(['t', ...a]), (...a) => calls.push(['n', ...a]), () => calls.push(['d']), (k) => { if (gates[k]) return false; gates[k] = true; return true; });
for (const k of ['unlockfan', 'statbuy', 'statmax', 'lvlfan']) assert.equal(typeof sfx[k], 'function', k);
sfx.statbuy({ n: 1 }); const f1 = calls.find(c => c[0] === 't' && c[1] > 500)[1];
for (const k in gates) delete gates[k]; calls.length = 0; sfx.statbuy({ n: 6 }); const f6 = calls.find(c => c[0] === 't' && c[1] > 500)[1];
assert.ok(f6 > f1 * 1.5, 'stat buy pitch climbs with the level');
for (const k in gates) delete gates[k]; calls.length = 0; sfx.statbuy({ n: 99 }); assert.ok(calls.every(c => Number.isFinite(c[1])), 'huge levels clamp');
for (const k in gates) delete gates[k]; calls.length = 0; sfx.statbuy(); assert.ok(calls.length > 0, 'no argument is fine');

// wired in: audio table, tab arrival, stat purchase, result level-up
assert.match(src('audio.js'), /registerB13b\(sfx, tone, noise, duck, gate\)/);
assert.match(src('unlock_ui_b12p.js'), /tabUnlockJuice\(b,/);
assert.match(src('hub2.js'), /statBuyJuice\(\$\('statList'\), d\.id/);
assert.match(src('main.js'), /levelUpJuice\(\$\('rLv'\)/);
assert.ok(/@css:36-b-juice/.test(src('index.html')) && src('index.html').indexOf('@css:36-b-juice') < src('index.html').indexOf('@css:34-phone-hub'), 'css block sits before the phone block');
assert.ok(!/—/.test(src('juice_b13b.js')), 'no em dash');
// burst helpers are safe without a DOM
assert.equal(m.burstAt(0, 0, 1), 0); assert.equal(m.floatText(0, 0, 'x'), null);

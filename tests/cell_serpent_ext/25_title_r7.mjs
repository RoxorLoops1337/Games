// Batch 7 title and onboarding: the backstage Beats chip, per-cell squeak wiring, pop sound on tutorial step 3.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { welcomeBack } from '../../cell_serpent/title12b.js';
const H = 3600000, now = 1e12;
const save = { runs: 5, cleared: 10, eggs: 1, streak: { n: 0 }, idle: { t: now - 5 * H } };
const w = welcomeBack(save, now, 30);
assert.ok(w.bits[0].includes('Beats') && w.bits[0].includes(String((40 + 12 * 10) * 5)), w.bits[0]);
assert.ok(!welcomeBack({ ...save, idle: { t: now - 0.1 * H } }, now, 30).bits.some(b => b.includes('Beats')));   // too little to mention
assert.ok(!welcomeBack(save, now, 1).bits.some(b => b.includes('Beats')));                                        // not away: no chip
assert.ok(!welcomeBack({ runs: 5, cleared: 1, eggs: 0 }, now, 30).bits.length);                                   // old save without idle
const rd = f => fs.readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');
assert.ok(/detail: \{ hit: pokeHit, x, y, (cell|i:)/.test(rd('onboard5.js')));   // the audio agent's version reports the cell as i
assert.ok(/'(cellsq|snakesqueak)'/.test(rd('main.js')));
assert.ok(/audio\.play\('(pop|tutpop)'/.test(rd('onboard12.js')) || /tutpop/.test(rd('onboard12.js')));
assert.ok(!/—/.test(rd('title12b.js') + rd('onboard12.js')));
console.log('25_title_r7 ok');

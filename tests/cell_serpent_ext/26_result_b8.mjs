// 26 result round 8: ribbon counter in the hub, best moment chip, settings glyphs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const R = await import(join(root, 'result_b8.js'));
const S = await import(join(root, 'set_icons8.js'));
const main = readFileSync(join(root, 'main.js'), 'utf8'), html = readFileSync(join(root, 'index.html'), 'utf8');

// best moment: a long chain wins over a plain finish, a short chain on a loss says nothing
R.momentReset();
const g = { t: 10 };
for (let i = 0; i < 9; i++) { g.t += 0.1; R.momentEvent({ t: 'kill' }, g); }
R.momentEvent({ t: 'hit', src: 'swab' }, g); R.momentEvent({ t: 'kill', head: true }, g);
assert.deepEqual(R.bestMoment({ won: true }), { kind: 'chain', n: 10 });
R.momentReset();
g.t = 5; R.momentEvent({ t: 'hit', src: 'tower' }, g); g.t += 0.05; R.momentEvent({ t: 'kill', head: true }, g);
assert.deepEqual(R.bestMoment({ won: true }), { kind: 'finish', src: 'tower' });
assert.equal(R.bestMoment({ won: false }), null);
assert.ok(R.momentHTML(R.bestMoment({ won: true })).includes('the Tower'));
// the sim clock jumping back means a new run: the old record is dropped
g.t = 1; R.momentEvent({ t: 'kill' }, g);
assert.equal(R.bestMoment({ won: true }), null);
assert.equal(R.bestMoment(null), null);
assert.equal(R.momentHTML(null), '');

// hold keeps the chip at the old total until released; no DOM is fine
R.holdRibbons(12); assert.equal(R.ribbonValue(20), 12); R.releaseRibbons(); assert.equal(R.ribbonValue(20), 20);
assert.equal(R.paintRibbonChip(5, null), null);
assert.equal(R.flyRibbons(null, 4, { doc: null, onLand() {} }), 0);

// every settings toggle has a glyph
for (const k of [...html.matchAll(/class="tgl" data-k="(\w+)"/g)].map(m => m[1])) assert.ok(S.SET_ICON[k], 'glyph for ' + k);

// wiring
assert.ok(/momentEvent\(e, game\)/.test(main) && /showMoment\(\$\('rMoment'\)/.test(main) && /flyRibbons\(/.test(main) && /paintRibbonChip\(save\.ribbons\)/.test(main), 'wired');
assert.ok(html.includes('id="rMoment"') && html.includes('hpwrow8'), 'markup');
// RETRY and MENU stay: the chip hides on short phones
assert.ok(/max-height:900px\)\{\.rmoment8\{display:none!important\}/.test(html), 'chip hidden on short phones');
const nd = String.fromCharCode(8212);
for (const f of ['result_b8.js', 'set_icons8.js']) assert.ok(!readFileSync(join(root, f), 'utf8').includes(nd), 'no em dash ' + f);
assert.ok(!main.includes(nd) && !html.includes(nd), 'no em dash');
console.log('26_result_b8 ok');

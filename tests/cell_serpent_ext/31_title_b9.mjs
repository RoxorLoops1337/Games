// Batch 9 title and onboarding: tune hint after 10 misses, title secrets, returning-player nudge.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TUNE, HINT_MISSES, hintLabels, nextMiss } from '../../cell_serpent/title_b8.js';
import { makeBurst, makeDuet, sideOf } from '../../cell_serpent/title_b9.js';
import { welcomeBack } from '../../cell_serpent/title12b.js';
const rd = f => fs.readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');
// numbered hint: the tune 3 2 1 3 2 1 puts "1 4" on cell 3, "2 5" on cell 2, "3 6" on cell 1
assert.equal(hintLabels(3), '1\u00b74'); assert.equal(hintLabels(2), '2\u00b75'); assert.equal(hintLabels(1), '3\u00b76'); assert.equal(hintLabels(7), '');
assert.equal(HINT_MISSES, 10);
let m = { n: 0, show: false }, shown = 0;
for (let i = 0; i < 25; i++) { m = nextMiss(m.n, false); if (m.show) shown++; }
assert.equal(shown, 2, 'the hint comes on every 10th miss');
assert.equal(nextMiss(9, true).show, false, 'never once the sticker is won');
// the original flag key must stay as it was
assert.ok(rd('title_b8.js').includes("'cell_serpent_tune13'") && TUNE.length === 6);
// secrets
const b = makeBurst(); let hit = false; for (let i = 0; i < 5; i++) hit = b.tap(i * 300); assert.ok(hit, '5 quick logo taps');
const b2 = makeBurst(); hit = false; for (let i = 0; i < 5; i++) hit = b2.tap(i * 900) || hit; assert.ok(!hit, 'slow taps do nothing');
const d = makeDuet(); assert.deepEqual(['L', 'R', 'L', 'R'].map((s, i) => d.tap(s, i * 400)), ['ok', 'ok', 'ok', 'done']);
assert.equal(d.tap('R', 5000), 'miss'); assert.equal(sideOf(10, 0, 100), 'L'); assert.equal(sideOf(80, 0, 100), 'R');
// returning player stuck before stage 3 gets a yellow-cell nudge; later players do not
assert.ok(welcomeBack({ runs: 3, cleared: 2 }, Date.now(), 0).bits.some(x => /yellow/i.test(x)));
assert.ok(!welcomeBack({ runs: 3, cleared: 5 }, Date.now(), 0).bits.some(x => /yellow/i.test(x)));
// wiring and css
assert.ok(/setupSecrets\(\$\('title'\)/.test(rd('main.js')) && /\.hn13/.test(rd('index.html')) && /\.sc9\.say/.test(rd('index.html')));
for (const f of ['title_b8.js', 'title_b9.js', 'title12b.js']) assert.ok(!/—/.test(rd(f)), f + ' has an em dash');
console.log('31_title_b9 ok');

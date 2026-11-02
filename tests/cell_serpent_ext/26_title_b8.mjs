// Batch 8 title and onboarding: the snake tune and sticker, the first-return hand.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeTune, TUNE, TUNE_GAP, wantsHand } from '../../cell_serpent/title_b8.js';
const t = makeTune(); let n = 0;
assert.deepEqual(TUNE.map(i => t.tap(i, n += 300)), ['ok', 'ok', 'ok', 'ok', 'ok', 'done']);   // the whole tune finishes
assert.equal(t.step, 0);
t.tap(TUNE[0], n += 300); t.tap(TUNE[1], n += 300);
assert.equal(t.tap(9, n += 300), 'miss');            // a wrong cell starts over
assert.equal(t.step, 0);
t.tap(TUNE[0], n += 300); assert.equal(t.step, 1);
t.tap(TUNE[1], n += TUNE_GAP + 50); assert.equal(t.step, 0);   // too slow: starts over
assert.ok(wantsHand({ runs: 3, cleared: 2 }) && !wantsHand({ runs: 0, cleared: 0 }) && !wantsHand({ runs: 9, cleared: 4 }) && !wantsHand(null));
const rd = f => fs.readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');
assert.ok(/setupTune\(\$\('title'\)/.test(rd('main.js')) && /wantsHand\(save\)/.test(rd('main.js')));
assert.ok(/#title\.hand13 #titleInfo::before/.test(rd('index.html')) && /\.stk13/.test(rd('index.html')));
assert.ok(!/—/.test(rd('title_b8.js')));
console.log('26_title_b8 ok');

// Batch 11 title: keyboard path for logo-tap and duet secrets, death coach, stage 2 hint, logo bounce.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
globalThis.window = globalThis;
const rd = f => fs.readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');
const { makeBurst, makeDuet, DUET, LOGO_TAPS } = await import('../../cell_serpent/title_b9.js');
const { logoSay, duetSay, foundSay, wordFor } = await import('../../cell_serpent/title_b11.js');
const { deathCoach, COACH_UNTIL } = await import('../../cell_serpent/coach_b11.js');

// slow (keyboard) presses never time out, pointer taps still do
const b = makeBurst(); let hit = false; for (let k = 0; k < LOGO_TAPS; k++) hit = b.tap(k * 60000, true); assert.ok(hit, 'five slow logo taps win');
const b2 = makeBurst(); hit = false; for (let k = 0; k < LOGO_TAPS; k++) hit = b2.tap(k * 60000); assert.ok(!hit, 'timed taps far apart do not');
const d = makeDuet(); assert.deepEqual(DUET.map((s, k) => d.tap(s, k * 60000, true)), ['ok', 'ok', 'ok', 'done']);
const d2 = makeDuet(); d2.tap('L', 0); assert.equal(d2.tap('R', 60000), 'miss', 'timed duet still times out');
// what is spoken
assert.equal(logoSay(2), 'Logo tap 2 of 5'); assert.equal(logoSay(5), 'Logo wave!');
assert.equal(duetSay('ok', 1, 'L'), 'Boots. Next: Cats.'); assert.equal(duetSay('ok', 2, 'R'), 'Cats. Next: Boots.');
assert.equal(duetSay('miss', 0, 'R'), 'Cats. Start again with Boots.'); assert.ok(duetSay('done', 0, 'R').includes('Duet'));
assert.ok(foundSay('logo').startsWith('Logo wave')); assert.ok(foundSay('duet').startsWith('Duet'));
assert.deepEqual([0, 1, 2, 3, -1].map(i => wordFor(i, 2)), [0, 1, 0, 1, 1]); assert.equal(wordFor(3, 0), 0);
// the death coach: new players only, reacts to the cause, quiet for close calls and wins
const base = { won: false, progress: 0.3, time: 40, picks: 2, kills: 20, chests: 1 };
assert.equal(deathCoach({ ...base, won: true }, { cleared: 0 }), ''); assert.equal(deathCoach({ ...base, mode: 'pig' }, { cleared: 0 }), '');
assert.equal(deathCoach(base, { cleared: COACH_UNTIL }), '', 'veterans get no coaching');
assert.equal(deathCoach({ ...base, progress: 0.8 }, { cleared: 0 }), '', 'close calls keep the old line');
assert.ok(/yellow/.test(deathCoach({ ...base, picks: 0 }, { cleared: 1 })));
assert.ok(/fast/.test(deathCoach({ ...base, time: 15, kills: 3 }, { cleared: 1 })));
assert.ok(/chest/.test(deathCoach({ ...base, chests: 0, picks: 1, progress: 0.5 }, { cleared: 1 })));
assert.ok(/upgrade/i.test(deathCoach(base, { cleared: 1 })));
const lines = [{ ...base, picks: 0 }, { ...base, time: 15, kills: 3 }, base].map(r => deathCoach(r, { cleared: 1 })); assert.equal(new Set(lines).size, 3);
// wiring and text rules
const main = rd('main.js');
assert.ok(/setupTitle11\(\$\('title'\)\)/.test(main) && /deathCoach\(r, save\) \|\| lossHint/.test(main));
assert.ok(/logo\._kb/.test(rd('title_b9.js')) && /hero\._kb/.test(rd('title_b9.js')));
assert.ok(rd('index.html').includes('#title .kb11') && /stage === 2 && g\.level === 1/.test(rd('hints.js')));
for (const f of ['title_b11.js', 'coach_b11.js', 'hints.js', 'title_b9.js']) assert.ok(!/—/.test(rd(f)), f + ' em dash');
console.log('33_title_b11 ok');

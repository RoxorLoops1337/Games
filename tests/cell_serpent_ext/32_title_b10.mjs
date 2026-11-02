// Batch 10 title: secrets counter, keyboard tune path, coach line.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
globalThis.window = globalThis;
const { SECRET_IDS, secretsFound, markSecret, allSecrets, secretLabel, keyCell, keySay } = await import('../../cell_serpent/title_b10.js');
const { TUNE } = await import('../../cell_serpent/title_b8.js');
const { coachLine, welcomeBack, welcomeHTML } = await import('../../cell_serpent/title12b.js');
const { stickerState, STICKERS } = await import('../../cell_serpent/sticker_b9.js');
const sim = await import('../../cell_serpent/sim.js');
const rd = f => fs.readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');

// counter: three secrets, tune lives in its own old key
assert.deepEqual(SECRET_IDS, ['tune', 'logo', 'duet']);
assert.equal(secretsFound().length, 0);
assert.ok(markSecret('logo')); assert.ok(!markSecret('logo'), 'marking twice changes nothing'); assert.ok(!markSecret('nope'));
store.cell_serpent_tune13 = '1';
assert.deepEqual(secretsFound(), ['tune', 'logo']);
assert.ok(!allSecrets()); markSecret('duet'); assert.ok(allSecrets());
assert.equal(secretLabel(1), 'Secrets found: 1 of 3'); assert.equal(secretLabel(3), 'All secrets found');
store.cell_serpent_sec13 = 'garbage'; assert.deepEqual(secretsFound(), ['tune'], 'a corrupt key is ignored');
// the Stats sticker book has the Secret Keeper sticker, secret, unlocked only with all three
assert.ok(STICKERS.some(t => t.id === 'keeper' && t.secret));
const sv = sim.defaultSave();
store.cell_serpent_sec13 = '["logo"]'; assert.ok(!stickerState(sv, { tune: true }).find(t => t.id === 'keeper').got);
store.cell_serpent_sec13 = '["logo","duet"]'; assert.ok(stickerState(sv, { tune: true }).find(t => t.id === 'keeper').got);
// keyboard path walks the tune and wraps
assert.deepEqual([0, 1, 2, 3, 4, 5].map(keyCell), TUNE); assert.equal(keyCell(6), TUNE[0]); assert.equal(keyCell(-1), TUNE[5]);
assert.equal(keySay(0), 'Note 1 of 6'); assert.equal(keySay(6), 'Tune finished');
// coach line: only for players still before stage 2, changes with the number of runs, no em dash
assert.equal(coachLine({ runs: 0 }), ''); assert.equal(coachLine({ runs: 2, cleared: 5 }), '');
const lines = [1, 2, 3, 9].map(r => coachLine({ runs: r, cleared: 0 })); assert.ok(lines.every(Boolean));
assert.notEqual(lines[0], lines[1]); assert.equal(lines[2], lines[3]);
assert.ok(welcomeHTML(welcomeBack({ runs: 1, cleared: 0 }, Date.now(), 0)).includes('wb12-c'));
assert.ok(!welcomeHTML(welcomeBack({ runs: 1, cleared: 4 }, Date.now(), 0)).includes('wb12-c'));
// slow keyboard presses never time out
const { makeTune } = await import('../../cell_serpent/title_b8.js');
const slow = makeTune(); assert.deepEqual(TUNE.map((c, k) => slow.tap(c, k * 60000, true)), ['ok', 'ok', 'ok', 'ok', 'ok', 'done']);
const fast = makeTune(); assert.equal(fast.tap(3, 0), 'ok'); assert.equal(fast.tap(2, 60000), 'miss', 'pointer taps still time out');
// wiring
assert.ok(/setupTitle10\(\$\('title'\)/.test(rd('main.js')));
assert.ok(/secretfound/.test(rd('title_b9.js')) && /sec10/.test(rd('index.html')) && /kb10/.test(rd('index.html')));
assert.ok(rd('title_b8.js').includes("'cell_serpent_tune13'"), 'old tune key unchanged');
for (const f of ['title_b10.js', 'title12b.js', 'title_b9.js']) assert.ok(!/—/.test(rd(f)), f + ' em dash');
assert.ok(!/—/.test(rd('index.html').split('round 10: secrets chip')[1]), 'css em dash');
console.log('32_title_b10 ok');

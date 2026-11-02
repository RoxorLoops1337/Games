// 33 QA round 11: damaged values in the small localStorage keys never break the reads (best time, best progress, sticker book, title secrets)
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => store.delete(k) };
const B = await import(join(root, 'screen_b10.js'));
const T = await import(join(root, 'title_b10.js'));
const S = await import(join(root, 'sticker_b9.js'));
const { defaultSave } = await import(join(root, 'sim.js'));

const TIME = 'cell_serpent_best_time_b10', PROG = 'cell_serpent_best_prog_b10';
// 1) best progress: a huge, negative or text value reads as a sane percent
store.set(PROG, JSON.stringify({ s3: 500, s4: -7, s5: 'abc', s6: 42.4, h3: null }));
assert.equal(B.bestProg(3, false), 100, 'a huge stored percent is clamped to 100');
assert.equal(B.bestProg(4, false), 0);
assert.equal(B.bestProg(5, false), 0);
assert.equal(B.bestProg(6, false), 42);
assert.equal(B.bestProg(3, true), 0);
// 2) best time: negative, text or infinite times count as no time, and a real clear then replaces them
store.set(TIME, JSON.stringify({ s3: -5, s4: 'x', s5: 1e999, s6: 70 }));
assert.equal(B.bestTime(3, false), 0); assert.equal(B.bestTime(4, false), 0); assert.equal(B.bestTime(5, false), 0); assert.equal(B.bestTime(6, false), 70);
assert.deepEqual(B.recordTime(3, false, 55), { prev: 0, best: false });
assert.equal(B.bestTime(3, false), 55, 'a good time replaces a damaged one');
// 3) an array stored where an object belongs must still persist new records (an array would drop its string keys on save)
let round;
for (const bad of ['[]', '[1,2]', 'null', '5', '"x"', 'true', '{{{', '']) {
  store.set(PROG, bad); store.set(TIME, bad);
  const st = 20 + (round = (typeof round === 'number' ? round + 1 : 1));   // fresh stage each round so the in-memory fallback cannot hide a miss
  B.recordProg(st, false, 61); B.recordTime(st, false, 33);
  const saved = JSON.parse(store.get(PROG)), savedT = JSON.parse(store.get(TIME));
  assert.ok(!Array.isArray(saved) && saved['s' + st] === 61, 'progress persisted over ' + bad);
  assert.ok(!Array.isArray(savedT) && savedT['s' + st] === 33, 'time persisted over ' + bad);
}
// 4) title secrets and the sticker book survive any stored value
const junk = ['null', '[]', '{}', '5', '"x"', 'true', '{{{', '', '[1e999]', '["tune","logo","bogus",5]', '{"a":1}', '-1'];
for (const v of junk) {
  store.set('cell_serpent_sec13', v); store.set('cell_serpent_stk9', v); store.set('cell_serpent_stk9_prize', v);
  const found = T.secretsFound();
  assert.ok(Array.isArray(found) && found.every(id => T.SECRET_IDS.includes(id)), 'secrets over ' + v);
  assert.equal(T.markSecret('nope'), false);
  const list = S.stickerState(defaultSave(), { tune: false });
  assert.ok(list.length > 0 && list.every(t => typeof t.got === 'boolean'), 'stickers over ' + v);
  assert.equal(typeof S.prizeClaimed(), 'boolean');
}
console.log('ok 33_qa_b11');

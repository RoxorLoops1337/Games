// Round 10 hub: records card, sticker book prize, gear set strip, shop savings line.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const h = await import(join(root, 'hub_b10.js'));
const stk = await import(join(root, 'sticker_b9.js'));

// records
const s = sim.defaultSave(); s.cleared = 14; s.best = 20; s.runs = 7; s.kills = 12345; s.stars = { 1: 3, 2: 2, 3: 3 }; s.hardCleared = 1;
const rec = Object.fromEntries(h.recordsOf(s).map(r => [r.id, r.val]));
assert.equal(rec.best, 20); assert.equal(rec.runs, 7); assert.equal(rec.pops, 12345); assert.equal(rec.gold, 2); assert.equal(rec.hot, 1);
assert.equal(h.recordsOf(s).length, 8, 'eight record chips');
assert.equal(h.shortNum(950), '950'); assert.equal(h.shortNum(12345), '12.3k'); assert.equal(h.shortNum(120000), '120k');
assert.ok(h.recordsHTML(sim.defaultSave()).includes('zero'), 'a fresh save shows dim zero chips');
assert.ok(h.recordsOf(sim.defaultSave()).every(r => r.val >= 0));

// sticker book prize
assert.equal(stk.STICKER_PRIZE, 25);
const all = stk.stickerState(sim.defaultSave()), none = all.map(t => ({ ...t, got: true }));
assert.ok(!stk.bookDone(all) && stk.bookDone(none) && !stk.bookDone([]), 'bookDone needs every sticker');
assert.equal(stk.prizeClaimed(), false, 'no localStorage means not claimed, no throw');

// set strip
const lv = k => (k.id === sim.KEEPSAKES.find(q => q.set === 'snack').id ? 1 : 0);
const st = h.setStripState(sim.KEEPSAKES, sim.KEEP_SETS, lv);
assert.equal(st.length, sim.KEEP_SETS.length);
assert.ok(st.every(t => !t.full && t.total > 0));
assert.equal(st.find(t => t.id === 'snack').have, 1);
const fullSt = h.setStripState(sim.KEEPSAKES, sim.KEEP_SETS, () => 1);
assert.ok(fullSt.every(t => t.full), 'all owned means every bonus active');
const TXT = { atk: v => 'a' + v, guard: v => 'g' + v, coin: v => 'c' + v };
assert.ok(h.setStripHTML(fullSt, TXT).includes('sbchip on'), 'active chip has the on class');

// shop savings
const deals = [{ base: 30, price: 6 }, { base: 0, price: 0 }, { base: 20, price: 10 }];
assert.deepEqual(h.treatSavings(deals, {}), { left: 3, save: 34 });
assert.deepEqual(h.treatSavings(deals, { 0: true }), { left: 2, save: 10 });
assert.equal(h.treatLine(deals, {}), '3 treats left, save 34');
assert.equal(h.treatLine(deals, { 0: true, 1: true, 2: true }), 'All treats eaten, see you tomorrow');
assert.equal(h.treatLine([{ base: 0, price: 0 }], {}), '1 treat left');

// wiring, css, no em dash
const hub = readFileSync(join(root, 'hub2.js'), 'utf8'), html = readFileSync(join(root, 'index.html'), 'utf8');
for (const f of ['recordsHTML(s)', 'setStripHTML(', 'treatLine(deals', 'renderStickerBook(bk, s,']) assert.ok(hub.includes(f), 'hub2 uses ' + f);
assert.ok(html.includes('/* @css:10-hub round 10 */') && html.includes('.stkprize') && html.includes('.setstrip'), 'css block present');
for (const f of ['hub_b10.js', 'sticker_b9.js']) assert.ok(!readFileSync(join(root, f), 'utf8').includes('—'), 'no em dash in ' + f);
console.log('32_hub_b10 ok');

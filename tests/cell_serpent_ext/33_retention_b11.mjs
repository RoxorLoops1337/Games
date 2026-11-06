// Round 11 retention: badge shelf, badge seen mask, ready nudges, season next gift.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const b = await import(join(root, 'badges_b11.js'));
const ND = String.fromCharCode(0x2014);

assert.equal(sim.defaultSave().addict.bs, 0);
assert.equal(sim.sanitizeSave({ addict: { bs: 9999 } }).addict.bs, 63, 'clamped');
assert.equal(sim.sanitizeSave({ addict: { bs: 'x' } }).addict.bs, 0);
assert.equal(sim.sanitizeSave({ addict: { bs: -4 } }).addict.bs, 0);
assert.equal(sim.sanitizeSave({}).addict.bs, 0, 'old saves load');

assert.deepEqual(b.BADGE_IDS, sim.WEEK_DEFS.map(d => d.id), 'one badge per weekly kind');
const s = sim.defaultSave();
assert.equal(b.newBadges(s).length, 0);
s.addict.wb = { cells: 2, wins: 1 };
assert.deepEqual(b.newBadges(s), ['cells', 'wins']);
b.markBadgesSeen(s); assert.equal(b.newBadges(s).length, 0);
const html = b.shelfHTML(s, 'runs');
s.addict.wb.bombs = 1; assert.deepEqual(b.newBadges(s), ['bombs'], 'only the fresh one');
assert.equal(sim.sanitizeSave(JSON.parse(JSON.stringify(s))).addict.bs, s.addict.bs, 'mask survives a save');

for (const id of b.BADGE_IDS) assert.ok(html.includes(b.BADGE_INFO[id].how) || html.includes(b.BADGE_INFO[id].name), id);
assert.ok(html.includes('Earned 2 times') && html.includes('NEW') === false, 'seen badges carry no NEW tag');
assert.ok(html.includes('This week'));
s.addict.wb.picks = 1;
assert.ok(b.shelfHTML(s, 'runs').includes('NEW'));
const row = b.rowHTML(s, 'runs');
assert.ok(row.includes('wbopen') && row.includes('Popper'));
assert.equal(b.medalURL('cells', true), '', 'headless bake returns empty, shelf falls back to an emoji');
assert.ok(row.includes('medal fb'));

// nudge: only when something is ready, once per thing
const day = 20500;
const sp = sim.defaultSave(); sp.addict.spin = { day: day - 1, prize: 0, n: 2, shield: 0 };
const n2 = b.readyNudge(sp, day, 1, new Set());
assert.ok(n2 && /Spin/.test(n2.text), 'spin ready nudges');
assert.equal(b.readyNudge(sp, day, 1, new Set([n2.key])), null, 'said once, not again');
const done = sim.defaultSave(); done.addict.spin = { day, prize: 0, n: 2, shield: 0 };
assert.equal(b.readyNudge(done, day, 1, new Set()), null, 'nothing ready, no nudge');

// wiring + hygiene
const idx = readFileSync(join(root, 'index.html'), 'utf8'), ui = readFileSync(join(root, 'addict_ui.js'), 'utf8'), mn = readFileSync(join(root, 'main.js'), 'utf8');
assert.ok(idx.includes('@css:33-retain-b11') && ui.includes('openShelf') && mn.includes('hubNudge'));
assert.ok(!readFileSync(join(root, 'badges_b11.js'), 'utf8').includes(ND), 'no em dash');

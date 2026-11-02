// Round 9 hub: sticker book rules, gear ceremony text, shop clock and snack flavour lines.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const shop = await import(join(root, 'shop_b8.js'));

// ceremony text (gear_fx has no DOM needs at import time)
const gear = await import(join(root, 'gear_fx.js'));
assert.equal(gear.ceremonyText(1, 5, true), 'COLLECTED!');
assert.equal(gear.ceremonyText(3, 5, false), 'LEVEL 3!');
assert.equal(gear.ceremonyText(5, 5, false), 'MAX LEVEL!');

// sticker rules need a localStorage-less environment: hasSticker catches the missing global
const stk = await import(join(root, 'sticker_b9.js'));
const ids = stk.STICKERS.map(t => t.id);
assert.equal(new Set(ids).size, ids.length, 'sticker ids are unique');
assert.ok(stk.STICKERS.some(t => t.secret) && stk.STICKERS.some(t => !t.secret), 'some stickers are secret, some are not');
assert.ok(ids.includes('tune'), 'the title snake tune is a sticker');
const fresh = sim.defaultSave();
assert.equal(stk.stickerState(fresh).filter(t => t.got).length, 0, 'a fresh save has no stickers');
assert.ok(stk.stickerState(fresh, { tune: true }).find(t => t.id === 'tune').got, 'tune flag unlocks the tune sticker');
const rich = sim.defaultSave(); rich.runs = 5; rich.cleared = 12; rich.kills = 3000; rich.beats = 20000; rich.hardCleared = 1; rich.keeps.milk.lv = 1;
const got = stk.stickerState(rich).filter(t => t.got).map(t => t.id);
for (const id of ['gig', 'three', 'ten', 'pop', 'pig', 'hot', 'milk']) assert.ok(got.includes(id), 'unlocks ' + id);
assert.ok(!got.includes('half'), 'half way needs 25 clears');
for (const t of stk.STICKERS) assert.ok(!/—/.test(t.name + t.hint), 'no em dash in ' + t.id);

// shop clock
assert.equal(shop.clockText(3661), '01:01:01');
assert.ok(shop.secsToMidnight(new Date(2026, 5, 1, 23, 30, 0)) < shop.URGENT_SEC, 'late evening is urgent');
assert.ok(shop.secsToMidnight(new Date(2026, 5, 1, 12, 0, 0)) > shop.URGENT_SEC, 'noon is calm');
for (const k of ['frag', 'keep', 'egg', 'energy', 'sparkles', 'beats']) assert.ok(shop.SNACK_DESC[k], 'snack line for ' + k);

// wiring and em dash scan
const hub = readFileSync(join(root, 'hub2.js'), 'utf8');
assert.ok(hub.includes('renderStickerBook('), 'Stats renders the sticker book');
assert.ok(hub.includes('keepCeremony('), 'gear level up runs the ceremony');
assert.ok(hub.includes('tickTreats('), 'shop clock ticks');
for (const f of ['sticker_b9.js', 'gear_fx.js', 'shop_b8.js', 'hub2.js']) assert.ok(!readFileSync(join(root, f), 'utf8').includes('—'), 'no em dash in ' + f);

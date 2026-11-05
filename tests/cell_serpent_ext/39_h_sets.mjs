// batch 16 agent h: pet pair bonuses, gear encore, pet stories
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import * as sim from '../../cell_serpent/sim.js';
import * as S from '../../cell_serpent/sets_b16h.js';
const read = f => readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');
const html = read('index.html');
const i = html.indexOf('/* @css:39-h-sets */'), j = html.indexOf('/* end @css:39-h-sets */'), k = html.indexOf('/* @css:34-phone-hub */');
assert.ok(i > 0 && j > i && j < k, 'css block before the phone-hub block');
for (const t of [html.slice(i, j), read('sets_b16h.js'), read('sets_ui_b16h.js')]) assert.ok(!t.includes('—'), 'no em dash');

// every pet is in exactly one pair, pair stats exist, stories have three chapters
const ids = sim.PETS.map(p => p.id), used = S.PET_SETS.flatMap(s => s.pets);
assert.deepEqual(used.slice().sort(), ids.slice().sort(), 'each pet in one pair');
for (const id of ids) assert.equal(S.PET_STORIES[id].length, 3, 'story ' + id);
for (const s of S.PET_SETS) assert.ok(s.stat in sim.petBonus({}), 'stat ' + s.stat);

// bonus: asleep below 3 stars, awake at 3, encore at 5, small and capped
const zero = sim.petBonus({ piglet: 3, lamb: 2 }), awake = sim.petBonus({ piglet: 3, lamb: 3 }), enc = sim.petBonus({ piglet: 5, lamb: 5 });
assert.ok(Math.abs((awake.coin - sim.PETS.find(p => p.id === 'piglet').per * 3) - 0.03) < 1e-9, 'awake pair adds 3 percent Beats');
assert.ok(Math.abs((enc.coin - 0.08 * 5) - 0.06) < 1e-9, 'encore doubles it');
assert.equal(zero.coin, 0.08 * 3, 'no pair bonus when one friend is short');
const maxAll = sim.petBonus(Object.fromEntries(ids.map(id => [id, 5])));
assert.ok(maxAll.coin <= 0.08 * 5 + 0.061 && maxAll.crit <= 0.02 * 5 + 0.017 && maxAll.vit <= 18 * 5 + 24.1, 'capped');
assert.equal(S.petSetWoke({ piglet: 2, lamb: 3 }, { piglet: 3, lamb: 3 }).length, 1, 'woke detects the star that wakes a pair');
assert.equal(S.petSetWoke({ piglet: 3, lamb: 3 }, { piglet: 3, lamb: 4 }).length, 0);

// gear encore: all members at Lv5 adds half the set value once
const lv = Object.fromEntries(sim.KEEPSAKES.map(k2 => [k2.id, 1])), base = sim.keepBonus(lv).atk;
for (const k2 of sim.KEEPSAKES.filter(q => q.set === 'stage')) lv[k2.id] = 5;
const withEnc = sim.keepBonus(lv).atk;
const raw = sim.KEEPSAKES.reduce((a, q) => a + (q.stat === 'atk' ? q.per * lv[q.id] : 0), 0) + 0.1;
assert.ok(Math.abs(withEnc - (raw + 0.05)) < 1e-9, 'encore adds half the set bonus');
lv.stand = 4; assert.ok(Math.abs(sim.keepBonus(lv).atk - (raw - 0.02 + 0.05 * 0 - 0)) < 1e-9, 'one short: no encore');

// markup
const st = S.storyState('kitten', 3); assert.deepEqual(st.map(c => c.open), [true, true, false]);
assert.ok(S.storyHTML('kitten', 0).includes('Chapter 1 opens at 1 star'));
const strip = S.petSetsStripHTML({ piglet: 3, lamb: 1 }, id => `<b>${id}</b>`);
assert.equal((strip.match(/class="pschip/g) || []).length, 3); assert.ok(strip.includes('data-pet="lamb"'), 'chip opens the friend that needs stars');
assert.ok(S.petSetCardHTML('turtle', { puppy: 5, turtle: 5 }, id => id).includes('ENCORE'));
assert.ok(S.encoreLine(0.1, 'atk', 5).startsWith('ENCORE') && S.encoreLine(0.1, 'atk', 2).includes('Lv 5'));
// wiring
assert.ok(read('main.js').includes('petSetsStripHTML') && read('skill_sheet.js').includes('storyHTML') && read('hub2.js').includes('encoreLine') && read('gear_fx.js').includes('encoreLine'));
console.log('39_h_sets ok');

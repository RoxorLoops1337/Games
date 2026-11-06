// 07-cards batch 9: counter cards read as counters, partner glow on the band strip, better-roll mark after a reroll.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PASSIVES } from '../../cell_serpent/sim.js';
import { COUNTERS, kindLabel, synergyHint, capIconURL } from '../../cell_serpent/card_icons.js';
import { passiveStat, partnerIds, markPartners, betterRoll, cardMeter } from '../../cell_serpent/cards_ui.js';

const g = { level: 9, stage: 22, ups: { crit: 2, cdmg: 1, brk: 1 }, weap: {}, rerolls: 2 };
const brk = PASSIVES.find(u => u.id === 'brk'), hbk = PASSIVES.find(u => u.id === 'hbk');
const card = (u, gain) => ({ id: u.id, kind: 'passive', name: u.name, u, lvl: 0, max: u.max, isNew: true, rarity: 1, gain });

// counter cards: COUNTER label, a stat that counts the shield DOWN, a hint that names the snake
assert.equal(kindLabel(card(brk, 25)), 'COUNTER');
assert.equal(kindLabel(card(hbk, 25)), 'COUNTER');
assert.equal(kindLabel({ kind: 'passive', id: 'power' }), 'BOOST', 'ordinary boosts keep their label');
assert.equal(passiveStat({ ups: {}, weap: {} }, card(brk, 25)), 'Frost shield: 100% → 75%');
assert.equal(passiveStat({ val: { brk: 25 }, ups: {}, weap: {} }, card(brk, 50)), 'Frost shield: 75% → 25%', 'stacks with what you already have');
assert.equal(passiveStat({ val: { hbk: 75 }, ups: {}, weap: {} }, card(hbk, 25)), 'Heart heal: 25% → none');
assert.ok(/^(.*?):?\s*([^:→]+?)\s*→\s*(.+)$/.test(passiveStat(g, card(hbk, 25))), 'main.js delta regex still splits it');
assert.ok(synergyHint(g, card(brk, 25)).includes('Frosty'));
assert.ok(synergyHint(g, card(hbk, 25)).includes('Love-Struck'));
assert.deepEqual(Object.keys(COUNTERS).sort(), ['brk', 'hbk', 'hny', 'hwd', 'mir', 'muf', 'oil', 'swt', 'tea', 'tis']);
for (const id of ['brk', 'hbk']) { assert.ok(capIconURL(id).length > 400, id + ' icon exists'); assert.ok(!/—/.test(decodeURIComponent(capIconURL(id)))); }
{ const m = cardMeter({ ups: {}, weap: {} }, card(brk, 25)); assert.ok(m && m.b > 0, 'ghost bar shows for a counter card'); }

// partner glow: owning the other half of a chain lights that chip
const ids = partnerIds(g, [{ id: 'crit' }, { id: 'aspd' }]);
assert.ok(ids.has('cdmg') && !ids.has('crit'), 'crit card lights the Volume Up chip');
assert.equal(partnerIds({ ups: {} }, [{ id: 'crit' }]).size, 0, 'nothing owned, nothing glows');
assert.equal(partnerIds(null, null).size, 0);
{
  const chips = ['crit', 'cdmg'].map(id => { const s = new Set(); return { dataset: { id }, classList: { toggle: (c, on) => (on ? s.add(c) : s.delete(c)), has: c => s.has(c) } }; });
  const strip = { querySelectorAll: () => ({ forEach: f => chips.forEach(f) }) };
  assert.equal(markPartners(strip, new Set(['cdmg'])), 1);
  assert.ok(chips[1].classList.has('par') && !chips[0].classList.has('par'));
  assert.equal(markPartners(null, ids), 0, 'null strip is harmless');
}

// better roll: only cards above the old best get the pill
{
  const made = [];
  const els = [0, 2, 1].map(r => ({ className: 'card pick c-passive r' + r, classList: { add: c => made.push(c) }, insertAdjacentHTML: (w, h) => made.push(h) }));
  assert.equal(betterRoll({ children: els }, 1), 1, 'only the Epic card beats the old Rare best');
  assert.ok(made.some(h => String(h).includes('BETTER')));
  assert.equal(betterRoll({ children: els.slice(0, 1) }, 0), 0, 'Common is never better');
  assert.equal(betterRoll(null, 1), 0);
}

// source and css pins
const html = readFileSync(new URL('../../cell_serpent/index.html', import.meta.url), 'utf8');
const css = html.slice(html.indexOf('/* @css:07-cards round 9 */'), html.indexOf('/* end @css:07-cards round 9 */'));
assert.ok(css.length > 600, 'round 9 css block exists');
assert.ok(/\.ic \.newtag\{position:absolute/.test(css) && /\.bi\.par/.test(css) && /\.bet\{/.test(css));
assert.ok(/prefers-reduced-motion/.test(css), 'motion respects reduced motion');
assert.ok(!/—/.test(css), 'no em dash');
const main = readFileSync(new URL('../../cell_serpent/main.js', import.meta.url), 'utf8');
assert.ok(main.includes('markPartners(') && main.includes('betterRoll(') && /newtag">NEW<\/span>' : ''\}<\/div>/.test(main), 'main wires partners, better roll and the icon NEW tag');
console.log('07_cards_b9 ok');

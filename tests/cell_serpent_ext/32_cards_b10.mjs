// Batch 10, 07-cards: counter icons fit their frame, links between offered cards, a locked card survives a reroll,
// the reroll odds chip, the pick burst. Display helpers only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const B = await import(join(root, 'cards_b10.js'));
const I = await import(join(root, 'card_icons.js'));

// icons: every drawn coordinate sits inside the -20..20 viewBox (the Oil Can spout used to be cut off)
for (const id of ['oil', 'swt', 'tis']) {
  const svg = decodeURIComponent(I.capIconURL(id));
  assert.ok(svg.includes('<svg'), id + ' has an icon');
  const nums = [...svg.matchAll(/(?:M|L|H|V|Q|q|h|v|l|C|c)\s?(-?[\d.]+)/g)].map(m => Math.abs(+m[1]));
  assert.ok(nums.every(n => n <= 20), id + ' stays inside the frame');
}
const oilBody = decodeURIComponent(I.capIconURL('oil'));
assert.ok(/M7 4 L13 -6 H16/.test(oilBody), 'oil can has its spout inside the frame');
assert.ok(!/M-6 -2 Q-8 -10/.test(decodeURIComponent(I.capIconURL('tis'))), 'tissue box no longer draws the bunny-ear tissues');

// links between offered cards
const mk = id => ({ id, rarity: 0 });
let links = B.offeredLinks({ ups: {} }, [mk('notes'), mk('burst'), mk('vital')]);
assert.deepEqual(links.map(l => [l.a, l.b, l.name]), [[0, 1, 'Echo Chamber']]);
links = B.offeredLinks({ ups: { crit: 1 } }, [mk('cdmg'), mk('vital'), mk('haste')]);
assert.deepEqual(links.map(l => [l.a, l.b]), [[0, -1]], 'a card linking only with an owned upgrade has no partner slot');
assert.deepEqual(B.offeredLinks({ ups: {} }, [mk('vital'), mk('guard'), mk('speed')]), []);

// markLinks puts the pill on both cards (minimal fake DOM)
const fake = id => { const cl = new Set(); return { cl, id, html: '', classList: { add: c => cl.add(c), toggle: (c, on) => on ? cl.add(c) : cl.delete(c) }, insertAdjacentHTML(_, h) { this.html += h; } }; };
const cards = { children: [fake('a'), fake('b'), fake('c')], classList: { toggle() {} } };
assert.equal(B.markLinks(cards, [{ a: 0, b: 2, name: 'Tight Groove' }]), 1);
assert.ok(cards.children[0].html.includes('Tight Groove') && cards.children[0].html.includes('3'), 'card 1 names the chain and partner number');
assert.ok(cards.children[2].html.includes('1') && cards.children[2].cl.has('linked'));
assert.ok(!cards.children[1].cl.has('linked'));

// lock: the locked card stays in its slot after a reroll, never twice on the table
B.lockState.i = 1; B.lockState.keep = false;
const prev = [mk('crit'), mk('aspd'), mk('vital')];
let next = [mk('power'), mk('haste'), mk('speed')];
assert.equal(B.keepLocked(next, prev), true);
assert.equal(next[1], prev[1], 'locked card is back in slot 2');
assert.equal(B.lockState.keep, true);
B.lockState.i = 1; B.lockState.keep = false;
next = [mk('aspd'), mk('haste'), mk('speed')];
const dealt0 = next[0];
B.keepLocked(next, prev);
assert.equal(next.filter(c => c.id === 'aspd').length, 1, 'a duplicate of the locked card is swapped out');
assert.equal(next[0].id, 'haste', 'slot 1 took the card the lock displaced');
assert.equal(dealt0.id, 'aspd');
assert.equal(next[1].id, 'aspd');
B.lockState.i = -1; assert.equal(B.keepLocked(next, prev), false, 'no lock, nothing kept');
assert.ok(B.lockHTML(2).includes('data-i="2"') && !B.lockHTML(2).includes(' on'));
B.lockState.i = 2; assert.ok(B.lockHTML(2).includes('lockb on'));
B.lockState.i = -1;

// odds chip: more cards or more luck means a likelier top rarity; very unlikely deals are flagged lucky
assert.ok(B.dealChance(0, 2, 3) > B.dealChance(0, 2, 1));
assert.ok(B.dealChance(8, 2, 3) > B.dealChance(0, 2, 3));
assert.equal(B.dealChance(5, 0, 3), 1);
const g = { level: 1, stage: 1 };
const chipCommon = B.dealChipHTML(g, [{ rarity: 0 }, { rarity: 0 }, { rarity: 0 }]);
assert.ok(chipCommon.includes('nothing special'));
const chipGod = B.dealChipHTML(g, [{ rarity: 0 }, { rarity: 5 }, { rarity: 0 }]);
assert.ok(chipGod.includes('LUCKY') && chipGod.includes('GODLIKE') && /<1%|\d%/.test(chipGod));
assert.equal(B.dealChipHTML(g, []), '');

// pick burst: sparks scale with rarity, and it fails soft without a DOM
assert.equal(B.pickBurst(null, '#fff', 0), 0);
const made = [];
globalThis.document = { createElement: () => { const e = { style: {}, className: '', setAttribute() {}, remove() {} }; made.push(e); return e; }, body: { appendChild() {} } };
const ic = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 40, height: 40 }), classList: { remove() {}, add() {} }, get offsetWidth() { return 1; } };
const n0 = B.pickBurst({ querySelector: () => ic }, '#fff', 0), n5 = B.pickBurst({ querySelector: () => ic }, '#ffe14a', 5);
assert.ok(n5 > n0 && n0 >= 8, 'a Godlike pick throws more sparks');
assert.ok(made[0].innerHTML.includes('--dx'), 'burst sparks carry their flight vector');
delete globalThis.document;

// wiring in main.js and css
const main = readFileSync(join(root, 'main.js'), 'utf8'), html = readFileSync(join(root, 'index.html'), 'utf8');
assert.ok(/keepLocked\(g\.choices, prevC\)/.test(main) && /pickBurst\(el/.test(main) && /markLinks\(wrap/.test(main) && /dealChipHTML\(g, g\.choices\)/.test(main));
assert.ok(/@css:07-cards round 10/.test(html) && /\.pbur s\{/.test(html) && /\.lockb\.on/.test(html));

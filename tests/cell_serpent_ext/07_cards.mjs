// 07-cards: pick screen markup and CSS hooks stay in place.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const html = readFileSync(join(root, 'index.html'), 'utf8'), main = readFileSync(join(root, 'main.js'), 'utf8');
assert.ok(html.includes('/* @css:07-cards */') && html.includes('/* end @css:07-cards */'));
for (const k of ['dealin', 'shine', 'rays', 'cpop', 'lvflash', 'prefers-reduced-motion']) assert.ok(html.includes(k), k);
for (let r = 0; r <= 5; r++) assert.ok(main.includes("' r' + rn"), 'rarity class');
assert.ok(main.includes("'123'.includes(e.key)"), 'keyboard 1-3 kept');
assert.ok(main.includes('pickLock'), 'double pick guard');
assert.ok(!(html + main).includes('—'), 'no em dash');

// round 2: sounds, odds hint, refresh pips, build strip
const ui = await import('../../cell_serpent/cards_ui.js');
assert.ok(main.includes("audio.play('card' + mr)") && main.includes("audio.play('card' + pr)"), 'rarity sounds wired');
assert.ok(main.includes("'stinger'"), 'stinger wired');
const o0 = ui.oddsAtLeast(0), o1 = ui.oddsAtLeast(20);
assert.ok(o1[0] > o0[0] && o1[2] > o0[2], 'luck raises odds');
assert.ok(o0[0] > o0[1] && o0[1] > o0[2], 'odds fall by tier');
assert.equal(ui.refreshPips({ rerolls: 3 }).split('class="on"').length - 1, 3, 'pips');
const gg = { level: 5, stage: 4, ups: { aspd: 2 }, weap: { swab: { lv: 2 } }, rerolls: 4 };
assert.ok(ui.buildHTML(gg, id => id).includes('2'), 'build strip');
assert.ok(ui.luckHTML(gg).includes('Rare+'), 'luck html');
assert.ok(html.includes('id="buildStrip"') && html.includes('id="luckBox"'), 'markup');

// round 3: distinct capsule icons, kind label, synergy hints, compact button row
const ci = await import('../../cell_serpent/card_icons.js');
const urls = ['aspd', 'notes', 'burst', 'cdmg'].map(ci.capIconURL);
assert.ok(urls.every(u => u.startsWith('data:image/svg+xml')) && new Set(urls).size === 4, 'four distinct capsule icons');
assert.equal(ci.capIconURL('swab'), '', 'other ids untouched');
assert.equal(ci.kindLabel({ kind: 'weapon' }), 'SKILL');
const sg = { ups: { power: 1, notes: 1 }, weap: { swab: { lv: 1 }, daggers: { lv: 1 } } };
assert.ok(ci.synergyHint(sg, { kind: 'passive', id: 'power', lvl: 0, max: 8 }).includes('2'), 'boost hint');
assert.ok(ci.synergyHint(sg, { kind: 'capsule', id: 'burst', lvl: 0, max: 3 }).includes('Harmony'), 'echo hint');
assert.equal(ci.synergyHint(sg, { kind: 'capsule', id: 'aspd', lvl: 11, max: 12 }), 'LAST LEVEL');
assert.ok(html.includes('class="lvrow"') && html.includes('@css:07-cards round 3'), 'button row');
assert.ok(main.includes('synergyHint(g, c)'), 'synergy wired');

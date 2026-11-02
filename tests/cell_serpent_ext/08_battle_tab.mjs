// Battle tab markup and CSS marker checks (agent 08)
import assert from 'node:assert';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../../cell_serpent/index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../../cell_serpent/main.js', import.meta.url), 'utf8');
for (const id of ['btHero', 'stCanvas', 'stPortrait', 'stBadges', 'stChips', 'diffRow', 'stGo', 'contBtn', 'battleLoad', 'pigBox', 'goalList']) assert.ok(html.includes(`id="${id}"`), id);
assert.ok(html.includes('/* @css:08-battle-tab */') && html.includes('/* end @css:08-battle-tab */'), 'css markers');
assert.ok(main.includes('drawPortrait') && main.includes('resetIn'), 'portrait and timers');
assert.ok(!/—/.test(html.slice(html.indexOf('@css:08-battle-tab'))), 'no em dash in css');
// round 2: START dock, twist badge, fun facts, event banner
for (const id of ['btDock', 'btFact', 'loadEdit']) assert.ok(html.includes(`id="${id}"`), id);
assert.ok(html.indexOf('id="btDock"') > html.indexOf('class="hubbody"') && !/#stGo\{[^}]*position:sticky/.test(html), 'START lives in a dock, not sticky over the content');
assert.ok(main.includes("from './battle_ui.js'") && main.includes('stPortrait').valueOf() && main.includes('evCd'), 'wired');
const ui = await import('../../cell_serpent/battle_ui.js');
const sim = await import('../../cell_serpent/sim.js');
for (const k of sim.SKINS) { assert.ok(ui.FACTS[k] && ui.FACTS[k].length < 90, 'fact ' + k); assert.ok(!/—/.test(ui.FACTS[k])); }
for (const n of [3, 5, 6, 7, 25]) { const info = sim.stageInfo(n), h = ui.factHTML({ info, sp: { name: 'X' }, hard: false, done: false, sparkleIcon: '*' }); assert.ok(h.includes(String(sim.clearReward(n).sparkles)) && h.includes('egg'), 'rewards ' + n); assert.equal(h.includes('(Boss)'), info.boss); }
for (const m of sim.MODS) { const t = ui.twistHTML(m); assert.ok(t.includes(m.name) && t.includes(m.blurb) && ui.modChips(m).length, 'twist ' + m.id); }
assert.equal(ui.twistHTML(null), '');
assert.equal(ui.countdownText(2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5000), '2d 03:04:05');
assert.equal(ui.countdownText(3661000), '01:01:01');
const day = Math.floor(Date.UTC(2026, 10, 2) / 86400000), ev = sim.eventInfo(day);
assert.equal(ui.monthEndMs(day), Date.UTC(2026, 11, 1));
const b0 = ui.eventBannerHTML(ev, 0, {}, Date.UTC(2026, 10, 2), day), b1 = ui.eventBannerHTML(ev, 100, {}, Date.UTC(2026, 10, 2), day);
assert.ok(b0.includes('OPEN') && b1.includes('CLAIM 2') && b1.includes('width:33.33'), 'banner states');
assert.equal((b0.match(/class="evn/g) || []).length, sim.EVENT_MILES.length);
assert.ok(!/—/.test(fs.readFileSync(new URL('../../cell_serpent/battle_ui.js', import.meta.url), 'utf8')), 'no em dash');
console.log('08_battle_tab ok');

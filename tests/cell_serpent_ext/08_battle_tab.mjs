// Battle tab markup and CSS marker checks (agent 08)
import assert from 'node:assert';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../../cell_serpent/index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../../cell_serpent/main.js', import.meta.url), 'utf8');
for (const id of ['btHero', 'stCanvas', 'stPortrait', 'stBadges', 'stChips', 'diffRow', 'stGo', 'contBtn', 'battleLoad', 'pigBox', 'goalList']) assert.ok(html.includes(`id="${id}"`), id);
assert.ok(html.includes('/* @css:08-battle-tab */') && html.includes('/* end @css:08-battle-tab */'), 'css markers');
assert.ok(main.includes('drawPortrait') && main.includes('resetIn'), 'portrait and timers');
assert.ok(!/—/.test(html.slice(html.indexOf('@css:08-battle-tab'))), 'no em dash in css');
console.log('08_battle_tab ok');

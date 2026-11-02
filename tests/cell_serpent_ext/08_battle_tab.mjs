// Battle tab markup and CSS marker checks (agent 08)
import assert from 'node:assert';
import fs from 'node:fs';
import { chipReward, goalRowHTML } from '../../cell_serpent/battle_ui.js';
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
// round 3: chips live in the dock above START, dock is measured after layout, swipe and arrow keys, power tag
assert.ok(html.indexOf('id="stChips"') > html.indexOf('id="btDock"'), 'stage chips are inside the dock');
assert.ok(main.includes('syncDock()') && main.includes('bindStageNav(') && main.includes('goTag('), 'round 3 wired');
assert.ok(typeof ui.syncDock === 'function' && typeof ui.fitTitle === 'function' && typeof ui.bindStageNav === 'function');
{ const mk = () => { const o = { dataset: {}, kids: [], querySelectorAll: () => o.kids.splice(0), appendChild: k => o.kids.push(k) }; return o; };
  globalThis.document = { createElement: () => ({ remove() {} }) };
  for (const [m, r, tag] of [[50, 100, 'RISKY'], [90, 100, 'CLOSE'], [120, 100, 'READY'], [200, 100, 'EASY']]) { const b = mk(); ui.goTag(b, m, r, true); assert.equal(b.dataset.tag, tag, tag); }
  const b = mk(); ui.goTag(b, 5, 100, false); assert.equal(b.dataset.tag, undefined, 'locked stage has no tag');
  delete globalThis.document; }
console.log('08_battle_tab ok');
// round 4: chip reward markers, compact goals strip, side scroll fade
assert.ok(/class="rw"[^>]*>\+\d+/.test(chipReward(15, 14, 0)), "next stage chip shows its first clear reward");
assert.ok(chipReward(3, 14, 0).includes("class=\"hk\""), "cleared stage without a Hard clear gets the H marker");
assert.strictEqual(chipReward(3, 14, 5), "", "no marker once Hard first clear is done");
assert.strictEqual(chipReward(17, 14, 0), "", "far stages show nothing");
assert.ok(goalRowHTML("Pop", 1, 3, "50", "ready").includes("gl-btn ready") && goalRowHTML("x", 3, 3, "5", "claimed").includes("DONE"), "goal row states");
assert.ok(main.includes("chipReward(n, save.cleared") && main.includes("watchSide") && html.includes("id=\"glCount\""), "wired");

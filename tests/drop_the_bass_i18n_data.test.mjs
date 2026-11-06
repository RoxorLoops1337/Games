// Drop the Bass: data translation overlays (js/i18n_data.js). Registry coverage, apply/revert, partial overlays, cutscene arrays,
// idempotence, object identity, derived copies and en_data.js being current and free of em dashes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as CORE from '../drop_the_bass/js/data_core.js';
import * as RUN from '../drop_the_bass/js/data_run.js';
import * as META from '../drop_the_bass/js/data_meta.js';
import * as STORY from '../drop_the_bass/js/data_story.js';
import * as DEPTH from '../drop_the_bass/js/data_depth.js';
import * as HX from '../drop_the_bass/js/data_hints_extra.js';
import * as I from '../drop_the_bass/js/i18n_data.js';
import { setLang, getLang, loadLang, langReady, getData } from '../drop_the_bass/js/i18n.js';
import EN from '../drop_the_bass/js/lang/en_data.js';
import { checkDict } from './../tools/dtb_i18n_data.mjs';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };

// ---- snapshot of every registered target BEFORE anything is applied (identity + English)
const slots = I.getSlots();
ok(slots.length > 800, 'many slots: ' + slots.length);
const refs = { TURRETS: CORE.TURRETS, kick: CORE.TURRETS.kick, perks: CORE.TURRETS.kick.perks, cut: STORY.CUTSCENES.intro.panels[0].lines, world0: CORE.WORLDS[0], hints: STORY.HINTS, tut: STORY.TUTORIAL[0], tips: STORY.LOOPY_TIPS };
const origKick = CORE.TURRETS.kick.name, origPerk = CORE.TURRETS.kick.perks[3], origLine = STORY.CUTSCENES.intro.panels[0].lines[1].text;

// ---- coverage audit: every string leaf of every exported data table is a registered slot or explicitly non-text
const covered = I.coveredPairs();
const isColour = (s) => /^(#[0-9a-f]{3,8}|rgba?\()/i.test(s);
const problems = [];
function audit(exp, node, field, seen) {
  if (typeof node === 'string') return;
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    const f = /^\d+$/.test(k) ? field : k;
    if (typeof v === 'string') {
      if (!/\p{L}/u.test(v) || isColour(v)) continue;
      if (covered.get(node) && covered.get(node).has(k)) continue;
      if (I.NON_TEXT_EXACT.has(exp + '.' + f)) continue;
      if (I.NON_TEXT_FIELDS.has(f)) { if (/\s/.test(v.trim())) problems.push(exp + ' ' + f + ' whitelisted but looks like prose: ' + v); continue; }
      problems.push(exp + '.' + f + ' = ' + JSON.stringify(v.length > 40 ? v.slice(0, 40) + '...' : v) + ' is neither translated nor whitelisted');
    } else audit(exp, v, f, seen);
  }
}
for (const ns of [CORE, RUN, META, STORY, DEPTH, HX]) {
  for (const [name, val] of Object.entries(ns)) {
    if (typeof val === 'function' || typeof val === 'number' || I.EXCLUDED_EXPORTS.has(name)) continue;
    if (typeof val === 'string') { if (/\p{L}/u.test(val) && !I.NON_TEXT_EXACT.has(name)) problems.push(name + ' is a bare exported string'); continue; }
    audit(name, val, name, new Set());
  }
}
assert.deepEqual(problems, [], 'untranslated text fields:\n' + problems.join('\n')); n++;
// every registered table resolves to at least one slot (a renamed export would silently lose its text)
for (const tb of I.TABLES) ok(slots.some((s) => s.path.startsWith((tb.name === 'HINTS_EXTRA' ? 'HINTS' : tb.name) + '.')), 'table has slots: ' + tb.name);

// ---- en_data.js is current, has the same keys as the live data, and no em dash
const live = I.englishMap();
assert.deepEqual(Object.keys(EN).sort(), Object.keys(live).sort(), 'en_data.js is out of date: run node tools/dtb_i18n_data.mjs --extract'); n++;
for (const k of Object.keys(live)) eq(EN[k], live[k], 'en_data value ' + k);
ok(!/\u2014/.test(readFileSync(new URL('../drop_the_bass/js/lang/en_data.js', import.meta.url), 'utf8')), 'no em dash in en_data.js');
for (const c of ['da', 'nl', 'de']) ok(!/\u2014/.test(readFileSync(new URL('../drop_the_bass/js/lang/' + c + '_data.js', import.meta.url), 'utf8')), 'no em dash in ' + c + '_data.js');
for (const k of Object.keys(EN)) ok(!/^\s|\s$/.test(EN[k]) && EN[k].length > 0, 'trimmed ' + k);
// the documented path shapes exist
for (const k of ['TURRETS.kick.name', 'TURRETS.kick.perks.3', 'ENEMIES.fuzz.blurb', 'REMIX.bass_boost.desc', 'CUTSCENES.intro.panels.0.lines.1.text', 'HINTS.fuzz.text', 'HINTS.hint_synergy.text',
  'TUTORIAL.hello.say', 'LOOPY_TIPS.0', 'FAME_TITLES.1', 'TURRET_BRANCHES.kick.kick_big_bang.name', 'BOSS_PHASES.silence.enrage.text', 'OUTFITS.roxor.onesie.name', 'SETS.mohawk.bonus.2.text'])
  ok(k in EN, 'path exists: ' + k);

// ---- apply a fake language
const dict = {
  'TURRETS.kick.name': 'DA Kick', 'TURRETS.kick.perks.3': 'DA perk 3', 'CUTSCENES.intro.panels.0.lines.1.text': 'DA line one', 'CUTSCENES.intro.panels.0.lines.0.text': 'DA narr',
  'SYNERGIES.0.name': 'x', 'SYNERGIES.slow_smash.name': 'DA Slow', 'SYNERGIES.slow_smash.desc': 'DA slow desc', 'FAME_TITLES.1': 'DA Garage Band',
  'HINTS.hint_synergy.title': 'DA Syn', 'TUTORIAL.hello.say': 'DA hi', 'LOOPY_TIPS.0': 'DA tip', 'BOSS_PHASES.silence.enrage.text': 'DA enrage',
  'BOARD_SKINS.skin_chalk.name': 'DA Chalk',
};
const cnt = I.applyDataLang('da', dict);
ok(cnt >= 10, 'translated count ' + cnt);
eq(CORE.TURRETS.kick.name, 'DA Kick'); eq(CORE.TURRETS.kick.perks[3], 'DA perk 3');
eq(CORE.TURRETS.kick.perks[5], 'Blast slows enemies', 'partial overlay falls back per field');
eq(CORE.TURRETS.snare.name, 'Snare Snapper', 'untranslated table entry stays English');
eq(STORY.CUTSCENES.intro.panels[0].lines[1].text, 'DA line one'); eq(STORY.CUTSCENES.intro.panels[0].lines[0].text, 'DA narr');
eq(STORY.CUTSCENES.intro.panels[0].lines[1].who, 'roxor', 'non-text field untouched');
eq(STORY.CUTSCENES.intro.panels[0].lines[2].text, 'Always. Three, two, one...');
eq(STORY.TUTORIAL[0].say, 'DA hi'); eq(STORY.LOOPY_TIPS[0], 'DA tip'); eq(STORY.HINTS.hint_synergy.title, 'DA Syn');
eq(META.FAME_TITLES[0][1], 'DA Garage Band'); eq(META.fameTitle(1), 'DA Garage Band', 'fameTitle reads the overlay');
eq(DEPTH.BOSS_PHASES.silence.find((p) => p.id === 'enrage').text, 'DA enrage');
eq(CORE.SYNERGY_BY_ID.slow_smash.name, 'DA Slow', 'index by id sees the overlay');
const partner = CORE.TURRET_PARTNERS.kick.find((p) => p.id === 'slow_smash');
eq(partner.name, 'DA Slow', 'derived TURRET_PARTNERS copy is synced'); eq(partner.desc, 'DA slow desc');
if (HX.HINTS_EXTRA.hint_synergy) eq(HX.HINTS_EXTRA.hint_synergy.title, 'DA Syn', 'HINTS_EXTRA object (copy or same) is covered');
eq(DEPTH.BRANCH_BY_ID.kick_big_bang.name, 'Big Bang');
try { const b = (await import('../drop_the_bass/js/doodle_env.js')).BOARD_SKINS; if (b) eq(b.skin_chalk.name, 'DA Chalk', 'BOARD_SKINS'); } catch (e) { /* art not loadable */ }

// ---- idempotence and identity
const snap = JSON.stringify([CORE.TURRETS, STORY.CUTSCENES, STORY.HINTS, META.FAME_TITLES]);
I.applyDataLang('da', dict); eq(JSON.stringify([CORE.TURRETS, STORY.CUTSCENES, STORY.HINTS, META.FAME_TITLES]), snap, 'idempotent');
ok(refs.TURRETS === CORE.TURRETS && refs.kick === CORE.TURRETS.kick && refs.perks === CORE.TURRETS.kick.perks && refs.cut === STORY.CUTSCENES.intro.panels[0].lines
  && refs.world0 === CORE.WORLDS[0] && refs.hints === STORY.HINTS && refs.tut === STORY.TUTORIAL[0] && refs.tips === STORY.LOOPY_TIPS, 'object identity unchanged');

// ---- switching to another language overrides, and back to English restores everything
I.applyDataLang('nl', { 'TURRETS.snare.name': 'NL Snare' });
eq(CORE.TURRETS.kick.name, origKick, 'switching language drops the previous overlay'); eq(CORE.TURRETS.snare.name, 'NL Snare');
I.applyDataLang('en');
eq(CORE.TURRETS.snare.name, 'Snare Snapper'); eq(CORE.TURRETS.kick.perks[3], origPerk); eq(STORY.CUTSCENES.intro.panels[0].lines[1].text, origLine);
assert.deepEqual(Object.fromEntries(I.getSlots().map((s) => [s.path, s.targets[0].container[s.targets[0].key]])), live, 'English fully restored'); n++;
eq(CORE.TURRET_PARTNERS.kick.find((p) => p.id === 'slow_smash').name, 'Slow and Smash', 'derived copy restored');
// empty and bad values fall back
I.applyDataLang('de', { 'TURRETS.kick.name': '', 'TURRETS.snare.name': 5 });
eq(CORE.TURRETS.kick.name, origKick); eq(CORE.TURRETS.snare.name, 'Snare Snapper');
I.applyDataLang('en');

// ---- the shipped dictionaries load (through i18n.js), apply, and pass the checker
I.initDataLang();
eq(getLang(), 'en');
for (const c of ['da', 'nl', 'de']) {
  await loadLang(c);
  const d = getData(c); ok(d && Object.keys(d).length > 800, 'data dictionary loaded by i18n.js ' + c);
  const r = checkDict(c, EN, d); assert.deepEqual(r.errors, [], c + ' data dictionary errors'); n++;
  I.applyDataLang(c); I.applyDataLang('en');
}
// language change wiring through i18n.js (onLang)
I.setDataDict('de', { 'TURRETS.kick.name': 'DE Kick' });
setLang('de'); await langReady(); eq(CORE.TURRETS.kick.name, 'DE Kick', 'onLang applies the data overlay');
setLang('en'); eq(CORE.TURRETS.kick.name, origKick, 'and reverts'); I.setDataDict('de', null);
I.applyDataLang('de'); ok(typeof CORE.TURRETS.kick.name === 'string' && CORE.TURRETS.kick.name.length > 0, 'real german dictionary applies'); I.applyDataLang('en'); eq(CORE.TURRETS.kick.name, origKick, 'english restored');

// ---- checker unit behaviour
const bad = checkDict('da', { a: 'Hi {n}', 'X.name': 'ok' }, { a: 'Hej', b: 'extra', 'X.name': 'a \u2014 b' });
ok(bad.errors.some((e) => /placeholders/.test(e)) && bad.errors.some((e) => /extra key/.test(e)) && bad.errors.some((e) => /em dash/.test(e)), 'checker finds problems');
ok(checkDict('da', { 'X.name': 'a' }, { 'X.name': 'y'.repeat(31) }).errors.length === 1 && checkDict('da', { 'X.name': 'a' }, { 'X.name': 'y'.repeat(28) }).warns.length === 1, 'name length limits');

// counts per table
const per = {}; for (const k of Object.keys(EN)) { const t = k.split('.')[0]; per[t] = (per[t] || 0) + 1; }
console.log('drop_the_bass_i18n_data: ' + n + ' checks, ' + Object.keys(EN).length + ' strings', JSON.stringify(per));

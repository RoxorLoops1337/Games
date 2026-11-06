// Drop the Bass round 3: personal bests (profile.bests, recordBests, migration), the results card, and the save code (export and import)
// covering every profile field added since round 1, older codes migrating, and corrupt codes being rejected.
import assert from 'node:assert/strict';
import * as M from '../drop_the_bass/js/meta.js';
import { makeRng } from '../drop_the_bass/js/rng.js';
import { ENDLESS_MILESTONES } from '../drop_the_bass/js/data_depth.js';
import { SKIN_IDS, OUTFITS } from '../drop_the_bass/js/data_meta.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const NOW = Date.UTC(2026, 9, 24, 12);
const fresh = () => M.newProfile(NOW);
const res = (o) => Object.assign({ won: false, cleared: 5, kills: 100, bestCombo: 8, time: 200, mode: 'endless', world: 'garage', encore: 0, merges: 3, deploys: 10, bossKills: 0, coinsEarned: 100, maxLevel: 3, relics: [], bossTypes: [], leaks: 0 }, o);

// ---- recordBests: first score stores silently, later runs compare per field
{
  const p = fresh();
  let b = M.recordBests(p, res({ cleared: 10, kills: 200, bestCombo: 9 }));
  ok(b.key === 'endless:garage' && b.prev === null && !b.record && p.bests['endless:garage'].wave === 10, 'first score: stored, no record sticker');
  b = M.recordBests(p, res({ cleared: 12, kills: 150, bestCombo: 9 }));
  ok(b.record && b.beaten.wave && !b.beaten.kills && !b.beaten.combo && b.prev.wave === 10 && b.now.wave === 12, 'wave beaten, kills and equal combo are not');
  ok(p.bests['endless:garage'].kills === 200 && p.bests['endless:garage'].wave === 12, 'stored best is the max per field');
  b = M.recordBests(p, res({ cleared: 3, kills: 10, bestCombo: 2 }));
  ok(!b.record && p.bests['endless:garage'].wave === 12, 'a worse run changes nothing');
  // fastest clear: only won runs count, lower is better
  b = M.recordBests(p, res({ mode: 'story', won: true, time: 300, cleared: 20 }));
  ok(p.bests['story:garage:0'].time === 300 && !b.beaten.time, 'first clear time stored');
  b = M.recordBests(p, res({ mode: 'story', won: true, time: 280.4, cleared: 20 }));
  ok(b.beaten.time && b.now.time === 280 && b.prev.time === 300, 'faster clear beats the time');
  b = M.recordBests(p, res({ mode: 'story', won: true, time: 290, cleared: 20 }));
  ok(!b.beaten.time && p.bests['story:garage:0'].time === 280, 'slower clear does not');
  b = M.recordBests(p, res({ mode: 'story', won: false, time: 5, cleared: 4 }));
  ok(b.run.time === 0 && p.bests['story:garage:0'].time === 280, 'a lost run never sets the fastest clear');
  // keys: encore, rush, daily, weekly are separate; the tutorial has none
  ok(M.bestKey(res({ mode: 'story', encore: 2 })) === 'story:garage:2' && M.bestKey(res({ mode: 'rush' })) === 'rush' && M.bestKey(res({ mode: 'daily' })) === 'daily' && M.bestKey(res({ mode: 'daily', weekly: true })) === 'weekly', 'keys per mode');
  ok(M.bestKey(res({ mode: 'tutorial' })) === null && M.recordBests(p, res({ mode: 'tutorial' })) === null, 'tutorial has no bests');
  M.recordBests(p, res({ mode: 'daily', cleared: 6 })); b = M.recordBests(p, res({ mode: 'daily', cleared: 9 }));
  M.recordBests(p, res({ mode: 'daily', weekly: true, cleared: 4 }));
  ok(b.beaten.wave && p.bests.daily.wave === 9 && p.bests.weekly.wave === 4, 'daily and weekly are tracked on their own');
}

// ---- applyRunResult hands the comparison to the results screen and saves it in the profile
{
  const p = fresh();
  const o1 = M.applyRunResult(p, res({ cleared: 7 }), makeRng(1), NOW);
  ok(o1.bests && !o1.bests.record, 'out.bests on the first run');
  const o2 = M.applyRunResult(p, res({ cleared: 9 }), makeRng(2), NOW);
  ok(o2.bests.record && o2.bests.beaten.wave && p.bests['endless:garage'].wave === 9, 'out.bests flags a record and the profile keeps it');
}

// ---- old saves: no bests field gets one, seeded from the numbers they already kept; junk is cleaned
{
  const p = fresh(); delete p.bests; p.prog.garage.bestEndless = 31; p.prog.garage.bestWave = 17; p.daily.challengeBest = 8; p.weekly.best = 6;
  const m = M.migrate(JSON.parse(JSON.stringify(p)), NOW);
  ok(m.bests['endless:garage'].wave === 31 && m.bests['story:garage:0'].wave === 17 && m.bests.daily.wave === 8 && m.bests.weekly.wave === 6, 'seeded from older fields');
  const junk = fresh(); junk.bests = { 'endless:garage': { wave: 'x', combo: -4, kills: NaN, time: 1e99 }, 'bad key!': { wave: 3 }, daily: 5 };
  const j = M.migrate(JSON.parse(JSON.stringify(junk)), NOW);
  ok(j.bests['endless:garage'].wave === 0 && j.bests['endless:garage'].combo === 0 && !j.bests['bad key!'] && !j.bests.daily, 'junk is cleaned');
  const keep = fresh(); keep.bests = { 'endless:garage': { wave: 50, combo: 20, kills: 999, time: 0 } }; keep.prog.garage.bestEndless = 31;
  ok(M.migrate(JSON.parse(JSON.stringify(keep)), NOW).bests['endless:garage'].wave === 50, 'a stored best is never replaced by the seed');
}

// ---- save code: every field added since round 1 survives export and import
{
  const p = fresh();
  p.name = 'Zoe'; p.friends = ['Jas', 'Rox'];
  Object.assign(p.settings, { lang: 'de', colorblind: true, bigtext: true, autolow: false, reduce: true, skipSetlist: true, difficulty: 'hard', music: 0.3, sfx: 0.2 });
  const skin = SKIN_IDS.find((s) => s !== p.settings.skin); p.skins.owned.push(skin); p.settings.skin = skin;
  const ms = ENDLESS_MILESTONES[0]; p.milestones.claimed[ms.id] = true; if (ms.reward && ms.reward.cosmetic) p.milestones.cosmetics.push(ms.reward.cosmetic);
  const oid = Object.keys(OUTFITS.roxor).find((k) => k !== 'default'); p.outfits.owned.roxor.push(oid); p.outfits.worn.roxor = oid;
  p.tutorial.done = true; p.tutorial.hints = { hint_setlist: true, hint_wardrobe: true, lang_offer: true, hint_skin_buy: true };
  p.bests = { 'endless:garage': { wave: 44, combo: 31, kills: 1234, time: 0 }, 'story:garage:0': { wave: 20, combo: 12, kills: 400, time: 321 } };
  p.weekly = { id: '2026-W43', done: true, best: 9 }; p.modifiers = []; p.modPin = true; p.story.epilogues = { garage: true }; p.seen.bosses = { lowpass: true };
  p.records = 4242; p.diamonds = 77; p.studio.crit = 2; p.resume = { junk: 1 };
  const code = M.exportCode(p);
  ok(/^DTB1\.[A-Za-z0-9+/=]+\.[a-z0-9]+$/.test(code), 'code format DTB1.<base64>.<checksum>');
  const b = M.importCode(code, NOW);
  ok(b && b.name === 'Zoe' && b.friends.join() === 'Jas,Rox', 'name and friends');
  ok(b.settings.lang === 'de' && b.settings.colorblind && b.settings.bigtext && b.settings.autolow === false && b.settings.reduce && b.settings.skipSetlist && b.settings.difficulty === 'hard' && b.settings.music === 0.3, 'language and accessibility settings');
  ok(b.skins.owned.includes(skin) && b.settings.skin === skin, 'skins');
  ok(b.milestones.claimed[ms.id] === true, 'milestones');
  ok(b.outfits.owned.roxor.includes(oid) && b.outfits.worn.roxor === oid, 'outfits');
  ok(b.tutorial.done && b.tutorial.hints.hint_setlist && b.tutorial.hints.hint_skin_buy && b.tutorial.hints.lang_offer, 'hints seen');
  ok(b.bests['endless:garage'].wave === 44 && b.bests['story:garage:0'].time === 321, 'bests');
  ok(b.weekly.id === '2026-W43' && b.modPin === true && b.story.epilogues.garage && b.seen.bosses.lowpass && b.records === 4242 && b.studio.crit === 2, 'weekly, pins, story, codex, economy');
  ok(b.resume === null, 'the run snapshot is left out');
  // every top level field of a fresh profile exists after an import
  for (const k of Object.keys(fresh())) ok(k in b, 'field ' + k + ' present after import');
  // re-exporting what was imported gives the same profile
  ok(JSON.stringify(M.importCode(M.exportCode(b), NOW)) === JSON.stringify(b), 'export of an import is stable');
}

// ---- an older code (round 1: no language, accessibility, skins, milestones, bests, hints) migrates
{
  const old = fresh();
  for (const k of ['lang', 'colorblind', 'bigtext', 'autolow', 'skin', 'skipSetlist']) delete old.settings[k];
  delete old.skins; delete old.milestones; delete old.bests; delete old.friends; delete old.heroAbility; delete old.modifiers; delete old.modPin; delete old.story.epilogues; delete old.weekly;
  old.records = 999; old.prog.garage.cleared = true; old.prog.garage.bestEndless = 12; old.tutorial = { done: true };
  const json = JSON.stringify(old);
  for (const code of [Buffer.from(json, 'utf8').toString('base64'), (() => { const body = Buffer.from(json, 'utf8').toString('base64'); return 'DTB1.' + body + '.' + M.checksum(body); })()]) {
    const b = M.importCode(code, NOW);
    ok(b && b.records === 999 && b.prog.garage.cleared, 'older code imports');
    ok(b.settings.lang === 'auto' && b.settings.colorblind === false && b.settings.bigtext === false && b.settings.autolow === true && b.settings.skipSetlist === false, 'new settings get defaults');
    ok(b.skins.owned.length >= 1 && b.milestones.claimed && Array.isArray(b.friends) && b.weekly.id === '' && b.tutorial.hints && typeof b.tutorial.hints === 'object', 'new fields get defaults');
    ok(b.bests['endless:garage'].wave === 12, 'bests seeded from the old best wave');
  }
}

// ---- corrupt, truncated and foreign codes are rejected (null), never half imported
{
  const p = fresh(); p.records = 1234;
  const code = M.exportCode(p);
  const bad = [
    code.slice(0, code.length - 1), code.slice(0, Math.floor(code.length / 2)), code.slice(0, code.lastIndexOf('.')), code.slice(5), 'DTB1.', 'DTB1..', 'DTB1.!!!.zz',
    code.replace(/\.[a-z0-9]+$/, '.zzzzzz'), code.replace(/^(DTB1\.)(.)/, '$1' + 'A'), 'hello world', '{"records":5}', '[]', 'null', '12345', '\u0000\u0001', 'DTB2.' + code.split('.')[1] + '.' + code.split('.')[2],
  ];
  for (const c of bad) ok(M.importCode(c, NOW) === null, 'rejected: ' + JSON.stringify(c.slice(0, 24)));
  // a valid checksum around damaged json is rejected too
  const body = Buffer.from('{"stats":{},"records":5,', 'utf8').toString('base64');
  ok(M.importCode('DTB1.' + body + '.' + M.checksum(body), NOW) === null, 'valid checksum, broken json');
  // a profile that was loaded stays untouched by a failed import (importCode never mutates anything)
  const live = fresh(); live.records = 55; const before = JSON.stringify(live);
  M.importCode(bad[0], NOW); ok(JSON.stringify(live) === before, 'live profile untouched');
}
console.log('drop_the_bass bests_save: ' + n + ' checks passed');

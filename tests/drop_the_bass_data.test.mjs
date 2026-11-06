// Drop the Bass: data integrity. Ids, references, maps, glyph names, and the house rule: no em dash anywhere.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as C from '../drop_the_bass/js/data_core.js';
import * as R from '../drop_the_bass/js/data_run.js';
import * as D from '../drop_the_bass/js/data_meta.js';
import * as S from '../drop_the_bass/js/data_story.js';
import { GLYPH_NAMES } from '../drop_the_bass/js/art_entities.js';
import { SCENE_IDS } from '../drop_the_bass/js/art_world.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// ---- turrets, enemies, bosses
for (const [id, t] of Object.entries(C.TURRETS)) {
  ok(t.id === id, 'turret id ' + id);
  ok(['roxor', 'jasmin'].includes(t.hero), 'hero ' + id);
  ok(t.name && t.blurb && t.color && t.accent, 'turret text ' + id);
  ok(t.unlock && t.unlock.fame >= 1, 'unlock ' + id);
  for (const l of Object.keys(t.perks)) ok(l >= 2 && l <= C.MAX_LEVEL, 'perk level ' + id);
}
ok(C.STARTER_TURRETS.every((id) => C.TURRETS[id] && C.TURRETS[id].unlock.records === 0), 'starters are free');
for (const [id, e] of Object.entries(C.ENEMIES)) { ok(e.id === id && e.hp > 0 && e.speed > 0 && e.r > 0, 'enemy ' + id); }
for (const [id, b] of Object.entries(C.BOSSES)) { ok(b.id === id && b.hpMul > 0 && b.trick, 'boss ' + id); }
for (const [id, a] of Object.entries(C.AFFIXES)) ok(a.id === id, 'affix ' + id);

// ---- worlds and maps
ok(C.WORLDS.length === 7, 'seven worlds');
ok(C.WORLD_ORDER.join() === C.WORLDS.map((w) => w.id).join() && C.WORLDS.every((w, i) => w.n === i + 1), 'WORLD_ORDER matches the tour');
ok(C.WORLD_BY_ID.beach.map === 'beach' && C.WORLD_BY_ID.moon.map === 'moon' && C.WORLD_BY_ID.beach.wavesTotal === 25 && C.WORLD_BY_ID.moon.wavesTotal === 25, 'second tour worlds');
ok(C.BOSSES.lowpass && C.BOSSES.silence, 'second tour bosses');
for (const w of C.WORLDS) {
  ok(C.MAPS[w.map], 'map ' + w.id);
  ok(C.BOSSES[w.boss] && C.BOSSES[w.boss10], 'bosses of ' + w.id);
  ok(w.pool.every((e) => C.ENEMIES[e]), 'pool ' + w.id);
  ok(w.bpm >= 90 && w.bpm <= 140, 'bpm ' + w.id);
}
for (const id of Object.keys(C.MAPS)) {
  const m = C.buildMap(id);
  ok(m.buildable.length >= 22 && m.buildable.length <= 45, 'buildable slots of ' + id + ': ' + m.buildable.length);
  for (const lane of m.lanes) {
    ok(lane.total > 600, 'lane long enough ' + id);
    const last = lane.pts[lane.pts.length - 1];
    ok(last.c === m.base.c && last.r === m.base.r, 'every lane ends at the stage ' + id);
    for (let i = 1; i < lane.pts.length; i++) ok(lane.pts[i].c === lane.pts[i - 1].c || lane.pts[i].r === lane.pts[i - 1].r, 'axis aligned ' + id);
    const p0 = C.laneAt(lane, 0), p1 = C.laneAt(lane, lane.total / 2), p2 = C.laneAt(lane, lane.total + 5);
    ok(isFinite(p0.x + p1.x + p2.x + p0.ang), 'laneAt finite');
  }
  ok(!m.isPath(m.base.c + 100, 0), 'isPath off board');
  for (const s of m.buildable) ok(!m.isPath(s.c, s.r), 'slot not on path');
}

// ---- remix, relics, wave mods, daily mods
const glyphs = new Set(GLYPH_NAMES);
const mods = R.freshMods();
const fxOk = (fx, where) => {
  for (const [path, op, v] of fx) {
    ok(['mul', 'add', 'max', 'set'].includes(op), 'op in ' + where);
    const parts = path.split('.'); let o = mods;
    for (let i = 0; i < parts.length - 1; i++) { o = o[parts[i]]; ok(o != null, 'path ' + path + ' in ' + where); }
    ok(parts[parts.length - 1] in o, 'field ' + path + ' in ' + where);
    ok(typeof v === 'number', 'value in ' + where);
  }
};
for (const [id, c] of Object.entries(R.REMIX)) {
  ok(c.id === id && C.RARITY[c.rarity] && c.max >= 1 && c.desc, 'remix ' + id);
  ok(glyphs.has(c.glyph), 'remix glyph ' + id + ' ' + c.glyph);
  if (c.turret) ok(C.TURRETS[c.turret], 'remix turret ' + id);
  fxOk(c.fx, 'remix ' + id);
}
for (const [id, c] of Object.entries(R.RELICS)) { ok(c.id === id && C.RARITY[c.rarity] && c.desc, 'relic ' + id); ok(glyphs.has(c.glyph), 'relic glyph ' + id); fxOk(c.fx, 'relic ' + id); }
for (const [id, c] of Object.entries(R.WAVE_MODS)) { ok(c.id === id && c.wm && c.desc, 'wave mod ' + id); ok(glyphs.has(c.glyph), 'wavemod glyph ' + id); }
for (const [id, c] of Object.entries(R.DAILY_MODS)) { ok(c.id === id && c.desc, 'daily ' + id); ok(glyphs.has(c.glyph), 'daily glyph ' + id); fxOk(c.mods || [], 'daily ' + id); if (c.loadout) ok(c.loadout.every((t) => C.TURRETS[t]), 'daily loadout'); }
ok(Object.keys(R.REMIX).length >= 45, 'enough remix cards');
ok(Object.keys(R.RELICS).length >= 24, 'enough relics');

// ---- meta data
for (const [id, u] of Object.entries(D.STUDIO)) { ok(u.id === id && u.max >= 1 && u.cost(0) > 0 && u.cost(1) > u.cost(0), 'studio ' + id); ok(glyphs.has(u.glyph), 'studio glyph ' + id); fxOk(u.fx.filter((f) => f[0] !== 'startCoins' || true), 'studio ' + id); }
for (const [id, g] of Object.entries(D.GEAR)) {
  ok(g.id === id && D.SLOTS.includes(g.slot), 'gear ' + id);
  ok(D.STATS[g.main] && D.STATS[g.sub], 'gear stats ' + id);
  ok(!g.set || D.SETS[g.set], 'gear set ' + id);
  ok(glyphs.has(g.glyph), 'gear glyph ' + id);
}
for (const s of D.SLOTS) ok(Object.values(D.GEAR).filter((g) => g.slot === s).length === 6, 'six items per slot ' + s);
for (const set of Object.keys(D.SETS)) ok(Object.values(D.GEAR).filter((g) => g.set === set).length === 5, 'five pieces in set ' + set);
for (const [id, c] of Object.entries(D.CRATES)) { const tot = Object.values(c.odds).reduce((a, b) => a + b, 0); ok(Math.abs(tot - 100) < 0.001, 'crate odds sum to 100: ' + id + ' ' + tot); }
const ids = new Set();
for (const a of D.ACHIEVEMENTS) { ok(!ids.has(a.id), 'unique achievement ' + a.id); ids.add(a.id); ok(a.goal > 0 && a.diamonds > 0, 'ach ' + a.id); }
for (const q of D.QUESTS) ok(q.goal > 0 && q.reward, 'quest ' + q.id);
ok(D.LOGIN_REWARDS.length === 7, 'seven login days');
for (const lv of [1, 5, 10, 20, 50]) { const r = D.fameReward(lv); ok(r.diamonds > 0, 'fame reward ' + lv); }
for (const id of Object.keys(C.TURRETS)) { const f = C.TURRETS[id].unlock.fame; if (f > 1) ok(!!D.fameReward(f).unlocks, 'fame ' + f + ' announces its unlock'); }

// ---- story
for (const [id, c] of Object.entries(S.CUTSCENES)) for (const p of c.panels) { ok(SCENE_IDS.includes(p.scene) || S.NEW_SCENE_IDS.includes(p.scene), 'scene exists ' + id + ' ' + p.scene); ok(p.lines.length > 0 && p.lines.every((l) => l.text && ['roxor', 'jasmin', 'loopy', 'playback', 'narr'].includes(l.who)), 'lines ' + id); }
for (const w of C.WORLDS) { ok(S.CUTSCENES['world_' + w.id], 'world cutscene ' + w.id); ok(S.CUTSCENES['boss_' + w.boss], 'boss cutscene ' + w.boss); }
for (const w of C.WORLDS) { ok(S.EPILOGUES[w.id] && S.CUTSCENES[S.EPILOGUES[w.id]], 'epilogue for ' + w.id); const lines = S.CUTSCENES[S.EPILOGUES[w.id]].panels.flatMap((p) => p.lines); ok(lines.length >= 2 && lines.length <= 4, 'epilogue length ' + w.id); }
ok(Object.keys(S.EPILOGUES).length === C.WORLDS.length, 'no stray epilogues');
ok(S.CUTSCENES[S.CREDITS_FINAL], 'final credits');
for (const id of S.NEW_SCENE_IDS) ok(Object.values(S.CUTSCENES).some((c) => c.panels.some((p) => p.scene === id)), 'new scene id is used ' + id);
for (const k of Object.keys(C.ENEMIES)) if (!C.ENEMIES[k].hidden) ok(S.HINTS[k], 'hint for ' + k);

// ---- synergies, partners and difficulty
{
  const FX_KEYS = ['rate', 'dmg', 'range', 'crit', 'slowedDmg', 'stunnedDmg', 'stun', 'spinFloor', 'healAny', 'healEvery', 'healChance', 'chain', 'chains', 'aura'];
  ok(C.SYNERGIES.length >= 10 && C.SYNERGIES.length <= 14, 'about 10 to 14 synergies: ' + C.SYNERGIES.length);
  const ids = new Set(), pairs = new Set();
  for (const s of C.SYNERGIES) {
    ok(/^[a-z][a-z0-9_]*$/.test(s.id) && !ids.has(s.id), 'synergy id ' + s.id); ids.add(s.id);
    ok(C.TURRETS[s.a] && C.TURRETS[s.b] && s.a !== s.b, 'synergy types ' + s.id);
    const pk = [s.a, s.b].sort().join('+'); ok(!pairs.has(pk), 'one synergy per pair ' + pk); pairs.add(pk);
    ok(s.name && s.desc && s.desc.length <= 80, 'synergy text ' + s.id);
    ok(s.fx && (s.fx.a || s.fx.b), 'synergy has an effect ' + s.id);
    for (const side of ['a', 'b']) for (const [k, v] of Object.entries(s.fx[side] || {})) ok(FX_KEYS.includes(k) && typeof v === 'number' && v > 0, 'synergy fx ' + s.id + ' ' + k);
  }
  for (const id of Object.keys(C.TURRETS)) ok(Array.isArray(C.TURRET_PARTNERS[id]) && C.TURRET_PARTNERS[id].length >= 1, 'every turret has a partner ' + id);
  let partnerRows = 0;
  for (const [id, rows] of Object.entries(C.TURRET_PARTNERS)) for (const r of rows) {
    partnerRows++;
    const s = C.SYNERGY_BY_ID[r.id]; ok(s && ((s.a === id && s.b === r.partner) || (s.b === id && s.a === r.partner)), 'partner row matches synergy ' + id + ' ' + r.id);
    ok(r.name === s.name && r.desc === s.desc, 'partner row text');
  }
  ok(partnerRows === C.SYNERGIES.length * 2, 'each synergy listed for both turrets');
  ok(C.synergyScale(1) === 1 && C.synergyScale(4) > 1 && C.synergyScale(7) <= C.SYN_SCALE_MAX && C.synergyScale(7) > C.synergyScale(4), 'synergy scale grows mildly and caps');
  ok(C.ECON.dropRerollGems === 2 && C.ECON.dropRerollCoinPct === 0.45, 'drop reroll prices');
  for (const id of ['easy', 'normal', 'hard']) { const d = C.DIFFICULTY[id]; ok(d && d.id === id && d.name && d.desc && d.hpMul > 0 && d.speedMul > 0, 'difficulty ' + id); }
  const { easy, normal, hard } = C.DIFFICULTY;
  ok(easy.hpMul === 0.7 && easy.stageHp === 6 && easy.speedMul === 0.92 && easy.recordsMul === 0.75, 'easy table');
  ok(hard.hpMul === 1.3 && hard.stageHp === -4 && hard.speedMul === 1.06 && hard.coinMul === 1.15 && hard.recordsMul === 1.25, 'hard table');
  ok(normal.hpMul === 1 && normal.stageHp === 0 && normal.recordsMul === 1, 'normal table');
}

// ---- depth data (data_depth.js): branches, hero abilities, run modifiers, boss phases, endless milestones
{
  const X = await import('../drop_the_bass/js/data_depth.js');
  const idRe = /^[a-z][a-z0-9_]*$/;
  const seen = new Set();
  for (const type of Object.keys(C.TURRETS)) {
    const list = X.TURRET_BRANCHES[type]; ok(Array.isArray(list) && list.length === 2, 'two branches for ' + type);
    for (const b of list) {
      ok(idRe.test(b.id) && !seen.has(b.id) && b.name && b.desc && GLYPH_NAMES.includes(b.glyph), 'branch row ' + b.id); seen.add(b.id);
      ok(X.BRANCH_TURRET[b.id] === type && X.BRANCH_BY_ID[b.id] === b, 'branch lookup ' + b.id);
      for (const [k, v] of Object.entries(b.fx)) ok(X.BRANCH_FX_KEYS.includes(k) && typeof v === 'number', 'branch fx key ' + b.id + ' ' + k);
    }
  }
  ok(seen.size === 24, '24 branches');
  for (const who of ['roxor', 'jasmin']) {
    const l = X.HERO_ABILITIES[who]; ok(l.length === 3 && l[0].id === X.HERO_ABILITY_DEFAULT[who] && l[0].unlockLv === 1 && l[1].unlockLv === 4 && l[2].unlockLv === 7, 'abilities ' + who);
    for (const a of l) ok(idRe.test(a.id) && a.name && a.desc && a.cdMul > 0, 'ability row ' + a.id);
  }
  ok(X.RUN_MODIFIERS.length === 10 && X.MAX_RUN_MODIFIERS === 3, 'ten modifiers, max three');
  for (const m of X.RUN_MODIFIERS) ok(idRe.test(m.id) && m.name && m.desc && GLYPH_NAMES.includes(m.glyph) && m.mul.records > 1 && m.mul.fans > 1 && m.mul.diamonds > 1 && X.RUN_MODIFIER_BY_ID[m.id] === m, 'modifier ' + m.id);
  for (const [id, list] of Object.entries(X.BOSS_PHASES)) {
    ok(C.BOSSES[id], 'boss phases for a real boss ' + id);
    for (const ph of list) ok(X.BOSS_PHASE_EFFECTS[ph.id] && ph.at > 0 && ph.at <= 1 && ph.text.length > 3, 'phase ' + id + ' ' + ph.id);
  }
  for (const id of C.BOSS_IDS) ok(X.BOSS_PHASES[id] && X.BOSS_PHASES[id].length >= 2, 'every boss has phases ' + id);
  for (const [id, e] of Object.entries(X.BOSS_PHASE_EFFECTS)) ok(e.id === id && e.name && e.desc && e.defaults, 'phase effect ' + id);
  ok(X.ENDLESS_MILESTONES.map((m) => m.wave).join() === '25,50,100' && X.ENDLESS_MILESTONES.every((m) => idRe.test(m.id) && m.reward.diamonds > 0), 'endless milestones');
}

// ---- house rule: no em dash in any source, doc or test of this game
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk('drop_the_bass').concat(readdirSync('tests').filter((f) => f.startsWith('drop_the_bass_')).map((f) => join('tests', f)));
for (const f of files) { if (!/\.(js|mjs|md|html|css)$/.test(f)) continue; ok(!readFileSync(f, 'utf8').includes(String.fromCharCode(8212)), 'em dash in ' + f); }

console.log('drop_the_bass data: ' + n + ' checks passed');

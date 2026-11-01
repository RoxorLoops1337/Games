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
ok(C.WORLDS.length === 5, 'five worlds');
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
for (const [id, c] of Object.entries(S.CUTSCENES)) for (const p of c.panels) { ok(SCENE_IDS.includes(p.scene), 'scene exists ' + id + ' ' + p.scene); ok(p.lines.length > 0 && p.lines.every((l) => l.text && ['roxor', 'jasmin', 'loopy', 'playback', 'narr'].includes(l.who)), 'lines ' + id); }
for (const w of C.WORLDS) { ok(S.CUTSCENES['world_' + w.id], 'world cutscene ' + w.id); ok(S.CUTSCENES['boss_' + w.boss], 'boss cutscene ' + w.boss); }
for (const k of Object.keys(C.ENEMIES)) if (!C.ENEMIES[k].hidden) ok(S.HINTS[k], 'hint for ' + k);

// ---- house rule: no em dash in any source, doc or test of this game
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk('drop_the_bass').concat(readdirSync('tests').filter((f) => f.startsWith('drop_the_bass_')).map((f) => join('tests', f)));
for (const f of files) { if (!/\.(js|mjs|md|html|css)$/.test(f)) continue; ok(!readFileSync(f, 'utf8').includes(String.fromCharCode(8212)), 'em dash in ' + f); }

console.log('drop_the_bass data: ' + n + ' checks passed');

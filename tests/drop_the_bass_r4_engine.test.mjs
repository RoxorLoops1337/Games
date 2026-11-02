// Round 4 engine: endless themed waves (determinism, preview equals spawn, snapshot and restore, banner, recap) and the per-boss first-time hint cards.
import assert from 'node:assert/strict';
import { Run, genWave, endlessThemeFor } from '../drop_the_bass/js/sim.js';
import { ENDLESS_THEMES, ENDLESS_THEME_IDS, ENDLESS_THEME_FIRST } from '../drop_the_bass/js/data_depth.js';
import { WAVE_MODS } from '../drop_the_bass/js/data_run.js';
import { WORLD_BY_ID, ENEMIES, BOSSES, BOSS_IDS } from '../drop_the_bass/js/data_core.js';
import { HINTS } from '../drop_the_bass/js/data_story.js';
import { HINTS_EXTRA } from '../drop_the_bass/js/data_hints_extra.js';
import { Battle } from '../drop_the_bass/js/battle.js';
import { AudioFx } from '../drop_the_bass/js/audio.js';
import * as M from '../drop_the_bass/js/meta.js';
import { setStyle } from '../drop_the_bass/js/style.js';
setStyle('doodle');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ---- the data: six themes, ids append-only, no em dashes, registered as wave mods but never picked at random
const EM = String.fromCharCode(8212);
eq(ENDLESS_THEME_IDS, ['swarm', 'armored_parade', 'zip_rush', 'echo_chamber', 'heal_party', 'gold_rush'], 'six themes, in order');
for (const id of ENDLESS_THEME_IDS) {
  const th = ENDLESS_THEMES[id];
  ok(th.id === id && th.name && th.desc && th.glyph && th.wm && typeof th.good === 'boolean', id + ' has the wave mod shape');
  ok(!th.name.includes(EM) && !th.desc.includes(EM), id + ' no em dash');
  ok(WAVE_MODS[id] === th, id + ' is registered in WAVE_MODS (same object)');
}
ok(ENDLESS_THEME_FIRST === 15, 'first themed wave is 15');

// ---- which waves, which theme: deterministic from (seed, wave)
for (const seed of [1, 7, 99, 123456]) {
  for (let w = 1; w <= 120; w++) {
    const th = endlessThemeFor(seed, w);
    if (w >= 15 && w % 10 === 5) ok(ENDLESS_THEME_IDS.includes(th), 'wave ' + w + ' is themed');
    else ok(th === null, 'wave ' + w + ' is not themed');
    ok(th === endlessThemeFor(seed, w), 'same answer twice');
  }
  const six = [15, 25, 35, 45, 55, 65].map((w) => endlessThemeFor(seed, w));
  eq([...new Set(six)].sort(), ENDLESS_THEME_IDS.slice().sort(), 'every theme once in six themed waves (seed ' + seed + ')');
  ok(endlessThemeFor(seed, 15) !== endlessThemeFor(seed, 25), 'two in a row differ');
}
const firsts = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((s) => endlessThemeFor(s, 15)));
ok(firsts.size >= 3, 'different seeds start with different themes: ' + [...firsts]);

// ---- genWave: only endless, never on a boss wave, shapes
for (const world of ['garage', 'moon', 'arena']) {
  const W = WORLD_BY_ID[world];
  for (let w = 1; w <= 80; w++) {
    const st = genWave(W, w, 5, { endless: false }), en = genWave(W, w, 5, { endless: true });
    ok(!st.theme && !(st.mod && WAVE_MODS[st.mod].theme), 'story waves never themed (w' + w + ')');
    if (w % 10 === 0) ok(!en.theme && en.boss, 'boss waves are never themed (w' + w + ')');
    if (w >= 15 && w % 10 === 5) { ok(en.theme === endlessThemeFor(5, w) && en.mod === en.theme, 'themed wave carries the theme as its mod'); ok(!en.boss, 'themed waves have no boss'); }
    else ok(!en.theme && !(en.mod && WAVE_MODS[en.mod].theme), 'random mods are never themes (w' + w + ')');
    eq(en, genWave(W, w, 5, { endless: true }), 'genWave is deterministic');
  }
}
// force each theme by finding a seed/wave that rolls it
const find = (id) => { for (let seed = 1; seed < 400; seed++) for (const w of [15, 25, 35, 45, 55, 65]) if (endlessThemeFor(seed, w) === id) return { seed, w }; throw new Error('no seed for ' + id); };
const total = (spec) => spec.groups.reduce((a, g) => a + g.count, 0);
const shape = {};
for (const id of ENDLESS_THEME_IDS) { const { seed, w } = find(id); shape[id] = { seed, w, spec: genWave(WORLD_BY_ID.club, w, seed, { endless: true }) }; }
ok(shape.armored_parade.spec.groups.every((g) => g.type === 'brick' && ENEMIES[g.type].armor > 0), 'armored parade: every group armored');
ok(shape.zip_rush.spec.groups.every((g) => g.type === 'zip'), 'zip rush: every group fast');
ok(shape.echo_chamber.spec.groups.every((g) => g.type === 'echo') && ENDLESS_THEMES.echo_chamber.wm.echoSplit === 2, 'echo chamber: echoes, split twice');
{ const g = shape.heal_party.spec.groups; ok(g.some((x) => x.type === 'leech') && g.some((x) => x.type !== 'leech'), 'heal party: leeches next to the normal groups'); ok(g.filter((x) => x.type === 'leech').length >= g.filter((x) => x.type !== 'leech').length, 'a leech group for every other group'); }
{
  // same wave number and seed without the theme: swarm has more enemies at a lower hp, gold rush fewer enemies
  const plain = (id) => { const { seed, w } = shape[id]; const sp = genWave(WORLD_BY_ID.club, w, seed, { endless: true }); return { w, seed, count: total(sp) }; };
  ok(total(shape.swarm.spec) > 30 && ENDLESS_THEMES.swarm.wm.count === 3 && ENDLESS_THEMES.swarm.wm.hp === 0.4, 'swarm: x3 enemies at 40% health');
  ok(ENDLESS_THEMES.gold_rush.wm.count < 1 && ENDLESS_THEMES.gold_rush.wm.coin === 2, 'gold rush: fewer, double coins');
  ok(plain('swarm').count === total(shape.swarm.spec), 'stable');
}
for (const id of ENDLESS_THEME_IDS) ok(total(shape[id].spec) <= 80 + shape[id].spec.groups.length * 2, id + ' stays under the enemy cap');

// ---- a live run: preview equals spawn, the mod field, the wave event, snapshot and restore
const mkRun = (seed, world = 'club') => new Run({ world, seed, mode: 'endless', endless: true, loadout: ['kick', 'snare', 'hat', 'sub', 'mic', 'synth', 'horn', 'scratch', 'loop', 'cowbell', 'amp', 'vocal'] });
const norm = (info) => ({ total: info.total, hasBoss: info.hasBoss, mod: info.mod, lanes: info.lanes.map((l) => ({ lane: l.lane, boss: l.boss, enemies: l.enemies.map((e) => `${e.type}:${e.count}`).sort() })) });
for (const id of ENDLESS_THEME_IDS) {
  const { seed, w } = shape[id], run = mkRun(seed);
  run.coins = 99999; run.wave = w - 1; run.phase = 'prep'; run.prepT = 5;
  const pv = run.nextWavePreview();
  ok(pv.wave === w && pv.mod && pv.mod.id === id && pv.mod.theme === true && pv.mod.name === ENDLESS_THEMES[id].name && pv.mod.desc === ENDLESS_THEMES[id].desc, id + ' preview reports the theme as mod');
  ok(run.startWave(true), 'wave starts');
  const ev = run.drain().find((e) => e.k === 'wave');
  ok(ev && ev.mod === id && ev.theme === id && ev.w === w, 'wave event names the theme');
  const cur = run.currentWaveInfo();
  eq(norm(cur), norm(pv), id + ': what the preview showed is what spawns');
  ok(cur.mod && cur.mod.id === id && cur.mod.theme === true, 'currentWaveInfo reports it');
  eq(run.themedWaves, [{ wave: w, id }], 'themed waves are tracked');
  // snapshot and restore mid wave
  for (let i = 0; i < 40; i++) { run.advance(0.1); run.drain(); }
  const snap = JSON.parse(JSON.stringify(run.snapshot()));
  const back = Run.restore(snap);
  ok(back.wmId === id && back.wm === ENDLESS_THEMES[id].wm, id + ' restored wave mod');
  eq(norm(back.currentWaveInfo()), norm(run.currentWaveInfo()), 'restored info matches');
  for (let i = 0; i < 80; i++) { run.advance(0.1); run.drain(); back.advance(0.1); back.drain(); }
  eq(JSON.parse(JSON.stringify(back.snapshot())), JSON.parse(JSON.stringify(run.snapshot())), id + ': restored run plays on identically');
  const rc = run.recap(); eq(rc.themes, [{ wave: w, id, name: ENDLESS_THEMES[id].name }], 'recap lists the theme');
}
// the same seed gives the same themes in two runs, and the preview is stable between calls
{ const a = mkRun(11), b = mkRun(11); a.wave = b.wave = 14; eq(norm(a.nextWavePreview()), norm(b.nextWavePreview()), 'deterministic preview'); eq(a.nextWavePreview(), a.nextWavePreview(), 'stable preview'); }
// a normal endless wave has no theme flag and the story mode never gets one
{ const r = mkRun(3); r.wave = 8; const pv = r.nextWavePreview(); ok(!pv.mod || !pv.mod.theme, 'plain wave: no theme'); }
{ const r = new Run({ world: 'garage', seed: 2, mode: 'story' }); r.wave = 14; const pv = r.nextWavePreview(); ok(!pv.mod || !pv.mod.theme, 'story wave 15: no theme'); }

// ---- Echo Chamber: a mini of a mini splits once more, and not a third time
{
  const { seed, w } = shape.echo_chamber, run = mkRun(seed);
  run.coins = 99999; run.wave = w - 1; run.phase = 'prep'; run.startWave(true); run.drain();
  for (let i = 0; i < 60 && !run.enemies.some((e) => e.type === 'echo'); i++) { run.advance(0.1); run.drain(); }
  const echo = run.enemies.find((e) => e.type === 'echo'); ok(echo, 'an echo spawned');
  run.kill(echo); const minis = run.enemies.filter((e) => e.type === 'mini' && e.gen === 1); ok(minis.length === 2, 'echo leaves two minis');
  const before = run.enemies.length; run.kill(minis[0]);
  const micro = run.enemies.filter((e) => e.type === 'mini' && e.gen === 2); ok(micro.length === 2, 'a mini splits again in the Echo Chamber');
  run.kill(micro[0]); ok(run.enemies.filter((e) => e.type === 'mini' && e.gen === 3).length === 0 && run.enemies.filter((e) => e.gen === 2).length === 1, 'and no third split');
  // outside the theme a mini just dies
  const plain = mkRun(5); plain.coins = 99999; plain.wave = 4; plain.phase = 'prep'; plain.startWave(true); plain.drain();
  const pe = plain.spawnEnemy({ type: 'echo', lane: 0, hpBase: 100, w: 5 }); plain.kill(pe); const pm = plain.enemies.filter((e) => e.type === 'mini'); plain.kill(pm[0]);
  ok(plain.enemies.filter((e) => e.type === 'mini').length === 1, 'no second split outside the Echo Chamber');
}

// ---- the battle: theme banner and per-boss hint cards
function stubApp(profile) {
  const log = { hints: [] };
  return { log, profile, audio: AudioFx, hooks: { toast() {}, spendDiamonds() {}, onPause() {}, onChoice() {}, onHint: (id, done) => { log.hints.push(id); done(); }, onEnd() {}, bossIntro() {} } };
}
{
  const p = M.newProfile(0); p.tutorial.done = true; const app = stubApp(p);
  const { seed, w } = shape.swarm, run = mkRun(seed); const b = new Battle(app, { run });
  b.handleEvents([{ k: 'wave', w, mod: 'swarm', boss: null, total: 0, theme: 'swarm' }]);
  ok(b.banner && /THEME WAVE: SWARM/.test(b.banner.text), 'the banner shows the theme name: ' + (b.banner && b.banner.text));
  ok(b.banner.sub.includes('WAVE ' + w) && b.banner.sub.includes(ENDLESS_THEMES.swarm.desc), 'the line under it has the wave and the description');
  const b2 = new Battle(stubApp(M.newProfile(0)), { run: mkRun(1) }); b2.handleEvents([{ k: 'wave', w: 6, mod: 'happy_hour', boss: null, total: 0 }]);
  ok(/WAVE 6/.test(b2.banner.text), 'a normal wave mod banner is unchanged');
}
for (const id of ['compressor', 'noisegate', 'reverb', 'djglitch', 'playback', 'lowpass', 'silence']) {
  const h = HINTS['boss_' + id]; ok(h && h.title === BOSSES[id].name, 'hint boss_' + id + ' is titled with the boss name');
  ok(h.text.split(/[.!?]\s/).length <= 3 && h.text.length < 220 && !h.text.includes(EM), 'two short sentences, no em dash');
  ok(HINTS_EXTRA['boss_' + id] === h, 'merged from HINTS_EXTRA');
}
ok(BOSS_IDS.every((id) => HINTS['boss_' + id]), 'every boss has a card');
{
  const p = M.newProfile(0); p.tutorial.done = true; const app = stubApp(p); const b = new Battle(app, { run: mkRun(1, 'moon') });
  b.handleEvents([{ k: 'boss', id: 1, type: 'lowpass', small: false }]);
  eq(app.log.hints, ['boss_lowpass'], 'the first Low-Pass Tide shows its own card');
  b.handleEvents([{ k: 'boss', id: 2, type: 'lowpass', small: false }]); eq(app.log.hints, ['boss_lowpass'], 'only once');
  ok(p.tutorial.hints.boss_lowpass === true && !p.tutorial.hints.boss, 'saved per boss, the generic one is untouched');
  b.handleEvents([{ k: 'boss', id: 3, type: 'silence', small: false }]); eq(app.log.hints, ['boss_lowpass', 'boss_silence'], 'another boss, another card');
  BOSSES.testboss = { id: 'testboss', name: 'Test Boss', hpMul: 1, speed: 20, armor: 0, r: 30, color: '#fff', coins: 1, trick: 'None.' };
  b.handleEvents([{ k: 'boss', id: 4, type: 'testboss', small: false }]); eq(app.log.hints, ['boss_lowpass', 'boss_silence', 'boss'], 'a boss without a card falls back to the generic one');
  delete BOSSES.testboss;
  // the tutorial never shows them
  const p2 = M.newProfile(0); const app2 = stubApp(p2); const b2 = new Battle(app2, { run: mkRun(1, 'moon') }); b2.tut = { i: 0, done: false };
  b2.handleEvents([{ k: 'boss', id: 1, type: 'reverb', small: false }]); eq(app2.log.hints, [], 'not in the tutorial');
  // an old profile that already saw the generic hint still gets each boss card once
  const p3 = M.newProfile(0); p3.tutorial.done = true; p3.tutorial.hints.boss = true; const app3 = stubApp(p3); const b3 = new Battle(app3, { run: mkRun(1, 'moon') });
  b3.handleEvents([{ k: 'boss', id: 1, type: 'compressor', small: false }]); eq(app3.log.hints, ['boss_compressor'], 'old profiles get the per-boss card');
}
console.log('drop_the_bass r4 engine: ' + n + ' checks ok');

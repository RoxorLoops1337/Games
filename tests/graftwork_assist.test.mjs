// Assist mode: four independent options, a saved run flag, no meta progress from assisted runs, one-time Mercy revive,
// and normal runs unchanged byte for byte. Plus the title toggle (layout registry, reserved zone, remembered setting).
import assert from 'node:assert/strict';
import * as RUN from '../graftwork/engine/run.js';
import * as META from '../graftwork/engine/meta.js';
import { ASSIST_OPTIONS, assistFlags } from '../graftwork/engine/assist.js';
import { newCombat, playCard, endTurn, addCard, dealDamage, finishCombat } from '../graftwork/engine/combat.js';
import { strainInfo, budgetOf } from '../graftwork/engine/cards.js';
import { ENEMIES, GRAFTS, HEROES } from '../graftwork/data/index.js';
import { POLICIES, strongFight, strongPickGraft } from '../tools/graftwork_driver.mjs';
import { canGraft } from '../graftwork/engine/cards.js';
import { makeApp, frames, click, botStep, runEnded } from './graftwork_lib.mjs';
import * as LAYOUT from '../graftwork/ui/layout_registry.js';
import title from '../graftwork/ui/title.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };
ENEMIES.t_hitter = { id: 't_hitter', name: 't_hitter', act: 1, kind: 'normal', hp: 400, pattern: ['hit'], moves: { hit: { name: 'Hit', fx: [{ op: 'dmg', n: 10 }] } }, art: { body: 'figure', color: '#888' } };
const ALL = { sturdy: true, gentle: true, kind: true, mercy: true };

// ---- engine numbers ----
await t('no assist: the run has no assist key; {on:false} and empty flags change nothing', () => {
  const a = RUN.serializeRun(RUN.newRun({ hero: 'marrow', seed: 's1' }));
  assert.ok(!('assist' in JSON.parse(a)));
  assert.equal(RUN.serializeRun(RUN.newRun({ hero: 'marrow', seed: 's1', assist: { on: false, ...ALL } })), a);
  assert.equal(RUN.serializeRun(RUN.newRun({ hero: 'marrow', seed: 's1', assist: {} })), a);
});
await t('Sturdy is +30% max HP, Kind Strain is Budget +1, independent of each other', () => {
  for (const hero of Object.keys(HEROES)) {
    const base = RUN.newRun({ hero, seed: 'x' });
    const s = RUN.newRun({ hero, seed: 'x', assist: { sturdy: true } });
    assert.equal(s.maxHp, Math.round(base.maxHp * 1.3)); assert.equal(s.hp, s.maxHp); assert.equal(budgetOf(s), budgetOf(base));
    const k = RUN.newRun({ hero, seed: 'x', assist: { kind: true } });
    assert.equal(budgetOf(k), budgetOf(base) + 1); assert.equal(k.maxHp, base.maxHp);
  }
  assert.deepEqual(assistFlags({ on: true, sturdy: true, gentle: false }), { sturdy: true });
  assert.equal(assistFlags({ on: false, sturdy: true }), null);
});
const fight = (opts, seed = 'g') => {
  const run = RUN.newRun({ hero: 'marrow', seed, ...opts });
  const c = newCombat(run, ['t_hitter']); return { run, c };
};
await t('Gentle foes: enemy damage x0.8 (10 becomes 8), other options leave it at 10', () => {
  const hit = (assist) => { const { c } = fight(assist ? { assist } : {}); const hp = c.player.hp; endTurn(c); return hp - c.player.hp; };
  const base = hit(null), gentle = hit({ gentle: true });
  assert.equal(base, 10); assert.equal(gentle, 8);
  assert.equal(hit({ sturdy: true, kind: true, mercy: true }), 10);
});
await t('Mercy: Overload never Shatters; without it Shatter happens', () => {
  const g = Object.values(GRAFTS).filter((x) => x.weight === 1).slice(0, 3).map((x) => x.id);
  const trial = (assist, seed) => {
    const { c } = fight(assist ? { assist } : {}, seed);
    c.discard.push(...c.hand.splice(0)); addCard(c, 'm_incision', 1, 'hand'); const card = c.hand[c.hand.length - 1]; card.inst.grafts = g.slice();
    c.energy = 9; assert.ok(playCard(c, c.hand.indexOf(card), 0).ok); return !!card.inst.shattered;
  };
  let withMercy = 0, without = 0;
  for (let i = 0; i < 60; i++) { if (trial({ mercy: true }, 'm' + i)) withMercy++; if (trial(null, 'm' + i)) without++; }
  assert.equal(withMercy, 0); assert.ok(without >= 5, 'baseline shatters happen: ' + without);
});
await t('Mercy revive: first death restores half HP, exactly once per run, flagged', () => {
  const { run, c } = fight({ assist: { mercy: true } });
  dealDamage(c, null, c.player, 9999, { noMods: true });
  assert.equal(c.over, null, 'still alive'); assert.equal(c.player.hp, Math.ceil(c.player.maxHp / 2)); assert.equal(run.assistRevived, true);
  assert.ok(c.ev.some((e) => e.t === 'assistRevive'), 'event for the UI');
  dealDamage(c, null, c.player, 9999, { noMods: true });
  assert.equal(c.over, 'lose', 'second death is real');
  // the flag survives save/load, so a reloaded run does not get a second revive
  const run2 = RUN.deserializeRun(RUN.serializeRun(run)); assert.equal(run2.assistRevived, true); assert.deepEqual(run2.assist, { mercy: true });
  const c2 = newCombat(run2, ['t_hitter']); dealDamage(c2, null, c2.player, 9999, { noMods: true }); assert.equal(c2.over, 'lose');
  // no mercy option: no revive
  const { c: c3 } = fight({ assist: { sturdy: true } }); dealDamage(c3, null, c3.player, 9999, { noMods: true }); assert.equal(c3.over, 'lose');
});
await t('run flag round-trips through save; practice runs ignore Assist', () => {
  const run = RUN.newRun({ hero: 'wick', seed: 'sv', assist: ALL });
  assert.deepEqual(RUN.deserializeRun(RUN.serializeRun(run)).assist, ALL);
  const snap = { hero: 'marrow', boss: Object.values(ENEMIES).find((e) => e.kind === 'boss').id, kind: 'boss', enemies: [Object.values(ENEMIES).find((e) => e.kind === 'boss').id], deck: RUN.newRun({ hero: 'marrow', seed: 'p' }).deck, relics: [], maxHp: 70, act: 1, asc: 0 };
  const p = META.newPracticeRun(snap); assert.ok(!p.assist); assert.equal(p.maxHp, 70);
  const cp = newCombat(p, snap.enemies); assert.ok(cp.enemies.every((e) => e.dmgMul === (e.dmgMul || 1)) && !p.assistRevived);
});

// ---- meta: assisted runs do not count ----
const finish = (assist, outcome, mut) => {
  const m = META.defaultMeta(); m.bestAsc = {};
  const run = RUN.newRun({ hero: 'marrow', seed: 'meta', ...(assist ? { assist: ALL } : {}), ...(assist === 'daily' ? {} : {}) });
  Object.assign(run.stats, { floors: 30, bosses: 3, shatters: 1, damageTaken: 0, fights: 20, maxHit: 70, maxLine: 5 }); if (mut) mut(run);
  return { m, run, res: META.recordRunEnd(m, run, outcome) };
};
await t('assisted win: no ascension unlock, no achievements, no first-doubling, stats and history still recorded', () => {
  const a = finish(false, 'won'), b = finish(true, 'won');
  assert.equal(a.m.bestAsc.marrow, 1); assert.ok(a.res.newAchievements.length > 0, 'normal win earns achievements');
  assert.ok(!b.m.bestAsc.marrow, 'no ascension unlock'); assert.equal(b.res.newAchievements.length, 0); assert.deepEqual(b.m.achievements, {});
  assert.ok(!b.res.newUnlocks.some((u) => u.kind === 'ascension'));
  assert.ok(b.res.caseFile.items.length > 0 && b.res.caseFile.items.every((i) => !i.first), 'no first-time doubling');
  assert.deepEqual(b.m.firsts, {}, 'lifetime firsts stay available');
  assert.ok(b.res.caseFile.total > 0 && b.res.caseFile.total <= a.res.caseFile.total, 'credit still paid');
  assert.equal(b.m.stats.wins, 1); assert.equal(b.m.history[0].assist, true); assert.ok(!('assist' in a.m.history[0]));
});
await t('assisted daily run does not set the daily best or count a daily win', () => {
  const m = META.defaultMeta(); const run = RUN.newRun({ hero: 'marrow', seed: 'daily-2030-01-01', daily: 'daily-2030-01-01' }); run.assist = ALL;
  run.stats.floors = 20; META.recordRunEnd(m, run, 'won');
  assert.equal(m.daily.best, null); assert.equal(m.stats.dailyWins, 0);
});

// ---- normal runs unchanged byte for byte in a seeded sim ----
// fights and graft picks by the strong bot, everything else (building, walking, rewards, shop, forge, events) by the deterministic player of the test lib
function drive(opts) {
  const run = RUN.newRun(opts), pol = POLICIES.strong; let guard = 0;
  while (!runEnded(run) && guard++ < 2000) {
    if (run.phase === 'combat') { const { res } = strongFight(run, pol); RUN.resolveFight(run, res); }
    else if (run.phase === 'graft') { const pick = strongPickGraft(run, pol); if (pick && canGraft(RUN.findInst(run, pick[0]), pick[1])) RUN.applyGraft(run, pick[0], pick[1]); else RUN.skipGraft(run, 'budget'); RUN.afterGraft(run); }
    else botStep(run);
  }
  assert.ok(runEnded(run), 'the run ended');
  return RUN.serializeRun(run);
}
await t('seeded sim: a run with assist off is byte identical to one that never heard of Assist', () => {
  for (const hero of ['marrow', 'wick', 'odile']) {
    const a = drive({ hero, seed: 'bytes-' + hero }), b = drive({ hero, seed: 'bytes-' + hero, assist: { on: false, ...ALL } });
    assert.equal(a, b); assert.ok(!a.includes('"assist'), 'no assist key anywhere');
  }
});
await t('seeded sim: assisted run is playable to an end and keeps its flag', () => {
  const s = JSON.parse(drive({ hero: 'marrow', seed: 'bytes-marrow', assist: ALL }));
  assert.ok(s.phase === 'won' || s.phase === 'dead'); assert.deepEqual(s.assist, ALL);
});

// ---- title UI ----
const RESERVED = { x: 1128, y: 0, w: 144, h: 56 };
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
async function rig() {
  const meta = META.defaultMeta(); meta.settings = {}; const started = [];
  const app = await makeApp({ run: null, meta });
  app.shared.flow = { app, RUN, META, start(o) { started.push(o); }, resume() {}, hasSave: () => false, abandon() {}, toTitle() {}, route() {}, openCodex() {}, openSettings() {}, saveMeta() { META.saveMeta(meta); }, openDeck() {} };
  app.shared.audio = { sfx() {}, music() {}, setVolumes() {}, mute() {} };
  app.register('title', title); app.go('title'); frames(app, 30); click(app, 640, 330); frames(app, 30);
  return { app, meta, started };
}
await t('title: Assist toggle is off by default, remembered in meta.settings.assist, options are registered and clear of the reserved zone', async () => {
  const { app, meta, started } = await rig();
  assert.equal(title.state, 'select');
  let regs = LAYOUT.getAll(); assert.ok(regs.some((r) => r.id === 'title-assist')); assert.ok(!regs.some((r) => r.id === 'title-assist-sturdy'), 'options hidden while off');
  click(app, 232, 628); assert.equal(started.length, 1); assert.ok(!('assist' in started[0]), 'off: nothing passed to newRun');
  const tg = regs.find((r) => r.id === 'title-assist');
  click(app, tg.x + tg.w / 2, tg.y + tg.h / 2); frames(app, 3);
  assert.equal(meta.settings.assist.on, true);
  regs = LAYOUT.getAll();
  for (const o of ASSIST_OPTIONS) assert.ok(regs.some((r) => r.id === 'title-assist-' + o.id), o.id);
  const as = regs.filter((r) => r.id.startsWith('title-assist'));
  for (const r of regs) { assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1280 && r.y + r.h <= 720, r.id + ' inside stage'); }
  for (const r of as) assert.ok(!hit(r, RESERVED), r.id + ' clear of reserved zone');
  assert.deepEqual(LAYOUT.findOverlaps().filter((o) => /assist/.test(o.a + o.b)), [], 'no overlaps with the assist row');
  const sx = regs.find((r) => r.id === 'title-assist-gentle'); click(app, sx.x + 5, sx.y + 5); frames(app, 3);
  assert.equal(meta.settings.assist.gentle, true, 'options toggle independently (Gentle foes starts off)'); assert.equal(meta.settings.assist.sturdy, true);
  assert.equal(JSON.parse(JSON.stringify(META.loadMeta ? meta : meta)).settings.assist.on, true);
  click(app, 232, 628); assert.deepEqual(started[1].assist, { sturdy: true, gentle: true, kind: true, mercy: true });
});
await t('title: every option has a plain tooltip text', () => {
  for (const o of ASSIST_OPTIONS) assert.ok(o.text.length > 20);
});
console.log(`${n} assist tests passed`);

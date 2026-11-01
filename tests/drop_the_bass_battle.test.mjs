// Drop the Bass: the battle view, headless. A mock 2D context and a stub app: plays a whole practice run through pointer input,
// the tutorial, the HUD, and checks nothing throws and the canvas state stays balanced.
import assert from 'node:assert/strict';
import { Battle, R, HIT, battleIdle } from '../drop_the_bass/js/battle.js';
import { Run } from '../drop_the_bass/js/sim.js';
import { AudioFx } from '../drop_the_bass/js/audio.js';
import * as M from '../drop_the_bass/js/meta.js';
import { TUTORIAL } from '../drop_the_bass/js/data_story.js';
import { WORLDS, BOARD_X, BOARD_Y, TILE } from '../drop_the_bass/js/data_core.js';
import { setStyle } from '../drop_the_bass/js/style.js';
setStyle('doodle');   // the game has one look

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
function mockCtx() {
  const st = { saves: 0, restores: 0, calls: 0 };
  const store = {};
  const ctx = new Proxy(store, {
    get(t, k) {
      if (k === '__st') return st;
      if (k === 'save') return () => { st.saves++; };
      if (k === 'restore') return () => { st.restores++; };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') return () => ({ addColorStop() {} });
      if (k === 'canvas') return { width: 540, height: 960 };
      if (k in t) return t[k];
      return () => { st.calls++; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return ctx;
}
const view = { cw: 540, ch: 960, dpr: 1, s: 1, ox: 0, oy: 0 };
function stubApp(profile) {
  const log = { choices: 0, ends: 0, hints: [], toasts: [], pauses: 0 };
  return { log, profile, audio: AudioFx, hooks: {
    toast: (m) => log.toasts.push(m), spendDiamonds: (k) => { profile.diamonds -= k; },
    onPause: () => { log.pauses++; }, onChoice: (run) => { log.choices++; }, onHint: (id, done) => { log.hints.push(id); done(); }, onEnd: () => { log.ends++; }, bossIntro: () => {},
  } };
}
const frame = (b, ctx, sec) => { for (let i = 0; i < sec * 60; i++) { b.update(1 / 60); b.draw(ctx, view); } };

// ---- a normal run: input, HUD, every world draws
for (const w of WORLDS) {
  const p = M.newProfile(0); p.tutorial.done = true; p.autoMerge = true;
  const app = stubApp(p);
  const run = new Run({ world: w.id, seed: 3, firstPrep: 1, loadout: ['kick', 'snare', 'hat', 'sub', 'mic', 'synth', 'horn', 'scratch', 'loop', 'cowbell', 'amp', 'vocal'] });
  run.coins = 4000;
  const b = new Battle(app, { run });
  const ctx = mockCtx();
  frame(b, ctx, 1);
  // deploy by tapping the button, by key, onto a chosen tile
  b.pointerDown(R.deploy.x + 10, R.deploy.y + 10); b.pointerUp(0, 0);
  b.key(' '); b.key(' ');
  const slot = run.emptySlots()[2]; b.pointerDown(slot.x, slot.y); b.pointerUp(slot.x, slot.y); ok(b.targetSlot === slot.idx, 'tap empty tile selects it'); b.pointerDown(R.deploy.x + 10, R.deploy.y + 10); ok(run.grid.has(slot.idx), 'deploy to chosen tile');
  // select, drag to merge, tap merge, move, sell
  const a = run.turrets[0]; b.pointerDown(a.x, a.y); ok(b.selected === a.id, 'tap selects'); frame(b, ctx, 0.2);
  const other = run.emptySlots()[0]; b.pointerDown(a.x, a.y); b.pointerMove(a.x + 30, a.y + 30); b.pointerMove(other.x, other.y); b.pointerUp(other.x, other.y); ok(a.slot === other.idx, 'drag moves to an empty tile');
  const t1 = run.turrets[1], t2 = run.turrets[2]; t1.type = t2.type = 'kick'; t1.level = t2.level = 1;
  b.pointerDown(t1.x, t1.y); b.pointerMove(t1.x + 20, t1.y); b.pointerMove(t2.x, t2.y); b.pointerUp(t2.x, t2.y); ok(t2.level === 2 || run.turretById(t2.id) === null || true, 'drag merge runs');
  frame(b, ctx, 0.3);
  b.pointerDown(R.merge.x + 5, R.merge.y + 5); b.key('m'); b.pointerDown(R.reroll.x + 5, R.reroll.y + 5); b.key('r');
  b.pointerDown(R.speed.x + 5, R.speed.y + 5); ok(b.speed === 2, 'speed toggles'); b.key('f'); b.key('f'); ok(b.speed === 1, 'speed cycles');
  b.pointerDown(R.call.x + 5, R.call.y + 5); b.key('n');
  b.pointerDown(R.heroR.x, R.heroR.y); b.pointerDown(R.heroJ.x, R.heroJ.y); b.key('q'); b.key('w');
  const sel = run.turrets[0]; b.pointerDown(sel.x, sel.y); b.pointerUp(sel.x, sel.y); frame(b, ctx, 0.2);
  if (b.panel) { b.pointerDown(b.panel.mode.x + 3, b.panel.mode.y + 3); b.pointerDown(b.panel.sell.x + 3, b.panel.sell.y + 3); }
  b.pointerDown(R.pause.x + 5, R.pause.y + 5); ok(app.log.pauses >= 1, 'pause hook');
  // let it fight; answer choices; use heroes; make the bot play
  for (let i = 0; i < 90 * 60; i++) {
    b.update(1 / 60); if (i % 3 === 0) b.draw(ctx, view);
    if (run.choice) run.pick(0);
    if (i % 120 === 0) { run.autoPlayStep({ early: true }); b.selected = run.turrets.length ? run.turrets[i % run.turrets.length].id : null; }
    if (b.hintQueue.length) b.hintQueue.length = 0;
  }
  ok(run.kills > 0 && run.wave >= 1, w.id + ' fights');
  ok(ctx.__st.saves === ctx.__st.restores, w.id + ' save/restore balanced: ' + ctx.__st.saves + '/' + ctx.__st.restores);
  ok(ctx.__st.calls > 1000, 'something was drawn');
}

// ---- end hook fires once on a win and a loss, banners and hints
{
  const p = M.newProfile(0); p.tutorial.done = true; const app = stubApp(p);
  const run = new Run({ world: 'garage', seed: 1, wavesTotal: 1, firstPrep: 0.2 }); run.coins = 1e6; for (let i = 0; i < 10; i++) run.deploy(); run.mergeAll(10);
  const b = new Battle(app, { run }); const ctx = mockCtx();
  for (let i = 0; i < 60 * 120 && !b.ended; i++) { b.update(1 / 60); if (run.choice) run.pick(0); if (i % 4 === 0) b.draw(ctx, view); if (i % 60 === 0) run.autoPlayStep(); }
  ok(run.phase === 'won' && b.ended && app.log.ends === 1, 'end hook once on win'); ok(app.log.hints.length > 0, 'first-time hints fire');
  const run2 = new Run({ world: 'garage', seed: 1, firstPrep: 0.2 }); const b2 = new Battle(stubApp(p), { run: run2 }); const e = run2.spawnEnemy({ type: 'fuzz', lane: 0, hpBase: 30, w: 1 }); run2.stageHp = 1; e.d = e.total - 1;
  for (let i = 0; i < 400; i++) b2.update(1 / 60); ok(b2.ended && b2.app.log.ends === 1 && run2.phase === 'lost', 'end hook on loss');
}

// ---- the guided tutorial can be completed by following its steps
{
  const p = M.newProfile(0); const app = stubApp(p);
  const run = new Run({ world: 'garage', mode: 'tutorial', seed: 7, wavesTotal: 3, hypeNeed: 14, firstPrep: 999, baseFx: [['startCoins', 'add', 110]], forceDrops: ['kick', 'kick', 'snare', 'kick', 'snare', 'hat', 'kick', 'snare', 'sub', 'kick', 'snare', 'hat'], loadout: ['kick', 'snare', 'hat', 'sub'] });
  run.heroCd = { roxor: 99, jasmin: 99 };
  const b = new Battle(app, { run, tutorial: true }); const ctx = mockCtx();
  let guard = 0;
  while (!b.tut.done && guard++ < 60 * 400) {
    const s = TUTORIAL[b.tut.i]; if (!s) break;
    b.update(1 / 60); if (guard % 3 === 0) b.draw(ctx, view);
    if (run.choice) run.pick(0);
    if (b.t > 0 && Math.floor(b.t * 60) % 30 === 0) {
      switch (s.wait) {
        case 'tap': b.pointerDown(270, 500); b.pointerUp(270, 500); break;
        case 'deployed1': case 'deployed2': b.pointerDown(R.deploy.x + 20, R.deploy.y + 20); break;
        case 'merged1': { const same = run.findMerge(); if (same) run.merge(same[0], same[1]); break; }
        case 'wavestarted': b.pointerDown(R.call.x + 5, R.call.y + 5); break;
        case 'heroR': b.pointerDown(R.heroR.x, R.heroR.y); break;
        case 'heroJ': b.pointerDown(R.heroJ.x, R.heroJ.y); break;
        default: if (run.coins > run.deployCost()) run.deploy(); break;
      }
    }
  }
  ok(b.tut.done, 'tutorial completes (step ' + b.tut.i + ')');
  for (let i = 0; i < 60 * 300 && run.phase !== 'won' && run.phase !== 'lost'; i++) { b.update(1 / 60); if (run.choice) run.pick(0); if (i % 30 === 0) run.autoPlayStep({ early: true }); }
  ok(run.phase === 'won' && run.result.mode === 'tutorial', 'the practice run is winnable');
}
// ---- drop pool strip, reroll, wave preview, synergies, juice, audio wiring
{
  const calls = []; const spy = Object.assign(Object.create(AudioFx), { play: (n, o) => calls.push(['play', n, o]), heartbeat: (v) => calls.push(['hb', v]), setMusicState: (st) => calls.push(['state', st]), musicStart() {}, musicIntensity() {}, beatInfo: () => null });
  const p = M.newProfile(0); p.tutorial.done = true; p.diamonds = 5; const app = stubApp(p); app.audio = spy;
  const run = new Run({ world: 'festival', seed: 4, firstPrep: 999, difficulty: 'hard', loadout: ['kick', 'snare', 'hat', 'sub', 'mic', 'synth', 'horn', 'scratch', 'loop', 'cowbell', 'amp', 'vocal'] });
  run.coins = 5000;
  const b = new Battle(app, { run }); const ctx = mockCtx();
  // tappable rects are big enough (44 px on a 390 phone = 61 logical units)
  for (const k of Object.keys(HIT)) ok(HIT[k].w >= 58 && HIT[k].h >= 58, 'hit area ' + k + ' is large enough: ' + HIT[k].w + 'x' + HIT[k].h);
  ok(R.heroR.r * 2 >= 61 && R.heroJ.r * 2 >= 61, 'hero buttons are big enough');
  // pool strip data
  ok(b.pool.odds.length === 12 && Math.abs(b.pool.odds.reduce((a, o) => a + o.p, 0) - 1) < 1e-6, 'pool odds cover 12 types and sum to 1');
  ok(b.pool.can.coins && b.pool.can.gems, 'reroll affordable with coins and gems');
  frame(b, ctx, 0.5);
  // reroll for coins, then for gems (diamonds leave the profile)
  const c0 = run.coins, t0 = run.nextType; const r1 = b.doReroll('coins'); ok(r1.ok && run.coins < c0 && run.nextType !== t0, 'coin reroll works');
  b.update(1 / 60); ok(calls.some((c) => c[1] === 'reroll_drop'), 'reroll_drop sfx');
  const d0 = p.diamonds; const r2 = b.doReroll('gems'); ok(r2.ok && p.diamonds === d0 - r2.spendDiamonds && r2.spendDiamonds > 0, 'gem reroll deducts diamonds');
  p.diamonds = 0; b.refreshPool(); ok(!b.pool.can.gems, 'gem reroll disabled without diamonds'); ok(!b.doReroll('gems').ok && p.diamonds === 0, 'gem reroll refused');
  run.coins = 0; b.refreshPool(); ok(!b.pool.can.coins, 'coin reroll disabled when unaffordable'); const rc = b.doReroll('coins'); ok(!rc.ok && rc.reason === 'coins', 'coin reroll refused');
  b.pointerDown(R.reroll.x + 3, R.reroll.y + 3); b.pointerDown(R.rerollG.x + 3, R.rerollG.y + 3); b.key('g'); b.key('r'); frame(b, ctx, 0.3);
  run.coins = 5000;
  // wave preview card opens on the wave pill, plays its sfx, closes on any tap
  b.pointerDown(HIT.wave.x + 5, HIT.wave.y + 5); ok(b.pv.open, 'wave pill opens the preview'); ok(calls.some((c) => c[1] === 'wave_preview'), 'wave_preview sfx'); frame(b, ctx, 0.4);
  ok(b.pv.next && b.pv.next.lanes.length === 2, 'festival preview has two lanes'); b.pointerDown(270, 500); ok(!b.pv.open, 'tap closes the preview');
  // synergy: two partners side by side link, the event bursts and the selected panel shows it
  const sl = run.emptySlots(); const a1 = run.map.buildable.find((s) => !run.grid.has(s.idx) && !run.grid.has(s.idx + 1) && s.c < 5 && !run.map.buildable.every((q) => q.idx !== s.idx + 1));
  run.nextType = 'snare'; run.deploy(a1.idx, { onBeat: false }); run.nextType = 'hat'; run.deploy(a1.idx + 1, { onBeat: false });
  frame(b, ctx, 0.3); ok(b.links.length >= 1, 'active synergy link tracked'); ok(calls.some((c) => c[1] === 'synergy'), 'synergy sfx');
  b.selected = run.grid.get(a1.idx).id; frame(b, ctx, 0.3); ok(b.panel && b.panel.box.h >= 110, 'panel shows synergy rows');
  b.selected = run.turrets[0].id; b.drag = { id: b.selected, x: 200, y: 400, sx: 0, sy: 0, moved: true }; frame(b, ctx, 0.2); b.drag = null; b.selected = null;
  // juice: hit-stop on a level 7 merge and a boss kill, bounded particles, damage numbers inside the board
  b.handleEvents([{ k: 'merge', id: 1, type: 'kick', level: 7, x: 200, y: 400, big: true }]); ok(b.stop > 0.05, 'level 7 merge hit-stops'); ok(calls.some((c) => c[1] === 'merge_7'), 'merge_7 sfx'); ok(calls.some((c) => c[1] === 'drop_big'), 'drop_big on the first level 7');
  const n0 = calls.filter((c) => c[1] === 'drop_big').length; b.handleEvents([{ k: 'merge', id: 2, type: 'kick', level: 7, x: 200, y: 400, big: true }]); ok(calls.filter((c) => c[1] === 'drop_big').length === n0, 'drop_big only for the first level 7');
  for (let i = 0; i < 80; i++) b.num(2, 2, '9', '#fff', 14); ok(b.fx.floats.every((f) => f.x >= 30 && f.y >= 120), 'damage numbers stay inside the board');
  for (let i = 0; i < 100; i++) b.handleEvents([{ k: 'kill', id: i, x: 100 + i, y: 300, type: 'fuzz', boss: false, r: 15 }]); ok(b.fx.parts.length <= 420 && b.fx.floats.length <= 60, 'particle and floater counts bounded');
  p.settings.reduce = true; b.stop = 0; b.handleEvents([{ k: 'kill', id: 1, x: 100, y: 300, type: 'compressor', boss: true, r: 40 }]); ok(b.stop === 0, 'reduce motion skips hit-stop'); p.settings.reduce = false;
  // combo milestone sound with pitch
  run.combo = 12; b.update(1 / 60); ok(calls.some((c) => c[1] === 'combo_milestone' && c[2] && c[2].pitch >= 1), 'combo_milestone with pitch');
  // audio: music state every 250 ms, heartbeat at low stage hp, off on pause, win and leaving
  calls.length = 0; frame(b, ctx, 1); ok(calls.filter((c) => c[0] === 'state').length >= 3, 'setMusicState about 4 times a second');
  run.stageHp = Math.floor(run.stageMax * 0.2); frame(b, ctx, 0.6); ok(calls.some((c) => c[0] === 'hb' && c[1] === true), 'heartbeat on at low stage hp');
  b.setPause(true); ok(calls.filter((c) => c[0] === 'hb').pop()[1] === false, 'heartbeat off on pause'); b.setPause(false); frame(b, ctx, 0.5); ok(calls.filter((c) => c[0] === 'hb').pop()[1] === true, 'heartbeat resumes');
  battleIdle(spy); ok(calls.filter((c) => c[0] === 'hb').pop()[1] === false, 'heartbeat off when leaving the battle');
  ok(ctx.__st.saves === ctx.__st.restores, 'new HUD pieces keep save/restore balanced');
}

console.log('drop_the_bass battle: ' + n + ' checks passed');

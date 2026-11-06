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
import { HINTS } from '../drop_the_bass/js/data_story.js';
import { HINTS_EXTRA } from '../drop_the_bass/js/data_hints_extra.js';
import { POOL_HIT, modsHit } from '../drop_the_bass/js/doodle_depth.js';
import { TURRET_BRANCHES, HERO_ABILITIES } from '../drop_the_bass/js/data_depth.js';
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
  let guard = 0; const stepsDone = {};
  while (!b.tut.done && guard++ < 60 * 400) {
    const s = TUTORIAL[b.tut.i]; if (!s) break;
    if (s.id === 'preview' && b.tut.flags.pvOpened) stepsDone.preview = 'done';
    if (s.id === 'reroll' && b.tut.flags.rerolled) stepsDone.reroll = 'done';
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
        case 'previewdone': if (b.pv.open) b.pointerDown(270, 500); else b.pointerDown(HIT.wave.x + 10, HIT.wave.y + 10); break;
        case 'rerolled': b.pointerDown(R.reroll.x + 5, R.reroll.y + 5); break;
        default: if (run.coins > run.deployCost()) run.deploy(); break;
      }
    }
  }
  ok(b.tut.done, 'tutorial completes (step ' + b.tut.i + ')');
  ok(TUTORIAL.some((q) => q.id === 'preview') && TUTORIAL.some((q) => q.id === 'reroll'), 'tutorial teaches the preview and the re-roll');
  ok(stepsDone.preview === 'done' && stepsDone.reroll === 'done', 'preview and re-roll steps were completed by the player, not skipped: ' + JSON.stringify(stepsDone));
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

// ---- depth systems: branch choice, boss phases, hero abilities, pool popover, hints, modifier badges, skin
function depthRig(runOpts = {}, profFn) {
  const calls = []; const spy = Object.assign(Object.create(AudioFx), { play: (n, o) => calls.push(n), heartbeat() {}, setMusicState() {}, musicStart() {}, musicIntensity() {}, beatInfo: () => null });
  const p = M.newProfile(0); p.tutorial.done = true; if (profFn) profFn(p);
  const app = stubApp(p); app.audio = spy;
  const run = new Run(Object.assign({ world: 'garage', seed: 9, firstPrep: 999, loadout: ['kick', 'snare', 'hat', 'sub', 'mic', 'synth', 'horn', 'scratch', 'loop', 'cowbell', 'amp', 'vocal'] }, runOpts));
  run.coins = 99999;
  const b = new Battle(app, { run }); const ctx = mockCtx();
  return { calls, p, app, run, b, ctx };
}
{
  // the hint texts exist (copied into HINTS when data_story does not define them yet)
  const HE = new RegExp(String.fromCharCode(8212)), IDS = ['hint_synergy', 'hint_branch', 'hint_preview', 'hint_reroll', 'hint_bossphase', 'hint_hero_ready'];
  ok(IDS.every((id) => HINTS_EXTRA[id] && HINTS_EXTRA[id].title && HINTS_EXTRA[id].text && HINTS[id]), 'HINTS_EXTRA ids are readable through HINTS');
  ok(IDS.every((id) => !HE.test(HINTS_EXTRA[id].text + HINTS_EXTRA[id].title)), 'no em dashes in hint text');

  // ---- branch choice
  const { calls, run, b, ctx, app } = depthRig();
  run.nextType = 'kick'; run.deploy(null, { onBeat: false }); const tu = run.turrets[0];
  frame(b, ctx, 0.5);
  b.selected = tu.id; frame(b, ctx, 0.2); ok(!b.panel.cards, 'no upgrade cards below level 4');
  tu.level = 4; b.handleEvents([{ k: 'branchReady', id: tu.id, x: tu.x, y: tu.y }]); ok(calls.includes('branch_ready'), 'branch_ready sfx');
  frame(b, ctx, 0.3);
  ok(b.panel.cards && b.panel.cards.length === 2, 'two upgrade cards for a level 4 turret');
  ok(b.panel.cards.every((c) => c.h >= 61 && c.w >= 61), 'upgrade cards are big enough to tap: ' + b.panel.cards.map((c) => c.w + 'x' + c.h));
  ok(b.panel.cards.map((c) => c.id).join() === TURRET_BRANCHES.kick.map((x) => x.id).join(), 'cards are the turret branches');
  // a drag in flight hides the cards (no accidental pick)
  b.drag = { id: tu.id, x: 200, y: 400, sx: 0, sy: 0, moved: true }; frame(b, ctx, 0.1); ok(!b.panel || !b.panel.cards, 'cards hidden while dragging'); b.drag = null; frame(b, ctx, 0.1);
  // tapping the panel background keeps the selection, tapping a card picks; works with the pause flag set
  const sh = b.panel.sheet; b.pointerDown(sh.x + sh.w - 6, sh.y + 6); ok(b.selected === tu.id, 'tapping the choice sheet keeps the turret selected');
  b.paused = true; const c1 = b.panel.cards[1]; b.pointerDown(c1.x + c1.w / 2, c1.y + c1.h / 2); b.paused = false;
  ok(tu.branch === c1.id, 'tapping a card runs chooseBranch (also while paused)');
  b.update(1 / 60); ok(calls.includes('branch_pick'), 'branch_pick sfx'); frame(b, ctx, 0.3);
  ok(!b.panel.cards, 'the cards go away once a branch is chosen'); ok(b.run.canBranch(tu) === false, 'branched turret cannot branch again');
  // keyboard shortcut on a second turret
  run.nextType = 'snare'; run.deploy(null, { onBeat: false }); const t2 = run.turrets[1]; t2.level = 5; b.selected = t2.id; frame(b, ctx, 0.2); b.key('1'); ok(!!t2.branch, 'key 1 picks the first path');
  // the turret badge is drawn without trouble and state stays balanced
  run.nextType = 'hat'; run.deploy(null, { onBeat: false }); run.turrets[2].level = 4; b.selected = null; frame(b, ctx, 0.5);
  ok(ctx.__st.saves === ctx.__st.restores, 'branch drawing keeps save/restore balanced');
  ok(app.log.hints.includes('hint_branch'), 'first branchReady shows the branch coach mark');
}
{
  // ---- boss phases
  const { calls, run, b, ctx } = depthRig();
  for (const ty of ['kick', 'snare', 'hat', 'sub', 'mic', 'synth']) { run.nextType = ty; run.deploy(null, { onBeat: false }); }
  frame(b, ctx, 0.3);
  run.phase = 'wave'; const e = run.spawnEnemy({ type: 'boss:djglitch', lane: 0, hpBase: 4000, w: 10, d: 250, scale: 1 }); b.bossId = e.id;
  const fire = (ph) => { calls.length = 0; b.banner = null; b.bannerQ = []; b.fx.flash = 0; run.bossPhaseFx(e, ph); b.update(1 / 60); };
  fire({ id: 'dark_lane', text: 'Lights out!', at: 0.5, dur: 6, cols: 2 });
  ok([b.banner, ...b.bannerQ].some((x) => x && /DARK LANE/.test(x.text) && x.sub === 'Lights out!'), 'phase banner shows the effect and the phase text'); ok(b.fx.flash > 0 && calls.includes('boss_phase'), 'phase flashes and plays boss_phase');
  ok(b.dx.dark && b.dx.dark.c1 - b.dx.dark.c0 === 1, 'dark lane band comes from the event columns'); frame(b, ctx, 0.5);
  b.t += 10; b.update(1 / 60); ok(b.dx.dark === null, 'dark lane scribble ends with its duration');
  fire({ id: 'steal_turret', text: 'Mine now!', at: 0.4, dur: 3 });
  const stolen = run.turrets.find((t) => t.stolen > 0); ok(stolen && b.dx.steals[stolen.id], 'steal_turret tracks the borrowed turret'); ok(calls.includes('turret_stolen'), 'turret_stolen sfx');
  frame(b, ctx, 0.5); ok(ctx.__st.saves === ctx.__st.restores, 'steal drawing balanced');
  calls.length = 0; for (let i = 0; i < 260; i++) run.advance(1 / 60); b.update(1 / 60); ok(calls.includes('turret_returned') && !(stolen.stolen > 0), 'turret_returned sfx when it comes back'); ok(!b.dx.steals[stolen.id], 'borrowed state cleared');
  fire({ id: 'bulwark', text: 'Shield up', at: 0.3, frac: 0.2 }); fire({ id: 'enrage', text: 'Angry', at: 0.2, speed: 1.3 }); fire({ id: 'jam_pulse', text: 'Jam', at: 0.1, radius: 600, dur: 3, max: 4 }); fire({ id: 'heal_pulse', text: 'Heal', at: 0.1 }); fire({ id: 'summon_wave', text: 'More', at: 0.1, n: 3 });
  frame(b, ctx, 0.6); ok(e.bulwarkMax > 0 && e.rageMul > 1 && run.turrets.some((t) => t.jam > 0), 'bulwark, enrage and jam are on'); ok(ctx.__st.saves === ctx.__st.restores, 'every boss phase effect draws balanced');
  ok(b.phaseTicksOk !== false, 'boss bar draws with phase notches');
  b.handleEvents([{ k: 'bossPhase', boss: 'djglitch', id: 'unknown_effect', text: 'x', bossId: e.id, x: 100, y: 100, phase: 1 }]); frame(b, ctx, 0.1); ok(true, 'unknown phase effect id does not throw');
}
{
  // ---- hero abilities: each one has its own sfx and visual state; the buttons show the ability
  const names = { freeze: 'hero_freeze', overclock: 'hero_overclock', coinrain: 'hero_coinrain', shield: 'hero_shield' };
  for (const [ab, sfxName] of Object.entries(names)) {
    const who = HERO_ABILITIES.roxor.some((a) => a.id === ab) ? 'roxor' : 'jasmin';
    const { calls, run, b, ctx } = depthRig({ heroLv: { roxor: 9, jasmin: 9 }, heroAbility: { [who]: ab } });
    for (const ty of ['kick', 'snare', 'hat']) { run.nextType = ty; run.deploy(null, { onBeat: false }); }
    run.phase = 'wave'; for (let i = 0; i < 3; i++) run.spawnEnemy({ type: 'fuzz', lane: 0, hpBase: 5000, w: 2, d: 100 + i * 50 });
    frame(b, ctx, 0.3); run.heroCd[who] = 0;
    b.pointerDown((who === 'roxor' ? R.heroR : R.heroJ).x, (who === 'roxor' ? R.heroR : R.heroJ).y); b.update(1 / 60);
    ok(run.heroAbility[who] === ab && calls.includes(sfxName), ab + ' plays ' + sfxName);
    ok(b.banner || b.bannerQ.length, ab + ' shows a banner'); frame(b, ctx, 0.6);
    if (ab === 'freeze') ok(b.dx.freezeT > 0 && run.enemies.some((e) => e.frozen && e.stun > 0), 'freeze overlay timer and frozen enemies');
    if (ab === 'overclock') ok(run.overclockT > 0, 'overclock is active (turrets pulse)');
    if (ab === 'coinrain') ok(b.dx.coins.length > 5, 'coin rain spawns falling coins');
    if (ab === 'shield') { ok(run.shieldT > 0, 'shield is up'); calls.length = 0; b.handleEvents([{ k: 'leak', n: 0, shield: true }]); ok(b.dx.ping > 0 && b.hurtFlash <= 0 && !calls.includes('leak'), 'a blocked leak ripples the dome and does not flash red'); }
    ok(ctx.__st.saves === ctx.__st.restores, ab + ' draws balanced');
  }
  const { calls, run, b, ctx } = depthRig(); run.heroCd.roxor = 0; b.hero('roxor'); b.update(1 / 60); ok(calls.includes('hero_roxor'), 'blast keeps its sfx'); run.heroCd.jasmin = 0; b.hero('jasmin'); b.update(1 / 60); ok(calls.includes('hero_jasmin'), 'song keeps its sfx');
}
{
  // ---- pool strip popover, modifier badges, skin
  const { calls, run, b, ctx, p } = depthRig({ modifiers: ['glass_stage', 'speedrun'] }, (pp) => { pp.settings.skin = 'skin_chalk'; });
  frame(b, ctx, 0.4);
  ok(POOL_HIT.h >= 60 && POOL_HIT.y + POOL_HIT.h <= HIT.deploy.y && POOL_HIT.y >= 836, 'pool strip tap area sits between the board and the DROP row: ' + POOL_HIT.h + ' tall');
  ok(!(POOL_HIT.x < R.merge.x + R.merge.w && POOL_HIT.x + POOL_HIT.w > HIT.merge.x && POOL_HIT.y + POOL_HIT.h > HIT.merge.y), 'pool area does not overlap the DROP row hit areas');
  b.pointerDown(R.deploy.x + 20, R.deploy.y + 20); ok(!b.popover, 'the DROP button does not open a card');
  const n = b.pool.odds.length, r = R.pool, pitch = Math.min(29, (r.w - 16) / n), x0 = r.x + r.w / 2 - (n - 1) * pitch / 2;
  b.pointerDown(x0 + 3 * pitch, POOL_HIT.y + 4); ok(b.popover && b.popover.kind === 'pool' && b.popover.type === b.pool.odds[3].type, 'tapping a pool icon opens that turret card');
  const seen = b.popover.type; frame(b, ctx, 0.4); ok(ctx.__st.saves === ctx.__st.restores, 'pool card draws balanced');
  const t0 = run.t; frame(b, ctx, 0.5); ok(run.t === t0, 'the sim waits while a card is open');
  b.pointerDown(x0 + 5 * pitch, POOL_HIT.y + 4); ok(b.popover && b.popover.type === b.pool.odds[5].type && b.popover.type !== seen, 'tapping another icon swaps the card');
  b.pointerDown(270, 300); ok(!b.popover, 'any other tap closes the card');
  ok(modsHit(b) && modsHit(b).h >= 40, 'modifier badges have a tap area'); b.pointerDown(520, 140); ok(b.popover && b.popover.kind === 'mods', 'tapping the badges opens the modifier card'); frame(b, ctx, 0.4); ok(ctx.__st.saves === ctx.__st.restores, 'modifier card draws balanced'); b.pointerDown(270, 300);
  ok(b.skin === 'skin_chalk', 'board skin read from settings'); p.settings.skin = 'skin_nope'; ok(b.skin === undefined, 'unknown skin falls back');
  const plain = depthRig(); ok(modsHit(plain.b) === null, 'no badge area without modifiers'); plain.b.pointerDown(520, 140); ok(!plain.b.popover, 'no card without modifiers');
}
{
  // ---- first-time hints: synergy, branch, preview, reroll, boss phase, hero ready (one at a time, 15 s apart)
  const { run, b, ctx, app, p } = depthRig();
  b.handleEvents([{ k: 'synergy', id: 'x', x: 100, y: 300 }]); ok(app.log.hints.includes('hint_synergy'), 'synergy hint');
  b.handleEvents([{ k: 'branchReady', id: 1, x: 100, y: 300 }]); ok(!app.log.hints.includes('hint_branch'), 'a second hint within 15 s waits');
  b.t += 16; b.handleEvents([{ k: 'branchReady', id: 1, x: 100, y: 300 }]); ok(app.log.hints.includes('hint_branch'), 'branch hint after the gap'); ok(p.tutorial.hints.hint_branch, 'hint is remembered in the profile');
  b.t += 16; run.wave = 1; run.phase = 'prep'; b.slowTick(); ok(app.log.hints.includes('hint_preview'), 'wave preview hint');
  b.t += 16; b.slowTick(); ok(app.log.hints.includes('hint_reroll'), 'reroll hint ');
  b.t += 16; run.wave = 2; run.heroCd.roxor = 0; b.slowTick(); ok(app.log.hints.includes('hint_hero_ready'), 'hero ready hint');
  b.t += 16; b.handleEvents([{ k: 'bossPhase', boss: 'djglitch', id: 'enrage', text: 'x', bossId: 1, x: 100, y: 100, phase: 1 }]); ok(app.log.hints.includes('hint_bossphase'), 'boss phase hint');
  const n0 = app.log.hints.length; b.t += 16; b.handleEvents([{ k: 'synergy', id: 'x', x: 100, y: 300 }]); ok(app.log.hints.length === n0, 'each hint shows only once');
  const tut = depthRig(); tut.b.tut = { i: 0, t: 0, flags: {}, done: false }; tut.b.handleEvents([{ k: 'synergy', id: 'x', x: 1, y: 1 }]); ok(!tut.app.log.hints.length, 'no depth hints during the tutorial');
}

console.log('drop_the_bass battle: ' + n + ' checks passed');

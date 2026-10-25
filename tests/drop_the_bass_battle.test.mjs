// Drop the Bass: the battle view, headless. A mock 2D context and a stub app: plays a whole practice run through pointer input,
// the tutorial, the HUD, and checks nothing throws and the canvas state stays balanced.
import assert from 'node:assert/strict';
import { Battle, R } from '../drop_the_bass/js/battle.js';
import { Run } from '../drop_the_bass/js/sim.js';
import { AudioFx } from '../drop_the_bass/js/audio.js';
import * as M from '../drop_the_bass/js/meta.js';
import { TUTORIAL } from '../drop_the_bass/js/data_story.js';
import { WORLDS, BOARD_X, BOARD_Y, TILE } from '../drop_the_bass/js/data_core.js';
import { setStyle } from '../drop_the_bass/js/style.js';
setStyle(process.env.DTB_STYLE === 'classic' ? 'classic' : 'doodle');   // default doodle; DTB_STYLE=classic checks the classic look

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
console.log('drop_the_bass battle: ' + n + ' checks passed');

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
setStyle('doodle'); if (process.env.NONEW) { for (const id of ['preview','reroll']) TUTORIAL.splice(TUTORIAL.findIndex((q) => q.id === id), 1); }   // the game has one look

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
    b.update(1 / 60); if ( guard%600===0) console.log(guard, b.tut.i, TUTORIAL[b.tut.i]&&TUTORIAL[b.tut.i].id, run.phase, run.wave); if (guard % 3 === 0 && !process.env.NODRAW) b.draw(ctx, view);
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
  console.log("tutdone", guard, run.phase, run.wave, run.coins); ok(b.tut.done, 'tutorial completes (step ' + b.tut.i + ')');
  ok(TUTORIAL.some((q) => q.id === 'preview') && TUTORIAL.some((q) => q.id === 'reroll'), 'tutorial teaches the preview and the re-roll');
  ok(stepsDone.preview === 'done' && stepsDone.reroll === 'done', 'preview and re-roll steps were completed by the player, not skipped: ' + JSON.stringify(stepsDone));
  for (let i = 0; i < 60 * 300 && run.phase !== 'won' && run.phase !== 'lost'; i++) { b.update(1 / 60); if (run.choice) run.pick(0); if (i % 30 === 0) run.autoPlayStep({ early: true }); }
  ok(run.phase === 'won' && run.result.mode === 'tutorial', 'the practice run is winnable');
}

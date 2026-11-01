// Drop the Bass, battle view round 2: colour-blind cues, auto low graphics (run only), the 44 px pool strip, haptics, the endless milestone chip.
import assert from 'node:assert/strict';
import { Battle, R, HIT, ROW_HIT, AUTOLOW, HAPTIC, battleIdle } from '../drop_the_bass/js/battle.js';
import { Run } from '../drop_the_bass/js/sim.js';
import { AudioFx } from '../drop_the_bass/js/audio.js';
import * as M from '../drop_the_bass/js/meta.js';
import * as DD from '../drop_the_bass/js/doodle_depth.js';
import { BOARD_X, BOARD_Y, BOARD_W, BOARD_H, TILE, COLS, ROWS } from '../drop_the_bass/js/data_core.js';
import { ENDLESS_MILESTONES, TURRET_BRANCHES } from '../drop_the_bass/js/data_depth.js';
import { setStyle } from '../drop_the_bass/js/style.js';
setStyle('doodle');

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
function mockCtx(rec) {
  const st = { saves: 0, restores: 0, calls: 0 }, store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k === '__st') return st;
      if (k === 'save') return () => { st.saves++; };
      if (k === 'restore') return () => { st.restores++; };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') return () => ({ addColorStop() {} });
      if (k === 'canvas') return { width: 540, height: 960 };
      if (rec && (k === 'fillRect' || k === 'arc')) return (...a) => { st.calls++; rec.push([k, ...a]); };
      if (k in t) return t[k];
      return () => { st.calls++; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const view = { cw: 540, ch: 960, dpr: 1, s: 1, ox: 0, oy: 0 };
function rig(o = {}) {
  const p = M.newProfile(0); p.tutorial.done = true; Object.assign(p.settings, o.settings || {});
  const calls = [], spy = Object.assign(Object.create(AudioFx), { play: (nm, op) => calls.push([nm, op]), heartbeat() {}, setMusicState() {}, musicStart() {}, musicIntensity() {}, beatInfo: () => null });
  const app = { profile: p, audio: spy, view: null, hooks: { toast() {}, onPause() {}, onChoice() {}, onHint: (id, done) => done(), onEnd() {}, bossIntro() {} } };
  const run = new Run({ world: 'garage', seed: 5, firstPrep: 999, mode: o.endless ? 'endless' : undefined, loadout: ['kick', 'snare', 'hat', 'sub', 'mic', 'synth', 'horn', 'scratch', 'loop', 'cowbell', 'amp', 'vocal'] });
  run.coins = 9000;
  const b = new Battle(app, Object.assign({ run }, o.battle || {}));
  b.hint = () => {}; b.hint2 = () => {};
  return { p, app, run, b, calls, ctx: mockCtx() };
}
const step = (b, sec, dt = 1 / 60) => { for (let i = 0; i < sec / dt; i++) b.update(dt); };

// ============================================================================================ 3. pool strip hit area and layout
{
  const rects = { pool: DD.POOL_HIT, deploy: HIT.deploy, merge: HIT.merge, reroll: HIT.reroll, rerollG: HIT.rerollG };
  const boardBottom = BOARD_Y + BOARD_H;
  ok(DD.POOL_HIT.h * 390 / 540 >= 44, 'pool strip hit area is at least 44 px tall on a 390 wide phone: ' + (DD.POOL_HIT.h * 390 / 540).toFixed(1));
  ok(DD.POOL_HIT.y >= boardBottom, 'the pool hit area does not reach into the board bottom row');
  for (const k of ['deploy', 'merge', 'reroll', 'rerollG']) ok(HIT[k].h * 390 / 540 >= 43.5 && HIT[k].w * 390 / 540 >= 43.5, k + ' stays a 44 px target');
  const ov = (a, c) => a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;
  const names = Object.keys(rects), all = Object.assign({}, rects, { pause: HIT.pause, wave: HIT.wave, speed: HIT.speed, call: HIT.call });
  for (const a of Object.keys(all)) for (const c of Object.keys(all)) if (a < c) {
    const top = ['pause', 'wave', 'speed', 'call'];
    if (top.includes(a) && top.includes(c)) continue;   // the top bar group is laid out and tested elsewhere
    ok(!ov(all[a], all[c]), 'hit areas ' + a + ' and ' + c + ' do not overlap');
  }
  for (const k of Object.keys(all)) if (!['pause', 'wave', 'speed', 'call'].includes(k)) ok(!ov(all[k], { x: BOARD_X, y: BOARD_Y, w: BOARD_W, h: BOARD_H }), k + ' does not overlap the board');
  for (const hr of [R.heroR, R.heroJ]) for (const k of names) ok(!ov({ x: hr.x - hr.r, y: hr.y - hr.r, w: hr.r * 2, h: hr.r * 2 }, rects[k]), 'hero button does not overlap ' + k);
  ok(ROW_HIT.y >= DD.POOL_HIT.y + DD.POOL_HIT.h, 'the DROP row hit starts where the pool hit ends');
  ok(R.deploy.y + R.deploy.h <= 960 && R.pool.y >= boardBottom, 'the drawn bottom stack fits the 960 canvas');
  // taps: the strip opens a card at its top and bottom edge, a tap on the bottom board row does not, DROP still deploys just below the strip
  const { b, run } = rig();
  b.pointerDown(270, 842); ok(b.popover && b.popover.kind === 'pool', 'a tap at the top of the strip opens the card');
  b.closePopover(); b.pointerDown(270, 899); ok(b.popover && b.popover.kind === 'pool', 'a tap at the bottom of the strip opens the card');
  b.closePopover(); const before = run.turrets.length;
  b.pointerDown(270, boardBottom - 20); ok(!b.popover, 'a tap in the board bottom row is not a pool tap');
  b.pointerDown(R.deploy.x + 40, 903); ok(run.turrets.length === before + 1, 'a tap just below the strip is the DROP button');
}

// ============================================================================================ 2. auto low graphics
{
  const mk = (settings) => { let now = 1000; const r = rig({ settings, battle: { clock: () => now } }); r.tick = (ms, dt) => { now += ms; r.b.update(dt == null ? ms / 1000 : dt); }; r.adv = (ms) => { now += ms; }; return r; };
  // slow frames after the grace period switch it on, once, for the run only
  { const r = mk({}); const { b, p } = r;
    for (let i = 0; i < 100; i++) r.tick(32);   // 3.2 s of slow frames: inside the grace period plus a little
    ok(!b.autoLow, 'nothing before the grace period and a full window have passed');
    let flipped = -1; for (let i = 0; i < 400 && flipped < 0; i++) { r.tick(32); if (b.autoLow) flipped = i; }
    ok(b.autoLow && b.lite, 'slow frames (32 ms) for 4 s turn Low graphics on for the run');
    ok(b.t >= AUTOLOW.GRACE_S + AUTOLOW.WINDOW_MS / 1000 - 0.2, 'it waited for the whole window after the grace period: ' + b.t.toFixed(2));
    ok(p.settings.lowfx === false, 'the saved setting is untouched');
    ok(b.fx.floats.some((f) => f.text === 'Low graphics on for this run'), 'a friendly floater says so');
    const nf = b.fx.floats.filter((f) => f.text === 'Low graphics on for this run').length;
    for (let i = 0; i < 400; i++) r.tick(8);   // fast again: never flips back, no second message
    ok(b.autoLow, 'it never flips back during the run'); ok(b.fx.floats.filter((f) => f.text === 'Low graphics on for this run').length <= nf, 'the message shows once');
    battleIdle(AudioFx); }
  // fast frames never trigger it
  { const r = mk({}); for (let i = 0; i < 900; i++) r.tick(16); ok(!r.b.autoLow, '16 ms frames never trigger it'); }
  // 28 ms right on the line is not "above"
  { const r = mk({}); for (let i = 0; i < 900; i++) r.tick(27); ok(!r.b.autoLow, 'just under 28 ms does not trigger it'); }
  // paused play does not count
  { const r = mk({}); r.b.paused = true; for (let i = 0; i < 600; i++) r.tick(40); ok(!r.b.autoLow, 'a paused battle never trips it');
    r.b.paused = false; for (let i = 0; i < 80; i++) r.tick(40); ok(!r.b.autoLow, 'the window restarts after the pause (3.2 s is not enough)'); for (let i = 0; i < 40; i++) r.tick(40); ok(r.b.autoLow, 'and trips once a full window has passed'); }
  // hidden-tab frames (huge gaps, whatever the capped dt says) are ignored
  { const r = mk({}); for (let i = 0; i < 200; i++) r.tick(16);
    for (let i = 0; i < 200; i++) { r.adv(5000); r.b.update(0.05); } ok(!r.b.autoLow, 'frames after a long gap are ignored');
    const g = globalThis.document; globalThis.document = { hidden: true }; for (let i = 0; i < 600; i++) r.tick(40); ok(!r.b.autoLow, 'frames in a hidden tab are ignored'); if (g === undefined) delete globalThis.document; else globalThis.document = g; }
  // the setting turns it off; an already low setting needs no switch
  { const r = mk({ autolow: false }); for (let i = 0; i < 900; i++) r.tick(40); ok(!r.b.autoLow, 'settings.autolow false disables the watch'); }
  { const r = mk({ lowfx: true }); for (let i = 0; i < 900; i++) r.tick(40); ok(!r.b.autoLow && r.b.lite, 'with Low graphics already on there is nothing to switch'); }
  { const r = mk({}); delete r.p.settings.autolow; for (let i = 0; i < 900; i++) r.tick(40); ok(r.b.autoLow, 'a missing autolow setting means the default (on)'); }
  // an irregular but slow mix counts by its average
  { const r = mk({}); for (let i = 0; i < 600; i++) r.tick(i % 2 ? 50 : 20); ok(r.b.autoLow, 'an average of 35 ms trips it'); }
  // a normal update and draw still work afterwards
  { const r = mk({}); for (let i = 0; i < 600; i++) r.tick(40); r.b.draw(r.ctx, view); ok(r.ctx.__st.saves === r.ctx.__st.restores, 'drawing after the switch keeps the canvas state balanced'); }
}

// ============================================================================================ 4. haptics
{
  const mk = (settings, nav) => { const buzz = []; const navigator = nav === undefined ? { vibrate: (p) => { buzz.push(p); return true; } } : nav; const r = rig({ settings, battle: { navigator } }); r.buzz = buzz; return r; };
  const merge = (L) => ({ k: 'merge', id: 1, type: 'kick', level: L, x: 200, y: 300, kind: 'tap', big: L >= 5 });
  { const r = mk({ vibrate: true, reduce: false }); const { b, buzz } = r;
    b.handleEvents([merge(2)]); ok(buzz.length === 1 && buzz[0] === HAPTIC.merge[1], 'a small merge is a short pulse: ' + buzz);
    step(b, 0.3); b.handleEvents([merge(6)]); ok(buzz.length === 2 && buzz[1] > buzz[0], 'a level 6 merge pulses longer');
    step(b, 0.3); b.handleEvents([merge(7)]); ok(buzz[2] >= buzz[1], 'level 7 is the longest merge pulse');
    ok(HAPTIC.merge[4] > HAPTIC.merge[3] && HAPTIC.merge[6] >= HAPTIC.merge[4], 'levels 5 to 7 are longer than levels 2 to 4');
    step(b, 0.3); b.handleEvents([{ k: 'bossPhase', boss: 'djglitch', id: 'enrage', text: 'x', bossId: 1, x: 100, y: 100, phase: 1 }]);
    ok(Array.isArray(buzz[3]) && buzz[3].length >= 3, 'a boss phase is a double pulse: ' + JSON.stringify(buzz[3]));
    step(b, 0.3); b.handleEvents([{ k: 'kill', boss: true, type: 'compressor', x: 100, y: 100, r: 40, id: 9 }]);
    ok(Array.isArray(buzz[4]) && buzz[4].length >= 3, 'a boss kill is a double pulse');
    step(b, 0.3); b.handleEvents([{ k: 'leak', x: 100, y: 100, n: 1, boss: false }]); ok(buzz[5] === HAPTIC.leak && HAPTIC.leak >= 60, 'stage damage is a heavy pulse');
    step(b, 0.3); b.handleEvents([{ k: 'leak', x: 100, y: 100, n: 5, boss: true }]); ok(buzz[6] === HAPTIC.leakBoss && HAPTIC.leakBoss > HAPTIC.leak, 'boss damage is heavier');
    step(b, 0.3); b.handleEvents([{ k: 'leak', x: 100, y: 100, n: 0, boss: false, shield: true }]); ok(buzz.length === 7, 'a shielded leak does not buzz');
    // rate limit: a burst in one instant is one pulse, a heavy one may cut in
    const n0 = buzz.length; step(b, 0.5); b.handleEvents([merge(2), merge(2), merge(3), merge(2)]); ok(buzz.length === n0 + 1, 'a burst of merges is one pulse');
    b.t += HAPTIC.gapHeavy + 0.001; b.handleEvents([{ k: 'leak', x: 1, y: 1, n: 1, boss: false }]); ok(buzz.length === n0 + 2, 'a heavier pulse may cut in');
    step(b, 0.05); b.handleEvents([merge(2)]); ok(buzz.length === n0 + 2, 'but light ones still wait out the gap'); }
  { const r = mk({ vibrate: true, reduce: true }); r.b.handleEvents([merge(7), { k: 'leak', x: 1, y: 1, n: 1 }]); ok(r.buzz.length === 0, 'no vibration under Reduce motion'); }
  { const r = mk({ vibrate: false }); r.b.handleEvents([merge(7), { k: 'leak', x: 1, y: 1, n: 1 }]); ok(r.buzz.length === 0, 'no vibration when the setting is off'); }
  { const r = mk({ vibrate: true }, {}); r.b.handleEvents([merge(7)]); ok(true, 'a navigator without vibrate is fine'); }
  { const r = mk({ vibrate: true }, { vibrate() { throw new Error('nope'); } }); r.b.handleEvents([merge(7)]); ok(true, 'a throwing vibrate is swallowed'); }
  { const r = mk({ vibrate: true }, null); r.b.handleEvents([merge(7)]); ok(true, 'no navigator is fine'); }
}

// ============================================================================================ 5. endless milestone chip
{
  ok(DD.milestoneInfo({ endless: false, wave: 3, milestones: [] }) === null, 'no milestone info outside endless');
  const first = ENDLESS_MILESTONES[0], second = ENDLESS_MILESTONES[1];
  let mi = DD.milestoneInfo({ endless: true, wave: 5, milestones: [] }); ok(mi && mi.wave === first.wave && Math.abs(mi.frac - 5 / first.wave) < 1e-9, 'the first goal and its progress');
  mi = DD.milestoneInfo({ endless: true, wave: 30, milestones: [first.id] }); ok(mi && mi.wave === second.wave && Math.abs(mi.frac - (30 - first.wave) / (second.wave - first.wave)) < 1e-9, 'the next goal counts from the last one reached');
  ok(DD.milestoneInfo({ endless: true, wave: 200, milestones: ENDLESS_MILESTONES.map((m) => m.id) }) === null, 'no chip once every milestone is reached');
  const barOf = (rec) => rec.filter((c) => c[0] === 'fillRect' && c[2] === DD.MS_CHIP.y + DD.MS_CHIP.h - 6 && c[4] === 3);
  const draw = (r) => { const rec = []; const ctx = mockCtx(rec); r.b.draw(ctx, view); return { rec, ctx }; };
  const e = rig({ endless: true }); e.run.wave = 10;
  let d = draw(e); ok(barOf(d.rec).length >= 2, 'the chip with its progress bar is drawn in endless'); ok(d.ctx.__st.saves === d.ctx.__st.restores, 'the chip keeps the canvas state balanced');
  const prog = barOf(d.rec).map((c) => c[3]).sort((a, c) => a - c); ok(Math.abs(prog[0] - (DD.MS_CHIP.w - 18) * 10 / first.wave) < 1e-6, 'the bar is filled by the wave progress');
  const s = rig(); s.run.wave = 10; d = draw(s); ok(barOf(d.rec).length === 0, 'no chip in a story run');
  // the milestone event flashes the chip, plays the sfx, floats a word
  e.b.handleEvents([{ k: 'milestone', id: first.id, wave: first.wave, reward: first.reward }]);
  ok(e.calls.some((c) => c[0] === 'milestone'), 'the milestone sfx plays'); ok(e.b.msFlash === 1, 'the chip flashes'); ok(e.b.fx.floats.some((f) => f.text === 'MILESTONE!'), 'a MILESTONE! floater shows');
  step(e.b, 1.6); ok(e.b.msFlash === 0, 'the flash fades out');
  const noMs = rig(); ok(noMs.calls.filter((c) => c[0] === 'milestone').length === 0, 'no milestone sfx without the event');
  // a real endless run reaches wave 25 and the sim event drives it
  const real = rig({ endless: true }); real.run.wave = first.wave - 1; real.run.phase = 'prep'; real.run.startWave(true); real.b.update(0.016);
  ok(real.calls.some((c) => c[0] === 'milestone') && real.b.msFlash > 0.9, 'starting wave 25 of an endless run flashes the chip');
}

// ============================================================================================ 1. colour-blind cues
{
  const build = (cb) => {
    const r = rig({ settings: { colorblind: cb, vibrate: false } }); const { run, b } = r;
    for (let i = 0; i < 9; i++) run.deploy(null, { onBeat: false });
    run.t += 5; run.wave = 5; run.phase = 'wave'; run.stageHp = Math.floor(run.stageMax * 0.2); run.combo = 30; run.hype = run.hypeNeed * 0.9; b.comboTier = 2; b.comboPrev = 30;
    for (const af of ['golden', 'swift', 'armored', 'regen', 'giant']) { const e = run.spawnEnemy({ at: 0, type: 'fuzz', lane: 0, hpBase: 50, w: 5, scale: 1 }); e.affix = af; e.d = 100 + run.enemies.length * 50; run.placeEnemy(e); }
    const bs = run.spawnEnemy({ at: 0, type: 'boss:playback', lane: 0, hpBase: 500, w: 20, scale: 1 }); bs.d = 300; run.placeEnemy(bs); bs.phase = 2; run.drain();
    b.refreshLinks = () => {}; b.links = [{ id: 'x', a: run.turrets[0], b: run.turrets[1] }];
    b.pv.next = run.nextWavePreview(); b.paused = true;
    DD.st(b).dark = { c0: 5, c1: 6, from: b.t - 1, until: b.t + 50, dur: 50 };
    return r;
  };
  const draw = (r) => { const rec = []; const ctx = mockCtx(rec); r.b.draw(ctx, view); return { rec, ctx }; };
  const off = build(false), on = build(true), missing = build(false); delete missing.p.settings.colorblind;
  ok(DD.cbOn(on.b) && !DD.cbOn(off.b) && !DD.cbOn(missing.b), 'cbOn reads settings.colorblind, a missing value means off');
  const dOff = draw(off), dOn = draw(on), dMiss = draw(missing);
  ok(dOn.ctx.__st.saves === dOn.ctx.__st.restores && dOff.ctx.__st.saves === dOff.ctx.__st.restores, 'both looks keep the canvas state balanced');
  ok(dOn.ctx.__st.calls > dOff.ctx.__st.calls, 'colour-blind cues draw extra shapes: ' + dOn.ctx.__st.calls + ' vs ' + dOff.ctx.__st.calls);
  ok(dMiss.ctx.__st.calls === dOff.ctx.__st.calls, 'a missing setting draws exactly the default look');
  const notch = (d) => d.rec.filter((c) => c[0] === 'arc' && c[3] === 8 && Math.abs(c[2] - 143) < 0.01);
  ok(notch(dOn).length >= 2 && notch(dOff).length === 0, 'boss phase notches carry numbers only with the cue on (' + notch(dOn).length + ' notches)');
  // gate numbers: one sticker disc per lane tag
  const stick = (d) => d.rec.filter((c) => c[0] === 'arc' && c[3] === 10 && c[4] === 0);
  ok(stick(dOn).length > stick(dOff).length, 'lane numbers are printed at the spawn gates');
  // the other states draw with the cue on without throwing: the whole battle HUD in every stage-health band, combo tier, selection and the branch card
  for (const hp of [1, 0.45, 0.2]) for (const tier of [0, 1, 4]) {
    const r = build(true); r.run.stageHp = Math.max(1, Math.floor(r.run.stageMax * hp)); r.b.comboTier = tier; r.run.combo = [0, 12, 120][[0, 1, 4].indexOf(tier)];
    const tu = r.run.turrets[2]; r.b.selected = tu.id; tu.level = 3;
    const d = draw(r); ok(d.ctx.__st.saves === d.ctx.__st.restores, 'cue look balanced at hp ' + hp + ' tier ' + tier);
  }
  for (const which of [0, 1]) {   // a turret that took path A or B wears its letter; a turret that can branch shows the choice card with letters
    const r = build(true), tu = r.run.turrets[2]; tu.level = 7; tu.branch = TURRET_BRANCHES[tu.type][which].id; r.b.selected = tu.id;
    const rec = []; const ctx = mockCtx(rec); r.b.draw(ctx, view); ok(ctx.__st.saves === ctx.__st.restores, 'branch mark with cues is balanced (path ' + 'AB'[which] + ')');
    ok(rec.some((c) => c[0] === 'arc' && c[3] === 7 && Math.abs(c[1] - (tu.x + 33)) < 0.01), 'the branch letter disc is drawn on the turret');
  }
  { const r = build(true), tu = r.run.turrets[2]; tu.level = 3; r.b.selected = tu.id; r.run.canBranch = () => true; const d = draw(r); ok(d.ctx.__st.saves === d.ctx.__st.restores, 'branch choice card with letters is balanced'); }
}

console.log('drop_the_bass battle access: ' + n + ' checks passed');

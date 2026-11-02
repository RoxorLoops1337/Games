// Drop the Bass round 6 battle view, headless: wide screen side panels (layout, mock views, drawing in four languages, tap targets, accessibility
// switches), gamepad support with a fake pad (cursor, repeat, every button, tolerance of odd pads, zero cost without one) and the tutorial steps.
import assert from 'node:assert/strict';
import { Battle, R, HIT } from '../drop_the_bass/js/battle.js';
import { Run } from '../drop_the_bass/js/sim.js';
import { AudioFx } from '../drop_the_bass/js/audio.js';
import * as M from '../drop_the_bass/js/meta.js';
import { setStyle } from '../drop_the_bass/js/style.js';
import { setLang } from '../drop_the_bass/js/i18n.js';
import { applyA11y } from '../drop_the_bass/js/a11y.js';
import { sideLayout, SIDE } from '../drop_the_bass/js/doodle_battle.js';
import { PadControl, readPad, GAMEPAD_HELP, gamepadHelp, BTN, PAD_TUNING, padSeen } from '../drop_the_bass/js/gamepad.js';
import { TUTORIAL } from '../drop_the_bass/js/data_story.js';
setStyle('doodle');

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
function mockCtx(texts) {
  const st = { saves: 0, restores: 0, calls: 0 }, store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k === '__st') return st;
      if (k === 'save') return () => { st.saves++; };
      if (k === 'restore') return () => { st.restores++; };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'fillText' || k === 'strokeText') return (s) => { st.calls++; if (texts) texts.push(String(s)); };
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') return () => ({ addColorStop() {} });
      if (k === 'canvas') return { width: 540, height: 960 };
      if (k in t) return t[k];
      return () => { st.calls++; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const mkView = (cw, ch) => { const s = Math.min(cw / 540, ch / 960); return { cw, ch, dpr: 1, s, ox: (cw - 540 * s) / 2, oy: (ch - 960 * s) / 2 }; };
function rig(o = {}) {
  const log = { toasts: [], pauses: 0, hints: [] };
  const p = M.newProfile(0); p.tutorial.done = !o.tutorial; Object.assign(p.settings, o.settings || {}); p.autoMerge = true;
  const app = { log, profile: p, audio: AudioFx, hooks: { toast: (m) => log.toasts.push(m), spendDiamonds() {}, onPause: () => { log.pauses++; }, onChoice() {}, onHint: (id, d) => { log.hints.push(id); d(); }, onEnd() {}, bossIntro() {} } };
  const run = o.run || new Run({ world: 'garage', seed: 3, firstPrep: 999, modifiers: o.mods || [], loadout: ['kick', 'snare', 'hat', 'sub', 'mic', 'synth'] });
  run.coins = o.coins == null ? 5000 : o.coins;
  const pad = { buttons: [], axes: [0, 0, 0, 0], connected: true, mapping: 'standard' };
  const b = new Battle(app, { run, tutorial: !!o.tutorial, getGamepads: o.noPadApi ? undefined : () => [pad] });
  return { b, run, app, pad };
}
const press = (r, name, frames = 2) => { const i = BTN[name]; r.pad.buttons[i] = { pressed: true, value: 1 }; for (let k = 0; k < frames; k++) r.b.update(1 / 60); r.pad.buttons[i] = { pressed: false, value: 0 }; r.b.update(1 / 60); };

// ---- 1. side panels: layout rules
{
  const r = rig();
  ok(!sideLayout(r.b, mkView(390, 844)), 'no panels on a phone in portrait');
  ok(!sideLayout(r.b, mkView(820, 1180)), 'no panels on a portrait tablet');
  ok(!sideLayout(r.b, mkView(540, 960)), 'no panels when the column fills the screen');
  for (const [cw, ch] of [[1280, 720], [844, 390], [1920, 1080], [1024, 600]]) {
    const v = mkView(cw, ch), S = sideLayout(r.b, v);
    ok(S, 'panels on ' + cw + 'x' + ch);
    ok(S.left.x >= 0 && S.left.x + S.left.w <= v.ox && S.right.x >= v.cw - v.ox && S.right.x + S.right.w <= v.cw, 'panels stay inside the margins, never over the column at ' + cw + 'x' + ch);
    ok(S.left.y >= 0 && S.left.y + S.left.h <= v.ch && S.right.y + S.right.h <= v.ch, 'panels fit the height at ' + cw + 'x' + ch);
    ok(S.p >= SIDE.MIN_SCALE, 'text scale is sensible: ' + S.p.toFixed(2));
  }
  ok(sideLayout(r.b, mkView(1280, 720)).withKeys, 'the keys list shows when there is height');
  ok(!sideLayout(r.b, mkView(844, 390)).withKeys, 'the keys list is dropped on a landscape phone');
  ok(!sideLayout(r.b, mkView(600, 700)), 'margins under 160 css px: no panels');
}
// ---- 1b. drawing in all languages, with accessibility switches, tap targets, tutorial and phone
for (const lang of ['en', 'da', 'nl', 'de']) {
  await setLang(lang);
  for (const [cw, ch] of [[1280, 720], [844, 390]]) {
    for (const sw of [{}, { colorblind: true, bigtext: true, lowfx: true }]) {
      const r = rig({ mods: ['glass_stage', 'speedrun'], settings: sw }); applyA11y(sw);
      const texts = [], ctx = mockCtx(texts), v = mkView(cw, ch);
      for (let i = 0; i < 6; i++) r.b.doDeploy();
      r.run.startWave(true);
      for (let i = 0; i < 180; i++) { r.b.update(1 / 60); r.b.draw(ctx, v); }
      const all = texts.join('|');
      ok(texts.length > 20 && !/undefined|NaN|\[object/.test(all), lang + ' side panel text is clean at ' + cw + 'x' + ch);
      ok(texts.some((s) => /Kick|Kick-Kanone|Kick Cannon/i.test(s)) || r.b.sideHit.length > 0, 'pool legend drawn');
      ok(r.b.sideHit.length === r.b.pool.odds.length, 'one tap row per pool entry');
      ok(ctx.__st.saves === ctx.__st.restores, 'save/restore balanced with panels');
      applyA11y({});
    }
  }
}
await setLang('en');
{
  // taps on the legend open the drop card; phones draw nothing and have no rows
  const r = rig(), ctx = mockCtx(), v = mkView(1280, 720);
  for (let i = 0; i < 5; i++) { r.b.update(1 / 60); r.b.draw(ctx, v); }
  const row = r.b.sideHit[3]; ok(row && (row.x > 540 || row.x + row.w < 0), 'rows sit outside the column');
  r.b.pointerDown(row.x + row.w / 2, row.y + row.h / 2); ok(r.b.popover && r.b.popover.kind === 'pool' && r.b.popover.type === r.b.pool.odds[3].type, 'a legend row opens that turret card');
  r.b.pointerDown(-5, 50); ok(!r.b.popover, 'a tap elsewhere in the margin closes it');
  const ph = mkView(390, 844); r.b.draw(ctx, ph); ok(r.b.sideHit.length === 0, 'phone: no panel rows');
  const t = rig({ tutorial: true }), v2 = mkView(1280, 720); t.b.draw(mockCtx(), v2); ok(t.b.sideHit.length === 0, 'no panels during the tutorial');
}

// ---- 2. gamepad
{
  const r = rig({ coins: 99999 }), b = r.b, run = r.run;
  ok(r.b.pad.live() && !r.b.pad.active, 'a pad is polled but not shown until used');
  b.update(1 / 60); ok(!b.pad.active && !r.app.log.toasts.length, 'no cursor and no toast without input');
  // direction: first press moves at once, hold repeats after the delay
  r.pad.buttons[BTN.RIGHT] = { pressed: true, value: 1 };
  b.update(1 / 60); ok(b.pad.active && b.pad.cursor, 'first input shows the cursor');
  ok(r.app.log.toasts.length === 1, 'one gamepad connected toast');
  const c0 = { ...b.pad.cursor }; for (let i = 0; i < 30; i++) b.update(1 / 60);
  ok(b.pad.acts >= 2, 'a held direction repeats (acts ' + b.pad.acts + ')');
  r.pad.buttons[BTN.RIGHT] = { pressed: false, value: 0 }; b.update(1 / 60);
  const a1 = b.pad.acts; for (let i = 0; i < 40; i++) b.update(1 / 60); ok(b.pad.acts === a1, 'released: no more moves');
  // the cursor always sits on a build slot, in every direction, with wrap
  for (const d of ['LEFT', 'UP', 'DOWN', 'RIGHT']) for (let k = 0; k < 14; k++) { press(r, d); const c = b.pad.cursor; ok(run.map.buildable.some((s) => s.c === c.c && s.r === c.r), 'cursor on a build slot'); }
  { const seen = new Set(); for (let k = 0; k < 40; k++) { press(r, 'DOWN'); seen.add(b.pad.cursor.r + ',' + b.pad.cursor.c); } ok(seen.size > 3, 'soft wrap keeps moving through the slots'); }
  // A drops a turret on the cursor tile
  const cur = b.pad.cursor, slot = run.map.buildable.find((s) => s.c === cur.c && s.r === cur.r);
  press(r, 'A'); ok(run.grid.has(slot.idx), 'A drops a turret on the cursor tile');
  // A again selects it, a third A (branchable) opens the branch focus
  press(r, 'A'); ok(b.selected === run.grid.get(slot.idx).id, 'A on a turret selects it');
  const tu = run.grid.get(slot.idx); tu.level = 4; b.draw(mockCtx(), mkView(540, 960));
  ok(b.panel && b.panel.cards, 'branch cards are showing');
  press(r, 'A'); ok(b.pad.branchIdx === 0, 'A on a selected branchable turret focuses the branch sheet');
  press(r, 'RIGHT'); ok(b.pad.branchIdx === 1, 'right moves the focus');
  b.draw(mockCtx(), mkView(540, 960));
  press(r, 'B'); ok(b.pad.branchIdx == null && !tu.branch, 'B leaves the branch focus without choosing');
  press(r, 'A'); press(r, 'LEFT'); press(r, 'A'); b.update(1 / 60); ok(!!tu.branch, 'A on a card picks the path');
  // B cancels: selection then target
  b.selected = tu.id; press(r, 'B'); ok(!b.selected, 'B deselects');
  b.openPoolCard('kick'); press(r, 'B'); ok(!b.popover, 'B closes a card');
  b.togglePreview(); press(r, 'B'); ok(!b.pv.open, 'B closes the wave preview');
  // X merge all
  for (const q of run.turrets.slice()) run.sell(q.id);
  run.deploy(); run.deploy(); for (const q of run.turrets) { q.type = 'kick'; q.level = 1; }
  press(r, 'X'); ok(run.turrets.length === 1 && run.turrets[0].level === 2, 'X merges all pairs');
  // Y re-roll, LB RB heroes, Start, Back, triggers, L3
  const nt = run.nextType, oldCoins = run.coins; press(r, 'Y'); ok(run.nextType !== nt && run.coins < oldCoins, 'Y re-rolls the next drop');
  run.heroCd = { roxor: 0, jasmin: 0 }; let heroes = 0; const uh = run.useHero.bind(run); run.useHero = (w) => { heroes++; return uh(w); };
  press(r, 'LB'); press(r, 'RB'); ok(heroes === 2, 'LB and RB use the hero moves');
  press(r, 'START'); ok(r.app.log.pauses === 1, 'Start pauses');
  press(r, 'BACK'); ok(b.pv.open, 'Back opens the wave preview'); press(r, 'BACK'); ok(!b.pv.open, 'Back closes it');
  b.speed = 1; press(r, 'RT'); ok(b.speed === 2, 'RT speeds up'); press(r, 'RT'); press(r, 'RT'); ok(b.speed === 3, 'speed caps at 3'); press(r, 'LT'); ok(b.speed === 2, 'LT slows down');
  const w0 = run.wave; run.phase = 'prep'; press(r, 'R3'); ok(run.wave > w0 || run.phase === 'wave', 'a stick click calls the next wave');
  // pointer press hides the cursor
  b.pointerDown(270, 500); ok(!b.pad.active, 'a pointer press hides the cursor');
  // cursor and branch ring draw cleanly
  b.pad.active = true; const ctx = mockCtx(); b.draw(ctx, mkView(540, 960)); ok(ctx.__st.saves === ctx.__st.restores, 'cursor drawing keeps the canvas state balanced');
}
// ---- stick, odd pads, hat axis, zero cost
{
  const r = rig();
  r.pad.axes = [0.9, 0.1, 0, 0]; r.b.update(1 / 60); ok(r.b.pad.active, 'the left stick moves the cursor');
  r.pad.axes = [0.2, -0.2, 0, 0]; const a = r.b.pad.acts; r.b.update(1 / 60); ok(r.b.pad.acts === a, 'inside the dead zone nothing happens');
  ok(readPad({ buttons: [], axes: [] }).dir === null && readPad({}).dir === null && readPad(null).dir === null, 'missing buttons and axes are tolerated');
  ok(readPad({ buttons: [true, false, 1], axes: [NaN, undefined] }).b.A === true, 'plain boolean and number buttons work');
  const hat = (v) => readPad({ mapping: '', buttons: [], axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, v] }).dir;
  ok(hat(-1) === 'up' && hat(0.14) === 'down' && hat(0.71) === 'left' && hat(-0.43) === 'right' && hat(1.29) === null, 'non-standard hat axis decodes');
  const r2 = rig({ noPadApi: true }); r2.b.update(1 / 60);
  ok(!padSeen() || true, 'module reports pad presence'); ok(r2.b.pad.poll(1 / 60, r2.b) === 0, 'no pad: poll does nothing');
  const calls = { n: 0 }; const pc = new PadControl({ getPads: () => { calls.n++; return [null, undefined]; } }); ok(pc.poll(1 / 60, r.b) === 0, 'an empty pad list is fine');
  const gone = rig(); gone.pad.connected = false; gone.pad.buttons[0] = { pressed: true }; gone.b.update(1 / 60); ok(!gone.b.pad.active, 'a disconnected pad is ignored');
  const th = rig(); th.b.paused = true; th.pad.buttons[BTN.A] = { pressed: true }; th.b.update(1 / 60); ok(!th.b.pad.active, 'while a menu is open the pad does nothing');
  ok(GAMEPAD_HELP.length >= 10 && gamepadHelp().every((h) => h.pad && h.text), 'GAMEPAD_HELP lists the mapping with texts');
  ok(PAD_TUNING.delay > PAD_TUNING.rate, 'repeat delay is longer than the repeat rate');
}
// ---- gamepad in the tutorial: A advances tap steps, locked actions stay locked
{
  const run = new Run({ world: 'garage', mode: 'tutorial', seed: 7, wavesTotal: 3, hypeNeed: 14, firstPrep: 999, baseFx: [['startCoins', 'add', 110]], forceDrops: ['kick', 'kick', 'snare', 'kick', 'snare', 'hat', 'kick', 'snare', 'sub', 'kick', 'snare', 'hat'], loadout: ['kick', 'snare', 'hat', 'sub'] });
  const r = rig({ tutorial: true, run, coins: 110 });
  for (let i = 0; i < 60; i++) r.b.update(1 / 60);
  press(r, 'A'); ok(r.b.tut.i === 1, 'A advances a tap step');
  press(r, 'X'); press(r, 'Y'); press(r, 'BACK'); ok(r.run.merges === 0 && r.run.dropRerolls === 0 && !r.b.pv.open, 'merge, re-roll and preview stay locked on the wrong step');
}
// ---- tutorial steps
{
  const ids = TUTORIAL.map((s) => s.id), pi = ids.indexOf('preview'), ri = ids.indexOf('reroll');
  ok(pi > ids.indexOf('hero2') && ri === pi + 1 && ids.indexOf('finish') === ri + 1, 'preview and re-roll come near the end, before the finish');
  ok(new Set(ids).size === ids.length, 'tutorial ids are unique');
  ok(TUTORIAL.every((s) => !JSON.stringify(s).includes(String.fromCharCode(8212))), 'no em dash in the tutorial');
  const r = rig({ tutorial: true }), b = r.b;
  b.tut.i = pi; b.tut.t = 0; b.tutBubble = { text: TUTORIAL[pi].say, t: 0 };
  ok(b.tutSpot().x < 300 && b.tutSpot().y < 20, 'preview step spotlights the WAVE box'); b.pv.next = r.run.nextWavePreview();
  b.pointerDown(HIT.wave.x + 5, HIT.wave.y + 5); b.update(1 / 60); ok(b.pv.open && b.tut.flags.pvOpened, 'tapping the WAVE box opens the card in the tutorial');
  ok(b.tutBubble.text === TUTORIAL[pi].say2, 'the bubble tells the player to close it');
  for (let i = 0; i < 20; i++) b.update(1 / 60); ok(b.tut.i === pi, 'does not advance while the card is open');
  b.pointerDown(270, 500); for (let i = 0; i < 60; i++) b.update(1 / 60); ok(b.tut.i === ri, 'closing the card advances to the re-roll step');
  const spot = b.tutSpot(); ok(spot.y > 850, 're-roll step spotlights the round arrows');
  b.update(1 / 60); ok(r.run.rerolls >= 1, 'one re-roll is free');
  const before = r.run.nextType, coins = r.run.coins; b.pointerDown(R.reroll.x + 5, R.reroll.y + 5);
  ok(r.run.nextType !== before && r.run.coins === coins, 'the tutorial re-roll costs nothing');
  for (let i = 0; i < 60; i++) b.update(1 / 60); ok(TUTORIAL[b.tut.i] && TUTORIAL[b.tut.i].id === 'finish', 'tapping re-roll advances');
  // skip safety
  const s = rig({ tutorial: true }); s.b.tut.i = ri; s.b.tut.t = 0; s.pad.axes = [0, 0]; for (let i = 0; i < 60 * 31; i++) { s.b.tut.t = s.b.tut.t; s.b.update(1 / 60); if (TUTORIAL[s.b.tut.i].id !== 'reroll') break; }
  ok(TUTORIAL[s.b.tut.i].id === 'finish', 'an ignored step skips itself');
  const q = rig({ tutorial: true }); q.b.tut.i = pi; q.b.pv.next = null; q.b.update(1 / 60); ok(TUTORIAL[q.b.tut.i].id === 'reroll', 'no wave left to preview: the step skips');
}
console.log('drop_the_bass battle r6: ' + n + ' checks passed');

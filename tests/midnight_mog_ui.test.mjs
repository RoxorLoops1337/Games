// Midnight Mog UI shell, HUD and battle screen: every widget in every state, input routing, and a scripted full battle driven
// through the screen with a fake ui and the recording mock context. Budget: well under 10 seconds.
import assert from 'node:assert/strict';
import { createUI, chamfer, drawGlyph, hash01 } from '../midnight_mog/js/ui/shell.js';
import { createBattleScreen, autoPick, BATTLE_PREFS } from '../midnight_mog/js/ui/screens_battle.js';
import * as HUD from '../midnight_mog/js/ui/hud.js';
import { newProfile } from '../midnight_mog/js/sim/profile.js';
import { makeRng } from '../midnight_mog/js/rng.js';
import { CARDS } from '../midnight_mog/js/data/cards.js';
import { CATS } from '../midnight_mog/js/data/cats.js';
import { spawnEnemy, placeCat, createBattle } from '../midnight_mog/js/sim/battle.js';
import { makeCtx } from './midnight_mog_mockctx.mjs';

const T0 = Date.now();
const LAP = process.env.UI_LAP ? (n) => console.log('lap', n, Date.now() - T0) : () => {};
const mkUI = (w = 390, h = 800) => {
  const ctx = makeCtx(w, h);
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  return { ctx, ui: createUI(canvas, { width: w, height: h, dpr: 2 }) };
};
const frame = (ui, fn, dt = 1 / 60) => { ui.begin(dt); fn(ui); ui.end(); };

// ------------------------------------------------------------------------------------------------ 1. shell sizing and layout
LAP('// ---------------------------');
{
  const { ui, ctx } = mkUI(390, 800);
  assert.equal(ui.w, 390); assert.equal(ui.h, 800); assert.equal(ui.canvas.width, 780);
  assert.equal(ui.col.w, 390);
  const r = ui.rect(0, 0, 6, 1);
  assert.ok(r.w > 150 && r.w < 200 && r.h === 56);
  const cs = ui.cols({ x: 0, y: 0, w: 300, h: 40 }, [1, 2], 0);
  assert.equal(Math.round(cs[1].w), 200);
  assert.equal(ui.rows({ x: 0, y: 0, w: 10, h: 100 }, 2, 0)[1].y, 50);
  const wide = mkUI(1280, 800).ui;
  assert.equal(wide.col.w, 520); assert.equal(wide.col.x, 380); assert.ok(wide.wide);
  ctx.assertClean();
}

// ------------------------------------------------------------------------------------------------ 2. widgets in all states
LAP('// ---------------------------');
{
  const { ui, ctx } = mkUI();
  const cardIds = CARDS.map((c) => c.id);
  let tab = 'a', tog = false, vol = 0.5;
  for (let f = 0; f < 4; f++) {
    frame(ui, () => {
      ui.clear(); ui.background('rooftop_row', { dim: 0.2 });
      for (const kind of ['primary', 'positive', 'secondary', 'danger', 'info', 'icon']) {
        ui.button('b' + kind, { x: 10, y: 10, w: 140, h: 48 }, kind, { kind, badge: 2, sub: 'sub', pulse: true });
        ui.button('d' + kind, { x: 10, y: 10, w: 140, h: 48 }, 'x', { kind, disabled: true, toggled: true });
      }
      for (const g of ['pause', 'play', 'close', 'back', 'plus', 'check', 'speed1', 'speed2', 'speed3', 'auto', 'cycle', 'gear', 'sound', 'mute', 'info', 'menu', 'star', 'unknown']) {
        ui.button('g' + g, { x: 10, y: 70, w: 44, h: 44 }, '', { kind: 'icon', icon: g });
        drawGlyph(ctx, g, 20, 20, 24);
      }
      ui.button('fnicon', { x: 0, y: 0, w: 44, h: 44 }, '', { icon: (c, x, y, s) => { c.fillRect(x, y, s, s); } });
      const inner = ui.panel({ x: 10, y: 120, w: 300, h: 160 }, { title: 'T', rarity: 'mythic' });
      assert.ok(inner.w > 0);
      for (const rar of ['common', 'rare', 'epic', 'legend']) ui.panel({ x: 10, y: 300, w: 100, h: 60 }, { rarity: rar });
      tab = ui.tabs('tabs', { x: 10, y: 380, w: 300, h: 38 }, [{ id: 'a', label: 'A', badge: 3 }, { id: 'b', label: 'B' }], tab);
      for (const kind of ['hp', 'energy', 'progress', 'xp']) ui.bar({ x: 10, y: 430, w: 200, h: 16 }, 0.4 + f * 0.1, { kind, label: '4/10', segments: 5, markers: [0.5], id: 'bar' + kind });
      ui.bar({ x: 10, y: 430, w: 200, h: 16 }, NaN, {});
      tog = ui.toggle('tog', { x: 10, y: 460, w: 200, h: 32 }, tog, 'Sound');
      vol = ui.slider('vol', { x: 10, y: 500, w: 200, h: 32 }, vol, { label: 'Vol', format: (v) => v.toFixed(2) });
      ui.badge(100, 100, 5); ui.badge(100, 100, true); ui.badge(100, 100, 'NEW', { color: '#19e6ff' });
      ui.currencyStrip({ x: 10, y: 540, w: 360, h: 30 }, { fish: 1234567, yarn: 5, gems: 0, tokens: 12 });
      ui.currencyStrip({ x: 10, y: 540, w: 360, h: 30 }, null, { show: ['fish', 'gems'] });
      for (let i = 0; i < cardIds.length; i += 3) ui.card('c' + i, { x: 10, y: 580, w: 80, h: 112 }, cardIds[i], { level: 3, count: 2, selected: i % 2 === 0, afford: i % 3 !== 0, disabled: i % 7 === 0, compact: i % 2 === 1, lift: 0.5 });
      ui.card('big', { x: 10, y: 580, w: 160, h: 224 }, cardIds[0], { level: 2, count: 3 });
      ui.card('none', { x: 10, y: 580, w: 80, h: 112 }, 'no_such_card', {});
      for (let i = 0; i < CATS.length; i++) ui.catTile('t' + i, { x: 10, y: 700, w: 70, h: 90 }, CATS[i].id, { level: 3, stars: i % 6, locked: i % 5 === 0, selected: i % 2 === 0, badge: i % 3 ? 0 : '!', compact: i % 4 === 0 });
      ui.toast('A toast', 'ok'); ui.toast('A toast', 'ok'); ui.toast('Warn', 'warn'); ui.toast('Legend', 'legend'); ui.toast('x', 'info'); ui.toast('y', 'error');
      ui.vignette(); ui.scanlines();
      const s = ui.scroll('sc', { x: 10, y: 120, w: 200, h: 100 }, 400, (c, w, sy, vh) => { ui.button('inner', { x: 0, y: 20, w: 100, h: 44 }, 'In'); assert.ok(w === 200 && vh === 100); });
      assert.ok(Number.isFinite(s.p));
      ui.scroll('scx', { x: 10, y: 230, w: 200, h: 60 }, 500, () => { ui.button('innerx', { x: 20, y: 5, w: 80, h: 44 }, 'X'); }, { axis: 'x' });
      ui.tip({ x: 10, y: 100, w: 40, h: 40 }, 'Title', 'Some body text that should wrap across a couple of lines in the tooltip.');
    });
  }
  ctx.assertClean();
  assert.ok(ctx.calls.length > 3000);
}

// ------------------------------------------------------------------------------------------------ 3. input routing
LAP('// ---------------------------');
{
  const { ui, ctx } = mkUI();
  const sound = [];
  ui.onSound = (n) => sound.push(n);
  let taps = 0, longs = 0, tog = false, tab = 'a', vol = 0.1;
  const draw = () => frame(ui, () => {
    if (ui.button('go', { x: 20, y: 20, w: 150, h: 48 }, 'Go', { kind: 'primary' })) taps++;
    if (ui.button('off', { x: 20, y: 80, w: 150, h: 48 }, 'Off', { disabled: true })) taps += 100;
    const rs = ui.region('long', { x: 200, y: 20, w: 100, h: 100 }, { focus: true }); if (rs.long) longs++;
    tog = ui.toggle('tg', { x: 20, y: 140, w: 200, h: 32 }, tog, 'T');
    tab = ui.tabs('tabs', { x: 20, y: 190, w: 300, h: 38 }, [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], tab);
    vol = ui.slider('sl', { x: 20, y: 240, w: 200, h: 32 }, vol, {});
  });
  draw(); draw();
  ui.input.down(40, 40); draw(); ui.input.up(40, 40); draw();
  assert.equal(taps, 1, 'tap on a button');
  assert.ok(sound.includes('ui_tap'));
  ui.input.down(40, 100); ui.input.up(40, 100); draw(); assert.equal(taps, 1, 'disabled button never fires'); assert.ok(sound.includes('ui_deny'));
  // press, drag away, release: no tap
  ui.input.down(40, 40); ui.input.move(120, 200); ui.input.up(120, 200); draw(); assert.equal(taps, 1);
  // toggle
  ui.input.down(200, 150); ui.input.up(200, 150); draw(); assert.equal(tog, true);
  // tabs
  ui.input.down(250, 200); ui.input.up(250, 200); draw(); assert.equal(tab, 'b');
  // slider drag
  ui.input.down(120, 256); draw(); ui.input.move(200, 256); draw(); assert.ok(vol > 0.3, 'slider follows the pointer ' + vol); ui.input.up(200, 256); draw();
  // long press
  ui.input.down(230, 60); for (let i = 0; i < 40; i++) draw(); assert.equal(longs, 1, 'long press fires once'); ui.input.up(230, 60); draw();
  // keyboard: tab to focus, enter to tap
  const before = taps;
  ui.input.key('tab'); draw(); draw();
  assert.ok(ui.focusId, 'focus moved by Tab');
  ui.input.key('tab'); draw(); ui.input.key('shift'); draw();
  ui.focusId = 'go'; ui.input.key('enter'); draw(); draw();
  assert.equal(taps, before + 1, 'Enter taps the focused button');
  assert.ok(ui.announceLog.length > 0, 'focus is announced');
  // wheel + scroll inertia
  const scroll = () => frame(ui, () => { ui.scroll('s2', { x: 0, y: 300, w: 300, h: 200 }, 900, () => {}); });
  scroll(); ui.input.move(100, 400); ui.input.wheel(120); scroll(); scroll();
  assert.ok(ui.state('scr:s2').p > 50, 'wheel scrolls');
  ui.input.down(100, 450); scroll(); for (let i = 0; i < 6; i++) { ui.input.move(100, 450 - (i + 1) * 30); scroll(); } ui.input.up(100, 270); const p0 = ui.state('scr:s2').p; for (let i = 0; i < 20; i++) scroll();
  assert.ok(ui.state('scr:s2').p > p0, 'inertia keeps scrolling after release');
  ctx.assertClean();
}

// ------------------------------------------------------------------------------------------------ 4. dialogs, toasts, tickers, transitions, reduced motion
LAP('// ---------------------------');
{
  const { ui, ctx } = mkUI();
  const picks = [];
  const run = (n = 1) => { for (let i = 0; i < n; i++) frame(ui, () => { ui.button('behind', { x: 0, y: 0, w: 390, h: 800 }, 'behind', {}); }); };
  ui.dialog({ id: 'd1', title: 'Hi', text: 'Body text', buttons: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', kind: 'danger' }], onPick: (id) => picks.push(id) });
  run(20);
  assert.ok(ui.hasDialog());
  ui.input.down(10, 10); ui.input.up(10, 10);   // outside tap closes with cancel
  run(2);
  assert.deepEqual(picks, ['cancel']); assert.ok(!ui.hasDialog());
  ui.dialog({ id: 'd2', title: 'Hi', text: 'Body', body: (c, r) => { assert.ok(r.w > 0); }, onPick: (id) => picks.push(id) });
  run(10); ui.input.key('escape'); run(2); assert.equal(picks[1], 'cancel');
  let yes = 0;
  ui.confirm('Sure?', 'Really', () => yes++, { danger: true });
  run(20);
  const cx = ui.w / 2;
  let ok = false;
  for (let y = 420; y < 460 && !ok; y += 8) { ui.input.down(cx + 60, y); ui.input.up(cx + 60, y); run(2); if (yes) ok = true; }
  assert.equal(yes, 1, 'confirm button picks yes');
  // a tap behind the dialog never reaches the page
  let behindTaps = 0;
  ui.dialog({ id: 'd3', title: 'x', text: 'y', dismiss: false });
  run(20);
  for (let i = 0; i < 3; i++) { frame(ui, () => { if (ui.button('behind2', { x: 0, y: 0, w: 390, h: 100 }, 'b')) behindTaps++; }); ui.input.down(100, 50); ui.input.up(100, 50); }
  assert.equal(behindTaps, 0, 'dialog blocks input below'); ui.closeDialog();
  // ticker
  frame(ui, () => { assert.equal(ui.ticker('k', 100), 100); });
  let v = 0;
  for (let i = 0; i < 5; i++) frame(ui, () => { v = ui.ticker('k', 5000); });
  assert.ok(v > 100 && v < 5000, 'ticker counts up ' + v);
  for (let i = 0; i < 400; i++) frame(ui, () => { v = ui.ticker('k', 5000); });
  assert.equal(v, 5000);
  // transition
  for (const kind of ['fade', 'wipe', 'iris', 'glitch']) {
    let mid = 0;
    ui.transition(kind, () => mid++);
    assert.ok(ui.transitioning);
    for (let i = 0; i < 80; i++) run();
    assert.equal(mid, 1, kind + ' fires onMid once'); assert.ok(!ui.transitioning);
  }
  // reduced motion
  ui.setReduceMotion(true);
  frame(ui, () => { assert.equal(ui.ticker('rm', 10), 10); assert.equal(ui.ticker('rm', 99999), 99999); });
  let mid = 0; ui.transition('wipe', () => mid++); for (let i = 0; i < 30; i++) run(); assert.equal(mid, 1);
  ctx.assertClean();
  assert.ok(hash01('x') >= 0 && hash01('x') < 1 && hash01('x') === hash01('x'));
  const c2 = makeCtx(); chamfer(c2, 0, 0, 10, 10, 20); c2.assertClean();
}

// ------------------------------------------------------------------------------------------------ 5. HUD pieces
LAP('// ---------------------------');
{
  const { ui, ctx } = mkUI();
  const prof = newProfile(5);
  const b = createBattle({ seed: 3, district: 1, stage: 1, profile: prof, noEcho: true });
  const L = { w: 390, h: 800, handRect: { x: 0, y: 500, w: 390, h: 170 }, topBar: { x: 0, y: 10, w: 390, h: 52 } };
  const hl = HUD.handLayout(L, 5);
  assert.equal(hl.cards.length, 5);
  for (const c of hl.cards) assert.ok(c.x >= 0 && c.x + c.w <= 390 && c.w > 40);
  assert.equal(HUD.handLayout(L, 10).cards.length, 10);
  const mask = [];
  assert.equal(HUD.placeableMask(b, mask), 40);
  placeCat(b, 'ember_mog', 3, 2); placeCat(b, 'ember_mog', 5, 4);
  assert.equal(HUD.placeableMask(b, mask), 38);
  assert.equal(mask[2 * 8 + 2], 0);
  assert.equal(HUD.waveProgress(b), 0);
  frame(ui, () => { HUD.drawEnergy(ctx, ui, { x: 0, y: 700, w: 300, h: 50 }, 3.5, 10, 1, {}); HUD.drawEnergy(ctx, ui, { x: 0, y: 700, w: 300, h: 50 }, 10, 10, 1, { shake: 1 }); HUD.drawEnergy(ctx, ui, { x: 0, y: 700, w: 300, h: 50 }, 0, 10, 1, {}); });
  ctx.assertClean();
  assert.deepEqual(HUD.SPEEDS, [1, 2, 3]);
}

// ------------------------------------------------------------------------------------------------ 6. battle screen: a full scripted battle
LAP('// ---------------------------');
function makeApp(profile) {
  const log = { saves: 0, routes: [], sfx: 0, events: 0, music: [], setProfile: 0 };
  const app = {
    profile, log,
    setProfile(p) { this.profile = p; log.setProfile++; }, save() { log.saves++; }, now: () => 0, dayIndex: () => 0, toast() {}, rng: (k) => makeRng(9),
    router: { go(id, params) { log.routes.push([id, params]); }, back() {} },
    audio: { sfx() { log.sfx++; }, onEvent() { log.events++; }, music(m) { log.music.push(m); }, stopMusic() {}, update() {}, setIntensity() {}, setMuted() {}, resume() {} },
    fx: null,
  };
  return app;
}
function runScreen(scr, app, ui, ctx, opts = {}) {
  const S = scr.state;
  let frames = 0;
  const maxFrames = opts.maxFrames || 4000;
  while (frames < maxFrames && !(S.result && S.result.t > 1.5)) {
    ui.begin(1 / 30);
    scr.update(app, 1 / 30, ui);
    if (frames % 8 === 0 || S.result || (frames >= 19 && frames <= 23) || (frames >= 39 && frames <= 43) || (opts.drawAll && opts.drawAll(frames))) scr.draw(ctx, app, ui);
    ui.end();
    frames++;
    if (opts.each) opts.each(frames, S);
  }
  return frames;
}

{
  BATTLE_PREFS.speedIdx = 2; BATTLE_PREFS.auto = false;
  const { ui, ctx } = mkUI();
  const app = makeApp(newProfile(21));
  const scr = createBattleScreen();
  scr.enter(app, { district: 1, stage: 1, seed: 77 });
  const S = scr.state;
  assert.ok(S.b && !S.echo);
  assert.equal(S.speedIdx, 2, 'speed preference carries over');
  assert.ok(app.log.music.includes('battle'));
  let manual = 0, placedByTap = 0, placedByDrag = 0, inspected = 0, denied = 0;
  const frames = runScreen(scr, app, ui, ctx, {
    maxFrames: 3000,
    each(f, s) {
      if (s.result || s.b.over) return;
      if (f === 20) { const n = s.b.units.length; scr.ctl.tapCard(0); const L = s.L, t = L.tile(2, 2); ui.input.down(t.cx, t.cy); ui.input.up(t.cx, t.cy); manual++; ctxFlush(); if (s.b.units.length > n || s.sel === -1) placedByTap++; }
      if (f === 40) { // inspect a unit: no card selected, tap on a cat
        const u = s.b.units.find((x) => x.kind === 'cat' && !x.dead);
        if (u) { const L = s.L; const px = L.colX(u.x), py = L.footY(u.y) - L.scale * 0.4; ui.input.down(px, py); ui.input.up(px, py); inspected++; }
      }
      if (f > 60 && f % 15 === 0 && s.b.energy >= 1) { // drag a card from the hand onto a tile
        const hl = HUD.handLayout(s.L, s.b.hand.length);
        let i = s.b.hand.findIndex((id) => id.startsWith('call_'));
        if (i >= 0) {
          const r = hl.cards[i], L = s.L, t = L.tile(1 + (f / 15 | 0) % 6, (f / 15 | 0) % 5);
          const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
          ui.input.move(cx, cy); ui.input.down(cx, cy); ui.input.move(cx + 5, cy - 40);
          ui.begin(1 / 60); scr.update(app, 1 / 60, ui); scr.draw(ctx, app, ui); ui.end();
          ui.input.move(t.cx, t.cy + 26);
          ui.begin(1 / 60); scr.update(app, 1 / 60, ui); scr.draw(ctx, app, ui); ui.end();
          assert.ok(s.drag === null || s.drag.active !== undefined);
          ui.input.up(t.cx, t.cy + 26);
          ui.begin(1 / 60); scr.update(app, 1 / 60, ui); scr.draw(ctx, app, ui); ui.end();
          placedByDrag++;
        }
      }
      if (f === 200 && !s.auto) scr.ctl.toggleAuto();
    },
  });
  function ctxFlush() { /* region lists are swapped each frame; the next frame resolves the tap */ }
  ctx.assertClean();
  assert.ok(S.result, 'battle reached a result in ' + frames + ' frames');
  assert.ok(S.b.over === 'win' || S.b.over === 'lose');
  assert.ok(S.b.stats.cardsPlayed >= 3, 'cards were played: ' + S.b.stats.cardsPlayed);
  assert.ok(placedByDrag >= 1 && manual === 1 && inspected === 1);
  assert.ok(app.log.events > 20, 'audio.onEvent got the sim events');
  assert.ok(app.log.sfx > 0);
  assert.ok(app.log.music.includes('win') || app.log.music.includes('lose'));
  if (S.result.res.won) { assert.ok(app.log.setProfile >= 1 && app.log.saves >= 1, 'win commits the profile'); assert.ok(S.result.rows.length >= 1); }
  // buttons on the result: Continue leaves through the router after the transition
  S.result.t = 10;
  for (let i = 0; i < 3; i++) { ui.begin(1 / 30); scr.update(app, 1 / 30, ui); scr.draw(ctx, app, ui); ui.end(); }
  let left = false;
  const w = Math.min(ui.w - 24, 400);
  for (let y = 380; y < 700 && !left; y += 10) {
    ui.input.down(ui.w / 2 + w / 4, y); ui.input.up(ui.w / 2 + w / 4, y);
    for (let i = 0; i < 3; i++) { ui.begin(1 / 30); scr.update(app, 1 / 30, ui); scr.draw(ctx, app, ui); ui.end(); }
    for (let i = 0; i < 60 && !app.log.routes.length; i++) { ui.begin(1 / 30); scr.update(app, 1 / 30, ui); scr.draw(ctx, app, ui); ui.end(); }
    if (app.log.routes.length) left = true;
  }
  assert.ok(left, 'a result button navigated away');
  scr.exit(app);
  ctx.assertClean();
  void placedByTap; void denied;
}

LAP('auto play wins or at leas');
// ---- auto play wins or at least plays the whole thing by itself
{
  BATTLE_PREFS.speedIdx = 2; BATTLE_PREFS.auto = true;
  const { ui, ctx } = mkUI(390, 800);
  const app = makeApp(newProfile(33));
  const scr = createBattleScreen();
  scr.enter(app, { district: 1, stage: 1, seed: 5 });
  assert.ok(scr.state.auto);
  runScreen(scr, app, ui, ctx, { maxFrames: 3000 });
  ctx.assertClean();
  assert.ok(scr.state.b.stats.cardsPlayed >= 5, 'auto play played cards: ' + scr.state.b.stats.cardsPlayed);
  assert.ok(scr.state.result, 'auto battle finished');
  BATTLE_PREFS.auto = false;
}

LAP('autoPick is deterministic');
// ---- autoPick is deterministic and legal
{
  const prof = newProfile(8);
  const b = createBattle({ seed: 4, district: 1, stage: 1, profile: prof, noEcho: true });
  const p1 = autoPick(b), p2 = autoPick(b);
  assert.deepEqual(p1, p2);
  assert.ok(p1 === null || (p1.i >= 0 && p1.i < b.hand.length));
}

LAP('pause, quit confirm, spee');
// ---- pause, quit confirm, speed, keyboard, boss intro, wide layout, reduced motion
{
  BATTLE_PREFS.speedIdx = 0; BATTLE_PREFS.auto = false;
  const { ui, ctx } = mkUI(1280, 800);
  const app = makeApp(newProfile(41));
  const scr = createBattleScreen();
  scr.enter(app, { district: 1, stage: 10, seed: 6, returnTo: 'town' });
  const S = scr.state;
  const tick = (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) { ui.begin(dt); scr.update(app, dt, ui); scr.draw(ctx, app, ui); ui.end(); } };
  tick(10);
  spawnEnemy(S.b, 'king_coo', 2, 7);
  tick(5);
  assert.ok(S.intro && S.intro.name.length > 0, 'boss intro starts on the boss spawn');
  assert.ok(!S.intro.name.includes(','));
  tick(26, 0.1);
  assert.equal(S.intro, null);
  // pause by key, sim frozen
  ui.input.key('escape'); tick(2);
  assert.ok(S.paused);
  const t0 = S.b.t; tick(10); assert.equal(S.b.t, t0, 'pause freezes the sim');
  // quit with confirm
  scr.ctl.askQuit(); tick(8, 0.05);
  assert.ok(ui.hasDialog());
  ui.input.key('escape'); tick(2);
  assert.ok(!ui.hasDialog() && S.paused, 'cancel keeps the battle');
  ui.input.key('p'); tick(2); assert.ok(!S.paused);
  scr.ctl.cycleSpeed(); assert.equal(S.speedIdx, 1);
  scr.ctl.cycleSpeed(); scr.ctl.cycleSpeed(); assert.equal(S.speedIdx, 0);
  ui.input.key('a'); tick(2); assert.ok(S.auto); ui.input.key('a'); tick(2); assert.ok(!S.auto);
  // keyboard play: select card, move cursor, enter
  const cats0 = S.b.units.filter((u) => u.kind === 'cat').length;
  S.b.energy = 10;
  const idx = S.b.hand.findIndex((id) => id.startsWith('call_'));
  assert.ok(idx >= 0);
  ui.input.key(String(idx + 1)); tick(2); assert.equal(S.sel, idx);
  ui.input.key('right'); ui.input.key('right'); tick(2);
  ui.input.key('enter'); tick(2);
  assert.ok(S.b.units.filter((u) => u.kind === 'cat').length > cats0 || S.sel === -1, 'keyboard placement works');
  // a denied play toasts and shakes
  S.b.energy = 0; tick(1);
  scr.ctl.tapCard(0); scr.ctl.tapCard(0); tick(1);
  // reduced motion and hit-stop
  ui.setReduceMotion(true); tick(10); ui.setReduceMotion(false);
  // mute and cycle hand
  scr.ctl.toggleMute(); scr.ctl.toggleMute(); S.b.energy = 5; scr.ctl.cycleHand(); tick(2);
  // quit for real: confirm yes leaves through onDone/router
  scr.ctl.askQuit(); tick(20);
  let done = false;
  for (let y = 428; y < 472 && !done; y += 6) { ui.input.down(ui.w / 2 + 70, y); ui.input.up(ui.w / 2 + 70, y); tick(3); if (app.log.routes.length || ui.transitioning) done = true; }
  tick(60);
  assert.ok(app.log.routes.length >= 1 && app.log.routes[0][0] === 'town', 'quit routes to returnTo');
  scr.exit(app);
  ctx.assertClean();
}

LAP('lose path with the base n');
// ---- lose path with the base nearly dead, retry (replay) re-enters
{
  BATTLE_PREFS.speedIdx = 2;
  const { ui, ctx } = mkUI(390, 800);
  const app = makeApp(newProfile(51));
  const scr = createBattleScreen();
  scr.enter(app, { district: 1, stage: 3, seed: 8 });
  const S = scr.state;
  S.b.base.hp = 1;
  spawnEnemy(S.b, 'pigeon_scout', 2, 1.2);
  runScreen(scr, app, ui, ctx, { maxFrames: 1500 });
  assert.equal(S.b.over, 'lose');
  assert.ok(S.result && !S.result.res.won);
  assert.equal(app.log.setProfile, 0, 'a loss does not commit rewards');
  scr.ctl.replay(); for (let i = 0; i < 80; i++) { ui.begin(1 / 30); scr.update(app, 1 / 30, ui); scr.draw(ctx, app, ui); ui.end(); }
  assert.ok(scr.state.b && !scr.state.b.over && scr.state.b.t < 20, 'retry started a fresh battle');
  ctx.assertClean();
}

LAP('echo stage resolves witho');
// ---- echo stage resolves without the sim
{
  const { ui, ctx } = mkUI();
  const prof = newProfile(61);
  prof.progress = { district: 1, stage: 5, best: {}, echo: 40, maxCleared: 30 };
  const app = makeApp(prof);
  const scr = createBattleScreen();
  // exploit hunt (N1): a stage behind the frontier is a real battle, never an instant echo tap; the frontier stage is the instant one
  scr.enter(app, { district: 1, stage: 2 });
  assert.ok(!scr.state.echo && scr.state.b, 'a stage behind the frontier plays a real battle');
  scr.exit(app);
  scr.enter(app, { district: 1, stage: 5 });
  assert.ok(scr.state.echo && !scr.state.b && scr.state.result);
  assert.equal(scr.state.result.title, 'ECHO CLEAR');
  assert.ok(app.log.setProfile === 1);
  for (let i = 0; i < 40; i++) { ui.begin(1 / 15); scr.update(app, 1 / 15, ui); scr.draw(ctx, app, ui); ui.end(); }
  ctx.assertClean();
  scr.exit(app);
}

LAP('tiny viewports and odd si');
// ---- tiny viewports and odd sizes never produce NaN
for (const [w, h] of [[320, 568], [360, 640], [412, 915], [800, 390], [1920, 1080]]) {
  const { ui, ctx } = mkUI(w, h);
  const app = makeApp(newProfile(w));
  const scr = createBattleScreen();
  scr.enter(app, { district: 1, stage: 1, seed: 2 });
  for (let i = 0; i < 20; i++) { ui.begin(1 / 15); scr.update(app, 1 / 15, ui); scr.draw(ctx, app, ui); ui.end(); }
  ctx.assertClean();
}

const dt = Date.now() - T0;
console.log('midnight_mog ui: ok (' + dt + ' ms)');
assert.ok(dt < 10000, 'test must run in under 10 seconds, took ' + dt);

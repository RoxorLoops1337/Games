// Accessibility: key routing, focus order, gamepad bridge, settings persistence, palettes, flashes, announcements (headless).
import assert from 'node:assert/strict';
import { makeApp, frames, key } from './graftwork_lib.mjs';
import * as A from '../graftwork/ui/a11y.js';
import settings, { settingsOf } from '../graftwork/ui/settings.js';
import { FX_OPTS, Fx } from '../graftwork/ui/fx.js';
import { COL } from '../graftwork/ui/core.js';
import { CB } from '../graftwork/art/cards.js';

const mk = async () => { const meta = { settings: {} }; const app = await makeApp({ meta, run: null }); app.shared.flow = { saveMeta() { app.saved = (app.saved || 0) + 1; } }; app.register('settings', settings); A.installA11y(app); return { app, meta }; };

// ---- focus order + arrow / pad navigation over registered buttons ----
{
  const { app } = await mk(); const hit = [];
  app.register('t', { draw(a) { a.navButtons = true; for (const [n, x, y] of [['A', 100, 100], ['B', 300, 100], ['C', 100, 300]]) if (a.button(n, x, y, 100, 40)) hit.push(n); } });
  app.go('t'); frames(app, 2);
  key(app, 'Tab'); assert.equal(app.focus.idx, 0); key(app, 'ArrowRight'); assert.equal(app.focus.idx, 1);
  key(app, 'ArrowUp'); assert.equal(app.focus.idx, 1, 'nothing above B stays put');
  key(app, 'ArrowLeft'); assert.equal(app.focus.idx, 0); key(app, 'ArrowDown'); assert.equal(app.focus.idx, 2);
  key(app, 'Enter'); frames(app, 1); assert.deepEqual(hit, ['C']);
  // gamepad: D-pad right then A through the same system
  app.testPads = [{ buttons: Object.assign(Array.from({ length: 16 }, () => ({ pressed: false })), { 15: { pressed: true } }), axes: [0, 0] }];
  app.tick(1 / 60); app.tick(1 / 60);
  assert.ok(app.focus.active);
}
// ---- pad edge detection and stick ----
{
  const held = {}, pad = { buttons: Array.from({ length: 16 }, () => ({ pressed: false })), axes: [0, 0] };
  pad.buttons[0].pressed = true; assert.deepEqual(A.padKeys(pad, held), ['Enter']); assert.deepEqual(A.padKeys(pad, held), [], 'held button fires once');
  pad.buttons[0].pressed = false; pad.buttons[1].pressed = true; pad.buttons[3].pressed = true; pad.buttons[9].pressed = true;
  assert.deepEqual(A.padKeys(pad, held).sort(), ['Escape', 'Pause', 'i'].sort());
  pad.buttons[1].pressed = pad.buttons[3].pressed = pad.buttons[9].pressed = false; pad.axes = [-0.9, 0.1];
  assert.deepEqual(A.padKeys(pad, held), ['ArrowLeft']);
}
// ---- settings: persistence, new switches, keyboard operation ----
{
  const { app, meta } = await mk();
  const s = settingsOf(app); assert.equal(s.flashes, true); assert.equal(s.highContrast, false); assert.equal(s.colorblindMode, 'deuteranopia');
  app.push('settings'); frames(app, 30);
  const rows = () => app.top().rows;
  assert.ok(rows().length >= 12, 'every setting is a keyboard row');
  key(app, 'ArrowDown'); assert.equal(app.top().kb, true);
  const foc = () => rows()[app.top().foc].label;
  let guard = 0; while (foc() !== 'Screen flashes' && guard++ < 30) key(app, 'ArrowDown');
  assert.equal(foc(), 'Screen flashes'); key(app, 'Enter'); assert.equal(meta.settings.flashes, false); assert.ok(app.saved >= 1, 'persisted');
  guard = 0; while (foc() !== 'High contrast text' && guard++ < 30) key(app, 'ArrowDown'); key(app, ' '); assert.equal(meta.settings.highContrast, true);
  guard = 0; while (foc() !== 'Colorblind palette' && guard++ < 30) key(app, 'ArrowDown'); key(app, 'ArrowRight'); assert.equal(meta.settings.colorblindMode, 'protanopia');
  guard = 0; while (foc() !== 'Master volume' && guard++ < 30) key(app, 'ArrowDown'); const v = meta.settings.master; key(app, 'ArrowLeft'); assert.ok(meta.settings.master < v);
  key(app, 'Escape'); frames(app, 2); assert.ok(!app.top() || app.top().name !== 'settings');
  A.applySettings(app); assert.equal(app.highContrast, true); assert.equal(FX_OPTS.flashes, false);
  assert.equal(JSON.parse(JSON.stringify(meta.settings)).flashes, false, 'serialisable');
}
// ---- flashes: switch + 3 per second cap ----
{
  FX_OPTS.flashes = true; const fx = new Fx();
  for (let i = 0; i < 6; i++) { fx.flash('#fff', 0.4, 0.2); fx.update(0.05); }
  assert.ok(fx.flashes.length <= 3, 'max 3 flashes in the first second, got ' + fx.flashes.length);
  FX_OPTS.flashes = false; const f2 = new Fx(); f2.flash('#fff', 0.4, 0.2); assert.equal(f2.flashes.length, 0); FX_OPTS.flashes = true;
  A.resetFlashes(); assert.ok(A.flashAllowed(0) && A.flashAllowed(0.1) && A.flashAllowed(0.2) && !A.flashAllowed(0.3) && A.flashAllowed(1.3));
}
// ---- palettes are distinguishable under simulated deficiencies, and swap in place ----
{
  for (const m of A.CB_MODES) {
    const sep = A.minSeparation(A.PALETTES[m], m), base = A.minSeparation(A.BASE_SCHOOLS, m);
    assert.ok(sep > base, `${m}: safe palette (${sep.toFixed(1)}) beats default (${base.toFixed(1)})`);
    assert.ok(sep >= 30, `${m}: min deltaE ${sep.toFixed(1)}`);
  }
  A.applyPalette('tritanopia'); assert.equal(COL.ember, A.PALETTES.tritanopia.ember); assert.equal(CB.on, true);
  A.applyPalette(null); assert.equal(COL.ember, A.BASE_SCHOOLS.ember); assert.equal(CB.on, false);
  assert.equal(new Set(Object.values(A.SCHOOL_PATTERNS)).size, 7, 'seven distinct patterns');
}
// ---- announcements ----
{
  const { app } = await mk(); const c = { turn: 1, energy: 3, player: { hp: 40 }, over: null, enemies: [{ dead: false, def: { name: 'Gaunt' } }] };
  A.watchCombat(app, c, () => 'attacks for 8');
  assert.match(app.a11y.log[0], /Turn 1.*Gaunt attacks for 8/);
  app.t += 2; c.player.hp = 31; A.watchCombat(app, c, () => 'x'); assert.match(app.a11y.log.at(-1), /take 9 damage/);
  app.t += 2; c.turn = 2; A.watchCombat(app, c, () => 'x'); assert.match(app.a11y.log.at(-1), /Turn 2/);
  app.t += 2; c.over = 'win'; A.watchCombat(app, c); assert.match(app.a11y.log.at(-1), /Victory/);
  const c2 = { turn: 1, energy: 0, player: { hp: 0 }, over: 'lose', enemies: [] }; A.watchCombat(app, c2); assert.match(app.a11y.log.at(-1), /Defeat/);
  app.shared.meta.settings.announce = false; assert.equal(app.announce('hello'), false);
}
console.log('graftwork a11y ok');

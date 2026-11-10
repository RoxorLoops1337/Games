// Transitions, intro plates, phase beats, graft and temper beats: headless, with fake canvases.
import assert from 'node:assert/strict';
import { makeApp, frames } from './graftwork_lib.mjs';

const TR = await import('../graftwork/ui/transitions.js');
const { FX_OPTS } = await import('../graftwork/ui/fx.js');
const calls = [];
const app = await makeApp({ run: null, meta: { settings: {} }, audio: { sfx: (n) => calls.push(n), setIntensity: (x) => calls.push('int:' + x), audioState: () => ({ intensity: 0.2 }) } });
for (const n of ['a', 'b', 'c']) app.register(n, { enter() {}, leave() {}, update() {}, draw() {} });
app.shared.transitions = TR;
TR.installTransitions(app);
app.overlay = () => TR.drawTransitions(app);
app.go('a'); frames(app, 5);

// 1. a screen change starts a wipe that is short and never blocks the new screen
app.go('b');
assert.ok(app.tr.wipe, 'wipe started'); assert.equal(app.current, 'b', 'new screen is live at once');
assert.ok(app.tr.wipe.life >= 0.35 && app.tr.wipe.life <= 0.5, 'wipe length 350 to 500 ms: ' + app.tr.wipe.life);
frames(app, 40); assert.equal(app.tr.wipe, null, 'wipe over inside ~600 ms');
// same-screen go: no wipe
app.go('b'); assert.equal(app.tr.wipe, null);
// kinds per destination
assert.equal(TR.wipeKind('ward', 'combat'), 'seal'); assert.equal(TR.wipeKind('reward', 'graft'), 'thread'); assert.equal(TR.wipeKind('ward', 'forge'), 'thread'); assert.equal(TR.wipeKind('combat', 'reward'), 'ink'); assert.equal(TR.wipeKind('graft', 'ward'), 'ink');
for (const to of ['combat', 'graft', 'ward']) { app.go(to === 'ward' ? 'c' : 'a'); frames(app, 3); app.tr.wipe = null; }

// 2. a click skips the wipe
app.go('c'); frames(app, 3); app.go('a'); assert.ok(app.tr.wipe);
frames(app, 6); app.mouse.pressed = true; frames(app, 1); app.mouse.pressed = false; assert.equal(app.tr.wipe, null, 'click skips');

// 3. reduced motion: 160 ms fade, no post calls
FX_OPTS.reduced = true;
app.go('b'); frames(app, 3); assert.equal(app.tr.wipe.kind, 'fade'); assert.ok(app.tr.wipe.life <= 0.2);
frames(app, 20); assert.equal(app.tr.wipe, null);

// 4. intro plate: bumps the music, ends, restores intensity, click skips
FX_OPTS.reduced = false;
const it = TR.introCard(app, { name: 'THE MATRON', kind: 'boss' });
assert.ok(it && app.tr.intro); assert.ok(calls.includes('int:0.95'));
frames(app, 20); assert.ok(app.tr.intro.slammed, 'plate slammed');
app.mouse.pressed = true; frames(app, 1); app.mouse.pressed = false; frames(app, 40);
assert.equal(app.tr.intro, null, 'click skipped the plate');
TR.introCard(app, { name: 'THE RESIDENT', kind: 'elite' }); assert.ok(calls.includes('int:0.75'));
frames(app, 150); assert.equal(app.tr.intro, null, 'plate ends by itself');
FX_OPTS.reduced = true; TR.introCard(app, { name: 'X', kind: 'boss' }); frames(app, 80); assert.equal(app.tr.intro, null, 'reduced plate is shorter'); FX_OPTS.reduced = false;

// 5. phase watcher fires once when data.phase rises
const c = { enemies: [{ def: { kind: 'boss' }, hp: 50, data: {} }] };
TR.watchPhases(app, c); assert.equal(app.tr.phases, 0);
c.enemies[0].data.phase = 2; TR.watchPhases(app, c); TR.watchPhases(app, c); assert.equal(app.tr.phases, 1);
assert.ok(app.tr.phase); frames(app, 120); assert.equal(app.tr.phase, null);

// 6. graft beats are safe with and without an Fx
const st = {}; const fxs = { emit() {}, shake() {}, float() {}, ring() {} };
TR.stitchBeat(app, fxs, 1, 1, 3, 6, '#fff', true); TR.stitchBeat(app, null, 1, 1, 3, 6, '#fff', false);
TR.clunkBeat(app, st, { strain: 2 }, 5, 5); assert.equal(st.strainK, 1); assert.equal(st.strainBad, true);
TR.decay(st, 0.3); assert.ok(st.strainK < 1); assert.ok(Math.abs(TR.gaugeOffset(st, 1).x) <= 5);
TR.gaugeGlow(app, st, 0, 0, 10, 10); TR.overloadBeat(app, fxs, 5, 5, 25); TR.overloadBeat(app, null, 5, 5); TR.shatterBeat(app, 3, 3);
assert.ok(calls.includes('overload'));

// 7. temper timeline: three strikes, then rivets, then steel
const fx2 = { hitstop() {}, shake() {}, burst() {}, ring() {}, flash() {} };
const a = { t: 0 }; let done = false; let n = 0;
while (!done && n++ < 400) done = TR.temperUpdate(app, a, fx2, 1 / 60);
assert.ok(done && a.hit.every(Boolean) && a.hit.length === 3 && a.popped && a.cooled);
assert.ok(TR.heatAt(0) === 0 && TR.heatAt(1.1) >= 0.99 && TR.heatAt(2.4) === 0 && TR.steelAt(2) === 1);
const p0 = TR.hammerPose(0.5), p1 = TR.hammerPose(0.64); assert.ok(p1.ang > p0.ang, 'hammer comes down');
TR.temperTint(app, a, 640, 330, 220, 310); TR.temperRivets(app, a, 640, 330, 220, 310, 3);
assert.equal(TR.busy(app), false);
console.log('graftwork_ui_transitions: ok');

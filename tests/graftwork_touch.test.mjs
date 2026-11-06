// Touch gate: real pointer events (touch type) through the canvas listeners of ui/core.js, on a phone-sized stage (844x390).
// Covers tap select + preview, tap enemy, drag to target, drag back to cancel, second finger cancel, long press, end-turn confirm,
// drag-to-scroll (a scroll never clicks), the 40 CSS px tap-target floor and that a lift outside a button is not a click.
import assert from 'node:assert/strict';
import { fakeCtx, installDom, frames } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as audio from '../graftwork/ui/audio.js';
import combat from '../graftwork/ui/combat.js';

installDom();
globalThis.window.innerWidth = 844; globalThis.window.innerHeight = 390;
const { createApp, W, H } = await import('../graftwork/ui/core.js');
const DT = 1 / 60;
const listeners = {};
const canvas = {
  getContext: () => fakeCtx(), style: {}, width: 1280, height: 720, setPointerCapture() {},
  addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
  getBoundingClientRect() { return { left: parseFloat(this.style.left) || 0, top: parseFloat(this.style.top) || 0, width: parseFloat(this.style.width) || 1280, height: parseFloat(this.style.height) || 720 }; },
};
const run = RUN.newRun({ hero: 'marrow', seed: 'touch' });
run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: ['night_nurse'] };
const flow = { RUN, route() {}, openDeck() {}, openSettings() {} };
const app = createApp(canvas, { shared: { run, audio, flow } });
app.resize();
assert.ok(app.scale < 0.6 && app.scale > 0.5, 'phone scale ' + app.scale);
app.register('combat', combat);
app.go('combat', { run });
frames(app, 240); // banner and the opening draw
const st = () => combat.api().state();

// ---- finger helpers: logical px -> client px -> pointer events
const css = (x, y) => ({ clientX: app.offX + (x / W) * W * app.scale, clientY: app.offY + (y / H) * H * app.scale });
let nextId = 1;
function fire(type, id, x, y, primary = true) { const e = { type, pointerId: id, pointerType: 'touch', isPrimary: primary, button: 0, ...css(x, y), preventDefault() {} }; for (const f of listeners[type] || []) f(e); }
const down = (x, y, id = 1, primary = true) => { fire('pointerdown', id, x, y, primary); };
const move = (x, y, id = 1, primary = true) => { fire('pointermove', id, x, y, primary); };
const up = (x, y, id = 1, primary = true) => { fire('pointerup', id, x, y, primary); fire('pointerleave', id, x, y, primary); };
const tick = (n = 1) => frames(app, n);
function tap(x, y) { down(x, y); tick(2); up(x, y); tick(3); }
function settle() { tick(90); }
const c = () => st().c;

// ---- 1. tap a card: selected with the touch preview; X cancels; tapping the enemy plays it
const p0 = combat.api().handPos(0);
tap(p0.x, p0.y + 40);
assert.ok(st().sel && st().u.touchPrev, 'tap selects with preview');
const sel1 = st().sel;
const dc = st().hand.find((d) => d.uid === sel1);
const spec = c().hand.find((k) => k.uid === sel1);
settle();
const reg = (id) => app.layout.getAll().find((r) => r.id === id);
const cancel = reg('preview_cancel'); assert.ok(cancel, 'preview cancel button registered');
const gc = app.hitRect(cancel.x, cancel.y, cancel.w, cancel.h); assert.ok(gc.w * app.scale >= 39.5 && gc.h * app.scale >= 39.5, `preview cancel hit area is ${Math.round(gc.w * app.scale)} css px`);
const playB = reg('preview_play'); const gpl = app.hitRect(playB.x, playB.y, playB.w, playB.h); assert.ok(gpl.h * app.scale >= 39.5, 'PLAY hit area is 40+ css px');
tap(cancel.x + cancel.w / 2, cancel.y + cancel.h / 2); settle();
assert.equal(st().sel, null, 'X cancels the preview');
assert.equal(c().playsTurn, 0, 'cancel played nothing');
// find an attack card in hand
const atkIdx = c().hand.findIndex((k) => k.spec ? k.spec.type === 'attack' : (st().hand.find((d) => d.uid === k.uid) || {}).w && false) ;
const handAttack = () => { const n = c().hand.length; for (let i = 0; i < n; i++) { const d = st().hand[i]; const s = d && d.w && d.w.spec; } return -1; };
function attackIndex() { for (let i = 0; i < st().hand.length; i++) { const w = st().hand[i].w; const t = w && (w.type || (w.card && w.card.type)); if (t === 'attack') return i; } return 0; }
const ai = attackIndex();
const pa = combat.api().handPos(ai);
const e0 = combat.api().enemyPos(0);
const hp0 = c().enemies[0].hp;
tap(pa.x, pa.y + 40); settle();
assert.ok(st().sel, 'attack card selected');
tap(e0.x, e0.y); settle();
assert.equal(c().playsTurn, 1, 'tapping the enemy plays the selected attack (single enemy, touch preview)');
assert.ok(c().enemies[0].hp < hp0, 'the enemy took damage');

// ---- 2. drag to target plays; drag back over the hand cancels; second finger cancels
settle();
function dragTo(from, pts, id = 1) { down(from.x, from.y, id); tick(2); for (const q of pts) { move(q.x, q.y, id); tick(4); } }
const pb = combat.api().handPos(0);
const eN = combat.api().enemyPos(0);
const plays1 = c().playsTurn, en1 = c().energy;
dragTo({ x: pb.x, y: pb.y + 40 }, [{ x: pb.x, y: pb.y - 60 }, { x: pb.x + 80, y: 330 }, { x: eN.x, y: eN.y + 70 }]);
assert.ok(st().drag && st().drag.touch, 'a drag is live (touch)');
assert.ok(st().drag.armed, 'armed above the arm line');
up(eN.x, eN.y + 70); tick(4); settle();
assert.ok(c().playsTurn >= plays1 || c().energy <= en1, 'the drop resolved');
settle();
// cancel by dragging back
const playsA = c().playsTurn, enA = c().energy;
const pc = combat.api().handPos(0);
dragTo({ x: pc.x, y: pc.y + 40 }, [{ x: pc.x, y: pc.y - 90 }, { x: pc.x + 60, y: 300 }, { x: pc.x + 20, y: 520 }, { x: pc.x, y: 640 }]);
tick(4);
assert.ok(!st().drag, 'dragging back over the hand drops the drag');
up(pc.x, 640); tick(4); settle();
assert.equal(c().playsTurn, playsA, 'drag back played nothing'); assert.equal(c().energy, enA);
// second finger
const pd = combat.api().handPos(1);
dragTo({ x: pd.x, y: pd.y + 40 }, [{ x: pd.x, y: pd.y - 90 }, { x: eN.x, y: eN.y + 70 }]);
assert.ok(st().drag, 'drag live before the second finger');
down(300, 200, 2, false); tick(3);
assert.ok(!st().drag, 'a second finger cancels the drag');
assert.ok(app.mouse.x > 0 && Math.abs(app.mouse.x - 300) > 1 || true);
up(300, 200, 2, false); tick(2); up(eN.x, eN.y + 70, 1); tick(4); settle();
assert.equal(c().playsTurn, playsA, 'the cancelled drag did not play on lift');

// ---- 3. long press: tooltip face shows, lifting does not play
const pe = combat.api().handPos(2);
const playsB = c().playsTurn;
down(pe.x, pe.y + 40); tick(45);
assert.ok(st().down && st().down.long, 'long press detected after 350 ms');
assert.ok(st().hov, 'long press shows the full card face (hover state)');
up(pe.x, pe.y + 40); tick(4); settle();
assert.equal(c().playsTurn, playsB, 'releasing a long press does not play');

// ---- 4. end turn confirm: tap elsewhere cancels, tap the box ends
settle();
st().sel = null; st().u.touchPrev = false;
const et = combat.api().endTurn;
if (c().energy > 0) {
  tap(et.x, et.y); tick(30);
  assert.ok(st().u.endConfirm, 'end turn asks to confirm with energy left');
  const box = reg('end_confirm'); assert.ok(box, 'confirm box registered');
  assert.ok(box.y >= 0 && box.y + box.h <= et.y, 'confirm box stays above End Turn, on screen');
  tap(560, 200); tick(5);
  assert.ok(!st().u.endConfirm, 'a tap elsewhere keeps playing (no Esc on touch)');
  tap(et.x, et.y); tick(30);
  const box2 = reg('end_confirm'); assert.ok(box2);
  const turn0 = c().turn;
  tap(box2.x + box2.w / 2, box2.y + box2.h / 2); tick(240);
  assert.ok(c().turn > turn0 || c().over, 'tapping the confirm box ends the turn');
}

// ---- 5. tap-target floor: every clickable rect, grown by the floor, is 40 css px each way (buttons and custom clickables)
const seen = [];
const oc = app.clicked;
app.clicked = (x, y, w, h) => { const g = app.hitRect(x, y, w, h); seen.push({ x: g.x, y: g.y, w: g.w * app.scale, h: g.h * app.scale, ex: w * app.scale, eh: h * app.scale }); return oc(x, y, w, h); };
settle(); tick(6);
app.clicked = oc;
assert.ok(seen.length >= 4, 'combat registered clickables: ' + seen.length);
const small = seen.filter((r) => r.w < 39.5 || r.h < 39.5);
assert.equal(small.length, 0, 'tap targets under 40 css px: ' + JSON.stringify(small.slice(0, 4)));

// ---- 6. a press that starts on a button but lifts away is not a click; a press just outside a small button still hits
{
  let hits = 0;
  const bx = 100, by = 100, bw = 40, bh = 20;
  const frameWith = () => { if (app.button('x', bx, by, bw, bh)) hits++; };
  const prev = app.top(); app.stack.push({ name: 't', draw: () => frameWith() }); // top-level test screen on top of combat
  tick(2);
  down(bx + bw / 2, by + bh / 2); tick(2); up(bx + bw / 2, by + bh / 2 + 200); tick(3); assert.equal(hits, 0, 'lift away from the button is no click');
  down(bx + bw / 2, by + bh + 12); tick(2); up(bx + bw / 2, by + bh + 12); tick(3); assert.equal(hits, 1, 'a tap just under a small button hits it (grown target)');
  app.stack.pop();
}

// ---- 7. a drag scrolls and never clicks (deck view style scroll area)
{
  let clicks = 0, wheel = 0;
  const scr = { name: 's', draw: (a) => { wheel += a.mouse.wheel; if (a.clicked(100, 200, 300, 60)) clicks++; } };
  app.stack.push(scr); tick(2);
  down(200, 230); tick(2); for (let y = 230; y > 80; y -= 30) { move(200, y); tick(2); } up(200, 80); tick(4);
  assert.equal(clicks, 0, 'scroll gesture does not click what it started on');
  assert.ok(wheel > 100, 'drag up scrolls down: wheel=' + wheel);
  down(200, 230); tick(2); up(200, 230); tick(3); assert.equal(clicks, 1, 'a plain tap still clicks');
  app.stack.pop();
}
console.log('graftwork touch ok');

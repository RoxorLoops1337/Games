// Thread UI: rail state, hand badges, preview text vs the real payout, and every seam event animating without a throw.
import assert from 'node:assert/strict';
import { makeApp, frames } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as audio from '../graftwork/ui/audio.js';
import { newCombat, playCard, specOf } from '../graftwork/engine/combat.js';
import { schoolsOf } from '../graftwork/engine/cards.js';
import { ENEMIES, GRAFTS } from '../graftwork/data/index.js';
import { seamPreview } from '../graftwork/engine/seam.js';
import { drawSeamRail, seamBadge, drawSeamBadge, onSeamEvent, payShort, seamTip } from '../graftwork/ui/seam_ui.js';
import * as L from '../graftwork/ui/combat_layout.js';
import { getAll, findOverlaps } from '../graftwork/ui/layout_registry.js';
import combat from '../graftwork/ui/combat.js';

const app = await makeApp({ audio, meta: { settings: {}, tips: {} } });
const eid = Object.keys(ENEMIES).find((k) => ENEMIES[k].kind === 'normal') || Object.keys(ENEMIES)[0];
const fx = { calls: 0 };
for (const k of ['burst', 'emit', 'float', 'bolt', 'ring', 'shake', 'flash', 'hitstop', 'slowmo']) fx[k] = () => { fx.calls++; };
const entPos = (w) => (w === 'player' || w == null ? { x: 260, y: 360 } : { x: 800, y: 300 });

function fresh(seed) {
  const run = RUN.newRun({ hero: 'marrow', seed });
  const c = newCombat(run, [eid]);
  c.ev.length = 0; c.energy = 99; c.maxEnergy = 99;
  return c;
}
// pull a card matching pred out of the piles and put it in hand
function grab(c, pred) {
  for (const pile of [c.hand, c.drawPile, c.discard]) {
    const i = pile.findIndex((k) => pred(k, specOf(c, k)));
    if (i >= 0) { const [k] = pile.splice(i, 1); c.hand.push(k); return k; }
  }
  return null;
}
const sch = (s) => (k, sp) => schoolsOf(sp).length === 1 && schoolsOf(sp)[0] === s && sp.type !== 'junk' && sp.cost !== 'X' && sp.target !== 'none' && !(sp.flags && sp.flags.unplayable);
// graft a bare card with a safe graft of `school` so it carries that school
function withSchool(c, school) {
  const gid = Object.keys(GRAFTS).find((g) => GRAFTS[g].school === school && GRAFTS[g].tier === 'safe') || Object.keys(GRAFTS).find((g) => GRAFTS[g].school === school);
  const k = grab(c, (kk, sp) => !schoolsOf(sp).length && sp.type !== 'junk' && sp.type !== 'power' && sp.cost !== 'X' && !(sp.flags && sp.flags.unplayable));
  assert.ok(k && gid, 'bare card and a ' + school + ' graft exist');
  k.inst.grafts = [gid]; k.specKey = -1;
  assert.ok(schoolsOf(specOf(c, k)).includes(school));
  return k;
}
function play(c, card) {
  const hi = c.hand.indexOf(card); assert.ok(hi >= 0);
  c.ev.length = 0; playCard(c, hi, 0);
  const evs = c.ev.slice(); c.ev.length = 0;
  for (const ev of evs) { const ms = onSeamEvent(app, ev, { fx, entPos, c }); if (/^seam/.test(ev.t)) assert.equal(typeof ms, 'number'); }
  return evs;
}
const rail = (c, focus) => { app.ctx.__x = 1; drawSeamRail(app, c, L.SEAM, 0, focus || null, true); frames(app, 2); };

// ---- empty state, extend, extend, cut
{
  const c = fresh('seam-a');
  const b1 = grab(c, sch('blood')), b2 = grab(c, (k, sp) => k !== b1 && sch('blood')(k, sp)), r1 = withSchool(c, 'ember');
  assert.ok(b1 && b2 && r1, 'marrow deck has blood cards');
  rail(c, null); // empty Line teaches
  assert.equal(c.seam.len, 0);
  assert.equal(seamBadge(c, b1), 'extend');
  play(c, b1); rail(c, b2); assert.equal(c.seam.len, 1);
  assert.equal(seamBadge(c, b2), 'extend');
  assert.equal(seamBadge(c, r1), 'cut');
  const pvE = seamPreview(c, b2);
  play(c, b2); rail(c, r1); assert.equal(c.seam.len, 2);
  assert.equal(pvE.len, 2);
  const pv = seamPreview(c, r1);
  assert.equal(pv.kind, 'cut');
  assert.ok(pv.payout.length >= 1, 'a Line of 2 pays');
  assert.equal(payShort('blood', pv.payout[0].stitches), `Heal ${2 * pv.payout[0].stitches}`);
  const hp0 = c.player.hp; c.player.hp = Math.max(1, c.player.hp - 20); const hp1 = c.player.hp;
  const evs = play(c, r1); rail(c, null);
  const cut = evs.find((e) => e.t === 'seamCut'), pay = evs.find((e) => e.t === 'seamPay');
  assert.ok(cut && pay, 'cut and pay events');
  assert.equal(pay.school, pv.payout[0].school);
  assert.equal(pay.stitches, pv.payout[0].stitches, 'preview stitches equal the real payout');
  assert.equal(pay.amount, 2 * pay.stitches);
  assert.ok(c.player.hp > hp1 && hp0 > 0, 'blood healed');
  assert.equal(c.seam.len, 1, 'a new Line starts');
  frames(app, 40);
}

// ---- slack, frayed, tied
{
  const c = fresh('seam-b');
  const b1 = grab(c, sch('blood'));
  const junk = grab(c, (k, sp) => !schoolsOf(sp).length && sp.type !== 'junk' && sp.type !== 'power' && !(sp.flags && sp.flags.unplayable)); assert.ok(junk, 'a schoolless card');
  assert.equal(seamBadge(c, junk), 'slack');
  play(c, b1); rail(c, junk);
  const len = c.seam.len;
  if (specOf(c, junk).flags.unplayable) { /* junk cannot be played; badge only */ }
  else { const evs = play(c, junk); assert.ok(evs.some((e) => e.t === 'seamSlack')); assert.equal(c.seam.len, len); }
  const b2 = grab(c, (k, sp) => k !== b1 && sch('blood')(k, sp)); b2.jam = true;
  assert.equal(seamBadge(c, b2), 'slack', 'a jammed card is Frayed');
  rail(c, b2); // shows the frayed icon
  const evs = play(c, b2);
  assert.ok(evs.some((e) => e.t === 'seamFray'));
  assert.equal(c.seam.len, len);
  // tied: a card with a fused graft
  const gid = Object.keys(GRAFTS).find((g) => GRAFTS[g].school);
  const b3 = grab(c, (k, sp) => !k.jam && sch('blood')(k, sp));
  if (b3 && b3.inst) { b3.inst.fused = [gid]; if (schoolsOf(specOf(c, b3)).length) { const kind = seamBadge(c, b3); assert.ok(['tied', 'extend', 'cut'].includes(kind)); } }
  c.seam.tied = true; c.seam.len = Math.max(1, c.seam.len); rail(c, null);
  c.seam.tied = false;
}

// ---- every event type, every school, reduced motion too
{
  const c = fresh('seam-c');
  for (const reduced of [false, true]) {
    app.shared.meta.settings.reducedMotion = reduced;
    for (const school of ['ember', 'echo', 'hoard', 'blood', 'rust', 'static', 'gilded']) {
      onSeamEvent(app, { t: 'seamExtend', len: 1, school, card: 1, start: true }, { fx, entPos, c });
      onSeamEvent(app, { t: 'seamExtend', len: 2, school, card: 2 }, { fx, entPos, c });
      onSeamEvent(app, { t: 'seamExtend', len: 3, school, card: 3 }, { fx, entPos, c });
      rail(c, null);
      onSeamEvent(app, { t: 'seamCut', paid: 2, school, len: 3, card: 4, kind: 'cut' }, { fx, entPos, c });
      onSeamEvent(app, { t: 'seamPay', school, stitches: 2, kind: 'cut', amount: 4 }, { fx, entPos, c });
      onSeamEvent(app, { t: 'seamPay', school, stitches: 1, kind: 'cut', amount: 0 }, { fx, entPos, c });
      for (let i = 0; i < 90; i++) { drawSeamRail(app, c, L.SEAM, 0, null, false); app.tick(1 / 60); }
    }
    onSeamEvent(app, { t: 'seamCut', paid: 0, school: null, len: 0, card: 5, kind: 'break' }, { fx, entPos, c });
    onSeamEvent(app, { t: 'seamSlack', card: 1 }, { fx, entPos, c });
    onSeamEvent(app, { t: 'seamFray', card: 1 }, { fx, entPos, c });
    onSeamEvent(app, { t: 'nothing' }, { fx, entPos, c });
    onSeamEvent(app, { t: 'seamSlack', card: 1 }, {}); // no fx, no entPos
    for (let i = 0; i < 40; i++) { drawSeamRail(app, c, L.SEAM, 0, null, true); app.tick(1 / 60); }
  }
  app.shared.meta.settings.reducedMotion = false;
  for (const kind of ['extend', 'cut', 'slack', 'tied', null]) for (const s of [0.54, 1]) drawSeamBadge(app, kind, 100, 100, s, 'ember');
  seamTip(app, c, L.SEAM);
  assert.ok(fx.calls > 20, 'effects were requested');
}

// ---- the screen: rail registered, never overlapping another HUD widget
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'seam-d' });
  run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: [eid] };
  const app2 = await makeApp({ run, audio, flow: { RUN, route() {}, openDeck() {}, openSettings() {} } });
  app2.register('combat', combat); app2.go('combat', { run });
  frames(app2, 120);
  const r = getAll().find((x) => x.id === 'seamRail');
  assert.ok(r, 'the rail registers with app.reg');
  assert.deepEqual([r.x, r.y, r.w, r.h], [L.SEAM.x, L.SEAM.y, L.SEAM.w, L.SEAM.h]);
  assert.deepEqual(findOverlaps().filter((o) => o.a === 'seamRail' || o.b === 'seamRail'), [], 'rail overlaps no HUD widget');
  assert.ok(L.SEAM.x + L.SEAM.w <= L.END_BTN.x && L.SEAM.y + L.SEAM.h <= 530);
}
console.log('graftwork_ui_seam: ok');

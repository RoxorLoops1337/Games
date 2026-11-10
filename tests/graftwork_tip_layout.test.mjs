// Tooltip layout sweep: hover a grid over each screen at every phone scale and on the desktop; every tip drawn goes through checkTip
// (inside the stage, clear of the reserved zone, panels and sections apart, no text cut, orphaned or over another) and the frame it is
// drawn on through the layout checks of tests/graftwork_layout_lib.mjs. The layouts of the screens themselves are tests/graftwork_ui_layout.test.mjs,
// when a tip shows and goes is tests/graftwork_tip_lifecycle.test.mjs.
import assert from 'node:assert/strict';
import { frames, click, key, wardOpen } from './graftwork_lib.mjs';
import { layoutGate, graftHeavy, wonFight, openEvent, allSeen } from './graftwork_layout_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import { TIP_TIMING } from '../graftwork/ui/tooltips.js';
TIP_TIMING.SHOW_DELAY = 0.1; // the sweeps hover for 11 frames (0.18 s): the real 0.25 s delay is covered by graftwork_tip_lifecycle
import { RELICS, POTIONS, EVENTS, ENEMIES, STATUSES } from '../graftwork/data/index.js';

// Faults the sweep found on scenes the Ward really makes (design/CLEANUP_PLAN.md, "Layout faults the port found"): listed, counted and
// printed. Everything else in these scenes, and anything new, still fails, and an entry that stops matching fails until it is deleted.
const OPEN_WARD = [
  [/^reward\/(p0\.64|p0\.54|p0\.46)\/elite\/ward/, /^(overlap|text-hits|text-overflow|text-text)$/, null], // relic + potion + plans: the plan row runs into the notes and Continue
  [/^ward\/(p0\.54|p0\.46)\/sweep/, /^text-text$/, /^"(Workshop|Isolati|7 draw)/],                          // a plan's name over its cost digits, the deck counter lines
  [/^shop\/p0\.46/, /^text-truncated$/, /^"(Weight 1\. Boon: When it extends the Line|Featherweig)/],        // a long graft subtitle in the card picker, one relic name
];
const { make, look, go, sweepTips, report, flowFor } = layoutGate({ openWard: OPEN_WARD });

const combatMod = (await import('../graftwork/ui/combat.js')).default;
const audioMod = await import('../graftwork/ui/audio.js');
for (const pscale of [0.64, 0.54, 0.46, 0]) {
  const T = (n) => `${n}/` + (pscale ? 'p' + pscale : 'tips-desk');
  const mk = (o) => make(Object.assign({ seed: 'tip', pscale }, o));
  for (const four of [false, true]) {
    const h = await mk({}); flowFor(h); graftHeavy(h.run, four ? 9 : 2); if (four) h.run.relics.push('r_second_opinion'); h.run.gold = 999;
    RUN.startGraftPick(h.run); go(h, 'graft'); look(h, 90, T('graft') + 'sw'); sweepTips(h, T('graft') + '/sweep');
    key(h.app, '2'); key(h.app, 'q'); look(h, 40, T('graft') + 'sw2'); sweepTips(h, T('graft') + '/sweep-pair');
  }
  { const h = await mk({}); flowFor(h); h.run.gold = 9999; h.run.act = 3; graftHeavy(h.run, 4); wardOpen(h.run, 'shop'); go(h, 'shop'); look(h, 60, T('shop') + 'sw'); sweepTips(h, T('shop') + '/sweep');
    h.app.mouse.x = 0; h.app.mouse.y = 0; click(h.app, 370, 400); look(h, 30, T('shop') + 'pk'); sweepTips(h, T('shop') + '/sweep-picker'); }
  { const h = await mk({}); flowFor(h); h.run.gold = 999; graftHeavy(h.run, 6); wardOpen(h.run, 'forge'); go(h, 'forge'); look(h, 60, T('forge') + 'sw'); sweepTips(h, T('forge') + '/sweep');
    const fm = await import('../graftwork/ui/forge.js');
    for (const opt of [0, 1, 2, 3]) { click(h.app, fm.optionCenterX(opt), 300); look(h, 30, T('forge') + 'pk'); sweepTips(h, T('forge') + '/sweep-picker' + opt, [120, 90]); key(h.app, 'Escape'); look(h, 20, T('forge') + 'cl'); } }
  for (const real of [false, true]) { const h = await mk({}); flowFor(h); h.run.act = 3; const rw = real ? wonFight(h, 'elite') : RUN.fightRewards(h.run, 'elite', {}); rw.potion = Object.keys(POTIONS)[1]; rw.relic = Object.keys(RELICS)[3]; go(h, 'reward'); look(h, 80, T('reward') + (real ? '/elite/ward/sw' : 'sw')); sweepTips(h, T('reward') + (real ? '/elite/ward/sweep' : '/sweep')); }
  { const h = await mk({}); flowFor(h); h.app.go('base'); graftHeavy(h.run, 8); h.app.push('deckview', {}); look(h, 40, T('deck') + 'sw'); sweepTips(h, T('deck') + '/sweep', [80, 70]); }
  { const h = await mk({ meta: { seen: allSeen() } }); flowFor(h); h.app.go('base'); h.app.push('codex', {}); for (let i = 0; i < 7; i++) { h.app.top().setTab(i); look(h, 20, T('codex') + 'sw'); sweepTips(h, T('codex') + '/sweep' + i, [110, 80]); } }
  { const h = await mk({}); const f = flowFor(h); RUN.startAct(h.run, 2); h.run.relics = Object.keys(RELICS).slice(0, 12); h.run.potions = Object.keys(POTIONS).slice(0, 3); graftHeavy(h.run, 9); f.route(); assert.equal(h.app.current, 'ward'); frames(h.app, 200); sweepTips(h, T('ward') + '/sweep'); } // the Ward's own layout sweeps are in tests/graftwork_ui_ward.test.mjs; here every tip it shows goes through checkTip
  for (const ev of Object.values(EVENTS).filter((e, i) => i % 4 === 0)) { const h = await mk({}); flowFor(h); h.run.act = ev.act || 1; h.run.gold = 300; openEvent(h, ev.id, pscale * 100); h.run.flags = h.run.flags || {}; go(h, 'event'); if (!h.app.screens.event.ev) continue; look(h, 400, T('event') + 'sw'); sweepTips(h, T('event') + '/sweep', [120, 80]); }
  for (const [n, stN] of [[1, 8], [3, 8], [4, 3]]) { // combat: 1 / 3 / 4 enemies and the hand as dealt, with 8 / 8 / 3 statuses on everyone
    const h = await mk({ hero: 'wick' }); flowFor(h); h.app.shared.audio = audioMod; h.app.register('combat', combatMod);
    graftHeavy(h.run, 6); h.run.phase = 'combat';
    const names = Object.values(ENEMIES).filter((e) => e.act === 1 && e.kind === 'normal').map((e) => e.id).slice(0, n);
    h.run.pending = { kind: 'combat', fightKind: 'normal', enemies: names }; h.app.go('combat', { run: h.run }); frames(h.app, 200);
    const st = combatMod.api().state(), c = st.c, ids = Object.keys(STATUSES).slice(0, stN);
    for (const e of c.enemies) for (const sid of ids) { e.st[sid] = 2; st.edBy.get(e.uid).st[sid] = 2; }
    for (const sid of ids) { c.player.st[sid] = 3; st.P.st[sid] = 3; }
    frames(h.app, 60); sweepTips(h, T('combat') + `/${n}e`, [64, 50]);
  }
}
report(['ward', 'combat', 'reward', 'graft', 'shop', 'forge', 'event', 'deck', 'codex']);
console.log('graftwork_tip_layout ok');

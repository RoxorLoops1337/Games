// The event screen: every event, every choice, played through the screen the way the Ward opens it (the hero walks into a Chapel that
// holds an event, so the pending event carries its hour), then on to wherever the event leads: back to the Ward, a queued fight or a graft pick.
// And the click guard: the click that skips the typewriter never picks a choice.
import assert from 'node:assert/strict';
import { makeApp, frames, click, key, wardOpen } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import { EVENTS, GRAFTS, HEROES } from '../graftwork/data/index.js';
const event = (await import('../graftwork/ui/event.js')).default;

async function setup(hero, seed) {
  const app = await makeApp({ run: null, meta: { settings: { reduceMotion: true } } });
  app.register('event', event); app.register('base', { draw() {} });
  const run = RUN.newRun({ hero, seed });
  app.shared.run = run;
  const flow = { RUN, route() { if (run.phase === 'event') app.go('event', { run }); else { flow.other = run.phase; app.go('base'); } }, openDeck() {}, openSettings() {}, abandon() { flow.abandoned = true; } };
  app.shared.flow = flow;
  return { app, run, flow };
}

// every event, every choice, at each hour in turn
const HOURS = ['midday', 'evening', 'night'];
let played = 0, n = 0; const after = new Set();
for (const ev of Object.values(EVENTS)) {
  for (let ci = 0; ci < ev.choices.length; ci++) {
    const hero = Object.keys(HEROES)[ci % 3], hour = HOURS[n++ % 3];
    const { app, run, flow } = await setup(hero, ev.id + ci);
    run.gold = 250; run.hp = 40;
    const gs = Object.keys(GRAFTS);
    run.deck.slice(0, 6).forEach((d, i) => { d.grafts = [gs[i], gs[i + 8]].filter((g) => g); });
    run.act = ev.act || 1;
    const p = wardOpen(run, 'event', { event: ev.id, phase: hour });
    assert.equal(run.phase, 'event'); assert.equal(p.id, ev.id); assert.equal(p.phase, hour, 'the event knows its hour');
    flow.route(); frames(app, 30); assert.equal(app.current, 'event'); key(app, 'Enter'); frames(app, 5);
    const ch = RUN.eventChoices(run)[ci];
    if (ch.ok) {
      if (ch.pick === 'card') { event.pick(app, ch, run); frames(app, 5); assert.ok(event.picker, 'picker opens'); event.choose(app, ch.i, ch.cards[0]); }
      else key(app, String(ci + 1));
      frames(app, 20);
      assert.ok(run.pending.result !== null, ev.id + ' choice ' + ci + ' resolved');
      frames(app, 120); event.cont(app); frames(app, 5);
      assert.ok(['ward', 'combat', 'graft'].includes(run.phase), `${ev.id} choice ${ci} leads on (${run.phase})`);
      assert.equal(flow.other, run.phase, 'the screen routed on');
      if (run.phase === 'ward') assert.equal(run.ward.walk, null, 'the walk that opened the event is over');
      after.add(run.phase); played++;
    } else frames(app, 10);
  }
}
for (const ph of ['ward', 'combat', 'graft']) assert.ok(after.has(ph), 'some event leads to ' + ph);
// reload with the result already set: Continue goes back to the Ward
{
  const { app, run, flow } = await setup('marrow', 'r');
  wardOpen(run, 'event', { event: 'e_coin_flip' }); run.pending.result = 'Already done.'; flow.route(); frames(app, 30);
  event.cont(app); assert.equal(run.phase, 'ward'); assert.equal(run.pending, null);
}
// the click that skips the typewriter must not pick a choice (first-hour playtest fix)
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'q3ev' });
  const id = Object.keys(EVENTS)[0];
  run.phase = 'event'; run.pending = { kind: 'event', id, result: null };
  const ev = event, choose = ev.choose;
  const app = await makeApp({ run, flow: { route() {}, openDeck() {} }, audio: null, meta: { settings: {}, tips: {} } });
  app.register('event', ev); app.go('event', { run });
  frames(app, 3);
  assert.ok(ev.shown < 1e8, 'text is still typing');
  click(app, 900, 300); // skip click (inside the panel, away from any choice row while typing)
  frames(app, 1);
  assert.equal(ev.result, null, 'the skip click did not pick a choice');
  // even a click on the first choice row right after the text finished is ignored inside the 150 ms guard
  const y1 = 64 + 48 + 42 + 8 + 20 + 400; // anywhere in the lower panel
  for (let i = 0; i < 3; i++) { click(app, 900, y1 - i * 60); }
  assert.equal(ev.result, null, 'no pick inside the 150 ms guard');
  frames(app, 20); // 333 ms
  assert.ok(ev.doneT != null && ev.t - ev.doneT >= 0.15, 'guard has elapsed');
  const picks = []; const orig = ev.choose.bind(ev); ev.choose = (a, i) => { picks.push(i); return orig(a, i); };
  const first = RUN.eventChoices(run).findIndex((c) => c.ok);
  assert.ok(first >= 0);
  // number key picks once the guard is over
  app.pressedKeys.push({ key: String(first + 1), preventDefault() {} }); app.tick(1 / 60);
  assert.ok(picks.length === 1 || ev.picker, 'a choice works after the guard');
  ev.choose = choose;
}
console.log(`graftwork_ui_event ok: ${played} event choices`);

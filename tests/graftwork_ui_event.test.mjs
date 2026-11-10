// The event screen: every event, every choice, played through the screen the way the Ward opens it (the hero walks into a Chapel that
// holds an event, so the pending event carries its hour), then on to wherever the event leads: back to the Ward, a queued fight or a graft pick.
import assert from 'node:assert/strict';
import { makeApp, frames, key, wardOpen } from './graftwork_lib.mjs';
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
console.log(`graftwork_ui_event ok: ${played} event choices`);

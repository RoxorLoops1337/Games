// Headless smoke test for the map and event screens.
import assert from 'node:assert/strict';
import { makeApp, frames, key } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import { EVENTS, GRAFTS, HEROES } from '../graftwork/data/index.js';
const map = (await import('../graftwork/ui/map.js')).default;
const event = (await import('../graftwork/ui/event.js')).default;

async function setup(hero, seed) {
  const app = await makeApp({ run: null, meta: { settings: { reduceMotion: true } } });
  app.register('map', map); app.register('event', event);
  const run = RUN.newRun({ hero, seed });
  app.shared.run = run;
  const flow = { RUN, route() { if (run.phase === 'map') app.go('map', { run }); else if (run.phase === 'event') app.go('event', { run }); else flow.other = run.phase; }, openDeck() {}, openSettings() {}, abandon() { flow.abandoned = true; } };
  app.shared.flow = flow;
  return { app, run, flow };
}

let nodes = 0;
for (const hero of Object.keys(HEROES)) {
  const { app, run, flow } = await setup(hero, 'm-' + hero);
  flow.route(); frames(app, 60);
  let guard = 0;
  while (guard++ < 60 && !(run.act === 3 && run.node && run.map.nodes[run.node].type === 'final')) {
    if (run.phase !== 'map') break;
    const before = run.node;
    frames(app, 200); // lets any banner expire
    key(app, 'ArrowRight'); key(app, 'Enter'); frames(app, 40);
    assert.notEqual(run.node, before, 'node entered via keyboard');
    nodes++;
    const t = run.map.nodes[run.node].type;
    if (run.phase === 'event') {
      frames(app, 30); assert.equal(app.current, 'event');
      const p = run.pending; p.result = 'Done.'; frames(app, 20); event.cont(app);
    } else if (run.phase !== 'map') {
      const r = RUN.advance(run); run.phase = 'map'; flow.route();
      if (r === 'act') { frames(app, 60); }
    }
    if (run.phase !== 'map') { run.phase = 'map'; run.pending = null; }
    flow.route(); frames(app, 5);
  }
  assert.ok(run.stats.floors > 20, hero + ' walked acts: ' + run.stats.floors);
  for (const act of [1, 2, 3]) { RUN.startAct(run, act); flow.route(); frames(app, 30); }
  // mouse + abandon confirm
  app.mouse.x = 640; app.mouse.y = 300; frames(app, 5); app.mouse.wheel = 300; frames(app, 2);
}

// every event, every choice
let played = 0;
for (const ev of Object.values(EVENTS)) {
  for (let ci = 0; ci < ev.choices.length; ci++) {
    const hero = Object.keys(HEROES)[ci % 3];
    const { app, run, flow } = await setup(hero, ev.id + ci);
    run.gold = 250; run.hp = 40;
    const gs = Object.keys(GRAFTS);
    run.deck.slice(0, 6).forEach((d, i) => { d.grafts = [gs[i], gs[i + 8]].filter((g) => g); });
    run.act = ev.act || 1;
    run.pending = { kind: 'event', id: ev.id, result: null }; run.phase = 'event';
    flow.route(); frames(app, 30); key(app, 'Enter'); frames(app, 5);
    const ch = RUN.eventChoices(run)[ci];
    if (ch.ok) {
      if (ch.pick === 'card') { event.pick(app, ch, run); frames(app, 5); assert.ok(event.picker, 'picker opens'); event.choose(app, ch.i, ch.cards[0]); }
      else key(app, String(ci + 1));
      frames(app, 20);
      assert.ok(run.pending.result !== null, ev.id + ' choice ' + ci + ' resolved');
      frames(app, 120); event.cont(app); frames(app, 5);
      played++;
    } else frames(app, 10);
  }
}
// reload with result already set
{
  const { app, run, flow } = await setup('marrow', 'r');
  run.pending = { kind: 'event', id: 'e_coin_flip', result: 'Already done.' }; run.phase = 'event'; flow.route(); frames(app, 30);
  event.cont(app); assert.equal(run.phase, 'map');
}
console.log(`graftwork_ui_map ok: ${nodes} nodes, ${played} event choices`);

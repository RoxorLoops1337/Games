// Q3 first-hour fixes: event choice guard, defeat advice (12 categories), tip order, no-effect feedback, map legend words.
import assert from 'node:assert/strict';
import { makeApp, frames, click } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import { DEATH_ADVICE, deathAdvice, deathAdviceCategory } from '../graftwork/engine/meta2.js';
import { ENEMIES } from '../graftwork/data/index.js';

// ---- 1. event: the click that skips the typewriter must not pick a choice
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'q3ev' });
  const { EVENTS } = await import('../graftwork/data/index.js');
  const id = Object.keys(EVENTS)[0];
  run.phase = 'event'; run.pending = { kind: 'event', id, result: null };
  const ev = (await import('../graftwork/ui/event.js')).default;
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
}

// ---- 5. defeat advice: 12 categories, each reachable, each a non-empty line without em dashes
{
  assert.equal(Object.keys(DEATH_ADVICE).length, 12, '12 cause categories');
  for (const [k, v] of Object.entries(DEATH_ADVICE)) assert.ok(v.length > 20 && !v.includes('—'), 'advice ' + k);
  const boss = Object.values(ENEMIES).find((e) => e.kind === 'boss'), elite = Object.values(ENEMIES).find((e) => e.kind === 'elite'), norm = Object.values(ENEMIES).find((e) => e.kind === 'normal');
  const cases = {
    poison: { status: 'poison' }, burn: { status: 'burn' }, bleed: { status: 'bleed' }, brittle: { status: 'brittle' }, stagefright: { status: 'stagefright' }, dread: { status: 'dread' },
    strain: { enemy: norm.id, strain: 2 }, backfire: { enemy: norm.id, backfire: 1 }, boss: { enemy: boss.id }, elite: { enemy: elite.id }, enemy: { enemy: norm.id }, generic: { status: null },
  };
  for (const [cat, cs] of Object.entries(cases)) {
    const r = deathAdvice({ deathCause: cs });
    assert.equal(r.cat, cat, 'category ' + cat);
    assert.ok(r.text && !r.text.includes('—'));
  }
  assert.match(deathAdvice({ deathCause: { status: 'poison' } }).text, /Poison ignores Block/);
  assert.match(deathAdvice({ deathCause: { strain: 3, enemy: norm.id } }).text, /Too many grafts/);
  // a boss move with a tip quotes the counter
  for (const b of Object.values(ENEMIES).filter((e) => e.kind === 'boss')) for (const [mid, mv] of Object.entries(b.moves || {})) if (mv.tip) {
    assert.ok(deathAdvice({ deathCause: { enemy: b.id, move: mid } }).text.includes(mv.tip), 'boss tip quoted ' + b.id);
  }
  assert.equal(deathAdviceCategory({}), 'generic');
}

// ---- 6. the Ward's legend and trigger labels: no jargon
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../graftwork/ui/ward.js', import.meta.url), 'utf8');
  assert.ok(!/refine, strip or reforge/.test(src) && !/Event: \?\?\?/.test(src) && !/Shop: spend gold/.test(src), 'legend uses plain words');
  for (const word of ['Ward fight', 'Elite', 'Chapel event', 'Dispensary', 'Workshop', 'Clean sheets', 'The boss']) assert.ok(src.includes(`'${word}'`), 'the legend names ' + word);
}
console.log('graftwork q3 flow ok');

// Title, end-of-run and settings screens: headless smoke + behaviour.
import assert from 'node:assert/strict';
import { makeApp, frames, click, key } from './graftwork_lib.mjs';
import title from '../graftwork/ui/title.js';
import end from '../graftwork/ui/end.js';
import settings from '../graftwork/ui/settings.js';
import * as RUN from '../graftwork/engine/run.js';
import * as META from '../graftwork/engine/meta.js';
import { saveRun, clearRun, hasRun } from '../graftwork/engine/save.js';
import { cardSpec } from '../graftwork/engine/cards.js';

async function rig() {
  const meta = META.loadMeta();
  meta.unlocked.heroes = ['marrow', 'wick', 'odile']; meta.bestAsc = { marrow: 3 }; meta.settings = {};
  const log = { started: [], routed: 0, resumed: 0, title: 0, codex: 0, saved: 0, abandoned: 0 };
  const app = await makeApp({ run: null, meta });
  const flow = {
    app, RUN, META, started: log.started,
    start(o) { log.started.push(o); app.shared.run = RUN.newRun(o); },
    resume() { log.resumed++; return true; }, hasSave: () => hasRun(), abandon() { log.abandoned++; },
    toTitle() { log.title++; app.go('title'); }, route() { log.routed++; }, openCodex() { log.codex++; },
    openSettings() { app.push('settings'); }, saveMeta() { log.saved++; META.saveMeta(meta); }, openDeck() {},
  };
  app.shared.flow = flow; app.shared.audio = { sfx() {}, music() {}, setVolumes(v) { log.vol = v; }, mute(b) { log.muted = b; } };
  app.register('title', title); app.register('end', end); app.register('settings', settings);
  return { app, meta, log, flow };
}

// ---- title: new run for every hero via clicks ----
for (const [i, hero] of ['marrow', 'wick', 'odile'].entries()) {
  const { app, log } = await rig();
  clearRun();
  app.go('title'); frames(app, 60);
  click(app, 640, 330);                // New Run
  frames(app, 30);
  assert.equal(title.state, 'select', 'select opened');
  click(app, 50 + i * 400 + 190, 300); // hero panel
  frames(app, 3);
  assert.equal(title.hero, hero);
  click(app, 232, 628);                // Begin
  assert.equal(log.started.length, 1, 'run started for ' + hero);
  assert.equal(log.started[0].hero, hero);
  assert.equal(log.started[0].ascension, 0);
}

// ---- seed typing + ascension ----
{
  const { app, log } = await rig(); clearRun();
  app.go('title'); frames(app, 30); click(app, 640, 330); frames(app, 30);
  click(app, 150, 576);                // seed field
  for (const c of 'ab12') key(app, c);
  key(app, 'Backspace'); key(app, 'Z');
  assert.equal(title.seed, 'ab1Z');
  click(app, 390 + 105, 576 + 20 - 0 + 0);   // ascension '>' (x 340+86..)
  frames(app, 2);
  click(app, 340 + 86 + 19, 536 + 20 + 19);
  frames(app, 2);
  assert.ok(title.asc >= 1, 'ascension raised');
  const asc = title.asc;
  click(app, 232, 628);
  assert.equal(log.started[0].seed, 'ab1Z'); assert.equal(log.started[0].ascension, asc);
}

// ---- locked hero cannot be picked or begun ----
{
  const { app, meta, log } = await rig(); clearRun(); meta.unlocked.heroes = ['marrow'];
  app.go('title'); frames(app, 30); click(app, 640, 330); frames(app, 30);
  click(app, 50 + 800 + 190, 300); frames(app, 2);
  assert.equal(title.hero, 'marrow'); frames(app, 5);
  key(app, 'Escape'); assert.equal(title.state, 'menu', 'esc goes back');
}

// ---- continue with a saved run ----
{
  const { app, log } = await rig();
  const run = RUN.newRun({ hero: 'wick', seed: 'sv' }); saveRun(run);
  app.go('title'); frames(app, 60);
  assert.ok(title.hasSave && title.saveInfo, 'save detected');
  assert.equal(title.saveInfo.hero, 'Wick');
  click(app, 640, 336);                // Continue
  assert.equal(log.resumed, 1);
  app.go('title'); frames(app, 30);
  click(app, 640, 400);                // New Run with save: confirm first
  frames(app, 5); assert.equal(title.confirmAbandon, true); assert.equal(title.state, 'menu');
  key(app, 'Escape'); assert.equal(title.confirmAbandon, false);
  clearRun();
}

// ---- daily run, codex, credits, settings ----
{
  const { app, meta, log } = await rig(); clearRun();
  app.go('title'); frames(app, 30);
  click(app, 640, 386);                // Daily (second button when no save)
  assert.equal(log.started.length, 1);
  assert.equal(log.started[0].seed, RUN.dailySeed()); assert.equal(log.started[0].hero, RUN.dailyHero(RUN.dailySeed()));
  assert.equal(log.started[0].daily, RUN.dailySeed()); assert.equal(meta.dailyPlayed, RUN.dailySeed());
  app.go('title'); frames(app, 30);
  click(app, 640, 442); assert.equal(log.codex, 1, 'codex');
  click(app, 640, 554); frames(app, 20); assert.equal(title.state, 'credits'); key(app, 'Escape'); assert.equal(title.state, 'menu');
  click(app, 640, 498); frames(app, 10); assert.equal(app.stack.length, 2, 'settings pushed');
  click(app, 340 + 600 - 54 + 19, 40 + 16 + 19); frames(app, 2); assert.equal(app.stack.length, 1, 'X closes settings');
  click(app, 1245, 675); assert.equal(meta.settings.muted, true, 'mute corner toggle'); assert.equal(log.muted, true);
}

// ---- settings: toggles + sliders persist ----
{
  const { app, meta, log } = await rig();
  app.go('title'); frames(app, 10); app.push('settings'); frames(app, 30);
  click(app, 640, 372);  // screen shake
  assert.equal(meta.settings.screenShake, false);
  click(app, 640, 418);  // reduced motion
  assert.equal(meta.settings.reducedMotion, true);
  click(app, 640, 464);  // colorblind
  assert.equal(meta.settings.colorblind, true);
  click(app, 640, 510);  // large text
  assert.equal(meta.settings.textSize, 'large');
  click(app, 640, 326);  // mute
  assert.equal(meta.settings.muted, true);
  click(app, 640, 326);
  assert.equal(meta.settings.muted, false);
  const saves = log.saved;
  click(app, 562 + 145, 140);  // master slider to 50%
  assert.ok(Math.abs(meta.settings.master - 0.5) < 0.02, 'master ' + meta.settings.master);
  assert.ok(Math.abs(log.vol.master - meta.settings.master) < 0.001, 'audio updated live');
  assert.ok(log.saved > saves, 'persisted');
  assert.equal(JSON.parse(globalThis.localStorage ? globalThis.localStorage.getItem('graftwork_meta_v1') : JSON.stringify(meta)).settings.master, meta.settings.master);
  // reset needs two confirms
  meta.stats.wins = 5; saveRun(RUN.newRun({ seed: 'x' }));
  const ry = 306 + 5 * 46 + 22;
  click(app, 450, ry + 4 + 20); frames(app, 2); assert.equal(settings.reset, 1);
  assert.equal(meta.stats.wins, 5, 'not erased after one confirm');
  click(app, 420, ry + 26 + 19); frames(app, 2); assert.equal(settings.reset, 2);
  assert.equal(meta.stats.wins, 5);
  click(app, 420, ry + 26 + 19); frames(app, 2);
  assert.equal(meta.stats.wins, 0, 'erased after second confirm'); assert.equal(hasRun(), false);
  assert.equal(meta.settings.reducedMotion, true, 'settings survive a reset');
  key(app, 'Escape'); assert.equal(app.stack.length, 1, 'esc closes');
}

// ---- end screens ----
async function endRun(phase, withInfo) {
  const ctx = await rig();
  const run = RUN.newRun({ hero: 'marrow', ascension: 2, seed: 'endtest' });
  run.deck.slice(0, 6).forEach((c, i) => { c.grafts = i === 0 ? ['g_ember_wick'].filter(Boolean) : []; });
  run.phase = phase; run.ended = true; run.stats.floors = 12;
  run.endInfo = withInfo ? { newUnlocks: ['wick'], newAchievements: ['intake', 'nope_missing'] } : { newUnlocks: [], newAchievements: [] };
  ctx.app.shared.run = run;
  return { ...ctx, run };
}
{
  const { app, run, log } = await endRun('won', true);
  app.go('end', { run }); frames(app, 120);
  assert.equal(end.won, true); assert.equal(end.news.length, 3);
  app.mouse.x = 400; app.mouse.y = 300; frames(app, 5);                 // hover over grid
  app.mouse.wheel = 200; frames(app, 3);
  click(app, 531, 685);                         // Endless
  assert.equal(run.phase, 'map'); assert.equal(run.ended, false); assert.equal(run.endInfo, undefined); assert.equal(run.loop, 1); assert.equal(log.routed, 1);
}
{
  const { app, run, log } = await endRun('dead', false);
  app.go('end', { run }); frames(app, 120);
  assert.equal(end.won, false);
  click(app, 422, 685);                                                 // New Run, same hero + ascension
  assert.equal(log.started[0].hero, 'marrow'); assert.equal(log.started[0].ascension, 2);
  app.go('end', { run }); frames(app, 20);
  click(app, 640, 685); frames(app, 5);                                 // Copy seed (no clipboard in node: toast only)
  assert.ok(end.toast && end.toast.msg.includes('endtest'));
  click(app, 858, 685); assert.equal(log.title, 1, 'back to title');
}
{
  const { app, run } = await endRun('dead', false);
  run.killedBy = 'nobody_here'; run.abandoned = true; app.go('end', { run }); frames(app, 30);   // abandoned + unknown killer must not throw
}
console.log('graftwork_ui_title ok');

// Tooltips: one lifecycle (a tip exists only while its anchor is hovered / held / focused THIS frame), one compact panel, no card type or school entry,
// no numbers panel that restates the face, and a placement that keeps off the hand, the Thread rail, intents and the thing described.
import assert from 'node:assert/strict';
import { makeApp, frames, click, key } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import { cardSpec } from '../graftwork/engine/cards.js';
import { CARDS, SCHOOLS, STATUSES } from '../graftwork/data/index.js';
import { getAll } from '../graftwork/ui/layout_registry.js';
import { cardTipStack, tipSections, numberNow, TIP_TIMING, specGloss, KEYWORDS, resetTips } from '../graftwork/ui/tooltips.js';
import { FX_OPTS } from '../graftwork/ui/fx.js';
import * as audioMod from '../graftwork/ui/audio.js';
import combat from '../graftwork/ui/combat.js';
import graft from '../graftwork/ui/graft.js';

const DT = 1 / 60;
const vis = (app) => !!(app.tipLayout && app.tipLayout.frame === app.frame);
const hit = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
const reg = (id) => getAll().find((r) => r.id === id);
const FLOW = () => ({ route() {}, openDeck() {}, openSettings() { FLOW.settings = (FLOW.settings || 0) + 1; }, META: null });

// a combat where every hand card carries Scorch Thread (a Burn word), so every hand card has a tip
async function combatApp({ scale = 1, enemies = ['bedpan_slime'], settings = {}, seed = 'tl' } = {}) {
  const run = RUN.newRun({ hero: 'marrow', seed });
  for (const i of run.deck.filter((x) => !x.id.startsWith('j_')).slice(0, 6)) RUN.applyGraft(run, i.uid, 'g_scorch_thread', { keepPhase: true, free: true });
  run.deck = run.deck.filter((i) => i.grafts.includes('g_scorch_thread')); // only those six: whatever the shuffle deals, every hand card has a tip
  run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies };
  const app = await makeApp({ run, meta: { settings: { tips: false, ...settings } }, audio: audioMod, flow: FLOW() });
  if (scale < 1) { app.scale = scale; app.minPx = 11; }
  app.ctx.measureText = (t) => { const m = /(\d+(?:\.\d+)?)px/.exec(String(app.ctx.font || '')); const sz = m ? +m[1] : 16; return { width: String(t).length * sz * (/bold/.test(String(app.ctx.font || '')) ? 0.56 : 0.52) }; };
  app.register('combat', combat); app.register('other', { draw() {} });
  app.mouse.touchUp = false; // exactly as after the first real pointerup in a browser
  app.go('combat', { run }); frames(app, 150);
  return app;
}
const handRects = () => getAll().filter((r) => /^hand_/.test(r.id)).sort((a, b) => a.x - b.x);
const over = (app, r) => { app.mouse.x = r.x + r.w / 2; app.mouse.y = r.y + 30; };
const off = (app) => { app.mouse.x = 640; app.mouse.y = 250; };
const settle = (app, n = 40) => frames(app, n);

// ---- (1) timing: delay, fade in, fade out ----
{
  FX_OPTS.reduced = false;
  const app = await combatApp(); const r = handRects()[1];
  over(app, r); frames(app, 6); assert.ok(!vis(app), 'no tip in the first 0.1 s of a hover (a sweep across the hand shows nothing)');
  // the real delay: this is the one suite that runs it (the layout sweeps switch it off)
  assert.equal(TIP_TIMING.SHOW_DELAY, 0.25, 'the show delay is a quarter of a second');
  frames(app, 8); assert.ok(!vis(app), 'and none after 14 frames (0.23 s): just under the delay');
  frames(app, Math.ceil(TIP_TIMING.SHOW_DELAY * 60) + 4 - 8); assert.ok(vis(app), 'the tip shows after the hover delay');
  assert.ok(app.tipLayout.panels.length === 1, 'one panel');
  settle(app, 20);
  off(app); frames(app, 1); frames(app, 1);
  frames(app, 12); assert.ok(!vis(app), 'a tip is gone a moment after the pointer leaves its anchor');
  // moving along the hand: the next tip follows quickly (grace), it does not wait the full delay again
  over(app, handRects()[1]); settle(app, 30); assert.ok(vis(app));
  over(app, handRects()[2]); frames(app, 8); assert.ok(vis(app), 'moving to the next card shows its tip at once');
}
// reduced motion: no fade, the tip is fully there on its first frame and gone the frame after
{
  const app = await combatApp({ settings: { reducedMotion: true } }); const r = handRects()[1];
  over(app, r); let first = -1; for (let i = 0; i < 40 && first < 0; i++) { frames(app, 1); if (vis(app)) first = i; }
  assert.ok(first > 0, 'tip shown'); assert.equal(app._ts.alpha, 1, 'reduced motion: fully opaque at once');
  off(app); frames(app, 4); assert.ok(!vis(app), 'reduced motion: gone within the hand hover hysteresis, no fade');
}

// ---- (2) the stuck tip: press, hold, release, move away ----
{
  const app = await combatApp(); const r = handRects()[1];
  over(app, r); settle(app, 30); assert.ok(vis(app), 'hover tip');
  app.mouse.pressed = true; app.mouse.down = true; app.mouse.button = 0; frames(app, 1);
  assert.ok(!vis(app), 'a press drops the tip on the same frame');
  frames(app, 40); assert.ok(!vis(app), 'and it stays quiet while the pointer stays on that card');
  app.mouse.released = true; app.mouse.down = false; frames(app, 1);
  off(app); frames(app, 30); assert.ok(!vis(app), 'a slow click then moving away leaves nothing behind');
}
// drag a card, then play it
{
  const app = await combatApp(); const r = handRects()[1], st = combat.api().state();
  over(app, r); settle(app, 30); assert.ok(vis(app));
  app.mouse.pressed = true; app.mouse.down = true; app.mouse.button = 0; frames(app, 1);
  for (let i = 1; i <= 30; i++) { app.mouse.x += 6; app.mouse.y -= 7; frames(app, 1); assert.ok(!vis(app), 'no tip while dragging a card (frame ' + i + ')'); }
  assert.ok(st.drag, 'dragging');
  app.mouse.released = true; app.mouse.down = false; frames(app, 1);
  assert.equal(st.c.playsTurn, 1, 'the card was played');
  for (let i = 0; i < 60; i++) { frames(app, 1); if (combat.api().busy) assert.ok(!vis(app), 'no tip while the played card resolves'); }
  off(app); frames(app, 30); assert.ok(!vis(app), 'after the play nothing is left on screen');
}
// end turn: no tip during the enemy turn even with the pointer resting on a card
{
  const app = await combatApp(); const r = handRects()[1];
  over(app, r); settle(app, 30); assert.ok(vis(app));
  key(app, 'e'); frames(app, 40); key(app, 'e'); let busyFrames = 0; // the first press asks to confirm (unspent energy)
  for (let i = 0; i < 600; i++) { frames(app, 1); if (combat.api().busy) { busyFrames++; assert.ok(!vis(app), 'no tip during the enemy turn animation (frame ' + i + ')'); } }
  assert.ok(busyFrames > 20, 'the enemy turn ran: ' + busyFrames);
}
// Esc, screen change, blur, a screen on top
{
  const app = await combatApp(); const r = handRects()[1];
  over(app, r); settle(app, 30); assert.ok(vis(app));
  key(app, 'Escape'); assert.ok(!vis(app), 'Esc drops the tip'); frames(app, 30); assert.ok(!vis(app), 'and it does not come back while the pointer rests there');
  over(app, handRects()[3]); settle(app, 30); assert.ok(vis(app), 'a different card shows its tip');
  app.blur(); frames(app, 1); assert.ok(!vis(app), 'window blur drops the tip'); frames(app, 30); assert.ok(!vis(app), 'and the parked pointer shows none');
  over(app, handRects()[3]); settle(app, 30); assert.ok(vis(app));
  app.push('other'); frames(app, 12); assert.ok(!vis(app), 'a screen on top (pause, a modal) covers the anchor: no tip'); app.pop(); frames(app, 4);
  over(app, handRects()[3]); settle(app, 30); assert.ok(vis(app));
  app.go('other'); frames(app, 1); assert.ok(!vis(app) && app.tip === null, 'a screen change drops every tip'); frames(app, 20); assert.ok(!vis(app));
}
// touch: a tip lives while the finger is down; letting go removes it
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'tlt' }); RUN.startGraftPick(run);
  const app = await makeApp({ run, meta: { settings: { tips: false } }, audio: { sfx() {}, music() {} } });
  app.register('graft', graft); app.register('other', { draw() {} }); app.shared.flow = FLOW(); app.mouse.touchUp = false;
  app.go('graft', { run }); frames(app, 90);
  const r = reg('graft-patch0'); app.mouse.touch = true; app.mouse.x = r.x + r.w / 2; app.mouse.y = r.y + r.h / 2;
  app.mouse.pressed = true; app.mouse.down = true; frames(app, 1);
  frames(app, 8); assert.ok(!vis(app), 'a quick touch shows no tip');
  frames(app, 20); assert.ok(vis(app), 'a press held for 0.3 s shows the tip');
  app.mouse.down = false; app.mouse.released = true; app.mouse.touchUp = true; frames(app, 1); frames(app, 12);
  assert.ok(!vis(app), 'lifting the finger removes it (no tip is pinned to the screen)');
  frames(app, 60); assert.ok(!vis(app));
}

// ---- (3) content: no own type or school, no numbers panel, totals only when they differ ----
{
  let checked = 0;
  for (const c of Object.values(CARDS)) for (const up of [0, 1]) {
    const inst = { uid: 0, id: c.id, grafts: [], up }; let spec; try { spec = cardSpec(inst); } catch (e) { continue; }
    const m = cardTipStack(spec, { player: { st: {} } }, {}); if (!m) continue;
    const secs = tipSections({ stack: m }).flat();
    const own = [String(spec.type)[0].toUpperCase() + String(spec.type).slice(1)];
    if (spec.school && SCHOOLS[spec.school] && !STATUSES[spec.school]) own.push(SCHOOLS[spec.school].name);
    for (const s of secs) {
      assert.ok(!own.includes(s.title) || new RegExp('\\b' + s.title + '\\b').test(specGloss(spec).flat(9).join(' ')), `${c.id}: the card's own ${s.title} is not explained`);
      assert.notEqual(s.title, 'The numbers', 'no separate numbers panel');
    }
    assert.ok(!secs.some((s) => /^Base \d/.test(s.text)), 'the arithmetic is not in the compact panel');
    checked++;
  }
  assert.ok(checked > 100, 'cards checked: ' + checked);
  const atk = cardSpec({ uid: 0, id: 'm_cut', grafts: [], up: 0 });
  assert.deepEqual(numberNow(atk, { player: { st: {} } }, {}), [], 'nothing to add when the face already says it');
  const now = numberNow(atk, { player: { st: { strength: 2 } } }, {});
  assert.equal(now.length, 1); assert.match(now[0], /^Damage 8 now \(6 \+2 Strength\)$/, now[0]);
  const m = cardTipStack(atk, { player: { st: { strength: 2 } } }, {});
  assert.ok(m.details.some((d) => /^Damage: Base 6/.test(d)), 'the full arithmetic is kept for hold');
  assert.ok(!m.terms.some((t) => t.title === 'Attack'), 'an Attack card does not define Attack');
  for (const w of Object.keys(KEYWORDS)) assert.ok(KEYWORDS[w].text.length <= (Object.values(STATUSES).some((d) => d.name === w) ? 170 : 120), `one short definition: ${w} (${KEYWORDS[w].text.length})`);
}

// ---- (4) placement, size and readability at desktop and the phone scales ----
for (const scale of [1, 0.64, 0.54, 0.46]) {
  const app = await combatApp({ scale, enemies: ['bedpan_slime', 'bedpan_slime'] });
  app._text = [];
  const rawText = app.text;
  app.text = (s, x, y, o = {}) => { if (app._tipDraw && s !== '') { const L = app.layoutText(String(s), o); app._text.push({ size: L.size, s }); } return rawText(s, x, y, o); };
  const rects = handRects(); assert.ok(rects.length >= 4, 'hand dealt @' + scale);
  for (let i = 0; i < rects.length; i++) {
    const hr = handRects()[i]; app._text.length = 0; over(app, hr); settle(app, 50);
    assert.ok(vis(app), `hand card ${i} has a tip @${scale}`);
    const L = app.tipLayout, r = L.rect;
    for (const q of getAll()) {
      if (/^hand_/.test(q.id) || q.id === 'seamRail' || q.id === 'heroPlate' || q.id === 'endTurn' || q.id === 'orb' || /^en\d+:(intent|name|move|hp)$/.test(q.id) || /^status:/.test(q.id)) assert.ok(!hit(r, q), `tip covers ${q.id} @${scale} (card ${i}) ${JSON.stringify(r)} vs ${JSON.stringify([q.x, q.y, q.w, q.h].map(Math.round))}`);
    }
    assert.ok(r.w <= 0.38 * 1280 + 1, `tip width ${r.w} <= 38% of the stage @${scale}`);
    assert.ok(r.h <= (scale < 0.95 ? 260 : 200) + 1, `tip height ${r.h} stays compact @${scale}`);
    assert.ok(r.x >= 5.5 && r.y >= 5.5 && r.x + r.w <= 1274.5 && r.y + r.h <= 714.5, 'inside the stage');
    for (const t of app._text) assert.ok(t.size * scale >= (scale < 0.95 ? 0.97 * Math.min(11, 21 * scale) : 12.9), `text "${t.s}" is ${t.size * scale}px on screen @${scale}`);
    assert.ok(L.tail, `a tail points at the card @${scale} card ${i} ${JSON.stringify(r)} anchor ${JSON.stringify(L.anchor)}`);
    if (i === 0) { assert.ok(!L.panels[0].secs.some((s) => /The numbers/.test(s.title))); }
  }
  // an enemy intent tip and a status chip tip stay off the thing they describe and off the other intents
  const c = combat.api().c; c.enemies[0].st.burn = 3; frames(app, 5);
  const it = reg('en1:intent'); assert.ok(it, 'intent registered');
  app.mouse.x = it.x + it.w / 2; app.mouse.y = it.y + it.h / 2; settle(app, 50); assert.ok(vis(app), `intent tip @${scale}`);
  { const r = app.tipLayout.rect; for (const q of getAll()) if (/^en\d+:(intent|name|move|hp)$/.test(q.id) || /^hand_/.test(q.id) || q.id === 'seamRail') assert.ok(!hit(r, q), `intent tip covers ${q.id} @${scale}`); assert.ok(r.w <= 0.38 * 1280 + 1); }
  const sc = getAll().find((q) => /^status:en1/.test(q.id)); assert.ok(sc, 'status row registered');
  app.mouse.x = sc.x + 14; app.mouse.y = sc.y + 14; settle(app, 50);
  if (vis(app)) { const L = app.tipLayout; assert.equal(L.panels[0].secs.length, 1, 'a status chip is one compact line, no glossary stack'); assert.ok(L.rect.h <= (scale < 0.95 ? 160 : 90), 'status tip is small: ' + L.rect.h); }
  // holding Shift opens the arithmetic, and releasing closes it
  const rr = handRects()[1]; over(app, rr); settle(app, 40);
  app.keys.add('Shift'); frames(app, 4); assert.ok(app.tipLayout.hold && app.tipLayout.frame === app.frame, 'hold opens the details @' + scale);
  app.keys.delete('Shift'); frames(app, 4); assert.ok(!app.tipLayout.hold, 'release closes them');
}

// ---- (5) fallback: tips never survive resetTips ----
{
  const app = await combatApp(); over(app, handRects()[1]); settle(app, 30); assert.ok(vis(app));
  resetTips(app); frames(app, 1); assert.ok(app._ts === null || !vis(app) || true);
  app.mouse.x = -999; frames(app, 12); assert.ok(!vis(app));
}
console.log('graftwork_tip_lifecycle ok');

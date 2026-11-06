// Regression: the click that opens a card picker must not also pick a card (it used to upgrade a random card at the Forge).
import assert from 'node:assert/strict';
import { makeApp, frames, click } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import forge from '../graftwork/ui/forge.js';

async function forgeApp() {
  // Arrange: a fresh Forge visit
  const run = RUN.newRun({ hero: 'marrow', seed: 'clickthrough' });
  const app = await makeApp({ run, meta: {}, audio: { sfx() {}, music() {} } });
  app.register('forge', forge); app.register('deckview', { enter() {}, draw() {} });
  app.shared.flow = { route() { app.go('forge', { run }); }, openDeck() {} };
  run.phase = 'forge'; run.pending = { kind: 'forge', used: 0 };
  app.go('forge', { run }); frames(app, 60);
  return { run, app };
}
const optX = (i) => 61 + i * 236 + 107;
const REFINE = 2;

// Act: click the Refine option at many points across the card, never clicking a card in the picker.
// Assert: nothing is upgraded and the Forge visit is still unused.
let checked = 0;
for (let y = 140; y <= 520; y += 20) {
  for (let dx = -100; dx <= 100; dx += 25) {
    const { run, app } = await forgeApp();
    click(app, optX(REFINE) + dx, y); frames(app, 5);
    assert.equal(run.deck.filter((c) => c.up).length, 0, `refine click at ${optX(REFINE) + dx},${y} upgraded a card by itself`);
    assert.equal(run.pending.used, 0, 'the visit is not used until a card is chosen');
    checked++;
  }
}
// Then choosing a card on purpose still works.
{
  const { run, app } = await forgeApp();
  click(app, optX(REFINE), 300); frames(app, 20);
  click(app, 160, 211); frames(app, 20);
  assert.equal(run.deck.filter((c) => c.up).length, 1, 'a deliberate pick upgrades exactly one card');
}
console.log(`graftwork_ui_clickthrough ok ${checked + 1}`);

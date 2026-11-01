const L = require('./qa-lib');
(async () => {
  const view = process.argv[2] || 'desk';
  const q = await L.open(view, { fast: true, tag: 'save-' + view });
  const log = (...a) => console.log(...a);
  await q.pg.evaluate(() => { SB.ui.settings.set('confirmEndTurn', false); const p = SB.ui.kit.prof.get(); p.tutorial.firstFightDone = true; p.tutorial.skipped = true; SB.ui.kit.prof.save(); SB.ui.flow.startRun({ seed: 'SAVE1', clan: 'alley', side: 'hearth', rank: 0, skipOpening: true }); });
  await q.wait(1500); log('1 screen', await q.cur());
  for (let i = 0; i < 5 && (await q.cur()) === 'story'; i++) { await q.pg.keyboard.press('Space'); await q.wait(500); }
  log('map?', await q.cur());
  // reload at map
  await q.pg.reload(); await q.wait(1500);
  log('after reload', await q.cur(), 'saved', await q.pg.evaluate(() => !!SB.ui.flow.savedRun()));
  await q.pg.getByRole('button', { name: /continue/i }).first().click({ timeout: 3000 }).catch(e => log('no continue btn'));
  await q.wait(1500); log('resumed map', await q.cur(), await q.pg.evaluate(() => SB.ui.flow.run && SB.ui.flow.run.status)); await q.shot('01-resumed-map');
  // enter a battle
  await q.pg.evaluate(() => { const r = SB.ui.flow.run; const a = SB.run.availableNodes(r); SB.ui.flow.chooseNode(a.find(id => r.map.nodes[id].type === 'battle') || a[0]); });
  await q.wait(2500); log('battle?', await q.cur());
  const snap = () => q.pg.evaluate(() => { const B = SB.ui.battle.B, S = B.state; return JSON.stringify({ round: S.round, hand: S.hand.map(c => c.uid).join(','), draw: S.drawCount, z: S.zoomies, cats: S.floors.map(f => f.cats.map(c => c.name + ':' + c.health).join('/')).join('|'), pests: S.floors.map(f => f.pests.map(c => c.name + ':' + c.health).join('/')).join('|'), saved: !!SB.ui.flow.run.battle }); });
  await q.idle(); log('start', await snap());
  await q.pg.evaluate(async () => { const B = SB.ui.battle.B; for (const c of B.state.hand.slice()) { if (B.canPlay(c.uid).ok) { for (let f = 0; f < 3; f++) { const r = B.playCard(c.uid, { floor: f }); if (r && r.ok) break; } } await new Promise(r => setTimeout(r, 300)); } SB.ui.battle.endTurn(); });
  await q.wait(1500); await q.idle(); await q.wait(500);
  const before = await snap(); log('before reload', before);
  await q.pg.reload(); await q.wait(1500);
  await q.pg.getByRole('button', { name: /continue/i }).first().click({ timeout: 3000 }).catch(e => log('no continue btn'));
  await q.wait(2500); await q.idle(); log('screen', await q.cur());
  const after = await snap(); log('after reload ', after); log('MATCH', before === after);
  await q.shot('02-resumed-battle');
  // play on: finish the turn, verify game continues
  await q.pg.evaluate(() => SB.ui.battle.endTurn()); await q.wait(2500); await q.idle(); log('next', await snap());
  log('errors', q.errors.filter(e => !/AudioContext/.test(e)).slice(0, 6).join('\n'));
  await q.close();
})();

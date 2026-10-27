const L = require('./qa-lib');
(async () => {
  const view = process.argv[2] || 'desk';
  const q = await L.open(view, { fast: true, tag: 'win-' + view });
  const log = (...a) => console.log(...a);
  await q.pg.evaluate(() => {
    const F = SB.ui.flow;
    const run = SB.run.newRun({ seed: 'WIN1', clan: 'alley', side: 'hearth', rank: 0 });
    F.run = run; SB.run.startAct(run, 3);
    run.act = 3;
    const nodes = run.map.nodes; const boss = Object.keys(nodes).find(k => nodes[k].type === 'boss');
    nodes[boss].nightNo = 9;
    const av = SB.run.availableNodes; SB.run.availableNodes = () => [boss];
    const cr = SB.battle.create; SB.battle.create = function () { const B = cr.apply(this, arguments); B.state.floors.forEach(f => { f.pests.length = 0; }); window.__B = B; return B; };
    SB.ui.topbar.show(true); F.toMap();
    window.__boss = boss;
  });
  await q.wait(800); await q.shot('01-map');
  await q.pg.evaluate(() => SB.ui.flow.chooseNode(window.__boss)); await q.wait(2500); await q.shot('02-battle');
  log('screen', await q.cur());
  await q.pg.evaluate(() => { const B = SB.ui.battle.B; B.state.waveIdx = 99; });
  await q.pg.evaluate(() => SB.ui.settings.set('confirmEndTurn', false));
  for (let i = 0; i < 6 && (await q.cur()) === 'battle'; i++) {
    log('battle state', JSON.stringify(await q.pg.evaluate(() => ({ r: SB.ui.battle.B.state.round, o: SB.ui.battle.B.state.outcome, over: SB.ui.battle.B.state.over, pests: SB.ui.battle.B.state.floors.map(f => f.pests.length) }))));
    await q.pg.evaluate(() => SB.ui.battle.endTurn()); await q.wait(3000); await q.shot('03-after-end-' + i);
    // growth report / continue buttons
    for (const t of ['Continue', 'Collect']) { const b = q.pg.locator('button:has-text("' + t + '")').first(); if (await b.count()) { try { await b.click({ timeout: 1500 }); } catch (e) {} } }
    await q.wait(1500);
  }
  log('screen after battle', await q.cur()); await q.shot('04-reward');
  for (let i = 0; i < 40; i++) {
    const c = await q.cur();
    if (c === 'summary') break;
    if (c === 'reward') {
      const cd = q.pg.locator('.rw-cards .card').first(); if (await cd.count()) { await cd.click({ timeout: 1500 }).catch(() => {}); await q.wait(300); }
      const tk = q.pg.locator('button:has-text("Take "):not([disabled])').first(); if (await tk.count()) { try { await tk.click({ timeout: 1500 }); } catch (e) {} }
      await q.wait(500);
      const skip = q.pg.locator('button:has-text("Skip")').first();
      const go = q.pg.locator('button:has-text("Back to the map"), button:has-text("Face the dawn"), button:has-text("Continue"), button:has-text("Dawn"), button:has-text("Finish")').first();
      if (await go.count()) { try { await go.click({ timeout: 1500 }); } catch (e) {} }
      await q.wait(400); const lv = q.pg.getByRole('button', { name: 'Leave', exact: true }); if (await lv.count()) { await lv.first().click({ timeout: 1500 }).catch(() => {}); }
    } else if (c === 'story') { await q.shot('story-' + i); await q.pg.keyboard.press('Space'); }
    else if (c === 'gameover') break;
    await q.wait(900);
  }
  log('END at', await q.cur()); await q.shot('05-end');
  log('run', JSON.stringify(await q.pg.evaluate(() => ({ st: SB.ui.flow.run && SB.ui.flow.run.status, out: SB.ui.flow.run && SB.ui.flow.run.outcome }))));
  log('errors', q.errors.slice(0, 8).join('\n'));
  await q.close();
})();

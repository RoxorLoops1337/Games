const L = require('./qa-lib');
(async () => {
  const q = await L.open('desk', { fast: true, tag: 'probe' });
  await q.pg.evaluate(() => {
    const F = SB.ui.flow;
    const run = SB.run.newRun({ seed: 'WIN1', clan: 'alley', side: 'hearth', rank: 0 });
    F.run = run; SB.run.startAct(run, 3); run.act = 3;
    const nodes = run.map.nodes; const boss = Object.keys(nodes).find(k => nodes[k].type === 'boss'); nodes[boss].nightNo = 9;
    SB.run.availableNodes = () => [boss];
    const cr = SB.battle.create; SB.battle.create = function () { const B = cr.apply(this, arguments); B.state.floors.forEach(f => { f.pests.length = 0; }); return B; };
    SB.ui.topbar.show(true); F.toMap(); window.__boss = boss;
  });
  await q.wait(500);
  await q.pg.evaluate(() => SB.ui.flow.chooseNode(window.__boss)); await q.wait(2000);
  await q.pg.evaluate(() => { SB.ui.settings.set('confirmEndTurn', false); SB.ui.battle.endTurn(); }); await q.wait(3000);
  for (const t of ['Continue']) { const b = q.pg.locator('button:has-text("' + t + '")').first(); if (await b.count()) await b.click({ timeout: 1500 }).catch(() => {}); }
  await q.wait(1500); console.log(await q.cur());
  await q.pg.locator('.rw-cards .card').first().click({ timeout: 2000 }).catch(e => console.log('card fail', e.message.slice(0, 200)));
  await q.wait(500); await q.shot('r1');
  await q.pg.locator('button:has-text("Take "):not([disabled])').first().click({ timeout: 2000 }).catch(e => console.log('take fail', e.message.slice(0, 80)));
  await q.wait(600); await q.shot('r2');
  console.log(await q.pg.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim() + (b.disabled ? '[dis]' : '')).map(s=>s.slice(0,40)).join(' | ')));
  await q.pg.locator('button:has-text("Face the dawn")').first().click({ timeout: 2000 }).catch(e => console.log('dawn fail', e.message.slice(0, 80)));
  await q.wait(1500); console.log(await q.cur()); await q.shot('r3');
  await q.close();
})();

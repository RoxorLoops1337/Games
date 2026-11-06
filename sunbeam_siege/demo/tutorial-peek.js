const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('http://localhost:8123/index.html'); await pg.waitForTimeout(1500);
  await pg.evaluate(() => { localStorage.clear(); }); await pg.reload(); await pg.waitForTimeout(1500);
  await pg.click('text=New run'); await pg.waitForTimeout(400); await pg.click('text=Show me'); await pg.waitForTimeout(2500);
  console.log('screen', await pg.evaluate(() => SB.ui.current.name));
  console.log(JSON.stringify(await pg.evaluate(() => { const B = SB.ui.battle && SB.ui.battle.B; return B ? B.state.floors.map(f => f.cats.map(c => c.name + ' L' + c.lives)) : null; })));
  await pg.screenshot({ path: '/home/claude/nine-lives/demo/shots/tutorial-01.png' });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();

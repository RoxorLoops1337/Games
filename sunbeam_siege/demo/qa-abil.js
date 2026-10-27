const L = require('./qa-lib');
(async () => {
  for (const view of (process.argv[2] ? [process.argv[2]] : ['desk', 'phone'])) {
    const q = await L.open(view, { fast: true, tag: 'abil-' + view });
    await L.startBattle(q, { clan: 'moon', side: 'alley', champion: 'moon_oswin_ledgerpaw', relics: ['relic_kept_receipt'], setup: "B.drawCards(2);" });
    await q.idle(); await q.wait(600);
    console.log(view, await q.pg.evaluate(() => JSON.stringify({ hand: SB.ui.battle.B.state.hand.length, tray: document.querySelector('.b-tray') && document.querySelector('.b-tray').className, btns: [...document.querySelectorAll('.b-tray .btn')].map(b => b.textContent) })));
    await q.shot('0-start');
    // deploy champion if in hand
    const info = await q.pg.evaluate(() => { const B = SB.ui.battle.B, s = B.state; const i = s.hand.findIndex(e => /champion/.test((B.cardView(e.uid) || {}).type || '')); return { i, names: s.hand.map(e => (B.cardView(e.uid) || {}).name) }; });
    console.log(JSON.stringify(info));
    if (info.i >= 0) {
      const cards = await q.pg.$$('.b-hand > *'); await cards[info.i].click({ force: true }); await q.wait(200);
      await q.pg.click('.b-floor[data-floor="0"]', { force: true }); await q.wait(300); await q.idle();
    }
    // play a second cat to have a target
    const i2 = await q.pg.evaluate(() => { const B = SB.ui.battle.B, s = B.state; return s.hand.findIndex(e => { const v = B.cardView(e.uid) || {}; return v.type === 'unit' && B.canPlay(e.uid).ok; }); });
    if (i2 >= 0) { const cards = await q.pg.$$('.b-hand > *'); await cards[i2].click({ force: true }); await q.wait(200); await q.pg.click('.b-floor[data-floor="1"]', { force: true }); await q.wait(300); await q.idle(); }
    await q.shot('1-deployed');
    console.log('tray', await q.pg.evaluate(() => [...document.querySelectorAll('.b-tray .btn')].map(b => b.textContent + (b.className.includes('dim') ? ' (dim)' : ''))));
    const ab = await q.pg.$('.b-ab');
    if (ab) { await ab.click({ force: true }); await q.wait(300); await q.shot('2-ability-targeting'); console.log('prompt', await q.pg.evaluate(() => document.querySelector('.b-prompt').textContent));
      const tgt = await q.pg.$('.u-hit.tgt'); if (tgt) { await tgt.click({ force: true }); await q.wait(300); await q.idle(); await q.shot('3-ability-used'); }
      console.log('lives', await q.pg.evaluate(() => JSON.stringify(SB.ui.battle.B.state.floors.map(f => f.cats.map(c => c.name + ':' + c.lives + ':fl' + (c.statuses && c.statuses.fluff || 0))))), 'zoom', await q.pg.evaluate(() => SB.ui.battle.B.state.zoomies));
    }
    // keep mode
    const kb = await q.pg.$('.b-keep'); console.log('keep btn', !!kb);
    if (kb) { await kb.click({ force: true }); await q.wait(200); const cards = await q.pg.$$('.b-hand > *'); if (cards[0]) { await cards[0].click({ force: true }); await q.wait(300); } await q.shot('4-keep'); console.log('retainPick', await q.pg.evaluate(() => JSON.stringify(SB.ui.battle.B.state.retainPick)));
      await q.pg.keyboard.press('e'); await q.wait(300); const cf = await q.pg.$('.modal button:has-text("End turn")'); if (cf) await cf.click(); await q.idle(); await q.wait(500);
      console.log('hand after end', await q.pg.evaluate(() => JSON.stringify(SB.ui.battle.B.state.hand.map(h => h.uid)))); await q.shot('5-next-turn'); }
    console.log('errors', q.errors.filter(e => !/AudioContext/.test(e)).join('\n') || 'none');
    await q.close();
  }
})();

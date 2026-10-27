const L = require('./qa-lib');
(async () => {
  for (const view of (process.argv[2] ? [process.argv[2]] : ['desk', 'deskS', 'laptop', 'deskL', 'phone', 'phoneS'])) {
    const q = await L.open(view, { fast: true, tag: 'hand-' + view });
    await L.startBattle(q, { setup: "B.drawCards(5); B.createCard('neutral_swat', 3, 'hand'); B.createCard('neutral_swat', 3, 'hand');" });
    await q.idle(); await q.wait(800);
    const n = await q.pg.evaluate(() => SB.ui.battle.B.state.hand.length);
    console.log(view, 'hand', n);
    await q.shot('a');
    // hover the last card
    const cards = await q.pg.$$('.b-hand > *');
    if (cards.length) { await cards[cards.length - 1].hover({ force: true }).catch(() => {}); await q.wait(300); await q.shot('hover-last'); }
    const r = await q.pg.evaluate(() => { const e = document.querySelector('.b-end').getBoundingClientRect(); return [...document.querySelectorAll('.b-hand > *')].map(c => { const r = c.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.top), Math.round(r.bottom)]; }).concat([[Math.round(e.left), Math.round(e.right), Math.round(e.top), Math.round(e.bottom)]]); });
    console.log(JSON.stringify(r.slice(-3)));
    console.log('errors', q.errors.join('\n') || 'none');
    await q.close();
  }
})();

const L = require('./qa-lib');
(async () => {
  for (const view of (process.argv[2] ? [process.argv[2]] : ['phone', 'phoneS', 'desk', 'deskS'])) {
    const q = await L.open(view, { fast: true, tag: 'reward-' + view });
    await q.pg.evaluate(() => {
      const K = SB.ui.flow; const run = SB.run.newRun({ seed: 'RW1', clan: 'alley', side: 'hearth', rank: 0 }); K.run = run;
      const av = SB.run.availableNodes(run); K.chooseNode(av[0]);
    });
    await q.wait(1500);
    const info = await q.pg.evaluate(() => { const K = SB.ui.flow, run = K.run; const B = SB.ui.battle && SB.ui.battle.B; const r = SB.run.finishBattle(run, { outcome: 'win', growth: [], stats: {}, loot: {} }); K.run.__fb = 1; SB.ui.go('reward', { run, payload: r }); return Object.keys(r || {}); });
    await q.wait(1500);
    console.log(view, 'screen', await q.cur(), info.join(','));
    await q.shot('1');
    const m = await q.pg.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; }; return { rwCards: r('.rw-cards'), card2: r('.rw-card:nth-child(2)'), proceed: r('.rw-proceed'), take: r('.rw-take'), vh: innerHeight, vw: innerWidth }; });
    console.log(JSON.stringify(m));
    // scroll the screen to bottom
    await q.pg.evaluate(() => { const s = document.querySelector('.screen .scroll, .screen .narrow, .screen'); const sc = [...document.querySelectorAll('.screen *')].filter(e => e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY)); sc.forEach(e => e.scrollTop = e.scrollHeight); });
    await q.wait(300); await q.shot('2-bottom');
    console.log('errors', q.errors.filter(e => !/AudioContext/.test(e)).join('\n') || 'none');
    await q.close();
  }
})();

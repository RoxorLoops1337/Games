const L = require('./qa-lib');
(async () => {
  const q = await L.open('desk', { fast: true, tag: 'wd' });
  let timed = 0, errs = 0;
  q.pg.on('console', m => { const t = m.text(); if (/timed out/.test(t)) { timed++; q.pg.evaluate(() => JSON.stringify(window.__g) + ' since ' + Math.round(performance.now() - window.__g.last)).then(g => console.log('WD', t.slice(0, 90), g)); } });
  q.pg.on('pageerror', e => { errs++; console.log('ERR', String(e).slice(0, 160)); });
  await q.pg.evaluate(() => SB.ui.settings.set('confirmEndTurn', false));
  await q.pg.evaluate(() => { window.__g = { last: performance.now(), max: 0, n: 0 }; (function f(t) { const g = window.__g; g.max = Math.max(g.max, t - g.last); g.last = t; g.n++; requestAnimationFrame(f); })(performance.now()); });
  const seeds = +process.argv[2] || 6;
  for (let s = 0; s < seeds; s++) {
    await L.startBattle(q, { boss: 'pest_boss_vacuum_mk9', act: 2, bseed: 'wd' + s, seed: 'W' + s });
    let res = null;
    for (let r = 0; r < 25 && !res; r++) {
      res = await q.pg.evaluate(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const U = SB.ui.battle; if (!U) return 'gone';
        const B = U.B; if (B.state.over || B.state.outcome) return B.state.outcome || 'over';
        for (let k = 0; k < 20; k++) {
          const h = B.state.hand.filter(c => B.canPlay(c.uid)); if (!h.length) break;
          const c = h[0]; let ok = false;
          for (let f = 0; f < B.state.floors.length && !ok; f++) { try { const r = B.playCard(c.uid, { floor: f }); if (r && r.ok !== false) ok = true; } catch (e) {} }
          if (!ok) { try { ok = !!(B.playCard(c.uid) || {}).ok; } catch (e) {} } 
          await sleep(150); if (!ok) break;
        }
        const t0 = Date.now(); while (U.isPlaying && U.isPlaying() && Date.now() - t0 < 8000) await sleep(100);
        const before = B.state.round; U.endTurn();
        const t1 = Date.now(); while (Date.now() - t1 < 9000) { await sleep(150); if (B.state.round !== before || B.state.outcome) break; }
        if (B.state.round === before && !B.state.outcome) return 'STUCK r' + before + ' turn=' + B.state.phase;
        return null;
      });
      if (res && /STUCK/.test(res)) break;
    }
    console.log('seed', s, '->', res);
  }
  console.log('timeouts', timed, 'errors', errs);
  await q.close();
})();

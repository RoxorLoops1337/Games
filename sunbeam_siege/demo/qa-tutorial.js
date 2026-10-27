/* Drive the whole tutorial in the browser with the scripted plays. usage: node demo/qa-tutorial.js [phone|desk] [--shots]. No em dashes. */
const L = require('./qa-lib');
(async () => {
  const view = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'desk';
  const shots = process.argv.includes('--shots');
  const q = await L.open(view, { fast: true, tag: 'tut-' + view });
  const pg = q.pg, log = (...a) => console.log(...a);
  await pg.click('text=New run'); await q.wait(500);
  const show = await pg.$('text=Show me'); if (!show) { log('no Show me button; screen', await q.cur()); await q.shot('no-show'); }
  else await show.click();
  await q.wait(2500);
  log('start screen', await q.cur());
  const maps = {}; let lastSig = '', stuck = 0, steps = 0, seenSteps = [], fightIdx = -1;
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const plan = await pg.evaluate(() => {
      const T = SB.tutorial && SB.tutorial._st && SB.tutorial._st();
      const cur = SB.ui.current && SB.ui.current.name;
      const dlg = document.querySelector('.tut-int, .modal .tut-int');
      const dbtn = document.querySelector('.modal-back .btn:last-child, .dlg-back .btn:last-child, .dialog .btn:last-child');
      const info = { doneIds: T ? Object.keys(T.done || {}) : [], allSteps: T && T.fight ? T.fight.steps.map(x => x.id) : [], cur, idx: T && T.idx, step: T && T.showing && T.showing.step.id, awaiting: T && T.showing && T.showing.awaiting, round: T && T.round, ptr: T && T.playPtr, inFight: T && T.inFight };
      if (!T) return Object.assign(info, { a: 'none' });
      if (dlg && dbtn) return Object.assign(info, { a: 'dialog', text: (document.querySelector('.tut-int-text') || {}).textContent, btn: dbtn.textContent });
      if (cur !== 'battle') return Object.assign(info, { a: 'wait' });
      const B = SB.ui.battle && SB.ui.battle.B; if (!B) return Object.assign(info, { a: 'wait' });
      const S = B.state;
      if (S.turn === 'over') {
        const nb0 = document.querySelector('.tut-next');
        if (T.showing && nb0 && nb0.offsetParent) return Object.assign(info, { a: 'next', over: true, text: T.showing.step.text.slice(0, 50) });
        const cont = document.querySelector('.b-endbox .btn:last-child');
        if (cont && !T.showing) return Object.assign(info, { a: 'continue', over: true });
        return Object.assign(info, { a: 'wait', over: true });
      }
      if (SB.ui.battle.isPlaying() || S.turn !== 'player') return Object.assign(info, { a: 'wait' });
      const layer = document.querySelector('.tut-layer'); const nb = document.querySelector('.tut-next');
      const layerOn = layer && layer.style.display !== 'none';
      if (T.showing && !T.showing.awaiting && nb && nb.offsetParent) return Object.assign(info, { a: 'next', text: T.showing.step.text.slice(0, 50) });
      // pending queued steps
      if (T.showing && T.showing.awaiting == null && !nb) return Object.assign(info, { a: 'wait' });
      const f = T.fight, rd = (f.rounds || []).filter(r => r.n === T.round)[0];
      const pl = rd && rd.plays[T.playPtr];
      if (!pl) return Object.assign(info, { a: 'noplay', round: T.round, ptr: T.playPtr });
      const unit = (ref) => { let u = null; S.floors.forEach(fl => fl.cats.concat(fl.pests).forEach(x => { if (x.ref === ref) u = x; })); (S.garden || []).forEach(x => { if (x.ref === ref) u = x; }); return u; };
      const cardUid = (id) => { const e = S.hand.find(h => (S.cards && S.cards[h.uid] ? S.cards[h.uid].id : (B.cardView(h.uid) || {}).id) === id); return e && e.uid; };
      if (pl.kind === 'place') return Object.assign(info, { a: 'place', uid: cardUid(pl.card), floor: pl.floor - 1, pid: pl.id, card: pl.card });
      if (pl.kind === 'spell') { const t = unit(pl.target); return Object.assign(info, { a: 'spell', uid: cardUid(pl.card), tuid: t && t.uid, pid: pl.id, card: pl.card, target: pl.target }); }
      if (pl.kind === 'toggleNap') { const u = unit(pl.unit); return Object.assign(info, { a: 'nap', tuid: u && u.uid, pid: pl.id }); }
      if (pl.kind === 'endTurn') return Object.assign(info, { a: 'end', pid: pl.id });
      return Object.assign(info, { a: 'unknown', pl });
    });
    if (plan.doneIds && plan.idx != null) maps[plan.idx] = { done: plan.doneIds, all: plan.allSteps };
    const sig = JSON.stringify([plan.cur, plan.idx, plan.step, plan.round, plan.ptr, plan.a, plan.over]);
    if (sig === lastSig) { if (++stuck > 80) { log('STUCK', JSON.stringify(plan)); await q.shot('stuck'); break; } } else { stuck = 0; lastSig = sig; }
    if (plan.idx !== fightIdx && plan.idx != null) { if (fightIdx >= 0) log('    UNSHOWN steps of fight', fightIdx, ':', maps[fightIdx].all.filter(x => !maps[fightIdx].done.includes(x)).join(', ') || 'none'); fightIdx = plan.idx; log('--- fight index', fightIdx); }
    if (plan.a === 'none') { log('tutorial ended; screen', plan.cur); break; }
    if (plan.a === 'dialog') { log('dialog:', (plan.text || '').slice(0, 70), '| btn', plan.btn); if (shots) await q.shot('dialog-' + (steps++)); await pg.click('.modal-back .btn:last-child, .dlg-back .btn:last-child, .dialog .btn:last-child', { force: true }).catch(e => log('dialog click fail', e.message.slice(0, 60))); await q.wait(500); continue; }
    if (plan.a === 'next') { log('  step', plan.step, '|', plan.text); if (shots && !seenSteps.includes(plan.step)) { seenSteps.push(plan.step); await q.wait(500); await q.shot('step-' + String(seenSteps.length).padStart(2, '0') + '-' + plan.step); } await pg.click('.tut-next', { force: true }).catch(e => log('next fail', e.message.slice(0, 60))); await q.wait(150); continue; }
    if (plan.a === 'continue') { log('  continue (battle end)'); await pg.click('.b-endbox .btn:last-child', { force: true }).catch(() => {}); await q.wait(600); continue; }
    if (plan.a === 'wait') { await q.wait(150); continue; }
    if (plan.a === 'noplay') { log('  (script over for round', plan.round, ') free play: end turn'); await pg.click('.b-end', { force: true }).catch(() => {}); await q.wait(300); const cf = await pg.$('.modal button:has-text("End turn")'); if (cf) await cf.click(); await q.wait(1500); continue; }
    log('  play', plan.a, plan.card || '', plan.target || '', 'round', plan.round);
    if (plan.a === 'place' || plan.a === 'spell') {
      if (!plan.uid) { log('card not in hand', plan.card); await q.shot('nocard'); break; }
      await pg.click(`.b-hand [data-uid="${plan.uid}"]`, { force: true }).catch(e => log('card click fail')); await q.wait(150);
      if (plan.a === 'place') await pg.click(`.b-floor[data-floor="${plan.floor}"]`, { force: true }).catch(e => log('floor click fail'));
      else await pg.click(`.u-hit[data-uid="${plan.tuid}"]`, { force: true }).catch(e => log('unit click fail'));
    } else if (plan.a === 'nap') await pg.click(`.u[data-uid="${plan.tuid}"] .u-nap`, { force: true }).catch(e => log('nap click fail'));
    else if (plan.a === 'end') { await pg.click('.b-end', { force: true }).catch(e => log('end click fail')); await q.wait(300); const cf = await pg.$('.modal button:has-text("End turn")'); if (cf) await cf.click(); }
    await q.wait(250);
    if (plan.a === 'end') { await q.wait(1200); for (let k = 0; k < 100 && await pg.evaluate(() => SB.ui.battle && SB.ui.battle.isPlaying()); k++) await q.wait(100); log('    after round', plan.round, JSON.stringify(await pg.evaluate(() => { const B = SB.ui.battle && SB.ui.battle.B; if (!B) return null; const S = B.state; return { turn: S.turn, round: S.round, warmth: S.sunbeam.warmth, cats: S.floors.map(f => f.cats.map(c => (c.ref || c.name) + ':' + c.health + 'p' + c.power + 'L' + c.lives)), pests: S.floors.map(f => f.pests.map(p => (p.ref || p.name) + ':' + p.hp)), garden: (S.garden || []).map(p => p.ref + ':' + p.hp) }; }))); }
    if (shots && plan.a === 'end') await q.shot('after-end-' + fightIdx + '-r' + plan.round);
  }
  if (maps[fightIdx]) log('    UNSHOWN steps of fight', fightIdx, ':', maps[fightIdx].all.filter(x => !maps[fightIdx].done.includes(x)).join(', ') || 'none');
  log('final screen', await q.cur());
  await q.shot('final');
  log('errors', [...new Set(q.errors.filter(e => !/AudioContext/.test(e)))].join('\n') || 'none');
  await q.close();
})();

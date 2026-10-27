/* Phone sweep of every non-battle screen. Usage: node demo/qa-sweep.js [view] */
const L = require('./qa-lib');
const AUDIT = () => {
  const vw = innerWidth, out = { hscroll: document.documentElement.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1, small: [], clip: [], over: [] };
  const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && e.offsetParent !== null; };
  const sel = 'button, a[href], [role=button], [role=tab], summary, input, select, label.chk, .btn';
  const scr = document.querySelector('.screen:last-of-type') || document.body;
  document.querySelectorAll(sel).forEach(e => {
    if (!vis(e)) return; if (e.closest('#topbar') && false) return;
    const r = e.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) out.small.push((e.className || e.tagName).toString().slice(0, 30) + ' "' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20) + '" ' + Math.round(r.width) + 'x' + Math.round(r.height));
  });
  document.querySelectorAll('.screen *, #topbar *').forEach(e => {
    if (!vis(e)) return; const cs = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && !/svg|canvas|IMG/i.test(e.tagName) && e.children.length === 0 && e.textContent.trim()) out.clip.push((e.className || e.tagName).toString().slice(0, 30) + ' "' + e.textContent.trim().slice(0, 24) + '" sw' + e.scrollWidth + ' cw' + e.clientWidth);
    const r = e.getBoundingClientRect(); if (r.right > vw + 1 && !e.closest('[class*=scroll],.rw-cards,.hand-row,.tabs')) out.over.push((e.className || e.tagName).toString().slice(0, 30) + ' r' + Math.round(r.right));
  });
  const foot = document.querySelector('.screen .rw-foot'); 
  if (foot) { const fr = foot.getBoundingClientRect(); out.foot = [Math.round(fr.top), Math.round(fr.bottom), getComputedStyle(foot).position]; }
  out.small = out.small.slice(0, 14); out.clip = out.clip.slice(0, 10); out.over = out.over.slice(0, 8);
  return out;
};
async function toNode(q, type, seed) {
  await q.pg.evaluate(([type, seed]) => {
    const K = SB.ui.flow; const run = SB.run.newRun({ seed, clan: 'alley', side: 'hearth', rank: 0 }); K.run = run; run.fish = 400;
    const av = SB.run.availableNodes(run); run.map.nodes[av[0]].type = type; K.chooseNode(av[0]);
  }, [type, seed]);
  await q.wait(1200);
}
(async () => {
  const views = process.argv[2] ? [process.argv[2]] : ['phone'];
  for (const view of views) {
    const q = await L.open(view, { fast: true, tag: 'sw-' + view });
    const rep = async (name) => { await q.wait(500); await q.shot(name); const a = await q.pg.evaluate(AUDIT); console.log('==', name, 'screen=' + await q.cur(), JSON.stringify(a)); };
    for (const t of ['shop', 'event', 'nook', 'post', 'treasure']) { await toNode(q, t, 'SW' + t); await rep(t); }
    // shop tabs
    await toNode(q, 'shop', 'SWshop2');
    for (const tb of ['Relics', 'Gear', 'Supplies', 'Services']) { try { await q.pg.click('.tabs >> text=' + tb); } catch (e) {} await rep('shop-' + tb); }
    // event after choice
    await toNode(q, 'event', 'SWev2'); try { await q.pg.click('.ev-choices button'); } catch (e) {} await q.wait(2500); await rep('event-result');
    await toNode(q, 'treasure', 'SWtr2'); try { await q.pg.click('[data-opt=open]'); } catch (e) {} await q.wait(1500); await rep('treasure-open');
    await toNode(q, 'nook', 'SWnk2'); try { await q.pg.click('.nook-opt'); } catch (e) {} await q.wait(2000); await rep('nook-done');
    // plain screens
    await q.pg.evaluate(() => SB.ui.flow.toTitle()); await rep('title');
    for (const s of ['settings', 'newrun', 'collection', 'story']) { await q.pg.evaluate((s) => { SB.ui.flow.run = null; SB.ui.go(s, s === 'story' ? { mode: 'opening', next: () => {} } : {}); }, s); await rep(s); }
    await q.pg.evaluate(() => { const K = SB.ui.flow; const run = SB.run.newRun({ seed: 'SWmap', clan: 'moon', side: 'hearth', rank: 0 }); K.run = run; K.toMap(); }); await rep('map');
    await q.pg.evaluate(() => { const K = SB.ui.flow; const run = K.run; run.status = 'over'; K.endRun('lost', {}); }); await q.wait(2500); await rep('gameover');
    await q.pg.evaluate(() => { SB.ui.go('summary', { run: SB.ui.flow.run, summary: SB.run.summary(SB.ui.flow.run, 'won'), outcome: 'won' }); }); await q.wait(1500); await q.pg.keyboard.press('Escape'); await rep('summary');
    console.log('ERRORS', q.errors.filter(e => !/AudioContext/.test(e)).join('\n') || 'none');
    await q.close();
  }
})();

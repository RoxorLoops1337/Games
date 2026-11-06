/* WCAG AA text contrast sweep over several screens and states. node demo/qa-contrast.js */
const L = require('./qa-lib');
const AUDIT = () => {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (f, b) => { const a = f[3]; return [f[0] * a + b[0] * (1 - a), f[1] * a + b[1] * (1 - a), f[2] * a + b[2] * (1 - a), 1]; };
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const bgOf = e => { const chain = []; for (let n = e; n && n.nodeType === 1; n = n.parentElement) chain.push(n); let bg = [20, 15, 38, 1]; for (let i = chain.length - 1; i >= 0; i--) { const cs = getComputedStyle(chain[i]); const c = parse(cs.backgroundColor); if (c[3] > 0) bg = over(c, bg); } return bg; };
  const opac = e => { let o = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; };
  const out = [], seen = new Set();
  document.querySelectorAll('body *').forEach(e => {
    if (!e.childNodes.length) return; let txt = ''; e.childNodes.forEach(n => { if (n.nodeType === 3) txt += n.textContent; }); txt = txt.trim(); if (!txt) return;
    const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') return;
    let fg = parse(cs.color); const bg = bgOf(e); const o = opac(e); fg = [fg[0], fg[1], fg[2], fg[3] * o]; const eff = over(fg, bg);
    const ratio = (Math.max(lum(eff), lum(bg)) + .05) / (Math.min(lum(eff), lum(bg)) + .05);
    const fs = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700; const large = fs >= 24 || (fs >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (ratio < need) { const k = (e.className + '|' + txt.slice(0, 20)); if (seen.has(k)) return; seen.add(k); out.push(ratio.toFixed(2) + ' <' + need + ' ' + (e.tagName + '.' + String(e.className).slice(0, 40)) + ' "' + txt.slice(0, 28) + '" ' + cs.color + ' on rgb(' + bg.slice(0, 3).map(Math.round) + ')' + (o < 1 ? ' op' + o.toFixed(2) : '') + (e.disabled || e.getAttribute('aria-disabled') ? ' DIS' : '')); }
  });
  return out;
};
(async () => {
  const q = await L.open('desk', { fast: true, tag: 'contrast' });
  const rep = async (n) => { await q.wait(500); const a = await q.pg.evaluate(AUDIT); console.log('== ' + n + ' (' + a.length + ')'); a.slice(0, 25).forEach(x => console.log('  ' + x)); };
  await rep('title');
  for (const s of ['settings', 'collection', 'newrun']) { await q.pg.evaluate(s => SB.ui.go(s, {}), s); await rep(s); }
  await q.pg.evaluate(() => { const K = SB.ui.flow; const run = SB.run.newRun({ seed: 'CT', clan: 'moon', side: 'hearth', rank: 0 }); K.run = run; K.toMap(); }); await rep('map');
  for (const t of ['shop', 'post', 'nook', 'event']) {
    await q.pg.evaluate(([t]) => { const K = SB.ui.flow; const run = SB.run.newRun({ seed: 'CT' + t, clan: 'alley', side: 'hearth', rank: 0 }); K.run = run; run.fish = 30; const av = SB.run.availableNodes(run); run.map.nodes[av[0]].type = t; K.chooseNode(av[0]); }, [t]); await q.wait(900); await rep(t);
  }
  await L.startBattle(q, { seed: 'CT9', clan: 'alley' }); await q.idle(); await rep('battle');
  // play a cat so abilities may exist; make a card disabled by spending zoomies
  await q.pg.keyboard.press('1'); await q.pg.keyboard.press('Enter'); await q.wait(300); await q.pg.keyboard.press('Enter'); await q.idle(); await rep('battle after play');
  // tooltip on a keyword and status
  const kw = await q.pg.$('.kw, [data-gl]'); if (kw) { await kw.hover(); await q.wait(500); await rep('tooltip'); }
  await q.pg.evaluate(() => { const B = SB.ui.battle; });
  await q.pg.keyboard.press('Escape'); await q.pg.keyboard.press('?'); await rep('key help'); await q.pg.keyboard.press('Escape');
  await q.pg.keyboard.press('l'); await rep('log');
  // champion with abilities: dim ability buttons, unaffordable cards, disabled End Turn
  await L.startBattle(q, { clan: 'moon', side: 'alley', champion: 'moon_oswin_ledgerpaw', relics: ['relic_kept_receipt'], setup: 'B.drawCards(2);' }); await q.idle(); await q.wait(500);
  const ci = await q.pg.evaluate(() => { const B = SB.ui.battle.B, s = B.state; return s.hand.findIndex(e => /champion/.test((B.cardView(e.uid) || {}).type || '')); });
  if (ci >= 0) { const cards = await q.pg.$$('.b-hand > *'); await cards[ci].click({ force: true }); await q.wait(200); await q.pg.click('.b-floor[data-floor="0"]', { force: true }); await q.wait(300); await q.idle(); }
  console.log('tray', await q.pg.evaluate(() => [...document.querySelectorAll('.b-tray .btn')].map(b => b.textContent + (b.className.includes('dim') ? ' (dim)' : ''))));
  await rep('champion tray');
  for (let i = 0; i < 4; i++) { await q.pg.keyboard.press('1'); await q.pg.keyboard.press('Enter'); await q.wait(250); await q.pg.keyboard.press('Enter'); await q.idle(); await q.wait(200); }
  await rep('spent zoomies');
  await q.pg.keyboard.press('e'); await q.wait(200); await q.pg.evaluate(() => { const b = [...document.querySelectorAll('.modal button, [role=dialog] button')].find(x => /end|yes/i.test(x.textContent)); if (b) b.click(); }); await q.wait(400); await rep('enemy phase');
  console.log('errors', q.errors.filter(e => !/AudioContext/.test(e)).join('\n') || 'none'); await q.close();
})();

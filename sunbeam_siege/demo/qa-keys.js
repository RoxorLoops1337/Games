/* Keyboard shortcuts and settings persistence in a real browser. */
const L = require('./qa-lib');
(async () => {
  const q = await L.open('desk', { tag: 'keys' });
  const pg = q.pg; let fails = 0;
  const ok = (n, c) => { console.log(c ? 'ok  ' : 'FAIL', n); if (!c) fails++; };
  await L.startBattle(q, { seed: 'KEY1' });
  await q.idle();
  const st = () => pg.evaluate(() => { const b = SB.ui.battle; const s = b.state(); return { sel: !!document.querySelector('.card.selected, .card.sel'), modal: SB.ui.modal.count(), log: !!document.querySelector('.b-log.open, .b-log:not([hidden])'), round: s.round, hand: s.hand.length, zoom: s.zoomies, turn: s.turn || s.phase }; });
  const key = async (k) => { await pg.keyboard.press(k); await q.wait(350); };
  let s0 = await st(); console.log(JSON.stringify(s0));
  await key('?'); ok('? opens help', (await st()).modal > 0); await key('Escape'); ok('Esc closes help', (await st()).modal === 0);
  await key('d'); ok('D opens draw pile', (await st()).modal > 0); await key('Escape');
  await key('x'); ok('X opens discard pile', (await st()).modal > 0); await key('Escape');
  const logState = () => pg.evaluate(() => { const e = document.querySelector('[class*=log]'); return [...document.querySelectorAll('[class*=log]')].map(e => e.className + ':' + getComputedStyle(e).display + ':' + Math.round(e.getBoundingClientRect().width)).join('|'); });
  const l0 = await logState(); await key('l'); const l1 = await logState(); ok('L toggles log', l0 !== l1); await key('l');
  await key('1'); ok('1 selects a card', await pg.evaluate(() => !!document.querySelector('.card.selected, .card.sel, .card[aria-pressed=true], .card.is-sel')) || (await pg.evaluate(() => document.querySelectorAll('[class*=sel]').length)) > 0);
  await key('Escape'); 
  await key('ArrowRight'); const foc = await pg.evaluate(() => document.activeElement && document.activeElement.className); ok('Arrow moves hand focus', /card/.test(foc || ''));
  await key('2'); await key('ArrowRight'); await key('ArrowLeft'); await key('Escape');
  const before = await st();
  // play first card via keyboard
  await key('1'); await key('Enter'); await q.wait(300); await key('Enter'); await q.idle(); await q.wait(500);
  const after = await st(); ok('Enter plays a card (hand or zoomies changed)', after.hand !== before.hand || after.zoom !== before.zoom);
  const abil = await pg.evaluate(() => !!document.querySelector('.b-abil, [class*=abil]'));
  await key('a'); await key('Escape');
  await key('k'); await key('k');
  // nap: focus a cat
  await pg.evaluate(() => { const c = document.querySelector('.u-hit[data-side=cat]'); if (c) c.focus(); });
  const napState = () => pg.evaluate(() => { const st = SB.ui.battle.state(); const all = JSON.stringify(st); return [...all.matchAll(/"napping":(true|false)/g)].map(m => m[1]).join(','); });
  const hasCat = await pg.evaluate(() => !!document.querySelector('.u-hit[data-side=cat]'));
  const napBefore = await napState();
  await key('n'); await q.idle(); const napAfter = await napState();
  console.log('cat hit present', hasCat, napBefore, napAfter); ok('N naps focused cat', !hasCat || napBefore !== napAfter);
  await pg.evaluate(() => document.activeElement && document.activeElement.blur());
  const r0 = (await st()).round; await key('e'); await q.wait(500); 
  const dlg = (await st()).modal; if (dlg) { await pg.keyboard.press('Enter'); await q.wait(300); const b = await pg.$('.modal button:last-child, [role=dialog] button'); }
  await q.idle(400); const r1 = (await st()).round; console.log('round', r0, r1, 'modal', dlg); ok('E ends turn (or asks to confirm)', r1 !== r0 || dlg > 0);
  console.log('errors', q.errors.filter(e => !/AudioContext/.test(e)).join('\n') || 'none');
  await q.close();
  console.log('FAILS', fails);
})();

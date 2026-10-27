/* Settings toggles through the real settings screen, persistence after reload, M and D outside battle. */
const L = require('./qa-lib');
(async () => {
  const q = await L.open('desk', { tag: 'settings' }); const pg = q.pg; let fails = 0;
  const ok = (n, c) => { console.log(c ? 'ok  ' : 'FAIL', n); if (!c) fails++; };
  await pg.evaluate(() => SB.ui.go('settings', {})); await q.wait(600);
  const cls = () => pg.evaluate(() => document.documentElement.className);
  const clickField = async (label, btn) => { const f = pg.locator('.field', { hasText: label }).first(); if (btn) await f.locator('button', { hasText: new RegExp('^' + btn + '$') }).click(); else await f.locator('input.switch').click({ force: true }); await q.wait(200); };
  await clickField('Text size', 'XL'); ok('text XL class', /text-xl/.test(await cls()));
  await clickField('Reduce motion'); const rm = await pg.evaluate(() => SB.ui.settings.get('reduceMotion')); ok('reduce motion toggled', /reduce-motion/.test(await cls()) === !!rm);
  await clickField('Reduce motion'); const rm2 = await pg.evaluate(() => SB.ui.settings.get('reduceMotion')); await clickField('Reduce motion'); // ensure ON at end
  const rmOn = await pg.evaluate(() => SB.ui.settings.get('reduceMotion')); ok('reduce motion on', rmOn === true && /reduce-motion/.test(await cls()));
  await clickField('Left-handed'); ok('left-handed class', /left-handed/.test(await cls()));
  await clickField('Mute all'); const muted = await pg.evaluate(() => SB.audio.isMuted('master')); ok('mute on', muted === true);
  await q.pg.reload(); await q.wait(1500);
  const after = await pg.evaluate(() => ({ c: document.documentElement.className, m: SB.audio.isMuted('master') }));
  ok('XL persists', /text-xl/.test(after.c)); ok('reduce motion persists', /reduce-motion/.test(after.c)); ok('left-handed persists', /left-handed/.test(after.c)); ok('mute persists', after.m === true);
  // keys outside battle
  await pg.evaluate(() => { const K = SB.ui.flow; const run = SB.run.newRun({ seed: 'KS', clan: 'alley', side: 'hearth', rank: 0 }); K.run = run; K.toMap(); }); await q.wait(800);
  await pg.keyboard.press('d'); await q.wait(500); ok('D opens deck outside battle', await pg.evaluate(() => SB.ui.modal.count() > 0 || !!document.querySelector('.modal, [role=dialog], .dialog')));
  await pg.keyboard.press('Escape'); await q.wait(300);
  console.log('errors', q.errors.filter(e => !/AudioContext/.test(e)).join('\n') || 'none'); console.log('FAILS', fails); await q.close();
})();

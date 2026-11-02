// Round 4 retention: kind streak line, stamp snapshot and result chips, tomorrow hook.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const S = await import(join(root, 'sim.js')), K = await import(join(root, 'keep_ui.js'));
const day = 20400;
{ // a streak waiting is a friendly line, never a threat, and only when it is real
  const s = S.defaultSave(); s.login = day;
  assert.equal(K.streakRisk(s, day), null, 'fresh save: no line');
  s.addict.spin = { day: day - 1, prize: 1, n: 4 };
  const r = K.streakRisk(s, day); assert.ok(r && /4 day spin streak/.test(r.text) && !/lose|lost|break|expire/i.test(r.text), r && r.text);
  s.addict.spin = { day, prize: 1, n: 4 }; assert.equal(K.streakRisk(s, day), null, 'already spun today');
  s.addict.season = { key: Math.floor(day / 30), n: 3, last: day - 1, claimed: {}, note: '' }; s.addict.spin = { day: 0, prize: -1, n: 0 };
  assert.ok(/stamp/i.test(K.streakRisk(s, day).text), 'stamp waiting');
  assert.ok(!K.riskHTML(s, day).includes(String.fromCharCode(8212)));
}
{ // snapshot then record: the stamp and a new book page show as chips
  const s = S.defaultSave(), snap = K.keepSnap(s, day); assert.equal(snap.stamped, false);
  s.cleared = 1; S.recordAddictRun(s, day, { stage: 1, kills: 5, won: true });
  const host = { innerHTML: '', classList: { toggle() {} } };
  K.keepResult(snap, s, day, { stage: 1, won: true }, host, true);
  assert.ok(/Season stamp 1\/30/.test(host.innerHTML) && /New in your book/.test(host.innerHTML), host.innerHTML);
  const snap2 = K.keepSnap(s, day), h2 = { innerHTML: '', classList: { toggle() {} } };
  K.keepResult(snap2, s, day, { stage: 1 }, h2, true); assert.ok(!/stamp 1\/30/.test(h2.innerHTML), 'second run same day: no second stamp chip');
  assert.equal(K.tomorrowLine(s, day, { mode: 'pig' }), null);
  assert.ok(K.tomorrowLine(s, day, { stage: 1 }).text.length > 5);
}
console.log('16_addiction r4 ok');

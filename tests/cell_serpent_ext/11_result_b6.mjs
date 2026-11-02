// Batch 6 result and pause: reward chips fly to the hub, hold-to-confirm GIVE UP with a recap, keyboard-only focus ring, solid sticky CLOSE.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const U = await import(join(root, 'result_ux.js'));
{ const l = U.lossLine({ progress: 0.384, kills: 12, revivesLeft: 1, weap: { a: 1, b: 2 } });
  assert.equal(l.pc, 38); assert.ok(/38% of the way, 12 cells popped, an Encore left/.test(l.text), l.text);
  assert.ok(/1 cell popped/.test(U.lossLine({ progress: 0, kills: 1 }).text)); assert.ok(!/Encore/.test(U.lossLine({ progress: 0, kills: 0, revivesLeft: 0 }).text)); }
{ const row = (t, n) => ({ textContent: t, querySelector: sel => (sel === '[data-to]' ? { dataset: { to: String(n) } } : null), getBoundingClientRect: () => ({ left: 1, top: 2, width: 3, height: 4 }) });
  const list = { children: [row('+120 Beats', 120), row('+3 Sparkles', 3), row('+2 Ribbons', 2), row('+0 Beats', 0)] };
  const s = U.rewardSnaps(list); assert.deepEqual(s.map(x => x.kind + x.n), ['beats120', 'sparkles3'], 'only paid Beats and Sparkles fly'); }
{ const html = readFileSync(join(root, 'index.html'), 'utf8'), main = readFileSync(join(root, 'main.js'), 'utf8');
  assert.ok(/id="pLose"/.test(html) && /#quitBtn\.holding \.hfill/.test(html), 'recap line and hold fill');
  assert.ok(/html:not\(\.kbd\) \.scr :focus-visible/.test(html), 'focus ring only for keyboard');
  assert.ok(/#settings #setClose\{box-shadow:0 0 0 10px rgba\(8,5,30,\.98\)/.test(html), 'solid sticky close band');
  assert.ok(/holdConfirm\(\$\('quitBtn'\)/.test(main) && /flyRewards\(fl/.test(main), 'wired');
  const em = String.fromCharCode(8212);
  assert.ok(!html.includes(em) && !main.includes(em) && !readFileSync(join(root, 'result_ux.js'), 'utf8').includes(em), 'no em dash'); }

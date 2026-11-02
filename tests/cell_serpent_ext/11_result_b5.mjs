// Batch 5 result and pause polish: streak-at-risk chip, 2x2 extras, pause recap icons, short-phone rules.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const S = await import(join(root, 'sim.js')), K = await import(join(root, 'keep_ui.js'));
const day = 20400, host = () => ({ innerHTML: '', classList: { toggle() {} } });
{ // a spin streak waiting shows a warm chip on the result, only for normal runs
  const s = S.defaultSave(); s.addict.spin = { day: day - 1, prize: 1, n: 5 };
  let h = host(); K.keepResult(K.keepSnap(s, day), s, day, { stage: 2, won: false }, h, true);
  assert.ok(/kchip risk/.test(h.innerHTML) && /5 day spin streak/.test(h.innerHTML), h.innerHTML);
  assert.ok(!/lose|lost|break|expire/i.test(h.innerHTML));
  h = host(); K.keepResult(K.keepSnap(s, day), s, day, { stage: 2, mode: 'pig' }, h, true); assert.ok(!/kchip risk/.test(h.innerHTML));
  s.addict.spin = { day, prize: 1, n: 5 }; h = host(); K.keepResult(K.keepSnap(s, day), s, day, { stage: 2 }, h, true); assert.ok(!/kchip risk/.test(h.innerHTML), 'already spun');
}
{ const html = readFileSync(join(root, 'index.html'), 'utf8'), main = readFileSync(join(root, 'main.js'), 'utf8');
  assert.ok(/#result \.rextra\{display:grid;grid-template-columns:1fr 1fr/.test(html), '2x2 extras grid');
  assert.ok(/max-height:780px\)\{\.rkeep \.kchip\.risk\{display:none\}/.test(html), 'risk chip hides on short phones');
  assert.ok(/class="rtop"/.test(main) && /% of the way/.test(main), 'extras Top row and pause percent');
  assert.ok(!html.includes(String.fromCharCode(8212)) && !main.includes(String.fromCharCode(8212)), 'no em dash');
}

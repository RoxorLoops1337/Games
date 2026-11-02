// Round 6 retention: achievement card, shield pip on the Season pill, kinder comeback, weekly card, gig icons.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const rd = f => readFileSync(join(root, f), 'utf8');
const B = await import(join(root, 'battle_ui.js'));
// every daily goal id has its own icon, and the row uses it
{
  const S = await import(join(root, 'sim.js'));
  for (const d of S.GOAL_DEFS) assert.ok(B.GOAL_ICON[d.id], 'icon for ' + d.id);
  assert.ok(B.goalRowHTML('Pop', 1, 3, '50', 'wait', 'bombs').includes('💣'));
  assert.ok(B.goalRowHTML('Pop', 1, 3, '50', 'claimed', 'bombs').includes('✓'));
  assert.ok(B.goalRowHTML('Pop', 1, 3, '50', 'wait').includes('🎯'), 'old call shape still works');
}
// sources wire the new UI
{
  const r = rd('retain_ui.js'), a = rd('addict_ui.js'), h = rd('index.html');
  assert.ok(r.includes('qshield') && r.includes('hasShield(s)'));
  assert.ok(r.includes('ACHIEVEMENT UNLOCKED') && r.includes('achievementCount(save())'));
  assert.ok(a.includes('cbwait') && a.includes('wkcard'));
  for (const k of ['#achToast.t-gold', '.qpill .qshield', '.cbchip', '.wkcard']) assert.ok(h.includes(k), k);
  assert.ok(!/—/.test(r + a + h), 'no em dash');
}

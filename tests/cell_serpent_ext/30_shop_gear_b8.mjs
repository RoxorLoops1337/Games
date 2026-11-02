// Round 8 shop, gear and wardrobe polish: set tints only on tier 2 and up, the ribbon icon helpers, the try-on wiring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const b8 = await import(join(root, 'shop_b8.js'));
for (const k of sim.KEEPSAKES) {
  const t = b8.setTint(k);
  if (k.tier >= 2 && k.set) assert.ok(/^#[0-9a-f]{6}$/i.test(t), k.id + ' tier 2+ with a set gets a tint');
  else assert.equal(t, '', k.id + ' stays untinted');
}
for (const st of sim.KEEP_SETS) assert.ok(b8.SET_TINT[st.id], 'every set has a tint: ' + st.id);
assert.ok(b8.ribHTML(5).includes('5'), 'ribHTML carries the amount even without a canvas');
const hub = readFileSync(join(root, 'hub2.js'), 'utf8');
assert.ok(hub.includes('wardTry('), 'the wardrobe wires the try-on');
assert.ok(!hub.includes('—'), 'no em dash in hub2');
assert.ok(!readFileSync(join(root, 'shop_b8.js'), 'utf8').includes('—'), 'no em dash in shop_b8');

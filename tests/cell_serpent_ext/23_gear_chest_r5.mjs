// Round 5 gear: seeded chest forecast agrees with the real open, keepsake detail strip content.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const fx = await import(join(root, 'gear_fx.js'));

// same seed gives the same stream
const a = fx.seeded(7), b = fx.seeded(7);
for (let i = 0; i < 20; i++) assert.equal(a(), b());

// a forecast on a throwaway save equals the real open for the same seed
const mk = () => ({ sparkles: 1e9, keeps: Object.fromEntries(sim.KEEPSAKES.map(k => [k.id, { lv: 0, frag: 0 }])) });
for (const n of [1, 10]) for (let seed = 1; seed < 40; seed++) {
  const x = sim.openKeepChest(mk(), n, fx.seeded(seed)), y = sim.openKeepChest({ ...mk(), sparkles: 5000 }, n, fx.seeded(seed));
  assert.deepEqual(x, y, 'forecast roll matches the open');
}

// detail html: next-level delta, set strip with owned members
const k = sim.KEEPSAKES.find(q => q.id === 'mallet'), STAT = { atk: v => `+${Math.round(v * 100)}% Volume` };
const owned = Object.fromEntries(sim.KEEPSAKES.map(q => [q.id, q.set === 'stage' && q.id !== 'megaphone' ? 1 : 0]));
const html = fx.keepDetailHTML(k, { lv: 3, frag: 0 }, 10, STAT, sim.KEEPSAKES, sim.KEEP_SETS, owned);
assert.ok(html.includes('kdelta') && html.includes('+5% Volume') && html.includes('Showtime') && html.includes('Collect all'));
assert.ok(!/—/.test(html));
const max = fx.keepDetailHTML(k, { lv: 10, frag: 0 }, 10, STAT, sim.KEEPSAKES, sim.KEEP_SETS, owned);
assert.ok(max.includes('maxed'));

// Gameplay batch 8: bell tether, trait chip, species counter cards (Ice Breaker, Heart Mender).
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { hasTrait, TRAIT_LABEL, drawTraitIcon } = await import(join(root, 'trait_ui.js'));
const { drawBellLinks } = await import(join(root, 'bell_fx.js'));
const { capIconURL } = await import(join(root, 'card_icons.js'));

// every trait skin has a label, and only regular late stages show the chip
for (const k of sim.TRAIT_SKINS) assert.ok(TRAIT_LABEL[k], k);
assert.ok(hasTrait('frosty', 21, false, '') && !hasTrait('frosty', 20, false, '') && !hasTrait('frosty', 25, true, '') && !hasTrait('sleepy', 30, false, ''));

// canvas stub: the draw calls must not throw and must stay stroke only
const calls = {};
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls[k] = (calls[k] || 0) + 1; }), set: (t, k, v) => { t[k] = v; return true; } });
for (const k of sim.TRAIT_SKINS) drawTraitIcon(ctx, k, 100, 100, 22, '#fff', 1);
drawBellLinks(ctx, { segs: [{ hp: 1 }, { x: 0, y: 0, hp: 1 }, { x: 40, y: 0, hp: 1, bell: true }, { x: 80, y: 0, hp: 1 }, { x: 120, y: 0, hp: 0 }] }, 1);
assert.ok(calls.stroke >= 2 && !calls.createLinearGradient && !calls.createRadialGradient);
drawBellLinks(ctx, { segs: [{ hp: 1 }, { x: 0, y: 0, hp: 1 }] }, 1);   // no bell: no-op

// cards: restricted to their species stage, icons exist
for (const id of ['brk', 'hbk']) { const p = sim.PASSIVES.find(u => u.id === id); assert.ok(p && p.minStage >= 22 && p.skin && p.vals.length >= 4); assert.ok(capIconURL(id)); }
const skinStage = (skin, min) => { let n = sim.SKINS.indexOf(skin) + 1; while (n < min || sim.isBossStage(n)) n += 10; return n; };
const pickIds = (skin, withCard) => {
  const g = sim.createGame({ seed: 5, stage: skinStage(skin, 22) }); g.level = 6; g.pending = 1; g.rerolls = 400; if (withCard) g.ups[withCard] = 1;
  sim.step(g, 1 / 60, { mx: 0 }); assert.equal(g.phase, 'levelup'); const seen = new Set();
  for (let i = 0; i < 150; i++) { for (const c of g.choices) seen.add(c.id); sim.reroll(g); }
  return seen;
};
assert.ok(pickIds('frosty').has('brk') && !pickIds('frosty').has('hbk'), 'frost stage offers Ice Breaker only');
assert.ok(pickIds('love').has('hbk') && !pickIds('love').has('brk'), 'love stage offers Heart Mender only');
assert.ok(!pickIds('disco').has('brk') && !pickIds('disco').has('hbk'));
assert.ok(pickIds('disco', 'brk').has('brk'), 'an owned counter card can still level up');
{   // Heart Mender: the pulse heals nothing at 100%
  const run = v => { const g = sim.createGame({ seed: 3, stage: skinStage('love', 22) }), sn = g.snakes[0]; if (v) { g.ups.hbk = 1; g.val = { hbk: v }; }
    const t = () => sim.step(g, 1 / 60, { mx: 0 }); for (let i = 0; i < 60; i++) t();
    for (let i = 1; i <= 4; i++) sn.segs[i].hp = sn.segs[i].max * 0.5;
    for (let i = 0; i < 60 * 9; i++) t(); return sn.segs[2].hp / sn.segs[2].max; };
  assert.ok(run(0) > 0.55 && run(100) <= 0.5001, 'full Heart Mender stops the heal');
}
console.log('26_gameplay_b8 ok');

// 12m enemy art: boss tiers (crown and aura per boss stage), HP number pass, badge clearance, ring-stage gaze, mod chip.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const rd = f => readFileSync(join(root, f), 'utf8');
const bt = await import(join(root, 'boss_tier_b12m.js'));
const cb = await import(join(root, 'cells_b12m.js'));

// every boss stage from 10 to 50 has its own tier with a distinct look
const seen = new Set();
for (let n = 10; n <= 50; n += 5) {
  const i = bt.bossTierB12m(n); assert.ok(i >= 0 && i < bt.BOSS_TIER_COUNT, 'tier for stage ' + n);
  const T = bt.tierInfoB12m(i); seen.add(T.metal[0] + '|' + T.aura + '|' + T.prongs + '|' + T.style);
}
assert.equal(seen.size, 9, 'nine bosses, nine looks');
assert.equal(bt.bossTierB12m(5), -1); assert.equal(bt.bossTierB12m(12), -1); assert.equal(bt.bossTierB12m(55), -1);

// the painters run on a recording context without throwing and draw something
function rec() {
  const n = { calls: 0 };
  return new Proxy(n, { get: (t, k) => { if (k === 'calls') return t.calls; if (k === 'createRadialGradient') return () => ({ addColorStop() { } }); return (...a) => { t.calls++; }; }, set: () => true });
}
for (let i = 0; i < bt.BOSS_TIER_COUNT; i++) { const a = rec(), b = rec(); bt.paintAuraB12m(a, 40, i); bt.paintCrownB12m(b, 40, -35, i); assert.ok(a.calls > 10 && b.calls > 10, 'tier ' + i + ' paints'); }

// HP numbers: badge cells drop the number, tight neighbours shrink it, free cells are unchanged
assert.ok(cb.hpDropB12m({ metro: 1 }) > cb.hpDropB12m({ ward: 1 }) && cb.hpDropB12m({ ward: 1 }) > cb.hpDropB12m({}));
const r = 30, loose = [{ x: 0, y: 0 }, { x: 0, y: 70 }, { x: 0, y: 140 }], tight = [{ x: 0, y: 0 }, { x: 0, y: 30 }, { x: 0, y: 60 }];
assert.equal(cb.hpSizeB12m(loose, 1, r), 1);
assert.ok(cb.hpSizeB12m(tight, 1, r) < 1 && cb.hpSizeB12m(tight, 1, r) >= 0.7);

// wiring: numbers are drawn in their own pass, the head gets ring + tier, the intro chip replaces the plain text
const rn = rd('render.js');
assert.ok(/hpSizeB12m\(segs, i, r\)/.test(rn) && /ring: !!g\.ring, bt: sn\.boss \? bossTierB12m\(g\.stage\) : -1/.test(rn));
assert.ok(!/if \(!DG \|\| !DG\.draw\(ctx, num\(s\.hp\), s\.x, s\.y \+ r \* 0\.05/.test(rn), 'no per-cell number inside the body loop any more');
assert.ok(/drawModChipB12m\(ctx, c\.mod/.test(rd('screenfx.js')));
assert.ok(/o\.ring && o\.look/.test(rd('art_draw.js')) && /bauraB12m/.test(rd('art_draw.js')) && /crownB12m/.test(rd('art_draw.js')));
for (const f of ['boss_tier_b12m.js', 'cells_b12m.js', 'modchip_b12m.js']) assert.ok(!rd(f).includes('—'), f + ' has no em dash');

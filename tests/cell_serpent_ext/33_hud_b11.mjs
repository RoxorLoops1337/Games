// Batch 11 HUD: tile sprite memo, buff timer chips, level-up sparkle, boss plate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const m = await import(join(root, 'hud_b11.js'));
const { SNACK_RAGE } = await import(join(root, 'sim.js'));

// tile memo: one bake per (colour, radius, contrast), identity hits afterwards, no string key on a hit
{
  const keys = []; let paints = 0;
  const bake = (k, w, h, fn) => { keys.push(k); fn({}); return { c: {}, w, h }; };
  const tm = m.createTileMemo(bake, () => { paints++; });
  const a = tm.get('#ff0000', 29, 0);
  for (let i = 0; i < 100; i++) assert.equal(tm.get('#ff0000', 29, 0), a);
  assert.equal(keys.length, 1); assert.equal(paints, 1); assert.equal(tm.stats.hits, 100);
  assert.notEqual(tm.get('#ff0000', 29, 1), a, 'contrast mode is part of the key');
  assert.notEqual(tm.get('#ff0000', 26, 0), a, 'radius is part of the key');
  assert.notEqual(tm.get('#00ff00', 29, 0), a, 'colour is part of the key');
  assert.equal(tm.size(), 4);
  for (let i = 0; i < 40; i++) tm.get('#' + String(100000 + i), 29, 0);
  assert.ok(tm.size() <= 24, 'memo is capped');
  assert.equal(m.createTileMemo(null, () => {}).get('#fff', 29, 0), null, 'no bake: null, the fallback disc draws');
}
// buff timers
{
  const st = m.newBuffState();
  assert.equal(m.buffUpdate(st, 'rage', 0, 0), null);
  let b = m.buffUpdate(st, 'rage', 8, 0); assert.equal(b.frac, 1); assert.equal(b.low, false); assert.equal(b.snack, false);
  b = m.buffUpdate(st, 'rage', 4, 0); assert.equal(b.frac, 0.5); assert.equal(b.secs, 4);
  b = m.buffUpdate(st, 'rage', 2.1, 0); assert.equal(b.low, true); assert.equal(b.secs, 3);
  assert.equal(m.buffUpdate(st, 'rage', 0, 0), null); assert.equal(st.max, 0, 'expiry resets the scale');
  // a Snack cookie: the counter rises with the buff on
  const sn = m.newBuffState(); m.buffUpdate(sn, 'rage', 0, 2);
  b = m.buffUpdate(sn, 'rage', SNACK_RAGE, 3); assert.equal(b.snack, true); assert.equal(b.frac, 1);
  b = m.buffUpdate(sn, 'rage', SNACK_RAGE / 2, 3); assert.equal(b.snack, true); assert.equal(b.frac, 0.5);
  m.buffUpdate(sn, 'rage', 0, 3); b = m.buffUpdate(sn, 'rage', 8, 3); assert.equal(b.snack, false, 'a plain rage pickup after the snack is a plain chip');
  // a refresh raises the scale instead of overflowing the bar
  const rf = m.newBuffState(); m.buffUpdate(rf, 'shield', 3, undefined); b = m.buffUpdate(rf, 'shield', 9, undefined); assert.equal(b.frac, 1);
}
// sparkle: finite, fades out, stars stay close to the tile
for (let i = 0; i < m.SPARK_N; i++) for (let k = 1; k >= 0; k -= 0.1) {
  const q = m.sparkPoint(i, k, 29);
  assert.ok(Number.isFinite(q.x + q.y + q.s + q.a));
  assert.ok(Math.hypot(q.x, q.y) <= 29 + 6 + 26 + 0.01);
  assert.ok(q.a >= 0 && q.a <= 1 && q.s > 0);
}
assert.equal(m.sparkPoint(0, 0, 29).a, 0);
// wiring and plate
const src = readFileSync(join(root, 'hud.js'), 'utf8');
assert.ok(src.includes("from './hud_b11.js'") && src.includes('tileMemo().get(col, r, hc)') && src.includes('levelSparkle(HB(), x, cy, r, col, lk)'));
assert.ok(!src.includes("kit.bake('tile06|"), 'the tile key string is built once by the memo, not per frame');
assert.ok(/\.draw\(g, b, landBounce\)/.test(src) && !src.includes("text('RAGE ' + p.rage"), 'buff chips come from hud_b11');
assert.ok(!src.includes('x + (w * i) / 4 - 1, y, 2, h') &&src.includes("text('SERPENT', x + 14"), 'boss plate: no ticks, percent in its own pill');
for (const f of ['hud.js', 'hud_b11.js']) assert.ok(!readFileSync(join(root, f), 'utf8').includes('—'), 'no em dash in ' + f);

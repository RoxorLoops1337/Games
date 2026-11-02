// 01 enemy art r10: the boss crown rolls away on a boss kill, baked Metronome and Pillow badges, species idle bits.
import assert from 'node:assert';
import fs from 'node:fs';
import { createArtDraw } from '../../cell_serpent/art_draw.js';
import { crownMotion } from '../../cell_serpent/head_death.js';
const ctx = () => new Proxy(function () {}, { get: (t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : ctx()), set: () => true, apply: () => ctx() });
const kit = createArtDraw((w, h) => ({ width: w, height: h, getContext: () => ctx() }), 1);
// crown motion: finite, starts on the head, lands on the floor below it, bounces, rolls sideways, fades out
let maxY = -1e9, minY = 1e9, hits = 0, prevHit = 0;
for (let u = 0; u <= 1.0001; u += 0.01) {
  const m = crownMotion(u, 100, 1);
  for (const k of ['dx', 'dy', 'rot', 'sc', 'a']) assert(Number.isFinite(m[k]), 'finite ' + k);
  maxY = Math.max(maxY, m.dy); minY = Math.min(minY, m.dy); if (m.hit && !prevHit) hits++; prevHit = m.hit;
}
assert(minY < -20, 'tossed up first (' + minY + ')');
assert(maxY > 60, 'falls to the floor below the head (' + maxY + ')');
assert(hits >= 2, 'two landings flagged: ' + hits);
assert(crownMotion(0, 100, 1).a === 1 && crownMotion(1, 100, 1).a < 0.01, 'fades at the end');
assert(crownMotion(0.9, 100, 1).dx > 200, 'rolls away');
assert.strictEqual(crownMotion(0.9, 100, 1).dx, -crownMotion(0.9, 100, -1).dx, 'mirrored by side');
assert(Math.abs(crownMotion(0.9, 100, 1).dy - crownMotion(0.8, 100, 1).dy) < 1, 'rolls along the floor (no float)');
// the crown is its own baked sprite for every species
for (const sp of Object.keys(kit.SPECIES)) { assert(kit.SPR.crown(sp), 'crown ' + sp); assert.strictEqual(kit.SPR.crown(sp), kit.SPR.crown(sp), 'memoised ' + sp); }
// baked cell badges for the Metronome and Pillow cells
for (const k of ['ward', 'lull', 'metro', 'pillow']) assert(kit.SPR.badge(k), 'badge ' + k);
assert.notEqual(kit.SPR.badge('metro'), kit.SPR.badge('pillow'));
// quiet species idle bits draw at every time without throwing
for (let i = 0; i < 200; i++) for (const sp of Object.keys(kit.SPECIES)) kit.drawHead(ctx(), 0, 0, 30, 1.57, { skin: sp, t: i * 0.05 });
// wiring
const rend = fs.readFileSync(new URL('../../cell_serpent/render.js', import.meta.url), 'utf8');
assert(/k: 'crown'/.test(rend) && /crownMotion/.test(rend), 'render spawns and draws the crown prop');
const cfx = fs.readFileSync(new URL('../../cell_serpent/cellfx.js', import.meta.url), 'utf8');
assert(/s\.metro \? 'metro'/.test(cfx) && /s\.pillow \? 'pillow'/.test(cfx), 'cellfx uses the baked badges');
const ef = fs.readFileSync(new URL('../../cell_serpent/enemy_faces.js', import.meta.url), 'utf8');
assert(/idleBits/.test(ef) && /snore|swells/.test(ef), 'idle bits exist');

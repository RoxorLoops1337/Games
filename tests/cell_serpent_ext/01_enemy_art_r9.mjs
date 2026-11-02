// 01 enemy art r9: per-species head death motion, species stripes/ridges on armor, bomb and mender cells.
import assert from 'node:assert';
import fs from 'node:fs';
import { createArtDraw } from '../../cell_serpent/art_draw.js';
import { deathMotion, deathStyle, DEATH_STYLES } from '../../cell_serpent/head_death.js';
const ctx = () => new Proxy(function () {}, { get: (t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : ctx()), set: () => true, apply: () => ctx() });
const kit = createArtDraw((w, h) => ({ width: w, height: h, getContext: () => ctx() }), 1);
const skins = Object.keys(kit.SPECIES);
// every species has its own death style, all distinct
assert.strictEqual(new Set(skins.map(deathStyle)).size, skins.length, 'one death style per species');
assert.strictEqual(DEATH_STYLES.length, skins.length);
assert.strictEqual(deathStyle('nope'), 'spiral', 'unknown skin falls back');
// motion is finite, bounded, fades out at the end and the paths differ between species
const sig = new Set();
for (const s of skins) {
  let travel = 0;
  for (let u = 0; u <= 1.0001; u += 0.05) {
    const o = deathMotion(s, u, 80, 1);
    for (const k of ['dx', 'dy', 'rot', 'sc', 'a']) assert(Number.isFinite(o[k]), `${s} ${k} finite at ${u}`);
    assert(o.sc >= 0 && o.a >= 0 && o.a <= 1, `${s} sane`);
    travel = Math.max(travel, Math.hypot(o.dx, o.dy));
  }
  assert(deathMotion(s, 1, 80, 1).a < 0.01, `${s} fades out`);
  assert(deathMotion(s, 0, 80, 1).a === 1, `${s} starts opaque`);
  assert(travel > 15, `${s} actually moves (${travel})`);
  const m = deathMotion(s, 0.5, 80, 1);
  sig.add(Math.round(m.dx) + ',' + Math.round(m.dy) + ',' + Math.round(m.rot * 10));
}
assert(sig.size >= 9, 'species paths differ: ' + sig.size);
assert.strictEqual(deathMotion('grumpy', 0.5, 80, 1).dx, -deathMotion('grumpy', 0.5, 80, -1).dx, 'mirrored by side');
// armor/bomb/mender bake for every species, normal and boss
for (const s of skins) for (const k of ['armor', 'bomb', 'mender']) assert(kit.SPR.body(s, false, k) && kit.SPR.body(s, true, k), `${s} ${k} bakes`);
const src = fs.readFileSync('cell_serpent/art_draw.js', 'utf8');
assert((src.match(/EF\.spine\(g, r, P, species/g) || []).length >= 4, 'spine used by normal, armor, bomb and mender');
assert(fs.readFileSync('cell_serpent/render.js', 'utf8').includes('deathMotion('), 'render uses deathMotion');
console.log('01_enemy_art_r9 ok');

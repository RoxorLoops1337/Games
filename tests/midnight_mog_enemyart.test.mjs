// Enemy art smoke test: every enemy x every animation x phases x affixes through a recording mock context.
// Run twice: direct painting (no canvas) and baked painting (fake OffscreenCanvas). Must stay under 10 seconds.
import assert from 'node:assert/strict';
import { makeCtx } from './midnight_mog_mockctx.mjs';
import { ENEMIES } from '../midnight_mog/js/data/enemies.js';
import { ELITE_AFFIXES } from '../midnight_mog/js/data/districts.js';
import * as EA from '../midnight_mog/js/render/enemyart.js';

const t0 = Date.now();
const ANIMS = ['walk', 'attack', 'hit', 'die', 'burrow', 'stun'];
const AFFIXES = ELITE_AFFIXES.map((a) => a.id);

function exerciseAll(label) {
  let calls = 0;
  for (const e of ENEMIES) {
    const phases = e.boss ? Math.max(1, e.phases.length) : 1;
    for (const size of [40, 160]) {
      for (const anim of ANIMS) {
        for (let ph = 0; ph < phases; ph++) {
          for (const animT of [0, 0.37, 1]) {
            const ctx = makeCtx();
            EA.drawEnemy(ctx, e.id, 100, 200, size, { t: 1.37 + animT, anim, animT, phase: ph, hitFlash: animT, facing: ph & 1 ? 1 : -1, seed: ph });
            ctx.assertClean(); calls++;
          }
        }
      }
    }
    // traits and affixes
    for (const aff of [undefined, AFFIXES, AFFIXES[0], AFFIXES[3]]) {
      for (const shield of [undefined, 0, 0.4, 1, true]) {
        const ctx = makeCtx();
        EA.drawEnemy(ctx, e.id, 50, 120, 48, { t: 5.5, affix: aff, shield });
        ctx.assertClean(); calls++;
      }
    }
    const ctx = makeCtx();
    EA.drawEnemyPortrait(ctx, e.id, 10, 10, 120, 150, { t: 2, phase: phases - 1, affix: ['swift'] });
    EA.drawEnemyPortrait(ctx, e.id, 10, 10, 40, 40, {});
    ctx.assertClean(); calls++;
    const an = EA.enemyAnchors(e.id, 40);
    for (const k of ['top', 'cy', 'rx', 'ry', 'scale']) assert.ok(Number.isFinite(an[k]), e.id + ' anchor ' + k);
    assert.equal(EA.enemyScale(e.id), e.size);
  }
  console.log('ok ' + label + ' (' + calls + ' draws)');
}

// robustness: junk input
{
  const ctx = makeCtx();
  EA.drawEnemy(ctx, 'no_such_enemy', NaN, undefined, NaN, { t: NaN, animT: NaN, hitFlash: NaN, phase: NaN, shield: NaN });
  EA.drawEnemy(ctx, 'pigeon_scout', 1, 1, 0, null);
  EA.drawEnemy(ctx, 'pigeon_scout', 1, 1, -5);
  EA.drawEnemyPortrait(ctx, 'no_such_enemy', 0, 0, 0, 0);
  EA.drawEnemyPortrait(ctx, 'king_coo', NaN, 0, 90, 90, { t: NaN });
  ctx.assertClean();
}
assert.equal(EA.ENEMY_IDS.length, 34);
assert.equal(ENEMIES.length, 34);

exerciseAll('direct painting');

// baked path: fake canvases that hand out recording contexts
const made = [];
globalThis.OffscreenCanvas = class {
  constructor(w, h) { this.width = w; this.height = h; this._ctx = makeCtx(w, h); made.push(this._ctx); }
  getContext() { return this._ctx; }
};
EA.clearEnemyArt();
exerciseAll('baked painting');
for (const c of made) c.assertClean();
const st = EA.enemyArtStats();
assert.ok(st.baked > 100, 'baked sprites: ' + st.baked);
assert.ok(made.length > 100);
console.log('baked ' + st.baked + ' sprites, cache ' + st.cached);
delete globalThis.OffscreenCanvas;

const dt = Date.now() - t0;
assert.ok(dt < 10000, 'test took ' + dt + 'ms');
console.log('midnight_mog enemyart: all ok in ' + dt + 'ms');

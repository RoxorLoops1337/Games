// 05 screen moments round 11: ACT pill every 5 stages, stage 50 finale credits, boss-down head, game over cause hint
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const rd = f => readFileSync(join(root, f), 'utf8');
const B = await import(join(root, 'screen_b11.js'));
const { createScreenFx } = await import(join(root, 'screenfx.js'));
const noop = () => {};
const texts = [], heads = [];
const mk = () => {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : /Gradient/.test(String(k)) ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 100 }) : noop), set: (t, k, v) => { t[k] = v; return true; } });
  const S = { t: 0, trauma: 0, flash: 0 };
  return createScreenFx({ ctx, W: 1080, H: 2340, kit: { SPECIES: { love: { lite: '#ff99cc', base: '#f08' } }, drawHead: (...a) => heads.push(a) }, art: null, text: s => texts.push(s), glow: noop, S, OPT: {}, ring: noop, burst: noop });
};
const g = { p: { x: 540, y: 2000 }, snakes: [], phase: 'play', groove: 0, stage: 6, progress: 0.5, skin: 'love', t: 40, faceMax: 0.5, mode: '' };
const run = (fx, gg, n = 200) => { for (let i = 0; i < n; i++) { fx.update(0.016, gg); fx.drawCard(gg); } };

// act helpers: starts on 1, 6 ... 46 only, ten named acts
assert.deepEqual([1, 5, 6, 11, 46, 50].map(B.isActStart), [true, false, true, true, true, false]);
assert.equal(B.actOf(50), 10); assert.equal(B.actOf(6), 2); assert.equal(B.ACTS.length, 10);
assert.equal(B.actTitle(6), 'ACT 2  -  WARM-UP SET');

// the stage card of stage 6 draws the ACT pill, stage 7 and boss 5 do not
{
  const fx = mk(); fx.onEvent({ t: 'stage', n: 6, boss: false, name: 'x' }, g); texts.length = 0; run(fx, g, 40);
  assert.ok(texts.includes('ACT 2  -  WARM-UP SET'));
  assert.ok(fx.takeSounds().includes('star3'));
  const f2 = mk(); f2.onEvent({ t: 'stage', n: 7, boss: false, name: 'x' }, g); texts.length = 0; run(f2, g, 40);
  assert.ok(!texts.some(s => /^ACT /.test(s)));
}

// boss clear: the beaten boss head is drawn; the finale shows FINALE! and rolling credits, and lasts longer
{
  const fx = mk(); fx.onEvent({ t: 'stage', n: 5, boss: true, name: 'b' }, { ...g, stage: 5 }); fx.onEvent({ t: 'won' }, { ...g, stage: 5 });
  heads.length = 0; texts.length = 0; run(fx, g, 60);
  assert.ok(heads.length > 0, 'boss head drawn on the clear card'); assert.equal(fx.state.clear.fin, false);
  const dur5 = fx.state.clear.dur;
  const ff = mk(); ff.onEvent({ t: 'stage', n: 50, boss: true, name: 'b' }, { ...g, stage: 50 }); ff.onEvent({ t: 'won' }, { ...g, stage: 50 });
  assert.equal(ff.state.clear.fin, true); assert.ok(ff.state.clear.dur > dur5 + 4, 'finale card is longer');
  texts.length = 0; run(ff, g, 400);
  assert.ok(texts.includes('FINALE!')); assert.ok(texts.some(s => B.CREDITS.some(l => l[1] === s && l[0])), 'credit lines drawn');
  const nf = mk(); nf.onEvent({ t: 'stage', n: 50, boss: true, name: 'b' }, { ...g, stage: 50 }); nf.onEvent({ t: 'won' }, { ...g, stage: 50, mode: 'pig' });
  assert.ok(!nf.state.clear || !nf.state.clear.fin, 'special modes have no finale');
  // a new stage clears an unfinished card
  ff.onEvent({ t: 'stage', n: 1, boss: false, name: 'x' }, { ...g, stage: 1 }); assert.equal(ff.state.clear, null);
}

// cause hint
{
  const sn = { boss: false };
  assert.match(B.deathCause({ snakes: [sn] }, 'Sour Adder').head, /^SOUR ADDER REACHED THE LINE$/);
  assert.match(B.deathCause({ snakes: [sn, sn] }, 'x').head, /TWO SNAKES/);
  assert.match(B.deathCause({ snakes: [{ boss: true }] }, 'Gloomy Asp').head, /GLOOMY ASP TOOK THE STAGE/);
  assert.match(B.deathCause({ ring: {}, snakes: [sn] }, 'x').head, /CIRCLE/);
  assert.equal(B.deathCause({ mode: 'pig', snakes: [] }, 'x'), null);
  const fx = mk(); fx.onEvent({ t: 'stage', n: 7, boss: false, name: 'Sour Adder' }, g);
  fx.onEvent({ t: 'dead' }, { ...g, stage: 7, snakes: [{ boss: false }] });
  assert.equal(fx.state.cause.head, 'SOUR ADDER REACHED THE LINE');
  texts.length = 0; fx.state.deadT = 1.6; const gd = { ...g, phase: 'dead', snakes: [] };
  for (let i = 0; i < 30; i++) { fx.update(0.016, gd); fx.drawScreen(gd); }
  assert.ok(texts.includes('SOUR ADDER REACHED THE LINE'));
  assert.ok(/deathCauseOf\(g\)/.test(rd('main.js')), 'revive banner uses the cause');
}
for (const f of ['screen_b11.js', 'screenfx.js']) assert.ok(!rd(f).includes('—'), f + ' has no em dash');
console.log('33_screen_moments_b11 ok');

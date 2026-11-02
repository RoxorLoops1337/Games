// Drop the Bass: every recap tip the sim can write has a translation (the UI matches the English sentence, so a reworded
// sentence in sim.js would silently show English in da, nl and de). This test is the guard.
import assert from 'node:assert/strict';
import { ENEMY_TIPS, BOSS_TIPS, FIXED_TIPS } from '../drop_the_bass/js/sim.js';
import { tipText, tipById } from '../drop_the_bass/js/ui_run.js';
import { setLang, loadLang, langReady } from '../drop_the_bass/js/i18n.js';

let n = 0;
const fixed = [
  ...Object.values(ENEMY_TIPS), ...Object.values(BOSS_TIPS),
  'You never merged: drag two turrets of the same level together to double their power.',
  'You never merged past level 3: merge pairs to double power.',
  'You ended with spare coins: turn them into turrets before the wave.',
  'Roxor and Jasmin never played: tap a hero when the stage fills up.',
  'Clean run! Try Hard difficulty or a higher Encore.',
  'Most leaks came from the left lane: build there.', 'Most leaks came from the right lane: build there.', 'Most leaks came from the middle lane: build there.',
  'Most leaks came from the number 4 lane: build there.',
  'Try pairing Kick Cannon with Sub Bass for a synergy bonus.',
];
for (const code of ['da', 'nl', 'de']) {
  setLang(code); await langReady();
  for (const s of fixed) {
    const out = tipText(s);
    assert.ok(out && out !== s, `${code}: recap tip not translated: ${s}`); n++;
    assert.ok(!out.includes(String.fromCharCode(8212)), 'no em dash'); n++;
  }
}
setLang('en'); await langReady();
for (const s of fixed) { assert.equal(tipText(s), s, 'english passes through'); n++; }

// ---- id based tips: every id resolves to the same text as its sentence, in every language; unknown ids return null
{
  const entries = [
    ...Object.keys(ENEMY_TIPS).map((id) => [{ id, vars: {} }, ENEMY_TIPS[id]]),
    ...Object.keys(BOSS_TIPS).map((id) => [{ id, vars: {} }, BOSS_TIPS[id]]),
    ...Object.keys(FIXED_TIPS).map((id) => [{ id, vars: {} }, FIXED_TIPS[id]]),
    [{ id: 'lane', vars: { lane: 'left' } }, 'Most leaks came from the left lane: build there.'],
    [{ id: 'lane', vars: { n: 4 } }, 'Most leaks came from the number 4 lane: build there.'],
    [{ id: 'pair', vars: { a: 'kick', b: 'sub' } }, null],
  ];
  assert.equal(Object.keys(ENEMY_TIPS).length, 10); assert.equal(Object.keys(BOSS_TIPS).length, 7); n += 2;
  for (const code of ['en', 'da', 'nl', 'de']) {
    setLang(code); await langReady();
    for (const [tip, sentence] of entries) {
      const out = tipById(tip);
      assert.ok(out, code + ': id ' + tip.id); n++;
      if (sentence) assert.equal(out, tipText(sentence), code + ': id and sentence agree for ' + tip.id); n++;
      assert.ok(!/\{[a-z]+\}/.test(out), 'placeholders filled'); n++;
    }
  }
  setLang('en'); await langReady();
  assert.equal(tipById({ id: 'nope' }), null); assert.equal(tipById(null), null); assert.equal(tipById({ id: 'lane', vars: {} }), null); n += 3;
  // the sim hands out ids that match its sentences
  const { Run } = await import('../drop_the_bass/js/sim.js');
  const { WORLDS } = await import('../drop_the_bass/js/data_core.js');
  const run = new Run({ world: WORLDS[0].id, seed: 7 });
  run.merges = 0; run.deploys = 6; run.heroUses = 0; run.wave = 4; run.phase = 'lost'; run.synEver = true;
  run.leaksByLane = [5, 1]; run.leakTypeCount = { fuzz: 4 };
  const rc = run.recap();
  assert.ok(Array.isArray(rc.tipIds) && rc.tipIds.length === rc.tips.length && rc.tips.length > 0, 'recap carries tipIds next to tips'); n++;
  assert.ok(rc.tipIds.some((x) => x.id === 'lane' && x.vars.lane === 'left') && rc.tipIds.some((x) => x.id === 'fuzz'), 'lane and enemy ids'); n++;
  rc.tipIds.forEach((x, i) => { assert.equal(tipById(x), rc.tips[i], 'id text equals sentence in English'); n++; });
}
console.log('drop_the_bass recap_tips: ' + n + ' checks passed');

// Drop the Bass: every recap tip the sim can write has a translation (the UI matches the English sentence, so a reworded
// sentence in sim.js would silently show English in da, nl and de). This test is the guard.
import assert from 'node:assert/strict';
import { ENEMY_TIPS, BOSS_TIPS } from '../drop_the_bass/js/sim.js';
import { tipText } from '../drop_the_bass/js/ui_run.js';
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
console.log('drop_the_bass recap_tips: ' + n + ' checks passed');

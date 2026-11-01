// Headless audio gate: no AudioContext in node, so check the name tables and that every export is a safe no-op.
import assert from 'node:assert/strict';
import * as A from '../graftwork/ui/audio.js';

const REQUIRED = ['cardDraw', 'shuffle', 'cardPlay', 'hitSmall', 'hitBig', 'block', 'blockBreak', 'heal', 'loseHp', 'heartbeat', 'burnApply', 'bleedApply', 'poison', 'buff', 'debuff', 'vulnerable', 'weak', 'kill', 'enemyDeath', 'intentReveal', 'graftAttach', 'graftScar', 'tithe', 'overload', 'shatter', 'jam', 'junkAdd', 'gold', 'coin', 'potion', 'relic', 'upgrade', 'uiClick', 'uiHover', 'uiBack', 'error', 'turnEnd', 'turnStart', 'win', 'lose', 'bossIntro', 'echo', 'static', 'rustGrind', 'gilded', 'mapStep', 'restHeal', 'shopBuy', 'eventChime'];
const MODES = ['title', 'ward', 'market', 'theatre', 'boss', 'grafting', 'victory', 'defeat', 'shop', 'forge'];

for (const n of REQUIRED) {
  assert.ok(A.SFX_NAMES.includes(n), 'missing sfx ' + n);
  assert.ok(A.describeSfx(n).startsWith(n + ': '), 'no recipe for ' + n);
}
for (const m of MODES) assert.ok(A.MUSIC_MODES.includes(m), 'missing mode ' + m);
assert.equal(A.analyze().length, A.SFX_NAMES.length);
assert.equal(A.describeSfx('nope'), '');

assert.equal(A.initAudio(), false);
A.setVolumes({ master: 1, sfx: 0.5, music: 0.35 });
A.mute(true); A.mute(false);
for (const n of A.SFX_NAMES) A.sfx(n, { pitch: 1.2, vol: 0.5, pan: -0.3 });
A.sfx('unknown');
for (const m of MODES) A.music(m);
A.duck(300);
A.stopMusic();
console.log('graftwork audio ok: ' + A.SFX_NAMES.length + ' sfx, ' + MODES.length + ' modes');

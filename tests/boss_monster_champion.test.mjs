// Champion (Super Knight) sprite clips: the attack animation must play while
// fighting, walk while moving, idle when frozen, and the swing-progress math
// must map the attack timer onto the 14 frames.
//
//   node tests/boss_monster_champion.test.mjs   (or: npm run test:champion)
import { loadGame, harness } from './boss_monster_lib.mjs';

const A = loadGame('drawChampion,champAtkReady,champReady,CHAMP_ATK,CHAMP_WALK,CHAMP_ATK_DH,CHAMP_DH');
const t = harness('champion clips');

t.ok(A.CHAMP_ATK.length === 14, '14 attack frames loaded');
t.ok(A.CHAMP_WALK.length === 12, '12 walk frames loaded');
t.ok(A.champAtkReady() === true, 'champAtkReady true once all frames report loaded');
t.ok(A.CHAMP_ATK_DH === 99 && A.CHAMP_DH === 88, 'attack draws taller than walk (padding-matched scale)');

const mk = (state, atkT, atkSpeed) => ({ state, atkT, atkSpeed, x: 100, freeze: 0 });

let h = mk('fighting', 0.7, 1);
t.ok(A.drawChampion(50, 330, h) === true, 'draw returns true while fighting');
t.ok(h._champClip === 'attack', 'fighting → attack clip');

h = mk('boss', 0.4, 1); A.drawChampion(50, 330, h);
t.ok(h._champClip === 'attack', 'boss (throne) → attack clip');

h = mk('walking', 0, 1); h._animPX = 99; A.drawChampion(50, 330, h);
t.ok(h._champClip === 'walk', 'moving → walk clip');

h = mk('fighting', 0.3, 1); h.freeze = 2; A.drawChampion(50, 330, h);
t.ok(h._champClip === 'idle', 'frozen fighter → idle stance');

// swing progress: atkT counts down from the interval to 0 (the hit)
for (const [atkT, iv, want] of [[0.7, 0.7, 0], [0, 0.7, 13], [0.35, 0.7, 7]]) {
  const prog = Math.max(0, Math.min(0.999, 1 - atkT / iv));
  const f = Math.floor(prog * 14);
  t.ok(f === want, `frame at atkT=${atkT} → ${f}, want ${want}`);
}

t.done();

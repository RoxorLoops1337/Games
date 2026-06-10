// Champion (Super Knight) sprite clips: the attack animation must play while
// fighting, walk while moving, idle when frozen, and the swing-progress math
// must map the attack timer onto the 14 frames.
//
//   node tests/no_room_for_heroes_champion.test.mjs   (or: npm run test:champion)
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const A = loadGame('drawChampion,champAtkReady,champReady,championTick,CHAMP_ATK,CHAMP_WALK,CHAMP_ATK_DH,CHAMP_DH');
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

// Berserker recomputes atk every frame from _atkBase — boss debuffs (Curse,
// Dread) must survive that recompute instead of being silently wiped.
const bz = () => ({ champion: 'berserker', hp: 100, maxHp: 100, _atkBase: 20, atk: 20, shieldT: 0 });
let z = bz(); A.championTick(z, 0.1);
t.ok(z.atk === 20, 'full-HP berserker sits at base atk');
z.hp = 50; A.championTick(z, 0.1);
t.ok(z.atk === 26, 'berserker enrages as HP drops (+60% at 0 HP → +30% at half)');
z = bz(); z.cursed = true; A.championTick(z, 0.1);
t.ok(z.atk === 11, 'Curse (×0.55) survives the berserker recompute');
z = bz(); z.dreaded = true; A.championTick(z, 0.1);
t.ok(z.atk === 14, 'Dread (×0.7) survives the berserker recompute');
z = bz(); z.cursed = true; z.dreaded = true; A.championTick(z, 0.1);
t.ok(Math.abs(z.atk - 7.7) < 0.01, 'Curse + Dread stack on a berserker');

t.done();

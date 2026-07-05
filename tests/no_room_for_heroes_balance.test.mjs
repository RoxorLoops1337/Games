// Status-resistance balance: the freeze+oil (+Inferno burn) lock got tamed with
// level-scaled CC resistance, a champion/elite/ward bonus, a no-refreeze window
// and a burn cap. These assert the STRUCTURE (relative behaviour), not exact
// numbers, so the owner can keep tuning the dials without breaking the suite.
//
//   node tests/no_room_for_heroes_balance.test.mjs   (or: npm run test:boss)
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const A = loadGame(`freshGame,statusResist,ccDur,applyFreeze,addBurn,BURN_CAP,burnCap,FREEZE_IMMUNE,campLevel,
  heroDmg,ABIL,chooseBoss,heroDies,awardRunes,EDICTS,
  get RUNES(){return RUNES;},set RUNES(v){RUNES=v;},
  get G(){return G;},set G(v){G=v;}`);
const t = harness('balance: CC resist');

A.G = A.freshGame('campaign');
const grunt = {};
const champ = {champion:'paladin'};
const elite = {elite:true};

// early siege: heroes barely resist (first runs stay brutal)
A.G.levelIdx = 0;
const r1 = A.statusResist(grunt);
t.ok(r1 < 0.05, `level 1 grunt barely resists (${r1.toFixed(2)})`);
t.ok(A.statusResist(champ) > A.statusResist(grunt), 'champions resist more than grunts');
t.ok(A.statusResist(elite) > A.statusResist(grunt), 'elites resist more than grunts');
t.ok(A.statusResist({king:true}) > A.statusResist(champ), 'the King shrugs off CC harder than a champion');

// deep into the siege: heroes toughen up
A.G.levelIdx = 40;
const rDeep = A.statusResist(grunt);
t.ok(rDeep > r1, `resistance grows deep into the siege (${rDeep.toFixed(2)})`);
t.ok(rDeep <= 0.78, 'resistance stays capped (never fully immune)');

// 🧙 Wizard ward adds protection
t.ok(A.statusResist({wardT:5}) > A.statusResist(grunt), 'a warded hero resists more');

// ccDur shortens control durations for resistant heroes
t.ok(A.ccDur(champ, 2.0) < 2.0, 'ccDur shortens control for a resistant hero');

// applyFreeze: a fresh hero freezes; one inside the no-refreeze window does not
A.G.levelIdx = 0;
const h = {};
t.ok(A.applyFreeze(h, 1.4) === true && h.freeze > 0, 'a fresh hero can be frozen');
const locked = {refreezeT: 2};
t.ok(A.applyFreeze(locked, 1.4) === false && !(locked.freeze > 0), 'a hero in the refreeze window cannot be re-frozen');
t.ok(A.FREEZE_IMMUNE > 0, 'there is a post-thaw refreeze-immunity window');

// burn cap: re-Ignite can't snowball past the ceiling (base = BURN_CAP at level 1)
const hb = {burn: 0};
for (let i = 0; i < 12; i++) A.addBurn(hb, 10, 3);
t.ok(hb.burn === A.BURN_CAP, `stacked burn is capped at BURN_CAP (${hb.burn})`);

// --- 🔥 burnCap() scales with the siege so burn doesn't cliff late ---
t.ok(A.burnCap() === A.BURN_CAP, 'level 1: the burn ceiling is the base cap');
A.G.levelIdx = 39;                                   // campaign level 40
t.ok(A.burnCap() === A.BURN_CAP + Math.floor(40*0.6), `level 40: ceiling grows to ${A.burnCap()}`);
const hb2 = {burn: 0};
for (let i = 0; i < 40; i++) A.addBurn(hb2, 10, 3);
t.ok(hb2.burn === A.burnCap(), 'addBurn caps at the SCALED ceiling deep in the siege');
A.G = A.freshGame('endless'); A.G.totalSlain = 150;
t.ok(A.burnCap() === A.BURN_CAP + Math.floor(Math.min(60,150/5)*0.6), 'endless scales the ceiling by kills');

// --- 🛡️ armor floor: mitigation caps at 65% — flat armor can't min-1 a lvl5 trap ---
t.ok(A.heroDmg({armor:5},  20) === 15, 'light armor still subtracts normally');
t.ok(A.heroDmg({armor:18}, 20) === 7,  'heavy armor hits the 65% floor (20 raw → 7, not 2)');
t.ok(A.heroDmg({armor:99}, 20) === 7,  'absurd armor cannot push past the floor');
t.ok(A.heroDmg({armor:18}, 20, 'full') === 20, "full pierce still ignores armor entirely");
t.ok(A.heroDmg({armor:18}, 20, true) === 7, 'arrow-style pierce keeps its discount but the floor still applies');

// --- 😋 Devour is gated off champions & the King (no more skipping the finale) ---
A.G = A.freshGame('campaign'); A.chooseBoss('dragon');
const champH = {state:'walking', hp:580, maxHp:2000, armor:0, dodge:0, traits:[], cls:'warrior',
                champion:'knight', x:100, y:330, gold:0, bounty:0};
A.ABIL.devour.run(champH);                           // 29% HP — the execute range
t.ok(champH.state !== 'dead' && champH.hp > 0, 'a low-HP CHAMPION survives Devour (deep bite, no execute)');
t.ok(champH.hp < 580, 'the champion still takes real bite damage');
const kingH = {state:'walking', hp:580, maxHp:2000, armor:0, dodge:0, traits:[], cls:'warrior',
               king:true, x:100, y:330, gold:0, bounty:0};
A.ABIL.devour.run(kingH);
t.ok(kingH.state !== 'dead' && kingH.hp > 0, 'the KING survives Devour too');
const gruntH = {state:'walking', hp:580, maxHp:2000, armor:0, dodge:0, traits:[], cls:'warrior',
                x:100, y:330, gold:0, bounty:0};
A.ABIL.devour.run(gruntH);
t.ok(gruntH.state === 'dead', 'a low-HP grunt is still devoured whole');

// --- 🔮 Mana Siphon refunds from damage DEALT, capped at half its cost ---
A.G = A.freshGame('campaign'); A.chooseBoss('dragon');
const cap = Math.round(A.ABIL.siphon.cost * 0.5);
A.G.boss.mana = 0;
A.ABIL.siphon.run({state:'walking', hp:5000, maxHp:5000, armor:0, dodge:0, traits:[], cls:'rogue', x:100, y:330});
t.ok(A.G.boss.mana > 0 && A.G.boss.mana <= cap, `siphon refund is positive and capped at cost/2 (${A.G.boss.mana} ≤ ${cap})`);
A.G.boss.mana = 0;
A.ABIL.siphon.run({state:'walking', hp:5000, maxHp:5000, armor:0, dodge:1, traits:[], cls:'rogue', x:100, y:330});
t.ok(A.G.boss.mana === 0, 'a dodged siphon refunds NOTHING (no free mana)');

// --- ᚱ rune pacing: multipliers sweeten DROPS only; level progress pays flat ---
A.G = A.freshGame('campaign');
A.G.levelIdx = 10; A.G.drops.runes = 8; A.G.edicts = ['ironHorde'];   // reward ×1.3
A.RUNES = {points:0, ranks:{}, kills:0, bossXp:{}, best:0, asc:0, stats:{}, unlocked:{}, gf:1};
const dRunes = A.awardRunes();
t.ok(dRunes === Math.floor(8*1.3) + 10, `edict multiplier applies to drops only (${dRunes} = floor(8×1.3)+10, not floor(18×1.3))`);

// --- 👑 a champion kill guarantees a rune drop + queues its relic as a COUNTER ---
A.G = A.freshGame('campaign'); A.chooseBoss('dragon');
const r0 = A.G.drops.runes, rd0 = A.G.relicDue || 0;
A.heroDies({state:'walking', hp:0, maxHp:100, armor:0, traits:[], cls:'warrior', champion:'knight',
            x:50, y:330, gold:5, bounty:2});
t.ok(A.G.drops.runes >= r0 + 1, 'a slain champion always drops at least one rune');
t.ok(A.G.relicDue === rd0 + 1, 'the champion relic queues as a counter increment (stackable)');

t.done();

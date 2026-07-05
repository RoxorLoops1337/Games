// Status-resistance balance: the freeze+oil (+Inferno burn) lock got tamed with
// level-scaled CC resistance, a champion/elite/ward bonus, a no-refreeze window
// and a burn cap. These assert the STRUCTURE (relative behaviour), not exact
// numbers, so the owner can keep tuning the dials without breaking the suite.
//
//   node tests/no_room_for_heroes_balance.test.mjs   (or: npm run test:boss)
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const A = loadGame(`freshGame,statusResist,ccDur,applyFreeze,addBurn,BURN_CAP,burnCap,FREEZE_IMMUNE,campLevel,
  heroDmg,ABIL,chooseBoss,heroDies,awardRunes,EDICTS,dailyKey,dailyMod,
  castAbility,abilTarget,buildHeroFromSpec,trapTick,dealToHero,ROOMS,TRAITS,TRAIT_KEYS,
  set _aimHero(v){_aimHero=v;},set _aimAt(v){_aimAt=v;},set _simTick(v){_simTick=v;},
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
// the daily bounty is date-keyed: pre-claim today's flat bonus and fold a possible
// Rune Tide day (×1.5 on drops) into the expectation so the assert never flakes
global.localStorage.setItem('bm_daily_1', A.dailyKey());
const dMul = A.dailyMod().id === 'runes' ? 1.5 : 1;
const dRunes = A.awardRunes();
t.ok(dRunes === Math.floor(8*1.3*dMul) + 10, `edict multiplier applies to drops only (${dRunes} = floor(8×1.3×${dMul})+10, not floor(18×1.3×${dMul}))`);

// --- 👑 a champion kill guarantees a rune drop + queues its relic as a COUNTER ---
A.G = A.freshGame('campaign'); A.chooseBoss('dragon');
const r0 = A.G.drops.runes, rd0 = A.G.relicDue || 0;
A.heroDies({state:'walking', hp:0, maxHp:100, armor:0, traits:[], cls:'warrior', champion:'knight',
            x:50, y:330, gold:5, bounty:2});
t.ok(A.G.drops.runes >= r0 + 1, 'a slain champion always drops at least one rune');
t.ok(A.G.relicDue === rd0 + 1, 'the champion relic queues as a counter increment (stackable)');

/* ================= Batch E: smart targeting + behavioral traits ================= */
const mkSpec = over => ({cls:'warrior', power:5, traits:[], name:'T', debuff:{atkMul:1,burn:0,robbed:false}, ...over});
const stage = fr => { const h=A.buildHeroFromSpec(mkSpec()); h.hp=Math.round(h.maxHp*fr); return h; };

// --- 🎯 Devour picks the LOWEST hp% hero, not the front-most ---
A.G = A.freshGame('campaign'); A.chooseBoss('dragon');
A.G.phase = 'run';
A.G.boss.abil = [{id:'devour',cd:0},{id:'freeze',cd:0},{id:'curse',cd:0}];
A.G.boss.maxMana = 999; A.G.boss.mana = 999;
const front = stage(0.9), wounded = stage(0.2);
front.x = 300; wounded.x = 100;                       // the wounded one is NOT the lead
A.G.heroes = [front, wounded];
A.castAbility(0);
t.ok(wounded.state === 'dead', 'Devour executes the LOWEST-hp% hero (not the lead)');
t.ok(front.state !== 'dead', 'the healthy front hero is spared');

// --- ❄️ Freeze picks the hero CLOSEST to the throne (max x) ---
A.G.boss.mana = 999; A.G.boss.abil[1].cd = 0;
const near = stage(1), far = stage(1);
near.x = 500; far.x = 120;
A.G.heroes = [near, far];
A.castAbility(1);
t.ok(near.freeze > 0 && !(far.freeze > 0), 'Freeze locks the hero closest to the throne');

// --- 🟣 Curse picks the highest-ATK hero ---
A.G.boss.mana = 999; A.G.boss.abil[2].cd = 0;
const weak = stage(1), strong = stage(1);
weak.x = 400; strong.x = 100; strong.atk = weak.atk * 3;
A.G.heroes = [weak, strong];
A.castAbility(2);
t.ok(strong.cursed === true && !weak.cursed, 'Curse defangs the highest-ATK hero');

// --- ⚔️ a Smite tap-aim primes the NEXT single-target cast, then is consumed ---
A.G.boss.mana = 999; A.G.boss.abil[1].cd = 0;
const a1 = stage(1), a2 = stage(1);
a1.x = 500; a2.x = 120;
A.G.heroes = [a1, a2];
A._aimHero = a2; A._aimAt = performance.now();
A.castAbility(1);                                     // freeze would pick a1 (max x) — the aim wins
t.ok(a2.freeze > 0 && !(a1.freeze > 0), 'a recent tap-aim overrides the pick for one cast');
A.G.boss.mana = 999; A.G.boss.abil[1].cd = 0;
a1.freeze = 0; a2.freeze = 0;
A.castAbility(1);
t.ok(a1.freeze > 0, 'the aim is consumed — the next cast falls back to the pick');

// --- 👁️ Trap-sense: the FIRST trap strike in each room is ignored, per room ---
A.G = A.freshGame('campaign'); A.chooseBoss('dragon'); A.G.phase = 'run';
const ts = A.buildHeroFromSpec(mkSpec({traits:['trapsense']}));
ts.hp = ts.maxHp = 100000; ts.dodge = 0;
const mkCell = idx => ({index:idx, x0:idx*260, x1:(idx+1)*260, syn:1,
  room:{kills:0, units:[], def:A.ROOMS.spike},
  traps:[{type:'spike', def:A.ROOMS.spike, lvl:1, fireT:0, stackMul:1}]});
let _tick = 1;
const fire = (h, cell) => { A._simTick = _tick++; cell.traps[0].fireT = 0; A.trapTick(h, cell, 0.016); };
const c0 = mkCell(0), c1 = mkCell(1);
const hpA = ts.hp;
fire(ts, c0);
t.ok(ts.hp === hpA, 'trap-sense: the first strike in a room is SENSED (no damage)');
fire(ts, c0);
t.ok(ts.hp < hpA, 'the second strike in the same room lands');
const hpB = ts.hp;
fire(ts, c1);
t.ok(ts.hp === hpB, 'a NEW room re-arms the sense (first strike ignored again)');
t.ok(A.TRAIT_KEYS.includes('trapsense') && A.TRAIT_KEYS.includes('phalanx') && A.TRAIT_KEYS.includes('martyr'),
  'the three behavioral traits are in the elite roll pool');
t.ok(['trapsense','phalanx','martyr'].every(k => A.TRAITS[k].beh && A.TRAITS[k].desc.length > 10),
  'behavioral traits carry a tooltip-facing desc');

// --- 🔰 Phalanx: 25% less damage while ≥2 living heroes share the room ---
const ph = A.buildHeroFromSpec(mkSpec({traits:['phalanx']}));
ph.hp = ph.maxHp = 100000; ph.dodge = 0; ph.cellIndex = 2;
A.G.heroes = [ph];
const _rand = Math.random; Math.random = () => 0.5;   // deterministic: no crit, no dodge roll flake
let hp0 = ph.hp; A.dealToHero(ph, 100, 'HIT', 'full', 'phys', true);
const solo = hp0 - ph.hp;
const buddy = A.buildHeroFromSpec(mkSpec()); buddy.cellIndex = 2;
A.G.heroes = [ph, buddy];
hp0 = ph.hp; A.dealToHero(ph, 100, 'HIT', 'full', 'phys', true);
const braced = hp0 - ph.hp;
Math.random = _rand;
t.ok(solo === 100 && braced === 75, `phalanx cuts damage 25% with a roommate (${solo} solo → ${braced} braced)`);

// --- ✟ Martyr: its death heals every living ally 15% max HP ---
A.G = A.freshGame('campaign'); A.chooseBoss('dragon');
const mart = A.buildHeroFromSpec(mkSpec({traits:['martyr']}));
const ally = A.buildHeroFromSpec(mkSpec());
const allyHp0 = Math.round(ally.maxHp * 0.5);
ally.hp = allyHp0;
A.G.heroes = [mart, ally];
mart.hp = 0; A.heroDies(mart);
t.ok(Math.abs(ally.hp - (allyHp0 + ally.maxHp * 0.15)) < 1.01, `martyr death heals the living ally 15% max HP (${allyHp0} → ${Math.round(ally.hp)})`);
t.ok(mart.state === 'dead', '(sanity) the martyr itself still dies');

t.done();

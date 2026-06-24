// Unlocks overhaul: every gated boss/room earns its way in through a DISTINCT feat
// (burn N heroes, freeze N, cast N abilities, hoard N relics…) instead of one shared
// lifetime-kill counter. Existing saves are grandfathered once so nobody regresses.
//
//   node tests/no_room_for_heroes_unlocks.test.mjs   (or: npm run test:boss)
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const A = loadGame(`freshGame,chooseBoss,bossUnlocked,cardUnlocked,bumpStat,statVal,
  saveRunes,loadRunes,awardRunes,grandfatherUnlocks,
  get RUNES(){return RUNES;},set RUNES(v){RUNES=v;},
  get UNLOCK_BOSS_COND(){return UNLOCK_BOSS_COND;},get UNLOCK_CARD_COND(){return UNLOCK_CARD_COND;},
  get G(){return G;},set G(v){G=v;}`);
const t = harness('unlocks (feats)');

const fresh = () => { A.RUNES = { points:0, ranks:{}, kills:0, bossXp:{}, best:0, asc:0, stats:{}, unlocked:{}, gf:1 }; };

// --- a fresh profile: gated content is LOCKED, ungated content is always open ---
fresh();
t.ok(A.bossUnlocked('dragon')===true && A.bossUnlocked('demon')===true, 'starter bosses are always unlocked');
t.ok(A.bossUnlocked('ogre')===false && A.bossUnlocked('ent')===false && A.bossUnlocked('golem')===false, 'gated bosses start locked');
t.ok(A.cardUnlocked('spike')===true && A.cardUnlocked('warcamp')===true, 'ungated cards are always unlocked');
t.ok(A.cardUnlocked('frost')===false && A.cardUnlocked('bombard')===false, 'gated cards start locked');

// --- the ogre/dragon name-collision (key in BOTH bosses & rooms) must NOT cross-gate ---
t.ok(A.cardUnlocked('ogre')===true, 'the Ogre Lair CARD is not gated by the ogre BOSS feat');
t.ok(A.bossUnlocked('dragon')===true, 'the Ignar BOSS is not gated by the Drakeling CARD feat');

// --- earning a feat unlocks exactly its item, nothing else ---
A.bumpStat('frozen', A.UNLOCK_CARD_COND.frost.n);
t.ok(A.cardUnlocked('frost')===true, 'freezing enough heroes unlocks Frost');
t.ok(A.cardUnlocked('bombard')===false, 'an unrelated feat stays locked');

A.bumpStat('throne', A.UNLOCK_BOSS_COND.ogre.n - 1);
t.ok(A.bossUnlocked('ogre')===false, 'one short of the feat stays locked');
A.bumpStat('throne', 1);
t.ok(A.bossUnlocked('ogre')===true, 'crossing the throne-breaker feat unlocks the Ogre boss');

// --- the headline promise: ~15 genuinely DIFFERENT unlock feats ---
const conds = [...Object.values(A.UNLOCK_BOSS_COND), ...Object.values(A.UNLOCK_CARD_COND)];
const distinct = new Set(conds.map(c => c.stat));
t.ok(distinct.size >= 15, `at least 15 distinct unlock feats (${distinct.size})`);
t.ok(conds.every(c => c.label && c.n > 0), 'every feat has a label + a positive target');

// --- awardRunes banks a freshly-MET feat into RUNES.unlocked (sticky) and announces it once ---
A.RUNES = { points:0, ranks:{}, kills:0, bossXp:{}, best:0, asc:0, stats:{ relics:30 }, unlocked:{}, gf:1 };
A.G = A.freshGame('endless'); A.chooseBoss('dragon');
A.awardRunes();
t.ok(A.RUNES.unlocked.hexward===true, 'awardRunes makes a met feat sticky in RUNES.unlocked');
t.ok((A.G.newUnlocks||[]).some(u => u.key==='hexward'), 'awardRunes announces the new unlock');
A.awardRunes();
t.ok(!(A.G.newUnlocks||[]).some(u => u.key==='hexward'), 'an already-earned unlock is not re-announced');

// --- feat counters + earned unlocks + the grandfather flag survive a save/load round-trip ---
A.RUNES = { points:0, ranks:{}, kills:5, bossXp:{}, best:0, asc:0, stats:{ burned:7, frozen:3 }, unlocked:{ frost:true }, gf:1 };
A.saveRunes();
A.RUNES = { points:0, ranks:{}, kills:0, bossXp:{}, stats:{}, unlocked:{}, gf:0 };
A.loadRunes();
t.ok(A.statVal('burned')===7 && A.statVal('frozen')===3, 'feat counters persist through save/load');
t.ok(A.RUNES.unlocked.frost===true, 'earned unlocks persist through save/load');
t.ok(A.cardUnlocked('frost')===true && A.cardUnlocked('bombard')===false, 'persisted unlock honored; others stay locked');

// --- one-time grandfather: a kill-earning veteran keeps everything; no future passive unlocks ---
A.RUNES = { points:0, ranks:{}, kills:200, bossXp:{}, best:0, asc:0, stats:{}, unlocked:{}, gf:0 };
A.grandfatherUnlocks();
t.ok(A.RUNES.gf===1, 'grandfather runs once then sets its flag');
t.ok(A.bossUnlocked('ogre')===true && A.bossUnlocked('ent')===true && A.bossUnlocked('golem')===true, 'a 200-kill veteran keeps every kill-earned boss');
t.ok(A.cardUnlocked('frost')===true && A.cardUnlocked('gallows')===true, 'and keeps kill-earned cards (no regression)');
t.ok(A.cardUnlocked('runestone')===false, 'content above the veteran’s kills must still be earned by feat');
A.RUNES.kills = 99999;
A.grandfatherUnlocks();
t.ok(A.cardUnlocked('runestone')===false, 'grandfather is a one-time snapshot — later kills never passively unlock');

// --- a brand-new player grandfathers NOTHING (must earn every feat) ---
A.RUNES = { points:0, ranks:{}, kills:0, bossXp:{}, best:0, asc:0, stats:{}, unlocked:{}, gf:0 };
A.grandfatherUnlocks();
t.ok(A.bossUnlocked('ogre')===false && Object.keys(A.RUNES.unlocked).length===0, 'a fresh profile earns everything via feats');

t.done();

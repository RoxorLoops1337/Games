// Status-resistance balance: the freeze+oil (+Inferno burn) lock got tamed with
// level-scaled CC resistance, a champion/elite/ward bonus, a no-refreeze window
// and a burn cap. These assert the STRUCTURE (relative behaviour), not exact
// numbers, so the owner can keep tuning the dials without breaking the suite.
//
//   node tests/no_room_for_heroes_balance.test.mjs   (or: npm run test:boss)
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const A = loadGame(`freshGame,statusResist,ccDur,applyFreeze,addBurn,BURN_CAP,FREEZE_IMMUNE,campLevel,
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

// burn cap: re-Ignite can't snowball past BURN_CAP
const hb = {burn: 0};
for (let i = 0; i < 12; i++) A.addBurn(hb, 10, 3);
t.ok(hb.burn === A.BURN_CAP, `stacked burn is capped at BURN_CAP (${hb.burn})`);

t.done();

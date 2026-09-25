// Clawspire -- balance invariants (fast, no physics).
//
// Pins the numbers the balance pass tuned with a whole-run bot, without
// playing whole runs. Fights are simulated with COMBAT only and an "average
// grab" model: each grab delivers 0, 1 or 2 items at a human hand's
// per-character rates (MODELS below, a notch under what the physics bot
// measured, so the survival floors hold for real players), and each delivered item is
// the best of a random 3-item sample of the bin (the claw only reaches the
// top of the pile). Decks: act 1 is the starting bin; later acts add what
// a run collects before them (see deckFor); elites sit mid act, bosses at
// its end.
import { boot, harness } from './clawspire_lib.mjs';

const h = harness('clawspire balance');
const T0 = Date.now();
const CS = boot({ only: ['util', 'data', 'combat'] });
const { DATA, COMBAT, U } = CS;
// DIFF='{"hp":2.6,"dmg":1.4}' overrides DATA.DIFFICULTY for what-if runs.
if (process.env.DIFF && DATA.DIFFICULTY) Object.assign(DATA.DIFFICULTY, JSON.parse(process.env.DIFF));
const CHARS = ['knight', 'alchemist', 'rogue'];
const FIGHTS = 200;
// Items per drop by character for a human hand: 0.85 knight (long swords
// slip), 0.88 alchemist (glass), 1.12 rogue (small things come up in pairs).
// About 25% over the pre-cradle rig (0.65 / 0.7 / 0.9): the claw now scoops
// r 9-11 fillers in twos and threes, so a landed grab brings a second item
// about 30% of the time (p2 / (1 - p0): 0.31 / 0.29 / 0.37).
// MODEL='{"knight":{"p0":..,"p2":..},..}' overrides for what-if runs.
// Basket claw (measured on the bench with perfect aim: 95-99% singles, 70-90%
// doubles); the human model below keeps a margin: 12-15% misses, ~55% doubles.
const MODELS = JSON.parse(process.env.MODEL || 'null') || {
  knight: { p0: 0.15, p2: 0.5 }, alchemist: { p0: 0.14, p2: 0.5 }, rogue: { p0: 0.1, p2: 0.55 },
};
const SAMPLE = 3, MAX_TURNS = 40;
let MODEL = MODELS.knight;

// ------------------------------------------------------------ fight model
const fxOf = (def, plus) => (plus && def.plus && def.plus.fx) ? def.plus.fx : (def.fx || []);

// How much playing inst is worth right now (the bot's greedy policy).
function value(F, inst, sit) {
  const def = DATA.ITEMS[inst.id];
  if (!def || inst.junk || def.rarity === 'junk') return -2;
  if (inst.frozen) return 0.5;
  const al = F.enemies.filter(e => e.alive);
  let dmg = def.target === 'all' ? 0 : COMBAT.previewDamage(F, def, inst.plus);
  let blk = 0, heal = 0, util = 0;
  for (const f of fxOf(def, inst.plus)) {
    const x = f.v || 0;
    switch (f.k) {
      case 'dmg': if (def.target === 'all') dmg += Math.max(0, x + (F.player.status.str || 0)) * (f.n || 1) * al.length; break;
      case 'block': blk += x; break;
      case 'heal': heal += x; break;
      case 'lifesteal': heal += x * 0.8; break;
      case 'status': {
        const n = f.to === 'all' ? al.length : 1;
        if (f.to === 'self' && (f.s === 'burn' || f.s === 'poison')) util -= x * 2;
        else if (f.s === 'poison' || f.s === 'burn') util += x * 1.8 * n;
        else if (f.s === 'bleed') util += x * 1.5;
        else if (f.s === 'chill') util += x * 2 * n;
        else if (f.s === 'weak') util += f.to === 'self' ? 0 : Math.min(2, x) * Math.max(1, 0.25 * sit.incoming) * n;
        else if (f.s === 'vuln') util += x * 3;
        else if (f.s === 'str') util += x * 5;
        else if (f.s === 'dodge') util += x * Math.max(3, sit.maxHit);
        else if (f.s === 'regen') heal += x * (x + 1) / 2;
        break;
      }
      case 'grab': util += 6 * x; break;
      case 'gold': util += x * 0.2; break;
      case 'ink': util += 3 * x; break;
      case 'maxhp': util += 2 * x; break;
      case 'copy': util += 4; break;
      case 'purge': util += 2 * Math.min(f.n || 1, sit.junk); break;
      case 'cleanse': util += 3 * sit.debuffs; break;
      case 'poisonAll': for (const e of al) util += (e.status.poison || 0); break;
      case 'junk': util -= 2 * (f.n || 1); break;
      default: break;
    }
  }
  const tgt = sit.target;
  if (tgt && dmg >= tgt.hp + tgt.block) dmg += 12;
  const need = Math.max(0, sit.incoming - F.player.block);
  const bv = Math.min(blk, need) * (need >= 8 ? 1.3 : 1) + Math.max(0, blk - need) * 0.1;
  const hpF = F.player.hp / F.player.maxHp;
  const hv = Math.min(heal, F.player.maxHp - F.player.hp) * (hpF < 0.4 ? 1.5 : hpF < 0.7 ? 0.6 : 0.1);
  return dmg + bv + hv + util;
}

// Incoming damage, and the target: a charging enemy first, else the weakest.
function situation(F) {
  const al = F.enemies.filter(e => e.alive);
  let incoming = 0, maxHit = 0;
  for (const e of al) {
    if (e.status.freeze || e.status.stun) continue;
    const d = COMBAT.intentDmg(F, e);
    if (d) { incoming += d.v * d.n; maxHit = Math.max(maxHit, d.v); }
  }
  let ti = -1, best = 1e9;
  F.enemies.forEach((e, i) => {
    if (!e.alive) return;
    const s = (e.charged > 0 || (e.intent && e.intent.k === 'charge') ? -1000 : 0) + e.hp + e.block;
    if (s < best) { best = s; ti = i; }
  });
  if (ti >= 0) COMBAT.setTarget(F, ti);
  return {
    incoming, maxHit, target: F.enemies[F.target], junk: F.bin.filter(i => COMBAT.isJunk(i)).length,
    debuffs: ['weak', 'vuln', 'poison', 'burn', 'chill', 'bleed'].filter(s => F.player.status[s]).length,
  };
}

// Items one grab delivers. Grease and fog make the claw worse.
function delivered(F, rng) {
  let p0 = MODEL.p0, p2 = MODEL.p2;
  if (F.player.status.grease) { p0 = Math.min(0.9, p0 * 1.8); p2 = 0; }
  if (F.player.status.fog) p0 = Math.min(0.9, p0 * 1.3);
  const x = rng();
  return x < p0 ? 0 : x < 1 - p2 ? 1 : 2;
}

function fight(run, enemyIds, seed) {
  const rng = U.rng(seed);
  const F = COMBAT.newFight(run, enemyIds, U.rng(seed ^ 0x9e3779b9));
  let guard = 0;
  while (F.phase !== 'over' && F.turn <= MAX_TURNS && guard++ < 2000) {
    while (F.phase === 'player' && F.player.grabs > 0) {
      COMBAT.useGrab(F);
      const n = delivered(F, rng);
      for (let k = 0; k < n && F.phase === 'player' && F.bin.length; k++) {
        const sit = situation(F);
        const pool = rng.shuffle(F.bin.slice()).slice(0, SAMPLE);
        let best = pool[0], bv = -1e9;
        for (const inst of pool) { const v = value(F, inst, sit); if (v > bv) { bv = v; best = inst; } }
        COMBAT.play(F, best, F.target);
      }
      if (F.phase === 'player') COMBAT.grabDone(F, n);
    }
    if (F.phase === 'player') COMBAT.endTurn(F);
  }
  return { result: F.phase === 'over' ? F.result : 'timeout', turns: F.turn, lost: run.hp - F.player.hp };
}

// A plausible run state before a fight that comes after `picks` rewards
// (PER_ACT per act, the fights a 35% reveal share walks into). Each
// finished act also brings two upgrades, an Extra Token (rests and shops buy
// it first) and two relics (a treasure and the boss relic).
const PER_ACT = 8;
function deckFor(char, act, seed, picks) {
  const c = DATA.CHARACTERS[char];
  const rng = U.rng(seed);
  const bin = c.bin.map(id => ({ id, plus: false }));
  const relics = [c.relic];
  const RAR = { c: 0, u: 1, r: 2, l: 3 };
  let acts = 0;
  for (let a = 1, made = 0; made < picks; a++) {
    for (let k = 0; k < PER_ACT && made < picks; k++, made++) {
      const ids = DATA.rewardItems(rng, a, char, 3);
      ids.sort((x, y) => RAR[DATA.ITEMS[y].rarity] - RAR[DATA.ITEMS[x].rarity]);
      // A bag adds its contents, as the game does.
      if (ids.length) for (const id of (DATA.ITEMS[ids[0]].bag || [ids[0]])) bin.push({ id, plus: false });
    }
    if (made % PER_ACT === 0) {
      acts++;
      let up = 0;
      for (const inst of bin) { if (up >= 2) break; if (!inst.plus && DATA.ITEMS[inst.id].starter) { inst.plus = true; up++; } }
      for (const rar of ['c', 'u']) { const pool = DATA.relicPool(rar, relics); if (pool.length) relics.push(rng.pick(pool)); }
    }
  }
  const claw = Object.assign({}, c.claw);
  claw.grabs += Math.min(2, acts);
  return { hp: c.hp, maxHp: c.hp, act, bin, relics, claw };
}

// Every encounter, every character, FIGHTS fights each.
const R = {};   // R[char][act][tier] = [{enc, win, turns, lost}]
for (const ch of CHARS) {
  R[ch] = {};
  MODEL = MODELS[ch];
  for (const act of [1, 2, 3]) {
    R[ch][act] = {};
    for (const tier of ['normal', 'elite', 'boss']) {
      R[ch][act][tier] = DATA.ENCOUNTERS[act][tier].map((enc) => {
        let w = 0, turns = 0, lost = 0, maxHp = DATA.CHARACTERS[ch].hp;
        for (let i = 0; i < FIGHTS; i++) {
          const picks = PER_ACT * (act - 1) + (tier === 'boss' ? PER_ACT : tier === 'elite' ? PER_ACT / 2 : 0);
          const r = fight(deckFor(ch, act, 1000 + i, picks), enc, 77 + i * 131);
          if (r.result === 'win') { w++; turns += r.turns; }
          lost += r.lost;
        }
        return { enc: enc.join('+'), win: w / FIGHTS, turns: turns / Math.max(1, w), lost: lost / FIGHTS / maxHp };
      });
    }
  }
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const f1 = (x) => x.toFixed(1);

// Summary table (reference for the next balance pass).
for (const ch of CHARS) {
  const row = [1, 2, 3].map(a => ['normal', 'elite', 'boss'].map(t => {
    const L = R[ch][a][t];
    return `${t[0]} ${f1(mean(L.map(x => x.turns)))}t ${Math.round(100 * Math.min(...L.map(x => x.win)))}%`;
  }).join(', ')).join(' | ');
  console.log(`  ${ch.padEnd(9)} A1 ${row}`);
}

// The owner tunes difficulty by hand with DATA.DIFFICULTY; this suite only
// guards sanity: every fight resolves, nothing is a mathematical wall, and
// the dial is honoured. No design bands on turn counts or win rates.
h.test('every fight resolves and nothing is a wall', () => {
  for (const ch of CHARS) for (const act of [1, 2, 3]) {
    for (const tier of ['normal', 'elite', 'boss']) for (const e of R[ch][act][tier]) {
      // turns is per win; an elite the starting hand never beats reports 0.
      h.ok(Number.isFinite(e.turns) && (e.win === 0 || (e.turns >= 1 && e.turns < MAX_TURNS)), `${ch} A${act} ${tier} ${e.enc}: fights end (${f1(e.turns)} turns)`);
      h.ok(Number.isFinite(e.win) && Number.isFinite(e.lost), `${ch} A${act} ${tier} ${e.enc}: stats are numbers`);
    }
    // A full-hp crawler with its starting bin can beat every normal of its
    // act at least sometimes; a wall would be a content bug, not a tuning.
    for (const e of R[ch][act].normal) h.ok(e.win > 0, `${ch} A${act} ${e.enc}: beatable (${Math.round(100 * e.win)}%)`);
  }
});

h.test('the difficulty dial scales enemy hp and attacks', () => {
  const d = DATA.DIFFICULTY || { hp: 1, dmg: 1 };
  const run = { hp: 80, maxHp: 80, act: 1, bin: [], relics: [], claw: {} };
  const F = COMBAT.newFight(run, ['rat'], U.rng(4));
  const def = DATA.ENEMIES.rat;
  const e = F.enemies[0];
  h.ok(e.maxHp >= Math.round(def.hp[0] * d.hp) - 1 && e.maxHp <= Math.round(def.hp[1] * d.hp) + 1, `rat hp ${e.maxHp} sits in the scaled band`);
  const atk = def.moves.find(m => m.k === 'attack');
  const scaled = e.def.moves.find(m => m.k === 'attack');
  if (atk && scaled) h.eq(scaled.v, Math.max(1, Math.round(atk.v * d.dmg)), 'attack value scaled by the dial');
});

h.test('enemy hp scales by act as the bible says', () => {
  const avg = (act, tier) => {
    const ids = Object.keys(DATA.ENEMIES).filter(id => { const e = DATA.ENEMIES[id]; return e.act === act && e.tier === tier && !e.minion; });
    return mean(ids.map(id => (DATA.ENEMIES[id].hp[0] + DATA.ENEMIES[id].hp[1]) / 2));
  };
  const n1 = avg(1, 'normal'), n2 = avg(2, 'normal'), n3 = avg(3, 'normal');
  h.ok(n1 >= 12 && n1 <= 30, `act 1 normals average ${f1(n1)} hp (12..30)`);
  // Acts 2 and 3 sit above the bible's x1.7 / x2.6: by then a run carries
  // 30-50 items, an Extra Token or two and a handful of relics (the bot
  // cleared act 3 normals in 2 turns at the bible's x2.6).
  h.ok(n2 / n1 >= 1.5 && n2 / n1 <= 2.4, `act 2 normals are x${(n2 / n1).toFixed(2)} of act 1 (bible x1.7, lifted)`);
  h.ok(n3 / n1 >= 2.4 && n3 / n1 <= 3.8, `act 3 normals are x${(n3 / n1).toFixed(2)} of act 1 (bible x2.6, lifted)`);
  for (const act of [1, 2, 3]) {
    const r = avg(act, 'elite') / avg(act, 'normal');
    h.ok(r >= 1.8 && r <= 2.8, `act ${act} elites are x${r.toFixed(2)} a normal (bible x2.2)`);
  }
  for (const id of Object.keys(DATA.ENEMIES)) {
    const e = DATA.ENEMIES[id];
    if (e.act === 1 && e.tier === 'normal') for (const m of e.moves) if (m.k === 'attack') h.ok(m.v * (m.n || 1) <= 12, `${id}.${m.id} hits for at most 12 in act 1`);
  }
});

h.test('earlier-act normals pulled into later acts keep pace (events, summons)', () => {
  const avg = (ids) => mean(ids.map(id => { const e = DATA.ENEMIES[id]; return (e.hp[0] + e.hp[1]) / 2; }));
  const natives = (act) => Object.keys(DATA.ENEMIES).filter(id => { const e = DATA.ENEMIES[id]; return e.act === act && e.tier === 'normal' && !e.minion; });
  const run = { hp: 70, maxHp: 70, bin: [], relics: [], claw: {} };
  for (const act of [2, 3]) {
    const pulled = mean(natives(1).map(id => mean([1, 2, 3, 4, 5, 6].map(s => COMBAT.newFight(Object.assign({ act }, run), [id], U.rng(s)).enemies[0].maxHp))));
    // Compare live hp on both sides so DATA.DIFFICULTY cancels out.
    const nativeLive = mean(natives(act).map(id => mean([1, 2, 3, 4, 5, 6].map(s => COMBAT.newFight(Object.assign({ act }, run), [id], U.rng(s)).enemies[0].maxHp))));
    const r = pulled / nativeLive;
    h.ok(r >= 0.75 && r <= 1.25, `act 1 normals in act ${act} have x${r.toFixed(2)} the hp of act ${act} natives (0.75..1.25)`);
  }
});

// ------------------------------------------------------------ economy
h.test('reward rarity follows the act weights', () => {
  for (const act of [1, 2, 3]) {
    const n = { c: 0, u: 0, r: 0, l: 0 };
    let tot = 0;
    const rng = U.rng(4242 + act);
    for (let i = 0; i < 1000; i++) {
      for (const id of DATA.rewardItems(rng, act, CHARS[i % 3], 3)) { n[DATA.ITEMS[id].rarity]++; tot++; }
    }
    const W = DATA.RARITY_WEIGHTS[act];
    const wt = W.c + W.u + W.r + W.l;
    for (const k of ['c', 'u', 'r', 'l']) h.near(n[k] / tot, W[k] / wt, 0.04, `act ${act} ${k} share`);
    if (act === 1) h.eq(n.l, 0, 'no legendaries in act 1 rewards');
    h.ok(n.r + n.l > 0, `act ${act} offers rares`);
  }
  const rl = (a) => DATA.RARITY_WEIGHTS[a].r + DATA.RARITY_WEIGHTS[a].l;
  h.ok(rl(1) < rl(2) && rl(2) < rl(3), 'rare + legendary odds climb every act');
});

h.test('prices: items, claw upgrades and shop stock are affordable', () => {
  // Small fillers 10-25 and bags 25-35: a bag costs less than a common and
  // no more than its contents bought one by one.
  const band = { c: [40, 50], u: [55, 75], r: [90, 110], l: [120, 140], small: [10, 25], bag: [25, 35] };
  for (const id in DATA.ITEMS) {
    const d = DATA.ITEMS[id];
    if (d.rarity === 'junk') continue;
    const k = d.bag ? 'bag' : d.tags.includes('small') ? 'small' : d.rarity;
    h.ok(d.cost >= band[k][0] && d.cost <= band[k][1], `${id} costs ${d.cost} (${k} ${band[k].join('-')})`);
  }
  for (const id in DATA.CLAW_UPGRADES) {
    const c = DATA.CLAW_UPGRADES[id];
    h.ok(c.cost >= 50 && c.cost <= 180, `claw ${id} costs ${c.cost} (50..180)`);
  }
  // A fresh crawler at an act 1 shop: at least two of the five items plus
  // one claw upgrade fit in the gold a first act brings (start gold plus
  // three fights of 10-25).
  const G = boot().GAME;
  let ok = 0, n = 0;
  for (let s = 1; s <= 40; s++) {
    for (const ch of CHARS) {
      G.newRun(ch, s);
      const budget = G.run.gold + 3 * 17;
      const shop = G.rollShop({ q: s % 5, r: s % 3 });
      const prices = shop.items.map(i => i.price).sort((a, b) => a - b);
      n++;
      if (prices[0] + prices[1] <= budget) ok++;
      h.ok(shop.items.every(i => i.price <= 150), `seed ${s} ${ch}: no item above 150 gold`);
    }
  }
  h.ok(ok / n >= 0.95, `two items affordable at the first shop in ${Math.round(100 * ok / n)}% of shops`);
});

h.test('ink economy reaches the boss and the bible reveal share', () => {
  const E = DATA.ECONOMY;
  h.ok(E && E.startInk >= 9, `start ink ${E && E.startInk} covers the 9-10 hex minimum path`);
  h.ok(E.inkTile >= 2 && E.eliteInk >= 1 && E.fightInkChance > 0 && E.fightInkChance <= 1, 'ink tiles, elites and fights pay ink');
  // Expected ink per act: start + ~4 ink tiles found + ~6 fights + ~1 elite.
  const perAct = E.startInk + 4 * E.inkTile * 0.5 + 6 * E.fightInkChance + E.eliteInk;
  h.ok(perAct >= 16 && perAct <= 26, `about ${f1(perAct)} ink per act (35-45% of an 84-hex map)`);
});

// ------------------------------------------------------------ rule fixes
h.test('relic extra grabs reach the event collectors', () => {
  const run = { hp: 70, maxHp: 70, act: 1, bin: DATA.CHARACTERS.knight.bin.map(id => ({ id })), relics: ['egg_timer'], claw: { grabs: 3 } };
  const F = COMBAT.newFight(run, ['gremlin'], U.rng(5));
  COMBAT.endTurn(F);
  const ev = COMBAT.endTurn(F);   // turn 3 starts inside this call
  h.eq(F.turn, 3, 'turn 3');
  h.ok(ev.some(e => e.t === 'grab' && e.v === 1), 'Egg Timer +1 grab is in the endTurn events');
  h.eq(F.player.grabs, 4, 'and the grab is there');
  const F2 = COMBAT.newFight(Object.assign({}, run, { relics: ['hot_coffee'] }), ['gremlin'], U.rng(6));
  h.ok(F2.events.some(e => e.t === 'grab'), 'Hot Coffee +1 grab is on the fight events');
});

h.test('spare heart heals exactly its max hp gain', () => {
  const run = { hp: 40, maxHp: 70, act: 1, bin: [{ id: 'spare_heart' }, { id: 'rock' }, { id: 'rock' }, { id: 'rock' }], relics: [], claw: {} };
  const F = COMBAT.newFight(run, ['gremlin'], U.rng(7));
  COMBAT.play(F, F.bin.find(i => i.id === 'spare_heart'));
  const g = DATA.ITEMS.spare_heart.fx.find(f => f.k === 'maxhp').v;
  h.eq(F.player.maxHp, 70 + g, 'max hp grew');
  h.eq(F.player.hp, 40 + g, 'healed by the same amount, once');
});

console.log(`  balance suite: ${((Date.now() - T0) / 1000).toFixed(1)} s`);
h.done();

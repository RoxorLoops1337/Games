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
      // (round 17) the Cabinet Tech relics answer the cabinet (events, the lamp, PERFECT grabs), which this
      // COMBAT-only model does not have: they would be dead picks here, so the model draws from the rest
      for (const rar of ['c', 'u']) { const pool = DATA.relicPool(rar, relics).filter((id) => !(DATA.TECH && DATA.TECH.RELICS.includes(id))); if (pool.length) relics.push(rng.pick(pool)); }
    }
  }
  const claw = Object.assign({}, c.claw);
  claw.grabs += Math.min(2, acts);
  // (round 21) the bare starting bin (no picks yet) only ever meets the run's first fight, so it plays at fights 0;
  // a deck with picks plays at fights 1. (round 22) Both read act 1's full dial in act 1 (the first fight is no longer
  // gentler). Both stay under ramp.every: the hidden escalation is step 0 as before. Lucky Lou and Ms. Bubbles would start with their combo
  // relic (DATA.CR.START); the three modelled crawlers start with none.
  const cr = DATA.CR && DATA.CR.START && DATA.CR.START[char];
  if (cr && relics.indexOf(cr) < 0) relics.push(cr);
  // Past act 1's first elite (it sits mid act, PER_ACT / 2 picks in) the run holds the combo relic it offered
  // (DATA.crOffer leans to the deck's families); the model takes the one its deck invests in most.
  if (picks > PER_ACT / 2 && DATA.crOffer) {
    const o = DATA.crOffer(rng, { relics, bin }, 3), sc = DATA.investment({ relics, bin });
    const fit = (id) => (DATA.CR.FAM[DATA.RELICS[id].combo].arch || []).reduce((s, k) => s + (sc[k] || 0), 0);
    if (o.length) relics.push(o.slice().sort((a, b) => fit(b) - fit(a))[0]);
  }
  return { hp: c.hp, maxHp: c.hp, act, bin, relics, claw, fights: picks > 0 ? 1 : 0 };
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
    // (round 22) In act 1 the bare bin meets only the run's first fight, drawn from the front of the list (MAP
    // biases later columns toward the back: the bots' first fights drew from its first 14 of 19); an encounter in
    // the back quarter is met mid act, so it must be beatable for the deck a run holds there (PER_ACT / 2 picks).
    R[ch][act].normal.forEach((e, i, L) => {
      if (act === 1 && i >= Math.ceil(0.75 * L.length)) {
        MODEL = MODELS[ch];
        let w = 0;
        for (let k = 0; k < FIGHTS; k++) if (fight(deckFor(ch, 1, 1000 + k, PER_ACT / 2), DATA.ENCOUNTERS[1].normal[i], 77 + k * 131).result === 'win') w++;
        h.ok(w > 0, `${ch} A1 ${e.enc} (back of the list, a mid-act deck): beatable (${Math.round(100 * w / FIGHTS)}%; the bare bin ${Math.round(100 * e.win)}%)`);
      } else h.ok(e.win > 0, `${ch} A${act} ${e.enc}: beatable (${Math.round(100 * e.win)}%)`);
    });
  }
});

h.test('the difficulty dial scales enemy hp and attacks', () => {
  const d = DATA.DIFFICULTY || { hp: 1, dmg: 1 };
  const run = { hp: 80, maxHp: 80, act: 1, bin: [], relics: [], claw: {} };
  const F = COMBAT.newFight(run, ['rat'], U.rng(4));
  const def = DATA.ENEMIES.rat;
  const e = F.enemies[0];
  // (round 21) an act 1 normal in act 1 also takes DATA.DIFFICULTY.act1 (round 22: the run's first fight too)
  const a1 = d.act1 || { hp: 1, dmg: 1 };
  h.ok(e.maxHp >= Math.round(def.hp[0] * d.hp * a1.hp) - 1 && e.maxHp <= Math.round(def.hp[1] * d.hp * a1.hp) + 1, `rat hp ${e.maxHp} sits in the scaled band`);
  const atk = def.moves.find(m => m.k === 'attack');
  const scaled = e.def.moves.find(m => m.k === 'attack');
  if (atk && scaled) h.eq(scaled.v, Math.max(1, Math.round(atk.v * d.dmg * a1.dmg)), 'attack value scaled by the dial');
  // round 12: DIFFICULTY.tierDmg lifts elite and boss attacks on top of the dial (normals untouched above)
  for (const [id, tier] of [['ironjaw', 'elite'], ['plushqueen', 'boss']]) {
    const k = (d.tierDmg && d.tierDmg[tier]) || 1;
    const G = COMBAT.newFight(Object.assign({}, run, { act: DATA.ENEMIES[id].act || 1 }), [id], U.rng(4)).enemies[0];
    const a0 = DATA.ENEMIES[id].moves.find(m => m.k === 'attack'), a1 = G.def.moves.find(m => m.k === 'attack');
    h.eq(a1.v, Math.max(1, Math.round(a0.v * d.dmg * k)), `${id} (${tier}): attack x${d.dmg} x${k}`);
  }
});

h.test('hidden escalation ramps enemies with fights fought', () => {
  const d = DATA.DIFFICULTY || {};
  const ramp = d.ramp;
  h.ok(ramp && ramp.every > 0 && ramp.hp > 0 && ramp.dmg > 0, 'DATA.DIFFICULTY.ramp is set (every/hp/dmg)');
  if (!ramp) return;
  const mk = fights => COMBAT.newFight({ hp: 80, maxHp: 80, act: 1, bin: [], relics: [], claw: {}, fights }, ['goblin'], U.rng(11)).enemies[0];
  // (round 22) fight 0, the run's first fight, reads the same act 1 dial as fight 1 (round 21 made it gentler)
  const first = mk(0), base = mk(1), same = mk(ramp.every - 1), up = mk(ramp.every), up2 = mk(ramp.every * 2);
  h.eq(first.maxHp, base.maxHp, `the run's first fight is no gentler than fight 1 (${first.maxHp} hp)`);
  h.eq(same.maxHp, base.maxHp, `fight ${ramp.every - 1}: no step yet (${same.maxHp} hp)`);
  h.ok(up.maxHp > base.maxHp, `fight ${ramp.every}: first step raises hp (${base.maxHp} -> ${up.maxHp})`);
  h.ok(up2.maxHp > up.maxHp, `fight ${ramp.every * 2}: second step raises hp again (${up2.maxHp})`);
  const jab = e => e.def.moves.find(m => m.k === 'attack').v;
  h.ok(jab(up) > jab(base), `attacks ramp too (${jab(base)} -> ${jab(up)})`);
  const capped = mk(ramp.every * (ramp.max + 5));
  const atMax = mk(ramp.every * ramp.max);
  h.eq(capped.maxHp, atMax.maxHp, `ramp caps at ${ramp.max} steps (${capped.maxHp} hp)`);
  h.eq(mk(undefined).maxHp, first.maxHp, 'a run without a fight counter is step 0 (and its first fight)');
});

// Round 21 (DESIGN.md "Combo relics and a gentler, clearer start (round 21)"): act 1's normals are a threat.
// Round 22 (DESIGN.md "First fights are a threat (round 22)"): the run's first fight is no gentler, and act 1's
// elites read their own sub-dial (a step up, not the wall they were with combos a relic power).
h.test('act 1 normals (the first fight too) take a hit more and hit harder; elites their own dial; minions and later acts nothing', () => {
  const d = DATA.DIFFICULTY, A = d.act1, E = A && A.elite;
  h.ok(A && A.hp > 1 && A.dmg > 1 && !A.first, `DIFFICULTY.act1 {hp, dmg} is set, with no gentler first fight (${JSON.stringify(A)})`);
  const run = (o) => Object.assign({ hp: 80, maxHp: 80, act: 1, bin: [], relics: [], claw: {} }, o);
  const one = (id, o, seed) => COMBAT.newFight(run(o), [id], U.rng(seed || 4)).enemies[0];
  const atk = (e) => (e.def.moves.find(m => m.k === 'attack') || {}).v;
  const top = (e) => Math.max(0, ...e.def.moves.filter(m => m.k === 'attack' && m.v != null).map(m => m.v));   // the biggest single hit
  const normals = ['rat', 'goblin', 'slime', 'crab', 'gremlin', 'jelly'];
  for (const id of normals) {
    const def = DATA.ENEMIES[id], a0 = def.moves.find(m => m.k === 'attack');
    const e = one(id, { fights: 1 }), f = one(id, { fights: 0 });
    h.ok(e.maxHp >= Math.round(def.hp[0] * d.hp * A.hp) - 1 && e.maxHp <= Math.round(def.hp[1] * d.hp * A.hp) + 1, `${id}: hp x${A.hp} on top of the dial (${e.maxHp})`);
    if (a0) h.eq(atk(e), Math.max(1, Math.round(a0.v * d.dmg * A.dmg)), `${id}: attacks x${A.dmg} on top of the dial`);
    h.ok(f.maxHp === e.maxHp && atk(f) === atk(e), `${id}: the run's first fight is the same fight (${f.maxHp} hp, hits ${atk(f)})`);
  }
  // the same fight with the act 1 dial switched off: minions, act 2 normals and act 2 elites come out the same
  const off = (id, o) => { const k = d.act1; d.act1 = null; try { return one(id, o); } finally { d.act1 = k; } };
  for (const [id, o, what] of [['slimeling', { fights: 1 }, 'a minion'], ['drone', { act: 2, fights: 1 }, 'an act 2 normal'], ['ironjaw', { act: 2, fights: 1 }, 'an act 2 elite']]) {
    if (!DATA.ENEMIES[id]) continue;
    const a = one(id, o), b = off(id, o);
    h.ok(a.maxHp === b.maxHp && atk(a) === atk(b), `${what} (${id}) is untouched (${a.maxHp} hp)`);
  }
  const r1 = one('rat', { fights: 1 }), r0 = off('rat', { fights: 1 });
  h.ok(r1.maxHp > r0.maxHp && atk(r1) > atk(r0), `while an act 1 normal is not (${r0.maxHp} -> ${r1.maxHp} hp, ${atk(r0)} -> ${atk(r1)} a hit)`);
  const late = one('rat', { act: 2, fights: 1 }), late0 = one('rat', { act: 2, fights: 0 });
  h.ok(late.maxHp === late0.maxHp && atk(late) === atk(late0), 'in act 2 an act 1 normal reads no act 1 dial (first fight or not)');
  // act 1's elites: their own sub-dial on top of tierDmg (none set: untouched), and still a clear step up from a normal
  const nTop = Math.max(...normals.map(id => top(one(id, { fights: 1 })))), nHp = mean(normals.map(id => one(id, { fights: 1 }).maxHp));
  for (const id of ['mimic', 'broodmother', 'barker']) {
    const a0 = DATA.ENEMIES[id].moves.find(m => m.k === 'attack'), e = one(id, { fights: 3 }), b = off(id, { fights: 3 });
    const k = E || { hp: 1, dmg: 1 };
    h.ok(Math.abs(e.maxHp - b.maxHp * k.hp) <= 2, `${id}: hp x${k.hp} (${b.maxHp} -> ${e.maxHp}; the same roll and affix)`);
    h.eq(atk(e), Math.max(1, Math.round(a0.v * d.dmg * d.tierDmg.elite * k.dmg)), `${id}: attacks x${d.tierDmg.elite} x${k.dmg} (${atk(b)} -> ${atk(e)})`);
    h.ok(e.maxHp >= 1.5 * nHp && top(e) >= 1.4 * nTop, `${id}: still a step up (${e.maxHp} hp against a normal's ${Math.round(nHp)}, its biggest hit ${top(e)} against ${nTop})`);
  }
  const B = A.boss || { hp: 1, dmg: 1 }, q = one('plushqueen', { fights: 9 }), q0 = off('plushqueen', { fights: 9 });
  h.ok(Math.abs(q.maxHp - Math.round(q0.maxHp * B.hp)) <= 1 && Math.abs(atk(q) - Math.round(atk(q0) * B.dmg)) <= 1, `the act 1 boss reads act1.boss (${A.boss ? 'set' : 'none: untouched'}, ${q.maxHp} hp)`);
  // the modelled first fights (the bare bin at fights 0) last a few turns and hurt: no one-grab wipes without combos
  for (const ch of CHARS) {
    const L = R[ch][1].normal;
    h.ok(mean(L.map(x => x.turns)) >= 3, `${ch}: the bare bin needs 3+ turns for an act 1 normal (${f1(mean(L.map(x => x.turns)))})`);
    h.ok(mean(L.map(x => x.lost)) >= 0.05, `${ch}: act 1 normals land real hits (${Math.round(100 * mean(L.map(x => x.lost)))}% of Max HP)`);
  }
});

h.test('some enemies bite back or poison', () => {
  const ids = Object.keys(DATA.ENEMIES);
  const thorny = ids.filter(id => DATA.ENEMIES[id].status && DATA.ENEMIES[id].status.thorns > 0);
  h.ok(thorny.length >= 4, `${thorny.length} enemies start with thorns (${thorny.join(', ')})`);
  for (const act of [1, 2, 3]) {
    const poisoners = ids.filter(id => DATA.ENEMIES[id].act === act && (DATA.ENEMIES[id].moves || []).some(m => m.k === 'debuff' && m.s === 'poison'));
    h.ok(poisoners.length >= 1, `act ${act} has a poisoner (${poisoners.join(', ')})`);
  }
  const F = COMBAT.newFight({ hp: 80, maxHp: 80, act: 1, bin: [], relics: [], claw: {} }, ['crab'], U.rng(3));
  h.eq(F.enemies[0].status.thorns, DATA.ENEMIES.crab.status.thorns, 'crab spawns with its thorns');
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
  // A fresh crawler at an act 1 shop: at least two of the five items fit in
  // the gold a first act brings (start gold plus three fights of 10-25).
  // Claw upgrades are not sold (bosses and towers only); their costs stay.
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
      // round 12: DATA.ECONOMY.shopK scales every shelf price (150 before the pass)
      const cap = Math.round(150 * ((DATA.ECONOMY && DATA.ECONOMY.shopK) || 1));
      h.ok(shop.items.every(i => i.price <= cap), `seed ${s} ${ch}: no item above ${cap} gold`);
      h.ok(!shop.claws, `seed ${s} ${ch}: no claw upgrades for sale`);
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

// Round 16 (DESIGN.md "Balance touch-up (round 16)"): a claw type's own start, DATA.CLAWS[id].bal
// {hp, grabs}, read once by GAME newRun. The skilled bot measured the scoop far ahead and the twins far
// behind; the dials are small (some Max HP, one grab at most) and land on a real run.
h.test('claw type balance dials: small, and a new run gets them', () => {
  const CL = DATA.CLAWS;
  for (const id in CL) {
    const b = CL[id].bal;
    if (b == null) continue;
    h.ok(Number.isInteger(b.hp || 0) && Math.abs(b.hp || 0) <= 15, `${id}: bal.hp ${b.hp} is a small whole number`);
    h.ok(Number.isInteger(b.grabs || 0) && Math.abs(b.grabs || 0) <= 1, `${id}: bal.grabs ${b.grabs} is at most one grab`);
  }
  h.ok((CL.twin.bal && CL.twin.bal.grabs) === 1, 'the twins bring one more grab a turn');
  h.ok((CL.scoop.bal && CL.scoop.bal.grabs) === -1, 'the scoop takes one grab a turn fewer');
  for (const ch in DATA.CHARACTERS) h.ok(DATA.CHARACTERS[ch].claw.grabs + CL.scoop.bal.grabs >= 2, `${ch} with the scoop keeps 2+ grabs a turn`);
  const T = boot();
  const G = T.GAME, D = T.DATA;
  for (const ct of ['classic', 'scoop', 'twin']) for (const ch of ['knight', 'alchemist', 'engineer']) {
    h.ok(G.claws.pick(ct), `${ct} picked`);
    const run = G.newRun(ch, 40 + ch.length);
    const b = D.CLAWS[ct].bal || {}, c = D.CHARACTERS[ch];
    h.eq(run.clawType, ct, `${ch} runs with the ${ct}`);
    h.eq(run.maxHp, c.hp + (b.hp || 0), `${ch} + ${ct}: Max HP ${c.hp} ${b.hp || 0 ? 'with ' + b.hp : 'as is'}`);
    h.eq(run.hp, run.maxHp, `${ch} + ${ct}: starts full`);
    h.eq(run.claw.grabs, c.claw.grabs + (b.grabs || 0), `${ch} + ${ct}: grabs a turn`);
  }
  G.claws.pick('classic');
});

// TECH (round 17, DESIGN.md "Cabinet Tech and the new crawler (round 17)"): the dials the skilled bot tuned.
h.test('tech: Joy Stick and the Cabinet Tech dials stay where the bot left them', () => {
  const c = DATA.CHARACTERS.techie, K = DATA.TECH.K;
  h.ok(c && c.hp === 70 && c.claw.grabs === 3 && c.gold === 100, 'Joy Stick: 70 hp, 3 grabs, 100 gold');
  h.ok(K.giftEvP > 0 && K.giftEvP <= 0.3 && K.giftPerfLamp === 1, 'her gift: a few more events, one more cell a PERFECT');
  h.ok(K.remoteDmg <= 4 && K.remoteBlock <= 4, 'the remote is a nudge, not a nuke');
  h.ok(K.metroDmg * 4 >= K.metroMax && K.metroMax <= 16, 'the Metronome caps at 16');
  h.ok(K.feverDmg <= 10 && K.mbDmg <= 20, 'a fever hits, but the lamp fills fast');
  // the relic damage that runs off the cabinet never comes from an enemy's turn: every Tech hook is onCab or a turn-start ring
  for (const id of DATA.TECH.RELICS.concat(['service_remote'])) {
    const hk = Object.keys(DATA.RELICS[id].hooks || {});
    h.ok(hk.every((k) => k === 'onCab' || k === 'onTurnStart'), id + ': only onCab (and the quiet turn start)');
  }
});

console.log(`  balance suite: ${((Date.now() - T0) / 1000).toFixed(1)} s`);
h.done();

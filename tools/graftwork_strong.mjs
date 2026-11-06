// Strong policy bot for GRAFTWORK (balance round 2). UNTESTED when written: the author session had no shell.
//   node tools/graftwork_strong.mjs [runsPerHero=40] [ascension=0] [hero]
// Adds POLICIES.strong to the sim's POLICIES object (sim file only gained exports and two hooks: pol.fight, pol.pickGraft).
// Fight: per-card score = cardValue ratio + Thread bonus from seamPreview (extend / paying cut / wasted cut), block weight
// rises with incoming damage vs HP, kill-first targeting by (hp+block) per threat. Grafts: sim graftScore + school-focus bonus.
import * as RUN from '../graftwork/engine/run.js';
import { newCombat, playCard, endTurn, canPlay, intentOf, resolvePending, usePotion, finishCombat, specOf } from '../graftwork/engine/combat.js';
import { seamPreview } from '../graftwork/engine/seam.js';
import { hashSeed } from '../graftwork/engine/rng.js';
import { cardSpec, canGraft, canTemper, schoolsOf } from '../graftwork/engine/cards.js';
import { GRAFTS, HEROES, CARDS } from '../graftwork/data/index.js';
import { POLICIES, cardValue, graftScore, playRun } from './graftwork_sim.mjs';

// rough value of one stitch of each school payout
const STITCH_VAL = { ember: 3.2, echo: 4, hoard: 3, blood: 1.6, rust: 3.5, static: 2.5, gilded: 0.5 };
function payoutValue(c, pay) {
  const alive = c.enemies.filter((e) => !e.dead).length;
  let v = 0;
  for (const p of pay || []) v += p.stitches * (STITCH_VAL[p.school] || 1) * (p.school === 'ember' ? Math.min(2, alive) * 0.6 + 0.4 : 1);
  return v;
}

function pickTarget(c, live, intents) {
  const vulnBonus = (e) => (e.st.vulnerable > 0 ? 0.8 : 1);
  return live.slice().sort((a, b) => ((a.hp + a.block) * vulnBonus(a)) / (2 + intents.get(a) * 1.5) - ((b.hp + b.block) * vulnBonus(b)) / (2 + intents.get(b) * 1.5))[0];
}

export function strongFight(run, pol, maxTurns = 40) {
  const kind = run.pending.fightKind;
  const c = newCombat(run, run.pending.enemies, { kind });
  let guard = 0;
  while (!c.over && c.turn <= maxTurns && guard++ < 3000) {
    let plays = 0;
    while (!c.over && plays++ < 30) {
      if (c.pending) { const p = c.pending; const pool = p.kind === 'fetch' ? (p.zone === 'exhaust' ? c.exhaust : c.discard) : c.hand; resolvePending(c, pool.slice(0, p.n).map((k) => k.uid)); continue; }
      const live = c.enemies.filter((e) => !e.dead);
      if (!live.length) break;
      const intents = new Map(live.map((e) => [e, e.st.stun > 0 ? 0 : intentOf(c, e).dmg]));
      const incoming = [...intents.values()].reduce((a, b) => a + b, 0);
      const need = Math.max(0, incoming - c.player.block);
      const st = { live, intents, need, cardsLeft: c.hand.length, target: null, blockW: 1.5 };
      st.target = pickTarget(c, live, intents);
      // danger: block weight scales with how much of current HP the unblocked hit would take
      const frac = need / Math.max(1, c.player.hp);
      st.blockW = frac >= 0.8 ? 3.2 : frac >= 0.5 ? 2.4 : frac >= 0.25 ? 1.8 : 1.2;
      // potions: reuse the sim's logic through a tiny local rule set
      const hpF = c.player.hp / c.player.maxHp;
      let pi = -1;
      for (let i = 0; i < run.potions.length && pi < 0; i++) {
        const big = kind === 'elite' || kind === 'boss' || kind === 'final';
        if (hpF < 0.4 || (need >= c.player.hp * 0.7) || (big && c.turn <= 2)) pi = i;
      }
      if (pi >= 0) { usePotion(c, pi, c.enemies.indexOf(st.target)); c.ev.length = 0; continue; }
      let best = -1, bs = 0.01, bestSetup = -1, bss = 0;
      const echo = c.player.st.echo > 0;
      c.hand.forEach((k, i) => {
        const ck = canPlay(c, i); if (!ck.ok) return;
        const cost = ck.cost === 'X' ? Math.max(1, c.energy) : ck.cost;
        const { v, setup } = cardValue(c, k, ck, st);
        const sp = ck.spec;
        let th = 0;
        try {
          const pv = seamPreview(c, k);
          if (pv.kind === 'extend') th = 1.2 + (c.seam.len > 0 ? 1.0 * c.seam.len : 0) + payoutValue(c, pv.payout) * 0.35;
          else if (pv.kind === 'cut') th = payoutValue(c, pv.payout) - (pv.payout.length ? 0 : c.seam.len >= 2 ? 2.5 : 0);
        } catch { th = 0; }
        if (setup > 0 && v > -2) {
          const sscore = (setup + Math.max(0, v)) / Math.max(0.7, cost + 0.2) + (cost === 0 ? 5 : 0);
          if (sscore > bss && !(echo && sp.fx.every((o) => o.op === 'status' && o.s === 'echo'))) { bss = sscore; bestSetup = i; }
        }
        let s = (v + th + setup * 0.5) / Math.max(0.6, cost);
        if (echo) s = v + th + setup * 0.5;
        if (sp.flags.exhaust && v < 12) s -= 0.5;
        if (cost === 0 && v + th > 0) s += 4;
        if (s > bs) { bs = s; best = i; }
      });
      if (bestSetup >= 0 && (bestSetup === best || bss > 3.5) && !(echo && bestSetup !== best)) best = bestSetup;
      if (best < 0) break;
      const sp = specOf(c, c.hand[best]);
      const ti = sp.target === 'enemy' ? c.enemies.indexOf(st.target) : null;
      if (globalThis.GW_TRACE) console.log(`T${c.turn} hp${c.player.hp} blk${c.player.block} en${c.energy} play ${sp.id} (need ${st.need}) foes ${live.map((e) => e.id + ':' + e.hp).join(',')}`);
      playCard(c, best, ti);
      c.ev.length = 0;
    }
    if (c.over) break;
    if (globalThis.GW_TRACE) console.log(`  end hp${c.player.hp} en${c.energy} hand${c.hand.length}`);
    endTurn(c); c.ev.length = 0;
  }
  if (!c.over) { c.over = 'lose'; c.player.hp = 0; }
  const res = finishCombat(c);
  res.turns = c.turn;
  return { res, c };
}
void CARDS;

// Graft pick: sim score plus focus on the deck's dominant Thread school (only grafts that bridge into it).
export function strongPickGraft(run, pol) {
  const offer = run.pending.offer;
  const focus = {};
  for (const inst of run.deck) for (const s of schoolsOf(cardSpec(inst))) focus[s] = (focus[s] || 0) + 1;
  const top = Object.entries(focus).sort((a, b) => b[1] - a[1])[0];
  let best = null, bs = -1e9;
  for (const uid of offer.cards) {
    const inst = RUN.findInst(run, uid);
    for (const gid of offer.grafts) {
      if (!canGraft(inst, gid)) continue;
      const r = graftScore(run, inst, gid, pol);
      if (r.strain > pol.maxStrain) continue;
      let s = r.s;
      const g = GRAFTS[gid];
      if (top && g.school === top[0]) s += 1.5; else if (top && (focus[g.school] || 0) >= 2) s += 0.7;
      // one deliberate Overload per run (on some runs) while Strain is still low: x1.5 numbers, 25% Shatter on first play
      if (inst.grafts.length === 2 && r.strain === 0 && runRoll(run, 'over') < (pol.overloadP ?? OVERLOAD_P) && !run.flags.gwOverloaded) s += 3.5;
      if (s > bs) { bs = s; best = [uid, gid]; }
    }
  }
  const pick = best && bs >= +(process.env.GW_FLOOR ?? 1.5) ? best : null;
  if (pick && RUN.findInst(run, pick[0]).grafts.length === 2) run.flags.gwOverloaded = true;
  return pick;
}

// Per-run deterministic dice so the same seed makes the same choice in baseline and relic runs.
const OVERLOAD_P = +(process.env.GW_OVERLOAD_P ?? 0.35), TEMPER_P = +(process.env.GW_TEMPER_P ?? 0.4);
const runRoll = (run, tag) => (hashSeed(run.seed + ':' + tag) % 1000) / 1000;

// Forge: on some runs hammer (Temper) the best grafted card instead of resting/refining. An Overload comes first (it stops the Shatter roll);
// otherwise the grafted card with the most plays. Needs HP above 70 percent, as the forge heal is the default use.
export function strongForge(run, pol, hpF) {
  if (hpF < 0.7 || runRoll(run, 'temper') >= (pol.temperP ?? TEMPER_P)) return false;
  const c = run.deck.filter((i) => canTemper(i));
  if (!c.length) return false;
  c.sort((a, b) => (b.grafts.length > 2) - (a.grafts.length > 2) || b.grafts.length - a.grafts.length || (b.plays || 0) - (a.plays || 0));
  return RUN.forgeAct(run, 'temper', c[0].uid).ok;
}

POLICIES.strong = { buyCards: +(process.env.GW_BUY ?? 0), maxStrain: +(process.env.GW_MS ?? 2), greed: +(process.env.GW_GREED ?? 0.6), fight: strongFight, pickGraft: strongPickGraft, forge: strongForge };

if (process.argv[1] && process.argv[1].endsWith('graftwork_strong.mjs')) {
  const N = +process.argv[2] || 40, asc = +process.argv[3] || 0, only = process.argv[4];
  for (const hero of Object.keys(HEROES)) {
    if (only && hero !== only) continue;
    const rs = [];
    for (let i = 0; i < N; i++) rs.push(playRun(hero, `strong-${hero}-${i}`, POLICIES.strong, asc));
    const wins = rs.filter((r) => r.outcome === 'won').length;
    const a1 = rs.filter((r) => r.outcome === 'won' || r.act > 1).length;
    const fl = (rs.reduce((a, r) => a + r.floors, 0) / N).toFixed(1);
    const a3 = rs.filter((r) => r.outcome === 'won' || r.act > 2).length;
    console.log(`strong ${hero.padEnd(7)} A${asc} act1 clear ${a1}/${N}  act2 clear ${a3}/${N}  win ${wins}/${N} (${(100 * wins / N).toFixed(0)}%) floors ${fl}`);
  }
}

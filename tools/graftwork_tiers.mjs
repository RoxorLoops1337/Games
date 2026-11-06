// Skill tiers for GRAFTWORK difficulty tuning: RANDOM < SLOPPY < CAREFUL < STRONG.
//   node tools/graftwork_tiers.mjs                       # default: every tier, A0, N per tier below
//   node tools/graftwork_tiers.mjs random 1000 0         # one tier: random|sloppy|careful|strong, runs, ascension
//   node tools/graftwork_tiers.mjs sloppy 1000 0 assist  # same with all four Assist options on
//   node tools/graftwork_tiers.mjs careful 300 0 - marrow  # runs PER HERO for careful/strong; last arg limits to one hero
// RANDOM: random legal card, random target, may end the turn at any step, random graft/reward/shop/forge/event/node choices, random skips.
// SLOPPY: plays cards left to right at the first enemy, never reads an intent, never plans Block, takes the first graft offered
//         (skips when it does not fit), buys whatever relic it can afford, rests when hurt.
// CAREFUL = graftwork_sim.mjs POLICIES.careful. STRONG = graftwork_strong.mjs POLICIES.strong.
import * as RUN from '../graftwork/engine/run.js';
import { newCombat, playCard, endTurn, canPlay, resolvePending, usePotion, finishCombat, specOf } from '../graftwork/engine/combat.js';
import { canGraft } from '../graftwork/engine/cards.js';
import { hashSeed } from '../graftwork/engine/rng.js';
import { HEROES } from '../graftwork/data/index.js';
import { POLICIES, playRun } from './graftwork_sim.mjs';
import './graftwork_strong.mjs';

// CAREFUL slips: with probability SLIP a play is replaced by a random playable card (one slip in four ends the turn instead).
// The sim's careful and the strong bot share one card evaluator and play almost the same, so this models a careful HUMAN who reads
// intents but misplays now and then. `careful_pure` is the unmodified sim policy.
export const SLIP = +(process.env.GW_SLIP ?? 0.09);
function slip(c, best, run) {
  const R = run.__slipR || (run.__slipR = mkRng('slip:' + run.seed));
  if (R.next() >= SLIP) return undefined;
  if (R.next() < 0.25) return -1;
  const ok = []; c.hand.forEach((k, i) => { if (canPlay(c, i).ok) ok.push(i); });
  return ok.length ? R.pick(ok) : undefined;
}
POLICIES.carefulSlip = { ...POLICIES.careful, slip };
export const ASSIST_ALL = { on: true, sturdy: true, gentle: true, kind: true, mercy: true };
function mkRng(seed) { let s = hashSeed(seed) >>> 0 || 1; const next = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return { next, int: (n) => Math.floor(next() * n), pick: (a) => a[Math.floor(next() * a.length)] }; }

function tierFight(run, tier, R, maxTurns = 40) {
  const kind = run.pending.fightKind;
  const c = newCombat(run, run.pending.enemies, { kind });
  let guard = 0;
  while (!c.over && c.turn <= maxTurns && guard++ < 3000) {
    let plays = 0;
    while (!c.over && plays++ < 30) {
      if (c.pending) { const p = c.pending; const pool = p.kind === 'fetch' ? (p.zone === 'exhaust' ? c.exhaust : c.discard) : c.hand; const idx = pool.map((_, i) => i); if (tier === 'random') idx.sort(() => R.next() - 0.5); resolvePending(c, idx.slice(0, p.n).map((i) => pool[i].uid)); continue; }
      const live = c.enemies.filter((e) => !e.dead);
      if (!live.length) break;
      if (tier === 'random') {
        if (run.potions.length && R.next() < 0.08) { usePotion(c, 0, c.enemies.indexOf(R.pick(live))); c.ev.length = 0; continue; }
        if (R.next() < 0.18) break; // ends the turn at random
      }
      const ok = []; c.hand.forEach((k, i) => { const ck = canPlay(c, i); if (ck.ok) ok.push(i); });
      if (!ok.length) break;
      const i = tier === 'random' ? R.pick(ok) : ok[0];
      const sp = specOf(c, c.hand[i]);
      const tgt = sp.target === 'enemy' ? c.enemies.indexOf(tier === 'random' ? R.pick(live) : live[0]) : null;
      playCard(c, i, tgt);
      c.ev.length = 0;
    }
    if (c.over) break;
    endTurn(c); c.ev.length = 0;
  }
  if (!c.over) { c.over = 'lose'; c.player.hp = 0; }
  const res = finishCombat(c); res.turns = c.turn;
  return res;
}

// a whole run for the RANDOM and SLOPPY tiers
export function lowRun(tier, heroId, seed, asc = 0, o = {}) {
  const R = mkRng(`${tier}:${seed}`);
  const rnd = tier === 'random';
  const run = RUN.newRun({ hero: heroId, seed, ascension: asc, assist: o.assist });
  const log = { fights: [] };
  let guard = 0;
  while (guard++ < 600 && run.phase !== 'dead' && run.phase !== 'won') {
    switch (run.phase) {
      case 'map': { const n = RUN.availableNodes(run).map((id) => run.map.nodes[id]); RUN.enterNode(run, R.pick(n).id); break; }
      case 'combat': {
        const kind = run.pending.fightKind, hp0 = run.hp, act = run.act;
        const res = tierFight(run, tier, R);
        log.fights.push({ act, kind, win: res.win, hp0, hp: run.hp });
        RUN.resolveFight(run, res); break;
      }
      case 'reward': {
        const rw = run.pending; RUN.claimGold(run, rw);
        if (rw.relic && (!rnd || R.next() < 0.5)) RUN.addRelic(run, rw.relic);
        if (rw.relicChoices && rw.relicChoices.length && (!rnd || R.next() < 0.5)) RUN.addRelic(run, rnd ? R.pick(rw.relicChoices) : rw.relicChoices[0]);
        if (rw.potion && (!rnd || R.next() < 0.5)) RUN.addPotion(run, rw.potion);
        RUN.afterReward(run); break;
      }
      case 'graft': {
        const offer = run.pending.offer;
        let pick = null;
        if (rnd) {
          if (R.next() < 0.7 && offer.cards.length) { const uid = R.pick(offer.cards), gid = R.pick(offer.grafts); if (canGraft(RUN.findInst(run, uid), gid)) pick = [uid, gid]; }
        } else {
          for (const uid of offer.cards) { if (pick) break; if (canGraft(RUN.findInst(run, uid), offer.grafts[0])) pick = [uid, offer.grafts[0]]; }
        }
        if (pick) RUN.applyGraft(run, pick[0], pick[1]);
        else RUN.skipGraft(run, rnd ? R.pick(['heal', 'budget', 'gold']) : 'heal');
        RUN.afterGraft(run); break;
      }
      case 'shop': {
        const shop = run.pending;
        for (let k = 0; k < 4; k++) {
          const opts = [];
          shop.relics.forEach((r, i) => { if (!r.sold && run.gold >= r.price) opts.push(['relic', i]); });
          if (rnd) { shop.cards.forEach((r, i) => { if (!r.sold && run.gold >= r.price) opts.push(['card', i]); }); shop.potions.forEach((r, i) => { if (!r.sold && run.gold >= r.price && run.potions.length < RUN.potionSlots(run)) opts.push(['potion', i]); }); }
          if (!opts.length || (rnd && R.next() < 0.3)) break;
          const [kd, i] = rnd ? R.pick(opts) : opts[0];
          RUN.shopBuy(run, kd, i);
        }
        RUN.advance(run); break;
      }
      case 'forge': {
        if (rnd) { const ch = R.pick(['rest', 'expand', 'refine']); if (ch === 'refine') { const ups = run.deck.filter((x) => !x.up); if (ups.length) RUN.forgeAct(run, 'refine', R.pick(ups).uid); } else RUN.forgeAct(run, ch); }
        else RUN.forgeAct(run, run.hp / run.maxHp < 0.7 ? 'rest' : 'expand');
        RUN.advance(run); break;
      }
      case 'event': {
        const ch = RUN.eventChoices(run).filter((x) => x.ok && (!x.pick || x.cards.length));
        const best = rnd ? R.pick(ch) : ch[0];
        let uid; if (best.pick === 'card') uid = R.pick(best.cards);
        RUN.eventChoose(run, best.i, uid); RUN.afterEvent(run); break;
      }
      default: throw new Error('stuck in phase ' + run.phase);
    }
  }
  return { outcome: run.phase, act: run.act, floors: run.stats.floors, log };
}

export function runTier(tier, hero, seed, asc = 0, o = {}) {
  if (tier === 'random' || tier === 'sloppy') return lowRun(tier, hero, seed, asc, o);
  return playRun(hero, seed, tier === 'careful' ? POLICIES.carefulSlip : tier === 'careful_pure' ? POLICIES.careful : POLICIES[tier], asc, o);
}

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
export function summarize(rs) {
  const N = rs.length, won = rs.filter((r) => r.outcome === 'won').length;
  const a1 = rs.filter((r) => r.outcome === 'won' || r.act > 1).length, a2 = rs.filter((r) => r.outcome === 'won' || r.act > 2).length;
  const first = rs.filter((r) => r.log.fights.length && !r.log.fights[0].win).length;
  const first2 = rs.filter((r) => r.log.fights.slice(0, 2).some((f) => !f.win)).length;
  return { N, wins: won, win: won / N, act1: a1 / N, act2: a2 / N, medFloor: median(rs.map((r) => r.floors)), meanFloor: rs.reduce((a, r) => a + r.floors, 0) / N, medAct: median(rs.map((r) => (r.outcome === 'won' ? 4 : r.act))), firstDeath: first / N, firstTwoDeath: first2 / N };
}
export function measure(tier, n, asc = 0, o = {}) {
  const heroes = o.hero ? [o.hero] : Object.keys(HEROES);
  const rs = [];
  const perHero = tier === 'random' || tier === 'sloppy' ? Math.ceil(n / heroes.length) : n;
  for (const h of heroes) for (let i = 0; i < perHero; i++) rs.push(runTier(tier, h, `${o.tag || 'tier'}-${tier}-${h}-${i}`, asc, o));
  return summarize(rs);
}
const pct = (x) => (100 * x).toFixed(1).padStart(5) + '%';
export function row(tier, s) { return `${tier.padEnd(8)} N=${String(s.N).padEnd(5)} win ${pct(s.win)} (${s.wins})  act1 clear ${pct(s.act1)}  act2 clear ${pct(s.act2)}  floors med ${s.medFloor} mean ${s.meanFloor.toFixed(1)}  med death act ${s.medAct}  first fight lost ${pct(s.firstDeath)}  first two ${pct(s.firstTwoDeath)}`; }

if (process.argv[1] && process.argv[1].endsWith('graftwork_tiers.mjs')) {
  const [, , t, nArg, ascArg, assistArg, hero] = process.argv;
  const asc = +ascArg || 0, o = { assist: assistArg === "assist" ? ASSIST_ALL : undefined, hero: hero || undefined, tag: process.env.GW_TAG || "tier" };
  const defaults = { random: 1000, sloppy: 1000, careful: 300, strong: 300 };
  for (const tier of t && t !== 'all' ? [t] : Object.keys(defaults)) console.log(row(tier, measure(tier, +nArg || defaults[tier], asc, o)) + (o.assist ? '  [assist]' : ''));
}

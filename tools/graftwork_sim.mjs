// Headless full-run bot for GRAFTWORK: integration coverage + balance numbers.
//   node tools/graftwork_sim.mjs [runsPerHero=20] [ascension=0]
import * as RUN from '../graftwork/engine/run.js';
import { newCombat, playCard, endTurn, canPlay, intentOf, resolvePending, usePotion, finishCombat, specOf, effCost } from '../graftwork/engine/combat.js';
import { cardSpec, strainInfo, canGraft } from '../graftwork/engine/cards.js';
import { CARDS, GRAFTS, HEROES, ENEMIES } from '../graftwork/data/index.js';

export const POLICIES = {
  careful: { maxStrain: 1, greed: 0.3 }, // keeps the deck near Budget
  greedy: { maxStrain: 4, greed: 1 },    // piles weight onto few cards
  none: { maxStrain: 0, greed: 0, skipAll: true }, // never grafts
};

function fxValue(spec, threat) {
  let v = 0;
  const walk = (ops) => { for (const o of ops) {
    const n = typeof o.n === 'number' ? o.n : (o.n && o.n.base) || (o.n && o.n.per ? 4 : 0);
    if (o.op === 'dmg') v += n * (o.hits || 1) * (o.to === 'all' ? 1.8 : 1);
    else if (o.op === 'block') v += Math.min(n, Math.max(0, threat)) * 1.5 + n * 0.25;
    else if (o.op === 'status') v += o.to === 'self' || o.to === 'player' ? n * 2 : n * 1.8;
    else if (o.op === 'draw') v += n * 3;
    else if (o.op === 'energy') v += n * 5;
    else if (o.op === 'heal') v += n * 0.7;
    else if (o.op === 'detonate' || o.op === 'double') v += 8;
    else if (o.op === 'if') { walk(o.then || []); }
    else if (o.op === 'custom') v += 5;
  } };
  walk(spec.fx);
  v *= 1 + spec.repeat;
  return v * (1 + spec.pct / 100);
}

export function fight(run, pol, maxTurns = 40) {
  const kind = run.pending.fightKind;
  const c = newCombat(run, run.pending.enemies, { kind });
  let guard = 0;
  while (!c.over && c.turn <= maxTurns && guard++ < 3000) {
    let plays = 0;
    while (!c.over && plays++ < 25) {
      if (c.pending) { const p = c.pending; const pool = p.kind === 'fetch' ? (p.zone === 'exhaust' ? c.exhaust : c.discard) : c.hand; resolvePending(c, pool.slice(0, p.n).map((k) => k.uid)); continue; }
      const live = c.enemies.filter((e) => !e.dead);
      const threat = live.reduce((a, e) => a + intentOf(c, e).dmg, 0) - c.player.block;
      c._threat = threat;
      let best = -1, bs = 0.01;
      c.hand.forEach((k, i) => {
        const ck = canPlay(c, i); if (!ck.ok) return;
        const sp = ck.spec; const cost = ck.cost === 'X' ? 2 : ck.cost;
        const s = fxValue(sp, threat) / Math.max(0.7, cost) - (sp.price.selfHurt || 0) * 1.5 - (sp.flags.exhaust ? 1 : 0);
        if (s > bs) { bs = s; best = i; }
      });
      // use potion when low
      if (best < 0 || (c.player.hp < c.player.maxHp * 0.35 && run.potions.length)) {
        if (run.potions.length && c.player.hp < c.player.maxHp * 0.4) { const pi = 0; const tgt = c.enemies.findIndex((e) => !e.dead); usePotion(c, pi, tgt); if (c.pending) continue; }
        if (best < 0) break;
      }
      const sp = specOf(c, c.hand[best]);
      let ti = null;
      if (sp.target === 'enemy') { const t = live.slice().sort((a, b) => a.hp - b.hp)[0]; ti = c.enemies.indexOf(t); }
      playCard(c, best, ti);
      c.ev.length = 0;
    }
    if (c.over) break;
    endTurn(c); c.ev.length = 0;
  }
  if (!c.over) { c.over = 'lose'; c.player.hp = 0; }
  const res = finishCombat(c);
  res.turns = c.turn;
  return { res, c };
}

function chooseGraft(run, pol) {
  const offer = run.pending.offer;
  if (pol.skipAll || !offer.cards.length) return null;
  let best = null, bs = -1e9;
  for (const uid of offer.cards) {
    const inst = RUN.findInst(run, uid);
    const base = cardSpec(inst);
    for (const gid of offer.grafts) {
      if (!canGraft(inst, gid)) continue;
      const g = GRAFTS[gid];
      const pv = RUN.previewPick(run, uid, gid);
      const strain = pv.after.strain;
      if (strain > pol.maxStrain) continue;
      let s = (g.tier === 'greedy' ? 6 : g.tier === 'weird' ? 4 : 3) * (0.5 + pol.greed) - g.weight * 0.5;
      s += fxValue(cardSpec({ ...inst, grafts: [...inst.grafts, gid] }), 0) - fxValue(base, 0);
      s += inst.grafts.length * 1.5 * pol.greed; // stack onto the star
      s -= (strain - pv.before.strain) * 3;
      if (s > bs) { bs = s; best = [uid, gid]; }
    }
  }
  return best;
}

export function playRun(heroId, seed, pol = POLICIES.careful, asc = 0, o = {}) {
  const run = RUN.newRun({ hero: heroId, seed, ascension: asc });
  const log = { fights: [], grafts: 0, skips: 0, shatters: 0, events: 0, shops: 0 };
  let guard = 0;
  while (guard++ < 600 && run.phase !== 'dead' && run.phase !== 'won') {
    switch (run.phase) {
      case 'map': {
        const av = RUN.availableNodes(run);
        // prefer forge/shop when hurt, else random weighted toward fights
        const nodes = av.map((id) => run.map.nodes[id]);
        const pickN = nodes.find((n) => n.type === 'forge' && run.hp < run.maxHp * 0.6) || nodes.find((n) => n.type === 'shop' && run.gold > 150) || run.rng.pick(nodes);
        RUN.enterNode(run, pickN.id); break;
      }
      case 'combat': {
        const kind = run.pending.fightKind;
        const { res, c } = fight(run, pol);
        log.fights.push({ act: run.act, kind, win: res.win, turns: res.turns, hp: run.hp, enemies: run.pending.enemies.join('+') });
        log.shatters += res.shattered.length;
        RUN.resolveFight(run, res); break;
      }
      case 'reward': {
        const rw = run.pending;
        RUN.claimGold(run, rw);
        if (rw.relic) RUN.addRelic(run, rw.relic);
        if (rw.relicChoices && rw.relicChoices.length) RUN.addRelic(run, rw.relicChoices[0]);
        if (rw.potion) RUN.addPotion(run, rw.potion);
        const nxt = RUN.afterReward(run); if (nxt === 'act') {} break;
      }
      case 'graft': {
        const pick = chooseGraft(run, pol);
        if (pick) { RUN.applyGraft(run, pick[0], pick[1]); log.grafts++; }
        else { RUN.skipGraft(run, run.hp < run.maxHp * 0.7 ? 'heal' : 'budget'); log.skips++; }
        RUN.afterGraft(run); break;
      }
      case 'shop': {
        const shop = run.pending; log.shops++;
        for (let i = 0; i < shop.relics.length; i++) if (run.gold >= shop.relics[i].price) RUN.shopBuy(run, 'relic', i);
        for (let i = 0; i < shop.potions.length; i++) if (run.gold >= shop.potions[i].price && run.potions.length < 2) RUN.shopBuy(run, 'potion', i);
        const junk = run.deck.find((x) => CARDS[x.id].type === 'junk');
        if (junk && run.gold >= RUN.servicePrice(run, 'remove')) RUN.shopBuy(run, 'remove', 0, junk.uid);
        RUN.advance(run); break;
      }
      case 'forge': {
        if (run.hp < run.maxHp * 0.7) RUN.forgeAct(run, 'rest');
        else { const up = run.deck.find((x) => !x.up && CARDS[x.id].up && CARDS[x.id].type !== 'junk'); if (up) RUN.forgeAct(run, 'refine', up.uid); else RUN.forgeAct(run, 'expand'); }
        RUN.advance(run); break;
      }
      case 'event': {
        log.events++;
        const ch = RUN.eventChoices(run);
        const cand = ch.filter((x) => x.ok);
        const first = cand.find((x) => !x.pick) || cand[0];
        let uid; if (first.pick === 'card') uid = first.cards[0];
        RUN.eventChoose(run, first.i, uid);
        RUN.afterEvent(run); break;
      }
      default: throw new Error('stuck in phase ' + run.phase);
    }
  }
  const s = strainInfo(run);
  return { outcome: run.phase, act: run.act, row: run.row, floors: run.stats.floors, hp: run.hp, gold: run.gold, grafts: log.grafts, skips: log.skips, strain: s.strain, weight: s.weight, shatters: log.shatters, deck: run.deck.length, log, run };
}

if (process.argv[1] && process.argv[1].endsWith('graftwork_sim.mjs')) {
  const N = +process.argv[2] || 20, asc = +process.argv[3] || 0;
  for (const pname of Object.keys(POLICIES)) {
    for (const hero of Object.keys(HEROES)) {
      const rs = [];
      for (let i = 0; i < N; i++) rs.push(playRun(hero, `${pname}-${hero}-${i}`, POLICIES[pname], asc));
      const wins = rs.filter((r) => r.outcome === 'won').length;
      const acts = [0, 0, 0, 0]; rs.forEach((r) => { acts[r.outcome === 'won' ? 3 : r.act - 1]++; });
      const avg = (f) => (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(1);
      console.log(`${pname.padEnd(8)} ${hero.padEnd(7)} win ${wins}/${N}  died act1/2/3: ${acts[0]}/${acts[1]}/${acts[2]}  floors ${avg((r) => r.floors)} grafts ${avg((r) => r.grafts)} strain ${avg((r) => r.strain)} shatters ${avg((r) => r.shatters)} deck ${avg((r) => r.deck)}`);
    }
  }
}

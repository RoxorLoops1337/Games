// Hocus Vocus balance bot: static card valuation.
//
// The bot never hard-codes card ids. It reads every card as the effect DSL (DESIGN 4.4) and prices each op in "points", where
// one point is roughly one point of damage dealt or Block gained on a reference state (two enemies, three cards played, a few
// resource stacks). The same pricing drives drafting (what to take), upgrading and gem cutting (what a change is worth) and the
// combat planner's rough "what is still in my hand" potential.
//
//   const V = createValuer(G);
//   V.points(resolvedCard, ctx)       -> points per play (before synergy), ctx = { hero, deck } (both optional)
//   V.profile(deckInstances, heroIds, relicIds) -> deck profile used for synergy, role balance and resource supply
//   V.score(inst, profile)            -> { points, net, cost, tags } with synergy and role multipliers applied
//   V.tags(resolvedCard)              -> which resources and mechanics the card produces, spends or pays off
//
// All numbers below are heuristics, the knobs are in the tables at the top and every decision made with them is measurable in the
// report (card pick rates and win lift), so a wrong guess shows up as an outlier instead of hiding.
import { isNum, isObj, asList } from './game.mjs';

const RES = ['bloom', 'sumi', 'ward', 'charge'];

// value per stack of a debuff put on an enemy
const DEBUFF_VAL = { vulnerable: 4.0, weak: 2.6, frail: 0.6, mark: 2.8, stun: 7.5, poison: 1.7, burn: 1.35, bind: 0 };
// value per stack of a buff on a hero
const BUFF_VAL = { might: 5.0, bulwark: 4.5, regen: 3.2, thorns: 3.0, dodge: 4.6, taunt: 0.9, ritual: 8.5, plating: 1.5 };
const ENERGY_PRICE = 5.5;       // one Energy is worth about a Strike
const DRAW_VAL = 3.0;
const ALL_MUL = 1.8;            // damage to all enemies, relative to one target (about 2 enemies, overkill and dead targets)
const BLOCK_VAL = 0.85;
const HEAL_VAL = 0.9;

export function createValuer(G) {
  const { DATA } = G;

  function refStatus(profile, s) {
    if (RES.indexOf(s) >= 0) return profile && profile.supply ? profile.supply[s] : 2;
    // stacks of a status on a typical target: payoffs read the deck's appliers (poison and burn stack up, the rest stay small)
    const a = profile && profile.appliers ? (profile.appliers[s] || 0) : 0;
    if (s === 'poison') return Math.min(8, 2.2 + 1.3 * a);
    if (s === 'burn') return Math.min(8, 2 + 1.1 * a);
    if (s === 'thorns') return Math.min(6, 1.2 + 1.0 * a);
    return 1;
  }
  function evalV(v, ref, X) {
    if (isNum(v)) return v;
    if (!isObj(v)) return 0;
    let count = 0;
    switch (v.per) {
      case 'X': count = X; break;
      case 'handSize': count = 3; break;
      case 'drawPile': count = 10; break;
      case 'discardPile': count = 8; break;
      case 'exhaustPile': count = 1; break;
      case 'cardsPlayed': count = 2.2; break;
      case 'attacksPlayed': count = 1.2; break;
      case 'skillsPlayed': count = 1.2; break;
      case 'energy': count = 1; break;
      case 'block': count = v.who === 'ally' ? 4 : 6; break;
      case 'hp': count = 40; break;
      case 'missingHp': count = 14; break;
      case 'status': count = refStatus(ref.profile, v.s) * (v.who === 'target' || v.who === 'enemy' ? 0.9 : 1); break;
      case 'debuffs': count = 1.4; break;
      case 'enemies': count = 2; break;
      case 'kills': count = 1; break;
      case 'turn': count = 3; break;
      case 'gems': count = ref.gems || 0; break;
      case 'front': count = 0.5; break;
      case 'damageTaken': count = 8; break;
      case 'hitsTaken': count = 1.6; break;
      case 'targetBlock': count = 3; break;
      case 'picked': count = 1; break;
      default: count = 0;
    }
    if (v.upTo !== undefined) count = Math.min(count, v.upTo);
    let val = (v.base || 0) + (v.mul === undefined ? 1 : v.mul) * count;
    if (v.min !== undefined) val = Math.max(val, v.min);
    if (v.cap !== undefined) val = Math.min(val, v.cap);
    return Math.floor(val);
  }

  // probability a condition holds on a typical turn
  function condProb(c, ref) {
    let p = 1;
    Object.keys(c).forEach((k) => {
      const x = c[k];
      let q = 0.5;
      if (k === 'row') q = ref.hero && DATA.heroes[ref.hero] && DATA.heroes[ref.hero].prefer === x ? 0.62 : 0.38;
      else if (k === 'status') {
        if (RES.indexOf(x.s) >= 0) q = Math.min(0.95, Math.max(0.12, refStatus(ref.profile, x.s) / Math.max(1, x.gte || 1) * 0.8));
        else q = 0.45;
      } else if (k === 'hpPct') q = 0.3;
      else if (k === 'handEmpty') q = 0.08;
      else if (k === 'cardsPlayed' || k === 'attacksPlayed') q = x.lte !== undefined && x.lte <= 0 ? 0.3 : 0.55;
      else if (k === 'turn') q = x.lte !== undefined ? Math.min(1, 0.25 * x.lte) : x.gte !== undefined ? Math.max(0.2, 1 - 0.18 * x.gte) : 0.5;
      else if (k === 'lastKill') q = 0.25;
      else if (k === 'targetStatus') q = 0.5;
      else if (k === 'allyDown') q = 0.04;
      else if (k === 'block') q = x.gte !== undefined ? 0.5 : 0.5;
      else if (k === 'enemies') q = x.gte !== undefined && x.gte >= 2 ? 0.55 : 0.5;
      p *= q;
    });
    return p;
  }

  // triggers per fight of a hook, assuming the power is down for about 3.5 turns
  function hookTriggers(h) {
    const T = 2.7;
    let per = 1;
    switch (h.on) {
      case 'turnStart': case 'turnEnd': per = 1; break;
      case 'onPlay': {
        const f = h.filter || {};
        per = f.type === 'attack' ? 1.5 : f.type === 'skill' ? 1.3 : f.type === 'power' ? 0.2 : 2.6;
        if (f.cost) per *= 0.5;
        if (f.gems) per *= 0.5;
        if (f.kw) per *= 0.3;
        break;
      }
      case 'onDamaged': per = 1.8; break;
      case 'onKill': per = 0.5; break;
      case 'onSwap': per = 0.8; break;
      case 'onExhaust': per = 0.4; break;
      case 'onShuffle': per = 0.12; break;
      case 'onHeroDown': per = 0.1; break;
      case 'combatStart': return 1;
      default: per = 1;
    }
    let n = per * T;
    if (h.limit) n = Math.min(n, h.limit * T);
    if (h.once) n = Math.min(n, 1);
    if (h.every) n = n / h.every;
    return n;
  }

  // Points of an op list. st = { ctx, ref, X, temp:{status:true}, depth }
  function valueOps(ops, st) {
    let total = 0;
    asList(ops).forEach((op) => { total += valueOp(op, st); });
    return total;
  }
  const isRevert = (op) => op && op.op === 'hook' && op.on === 'turnEnd' && asList(op.fx).length && asList(op.fx).every((f) => f.op === 'status' && isNum(f.n) && f.n < 0);

  function valueOp(op, st) {
    if (!op) return 0;
    const ref = st.ref;
    const prof = ref.profile;
    const hero = ref.hero;
    const rowDmg = hero && DATA.heroes[hero] ? ((DATA.heroes[hero].rows[DATA.heroes[hero].prefer] || {}).dmgAdd || 0) * 0.85 + 0.3 : 0.4;
    const rowBlk = hero && DATA.heroes[hero] ? ((DATA.heroes[hero].rows[DATA.heroes[hero].prefer] || {}).blockAdd || 0) * 0.85 : 0;
    const X = st.X;
    switch (op.op) {
      case 'dmg': {
        const per = Math.max(0, evalV(op.n, ref, X)) + rowDmg + (st.might || 0);
        const hits = Math.max(0, op.hits === undefined ? 1 : evalV(op.hits, ref, X));
        const tgt = op.tgt || 'enemy';
        const mul = tgt === 'all' ? ALL_MUL : tgt === 'others' ? 0.8 : 1;
        let v = per * hits * mul;
        if (op.pierce) v *= 1.1;
        if (op.lifesteal) v *= 1.45;
        v -= consumeCost(op.consume, ref, X, op.n);
        return v;
      }
      case 'block': {
        const per = Math.max(0, evalV(op.n, ref, X)) + rowBlk;
        const tgt = op.tgt || 'self';
        const mul = tgt === 'both' ? 1.6 : tgt === 'ally' ? 0.95 : 1;
        return per * BLOCK_VAL * mul - consumeCost(op.consume, ref, X, op.n);
      }
      case 'heal': {
        const per = Math.min(14, Math.max(0, evalV(op.n, ref, X)));
        const tgt = op.tgt || 'self';
        return per * HEAL_VAL * (tgt === 'both' ? 1.8 : 1) - consumeCost(op.consume, ref, X, op.n);
      }
      case 'hurt': {
        const per = Math.max(0, evalV(op.n, ref, X));
        return -per * (op.tgt === 'ally' ? 1.0 : 0.95);
      }
      case 'status': return valueStatus(op, st);
      case 'removeStatus': {
        if (op.s === 'debuffs') return op.tgt === 'both' ? 3.5 : 2.2;
        if (op.s === 'buffs') return 2.2;
        const n = op.n === undefined ? 1 : evalV(op.n, ref, X);
        if (RES.indexOf(op.s) >= 0) return -priceOf(prof, op.s) * Math.max(0, n);
        return DEBUFF_VAL[op.s] ? DEBUFF_VAL[op.s] * 0.5 : 0.5;
      }
      case 'draw': return DRAW_VAL * Math.max(0, evalV(op.n, ref, X)) - consumeCost(op.consume, ref, X, op.n);
      case 'energy': return ENERGY_PRICE * evalV(op.n, ref, X) - consumeCost(op.consume, ref, X, op.n);
      case 'pick': {
        const n = Math.max(1, evalV(op.n, ref, X));
        const fromHand = op.from === 'hand';
        if (op.then === 'upgrade') return 1.6 * n;
        if (op.then === 'copy') return 3.0 * n;
        if (op.then === 'toHand' || op.then === 'toDrawTop') return 2.4 * n;
        if (op.then === 'retain') return 1.4 * n;
        if (op.then === 'exhaust' || op.then === 'discard') return (fromHand ? 1.6 : 0.8) * (op.optional ? 0.7 : 1) * n;
        return 1.2 * n;
      }
      case 'add': {
        const def = DATA.cards[op.card];
        const n = op.n === undefined ? 1 : evalV(op.n, ref, X);
        if (def && (def.type === 'curse' || def.type === 'status')) return -2.6 * n;
        return 3.2 * n;
      }
      case 'swap': return 0.9;
      case 'gold': return 0.25 * evalV(op.n, ref, X);
      case 'ink': return 4.0 * evalV(op.n, ref, X);
      case 'maxHp': return 2.0 * evalV(op.n, ref, X);
      case 'revive': return 10;
      case 'cond': {
        const p = condProb(op.if || {}, ref);
        return p * valueOps(op.then, st) + (1 - p) * valueOps(op.else, st);
      }
      case 'repeat': {
        const n = Math.max(0, Math.min(12, evalV(op.n, ref, X)));
        return n * valueOps(op.do, st);
      }
      case 'hook': {
        if (isRevert(op)) return 0;
        const sub = Object.assign({}, st, { depth: (st.depth || 0) + 1 });
        const body = valueOps(op.fx, sub);
        return body * hookTriggers(op) * 0.8;
      }
      default: return 0;
    }
  }

  function priceOf(profile, s) {
    if (!profile || !profile.resPrice) return 0.9;
    return profile.resPrice[s] === undefined ? 0.9 : profile.resPrice[s];
  }
  function consumeCost(consume, ref, X, nExpr) {
    if (!consume) return 0;
    const s = typeof consume === 'string' ? consume : consume.s;
    if (s === 'block') return 0;     // the Block that is spent was already paid for by the card that made it
    if (RES.indexOf(s) < 0) return 0;
    let upTo = typeof consume === 'object' && consume.upTo !== undefined ? evalV(consume.upTo, ref, X) : (isObj(nExpr) && nExpr.upTo !== undefined ? nExpr.upTo : 99);
    const have = refStatus(ref.profile, s);
    return Math.min(upTo, have) * priceOf(ref.profile, s) * 0.55;
  }

  function valueStatus(op, st) {
    const ref = st.ref;
    const prof = ref.profile;
    const n = evalV(op.n, ref, st.X);
    const s = op.s;
    const debuff = DATA.isDebuff(s);
    const tgt = op.tgt || (debuff ? 'enemy' : 'self');
    const enemySide = ['enemy', 'all', 'random', 'lowest', 'others'].indexOf(tgt) >= 0;
    if (RES.indexOf(s) >= 0) return n * priceOf(prof, s) * (tgt === 'self' || tgt === 'ally' ? 1 : 0.5);
    if (enemySide) {
      const w = DEBUFF_VAL[s] === undefined ? (DATA.isDebuff(s) ? 1 : -0.5) : DEBUFF_VAL[s];
      let v;
      if (s === 'poison') v = Math.min(n, 10) * w + Math.max(0, n - 10) * 0.6;
      else v = n * w;
      if (s === 'stun' && ref.stunUnreliable) v *= 0.6;
      if (tgt === 'all') v *= 1.7;
      if (tgt === 'others') v *= 0.8;
      if (tgt === 'random') v *= 1.0;
      return v;
    }
    // hero side
    if (debuff) return -Math.abs(n) * 2.2;                           // a debuff on our own side
    const heroTargets = tgt === 'both' ? 2 : 1;
    if (n < 0) {
      // removing stacks of a buff from ourselves is a cost (temporary effects revert on turn end and are priced as temporary below)
      return st.temp && st.temp[s] ? 0 : (BUFF_VAL[s] || 1) * n * 0.5;
    }
    if (s === 'might') {
      const per = st.temp && st.temp.might ? 2.3 : 5.0;
      st.might = (st.might || 0) + n;
      return n * per * (tgt === 'both' ? 1.8 : tgt === 'ally' ? 0.95 : 1);
    }
    const w = BUFF_VAL[s] === undefined ? 1 : BUFF_VAL[s];
    return n * w * (tgt === 'both' ? 1.8 : 1);
  }

  // points of a resolved card (DATA.resolveCard output). Never throws on unknown shapes.
  function points(res, ctx) {
    ctx = ctx || {};
    if (!res || !res.fx) return 0;
    if (res.type === 'curse' || res.type === 'status') return -4;
    const ref = { hero: ctx.hero || res.hero, profile: ctx.profile || null, gems: res.gems ? res.gems.filter(Boolean).length : 0 };
    const temp = {};
    asList(res.fx).forEach((op) => {
      if (isRevert(op)) asList(op.fx).forEach((f) => { temp[f.s] = true; });
    });
    const X = res.costX ? (ctx.xEnergy || 2.4) : 0;
    const st = { ref, X, temp, might: 0 };
    const v = valueOps(res.fx, st);
    return v;
  }

  // ---------------------------------------------------------------- tags (what a card produces or spends or pays off)
  function tags(res) {
    const t = { produces: {}, consumes: {}, payoff: {}, attack: false, aoe: false, block: 0, dmg: 0, draw: 0, energy: 0, heal: 0, hits: 0, applies: {}, row: null, selfHurt: 0, power: res.type === 'power', exhaust: (res.kw || []).indexOf('exhaust') >= 0, x: !!res.costX };
    const walk = (ops, mult) => {
      asList(ops).forEach((op) => {
        if (!op) return;
        switch (op.op) {
          case 'dmg': {
            const n = isNum(op.n) ? op.n : isObj(op.n) ? (op.n.base || 0) + (op.n.cap || (op.n.upTo ? op.n.upTo * (op.n.mul || 1) : 4)) : 0;
            const hits = isNum(op.hits) ? op.hits : isObj(op.hits) ? 3 : 1;
            t.dmg += n * hits * mult; t.attack = true; t.hits = Math.max(t.hits, hits);
            if (op.tgt === 'all') t.aoe = true;
            if (isObj(op.n) && op.n.per === 'status') (t.payoff[op.n.s] = t.payoff[op.n.s] || 0), (t.payoff[op.n.s] += 1);
            if (isObj(op.n) && op.n.per === 'debuffs') t.payoff.debuffs = (t.payoff.debuffs || 0) + 1;
            if (isObj(op.n) && op.n.per === 'block') t.payoff.block = (t.payoff.block || 0) + 1;
            if (isObj(op.n) && (op.n.per === 'damageTaken' || op.n.per === 'hitsTaken')) t.payoff.hurt = (t.payoff.hurt || 0) + 1;
            if (isObj(op.n) && op.n.per === 'cardsPlayed') t.payoff.cardsPlayed = (t.payoff.cardsPlayed || 0) + 1;
            if (op.consume) { const s = typeof op.consume === 'string' ? op.consume : op.consume.s; t.consumes[s] = (t.consumes[s] || 0) + 1; }
            break;
          }
          case 'block': {
            const n = isNum(op.n) ? op.n : isObj(op.n) ? (op.n.base || 0) + 4 : 0;
            t.block += n * mult;
            if (isObj(op.n) && op.n.per === 'status') t.payoff[op.n.s] = (t.payoff[op.n.s] || 0) + 1;
            if (op.consume) { const s = typeof op.consume === 'string' ? op.consume : op.consume.s; t.consumes[s] = (t.consumes[s] || 0) + 1; }
            break;
          }
          case 'heal': t.heal += (isNum(op.n) ? op.n : 4) * mult; if (op.consume) { const s = typeof op.consume === 'string' ? op.consume : op.consume.s; t.consumes[s] = (t.consumes[s] || 0) + 1; } break;
          case 'draw': t.draw += (isNum(op.n) ? op.n : 1) * mult; break;
          case 'energy': t.energy += (isNum(op.n) ? op.n : 1) * mult; break;
          case 'hurt': t.selfHurt += (isNum(op.n) ? op.n : 3); break;
          case 'status': {
            const n = isNum(op.n) ? op.n : isObj(op.n) ? (op.n.base || 1) + 2 : 1;
            if (RES.indexOf(op.s) >= 0) { if (n > 0) t.produces[op.s] = (t.produces[op.s] || 0) + n * mult; }
            else if (DATA.isDebuff(op.s) && ['enemy', 'all', 'random', 'lowest', 'others', undefined].indexOf(op.tgt) >= 0) t.applies[op.s] = (t.applies[op.s] || 0) + n * mult;
            else if (n > 0) t.applies[op.s] = (t.applies[op.s] || 0) + n * mult;
            if (isObj(op.n) && op.n.per === 'status') t.payoff[op.n.s] = (t.payoff[op.n.s] || 0) + 1;
            if (op.consume) { const s = typeof op.consume === 'string' ? op.consume : op.consume.s; t.consumes[s] = (t.consumes[s] || 0) + 1; }
            break;
          }
          case 'removeStatus': if (RES.indexOf(op.s) >= 0) t.consumes[op.s] = (t.consumes[op.s] || 0) + 1; break;
          case 'cond': {
            const c = op.if || {};
            if (c.status && RES.indexOf(c.status.s) >= 0) t.payoff[c.status.s] = (t.payoff[c.status.s] || 0) + 1;
            if (c.row) t.row = c.row;
            walk(op.then, mult * 0.6); walk(op.else, mult * 0.4);
            break;
          }
          case 'repeat': walk(op.do, mult * 2.2); break;
          case 'hook': walk(op.fx, mult * 2.5); break;
          case 'pick': t.pick = true; break;
          case 'swap': t.swap = true; break;
          default: break;
        }
      });
    };
    walk(res.fx, 1);
    return t;
  }

  // ---------------------------------------------------------------- deck profile
  const PASSIVE_SUPPLY = { bloom: 0.9, sumi: 0.8, ward: 1.0, charge: 1.1 };
  function profile(deck, heroIds, relicIds) {
    const P = { n: 0, cards: [], supply: {}, resPrice: {}, prod: { bloom: 0, sumi: 0, ward: 0, charge: 0 }, cons: { bloom: 0, sumi: 0, ward: 0, charge: 0 }, appliers: {}, payoff: {}, dmgPts: 0, blkPts: 0, avgCost: 0, aoe: 0, draw: 0, heroIds: heroIds || [], relics: relicIds || [] };
    let costSum = 0;
    const entries = [];
    asList(deck).forEach((inst) => {
      const res = DATA.resolveCard(inst);
      if (!res || !res.fx) return;
      if (res.type === 'curse' || res.type === 'status') { P.junk = (P.junk || 0) + 1; P.n += 1; return; }
      const tg = tags(res);
      entries.push({ inst, res, tg });
      P.n += 1;
      costSum += res.costX ? 2 : (isNum(res.cost) ? res.cost : 1);
      RES.forEach((r) => { if (tg.produces[r]) P.prod[r] += tg.produces[r]; if (tg.consumes[r] || tg.payoff[r]) P.cons[r] += 1; });
      Object.keys(tg.applies).forEach((s) => { P.appliers[s] = (P.appliers[s] || 0) + 1; });
      Object.keys(tg.payoff).forEach((s) => { P.payoff[s] = (P.payoff[s] || 0) + tg.payoff[s]; });
      P.dmgPts += tg.dmg * (tg.aoe ? 1.6 : 1);
      P.blkPts += tg.block + tg.heal * 0.8;
      if (tg.aoe) P.aoe += 1;
      P.draw += tg.draw;
    });
    P.entries = entries;
    P.avgCost = entries.length ? costSum / entries.length : 1;
    const N = Math.max(8, P.n);
    // resource supply: passive per turn plus producers in the deck (five cards drawn a turn), accumulated over about two turns
    const relicBoost = { bloom: 0, sumi: 0, ward: 0, charge: 0 };
    asList(relicIds).forEach((id) => {
      const r = DATA.relics[id];
      if (r && r.hero) { const hres = DATA.heroes[r.hero] && DATA.heroes[r.hero].res; if (hres) relicBoost[hres] += 0.8; }
    });
    RES.forEach((r) => {
      const hasHero = asList(heroIds).some((h) => DATA.heroes[h] && DATA.heroes[h].res === r);
      const passive = hasHero ? PASSIVE_SUPPLY[r] : 0;
      const perTurn = passive + relicBoost[r] + P.prod[r] * (5 / N) * 0.9;
      P.supply[r] = Math.max(0, Math.min(6, perTurn * 1.9));
      // price of a stack: high when the deck has things that spend it
      const consumers = P.cons[r];
      P.resPrice[r] = hasHero ? Math.min(1.5, 0.55 + 0.25 * consumers) : 0.2;
    });
    return P;
  }

  const DMG_SHARE_TARGET = 0.6;
  // net worth of a card instance to a deck: static points with synergy and role balance, minus the Energy it uses
  function score(inst, P, opts) {
    opts = opts || {};
    const res = DATA.resolveCard(inst);
    if (!res || !res.fx) return { points: 0, net: -9, cost: 0, tags: null, res };
    const hero = res.hero;
    const ctx = { hero, profile: P };
    let pts = points(res, ctx);
    const tg = tags(res);
    let mul = 1;
    if (P) {
      // resource payoffs need a supply, producers are worth more with spenders
      RES.forEach((r) => {
        if (tg.consumes[r] || tg.payoff[r]) mul *= 0.62 + 0.14 * Math.min(4, P.supply[r] * 1.1);
        if (tg.produces[r]) mul *= 0.85 + 0.06 * Math.min(4, P.cons[r]);
      });
      Object.keys(tg.payoff).forEach((s) => {
        if (RES.indexOf(s) >= 0) return;
        if (s === 'debuffs') mul *= 0.7 + 0.1 * Math.min(4, (P.appliers.vulnerable || 0) + (P.appliers.weak || 0) + (P.appliers.mark || 0) + (P.appliers.poison || 0) + (P.appliers.burn || 0));
        else if (s === 'block') mul *= 0.75 + 0.05 * Math.min(5, P.blkPts / 12);
        else if (s === 'poison' || s === 'burn' || s === 'thorns') mul *= 0.55 + 0.17 * Math.min(3, P.appliers[s] || 0);
        else if (s === 'hurt') mul *= 0.9;
        else if (s === 'cardsPlayed') mul *= 0.8 + 0.05 * Math.min(4, P.avgCost < 1 ? 4 : 1);
      });
      if (tg.aoe && P.aoe >= 3) mul *= 0.9;
      // role balance: keep defence at about 40 percent of damage-plus-defence points
      const tot = P.dmgPts + P.blkPts;
      if (tot > 20) {
        const share = P.dmgPts / tot;
        if (tg.block + tg.heal > tg.dmg * 0.8 && share > DMG_SHARE_TARGET) mul *= 1 + Math.min(0.35, (share - DMG_SHARE_TARGET) * 1.6);
        else if (tg.dmg > tg.block * 1.2 && share < DMG_SHARE_TARGET - 0.08) mul *= 1 - Math.min(0.3, (DMG_SHARE_TARGET - 0.08 - share) * 1.6);
      }
    }
    pts *= mul;
    const cost = res.costX ? 2.2 : (isNum(res.cost) ? res.cost : 1);
    let net = pts - ENERGY_PRICE * cost;
    if (res.type === 'power') net *= opts.powerFactor === undefined ? 0.95 : opts.powerFactor;
    if (res.type === 'power' && cost >= 2 && P && P.n > 18) net -= 1.0;
    // very expensive cards stall the hand
    if (cost >= 3) net -= 1.2;
    if (P && P.avgCost > 1.45 && cost >= 2) net -= 1.0;
    return { points: pts, net, cost, tags: tg, res, mul };
  }

  return { points, tags, profile, score, valueOps, evalV, ENERGY_PRICE, RES };
}

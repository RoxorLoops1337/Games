// Echowake balance bot: the combat player.
//
// COMBAT has no clone, but it is exactly deterministic, so the bot "clones" a combat by replaying the action list from the
// start (create, start, apply every action so far, then the candidate). That makes lookahead exact for everything the card DSL can
// do (statuses, hooks, picks, draws, X cost, rows) without the bot knowing a single card id.
//
// Default mode ("rollout"): every legal first action (a card with each distinct target, a swap) is scored by the state right after it
// and by the state after COMBAT.greedyPolicy finishes the turn from there, so a first step that looks poor alone (stripping Block,
// putting Vulnerable on, building a resource) is credited for the plays it enables; the best few first actions get a second ply the same
// way; one action is executed and the turn is planned again until nothing beats ending the turn. Pick answers are searched the same
// way. A second mode ("beam") keeps a beam of whole-turn sequences scored at turn end only (it was weaker: it cannot see setups).
//
// `evaluate` scores a state in "HP lost equivalents" (higher is better):
//   * hero HP now, minus the damage the visible enemy intents will do in the next enemy phase given each hero's Block and Dodge
//     (convex: hits that take a hero low cost more, a hero going down costs a lot), minus junk-card and debuff costs,
//   * minus the damage the enemies still alive will do over the rest of the fight (a Lanchester estimate: enemies die in the order of
//     damage-per-HP and each pays its damage until its death time), which makes target selection and AoE versus single target fall
//     out of the arithmetic (heals, Dodge and Thorns on an enemy are priced in its effective HP),
//   * plus a small price for hero resources, Might and powers on the field.
// Measured against COMBAT.greedyPolicy on the same decks and fights it loses 30 to 45 percent less HP and wins more fights (see the
// report header and tests/rogue_book_bot.test.mjs).
//
// Fair planning (default; cfg.clairvoyant turns it off). A replay uses the real RNG, so left alone the bot would know the order of its
// own draw pile and what a draw effect will bring. Before it tries its candidate actions it therefore RE-SHUFFLES the draw pile of its
// planning copy (a determinization: same cards, hidden order, one sample per decision, shared by every candidate so the comparison is
// fair), the way a human who knows the contents but not the order of the pile reasons. The real combat is never touched: the chosen
// action is then played on the true state. What is still seen: "random" targets and a reshuffle in the middle of a lookahead come from
// the engine's private RNG, which the bot cannot reseed, so for the plays inside one turn they are partly predictable. The bot does
// NOT see the next turn's hand or the enemy's next weighted roll (it never ends the turn inside a lookahead), and like a human it
// reads the visible intents.
import { isNum, isObj, asList } from './game.mjs';

const WIN = 1000;
const LOSE = -1000;
const DOWN_PEN = 45;

export function createCombatAI(G, V, cfg) {
  const defaults = { beam: 3, depth: 8, maxReplays: 150, potential: 0, mode: 'rollout', clairvoyant: false };
  const given = cfg || {};
  cfg = Object.assign({}, defaults);
  Object.keys(given).forEach((k) => { if (given[k] !== undefined) cfg[k] = given[k]; });
  const { COMBAT, DATA, U } = G;
  const threatCache = new Map();

  // ------------------------------------------------------------------ static enemy threat (damage-equivalents per round)
  function nOf(n, dflt) {
    if (isNum(n)) return n;
    if (isObj(n)) return (n.base || 0) + (n.cap !== undefined ? n.cap * 0.55 : (n.mul === undefined ? 1 : n.mul) * 2);
    return dflt === undefined ? 0 : dflt;
  }
  const HERO_DEBUFF = { weak: 2.6, vulnerable: 3.6, frail: 1.8, poison: 1.7, burn: 1.3, bind: 2.2, stun: 7 };
  function moveThreat(mv) {
    let t = 0;
    const walk = (ops, mult) => {
      asList(ops).forEach((op) => {
        if (!op) return;
        if (op.op === 'dmg') t += nOf(op.n) * Math.max(1, nOf(op.hits, 1)) * (op.tgt === 'both' ? 1.8 : 1) * mult;
        else if (op.op === 'status') {
          const hero = ['front', 'back', 'both', 'random', 'lowest'].indexOf(op.tgt) >= 0 || (op.tgt === undefined && DATA.isDebuff(op.s));
          const n = nOf(op.n, 1);
          if (hero && HERO_DEBUFF[op.s]) t += HERO_DEBUFF[op.s] * n * (op.tgt === 'both' ? 1.7 : 1) * mult;
          else if (!hero && op.s === 'ritual') t += 5 * n * mult;
          else if (!hero && op.s === 'might') t += 3 * n * mult;
        } else if (op.op === 'heal') t += (op.tgt === 'self' || op.tgt === undefined ? 0.35 : 0.75) * nOf(op.n) * mult;
        else if (op.op === 'block') t += (op.tgt === 'allEnemies' || op.tgt === 'otherEnemy' ? 0.5 : 0.25) * nOf(op.n) * mult;
        else if (op.op === 'add') t += 2.6 * nOf(op.n, 1) * mult;
        else if (op.op === 'summon') t += 4.5 * (op.n || 1) * mult;
        else if (op.op === 'stealGold') t += 1.5 * mult;
        else if (op.op === 'cond') { walk(op.then, mult * 0.6); walk(op.else, mult * 0.4); }
      });
    };
    walk(mv && mv.fx, 1);
    return t;
  }
  function enemyDpr(defId) {
    if (threatCache.has(defId)) return threatCache.get(defId);
    const def = DATA.enemies[defId];
    let dpr = 6;
    if (def && def.ai) {
      const ai = def.ai;
      let base = 0;
      if (ai.seq && ai.seq.length) base = ai.seq.reduce((s, m) => s + moveThreat(def.moves[m]), 0) / ai.seq.length;
      else if (ai.weighted && ai.weighted.length) {
        const tw = ai.weighted.reduce((s, e) => s + e[1], 0) || 1;
        base = ai.weighted.reduce((s, e) => s + e[1] * moveThreat(def.moves[e[0]]), 0) / tw;
      }
      let w = 0, extra = 0;
      asList(ai.rules).forEach((r) => {
        const te = r.if && r.if.turnEvery;
        const frac = te ? 1 / te[0] : (r.once ? 0.05 : 0.18);
        w += frac; extra += frac * moveThreat(def.moves[r.do]);
      });
      w = Math.min(0.6, w);
      dpr = base * (1 - w) + extra;
    }
    threatCache.set(defId, dpr);
    return dpr;
  }

  // ------------------------------------------------------------------ state evaluation
  const livingEnemies = (C) => C.enemies.filter((e) => !e.down).sort((a, b) => a.lane - b.lane);

  function incoming(C) {
    const hs = C.heroes.filter((h) => !h.down).map((h) => ({ h, hp: h.hp, block: h.block, dodge: h.st.dodge || 0, thorns: h.st.thorns || 0, loss: 0, soft: 0 }));
    const byId = {};
    hs.forEach((x) => { byId[x.h.id] = x; });
    const thornDmg = {};
    let junk = 0, side = 0;
    livingEnemies(C).forEach((e) => {
      if ((e.st.poison || 0) >= e.hp) return;                        // dies on its own tick before acting
      const it = C.intent(e);
      if (!it || it.stunned) return;
      if (it.dmg > 0 && it.hits > 0 && hs.length) {
        let targets;
        if (it.tgt === 'random') targets = hs;
        else targets = asList(it.tgt).map((id) => byId[id]).filter(Boolean);
        if (!targets.length) targets = [hs[0]];
        const per = it.tgt === 'random' ? 1 : targets.length;
        const hitsEach = it.tgt === 'random' ? it.hits : it.hits;
        for (let ti = 0; ti < targets.length; ti++) {
          const t = targets[ti];
          const nh = it.tgt === 'random' ? Math.floor(it.hits / targets.length) + (ti < it.hits % targets.length ? 1 : 0) : hitsEach;
          for (let k = 0; k < nh; k++) {
            if (t.dodge > 0) { t.dodge -= 1; continue; }
            const ab = Math.min(t.block, it.dmg);
            t.block -= ab;
            t.loss += it.dmg - ab;
            if (t.thorns) thornDmg[e.id] = (thornDmg[e.id] || 0) + t.thorns;
          }
        }
        void per;
      }
      (it.statuses || []).forEach((s) => {
        if (['front', 'back', 'both', 'random', 'lowest'].indexOf(s.to) < 0) return;
        const w = HERO_DEBUFF[s.s];
        if (!w) return;
        side += w * Math.max(1, s.n) * (s.to === 'both' ? 1.7 : 1) * (s.s === 'poison' ? 1 : 0.9);
      });
      (it.adds || []).forEach((a) => { junk += 2.2 * a.n; });
    });
    // poison on heroes ticks at the start of their next turn
    hs.forEach((x) => { const p = x.h.st.poison || 0; if (p > 0) x.loss += Math.min(p, Math.max(0, x.hp)); const b = x.h.st.burn || 0; if (b > 0) x.loss += b * 0.9; });
    return { hs, thornDmg, junk, side };
  }

  function heroTerm(inc) {
    let v = 0, downs = 0;
    inc.hs.forEach((x) => {
      const hpAfter = x.hp - x.loss;
      const maxHp = x.h.maxHp;
      if (hpAfter <= 0) { downs += 1; v += -DOWN_PEN - 0.2 * (-hpAfter); return; }
      const frac = hpAfter / maxHp;
      let pen = x.loss * (0.55 * x.loss / Math.max(8, x.hp));
      if (frac < 0.3) pen += (0.3 - frac) * maxHp * 0.7;
      v += hpAfter - pen;
    });
    return { v, downs };
  }

  // marginal enemy list: [{e, dpr, ehp}] sorted by kill order, plus total damage-per-round
  function enemyTable(C, thornDmg) {
    const items = [];
    livingEnemies(C).forEach((e) => {
      const poison = e.st.poison || 0, burn = e.st.burn || 0;
      if (poison >= e.hp) return;
      let ehp = e.hp - (thornDmg[e.id] || 0) - poison - (poison > 1 ? (poison - 1) * poison / 2 * 0.6 : 0) - burn * 1.2;
      if ((e.st.vulnerable || 0) > 1) ehp *= 0.8;
      ehp += 5.5 * (e.st.dodge || 0);                                // each Dodge stack eats one hit
      ehp = Math.max(1, ehp);
      let dpr = enemyDpr(e.def);
      if ((e.st.might || 0) > 0 || (e.st.ritual || 0) > 0) dpr += (e.st.might || 0) * 1.2 + (e.st.ritual || 0) * 2.5;
      if ((e.st.weak || 0) > 1) dpr *= 0.8;
      if (e.tier === 'minion') dpr *= 0.9;
      items.push({ e, dpr, ehp });
    });
    items.sort((a, b) => (b.dpr / b.ehp) - (a.dpr / a.ehp));
    return items;
  }
  function lanchester(items, D) {
    let cum = 0, F = 0;
    items.forEach((it) => { cum += it.ehp; F += it.dpr * Math.max(0, cum / D - 0.6); });
    return F;
  }
  function weights(items, D) {
    // marginal HP-equivalent value of one damage point on each enemy (in kill order)
    const W = new Map();
    let rest = items.reduce((s, it) => s + it.dpr, 0);
    items.forEach((it) => { W.set(it.e.id, Math.max(0.15, rest / D)); rest -= it.dpr; });
    return W;
  }

  function resourceTerm(C) {
    let v = 0;
    C.heroes.forEach((h) => {
      if (h.down) return;
      ['bloom', 'sumi', 'ward', 'charge'].forEach((r) => { v += 0.55 * Math.min(8, h.st[r] || 0); });
      v += 0.8 * Math.max(0, h.st.might || 0) + 1.0 * (h.st.bulwark || 0) + 0.6 * (h.st.thorns || 0) + 0.5 * (h.st.regen || 0);
    });
    return v;
  }
  function powerTerm(C, fx) {
    let v = 0;
    C.powers.forEach((c) => {
      const res = DATA.resolveCard(c);
      v += Math.max(0, V.points(res, { hero: res.hero, profile: fx.profile })) * 0.32;
    });
    return v;
  }

  function potential(C, fx, W, inc, rest) {
    if (!cfg.potential) return 0;
    const pw = cfg.potential === true ? 1 : cfg.potential;
    const energy = C.energy;
    if (energy <= 0 || !C.hand.length) return 0;
    const lossNow = inc.hs.reduce((s, x) => s + Math.max(0, x.loss), 0);
    const items = [];
    const seen = new Set();
    for (const card of C.hand) {
      const sig = card.id + ':' + card.up + ':' + card.gems.join(',');
      if (seen.has(sig)) { const prev = items.find((i) => i.sig === sig); if (prev) prev.count += 1; continue; }
      seen.add(sig);
      const res = DATA.resolveCard(card);
      if (!res || res.playableType === null || (res.kw || []).indexOf('unplayable') >= 0) continue;
      const cost = res.costX ? energy : (isNum(res.cost) ? res.cost : 1);
      if (cost > energy) continue;
      const targets = C.needsTarget(card.uid) ? C.legalTargets(card.uid) : [undefined];
      if (!targets.length) continue;
      let bestVal = -1e9;
      for (const t of targets.slice(0, 4)) {
        const chk = C.canPlay(card.uid, t);
        if (!chk.ok) continue;
        const pv = C.preview(card.uid, t);
        const w = t ? (W.get(t) || 0.5) : Math.max(...Array.from(W.values()), 0.5);
        const allMul = asList(res.fx).some((o) => o.op === 'dmg' && o.tgt === 'all') ? Math.max(1, Math.min(3, W.size) * 0.85) : 1;
        const dmg = (pv.dmg || 0) * (pv.hits || 1) * allMul;
        const tu = t ? C.unit(t) : null;
        const capped = tu ? Math.min(dmg, tu.hp + tu.block) : dmg;
        const nonDmg = V.valueOps(asList(res.fx).filter((o) => o.op !== 'dmg' && o.op !== 'block'), { ref: { hero: res.hero, profile: fx.profile, gems: 0 }, X: energy, temp: {}, might: 0 });
        const blk = Math.min(pv.block || 0, Math.max(0, lossNow - rest.used) + 3) * 0.9;
        const val = w * capped * 0.8 + blk + (pv.heal || 0) * 0.5 + nonDmg * 0.55;
        if (val > bestVal) bestVal = val;
      }
      if (bestVal > -1e8) items.push({ sig, cost: Math.max(0, cost), val: bestVal, count: 1 });
    }
    if (!items.length) return 0;
    // 0/1 knapsack over at most ~7 distinct cards (duplicates expand once)
    const list = [];
    items.forEach((it) => { for (let k = 0; k < Math.min(it.count, 3); k++) list.push(it); });
    const cap = Math.max(0, Math.floor(energy));
    const dp = new Array(cap + 1).fill(0);
    list.forEach((it) => {
      const c = Math.floor(it.cost);
      if (c > cap) return;
      for (let e = cap; e >= c; e--) { if (dp[e - c] + Math.max(0, it.val) > dp[e]) dp[e] = dp[e - c] + Math.max(0, it.val); }
    });
    return dp[cap] * 0.8 * pw;
  }

  function evaluate(C, fx) {
    if (C.result === 'win') {
      let hp = 0;
      C.heroes.forEach((h) => { if (!h.down) hp += h.hp; });
      return WIN + hp - 8 * C.heroes.filter((h) => h.down).length;
    }
    if (C.result === 'lose') return LOSE;
    const inc = incoming(C);
    const ht = heroTerm(inc);
    if (ht.downs >= inc.hs.length && inc.hs.length) return LOSE / 2 + ht.v;
    const D = fx.D(C);
    const table = enemyTable(C, inc.thornDmg);
    const F = lanchester(table, D);
    const W = weights(table, D);
    let v = ht.v - inc.junk - inc.side - F + resourceTerm(C) + powerTerm(C, fx);
    // dead enemies are worth nothing more, but a kill is worth the damage it stops (already in F). Reward cleared enemy count a bit
    const dead = C.enemies.filter((e) => e.down).length;
    v += 0.4 * dead;
    v += potential(C, fx, W, inc, { used: 0 });
    // energy left on the table is only a loss if something was playable: the potential term covers it
    return v;
  }

  // ------------------------------------------------------------------ search
  // fair = { at, seed } hides the order of the draw pile from the planner: after the first `at` actions (the real history) the draw pile of
  // this throwaway copy is shuffled with a seeded stream, then the remaining (hypothetical) actions are applied.
  function replay(opts, hist, fair) {
    const C = COMBAT.create(opts);
    C.start();
    for (let i = 0; i < hist.length; i++) {
      if (fair && i === fair.at) hideDrawOrder(C, fair.seed, fair.pre);
      COMBAT.applyAction(C, hist[i]);
    }
    if (fair && hist.length <= fair.at) hideDrawOrder(C, fair.seed, fair.pre);
    return C;
  }
  // The pile is put in a canonical order first (by uid), so what the planner sees depends on WHICH cards are in the draw pile and never on
  // the order the real shuffle gave them (tests/rogue_book_bot.test.mjs checks this by permuting the real pile).
  function hideDrawOrder(C, seed, pre) {
    if (pre) pre(C);
    if (C.phase !== 'player' || C.draw.length < 2) return;
    C.draw.sort((a, b) => a.uid - b.uid);
    const r = U.rng(seed);
    for (let i = C.draw.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = C.draw[i]; C.draw[i] = C.draw[j]; C.draw[j] = t;
    }
  }

  function stateKey(C) {
    let k = C.energy + '|' + C.hand.map((c) => c.uid).sort((a, b) => a - b).join(',') + '|' + (C.pending ? 'p' : '');
    C.heroes.forEach((h) => { k += `|${h.hp}.${h.block}.${h.row}.${JSON.stringify(h.st)}`; });
    C.enemies.forEach((e) => { if (!e.down) k += `|${e.id}.${e.hp}.${e.block}.${JSON.stringify(e.st)}`; });
    k += '|' + C.draw.length + '.' + C.discard.length + '.' + C.exhaust.length + '.' + C.powers.length;
    return k;
  }

  function candidates(C) {
    const out = [];
    const seenCards = new Set();
    for (const card of C.hand) {
      const sig = card.id + ':' + card.up + ':' + card.gems.join(',');
      if (seenCards.has(sig)) continue;
      const chk0 = C.canPlay(card.uid, C.needsTarget(card.uid) ? (C.legalTargets(card.uid)[0]) : undefined);
      if (!chk0.ok) { if (chk0.reason === 'energy' || chk0.reason === 'unplayable' || chk0.reason === 'down' || chk0.reason === 'stunned') seenCards.add(sig); continue; }
      seenCards.add(sig);
      if (C.needsTarget(card.uid)) {
        const seenT = new Set();
        for (const t of C.legalTargets(card.uid)) {
          const e = C.unit(t);
          const ts = e ? `${e.def}:${e.hp}:${e.block}:${JSON.stringify(e.st)}` : t;
          if (seenT.has(ts)) continue;
          seenT.add(ts);
          out.push({ type: 'play', uid: card.uid, target: t });
        }
      } else out.push({ type: 'play', uid: card.uid, target: undefined });
    }
    const cs = C.canSwap();
    if (cs.ok && (cs.cost === 0 || C.energy >= 1)) out.push({ type: 'swap' });
    return out;
  }

  function cardWorth(inst, fx) {
    const key = inst.id + ':' + inst.up + ':' + inst.gems.join(',');
    const worthCache = fx.worth;
    if (worthCache.has(key)) return worthCache.get(key);
    const d = DATA.cards[inst.id];
    let w = -10;
    if (d && d.type !== 'curse' && d.type !== 'status') w = V.score(inst, fx.profile).net;
    worthCache.set(key, w);
    return w;
  }

  function* combos(arr, k) {
    if (k === 0) { yield []; return; }
    for (let i = 0; i <= arr.length - k; i++) for (const rest of combos(arr.slice(i + 1), k - 1)) yield [arr[i], ...rest];
  }

  // answer the pending pick of C (a state reached by hist) by trying each sensible answer
  function resolvePending(opts, hist, C, fx, budget, fair) {
    const p = C.pending;
    if (!p) return { hist, C };
    const pile = p.from === 'hand' ? C.hand : p.from === 'draw' ? C.draw : p.from === 'discard' ? C.discard : C.exhaust;
    const cands = p.uids.map((uid) => pile.find((c) => c.uid === uid)).filter(Boolean);
    const junkFirst = p.then === 'discard' || p.then === 'exhaust';
    cands.sort((a, b) => (junkFirst ? cardWorth(a, fx) - cardWorth(b, fx) : cardWorth(b, fx) - cardWorth(a, fx)) || a.uid - b.uid);
    const top = cands.slice(0, 6);
    const options = [];
    const sizes = p.optional ? Array.from({ length: Math.min(p.n, top.length) + 1 }, (_, i) => i) : [Math.min(p.n, cands.length)];
    sizes.forEach((k) => {
      let c = 0;
      for (const sub of combos(top, k)) { options.push(sub.map((x) => x.uid)); if (++c >= 12) break; }
    });
    if (!options.length) options.push(cands.slice(0, p.n).map((c) => c.uid));
    let best = null;
    for (const uids of options) {
      const h2 = hist.concat([{ type: 'pick', uids }]);
      const C2 = replay(opts, h2, fair);
      budget.n += 1;
      if (C2.pending) continue;                                      // refused or chained: skip
      const v = evaluate(C2, fx) + (junkFirst ? 0 : 0);
      if (!best || v > best.v + 1e-9) best = { v, hist: h2, C: C2 };
    }
    if (!best) {
      const uids = cands.slice(0, p.n).map((c) => c.uid);
      const h2 = hist.concat([{ type: 'pick', uids }]);
      return { hist: h2, C: replay(opts, h2, fair), v: -1e9 };
    }
    return best;
  }

  function planTurn(opts, hist, C, fx) {
    const budget = { n: 0 };
    let root = { hist, C, v: evaluate(C, fx) };
    let best = root;
    let beam = [root];
    const seen = new Set([stateKey(C)]);
    for (let depth = 0; depth < cfg.depth && beam.length; depth++) {
      const next = [];
      for (const node of beam) {
        if (node.C.phase !== 'player' || node.C.result) continue;
        const cands = candidates(node.C);
        for (const a of cands) {
          if (budget.n >= cfg.maxReplays) break;
          const h2 = node.hist.concat([a]);
          let C2 = replay(opts, h2);
          budget.n += 1;
          if (!C2.hand) continue;
          let hh = h2;
          if (C2.pending) { const r = resolvePending(opts, h2, C2, fx, budget); hh = r.hist; C2 = r.C; }
          if (C2.pending) continue;
          const key = stateKey(C2);
          if (seen.has(key)) continue;
          seen.add(key);
          const v = evaluate(C2, fx);
          if (cfg.debugTurn === C2.turn && depth === 0) console.log('   cand', JSON.stringify(a), (C2.hand ? '' : ''), v.toFixed(2), 'root', root.v.toFixed(2), 'enemies', C2.enemies.filter((e) => !e.down).map((e) => e.id + ' hp' + e.hp + ' blk' + e.block + ' dodge' + (e.st.dodge || 0)).join(' '));
          next.push({ hist: hh, C: C2, v });
        }
      }
      if (!next.length) break;
      next.sort((x, y) => y.v - x.v);
      beam = next.slice(0, cfg.beam);
      if (beam[0].v > best.v + 1e-6) best = beam[0];
      else if (depth >= 1 && beam[0].v <= best.v + 1e-6) {
        // nothing in this layer beats the best seen: one more layer is allowed only if a setup could still pay off
        if (depth >= 2) break;
      }
      if (best.C.result) break;
    }
    return { best, replays: budget.n, rootV: root.v };
  }

  // ------------------------------------------------------------------ rollout search (default)
  // Every candidate action is scored by what the state is worth after COMBAT.greedyPolicy finishes the turn from there (and, as a floor,
  // by the state right after the action), so a first step that looks bad on its own (stripping Block, applying Vulnerable, building a
  // resource) is credited for the plays it enables. One action is executed, then the turn is planned again.
  function rolloutValue(C, fx) {
    for (let k = 0; k < 12; k++) {
      if (C.phase !== 'player' || C.result) break;
      const a = COMBAT.greedyPolicy(C);
      if (!a || a.type === 'end') break;
      const ev = COMBAT.applyAction(C, a);
      if (!ev.length && !C.pending) break;
    }
    return evaluate(C, fx);
  }
  function scoreChild(opts, hist, a, fx, budget, fair) {
    let h2 = hist.concat([a]);
    let C2 = replay(opts, h2, fair);
    budget.n += 1;
    if (!C2.hand) return null;
    if (C2.pending) { const r = resolvePending(opts, h2, C2, fx, budget, fair); h2 = r.hist; C2 = r.C; }
    if (C2.pending) return null;
    const key = stateKey(C2);
    const v1 = evaluate(C2, fx);
    let vr = v1;
    if (!C2.result && C2.phase === 'player') vr = Math.max(v1, rolloutValue(C2, fx));       // C2 is a throwaway replay: the rollout may mutate it
    return { a, hist: h2, v1, key, score: Math.max(v1, vr) };
  }
  function planRollout(opts, hist, C, fx, pre) {
    const budget = { n: 0 };
    const root = evaluate(C, fx);
    const fair = cfg.clairvoyant ? null : { at: hist.length, seed: U.hash(opts.seed, 'fair', C.turn, hist.length), pre };
    const seen = new Set([stateKey(C)]);
    const firsts = [];
    for (const a of candidates(C)) {
      if (budget.n >= cfg.maxReplays) break;
      const r = scoreChild(opts, hist, a, fx, budget, fair);
      if (!r || seen.has(r.key)) continue;
      seen.add(r.key);
      firsts.push(r);
    }
    firsts.sort((x, y) => y.score - x.score);
    let best = firsts[0] || null;
    // second ply on the best few first moves
    for (const f of firsts.slice(0, cfg.beam)) {
      if (budget.n >= cfg.maxReplays) break;
      const Cf = replay(opts, f.hist, fair); budget.n += 1;
      if (Cf.phase !== 'player' || Cf.result || Cf.pending) continue;
      for (const a of candidates(Cf)) {
        if (budget.n >= cfg.maxReplays) break;
        const r = scoreChild(opts, f.hist, a, fx, budget, fair);
        if (r && r.score > f.score + 1e-6 && r.score > (best ? best.score : -1e9) + 1e-6) best = { a: f.a, hist: f.hist, v1: f.v1, score: r.score, via: r.a };
      }
    }
    return { best, root, replays: budget.n };
  }

  // ------------------------------------------------------------------ one whole fight
  // opts: the COMBAT.create options. Returns { C, hist, actions, replays, summary }
  function makeFx(opts) {
    const deck = opts.deck || [];
    const relicIds = opts.relics || [];
    const heroIds = (opts.heroes || []).map((h) => h.id);
    const profile = V.profile(deck, heroIds, relicIds);
    const prior = Math.max(9, Math.min(60, profile.n ? (profile.dmgPts / profile.n) * 3.4 * (0.8 + 0.12 * (opts.chapter || 1)) : 14));
    return {
      profile,
      worth: new Map(),                                              // per fight: it depends on this fight's deck profile
      D: (C) => {
        const t = Math.max(0, C.turn - 1);
        const seenDmg = C.stats.damageDealt || 0;
        return Math.max(7, (prior * 1.6 + seenDmg) / (1.6 + t));
      },
    };
  }
  // One decision of the rollout planner at the state reached by hist: the action it would play, or { type: 'end' }. `pre(C)` (tests only) may
  // reorder the draw pile of the planning copy before it is hidden, to prove the choice does not depend on the real order.
  function decide(opts, hist, pre) {
    const fx = makeFx(opts);
    const C = replay(opts, hist);
    if (C.phase !== 'player' || C.pending) return null;
    const plan = planRollout(opts, hist, C, fx, pre);
    return plan.best && plan.best.score > plan.root + 1e-6 ? plan.best.a : { type: 'end' };
  }
  function fight(opts, info) {
    info = info || {};
    const fx = makeFx(opts);
    let hist = [];
    let C = replay(opts, hist);
    let replays = 0, turns = 0, guard = 0;
    const maxTurns = opts.maxTurns || 60;
    while (C.phase !== 'over' && guard++ < 400) {
      if (C.turn > maxTurns) break;
      if (C.phase !== 'player') {
        // not expected (endTurn runs the enemy phase and the next player phase), but never spin
        const a = { type: 'end' };
        hist = hist.concat([a]); C = replay(opts, hist);
        continue;
      }
      if (C.pending) { const r = resolvePending(opts, hist, C, fx, { n: 0 }); hist = r.hist; C = r.C; if (C.pending) break; continue; }
      if (cfg.mode === 'beam') {
        const plan = planTurn(opts, hist, C, fx);
        replays += plan.replays;
        if (info.trace) info.trace({ turn: C.turn, energy: C.energy, hand: C.hand.map((c) => c.id + (c.up ? '+' : '')), enemies: C.enemies.filter((e) => !e.down).map((e) => e.id + ':' + e.hp), rootV: plan.rootV, bestV: plan.best.v, plan: plan.best.hist.slice(hist.length), replays: plan.replays, D: fx.D(C) });
        hist = plan.best.hist; C = plan.best.C;
        if (C.phase === 'over') break;
        const end = { type: 'end' };
        COMBAT.applyAction(C, end);
        hist = hist.concat([end]);
        turns += 1;
        continue;
      }
      // rollout mode: execute one action at a time, replan after each
      const plan = planRollout(opts, hist, C, fx);
      replays += plan.replays;
      if (info.trace) info.trace({ turn: C.turn, energy: C.energy, hand: C.hand.map((c) => c.id + (c.up ? '+' : '')), enemies: C.enemies.filter((e) => !e.down).map((e) => e.id + ':' + e.hp), rootV: plan.root, bestV: plan.best ? plan.best.score : plan.root, plan: plan.best ? plan.best.hist.slice(hist.length) : [], replays: plan.replays, D: fx.D(C) });
      if (plan.best && plan.best.score > plan.root + 1e-6) {
        // play only the first action of the plan, on the true state: a pick it raises is answered next, from the real piles
        hist = hist.concat([plan.best.a]);
        C = replay(opts, hist);
        replays += 1;
        continue;
      }
      const end = { type: 'end' };
      COMBAT.applyAction(C, end);
      hist = hist.concat([end]);
      turns += 1;
    }
    const summary = C.summary();
    return { C, hist, turns: C.turn, actions: hist.length, replays, summary };
  }

  return { fight, decide, evaluate, enemyDpr, cfg };
}

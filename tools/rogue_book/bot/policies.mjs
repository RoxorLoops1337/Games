// Echowake balance bot: run-level decision policies (draft, relics, gems, shop, camp, forge, events, pending choices).
//
// Everything is priced in "HP-equivalents" so very different things can be compared: one HP is 1, one point of damage or Block
// on a card is worth roughly 6 HP-equivalents over a run when it is a permanent upgrade of a card that is played often, one Ink is
// about 4, one gold about 0.3. The numbers are in the tables below and nowhere else.
import { isNum, isObj, asList } from './game.mjs';
import { archetypeOf } from './archetypes.mjs';

const GOLD_VAL = 0.3;
const INK_VAL = 3.2;
const MAXHP_VAL = 2.4;
const UP_VAL = 6.0;       // value of one point of card "net" gained by an upgrade or a gem
const CURSE_VAL = { curse_regret: -17, curse_smudge: -9, curse_doubt: -13, curse_burden: -12, curse_hex: -17, curse_decay: -15 };

export function createPolicies(G, V, cfg) {
  const { DATA, RUN, U } = G;
  cfg = cfg || {};

  // ------------------------------------------------------------------ small readers
  const heroIds = (R) => R.heroes.map((h) => h.id);
  const isJunk = (id) => { const d = DATA.cards[id]; return !d || d.type === 'curse' || d.type === 'status'; };
  const hpFrac = (R) => {
    let hp = 0, mx = 0, mn = 1;
    R.heroes.forEach((h) => { hp += h.hp; mx += h.maxHp; mn = Math.min(mn, h.hp / h.maxHp); });
    return { avg: mx ? hp / mx : 1, min: mn, missing: mx - hp };
  };
  const profileOf = (R) => V.profile(R.deck, heroIds(R), R.relics);
  const blankInst = (id, up) => ({ uid: -1, id, up: up ? 1 : 0, gems: ((DATA.cards[id] && DATA.cards[id].slots) || []).map(() => null) });

  // net of every real card in the deck (the draft compares a candidate with the deck it joins)
  function deckNets(R, P) {
    const rows = [];
    R.deck.forEach((c) => {
      if (isJunk(c.id)) return;
      rows.push({ inst: c, net: V.score(c, P).net });
    });
    return rows;
  }
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

  // archetype commitment: once a hero's deck leans on an archetype, cards of that archetype gain, cards of the others lose a little
  const archCache = new Map();
  const archOf = (id) => { if (!archCache.has(id)) archCache.set(id, archetypeOf(DATA, V, id)); return archCache.get(id); };
  function archBonus(R, id) {
    const d = DATA.cards[id];
    const a = d && archOf(id);
    if (!a) return 0;
    const counts = {};
    R.deck.forEach((c) => {
      const dc = DATA.cards[c.id];
      if (!dc || dc.hero !== d.hero || dc.rarity === 'starter') return;
      const x = archOf(c.id);
      if (x) counts[x] = (counts[x] || 0) + 1;
    });
    const names = Object.keys(counts).sort((p, q) => counts[q] - counts[p]);
    const lead = names[0];
    const strength = cfg.archetype === undefined ? 1 : cfg.archetype;
    if (!lead || counts[lead] < 2) return 0.25 * strength * Math.min(2, counts[a] || 0);
    if (a === lead) return strength * 0.5 * Math.min(5, counts[lead]);
    return -strength * 0.14 * Math.min(5, counts[lead]);
  }

  // ------------------------------------------------------------------ cards: draft
  // Returns { id|null, net, thr } for an offer list. rng adds exploration noise so every card gets sampled by some runs.
  function chooseCard(R, offers, rng, opt) {
    opt = opt || {};
    const P = profileOf(R);
    const nets = deckNets(R, P);
    const m = mean(nets.map((x) => x.net));
    const n = nets.length;
    const thr = m + 0.7 + 0.16 * Math.max(0, n - 15) + (opt.thrAdd || 0) + (cfg.pickBias || 0);
    let best = null;
    asList(offers).forEach((id) => {
      const d = DATA.cards[id];
      if (!d) return;
      const s = V.score(blankInst(id, 0), P);
      let net = s.net + (d.rarity === 'rare' ? 0.8 : d.rarity === 'uncommon' ? 0.3 : 0) + archBonus(R, id);
      const noise = (cfg.draftNoise === undefined ? 1.3 : cfg.draftNoise) * (rng() + rng() + rng() - 1.5) * 1.15;
      net += noise;
      // two near-identical copies of one cost-0 or power card are rarely wanted
      const copies = R.deck.filter((c) => c.id === id).length;
      if (copies >= 2) net -= 1.2 * (copies - 1);
      if (d.type === 'power' && copies >= 1) net -= 3;
      if (!best || net > best.net) best = { id, net, thr, raw: s.net };
    });
    if (!best) return { id: null, net: 0, thr };
    if (opt.forced) return best;
    const skipNoise = (cfg.draftNoise === undefined ? 1.3 : cfg.draftNoise) * 0.5 * (rng() - 0.5);
    if (best.net - thr + skipNoise < 0) return { id: null, net: best.net, thr };
    return best;
  }

  // ------------------------------------------------------------------ gems and upgrades
  function instWithGem(inst, slot, gemId) {
    const g = inst.gems.slice();
    g[slot] = gemId;
    return { uid: inst.uid, id: inst.id, up: inst.up, gems: g };
  }
  // best (card, slot) for a gem, gain in net points. Replacing is penalised by what the old gem was worth.
  function bestSocket(R, gemId, P, minGain) {
    const gem = DATA.gems[gemId];
    if (!gem) return null;
    let best = null;
    R.deck.forEach((c) => {
      if (isJunk(c.id)) return;
      const slots = (DATA.cards[c.id] && DATA.cards[c.id].slots) || [];
      const base = V.score(c, P).net;
      slots.forEach((col, i) => {
        if (col !== 'any' && col !== gem.color) return;
        if (c.gems[i] === gemId) return;
        let gain = V.score(instWithGem(c, i, gemId), P).net - base;
        if (c.gems[i]) {
          const old = V.score(instWithGem(c, i, null), P).net;
          gain = V.score(instWithGem(c, i, gemId), P).net - V.score(c, P).net;
          void old;
          gain -= 0.5;                                                // destroying a gem is a small waste
        }
        // a gem on a card that is almost never played is wasted: nothing to adjust here, play frequency is similar for all
        if (!best || gain > best.gain) best = { uid: c.uid, slot: i, gem: gemId, gain, id: c.id };
      });
    });
    return best && best.gain >= (minGain === undefined ? 0.4 : minGain) ? best : null;
  }
  function bestGemOf(R, gemIds) {
    const P = profileOf(R);
    let best = null;
    asList(gemIds).forEach((g) => {
      const s = bestSocket(R, g, P, -99);
      const gain = s ? s.gain : -1;
      const tierBonus = (DATA.gems[g] && DATA.gems[g].tier) * 0.3;
      if (!best || gain + tierBonus > best.v) best = { id: g, v: gain + tierBonus, gain };
    });
    return best;
  }
  // cut every gem that gains something; returns the number cut. permitReplace: allow destroying a worse gem.
  function socketAll(R, permitReplace) {
    let cut = 0;
    for (let guard = 0; guard < 20; guard++) {
      if (!R.gems.length) break;
      const P = profileOf(R);
      let best = null;
      const seen = new Set();
      R.gems.forEach((g) => {
        if (seen.has(g)) return; seen.add(g);
        const s = bestSocket(R, g, P, 0.6);
        if (!s) return;
        const inst = R.deck.find((c) => c.uid === s.uid);
        if (inst.gems[s.slot] && !permitReplace) return;
        if (!best || s.gain > best.gain) best = s;
      });
      if (!best) break;
      const res = RUN.socket(R, best.uid, best.slot, best.gem);
      if (!res.ok) break;
      cut += 1;
    }
    return cut;
  }
  function socketGain(R) {
    // total net gain available from the gems in the bag (for deciding whether a camp or forge visit is worth a gem session)
    const P = profileOf(R);
    let tot = 0;
    const seen = new Set();
    R.gems.forEach((g) => {
      if (seen.has(g)) return; seen.add(g);
      const s = bestSocket(R, g, P, 0.6);
      if (s) { const inst = R.deck.find((c) => c.uid === s.uid); if (!inst.gems[s.slot]) tot += s.gain; }
    });
    return tot;
  }
  function bestUpgrade(R) {
    const P = profileOf(R);
    let best = null;
    RUN.upgradable(R).forEach((uid) => {
      const c = R.deck.find((x) => x.uid === uid);
      if (!c) return;
      const d = DATA.cards[c.id];
      const gain = V.score({ uid: c.uid, id: c.id, up: 1, gems: c.gems }, P).net - V.score(c, P).net;
      if (!best || gain > best.gain) best = { uid, id: c.id, gain, rarity: d.rarity };
    });
    return best;
  }

  // ------------------------------------------------------------------ removal
  function removalCandidates(R, filter) {
    const P = profileOf(R);
    const nets = deckNets(R, P);
    const m = mean(nets.map((x) => x.net));
    const out = [];
    R.deck.forEach((c) => {
      const d = DATA.cards[c.id];
      if (filter && filter.type && (!d || d.type !== filter.type)) return;
      if (filter && filter.hero && (!d || d.hero !== filter.hero)) return;
      let util;
      if (isJunk(c.id)) {
        // a curse is a dead card that also hurts: removing it beats removing ANY playable card. Priced as a card whose net is its (negative)
        // curse value over the Energy scale, so it always ranks above the weakest starter however strong the rest of the deck has become.
        const dead = -(CURSE_VAL[c.id] || -12);
        util = 4.2 * Math.max(0, m) + dead + 1.5;
      } else {
        const net = V.score(c, P).net;
        util = (m - net) * 4.2 - 2.5 - (c.up ? 3 : 0) - c.gems.filter(Boolean).length * 4;
        if (R.deck.length <= 12) util -= 8;
      }
      out.push({ uid: c.uid, id: c.id, util });
    });
    out.sort((a, b) => b.util - a.util);
    return out;
  }

  // ------------------------------------------------------------------ relics
  const MOD_VAL = { energy: 70, hand: 45, startBlock: 8.5, inkMax: 1.6, startInk: 5, wellInk: 7.5, cardChoices: 14, freeSwaps: 7, campActions: 12, rareBoost: 0.9 };
  const FRAC_VAL = { goldMul: 80, priceMul: -55, healMul: 38 };
  const ROW_VAL = { dmgAdd: 11, blockAdd: 7, startBlock: 9, regen: 8, thorns: 7, drawAdd: 15 };
  function hookFights(h) {
    // triggers per whole run, in units of "per fight triggers" x fights remaining (about 20), crude but monotone
    let per = 1;
    switch (h.on) {
      case 'turnStart': case 'turnEnd': per = 4.2; break;
      case 'onPlay': { const f = h.filter || {}; per = f.type === 'attack' ? 6 : f.type === 'skill' ? 5 : 12; if (f.cost) per *= 0.5; if (f.gems) per *= 0.5; break; }
      case 'onDamaged': per = 5; break;
      case 'onKill': per = 2.3; break;
      case 'onSwap': per = 2.2; break;
      case 'onExhaust': per = 1.5; break;
      case 'onShuffle': per = 0.7; break;
      case 'onHeroDown': per = 0.15; break;
      case 'combatStart': per = 1; break;
      case 'combatEnd': per = 1; break;
      default: per = 1;
    }
    if (h.limit && ['onPlay', 'onDamaged', 'onSwap', 'onKill', 'onExhaust'].indexOf(h.on) >= 0) per = Math.min(per, h.limit * 2.2);
    if (h.once) per = Math.min(per, 1);
    if (h.every) per = per / h.every;
    return per;
  }
  function runOpsHookValue(R, ops) { return runOpsValue(R, ops, { quick: true }); }
  const RUN_HOOK_TIMES = { onPickup: 1, onChapterStart: 2.5, onRest: 3, onPaint: 45, onFightWon: 20, onShopEnter: 3 };
  function relicScore(R, id) {
    const r = DATA.relics[id];
    if (!r) return -99;
    let v = 0;
    Object.keys(r.mods || {}).forEach((k) => {
      const x = r.mods[k];
      if (MOD_VAL[k] !== undefined) v += MOD_VAL[k] * x;
      else if (FRAC_VAL[k] !== undefined) v += FRAC_VAL[k] * x;
    });
    Object.keys(r.rows || {}).forEach((row) => {
      Object.keys(r.rows[row]).forEach((k) => { v += (ROW_VAL[k] || 3) * r.rows[row][k] * (row === 'front' ? 1.0 : 0.7); });
    });
    const P = profileOf(R);
    asList(r.hooks).forEach((h) => {
      if (DATA.LISTS.runHooks.indexOf(h.on) >= 0) {
        let per = RUN_HOOK_TIMES[h.on] || 1;
        if (h.filter && h.filter.tier) per *= (asList(h.filter.tier).indexOf('boss') >= 0 ? 0.1 : asList(h.filter.tier).indexOf('elite') >= 0 ? 0.2 : 0.8);
        const every = h.every ? 1 / h.every : 1;
        const lim = h.limit ? Math.min(per * every, h.limit * 3) : per * every;
        v += runOpsHookValue(R, h.fx) * (h.once ? 1 : lim);
      } else {
        const res = { fx: h.fx, type: 'skill', hero: r.hero || null, gems: [] };
        const pts = V.points(res, { hero: r.hero || null, profile: P });
        v += pts * hookFights(h) * 3.0 * (r.hero ? 0.9 : 1);
      }
    });
    if (r.hero && heroIds(R).indexOf(r.hero) < 0) return -99;
    return v;
  }

  // ------------------------------------------------------------------ run ops (events and run hooks)
  function curseValue(id) { return CURSE_VAL[id] !== undefined ? CURSE_VAL[id] : -14; }
  function runOpsValue(R, ops, opt) {
    opt = opt || {};
    let v = 0;
    const hf = hpFrac(R);
    const low = hf.avg < 0.5;
    asList(ops).forEach((op) => {
      if (!op) return;
      switch (op.op) {
        case 'gold': { const n = op.n !== undefined ? op.n : Math.trunc(R.gold * op.pct); v += GOLD_VAL * (n < 0 && !opt.quick ? Math.max(n, -R.gold) : n); break; }
        case 'ink': { const n = op.n !== undefined ? op.n : Math.trunc(R.inkMax * op.pct); const real = opt.quick ? n : (n > 0 ? Math.min(n, Math.max(0, R.inkMax - R.ink)) : Math.max(n, -R.ink)); v += INK_VAL * real; break; }
        case 'heal': {
          const mul = RUN.mods(R).healMul;
          const who = op.who || 'both';
          R.heroes.forEach((h) => {
            if (who === 'front' && h !== R.heroes[R.frontIdx]) return;
            if (who !== 'both' && who !== 'front' && who !== 'lowest' && who !== 'random' && h.id !== who) return;
            const base = op.n !== undefined ? op.n : Math.round(h.maxHp * op.pct);
            const amt = opt.quick ? Math.round(base * mul) * 0.6 : Math.min(h.maxHp - h.hp, Math.round(base * mul));
            v += amt * (who === 'lowest' || who === 'random' ? 0.5 : 1);
          });
          break;
        }
        case 'hurt': {
          const who = op.who || 'both';
          R.heroes.forEach((h) => {
            if (who === 'front' && h !== R.heroes[R.frontIdx]) return;
            if (who !== 'both' && who !== 'front' && who !== 'lowest' && who !== 'random' && h.id !== who) return;
            const n = op.n !== undefined ? op.n : Math.max(1, Math.round(h.maxHp * op.pct));
            const real = Math.min(n, h.hp - 1);
            v -= real * (low ? 1.6 : 1.0) * (who === 'lowest' || who === 'random' ? 0.5 : 1);
          });
          break;
        }
        case 'maxHp': {
          const who = op.who || 'both';
          const cnt = (who === 'both') ? 2 : 1;
          v += MAXHP_VAL * op.n * cnt;
          break;
        }
        case 'addCard': {
          if (op.card) { const P = profileOf(R); v += Math.max(1, V.score(blankInst(op.card, op.up), P).net * 3 + 4); }
          else v += (op.rarity === 'rare' ? 17 : op.rarity === 'uncommon' ? 11 : op.rarity === 'common' ? 6.5 : 8) * (op.n || 1);
          break;
        }
        case 'removeCard': {
          if (opt.quick) { v += 6; break; }
          const c = removalCandidates(R, op.filter);
          const n = Math.min(op.n || 1, c.length);
          if (op.random) { v += mean(c.map((x) => x.util)) * n; break; }
          for (let i = 0; i < n; i++) v += Math.max(-9, c[i].util);
          if (!n) v -= 2;
          break;
        }
        case 'upgradeCard': {
          if (opt.quick) { v += 9; break; }
          const b = bestUpgrade(R);
          const n = op.n || 1;
          v += b ? (op.random ? Math.max(4, b.gain * 0.55 * UP_VAL) * n : Math.max(5, b.gain * UP_VAL) * n) : 0;
          break;
        }
        case 'transformCard': v += 2.5; break;
        case 'duplicateCard': v += 9; break;
        case 'addRelic': {
          if (op.id) v += Math.max(8, relicScore(R, op.id));
          else v += op.rarity === 'rare' ? 42 : op.rarity === 'uncommon' ? 30 : 22;
          break;
        }
        case 'addGem': v += 7 + 5 * (op.tier || 1.7); break;
        case 'addBrush': v += 8; break;
        case 'addCurse': v += curseValue(op.id) * (op.n || 1); break;
        case 'fight': {
          const loss = fightLoss(R, op);
          const tier = op.tier === 'elite' ? 'elite' : 'normal';
          const reward = op.rewards === false ? 0 : (tier === 'elite' ? 38 : 15);
          v += reward - loss * (low ? 1.7 : 1.0) + (op.win ? runOpsValue(R, op.win, opt) : 0);
          break;
        }
        case 'flag': {
          const k = op.k;
          const used = Object.keys(DATA.events).some((id) => { const e = DATA.events[id]; return (e.when && e.when.flag === k) || e.choices.some((c) => c.req && c.req.flag === k); });
          v += used ? 7 : 0.2;
          break;
        }
        case 'paint': v += 3.3 * op.n; break;
        case 'cardReward': v += op.rarity === 'rare' ? 18 : op.rarity === 'uncommon' ? 13 : 10; break;
        default: break;
      }
    });
    return v;
  }
  function fightLoss(R, op) {
    const ids = op.enemies || ((DATA.groupById(op.enc) || {}).enemies) || [];
    let loss = 0;
    const ch = R.chapter;
    ids.forEach((id) => {
      const d = DATA.enemies[id];
      if (!d) return;
      const base = d.tier === 'elite' ? 26 : d.tier === 'minion' ? 3 : 11;
      loss += base * (0.7 + 0.28 * ch);
    });
    return loss;
  }
  function eventChoiceValue(R, ev, i) {
    const ch = ev.choices[i];
    const outs = ch.out || [];
    const tw = outs.reduce((s, o) => s + o.w, 0) || 1;
    const vals = outs.map((o) => runOpsValue(R, o.ops || []));
    const ev0 = outs.reduce((s, o, k) => s + o.w * vals[k], 0) / tw;
    const varc = outs.reduce((s, o, k) => s + o.w * (vals[k] - ev0) * (vals[k] - ev0), 0) / tw;
    const hf = hpFrac(R);
    const risk = hf.avg < 0.5 ? 0.6 : 0.28;
    return ev0 - risk * Math.sqrt(varc);
  }
  function chooseEventOption(R, evId) {
    const ev = DATA.events[evId];
    const choices = RUN.eventChoices(R, ev);
    let best = null;
    choices.forEach((c) => {
      if (!c.ok || c.hidden) return;
      const v = eventChoiceValue(R, ev, c.index);
      if (!best || v > best.v) best = { index: c.index, v };
    });
    return best;
  }

  // ------------------------------------------------------------------ shop
  function shopItemUtility(R, item, P, m) {
    if (item.kind === 'card') {
      const s = V.score(blankInst(item.id, 0), P);
      const copies = R.deck.filter((c) => c.id === item.id).length;
      let net = s.net + archBonus(R, item.id) - (copies >= 2 ? 1.2 * (copies - 1) : 0) - (DATA.cards[item.id].type === 'power' && copies >= 1 ? 3 : 0);
      const n = R.deck.length;
      const thr = m + 0.5 + 0.16 * Math.max(0, n - 15) + (cfg.pickBias || 0);
      return Math.max(0, net - thr) * 8;
    }
    if (item.kind === 'relic') return Math.max(0, relicScore(R, item.id)) * 0.9;
    if (item.kind === 'gem') {
      const s = bestSocket(R, item.id, P, 0.4);
      return s ? s.gain * UP_VAL : 0;
    }
    if (item.kind === 'brush') return R.ink < 8 ? 9 : 6;
    return 0;
  }
  // buys what is worth its price, removes junk, cuts gems. Returns a log of purchases.
  // Gold is worth nothing once the run is over, so a human buys more freely the later it is and the more gold is piling up: the bar
  // (utility per gold) falls with the chapter and with the size of the purse. Chapter 1 keeps the full bar (saving for a better shop is
  // right early), chapter 3 buys anything that helps.
  function spendBar(R, base) {
    const chap = R.chapter >= 3 ? 0.3 : R.chapter === 2 ? 0.6 : 1;
    const purse = R.gold >= 260 ? 0.4 : R.gold >= 180 ? 0.65 : 1;
    return base * chap * purse;
  }
  // what is left on the shelves, for the report: the best bot utility per gold among the unsold items the party could not or would not buy
  function shopLeft(R, node) {
    const P = profileOf(R);
    const m = mean(deckNets(R, P).map((x) => x.net));
    return node.stock.items.filter((it) => !it.sold).map((it) => ({ kind: it.kind, id: it.id, price: it.price, ratio: Math.round(100 * shopItemUtility(R, it, P, m) / it.price) / 100 }));
  }
  function shopVisit(R, node, minRatio) {
    const stock = node.stock;
    const log = [];
    const base = minRatio === undefined ? 0.15 : minRatio;
    socketAll(R, false);
    for (let guard = 0; guard < 14; guard++) {
      minRatio = spendBar(R, base);
      const P = profileOf(R);
      const nets = deckNets(R, P);
      const m = mean(nets.map((x) => x.net));
      let best = null;
      stock.items.forEach((it) => {
        if (it.sold || it.price > R.gold) return;
        if (it.kind === 'relic' && R.relics.indexOf(it.id) >= 0) return;
        const u = shopItemUtility(R, it, P, m);
        const ratio = u / it.price;
        if (u > 0 && ratio >= minRatio && (!best || ratio > best.ratio)) best = { kind: 'item', it, ratio, u };
      });
      if (stock.removePrice <= R.gold) {
        const c = removalCandidates(R, null)[0];
        const junkNow = !!c && isJunk(c.id);
        if (c && c.util > 0 && (junkNow ? stock.removePrice <= 200 : stock.removePrice <= 130 && R.deck.length > 13)) {
          const ratio = c.util / stock.removePrice;
          if (ratio >= minRatio * 0.9 && (!best || ratio > best.ratio)) best = { kind: 'remove', c, ratio, u: c.util };
        }
      }
      if (!best) break;
      if (best.kind === 'item') {
        const res = RUN.shopBuy(R, stock, best.it.key);
        if (!res.ok) break;
        log.push({ kind: best.it.kind, id: best.it.id, price: best.it.price });
        if (res.pending && res.pending.length) { /* pickup hooks raise pending choices, resolved by the caller */ }
        if (best.it.kind === 'gem') socketAll(R, false);
      } else {
        const res = RUN.shopRemove(R, stock, best.c.uid);
        if (!res.ok) break;
        log.push({ kind: 'remove', id: best.c.id, price: res.price });
      }
    }
    socketAll(R, false);
    return log;
  }

  // ------------------------------------------------------------------ camp and forge
  function campUtilities(R, node, state) {
    const hf = hpFrac(R);
    const m = RUN.mods(R);
    const out = {};
    const restAmt = R.heroes.reduce((s, h) => s + Math.min(h.maxHp - h.hp, Math.round(h.maxHp * DATA.ECONOMY.camp.restPct * m.healMul)), 0);
    out.rest = restAmt * (hf.min < 0.4 ? 1.35 : 1.0) * (state && state.preBoss ? 1.2 : 1.0);
    const up = bestUpgrade(R);
    out.sharpen = up ? Math.max(0, up.gain) * UP_VAL * 1.0 + 2 : 0;
    out.gems = socketGain(R) * UP_VAL;
    const inkNeed = state && state.inkShort ? 1 : 0;
    out.meditate = 7 + (inkNeed ? 14 : 0) + (R.ink >= R.inkMax - 3 ? -6 : 0);
    return out;
  }

  // ------------------------------------------------------------------ pending choices
  function resolvePendingChoices(R, rng) {
    let guard = 0;
    while (R.pending.length && guard++ < 30) {
      const p = R.pending[0];
      let choice = null;
      if (p.op === 'cardReward') {
        const r = chooseCard(R, p.offers || [], rng, { forced: false, thrAdd: -0.5 });
        choice = r.id || null;
      } else if (p.op === 'removeCard') {
        const c = removalCandidates(R, p.filter);
        choice = c.slice(0, p.n).map((x) => x.uid);
      } else if (p.op === 'upgradeCard') {
        const P = profileOf(R);
        const list = RUN.upgradable(R, p.filter).map((uid) => { const c = R.deck.find((x) => x.uid === uid); return { uid, gain: V.score({ uid, id: c.id, up: 1, gems: c.gems }, P).net - V.score(c, P).net }; });
        list.sort((a, b) => b.gain - a.gain);
        choice = list.slice(0, p.n).map((x) => x.uid);
      } else if (p.op === 'transformCard') {
        const c = removalCandidates(R, p.filter).filter((x) => !isJunk(x.id));
        c.sort((a, b) => b.util - a.util);
        choice = c.slice(0, p.n).map((x) => x.uid);
        if (!choice.length) choice = R.deck.filter((x) => !isJunk(x.id)).slice(0, p.n).map((x) => x.uid);
      } else if (p.op === 'duplicateCard') {
        const P = profileOf(R);
        const list = R.deck.filter((c) => !isJunk(c.id)).map((c) => ({ uid: c.uid, net: V.score(c, P).net }));
        list.sort((a, b) => b.net - a.net);
        choice = list.slice(0, p.n).map((x) => x.uid);
      }
      let res = RUN.resolvePending(R, p.id, choice);
      if (!res.ok) {
        // fall back to the first legal answer so the run never stalls on a choice
        let alt = null;
        if (p.op === 'cardReward') alt = null;
        else {
          const cands = p.op === 'upgradeCard' ? RUN.upgradable(R, p.filter) : R.deck.filter((c) => {
            const d = DATA.cards[c.id];
            if (p.filter && p.filter.type && (!d || d.type !== p.filter.type)) return false;
            if (p.filter && p.filter.hero && (!d || d.hero !== p.filter.hero)) return false;
            if (p.op === 'transformCard' || p.op === 'duplicateCard') return d && DATA.LISTS.heroIds.indexOf(d.hero) >= 0;
            return true;
          }).map((c) => c.uid);
          alt = cands.slice(0, Math.min(p.n, cands.length));
        }
        res = RUN.resolvePending(R, p.id, alt);
        if (!res.ok) { R.pending.shift(); break; }
      }
    }
  }

  return { chooseCard, bestSocket, bestGemOf, socketAll, socketGain, bestUpgrade, removalCandidates, relicScore, runOpsValue, chooseEventOption, eventChoiceValue, shopVisit, shopLeft, campUtilities, resolvePendingChoices, hpFrac, profileOf, isJunk, deckNets, mean };
}

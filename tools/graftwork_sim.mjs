// Headless full-run bot for GRAFTWORK: integration coverage + balance numbers.
//   node tools/graftwork_sim.mjs [runsPerHero=20] [ascension=0]
import * as RUN from '../graftwork/engine/run.js';
import { newCombat, playCard, endTurn, canPlay, intentOf, resolvePending, usePotion, finishCombat, specOf, effCost, mult, val, cond } from '../graftwork/engine/combat.js';
import { cardSpec, strainInfo, canGraft } from '../graftwork/engine/cards.js';
import { CARDS, GRAFTS, HEROES, ENEMIES, POTIONS, STATUSES } from '../graftwork/data/index.js';

export const POLICIES = {
  careful: { maxStrain: 1, greed: 0.3 }, // keeps the deck near Budget
  greedy: { maxStrain: 4, greed: 1 },    // piles weight onto few cards
  none: { maxStrain: 0, greed: 0, skipAll: true }, // never grafts
};

// ---------- valuation helpers ----------
const num = (c, spec, n) => { try { return val(c, { spec, srcEnt: null, x: c.energy, card: null }, n); } catch { return 0; } };

// Static value of a spec (used for graft choice and shop/forge decisions). `threat` = how much block is worth.
function fxValue(spec, threat = 6) {
  let v = 0;
  const m = 1 + spec.pct / 100 * 1 * (spec.overload ? 1 : 1);
  const walk = (ops, mulIf = 1) => { for (const o of ops) {
    const n = typeof o.n === 'number' ? o.n : (o.n && o.n.base) || 0;
    const nn = typeof o.n === 'object' && o.n && o.n.per ? n + (o.n.max !== undefined ? Math.min(o.n.max - n, 4) : 4) : n;
    const sc = mulIf;
    if (o.op === 'dmg') v += sc * nn * (typeof o.hits === 'number' ? o.hits : o.hits ? 2 : 1) * (o.to === 'all' ? 1.8 : 1) * m;
    else if (o.op === 'block') v += sc * (Math.min(nn * m, Math.max(0, threat)) * 1.2 + nn * m * 0.35);
    else if (o.op === 'status') v += sc * (o.to === 'self' || o.to === 'player' ? nn * 2 : nn * 1.8) * (o.s === 'echo' ? 3 : 1);
    else if (o.op === 'draw') v += sc * nn * 3;
    else if (o.op === 'energy') v += sc * nn * 5;
    else if (o.op === 'heal') v += sc * nn * 0.7;
    else if (o.op === 'gold') v += sc * nn * 0.25;
    else if (o.op === 'hp') v -= sc * nn * 1.5;
    else if (o.op === 'detonate' || o.op === 'double') v += sc * 8;
    else if (o.op === 'if') { walk(o.then || [], sc * 0.7); }
    else if (o.op === 'custom') v += sc * 5;
    else if (o.op === 'repeat') walk([].concat(o.fx || []), sc * (o.n || 1));
  } };
  walk(spec.fx);
  v *= 1 + spec.repeat;
  if (spec.custom.length) v += spec.custom.length * 4;
  if (spec.lifesteal) v += 2;
  const cost = spec.cost === 'X' ? 2 : spec.cost;
  let r = v / Math.max(0.8, cost * 0.8 + 0.4);
  if (spec.flags.exhaust) r *= 0.75;
  if (spec.flags.ethereal) r *= 0.9;
  if (spec.flags.retain) r *= 1.05;
  if (spec.flags.innate) r *= 1.05;
  r -= (spec.price.selfHurt || 0) * 1.5;
  r *= 1 - 0.5 * (spec.price.jam || 0);
  for (const j of spec.price.junk) r -= j.n * 2.2;
  r -= (spec.price.drawdown || 0) * 3;
  r -= Math.abs(spec.price.maxHp || 0) * 0.8;
  r -= (spec.price.gold || 0) * 0.4;
  if (spec.overload) r *= 0.88;
  return r;
}

// ---------- combat bot ----------
function incomingDmg(c) {
  let t = 0;
  for (const e of c.enemies) if (!e.dead && !(e.st.stun > 0)) t += intentOf(c, e).dmg;
  return t;
}
function cardValue(c, card, ck, st) {
  const sp = ck.spec;
  const m = mult(sp, card.tithed) * (card.brand ? 1.5 : 1);
  const live = st.live;
  const need = st.need;
  // spare energy after this card versus the other playable cards in hand (draw/energy only matter if we can spend)
  { const others = c.hand.filter((k) => k !== card).reduce((a, k) => { const sp2 = specOf(c, k); const ce = effCost(c, k); return a + (sp2.unplayable ? 0 : ce === 'X' ? 1 : ce); }, 0); st = { ...st, spare: (c.energy - (ck.cost === 'X' ? c.energy : ck.cost)) - Math.min(others, 99) + (others > 0 ? 0 : 1) }; }
  const times = 1 + sp.repeat + (c.player.st.echo > 0 && sp.type !== 'power' ? 1 : 0);
  const lowHp = c.player.hp < c.player.maxHp * 0.3;
  const x = ck.cost === 'X' ? c.energy : 0;
  let v = 0, setup = 0;
  const ctx = { spec: sp, srcEnt: null, x, card };
  const hasAtk = c.hand.some((k) => k !== card && CARDS[k.inst.id].type === 'attack');
  const walk = (ops, sc) => { for (const o of ops) {
    const n = (() => { try { return val(c, ctx, o.n); } catch { return 0; } })();
    if (o.op === 'dmg') {
      const hits = o.hits !== undefined ? Math.max(1, (() => { try { return val(c, ctx, o.hits); } catch { return 1; } })()) : 1;
      const per = Math.max(1, Math.round(n * m));
      let tgts = o.to === 'all' ? live : o.to === 'random' ? [live[0]] : [st.target || live[0]];
      for (const e of tgts) {
        if (!e) continue;
        const vul = e.st.vulnerable > 0 ? 1.5 : 1;
        let d = per * hits * times * vul;
        const eff = Math.min(d, e.hp + e.block);
        v += sc * eff;
        if (d >= e.hp + e.block) v += sc * (4 + st.intents.get(e) * 0.8);
        else v += sc * Math.max(0, d - eff);
      }
    } else if (o.op === 'block') {
      const b = Math.max(1, Math.round(n * m)) * times + (c.player.st.dexterity || 0);
      const useful = Math.min(b, need);
      v += sc * (useful * 1.5 + (b - useful) * (c.player.st.barricade ? 0.8 : 0.1) + (lowHp ? b * 0.3 : 0));
    } else if (o.op === 'status') {
      const to = o.to || 'enemy';
      if (to === 'self' || to === 'player') {
        if (o.s === 'echo') setup += 8 * n;
        else if (o.s === 'strength') v += sc * n * 3 * Math.min(4, st.cardsLeft);
        else if (o.s === 'dexterity') v += sc * n * 2;
        else if (STATUSES[o.s] && STATUSES[o.s].good === false) v -= sc * n * 2;
        else setup += sc * (4 + n * 2);
      } else {
        const targets = to === 'all' ? live : [st.target || live[0]];
        for (const e of targets) {
          if (!e) continue;
          if (o.s === 'weak') v += sc * Math.min(n, 2) * Math.max(2, st.intents.get(e) * 0.25 * 1);
          else if (o.s === 'vulnerable') v += sc * (hasAtk ? Math.min(n, 2) * 3.5 : 1);
          else if (o.s === 'burn') v += sc * Math.min(n * 1.6, e.hp);
          else if (o.s === 'bleed') v += sc * Math.min(n * 2, e.hp);
          else v += sc * n * 1.5;
        }
      }
    } else if (o.op === 'draw') { const d = Math.min(n, 4); const pool = c.drawPile.length + c.discard.length; if (pool > 0 && c.hand.length < 9) setup += d * (st.spare > 0 ? 3.2 : 0.4); }
    else if (o.op === 'energy') setup += n * (st.spare > -1 ? 6 : 1);
    else if (o.op === 'heal') v += Math.min(n, c.player.maxHp - c.player.hp) * 1.1;
    else if (o.op === 'gold') v += n * 0.3;
    else if (o.op === 'hp') v -= Math.abs(n) * (lowHp ? 5 : 1.2);
    else if (o.op === 'maxhp') v += n * 3;
    else if (o.op === 'detonate' || o.op === 'double') v += 8 * sc;
    else if (o.op === 'cleanse') v += 2;
    else if (o.op === 'addCard') v -= 0.5;
    else if (o.op === 'discard') v -= 0.5;
    else if (o.op === 'if') { try { walk(cond(c, ctx, o.cond) ? (o.then || []) : (o.else || []), sc); } catch { walk(o.then || [], sc * 0.5); } }
    else if (o.op === 'custom') v += 5 * sc;
    else if (o.op === 'exhaustHand' || o.op === 'fetch') v += 1;
    else if (o.op === 'repeat') walk([].concat(o.fx || []), sc * (n || 1));
  } };
  walk(sp.fx, 1);
  for (const h of sp.custom) if (h.onPlay) v += 3;
  if (sp.type === 'power') setup += 6;
  if (sp.price.selfHurt) v -= sp.price.selfHurt * (lowHp ? 5 : 1.5);
  if (sp.price.jam) v -= 1;
  for (const j of sp.price.junk) if (j.when === 'onPlay') v -= j.n * 2;
  v += sp.lifesteal ? Math.min(sp.lifesteal, 4) * 0.5 : 0;
  // overload shatter: first play risk
  if (sp.overload && !card.rolled) v -= 3;
  return { v, setup };
}

function chooseTarget(c, live, intents) {
  // kill the weakest threat first; support units (high hp / low dmg) later
  return live.slice().sort((a, b) => (a.hp + a.block) / (1 + intents.get(a) + 3) - (b.hp + b.block) / (1 + intents.get(b) + 3))[0];
}

function potionPlan(c, run, kind, st) {
  const hpF = c.player.hp / c.player.maxHp;
  for (let i = 0; i < run.potions.length; i++) {
    const p = POTIONS[run.potions[i]];
    const ops = p.fx.map((o) => o.op + (o.s || ''));
    const heal = ops.includes('heal');
    const big = kind === 'elite' || kind === 'boss' || kind === 'final';
    const dying = c.player.hp - Math.max(0, st.need) <= c.player.maxHp * 0.12 || hpF < 0.3;
    let use = false;
    if (heal) use = hpF < 0.45;
    else if (ops.includes('block')) use = st.need >= c.player.hp * 0.6 || (dying && st.need > 0);
    else if (p.id === 'p_unjam' || p.id === 'p_untithe' || p.id === 'p_steady_hand') use = (big || hpF < 0.5) && c.turn === 1 && (p.id !== 'p_unjam' ? true : false);
    else use = (big && c.turn <= 2) || hpF < 0.4 || (run.potions.length >= 3 && c.turn === 1);
    if (use) return i;
  }
  return -1;
}

export function fight(run, pol, maxTurns = 40) {
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
      const st = { live, intents, need: Math.max(0, incoming - c.player.block), cardsLeft: c.hand.length, target: null };
      st.target = chooseTarget(c, live, intents);
      // potions
      const pi = potionPlan(c, run, kind, st);
      if (pi >= 0) { usePotion(c, pi, c.enemies.indexOf(st.target)); c.ev.length = 0; continue; }
      let best = -1, bs = 0.01, bestSetup = -1, bss = 0;
      const echo = c.player.st.echo > 0;
      const gotAtk = c.hand.some((k) => CARDS[k.inst.id].type === 'attack');
      c.hand.forEach((k, i) => {
        const ck = canPlay(c, i); if (!ck.ok) return;
        const cost = ck.cost === 'X' ? Math.max(1, c.energy) : ck.cost;
        const { v, setup } = cardValue(c, k, ck, st);
        const sp = ck.spec;
        if (setup > 0 && v > -2) {
          // draw / energy / echo / power: do it first while it still pays
          const sscore = (setup + Math.max(0, v)) / Math.max(0.7, cost + 0.2) + (cost === 0 ? 5 : 0);
          if (sscore > bss && !(sp.id && echo && sp.fx.every((o) => o.op === 'status' && o.s === 'echo'))) { bss = sscore; bestSetup = i; }
        }
        let s = (v + setup * 0.5) / Math.max(0.6, cost);
        if (echo) s = v + setup * 0.5;           // Echo pending: spend it on the biggest effect, not the best ratio
        if (sp.flags.exhaust && v < 12) s -= 0.5;
        if (cost === 0 && v > 0) s += 4;
        if (s > bs) { bs = s; best = i; }
      });
      // play setup cards first when a card of value is waiting to use them
      if (bestSetup >= 0 && (bestSetup === best || bss > 3.5) && !(echo && bestSetup !== best)) best = bestSetup;
      if (best < 0) break;
      const sp = specOf(c, c.hand[best]);
      let ti = null;
      if (sp.target === 'enemy') {
        // lethal target if any, else chosen focus target
        ti = c.enemies.indexOf(st.target);
      }
      if (globalThis.GW_TRACE) console.log(`T${c.turn} hp${c.player.hp} blk${c.player.block} en${c.energy} play ${sp.id} (need ${st.need}) foes ${live.map((e) => e.id + ':' + e.hp).join(',')}`);
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

// ---------- graft choice ----------
function cardV(inst, threat = 6) { return fxValue(cardSpec(inst), threat); }
const WEIRD_BONUS = { common: 2, uncommon: 3.5, rare: 5 };

function graftScore(run, inst, gid, pol) {
  const g = GRAFTS[gid];
  const before = cardV(inst);
  const afterInst = { ...inst, grafts: [...inst.grafts, gid] };
  const after = cardV(afterInst);
  let s = after - before;
  // custom hooks are opaque to fxValue: credit by rarity (boon ~ price, net small positive)
  const sp = cardSpec(afterInst);
  s += (g.mods.some((m) => m.k === 'custom') ? WEIRD_BONUS[g.rarity] || 2 : 0);
  // how often does this card get played: starters seen often matter more, tiny scale
  s *= 1 + Math.min(0.5, (inst.plays || 0) * 0.02);
  // tithe: newly tithed cards lose 25 percent
  const pv = RUN.previewPick(run, inst.uid, gid);
  const newlyTithed = pv.after.tithed.filter((u) => !pv.before.tithed.includes(u));
  for (const u of newlyTithed) s -= cardV(RUN.findInst(run, u)) * 0.25;
  s -= (pv.after.backfire - pv.before.backfire) * 6;
  // the maxHp price is permanent
  const mh = g.mods.filter((m) => m.k === 'maxHp').reduce((a, m) => a + Math.abs(m.n), 0);
  s -= mh * 0.5;
  // overload: x1.5 numbers but 25 percent shatter (deck loses the card)
  if (afterInst.grafts.length > 2) s -= 3 * (1 - pol.greed) + 1;
  s += inst.grafts.length * 1.0 * pol.greed;       // greedy likes stacking a star
  return { s, strain: pv.after.strain, pv };
}

function chooseGraft(run, pol) {
  const offer = run.pending.offer;
  if (pol.skipAll || !offer.cards.length) return null;
  let best = null, bs = -1e9;
  for (const uid of offer.cards) {
    const inst = RUN.findInst(run, uid);
    for (const gid of offer.grafts) {
      if (!canGraft(inst, gid)) continue;
      const r = graftScore(run, inst, gid, pol);
      if (r.strain > pol.maxStrain) continue;
      if (r.s > bs) { bs = r.s; best = [uid, gid]; }
    }
  }
  const floor = pol.greed >= 1 ? 1.0 : 2.0; // below this a skip (heal or +1 Budget) is worth more
  if (best && bs < floor) return null;
  return best;
}

// ---------- map / shop / forge / event ----------
function chooseNode(run) {
  const nodes = RUN.availableNodes(run).map((id) => run.map.nodes[id]);
  const hpF = run.hp / run.maxHp;
  const score = (n) => {
    let s = run.rng.next() * 0.5;
    const rowsLeft = run.map.rows - n.row;
    if (n.type === 'forge') s += hpF < 0.65 ? 10 : hpF < 0.85 ? 3 : 0.5;
    if (n.type === 'shop') s += run.gold >= 150 ? 6 : run.gold >= 80 ? 2 : 0;
    if (n.type === 'event') s += hpF < 0.4 ? -1 : 2;
    if (n.type === 'elite') s += hpF > 0.8 ? 3.5 : hpF > 0.6 ? 1 : -6;
    if (n.type === 'fight') s += hpF < 0.35 ? -2 : 1.5;
    return s;
  };
  return nodes.slice().sort((a, b) => score(b) - score(a))[0];
}

function eventScore(run, ch) {
  const t = ch.text || '';
  const hpF = run.hp / run.maxHp;
  let s = 0;
  const g = (re) => { const m = t.match(re); return m ? +m[1] : 0; };
  s += g(/[Hh]eal (\d+)/) * (hpF < 0.7 ? 1.0 : 0.3);
  s -= g(/[Ll]ose (\d+) HP/) * (hpF < 0.5 ? 1.8 : 0.7);
  s -= g(/[Ll]ose (\d+) max HP/) * 2.2;
  s -= g(/[Pp]ay (\d+) gold/) * 0.12;
  s += g(/[Gg]ain (\d+) gold/) * 0.12;
  if (/random relic/.test(t)) s += 14;
  if (/random potion|a potion/.test(t)) s += 5;
  if (/Upgrade one card|upgrade a card/i.test(t)) s += 9;
  if (/graft reward screen/.test(t)) s += 10;
  if (/Gain (\d) Budget|Gain 1 Budget/.test(t)) s += 7;
  if (/Lose 1 Budget/.test(t)) s -= 9;
  if (/Remove a chosen card/.test(t)) s += 3;
  if (/Fight an Orderly/.test(t)) s += 3;
  if (/50%/.test(t)) s *= 0.8;
  if (/Overload|third graft/i.test(t)) s -= 8;
  if (/copy of/i.test(t)) s -= 2;
  return s;
}

function pickEventCard(run, ch, eligible) {
  const cards = eligible.map((u) => RUN.findInst(run, u));
  if (/Remove/.test(ch.text)) {
    const junk = cards.find((x) => CARDS[x.id].type === 'junk'); if (junk) return junk.uid;
    const weak = cards.slice().sort((a, b) => fxValue(cardSpec(a)) - fxValue(cardSpec(b)))[0]; return weak.uid;
  }
  if (/pgrade/.test(ch.text)) return cards.slice().sort((a, b) => cardV(b) - cardV(a))[0].uid;
  if (/graft/i.test(ch.text)) return cards.find((x) => x.grafts.length) ? cards.find((x) => x.grafts.length).uid : cards[0].uid;
  return cards.slice().sort((a, b) => cardV(b) - cardV(a))[0].uid;
}

function doShop(run, pol, log) {
  const shop = run.pending; log.shops++;
  // 1) best relic we can afford (relics are the main gold sink)
  let guard = 0;
  while (guard++ < 6) {
    const opts = shop.relics.map((r, i) => ({ r, i })).filter((x) => !x.r.sold && run.gold >= x.r.price).sort((a, b) => b.r.price - a.r.price);
    if (!opts.length) break;
    RUN.shopBuy(run, 'relic', opts[0].i);
  }
  // 2) remove junk, then the weakest starter if the deck is large and gold is plentiful
  const rem = () => RUN.servicePrice(run, 'remove');
  let junk = run.deck.find((x) => CARDS[x.id].type === 'junk');
  while (junk && run.gold >= rem()) { RUN.shopBuy(run, 'remove', 0, junk.uid); junk = run.deck.find((x) => CARDS[x.id].type === 'junk'); }
  // 3) potions (cheap, always useful)
  for (let i = 0; i < shop.potions.length; i++) if (!shop.potions[i].sold && run.gold >= shop.potions[i].price && run.potions.length < RUN.potionSlots(run)) RUN.shopBuy(run, 'potion', i);
  // 4) a graft from the shelf, evaluated like a reward
  if (!pol.skipAll) {
    let best = null, bs = 1.5;
    shop.grafts.forEach((it, i) => { if (it.sold || run.gold < it.price) return; for (const inst of RUN.graftableCards(run)) { if (!canGraft(inst, it.id)) continue; const r = graftScore(run, inst, it.id, pol); if (r.strain <= pol.maxStrain && r.s > bs) { bs = r.s; best = [i, inst.uid]; } } });
    if (best) RUN.shopBuy(run, 'graft', best[0], best[1]);
  }
  // 5) a card that is clearly better than a starter filler? the game wants a lean deck: skip cards.
  RUN.advance(run);
}

function doForge(run, pol) {
  const hpF = run.hp / run.maxHp;
  if (hpF < 0.7) RUN.forgeAct(run, 'rest');
  else {
    const ups = run.deck.filter((x) => !x.up && CARDS[x.id].up && CARDS[x.id].type !== 'junk');
    const si = strainInfo(run);
    if (!pol.skipAll && si.strain > 0) RUN.forgeAct(run, 'expand');
    else if (ups.length) { ups.sort((a, b) => (cardV({ ...b, up: 1 }) - cardV(b)) - (cardV({ ...a, up: 1 }) - cardV(a))); RUN.forgeAct(run, 'refine', ups[0].uid); }
    else if (!pol.skipAll) RUN.forgeAct(run, 'expand');
    else RUN.forgeAct(run, 'rest');
  }
  RUN.advance(run);
}

export function playRun(heroId, seed, pol = POLICIES.careful, asc = 0, o = {}) {
  const run = RUN.newRun({ hero: heroId, seed, ascension: asc });
  const log = { fights: [], grafts: 0, skips: 0, shatters: 0, events: 0, shops: 0 };
  let guard = 0;
  while (guard++ < 600 && run.phase !== 'dead' && run.phase !== 'won') {
    switch (run.phase) {
      case 'map': RUN.enterNode(run, chooseNode(run).id); break;
      case 'combat': {
        const kind = run.pending.fightKind;
        const enemies = run.pending.enemies.join('+');
        const hp0 = run.hp;
        const { res, c } = fight(run, pol);
        log.fights.push({ act: run.act, kind, win: res.win, turns: res.turns, hp: run.hp, hp0, enemies });
        log.shatters += res.shattered.length;
        RUN.resolveFight(run, res); break;
      }
      case 'reward': {
        const rw = run.pending;
        RUN.claimGold(run, rw);
        if (rw.relic) RUN.addRelic(run, rw.relic);
        if (rw.relicChoices && rw.relicChoices.length) RUN.addRelic(run, rw.relicChoices[0]);
        if (rw.potion) RUN.addPotion(run, rw.potion);
        RUN.afterReward(run); break;
      }
      case 'graft': {
        const pick = chooseGraft(run, pol);
        if (pick) { RUN.applyGraft(run, pick[0], pick[1]); log.grafts++; }
        else {
          const hpF = run.hp / run.maxHp;
          const si = strainInfo(run);
          RUN.skipGraft(run, hpF < 0.7 ? 'heal' : (pol.skipAll ? 'gold' : si.strain > 0 ? 'budget' : 'budget'));
          log.skips++;
        }
        RUN.afterGraft(run); break;
      }
      case 'shop': doShop(run, pol, log); break;
      case 'forge': doForge(run, pol); break;
      case 'event': {
        log.events++;
        const ch = RUN.eventChoices(run);
        const cand = ch.filter((x) => x.ok && (!x.pick || x.cards.length));
        const best = cand.slice().sort((a, b) => eventScore(run, b) - eventScore(run, a))[0] || cand[0];
        let uid; if (best.pick === 'card') uid = pickEventCard(run, best, best.cards);
        RUN.eventChoose(run, best.i, uid);
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

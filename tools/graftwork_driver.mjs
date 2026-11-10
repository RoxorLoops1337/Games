// The shared driver of every Graftwork balance tool: one set of fight policies and one way to play a seeded run.
// A run is a Ward run (engine/ward.js): mornings are built, walks are planned, and every screen in between is decided by a policy.
//
//   playWardRun(hero, seed, policy, asc, opts)   policy: a name below or a policy object (fights, grafts, shop and forge by the object,
//                                               building and walking by the strong builder and walker)
//     strong   Thread aware fights, school focus, one deliberate Overload, Temper, card buys, the early boss (the reference for win rates)
//     careful  the plain evaluator, keeps the deck near Budget      greedy  piles weight on few cards      none  never grafts
//     sloppy   plays left to right, never reads an intent, builds one or two random plans, walks to the nearest room that holds anything
//     random   random plans, walks, cards, targets and choices     passive  never builds, hides      fill  only fights once a Ward is full
//   wardTable(policy, N, asc) / describe(policy, rows)             the per-act table the commands print
//   fight / strongFight / tierFight, graftScore / chooseGraft / strongPickGraft, doShop, doForge, eventScore, pickEventCard
//
// Environment (all optional; the table is in graftwork/CLAUDE.md): GW_UNLOCK=start|all|start+kind,kind (card pool, default all)
//   GW_TUNE='{"tune":{...}}' (patch Ward numbers in memory)  GW_WEIRD_K (credit for custom-hook grafts, default 0.5; 1 is the old full credit)
//   GW_PICK=0 (no card buys)  GW_SLIP (careful tier misplays)  GW_EARLY=0 (no early boss rules)  GW_EXPAND=0 (never Expand)
//   GW_OLDWALK=1 (the walker from before the dice: shortest path within MOVE)  GW_DECLARE=0 (the strong bot never uses Odile's declaration)
//   GW_HOLDCUT=0 (it plays "Cut the Line." cards as soon as they score)
// The other tuning numbers of the strong bot (pick floor, Overload and Temper shares, card buy limits, road weight, early boss HP) are constants
// at the top of the section that uses them.
// Commands: graftwork_sim.mjs, graftwork_strong.mjs, graftwork_ward_sim.mjs, graftwork_tiers.mjs, graftwork_schools.mjs, graftwork_audit.mjs,
// graftwork_cardsweep.mjs, graftwork_unlocks.mjs. Seeds are fixed per run index, so compare before and after with the same N.
import * as RUN from '../graftwork/engine/run.js';
import * as W from '../graftwork/engine/ward.js';
import { newCombat, playCard, endTurn, canPlay, intentOf, resolvePending, usePotion, finishCombat, specOf, effCost, mult, val, cond } from '../graftwork/engine/combat.js';
import { seamPreview, canDeclare, declareOf, setDeclare, cutsLine, seamCap } from '../graftwork/engine/seam.js';
import { hashSeed } from '../graftwork/engine/rng.js';
import { cardSpec, strainInfo, canGraft, canTemper, schoolsOf, newInst } from '../graftwork/engine/cards.js';
import { CARDS, GRAFTS, HEROES, POTIONS, STATUSES, RELICS } from '../graftwork/data/index.js';
import { UNLOCKS } from '../graftwork/data/unlocks.js';
import { WARD_TUNE, PHASES, ROOMS, FLOOR } from '../graftwork/data/ward.js';

// GW_TUNE='{"tune":{"waitHeal":6},"phases":{"night":{"enemyStr":0}},"rooms":{"rm_linen":{"heal":0.3}}}' patches the data in memory for what-if runs (nothing is written)
if (process.env.GW_TUNE) { const t = JSON.parse(process.env.GW_TUNE); Object.assign(WARD_TUNE, t.tune || {}); for (const [k, v] of Object.entries(t.phases || {})) Object.assign(PHASES[k], v); for (const [k, v] of Object.entries(t.rooms || {})) Object.assign(ROOMS[k], v); for (const [k, v] of Object.entries(t.floor || {})) Object.assign(FLOOR[k], v); }

export const POLICIES = {
  careful: { maxStrain: 1, greed: 0.3 }, // keeps the deck near Budget
  greedy: { maxStrain: 4, greed: 1 },    // piles weight onto few cards
  none: { maxStrain: 0, greed: 0, skipAll: true }, // never grafts
};

// ---------- valuation ----------
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
export function cardValue(c, card, ck, st) {
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
      v += sc * (useful * (st.blockW || 1.5) +(b - useful) * (c.player.st.barricade ? 0.8 : 0.1) + (lowHp ? b * 0.3 : 0));
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
      if (pol.slip) { const o = pol.slip(c, best, run); if (o === -1) break; if (o !== undefined) best = o; } // optional human-error hook (POLICIES.carefulSlip)
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
export function cardV(inst, threat = 6) { return fxValue(cardSpec(inst), threat); }
const WEIRD_BONUS = { common: 2, uncommon: 3.5, rare: 5 };

export function graftScore(run, inst, gid, pol) {
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

export function chooseGraft(run, pol) {
  const offer = run.pending.offer;
  if (pol.skipAll || !offer.cards.length) return null;
  if (pol.pickGraft) return pol.pickGraft(run, pol);
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

// ---------- shop / forge / event ----------
export function eventScore(run, ch) {
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

export function pickEventCard(run, ch, eligible) {
  const cards = eligible.map((u) => RUN.findInst(run, u));
  if (/Remove/.test(ch.text)) {
    const junk = cards.find((x) => CARDS[x.id].type === 'junk'); if (junk) return junk.uid;
    const weak = cards.slice().sort((a, b) => fxValue(cardSpec(a)) - fxValue(cardSpec(b)))[0]; return weak.uid;
  }
  if (/pgrade/.test(ch.text)) return cards.slice().sort((a, b) => cardV(b) - cardV(a))[0].uid;
  if (/graft/i.test(ch.text)) return cards.find((x) => x.grafts.length) ? cards.find((x) => x.grafts.length).uid : cards[0].uid;
  return cards.slice().sort((a, b) => cardV(b) - cardV(a))[0].uid;
}

export function doShop(run, pol, log) {
  const shop = run.pending; log.shops++;
  if (pol.buyCards && pol.shopCards && pol.cardsFirst) pol.shopCards(run, shop, pol);
  // 1) best relic we can afford (relics are the main gold sink)
  let guard = 0;
  while (guard++ < 6) {
    const opts = shop.relics.map((r, i) => ({ r, i })).filter((x) => !x.r.sold && run.gold >= x.r.price).sort((a, b) => b.r.price - a.r.price);
    if (!opts.length) break;
    RUN.shopBuy(run, 'relic', opts[0].i);
  }
  // 1b) strong policy: buy cards clearly better than the deck's median card (gold is otherwise left unspent)
  if (pol.buyCards && pol.shopCards) { if (!pol.cardsFirst) pol.shopCards(run, shop, pol); }
  else if (pol.buyCards) {
    const vals = run.deck.filter((x) => CARDS[x.id].type !== 'junk').map((x) => cardV(x)).sort((x, y) => x - y);
    const med = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
    let g2 = 0;
    while (g2++ < 4) {
      const opts = shop.cards.map((k, i) => ({ k, i, v: cardV(newInst(k.id, () => -1)) })).filter((x) => !x.k.sold && run.gold >= x.k.price && x.v > med * pol.buyCards).sort((x, y) => y.v - x.v);
      if (!opts.length) break;
      RUN.shopBuy(run, 'card', opts[0].i);
    }
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

export function doForge(run, pol) {
  const hpF = run.hp / run.maxHp;
  if (pol.forge && pol.forge(run, pol, hpF)) { RUN.advance(run); return; } // policy hook: true when it spent the forge action itself
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

// ---------- the strong policy (Thread aware fights, school focus, Temper, card buys) ----------
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
      // potions: a tiny local rule set
      const hpF = c.player.hp / c.player.maxHp;
      let pi = -1;
      for (let i = 0; i < run.potions.length && pi < 0; i++) {
        const big = kind === 'elite' || kind === 'boss' || kind === 'final';
        if (hpF < 0.4 || (need >= c.player.hp * 0.7) || (big && c.turn <= 2)) pi = i;
      }
      if (pi >= 0) { usePotion(c, pi, c.enemies.indexOf(st.target)); c.ev.length = 0; continue; }
      let best = -1, bs = 0.01, bestSetup = -1, bss = 0;
      const echo = c.player.st.echo > 0;
      const threadOf = (k) => { // Thread value of playing k now: a knot, a paying cut, or a wasted cut
        try {
          const pv = seamPreview(c, k);
          if (pv.kind === 'extend') return 1.2 + (c.seam.len > 0 ? 1.0 * c.seam.len : 0) + payoutValue(c, pv.payout) * 0.35;
          if (pv.kind === 'cut') return payoutValue(c, pv.payout) - (pv.payout.length ? 0 : c.seam.len >= 2 ? 2.5 : 0);
        } catch { /* a card the preview cannot read is worth nothing to the Thread */ }
        return 0;
      };
      const decl = DECLARE_ON && canDeclare(c) ? declareOf(c) : null, declFor = {};
      // knots still in hand: affordable cards that would start or extend the Line (a cutting card waits for them)
      const growing = HOLDCUT_ON && c.seam.len < seamCap(c) ? c.hand.filter((k, i) => { const ck = canPlay(c, i); if (!ck.ok || cutsLine(ck.spec)) return false; try { return seamPreview(c, k).kind === 'extend'; } catch { return false; } }).length : 0;
      c.hand.forEach((k, i) => {
        const ck = canPlay(c, i); if (!ck.ok) return;
        const cost = ck.cost === 'X' ? Math.max(1, c.energy) : ck.cost;
        const { v, setup } = cardValue(c, k, ck, st);
        const sp = ck.spec;
        let th = threadOf(k);
        if (decl) { c.seam.declare = decl; const t2 = threadOf(k); c.seam.declare = null; if (t2 > th + DECLARE_MIN) { th = t2; declFor[i] = true; } }
        if (growing && cutsLine(sp)) th -= 3 + 2.5 * growing;
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
      if (decl && declFor[best]) setDeclare(c, true);
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
const DECLARE_ON = process.env.GW_DECLARE !== '0', DECLARE_MIN = 1; // Odile's declaration: only when the Thread gains more than this
const HOLDCUT_ON = process.env.GW_HOLDCUT !== '0';
// Graft pick: the plain score plus focus on the deck's dominant Thread school (only grafts that bridge into it).
// graftScore credits every custom-hook (weird) graft a flat rarity bonus because fxValue cannot see inside hooks; that over-rewards weird grafts that
// cost more than they pay, so the strong pick takes back (1 - GW_WEIRD_K) of it (default half; design/WARD.md section 11). GRAFT_ADJ is a per-graft
// correction table for measured outliers (empty today).
const WEIRD_CREDIT = { common: 2, uncommon: 3.5, rare: 5 };
export const GRAFT_ADJ = {};
const WEIRD_K = +(process.env.GW_WEIRD_K ?? 0.5);
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
      const g = GRAFTS[gid];
      let s = r.s;
      if (g.mods.some((m) => m.k === 'custom')) s -= (1 - WEIRD_K) * (WEIRD_CREDIT[g.rarity] || 2);
      s += GRAFT_ADJ[gid] || 0;
      if (top && g.school === top[0]) s += 1.5; else if (top && (focus[g.school] || 0) >= 2) s += 0.7;
      // one deliberate Overload per run (on some runs) while Strain is still low: x1.5 numbers, 25% Shatter on first play
      if (inst.grafts.length === 2 && r.strain === 0 && !run.flags.gwOverloaded && runRoll(run, 'over') < (pol.overloadP ?? OVERLOAD_P)) s += 3.5;
      if (s > bs) { bs = s; best = [uid, gid]; }
    }
  }
  const pick = best && bs >= PICK_FLOOR ? best : null;
  if (pick && RUN.findInst(run, pick[0]).grafts.length === 2) run.flags.gwOverloaded = true;
  return pick;
}

// Per-run deterministic dice so the same seed makes the same choice in baseline and relic runs.
// Tuning numbers of the strong bot. They were environment switches (GW_FLOOR GW_OVERLOAD_P GW_TEMPER_P GW_MARGIN GW_MAXBUY GW_RESERVE GW_THRESH
// GW_MS GW_GREED GW_BUY GW_FIRST GW_ROAD GW_EARLY_HP) while they were searched; they sit at the values that search ended on, and the published
// win rates are those of these numbers. To try another one, change it here (or pass it in a policy object: overloadP, temperP, maxStrain, greed).
const PICK_FLOOR = 1.5;                      // the best graft pair is taken only when it scores at least this
const OVERLOAD_P = 0.35, TEMPER_P = 0.4;     // share of runs that make one deliberate Overload / hammer the best grafted card
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

// ---------- card pick / shop buy policy (GW_PICK) ----------
// Cards only enter a run through the shop (5 per visit). Policy: score every shelf card, buy the best while it beats skipping by a margin.
// score = static value gain over the deck's median card (cardValue ratio via sim fxValue) + audit forced-win delta (wins per 200 runs / 20)
//         + school bonus (shares the school of the deck's grafts) - dead-pick penalty (cards the audit measured as rarely played).
// Gold budget: keep BUY_RESERVE gold back for junk removal; at most BUY_MAX cards per run.
// forced-card sweep (tools/graftwork_cardsweep.mjs, 2 copies in the starter deck, 200 runs, A0, no-pick bot): wins versus control, mean over heroes that can use the card
const AUDIT_DELTA = { o_thread_doublehem: 63, m_secondwind: 58, m_restraints: 53, o_tip_the_usher: 52, w_burnout: 47, m_stitchwork: 45, x_plate: 45, m_desperate: 43, o_liquidate: 43, m_cauterize: 42, m_hemostatic_snip: 38, o_golden_parachute: 36, m_exsang: 35, w_bare_wire: 34, m_thread_stitchup: 33, w_wax_drip: 33, w_quick_flick: 29, o_mirror_sale: 29, x_adrenal: 28, m_hacksaw: 25, w_wax_armor: 25, m_mirrored_wound: 24, w_hot_seam: 24, m_flick: 23, m_blank_chart: 23, o_thread_sparespool: 23, m_thread_longsuture: 22, w_ember_toss: 22, o_market_crash: 48, w_blowtorch: 19, w_thread_trail: 18, o_pocket_change: 15, m_tailored_cut: 14, m_thread_bloodline: 14, w_pyre_dance: 14, o_double_bill: 14, w_thread_fusewire: 13, o_heirloom: 13, m_triage: 12, x_lunge: 11, o_second_helping: 10, w_capacitor_bank: 9, m_epidemic: 8, o_bulk_order: 8, o_clean_book: 8, w_thread_arcstitch: 7, m_stitch_count: 6, m_light_packing: 6, w_spark_gap: 6, o_levy: 6, o_bidding_war: 6, m_suture: 5, x_thread_basting: 5, w_earth_wire: 5, o_standing_order: 4, x_barbs: 3, w_scald: 3, w_fuse_bridge: 3, x_recall: 2, w_static_seam: 2, m_biohazard: 1, m_fever_chart: 1, w_leather_apron: 1, w_tempered_wick: 1, m_hemostat: 0, m_stress_test: -1, m_hammered_plate: -1, x_hold: -1, o_ledger_line: -1, m_scabover: -2, w_overcurrent: -2, o_loose_change: -2, m_lancet: -3, x_second: -3, x_thread_snip: -3, o_pawn_ticket: -3, o_patronage: -3, m_swab: -4, x_cleave: -4, w_tithe_pyre: -4, o_hostile_takeover: -4, w_arc_flash: -5, o_choir_loft: -5, m_flakeoff: -6, m_scrap_splint: -6, m_sweep: -7, m_thread_rustseam: -7, w_cinder_rain: -7, m_sewn_shut: -8, x_thread_cross: -8, w_slow_match: -8, w_dynamo: -8, o_overdraft: -8, m_scarpower: -9, x_gauze: -9, x_poise: -9, w_static_cling: -9, w_thread_conflagration: -9, o_triple_threat: -9, o_layaway: -10, o_dividend: -10, x_shrug: -11, o_heavy_purse: -11, x_jab: -12, o_reprint: -12, o_cross_listing: -12, m_hemorrhage: -13, w_conductive_thread: -13, o_hardened_purse: -13, w_backdraft: -14, m_drawblood: -15, x_brace: -15, w_tinder_stack: -15, x_haymaker: -16, x_thread_shears: -16, o_tithe_ledger: -16, m_reopen: -18, m_laybare: -18, o_gilded_age: -18, m_vivisect: -19, x_thread_tieoff: -19, o_browse: -19, x_thread_unpick: -21, m_bloodrite: -22, w_substation: -22, m_anticoag: -23, w_ringing_ears: -23, o_receipt: -24, o_inventory: -24, o_audit: -2, x_thread_pinking: -25, w_graft_furnace: 9, m_rustplate: -27, x_sweep: -27, x_flatline: 6, w_discharge: -28, m_amputate: -29, w_powder_keg: -30, w_wildfire_spread: -31, w_pilot_light: -31, o_overbooked: -31, o_keepsake: -32, w_flashpoint: -33, x_resolve: 30, x_thread_loom: -35, o_prepaid: -35, o_thread_embroidered: -35, w_wildfire: -37, w_chain_reaction: -7, o_thread_tapestry: -60 };
const BUY_MARGIN = 1.0, BUY_MAX = 4, BUY_RESERVE = 0, BUY_THRESH = 3; // card buys: weight of the deck median, cards per run, gold kept back, score to beat
const PICK_ON = () => (process.env.GW_PICK ?? '1') !== '0';
export function auditDelta(id) { return AUDIT_DELTA[id] || 0; }
export function strongShopCards(run, shop, pol) {
  const margin = BUY_MARGIN, maxBuy = BUY_MAX, reserve = BUY_RESERVE;
  const real = run.deck.filter((x) => CARDS[x.id].type !== 'junk');
  const vals = real.map((x) => cardValueStatic(x)).sort((x, y) => x - y);
  const med = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
  const focus = {};
  for (const inst of run.deck) for (const g of inst.grafts) { const s = GRAFTS[g].school; focus[s] = (focus[s] || 0) + 1; }
  const top = Object.entries(focus).sort((a, b) => b[1] - a[1])[0];
  const junkRemoval = run.deck.some((x) => CARDS[x.id].type === 'junk') ? RUN.servicePrice(run, 'remove') : 0;
  run.flags.gwBought = run.flags.gwBought || 0;
  for (let n = 0; n < 4 && run.flags.gwBought < maxBuy; n++) {
    let best = -1, bs = BUY_THRESH;
    shop.cards.forEach((k, i) => {
      if (k.sold || run.gold - k.price < Math.max(reserve, junkRemoval)) return;
      const def = CARDS[k.id];
      let s = cardValueStatic(newInst(k.id, () => -1)) - med * margin * 0.5 - med * 0.5;
      s += auditDelta(k.id) / 20;
      if (top && def.school === top[0]) s += 1.5; else if (top && (focus[def.school] || 0) >= 2 && def.school) s += 0.7;
      if (def.type === 'power' && real.length < 9) s -= 1;
      if (s > bs) { bs = s; best = i; }
    });
    if (best < 0) break;
    if (RUN.shopBuy(run, 'card', best).ok) run.flags.gwBought++; else break;
  }
}
const cardValueStatic = cardV;

// Boss relic choice (a policy without pickRelic takes choice 0). Rank from forced-pick runs (100 runs x 3 heroes each, A0).
const BOSS_RANK = ['r_second_wind', 'r_lead_apron', 'r_tithe_crown', 'r_parasite_heart', 'r_hollow_ledger', 'r_glass_throat', 'r_absolution', 'r_gamblers_thread'];
const pickRelic = (ch) => ch.slice().sort((a, b) => BOSS_RANK.indexOf(a) - BOSS_RANK.indexOf(b))[0];
const STRONG = { pickRelic, maxStrain: 2, greed: 0.6, fight: strongFight, pickGraft: strongPickGraft, forge: strongForge };
POLICIES.strongNoPick = { ...STRONG, buyCards: 0 };
POLICIES.strongPick = { ...STRONG, buyCards: 1, shopCards: strongShopCards, cardsFirst: true };
POLICIES.strong = PICK_ON() ? POLICIES.strongPick : POLICIES.strongNoPick;

// ---------- the low tiers: a careful player who slips, and fights played without reading (sloppy) or at random ----------
// CAREFUL slips: with probability SLIP a play is replaced by a random playable card (one slip in four ends the turn instead).
// The careful and the strong policy share one card evaluator and play almost the same, so this models a careful HUMAN who reads
// intents but misplays now and then (POLICIES.carefulSlip; POLICIES.careful is the unmodified policy).
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

export function tierFight(run, tier, R, maxTurns = 40) {
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

// ---------- the Ward: builders and walkers ----------
const count = (run, type) => Object.values(run.ward.rooms).filter((r) => r.type === type).length;
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

// ---------------- strong builder ----------------
const WANT = { rm_sawmill: 2, rm_quarry: 2, rm_ward: 3, rm_isolation: 2, rm_chapel: 1, rm_dispensary: 1, rm_workshop: 1, rm_linen: 1, rm_counting: 1, rm_generator: 3, rm_pharmacy: 1, rm_library: 1, rm_morgue: 1, rm_kitchen: 1, rm_boiler: 1, rm_laundry: 1, rm_isolation2: 1 };
// is there a chain of rooms from the hero to the Theatre (a road for the early boss)?
function theatreLinked(run) {
  const w = run.ward, th = W.theatreOf(run), seen = new Set([w.hero.room]), q = [w.hero.room];
  while (q.length) { const id = q.shift(); if (id === th.id) return true; for (const n of W.neighbors(run, id)) if (!seen.has(n)) { seen.add(n); q.push(n); } }
  return false;
}
function roomPriority(run, type) {
  const w = run.ward, have = count(run, type), pw = W.wardPower(run), need = W.ROOMS[type].power;
  if (type === 'rm_corridor') return EARLY_ON && !theatreLinked(run) ? 6.5 : w.day >= w.dayLimit - 4 && w.res.wood >= 2 ? 5 : w.res.wood >= 3 ? 1 : 0.2; // late in the floor: a road to the Theatre, for the early boss
  if (type === 'rm_generator') return pw.free < 1 ? 9 : pw.free < 2 ? 3 : 0;
  if (have >= (WANT[type] || 1)) return 0;
  if (need && pw.free < need) return 0.5; // would be built dark
  const base = { rm_sawmill: 8, rm_quarry: 8, rm_ward: 7, rm_isolation: have === 0 ? 9.5 : 6, rm_chapel: 4, rm_dispensary: 5, rm_workshop: 6, rm_linen: 5, rm_counting: 3, rm_pharmacy: 3.5, rm_library: 4.5, rm_morgue: 3, rm_kitchen: 3, rm_boiler: Object.values(w.rooms).filter((r) => r.type === 'rm_ward').length >= 2 ? 4 : 0, rm_laundry: run.deck.some((x) => x.id.startsWith('j_')) ? 3 : 0, rm_isolation2: have === 0 && w.day >= 2 ? 6.5 : 0 }[type] || 2;
  return base - have * 2;
}
function bestCell(run, type) {
  const w = run.ward, cells = W.buildCells(run);
  if (!cells.length) return null;
  const th = W.theatreOf(run), hero = w.rooms[w.hero.room], ent = W.entranceOf(run);
  const score = (c) => {
    if (type === 'rm_corridor') return -dist(c, [th.x, th.y]) * 2 - dist(c, [hero.x, hero.y]) * 0.3;
    const spawner = !!(W.ROOMS[type].spawn);
    // spawners close to the hero's usual haunts, producers out of the way
    return spawner ? -dist(c, [ent.x, ent.y]) * 0.6 - dist(c, [hero.x, hero.y]) * 0.6 : -Math.abs(c[1] - ent.y) * 0.2 - (EARLY_ON ? dist(c, [th.x, th.y]) * ROAD_W : 0);
  };
  return cells.slice().sort((a, b) => score(b) - score(a))[0];
}
const EXPAND_W = { rm_ward: 4.2, rm_workshop: 3.2, rm_chapel: 3, rm_library: 2.8, rm_kitchen: 2.4 }; // how much the strong bot wants each Expand (GW_EXPAND=0 never expands)
const EXPAND_OFF = process.env.GW_EXPAND === '0';
function strongMorning(run) {
  const w = run.ward;
  for (let g = 0; g < 20; g++) {
    const opts = [];
    for (const inst of w.deck.hand) {
      const card = W.BUILD_CARDS[inst.id];
      if (card.kind === 'room') {
        const p = roomPriority(run, card.room); if (p <= 0) continue;
        const cell = bestCell(run, card.room); if (!cell) continue;
        opts.push({ p, uid: inst.uid, target: { x: cell[0], y: cell[1] } });
      } else if (card.kind === 'expand') {
        // Expand (design/WARD.md "Room sizes and Expand"): a bigger Ward holds 7 and stays on the same timer; the other rooms get quicker or richer. A powered room needs 1 more power.
        const pw = W.wardPower(run);
        for (const r of Object.values(w.rooms)) {
          const want = EXPAND_W[r.type]; if (!want || EXPAND_OFF) continue;
          const ex = W.expandOptions(run, r.id); if (!ex.ok) continue;
          if (W.ROOMS[r.type].power && pw.free < 1) continue;
          const c = ex.cost; if (w.res.wood - (c.wood || 0) < 1 || w.res.stone - (c.stone || 0) < 1 || run.gold - (c.gold || 0) < 40) continue;
          opts.push({ p: want - (r.type === 'rm_ward' ? count(run, 'rm_ward') * 0.3 : 0), uid: inst.uid, target: r.id });
        }
      } else if (card.kind === 'upgrade') {
        const rooms = Object.values(w.rooms).filter((r) => card.on.includes(r.type));
        const want = { b_reinforced_beds: 4, b_overtime: 3, b_scrub_in: 3, b_sterile_field: 2, b_iron_doors: 0.5, b_night_shift: 0, b_double_doors: 0.4, b_soundproofing: 1.5, b_fire_door: 0 }[card.id] || 0;
        for (const r of rooms) if (want > 0) opts.push({ p: want, uid: inst.uid, target: r.id });
      } else {
        const hpF = run.hp / run.maxHp;
        const wardsFull = Object.values(w.rooms).some((r) => r.type === 'rm_ward' && r.contents.length >= 4);
        const v = { move: 6, rations: 2.5, lamp: Object.values(w.rooms).some((r) => !r.on && W.ROOMS[r.type].power) ? 3 : 0, heal: hpF < 0.85 ? 5 : 0, res: 5, bribe: 0, tick: 2, demolish: 0, flood: w.day >= 2 ? 2 : 0, otpay: run.gold < 150 ? 3 : 0, nurse: hpF < 0.75 ? 3 : 0, quarantine: 0, fumigate: wardsFull ? 3.5 : 0, power: W.wardPower(run).free < 1 ? 3 : 0, linens: Object.values(w.rooms).some((r) => r.type === 'rm_linen' && r.timers.spawn > 1 && !r.contents.length) && hpF < 0.8 ? 3 : 0, shift: 2, ledger: 3.5 }[card.effect] || 0;
        if (v <= 0) continue;
        let target = null;
        if (card.effect === 'res') target = w.res.wood <= w.res.stone ? 'wood' : 'stone';
        if (card.effect === 'fumigate') { const r = Object.values(w.rooms).filter((x) => x.type === 'rm_ward').sort((a, b) => b.contents.length - a.contents.length)[0]; if (!r || r.contents.length < 4) continue; target = r.id; }
        if (card.effect === 'tick') { const r = Object.values(w.rooms).find((x) => x.type === 'rm_ward' && x.on) || Object.values(w.rooms).find((x) => W.everyOf(x) && x.on); if (!r) continue; target = r.id; }
        opts.push({ p: v, uid: inst.uid, target });
      }
    }
    opts.sort((a, b) => b.p - a.p);
    let played = false;
    for (const o of opts) { if (W.playBuildCard(run, o.uid, o.target).ok) { played = true; break; } }
    if (!played) break;
  }
  // light every room we can, most useful first
  for (const r of Object.values(w.rooms)) if (!r.on && W.ROOMS[r.type].power) W.togglePower(run, r.id);
  W.endMorning(run);
}

// ---------------- strong walker ----------------
// Early boss rule: once the Theatre is open (last 2 days) a healthy bot takes the boss at x0.85 HP instead of waiting for the night boss
// (the idle boss grows, the floor keeps spawning, and the early kill pays gold, a building card and a graft). It walks toward the Theatre
// while healthy and enters it when the route reaches it with at least EARLY_HP of its HP left after the route's fights.
const ROAD_W = 0.6, EARLY_HP = 0.65, EARLY_ON = (process.env.GW_EARLY ?? '1') !== '0';
function walkScore(run, pv) {
  const w = run.ward, hpF = run.hp / run.maxHp, ph = w.phase, act = run.act;
  let s = 0, fights = 0, monsters = 0;
  const per = 3.5 + act * 0.5; // expected HP per monster for the strong bot, roughly
  let hp = run.hp;
  for (const t of pv.triggers) {
    if (t.bribed) continue;
    if (t.kind === 'fight') {
      fights++; monsters += t.detail.count;
      const cost = t.detail.count * per * (ph === 'night' ? 1.35 : 1);
      s += 5 + t.detail.count * 1.5 - cost * (hp / run.maxHp < 0.5 ? 1.6 : 0.5);
      hp -= cost;
    } else if (t.kind === 'elite') {
      const lvl = t.detail.level, night = ph === 'night';
      const cost = 18 + act * 4 + (lvl >= 2 ? 10 : 0) + (night ? 6 : 0);
      s += hp - cost > run.maxHp * 0.35 ? 14 : -30;
      hp -= cost;
    } else if (t.kind === 'event') s += ph === 'midday' ? 7 : 5;
    else if (t.kind === 'shop') s += run.gold >= 120 ? 8 : run.gold >= 60 ? 3 : 0.5;
    else if (t.kind === 'forge') s += hpF < 0.7 ? 11 : 6;
    else if (t.kind === 'rest') s += (1 - hpF) * 22;
    else if (t.kind === 'boss') s += t.detail.early ? (hpF >= EARLY_HP && hp >= run.maxHp * EARLY_HP ? 30 : -40) : 100;
  }
  if (fights > 2) s -= (fights - 2) * 4;
  if (hp < run.maxHp * 0.25) s -= 25;
  s -= pv.offPenalty * 0.6;
  if (pv.wait) s += 1;
  if (EARLY_ON && W.bossOpen(run) && hpF >= EARLY_HP && !pv.triggers.some((t) => t.kind === 'boss') && pv.path && pv.path.length) {
    const th = W.theatreOf(run), end = w.rooms[pv.path[pv.path.length - 1]];
    if (end) s += Math.max(0, 8 - dist([end.x, end.y], [th.x, th.y])) * 1.2;
  }
  return s;
}
// dice routes: a walk is at most the roll N rooms. pathR is pathTo cut to the roll (the policies score what a route of N steps would trigger),
// startR plans exactly that route step by step (extendRoute) and walks it (startRoute). Waiting and the forced last night use startWalk.
function pathR(run, rid, alt = 0) {
  const p = W.pathTo(run, rid, alt);
  if (!p.ok || p.wait || p.forced || process.env.GW_OLDWALK) return p; // GW_OLDWALK=1: the pre-dice walker (shortest path within MOVE 4), for comparison
  const n = W.rollOf(run).n, cut = (path) => path.slice(0, n), info = (path) => W.routeInfo(run, cut(path));
  const main = info(p.path);
  return { ...p, path: main.path, triggers: main.triggers, offPenalty: main.offPenalty, cost: main.path.length, alts: p.alts.map((a) => { const i = info(a.path); return { path: i.path, triggers: i.triggers, offPenalty: i.offPenalty }; }), cut: p.path.length > n };
}
function startR(run, rid, alt = 0) {
  const p = pathR(run, rid, alt);
  if (!p.ok) return W.startWalk(run, rid, alt);
  if (p.wait || p.forced || process.env.GW_OLDWALK) return W.startWalk(run, rid, alt);
  W.clearRoute(run);
  for (const r of p.path) if (!W.extendRoute(run, r).ok) break;
  return W.startRoute(run);
}
function forcedBoss(run) { return W.bossForced(run) ? W.startWalk(run, W.theatreOf(run).id) : undefined; }
function hideWalk(run) { const f = forcedBoss(run); return f !== undefined ? f : W.startWalk(run, run.ward.hero.room); }
// SLOPPY: plays one or two random cards, ignores power (rooms may stay dark), walks to the nearest room that holds anything, else the nearest room
function sloppyMorning(run, R) {
  const w = run.ward;
  for (let g = 0; g < 2 && w.deck.hand.length; g++) {
    const inst = R.pick(w.deck.hand), card = W.BUILD_CARDS[inst.id];
    let target = null;
    if (card.target === 'cell') { const cells = W.buildCells(run); if (!cells.length) continue; const c = R.pick(cells); target = { x: c[0], y: c[1] }; }
    else if (card.target === 'room') target = R.pick(Object.keys(w.rooms));
    else if (card.target === 'res') target = R.pick(['wood', 'stone']);
    W.playBuildCard(run, inst.uid, target);
  }
  W.endMorning(run);
}
function nearestWalk(run, R) {
  const f = forcedBoss(run); if (f !== undefined) return f;
  const w = run.ward;
  const cand = Object.keys(w.rooms).map((rid) => ({ rid, p: pathR(run, rid) })).filter((x) => x.p.ok && !x.p.wait);
  const live = cand.filter((x) => x.p.triggers.length && x.p.triggers.every((t) => t.kind !== 'boss'));
  const pool = (live.length ? live : cand).sort((a, b) => a.p.cost - b.p.cost);
  return startR(run, pool.length ? pool[0].rid : w.hero.room);
}
function strongWalk(run, R, avoid = false) {
  const w = run.ward;
  if (avoid) { avoid = !Object.values(w.rooms).some((r) => r.type === 'rm_ward' && r.contents.length >= 5); }
  let best = null, bs = -1e9;
  for (const rid of Object.keys(w.rooms)) {
    const p = pathR(run, rid); if (!p.ok) continue;
    const variants = [{ ...p, alt: 0 }, ...p.alts.map((a, i) => ({ ...a, alt: i + 1, wait: p.wait }))];
    for (const v of variants) { let s = walkScore(run, v) + R.next() * 0.3; if (avoid && v.triggers.some((t) => !t.bribed && (t.kind === 'fight' || t.kind === 'elite' || (t.kind === 'boss' && t.detail.early)))) s -= 1000; if (s > bs) { bs = s; best = [rid, v.alt]; } }
  }
  return startR(run, best[0], best[1]);
}

// ---------------- random policy ----------------
function randomMorning(run, R) {
  const w = run.ward;
  for (let g = 0; g < 10 && w.deck.hand.length && R.next() < 0.8; g++) {
    const inst = R.pick(w.deck.hand), card = W.BUILD_CARDS[inst.id];
    let target = null;
    if (card.target === 'cell' || card.effect === 'demolish' && R.next() < 0.3) { const cells = W.buildCells(run); if (!cells.length) continue; const c = R.pick(cells); target = { x: c[0], y: c[1] }; }
    else if (card.target === 'room') target = R.pick(Object.keys(w.rooms));
    else if (card.target === 'res') target = R.pick(['wood', 'stone']);
    W.playBuildCard(run, inst.uid, target);
  }
  if (R.next() < 0.2) W.togglePower(run, R.pick(Object.keys(w.rooms)));
  W.endMorning(run);
}
function randomWalk(run, R) {
  const w = run.ward;
  const ok = Object.keys(w.rooms).filter((rid) => pathR(run, rid).ok);
  return startR(run, R.pick(ok));
}

// GW_UNLOCK=start+card,graft opens the start pool plus every locked item of those kinds (card graft relic potion event build): ablations of the all pool
function unlockOpt(v) {
  if (!v.startsWith('start+')) return v;
  const kinds = v.slice(6).split(',');
  // a kind may be narrowed: graft:safe | graft:ember (tier or school), card:marrow (hero)
  const ok = (e) => kinds.some((k) => { const [kd, sub] = k.split(':'); if (kd !== e.kind) return false; if (!sub) return true; const it = (e.kind === 'graft' ? GRAFTS : e.kind === 'card' ? CARDS : RELICS)[e.itemId] || {}; return [it.tier, it.school, it.hero, it.rarity].includes(sub); });
  return Object.values(UNLOCKS).filter((e) => e.tier === 'locked' && ok(e)).map((e) => e.id);
}
// ---------------- the run ----------------
// policy: a name (see the header) or a policy object { fight, pickGraft, pickRelic, forge, maxStrain, greed, ... }; o: { unlocked, assist, onMorning(run), tag }
// Returns { outcome, act, day, hp, floors (fights fought), log: { fights, acts: per-act counts }, run }.
export function playWardRun(heroId, seed, policy = 'strong', asc = 0, o = {}) {
  const custom = typeof policy === 'object', name = custom ? o.tag || 'custom' : policy;
  const pol = custom ? policy : POLICIES[policy] || POLICIES.strong, rnd = policy === 'random' || policy === 'sloppy', R = mkRng(`ward:${name}:${seed}`);
  const morningFn = { random: randomMorning, sloppy: sloppyMorning, passive: (r) => W.endMorning(r) }[policy] || strongMorning;
  const walkFn = { random: randomWalk, sloppy: nearestWalk, passive: hideWalk, fill: (r, Rn) => strongWalk(r, Rn, true) }[policy] || strongWalk;
  const run = RUN.newRun({ hero: heroId, seed, ascension: asc, assist: o.assist, unlocked: o.unlocked || unlockOpt(process.env.GW_UNLOCK || 'all') });
  const acts = { 1: blank(), 2: blank(), 3: blank() };
  const log = { fights: [], events: 0, shops: 0, acts };
  let guard = 0;
  while (guard++ < 3000 && run.phase !== 'dead' && run.phase !== 'won') {
    const A = acts[run.act];
    switch (run.phase) {
      case 'ward': {
        if (run.ward.phase === 'morning') { morningFn(run, R); if (o.onMorning) o.onMorning(run); break; }
        A.walks++;
        const r = walkFn(run, R);
        if (r === false) throw new Error('illegal walk ' + run.ward.why);
        break;
      }
      case 'combat': {
        const p = run.pending, kind = p.fightKind, hp0 = run.hp;
        const res = rnd ? tierFight(run, policy, R) : (pol.fight || fight)(run, pol).res;
        log.fights.push({ act: run.act, kind, win: res.win, hp0, hp: run.hp, count: (p.ward && p.ward.count) || p.enemies.length });
        if (kind === 'normal') { A.fights++; A.monsters += (p.ward && p.ward.count) || p.enemies.length; }
        if (kind === 'elite') A.elites++;
        if (kind === 'boss') A.boss = (p.ward && p.ward.early) ? 'early' : 'night';
        RUN.resolveFight(run, res); break;
      }
      case 'reward': {
        const rw = run.pending; RUN.claimGold(run, rw);
        if (rw.relic && (!rnd || R.next() < 0.5)) RUN.addRelic(run, rw.relic);
        if (rw.relicChoices && rw.relicChoices.length) RUN.addRelic(run, rnd ? R.pick(rw.relicChoices) : pickRelicWard(pol, rw.relicChoices));
        if (rw.potion && (!rnd || R.next() < 0.5)) RUN.addPotion(run, rw.potion);
        if (rw.buildChoice) W.takeBuildChoice(run, rnd ? (R.next() < 0.7 ? R.pick(rw.buildChoice) : null) : pickBuild(run, rw.buildChoice));
        RUN.afterReward(run); break;
      }
      case 'graft': {
        let pick = null;
        if (rnd) { const offer = run.pending.offer; if (R.next() < 0.7 && offer.cards.length) { const uid = R.pick(offer.cards), gid = R.pick(offer.grafts); if (canGraft(RUN.findInst(run, uid), gid)) pick = [uid, gid]; } }
        else pick = chooseGraft(run, pol);
        if (pick) RUN.applyGraft(run, pick[0], pick[1]);
        else RUN.skipGraft(run, rnd ? R.pick(['heal', 'budget', 'gold']) : (run.hp / run.maxHp < 0.7 ? 'heal' : 'budget'));
        RUN.afterGraft(run); break;
      }
      case 'shop': {
        A.shops++;
        const shop = run.pending;
        if (rnd) {
          for (let k = 0; k < 4; k++) {
            const opts = [];
            for (const kd of ['relic', 'card', 'potion', 'build']) (shop[kd + 's'] || []).forEach((r, i) => { if (!r.sold && run.gold >= r.price) opts.push([kd, i]); });
            if (!opts.length || R.next() < 0.3) break;
            const [kd, i] = R.pick(opts); RUN.shopBuy(run, kd, i);
          }
          RUN.advance(run);
        } else {
          const want = shop.builds.map((b, i) => ({ b, i, v: buildValue(run, b.id) })).filter((x) => x.v >= 5 && run.gold >= x.b.price + 60).sort((a, b) => b.v - a.v)[0];
          if (want) RUN.shopBuy(run, 'build', want.i);
          doShop(run, pol, log);
        }
        break;
      }
      case 'forge': {
        A.forges++;
        if (rnd) { const ch = R.pick(['rest', 'expand', 'refine']); if (ch === 'refine') { const ups = run.deck.filter((x) => !x.up); if (ups.length) RUN.forgeAct(run, 'refine', R.pick(ups).uid); } else RUN.forgeAct(run, ch); RUN.advance(run); }
        else doForge(run, pol);
        break;
      }
      case 'event': {
        A.events++;
        const ch = RUN.eventChoices(run).filter((x) => x.ok && (!x.pick || x.cards.length));
        const best = rnd ? R.pick(ch) : ch.slice().sort((a, b) => eventScore(run, b) - eventScore(run, a))[0];
        let uid; if (best.pick === 'card') uid = rnd ? R.pick(best.cards) : pickEventCard(run, best, best.cards);
        RUN.eventChoose(run, best.i, uid); RUN.afterEvent(run); break;
      }
      default: throw new Error('stuck in phase ' + run.phase);
    }
  }
  if (run.phase !== 'dead' && run.phase !== 'won') throw new Error('ward run did not finish: ' + run.phase);
  const rests = run.ward ? run.ward.log.length : 0;
  return { outcome: run.phase, act: run.act, day: run.ward ? run.ward.day : 0, hp: run.hp, floors: log.fights.length, log, run, rests };
}
// the boss relic ranking (BOSS_RANK) knows only the combat relics (an unknown id sorts first): a Ward relic (`ward: true`, a building or
// walking perk) is taken only when nothing else is offered
function pickRelicWard(pol, ids) {
  const plain = ids.filter((id) => !RELICS[id].ward), ward = ids.filter((id) => RELICS[id].ward);
  if (plain.length) return pol.pickRelic ? pol.pickRelic(plain) : plain[0];
  return ward[0];
}
function blank() { return { walks: 0, fights: 0, monsters: 0, elites: 0, events: 0, shops: 0, forges: 0, boss: null }; }
function buildValue(run, id) {
  const c = W.BUILD_CARDS[id];
  if (c.kind === 'room') return roomPriority(run, c.room);
  return { b_reinforced_beds: 6, b_morning_rounds: 5, b_requisition: 4, b_rations: 3, b_overtime: 3, b_scrub_in: 3, b_triage: 2 }[id] || 1;
}
function pickBuild(run, ids) { return ids.slice().sort((a, b) => buildValue(run, b) - buildValue(run, a))[0]; }

export function wardTable(policy, N, asc = 0, heroes = Object.keys(HEROES)) {
  const rows = [];
  for (const h of heroes) {
    const rs = []; for (let i = 0; i < N; i++) rs.push(playWardRun(h, `ward-${policy}-${h}-${i}`, policy, asc));
    rows.push({ hero: h, rs });
  }
  return rows;
}
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export function describe(policy, rows) {
  const out = [];
  for (const { hero, rs } of rows) {
    const wins = rs.filter((r) => r.outcome === 'won').length;
    const died = [0, 0, 0]; rs.forEach((r) => { if (r.outcome === 'dead') died[r.act - 1]++; });
    const per = [1, 2, 3].map((a) => { const reached = rs.filter((r) => r.outcome === 'won' || r.act > a); const A = reached.map((r) => r.log.acts[a]); return A.length ? `A${a} f${avg(A.map((x) => x.fights)).toFixed(1)} m${avg(A.map((x) => x.monsters)).toFixed(1)} e${avg(A.map((x) => x.elites)).toFixed(1)} ev${avg(A.map((x) => x.events)).toFixed(1)} sh${avg(A.map((x) => x.shops)).toFixed(1)} fo${avg(A.map((x) => x.forges)).toFixed(1)} early${A.filter((x) => x.boss === 'early').length}/${A.length}` : `A${a} -`; });
    out.push(`${policy.padEnd(6)} ${hero.padEnd(7)} win ${wins}/${rs.length} (${(100 * wins / rs.length).toFixed(0)}%)  died act1/2/3 ${died.join('/')}  ${per.join('  ')}`);
  }
  return out.join('\n');
}


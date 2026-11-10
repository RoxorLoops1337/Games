// Strong policy bot for GRAFTWORK (balance round 2). UNTESTED when written: the author session had no shell.
//   node tools/graftwork_strong.mjs [runsPerHero=40] [ascension=0] [hero]
// Adds POLICIES.strong to the sim's POLICIES object (sim file only gained exports and two hooks: pol.fight, pol.pickGraft).
// Fight: per-card score = cardValue ratio + Thread bonus from seamPreview (extend / paying cut / wasted cut), block weight
// rises with incoming damage vs HP, kill-first targeting by (hp+block) per threat. Grafts: sim graftScore + school-focus bonus.
// Odile's declaration (hero.declare, once per turn): every card is also scored as if declared; the bot declares the card it plays
// when that is worth clearly more for the Thread (a cut that becomes a knot, a Slack card that joins the Line). GW_DECLARE=0 never declares.
// "Cut the Line." cards (Snip, Tailor's Shears, Hemostatic Snip) are held while another affordable card in hand could still start
// or extend the Line: the cut is worth the most last (GW_HOLDCUT=0 plays them as soon as they score).
import * as RUN from '../graftwork/engine/run.js';
import { newCombat, playCard, endTurn, canPlay, intentOf, resolvePending, usePotion, finishCombat, specOf } from '../graftwork/engine/combat.js';
import { seamPreview, canDeclare, declareOf, setDeclare, cutsLine, seamCap } from '../graftwork/engine/seam.js';
import { hashSeed } from '../graftwork/engine/rng.js';
import { cardSpec, canGraft, canTemper, schoolsOf, newInst } from '../graftwork/engine/cards.js';
import { GRAFTS, HEROES, CARDS } from '../graftwork/data/index.js';
import { POLICIES, cardValue, graftScore, playRun, cardV as fxValueOf } from './graftwork_sim.mjs';

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
void CARDS;
const DECLARE_ON = process.env.GW_DECLARE !== '0', DECLARE_MIN = 1; // declare only when the Thread gains more than this
const HOLDCUT_ON = process.env.GW_HOLDCUT !== '0';

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

// ---------- card pick / shop buy policy (GW_PICK) ----------
// Cards only enter a run through the shop (5 per visit). Policy: score every shelf card, buy the best while it beats skipping by a margin.
// score = static value gain over the deck's median card (cardValue ratio via sim fxValue) + audit forced-win delta (wins per 200 runs / 20)
//         + school bonus (shares the school of the deck's grafts) - dead-pick penalty (cards the audit measured as rarely played).
// Gold budget: keep GW_RESERVE gold back for junk removal; at most GW_MAXBUY cards per run.
// forced-card sweep (tools/graftwork_cardsweep.mjs, 2 copies in the starter deck, 200 runs, A0, no-pick bot): wins versus control, mean over heroes that can use the card
const AUDIT_DELTA = { o_thread_doublehem: 63, m_secondwind: 58, m_restraints: 53, o_tip_the_usher: 52, w_burnout: 47, m_stitchwork: 45, x_plate: 45, m_desperate: 43, o_liquidate: 43, m_cauterize: 42, m_hemostatic_snip: 38, o_golden_parachute: 36, m_exsang: 35, w_bare_wire: 34, m_thread_stitchup: 33, w_wax_drip: 33, w_quick_flick: 29, o_mirror_sale: 29, x_adrenal: 28, m_hacksaw: 25, w_wax_armor: 25, m_mirrored_wound: 24, w_hot_seam: 24, m_flick: 23, m_blank_chart: 23, o_thread_sparespool: 23, m_thread_longsuture: 22, w_ember_toss: 22, o_market_crash: 48, w_blowtorch: 19, w_thread_trail: 18, o_pocket_change: 15, m_tailored_cut: 14, m_thread_bloodline: 14, w_pyre_dance: 14, o_double_bill: 14, w_thread_fusewire: 13, o_heirloom: 13, m_triage: 12, x_lunge: 11, o_second_helping: 10, w_capacitor_bank: 9, m_epidemic: 8, o_bulk_order: 8, o_clean_book: 8, w_thread_arcstitch: 7, m_stitch_count: 6, m_light_packing: 6, w_spark_gap: 6, o_levy: 6, o_bidding_war: 6, m_suture: 5, x_thread_basting: 5, w_earth_wire: 5, o_standing_order: 4, x_barbs: 3, w_scald: 3, w_fuse_bridge: 3, x_recall: 2, w_static_seam: 2, m_biohazard: 1, m_fever_chart: 1, w_leather_apron: 1, w_tempered_wick: 1, m_hemostat: 0, m_stress_test: -1, m_hammered_plate: -1, x_hold: -1, o_ledger_line: -1, m_scabover: -2, w_overcurrent: -2, o_loose_change: -2, m_lancet: -3, x_second: -3, x_thread_snip: -3, o_pawn_ticket: -3, o_patronage: -3, m_swab: -4, x_cleave: -4, w_tithe_pyre: -4, o_hostile_takeover: -4, w_arc_flash: -5, o_choir_loft: -5, m_flakeoff: -6, m_scrap_splint: -6, m_sweep: -7, m_thread_rustseam: -7, w_cinder_rain: -7, m_sewn_shut: -8, x_thread_cross: -8, w_slow_match: -8, w_dynamo: -8, o_overdraft: -8, m_scarpower: -9, x_gauze: -9, x_poise: -9, w_static_cling: -9, w_thread_conflagration: -9, o_triple_threat: -9, o_layaway: -10, o_dividend: -10, x_shrug: -11, o_heavy_purse: -11, x_jab: -12, o_reprint: -12, o_cross_listing: -12, m_hemorrhage: -13, w_conductive_thread: -13, o_hardened_purse: -13, w_backdraft: -14, m_drawblood: -15, x_brace: -15, w_tinder_stack: -15, x_haymaker: -16, x_thread_shears: -16, o_tithe_ledger: -16, m_reopen: -18, m_laybare: -18, o_gilded_age: -18, m_vivisect: -19, x_thread_tieoff: -19, o_browse: -19, x_thread_unpick: -21, m_bloodrite: -22, w_substation: -22, m_anticoag: -23, w_ringing_ears: -23, o_receipt: -24, o_inventory: -24, o_audit: -2, x_thread_pinking: -25, w_graft_furnace: 9, m_rustplate: -27, x_sweep: -27, x_flatline: 6, w_discharge: -28, m_amputate: -29, w_powder_keg: -30, w_wildfire_spread: -31, w_pilot_light: -31, o_overbooked: -31, o_keepsake: -32, w_flashpoint: -33, x_resolve: 30, x_thread_loom: -35, o_prepaid: -35, o_thread_embroidered: -35, w_wildfire: -37, w_chain_reaction: -7, o_thread_tapestry: -60 };
const PICK_ON = () => (process.env.GW_PICK ?? '1') !== '0';
export function auditDelta(id) { return AUDIT_DELTA[id] || 0; }
export function strongShopCards(run, shop, pol) {
  const margin = +(process.env.GW_MARGIN ?? 1.0), maxBuy = +(process.env.GW_MAXBUY ?? 4), reserve = +(process.env.GW_RESERVE ?? 0);
  const real = run.deck.filter((x) => CARDS[x.id].type !== 'junk');
  const vals = real.map((x) => cardValueStatic(x)).sort((x, y) => x - y);
  const med = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
  const focus = {};
  for (const inst of run.deck) for (const g of inst.grafts) { const s = GRAFTS[g].school; focus[s] = (focus[s] || 0) + 1; }
  const top = Object.entries(focus).sort((a, b) => b[1] - a[1])[0];
  const junkRemoval = run.deck.some((x) => CARDS[x.id].type === 'junk') ? RUN.servicePrice(run, 'remove') : 0;
  run.flags.gwBought = run.flags.gwBought || 0;
  for (let n = 0; n < 4 && run.flags.gwBought < maxBuy; n++) {
    let best = -1, bs = +(process.env.GW_THRESH ?? 3);
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
function cardValueStatic(inst) { return fxValueOf(inst); }

// Boss relic choice (the plain sim takes choice 0). Rank from forced-pick runs (100 runs x 3 heroes each, A0).
const BOSS_RANK = ['r_second_wind', 'r_lead_apron', 'r_tithe_crown', 'r_parasite_heart', 'r_hollow_ledger', 'r_glass_throat', 'r_absolution', 'r_gamblers_thread'];
const pickRelic = (ch) => ch.slice().sort((a, b) => BOSS_RANK.indexOf(a) - BOSS_RANK.indexOf(b))[0];
const STRONG = { pickRelic, maxStrain: +(process.env.GW_MS ?? 2), greed: +(process.env.GW_GREED ?? 0.6), fight: strongFight, pickGraft: strongPickGraft, forge: strongForge };
POLICIES.strongNoPick = { ...STRONG, buyCards: +(process.env.GW_BUY ?? 0) };
POLICIES.strongPick = { ...STRONG, buyCards: 1, shopCards: strongShopCards, cardsFirst: (process.env.GW_FIRST ?? '1') === '1' };
POLICIES.strong = PICK_ON() ? POLICIES.strongPick : POLICIES.strongNoPick;

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

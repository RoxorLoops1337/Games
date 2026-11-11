// Content unlock model: what is open from the first run, what is locked, in which order it opens and what it costs.
// Pure data + derivation, no meta access (engine/unlock.js does the bookkeeping). Item ids are never renamed (saves).
// Unlock id = `${kind}:${itemId}`, kind in card | graft | relic | potion | event | build (Ward building cards, data/ward.js). Heroes and ascensions are separate (HERO_GATES).
// Voice: no em dashes.
import { CARDS, GRAFTS, RELICS, POTIONS, EVENTS, HEROES, BUILD_CARDS } from './index.js';

// ============================ MODEL CONSTANTS (tune here) ============================
// Unlock Points (UP) a finished run pays. Every term is added, then clamped to [UP.FLOOR, UP.RUN_CAP].
export const UP = {
  FLOOR: 2,            // even an instant death pays this (abandoned runs under ABANDON_MIN_FLOORS floors pay 0)
  PER_FLOOR: 0.04,      // per map node cleared
  ELITE: 0.9, ELITE_MAX: 6,
  BOSS: 4.8,           // per Act boss killed (the final boss is the win)
  ACT: { 1: 0, 2: 2, 3: 7 }, // UP for the deepest Act reached
  WIN: 14, PER_ASC: 0.8,      // a win, plus per ascension level of that win
  FIRST_KILL: 0.5, FIRST_KILL_MAX: 8, // first lifetime kill of an enemy type (count capped per run)
  ACHIEVEMENT: 2.5, ACHIEVEMENT_MAX: 3, // new achievements this run (count capped)
  RUN_CAP: 32,         // a perfect run never pays more than this, so TOTAL_COST / RUN_CAP is the hard minimum of runs
  ASSIST_MULT: 0.5,    // Assist runs pay half (the floor still applies)
  ABANDON_MIN_FLOORS: 3,
};
const TARGET_TOTAL = 930;    // total UP that opens every locked item (cost curve is normalised to this)
const COST_CURVE = { early: 0.55, late: 1.65 };     // item cost multiplier at queue position 0 and 1 (linear between)
const COST_BASE = { card: 2.2, graft: 2.0, relic: 3.0, potion: 2.0, event: 1.5, build: 2.0 };
const COST_RARITY = { common: 0.8, uncommon: 1.0, shop: 1.0, rare: 1.6, boss: 1.6 };
const STEP_SIZE = { card: 3, graft: 3, relic: 3, potion: 2, event: 2, build: 2 }; // items per queue step (a "drop")
export const AFFINITY_WINDOW = 6;   // the next step is picked from the first N open steps; the most played hero's step wins
export const AFFINITY_MIN_RUNS = 2; // runs with a hero before its cards are pulled forward
export const WELCOME_UP_PER_RUN = 5, WELCOME_UP_CAP = 160; // old saves: one-time UP for runs already played

// Heroes open on run COUNT (finished runs) plus the old trigger, with a count-only fallback so nobody is stuck.
export const HERO_GATES = {
  wick: { rule: 'act2', runs: 5, fallbackRuns: 7, text: 'Reach Act 2 in a run, after 5 runs (7 runs at the latest).' },
  odile: { rule: 'win', runs: 11, fallbackRuns: 15, text: 'Win a run, after 11 runs (15 runs at the latest).' },
};

// ============================ STARTING POOL ============================
// Everything NOT listed here is locked. Cards: ~38 percent. Every hero keeps 3 archetypes, all 7 schools have tier 1 and 2 grafts,
// Overload and Temper are core rules (always on), every act, elite and boss is present, starter decks are never gated.
const L = (s) => s.split(/\s+/).filter(Boolean);
export const START = {
  card: new Set(L(`
    m_flick m_lancet m_hemostat m_swab m_sweep m_triage m_cauterize m_restraints m_drawblood m_scabover m_light_packing m_thread_bloodline
    m_reopen m_suture m_rustplate m_thread_rustseam
    w_ember_toss w_cinder_rain w_static_cling w_discharge w_scald w_leather_apron w_wax_drip w_quick_flick w_blowtorch w_tinder_stack w_spark_gap w_thread_trail
    w_flashpoint w_wildfire_spread w_slow_match w_static_seam
    o_receipt o_pocket_change o_heavy_purse o_levy o_double_bill o_loose_change o_browse o_layaway o_tip_the_usher o_choir_loft o_cross_listing o_thread_embroidered
    o_bidding_war o_audit o_second_helping o_dividend
    x_jab x_haymaker x_brace x_gauze x_shrug x_thread_cross x_thread_snip x_thread_tieoff x_lunge x_poise`)),
  graft: new Set(L(`
    g_ember_pin g_cinder_wrap g_whip_stitch g_held_breath g_lead_thread g_reverb g_quick_hands g_brass_staple g_stockpile g_sutured_seam g_nicked_vein g_kin_blood
    g_oxide_patch g_pitted_edge g_cross_ply g_ground_wire g_arc_clip g_slip_knot g_leaf_gilt g_gauze_wrap g_fine_gilt g_kindred_coals g_pilot_knot g_gold_standard
    g_scorch_thread g_borrowed_pulse g_pawn_tag g_red_cuff g_pitting_salt g_live_lead g_gilt_plating
    g_kiln_heart g_double_spine g_pack_rat g_open_vein g_rotten_plating g_overclock g_gold_tooth g_scissor_loop g_reef_knot
    g_hollow_bone g_vampire_teeth g_return_spring g_loaded_die g_ash_pact g_gold_wager`)),
  relic: new Set(L(`
    r_bandage_roll r_scar_tissue r_free_sample r_cold_storage r_suture_thread r_tithe_receipt r_bare_bones r_haggler r_clean_hands r_grafters_apron r_even_keel r_single_stitch r_bobbin r_thimble r_blunt_shears
    r_second_opinion r_second_look r_shatter_ward r_overload_valve r_bare_hands r_unjam_oil r_indulgence r_forge_hammer r_heavy_seam r_second_colour r_grounding_rod
    r_toll_booth r_light_load
    r_second_wind r_hollow_ledger r_lead_apron r_tithe_crown
    r_pawn_ticket r_budget_ledger
    r_w_noon_ration r_w_moon_lamp r_w_spare_fuse r_w_night_ledger r_w_stockpile_deed`)),
  potion: new Set(L(`p_smelling_salts p_tonic p_firebomb p_sting p_adrenaline p_bitter_draught p_weak_tea p_unjam p_untithe p_strain_relief p_tourniquet p_vapors p_ether`)),
  event: new Set(L(`
    e_second_hand_surgeon e_back_alley_swap e_budget_loan e_tithe_collector e_free_polish e_coin_flip e_gift_basket e_lottery_ward
    e_vending_machine e_night_shift e_orderly_challenge e_gurney_race e_dentist_chair e_loan_shark e_weigh_in
    e_pickled_graft e_haggler e_lamp_lottery e_black_market_clinic e_patient_returns e_debt_collector
    e_w_menu_board e_w_visiting_hours e_w_night_porter e_w_shift_change
    e_costume_rack e_rehearsal e_balcony_seat e_standing_ovation e_understudy e_repossession`)),
  // Ward building cards: the 11 original rooms plus Scaffold and Laundry, and about half of the upgrade and effect cards (the starter building deck is inside this set).
  // The other new rooms (Pharmacy, Library, Morgue, Kitchen, Boiler, Isolation Ward II) and the sharper upgrades and effects are earned.
  build: new Set(L(`
    b_corridor b_ward b_isolation b_chapel b_dispensary b_workshop b_sawmill b_quarry b_counting b_generator b_linen b_scaffold b_laundry
    b_overtime b_iron_doors b_reinforced_beds b_double_doors b_morning_rounds b_requisition b_triage b_lamp_oil b_overtime_pay b_open_ledger b_fresh_linens b_expand`)),
};

// ============================ DERIVATION ============================
const KINDS = ['card', 'graft', 'relic', 'potion', 'event', 'build'];
const RANK = { common: 0, uncommon: 1, shop: 1, rare: 2, boss: 2.5 };
const TIERR = { safe: 0, greedy: 1, weird: 2 };
const TYPER = { attack: 0, skill: 1, power: 2 };
const kindOfTable = { card: CARDS, graft: GRAFTS, relic: RELICS, potion: POTIONS, event: EVENTS, build: BUILD_CARDS };
export const uid = (kind, id) => `${kind}:${id}`;

// Items that can be gated (everything a run can roll), in definition order.
function gateable() {
  const out = [];
  for (const c of Object.values(CARDS)) if (c.rarity !== 'starter' && c.rarity !== 'junk' && c.type !== 'junk' && c.hero !== 'junk') out.push({ kind: 'card', id: c.id, d: c });
  for (const g of Object.values(GRAFTS)) out.push({ kind: 'graft', id: g.id, d: g });
  for (const r of Object.values(RELICS)) if (r.rarity !== 'start') out.push({ kind: 'relic', id: r.id, d: r });
  for (const p of Object.values(POTIONS)) out.push({ kind: 'potion', id: p.id, d: p });
  for (const e of Object.values(EVENTS)) out.push({ kind: 'event', id: e.id, d: e });
  for (const b of Object.values(BUILD_CARDS)) out.push({ kind: 'build', id: b.id, d: b });
  return out;
}
const power = (it, i) => {
  const d = it.d;
  if (it.kind === 'card') return (RANK[d.rarity] || 0) * 10 + (d.cost === 'X' ? 2.5 : d.cost || 0) + (TYPER[d.type] || 0) * 0.5;
  if (it.kind === 'graft') return (TIERR[d.tier] || 0) * 10 + (RANK[d.rarity] || 0) * 3 + (d.weight || 1);
  if (it.kind === 'relic' || it.kind === 'potion' || it.kind === 'build') return (RANK[d.rarity] || 0) * 10 + 0.001 * i;
  return (d.act || 0) * 10 + 0.001 * i; // events: neutral first, then Act 1..3
};
const rarityOf = (it) => it.d.rarity || 'common';
const streamOf = (it) => (it.kind === 'card' ? 'card:' + it.d.hero : it.kind);
const heroOfStream = (s) => (s.startsWith('card:') && s !== 'card:any' ? s.slice(5) : null);

function build() {
  const all = gateable();
  const items = {};     // unlockId -> entry
  const byItem = {};    // itemId -> entry
  const streams = {};
  all.forEach((it, i) => {
    const isStart = START[it.kind].has(it.id);
    const e = { id: uid(it.kind, it.id), kind: it.kind, itemId: it.id, tier: isStart ? 'start' : 'locked', rarity: rarityOf(it), hero: it.kind === 'card' && it.d.hero !== 'any' ? it.d.hero : null, act: it.kind === 'event' ? it.d.act : null, school: it.d.school || null, _p: power(it, i), step: null, hint: '', cost: 0 };
    if (items[e.id] || byItem[e.itemId]) throw new Error('duplicate unlock id ' + e.id);
    items[e.id] = e; byItem[e.itemId] = e;
    if (!isStart) (streams[streamOf(it)] = streams[streamOf(it)] || []).push(e);
  });
  for (const k of KINDS) for (const id of START[k]) if (!kindOfTable[k][id]) throw new Error(`START.${k} lists unknown id ${id}`);
  // steps: chunk every stream (sorted by power) into drops, then merge all streams by relative position
  const steps = [];
  for (const [name, list] of Object.entries(streams)) {
    list.sort((a, b) => a._p - b._p);
    const kind = list[0].kind, size = STEP_SIZE[kind] || 3, n = list.length;
    for (let s = 0; s < n; s += size) {
      const chunk = list.slice(s, s + size);
      const pos = (s + chunk.length / 2) / n; // 0..1 inside the stream
      steps.push({ stream: name, kind, hero: heroOfStream(name), items: chunk, pos, order: steps.length });
    }
  }
  steps.sort((a, b) => a.pos - b.pos || a.order - b.order);
  steps.forEach((s, i) => { s.id = 's' + String(i + 1).padStart(3, '0'); s.index = i; s.pos = i / Math.max(1, steps.length - 1); for (const e of s.items) e.step = s.id; });
  // cost curve, normalised so the sum is TARGET_TOTAL
  const raw = (e, pos) => COST_BASE[e.kind] * (COST_RARITY[e.rarity] || 1) * (COST_CURVE.early + (COST_CURVE.late - COST_CURVE.early) * pos);
  let sum = 0; for (const s of steps) for (const e of s.items) sum += raw(e, s.pos);
  const k = TARGET_TOTAL / sum;
  for (const s of steps) { let c = 0; for (const e of s.items) { e.cost = Math.max(1, Math.round(raw(e, s.pos) * k)); c += e.cost; } s.cost = c; }
  const total = steps.reduce((a, s) => a + s.cost, 0);
  // hints
  const stage = (pos) => (pos < 0.34 ? 'an early' : pos < 0.67 ? 'a mid' : 'a late');
  for (const s of steps) for (const e of s.items) {
    const d = kindOfTable[e.kind][e.itemId];
    const who = e.kind === 'card' ? (e.hero ? (HEROES[e.hero] ? HEROES[e.hero].name : e.hero) + ' ' : 'Neutral ') : '';
    const what = e.kind === 'event' ? (e.act ? `An Act ${e.act} event` : 'An event') : e.kind === 'graft' ? `A ${d.tier} ${d.rarity} graft` : e.kind === 'relic' ? `A ${d.rarity} relic` : e.kind === 'potion' ? `A ${d.rarity} potion` : e.kind === 'build' ? `A ${d.rarity} Ward building card` : `A ${who}${d.rarity} card`;
    e.hint = `${what}. Earn Unlock Points to open it (${stage(s.pos)} unlock).` + (s.hero ? ` Playing ${HEROES[s.hero] ? HEROES[s.hero].name : s.hero} opens it sooner.` : '');
  }
  return { items, byItem, steps, total };
}
const B = build();
export const UNLOCKS = B.items;            // unlockId -> { id, kind, itemId, tier:'start'|'locked', rarity, hero, act, school, step, cost, hint }
export const UNLOCK_OF_ITEM = B.byItem;    // itemId -> entry
export const STEPS = B.steps;              // ordered queue: { id, kind, hero, pos, cost, items:[entries] }
export const TOTAL_COST = B.total;         // exact UP that opens every locked item
export const LOCKED_IDS = Object.keys(B.items).filter((k) => B.items[k].tier === 'locked');
export function inventory() {
  const o = { total: {}, start: {}, locked: {} };
  for (const e of Object.values(UNLOCKS)) { o.total[e.kind] = (o.total[e.kind] || 0) + 1; const t = e.tier === 'start' ? 'start' : 'locked'; o[t][e.kind] = (o[t][e.kind] || 0) + 1; }
  return o;
}

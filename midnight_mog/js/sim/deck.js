// Deck engine: draw pile, hand, discard, exhaust, energy. Deterministic and plain-JSON serializable.
// A deck is mutated in place by draw/play/tick (a battle owns one); use cloneDeck for a copy.
// The deck never stores the rng object: it keeps a 32 bit rng state (d.rs) so JSON.stringify(deck) is a full
// mid-battle save. Same cardIds + same rng state => same shuffles, forever.
import { makeRng } from '../rng.js';
import { CARD_BY_ID } from '../data/cards.js';
import { RELIC_BY_ID } from '../data/relics.js';
import { BUILDING_BY_ID, statsAt, adjacency } from '../data/buildings.js';
import { levelMult } from './economy.js';

export const DECK_BASE_SLOTS = 12;
export const HAND_SIZE = 5;
export const HAND_MAX = 10;
export const ENERGY_START = 3;
export const ENERGY_CAP = 10;
export const REGEN_BASE = 0.5;       // energy per second
export const CYCLE_COST = 1;         // energy to throw away the hand and redraw
const RARITY_POWER = { common: 1, rare: 2, epic: 4, legend: 8, mythic: 16 };

const num = (x, d = 0) => (Number.isFinite(x) ? x : d);

// ------------------------------------------------------------------ modifiers

/** Flatten a relic effect into a list of leaf effects (multi_mod steps). */
function leaves(e, out = []) {
  if (!e) return out;
  if (e.kind === 'multi_mod' || e.kind === 'multi') for (const s of e.steps || []) leaves(s, out);
  else out.push(e);
  return out;
}

/** Plain mods object. All fields optional on input of newDeck({mods}). */
export function defaultMods() {
  return { handSizeAdd: 0, startEnergyAdd: 0, energyCapAdd: 0, regenMult: 1, regenAdd: 0, firstFree: false, costAdd: 0, deckSlots: 0 };
}

/** Town hooks from a profile: {energyRegenPct, startEnergyAdd, deckSlots}. Uses building potency from adjacency. */
export function townHooks(profile) {
  const out = { energyRegenPct: 0, startEnergyAdd: 0, deckSlots: 0 };
  const plots = (profile && profile.town && profile.town.plots) || [];
  for (let i = 0; i < plots.length; i++) {
    const p = plots[i];
    const def = p && p.b ? BUILDING_BY_ID[p.b] : null;
    if (!def || !(p.level >= 1)) continue;
    const st = statsAt(def, p.level, adjacency(plots, i).potency);
    out.energyRegenPct += num(st.energyRegenPct);
    out.startEnergyAdd += num(st.startEnergyAdd);
    out.deckSlots += num(st.deckSlots);
  }
  return out;
}

/** Relic rules and card cost mods from owned relics (profile.relics = {id:true}) or an array of relic ids. */
export function relicMods(relics) {
  const ids = Array.isArray(relics) ? relics : Object.keys(relics || {}).filter((k) => relics[k]);
  const m = defaultMods();
  ids.sort();
  for (const id of ids) {
    const r = RELIC_BY_ID[id];
    if (!r) continue;
    for (const e of leaves(r.effect)) {
      if (e.kind === 'rule') {
        const v = num(e.value);
        if (e.rule === 'hand_size_add') m.handSizeAdd += v;
        else if (e.rule === 'start_energy_add') m.startEnergyAdd += v;
        else if (e.rule === 'energy_cap_add') m.energyCapAdd += v;
        else if (e.rule === 'energy_regen_mult') m.regenMult *= v;
        else if (e.rule === 'energy_regen_add') m.regenAdd += v;
        else if (e.rule === 'first_card_free') m.firstFree = v > 0 || m.firstFree;
      } else if (e.kind === 'stat_mod' && e.scope === 'cards' && e.stat === 'cost_add') {
        m.costAdd += num(e.add);
      }
    }
  }
  return m;
}

/** Everything a battle needs from the profile in one mods object (town + relics). */
export function modsFromProfile(profile) {
  const m = relicMods(profile && profile.relics);
  const t = townHooks(profile);
  m.startEnergyAdd += t.startEnergyAdd;
  m.regenMult *= 1 + t.energyRegenPct;
  m.deckSlots += t.deckSlots;
  return m;
}

/** Deck size cap: 12 plus Barracks slots. */
export function deckSlots(profile) {
  return DECK_BASE_SLOTS + Math.floor(townHooks(profile).deckSlots + 1e-9);
}

/**
 * Energy per second. `level` is the Laser Pointer Arcade level (0 = none): 0.5 * (1 + energyRegenPct).
 * `mods` (optional, from relicMods/modsFromProfile) applies relic multipliers and adds on top.
 */
export function energyRegen(level = 0, mods = null) {
  const def = BUILDING_BY_ID.laser_arcade;
  const pct = level >= 1 && def ? num(statsAt(def, level, 1).energyRegenPct) : 0;
  const m = mods || defaultMods();
  return Math.max(0, (REGEN_BASE * (1 + pct)) * m.regenMult + m.regenAdd);
}

// ------------------------------------------------------------------ rng plumbing

function withRng(d, fn) {
  const r = makeRng(1);
  r.setState(d.rs);
  const out = fn(r);
  d.rs = r.getState();
  return out;
}

function cardDef(id) { return CARD_BY_ID[id] || null; }
function flag(id, name) { const c = cardDef(id); return !!(c && (c[name] || (c.effect && c.effect[name]))); }
export const isExhaust = (id) => flag(id, 'exhaust');
export const isRetain = (id) => flag(id, 'retain');

// ------------------------------------------------------------------ construction

/**
 * New deck. cardIds is the deck list (duplicates allowed). Consumes one value from `rng` as the deck's own
 * stream seed. opts: {mods, deal:true (draw the opening hand), cap: max cards (e.g. deckSlots(profile))}.
 * Deck shape (all plain JSON):
 * { v:1, rs, draw:[id], hand:[id], discard:[id], exhaust:[id], energy, energyCap, regen, handSize,
 *   costAdd, firstFree, plays, total }
 */
export function newDeck(cardIds, rng, opts = {}) {
  const mods = { ...defaultMods(), ...(opts.mods || {}) };
  let ids = cardIds.slice();
  if (opts.cap != null) ids = ids.slice(0, opts.cap);
  const cap = Math.max(1, ENERGY_CAP + mods.energyCapAdd);
  const d = {
    v: 1,
    rs: (rng.int(1, 0x7fffffff)) >>> 0,
    draw: ids, hand: [], discard: [], exhaust: [],
    energy: Math.min(cap, ENERGY_START + mods.startEnergyAdd),
    energyCap: cap,
    regen: energyRegen(0, mods),
    handSize: Math.max(1, Math.min(HAND_MAX, HAND_SIZE + mods.handSizeAdd)),
    costAdd: mods.costAdd,
    firstFree: !!mods.firstFree,
    plays: 0,
    total: ids.length,
  };
  withRng(d, (r) => r.shuffle(d.draw));
  if (opts.deal !== false) draw(d, d.handSize);
  return d;
}

export function cloneDeck(d) { return JSON.parse(JSON.stringify(d)); }
export function serializeDeck(d) { return JSON.stringify(d); }
export function deserializeDeck(s) {
  const d = typeof s === 'string' ? JSON.parse(s) : s;
  if (!d || d.v !== 1 || !Array.isArray(d.draw) || !Array.isArray(d.hand)) throw new Error('bad deck');
  return d;
}

// ------------------------------------------------------------------ piles

/** Move the discard into the draw pile, shuffled. Returns the number of cards moved. */
export function reshuffle(d) {
  const n = d.discard.length;
  if (!n) return 0;
  const pile = d.discard.splice(0, n);
  withRng(d, (r) => r.shuffle(pile));
  // cards still in the draw pile (if any) are drawn first, then the reshuffled discard
  d.draw = d.draw.concat(pile);
  return n;
}

/**
 * Draw up to n cards into the hand (hand max HAND_MAX). Reshuffles the discard when the draw pile runs out.
 * Returns the array of drawn card ids (shorter than n when the deck is exhausted or the hand is full).
 */
export function draw(d, n = 1) {
  const got = [];
  for (let k = 0; k < n; k++) {
    if (d.hand.length >= HAND_MAX) break;
    if (!d.draw.length && !reshuffle(d)) break;
    const id = d.draw.shift();
    d.hand.push(id);
    got.push(id);
  }
  return got;
}

/** Draw until the hand holds handSize cards. */
export function refill(d) { return draw(d, d.handSize - d.hand.length); }

// ------------------------------------------------------------------ cost and energy

/** Effective energy cost of card id right now. */
export function cardCost(d, id) {
  const c = cardDef(id);
  if (!c) return 0;
  if (d.firstFree && d.plays === 0) return 0;
  const base = c.cost;
  if (base <= 0) return 0;
  return Math.max(1, base + (d.costAdd || 0));
}

export function canPlay(d, i, energy = d.energy) {
  if (!Number.isInteger(i) || i < 0 || i >= d.hand.length) return false;
  return energy + 1e-9 >= cardCost(d, d.hand[i]);
}

/** Regenerate energy over dt seconds (fixed 1/30 in battle). Returns the new energy. */
export function tick(d, dt) {
  d.energy = Math.min(d.energyCap, d.energy + d.regen * dt);
  return d.energy;
}

/** Add (or remove, if negative) energy, clamped to 0..cap. */
export function gainEnergy(d, n) {
  d.energy = Math.max(0, Math.min(d.energyCap, d.energy + n));
  return d.energy;
}

// ------------------------------------------------------------------ playing

/**
 * Play the card at hand index i: pays energy, moves it to discard (or exhaust), then refills the hand to
 * handSize. Returns {id, cost, exhausted, drew:[ids]} or null when the play is illegal (nothing changes).
 * opts.free = true skips the cost; opts.noRefill = true keeps the hole (refill later with refill()).
 */
export function play(d, i, opts = {}) {
  if (!Number.isInteger(i) || i < 0 || i >= d.hand.length) return null;
  const id = d.hand[i];
  const cost = opts.free ? 0 : cardCost(d, id);
  if (d.energy + 1e-9 < cost) return null;
  d.energy = Math.max(0, d.energy - cost);
  d.hand.splice(i, 1);
  d.plays++;
  const exhausted = isExhaust(id);
  (exhausted ? d.exhaust : d.discard).push(id);
  const drew = opts.noRefill ? [] : refill(d);
  return { id, cost, exhausted, drew };
}

/** Discard the hand except retained cards, then redraw to handSize. Costs CYCLE_COST energy unless free. */
export function cycleHand(d, free = false) {
  if (!free) {
    if (d.energy + 1e-9 < CYCLE_COST) return null;
    d.energy -= CYCLE_COST;
  }
  const keep = [];
  const out = [];
  for (const id of d.hand) (isRetain(id) ? keep : out).push(id);
  d.hand = keep;
  for (const id of out) d.discard.push(id);
  return { discarded: out.length, drew: refill(d) };
}

/** Put a card straight into the discard (generated cards) or hand. Counts toward total. */
export function addCard(d, id, to = 'discard') {
  if (to === 'hand' && d.hand.length < HAND_MAX) d.hand.push(id);
  else d[to === 'draw' ? 'draw' : 'discard'].push(id);
  d.total++;
}

/** Bring one exhausted card back to the discard (revive effects). Returns the id or null. */
export function unexhaust(d, id) {
  const k = id == null ? d.exhaust.length - 1 : d.exhaust.indexOf(id);
  if (k < 0) return null;
  const [c] = d.exhaust.splice(k, 1);
  d.discard.push(c);
  return c;
}

/** All card ids still in the deck, sorted (hand + draw + discard + exhaust). For invariants and tests. */
export function allCards(d) { return [].concat(d.draw, d.hand, d.discard, d.exhaust).sort(); }

// ------------------------------------------------------------------ summary

/**
 * Summary of the profile's deck for the deck builder UI and the bots:
 * {size, slots, full, avgCost, types, rarities, power, regen, handSize, startEnergy, issues:[string]}.
 * power = sum over cards of rarity weight * levelMult(card level).
 */
export function deckPower(profile) {
  const ids = (profile && profile.deck) || [];
  const mods = modsFromProfile(profile);
  const slots = DECK_BASE_SLOTS + Math.floor(mods.deckSlots + 1e-9);
  const types = { summon: 0, spell: 0, trap: 0, build: 0 };
  const rarities = { common: 0, rare: 0, epic: 0, legend: 0, mythic: 0 };
  const owned = (profile && profile.cards) || {};
  const used = {};
  const issues = [];
  let power = 0, costSum = 0;
  for (const id of ids) {
    const c = cardDef(id);
    if (!c) { issues.push('unknown card ' + id); continue; }
    types[c.type]++;
    rarities[c.rarity]++;
    costSum += c.cost;
    const lvl = (owned[id] && owned[id].level) || 1;
    power += (RARITY_POWER[c.rarity] || 1) * levelMult(lvl);
    used[id] = (used[id] || 0) + 1;
  }
  for (const id of Object.keys(used)) {
    const have = owned[id] ? owned[id].count : null;
    if (have != null && used[id] > have) issues.push('not enough copies of ' + id);
  }
  if (ids.length > slots) issues.push('deck over its ' + slots + ' slots');
  if (ids.length < HAND_SIZE) issues.push('deck needs at least ' + HAND_SIZE + ' cards');
  if (!types.summon) issues.push('no summon card');
  return {
    size: ids.length, slots, full: ids.length >= slots,
    avgCost: ids.length ? costSum / ids.length : 0,
    types, rarities, power,
    regen: energyRegen(0, mods),
    handSize: Math.max(1, Math.min(HAND_MAX, HAND_SIZE + mods.handSizeAdd)),
    startEnergy: Math.min(ENERGY_CAP + mods.energyCapAdd, ENERGY_START + mods.startEnergyAdd),
    issues,
  };
}

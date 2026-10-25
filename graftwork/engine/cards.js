// Card specs, graft application, Budget / Strain / Tithe. Pure: no DOM, no combat state.
//
// A deck card is an INSTANCE: { uid, id, grafts: [graftId...], up: 0|1 }.
// cardSpec(inst) folds the base card, its upgrade and every graft into one SPEC the combat engine plays.
import { CARDS, GRAFTS, RELICS } from '../data/index.js';

export const BASE_BUDGET = 6;
const PRICE_KINDS = new Set(['selfHurt', 'jam', 'junk', 'selfStatus', 'drawdown', 'goldCost', 'maxHp']);
export const MAX_GRAFTS_NORMAL = 2; // the 3rd graft is an Overload
export const MAX_GRAFTS = 3;
export const OVERLOAD_MULT = 1.5;
export const OVERLOAD_SHATTER = 0.25;
export const TITHE_MULT = 0.75;

// ops can hold functions (custom, cond.fn), so clone ops by hand-preserving functions
export function cloneFx(fx) {
  return fx.map((o) => {
    const c = {};
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'function') c[k] = v;
      else if (Array.isArray(v)) c[k] = (v.length && typeof v[0] === 'object' && v[0]) ? cloneFx(v) : v.slice();
      else if (v && typeof v === 'object') c[k] = JSON.parse(JSON.stringify(v));
      else c[k] = v;
    }
    return c;
  });
}

export function newInst(id, uidGen) {
  return { uid: uidGen(), id, grafts: [], up: 0 };
}

function emptyPrice() {
  return { selfHurt: 0, jam: 0, junk: [], selfStatus: [], drawdown: 0, gold: 0, maxHp: 0, shuffleIn: [] };
}

// Fold one graft mod into a spec.
function applyMod(s, m, g) {
  switch (m.k) {
    case 'cost': if (s.cost !== 'X') s.cost = Math.max(0, s.cost + m.d); break;
    case 'flag': s.flags[m.f] = true; break;
    case 'unflag': delete s.flags[m.f]; break;
    case 'repeat': s.repeat += m.n; break;
    case 'addFx': { const add = cloneFx(m.fx); if (m.pos === 'start') s.fx.unshift(...add); else s.fx.push(...add); break; }
    case 'pct': s.pct += m.pct; break;
    case 'aoe': s.fx.forEach((o) => { if (o.op === 'dmg' && (!o.to || o.to === 'enemy')) o.to = 'all'; }); if (s.target === 'enemy') s.target = 'all'; break;
    case 'lifesteal': s.lifesteal = Math.max(s.lifesteal, m.cap || 6); break;
    case 'target': s.target = m.t; break;
    case 'type': s.type = m.t; break;
    case 'selfHurt': s.price.selfHurt += m.n; break;
    case 'jam': s.price.jam = 1 - (1 - s.price.jam) * (1 - m.p); break;
    case 'junk': s.price.junk.push({ card: m.card, n: m.n || 1, to: m.to || 'discard', when: m.when || 'combatStart' }); break;
    case 'selfStatus': s.price.selfStatus.push({ s: m.s, n: m.n }); break;
    case 'drawdown': s.price.drawdown += m.n; break;
    case 'goldCost': s.price.gold += m.n; break;
    case 'maxHp': s.price.maxHp += m.n; break;
    case 'custom': s.custom.push({ ...m.hooks, graft: g.id }); break;
    default: throw new Error('unknown graft mod ' + m.k + ' in ' + g.id);
  }
}

export function cardSpec(inst) {
  const base = CARDS[inst.id];
  if (!base) throw new Error('unknown card ' + inst.id);
  const s = {
    uid: inst.uid, id: base.id, name: base.name, hero: base.hero, rarity: base.rarity || 'common', type: base.type,
    cost: base.cost, target: base.target || 'enemy', flags: { ...(base.flags || {}) }, fx: cloneFx(base.fx || []),
    repeat: 0, pct: 0, lifesteal: 0, price: emptyPrice(), custom: [], grafts: inst.grafts.slice(),
    up: !!inst.up, school: base.school || null, art: base.art || base.id, flavor: base.flavor || '', text: base.text || null,
    overload: inst.grafts.length > MAX_GRAFTS_NORMAL,
  };
  if (inst.up && base.up) {
    const u = base.up;
    if (u.fx) s.fx = cloneFx(u.fx);
    if (u.cost !== undefined) s.cost = u.cost;
    if (u.flags) Object.assign(s.flags, u.flags);
    if (u.unflags) for (const f of u.unflags) delete s.flags[f];
    if (u.text !== undefined) s.text = u.text;
    s.name = base.name + '+';
  }
  for (const gid of inst.grafts) {
    const g = GRAFTS[gid];
    if (!g) throw new Error('unknown graft ' + gid);
    const waived = inst.waived && inst.waived.includes(gid);
    for (const m of g.mods || []) { if (waived && PRICE_KINDS.has(m.k)) continue; applyMod(s, m, g); }
  }
  if (s.flags.unplayable) s.unplayable = true;
  return s;
}

export function graftWeight(gid) { return (GRAFTS[gid] && GRAFTS[gid].weight) || 1; }

// Weight a card contributes to the deck. The 3rd graft (Overload) weighs +1 extra.
export function instWeight(inst) {
  let w = 0;
  inst.grafts.forEach((gid, i) => { w += graftWeight(gid) + (i >= MAX_GRAFTS_NORMAL ? 1 : 0); });
  return w;
}

export function relicMod(run, key) {
  let v = 0;
  for (const rid of run.relics || []) { const r = RELICS[rid]; if (r && r.mod && r.mod[key]) v += r.mod[key]; }
  return v;
}

export function budgetOf(run) { return BASE_BUDGET + (run.budgetBonus | 0) + relicMod(run, 'budget'); }

const BARE_TYPES = new Set(['attack', 'skill', 'power']);
export function isBare(inst) { return inst.grafts.length === 0 && BARE_TYPES.has(CARDS[inst.id].type); }

// Strain = weight over Budget. Each Strain point lands one Tithe on a Bare card: the cheapest first, oldest first.
// Overflow (Strain with no Bare card left to take it) becomes Backfire: grafted cards jam in hand.
export function strainInfo(run, deck = run.deck, extraBudget = 0) {
  let weight = 0;
  for (const inst of deck) weight += instWeight(inst);
  const budget = budgetOf(run) + extraBudget;
  const strain = Math.max(0, weight - budget);
  const bare = deck.filter(isBare).sort((a, b) => (CARDS[a.id].cost === 'X' ? 1 : CARDS[a.id].cost) - (CARDS[b.id].cost === 'X' ? 1 : CARDS[b.id].cost) || a.uid - b.uid);
  const tithed = bare.slice(0, strain).map((i) => i.uid);
  const overflow = Math.max(0, strain - bare.length);
  const backfire = Math.ceil(overflow / 2);
  return { weight, budget, strain, tithed, overflow, backfire, bareCount: bare.length };
}

// Preview the deck after adding a graft to a card, for the offer screen.
export function previewGraft(run, uid, gid) {
  const before = strainInfo(run);
  const deck = run.deck.map((i) => (i.uid === uid ? { ...i, grafts: [...i.grafts, gid] } : i));
  const after = strainInfo(run, deck);
  return { before, after, tithedNames: after.tithed.map((u) => CARDS[deck.find((i) => i.uid === u).id].name) };
}

// May this graft go on this card?
export function canGraft(inst, gid) {
  const g = GRAFTS[gid];
  if (!g) return false;
  if (inst.grafts.length >= MAX_GRAFTS) return false;
  if (inst.grafts.includes(gid)) return false;
  const base = CARDS[inst.id];
  if (base.type === 'junk' || base.type === 'curse') return false;
  if (g.not && g.not.some((x) => inst.grafts.includes(x))) return false;
  const spec = cardSpec(inst);
  if (g.types && !g.types.includes(spec.type)) return false;
  if (g.ok && !g.ok(spec, inst)) return false;
  return true;
}

export function hasDmg(spec) { return spec.fx.some((o) => o.op === 'dmg'); }
export function hasBlock(spec) { return spec.fx.some((o) => o.op === 'block'); }

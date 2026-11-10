// Card specs, graft application, Budget / Strain / Tithe. Pure: no DOM, no combat state.
//
// A deck card is an INSTANCE: { uid, id, grafts: [graftId...], up: 0|1 }.
// cardSpec(inst) folds the base card, its upgrade and every graft into one SPEC the combat engine plays.
import { CARDS, GRAFTS, RELICS, HEROES } from '../data/index.js';

export const BASE_BUDGET = 6;
// What a Price is: ONE table for every reader. Free Sample waives exactly these mods (cardSpec, run.js applyGraft), Numb keeps
// exactly these (afflictions.js). A price written inside a hook is its own custom mod marked price: true.
const PRICE_FLAGS = new Set(['exhaust', 'ethereal', 'needsAttackPlayed']);
const PRICE_MODS = {
  selfHurt: () => true, jam: () => true, junk: () => true, selfStatus: () => true, drawdown: () => true, goldCost: () => true,
  maxHp: (m) => m.n < 0, cost: (m) => m.d > 0, pct: (m) => m.pct < 0, flag: (m) => PRICE_FLAGS.has(m.f), custom: (m) => !!m.price,
};
export const isPriceMod = (m) => { const f = PRICE_MODS[m.k]; return !!f && f(m); };
export const MAX_GRAFTS_NORMAL = 2; // the 3rd graft is an Overload
export const MAX_GRAFTS = 3;
export const FUSE_CAP = 4; // tempered (permanent) grafts one card can hold
export const OVERLOAD_MULT = 1.5;
export const OVERLOAD_SHATTER = 0.25;
export const TITHE_MULT = 0.75;
const LIFESTEAL_CAP = 6; // most HP one play of a lifesteal card heals

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
  return { selfHurt: 0, jam: 0, junk: [], selfStatus: [], drawdown: 0, gold: 0, maxHp: 0 };
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
    case 'lifesteal': s.lifesteal = Math.max(s.lifesteal, m.cap || LIFESTEAL_CAP); break;
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

// Free Sample's waiver (inst.waived) belongs to one sewing of one graft: it travels with the graft when Reforge or an event lifts it
// onto another card and ends when the graft is stripped. sewGraft / unsewGraft are the only ways a live graft joins or leaves a card.
// A graft Numb has muted (afflictions.js mutedId) is looked up under the id it was muted from.
const isWaived = (inst, g) => !!inst.waived && inst.waived.includes(g.of || g.id);
export function sewGraft(inst, gid, waived = false) {
  inst.grafts.push(gid);
  if (waived) (inst.waived = inst.waived || []).push(gid);
}
// Takes the graft off the card (the last one when no id is given). Returns { waived } or null when the card does not carry it.
export function unsewGraft(inst, gid = inst.grafts[inst.grafts.length - 1]) {
  const i = inst.grafts.indexOf(gid);
  if (i < 0) return null;
  inst.grafts.splice(i, 1);
  const w = inst.waived ? inst.waived.indexOf(gid) : -1;
  if (w >= 0) inst.waived.splice(w, 1);
  return { waived: w >= 0 };
}

// The deck as the Forge and the shop preview it after a Strip or a Reforge; the real cards stay as they are.
const copyOf = (i) => ({ ...i, grafts: i.grafts.slice(), waived: (i.waived || []).slice() });
export function deckStripped(deck, uid, gid) {
  return deck.map((i) => { if (i.uid !== uid) return i; const c = copyOf(i); unsewGraft(c, gid); return c; });
}
export function deckMoved(deck, fromUid, gid, toUid) {
  const lifted = copyOf(deck.find((i) => i.uid === fromUid)), waived = unsewGraft(lifted, gid);
  return deck.map((i) => {
    if (i.uid === fromUid) return lifted;
    if (i.uid !== toUid) return i;
    const c = copyOf(i); sewGraft(c, gid, !!(waived && waived.waived)); return c;
  });
}

export function cardSpec(inst) {
  const base = CARDS[inst.id];
  if (!base) throw new Error('unknown card ' + inst.id);
  const s = {
    uid: inst.uid, id: base.id, name: base.name, hero: base.hero, rarity: base.rarity || 'common', type: base.type,
    cost: base.cost, target: base.target || 'enemy', flags: { ...(base.flags || {}) }, fx: cloneFx(base.fx || []),
    repeat: 0, pct: 0, lifesteal: 0, price: emptyPrice(), custom: [], grafts: inst.grafts.slice(), fused: (inst.fused || []).slice(),
    waived: [], // grafts of this card whose Price was left out below (Free Sample): engine/text.js priceOnCard prints them as waived
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
  // Tempered (fused) grafts apply first and for good; the live patches follow.
  for (const gid of [...(inst.fused || []), ...inst.grafts]) {
    const g = GRAFTS[gid];
    if (!g) throw new Error('unknown graft ' + gid);
    const waived = isWaived(inst, g);
    if (waived) s.waived.push(gid);
    for (const m of g.mods || []) { if (waived && isPriceMod(m)) continue; applyMod(s, m, g); }
  }
  if (s.flags.unplayable) s.unplayable = true;
  return s;
}

// Hammering settles a graft: it weighs 1 less (never under 1) once it is tempered.
export function fusedWeight(gid) { return Math.max(1, graftWeight(gid) - 1); }
export function graftWeight(gid) { return (GRAFTS[gid] && GRAFTS[gid].weight) || 1; }

// Weight a card contributes to the deck. The 3rd graft (Overload) weighs +1 extra.
export function instWeight(inst) {
  let w = 0;
  inst.grafts.forEach((gid, i) => { w += graftWeight(gid) + (i >= MAX_GRAFTS_NORMAL ? 1 : 0); });
  for (const gid of inst.fused || []) w += fusedWeight(gid);
  return w;
}

export function relicMod(run, key) {
  let v = 0;
  for (const rid of run.relics || []) { const r = RELICS[rid]; if (r && r.mod && r.mod[key]) v += r.mod[key]; }
  return v;
}

export function budgetOf(run) { return BASE_BUDGET + (run.budgetBonus | 0) + relicMod(run, 'budget'); }

const BARE_TYPES = new Set(['attack', 'skill', 'power']);
export function isBare(inst) { return inst.grafts.length === 0 && !(inst.fused && inst.fused.length) && BARE_TYPES.has(CARDS[inst.id].type); }

// Strain = weight over Budget. Each Strain point lands one Tithe on a Bare card: the cheapest first, oldest first.
// Overflow (Strain with no Bare card left to take it) becomes Backfire: grafted cards jam in hand.
export function strainInfo(run, deck = run.deck, extraBudget = 0, extraStrain = 0) {
  let weight = 0;
  for (const inst of deck) weight += instWeight(inst);
  const budget = budgetOf(run) + extraBudget;
  const strain = Math.max(0, weight + extraStrain - budget);
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
  if (inst.grafts.includes(gid) || (inst.fused || []).includes(gid)) return false;
  const base = CARDS[inst.id];
  if (base.type === 'junk') return false;
  if (g.not && g.not.some((x) => inst.grafts.includes(x) || (inst.fused || []).includes(x))) return false;
  const spec = cardSpec(inst);
  if (g.types && !g.types.includes(spec.type)) return false;
  if (g.ok && !g.ok(spec, inst)) return false;
  return true;
}

// Why a graft cannot go on a card: a short human reason, or null when it can (always agrees with canGraft).
// Rules: full card, duplicate, junk, `not` clashes, `types`, then `ok(spec)`. A graft may carry its own `why` string for its ok rule;
// otherwise the reason is DERIVED by probing ok() with small edits of the spec (cost, flags, target, damage/Block, resource ops, hero).
const TYPE_WORD = { attack: 'Attacks', skill: 'Skills', power: 'Powers' };
const FLAG_WHY = { exhaust: 'Already Exhausts', ethereal: 'Already Ethereal', retain: 'Already Retains', innate: 'Already Innate' };
const okPasses = (g, spec, inst) => { try { return !!g.ok(spec, inst); } catch (e) { return false; } };
const withSpec = (spec, patch) => ({ ...spec, ...patch });
function probeWhy(g, spec, inst) {
  if (typeof g.why === 'string' && g.why) return g.why;
  // each probe: (spec) => [reason, editedSpec] or null when it does not apply to that spec
  const fxAdd = (sp, o) => withSpec(sp, { fx: [...(sp.fx || []), o] });
  const probes = [];
  for (const f of Object.keys(FLAG_WHY)) probes.push((sp) => (sp.flags && sp.flags[f] ? [FLAG_WHY[f], withSpec(sp, { flags: { ...sp.flags, [f]: false } })] : null));
  probes.push((sp) => {
    if (typeof sp.cost !== 'number') return okPasses(g, withSpec(sp, { cost: 1 }), inst) ? ['Not on X cost cards', withSpec(sp, { cost: 1 })] : null;
    const pass = [0, 1, 2, 3].filter((c) => okPasses(g, withSpec(sp, { cost: c }), inst));
    if (!pass.length) return null;
    if (pass.every((c) => c < sp.cost)) { const mx = Math.max(...pass); return [`Needs cost ${mx} or less`, withSpec(sp, { cost: mx })]; }
    if (pass.every((c) => c > sp.cost)) { const mn = Math.min(...pass); return [`Needs cost ${mn} or more`, withSpec(sp, { cost: mn })]; }
    return null;
  });
  probes.push((sp) => {
    const quiet = (sp.fx || []).filter((o) => o.op !== 'draw' && o.op !== 'energy' && o.op !== 'gold');
    return quiet.length !== (sp.fx || []).length ? ['Not on cards that draw or gain energy', withSpec(sp, { fx: quiet })] : null;
  });
  probes.push((sp) => {
    const d = fxAdd(sp, { op: 'dmg', n: 5 }), bl = fxAdd(sp, { op: 'block', n: 5 });
    const pd = okPasses(g, d, inst), pb = okPasses(g, bl, inst);
    if (pd && pb) return ['Needs a card that deals damage or gives Block', d];
    if (pd) return ['Needs a card that deals damage', d];
    if (pb) return ['Needs a card that gives Block', bl];
    const hit = withSpec(d, { target: 'enemy' });
    if (okPasses(g, hit, inst)) return ['Needs a card that hits an enemy', hit];
    return null;
  });
  probes.push((sp) => (sp.target !== 'enemy' && sp.target !== 'all' ? ['Needs a card that targets an enemy', withSpec(sp, { target: 'enemy' })] : null));
  for (const h of Object.keys(HEROES)) probes.push((sp) => (h !== sp.hero ? [`${HEROES[h].name || h} cards only`, withSpec(sp, { hero: h })] : null));
  // one edit fixes it: that is the reason
  for (const pr of probes) { const r = pr(spec); if (r && okPasses(g, r[1], inst)) return r[0]; }
  // several edits: stack them until it passes, name at most two
  let cur = spec; const said = [];
  for (const pr of probes) {
    const r = pr(cur); if (!r) continue;
    cur = r[1]; said.push(r[0]);
    if (okPasses(g, cur, inst)) return said.slice(0, 2).map((t, i) => (i ? t[0].toLowerCase() + t.slice(1) : t)).join(', ');
  }
  return 'Does not fit this card';
}
export function cantGraftWhy(inst, gid) {
  const g = GRAFTS[gid];
  if (!g) return 'Unknown graft';
  if (inst.grafts.length >= MAX_GRAFTS) return 'Card is full';
  if (inst.grafts.includes(gid) || (inst.fused || []).includes(gid)) return `Already has ${g.name}`;
  const base = CARDS[inst.id];
  if (base.type === 'junk') return 'Junk cannot be grafted';
  if (g.not) {
    const clash = g.not.find((x) => inst.grafts.includes(x) || (inst.fused || []).includes(x));
    if (clash) { const cg = GRAFTS[clash]; return cg ? `Clashes with ${cg.name}${cg.school ? ' (' + cg.school + ')' : ''}` : 'Clashes with another graft'; }
  }
  const spec = cardSpec(inst);
  if (g.types && !g.types.includes(spec.type)) {
    const w = g.types.map((t) => TYPE_WORD[t] || t);
    return `${w.length > 1 ? w.slice(0, -1).join(', ') + ' and ' + w[w.length - 1] : w[0]} only`;
  }
  if (g.ok && !g.ok(spec, inst)) return probeWhy(g, spec, inst);
  return null;
}


// ---- Temper: hammer a card's live patches into the card for good ----
// The boons AND prices stay (a fused graft still shapes the card). The patch slots empty out, so new grafts fit again,
// the card is no longer an Overload (no x1.5, no Shatter roll), and each fused graft weighs 1 less.
export function canTemper(inst) {
  const t = CARDS[inst.id] && CARDS[inst.id].type;
  return !!t && t !== 'junk' && inst.grafts.length > 0 && (inst.fused || []).length + inst.grafts.length <= FUSE_CAP;
}
export function temper(inst) {
  if (!canTemper(inst)) return false;
  inst.fused = [...(inst.fused || []), ...inst.grafts];
  inst.grafts = [];
  return true;
}

// The Thread (design/THREAD.md): the school set of a card = base school + every live AND fused graft school. Junk has none.
export function schoolsOf(spec) {
  const out = [];
  if (!spec || spec.type === 'junk') return out;
  if (spec.school) out.push(spec.school);
  for (const gid of [...(spec.grafts || []), ...(spec.fused || [])]) { const s = GRAFTS[gid] && GRAFTS[gid].school; if (s && !out.includes(s)) out.push(s); }
  return out;
}

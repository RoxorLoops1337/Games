// Player afflictions (design/ENEMY_DEPTH.md): Rejection, Infection, Numb, Unpicked, Cadence Lock, Leaden and friends.
// Hooks are called from engine/combat.js. Poison, Brittle, Dread, Stagefright, Weight of Debt are plain status hooks in
// data/statuses_aff.js. Rejection (prices trigger twice) and Infection (Strain +N) are implemented in combat.js itself.
//
// Caps and the global guard are enforced WITHOUT touching addStatus: at combat start the statuses object of the player
// (and of each enemy, for the guard statuses) is wrapped in a Proxy whose set trap clamps to each status's `cap`, rejects a
// 3rd distinct new debuff inside one enemy move and a 4th distinct affliction type overall (that one refreshes the durations
// of the afflictions already active instead), and whose delete trap keeps Infection through card/relic cleanses.
import { STATUSES, GRAFTS } from '../data/index.js';
import { instWeight } from './cards.js';
import { refreshStrain, specOf } from './combat.js';

const AFF = new Set(['poison', 'brittle', 'rejection', 'infection', 'numb', 'unpicked', 'cadencelock', 'stagefright', 'dread', 'leaden']);
const ENEMY_CAP = new Set(['weightofdebt', 'stitchedup']);
const MAX_TYPES = 3, MAX_PER_MOVE = 2;
const TYPES = ['attack', 'skill', 'power'];

export function affl(c) {
  if (!c.affl) c.affl = {};
  const a = c.affl;
  if (!a.views) { a.views = new Map(); a.poisonSrc = {}; a.stage = 0; a.inMove = false; a.moveTypes = new Set(); a.last = ''; }
  return a;
}

function ensure(c) {
  const a = affl(c);
  if (!c.player.st.__affl) {
    const raw = c.player.st;
    c.player.st = guard(c, raw, true);
  }
  if (c.ev.push.__affl !== a) {
    const orig = c.ev.push;
    const f = function (...xs) {
      for (const e of xs) {
        if (e.t === 'enemyAct') { a.inMove = true; a.moveTypes.clear(); a.last = 'enemy'; }
        else if (e.t === 'turnStart' || e.t === 'turnEnd') { a.inMove = false; a.last = e.t; }
        else if (e.t === 'play' || e.t === 'potion') { a.inMove = false; a.last = e.t; }
      }
      return orig.apply(this, xs);
    };
    f.__affl = a;
    c.ev.push = f;
  }
  for (const e of c.enemies) if (!e.st.__affl) e.st = guard(c, e.st, false);
  return a;
}

function guard(c, target, isPlayer) {
  const a = affl(c);
  return new Proxy(target, {
    get(t, k) { return k === '__affl' ? true : t[k]; },
    has(t, k) { return k !== '__affl' && k in t; },
    set(t, k, v) {
      const def = typeof k === 'string' ? STATUSES[k] : null;
      const watched = isPlayer ? AFF.has(k) : ENEMY_CAP.has(k);
      if (!def || !watched) { t[k] = v; return true; }
      const prev = t[k] || 0;
      const cap = def.cap || 99;
      if (v > prev && isPlayer) {
        const active = [...AFF].filter((x) => x !== k && t[x] > 0);
        if (prev === 0 && active.length >= MAX_TYPES) {
          // an extra type refreshes what is already there instead of stacking
          for (const x of active) if (STATUSES[x].stack === 'dur') t[x] = Math.max(t[x], Math.min(STATUSES[x].cap || 99, v));
          c.ev.push({ t: 'afflGuard', s: k, why: 'types' });
          return true;
        }
        if (a.inMove) {
          if (!a.moveTypes.has(k) && a.moveTypes.size >= MAX_PER_MOVE) { c.ev.push({ t: 'afflGuard', s: k, why: 'move' }); return true; }
          a.moveTypes.add(k);
        }
      }
      t[k] = Math.min(v, cap);
      return true;
    },
    deleteProperty(t, k) {
      // Infection survives every in-combat cleanse except a potion
      if (isPlayer && k === 'infection' && t[k] > 0 && a.last !== 'potion') return true;
      const had = k === 'infection' && t[k] > 0;
      delete t[k];
      if (had && c.strain) refreshStrain(c);
      return true;
    },
  });
}

// ---------- the inst view (Numb / Unpicked) ----------
const priceMod = (m) => m.k === 'selfHurt' || m.k === 'jam' || m.k === 'junk' || m.k === 'selfStatus' || m.k === 'drawdown' || m.k === 'goldCost' || m.k === 'maxHp'
  || (m.k === 'cost' && m.d > 0) || (m.k === 'flag' && (m.f === 'exhaust' || m.f === 'ethereal')) || (m.k === 'pct' && m.pct < 0);
// a graft with its boons removed: only the price mods stay (custom hooks are boons too, they go)
function mutedId(gid) {
  const id = '~numb:' + gid;
  if (!GRAFTS[id] && GRAFTS[gid]) {
    const g = GRAFTS[gid];
    Object.defineProperty(GRAFTS, id, { value: { ...g, id, mods: (g.mods || []).filter(priceMod) }, enumerable: false, configurable: true });
  }
  return id;
}

export function afflInst(c, card) {
  const a = c.affl;
  if (!a || !a.views.size) return card.inst;
  const m = a.views.get(card.uid);
  if (!m || m.inst !== card.inst) return card.inst;
  const useN = m.numb && c.player.st.numb > 0, useU = m.drop >= 0 && c.player.st.unpicked > 0;
  if (!useN && !useU) return card.inst;
  const key = (useN ? 'n' : '') + (useU ? 'u' : '');
  if (m.view && m.key === key) return m.view;
  let g = card.inst.grafts.slice();
  if (useU) g.splice(m.drop, 1);
  if (useN) g = g.map(mutedId);
  const view = Object.create(card.inst);
  view.grafts = g;
  m.view = view; m.key = key;
  return view;
}

// Leaden: the highest-cost card in hand (X excluded, ties go to the leftmost) costs +1.
export function afflCost(c, card, k) {
  if (!(c.player.st.leaden > 0) || !c.hand.includes(card)) return k;
  let best = null, bk = -1;
  for (const h of c.hand) {
    const base = baseCost(c, h);
    if (base !== null && base > bk) { bk = base; best = h; }
  }
  return best === card ? k + 1 : k;
}
function baseCost(c, h) {
  const spec = specCost(c, h);
  if (spec === 'X') return null;
  let k = spec + h.costMod + (h.jam ? 1 : 0) + (c.player.st.costup || 0);
  if (h.costSet !== undefined) k = h.costSet;
  return Math.max(0, k);
}
function specCost(c, h) { return specOf(c, h).cost; }

// ---------- turn hooks ----------
const movePicks = (mv, s) => {
  const walk = (ops) => (ops || []).some((o) => o && ((o.op === 'status' && o.s === s) || (o.op === 'if' && (walk(o.then) || walk(o.else))) || (o.op === 'repeat' && walk([].concat(o.fx || [])))));
  return !!mv && walk(mv.fx);
};
const stolenInsts = (c) => { const s = new Set(); for (const e of c.enemies) for (const x of (e.data && e.data.stolen) || []) s.add(x.inst); return s; };

// After the new hand is drawn: decide this turn's Numb / Unpicked marks, reset Stagefright's bank.
export function afflStartTurn(c) {
  const a = ensure(c);
  a.stage = 0; a.views.clear();
  const st = c.player.st;
  if (st.numb > 0) {
    let best = null, bw = -1;
    for (const k of c.hand) { if (k.inst.grafts.length) { const w = instWeight(k.inst); if (w > bw) { bw = w; best = k; } } }
    if (best) a.views.set(best.uid, { inst: best.inst, numb: true, drop: -1 });
  }
  if (st.unpicked > 0) {
    const stolen = stolenInsts(c);
    const pool = c.hand.filter((k) => k.inst.grafts.length && !stolen.has(k.inst));
    if (pool.length) {
      const k = pool[c.rng.int(pool.length)];
      const drop = c.rng.int(k.inst.grafts.length);
      const m = a.views.get(k.uid);
      if (m) m.drop = drop; else a.views.set(k.uid, { inst: k.inst, numb: false, drop });
    }
  }
  for (const e of c.enemies) if (e.st.stitchedup > 0) e.data.suMax = Math.max(e.data.suMax || 0, e.st.stitchedup);
}

// Before the hand is discarded at end of turn. Marks expire with their status (afflInst checks it), so only bookkeeping here.
export function afflEndTurn(c) {
  const a = ensure(c);
  const played = c.cardsThisTurn || [];
  const types = new Set(played.map((p) => p.type));
  const skipped = TYPES.filter((t) => !types.has(t)).length;
  for (const e of c.enemies) {
    if (e.dead) continue;
    if (e.st.weightofdebt > 0 && skipped > 0) c.A.status(e, 'weightofdebt', skipped);
    if (e.st.stitchedup !== undefined || e.data.suMax) {
      e.data.suMax = Math.max(e.data.suMax || 0, e.st.stitchedup || 0);
      if (played.length < 3 && e.data.suMax) c.A.setStatus(e, 'stitchedup', e.data.suMax);
    }
    if (e.move && movePicks(e.def.moves[e.move], 'poison')) a.poisonSrc[e.uid] = true;
  }
}

// Stitched Up: called by dealDamage after Block. Returns the damage that gets through.
export function afflAbsorb(c, e, n) {
  const pool = e.st.stitchedup || 0;
  if (pool <= 0 || n <= 0) return n;
  e.data.suMax = Math.max(e.data.suMax || 0, pool);
  const used = Math.min(pool, n);
  if (pool - used > 0) e.st.stitchedup = pool - used; else delete e.st.stitchedup;
  c.ev.push({ t: 'absorb', who: e.uid, n: used });
  c.ev.push({ t: 'status', who: e.uid, s: 'stitchedup', n: e.st.stitchedup || 0 });
  return n - used;
}

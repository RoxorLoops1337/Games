// THE THREAD (design/THREAD.md). Chain cards that share a school, cut the Line to cash it in.
// c.seam = { set, counts, order, len, cuts, tied, last, used, lockBroke, paidTurn:{draw,charge}, gold, retain }
// Plumbing in combat.js: seamInit (newCombat), seamStep (playCard, before the card's fx), seamEnd (endTurn), seamTurnStart.
// Payouts go through the combat API (c.A.*) so statuses and relics react. Hard caps: 3 paying cuts per turn, 3 draws per
// turn, 4 charge per turn, 20 gold per combat, len cap 5 (Spool: mod.seamCap).
// Hooks: relics/hero via fire(c,'seamExtend'|'seamCut'|'seamPay',info); enemies via def.on.seamExtend/seamCut/seamPay(A,e,info).
// An enemy or relic may set info.cancel = true on a seamCut hook to void that payout (Scissor Nurse).
import { schoolsOf } from './cards.js';
import { fire, specOf } from './combat.js';
import { RELICS } from '../data/index.js';

export const SEAM_LEN_CAP = 5, SEAM_CUTS_TURN = 3, SEAM_DRAW_TURN = 3, SEAM_CHARGE_TURN = 4, SEAM_GOLD_COMBAT = 20;
const SCHOOL_NAME = { ember: 'Ember', echo: 'Echo', hoard: 'Hoard', blood: 'Blood', rust: 'Rust', static: 'Static', gilded: 'Gilded' };

export function seamInit(c) {
  return { set: [], counts: {}, order: [], len: 0, cuts: 0, tied: false, last: null, used: {}, lockBroke: false, paidTurn: { draw: 0, charge: 0 }, gold: 0, retain: 0 };
}

const tier = (c, s) => (c.res && c.res[s]) || 0;
export function seamCap(c) {
  let cap = SEAM_LEN_CAP;
  for (const rid of c.run.relics || []) { const r = RELICS[rid]; if (r && r.mod && r.mod.seamCap) cap = Math.max(cap, r.mod.seamCap); }
  return cap;
}
const knotsOf = (spec) => (spec.overload ? 2 : 1);
const overlap = (a, b) => { for (const s of a) if (b.includes(s)) return s; return null; };

// What a card would do to the Line (pure).
function plan(c, card, spec) {
  const s = c.seam;
  if (card.jam) return { kind: 'slack', fray: true, set: [] };
  const set = schoolsOf(spec);
  if (!set.length) return { kind: 'slack', set };
  if (spec.fused && spec.fused.length) return { kind: 'tied', set };
  if (s.len > 0 && c.player.st.cadencelock > 0 && !s.lockBroke && set.some((x) => s.used[x])) return { kind: 'break', set };
  if (s.len === 0) return { kind: 'start', set };
  const shared = overlap(set, s.set);
  if (shared) return { kind: 'extend', set, shared };
  return { kind: 'cut', set };
}

// Pending payout for a Line. mode 'cut' pays S, 'end' pays S-1. counts/order/lastSet describe the Line.
function payoutFor(c, counts, order, lastSet, len, mode, times) {
  let S = Math.min(len, seamCap(c)) - 1;
  if (mode === 'end') S -= 1;
  if (S <= 0) return [];
  const sch = order.filter((x) => counts[x] > 0);
  if (!sch.length) return [];
  const rank = (x) => counts[x] * 10 + (lastSet.includes(x) ? 1 : 0);
  let top = sch[0];
  for (const x of sch) if (rank(x) > rank(top)) top = x;
  const out = [{ school: top, stitches: (S + (tier(c, top) >= 3 ? 1 : 0)) * times }];
  const rest = sch.filter((x) => x !== top && counts[x] >= 2);
  if (rest.length && Math.floor(S / 2) > 0) {
    let sec = rest[0];
    for (const x of rest) if (counts[x] > counts[sec]) sec = x;
    out.push({ school: sec, stitches: (Math.floor(S / 2) + (tier(c, sec) >= 3 ? 1 : 0)) * times });
  }
  return out;
}
function timesFor(c, topSchool, firstCut) {
  let t = 1;
  if (topSchool && tier(c, topSchool) >= 6) t++;
  if (firstCut && (c.seam.tapestry || c.player.st.tapestry > 0)) t++;
  return t;
}
function payText(school, n) {
  const nm = SCHOOL_NAME[school] || school;
  switch (school) {
    case 'ember': return `${n} stitch${n > 1 ? 'es' : ''} ${nm}: ${2 * n} Burn to all`;
    case 'echo': return `${n} stitch${n > 1 ? 'es' : ''} ${nm}: ${Math.ceil(n / 2)} Echo`;
    case 'hoard': return `${n} stitch${n > 1 ? 'es' : ''} ${nm}: draw ${Math.floor(n / 2)}, retain 1`;
    case 'blood': return `${n} stitch${n > 1 ? 'es' : ''} ${nm}: heal ${2 * n}`;
    case 'rust': return `${n} stitch${n > 1 ? 'es' : ''} ${nm}: ${3 * n} Block, pierce per junk`;
    case 'static': return `${n} stitch${n > 1 ? 'es' : ''} ${nm}: ${n} Charge`;
    case 'gilded': return `${n} stitch${n > 1 ? 'es' : ''} ${nm}: ${2 * n} gold`;
    default: return `${n} stitches ${nm}`;
  }
}

// Pure read for the UI: what playing `card` now would do. payout = what the Line is worth if it is cashed by this card
// (kind 'cut'), or if it were cut right after this card (kind 'extend', the rail projection).
export function seamPreview(c, card) {
  const s = c.seam, spec = specOf(c, card), p = plan(c, card, spec);
  const none = (kind, school, len) => ({ kind, school, len, payout: [] });
  if (p.kind === 'slack' || p.kind === 'tied') return none(p.kind, p.set[0] || null, s.len);
  const cap = seamCap(c), k = knotsOf(spec);
  const cutNow = (setLen) => {
    if (s.cuts >= SEAM_CUTS_TURN || s.len < 2) return [];
    const top0 = payoutFor(c, s.counts, s.order, s.set, s.len, 'cut', 1);
    const times = timesFor(c, top0[0] && top0[0].school, s.cuts === 0);
    return payoutFor(c, s.counts, s.order, s.set, s.len, 'cut', times);
  };
  const fmt = (arr) => arr.map((x) => ({ school: x.school, stitches: x.stitches, text: payText(x.school, x.stitches) }));
  if (p.kind === 'cut' || p.kind === 'break') {
    const pay = p.kind === 'break' ? [] : fmt(cutNow());
    return { kind: 'cut', school: p.set[0], len: k, payout: pay };
  }
  if (p.kind === 'start') return { kind: 'extend', school: p.set[0], len: Math.min(k, cap), payout: [] };
  // extend: project the Line after this card
  const counts = { ...s.counts }, order = s.order.slice();
  for (const x of p.set) { counts[x] = (counts[x] || 0) + k; if (!order.includes(x)) order.push(x); }
  const len = Math.min(cap, s.len + k);
  let pay = [];
  if (s.cuts < SEAM_CUTS_TURN) {
    const t0 = payoutFor(c, counts, order, p.set, len, 'cut', 1);
    pay = payoutFor(c, counts, order, p.set, len, 'cut', timesFor(c, t0[0] && t0[0].school, s.cuts === 0));
  }
  return { kind: 'extend', school: p.shared, len, payout: fmt(pay) };
}

function enemyHook(c, name, info) {
  for (const e of c.enemies.slice()) {
    if (e.dead) continue;
    const h = e.def && e.def.on && e.def.on[name];
    if (h) h(c.A, e, info);
  }
}

function startLine(c, set, k, spec) {
  const s = c.seam, cap = seamCap(c);
  s.counts = {}; s.order = [];
  for (const x of set) { s.counts[x] = k; s.order.push(x); }
  s.set = set.slice(); s.len = Math.min(k, cap);
}

function pay(c, entry, kind) {
  const s = c.seam, A = c.A, n = entry.stitches, school = entry.school;
  let amount = 0;
  switch (school) {
    case 'ember': { const b = 2 * n; for (const e of A.alive()) A.status(e, 'burn', b); amount = b; break; }
    case 'echo': { amount = Math.ceil(n / 2); A.status(c.player, 'echo', amount); break; }
    case 'hoard': {
      const want = Math.min(Math.floor(n / 2), SEAM_DRAW_TURN - s.paidTurn.draw);
      if (want > 0) { s.paidTurn.draw += want; amount = A.draw(want) || 0; }
      if (s.retain < 3) s.retain++;
      break;
    }
    case 'blood': { amount = 2 * n; A.heal(c.player, amount); break; }
    case 'rust': {
      amount = 3 * n; A.block(c.player, amount);
      const junk = c.hand.filter((k) => k.inst && specOf(c, k).type === 'junk').length;
      for (let i = 0; i < n && junk > 0; i++) {
        const live = A.alive(); if (!live.length) break;
        A.dmg(c.player, c.rng.pick(live), 2 * junk, { noMods: true, pierce: true });
      }
      break;
    }
    case 'static': { amount = Math.min(n, SEAM_CHARGE_TURN - s.paidTurn.charge); if (amount > 0) { s.paidTurn.charge += amount; A.status(c.player, 'charge', amount); } else amount = 0; break; }
    case 'gilded': { amount = Math.min(2 * n, SEAM_GOLD_COMBAT - s.gold); if (amount > 0) { s.gold += amount; A.gold(amount); } else amount = 0; break; }
    default: break;
  }
  const info = { school, stitches: n, kind, amount };
  c.ev.push({ t: 'seamPay', ...info });
  fire(c, 'seamPay', info);
  enemyHook(c, 'seamPay', info);
}

// Cash the current Line. kind 'cut' or 'end'. Returns total stitches paid.
function cash(c, kind, card) {
  const s = c.seam;
  if (s.len < 1) return 0;
  const mode = kind === 'end' ? 'end' : 'cut';
  let list = [];
  const capped = kind === 'cut' && s.cuts >= SEAM_CUTS_TURN;
  const base = payoutFor(c, s.counts, s.order, s.set, s.len, mode, 1);
  if (base.length && !capped) {
    const firstCut = kind === 'cut' && s.cuts === 0;
    list = payoutFor(c, s.counts, s.order, s.set, s.len, mode, kind === 'cut' ? timesFor(c, base[0].school, firstCut) : 1);
  }
  const hadStitches = base.length > 0;
  const info = { len: s.len, school: list[0] ? list[0].school : base[0] ? base[0].school : null, stitches: list.reduce((a, x) => a + x.stitches, 0), kind, card: card ? card.uid : null, cancel: false, capped };
  if (hadStitches && kind === 'cut' && !capped) s.cuts++;
  if (hadStitches) { fire(c, 'seamCut', info); enemyHook(c, 'seamCut', info); }
  const paid = info.cancel ? 0 : list.reduce((a, x) => a + x.stitches, 0);
  c.ev.push({ t: 'seamCut', paid, school: info.school, len: s.len, card: card ? card.uid : null, kind });
  if (!info.cancel) for (const e of list) pay(c, e, kind);
  return paid;
}

export function seamStep(c, card, spec) {
  const s = c.seam, p = plan(c, card, spec);
  if (p.fray) { c.ev.push({ t: 'seamFray', card: card.uid }); }
  if (p.kind === 'slack' || p.kind === 'tied') { c.ev.push({ t: 'seamSlack', card: card.uid }); return; }
  const k = knotsOf(spec), cap = seamCap(c);
  if (p.kind === 'extend') {
    s.len = Math.min(cap, s.len + k);
    for (const x of p.set) { s.counts[x] = (s.counts[x] || 0) + k; if (!s.order.includes(x)) s.order.push(x); }
    s.set = p.set.slice();
    for (const x of p.set) s.used[x] = true;
    s.last = card.uid;
    const info = { len: s.len, school: p.shared, card: card.uid, spec };
    c.ev.push({ t: 'seamExtend', len: s.len, school: p.shared, card: card.uid });
    fire(c, 'seamExtend', info); enemyHook(c, 'seamExtend', info);
    return;
  }
  if (p.kind === 'break') {
    s.lockBroke = true; s.len = 0; s.counts = {}; s.order = []; s.set = [];
    c.ev.push({ t: 'seamCut', paid: 0, school: null, len: 0, card: card.uid, kind: 'break' });
  } else if (p.kind === 'cut') cash(c, 'cut', card);
  startLine(c, p.set, k, spec);
  for (const x of p.set) s.used[x] = true;
  s.last = card.uid;
  c.ev.push({ t: 'seamExtend', len: s.len, school: p.set[0], card: card.uid, start: true });
}

// Pick up to `retain` cards of the hand to keep (card.retain; combat.js must honour it, see report).
function markRetain(c) {
  let r = Math.min(c.seam.retain, 3);
  if (r <= 0) return;
  const pool = c.hand.filter((k) => !k.retain && specOf(c, k).type !== 'junk');
  pool.sort((a, b) => (b.plays - a.plays) || 0);
  for (const k of pool) { if (r-- <= 0) break; k.retain = true; }
  c.seam.retain = 0;
}

export function seamEnd(c) {
  const s = c.seam;
  if (s.len > 0 && !s.tied) cash(c, 'end', null);
  markRetain(c);
}

export function seamTurnStart(c) {
  const s = c.seam;
  for (const k of c.hand) k.retain = false;
  s.cuts = 0; s.used = {}; s.lockBroke = false; s.paidTurn = { draw: 0, charge: 0 }; s.retain = 0; s.last = null;
  if (s.tied) { s.tied = false; if (s.len > 0) return; }
  s.set = []; s.counts = {}; s.order = []; s.len = 0;
}

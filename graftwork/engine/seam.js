// THE THREAD (design/THREAD.md). Chain cards that share a school, cut the Line to cash it in.
// c.seam = { set, counts, order, len, cuts, tied, last, used, lockBroke, paidTurn:{draw,charge}, gold, retain, step, declare, declared }
// Plumbing in combat.js: seamInit (newCombat), seamStep (playCard, before the card's fx), seamEnd (endTurn), seamTurnStart,
// seamCutNow (A.cutLine: a card effect that says "Cut the Line.").
// Payouts go through the combat API (c.A.*) so statuses and relics react. Hard caps: 3 paying cuts per turn, 3 draws per
// turn, 6 charge per turn, 20 gold per combat, len cap 5 (Spool: mod.seamCap).
// Hooks: relics/hero via fire(c,'seamExtend'|'seamCut'|'seamPay',info); enemies via def.on.seamExtend/seamCut/seamCash/seamPay(A,e,info).
// A cut is a cut: seamCut (relics, hero, enemies) fires when the Line is cut, never for the turn-end cash. seamCash (enemies) fires for
// every cash, a cut or the turn end (info.kind), before anything is paid, and may set info.cancel = true to void the payout (Scissor
// Nurse, Ferric Warden). A cancelled payout paid nothing: the hooks that follow see stitches 0 and no pays.
// info.stitches is what was paid (every school, Resonance included), info.pays the same per school: a "per stitch" hook reads them,
// never the length of the Line. info.paid is false for a cut past the turn's paying cuts (it cuts the Line and pays nothing): a hook
// that rides on a paying cut tests it. The seamCut event carries capped: true for the same cut.
// A hero with `declare: <school>` (Odile, 'gilded') may declare one card a turn: canDeclare / setDeclare below.
import { schoolsOf } from './cards.js';
import { fire, specOf } from './combat.js';
import { RELICS, HEROES } from '../data/index.js';

export const SEAM_CUTS_TURN = 3;
const SEAM_LEN_CAP = 5, SEAM_DRAW_TURN = 3, SEAM_CHARGE_TURN = 6, SEAM_GOLD_COMBAT = 20;
const SCHOOL_NAME = { ember: 'Ember', echo: 'Echo', hoard: 'Hoard', blood: 'Blood', rust: 'Rust', static: 'Static', gilded: 'Gilded' };

export function seamInit(c) {
  return { set: [], counts: {}, order: [], len: 0, cuts: 0, tied: false, last: null, used: {}, lockBroke: false, paidTurn: { draw: 0, charge: 0 }, gold: 0, retain: 0, declare: null, declared: false };
}

const tier = (c, s) => (c.res && c.res[s]) || 0;
export function seamCap(c) {
  let cap = SEAM_LEN_CAP;
  for (const rid of c.run.relics || []) { const r = RELICS[rid]; if (r && r.mod && r.mod.seamCap) cap = Math.max(cap, r.mod.seamCap); }
  const dm = c.run.dailyMod; // Daily Case 'lineCap' (Fraying, Short Thread) wins over relics
  if (dm && dm.lineCap) cap = Math.min(cap, dm.lineCap);
  return cap;
}
const knotsOf = (spec) => (spec.overload ? 2 : 1);
const overlap = (a, b) => { for (const s of a) if (b.includes(s)) return s; return null; };
// A card whose effect says "Cut the Line." marks that op with seam: 'cut' (the op calls A.cutLine). The preview reads the mark.
export function cutsLine(spec) {
  const walk = (fx) => (fx || []).some((o) => o && (o.seam === 'cut' || walk(o.then) || walk(o.else) || (o.op === 'repeat' && walk(o.fx))));
  return walk(spec.fx);
}

// Graft flags the Thread reads (graft mod { k: 'custom', hooks: { noCut | wild: true } }, data/grafts_thread.js):
//   noCut (Slip Knot): a card that would cut the Line by school goes Slack instead.
//   wild (Granny Knot): the card counts as every school in the Line, so it always extends it, and adds no count.
const flagOf = (spec, k) => (spec.custom || []).some((h) => h[k]);
const lineSchools = (line) => line.order.filter((x) => line.counts[x] > 0);

// The declaration (Odile: "Once per turn, a card may be declared Gilded"). Arming it is free and can be taken back; the next
// card played also counts as that school for its Thread step. It is spent by the card that uses it: a card that already has
// the school, or that stays out of the Line whatever its schools (Frayed, Tempered, a Granny Knot on a standing Line, a Slip
// Knot going Slack), leaves it armed for the next card.
export function declareOf(c) { const h = HEROES[c.run.hero]; return (h && h.declare) || null; }
export function canDeclare(c) { return !!declareOf(c) && !c.over && !c.seam.declared; }
export function setDeclare(c, on = !c.seam.declare) {
  if (!canDeclare(c)) return false;
  const sch = on ? declareOf(c) : null;
  if (c.seam.declare === sch) return false;
  c.seam.declare = sch;
  c.ev.push({ t: 'seamDeclare', school: declareOf(c), on: !!sch });
  return true;
}

// What a card would do to the Line (pure). declared: this card would spend the turn's declaration.
function plan(c, card, spec) {
  const s = c.seam;
  if (card.jam) return { kind: 'slack', fray: true, set: [] };
  const own = schoolsOf(spec), tied = !!(spec.fused && spec.fused.length);
  const declared = !!s.declare && !tied && !own.includes(s.declare);
  const set = declared ? [...own, s.declare] : own;
  if (!set.length) return { kind: 'slack', set };
  if (tied) return { kind: 'tied', set };
  if (s.len > 0 && c.player.st.cadencelock > 0 && !s.lockBroke && set.some((x) => s.used[x])) return { kind: 'break', set, declared };
  if (s.len === 0) return { kind: 'start', set, declared };
  if (flagOf(spec, 'wild') && lineSchools(s).length) return { kind: 'extend', set: own, shared: topOf(s.counts, s.order, s.set), wild: true };
  const shared = overlap(set, s.set);
  if (shared) return { kind: 'extend', set, shared, declared };
  if (flagOf(spec, 'noCut')) return { kind: 'slack', set: own };
  return { kind: 'cut', set, declared };
}

// The school a Line pays in: the highest count, a tie going to a school of the last card, then to the oldest.
function topOf(counts, order, lastSet) {
  const rank = (x) => counts[x] * 10 + (lastSet.includes(x) ? 1 : 0);
  let top = null;
  for (const x of order) if (counts[x] > 0 && (top === null || rank(x) > rank(top))) top = x;
  return top;
}
// Pending payout for a Line. mode 'cut' pays S, 'end' pays S-1. counts/order/lastSet describe the Line.
function payoutFor(c, counts, order, lastSet, len, mode, times) {
  let S = Math.min(len, seamCap(c)) - 1;
  if (mode === 'end') S -= 1;
  if (S <= 0) return [];
  const sch = order.filter((x) => counts[x] > 0);
  const top = topOf(counts, order, lastSet);
  if (!top) return [];
  const out = [{ school: top, stitches: (S + (tier(c, top) >= 3 ? 1 : 0)) * times }];
  const rest = sch.filter((x) => x !== top && counts[x] >= 2);
  if (rest.length && Math.floor(S / 2) > 0) {
    let sec = rest[0];
    for (const x of rest) if (counts[x] > counts[sec]) sec = x;
    out.push({ school: sec, stitches: (Math.floor(S / 2) + (tier(c, sec) >= 3 ? 1 : 0)) * times });
  }
  return out;
}
const timesFor = (c, topSchool) => (topSchool && tier(c, topSchool) >= 6 ? 2 : 1); // Resonance 6: that school's cuts pay twice
// What a Line pays if it is cut now (pure): nothing once the turn's paying cuts are spent. line = { counts, order, set, len }.
function worth(c, line, cuts) {
  if (cuts >= SEAM_CUTS_TURN) return [];
  const base = payoutFor(c, line.counts, line.order, line.set, line.len, 'cut', 1);
  return base.length ? payoutFor(c, line.counts, line.order, line.set, line.len, 'cut', timesFor(c, base[0].school)) : [];
}
const fmt = (arr) => arr.map((x) => ({ school: x.school, stitches: x.stitches, text: payText(x.school, x.stitches) }));
// What cutting the Line right now would pay (the rail's "Cut now" chip).
export function seamWorth(c) { return fmt(worth(c, c.seam, c.seam.cuts)); }
function payText(school, n) {
  const nm = SCHOOL_NAME[school] || school;
  switch (school) {
    case 'ember': return `${n} stitch${n > 1 ? 'es' : ''} ${nm}: ${3 * n} Burn to all`;
    case 'echo': return `${n} stitch${n > 1 ? 'es' : ''} ${nm}: ${Math.ceil(n / 2)} Echo`;
    case 'hoard': return `${n} stitch${n > 1 ? 'es' : ''} ${nm}: draw ${Math.floor(n / 2)}, retain 1`;
    case 'blood': return `${n} stitch${n > 1 ? 'es' : ''} ${nm}: heal ${2 * n}`;
    case 'rust': return `${n} stitch${n > 1 ? 'es' : ''} ${nm}: ${3 * n} Block, pierce per junk`;
    case 'static': return `${n} stitch${n > 1 ? 'es' : ''} ${nm}: ${n} Charge, ${2 * n} damage to a random enemy`;
    case 'gilded': return `${n} stitch${n > 1 ? 'es' : ''} ${nm}: ${2 * n} gold, ${2 * n} Block`;
    default: return `${n} stitches ${nm}`;
  }
}

// Pure read for the UI: what playing `card` now would do. payout = what this card cashes (kind 'cut': a Line of another
// school, or the Line its own "Cut the Line." effect cuts), or what the Line would pay if it were cut right after this card
// (kind 'extend', the rail projection). len = the Line after the play.
export function seamPreview(c, card) {
  const s = c.seam, spec = specOf(c, card), p = plan(c, card, spec);
  const cap = seamCap(c), k = knotsOf(spec), fxCut = cutsLine(spec);
  const joins = p.kind !== 'slack' && p.kind !== 'tied';
  const fresh = () => { const counts = {}; for (const x of p.set) counts[x] = k; return { counts, order: p.set.slice(), set: p.set, len: Math.min(k, cap) }; };
  let line = s, cuts = s.cuts, paid = [];
  if (!joins) {
    if (!fxCut) return { kind: p.kind, school: p.set[0] || null, len: s.len, payout: [] };
  } else if (p.kind === 'cut' || p.kind === 'break') {
    if (p.kind === 'cut') { paid = worth(c, s, cuts); if (cuts < SEAM_CUTS_TURN && payoutFor(c, s.counts, s.order, s.set, s.len, 'cut', 1).length) cuts++; }
    line = fresh();
    if (!fxCut) return { kind: 'cut', school: p.set[0], len: line.len, payout: fmt(paid) };
  } else if (p.kind === 'start') {
    line = fresh();
    if (!fxCut) return { kind: 'extend', school: p.set[0], len: line.len, payout: [] };
  } else { // extend: project the Line after this card
    const counts = { ...s.counts }, order = s.order.slice();
    if (!p.wild) for (const x of p.set) { counts[x] = (counts[x] || 0) + k; if (!order.includes(x)) order.push(x); }
    line = { counts, order, set: p.wild ? lineSchools(s) : p.set, len: Math.min(cap, s.len + k) };
    if (!fxCut) return { kind: 'extend', school: p.shared, len: line.len, payout: fmt(worth(c, line, cuts)) };
  }
  // "Cut the Line.": the Line that stands after the card's own step is cashed. A card that joined it starts the next one.
  paid = paid.concat(worth(c, line, cuts));
  return { kind: 'cut', school: joins ? p.set[0] : topOf(line.counts, line.order, line.set), len: joins ? Math.min(k, cap) : 0, payout: fmt(paid) };
}

function enemyHook(c, name, info) {
  for (const e of c.enemies.slice()) {
    if (e.dead) continue;
    const h = e.def && e.def.on && e.def.on[name];
    if (h) h(c.A, e, info);
  }
}

function startLine(c, set, k) {
  const s = c.seam, cap = seamCap(c);
  s.counts = {}; s.order = [];
  for (const x of set) { s.counts[x] = k; s.order.push(x); }
  s.set = set.slice(); s.len = Math.min(k, cap);
}
const clearLine = (s) => { s.set = []; s.counts = {}; s.order = []; s.len = 0; };

function pay(c, entry, kind) {
  const s = c.seam, A = c.A, n = entry.stitches, school = entry.school;
  let amount = 0;
  switch (school) {
    case 'ember': { const b = 3 * n; for (const e of A.alive()) A.status(e, 'burn', b); amount = b; break; }
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
    case 'static': { amount = Math.min(n, SEAM_CHARGE_TURN - s.paidTurn.charge); if (amount > 0) { s.paidTurn.charge += amount; A.status(c.player, 'charge', amount); } else amount = 0;
      // Static also arcs: 2 pierce damage per stitch to a random enemy (so the Line pays even with no Charge-spending card)
      { const live = A.alive(); if (live.length) A.dmg(c.player, c.rng.pick(live), 2 * n, { noMods: true, pierce: true }); }
      break; }
    case 'gilded': { amount = Math.min(2 * n, SEAM_GOLD_COMBAT - s.gold); if (amount > 0) { s.gold += amount; A.gold(amount); } else amount = 0;
      A.block(c.player, 2 * n); // the Line is also plated: 2 Block per stitch, gold or no gold
      break; }
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
    list = payoutFor(c, s.counts, s.order, s.set, s.len, mode, kind === 'cut' ? timesFor(c, base[0].school) : 1);
  }
  const hadStitches = base.length > 0;
  const info = { len: s.len, school: list[0] ? list[0].school : base[0] ? base[0].school : null, stitches: list.reduce((a, x) => a + x.stitches, 0), pays: list, kind, card: card ? card.uid : null, cancel: false, paid: !capped };
  if (hadStitches && kind === 'cut' && !capped) s.cuts++;
  if (hadStitches) {
    enemyHook(c, 'seamCash', info); // a cut or the turn end: an enemy may void the payout
    if (info.cancel) { info.stitches = 0; info.pays = []; }
    if (kind === 'cut') { fire(c, 'seamCut', info); enemyHook(c, 'seamCut', info); }
  }
  const paid = info.cancel ? 0 : list.reduce((a, x) => a + x.stitches, 0);
  const ev = { t: 'seamCut', paid, school: info.school, len: s.len, card: card ? card.uid : null, kind };
  if (capped) ev.capped = true; // the cap, as opposed to an enemy cancel or a Line too short to pay: both of those also read paid 0
  c.ev.push(ev);
  if (!info.cancel) for (const e of list) pay(c, e, kind);
  return paid;
}

// "Cut the Line." as a card effect (A.cutLine): the Line is cashed as a cut, with the hooks, the 3 cuts a turn and the enemy
// cancels of any other cut. The card that did it starts the next Line if it joined this one (it has a school and was not
// Slack, Frayed or Tied), exactly as a card that cuts by school does; otherwise the rail is left empty. Replays cut once.
export function seamCutNow(c) {
  const s = c.seam, card = c.currentCard || null;
  const st = card && s.step && s.step.card === card.uid ? s.step : null;
  if (st) { if (st.cut) return 0; st.cut = true; }
  if (s.len < 1) return 0;
  const paid = cash(c, 'cut', card);
  clearLine(s);
  if (st && st.joined) {
    startLine(c, st.set, st.k);
    c.ev.push({ t: 'seamExtend', len: s.len, school: st.set[0], card: card.uid, start: true });
  }
  return paid;
}

export function seamStep(c, card, spec) {
  const s = c.seam, p = plan(c, card, spec);
  const k = knotsOf(spec), cap = seamCap(c);
  s.step = { card: card.uid, set: p.set, k, joined: p.kind !== 'slack' && p.kind !== 'tied', cut: false }; // what this card did, for seamCutNow
  if (p.declared) { c.ev.push({ t: 'seamDeclare', school: s.declare, card: card.uid, spent: true }); s.declare = null; s.declared = true; }
  if (p.fray) { c.ev.push({ t: 'seamFray', card: card.uid }); }
  if (p.kind === 'slack' || p.kind === 'tied') { c.ev.push({ t: 'seamSlack', card: card.uid }); return; }
  if (p.kind === 'extend') {
    s.len = Math.min(cap, s.len + k);
    if (s.len > (s.maxLen || 0)) s.maxLen = s.len; // longest Line this combat (case file)
    if (p.wild) s.set = lineSchools(s); // it stands for every school in the Line: the next card may follow any of them
    else { for (const x of p.set) { s.counts[x] = (s.counts[x] || 0) + k; if (!s.order.includes(x)) s.order.push(x); } s.set = p.set.slice(); }
    for (const x of p.set) s.used[x] = true;
    s.last = card.uid;
    const info = { len: s.len, school: p.shared, card: card.uid, spec };
    c.ev.push({ t: 'seamExtend', len: s.len, school: p.shared, card: card.uid });
    fire(c, 'seamExtend', info); enemyHook(c, 'seamExtend', info);
    return;
  }
  if (p.kind === 'break') {
    s.lockBroke = true; clearLine(s);
    c.ev.push({ t: 'seamCut', paid: 0, school: null, len: 0, card: card.uid, kind: 'break' });
  } else if (p.kind === 'cut') cash(c, 'cut', card);
  startLine(c, p.set, k);
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
  s.declare = null; s.declared = false;
  if (s.tied) { s.tied = false; if (s.len > 0) return; }
  clearLine(s);
}

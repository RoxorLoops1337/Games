// Battle Call: the rules engine. Pure and synchronous (no IO, no clock: `S.now` is set by the caller),
// so the Durable Object, the tests and a future local server all run the exact same rules.
//
// S = { event, ev, users: Map<key,user>, ledger: Map<ref,ledger>, dirty, now }
//   event   the event: its categories (Solo Mix, Crew, Loop Station ...), the banner, the stage
//   ev      ONE category: settings, lineup, bracket, markets. The code below always works on S.ev; the public entry points
//           point it at the right category first (see `inCat`), and put it back afterwards
//   Match, market and beatboxer ids are unique across the whole event, so a player's picks, bets and votes live in
//   plain maps keyed by id and one wallet serves every category. Only the Top-N ranking is per category (u.tops).
//   users   every account (audience), keyed by lower-cased nickname
//   ledger  per settlement, what it paid each user, so a wrong result can be taken back
//
// Money is "Loops". One pot per player: predictions pay into it, bets move it, the leaderboard ranks
// balance + what is still riding on open bets (net worth).
import {
  DEFAULTS, SIZES, MIN_BET, QUALIFY_AUTO_MAX, MAX_BB, MAX_CATS, nameKey, cleanName, cleanBb, buildMatches, roundsOf, roundInfo, winnerOf, loserOf,
  slotsFor, cleanPicks, poolTotal, sidePool, multiplier, payoutFor, log2, ARTS, guessArt,
} from './js/shared.js';

const RESERVED = new Set(Object.getOwnPropertyNames(Object.prototype).map((n) => n.toLowerCase()));
export const ok = (x) => ({ ok: true, ...x });
export const fail = (err) => ({ ok: false, err });

/* ---------------------------------------------------------------- state */

export function newCategory(event, { id, name, size, art }) {
  if (!SIZES.includes(size)) size = DEFAULTS.size;
  const first = event.order.length ? event.cats[event.order[0]].settings : null;
  const settings = first ? { ...first, pts: { ...first.pts }, size } : { ...DEFAULTS, pts: { ...DEFAULTS.pts }, size };
  return {
    id, name: cleanBb(name).slice(0, 24) || 'Battle', art: ARTS.includes(art) ? art : guessArt(name), pfx: event.order.length ? id + '.' : '', phase: 'lobby', settings,
    bbs: [], seeds: null, matches: [], locked: [], out: {}, champion: null, markets: {}, consensus: null,
  };
}

/** Events saved by an older version keep working after a deploy: fill in whatever settings and fields are newer than the save.
 *  A rule that would change a night already under way (third place) stays off for them. */
export function migrateEvent(ev) {
  for (const c of Object.values(ev.cats || {})) {
    c.settings = c.settings || {};
    // the audience vote now takes 4 minutes by default: an event still on an earlier default (10 or 30 s) moves with it (a custom length is left alone)
    if (!(c.settings.voteSecsV >= 3)) { if (c.settings.voteSecs === 10 || c.settings.voteSecs === 30) c.settings.voteSecs = 240; c.settings.voteSecsV = 3; }
    for (const [k, v] of Object.entries(DEFAULTS)) if (c.settings[k] === undefined) c.settings[k] = k === 'pts' ? { ...v } : k === 'thirdPlace' ? false : v;
    c.settings.pts = { ...DEFAULTS.pts, ...c.settings.pts };
    c.performed = c.performed || [];
    c.elimOn = !!c.elimOn; c.picksEnd = c.picksEnd || 0;
    c.performer = c.performer || null;
    c.walkover = !!c.walkover;
    c.matches = c.matches || []; c.locked = c.locked || []; c.out = c.out || {}; c.bbs = c.bbs || [];
  }
  return ev;
}

export function newEvent({ code, name, size = DEFAULTS.size, catName = 'Main battle', art, now = 0 }) {
  const event = {
    v: 2, code, name: String(name || 'Beatbox Battle').trim().slice(0, 40) || 'Beatbox Battle', created: now,
    banner: null, rev: 1, active: 'c1', order: [], cats: {}, nextBb: 1, nextMk: 1, nextCat: 2, doneSeq: 0,
  };
  event.cats.c1 = newCategory(event, { id: 'c1', name: catName, size, art });
  event.order.push('c1');
  return event;
}

export function newState(event) {
  return { event, ev: event.cats[event.active], users: new Map(), ledger: new Map(), now: 0, dirty: blankDirty() };
}
export function blankDirty() {
  return { ev: false, meta: false, live: false, board: false, host: false, users: new Set(), mk: new Set(), delMk: new Set(),
    delUsers: new Set(), lg: new Set(), photos: new Set(), delPhotos: new Set() };
}
const touchMeta = (S) => { S.dirty.meta = true; S.dirty.ev = true; S.dirty.live = true; };
const touchUser = (S, u) => { S.dirty.users.add(u.key); S.dirty.board = true; };
const touchMk = (S, m) => { S.dirty.mk.add(m.id); S.dirty.live = true; };

export function newUser(S, { name, device = '', ipH = '' }) {
  const set = S.ev.settings;
  return {
    key: nameKey(name), name, bal: set.start, joined: S.now, device, ipH, tops: {}, picks: {}, bets: {}, votes: {},
    st: { pred: 0, won: 0, lost: 0, votes: 0, sync: 0, hits: 0, bets: 0 }, log: [], seq: 0, banned: false,
    pw: null, tk: [],
  };
}

/** Check a would-be account; the caller hashes the password afterwards and then calls addUser. */
export function canRegister(S, { name, device, ipH }) {
  const set = S.ev.settings;
  if (!set.regOpen) return fail('Sign-ups are closed for this event');
  const nm = cleanName(name);
  if (nm.length < 2) return fail('Pick a nickname with at least 2 characters');
  if (RESERVED.has(nameKey(nm)) || S.users.has(nameKey(nm))) return fail('That nickname is taken');
  if (device && set.maxPerDevice && [...S.users.values()].filter((u) => u.device === device).length >= set.maxPerDevice)
    return fail('This phone already has an account. Log in instead');
  if (ipH && set.maxPerIp && [...S.users.values()].filter((u) => u.ipH === ipH).length >= set.maxPerIp)
    return fail('Too many accounts from this network');
  return ok({ name: nm });
}

export function addUser(S, u) {
  S.users.set(u.key, u); S.rankDirty = true;
  touchUser(S, u); S.dirty.host = true; S.dirty.live = true;
  return u;
}

/* ---------------------------------------------------------------- small helpers */

const cats = (S) => S.event.order.map((id) => S.event.cats[id]);
const bbOf = (S, id) => S.ev.bbs.find((b) => b.id === id);
const bbName = (S, id) => (bbOf(S, id) ? bbOf(S, id).name : '?');
const matchOf = (S, id) => S.ev.matches.find((m) => m.id === id);
/** Markets live in their category, but their ids are unique across the event. */
export function findMarket(S, id) { for (const c of cats(S)) if (c.markets[id]) return c.markets[id]; return undefined; }
const mkOf = findMarket;
export const findBb = (S, id) => { for (const c of cats(S)) { const b = c.bbs.find((x) => x.id === id); if (b) return b; } return undefined; };
const catOfMatch = (S, mid) => cats(S).find((c) => c.matches.some((m) => m.id === mid));
const catOfMarket = (S, id) => cats(S).find((c) => c.markets[id]);
/** Run `fn` with S.ev pointing at category `c`, then restore it. */
function inCat(S, c, fn) {
  if (!c) return fail('No such category');
  const prev = S.ev;
  S.ev = c;
  try { return fn(); } finally { S.ev = prev; }
}
const topOf = (S, u) => ((u.tops = u.tops || {})[S.ev.id] = u.tops[S.ev.id] || []);
const seedNo = (S, id) => (S.ev.seeds ? S.ev.seeds.indexOf(id) + 1 : 0);
export const marketsList = (S) => Object.values(S.ev.markets).sort((a, b) => a.ord - b.ord);

function pushLog(S, u, kind, d, x, ref) {
  u.log.push({ i: ++u.seq, t: S.now, k: kind, d, x, r: ref || '' });
  if (u.log.length > 40) u.log.splice(0, u.log.length - 40);
}

function ledgerOf(S, ref) {
  let lg = S.ledger.get(ref);
  if (!lg) { lg = { ref, u: {}, mk: [], made: [], extra: {} }; S.ledger.set(ref, lg); }
  S.dirty.lg.add(ref);
  return lg;
}

/** Move Loops (and stat counters) for a user, with a history line and a ledger entry so it can be taken back. */
function credit(S, u, amt, kind, text, ref, stats) {
  u.bal += amt; S.rankDirty = true;
  if (stats) for (const k of Object.keys(stats)) u.st[k] = (u.st[k] || 0) + stats[k];
  if (amt || text) pushLog(S, u, kind, amt, text, ref);
  if (ref) {
    const lg = ledgerOf(S, ref), e = (lg.u[u.key] = lg.u[u.key] || { bal: 0, st: {} });
    e.bal += amt;
    if (stats) for (const k of Object.keys(stats)) e.st[k] = (e.st[k] || 0) + stats[k];
  }
  touchUser(S, u);
}

export function staked(S, u) {
  let s = 0;
  for (const [mid, b] of Object.entries(u.bets)) {
    const m = mkOf(S, mid);
    if (m && (m.st === 'open' || m.st === 'locked')) s += b[1];
  }
  return s;
}
export const netWorth = (S, u) => u.bal + staked(S, u);

/* ---------------------------------------------------------------- lineup */

function addBb(S, name, extra = {}) {
  const nm = cleanBb(name);
  if (!nm) return null;
  if (S.ev.bbs.some((b) => b.name.toLowerCase() === nm.toLowerCase())) return null;
  const bb = { id: 'b' + S.event.nextBb++, name: nm, tag: cleanBb(extra.tag || '').slice(0, 24), ph: 0 };
  S.ev.bbs.push(bb);
  return bb;
}

/* ---------------------------------------------------------------- markets */

function newMarket(S, fields) {
  const n = fields.bbs ? fields.bbs.length : 2;
  const m = { id: 'k' + S.event.nextMk++, ord: S.event.nextMk, cat: S.ev.id, st: 'open', win: null, pool: Array(n).fill(0), cnt: Array(n).fill(0),
    seed: Array(n).fill(0), ...fields };
  S.ev.markets[m.id] = m;
  touchMk(S, m); S.dirty.meta = true; S.dirty.ev = true;
  return m;
}

const weight = (S, id) => 1 / Math.sqrt(Math.max(1, seedNo(S, id)) || 1);

function seedPools(S, m) {
  const total = m.kind === 'champion' ? 400 : 200;
  if (m.kind === 'match' || m.kind === 'champion') {
    const w = m.bbs.map((id) => weight(S, id)), sum = w.reduce((a, b) => a + b, 0);
    m.seed = w.map((x) => Math.max(8, Math.round((total * x) / sum)));
  } else {
    const E = Math.max(1, S.ev.bbs.length);
    const p = m.kind === 'qualify' ? Math.min(0.9, Math.max(0.1, S.ev.settings.size / E)) : 0.5;
    const yes = Math.round(total * p);
    m.seed = [yes, total - yes];
  }
}

function openQualify(S, bb) {
  const m = newMarket(S, { kind: 'qualify', bb });
  seedPools(S, m);
  return m;
}

function openMatchMarket(S, mt) {
  if (Object.values(S.ev.markets).some((m) => m.kind === 'match' && m.mid === mt.id && m.st !== 'void')) return null;
  const m = newMarket(S, { kind: 'match', mid: mt.id, bbs: [mt.a, mt.b] });
  seedPools(S, m);
  return m;
}

function openChampion(S) {
  if (Object.values(S.ev.markets).some((m) => m.kind === 'champion' && m.st !== 'void')) return null;
  const m = newMarket(S, { kind: 'champion', bbs: [...S.ev.seeds] });
  seedPools(S, m);
  return m;
}

export const isDead = (S, m, i) => {
  if (m.kind === 'champion') return S.ev.out[m.bbs[i]] !== undefined;
  return false;
};

/** Pay a settled market. Winners split the whole pot (house seed included) pro rata; never less than stake x minPayout. */
function settleMarket(S, m, win, ref) {
  const lg = ledgerOf(S, ref);
  lg.mk.push([m.id, m.st]);
  m.st = 'settled'; m.win = win; touchMk(S, m);
  const minP = S.ev.settings.minPayout;
  for (const u of S.users.values()) {
    const b = u.bets[m.id];
    if (!b) continue;
    if (b[0] === win) {
      const pay = payoutFor(m, win, b[1], minP);
      b[2] = pay;
      credit(S, u, pay, 'win', `Won ${pay - b[1]} on ${marketTitle(S, m)}`, ref, { won: 1 });
    } else {
      b[2] = 0;
      pushLog(S, u, 'loss', -b[1], `Lost on ${marketTitle(S, m)}`, ref);
      u.st.lost = (u.st.lost || 0) + 1;
      const e = (lg.u[u.key] = lg.u[u.key] || { bal: 0, st: {} });
      e.st.lost = (e.st.lost || 0) + 1;
      touchUser(S, u);
    }
  }
}

function voidMarket(S, m, ref, why = 'Bet cancelled') {
  if (m.st === 'void') return; // already refunded
  m.st = 'void'; touchMk(S, m);
  for (const u of S.users.values()) {
    const b = u.bets[m.id];
    if (!b) continue;
    b[2] = b[1];
    credit(S, u, b[1], 'refund', `${why}: ${marketTitle(S, m)} (stake back)`, ref);
  }
}

function dropMarket(S, m) {
  delete S.ev.markets[m.id];
  S.dirty.delMk.add(m.id); S.dirty.mk.delete(m.id); S.dirty.meta = true; S.dirty.ev = true; S.dirty.live = true;
  for (const u of S.users.values()) if (u.bets[m.id]) { delete u.bets[m.id]; touchUser(S, u); }
}

export function marketTitle(S, m) {
  const c = S.event.cats[m.cat] || S.ev, nm = (id) => { const b = c.bbs.find((x) => x.id === id); return b ? b.name : '?'; };
  if (m.kind === 'qualify') return `${nm(m.bb)} makes the Top ${c.settings.size}`;
  if (m.kind === 'reach') return `${nm(m.bb)} reaches the ${roundInfo(c.settings.size, m.to).short}`;
  if (m.kind === 'match') return `${nm(m.bbs[0])} vs ${nm(m.bbs[1])}`;
  return 'Battle champion';
}

/* ---------------------------------------------------------------- phases */

const NEXT_PHASE = { lobby: ['picks', 'elimination'], picks: ['elimination', 'lobby'], elimination: ['picks'] };

export function setPhase(S, to) {
  const ev = S.ev, from = ev.phase;
  if (!(NEXT_PHASE[from] || []).includes(to)) return fail(`Cannot go from ${from} to ${to}`);
  if (to === 'lobby') {
    // back to doors open: the "makes the cut" bets are refunded and removed (everyone's own picks stay)
    for (const m of marketsList(S)) if (m.kind === 'qualify') { voidMarket(S, m, null, 'Picks closed'); dropMarket(S, m); }
    ev.phase = 'lobby'; ev.consensus = null; ev.consensusAll = null; ev.performer = null; ev.performed = []; ev.elimOn = false; ev.picksEnd = 0;
    touchMeta(S);
    return ok({});
  }
  if (ev.bbs.length < ev.settings.size && ev.bbs.length !== 1) return fail(`Add at least ${ev.settings.size} beatboxers first (or lower the bracket size)`);
  if (to === 'picks') {
    ev.phase = 'picks';
    if (from === 'elimination') {
      for (const m of marketsList(S)) if (m.kind === 'qualify' && m.st === 'locked') { m.st = 'open'; touchMk(S, m); }
      ev.consensus = null; ev.consensusAll = null; ev.elimOn = true; // reopened: the round is still going, the stage stays as it was
    } else if (ev.settings.qualifyBets && ev.bbs.length > ev.settings.size && ev.bbs.length <= QUALIFY_AUTO_MAX) {
      for (const b of ev.bbs) if (!qualifyOf(S, b.id)) openQualify(S, b.id);
    }
  } else {
    ev.phase = 'elimination'; ev.picksEnd = 0;
    for (const m of marketsList(S)) if (m.kind === 'qualify' && m.st === 'open') { m.st = 'locked'; touchMk(S, m); }
    ev.consensus = consensus(S); ev.consensusAll = consensus(S, true);
  }
  touchMeta(S);
  return ok({});
}

const qualifyOf = (S, bb) => Object.values(S.ev.markets).find((m) => m.kind === 'qualify' && m.bb === bb && m.st !== 'void');

/** What the crowd thinks: Borda count over everybody's top-N pick. */
export function consensus(S, all) {
  const N = S.ev.settings.size, acc = new Map();
  let voters = 0;
  for (const u of S.users.values()) {
    if (!topOf(S, u).length) continue;
    voters++;
    topOf(S, u).forEach((id, i) => {
      const a = acc.get(id) || { id, n: 0, pts: 0, sum: 0, f: 0 };
      a.n++; a.pts += N - i; a.sum += i + 1; if (i === 0) a.f++;
      acc.set(id, a);
    });
  }
  const rows = [...acc.values()].sort((a, b) => b.pts - a.pts || a.sum / a.n - b.sum / b.n)
    .slice(0, all ? undefined : N).map((a) => ({ id: a.id, n: a.n, avg: Math.round((a.sum / a.n) * 10) / 10, f: a.f }));
  return { voters, rows };
}

/** The beatboxer on stage during the elimination, and what the hall predicted for them. */
export function setPerformer(S, id) {
  const ev = S.ev;
  if (!(ev.phase === 'elimination' || (ev.phase === 'picks' && ev.elimOn))) return fail('Start the elimination round first');
  if (id != null && !ev.bbs.some((b) => b.id === id)) return fail('No such beatboxer');
  ev.performed = ev.performed || [];
  if (ev.performer && ev.performer !== id && !ev.performed.includes(ev.performer)) ev.performed.push(ev.performer);
  if (id != null) ev.performed = ev.performed.filter((x) => x !== id);
  ev.performer = id == null ? null : id;
  touchMeta(S); S.dirty.ev = true;
  return ok({});
}

/** The elimination round starts while predictions stay open: the organiser can now put people on stage. */
export function startElimination(S) {
  const ev = S.ev;
  if (ev.phase !== 'picks') return fail('Open the predictions first');
  if (ev.elimOn) return fail('The elimination round is already on');
  ev.elimOn = true; ev.performer = null; ev.performed = []; ev.picksEnd = 0;
  touchMeta(S); S.dirty.ev = true;
  return ok({});
}

/** "They have N minutes to lock in": predictions close by themselves when the clock runs out. 0 cancels. */
export function setPicksTimer(S, mins) {
  const ev = S.ev;
  if (ev.phase !== 'picks') return fail('Only while predictions are open');
  const m = Math.max(0, Math.min(60, +mins || 0));
  ev.picksEnd = m ? S.now + Math.round(m * 60000) : 0;
  touchMeta(S); S.dirty.ev = true;
  return ok({});
}

export function performerStats(S, id) {
  const N = S.ev.settings.size;
  let voters = 0, n = 0, sum = 0, firsts = 0;
  for (const u of S.users.values()) {
    const t = topOf(S, u);
    if (!t.length) continue;
    voters++;
    const i = t.indexOf(id);
    if (i >= 0) { n++; sum += i + 1; if (i === 0) firsts++; }
  }
  const rank = consensus(S, true).rows.findIndex((r) => r.id === id) + 1;
  const k = qualifyOf(S, id);
  const yes = k ? k.pool[0] : 0, no = k ? k.pool[1] : 0;
  return {
    id, N, voters, n, pct: voters ? Math.round((n / voters) * 100) : 0, avg: n ? Math.round((sum / n) * 10) / 10 : 0, firsts, rank,
    bets: k ? { yes: yes + no ? Math.round((yes / (yes + no)) * 100) : 0, staked: yes + no, people: k.cnt[0] + k.cnt[1] } : null,
  };
}

/* ---------------------------------------------------------------- seeds -> bracket */

export function publishSeeds(S, order) {
  const ev = S.ev, N = ev.settings.size;
  if (ev.phase !== 'elimination') return fail('Publish the ranking while the elimination is on');
  if (!Array.isArray(order) || order.length !== N) return fail(`Pick exactly ${N} beatboxers`);
  if (new Set(order).size !== N || order.some((id) => !bbOf(S, id))) return fail('Every beatboxer can only appear once');
  const ref = ev.pfx + 'seeds', lg = ledgerOf(S, ref);
  lg.extra = { phaseBefore: 'elimination' };
  ev.performer = null;
  ev.seeds = [...order];
  ev.matches = buildMatches(N, ev.pfx);
  ev.locked = Array(log2(N)).fill(false);
  ev.out = {}; ev.champion = null;
  for (const m of ev.matches.filter((x) => x.r === 0)) {
    m.a = order[m.seeds[0] - 1]; m.b = order[m.seeds[1] - 1]; m.status = 'upcoming';
  }
  // 1. top-N predictions
  const P = ev.settings.pts;
  for (const u of S.users.values()) {
    if (!topOf(S, u).length) continue;
    let tot = 0, hits = 0;
    topOf(S, u).forEach((id, i) => {
      const at = order.indexOf(id);
      if (at < 0) return;
      hits++;
      tot += P.topIn + (at === i ? P.topExact : Math.abs(at - i) === 1 ? P.topNear : 0);
    });
    if (tot) credit(S, u, tot, 'pred', `Top ${N} call: ${hits} of ${topOf(S, u).length} made it, +${tot}`, ref, { pred: tot, hits });
  }
  // 2. "makes the cut" bets
  for (const m of marketsList(S)) {
    if (m.kind === 'qualify' && (m.st === 'locked' || m.st === 'open')) settleMarket(S, m, order.includes(m.bb) ? 0 : 1, ref);
  }
  // 3. fresh markets for the bracket
  for (const m of ev.matches.filter((x) => x.r === 0)) lg.made.push(openMatchMarket(S, m).id);
  if (ev.settings.autoChampion) { const c = openChampion(S); if (c) lg.made.push(c.id); }
  ev.phase = 'bracket';
  touchMeta(S); S.dirty.board = true;
  return ok({});
}

export function revertSeeds(S) {
  const ev = S.ev;
  if (ev.phase !== 'bracket') return fail('There is no ranking to take back');
  if (ev.matches.some((m) => m.status !== 'upcoming' && m.status !== 'wait')) return fail('A battle has already started');
  for (const m of marketsList(S)) if (m.kind !== 'qualify') { voidMarket(S, m, null); dropMarket(S, m); } // match, champion, reach: all built on the old bracket
  applyLedgerBack(S, ev.pfx + 'seeds');
  for (const u of S.users.values()) if (Object.keys(u.picks).length) { u.picks = {}; touchUser(S, u); }
  ev.seeds = null; ev.matches = []; ev.locked = []; ev.out = {}; ev.champion = null; ev.phase = 'elimination';
  touchMeta(S);
  return ok({});
}

/** Undo what a settlement paid: balances, stats, history lines, market results. */
function applyLedgerBack(S, ref) {
  const lg = S.ledger.get(ref);
  if (!lg) return;
  for (const [key, e] of Object.entries(lg.u)) {
    const u = S.users.get(key);
    if (!u) continue;
    u.bal -= e.bal;
    for (const k of Object.keys(e.st)) u.st[k] = (u.st[k] || 0) - e.st[k];
    u.log = u.log.filter((l) => l.r !== ref);
    if (e.bal) pushLog(S, u, 'fix', -e.bal, 'The organiser corrected a result', '');
    touchUser(S, u);
  }
  for (const [id, was] of lg.mk) {
    const m = mkOf(S, id);
    if (!m) continue;
    m.st = was; m.win = null; touchMk(S, m);
    for (const u of S.users.values()) if (u.bets[id]) u.bets[id][2] = null;
  }
  S.ledger.delete(ref); S.dirty.lg.add(ref);
}

/* ---------------------------------------------------------------- the battles */

function lockRound(S, r) {
  const ev = S.ev;
  if (ev.locked[r]) return;
  ev.locked[r] = true;
  for (const m of marketsList(S)) if (m.kind === 'reach' && m.to - 1 === r && m.st === 'open') { m.st = 'locked'; touchMk(S, m); }
}

const activeMatch = (S) => { for (const c of cats(S)) { const m = c.matches.find((x) => x.status === 'live' || x.status === 'voting' || x.status === 'closed'); if (m) return m; } return undefined; };
export const currentMatch = activeMatch;

/** The final and the third-place battle can wait for the judges (announced later, at the award ceremony). */
const isTerminal = (ev, m) => !!m.third || m.r === log2(ev.settings.size) - 1;

export function stepMatch(S, mid, to, secs, later) {
  const ev = S.ev, m = matchOf(S, mid);
  if (ev.phase !== 'bracket') return fail('The bracket is not running');
  if (!m) return fail('No such battle');
  const ALLOWED = { live: ['upcoming', 'voting'], voting: ['live', 'closed', 'awaiting'], closed: ['voting', 'awaiting'], awaiting: ['voting', 'closed'], upcoming: ['live'] };
  if (to === 'upcoming') {
    // "oops, wrong battle": only a battle that is live and has no votes yet can be put back, and its bets and picks reopen
    if (m.status !== 'live') return fail('Only a battle that has just started can be put back');
    m.status = 'upcoming';
    for (const k of marketsList(S)) if (k.kind === 'match' && k.mid === mid && k.st === 'locked') { k.st = 'open'; touchMk(S, k); }
    if (ev.matches.filter((x) => x.r === m.r).every((x) => x.status === 'upcoming' || x.status === 'wait')) {
      ev.locked[m.r] = false;
      for (const k of marketsList(S)) if (k.kind === 'reach' && k.to - 1 === m.r && k.st === 'locked') { k.st = 'open'; touchMk(S, k); }
    }
    touchMeta(S);
    return ok({});
  }
  if (!(ALLOWED[to] || []).includes(m.status)) return fail(`A ${m.status} battle cannot go to ${to}`);
  if (to === 'live') {
    const other = activeMatch(S);
    if (other && other.id !== mid) return fail('Finish the current battle first');
    lockRound(S, m.r);
    S.event.active = ev.id; // whoever is on stage is the category everybody's phone follows
    for (const k of marketsList(S)) if (k.kind === 'match' && k.mid === mid && k.st === 'open') { k.st = 'locked'; touchMk(S, k); }
  }
  if (to === 'awaiting') {
    // the vote is over but the judges have not decided: the stage is free for the next battle, the result comes at the ceremony
    if (!isTerminal(ev, m)) return fail('Only the final and the third-place battle can wait for the judges');
    m.later = false; m.aws = ++S.event.doneSeq;
  }
  if ((to === 'voting' || to === 'closed') && m.status === 'awaiting') {
    delete m.sealed; // reopening the vote throws away a locked result
    const other = activeMatch(S);
    if (other && other.id !== mid) return fail('Finish the current battle first');
    S.event.active = ev.id;
  }
  if (to === 'voting') {
    m.later = !!later && isTerminal(ev, m); // "judges decide later": when the clock runs out the battle goes to awaiting, not to hands up
    // the vote can close by itself: `vend` is the moment (server clock) it does
    const s = secs == null ? ev.settings.voteSecs : Math.max(0, Math.min(1800, Math.floor(+secs) || 0));
    m.vsecs = s; m.vend = s > 0 ? S.now + s * 1000 : 0;
  } else m.vend = 0;
  m.status = to;
  touchMeta(S);
  return ok({});
}

/** Close every vote whose countdown has run out. Returns the battles it closed (the caller runs this from a timer). */
export function closeDueVotes(S) {
  const done = [];
  for (const c of cats(S)) {
    for (const m of c.matches) {
      if (m.status === 'voting' && m.vend && S.now >= m.vend) {
        const r = inCat(S, c, () => stepMatch(S, m.id, m.later ? 'awaiting' : 'closed'));
        if (r.ok) done.push(m.id);
      }
    }
    // "they have five minutes to lock in": predictions close when the clock runs out
    if (c.phase === 'picks' && c.picksEnd && S.now >= c.picksEnd) {
      const r = inCat(S, c, () => setPhase(S, 'elimination'));
      if (r.ok) done.push('picks:' + c.id);
    }
  }
  return done;
}

export function swapSides(S, mid) {
  const m = matchOf(S, mid);
  if (!m) return fail('No such battle');
  if (m.status !== 'upcoming') return fail('Only before the battle starts');
  m.swap = !m.swap; touchMeta(S);
  return ok({});
}

/** How many battles in a row (latest first, across categories) this player's vote went the judges' way. */
export function voteStreak(S, u) {
  const done = [];
  for (const c of cats(S)) for (const m of c.matches) if (m.status === 'done' && m.w) done.push(m);
  done.sort((a, b) => (b.ds || 0) - (a.ds || 0));
  let n = 0;
  for (const m of done) { if (u.votes[m.id] === m.w) n++; else break; }
  return n;
}
const streakBonus = (n) => (n >= 2 ? Math.min(5 * (n - 1), 25) : 0);

export function setResult(S, mid, w, judges) {
  const ev = S.ev, m = matchOf(S, mid), P = ev.settings.pts;
  if (ev.phase !== 'bracket') return fail('The bracket is not running');
  if (!m) return fail('No such battle');
  if (m.status === 'wait' || m.status === 'done') return fail('That battle cannot get a result now');
  if (w !== 'a' && w !== 'b') return fail('Pick a winner');
  const other = activeMatch(S);
  if (other && other.id !== mid) return fail('Finish the current battle first');
  const ref = 'm:' + mid, lg = ledgerOf(S, ref);
  lg.extra = { was: m.status };
  lockRound(S, m.r);
  m.w = w; m.status = 'done'; m.ds = ++S.event.doneSeq; // the order results came in, so Undo can walk back through them
  if (judges && Number.isInteger(judges.a) && Number.isInteger(judges.b)) m.judges = { a: Math.max(0, judges.a | 0), b: Math.max(0, judges.b | 0) };
  const win = winnerOf(m), lose = loserOf(m);
  if (!m.third) ev.out[lose] = m.r;
  // the battle's own market
  for (const k of marketsList(S)) if (k.kind === 'match' && k.mid === mid && (k.st === 'open' || k.st === 'locked')) settleMarket(S, k, w === 'a' ? 0 : 1, ref);
  // bracket picks, round by round worth more
  const worth = P.pick * 2 ** m.r;
  for (const u of S.users.values()) {
    if (u.picks[mid] === win) credit(S, u, worth, 'pred', `Called ${bbName(S, win)} to win: +${worth}`, ref, { pred: worth, hits: 1 });
    const v = u.votes[mid];
    if (v) {
      const synced = v === w;
      credit(S, u, P.vote + (synced ? P.sync : 0), 'vote',
        synced ? `Your vote matched the judges: +${P.vote + P.sync}` : `Thanks for voting: +${P.vote}`, ref,
        { votes: 1, sync: synced ? 1 : 0 });
      const run = synced ? voteStreak(S, u) : 0, bonus = streakBonus(run);
      if (bonus) credit(S, u, bonus, 'streak', `${run} in a row with the judges: +${bonus}`, ref, { streakBonus: bonus });
    }
  }
  // advance
  if (m.third) { /* the battle for third place goes nowhere */ }
  else if (m.r + 1 < log2(ev.settings.size)) {
    const nx = ev.matches.find((x) => x.r === m.r + 1 && x.i === m.i >> 1 && !x.third);
    nx[m.i % 2 === 0 ? 'a' : 'b'] = win;
    if (nx.a && nx.b) { nx.status = 'upcoming'; lg.made.push(openMatchMarket(S, nx).id); }
  } else {
    ev.champion = win;
    for (const k of marketsList(S)) if (k.kind === 'champion' && k.st !== 'settled' && k.st !== 'void') settleMarket(S, k, k.bbs.indexOf(win), ref);
  }
  // both semi-finals are in: the losers play for third
  if (ev.settings.thirdPlace && !m.third && log2(ev.settings.size) >= 2 && m.r === log2(ev.settings.size) - 2 && !ev.matches.some((x) => x.third)) {
    const semis = ev.matches.filter((x) => x.r === m.r);
    if (semis.every((x) => x.status === 'done')) {
      const R = log2(ev.settings.size), fin = ev.matches.findIndex((x) => x.r === R - 1);
      const th = { id: ev.pfx + 'third', r: R, i: 0, third: true, seeds: null, feed: null, a: loserOf(semis[0]), b: loserOf(semis[1]),
        status: 'upcoming', w: null, swap: false, judges: null, c: { a: 0, b: 0 } };
      ev.matches.splice(fin, 0, th); // listed before the final: it is the next battle
      ev.locked[R] = false;
      lg.made.push(openMatchMarket(S, th).id);
    }
  }
  if (ev.champion && ev.matches.every((x) => x.status === 'done')) ev.phase = 'finished';
  settleReaches(S, ref);
  if (ev.matches.filter((x) => x.r === m.r).every((x) => x.status === 'done')) roundTips(S, m.r);
  touchMeta(S); S.dirty.board = true; S.dirty.host = true;
  return ok({ winner: win });
}

/** Lock in the judges' decision for the final or the third-place battle WITHOUT showing it: nothing is paid or announced until `revealResults`. */
export function sealResult(S, mid, w, judges) {
  const ev = S.ev, m = matchOf(S, mid);
  if (ev.phase !== 'bracket') return fail('The bracket is not running');
  if (!m) return fail('No such battle');
  if (!isTerminal(ev, m)) return fail('Only the final and the third-place battle can be locked for the ceremony');
  if (w !== 'a' && w !== 'b') return fail('Pick a winner');
  if (m.status === 'voting' || m.status === 'closed') { const r = stepMatch(S, mid, 'awaiting'); if (!r.ok) return r; }
  else if (m.status !== 'awaiting') return fail('Close the audience vote first');
  m.sealed = { w };
  if (judges && Number.isInteger(judges.a) && Number.isInteger(judges.b)) m.sealed.judges = { a: Math.max(0, judges.a | 0), b: Math.max(0, judges.b | 0) };
  touchMeta(S); S.dirty.host = true;
  return ok({});
}

export function unsealResult(S, mid) {
  const m = matchOf(S, mid);
  if (!m || !m.sealed) return fail('No locked result there');
  delete m.sealed; touchMeta(S); S.dirty.host = true;
  return ok({});
}

/** The award ceremony: every locked result of this category goes public, third place first, then the final. */
export function revealResults(S) {
  const sealed = S.ev.matches.filter((m) => m.sealed && m.status === 'awaiting').sort((a, b) => (b.third ? 1 : 0) - (a.third ? 1 : 0));
  if (!sealed.length) return fail('No locked results to reveal');
  for (const m of sealed) {
    const { w, judges } = m.sealed;
    delete m.sealed;
    const r = setResult(S, m.id, w, judges);
    if (!r.ok) return r;
  }
  return ok({ revealed: sealed.length });
}

/** A category with a single entrant has no battles: after the elimination the organiser crowns them (a walkover). */
export function walkover(S) {
  const ev = S.ev;
  if (ev.phase !== 'elimination') return fail('A walkover is crowned at the elimination');
  if (ev.bbs.length !== 1) return fail('A walkover needs exactly one beatboxer');
  ev.seeds = [ev.bbs[0].id]; ev.matches = []; ev.locked = []; ev.out = {};
  ev.champion = ev.bbs[0].id; ev.walkover = true; ev.phase = 'finished';
  touchMeta(S); S.dirty.board = true; S.dirty.ev = true;
  return ok({});
}

/** What "Undo" would take back in this category right now (null: nothing to undo). `hard` = it reverses payouts. */
export function undoPlan(S) {
  const ev = S.ev, act = activeMatch(S), nm = (m) => `${bbName(S, m.a)} vs ${bbName(S, m.b)}`;
  if (act && ev.matches.includes(act)) {
    if (act.status === 'closed') return { label: 'Reopen the audience vote', hard: false };
    if (act.status === 'voting') return { label: 'Close the vote and go back to the battle', hard: false };
    return { label: `Put ${nm(act)} back: not started yet`, hard: false };
  }
  if (ev.phase === 'finished' && ev.walkover) return { label: 'Take back the walkover', hard: false };
  if (ev.phase === 'bracket' || ev.phase === 'finished') {
    const last = ev.matches.filter((m) => m.status === 'done').sort((a, b) => b.ds - a.ds)[0];
    const aw = ev.matches.filter((m) => m.status === 'awaiting').sort((a, b) => b.aws - a.aws)[0];
    if (aw && aw.aws > (last ? last.ds : 0)) return { label: `Take back "judges decide later" for ${nm(aw)}`, hard: false, aw: aw.id };
    if (last) return { label: `Take back the result of ${nm(last)}`, hard: true, mid: last.id };
    return { label: 'Take back the ranking and redraw the bracket', hard: true };
  }
  if (ev.phase === 'elimination') return { label: 'Reopen the picks', hard: false };
  if (ev.phase === 'picks' && ev.elimOn) return { label: 'Stop the elimination round (predictions stay open)', hard: false };
  if (ev.phase === 'picks') return { label: 'Close the picks and go back to doors open', hard: true };
  return null;
}

/** One step back, whatever the last step was. Pressing it again goes back one more. */
export function undoStep(S) {
  const plan = undoPlan(S), ev = S.ev;
  if (!plan) return fail('Nothing to undo');
  const act = activeMatch(S);
  let r;
  if (act && ev.matches.includes(act)) r = stepMatch(S, act.id, act.status === 'closed' ? 'voting' : act.status === 'voting' ? 'live' : 'upcoming');
  else if (ev.phase === 'finished' && ev.walkover) { ev.champion = null; ev.walkover = false; ev.seeds = null; ev.phase = 'elimination'; touchMeta(S); S.dirty.ev = true; r = ok({}); }
  else if (plan.aw) r = stepMatch(S, plan.aw, 'closed');
  else if (plan.mid) r = revertMatch(S, plan.mid);
  else if (ev.phase === 'bracket') r = revertSeeds(S);
  else if (ev.phase === 'picks' && ev.elimOn) { ev.elimOn = false; ev.performer = null; ev.performed = []; ev.picksEnd = 0; touchMeta(S); S.dirty.ev = true; r = ok({}); }
  else if (ev.phase === 'elimination') r = setPhase(S, 'picks');
  else r = setPhase(S, 'lobby');
  return r.ok ? ok({ undid: plan.label }) : r;
}

/** Reach-the-round bets resolve as soon as it is known: yes when the fighter is drawn into that round, no when they are out first. */
function settleReaches(S, ref) {
  for (const k of marketsList(S)) {
    if (k.kind !== 'reach' || k.st === 'settled' || k.st === 'void') continue;
    const inRound = S.ev.matches.some((m) => m.r === k.to && (m.a === k.bb || m.b === k.bb));
    const out = S.ev.out[k.bb] !== undefined && S.ev.out[k.bb] < k.to;
    if (inRound) settleMarket(S, k, 0, ref); else if (out) settleMarket(S, k, 1, ref);
  }
}

/** Everybody who has run dry gets a small busking tip when a round ends, so nobody is stuck watching. */
function roundTips(S, r) {
  const tip = S.ev.settings.pts.tip;
  if (!tip) return;
  for (const u of S.users.values()) {
    if (netWorth(S, u) < tip) credit(S, u, tip - Math.max(0, netWorth(S, u)), 'tip', 'Busking tip from the crowd', S.ev.pfx + 'tip:' + r);
  }
}

export function revertMatch(S, mid) {
  const ev = S.ev, m = matchOf(S, mid);
  if (!m || m.status !== 'done') return fail('That battle has no result to take back');
  if (activeMatch(S)) return fail('Finish the current battle first');
  const nx = !m.third && m.r + 1 < log2(ev.settings.size) ? ev.matches.find((x) => x.r === m.r + 1 && x.i === m.i >> 1 && !x.third) : null;
  if (nx && nx.status !== 'upcoming' && nx.status !== 'wait') return fail('The next battle has already started');
  const th = ev.matches.find((x) => x.third);
  if (th && !m.third && m.r === log2(ev.settings.size) - 2 && th.status !== 'upcoming') return fail('Take back the third-place battle first');
  const lg = S.ledger.get('m:' + mid);
  for (const id of lg ? lg.made : []) { const k = mkOf(S, id); if (k) { voidMarket(S, k, null, 'Result changed'); dropMarket(S, k); } }
  applyLedgerBack(S, 'm:' + mid);
  if (S.ledger.has(ev.pfx + 'tip:' + m.r)) applyLedgerBack(S, ev.pfx + 'tip:' + m.r); // the round is open again, so are its tips
  if (nx) { nx[m.i % 2 === 0 ? 'a' : 'b'] = null; nx.status = 'wait'; }
  if (th && !m.third && m.r === log2(ev.settings.size) - 2) { ev.matches = ev.matches.filter((x) => !x.third); ev.locked.length = Math.min(ev.locked.length, log2(ev.settings.size)); }
  if (!m.third && m.r === log2(ev.settings.size) - 1) ev.champion = null;
  if (ev.phase === 'finished') ev.phase = 'bracket';
  if (!m.third) delete ev.out[loserOf(m)];
  m.w = null; m.judges = null; m.ds = 0; m.status = 'closed';
  touchMeta(S); S.dirty.board = true;
  return ok({});
}

/* ---------------------------------------------------------------- audience actions */

export function setTop(S, u, order, catId) {
  return inCat(S, S.event.cats[catId || S.event.active], () => {
    if (S.ev.phase !== 'picks') return fail('Top picks are closed');
    if (!Array.isArray(order)) return fail('Bad ranking');
    const ids = order.slice(0, S.ev.settings.size);
    if (new Set(ids).size !== ids.length || ids.some((id) => !bbOf(S, id))) return fail('Bad ranking');
    (u.tops = u.tops || {})[S.ev.id] = ids; touchUser(S, u); S.dirty.host = true; if (S.ev.performer || S.ev.elimOn) S.dirty.live = true;
    return ok({});
  });
}

export const setPick = (S, u, mid, bb) => inCat(S, catOfMatch(S, mid), () => setPickIn(S, u, mid, bb));
function setPickIn(S, u, mid, bb) {
  const ev = S.ev, m = matchOf(S, mid);
  if (ev.phase !== 'bracket' || !m) return fail('Picks are not open');
  if (m.third) return fail('The third-place battle has no picks');
  if (ev.locked[m.r] || m.status === 'done') return fail('This round is locked');
  if (bb) {
    if (!slotsFor(ev.matches, u.picks, m).includes(bb)) return fail('They are not in that battle (yet)');
    u.picks[mid] = bb;
  } else delete u.picks[mid];
  cleanPicks(ev.matches, u.picks);
  touchUser(S, u);
  return ok({});
}

/** Set the stake on one side of a market. Same side again replaces the amount, the other side moves it, 0 takes it back. */
export const setBet = (S, u, mid, opt, amt) => inCat(S, catOfMarket(S, mid), () => setBetIn(S, u, mid, opt, amt));
function setBetIn(S, u, mid, opt, amt) {
  const m = mkOf(S, mid);
  if (!m || m.st !== 'open') return fail('Betting is closed on that one');
  amt = Math.floor(+amt);
  if (!Number.isFinite(amt) || amt < 0) return fail('Bad amount');
  if (!Number.isInteger(opt) || opt < 0 || opt >= m.pool.length) return fail('Bad choice');
  if (amt > 0 && amt < MIN_BET) return fail(`The minimum bet is ${MIN_BET}`);
  if (amt > 0 && isDead(S, m, opt)) return fail('They are already out');
  const prev = u.bets[mid];
  const back = prev && prev[2] == null ? prev[1] : 0;
  if (amt > u.bal + back) return fail('Not enough Loops');
  if (prev) { m.pool[prev[0]] -= prev[1]; m.cnt[prev[0]]--; u.bal += back; delete u.bets[mid]; }
  if (amt > 0) {
    m.pool[opt] += amt; m.cnt[opt]++; u.bal -= amt; u.bets[mid] = [opt, amt, null];
    if (!prev) u.st.bets = (u.st.bets || 0) + 1;
  }
  touchMk(S, m); touchUser(S, u);
  return ok({});
}

export const castVote = (S, u, mid, side) => inCat(S, catOfMatch(S, mid), () => castVoteIn(S, u, mid, side));
function castVoteIn(S, u, mid, side) {
  const m = matchOf(S, mid);
  if (!m || m.status !== 'voting') return fail('Voting is not open');
  if (m.vend && S.now > m.vend + 2500) return fail('Voting is closed'); // a little grace for a slow connection
  if (side !== 'a' && side !== 'b') return fail('Pick a side');
  const prev = u.votes[mid];
  if (prev === side) return ok({});
  if (prev) m.c[prev]--;
  m.c[side]++; u.votes[mid] = side;
  (u.vt = u.vt || {})[mid] = S.now; // when they voted, so the big screen can show the newest names first
  S.dirty.ev = true; S.dirty.live = true; touchUser(S, u);
  return ok({});
}

/* ---------------------------------------------------------------- organiser actions */

export function hostAction(S, a) {
  const r = eventAction(S, a);
  if (r) return r;
  // which category? the one named, else the one the battle / market / beatboxer belongs to, else the one on stage
  let c = a.cat && S.event.cats[a.cat];
  if (!c && a.mid) c = catOfMatch(S, a.mid);
  if (!c && a.id && String(a.a).startsWith('mk.')) c = catOfMarket(S, a.id);
  if (!c && a.id && String(a.a).startsWith('bb.')) c = cats(S).find((x) => x.bbs.some((b) => b.id === a.id));
  return inCat(S, c || S.event.cats[S.event.active], () => catAction(S, a));
}

/** Things that belong to the whole event (the stage, the categories, money, the banner). Returns null for anything else. */
function eventAction(S, a) {
  const E0 = S.event;
  switch (a.a) {
    case 'cat.add': {
      if (E0.order.length >= MAX_CATS) return fail(`That is the limit: ${MAX_CATS} categories`);
      const name = cleanBb(a.name).slice(0, 24);
      if (!name) return fail('Give the category a name');
      if (cats(S).some((c) => c.name.toLowerCase() === name.toLowerCase())) return fail('There is already a category with that name');
      if (!SIZES.includes(+a.size)) return fail('Pick a bracket of 2, 4, 8, 16, 32 or 64');
      const id = 'c' + E0.nextCat++;
      E0.cats[id] = newCategory(E0, { id, name, size: +a.size, art: a.art });
      E0.order.push(id);
      touchMeta(S);
      return ok({ cat: id });
    }
    case 'cat.rename': {
      const c = E0.cats[a.id], name = cleanBb(a.name).slice(0, 24);
      if (!c) return fail('No such category');
      if (!name) return fail('Give the category a name');
      if (cats(S).some((x) => x.id !== c.id && x.name.toLowerCase() === name.toLowerCase())) return fail('There is already a category with that name');
      c.name = name; touchMeta(S);
      return ok({});
    }
    case 'cat.art': {
      const c = E0.cats[a.id];
      if (!c) return fail('No such category');
      if (!ARTS.includes(a.art)) return fail('Pick one of the pictures');
      c.art = a.art; touchMeta(S);
      return ok({});
    }
    case 'cat.rm': {
      const c = E0.cats[a.id];
      if (!c) return fail('No such category');
      if (E0.order.length < 2) return fail('An event needs at least one category');
      if (c.phase !== 'lobby') return fail('A category that has started cannot be removed');
      for (const b of c.bbs) S.dirty.delPhotos.add(b.id);
      delete E0.cats[c.id];
      E0.order = E0.order.filter((x) => x !== c.id);
      if (E0.active === c.id) E0.active = E0.order[0];
      for (const u of S.users.values()) if (u.tops && u.tops[c.id]) { delete u.tops[c.id]; touchUser(S, u); }
      S.ev = E0.cats[E0.active];
      touchMeta(S);
      return ok({});
    }
    case 'cat.stage': {
      if (!E0.cats[a.id]) return fail('No such category');
      if (activeMatch(S) && E0.active !== a.id) return fail('Finish the current battle first');
      E0.active = a.id; touchMeta(S);
      return ok({});
    }
    case 'settings': {
      const v = a.set || {}, c = E0.cats[a.cat || E0.active];
      const all = cats(S);
      if (v.size != null) {
        if (c.phase !== 'lobby') return fail('The bracket size can only change before picks open');
        if (!SIZES.includes(+v.size)) return fail('Pick 2, 4, 8, 16, 32 or 64');
        c.settings.size = +v.size;
      }
      for (const k of ['qualifyBets', 'autoChampion', 'thirdPlace']) if (v[k] != null) c.settings[k] = !!v[k];
      // the rest is shared by every category (one wallet, one set of house rules)
      const shared = {};
      if (v.start != null) { if (all.some((x) => x.phase !== 'lobby') || S.users.size) return fail('The starting Loops are fixed once people join'); shared.start = Math.max(100, Math.min(100000, Math.floor(+v.start) || 1000)); }
      if (v.regOpen != null) shared.regOpen = !!v.regOpen;
      if (v.voteSecs != null) shared.voteSecs = Math.max(0, Math.min(1800, Math.floor(+v.voteSecs) || 0));
      for (const k of ['maxPerDevice', 'maxPerIp']) if (v[k] != null) shared[k] = Math.max(0, Math.min(1000, Math.floor(+v[k]) || 0));
      if (v.minPayout != null) shared.minPayout = Math.max(1, Math.min(3, +v.minPayout || 1.1));
      for (const x of all) Object.assign(x.settings, shared);
      if (v.name != null) E0.name = String(v.name).trim().slice(0, 40) || E0.name;
      touchMeta(S);
      return ok({});
    }
    case 'banner': {
      const t = String(a.text || '').trim().slice(0, 140);
      E0.banner = t ? { id: (E0.banner ? E0.banner.id : 0) + 1, text: t, t: S.now } : null;
      touchMeta(S);
      return ok({});
    }
    case 'grant': {
      const amt = Math.floor(+a.amount);
      if (!Number.isFinite(amt) || amt === 0 || Math.abs(amt) > 100000) return fail('Bad amount');
      const targets = a.key === 'all' ? [...S.users.values()] : [S.users.get(nameKey(a.key))].filter(Boolean);
      if (!targets.length) return fail('Nobody to give it to');
      for (const u of targets) credit(S, u, amt, 'grant', a.text ? String(a.text).slice(0, 60) : amt > 0 ? 'A gift from the organiser' : 'Adjustment by the organiser', '');
      return ok({ n: targets.length });
    }
    case 'user.ban': {
      const u = S.users.get(nameKey(a.key));
      if (!u) return fail('No such player');
      u.banned = !!a.on; S.rankDirty = true; touchUser(S, u); S.dirty.host = true;
      return ok({});
    }
    default: return null;
  }
}

/** Everything that happens inside one category (S.ev points at it). */
function catAction(S, a) {
  const ev = S.ev;
  switch (a.a) {
    case 'bb.add': {
      if (ev.phase === 'bracket' || ev.phase === 'finished') return fail('The bracket is drawn, the lineup is locked');
      const names = (Array.isArray(a.names) ? a.names : [a.name]).map(cleanBb).filter(Boolean).slice(0, 500);
      let n = 0;
      for (const nm of names) {
        if (ev.bbs.length >= MAX_BB) return fail(`That is the limit: ${MAX_BB} beatboxers`);
        const bb = addBb(S, nm, a);
        if (!bb) continue;
        n++;
        if (ev.phase === 'picks' && ev.settings.qualifyBets && ev.bbs.length > ev.settings.size && ev.bbs.length <= QUALIFY_AUTO_MAX) openQualify(S, bb.id);
      }
      touchMeta(S);
      return ok({ added: n });
    }
    case 'bb.edit': {
      const b = bbOf(S, a.id);
      if (!b) return fail('No such beatboxer');
      if (a.name != null) {
        const nm = cleanBb(a.name);
        if (!nm) return fail('Name needed');
        if (ev.bbs.some((x) => x.id !== b.id && x.name.toLowerCase() === nm.toLowerCase())) return fail('That name is already in');
        b.name = nm;
      }
      if (a.tag != null) b.tag = cleanBb(a.tag).slice(0, 24);
      touchMeta(S);
      return ok({});
    }
    case 'bb.rm': {
      const b = bbOf(S, a.id);
      if (!b) return fail('No such beatboxer');
      if (ev.phase === 'bracket' || ev.phase === 'finished') return fail('The bracket is drawn, the lineup is locked');
      if (ev.bbs.length - 1 < ev.settings.size && ev.phase !== 'lobby') return fail(`You need at least ${ev.settings.size} beatboxers`);
      for (const m of marketsList(S)) if (m.kind === 'qualify' && m.bb === b.id) { voidMarket(S, m, null, 'Beatboxer withdrew'); dropMarket(S, m); }
      ev.bbs = ev.bbs.filter((x) => x.id !== b.id);
      S.dirty.delPhotos.add(b.id);
      for (const u of S.users.values()) if (topOf(S, u).includes(b.id)) { u.tops[ev.id] = u.tops[ev.id].filter((x) => x !== b.id); touchUser(S, u); }
      touchMeta(S);
      return ok({});
    }
    case 'phase': return setPhase(S, a.to);
    case 'undo': return undoStep(S);
    case 'seeds': return publishSeeds(S, a.order);
    case 'seeds.revert': return revertSeeds(S);
    case 'walkover': return walkover(S);
    case 'elim.start': return startElimination(S);
    case 'picks.timer': return setPicksTimer(S, a.mins);
    case 'performer': return setPerformer(S, a.id == null ? null : String(a.id));
    case 'step': return stepMatch(S, a.mid, a.to, a.secs, a.later);
    case 'seal': return sealResult(S, a.mid, a.w, a.judges);
    case 'unseal': return unsealResult(S, a.mid);
    case 'reveal': return revealResults(S);
    case 'result': return setResult(S, a.mid, a.w, a.judges);
    case 'reopen': return revertMatch(S, a.mid);
    case 'swap': return swapSides(S, a.mid);
    case 'mk.preset': {
      if (ev.phase !== 'bracket') return fail('Open these once the bracket is drawn');
      if (a.preset === 'champion') {
        const c = openChampion(S);
        if (!c) return fail('Already open');
        return ok({});
      }
      const to = +a.to;
      if (!Number.isInteger(to) || to < 1 || to >= log2(ev.settings.size)) return fail('Bad round');
      if (ev.locked[to - 1]) return fail('That round has already started');
      let n = 0;
      for (const id of ev.seeds) {
        if (ev.out[id] !== undefined || ev.matches.some((x) => x.r === to && (x.a === id || x.b === id))) continue;
        if (Object.values(ev.markets).some((k) => k.kind === 'reach' && k.bb === id && k.to === to && k.st !== 'void')) continue;
        const m = newMarket(S, { kind: 'reach', bb: id, to });
        const w = weight(S, id);
        const yes = Math.round(200 * Math.min(0.9, Math.max(0.1, (w * 2) / (1 + w))));
        m.seed = [yes, 200 - yes];
        n++;
      }
      return n ? ok({ added: n }) : fail('Nothing to add');
    }
    case 'mk.qualify': {
      if (ev.phase !== 'picks') return fail('"Makes the cut" bets open while the picks are open');
      const ids = (a.all ? ev.bbs.map((b) => b.id) : Array.isArray(a.ids) ? a.ids : []).filter((id) => bbOf(S, id) && !qualifyOf(S, id));
      if (!ids.length) return fail('Nothing to add');
      if (ev.bbs.length <= ev.settings.size) return fail('Everybody goes through, there is nothing to bet on');
      for (const id of ids) openQualify(S, id);
      return ok({ added: ids.length });
    }
    case 'mk.lock': case 'mk.open': {
      const m = mkOf(S, a.id);
      if (!m) return fail('No such market');
      if (a.a === 'mk.lock' && m.st === 'open') m.st = 'locked';
      else if (a.a === 'mk.open' && m.st === 'locked') m.st = 'open';
      else return fail('Cannot change that market now');
      touchMk(S, m); S.dirty.meta = true; S.dirty.ev = true;
      return ok({});
    }
    case 'mk.void': {
      const m = mkOf(S, a.id);
      if (!m || m.st === 'settled' || m.st === 'void') return fail('Cannot void that market');
      voidMarket(S, m, null);
      S.dirty.meta = true; S.dirty.ev = true;
      return ok({});
    }
    default: return fail('Unknown action');
  }
}

/* ---------------------------------------------------------------- views for the wire */

/** Everything the audience may see that changes rarely. Pools live in `liveOf` so a bet does not resend all of this. */
function catMeta(S, c) {
  return {
    id: c.id, name: c.name, art: c.art, pfx: c.pfx, phase: c.phase, performed: c.performed || [], performer: c.performer || null, elimOn: !!c.elimOn, picksEnd: c.picksEnd || 0, walkover: !!c.walkover, undo: inCat(S, c, () => undoPlan(S)),
    set: { size: c.settings.size, qualifyBets: c.settings.qualifyBets, autoChampion: c.settings.autoChampion, thirdPlace: c.settings.thirdPlace },
    bbs: c.bbs, seeds: c.seeds, locked: c.locked, out: c.out, champion: c.champion, consensus: c.consensus,
    matches: c.matches.map(({ sealed, ...m }) => ({ ...m, c: m.status === 'closed' || m.status === 'done' ? m.c : null })),
    mk: Object.values(c.markets).sort((a, b) => a.ord - b.ord).map((m) => ({ id: m.id, kind: m.kind, bb: m.bb, mid: m.mid, to: m.to, bbs: m.bbs, seed: m.seed, st: m.st, win: m.win })),
  };
}

export function metaOf(S) {
  const e = S.event, s = e.cats[e.order[0]].settings;
  return {
    rev: e.rev, code: e.code, name: e.name, banner: e.banner, active: e.active,
    set: { start: s.start, minPayout: s.minPayout, pts: s.pts, regOpen: s.regOpen, maxPerDevice: s.maxPerDevice, maxPerIp: s.maxPerIp, voteSecs: s.voteSecs },
    cats: cats(S).map((c) => catMeta(S, c)),
  };
}

/** The fast-moving numbers: stakes per side and head counts, plus (for the organiser) the live vote. */
export function liveOf(S, online, host) {
  const mk = {};
  for (const c of cats(S)) for (const m of Object.values(c.markets)) if (m.st !== 'void') mk[m.id] = [m.pool, m.cnt];
  const out = { n: S.users.size, on: online, mk };
  for (const c of cats(S)) {
    if (c.performer) (out.perf = out.perf || {})[c.id] = inCat(S, c, () => performerStats(S, c.performer));
    // the judges are scoring: the big screen cycles through facts about what the hall predicted (worked out once, at the lock-in)
    if (c.phase === 'elimination') {
      if (!c.consensusAll) c.consensusAll = inCat(S, c, () => consensus(S, true)); // an event locked before this existed
      let staked = 0;
      for (const m of Object.values(c.markets)) if (m.kind === 'qualify' && m.st !== 'void') staked += m.pool[0] + m.pool[1];
      (out.cons = out.cons || {})[c.id] = { N: c.settings.size, voters: c.consensusAll.voters, rows: c.consensusAll.rows, staked };
    }
    // between battles the big screen cycles through what the hall predicted for the bracket: picks per battle and for the title
    if ((c.phase === 'bracket' || c.phase === 'finished') && !out.spot) out.spot = spotOf(S);
    if (c.phase === 'bracket' || c.phase === 'finished') {
      const ms = c.matches.filter((x) => !x.third && x.a && x.b), fin = c.matches.find((x) => !x.third && x.r === log2(c.settings.size) - 1);
      const pk = {}, champ = {};
      for (const m of ms) pk[m.id] = [0, 0];
      for (const u of S.users.values()) {
        for (const m of ms) { const p = u.picks[m.id]; if (p === m.a) pk[m.id][0]++; else if (p === m.b) pk[m.id][1]++; }
        const w = fin && u.picks[fin.id];
        if (w) champ[w] = (champ[w] || 0) + 1;
      }
      (out.pk = out.pk || {})[c.id] = { pk, champ };
    }
    // the elimination round is on and predictions are open: the big screen shows how the hall's Top N is shaping up
    if (c.phase === 'picks' && c.elimOn) (out.cons = out.cons || {})[c.id] = inCat(S, c, () => {
      const cs = consensus(S), N = S.ev.settings.size;
      let staked = 0;
      for (const m of Object.values(c.markets)) if (m.kind === 'qualify' && m.st !== 'void') staked += m.pool[0] + m.pool[1];
      return { N, voters: cs.voters, rows: cs.rows.slice(0, 16), staked };
    });
  }
  if (host) {
    // the organiser and the big screen: the running vote, who has voted (newest first), and who has just joined
    const cur = activeMatch(S);
    if (cur) {
      out.v = { id: cur.id, a: cur.c.a, b: cur.c.b };
      if (cur.status === 'voting') out.vn = [...S.users.values()].filter((u) => u.votes[cur.id]).sort((a, b) => ((b.vt && b.vt[cur.id]) || 0) - ((a.vt && a.vt[cur.id]) || 0)).slice(0, 60).map((u) => [u.name, u.votes[cur.id]]);
    }
    if (cats(S).some((c) => c.phase === 'lobby' || c.phase === 'picks')) out.jn = [...S.users.values()].filter((u) => !u.banned).sort((a, b) => b.joined - a.joined).slice(0, 40).map((u) => u.name);
  }
  return out;
}

export function meOf(S, u) {
  const rank = rankOf(S, u);
  return {
    name: u.name, bal: u.bal, staked: staked(S, u), net: netWorth(S, u), rank: rank.rank, of: rank.of,
    streak: voteStreak(S, u), tops: u.tops || {}, picks: u.picks, bets: u.bets, votes: u.votes, st: u.st, log: u.log.slice(-25), banned: u.banned,
  };
}

/** Players worth a spotlight on the big screen: who is on a streak, who calls the battles best, who won big, who is riding the most. */
export function spotOf(S) {
  const list = [...S.users.values()].filter((u) => !u.banned);
  const best = (score) => { let b = null, bs = 0; for (const u of list) { const s = score(u); if (s > bs) { bs = s; b = u; } } return b ? { n: b.name, v: bs } : null; };
  const out = [];
  const add = (k, r, min = 1) => { if (r && r.v >= min) out.push({ k, ...r }); };
  add('streak', best((u) => voteStreak(S, u)), 2);
  add('caller', best((u) => u.st.hits || 0));
  add('win', best((u) => u.log.reduce((m, l) => (l.k === 'win' && l.d > m ? l.d : m), 0)), 50);
  add('roller', best((u) => staked(S, u)), 50);
  add('ear', best((u) => u.st.sync || 0));
  return out;
}

/** Everybody's rank, computed once per change in money rather than once per player per push. */
function ranking(S) {
  if (!S.rank || S.rankDirty || S.rank.n !== S.users.size) {
    const rows = [...S.users.values()].filter((u) => !u.banned)
      .map((u) => ({ n: u.name, key: u.key, net: netWorth(S, u), pred: u.st.pred || 0, won: u.st.won || 0, lost: u.st.lost || 0 }))
      .sort((a, b) => b.net - a.net || a.n.localeCompare(b.n));
    const at = new Map(rows.map((r, i) => [r.key, i + 1]));
    S.rank = { rows, at, of: rows.length, n: S.users.size };
    S.rankDirty = false;
  }
  return S.rank;
}

export function boardOf(S) {
  S.rankDirty = true; // the board is the moment to be exact
  return ranking(S).rows.slice(0, 50).map(({ key, ...r }, i) => ({ ...r, rank: i + 1 }));
}

export function rankOf(S, u) {
  const r = ranking(S);
  return { rank: r.at.get(u.key) || r.of + 1, of: r.of };
}

/** The three biggest winners of a settlement, for the live feed. */
export function bigWins(S, ref, min = 100) {
  const lg = S.ledger.get(ref);
  if (!lg) return [];
  return Object.entries(lg.u).map(([k, e]) => ({ k, d: e.bal })).filter((x) => x.d >= min).sort((a, b) => b.d - a.d).slice(0, 3)
    .map((x) => ({ n: (S.users.get(x.k) || { name: x.k }).name, d: x.d }));
}

/** Organiser dashboard numbers. */
export function hostOf(S) {
  const users = [...S.users.values()];
  const tops = {}, consensusBy = {};
  let volume = 0;
  for (const c of cats(S)) {
    tops[c.id] = users.filter((u) => u.tops && u.tops[c.id] && u.tops[c.id].length).length;
    consensusBy[c.id] = inCat(S, c, () => consensus(S));
    volume += Object.values(c.markets).reduce((a, m) => a + m.pool.reduce((x, y) => x + y, 0), 0);
  }
  // battles that have been voted on and wait for the judges: the organiser sees the audience's numbers, nobody else does
  const wait = [];
  for (const c of cats(S)) for (const m of c.matches) if (m.status === 'awaiting') wait.push({ cat: c.id, mid: m.id, a: m.c.a, b: m.c.b, sealed: m.sealed || null });
  return {
    wait,
    users: users.slice(0, 600).map((u) => ({ n: u.name, bal: u.bal, net: netWorth(S, u), banned: u.banned,
      tops: Object.values(u.tops || {}).filter((t) => t.length).length,
      picks: Object.keys(u.picks).length, votes: Object.keys(u.votes).length, joined: u.joined })),
    total: users.length, tops, consensus: consensusBy, volume,
  };
}

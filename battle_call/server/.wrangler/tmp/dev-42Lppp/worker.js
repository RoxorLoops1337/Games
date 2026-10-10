var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../js/shared.js
var SIZES = [4, 8, 16, 32];
var DEFAULTS = {
  size: 16,
  // how many beatboxers go through to the bracket
  start: 1e3,
  // Loops everybody starts with
  minPayout: 1.1,
  // a winning bet always pays at least stake x this (the house tops it up)
  maxPerDevice: 2,
  // accounts per phone/browser
  maxPerIp: 500,
  // accounts per network address (a whole hall shares one wifi address!), 0 = off
  regOpen: true,
  qualifyBets: true,
  // "Will X make the cut?" bets while picks are open
  autoChampion: true,
  // open the "Who wins the whole battle?" market when the bracket is drawn
  pts: { topIn: 20, topExact: 40, topNear: 15, pick: 25, vote: 10, sync: 15, tip: 50 }
};
var MIN_BET = 10;
var nameKey = /* @__PURE__ */ __name((n) => String(n || "").trim().toLowerCase().replace(/\s+/g, " "), "nameKey");
var cleanName = /* @__PURE__ */ __name((n) => String(n || "").replace(/[^\p{L}\p{N} _.'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 18), "cleanName");
var cleanBb = /* @__PURE__ */ __name((n) => String(n || "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 28), "cleanBb");
var log2 = /* @__PURE__ */ __name((n) => Math.round(Math.log2(n)), "log2");
function seedOrder(n) {
  let o = [1, 2];
  while (o.length < n) {
    const m = o.length * 2 + 1;
    o = o.flatMap((s) => [s, m - s]);
  }
  return o.slice(0, n);
}
__name(seedOrder, "seedOrder");
function roundInfo(size, r) {
  const rounds = log2(size);
  const p = size >> r;
  const short = p === 2 ? "Final" : `Top ${p}`;
  const long = p === 2 ? "Final" : p === 4 ? "Semi-finals" : p === 8 ? "Quarter-finals" : `Round of ${p}`;
  return { r, p, short, long, count: size >> r + 1, last: r === rounds - 1 };
}
__name(roundInfo, "roundInfo");
var matchId = /* @__PURE__ */ __name((r, i) => `r${r}m${i}`, "matchId");
function buildMatches(size) {
  const order = seedOrder(size), out = [];
  for (let r = 0; r < log2(size); r++) {
    for (let i = 0; i < size >> r + 1; i++) {
      out.push({
        id: matchId(r, i),
        r,
        i,
        seeds: r === 0 ? [order[2 * i], order[2 * i + 1]] : null,
        feed: r === 0 ? null : [matchId(r - 1, 2 * i), matchId(r - 1, 2 * i + 1)],
        a: null,
        b: null,
        status: "wait",
        w: null,
        swap: false,
        judges: null,
        c: { a: 0, b: 0 }
      });
    }
  }
  return out;
}
__name(buildMatches, "buildMatches");
var winnerOf = /* @__PURE__ */ __name((m) => m.w === "a" ? m.a : m.w === "b" ? m.b : null, "winnerOf");
var loserOf = /* @__PURE__ */ __name((m) => m.w === "a" ? m.b : m.w === "b" ? m.a : null, "loserOf");
function slotsFor(matches, picks, m) {
  const by = Object.fromEntries(matches.map((x) => [x.id, x]));
  if (!m.feed) return [m.a, m.b];
  return [
    m.a || (picks[m.feed[0]] && by[m.feed[0]].status !== "done" ? picks[m.feed[0]] : null),
    m.b || (picks[m.feed[1]] && by[m.feed[1]].status !== "done" ? picks[m.feed[1]] : null)
  ];
}
__name(slotsFor, "slotsFor");
function cleanPicks(matches, picks) {
  const sorted = [...matches].sort((x, y) => x.r - y.r);
  for (const m of sorted) {
    const p = picks[m.id];
    if (!p) continue;
    const s = slotsFor(matches, picks, m);
    if (m.status === "done" && !s.includes(p)) continue;
    if (!s.includes(p)) delete picks[m.id];
  }
  return picks;
}
__name(cleanPicks, "cleanPicks");
var poolTotal = /* @__PURE__ */ __name((m) => m.seed.reduce((a, b) => a + b, 0) + m.pool.reduce((a, b) => a + b, 0), "poolTotal");
var sidePool = /* @__PURE__ */ __name((m, i) => m.seed[i] + m.pool[i], "sidePool");
function multiplier(m, i, minPayout = 1) {
  const s = sidePool(m, i);
  return s > 0 ? Math.max(minPayout, poolTotal(m) / s) : minPayout;
}
__name(multiplier, "multiplier");
var payoutFor = /* @__PURE__ */ __name((m, i, stake, minPayout) => Math.floor(stake * multiplier(m, i, minPayout)), "payoutFor");

// ../engine.js
var ok = /* @__PURE__ */ __name((x) => ({ ok: true, ...x }), "ok");
var fail = /* @__PURE__ */ __name((err2) => ({ ok: false, err: err2 }), "fail");
function newEvent({ code, name, size = DEFAULTS.size, now = 0 }) {
  if (!SIZES.includes(size)) size = DEFAULTS.size;
  return {
    v: 1,
    code,
    name: String(name || "Beatbox Battle").trim().slice(0, 40) || "Beatbox Battle",
    created: now,
    phase: "lobby",
    settings: { ...DEFAULTS, pts: { ...DEFAULTS.pts }, size },
    bbs: [],
    nextBb: 1,
    seeds: null,
    matches: [],
    locked: [],
    out: {},
    champion: null,
    markets: {},
    nextMk: 1,
    banner: null,
    consensus: null,
    rev: 1
  };
}
__name(newEvent, "newEvent");
function newState(ev) {
  return { ev, users: /* @__PURE__ */ new Map(), ledger: /* @__PURE__ */ new Map(), now: 0, dirty: blankDirty() };
}
__name(newState, "newState");
function blankDirty() {
  return {
    ev: false,
    meta: false,
    live: false,
    board: false,
    host: false,
    users: /* @__PURE__ */ new Set(),
    mk: /* @__PURE__ */ new Set(),
    delMk: /* @__PURE__ */ new Set(),
    delUsers: /* @__PURE__ */ new Set(),
    lg: /* @__PURE__ */ new Set(),
    photos: /* @__PURE__ */ new Set(),
    delPhotos: /* @__PURE__ */ new Set()
  };
}
__name(blankDirty, "blankDirty");
var touchMeta = /* @__PURE__ */ __name((S) => {
  S.dirty.meta = true;
  S.dirty.ev = true;
  S.dirty.live = true;
}, "touchMeta");
var touchUser = /* @__PURE__ */ __name((S, u) => {
  S.dirty.users.add(u.key);
  S.dirty.board = true;
}, "touchUser");
var touchMk = /* @__PURE__ */ __name((S, m) => {
  S.dirty.mk.add(m.id);
  S.dirty.live = true;
}, "touchMk");
function newUser(S, { name, device = "", ipH = "" }) {
  const set = S.ev.settings;
  return {
    key: nameKey(name),
    name,
    bal: set.start,
    joined: S.now,
    device,
    ipH,
    top: [],
    picks: {},
    bets: {},
    votes: {},
    st: { pred: 0, won: 0, lost: 0, votes: 0, sync: 0, hits: 0, bets: 0 },
    log: [],
    seq: 0,
    banned: false,
    pw: null,
    tk: []
  };
}
__name(newUser, "newUser");
function canRegister(S, { name, device, ipH }) {
  const set = S.ev.settings;
  if (!set.regOpen) return fail("Sign-ups are closed for this event");
  const nm = cleanName(name);
  if (nm.length < 2) return fail("Pick a nickname with at least 2 characters");
  if (S.users.has(nameKey(nm))) return fail("That nickname is taken");
  if (device && set.maxPerDevice && [...S.users.values()].filter((u) => u.device === device).length >= set.maxPerDevice)
    return fail("This phone already has an account. Log in instead");
  if (ipH && set.maxPerIp && [...S.users.values()].filter((u) => u.ipH === ipH).length >= set.maxPerIp)
    return fail("Too many accounts from this network");
  return ok({ name: nm });
}
__name(canRegister, "canRegister");
function addUser(S, u) {
  S.users.set(u.key, u);
  touchUser(S, u);
  S.dirty.host = true;
  S.dirty.live = true;
  return u;
}
__name(addUser, "addUser");
var bbOf = /* @__PURE__ */ __name((S, id) => S.ev.bbs.find((b) => b.id === id), "bbOf");
var bbName = /* @__PURE__ */ __name((S, id) => bbOf(S, id) ? bbOf(S, id).name : "?", "bbName");
var matchOf = /* @__PURE__ */ __name((S, id) => S.ev.matches.find((m) => m.id === id), "matchOf");
var mkOf = /* @__PURE__ */ __name((S, id) => S.ev.markets[id], "mkOf");
var seedNo = /* @__PURE__ */ __name((S, id) => S.ev.seeds ? S.ev.seeds.indexOf(id) + 1 : 0, "seedNo");
var marketsList = /* @__PURE__ */ __name((S) => Object.values(S.ev.markets).sort((a, b) => a.ord - b.ord), "marketsList");
function pushLog(S, u, kind, d, x, ref) {
  u.log.push({ i: ++u.seq, t: S.now, k: kind, d, x, r: ref || "" });
  if (u.log.length > 40) u.log.splice(0, u.log.length - 40);
}
__name(pushLog, "pushLog");
function ledgerOf(S, ref) {
  let lg = S.ledger.get(ref);
  if (!lg) {
    lg = { ref, u: {}, mk: [], made: [], extra: {} };
    S.ledger.set(ref, lg);
  }
  S.dirty.lg.add(ref);
  return lg;
}
__name(ledgerOf, "ledgerOf");
function credit(S, u, amt, kind, text, ref, stats) {
  u.bal += amt;
  if (stats) for (const k of Object.keys(stats)) u.st[k] = (u.st[k] || 0) + stats[k];
  if (amt || text) pushLog(S, u, kind, amt, text, ref);
  if (ref) {
    const lg = ledgerOf(S, ref), e = lg.u[u.key] = lg.u[u.key] || { bal: 0, st: {} };
    e.bal += amt;
    if (stats) for (const k of Object.keys(stats)) e.st[k] = (e.st[k] || 0) + stats[k];
  }
  touchUser(S, u);
}
__name(credit, "credit");
function staked(S, u) {
  let s = 0;
  for (const [mid, b] of Object.entries(u.bets)) {
    const m = mkOf(S, mid);
    if (m && (m.st === "open" || m.st === "locked")) s += b[1];
  }
  return s;
}
__name(staked, "staked");
var netWorth = /* @__PURE__ */ __name((S, u) => u.bal + staked(S, u), "netWorth");
function addBb(S, name, extra = {}) {
  const nm = cleanBb(name);
  if (!nm) return null;
  if (S.ev.bbs.some((b) => b.name.toLowerCase() === nm.toLowerCase())) return null;
  const bb = { id: "b" + S.ev.nextBb++, name: nm, tag: cleanBb(extra.tag || "").slice(0, 24), ph: 0 };
  S.ev.bbs.push(bb);
  return bb;
}
__name(addBb, "addBb");
function newMarket(S, fields) {
  const n = fields.bbs ? fields.bbs.length : 2;
  const m = {
    id: "k" + S.ev.nextMk++,
    ord: S.ev.nextMk,
    st: "open",
    win: null,
    pool: Array(n).fill(0),
    cnt: Array(n).fill(0),
    seed: Array(n).fill(0),
    ...fields
  };
  S.ev.markets[m.id] = m;
  touchMk(S, m);
  S.dirty.meta = true;
  S.dirty.ev = true;
  return m;
}
__name(newMarket, "newMarket");
var weight = /* @__PURE__ */ __name((S, id) => 1 / Math.sqrt(Math.max(1, seedNo(S, id)) || 1), "weight");
function seedPools(S, m) {
  const total = m.kind === "champion" ? 400 : 200;
  if (m.kind === "match" || m.kind === "champion") {
    const w = m.bbs.map((id) => weight(S, id)), sum = w.reduce((a, b) => a + b, 0);
    m.seed = w.map((x) => Math.max(8, Math.round(total * x / sum)));
  } else {
    const E = Math.max(1, S.ev.bbs.length);
    const p = m.kind === "qualify" ? Math.min(0.9, Math.max(0.1, S.ev.settings.size / E)) : 0.5;
    const yes = Math.round(total * p);
    m.seed = [yes, total - yes];
  }
}
__name(seedPools, "seedPools");
function openQualify(S, bb) {
  const m = newMarket(S, { kind: "qualify", bb });
  seedPools(S, m);
  return m;
}
__name(openQualify, "openQualify");
function openMatchMarket(S, mt) {
  if (Object.values(S.ev.markets).some((m2) => m2.kind === "match" && m2.mid === mt.id && m2.st !== "void")) return null;
  const m = newMarket(S, { kind: "match", mid: mt.id, bbs: [mt.a, mt.b] });
  seedPools(S, m);
  return m;
}
__name(openMatchMarket, "openMatchMarket");
function openChampion(S) {
  if (Object.values(S.ev.markets).some((m2) => m2.kind === "champion" && m2.st !== "void")) return null;
  const m = newMarket(S, { kind: "champion", bbs: [...S.ev.seeds] });
  seedPools(S, m);
  return m;
}
__name(openChampion, "openChampion");
var isDead = /* @__PURE__ */ __name((S, m, i) => {
  if (m.kind === "champion") return S.ev.out[m.bbs[i]] !== void 0;
  return false;
}, "isDead");
function settleMarket(S, m, win, ref) {
  const lg = ledgerOf(S, ref);
  lg.mk.push([m.id, m.st]);
  m.st = "settled";
  m.win = win;
  touchMk(S, m);
  const minP = S.ev.settings.minPayout;
  for (const u of S.users.values()) {
    const b = u.bets[m.id];
    if (!b) continue;
    if (b[0] === win) {
      const pay = payoutFor(m, win, b[1], minP);
      b[2] = pay;
      credit(S, u, pay, "win", `Won ${pay - b[1]} on ${marketTitle(S, m)}`, ref, { won: 1 });
    } else {
      b[2] = 0;
      pushLog(S, u, "loss", -b[1], `Lost on ${marketTitle(S, m)}`, ref);
      u.st.lost = (u.st.lost || 0) + 1;
      const e = lg.u[u.key] = lg.u[u.key] || { bal: 0, st: {} };
      e.st.lost = (e.st.lost || 0) + 1;
      touchUser(S, u);
    }
  }
}
__name(settleMarket, "settleMarket");
function voidMarket(S, m, ref, why = "Bet cancelled") {
  m.st = "void";
  touchMk(S, m);
  for (const u of S.users.values()) {
    const b = u.bets[m.id];
    if (!b) continue;
    b[2] = b[1];
    credit(S, u, b[1], "refund", `${why}: ${marketTitle(S, m)} (stake back)`, ref);
  }
}
__name(voidMarket, "voidMarket");
function dropMarket(S, m) {
  delete S.ev.markets[m.id];
  S.dirty.delMk.add(m.id);
  S.dirty.mk.delete(m.id);
  S.dirty.meta = true;
  S.dirty.ev = true;
  S.dirty.live = true;
  for (const u of S.users.values()) if (u.bets[m.id]) {
    delete u.bets[m.id];
    touchUser(S, u);
  }
}
__name(dropMarket, "dropMarket");
function marketTitle(S, m) {
  if (m.kind === "qualify") return `${bbName(S, m.bb)} makes the Top ${S.ev.settings.size}`;
  if (m.kind === "reach") return `${bbName(S, m.bb)} reaches the ${roundInfo(S.ev.settings.size, m.to).short}`;
  if (m.kind === "match") return `${bbName(S, m.bbs[0])} vs ${bbName(S, m.bbs[1])}`;
  return "Battle champion";
}
__name(marketTitle, "marketTitle");
var NEXT_PHASE = { lobby: ["picks", "elimination"], picks: ["elimination"], elimination: ["picks"] };
function setPhase(S, to) {
  const ev = S.ev, from = ev.phase;
  if (!(NEXT_PHASE[from] || []).includes(to)) return fail(`Cannot go from ${from} to ${to}`);
  if (ev.bbs.length < ev.settings.size) return fail(`Add at least ${ev.settings.size} beatboxers first (or lower the bracket size)`);
  if (to === "picks") {
    ev.phase = "picks";
    if (from === "elimination") {
      for (const m of marketsList(S)) if (m.kind === "qualify" && m.st === "locked") {
        m.st = "open";
        touchMk(S, m);
      }
      ev.consensus = null;
    } else if (ev.settings.qualifyBets && ev.bbs.length > ev.settings.size) {
      for (const b of ev.bbs) if (!qualifyOf(S, b.id)) openQualify(S, b.id);
    }
  } else {
    ev.phase = "elimination";
    for (const m of marketsList(S)) if (m.kind === "qualify" && m.st === "open") {
      m.st = "locked";
      touchMk(S, m);
    }
    ev.consensus = consensus(S);
  }
  touchMeta(S);
  return ok({});
}
__name(setPhase, "setPhase");
var qualifyOf = /* @__PURE__ */ __name((S, bb) => Object.values(S.ev.markets).find((m) => m.kind === "qualify" && m.bb === bb && m.st !== "void"), "qualifyOf");
function consensus(S) {
  const N = S.ev.settings.size, acc = /* @__PURE__ */ new Map();
  let voters = 0;
  for (const u of S.users.values()) {
    if (!u.top.length) continue;
    voters++;
    u.top.forEach((id, i) => {
      const a = acc.get(id) || { id, n: 0, pts: 0, sum: 0 };
      a.n++;
      a.pts += N - i;
      a.sum += i + 1;
      acc.set(id, a);
    });
  }
  const rows = [...acc.values()].sort((a, b) => b.pts - a.pts || a.sum / a.n - b.sum / b.n).slice(0, N).map((a) => ({ id: a.id, n: a.n, avg: Math.round(a.sum / a.n * 10) / 10 }));
  return { voters, rows };
}
__name(consensus, "consensus");
function publishSeeds(S, order) {
  const ev = S.ev, N = ev.settings.size;
  if (ev.phase !== "elimination") return fail("Publish the ranking while the elimination is on");
  if (!Array.isArray(order) || order.length !== N) return fail(`Pick exactly ${N} beatboxers`);
  if (new Set(order).size !== N || order.some((id) => !bbOf(S, id))) return fail("Every beatboxer can only appear once");
  const ref = "seeds", lg = ledgerOf(S, ref);
  lg.extra = { phaseBefore: "elimination" };
  ev.seeds = [...order];
  ev.matches = buildMatches(N);
  ev.locked = Array(log2(N)).fill(false);
  ev.out = {};
  ev.champion = null;
  for (const m of ev.matches.filter((x) => x.r === 0)) {
    m.a = order[m.seeds[0] - 1];
    m.b = order[m.seeds[1] - 1];
    m.status = "upcoming";
  }
  const P = ev.settings.pts;
  for (const u of S.users.values()) {
    if (!u.top.length) continue;
    let tot = 0, hits = 0;
    u.top.forEach((id, i) => {
      const at = order.indexOf(id);
      if (at < 0) return;
      hits++;
      tot += P.topIn + (at === i ? P.topExact : Math.abs(at - i) === 1 ? P.topNear : 0);
    });
    if (tot) credit(S, u, tot, "pred", `Top ${N} call: ${hits} of ${u.top.length} made it, +${tot}`, ref, { pred: tot, hits });
  }
  for (const m of marketsList(S)) {
    if (m.kind === "qualify" && (m.st === "locked" || m.st === "open")) settleMarket(S, m, order.includes(m.bb) ? 0 : 1, ref);
  }
  for (const m of ev.matches.filter((x) => x.r === 0)) lg.made.push(openMatchMarket(S, m).id);
  if (ev.settings.autoChampion) {
    const c = openChampion(S);
    if (c) lg.made.push(c.id);
  }
  ev.phase = "bracket";
  touchMeta(S);
  S.dirty.board = true;
  return ok({});
}
__name(publishSeeds, "publishSeeds");
function revertSeeds(S) {
  const ev = S.ev;
  if (ev.phase !== "bracket") return fail("There is no ranking to take back");
  if (ev.matches.some((m) => m.status !== "upcoming" && m.status !== "wait")) return fail("A battle has already started");
  const lg = S.ledger.get("seeds");
  for (const id of lg ? lg.made : []) {
    const m = mkOf(S, id);
    if (m) {
      voidMarket(S, m, null);
      dropMarket(S, m);
    }
  }
  for (const m of marketsList(S)) if (m.kind === "reach") {
    voidMarket(S, m, null);
    dropMarket(S, m);
  }
  applyLedgerBack(S, "seeds");
  for (const u of S.users.values()) if (Object.keys(u.picks).length) {
    u.picks = {};
    touchUser(S, u);
  }
  ev.seeds = null;
  ev.matches = [];
  ev.locked = [];
  ev.out = {};
  ev.champion = null;
  ev.phase = "elimination";
  touchMeta(S);
  return ok({});
}
__name(revertSeeds, "revertSeeds");
function applyLedgerBack(S, ref) {
  const lg = S.ledger.get(ref);
  if (!lg) return;
  for (const [key, e] of Object.entries(lg.u)) {
    const u = S.users.get(key);
    if (!u) continue;
    u.bal -= e.bal;
    for (const k of Object.keys(e.st)) u.st[k] = (u.st[k] || 0) - e.st[k];
    u.log = u.log.filter((l) => l.r !== ref);
    if (e.bal) pushLog(S, u, "fix", -e.bal, "The organiser corrected a result", "");
    touchUser(S, u);
  }
  for (const [id, was] of lg.mk) {
    const m = mkOf(S, id);
    if (!m) continue;
    m.st = was;
    m.win = null;
    touchMk(S, m);
    for (const u of S.users.values()) if (u.bets[id]) u.bets[id][2] = null;
  }
  S.ledger.delete(ref);
  S.dirty.lg.add(ref);
}
__name(applyLedgerBack, "applyLedgerBack");
function lockRound(S, r) {
  const ev = S.ev;
  if (ev.locked[r]) return;
  ev.locked[r] = true;
  for (const m of marketsList(S)) if (m.kind === "reach" && m.to - 1 === r && m.st === "open") {
    m.st = "locked";
    touchMk(S, m);
  }
}
__name(lockRound, "lockRound");
var activeMatch = /* @__PURE__ */ __name((S) => S.ev.matches.find((m) => m.status === "live" || m.status === "voting" || m.status === "closed"), "activeMatch");
function stepMatch(S, mid, to) {
  const ev = S.ev, m = matchOf(S, mid);
  if (ev.phase !== "bracket") return fail("The bracket is not running");
  if (!m) return fail("No such battle");
  const ALLOWED = { live: ["upcoming"], voting: ["live", "closed"], closed: ["voting"], upcoming: ["live"] };
  if (!(ALLOWED[to] || []).includes(m.status)) return fail(`A ${m.status} battle cannot go to ${to}`);
  if (to === "live") {
    const other = activeMatch(S);
    if (other && other.id !== mid) return fail("Finish the current battle first");
    lockRound(S, m.r);
    for (const k of marketsList(S)) if (k.kind === "match" && k.mid === mid && k.st === "open") {
      k.st = "locked";
      touchMk(S, k);
    }
  }
  m.status = to;
  touchMeta(S);
  return ok({});
}
__name(stepMatch, "stepMatch");
function swapSides(S, mid) {
  const m = matchOf(S, mid);
  if (!m) return fail("No such battle");
  if (m.status !== "upcoming") return fail("Only before the battle starts");
  m.swap = !m.swap;
  touchMeta(S);
  return ok({});
}
__name(swapSides, "swapSides");
function setResult(S, mid, w, judges) {
  const ev = S.ev, m = matchOf(S, mid), P = ev.settings.pts;
  if (ev.phase !== "bracket") return fail("The bracket is not running");
  if (!m) return fail("No such battle");
  if (m.status === "wait" || m.status === "done") return fail("That battle cannot get a result now");
  if (w !== "a" && w !== "b") return fail("Pick a winner");
  const other = activeMatch(S);
  if (other && other.id !== mid) return fail("Finish the current battle first");
  const ref = "m:" + mid, lg = ledgerOf(S, ref);
  lg.extra = { was: m.status };
  lockRound(S, m.r);
  m.w = w;
  m.status = "done";
  if (judges && Number.isInteger(judges.a) && Number.isInteger(judges.b)) m.judges = { a: Math.max(0, judges.a | 0), b: Math.max(0, judges.b | 0) };
  const win = winnerOf(m), lose = loserOf(m);
  ev.out[lose] = m.r;
  for (const k of marketsList(S)) if (k.kind === "match" && k.mid === mid && (k.st === "open" || k.st === "locked")) settleMarket(S, k, w === "a" ? 0 : 1, ref);
  const worth = P.pick * 2 ** m.r;
  for (const u of S.users.values()) {
    if (u.picks[mid] === win) credit(S, u, worth, "pred", `Called ${bbName(S, win)} to win: +${worth}`, ref, { pred: worth, hits: 1 });
    const v = u.votes[mid];
    if (v) {
      const synced = v === w;
      credit(
        S,
        u,
        P.vote + (synced ? P.sync : 0),
        "vote",
        synced ? `Your vote matched the judges: +${P.vote + P.sync}` : `Thanks for voting: +${P.vote}`,
        ref,
        { votes: 1, sync: synced ? 1 : 0 }
      );
    }
  }
  if (m.r + 1 < log2(ev.settings.size)) {
    const nx = ev.matches.find((x) => x.r === m.r + 1 && x.i === m.i >> 1);
    nx[m.i % 2 === 0 ? "a" : "b"] = win;
    if (nx.a && nx.b) {
      nx.status = "upcoming";
      lg.made.push(openMatchMarket(S, nx).id);
    }
  } else {
    ev.champion = win;
    ev.phase = "finished";
    for (const k of marketsList(S)) if (k.kind === "champion" && k.st !== "settled" && k.st !== "void") settleMarket(S, k, k.bbs.indexOf(win), ref);
  }
  settleReaches(S, ref);
  if (ev.matches.filter((x) => x.r === m.r).every((x) => x.status === "done")) roundTips(S, m.r);
  touchMeta(S);
  S.dirty.board = true;
  S.dirty.host = true;
  return ok({ winner: win });
}
__name(setResult, "setResult");
function settleReaches(S, ref) {
  for (const k of marketsList(S)) {
    if (k.kind !== "reach" || k.st === "settled" || k.st === "void") continue;
    const inRound = S.ev.matches.some((m) => m.r === k.to && (m.a === k.bb || m.b === k.bb));
    const out = S.ev.out[k.bb] !== void 0 && S.ev.out[k.bb] < k.to;
    if (inRound) settleMarket(S, k, 0, ref);
    else if (out) settleMarket(S, k, 1, ref);
  }
}
__name(settleReaches, "settleReaches");
function roundTips(S, r) {
  const tip = S.ev.settings.pts.tip;
  if (!tip) return;
  for (const u of S.users.values()) {
    if (netWorth(S, u) < tip) credit(S, u, tip - Math.max(0, netWorth(S, u)), "tip", "Busking tip from the crowd", "tip:" + r);
  }
}
__name(roundTips, "roundTips");
function revertMatch(S, mid) {
  const ev = S.ev, m = matchOf(S, mid);
  if (!m || m.status !== "done") return fail("That battle has no result to take back");
  const nx = m.r + 1 < log2(ev.settings.size) ? ev.matches.find((x) => x.r === m.r + 1 && x.i === m.i >> 1) : null;
  if (nx && nx.status !== "upcoming" && nx.status !== "wait") return fail("The next battle has already started");
  const lg = S.ledger.get("m:" + mid);
  for (const id of lg ? lg.made : []) {
    const k = mkOf(S, id);
    if (k) {
      voidMarket(S, k, null, "Result changed");
      dropMarket(S, k);
    }
  }
  applyLedgerBack(S, "m:" + mid);
  if (nx) {
    nx[m.i % 2 === 0 ? "a" : "b"] = null;
    nx.status = "wait";
  }
  if (ev.phase === "finished") {
    ev.phase = "bracket";
    ev.champion = null;
  }
  delete ev.out[loserOf(m)];
  m.w = null;
  m.judges = null;
  m.status = "closed";
  touchMeta(S);
  S.dirty.board = true;
  return ok({});
}
__name(revertMatch, "revertMatch");
function setTop(S, u, order) {
  if (S.ev.phase !== "picks") return fail("Top picks are closed");
  if (!Array.isArray(order)) return fail("Bad ranking");
  const ids = order.slice(0, S.ev.settings.size);
  if (new Set(ids).size !== ids.length || ids.some((id) => !bbOf(S, id))) return fail("Bad ranking");
  u.top = ids;
  touchUser(S, u);
  S.dirty.host = true;
  return ok({});
}
__name(setTop, "setTop");
function setPick(S, u, mid, bb) {
  const ev = S.ev, m = matchOf(S, mid);
  if (ev.phase !== "bracket" || !m) return fail("Picks are not open");
  if (ev.locked[m.r] || m.status === "done") return fail("This round is locked");
  if (bb) {
    if (!slotsFor(ev.matches, u.picks, m).includes(bb)) return fail("They are not in that battle (yet)");
    u.picks[mid] = bb;
  } else delete u.picks[mid];
  cleanPicks(ev.matches, u.picks);
  touchUser(S, u);
  return ok({});
}
__name(setPick, "setPick");
function setBet(S, u, mid, opt, amt) {
  const m = mkOf(S, mid);
  if (!m || m.st !== "open") return fail("Betting is closed on that one");
  amt = Math.floor(+amt);
  if (!Number.isFinite(amt) || amt < 0) return fail("Bad amount");
  if (!Number.isInteger(opt) || opt < 0 || opt >= m.pool.length) return fail("Bad choice");
  if (amt > 0 && amt < MIN_BET) return fail(`The minimum bet is ${MIN_BET}`);
  if (amt > 0 && isDead(S, m, opt)) return fail("They are already out");
  const prev = u.bets[mid];
  const back = prev && prev[2] == null ? prev[1] : 0;
  if (amt > u.bal + back) return fail("Not enough Loops");
  if (prev) {
    m.pool[prev[0]] -= prev[1];
    m.cnt[prev[0]]--;
    u.bal += back;
    delete u.bets[mid];
  }
  if (amt > 0) {
    m.pool[opt] += amt;
    m.cnt[opt]++;
    u.bal -= amt;
    u.bets[mid] = [opt, amt, null];
    if (!prev) u.st.bets = (u.st.bets || 0) + 1;
  }
  touchMk(S, m);
  touchUser(S, u);
  return ok({});
}
__name(setBet, "setBet");
function castVote(S, u, mid, side) {
  const m = matchOf(S, mid);
  if (!m || m.status !== "voting") return fail("Voting is not open");
  if (side !== "a" && side !== "b") return fail("Pick a side");
  const prev = u.votes[mid];
  if (prev === side) return ok({});
  if (prev) m.c[prev]--;
  m.c[side]++;
  u.votes[mid] = side;
  S.dirty.ev = true;
  S.dirty.live = true;
  touchUser(S, u);
  return ok({});
}
__name(castVote, "castVote");
function hostAction(S, a) {
  const ev = S.ev;
  switch (a.a) {
    case "bb.add": {
      if (ev.phase === "bracket" || ev.phase === "finished") return fail("The bracket is drawn, the lineup is locked");
      const names = (Array.isArray(a.names) ? a.names : [a.name]).map(cleanBb).filter(Boolean);
      let n = 0;
      for (const nm of names) {
        const bb = addBb(S, nm, a);
        if (!bb) continue;
        n++;
        if (ev.phase === "picks" && ev.settings.qualifyBets && ev.bbs.length > ev.settings.size) openQualify(S, bb.id);
      }
      touchMeta(S);
      return ok({ added: n });
    }
    case "bb.edit": {
      const b = bbOf(S, a.id);
      if (!b) return fail("No such beatboxer");
      if (a.name != null) {
        const nm = cleanBb(a.name);
        if (!nm) return fail("Name needed");
        if (ev.bbs.some((x) => x.id !== b.id && x.name.toLowerCase() === nm.toLowerCase())) return fail("That name is already in");
        b.name = nm;
      }
      if (a.tag != null) b.tag = cleanBb(a.tag).slice(0, 24);
      touchMeta(S);
      return ok({});
    }
    case "bb.rm": {
      const b = bbOf(S, a.id);
      if (!b) return fail("No such beatboxer");
      if (ev.phase === "bracket" || ev.phase === "finished") return fail("The bracket is drawn, the lineup is locked");
      if (ev.bbs.length - 1 < ev.settings.size && ev.phase !== "lobby") return fail(`You need at least ${ev.settings.size} beatboxers`);
      for (const m of marketsList(S)) if (m.kind === "qualify" && m.bb === b.id) {
        voidMarket(S, m, null, "Beatboxer withdrew");
        dropMarket(S, m);
      }
      ev.bbs = ev.bbs.filter((x) => x.id !== b.id);
      S.dirty.delPhotos.add(b.id);
      for (const u of S.users.values()) if (u.top.includes(b.id)) {
        u.top = u.top.filter((x) => x !== b.id);
        touchUser(S, u);
      }
      touchMeta(S);
      return ok({});
    }
    case "phase":
      return setPhase(S, a.to);
    case "seeds":
      return publishSeeds(S, a.order);
    case "seeds.revert":
      return revertSeeds(S);
    case "step":
      return stepMatch(S, a.mid, a.to);
    case "result":
      return setResult(S, a.mid, a.w, a.judges);
    case "reopen":
      return revertMatch(S, a.mid);
    case "swap":
      return swapSides(S, a.mid);
    case "mk.preset": {
      if (ev.phase !== "bracket") return fail("Open these once the bracket is drawn");
      if (a.preset === "champion") {
        const c = openChampion(S);
        if (!c) return fail("Already open");
        return ok({});
      }
      const to = +a.to;
      if (!Number.isInteger(to) || to < 1 || to >= log2(ev.settings.size)) return fail("Bad round");
      if (ev.locked[to - 1]) return fail("That round has already started");
      let n = 0;
      for (const id of ev.seeds) {
        if (ev.out[id] !== void 0) continue;
        if (Object.values(ev.markets).some((k) => k.kind === "reach" && k.bb === id && k.to === to && k.st !== "void")) continue;
        const m = newMarket(S, { kind: "reach", bb: id, to });
        const w = weight(S, id);
        const yes = Math.round(200 * Math.min(0.9, Math.max(0.1, w * 2 / (1 + w))));
        m.seed = [yes, 200 - yes];
        n++;
      }
      return n ? ok({ added: n }) : fail("Nothing to add");
    }
    case "mk.lock":
    case "mk.open": {
      const m = mkOf(S, a.id);
      if (!m) return fail("No such market");
      if (a.a === "mk.lock" && m.st === "open") m.st = "locked";
      else if (a.a === "mk.open" && m.st === "locked") m.st = "open";
      else return fail("Cannot change that market now");
      touchMk(S, m);
      S.dirty.meta = true;
      S.dirty.ev = true;
      return ok({});
    }
    case "mk.void": {
      const m = mkOf(S, a.id);
      if (!m || m.st === "settled" || m.st === "void") return fail("Cannot void that market");
      voidMarket(S, m, null);
      S.dirty.meta = true;
      S.dirty.ev = true;
      return ok({});
    }
    case "settings": {
      const s = ev.settings, v = a.set || {};
      if (v.size != null) {
        if (ev.phase !== "lobby") return fail("The bracket size can only change before picks open");
        if (!SIZES.includes(+v.size)) return fail("Pick 4, 8, 16 or 32");
        s.size = +v.size;
      }
      if (v.start != null) {
        if (ev.phase !== "lobby" || S.users.size) return fail("The starting Loops are fixed once people join");
        s.start = Math.max(100, Math.min(1e5, Math.floor(+v.start) || 1e3));
      }
      for (const k of ["regOpen", "qualifyBets", "autoChampion"]) if (v[k] != null) s[k] = !!v[k];
      for (const k of ["maxPerDevice", "maxPerIp"]) if (v[k] != null) s[k] = Math.max(0, Math.min(1e3, Math.floor(+v[k]) || 0));
      if (v.minPayout != null) s.minPayout = Math.max(1, Math.min(3, +v.minPayout || 1.1));
      if (v.name != null) ev.name = String(v.name).trim().slice(0, 40) || ev.name;
      touchMeta(S);
      return ok({});
    }
    case "banner": {
      const t = String(a.text || "").trim().slice(0, 140);
      ev.banner = t ? { id: (ev.banner ? ev.banner.id : 0) + 1, text: t, t: S.now } : null;
      touchMeta(S);
      return ok({});
    }
    case "grant": {
      const amt = Math.floor(+a.amount);
      if (!Number.isFinite(amt) || amt === 0 || Math.abs(amt) > 1e5) return fail("Bad amount");
      const targets = a.key === "all" ? [...S.users.values()] : [S.users.get(nameKey(a.key))].filter(Boolean);
      if (!targets.length) return fail("Nobody to give it to");
      for (const u of targets) credit(S, u, amt, "grant", a.text ? String(a.text).slice(0, 60) : amt > 0 ? "A gift from the organiser" : "Adjustment by the organiser", "");
      return ok({ n: targets.length });
    }
    case "user.ban": {
      const u = S.users.get(nameKey(a.key));
      if (!u) return fail("No such player");
      u.banned = !!a.on;
      touchUser(S, u);
      S.dirty.host = true;
      return ok({});
    }
    default:
      return fail("Unknown action");
  }
}
__name(hostAction, "hostAction");
function metaOf(S) {
  const ev = S.ev;
  return {
    rev: ev.rev,
    code: ev.code,
    name: ev.name,
    phase: ev.phase,
    set: {
      size: ev.settings.size,
      start: ev.settings.start,
      minPayout: ev.settings.minPayout,
      pts: ev.settings.pts,
      regOpen: ev.settings.regOpen,
      qualifyBets: ev.settings.qualifyBets,
      autoChampion: ev.settings.autoChampion,
      maxPerDevice: ev.settings.maxPerDevice,
      maxPerIp: ev.settings.maxPerIp
    },
    bbs: ev.bbs,
    seeds: ev.seeds,
    locked: ev.locked,
    out: ev.out,
    champion: ev.champion,
    banner: ev.banner,
    consensus: ev.consensus,
    matches: ev.matches.map((m) => ({ ...m, c: m.status === "closed" || m.status === "done" ? m.c : null })),
    mk: marketsList(S).map((m) => ({ id: m.id, kind: m.kind, bb: m.bb, mid: m.mid, to: m.to, bbs: m.bbs, seed: m.seed, st: m.st, win: m.win }))
  };
}
__name(metaOf, "metaOf");
function liveOf(S, online, host) {
  const mk = {};
  for (const m of marketsList(S)) if (m.st !== "void") mk[m.id] = [m.pool, m.cnt];
  const out = { n: S.users.size, on: online, mk };
  if (host) {
    const cur = activeMatch(S);
    if (cur) out.v = { id: cur.id, a: cur.c.a, b: cur.c.b };
  }
  return out;
}
__name(liveOf, "liveOf");
function meOf(S, u) {
  const rank = rankOf(S, u);
  return {
    name: u.name,
    bal: u.bal,
    staked: staked(S, u),
    net: netWorth(S, u),
    rank: rank.rank,
    of: rank.of,
    top: u.top,
    picks: u.picks,
    bets: u.bets,
    votes: u.votes,
    st: u.st,
    log: u.log.slice(-25),
    banned: u.banned
  };
}
__name(meOf, "meOf");
function boardOf(S) {
  const rows = [...S.users.values()].filter((u) => !u.banned).map((u) => ({ n: u.name, net: netWorth(S, u), pred: u.st.pred || 0, won: u.st.won || 0, lost: u.st.lost || 0 })).sort((a, b) => b.net - a.net || a.n.localeCompare(b.n));
  return rows.slice(0, 50).map((r, i) => ({ ...r, rank: i + 1 }));
}
__name(boardOf, "boardOf");
function rankOf(S, u) {
  const net = netWorth(S, u);
  let better = 0, of = 0;
  for (const o of S.users.values()) {
    if (o.banned) continue;
    of++;
    if (netWorth(S, o) > net) better++;
  }
  return { rank: better + 1, of };
}
__name(rankOf, "rankOf");
function hostOf(S) {
  const users = [...S.users.values()];
  return {
    users: users.slice(0, 600).map((u) => ({
      n: u.name,
      bal: u.bal,
      net: netWorth(S, u),
      banned: u.banned,
      top: u.top.length,
      picks: Object.keys(u.picks).length,
      votes: Object.keys(u.votes).length,
      joined: u.joined
    })),
    total: users.length,
    tops: users.filter((u) => u.top.length).length,
    consensus: consensus(S),
    volume: marketsList(S).reduce((a, m) => a + m.pool.reduce((x, y) => x + y, 0), 0)
  };
}
__name(hostOf, "hostOf");

// worker.js
var ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
var CODE_LEN = 5;
var PBKDF2_ITER = 12e3;
var MAX_PHOTO = 160 * 1024;
var LIVE_MS = 700;
var BOARD_MS = 2500;
var HOST_MS = 2e3;
var CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization, x-host",
  "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
  "access-control-max-age": "86400"
};
var json = /* @__PURE__ */ __name((o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...CORS, ...extra } }), "json");
var err = /* @__PURE__ */ __name((msg, status = 400) => json({ ok: false, err: msg }, status), "err");
var enc = new TextEncoder();
var b64u = /* @__PURE__ */ __name((buf) => {
  let s = "";
  for (const c of new Uint8Array(buf)) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}, "b64u");
var randomToken = /* @__PURE__ */ __name((n = 24) => b64u(crypto.getRandomValues(new Uint8Array(n))), "randomToken");
var sha = /* @__PURE__ */ __name(async (s) => b64u(await crypto.subtle.digest("SHA-256", enc.encode(String(s)))), "sha");
async function hashPassword(pw, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(String(pw)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: PBKDF2_ITER }, key, 256);
  return b64u(bits);
}
__name(hashPassword, "hashPassword");
var safeEq = /* @__PURE__ */ __name((a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}, "safeEq");
var makeCode = /* @__PURE__ */ __name(() => {
  const b = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join("");
}, "makeCode");
var cleanCode = /* @__PURE__ */ __name((raw) => {
  const s = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === CODE_LEN && [...s].every((c) => ALPHABET.includes(c)) ? s : null;
}, "cleanCode");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (!url.pathname.startsWith("/api/")) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Battle Call server is running. Open the app and point it at this address.", { headers: { "content-type": "text/plain" } });
    }
    if (url.pathname === "/api/ping") return json({ ok: true, app: "battle-call" });
    if (url.pathname === "/api/create" && request.method === "POST") {
      let b;
      try {
        b = await request.json();
      } catch (_) {
        return err("Bad request");
      }
      if (env.CREATE_KEY && b.key !== env.CREATE_KEY) return err("Creating events needs the organiser key", 403);
      for (let tries = 0; tries < 5; tries++) {
        const code2 = makeCode();
        const stub2 = env.EVENT.get(env.EVENT.idFromName(code2));
        const r = await stub2.fetch("https://do/init", { method: "POST", body: JSON.stringify({ code: code2, name: b.name, size: b.size, password: b.password }) });
        if (r.status !== 409) return withCors(r);
      }
      return err("Could not make an event code, try again", 500);
    }
    const m = /^\/api\/e\/([A-Za-z0-9]{3,12})(\/.*)?$/.exec(url.pathname);
    if (!m) return err("Not found", 404);
    const code = cleanCode(m[1]);
    if (!code) return err("No event with that code", 404);
    const stub = env.EVENT.get(env.EVENT.idFromName(code));
    const inner = new Request("https://do" + (m[2] || "/") + url.search, request);
    const res = await stub.fetch(inner);
    return res.status === 101 ? res : withCors(res);
  }
};
function withCors(res) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
  return r;
}
__name(withCors, "withCors");
var Event = class {
  static {
    __name(this, "Event");
  }
  constructor(state, env) {
    this.ctx = state;
    this.env = env;
    this.S = null;
    this.tokIdx = /* @__PURE__ */ new Map();
    this.hostTk = /* @__PURE__ */ new Set();
    this.host = null;
    this.pending = /* @__PURE__ */ new Set();
    this.fails = /* @__PURE__ */ new Map();
    this.rate = /* @__PURE__ */ new Map();
    this.timers = {};
    this.sent = { meta: 0 };
    try {
      state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    } catch (_) {
    }
    state.blockConcurrencyWhile(() => this.load());
  }
  /* ---------- persistence ---------- */
  async load() {
    const st = this.ctx.storage;
    const ev = await st.get("ev");
    if (!ev) return;
    ev.markets = {};
    const S = newState(ev);
    for (const [, m] of await st.list({ prefix: "mk:" })) ev.markets[m.id] = m;
    for (const [, u] of await st.list({ prefix: "u:" })) S.users.set(u.key, u);
    for (const [, l] of await st.list({ prefix: "lg:" })) S.ledger.set(l.ref, l);
    this.host = await st.get("host");
    this.S = S;
    this.hostTk = new Set(this.host && this.host.tk || []);
    for (const u of S.users.values()) for (const h of u.tk || []) this.tokIdx.set(h, u.key);
  }
  /** Write what the last action changed, then tell everybody who needs to know. */
  async commit() {
    const S = this.S, d = S.dirty, st = this.ctx.storage;
    S.dirty = blankDirty();
    if (d.meta) S.ev.rev++;
    const puts = {}, dels = [];
    if (d.ev) {
      const { markets, ...core } = S.ev;
      puts.ev = core;
    }
    for (const id of d.mk) if (S.ev.markets[id]) puts["mk:" + id] = S.ev.markets[id];
    for (const id of d.delMk) dels.push("mk:" + id);
    for (const k of d.users) if (S.users.has(k)) puts["u:" + k] = S.users.get(k);
    for (const k of d.delUsers) dels.push("u:" + k);
    for (const r of d.lg) {
      if (S.ledger.has(r)) puts["lg:" + r] = S.ledger.get(r);
      else dels.push("lg:" + r);
    }
    for (const id of d.delPhotos) dels.push("ph:" + id);
    const keys = Object.keys(puts);
    for (let i = 0; i < keys.length; i += 120) {
      const chunk = {};
      for (const k of keys.slice(i, i + 120)) chunk[k] = puts[k];
      await st.put(chunk);
    }
    for (let i = 0; i < dels.length; i += 120) await st.delete(dels.slice(i, i + 120));
    this.fan(d);
  }
  /* ---------- sockets ---------- */
  sockets() {
    return this.ctx.getWebSockets();
  }
  att(ws) {
    try {
      return ws.deserializeAttachment() || { r: "s" };
    } catch (_) {
      return { r: "s" };
    }
  }
  send(ws, o) {
    try {
      ws.send(typeof o === "string" ? o : JSON.stringify(o));
    } catch (_) {
    }
  }
  fan(d) {
    const S = this.S, all = this.sockets();
    if (d.meta) {
      const s = JSON.stringify({ t: "meta", ...metaOf(S) });
      for (const ws of all) this.send(ws, s);
    }
    if (d.users.size) {
      const keys = d.users;
      for (const ws of all) {
        const a = this.att(ws);
        if (a.r === "u" && keys.has(a.k) && S.users.has(a.k)) this.send(ws, { t: "me", ...meOf(S, S.users.get(a.k)) });
      }
    }
    if (d.live) this.later("live", LIVE_MS, () => this.pushLive());
    if (d.board) this.later("board", BOARD_MS, () => this.pushBoard());
    if (d.host) this.later("host", HOST_MS, () => this.pushHost());
  }
  later(name, ms, fn) {
    if (this.timers[name]) return;
    this.timers[name] = setTimeout(() => {
      this.timers[name] = null;
      try {
        fn();
      } catch (e) {
        console.log(name, e && e.stack);
      }
    }, ms);
  }
  pushLive() {
    if (!this.S) return;
    const all = this.sockets(), on = all.length;
    const pub = JSON.stringify({ t: "live", ...liveOf(this.S, on, false) });
    const hst = JSON.stringify({ t: "live", ...liveOf(this.S, on, true) });
    for (const ws of all) this.send(ws, this.att(ws).r === "h" ? hst : pub);
  }
  pushBoard() {
    if (!this.S) return;
    const s = JSON.stringify({ t: "board", rows: boardOf(this.S) });
    for (const ws of this.sockets()) this.send(ws, s);
    for (const ws of this.sockets()) {
      const a = this.att(ws);
      if (a.r === "u" && this.S.users.has(a.k)) this.send(ws, { t: "me", ...meOf(this.S, this.S.users.get(a.k)) });
    }
  }
  pushHost() {
    if (!this.S) return;
    const s = JSON.stringify({ t: "host", ...hostOf(this.S) });
    for (const ws of this.sockets()) if (this.att(ws).r === "h") this.send(ws, s);
  }
  snapshot(ws, a) {
    const S = this.S;
    this.send(ws, { t: "meta", ...metaOf(S) });
    this.send(ws, { t: "live", ...liveOf(S, this.sockets().length, a.r === "h") });
    this.send(ws, { t: "board", rows: boardOf(S) });
    if (a.r === "u" && S.users.has(a.k)) this.send(ws, { t: "me", ...meOf(S, S.users.get(a.k)) });
    if (a.r === "h") this.send(ws, { t: "host", ...hostOf(S) });
  }
  async webSocketMessage(ws, raw) {
    if (!this.S) {
      this.send(ws, { t: "gone" });
      return;
    }
    let m;
    try {
      m = JSON.parse(raw);
    } catch (_) {
      return;
    }
    if (m.t === "hello") {
      const a2 = await this.authFor(m.tk, m.ht);
      ws.serializeAttachment(a2);
      if (a2.bad) this.send(ws, { t: "authfail" });
      this.snapshot(ws, a2);
      this.later("live", 300, () => this.pushLive());
      return;
    }
    if (m.t !== "a") return;
    const a = this.att(ws);
    const r = await this.act(a, m, (a.r === "u" ? a.k : a.r) + ":ws");
    this.send(ws, { t: "r", id: m.id, ok: r.ok, err: r.err });
  }
  webSocketClose(ws) {
    try {
      ws.close();
    } catch (_) {
    }
    this.S && this.later("live", 500, () => this.pushLive());
  }
  webSocketError(ws) {
    this.webSocketClose(ws);
  }
  /* ---------- auth ---------- */
  async authFor(tk, ht) {
    if (ht) {
      const h = await sha(ht);
      if (this.hostTk.has(h)) return { r: "h" };
      return { r: "s", bad: 1 };
    }
    if (tk) {
      const key = this.tokIdx.get(await sha(tk));
      if (key && this.S.users.has(key)) return { r: "u", k: key };
      return { r: "s", bad: 1 };
    }
    return { r: "s" };
  }
  throttled(id) {
    const now = Date.now(), arr = (this.rate.get(id) || []).filter((t) => now - t < 1e4);
    arr.push(now);
    this.rate.set(id, arr);
    if (this.rate.size > 3e3) this.rate.clear();
    return arr.length > 40;
  }
  /* ---------- one action, from a socket or from HTTP ---------- */
  async act(a, m, rateId) {
    const S = this.S;
    if (this.throttled(rateId)) return { ok: false, err: "Slow down a little" };
    S.now = Date.now();
    let r;
    if (a.r === "h") {
      r = hostAction(S, m);
    } else if (a.r === "u") {
      const u = S.users.get(a.k);
      if (!u) return { ok: false, err: "Log in again" };
      if (u.banned) return { ok: false, err: "Your account is blocked" };
      if (m.a === "top") r = setTop(S, u, m.order);
      else if (m.a === "pick") r = setPick(S, u, m.mid, m.bb || null);
      else if (m.a === "bet") r = setBet(S, u, m.mk, m.o, m.amt);
      else if (m.a === "vote") r = castVote(S, u, m.mid, m.side);
      else r = { ok: false, err: "Unknown action" };
    } else {
      return { ok: false, err: "Log in first" };
    }
    if (r.ok) await this.commit();
    return r;
  }
  /* ---------- HTTP ---------- */
  async fetch(request) {
    const url = new URL(request.url), path = url.pathname, method = request.method;
    if (path === "/init" && method === "POST") return this.init(request);
    if (!this.S) return err("No event with that code", 404);
    if (path === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") return err("Expected a WebSocket", 426);
      const pair = new WebSocketPair(), [client, server] = [pair[0], pair[1]];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ r: "s" });
      return new Response(null, { status: 101, webSocket: client });
    }
    if (path === "/info") {
      const ev = this.S.ev;
      return json({ ok: true, code: ev.code, name: ev.name, phase: ev.phase, players: this.S.users.size, regOpen: ev.settings.regOpen });
    }
    if (path === "/register" && method === "POST") return this.register(request);
    if (path === "/login" && method === "POST") return this.login(request);
    if (path === "/hostlogin" && method === "POST") return this.hostLogin(request);
    if (path.startsWith("/photo/")) {
      const id = path.slice(7);
      if (method === "GET") {
        const bytes = await this.ctx.storage.get("ph:" + id);
        if (!bytes) return new Response("", { status: 404 });
        return new Response(bytes, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
      }
      if (method === "PUT") {
        const a = await this.authFor(null, request.headers.get("x-host"));
        if (a.r !== "h") return err("Organiser only", 403);
        if (!this.S.ev.bbs.some((b) => b.id === id)) return err("No such beatboxer", 404);
        const buf = await request.arrayBuffer();
        if (!buf.byteLength || buf.byteLength > MAX_PHOTO) return err("Picture too big (max 160 KB)", 413);
        await this.ctx.storage.put("ph:" + id, new Uint8Array(buf));
        const bb = this.S.ev.bbs.find((b) => b.id === id);
        bb.ph = (bb.ph || 0) + 1;
        this.S.dirty.meta = true;
        this.S.dirty.ev = true;
        await this.commit();
        return json({ ok: true, ph: bb.ph });
      }
    }
    if (path === "/state" && method === "GET") {
      const a = await this.authFor(bearer(request), request.headers.get("x-host"));
      const S = this.S, out = { ok: true, meta: metaOf(S), live: liveOf(S, this.sockets().length, a.r === "h"), board: boardOf(S), auth: a.bad ? 0 : 1 };
      if (a.r === "u" && S.users.has(a.k)) out.me = meOf(S, S.users.get(a.k));
      if (a.r === "h") out.host = hostOf(S);
      return json(out);
    }
    if (path === "/act" && method === "POST") {
      let m;
      try {
        m = await request.json();
      } catch (_) {
        return err("Bad request");
      }
      const a = await this.authFor(bearer(request), request.headers.get("x-host"));
      const ip = request.headers.get("cf-connecting-ip") || "?";
      const r = await this.act(a, m, (a.r === "u" ? a.k : a.r) + ":http:" + ip);
      return json(r, r.ok ? 200 : 400);
    }
    if (path === "/export" && method === "GET") {
      const a = await this.authFor(null, request.headers.get("x-host") || url.searchParams.get("ht"));
      if (a.r !== "h") return err("Organiser only", 403);
      const S = this.S;
      return json(
        {
          ok: true,
          event: { ...metaOf(S) },
          board: boardOf(S),
          markets: marketsList(S),
          players: [...S.users.values()].map((u) => ({ name: u.name, bal: u.bal, st: u.st, top: u.top, picks: u.picks, bets: u.bets, votes: u.votes }))
        },
        200,
        { "content-disposition": `attachment; filename="battle-call-${S.ev.code}.json"` }
      );
    }
    if (path === "/destroy" && method === "POST") {
      const a = await this.authFor(null, request.headers.get("x-host"));
      if (a.r !== "h") return err("Organiser only", 403);
      for (const ws of this.sockets()) {
        this.send(ws, { t: "gone" });
        try {
          ws.close(1e3, "event deleted");
        } catch (_) {
        }
      }
      await this.ctx.storage.deleteAll();
      this.S = null;
      this.tokIdx.clear();
      this.hostTk.clear();
      return json({ ok: true });
    }
    return err("Not found", 404);
  }
  async init(request) {
    if (this.S) return err("exists", 409);
    let b;
    try {
      b = await request.json();
    } catch (_) {
      return err("Bad request");
    }
    const pw = String(b.password || "");
    if (pw.length < 4) return err("Choose an organiser password of at least 4 characters");
    const ev = newEvent({ code: b.code, name: b.name, size: +b.size || 16, now: Date.now() });
    const salt = randomToken(12), ht = randomToken();
    this.host = { s: salt, h: await hashPassword(pw, salt), tk: [await sha(ht)] };
    this.S = newState(ev);
    this.hostTk = new Set(this.host.tk);
    this.S.dirty.ev = true;
    await this.ctx.storage.put("host", this.host);
    await this.commit();
    return json({ ok: true, code: ev.code, hostToken: ht });
  }
  tooManyFails(ip) {
    const now = Date.now(), a = (this.fails.get(ip) || []).filter((t) => now - t < 3e5);
    this.fails.set(ip, a);
    return a.length >= 10;
  }
  noteFail(ip) {
    const a = this.fails.get(ip) || [];
    a.push(Date.now());
    this.fails.set(ip, a);
    if (this.fails.size > 2e3) this.fails.clear();
  }
  async register(request) {
    let b;
    try {
      b = await request.json();
    } catch (_) {
      return err("Bad request");
    }
    const S = this.S, ip = request.headers.get("cf-connecting-ip") || "?";
    const pw = String(b.password || "");
    if (pw.length < 4) return err("Password needs at least 4 characters");
    if (pw.length > 80) return err("Password too long");
    const ipH = (await sha(this.S.ev.code + ip)).slice(0, 10);
    const dev = String(b.device || "").slice(0, 40);
    S.now = Date.now();
    const chk = canRegister(S, { name: b.name, device: dev, ipH });
    if (!chk.ok) return err(chk.err);
    const key = nameKey(chk.name);
    if (this.pending.has(key)) return err("That nickname is taken");
    this.pending.add(key);
    try {
      const salt = randomToken(12), tk = randomToken();
      const [h, th] = await Promise.all([hashPassword(pw, salt), sha(tk)]);
      const again = canRegister(S, { name: chk.name, device: dev, ipH });
      if (!again.ok) return err(again.err);
      const u = newUser(S, { name: chk.name, device: dev, ipH });
      u.pw = { s: salt, h };
      u.tk = [th];
      addUser(S, u);
      this.tokIdx.set(th, u.key);
      await this.commit();
      return json({ ok: true, token: tk, name: u.name });
    } finally {
      this.pending.delete(key);
    }
  }
  async login(request) {
    let b;
    try {
      b = await request.json();
    } catch (_) {
      return err("Bad request");
    }
    const ip = request.headers.get("cf-connecting-ip") || "?";
    if (this.tooManyFails(ip)) return err("Too many wrong passwords, wait a few minutes", 429);
    const u = this.S.users.get(nameKey(b.name));
    const bad = /* @__PURE__ */ __name(() => {
      this.noteFail(ip);
      return err("Wrong nickname or password", 401);
    }, "bad");
    if (!u || !u.pw) return bad();
    const h = await hashPassword(String(b.password || ""), u.pw.s);
    if (!safeEq(h, u.pw.h)) return bad();
    if (u.banned) return err("Your account is blocked", 403);
    const tk = randomToken(), th = await sha(tk);
    u.tk = [...u.tk || [], th];
    while (u.tk.length > 4) this.tokIdx.delete(u.tk.shift());
    this.tokIdx.set(th, u.key);
    this.S.dirty.users.add(u.key);
    await this.commit();
    return json({ ok: true, token: tk, name: u.name });
  }
  async hostLogin(request) {
    let b;
    try {
      b = await request.json();
    } catch (_) {
      return err("Bad request");
    }
    const ip = request.headers.get("cf-connecting-ip") || "?";
    if (this.tooManyFails(ip)) return err("Too many wrong passwords, wait a few minutes", 429);
    const h = await hashPassword(String(b.password || ""), this.host.s);
    if (!safeEq(h, this.host.h)) {
      this.noteFail(ip);
      return err("Wrong organiser password", 401);
    }
    const ht = randomToken(), hh = await sha(ht);
    this.host.tk = [...this.host.tk, hh].slice(-6);
    this.hostTk = new Set(this.host.tk);
    await this.ctx.storage.put("host", this.host);
    return json({ ok: true, hostToken: ht });
  }
};
var bearer = /* @__PURE__ */ __name((req) => {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}, "bearer");

// ../../../../../tmp/claude-0/-home-user-Games/65f2eefc-fe59-5f16-986a-8289419559c4/scratchpad/tools/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../tmp/claude-0/-home-user-Games/65f2eefc-fe59-5f16-986a-8289419559c4/scratchpad/tools/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-7QERA8/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../../../tmp/claude-0/-home-user-Games/65f2eefc-fe59-5f16-986a-8289419559c4/scratchpad/tools/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-7QERA8/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  Event,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map

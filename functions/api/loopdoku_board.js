// LoopDoku leaderboard (Cloudflare Pages Function, KV binding BOARD, keys prefixed 'ld:'), used by the Chinese edition.
//
// A player claims a name once with a secret token (only its SHA-256 is stored). After every solved gig the game posts the
// result; the SERVER works out the points (pack difficulty x stars from mistakes/hints + a speed bonus), so a client cannot
// post a score. Each puzzle counts once per period at its best result: a replay or a resent win only adds an improvement.
//
// Two KV keys per solve (writes are shared with every other game's board):
//   ld:p:<key>   the player: {name, th (token hash), t (last post), all:{id:pts}, d|w|m:{k:periodKey, s:{id:pts}}}
//   ld:board     all four boards: {d|w|m:{k, list}, all:{list}}, each list the top 100 [{n:name, p:points}], absolute totals
//   ld:ban       (optional, edited by hand in the dashboard) JSON array of name keys hidden from the boards
// Periods follow Beijing time (UTC+8): the day turns at midnight there, weeks start on Monday.
//
//   GET  /api/loopdoku_board?name=<n>        -> {d, w, m, all: top 10 [{name, pts, rank}], me?: {d|w|m|all: {pts, rank|null}}}
//   POST {action:'claim', name, token}       -> {name} | 409 {error:'taken'} | 400 {error:'name'}
//   POST {action:'score', name, token, id, ms, mistakes, hints}
//                                            -> {pts, gained, me:{...}} | 403 {error:'token'} | 400 | 429 {error:'slow down'}

const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
const kv = (env) => env.BOARD || env.board || env.Board || null;

// the level packs of LoopDoku (sizes must match LoopDoku/loopdoku-levels.js; tests/loopdoku_board.test.mjs checks it)
export const PACKS = {
  easy: { count: 40, base: 15, par: 90, n: 5 }, normal: { count: 40, base: 30, par: 150, n: 6 }, chill: { count: 30, base: 40, par: 240, n: 8 },
  hard: { count: 40, base: 60, par: 240, n: 7 }, expert: { count: 40, base: 100, par: 420, n: 8 }, terror: { count: 30, base: 150, par: 480, n: 7 },
  extreme: { count: 30, base: 200, par: 720, n: 9 }, melt: { count: 20, base: 300, par: 900, n: 8 }, nightmare: { count: 10, base: 350, par: 1200, n: 10 },
  daily: { count: 1, base: 120, par: 360, n: 7 },
};
const TOP = 100, SHOW = 10, THROTTLE_MS = 3000;

// the same star rule as the game (loopdoku-core: 3, minus one for a mistake, one more for a second, one for any hint)
export function stars(mistakes, hints) { let s = 3; if (mistakes > 0) s--; if (mistakes > 1) s--; if (hints > 0) s--; return Math.max(1, s); }
export function points(pack, ms, mistakes, hints) {
  const P = PACKS[pack], st = stars(mistakes, hints);
  const mult = st === 3 ? 1.5 : st === 2 ? 1.2 : 1;
  const speed = Math.max(0, Math.min(1, 1 - ms / (P.par * 1000)));
  return Math.round(P.base * mult + P.base * 0.3 * speed);
}

// Beijing-time period keys
export function periodKeys(now) {
  const t = new Date(now + 8 * 3600000), p = (n) => String(n).padStart(2, '0');
  const day = t.getUTCFullYear() + '-' + p(t.getUTCMonth() + 1) + '-' + p(t.getUTCDate());
  const mon = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 86400000);
  return { d: day, w: mon.getUTCFullYear() + '-' + p(mon.getUTCMonth() + 1) + '-' + p(mon.getUTCDate()), m: day.slice(0, 7) };
}

// names: 2 to 12 characters (letters of any script, digits, space, _ - .), case-insensitive and width-insensitive key
export function cleanName(raw) {
  const s = String(raw == null ? '' : raw).normalize('NFKC').replace(/\s+/g, ' ').trim();
  const len = [...s].length;
  if (len < 2 || len > 12 || !/^[\p{L}\p{N} _.\-]+$/u.test(s)) return null;
  return s;
}
const nameKey = (n) => n.normalize('NFKC').toLowerCase();
async function hash(token) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('loopdoku:' + token));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const okToken = (t) => typeof t === 'string' && /^[a-f0-9]{32,64}$/.test(t);

// level id -> pack, or null when it is not a real level (a daily is accepted for yesterday, today or tomorrow in Beijing)
export function packOf(id, now) {
  const m = /^([a-z]+)-(\d+)$/.exec(String(id));
  if (m && PACKS[m[1]] && m[1] !== 'daily') { const k = +m[2]; return k >= 1 && k <= PACKS[m[1]].count ? m[1] : null; }
  const d = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(String(id));
  if (d) { for (const off of [-1, 0, 1]) if (periodKeys(now + off * 86400000).d === d[1]) return 'daily'; }
  return null;
}

const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
function totals(p, keys) {
  const per = (x) => (p[x] && p[x].k === keys[x] ? sum(p[x].s) : 0);
  return { d: per('d'), w: per('w'), m: per('m'), all: sum(p.all) };
}
function freshBoard(b, keys) {
  b = b || {};
  for (const x of ['d', 'w', 'm']) if (!b[x] || b[x].k !== keys[x]) b[x] = { k: keys[x], list: [] };
  if (!b.all) b.all = { list: [] };
  return b;
}
function upsert(list, name, pts) {
  const i = list.findIndex((e) => nameKey(e.n) === nameKey(name));
  if (i >= 0) list.splice(i, 1);
  if (pts > 0) list.push({ n: name, p: pts });
  list.sort((a, b) => b.p - a.p);
  if (list.length > TOP) list.length = TOP;
}
async function readJSON(KV, key, dflt) { try { return JSON.parse((await KV.get(key)) || 'null') || dflt; } catch (_) { return dflt; } }
function view(board, ban, me, myTotals) {
  const out = {};
  for (const x of ['d', 'w', 'm', 'all']) {
    const list = board[x].list.filter((e) => !ban.includes(nameKey(e.n)));
    out[x] = list.slice(0, SHOW).map((e, i) => ({ name: e.n, pts: e.p, rank: i + 1 }));
    if (me) { const r = list.findIndex((e) => nameKey(e.n) === nameKey(me)); out.me = out.me || {}; out.me[x] = { pts: myTotals ? myTotals[x] : r >= 0 ? list[r].p : 0, rank: r >= 0 ? r + 1 : null }; }
  }
  return out;
}

export async function onRequestGet({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  const now = Date.now(), keys = periodKeys(now);
  const board = freshBoard(await readJSON(KV, 'ld:board', null), keys), ban = await readJSON(KV, 'ld:ban', []);
  const name = cleanName(new URL(request.url).searchParams.get('name'));
  let myT = null;
  if (name) { const p = await readJSON(KV, 'ld:p:' + nameKey(name), null); if (p) myT = totals(p, keys); }
  return json(view(board, ban, name && myT ? name : null, myT));
}

export async function onRequestPost({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  let b; try { b = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  const name = cleanName(b.name);
  if (!name) return json({ error: 'name' }, 400);
  if (!okToken(b.token)) return json({ error: 'token' }, 400);
  const pkey = 'ld:p:' + nameKey(name), th = await hash(b.token), now = Date.now();
  let p = await readJSON(KV, pkey, null);
  try {
    if (b.action === 'claim') {
      if (p && p.th !== th) return json({ error: 'taken' }, 409);
      if (!p) { p = { name, th, t: 0, all: {} }; await KV.put(pkey, JSON.stringify(p)); }
      return json({ name: p.name });
    }
    if (b.action !== 'score') return json({ error: 'action' }, 400);
    if (!p) return json({ error: 'unknown name' }, 404);
    if (p.th !== th) return json({ error: 'token' }, 403);
    if (now - (p.t || 0) < THROTTLE_MS) return json({ error: 'slow down' }, 429);
    const id = String(b.id || ''), pack = packOf(id, now);
    if (!pack) return json({ error: 'level' }, 400);
    const ms = Math.floor(+b.ms), mistakes = Math.floor(+b.mistakes || 0), hints = Math.floor(+b.hints || 0);
    if (!Number.isFinite(ms) || ms < PACKS[pack].n * 700 || ms > 6 * 3600000 || mistakes < 0 || mistakes > 2 || hints < 0 || hints > 200) return json({ error: 'result' }, 400);
    const pts = points(pack, ms, mistakes, hints), keys = periodKeys(now);
    let gained = 0;
    p.all = p.all || {};
    if ((p.all[id] || 0) < pts) { gained = pts - (p.all[id] || 0); p.all[id] = pts; }
    for (const x of ['d', 'w', 'm']) {
      if (!p[x] || p[x].k !== keys[x]) p[x] = { k: keys[x], s: {} };
      if ((p[x].s[id] || 0) < pts) p[x].s[id] = pts;
    }
    p.t = now;
    const t = totals(p, keys);
    const board = freshBoard(await readJSON(KV, 'ld:board', null), keys);
    for (const x of ['d', 'w', 'm', 'all']) upsert(board[x].list, p.name, t[x]);
    await KV.put(pkey, JSON.stringify(p));
    await KV.put('ld:board', JSON.stringify(board));
    const ban = await readJSON(KV, 'ld:ban', []);
    return json(Object.assign({ pts, gained }, view(board, ban, p.name, t)));
  } catch (e) {
    return json({ error: 'storage' }, 503);   // the game keeps the win queued and tries again later
  }
}

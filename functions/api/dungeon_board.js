// Dungeon Pusher — best-descent leaderboard (Cloudflare Pages Function).
//
// Deployed automatically from /functions as https://<site>/api/dungeon_board.
// Requires ONE dashboard step: Pages project → Settings → Bindings → add a KV
// namespace binding named DPBOARD (its own namespace — don't reuse BOARD or
// WWBOARD). Until the binding exists this returns 503 and the game shows the
// board as unreachable instead of breaking.
//
// Two boards, ranked by floor desc then kills desc, best-per-name:
//   - all-time under 'dp:top' (no TTL)
//   - a rolling DAILY under 'dp:day:<UTC date>' (three-day TTL so stale days
//     sweep themselves; the date always comes from the SERVER clock — client
//     input never builds a KV key)
// ONE POST updates BOTH boards, so the per-IP throttle never forces a choice.
//
//   GET  /api/dungeon_board[?board=daily]      → { top:[...], day }
//   POST /api/dungeon_board {name,floor,kills,hero,diff}
//        → validates/clamps, keeps each name's best run on each board,
//          30s per-IP write throttle, caps 50, returns { top, daily, day }.

const json = (o, s) => new Response(JSON.stringify(o), {
  status: s || 200,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
});

// binding variable names are case-sensitive in the dashboard — accept any casing
const kv = env => env.DPBOARD || env.dpboard || env.DpBoard || env.Dpboard || null;

const TOP_KEY = 'dp:top';
const CAP = 50;
const DAY_TTL = 3 * 24 * 3600;         // stale daily boards sweep themselves
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const utcDay = () => new Date().toISOString().slice(0, 10);
const dayKey = () => 'dp:day:' + utcDay();

// floor first, kills break the tie
const better = (a, b) => a.floor !== b.floor ? a.floor > b.floor : a.kills > b.kills;

function fold(top, entry) {
  const i = top.findIndex(e => e.name === entry.name);
  if (i >= 0) {
    if (!better(entry, top[i])) return false;      // not a new personal best here
    top.splice(i, 1);
  }
  top.push(entry);
  top.sort((a, b) => b.floor - a.floor || b.kills - a.kills);
  if (top.length > CAP) top.length = CAP;
  return true;
}

export async function onRequestGet({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  const which = request ? new URL(request.url).searchParams.get('board') : null;
  const key = which === 'daily' ? dayKey() : TOP_KEY;   // whitelist — nothing else reachable
  const top = JSON.parse((await KV.get(key)) || '[]');
  return json({ top, day: utcDay() });
}

export async function onRequestPost({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);

  const ip = request.headers.get('cf-connecting-ip') || '?';
  // 30s per-IP throttle. KV's minimum expirationTtl is 60s (smaller throws →
  // 500), so store a timestamp and compare for the real window.
  const last = await KV.get('rl:' + ip);
  if (last && Date.now() - +last < 30000) return json({ error: 'slow down' }, 429);

  let b; try { b = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }

  // Sanitize/clamp everything. The name regex strips control chars + HTML
  // vectors (only \w, space, dash, dot, apostrophe survive), capped 12 chars.
  const name = String(b.name || '').replace(/[^\w \-.']/g, '').trim().slice(0, 12) || 'Anonymous';
  const floor = Math.floor(+b.floor);
  if (!Number.isFinite(floor) || floor < 1 || floor > 999) return json({ error: 'bad floor' }, 400);
  const kills = clamp(Math.floor(+b.kills) || 0, 0, 99999);
  const hero = String(b.hero || '').replace(/[^a-z]/g, '').slice(0, 12) || 'knight';
  const diff = ['merciful', 'normal', 'nightmare'].indexOf(b.diff) >= 0 ? b.diff : 'normal';
  const entry = { name, floor, kills, hero, diff, d: b.daily ? 1 : 0, ng: b.ng ? 1 : 0, t: Date.now() };

  const top = JSON.parse((await KV.get(TOP_KEY)) || '[]');
  const daily = JSON.parse((await KV.get(dayKey())) || '[]');
  const grewTop = fold(top, entry);
  const grewDay = fold(daily, entry);
  if (grewTop) await KV.put(TOP_KEY, JSON.stringify(top));               // all-time: no TTL
  if (grewDay) await KV.put(dayKey(), JSON.stringify(daily), { expirationTtl: DAY_TTL });
  await KV.put('rl:' + ip, String(Date.now()), { expirationTtl: 60 });
  return json({ top, daily, day: utcDay() });
}

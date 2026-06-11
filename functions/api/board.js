// No Room For Heroes — endless leaderboard (Cloudflare Pages Function).
//
// Deployed automatically by Cloudflare Pages from this repo's /functions dir
// as https://<site>/api/board. Requires ONE dashboard step: in the Pages
// project → Settings → Bindings → add a KV namespace binding named BOARD.
// Until that binding exists this returns 503 and the game hides the board.
//
// Four boards: daily / weekly / monthly / all-time. The all-time board keeps
// the original 'top' key so pre-existing entries survive; period boards live
// under dated keys ('top:d:2026-06-11', 'top:w:<monday>', 'top:m:2026-06')
// with TTLs so stale periods clean themselves up.
//
//   GET  /api/board              → { day, week, month, all, top }   (top = legacy alias of all)
//   POST /api/board {name,score} → validates, keeps each name's best per board,
//                                  30s per-IP write throttle, returns all boards.

const json = (o, s) => new Response(JSON.stringify(o), {
  status: s || 200,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
});

// binding variable names are case-sensitive in the dashboard — accept any casing
const kv = env => env.BOARD || env.board || env.Board || null;

const PERIODS = ['day', 'week', 'month', 'all'];
const TTL = { day: 3 * 86400, week: 9 * 86400, month: 35 * 86400, all: 0 };   // 0 = never expires
function periodKeys(now) {
  const d = new Date(now), p = n => String(n).padStart(2, '0');
  const wd = (d.getUTCDay() + 6) % 7;                       // 0 = Monday
  const mon = new Date(now - wd * 86400000);                // the Monday this week started (UTC)
  return {
    day:   'top:d:' + d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()),
    week:  'top:w:' + mon.getUTCFullYear() + '-' + p(mon.getUTCMonth() + 1) + '-' + p(mon.getUTCDate()),
    month: 'top:m:' + d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1),
    all:   'top',                                           // legacy key — existing entries survive
  };
}

async function readBoards(KV, keys) {
  const out = {};
  for (const per of PERIODS) out[per] = JSON.parse((await KV.get(keys[per])) || '[]');
  return out;
}

export async function onRequestGet({ env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  const boards = await readBoards(KV, periodKeys(Date.now()));
  return json({ ...boards, top: boards.all });
}

export async function onRequestPost({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  const ip = request.headers.get('cf-connecting-ip') || '?';
  // 30s per-IP throttle — KV's minimum expirationTtl is 60s (smaller throws →
  // 500), so store a timestamp and compare for the real window.
  const last = await KV.get('rl:' + ip);
  if (last && Date.now() - +last < 30000) return json({ error: 'slow down' }, 429);

  let b; try { b = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  const name = String(b.name || '').replace(/[^\w \-.']/g, '').trim().slice(0, 16) || 'Anonymous';
  const score = Math.floor(+b.score);
  if (!Number.isFinite(score) || score < 1 || score > 50000) return json({ error: 'bad score' }, 400);

  const keys = periodKeys(Date.now());
  const boards = await readBoards(KV, keys);
  for (const per of PERIODS) {
    const top = boards[per];
    const i = top.findIndex(e => e.name === name);
    if (i >= 0) {
      if (top[i].score >= score) continue;                  // not a new personal best on this board
      top.splice(i, 1);
    }
    top.push({ name, score, t: Date.now() });
    top.sort((a, b2) => b2.score - a.score);
    if (top.length > 50) top.length = 50;
    const opt = TTL[per] ? { expirationTtl: TTL[per] } : undefined;
    await KV.put(keys[per], JSON.stringify(top), opt);
  }
  await KV.put('rl:' + ip, String(Date.now()), { expirationTtl: 60 });
  return json({ ...boards, top: boards.all });
}

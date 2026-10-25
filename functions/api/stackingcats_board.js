// Stacking Cats: daily challenge leaderboard (Cloudflare Pages Function).
//
// Uses the same KV binding as the other boards (BOARD). Without it this returns 503 and the game
// quietly hides the board.
//
//   GET  /api/stackingcats_board?day=2026-10-25 -> { day, top: [{name,score,wave,kills}], all: [...] }
//   POST /api/stackingcats_board {name,score,wave,kills,day} -> best per name on that day and all time,
//                                  20s per-IP write throttle, returns both boards.

const json = (o, s) => new Response(JSON.stringify(o), {
  status: s || 200,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
});
const kv = (env) => env.BOARD || env.board || env.Board || null;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const p2 = (n) => String(n).padStart(2, '0');
const dayOf = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; };
// a day is acceptable if it is today, yesterday or tomorrow (UTC), so clocks that are a bit off still work
const dayOk = (day, now) => DAY_RE.test(day) && [-1, 0, 1].some((k) => dayOf(now + k * 86400000) === day);
const DAY_TTL = 5 * 86400; // KV needs at least 60 seconds

async function read(KV, key) { try { return JSON.parse((await KV.get(key)) || '[]'); } catch (e) { return []; } }

export async function onRequestGet({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  const now = Date.now();
  let day = new URL(request.url).searchParams.get('day') || dayOf(now);
  if (!dayOk(day, now)) day = dayOf(now);
  return json({ day, top: await read(KV, 'sc:d:' + day), all: await read(KV, 'sc:all') });
}

export async function onRequestPost({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  const ip = request.headers.get('cf-connecting-ip') || '?';
  const last = await KV.get('scrl:' + ip);
  if (last && Date.now() - +last < 20000) return json({ error: 'slow down' }, 429);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const now = Date.now();
  const name = String(b.name || '').replace(/[^\w \-.']/g, '').trim().slice(0, 12) || 'Anonymous';
  const wave = Math.floor(+b.wave), kills = Math.floor(+b.kills), score = Math.floor(+b.score);
  const day = String(b.day || '');
  if (!dayOk(day, now)) return json({ error: 'bad day' }, 400);
  if (![wave, kills, score].every(Number.isFinite) || wave < 1 || wave > 300 || kills < 0 || kills > wave * 80 || score < 1 || score > 1000000) return json({ error: 'bad score' }, 400);
  const entry = { name, score, wave, kills, t: now };
  const result = {};
  for (const [key, ttl] of [['sc:d:' + day, DAY_TTL], ['sc:all', 0]]) {
    const top = await read(KV, key);
    const i = top.findIndex((e) => e.name === name);
    if (i >= 0 && top[i].score >= score) { result[key] = top; continue; }
    if (i >= 0) top.splice(i, 1);
    top.push(entry);
    top.sort((a, c) => c.score - a.score);
    if (top.length > 50) top.length = 50;
    await KV.put(key, JSON.stringify(top), ttl ? { expirationTtl: ttl } : undefined);
    result[key] = top;
  }
  await KV.put('scrl:' + ip, String(now), { expirationTtl: 60 });
  return json({ day, top: result['sc:d:' + day], all: result['sc:all'] });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' } });
}

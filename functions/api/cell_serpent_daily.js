// Cell Serpent: Daily Challenge leaderboard (Cloudflare Pages Function).
//
// Deployed automatically by Cloudflare Pages from this repo's /functions dir as /api/cell_serpent_daily.
// Reuses the existing KV binding BOARD (keys are prefixed 'csd:' so it never touches other games). Without the
// binding it answers 503 and the game hides the board.
//
//   GET  /api/cell_serpent_daily        -> { day, top:[{name,score,t},...] }   today's board (UTC day)
//   POST /api/cell_serpent_daily {name,score} -> validates and clamps, keeps each name's best, short per-IP write
//                                         throttle, caps 50, returns { day, top, rank }.
// The day is always taken from the server clock: client input can never build a KV key.

const json = (o, s) => new Response(JSON.stringify(o), {
  status: s || 200,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
});
const kv = (env) => env.BOARD || env.board || env.Board || null;
const CAP = 50, MAX_SCORE = 3000, TTL = 3 * 86400, THROTTLE_MS = 8000;
const p2 = (n) => String(n).padStart(2, '0');
export function dayId(now) { const d = new Date(now); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); }
export const cleanName = (s) => String(s || '').replace(/[^\w \-.']/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);

export async function onRequestGet({ env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  const day = dayId(Date.now());
  return json({ day, top: JSON.parse((await KV.get('csd:d:' + day)) || '[]') });
}

export async function onRequestPost({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  const ip = request.headers.get('cf-connecting-ip') || '?';
  // KV's minimum expirationTtl is 60 s (smaller throws and 500s), so the short window is a stored timestamp.
  const last = await KV.get('csd:rl:' + ip);
  if (last && Date.now() - +last < THROTTLE_MS) return json({ error: 'slow down' }, 429);
  let body; try { body = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  const name = cleanName(body.name) || 'Anonymous';
  const score = Math.floor(+body.score);
  if (!Number.isFinite(score) || score < 1 || score > MAX_SCORE) return json({ error: 'bad score' }, 400);
  const day = dayId(Date.now()), key = 'csd:d:' + day;
  const top = JSON.parse((await KV.get(key)) || '[]');
  const stamp = async () => { await KV.put('csd:rl:' + ip, String(Date.now()), { expirationTtl: 60 }); };
  const i = top.findIndex((e) => e.name === name);
  if (i >= 0) {
    if (top[i].score >= score) { await stamp(); return json({ day, top, rank: i + 1 }); }
    top.splice(i, 1);
  }
  top.push({ name, score, t: Date.now() });
  top.sort((a, b) => b.score - a.score || a.t - b.t);
  if (top.length > CAP) top.length = CAP;
  await KV.put(key, JSON.stringify(top), { expirationTtl: Math.max(60, TTL) });
  await stamp();
  return json({ day, top, rank: top.findIndex((e) => e.name === name) + 1 });
}

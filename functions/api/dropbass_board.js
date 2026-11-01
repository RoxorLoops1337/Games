// Drop the Bass: endless and daily leaderboards (Cloudflare Pages Function).
//
// Deployed automatically by Cloudflare Pages from this repo's /functions dir as https://<site>/api/dropbass_board.
// It reuses the existing KV binding BOARD (every key is prefixed 'dtb:' so it never touches other games). Without the
// binding it answers 503 and the game hides the board.
//
//   GET  /api/dropbass_board?b=endless:<world>   -> { top:[{name,score,t},...] }   all-time, per stage
//   GET  /api/dropbass_board?b=daily             -> { top:[...] }                  today's daily challenge (UTC day)
//   POST /api/dropbass_board {b,name,score}      -> validates and clamps, keeps each name's best, 30s per-IP write
//                                                   throttle, caps 50, returns { top }.
// The board id is whitelisted: client input can never build an arbitrary KV key.

const json = (o, s) => new Response(JSON.stringify(o), {
  status: s || 200,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
});
const kv = (env) => env.BOARD || env.board || env.Board || null;
const WORLDS = ['garage', 'busk', 'club', 'festival', 'arena'];
const CAP = 50;
const p2 = (n) => String(n).padStart(2, '0');

function boardKey(b, now) {
  if (b === 'daily') { const d = new Date(now); return { key: 'dtb:d:' + d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()), ttl: 3 * 86400, max: 20 }; }
  if (typeof b === 'string' && b.startsWith('endless:') && WORLDS.includes(b.slice(8))) return { key: 'dtb:e:' + b.slice(8), ttl: 0, max: 2000 };
  return null;
}

export async function onRequestGet({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  const b = request ? new URL(request.url).searchParams.get('b') : null;
  const k = boardKey(b, Date.now());
  if (!k) return json({ error: 'bad board' }, 400);
  return json({ top: JSON.parse((await KV.get(k.key)) || '[]') });
}

export async function onRequestPost({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  const ip = request.headers.get('cf-connecting-ip') || '?';
  const last = await KV.get('dtb:rl:' + ip);
  if (last && Date.now() - +last < 30000) return json({ error: 'slow down' }, 429);
  let body; try { body = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  const k = boardKey(body.b, Date.now());
  if (!k) return json({ error: 'bad board' }, 400);
  const name = String(body.name || '').replace(/[^\w \-.']/g, '').trim().slice(0, 16) || 'Anonymous';
  const score = Math.floor(+body.score);
  if (!Number.isFinite(score) || score < 1 || score > k.max) return json({ error: 'bad score' }, 400);
  const top = JSON.parse((await KV.get(k.key)) || '[]');
  const i = top.findIndex((e) => e.name === name);
  const stamp = async () => { await KV.put('dtb:rl:' + ip, String(Date.now()), { expirationTtl: 60 }); };
  if (i >= 0) {
    if (top[i].score >= score) { await stamp(); return json({ top }); }
    top.splice(i, 1);
  }
  top.push({ name, score, t: Date.now() });
  top.sort((a, c) => c.score - a.score);
  if (top.length > CAP) top.length = CAP;
  await KV.put(k.key, JSON.stringify(top), k.ttl ? { expirationTtl: Math.max(60, k.ttl) } : undefined);
  await stamp();
  return json({ top });
}

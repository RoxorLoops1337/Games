// No Room For Heroes — cloud saves (Cloudflare Pages Function).
//
// Shares the leaderboard's KV namespace (binding BOARD, any casing) with a
// key prefix. A save is stored under a random sync code; the code is the
// bearer key. Saves expire after a year of no writes (refreshed on backup).
//
//   GET  /api/save?code=XXXX-XXXX   → { data } | 404
//   POST /api/save {code?, data}    → validates, stores, returns { code }
//        (10s per-IP write throttle, data capped at 20 KB)

const json = (o, s) => new Response(JSON.stringify(o), {
  status: s || 200,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
});
const kv = env => env.BOARD || env.board || env.Board || null;
const CODE_RE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;   // no 0/O/1/I lookalikes
const TTL = 365 * 24 * 3600;

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  const r = new Uint8Array(8); crypto.getRandomValues(r);
  for (let i = 0; i < 8; i++) c += A[r[i] % A.length];
  return c.slice(0, 4) + '-' + c.slice(4);
}

export async function onRequestGet({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  const code = (new URL(request.url).searchParams.get('code') || '').toUpperCase();
  if (!CODE_RE.test(code)) return json({ error: 'bad code' }, 400);
  const raw = await KV.get('save:' + code);
  if (!raw) return json({ error: 'not found' }, 404);
  return json({ data: JSON.parse(raw) });
}

export async function onRequestPost({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  const ip = request.headers.get('cf-connecting-ip') || '?';
  if (await KV.get('srl:' + ip)) return json({ error: 'slow down' }, 429);

  let b; try { b = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  const data = b && b.data;
  if (!data || typeof data !== 'object' || !data.runes || !data.town) return json({ error: 'bad save' }, 400);
  const raw = JSON.stringify(data);
  if (raw.length > 20000) return json({ error: 'save too large' }, 400);

  let code = String(b.code || '').toUpperCase();
  if (code && !CODE_RE.test(code)) return json({ error: 'bad code' }, 400);
  if (!code) code = newCode();

  await KV.put('save:' + code, raw, { expirationTtl: TTL });
  await KV.put('srl:' + ip, '1', { expirationTtl: 10 });
  return json({ code });
}

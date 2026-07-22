// Dungeon Pusher — cloud saves (Cloudflare Pages Function).
//
// Shares the leaderboard's KV namespace (binding DPBOARD, any casing) under
// a 'dpsave:' prefix — the one dashboard step from the board PR covers this
// too. A profile is stored under a random sync code; the code is the bearer
// key. Saves expire after a year of no touches (refreshed on read AND write).
//
//   GET  /api/dungeon_save?code=XXXX-XXXX  → { data, t } | 404
//   POST /api/dungeon_save {code?, data}   → validates, stores { t, data },
//        returns { code, t }. 10s per-IP write throttle, data capped at 64 KB
//        (a deep-floor run carries its whole pile).

const json = (o, s) => new Response(JSON.stringify(o), {
  status: s || 200,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
});
const kv = env => env.DPBOARD || env.dpboard || env.DpBoard || env.Dpboard || null;
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
  const raw = await KV.get('dpsave:' + code);
  if (!raw) return json({ error: 'not found' }, 404);
  await KV.put('dpsave:' + code, raw, { expirationTtl: TTL });   // a read keeps it alive
  const env2 = JSON.parse(raw);
  return json({ data: env2.data, t: env2.t || 0 });
}

export async function onRequestPost({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  const ip = request.headers.get('cf-connecting-ip') || '?';
  // 10s per-IP write throttle. KV's MINIMUM expirationTtl is 60s (a smaller
  // value makes put() throw → the whole request 500s), so the key stores a
  // timestamp and lives 60s while the comparison enforces the real 10s window.
  const last = await KV.get('dsrl:' + ip);
  if (last && Date.now() - +last < 10000) return json({ error: 'slow down' }, 429);

  let b; try { b = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  const data = b && b.data;
  // a real Dungeon Pusher blob always carries its schema stamp + the bests
  if (!data || typeof data !== 'object' || !(data.sv >= 1) || !data.best) {
    return json({ error: 'bad save' }, 400);
  }
  const t = Date.now();
  const raw = JSON.stringify({ t, data });
  if (raw.length > 65536) return json({ error: 'save too large' }, 400);

  let code = String(b.code || '').toUpperCase();
  if (code && !CODE_RE.test(code)) return json({ error: 'bad code' }, 400);
  if (!code) {
    code = newCode();
    for (let i = 0; i < 5 && await KV.get('dpsave:' + code); i++) code = newCode();
  }

  await KV.put('dpsave:' + code, raw, { expirationTtl: TTL });
  await KV.put('dsrl:' + ip, String(Date.now()), { expirationTtl: 60 });
  return json({ code, t });
}

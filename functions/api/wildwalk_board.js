// Wildwalk — all-time distance leaderboard (Cloudflare Pages Function).
//
// Deployed automatically by Cloudflare Pages from this repo's /functions dir
// as https://<site>/api/wildwalk_board. Requires ONE dashboard step: in the
// Pages project → Settings → Bindings → add a KV namespace binding named
// WWBOARD (its own namespace — do NOT reuse No Room For Heroes' BOARD).
// Until that binding exists this returns 503 and the game hides the board.
//
// One all-time board PER DIFFICULTY, ranked by distance descending, best-per-name.
//   - Normal is the LEGACY board under 'ww:top' (existing entries survive as-is).
//   - Casual/Hard live under 'ww:top:casual' / 'ww:top:hard'.
// The difficulty selector is whitelisted (never trust client input to build a
// KV key) — anything unknown falls back to the Normal/legacy board.
//
//   GET  /api/wildwalk_board[?diff=casual|normal|hard]  → { top:[{name,dist,tier,t},...] }
//   POST /api/wildwalk_board {name,dist,tier[,diff]}    → validates/clamps, keeps each
//                              name's best distance, 30s per-IP write throttle,
//                              caps 50, returns { top:[...] }.

const json = (o, s) => new Response(JSON.stringify(o), {
  status: s || 200,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
});

// binding variable names are case-sensitive in the dashboard — accept any casing
const kv = env => env.WWBOARD || env.wwboard || env.WwBoard || env.Wwboard || null;

const LEGACY_KEY = 'ww:top';   // Normal board (no TTL — never expires; also the back-compat default)
const CAP = 50;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Whitelist the difficulty → KV key. 'normal'/undefined/anything-unknown map to
// the legacy 'ww:top'. Casual/Hard get their own suffixed keys. Client input can
// NEVER build an arbitrary key — only these three literal keys are reachable.
function boardKey(diff) {
  if (diff === 'casual') return 'ww:top:casual';
  if (diff === 'hard') return 'ww:top:hard';
  return LEGACY_KEY;            // 'normal', undefined, or any non-whitelisted value
}

export async function onRequestGet({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  // request is always present on the real platform; guard so a diff-less caller
  // still resolves to the legacy Normal board.
  const diff = request ? new URL(request.url).searchParams.get('diff') : null;
  const top = JSON.parse((await KV.get(boardKey(diff))) || '[]');
  return json({ top });
}

export async function onRequestPost({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);

  const ip = request.headers.get('cf-connecting-ip') || '?';
  // 30s per-IP throttle — global across all boards (one write per IP per 30s).
  // KV's minimum expirationTtl is 60s (smaller throws → 500), so store a
  // timestamp and compare for the real window.
  const last = await KV.get('rl:' + ip);
  if (last && Date.now() - +last < 30000) return json({ error: 'slow down' }, 429);

  let b; try { b = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }

  const key = boardKey(b.diff);   // whitelisted — bogus diff falls back to legacy Normal board

  // Sanitize/clamp everything. name regex strips control chars + HTML/injection
  // vectors (only \w, space, dash, dot, apostrophe survive), capped 16 chars.
  const name = String(b.name || '').replace(/[^\w \-.']/g, '').trim().slice(0, 16) || 'Anonymous';
  const dist = Math.floor(+b.dist);
  if (!Number.isFinite(dist) || dist < 1 || dist > 100000) return json({ error: 'bad dist' }, 400);
  const tier = clamp(Math.floor(+b.tier) || 1, 1, 999);

  const top = JSON.parse((await KV.get(key)) || '[]');
  const i = top.findIndex(e => e.name === name);
  if (i >= 0) {
    if (top[i].dist >= dist) {                                // not a new personal best
      await KV.put('rl:' + ip, String(Date.now()), { expirationTtl: 60 });
      return json({ top });
    }
    top.splice(i, 1);
  }
  top.push({ name, dist, tier, t: Date.now() });
  top.sort((a, b2) => b2.dist - a.dist);
  if (top.length > CAP) top.length = CAP;
  await KV.put(key, JSON.stringify(top));                     // all-time: no TTL
  await KV.put('rl:' + ip, String(Date.now()), { expirationTtl: 60 });
  return json({ top });
}

// Boss Monster — endless leaderboard (Cloudflare Pages Function).
//
// Deployed automatically by Cloudflare Pages from this repo's /functions dir
// as https://<site>/api/board. Requires ONE dashboard step: in the Pages
// project → Settings → Bindings → add a KV namespace binding named BOARD.
// Until that binding exists this returns 503 and the game hides the board.
//
//   GET  /api/board            → { top: [{name, score, t}, …] }   (top 50)
//   POST /api/board {name,score} → validates, keeps each name's best,
//                                  30s per-IP write throttle, returns new top.

const json = (o, s) => new Response(JSON.stringify(o), {
  status: s || 200,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
});

export async function onRequestGet({ env }) {
  if (!env.BOARD) return json({ error: 'not configured' }, 503);
  const top = JSON.parse((await env.BOARD.get('top')) || '[]');
  return json({ top });
}

export async function onRequestPost({ request, env }) {
  if (!env.BOARD) return json({ error: 'not configured' }, 503);
  const ip = request.headers.get('cf-connecting-ip') || '?';
  if (await env.BOARD.get('rl:' + ip)) return json({ error: 'slow down' }, 429);

  let b; try { b = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  const name = String(b.name || '').replace(/[^\w \-.']/g, '').trim().slice(0, 16) || 'Anonymous';
  const score = Math.floor(+b.score);
  if (!Number.isFinite(score) || score < 1 || score > 50000) return json({ error: 'bad score' }, 400);

  const top = JSON.parse((await env.BOARD.get('top')) || '[]');
  const i = top.findIndex(e => e.name === name);
  if (i >= 0) {
    if (top[i].score >= score) return json({ top, kept: true });   // not a new personal best
    top.splice(i, 1);
  }
  top.push({ name, score, t: Date.now() });
  top.sort((a, b2) => b2.score - a.score);
  if (top.length > 50) top.length = 50;

  await env.BOARD.put('top', JSON.stringify(top));
  await env.BOARD.put('rl:' + ip, '1', { expirationTtl: 30 });
  return json({ top });
}

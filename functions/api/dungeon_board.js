// Dungeon Pusher — global leaderboard (Cloudflare Pages Function).
//
// Deployed automatically from /functions as https://<site>/api/dungeon_board.
// Requires ONE dashboard step: Pages project → Settings → Bindings → add a KV
// namespace binding named DPBOARD (its own namespace — don't reuse BOARD or
// WWBOARD). Until the binding exists this returns 503 and the game shows the
// board as unreachable instead of breaking.
//
// STRONGLY RECOMMENDED second step: add an environment SECRET named
// DPBOARD_SECRET (any long random string). With it set, every carve must
// present a signed RUN TOKEN this server issued at the start of the run —
// see "the anti-cheat rail" below. Without it the boards still work, but
// only the plausibility clamps apply, so anyone who can read the JS can POST
// a fake score. The secret is the difference between "annoying to cheat" and
// "trivial to cheat", and costs one dashboard field.
//
// FIVE boards, ranked by floor desc then kills desc, best-per-name:
//   all      dp:top                  (no TTL — the wall of record)
//   day      dp:day:<YYYY-MM-DD>     (3-day TTL, stale days sweep themselves)
//   week     dp:week:<monday>        (16-day TTL)
//   month    dp:month:<YYYY-MM>      (60-day TTL — last month survives to
//                                     crown a champion's plaque)
//   year     dp:year:<YYYY>          (400-day TTL — last year survives too)
// Every key's date comes from the SERVER clock; client input never builds a
// KV key. ONE carve updates ALL FIVE, so the per-IP throttle never forces a
// choice between boards.
//
//   GET  /api/dungeon_board[?board=daily|weekly|monthly|yearly
//                                  |yesterday|lastmonth|alltime]
//        → { top, day }
//   POST /api/dungeon_board {op:'start'}
//        → { tok } — a signed, single-use run token, stamped with the
//          server's clock. The client holds it for the length of the run.
//   POST /api/dungeon_board {op:'carve', tok, name, floor, kills, hero, diff}
//        → validates/clamps, keeps each name's best on each board,
//          30s per-IP write throttle, caps 50, returns { top, daily, day }.
//
// ---------------------------------------------------------------- the rail
// A browser game's client can always be tampered with: nothing served to a
// player can PROVE a score is honest. What this rail does is make a fake
// score cost real time and make casual forgery fail outright:
//   1. a carve needs a token this server signed (HMAC-SHA256) — you cannot
//      mint one, and the game only asks for one when a run actually begins
//   2. that token is SINGLE USE — one token, one carve, ever
//   3. the token carries the server's start time, so a run to floor N is
//      rejected unless at least MS_PER_FLOOR × N has actually elapsed. A
//      forged floor-200 run has to sit for twenty minutes before it lands
//   4. tokens expire after a day, so none can be stockpiled
//   5. plausibility clamps (floor ceiling, kills-per-floor ceiling) throw out
//      the absurd entries that make a board worthless to read
// Deliberately NOT claimed: this does not stop a patient, determined attacker
// who scripts the token dance. It stops drive-by cheating and keeps the wall
// readable, which is what a leaderboard actually needs.

const json = (o, s) => new Response(JSON.stringify(o), {
  status: s || 200,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
});

// binding variable names are case-sensitive in the dashboard — accept any casing
const kv = env => env.DPBOARD || env.dpboard || env.DpBoard || env.Dpboard || null;
const secretOf = env => env.DPBOARD_SECRET || env.dpboard_secret || env.DpboardSecret || null;

const TOP_KEY = 'dp:top';
const CAP = 50;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// ------------------------------------------------------------ server dates
const p2 = n => String(n).padStart(2, '0');
const ymd = d => d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
const utcDay = (now) => ymd(new Date(now));
const utcYesterday = now => ymd(new Date(now - 86400000));
const utcMonth = now => utcDay(now).slice(0, 7);
const utcYear = now => String(new Date(now).getUTCFullYear());
const utcMonday = (now) => {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));   // 0 = Monday
  return ymd(d);
};
const utcLastMonth = (now) => {
  const d = new Date(now);
  d.setUTCDate(1); d.setUTCDate(0);            // the last day of the previous month
  return d.toISOString().slice(0, 7);
};

// every board that ONE carve feeds, with the TTL that sweeps it
const PERIODS = ['day', 'week', 'month', 'year', 'all'];
const TTL = {
  day: 3 * 86400,
  week: 16 * 86400,
  month: 60 * 86400,
  year: 400 * 86400,
  all: 0,                                      // 0 = never expires
};
const periodKeys = now => ({
  day: 'dp:day:' + utcDay(now),
  week: 'dp:week:' + utcMonday(now),
  month: 'dp:month:' + utcMonth(now),
  year: 'dp:year:' + utcYear(now),
  all: TOP_KEY,
});

const BAK_TTL = 35 * 86400;

// ------------------------------------------------------------- the clamps
const MAX_FLOOR = 300;          // ten times the deepest achievement — absurd entries die here
const MAX_KILLS = 99999;
const killCeil = floor => floor * 60 + 100;    // no run kills more than this per floor

// --------------------------------------------------------------- the token
const MS_PER_FLOOR = 6000;      // the floor of believable pace (real play is far slower)
const MIN_RUN_MS = 15000;       // even floor 1 takes longer than this
const TOKEN_TTL_MS = 24 * 3600 * 1000;
const USED_TTL = 25 * 3600;     // outlives the token, so a spent nonce can't come back

const enc = s => new TextEncoder().encode(s);
const b64url = bytes => btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc(msg))));
}
// length-independent compare — never leak where two signatures diverge
function sameSig(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function mintToken(secret, now) {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const body = nonce + '.' + now;
  return body + '.' + await sign(secret, body);
}
// → { ok:true, nonce, iat } | { ok:false, why }
async function readToken(secret, tok, now) {
  if (typeof tok !== 'string' || tok.length > 200) return { ok: false, why: 'no token' };
  const parts = tok.split('.');
  if (parts.length !== 3) return { ok: false, why: 'bad token' };
  const [nonce, iatStr, sig] = parts;
  if (!sameSig(sig, await sign(secret, nonce + '.' + iatStr))) return { ok: false, why: 'bad token' };
  const iat = +iatStr;
  if (!Number.isFinite(iat) || iat > now + 60000) return { ok: false, why: 'bad token' };
  if (now - iat > TOKEN_TTL_MS) return { ok: false, why: 'token expired' };
  return { ok: true, nonce, iat };
}

// ------------------------------------------------------------ the ranking
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
  const now = Date.now();
  const which = request ? new URL(request.url).searchParams.get('board') : null;
  // whitelist — nothing else reachable ('yesterday' feeds the title stamp,
  // 'lastmonth' the champion's plaque)
  const key = which === 'daily' ? 'dp:day:' + utcDay(now)
            : which === 'weekly' ? 'dp:week:' + utcMonday(now)
            : which === 'monthly' ? 'dp:month:' + utcMonth(now)
            : which === 'yearly' ? 'dp:year:' + utcYear(now)
            : which === 'yesterday' ? 'dp:day:' + utcYesterday(now)
            : which === 'lastmonth' ? 'dp:month:' + utcLastMonth(now)
            : TOP_KEY;
  const top = JSON.parse((await KV.get(key)) || '[]');
  const day = which === 'weekly' ? utcMonday(now)
            : which === 'yearly' ? utcYear(now)
            : which === 'yesterday' ? utcYesterday(now)
            : which === 'monthly' ? utcMonth(now)
            : which === 'lastmonth' ? utcLastMonth(now)
            : utcDay(now);
  return json({ top, day });
}

export async function onRequestPost({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  const secret = secretOf(env);
  const now = Date.now();

  let b; try { b = await request.json(); } catch (_) { return json({ error: 'bad json' }, 400); }

  // ---- op:'start' — hand out a run token. Cheap, unthrottled by the carve
  // rail (a token is worthless on its own), but still rate-limited per IP so
  // it can't be used to hammer the worker.
  if (b && b.op === 'start') {
    if (!secret) return json({ tok: '', unsigned: 1 });   // legacy mode: nothing to sign with
    const ip = request.headers.get('cf-connecting-ip') || '?';
    const lastTok = await KV.get('rlt:' + ip);
    if (lastTok && now - +lastTok < 3000) return json({ error: 'slow down' }, 429);
    await KV.put('rlt:' + ip, String(now), { expirationTtl: 60 });
    return json({ tok: await mintToken(secret, now) });
  }

  const ip = request.headers.get('cf-connecting-ip') || '?';
  // 30s per-IP throttle. KV's minimum expirationTtl is 60s (smaller throws →
  // 500), so store a timestamp and compare for the real window.
  const last = await KV.get('rl:' + ip);
  if (last && now - +last < 30000) return json({ error: 'slow down' }, 429);

  // Sanitize/clamp everything. The name regex strips control chars + HTML
  // vectors (only \w, space, dash, dot, apostrophe survive), capped 12 chars.
  const name = String(b.name || '').replace(/[^\w \-.']/g, '').trim().slice(0, 12) || 'Anonymous';
  const floor = Math.floor(+b.floor);
  if (!Number.isFinite(floor) || floor < 1 || floor > MAX_FLOOR) return json({ error: 'bad floor' }, 400);
  const kills = clamp(Math.floor(+b.kills) || 0, 0, MAX_KILLS);
  // a run cannot have killed more than the deep can field
  if (kills > killCeil(floor)) return json({ error: 'implausible run' }, 422);
  const hero = String(b.hero || '').replace(/[^a-z]/g, '').slice(0, 12) || 'knight';
  const diff = ['merciful', 'normal', 'nightmare'].indexOf(b.diff) >= 0 ? b.diff : 'normal';

  // ---- the token rail. Only enforced once a secret is configured, so the
  // board keeps working on a fresh deploy; add DPBOARD_SECRET to switch it on.
  let verified = 0;
  if (secret) {
    const t = await readToken(secret, b.tok, now);
    if (!t.ok) return json({ error: t.why }, 403);
    // one token, one carve, ever
    const usedKey = 'dp:used:' + t.nonce;
    if (await KV.get(usedKey)) return json({ error: 'token already spent' }, 409);
    // a run to floor N cannot be faster than the deep allows
    const elapsed = now - t.iat;
    if (elapsed < Math.max(MIN_RUN_MS, floor * MS_PER_FLOOR)) {
      return json({ error: 'run too fast to be real' }, 422);
    }
    await KV.put(usedKey, '1', { expirationTtl: USED_TTL });
    verified = 1;
  }

  const entry = { name, floor, kills, hero, diff, d: b.daily ? 1 : 0,
                  ng: clamp(b.ng | 0, 0, 2),                    // 0 plain, 1 NG+ ♟, 2 LEGEND ♛
                  v: clamp(b.v | 0, 0, 99),                     // client version — future filters key on it
                  k: verified,                                  // carved behind the token rail
                  t: now };

  const keys = periodKeys(now);
  const boards = {};
  for (const per of PERIODS) boards[per] = JSON.parse((await KV.get(keys[per])) || '[]');
  for (const per of PERIODS) {
    if (!fold(boards[per], entry)) continue;                    // no personal best here
    const opt = TTL[per] ? { expirationTtl: TTL[per] } : undefined;
    await KV.put(keys[per], JSON.stringify(boards[per]), opt);
  }
  // lazy weekly backup of the one board that never expires: first write of
  // each week snapshots dp:top (cheap insurance, no cron needed)
  const bakKey = 'dp:top:bak:' + utcMonday(now);
  if (!(await KV.get(bakKey))) await KV.put(bakKey, JSON.stringify(boards.all), { expirationTtl: BAK_TTL });
  await KV.put('rl:' + ip, String(now), { expirationTtl: 60 });
  return json({ top: boards.all, daily: boards.day, weekly: boards.week,
                monthly: boards.month, yearly: boards.year, day: utcDay(now) });
}

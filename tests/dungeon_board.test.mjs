// Dungeon Pusher leaderboard Pages Function: validation/clamps, floor-then-kills
// ranking, best-per-name on BOTH boards from one POST, throttle, cap, dated
// daily key with a legal TTL, 503 fallback (never 500 on a missing binding).
//
//   node tests/dungeon_board.test.mjs   (or: npm run test:dpboard)
import { onRequestGet, onRequestPost } from '../functions/api/dungeon_board.js';

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) { passed++; } else { failed++; console.error(`FAIL: ${msg}`); } }

function mockKV() {
  const store = new Map();
  const ttls = new Map();
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    // real Cloudflare KV rejects expirationTtl < 60 (the whole request then
    // 500s) — enforce it here so a regression can't pass the suite
    async put(k, v, opt) {
      if (opt && opt.expirationTtl != null && opt.expirationTtl < 60)
        throw new Error('expirationTtl must be at least 60');
      store.set(k, String(v));
      if (opt && opt.expirationTtl != null) ttls.set(k, opt.expirationTtl);
    },
    _store: store, _ttls: ttls,
  };
}
const post = (env, body, ip) => onRequestPost({
  env,
  request: new Request('http://x/api/dungeon_board', { method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip || '1.1.1.1' },
    body: JSON.stringify(body) }),
});
const get = (env, board) => onRequestGet({
  env,
  request: new Request('http://x/api/dungeon_board' + (board ? ('?board=' + board) : '')),
});
const DAY = new Date().toISOString().slice(0, 10);

// no binding → 503 (the game shows "unreachable" instead of breaking; NEVER 500)
let r = await onRequestGet({ env: {} });
ok(r.status === 503, 'GET without KV binding → 503');
r = await post({}, { name: 'x', floor: 3 });
ok(r.status === 503, 'POST without KV binding → 503 (not 500)');

// case-insensitive binding lookup
r = await onRequestGet({ env: { dpboard: mockKV() } });
ok(r.status === 200, 'lowercase binding name resolves');

const env = { DPBOARD: mockKV() };
r = await get(env);
let j = await r.json();
ok(r.status === 200 && Array.isArray(j.top) && j.top.length === 0 && j.day === DAY,
  'empty board → { top:[], day }');

// one POST lands on BOTH boards
r = await post(env, { name: 'Danhieux', floor: 9, kills: 30, hero: 'knight', diff: 'nightmare' });
j = await r.json();
ok(r.status === 200 && j.top.length === 1 && j.daily.length === 1 && j.top[0].floor === 9,
  'one POST feeds the all-time AND the daily board');
ok(env.DPBOARD._store.has('dp:top') && env.DPBOARD._store.has('dp:day:' + DAY),
  'stored under dp:top and the server-dated daily key');
ok(env.DPBOARD._ttls.get('dp:day:' + DAY) >= 60, 'the daily key carries a legal TTL');
ok(!env.DPBOARD._ttls.has('dp:top'), 'the all-time board never expires');

// same IP throttled for 30s
r = await post(env, { name: 'Danhieux', floor: 12, kills: 40 });
ok(r.status === 429, 'same IP throttled for 30s → 429');

// another IP: ranking is floor first, kills break the tie
r = await post(env, { name: 'Rox', floor: 9, kills: 45 }, '2.2.2.2');
j = await r.json();
ok(j.top[0].name === 'Rox' && j.top[1].name === 'Danhieux', 'equal floor — more kills ranks higher');
r = await post(env, { name: 'Thieu', floor: 11, kills: 1 }, '3.3.3.3');
j = await r.json();
ok(j.top[0].name === 'Thieu', 'a deeper floor outranks any kill count');

// best-per-name: a worse run never demotes, a better one replaces
r = await post(env, { name: 'Rox', floor: 5, kills: 2 }, '4.4.4.4');
j = await r.json();
ok(j.top.filter(e => e.name === 'Rox').length === 1 && j.top.find(e => e.name === 'Rox').floor === 9,
  'a worse run cannot demote a personal best');
r = await post(env, { name: 'Rox', floor: 14, kills: 3 }, '5.5.5.5');
j = await r.json();
ok(j.top[0].name === 'Rox' && j.top[0].floor === 14 && j.top.filter(e => e.name === 'Rox').length === 1,
  'a better run replaces the old entry');

// sanitize: HTML/injection vectors stripped, name capped at 12
r = await post(env, { name: '<img src=x>Bob!!', floor: 2, kills: 0 }, '6.6.6.6');
j = await r.json();
const bob = j.top.find(e => e.name.indexOf('Bob') >= 0);
ok(bob && bob.name.indexOf('<') < 0 && bob.name.length <= 12, 'name sanitized + capped (' + JSON.stringify(bob && bob.name) + ')');

// clamps: bogus floor rejected, hero/diff whitelisted
r = await post(env, { name: 'x', floor: 0 }, '7.7.7.7');
ok(r.status === 400, 'floor 0 rejected');
r = await post(env, { name: 'x', floor: 1e9 }, '7.7.7.7');
ok(r.status === 400, 'absurd floor rejected');
r = await post(env, { name: 'Zed', floor: 3, hero: 'DROP TABLE;', diff: 'impossible' }, '8.8.8.8');
j = await r.json();
const zed = j.top.find(e => e.name === 'Zed');
ok(zed && /^[a-z]*$/.test(zed.hero) && zed.diff === 'normal', 'hero sanitized, unknown diff falls back to normal');

// a daily run carries the calendar flag; a plain run doesn't
r = await post(env, { name: 'Cal', floor: 4, kills: 2, daily: 1 }, '10.10.10.10');
j = await r.json();
const cal = j.top.find(e => e.name === 'Cal');
ok(cal && cal.d === 1, 'a daily post wears the calendar flag');
ok(j.top.find(e => e.name === 'Thieu').d === 0, 'plain posts stay unflagged');
r = await post(env, { name: 'Pawn', floor: 6, kills: 3, ng: 1 }, '11.11.11.11');
j = await r.json();
ok(j.top.find(e => e.name === 'Pawn').ng === 1, 'a prestige post wears the pawn');
ok(j.top.find(e => e.name === 'Cal').ng === 0, 'plain posts stay pawnless');
r = await post(env, { name: 'Legend', floor: 7, kills: 3, ng: 2 }, '12.12.12.12');
j = await r.json();
ok(j.top.find(e => e.name === 'Legend').ng === 2, 'a legend post wears the crown');
r = await post(env, { name: 'Cheat', floor: 7, kills: 4, ng: 9 }, '13.13.13.13');
j = await r.json();
ok(j.top.find(e => e.name === 'Cheat').ng === 2, 'prestige clamps at the crown');

// GET ?board=daily reads the dated board
r = await get(env, 'daily');
j = await r.json();
ok(j.top.length >= 1 && j.day === DAY, 'GET ?board=daily serves the dated board');

// GET ?board=yesterday reads the previous UTC day (feeds the title stamp)
const YDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
await env.DPBOARD.put('dp:day:' + YDAY, JSON.stringify([{ name: 'Digger', floor: 31, kills: 9, hero: 'knight', diff: 'normal', t: 1 }]));
r = await get(env, 'yesterday');
j = await r.json();
ok(j.top.length === 1 && j.top[0].name === 'Digger' && j.day === YDAY,
  'GET ?board=yesterday serves the previous day, dated as such');
r = await get(env, 'lastweek');
j = await r.json();
ok(j.top.some(e => e.name === 'Thieu'), 'an unknown board param falls back to all-time');

// one POST also feeds the MONTHLY board, under the server's own month key
const MONTH = DAY.slice(0, 7);
ok(env.DPBOARD._store.has('dp:month:' + MONTH), 'posts land on dp:month:<YYYY-MM> too');
ok(env.DPBOARD._ttls.get('dp:month:' + MONTH) === 60 * 24 * 3600, 'the monthly key carries its sixty-day TTL');
r = await get(env, 'monthly');
j = await r.json();
ok(j.top.length >= 1 && j.day === MONTH, 'GET ?board=monthly serves the month, dated as such');
// last month's board serves the champion's plaque (seeded — a fresh month is empty)
{
  const d = new Date(); d.setUTCDate(1); d.setUTCDate(0);
  const LAST = d.toISOString().slice(0, 7);
  await env.DPBOARD.put('dp:month:' + LAST, JSON.stringify([{ name: 'Champ', floor: 28, kills: 400, hero: 'knight', diff: 'normal', t: 1 }]));
  r = await get(env, 'lastmonth');
  j = await r.json();
  ok(j.top[0].name === 'Champ' && j.day === LAST, 'GET ?board=lastmonth crowns the previous month');
}

// hygiene: entries carry a clamped client version, and the first post of
// each week lazily snapshots dp:top as a backup
r = await post(env, { name: 'Verse', floor: 8, kills: 1, v: 2 }, '14.14.14.14');
j = await r.json();
ok(j.top.find(e => e.name === 'Verse').v === 2, 'entries carry the client version');
r = await post(env, { name: 'Hax', floor: 8, kills: 2, v: 5000 }, '15.15.15.15');
j = await r.json();
ok(j.top.find(e => e.name === 'Hax').v === 99, 'the version clamps at 99');
{
  const wk = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const bak = env.DPBOARD._store.get('dp:top:bak:' + wk);
  ok(!!bak, 'the weekly backup exists after a post');
  ok(env.DPBOARD._ttls.get('dp:top:bak:' + wk) === 35 * 24 * 3600, 'with its 35-day TTL');
  const lenBefore = JSON.parse(bak).length;
  await post(env, { name: 'Later', floor: 9, kills: 9 }, '16.16.16.16');
  ok(JSON.parse(env.DPBOARD._store.get('dp:top:bak:' + wk)).length === lenBefore,
    'later posts never rewrite the week’s snapshot');
}

// the cap holds at 50
{
  const env2 = { DPBOARD: mockKV() };
  const big = [];
  for (let i = 0; i < 55; i++) big.push({ name: 'p' + i, floor: 100 - i, kills: i, hero: 'knight', diff: 'normal', t: 1 });
  await env2.DPBOARD.put('dp:top', JSON.stringify(big.slice(0, 50)));
  r = await post(env2, { name: 'newcomer', floor: 60, kills: 0 }, '9.9.9.9');
  j = await r.json();
  ok(j.top.length === 50, 'the board caps at 50');
  ok(j.top.some(e => e.name === 'newcomer'), 'a worthy newcomer squeezes in');
  ok(!j.top.some(e => e.name === 'p49'), 'the weakest entry falls off');
}

// ============================================================
// WEEKLY + YEARLY: one carve feeds all five boards
// ============================================================
{
  const env3 = { DPBOARD: mockKV() };
  const now = Date.now();
  const p2 = n => String(n).padStart(2, '0');
  const d = new Date(now);
  const mon = new Date(now);
  mon.setUTCDate(mon.getUTCDate() - ((mon.getUTCDay() + 6) % 7));
  const WEEK = mon.getUTCFullYear() + '-' + p2(mon.getUTCMonth() + 1) + '-' + p2(mon.getUTCDate());
  const YEAR = String(d.getUTCFullYear());

  r = await post(env3, { name: 'Deep', floor: 12, kills: 30 }, '20.0.0.1');
  j = await r.json();
  ok(r.status === 200, 'a carve lands');
  ok(env3.DPBOARD._store.has('dp:week:' + WEEK), 'and feeds dp:week:<monday>');
  ok(env3.DPBOARD._store.has('dp:year:' + YEAR), 'and dp:year:<YYYY>');
  ok(env3.DPBOARD._ttls.get('dp:week:' + WEEK) === 16 * 86400, 'the weekly key carries its 16-day TTL');
  ok(env3.DPBOARD._ttls.get('dp:year:' + YEAR) === 400 * 86400, 'the yearly key carries its 400-day TTL');
  ok(j.weekly.length === 1 && j.yearly.length === 1, 'the response carries both new boards');

  r = await get(env3, 'weekly');
  j = await r.json();
  ok(j.top.length === 1 && j.day === WEEK, 'GET ?board=weekly serves the week, dated by its Monday');
  r = await get(env3, 'yearly');
  j = await r.json();
  ok(j.top.length === 1 && j.day === YEAR, 'GET ?board=yearly serves the year, dated as such');

  // best-per-name holds on the new boards too
  await post(env3, { name: 'Deep', floor: 4, kills: 1 }, '20.0.0.2');
  const wk = JSON.parse(env3.DPBOARD._store.get('dp:week:' + WEEK));
  ok(wk.length === 1 && wk[0].floor === 12, 'a worse run cannot demote a weekly best');
}

// ============================================================
// THE PLAUSIBILITY CLAMPS (no secret needed)
// ============================================================
{
  const env4 = { DPBOARD: mockKV() };
  r = await post(env4, { name: 'Sky', floor: 301, kills: 1 }, '21.0.0.1');
  ok(r.status === 400, 'a floor past the ceiling is refused');
  r = await post(env4, { name: 'Sky', floor: 300, kills: 1 }, '21.0.0.2');
  ok(r.status === 200, 'the ceiling itself is allowed');
  r = await post(env4, { name: 'Grind', floor: 2, kills: 90000 }, '21.0.0.3');
  ok(r.status === 422, 'more kills than the deep can field is refused');
  r = await post(env4, { name: 'Grind', floor: 2, kills: 200 }, '21.0.0.4');
  ok(r.status === 200, 'a believable kill count for the floor passes');
}

// ============================================================
// THE TOKEN RAIL — only armed once DPBOARD_SECRET exists
// ============================================================
{
  const SECRET = 'test-secret-value';
  const env5 = { DPBOARD: mockKV(), DPBOARD_SECRET: SECRET };

  // mint a token by hand so the test can control the run's START time
  const b64url = bytes => Buffer.from(bytes).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function signTok(msg) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))));
  }
  const mint = async (nonce, iat) => {
    const body = nonce + '.' + iat;
    return body + '.' + await signTok(body);
  };

  // op:'start' hands out a real token
  r = await post(env5, { op: 'start' }, '22.0.0.1');
  j = await r.json();
  ok(r.status === 200 && typeof j.tok === 'string' && j.tok.split('.').length === 3,
    'op:start mints a three-part signed token');

  // no token at all → refused
  r = await post(env5, { name: 'Faker', floor: 40, kills: 20 }, '22.0.1.1');
  ok(r.status === 403, 'with a secret configured, a carve with NO token is refused');

  // a forged signature → refused
  r = await post(env5, { name: 'Faker', floor: 40, kills: 20, tok: 'abc.' + Date.now() + '.deadbeef' }, '22.0.2.1');
  ok(r.status === 403, 'a forged signature is refused');

  // a real token, but the run was instant → refused
  const fast = await mint('nonceFast', Date.now() - 1000);
  r = await post(env5, { name: 'Faker', floor: 40, kills: 20, tok: fast }, '22.0.3.1');
  ok(r.status === 422, 'a floor-40 run one second old is refused as too fast');

  // the same token, aged past the pace gate → accepted
  const good = await mint('nonceGood', Date.now() - 41 * 6000);
  r = await post(env5, { name: 'Honest', floor: 40, kills: 20, tok: good }, '22.0.4.1');
  j = await r.json();
  ok(r.status === 200, 'a run old enough for its depth is carved');
  ok(j.top.find(e => e.name === 'Honest').k === 1, 'and it is stamped as token-verified');

  // that token is spent — it can never carve again
  r = await post(env5, { name: 'Honest', floor: 41, kills: 21, tok: good }, '22.0.5.1');
  ok(r.status === 409, 'a spent token cannot carve twice');

  // an ancient token is refused
  const old2 = await mint('nonceOld', Date.now() - 26 * 3600 * 1000);
  r = await post(env5, { name: 'Stale', floor: 3, kills: 1, tok: old2 }, '22.0.6.1');
  ok(r.status === 403, 'a token older than a day is refused');

  // a token claiming to come from the future is refused
  const future = await mint('nonceFuture', Date.now() + 3600 * 1000);
  r = await post(env5, { name: 'Ahead', floor: 3, kills: 1, tok: future }, '22.0.7.1');
  ok(r.status === 403, 'a token dated in the future is refused');

  // without a secret the same tokenless carve still lands (legacy mode)
  const env6 = { DPBOARD: mockKV() };
  r = await post(env6, { name: 'Legacy', floor: 40, kills: 20 }, '23.0.0.1');
  j = await r.json();
  ok(r.status === 200, 'with NO secret configured a tokenless carve still lands');
  ok(j.top.find(e => e.name === 'Legacy').k === 0, 'but it is NOT stamped as verified');
  r = await post(env6, { op: 'start' }, '23.0.1.1');
  j = await r.json();
  ok(r.status === 200 && j.unsigned === 1, 'and op:start says plainly that it cannot sign');
}

console.log(`dungeon_pusher board fn: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

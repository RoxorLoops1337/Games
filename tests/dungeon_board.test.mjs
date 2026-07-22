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

// GET ?board=daily reads the dated board
r = await get(env, 'daily');
j = await r.json();
ok(j.top.length >= 1 && j.day === DAY, 'GET ?board=daily serves the dated board');

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

console.log(`dungeon_pusher board fn: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

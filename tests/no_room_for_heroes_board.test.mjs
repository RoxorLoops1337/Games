// Leaderboard Pages Function: validation, best-per-name, throttle, 503 fallback.
//
//   node tests/no_room_for_heroes_board.test.mjs   (or: npm run test:boss)
import { onRequestGet, onRequestPost } from '../functions/api/board.js';
import { harness } from './no_room_for_heroes_lib.mjs';

const t = harness('leaderboard fn');

function mockKV() {
  const store = new Map();
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    // real Cloudflare KV rejects expirationTtl < 60 (the whole request then
    // 500s) — enforce it here so a regression can't pass the suite
    async put(k, v, opt) {
      if (opt && opt.expirationTtl != null && opt.expirationTtl < 60)
        throw new Error('expirationTtl must be at least 60');
      store.set(k, String(v));
    },
    _store: store,
  };
}
const post = (env, body, ip) => onRequestPost({
  env,
  request: new Request('http://x/api/board', { method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip || '1.1.1.1' },
    body: JSON.stringify(body) }),
});

// no binding → 503 (the game shows "offline" instead of breaking)
let r = await onRequestGet({ env: {} });
t.ok(r.status === 503, 'GET without KV binding → 503');

const env = { BOARD: mockKV() };
r = await onRequestGet({ env });
t.ok(r.status === 200 && (await r.json()).top.length === 0, 'empty board');

r = await post(env, { name: 'Danhieux', score: 420 });
let top = (await r.json()).top;
t.ok(r.status === 200 && top.length === 1 && top[0].score === 420, 'first score lands');

// same name, lower score → kept best; throttle blocks rapid second write from same IP
r = await post(env, { name: 'Danhieux', score: 100 });
t.ok(r.status === 429, 'same IP throttled for 30s');
r = await post(env, { name: 'Danhieux', score: 100 }, '2.2.2.2');
t.ok((await r.json()).kept === true, 'lower score keeps the old best');
r = await post(env, { name: 'Danhieux', score: 999 }, '3.3.3.3');
top = (await r.json()).top;
t.ok(top.length === 1 && top[0].score === 999, 'higher score replaces, no duplicate names');

// validation: garbage scores and names
r = await post(env, { name: 'x', score: 1e9 }, '4.4.4.4');
t.ok(r.status === 400, 'absurd score rejected');
r = await post(env, { name: '<img onerror=alert(1)>', score: 50 }, '5.5.5.5');
top = (await r.json()).top;
t.ok(!top.some(e => /[<>]/.test(e.name)), 'names sanitized (no HTML)');

// sorting
r = await post(env, { name: 'Newbie', score: 12 }, '6.6.6.6');
top = (await r.json()).top;
t.ok(top[0].score >= top[top.length - 1].score, 'sorted descending');

t.done();

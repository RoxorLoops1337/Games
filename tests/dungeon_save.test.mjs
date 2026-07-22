// Dungeon Pusher cloud-save Pages Function: code format, validation, size cap,
// envelope timestamps, roundtrip, TTL refresh on read, throttle, 503 fallback.
//
//   node tests/dungeon_save.test.mjs   (or: npm run test:dpsave)
import { onRequestGet, onRequestPost } from '../functions/api/dungeon_save.js';

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) { passed++; } else { failed++; console.error(`FAIL: ${msg}`); } }

function mockKV() {
  const store = new Map();
  const ttls = new Map();
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
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
  request: new Request('http://x/api/dungeon_save', { method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip || '1.1.1.1' },
    body: JSON.stringify(body) }),
});
const get = (env, code) => onRequestGet({
  env,
  request: new Request('http://x/api/dungeon_save?code=' + encodeURIComponent(code || '')),
});
const GOOD = { sv: 2, best: { floor: 9 }, cogs: 12, boardName: 'Rox' };

// no binding → 503, never 500
let r = await onRequestGet({ env: {}, request: new Request('http://x/api/dungeon_save?code=AAAA-AAAA') });
ok(r.status === 503, 'GET without KV binding → 503');
r = await post({}, { data: GOOD });
ok(r.status === 503, 'POST without KV binding → 503');

const env = { DPBOARD: mockKV() };

// GET validation
r = await get(env, 'nope');
ok(r.status === 400, 'malformed code → 400');
r = await get(env, 'AAAA-AAAA');
ok(r.status === 404, 'unknown code → 404');

// POST validation: only a real-looking blob is accepted
r = await post(env, { data: { hello: 1 } }, '2.2.2.2');
ok(r.status === 400, 'a blob without sv/best is refused');
r = await post(env, { data: { ...GOOD, pad: 'x'.repeat(70000) } }, '3.3.3.3');
ok(r.status === 400, 'an oversized blob is refused');
r = await post(env, { code: 'lol', data: GOOD }, '4.4.4.4');
ok(r.status === 400, 'a malformed code on POST is refused');

// first backup mints a well-formed code and an envelope timestamp
r = await post(env, { data: GOOD }, '5.5.5.5');
let j = await r.json();
ok(r.status === 200 && /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(j.code), 'a fresh code is minted (' + j.code + ')');
ok(j.t > 0, 'the backup is timestamped');
const CODE = j.code;
ok(env.DPBOARD._ttls.get('dpsave:' + CODE) >= 60, 'the save carries a legal year TTL');

// same IP throttled
r = await post(env, { data: GOOD }, '5.5.5.5');
ok(r.status === 429, 'same IP throttled → 429');

// roundtrip: the blob comes back whole, and the read refreshes the TTL
env.DPBOARD._ttls.delete('dpsave:' + CODE);
r = await get(env, CODE.toLowerCase());
j = await r.json();
ok(r.status === 200 && j.data.cogs === 12 && j.data.boardName === 'Rox', 'GET returns the blob whole (case-insensitive code)');
ok(j.t > 0, 'GET returns the envelope timestamp');
ok(env.DPBOARD._ttls.get('dpsave:' + CODE) >= 60, 'a read refreshes the TTL');

// posting WITH the code overwrites the same slot with a fresh timestamp
const t1 = j.t;
await new Promise(res => setTimeout(res, 5));
r = await post(env, { code: CODE, data: { ...GOOD, cogs: 99 } }, '6.6.6.6');
j = await r.json();
ok(j.code === CODE && j.t >= t1, 'a re-backup keeps the code and advances the clock');
r = await get(env, CODE);
j = await r.json();
ok(j.data.cogs === 99, 'the slot holds the newest blob');
ok([...env.DPBOARD._store.keys()].filter(k => k.indexOf('dpsave:') === 0).length === 1, 'one code, one slot');

console.log(`dungeon_pusher save fn: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

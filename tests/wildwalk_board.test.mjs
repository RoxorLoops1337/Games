// Wildwalk leaderboard Pages Function: validation/clamps, best-per-name-by-dist,
// throttle, cap, 503 fallback (never 500 on a missing binding).
//
//   node tests/wildwalk_board.test.mjs   (or: npm run test:wwboard)
import { onRequestGet, onRequestPost } from '../functions/api/wildwalk_board.js';

let passed = 0, failed = 0;
function ok(cond, msg){ if(cond){ passed++; } else { failed++; console.error(`FAIL: ${msg}`); } }

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
  request: new Request('http://x/api/wildwalk_board', { method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip || '1.1.1.1' },
    body: JSON.stringify(body) }),
});
// GET with an optional ?diff= (mirrors how the browser hits the endpoint)
const get = (env, diff) => onRequestGet({
  env,
  request: new Request('http://x/api/wildwalk_board' + (diff ? ('?diff=' + encodeURIComponent(diff)) : '')),
});

// no binding → 503 (the game shows "offline" instead of breaking; NEVER 500)
let r = await onRequestGet({ env: {} });
ok(r.status === 503, 'GET without KV binding → 503');
r = await post({}, { name: 'x', dist: 10, tier: 1 });
ok(r.status === 503, 'POST without KV binding → 503 (not 500)');

// case-insensitive binding lookup
r = await onRequestGet({ env: { wwboard: mockKV() } });
ok(r.status === 200, 'lowercase binding name resolves');

const env = { WWBOARD: mockKV() };
r = await onRequestGet({ env });
let j = await r.json();
ok(r.status === 200 && Array.isArray(j.top) && j.top.length === 0, 'empty board → { top:[] }');

// first submit lands
r = await post(env, { name: 'Danhieux', dist: 420, tier: 3 });
j = await r.json();
ok(r.status === 200 && j.top.length === 1 && j.top[0].dist === 420 && j.top[0].tier === 3 && j.top[0].name === 'Danhieux',
  'first submit lands with dist+tier');
ok(env.WWBOARD._store.has('ww:top'), 'stored under ww:top key');

// same IP throttled for 30s
r = await post(env, { name: 'Danhieux', dist: 999, tier: 5 });
ok(r.status === 429, 'same IP throttled for 30s → 429');

// same name, lower dist from a fresh IP → old best kept, no dup
r = await post(env, { name: 'Danhieux', dist: 100, tier: 9 }, '2.2.2.2');
j = await r.json();
ok(j.top.length === 1 && j.top[0].dist === 420 && j.top[0].tier === 3, 'lower dist keeps old best (no downgrade)');

// higher dist replaces, no duplicate name
r = await post(env, { name: 'Danhieux', dist: 900, tier: 7 }, '3.3.3.3');
j = await r.json();
ok(j.top.length === 1 && j.top[0].dist === 900 && j.top[0].tier === 7, 'higher dist replaces w/o duplicate name');

// validation: bad dist
r = await post(env, { name: 'z', dist: 0, tier: 1 }, '4.4.4.4');
ok(r.status === 400, 'dist < 1 rejected → 400');
r = await post(env, { name: 'z', dist: 1e9, tier: 1 }, '4.4.4.5');
ok(r.status === 400, 'absurd dist rejected → 400');
r = await post(env, { name: 'z', dist: 'nope', tier: 1 }, '4.4.4.6');
ok(r.status === 400, 'non-numeric dist rejected → 400');

// name sanitized (no HTML/injection)
r = await post(env, { name: '<img onerror=alert(1)>', dist: 50, tier: 2 }, '5.5.5.5');
j = await r.json();
ok(!j.top.some(e => /[<>]/.test(e.name)), 'names sanitized (no HTML/injection chars)');

// empty/garbage name → Anonymous
r = await post(env, { name: '   ', dist: 30, tier: 1 }, '5.5.5.6');
j = await r.json();
ok(j.top.some(e => e.name === 'Anonymous'), 'blank name → Anonymous');

// tier clamped into [1,999]
r = await post(env, { name: 'HighTier', dist: 200, tier: 99999 }, '6.6.6.6');
j = await r.json();
ok((j.top.find(e => e.name === 'HighTier') || {}).tier === 999, 'huge tier clamped to 999');
r = await post(env, { name: 'LowTier', dist: 210, tier: 0 }, '6.6.6.7');
j = await r.json();
ok((j.top.find(e => e.name === 'LowTier') || {}).tier === 1, 'tier 0 clamped to 1');

// sorted descending by dist
r = await post(env, { name: 'Newbie', dist: 12, tier: 1 }, '7.7.7.7');
j = await r.json();
ok(j.top[0].dist >= j.top[j.top.length - 1].dist, 'sorted by dist descending');

// cap 50: flood the board and confirm it never exceeds 50
const big = mockKV();
const flooded = Array.from({ length: 60 }, (_, k) => ({ name: 'p' + k, dist: k + 1, tier: 1, t: 1 }));
await big.put('ww:top', JSON.stringify(flooded));
r = await onRequestPost({ env: { WWBOARD: big },
  request: new Request('http://x/api/wildwalk_board', { method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '8.8.8.8' },
    body: JSON.stringify({ name: 'Winner', dist: 99999, tier: 1 }) }) });
j = await r.json();
ok(j.top.length === 50 && j.top[0].name === 'Winner', 'board capped at 50, top entry kept');

// bad JSON → 400 (not 500)
r = await onRequestPost({ env: { WWBOARD: mockKV() },
  request: new Request('http://x/api/wildwalk_board', { method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '9.9.9.9' },
    body: 'not json{' }) });
ok(r.status === 400, 'malformed JSON body → 400 (not 500)');

// ===================================================================
// PER-DIFFICULTY BOARD SPLIT (c35)
// ===================================================================

// --- routing: Hard submit lands on ww:top:hard and NOT on the legacy board ---
{
  const kvh = mockKV(); const envH = { WWBOARD: kvh };
  r = await post(envH, { name: 'HardHero', dist: 800, tier: 6, diff: 'hard' }, '10.0.0.1');
  j = await r.json();
  ok(r.status === 200 && j.top.length === 1 && j.top[0].name === 'HardHero', 'hard submit lands');
  ok(kvh._store.has('ww:top:hard'), 'hard submit writes ww:top:hard');
  // NEGATIVE CONTROL: the legacy Normal board must be completely untouched
  ok(!kvh._store.has('ww:top'), 'NEGATIVE CONTROL: hard submit does NOT touch legacy ww:top');

  // GET ?diff=hard reads the hard rows back
  r = await get(envH, 'hard'); j = await r.json();
  ok(r.status === 200 && j.top.length === 1 && j.top[0].name === 'HardHero', 'GET ?diff=hard returns hard rows');
  // GET with no diff reads the (empty) legacy board — hard rows do NOT bleed in
  r = await get(envH); j = await r.json();
  ok(r.status === 200 && j.top.length === 0, 'GET no-diff reads legacy board (hard rows absent)');
}

// --- casual submit lands on ww:top:casual only ---
{
  const kvc = mockKV(); const envC = { WWBOARD: kvc };
  r = await post(envC, { name: 'Chill', dist: 300, tier: 2, diff: 'casual' }, '10.0.0.2');
  j = await r.json();
  ok(r.status === 200 && j.top[0].name === 'Chill', 'casual submit lands');
  ok(kvc._store.has('ww:top:casual'), 'casual submit writes ww:top:casual');
  ok(!kvc._store.has('ww:top') && !kvc._store.has('ww:top:hard'), 'casual submit touches ONLY ww:top:casual');
}

// --- back-compat: normal/undefined diff hits legacy ww:top byte-identically ---
{
  const kvn = mockKV();
  // seed a pre-existing legacy entry, as would already exist in production KV
  await kvn.put('ww:top', JSON.stringify([{ name: 'OldTimer', dist: 500, tier: 3, t: 1 }]));
  const envN = { WWBOARD: kvn };

  // explicit diff:'normal' writes to legacy key
  r = await post(envN, { name: 'NormalGuy', dist: 600, tier: 4, diff: 'normal' }, '10.0.0.3');
  j = await r.json();
  ok(kvn._store.has('ww:top') && j.top.some(e => e.name === 'NormalGuy'), 'diff:normal writes legacy ww:top');
  ok(j.top.some(e => e.name === 'OldTimer'), 'pre-existing legacy entry survives');
  ok(!kvn._store.has('ww:top:normal'), 'never creates a ww:top:normal key');

  // GET with no diff reads the legacy board back (existing entry visible)
  r = await get(envN); j = await r.json();
  ok(j.top.some(e => e.name === 'OldTimer') && j.top.some(e => e.name === 'NormalGuy'), 'GET no-diff reads legacy board');

  // omitting diff entirely also routes to legacy
  r = await post(envN, { name: 'NoDiff', dist: 700, tier: 5 }, '10.0.0.4');
  j = await r.json();
  ok(j.top.some(e => e.name === 'NoDiff'), 'omitted diff routes to legacy');
}

// --- whitelist: a bogus/malicious diff falls back to legacy, never a rogue key ---
{
  const kvx = mockKV(); const envX = { WWBOARD: kvx };
  for (const bad of ['ww:evil', '../x', 'HARD', 'rl:1.1.1.1', '', 'proto__']) {
    kvx._store.clear();
    r = await post(envX, { name: 'Rogue', dist: 400, tier: 2, diff: bad }, '10.9.9.' + Math.floor(Math.random()*250));
    j = await r.json();
    ok(kvx._store.has('ww:top'), `bogus diff ${JSON.stringify(bad)} falls back to legacy ww:top`);
    const keys = [...kvx._store.keys()].filter(k => k.startsWith('ww:'));
    ok(keys.length === 1 && keys[0] === 'ww:top', `bogus diff ${JSON.stringify(bad)} creates no rogue ww: key (${keys})`);
  }
  // GET with a bogus diff also resolves to legacy, no throw
  r = await get(envX, 'ww:evil'); j = await r.json();
  ok(r.status === 200 && Array.isArray(j.top), 'GET bogus diff resolves to legacy, no throw');
}

// --- KV TTL: the throttle put must use expirationTtl >= 60 (mockKV throws if < 60) ---
{
  let ttlSeen = null;
  const spyKV = mockKV();
  const realPut = spyKV.put.bind(spyKV);
  spyKV.put = async (k, v, opt) => { if (k.startsWith('rl:')) ttlSeen = opt && opt.expirationTtl; return realPut(k, v, opt); };
  r = await post({ WWBOARD: spyKV }, { name: 'TtlTest', dist: 10, tier: 1, diff: 'hard' }, '11.0.0.1');
  ok(ttlSeen != null && ttlSeen >= 60, `throttle put uses expirationTtl>=60 (saw ${ttlSeen})`);
}

// --- boards themselves carry NO TTL (unchanged) ---
{
  let boardOpt = 'unset';
  const spyKV2 = mockKV();
  const realPut2 = spyKV2.put.bind(spyKV2);
  spyKV2.put = async (k, v, opt) => { if (k === 'ww:top:hard') boardOpt = opt; return realPut2(k, v, opt); };
  await post({ WWBOARD: spyKV2 }, { name: 'NoTtl', dist: 20, tier: 1, diff: 'hard' }, '11.0.0.2');
  ok(boardOpt === undefined, 'board put carries no options (no TTL)');
}

console.log(`\nwildwalk leaderboard fn: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

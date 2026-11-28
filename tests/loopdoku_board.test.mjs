// LoopDoku leaderboard Pages Function: name claim + token, server-side points, once per puzzle per period at its best,
// Beijing-time periods, per-player throttle, ban list, level validation against the real pack sizes, 503 without a binding.
//
//   node tests/loopdoku_board.test.mjs   (or: npm run test:ldboard)
import fs from 'node:fs';
import { onRequestGet, onRequestPost, PACKS, points, stars, periodKeys, packOf, cleanName } from '../functions/api/loopdoku_board.js';

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

function mockKV() {
  const store = new Map();
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v, opt) { if (opt && opt.expirationTtl != null && opt.expirationTtl < 60) throw new Error('expirationTtl must be at least 60'); store.set(k, String(v)); },
    _store: store,
  };
}
const post = async (env, body) => { const r = await onRequestPost({ env, request: new Request('http://x/api/loopdoku_board', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }); return { status: r.status, body: await r.json() }; };
const get = async (env, name) => { const r = await onRequestGet({ env, request: new Request('http://x/api/loopdoku_board' + (name ? '?name=' + encodeURIComponent(name) : '')) }); return { status: r.status, body: await r.json() }; };
const TOK = 'a'.repeat(32), TOK2 = 'b'.repeat(32);
// the per-player throttle is 3 s: move the stored clock back between posts instead of sleeping
const unthrottle = (env, name) => { const k = 'ld:p:' + name.normalize('NFKC').toLowerCase(), p = JSON.parse(env.BOARD._store.get(k)); p.t = 0; env.BOARD._store.set(k, JSON.stringify(p)); };

// ---- pack sizes match the real levels file
{
  global.window = {};
  eval(fs.readFileSync(new URL('../LoopDoku/loopdoku-levels.js', import.meta.url), 'utf8'));
  for (const [id, lv] of Object.entries(window.LD_LEVELS.packs)) ok(PACKS[id] && PACKS[id].count === lv.length, `pack ${id}: function says ${PACKS[id] && PACKS[id].count}, levels file has ${lv.length}`);
}

// ---- pure rules
ok(stars(0, 0) === 3 && stars(1, 0) === 2 && stars(2, 0) === 1 && stars(0, 1) === 2 && stars(2, 5) === 1, 'stars match the game');
ok(points('easy', 5e6, 0, 0) === 23 && points('nightmare', 5e6, 2, 0) === 350, 'base x stars');
ok(points('hard', 0, 0, 0) > points('hard', 200000, 0, 0), 'faster pays more');
ok(points('expert', 60000, 0, 0) > points('easy', 1000, 0, 0), 'harder pays more');
ok(cleanName('  小明  ') === '小明' && cleanName('a') === null && cleanName('abcdefghijklm') === null && cleanName('x<script>') === null && cleanName('Ｒｏｘ') === 'Rox', 'names');
ok(packOf('hard-40', Date.now()) === 'hard' && packOf('hard-41', Date.now()) === null && packOf('hard-0', Date.now()) === null && packOf('foo-1', Date.now()) === null, 'level ids');
ok(packOf('daily-' + periodKeys(Date.now()).d, Date.now()) === 'daily' && packOf('daily-2001-01-01', Date.now()) === null, 'daily only for today');
{ // Beijing time: 2026-11-27 16:30 UTC is already 28 Nov 00:30 in Beijing; Monday 2026-11-23 starts that week
  const k = periodKeys(Date.UTC(2026, 10, 27, 16, 30));
  ok(k.d === '2026-11-28' && k.w === '2026-11-23' && k.m === '2026-11', 'Beijing periods ' + JSON.stringify(k));
}

// ---- no binding: 503, never 500
ok((await get({})).status === 503, 'GET without KV is 503');
ok((await post({}, { action: 'claim', name: '小明', token: TOK })).status === 503, 'POST without KV is 503');

// ---- claim, score, replays, periods
{
  const env = { BOARD: mockKV() };
  ok((await post(env, { action: 'claim', name: '小明', token: TOK })).status === 200, 'claim a name');
  ok((await post(env, { action: 'claim', name: '小明', token: TOK })).status === 200, 'claim again with the same token is fine');
  ok((await post(env, { action: 'claim', name: '小明', token: TOK2 })).status === 409, 'a taken name is refused');
  ok((await post(env, { action: 'claim', name: 'x', token: TOK })).status === 400, 'a too-short name is refused');
  ok((await post(env, { action: 'score', name: '小明', token: TOK2, id: 'easy-1', ms: 30000 })).status === 403, 'wrong token cannot score');
  ok((await post(env, { action: 'score', name: '无名', token: TOK, id: 'easy-1', ms: 30000 })).status === 404, 'unclaimed name cannot score');

  let r = await post(env, { action: 'score', name: '小明', token: TOK, id: 'easy-1', ms: 30000, mistakes: 1, hints: 0 });
  ok(r.status === 200 && r.body.pts === points('easy', 30000, 1, 0) && r.body.gained === r.body.pts, 'first solve scores ' + JSON.stringify(r.body).slice(0, 120));
  ok(r.body.me.d.pts === r.body.pts && r.body.me.all.rank === 1 && r.body.d[0].name === '小明', 'totals and rank returned');
  ok((await post(env, { action: 'score', name: '小明', token: TOK, id: 'easy-2', ms: 30000 })).status === 429, 'per-player throttle');
  unthrottle(env, '小明');
  const first = r.body.me.all.pts;
  r = await post(env, { action: 'score', name: '小明', token: TOK, id: 'easy-1', ms: 30000, mistakes: 1, hints: 0 });
  ok(r.body.gained === 0 && r.body.me.all.pts === first, 'the same result again adds nothing');
  unthrottle(env, '小明');
  r = await post(env, { action: 'score', name: '小明', token: TOK, id: 'easy-1', ms: 20000, mistakes: 0, hints: 0 });
  ok(r.body.gained === points('easy', 20000, 0, 0) - first && r.body.me.all.pts === points('easy', 20000, 0, 0), 'a better replay adds only the improvement');
  unthrottle(env, '小明');
  ok((await post(env, { action: 'score', name: '小明', token: TOK, id: 'easy-99', ms: 30000 })).status === 400, 'an unknown level is refused');
  ok((await post(env, { action: 'score', name: '小明', token: TOK, id: 'easy-2', ms: 900 })).status === 400, 'an impossibly fast solve is refused');
  ok((await post(env, { action: 'score', name: '小明', token: TOK, id: 'easy-2', ms: 30000, mistakes: 5 })).status === 400, 'more mistakes than mics is refused');

  // a second player, ranks
  await post(env, { action: 'claim', name: 'Jasmin Fan', token: TOK2 });
  r = await post(env, { action: 'score', name: 'jasmin fan', token: TOK2, id: 'nightmare-1', ms: 600000, mistakes: 0, hints: 0 });
  ok(r.status === 200 && r.body.me.all.rank === 1 && r.body.all[1].name === '小明', 'case-insensitive name, ranks follow points');
  const g = await get(env, '小明');
  ok(g.body.me && g.body.me.all.rank === 2 && g.body.all.length === 2 && g.body.d.length === 2, 'GET with a name shows my rank ' + JSON.stringify(g.body.me));

  // a new day: the daily board starts empty, the all-time board keeps the totals, the player's day map resets
  const board = JSON.parse(env.BOARD._store.get('ld:board')); board.d.k = '2000-01-01'; env.BOARD._store.set('ld:board', JSON.stringify(board));
  const p = JSON.parse(env.BOARD._store.get('ld:p:小明')); p.d.k = '2000-01-01'; p.t = 0; env.BOARD._store.set('ld:p:小明', JSON.stringify(p));
  const g2 = await get(env);
  ok(g2.body.d.length === 0 && g2.body.all.length === 2, 'the daily board turns over, all-time stays');
  r = await post(env, { action: 'score', name: '小明', token: TOK, id: 'easy-1', ms: 20000 });
  ok(r.body.gained === 0 && r.body.me.d.pts === points('easy', 20000, 0, 0) && r.body.d.length === 1, 'yesterday\'s puzzle counts again for today, not again for all-time');

  // ban list hides a name
  env.BOARD._store.set('ld:ban', JSON.stringify(['jasmin fan']));
  const g3 = await get(env);
  ok(!g3.body.all.some((e) => e.name === 'Jasmin Fan'), 'banned names are hidden');

  // storage failure: a clean 503 so the game keeps the win queued
  env.BOARD.put = async () => { throw new Error('KV down'); };
  const pp = JSON.parse(env.BOARD._store.get('ld:p:小明')); pp.t = 0; env.BOARD._store.set('ld:p:小明', JSON.stringify(pp));
  ok((await post(env, { action: 'score', name: '小明', token: TOK, id: 'easy-3', ms: 30000 })).status === 503, 'a storage failure is a 503');
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

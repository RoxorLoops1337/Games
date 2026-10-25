// Stacking Cats: the weekly challenge (ISO week keys, one seed and three stacked modifiers) and its leaderboard on the shared Pages Function.
import assert from 'node:assert/strict';
import { weekKey, weekInfo, WEEK_RE, WEEKLY_MODS, DAILY_POOL, dayKey } from '../stacking_cats/cats.js';
import { newGame, calcMods, makeEnemy, stackMax } from '../stacking_cats/sim.js';
import { fetchBoard, submitScore } from '../stacking_cats/daily.js';
import { onRequestGet, onRequestPost, weekOf } from '../functions/api/stackingcats_board.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const mockKV = () => {
  const store = new Map(), ttls = [];
  return {
    store, ttls,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v, opt) { if (opt && opt.expirationTtl != null && opt.expirationTtl < 60) throw new Error('expirationTtl must be at least 60'); if (opt && opt.expirationTtl) ttls.push([k, opt.expirationTtl]); store.set(k, String(v)); },
  };
};
const URL0 = 'http://x/api/stackingcats_board';
const post = (env, body, ip = '9.9.9.9') => onRequestPost({ env, request: new Request(URL0, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) }) });
const get = (env, q = '') => onRequestGet({ env, request: new Request(URL0 + q) });
const thisWeek = weekKey();

await t('week keys follow ISO 8601 (Monday start, Thursday decides the year)', () => {
  const k = (y, m, d) => weekKey(Date.UTC(y, m - 1, d, 12));
  assert.equal(k(2026, 10, 25), '2026-W43');     // a Sunday still belongs to the week that began on Monday the 19th
  assert.equal(k(2026, 10, 26), '2026-W44');
  assert.equal(k(2026, 1, 1), '2026-W01');
  assert.equal(k(2024, 12, 30), '2025-W01');
  assert.equal(k(2027, 1, 3), '2026-W53');
  assert.equal(k(2021, 1, 3), '2020-W53');
  assert.equal(k(2020, 12, 31), '2020-W53');
  assert.ok(WEEK_RE.test(thisWeek));
  assert.ok(!WEEK_RE.test('2026-W00') && !WEEK_RE.test('2026-W54') && !WEEK_RE.test('2026-43') && !WEEK_RE.test('2026-W4'));
});
await t('the function and the game agree on the week for every day of several years', () => {
  for (let ms = Date.UTC(2023, 0, 1); ms < Date.UTC(2028, 0, 1); ms += 86400000 * 1.5) assert.equal(weekOf(ms), weekKey(ms));
});
await t('weekInfo: same week gives the same seed and three different stacked modifiers, other weeks differ', () => {
  const a = weekInfo('2026-W43'), b = weekInfo('2026-W43'), c = weekInfo('2026-W44');
  assert.equal(a.seed, b.seed); assert.deepEqual(a.mods.map((m) => m.id), b.mods.map((m) => m.id));
  assert.notEqual(a.seed, c.seed);
  assert.equal(a.mods.length, 3); assert.equal(new Set(a.mods.map((m) => m.id)).size, 3);
  assert.equal(a.kind, 'weekly'); assert.equal(a.day, '2026-W43'); assert.ok(a.mod.name && a.mod.icon && a.mod.desc);
  assert.ok(a.mod.enemyHp >= 1.1, 'an iron week: tougher mice before any rule');
  const seen = new Set();
  for (let w = 1; w <= 53; w++) for (const m of weekInfo('2026-W' + String(w).padStart(2, '0')).mods) seen.add(m.id);
  assert.equal(seen.size, WEEKLY_MODS.length, 'over a year every modifier comes up');
  for (const m of WEEKLY_MODS) { assert.ok(m.name && m.icon && m.desc); assert.ok(!/\u2014/.test(JSON.stringify(m))); }
});
await t('weekly game: fixed cat pool, no kingdom, modifiers reach the sim', () => {
  const wi = weekInfo('2026-W43');          // poor + fast + elite
  const g = newGame({ daily: wi, kingdom: { coins: 0, earned: 0, gems: 0, lv: { dojo: 5 }, wonders: {} } });
  assert.equal(g.meta.dmg, 0);
  assert.deepEqual([...g.unlocked].sort(), [...DAILY_POOL].sort());
  assert.equal(g.seed, wi.seed);
  const plain = newGame({ seed: wi.seed });
  const e1 = makeEnemy(g, 'mouse', 3), e0 = makeEnemy(plain, 'mouse', 3);
  assert.ok(e1.hp > e0.hp * 1.05, 'iron week mice are tougher');
  assert.ok(e1.spd > e0.spd * 1.1, 'a fast week');
  const tiny = weekInfo(['2026-W01', '2026-W02', '2026-W03', '2026-W04', '2026-W05', '2026-W06', '2026-W07', '2026-W08', '2026-W09'].find((w) => weekInfo(w).mods.some((m) => m.id === 'tiny')));
  assert.equal(stackMax(newGame({ daily: tiny })), 4);
  assert.ok(calcMods(g).coin > 0);
});
await t('client: weekly uses ?type=weekly&week= and the daily keeps ?day=, nothing throws', async () => {
  const urls = [];
  const ok = (body) => async (u, o) => { urls.push([u, o && o.body]); return { ok: true, status: 200, json: async () => body }; };
  const r = await fetchBoard('2026-W43', ok({ type: 'weekly', week: '2026-W43', top: [{ name: 'a' }], all: [] }), 500, true);
  assert.ok(r.ok && r.week === '2026-W43' && r.top.length === 1);
  assert.equal(urls[0][0], '/api/stackingcats_board?type=weekly&week=2026-W43');
  await fetchBoard('2026-10-25', ok({ day: '2026-10-25', top: [], all: [] }));
  assert.equal(urls[1][0], '/api/stackingcats_board?day=2026-10-25');
  const s = await submitScore({ name: 'a', score: 5, wave: 2, kills: 3, type: 'weekly', week: '2026-W43' }, ok({ type: 'weekly', week: '2026-W43', top: [], all: [] }));
  assert.ok(s.ok && s.week === '2026-W43');
  assert.deepEqual((await fetchBoard('2026-W43', async () => { throw new Error('offline'); }, 50, true)), { ok: false });
});
await t('function: weekly post stores the week board and the weekly all-time board, daily boards stay separate', async () => {
  const env = { BOARD: mockKV() };
  const r = await post(env, { type: 'weekly', week: thisWeek, name: 'Mia', score: 1500, wave: 14, kills: 60 }, '3.3.3.1');
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.week, thisWeek); assert.equal(j.top[0].name, 'Mia'); assert.equal(j.all[0].score, 1500);
  assert.ok(env.BOARD.store.has('sc:w:' + thisWeek) && env.BOARD.store.has('sc:wall'));
  assert.ok(!env.BOARD.store.has('sc:all') && ![...env.BOARD.store.keys()].some((k) => k.startsWith('sc:d:')));
  // the daily client still works unchanged and does not touch the weekly boards
  const d = await post(env, { name: 'Dan', score: 900, wave: 9, kills: 30, day: dayKey() }, '3.3.3.2');
  assert.equal(d.status, 200);
  const dj = await d.json(); assert.equal(dj.day, dayKey()); assert.equal(dj.top[0].name, 'Dan');
  const wget = await (await get(env, '?type=weekly&week=' + thisWeek)).json();
  assert.deepEqual(wget.top.map((e) => e.name), ['Mia']);
  const dget = await (await get(env, '?day=' + dayKey())).json();
  assert.deepEqual(dget.top.map((e) => e.name), ['Dan']);
  // best per name
  await post(env, { type: 'weekly', week: thisWeek, name: 'Mia', score: 100, wave: 2, kills: 1 }, '3.3.3.3');
  assert.equal((await (await get(env, '?type=weekly&week=' + thisWeek)).json()).top[0].score, 1500);
});
await t('function: week keys are validated, ttl is at least 60 seconds, the per-IP throttle still applies', async () => {
  const env = { BOARD: mockKV() };
  const bad = ['2020-W01', 'nope', '2026-W99', '2026-W00', '', '2026-w43', thisWeek + 'x'];
  let ip = 10;
  for (const week of bad) assert.equal((await post(env, { type: 'weekly', week, name: 'A', score: 500, wave: 5, kills: 3 }, '4.4.4.' + ip++)).status, 400, week);
  assert.equal((await post(env, { type: 'weekly', name: 'A', score: 500, wave: 5, kills: 3 }, '4.4.4.99')).status, 400);
  assert.equal((await post(env, { type: 'weekly', week: thisWeek, name: 'A', score: 0, wave: 5, kills: 3 }, '4.4.4.98')).status, 400);
  assert.equal((await post(env, { type: 'weekly', week: thisWeek, name: 'A', score: 500, wave: 999, kills: 3 }, '4.4.4.97')).status, 400);
  assert.equal((await post(env, { type: 'weekly', week: thisWeek, name: 'A', score: 500, wave: 5, kills: 3 }, '4.4.4.1')).status, 200);
  assert.equal((await post(env, { type: 'weekly', week: thisWeek, name: 'B', score: 500, wave: 5, kills: 3 }, '4.4.4.1')).status, 429);
  assert.ok(env.BOARD.ttls.length >= 1 && env.BOARD.ttls.every(([, ttl]) => ttl >= 60));
  assert.ok(env.BOARD.ttls.some(([k, ttl]) => k.startsWith('sc:w:') && ttl >= 86400), 'a week board lives for days');
  // a daily key sent as a week (or the other way round) is rejected
  assert.equal((await post(env, { type: 'weekly', week: dayKey(), name: 'A', score: 500, wave: 5, kills: 3 }, '4.4.4.60')).status, 400);
  assert.equal((await post(env, { week: thisWeek, name: 'A', score: 500, wave: 5, kills: 3 }, '4.4.4.61')).status, 400);
});
await t('function: get with a bad or missing week falls back to this week, and no KV gives 503', async () => {
  const env = { BOARD: mockKV() };
  assert.equal((await (await get(env, '?type=weekly&week=bogus')).json()).week, thisWeek);
  assert.equal((await (await get(env, '?type=weekly')).json()).week, thisWeek);
  assert.equal((await get({}, '?type=weekly')).status, 503);
  assert.equal((await post({}, { type: 'weekly', week: thisWeek })).status, 503);
});

console.log(n + ' tests passed');

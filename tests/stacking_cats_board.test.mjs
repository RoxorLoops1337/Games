// Stacking Cats: daily leaderboard function (validation, best per name, throttle, 503 without KV).
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from '../functions/api/stackingcats_board.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const mockKV = () => {
  const store = new Map();
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    // real KV rejects expirationTtl below 60
    async put(k, v, opt) { if (opt && opt.expirationTtl != null && opt.expirationTtl < 60) throw new Error('expirationTtl must be at least 60'); store.set(k, String(v)); },
  };
};
const today = new Date().toISOString().slice(0, 10);
const post = (env, body, ip = '1.1.1.1') => onRequestPost({ env, request: new Request('http://x/api/stackingcats_board', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) }) });
const get = (env, q = '') => onRequestGet({ env, request: new Request('http://x/api/stackingcats_board' + q) });

await t('no KV binding gives 503 so the game can hide the board', async () => {
  assert.equal((await get({})).status, 503);
  assert.equal((await post({}, { name: 'a' })).status, 503);
});
await t('post validates input', async () => {
  const env = { BOARD: mockKV() };
  assert.equal((await post(env, { name: 'A', score: 0, wave: 5, kills: 3, day: today }, '2.2.2.1')).status, 400);
  assert.equal((await post(env, { name: 'A', score: 500, wave: 999, kills: 3, day: today }, '2.2.2.2')).status, 400);
  assert.equal((await post(env, { name: 'A', score: 500, wave: 5, kills: 99999, day: today }, '2.2.2.3')).status, 400);
  assert.equal((await post(env, { name: 'A', score: 500, wave: 5, kills: 3, day: '2020-01-01' }, '2.2.2.4')).status, 400);
  assert.equal((await post(env, { name: 'A', score: 500, wave: 5, kills: 3, day: 'nope' }, '2.2.2.5')).status, 400);
});
await t('a good score is stored on the day and all time boards, names are cleaned, best per name', async () => {
  const env = { BOARD: mockKV() };
  let r = await post(env, { name: '<b>Mia</b>', score: 800, wave: 8, kills: 40, day: today }, '3.3.3.1');
  assert.equal(r.status, 200);
  let j = await r.json();
  assert.equal(j.top.length, 1);
  assert.equal(j.top[0].name, 'bMiab');
  await post(env, { name: 'Zed', score: 1500, wave: 15, kills: 90, day: today }, '3.3.3.2');
  await post(env, { name: 'bMiab', score: 600, wave: 6, kills: 20, day: today }, '3.3.3.3');   // worse: ignored
  j = await (await get(env)).json();
  assert.deepEqual(j.top.map((e) => e.name), ['Zed', 'bMiab']);
  assert.equal(j.top[1].score, 800);
  assert.equal(j.all.length, 2);
  await post(env, { name: 'bMiab', score: 2000, wave: 20, kills: 100, day: today }, '3.3.3.4');
  j = await (await get(env)).json();
  assert.equal(j.top[0].name, 'bMiab');
});
await t('writes from one address are throttled', async () => {
  const env = { BOARD: mockKV() };
  assert.equal((await post(env, { name: 'A', score: 500, wave: 5, kills: 3, day: today }, '4.4.4.4')).status, 200);
  assert.equal((await post(env, { name: 'A', score: 900, wave: 9, kills: 3, day: today }, '4.4.4.4')).status, 429);
});
await t('get with a bad day falls back to today', async () => {
  const env = { BOARD: mockKV() };
  const j = await (await get(env, '?day=1999-01-01')).json();
  assert.equal(j.day, today);
});
await t('an ordinary run only joins the all time board, needs no day and cleans names', async () => {
  const env = { BOARD: mockKV() };
  let r = await post(env, { type: 'run', name: 'Mia', score: 900, wave: 9, kills: 50 }, '8.8.8.1');
  assert.equal(r.status, 200);
  let j = await r.json();
  assert.equal(j.type, 'run');
  assert.deepEqual(j.all.map((e) => e.name), ['Mia']);
  const d = await (await get(env)).json();
  assert.equal(d.top.length, 0, 'not on the daily board');
  assert.equal(d.all.length, 1);
  r = await post(env, { type: 'run', name: 'Mia', score: 100, wave: 1, kills: 0 }, '8.8.8.2');
  assert.equal((await r.json()).all[0].score, 900, 'best per name');
  assert.equal((await post(env, { type: 'run', name: 'Mia', score: 0, wave: 5, kills: 3 }, '8.8.8.3')).status, 400);
  r = await post(env, { type: 'run', name: 'shitlord', score: 500, wave: 5, kills: 3 }, '8.8.8.4');
  assert.ok((await r.json()).all.some((e) => e.name === 'Anonymous'), 'a rude name is shown as Anonymous');
});
console.log(`${n} tests passed`);

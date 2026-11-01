// Drop the Bass leaderboard Pages Function: whitelist, clamps, best per name, throttle, cap, 503 without the binding.
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from '../functions/api/dropbass_board.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
function mockKV() {
  const store = new Map();
  return { async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v, o) { if (o && o.expirationTtl != null && o.expirationTtl < 60) throw new Error('expirationTtl must be at least 60'); store.set(k, String(v)); }, _store: store };
}
const post = (env, body, ip) => onRequestPost({ env, request: new Request('http://x/api/dropbass_board', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip || '1.1.1.1' }, body: JSON.stringify(body) }) });
const get = (env, b) => onRequestGet({ env, request: new Request('http://x/api/dropbass_board?b=' + encodeURIComponent(b)) });

ok((await onRequestGet({ env: {} })).status === 503, 'no binding GET is 503'); ok((await post({}, { b: 'daily', name: 'a', score: 3 })).status === 503, 'no binding POST is 503');
const env = { BOARD: mockKV() };
ok((await get(env, 'endless:nope')).status === 400 && (await get(env, '../../x')).status === 400, 'board id is whitelisted');
ok((await post(env, { b: 'endless:garage', name: 'Roxor', score: 31 }, '1.1.1.1')).status === 200, 'post ok');
ok((await post(env, { b: 'endless:garage', name: 'Roxor', score: 40 }, '1.1.1.1')).status === 429, 'throttled per ip');
let r = await (await post(env, { b: 'endless:garage', name: 'Jasmin<script>', score: 55 }, '2.2.2.2')).json();
ok(r.top[0].name === 'Jasminscript' && r.top[0].score === 55 && r.top.length === 2, 'sanitised name, sorted');
r = await (await post(env, { b: 'endless:garage', name: 'Jasminscript', score: 20 }, '3.3.3.3')).json(); ok(r.top.length === 2 && r.top[0].score === 55, 'lower score keeps the personal best');
r = await (await post(env, { b: 'endless:garage', name: 'Jasminscript', score: 60 }, '4.4.4.4')).json(); ok(r.top.length === 2 && r.top[0].score === 60, 'higher score replaces');
ok((await post(env, { b: 'endless:garage', name: 'x', score: 99999 }, '5.5.5.5')).status === 400 && (await post(env, { b: 'endless:garage', name: 'x', score: 0 }, '6.6.6.6')).status === 400 && (await post(env, { b: 'endless:garage', name: 'x', score: 'abc' }, '7.7.7.7')).status === 400, 'bad scores rejected');
ok((await post(env, { b: 'daily', name: 'Dan', score: 15 }, '8.8.8.8')).status === 200, 'daily post (KV ttl >= 60)');
ok((await post(env, { b: 'daily', name: 'Dan', score: 99 }, '9.9.9.9')).status === 400, 'daily score is capped at 20');
r = await (await get(env, 'daily')).json(); ok(r.top.length === 1 && r.top[0].name === 'Dan', 'daily get');
for (let i = 0; i < 60; i++) await post(env, { b: 'endless:arena', name: 'p' + i, score: 1 + (i % 50) }, '10.0.' + i + '.1');
r = await (await get(env, 'endless:arena')).json(); ok(r.top.length === 50, 'capped at 50');
console.log('drop_the_bass board: ' + n + ' checks passed');

// Drop the Bass leaderboard Pages Function: whitelist, clamps, best per name, throttle, cap, 503 without the binding.
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost, isoWeekId } from '../functions/api/dropbass_board.js';
import { cleanName, cleanFriends, addFriend, removeFriend, boardRows, FRIENDS_MAX } from '../drop_the_bass/js/lb.js';
import { isoWeek } from '../drop_the_bass/js/meta.js';

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

// ---- weekly board
ok(isoWeekId(Date.UTC(2026, 10, 1)) === '2026-W44' && isoWeekId(Date.UTC(2026, 0, 1)) === '2026-W01' && isoWeekId(Date.UTC(2021, 0, 3)) === '2020-W53' && isoWeekId(Date.UTC(2024, 11, 30)) === '2025-W01', 'iso week ids (year edges)');
for (let d = 0; d < 800; d += 3) { const t = Date.UTC(2024, 0, 1) + d * 86400000 + 5e6; ok(isoWeek(t).id === isoWeekId(t), 'client and server agree on the week ' + d); }
{
  const wk = { BOARD: mockKV() };
  ok((await post(wk, { b: 'weekly', name: 'Wendy', score: 25 }, '20.0.0.1')).status === 200, 'weekly post at the 25 wave cap');
  ok((await post(wk, { b: 'weekly', name: 'Wendy', score: 26 }, '20.0.0.2')).status === 400, 'weekly score is capped at 25');
  ok((await post(wk, { b: 'weekly:x', name: 'Wendy', score: 5 }, '20.0.0.3')).status === 400 && (await get(wk, 'weekly:x')).status === 400, 'weekly id is exact');
  r = await (await get(wk, 'weekly')).json(); ok(r.top.length === 1 && r.top[0].name === 'Wendy' && r.top[0].score === 25, 'weekly get');
  ok([...wk.BOARD._store.keys()].some((k) => k === 'dtb:w:' + isoWeekId(Date.now())), 'weekly key is the ISO week');
  ok((await post(wk, { b: 'weekly', name: 'Wendy', score: 25 }, '20.0.0.1')).status === 429, 'weekly shares the per-ip throttle');
  r = await (await post(wk, { b: 'weekly', name: '  Two   Spaces <b>x</b>  ', score: 9 }, '20.0.0.4')).json(); ok(r.top.some((e) => e.name === 'Two Spaces bxb'), 'names are collapsed and stripped');
  r = await (await post(wk, { b: 'weekly', name: 'A'.repeat(80), score: 3 }, '20.0.0.5')).json(); ok(r.top.some((e) => e.name.length === 16), 'names are length limited');
}

// ---- names and friends (client side)
ok(cleanName('  Dan <script> the   Man  ') === 'Dan script the M' && cleanName('x'.repeat(40)).length === 16 && cleanName(null) === '' && cleanName({}) === 'object Object', 'cleanName');
{
  let list = [];
  let r2 = addFriend(list, 'Jas', 'Me'); ok(r2.ok && r2.list.length === 1 && list.length === 0, 'add does not mutate'); list = r2.list;
  ok(addFriend(list, 'jas', 'Me').reason === 'dup' && addFriend(list, 'Me', 'me').reason === 'self' && addFriend(list, '!!!', 'Me').reason === 'empty', 'dup, self and empty are refused');
  for (let i = 0; i < 40; i++) { const a = addFriend(list, 'f' + i, 'Me'); if (a.ok) list = a.list; }
  ok(list.length === FRIENDS_MAX && addFriend(list, 'extra', 'Me').reason === 'full', 'friend list is capped at ' + FRIENDS_MAX);
  ok(cleanFriends(['A', 'a', 'B', '', 'b ']).join() === 'A,B' && cleanFriends('nope').length === 0 && cleanFriends(Array.from({ length: 80 }, (_, i) => 'n' + i)).length === FRIENDS_MAX, 'cleanFriends dedupes and caps');
  ok(removeFriend(['Jas', 'Dan'], 'jas').join() === 'Dan', 'removeFriend is case blind');
}
{
  const top = [{ name: 'Zed', score: 25 }, { name: 'Me', score: 20 }, { name: 'Dan', score: 15 }, { name: 'Ann', score: 10 }, { name: 'Bob', score: 5 }];
  const all = boardRows(top, ['Bob', 'dan'], 'me', 'all');
  ok(all.map((r) => r.name).join() === 'Dan,Bob,Zed,Me,Ann', 'friends are pinned first, the rest keep rank order');
  ok(all[0].rank === 3 && all[1].rank === 5 && all[0].friend && all[1].friend, 'pinned friends keep their true rank');
  ok(all.find((r) => r.name === 'Me').me === true && all.filter((r) => r.me).length === 1 && !all.find((r) => r.name === 'Me').friend, 'own row is marked once');
  const fr = boardRows(top, ['Bob', 'Dan', 'Ghost'], 'Me', 'friends');
  ok(fr.map((r) => r.name).join() === 'Me,Dan,Bob,Ghost' && fr[3].missing && fr[3].score === null && fr[3].rank === 0, 'friends tab: you and friends by score, absent friends last');
  ok(boardRows(top, [], 'Me', 'friends').length === 1 && boardRows(null, ['a'], 'Me', 'all').length === 0 && boardRows(null, ['a'], 'Me', 'friends').length === 1, 'empty and offline boards');
  const junk = boardRows([{ name: 5, score: 1 }, null, { name: 'Ok', score: 'x' }], [], '', 'all'); ok(junk.length === 1 && junk[0].score === 0, 'junk rows are dropped');
  const big = boardRows(Array.from({ length: 50 }, (_, i) => ({ name: 'p' + i, score: 50 - i })), ['p40', 'p41'], '', 'all'); ok(big.length === 22 && big[0].name === 'p40', 'all tab limits the non-friend rows');
}
console.log('drop_the_bass board: ' + n + ' checks passed');

// Drop the Bass analytics: Pages Function validation, caps, aggregation, rate limit, plus the client batching and opt-out.
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost, cleanEvent, summarize, emptyDay, applyEvent, dayKey, MAX_BYTES, MAX_EVENTS } from '../functions/api/dropbass_stats.js';
import * as S from '../drop_the_bass/js/stats.js';
import { TURRETS } from '../drop_the_bass/js/data_core.js';
import { REMIX_IDS } from '../drop_the_bass/js/data_run.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
function mockKV() {
  const store = new Map(), ttl = new Map();
  return { async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v, o) { if (o && o.expirationTtl != null && o.expirationTtl < 60) throw new Error('expirationTtl must be at least 60'); store.set(k, String(v)); ttl.set(k, o && o.expirationTtl); }, _store: store, _ttl: ttl };
}
const post = (env, body, ip, raw) => onRequestPost({ env, request: new Request('http://x/api/dropbass_stats', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip || '1.1.1.1' }, body: raw !== undefined ? raw : JSON.stringify(body) }) });
const run = (o) => Object.assign({ k: 'run_end', world: 'garage', mode: 'story', difficulty: 'normal', won: true, wave: 20, wavesTotal: 20, leaks: 2, leakLane: 1, loadoutTop3: ['kick', 'snare', 'hat'], branchIds: [REMIX_IDS[0]], modifiers: [], seconds: 600 }, o || {});

// ---- validation
ok(cleanEvent(run()) !== null, 'a good run_end is accepted');
ok(cleanEvent(run({ world: 'nowhere' })) === null && cleanEvent(run({ mode: 'x' })) === null && cleanEvent(run({ difficulty: 'insane' })) === null, 'unknown ids are rejected');
ok(cleanEvent(run({ name: 'Dan' })) === null && cleanEvent(run({ extra: 1 })) === null, 'unknown keys (free text, identifiers) are rejected');
ok(cleanEvent(run({ loadoutTop3: ['kick', 'nope'] })) === null && cleanEvent(run({ loadoutTop3: ['kick', 'snare', 'hat', 'sub'] })) === null && cleanEvent(run({ branchIds: ['<script>'] })) === null, 'id lists are whitelisted and capped');
ok(cleanEvent(run({ wave: -1 })) === null && cleanEvent(run({ wave: 9999 })) === null && cleanEvent(run({ wave: '5' })) === null && cleanEvent(run({ won: 1 })) === null && cleanEvent(run({ seconds: 1e9 })) === null && cleanEvent(run({ leakLane: 9 })) === null, 'numbers and types are clamped');
ok(cleanEvent({ k: 'turret_pick', turret: 'kick' }).turret === 'kick' && cleanEvent({ k: 'turret_pick', turret: 'zzz' }) === null && cleanEvent({ k: 'other' }) === null && cleanEvent(null) === null && cleanEvent([]) === null, 'turret_pick and unknown kinds');
ok(Object.keys(TURRETS).every((t) => cleanEvent({ k: 'turret_pick', turret: t })), 'every real turret id passes');

// ---- endpoint
ok((await onRequestGet({ env: {} })).status === 503 && (await post({}, { v: 1, events: [run()] })).status === 503, 'no binding is 503');
const env = { BOARD: mockKV() };
ok((await post(env, null, '1.0.0.1', 'not json')).status === 400, 'bad json');
ok((await post(env, { v: 2, events: [run()] }, '1.0.0.2')).status === 400 && (await post(env, { v: 1, events: [] }, '1.0.0.3')).status === 400 && (await post(env, { v: 1, events: 'x' }, '1.0.0.4')).status === 400, 'bad batch shapes');
ok((await post(env, { v: 1, events: Array.from({ length: MAX_EVENTS + 1 }, () => run()) }, '1.0.0.5')).status === 400, 'too many events');
ok((await post(env, { v: 1, events: [run({ branchIds: [] })], pad: 'x'.repeat(MAX_BYTES) }, '1.0.0.6')).status === 413, 'oversized body');
ok((await post(env, { v: 1, events: [{ k: 'run_end', world: 'x' }] }, '1.0.0.7')).status === 400, 'only invalid events');
ok(env.BOARD._store.size === 0, 'nothing stored for rejected requests');
let r = await post(env, { v: 1, events: [run(), run({ won: false, wave: 8, leaks: 9, leakLane: 2, loadoutTop3: ['kick'] }), { k: 'bogus' }, { k: 'turret_pick', turret: 'kick' }] }, '2.2.2.2');
ok(r.status === 200 && (await r.json()).accepted === 3, 'valid events accepted, junk dropped');
ok((await post(env, { v: 1, events: [run()] }, '2.2.2.2')).status === 429, 'per-ip rate limit');
ok((await post(env, { v: 1, events: [run({ world: 'busk', difficulty: 'hard' })] }, '3.3.3.3')).status === 200, 'another ip is fine');
const keys = [...env.BOARD._store.keys()];
ok(keys.every((k) => k.startsWith('dtb:stats:')), 'all keys use the dtb:stats: prefix');
ok(!keys.some((k) => k.includes('2.2.2.2')) && ![...env.BOARD._store.values()].some((v) => v.includes('2.2.2.2')), 'the ip is never stored');
const dk = 'dtb:stats:d:' + dayKey(Date.now());
ok(env.BOARD._ttl.get(dk) >= 60 * 86400 && [...env.BOARD._ttl.values()].every((t) => t >= 60), 'ttls are >= 60 and daily docs live about 90 days');
const g = await (await onRequestGet({ env, request: new Request('http://x/api/dropbass_stats?days=7') })).json();
ok(g.runs === 3 && g.byWorld.garage.normal.runs === 2 && g.byWorld.garage.normal.winRate === 0.5 && g.byWorld.garage.normal.avgWave === 14 && g.byWorld.busk.hard.winRate === 1, 'summary win rate and average wave');
const kick = g.turrets.find((t) => t.id === 'kick');
ok(kick.runs === 3 && Math.abs(kick.winRate - 0.667) < 0.001 && kick.picks === 1 && (g.leakLane.garage.top === 1 || g.leakLane.garage.top === 2) && g.leakLane.garage.lanes['1'] === 1 && g.leakLane.garage.lanes['2'] === 1, 'turret usage, win rate and leak lane');
ok(g.topBranches[0].id === REMIX_IDS[0] && g.topBranches[0].count === 3 && g.modes.story === 3, 'branches and modes');
ok(!JSON.stringify(g).includes('1.1.1.1') && g.from && g.to, 'summary has aggregates only');
ok((await (await onRequestGet({ env, request: new Request('http://x/api/dropbass_stats?days=9999') })).json()).days === 90, 'days capped at 90');
// summarize merges days
const d1 = emptyDay(), d2 = emptyDay(); applyEvent(d1, cleanEvent(run())); applyEvent(d2, cleanEvent(run({ won: false, wave: 10 })));
const sm = summarize([d1, d2]); ok(sm.runs === 2 && sm.byWorld.garage.normal.avgWave === 15, 'summarize merges day documents');

// ---- client
const sent = []; let t = 1e9, settings = { analytics: true };
S.init(() => settings, { now: () => t, send: (u, b) => { sent.push([u, JSON.parse(b)]); } });
const fakeRun = { mode: 'story', world: { id: 'garage' }, difficulty: 'normal', wavesTotal: 20, remix: { [REMIX_IDS[0]]: 2 }, daily: null };
const fakeRes = { won: true, wave: 20, leaks: 3, world: 'garage', mode: 'story', difficulty: 'normal', time: 500.7, recap: { leaksByLane: [0, 3], turretUse: [{ type: 'sub', deployed: 2 }, { type: 'kick', deployed: 9 }, { type: 'hat', deployed: 5 }, { type: 'mic', deployed: 1 }] } };
S.reset();
ok(S.trackRunEnd(fakeRun, fakeRes) && sent.length === 1, 'a run end is sent right away');
const ev = sent[0][1].events[0];
ok(sent[0][1].v === 1 && ev.k === 'run_end' && ev.loadoutTop3.join() === 'kick,hat,sub' && ev.leakLane === 1 && ev.seconds === 500 && ev.won === true, 'run event is built from the result');
ok(cleanEvent(ev) !== null, 'client events pass the server validation');
t += 1000; S.trackRunEnd(fakeRun, fakeRes); ok(sent.length === 1 && S.pending() === 1, 'at most one send per minute (second event waits)');
t += 61000; ok(S.flush(false) && sent.length === 2 && S.pending() === 0, 'flushes after a minute');
ok(S.trackRunEnd({ mode: 'tutorial' }, { mode: 'tutorial' }) === false, 'tutorial runs are not tracked');
S.trackEvent('turret_pick', { turret: 'kick' }); S.flush(true); ok(sent.length === 3 && sent[2][1].events[0].turret === 'kick', 'pagehide flush ignores the gap');
ok(S.flush(true) === false, 'nothing queued, nothing sent');
settings = { analytics: false }; S.reset(); const before = sent.length;
ok(S.trackRunEnd(fakeRun, fakeRes) === false && S.trackEvent('turret_pick', { turret: 'kick' }) === false && S.flush(true) === false && S.pending() === 0 && sent.length === before, 'opt-out sends and queues nothing');
settings = { analytics: true }; S.trackEvent('turret_pick', { turret: 'kick' }); settings = { analytics: false }; S.flush(true); ok(sent.length === before && S.pending() === 0, 'opting out drops what was queued');
settings = {}; ok(S.enabled() === true, 'default is on');
Object.defineProperty(globalThis, 'navigator', { value: { doNotTrack: '1' }, configurable: true }); ok(S.enabled() === false && S.trackEvent('x', {}) === false, 'Do Not Track is honoured'); delete globalThis.navigator;
S.reset();
console.log('drop_the_bass stats: ' + n + ' checks passed');

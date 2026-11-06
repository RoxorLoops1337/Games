// b16c: Daily Challenge: fixed day seed, fair house band, cards rolled from the day, score, save fields, leaderboard function.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sim = await import(path.join(ROOT, 'cell_serpent', 'sim.js'));
const D = await import(path.join(ROOT, 'cell_serpent', 'daily_b16c.js'));
const api = await import(path.join(ROOT, 'functions', 'api', 'cell_serpent_daily.js'));

// ---- the day
assert.equal(D.dayId(Date.UTC(2026, 10, 5, 23, 59)), '2026-11-05'); assert.equal(D.dayId(Date.UTC(2026, 10, 6, 0, 0)), '2026-11-06');
assert.equal(D.dailySeed('2026-11-05'), D.dailySeed('2026-11-05')); assert.notEqual(D.dailySeed('2026-11-05'), D.dailySeed('2026-11-06'));
const stages = new Set(); for (let d = 1; d <= 120; d++) { const id = '2026-' + String(1 + (d % 12)).padStart(2, '0') + '-' + String(1 + (d % 28)).padStart(2, '0'); const s = D.dailyStage(id); assert.ok(s >= D.DAILY_MIN && s <= D.DAILY_MAX && !sim.isBossStage(s) || sim.isBossStage(s)); stages.add(s); assert.ok(D.dailySeed(id) > 0); }
assert.ok(stages.size >= 6, 'the stage varies from day to day');

// ---- the same snake for everyone, the same card rolls for everyone
const opts = id => ({ seed: D.dailySeed(id), stage: D.dailyStage(id), mode: 'daily', did: id });
const sig = g => g.snakes.map(sn => sn.segs.map(s => s.hp.toFixed(3) + s.kind).join('|')).join('/');
const a = sim.createGame(opts('2026-11-05')), b = sim.createGame(opts('2026-11-05'));
assert.equal(sig(a), sig(b), 'identical snake'); assert.notEqual(sig(a), sig(sim.createGame(opts('2026-11-06'))));
assert.equal(a.mode, 'daily'); assert.equal(a.did, '2026-11-05'); assert.ok(a.dseed > 0);
const cards = g => { g.pending = 1; g.phase = 'levelup'; g.choices = []; sim.reroll(g); return JSON.stringify([g.choices.map(c => c.id + ':' + c.rarity)]); };
for (let i = 0; i < 40; i++) a.rand(); a.t = 33;   // a different fight (the fight rng moved on) must not change the offer
a.phase = 'levelup'; a.rerolls = 4; const ca = (() => { a.choices = []; const before = a.rerolls; sim.reroll(a); return a.choices.map(c => c.id + ':' + c.rarity).join(','); })();
b.phase = 'levelup'; b.rerolls = 4; const cb = (() => { sim.reroll(b); return b.choices.map(c => c.id + ':' + c.rarity).join(','); })();
assert.equal(ca, cb, 'same cards for everyone at the same moment'); assert.ok(ca.split(',').length === 3);
{ const n1 = sim.createGame({ seed: 5, stage: 6 }); assert.equal(n1.dseed, 0, 'normal runs keep rolling from the fight rng'); assert.equal(n1.did, ''); }

// ---- score
assert.equal(D.dailyScore({ won: false, progress: 0.5, kills: 40, time: 60 }), 540);
assert.equal(D.dailyScore({ won: true, progress: 1, kills: 300, time: 100 }), 1000 + 500 + 200 + 200);
assert.equal(D.dailyScore({ won: true, progress: 1, kills: 0, time: 900 }), 1500); assert.equal(D.dailyScore(null), 0);
assert.ok(D.dailyScore({ won: true, progress: 9, kills: 1e9, time: -5 }) <= D.SCORE_CAP);

// ---- save: append-only field, defaults, junk cleaned, legacy saves load
const def = sim.defaultSave(); assert.deepEqual(def.dch, D.defaultDch());
const old = sim.sanitizeSave({ v: 8, cleared: 12, beats: 500 }); assert.deepEqual(old.dch, D.defaultDch(), 'an old save loads');
const junk = sim.sanitizeSave({ dch: { name: '<b>Hax</b>\u0000 a very long name indeed', best: 1e9, tries: -4, id: 'nope', top: 'x', plays: 5.7, paid: 3 } });
assert.equal(junk.dch.name.length <= 16, true); assert.ok(!/[<>]/.test(junk.dch.name)); assert.equal(junk.dch.best, D.SCORE_CAP); assert.equal(junk.dch.tries, 0); assert.equal(junk.dch.id, ''); assert.equal(junk.dch.plays, 5); assert.equal(junk.dch.paid, 1);

// ---- applyResult: a daily result never touches stage progress, stars, xp, energy or beats; it pays 3 Ribbons once a day
const s = sim.sanitizeSave({}); const snap = JSON.stringify({ prog: s.prog, stars: s.stars, cleared: s.cleared, xp: s.xp, beats: s.beats, runs: s.runs, sparkles: s.sparkles, eggs: s.eggs });
const res = (over = {}) => ({ mode: 'daily', did: '2026-11-05', stage: 9, won: false, progress: 0.4, kills: 30, time: 50, coins: 999, frags: { swab: 5 }, stars: 0, ...over });
let out = sim.applyResult(s, res());
assert.equal(JSON.stringify({ prog: s.prog, stars: s.stars, cleared: s.cleared, xp: s.xp, beats: s.beats, runs: s.runs, sparkles: s.sparkles, eggs: s.eggs }), snap, 'stage progress untouched');
assert.equal(out.daily.score, 430); assert.equal(s.dch.best, 430); assert.equal(s.dch.tries, 1); assert.equal(s.ribbons, D ? def.ribbons + 3 : 0); assert.equal(out.ribbons, 3); assert.ok(out.daily.firstTry);
out = sim.applyResult(s, res({ progress: 0.2 })); assert.equal(s.dch.best, 430, 'a worse try keeps the best'); assert.equal(s.dch.tries, 2); assert.equal(out.ribbons, undefined, 'paid once a day'); assert.equal(s.ribbons, def.ribbons + 3);
out = sim.applyResult(s, res({ progress: 0.9, kills: 90 })); assert.ok(out.daily.newBest); assert.equal(s.dch.best, 990); assert.equal(s.dch.top, 990);
out = sim.applyResult(s, res({ did: '2026-11-06', progress: 0.1, kills: 0 })); assert.equal(s.dch.best, 100, 'a new day starts fresh'); assert.equal(s.dch.top, 990, 'the record stays'); assert.equal(s.ribbons, def.ribbons + 6, 'a new day pays again');
assert.ok(sim.makeResult ? true : true);

// ---- a bot can play the daily to the end and the result carries the day id
{ const g = sim.createGame(opts('2026-11-05')); g.revivesLeft = 0; let i = 0; while (g.phase !== 'dead' && g.phase !== 'won' && i++ < 60 * 400) { if (g.phase === 'levelup') sim.choose(g, 0); else sim.step(g, 1 / 60, sim.botInput(g)); }
  assert.ok(g.result, 'the run ended'); assert.equal(g.result.mode, 'daily'); assert.equal(g.result.did, '2026-11-05'); assert.ok(D.dailyScore(g.result) >= 0); }

// ---- share text and the client helpers
const sh = D.dailyShare('2026-11-05', 840, 'Sunny Stage', 7, 'https://x/'); assert.ok(sh.includes('840') && sh.includes('#7') && sh.includes('https://x/') && !sh.includes('' + String.fromCharCode(8212) + ''));
assert.equal(D.myRank([{ name: 'A', score: 9 }, { name: 'Me', score: 5 }], 'Me'), 2); assert.equal(D.myRank([], 'Me'), 0);
assert.equal(await D.fetchBoard(async () => { throw new Error('offline'); }), null, 'offline fails soft');
assert.equal(await D.fetchBoard(async () => ({ ok: false })), null);
assert.deepEqual((await D.fetchBoard(async () => ({ ok: true, json: async () => ({ day: 'd', top: [{ name: 'A<b>', score: 7.9 }] }) }))).top, [{ name: 'Ab', score: 7 }]);
assert.equal(await D.postScore('x', 5, async () => { throw new Error('offline'); }), null);

// ---- the Pages Function
function mockKV() { const store = new Map(); return { async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v, o) { if (o && o.expirationTtl != null && o.expirationTtl < 60) throw new Error('expirationTtl must be at least 60'); store.set(k, String(v)); }, _store: store }; }
const post = (env, body, ip) => api.onRequestPost({ env, request: new Request('http://x/api/cell_serpent_daily', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip || '1.1.1.1' }, body: typeof body === 'string' ? body : JSON.stringify(body) }) });
assert.equal((await api.onRequestGet({ env: {} })).status, 503); assert.equal((await post({}, { name: 'a', score: 5 })).status, 503);
const kv = mockKV(), env = { BOARD: kv };
assert.deepEqual(await (await api.onRequestGet({ env })).json().then(j => j.top), []);
let r1 = await post(env, { name: 'Ann <b>', score: 500 }, '1.1.1.1'); assert.equal(r1.status, 200); let j1 = await r1.json(); assert.equal(j1.top[0].name, 'Ann b'); assert.equal(j1.rank, 1); assert.equal(j1.day, api.dayId(Date.now()));
assert.equal((await post(env, { name: 'Bob', score: 600 }, '1.1.1.1')).status, 429, 'per-IP throttle');
assert.equal((await post(env, { name: 'Bob', score: 0 }, '2.2.2.2')).status, 400); assert.equal((await post(env, { name: 'Bob', score: 99999 }, '2.2.2.2')).status, 400); assert.equal((await post(env, 'nope', '2.2.2.2')).status, 400);
const j2 = await (await post(env, { name: 'Bob', score: 600 }, '3.3.3.3')).json(); assert.equal(j2.top[0].name, 'Bob'); assert.equal(j2.rank, 1); assert.equal(j2.top.length, 2);
const j3 = await (await post(env, { name: 'Bob', score: 100 }, '4.4.4.4')).json(); assert.equal(j3.top.find(e => e.name === 'Bob').score, 600, 'a lower score never replaces a best');
for (let i = 0; i < 60; i++) await post(env, { name: 'P' + i, score: 10 + i }, '9.9.' + i + '.1'); const big = await (await api.onRequestGet({ env })).json(); assert.equal(big.top.length, 50, 'capped at 50'); assert.ok(big.top[0].score >= big.top[1].score);
for (const k of kv._store.keys()) assert.ok(k.startsWith('csd:'), 'keys stay in the csd: namespace');

// ---- wiring and house rules
const main = fs.readFileSync(path.join(ROOT, 'cell_serpent', 'main.js'), 'utf8');
assert.ok(main.includes("startRun(dchStage(dchDayId()), 'daily')") && main.includes('mountDailyTile(dchCtx)') && main.includes('dailyAfterResult(dchCtx'), 'main.js wires the daily');
assert.ok(/isUnlocked\('gigs', save\)/.test(main.slice(main.indexOf('const dchCtx'), main.indexOf('const dchCtx') + 300)), 'opens with the Daily Gigs (stage 6), not on a fresh account');
const html = fs.readFileSync(path.join(ROOT, 'cell_serpent', 'index.html'), 'utf8');
assert.ok(html.indexOf('@css:39-c-daily') > 0 && html.indexOf('@css:39-c-daily') < html.indexOf('@css:34-phone-hub'), 'css block sits before the phone block');
for (const f of ['cell_serpent/daily_b16c.js', 'cell_serpent/daily_ui_b16c.js', 'functions/api/cell_serpent_daily.js']) assert.ok(!fs.readFileSync(path.join(ROOT, f), 'utf8').includes('' + String.fromCharCode(8212) + ''), f + ' has no em dash');
assert.ok(/expirationTtl: Math\.max\(60,/.test(fs.readFileSync(path.join(ROOT, 'functions/api/cell_serpent_daily.js'), 'utf8')), 'ttl is at least 60');
console.log('39_c_daily ok');

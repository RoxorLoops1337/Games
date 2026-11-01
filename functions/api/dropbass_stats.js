// Drop the Bass: privacy friendly balance analytics (Cloudflare Pages Function, KV binding BOARD, keys 'dtb:stats:').
//
//   POST /api/dropbass_stats  {v:1, events:[ {k:'run_end', world, mode, difficulty, won, wave, wavesTotal, leaks, leakLane?,
//                              loadoutTop3:[turret ids], branchIds:[remix ids], modifiers:[mod ids], seconds},
//                              {k:'turret_pick', turret, world?} ]}
//        -> { ok:true, accepted:n }. Anonymous: no identifiers, no free text, everything is whitelisted and clamped, at most
//        MAX_EVENTS events and MAX_BYTES bytes per request. Only counters are kept, one KV document per UTC day
//        (key dtb:stats:d:YYYY-MM-DD, ttl 91 days). The IP is never stored: the rate limit key is a salted hash that expires
//        after 60 seconds.
//   GET  /api/dropbass_stats?days=30  -> aggregates only (win rate per world and difficulty, average wave, turret usage and win
//        rate, most common leak lane per world, top remix branches, modes). Max 90 days.
// Without the KV binding both answer 503 and the game silently keeps playing.
import { TURRETS, WORLDS } from '../../drop_the_bass/js/data_core.js';
import { REMIX_IDS, DAILY_MOD_IDS, WAVE_MODS } from '../../drop_the_bass/js/data_run.js';

const json = (o, s, h) => new Response(JSON.stringify(o), {
  status: s || 200,
  headers: Object.assign({ 'content-type': 'application/json', 'access-control-allow-origin': '*' }, h || {}),
});
const kv = (env) => env.BOARD || env.board || env.Board || null;

export const MAX_BYTES = 6000;
export const MAX_EVENTS = 20;
export const KEEP_DAYS = 90;
const RL_MS = 20000;
export const WORLD_IDS = WORLDS.map((w) => w.id);
export const MODES = ['story', 'endless', 'daily', 'weekly', 'rush'];
export const DIFFS = ['easy', 'normal', 'hard'];
const TURRET_IDS = Object.keys(TURRETS);
const BRANCH_IDS = new Set(REMIX_IDS);
const MOD_IDS = new Set([...DAILY_MOD_IDS, ...Object.keys(WAVE_MODS)]);
const RUN_KEYS = new Set(['k', 'world', 'mode', 'difficulty', 'won', 'wave', 'wavesTotal', 'leaks', 'leakLane', 'loadoutTop3', 'branchIds', 'modifiers', 'seconds']);
const PICK_KEYS = new Set(['k', 'turret', 'world']);

const p2 = (n) => String(n).padStart(2, '0');
export const dayKey = (now) => { const d = new Date(now); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); };
const intIn = (v, lo, hi) => { if (typeof v !== 'number' || !Number.isFinite(v)) return null; const n = Math.floor(v); return n < lo || n > hi ? null : n; };
const onlyKeys = (o, set) => Object.keys(o).every((k) => set.has(k));
const idList = (a, ok, max) => {
  if (a === undefined) return [];
  if (!Array.isArray(a) || a.length > max) return null;
  const out = [];
  for (const x of a) { if (typeof x !== 'string' || !ok(x)) return null; if (!out.includes(x)) out.push(x); }
  return out;
};

// returns a clean event or null. Never copies unknown data.
export function cleanEvent(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  if (e.k === 'turret_pick') {
    if (!onlyKeys(e, PICK_KEYS) || !TURRET_IDS.includes(e.turret)) return null;
    if (e.world !== undefined && !WORLD_IDS.includes(e.world)) return null;
    return { k: 'turret_pick', turret: e.turret, world: e.world || null };
  }
  if (e.k !== 'run_end') return null;
  if (!onlyKeys(e, RUN_KEYS)) return null;
  if (!WORLD_IDS.includes(e.world) || !MODES.includes(e.mode) || !DIFFS.includes(e.difficulty) || typeof e.won !== 'boolean') return null;
  const wave = intIn(e.wave, 0, 500), wavesTotal = intIn(e.wavesTotal, 0, 500), leaks = intIn(e.leaks, 0, 9999), seconds = intIn(e.seconds, 0, 86400);
  if (wave === null || wavesTotal === null || leaks === null || seconds === null) return null;
  let leakLane = null;
  if (e.leakLane !== undefined && e.leakLane !== null) { leakLane = intIn(e.leakLane, 0, 3); if (leakLane === null) return null; }
  const top = idList(e.loadoutTop3, (x) => TURRET_IDS.includes(x), 3), br = idList(e.branchIds, (x) => BRANCH_IDS.has(x), 12), mods = idList(e.modifiers, (x) => MOD_IDS.has(x), 6);
  if (!top || !br || !mods) return null;
  return { k: 'run_end', world: e.world, mode: e.mode, difficulty: e.difficulty, won: e.won, wave, wavesTotal, leaks, leakLane, loadoutTop3: top, branchIds: br, modifiers: mods, seconds };
}

const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const sub = (o, k) => (o[k] || (o[k] = {}));

export function emptyDay() { return { runs: 0, secondsSum: 0, leaksSum: 0, modes: {}, worlds: {}, turrets: {}, picks: {}, leakLanes: {}, branches: {}, mods: {} }; }

export function applyEvent(d, e) {
  if (e.k === 'turret_pick') { bump(d.picks, e.turret); return; }
  d.runs++; d.secondsSum += e.seconds; d.leaksSum += e.leaks; bump(d.modes, e.mode);
  const w = sub(sub(d.worlds, e.world), e.difficulty);
  bump(w, 'runs'); if (e.won) bump(w, 'wins'); bump(w, 'waveSum', e.wave); bump(w, 'wavesTotalSum', e.wavesTotal);
  for (const t of e.loadoutTop3) { const r = sub(d.turrets, t); bump(r, 'runs'); if (e.won) bump(r, 'wins'); }
  if (e.leakLane !== null && e.leaks > 0) bump(sub(d.leakLanes, e.world), String(e.leakLane));
  for (const b of e.branchIds) bump(d.branches, b);
  for (const m of e.modifiers) bump(d.mods, m);
}

async function ipKey(ip, now) {
  const data = new TextEncoder().encode('dtb-salt:' + dayKey(now) + ':' + ip);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return 'dtb:stats:rl:' + Array.from(h.slice(0, 10), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  const declared = +(request.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) return json({ error: 'too large' }, 413);
  let text; try { text = await request.text(); } catch (_) { return json({ error: 'bad body' }, 400); }
  if (text.length > MAX_BYTES) return json({ error: 'too large' }, 413);
  let body; try { body = JSON.parse(text); } catch (_) { return json({ error: 'bad json' }, 400); }
  if (!body || typeof body !== 'object' || body.v !== 1 || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > MAX_EVENTS) return json({ error: 'bad batch' }, 400);
  const events = body.events.map(cleanEvent).filter(Boolean);
  if (!events.length) return json({ error: 'no valid events' }, 400);
  const now = Date.now();
  const rl = await ipKey(request.headers.get('cf-connecting-ip') || '?', now);
  const last = await KV.get(rl);
  if (last && now - +last < RL_MS) return json({ error: 'slow down' }, 429);
  await KV.put(rl, String(now), { expirationTtl: 60 });
  const key = 'dtb:stats:d:' + dayKey(now);
  let day; try { day = JSON.parse((await KV.get(key)) || 'null'); } catch (_) { day = null; }
  if (!day || typeof day !== 'object') day = emptyDay();
  for (const e of events) applyEvent(day, e);
  await KV.put(key, JSON.stringify(day), { expirationTtl: (KEEP_DAYS + 1) * 86400 });
  return json({ ok: true, accepted: events.length });
}

const rate = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : 0);
const merge = (into, from) => {
  for (const k of Object.keys(from || {})) { if (from[k] && typeof from[k] === 'object') merge(sub(into, k), from[k]); else into[k] = (into[k] || 0) + from[k]; }
};

// pure: sum a list of day documents into the public summary
export function summarize(days) {
  const t = emptyDay(); for (const d of days) merge(t, d);
  const byWorld = {};
  for (const w of Object.keys(t.worlds)) {
    byWorld[w] = {};
    for (const df of Object.keys(t.worlds[w])) { const r = t.worlds[w][df]; byWorld[w][df] = { runs: r.runs || 0, winRate: rate(r.wins || 0, r.runs || 0), avgWave: Math.round(((r.waveSum || 0) / Math.max(1, r.runs || 0)) * 10) / 10 }; }
  }
  const turrets = Object.keys(t.turrets).map((id) => ({ id, runs: t.turrets[id].runs || 0, winRate: rate(t.turrets[id].wins || 0, t.turrets[id].runs || 0), picks: t.picks[id] || 0 })).sort((a, b) => b.runs - a.runs);
  for (const id of Object.keys(t.picks)) if (!t.turrets[id]) turrets.push({ id, runs: 0, winRate: 0, picks: t.picks[id] });
  const leakLane = {};
  for (const w of Object.keys(t.leakLanes)) { const ls = Object.entries(t.leakLanes[w]).sort((a, b) => b[1] - a[1]); leakLane[w] = { lanes: t.leakLanes[w], top: ls.length ? +ls[0][0] : null }; }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, count]) => ({ id, count }));
  return { runs: t.runs, avgSeconds: Math.round(t.secondsSum / Math.max(1, t.runs)), avgLeaks: Math.round((t.leaksSum / Math.max(1, t.runs)) * 10) / 10, modes: t.modes, byWorld, turrets, leakLane, topBranches: top(t.branches, 10), topModifiers: top(t.mods, 10) };
}

export async function onRequestGet({ request, env }) {
  const KV = kv(env);
  if (!KV) return json({ error: 'not configured' }, 503);
  let days = 30;
  try { const q = new URL(request.url).searchParams.get('days'); if (q !== null) days = Math.max(1, Math.min(KEEP_DAYS, Math.floor(+q) || 30)); } catch (_) { /* default */ }
  const now = Date.now(), docs = [];
  for (let i = 0; i < days; i++) { const raw = await KV.get('dtb:stats:d:' + dayKey(now - i * 86400000)); if (raw) { try { docs.push(JSON.parse(raw)); } catch (_) { /* skip */ } } }
  return json(Object.assign({ days, from: dayKey(now - (days - 1) * 86400000), to: dayKey(now) }, summarize(docs)), 200, { 'cache-control': 'public, max-age=300' });
}

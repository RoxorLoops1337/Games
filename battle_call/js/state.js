// Battle Call: client state (the mirror of what the server pushes) and the market maths the screens share.
import { SERVER } from './config.js';
import { roundInfo, roundsOf, multiplier as mult, poolTotal, sidePool, payoutFor } from './shared.js';

export const S = {
  code: null, role: 'guest', name: '', tk: '', ht: '',
  meta: null, live: null, board: [], me: null, host: null,
  conn: 'idle', // idle | live | poll | down
  bb: {}, match: {}, mk: {}, gone: false, authFail: false, ready: false,
};

const subs = new Set();
let queued = false;
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export function emit() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } }); });
}

export function setMeta(m) {
  S.meta = m;
  S.bb = Object.fromEntries(m.bbs.map((b) => [b.id, b]));
  S.match = Object.fromEntries(m.matches.map((x) => [x.id, x]));
  S.mk = Object.fromEntries(m.mk.map((x) => [x.id, x]));
}

export function resetState() {
  Object.assign(S, { code: null, role: 'guest', name: '', tk: '', ht: '', meta: null, live: null, board: [], me: null, host: null,
    conn: 'idle', bb: {}, match: {}, mk: {}, gone: false, authFail: false, ready: false });
}

/* ------------------------------------------------------------ server address */
export function serverBase() {
  let s = '';
  try { s = localStorage.getItem('bc.server') || ''; } catch (_) { /* */ }
  return (s || SERVER || location.origin).replace(/\/+$/, '');
}
export function setServer(url) {
  try { if (url) localStorage.setItem('bc.server', url.replace(/\/+$/, '')); else localStorage.removeItem('bc.server'); } catch (_) { /* */ }
}

/* ------------------------------------------------------------ sessions (per event, this phone) */
const KEY = 'bc.sessions';
export function sessions() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } }
export function saveSession(code, patch) {
  const all = sessions();
  all[code] = { ...(all[code] || {}), ...patch, t: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) { /* */ }
}
export function dropSession(code, keys) {
  const all = sessions();
  if (!all[code]) return;
  if (keys) for (const k of keys) delete all[code][k]; else delete all[code];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) { /* */ }
}
export function deviceId() {
  let d = '';
  try { d = localStorage.getItem('bc.device') || ''; } catch (_) { /* */ }
  if (!d) {
    d = Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => x.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem('bc.device', d); } catch (_) { /* */ }
  }
  return d;
}

/* ------------------------------------------------------------ derived */
export const bbName = (id) => (S.bb[id] ? S.bb[id].name : '?');
export const size = () => (S.meta ? S.meta.set.size : 16);
export const rounds = () => roundsOf(size());
export const seedOf = (id) => (S.meta && S.meta.seeds ? S.meta.seeds.indexOf(id) + 1 : 0);
export const curMatch = () => (S.meta ? S.meta.matches.find((m) => ['live', 'voting', 'closed'].includes(m.status)) : null);
export const nextMatch = () => (S.meta ? S.meta.matches.find((m) => m.status === 'upcoming') : null);
export const isOut = (id) => !!S.meta && S.meta.out[id] !== undefined;
/** [left, right] ids as the hall sees them: left = blue. */
export const sides = (m) => (m.swap ? [m.b, m.a] : [m.a, m.b]);
/** which of 'a'|'b' stands on the left (blue) / right (red) */
export const leftKey = (m) => (m.swap ? 'b' : 'a');

/** A market with its live numbers and odds, ready to draw. */
export function mkView(m) {
  const lv = S.live && S.live.mk && S.live.mk[m.id];
  const pool = lv ? lv[0] : m.seed.map(() => 0), cnt = lv ? lv[1] : m.seed.map(() => 0);
  const v = { ...m, pool, cnt };
  const minP = S.meta ? S.meta.set.minPayout : 1;
  v.total = poolTotal(v);
  v.real = pool.reduce((a, b) => a + b, 0);
  v.people = cnt.reduce((a, b) => a + b, 0);
  v.mult = m.seed.map((_, i) => mult(v, i, minP));
  v.pct = m.seed.map((_, i) => (v.real ? Math.round((pool[i] / v.real) * 100) : 0));
  v.dead = m.seed.map((_, i) => m.kind === 'champion' && isOut(m.bbs[i]));
  v.mine = S.me && S.me.bets ? S.me.bets[m.id] : null;
  return v;
}
export const payoutIf = (mv, i, stake) => {
  // what you would collect if you added `stake` to side i right now (your own money moves the odds)
  const next = { seed: mv.seed, pool: mv.pool.map((p, k) => p + (k === i ? stake : 0)) };
  return payoutFor(next, i, stake, S.meta.set.minPayout);
};

export function mkLabel(m, i) {
  if (m.kind === 'match') return bbName(m.bbs[i]);
  if (m.kind === 'champion') return bbName(m.bbs[i]);
  return i === 0 ? 'Yes' : 'No';
}
export function mkTitle(m) {
  const n = size();
  if (m.kind === 'qualify') return { title: bbName(m.bb), sub: `Makes the Top ${n}?` };
  if (m.kind === 'reach') return { title: bbName(m.bb), sub: `Reaches the ${roundInfo(n, m.to).short}?` };
  if (m.kind === 'match') {
    const mt = S.match[m.mid];
    return { title: `${bbName(m.bbs[0])} vs ${bbName(m.bbs[1])}`, sub: mt ? roundInfo(n, mt.r).short : 'Battle' };
  }
  return { title: 'Who wins it all?', sub: 'Battle champion' };
}
export const myBet = (id) => (S.me && S.me.bets ? S.me.bets[id] : null);

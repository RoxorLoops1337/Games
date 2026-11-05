// Cell Serpent, batch 16 (agent c): the Daily Challenge. Pure module (no DOM, no sim import) so the sim, the hub and
// the tests can all use it. One fixed show per UTC day: the same stage, the same snake and the same card rolls for
// everybody, played with the house band (no upgrades from home) so the board is fair. The score counts how far you
// got, a win pays a bonus, and the best of the day is kept in the save (save.dch, append-only).

export const DAILY_MIN = 4, DAILY_MAX = 20;   // stage range: plain lane stages a bare duo can make progress on
export const SCORE_CAP = 3000, NAME_MAX = 16, DAILY_RIBBONS = 3;
export const DAILY_NAMES = ['Sunny Soundcheck', 'Moonlit Encore', 'Pancake Parade', 'Velvet Matinee', 'Kitten Cabaret', 'Chick Chorus', 'Puppy Pop-up'];

const p2 = n => String(n).padStart(2, '0');
export function dayId(now = Date.now()) { const d = new Date(now); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); }
export function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export const dailySeed = id => (hash('cs-daily-' + id) % 999999937) + 1;
export const dailyStage = id => DAILY_MIN + (hash('cs-stage-' + id) % (DAILY_MAX - DAILY_MIN + 1));
export const dailyTitle = id => DAILY_NAMES[hash('cs-name-' + id) % DAILY_NAMES.length];
export const cleanName = s => String(s == null ? '' : s).replace(/[^\w \-.']/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

// How far you got (up to 1000), a win pays 500 plus a speed bonus (up to 300), every popped cell adds a point (up to 200).
export function dailyScore(r) {
  if (!r) return 0;
  const pct = Math.max(0, Math.min(1, r.won ? 1 : +r.progress || 0)), t = Math.max(0, +r.time || 0);
  const s = Math.round(pct * 1000) + (r.won ? 500 + Math.max(0, Math.min(300, Math.round(300 - t))) : 0) + Math.min(200, Math.max(0, r.kills | 0));
  return Math.max(0, Math.min(SCORE_CAP, s));
}

export const defaultDch = () => ({ name: '', id: '', best: 0, tries: 0, top: 0, plays: 0, paid: 0 });
export function sanitizeDch(raw) {
  const d = defaultDch(); if (!raw || typeof raw !== 'object') return d;
  const n = (v, mx) => (Number.isFinite(+v) && +v > 0 ? Math.min(mx, Math.floor(+v)) : 0);
  d.name = cleanName(raw.name); d.id = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.id)) ? String(raw.id) : '';
  d.best = n(raw.best, SCORE_CAP); d.tries = n(raw.tries, 9999); d.top = n(raw.top, SCORE_CAP); d.plays = n(raw.plays, 999999); d.paid = raw.paid ? 1 : 0;
  return d;
}
// make today's record current: a new day clears best, tries and the paid flag, the lifetime numbers stay
export function dchToday(save, id) {
  if (!save.dch || typeof save.dch !== 'object') save.dch = defaultDch();
  const d = save.dch; if (d.id !== id) { d.id = id; d.best = 0; d.tries = 0; d.paid = 0; }
  return d;
}
// the run ended (applyResult calls this for mode 'daily'): the same shape applyResult returns, plus the daily numbers
export function recordDaily(save, r) {
  const id = r.did || dayId(), d = dchToday(save, id), score = dailyScore(r), prev = d.best;
  const out = { beats: 0, sparkles: 0, first: false, egg: false, levelUps: 0, frags: {}, prevPct: 0, starsGained: 0, joy: {}, daily: { id, score, prev, newBest: false, firstTry: !d.tries, pb: false, pay: false } };
  d.tries++; d.plays++;
  if (score > d.best) { d.best = score; out.daily.newBest = prev > 0; }
  if (score > d.top) { d.top = score; out.daily.pb = true; }
  out.daily.bestToday = d.best;
  if (!d.paid && score > 0) { d.paid = 1; out.daily.pay = true; }   // the first show of the day pays a few Ribbons (cosmetic currency)
  return out;
}

export function dailyShare(id, score, stageName, rank, url) {
  return `Cell Serpent Daily ${id}: ${score} points${stageName ? ' on ' + stageName : ''}${rank ? ' (#' + rank + ' today)' : ''}. Same snake for everyone, can you beat it?${url ? ' ' + url : ''}`;
}

// ---- the board over the network (the Pages Function in functions/api). Everything fails soft: null means "no board".
export const BOARD_URL = '/api/cell_serpent_daily';
export async function fetchBoard(fetchFn = globalThis.fetch, url = BOARD_URL) {
  try { const res = await fetchFn(url, { cache: 'no-store' }); if (!res.ok) return null; const j = await res.json(); return Array.isArray(j.top) ? { day: String(j.day || ''), top: j.top.slice(0, 50).map(e => ({ name: cleanName(e.name) || 'Anonymous', score: e.score | 0 })) } : null; } catch (e) { return null; }
}
export async function postScore(name, score, fetchFn = globalThis.fetch, url = BOARD_URL) {
  try {
    const res = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: cleanName(name) || 'Anonymous', score: Math.min(SCORE_CAP, score | 0) }) });
    if (!res.ok) return null; const j = await res.json(); return Array.isArray(j.top) ? { day: String(j.day || ''), top: j.top.map(e => ({ name: cleanName(e.name) || 'Anonymous', score: e.score | 0 })), rank: j.rank | 0 } : null;
  } catch (e) { return null; }
}
export const myRank = (top, name) => { const i = top.findIndex(e => e.name === (cleanName(name) || 'Anonymous')); return i < 0 ? 0 : i + 1; };

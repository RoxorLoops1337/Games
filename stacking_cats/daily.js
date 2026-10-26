// Daily challenge helpers: score, and the small client for the leaderboard function.
export const dailyScore = (run) => Math.max(1, Math.floor(run.wave * 100 + run.kills + run.bossKills * 50));
export const BOARD_URL = '/api/stackingcats_board';

// consecutive days the daily challenge was played, counting back from today (or from yesterday while today is still open)
export function dailyStreak(book, ms = Date.now()) {
  const key = (back) => { const d = new Date(ms - back * 86400000), p = (n) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`; };
  let back = book && book[key(0)] ? 0 : 1, n = 0;
  while (book && book[key(back)]) { n++; back++; }
  return n;
}

async function withTimeout(promise, ms) {
  let timer;
  const t = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), ms); });
  try { return await Promise.race([promise, t]); } finally { clearTimeout(timer); }
}

// returns { ok: true, day, top, all } or { ok: false }. Never throws, the game just hides the board.
export async function fetchBoard(day, fetchFn = (typeof fetch === 'function' ? fetch : null), ms = 4000, weekly = false) {
  try {
    // weekly boards use ?type=weekly&week=YYYY-Www, the daily client keeps ?day=
    const r = await withTimeout(fetchFn(weekly ? `${BOARD_URL}?type=weekly&week=${encodeURIComponent(day)}` : `${BOARD_URL}?day=${encodeURIComponent(day)}`), ms);
    if (!r.ok) return { ok: false };
    const j = await r.json();
    return { ok: true, day: j.day || j.week, week: j.week, top: Array.isArray(j.top) ? j.top : [], all: Array.isArray(j.all) ? j.all : [] };
  } catch (e) { return { ok: false }; }
}

export async function submitScore(entry, fetchFn = (typeof fetch === 'function' ? fetch : null), ms = 5000) {
  try {
    const r = await withTimeout(fetchFn(BOARD_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) }), ms);
    if (!r.ok) return { ok: false, status: r.status };
    const j = await r.json();
    return { ok: true, day: j.day || j.week, week: j.week, top: j.top || [], all: j.all || [] };
  } catch (e) { return { ok: false }; }
}

export const rankOf = (list, name) => { const i = list.findIndex((e) => e.name === name); return i < 0 ? 0 : i + 1; };

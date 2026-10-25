// Daily challenge helpers: score, and the small client for the leaderboard function.
export const dailyScore = (run) => Math.max(1, Math.floor(run.wave * 100 + run.kills + run.bossKills * 50));
export const BOARD_URL = '/api/stackingcats_board';

async function withTimeout(promise, ms) {
  let timer;
  const t = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), ms); });
  try { return await Promise.race([promise, t]); } finally { clearTimeout(timer); }
}

// returns { ok: true, day, top, all } or { ok: false }. Never throws, the game just hides the board.
export async function fetchBoard(day, fetchFn = (typeof fetch === 'function' ? fetch : null), ms = 4000) {
  try {
    const r = await withTimeout(fetchFn(`${BOARD_URL}?day=${encodeURIComponent(day)}`), ms);
    if (!r.ok) return { ok: false };
    const j = await r.json();
    return { ok: true, day: j.day, top: Array.isArray(j.top) ? j.top : [], all: Array.isArray(j.all) ? j.all : [] };
  } catch (e) { return { ok: false }; }
}

export async function submitScore(entry, fetchFn = (typeof fetch === 'function' ? fetch : null), ms = 5000) {
  try {
    const r = await withTimeout(fetchFn(BOARD_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) }), ms);
    if (!r.ok) return { ok: false, status: r.status };
    const j = await r.json();
    return { ok: true, day: j.day, top: j.top || [], all: j.all || [] };
  } catch (e) { return { ok: false }; }
}

export const rankOf = (list, name) => { const i = list.findIndex((e) => e.name === name); return i < 0 ? 0 : i + 1; };

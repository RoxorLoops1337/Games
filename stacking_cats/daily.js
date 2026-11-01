// Daily challenge helpers: score, and the small client for the leaderboard function.
export const dailyScore = (run) => Math.max(1, Math.floor(run.wave * 100 + run.kills + run.bossKills * 50));
export const BOARD_URL = '/api/stackingcats_board';

// true when this wave beats an established record (a record of at least 3, so first runs do not celebrate every wave)
const MILESTONES = { 10: 'Wave 10! Ten down!', 20: 'Wave 20! Legendary stack!', 30: 'Wave 30! Cat royalty!', 40: 'Wave 40! Unstoppable!', 50: 'Wave 50! The ultimate stack!' };
export const milestoneLine = (wave) => MILESTONES[wave] || '';
export const bestTag = (best) => (best >= 3 ? `Best ${best}` : '');
export const passedBest = (wave, prevBest) => prevBest >= 3 && wave > prevBest;

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

// ---- usernames and the ranking list
const BAD_NAME = /(fuck|shit|cunt|nigg|fagg|bitch|whore|slut|rape|nazi|hitler|dick|cock|pussy|penis|vagina|asshole)/i;
export const cleanName = (raw) => String(raw || '').replace(/[^\w \-.']/g, '').trim().slice(0, 12);
// at least two characters and nothing the board would turn into Anonymous
export const nameOk = (raw) => { const n = cleanName(raw); return n.length >= 2 && !BAD_NAME.test(n.replace(/[ \-.'_0-9]/g, '')); };
const NAME_A = ['Whisker', 'Biscuit', 'Mochi', 'Pounce', 'Noodle', 'Pickle', 'Mittens', 'Tuna', 'Fluffy', 'Sparky', 'Cosmo', 'Muffin'];
const NAME_B = ['Boss', 'Ninja', 'Hero', 'King', 'Wizard', 'Chef', 'Pilot', 'Fox', 'Star', 'Tiger'];
export const suggestName = (rnd = Math.random) => (NAME_A[Math.floor(rnd() * NAME_A.length)] + NAME_B[Math.floor(rnd() * NAME_B.length)]).slice(0, 12);
// an ordinary (not daily or weekly) run goes on the all time ranking only
export async function submitRun(entry, fetchFn = (typeof fetch === 'function' ? fetch : null), ms = 5000) {
  return submitScore({ ...entry, type: 'run' }, fetchFn, ms);
}

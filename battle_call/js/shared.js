// Battle Call: pure helpers shared by the server (Durable Object), the browser app and the tests.
// No DOM, no IO, no Date.now(): everything here is a function of its arguments.

export const SIZES = [2, 4, 8, 16, 32, 64];
export const MAX_CATS = 8;
/** The artwork a category shows when it has no photo of its own: male, female, duo (tag team), crew, loop (loop station). */
export const ARTS = ['male', 'female', 'duo', 'crew', 'loop'];
export function guessArt(name) {
  const n = String(name || '').toLowerCase();
  if (/female|women|woman|girl|ladies|lady/.test(n)) return 'female';
  if (/tag|duo|team|pair|2v2|double/.test(n)) return 'duo';
  if (/crew|group|squad|band|choir/.test(n)) return 'crew';
  if (/loop|station|pedal/.test(n)) return 'loop';
  return 'male';
}
export const PHASES = ['lobby', 'picks', 'elimination', 'bracket', 'finished'];

export const DEFAULTS = {
  size: 16,            // how many beatboxers go through to the bracket
  start: 1000,         // Loops everybody starts with
  minPayout: 1.1,      // a winning bet always pays at least stake x this (the house tops it up)
  maxPerDevice: 2,     // accounts per phone/browser
  maxPerIp: 500,       // accounts per network address (a whole hall shares one wifi address!), 0 = off
  regOpen: true,
  qualifyBets: true,   // "Will X make the cut?" bets while picks are open
  autoChampion: true,  // open the "Who wins the whole battle?" market when the bracket is drawn
  pts: { topIn: 20, topExact: 40, topNear: 15, pick: 25, vote: 10, sync: 15, tip: 50 },
};

export const MIN_BET = 10;
/** More entrants than this and the organiser picks which "makes the cut" bets to open (200 markets would flood every phone). */
export const QUALIFY_AUTO_MAX = 48;
export const MAX_BB = 1000;
export const nameKey = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
export const cleanName = (n) =>
  String(n || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 18);
export const cleanBb = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 28);

export const log2 = (n) => Math.round(Math.log2(n));

/** Standard single-elimination seeding: 8 -> [1,8,4,5,2,7,3,6] (1v8, 4v5, 2v7, 3v6). */
export function seedOrder(n) {
  let o = [1, 2];
  while (o.length < n) { const m = o.length * 2 + 1; o = o.flatMap((s) => [s, m - s]); }
  return o.slice(0, n);
}

export function roundInfo(size, r) {
  const rounds = log2(size);
  const p = size >> r; // beatboxers still in at the start of this round
  const short = p === 2 ? 'Final' : `Top ${p}`;
  const long = p === 2 ? 'Final' : p === 4 ? 'Semi-finals' : p === 8 ? 'Quarter-finals' : `Round of ${p}`;
  return { r, p, short, long, count: size >> (r + 1), last: r === rounds - 1 };
}
export const roundsOf = (size) => Array.from({ length: log2(size) }, (_, r) => roundInfo(size, r));

export const matchId = (r, i, pfx = '') => `${pfx}r${r}m${i}`;

/** Empty bracket for a size. Round 0 knows its seeds; later rounds know which matches feed them.
 *  `pfx` keeps match ids unique across the categories of one event (the first category has none). */
export function buildMatches(size, pfx = '') {
  const order = seedOrder(size), out = [];
  for (let r = 0; r < log2(size); r++) {
    for (let i = 0; i < size >> (r + 1); i++) {
      out.push({
        id: matchId(r, i, pfx), r, i,
        seeds: r === 0 ? [order[2 * i], order[2 * i + 1]] : null,
        feed: r === 0 ? null : [matchId(r - 1, 2 * i, pfx), matchId(r - 1, 2 * i + 1, pfx)],
        a: null, b: null, status: 'wait', w: null, swap: false, judges: null, c: { a: 0, b: 0 },
      });
    }
  }
  return out;
}

export const winnerOf = (m) => (m.w === 'a' ? m.a : m.w === 'b' ? m.b : null);
export const loserOf = (m) => (m.w === 'a' ? m.b : m.w === 'b' ? m.a : null);

/** Who is in each slot of a match from one player's point of view: the real fighter if it is known, else their own pick. */
export function slotsFor(matches, picks, m) {
  const by = Object.fromEntries(matches.map((x) => [x.id, x]));
  if (!m.feed) return [m.a, m.b];
  return [m.a || (picks[m.feed[0]] && by[m.feed[0]].status !== 'done' ? picks[m.feed[0]] : null),
          m.b || (picks[m.feed[1]] && by[m.feed[1]].status !== 'done' ? picks[m.feed[1]] : null)];
}

/** Drop picks that no longer make sense (the fighter they send through is not in that match any more). */
export function cleanPicks(matches, picks) {
  const sorted = [...matches].sort((x, y) => x.r - y.r);
  for (const m of sorted) {
    const p = picks[m.id];
    if (!p) continue;
    const s = slotsFor(matches, picks, m);
    if (m.status === 'done' && !s.includes(p)) continue; // history: keep the (lost) pick so it shows struck out
    if (!s.includes(p)) delete picks[m.id];
  }
  return picks;
}

/** Pool maths for one market. seed = house money that makes the first odds sensible. */
export const poolTotal = (m) => m.seed.reduce((a, b) => a + b, 0) + m.pool.reduce((a, b) => a + b, 0);
export const sidePool = (m, i) => m.seed[i] + m.pool[i];
export function multiplier(m, i, minPayout = 1) {
  const s = sidePool(m, i);
  return s > 0 ? Math.max(minPayout, poolTotal(m) / s) : minPayout;
}
export const payoutFor = (m, i, stake, minPayout) => Math.floor(stake * multiplier(m, i, minPayout));

export const fmt = (n) => Math.round(n).toLocaleString('en-US');

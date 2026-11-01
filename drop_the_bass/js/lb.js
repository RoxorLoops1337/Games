// lb.js: tiny client for the leaderboard Pages Function (functions/api/dropbass_board.js) plus the pure name and friends helpers.
// Every network call fails soft: offline or an unconfigured server just means "no board", never an error in the game.
// Board ids: 'endless:<world>', 'daily' (UTC day), 'weekly' (ISO week, the Weekly Gig).
import { t } from './i18n.js';
const URL_BASE = '/api/dropbass_board';
export const FRIENDS_MAX = 30;
export const NAME_MAX = 16;

export async function fetchBoard(id) {
  try {
    const r = await fetch(URL_BASE + '?b=' + encodeURIComponent(id), { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.top) ? j.top : null;
  } catch (e) { return null; }
}
export async function submitScore(id, name, score) {
  try {
    const r = await fetch(URL_BASE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ b: id, name, score }) });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.top) ? j.top : null;
  } catch (e) { return null; }
}
export const rankOf = (top, name) => { const i = top ? top.findIndex((e) => e.name === name) : -1; return i < 0 ? 0 : i + 1; };

// ---------------------------------------------------------------- names (unauthenticated: always sanitise, same rule as the server)
export const cleanName = (s) => String(s == null ? '' : s).replace(/[^\w \-.']/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
export const nameKey = (s) => cleanName(s).toLowerCase();

// ---------------------------------------------------------------- friends (a plain array of names stored in the profile)
export function cleanFriends(list) {
  const out = [], seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const n = cleanName(raw), k = n.toLowerCase();
    if (!n || seen.has(k)) continue;
    seen.add(k); out.push(n);
    if (out.length >= FRIENDS_MAX) break;
  }
  return out;
}
// returns { ok, list, name } or { ok:false, reason: 'empty'|'self'|'dup'|'full' }. Never mutates the input.
export function addFriend(list, name, me) {
  const n = cleanName(name), cur = cleanFriends(list);
  if (!n) return { ok: false, reason: 'empty', list: cur };
  if (me && nameKey(me) === n.toLowerCase()) return { ok: false, reason: 'self', list: cur };
  if (cur.some((f) => f.toLowerCase() === n.toLowerCase())) return { ok: false, reason: 'dup', list: cur };
  if (cur.length >= FRIENDS_MAX) return { ok: false, reason: 'full', list: cur };
  return { ok: true, name: n, list: cur.concat([n]) };
}
export function removeFriend(list, name) {
  const k = nameKey(name);
  return cleanFriends(list).filter((f) => f.toLowerCase() !== k);
}
// Build the rows a board modal shows. top = server list (already sorted). tab 'all' | 'friends'.
//   all:     friends pinned first (score order, true rank kept), then everyone else in rank order. own row has me:true.
//   friends: only friends and you, by score; friends with no score yet are listed last with score null.
// Row: { rank, name, score, friend, me, missing }
export function boardRows(top, friends, me, tab, limit = 20) {
  const fs = new Set(cleanFriends(friends).map((f) => f.toLowerCase())), mk = nameKey(me);
  const rows = (Array.isArray(top) ? top : []).filter((e) => e && typeof e.name === 'string').map((e, i) => {
    const k = e.name.toLowerCase();
    const isMe = !!mk && k === mk;
    return { rank: i + 1, name: cleanName(e.name) || t('board.anonymous', 'Anonymous'), score: Math.floor(+e.score) || 0, friend: !isMe && fs.has(k), me: isMe, missing: false };
  });
  if (tab === 'friends') {
    const out = rows.filter((r) => r.friend || r.me);
    const have = new Set(out.map((r) => r.name.toLowerCase()));
    for (const f of cleanFriends(friends)) if (!have.has(f.toLowerCase())) out.push({ rank: 0, name: f, score: null, friend: true, me: false, missing: true });
    return out;
  }
  const pinned = rows.filter((r) => r.friend), rest = rows.filter((r) => !r.friend);
  return pinned.concat(rest.slice(0, limit));
}

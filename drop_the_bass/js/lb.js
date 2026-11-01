// lb.js: tiny client for the leaderboard Pages Function (functions/api/dropbass_board.js). Every call fails soft: offline or an
// unconfigured server just means "no board", never an error in the game.
const URL_BASE = '/api/dropbass_board';
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

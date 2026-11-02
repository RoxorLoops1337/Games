// Batch 11 (agent 11): a "find a setting" box on the Settings sheet, sticker popups for stickers earned outside a run (hub),
// a revive prompt progress bar with a sparkle shortfall line, and a share line for the result screen. DOM and pure helpers.
import { stickerIds, newStickers, showStickerPop, bumpStatsTab } from './result_b10.js';

// ---- settings search: every word must appear in the row text, "color" and "colour" are the same word
const norm = s => String(s || '').toLowerCase().replace(/color/g, 'colour').replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();
export function matchSetting(text, q) {
  const words = norm(q).split(' ').filter(Boolean); if (!words.length) return true;
  const t = norm(text); return words.every(w => t.includes(w));
}
// root: the #settings element. Rows are .tgl and label rows; headings (.setgrp, .sgrp) hide when none of their rows match.
export function filterSettings(root, q) {
  if (!root) return 0;
  const kids = [...root.children].filter(el => el.id !== 'setFind11' && el.id !== 'setNone11' && el.id !== 'setClose' && el.tagName !== 'H2');
  const active = norm(q).length > 0; let shown = 0, head = null, headHas = false;
  const flush = () => { if (head) head.hidden = active && !headHas; };
  for (const el of kids) {
    if (el.classList.contains('setgrp') || el.classList.contains('sgrp')) { flush(); head = el; headHas = false; continue; }
    const row = el.classList.contains('tgl') || el.classList.contains('volrow') || el.classList.contains('tsrow');
    if (!active) { el.hidden = false; continue; }
    if (row) { const hit = matchSetting(el.textContent, q); el.hidden = !hit; if (hit) { shown++; headHas = true; } } else el.hidden = true;
  }
  flush();
  const none = root.querySelector('#setNone11'); if (none) none.hidden = !active || shown > 0;
  return active ? shown : kids.filter(e => e.classList.contains('tgl')).length;
}
export function bindSettingsFind(root) {
  const inp = root && root.querySelector('#setFind11'); if (!inp) return;
  if (!inp.__b11) { inp.__b11 = 1; inp.addEventListener('input', () => filterSettings(root, inp.value)); }
  inp.value = ''; filterSettings(root, '');
}

// ---- stickers earned outside a run: the hub shows the same popup once, remembered per browser in its own key
const SEEN = 'cs_stk_seen_b11';
export function readSeen(store = globalThis.localStorage) { try { const v = JSON.parse(store.getItem(SEEN)); return Array.isArray(v) ? v : null; } catch (e) { return null; } }
export function writeSeen(ids, store = globalThis.localStorage) { try { store.setItem(SEEN, JSON.stringify(ids)); } catch (e) { /* private mode */ } }
// the stickers to announce now; first ever call just records what the player already owns (no popup flood)
export function hubStickerNews(save, store = globalThis.localStorage) {
  const now = stickerIds(save), seen = readSeen(store);
  if (seen === null) { writeSeen(now, store); return []; }
  const fresh = newStickers(seen, now); if (fresh.length) writeSeen(now, store);
  return fresh;
}
export function markStickersSeen(save, store = globalThis.localStorage) { writeSeen(stickerIds(save), store); }
export function hubStickerPop(save, opts = {}) {
  const list = hubStickerNews(save, opts.store); if (!list.length) return 0;
  return showStickerPop(list, { delay: 700, hold: 2000, onLand: bumpStatsTab, ...opts });
}

// ---- revive prompt: how far the serpent got and how many sparkles are missing
export function reviveShort(have, cost) { return Math.max(0, (cost | 0) - (have | 0)); }
export function reviveInfoHTML(stage, progress, sparkles, cost) {
  const pc = Math.max(0, Math.min(100, Math.floor((progress || 0) * 100))), need = reviveShort(sparkles, cost);
  const bar = `<i class="rvbar11" role="img" aria-label="${pc}% cleared"><u style="width:${pc}%"></u></i>`;
  const line = need > 0 ? `<em class="rvneed11">Need ${need} more sparkle${need === 1 ? '' : 's'}</em>` : '';
  return `Stage ${stage}: ${pc}% cleared${bar}<small>${sparkles} sparkles in your pocket</small>${line}`;
}

// ---- share line
export function shareText(r, name, url) {
  if (!r) return '';
  const m = Math.floor((r.time || 0) / 60), s = String(Math.floor((r.time || 0) % 60)).padStart(2, '0');
  const head = r.won ? `I cleared stage ${r.stage}${name ? ' (' + name + ')' : ''} in Cell Serpent` + (r.stars > 0 ? ' with ' + r.stars + ' star' + (r.stars === 1 ? '' : 's') : '')
    : `I got ${Math.floor((r.progress || 0) * 100)}% through stage ${r.stage}${name ? ' (' + name + ')' : ''} in Cell Serpent`;
  return `${head}: ${r.kills | 0} cells popped in ${m}:${s}. Can you beat that?${url ? ' ' + url : ''}`;
}
export async function shareResult(text, toast, nav = globalThis.navigator) {
  try { if (nav && nav.share) { await nav.share({ text }); return 'shared'; } } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  try { await nav.clipboard.writeText(text); if (toast) toast('Copied, paste it to a friend'); return 'copied'; } catch (e) { if (toast) toast('Could not copy'); return 'fail'; }
}

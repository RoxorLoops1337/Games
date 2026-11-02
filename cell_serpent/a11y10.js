// Accessibility batch 10 (agent 18): keyboard and screen reader paths for two things that only worked by touch.
//  - the title snake tune: a focusable lane over the title snake. Left and Right pick a body cell, Enter or Space pokes it, exactly
//    like a tap (it sends the same 'snakepoke' event), so the hidden tune and its sticker can be won without a pointer.
//  - the sticker book on the Stats tab: one Tab stop for the whole grid (roving tabindex), arrow keys move between stickers,
//    and every sticker says what it is for when focused, not only when pressed.
// DOM only, no game rules, no save changes.
import { announce, initGridNav } from './access.js';

// pure: the next body cell in direction dir (-1 left or +1 right) that passes isVisible, or the same cell when there is none
export function nextCell(cur, dir, n, isVisible = () => true) {
  for (let i = cur + dir; i >= 0 && i < n; i += dir) if (isVisible(i)) return i;
  return cur;
}
export const cellSpeech = i => (i === 0 ? 'Snake head' : 'Snake cell ' + i);
export const LANE_LABEL = 'Title snake. Left and right arrows pick one of its cells, Enter pokes it. Poking cells in the right order plays a tune.';

export function setupTitleKeys(title) {
  if (!title || title._keys10) return null;
  const cv = title.querySelector('.snake5'); if (!cv) return null;
  title._keys10 = true;
  const N = 13, lane = document.createElement('button'); lane.type = 'button'; lane.className = 'snkey'; lane.setAttribute('aria-label', LANE_LABEL);
  const mark = document.createElement('i'); mark.className = 'snkmark'; mark.setAttribute('aria-hidden', 'true');
  const keep = title.querySelector('.row'); title.insertBefore(lane, keep); title.insertBefore(mark, keep);
  let cur = 1, raf = 0;
  const cellAt = i => (cv._cell ? cv._cell(i) : null);
  const seen = i => { const p = cellAt(i); return !!p && p.x > 8 && p.x < p.W - 8; };
  const place = () => {
    const p = cellAt(cur); if (!p) { mark.classList.remove('on'); return; }
    const r = cv.getBoundingClientRect(), t = title.getBoundingClientRect();
    mark.style.left = (r.left - t.left + p.x) + 'px'; mark.style.top = (r.top - t.top + p.y) + 'px'; mark.classList.toggle('on', seen(cur));
  };
  const loop = () => { place(); raf = requestAnimationFrame(loop); };
  lane.addEventListener('focus', () => { if (!seen(cur)) for (let i = 1; i < N; i++) if (seen(i)) { cur = i; break; } cancelAnimationFrame(raf); loop(); });
  lane.addEventListener('blur', () => { cancelAnimationFrame(raf); mark.classList.remove('on'); });
  lane.addEventListener('keydown', e => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      const to = nextCell(cur, k === 'ArrowRight' ? -1 : 1, N, seen);   // the snake heads right: the head is on the right, the tail on the left
      e.preventDefault(); if (to !== cur) { cur = to; announce(cellSpeech(cur)); place(); }
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault(); const p = cellAt(cur); if (!p) return;
      title.dispatchEvent(new CustomEvent('snakepoke', { detail: { hit: true, x: p.x, y: p.y, i: cur } }));
      announce('Poked ' + cellSpeech(cur).toLowerCase());
    }
  });
  return { lane, mark, get cell() { return cur; } };
}

// the sticker book grid: roving tabindex plus arrow navigation (access.initGridNav jumps to the nearest button in that direction)
export function rovingGrid(grid) {
  if (!grid || grid._rove10) return false;
  grid._rove10 = true;
  const bs = () => [...grid.querySelectorAll('button')];
  const list = bs(); if (!list.length) return false;
  const first = list.find(b => b.classList.contains('new')) || list[0];
  for (const b of list) b.tabIndex = b === first ? 0 : -1;
  grid.addEventListener('focusin', e => { const t = e.target.closest && e.target.closest('button'); if (!t) return; for (const b of bs()) b.tabIndex = b === t ? 0 : -1; });
  grid.addEventListener('keydown', e => {
    if (e.key !== 'Home' && e.key !== 'End') return; const l = bs(); (e.key === 'Home' ? l[0] : l[l.length - 1]).focus(); e.preventDefault();
  });
  initGridNav(grid);
  grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Sticker book. Arrow keys move between stickers.');
  return true;
}
// a got sticker also says what it was for (the label of a locked one already says it)
export function describeStickers(grid, defs) {
  for (const b of grid.querySelectorAll('button[data-id]')) {
    const d = defs.find(s => s.id === b.dataset.id); if (!d) continue;
    if (b.classList.contains('got') && !b.getAttribute('aria-description')) b.setAttribute('aria-description', d.hint);
    if (b.classList.contains('new') && !/, new$/.test(b.getAttribute('aria-label') || '')) b.setAttribute('aria-label', (b.getAttribute('aria-label') || '') + ', new');
  }
}

export function initA11y10(getDefs) {
  if (typeof document === 'undefined') return;
  const title = document.getElementById('title');
  const arm = () => { try { setupTitleKeys(title); } catch (e) { /* the snake may not exist yet */ } };
  arm(); if (title && !title._keys10) { const mo = new MutationObserver(() => { arm(); if (title._keys10) mo.disconnect(); }); mo.observe(title, { childList: true }); }
  const book = () => { for (const g of document.querySelectorAll('.stkgrid')) { if (rovingGrid(g) && getDefs) describeStickers(g, getDefs()); } };
  new MutationObserver(book).observe(document.body, { childList: true, subtree: true }); book();
}

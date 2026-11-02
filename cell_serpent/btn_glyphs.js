// Round 7 (agent 19): one set of button glyphs for the modal screens. The pause screen mixed an emoji (stats) with a
// text glyph (gear), and the settings rows used a tiny text pause mark. These are inline SVG on currentColor, so they
// follow the button's ink and sit at one size and weight. Headless safe (no layout, only markup).
const svg = body => `<svg class="bg7" viewBox="0 0 24 24" width="1.1em" height="1.1em" aria-hidden="true" focusable="false">${body}</svg>`;

export const GLYPH = {
  // three rising bars
  stats: svg('<rect x="3" y="12" width="5" height="9" rx="1.8" fill="currentColor"/><rect x="9.5" y="7" width="5" height="14" rx="1.8" fill="currentColor"/><rect x="16" y="2.5" width="5" height="18.5" rx="1.8" fill="currentColor"/>'),
  // a gear: ring with eight teeth and a hole
  gear: svg('<path fill="currentColor" fill-rule="evenodd" d="M10.2 2h3.6l.5 2.6 1.6.7 2.2-1.5 2.5 2.5-1.5 2.2.7 1.6L22 10.2v3.6l-2.6.5-.7 1.6 1.5 2.2-2.5 2.5-2.2-1.5-1.6.7-.5 2.6h-3.6l-.5-2.6-1.6-.7-2.2 1.5-2.5-2.5 1.5-2.2-.7-1.6L2 13.8v-3.6l2.6-.5.7-1.6-1.5-2.2 2.5-2.5 2.2 1.5 1.6-.7zM12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z"/>'),
  pause: svg('<rect x="5" y="3.5" width="5" height="17" rx="1.8" fill="currentColor"/><rect x="14" y="3.5" width="5" height="17" rx="1.8" fill="currentColor"/>'),
};

// coloured recap icons for the pause screen (flag, clock, target), same rounded flat style
const ico = (c, body) => `<svg class="rc7" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" style="color:${c}">${body}</svg>`;
export const RECAP = {
  flag: ico('#ff7ac0', '<path fill="currentColor" d="M5 2.5a1.4 1.4 0 0 1 1.4 1.4V4c3-1.4 5 1.3 8 0 1.6-.7 3-.5 4.6.3v8.4c-1.6-.8-3-1-4.6-.3-3 1.3-5-1.4-8 0v7.7a1.4 1.4 0 0 1-2.8 0V3.9A1.4 1.4 0 0 1 5 2.5z"/>'),
  clock: ico('#7ae8f8', '<circle cx="12" cy="12.5" r="8.5" fill="currentColor"/><path d="M12 7.5v5.3l3.4 2" stroke="#1c1548" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><rect x="9.5" y="1.5" width="5" height="2.6" rx="1.2" fill="currentColor"/>'),
  target: ico('#ffd24a', '<circle cx="12" cy="12" r="9.5" fill="currentColor"/><circle cx="12" cy="12" r="6" fill="#1c1548"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/>'),
};

// the pause screen's two secondary buttons and the settings rows that carry a text glyph
export function paintButtonGlyphs(root = document) {
  const set = (el, html) => { if (el && !el.querySelector('.bg7')) el.innerHTML = html; };
  set(root.querySelector('#pStats'), GLYPH.stats + ' WHO DID WHAT');
  set(root.querySelector('#pSet'), GLYPH.gear + ' SETTINGS');
  const pg = root.querySelector('.tgl[data-k="pauseGuard"] .ti');
  set(pg, GLYPH.pause);
}

// a friendly empty state: a sleepy sparkle, one line of why, and a button back to the full list
export function emptyCard(title, hint, label, onclick) {
  const d = document.createElement('div'); d.className = 'empty7';
  d.innerHTML = '<svg class="e7i" viewBox="0 0 48 48" width="46" height="46" aria-hidden="true"><path fill="#b8a8ff" d="M24 4l4.6 12.4L41 21l-12.4 4.6L24 38l-4.6-12.4L7 21l12.4-4.6z"/><path fill="#fff" opacity=".45" d="M24 8l2.6 8 6 2.4-6 2.2z"/><circle cx="39" cy="9" r="3" fill="#ffd24a"/><circle cx="9" cy="37" r="2.2" fill="#7ae8f8"/></svg><b></b><span></span>';
  d.querySelector('b').textContent = title; d.querySelector('span').textContent = hint;
  if (onclick) { const b = document.createElement('button'); b.className = 'btn small alt'; b.textContent = label; b.onclick = onclick; d.appendChild(b); }
  return d;
}

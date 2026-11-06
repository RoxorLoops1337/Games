// Round 12 (agent l): the last picture-emoji of the hub become drawn glyphs: paw prints (empty states, season stamp,
// pet fallback), the pointing hand (tutorial finger, bigger buttons toggle) and the play / back triangles. They merge
// into glyph_sweep.js's set; flat shapes with the same dark outline as the rest. Markup only, headless safe.
const O = 'stroke="#3a1d0c" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"';
const sv = b => `<svg class="gs9" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${b}</svg>`;

export const B12L_GLYPHS = {
  paw: sv(`<ellipse cx="12" cy="16" rx="5.6" ry="4.6" fill="#ffb86b" ${O}/><ellipse cx="5" cy="11" rx="2.2" ry="2.9" transform="rotate(-20 5 11)" fill="#ffb86b" ${O}/><ellipse cx="9.4" cy="6.4" rx="2.2" ry="3" transform="rotate(-6 9.4 6.4)" fill="#ffb86b" ${O}/><ellipse cx="14.6" cy="6.4" rx="2.2" ry="3" transform="rotate(6 14.6 6.4)" fill="#ffb86b" ${O}/><ellipse cx="19" cy="11" rx="2.2" ry="2.9" transform="rotate(20 19 11)" fill="#ffb86b" ${O}/><ellipse cx="12" cy="16.4" rx="2.6" ry="1.9" fill="#ff8a8a"/>`),
  point: sv(`<path d="M9.2 3.6a1.9 1.9 0 0 1 3.8 0v7.2l5.2.7c1.8.3 2.8 1.6 2.8 3.4v1.6c0 3.4-2.2 5.9-5.6 5.9h-3.2c-1.8 0-3-.8-4-2.1L4.4 14.6c-.7-1 .1-2.2 1.2-2l3.6 1.3z" fill="#ffd9a8" ${O}/><path d="M13 11.4l2.2.3M13 13.6l2.8.4" stroke="#c98a4a" stroke-width="1.2" stroke-linecap="round" fill="none"/>`),
  play: sv(`<path d="M7 3.6c0-1 1-1.5 1.8-1l12 8.4c.8.6.8 1.7 0 2.3l-12 8.4c-.8.5-1.8 0-1.8-1z" fill="#7ad060" ${O}/><path d="M9.4 6.6l6 4.2" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".6" fill="none"/>`),
  back: sv(`<path d="M17 3.6c0-1-1-1.5-1.8-1L3.2 11c-.8.6-.8 1.7 0 2.3l12 8.4c.8.5 1.8 0 1.8-1z" fill="#7ad060" ${O}/><path d="M14.6 6.6l-6 4.2" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".6" fill="none"/>`),
};

export const B12L_EMOJI = { '🐾': 'paw', '👆': 'point', '👉': 'point', '👈': 'point', '▶': 'play', '◀': 'back' };

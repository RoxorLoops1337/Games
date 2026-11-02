// Round 8 (agent 19): the last emoji icons become one SVG set. Settings rows get a coloured rounded tile with a
// flat glyph on currentColor (bright when the switch is on, calm when off), and the Skills and Pets empty states
// get drawn pictures instead of emoji. Markup only (no layout reads), safe to import headless.
const sv = (b, vb = '0 0 24 24') => `<svg class="si8" viewBox="${vb}" width="18" height="18" aria-hidden="true" focusable="false">${b}</svg>`;
const F = 'fill="currentColor"', S = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

export const SET_ICONS = {
  sound: ['#39b6ff', sv(`<path ${F} d="M3 9.5h3.6L11.5 5v14L6.6 14.5H3z"/><path ${S} d="M15 9a4.2 4.2 0 0 1 0 6M17.8 6.3a8 8 0 0 1 0 11.4"/>`)],
  music: ['#ff7ac0', sv(`<path ${F} d="M9 4.5l11-2v13.2a3.4 3.4 0 1 1-2.2-3.2V6.4l-6.6 1.2v10.2A3.4 3.4 0 1 1 9 14.6z"/>`)],
  beatTick: ['#ffb347', sv(`<ellipse cx="12" cy="9" rx="8.5" ry="3.2" ${F}/><path ${F} opacity=".8" d="M3.5 10.5v5.3c0 1.9 3.8 3.2 8.5 3.2s8.5-1.3 8.5-3.2v-5.3c-1.6 1.5-4.8 2.2-8.5 2.2s-6.9-.7-8.5-2.2z"/><path ${S} d="M7 2.5l4 4.8M17 2.5l-4 4.8"/>`)],
  pump: ['#a78bfa', sv(`<path ${S} d="M6 3.5v17M12 3.5v17M18 3.5v17"/><rect x="3.5" y="13" width="5" height="3.6" rx="1.4" ${F}/><rect x="9.5" y="6" width="5" height="3.6" rx="1.4" ${F}/><rect x="15.5" y="10" width="5" height="3.6" rx="1.4" ${F}/>`)],
  vibrate: ['#2dd4bf', sv(`<rect x="7.5" y="3" width="9" height="18" rx="2.6" ${F}/><path ${S} d="M3.5 8.5v7M20.5 8.5v7"/>`)],
  reduceMotion: ['#5eead4', sv(`<path ${S} d="M3 9c2.2-2.4 4.2-2.4 6 0s3.8 2.4 6 0 4.2-2.4 6 0M3 15.5c2.2-2.4 4.2-2.4 6 0s3.8 2.4 6 0 4.2-2.4 6 0"/>`)],
  reduceFlash: ['#ffd24a', sv(`<path ${F} d="M12 2.5a6.6 6.6 0 0 0-3.8 12v2.2h7.6v-2.2A6.6 6.6 0 0 0 12 2.5z"/><rect x="8.6" y="18.4" width="6.8" height="2.2" rx="1.1" ${F}/><rect x="10" y="21" width="4" height="1.6" rx=".8" ${F}/>`)],
  lowQuality: ['#ff9a5a', sv(`<path ${F} d="M13.6 2L5 13.2h5.6L9.6 22l9-11.4h-5.8z"/>`)],
  bigNumbers: ['#ff8fb8', sv(`<path ${F} d="M3 7.5l3.2-2h1.9v13H6V8.4L4.2 9.6zM12 18.5v-1.8c3.2-2 4.7-3.4 4.7-4.9 0-1-.7-1.6-1.7-1.6-.9 0-1.6.5-2.1 1.4l-1.6-1.1c.8-1.6 2.1-2.4 3.8-2.4 2.2 0 3.7 1.4 3.7 3.4 0 2-1.5 3.4-3.6 4.8h3.7v2.2z"/>`)],
  colorBlind: ['#c084fc', sv(`<path ${F} d="M12 2.5C6.5 2.5 2.5 6.4 2.5 11.3c0 3.4 2.3 5 4.6 5 1.4 0 2.1.7 2.1 1.6 0 1 .3 3.6 2.8 3.6 5.6 0 9.5-4.1 9.5-9.6 0-5.1-4-9.4-9.5-9.4z"/><circle cx="7.6" cy="10.4" r="1.7" fill="#2b1a5e"/><circle cx="11" cy="6.8" r="1.7" fill="#2b1a5e"/><circle cx="16" cy="8" r="1.7" fill="#2b1a5e"/>`)],
  highContrast: ['#e5e7eb', sv(`<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2.2"/><path ${F} d="M12 3.4a8.6 8.6 0 0 1 0 17.2z"/>`)],
  slider: ['#4ade80', sv(`<path ${S} d="M7.5 7.5L3 12l4.5 4.5M16.5 7.5L21 12l-4.5 4.5M4 12h16"/>`)],
  leftHand: ['#fb923c', sv(`<path ${F} d="M7 21c-2.2-2-3-4.6-3-7l.2-3.4a1.4 1.4 0 0 1 2.8 0V13h.8V5a1.5 1.5 0 0 1 3 0v6h.8V4a1.5 1.5 0 0 1 3 0v7h.8V6a1.5 1.5 0 0 1 3 0v9.2c0 3.2-1.6 5.8-4.4 5.8z"/>`)],
  thumbZone: ['#60a5fa', sv(`<rect x="5.5" y="2.5" width="13" height="19" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path ${F} d="M6.5 15h11v3.2a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z"/>`)],
  pauseGuard: ['#f472b6', sv(`<rect x="5" y="3.5" width="5" height="17" rx="1.8" ${F}/><rect x="14" y="3.5" width="5" height="17" rx="1.8" ${F}/>`)],
  bigTap: ['#34d399', sv(`<rect x="2.8" y="2.8" width="18.4" height="18.4" rx="4.6" fill="none" stroke="currentColor" stroke-width="2"/><rect x="7.2" y="7.2" width="9.6" height="9.6" rx="2.6" ${F}/>`)],
  volume: ['#39b6ff', sv(`<path ${F} d="M3 9.5h3.6L11.5 5v14L6.6 14.5H3z"/><path ${S} d="M15 9a4.2 4.2 0 0 1 0 6"/>`)],
};

// swap the emoji in every settings row for its tile (idempotent)
export function paintSettingIcons(root = document) {
  let n = 0;
  for (const el of root.querySelectorAll('#settings .tgl[data-k] .ti, #settings .volrow:not(.tsrow) .ti')) {
    if (el.classList.contains('t8')) continue;
    const row = el.closest('.tgl'), key = row ? row.dataset.k : 'volume', d = SET_ICONS[key];
    if (!d) continue;
    el.classList.add('t8'); el.style.setProperty('--tc', d[0]); el.innerHTML = d[1]; n++;
  }
  return n;
}

// Skills and Pets empty states: a small drawn picture per kind
const PIC = {
  egg: '<path fill="#fff3d6" d="M24 5c-8 0-14 11-14 20a14 14 0 0 0 28 0C38 16 32 5 24 5z"/><path fill="#ffd24a" d="M10.4 27l5.4-3.6 4.6 3.4 4.6-3.8 4.8 3.8 5.4-3.2c.2 1 .3 2 .3 3.2a14 14 0 0 1-28 0z"/><path fill="#fff" opacity=".6" d="M17 12c1.4-2.4 3-4 4.6-4.6-1.8 2.6-2.6 5-2.8 7.6z"/>',
  moon: '<path fill="#ffe27a" d="M31 6a18 18 0 1 0 11 29A15 15 0 0 1 31 6z"/><circle cx="14" cy="12" r="2.2" fill="#fff"/><circle cx="39" cy="14" r="1.6" fill="#7ae8f8"/>',
  paw: '<g fill="#ffb8d9"><ellipse cx="24" cy="31" rx="9.5" ry="7.5"/><ellipse cx="10.5" cy="21" rx="4.2" ry="5.2" transform="rotate(-18 10.5 21)"/><ellipse cx="19" cy="12.5" rx="4.2" ry="5.4"/><ellipse cx="29" cy="12.5" rx="4.2" ry="5.4"/><ellipse cx="37.5" cy="21" rx="4.2" ry="5.2" transform="rotate(18 37.5 21)"/></g>',
  note: '<path fill="#9fe8ff" d="M17 8l22-4v26.4a7 7 0 1 1-4.4-6.5V11.4L21.4 14v21.4A7 7 0 1 1 17 29z"/><circle cx="40" cy="9" r="2.6" fill="#ff7ac0"/>',
  sprout: '<path fill="#5fd63a" d="M24 40V22c-8 0-13-4-13-11 8 0 13 3 13 11 0-8 5-12 13-12 0 7-5 12-13 12z"/><path fill="#8a5a2b" d="M14 40h20l-2.4 5H16.4z"/>',
  gift: '<rect x="7" y="21" width="34" height="21" rx="3" fill="#ff7ac0"/><rect x="5" y="14" width="38" height="9" rx="3" fill="#ffa6d5"/><path fill="#ffd24a" d="M21.5 14h5v28h-5z"/><path fill="none" stroke="#ffd24a" stroke-width="3.4" stroke-linecap="round" d="M24 14c-5-1-9-3-8-6 1.4-3.4 7 0 8 6 1-6 6.6-9.4 8-6 1 3-3 5-8 6z"/>',
  tune: '<path fill="#c9b8ff" d="M10 8h4v32h-4zM22 14h4v26h-4zM34 4h4v36h-4z"/><circle cx="12" cy="14" r="5" fill="#ff7ac0"/><circle cx="24" cy="26" r="5" fill="#ffd24a"/><circle cx="36" cy="18" r="5" fill="#7ae8f8"/>',
};
export const EMPTY_PIC = { '🥚': 'egg', '🌙': 'moon', '🐾': 'paw', '🎵': 'note', '🌱': 'sprout', '🎶': 'tune', '🎁': 'gift' };
export function emptyPic(emoji) {
  const k = EMPTY_PIC[emoji] || 'paw';
  return `<svg class="em-svg" viewBox="0 0 48 48" width="52" height="52" aria-hidden="true" focusable="false">${PIC[k]}</svg>`;
}

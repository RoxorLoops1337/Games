// Batch 8 (agent 11): the settings rows trade their emoji for one set of flat SVG glyphs, each on a small tinted tile,
// so the list reads as one family (and renders the same on every phone). Markup only, idempotent.
const S = (c, body) => `<svg class="si8" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" style="color:${c}">${body}</svg>`;
const F = 'fill="currentColor"', K = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

export const SET_ICON = {
  sound: ['#7ae8f8', S('#7ae8f8', `<path ${F} d="M3 9.5h3.6L11 5.6v12.8l-4.4-3.9H3z"/><path ${K} d="M14.5 9a4.4 4.4 0 0 1 0 6M17.2 6.6a8 8 0 0 1 0 10.8"/>`)],
  music: ['#ff9ad6', S('#ff9ad6', `<path ${F} d="M9 4.5 20 2.5v13.2a3 3 0 1 1-2-2.8V6.2l-7 1.3v10.2a3 3 0 1 1-2-2.8z"/>`)],
  beatTick: ['#ffd24a', S('#ffd24a', `<path ${F} d="M12 3 7 21h10z" opacity=".95"/><path d="M12 8l5 -3" stroke="#1c1548" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="15" r="1.6" fill="#1c1548"/>`)],
  pump: ['#9dff6d', S('#9dff6d', `<rect x="3" y="12" width="4" height="9" rx="1.6" ${F}/><rect x="10" y="7" width="4" height="14" rx="1.6" ${F}/><rect x="17" y="3" width="4" height="18" rx="1.6" ${F}/>`)],
  vibrate: ['#c9a8ff', S('#c9a8ff', `<rect x="8" y="3" width="8" height="18" rx="2.4" ${F}/><path ${K} d="M4.5 8.5v7M19.5 8.5v7M2 10.5v3M22 10.5v3"/>`)],
  reduceMotion: ['#7ae8f8', S('#7ae8f8', `<path ${K} d="M3 8c3-3 5 3 9 0s6 3 9 0M3 16c3-3 5 3 9 0s6 3 9 0"/>`)],
  reduceFlash: ['#ffe27a', S('#ffe27a', `<path ${F} d="M13.5 2 5 13.5h5.5L9.5 22 19 9.5h-5.8z"/>`)],
  lowQuality: ['#9dff6d', S('#9dff6d', `<circle cx="12" cy="12.5" r="9" ${F} opacity=".25"/><path ${K} d="M12 12.5 16.5 8"/><circle cx="12" cy="12.5" r="2" ${F}/><path ${K} d="M5.2 18.5a9 9 0 1 1 13.6 0"/>`)],
  bigNumbers: ['#ffb454', S('#ffb454', `<path ${F} d="M2 19 7 6h2l5 13h-2.4l-1.1-3.2H5.5L4.4 19zm4-5.2h3.6L7.8 8.7zM15 19v-1.7h2.2V9.4L15 10.2V8.5l3.4-1.5H20v10.3h2V19z"/>`)],
  colorBlind: ['#ff7ac0', S('#ff7ac0', `<path ${F} d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.2.2-2.4 1.6-2.4H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.5" fill="#1c1548"/><circle cx="10.5" cy="7" r="1.5" fill="#1c1548"/><circle cx="15.5" cy="7.5" r="1.5" fill="#1c1548"/>`)],
  highContrast: ['#e8e8ff', S('#e8e8ff', `<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2.2"/><path ${F} d="M12 3.4a8.6 8.6 0 0 1 0 17.2z"/>`)],
  fullscreen: ['#7ae8f8', S('#7ae8f8', `<path ${K} d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`)],
  bigTap: ['#6ee7b7', S('#6ee7b7', `<rect x="3" y="3" width="18" height="18" rx="4.6" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="7.4" y="7.4" width="9.2" height="9.2" rx="2.4" ${F}/>`)],
  controlStyle: ['#f9a8d4', S('#f9a8d4', `<path ${K} d="M9 11V5.5a1.6 1.6 0 0 1 3.2 0V11M12.2 10.2a1.6 1.6 0 0 1 3.2 0V12a1.6 1.6 0 0 1 3.1 0v3.5c0 3.2-2.2 5.5-5.2 5.5h-1.2c-2 0-3.3-.9-4.4-2.4L5 14.2a1.5 1.5 0 0 1 2.300-1.800L9 14"/>`)],
  slider: ['#7ae8f8', S('#7ae8f8', `<path ${K} d="M3 12h18M6.5 8.5 3 12l3.5 3.5M17.5 8.5 21 12l-3.5 3.5"/>`)],
  leftHand: ['#ffb454', S('#ffb454', `<path ${F} d="M14 21c-3.4 0-6-2.4-6-6V9a1.4 1.4 0 0 1 2.8 0v3h.5V5a1.4 1.4 0 0 1 2.8 0v6h.5V6a1.4 1.4 0 0 1 2.8 0v6h.4V8.5a1.4 1.4 0 0 1 2.8 0V15c0 3.4-2.8 6-6.6 6z"/>`)],
  thumbZone: ['#9dff6d', S('#9dff6d', `<rect x="3" y="2.5" width="18" height="19" rx="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path ${F} d="M3.2 15h17.6v3.3a3 3 0 0 1-3 3H6.2a3 3 0 0 1-3-3z"/>`)],
  aimAssist: ['#ffd24a', S('#ffd24a', `<circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.2" ${F}/><path ${K} d="M12 1.8v4M12 18.2v4M1.8 12h4M18.2 12h4"/>`)],
  pauseGuard: ['#ff9ad6', S('#ff9ad6', `<rect x="5" y="3.5" width="5" height="17" rx="1.8" ${F}/><rect x="14" y="3.5" width="5" height="17" rx="1.8" ${F}/>`)],
  volume: ['#7ae8f8', S('#7ae8f8', `<path ${F} d="M3 9.5h3.6L11 5.6v12.8l-4.4-3.9H3z"/><path ${K} d="M14.5 9a4.4 4.4 0 0 1 0 6"/>`)],
};

export function paintSettingIcons(root = globalThis.document) {
  if (!root) return 0;
  let n = 0;
  for (const btn of root.querySelectorAll('#settings .tgl[data-k]')) {
    const ti = btn.querySelector('.ti'), d = SET_ICON[btn.dataset.k]; if (!ti || !d || ti.dataset.s8) continue;
    ti.innerHTML = d[1]; ti.dataset.s8 = '1'; ti.style.setProperty('--tc', d[0]); ti.classList.add('ti8'); n++;
  }
  const vol = root.querySelector('#settings .volrow:not(.tsrow) .ti');
  if (vol && !vol.dataset.s8) { vol.innerHTML = SET_ICON.volume[1]; vol.dataset.s8 = '1'; vol.style.setProperty('--tc', SET_ICON.volume[0]); vol.classList.add('ti8'); n++; }
  return n;
}

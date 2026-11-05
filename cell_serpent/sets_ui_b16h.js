// Cell Serpent batch 16 (h): small DOM helpers for the pair bonus moment. Pure sets logic lives in sets_b16h.js.
import { setText } from './sets_b16h.js';

export const petStars = save => { const o = {}; for (const id of Object.keys((save && save.pets) || {})) o[id] = save.pets[id].star || 0; return o; };

// "BARNYARD BACKING BAND!" banner when a star purchase wakes (or grows) a pair
export function petWakeBanner(woke, audio, reduce) {
  if (!woke || !woke.length || typeof document === 'undefined') return null;
  const s = woke[0];
  const b = document.createElement('div'); b.className = 'petwake'; b.setAttribute('role', 'status');
  b.innerHTML = `${s.name.toUpperCase()}!<small>Pair bonus: ${setText(s.stat, s.val)}</small>`;
  document.body.appendChild(b);
  try { if (audio) audio.play('levelup'); } catch (e) { /* no audio */ }
  setTimeout(() => b.remove(), reduce ? 2600 : 2300);
  return b;
}

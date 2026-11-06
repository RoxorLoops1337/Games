// Cell Serpent round 9: skill and pet tile names for screen readers, mastery medals on skill tiles,
// petting a friend right on its tile, and the "everyone is home" celebration. Presentation only.
import { PETS, SKILL_MAX_LV, PET_MAX_STAR, PET_JOY_MAX } from './sim.js';
import { PET_REACT } from './skillpets8.js';
import { joyLabel } from './presets_ux.js';
import { petLabel } from './pet_names.js';

const RANKS = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Star'];
const plain = s => String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&');

// the tile becomes a real button for keyboard and screen readers: Enter or Space opens it, the name says everything the eyes see
export function tileA11y(t, label, onOpen) {
  t.setAttribute('role', 'button'); t.tabIndex = 0; t.setAttribute('aria-label', plain(label));
  t.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === t) { e.preventDefault(); if (onOpen) onOpen(); } });
  return t;
}
export function skillTileLabel(w, k, o) {
  const st = k.lv > 0 ? 'level ' + k.lv + ' of ' + SKILL_MAX_LV + (k.lv >= SKILL_MAX_LV ? ', maxed' : '') : (o.gated ? 'locked, clear stage ' + w.stage : 'not unlocked');
  return [w.name, st, k.lv > 0 && o.rank != null ? RANKS[o.rank] + ' mastery' : '', o.eq ? 'in your loadout' : '', o.ready ? 'upgrade ready' : '', 'Opens details'].filter(Boolean).join(', ');
}
export function petTileLabel(save, p, k, eq, ready) {
  const owned = k.star > 0, j = k.joy || 0;
  return [petLabel(save, p), owned ? k.star + ' of ' + PET_MAX_STAR + ' stars' : 'not met yet', owned ? joyLabel(j) + ' ' + j + ' percent' : '', owned ? (eq ? 'walking with you' : 'at home') : '', ready ? 'ready for ' + (owned ? 'more stars' : 'welcome home') : '', 'Opens details'].filter(Boolean).join(', ');
}

// mastery: a medal on the icon (Bronze and up) and a tile class the CSS turns into a metallic edge
export function masteryMark(t, rank) {
  if (!t || rank < 1) return;
  t.classList.add('mr' + rank); t.dataset.rank = rank;
  const ic = t.querySelector('.ic'); if (!ic || ic.querySelector('.mdl')) return;
  ic.insertAdjacentHTML('beforeend', `<b class="mdl m${rank}" aria-hidden="true" title="${RANKS[rank]} mastery">${rank >= 5 ? '★' : rank}</b>`);
}

// petting: tap the face on its tile for a word, hearts and the pet's own sound (the rest of the tile still opens the sheet)
export function petOnTile(t, id, audio, reduce) {
  const ic = t.querySelector('.ic'), r = PET_REACT[id]; if (!ic || !r) return;
  ic.classList.add('petme');
  ic.addEventListener('click', e => {
    e.stopPropagation();
    ic.classList.remove('pet-bounce'); void ic.offsetWidth; if (!reduce) ic.classList.add('pet-bounce');
    ic.querySelectorAll('.bnh,.bnw').forEach(n => n.remove());
    const w = document.createElement('span'); w.className = 'bnw'; w.textContent = r.word; ic.appendChild(w); setTimeout(() => w.remove(), 1200);
    if (!reduce) for (let i = 0; i < 3; i++) { const h = document.createElement('span'); h.className = 'bnh'; h.textContent = '♥'; h.style.cssText = `left:${22 + i * 22}%;animation-delay:${i * 0.08}s`; ic.appendChild(h); setTimeout(() => h.remove(), 1200); }
    try { audio.play(r.snd); } catch (err) { /* ignore */ }
  });
}

// the next bond step for the sheet ("12 more to Content")
export function bondNext(j) {
  const steps = [[33, 'Content'], [66, 'Happy'], [PET_JOY_MAX, 'Overjoyed']];
  const s = steps.find(x => j < x[0]); return s ? { at: s[0], name: s[1], left: s[0] - j } : null;
}
export function bondNote(k) {
  const j = Math.max(0, Math.min(PET_JOY_MAX, (k && k.joy) || 0)), n = bondNext(j);
  return n ? `<small class="bondn">${n.left} more to ${n.name}. Walk together to grow close.</small>` : '<small class="bondn full">Best friends. Nothing left to prove.</small>';
}

// collection complete: a one-time shower and a toast, remembered per browser (a convenience, never save data)
export const COLL_KEY = 'cs_pcoll_done_b9';
export function collectionState(save) {
  const met = PETS.filter(p => save.pets[p.id].star > 0).length, full = PETS.filter(p => save.pets[p.id].star >= PET_MAX_STAR).length;
  return { met, full, total: PETS.length, home: met === PETS.length, perfect: full === PETS.length };
}
export function collectionCelebrate(save, el, fx) {
  const st = collectionState(save); if (!el) return st;
  el.classList.toggle('done', st.home); el.classList.toggle('perfect', st.perfect);
  if (!st.home) return st;
  let seen = ''; try { seen = localStorage.getItem(COLL_KEY) || ''; } catch (e) { /* ignore */ }
  const tier = st.perfect ? 'perfect' : 'home';
  if (seen === 'perfect' || seen === tier) return st;
  try { localStorage.setItem(COLL_KEY, tier); } catch (e) { /* ignore */ }
  if (fx) fx(tier, el);
  return st;
}

// round 11: a heart badge on the pet tile whose colour and fill follow the joy tier (Shy, Curious, Content, Happy, Overjoyed)
export const joyTierOf = j => j >= PET_JOY_MAX ? 4 : j >= 66 ? 3 : j >= 33 ? 2 : j > 0 ? 1 : 0;
export function joyBadgeHTML(j) {
  const t = joyTierOf(j);
  return `<b class="jbdg jt${t}" aria-hidden="true" title="${joyLabel(j)}">${t === 0 ? '♡' : '♥'}${t >= 3 ? '<em>' + (t === 4 ? '★' : '+') + '</em>' : ''}</b>`;
}
export function joyBadge(t, j) {
  const ic = t && t.querySelector('.ic'); if (!ic || ic.querySelector('.jbdg')) return;
  ic.insertAdjacentHTML('beforeend', joyBadgeHTML(j));
}

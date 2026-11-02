// 02-animal-art (round 5): the duo on the title and result screens wears the outfit hat on both heads, and on a
// win the duo hops and cheers with the equipped pets next to them. Pure DOM overlays, no canvas, no per-frame work.
import { OUTFITS } from './sim.js';
import { iconURL as hatIcon } from './icons.js';
const HEADS = [{ x: 26, y: -10, w: 27 }, { x: 71, y: -9, w: 25 }], EYES = [{ x: 28.5, y: 23, w: 24 }, { x: 68, y: 24, w: 21 }];

// wrap an <img> once so overlays can be placed in percentages of the picture
function wrapOf(im) {
  const par = im.parentNode;
  if (par && par.classList.contains('dwrap')) return par;
  const w = document.createElement('span'); w.className = 'dwrap';
  par.insertBefore(w, im); w.appendChild(im);
  return w;
}
export function hatPlacements(outfit) { return outfit ? (outfit.id === 'sun' ? EYES : HEADS) : []; }

// kit: the art kit (pet sprites), hatURL(id): data url of the hat icon, mood: 'win' | 'idle' | 'lose'
export function dressDuo(im, { outfit, hatURL = hatIcon, pets, kit, mood = 'idle', joy }) {
  if (!im || !im.parentNode) return null;
  const w = wrapOf(im);
  if (!w.dataset.tap) { w.dataset.tap = '1'; w.addEventListener('pointerdown', () => tapCheer(w)); }
  for (const el of [...w.querySelectorAll('.dhat,.dpet,.dheart')]) el.remove();
  w.dataset.mood = mood;
  const u = outfit && hatURL ? hatURL('hat_' + outfit.id) : '';
  if (u) hatPlacements(outfit).forEach((h, i) => { const e = document.createElement('img'); e.className = 'dhat'; e.alt = ''; e.src = u; e.style.cssText = `left:${h.x}%;top:${h.y}%;width:${h.w}%;--d:${i * 0.18}s`; w.appendChild(e); });
  if (mood === 'win' && kit) {
    (pets || []).slice(0, 2).forEach((id, i) => {
      const spr = kit.SPR.pet(id, 3); if (!spr || !spr.c || !spr.c.toDataURL) return;
      const e = document.createElement('img'); e.className = 'dpet ' + (i ? 'r' : 'l') + ' dp-' + id; e.alt = ''; e.src = spr.c.toDataURL(); e.style.setProperty('--d', i * 0.2 + 's'); w.appendChild(e);
      for (let h = 0; h < joyHearts(joy && joy[id]); h++) { const hh = document.createElement('i'); hh.className = 'dheart ' + (i ? 'r' : 'l'); hh.textContent = '\u2665'; hh.style.cssText = `--d:${h * 0.45 + i * 0.2}s;--x:${(h - 1) * 9}px`; w.appendChild(hh); }   // joy hearts float off a happy pet
    });
  }
  return w;
}
// how many hearts a pet sends up on the result screen: none while shy, 1 content, 2 happy, 3 overjoyed
export const joyHearts = j => j >= 100 ? 3 : j >= 66 ? 2 : j >= 33 ? 1 : 0;
export const wornOutfit = save => OUTFITS.find(o => o.id === (save.outfits && save.outfits.worn)) || null;

// tapping the duo makes them hop and sends a few notes flying
const NOTES = ['\u266A', '\u266B', '\u2665'], COLS = ['#6fe3ff', '#ff7eb6', '#ffe14a', '#9dff6d'];
function tapCheer(w) {
  if (w.dataset.mood === 'lose') return;
  w.classList.remove('tap'); void w.offsetWidth; w.classList.add('tap');
  clearTimeout(w._t); w._t = setTimeout(() => w.classList.remove('tap'), 650);
  for (let i = 0; i < 5; i++) {
    const n = document.createElement('i'); n.className = 'dnote'; n.textContent = NOTES[i % 3];
    n.style.cssText = `left:${20 + Math.random() * 60}%;top:${10 + Math.random() * 20}%;color:${COLS[i % 4]};--dx:${(Math.random() - 0.5) * 80}px;--r:${(Math.random() - 0.5) * 50}deg;animation-delay:${i * 0.05}s`;
    w.appendChild(n); setTimeout(() => n.remove(), 1000);
  }
}

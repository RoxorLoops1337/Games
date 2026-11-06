// Cell Serpent round 8: fit tags on the loadout row, per-species pet reactions, the mastery rank ladder,
// the pet collection strip and the hatch light rays. Presentation only; the rules stay in sim.js.
import { PETS, SKILL_MILES } from './sim.js';
import { recFor, nextSkin } from './build_rec.js';
import { SPECIES } from './art_draw.js';

// a small tick on every equipped skill that suits the next stage's species (the Skills tab row also says FIT)
export function fitTags(row, save, wide) {
  if (!row || !save || !save.loadout) return;
  const skin = nextSkin(save), rec = recFor(skin).ids, sp = SPECIES[skin], col = sp ? sp.base : '#9dff6d', nm = sp ? sp.name : skin;
  row.style.setProperty('--fc', col);
  const slots = row.querySelectorAll('.slot');
  let n = 0;
  for (let i = 0; i < slots.length; i++) {
    const id = save.loadout[i]; if (!id || !rec.includes(id)) continue;
    n++; slots[i].classList.add('fit');
    slots[i].insertAdjacentHTML('beforeend', `<u class="fitag${wide ? ' w' : ''}" aria-hidden="true">${wide ? 'FIT' : '✓'}</u>`);
    slots[i].setAttribute('aria-label', slots[i].getAttribute('aria-label') || (id + ', good against ' + nm));
    slots[i].title = (slots[i].title ? slots[i].title + '. ' : '') + 'Good against ' + nm;
  }
  return n;
}

// what each little friend does when you pet it on the sheet: a word, a move and a sound
export const PET_REACT = {
  kitten: { word: 'Mrrow!', move: 'pounce', snd: 'meow' },
  puppy: { word: 'Woof!', move: 'wag', snd: 'bark' },
  piglet: { word: 'Snuf snuf', move: 'snuffle', snd: 'oink' },
  lamb: { word: 'Baa~', move: 'fluff', snd: 'baa' },
  hamster: { word: 'Zoom!', move: 'zoom', snd: 'squeak' },
  turtle: { word: 'Hmm...', move: 'nod', snd: 'boop' },
};
export function petReact(strip, id, audio, reduce) {
  const r = PET_REACT[id]; if (!strip || !r) return false;
  const pet = strip.querySelector('.wpet'); if (!pet) return false;
  pet.classList.remove('rx-pounce', 'rx-wag', 'rx-snuffle', 'rx-fluff', 'rx-zoom', 'rx-nod'); void pet.offsetWidth;
  if (!reduce) pet.classList.add('rx-' + r.move);
  strip.querySelectorAll('.rxw').forEach(n => n.remove());
  const w = document.createElement('span'); w.className = 'rxw'; w.textContent = r.word; strip.appendChild(w); setTimeout(() => w.remove(), 1300);
  if (!reduce) for (let i = 0; i < 3; i++) { const h = document.createElement('span'); h.className = 'rxh'; h.textContent = '♥'; h.style.cssText = `left:${40 + i * 6}%;animation-delay:${i * 0.09}s`; strip.appendChild(h); setTimeout(() => h.remove(), 1300); }
  try { audio.play(r.snd); } catch (e) { /* ignore */ }
  return true;
}

// six medals from Rookie to Star: the ones earned glow, the next one shows how far away it is
const RANKS = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Star'];
export function rankLadderHTML(rk) {
  const items = RANKS.map((n, i) => `<span class="rkm ${i < rk.rank ? 'on' : i === rk.rank ? 'now' : ''}"><span class="rkd">${i === 0 ? '' : i}</span><span class="rkn">${n}</span></span>`).join('');
  const left = rk.next ? rk.next - rk.val : 0, nx = RANKS[Math.min(5, rk.rank + 1)];
  const pct = rk.next ? Math.min(100, Math.round(rk.val / rk.next * 100)) : 100;
  return `<div class="dsrk" style="--p:${pct}%"><div class="rkrow">${items}</div><small>${rk.next ? left + ' damage to ' + nx : 'Star rank, all medals earned'}</small></div>`;
}
export const RANK_STEPS = SKILL_MILES.length;

// how many friends have been met, with a paw for each
export function collectionHTML(save) {
  const met = PETS.filter(p => save.pets[p.id].star > 0).length, full = PETS.filter(p => save.pets[p.id].star >= 5).length;
  const paws = PETS.map(p => `<i class="${save.pets[p.id].star >= 5 ? 'max' : save.pets[p.id].star > 0 ? 'on' : ''}">\u{1F43E}</i>`).join('');
  return `<div class="pcoll" role="status" aria-label="${met} of ${PETS.length} friends met"><span class="paws">${paws}</span><b>${met} / ${PETS.length} friends</b><small>${full === PETS.length ? 'Full house: every star shining' : full ? full + ' with full stars' : met === PETS.length ? 'Everyone is home' : 'Hatch eggs to meet more'}</small></div>`;
}

// light rays and a flash behind a hatched pet: rarity colour, stronger for rarer friends
export function hatchRays(parent, color, tier, reduce) {
  if (reduce) return;
  const r = document.createElement('div'); r.className = 'hrays t' + tier; r.style.setProperty('--hc', color);
  r.innerHTML = '<i class="hflash"></i><i class="hspin"></i>';
  parent.appendChild(r); setTimeout(() => r.remove(), 3200);
}

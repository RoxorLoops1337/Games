// Round 9 sticker book (agent 10): a page of stickers on the Stats tab. Some show what to do, the secret ones only show a "?".
// Pure rules (STICKERS, stickerState) plus a small renderer. Seen stickers live in their own localStorage key, the save is untouched.
import { KEEPSAKES, keepMax, levelInfo } from './sim.js';
import { hasSticker } from './title_b8.js';

const KEY = 'cell_serpent_stk9';
const stars3 = s => Object.values(s.stars || {}).filter(v => v >= 3).length;
const ownAll = (s, set) => KEEPSAKES.filter(k => k.set === set).every(k => s.keeps[k.id].lv > 0);
// ok(save, ctx) decides the unlock; secret ones hide their name and hint until then
export const STICKERS = [
  { id: 'gig', icon: '🎤', name: 'First Gig', hint: 'Play your first run', col: '#ff7ab8', ok: s => s.runs >= 1 },
  { id: 'three', icon: '🥁', name: 'Stage Three Survivor', hint: 'Clear stage 3', col: '#ffb36b', ok: s => s.cleared >= 3 },
  { id: 'ten', icon: '🎶', name: 'Ten Stages Deep', hint: 'Clear 10 stages', col: '#7be0a0', ok: s => s.cleared >= 10 },
  { id: 'half', icon: '🏆', name: 'Half Way Home', hint: 'Clear 25 stages', col: '#ffd84d', ok: s => s.cleared >= 25 },
  { id: 'trio', icon: '⭐', name: 'Triple Star', hint: 'Earn 3 stars on 5 stages', col: '#ffd84d', ok: s => stars3(s) >= 5 },
  { id: 'pet', icon: '🐥', name: 'Fluffy Friend', hint: 'Hatch your first pet', col: '#9bd8ff', ok: s => Object.values(s.pets).some(p => p.star > 0) },
  { id: 'fit', icon: '👒', name: 'Fresh Fit', hint: 'Own an outfit', col: '#ff9de0', ok: s => Object.keys(s.outfits.owned).length > 0 },
  { id: 'lv10', icon: '🎧', name: 'Level Ten', hint: 'Reach level 10', col: '#b06cff', ok: s => levelInfo(s.xp).lv >= 10 },
  { id: 'milk', icon: '🥛', name: 'Oat Milk Moustache', hint: 'Find the Oat Milk Carton', col: '#f4f0e0', ok: s => s.keeps.milk.lv > 0 },
  { id: 'snack', icon: '🥕', name: 'Snack Table Set', hint: 'Complete the Snack Table set', col: '#7be0a0', ok: s => ownAll(s, 'snack') },
  { id: 'pop', icon: '💥', name: 'Pop Star', hint: 'Pop 2000 cells', col: '#ff6a6a', ok: s => s.kills >= 2000 },
  { id: 'tune', icon: '🎵', name: 'Snake Tune', hint: 'Poke the title snake', secret: true, col: '#ffd84d', ok: (s, x) => !!x.tune },
  { id: 'hot', icon: '🌶️', name: 'Spicy Mode', hint: 'Clear a stage on hard', secret: true, col: '#ff6a3a', ok: s => s.hardCleared >= 1 },
  { id: 'shine', icon: '✨', name: 'Polished', hint: 'Max out a keepsake', secret: true, col: '#4fd8f0', ok: s => KEEPSAKES.some(k => s.keeps[k.id].lv >= keepMax(k)) },
  { id: 'pig', icon: '🐷', name: 'Piggy Bank', hint: 'Hold 10000 beats at once', secret: true, col: '#ff9db0', ok: s => s.beats >= 10000 },
];
export const stickerState = (s, ctx = {}) => STICKERS.map(t => ({ ...t, got: !!t.ok(s, ctx) }));

const rdSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { return new Set(); } };
const wrSeen = set => { try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch (e) { /* ignore */ } };

// Draws the book into `host` (replaces its content). `click` plays the tap sound.
export function renderStickerBook(host, s, click) {
  const list = stickerState(s, { tune: hasSticker() }), seen = rdSeen(), have = list.filter(t => t.got).length;
  host.className = 'stkbook';
  host.innerHTML = `<div class="sec"><span style="background:#e0457a">Sticker Book ${have}/${list.length}</span></div><div class="stkgrid"></div><div class="stkcap" role="status" aria-live="polite">Tap a sticker</div>`;
  const grid = host.querySelector('.stkgrid'), cap = host.querySelector('.stkcap');
  let fresh = 0;
  for (const t of list) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.id = t.id;
    const isNew = t.got && !seen.has(t.id);
    b.className = 'stk' + (t.got ? ' got' : t.secret ? ' secret' : ' locked') + (isNew ? ' new' : '');
    b.style.setProperty('--sc', t.col);
    b.setAttribute('aria-label', t.got ? 'Sticker: ' + t.name : t.secret ? 'Secret sticker, not found yet' : 'Locked sticker: ' + t.hint);
    b.innerHTML = `<span class="stkface">${t.got || !t.secret ? `<i class="stkic">${t.icon}</i>` : '<i class="stkq">?</i>'}</span>${isNew ? '<em>NEW</em>' : ''}`;
    b.onclick = () => { if (click) click(); cap.innerHTML = t.got ? `<b>${t.name}</b> ${t.hint}` : t.secret ? '<b>Secret sticker</b> keep exploring' : `<b>${t.name}</b> ${t.hint}`; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); };
    if (isNew) { b.style.animationDelay = (fresh++ * 0.12) + 's'; seen.add(t.id); }
    grid.appendChild(b);
  }
  if (fresh) { wrSeen(seen); cap.innerHTML = `<b>${fresh} new sticker${fresh > 1 ? 's' : ''}!</b> Tap to look`; }
  return { have, total: list.length, fresh };
}

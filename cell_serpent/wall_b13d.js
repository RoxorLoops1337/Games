// Gold Wall (batch 13, late game): a pure cosmetic Beats sink plus long-term career goals. No plaque or goal adds power,
// so no stage gets easier. save.wall = { plaques: { id: 1 } } (sanitizeSave keeps only known ids).
// Plaques hang on a wall in the Stats tab and the highest one owned becomes the account title.
import { META, MAX_STAGE } from './sim.js';
import { PLAT_STATS, PLAT_MAX } from './plat_b12d.js';

export const PLAQUES = [
  { id: 'kit', name: 'Kitten Disc', icon: '\u{1F431}', from: 10, price: 20000, tint: '#c98a5a' },
  { id: 'pup', name: 'Puppy Disc', icon: '\u{1F436}', from: 15, price: 45000, tint: '#d6b27a' },
  { id: 'chk', name: 'Chick Disc', icon: '\u{1F425}', from: 20, price: 90000, tint: '#ffd24a' },
  { id: 'cow', name: 'Cow Disc', icon: '\u{1F42E}', from: 25, price: 170000, tint: '#dfe6ee' },
  { id: 'pig', name: 'Piglet Disc', icon: '\u{1F437}', from: 30, price: 300000, tint: '#ffb3c7' },
  { id: 'bun', name: 'Bunny Disc', icon: '\u{1F430}', from: 35, price: 500000, tint: '#bfe8ff' },
  { id: 'duo', name: 'Duo Disc', icon: '\u{1F3A4}', from: 40, price: 800000, tint: '#d9b8ff' },
  { id: 'dia', name: 'Diamond Disc', icon: '\u{1F48E}', from: 45, price: 1300000, tint: '#7fe3ff' },
];
export const PLAQUE = Object.fromEntries(PLAQUES.map(p => [p.id, p]));
export const wallDefault = () => ({ plaques: {} });
export function wallSanitize(raw) {
  const w = wallDefault();
  if (raw && typeof raw === 'object' && raw.plaques && typeof raw.plaques === 'object') for (const p of PLAQUES) if (raw.plaques[p.id]) w.plaques[p.id] = 1;
  return w;
}
export const wallOpen = save => (save.cleared || 0) >= PLAQUES[0].from;
export const plaqueOwned = (save, id) => !!(save.wall && save.wall.plaques[id]);
// plaques are bought in order: the next one is the first not owned
export const plaqueNext = save => PLAQUES.find(p => !plaqueOwned(save, p.id)) || null;
export function plaqueReady(save, id) {
  const p = PLAQUE[id], n = plaqueNext(save);
  return !!p && !!save.wall && n === p && (save.cleared || 0) >= p.from && save.beats >= p.price;
}
export function buyPlaque(save, id) {
  if (!plaqueReady(save, id)) return false;
  save.beats -= PLAQUE[id].price; save.wall.plaques[id] = 1; return true;
}
export const wallTotal = () => PLAQUES.reduce((a, p) => a + p.price, 0);
export function wallTitle(save) {
  let t = null; for (const p of PLAQUES) if (plaqueOwned(save, p.id)) t = p;
  return t ? t.name.replace(' Disc', '') + ' Star' : '';
}

// Long-term career goals, read straight from the save (no new counters). Each is { id, name, val, max, frac, done }.
export function careerGoals(save) {
  const sum = o => Object.values(o || {}).reduce((a, x) => a + x, 0);
  const goals = [
    { id: 'stages', name: 'Clear every stage', val: save.cleared || 0, max: MAX_STAGE },
    { id: 'stars', name: 'Earn every star', val: sum(save.stars), max: MAX_STAGE * 3 },
    { id: 'stats', name: 'Max every stat', val: META.reduce((a, d) => a + Math.min(d.max, (save.meta && save.meta[d.id]) || 0), 0), max: META.reduce((a, d) => a + d.max, 0) },
    { id: 'recs', name: 'Gold Records', val: sum(save.plat), max: PLAT_STATS.length * PLAT_MAX },
    { id: 'wall', name: 'Fill the Gold Wall', val: save.wall ? Object.keys(save.wall.plaques).length : 0, max: PLAQUES.length },
  ];
  for (const g of goals) { g.frac = g.max ? Math.min(1, g.val / g.max) : 0; g.done = g.val >= g.max; }
  return goals;
}

// The Stats card: plaque shelf, next plaque button, career bars. Returns null until stage 10 is cleared.
export function wallCard(save, onBuy) {
  if (!wallOpen(save) || !save.wall) return null;
  const box = document.createElement('div'); box.className = 'wallb13d';
  const title = wallTitle(save), nx = plaqueNext(save);
  let h = '<div class="wl-h">Gold Wall' + (title ? '<span class="wl-t">' + title + '</span>' : '') + '</div><div class="wl-row">';
  for (const p of PLAQUES) {
    const own = plaqueOwned(save, p.id);
    h += '<div class="wl-p' + (own ? ' own' : '') + '" data-id="' + p.id + '" style="--t:' + p.tint + '" title="' + p.name + '"><span>' + (own ? p.icon : '\u{1F512}') + '</span></div>';
  }
  h += '</div>';
  box.innerHTML = h;
  if (nx) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'wl-buy'; b.dataset.id = nx.id;
    const locked = (save.cleared || 0) < nx.from, ready = plaqueReady(save, nx.id);
    b.disabled = !ready;
    b.textContent = locked ? nx.name + ': clear stage ' + nx.from : nx.name + ' ' + nx.price;
    b.onclick = () => { if (buyPlaque(save, nx.id) && onBuy) onBuy(nx.id); };
    box.appendChild(b);
  }
  const cg = document.createElement('div'); cg.className = 'wl-goals';
  cg.innerHTML = careerGoals(save).map(g => '<div class="wl-g' + (g.done ? ' done' : '') + '"><span class="wl-n">' + g.name + '</span><span class="wl-v">' + g.val + '/' + g.max + '</span><i style="width:' + Math.round(g.frac * 100) + '%"></i></div>').join('');
  box.appendChild(cg);
  return box;
}

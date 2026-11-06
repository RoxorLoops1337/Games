// Gold Records (batch 12, balance): a late game Beats sink. Once a stat is at its max level (and you have cleared stage 25)
// each Gold Record rank on it costs Beats on a steep ladder and adds a small bonus on top of the max level (PLAT_STEP of a level).
// Pure functions on the save (save.plat = { atk, crt, vit, for }: ranks), plus one tiny UI row. No renames, sanitizeSave clamps it.
import { META } from './sim.js';

export const PLAT_STATS = ['atk', 'crt', 'vit', 'for'];   // not Tempo (its cooldown is already at the floor) and not Encore (one level)
export const PLAT_MAX = 10;                // ranks per stat
export const PLAT_STEP = 0.4;              // one rank is worth this much of a stat level
export const PLAT_FROM = 25;               // stages cleared before the ladder opens
export const PLAT_BASE = 15000, PLAT_GROW = 1.32;
export const platCost = rank => Math.round(PLAT_BASE * Math.pow(PLAT_GROW, rank));
export const platTotal = () => { let n = 0; for (let r = 0; r < PLAT_MAX; r++) n += platCost(r); return n * PLAT_STATS.length; };
export const platDefault = () => Object.fromEntries(PLAT_STATS.map(k => [k, 0]));
export const platOpen = save => (save.cleared || 0) >= PLAT_FROM;
export function platReady(save, id) {
  const d = META.find(m => m.id === id), r = save.plat && save.plat[id];
  return !!d && PLAT_STATS.includes(id) && platOpen(save) && (save.meta[id] || 0) >= d.max && r < PLAT_MAX && save.beats >= platCost(r);
}
export function buyPlat(save, id) {
  if (!platReady(save, id)) return false;
  save.beats -= platCost(save.plat[id]); save.plat[id]++; return true;
}
// the stat levels a run starts with: the saved levels plus the Gold Record bonus (a new object, the save is untouched)
export function platMeta(save) {
  const out = Object.assign({}, save.meta);
  if (save.plat) for (const id of PLAT_STATS) if (save.plat[id] > 0) out[id] = (out[id] || 0) + PLAT_STEP * save.plat[id];
  return out;
}

// One small card for the Stats list: a row of up to four buttons, hidden until the ladder opens.
export function platCard(save, onBuy) {
  if (!platOpen(save) || !save.plat) return null;
  const box = document.createElement('div'); box.className = 'platb12d';
  box.style.cssText = 'margin:8px 12px;padding:8px;border-radius:12px;background:#4a3200;color:#fff;font:600 13px system-ui,sans-serif';
  box.innerHTML = '<div style="margin-bottom:6px">Gold Records</div>';
  const row = document.createElement('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
  for (const id of PLAT_STATS) {
    const d = META.find(m => m.id === id), r = save.plat[id], maxed = r >= PLAT_MAX, locked = (save.meta[id] || 0) < d.max;
    const b = document.createElement('button'); b.type = 'button'; b.dataset.id = id;
    b.style.cssText = 'min-width:calc(50% - 4px);min-height:44px;padding:4px 8px;border-radius:10px;border:0;background:' + (locked || maxed ? '#2d2d2d' : platReady(save, id) ? '#ffd24a' : '#6b5420') + ';color:' + (!locked && !maxed && platReady(save, id) ? '#2a1a00' : '#fff') + ';font:700 13px system-ui,sans-serif';
    b.textContent = d.name + ' ' + r + '/' + PLAT_MAX + (maxed ? '' : locked ? ' (max it first)' : ' ' + platCost(r));
    b.onclick = () => { if (buyPlat(save, id) && onBuy) onBuy(id); };
    row.appendChild(b);
  }
  box.appendChild(row); return box;
}

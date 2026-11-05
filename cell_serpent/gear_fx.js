// Cell Serpent round 5: gear and chest touches.
// 1) keepsake detail: a level pip row, a stat delta chip for the next level, and a set strip with the members you own.
// 2) hold-to-charge chests: press and hold a chest and it rattles with a glow in the colour of the best thing inside.
//    The drop is rolled with a seeded random on press, so the glow tells the truth and the open uses the same roll.

// small deterministic random (mulberry32), so a forecast and the real open agree
import { ENCORE_LV, encoreLine } from './sets_b16h.js';
export function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const newSeed = () => (Math.random() * 4294967296) >>> 0;

// glow colours by best rarity 0..3
export const FORECAST_COL = ['#bcd4ff', '#4fd8f0', '#b06cff', '#ffb04d'];

// Press and hold on a chest tile. `forecast()` returns { tier } for the roll that the next open will use.
// It only paints the charge; the normal click still opens the chest (a held press just opens faster, see wasHeld).
export function armChest(tileEl, forecast, calm) {
  const ch = () => tileEl.querySelector('.chest3');
  let timer = 0, t0 = 0;
  const stop = () => { clearTimeout(timer); const c = ch(); if (c) c.classList.remove('hold', 'hold2'); };
  tileEl.addEventListener('pointerdown', () => {
    const c = ch(); if (!c || tileEl.querySelector('button:disabled') || calm()) return;
    const f = forecast(); c.style.setProperty('--fc', f.color || FORECAST_COL[f.tier] || FORECAST_COL[0]); c.dataset.ft = f.tier;
    c.classList.remove('hold2'); c.classList.add('hold'); t0 = performance.now();
    timer = setTimeout(() => { c.classList.add('hold2'); try { if (navigator.vibrate) navigator.vibrate(f.tier >= 2 ? [18, 30, 24] : 14); } catch (e) { /* no haptics */ } }, 650);
  });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) tileEl.addEventListener(t, () => { if (t0) tileEl.dataset.held = performance.now() - t0 > 650 ? '1' : ''; t0 = 0; stop(); });
}
export const wasHeld = el => { const t = el && el.closest && el.closest('.tile, .featban'); const h = !!(t && t.dataset.held); if (t) t.dataset.held = ''; return h; };

// Round 9: the upgrade ceremony. After a keepsake levels up (or is collected) the detail card flashes, a ring and a few
// sparks fly out of the big icon and a banner says what happened. `calm` skips the motion but keeps the banner.
export const ceremonyText = (lv, max, first) => (first ? 'COLLECTED!' : lv >= max ? 'MAX LEVEL!' : 'LEVEL ' + lv + '!');
export function keepCeremony(detail, lv, max, first, calm) {
  if (!detail) return null;
  const ban = document.createElement('div'); ban.className = 'kcer' + (lv >= max ? ' max' : '') + (first ? ' first' : ''); ban.textContent = ceremonyText(lv, max, first);
  detail.appendChild(ban);
  if (!calm) {
    detail.classList.remove('cer'); void detail.offsetWidth; detail.classList.add('cer');
    const big = detail.querySelector('.kbig');
    if (big) big.insertAdjacentHTML('afterend', '<i class="kring"></i>' + Array.from({ length: 8 }, (_, i) => `<i class="kspk" style="--a:${i * 45}deg"></i>`).join(''));
  }
  setTimeout(() => { ban.remove(); detail.querySelectorAll('.kring,.kspk').forEach(e => e.remove()); detail.classList.remove('cer'); }, 1700);
  return ban;
}

// ---- keepsake detail pieces
export function keepDetailHTML(k, a, max, STAT_TEXT, KEEPSAKES, KEEP_SETS, owned) {
  const lv = a.lv, pips = Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
  const cur = STAT_TEXT[k.stat](k.per * Math.max(1, lv));
  let delta;
  if (lv && lv < max) delta = `<span class="kdelta">&#9650; ${STAT_TEXT[k.stat](k.per)}<small>next level</small></span>`;
  else if (!lv) delta = `<span class="kdelta first">&#9733; first level<small>${STAT_TEXT[k.stat](k.per)}</small></span>`;
  else delta = `<span class="kdelta maxed">MAX<small>fully polished</small></span>`;
  let setHTML = '';
  if (k.set) {
    const set = KEEP_SETS.find(x => x.id === k.set), mem = KEEPSAKES.filter(q => q.set === set.id), have = mem.filter(q => owned[q.id] > 0).length, full = have === mem.length;
    setHTML = `<div class="kstrip${full ? ' full' : ''}"><div class="ksn"><b>${set.name}</b><span>${have}/${mem.length}</span></div><div class="ksm">` +
      mem.map(q => `<span class="${owned[q.id] > 0 ? 'own' : ''}${q.id === k.id ? ' me' : ''}" title="${q.name}">${q.icon}</span>`).join('') +
      `</div><div class="ksb">${full ? 'ACTIVE: ' : 'Collect all: '}${STAT_TEXT[set.stat](set.val)}</div><div class="setenc${mem.every(q => owned[q.id] >= ENCORE_LV) ? ' on' : ''}">${encoreLine(set.val, set.stat, Math.min(...mem.map(q => owned[q.id] || 0)))}</div></div>`;
  }
  return `<div class="kpips" aria-hidden="true">${pips}</div><div class="kst">${cur}</div>${delta}${setHTML}`;
}

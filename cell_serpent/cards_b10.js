// 07-cards batch 10: chains between offered cards, a locked card that survives a reroll, a deal odds chip, a pick burst.
// Display helpers only: the simulation and its random numbers are untouched (the kept card is swapped in after reroll()).
import { CHAINS, luckNow, oddsAtLeast, pct } from './cards_ui.js';
import { RARITIES } from './sim.js';

// Offered cards that link with each other (or with an upgrade the band already has).
// Returns [{a, b, name}] with indexes into choices (b = -1 when the partner is already owned).
export function offeredLinks(g, choices) {
  const ups = (g && g.ups) || {}, out = [];
  for (const [a, b, , nm] of CHAINS) {
    const ia = choices.findIndex(c => c.id === a), ib = choices.findIndex(c => c.id === b);
    if (ia >= 0 && ib >= 0) out.push({ a: ia, b: ib, name: nm });
    else if ((ia >= 0 && ups[b] > 0) || (ib >= 0 && ups[a] > 0)) out.push({ a: ia >= 0 ? ia : ib, b: -1, name: nm });
  }
  return out;
}
// Marks both linked cards with a pill naming the chain and the other card's number.
export function markLinks(cards, links) {
  try {
    let n = 0;
    for (const L of links) {
      if (L.b < 0) continue;
      const ea = cards.children[L.a], eb = cards.children[L.b];
      if (!ea || !eb) continue;
      for (const [e, o] of [[ea, L.b], [eb, L.a]]) { e.classList.add('linked'); e.insertAdjacentHTML('beforeend', `<span class="lnk" aria-hidden="true">&#9889; ${L.name} &middot; ${o + 1}</span>`); }
      n++;
    }
    cards.classList.toggle('haslinks', n > 0);
    return n;
  } catch (e) { return 0; }
}

// One card can be locked: a reroll deals new cards and keeps it in its slot.
export const lockState = { i: -1, keep: false };
export function lockHTML(i) { return `<span class="lockb${lockState.i === i ? ' on' : ''}" data-i="${i}" aria-hidden="true"><svg viewBox="0 0 16 16" width="15" height="15"><path d="M4 7V5a4 4 0 0 1 8 0v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="2.5" y="7" width="11" height="8" rx="2" fill="currentColor"/></svg></span>`; }
export function toggleLock(cards, i) {
  lockState.i = lockState.i === i ? -1 : i;
  if (cards) for (const e of cards.children) { const l = e.querySelector('.lockb'); if (!l) continue; const on = +l.dataset.i === lockState.i; l.classList.toggle('on', on); e.classList.toggle('kept', on); }
  return lockState.i;
}
// After reroll(): put the locked card back in its slot (a duplicate of it elsewhere takes the card it replaced). True when it kept one.
export function keepLocked(choices, prev) {
  const i = lockState.i;
  if (!(i >= 0) || !prev || !prev[i] || !choices || !choices[i]) { lockState.i = -1; return false; }
  const kept = prev[i], dealt = choices[i], dup = choices.findIndex((c, k) => k !== i && c.id === kept.id);
  choices[i] = kept; if (dup >= 0) choices[dup] = dealt;
  lockState.keep = true; return true;
}

// Chance (0..1) that a deal of n cards holds at least one card of tier t or better at the luck the dealer used.
export function dealChance(luck, t, n) { if (t < 1) return 1; const p = oddsAtLeast(luck)[Math.min(3, t) - 1]; return 1 - Math.pow(1 - p, Math.max(1, n)); }
export function dealChipHTML(g, choices) {
  if (!choices || !choices.length) return '';
  const top = Math.max(0, ...choices.map(c => c.rarity || 0));
  if (top < 1) return '<div class="dealchip">REROLL: nothing special</div>';
  const p = dealChance(luckNow(g), top, choices.length), rare = p < 0.12;
  return `<div class="dealchip${rare ? ' lucky' : ''}" style="--rc:${RARITIES[top].color}"><i></i>${rare ? 'LUCKY ' : 'REROLL: '}${RARITIES[top].name.toUpperCase()} <b>${pct(p)}</b></div>`;
}

// Selection burst: sparks and a ring fly out from the picked card's icon (a layer on the body, removed after 700ms), the icon squashes first.
export function pickBurst(el, col, rn) {
  try {
    if (!el || typeof document === 'undefined') return 0;
    const ic = el.querySelector('.ic') || el, r = ic.getBoundingClientRect(), n = 8 + 2 * Math.min(5, rn | 0);
    const box = document.createElement('div'); box.className = 'pbur'; box.setAttribute('aria-hidden', 'true');
    box.style.cssText = `left:${Math.round(r.left + r.width / 2)}px;top:${Math.round(r.top + r.height / 2)}px;--pc:${col}`;
    let h = '<u></u>';
    for (let k = 0; k < n; k++) { const a = k / n * 6.2832 + (k % 2) * 0.2, d = 46 + (k % 3) * 16; h += `<s style="--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d)}px"></s>`; }
    box.innerHTML = h; document.body.appendChild(box); setTimeout(() => box.remove(), 700);
    ic.classList.remove('ant'); void ic.offsetWidth; ic.classList.add('ant');
    return n;
  } catch (e) { return 0; }
}

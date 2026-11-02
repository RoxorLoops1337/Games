// 07-cards round 2: odds hint, refresh pips and the build summary strip for the pick screen.
// Pure display helpers: nothing here touches the simulation or its random numbers.
import { COUNTERS } from './card_icons.js';
import { rarityWeights, RARITIES, WEAPONS, LUCK_MAX, CAPSULE_UPS, PASSIVES, uv } from './sim.js';

const CAP_GLYPH = { aspd: '⚡', notes: '🎵', burst: '🔁', cdmg: '🔊', power: '🎤', haste: '⏱️', crit: '🎯', vital: '❤️', guard: '🎧', speed: '👟' };
const lk = g => Math.min(1, Math.max(0.1, (g.stage || 1) / 10));

// Same luck the dealer uses for the next roll (read only copy of the formula in sim.js rollChoices).
export function luckNow(g) { return (g.level - 1) * lk(g); }

// Chance that a non-guaranteed card is at least tier t (1 rare, 2 epic, 3 legendary).
export function oddsAtLeast(luck) {
  const w = rarityWeights(luck), tot = w.reduce((a, b) => a + b, 0);
  return [1, 2, 3].map(t => w.slice(t).reduce((a, b) => a + b, 0) / tot);
}
export const pct = p => (p >= 0.995 ? '99' : p < 0.01 ? '<1' : String(Math.round(p * 100))) + '%';

// round 7: the meter remembers its last fill, so it fills up from there and chips whose odds grew light up.
let lastFill = -1, lastOdds = null;
export function luckHTML(g) {
  const luck = luckNow(g), o = oddsAtLeast(luck), nx = oddsAtLeast(luck + lk(g));
  const fill = Math.round(Math.min(1, luck / LUCK_MAX) * 100), up = Math.round((nx[0] - o[0]) * 100);
  const from = lastFill >= 0 && lastFill < fill ? lastFill : fill, grew = from < fill;
  const chip = (i, t) => `<span class="lk${lastOdds && o[i] > lastOdds[i] + 0.004 ? ' up' : ''}" style="--rc:${RARITIES[i + 1].color}"><i></i>${t}<b>${pct(o[i])}</b></span>`;
  const html = `<div class="lkbar"><span class="lkl">LUCK</span><span class="lkt"><span class="lkf${grew ? ' grow' : ''}" style="width:${fill}%;--from:${from}%"><b class="lkw"><i></i></b><s></s></span><u style="left:25%"></u><u style="left:50%"></u><u style="left:75%"></u></span>${up > 0 ? `<em>+${up}% next</em>` : ''}</div><div class="lkrow">${chip(0, 'Rare+')}${chip(1, 'Epic+')}${chip(2, 'Legend+')}</div>`;
  lastFill = fill; lastOdds = o;
  return html;
}

// Reroll feel: the pip that was just spent breaks (class "used") on the next draw of the pips.
let rrJust = false;
export function markReroll() { rrJust = true; }

export function refreshPips(g, total = 4) {
  const used = rrJust ? g.rerolls : -1; rrJust = false;
  return Array.from({ length: total }, (_, k) => `<i class="${k < g.rerolls ? 'on' : k === used ? 'used' : ''}"></i>`).join('');
}

// Build strip: capsule and passive upgrades with their pick counts, then skills with their level.
export function buildHTML(g, iconFn) {
  const out = [];
  for (const id of Object.keys(g.ups || {})) { const n = g.ups[id]; if (n > 0 && CAP_GLYPH[id]) out.push(`<span class="bi" data-id="${id}"><span class="g">${CAP_GLYPH[id]}</span><b>${n}</b></span>`); }
  for (const w of WEAPONS) { const l = g.weap && g.weap[w.id] ? g.weap[w.id].lv : 0; if (l > 0) out.push(`<span class="bi sk" data-id="${w.id}"><span class="g">${iconFn(w.id)}</span><b>${l}</b></span>`); }
  return out.length ? `<span class="bl">YOUR BAND</span>${out.join('')}<span class="bmore">i</span>` : '';
}

// ---- round 4: stat-delta text for passive cards, band totals sheet with synergy chain
const PNAME = { power: 'Skill damage', haste: 'Skill recharge', crit: 'Crit chance', vital: 'Snake speed', enc: 'Encore charge', dbeat: 'On-beat damage', speed: 'Pierce' };
function totalText(id, v) {
  if (id === 'notes' || id === 'burst') return String(1 + v);
  if (id === 'speed') return v === 0 ? 'none' : '+' + v + ' cell' + (v === 1 ? '' : 's');
  if (id === 'vital') return v < 2 ? '0%' : '-' + Math.round(v / 4) + '%';
  return '+' + v + '%';
}
// "Skill damage: +9% → +17%" for a passive card (same shape the capsule cards already use)
export function passiveStat(g, c) {
  if (c.kind !== 'passive' || !(c.gain > 0)) return '';
  if (c.id === 'guard') return 'Push back: ' + c.gain * 6 + ' px now';
  if (COUNTERS[c.id]) { const cur = uv(g, c.id), nx = Math.min(100, cur + c.gain), left = v => (100 - v <= 0 ? 'none' : (100 - v) + '%'); return `${COUNTERS[c.id].shield}: ${left(cur)} → ${left(nx)}`; }
  const cur = uv(g, c.id), nm = PNAME[c.id] || c.name;
  return `${nm}: ${totalText(c.id, cur)} → ${totalText(c.id, cur + c.gain)}`;
}
const NAMES = Object.fromEntries([...CAPSULE_UPS, ...PASSIVES].map(u => [u.id, u.name]));
export const CHAINS = [['notes', 'burst', 'Every note gets an echo', 'Echo Chamber'], ['crit', 'cdmg', 'Crits hit much harder', 'Perfect Pitch'], ['aspd', 'notes', 'More notes, faster', 'Fast Fingers'], ['aspd', 'burst', 'Echoes come quicker', 'Quick Echo'], ['power', 'haste', 'Hit harder, recharge faster', 'Full Power Jam'], ['dbeat', 'aspd', 'Land more notes on the beat', 'Tight Groove']];
export function bandSheetHTML(g, iconFn) {
  const rows = [], ups = g.ups || {};
  for (const id of ['aspd', 'notes', 'burst', 'cdmg', 'power', 'haste', 'crit', 'vital', 'enc', 'dbeat', 'speed']) {
    if (!(ups[id] > 0) || !NAMES[id]) continue;
    rows.push(`<div class="bsr"><span class="bsn">${CAP_GLYPH[id] || '🎶'} ${NAMES[id]}</span><i>x${ups[id]}</i><b>${totalText(id, uv(g, id))}</b></div>`);
  }
  for (const w of WEAPONS) { const l = g.weap && g.weap[w.id] ? g.weap[w.id].lv : 0; if (l > 0) rows.push(`<div class="bsr sk"><span class="bsn"><span class="bsg">${iconFn(w.id)}</span> ${w.name}</span><i>Lv</i><b>${l}</b></div>`); }
  const chain = CHAINS.map(([a, b, t, nm]) => {
    const A = ups[a] > 0, B = ups[b] > 0;
    if (!A && !B) return '';
    return `<div class="bch ${A && B ? 'on' : ''}"><span>${NAMES[a]}</span><em>${A && B ? '+' : '?'}</em><span>${NAMES[b]}</span><u>${A && B ? nm + ': ' + t : 'Find ' + (A ? NAMES[b] : NAMES[a])}</u></div>`;
  }).filter(Boolean).sort((x, y) => (y.includes('bch on') ? 1 : 0) - (x.includes('bch on') ? 1 : 0)).slice(0, 4).join('');
  return `<div class="bsh"><div class="bst">YOUR BAND</div>${rows.join('') || '<div class="bsr"><span class="bsn">Nothing yet</span></div>'}${chain ? `<div class="bst">SYNERGY CHAIN</div>${chain}` : ''}<div class="bsx">tap to close</div></div>`;
}

// Reveal drama: a colour burst and a stamped rarity word when the best card on offer is Epic or better.
const STAMP = ['', '', 'EPIC!', 'LEGENDARY!', 'MYTHIC!!', 'GODLIKE!!!'];
export function revealHTML(top) {
  if (top < 2) return '';
  return `<div class="rvl t${top}" style="--rc:${RARITIES[top].color}" aria-hidden="true"><span class="rvb"></span><span class="rvw">${STAMP[top]}</span></div>`;
}

// ---- round 5: ghost bar on the delta row, level ring on skill cards, two-line skip label
// Fractions (0..1) of how full the stat is now and how much of the bar this card adds (the ghost part).
export function cardMeter(g, c) {
  let cur = 0, gain = 0, max = 0;
  if (c.kind === 'weapon') { cur = c.lvl || 0; gain = c.gain || 0; max = c.max || 0; }
  else if (c.u && c.u.cap > 0) { cur = uv(g, c.id); gain = c.gain || 0; max = c.u.cap; }
  if (!(max > 0)) return null;
  const a = Math.min(1, Math.max(0, cur / max)), b = Math.min(1 - a, Math.max(0, gain / max));
  return { a, b, full: a + b >= 0.999 };
}
const pc = x => (x * 100).toFixed(1);
export function ghostBarHTML(m) {
  if (!m) return '';
  return `<span class="gb${m.full ? ' full' : ''}" aria-hidden="true"><i style="width:${pc(m.a)}%"></i><u style="left:${pc(m.a)}%;width:${pc(m.b)}%"></u></span>`;
}
// Ring around a skill icon: solid arc for the current level, pulsing ghost arc for the level(s) this card adds.
export function levelRingHTML(m) {
  if (!m) return '';
  return `<span class="lvring${m.full ? ' full' : ''}" style="--a:${(m.a * 360).toFixed(0)}deg;--b:${((m.a + m.b) * 360).toFixed(0)}deg" aria-hidden="true"></span>`;
}
export function skipHTML(bonus) { return `<span class="sk1">SKIP</span><span class="sk2">+${bonus} BEATS</span>`; }

// ---- round 6: per-rarity foil art behind the icon, chips that tick when you pick
// A backdrop plate for every icon (spotlight for Common/Rare, holo, sunburst, lattice and prism foils for Epic and up).
export function foilHTML(rn) { return `<span class="foil f${rn | 0}" aria-hidden="true"></span>`; }

// Called when the flown icon lands on the build strip: the matching chip counts up (or appears) and pops.
// id: upgrade or skill id, add: how much the count / level grows.
export function tickBand(strip, id, add, iconFn, col) {
  try {
    if (!strip || !id) return;
    let el = strip.querySelector(`.bi[data-id="${id}"]`);
    const isW = WEAPONS.some(w => w.id === id);
    if (!el) {
      if (!isW && !CAP_GLYPH[id]) return;
      el = document.createElement('span'); el.className = 'bi fresh' + (isW ? ' sk' : ''); el.dataset.id = id;
      el.innerHTML = `<span class="g">${isW ? iconFn(id) : CAP_GLYPH[id]}</span><b>0</b>`;
      const more = strip.querySelector('.bmore');
      if (more) strip.insertBefore(el, more);
      else { strip.insertAdjacentHTML('afterbegin', '<span class="bl">YOUR BAND</span>'); strip.appendChild(el); }
    }
    const b = el.querySelector('b'); b.textContent = String((parseInt(b.textContent, 10) || 0) + (add > 0 ? add : 1));
    el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
    if (col) el.style.setProperty('--pc', col);
    const pl = document.createElement('s'); pl.className = 'plus'; pl.textContent = '+' + (add > 0 ? add : 1); pl.setAttribute('aria-hidden', 'true'); el.appendChild(pl); setTimeout(() => pl.remove(), 900);
  } catch (e) { /* cosmetic only */ }
}

// ---- round 7: card-wide foil for Epic and up, band strip pulse when a synergy chain completes
// A sheen layer that covers the whole card (behind the text), with a drifting holographic band. Common and Rare get none.
export function cardFoilHTML(rn) { return rn >= 2 ? `<span class="cfoil cf${rn | 0}" aria-hidden="true"></span>` : ''; }

// Pairs that make a synergy chain (same list as the band sheet shows).
// Called after a pick landed on the strip: if the picked (new) upgrade just met its partner for the first time, the "i" pulses and names the chain.
export function chainPulse(strip, g, id, isNew) {
  try {
    if (!strip || !g || !g.ups || !isNew) return false;
    const hit = CHAINS.find(([a, b]) => (a === id && g.ups[b] > 0) || (b === id && g.ups[a] > 0));
    if (!hit) return false;
    const i = strip.querySelector('.bmore'); if (!i) return false;
    i.classList.remove('chain'); void i.offsetWidth; i.classList.add('chain');
    strip.querySelectorAll('.bi.link').forEach(e => e.classList.remove('link'));
    for (const k of hit.slice(0, 2)) { const e = strip.querySelector(`.bi[data-id="${k}"]`); if (e) { e.classList.remove('link'); void e.offsetWidth; e.classList.add('link'); } }
    chainToast(i, hit[3], hit[2]);
    return true;
  } catch (e) { return false; }
}
// round 8: the chain gets a name. A small pill rises from the "i" button (on the body, so it outlives the card screen closing).
let toastEl = null, toastT = 0;
function chainToast(anchor, name, text) {
  if (toastEl) toastEl.remove();
  const r = anchor.getBoundingClientRect(), hw = Math.min(150, innerWidth * 0.46), el = document.createElement('div');
  el.className = 'chtoast'; el.setAttribute('role', 'status');
  el.style.cssText = `left:${Math.round(Math.min(innerWidth - hw, Math.max(hw, r.left + r.width / 2)))}px;top:${Math.round(r.top - 8)}px`;
  el.innerHTML = `<b>SYNERGY</b><span>${name}</span><u>${text}</u>`;
  document.body.appendChild(el); toastEl = el; clearTimeout(toastT);
  toastT = setTimeout(() => { el.remove(); if (toastEl === el) toastEl = null; }, 2200);
}

// ---- batch 9: partner glow on the band strip, "better roll" mark after a reroll
// Ids you already own that would link up with one of the offered cards (the strip chips glow, so the synergy is visible at a glance).
export function partnerIds(g, choices) {
  const ups = (g && g.ups) || {}, out = new Set();
  for (const c of choices || []) for (const [a, b] of CHAINS) { if (c.id === a && ups[b] > 0) out.add(b); else if (c.id === b && ups[a] > 0) out.add(a); }
  return out;
}
export function markPartners(strip, ids) {
  try { if (!strip) return 0; let n = 0; strip.querySelectorAll('.bi').forEach(e => { const on = ids.has(e.dataset.id); e.classList.toggle('par', on); if (on) n++; }); return n; } catch (e) { return 0; }
}
// After a reroll: every card whose rarity beats the best card of the previous deal gets a rising mark.
export function betterRoll(cards, prevTop) {
  try {
    if (!cards || !(prevTop >= 0)) return 0; let n = 0;
    for (const el of cards.children) { const m = /\br(\d)\b/.exec(el.className), r = m ? +m[1] : 0; if (r > prevTop && r >= 1) { el.classList.add('better'); el.insertAdjacentHTML('beforeend', '<span class="bet" aria-hidden="true">&#9650; BETTER</span>'); n++; } }
    return n;
  } catch (e) { return 0; }
}

// 35-t cards layout: the upgrade UI sits in the upper part of the screen (the lower part is where the thumb steers) and a pointer tap
// only picks a card once the guard is ready AND the press and the release land on the same card.
// Keyboard (1, 2, 3, Enter, Space) and screen reader activations carry no pointer (click detail 0), so the guard never delays them.
export const PICK_GUARD_MS = 450;
export const HUD_UNITS = 170;   // game units under the top of the stage taken by the HUD plates and chips (hud.js lays them out in about the first 150)
// CSS px from the top of the screen to the bottom of the HUD plates, from the renderer layout { cw, s, oy } (canvas px)
export function hudBottomPx(L, innerW) {
  if (!L || !(L.s > 0) || !(L.cw > 0) || !(innerW > 0)) return 170;
  return Math.round((L.oy + HUD_UNITS * L.s) / (L.cw / innerW));
}
// pure: should this click pick card i? ptr is a pointer click (mouse or touch), not a keyboard or screen reader activation
export function guardAllows(st, i, ptr, now) {
  if (!ptr) return true;
  if (now - st.at < PICK_GUARD_MS) return false;
  return st.down === i && !st.moved;
}
// wires press tracking once on the cards wrapper; st = { at, down, moved }
export function trackPress(wrap, st) {
  const idxOf = (x, y) => { const el = document.elementFromPoint(x, y), b = el && el.closest ? el.closest('.card') : null; return b && b.parentNode === wrap ? [...wrap.children].indexOf(b) : -1; };
  wrap.addEventListener('pointerdown', e => { st.down = idxOf(e.clientX, e.clientY); st.moved = false; });
  wrap.addEventListener('pointerup', e => { if (st.down >= 0 && idxOf(e.clientX, e.clientY) !== st.down) st.moved = true; });
  wrap.addEventListener('pointercancel', () => { st.moved = true; });
}
// arms the guard for a freshly dealt row: the shimmer bar fills over the guard time, then the cards are ready
export function armCards(wrap, st, now) {
  st.at = now; st.down = -1; st.moved = false;
  const cs = [...wrap.children]; for (const c of cs) c.classList.add('arm');
  setTimeout(() => { for (const c of cs) c.classList.remove('arm'); }, PICK_GUARD_MS);
}

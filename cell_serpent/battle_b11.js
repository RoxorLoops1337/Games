// Battle tab, round 11 (agent 08): named worlds on the stage strip, the one-tap power gap shortcut, claim counts on the
// side chips and the stage list overview sheet. Pure helpers first, then the small DOM part.
import { worldStrip } from './battle_ui.js';
import { wirePreview } from './stagemap_b13f.js';
import { wireTour } from './tour_b16f.js';

// ---- five named worlds of ten stages (names fit the show: warm-up to encore)
export const ACTS = [
  { name: 'Warm-Up', ic: '🐣', from: 1, to: 10 },
  { name: 'Snack Bar', ic: '🥕', from: 11, to: 20 },
  { name: 'Backstage', ic: '🎶', from: 21, to: 30 },
  { name: 'Main Stage', ic: '🎸', from: 31, to: 40 },
  { name: 'Encore', ic: '👑', from: 41, to: 50 },
];
export const actOf = n => Math.max(0, Math.min(ACTS.length - 1, Math.floor((Math.max(1, n) - 1) / 10)));
export const actDone = (i, cleared) => Math.max(0, Math.min(10, cleared - ACTS[i].from + 1));

// where a tap on world i goes: its next stage to clear, else its first, else locked (with the stage that opens it)
export function actTarget(i, cleared, reach) {
  const a = ACTS[i]; if (!a) return null;
  if (a.from > reach) return { locked: true, need: a.from - 4 };
  const nxt = cleared + 1;
  if (nxt >= a.from && nxt <= a.to) return { stage: nxt };
  return { stage: a.from };
}
// the strip: one button per world (icon, name, n/10) over its ten ticks
export function actStripHTML(cleared, sel, max, isBoss, reach) {
  const ticks = worldStrip(cleared, sel, max, isBoss), parts = ticks.split('</i>'), here = actOf(sel);
  return ACTS.map((a, i) => {
    const d = actDone(i, cleared), lock = a.from > reach, row = parts.slice(a.from - 1, a.to).map(x => x + '</i>').join('');
    return `<button type="button" class="wact${i === here ? ' on' : ''}${lock ? ' lock' : ''}${d >= 10 ? ' full' : ''}" data-act="${i}" aria-label="${a.name}, stages ${a.from} to ${a.to}, ${d} of 10 cleared${lock ? ', locked' : ''}">` +
      `<span class="wh"><em>${lock ? '🔒' : a.ic}</em><u>${d}/10</u></span><b class="wn">${a.name}</b><span class="wt">${row}</span></button>`;
  }).join('');
}

// ---- the power gap shortcut: which tab has something ready that adds the most power
export const GAIN = { Pets: 80, Stats: 60, Skills: 45, Gear: 35 };
export const GAP_IC = { Pets: '🐾', Stats: '♥', Skills: '✦', Gear: '🎒' };
// counts: Map or object tab -> how many are ready. Returns { tab, n, gain } or null
export function gapFix(gap, counts) {
  if (!(gap > 0) || !counts) return null;
  const get = t => (counts instanceof Map ? counts.get(t) : counts[t]) | 0;
  let best = null;
  for (const t of Object.keys(GAIN)) { const n = get(t); if (n > 0 && (!best || GAIN[t] > GAIN[best.tab])) best = { tab: t, n, gain: GAIN[t] * n }; }
  return best;
}
export const gapFixHTML = (fix, gap) => fix ? `<span class="gfi">${GAP_IC[fix.tab]}</span><span class="gft"><b>Close the gap</b><small>${fix.tab}: ${fix.n} ready, up to +${Math.min(fix.gain, gap)} PWR</small></span><span class="gfg">GO</span>` : '';

// ---- claim counts on the side chips: true shows the old "!", a number shows the count
export const alertLabel = a => (typeof a === 'number' ? (a > 9 ? '9+' : String(a)) : '!');
export const hasAlert = a => (typeof a === 'number' ? a > 0 : !!a);

// ---- the stage list overview: every stage in its world, with stars, crowns, rings and locks
export function overviewHTML(save, max, isBoss, kindOf, reach, sel) {
  const stars = save.stars || {}, cleared = save.cleared || 0, hc = save.hardCleared || 0;
  return ACTS.map((a, i) => {
    let got = 0; const cells = [];
    for (let n = a.from; n <= Math.min(a.to, max); n++) {
      got += stars[n] || 0;
      const lock = n > reach, done = n <= cleared, nxt = n === cleared + 1, k = isBoss(n) ? '👑' : kindOf(n) === 'ring' ? '🌀' : kindOf(n) === 'double' ? '🐍' : '', s = stars[n] || 0;
      cells.push(`<button type="button" class="ovc${done ? ' done' : ''}${nxt ? ' nxt' : ''}${lock ? ' lock' : ''}${n === sel ? ' sel' : ''}${done && s >= 3 ? ' perfect' : ''}" data-n="${n}" ${lock ? 'disabled' : ''} aria-label="Stage ${n}${isBoss(n) ? ', boss' : ''}${done ? ', ' + s + ' stars' : lock ? ', locked' : nxt ? ', next' : ''}">` +
        `<b>${lock ? '🔒' : n}</b>${lock ? '' : `<span class="ovs">${[1, 2, 3].map(q => q <= s ? '<u>★</u>' : '★').join('')}</span>`}${k ? `<i class="ovk">${k}</i>` : ''}${done && n > hc ? '<i class="ovh">H</i>' : ''}</button>`);
    }
    return `<section class="ovw${a.from > reach ? ' lock' : ''}"><h3><em>${a.ic}</em>${a.name}<span>${actDone(i, cleared)}/10 · ★ ${got}/30</span></h3><div class="ovg">${cells.join('')}</div></section>`;
  }).join('');
}
// opens the sheet; pick(n) is called with the chosen stage
export function openOverview(c) {
  const { save, max, isBoss, kindOf, reach, sel, pick, audio } = c, s = save();
  document.querySelectorAll('.ovbg').forEach(n => n.remove());
  const bg = document.createElement('div'), sh = document.createElement('div'); bg.className = 'dsheet-bg ovbg'; sh.className = 'dsheet ovsheet'; bg.appendChild(sh);
  sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-label', 'All stages');
  const close = () => { bg.classList.remove('on'); setTimeout(() => bg.remove(), 180); };
  sh.innerHTML = '<button class="dsx" type="button" aria-label="Close">✕</button><div class="ovhd"><b>ALL STAGES</b><small>Tap a stage to preview it, GO to jump</small></div><div class="ovbody">' + overviewHTML(s, max, isBoss, kindOf, reach(), sel()) + '</div>';
  sh.querySelector('.dsx').onclick = () => { audio.play('click'); close(); };
  bg.addEventListener('click', e => { if (e.target === bg) { audio.play('click'); close(); } });
  if (!wirePreview(sh, c, close)) sh.querySelector('.ovbody').addEventListener('click', e => { const b = e.target.closest('.ovc'); if (!b || b.disabled) return; close(); pick(+b.dataset.n); });   // b13f: with the preview card a tap selects, GO jumps
  if (c.tourOn && c.tourOn() && c.info) wireTour(sh, c);   // b16f: the STAGES / TOUR switch
  document.body.appendChild(bg); requestAnimationFrame(() => { bg.classList.add('on'); const cur = sh.querySelector('.ovc.sel'); if (cur) cur.scrollIntoView({ block: 'center' }); });
}

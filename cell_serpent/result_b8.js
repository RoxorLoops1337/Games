// Batch 8 (agent 11): a Ribbons counter in the hub header that the result's ribbon chip flies into, and the result's
// "best moment" chip (the finishing blow or the longest kill chain), recorded from the run's events.
// DOM and pure helpers only; nothing here runs per frame.

// a small pink bow, flat, same rounded look as the other glyphs
export const BOW = '<svg class="bow8" viewBox="0 0 24 24" width="1.1em" height="1.1em" aria-hidden="true" focusable="false"><path d="M12 12 5.2 18.6c-.9.9-2.2.2-2-1.1l1-5.6M12 12l6.8 6.6c.9.9 2.2.2 2-1.1l-1-5.6" fill="#ff5cb8" stroke="#a81f72" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 12C9.5 8.4 6.6 5.6 3.7 6.4c-1.4.4-1.4 2.3-.4 3.5C5.2 12 8.8 12.3 12 12ZM12 12c2.5-3.6 5.4-6.4 8.3-5.6 1.4.4 1.4 2.3.4 3.5C18.8 12 15.2 12.3 12 12Z" fill="#ff8fd0" stroke="#a81f72" stroke-width="1.2" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" fill="#ffd6ee" stroke="#a81f72" stroke-width="1.2"/></svg>';

let held = -1;   // while ribbons are flying in, the chip waits at the old total
export function ribbonValue(total) { return held >= 0 ? held : total; }
export function holdRibbons(v) { held = v; }
export function releaseRibbons() { held = -1; }

// the chip lives next to the Lv / Power line; created once
export function paintRibbonChip(total, doc = globalThis.document) {
  if (!doc) return null;
  let host = doc.getElementById('hRibChip');
  if (!host) {
    const pw = doc.getElementById('hPower'); if (!pw || !pw.parentNode) return null;
    host = doc.createElement('span'); host.id = 'hRibChip'; host.className = 'hrib8'; host.setAttribute('role', 'status');
    host.innerHTML = BOW + '<b id="hRib">0</b>'; pw.parentNode.insertBefore(host, pw.nextSibling);
  }
  const v = ribbonValue(total | 0); host.hidden = v <= 0 && held < 0;
  const b = doc.getElementById('hRib'); if (b) b.textContent = String(v);
  host.setAttribute('aria-label', v + ' ribbons');
  return host;
}

// flyers from the result's Ribbons row to the chip; onLand runs once when the first one arrives
export function flyRibbons(snapRect, n, { reduce = false, onLand, doc = globalThis.document } = {}) {
  try {
    const to = doc && doc.getElementById('hRibChip');
    if (!snapRect || !to || to.hidden) { if (onLand) onLand(); return 0; }
    const b = to.getBoundingClientRect(), a = snapRect;
    let landed = 0; const land = () => { if (landed++) return; to.classList.remove('gfx-bump8'); void to.offsetWidth; to.classList.add('gfx-bump8'); if (onLand) onLand(); };
    if (reduce || !a.width || !b.width) { land(); return 0; }
    const host = doc.createElement('div'); host.className = 'gfx-host'; doc.body.appendChild(host);
    const x0 = a.left + 24, y0 = a.top + a.height / 2, dx = b.left + 14 - x0, dy = b.top + b.height / 2 - y0, k = Math.min(5, 2 + Math.floor((n | 0) / 4));
    for (let i = 0; i < k; i++) {
      const f = doc.createElement('i'); f.className = 'gfx-fly rib8f'; f.style.left = x0 - 11 + 'px'; f.style.top = y0 - 11 + 'px'; f.innerHTML = BOW; host.appendChild(f);
      const sp = (i - (k - 1) / 2) * 30, lift = -50 - (i % 3) * 16;
      const an = f.animate([{ transform: 'translate(0,0) scale(.4) rotate(0deg)', opacity: 0 }, { transform: `translate(${sp}px,${lift}px) scale(1.25) rotate(-14deg)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${(dx * 0.7 + sp * 0.3).toFixed(1)}px,${(dy * 0.7 + lift * 0.2).toFixed(1)}px) scale(1) rotate(10deg)`, opacity: 1, offset: 0.72 }, { transform: `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(.5) rotate(0deg)`, opacity: 0.9 }],
        { duration: 640 + i * 70, delay: i * 60, easing: 'cubic-bezier(.4,.1,.5,1)', fill: 'both' });
      an.onfinish = () => { land(); f.remove(); if (!host.children.length) host.remove(); };
    }
    setTimeout(() => { host.remove(); land(); }, 1700);
    return k;
  } catch (e) { if (onLand) onLand(); return 0; }
}

// ---- best moment: recorded from the sim events (a new run is detected when the sim clock jumps back)
const M = { t: -1, chain: 0, best: 0, last: -9, fin: '', fT: -9, src: '', srcT: -9 };
export function momentReset() { M.t = -1; M.chain = 0; M.best = 0; M.last = -9; M.fin = ''; M.src = ''; M.srcT = -9; M.fT = -9; }
export function momentEvent(e, g) {
  const t = g && typeof g.t === 'number' ? g.t : 0;
  if (t < M.t - 0.5) momentReset();
  M.t = t;
  if (e.t === 'hit') { M.src = e.src || ''; M.srcT = t; return; }
  if (e.t !== 'kill') return;
  M.chain = t - M.last < 0.9 ? M.chain + 1 : 1; M.last = t; if (M.chain > M.best) M.best = M.chain;
  if (e.head) { M.fin = t - M.srcT < 0.25 && M.src ? M.src : 'capsule'; M.fT = t; }
}
// what to brag about: a long chain beats a plain finishing blow; a lost run only brags about a chain
export function bestMoment(r) {
  if (!r) return null;
  const won = !!r.won;
  if (M.best >= 5 && (!won || M.best >= 8 || !M.fin)) return { kind: 'chain', n: M.best };
  if (won && M.fin) return { kind: 'finish', src: M.fin };
  if (M.best >= 3) return { kind: 'chain', n: M.best };
  return null;
}
const FIN = { capsule: 'a song note', swab: 'the Swab', daggers: 'a Dagger', tower: 'the Tower', stick: 'the Stick', needles: 'a Needle', satellite: 'the Orbit', maw: 'the Maw', puppy: 'the Puppy', encore: 'the Encore', bubble: 'a Bubble', dragon: 'the Dragon' };
export const finishName = src => FIN[src] || 'a song note';
export function momentHTML(m, iconHTML = '') {
  if (!m) return '';
  if (m.kind === 'chain') return `<i class="mi8">${iconHTML || '🔗'}</i><span>Longest chain <b>x${m.n}</b></span>`;
  return `<i class="mi8">${iconHTML || '🎤'}</i><span>Finishing blow <b>${finishName(m.src)}</b></span>`;
}
export function showMoment(el, m, iconHTML) {
  if (!el) return;
  el.innerHTML = momentHTML(m, iconHTML); el.classList.toggle('on', !!m);
  el.classList.remove('k-chain', 'k-finish'); if (m) el.classList.add('k-' + m.kind);
}

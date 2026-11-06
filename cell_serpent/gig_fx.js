// Cell Serpent: Battle tab collect fly (agent 08, batch 5). A few reward icons pop out of a Daily Gigs row,
// arc up to the Beats or Sparkles pill and make it bump. DOM only, Web Animations API, no layout reads per frame.
const N = 5;
// pure: the curved path of one flyer as translate keyframes (dx, dy are the whole trip, i the flyer index)
export function flightFrames(dx, dy, i, n = N) {
  const spread = (i - (n - 1) / 2) * 26, lift = -46 - (i % 3) * 14;
  return [
    { transform: 'translate(0px,0px) scale(.4)', opacity: 0 },
    { transform: `translate(${spread}px,${lift}px) scale(1.15)`, opacity: 1, offset: 0.3 },
    { transform: `translate(${(dx * 0.7 + spread * 0.3).toFixed(1)}px,${(dy * 0.7 + lift * 0.2).toFixed(1)}px) scale(.95)`, opacity: 1, offset: 0.72 },
    { transform: `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(.5)`, opacity: 0.9 }
  ];
}
// a detached-safe copy of where a button was and which icon it showed (take it before the hub re-renders)
export function snap(el) { if (!el || !el.getBoundingClientRect) return null; const im = el.querySelector('img'); return { rect: el.getBoundingClientRect(), src: im ? im.getAttribute('src') : '' }; }
// fromEl: the button (or a snap of it) that was claimed. kind: 'beats' | 'sparkles'. onLand runs when the first flyer arrives.
export function collectFly(fromEl, kind, { reduce = false, onLand } = {}) {
  try {
    const pill = document.getElementById(kind === 'sparkles' ? 'hSpark' : 'hBeats');
    const to = pill && pill.closest('.cur');
    if (!fromEl || !to) { if (onLand) onLand(); return 0; }
    const sn = fromEl.rect ? fromEl : snap(fromEl), img = sn.src ? { getAttribute: () => sn.src } : null, a = sn.rect, b = to.getBoundingClientRect();
    if (!a.width || !b.width) { if (onLand) onLand(); return 0; }
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, dx = b.left + 22 - x0, dy = b.top + b.height / 2 - y0;
    const host = document.createElement('div'); host.className = 'gfx-host'; document.body.appendChild(host);
    let landed = 0;
    const land = () => { if (!landed++) { to.classList.remove('gfx-bump'); void to.offsetWidth; to.classList.add('gfx-bump'); if (onLand) onLand(); } };
    if (reduce || typeof host.animate !== 'function') { host.remove(); land(); return 0; }
    for (let i = 0; i < N; i++) {
      const f = document.createElement('i'); f.className = 'gfx-fly'; f.style.left = x0 - 11 + 'px'; f.style.top = y0 - 11 + 'px';
      if (img) f.style.backgroundImage = `url("${img.getAttribute('src')}")`; else f.textContent = kind === 'sparkles' ? '✦' : '●';
      host.appendChild(f);
      const an = f.animate(flightFrames(dx, dy, i), { duration: 620 + i * 70, delay: i * 55, easing: 'cubic-bezier(.4,.1,.5,1)', fill: 'both' });
      an.onfinish = () => { land(); f.remove(); if (!host.children.length) host.remove(); };
    }
    setTimeout(() => host.remove(), 1600);   // safety
    return N;
  } catch (e) { if (onLand) onLand(); return 0; }
}
// the H badge of a cleared stage: bright only on the stage whose Hard clear pays next, dim on the rest
export const hardLevel = (n, cleared, hardCleared) => (n > cleared || n <= (hardCleared || 0) ? 'none' : n === (hardCleared || 0) + 1 ? 'hot' : 'dim');

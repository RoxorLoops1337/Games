// Card pick flourish: the chosen card's icon lifts off, arcs down to the build strip and lands with a ring pop.
// Pure DOM (Web Animations), no per-frame work; skipped when the animation API is missing.
export function flyPick(card, strip, ms = 400) {
  try {
    const src = card && card.querySelector('.ic'), dst = strip;
    if (!src || !dst || !src.animate) return;
    const a = src.getBoundingClientRect(); let b = dst.getBoundingClientRect();
    if (!a.width) return;
    if (!b.width) b = { left: innerWidth / 2 - 30, top: innerHeight - 70, width: 60, height: 24 };   // empty strip (first pick): land at the bottom centre
    const col = getComputedStyle(card).getPropertyValue('--rc').trim() || '#ffd84d';
    const fly = document.createElement('div');
    fly.className = 'pickfly'; fly.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;--pc:${col}`;
    fly.innerHTML = src.innerHTML;
    document.body.appendChild(fly);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2), end = Math.min(0.5, 26 / a.width * 1.6);
    const an = fly.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.18}px,${dy * 0.18 - 46}px) scale(1.3) rotate(-10deg)`, opacity: 1, offset: 0.28 },
      { transform: `translate(${dx}px,${dy}px) scale(${end}) rotate(8deg)`, opacity: 0.95, offset: 1 },
    ], { duration: ms, easing: 'cubic-bezier(.5,0,.7,1)', fill: 'forwards' });
    const land = () => {
      if (!fly.isConnected) return;
      fly.remove();
      const r = document.createElement('div'); r.className = 'pickring'; r.style.cssText = `left:${b.left + b.width / 2}px;top:${b.top + b.height / 2}px;--pc:${col}`;
      document.body.appendChild(r); setTimeout(() => r.remove(), 520);
    };
    an.onfinish = land; setTimeout(land, ms + 120);
  } catch (e) { /* cosmetic only */ }
}

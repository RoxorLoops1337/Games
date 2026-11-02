// Result and revive screen effects (DOM only): star reveal, count-up chips, level bar, revive ring.
const timers = new Set();
const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
export function stopFx() { for (const t of timers) clearTimeout(t); timers.clear(); }

// Reveal stars one by one. `got` = earned stars, `onPop(i)` plays the pop sound hook.
export function revealStars(el, got, onPop, reduce) {
  const sp = el.querySelectorAll('span');
  sp.forEach((s, i) => {
    s.classList.remove('pop'); s.style.opacity = reduce ? 1 : 0.25;
    if (i >= got) return;
    later(() => { s.style.opacity = 1; s.classList.add('pop'); if (onPop) onPop(i); }, reduce ? 0 : 450 + i * 380);
  });
}

// Count every [data-to] inside `root` up from 0, staggered.
export function countUp(root, reduce, onTick) {
  const els = root.querySelectorAll('[data-to]');
  els.forEach((e, k) => {
    const to = +e.dataset.to || 0; if (reduce || to < 2) { e.textContent = to; return; }
    e.textContent = 0; const t0 = 350 + k * 140, dur = Math.min(900, 300 + to * 2);
    later(() => {
      const st = performance.now();
      const tick = () => { const f = Math.min(1, (performance.now() - st) / dur); e.textContent = Math.round(to * (1 - Math.pow(1 - f, 3))); if (f < 1) later(tick, 30); else if (onTick) onTick(); };
      tick();
    }, t0);
  });
}

// Progress bar to the next account level. a/b = levelInfo before/after.
export function levelBar(a, b, reduce) {
  const bar = document.getElementById('rLbar'), lv = document.getElementById('rLv'), tx = document.getElementById('rLtxt');
  const fr = i => Math.max(0, Math.min(1, i.cur / i.need));
  lv.textContent = a.lv; lv.classList.remove('up'); bar.style.transition = 'none'; bar.style.width = (fr(a) * 100) + '%';
  tx.textContent = (b.need - b.cur) + ' XP to level ' + (b.lv + 1);
  const go = () => {
    if (b.lv > a.lv) {
      bar.style.transition = reduce ? 'none' : 'width .5s ease-out'; bar.style.width = '100%';
      later(() => { lv.textContent = b.lv; lv.classList.add('up'); bar.style.transition = 'none'; bar.style.width = '0%'; later(() => { bar.style.transition = reduce ? 'none' : 'width .6s ease-out'; bar.style.width = (fr(b) * 100) + '%'; }, 40); }, reduce ? 0 : 560);
    } else { bar.style.transition = reduce ? 'none' : 'width .8s ease-out'; bar.style.width = (fr(b) * 100) + '%'; }
  };
  later(go, reduce ? 0 : 700);
}

// Revive countdown ring: calls onEnd() when time runs out. Returns a stop function.
export function reviveRing(secs, onEnd) {
  const arc = document.getElementById('rvArc'), num = document.getElementById('rvSec'), C = 2 * Math.PI * 52;
  arc.style.strokeDasharray = C; arc.style.transition = 'none'; arc.style.strokeDashoffset = 0;
  void arc.getBoundingClientRect();
  arc.style.transition = 'stroke-dashoffset ' + secs + 's linear'; arc.style.strokeDashoffset = C;
  const t0 = performance.now(); let alive = true;
  const tick = () => { if (!alive) return; const left = Math.max(0, secs - (performance.now() - t0) / 1000); num.textContent = Math.ceil(left); num.classList.toggle('hot', left < 4); if (left <= 0) { alive = false; onEnd(); } else later(tick, 120); };
  tick();
  return () => { alive = false; };
}

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
export function countUp(root, reduce, onTick, onStep) {
  const els = root.querySelectorAll('[data-to]');
  els.forEach((e, k) => {
    const to = +e.dataset.to || 0; if (reduce || to < 2) { e.textContent = to; return; }
    e.textContent = 0; const t0 = 350 + k * 140, dur = Math.min(900, 300 + to * 2);
    later(() => {
      const st = performance.now();
      const tick = () => { const f = Math.min(1, (performance.now() - st) / dur); e.textContent = Math.round(to * (1 - Math.pow(1 - f, 3))); if (onStep) onStep(f); if (f < 1) later(tick, 30); else if (onTick) onTick(); };
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

// Confetti burst for 3 stars: cheap CSS-animated bits, removed after the fall.
let confNode = null;
export function confetti(host, n) {
  if (confNode) confNode.remove();
  const d = document.createElement('div'); d.className = 'rpConf'; const C = ['#ffd24a', '#ff5cb8', '#39f0ff', '#9dff6d', '#fff3b0', '#b06cff'];
  let h = '';
  for (let i = 0; i < (n || 30); i++) h += `<i style="left:${(8 + Math.random() * 84).toFixed(1)}%;background:${C[i % C.length]};--dx:${(Math.random() * 120 - 60) | 0}px;--rot:${(Math.random() * 720 - 360) | 0}deg;animation-delay:${(Math.random() * 0.35).toFixed(2)}s;animation-duration:${(1.5 + Math.random() * 0.9).toFixed(2)}s"></i>`;
  d.innerHTML = h; host.appendChild(d); confNode = d; later(() => { if (confNode === d) { d.remove(); confNode = null; } }, 3000);
}

// Short cute tip after a loss, from result data. `loadout` = equipped weapon ids, `names` = id to display name.
export function lossHint(r, loadout, names) {
  if (!r || r.won || r.mode) return '';
  const pct = Math.floor((r.progress || 0) * 100), nm = id => names[id] || id;
  const spare = ['daggers', 'swab', 'tower', 'needles', 'dragon'].find(id => names[id] && !(loadout || []).includes(id));
  if (pct >= 70) return spare ? `The snake got past at ${pct}%: try the ${nm(spare)}` : `So close at ${pct}%! One more try`;
  const top = Object.entries(r.dmgBy || {}).filter(([id]) => id !== 'capsule' && names[id]).sort((a, b) => b[1] - a[1])[0];
  if (pct < 25) return 'Grab the yellow upgrade cells early';
  if (top && top[1] > 0) return `${nm(top[0])} is doing the work: level it up`;
  return spare ? `Try the ${nm(spare)} next time` : 'Slide under the glowing head';
}

// Revive countdown ring: calls onEnd() when time runs out; secs <= 0 waits forever.
// opts.holdEls pause the countdown while hovered or touched; opts.onBeat(n) fires at 3, 2, 1. Returns a stop function.
export function reviveRing(secs, onEnd, opts) {
  opts = opts || {};
  const arc = document.getElementById('rvArc'), num = document.getElementById('rvSec'), box = document.getElementById('revive'), C = 2 * Math.PI * 52;
  const inf = !(secs > 0); let left = inf ? 1 : secs, held = false, alive = true, lastB = 99, prev = performance.now(); const cleanups = [];
  arc.style.strokeDasharray = C; arc.style.transition = 'stroke-dashoffset .13s linear'; arc.style.strokeDashoffset = 0;
  num.classList.remove('hot'); box.classList.remove('hold');
  const setHold = v => { held = v; box.classList.toggle('hold', v); };
  for (const el of opts.holdEls || []) {
    const on = () => setHold(true), off = () => setHold(false);
    for (const [ev, f] of [['pointerenter', on], ['pointerdown', on], ['pointerup', off], ['pointerleave', off], ['pointercancel', off]]) { el.addEventListener(ev, f); cleanups.push(() => el.removeEventListener(ev, f)); }
  }
  const tick = () => {
    if (!alive) return; const now = performance.now(), dt = (now - prev) / 1000; prev = now;
    if (!inf && !held) left = Math.max(0, left - dt);
    num.textContent = inf ? '∞' : Math.ceil(left); num.classList.toggle('hot', !inf && left < 4);
    arc.style.strokeDashoffset = inf ? 0 : C * (1 - left / secs);
    const b = Math.ceil(left);
    if (!inf && left > 0 && left <= 3 && b < lastB) { lastB = b; if (opts.onBeat) opts.onBeat(b); }
    if (!inf && left <= 0) { alive = false; cleanups.forEach(f => f()); box.classList.remove('hold'); onEnd(); } else later(tick, 100);
  };
  tick();
  return () => { alive = false; cleanups.forEach(f => f()); box.classList.remove('hold'); };
}

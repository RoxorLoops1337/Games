// UI motion and button feel (agent 19). Screen transitions, count-up currencies with a coin fly,
// press ripple + sparkle + haptic buzz. Only transform and opacity are animated, and everything
// switches off with Reduce Motion (settings flag or the OS preference).

export const easeOut = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
// the value shown t (0..1) of the way from a to b, always a whole number, exact at both ends
export const countAt = (a, b, t) => t >= 1 ? b : t <= 0 ? a : Math.round(a + (b - a) * easeOut(t));
// how many coins to fly for a gain: a few for small, capped for big (keeps phones smooth)
export const coinCount = d => d <= 0 ? 0 : Math.min(8, 2 + Math.floor(Math.log10(d + 1) * 2));

const PRESS = '.btn,.arrow,.chip,.tabs button,.sidebtn,.dbtn,.plus';

export function createMotion({ $, buzz, getReduced }) {
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(getReduced && getReduced()) || !!(mq && mq.matches);
  let lx = innerWidth / 2, ly = innerHeight * 0.6, lt = -1e9;
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : f => setTimeout(() => f(Date.now()), 16);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function applyReduced() { document.documentElement.classList.toggle('rm', reduced()); }

  // screens: the leaving one fades out (class out), the entering one animates in via CSS (.scr.on)
  function screen(id) {
    for (const s of document.querySelectorAll('.scr')) {
      if (s.id === id) { clearTimeout(s._mo); s.classList.remove('out'); s.classList.add('on'); }
      else if (s.classList.contains('on')) {
        s.classList.remove('on');
        if (!reduced()) { s.classList.add('out'); clearTimeout(s._mo); s._mo = setTimeout(() => s.classList.remove('out'), 170); }
      }
    }
  }

  // count-up numbers
  const live = new Set();
  function num(el, v) {
    if (!el) return;
    v = Math.round(v);
    const prev = el._v;
    el._v = v;
    if (prev === undefined || prev === v || reduced() || !el.getClientRects().length) { live.delete(el); el.textContent = v; return; }
    el._anim = now(); el._from = (el._shown !== undefined && live.has(el)) ? el._shown : prev; el._to = v; live.add(el);
    if (live.size === 1) raf(tick);
    const pill = el.closest && el.closest('.cur');
    if (pill && pill.animate) pill.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + (v > prev ? 1.16 : 0.94) + ')', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
    if (v > prev) coinFly(el, v - prev);
  }
  function tick() {
    const t = now();
    for (const el of live) {
      const k = (t - el._anim) / Math.min(900, 380 + Math.abs(el._to - el._from) * 0.4);
      el._shown = countAt(el._from, el._to, k);
      el.textContent = el._shown;
      if (k >= 1) live.delete(el);
    }
    if (live.size) raf(tick);
  }

  // coins fly from where you last pressed to the currency pill
  function coinFly(el, gain) {
    const pill = el.closest && el.closest('.cur');
    if (!pill || !pill.animate || reduced()) return;
    const to = pill.getBoundingClientRect(); if (!to.width) return;
    const fresh = now() - lt < 3500;
    const fx = fresh ? lx : innerWidth / 2, fy = fresh ? ly : innerHeight * 0.55;
    const spark = el.id === 'tSpark' || el.id === 'hSpark';
    const n = coinCount(gain);
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i'); c.className = 'mo-coin' + (spark ? ' s' : '');
      document.body.appendChild(c);
      const dx = to.left + to.width * 0.2 - fx, dy = to.top + to.height / 2 - fy, ox = (Math.random() - 0.5) * 70, oy = -20 - Math.random() * 40;
      const a = c.animate([
        { transform: `translate(${fx - 9}px,${fy - 9}px) scale(.4)`, opacity: 0 },
        { transform: `translate(${fx - 9 + ox}px,${fy - 9 + oy}px) scale(1)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${fx - 9 + dx}px,${fy - 9 + dy}px) scale(.6)`, opacity: 1, offset: 0.92 },
        { transform: `translate(${fx - 9 + dx}px,${fy - 9 + dy}px) scale(.2)`, opacity: 0 }
      ], { duration: 620 + i * 60, delay: i * 45, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'backwards' });
      a.onfinish = () => c.remove();
    }
  }

  // press feel: ripple, sparkles on important buttons, haptic tick
  function onDown(e) {
    lx = e.clientX; ly = e.clientY; lt = now();
    const b = e.target.closest && e.target.closest(PRESS);
    if (!b || b.disabled) return;
    if (buzz) buzz(b.classList.contains('btn') && !b.classList.contains('dim') ? 9 : 5);
    if (reduced() || !b.classList.contains('btn')) return;
    const r = b.getBoundingClientRect(), sz = Math.max(r.width, r.height) * 1.3;
    const rip = document.createElement('span'); rip.className = 'mo-rip';
    rip.style.cssText = `width:${sz}px;height:${sz}px;left:${e.clientX - r.left - sz / 2}px;top:${e.clientY - r.top - sz / 2}px`;
    b.appendChild(rip); setTimeout(() => rip.remove(), 560);
    if (!b.classList.contains('dim') && !b.classList.contains('small') && b.animate) {
      for (let i = 0; i < 6; i++) {
        const s = document.createElement('i'); s.className = 'mo-spk'; document.body.appendChild(s);
        const ang = (i / 6) * 6.283 + Math.random() * 0.6, d = 34 + Math.random() * 26;
        const a = s.animate([{ transform: `translate(${e.clientX - 4}px,${e.clientY - 4}px) scale(1)`, opacity: 1 }, { transform: `translate(${e.clientX - 4 + Math.cos(ang) * d}px,${e.clientY - 4 + Math.sin(ang) * d - 10}px) scale(0)`, opacity: 0 }], { duration: 480, easing: 'ease-out' });
        a.onfinish = () => s.remove();
      }
    }
  }

  function init() {
    applyReduced();
    document.addEventListener('pointerdown', onDown, { passive: true, capture: true });
    if (mq && mq.addEventListener) mq.addEventListener('change', applyReduced);
  }
  return { init, screen, num, applyReduced, reduced, coinFly };
}

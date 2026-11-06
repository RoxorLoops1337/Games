// Batch 6 result and pause polish: reward chips fly to the hub pills, hold-to-confirm GIVE UP with a recap of what would be lost,
// and an input-modality class so the pink focus ring only shows for keyboard users. Pure DOM, no per-frame work.
import { collectFly, snap } from './gig_fx.js';

// Result rows that are Beats or Sparkles (a snapshot taken before the hub replaces the screen)
export function rewardSnaps(list) {
  const out = [];
  try {
    for (const r of list ? list.children : []) {
      const t = r.textContent || '', kind = /Sparkles/.test(t) ? 'sparkles' : /Beats/.test(t) ? 'beats' : '';
      const n = +((r.querySelector('[data-to]') || {}).dataset || {}).to || 0;
      if (kind && n > 0) out.push({ kind, n, s: snap(r) });
    }
  } catch (e) { /* cosmetic only */ }
  return out;
}
// Fly them once the hub is up. The pills are pumped by hub code; here we only add the flight and the bump.
export function flyRewards(snaps, reduce) {
  snaps.forEach((it, i) => setTimeout(() => collectFly(it.s, it.kind, { reduce }), 120 + i * 170));
  return snaps.length;
}

// What a GIVE UP throws away, in one calm line
export function lossLine(g) {
  const pc = Math.floor((g.progress || 0) * 100), k = g.kills || 0;
  const picks = Object.keys(g.weap || {}).length;
  const bits = [pc + '% of the way', k + (k === 1 ? ' cell popped' : ' cells popped')];
  if (g.revivesLeft > 0) bits.push('an Encore left');
  return { text: bits.join(', '), pc, k, picks };
}

// Hold-to-confirm. pointer or Space/Enter held for ms; a plain tap shows the hint; a screen reader click (detail 0) arms, a second click confirms.
export function holdConfirm(btn, { ms = 900, onConfirm, onHint, onTick, label = 'HOLD TO GIVE UP' } = {}) {
  btn.innerHTML = '<i class="hfill"></i><span class="hlab">' + label + '</span>';
  let t0 = 0, timer = 0, done = false, armed = 0;
  const reset = () => { clearTimeout(timer); timer = 0; t0 = 0; btn.classList.remove('holding'); btn.style.setProperty('--hold', '0'); };
  const start = () => {
    if (timer || done) return; t0 = performance.now(); btn.classList.add('holding'); btn.style.setProperty('--hold', '1'); btn.style.setProperty('--holdms', ms + 'ms');
    if (onTick) onTick(0);
    timer = setTimeout(() => { timer = 0; done = true; btn.classList.remove('holding'); btn.classList.add('done'); onConfirm(); }, ms);
  };
  const cancel = () => { if (!timer) return; const short = performance.now() - t0 < 260; reset(); if (short && onHint) onHint(); };
  btn.addEventListener('pointerdown', e => { if (e.button) return; try { btn.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } start(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, cancel);
  btn.addEventListener('contextmenu', e => e.preventDefault());
  btn.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); start(); } });
  btn.addEventListener('keyup', e => { if (e.key === 'Enter' || e.key === ' ') cancel(); });
  btn.addEventListener('blur', () => reset());
  btn.addEventListener('click', e => {
    if (e.detail > 0 || done) return;   // pointer taps are handled by the hold; this is a synthetic click (assistive tech)
    const now = performance.now();
    if (now - armed < 3000) { done = true; onConfirm(); } else { armed = now; if (onHint) onHint('again'); }
  });
  return { reset: () => { done = false; armed = 0; reset(); btn.classList.remove('done'); } };
}

// keyboard modality: the pink focus ring is for keyboard users, a tap on a toggle should not leave it behind
export function trackModality(root = document.documentElement) {
  try {
    addEventListener('keydown', e => { if (e.key === 'Tab' || e.key.startsWith('Arrow') || e.key === 'Enter' || e.key === ' ') root.classList.add('kbd'); }, true);
    addEventListener('pointerdown', () => root.classList.remove('kbd'), true);
  } catch (e) { /* ignore */ }
}

// Batch 7: RETRY. The reward chips lift off the result list and fly up to the run HUD, and the energy spark peels off the button
// and flies to the top-left corner (where the energy lives), so pressing RETRY visibly pays and spends. DOM only, WAAPI, a handful of nodes.
export function retryTargets(w, h) { const top = (h - Math.min(h, w * 1.76)) / 2 + 18; return { energy: { x: 44, y: top }, beats: { x: Math.max(60, w - 90), y: top } }; }   // the run frame is letterboxed at about 1:1.76
export function retryFly(btn, snaps, reduce, w = globalThis.innerWidth || 390, h = globalThis.innerHeight || 844) {
  try {
    if (reduce || !btn || !btn.getBoundingClientRect || typeof btn.animate !== 'function') return 0;
    const tg = retryTargets(w, h), host = document.createElement('div'); host.className = 'gfx-host';
    document.body.appendChild(host);
    const mk = (x0, y0, to, txt, src, delay, dur) => {
      const f = document.createElement('i'); f.className = 'gfx-fly'; f.style.left = x0 - 11 + 'px'; f.style.top = y0 - 11 + 'px';
      if (src) f.style.backgroundImage = `url("${src}")`; else f.textContent = txt;
      host.appendChild(f);
      const dx = to.x - x0, dy = to.y - y0;
      f.animate([{ transform: 'translate(0,0) scale(.6)', opacity: 0 }, { transform: `translate(${(dx * 0.12).toFixed(1)}px,${(dy * 0.12 - 30).toFixed(1)}px) scale(1.3)`, opacity: 1, offset: 0.22 },
        { transform: `translate(${(dx * 0.75).toFixed(1)}px,${(dy * 0.75).toFixed(1)}px) scale(1)`, opacity: 1, offset: 0.78 }, { transform: `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(.45)`, opacity: 0 }],
        { duration: dur, delay, easing: 'cubic-bezier(.45,.05,.5,1)', fill: 'both' });
    };
    const b = btn.getBoundingClientRect();
    mk(b.left + b.width * 0.62, b.top + b.height / 2, tg.energy, '⚡', '', 0, 700);
    let i = 0;
    for (const it of snaps || []) {
      if (!it.s || !it.s.rect) continue;
      const r = it.s.rect, n = it.n > 40 ? 4 : 3;
      for (let k = 0; k < n; k++) mk(r.left + 20 + k * 9, r.top + r.height / 2, tg.beats, it.kind === 'sparkles' ? '✦' : '●', it.s.src, 40 + (i++) * 70, 620);
    }
    setTimeout(() => host.remove(), 1700);
    return i + 1;
  } catch (e) { return 0; }
}

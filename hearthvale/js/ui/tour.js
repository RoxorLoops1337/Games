// First-run guided tour: spotlight, wobbling hand and a speech card. Driven by what the player actually does, stored in 'hearthvale.tour'.
import { icon } from '../icons.js';
import { S, $, esc, store, myPub } from './state.js';
import { isOpen, current, curParams } from './frame.js';
import { confetti, snd, ui, reduced, haptic } from './fx.js';

let step = -1, raf = 0, last = null;
const stat = (k) => Math.floor((S.you && S.you.stats && S.you.stats[k]) || 0);
const hasB = (t) => !!(S.snap && myPub() && myPub().b.some((b) => b[1] === t));
const worldPt = (m, y = 1.2) => { const V = S.view.villages.get(S.myId); if (!V || !m) return null; const p = S.view.project(V.group.position.x + m.position.x, y, V.group.position.z + m.position.z); return p.vis ? { x: p.x, y: p.y, r: 46 } : null; };
const rectOf = (sel) => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el || el.hidden || !el.offsetParent && getComputedStyle(el).position !== 'fixed') return null; const r = el.getBoundingClientRect(); if (r.width < 2) return null; return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width + 12, h: r.height + 12, rect: true }; };
const treePt = () => { const V = S.view.villages.get(S.myId); const n = myPub().n.filter((n) => n[1] === 'tree' && n[4]); if (!V || !n.length) return null; let best = null, bd = 1e9; for (const t of n) { const m = V.n.get(t[0]); if (!m) continue; const p = S.view.project(V.group.position.x + m.position.x, 1.4, V.group.position.z + m.position.z); if (!p.vis || p.y < 140 || p.y > innerHeight - 160 || p.x < 20 || p.x > innerWidth - 80) continue; const d = Math.hypot(p.x - innerWidth / 2, p.y - innerHeight / 2); if (d < bd) { bd = d; best = { x: p.x, y: p.y, r: 46 }; } } return best; };

const STEPS = [
  { text: 'Welcome to Hearthvale! Let us build a cozy village together.', next: 'Let us go!' },
  { text: 'Tap a tree to send a villager to chop wood.', target: treePt, done: () => stat('wood') >= 1 || S.you.villagers.some((v) => v.state === 'work' || v.state === 'walk') },
  { text: 'Lovely! Wood builds homes. Tap Build.', target: () => rectOf('#bBuild'), done: () => isOpen('build') || !!S.mode || hasB('house') },
  { text: 'Pick the Cottage so more villagers can live here.', target: () => rectOf('.bcard[data-b=house]'), done: () => !!S.mode || hasB('house'), skipIf: () => hasB('house') },
  { text: 'Tap a free spot on the grass, then press Place.', target: () => rectOf('#placeOk'), done: () => hasB('house'), skipIf: () => hasB('house') },
  { text: 'Now a Wheat Field for food. Tap Build, then the Farm tab.', target: () => { if (S.mode) return rectOf('#placeOk'); if (!isOpen('build')) return rectOf('#bBuild'); const p = curParams(); const cur = document.querySelector('.tab.on'); if (cur && cur.dataset.tab !== 'farm') return rectOf('.tab[data-tab=farm]'); return rectOf('.bcard[data-b=farm]'); }, done: () => hasB('farm') },
  { text: 'Wheat feeds your villagers. Tap the Valley button to meet your neighbours and fill shared orders.', target: () => rectOf('#bValley'), done: () => isOpen('valley') },
  { text: 'You are all set! Follow the quest note, visit your chest each day, and have fun!', next: 'Start playing', end: true },
];

export function initTour() {
  const v = store.get('tour', null); if (v === 'done') return;
  if (navigator.webdriver && !/[?&]tour/.test(location.search)) return;   // automated screenshots stay clean unless asked
  const fresh = S.you.level <= 2 && (S.snap.players.find((p) => p.id === S.myId) || { b: [] }).b.length <= 2 && S.you.villagers.length <= 3 && !stat('wood');
  if (v === null && !fresh) { store.set('tour', 'done'); return; }
  startTour(false, typeof v === 'number' ? v : 0);
}
export function startTour(force, from = 0) {
  if (!S.you) return; step = from; S.tourActive = true; store.set('tour', step); const host = $('#tour'); host.hidden = false; host.innerHTML = '<div class="spot"></div><div class="tarrow"></div><div class="tcard2"></div>'; last = null; render();
  if (!raf) raf = requestAnimationFrame(loop);
}
function finish() { S.tourActive = false; store.set('tour', 'done'); const host = $('#tour'); host.hidden = true; host.innerHTML = ''; step = -1; cancelAnimationFrame(raf); raf = 0; }
function render() {
  const s = STEPS[step]; if (!s) { finish(); return; } const card = $('#tour .tcard2'); if (!card) return;
  card.innerHTML = `<div class="tm">${icon('leaf', 28)}<span>${esc(s.text)}</span></div><div class="trow">${s.next ? `<button class="b b-green" data-t="next" data-snd="confirm">${s.next}</button>` : '<span class="small tpulse">Try it!</span>'}<button class="b b-cream small-b" data-t="skip" data-snd="back">Skip tour</button></div><div class="dots">${STEPS.map((_, i) => `<i class="${i === step ? 'on' : i < step ? 'past' : ''}"></i>`).join('')}</div>`;
  card.onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; if (b.dataset.t === 'skip') finish(); else advance(); };
  if (!reduced()) try { card.animate([{ transform: 'translate(-50%,0) scale(.85)', opacity: 0 }, { transform: 'translate(-50%,0)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.3,1.5,.5,1)' }); } catch { /* ignore */ }
}
function advance() {
  const s = STEPS[step]; if (s && s.end) { confetti(innerWidth / 2, innerHeight * 0.45, 90); snd('reward'); finish(); return; }
  step++; while (STEPS[step] && STEPS[step].skipIf && STEPS[step].skipIf()) step++; store.set('tour', step); snd('unlock', { vol: 0.6 }); haptic(12); render();
}
export function tourTick() {
  if (step < 0 || !S.you) return; const s = STEPS[step]; if (!s) return;
  if (s.done && s.done()) { if (step >= STEPS.length - 2) { advance(); } else advance(); }
}
function loop() {
  raf = 0; if (step < 0) return; const s = STEPS[step]; const host = $('#tour'); if (!s || !host) return;
  let t = null; try { t = s.target ? s.target() : null; } catch { t = null; }
  const spot = host.querySelector('.spot'), arrow = host.querySelector('.tarrow'), card = host.querySelector('.tcard2');
  if (t) {
    const w = t.rect ? t.w : t.r * 2, h = t.rect ? t.h : t.r * 2; spot.hidden = false; arrow.hidden = false;
    spot.style.cssText = `width:${w}px;height:${h}px;transform:translate(${t.x - w / 2}px,${t.y - h / 2}px);border-radius:${t.rect ? '26px' : '50%'}`;
    const below = t.y < innerHeight * 0.55; if (!arrow.firstChild) arrow.innerHTML = `<span class="hnd">${icon('hand', 46)}</span>`; arrow.style.transform = `translate(${t.x - 8}px,${t.y + h / 2 - 4}px) ${below ? '' : 'rotate(180deg)'}`;
    arrow.style.transform = below ? `translate(${t.x - 12}px,${t.y + h / 2 - 6}px)` : `translate(${t.x - 34}px,${t.y - h / 2 - 40}px) rotate(180deg)`;
    card.style.top = below ? 'auto' : `calc(80px + var(--sat))`; card.style.bottom = below ? `calc(130px + var(--sab))` : 'auto';
    if (t.y > innerHeight * 0.55 && t.y < innerHeight - 140) { card.style.top = `calc(90px + var(--sat))`; card.style.bottom = 'auto'; }
  } else { spot.hidden = true; arrow.hidden = true; card.style.top = '30%'; card.style.bottom = 'auto'; }
  raf = requestAnimationFrame(loop);
}

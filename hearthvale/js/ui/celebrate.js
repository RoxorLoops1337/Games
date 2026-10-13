// Celebrations: level-up screen, achievement banner, quest complete card, Great Project splash, daily gift auto-open.
import { icon } from '../icons.js';
import { S, $, esc, store, BUILDINGS } from './state.js';
import { modal, hasModal } from './overlay.js';
import { open, isOpen, current } from './frame.js';
import { snd, ui, haptic, confetti, sparkAt, flyTo, roll, pulse, reduced, toast } from './fx.js';
import { thumbHtml } from '../thumbs.js';
import { ACHIEVEMENTS, QUESTS, PROJECT_STAGES } from '../../shared/data.js';

// ---------- a polite queue for full-screen celebrations ----------
const q = []; let showing = false;
export function later(fn) { q.push(fn); pump(); }
function pump() { if (showing || !q.length) return; if (hasModal()) { setTimeout(pump, 500); return; } showing = true; const fn = q.shift(); try { fn(() => { showing = false; setTimeout(pump, 250); }); } catch (e) { console.error(e); showing = false; } }

export function showLevelUp(level) {
  later((done) => {
    const unlocks = Object.entries(BUILDINGS).filter(([, d]) => d.lvl === level && !d.hidden);
    const m = modal(`<div class="rays big"></div><div class="lvlbadge">${icon('level', 150)}<b class="lvlnum">${level - 1}</b></div><h2 class="jelly">Level up!</h2><p>Your village reached <b>level ${level}</b>!</p>${unlocks.length ? `<div class="unl"><small>New things to build</small><div class="unlrow">${unlocks.map(([id, d]) => `<span class="unlit"><span class="th sm">${thumbHtml('b', id, S.pub.color, id, 34)}</span><b>${d.name}</b></span>`).join('')}</div></div>` : '<p class="small">Storage, xp and more are growing nicely.</p>'}<button class="b b-green big shine" data-r="1" data-snd="confirm">${icon('tick', 22)} Wonderful!</button>`, { cls: 'lvlup', onClose: done });
    m.card.addEventListener('click', (e) => { if (e.target.closest('[data-r]')) m.close(); });
    const num = m.card.querySelector('.lvlnum'); setTimeout(() => { roll(num, level - 1, String, { instant: true }); num.textContent = level; pulse(num, 1.5, 600); }, 450);
    snd('levelUp'); haptic([20, 40, 20, 40, 40]);
    const o = { x: innerWidth / 2, y: innerHeight * 0.38 }; confetti(o.x, o.y, 120, { power: 1.1 }); setTimeout(() => confetti(o.x - 100, o.y + 40, 50, { cone: 2.4 }), 350); setTimeout(() => confetti(o.x + 100, o.y + 40, 50, { cone: 2.4 }), 600);
    const V = S.view.villages.get(S.myId); if (V) S.view.celebrate('levelup', V.group.position.x, V.group.position.z); S.view.punch(0.05);
    setTimeout(() => { if (m.el.isConnected) m.close(); }, 9000);
  });
}

// ---------- banners that slide in from the top ----------
const bq = []; let bshow = false;
function banner(html, cls, ms, after) {
  bq.push({ html, cls, ms, after }); bpump();
}
function bpump() {
  if (bshow && !$('#banners').children.length) bshow = false;
  if (bshow || !bq.length) return; bshow = true; const b = bq.shift(); const host = $('#banners');
  const el = document.createElement('div'); el.className = 'banner ' + b.cls; el.innerHTML = b.html; host.appendChild(el);
  el.addEventListener('click', () => leave());
  let gone = false; const leave = () => { if (gone) return; gone = true; if (reduced()) { el.remove(); bshow = false; bpump(); return; } try { el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-90px)', opacity: 0 }], { duration: 300, easing: 'ease-in' }); } catch { /* ignore */ } setTimeout(() => { el.remove(); bshow = false; bpump(); }, 290); };
  if (!reduced()) try { el.animate([{ transform: 'translateY(-120px) scale(.8)', opacity: 0 }, { transform: 'translateY(8px) scale(1.04)', opacity: 1, offset: 0.65 }, { transform: 'none', opacity: 1 }], { duration: 560, easing: 'cubic-bezier(.3,1.4,.5,1)' }); } catch { /* ignore */ }
  if (b.after) setTimeout(() => b.after(el), 500);
  setTimeout(leave, b.ms || 4200);
}
export function achBanner(id) {
  const a = ACHIEVEMENTS.find((x) => x.id === id); if (!a) return;
  banner(`<span class="bic">${icon('medal', 46)}</span><div class="bt"><small>Trophy unlocked!</small><b>${esc(a.name)}</b><span class="small">${esc(a.desc)}</span><span class="chips">${Object.entries(a.reward).map(([k, n]) => `<span class="cc">${icon(k, 17)}${n}</span>`).join('')}${a.title ? `<span class="ttag">${icon('crown', 13)} ${esc(a.title)}</span>` : ''}</span></div>`, 'gold', 5000, (el) => {
    const r = el.querySelector('.bic').getBoundingClientRect(); sparkAt(r.left + r.width / 2, r.top + r.height / 2, 12);
    for (const [k] of Object.entries(a.reward)) flyTo({ x: r.left + r.width / 2, y: r.top + 30 }, $(k === 'coins' ? '#pCoins' : k === 'scrolls' ? '#pScrolls' : '#strip'), { icon: k, n: 3, delay: 900 });
  });
  snd('achievement'); haptic([16, 40, 16]); const V = S.view.villages.get(S.myId); if (V) S.view.celebrate('ach', V.group.position.x, V.group.position.z);
}
export function questCard(qid) {
  const qd = QUESTS.find((x) => x.id === qid); if (!qd) return;
  banner(`<span class="bic">${icon('check', 46)}</span><div class="bt"><small>Quest complete!</small><b>${esc(qd.text)}</b><span class="chips">${Object.entries(qd.reward).map(([k, n]) => `<span class="cc">${icon(k, 18)}${n}</span>`).join('')}</span></div>`, 'green', 3800, (el) => {
    const r = el.querySelector('.bic').getBoundingClientRect(); sparkAt(r.left + r.width / 2, r.top + r.height / 2, 10, ['#8fdc6a', '#fff', '#ffd54a']);
    for (const [k, n] of Object.entries(qd.reward)) flyTo({ x: r.left + r.width / 2 + 40, y: r.top + r.height - 4 }, $(k === 'coins' ? '#pCoins' : k === 'scrolls' ? '#pScrolls' : '#strip'), { icon: k, n: Math.min(5, 2 + Math.round(Math.log2(n + 1))), delay: 700 });
  });
  snd('questComplete'); haptic([14, 30, 14]); { const V = S.view.villages.get(S.myId); if (V) S.view.star(V.group.position.x, V.group.position.z); }
}
export function projectSplash(stage) {
  const st = PROJECT_STAGES[stage - 1]; if (!st) return;
  later((done) => {
    const m = modal(`<div class="rays big pink"></div><div class="th lg pth">${thumbHtml('m', Math.min(5, stage), '', 'fountain', 80)}</div><h2 class="jelly">Stage ${stage} complete!</h2><p><b>${esc(st.name)}</b> is finished!</p><div class="perk">${icon('sparkle', 20)} <span>${esc(st.perk)}</span></div><div class="chips ctr">${Object.entries(st.reward).map(([k, n]) => `<span class="cc big">${icon(k === 'xp' ? 'star' : k, 22)}${n}</span>`).join('')}</div><p class="small">The reward is shared between all villages. The more you gave, the bigger your slice!</p><button class="b b-pink big shine" data-r="1" data-snd="confirm">${icon('heart', 22)} Hooray!</button>`, { cls: 'lvlup', onClose: done });
    m.card.addEventListener('click', (e) => { if (e.target.closest('[data-r]')) m.close(); });
    snd('projectStage'); haptic([20, 50, 20, 50, 60]); S.view.focus(0, -5.4, 26);
    for (let i = 0; i < 4; i++) setTimeout(() => confetti(innerWidth * (0.2 + 0.2 * i), innerHeight * 0.3, 50, { cone: 2.8 }), i * 450);
    setTimeout(() => { if (m.el.isConnected) m.close(); }, 12000);
  });
}

/** open the daily gift once per session when it is waiting */
let dailyDone = false;
export function checkDaily() {
  if (dailyDone || !S.you || !S.you.daily || !S.you.daily.available) return; if (S.tourActive || S.mode) return;
  if (navigator.webdriver && !/[?&]daily/.test(location.search)) return;
  if (!S.api.firstAt) S.api.firstAt = performance.now(); if (performance.now() - S.api.firstAt < 2500) return;
  if (current() || hasModal()) return; dailyDone = true; later((done) => { open('daily', { auto: true }); done(); });
}

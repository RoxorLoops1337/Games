// Battle tab extras (agent 08): species fun facts, the daily twist badge, the event banner with a live countdown.
import { EVENT_MILES, clearReward, HARD_HP } from './sim.js';

// short, cute, snake-themed (real snake traits, told by the species)
export const FACTS = {
  love: 'Snakes smell with their tongues. Love-Struck flicks hers at every heart it sees.',
  rust: 'Snakes shed their skin in one long piece. Rustic keeps the old ones as scarves.',
  sneezy: 'Snakes feel the bass through their belly. Sneezy still blames the pollen.',
  grumpy: 'A grumpy snake is just a sleepy snake that missed its sunny nap.',
  sleepy: 'Some snakes nap most of the day. Sleepy is training for the record.',
  disco: 'Snakes have no eyelids, so Disco never misses a beat or a mirror ball.',
  sour: 'Snakes taste the air. Sour tasted lemon air once and has regrets.',
  mighty: 'Big snakes are very strong, but Mighty only squeezes speakers.',
  frosty: 'Snakes are cold blooded, so Frosty hums next to a warm speaker.',
  gloomy: 'Snakes cannot blink, so Gloomy stares at the rain all day. Offer a snack.',
  piggy: 'This one is not a snake at all, just a very shiny piggy bank.',
};
export const MOD_ICON = { swift: '💨', thick: '🧱', fragile: '🍃', armored: '🛡️', boomy: '💣', rich: '💰' };

// what a mod changes, as short chips ("Speed +25%")
export function modChips(m) {
  if (!m) return [];
  const out = [], pct = v => (v >= 1 ? '+' : '-') + Math.abs(Math.round((v - 1) * 100)) + '%';
  if (m.speed) out.push(['Speed ' + pct(m.speed), 'bad']);
  if (m.hp) out.push(['Cell HP ' + pct(m.hp), m.hp > 1 ? 'bad' : 'good']);
  if (m.coin) out.push(['Beats ' + pct(m.coin), 'good']);
  if (m.armor) out.push(['Armor cells', 'bad']);
  if (m.bomb) out.push(['Bombs', 'bad']);
  return out;
}
export function twistHTML(mod) {
  if (!mod) return '';
  return `<div class="bt-twist"><span class="tw-ic">${MOD_ICON[mod.id] || '✦'}</span><span class="tw-tx"><b>TWIST: ${mod.name}</b><small>${mod.blurb}</small></span><span class="tw-chips">${modChips(mod).map(([t, k]) => `<i class="${k}">${t}</i>`).join('')}</span></div>`;
}

// the fun fact card: species line plus what this stage pays
export function factHTML({ info, sp, hard, done, sparkleIcon }) {
  const first = clearReward(info.n).sparkles, hardFirst = Math.round(first * 1.5);
  const fact = FACTS[info.skin] || FACTS.love;
  return `<div class="ff-top"><b class="ff-name">${sp ? sp.name : 'Serpent'}${info.boss ? ' (Boss)' : ''}</b><button class="ff-x" aria-label="Close">✕</button></div>` +
    `<div class="ff-fact">${fact}</div>` + (info.boss ? '<div class="ff-fact ff-boss">Boss serpents wear a crown and take a lot more cheering.</div>' : '') +
    `<div class="ff-rew"><b>Stage rewards</b>` +
    `<span class="${done ? 'got' : ''}">${sparkleIcon} ${first} + 🥚 egg<small>first clear</small></span>` +
    `<span class="${hard ? 'on' : ''}">${sparkleIcon} ${hardFirst} + 🥚 egg<small>first Hard clear (HP x${HARD_HP})</small></span>` +
    `<span>★★★<small>stars: win, no revive, face kept low</small></span>` +
    `<span>🎁 <small>chests at 25% and 50% progress</small></span></div>`;
}

// ---- event banner
export const monthEndMs = day => { const d = new Date(day * 86400000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };
export function countdownText(ms) {
  if (ms <= 0) return 'ending';
  const d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000), p = n => String(n).padStart(2, '0');
  return d ? `${d}d ${p(h)}:${p(m)}:${p(s)}` : `${p(h)}:${p(m)}:${p(s)}`;
}
const REW_ICON = r => (r.eggs ? '🥚' : r.sparkles ? '✦' : r.energy ? '⚡' : '👗');
// ev = eventInfo(day), earned = ribbons gathered this event, claimed = {i:1}
export function eventBannerHTML(ev, earned, claimed, nowMs, day) {
  const top = EVENT_MILES[EVENT_MILES.length - 1].at, pct = Math.min(100, earned / top * 100);
  let ready = 0; EVENT_MILES.forEach((m, i) => { if (!claimed[i] && earned >= m.at) ready++; });
  const nodes = EVENT_MILES.map((m, i) => { const got = claimed[i], rd = !got && earned >= m.at; return `<span class="evn ${got ? 'got' : rd ? 'rd' : ''}" style="left:${m.at / top * 100}%"><em>${got ? '✓' : REW_ICON(m.reward)}</em><small>${m.at}</small></span>`; }).join('');
  const next = EVENT_MILES.find((m, i) => !claimed[i]);
  return `<div class="ev-top"><span class="ev-ic">🎪</span><span class="ev-tx"><b>${ev.name}</b><small>${ev.blurb}</small></span><span class="ev-cd" title="Time left"><small>ENDS IN</small><b id="evCd">${countdownText(monthEndMs(day) - nowMs)}</b></span></div>` +
    `<div class="ev-bar"><div class="ev-fill" style="width:${pct}%"></div>${nodes}</div>` +
    `<div class="ev-foot"><span>🎀 <b>${earned}</b> gathered${ready ? ' · rewards ready' : next ? ' · next at ' + next.at : ' · all done'}</span><button class="btn small go gold ev-go">${ready ? 'CLAIM ' + ready : 'OPEN'}</button></div>`;
}

// ---- round 3: dock measuring, title fit, swipe and arrow keys on the stage hero
// (--tabh was 0 on the first open, so the START dock covered the tab bar: measure after layout, and again on resize)
let dockPend = false;
export function syncDock() {
  const hb = document.getElementById('hub'), dk = document.getElementById('btDock'), tb = document.querySelector('.tabs');
  if (!hb || !dk || !tb) return;
  const m = () => { const t = tb.offsetHeight, d = dk.offsetHeight; if (t) hb.style.setProperty('--tabh', t + 'px'); if (d) hb.style.setProperty('--dockh', d + 'px'); };
  if (dockPend) return; dockPend = true;   // 17-perf: measure once per frame, after layout (no forced reflow while the pane is still being built)
  requestAnimationFrame(() => { dockPend = false; m(); });
}
let dockWatch = false;
export function watchDock() {
  if (dockWatch) return; dockWatch = true;
  addEventListener('resize', syncDock);
  try { const ro = new ResizeObserver(syncDock); ro.observe(document.querySelector('.tabs')); ro.observe(document.getElementById('btDock')); } catch (e) { /* ignore */ }
}
// a small tag on the START button: how your power compares with the recommended one
export function goTag(btn, mine, rec, playable) {
  if (!btn) return;
  const r = rec ? mine / rec : 2, tag = !playable ? '' : r < 0.85 ? 'RISKY' : r >= 1.6 ? 'EASY' : r >= 1 ? 'READY' : 'CLOSE';
  for (const o of btn.querySelectorAll('.gt')) o.remove();
  if (tag) { btn.dataset.tag = tag; const i = document.createElement('i'); i.className = 'gt'; i.textContent = tag; btn.appendChild(i); } else delete btn.dataset.tag;
}
// shrink the stage title until it fits (no more "Love-Struck Ser...")
export function fitTitle(el) {
  if (!el) return;
  el.style.fontSize = ''; el.title = el.textContent;
  const run = () => { let fs = parseFloat(getComputedStyle(el).fontSize) || 21; for (let i = 0; i < 8 && el.scrollWidth > el.clientWidth + 1 && fs > 14; i++) { fs -= 1.5; el.style.fontSize = fs + 'px'; } };
  if (el._fitPend) return; el._fitPend = true; requestAnimationFrame(() => { el._fitPend = false; run(); });   // 17-perf: one read pass per frame instead of a forced reflow per render
}
// swipe the hero or press the arrow keys to change stage; step(dir) returns true when the stage changed
export function bindStageNav(hero, tabOn, step) {
  let sx = 0, sy = 0, st = 0, live = false;
  const go = dir => { const ok = step(dir), c = ok ? (dir > 0 ? 'bt-sl' : 'bt-sr') : 'bt-bump'; hero.classList.remove('bt-sl', 'bt-sr', 'bt-bump'); void hero.offsetWidth; hero.classList.add(c); };
  hero.addEventListener('pointerdown', e => { if (e.target.closest('button,#stPortrait')) { live = false; return; } live = true; sx = e.clientX; sy = e.clientY; st = performance.now(); });
  hero.addEventListener('pointerup', e => { if (!live) return; live = false; const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.6) go(dx < 0 ? 1 : -1); });
  hero.addEventListener('pointercancel', () => { live = false; });
  addEventListener('keydown', e => { if (!tabOn() || e.ctrlKey || e.metaKey || e.altKey) return; if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); });
}

// ---- round 4: first-clear reward markers on the stage chips, compact daily goals strip, scroll hint on the side buttons
// the next stage shows what its first clear pays; cleared stages whose first Hard clear is still unclaimed get a purple H
export function chipReward(n, cleared, hardCleared) {
  if (n === cleared + 1) return `<span class="rw" title="First clear pays ${clearReward(n).sparkles} Sparkles and an egg">+${clearReward(n).sparkles}</span>`;
  if (n <= cleared && n > (hardCleared || 0)) return `<span class="hk ${n === (hardCleared || 0) + 1 ? 'hot' : 'dim'}" title="First Hard clear still pays ${Math.round(clearReward(n).sparkles * 1.5)} Sparkles and an egg">H</span>`;
  return '';
}
// one compact row per daily goal: text, mini bar, reward or CLAIM
export function goalRowHTML(text, prog, target, rewardHTML, state) {
  const pct = Math.round(Math.min(1, prog / target) * 100);
  return `<span class="gl-ic">${state === 'claimed' ? '✓' : '🎯'}</span><span class="gl-tx"><b>${text}</b><span class="gl-bar"><i style="width:${pct}%"></i></span></span><span class="gl-n">${Math.min(prog, target)}/${target}</span>` +
    `<button class="gl-btn ${state}" ${state === 'ready' ? '' : 'disabled'}>${state === 'claimed' ? 'DONE' : state === 'ready' ? 'CLAIM' : ''}${state === 'ready' ? '' : rewardHTML}</button>`;
}
// fade the right edge of the side button row while more buttons are hidden off screen
export function watchSide(el) {
  if (!el) return;
  const m = () => el.classList.toggle('more', el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  if (!el.dataset.sw) { el.dataset.sw = '1'; el.addEventListener('scroll', m, { passive: true }); }
  m(); requestAnimationFrame(m);
}

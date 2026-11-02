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

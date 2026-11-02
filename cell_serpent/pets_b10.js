// Cell Serpent round 10: pet treats (raise joy for Beats, 3 per pet per day), the skill upgrade ceremony,
// the mastery path preview and the hatch reveal tag. Save field: save.treats = { day, n: { petId: count } } (sanitized in sim.js).
import { PETS, PET_JOY_MAX, SKILL_MAX_LV, SKILL_MILES, rewardText } from './sim.js';

export const TREAT_COST = 30, TREAT_JOY = 10, TREAT_DAILY = 3;
export const dayNow = () => Math.floor(Date.now() / 86400000);
export function treatsLeft(save, id, day) {
  const t = save.treats; return TREAT_DAILY - (t && t.day === day ? (t.n && t.n[id]) || 0 : 0);
}
// why a treat cannot be given right now ('' when it can)
export function treatBlock(save, id, day) {
  const k = save.pets[id];
  if (!k || k.star < 1) return 'not met';
  if ((k.joy || 0) >= PET_JOY_MAX) return 'full';
  if (treatsLeft(save, id, day) < 1) return 'daily';
  if (save.beats < TREAT_COST) return 'poor';
  return '';
}
const joyTier = j => j >= PET_JOY_MAX ? 3 : j >= 66 ? 2 : j >= 33 ? 1 : 0;
export function feedPet(save, id, day) {
  if (treatBlock(save, id, day)) return null;
  if (!save.treats || save.treats.day !== day) save.treats = { day, n: Object.fromEntries(PETS.map(p => [p.id, 0])) };
  save.treats.n[id] = (save.treats.n[id] || 0) + 1;
  const k = save.pets[id], j0 = k.joy || 0; save.beats -= TREAT_COST; k.joy = Math.min(PET_JOY_MAX, j0 + TREAT_JOY);
  return { from: j0, to: k.joy, tierUp: joyTier(k.joy) > joyTier(j0) };
}
export function treatLabel(save, id, day) {
  const b = treatBlock(save, id, day), left = treatsLeft(save, id, day);
  return b === 'full' ? 'FULL OF JOY' : b === 'daily' ? 'FULL TUMMY, BACK TOMORROW' : 'GIVE A TREAT  ' + TREAT_COST + ' Beats' + (left < TREAT_DAILY ? '  (' + left + ' left)' : '');
}

// mastery path: the five rewards of a skill in one strip: claimed, ready to claim, next goal, later
export function masteryPath(save, id) {
  const val = (save.addict && save.addict.sk && save.addict.sk[id]) || 0, cl = (save.addict && save.addict.claimed) || {};
  const steps = SKILL_MILES.map((ms, i) => ({ at: ms.at, text: rewardText(ms.reward), state: cl['sk:' + id + ':' + i] ? 'done' : val >= ms.at ? 'ready' : 'todo' }));
  const nx = steps.findIndex(s => s.state === 'todo'); if (nx >= 0) steps[nx].state = 'next';
  return { val, steps };
}
export function masteryPathHTML(save, id) {
  const mp = masteryPath(save, id), fmt = n => n >= 1000 ? (n / 1000) + 'k' : String(n);
  return '<div class="mpath" role="list" aria-label="Mastery rewards">' + mp.steps.map((s, i) => s.state === 'ready' ? `<button class="mp ready" role="listitem" data-i="${i}" aria-label="Claim step ${i + 1}: ${s.text}"><i>${i + 1}</i><b>${fmt(s.at)}</b><small>${s.text}</small><u>TAP</u></button>` : `<div class="mp ${s.state}" role="listitem"><i>${s.state === 'done' ? '✓' : i + 1}</i><b>${fmt(s.at)}</b><small>${s.text}</small></div>`).join('') + '</div>';
}

// upgrade ceremony: a banner and a ring of sparks on the open sheet
export function upgradeCeremony(sh, lv, color, reduce, head, sub) {
  if (!sh) return;
  const b = document.createElement('div'); b.className = 'upcer'; b.setAttribute('aria-hidden', 'true');
  b.innerHTML = `<b>${head || 'LEVEL ' + lv}</b><small>${sub || (lv >= SKILL_MAX_LV ? 'MAXED OUT' : 'stronger!')}</small>`; const top = sh.parentNode || sh; top.appendChild(b); setTimeout(() => b.remove(), 1500);
  if (reduce) return;
  const ic = sh.querySelector('.dsic'); if (ic) { ic.classList.remove('uppop'); void ic.offsetWidth; ic.classList.add('uppop'); }
  const ring = document.createElement('div'); ring.className = 'upring';
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, p = document.createElement('i'); p.style.cssText = `--dx:${Math.cos(a) * 86 | 0}px;--dy:${Math.sin(a) * 86 | 0}px;background:${i % 2 ? '#ffe14a' : color || '#7fe8ff'}`; ring.appendChild(p); }
  top.appendChild(ring); setTimeout(() => ring.remove(), 1000);
}

// hatch reveal: what the egg gave, in one short line
export const hatchTag = (isNew, n) => isNew ? 'NEW FRIEND' : '+' + n + ' fragments';

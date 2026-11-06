// Cell Serpent, batch 16 (agent b): RISK DOORS. Before the stage that follows every boss the player walks through one of two doors:
// the calm door (the stage as it is) or the loud door (a harder twist for double Beats). DOM only, no canvas, nothing per frame.
// The rules live in sim.js (RISK_LOUD, hasDoors, mergeRisk); this file only asks the question and reports the answer.
import { RISK_LOUD, RISK_COIN, hasDoors, riskLoud } from './sim.js';

export { hasDoors, riskLoud };

const doorSvg = (kind) => {
  const c = kind === 'loud' ? ['#ff7a45', '#7a1d2e', '#ffd24a'] : ['#6fe3d2', '#1b4a6b', '#ffffff'];
  const mark = kind === 'loud'
    ? '<path d="M32 30c6 6 10 11 10 17a10 10 0 0 1-20 0c0-4 3-7 5-9 0 4 2 5 3 5-2-6 0-9 2-13z" fill="#ffd24a" stroke="#0b1020" stroke-width="2.5" stroke-linejoin="round"/>'
    : '<path d="M42 34a13 13 0 1 1-16-12 10 10 0 0 0 16 12z" fill="#fff6c8" stroke="#0b1020" stroke-width="2.5" stroke-linejoin="round"/>';
  return `<svg viewBox="0 0 64 84" width="64" height="84" aria-hidden="true"><path d="M6 82V30C6 14 18 4 32 4s26 10 26 26v52z" fill="${c[1]}" stroke="#0b1020" stroke-width="3" stroke-linejoin="round"/><path d="M12 80V31C12 18 21 10 32 10s20 8 20 21v49z" fill="${c[0]}" opacity=".35"/>${mark}<circle cx="49" cy="58" r="3.4" fill="${c[2]}" stroke="#0b1020" stroke-width="2"/></svg>`;
};

let open = null;

// pick(id): '' for the calm door, the twist id for the loud one. cancel(): the back button. Returns the overlay element.
export function showDoors(opts) {
  closeDoors();
  const { stage, audio, pick, cancel } = opts;
  const loud = riskLoud(stage), reduce = !!opts.reduce;
  const root = document.createElement('div');
  root.className = 'rkd' + (reduce ? ' rm' : '');
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Choose a door for stage ' + stage);
  root.innerHTML = `<div class="rkd-in"><h2 class="rkd-t">TWO DOORS</h2><p class="rkd-s">Stage ${stage} is next. Pick your way in.</p>`
    + `<div class="rkd-row">`
    + `<button class="rkd-door calm" data-id="" aria-label="Calm door. The stage as it is. Beats times 1"><span class="rkd-art">${doorSvg('calm')}</span><b>CALM</b><span class="rkd-d">The stage as it is</span><span class="rkd-p">Beats x1</span></button>`
    + `<button class="rkd-door loud" data-id="${loud.id}" aria-label="Loud door. ${loud.name}: ${loud.blurb}. Beats times ${RISK_COIN}"><span class="rkd-art">${doorSvg('loud')}</span><b>LOUD</b><span class="rkd-d">${loud.name}: ${loud.blurb}</span><span class="rkd-p hot">Beats x${RISK_COIN}</span></button>`
    + `</div><button class="rkd-back" type="button">Back</button></div>`;
  document.body.appendChild(root);
  const done = (fn, arg) => { closeDoors(); if (fn) fn(arg); };
  root.querySelectorAll('.rkd-door').forEach(b => { b.onclick = () => { if (audio) audio.play(b.dataset.id ? 'upgrade' : 'click'); done(pick, b.dataset.id); }; });
  root.querySelector('.rkd-back').onclick = () => { if (audio) audio.play('click'); done(cancel); };
  const key = e => { if (e.key === '1') { e.preventDefault(); root.querySelector('.calm').click(); } else if (e.key === '2') { e.preventDefault(); root.querySelector('.loud').click(); } else if (e.key === 'Escape') { e.preventDefault(); root.querySelector('.rkd-back').click(); } };
  addEventListener('keydown', key);
  open = { root, key };
  requestAnimationFrame(() => root.classList.add('on'));
  return root;
}

export function closeDoors() {
  if (!open) return;
  removeEventListener('keydown', open.key); open.root.remove(); open = null;
}
export const doorsOpen = () => !!open;

// the result line for a run that took the loud door
export const riskLine = r => (r && r.risk ? (r.won ? 'Loud door cleared: double Beats!' : 'Loud door: Beats were doubled.') : '');
export const riskTwists = () => RISK_LOUD.map(r => r.name);

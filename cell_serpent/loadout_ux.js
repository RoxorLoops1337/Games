// Cell Serpent: loadout editing helpers (swap sheet, skill compare bars, pet walk strip, rarity chip).
// Pure HTML builders plus one small bottom sheet; the rules stay in sim.js (toggleLoadout).
import { WEAPONS, toggleLoadout } from './sim.js';
import { skillPower } from './skill_sheet.js';
import { announce } from './access.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const wname = id => (WEAPONS.find(w => w.id === id) || { name: id }).name;

// replace one equipped skill with another: the full-loadout dead end becomes a two tap swap
export function swapSheet(c, newId) {
  const { save, persist, audio, icon, rerender } = c, s = save();
  document.querySelectorAll('.swapbg').forEach(n => n.remove());
  const bg = el('div', 'dsheet-bg swapbg'), sh = el('div', 'dsheet lswap'); bg.appendChild(sh); sh.setAttribute('aria-label', `Swap in ${wname(newId)}. Pick who steps out`);
  const close = () => { bg.classList.remove('on'); setTimeout(() => bg.remove(), 180); };
  bg.addEventListener('click', e => { if (e.target === bg) { audio.play('click'); close(); } });
  const x = el('button', 'dsx', '✕'); x.setAttribute('aria-label', 'Close'); x.onclick = () => { audio.play('click'); close(); }; sh.appendChild(x);
  sh.appendChild(el('div', 'swhd', `<div class="swnew">${icon(newId)}</div><div class="swtx"><b>${wname(newId)}</b><span>Who steps out for it?</span></div>`));
  const row = el('div', 'swrow');
  const pNew = skillPower(newId, s.skills[newId].lv);
  for (const id of s.loadout) {
    const lv = s.skills[id].lv, p = skillPower(id, lv), d = pNew - p;
    const b = el('button', 'swopt', `${icon(id)}<b>${wname(id)}</b><small>Lv ${lv}</small><i class="${d > 0.005 ? 'up' : d < -0.005 ? 'dn' : ''}">${d > 0.005 ? '▲ stronger' : d < -0.005 ? '▼ weaker' : 'same'}</i>`);
    b.setAttribute('aria-label', `Swap out ${wname(id)}, level ${lv}, the new skill is ${d > 0.005 ? 'stronger' : d < -0.005 ? 'weaker' : 'about the same'}`);
    b.onclick = () => { if (toggleLoadout(s, id) && toggleLoadout(s, newId)) { announce(`${wname(newId)} swapped in for ${wname(id)}`); persist(); audio.play('upgrade'); close(); rerender(); } };
    row.appendChild(b);
  }
  row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Equipped skills');
  sh.appendChild(row);
  document.body.appendChild(bg); requestAnimationFrame(() => bg.classList.add('on'));
}

// horizontal power bars: this skill against the equipped ones
export function compareHTML(s, id) {
  const ids = [...new Set([...s.loadout, id])].filter(i => s.skills[i]);
  const rows = ids.map(i => ({ i, p: skillPower(i, s.skills[i].lv || 1) })), max = Math.max(...rows.map(r => r.p)) || 1;
  rows.sort((a, b) => b.p - a.p);
  return '<div class="dscmp"><div class="mhd"><span>VS YOUR LOADOUT</span><b>power per second</b></div>' +
    rows.map(r => `<div class="cmprow${r.i === id ? ' me' : ''}"><span>${wname(r.i)}</span><div class="bar"><i style="width:${Math.max(6, Math.round(r.p / max * 100))}%"></i></div></div>`).join('') + '</div>';
}

// a little trot: the pet walks beside the duo on a lane that scrolls
export function walkHTML(iconHtml, walking, color) {
  return `<div class="dswalk${walking ? ' go' : ''}" style="--rc:${color}" aria-hidden="true"><div class="wlane"></div><div class="wpet"><span class="wsh"></span><span class="wic">${iconHtml}</span></div><div class="wduo">🎤</div><small>${walking ? 'Trotting along' : 'Resting at home'}</small></div>`;
}

export const rarityChip = (r, i) => `<em class="rchip r${i}" style="--rc:${r.color}">${r.name.toUpperCase()}</em>`;

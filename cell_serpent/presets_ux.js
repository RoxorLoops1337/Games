// Cell Serpent: loadout presets (3 saved builds), drag to reorder the loadout row, pet happiness meter.
// Rules stay tiny and live here; the save fields (save.presets, pets[id].joy) are sanitized in sim.js.
import { LOADOUT_SIZE, PET_JOY_MAX } from './sim.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const NAMES = ['A', 'B', 'C'];
const sameSet = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

// a preset can be loaded when all of it is still owned
export function presetUsable(save, ids) { return ids.length > 0 && ids.every(id => save.skills[id] && save.skills[id].lv > 0); }
export function savePreset(save, i) { if (i < 0 || i > 2) return false; if (!save.presets) save.presets = [[], [], []]; save.presets[i] = save.loadout.slice(0, LOADOUT_SIZE); return true; }
export function loadPreset(save, i) { const ids = save.presets && save.presets[i]; if (!ids || !presetUsable(save, ids)) return false; save.loadout = ids.slice(0, LOADOUT_SIZE); return true; }
// move the skill at slot a to slot b (the others shift along)
export function moveSlot(save, a, b) {
  const n = save.loadout.length; if (a === b || a < 0 || b < 0 || a >= n || b >= n) return false;
  const [id] = save.loadout.splice(a, 1); save.loadout.splice(b, 0, id); return true;
}

export function renderPresets(host, c) {
  const { save, persist, audio, icon, rerender } = c, s = save();
  host.innerHTML = '';
  if (!s.presets) s.presets = [[], [], []];
  host.appendChild(el('div', 'prhd', '<span>BUILDS</span><small>Save a loadout, swap in one tap</small>'));
  const row = el('div', 'prrow');
  for (let i = 0; i < 3; i++) {
    const ids = s.presets[i] || [], has = ids.length > 0, ok = has && presetUsable(s, ids), on = has && sameSet(ids, s.loadout);
    const cell = el('div', 'prcell' + (has ? ' has' : '') + (on ? ' on' : '') + (has && !ok ? ' bad' : ''));
    const main = el('button', 'prmain', `<b>${NAMES[i]}</b>` + (has ? `<span class="prics">${ids.map(id => `<i>${icon(id)}</i>`).join('')}</span>` : '<span class="prem">empty</span>'));
    main.setAttribute('aria-label', has ? `Load build ${NAMES[i]}` : `Build ${NAMES[i]} is empty`);
    main.disabled = !has;
    main.onclick = () => { if (loadPreset(s, i)) { persist(); audio.play('upgrade'); rerender(); } else audio.play('click'); };
    const sv = el('button', 'prsave', on ? 'SAVED' : 'SAVE'); sv.setAttribute('aria-label', `Save current loadout as build ${NAMES[i]}`); sv.disabled = on;
    sv.onclick = () => { savePreset(s, i); persist(); audio.play('click'); rerender(); };
    cell.append(main, sv); row.appendChild(cell);
  }
  host.appendChild(row);
}

// pointer drag on the filled slots; a plain tap still falls through to the slot's own click
export function enableDrag(rowEl, c) {
  const { save, persist, audio, rerender } = c;
  let drag = null;
  let rects = [];   // measured at pointerdown: the dragged slot moves, so its live rect would lie
  const slotAt = x => { for (let i = 0; i < rects.length; i++) if (x >= rects[i].left && x <= rects[i].right) return i; return -1; };
  const clear = () => { rowEl.querySelectorAll('.drag,.dropto').forEach(n => { n.classList.remove('drag', 'dropto'); n.style.transform = ''; }); rowEl.classList.remove('dragging'); };
  [...rowEl.children].forEach((b, i) => {
    b.dataset.i = i;
    if (!b.classList.contains('full')) return;
    b.style.touchAction = 'none';
    b.addEventListener('pointerdown', e => { rects = [...rowEl.children].map(n => n.getBoundingClientRect()); drag = { b, i, x0: e.clientX, on: false, to: i }; });
  });
  const move = e => {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    if (!drag.on) { if (Math.abs(dx) < 9) return; drag.on = true; drag.b.classList.add('drag'); rowEl.classList.add('dragging'); try { drag.b.setPointerCapture(e.pointerId); } catch (_) {} }
    drag.b.style.transform = `translateX(${dx}px) scale(1.12)`;
    const t = slotAt(e.clientX); rowEl.querySelectorAll('.dropto').forEach(n => n.classList.remove('dropto'));
    const full = save().loadout.length;
    drag.to = t >= 0 && t < full ? t : drag.i;
    if (drag.to !== drag.i) rowEl.children[drag.to].classList.add('dropto');
  };
  const up = () => {
    if (!drag) return; const d = drag; drag = null;
    if (!d.on) return;
    d.b.addEventListener('click', ev => { ev.stopImmediatePropagation(); ev.preventDefault(); }, { capture: true, once: true });   // a drop is not a tap (tap removes the skill)
    clear();
    if (moveSlot(save(), d.i, d.to)) { persist(); audio.play('upgrade'); rerender(); }
  };
  rowEl.addEventListener('dragstart', e => e.preventDefault());
  rowEl.addEventListener('pointermove', move); rowEl.addEventListener('pointerup', up); rowEl.addEventListener('pointercancel', () => { drag = null; clear(); });
}

// happiness meter: 0..100, hearts at the end
export const joyLabel = j => j >= PET_JOY_MAX ? 'Overjoyed' : j >= 66 ? 'Happy' : j >= 33 ? 'Content' : j > 0 ? 'Curious' : 'Shy';
export function joyHTML(k, compact) {
  const j = Math.max(0, Math.min(PET_JOY_MAX, (k && k.joy) || 0));
  return `<div class="joy${j >= PET_JOY_MAX ? ' full' : ''}${compact ? ' sm' : ''}" title="Happiness grows while the pet walks with you"><span class="jh">♥</span><div class="jbar"><i style="width:${j}%"></i></div><b>${compact ? j + '%' : joyLabel(j)}</b></div>`;
}

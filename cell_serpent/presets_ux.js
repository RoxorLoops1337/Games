// Cell Serpent: loadout presets (3 saved builds), drag to reorder the loadout row, pet happiness meter.
// Rules stay tiny and live here; the save fields (save.presets, pets[id].joy) are sanitized in sim.js.
import { LOADOUT_SIZE, PET_JOY_MAX, WEAPONS } from './sim.js';
import { announce } from './access.js';
import { skillPower } from './skill_sheet.js';
// a rebuild drops keyboard focus: put it back on the same build (the SAVE button just turned into SAVED and is disabled)
const refocus = (host, i, cls) => setTimeout(() => { const b = host.querySelectorAll('.prcell')[i]; const t = b && b.querySelector('.' + cls + ':not([disabled])'); if (t && (!document.activeElement || document.activeElement === document.body)) t.focus({ preventScroll: true }); }, 30);
const wn = id => (WEAPONS.find(w => w.id === id) || { name: id }).name;

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const NAMES = ['A', 'B', 'C'];
export const NAME_MAX = 8;
export const cleanName = v => String(v == null ? '' : v).replace(/[^\w \-!+&.]/g, '').trim().slice(0, NAME_MAX);
export const buildName = (save, i) => (save.presetNames && cleanName(save.presetNames[i])) || NAMES[i];
export function renameBuild(save, i, v) { if (i < 0 || i > 2) return false; const n = cleanName(v); if (!save.presetNames) save.presetNames = ['', '', '']; save.presetNames[i] = n; return true; }
// auto-suggest: the best owned skills (level first, then tier), one of each, LOADOUT_SIZE of them
export function suggestBuild(save) {
  const own = WEAPONS.filter(w => save.skills[w.id] && save.skills[w.id].lv > 0);
  own.sort((a, b) => (save.skills[b.id].lv * 10 + (b.tier || 0)) - (save.skills[a.id].lv * 10 + (a.tier || 0)));
  return own.slice(0, LOADOUT_SIZE).map(w => w.id);
}
let undoLoadout = null, armed = -1, armT = 0;
const sameSet = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

// round 11: rough power of a build (sum of skill power at the owned levels) and how it compares with what is equipped
export const buildPower = (save, ids) => ids.reduce((a, id) => a + (save.skills[id] ? skillPower(id, save.skills[id].lv) : 0), 0);
export function buildDelta(save, ids) {
  const cur = buildPower(save, save.loadout), p = buildPower(save, ids); if (cur <= 0) return 0;
  return Math.round((p / cur - 1) * 100);
}
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
  const hd = el('div', 'prhd', '<span>BUILDS</span><small>Save a loadout, swap in one tap</small>');
  { const sug = suggestBuild(s), cur = s.loadout.slice(0, LOADOUT_SIZE), better = sug.length > 0 && !sameSet(sug.slice().sort(), cur.slice().sort());
    if (undoLoadout || better) {
      const ab = el('button', 'prauto', undoLoadout ? 'UNDO' : 'AUTO'); ab.setAttribute('aria-label', undoLoadout ? 'Undo the suggested build' : 'Suggest my strongest build');
      ab.onclick = () => { if (undoLoadout) { s.loadout = undoLoadout; undoLoadout = null; } else { undoLoadout = s.loadout.slice(); s.loadout = sug; } persist(); audio.play('upgrade'); rerender(); };
      hd.querySelector('small').replaceWith(ab);
    } }
  host.appendChild(hd);
  const row = el('div', 'prrow');
  for (let i = 0; i < 3; i++) {
    const ids = s.presets[i] || [], has = ids.length > 0, ok = has && presetUsable(s, ids), on = has && sameSet(ids, s.loadout);
    const cell = el('div', 'prcell' + (has ? ' has' : '') + (on ? ' on' : '') + (has && !ok ? ' bad' : ''));
    const nm = buildName(s, i), main = el('button', 'prmain', `<b>${nm.replace(/&/g, '&amp;')}</b>` + (has ? `<span class="prics">${ids.map(id => `<i>${icon(id)}</i>`).join('')}</span>` : '<span class="prem">empty</span>'));
    if (has && ok) { const d = on ? 0 : buildDelta(s, ids); main.insertAdjacentHTML('beforeend', `<small class="prpw ${on ? 'eq' : d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${on ? 'EQUIPPED' : d > 0 ? '▲ ' + (d > 99 ? '99+' : d) + '%' : d < 0 ? '▼ ' + -d + '%' : 'SAME'}</small>`); }
    main.setAttribute('aria-label', has ? `${on ? 'Build ' + nm + ' is equipped' : ok ? 'Load build ' + nm : 'Build ' + nm + ' needs a skill you no longer own'}: ${ids.map(wn).join(', ')}` : `Build ${nm} is empty`);
    if (has) main.setAttribute('aria-pressed', on ? 'true' : 'false'); cell.setAttribute('role', 'group'); cell.setAttribute('aria-label', 'Build ' + nm);
    main.disabled = !has;
    main.onclick = () => { if (loadPreset(s, i)) { announce(`Build ${nm} loaded: ${ids.map(wn).join(', ')}`); persist(); audio.play('upgrade'); rerender(); refocus(host, i, 'prmain'); } else audio.play('click'); };
    const arm = armed === i && Date.now() < armT, sv = el('button', 'prsave' + (arm ? ' warn' : ''), on ? 'SAVED' : arm ? 'OVERWRITE?' : 'SAVE'); sv.setAttribute('aria-label', `Save current loadout as build ${nm}`); sv.disabled = on;
    sv.onclick = () => {
      if (has && !on && !arm) { armed = i; armT = Date.now() + 2600; audio.play('click'); rerender(); setTimeout(() => { if (armed === i && Date.now() >= armT) { armed = -1; if (host.isConnected) rerender(); } }, 2700); return; }
      armed = -1; savePreset(s, i); announce(`Build ${nm} saved`); persist(); audio.play('click'); rerender(); refocus(host, i, 'prmain');
    };
    if (has) {
      const rn = el('button', 'prren', '✎'); rn.setAttribute('aria-label', `Rename build ${nm}`); cell.appendChild(rn);
      rn.onclick = e => {
        e.stopPropagation(); const inp = el('input', 'prinp'); inp.maxLength = NAME_MAX; inp.value = buildName(s, i); inp.setAttribute('aria-label', 'Build name'); main.innerHTML = ''; main.appendChild(inp); main.disabled = true; rn.remove(); inp.focus(); inp.select();
        let done = false; const fin = ok => { if (done) return; done = true; if (ok) { renameBuild(s, i, inp.value); persist(); audio.play('click'); announce('Build renamed to ' + buildName(s, i)); } rerender(); refocus(host, i, 'prren'); };
        inp.onkeydown = ev => { if (ev.key === 'Enter') fin(true); else if (ev.key === 'Escape') fin(false); }; inp.onblur = () => fin(true);
      };
    }
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
  return `<div class="joy${j >= PET_JOY_MAX ? ' full' : ''}${compact ? ' sm' : ''}" title="Happiness grows while the pet walks with you"><span class="jh">♥</span><div class="jbar"><i style="width:${j}%"></i><s class="jt${j >= 33 ? ' on' : ''}" style="left:33%"></s><s class="jt${j >= 66 ? ' on' : ''}" style="left:66%"></s></div><b>${compact ? j + '%' : joyLabel(j)}</b></div>`;
}

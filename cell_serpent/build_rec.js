// Cell Serpent round 7: a recommended build per stage species, shown as a strip on the Skills tab.
// The walking pets react when the build is swapped (hop and a little word). Pure advice: no rule changes.
import { WEAPONS, LOADOUT_SIZE, stageInfo, MAX_STAGE } from './sim.js';
import { skillPower } from './skill_sheet.js';

// three skills that suit each species' cells (love is soft and round, rust is armoured, sneezy is fuzzy...)
export const REC = {
  love: { ids: ['daggers', 'swab', 'dragon'], why: 'Soft round cells' },
  rust: { ids: ['tower', 'stick', 'satellite'], why: 'Tough armoured cells' },
  sneezy: { ids: ['needles', 'swab', 'bubble'], why: 'Fuzzy, crowded cells' },
  grumpy: { ids: ['tower', 'maw', 'stick'], why: 'Hard crystal cells' },
  sleepy: { ids: ['dragon', 'bubble', 'satellite'], why: 'Slow, lobed cells' },
  disco: { ids: ['daggers', 'satellite', 'dragon'], why: 'Quick shiny cells' },
  sour: { ids: ['bubble', 'swab', 'needles'], why: 'Sticky little drops' },
  mighty: { ids: ['tower', 'maw', 'stick'], why: 'Heavy stone cells' },
  frosty: { ids: ['dragon', 'needles', 'satellite'], why: 'Brittle snow cells' },
  piggy: { ids: ['maw', 'daggers', 'tower'], why: 'Piggy banks full of Beats' },
  gloomy: { ids: ['satellite', 'bubble', 'maw'], why: 'Dark, tough cells' },
};
const wn = id => (WEAPONS.find(w => w.id === id) || { name: id }).name;
export const recFor = skin => REC[skin] || REC.love;
// how many of the recommended skills this loadout carries (owned or not), and which owned ones are missing
export function recFit(save, skin) {
  const r = recFor(skin), have = r.ids.filter(id => save.loadout.includes(id)).length;
  const missing = r.ids.filter(id => !save.loadout.includes(id) && save.skills[id] && save.skills[id].lv > 0);
  return { have, total: r.ids.length, missing, owned: r.ids.filter(id => save.skills[id] && save.skills[id].lv > 0).length };
}
// the skills that are good against this species, for the skill sheet chips
export const shinesVs = id => Object.keys(REC).filter(k => REC[k].ids.includes(id));
// swap the missing owned picks in, replacing the weakest skills that are not recommended; returns the new loadout or null
export function bestBuild(save, skin) {
  const f = recFit(save, skin); if (!f.missing.length) return null;
  const rec = recFor(skin).ids, out = save.loadout.slice();
  const outs = out.filter(id => !rec.includes(id)).sort((a, b) => skillPower(a, save.skills[a].lv) - skillPower(b, save.skills[b].lv));
  for (const id of f.missing) {
    if (out.length < LOADOUT_SIZE) { out.push(id); continue; }
    const v = outs.shift(); if (!v) break; out[out.indexOf(v)] = id;
  }
  return out.join() === save.loadout.join() ? null : out;
}
export function nextSkin(save) { return stageInfo(Math.min(MAX_STAGE, (save.cleared || 0) + 1)).skin; }

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
let lastSig = null, undoB = null;
// c: { save, persist, audio, icon, rerender, species (kit.SPECIES) }
export function renderRecStrip(host, c) {
  const s = c.save(); host.innerHTML = '';
  const undo = undoB && undoB.now === s.loadout.join() ? undoB.prev : null; if (!undo) undoB = null;
  const n = Math.min(MAX_STAGE, (s.cleared || 0) + 1), info = stageInfo(n), skin = info.skin, sp = (c.species && c.species[skin]) || null, r = recFor(skin), f = recFit(s, skin);
  const sig = s.loadout.join(), changed = lastSig !== null && lastSig !== sig; lastSig = sig;
  host.style.setProperty('--sc', sp ? sp.base : '#ff7eb6');
  const ics = r.ids.map(id => { const own = s.skills[id] && s.skills[id].lv > 0, eq = s.loadout.includes(id); return `<i class="rec-ic${eq ? ' eq' : own ? '' : ' lock'}" title="${wn(id)}">${c.icon(id)}${eq ? '<u>✓</u>' : ''}</i>`; }).join('');
  const verdict = f.have >= f.total ? 'Perfect fit' : f.have >= 2 ? 'Good fit' : f.have === 1 ? 'Could be better' : 'Not a fit yet';
  const wrap = el('div', 'recbar' + (f.have >= f.total ? ' full' : ''));
  wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', `Best build for stage ${n}, ${sp ? sp.name : skin}: ${r.ids.map(id => wn(id) + (s.loadout.includes(id) ? ' equipped' : s.skills[id] && s.skills[id].lv > 0 ? ' owned, not equipped' : ' not owned yet')).join(', ')}. ${r.why}. ${f.have} of ${f.total}, ${verdict}`);
  wrap.innerHTML = `<div class="rec-tx"><small>STAGE ${n} · ${(sp ? sp.name : skin).toUpperCase()}</small><b>Best build</b><span>${r.why}</span></div><div class="rec-ics" aria-hidden="true">${ics}</div>`;
  const pets = s.petEquip.filter(id => s.pets[id] && s.pets[id].star > 0).slice(0, 2);
  const mood = f.have >= 2 ? 'cheer' : 'shrug', say = f.have >= f.total ? 'Perfect!' : f.have >= 2 ? 'Nice!' : f.have === 1 ? 'Hmm...' : 'Uh oh';
  const ft = el('div', 'rec-ft');
  ft.appendChild(el('span', 'rec-v v' + Math.min(f.have, 3), `${f.have}/${f.total} · ${verdict}`));
  const best = bestBuild(s, skin);
  if (undo || best) {
    const b = el('button', 'rec-go', undo ? 'UNDO' : 'BRING THEM'); b.setAttribute('aria-label', undo ? 'Undo the recommended build' : 'Equip the recommended skills you own');
    b.onclick = () => { if (undo) { s.loadout = undo.slice(); undoB = null; } else { undoB = { prev: s.loadout.slice(), now: best.join() }; s.loadout = best; } c.persist(); c.audio.play(undo ? 'bringundo' : 'bringpack'); c.rerender(); };
    ft.appendChild(b);
  }
  if (pets.length) {
    const pw = el('div', 'rec-pets' + (changed ? ' ' + mood : ''), pets.map((id, i) => `<span class="rp" style="--d:${i * 0.12}s">${c.icon(id)}</span>`).join('') + (changed ? `<em>${say}</em>` : ''));
    pw.setAttribute('aria-hidden', 'true'); wrap.appendChild(pw);
  }
  wrap.appendChild(ft); host.appendChild(wrap);
  if (changed) setTimeout(() => { const p = host.querySelector('.rec-pets'); if (p) p.classList.remove('cheer', 'shrug'); }, 1800);
}

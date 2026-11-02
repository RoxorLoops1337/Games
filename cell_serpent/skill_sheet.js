// Cell Serpent: skill and pet detail sheets, mastery rank, hatch confetti and the sort/filter chips.
// Pure helpers read the formulas in sim.js (never change them); the DOM parts are small and self contained.
import { WEAPONS, PETS, PET_MAX_STAR, SKILL_MAX_LV, SKILL_MILES, skillMul, skillUpgradeCost, petCost, petCanUp, petUp, togglePet, toggleLoadout, levelSkill, unlockSkill, RARITIES, LOADOUT_SIZE, masteryList, claimMastery, rewardText } from './sim.js';
import { swapSheet, compareHTML, walkHTML } from './loadout_ux.js';
import { joyHTML } from './presets_ux.js';
import { PET_JOY_MAX } from './sim.js';

// what a skill does at the level a run starts with (weapon level 1), scaled by the permanent skill level
const BASE = {
  swab: { dmg: 0.2 * 1.25, cd: 4.2 - 0.3, area: 62 + 16, note: 'Paw prints on the snake' },
  daggers: { dmg: 1.2 * 1.3, cd: 0, area: 92 + 8, note: 'Chicks circling you' },
  tower: { dmg: 1.5 * 1.35, cd: 2.4 - 0.15, area: 170 + 18, note: 'A cow, a big moo' },
  dragon: { dmg: 2.0 * 1.4, cd: 1.8 - 0.1, area: 46, note: 'Homing doves' },
  needles: { dmg: 0.8 * 1.3, cd: 1.8 - 0.12, area: 0, note: '4 quills a sneeze' },
  stick: { dmg: 1.8 * 1.35, cd: 0, area: 0, note: 'A sweeping thump' },
  bubble: { dmg: 1.2 * 1.3, cd: 3.4 - 0.2, area: 70 + 10, note: 'Slows the snake' },
  satellite: { dmg: 1.8 * 1.3, cd: 3.6 - 0.25, area: 0, note: 'Picks the toughest' },
  maw: { dmg: 0.9 * 1.3, cd: 7.5 - 0.6, area: 110 + 12, note: 'Gobbles weak cells' },
};
const f1 = n => (Math.round(n * 100) / 100).toString();
export function skillPreview(id, lv) {
  const b = BASE[id]; if (!b) return null;
  const now = Math.max(1, lv), nxt = Math.min(SKILL_MAX_LV, now + 1);
  const rows = [{ k: 'Damage', a: f1(b.dmg * skillMul(now)), b: f1(b.dmg * skillMul(nxt)), gain: nxt > now }];
  if (b.cd) rows.push({ k: 'Cooldown', a: f1(b.cd) + 's', b: f1(b.cd) + 's', gain: false });
  if (b.area) rows.push({ k: 'Area', a: String(Math.round(b.area)), b: String(Math.round(b.area)), gain: false });
  return { rows, note: b.note, bonusPct: Math.round((skillMul(nxt) - skillMul(now)) * 100) };
}
// rough power per second at a level (damage over cooldown), to compare skills against each other
export function skillPower(id, lv) { const b = BASE[id]; return b ? b.dmg * skillMul(Math.max(1, lv)) / (b.cd || 1.2) : 0; }
export const RANK_NAMES = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Star'];
export function skillRank(save, id) {
  const v = (save.addict && save.addict.sk && save.addict.sk[id]) || 0, r = SKILL_MILES.filter(m => v >= m.at).length;
  const nx = SKILL_MILES.find(m => v < m.at);
  return { rank: r, name: RANK_NAMES[r], val: v, next: nx ? nx.at : 0 };
}
// cute one-liners; the pets' real effect is the star bonus line
export const PET_ABILITY = {
  kitten: 'Bats at the snake with a sleepy paw, then pounces for extra oomph.',
  puppy: 'Guards the duo and barks a big bark at big things.',
  piglet: 'Snuffles out the shiniest Beats from every cell.',
  lamb: 'Fluffs a woolly hug around you when things get scary.',
  hamster: 'Runs the tiny wheel and sparks lucky critical hits.',
  turtle: 'Keeps the rhythm calm so your skills come back sooner.',
};
export const PET_RARITY = { kitten: 0, puppy: 0, hamster: 1, turtle: 1, lamb: 2, piglet: 2 };
const pc = v => '+' + Math.round(v * 100) + '%';
const PET_STAT = { atk: v => pc(v) + ' hit power', vit: v => '+' + v + ' stage health', coin: v => pc(v) + ' Beats', guard: v => pc(v) + ' guard', crit: v => pc(v) + ' crit chance', cdn: v => pc(v) + ' faster skills' };
export const petBonusText = (p, star) => (PET_STAT[p.stat] || (() => ''))(+(p.per * star).toFixed(4));
export const petRarity = id => RARITIES[PET_RARITY[id] || 0];


// ---- NEW ribbons: what the player has already looked at lives in this browser only (not in the save)
const SEEN_KEY = 'cs_seen_new_v1';
function seenLoad(save) {
  try { const r = JSON.parse(localStorage.getItem(SEEN_KEY)); if (r && Array.isArray(r.s) && Array.isArray(r.p)) return r; } catch (e) { /* private mode */ }
  const r = { s: WEAPONS.filter(w => save.skills[w.id].lv > 0).map(w => w.id), p: PETS.filter(p => save.pets[p.id].star > 0).map(p => p.id) };   // first visit: everything owned counts as seen
  seenSave(r); return r;
}
function seenSave(r) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(r)); } catch (e) { /* ignore */ } }
export function isNewItem(save, kind, id) {
  const owned = kind === 's' ? save.skills[id].lv > 0 : save.pets[id].star > 0;
  return owned && !seenLoad(save)[kind].includes(id);
}
export function markSeen(save, kind, id) { const r = seenLoad(save); if (!r[kind].includes(id)) { r[kind].push(id); seenSave(r); } }
export const newRibbonHTML = '<i class="newrib">NEW</i>';

// ---- sparkline: damage multiplier per skill level, the current level glows
export function sparkHTML(lv) {
  const W = 300, H = 54, pad = 8, n = SKILL_MAX_LV, lo = skillMul(1), hi = skillMul(n);
  const x = i => pad + (W - 2 * pad) * (i - 1) / (n - 1), y = i => H - pad - (H - 2 * pad) * (skillMul(i) - lo) / (hi - lo);
  const pts = Array.from({ length: n }, (_, k) => x(k + 1).toFixed(1) + ',' + y(k + 1).toFixed(1));
  const cur = Math.max(1, Math.min(n, lv)), reach = pts.slice(0, cur).join(' ');
  const dots = Array.from({ length: n }, (_, k) => `<circle cx="${x(k + 1).toFixed(1)}" cy="${y(k + 1).toFixed(1)}" r="${k + 1 === cur ? 5.5 : 2.4}" class="${k + 1 === cur ? 'now' : k + 1 < cur ? 'past' : ''}"/>`).join('');
  return `<div class="dsspark"><div class="sphd"><span>DAMAGE BY LEVEL</span><b>x${skillMul(cur).toFixed(2)}${cur < n ? ' → x' + skillMul(cur + 1).toFixed(2) : ' max'}</b></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Damage multiplier from level 1 to ${n}, now level ${cur}"><polyline class="all" points="${pts.join(' ')}"/><polyline class="got" points="${reach}"/>${dots}</svg></div>`;
}

// ---- DOM
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
export function createSheets(c) {
  const { save, persist, audio, icon, rerender } = c;
  let host = null;
  function close(quick) { if (!host) return; const h = host; host = null; if (quick) h.remove(); else { h.classList.remove('on'); setTimeout(() => h.remove(), 180); } }
  function open(build) {
    close(true);
    host = el('div', 'dsheet-bg'); const sh = el('div', 'dsheet'); host.appendChild(sh);
    host.addEventListener('click', e => { if (e.target === host) { audio.play('click'); close(); } });
    document.body.appendChild(host); build(sh); requestAnimationFrame(() => host && host.classList.add('on'));
  }
  const closeBtn = () => { const b = el('button', 'dsx', '✕'); b.setAttribute('aria-label', 'Close'); b.onclick = () => { audio.play('click'); close(); }; return b; };
  const barHTML = (f, need) => `<div class="dsbar"><div class="bar"><i style="width:${Math.min(100, Math.round(f / need * 100))}%"></i></div><small>Fragments ${f} / ${need}</small></div>`;

  function skillSheet(id) {
    const w = WEAPONS.find(x => x.id === id); if (!w) return;
    open(sh => {
      const s = save(), k = s.skills[id], owned = k.lv > 0, maxed = k.lv >= SKILL_MAX_LV, eq = s.loadout.includes(id), rk = skillRank(s, id);
      const gated = !owned && (s.cleared || 0) < (w.stage || 0);
      sh.className = 'dsheet tier' + (w.tier || 0); sh.appendChild(closeBtn());
      const head = el('div', 'dshead', `<div class="dsic">${icon(id)}</div><div class="dsnm"><b>${w.name}</b><span>${owned ? 'Lv ' + k.lv + ' / ' + SKILL_MAX_LV : gated ? 'Clear stage ' + w.stage : 'Not owned yet'}</span></div>`);
      if (owned) head.querySelector('.dsnm').appendChild(el('em', 'rank r' + rk.rank, '🎖 ' + rk.name + (rk.next ? ' · ' + rk.val + '/' + rk.next : ' · max')));
      sh.appendChild(head); sh.appendChild(el('p', 'dsdesc', w.desc));
      const pv = skillPreview(id, owned ? k.lv : 1), showNext = owned && !maxed;
      const tb = el('div', 'dsrows');
      tb.appendChild(el('div', 'dshd', `<span></span><span>${owned ? 'NOW' : 'AT START'}</span><span>${showNext ? 'NEXT' : ''}</span>`));
      for (const r of pv.rows) tb.appendChild(el('div', 'dsrow', `<span>${r.k}</span><b>${r.a}</b><b class="${showNext && r.gain ? 'up' : ''}">${showNext ? (r.gain ? '▲ ' : '') + r.b : ''}</b>`));
      sh.appendChild(tb); sh.appendChild(el('div', 'dsnote', pv.note + (showNext ? ` · next level +${pv.bonusPct}% damage` : '')));
      if (owned) {
        markSeen(s, 's', id);
        sh.appendChild(el('div', '', sparkHTML(k.lv)));
        sh.appendChild(el('div', '', compareHTML(s, id)));
        const ms = masteryList(s).find(x => x.key === 'sk:' + id), rdy = ms && ms.ready >= 0, tgt = ms && (rdy ? ms.miles[ms.ready] : ms.next);
        if (ms) {
          const box = el('div', 'dsmast' + (rdy ? ' rdy' : ''), `<div class="mhd"><span>MASTERY</span><b>${tgt ? rewardText(tgt.reward) : 'all done'}</b></div><div class="bar"><i style="width:${tgt ? Math.min(100, Math.round(ms.val / tgt.at * 100)) : 100}%"></i></div><small>${rdy ? ms.val + ' damage mastery, goal reached' : ms.val + (tgt ? ' / ' + tgt.at : '') + ' damage mastery'}</small>`);
          if (rdy) { const cb = el('button', 'btn gold dsclaim', 'CLAIM ' + rewardText(tgt.reward)); cb.onclick = () => { if (claimMastery(s, ms.key, ms.ready)) { persist(); audio.unlock(); audio.play('levelup'); rerender(); skillSheet(id); } }; box.appendChild(cb); }
          sh.appendChild(box);
        }
      }
      let need = 0, can = false, label = '', act = () => false;
      if (!owned) { need = w.frag; can = k.frag >= need && !gated; label = gated ? 'CLEAR STAGE ' + w.stage : 'UNLOCK'; act = () => unlockSkill(s, id); }
      else if (!maxed) { need = skillUpgradeCost(k.lv).frag; can = k.frag >= need; label = can ? 'UPGRADE TO LV ' + (k.lv + 1) : 'UPGRADE'; act = () => levelSkill(s, id); }
      else label = 'MAX LEVEL';
      if (need) sh.insertAdjacentHTML('beforeend', barHTML(k.frag, need));
      const up = el('button', 'btn dsbig' + (can ? ' gold' : ''), label); up.disabled = !can;
      up.onclick = () => { if (act()) { persist(); audio.unlock(); audio.play('upgrade'); rerender(); skillSheet(id); } };
      sh.appendChild(up);
      if (owned) {
        const e = el('button', 'btn dseq alt', eq ? 'EQUIPPED, tap to remove' : 'EQUIP');
        e.disabled = eq && s.loadout.length <= 1;
        if (!eq && s.loadout.length >= LOADOUT_SIZE) e.textContent = 'SWAP INTO LOADOUT';
        e.onclick = () => { if (!eq && s.loadout.length >= LOADOUT_SIZE) { audio.play('click'); close(true); swapSheet({ save, persist, audio, icon, rerender }, id); return; } if (toggleLoadout(s, id)) { persist(); audio.play('click'); rerender(); skillSheet(id); } };
        sh.appendChild(e);
      }
    });
  }

  function petSheet(id) {
    const p = PETS.find(x => x.id === id); if (!p) return;
    open(sh => {
      const s = save(), k = s.pets[id], owned = k.star > 0, maxed = k.star >= PET_MAX_STAR, eq = s.petEquip.includes(id), need = maxed ? 0 : petCost(k.star), rar = petRarity(id);
      sh.className = 'dsheet pet'; sh.style.setProperty('--rc', rar.color); sh.appendChild(closeBtn());
      sh.appendChild(el('div', 'dshead', `<div class="dsic">${icon(id)}</div><div class="dsnm"><b>${p.name}</b><span style="color:${rar.color}">${rar.name} friend · ${owned ? (eq ? 'walking with you' : 'at home') : 'not met yet'}</span></div>`));
      sh.appendChild(el('p', 'dsdesc', PET_ABILITY[id] || p.flavor));
      if (owned) { const wk = el('div', '', walkHTML(icon(id), eq, rar.color)); if (eq && (k.joy || 0) >= PET_JOY_MAX) wk.firstChild.insertAdjacentHTML('beforeend', '<span class="whrt h1">♥</span><span class="whrt h2">♥</span><span class="whrt h3">♥</span>'); sh.appendChild(wk); }
      if (owned) sh.appendChild(el('div', 'dsjoy', joyHTML(k)));
      sh.appendChild(el('div', 'dsstars', Array.from({ length: PET_MAX_STAR }, (_, n) => `<i class="star${n < k.star ? ' on' : ''}">★</i>`).join('')));
      sh.appendChild(el('div', 'dsrows', `<div class="dsrow one"><span>Star bonus</span><b>${owned ? petBonusText(p, k.star) : 'none yet'}</b></div>` + (maxed ? '' : `<div class="dsrow one"><span>Next star</span><b class="up">▲ ${petBonusText(p, k.star + 1)}</b></div>`)));
      if (owned) markSeen(s, 'p', id);
      sh.appendChild(el('div', 'dsladder', Array.from({ length: PET_MAX_STAR }, (_, n) => `<span class="${n < k.star ? 'on' : n === k.star ? 'nx' : ''}"><i>${n + 1}★</i><b>${petBonusText(p, n + 1).split(' ')[0]}</b></span>`).join('')));
      sh.appendChild(el('div', 'dsnote', 'Stars count even when the pet stays home.'));
      if (need) sh.insertAdjacentHTML('beforeend', barHTML(k.frag, need));
      const can = petCanUp(s, id), up = el('button', 'btn dsbig' + (can ? ' gold' : ''), maxed ? 'FULL STARS' : owned ? 'MORE STARS' : 'WELCOME HOME'); up.disabled = !can;
      up.onclick = () => { if (petUp(s, id)) { persist(); audio.unlock(); audio.play('upgrade'); rerender(); petSheet(id); } };
      sh.appendChild(up);
      if (owned) { const e = el('button', 'btn dseq alt', eq ? 'BENCH' : 'WALK WITH ME'); e.onclick = () => { if (togglePet(s, id)) { persist(); audio.play('click'); rerender(); petSheet(id); } }; sh.appendChild(e); }
    });
  }
  return { skillSheet, petSheet, close };
}

// ---- sort and filter chips
export function chipRow(opts, cur, onPick, counts) {
  const row = el('div', 'fchips'); row.setAttribute('role', 'group');
  for (const o of opts) {
    const b = el('button', 'fchip' + (o === cur ? ' on' : ''), o + (counts && counts[o] ? ` <i>${counts[o]}</i>` : '')); b.setAttribute('aria-pressed', o === cur ? 'true' : 'false');
    b.onclick = () => onPick(o); row.appendChild(b);
  }
  return row;
}

// ---- hatch reveal: confetti and sparkles whose strength follows the rarity tier
export function hatchBurst(parent, color, tier, reduce) {
  if (reduce) return;
  const box = el('div', 'hburst'); parent.appendChild(box);
  const n = 18 + tier * 14, cols = [color, '#ffe14a', '#ff9ad6', '#4fd8f0', '#9dff6d', '#fff'];
  for (let i = 0; i < n; i++) {
    const p = el('i', i % 3 === 0 ? 'sp' : 'cf'), a = Math.random() * Math.PI * 2, d = 70 + Math.random() * (110 + tier * 30);
    p.style.cssText = `--dx:${Math.cos(a) * d | 0}px;--dy:${(Math.sin(a) * d - 30) | 0}px;--r:${(Math.random() * 720 - 360) | 0}deg;background:${cols[i % cols.length]};animation-delay:${(Math.random() * 0.25).toFixed(2)}s`;
    box.appendChild(p);
  }
  setTimeout(() => box.remove(), 2200);
}

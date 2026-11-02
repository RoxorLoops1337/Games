// Cell Serpent, batch 14 (agent b): onboarding polish. Pure helpers (testable headless) plus tiny DOM bits:
//  - statTeaser: "Next stat level opens at stage X" for the Stats tab, shown when a stat sits at the cap
//  - lockedLabel: the wording of the grey padlock tab (short on a crowded bar, "Clear stage N" on a roomy one)
//  - glow/unglow: a pulsing ring on whatever a hint card points at
//  - welcomeBudget: how much of the stat shop the Welcome Chest Beats could buy (pacing check, no balance change)
import { META, metaCost, statCap, statCapStage } from './sim.js';

// The stage that raises the stat cap above what the player already owns, or null when nothing is held back.
export function statTeaser(save) {
  if (!save) return null;
  const cap = statCap(save), cleared = (save.cleared || 0) | 0;
  let held = null;
  for (const d of META) {
    if (d.max <= 1) continue;
    const l = (save.meta && save.meta[d.id]) || 0;
    if (l >= d.max || l < cap) continue;
    held = d; break;
  }
  if (!held) return null;
  let lvl = cap + 1; while (statCapStage(lvl) <= cleared) lvl++;
  const stage = statCapStage(lvl);
  return { stage, lvl, text: 'Next stat level opens at stage ' + stage, need: Math.max(1, stage - cleared) };
}

export function lockedLabel(need, roomy) { return roomy ? 'Clear stage ' + need : 'Stage ' + need; }

// Beats needed to buy every non-Encore stat up to the current cap, and what a gift of `beats` covers of that (0..1+).
export function welcomeBudget(save, beats = 3000) {
  const cap = statCap(save); let total = 0;
  for (const d of META) { if (d.max <= 1) continue; const have = (save.meta && save.meta[d.id]) || 0; for (let l = have; l < Math.min(cap, d.max); l++) total += metaCost(d, l); }
  return { total, cover: total ? beats / total : 1, cap };
}

let glowEl = null;
export function glow(el) { if (glowEl === el) return; unglow(); if (el && el.classList) { glowEl = el; el.classList.add('ukglow'); } }
export function unglow() { if (glowEl) { glowEl.classList.remove('ukglow'); glowEl = null; } }

// the Stats tab line (one small chip above the stat cards)
export function statTeaserEl(save) {
  const t = statTeaser(save); if (!t || typeof document === 'undefined') return null;
  const el = document.createElement('div'); el.className = 'stteaser b14b';
  el.innerHTML = '<b aria-hidden="true">\u{1F512}</b><span></span>'; el.lastChild.textContent = t.text;
  return el;
}

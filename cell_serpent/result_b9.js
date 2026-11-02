// Batch 9 (agent 11): pause menu "build so far" chips with the real in-run levels, the stage line under PAUSED, and the
// reward sum for CLAIM ALL (so the whole stack of mastery rewards flies to the hub pills). Pure helpers, nothing per frame.

// the weapons a run really holds, loadout order first, then anything picked up from yellow cells; lv is the in-run level
export function pauseBuild(weap, loadout) {
  const out = [], seen = new Set(), w = weap || {};
  for (const id of loadout || []) if (!seen.has(id)) { seen.add(id); out.push({ id, lv: w[id] ? w[id].lv | 0 : 0 }); }
  for (const id of Object.keys(w)) if (w[id] && w[id].lv > 0 && !seen.has(id)) { seen.add(id); out.push({ id, lv: w[id].lv }); }
  return out;
}
// one chip: icon + level, hot from level 3 and gold from level 5
export function buildChipHTML(it, iconHTML) {
  if (it.lv <= 0) return `<span class="pb9 t0" title="Not picked yet">${iconHTML}</span>`;
  const tier = it.lv >= 5 ? ' t5' : it.lv >= 3 ? ' t3' : '';
  return `<span class="pb9${tier}" title="Level ${it.lv}">${iconHTML}LV ${it.lv}</span>`;
}
export function buildLine(list) {
  const ups = list.reduce((a, it) => a + Math.max(0, it.lv - 1), 0);
  return ups > 0 ? `${ups} upgrade${ups === 1 ? '' : 's'} picked` : 'Pick yellow cells to upgrade';
}
// "Stage 8: Mighty Moxies. The snake waits."
export function pauseSub(stage, name) { return name ? `Stage ${stage}: ${name}. The snake waits.` : 'Take a breath. The snake waits.'; }

// the sum of every mastery reward that CLAIM ALL would pay out right now (no mutation)
export function readyMasteryReward(list, claimed) {
  const sum = { beats: 0, sparkles: 0, eggs: 0, energy: 0 };
  for (const m of list || []) m.miles.forEach((ms, i) => {
    if (m.val >= ms.at && !(claimed && claimed[m.key + ':' + i])) for (const k of Object.keys(sum)) sum[k] += (ms.reward && ms.reward[k]) | 0;
  });
  return sum;
}
export const hasReward = rw => !!rw && (rw.beats > 0 || rw.sparkles > 0 || rw.eggs > 0 || rw.energy > 0);

// the BRING THEM button of the species fun fact: only when an owned, recommended skill is not in the loadout yet
export const bringBtnHTML = can => (can ? '<button class="ff-go9" type="button" data-bring="1">BRING THEM</button>' : '');

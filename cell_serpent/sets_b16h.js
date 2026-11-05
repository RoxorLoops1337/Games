// Cell Serpent batch 16 (h): pet pair bonuses, gear Encore bonus and a short story per pet.
// Pure data and string builders, no imports (sim.js imports this file, so it must not import sim.js).
// All bonuses are small and capped: they are sidegrades, never a big power jump.

// ---- pet pairs: both friends at 3 stars wakes the pair, both at 5 stars adds the encore half
export const PET_SET_STARS = [3, 5];
export const PET_SETS = [
  { id: 'farm', name: 'Barnyard Backing Band', pets: ['piglet', 'lamb'], stat: 'coin', val: 0.03, line: 'Snuffle and baa in harmony.' },
  { id: 'whisk', name: 'Whisker Wheel Duo', pets: ['kitten', 'hamster'], stat: 'crit', val: 0.008, line: 'Pounce on the beat, spin on the off-beat.' },
  { id: 'steady', name: 'Steady Heartbeat', pets: ['puppy', 'turtle'], stat: 'vit', val: 12, line: 'One barks the count in, one keeps it slow.' },
];
const TEXT = {
  coin: v => `+${+(v * 100).toFixed(1)}% Beats`, crit: v => `+${+(v * 100).toFixed(1)}% Pitch`, vit: v => `snake ${+(v / 12 * 2).toFixed(0)}% slower`,
  atk: v => `+${+(v * 100).toFixed(1)}% Volume`, guard: v => `snake ${+(v * 50).toFixed(1)}% slower`,
};
export const setText = (stat, v) => (TEXT[stat] ? TEXT[stat](v) : '');

// 0 = asleep, 1 = awake (both at 3 stars), 2 = encore (both at 5 stars)
export function petSetLevel(set, stars) {
  const lo = Math.min(...set.pets.map(id => (stars && stars[id]) || 0));
  return lo >= PET_SET_STARS[1] ? 2 : lo >= PET_SET_STARS[0] ? 1 : 0;
}
export const petSetValue = (set, level) => set.val * level;   // 1x awake, 2x encore
export function petSetBonus(stars) {
  const b = {};
  for (const s of PET_SETS) { const lv = petSetLevel(s, stars); if (lv) b[s.stat] = (b[s.stat] || 0) + petSetValue(s, lv); }
  return b;
}
export function petSetState(stars) {
  return PET_SETS.map(s => {
    const lv = petSetLevel(s, stars), mine = s.pets.map(id => (stars && stars[id]) || 0);
    const goal = PET_SET_STARS[Math.min(lv, 1)];
    const missing = s.pets.filter((id, i) => mine[i] < goal);
    return { ...s, level: lv, stars: mine, goal, missing, maxed: lv >= 2, now: lv ? petSetValue(s, lv) : 0 };
  });
}
// pair bonuses that woke up (or grew) between two star snapshots
export function petSetWoke(before, after) {
  return PET_SETS.filter(s => petSetLevel(s, after) > petSetLevel(s, before));
}

// ---- gear Encore: every keepsake of a set at level 5 adds half of the set bonus again
export const ENCORE_LV = 5;
export const encoreValue = setVal => setVal * 0.5;
export function encoreLine(setVal, stat, minLv) {
  const txt = setText(stat, encoreValue(setVal));
  return minLv >= ENCORE_LV ? `ENCORE: ${txt}` : `Encore, all at Lv ${ENCORE_LV}: ${txt}`;
}
export const GEAR_SET_STORY = {
  stage: 'Every tour starts with a squeaky mallet.',
  cozy: 'The dressing room smells of oat milk and warm scarves.',
  snack: 'Nobody sings well on an empty table.',
};

// ---- stories: three short chapters per pet, told at 1, 3 and 5 stars
export const STORY_STARS = [1, 3, 5];
export const PET_STORIES = {
  kitten: ['Found asleep in the amp case, purring in key.', 'Learned to tap the kick drum with one paw.', 'Now headlines the encore with a pounce on the last beat.'],
  puppy: ['Followed the tour van for three villages.', 'Barks a steady count-in before every chorus.', 'Never misses a soundcheck, always first at the stage door.'],
  piglet: ['Snuffled out a dropped carrot behind the speakers.', 'Keeps a tiny tip jar and guards it proudly.', 'Her oink is the lowest note on the whole tour.'],
  lamb: ['Wandered in for the warm light and stayed for the harmonies.', 'Knits scarves for the backing singers out of spare wool.', 'Her baa holds the long note longer than anyone.'],
  hamster: ['Lives in a mic bag and runs the night shift.', 'Built a wheel that spins in time with the drum loop.', 'Has run once around the world without leaving the stage.'],
  turtle: ['Arrived last, arrived exactly on the downbeat.', 'Taught the band that a rest is also a note.', 'Carries the whole slow groove on its shell.'],
};
export function storyState(id, star) {
  return (PET_STORIES[id] || []).map((t, i) => ({ text: t, need: STORY_STARS[i], open: star >= STORY_STARS[i] }));
}
export const storyHTML = (id, star) => {
  const rows = storyState(id, star).map((c, i) => `<li class="${c.open ? 'on' : ''}"><i>${i + 1}</i><span>${c.open ? c.text : 'Chapter ' + (i + 1) + ' opens at ' + c.need + ' star' + (c.need > 1 ? 's' : '')}</span></li>`).join('');
  return `<div class="shstory"><b>STORY</b><ol>${rows}</ol></div>`;
};

// ---- Pets tab strip: one chip per pair (tap opens the friend who still needs stars)
export function petSetsStripHTML(stars, iconOf) {
  return petSetState(stars).map(s => {
    const st = s.level ? (s.maxed ? 'ENCORE' : 'AWAKE') : 'ASLEEP';
    const need = s.maxed ? setText(s.stat, s.now) : s.level ? 'Both 5 stars: ' + setText(s.stat, s.val * 2) : 'Both ' + s.goal + ' stars: ' + setText(s.stat, s.val);
    const next = s.missing.length ? s.missing[0] : s.pets[0];
    return `<button type="button" class="pschip${s.level ? ' on' : ''}${s.maxed ? ' max' : ''}" data-pet="${next}" aria-label="${s.name}, ${st.toLowerCase()}. ${need}">` +
      `<span class="psp">${s.pets.map((id, i) => `<span class="psi${s.stars[i] >= s.goal ? ' ok' : ''}">${iconOf(id)}</span>`).join('<i class="psj">+</i>')}</span>` +
      `<span class="psn"><b>${s.name}</b><small>${need}</small></span><em>${st}</em></button>`;
  }).join('');
}
// the pair card shown inside one pet sheet
export function petSetCardHTML(id, stars, iconOf) {
  const s = petSetState(stars).find(q => q.pets.includes(id)); if (!s) return '';
  const other = s.pets.find(q => q !== id), st = s.level ? (s.maxed ? 'ENCORE' : 'AWAKE') : 'ASLEEP';
  const line = s.maxed ? 'Both at full stars: ' + setText(s.stat, s.now) : s.level ? 'Both 5 stars adds ' + setText(s.stat, s.val) + ' more' : 'Both ' + PET_SET_STARS[0] + ' stars: ' + setText(s.stat, s.val);
  return `<div class="pscard${s.level ? ' on' : ''}"><span class="psp">${iconOf(id)}<i class="psj">+</i>${iconOf(other)}</span><span class="psn"><b>${s.name}</b><small>${s.line}</small><small>${line}</small></span><em>${st}</em></div>`;
}

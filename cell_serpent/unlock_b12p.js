// Cell Serpent, batch 12 (agent p): progressive disclosure of the hub. A fresh account sees only the Battle tab
// with the stage preview and START; everything else arrives as stages get cleared, one friendly thing every
// stage or two in the first 25 stages. Pure: no imports, no DOM, all of it testable headless.
//
// The rule is save.cleared (stages cleared). `save.unlocked = { legacy, seen }`:
//   legacy 1  an account saved before this change: it keeps EVERYTHING (set by sanitizeSave, never by a new game)
//   seen      hint ids the player already tapped away, so each hint shows once
// Tests can open everything with setUnlockAll(true) (the CS.unlockAll hook and the ?unlock=all URL param).

export const TABS = ['Shop', 'Stats', 'Battle', 'Skills', 'Pets', 'Gear'];   // the order of the tab bar (also the swipe order)

// step = number of cleared stages that opens it. kind: tab | chip (Battle side chips) | panel (banners, strips, sections) | misc.
// hint = the one friendly line shown once when it arrives (tab hints point at the tab); inTab = the line on the first visit
// inside the new tab (points at its first useful button).
export const UNLOCKS = [
  // ---- the first screen: always there
  { id: 'battle', step: 0, kind: 'tab', tab: 'Battle', label: 'Battle' },
  { id: 'energy', step: 0, kind: 'misc', label: 'Voice pill' },
  { id: 'beats', step: 0, kind: 'misc', label: 'Beats pill' },
  { id: 'preview', step: 0, kind: 'misc', label: 'stage preview and START' },
  // ---- stage 1: the music skills
  { id: 'skills', step: 1, kind: 'tab', tab: 'Skills', label: 'Skills', hint: 'New: Skills! Here you can equip your music skills.', inTab: 'Tap a skill to see what it does' },
  { id: 'loadout', step: 1, kind: 'panel', label: 'Loadout row and EDIT' },
  { id: 'sparkles', step: 1, kind: 'misc', label: 'Sparkles pill' },
  // ---- stage 2: stats
  { id: 'stats', step: 2, kind: 'tab', tab: 'Stats', label: 'Stats', hint: 'New: Stats! Here you can upgrade your stats: pay Beats to get stronger.', inTab: 'Tap a price to get stronger' },
  { id: 'power', step: 2, kind: 'panel', label: 'Level and Power line, power check' },
  { id: 'bestbar', step: 2, kind: 'panel', label: 'Best progress bar' },
  // ---- stage 3: pets
  { id: 'pets', step: 3, kind: 'tab', tab: 'Pets', label: 'Pets', hint: 'New: Pets! Little friends who sing along.', inTab: 'Tap the egg' },
  { id: 'overview', step: 3, kind: 'panel', label: 'Stage overview' },
  { id: 'gapfix', step: 3, kind: 'panel', label: 'Power gap shortcut' },
  // ---- stage 4: the first daily thing
  { id: 'sign', step: 4, kind: 'chip', label: 'Sign in', hint: 'New: Sign in! Visit every day for a gift.', el: 'sign' },
  // ---- stage 5: the shop (or at 4 with Sparkles to spend)
  { id: 'shop', step: 5, kind: 'tab', tab: 'Shop', label: 'Shop', alt: { step: 4, sparkles: 50 }, hint: 'New: Shop! Treats and surprises, some are free.', inTab: 'Grab a treat' },
  { id: 'energyplus', step: 5, kind: 'misc', label: 'Voice + button' },
  { id: 'bestiary', step: 5, kind: 'chip', label: 'Preview (snake book)', el: 'bestiary' },
  // ---- stage 6
  { id: 'gigs', step: 6, kind: 'panel', label: 'Daily gigs and the claim row', hint: 'New: Daily Gigs! Little jobs that pay Beats.', el: 'gigs' },
  { id: 'rewardfilter', step: 6, kind: 'panel', label: 'Rewards filter on the stage chips' },
  // ---- stage 7
  { id: 'fund', step: 7, kind: 'chip', label: 'Fan Fund', hint: 'New: Fan Fund! Clear stages to fill it up.', el: 'fund' },
  { id: 'worldstrip', step: 7, kind: 'panel', label: 'World strip' },
  { id: 'funfact', step: 7, kind: 'misc', label: 'BRING THEM fun fact' },
  // ---- stage 8
  { id: 'gear', step: 8, kind: 'tab', tab: 'Gear', label: 'Gear', hint: 'New: Gear! Collect keepsakes for bonus power.', inTab: 'Tap a keepsake' },
  { id: 'swap', step: 8, kind: 'chip', label: 'Fragment swap', el: 'swap' },
  // ---- stage 9
  { id: 'event', step: 9, kind: 'chip', label: 'Harvest / event', hint: 'New: the event! Join in for party rewards.', el: 'event' },
  { id: 'presets', step: 9, kind: 'panel', label: 'Loadout presets' },
  // ---- stage 10
  { id: 'hard', step: 10, kind: 'panel', label: 'Hard mode toggle', hint: 'New: Hard mode! Replay a cleared stage for more.', el: 'hard' },
  { id: 'records', step: 10, kind: 'panel', label: 'Personal bests' },
  { id: 'pig', step: 10, kind: 'panel', label: 'Piggy Bank Parade' },
  // ---- stage 11 to 16: the daily layers
  { id: 'quests', step: 11, kind: 'panel', label: 'Daily Quests strip', hint: 'New: Daily Quests! Finish three for a chest.', el: 'quests' },
  { id: 'wheel', step: 12, kind: 'chip', label: 'Goals and Lucky Spin', hint: 'New: Lucky Spin! One free spin a day.', el: 'wheel' },
  { id: 'nextreward', step: 12, kind: 'panel', label: 'Next Reward banner' },
  { id: 'ribbons', step: 12, kind: 'misc', label: 'Ribbons pill' },
  { id: 'runlog', step: 12, kind: 'panel', label: 'Recent gigs log' },
  { id: 'backstage', step: 13, kind: 'chip', label: 'Backstage chest', hint: 'New: Backstage! Fans leave Beats while you are away.', el: 'backstage' },
  { id: 'invasion', step: 13, kind: 'panel', label: 'Serpent invasion gig' },
  { id: 'recstrip', step: 13, kind: 'panel', label: 'Suggested builds' },
  { id: 'trophies', step: 14, kind: 'chip', label: 'Trophies and achievements', hint: 'New: Trophies! Collect them all.', el: 'trophies' },
  { id: 'achievements', step: 14, kind: 'panel', label: 'Achievements pill' },
  { id: 'stickers', step: 15, kind: 'panel', label: 'Sticker book', hint: 'New: Sticker Book! Look in Stats.', el: 'stickers' },
  { id: 'wardrobe', step: 15, kind: 'chip', label: 'Wardrobe', el: 'wardrobe' },
  { id: 'pass', step: 16, kind: 'chip', label: 'Pass', el: 'pass' },
  // ---- stage 18 to 25: the long game
  { id: 'season', step: 18, kind: 'panel', label: 'Season stamps', hint: 'New: Season! Collect a stamp every day.', el: 'season' },
  { id: 'badges', step: 18, kind: 'panel', label: 'Weekly challenge, badges' },
  { id: 'streak', step: 18, kind: 'panel', label: 'Quest chest streak' },
  { id: 'book', step: 20, kind: 'panel', label: 'Collection book' },
  { id: 'records_gold', step: 25, kind: 'panel', label: 'Gold Records (mastery)' },
];

const BY_ID = Object.fromEntries(UNLOCKS.map(u => [u.id, u]));
export const unlockInfo = id => BY_ID[id] || null;
export const FEATURE_IDS = UNLOCKS.map(u => u.id);
export const TAB_UNLOCK = Object.fromEntries(UNLOCKS.filter(u => u.kind === 'tab').map(u => [u.tab, u.id]));

let ALL = false;
export const setUnlockAll = v => { ALL = !!v; };
export const unlockAllOn = () => ALL;

const num = v => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
export const isLegacy = save => !!(save && save.unlocked && save.unlocked.legacy);

// the cleared-stage count that opens a feature for this save (the Shop opens one stage earlier when there are Sparkles to spend)
export function stepFor(id, save) {
  const u = BY_ID[id]; if (!u) return Infinity;
  if (u.alt && save && num(save.sparkles) >= u.alt.sparkles) return Math.min(u.step, u.alt.step);
  return u.step;
}
export function isUnlocked(id, save) {
  const u = BY_ID[id]; if (!u) return true;   // unknown ids are never hidden
  if (ALL || u.step === 0 || !save || isLegacy(save)) return true;
  return num(save.cleared) >= stepFor(id, save);
}
export const isTabUnlocked = (tab, save) => !TAB_UNLOCK[tab] || isUnlocked(TAB_UNLOCK[tab], save);
export const visibleTabs = save => TABS.filter(t => isTabUnlocked(t, save));
// the one teaser: the locked tab that opens first (ties go to the bar order), with the stage count it needs
export function nextLockedTab(save) {
  if (ALL || isLegacy(save)) return null;
  let best = null;
  for (const t of TABS) { if (isTabUnlocked(t, save)) continue; const need = stepFor(TAB_UNLOCK[t], save); if (!best || need < best.need) best = { tab: t, need, label: BY_ID[TAB_UNLOCK[t]].label }; }
  return best;
}
export const unlockedIds = save => FEATURE_IDS.filter(id => isUnlocked(id, save));

// ---- the hint queue: what arrived and was not shown yet, in the order it arrived
export const seenKey = (kind, id) => (kind === 'in' ? 'in_' : 'h_') + id;
export const isSeen = (save, key) => !!(save && save.unlocked && save.unlocked.seen && save.unlocked.seen[key]);
export function markSeen(save, key) {
  if (!save) return false;
  if (!save.unlocked || typeof save.unlocked !== 'object') save.unlocked = { legacy: 0, seen: {} };
  if (!save.unlocked.seen) save.unlocked.seen = {};
  if (save.unlocked.seen[key]) return false;
  save.unlocked.seen[key] = 1; return true;
}
// queue entries: { key, id, kind: 'new' | 'in', text, tab (the tab it lives in), el (a Battle element key) }
export function pendingHints(save) {
  if (ALL || !save || isLegacy(save)) return [];
  const out = [];
  for (const u of UNLOCKS) {
    if (!u.hint || !isUnlocked(u.id, save)) continue;
    const k = seenKey('new', u.id);
    if (!isSeen(save, k)) out.push({ key: k, id: u.id, kind: 'new', text: u.hint, tab: u.kind === 'tab' ? u.tab : (u.id === 'stickers' ? 'Stats' : 'Battle'), el: u.el || '', step: stepFor(u.id, save) });
  }
  out.sort((a, b) => a.step - b.step);
  return out;
}
// the line for the first visit inside a tab (only after the tab hint itself was seen or the tab was opened)
export function inTabHint(save, tab) {
  if (ALL || !save || isLegacy(save)) return null;
  const id = TAB_UNLOCK[tab], u = id && BY_ID[id]; if (!u || !u.inTab || !isUnlocked(id, save)) return null;
  const k = seenKey('in', id);
  return isSeen(save, k) ? null : { key: k, id, kind: 'in', text: u.inTab, tab };
}

// ---- save sanitising (sim.js calls this; no other module is imported here)
export const defaultUnlocked = () => ({ legacy: 0, seen: {} });
export function sanitizeUnlocked(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { legacy: 1, seen: {} };   // a save from before this change keeps everything
  const seen = {};
  if (raw.seen && typeof raw.seen === 'object' && !Array.isArray(raw.seen)) {
    let n = 0;
    for (const k of Object.keys(raw.seen)) { if (n >= 120) break; if (raw.seen[k] && /^[a-z0-9_]{1,28}$/.test(k)) { seen[k] = 1; n++; } }
  }
  return { legacy: raw.legacy ? 1 : 0, seen };
}

// ---- tab bar layout (pure): with up to three buttons they keep a fixed size and sit in the middle
export const FEW_MAX = 3, FEW_W = 112, MIN_TARGET = 44;
export function tabLayout(n, vw) {
  const count = Math.max(1, n | 0), few = count <= FEW_MAX;
  const w = few ? Math.min(FEW_W, Math.floor(vw / count)) : Math.floor(vw / count);
  return { few, w, left: few ? Math.round((vw - w * count) / 2) : 0, ok: w >= MIN_TARGET };
}

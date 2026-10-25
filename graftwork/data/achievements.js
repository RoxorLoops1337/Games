// Achievements. Evaluated by engine/meta.js recordRunEnd AFTER the meta stats for the finished run are updated.
// check(run, ctx, meta) -> bool. ctx = { outcome, won, loop, hero, asc, daily, abandoned, floors, strain, tithed, budget,
//   graftTotal, maxOnCard, junk, deckSize, gold, relics }.
// progress?(meta) -> [n, max] feeds the codex. secret achievements show as "???" until earned.
// Voice: clinical, dry, no em dashes, no exclamation marks.
const HEROES3 = ['marrow', 'wick', 'odile'];
const thr = (id, name, text, stat, max, extra = {}) => ({
  id, name, text, ...extra,
  check: (run, ctx, meta) => ((meta.stats && meta.stats[stat]) || 0) >= max,
  progress: (meta) => [Math.min(max, (meta.stats && meta.stats[stat]) || 0), max],
});
const winAscAll = (n) => (meta) => HEROES3.every((h) => ((meta.winAsc && meta.winAsc[h]) || 0) >= n && ((meta.wins && meta.wins[h]) || 0) > 0);
const winAscCount = (n) => (meta) => HEROES3.filter((h) => meta.wins && meta.wins[h] > 0 && (meta.winAsc[h] || 0) >= n).length;

export const ACHIEVEMENTS = [
  // ---- progress
  { id: 'intake', name: 'Intake', text: 'Finish a run, however it ends.', check: (r, c, m) => m.stats.wins + m.stats.deaths >= 1 },
  { id: 'discharged', name: 'Discharged', text: 'Win a run.', check: (r, c) => c.won },
  { id: 'surgeon_general', name: 'Surgeon General', text: 'Win with all three heroes.', check: (r, c, m) => HEROES3.every((h) => (m.wins[h] || 0) > 0), progress: (m) => [HEROES3.filter((h) => (m.wins[h] || 0) > 0).length, 3] },
  { id: 'scholar', name: 'Scholar', text: 'Discover 100 codex entries.', check: (r, c) => c.codex >= 100, progress: (m) => { let n = 0; for (const k of Object.keys(m.seen || {})) n += Object.keys(m.seen[k] || {}).length; return [Math.min(100, n), 100]; } },
  // ---- build rules
  { id: 'untouched', name: 'Untouched', text: 'Win without sewing a single graft.', check: (r, c) => c.won && r.stats.grafts === 0 },
  { id: 'overheated', name: 'Overheated', text: 'Win with Strain of 4 or more at the end.', check: (r, c) => c.won && c.strain >= 4 },
  { id: 'monolith', name: 'Monolith', text: 'End a run with 3 grafts on one card.', check: (r, c) => c.maxOnCard >= 3 },
  { id: 'patchwork', name: 'Patchwork', text: 'Hold 10 or more grafts in your deck at once.', check: (r, c) => c.graftTotal >= 10 },
  { id: 'clean_hands', name: 'Clean Hands', text: 'Win without a single Shatter.', check: (r, c) => c.won && r.stats.shatters === 0 },
  { id: 'gambler', name: 'Gambler', text: 'Survive 3 Shatters in one run and still win.', check: (r, c) => c.won && r.stats.shatters >= 3 },
  { id: 'minimalist', name: 'Minimalist', text: 'Win after skipping 6 or more graft offers.', check: (r, c) => c.won && r.stats.skips >= 6 },
  { id: 'collector', name: 'Collector', text: 'Finish a run as Odile with 500 gold or more.', check: (r, c) => c.hero === 'odile' && c.gold >= 500 },
  { id: 'hypochondriac', name: 'Hypochondriac', text: 'End a run with a Budget of 12 or more.', check: (r, c) => c.budget >= 12 },
  { id: 'sharpshooter', name: 'Sharpshooter', text: 'Win while taking 100 damage or less in total.', check: (r, c) => c.won && r.stats.damageTaken <= 100 },
  { id: 'tax_season', name: 'Tax Season', text: 'Win with 3 or more cards under Tithe.', check: (r, c) => c.won && c.tithed >= 3 },
  { id: 'unaccompanied', name: 'Unaccompanied', text: 'Win holding no relic but your starting kit.', check: (r, c) => c.won && c.relics <= 1 },
  { id: 'thin_chart', name: 'Thin Chart', text: 'Win with 10 cards or fewer in the deck.', check: (r, c) => c.won && c.deckSize <= 10 },
  // ---- ascension
  { id: 'asc1', name: 'Second Opinion', text: 'Win a run at Ascension 1 or higher.', check: (r, c) => c.won && c.asc >= 1 },
  { id: 'asc5_all', name: 'Triple Threat', text: 'Win at Ascension 5 with each hero.', check: (r, c, m) => winAscAll(5)(m), progress: (m) => [winAscCount(5)(m), 3] },
  { id: 'asc10', name: 'Terminal Case', text: 'Win at Ascension 10.', check: (r, c) => c.won && c.asc >= 10 },
  // ---- modes
  { id: 'relapse', name: 'Relapse', text: 'Start an endless loop.', check: (r, c) => c.loop >= 1 },
  { id: 'chronic', name: 'Chronic', text: 'Reach loop 3 in endless.', check: (r, c, m) => c.loop >= 3 || m.stats.bestLoop >= 3, progress: (m) => [Math.min(3, m.stats.bestLoop || 0), 3] },
  { id: 'appointment_kept', name: 'Appointment Kept', text: 'Win a daily run.', check: (r, c) => c.won && !!c.daily },
  // ---- lifetime
  thr('frequent_patient', 'Frequent Patient', 'Start 10 runs.', 'runs', 10),
  thr('chief_of_staff', 'Chief of Staff', 'Win 10 runs.', 'wins', 10),
  thr('stitcher', 'Stitcher', 'Sew 100 grafts across all runs.', 'grafts', 100),
  thr('elite_clinic', 'Elite Clinic', 'Defeat 25 elites across all runs.', 'elites', 25),
  thr('board_certified', 'Board Certified', 'Defeat 10 bosses across all runs.', 'bosses', 10),
  thr('liquidity', 'Liquidity', 'Earn 5000 gold across all runs.', 'goldEarned', 5000),
  // ---- secret
  { id: 'paperwork', name: 'Paperwork', text: 'End a run with 5 or more junk cards in the deck.', secret: true, check: (r, c) => c.junk >= 5 },
  { id: 'premature', name: 'Premature', text: 'Die within the first 3 floors.', secret: true, check: (r, c) => !c.won && !c.abandoned && c.floors <= 3 },
  { id: 'against_advice', name: 'Against Medical Advice', text: 'Abandon a run before the first fight.', secret: true, check: (r, c) => c.abandoned && c.floors <= 1 },
  { id: 'itemized', name: 'Itemized', text: 'Win with exactly 0 gold left.', secret: true, check: (r, c) => c.won && c.gold === 0 },
  { id: 'hoarder', name: 'Hoarder', text: 'End a run with 40 or more cards.', secret: true, check: (r, c) => c.deckSize >= 40 },
  { id: 'pincushion', name: 'Pincushion', text: 'Die holding 2 or more Overloaded cards.', secret: true, check: (r, c) => !c.won && c.overloaded >= 2 },
];

export const ACHIEVEMENT_LIST = ACHIEVEMENTS;

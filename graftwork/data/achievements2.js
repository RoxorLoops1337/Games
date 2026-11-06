// 24 more achievements (merged into ACHIEVEMENTS by data/achievements.js): the Thread, afflictions, Overload/Shatter/Temper, ascension.
// check(run, ctx, meta). They read run.stats.{maxLine, maxHit, afflicted{status:count}, shatters, bosses} written by the engine,
// and the final deck. Rewards are non-power: { kind: 'title'|'back'|'tint', id, name } (ids live in engine/meta2.js catalogs).
// Voice: clinical, dry, no em dashes, no exclamation marks.
const HEROES3 = ['marrow', 'wick', 'odile'];
const AFF = ['poison', 'brittle', 'rejection', 'infection', 'numb', 'unpicked'];
const st = (r) => (r && r.stats) || {};
const aff = (r) => st(r).afflicted || {};
const temperedCount = (r) => ((r && r.deck) || []).filter((i) => (i.fused || []).length > 0).length;
const title = (id, name) => ({ kind: 'title', id, name });
const back = (id, name) => ({ kind: 'back', id, name });
const tint = (id, name) => ({ kind: 'tint', id, name });
const A = (id, name, text, check, reward, extra = {}) => ({ id, name, text, check, reward, ...extra });

export const ACHIEVEMENTS_2 = [
  // ---- the Thread
  A('long_stitch', 'Long Stitch', 'Build a Line of 3 knots.', (r) => st(r).maxLine >= 3, title('long_stitch', 'Long Stitch')),
  A('full_spool', 'Full Spool', 'Build a Line of 5 knots.', (r) => st(r).maxLine >= 5, back('tapestry', 'Tapestry')),
  A('heavy_hand', 'Heavy Hand', 'Land a single hit of 30 or more.', (r) => st(r).maxHit >= 30, title('heavy_hand', 'Heavy Hand')),
  A('anatomical_event', 'Anatomical Event', 'Land a single hit of 80 or more.', (r) => st(r).maxHit >= 80, tint('brass', 'Brass'), { secret: true }),
  A('short_thread', 'Short Thread', 'Win a Daily Case that caps your Lines.', (r, c) => c.won && !!c.daily && !!(r.dailyMod && r.dailyMod.lineCap), title('short_thread', 'Short Thread')),
  A('regular', 'Regular', 'Win 5 daily runs.', (r, c, m) => (m.stats.dailyWins || 0) >= 5, back('ward_lamp', 'Ward Lamp'), { progress: (m) => [Math.min(5, m.stats.dailyWins || 0), 5] }),
  // ---- afflictions
  A('poisoned', 'Poisoned', 'Be poisoned in a run.', (r) => aff(r).poison > 0, title('poisoned', 'Poisoned')),
  A('brittle_bones', 'Brittle Bones', 'Be made Brittle in a run.', (r) => aff(r).brittle > 0, tint('ash', 'Ash')),
  A('rejected', 'Rejected', 'Have a graft Rejected in a run.', (r) => aff(r).rejection > 0, title('rejected', 'Rejected')),
  A('infected', 'Infected', 'Catch an Infection in a run.', (r) => aff(r).infection > 0, tint('moss', 'Moss')),
  A('full_chart', 'Full Chart', 'Suffer all six afflictions in one run.', (r) => AFF.every((a) => aff(r)[a] > 0), back('oxblood', 'Oxblood'), { secret: true }),
  A('clean_bill', 'Clean Bill', 'Win without suffering any affliction.', (r, c) => c.won && AFF.every((a) => !aff(r)[a]), title('clean_bill', 'Clean Bill')),
  // ---- Overload, Shatter, Temper
  A('overclocked', 'Overclocked', 'Win holding an Overloaded card.', (r, c) => c.won && c.overloaded >= 1, title('overclocked', 'Overclocked')),
  A('debris', 'Debris', 'Shatter 25 cards across all runs.', (r, c, m) => (m.stats.shatters || 0) >= 25, back('bone', 'Bone White'), { progress: (m) => [Math.min(25, m.stats.shatters || 0), 25] }),
  A('fire_sale', 'Fire Sale', 'Shatter 5 cards in one run.', (r) => st(r).shatters >= 5, title('fire_sale', 'Fire Sale')),
  A('hammered', 'Hammered', 'Temper a card.', (r) => temperedCount(r) >= 1, title('hammered', 'Hammered')),
  A('cold_forge', 'Cold Forge', 'Fuse 4 grafts into one card.', (r) => ((r && r.deck) || []).some((i) => (i.fused || []).length >= 4), tint('rose', 'Rose')),
  A('seamless', 'Seamless', 'Win with 5 or more Tempered cards.', (r, c) => c.won && temperedCount(r) >= 5, back('verdigris', 'Verdigris')),
  // ---- ascension and bosses
  A('clot_carrier', 'Clot Carrier', 'Win at Ascension 3 or higher.', (r, c) => c.won && c.asc >= 3, title('clot_carrier', 'Clot Carrier')),
  A('lean_budget', 'Lean Budget', 'Win at Ascension 6 or higher.', (r, c) => c.won && c.asc >= 6, title('lean_budget', 'Lean Budget')),
  A('steady_nerves', 'Steady Nerves', 'Win at Ascension 8 or higher.', (r, c) => c.won && c.asc >= 8, back('gilt', 'Gilt Edge')),
  A('triple_pitch', 'Triple Pitch', 'Win at Ascension 7 with each hero.', (r, c, m) => HEROES3.every((h) => (m.wins[h] || 0) > 0 && (m.winAsc[h] || 0) >= 7), title('triple_pitch', 'Triple Pitch'),
    { progress: (m) => [HEROES3.filter((h) => (m.wins[h] || 0) > 0 && (m.winAsc[h] || 0) >= 7).length, 3] }),
  A('boss_hunter', 'Boss Hunter', 'Defeat all 3 act bosses and the Grafter in one run.', (r, c) => c.won && st(r).bosses >= 3, title('boss_hunter', 'Boss Hunter')),
  A('case_closed', 'Case Closed', 'Earn 300 Credit across all runs.', (r, c, m) => ((m.credit && m.credit.total) || 0) >= 300, title('case_closed', 'Case Closed'), { progress: (m) => [Math.min(300, (m.credit && m.credit.total) || 0), 300] }),
];

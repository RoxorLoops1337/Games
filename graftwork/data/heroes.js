// Heroes. deck = the 15 starting card ids (the cards must exist in cards_<hero>.js).
// perks are read by engine/run.js: hp, gold, combatHeal, shopDiscount, startRelic, startGraft.
export const HERO_LIST = [
  {
    id: 'marrow', name: 'Marrow', title: 'Barber-Surgeon', color: '#9E0F2E', school: 'blood', unlocked: true,
    blurb: 'Blunt, kind and terrifying. Pays for power in his own blood and heals it back with a steady hand.',
    passive: 'Heal 9 HP at the end of each combat.',
    perks: { hp: 82, gold: 99, combatHeal: 9 },
    deck: ['m_cut', 'm_cut', 'm_cut', 'm_cut', 'm_cut', 'm_dress', 'm_dress', 'm_dress', 'm_dress', 'm_incision', 'm_incision', 'm_transfuse', 'm_bonesaw', 'm_anesthetic', 'm_tourniquet'],
  },
  {
    id: 'wick', name: 'Wick', title: "Chandler's Apprentice", color: '#FF6A2B', school: 'ember', unlocked: false,
    unlock: { text: 'Win a run with Marrow, or reach Act 2.', rule: 'act2' },
    blurb: 'Eager and flammable. Burn stacks, chained sparks, and a very short fuse.',
    passive: 'Your first Attack each combat applies 3 Burn.',
    perks: { hp: 76, gold: 99, combatHeal: 6 },
    on: { cardPlayed: (A, p) => { const c = A.c; if (p.spec.type === 'attack' && p.target && !c.wickFired) { c.wickFired = true; A.status(p.target, 'burn', 3); } } },
    deck: ['w_spark', 'w_spark', 'w_spark', 'w_spark', 'w_spark', 'w_snuff', 'w_snuff', 'w_snuff', 'w_snuff', 'w_kindle', 'w_kindle', 'w_match', 'w_flare', 'w_fan', 'w_trim'],
  },
  {
    id: 'odile', name: 'Odile Gilt', title: 'Collector', color: '#C9A227', school: 'gilded', unlocked: false,
    unlock: { text: 'Win a run with any hero.', rule: 'win' },
    blurb: 'Polite, acquisitive, and never without a receipt. Gold in, replays out.',
    passive: 'Start with 130 gold. Shop prices are 10% lower.',
    perks: { hp: 78, gold: 130, shopDiscount: 0.1, combatHeal: 6 },
    deck: ['o_swipe', 'o_swipe', 'o_swipe', 'o_swipe', 'o_swipe', 'o_cover', 'o_cover', 'o_cover', 'o_cover', 'o_appraise', 'o_appraise', 'o_gilt_strike', 'o_gilt_strike', 'o_collect', 'o_encore'],
  },
];

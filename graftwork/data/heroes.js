// Heroes. deck = the 15 starting card ids (the cards must exist in cards_<hero>.js).
// perks are read by engine/run.js: hp, gold, combatHeal, shopDiscount, startRelic, startGraft. declare (a school) is read by engine/seam.js.
export const HERO_LIST = [
  {
    id: 'marrow', name: 'Marrow', title: 'Barber-Surgeon', color: '#9E0F2E', school: 'blood', unlocked: true,
    blurb: 'Blunt, kind and terrifying. Pays for power in his own blood and heals it back with a steady hand.',
    passive: 'Heal 9 HP at the end of each combat. Blood cuts heal 1 extra per stitch.',
    perks: { hp: 82, gold: 99, combatHeal: 9 },
    // Thread: engine/seam.js fires seamCut {paid, school, len, card, pays} when the Line is cut (not at the turn end); pays holds the Blood stitches that were paid.
    on: { seamCut: (A, p) => { if (!p || p.school !== 'blood' || p.paid === false) return; const n = (p.pays.find((x) => x.school === 'blood') || { stitches: 0 }).stitches; if (n > 0) A.heal(A.player, n); } },
    deck: ['m_cut', 'm_cut', 'm_cut', 'm_cut', 'm_cut', 'm_dress', 'm_dress', 'm_dress', 'm_dress', 'm_incision', 'm_incision', 'm_transfuse', 'm_bonesaw', 'm_anesthetic', 'm_tourniquet'],
  },
  {
    id: 'wick', name: 'Wick', title: "Chandler's Apprentice", color: '#FF6A2B', school: 'ember', unlocked: false,
    unlock: true, // gated: the rule and its text are HERO_GATES in data/unlocks.js
    blurb: 'Eager and flammable. Burn stacks, chained sparks, and a very short fuse.',
    passive: 'Your first Attack each combat applies 2 Burn. Each extend lights 1 Burn on a random enemy.',
    perks: { hp: 76, gold: 99, combatHeal: 6 },
    on: {
      seamExtend: (A) => { const a = A.alive(); if (a.length) A.status(a[A.rng.int(a.length)], 'burn', 1); },
      cardPlayed: (A, p) => { const c = A.c; if (p.spec.type === 'attack' && p.target && !c.wickFired) { c.wickFired = true; A.status(p.target, 'burn', 2); } },
    },
    deck: ['w_spark', 'w_spark', 'w_spark', 'w_spark', 'w_spark', 'w_snuff', 'w_snuff', 'w_snuff', 'w_snuff', 'w_kindle', 'w_kindle', 'w_match', 'w_flare', 'w_fan', 'w_trim'],
  },
  {
    id: 'odile', name: 'Odile Gilt', title: 'Collector', color: '#C9A227', school: 'gilded', unlocked: false,
    unlock: true,
    blurb: 'Polite, acquisitive, and never without a receipt. Gold in, replays out.',
    passive: 'Start with 130 gold. Shop prices are 10% lower. Once per turn, a card may be declared Gilded.',
    perks: { hp: 88, gold: 130, shopDiscount: 0.1, combatHeal: 8 }, // hp 92 until the declaration became real (rules fixes): it is worth about 6 points of win rate, 4 HP takes 3 back
    // Thread: once per turn the player may declare the next card Gilded (engine/seam.js canDeclare / setDeclare; the control sits on the Thread rail, key G).
    declare: 'gilded',
    deck: ['o_swipe', 'o_swipe', 'o_swipe', 'o_pocket_change', 'o_pocket_change', 'o_cover', 'o_cover', 'o_cover', 'o_cover', 'o_appraise', 'o_appraise', 'o_gilt_strike', 'o_gilt_strike', 'o_collect', 'o_encore'],
  },
];

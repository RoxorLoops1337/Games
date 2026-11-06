// Heroes. deck = the 15 starting card ids (the cards must exist in cards_<hero>.js).
// perks are read by engine/run.js: hp, gold, combatHeal, shopDiscount, startRelic, startGraft.
export const HERO_LIST = [
  {
    id: 'marrow', name: 'Marrow', title: 'Barber-Surgeon', color: '#9E0F2E', school: 'blood', unlocked: true,
    blurb: 'Blunt, kind and terrifying. Pays for power in his own blood and heals it back with a steady hand.',
    passive: 'Heal 9 HP at the end of each combat. Blood cuts heal 1 extra per stitch.',
    perks: { hp: 82, gold: 99, combatHeal: 9 },
    // Thread: engine/seam.js fires seamCut {paid, school, len, card}; stitches = min(len,5)-1.
    on: { seamCut: (A, p) => { if (!p || p.school !== 'blood' || p.paid === false) return; const n = Math.max(0, Math.min(5, p.len || 0) - 1); if (n > 0) A.heal(A.player, n); } },
    deck: ['m_cut', 'm_cut', 'm_cut', 'm_cut', 'm_cut', 'm_dress', 'm_dress', 'm_dress', 'm_dress', 'm_incision', 'm_incision', 'm_transfuse', 'm_bonesaw', 'm_anesthetic', 'm_tourniquet'],
  },
  {
    id: 'wick', name: 'Wick', title: "Chandler's Apprentice", color: '#FF6A2B', school: 'ember', unlocked: false,
    unlock: { text: 'Win a run with Marrow, or reach Act 2.', rule: 'act2' },
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
    unlock: { text: 'Win a run with any hero.', rule: 'win' },
    blurb: 'Polite, acquisitive, and never without a receipt. Gold in, replays out.',
    passive: 'Start with 130 gold. Shop prices are 10% lower. Once per turn, a card may be declared Gilded.',
    perks: { hp: 92, gold: 130, shopDiscount: 0.1, combatHeal: 8 },
    // Thread: engine/seam.js asks seamDeclare({card, set, line}) when a card would CUT the Line; returning 'gilded' adds that school to the card for this step (once per turn).
    on: { seamDeclare: (A, p) => { const c = A.c; c.rx = c.rx || {}; if (c.rx.declTurn === c.turn || !p || !p.line || !p.line.includes('gilded')) return null; c.rx.declTurn = c.turn; return 'gilded'; } },
    deck: ['o_swipe', 'o_swipe', 'o_swipe', 'o_pocket_change', 'o_pocket_change', 'o_cover', 'o_cover', 'o_cover', 'o_cover', 'o_appraise', 'o_appraise', 'o_gilt_strike', 'o_gilt_strike', 'o_collect', 'o_encore'],
  },
];

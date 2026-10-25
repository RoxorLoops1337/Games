// Odile: the polite collector. Schools: hoard, gilded, echo. Gold in the pocket becomes damage and block.
const G = (base, mul, max) => ({ base, per: 'gold', mul, max });
const fxOn = (s, n) => ({ op: 'status', s, n, to: 'self' });

export const CARDS_ODILE = [
  // ---- starters ----
  { id: 'o_swipe', name: 'Swipe', hero: 'odile', type: 'attack', cost: 1, rarity: 'starter', fx: [{ op: 'dmg', n: 6 }], up: { fx: [{ op: 'dmg', n: 9 }] }, flavor: 'Not stealing. Collecting.' },
  { id: 'o_cover', name: 'Cover Charge', hero: 'odile', type: 'skill', cost: 1, rarity: 'starter', target: 'self', fx: [{ op: 'block', n: 5 }], up: { fx: [{ op: 'block', n: 8 }] }, flavor: 'Entry is not free.' },
  { id: 'o_appraise', name: 'Appraise', hero: 'odile', type: 'skill', cost: 1, rarity: 'starter', target: 'self', fx: [{ op: 'draw', n: 2 }], up: { fx: [{ op: 'draw', n: 3 }] }, flavor: 'Hm. Hm. Yes.' },
  { id: 'o_gilt_strike', name: 'Gilt Strike', hero: 'odile', type: 'attack', cost: 1, rarity: 'starter', school: 'gilded', fx: [{ op: 'dmg', n: 5 }, { op: 'gold', n: 3 }], up: { fx: [{ op: 'dmg', n: 7 }, { op: 'gold', n: 5 }] }, flavor: 'Pays for itself.' },
  { id: 'o_collect', name: 'Collect', hero: 'odile', type: 'skill', cost: 0, rarity: 'starter', school: 'gilded', target: 'self', fx: [{ op: 'gold', n: 4 }, { op: 'block', n: 2 }], flags: { exhaust: true }, up: { fx: [{ op: 'gold', n: 7 }, { op: 'block', n: 4 }] }, flavor: 'A small tip.' },
  { id: 'o_encore', name: 'Encore', hero: 'odile', type: 'skill', cost: 1, rarity: 'starter', school: 'echo', target: 'self', fx: [{ op: 'status', s: 'echo', n: 1, to: 'self' }], flags: { exhaust: true }, up: { fx: [{ op: 'status', s: 'echo', n: 1, to: 'self' }], cost: 0 }, flavor: 'Again, from the top.' },

  // ---- common (11) ----
  { id: 'o_receipt', name: 'Receipt', hero: 'odile', type: 'skill', cost: 1, rarity: 'common', school: 'gilded', target: 'self', fx: [{ op: 'block', n: 6 }, { op: 'gold', n: 2 }], up: { fx: [{ op: 'block', n: 8 }, { op: 'gold', n: 3 }] }, flavor: 'Keep this for your records.' },
  { id: 'o_pocket_change', name: 'Pocket Change', hero: 'odile', type: 'attack', cost: 1, rarity: 'common', school: 'hoard', fx: [{ op: 'dmg', n: G(5, 0.1, 12) }], up: { fx: [{ op: 'dmg', n: G(7, 0.1, 15) }] }, flavor: 'It adds up. Quite sharply.' },
  { id: 'o_heavy_purse', name: 'Heavy Purse', hero: 'odile', type: 'attack', cost: 2, rarity: 'common', school: 'hoard', fx: [{ op: 'dmg', n: G(9, 0.1, 18) }], up: { fx: [{ op: 'dmg', n: G(12, 0.1, 22) }] }, flavor: 'Swung by the strap, with regret.' },
  { id: 'o_levy', name: 'Levy', hero: 'odile', type: 'attack', cost: 1, rarity: 'common', school: 'gilded', fx: [{ op: 'dmg', n: 7 }, { op: 'gold', n: 2 }], up: { fx: [{ op: 'dmg', n: 9 }, { op: 'gold', n: 4 }] }, flavor: 'A modest fee for the inconvenience.' },
  { id: 'o_double_bill', name: 'Double Bill', hero: 'odile', type: 'attack', cost: 1, rarity: 'common', school: 'echo', fx: [{ op: 'dmg', n: 4, hits: 2 }], up: { fx: [{ op: 'dmg', n: 5, hits: 2 }] }, flavor: 'Itemised, as requested.' },
  { id: 'o_loose_change', name: 'Loose Change', hero: 'odile', type: 'attack', cost: 0, rarity: 'common', school: 'gilded', fx: [{ op: 'dmg', n: 3 }, { op: 'gold', n: 1 }], up: { fx: [{ op: 'dmg', n: 5 }, { op: 'gold', n: 2 }] }, flavor: 'Found it. Mine now.' },
  { id: 'o_browse', name: 'Browse', hero: 'odile', type: 'skill', cost: 1, rarity: 'common', school: 'hoard', target: 'self', fx: [{ op: 'draw', n: 3 }, { op: 'discard', n: 1 }], up: { fx: [{ op: 'draw', n: 3 }, { op: 'discard', n: 1 }], cost: 0 }, flavor: 'Just looking. For everything.' },
  { id: 'o_layaway', name: 'Layaway', hero: 'odile', type: 'skill', cost: 1, rarity: 'common', school: 'hoard', target: 'self', fx: [{ op: 'block', n: 8 }], flags: { retain: true }, up: { fx: [{ op: 'block', n: 11 }] }, flavor: 'Held for you. Indefinitely.' },
  { id: 'o_tip_the_usher', name: 'Tip the Usher', hero: 'odile', type: 'skill', cost: 1, rarity: 'common', school: 'gilded', target: 'enemy',
    fx: [{ op: 'if', cond: { src: 'gold', gte: 8 }, ifText: 'you have 8 gold', then: [{ op: 'gold', n: -8 }, { op: 'status', s: 'weak', n: 2 }, { op: 'block', n: 8 }], else: [{ op: 'block', n: 4 }] }],
    up: { fx: [{ op: 'if', cond: { src: 'gold', gte: 6 }, ifText: 'you have 6 gold', then: [{ op: 'gold', n: -6 }, { op: 'status', s: 'weak', n: 2 }, { op: 'block', n: 11 }], else: [{ op: 'block', n: 5 }] }] }, flavor: 'Discretion has a price.' },
  { id: 'o_prepaid', name: 'Prepaid', hero: 'odile', type: 'skill', cost: 1, rarity: 'common', school: 'hoard', target: 'self', fx: [{ op: 'block', n: 5 }, { op: 'draw', n: 1 }], flags: { innate: true }, up: { fx: [{ op: 'block', n: 7 }, { op: 'draw', n: 1 }] }, flavor: 'Settled before you arrived.' },
  { id: 'o_pawn_ticket', name: 'Pawn Ticket', hero: 'odile', type: 'skill', cost: 0, rarity: 'common', school: 'gilded', target: 'self', fx: [{ op: 'gold', n: 4 }, { op: 'discard', n: 1 }], flags: { exhaust: true }, up: { fx: [{ op: 'gold', n: 6 }, { op: 'discard', n: 1 }] }, flavor: 'Redeemable. Probably.' },

  // ---- uncommon (8) ----
  { id: 'o_bulk_order', name: 'Bulk Order', hero: 'odile', type: 'attack', cost: 'X', rarity: 'uncommon', school: 'echo', fx: [{ op: 'dmg', n: 6, hits: { base: 0, per: 'x', mul: 1 } }], up: { fx: [{ op: 'dmg', n: 8, hits: { base: 0, per: 'x', mul: 1 } }] }, flavor: 'Quantity discounts apply to you.' },
  { id: 'o_liquidate', name: 'Liquidate', hero: 'odile', type: 'attack', cost: 2, rarity: 'uncommon', school: 'hoard',
    fx: [{ op: 'dmg', n: 12 }, { op: 'if', cond: { src: 'gold', gte: 15 }, ifText: 'you have 15 gold', then: [{ op: 'gold', n: -15 }, { op: 'dmg', n: 12 }] }],
    up: { fx: [{ op: 'dmg', n: 15 }, { op: 'if', cond: { src: 'gold', gte: 12 }, ifText: 'you have 12 gold', then: [{ op: 'gold', n: -12 }, { op: 'dmg', n: 15 }] }] }, flavor: 'Everything must go. You first.' },
  { id: 'o_bidding_war', name: 'Bidding War', hero: 'odile', type: 'attack', cost: 1, rarity: 'uncommon', school: 'hoard', target: 'all', fx: [{ op: 'dmg', n: G(5, 0.05, 10), to: 'all' }], up: { fx: [{ op: 'dmg', n: G(7, 0.05, 12), to: 'all' }] }, flavor: 'Gentlemen. Please. Raise your paddles.' },
  { id: 'o_inventory', name: 'Take Inventory', hero: 'odile', type: 'skill', cost: 1, rarity: 'uncommon', school: 'hoard', target: 'self', fx: [{ op: 'block', n: { base: 3, per: 'hand', mul: 1, max: 12 } }], flags: { retain: true }, up: { fx: [{ op: 'block', n: { base: 4, per: 'hand', mul: 1, max: 14 } }] }, flavor: 'Seven ledgers, one of you.' },
  { id: 'o_audit', name: 'Audit', hero: 'odile', type: 'skill', cost: 1, rarity: 'uncommon', school: 'hoard', target: 'self', fx: [{ op: 'draw', n: 4 }, { op: 'discard', n: 2 }], flags: { exhaust: true }, up: { fx: [{ op: 'draw', n: 4 }, { op: 'discard', n: 2 }], unflags: ['exhaust'] }, flavor: 'Everything accounted for. Eventually.' },
  { id: 'o_second_helping', name: 'Second Helping', hero: 'odile', type: 'skill', cost: 1, rarity: 'uncommon', school: 'echo', target: 'self', fx: [{ op: 'block', n: 5 }, fxOn('echo', 1)], up: { fx: [{ op: 'block', n: 8 }, fxOn('echo', 1)] }, flavor: 'Seconds are only polite.' },
  { id: 'o_dividend', name: 'Dividend', hero: 'odile', type: 'power', cost: 1, rarity: 'uncommon', school: 'gilded', target: 'self', fx: [fxOn('dividend', 3)], up: { fx: [fxOn('dividend', 5)] }, flavor: 'Money, doing its job.' },
  { id: 'o_keepsake', name: 'Keepsake', hero: 'odile', type: 'power', cost: 1, rarity: 'uncommon', school: 'hoard', target: 'self', fx: [fxOn('keepsake', 1)], up: { fx: [fxOn('keepsake', 1)], cost: 0 }, flavor: 'Some things one simply keeps.' },

  // ---- rare (6) ----
  { id: 'o_patronage', name: 'Patronage', hero: 'odile', type: 'power', cost: 2, rarity: 'rare', school: 'gilded', target: 'self', fx: [fxOn('patronage', 3)], up: { fx: [fxOn('patronage', 3)], cost: 1 }, flavor: 'A generous patron of violence.' },
  { id: 'o_standing_order', name: 'Standing Order', hero: 'odile', type: 'power', cost: 2, rarity: 'rare', school: 'echo', target: 'self', fx: [fxOn('standing_order', 1)], up: { fx: [fxOn('standing_order', 1)], cost: 1 }, flavor: 'The usual, please. Twice.' },
  { id: 'o_gilded_age', name: 'Gilded Age', hero: 'odile', type: 'power', cost: 1, rarity: 'rare', school: 'gilded', target: 'self', fx: [fxOn('gilt', 8)], up: { fx: [fxOn('gilt', 12)] }, flavor: 'Tasteful. Mostly.' },
  { id: 'o_hostile_takeover', name: 'Hostile Takeover', hero: 'odile', type: 'attack', cost: 3, rarity: 'rare', school: 'hoard', fx: [{ op: 'dmg', n: G(16, 0.15, 34) }], flags: { exhaust: true }, up: { fx: [{ op: 'dmg', n: G(20, 0.15, 40) }] }, flavor: 'We regret to inform you of your acquisition.' },
  { id: 'o_market_crash', name: 'Market Crash', hero: 'odile', type: 'skill', cost: 2, rarity: 'rare', school: 'hoard', target: 'self',
    fx: [{ op: 'if', cond: { src: 'gold', gte: 20 }, ifText: 'you have 20 gold', then: [{ op: 'gold', n: -20 }, { op: 'energy', n: 2 }, { op: 'draw', n: 4 }], else: [{ op: 'draw', n: 2 }] }], flags: { exhaust: true },
    up: { fx: [{ op: 'if', cond: { src: 'gold', gte: 15 }, ifText: 'you have 15 gold', then: [{ op: 'gold', n: -15 }, { op: 'energy', n: 3 }, { op: 'draw', n: 4 }], else: [{ op: 'draw', n: 3 }] }] }, flavor: 'Buy low. Panic politely.' },
  { id: 'o_golden_parachute', name: 'Golden Parachute', hero: 'odile', type: 'skill', cost: 1, rarity: 'rare', school: 'gilded', target: 'self', fx: [{ op: 'block', n: G(8, 0.15, 24) }], flags: { retain: true }, up: { fx: [{ op: 'block', n: G(11, 0.15, 30) }] }, flavor: 'Departing, with severance.' },
];

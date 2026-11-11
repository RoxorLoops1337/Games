import { OVL, TEMP, LINE2 } from './helpers.js';
// Odile: the polite collector. Schools: hoard, gilded, echo. Gold in the pocket becomes damage and block.
const G = (base, mul, max) => ({ base, per: 'gold', mul, max });
const fxOn = (s, n) => ({ op: 'status', s, n, to: 'self' });
// gold per Tithed card in the deck
const titheGold = (per, max) => ({ op: 'custom', fn: (A, ctx) => { const n = Math.min(max, per * A.c.strain.tithed.length); if (n > 0 && !ctx.replay) A.gold(n); }, text: `Gain ${per} gold per Tithed card in your deck (max ${max}).` });

const addKnot = (A) => {
  const s = A.c.seam; if (!s || s.len < 1 || s.len >= 5) return;
  const top = Object.keys(s.counts || {}).sort((a, b) => (s.counts[b] || 0) - (s.counts[a] || 0))[0];
  if (!top) return;
  s.len += 1; s.counts[top] = (s.counts[top] || 0) + 1;
};
export const CARDS_ODILE = [
  // ---- starters ----
  { id: 'o_swipe', name: 'Swipe', hero: 'odile', type: 'attack', cost: 1, rarity: 'starter', fx: [{ op: 'dmg', n: 7 }], up: { fx: [{ op: 'dmg', n: 10 }] }, flavor: 'Not stealing. Collecting.' },
  { id: 'o_cover', name: 'Cover Charge', hero: 'odile', type: 'skill', cost: 1, rarity: 'starter', target: 'self', fx: [{ op: 'block', n: 7 }], up: { fx: [{ op: 'block', n: 10 }] }, flavor: 'Entry is not free.' },
  { id: 'o_appraise', name: 'Appraise', hero: 'odile', type: 'skill', cost: 1, rarity: 'starter', target: 'self', fx: [{ op: 'draw', n: 2 }], up: { fx: [{ op: 'draw', n: 3 }] }, flavor: 'Hm. Hm. Yes.' },
  { id: 'o_gilt_strike', name: 'Gilt Strike', hero: 'odile', type: 'attack', cost: 1, rarity: 'starter', school: 'gilded', fx: [{ op: 'dmg', n: 7 }, { op: 'gold', n: 3 }], up: { fx: [{ op: 'dmg', n: 10 }, { op: 'gold', n: 5 }] }, flavor: 'Pays for itself.' },
  { id: 'o_collect', name: 'Collect', hero: 'odile', type: 'skill', cost: 0, rarity: 'starter', school: 'gilded', target: 'self', fx: [{ op: 'gold', n: 4 }, { op: 'block', n: 6 }], flags: { exhaust: true }, up: { fx: [{ op: 'gold', n: 7 }, { op: 'block', n: 8 }] }, flavor: 'A small tip.' },
  { id: 'o_encore', name: 'Encore', hero: 'odile', type: 'skill', cost: 1, rarity: 'starter', school: 'echo', target: 'self', fx: [{ op: 'status', s: 'echo', n: 1, to: 'self' }], flags: { exhaust: true }, up: { fx: [{ op: 'status', s: 'echo', n: 1, to: 'self' }], cost: 0 }, flavor: 'Again, from the top.' },

  // ---- common (11) ----
  { id: 'o_receipt', name: 'Receipt', hero: 'odile', type: 'skill', cost: 1, rarity: 'common', school: 'gilded', target: 'self', fx: [{ op: 'block', n: 6 }, { op: 'gold', n: 2 }], up: { fx: [{ op: 'block', n: 8 }, { op: 'gold', n: 3 }] }, flavor: 'Keep this for your records.' },
  { id: 'o_pocket_change', name: 'Pocket Change', hero: 'odile', type: 'attack', cost: 1, rarity: 'common', school: 'hoard', fx: [{ op: 'dmg', n: G(5, 0.1, 12) }], up: { fx: [{ op: 'dmg', n: G(7, 0.1, 15) }] }, flavor: 'It adds up. Quite sharply.' },
  { id: 'o_heavy_purse', art: 'purse', name: 'Heavy Purse', hero: 'odile', type: 'attack', cost: 2, rarity: 'common', school: 'hoard', fx: [{ op: 'dmg', n: G(9, 0.1, 18) }], up: { fx: [{ op: 'dmg', n: G(12, 0.1, 22) }] }, flavor: 'Swung by the strap, with regret.' },
  { id: 'o_levy', name: 'Levy', hero: 'odile', type: 'attack', cost: 0, rarity: 'common', school: 'gilded', fx: [{ op: 'dmg', n: 4 }, { op: 'gold', n: 3 }], up: { fx: [{ op: 'dmg', n: 6 }, { op: 'gold', n: 4 }] }, flavor: 'A modest fee for the inconvenience.' },
  { id: 'o_double_bill', name: 'Double Bill', hero: 'odile', type: 'attack', cost: 1, rarity: 'common', school: 'echo', fx: [{ op: 'dmg', n: 5, hits: 2 }], up: { fx: [{ op: 'dmg', n: 6, hits: 2 }] }, flavor: 'Itemised, as requested.' },
  { id: 'o_loose_change', name: 'Loose Change', hero: 'odile', type: 'attack', cost: 0, rarity: 'common', fx: [{ op: 'dmg', n: 3 }, { op: 'gold', n: 1 }], up: { fx: [{ op: 'dmg', n: 5 }, { op: 'gold', n: 2 }] }, flavor: 'Found it. Mine now.' },
  { id: 'o_browse', name: 'Browse', hero: 'odile', type: 'skill', cost: 1, rarity: 'common', school: 'hoard', target: 'self', fx: [{ op: 'draw', n: 3 }, { op: 'discard', n: 1 }], up: { fx: [{ op: 'draw', n: 3 }, { op: 'discard', n: 1 }], cost: 0 }, flavor: 'Just looking. For everything.' },
  { id: 'o_layaway', name: 'Layaway', hero: 'odile', type: 'skill', cost: 1, rarity: 'common', target: 'self', fx: [{ op: 'block', n: 8 }], flags: { retain: true }, up: { fx: [{ op: 'block', n: 11 }] }, flavor: 'Held for you. Indefinitely.' },
  { id: 'o_tip_the_usher', name: 'Tip the Usher', hero: 'odile', type: 'skill', cost: 1, rarity: 'common', school: 'gilded', target: 'enemy',
    fx: [{ op: 'if', cond: { src: 'gold', gte: 12 }, ifText: 'you have 12 gold', then: [{ op: 'gold', n: -12 }, { op: 'status', s: 'weak', n: 2 }, { op: 'block', n: 8 }], else: [{ op: 'block', n: 4 }] }],
    up: { fx: [{ op: 'if', cond: { src: 'gold', gte: 6 }, ifText: 'you have 6 gold', then: [{ op: 'gold', n: -6 }, { op: 'status', s: 'weak', n: 2 }, { op: 'block', n: 11 }], else: [{ op: 'block', n: 5 }] }] }, flavor: 'Discretion has a price.' },
  { id: 'o_prepaid', name: 'Prepaid', hero: 'odile', type: 'skill', cost: 1, rarity: 'common', target: 'self', fx: [{ op: 'block', n: 5 }, { op: 'draw', n: 1 }], flags: { innate: true }, up: { fx: [{ op: 'block', n: 7 }, { op: 'draw', n: 1 }] }, flavor: 'Settled before you arrived.' },
  { id: 'o_pawn_ticket', art: 'ticket', name: 'Pawn Ticket', hero: 'odile', type: 'skill', cost: 0, rarity: 'common', target: 'self', fx: [{ op: 'gold', n: 4 }, { op: 'block', n: 3 }, { op: 'draw', n: 1 }], flags: { exhaust: true }, up: { fx: [{ op: 'gold', n: 6 }, { op: 'block', n: 5 }, { op: 'draw', n: 1 }] }, flavor: 'Redeemable. Probably.' },

  // ---- uncommon (8) ----
  { id: 'o_bulk_order', name: 'Bulk Order', hero: 'odile', type: 'attack', cost: 'X', rarity: 'uncommon', school: 'echo', fx: [{ op: 'dmg', n: 6, hits: { base: 0, per: 'x', mul: 1 } }], up: { fx: [{ op: 'dmg', n: 8, hits: { base: 0, per: 'x', mul: 1 } }] }, flavor: 'Quantity discounts apply to you.' },
  { id: 'o_liquidate', name: 'Liquidate', hero: 'odile', type: 'attack', cost: 2, rarity: 'uncommon', school: 'hoard',
    fx: [{ op: 'dmg', n: 12 }, { op: 'if', cond: { src: 'gold', gte: 15 }, ifText: 'you have 15 gold', then: [{ op: 'gold', n: -15 }, { op: 'dmg', n: 12 }] }],
    up: { fx: [{ op: 'dmg', n: 15 }, { op: 'if', cond: { src: 'gold', gte: 12 }, ifText: 'you have 12 gold', then: [{ op: 'gold', n: -12 }, { op: 'dmg', n: 15 }] }] }, flavor: 'Everything must go. You first.' },
  { id: 'o_bidding_war', art: 'gavel', name: 'Bidding War', hero: 'odile', type: 'attack', cost: 1, rarity: 'uncommon', school: 'hoard', target: 'all', fx: [{ op: 'dmg', n: G(5, 0.05, 10), to: 'all' }], up: { fx: [{ op: 'dmg', n: G(7, 0.05, 12), to: 'all' }] }, flavor: 'Gentlemen. Please. Raise your paddles.' },
  { id: 'o_inventory', name: 'Take Inventory', hero: 'odile', type: 'skill', cost: 1, rarity: 'uncommon', target: 'self', fx: [{ op: 'block', n: { base: 3, per: 'hand', mul: 1, max: 12 } }], flags: { retain: true }, up: { fx: [{ op: 'block', n: { base: 4, per: 'hand', mul: 1, max: 14 } }] }, flavor: 'Seven ledgers, one of you.' },
  { id: 'o_audit', art: 'stamp', name: 'Audit', hero: 'odile', type: 'skill', cost: 1, rarity: 'uncommon', school: 'hoard', target: 'self', fx: [{ op: 'draw', n: 3 }, { op: 'discard', n: 1 }, { op: 'block', n: 7 }], flags: { retain: true }, up: { fx: [{ op: 'draw', n: 3 }, { op: 'discard', n: 1 }, { op: 'block', n: 7 }, { op: 'gold', n: 4 }] }, flavor: 'Everything accounted for. Eventually.' },
  { id: 'o_second_helping', name: 'Second Helping', hero: 'odile', type: 'skill', cost: 1, rarity: 'uncommon', school: 'echo', target: 'self', fx: [{ op: 'draw', n: 1 }, fxOn('echo', 1)], flags: { exhaust: true }, up: { fx: [{ op: 'draw', n: 1 }, fxOn('echo', 1)], cost: 0 }, flavor: 'Seconds are only polite.' },
  { id: 'o_dividend', name: 'Dividend', hero: 'odile', type: 'power', cost: 1, rarity: 'uncommon', school: 'gilded', target: 'self', fx: [fxOn('dividend', 3), { op: 'block', n: 6 }], up: { fx: [fxOn('dividend', 5), { op: 'block', n: 8 }] }, flavor: 'Money, doing its job.' },
  { id: 'o_keepsake', name: 'Keepsake', hero: 'odile', type: 'power', cost: 1, rarity: 'uncommon', school: 'hoard', target: 'self', fx: [fxOn('keepsake', 1)], up: { fx: [fxOn('keepsake', 1)], cost: 0 }, flavor: 'Some things one simply keeps.' },

  // ---- rare (6) ----
  { id: 'o_patronage', name: 'Patronage', hero: 'odile', type: 'power', cost: 2, rarity: 'rare', school: 'gilded', target: 'self', fx: [fxOn('patronage', 3)], up: { fx: [fxOn('patronage', 3)], cost: 1 }, flavor: 'A generous patron of violence.' },
  { id: 'o_standing_order', name: 'Standing Order', hero: 'odile', type: 'power', cost: 2, rarity: 'rare', school: 'echo', target: 'self', fx: [fxOn('standing_order', 1)], up: { fx: [fxOn('standing_order', 1)], cost: 1 }, flavor: 'The usual, please. Twice.' },
  { id: 'o_gilded_age', name: 'Gilded Age', hero: 'odile', type: 'power', cost: 1, rarity: 'rare', school: 'gilded', target: 'self', fx: [fxOn('gilt', 8), { op: 'block', n: 6 }], up: { fx: [fxOn('gilt', 12), { op: 'block', n: 8 }] }, flavor: 'Tasteful. Mostly.' },
  { id: 'o_hostile_takeover', name: 'Hostile Takeover', hero: 'odile', type: 'attack', cost: 3, rarity: 'rare', school: 'hoard', fx: [{ op: 'dmg', n: G(16, 0.15, 34) }], flags: { exhaust: true }, up: { fx: [{ op: 'dmg', n: G(20, 0.15, 40) }] }, flavor: 'We regret to inform you of your acquisition.' },
  { id: 'o_market_crash', name: 'Market Crash', hero: 'odile', type: 'skill', cost: 0, rarity: 'rare', school: 'hoard', target: 'self', flags: { exhaust: true },
    fx: [{ op: 'if', cond: { src: 'gold', gte: 15 }, ifText: 'you have 15 gold', then: [{ op: 'gold', n: -15 }, { op: 'energy', n: 2 }, { op: 'draw', n: 3 }], else: [{ op: 'draw', n: 1 }, { op: 'block', n: 6 }] }],
    up: { fx: [{ op: 'if', cond: { src: 'gold', gte: 8 }, ifText: 'you have 8 gold', then: [{ op: 'gold', n: -8 }, { op: 'energy', n: 2 }, { op: 'draw', n: 4 }], else: [{ op: 'draw', n: 2 }, { op: 'block', n: 8 }] }] }, flavor: 'Buy low. Panic politely.' },
  { id: 'o_golden_parachute', name: 'Golden Parachute', hero: 'odile', type: 'skill', cost: 1, rarity: 'rare', school: 'gilded', target: 'self', fx: [{ op: 'block', n: G(7, 0.12, 20) }], flags: { retain: true }, up: { fx: [{ op: 'block', n: G(10, 0.12, 26) }] }, flavor: 'Departing, with severance.' },

  // ---- graft builders (wave 2) ----
  { id: 'o_ledger_line', name: 'Ledger Line', hero: 'odile', type: 'attack', cost: 1, rarity: 'common', school: 'gilded', fx: [{ op: 'dmg', n: { base: 4, per: 'grafts', mul: 1, max: 12 } }, { op: 'gold', n: 2 }], up: { fx: [{ op: 'dmg', n: { base: 6, per: 'grafts', mul: 1, max: 15 } }, { op: 'gold', n: 3 }] }, flavor: 'Each addition is itemised.' },
  { id: 'o_clean_book', name: 'Clean Books', hero: 'odile', type: 'skill', cost: 1, rarity: 'common', target: 'self', fx: [{ op: 'block', n: 6 }, { op: 'if', cond: { src: 'cardGrafts', eq: 0 }, ifText: 'this card has no grafts', then: [{ op: 'block', n: 6 }, { op: 'draw', n: 1 }] }], up: { fx: [{ op: 'block', n: 8 }, { op: 'if', cond: { src: 'cardGrafts', eq: 0 }, ifText: 'this card has no grafts', then: [{ op: 'block', n: 8 }, { op: 'draw', n: 1 }] }] }, flavor: 'Nothing to declare. Nothing to audit.' },
  { id: 'o_tithe_ledger', name: 'Tithe Ledger', hero: 'odile', type: 'skill', cost: 1, rarity: 'uncommon', target: 'self', fx: [{ op: 'block', n: 7 }, titheGold(3, 15)], up: { fx: [{ op: 'block', n: 9 }, titheGold(4, 20)] }, flavor: 'Someone has to collect.' },
  { id: 'o_heirloom', art: 'keyring', name: 'Heirloom', hero: 'odile', type: 'attack', cost: 1, rarity: 'uncommon', flags: { retain: true }, fx: [{ op: 'dmg', n: { base: 6, per: 'cardGrafts', mul: 5 } }], up: { fx: [{ op: 'dmg', n: { base: 8, per: 'cardGrafts', mul: 6 } }] }, flavor: 'Passed down. Added to. Never sold.' },
  { id: 'o_overdraft', name: 'Overdraft', hero: 'odile', type: 'skill', cost: 1, rarity: 'rare', school: 'gilded', target: 'self', fx: [{ op: 'gold', n: { base: 0, per: 'strain', mul: 4, max: 20 } }, { op: 'block', n: { base: 4, per: 'strain', mul: 3, max: 16 } }], flags: { exhaust: true }, up: { fx: [{ op: 'gold', n: { base: 3, per: 'strain', mul: 5, max: 25 } }, { op: 'block', n: { base: 6, per: 'strain', mul: 4, max: 20 } }] }, flavor: 'Strain is only debt that has not been named.' },
  { id: 'o_triple_threat', name: 'Triple Threat', hero: 'odile', type: 'attack', cost: 2, rarity: 'rare', school: 'echo', fx: [{ op: 'dmg', n: 12 }, { op: 'if', cond: OVL, ifText: 'this card is Overloaded', then: [{ op: 'dmg', n: 12 }, { op: 'gold', n: 10 }] }], up: { fx: [{ op: 'dmg', n: 16 }, { op: 'if', cond: OVL, ifText: 'this card is Overloaded', then: [{ op: 'dmg', n: 16 }, { op: 'gold', n: 15 }] }] }, flavor: 'Three seams. Two encores. One invoice.' },

  // ---- H3: Thread / Temper / Echo combos ----
  { id: 'o_reprint', name: 'Backorder', art: 'papers', hero: 'odile', type: 'skill', cost: 1, rarity: 'uncommon', school: 'hoard', target: 'self', flags: { retain: true },
    fx: [{ op: 'block', n: 5 }, { op: 'draw', n: { base: 1, per: 'knots', mul: 0.5, max: 3 } }], up: { fx: [{ op: 'block', n: 7 }, { op: 'draw', n: { base: 1, per: 'knots', mul: 0.5, max: 3 } }] }, flavor: 'Held until the whole shipment arrives.' },
  { id: 'o_choir_loft', name: 'Choir Loft', hero: 'odile', type: 'attack', cost: 1, rarity: 'common', school: 'echo', art: 'tuningfork', target: 'enemy',
    fx: [{ op: 'dmg', n: 4, hits: { base: 2, per: 'knots', mul: 0.5, max: 4 } }], up: { fx: [{ op: 'dmg', n: 5, hits: { base: 2, per: 'knots', mul: 0.5, max: 4 } }] }, flavor: 'Sung in rounds, billed in rounds.' },
  { id: 'o_mirror_sale', name: 'Mirror Sale', hero: 'odile', type: 'skill', cost: 1, rarity: 'rare', school: 'echo', art: 'mirror', target: 'self', flags: { exhaust: true },
    fx: [fxOn('echo', 1), { op: 'custom', fn: addKnot, text: 'Add a knot to the Line\'s top school.' }], up: { cost: 0, fx: [fxOn('echo', 1), { op: 'custom', fn: addKnot, text: 'Add a knot to the Line\'s top school.' }] }, flavor: 'Every item sold twice, once in reverse.' },
  { id: 'o_cross_listing', name: 'Cross-Listing', hero: 'odile', type: 'skill', cost: 1, rarity: 'common', school: 'hoard', art: 'ledger', target: 'self',
    fx: [{ op: 'block', n: 6 }, { op: 'gold', n: 2 }, { op: 'if', cond: LINE2, ifText: 'the Line holds 2 or more schools', then: [{ op: 'draw', n: 1 }, { op: 'gold', n: 3 }] }],
    up: { fx: [{ op: 'block', n: 8 }, { op: 'if', cond: LINE2, ifText: 'the Line holds 2 or more schools', then: [{ op: 'draw', n: 1 }, { op: 'gold', n: 4 }] }] }, flavor: 'Listed under two headings, owed under both.' },
  { id: 'o_hardened_purse', name: 'Hardened Purse', hero: 'odile', type: 'skill', cost: 1, rarity: 'uncommon', school: 'gilded', art: 'coins', target: 'self',
    fx: [{ op: 'block', n: 6 }, { op: 'gold', n: 3 }, { op: 'if', cond: TEMP, ifText: 'this card is Tempered', then: [fxOn('gilt', 3)] }],
    up: { fx: [{ op: 'block', n: 8 }, { op: 'gold', n: 4 }, { op: 'if', cond: TEMP, ifText: 'this card is Tempered', then: [fxOn('gilt', 4)] }] }, flavor: 'Beaten flat. Holds more that way.' },
  { id: 'o_overbooked', name: 'Overbooked', hero: 'odile', type: 'attack', cost: 2, rarity: 'rare', school: 'echo', art: 'chain', target: 'enemy',
    fx: [{ op: 'dmg', n: 10 }, { op: 'if', cond: OVL, ifText: 'this card is Overloaded', then: [{ op: 'dmg', n: 6 }, fxOn('echo', 1)] }, { op: 'if', cond: { src: 'knots', gte: 4 }, ifText: 'the Line holds 4 or more knots', then: [fxOn('echo', 1)] }],
    up: { fx: [{ op: 'dmg', n: 13 }, { op: 'if', cond: OVL, ifText: 'this card is Overloaded', then: [{ op: 'dmg', n: 8 }, fxOn('echo', 1)] }, { op: 'if', cond: { src: 'knots', gte: 4 }, ifText: 'the Line holds 4 or more knots', then: [fxOn('echo', 1)] }] }, flavor: 'Three of you were booked into one seat.' },
];

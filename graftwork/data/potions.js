// Potions. { id, name, rarity, target 'self'|'enemy'|'none', text, fx: [ops] }
const allCards = (A) => [...A.c.hand, ...A.c.drawPile, ...A.c.discard, ...A.c.exhaust, ...A.c.powers];
const unjam = { op: 'custom', text: 'Unjam every card in your hand.', fn: (A) => { for (const k of A.c.hand) k.jam = false; } };
const untithe = { op: 'custom', text: 'No card is Tithed for the rest of this combat.', fn: (A) => { for (const k of allCards(A)) k.tithed = false; } };

export const POTION_LIST = [
  // ---------- common (9) ----------
  { id: 'p_smelling_salts', name: 'Smelling Salts', rarity: 'common', target: 'self', text: 'Gain 12 Block.', fx: [{ op: 'block', n: 12 }] },
  { id: 'p_tonic', name: 'Tonic', rarity: 'common', target: 'self', text: 'Heal 15 HP.', fx: [{ op: 'heal', n: 15 }] },
  { id: 'p_firebomb', name: 'Firebomb', rarity: 'common', target: 'none', text: 'Deal 12 damage to all enemies.', fx: [{ op: 'dmg', n: 12, to: 'all' }] },
  { id: 'p_sting', name: 'Sting Vial', rarity: 'common', target: 'enemy', text: 'Deal 20 damage.', fx: [{ op: 'dmg', n: 20 }] },
  { id: 'p_adrenaline', name: 'Adrenaline', rarity: 'common', target: 'self', text: 'Draw 3 cards.', fx: [{ op: 'draw', n: 3 }] },
  { id: 'p_bitter_draught', name: 'Bitter Draught', rarity: 'common', target: 'self', text: 'Remove all debuffs. Gain 6 Block.', fx: [{ op: 'cleanse' }, { op: 'block', n: 6 }] },
  { id: 'p_weak_tea', name: 'Weak Tea', rarity: 'common', target: 'none', text: 'Apply 3 Weak to all enemies.', fx: [{ op: 'status', s: 'weak', n: 3, to: 'all' }] },
  { id: 'p_unjam', name: 'Unjam Solvent', rarity: 'common', target: 'self', text: 'Unjam every card in your hand.', fx: [unjam] },
  { id: 'p_untithe', name: 'Absolution Drops', rarity: 'common', target: 'self', text: 'No card is Tithed for the rest of this combat.', fx: [untithe] },

  // ---------- uncommon (6) ----------
  { id: 'p_vapors', name: 'Vulnerable Vapors', rarity: 'uncommon', target: 'none', text: 'Apply 3 Vulnerable to all enemies.', fx: [{ op: 'status', s: 'vulnerable', n: 3, to: 'all' }] },
  { id: 'p_ether', name: 'Ether', rarity: 'uncommon', target: 'self', text: 'Gain 2 Energy.', fx: [{ op: 'energy', n: 2 }] },
  { id: 'p_burn_flask', name: 'Burn Flask', rarity: 'uncommon', target: 'enemy', text: 'Apply 12 Burn.', fx: [{ op: 'status', s: 'burn', n: 12 }] },
  { id: 'p_bleed_vial', name: 'Bleed Vial', rarity: 'uncommon', target: 'enemy', text: 'Apply 8 Bleed.', fx: [{ op: 'status', s: 'bleed', n: 8 }] },
  { id: 'p_strength_draught', name: 'Strength Draught', rarity: 'uncommon', target: 'self', text: 'Gain 3 Strength.', fx: [{ op: 'status', s: 'strength', n: 3, to: 'self' }] },
  { id: 'p_steady_hand', name: 'Steady Hand', rarity: 'uncommon', target: 'self', text: 'All Overload cards have already rolled Shatter this combat. None will Shatter.',
    fx: [{ op: 'custom', text: 'Every card counts as having already rolled its Shatter chance this combat.', fn: (A) => { for (const k of allCards(A)) k.rolled = true; } }] },

  // ---------- rare (3) ----------
  { id: 'p_remission', name: 'Remission', rarity: 'rare', target: 'self', text: 'Unjam your hand, forgive every Tithe this combat and gain 10 Block.', fx: [unjam, untithe, { op: 'block', n: 10 }] },
  { id: 'p_liquid_courage', name: 'Liquid Courage', rarity: 'rare', target: 'self', text: 'Gain 4 Strength and 4 Dexterity.',
    fx: [{ op: 'status', s: 'strength', n: 4, to: 'self' }, { op: 'status', s: 'dexterity', n: 4, to: 'self' }] },
  { id: 'p_plague_vial', name: 'Plague Vial', rarity: 'rare', target: 'none', text: 'Apply 10 Burn and 2 Vulnerable to all enemies.',
    fx: [{ op: 'status', s: 'burn', n: 10, to: 'all' }, { op: 'status', s: 'vulnerable', n: 2, to: 'all' }] },
];

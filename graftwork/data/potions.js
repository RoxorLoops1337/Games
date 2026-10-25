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

  // ---------- graft-system potions (content wave 2) ----------
  { id: 'p_strain_relief', name: 'Strain Relief', rarity: 'common', target: 'self', text: 'Gain 3 Block per Strain (max 12) and draw 1 card.',
    fx: [{ op: 'custom', text: 'Gain 3 Block per Strain (max 12).', fn: (A) => A.block(A.player, Math.min(12, 3 * A.c.strain.strain)) }, { op: 'draw', n: 1 }] },
  { id: 'p_tourniquet', name: 'Tourniquet', rarity: 'common', target: 'self', text: 'Gain 5 Block per grafted card in your hand (max 15).',
    fx: [{ op: 'custom', text: 'Gain 5 Block per grafted card in your hand (max 15).', fn: (A) => A.block(A.player, Math.min(15, 5 * A.c.hand.filter((k) => k.inst.grafts.length).length)) }] },
  { id: 'p_junk_flush', name: 'Junk Flush', rarity: 'common', target: 'self', text: 'Exhaust every junk card in your hand and gain 3 Block for each.',
    fx: [{ op: 'custom', text: 'Exhaust every junk card in your hand and gain 3 Block for each.', fn: (A) => {
      const junk = A.c.hand.filter((k) => k.inst.id.startsWith('j_'));
      for (const k of junk) { A.c.hand.splice(A.c.hand.indexOf(k), 1); A.c.exhaust.push(k); A.ev({ t: 'exhaust', card: k.uid }); A.block(A.player, 3); }
    } }] },
  { id: 'p_mend_seam', name: 'Mending Seam', rarity: 'common', target: 'self', text: 'Unjam your hand and draw 1 card per card unjammed (max 3).',
    fx: [{ op: 'custom', text: 'Unjam your hand and draw 1 card per card unjammed (max 3).', fn: (A) => { let n = 0; for (const k of A.c.hand) if (k.jam) { k.jam = false; n++; } if (n) A.draw(Math.min(3, n)); } }] },
  { id: 'p_borrowed_budget', name: 'Borrowed Budget', rarity: 'uncommon', target: 'self', text: 'For this combat, Budget is 2 higher: forgive up to 2 Tithes, then ease Backfire.',
    fx: [{ op: 'custom', text: 'For this combat, Budget is 2 higher: forgive up to 2 Tithes, then ease Backfire.', fn: (A) => {
      let left = 2;
      for (const k of [...A.c.hand, ...A.c.drawPile, ...A.c.discard, ...A.c.exhaust, ...A.c.powers]) { if (left > 0 && k.tithed) { k.tithed = false; left--; } }
      if (left > 0 && A.c.strain.overflow > 0) { A.c.strain.overflow = Math.max(0, A.c.strain.overflow - left); A.c.strain.backfire = Math.ceil(A.c.strain.overflow / 2); }
      A.c.strain.strain = Math.max(0, A.c.strain.strain - 2);
    } }] },
  { id: 'p_loaded_dice', name: 'Loaded Dice', rarity: 'uncommon', target: 'self', text: 'Overload cards in your hand cannot Shatter this combat. Gain 4 Block for each.',
    fx: [{ op: 'custom', text: 'Overload cards in your hand cannot Shatter this combat. Gain 4 Block for each.', fn: (A) => { for (const k of A.c.hand) if (k.inst.grafts.length > 2) { k.rolled = true; A.block(A.player, 4); } } }] },
  { id: 'p_tithe_transfer', name: 'Tithe Transfer', rarity: 'uncommon', target: 'self', text: 'Forgive every Tithed card in your hand. Tithe that many Bare cards in your draw pile instead.',
    fx: [{ op: 'custom', text: 'Forgive every Tithed card in your hand. Tithe that many Bare cards in your draw pile instead.', fn: (A) => {
      const mine = A.c.hand.filter((k) => k.tithed);
      for (const k of mine) k.tithed = false;
      const pool = A.rng.shuffle(A.c.drawPile.filter((k) => !k.tithed && k.inst.grafts.length === 0 && !k.inst.id.startsWith('j_')));
      for (let i = 0; i < mine.length && i < pool.length; i++) pool[i].tithed = true;
    } }] },
  { id: 'p_graft_serum', name: 'Graft Serum', rarity: 'uncommon', target: 'self', text: 'Gain 1 Echo, or 2 Echo if your hand holds a card with 2 or more grafts.',
    fx: [{ op: 'custom', text: 'Gain 1 Echo, or 2 Echo if your hand holds a card with 2 or more grafts.', fn: (A) => A.status(A.player, 'echo', A.c.hand.some((k) => k.inst.grafts.length >= 2) ? 2 : 1) }] },
  { id: 'p_amnesty', name: 'Amnesty', rarity: 'rare', target: 'self', text: 'Forgive every Tithe and clear Backfire for this combat. Gain 1 Energy.',
    fx: [untithe, { op: 'custom', text: 'Clear Backfire for this combat.', fn: (A) => { A.c.strain.backfire = 0; A.c.strain.overflow = 0; } }, { op: 'energy', n: 1 }] },
];

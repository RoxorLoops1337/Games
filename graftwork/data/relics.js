// Relics. { id, name, rarity 'start'|'common'|'uncommon'|'rare'|'boss'|'shop', text, mod?, on?, perk?, n? }
// Hooks get (A, payload, run). Per-combat scratch state lives in A.c.rx.
// perk names are read by engine/run.js (see the hand-off notes); `n` is the perk's number.
const S = (A) => A.c.rx || (A.c.rx = {});
const isJunk = (k) => k.inst.id.startsWith('j_');
const allCards = (A) => [...A.c.hand, ...A.c.drawPile, ...A.c.discard, ...A.c.exhaust, ...A.c.powers];
const isBare = (spec) => spec.grafts.length === 0 && (spec.type === 'attack' || spec.type === 'skill');

export const RELIC_LIST = [
  // ---------- starter kits ----------
  { id: 'r_marrow_kit', name: 'Surgical Kit', rarity: 'start', text: 'At the end of your turn, heal 2 if you lost HP this combat.',
    on: { turnEnd: (A) => { if (A.c.damageTakenThisCombat > 0) A.heal(A.player, 2); } } },
  { id: 'r_wick_kit', name: 'Match Case', rarity: 'start', text: 'On the first turn of each combat, draw 1 extra card.',
    on: { turnStart: (A) => { if (A.c.turn === 1) A.draw(1); } } },
  { id: 'r_odile_kit', name: 'Petty Cash Tin', rarity: 'start', text: 'Start each combat with 3 Gilt.',
    on: { combatStart: (A) => A.status(A.player, 'gilt', 3) } },

  // ---------- common (14) ----------
  { id: 'r_bandage_roll', name: 'Bandage Roll', rarity: 'common', text: 'Heal 4 HP at the end of each combat.', on: { combatEnd: (A) => A.heal(A.player, 4) } },
  { id: 'r_scar_tissue', name: 'Scar Tissue', rarity: 'common', text: 'Whenever you play a Tithed or jammed card, gain 3 Block.',
    on: { cardPlayed: (A, p) => { if (p.card.tithed || p.card.jam) A.block(A.player, 3); } } },
  { id: 'r_free_sample', name: 'Free Sample', rarity: 'common', text: 'The first graft Price you accept each act is waived.', perk: 'freeFirstGraft' },
  { id: 'r_cold_storage', name: 'Cold Storage', rarity: 'common', text: 'Budget +1.', mod: { budget: 1 } },
  { id: 'r_suture_thread', name: 'Suture Thread', rarity: 'common', text: 'Heal 5 HP after a combat fought with no Strain.',
    on: { combatEnd: (A) => { if (A.c.strain.strain === 0) A.heal(A.player, 5); } } },
  { id: 'r_tithe_receipt', name: 'Tithe Receipt', rarity: 'common', text: 'On turn 1, gain 3 Block per Tithed card (max 12).',
    on: { turnStart: (A) => { if (A.c.turn === 1) A.block(A.player, Math.min(12, 3 * A.c.strain.tithed.length)); } } },
  { id: 'r_bare_bones', name: 'Bare Bones', rarity: 'common', text: 'Whenever you play a Bare Attack or Skill, gain 1 Block.',
    on: { cardPlayed: (A, p) => { if (isBare(p.spec)) A.block(A.player, 1); } } },
  { id: 'r_junk_drawer', name: 'Junk Drawer', rarity: 'common', text: 'Whenever a junk card is exhausted, draw 1 card.',
    on: { exhaust: (A, p) => { if (isJunk(p.card)) A.draw(1); } } },
  { id: 'r_loose_thread', name: 'Loose Thread', rarity: 'common', text: 'Whenever you play a jammed card, draw 1 card.',
    on: { cardPlayed: (A, p) => { if (p.card.jam) A.draw(1); } } },
  { id: 'r_weighted_vest', name: 'Weighted Vest', rarity: 'common', text: 'At turn start, gain 2 Block per Strain (max 8).',
    on: { turnStart: (A) => A.block(A.player, Math.min(8, 2 * A.c.strain.strain)) } },
  { id: 'r_sterile_field', name: 'Sterile Field', rarity: 'common', text: 'Removing a graft at the Forge is free.', perk: 'stripFree' },
  { id: 'r_collection_plate', name: 'Collection Plate', rarity: 'common', text: 'After combat, gain 4 gold per Tithed card (max 12).',
    on: { combatEnd: (A) => A.gold(Math.min(12, 4 * A.c.strain.tithed.length)) } },
  { id: 'r_haggler', name: 'Haggler Glove', rarity: 'common', text: 'Gain 25% more gold from combats.', perk: 'goldBonus', n: 25 },
  { id: 'r_clean_hands', name: 'Clean Hands', rarity: 'common', text: 'Start each combat with 1 Strength if you have no Strain.',
    on: { combatStart: (A) => { if (A.c.strain.strain === 0) A.status(A.player, 'strength', 1); } } },
  { id: 'r_clotting_agent', name: 'Clotting Agent', rarity: 'common', text: 'When you take damage, unjam one card in your hand.',
    on: { damaged: (A) => { const k = A.c.hand.find((x) => x.jam); if (k) k.jam = false; } } },

  // ---------- uncommon (14) ----------
  { id: 'r_second_opinion', name: 'Second Opinion', rarity: 'uncommon', text: 'Graft offers show 4 options instead of 3.', perk: 'offer4' },
  { id: 'r_branding_iron', name: 'Branding Iron', rarity: 'uncommon', text: 'Boons are doubled on cards with 2 grafts, but their Prices hit 50% harder.', perk: 'brandingIron' },
  { id: 'r_second_look', name: 'Second Look', rarity: 'uncommon', text: 'Rerolling a graft offer costs nothing.', perk: 'rerollFree' },
  { id: 'r_shatter_ward', name: 'Shatter Ward', rarity: 'uncommon', text: 'Overload Shatter chance is 10% lower.', mod: { shatter: -0.1 } },
  { id: 'r_salvage_clamp', name: 'Salvage Clamp', rarity: 'uncommon', text: 'When a card Shatters, gain 1 Budget permanently.',
    on: { shatter: (A, p, run) => { run.budgetBonus = (run.budgetBonus | 0) + 1; } } },
  { id: 'r_overload_valve', name: 'Overload Valve', rarity: 'uncommon', text: 'Whenever you play an Overload card, gain 1 Energy.',
    on: { cardPlayed: (A, p) => { if (p.spec.overload) A.energy(1); } } },
  { id: 'r_strain_gauge', name: 'Strain Gauge', rarity: 'uncommon', text: 'At turn start, draw 1 card if you have 2 or more Strain.',
    on: { turnStart: (A) => { if (A.c.strain.strain >= 2) A.draw(1); } } },
  { id: 'r_heavy_seam', name: 'Heavy Seam', rarity: 'uncommon', text: 'Whenever you play a card with 2 or more grafts, gain 4 Block.',
    on: { cardPlayed: (A, p) => { if (p.spec.grafts.length >= 2) A.block(A.player, 4); } } },
  { id: 'r_bare_hands', name: 'Bare Hands', rarity: 'uncommon', text: 'Whenever you play a Bare Attack, deal 3 extra damage to its target.',
    on: { cardPlayed: (A, p) => { if (p.spec.type === 'attack' && p.spec.grafts.length === 0 && p.target && !p.target.dead) A.dmg(A.player, p.target, 3); } } },
  { id: 'r_unjam_oil', name: 'Unjam Oil', rarity: 'uncommon', text: 'At turn start, unjam one card in your hand.',
    on: { turnStart: (A) => { const k = A.c.hand.find((x) => x.jam); if (k) k.jam = false; } } },
  { id: 'r_indulgence', name: 'Indulgence', rarity: 'uncommon', text: 'At combat start, one Tithed card is forgiven.',
    on: { combatStart: (A) => { const k = allCards(A).find((x) => x.tithed); if (k) k.tithed = false; } } },
  { id: 'r_forge_hammer', name: 'Forge Hammer', rarity: 'uncommon', text: 'The Forge offers one extra option.', perk: 'forgeExtra' },
  { id: 'r_dust_collector', name: 'Dust Collector', rarity: 'uncommon', text: 'At turn start, gain 2 Block per junk card in your hand (max 8).',
    on: { turnStart: (A) => A.block(A.player, Math.min(8, 2 * A.c.hand.filter(isJunk).length)) } },
  { id: 'r_skip_prize', name: 'Clean Bill', rarity: 'uncommon', text: 'When you skip a graft, you may take two skip rewards.', perk: 'extraSkipChoice' },

  // ---------- rare (10) ----------
  { id: 'r_glass_saint', name: 'Glass Saint', rarity: 'rare', text: 'When a card Shatters, heal 10 HP and gain 30 gold.',
    on: { shatter: (A) => { A.heal(A.player, 10); A.gold(30); } } },
  { id: 'r_perfect_fit', name: 'Perfect Fit', rarity: 'rare', text: 'Start combat with 2 Strength and 2 Dexterity if graft weight exactly equals your Budget.',
    on: { combatStart: (A) => { if (A.c.strain.weight === A.c.strain.budget) { A.status(A.player, 'strength', 2); A.status(A.player, 'dexterity', 2); } } } },
  { id: 'r_debt_collector', name: 'Debt Collector', rarity: 'rare', text: 'Start combat with 1 Strength per Strain (max 4).',
    on: { combatStart: (A) => A.status(A.player, 'strength', Math.min(4, A.c.strain.strain)) } },
  { id: 'r_cold_vault', name: 'Cold Vault', rarity: 'rare', text: 'Budget +2.', mod: { budget: 2 } },
  { id: 'r_monolith', name: 'Monolith', rarity: 'rare', text: 'Whenever you play an Overload card, deal 8 damage to all enemies.',
    on: { cardPlayed: (A, p) => { if (p.spec.overload) for (const e of A.alive()) A.dmg(A.player, e, 8, { noMods: true }); } } },
  { id: 'r_toll_booth', name: 'Toll Booth', rarity: 'rare', text: 'Gain 10 gold every time you sew a graft.', perk: 'graftBounty', n: 10 },
  { id: 'r_usurer', name: 'Usurer', rarity: 'rare', text: 'After combat, gain 4 gold per Strain (max 16).',
    on: { combatEnd: (A) => A.gold(Math.min(16, 4 * A.c.strain.strain)) } },
  { id: 'r_jam_engine', name: 'Jam Engine', rarity: 'rare', text: 'At turn start, gain 1 Energy per jammed card in your hand (max 2).',
    on: { turnStart: (A) => { const n = Math.min(2, A.c.hand.filter((k) => k.jam).length); if (n) A.energy(n); } } },
  { id: 'r_pale_deck', name: 'Pale Deck', rarity: 'rare', text: 'The first Bare Attack or Skill you play each turn draws 1 card.',
    on: { cardPlayed: (A, p) => { const s = S(A); if (isBare(p.spec) && s.pale !== A.c.turn) { s.pale = A.c.turn; A.draw(1); } } } },
  { id: 'r_second_skin', name: 'Second Skin', rarity: 'rare', text: 'Once per combat, if you would die while under Strain, survive with 15 HP.',
    on: { wouldDie: (A) => {
      const s = S(A);
      if (A.player.hp <= 0 && !s.skin && A.c.strain.strain >= 1) { s.skin = true; A.player.hp = Math.min(A.player.maxHp, 15); A.ev({ t: 'heal', who: 'player', n: 15 }); }
    } } },

  // ---------- boss (6) ----------
  { id: 'r_second_wind', name: 'Brass Lung', rarity: 'boss', text: 'Gain 1 Energy each turn. Budget -2.', mod: { energy: 1, budget: -2 } },
  { id: 'r_gamblers_thread', name: 'Gambler\'s Thread', rarity: 'boss', text: 'Overload Shatter chance +25%. Playing an Overload card gains 2 Energy.', mod: { shatter: 0.25 },
    on: { cardPlayed: (A, p) => { if (p.spec.overload) A.energy(2); } } },
  { id: 'r_hollow_ledger', name: 'Hollow Ledger', rarity: 'boss', text: 'Budget +3. Draw 1 fewer card each turn.', mod: { budget: 3, hand: -1 } },
  { id: 'r_lead_apron', name: 'Lead Apron', rarity: 'boss', text: 'Block is not removed at turn start. Budget -1.', mod: { keepBlock: 1, budget: -1 } },
  { id: 'r_absolution', name: 'Absolution', rarity: 'boss', text: 'No card is ever Tithed. Draw 1 fewer card each turn.', mod: { hand: -1 },
    on: { combatStart: (A) => { for (const k of allCards(A)) k.tithed = false; } } },
  { id: 'r_parasite_heart', name: 'Parasite Heart', rarity: 'boss', text: 'Gain 1 Energy each turn. Lose 2 HP at turn start.', mod: { energy: 1 },
    on: { turnStart: (A) => A.loseHp(A.player, 2, { floor1: true, src: 'relic' }) } },

  // ---------- shop (3) ----------
  { id: 'r_pawn_ticket', name: 'Pawn Ticket', rarity: 'shop', text: 'Shop prices are 25% lower.', perk: 'shopDiscount', n: 25 },
  { id: 'r_budget_ledger', name: 'Budget Ledger', rarity: 'shop', text: 'Budget +1.', mod: { budget: 1 } },
  { id: 'r_pocket_surgeon', name: 'Pocket Surgeon', rarity: 'shop', text: 'After combat, heal 1 HP per graft in your deck (max 8).',
    on: { combatEnd: (A, p, run) => A.heal(A.player, Math.min(8, run.deck.reduce((a, i) => a + i.grafts.length, 0))) } },
];

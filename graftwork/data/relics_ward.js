// Ward relics (design/WARD.md section 9). `ward: true` keeps them out of classic runs (engine/run.js relicPool).
// Combat ones read the phase the Ward passes into the fight (A.c.wardMods.phase); the rest are run-level `perk`s read by engine/ward.js.
// perks: eveningHeal nightGold powerCap wardCap firstFree startRes handPlus move noDark shopBuild. Voice: no em dashes.
const ph = (A) => (A.c.wardMods && A.c.wardMods.phase) || null;
export const RELICS_WARD = [
  { id: 'r_w_noon_ration', name: 'Noon Ration', rarity: 'common', ward: true, text: 'At midday, draw 1 extra card on the first turn of each fight.',
    on: { turnStart: (A) => { if (A.c.turn === 1 && ph(A) === 'midday') A.draw(1); } } },
  { id: 'r_w_high_sun', name: 'High Sun Tonic', rarity: 'uncommon', ward: true, text: 'At midday, start each fight with 1 Strength.',
    on: { combatStart: (A) => { if (ph(A) === 'midday') A.status(A.player, 'strength', 1); } } },
  { id: 'r_w_moon_lamp', name: 'Moon Lamp', rarity: 'common', ward: true, text: 'At night, start each fight with 6 Block.',
    on: { combatStart: (A) => { if (ph(A) === 'night') A.block(A.player, 6); } } },
  { id: 'r_w_dinner_gong', name: 'Dinner Gong', rarity: 'boss', ward: true, text: 'At evening, gain 1 energy on the first turn of each fight.',
    on: { turnStart: (A) => { if (A.c.turn === 1 && ph(A) === 'evening') A.energy(1); } } },
  { id: 'r_w_supper_bell', name: 'Supper Bell', rarity: 'uncommon', ward: true, perk: 'eveningHeal', n: 2, text: 'At evening, every room you walk into heals you 2.' },
  { id: 'r_w_night_ledger', name: 'Night Ledger', rarity: 'common', ward: true, perk: 'nightGold', n: 1, text: 'At night, every monster you beat pays 1 more gold.' },
  { id: 'r_w_spare_fuse', name: 'Spare Fuse', rarity: 'common', ward: true, perk: 'powerCap', n: 1, text: '+1 power capacity.' },
  { id: 'r_w_extra_cot', name: 'Extra Cot', rarity: 'uncommon', ward: true, perk: 'wardCap', n: 1, text: 'Wards hold 1 more monster (6 instead of 5).' },
  { id: 'r_w_master_key', name: 'Master Key', rarity: 'boss', ward: true, perk: 'firstFree', n: 1, text: 'The first room card you play each morning costs nothing.' },
  { id: 'r_w_stockpile_deed', name: 'Stockpile Deed', rarity: 'common', ward: true, perk: 'startRes', n: 2, text: '+2 wood and +2 stone now, and at the start of every floor.',
    pickup: (run) => { if (run.ward) { run.ward.res.wood += 2; run.ward.res.stone += 2; } } },
  { id: 'r_w_dawn_whistle', name: 'Dawn Whistle', rarity: 'rare', ward: true, perk: 'handPlus', n: 1, text: 'Draw 1 more building card each morning.' },
  { id: 'r_w_walking_shoes', name: 'Walking Shoes', rarity: 'rare', ward: true, perk: 'move', n: 1, text: '+1 MOVE on every walk.' },
  { id: 'r_w_hard_hat', name: 'Hard Hat', rarity: 'uncommon', ward: true, perk: 'noDark', n: 1, text: 'Dark rooms cost no HP to cross.' },
  { id: 'r_w_dispatch_ledger', name: 'Dispatch Ledger', rarity: 'shop', ward: true, perk: 'shopBuild', n: 1, text: 'The Dispensary offers 1 more building card.' },
];

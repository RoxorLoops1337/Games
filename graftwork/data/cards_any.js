// Neutral cards any hero can find in shops and events.
const C = (id, name, type, cost, rarity, target, flavor, fx, up, flags = {}) => ({ id, name, hero: 'any', type, cost, rarity, target, flavor, flags, fx, up });
export const CARDS_ANY = [
  // common
  C('x_jab', 'Clinical Jab', 'attack', 1, 'common', 'enemy', 'Quick, precise, billed separately.', [{ op: 'dmg', n: 7 }], { fx: [{ op: 'dmg', n: 9 }] }),
  C('x_haymaker', 'Haymaker', 'attack', 2, 'common', 'enemy', 'Bedside manner not included.', [{ op: 'dmg', n: 13 }], { fx: [{ op: 'dmg', n: 17 }] }),
  C('x_sweep', 'Orderly Sweep', 'attack', 1, 'common', 'all', 'Everyone out of the ward.', [{ op: 'dmg', n: 5, to: 'all' }], { fx: [{ op: 'dmg', n: 7, to: 'all' }] }),
  C('x_brace', 'Brace', 'skill', 1, 'common', 'self', 'Lean into the splint.', [{ op: 'block', n: 6 }], { fx: [{ op: 'block', n: 8 }] }),
  C('x_gauze', 'Fresh Dressing', 'skill', 1, 'common', 'self', 'Changed twice daily. Once, today.', [{ op: 'block', n: 5 }, { op: 'draw', n: 1 }], { fx: [{ op: 'block', n: 7 }, { op: 'draw', n: 1 }] }),
  C('x_shrug', 'Shrug It Off', 'skill', 1, 'common', 'self', 'Pain is just paperwork.', [{ op: 'block', n: 5 }, { op: 'draw', n: 1 }], { fx: [{ op: 'block', n: 6 }, { op: 'draw', n: 2 }] }),
  C('x_second', 'Second Opinion', 'skill', 0, 'common', 'self', 'Same diagnosis, higher fee.', [{ op: 'draw', n: 2 }, { op: 'hp', n: 2 }], { fx: [{ op: 'draw', n: 3 }, { op: 'hp', n: 2 }] }),
  // uncommon
  C('x_lunge', 'Weak Point', 'attack', 1, 'uncommon', 'enemy', 'Found by pressing until it hurts.', [{ op: 'dmg', n: 6 }, { op: 'status', s: 'vulnerable', n: 1, to: 'enemy' }], { fx: [{ op: 'dmg', n: 8 }, { op: 'status', s: 'vulnerable', n: 2, to: 'enemy' }] }),
  C('x_cleave', 'Ward Round', 'attack', 2, 'uncommon', 'all', 'You see every patient. Briefly.', [{ op: 'dmg', n: 12, to: 'all' }], { fx: [{ op: 'dmg', n: 16, to: 'all' }] }),
  C('x_recall', 'Chart Review', 'skill', 1, 'uncommon', 'self', 'Page three, you did that already.', [{ op: 'fetch', n: 1, from: 'discard' }, { op: 'block', n: 4 }], { fx: [{ op: 'fetch', n: 2, from: 'discard' }, { op: 'block', n: 4 }] }),
  C('x_hold', 'Hold Still', 'skill', 1, 'uncommon', 'self', 'This will only hurt you.', [{ op: 'block', n: 8 }], { fx: [{ op: 'block', n: 11 }] }, { retain: true }),
  C('x_barbs', 'Barbed Sutures', 'power', 1, 'uncommon', 'self', 'They pull both ways.', [{ op: 'status', s: 'thorns', n: 3, to: 'self' }], { fx: [{ op: 'status', s: 'thorns', n: 5, to: 'self' }] }),
  C('x_poise', 'Steady Hands', 'power', 1, 'uncommon', 'self', 'Caffeine, mostly.', [{ op: 'status', s: 'dexterity', n: 1, to: 'self' }], { fx: [{ op: 'status', s: 'dexterity', n: 2, to: 'self' }] }),
  // rare
  C('x_resolve', 'Resolve', 'power', 2, 'rare', 'self', 'A prescription of spite.', [{ op: 'status', s: 'ritual', n: 1, to: 'self' }], { fx: [{ op: 'status', s: 'ritual', n: 2, to: 'self' }] }),
  C('x_plate', 'Surgical Plating', 'power', 2, 'rare', 'self', 'Installed without anaesthetic.', [{ op: 'status', s: 'plated', n: 4, to: 'self' }, { op: 'status', s: 'regen', n: 2, to: 'self' }], { fx: [{ op: 'status', s: 'plated', n: 6, to: 'self' }, { op: 'status', s: 'regen', n: 3, to: 'self' }] }),
  C('x_flatline', 'Flatline', 'skill', 2, 'rare', 'self', 'Briefly nothing can touch you.', [{ op: 'status', s: 'intangible', n: 1, to: 'self' }], { fx: [{ op: 'status', s: 'intangible', n: 1, to: 'self' }], cost: 1 }, { exhaust: true }),
  C('x_adrenal', 'Adrenaline Shot', 'skill', 0, 'rare', 'self', 'Side effects include everything.', [{ op: 'energy', n: 2 }, { op: 'draw', n: 2 }], { fx: [{ op: 'energy', n: 2 }, { op: 'draw', n: 3 }] }, { exhaust: true }),
];

// Grafts. { id, name, school, weight 1-3, tier 'safe'|'greedy'|'weird', rarity, boon, price, mods: [...], types?, ok?(spec), not?: [ids] }
// Mod kinds: see engine/cards.js applyMod. A graft always has a boon AND a price (the price may be a mod or maxHp).
// SAFE tier: weight 1, a small clear boon, a plain local price.
const hasOp = (s, op) => s.fx.some((o) => o.op === op);
const hits = (s) => hasOp(s, 'dmg') && (s.target === 'enemy' || s.target === 'all');
const num = (s) => s.cost !== 'X';
const cheap = (s) => s.cost === 0 || s.cost === 1;
const noRes = (s) => !hasOp(s, 'draw') && !hasOp(s, 'energy');
const G = (id, name, school, rarity, boon, price, mods, extra = {}) => ({ id, name, school, weight: 1, tier: 'safe', rarity, boon, price, mods, ...extra });

export const GRAFTS_SAFE = [
  // ---- ember ----
  G('g_ember_pin', 'Ember Pin', 'ember', 'common', 'Apply 3 Burn.', 'Lose 2 HP when played.',
    [{ k: 'addFx', fx: [{ op: 'status', s: 'burn', n: 3 }] }, { k: 'selfHurt', n: 2 }], { ok: hits }),
  G('g_cinder_wrap', 'Cinder Wrap', 'ember', 'common', 'Costs 1 less. +25% numbers.', 'Exhaust.',
    [{ k: 'cost', d: -1 }, { k: 'pct', pct: 25 }, { k: 'flag', f: 'exhaust' }], { types: ['attack'], ok: (s) => num(s) && s.cost >= 1 && !s.flags.exhaust }),
  G('g_scorch_thread', 'Scorch Thread', 'ember', 'uncommon', '+50% numbers. Apply 2 Burn.', '25% chance to jam. Lose 1 HP when played.',
    [{ k: 'pct', pct: 50 }, { k: 'addFx', fx: [{ op: 'status', s: 'burn', n: 2 }] }, { k: 'jam', p: 0.25 }, { k: 'selfHurt', n: 1 }], { ok: hits }),
  G('g_kiln_seam', 'Kiln Seam', 'ember', 'rare', 'Hits all enemies. Apply 2 Burn to all enemies.', 'Exhaust. Add a Rust Flake to your draw pile each combat.',
    [{ k: 'aoe' }, { k: 'addFx', fx: [{ op: 'status', s: 'burn', n: 2, to: 'all' }] }, { k: 'flag', f: 'exhaust' }, { k: 'junk', card: 'j_flake', n: 1, to: 'draw' }],
    { types: ['attack'], ok: (s) => hits(s) && !s.flags.exhaust }),

  // ---- echo ----
  G('g_held_breath', 'Held Breath', 'echo', 'common', 'Retain. Draw 2.', 'Draw 1 fewer card next turn.',
    [{ k: 'flag', f: 'retain' }, { k: 'addFx', fx: [{ op: 'draw', n: 2 }] }, { k: 'drawdown', n: 1 }], { ok: (s) => !s.flags.ethereal }),
  G('g_lead_thread', 'Lead Thread', 'echo', 'common', 'Innate. Draw 2.', 'Ethereal.',
    [{ k: 'flag', f: 'innate' }, { k: 'addFx', fx: [{ op: 'draw', n: 2 }] }, { k: 'flag', f: 'ethereal' }], { ok: (s) => !s.flags.retain && !s.flags.ethereal }),
  G('g_borrowed_pulse', 'Borrowed Pulse', 'echo', 'uncommon', 'Gain 2 Energy when played.', 'Exhaust. Lose 1 HP when played.',
    [{ k: 'addFx', fx: [{ op: 'energy', n: 2 }] }, { k: 'flag', f: 'exhaust' }, { k: 'selfHurt', n: 1 }], { types: ['attack', 'skill'], ok: (s) => num(s) && s.cost >= 1 && !s.flags.exhaust }),
  G('g_second_pulse', 'Second Pulse', 'echo', 'uncommon', 'Plays twice.', 'Costs 1 more.',
    [{ k: 'repeat', n: 1 }, { k: 'cost', d: 1 }], { types: ['attack', 'skill'], ok: (s) => num(s) && cheap(s) && noRes(s) && (hasOp(s, 'dmg') || hasOp(s, 'block')) }),

  // ---- hoard ----
  G('g_quick_hands', 'Quick Hands', 'hoard', 'common', 'Innate. +25% numbers.', 'Lose 1 HP when played.',
    [{ k: 'flag', f: 'innate' }, { k: 'pct', pct: 25 }, { k: 'selfHurt', n: 1 }]),
  G('g_brass_staple', 'Brass Staple', 'hoard', 'common', 'Gain 5 gold when played.', 'Lose 1 HP when played.',
    [{ k: 'addFx', fx: [{ op: 'gold', n: 5 }] }, { k: 'selfHurt', n: 1 }]),
  G('g_ledger_clasp', 'Ledger Clasp', 'hoard', 'common', 'Retain. Gain 6 Block when played.', 'Draw 1 fewer card next turn.',
    [{ k: 'flag', f: 'retain' }, { k: 'addFx', fx: [{ op: 'block', n: 6, to: 'self' }] }, { k: 'drawdown', n: 1 }], { ok: (s) => !s.flags.ethereal }),
  G('g_pawn_tag', 'Pawn Tag', 'hoard', 'uncommon', '+50% numbers. Gain 4 gold when played.', 'Costs 1 more.',
    [{ k: 'pct', pct: 50 }, { k: 'addFx', fx: [{ op: 'gold', n: 4 }] }, { k: 'cost', d: 1 }], { ok: (s) => num(s) && s.cost <= 2 && (hasOp(s, 'dmg') || hasOp(s, 'block')) }),
  G('g_vault_seal', 'Vault Seal', 'hoard', 'rare', 'Costs 1 less. Retain. Gain 4 gold when played.', 'Exhaust. 15% chance to jam.',
    [{ k: 'cost', d: -1 }, { k: 'flag', f: 'retain' }, { k: 'addFx', fx: [{ op: 'gold', n: 4 }] }, { k: 'flag', f: 'exhaust' }, { k: 'jam', p: 0.15 }],
    { types: ['attack', 'skill'], ok: (s) => num(s) && s.cost >= 1 && !s.flags.exhaust && !s.flags.ethereal }),

  // ---- blood ----
  G('g_sutured_seam', 'Sutured Seam', 'blood', 'common', 'Lifesteal.', '15% chance to jam.',
    [{ k: 'lifesteal' }, { k: 'jam', p: 0.15 }], { ok: hits }),
  G('g_nicked_vein', 'Nicked Vein', 'blood', 'common', 'Apply 3 Bleed.', 'Lose 2 HP when played.',
    [{ k: 'addFx', fx: [{ op: 'status', s: 'bleed', n: 3 }] }, { k: 'selfHurt', n: 2 }], { ok: hits }),
  G('g_red_cuff', 'Red Cuff', 'blood', 'uncommon', 'Heal 5. Draw 1.', 'Exhaust. Add a Clot to your discard pile when played.',
    [{ k: 'addFx', fx: [{ op: 'heal', n: 5 }, { op: 'draw', n: 1 }] }, { k: 'flag', f: 'exhaust' }, { k: 'junk', card: 'j_clot', n: 1, to: 'discard', when: 'onPlay' }],
    { types: ['skill'], ok: (s) => !s.flags.exhaust }),
  G('g_hot_clamp', 'Hot Clamp', 'blood', 'rare', 'Gain 2 Strength when played.', 'Exhaust. Lose 3 HP when played.',
    [{ k: 'addFx', fx: [{ op: 'status', s: 'strength', n: 2, to: 'self' }] }, { k: 'flag', f: 'exhaust' }, { k: 'selfHurt', n: 3 }],
    { types: ['attack', 'skill'], ok: (s) => !s.flags.exhaust }),

  // ---- rust ----
  G('g_oxide_patch', 'Oxide Patch', 'rust', 'common', 'Gain 6 Block when played.', 'Numbers 25% lower. Lose 1 HP when played.',
    [{ k: 'addFx', fx: [{ op: 'block', n: 6, to: 'self' }] }, { k: 'pct', pct: -25 }, { k: 'selfHurt', n: 1 }], { types: ['attack'], ok: hits }),
  G('g_pitted_edge', 'Pitted Edge', 'rust', 'common', 'Apply 2 Weak.', 'Add a Rust Flake to your draw pile each combat.',
    [{ k: 'addFx', fx: [{ op: 'status', s: 'weak', n: 2 }] }, { k: 'junk', card: 'j_flake', n: 1, to: 'draw' }], { ok: hits }),
  G('g_pitting_salt', 'Pitting Salt', 'rust', 'uncommon', 'Apply 3 Vulnerable.', 'Costs 1 more.',
    [{ k: 'addFx', fx: [{ op: 'status', s: 'vulnerable', n: 3 }] }, { k: 'cost', d: 1 }], { ok: (s) => hits(s) && num(s) && s.cost <= 2 }),
  G('g_scrap_hide', 'Scrap Hide', 'rust', 'uncommon', 'Gain 2 Thorns when played.', 'Exhaust. Gain 1 Frail when played.',
    [{ k: 'addFx', fx: [{ op: 'status', s: 'thorns', n: 2, to: 'self' }] }, { k: 'flag', f: 'exhaust' }, { k: 'selfStatus', s: 'frail', n: 1 }],
    { types: ['skill'], ok: (s) => !s.flags.exhaust }),

  // ---- static ----
  G('g_ground_wire', 'Ground Wire', 'static', 'common', 'Gain 3 Charge when played.', 'Lose 1 HP when played.',
    [{ k: 'addFx', fx: [{ op: 'status', s: 'charge', n: 3, to: 'self' }] }, { k: 'selfHurt', n: 1 }], { types: ['attack', 'skill'], ok: (s) => s.hero === 'wick' }),
  G('g_arc_clip', 'Arc Clip', 'static', 'common', 'Hits all enemies.', 'Numbers 25% lower.',
    [{ k: 'aoe' }, { k: 'pct', pct: -25 }], { types: ['attack'], ok: (s) => hits(s) && s.target === 'enemy' && cheap(s) }),
  G('g_live_lead', 'Live Lead', 'static', 'uncommon', 'Draw 2. Gain 3 Charge when played.', 'Exhaust. Add a Static to your discard pile each combat.',
    [{ k: 'addFx', fx: [{ op: 'draw', n: 2 }, { op: 'status', s: 'charge', n: 3, to: 'self' }] }, { k: 'flag', f: 'exhaust' }, { k: 'junk', card: 'j_static', n: 1, to: 'discard' }],
    { types: ['attack', 'skill'], ok: (s) => !s.flags.exhaust }),
  G('g_capacitor', 'Capacitor', 'static', 'rare', 'Plays twice. Gain 1 Charge when played.', 'Exhaust. 25% chance to jam.',
    [{ k: 'repeat', n: 1 }, { k: 'addFx', fx: [{ op: 'status', s: 'charge', n: 1, to: 'self' }] }, { k: 'flag', f: 'exhaust' }, { k: 'jam', p: 0.25 }],
    { types: ['attack'], ok: (s) => hits(s) && num(s) && s.cost <= 2 && noRes(s) && !s.flags.exhaust }),

  // ---- gilded ----
  G('g_leaf_gilt', 'Leaf Gilt', 'gilded', 'common', 'Gain 4 Gilt when played.', 'Lose 1 HP when played.',
    [{ k: 'addFx', fx: [{ op: 'status', s: 'gilt', n: 4, to: 'self' }] }, { k: 'selfHurt', n: 1 }]),
  G('g_heavy_leaf', 'Heavy Leaf', 'gilded', 'common', '+50% numbers.', 'Draw 1 fewer card next turn.',
    [{ k: 'pct', pct: 50 }, { k: 'drawdown', n: 1 }], { ok: (s) => num(s) && s.cost >= 2 && (hasOp(s, 'dmg') || hasOp(s, 'block')) }),
  G('g_gauze_wrap', 'Gauze Wrap', 'gilded', 'common', 'Retain. Gain 9 Block when played.', 'Costs 1 more.',
    [{ k: 'flag', f: 'retain' }, { k: 'addFx', fx: [{ op: 'block', n: 9, to: 'self' }] }, { k: 'cost', d: 1 }], { types: ['attack', 'skill'], ok: (s) => num(s) && s.cost <= 1 && !s.flags.ethereal }),
  G('g_gilt_plating', 'Gilt Plating', 'gilded', 'uncommon', 'Gain 3 Plated when played.', 'Exhaust. Lose 1 HP when played.',
    [{ k: 'addFx', fx: [{ op: 'status', s: 'plated', n: 3, to: 'self' }] }, { k: 'flag', f: 'exhaust' }, { k: 'selfHurt', n: 1 }], { types: ['skill'], ok: (s) => !s.flags.exhaust }),
  G('g_gilded_hem', 'Gilded Hem', 'gilded', 'rare', 'Costs 1 less. +25% numbers. Gain 3 gold when played.', 'Exhaust. Lose 2 HP when played.',
    [{ k: 'cost', d: -1 }, { k: 'pct', pct: 25 }, { k: 'addFx', fx: [{ op: 'gold', n: 3 }] }, { k: 'flag', f: 'exhaust' }, { k: 'selfHurt', n: 2 }],
    { types: ['attack', 'skill'], ok: (s) => num(s) && s.cost >= 2 && !s.flags.exhaust }),
];

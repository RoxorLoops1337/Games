// GREEDY grafts: weight 2 to 3, a big boon with a heavy price. Never common.
const dmg = (s) => s.fx.some((o) => o.op === 'dmg');
const blk = (s) => s.fx.some((o) => o.op === 'block');
const either = (s) => dmg(s) || blk(s);
const A = ['attack'];
const AS = ['attack', 'skill'];
const SP = ['skill', 'power'];
const ALL = ['attack', 'skill', 'power'];
const G = (o) => ({ tier: 'greedy', ...o });

export const GRAFTS_GREEDY = [
  { id: 'g_echo_chamber', name: 'Echo Chamber', school: 'echo', weight: 3, tier: 'greedy', rarity: 'uncommon', boon: 'Plays twice.', price: 'Shuffle 2 Ringing into your deck each combat.', mods: [{ k: 'repeat', n: 1 }, { k: 'junk', card: 'j_ringing', n: 2, to: 'draw' }] },

  // ember
  G({ id: 'g_cinder_lung', name: 'Cinder Lung', school: 'ember', weight: 3, rarity: 'rare', types: A, ok: dmg,
    boon: 'Apply 7 Burn.', price: 'Costs 1 more. Lose 3 HP each play.',
    mods: [{ k: 'addFx', fx: [{ op: 'status', s: 'burn', n: 7, to: 'enemy' }] }, { k: 'cost', d: 1 }, { k: 'selfHurt', n: 3 }] }),
  G({ id: 'g_kiln_heart', name: 'Kiln Heart', school: 'ember', weight: 2, rarity: 'uncommon', types: A, ok: dmg,
    boon: 'Hits all enemies. Numbers +50%.', price: 'Exhaust. Lose 3 HP each play.',
    mods: [{ k: 'aoe' }, { k: 'pct', pct: 50 }, { k: 'flag', f: 'exhaust' }, { k: 'selfHurt', n: 3 }] }),
  G({ id: 'g_slow_pyre', name: 'Slow Pyre', school: 'ember', weight: 3, rarity: 'rare', types: SP,
    boon: 'Gain 3 Ember Aura.', price: 'Lose 6 max HP when grafted. 33% jam.',
    mods: [{ k: 'addFx', fx: [{ op: 'status', s: 'emberaura', n: 3, to: 'self' }] }, { k: 'maxHp', n: -6 }, { k: 'jam', p: 0.33 }] }),

  // echo
  G({ id: 'g_second_skin', name: 'Second Skin', school: 'echo', weight: 3, rarity: 'rare', types: AS, ok: either,
    boon: 'Plays twice. Numbers +25%.', price: 'Costs 1 more. Exhaust.',
    mods: [{ k: 'repeat', n: 1 }, { k: 'pct', pct: 25 }, { k: 'cost', d: 1 }, { k: 'flag', f: 'exhaust' }] }),
  G({ id: 'g_double_spine', name: 'Double Spine', school: 'echo', weight: 2, rarity: 'uncommon', types: A, ok: dmg,
    boon: 'Plays twice.', price: '40% jam. Lose 2 HP each play.',
    mods: [{ k: 'repeat', n: 1 }, { k: 'jam', p: 0.4 }, { k: 'selfHurt', n: 2 }] }),
  G({ id: 'g_hollow_bell', name: 'Hollow Bell', school: 'echo', weight: 3, rarity: 'rare', types: SP,
    boon: 'Gain 2 Energy.', price: 'Draw 2 fewer next turn. Shuffle 2 Ringing into your deck each combat.',
    mods: [{ k: 'addFx', fx: [{ op: 'energy', n: 2 }] }, { k: 'drawdown', n: 2 }, { k: 'junk', card: 'j_ringing', n: 2, to: 'draw' }] }),

  // hoard
  G({ id: 'g_pack_rat', name: 'Pack Rat', school: 'hoard', weight: 2, rarity: 'uncommon', types: ALL,
    boon: 'Draw 2 cards first.', price: 'Shuffle 2 Paperwork into your deck each combat. Lose 2 HP each play.',
    mods: [{ k: 'addFx', pos: 'start', fx: [{ op: 'draw', n: 2 }] }, { k: 'junk', card: 'j_paperwork', n: 2, to: 'draw' }, { k: 'selfHurt', n: 2 }] }),
  G({ id: 'g_dead_weight', name: 'Dead Weight', school: 'hoard', weight: 3, rarity: 'rare', types: AS, ok: either,
    boon: 'Retain. Innate. Numbers +100%.', price: 'Costs 1 more. Lose 4 max HP when grafted.',
    mods: [{ k: 'flag', f: 'retain' }, { k: 'flag', f: 'innate' }, { k: 'pct', pct: 100 }, { k: 'cost', d: 1 }, { k: 'maxHp', n: -4 }] }),
  G({ id: 'g_full_larder', name: 'Full Larder', school: 'hoard', weight: 2, rarity: 'uncommon', types: AS,
    boon: 'Gain 14 Block. Retain.', price: 'Draw 2 fewer next turn. 25% jam.',
    mods: [{ k: 'addFx', fx: [{ op: 'block', n: 14 }] }, { k: 'flag', f: 'retain' }, { k: 'drawdown', n: 2 }, { k: 'jam', p: 0.25 }] }),

  // blood
  G({ id: 'g_borrowed_heart', name: 'Borrowed Heart', school: 'blood', weight: 3, rarity: 'rare', types: A, ok: dmg,
    boon: 'Lifesteal. Numbers +50%.', price: 'Lose 6 max HP when grafted. Lose 3 HP each play.',
    mods: [{ k: 'lifesteal', cap: 6 }, { k: 'pct', pct: 50 }, { k: 'maxHp', n: -6 }, { k: 'selfHurt', n: 3 }] }),
  G({ id: 'g_open_vein', name: 'Open Vein', school: 'blood', weight: 2, rarity: 'uncommon', types: A, ok: dmg,
    boon: 'Apply 3 Vulnerable. Numbers +50%.', price: 'Lose 4 HP each play.',
    mods: [{ k: 'addFx', fx: [{ op: 'status', s: 'vulnerable', n: 3, to: 'enemy' }] }, { k: 'pct', pct: 50 }, { k: 'selfHurt', n: 4 }] }),
  G({ id: 'g_red_ledger', name: 'Red Ledger', school: 'blood', weight: 3, rarity: 'rare', types: SP,
    boon: 'Heal 8 and gain 8 Block.', price: 'Lose 8 max HP when grafted. Add a Clot to your hand.',
    mods: [{ k: 'addFx', fx: [{ op: 'heal', n: 8 }, { op: 'block', n: 8 }] }, { k: 'maxHp', n: -8 }, { k: 'junk', card: 'j_clot', n: 1, to: 'hand', when: 'onPlay' }] }),

  // rust
  G({ id: 'g_rotten_plating', name: 'Rotten Plating', school: 'rust', weight: 2, rarity: 'uncommon', types: AS, ok: blk,
    boon: 'Block +100%.', price: 'Shuffle 2 Clots into your deck each combat.',
    mods: [{ k: 'pct', pct: 100 }, { k: 'junk', card: 'j_clot', n: 2, to: 'draw' }] }),
  G({ id: 'g_seized_joint', name: 'Seized Joint', school: 'rust', weight: 3, rarity: 'rare', types: A, ok: dmg,
    boon: 'Costs 1 less. Hits all enemies.', price: 'Exhaust. Add a Clot to your hand.',
    mods: [{ k: 'cost', d: -1 }, { k: 'aoe' }, { k: 'flag', f: 'exhaust' }, { k: 'junk', card: 'j_clot', n: 1, to: 'hand', when: 'onPlay' }] }),
  G({ id: 'g_scrap_debt', name: 'Scrap Debt', school: 'rust', weight: 2, rarity: 'uncommon', types: AS, ok: either,
    boon: 'Costs 1 less. Numbers +50%.', price: 'Shuffle 2 Rust Flakes into your deck each combat. Lose 2 HP each play.',
    mods: [{ k: 'cost', d: -1 }, { k: 'pct', pct: 50 }, { k: 'junk', card: 'j_flake', n: 2, to: 'draw' }, { k: 'selfHurt', n: 2 }] }),

  // static
  G({ id: 'g_live_wire', name: 'Live Wire', school: 'static', weight: 3, rarity: 'rare', types: A, ok: dmg,
    boon: 'Also deal 10 to all enemies.', price: '33% jam. Lose 3 HP each play.',
    mods: [{ k: 'addFx', fx: [{ op: 'dmg', n: 10, to: 'all' }] }, { k: 'jam', p: 0.33 }, { k: 'selfHurt', n: 3 }] }),
  G({ id: 'g_overclock', name: 'Overclock', school: 'static', weight: 2, rarity: 'uncommon', types: ALL,
    boon: 'Gain 2 Energy and 3 Charge.', price: 'Draw 2 fewer next turn. Lose 2 HP each play.',
    mods: [{ k: 'addFx', fx: [{ op: 'energy', n: 2 }, { op: 'status', s: 'charge', n: 3, to: 'self' }] }, { k: 'drawdown', n: 2 }, { k: 'selfHurt', n: 2 }] }),
  G({ id: 'g_arc_fault', name: 'Arc Fault', school: 'static', weight: 3, rarity: 'rare', types: A, ok: dmg,
    boon: 'Hits all enemies twice.', price: 'Costs 1 more. Shuffle 2 Static into your deck each combat.',
    mods: [{ k: 'aoe' }, { k: 'repeat', n: 1 }, { k: 'cost', d: 1 }, { k: 'junk', card: 'j_static', n: 2, to: 'draw' }] }),

  // gilded
  G({ id: 'g_gold_tooth', name: 'Gold Tooth', school: 'gilded', weight: 2, rarity: 'uncommon', types: AS, ok: either,
    boon: 'Numbers +100%.', price: 'Costs 6 gold each play.',
    mods: [{ k: 'pct', pct: 100 }, { k: 'goldCost', n: 6 }] }),
  G({ id: 'g_tax_haven', name: 'Tax Haven', school: 'gilded', weight: 3, rarity: 'rare', types: SP,
    boon: 'Gain 5 Gilt and 12 Block.', price: 'Costs 8 gold each play. Lose 4 max HP when grafted.',
    mods: [{ k: 'addFx', fx: [{ op: 'status', s: 'gilt', n: 5, to: 'self' }, { op: 'block', n: 12 }] }, { k: 'goldCost', n: 8 }, { k: 'maxHp', n: -4 }] }),
  G({ id: 'g_gilt_edge', name: 'Gilt Edge', school: 'gilded', weight: 3, rarity: 'rare', types: A, ok: dmg,
    boon: 'Costs 1 less. Plays twice.', price: 'Costs 10 gold each play. Exhaust.',
    mods: [{ k: 'cost', d: -1 }, { k: 'repeat', n: 1 }, { k: 'goldCost', n: 10 }, { k: 'flag', f: 'exhaust' }] }),
];

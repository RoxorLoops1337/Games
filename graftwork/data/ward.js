// THE WARD (design/WARD.md): rooms, building cards, phases, floors. Pure data, no imports (data/index.js re-exports it).
// Ids: rooms rm_*, building cards b_*. Never rename (saves and unlocks reference them). Voice: no em dashes.
// Costs: wood and stone are Ward resources; gold is the run's gold (the doc's "gold-leaf": 1 leaf = 20 gold).

// spawn.kind: fight | elite | event | shop | forge | rest | boss. every = days between spawns (counted at the start of
// each morning, only while the room is ON). cap = most contents the room holds. produce = per morning while ON.
export const ROOMS = {
  rm_entrance: { id: 'rm_entrance', name: 'Entrance', cost: {}, power: 0, fixed: true, spawn: null, hint: 'Where you start each floor. It never spawns anything.', art: 'ward_entrance' },
  rm_theatre: { id: 'rm_theatre', name: 'Operating Theatre', cost: {}, power: 0, fixed: true, spawn: { kind: 'boss' }, hint: 'The act boss scrubs in here. Open from two days before the last; on the last night you are pulled in.', art: 'ward_theatre' },
  rm_corridor: { id: 'rm_corridor', name: 'Corridor', cost: { wood: 1 }, power: 0, spawn: null, hint: 'A cheap connector. Never spawns, never goes dark.', art: 'ward_corridor' },
  rm_ward: { id: 'rm_ward', name: 'Ward', cost: { wood: 2, stone: 1 }, power: 1, spawn: { kind: 'fight', every: 1, cap: 5 }, hint: 'A monster checks in every day (up to 5). Walk in to fight all of them: 3 at once, the rest as reinforcements.', art: 'ward_beds' },
  rm_isolation: { id: 'rm_isolation', name: 'Isolation', cost: { stone: 3, gold: 20 }, power: 1, spawn: { kind: 'elite', every: 2, cap: 1 }, hint: 'An elite every 2 days. Left 3 days it turns Level 2: +30% HP, +2 Strength, one more relic to choose from.', art: 'ward_isolation' },
  rm_chapel: { id: 'rm_chapel', name: 'Chapel', cost: { wood: 2, stone: 2 }, power: 1, spawn: { kind: 'event', every: 4, cap: 1 }, hint: 'An event every 4 days. Midday leans to gold and healing, night to strange and risky.', art: 'ward_chapel' },
  rm_dispensary: { id: 'rm_dispensary', name: 'Dispensary', cost: { wood: 3, stone: 2 }, power: 1, spawn: { kind: 'shop', every: 3, cap: 1 }, hint: 'The shop. Restocks every 3 days. Also sells building cards and removes one for 50 gold.', art: 'ward_dispensary' },
  rm_workshop: { id: 'rm_workshop', name: 'Workshop', cost: { stone: 2, gold: 40 }, power: 1, spawn: { kind: 'forge', every: 3, cap: 1 }, hint: 'The forge. Recharges every 3 days.', art: 'ward_workshop' },
  rm_sawmill: { id: 'rm_sawmill', name: 'Sawmill', cost: { stone: 1 }, power: 1, spawn: null, produce: { wood: 2 }, hint: '+2 wood each morning while lit.', art: 'ward_sawmill' },
  rm_quarry: { id: 'rm_quarry', name: 'Quarry', cost: { wood: 2 }, power: 1, spawn: null, produce: { stone: 2 }, hint: '+2 stone each morning while lit.', art: 'ward_quarry' },
  rm_counting: { id: 'rm_counting', name: 'Counting House', cost: { wood: 2, stone: 2 }, power: 1, spawn: null, produce: { gold: 15 }, hint: '+15 gold each morning while lit.', art: 'ward_counting' },
  rm_generator: { id: 'rm_generator', name: 'Generator', cost: { stone: 3 }, power: 0, spawn: null, powerAdd: 2, hint: '+2 power capacity.', art: 'ward_generator' },
  rm_linen: { id: 'rm_linen', name: 'Linen Room', cost: { wood: 2 }, power: 1, spawn: { kind: 'rest', every: 2, cap: 1 }, heal: 0.25, hint: 'Clean sheets every 2 days: walk in to heal 25% of max HP.', art: 'ward_linen' },
};
export const ROOM_LIST = Object.values(ROOMS);

// Building cards. kind: room (builds `room` on a legal cell) | upgrade (installs on a room of type `on`) | effect.
// target: 'cell' | 'room' | 'res' (wood or stone) | 'none'. cost: what PLAYING the card costs (room cards: the room's cost).
const room = (id, rm, rarity) => ({ id, name: ROOMS[rm].name, kind: 'room', room: rm, rarity, cost: ROOMS[rm].cost, target: 'cell', text: `Build a ${ROOMS[rm].name}. ${ROOMS[rm].hint}`, art: ROOMS[rm].art });
export const BUILD_CARDS = {
  b_corridor: room('b_corridor', 'rm_corridor', 'common'),
  b_ward: room('b_ward', 'rm_ward', 'common'),
  b_isolation: room('b_isolation', 'rm_isolation', 'uncommon'),
  b_chapel: room('b_chapel', 'rm_chapel', 'common'),
  b_dispensary: room('b_dispensary', 'rm_dispensary', 'uncommon'),
  b_workshop: room('b_workshop', 'rm_workshop', 'uncommon'),
  b_sawmill: room('b_sawmill', 'rm_sawmill', 'common'),
  b_quarry: room('b_quarry', 'rm_quarry', 'common'),
  b_counting: room('b_counting', 'rm_counting', 'uncommon'),
  b_generator: room('b_generator', 'rm_generator', 'common'),
  b_linen: room('b_linen', 'rm_linen', 'common'),
  // upgrades (one of each per room)
  b_reinforced_beds: { id: 'b_reinforced_beds', name: 'Reinforced Beds', kind: 'upgrade', on: ['rm_ward'], rarity: 'uncommon', cost: { wood: 1, stone: 1 }, target: 'room', text: 'Upgrade a Ward: two monsters check in each day instead of one.', art: 'ward_beds' },
  b_sterile_field: { id: 'b_sterile_field', name: 'Sterile Field', kind: 'upgrade', on: ['rm_chapel'], rarity: 'uncommon', cost: { stone: 2 }, target: 'room', text: 'Upgrade a Chapel: it holds 2 events and you sit through both.', art: 'ward_chapel' },
  b_overtime: { id: 'b_overtime', name: 'Overtime', kind: 'upgrade', on: ['rm_sawmill', 'rm_quarry', 'rm_counting'], rarity: 'common', cost: { wood: 1 }, target: 'room', oneShot: true, text: 'A resource room produces double tomorrow morning.', art: 'ward_overtime' },
  b_iron_doors: { id: 'b_iron_doors', name: 'Iron Doors', kind: 'upgrade', on: ['rm_ward', 'rm_isolation', 'rm_chapel', 'rm_dispensary', 'rm_workshop', 'rm_linen'], rarity: 'uncommon', cost: { stone: 2 }, target: 'room', text: 'Walking THROUGH this room never triggers it. It still triggers when it is where you stop.', art: 'ward_doors' },
  b_night_shift: { id: 'b_night_shift', name: 'Night Shift', kind: 'upgrade', on: ['rm_ward', 'rm_isolation'], rarity: 'rare', cost: { wood: 1, stone: 1 }, target: 'room', text: 'This room\'s night modifiers are doubled: Strength and gold alike.', art: 'ward_moon' },
  b_scrub_in: { id: 'b_scrub_in', name: 'Scrub In', kind: 'upgrade', on: ['rm_isolation'], rarity: 'uncommon', cost: { stone: 1 }, target: 'room', text: 'An Isolation elite here never turns Level 2.', art: 'ward_isolation' },
  // effects (today, or until used)
  b_morning_rounds: { id: 'b_morning_rounds', name: 'Morning Rounds', kind: 'effect', effect: 'move', n: 1, rarity: 'common', cost: {}, target: 'none', text: '+1 MOVE for every walk today.', art: 'ward_sun' },
  b_rations: { id: 'b_rations', name: 'Rations', kind: 'effect', effect: 'rations', n: 1, rarity: 'common', cost: { wood: 1 }, target: 'none', text: 'Draw 1 more card each turn in every fight today.', art: 'ward_bowl' },
  b_lamp_oil: { id: 'b_lamp_oil', name: 'Lamp Oil', kind: 'effect', effect: 'lamp', rarity: 'common', cost: {}, target: 'none', text: 'Dark rooms cost no HP to cross today.', art: 'ward_lamp' },
  b_triage: { id: 'b_triage', name: 'Triage', kind: 'effect', effect: 'heal', n: 8, rarity: 'common', cost: { wood: 1 }, target: 'none', text: 'Heal 8.', art: 'ward_cross' },
  b_requisition: { id: 'b_requisition', name: 'Requisition', kind: 'effect', effect: 'res', n: 3, rarity: 'common', cost: {}, target: 'res', text: 'Gain 3 wood or 3 stone.', art: 'ward_crate' },
  b_bribe: { id: 'b_bribe', name: 'Bribe the Porter', kind: 'effect', effect: 'bribe', rarity: 'uncommon', cost: { gold: 20 }, target: 'none', text: 'Skip the next room that would trigger on a walk (until used).', art: 'ward_coin' },
  b_double_shift: { id: 'b_double_shift', name: 'Double Shift', kind: 'effect', effect: 'tick', rarity: 'uncommon', cost: { wood: 1 }, target: 'room', text: 'A chosen room with a timer ticks once now.', art: 'ward_clock' },
  b_demolish: { id: 'b_demolish', name: 'Demolish', kind: 'effect', effect: 'demolish', rarity: 'uncommon', cost: {}, target: 'room', text: 'Remove a room (refund half its cost) or clear rubble. Never one that would cut a room off.', art: 'ward_hammer' },
};
export const BUILD_LIST = Object.values(BUILD_CARDS);

// 12 cards: the doc's 10 with one Corridor swapped for a Workshop, plus Isolation and Linen Room (elites, forge and rest without a lucky reward).
export const STARTER_BUILD_DECK = ['b_corridor', 'b_workshop', 'b_ward', 'b_isolation', 'b_sawmill', 'b_quarry', 'b_chapel', 'b_dispensary', 'b_generator', 'b_linen', 'b_morning_rounds', 'b_requisition'];

// Phase modifiers flow into combat through pending.mods (engine/combat.js: enemyStr, eliteStr, firstTurnDraw, hpMul, handAdd).
export const PHASES = {
  morning: { id: 'morning', name: 'Morning', walk: false, text: 'Build. Spawns appear, resources arrive, you draw 5 building cards.' },
  midday: { id: 'midday', name: 'Midday', walk: true, goldMul: 1.1, eventLean: 'kind', text: 'One walk. Fights pay +10% gold. Events lean to gold and healing.' },
  evening: { id: 'evening', name: 'Evening', walk: true, firstTurnDraw: 1, text: 'One walk. Dinner: draw 1 more card on the first turn of every fight.' },
  night: { id: 'night', name: 'Night', walk: true, enemyStr: 1, eliteStr: 2, eliteRelic: 1, goldMul: 1.25, eventLean: 'strange', text: 'One walk. Monsters +1 Strength, elites +2 and one more relic to choose from. Fights pay +25% gold.' },
};
export const PHASE_ORDER = ['morning', 'midday', 'evening', 'night'];

// Floors per act. days = the act's day limit (boss on the last night; early boss from days - 2).
export const FLOOR = {
  1: { w: 9, h: 6, days: 6, rubble: [3, 5], name: 'The Ward' },
  2: { w: 9, h: 6, days: 7, rubble: [4, 6], name: 'The Market Wing' },
  3: { w: 9, h: 6, days: 7, rubble: [4, 6], name: 'The Theatre' },
};
export const START_RES = { wood: 4, stone: 3, power: 6 };
export const PREBUILT = ['rm_ward', 'rm_chapel', 'rm_sawmill'];

// Tuning (design/WARD.md section 8 lists every number and why).
export const WARD_TUNE = {
  move: 4, hand: 5, offHp: 3, waitHeal: 3, carry: 0.5,
  boardMax: 3,                  // monsters on the board at once; the rest wait as reinforcements
  goldPerExtra: 0.3,            // ward fight gold +30% per monster beyond 2 (1 monster pays 75%)
  bigFight: 4,                  // 4+ monsters: one more graft pick
  eliteAge: 3, eliteL2: { hpMul: 1.3, str: 2, relic: 1 },
  earlyBossHp: 0.9, earlyBossGold: 30, earlyDays: 2,
  resPerMonster: 1, resPerElite: 2,
  buildRemovePrice: 50, buildPrice: { common: 35, uncommon: 55, rare: 85 },
};

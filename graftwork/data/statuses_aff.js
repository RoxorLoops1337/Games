// Player afflictions and enemy guard statuses from design/ENEMY_DEPTH.md. SKELETON: ids, names and tooltips are final so
// enemy designers can reference them; the afflictions engineer implements the hooks and numbers (see engine/afflictions.js).
export const STATUS_AFF = [
  { id: 'poison', name: 'Poison', good: false, stack: 'int', desc: (n) => `Lose ${n} HP at turn start (ignores Block), then Poison rises by 1 (max 6).` },
  { id: 'brittle', name: 'Brittle', good: false, stack: 'dur', desc: (n) => `Block you gain shatters: when an attack empties your Block, take 25% of the broken amount (max 6). ${n} turn${n > 1 ? 's' : ''}.` },
  { id: 'rejection', name: 'Rejection', good: false, stack: 'dur', desc: () => 'Prices trigger twice this turn (self damage, junk, jam).' },
  { id: 'infection', name: 'Infection', good: false, stack: 'int', desc: (n) => `Strain counts +${n} this combat. It Tithes plain cards. Only a potion, a Rest or a Forge clears it.` },
  { id: 'numb', name: 'Numb', good: false, stack: 'dur', desc: () => 'The grafts on your top grafted card in hand stop working this turn. Their prices still bite.' },
  { id: 'unpicked', name: 'Unpicked', good: false, stack: 'dur', desc: () => 'One patch on one card in your hand is gone this turn. An Overload loses its x1.5 and its Shatter roll.' },
  { id: 'cadencelock', name: 'Cadence Lock', good: false, stack: 'dur', desc: () => 'Your Thread breaks the first time a school repeats this turn.' },
  { id: 'stagefright', name: 'Stagefright', good: false, stack: 'int', desc: (n) => `Each card past your 4th this turn adds ${n} to the damage of the next enemy hit.` },
  { id: 'dread', name: 'Dread', good: false, stack: 'int', desc: (n) => `If you end your turn with no Block, take ${n * 2}.` },
  { id: 'leaden', name: 'Leaden', good: false, stack: 'dur', desc: () => 'Your highest-cost card costs 1 more.' },
  { id: 'weightofdebt', name: 'Weight of Debt', good: true, stack: 'int', desc: (n) => `Its next hit deals ${n * 2} more. It gains 1 for each card type you skip.` },
  { id: 'stitchedup', name: 'Stitched Up', good: true, stack: 'int', desc: (n) => `Absorbs the first ${n} damage each turn. Refills if you play fewer than 3 cards.` },
];

// Extra statuses for Act I enemies (same schema as statuses.js).
// good:true = a buff the owner enjoys (so it is not blocked by Artifact/immune); good:false = a debuff on its owner.
export const STATUS_E1 = [
  { id: 'dodge', name: 'Dodge', good: true, stack: 'int', desc: (n) => `Avoids the first card hit each turn (${n} ready). Burn, Bleed and Thorns still land.` },
  { id: 'hidden', name: 'Hidden', good: true, stack: 'int', desc: () => 'Its intent is hidden from you.' },
  { id: 'sutured', name: 'Sutured', good: true, stack: 'int', desc: (n) => `Holds ${n} stolen card${n > 1 ? 's' : ''} worth of grafts. Kill it and they come back.` },
  { id: 'recall', name: 'Recall', good: true, stack: 'int', desc: (n) => `Its Mimic will hit for ${Math.max(10, Math.min(26, n))}: your last big hit, plus 4 for each card you play past your 4th in a turn.` },
  { id: 'countdown', name: 'Countdown', good: true, stack: 'int', desc: (n) => `Discharges when this reaches 1. Currently ${n}.` },
  { id: 'grounded', name: 'Grounded', good: false, stack: 'int', desc: (n) => `Its next Clear hits for ${n * 3} less (never below 14). Each 8 damage you deal to it before then adds one.` },
  { id: 'loose', name: 'Loose Weave', good: true, stack: 'int', desc: () => 'Heals 3 whenever you extend your Thread (up to 9 a turn). Takes 50% more damage from your cuts.' },
  // The Matron: cards she has Claimed this combat (a Tithe by another name; Tempered cards are immune).
  { id: 'claim', name: 'Claim', good: true, stack: 'int', desc: (n) => `She has Claimed ${n} of your cards: they fight at -25% this combat. She takes your most grafted card each phase. Tempered cards cannot be Claimed.` },
  // The Resident: how many cards of your last school you played this turn.
  { id: 'mimicry', name: 'Mimicry', good: true, stack: 'int', desc: (n) => `It copies the school of your last card. Its Mimic hits for 3 more per card of that school you played this turn (${n} so far, max 4). End on a different school.` },
  // Defibrillator: the coat that throws your fire back.
  { id: 'insulated', name: 'Insulated', good: true, stack: 'int', desc: () => 'Burn you put on it comes back: you gain half as much Burn (rounded up, at most 4 per application). Other damage is fine.' },
  { id: 'charging', name: 'Charging', good: true, stack: 'int', desc: (n) => `Winding up a heavy blow for next turn. Its Blow deals ${n * 2} more.` },
];

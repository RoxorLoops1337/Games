// Graft schools. color = UI accent. resonance: 3 and 6 grafts of one school in the deck wake a bonus. The RULE is engine/resonance.js;
// these texts describe it and tests/graftwork_rules_fixes.test.mjs rebuilds every one from the engine's measured numbers, so change both together.
export const SCHOOL_LIST = [
  { id: 'ember', name: 'Ember', color: '#E8571F', blurb: 'Burn it all. Fire spreads, and so does the bill.', resonance: { 3: 'Your first Attack each turn applies 2 Burn.', 6: 'Every Attack applies 2 Burn.' } },
  { id: 'echo', name: 'Echo', color: '#6CC6D6', blurb: 'Say it twice. The second time costs extra.', resonance: { 3: 'Start each combat with 1 Echo.', 6: 'Start each combat with 2 Echo.' } },
  { id: 'hoard', name: 'Hoard', color: '#B8922A', blurb: 'Hold on. Draw, keep, and be ready.', resonance: { 3: 'Draw 1 extra card on turn 1.', 6: 'Draw 1 extra card every turn.' } },
  { id: 'blood', name: 'Blood', color: '#A3142F', blurb: 'Pay in flesh. Flesh is cheap.', resonance: { 3: 'Heal 2 when you lose HP to your own cards (once per turn).', 6: 'Gain 1 Strength when you lose HP to your own cards (max 3 per turn).' } },
  { id: 'rust', name: 'Rust', color: '#8F4A2A', blurb: 'Junk is just fuel that has not met you yet.', resonance: { 3: 'Gain 2 Block whenever a junk card is drawn.', 6: 'Junk cards in hand deal 2 damage to all enemies at turn end.' } },
  { id: 'static', name: 'Static', color: '#D9E84A', blurb: 'Chain it. Whatever you played last is still ringing.', resonance: { 3: 'Gain 1 Charge at turn start.', 6: 'Gain 2 Charge at turn start.' } },
  { id: 'gilded', name: 'Gilded', color: '#EFD98F', blurb: 'Everything has a price. You can afford it.', resonance: { 3: 'Gain 10 gold after each combat.', 6: 'Gain 20 gold after each combat.' } },
];
// The Thread half of resonance is ONE rule for all seven schools (engine/seam.js payoutFor and timesFor): a payout in a school at
// tier 3 or more gains 1 stitch (a cut or the turn end, as the Line's top school or its second), and a cut whose top school is at
// tier 6 pays double. `rule` is the whole of it in one line (the Resonance keyword, the Codex); 3 and 6 follow a school's own text.
// tests/graftwork_rules_fixes.test.mjs measures both numbers in the engine and rebuilds these texts.
export const RESONANCE_THREAD = {
  3: 'Its Thread payout gains 1 Stitch.',
  6: 'Its cuts pay double.',
  rule: "Thread: at 3 the school's payout gains 1 Stitch, at 6 its cuts pay double.",
};
// Everything one tier of a school does, as the school panels print it: its own bonus, then the Thread half.
export const resonanceText = (school, tier) => `${school.resonance[tier]} ${RESONANCE_THREAD[tier]}`;

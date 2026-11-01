// Graft schools. color = UI accent. resonance: 3+ grafts of one school in the deck unlock a small bonus (see engine/run.js resonance()).
export const SCHOOL_LIST = [
  { id: 'ember', name: 'Ember', color: '#FF6A2B', blurb: 'Burn it all. Fire spreads, and so does the bill.', resonance: { 3: 'Your Burn deals +1 at turn start.', 6: 'Attacks apply 1 Burn.' } },
  { id: 'echo', name: 'Echo', color: '#7FD1E0', blurb: 'Say it twice. The second time costs extra.', resonance: { 3: 'Once per combat, your first card is played twice.', 6: 'Start each combat with 1 Echo.' } },
  { id: 'hoard', name: 'Hoard', color: '#C9A227', blurb: 'Hold on. Draw, keep, and be ready.', resonance: { 3: 'Draw 1 extra card on turn 1.', 6: 'Retain 1 card each turn.' } },
  { id: 'blood', name: 'Blood', color: '#9E0F2E', blurb: 'Pay in flesh. Flesh is cheap.', resonance: { 3: 'Heal 2 when you lose HP to your own cards (once per turn).', 6: 'Gain 1 Strength when you lose HP to your own cards (max 3 per turn).' } },
  { id: 'rust', name: 'Rust', color: '#A0522D', blurb: 'Junk is just fuel that has not met you yet.', resonance: { 3: 'Gain 2 Block whenever a junk card is drawn.', 6: 'Junk cards in hand deal 2 damage to all enemies at turn end.' } },
  { id: 'static', name: 'Static', color: '#E8F542', blurb: 'Chain it. Whatever you played last is still ringing.', resonance: { 3: 'Gain 1 Charge at turn start.', 6: 'Gain 2 Charge at turn start.' } },
  { id: 'gilded', name: 'Gilded', color: '#F5E6A8', blurb: 'Everything has a price. You can afford it.', resonance: { 3: 'Gain 10 gold after each combat.', 6: 'Gain 20 gold after each combat and Gilt 3.' } },
];

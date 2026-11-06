// Act III statuses (The Gilt Theatre). Same schema as statuses.js.
// 'marked' (Usher) already lives in statuses.js and is reused by the enemies.
const SCHOOLS_E3 = ['ember', 'blood', 'echo', 'hoard', 'rust', 'static', 'gilded'];
export const STATUS_E3 = [
  // Puppet: while strings remain, every hit is absorbed and cuts one string (logic in the Puppet's modDamage).
  { id: 'strings', name: 'Strings', good: true, stack: 'int', desc: (n) => `${n} string${n > 1 ? 's' : ''} left. Each hit that lands only cuts one string and deals no damage.` },
  // Gilded Cherub: fragile gilding.
  { id: 'fragile', name: 'Fragile', good: false, stack: 'int', mod: { inMul: () => 1.5 }, desc: () => 'Takes 50% more attack damage. Does not wear off.' },
  // Velvet Curtain: hides whoever stands behind it.
  { id: 'veiled', name: 'Veiled', good: true, stack: 'dur', mod: { inMul: () => 0.7 }, desc: (n) => `Behind the curtain: takes 30% less attack damage for ${n} turn${n > 1 ? 's' : ''}.` },
  // Impresario: which act the baton is on (display only; the Impresario reads its own HP).
  { id: 'baton', name: 'Baton', good: true, stack: 'int', desc: (n) => `The baton is raised for act ${n}. The score changes when it falls.` },
  // Conditional damage carrier: the bonus is built live from what you play, so the intent number always includes it.
  { id: 'primed', name: 'Primed', good: true, stack: 'int', mod: { outAdd: (n) => n }, desc: (n) => `Its next hit deals ${n} more. The move lists what feeds it, and it clears when the enemy acts.` },
  // Understudy's Shadow: how many cards of your last school your deck holds.
  { id: 'shadowing', name: 'Shadowing', good: true, stack: 'int', mod: { outAdd: (n) => n * 2 }, desc: (n) => `Copying the school of your last card: its next hit deals ${n * 2} more (2 per card of that school in your deck, max 10) and carries that school's rider.` },
  // The Grafter: Overload cards in your deck it has marked at half HP.
  { id: 'reknit', name: 'Reknit', good: true, stack: 'int', desc: (n) => `${n} Overload card${n > 1 ? 's' : ''} in your deck ${n > 1 ? 'are' : 'is'} marked: x1.0 instead of x1.5 and a 40% Shatter roll on first play. Tempered cards are not Overloads.` },
  // The Grafter: the school of your last Thread payout, used by its next Splice.
  { id: 'mirrorsch', name: 'Mirror', good: true, stack: 'int', desc: (n) => `Its next Splice uses the school of your last Thread payout: ${SCHOOLS_E3[n - 1] || 'none'}.` },
  // Impresario: one more voice per school you play this turn.
  { id: 'ensemble', name: 'Ensemble', good: true, stack: 'int', mod: { outAdd: (n) => n }, desc: (n) => `Play three or more schools in a turn and every hit deals ${n} more. Stay in one or two schools.` },
  // Gold Leaf Golem: beaten leaf folds under one big blow.
  { id: 'leafarmor', name: 'Leaf Armor', good: true, stack: 'int', desc: (n) => `A single card hit deals at most ${n} damage. Burn, Bleed, Thorns and Thread arcs ignore it. Many small hits win.` },
  // The Diva: the room is loud.
  { id: 'applause', name: 'Applause', good: true, stack: 'int', desc: (n) => `Her Aria hits for ${n * 3} more: 3 for each card you play past your 5th this turn (max 4).` },
  // Locksmith: the school it has sealed (the first card of it you draw each turn is Frayed).
  { id: 'sealed', name: 'Sealed', good: true, stack: 'int', desc: (n) => `Your ${SCHOOLS_E3[n - 1] || 'biggest'} school is sealed: each turn the first card of it you would draw is Frayed (+1 cost, acts as Slack).` },
];

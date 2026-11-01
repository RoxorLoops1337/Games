// Extra statuses for Act II (the Cellar Market). Same schema as statuses.js.
export const STATUS_E2 = [
  // Lantern Fish: the glow pulls cards out of your hand as you play.
  { id: 'lured', name: 'Lured', good: false, stack: 'int',
    desc: (n) => `Each of your next ${n} card${n > 1 ? 's' : ''} played sends a random card from your hand to the discard pile. Clears at turn end.`,
    hooks: {
      cardPlayed: (A, o, n) => {
        const h = A.c.hand;
        if (h.length) {
          const card = h.splice(A.rng.int(h.length), 1)[0];
          card.jam = false; card.costMod = 0;
          A.c.discard.push(card);
          A.ev({ t: 'discard', card: card.uid, why: 'effect' });
        }
        A.setStatus(o, 'lured', n - 1);
      },
      turnEnd: (A, o) => A.setStatus(o, 'lured', 0),
    } },
  // Rust Hound: flaking metal makes every block weaker.
  { id: 'corroded', name: 'Corroded', good: false, stack: 'dur', mod: { blockAdd: () => -2 },
    desc: (n) => `Every Block you gain is reduced by 2 for ${n} turn${n > 1 ? 's' : ''}.` },
  // Scale Merchant: the last hit it took, waiting on the other pan.
  { id: 'mirror', name: 'Counterweight', good: true, stack: 'int',
    desc: (n) => `Copied from the last hit it took. Its next Weigh deals ${n} extra damage.` },
  // Cleaver: the tell. Visible while its hidden chop is coming.
  { id: 'raised', name: 'Blade Raised', good: true, stack: 'int',
    desc: () => 'The chop lands next turn for a huge hit. Deal 18 damage in a single turn to stun it.' },
  // Ledgerman: counts cards played this turn.
  { id: 'tally', name: 'Tally', good: true, stack: 'int',
    desc: (n) => `${n} card${n === 1 ? '' : 's'} counted this turn. From the 5th card on, every card costs you HP.` },
  // The Appraiser: how many of your cards carry a price tag.
  { id: 'priced', name: 'Priced', good: false, stack: 'int',
    desc: (n) => `${n} of your cards ${n === 1 ? 'is' : 'are'} priced. Playing one costs 10 gold (or 5 HP if you are short) and feeds the Appraiser.` },
  // The Broker: an offer on the table. Resolved at the start of his next action.
  { id: 'offer', name: 'Offer', good: true, stack: 'int',
    desc: () => 'Deal 25 or more damage to him this turn and he pays 12 HP. Refuse and you take 8 damage while he takes 20 Block.',
    hooks: {
      turnStart: (A, o) => {
        const hit = o.data.offerDmg || 0;
        if (hit >= 25) A.loseHp(o, 12, { floor1: true, src: 'offer' });
        else { A.dmg(o, A.player, 8, { pierce: true, noMods: true }); A.block(o, 20, { raw: true }); }
        o.data.offerDmg = 0;
        A.setStatus(o, 'offer', 0);
      },
    } },
  // The Broker: idle capital is taxed.
  { id: 'interest', name: 'Interest', good: true, stack: 'int',
    desc: () => 'When you end a turn with 2 or more unspent energy, he gains 5 Block per energy. Play 2 cards or fewer and a Ledger Entry joins your draw pile.',
    hooks: {
      turnStart: (A, o) => {
        const c = A.c;
        if (c.energy >= 2) A.block(o, c.energy * 5, { raw: true });
        if (c.cardsThisTurn.length <= 2) A.addCard('j_ledger', 1, 'draw');
      },
    } },
  // Pickled King: preserved flesh shrugs off any single big hit.
  { id: 'brined', name: 'Brined', good: true, stack: 'int', mod: { inCap: (n) => n },
    desc: (n) => `Any single hit deals at most ${n} damage.` },
];

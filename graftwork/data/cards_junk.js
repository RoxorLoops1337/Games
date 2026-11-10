// Junk: type 'junk' cards enter the deck mid-combat from prices and enemies. They can never be grafted and are not Tithed.
// Required ids used elsewhere: j_paperwork j_ringing j_clot j_flake j_static j_ledger j_scrap. Every junk card here must have a source
// (a card op, a graft price, an enemy move or a status): tests/graftwork_rules_fixes.test.mjs fails on one that nothing can add.
const J = (id, name, cost, target, flavor, fx, flags, school) => ({ id, name, hero: 'any', type: 'junk', cost, rarity: 'junk', target, ...(school ? { school } : {}), fx, flags, flavor });
export const CARDS_JUNK = [
  J('j_paperwork', 'Paperwork', 1, 'none', 'In triplicate.', [], { unplayable: true, ethereal: true }),
  J('j_ringing', 'Ringing', 0, 'none', 'Is that you or the echo?', [], { unplayable: true, ethereal: true }),
  J('j_clot', 'Clot', 1, 'none', 'It will pass. Eventually.', [], { unplayable: true }),
  J('j_flake', 'Rust Flake', 1, 'self', 'Still metal, technically.', [{ op: 'block', n: 2 }], { exhaust: true }, 'rust'),
  J('j_static', 'Static', 0, 'none', 'Bzzt.', [], { unplayable: true, ethereal: true }),
  J('j_ledger', 'Ledger Entry', 1, 'none', 'You owe.', [], { unplayable: true }),
  J('j_scrap', 'Scrap Heap', 0, 'self', 'Something in here might be useful.', [{ op: 'draw', n: 1 }], { exhaust: true }, 'rust'),
];

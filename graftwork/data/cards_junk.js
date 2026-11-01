// Junk: type 'junk' cards enter the deck mid-combat from prices and enemies. They can never be grafted and are not Tithed.
// Required ids used elsewhere: j_paperwork j_ringing j_clot j_flake j_static j_ledger
const J = (id, name, cost, target, flavor, fx, flags, school) => ({ id, name, hero: 'any', type: 'junk', cost, rarity: 'junk', target, ...(school ? { school } : {}), fx, flags, flavor });
export const CARDS_JUNK = [
  J('j_paperwork', 'Paperwork', 1, 'none', 'In triplicate.', [], { unplayable: true, ethereal: true }),
  J('j_ringing', 'Ringing', 0, 'none', 'Is that you or the echo?', [], { unplayable: true, ethereal: true }),
  J('j_clot', 'Clot', 1, 'none', 'It will pass. Eventually.', [], { unplayable: true }),
  J('j_flake', 'Rust Flake', 1, 'self', 'Still metal, technically.', [{ op: 'block', n: 2 }], { exhaust: true }, 'rust'),
  J('j_static', 'Static', 0, 'none', 'Bzzt.', [], { unplayable: true, ethereal: true }),
  J('j_ledger', 'Ledger Entry', 1, 'none', 'You owe.', [], { unplayable: true }),
  J('j_bruise', 'Bruise', 2, 'none', 'Purple, then yellow, then yours.', [], { unplayable: true }),
  J('j_gauze', 'Gauze', 1, 'self', 'Used, but clean enough.', [{ op: 'block', n: 4 }], { exhaust: true }),
  J('j_splinter', 'Splinter', 1, 'enemy', 'Small, sharp, and now theirs.', [{ op: 'dmg', n: 3, to: 'random' }], { exhaust: true }),
  J('j_fever', 'Fever', 0, 'none', 'Take two aspirin and lose a turn.', [], { unplayable: true, ethereal: true }),
  J('j_scab', 'Scab', 0, 'self', 'Do not pick at it.', [{ op: 'block', n: 3 }], { exhaust: true }),
  J('j_slag', 'Slag', 1, 'enemy', 'Heavy, ugly, throwable.', [{ op: 'dmg', n: 5 }], { exhaust: true }, 'rust'),
  J('j_scrap', 'Scrap Heap', 0, 'self', 'Something in here might be useful.', [{ op: 'draw', n: 1 }], { exhaust: true }, 'rust'),
  J('j_fog', 'Anaesthetic Fog', 1, 'none', 'Count backwards from nothing.', [], { unplayable: true, ethereal: true }),
  J('j_lint', 'Lint', 0, 'none', 'Pocket debris. Not a card, really.', [], { unplayable: true, ethereal: true }),
  J('j_invoice', 'Invoice', 2, 'none', 'Net thirty. Payable in blood.', [], { unplayable: true }),
  J('j_shard', 'Bone Shard', 0, 'enemy', 'Yours, probably.', [{ op: 'dmg', n: 4 }, { op: 'hp', n: 1 }], { exhaust: true }),
  J('j_tourniquet', 'Tourniquet', 1, 'self', 'Tight enough to matter.', [{ op: 'block', n: 6 }, { op: 'status', s: 'frail', n: 1, to: 'self' }], { exhaust: true }),
  J('j_slip', 'Waiver', 0, 'none', 'Sign here, and here, and here.', [], { unplayable: true }),
];

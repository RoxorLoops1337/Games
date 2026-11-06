// Thread cards (see design/THREAD.md). hero: 'any' cards sit in the shared shop pool; hero cards use the hero's id.
// {per:'knots'} reads the length of the current Line, AFTER the card itself has extended it (engine/seam.js runs first).
// Readers with no school are Slack on purpose: they read the Line without disturbing it.
// Engine contract used here (E1): cutting a Line from a card effect calls A.cutLine() when it exists, else sets c.seam.forceCut = true.
const S = (A) => A.c.seam;
const topSchool = (s) => Object.keys(s.counts || {}).sort((a, b) => (s.counts[b] || 0) - (s.counts[a] || 0))[0] || null;
const cutNow = (A) => { const s = S(A); if (!s) return; if (typeof A.cutLine === 'function') A.cutLine(); else s.forceCut = true; };
const tieNow = (A) => { const s = S(A); if (s) s.tied = true; };
const KN = (base, mul, max) => (max ? { base, per: 'knots', mul, max } : { base, per: 'knots', mul });

const basting = (A) => {
  const s = S(A); if (!s) return;
  const c = A.c; c.rx = c.rx || {};
  if (c.rx.bastedTurn === c.turn) return;
  c.rx.bastedTurn = c.turn;
  const top = topSchool(s);
  if (top && s.len > 0 && s.len < 5) { s.len += 1; s.counts[top] = (s.counts[top] || 0) + 1; }
};
const unpick = (A) => {
  const s = S(A); if (!s || s.len < 2) return;
  const top = topSchool(s);
  s.len -= 1;
  if (top && s.counts[top] > 0) s.counts[top] -= 1;
};

export const CARDS_THREAD = [
  // ---------- neutral ----------
  { id: 'x_thread_cross', name: 'Cross-Stitch', hero: 'any', type: 'attack', cost: 1, rarity: 'common', target: 'enemy', flags: {},
    fx: [{ op: 'dmg', n: KN(6, 2) }], up: { fx: [{ op: 'dmg', n: KN(8, 3) }] }, flavor: 'One more pass and it holds.' },
  { id: 'x_thread_snip', name: 'Snip', hero: 'any', type: 'attack', cost: 0, rarity: 'common', target: 'enemy', flags: {},
    fx: [{ op: 'dmg', n: 4 }, { op: 'custom', fn: cutNow, text: 'Cut the Line.' }],
    up: { fx: [{ op: 'dmg', n: 7 }, { op: 'custom', fn: cutNow, text: 'Cut the Line.' }] }, flavor: 'Cashes the line. Not a metaphor.' },
  { id: 'x_thread_tieoff', name: 'Tie Off', hero: 'any', type: 'skill', cost: 1, rarity: 'common', target: 'self', flags: {},
    fx: [{ op: 'block', n: 5 }, { op: 'custom', fn: tieNow, text: 'Tie the Line: it carries over at full value.' }],
    up: { fx: [{ op: 'block', n: 8 }, { op: 'custom', fn: tieNow, text: 'Tie the Line: it carries over at full value.' }] }, flavor: 'Knots hold what hands cannot.' },
  { id: 'x_thread_basting', name: 'Basting', hero: 'any', type: 'skill', cost: 0, rarity: 'common', target: 'self', flags: { exhaust: true },
    fx: [{ op: 'draw', n: 1 }, { op: 'custom', fn: basting, text: 'Once per turn, add a knot to the Line\'s top school.' }],
    up: { fx: [{ op: 'draw', n: 2 }, { op: 'custom', fn: basting, text: 'Once per turn, add a knot to the Line\'s top school.' }] }, flavor: 'Temporary, like most promises here.' },
  { id: 'x_thread_unpick', name: 'Unpick', hero: 'any', type: 'skill', cost: 1, rarity: 'uncommon', target: 'self', flags: {},
    fx: [{ op: 'custom', fn: unpick, text: 'Remove the last knot from the Line.' }, { op: 'draw', n: 1 }, { op: 'block', n: 4 }],
    up: { fx: [{ op: 'custom', fn: unpick, text: 'Remove the last knot from the Line.' }, { op: 'draw', n: 2 }, { op: 'block', n: 6 }] }, flavor: 'Undoing is also a skill.' },
  { id: 'x_thread_pinking', name: 'Pinking Shears', hero: 'any', type: 'attack', cost: 1, rarity: 'uncommon', target: 'all', school: 'rust', flags: {},
    fx: [{ op: 'dmg', n: KN(2, 2, 14), to: 'all' }], up: { fx: [{ op: 'dmg', n: KN(3, 2, 18), to: 'all' }] }, flavor: 'Zigzag edge. Fewer frayed ends, more frayed nerves.' },
  { id: 'x_thread_shears', name: 'Tailor\'s Shears', hero: 'any', type: 'attack', cost: 2, rarity: 'rare', target: 'enemy', school: 'blood', flags: {},
    fx: [{ op: 'dmg', n: KN(8, 4, 28) }, { op: 'custom', fn: cutNow, text: 'Cut the Line.' }],
    up: { fx: [{ op: 'dmg', n: KN(10, 5, 35) }, { op: 'custom', fn: cutNow, text: 'Cut the Line.' }] }, flavor: 'The longer the line, the cleaner the cut.' },
  { id: 'x_thread_loom', name: 'Standing Loom', hero: 'any', type: 'power', cost: 2, rarity: 'rare', target: 'self', school: 'hoard', flags: {},
    fx: [{ op: 'status', s: 'plated', n: KN(1, 1, 5), to: 'self' }], up: { fx: [{ op: 'status', s: 'plated', n: KN(2, 1, 6), to: 'self' }] }, flavor: 'It works while you do not.' },

  // ---------- Marrow ----------
  { id: 'm_thread_bloodline', name: 'Bloodline', hero: 'marrow', type: 'attack', cost: 1, rarity: 'common', target: 'enemy', school: 'blood', flags: {},
    fx: [{ op: 'dmg', n: KN(5, 2) }, { op: 'status', s: 'bleed', n: KN(0, 1, 5) }], up: { fx: [{ op: 'dmg', n: KN(6, 3) }, { op: 'status', s: 'bleed', n: KN(1, 1, 6) }] }, flavor: 'Follow it back to the source.' },
  { id: 'm_thread_stitchup', name: 'Stitch Up', hero: 'marrow', type: 'skill', cost: 1, rarity: 'common', target: 'self', school: 'blood', flags: {},
    fx: [{ op: 'block', n: KN(4, 2) }, { op: 'heal', n: 1 }], up: { fx: [{ op: 'block', n: KN(5, 3) }, { op: 'heal', n: 2 }] }, flavor: 'Neat work is its own anaesthetic.' },
  { id: 'm_thread_rustseam', name: 'Rust Seam', hero: 'marrow', type: 'attack', cost: 1, rarity: 'uncommon', target: 'enemy', school: 'rust', flags: {},
    fx: [{ op: 'dmg', n: KN(4, 3, 19) }, { op: 'addCard', card: 'j_flake', n: 1, to: 'discard' }],
    up: { fx: [{ op: 'dmg', n: KN(5, 4, 25) }, { op: 'addCard', card: 'j_flake', n: 1, to: 'discard' }] }, flavor: 'Old iron makes a long scar.' },
  { id: 'm_thread_longsuture', name: 'Long Suture', hero: 'marrow', type: 'skill', cost: 1, rarity: 'rare', target: 'self', school: 'blood', flags: {},
    fx: [{ op: 'heal', n: KN(2, 2, 12) }, { op: 'custom', fn: tieNow, text: 'Tie the Line: it carries over at full value.' }],
    up: { fx: [{ op: 'heal', n: KN(3, 2, 14) }, { op: 'block', n: 6 }, { op: 'custom', fn: tieNow, text: 'Tie the Line: it carries over at full value.' }] }, flavor: 'Do not cut the patient out of the pattern.' },

  // ---------- Wick ----------
  { id: 'w_thread_trail', name: 'Candle Trail', hero: 'wick', type: 'attack', cost: 1, rarity: 'common', target: 'enemy', school: 'ember', flags: {},
    fx: [{ op: 'dmg', n: KN(4, 2) }, { op: 'status', s: 'burn', n: KN(1, 1, 5) }], up: { fx: [{ op: 'dmg', n: KN(5, 2) }, { op: 'status', s: 'burn', n: KN(2, 1, 6) }] }, flavor: 'Wax remembers where it has been.' },
  { id: 'w_thread_fusewire', name: 'Fuse Wire', hero: 'wick', type: 'attack', cost: 0, rarity: 'common', target: 'enemy', school: 'static', flags: {},
    fx: [{ op: 'dmg', n: KN(2, 1, 7) }, { op: 'status', s: 'charge', n: 1, to: 'self' }], up: { fx: [{ op: 'dmg', n: KN(3, 2, 11) }, { op: 'status', s: 'charge', n: 1, to: 'self' }] }, flavor: 'Thin, conductive, regrettable.' },
  { id: 'w_thread_arcstitch', name: 'Arc Stitch', hero: 'wick', type: 'attack', cost: 1, rarity: 'uncommon', target: 'enemy', school: 'static', flags: {},
    fx: [{ op: 'dmg', n: KN(3, 3) }, { op: 'status', s: 'charge', n: 1, to: 'self' }], up: { fx: [{ op: 'dmg', n: KN(4, 3) }, { op: 'status', s: 'charge', n: 2, to: 'self' }] }, flavor: 'The needle sparks. The patient notices.' },
  { id: 'w_thread_conflagration', name: 'Hem of Flame', hero: 'wick', type: 'attack', cost: 2, rarity: 'rare', target: 'all', school: 'ember', flags: {},
    fx: [{ op: 'dmg', n: KN(5, 3, 21), to: 'all' }, { op: 'status', s: 'burn', n: KN(0, 1, 4), to: 'all' }],
    up: { fx: [{ op: 'dmg', n: KN(6, 4, 26), to: 'all' }, { op: 'status', s: 'burn', n: KN(1, 1, 5), to: 'all' }] }, flavor: 'Sewn along the edge so it cannot spread. It spreads.' },

  // ---------- Odile ----------
  { id: 'o_thread_embroidered', name: 'Embroidered Purse', hero: 'odile', type: 'skill', cost: 1, rarity: 'common', target: 'self', school: 'gilded', flags: {},
    fx: [{ op: 'block', n: 4 }, { op: 'gold', n: KN(1, 1, 6) }], up: { fx: [{ op: 'block', n: 6 }, { op: 'gold', n: KN(2, 1, 7) }] }, flavor: 'Monogrammed, so you cannot lose it twice.' },
  { id: 'o_thread_sparespool', name: 'Spare Spool', hero: 'odile', type: 'skill', cost: 0, rarity: 'common', target: 'self', school: 'hoard', flags: { retain: true },
    fx: [{ op: 'draw', n: 1 }, { op: 'block', n: KN(0, 2, 8) }], up: { fx: [{ op: 'draw', n: 1 }, { op: 'block', n: KN(2, 2, 10) }] }, flavor: 'Kept in the drawer for the right occasion.' },
  { id: 'o_thread_doublehem', name: 'Double Hem', hero: 'odile', type: 'skill', cost: 1, rarity: 'uncommon', target: 'self', school: 'echo', flags: {},
    fx: [{ op: 'block', n: KN(3, 1, 8) }, { op: 'status', s: 'echo', n: 1, to: 'self' }], up: { fx: [{ op: 'block', n: KN(4, 2, 12) }, { op: 'status', s: 'echo', n: 1, to: 'self' }] }, flavor: 'Folded over and stitched again, for a fee.' },
  { id: 'o_thread_tapestry', name: 'Tapestry', hero: 'odile', type: 'power', cost: 2, rarity: 'rare', target: 'self', school: 'gilded', flags: {},
    fx: [{ op: 'status', s: 'gilt', n: KN(2, 2, 10), to: 'self' }], up: { fx: [{ op: 'status', s: 'gilt', n: KN(4, 2, 14), to: 'self' }] }, flavor: 'Commissioned. Framed. Insured. Yours.' },
];

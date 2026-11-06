// Deck-building relics (H3). They reward a SHAPE of deck: one school, two schools bridged, Overload, Tempered cards, unused Budget.
// Hooks: seamExtend {len, school, card, spec}, seamCut {paid, school, len}, seamPay {school, stitches, amount}; cardPlayed {card, spec}.
// Per-combat scratch lives in A.c.rx. c.res = resonance tiers keyed by every school that owns at least one graft (engine/resonance.js).
const rx = (A) => A.c.rx || (A.c.rx = {});
const first = (A, key) => { const r = rx(A); if (r[key] === A.c.turn) return false; r[key] = A.c.turn; return true; };
const seam = (A) => A.c.seam || { len: 0, set: [], counts: {} };
const nSchools = (A) => Object.keys(seam(A).counts || {}).filter((k) => seam(A).counts[k] > 0).length;
const randFoe = (A) => { const a = A.alive(); return a.length ? a[A.rng.int(a.length)] : null; };
const stitches = (p) => Math.max(0, Math.min(6, (p && p.len) || 0) - 1);
const deckSchools = (A) => Object.keys((A.c && A.c.res) || {}).length;
const tempered = (p) => !!(p && p.spec && p.spec.fused && p.spec.fused.length);

// The Cursed Spool pays a Thread payout a second time (same rules, with small caps so it cannot run away).
const repay = (A, p) => {
  const n = (p && p.stitches) | 0;
  if (n <= 0 || !(p.amount > 0)) return;
  switch (p.school) {
    case 'ember': for (const e of A.alive()) A.status(e, 'burn', 2 * n); break;
    case 'echo': A.status(A.player, 'echo', Math.ceil(n / 2)); break;
    case 'hoard': A.draw(Math.min(2, Math.floor(n / 2))); break;
    case 'blood': A.heal(A.player, 2 * n); break;
    case 'rust': A.block(A.player, 3 * n); break;
    case 'static': A.status(A.player, 'charge', Math.min(2, n)); break;
    case 'gilded': A.gold(Math.min(6, 2 * n)); break;
    default: break;
  }
};

export const RELICS_MORE = [
  // ---- mono-school ----
  { id: 'r_monochrome_spindle', name: 'Monochrome Spindle', rarity: 'uncommon', text: 'While every graft in your deck is of ONE school, the first extend each turn deals 7 damage to a random enemy and gains 7 Block.',
    on: { seamExtend: (A) => { if (deckSchools(A) !== 1 || !first(A, 'spindleTurn')) return; const t = randFoe(A); if (t) A.dmg(A.player, t, 7, { pierce: true }); A.block(A.player, 7); } } },
  // ---- bridging two schools ----
  { id: 'r_bridge_pin', name: 'Bridge Pin', rarity: 'uncommon', text: 'The first time each turn you extend a Line of 3 or more knots that holds 2 or more schools, draw 1 card.',
    on: { seamExtend: (A) => { if (nSchools(A) >= 2 && seam(A).len >= 3 && first(A, 'bridgePinTurn')) A.draw(1); } } },
  { id: 'r_second_colour', name: 'Second Colour', rarity: 'uncommon', text: 'Cutting a Line that holds 2 or more schools gives 2 Block per stitch.',
    on: { seamCut: (A, p) => { if (p && p.paid === false) return; if (nSchools(A) >= 2) { const n = stitches(p); if (n > 0) A.block(A.player, 2 * n); } } } },
  // ---- Overload ----
  { id: 'r_stitched_third', name: 'Stitched Third', rarity: 'rare', text: 'An Overloaded card that extends the Line adds one extra knot (still capped by the Line limit).',
    on: { seamExtend: (A, p) => { if (!(p && p.spec && p.spec.overload)) return; const s = seam(A); const cap = (A.c.run.relics || []).includes('r_spool') ? 6 : 5; if (s.len < cap) { s.len += 1; if (p.school) s.counts[p.school] = (s.counts[p.school] || 0) + 1; } } } },
  // ---- Tempered cards ----
  { id: 'r_hammered_brass', name: 'Hammered Brass', rarity: 'uncommon', text: 'The first 2 Tempered cards you play each turn give 4 Block.',
    on: { cardPlayed: (A, p) => { if (!tempered(p)) return; const r = rx(A); if (r.brassTurn !== A.c.turn) { r.brassTurn = A.c.turn; r.brassN = 0; } if (r.brassN < 2) { r.brassN++; A.block(A.player, 4); } } } },
  { id: 'r_anvil_thread', name: 'Anvil Thread', rarity: 'rare', text: 'Playing a Tempered card Ties the Line: it carries over to your next turn at full value.',
    on: { cardPlayed: (A, p) => { if (tempered(p) && A.c.seam) A.c.seam.tied = true; } } },
  // ---- low Budget use ----
  { id: 'r_lean_ledger', name: 'Lean Ledger', rarity: 'common', text: 'At turn start, gain 2 Block per unused Budget (max 10).',
    on: { turnStart: (A) => { const s = A.c.strain; const free = s ? s.budget - s.weight : 0; if (free > 0) A.block(A.player, Math.min(10, 2 * free)); } } },
  { id: 'r_light_load', name: 'Light Load', rarity: 'rare', text: 'At turn start, draw 1 card if at least 3 Budget is unused.',
    on: { turnStart: (A) => { const s = A.c.strain; if (s && s.budget - s.weight >= 3) A.draw(1); } } },
  // ---- Echo and Static payoffs ----
  { id: 'r_tuning_fork', name: 'Tuning Fork', rarity: 'uncommon', text: 'The first Echo payout each turn gives 1 extra Echo and 3 Block.',
    on: { seamPay: (A, p) => { if (!p || p.school !== 'echo' || !(p.amount > 0) || !first(A, 'forkTurn')) return; A.status(A.player, 'echo', 1); A.block(A.player, 3); } } },
  { id: 'r_grounding_rod', name: 'Grounding Rod', rarity: 'uncommon', text: 'A Static payout deals 3 damage per stitch to all enemies.',
    on: { seamPay: (A, p) => { if (!p || p.school !== 'static') return; const n = (p.stitches | 0); if (n <= 0) return; for (const e of A.alive()) A.dmg(A.player, e, 3 * n, { pierce: true }); } } },
  // ---- event relic: its charges are run.flags.spool, set by the event "A Spool That Hums" ----
  { id: 'r_cursed_spool', name: 'Cursed Spool', rarity: 'start', text: 'Each charge (wound at the event) makes your next combat pay every Thread payout twice. Without a charge it does nothing.',
    on: {
      combatStart: (A, p, run) => { const r = run || A.c.run; if (r && r.flags && r.flags.spool > 0) { r.flags.spool -= 1; rx(A).spoolOn = true; } },
      seamPay: (A, p) => { if (rx(A).spoolOn) repay(A, p); },
    } },
];

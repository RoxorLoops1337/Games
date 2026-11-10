// Thread relics. Hooks seamExtend {len, school, card} and seamCut {paid, school, len, card} are fired by engine/seam.js.
// paid is false for a cut past the turn's 3 paying cuts: it pays no stitch, so no relic here fires on it.
// Per-combat scratch lives in A.c.rx. mod.seamCap raises the Line length cap (default 5), read by engine/seam.js through relicMod.
const rx = (A) => A.c.rx || (A.c.rx = {});
const first = (A, key) => { const r = rx(A); if (r[key] === A.c.turn) return false; r[key] = A.c.turn; return true; };
const stitches = (p) => Math.max(0, Math.min(5, (p && p.len) || 0) - 1);
const seam = (A) => A.c.seam || { len: 0, set: [], counts: {} };
const nSchools = (A) => Object.keys(seam(A).counts || {}).filter((k) => seam(A).counts[k] > 0).length;
const randFoe = (A) => { const a = A.alive(); return a.length ? a[A.rng.int(a.length)] : null; };

export const RELICS_THREAD = [
  { id: 'r_spool', name: 'Spool', rarity: 'uncommon', text: 'The Line can hold 6 knots instead of 5. Cutting a Line of 4 or more draws 1 card.', mod: { seamCap: 6 },
    on: { seamCut: (A, p) => { if (p && p.paid !== false && p.len >= 4) A.draw(1); } } },
  { id: 'r_locking_forceps', name: 'Locking Forceps', rarity: 'uncommon', text: 'The first Line of each combat is Tied. Gain 6 Block at combat start.',
    on: { combatStart: (A) => { A.block(A.player, 9); if (A.c.seam) A.c.seam.tied = true; } } },
  { id: 'r_bobbin', name: 'Bobbin', rarity: 'common', text: 'The first cut each turn draws 1 card.',
    on: { seamCut: (A, p) => { if (p && p.paid === false) return; if (first(A, 'bobbinTurn')) A.draw(1); } } },
  { id: 'r_thimble', name: 'Thimble', rarity: 'common', text: 'Your first 2 Line extends each combat gain 2 Block.',
    on: { seamExtend: (A) => { const s = rx(A); if ((s.thimbleN | 0) < 2) { s.thimbleN = (s.thimbleN | 0) + 1; A.block(A.player, 2); } } } },
  { id: 'r_seam_ripper', name: 'Seam Ripper', rarity: 'uncommon', text: 'Each cut deals 2 damage per stitch to a random enemy.',
    on: { seamCut: (A, p) => { const n = stitches(p); const t = randFoe(A); if (n > 0 && t && !(p && p.paid === false)) A.dmg(A.player, t, 2 * n, { pierce: true }); } } },
  { id: 'r_embroidery_hoop', name: 'Embroidery Hoop', rarity: 'uncommon', text: 'When you extend a Line that holds 2 or more schools, heal 1.',
    on: { seamExtend: (A) => { if (nSchools(A) >= 2) A.heal(A.player, 1); } } },
  { id: 'r_pin_cushion', name: 'Pin Cushion', rarity: 'rare', text: 'Cutting a Line of 3 or more applies 2 Vulnerable to all enemies.',
    on: { seamCut: (A, p) => { if (p && p.paid !== false && p.len >= 3) for (const e of A.alive()) A.status(e, 'vulnerable', 2); } } },
  { id: 'r_blunt_shears', name: 'Blunt Shears', rarity: 'common', text: 'Your first cut each combat deals 6 damage to all enemies.',
    on: { seamCut: (A, p) => { const r = rx(A); if (r.bluntShears || (p && p.paid === false)) return; r.bluntShears = true; for (const e of A.alive()) A.dmg(A.player, e, 6, { pierce: true }); } } },
  { id: 'r_plain_cloth', name: 'Plain Cloth', rarity: 'uncommon', text: 'While the Line holds a single school, each extend deals 2 damage per knot to a random enemy.',
    on: { seamExtend: (A, p) => { if (nSchools(A) === 1) { const t = randFoe(A); if (t) A.dmg(A.player, t, 2 * Math.min(5, (p && p.len) || seam(A).len), { pierce: true }); } } } },
  { id: 'r_tapestry_frame', name: 'Tapestry Frame', rarity: 'rare', text: 'The first cut each turn also grants 4 Block per stitch.',
    on: { seamCut: (A, p) => { if (p && p.paid === false) return; if (first(A, 'frameTurn')) A.block(A.player, 4 * stitches(p)); } } },
];

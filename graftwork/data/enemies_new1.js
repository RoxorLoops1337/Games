// Brand-new Act 1 enemies from the depth pass (design/ENEMY_DEPTH.md and design/THREAD.md). Same schema as enemies_1.js.
// Seam hooks (engine/seam.js): on.seamExtend(A, e, { len, school, card, spec }), on.seamCut(A, e, { len, school, stitches, pays, kind: 'cut', card, cancel, paid }) when the Line is cut,
// on.seamCash(A, e, { ...same, kind: 'cut'|'end' }) for every cash including the turn end (may set cancel), on.seamPay(A, e, { school, stitches, kind, amount }).
// paid is false (and stitches 0) for a cut past the turn's 3 paying cuts.
const dmg = (n, extra = {}) => ({ op: 'dmg', n, ...extra });
const blk = (n) => ({ op: 'block', n, to: 'self' });
const debuff = (s, n) => ({ op: 'status', s, n, to: 'player' });
const buff = (s, n) => ({ op: 'status', s, n, to: 'self' });

export const ENEMIES_NEW1 = [
  // Infection every third turn tithes a plain card for the rest of the fight. Kill it before the second sting.
  { id: 'suture_wasp', name: 'Suture Wasp', act: 1, kind: 'normal', start: { strength: 1 }, hp: [36, 36],
    pattern: ['dart', 'dart', 'sting'],
    moves: {
      dart: { name: 'Dart', fx: [dmg(10)] },
      sting: { name: 'Sting (Infection)', note: 'Every third turn: 7 damage and Infection 1 (Strain counts +1 this combat).', fx: [dmg(7), debuff('infection', 1)] },
    },
    art: { body: 'wings', color: '#d9c04a', notes: 'Narrow banded wasp body, two thin glassy wings, a long sting that trails a loop of surgical thread; a needle eye sits at the stinger tip.' } },

  // Audit marks you with Dread; Fine punishes an unguarded end of turn. End with 5 Block and the Fine is only a filing.
  { id: 'ward_clerk', name: 'Ward Clerk', act: 1, kind: 'normal', start: { strength: 1 }, hp: [40, 40],
    pattern: ['audit', 'fine'],
    moves: {
      audit: { name: 'Audit (Dread)', note: '8 damage and Dread 1: end a turn with no Block and take 2 per stack.', fx: [dmg(8), debuff('dread', 1)] },
      fine: { name: 'Fine (14 if Block under 5)', note: 'Hits for 14 if you end your turn with under 5 Block, otherwise only 7.',
        fx: [{ op: 'if', cond: (c) => c.player.block < 5, ifText: 'your Block is under 5 when it acts', then: [dmg(14)], else: [dmg(7)] }] },
    },
    art: { body: 'podium', color: '#a89878', notes: 'A narrow reception desk with a tall stamp pad on top, pince-nez perched on a blank round head, a ledger spine and a dangling queue ticket.' } },

  // Cutting is the cure: every extension feeds it, every cut bruises it. Capped at 9 healing a turn.
  { id: 'knitter', name: 'Knitter', act: 1, kind: 'normal', hp: [40, 40], start: { strength: 1, loose: 1 },
    pattern: ['purl', 'cast', 'drop'],
    moves: {
      purl: { name: 'Purl', fx: [dmg(9)] },
      cast: { name: 'Cast On', fx: [dmg(4), blk(7)] },
      drop: { name: 'Dropped Stitch', fx: [dmg(13)] },
    },
    on: {
      combatStart: (A, e) => { e.data.healed = 0; },
      turnStart: (A, e) => { e.data.healed = 0; e.data.cut = false; },
      seamExtend: (A, e) => { if ((e.data.healed || 0) >= 9) return; e.data.healed = (e.data.healed || 0) + 3; A.heal(e, 3); },
      // Cuts bruise it: everything the cutting card deals (and the cashed Line pays) lands at +50% until that card resolves.
      seamCut: (A, e, info) => { if (info && info.stitches > 0 && !info.cancel) e.data.cut = true; },
      seamPay: (A, e, info) => { if (info && info.kind === 'end') e.data.cut = true; },
      playerCard: (A, e) => { e.data.cut = false; },
      modDamage: (A, e, n) => (e.data.cut ? Math.floor(n * 1.5) : n),
    },
    art: { body: 'hunched', color: '#b79ac4', notes: 'Hunched crone shape wrapped in a long scarf that is half knitted into her own body, two crossed steel needles for arms, a ball of wool yarn at her feet.' } },

  // A battery with legs. Static extensions are the only defence: each one discharges 2 per knot of Line into it.
  { id: 'surge_tick', name: 'Surge Tick', act: 1, kind: 'normal', start: { strength: 1 }, hp: [32, 32],
    pattern: ['latch', 'swell', 'latch'],
    moves: {
      latch: { name: 'Latch', fx: [dmg(8)] },
      swell: { name: 'Swell (+2 Strength)', note: 'Gains 2 Strength, so every unanswered Swell makes later Latches hit harder.', fx: [dmg(3), buff('strength', 2)] },
    },
    on: {
      seamExtend: (A, e, info) => {
        if (!info || e.dead) return;
        const stat = info.school === 'static' || (Array.isArray(info.school) && info.school.includes('static'));
        if (stat) A.dmg(A.player, e, 2 * info.len, { noMods: true, pierce: true });
      },
      // A Line that cashes Static also arcs into it: 1 per stitch paid.
      seamPay: (A, e, info) => { if (info && info.school === 'static' && info.stitches > 0 && !e.dead) A.dmg(A.player, e, info.stitches, { noMods: true, pierce: true }); },
    },
    art: { body: 'disc', color: '#6fa8d8', notes: 'Round blue-grey tick body ringed with eight crooked legs, a crackling arc of static jumping between two copper prongs on its back.' } },
];

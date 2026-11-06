// Brand-new Act 2 enemies from the depth pass (design/ENEMY_DEPTH.md and design/THREAD.md). Same schema as enemies_2.js.
// `tip` on a move lists its conditional bonuses (shown in the intent tooltip). Seam hooks: on.seamExtend/seamCut/seamPay(A, e, info),
// info as emitted by engine/seam.js (seamCut info has `len`, `school`, `stitches`, `cancel`; set cancel = true to void the payout).

const SCHOOLS = ['ember', 'echo', 'hoard', 'blood', 'rust', 'static', 'gilded'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// Ferric Warden: one Allergy move per school, so the glyph is always readable from the move name.
const allergyMoves = {};
for (const s of SCHOOLS) {
  allergyMoves['allergy_' + s] = { name: `Allergy: ${cap(s)}`, tip: `Allergic to ${cap(s)}. Your ${cap(s)} cards add no knot to the Thread and a Line cashed in ${cap(s)} pays nothing this turn.`, fx: [{ op: 'dmg', n: 12 }] };
}

export const ENEMIES_NEW2 = [
  { id: 'needle_nanny', name: 'Needle Nanny', act: 2, kind: 'normal', start: { strength: 1 }, hp: [58, 64],
    pick: (A, e) => {
      if (e.turn % 2 === 0) return 'sew';
      return e.data.patchwork ? 'embroider' : 'prick';
    },
    moves: {
      sew: { name: 'Sew', tip: 'Unpicked: one patch on one card in your hand is gone next turn.', fx: [{ op: 'dmg', n: 9 }, { op: 'status', s: 'unpicked', n: 1, to: 'player' }] },
      prick: { name: 'Prick', fx: [{ op: 'dmg', n: 14 }] },
      embroider: { name: 'Embroider', tip: 'Chosen when you play 3 or more grafted cards from one hand: she gains 2 Strength.', fx: [{ op: 'dmg', n: 7 }, { op: 'status', s: 'strength', n: 2, to: 'self' }] },
    },
    on: {
      playerCard: (A, e, { card }) => {
        if (e.data.patchwork || e.turn % 2 === 0) return;
        const n = A.c.hand.filter((k) => k.inst.grafts.length).length + (card.inst.grafts.length ? 1 : 0);
        if (n >= 3) { e.data.patchwork = true; e.move = 'embroider'; A.ev({ t: 'intent', e: e.uid, move: 'embroider' }); }
      },
      afterMove: (A, e) => { e.data.patchwork = false; },
    },
    art: { body: 'figure', color: '#c4a8b8', notes: 'Stooped figure in a grey apron, a pincushion bristling with needles strapped to one forearm and a long darning needle held like a cane.' } },

  { id: 'brine_surgeon', name: 'Brine Surgeon', act: 2, kind: 'normal', start: { strength: 1 }, hp: [62, 66],
    pick: (A, e) => {
      const t = e.turn % 3;
      if (t === 0) return 'incision';
      if (t === 1) return A.player.st.poison > 0 ? 'drain' : 'scalpel';
      return 'scalpel';
    },
    moves: {
      incision: { name: 'Incision', tip: 'Adds 2 Poison. Poison ignores Block and rises by 1 each turn.', fx: [{ op: 'dmg', n: 7 }, { op: 'status', s: 'poison', n: 2, to: 'player' }] },
      scalpel: { name: 'Scalpel', fx: [{ op: 'dmg', n: 12 }] },
      drain: { name: 'Drain', tip: 'Heals 6 for every Poison on you (max 24). Cleanse the Poison first.', fx: [{ op: 'dmg', n: 6 }, { op: 'custom', intent: 'buff', text: 'Heals 6 per Poison on you (max 24).', fn: (A, ctx) => { const p = A.player.st.poison || 0; if (p > 0) A.heal(ctx.srcEnt, Math.min(24, 6 * p)); } }] },
    },
    art: { body: 'tall', color: '#7fb5a0', notes: 'Tall green-gowned surgeon wading in a brine tank, a glass drip bag slung from the shoulder and a hooked scalpel for a hand.' } },

  { id: 'scissor_nurse', name: 'Scissor Nurse', act: 2, kind: 'normal', start: { strength: 1 }, hp: [60, 66], pattern: ['snip', 'trim', 'clip'],
    moves: {
      snip: { name: 'Snip', fx: [{ op: 'dmg', n: 12 }] },
      trim: { name: 'Trim', fx: [{ op: 'dmg', n: 7 }, { op: 'block', n: 8, to: 'self' }] },
      clip: { name: 'Clip', fx: [{ op: 'dmg', n: 16 }] },
    },
    on: {
      // Every cut that cashes gives her 2 Block; a Line of 4 or more is snipped to nothing.
      seamCut: (A, e, info) => {
        if (info.len >= 4) { info.cancel = true; A.ev({ t: 'snipped', e: e.uid }); }
        A.block(e, 2, { raw: true });
      },
    },
    art: { body: 'lamp', color: '#d8d0cc', notes: 'Starched nurse silhouette with a cap, one hand replaced by oversized open shears that catch the light.' } },

  { id: 'ferric_warden', name: 'Ferric Warden', act: 2, kind: 'normal', start: { strength: 1 }, hp: [62, 68],
    pick: (A, e) => {
      if (!e.data.order) e.data.order = A.c.rng.shuffle(SCHOOLS.slice());
      const s = e.data.order[e.turn % SCHOOLS.length];
      e.data.allergy = s;
      return 'allergy_' + s;
    },
    moves: allergyMoves,
    on: {
      // Allergy: cards of the shown school do not tie a knot, and a Line cashed in that school pays nothing.
      seamExtend: (A, e, info) => {
        if (info.school && info.school === e.data.allergy && A.c.seam.len > 0) A.c.seam.len = Math.max(0, A.c.seam.len - 1);
      },
      seamCut: (A, e, info) => { if (info.school && info.school === e.data.allergy) info.cancel = true; },
    },
    art: { body: 'cone', color: '#9aa7b4', notes: 'Iron-filings cone with a heavy riveted visor and a magnet horseshoe lantern hung at the waist, glyph chalked on the chest.' } },

  { id: 'tax_collector', name: 'Tax Collector', act: 2, kind: 'normal', start: { strength: 1 }, hp: [60, 66], pattern: ['levy', 'audit', 'seize'],
    moves: {
      levy: { name: 'Levy', fx: [{ op: 'dmg', n: 12 }] },
      audit: { name: 'Audit Trail', fx: [{ op: 'dmg', n: 7 }, { op: 'block', n: 8, to: 'self' }] },
      seize: { name: 'Seize', tip: 'Also takes 5 gold whenever a Gilded cut pays you. Kill it to get the gold back.', fx: [{ op: 'dmg', n: 16 }] },
    },
    on: {
      seamPay: (A, e, info) => {
        if (info.school !== 'gilded' || !(info.amount > 0)) return;
        const take = Math.min(5, A.c.run.gold || 0);
        if (take > 0) { A.gold(-take); e.data.loot = (e.data.loot || 0) + take; }
      },
      death: (A, e) => { if (e.data.loot > 0) A.gold(e.data.loot); },
    },
    art: { body: 'hat', color: '#8c7a4a', notes: 'Squat clerk under a wide bowler hat, a brass-bound ledger clamped under one arm and a coin-slot satchel swinging at the hip.' } },
];

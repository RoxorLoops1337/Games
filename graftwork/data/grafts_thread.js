// Thread grafts: knots (see design/THREAD.md). Same schema as the other graft files; every tier lives here.
// Hooks run in onPlay, which fires AFTER the engine has stepped the Line for this card, so c.seam is current.
// Engine flags read by engine/seam.js (E1): hooks.noCut (a would-be cut becomes Slack), hooks.wild (counts as every school, adds no count).
const hasD = (s) => s.fx.some((o) => o.op === 'dmg');
const hasB = (s) => s.fx.some((o) => o.op === 'block');
const numbers = (s) => hasD(s) || hasB(s);
const foe = (A, ctx) => (ctx.target && !ctx.target.dead ? ctx.target : (A.alive()[0] || null));
const stitchesOf = (len) => Math.max(0, Math.min(5, len || 0) - 1);
const seam = (A) => A.c.seam || { len: 0, set: [], counts: {}, cuts: 0 };
const schoolsIn = (s) => Object.keys(s.counts || {}).filter((k) => s.counts[k] > 0);

// What did the engine just do with THIS card? Reads the event log (seamExtend / seamCut / seamSlack / seamFray).
function kindOf(A, ctx) {
  const ev = A.c.ev, uid = ctx.card && ctx.card.uid;
  for (let i = ev.length - 1, k = 0; i >= 0 && k < 24; i--, k++) {
    const e = ev[i];
    const mine = e.card === uid || (e.card && e.card.uid === uid);
    if (!mine) continue;
    if (e.t === 'play') break;
    if (e.t === 'seamExtend') return { kind: 'extend', len: e.len };
    if (e.t === 'seamCut') return { kind: 'cut', len: e.len, paid: e.paid !== false };
    if (e.t === 'seamSlack') return { kind: 'slack' };
    if (e.t === 'seamFray') return { kind: 'fray' };
  }
  return { kind: null };
}
// run fn(info) only for the first play of a card (replays count once)
const on = (kinds, fn) => (A, ctx) => { if (ctx.replay) return; const i = kindOf(A, ctx); if (kinds.includes(i.kind)) fn(A, ctx, i); };
// extra damage (or Block on pure block cards)
function bonus(A, ctx, n) {
  if (!(n > 0)) return;
  const v = Math.max(1, Math.round(n * (ctx.mult || 1)));
  if (hasD(ctx.spec)) { const t = foe(A, ctx); if (t) A.dmg(A.player, t, v, { card: true }); } else A.block(A.player, v);
}
const G = (id, name, school, weight, tier, rarity, boon, price, mods, extra = {}) => ({ id, name, school, weight, tier, rarity, boon, price, mods, ...extra });
const H = (hooks) => ({ k: 'custom', hooks });

export const GRAFTS_THREAD = [
  // ================= SAFE (weight 1) =================
  G('g_barbed_knot', 'Barbed Knot', 'blood', 1, 'safe', 'common', 'When it extends the Line, apply 1 Bleed per knot.', 'Lose 1 HP when played.',
    [H({ onPlay: on(['extend'], (A, ctx, i) => { const t = foe(A, ctx); if (t) A.status(t, 'bleed', Math.min(5, seam(A).len)); }) }), { k: 'selfHurt', n: 1 }], { ok: (s) => s.target === 'enemy' && numbers(s) }),
  G('g_slip_knot', 'Slip Knot', 'static', 1, 'safe', 'common', 'Never cuts the Line (it goes Slack instead). Gain 2 Charge.', '15% chance to jam.',
    [H({ noCut: true }), { k: 'addFx', fx: [{ op: 'status', s: 'charge', n: 2, to: 'self' }] }, { k: 'jam', p: 0.15 }]),
  G('g_pilot_knot', 'Pilot Knot', 'hoard', 1, 'safe', 'common', '+2 damage or Block per knot in the Line.', '-15% numbers.',
    [H({ onPlay: (A, ctx) => { if (!ctx.replay) bonus(A, ctx, 2 * Math.max(0, seam(A).len - 1)); } }), { k: 'pct', pct: -15 }], { ok: numbers }),
  G('g_whip_stitch', 'Whip Stitch', 'ember', 1, 'safe', 'common', 'When it extends the Line, light 1 Burn per 2 knots on its target.', 'Lose 1 HP when played.',
    [H({ onPlay: on(['extend'], (A, ctx) => { const t = foe(A, ctx); if (t) A.status(t, 'burn', Math.max(1, Math.floor(seam(A).len / 2))); }) }), { k: 'selfHurt', n: 1 }], { ok: (s) => s.target === 'enemy' && numbers(s) }),
  G('g_running_stitch', 'Running Stitch', 'static', 1, 'safe', 'common', 'When it extends the Line, gain 2 Charge.', 'Add a Static Cling to your discard.',
    [H({ onPlay: on(['extend'], (A) => A.status(A.player, 'charge', 2)) }), { k: 'junk', card: 'j_static', n: 1, to: 'discard', when: 'combatStart' }]),
  G('g_blanket_stitch', 'Blanket Stitch', 'hoard', 1, 'safe', 'uncommon', 'When it extends the Line, draw 1.', 'Draw 1 fewer card next turn.',
    [H({ onPlay: on(['extend'], (A) => A.draw(1)) }), { k: 'drawdown', n: 1 }], { ok: (s) => !s.flags.ethereal }),
  G('g_cross_ply', 'Cross Ply', 'rust', 1, 'safe', 'common', 'When it extends the Line, gain 2 Block per knot.', 'Add a Rust Flake to your discard.',
    [H({ onPlay: on(['extend'], (A) => A.block(A.player, 2 * Math.min(5, seam(A).len))) }), { k: 'junk', card: 'j_flake', n: 1, to: 'discard', when: 'combatStart' }]),
  G('g_mattress_stitch', 'Mattress Stitch', 'blood', 1, 'safe', 'uncommon', 'When it extends the Line, heal 1 per knot (max 4).', 'Lose 2 HP when played.',
    [H({ onPlay: on(['extend'], (A) => A.heal(A.player, Math.min(4, seam(A).len))) }), { k: 'selfHurt', n: 2 }]),
  G('g_fine_gilt', 'Fine Gilt Thread', 'gilded', 1, 'safe', 'common', 'When it extends the Line, gain 2 gold.', '10% chance to jam.',
    [H({ onPlay: on(['extend'], (A) => A.gold(2)) }), { k: 'jam', p: 0.1 }]),
  G('g_anchor_knot', 'Anchor Knot', 'blood', 1, 'safe', 'uncommon', 'If the Line is 3 knots or longer, Tie it.', 'Lose 1 HP when played.',
    [H({ onPlay: (A, ctx) => { if (!ctx.replay && seam(A).len >= 3) seam(A).tied = true; } }), { k: 'selfHurt', n: 1 }]),

  // ================= GREEDY (weight 2 to 3) =================
  G('g_clove_hitch', 'Clove Hitch', 'rust', 2, 'greedy', 'uncommon', 'When it extends the Line, it counts as 2 knots.', 'Add a Clot to your discard.',
    [H({ onPlay: on(['extend'], (A) => { const s = seam(A); if (s.len < 5) { s.len += 1; const top = (s.set || [])[0]; if (top) s.counts[top] = (s.counts[top] || 0) + 1; } }) }), { k: 'junk', card: 'j_clot', n: 1, to: 'discard', when: 'combatStart' }]),
  G('g_scissor_loop', 'Scissor Loop', 'ember', 2, 'greedy', 'uncommon', 'When it cuts the Line, deal 3 damage per knot to all enemies.', 'Exhaust.',
    [H({ onPlay: on(['cut'], (A, ctx, i) => { const n = 3 * Math.max(1, Math.min(5, i.len || 1)); for (const e of A.alive()) A.dmg(A.player, e, n, { card: true }); }) }), { k: 'flag', f: 'exhaust' }], { ok: (s) => !s.flags.exhaust && numbers(s) }),
  G('g_reef_knot', 'Reef Knot', 'echo', 2, 'greedy', 'uncommon', 'When it cuts the Line, gain 1 Echo. Extending also gains 1 Echo once per turn.', '15% chance to jam.',
    [H({ onPlay: on(['cut', 'extend'], (A, ctx, i) => { const c = A.c; c.rx = c.rx || {}; if (i.kind === 'cut') A.status(A.player, 'echo', 1); else if (c.rx.reefTurn !== c.turn) { c.rx.reefTurn = c.turn; A.status(A.player, 'echo', 1); } }) }), { k: 'jam', p: 0.15 }], { ok: (s) => s.cost !== 'X' }),
  G('g_surgeons_knot', 'Surgeon\'s Knot', 'gilded', 2, 'greedy', 'rare', 'When it cuts the Line, gain 4 gold per stitch (max 20).', 'Costs 1 gold to play.',
    [H({ onPlay: on(['cut'], (A, ctx, i) => A.gold(Math.min(20, 4 * stitchesOf(i.len)))) }), { k: 'goldCost', n: 1 }]),
  G('g_pure_thread', 'Pure Thread', 'hoard', 2, 'greedy', 'uncommon', 'If the Line holds only one school, +3 damage or Block per knot.', '-20% numbers.',
    [H({ onPlay: (A, ctx) => { if (ctx.replay) return; const s = seam(A); if (schoolsIn(s).length === 1) bonus(A, ctx, 3 * Math.max(0, s.len - 1)); } }), { k: 'pct', pct: -20 }], { ok: numbers }),
  G('g_tight_seam', 'Tight Seam', 'hoard', 2, 'greedy', 'rare', 'When it extends the Line, Tie it. Retain.', 'Exhaust.',
    [H({ onPlay: on(['extend'], (A) => { seam(A).tied = true; }) }), { k: 'flag', f: 'retain' }, { k: 'flag', f: 'exhaust' }], { ok: (s) => !s.flags.exhaust && !s.flags.ethereal }),
  G('g_surge_loop', 'Surge Loop', 'static', 3, 'greedy', 'rare', 'When it cuts the Line, gain 1 Charge per stitch (max 4).', 'Lose 1 HP when played.',
    [H({ onPlay: on(['cut'], (A, ctx, i) => A.status(A.player, 'charge', Math.min(4, stitchesOf(i.len)))) }), { k: 'selfHurt', n: 1 }]),

  // ================= WEIRD (changes how the card works) =================
  G('g_granny_knot', 'Granny Knot', 'rust', 1, 'weird', 'uncommon', 'Counts as every school in the Line, adds no count.', '-25% numbers.',
    [H({ wild: true }), { k: 'pct', pct: -25 }, { k: 'addFx', fx: [{ op: 'block', n: 2 }] }]),
  G('g_mirror_stitch', 'Mirror Stitch', 'echo', 1, 'weird', 'uncommon', 'Adds a count to the Line\'s top school without adding length.', '15% chance to jam.',
    [H({ onPlay: (A, ctx) => { if (ctx.replay) return; const s = seam(A); const top = Object.keys(s.counts || {}).sort((a, b) => s.counts[b] - s.counts[a])[0]; if (top) s.counts[top] += 1; } }), { k: 'jam', p: 0.15 }], { ok: (s) => s.cost !== 'X' }),
  G('g_bridge_stitch', 'Bridge Stitch', 'echo', 2, 'weird', 'rare', 'Adds a count to every school in the Line, so a second school can pay.', '25% chance to jam.',
    [H({ onPlay: (A, ctx) => { if (ctx.replay) return; const s = seam(A); for (const k of schoolsIn(s)) s.counts[k] += 1; } }), { k: 'jam', p: 0.25 }]),
  G('g_motley_patch', 'Motley Patch', 'rust', 1, 'weird', 'uncommon', 'If the Line holds 2 or more schools, +8 damage or Block.', '20% chance to jam.',
    [H({ onPlay: (A, ctx) => { if (!ctx.replay && schoolsIn(seam(A)).length >= 2) bonus(A, ctx, 8); } }), { k: 'jam', p: 0.2 }], { ok: numbers }),
  G('g_spent_thread', 'Spent Thread', 'gilded', 1, 'weird', 'rare', 'After it cuts the Line, the new Line starts at 2 knots.', 'Exhaust.',
    [H({ onPlay: on(['cut'], (A) => { const s = seam(A); s.len = Math.max(s.len, 2); }) }), { k: 'flag', f: 'exhaust' }], { ok: (s) => !s.flags.exhaust }),
  G('g_unraveller', 'Unraveller', 'ember', 2, 'weird', 'rare', 'After it plays, drop the Line to 1 knot and deal 5 damage per knot lost to all enemies.', 'Lose 1 HP when played.',
    [H({ onPlay: (A, ctx) => { if (ctx.replay) return; const s = seam(A); const lost = Math.max(0, s.len - 1); if (!lost) return; s.len = 1; for (const e of A.alive()) A.dmg(A.player, e, 5 * lost, { card: true }); } }), { k: 'selfHurt', n: 1 }], { ok: (s) => s.cost !== 'X' }),
];

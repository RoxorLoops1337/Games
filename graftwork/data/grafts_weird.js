// WEIRD grafts: they change how the card works. Per-combat state lives on the wrapped combat card
// (card.bonus, card.held, ...), never on shared data. Hooks only use the documented A API.

const hasD = (s) => s.fx.some((o) => o.op === 'dmg');
const hasB = (s) => s.fx.some((o) => o.op === 'block');
const numeric = (s) => typeof s.cost === 'number';
const tgt = (A, ctx) => (ctx.target && !ctx.target.dead ? ctx.target : (A.alive()[0] || null));

// extra damage (or block on pure block cards), scaled like the card's own numbers
function bonusHit(A, ctx, n) {
  if (!(n > 0)) return;
  const v = Math.max(1, Math.round(n * (ctx.mult || 1)));
  if (hasD(ctx.spec)) { const t = tgt(A, ctx); if (t) A.dmg(A.player, t, v, { card: true }); }
  else if (hasB(ctx.spec)) A.block(A.player, v);
}
// total block this play would grant (plain numbers only)
function blockOf(ctx) {
  let b = 0;
  for (const o of ctx.spec.fx) if (o.op === 'block') b += typeof o.n === 'number' ? o.n : ((o.n && o.n.base) || 0);
  return b > 0 ? Math.max(1, Math.round(b * (ctx.mult || 1))) : 0;
}
// repeat this play's damage and block k more times
function again(A, ctx, k) {
  if (!(k > 0)) return;
  const t = tgt(A, ctx);
  if (ctx.dealt > 0 && t) A.dmg(A.player, t, ctx.dealt * k, { noMods: true, card: true });
  const b = blockOf(ctx);
  if (b > 0) A.block(A.player, b * k);
}
function exhaustFromHand(A, card) {
  const c = A.c;
  const i = c.hand.indexOf(card);
  if (i < 0) return false;
  c.hand.splice(i, 1);
  c.exhaust.push(card);
  card.jam = false; card.costMod = 0;
  c.ev.push({ t: 'exhaust', card: card.uid });
  return true;
}
const isJunk = (k) => String(k.inst.id).startsWith('j_');
// damage taken since this card last left your hand (discarded or played)
const owed = (A, card) => (card.mark === undefined ? 0 : Math.max(0, A.c.damageTakenThisCombat - card.mark));
const stamp = (A, card) => { card.mark = A.c.damageTakenThisCombat; };
const DEBUFFS = ['burn', 'bleed', 'vulnerable', 'weak', 'frail', 'marked'];
const dmgOrBlock = (s) => hasD(s) || hasB(s);
const single = (s) => s.target !== 'all' && dmgOrBlock(s);
const AB = ['attack', 'skill'];

export const GRAFTS_WEIRD = [
  { id: 'g_hollow_bone', name: 'Hollow Bone', school: 'rust', weight: 2, tier: 'weird', rarity: 'common', boon: 'Costs 1 less.', price: 'Exhausts.', mods: [{ k: 'cost', d: -1 }, { k: 'flag', f: 'exhaust' }] },

  // ---------- common ----------
  { id: 'g_ratchet_gear', name: 'Ratchet Gear', school: 'rust', weight: 1, tier: 'weird', rarity: 'common', types: AB, ok: dmgOrBlock,
    boon: 'Each time this is discarded unplayed, it gains +2 numbers for the rest of the combat.', price: 'Costs 1 more.',
    mods: [{ k: 'cost', d: 1 }, { k: 'custom', hooks: {
      onDiscard(A, { card }) { card.bonus = Math.min(20, (card.bonus || 0) + 2); },
      onPlay(A, ctx) { bonusHit(A, ctx, ctx.card.bonus || 0); },
    } }] },
  { id: 'g_coward_suture', name: 'Coward Suture', school: 'rust', weight: 1, tier: 'weird', rarity: 'common', types: AB,
    boon: 'If you discard this unplayed, gain 6 block.', price: 'Its numbers are 25% lower.',
    mods: [{ k: 'pct', pct: -25 }, { k: 'custom', hooks: { onDiscard(A) { A.block(A.player, 6); } } }] },
  { id: 'g_slow_tumor', name: 'Slow Tumor', school: 'blood', weight: 1, tier: 'weird', rarity: 'common', types: AB, ok: (s) => dmgOrBlock(s) && numeric(s) && s.cost <= 2,
    boon: 'Each time you draw it, it deals or blocks 4 more this play.', price: 'Each time you draw it, it costs 1 more until played.',
    mods: [{ k: 'custom', hooks: {
      onDraw(A, { card }) { card.costMod = (card.costMod || 0) + 1; card.surge = 4; },
    } }, { k: 'custom', hooks: { onPlay(A, ctx) { bonusHit(A, ctx, ctx.card.surge || 0); } } }] },
  { id: 'g_vampire_teeth', name: 'Vampire Teeth', school: 'blood', weight: 1, tier: 'weird', rarity: 'common', types: ['attack'], ok: (s) => s.target === 'enemy' && hasD(s),
    boon: 'After the hit, if the target is at half HP or lower (or dead), heal 6.', price: 'Otherwise lose 2 HP.',
    mods: [{ k: 'custom', hooks: { onPlay(A, ctx) {
      if (ctx.replay) return;
      const t = ctx.target;
      if (!t || t.dead || t.hp * 2 <= t.maxHp) A.heal(A.player, 6);
    } } }, { k: 'custom', hooks: { onPlay(A, ctx) {
      if (ctx.replay) return;
      const t = ctx.target;
      if (t && !t.dead && t.hp * 2 > t.maxHp) A.loseHp(A.player, 2, { floor1: true, src: 'graft' });
    } } }] },
  { id: 'g_loaded_die', name: 'Loaded Die', school: 'hoard', weight: 1, tier: 'weird', rarity: 'common', types: AB, ok: dmgOrBlock,
    boon: 'On play, deals or blocks a random 0 to 8 extra.', price: '25% chance to jam (costs 1 more).',
    mods: [{ k: 'jam', p: 0.25 }, { k: 'custom', hooks: { onPlay(A, ctx) { if (!ctx.replay) ctx.card.roll = A.rng.int(9); bonusHit(A, ctx, ctx.card.roll || 0); } } }] },
  { id: 'g_return_spring', name: 'Return Spring', school: 'echo', weight: 1, tier: 'weird', rarity: 'common', types: AB, ok: dmgOrBlock,
    boon: 'If you discard this unplayed, it goes on top of your draw pile.', price: 'Costs 1 more.',
    mods: [{ k: 'cost', d: 1 }, { k: 'custom', hooks: { onDiscard(A, { card }) {
      const c = A.c;
      const i = c.discard.indexOf(card);
      if (i >= 0) { c.discard.splice(i, 1); c.drawPile.push(card); }
    } } }] },

  // ---------- uncommon ----------
  { id: 'g_debt_note', name: 'Debt Note', school: 'blood', weight: 2, tier: 'weird', rarity: 'uncommon', types: AB, ok: (s) => numeric(s) && s.cost >= 1,
    boon: 'Costs 0 when drawn.', price: 'On play, lose 2 HP per energy it would have cost.',
    mods: [{ k: 'custom', hooks: {
      onDraw(A, { card, spec }) { card.costSet = 0; card.debt = numeric(spec) ? spec.cost : 0; },
      onDiscard(A, { card }) { card.debt = 0; },
    } }, { k: 'custom', hooks: { onPlay(A, ctx) {
      if (ctx.replay) return;
      const d = ctx.card.debt || 0;
      ctx.card.debt = 0;
      if (d > 0) A.loseHp(A.player, 2 * d, { floor1: true, src: 'graft' });
    } } }] },
  { id: 'g_host_leech', name: 'Host Leech', school: 'blood', weight: 2, tier: 'weird', rarity: 'uncommon', types: AB, ok: (s) => s.target === 'enemy',
    boon: "On play, strip the target's strongest debuff: gain 2 block per stack (max 20) and 1 Strength.", price: 'Gain 1 Weak each time you play it.',
    mods: [{ k: 'selfStatus', s: 'weak', n: 1 }, { k: 'custom', hooks: { onPlay(A, ctx) {
      if (ctx.replay) return;
      const t = ctx.target;
      if (!t || t.dead) return;
      let best = null;
      for (const s of DEBUFFS) if ((t.st[s] || 0) > (best ? t.st[best] : 0)) best = s;
      if (!best) return;
      const n = t.st[best];
      A.setStatus(t, best, 0);
      A.block(A.player, 2 * Math.min(n, 10));
      A.status(A.player, 'strength', 1);
    } } }] },
  { id: 'g_fuse_wire', name: 'Fuse Wire', school: 'static', weight: 2, tier: 'weird', rarity: 'uncommon', types: AB,
    boon: 'On play, also deals half the damage the previous card dealt this turn.', price: 'Cannot be played until you have played an Attack this turn.',
    mods: [{ k: 'flag', f: 'needsAttackPlayed' }, { k: 'custom', hooks: { onPlay(A, ctx) {
      if (ctx.replay) return;
      const c = A.c;
      const last = c.cardsThisTurn[c.cardsThisTurn.length - 1];
      if (!last) return;
      const prev = [...c.discard, ...c.exhaust, ...c.powers].find((k) => k.uid === last.uid);
      const h = prev ? Math.floor((prev.dealt || 0) / 2) : 0;
      const t = tgt(A, ctx);
      if (h > 0 && t) A.dmg(A.player, t, h, { noMods: true, card: true });
    } } }] },
  { id: 'g_gold_wager', name: 'Gold Wager', school: 'gilded', weight: 2, tier: 'weird', rarity: 'uncommon', types: AB, ok: single,
    boon: 'On play, spend 10 gold to double its damage and block. With less than 10 gold you only get the base effect.', price: 'Costs 1 more.',
    mods: [{ k: 'cost', d: 1 }, { k: 'custom', hooks: { onPlay(A, ctx) {
      const card = ctx.card;
      if (!ctx.replay) { card.wager = (A.c.run.gold || 0) >= 10; if (card.wager) A.gold(-10); }
      if (card.wager) again(A, ctx, 1);
    } } }] },
  { id: 'g_hungry_maw', name: 'Hungry Maw', school: 'blood', weight: 2, tier: 'weird', rarity: 'uncommon', types: AB, ok: single,
    boon: 'On play, exhaust a junk card from your hand to double its damage and block.', price: 'Adds Paperwork to your discard pile at combat start.',
    mods: [{ k: 'junk', card: 'j_paperwork', n: 1 }, { k: 'custom', hooks: { onPlay(A, ctx) {
      const card = ctx.card;
      if (!ctx.replay) { const j = A.c.hand.find(isJunk); card.fed = !!(j && exhaustFromHand(A, j)); }
      if (card.fed) again(A, ctx, 1);
    } } }] },
  { id: 'g_mourning_band', name: 'Mourning Band', school: 'rust', weight: 2, tier: 'weird', rarity: 'uncommon', types: AB, ok: (s) => dmgOrBlock(s) && numeric(s) && s.cost >= 1,
    boon: 'When drawn, costs 1 less per 2 exhausted cards (max 2).', price: 'Its numbers are 20% lower.',
    mods: [{ k: 'pct', pct: -20 }, { k: 'custom', hooks: {
      onDraw(A, { card }) { card.costMod = -Math.min(2, Math.floor(A.c.exhaust.length / 2)); },
      onTurnStart(A, { card }) { card.costMod = -Math.min(2, Math.floor(A.c.exhaust.length / 2)); },
    } }] },
  { id: 'g_spite_sting', name: 'Spite Sting', school: 'blood', weight: 2, tier: 'weird', rarity: 'uncommon', types: ['attack'], ok: (s) => s.target === 'enemy',
    boon: 'On play, deal extra damage equal to the damage you took since it last left your hand (max 24).', price: 'Lose 2 HP when played.',
    mods: [{ k: 'selfHurt', n: 2 }, { k: 'custom', hooks: {
      onDiscard(A, { card }) { stamp(A, card); },
      onDraw(A, { card }) { card.owed = owed(A, card); },
      onPlay(A, ctx) {
        if (ctx.replay) return;
        const n = Math.min(24, ctx.card.owed || 0);
        const t = tgt(A, ctx);
        if (n > 0 && t) A.dmg(A.player, t, n, { card: true });
        ctx.card.owed = 0;
        stamp(A, ctx.card);
      },
    } }] },
  { id: 'g_borrowed_time', name: 'Borrowed Time', school: 'gilded', weight: 2, tier: 'weird', rarity: 'uncommon', types: AB, ok: (s) => numeric(s) && s.cost >= 1,
    boon: 'When drawn, costs 0 if you took damage since it last left your hand.', price: 'Exhausts.',
    mods: [{ k: 'flag', f: 'exhaust' }, { k: 'custom', hooks: {
      onDiscard(A, { card }) { stamp(A, card); },
      onDraw(A, { card }) { if (owed(A, card) > 0) card.costSet = 0; },
      onPlay(A, ctx) { stamp(A, ctx.card); },
    } }] },
  { id: 'g_gold_lever', name: 'Gold Lever', school: 'gilded', weight: 2, tier: 'weird', rarity: 'uncommon', types: AB, ok: dmgOrBlock,
    boon: 'On play, deals or blocks 1 extra per 6 gold you hold (max 12).', price: 'Spends 5 gold on play. With less than 5 gold there is no bonus.',
    mods: [{ k: 'custom', hooks: { onPlay(A, ctx) {
      if (ctx.replay) return;
      const g = A.c.run.gold || 0;
      ctx.card.lever = g >= 5 ? Math.min(12, Math.floor(g / 6)) : 0;
      if (g >= 5) A.gold(-5);
    } } }, { k: 'custom', hooks: { onPlay(A, ctx) { bonusHit(A, ctx, ctx.card.lever || 0); } } }] },
  { id: 'g_ash_pact', name: 'Ash Pact', school: 'ember', weight: 2, tier: 'weird', rarity: 'uncommon', types: AB, ok: (s) => s.target === 'enemy',
    boon: 'On play, apply 4 Burn to the target.', price: 'Also gain 2 Burn yourself.',
    mods: [{ k: 'custom', hooks: { onPlay(A, ctx) { const t = tgt(A, ctx); if (!ctx.replay && t) A.status(t, 'burn', 4); } } },
      { k: 'custom', hooks: { onPlay(A, ctx) { if (!ctx.replay) A.status(A.player, 'burn', 2); } } }] },

  // ---------- rare ----------
  { id: 'g_mirror_lens', name: 'Mirror Lens', school: 'echo', weight: 2, tier: 'weird', rarity: 'rare', types: AB,
    boon: 'On play, gain Echo 1: the next card you play is played twice.', price: 'Exhausts. Draw 1 fewer card next turn.',
    mods: [{ k: 'flag', f: 'exhaust' }, { k: 'drawdown', n: 1 }, { k: 'custom', hooks: { onPlay(A, ctx) { if (!ctx.replay) A.status(A.player, 'echo', 1); } } }] },
  { id: 'g_fuse_seam', name: 'Fuse Seam', school: 'rust', weight: 2, tier: 'weird', rarity: 'rare', types: AB, ok: dmgOrBlock,
    boon: 'When drawn, discard the top card of your draw pile and gain +3 numbers for the rest of the combat.', price: 'Ethereal.',
    mods: [{ k: 'flag', f: 'ethereal' }, { k: 'custom', hooks: {
      onDraw(A, { card }) {
        const c = A.c;
        const top = c.drawPile[c.drawPile.length - 1];
        if (!top || top === card) return;
        c.drawPile.pop(); c.discard.push(top);
        c.ev.push({ t: 'discard', card: top.uid, why: 'fuse' });
        card.bonus = Math.min(15, (card.bonus || 0) + 3);
      },
      onPlay(A, ctx) { bonusHit(A, ctx, ctx.card.bonus || 0); },
    } }] },
  { id: 'g_echo_pole', name: 'Echo Pole', school: 'echo', weight: 2, tier: 'weird', rarity: 'rare', types: AB, ok: single,
    boon: 'Retain. Each turn it is held, it repeats its damage and block one more time when played (max 5).', price: 'Costs 1 more.',
    mods: [{ k: 'flag', f: 'retain' }, { k: 'cost', d: 1 }, { k: 'custom', hooks: {
      onDraw(A, { card }) { card.drawT = A.c.turn; card.held = 0; },
      onDiscard(A, { card }) { card.held = 0; },
      onTurnStart(A, { card }) { if (card.drawT !== undefined && card.drawT < A.c.turn) card.held = Math.min(5, (card.held || 0) + 1); },
      onPlay(A, ctx) { again(A, ctx, ctx.card.held || 0); },
    } }] },
  { id: 'g_altar_slab', name: 'Altar Slab', school: 'blood', weight: 2, tier: 'weird', rarity: 'rare', types: AB, ok: single,
    boon: 'On play, exhaust another card in your hand (junk first) to repeat its damage and block once.', price: 'Exhausts.',
    mods: [{ k: 'flag', f: 'exhaust' }, { k: 'custom', hooks: { onPlay(A, ctx) {
      const card = ctx.card;
      if (!ctx.replay) {
        const h = A.c.hand;
        const v = h.find(isJunk) || h[h.length - 1];
        card.paid = !!(v && exhaustFromHand(A, v));
      }
      if (card.paid) again(A, ctx, 1);
    } } }] },
  { id: 'g_split_seam', name: 'Split Seam', school: 'static', weight: 2, tier: 'weird', rarity: 'rare', types: ['attack'], ok: (s) => s.target === 'enemy' && hasD(s),
    boon: 'Also hits another random enemy for the damage it dealt.', price: 'Exhausts.',
    mods: [{ k: 'flag', f: 'exhaust' }, { k: 'custom', hooks: { onPlay(A, ctx) {
      if (!(ctx.dealt > 0)) return;
      const others = A.alive().filter((e) => e !== ctx.target);
      if (others.length) A.dmg(A.player, A.rng.pick(others), ctx.dealt, { noMods: true, card: true });
    } } }] },
  { id: 'g_last_word', name: 'Last Word', school: 'ember', weight: 2, tier: 'weird', rarity: 'rare', types: ['attack'], ok: (s) => s.target === 'enemy' && hasD(s),
    boon: 'If this kills its target, draw 2 cards and gain 1 energy.', price: 'Exhausts.',
    mods: [{ k: 'flag', f: 'exhaust' }, { k: 'custom', hooks: { onPlay(A, ctx) {
      if (ctx.replay || !ctx.target || !ctx.target.dead) return;
      A.draw(2); A.energy(1);
    } } }] },
  { id: 'g_grudge_knot', name: 'Grudge Knot', school: 'blood', weight: 2, tier: 'weird', rarity: 'rare', types: ['attack'], ok: (s) => s.target === 'enemy' && hasD(s),
    boon: 'Deals +2 damage per 4 damage you have taken this combat (max +12).', price: 'Lose 2 HP when played.',
    mods: [{ k: 'selfHurt', n: 2 }, { k: 'custom', hooks: { onPlay(A, ctx) {
      bonusHit(A, ctx, Math.min(12, 2 * Math.floor(A.c.damageTakenThisCombat / 4)));
    } } }] },
  { id: 'g_hoard_memory', name: 'Hoard Memory', school: 'hoard', weight: 2, tier: 'weird', rarity: 'rare', types: AB, ok: dmgOrBlock,
    boon: 'Deals or blocks 1 extra per 2 cards in your discard pile (max 10).', price: 'Adds a Clot to your discard pile when played.',
    mods: [{ k: 'junk', card: 'j_clot', n: 1, to: 'discard', when: 'onPlay' }, { k: 'custom', hooks: { onPlay(A, ctx) {
      bonusHit(A, ctx, Math.min(10, Math.floor(A.c.discard.length / 2)));
    } } }] },
];

// EXTRA grafts: school identity and synergy. Resonance wakes at 3 or 6 grafts of one school, so these grafts read the deck
// (A.c.run.deck), the Strain (A.c.strain), the Tithed cards and the jammed cards in hand. Several mix two schools on purpose.
// Hooks only use the documented A API; per-combat state is never kept on shared data.
import { GRAFTS } from './index.js'; // read only inside hooks at runtime (circular import is safe)

const hasD = (s) => s.fx.some((o) => o.op === 'dmg');
const hasB = (s) => s.fx.some((o) => o.op === 'block');
const dmgOrBlock = (s) => hasD(s) || hasB(s);
const hits = (s) => hasD(s) && (s.target === 'enemy' || s.target === 'all');
const num = (s) => typeof s.cost === 'number';
const AB = ['attack', 'skill'];
const ATK = ['attack'];
const ALL = ['attack', 'skill', 'power'];

// number of grafts in the deck belonging to any of the given schools
function stack(A, ...schools) {
  let n = 0;
  for (const inst of A.c.run.deck) for (const gid of inst.grafts) { const g = GRAFTS[gid]; if (g && schools.includes(g.school)) n++; }
  return n;
}
const strainOf = (A) => (A.c.strain ? A.c.strain.strain : 0);
const tithedOf = (A) => (A.c.strain ? A.c.strain.tithed.length : 0);
const junkIn = (A) => A.c.hand.filter((k) => String(k.inst.id).startsWith('j_'));
const pick = (A, ctx) => (ctx.target && !ctx.target.dead ? ctx.target : (A.alive()[0] || null));
// extra damage (or block on pure block cards), scaled like the card's own numbers
function boost(A, ctx, n) {
  if (!(n > 0)) return;
  const v = Math.max(1, Math.round(n * (ctx.mult || 1)));
  if (hasD(ctx.spec)) { const t = pick(A, ctx); if (t) A.dmg(A.player, t, v, { card: true }); }
  else if (hasB(ctx.spec)) A.block(A.player, v);
}
// repeat this play's damage and block k more times
function again(A, ctx, k) {
  const t = pick(A, ctx);
  if (ctx.dealt > 0 && t) A.dmg(A.player, t, ctx.dealt * k, { noMods: true, card: true });
  let b = 0;
  for (const o of ctx.spec.fx) if (o.op === 'block') b += typeof o.n === 'number' ? o.n : ((o.n && o.n.base) || 0);
  if (b > 0) A.block(A.player, Math.max(1, Math.round(b * (ctx.mult || 1))) * k);
}
const hook = (fn) => ({ k: 'custom', hooks: { onPlay: fn } });
const G = (o) => o;

export const GRAFTS_EXTRA = [
  // ================= EMBER =================
  G({ id: 'g_kindred_coals', name: 'Kindred Coals', school: 'ember', weight: 1, tier: 'safe', rarity: 'common', types: ATK, ok: hits,
    boon: '+2 damage per Ember graft in your deck (max 10).', price: 'Lose 2 HP when played.',
    mods: [{ k: 'selfHurt', n: 2 }, hook((A, ctx) => boost(A, ctx, Math.min(10, 2 * stack(A, 'ember'))))] }),
  G({ id: 'g_pyre_ledger', name: 'Pyre Ledger', school: 'ember', weight: 2, tier: 'greedy', rarity: 'uncommon', types: ATK, ok: (s) => hits(s) && !s.flags.exhaust,
    boon: 'Apply 2 Burn per Ember graft in your deck (max 12).', price: 'Exhaust. Lose 3 HP when played.',
    mods: [{ k: 'flag', f: 'exhaust' }, { k: 'selfHurt', n: 3 }, hook((A, ctx) => { const t = pick(A, ctx); const n = Math.min(12, 2 * stack(A, 'ember')); if (t && n) A.status(t, 'burn', n); })] }),
  G({ id: 'g_fever_wick', name: 'Fever Wick', school: 'ember', weight: 2, tier: 'weird', rarity: 'rare', types: ATK, ok: (s) => hits(s) && num(s) && s.cost <= 2,
    boon: 'Apply 1 Burn, plus 2 per point of Strain (max 13).', price: 'Costs 1 more. Lose 1 HP per Strain when played (max 5).',
    mods: [{ k: 'cost', d: 1 }, hook((A, ctx) => {
      const s = strainOf(A); const t = pick(A, ctx);
      if (t) A.status(t, 'burn', Math.min(13, 1 + 2 * s));
      if (s > 0 && !ctx.replay) A.loseHp(A.player, Math.min(3, s), { floor1: true, src: 'graft' });
    })] }),
  G({ id: 'g_hearth_choir', name: 'Hearth Choir', school: 'ember', weight: 1, tier: 'weird', rarity: 'uncommon', types: AB,
    boon: 'Apply 1 Burn to all enemies per 2 Ember or Rust grafts in your deck (min 1, max 5).', price: '25% chance to jam. Lose 1 HP when played.',
    mods: [{ k: 'jam', p: 0.25 }, { k: 'selfHurt', n: 1 }, hook((A) => { const n = Math.min(5, Math.max(1, Math.floor(stack(A, 'ember', 'rust') / 2))); for (const e of A.alive()) A.status(e, 'burn', n); })] }),

  // ================= ECHO =================
  G({ id: 'g_reverb', name: 'Reverb', school: 'echo', weight: 1, tier: 'safe', rarity: 'common', types: AB, ok: (s) => !s.flags.retain && !s.flags.ethereal,
    boon: 'Draw 1. Draw 1 more if your deck has 3 or more Echo grafts.', price: 'Ethereal.',
    mods: [{ k: 'flag', f: 'ethereal' }, hook((A, ctx) => { if (!ctx.replay) A.draw(stack(A, 'echo') >= 3 ? 2 : 1); })] }),
  G({ id: 'g_chorus_line', name: 'Chorus Line', school: 'echo', weight: 2, tier: 'greedy', rarity: 'uncommon', types: AB, ok: (s) => num(s) && s.cost <= 2 && dmgOrBlock(s) && !s.fx.some((o) => o.op === 'draw' || o.op === 'energy'),
    boon: 'Plays twice. Plays a third time if your deck has 4 or more Echo grafts.', price: 'Costs 1 more. Shuffle 1 Ringing into your deck each combat.',
    mods: [{ k: 'repeat', n: 1 }, { k: 'cost', d: 1 }, { k: 'junk', card: 'j_ringing', n: 1, to: 'draw' }, hook((A, ctx) => { if (!ctx.replay && stack(A, 'echo') >= 4) again(A, ctx, 1); })] }),
  G({ id: 'g_afterimage', name: 'Afterimage', school: 'echo', weight: 1, tier: 'weird', rarity: 'common', types: AB, ok: dmgOrBlock,
    boon: 'If it is your third or later card this turn, gain 1 Echo.', price: 'Numbers 25% lower.',
    mods: [{ k: 'pct', pct: -25 }, hook((A, ctx) => { if (!ctx.replay && A.c.playsTurn >= 3) A.status(A.player, 'echo', 1); })] }),
  G({ id: 'g_resonant_rib', name: 'Resonant Rib', school: 'echo', weight: 2, tier: 'greedy', rarity: 'rare', types: AB, ok: (s) => !s.flags.exhaust,
    boon: 'Gain 1 Echo, plus 1 more if your deck has 4 or more Echo grafts.', price: 'Exhaust. 25% chance to jam.',
    mods: [{ k: 'flag', f: 'exhaust' }, { k: 'jam', p: 0.25 }, hook((A, ctx) => { if (!ctx.replay) A.status(A.player, 'echo', stack(A, 'echo') >= 4 ? 2 : 1); })] }),

  // ================= HOARD =================
  G({ id: 'g_stockpile', name: 'Stockpile', school: 'hoard', weight: 1, tier: 'safe', rarity: 'common', types: AB,
    boon: 'Gain 2 Block per Hoard graft in your deck (max 10).', price: 'Draw 1 fewer card next turn.',
    mods: [{ k: 'drawdown', n: 1 }, hook((A, ctx) => { const n = Math.min(10, 2 * stack(A, 'hoard')); if (n) A.block(A.player, Math.max(1, Math.round(n * (ctx.mult || 1)))); })] }),
  G({ id: 'g_long_hold', name: 'Long Hold', school: 'hoard', weight: 1, tier: 'weird', rarity: 'uncommon', types: AB, ok: (s) => dmgOrBlock(s) && num(s) && !s.flags.ethereal,
    boon: 'Retain. Each turn it starts in your hand, its numbers grow by 3 this combat (max 18).', price: 'Costs 1 more.',
    mods: [{ k: 'flag', f: 'retain' }, { k: 'cost', d: 1 }, { k: 'custom', hooks: {
      onTurnStart(A, { card }) { card.holdB = Math.min(18, (card.holdB || 0) + 3); },
      onPlay(A, ctx) { boost(A, ctx, ctx.card.holdB || 0); },
    } }] }),
  G({ id: 'g_miser_ledger', name: 'Miser Ledger', school: 'hoard', weight: 1, tier: 'safe', rarity: 'uncommon', types: AB, ok: (s) => dmgOrBlock(s) && num(s) && s.cost <= 2,
    boon: 'Deals or blocks 1 more per 8 gold you hold (max 10).', price: 'Costs 1 more.',
    mods: [{ k: 'cost', d: 1 }, hook((A, ctx) => boost(A, ctx, Math.min(10, Math.floor((A.c.run.gold || 0) / 8))))] }),
  G({ id: 'g_hoard_cache', name: 'Hoard Cache', school: 'hoard', weight: 3, tier: 'greedy', rarity: 'rare', types: AB, ok: (s) => dmgOrBlock(s) && num(s) && !s.flags.ethereal,
    boon: 'Retain. +3 numbers per Hoard or Gilded graft in your deck (max 18).', price: 'Costs 1 more. Lose 4 max HP when grafted.',
    mods: [{ k: 'flag', f: 'retain' }, { k: 'cost', d: 1 }, { k: 'maxHp', n: -4 }, hook((A, ctx) => boost(A, ctx, Math.min(18, 3 * stack(A, 'hoard', 'gilded'))))] }),

  // ================= BLOOD =================
  G({ id: 'g_kin_blood', name: 'Kin Blood', school: 'blood', weight: 1, tier: 'safe', rarity: 'common', types: AB,
    boon: 'Heal 1 per Blood graft in your deck (max 5).', price: 'Lose 3 HP when played.',
    mods: [{ k: 'selfHurt', n: 3 }, hook((A, ctx) => { const n = Math.min(5, stack(A, 'blood')); if (n && !ctx.replay) A.heal(A.player, n); })] }),
  G({ id: 'g_red_tide', name: 'Red Tide', school: 'blood', weight: 2, tier: 'greedy', rarity: 'uncommon', types: ATK, ok: hits,
    boon: '+3 damage per Blood or Ember graft in your deck (max 18).', price: 'Lose 4 HP when played. 25% chance to jam.',
    mods: [{ k: 'selfHurt', n: 4 }, { k: 'jam', p: 0.25 }, hook((A, ctx) => boost(A, ctx, Math.min(18, 3 * stack(A, 'blood', 'ember'))))] }),
  G({ id: 'g_feverish_vein', name: 'Feverish Vein', school: 'blood', weight: 2, tier: 'weird', rarity: 'rare', types: ATK, ok: hits,
    boon: '+3 damage per point of Strain (max 21).', price: 'Lose HP when played equal to your Strain (min 2, max 6).',
    mods: [{ k: 'selfHurt', n: 1 }, hook((A, ctx) => {
      const s = strainOf(A);
      boost(A, ctx, Math.min(21, 3 * s));
      if (!ctx.replay) A.loseHp(A.player, Math.max(1, Math.min(5, s - 1)), { floor1: true, src: 'graft' });
    })] }),
  G({ id: 'g_tithe_leech', name: 'Tithe Leech', school: 'blood', weight: 1, tier: 'weird', rarity: 'uncommon', types: ATK, ok: hits,
    boon: 'After the hit, heal 2 per Tithed card in your deck (max 8).', price: 'Lose 2 HP when played.',
    mods: [{ k: 'selfHurt', n: 2 }, hook((A, ctx) => { const n = Math.min(8, 2 * tithedOf(A)); if (n && !ctx.replay) A.heal(A.player, n); })] }),

  // ================= RUST =================
  G({ id: 'g_rust_bloom', name: 'Rust Bloom', school: 'rust', weight: 1, tier: 'safe', rarity: 'common', types: AB,
    boon: 'Gain 1 Thorns per Rust graft in your deck (max 3).', price: 'Gain 1 Frail when played.',
    mods: [{ k: 'selfStatus', s: 'frail', n: 1 }, hook((A, ctx) => { const n = Math.min(3, stack(A, 'rust')); if (n && !ctx.replay) A.status(A.player, 'thorns', n); })] }),
  G({ id: 'g_slag_vent', name: 'Slag Vent', school: 'rust', weight: 2, tier: 'greedy', rarity: 'uncommon', types: AB, ok: (s) => !s.flags.exhaust,
    boon: 'Deal 4 damage to all enemies per junk card in your hand (max 20).', price: 'Exhaust. Shuffle 2 Rust Flakes into your deck each combat.',
    mods: [{ k: 'flag', f: 'exhaust' }, { k: 'junk', card: 'j_flake', n: 2, to: 'draw' }, hook((A, ctx) => {
      const n = Math.min(20, 4 * junkIn(A).length);
      if (n) for (const e of A.alive()) A.dmg(A.player, e, Math.max(1, Math.round(n * (ctx.mult || 1))), { card: true });
    })] }),
  G({ id: 'g_scrapheap_mind', name: 'Scrapheap Mind', school: 'rust', weight: 1, tier: 'weird', rarity: 'uncommon', types: AB,
    boon: 'Exhaust every junk card in your hand and draw 1 for each (max 3).', price: 'Costs 1 more.',
    mods: [{ k: 'cost', d: 1 }, hook((A, ctx) => {
      if (ctx.replay) return;
      const c = A.c; const junk = junkIn(A);
      for (const k of junk) { const i = c.hand.indexOf(k); if (i < 0) continue; c.hand.splice(i, 1); c.exhaust.push(k); k.jam = false; k.costMod = 0; c.ev.push({ t: 'exhaust', card: k.uid }); }
      if (junk.length) A.draw(Math.min(3, junk.length));
    })] }),
  G({ id: 'g_corroded_lattice', name: 'Corroded Lattice', school: 'rust', weight: 3, tier: 'greedy', rarity: 'rare', types: AB, ok: (s) => dmgOrBlock(s) && num(s),
    boon: '+5 numbers per Rust graft in your deck (max 25).', price: 'Costs 1 more. Shuffle 1 Clot into your deck each combat.',
    mods: [{ k: 'cost', d: 1 }, { k: 'junk', card: 'j_clot', n: 1, to: 'draw' }, hook((A, ctx) => boost(A, ctx, Math.min(25, 5 * stack(A, 'rust'))))] }),

  // ================= STATIC =================
  G({ id: 'g_phase_lock', name: 'Phase Lock', school: 'static', weight: 1, tier: 'safe', rarity: 'common', types: AB,
    boon: 'Gain 1 Charge per 2 Static grafts in your deck (min 1, max 4).', price: 'Lose 1 HP when played.',
    mods: [{ k: 'selfHurt', n: 1 }, hook((A, ctx) => { if (!ctx.replay) A.status(A.player, 'charge', Math.min(4, Math.max(1, Math.floor(stack(A, 'static') / 2)))); })] }),
  G({ id: 'g_tesla_coil', name: 'Tesla Coil', school: 'static', weight: 3, tier: 'greedy', rarity: 'rare', types: ATK, ok: (s) => hits(s) && num(s) && s.cost <= 2,
    boon: 'Deal 3 damage to all enemies per Static or Echo graft in your deck (max 18).', price: 'Costs 1 more. 15% chance to jam.',
    mods: [{ k: 'cost', d: 1 }, { k: 'jam', p: 0.15 }, hook((A, ctx) => {
      const n = Math.min(18, 3 * stack(A, 'static', 'echo'));
      if (n) for (const e of A.alive()) A.dmg(A.player, e, Math.max(1, Math.round(n * (ctx.mult || 1))), { card: true });
    })] }),
  G({ id: 'g_short_circuit', name: 'Short Circuit', school: 'static', weight: 2, tier: 'weird', rarity: 'rare', types: AB,
    boon: 'Every jammed card in your hand is un-jammed and deals 6 damage to a random enemy.', price: '25% chance to jam. Lose 3 HP when played.',
    mods: [{ k: 'jam', p: 0.25 }, { k: 'selfHurt', n: 3 }, hook((A, ctx) => {
      if (ctx.replay) return;
      for (const k of A.c.hand) {
        if (!k.jam) continue;
        const live = A.alive(); if (!live.length) break;
        k.jam = false;
        A.dmg(A.player, A.rng.pick(live), Math.max(1, Math.round(6 * (ctx.mult || 1))), { card: true });
      }
    })] }),
  G({ id: 'g_load_spike', name: 'Load Spike', school: 'static', weight: 1, tier: 'weird', rarity: 'common', types: AB,
    boon: 'If you have 4 or more Charge, gain 1 Energy.', price: 'Lose 3 HP when played.',
    mods: [{ k: 'selfHurt', n: 3 }, hook((A, ctx) => { if (!ctx.replay && (A.player.st.charge || 0) >= 4) A.energy(1); })] }),

  // ================= GILDED =================
  G({ id: 'g_gold_standard', name: 'Gold Standard', school: 'gilded', weight: 1, tier: 'safe', rarity: 'common', types: AB, ok: dmgOrBlock,
    boon: '+2 numbers per Gilded graft in your deck (max 10).', price: 'Costs 2 gold each play.',
    mods: [{ k: 'goldCost', n: 2 }, hook((A, ctx) => boost(A, ctx, Math.min(10, 2 * stack(A, 'gilded'))))] }),
  G({ id: 'g_collectors_due', name: "Collector's Due", school: 'gilded', weight: 1, tier: 'weird', rarity: 'uncommon', types: ALL,
    boon: 'Gain 3 gold per Tithed card in your deck (max 15).', price: 'Lose 2 HP when played.',
    mods: [{ k: 'selfHurt', n: 2 }, hook((A, ctx) => { const n = Math.min(15, 3 * tithedOf(A)); if (n && !ctx.replay) A.gold(n); })] }),
  G({ id: 'g_overdraft', name: 'Overdraft', school: 'gilded', weight: 2, tier: 'weird', rarity: 'rare', types: AB, ok: (s) => !s.flags.exhaust,
    boon: 'Gain 5 gold and 3 Block per point of Strain (max 5 Strain).', price: 'Exhaust. Lose 3 HP when played.',
    mods: [{ k: 'flag', f: 'exhaust' }, { k: 'selfHurt', n: 3 }, hook((A, ctx) => {
      const s = Math.min(5, strainOf(A)); if (!s) return;
      if (!ctx.replay) A.gold(5 * s);
      A.block(A.player, Math.max(1, Math.round(3 * s * (ctx.mult || 1))));
    })] }),
  G({ id: 'g_gilded_cage', name: 'Gilded Cage', school: 'gilded', weight: 2, tier: 'greedy', rarity: 'uncommon', types: ['skill'], ok: (s) => !s.flags.exhaust,
    boon: 'Gain Plated equal to half your Gilded grafts, rounded up (min 1, max 4).', price: 'Exhaust. Costs 8 gold each play.',
    mods: [{ k: 'flag', f: 'exhaust' }, { k: 'goldCost', n: 8 }, hook((A) => { A.status(A.player, 'plated', Math.min(4, Math.max(1, Math.ceil(stack(A, 'gilded') / 2)))); })] }),
];

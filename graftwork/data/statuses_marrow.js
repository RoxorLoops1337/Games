// Extra statuses owned by Marrow's cards (same schema as statuses.js).
// Combat state reads used: A.c.hand, A.c.enemies, A.c.damageTakenThisCombat.
const isJunk = (k) => String(k.inst.id).startsWith('j_');

export const STATUS_MARROW = [
  // Heal when a card costs you HP (own card cost or graft price) or when you take a hit.
  { id: 'scar', name: 'Scar Tissue', good: true, stack: 'int', desc: (n) => `After you play a card that cost you HP, heal ${n}.`,
    hooks: {
      cardPlayed: (A, o, n) => {
        const c = A.c; const taken = c.damageTakenThisCombat || 0;
        const seen = c._mScar === undefined ? taken : c._mScar;
        c._mScar = taken;
        if (taken > seen) A.heal(o, n);
      },
      damaged: (A) => { A.c._mScar = A.c.damageTakenThisCombat || 0; },
      turnStart: (A) => { A.c._mScar = A.c.damageTakenThisCombat || 0; },
    } },
  // Junk in hand becomes armour at turn end.
  { id: 'rustplate', name: 'Rust Plating', good: true, stack: 'int', desc: (n) => `At turn end, gain ${n} Block for each junk card in your hand.`,
    hooks: { turnEnd: (A, o, n) => { const j = A.c.hand.filter(isJunk).length; if (j) A.block(o, n * j); } } },
  // Attacks make enemies bleed.
  { id: 'anticoag', name: 'Anticoagulant', good: true, stack: 'int', desc: (n) => `Whenever you play an Attack, apply ${n} Bleed to its target (all enemies if it hits all).`,
    hooks: { cardPlayed: (A, o, n, p) => {
      if (p.spec.type !== 'attack') return;
      const live = A.c.enemies.filter((e) => !e.dead);
      const tg = p.spec.target === 'all' ? live : (p.target && !p.target.dead ? [p.target] : []);
      for (const t of tg) A.status(t, 'bleed', n);
    } } },
  // Pay HP each turn for Strength.
  { id: 'bloodrite', name: 'Blood Rite', good: true, stack: 'int', desc: (n) => `At turn start, lose ${n} HP (never fatal) and gain ${n} Strength.`,
    hooks: { turnStart: (A, o, n) => { A.loseHp(o, n, { floor1: true, src: 'card' }); A.status(o, 'strength', n); } } },
  // Every seam in the deck is armour at turn end.
  { id: 'stitchwork', name: 'Patchwork Doctrine', good: true, stack: 'int', desc: (n) => `At turn end, gain ${n} Block per graft in your deck (max ${12 * n}).`,
    hooks: { turnEnd: (A, o, n) => { const g = A.c.run.deck.reduce((a, i) => a + i.grafts.length, 0); if (g) A.block(o, Math.min(12 * n, g * n)); } } },
];

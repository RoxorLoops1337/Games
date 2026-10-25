// Extra statuses owned by one content author (same schema as statuses.js).
// Wick: Ember + Static. All of these sit on the player.
const live = (A) => A.c.enemies.filter((e) => !e.dead);

export const STATUS_WICK = [
  // When an enemy dies, its Burn jumps to every other living enemy (x1 at 1 stack, x1.5 at 2, ...).
  { id: 'wildfire', name: 'Wildfire', good: true, stack: 'int', desc: (n) => `When an enemy dies, its Burn spreads to all other enemies${n > 1 ? ` (x${1 + (n - 1) * 0.5})` : ''}.`,
    hooks: { kill: (A, o, n, p) => { const b = p.enemy && p.enemy.st && p.enemy.st.burn; if (!b) return; const amt = Math.ceil(b * (0.5 + 0.5 * n)); for (const e of live(A)) A.status(e, 'burn', amt); } } },
  // At turn end, apply n Burn to every enemy.
  { id: 'smolder', name: 'Smolder', good: true, stack: 'int', desc: (n) => `At turn end, apply ${n} Burn to all enemies.`,
    hooks: { turnEnd: (A, o, n) => { for (const e of live(A)) A.status(e, 'burn', n); } } },
  // At turn end, gain n Block per burning enemy (it holds through the enemy turn).
  { id: 'waxarmor', name: 'Wax Armor', good: true, stack: 'int', desc: (n) => `At turn end, gain ${n} Block per burning enemy.`,
    hooks: { turnEnd: (A, o, n) => { const k = live(A).filter((e) => (e.st.burn || 0) > 0).length; if (k) A.block(o, n * k); } } },
  // At turn start, gain n Charge.
  { id: 'dynamo', name: 'Dynamo', good: true, stack: 'int', desc: (n) => `At turn start, gain ${n} Charge.`,
    hooks: { turnStart: (A, o, n) => A.status(o, 'charge', n) } },
  // Short fuse: at turn end lose 2n HP (never lethal) and apply 4n Burn to all enemies.
  { id: 'powderkeg', name: 'Powder Keg', good: true, stack: 'int', desc: (n) => `At turn end, lose ${2 * n} HP and apply ${4 * n} Burn to all enemies.`,
    hooks: { turnEnd: (A, o, n) => { A.loseHp(o, 2 * n, { floor1: true, src: 'status' }); for (const e of live(A)) A.status(e, 'burn', 4 * n); } } },
];

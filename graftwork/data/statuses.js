// Statuses. Owner = player or enemy. Hooks get (A, owner, n, payload); A is the combat API (engine/combat.js makeApi).
//  stack: 'int' (intensity, adds up) | 'dur' (turns, adds up, counts down 1 at the owner's turn end)
//  mod:   outAdd(n) flat damage dealt | outMul damage dealt | inMul damage taken | blockAdd | blockMul
//  hooks: turnStart, turnEnd, attacked(payload {attacker, dmg}), damaged(payload {dmg, src}), cardPlayed(payload {card, spec}), kill
export const STATUS_LIST = [
  { id: 'strength', name: 'Strength', good: true, stack: 'int', canNeg: true, mod: { outAdd: (n) => n }, desc: (n) => `Attacks deal ${n >= 0 ? '+' : ''}${n} damage.` },
  { id: 'dexterity', name: 'Dexterity', good: true, stack: 'int', canNeg: true, mod: { blockAdd: (n) => n }, desc: (n) => `Block gained is ${n >= 0 ? '+' : ''}${n}.` },
  { id: 'weak', name: 'Weak', good: false, stack: 'dur', mod: { outMul: () => 0.75 }, desc: (n) => `Deals 25% less attack damage for ${n} turn${n > 1 ? 's' : ''}.` },
  { id: 'vulnerable', name: 'Vulnerable', good: false, stack: 'dur', mod: { inMul: () => 1.5 }, desc: (n) => `Takes 50% more attack damage for ${n} turn${n > 1 ? 's' : ''}.` },
  { id: 'frail', name: 'Frail', good: false, stack: 'dur', mod: { blockMul: () => 0.75 }, desc: (n) => `Gains 25% less block for ${n} turn${n > 1 ? 's' : ''}.` },
  { id: 'thorns', name: 'Thorns', good: true, stack: 'int', desc: (n) => `Attackers take ${n} damage.`, hooks: { attacked: (A, o, n, p) => { if (p.attacker && p.attacker !== o) A.dmg(o, p.attacker, n, { thorns: true, pierce: true, noMods: true }); } } },
  { id: 'burn', name: 'Burn', good: false, stack: 'int', desc: (n) => `Take ${n} damage at turn start, then Burn halves (rounded up).`,
    hooks: { turnStart: (A, o, n) => { A.dmg(null, o, n, { pierce: true, noMods: true, status: 'burn' }); A.setStatus(o, 'burn', Math.ceil(n / 2) === n ? n - 1 : Math.ceil(n / 2)); } } },
  { id: 'bleed', name: 'Bleed', good: false, stack: 'int', desc: (n) => `Lose ${n} HP at turn start, then Bleed drops by 1.`,
    hooks: { turnStart: (A, o, n) => { A.dmg(null, o, n, { pierce: true, noMods: true, status: 'bleed' }); A.setStatus(o, 'bleed', n - 1); } } },
  { id: 'regen', name: 'Regen', good: true, stack: 'int', desc: (n) => `Heal ${n} at turn start, then Regen drops by 1.`,
    hooks: { turnStart: (A, o, n) => { A.heal(o, n); A.setStatus(o, 'regen', n - 1); } } },
  { id: 'ritual', name: 'Ritual', good: true, stack: 'int', desc: (n) => `Gain ${n} Strength at turn end.`, hooks: { turnEnd: (A, o, n) => A.status(o, 'strength', n) } },
  { id: 'plated', name: 'Plated', good: true, stack: 'int', desc: (n) => `Gain ${n} Block at turn end.`, hooks: { turnEnd: (A, o, n) => A.block(o, n) } },
  { id: 'barricade', name: 'Barricade', good: true, stack: 'int', desc: () => 'Block is not removed at turn start.' },
  { id: 'intangible', name: 'Intangible', good: true, stack: 'dur', mod: { inCap: () => 1 }, desc: (n) => `Damage taken is reduced to 1 for ${n} turn${n > 1 ? 's' : ''}.` },
  { id: 'echo', name: 'Echo', good: true, stack: 'int', desc: (n) => `Your next ${n} card${n > 1 ? 's are' : ' is'} played twice.`, hooks: {} },
  { id: 'drawdown', name: 'Slow Hands', good: false, stack: 'int', desc: (n) => `Draw ${n} fewer card${n > 1 ? 's' : ''} next turn.` },
  { id: 'costup', name: 'Heavy Hands', good: false, stack: 'int', desc: (n) => `Cards cost ${n} more this turn.`, hooks: { turnEnd: (A, o) => A.setStatus(o, 'costup', 0) } },
  { id: 'emberaura', name: 'Ember Aura', good: true, stack: 'int', desc: (n) => `Whenever you play an Attack, apply ${n} Burn to its target.`,
    hooks: { cardPlayed: (A, o, n, p) => { if (p.spec.type === 'attack' && p.target) A.status(p.target, 'burn', n); } } },
  { id: 'charge', name: 'Charge', good: true, stack: 'int', desc: (n) => `${n} Charge stored. Static cards spend it.` },
  { id: 'gilt', name: 'Gilt', good: true, stack: 'int', desc: (n) => `Gain ${n} gold at the end of combat.` },
  { id: 'marked', name: 'Marked', good: false, stack: 'dur', desc: (n) => `Marked by the Usher for ${n} turn${n > 1 ? 's' : ''}: takes 25% more damage.`, mod: { inMul: () => 1.25 } },
  { id: 'stun', name: 'Stunned', good: false, stack: 'dur', desc: () => 'Skips its next action.' },
];

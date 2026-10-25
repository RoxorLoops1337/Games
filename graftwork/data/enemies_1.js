// Enemies. { id, name, act, kind 'normal'|'elite'|'boss', hp: n | [min,max], moves: { id: { name?, fx: [ops], hidden? } }, pattern: [moveIds] | pick(A,e),
//            opening?: [moveIds], start?: {status: n}, minion?, immune?: [status], on: { combatStart, turnStart, damaged, death, playerCard, afterMove, modDamage }, art: {...} }
// Enemy ops default to hitting the player: dmg {n}, status {s,n,to:'player'|'self'|'allies'}, block {n} (to self), addCard {card,n,to}, summon {id}.
export const ENEMIES_1 = [
  { id: 'bedpan_slime', name: 'Bedpan Slime', act: 1, kind: 'normal', hp: [24, 28], pattern: ['slap', 'slap', 'goo'], moves: { slap: { fx: [{ op: 'dmg', n: 7 }] }, goo: { fx: [{ op: 'status', s: 'weak', n: 1, to: 'player' }, { op: 'block', n: 5, to: 'self' }] } }, art: { body: 'dome', color: '#8fbf6a' } },
  { id: 'orderly', name: 'Orderly', act: 1, kind: 'normal', hp: [34, 38], pattern: ['clipboard', 'shove', 'shove'], moves: { clipboard: { fx: [{ op: 'addCard', card: 'j_paperwork', n: 1, to: 'discard' }, { op: 'block', n: 6, to: 'self' }] }, shove: { fx: [{ op: 'dmg', n: 9 }] } }, art: { body: 'tall', color: '#9fb8c9' } },
];

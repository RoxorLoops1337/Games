import { Noun, NounId } from '../types';

export const NOUNS: Record<NounId, Noun> = {
  // Permanent nouns are always available and never leave the player's bar.
  SELF:  { kind: 'noun', id: 'SELF',  nounKind: 'permanent', addressable: true,
    autoTarget: 'self',             desc: 'The player.' },
  ENEMY: { kind: 'noun', id: 'ENEMY', nounKind: 'permanent', addressable: true,
    autoTarget: 'nearest_hostile',  desc: 'The nearest hostile target.' },
  ROOM:  { kind: 'noun', id: 'ROOM',  nounKind: 'permanent', addressable: true,
    autoTarget: 'current_room',     desc: 'The current scene or space.' },
  IT:    { kind: 'noun', id: 'IT',    nounKind: 'permanent', addressable: true,
    autoTarget: 'last_used',        desc: 'The last noun used in the previous sentence.' },

  GOBLIN:   { kind: 'noun', id: 'GOBLIN',   nounKind: 'enemy',  addressable: true,
    desc: 'A small green hostile. Multiplies if not killed quickly.' },
  WOLF:     { kind: 'noun', id: 'WOLF',     nounKind: 'enemy',  addressable: true,
    desc: 'Fast canid. Acts first; vulnerable to SLOW.' },
  MUSHROOM: { kind: 'noun', id: 'MUSHROOM', nounKind: 'enemy',  addressable: true,
    desc: 'Releases SPORE each turn.' },
  TREE:     { kind: 'noun', id: 'TREE',     nounKind: 'enemy',  addressable: true,
    desc: 'Cannot move. Drops WOOD when felled.' },
  THORN:    { kind: 'noun', id: 'THORN',    nounKind: 'enemy',  addressable: true,
    desc: 'Reflects 50% of HIT damage. Vulnerable to BURN and BREAK.' },
  WOOD:     { kind: 'noun', id: 'WOOD',     nounKind: 'item',   addressable: true,
    desc: 'A length of wood. Useful at merchants and as a GRAB target.' },

  // Multi-word collected nouns; tracked as drop records but the parser can't
  // reference them yet (no multi-word noun support in v1).
  BIG_GOBLIN:   { kind: 'noun', id: 'BIG_GOBLIN',   nounKind: 'enemy', addressable: false,
    desc: 'Elite goblin. Starts BIG; a shaman re-applies BIG every turn.' },
  GREEN_KNIGHT: { kind: 'noun', id: 'GREEN_KNIGHT', nounKind: 'enemy', addressable: false,
    desc: 'Act 1 boss. Only takes damage from announced attacks.' },
  GOBLIN_SHAMAN: { kind: 'noun', id: 'GOBLIN_SHAMAN', nounKind: 'enemy', addressable: true,
    desc: 'A small green caster. Re-applies BIG to its partner every turn.' },
};

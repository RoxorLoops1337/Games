import { Verb, VerbId } from '../types';

// v1 verb pool. Costs follow the starter-deck values from the design doc where
// they differ from the generic section-3 table (WALK/LOOK are 0 in starter).
export const VERBS: Record<VerbId, Verb> = {
  HIT:    { kind: 'verb', id: 'HIT',    cost: 1, rarity: 'common',   target: 'noun',
    desc: "Deal damage equal to the player's attack stat." },
  WALK:   { kind: 'verb', id: 'WALK',   cost: 0, rarity: 'common',   target: 'noun',
    desc: 'Reposition toward a noun. Enables some positional verbs.' },
  LOOK:   { kind: 'verb', id: 'LOOK',   cost: 0, rarity: 'common',   target: 'noun_or_adj',
    desc: "Reveal a noun. LOOK <adjective> applies that adjective to yourself for one turn." },
  GRAB:   { kind: 'verb', id: 'GRAB',   cost: 1, rarity: 'common',   target: 'noun',
    desc: 'Pick up a noun, adding it to hand for this combat.' },
  MAKE:   { kind: 'verb', id: 'MAKE',   cost: 2, rarity: 'common',   target: 'noun_adj',
    desc: 'Apply an adjective from hand to a target noun.' },
  WAIT:   { kind: 'verb', id: 'WAIT',   cost: 0, rarity: 'common',   target: 'none',
    desc: 'Skip turn; recover 1 energy and draw 1 extra card next turn.' },
  PUSH:   { kind: 'verb', id: 'PUSH',   cost: 2, rarity: 'common',   target: 'noun',
    desc: 'Move a target. Deals damage if pushed into a wall or another enemy.' },
  BURN:   { kind: 'verb', id: 'BURN',   cost: 2, rarity: 'common',   target: 'noun',
    desc: 'Deal fire damage and apply BURNING.' },
  BLOCK:  { kind: 'verb', id: 'BLOCK',  cost: 1, rarity: 'common',   target: 'none',
    desc: 'Reduce incoming damage next turn.' },
  BREAK:  { kind: 'verb', id: 'BREAK',  cost: 2, rarity: 'uncommon', target: 'noun',
    desc: 'High damage to objects; breaks shields and barriers.' },
  FREEZE: { kind: 'verb', id: 'FREEZE', cost: 2, rarity: 'uncommon', target: 'noun',
    desc: 'Apply FROZEN to the target (skips next turn).' },
  HEAL:   { kind: 'verb', id: 'HEAL',   cost: 2, rarity: 'uncommon', target: 'noun',
    desc: 'Restore HP to a target.' },
  THROW:  { kind: 'verb', id: 'THROW',  cost: 1, rarity: 'common',   target: 'noun_at_noun',
    desc: 'Throw a held noun at a target. Consumes the projectile from inventory.' },
};

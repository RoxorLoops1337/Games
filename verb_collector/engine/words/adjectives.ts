import { Adjective, AdjectiveId } from '../types';

export const ADJECTIVES: Record<AdjectiveId, Adjective> = {
  BIG:     { kind: 'adjective', id: 'BIG',     category: 'size',  timer: 'permanent', opposite: 'SMALL',
    desc: '+50% HP, +25% damage dealt, +25% damage taken.' },
  SMALL:   { kind: 'adjective', id: 'SMALL',   category: 'size',  timer: 'permanent', opposite: 'BIG',
    desc: '-25% HP, -25% damage dealt, harder to hit.' },
  WEAK:    { kind: 'adjective', id: 'WEAK',    category: 'state', timer: 'permanent', opposite: 'STRONG',
    desc: '-50% damage dealt.' },
  STRONG:  { kind: 'adjective', id: 'STRONG',  category: 'state', timer: 'permanent', opposite: 'WEAK',
    desc: '+50% damage dealt and -25% damage taken.' },
  FAST:    { kind: 'adjective', id: 'FAST',    category: 'state', timer: 'permanent', opposite: 'SLOW',
    desc: 'Acts first in turn order.' },
  SLOW:    { kind: 'adjective', id: 'SLOW',    category: 'state', timer: 'permanent', opposite: 'FAST',
    desc: 'Acts last in turn order.' },
  BURNING: { kind: 'adjective', id: 'BURNING', category: 'element', timer: 3,
    desc: 'Takes damage at end of turn for 3 turns.' },
  // FROZEN technically lasts "until damage breaks it"; combat logic enforces
  // the break, so the timer here is permanent.
  FROZEN:  { kind: 'adjective', id: 'FROZEN',  category: 'element', timer: 'permanent',
    desc: 'Skips turn. Breaks on damage.' },
};

// v1 interactions are pure cancellations. Combinations that produce new states
// (BIG+BIG=HUGE, BURNING+WET=STEAMING, etc.) need adjectives that aren't in
// the v1 pool, so they're deferred until those adjectives ship.
export type InteractionResult = 'cancel' | AdjectiveId;

export interface AdjectiveInteraction {
  a: AdjectiveId;
  b: AdjectiveId;
  result: InteractionResult;
}

export const ADJECTIVE_INTERACTIONS: ReadonlyArray<AdjectiveInteraction> = [
  { a: 'BIG',    b: 'SMALL',  result: 'cancel' },
  { a: 'FAST',   b: 'SLOW',   result: 'cancel' },
  { a: 'STRONG', b: 'WEAK',   result: 'cancel' },
];

// Lookup helper that matches an interaction regardless of argument order.
export function findInteraction(a: AdjectiveId, b: AdjectiveId): InteractionResult | null {
  for (const i of ADJECTIVE_INTERACTIONS) {
    if ((i.a === a && i.b === b) || (i.a === b && i.b === a)) return i.result;
  }
  return null;
}

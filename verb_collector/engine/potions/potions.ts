// Potion registry. Each potion is a pre-baked sentence cast for free — costs
// no energy, doesn't consume hand cards, can be triggered in any combat phase.
//
// Owning agent: potions-system. Other code paths read POTIONS for UI labels
// and call castPotion() from the reducer when the player drinks one.

import { GameState } from '../combat/state';
import { Effect } from '../combat/effects';

export type PotionId =
  | 'BURN_ALL'
  | 'FORGET_PAIN'
  | 'REMEMBER_EVERYTHING'
  | 'MAKE_SELF_INVISIBLE';

export interface PotionDef {
  id: PotionId;
  // Player-facing label, e.g. 'Vial of "BURN ALL"'.
  label: string;
  // The encoded sentence shown in the tooltip.
  sentence: string;
  // What the potion does when drunk. Returns side-effects the reducer applies.
  cast: (state: GameState) => Effect[];
}

// Populated by potions-system agent.
export const POTIONS: Partial<Record<PotionId, PotionDef>> = {};

export function potionLabel(id: PotionId): string {
  return POTIONS[id]?.label ?? `Vial of "${id}"`;
}

export function potionSentence(id: PotionId): string {
  return POTIONS[id]?.sentence ?? id;
}

// Convenience: pool of v1 potions to draw from at shops / drops.
export const V1_POTION_IDS: PotionId[] = [
  'BURN_ALL',
  'FORGET_PAIN',
  'REMEMBER_EVERYTHING',
  'MAKE_SELF_INVISIBLE',
];

export const POTION_SLOT_COUNT = 3;

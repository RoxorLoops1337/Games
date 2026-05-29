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
export const POTIONS: Partial<Record<PotionId, PotionDef>> = {
  BURN_ALL: {
    id: 'BURN_ALL',
    label: 'Vial of "BURN ALL"',
    sentence: 'BURN ALL',
    cast: (state: GameState): Effect[] => {
      const effects: Effect[] = [{ kind: 'log', text: 'The vial ignites — every foe blazes.' }];
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0) continue;
        effects.push({
          kind: 'damage',
          target: { kind: 'enemy', id: enemy.id },
          amount: 4,
        });
        effects.push({
          kind: 'add_adjective',
          target: { kind: 'enemy', id: enemy.id },
          adjective: 'BURNING',
          turns: 3,
        });
      }
      return effects;
    },
  },
  FORGET_PAIN: {
    id: 'FORGET_PAIN',
    label: 'Vial of "FORGET PAIN"',
    sentence: 'FORGET PAIN',
    cast: (state: GameState): Effect[] => {
      const missing = state.player.maxHp - state.player.hp;
      return [
        { kind: 'log', text: 'You FORGET PAIN — the wound was only a memory.' },
        { kind: 'heal', target: { kind: 'self' }, amount: missing },
      ];
    },
  },
  REMEMBER_EVERYTHING: {
    id: 'REMEMBER_EVERYTHING',
    label: 'Vial of "REMEMBER EVERYTHING"',
    sentence: 'REMEMBER EVERYTHING',
    cast: (_state: GameState): Effect[] => [
      { kind: 'reshuffle_discard' },
    ],
  },
  MAKE_SELF_INVISIBLE: {
    id: 'MAKE_SELF_INVISIBLE',
    label: 'Vial of "MAKE SELF INVISIBLE"',
    sentence: 'MAKE SELF INVISIBLE',
    cast: (state: GameState): Effect[] => {
      const effects: Effect[] = [
        { kind: 'log', text: 'You vanish from the page — eyes slide off you.' },
      ];
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0) continue;
        effects.push({
          kind: 'compel_skip',
          target: { kind: 'enemy', id: enemy.id },
        });
      }
      return effects;
    },
  },
};

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

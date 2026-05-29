// Relic registry. Each relic has a stable id and a set of hook handlers the
// reducer / resolver can dispatch to. Agents implementing specific relics
// extend `RELICS` and the relevant handler tables.
//
// Owning agent: relics-system. Other code paths read RELICS to look up
// metadata (name, description, rarity) for UI rendering. Do not import this
// file from inside engine/words or engine/parser — relics are a runtime
// modifier, not a vocabulary element.

import { VerbId } from '../types';
import { Card, GameState } from '../combat/state';
import { Effect } from '../combat/effects';

export type RelicId =
  // Wanderer / common starters
  | 'COMMA' | 'APOSTROPHE' | 'MULLIGAN_STONE' | 'INKWELL'
  // Uncommon
  | 'SEMICOLON' | 'QUESTION_MARK' | 'ASTERISK' | 'FOOTNOTE'
  // Rare
  | 'EXCLAMATION_POINT' | 'ELLIPSIS';

export type RelicRarity = 'common' | 'uncommon' | 'rare';

export interface RelicDef {
  id: RelicId;
  name: string;
  rarity: RelicRarity;
  desc: string;
  // Optional state held on the relic itself (e.g. APOSTROPHE picks a verb
  // at acquisition time). Lives on GameState.relicState[relicId].
  initialState?: () => Record<string, unknown>;
}

// Populated by the relics-system agent. Empty stub so non-relic code can
// import RelicId / RelicDef without depending on that work.
export const RELICS: Partial<Record<RelicId, RelicDef>> = {};

// --- Hook interface --------------------------------------------------------
// Each hook returns either a modified value or a list of side-effect Effects
// the reducer applies. Relics opt into hooks by including their id in the
// relevant table once their RelicDef is registered.

export interface RelicHooks {
  // Mutate the player's per-turn draw count at turn start. Return the new value.
  onDrawCount?: (state: GameState, base: number) => number;
  // Modify outgoing damage from the player's sentence. Return new amount.
  onPlayerOutgoingDamage?: (state: GameState, amount: number) => number;
  // Modify incoming damage to the player. Return new amount.
  onPlayerIncomingDamage?: (state: GameState, amount: number) => number;
  // Allow the relic to inject extra Effects after a successful cast.
  onAfterCast?: (state: GameState, sentence: string[]) => Effect[];
  // Allow the relic to react to combat start.
  onCombatStart?: (state: GameState) => Effect[];
  // Card whose cost the relic permanently reduces (returns new cost, or -1
  // to leave untouched).
  costOverride?: (state: GameState, card: Card) => number;
  // Ink bonus per scene awarded by the relic.
  inkPerScene?: () => number;
}

// Populated by the relics-system agent.
export const RELIC_HOOKS: Partial<Record<RelicId, RelicHooks>> = {};

export function relicHook<K extends keyof RelicHooks>(
  state: GameState,
  key: K,
): Array<NonNullable<RelicHooks[K]>> {
  const out: Array<NonNullable<RelicHooks[K]>> = [];
  for (const r of state.relics) {
    const hooks = RELIC_HOOKS[r];
    if (hooks && hooks[key]) {
      out.push(hooks[key] as NonNullable<RelicHooks[K]>);
    }
  }
  return out;
}

// Used by UI: render a friendly name even before the relic's full def lands.
export function relicName(id: RelicId): string {
  return RELICS[id]?.name ?? id;
}

// Used by reward/shop pools.
export function commonRelicIds(): RelicId[] {
  return Object.values(RELICS)
    .filter((r): r is RelicDef => !!r && r.rarity === 'common')
    .map((r) => r.id);
}
export function uncommonRelicIds(): RelicId[] {
  return Object.values(RELICS)
    .filter((r): r is RelicDef => !!r && r.rarity === 'uncommon')
    .map((r) => r.id);
}

// Referenced by the resolver in a few places; exported here for clarity.
export type VerbCostOverride = Partial<Record<VerbId, number>>;

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

// Verbs APOSTROPHE may pick from at acquisition to grant a permanent -1 cost.
const APOSTROPHE_VERB_POOL: VerbId[] = [
  'HIT', 'GRAB', 'MAKE', 'PUSH', 'BURN', 'BLOCK', 'BREAK', 'FREEZE', 'HEAL',
];

// Populated by the relics-system agent. Empty stub so non-relic code can
// import RelicId / RelicDef without depending on that work.
export const RELICS: Partial<Record<RelicId, RelicDef>> = {
  COMMA: {
    id: 'COMMA',
    name: 'The Comma',
    rarity: 'common',
    desc: 'Draw one extra card each turn.',
  },
  APOSTROPHE: {
    id: 'APOSTROPHE',
    name: "The Apostrophe",
    rarity: 'common',
    desc: 'At pickup, a random verb in your manuscript costs 1 less for the rest of the run.',
    initialState: () => {
      const idx = Math.floor(Math.random() * APOSTROPHE_VERB_POOL.length);
      const picked = APOSTROPHE_VERB_POOL[idx] ?? 'HIT';
      return { verb: picked };
    },
  },
  MULLIGAN_STONE: {
    id: 'MULLIGAN_STONE',
    name: 'The Mulligan Stone',
    rarity: 'common',
    desc: 'Once per combat, discard your hand and draw five new cards. (UI not yet wired.)',
    initialState: () => ({ usesRemaining: 1 }),
  },
  INKWELL: {
    id: 'INKWELL',
    name: 'The Inkwell',
    rarity: 'common',
    desc: 'Gain 1 extra ink at the start of every scene.',
  },
  SEMICOLON: {
    id: 'SEMICOLON',
    name: 'The Semicolon',
    rarity: 'uncommon',
    desc: '+1 max energy in every combat. Write longer sentences.',
  },
  QUESTION_MARK: {
    id: 'QUESTION_MARK',
    name: 'The Question Mark',
    rarity: 'uncommon',
    desc: 'Every enemy starts revealed at the beginning of combat.',
  },
  ASTERISK: {
    id: 'ASTERISK',
    name: 'The Asterisk',
    rarity: 'uncommon',
    desc: 'The first cast of each combat does +1 to its primary damage/heal/block.',
    initialState: () => ({ usedThisCombat: false }),
  },
  FOOTNOTE: {
    id: 'FOOTNOTE',
    name: 'The Footnote',
    rarity: 'uncommon',
    desc: 'Your HIT also deals 1 damage to every other enemy.',
  },
  EXCLAMATION_POINT: {
    id: 'EXCLAMATION_POINT',
    name: 'The Exclamation Point',
    rarity: 'rare',
    desc: 'Your first sentence each combat deals 50% more damage.',
    initialState: () => ({ usedThisCombat: false }),
  },
  ELLIPSIS: {
    id: 'ELLIPSIS',
    name: 'The Ellipsis',
    rarity: 'rare',
    desc: 'After every cast, 25% chance to find 1 ink.',
  },
};

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
  // Permanent bonus to max energy applied at combat start.
  maxEnergyBonus?: (state: GameState) => number;
}

// ---- Helpers used by hook implementations --------------------------------

// Identify the primary numeric effect (damage > heal > gain_block) and bump
// its amount by `bonus`. Returns the effect list with the patch applied (or
// the original list if nothing matched).
function bumpPrimary(effects: Effect[], bonus: number): Effect[] {
  if (bonus === 0 || effects.length === 0) return effects;
  const priority: Array<Effect['kind']> = ['damage', 'heal', 'gain_block'];
  for (const kind of priority) {
    const idx = effects.findIndex((e) => e.kind === kind);
    if (idx < 0) continue;
    const target = effects[idx]!;
    const patched: Effect[] = effects.slice();
    if (target.kind === 'damage') {
      patched[idx] = { ...target, amount: target.amount + bonus };
    } else if (target.kind === 'heal') {
      patched[idx] = { ...target, amount: target.amount + bonus };
    } else if (target.kind === 'gain_block') {
      patched[idx] = { ...target, amount: target.amount + bonus };
    }
    return patched;
  }
  return effects;
}

// Used by ASTERISK's onAfterCast to emit the bonus effect after the fact.
// We mirror the resolver's primary-effect selection but emit a *new* effect
// rather than scaling one already applied. The effect targets the same enemy
// the player's sentence already targeted (if any), otherwise self.
function asteriskBonus(state: GameState): Effect[] {
  const enemy = state.enemies.find((e) => e.hp > 0);
  if (enemy) {
    return [
      { kind: 'damage', target: { kind: 'enemy', id: enemy.id }, amount: 1 },
      { kind: 'log', text: 'The Asterisk underscores your first cast (+1).' },
    ];
  }
  return [
    { kind: 'gain_block', amount: 1 },
    { kind: 'log', text: 'The Asterisk underscores your first cast (+1 block).' },
  ];
}

// FOOTNOTE: if the sentence contains HIT, spread 1 damage to every other live
// enemy. We use the first live enemy as a proxy for "the primary target" of
// the HIT (the resolver picks ENEMY this way), so the bonus hits everyone
// else.
function footnoteSplash(state: GameState, tokens: string[]): Effect[] {
  if (!tokens.includes('HIT')) return [];
  const live = state.enemies.filter((e) => e.hp > 0);
  if (live.length <= 1) return [];
  // Find the primary target: prefer the enemy named in the tokens; otherwise
  // the resolver's default (first live).
  const named = live.find((e) => tokens.includes(e.noun));
  const primary = named ?? live[0]!;
  const out: Effect[] = [];
  for (const e of live) {
    if (e.id === primary.id) continue;
    out.push({ kind: 'damage', target: { kind: 'enemy', id: e.id }, amount: 1 });
  }
  if (out.length > 0) {
    out.push({ kind: 'log', text: 'The Footnote spreads damage to the rest.' });
  }
  return out;
}

// Populated by the relics-system agent.
export const RELIC_HOOKS: Partial<Record<RelicId, RelicHooks>> = {
  COMMA: {
    onDrawCount: (_state, base) => base + 1,
  },

  APOSTROPHE: {
    costOverride: (state, card) => {
      if (card.kind !== 'verb') return -1;
      const rs = state.relicState['APOSTROPHE'];
      const verb = rs && typeof rs['verb'] === 'string' ? (rs['verb'] as VerbId) : null;
      if (verb === null || card.word !== verb) return -1;
      // Read base from the card's existing override, falling back to a
      // sentinel (the resolver still owns the per-verb cost table).
      const base = card.costOverride;
      if (base === undefined) return -1;
      return Math.max(0, base - 1);
    },
    onCombatStart: (state) => {
      const rs = state.relicState['APOSTROPHE'];
      const verb = rs && typeof rs['verb'] === 'string' ? rs['verb'] : null;
      if (!verb) return [];
      return [{ kind: 'log', text: `The Apostrophe shortens ${verb}.` }];
    },
  },

  MULLIGAN_STONE: {
    onCombatStart: (_state) => [
      { kind: 'log', text: 'The Mulligan Stone hums (use not yet wired).' },
    ],
  },

  INKWELL: {
    inkPerScene: () => 1,
  },

  SEMICOLON: {
    maxEnergyBonus: () => 1,
  },

  QUESTION_MARK: {
    onCombatStart: (state) => {
      const out: Effect[] = [];
      for (const e of state.enemies) {
        if (e.hp <= 0) continue;
        out.push({ kind: 'reveal', target: { kind: 'enemy', id: e.id } });
      }
      return out;
    },
  },

  ASTERISK: {
    onCombatStart: (_state) => {
      // Reset usedThisCombat via a log entry; the reducer reads relicState
      // directly so we expose the reset there. The reset itself is handled
      // by the reducer's startCombat call (see relicState reset logic in
      // applyCombatStart on the reducer). Here we just announce.
      return [];
    },
    onAfterCast: (state, _tokens) => {
      const rs = state.relicState['ASTERISK'];
      const used = !!(rs && rs['usedThisCombat']);
      if (used) return [];
      return asteriskBonus(state);
    },
  },

  FOOTNOTE: {
    onAfterCast: (state, tokens) => footnoteSplash(state, tokens),
  },

  EXCLAMATION_POINT: {
    onPlayerOutgoingDamage: (state, amount) => {
      const rs = state.relicState['EXCLAMATION_POINT'];
      const used = !!(rs && rs['usedThisCombat']);
      if (used) return amount;
      return Math.max(1, Math.round(amount * 1.5));
    },
  },

  ELLIPSIS: {
    onAfterCast: (_state, _tokens) => {
      if (Math.random() < 0.25) {
        return [{ kind: 'log', text: 'The Ellipsis trails off… (+1 ink)' }];
      }
      return [];
    },
  },
};

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

// Re-exported so the reducer can use the same helper for its own post-cast
// bonuses (e.g. the FOOTNOTE splash above already emits its effects; this
// helper is used by relics that want to bump an effect-in-flight).
export { bumpPrimary as bumpPrimaryEffect };

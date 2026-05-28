import { Clause, NounId, Sentence, VerbId } from '../types';
import { VERBS } from '../words';
import { Card, GameState } from '../combat/state';
import { Effect, TargetRef, damageMultiplier } from '../combat/effects';

export interface ResolveResult {
  effects: Effect[];
  energyCost: number;
  consumedCardIds: string[];
  newLastNounUsed: NounId | null;
}

export function resolve(sentence: Sentence, state: GameState): ResolveResult {
  const effects: Effect[] = [];
  let energyCost = 0;
  const consumedCardIds: string[] = [];
  let lastNoun: NounId | null = state.lastNounUsed;

  const clauses: Clause[] = [sentence.first];
  if (sentence.conjunction) clauses.push(sentence.conjunction.second);

  for (const clause of clauses) {
    const verbDef = VERBS[clause.verb];
    energyCost += verbDef.cost;

    const usedSoFar = new Set(consumedCardIds);
    const verbCard = state.hand.find(
      (c) => c.kind === 'verb' && c.word === clause.verb && !usedSoFar.has(c.id),
    );
    if (verbCard) consumedCardIds.push(verbCard.id);

    if (clause.trailingAdjective !== undefined) {
      const adjCard = state.hand.find(
        (c) =>
          c.kind === 'adjective' &&
          c.word === clause.trailingAdjective &&
          !usedSoFar.has(c.id),
      );
      if (adjCard) consumedCardIds.push(adjCard.id);
    }

    const target = clause.object ? resolveTarget(clause.object.noun, state, lastNoun) : null;
    if (clause.object) lastNoun = clause.object.noun === 'IT' ? lastNoun : clause.object.noun;

    effects.push(...verbEffects(clause.verb, target, clause, state));
  }

  return { effects, energyCost, consumedCardIds, newLastNounUsed: lastNoun };
}

function resolveTarget(noun: NounId, state: GameState, lastNoun: NounId | null): TargetRef | null {
  if (noun === 'SELF') return { kind: 'self' };
  if (noun === 'ROOM') return { kind: 'room' };
  if (noun === 'ENEMY') {
    const live = state.enemies.find((e) => e.hp > 0);
    return live ? { kind: 'enemy', id: live.id } : null;
  }
  if (noun === 'IT') {
    if (lastNoun === null || lastNoun === 'IT') return null;
    return resolveTarget(lastNoun, state, lastNoun);
  }
  const enemy = state.enemies.find((e) => e.noun === noun && e.hp > 0);
  if (enemy) return { kind: 'enemy', id: enemy.id };
  return null;
}

function verbEffects(
  verb: VerbId,
  target: TargetRef | null,
  clause: Clause,
  state: GameState,
): Effect[] {
  switch (verb) {
    case 'HIT': {
      if (!target) return [{ kind: 'log', text: 'HIT needs a valid target.' }];
      const dealt = damageMultiplier(state.player.adjectives).dealt;
      const amount = Math.round(state.player.attack * dealt);
      const out: Effect[] = [{ kind: 'damage', target, amount }];
      // Thorn reflect: if target is an enemy with reflect_hit trait, reflect
      // half the damage back to the player.
      if (target.kind === 'enemy') {
        const enemy = state.enemies.find((e) => e.id === target.id);
        if (enemy && enemy.traits.includes('reflect_hit')) {
          const reflected = Math.max(1, Math.round(amount * 0.5));
          out.push({ kind: 'log', text: `${enemy.displayName} reflects ${reflected} damage.` });
          out.push({ kind: 'damage', target: { kind: 'self' }, amount: reflected });
        }
      }
      return out;
    }
    case 'BURN': {
      if (!target) return [{ kind: 'log', text: 'BURN needs a valid target.' }];
      const dealt = damageMultiplier(state.player.adjectives).dealt;
      return [
        { kind: 'damage', target, amount: Math.round(3 * dealt) },
        { kind: 'add_adjective', target, adjective: 'BURNING', turns: 3 },
      ];
    }
    case 'BLOCK': return [{ kind: 'gain_block', amount: 5 }];
    case 'HEAL': {
      if (!target) return [{ kind: 'log', text: 'HEAL needs a valid target.' }];
      return [{ kind: 'heal', target, amount: 6 }];
    }
    case 'MAKE': {
      if (!target || clause.trailingAdjective === undefined) {
        return [{ kind: 'log', text: 'MAKE needs a noun and an adjective in hand.' }];
      }
      const has = state.hand.some(
        (c: Card) => c.kind === 'adjective' && c.word === clause.trailingAdjective,
      );
      if (!has) return [{ kind: 'log', text: `No ${clause.trailingAdjective} card in hand.` }];
      return [{ kind: 'add_adjective', target, adjective: clause.trailingAdjective, turns: 'permanent' }];
    }
    case 'WAIT': return [
      { kind: 'queue_next_turn_bonus', energy: 1, draw: 1 },
      { kind: 'log', text: 'You wait.' },
    ];
    case 'LOOK': {
      if (!target) return [{ kind: 'log', text: 'LOOK needs a target.' }];
      return [{ kind: 'reveal', target }];
    }
    case 'FREEZE': {
      if (!target) return [{ kind: 'log', text: 'FREEZE needs a target.' }];
      return [{ kind: 'add_adjective', target, adjective: 'FROZEN', turns: 'permanent' }];
    }
    case 'BREAK': {
      if (!target) return [{ kind: 'log', text: 'BREAK needs a target.' }];
      return [{ kind: 'damage', target, amount: 8 }];
    }
    case 'PUSH': {
      if (!target) return [{ kind: 'log', text: 'PUSH needs a target.' }];
      return [
        { kind: 'damage', target, amount: 1 },
        { kind: 'log', text: 'You push the target.' },
      ];
    }
    case 'WALK': return [{ kind: 'log', text: 'You reposition.' }];
    case 'GRAB': return [{ kind: 'log', text: 'GRAB is not implemented in v0.' }];
  }
}

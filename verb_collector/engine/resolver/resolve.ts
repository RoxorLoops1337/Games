import { Clause, ConnectorId, NounId, Sentence, VerbId } from '../types';
import { VERBS } from '../words';
import { Card, GameState } from '../combat/state';
import { Effect, TargetRef, damageMultiplier } from '../combat/effects';

export interface BonusBreakdown {
  eloquence: number;            // +N from connectors (max 3)
  itChainApplied: boolean;      // true if any second clause used IT
  enemyAmbiguityTax: number;    // +N energy from using ENEMY with multiple alive
}

export interface ResolveResult {
  effects: Effect[];
  energyCost: number;
  consumedCardIds: string[];
  newLastNounUsed: NounId | null;
  bonuses: BonusBreakdown;
}

const ELOQUENCE_CAP = 3;
const IT_CHAIN_MULTIPLIER = 1.5;

export function resolve(sentence: Sentence, state: GameState): ResolveResult {
  const effects: Effect[] = [];
  let baseEnergyCost = 0;
  const consumedCardIds: string[] = [];
  let lastNoun: NounId | null = state.lastNounUsed;

  const clauses: Clause[] = [sentence.first];
  if (sentence.conjunction) clauses.push(sentence.conjunction.second);

  const aliveCount = state.enemies.filter((e) => e.hp > 0).length;
  let enemyAmbiguityTax = 0;
  let itChainApplied = false;

  for (let ci = 0; ci < clauses.length; ci++) {
    const clause = clauses[ci]!;
    const verbDef = VERBS[clause.verb];
    baseEnergyCost += verbDef.cost;

    // ENEMY ambiguity: using ENEMY when >1 enemies are alive costs +1 energy.
    if (clause.object?.noun === 'ENEMY' && aliveCount > 1) {
      enemyAmbiguityTax += 1;
    }

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

    let clauseEffects = verbEffects(clause.verb, target, clause, state);

    // IT chain: second clause's object refers to the prior noun via IT.
    // Amplify the clause's primary numeric effects by 1.5x.
    const isItChain = ci > 0 && clause.object?.noun === 'IT';
    if (isItChain && target !== null) {
      clauseEffects = scaleNumericEffects(clauseEffects, IT_CHAIN_MULTIPLIER);
      itChainApplied = true;
    }

    effects.push(...clauseEffects);
  }

  // Eloquence: count connectors in the sentence, each adds +1 to the
  // primary numeric effect, capped at ELOQUENCE_CAP.
  const eloquence = Math.min(ELOQUENCE_CAP, countConnectors(sentence));
  if (eloquence > 0) {
    addEloquenceBonus(effects, eloquence);
  }

  return {
    effects,
    energyCost: baseEnergyCost + enemyAmbiguityTax,
    consumedCardIds,
    newLastNounUsed: lastNoun,
    bonuses: { eloquence, itChainApplied, enemyAmbiguityTax },
  };
}

function countConnectors(sentence: Sentence): number {
  let n = 0;
  if (sentence.first.extra) n++;
  if (sentence.conjunction) n++;
  if (sentence.conjunction?.second.extra) n++;
  return n;
}

// Returns a new effect list with the primary numeric effect (damage > heal > block)
// scaled by `factor`. Mutates copies, not the input.
function scaleNumericEffects(effects: Effect[], factor: number): Effect[] {
  return effects.map((e) => {
    if (e.kind === 'damage') return { ...e, amount: Math.max(1, Math.round(e.amount * factor)) };
    if (e.kind === 'heal')   return { ...e, amount: Math.max(1, Math.round(e.amount * factor)) };
    if (e.kind === 'gain_block') return { ...e, amount: Math.max(1, Math.round(e.amount * factor)) };
    return e;
  });
}

// Adds `bonus` to the first damage effect; if none, to the first heal; else to the first block.
// Mutates in place (cheap; effects list is fresh for this call).
function addEloquenceBonus(effects: Effect[], bonus: number): void {
  let target: 'damage' | 'heal' | 'gain_block' | null = null;
  if (effects.some((e) => e.kind === 'damage')) target = 'damage';
  else if (effects.some((e) => e.kind === 'heal')) target = 'heal';
  else if (effects.some((e) => e.kind === 'gain_block')) target = 'gain_block';
  if (!target) return;
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i]!;
    if (e.kind === target) {
      // narrow types: damage/heal/gain_block all have `amount: number`
      if (e.kind === 'damage' || e.kind === 'heal' || e.kind === 'gain_block') {
        effects[i] = { ...e, amount: e.amount + bonus };
      }
      return;
    }
  }
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

// `ConnectorId` is unused here directly but kept exported via re-importing for
// possible future use (currently unused — silence lint by re-exposing).
export type { ConnectorId };

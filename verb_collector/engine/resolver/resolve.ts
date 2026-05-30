import { Clause, ConnectorId, NounId, Sentence, VerbId } from '../types';
import { VERBS } from '../words';
import { Card, GameState } from '../combat/state';
import { Effect, TargetRef, damageMultiplier } from '../combat/effects';

export interface BonusBreakdown {
  eloquence: number;
  itChainsApplied: number;     // how many clauses got the IT-chain bonus
  enemyAmbiguityTax: number;
}

export interface ResolveResult {
  effects: Effect[];
  energyCost: number;
  consumedCardIds: string[];
  newLastNounUsed: NounId | null;
  bonuses: BonusBreakdown;
}

const IT_CHAIN_MULTIPLIER = 1.5;

export function resolve(sentence: Sentence, state: GameState): ResolveResult {
  const effects: Effect[] = [];
  let baseEnergyCost = 0;
  const consumedCardIds: string[] = [];
  let lastNoun: NounId | null = state.lastNounUsed;

  const allClauses: Clause[] = [sentence.first, ...sentence.rest.map((r) => r.clause)];

  const aliveCount = state.enemies.filter((e) => e.hp > 0).length;
  let enemyAmbiguityTax = 0;
  let itChainsApplied = 0;

  for (let ci = 0; ci < allClauses.length; ci++) {
    const clause = allClauses[ci]!;
    const verbDef = VERBS[clause.verb];
    baseEnergyCost += verbDef.cost;

    if (clause.object?.noun === 'ENEMY' && aliveCount > 1) {
      enemyAmbiguityTax += 1;
    }

    const usedSoFar = new Set(consumedCardIds);
    const verbCard = state.hand.find(
      (c) => c.kind === 'verb' && c.word === clause.verb && !usedSoFar.has(c.id),
    );
    if (verbCard) consumedCardIds.push(verbCard.id);

    // Adjective card consumption: MAKE-apply (trailingAdjective) and the
    // LOOK <adj> "self-perception" form (selfAdjective). Both spend the card.
    const consumedAdj = clause.trailingAdjective ?? clause.selfAdjective;
    if (consumedAdj !== undefined) {
      const adjCard = state.hand.find(
        (c) =>
          c.kind === 'adjective' &&
          c.word === consumedAdj &&
          !usedSoFar.has(c.id),
      );
      if (adjCard) consumedCardIds.push(adjCard.id);
    }

    const target = clause.object ? resolveTarget(clause.object.noun, state, lastNoun) : null;
    if (clause.object) lastNoun = clause.object.noun === 'IT' ? lastNoun : clause.object.noun;

    let clauseEffects = verbEffects(clause.verb, target, clause, state);

    // IT chain: any non-first clause whose object is IT gets +50% on numerics.
    const isItChain = ci > 0 && clause.object?.noun === 'IT';
    if (isItChain && target !== null) {
      clauseEffects = scaleNumericEffects(clauseEffects, IT_CHAIN_MULTIPLIER);
      itChainsApplied += 1;
    }

    effects.push(...clauseEffects);
  }

  // Eloquence: every connector between *unique* clauses adds +1 to the
  // dominant numeric effect. Repetition (LOOK ROOM AND LOOK ROOM …) grants
  // nothing — the parser rewards composition, not loops.
  const eloquence = countEloquentConnectors(sentence);
  if (eloquence > 0) addEloquenceBonus(effects, eloquence);

  return {
    effects,
    energyCost: baseEnergyCost + enemyAmbiguityTax,
    consumedCardIds,
    newLastNounUsed: lastNoun,
    bonuses: { eloquence, itChainsApplied, enemyAmbiguityTax },
  };
}

// Dedup-aware connector count. A clause's "signature" is verb + primary noun
// + trailing word; if a later clause repeats a signature already used, its
// joining connector grants no eloquence. Extras (in-clause noun-phrase tails)
// still count once per clause but not for repeated extras inside the same
// clause shape.
function clauseSignature(c: Clause): string {
  const noun = c.object?.noun ?? '_';
  const adj = c.object?.adjective ?? '_';
  const trail = c.trailingAdjective ?? c.trailingVerb ?? c.selfAdjective ?? '_';
  return `${c.verb}|${adj}|${noun}|${trail}`;
}

function countEloquentConnectors(sentence: Sentence): number {
  const seen = new Set<string>();
  seen.add(clauseSignature(sentence.first));
  let n = 0;
  if (sentence.first.extra) n += 1;
  for (const entry of sentence.rest) {
    const sig = clauseSignature(entry.clause);
    if (!seen.has(sig)) {
      n += 1;
      seen.add(sig);
    }
    if (entry.clause.extra) n += 1;
  }
  return n;
}

function scaleNumericEffects(effects: Effect[], factor: number): Effect[] {
  return effects.map((e) => {
    if (e.kind === 'damage') return { ...e, amount: Math.max(1, Math.round(e.amount * factor)) };
    if (e.kind === 'heal')   return { ...e, amount: Math.max(1, Math.round(e.amount * factor)) };
    if (e.kind === 'gain_block') return { ...e, amount: Math.max(1, Math.round(e.amount * factor)) };
    return e;
  });
}

function addEloquenceBonus(effects: Effect[], bonus: number): void {
  let target: 'damage' | 'heal' | 'gain_block' | null = null;
  if (effects.some((e) => e.kind === 'damage')) target = 'damage';
  else if (effects.some((e) => e.kind === 'heal')) target = 'heal';
  else if (effects.some((e) => e.kind === 'gain_block')) target = 'gain_block';
  if (!target) return;
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i]!;
    if (e.kind === target) {
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
      if (!target) return [{ kind: 'log', text: 'MAKE needs a target.' }];

      // MAKE-apply form: trailing adjective applied to target.
      if (clause.trailingAdjective !== undefined) {
        const has = state.hand.some(
          (c: Card) => c.kind === 'adjective' && c.word === clause.trailingAdjective,
        );
        if (!has) return [{ kind: 'log', text: `No ${clause.trailingAdjective} card in hand.` }];
        return [{ kind: 'add_adjective', target, adjective: clause.trailingAdjective, turns: 'permanent' }];
      }

      // MAKE-compel form: target performs the trailing verb on itself.
      if (clause.trailingVerb !== undefined) {
        return compelEffects(target, clause.trailingVerb, state);
      }

      return [{ kind: 'log', text: 'MAKE needs an adjective or verb after the noun.' }];
    }
    case 'WAIT': return [
      { kind: 'queue_next_turn_bonus', energy: 1, draw: 1 },
      { kind: 'log', text: 'You wait.' },
    ];
    case 'LOOK': {
      // LOOK <adj> — self-perception: apply the adjective to SELF for one turn.
      // Cheap (1 energy) and consumes the adj card, distinct from MAKE SELF X
      // (2 energy, permanent).
      if (clause.selfAdjective !== undefined) {
        const has = state.hand.some(
          (c: Card) => c.kind === 'adjective' && c.word === clause.selfAdjective,
        );
        if (!has) return [{ kind: 'log', text: `No ${clause.selfAdjective} card in hand.` }];
        return [
          { kind: 'add_adjective', target: { kind: 'self' }, adjective: clause.selfAdjective, turns: 1 },
          { kind: 'log', text: `You look ${clause.selfAdjective.toLowerCase()}.` },
        ];
      }
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

// MAKE NOUN VERB — the target is compelled to perform `verb` on itself.
// The verb card does NOT need to be in hand; MAKE alone (2 energy) is enough.
function compelEffects(target: TargetRef, verb: VerbId, state: GameState): Effect[] {
  const label = describeTarget(state, target);
  switch (verb) {
    // Compels that skip the target's next action.
    case 'WALK':
    case 'WAIT':
    case 'BLOCK':
    case 'LOOK':
    case 'PUSH':
      return [
        { kind: 'compel_skip', target },
        { kind: 'log', text: `${label} is compelled to ${verb.toLowerCase()}.` },
      ];
    case 'BURN':
      return [
        { kind: 'damage', target, amount: 3 },
        { kind: 'add_adjective', target, adjective: 'BURNING', turns: 3 },
        { kind: 'log', text: `${label} burns themselves.` },
      ];
    case 'FREEZE':
      return [
        { kind: 'add_adjective', target, adjective: 'FROZEN', turns: 'permanent' },
        { kind: 'log', text: `${label} freezes themselves.` },
      ];
    case 'HEAL':
      return [
        { kind: 'heal', target, amount: 4 },
        { kind: 'log', text: `${label} heals.` },
      ];
    case 'HIT': {
      // Target uses its OWN attack stat against itself.
      const selfDmg = target.kind === 'enemy'
        ? (state.enemies.find((e) => e.id === target.id)?.attack ?? 3)
        : state.player.attack;
      return [
        { kind: 'damage', target, amount: selfDmg },
        { kind: 'log', text: `${label} hits themselves for ${selfDmg}.` },
      ];
    }
    case 'BREAK':
      return [
        { kind: 'damage', target, amount: 6 },
        { kind: 'log', text: `${label} breaks themselves.` },
      ];
    case 'MAKE':
    case 'GRAB':
      return [{ kind: 'log', text: `${label} doesn't understand how to ${verb.toLowerCase()}.` }];
  }
}

function describeTarget(state: GameState, target: TargetRef): string {
  if (target.kind === 'self') return 'YOU';
  if (target.kind === 'room') return 'the room';
  const enemy = state.enemies.find((e) => e.id === target.id);
  return enemy ? enemy.displayName : 'target';
}

export type { ConnectorId };

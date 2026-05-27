import { parse } from '../parser/grammar';
import { resolve } from '../resolver/resolve';
import { drawCards, makeRng, shuffle, wandererStarterDeck } from '../deck/deck';
import { spawnEnemy } from './enemies';
import { applyEffects, burningDamage, tickAdjectives } from './effects';
import { Card, GameState } from './state';

const HAND_SIZE = 5;
const PLAYER_MAX_HP = 50;
const PLAYER_ENERGY = 3;
const PLAYER_ATTACK = 5;

export type Action =
  | { type: 'add_to_sentence'; token: string }
  | { type: 'remove_from_sentence'; index: number }
  | { type: 'clear_sentence' }
  | { type: 'cast_sentence' }
  | { type: 'end_turn' }
  | { type: 'new_combat'; seed?: number };

interface ReducerContext {
  rng: () => number;
}

let currentRng: () => number = makeRng(Date.now());

export function reducer(state: GameState, action: Action): GameState {
  const ctx: ReducerContext = { rng: currentRng };
  switch (action.type) {
    case 'add_to_sentence':
      return { ...state, composing: [...state.composing, action.token.toUpperCase()] };
    case 'remove_from_sentence':
      return { ...state, composing: state.composing.filter((_, i) => i !== action.index) };
    case 'clear_sentence':
      return { ...state, composing: [] };
    case 'cast_sentence':
      return castSentence(state);
    case 'end_turn':
      return endTurn(state, ctx);
    case 'new_combat': {
      currentRng = makeRng(action.seed ?? Date.now());
      return startCombat({ rng: currentRng });
    }
  }
}

// ---- new combat -----------------------------------------------------------

export function startCombat(ctx: ReducerContext): GameState {
  const deck = shuffle(wandererStarterDeck(), ctx.rng);
  const draw = drawCards(deck, [], HAND_SIZE, ctx.rng);
  return {
    phase: 'combat',
    turn: 1,
    player: {
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      energy: PLAYER_ENERGY,
      maxEnergy: PLAYER_ENERGY,
      attack: PLAYER_ATTACK,
      block: 0,
      adjectives: [],
      nextTurnEnergyBonus: 0,
      nextTurnDrawBonus: 0,
    },
    enemies: [spawnEnemy('GOBLIN')],
    deck: draw.deck,
    hand: draw.drawn,
    discard: draw.discard,
    composing: [],
    lastNounUsed: null,
    log: [{ turn: 1, text: 'A goblin blocks your path.' }],
  };
}

// ---- cast -----------------------------------------------------------------

function castSentence(state: GameState): GameState {
  if (state.phase !== 'combat') return state;
  if (state.composing.length === 0) {
    return appendLog(state, 'Compose a sentence first.');
  }
  const parsed = parse(state.composing);
  if (!parsed.ok) {
    return appendLog({ ...state, composing: [] }, `Invalid: ${parsed.reason}`);
  }
  const result = resolve(parsed.sentence, state);
  if (result.energyCost > state.player.energy) {
    return appendLog(state, `Not enough energy (need ${result.energyCost}, have ${state.player.energy}).`);
  }

  // Move consumed cards from hand to discard.
  const consumed = new Set(result.consumedCardIds);
  const usedCards = state.hand.filter((c) => consumed.has(c.id));
  const remainingHand = state.hand.filter((c) => !consumed.has(c.id));

  const afterEnergy: GameState = {
    ...state,
    player: { ...state.player, energy: state.player.energy - result.energyCost },
    hand: remainingHand,
    discard: [...state.discard, ...usedCards],
    composing: [],
    lastNounUsed: result.newLastNounUsed,
  };

  const tokensText = state.composing.join(' ');
  const withLog = appendLog(afterEnergy, `▶ ${tokensText}`);
  return applyEffects(withLog, result.effects);
}

// ---- end turn -------------------------------------------------------------

function endTurn(state: GameState, ctx: ReducerContext): GameState {
  if (state.phase !== 'combat') return state;

  // 1. Discard remaining hand.
  let next: GameState = {
    ...state,
    discard: [...state.discard, ...state.hand],
    hand: [],
    composing: [],
  };

  // 2. Enemies act.
  for (const enemy of next.enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.adjectives.some((a) => a.id === 'FROZEN')) {
      next = appendLog(next, `${enemy.displayName} is frozen and skips its turn.`);
      continue;
    }
    if (enemy.intent.kind === 'attack') {
      const damage = enemy.intent.damage;
      next = applyEffects(next, [{ kind: 'damage', target: { kind: 'self' }, amount: damage }]);
    }
    if (next.phase === 'loss') return next;
  }

  // 3. End-of-round ticks.
  next = tickAll(next);
  if (next.phase !== 'combat') return next;

  // 4. New turn: reset block, refresh energy, draw.
  const energy = next.player.maxEnergy + next.player.nextTurnEnergyBonus;
  const draws = HAND_SIZE + next.player.nextTurnDrawBonus;
  const drawResult = drawCards(next.deck, next.discard, draws, ctx.rng);

  next = {
    ...next,
    turn: next.turn + 1,
    player: {
      ...next.player,
      energy,
      block: 0,
      nextTurnEnergyBonus: 0,
      nextTurnDrawBonus: 0,
    },
    deck: drawResult.deck,
    hand: drawResult.drawn,
    discard: drawResult.discard,
  };

  // 5. Refresh enemy intents (v0: always re-attack at base damage).
  next = {
    ...next,
    enemies: next.enemies.map((e) =>
      e.hp <= 0 ? e : { ...e, intent: { kind: 'attack', damage: e.attack } },
    ),
  };

  return appendLog(next, `--- Turn ${next.turn} ---`);
}

function tickAll(state: GameState): GameState {
  let next = state;

  // Player adjective ticks + BURNING damage.
  const playerBurn = burningDamage(next.player.adjectives);
  if (playerBurn > 0) {
    next = applyEffects(next, [{ kind: 'damage', target: { kind: 'self' }, amount: playerBurn }]);
    if (next.phase !== 'combat') return next;
  }
  const playerTick = tickAdjectives(next.player.adjectives);
  if (playerTick.expired.length > 0) {
    next = appendLog(next, `Expired on you: ${playerTick.expired.join(', ')}`);
  }
  next = { ...next, player: { ...next.player, adjectives: playerTick.remaining } };

  // Enemy ticks.
  const enemies = next.enemies.map((e) => {
    if (e.hp <= 0) return e;
    return e;
  });
  next = { ...next, enemies };

  for (const enemy of [...next.enemies]) {
    if (enemy.hp <= 0) continue;
    const burn = burningDamage(enemy.adjectives);
    if (burn > 0) {
      next = applyEffects(next, [{ kind: 'damage', target: { kind: 'enemy', id: enemy.id }, amount: burn }]);
    }
  }

  next = {
    ...next,
    enemies: next.enemies.map((e) => {
      if (e.hp <= 0) return e;
      const t = tickAdjectives(e.adjectives);
      return { ...e, adjectives: t.remaining };
    }),
  };

  return next;
}

// ---- helpers --------------------------------------------------------------

function appendLog(state: GameState, text: string): GameState {
  return { ...state, log: [...state.log, { turn: state.turn, text }] };
}

export function initialState(): GameState {
  return startCombat({ rng: currentRng });
}

// Re-export Card for UI convenience.
export type { Card };

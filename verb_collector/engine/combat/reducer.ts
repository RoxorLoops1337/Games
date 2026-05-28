import { NounId, VerbId } from '../types';
import { parse } from '../parser/grammar';
import { resolve } from '../resolver/resolve';
import { drawCards, makeRng, shuffle, wandererStarterDeck } from '../deck/deck';
import { chooseNextIntent, spawnEnemy } from './enemies';
import { Encounter, RUN_LENGTH, pickEncounter } from './encounters';
import { generateReward } from './rewards';
import { applyEffects, burningDamage, tickAdjectives } from './effects';
import { Card, Enemy, GameState, LogEntry } from './state';

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
  | { type: 'pick_reward'; verb: VerbId }
  | { type: 'skip_reward' }
  | { type: 'new_run'; seed?: number };

let currentRng: () => number = makeRng(Date.now());

export function reducer(state: GameState, action: Action): GameState {
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
      return endTurn(state);
    case 'pick_reward':
      return pickReward(state, action.verb);
    case 'skip_reward':
      return advanceAfterReward(state, null);
    case 'new_run': {
      currentRng = makeRng(action.seed ?? Date.now());
      return startNewRun();
    }
  }
}

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

export function startNewRun(): GameState {
  const permanentDeck = wandererStarterDeck();
  const firstEncounter = pickEncounter(0, currentRng);
  return startCombat({
    phase: 'combat',
    turn: 1,
    permanentDeck,
    unlockedNouns: ['SELF', 'ENEMY', 'ROOM', 'IT'],
    combatsWon: 0,
    runSentence: 'THE HERO ENTERED THE FOREST',
    rewardOffered: [],
    player: makeFreshPlayer(),
    enemies: [],
    hand: [],
    deck: [],
    discard: [],
    composing: [],
    lastNounUsed: null,
    log: [],
    encounterName: '',
  }, firstEncounter);
}

function makeFreshPlayer(): GameState['player'] {
  return {
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    energy: PLAYER_ENERGY,
    maxEnergy: PLAYER_ENERGY,
    attack: PLAYER_ATTACK,
    block: 0,
    adjectives: [],
    nextTurnEnergyBonus: 0,
    nextTurnDrawBonus: 0,
  };
}

// Sets up the next combat using the current run state. Reshuffles deck,
// draws hand, spawns enemies for the encounter. Player HP carries over.
function startCombat(runState: GameState, encounter: Encounter): GameState {
  const deck = shuffle(runState.permanentDeck, currentRng);
  const draw = drawCards(deck, [], HAND_SIZE, currentRng);
  const enemies = encounter.enemies.map((key) => spawnEnemy(key));

  const player: GameState['player'] = {
    ...runState.player,
    energy: PLAYER_ENERGY,
    block: 0,
    adjectives: [],
    nextTurnEnergyBonus: 0,
    nextTurnDrawBonus: 0,
  };

  const intro: LogEntry = {
    turn: 1,
    text: `You encounter ${encounter.name.toLowerCase()}.`,
  };

  return {
    ...runState,
    phase: 'combat',
    turn: 1,
    player,
    enemies,
    deck: draw.deck,
    hand: draw.drawn,
    discard: draw.discard,
    composing: [],
    lastNounUsed: null,
    log: [intro],
    encounterName: encounter.name,
  };
}

function pickReward(state: GameState, verb: VerbId): GameState {
  const newCard: Card = {
    id: `${verb}_run_${state.combatsWon}_${Math.floor(currentRng() * 100000)}`,
    kind: 'verb',
    word: verb,
  };
  const next: GameState = {
    ...state,
    permanentDeck: [...state.permanentDeck, newCard],
  };
  return advanceAfterReward(next, verb);
}

function advanceAfterReward(state: GameState, taken: VerbId | null): GameState {
  // After taking (or skipping) a reward, move to the next combat — or end
  // the run if we've completed all encounters.
  let withLog = state;
  if (taken) {
    withLog = appendLog(
      { ...state, runSentence: `${state.runSentence}, took ${taken}` },
      `Added ${taken} to your deck.`,
    );
  }
  if (state.combatsWon >= RUN_LENGTH) {
    return {
      ...withLog,
      phase: 'won_run',
      runSentence: `${withLog.runSentence}.`,
    };
  }
  const encounter = pickEncounter(state.combatsWon, currentRng);
  const heading = state.combatsWon === RUN_LENGTH - 1
    ? `, AND FACED ${encounter.name}`
    : `, AND FOUGHT ${encounter.name}`;
  const next: GameState = {
    ...withLog,
    runSentence: `${withLog.runSentence}${heading}`,
    rewardOffered: [],
  };
  return startCombat(next, encounter);
}

// ---------------------------------------------------------------------------
// Casting
// ---------------------------------------------------------------------------

function castSentence(state: GameState): GameState {
  if (state.phase !== 'combat') return state;
  if (state.composing.length === 0) return appendLog(state, 'Compose a sentence first.');

  const parsed = parse(state.composing);
  if (!parsed.ok) {
    return appendLog({ ...state, composing: [] }, `Invalid: ${parsed.reason}`);
  }
  const result = resolve(parsed.sentence, state);
  if (result.energyCost > state.player.energy) {
    return appendLog(
      state,
      `Not enough energy (need ${result.energyCost}, have ${state.player.energy}).`,
    );
  }

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
  const afterEffects = applyEffects(withLog, result.effects);

  return checkCombatEnd(afterEffects);
}

// ---------------------------------------------------------------------------
// Combat-end handling
// ---------------------------------------------------------------------------

function checkCombatEnd(state: GameState): GameState {
  if (state.phase !== 'combat') return state;
  const allDead = state.enemies.every((e) => e.hp === 0);
  if (!allDead) return state;
  return enterRewardPhase(state);
}

function enterRewardPhase(state: GameState): GameState {
  // Unlock collected nouns from defeated enemies.
  const newlyUnlocked: NounId[] = [];
  for (const enemy of state.enemies) {
    if (enemy.hp > 0) continue;
    if (!state.unlockedNouns.includes(enemy.noun) && enemy.noun !== 'BIG_GOBLIN' && enemy.noun !== 'GREEN_KNIGHT') {
      newlyUnlocked.push(enemy.noun);
    }
  }
  const unlockedNouns = newlyUnlocked.length > 0
    ? [...state.unlockedNouns, ...newlyUnlocked]
    : state.unlockedNouns;

  const combatsWon = state.combatsWon + 1;
  const offered = generateReward(
    { name: state.encounterName, enemies: [], difficulty: combatsWon === 4 ? 'boss' : combatsWon === 3 ? 'elite' : 'normal' },
    currentRng,
  );

  let next: GameState = {
    ...state,
    phase: 'reward',
    combatsWon,
    unlockedNouns,
    rewardOffered: offered,
  };
  next = appendLog(next, `You prevail.`);
  if (newlyUnlocked.length > 0) {
    next = appendLog(next, `New nouns unlocked: ${newlyUnlocked.join(', ')}.`);
  }
  return next;
}

// ---------------------------------------------------------------------------
// End turn
// ---------------------------------------------------------------------------

function endTurn(state: GameState): GameState {
  if (state.phase !== 'combat') return state;

  let next: GameState = {
    ...state,
    discard: [...state.discard, ...state.hand],
    hand: [],
    composing: [],
  };

  next = resolveEnemyTurn(next);
  if (next.phase !== 'combat') return next;

  next = tickAll(next);
  if (next.phase !== 'combat') return next;

  next = checkCombatEnd(next);
  if (next.phase !== 'combat') return next;

  const energy = next.player.maxEnergy + next.player.nextTurnEnergyBonus;
  const draws = HAND_SIZE + next.player.nextTurnDrawBonus;
  const drawResult = drawCards(next.deck, next.discard, draws, currentRng);

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

  // Refresh enemy intents for next turn.
  next = {
    ...next,
    enemies: next.enemies.map((e) =>
      e.hp <= 0 ? e : { ...e, turnsAlive: e.turnsAlive + 1, intent: chooseNextIntent({ ...e, turnsAlive: e.turnsAlive + 1 }) },
    ),
  };

  return appendLog(next, `--- Turn ${next.turn} ---`);
}

// Each enemy resolves its current intent.
function resolveEnemyTurn(state: GameState): GameState {
  let next = state;
  // Sort: FAST acts first, SLOW last, others in order.
  const order = [...next.enemies].sort((a, b) => orderKey(a) - orderKey(b));

  for (const enemy of order) {
    const live = next.enemies.find((e) => e.id === enemy.id);
    if (!live || live.hp <= 0) continue;
    if (live.adjectives.some((a) => a.id === 'FROZEN')) {
      next = appendLog(next, `${live.displayName} is frozen and skips its turn.`);
      continue;
    }

    switch (live.intent.kind) {
      case 'attack':
        next = applyEffects(next, [
          { kind: 'damage', target: { kind: 'self' }, amount: live.intent.damage },
        ]);
        break;
      case 'spore':
        next = applyEffects(next, [
          { kind: 'damage', target: { kind: 'self' }, amount: live.intent.damage },
          { kind: 'log', text: `${live.displayName} releases spores.` },
        ]);
        break;
      case 'thorns':
        next = appendLog(next, `${live.displayName} bristles.`);
        break;
      case 'multiply': {
        // Spawn a fresh copy of the same enemy. Cap at 4 total to prevent runaway.
        if (next.enemies.filter((e) => e.hp > 0).length < 4) {
          const clone = spawnEnemy(live.noun === 'GOBLIN' ? 'GOBLIN' : 'GOBLIN');
          next = appendLog({ ...next, enemies: [...next.enemies, clone] }, `${live.displayName} multiplies.`);
        } else {
          next = appendLog(next, `${live.displayName} would multiply, but the room is full.`);
        }
        break;
      }
      case 'reapply_big': {
        next = applyEffects(next, [
          { kind: 'add_adjective', target: { kind: 'enemy', id: live.id }, adjective: 'BIG', turns: 'permanent' },
        ]);
        break;
      }
      case 'wait':
        next = appendLog(next, `${live.displayName} waits.`);
        break;
    }

    if (next.phase === 'lost_run') return next;
  }
  return next;
}

function orderKey(e: Enemy): number {
  if (e.adjectives.some((a) => a.id === 'FAST')) return 0;
  if (e.adjectives.some((a) => a.id === 'SLOW')) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Tick / end of round
// ---------------------------------------------------------------------------

function tickAll(state: GameState): GameState {
  let next = state;

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

  for (const enemy of [...next.enemies]) {
    if (enemy.hp <= 0) continue;
    const burn = burningDamage(enemy.adjectives);
    if (burn > 0) {
      next = applyEffects(next, [
        { kind: 'damage', target: { kind: 'enemy', id: enemy.id }, amount: burn },
      ]);
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appendLog(state: GameState, text: string): GameState {
  return { ...state, log: [...state.log, { turn: state.turn, text }] };
}

// Map phase 'lost_run' transition when player HP reaches 0. Done by effects.ts
// emitting state.phase = 'loss' — we map that to 'lost_run' here on transition.
// (We use 'loss' inline in applyDamage for backward compatibility; map it.)
//
// Actually: effects.ts sets phase = 'loss' which doesn't exist in Phase any
// more. Fix effects.ts to use 'lost_run'.

export function initialState(): GameState {
  return startNewRun();
}

export type { Card };

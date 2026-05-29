import { NounId, VerbId } from '../types';
import { parse } from '../parser/grammar';
import { resolve } from '../resolver/resolve';
import { drawCards, makeRng, shuffle, wandererStarterDeck } from '../deck/deck';
import { chooseNextIntent, spawnEnemy } from './enemies';
import { Encounter } from './encounters';
import { generateReward } from './rewards';
import { applyEffects, burningDamage, tickAdjectives } from './effects';
import {
  Card, Enemy, GameState, LogEntry, Player,
} from './state';
import {
  RUN_LENGTH, generateSceneOffers, runSentenceFragment,
} from '../run/scenes';
import { hasSave, loadState, saveState, finalizeRun, clearSave } from '../save/storage';
import { RelicId, RELICS, relicHook } from '../relics/relics';
import { PotionId, POTIONS, POTION_SLOT_COUNT } from '../potions/potions';

const HAND_SIZE = 5;
const PLAYER_MAX_HP = 50;
const PLAYER_ENERGY = 3;
const PLAYER_ATTACK = 5;

const INK_FROM_COMBAT: Record<'normal' | 'elite' | 'boss', number> = {
  normal: 1, elite: 2, boss: 3,
};
const INK_FROM_SKIP_REWARD = 2;

const INK_COST_PEEK = 2;
const INK_COST_HIDE = 4;

export type Action =
  // Title screen
  | { type: 'start_new_run'; seed?: number }
  | { type: 'continue_run' }
  | { type: 'goto_title' }
  // Map screen
  | { type: 'enter_scene'; offerIndex: number }
  | { type: 'spend_ink'; action: 'peek' | 'hide' }
  // Combat screen
  | { type: 'add_to_sentence'; token: string }
  | { type: 'remove_from_sentence'; index: number }
  | { type: 'clear_sentence' }
  | { type: 'cast_sentence' }
  | { type: 'end_turn' }
  | { type: 'use_potion'; slot: number }
  // Reward screen
  | { type: 'pick_reward'; verb: VerbId }
  | { type: 'skip_reward' }
  // Non-combat scene completion (used by stub scenes and Phase B agent UIs)
  | { type: 'scene_done' }
  // Non-combat scene operations — handlers provided by Phase B agents.
  // The reducer accepts these unconditionally so the action types compile;
  // missing handlers fall through to a log entry.
  | { type: 'shop_buy_word'; verb: VerbId; price: number }
  | { type: 'shop_buy_potion'; potion: PotionId; price: number }
  | { type: 'shop_buy_relic'; relic: RelicId; price: number }
  | { type: 'shrine_upgrade'; cardId: string; mode: 'cost' | 'effect' }
  | { type: 'fire_heal' }
  | { type: 'fire_take_relic'; relic: RelicId }
  | { type: 'mirror_duplicate'; cardId: string };

let currentRng: () => number = makeRng(Date.now());

export function reducer(state: GameState, action: Action): GameState {
  const next = reduce(state, action);
  // Persist on every state transition (except title, which the storage layer
  // already skips).
  saveState(next);
  return next;
}

function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    // ---- Title -----------------------------------------------------------
    case 'start_new_run': {
      currentRng = makeRng(action.seed ?? Date.now());
      clearSave();
      return startNewRun();
    }
    case 'continue_run': {
      const loaded = loadState();
      if (!loaded) return state;
      currentRng = makeRng(Date.now());
      return loaded;
    }
    case 'goto_title':
      return { ...state, phase: 'title' };

    // ---- Map -------------------------------------------------------------
    case 'enter_scene':
      return enterScene(state, action.offerIndex);
    case 'spend_ink':
      return spendInk(state, action.action);

    // ---- Combat composition / cast --------------------------------------
    case 'add_to_sentence':
      return state.phase === 'combat'
        ? { ...state, composing: [...state.composing, action.token.toUpperCase()] }
        : state;
    case 'remove_from_sentence':
      return state.phase === 'combat'
        ? { ...state, composing: state.composing.filter((_, i) => i !== action.index) }
        : state;
    case 'clear_sentence':
      return state.phase === 'combat' ? { ...state, composing: [] } : state;
    case 'cast_sentence':
      return castSentence(state);
    case 'end_turn':
      return endTurn(state);
    case 'use_potion':
      return drinkPotion(state, action.slot);

    // ---- Reward ----------------------------------------------------------
    case 'pick_reward':
      return pickReward(state, action.verb);
    case 'skip_reward':
      return skipReward(state);

    // ---- Non-combat scene completion ------------------------------------
    case 'scene_done':
      return advanceToNextNode(state, /*sceneCompleted*/ true);

    // ---- Non-combat operations ------------------------------------------
    case 'shop_buy_word':       return shopBuyWord(state, action.verb, action.price);
    case 'shop_buy_potion':     return shopBuyPotion(state, action.potion, action.price);
    case 'shop_buy_relic':      return shopBuyRelic(state, action.relic, action.price);
    case 'shrine_upgrade':      return shrineUpgrade(state, action.cardId, action.mode);
    case 'fire_heal':           return fireHeal(state);
    case 'fire_take_relic':     return fireTakeRelic(state, action.relic);
    case 'mirror_duplicate':    return mirrorDuplicate(state, action.cardId);
  }
}

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

export function startNewRun(): GameState {
  const permanentDeck = wandererStarterDeck();
  const firstOffers = generateSceneOffers(0, currentRng);
  const base: GameState = {
    phase: 'map',
    turn: 1,
    permanentDeck,
    unlockedNouns: ['SELF', 'ENEMY', 'ROOM', 'IT'],
    combatsWon: 0,
    runSentence: 'THE HERO ENTERED THE FOREST',
    rewardOffered: [],
    ink: 0,
    relics: ['COMMA'],   // Wanderer starter relic
    relicState: {},
    potions: new Array(POTION_SLOT_COUNT).fill(null),
    sceneIndex: 0,
    sceneOptions: firstOffers,
    peekedScene: null,
    hideNext: false,
    player: makeFreshPlayer(),
    enemies: [],
    hand: [],
    deck: [],
    discard: [],
    composing: [],
    lastNounUsed: null,
    log: [{ turn: 0, text: 'A path opens through the forest.' }],
    announcedThisTurn: [],
    encounterName: '',
  };
  return base;
}

function makeFreshPlayer(): Player {
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

// Determine the title-screen initial state — either a fresh title view, or
// directly continuing if a save exists. The App component reads `hasSave()`
// separately to decide which buttons to show; the actual jump is via
// 'continue_run'.
export function initialState(): GameState {
  return titleState();
}

function titleState(): GameState {
  return {
    phase: 'title',
    turn: 0,
    permanentDeck: [],
    unlockedNouns: [],
    combatsWon: 0,
    runSentence: '',
    rewardOffered: [],
    ink: 0,
    relics: [],
    relicState: {},
    potions: new Array(POTION_SLOT_COUNT).fill(null),
    sceneIndex: 0,
    sceneOptions: [],
    peekedScene: null,
    hideNext: false,
    player: makeFreshPlayer(),
    enemies: [],
    hand: [],
    deck: [],
    discard: [],
    composing: [],
    lastNounUsed: null,
    log: [],
    announcedThisTurn: [],
    encounterName: '',
  };
}

// ---------------------------------------------------------------------------
// Map / scene routing
// ---------------------------------------------------------------------------

function enterScene(state: GameState, offerIndex: number): GameState {
  if (state.phase !== 'map') return state;
  const offer = state.sceneOptions[offerIndex];
  if (!offer) return state;

  const fragment = runSentenceFragment(offer, state.sceneIndex === RUN_LENGTH - 1);
  const withSentence: GameState = {
    ...state,
    runSentence: `${state.runSentence}${fragment}`,
    encounterName: offer.label,
    peekedScene: null,
  };

  switch (offer.kind) {
    case 'combat_normal':
    case 'combat_elite':
    case 'combat_boss':
      return startCombat(withSentence, offer.encounter!);
    case 'shop':   return { ...withSentence, phase: 'shop' };
    case 'shrine': return { ...withSentence, phase: 'shrine' };
    case 'fire':   return { ...withSentence, phase: 'fire' };
    case 'mirror': return { ...withSentence, phase: 'mirror' };
  }
}

// After a scene completes (combat reward picked, or non-combat scene_done),
// move to the next map node — or end the run if we've passed the last node.
function advanceToNextNode(state: GameState, sceneCompleted: boolean): GameState {
  if (!sceneCompleted) return state;

  const nextIndex = state.sceneIndex + 1;

  // HIDE ink action: skip the next scene entirely (and the run ends one
  // scene earlier than usual).
  let effectiveIndex = nextIndex;
  let withHide = state;
  if (state.hideNext) {
    effectiveIndex = nextIndex + 1;
    withHide = appendLog({ ...state, hideNext: false }, 'You SKIP past the next scene.');
  }

  if (effectiveIndex >= RUN_LENGTH) {
    return finalizeWonRun(withHide);
  }
  const offers = generateSceneOffers(effectiveIndex, currentRng);
  return {
    ...withHide,
    phase: 'map',
    sceneIndex: effectiveIndex,
    sceneOptions: offers,
    peekedScene: null,
  };
}

function finalizeWonRun(state: GameState): GameState {
  const ended: GameState = {
    ...state,
    phase: 'won_run',
    runSentence: `${state.runSentence}.`,
  };
  try {
    finalizeRun({
      won: true,
      longestSentence: 0,
      collectedWords: state.unlockedNouns.map(String),
    });
  } catch { /* save failures shouldn't block the end screen */ }
  return ended;
}

function spendInk(state: GameState, kind: 'peek' | 'hide'): GameState {
  if (state.phase !== 'map') return state;
  if (kind === 'peek') {
    if (state.ink < INK_COST_PEEK || state.peekedScene) return state;
    const nextIdx = state.sceneIndex + 1;
    if (nextIdx >= RUN_LENGTH) return appendLog(state, 'Nothing lies beyond.');
    const peek = generateSceneOffers(nextIdx, currentRng);
    return {
      ...state,
      ink: state.ink - INK_COST_PEEK,
      peekedScene: peek,
    };
  }
  if (kind === 'hide') {
    if (state.ink < INK_COST_HIDE || state.hideNext) return state;
    return {
      ...state,
      ink: state.ink - INK_COST_HIDE,
      hideNext: true,
    };
  }
  return state;
}

// ---------------------------------------------------------------------------
// Combat setup
// ---------------------------------------------------------------------------

function startCombat(runState: GameState, encounter: Encounter): GameState {
  const deck = shuffle(runState.permanentDeck, currentRng);
  // Per-turn draw bonus from relics (e.g. THE COMMA) applies here too.
  const base: GameState = {
    ...runState,
    phase: 'combat',
    turn: 1,
    player: {
      ...runState.player,
      energy: PLAYER_ENERGY,
      block: 0,
      adjectives: [],
      nextTurnEnergyBonus: 0,
      nextTurnDrawBonus: 0,
    },
    enemies: encounter.enemies.map((key) => {
      const e = spawnEnemy(key);
      // Boss honor: armoured for the first 5 player turns.
      if (e.traits.includes('honor')) {
        return { ...e, honorEndsAfterTurn: 5 };
      }
      return e;
    }),
    deck: [],
    hand: [],
    discard: [],
    composing: [],
    lastNounUsed: null,
    log: [{ turn: 1, text: `You encounter ${encounter.name.toLowerCase()}.` }],
    announcedThisTurn: [],
    encounterName: encounter.name,
  };

  const drawCount = applyDrawHooks(base, HAND_SIZE);
  const draw = drawCards(deck, [], drawCount, currentRng);

  let withCombat: GameState = {
    ...base,
    deck: draw.deck,
    hand: draw.drawn,
    discard: draw.discard,
  };
  // Allow relics to react to combat start.
  for (const hook of relicHook(withCombat, 'onCombatStart')) {
    withCombat = applyEffects(withCombat, hook(withCombat));
  }
  return withCombat;
}

function applyDrawHooks(state: GameState, base: number): number {
  let n = base;
  for (const hook of relicHook(state, 'onDrawCount')) {
    n = hook(state, n);
  }
  return n;
}

// ---------------------------------------------------------------------------
// Reward — post-combat word pick
// ---------------------------------------------------------------------------

function pickReward(state: GameState, verb: VerbId): GameState {
  if (state.phase !== 'reward') return state;
  const newCard: Card = {
    id: `${verb}_run_${state.sceneIndex}_${Math.floor(currentRng() * 100000)}`,
    kind: 'verb',
    word: verb,
  };
  const withCard: GameState = {
    ...state,
    permanentDeck: [...state.permanentDeck, newCard],
    runSentence: `${state.runSentence}, took ${verb}`,
  };
  return advanceToNextNode(appendLog(withCard, `Added ${verb} to your manuscript.`), true);
}

function skipReward(state: GameState): GameState {
  if (state.phase !== 'reward') return state;
  const withInk: GameState = {
    ...state,
    ink: state.ink + INK_FROM_SKIP_REWARD,
  };
  return advanceToNextNode(
    appendLog(withInk, `You take only ink (+${INK_FROM_SKIP_REWARD}).`),
    true,
  );
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

  // Track announced targets for boss HONOR (any LOOK in the sentence
  // counts; we look for trailing/leading LOOK clauses in tokens).
  const announced = [...state.announcedThisTurn];
  if (state.composing.includes('LOOK')) {
    for (const enemy of state.enemies) {
      if (state.composing.includes(enemy.noun)) announced.push(enemy.id);
      else if (state.composing.includes('ENEMY')) announced.push(enemy.id);
    }
  }

  const afterEnergy: GameState = {
    ...state,
    player: { ...state.player, energy: state.player.energy - result.energyCost },
    hand: remainingHand,
    discard: [...state.discard, ...usedCards],
    composing: [],
    lastNounUsed: result.newLastNounUsed,
    announcedThisTurn: announced,
  };

  const tokensText = state.composing.join(' ');
  const withLog = appendLog(afterEnergy, `▶ ${tokensText}`);

  // Relics can inject extra effects after a cast (e.g. EXCLAMATION_POINT
  // adds bonus damage to the first sentence).
  let withEffects = applyEffects(withLog, result.effects);
  for (const hook of relicHook(withEffects, 'onAfterCast')) {
    withEffects = applyEffects(withEffects, hook(withEffects, state.composing));
  }

  const afterCombatCheck = checkCombatEnd(withEffects);
  if (afterCombatCheck.phase !== 'combat') return afterCombatCheck;

  return endTurn(afterCombatCheck);
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
    if (
      !state.unlockedNouns.includes(enemy.noun) &&
      enemy.noun !== 'BIG_GOBLIN' &&
      enemy.noun !== 'GREEN_KNIGHT'
    ) {
      newlyUnlocked.push(enemy.noun);
    }
  }
  const unlockedNouns = newlyUnlocked.length > 0
    ? [...state.unlockedNouns, ...newlyUnlocked]
    : state.unlockedNouns;

  // Reward pool depends on the scene difficulty.
  const difficulty: 'normal' | 'elite' | 'boss' =
    state.sceneIndex === RUN_LENGTH - 1 ? 'boss'
    : state.sceneIndex === RUN_LENGTH - 2 ? 'elite'
    : 'normal';
  const offered = generateReward(
    { name: state.encounterName, enemies: [], difficulty },
    currentRng,
  );
  const inkGain = INK_FROM_COMBAT[difficulty];

  let next: GameState = {
    ...state,
    phase: 'reward',
    combatsWon: state.combatsWon + 1,
    unlockedNouns,
    rewardOffered: offered,
    ink: state.ink + inkGain,
  };
  next = appendLog(next, `You prevail. (+${inkGain} ink)`);
  if (newlyUnlocked.length > 0) {
    next = appendLog(next, `New nouns unlocked: ${newlyUnlocked.join(', ')}.`);
  }
  return next;
}

// ---------------------------------------------------------------------------
// End turn — enemy actions, ticks, redraw
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
  const drawTarget = applyDrawHooks(next, HAND_SIZE) + next.player.nextTurnDrawBonus;
  const drawResult = drawCards(next.deck, next.discard, drawTarget, currentRng);

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
    announcedThisTurn: [],
  };

  // Refresh enemy intents. Honor: if the boss's honor window has ended
  // (player turn > honorEndsAfterTurn), switch its intent to double_attack
  // and drop the trait so future damage applies normally.
  next = {
    ...next,
    enemies: next.enemies.map((e) => {
      if (e.hp <= 0) return e;
      let updated: Enemy = {
        ...e,
        turnsAlive: e.turnsAlive + 1,
      };
      // HONOR end: convert to double-attack post-window.
      if (
        updated.traits.includes('honor') &&
        updated.honorEndsAfterTurn !== undefined &&
        next.turn > updated.honorEndsAfterTurn
      ) {
        updated = {
          ...updated,
          traits: updated.traits.filter(t => t !== 'honor'),
          intent: { kind: 'double_attack', damage: updated.attack },
        };
      } else {
        updated = { ...updated, intent: chooseNextIntent(updated) };
      }
      return updated;
    }),
  };

  return appendLog(next, `--- Turn ${next.turn} ---`);
}

function resolveEnemyTurn(state: GameState): GameState {
  let next = state;
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
        next = applyIncomingDamage(next, live.intent.damage);
        break;
      case 'double_attack':
        next = applyIncomingDamage(next, live.intent.damage);
        if (next.phase === 'lost_run') return next;
        next = applyEffects(next, [{ kind: 'log', text: `${live.displayName} attacks again!` }]);
        next = applyIncomingDamage(next, live.intent.damage);
        break;
      case 'spore':
        next = applyEffects(next, [{ kind: 'log', text: `${live.displayName} releases spores.` }]);
        next = applyIncomingDamage(next, live.intent.damage);
        break;
      case 'thorns':
        next = appendLog(next, `${live.displayName} bristles.`);
        break;
      case 'multiply': {
        if (next.enemies.filter((e) => e.hp > 0).length < 4) {
          const clone = spawnEnemy('GOBLIN');
          next = appendLog({ ...next, enemies: [...next.enemies, clone] }, `${live.displayName} multiplies.`);
        } else {
          next = appendLog(next, `${live.displayName} would multiply, but the room is full.`);
        }
        break;
      }
      case 'reapply_big':
        next = applyEffects(next, [
          { kind: 'add_adjective', target: { kind: 'enemy', id: live.id }, adjective: 'BIG', turns: 'permanent' },
        ]);
        break;
      case 'wait':
        next = appendLog(next, `${live.displayName} waits.`);
        break;
    }

    if (next.phase === 'lost_run') return next;
  }
  return next;
}

function applyIncomingDamage(state: GameState, base: number): GameState {
  let amount = base;
  for (const hook of relicHook(state, 'onPlayerIncomingDamage')) {
    amount = hook(state, amount);
  }
  return applyEffects(state, [{ kind: 'damage', target: { kind: 'self' }, amount }]);
}

function orderKey(e: Enemy): number {
  if (e.adjectives.some((a) => a.id === 'FAST')) return 0;
  if (e.adjectives.some((a) => a.id === 'SLOW')) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Ticks
// ---------------------------------------------------------------------------

function tickAll(state: GameState): GameState {
  let next = state;
  const playerBurn = burningDamage(next.player.adjectives);
  if (playerBurn > 0) {
    next = applyIncomingDamage(next, playerBurn);
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
// Potions
// ---------------------------------------------------------------------------

function drinkPotion(state: GameState, slot: number): GameState {
  if (state.phase !== 'combat') return appendLog(state, 'Potions only work during combat.');
  const id = state.potions[slot];
  if (!id) return state;
  const def = POTIONS[id];
  if (!def) return appendLog(state, 'That potion is empty.');
  const effects = def.cast(state);
  const newPotions = [...state.potions];
  newPotions[slot] = null;
  const withConsumed: GameState = { ...state, potions: newPotions };
  const logged = appendLog(withConsumed, `You drink the ${def.label}.`);
  const withEffects = applyEffects(logged, effects);
  return checkCombatEnd(withEffects);
}

// ---------------------------------------------------------------------------
// Non-combat scene operations
//
// These keep the contract tight: the action handlers are real, persistent,
// and replayable. The shop/shrine/fire/mirror UIs only need to dispatch
// these with the right payload — Phase B agents own the UIs and the price
// computation, the reducer owns the state transitions.
// ---------------------------------------------------------------------------

function shopBuyWord(state: GameState, verb: VerbId, price: number): GameState {
  if (state.phase !== 'shop') return state;
  if (state.ink < price) return appendLog(state, 'Not enough ink.');
  const newCard: Card = {
    id: `${verb}_buy_${state.sceneIndex}_${Math.floor(currentRng() * 100000)}`,
    kind: 'verb',
    word: verb,
  };
  return appendLog({
    ...state,
    ink: state.ink - price,
    permanentDeck: [...state.permanentDeck, newCard],
  }, `Bought ${verb} for ${price} ink.`);
}

function shopBuyPotion(state: GameState, potion: PotionId, price: number): GameState {
  if (state.phase !== 'shop') return state;
  if (state.ink < price) return appendLog(state, 'Not enough ink.');
  const emptyIdx = state.potions.findIndex(p => p === null);
  if (emptyIdx < 0) return appendLog(state, 'No potion slots free.');
  const newPotions = [...state.potions];
  newPotions[emptyIdx] = potion;
  return appendLog({
    ...state,
    ink: state.ink - price,
    potions: newPotions,
  }, `Bought a ${POTIONS[potion]?.label ?? potion}.`);
}

function shopBuyRelic(state: GameState, relic: RelicId, price: number): GameState {
  if (state.phase !== 'shop') return state;
  if (state.ink < price) return appendLog(state, 'Not enough ink.');
  if (state.relics.includes(relic)) return appendLog(state, 'Already have that relic.');
  return appendLog({
    ...state,
    ink: state.ink - price,
    relics: [...state.relics, relic],
  }, `Bought ${RELICS[relic]?.name ?? relic}.`);
}

function shrineUpgrade(state: GameState, cardId: string, mode: 'cost' | 'effect'): GameState {
  if (state.phase !== 'shrine') return state;
  const idx = state.permanentDeck.findIndex(c => c.id === cardId);
  if (idx < 0) return state;
  const card = state.permanentDeck[idx]!;
  if (card.kind !== 'verb') return appendLog(state, 'Only verbs can be upgraded here.');
  const upgradedCard: Card =
    mode === 'cost'
      ? { ...card, costOverride: Math.max(0, (card.costOverride ?? 999) - 1), upgraded: true }
      : { ...card, upgraded: true };
  const newDeck = [...state.permanentDeck];
  newDeck[idx] = upgradedCard;
  return appendLog({
    ...state,
    permanentDeck: newDeck,
  }, `${card.word} is rewritten in heavier ink.`);
}

function fireHeal(state: GameState): GameState {
  if (state.phase !== 'fire') return state;
  const healed = Math.floor(state.player.maxHp * 0.3);
  const hp = Math.min(state.player.maxHp, state.player.hp + healed);
  return appendLog({
    ...state,
    player: { ...state.player, hp },
  }, `You warm yourself by the fire (+${healed} HP).`);
}

function fireTakeRelic(state: GameState, relic: RelicId): GameState {
  if (state.phase !== 'fire') return state;
  if (state.relics.includes(relic)) return state;
  return appendLog({
    ...state,
    relics: [...state.relics, relic],
  }, `You pocket the ${RELICS[relic]?.name ?? relic}.`);
}

function mirrorDuplicate(state: GameState, cardId: string): GameState {
  if (state.phase !== 'mirror') return state;
  const src = state.permanentDeck.find(c => c.id === cardId);
  if (!src) return state;
  const dup: Card = {
    ...src,
    id: `${src.id}_mirror_${Math.floor(currentRng() * 100000)}`,
  };
  return appendLog({
    ...state,
    permanentDeck: [...state.permanentDeck, dup],
  }, `The mirror copies ${src.word}.`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appendLog(state: GameState, text: string): GameState {
  const entry: LogEntry = { turn: state.turn, text };
  return { ...state, log: [...state.log, entry] };
}

export type { Card };
export { HAND_SIZE, hasSave };

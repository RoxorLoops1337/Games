import { ADJECTIVES, findInteraction } from '../words';
import { AdjectiveId } from '../types';
import { shuffle } from '../deck/deck';
import { AdjectiveInstance, CardId, Enemy, GameState, Player } from './state';

export type TargetRef =
  | { kind: 'self' }
  | { kind: 'enemy'; id: string }
  | { kind: 'room' };

export type Effect =
  | { kind: 'damage'; target: TargetRef; amount: number }
  | { kind: 'heal'; target: TargetRef; amount: number }
  | { kind: 'add_adjective'; target: TargetRef; adjective: AdjectiveId; turns: number | 'permanent' }
  | { kind: 'remove_adjective'; target: TargetRef; adjective: AdjectiveId }
  | { kind: 'gain_block'; amount: number }
  | { kind: 'reveal'; target: TargetRef }
  | { kind: 'queue_next_turn_bonus'; energy: number; draw: number }
  | { kind: 'discard_card'; cardId: CardId }
  | { kind: 'compel_skip'; target: TargetRef }
  | { kind: 'reshuffle_discard' }
  | { kind: 'log'; text: string };

export function applyEffects(state: GameState, effects: Effect[]): GameState {
  let next = state;
  for (const e of effects) {
    next = applyEffect(next, e);
  }
  return next;
}

function applyEffect(state: GameState, e: Effect): GameState {
  switch (e.kind) {
    case 'damage':           return applyDamage(state, e.target, e.amount);
    case 'heal':             return applyHeal(state, e.target, e.amount);
    case 'add_adjective':    return applyAddAdjective(state, e.target, e.adjective, e.turns);
    case 'remove_adjective': return applyRemoveAdjective(state, e.target, e.adjective);
    case 'gain_block':       return { ...state, player: { ...state.player, block: state.player.block + e.amount } };
    case 'reveal':           return applyReveal(state, e.target);
    case 'queue_next_turn_bonus':
      return {
        ...state,
        player: {
          ...state.player,
          nextTurnEnergyBonus: state.player.nextTurnEnergyBonus + e.energy,
          nextTurnDrawBonus: state.player.nextTurnDrawBonus + e.draw,
        },
      };
    case 'discard_card':     return applyDiscardCard(state, e.cardId);
    case 'compel_skip':      return applyCompelSkip(state, e.target);
    case 'reshuffle_discard': return applyReshuffleDiscard(state);
    case 'log':              return log(state, e.text);
  }
}

function log(state: GameState, text: string): GameState {
  return { ...state, log: [...state.log, { turn: state.turn, text }] };
}

// ---- damage / heal --------------------------------------------------------

export function damageMultiplier(adjs: AdjectiveInstance[]): { dealt: number; taken: number } {
  let dealt = 1;
  let taken = 1;
  for (const a of adjs) {
    if (a.id === 'WEAK')   dealt *= 0.5;
    if (a.id === 'STRONG') { dealt *= 1.5; taken *= 0.75; }
    if (a.id === 'BIG')    { dealt *= 1.25; taken *= 1.25; }
    if (a.id === 'SMALL')  dealt *= 0.75;
  }
  return { dealt, taken };
}

function applyDamage(state: GameState, target: TargetRef, baseAmount: number): GameState {
  if (target.kind === 'room') return log(state, 'damage to ROOM has no effect.');

  if (target.kind === 'self') {
    const mult = damageMultiplier(state.player.adjectives).taken;
    const incoming = Math.max(0, Math.round(baseAmount * mult) - state.player.block);
    const absorbed = baseAmount - incoming;
    const newPlayer: Player = {
      ...state.player,
      hp: Math.max(0, state.player.hp - incoming),
      block: Math.max(0, state.player.block - baseAmount),
    };
    const next: GameState = { ...state, player: newPlayer };
    const phaseAdvanced: GameState = newPlayer.hp <= 0 ? { ...next, phase: 'lost_run' } : next;
    return log(phaseAdvanced, `You take ${incoming} damage${absorbed > 0 ? ` (${absorbed} blocked)` : ''}.`);
  }

  // enemy
  const enemyIdx = state.enemies.findIndex((en) => en.id === target.id);
  if (enemyIdx < 0) return state;
  const enemy = state.enemies[enemyIdx];
  if (enemy === undefined) return state;

  const taken = damageMultiplier(enemy.adjectives).taken;
  const dmg = Math.max(0, Math.round(baseAmount * taken));
  const newHp = Math.max(0, enemy.hp - dmg);
  // FROZEN breaks on damage.
  const newAdjs = newHp > 0
    ? enemy.adjectives.filter((a) => a.id !== 'FROZEN')
    : enemy.adjectives;
  const updated: Enemy = { ...enemy, hp: newHp, adjectives: newAdjs };
  const enemies = [...state.enemies];
  enemies[enemyIdx] = updated;

  let next: GameState = log({ ...state, enemies }, `${enemy.displayName} takes ${dmg} damage.`);
  if (newHp === 0) next = log(next, `${enemy.displayName} is defeated.`);
  // Per-combat win is detected by the reducer (which transitions to 'reward'),
  // not here — applyDamage is also called by enemy attacks during their turn,
  // where overshooting the phase would skip reward setup.
  return next;
}

function applyHeal(state: GameState, target: TargetRef, amount: number): GameState {
  if (target.kind === 'self') {
    const healed = Math.min(state.player.maxHp - state.player.hp, amount);
    return log(
      { ...state, player: { ...state.player, hp: state.player.hp + healed } },
      `You heal ${healed} HP.`,
    );
  }
  if (target.kind === 'enemy') {
    const idx = state.enemies.findIndex((en) => en.id === target.id);
    const enemy = state.enemies[idx];
    if (enemy === undefined) return state;
    const healed = Math.min(enemy.maxHp - enemy.hp, amount);
    const enemies = [...state.enemies];
    enemies[idx] = { ...enemy, hp: enemy.hp + healed };
    return log({ ...state, enemies }, `${enemy.displayName} heals ${healed} HP.`);
  }
  return state;
}

// ---- adjectives -----------------------------------------------------------

function addAdjectiveToList(
  list: AdjectiveInstance[],
  adj: AdjectiveId,
  turns: number | 'permanent',
): { list: AdjectiveInstance[]; note: string } {
  // Check for cancellation against any existing adjective.
  for (let i = 0; i < list.length; i++) {
    const existing = list[i];
    if (existing === undefined) continue;
    const interaction = findInteraction(adj, existing.id);
    if (interaction === 'cancel') {
      const next = list.filter((_, j) => j !== i);
      return { list: next, note: `${adj} and ${existing.id} cancel.` };
    }
  }
  // Stack: if already present, refresh timer to the larger of the two.
  const existingIdx = list.findIndex((a) => a.id === adj);
  if (existingIdx >= 0) {
    const existing = list[existingIdx];
    if (existing === undefined) return { list, note: `${adj} applied.` };
    const next = [...list];
    const merged: AdjectiveInstance =
      existing.turns === 'permanent' || turns === 'permanent'
        ? { id: adj, turns: 'permanent' }
        : { id: adj, turns: Math.max(existing.turns, turns) };
    next[existingIdx] = merged;
    return { list: next, note: `${adj} refreshed.` };
  }
  return { list: [...list, { id: adj, turns }], note: `${adj} applied.` };
}

function applyAddAdjective(
  state: GameState,
  target: TargetRef,
  adj: AdjectiveId,
  turns: number | 'permanent',
): GameState {
  if (target.kind === 'self') {
    const r = addAdjectiveToList(state.player.adjectives, adj, turns);
    return log(
      { ...state, player: { ...state.player, adjectives: r.list } },
      `You: ${r.note}`,
    );
  }
  if (target.kind === 'enemy') {
    const idx = state.enemies.findIndex((en) => en.id === target.id);
    const enemy = state.enemies[idx];
    if (enemy === undefined) return state;
    const r = addAdjectiveToList(enemy.adjectives, adj, turns);
    const enemies = [...state.enemies];
    enemies[idx] = { ...enemy, adjectives: r.list };
    return log({ ...state, enemies }, `${enemy.displayName}: ${r.note}`);
  }
  return state;
}

function applyRemoveAdjective(state: GameState, target: TargetRef, adj: AdjectiveId): GameState {
  if (target.kind === 'self') {
    return {
      ...state,
      player: {
        ...state.player,
        adjectives: state.player.adjectives.filter((a) => a.id !== adj),
      },
    };
  }
  if (target.kind === 'enemy') {
    const idx = state.enemies.findIndex((en) => en.id === target.id);
    const enemy = state.enemies[idx];
    if (enemy === undefined) return state;
    const enemies = [...state.enemies];
    enemies[idx] = { ...enemy, adjectives: enemy.adjectives.filter((a) => a.id !== adj) };
    return { ...state, enemies };
  }
  return state;
}

// ---- reveal ---------------------------------------------------------------

function applyReveal(state: GameState, target: TargetRef): GameState {
  if (target.kind !== 'enemy') return state;
  const idx = state.enemies.findIndex((en) => en.id === target.id);
  const enemy = state.enemies[idx];
  if (enemy === undefined) return state;
  if (enemy.revealed) return state;
  const enemies = [...state.enemies];
  enemies[idx] = { ...enemy, revealed: true };
  return log({ ...state, enemies }, `You study ${enemy.displayName}.`);
}

// ---- compel ---------------------------------------------------------------

// Sets the target enemy's intent to 'wait' for the next enemy turn — they
// skip their attack. Has no effect on SELF / ROOM.
function applyCompelSkip(state: GameState, target: TargetRef): GameState {
  if (target.kind !== 'enemy') return state;
  const idx = state.enemies.findIndex((en) => en.id === target.id);
  const enemy = state.enemies[idx];
  if (enemy === undefined) return state;
  const enemies = [...state.enemies];
  enemies[idx] = { ...enemy, intent: { kind: 'wait' } };
  return { ...state, enemies };
}

// ---- card consumption -----------------------------------------------------

function applyDiscardCard(state: GameState, cardId: CardId): GameState {
  const cardIdx = state.hand.findIndex((c) => c.id === cardId);
  if (cardIdx < 0) return state;
  const card = state.hand[cardIdx];
  if (card === undefined) return state;
  const hand = state.hand.filter((_, i) => i !== cardIdx);
  return { ...state, hand, discard: [...state.discard, card] };
}

// Shuffles the discard pile back into the deck. Used by the
// REMEMBER EVERYTHING potion. No-op when there's nothing to recall.
function applyReshuffleDiscard(state: GameState): GameState {
  if (state.discard.length === 0) {
    return log(state, 'Nothing to remember — the discard pile is empty.');
  }
  const reshuffled = shuffle([...state.deck, ...state.discard], Math.random);
  return log(
    { ...state, deck: reshuffled, discard: [] },
    'You REMEMBER EVERYTHING — the discarded words flock back into your deck.',
  );
}

// ---- end-of-round ticks ---------------------------------------------------

export function tickAdjectives(adjs: AdjectiveInstance[]): { remaining: AdjectiveInstance[]; expired: AdjectiveId[] } {
  const remaining: AdjectiveInstance[] = [];
  const expired: AdjectiveId[] = [];
  for (const a of adjs) {
    if (a.turns === 'permanent') {
      remaining.push(a);
      continue;
    }
    const next = a.turns - 1;
    if (next <= 0) expired.push(a.id);
    else remaining.push({ id: a.id, turns: next });
  }
  return { remaining, expired };
}

export function burningDamage(adjs: AdjectiveInstance[]): number {
  return adjs.some((a) => a.id === 'BURNING') ? 2 : 0;
}

// Exported for the resolver — confirms an adjective ID is one we know about.
export function isKnownAdjective(id: string): id is AdjectiveId {
  return id in ADJECTIVES;
}

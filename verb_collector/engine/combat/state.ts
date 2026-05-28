import { AdjectiveId, NounId, VerbId } from '../types';

export type AdjectiveInstance = {
  id: AdjectiveId;
  turns: number | 'permanent';
};

export type CardId = string;

export type Card =
  | { id: CardId; kind: 'verb'; word: VerbId }
  | { id: CardId; kind: 'adjective'; word: AdjectiveId };

export type EnemyId = string;

export type EnemyIntentKind = 'attack' | 'wait' | 'spore' | 'thorns' | 'multiply' | 'reapply_big';

export type EnemyIntent =
  | { kind: 'attack'; damage: number }
  | { kind: 'wait' }
  | { kind: 'spore'; damage: number }
  | { kind: 'thorns' }
  | { kind: 'multiply' }
  | { kind: 'reapply_big' };

export type EnemyTrait = 'reflect_hit' | 'multiplies' | 'reapplies_big';

export type Enemy = {
  id: EnemyId;
  noun: NounId;
  displayName: string;
  hp: number;
  maxHp: number;
  attack: number;
  adjectives: AdjectiveInstance[];
  intent: EnemyIntent;
  revealed: boolean;
  turnsAlive: number;
  traits: EnemyTrait[];
};

export type Player = {
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  attack: number;
  block: number;
  adjectives: AdjectiveInstance[];
  nextTurnEnergyBonus: number;
  nextTurnDrawBonus: number;
};

export type Phase = 'combat' | 'reward' | 'won_run' | 'lost_run';

export type GameState = {
  phase: Phase;
  turn: number;

  // Run-level (persists across combats).
  permanentDeck: Card[];
  unlockedNouns: NounId[];
  combatsWon: number;
  runSentence: string;
  // Cards offered as the next reward (only meaningful in phase='reward').
  rewardOffered: VerbId[];

  // Combat-level (reset per combat).
  player: Player;
  enemies: Enemy[];
  hand: Card[];
  deck: Card[];
  discard: Card[];
  composing: string[];
  lastNounUsed: NounId | null;
  log: LogEntry[];

  // For UI: name of the current encounter, e.g. "A GOBLIN" or "A WOLF PACK".
  encounterName: string;
};

export type LogEntry = { turn: number; text: string };

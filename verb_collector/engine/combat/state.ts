import { AdjectiveId, NounId, VerbId } from '../types';

export type AdjectiveInstance = {
  id: AdjectiveId;
  // Turns remaining, or 'permanent' until something removes it.
  turns: number | 'permanent';
};

export type CardId = string;

export type Card =
  | { id: CardId; kind: 'verb'; word: VerbId }
  | { id: CardId; kind: 'adjective'; word: AdjectiveId };

export type EnemyId = string;

export type EnemyIntent =
  | { kind: 'attack'; damage: number }
  | { kind: 'wait' };

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
};

export type Player = {
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  attack: number;
  block: number;
  adjectives: AdjectiveInstance[];
  // Carry-over to next turn for the WAIT verb.
  nextTurnEnergyBonus: number;
  nextTurnDrawBonus: number;
};

export type Phase = 'combat' | 'win' | 'loss';

export type GameState = {
  phase: Phase;
  turn: number;
  player: Player;
  enemies: Enemy[];
  hand: Card[];
  deck: Card[];
  discard: Card[];
  composing: string[];
  lastNounUsed: NounId | null;
  log: LogEntry[];
};

export type LogEntry = { turn: number; text: string };

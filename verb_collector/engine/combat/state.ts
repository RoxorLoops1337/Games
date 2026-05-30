import { AdjectiveId, NounId, VerbId } from '../types';
import { RelicId } from '../relics/relics';
import { PotionId } from '../potions/potions';
import { SceneOffer } from '../run/scenes';

export type AdjectiveInstance = {
  id: AdjectiveId;
  turns: number | 'permanent';
};

export type CardId = string;

export type Card =
  | { id: CardId; kind: 'verb'; word: VerbId; costOverride?: number; upgraded?: boolean }
  | { id: CardId; kind: 'adjective'; word: AdjectiveId };

export type EnemyId = string;

export type EnemyIntentKind = 'attack' | 'wait' | 'spore' | 'thorns' | 'multiply' | 'reapply_big' | 'reapply_big_to_partner' | 'double_attack';

export type EnemyIntent =
  | { kind: 'attack'; damage: number }
  | { kind: 'double_attack'; damage: number }
  | { kind: 'wait' }
  | { kind: 'spore'; damage: number }
  | { kind: 'thorns' }
  | { kind: 'multiply' }
  | { kind: 'reapply_big' }
  | { kind: 'reapply_big_to_partner' };

export type EnemyTrait =
  | 'reflect_hit'
  | 'multiplies'
  | 'reapplies_big'
  | 'honor';  // Green Knight: damage only counts when announced via LOOK/NAME

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
  // Honor mechanic: combat turn at which HONOR ends and the boss starts
  // attacking twice per round. Only meaningful when traits includes 'honor'.
  honorEndsAfterTurn?: number;
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

export type Phase =
  | 'title'
  | 'map'
  | 'combat'
  | 'reward'
  | 'shop'
  | 'shrine'
  | 'fire'
  | 'mirror'
  | 'won_run'
  | 'lost_run';

export type GameState = {
  phase: Phase;
  turn: number;

  // Run-level (persists across combats / scenes).
  permanentDeck: Card[];
  unlockedNouns: NounId[];
  combatsWon: number;            // legacy field — kept for back-compat with the rewards UI
  runSentence: string;
  rewardOffered: VerbId[];
  ink: number;
  relics: RelicId[];
  relicState: Record<string, Record<string, unknown>>;
  potions: Array<PotionId | null>;  // fixed-length array of 3 slots
  // Map state.
  sceneIndex: number;            // 0-based progress through the 8-node run
  sceneOptions: SceneOffer[];    // 3 offers the player currently picks from
  peekedScene: SceneOffer[] | null;  // single peek-ahead via ink action
  hideNext: boolean;             // HIDE ink action: skip next scene

  // Combat-level (reset per combat).
  player: Player;
  enemies: Enemy[];
  hand: Card[];
  deck: Card[];
  discard: Card[];
  composing: string[];
  lastNounUsed: NounId | null;
  log: LogEntry[];
  // Nouns the player is holding — populated by GRAB, consumed by THROW or by
  // WITH-instrument tails. Capped at 3. Reset per combat.
  inventory: NounId[];
  // BLOCK AGAINST <enemy> sets this; the next attack from that enemy is
  // fully prevented and the flag clears. Reset per combat.
  blockAgainst: EnemyId | null;
  // Targets the player has announced this turn (via LOOK / NAME). Used by
  // the Green Knight HONOR mechanic — without an announcement the boss takes
  // 0 damage during the protected turns.
  announcedThisTurn: EnemyId[];

  // For UI: name of the current encounter, e.g. "A GOBLIN" or "A WOLF PACK".
  encounterName: string;
};

export type LogEntry = { turn: number; text: string };

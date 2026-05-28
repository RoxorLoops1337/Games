import { NounId } from '../types';
import { Enemy } from './state';

// v0 only spawns Goblin. Other Act 1 enemies have entries here for when
// they're wired into the run-map; they're not selected yet.
export interface EnemyTemplate {
  noun: NounId;
  displayName: string;
  maxHp: number;
  attack: number;
  startingAdjectives?: NonNullable<Enemy['adjectives']>;
}

export const ENEMY_TEMPLATES: Record<string, EnemyTemplate> = {
  GOBLIN: {
    noun: 'GOBLIN',
    displayName: 'A GOBLIN',
    maxHp: 10,
    attack: 3,
  },
  WOLF: {
    noun: 'WOLF',
    displayName: 'A WOLF',
    maxHp: 8,
    attack: 5,
    startingAdjectives: [{ id: 'FAST', turns: 'permanent' }],
  },
  MUSHROOM: {
    noun: 'MUSHROOM',
    displayName: 'A MUSHROOM',
    maxHp: 15,
    attack: 0,
  },
  TREE: {
    noun: 'TREE',
    displayName: 'A TREE',
    maxHp: 25,
    attack: 2,
  },
  THORN: {
    noun: 'THORN',
    displayName: 'A THORN',
    maxHp: 12,
    attack: 0,
  },
};

let enemyCounter = 0;

export function spawnEnemy(templateKey: keyof typeof ENEMY_TEMPLATES): Enemy {
  const t = ENEMY_TEMPLATES[templateKey];
  if (t === undefined) throw new Error(`unknown enemy template: ${templateKey}`);
  enemyCounter++;
  return {
    id: `${templateKey}_${enemyCounter}`,
    noun: t.noun,
    displayName: t.displayName,
    hp: t.maxHp,
    maxHp: t.maxHp,
    attack: t.attack,
    adjectives: t.startingAdjectives ? [...t.startingAdjectives] : [],
    intent: { kind: 'attack', damage: t.attack },
    revealed: false,
  };
}

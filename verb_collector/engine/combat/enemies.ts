import { NounId } from '../types';
import { AdjectiveInstance, Enemy, EnemyTrait } from './state';

export interface EnemyTemplate {
  noun: NounId;
  displayName: string;
  maxHp: number;
  attack: number;
  startingAdjectives?: AdjectiveInstance[];
  traits?: EnemyTrait[];
}

export const ENEMY_TEMPLATES: Record<string, EnemyTemplate> = {
  GOBLIN: {
    noun: 'GOBLIN',
    displayName: 'A GOBLIN',
    maxHp: 10,
    attack: 3,
    traits: ['multiplies'],
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
    attack: 2,
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
    traits: ['reflect_hit'],
  },
  BIG_GOBLIN: {
    noun: 'BIG_GOBLIN',
    displayName: 'A BIG GOBLIN',
    maxHp: 25,
    attack: 6,
    startingAdjectives: [{ id: 'BIG', turns: 'permanent' }],
    traits: ['reapplies_big'],
  },
  GREEN_KNIGHT: {
    noun: 'GREEN_KNIGHT',
    displayName: 'THE GREEN KNIGHT',
    maxHp: 60,
    attack: 8,
    traits: ['honor'],
  },
  GOBLIN_SHAMAN: {
    noun: 'GOBLIN_SHAMAN',
    displayName: 'A GOBLIN SHAMAN',
    maxHp: 8,
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
    intent: chooseInitialIntent(templateKey, t),
    revealed: false,
    turnsAlive: 0,
    traits: t.traits ? [...t.traits] : [],
  };
}

function chooseInitialIntent(key: string, t: EnemyTemplate): Enemy['intent'] {
  if (key === 'MUSHROOM') return { kind: 'spore', damage: t.attack };
  if (key === 'THORN')    return { kind: 'thorns' };
  if (key === 'GOBLIN_SHAMAN') return { kind: 'reapply_big_to_partner' };
  return { kind: 'attack', damage: t.attack };
}

// Picks the next intent for an enemy based on its template + turnsAlive.
// Goblin shifts to MULTIPLY on its 3rd turn alive (if not killed); Big Goblin
// alternates attack/reapply_big.
export function chooseNextIntent(enemy: Enemy): Enemy['intent'] {
  if (enemy.noun === 'GOBLIN') {
    if (enemy.turnsAlive >= 2) return { kind: 'multiply' };
    return { kind: 'attack', damage: enemy.attack };
  }
  if (enemy.noun === 'MUSHROOM') return { kind: 'spore', damage: enemy.attack };
  if (enemy.noun === 'THORN')    return { kind: 'thorns' };
  if (enemy.noun === 'BIG_GOBLIN') {
    if (enemy.turnsAlive % 2 === 1) return { kind: 'reapply_big' };
    return { kind: 'attack', damage: enemy.attack };
  }
  if (enemy.noun === 'GOBLIN_SHAMAN') {
    // Rotate between casting BIG on its partner and resting.
    if (enemy.turnsAlive % 2 === 1) return { kind: 'wait' };
    return { kind: 'reapply_big_to_partner' };
  }
  return { kind: 'attack', damage: enemy.attack };
}

export function intentLabel(intent: Enemy['intent']): string {
  switch (intent.kind) {
    case 'attack':         return `attack ${intent.damage}`;
    case 'double_attack':  return `attack ${intent.damage} ×2`;
    case 'wait':           return 'wait';
    case 'spore':          return `spore burst ${intent.damage}`;
    case 'thorns':         return 'reflects HIT';
    case 'multiply':       return 'multiply';
    case 'reapply_big':    return 'reapply BIG';
    case 'reapply_big_to_partner': return 'cast BIG on partner';
  }
}

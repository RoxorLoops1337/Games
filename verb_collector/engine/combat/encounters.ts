import { ENEMY_TEMPLATES } from './enemies';

export interface Encounter {
  name: string;
  enemies: Array<keyof typeof ENEMY_TEMPLATES>;
  difficulty: 'normal' | 'elite' | 'boss';
}

export const NORMAL_ENCOUNTERS: Encounter[] = [
  { name: 'A GOBLIN',              enemies: ['GOBLIN'],             difficulty: 'normal' },
  { name: 'TWO GOBLINS',           enemies: ['GOBLIN', 'GOBLIN'],    difficulty: 'normal' },
  { name: 'A WOLF',                enemies: ['WOLF'],                difficulty: 'normal' },
  { name: 'A MUSHROOM',            enemies: ['MUSHROOM'],            difficulty: 'normal' },
  { name: 'A TREE',                enemies: ['TREE'],                difficulty: 'normal' },
  { name: 'A THORN',               enemies: ['THORN'],               difficulty: 'normal' },
  { name: 'A MUSHROOM AND A TREE', enemies: ['MUSHROOM', 'TREE'],    difficulty: 'normal' },
  { name: 'A WOLF AND A THORN',    enemies: ['WOLF', 'THORN'],       difficulty: 'normal' },
];

export const ELITE_ENCOUNTERS: Encounter[] = [
  { name: 'A BIG GOBLIN',          enemies: ['BIG_GOBLIN'],          difficulty: 'elite' },
];

export const BOSS_ENCOUNTERS: Encounter[] = [
  { name: 'THE GREEN KNIGHT',      enemies: ['GREEN_KNIGHT'],        difficulty: 'boss' },
];

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

export function pickEncounter(combatsWon: number, rng: () => number): Encounter {
  // Simple pacing for v0: first 3 are normals, 4th is elite, 5th is boss.
  if (combatsWon === 4) {
    const pool = BOSS_ENCOUNTERS;
    return pool[Math.floor(rng() * pool.length)]!;
  }
  if (combatsWon === 3) {
    const pool = ELITE_ENCOUNTERS;
    return pool[Math.floor(rng() * pool.length)]!;
  }
  const pool = NORMAL_ENCOUNTERS;
  return pool[Math.floor(rng() * pool.length)]!;
}

export const RUN_LENGTH = 5; // total combats per run before "won_run"

import { VerbId } from '../types';
import { Encounter } from './encounters';

// Pool of verbs offered as combat rewards. Adds depth: starter players will
// see BURN, BLOCK, etc. that aren't in the Wanderer deck. Skipping is
// deliberate per the doc — these come from rewards or the merchant.
const COMMON_REWARD_POOL: VerbId[] = [
  'HIT', 'BURN', 'BLOCK', 'BREAK', 'FREEZE', 'HEAL', 'PUSH', 'WAIT',
];

const RARE_REWARD_POOL: VerbId[] = [
  'BURN', 'BREAK', 'FREEZE', 'HEAL',
];

// For an elite, swap in rarer offerings.
export function generateReward(encounter: Encounter, rng: () => number): VerbId[] {
  const pool = encounter.difficulty === 'elite' || encounter.difficulty === 'boss'
    ? RARE_REWARD_POOL
    : COMMON_REWARD_POOL;
  return pickN(pool, 3, rng);
}

function pickN<T>(pool: readonly T[], n: number, rng: () => number): T[] {
  const remaining = [...pool];
  const out: T[] = [];
  for (let i = 0; i < n && remaining.length > 0; i++) {
    const idx = Math.floor(rng() * remaining.length);
    const picked = remaining.splice(idx, 1)[0];
    if (picked !== undefined) out.push(picked);
  }
  return out;
}

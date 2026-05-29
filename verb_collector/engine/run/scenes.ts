// Scene generation for the Act 1 run-map.
//
// The map is 8 nodes long. At each node the player picks one of three offers.
// Nodes 1-6 are mixed (normal combats + non-combat rests). Node 7 is the
// forced elite (Big Goblin). Node 8 is the forced boss (Green Knight).

import { Encounter, ELITE_ENCOUNTERS, NORMAL_ENCOUNTERS, BOSS_ENCOUNTERS } from '../combat/encounters';

export type SceneKind =
  | 'combat_normal'
  | 'combat_elite'
  | 'combat_boss'
  | 'shop'
  | 'shrine'
  | 'fire'
  | 'mirror';

export interface SceneOffer {
  kind: SceneKind;
  // Sentence fragment used in the map UI ("A GOBLIN", "A MERCHANT", ...).
  label: string;
  // For combat scenes only.
  encounter?: Encounter;
}

export const RUN_LENGTH = 8;

type NonCombatKind = 'shop' | 'shrine' | 'fire' | 'mirror';
const NON_COMBAT_KINDS: NonCombatKind[] = ['shop', 'shrine', 'fire', 'mirror'];
const NON_COMBAT_LABEL: Record<NonCombatKind, string> = {
  shop:   'A MERCHANT',
  shrine: 'A SHRINE',
  fire:   'A CAMPFIRE',
  mirror: 'A MIRROR',
};

function pickNonCombat(arr: readonly NonCombatKind[], rng: () => number): NonCombatKind {
  return arr[Math.floor(rng() * arr.length)]!;
}

function pickOne<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function combatOffer(encounter: Encounter): SceneOffer {
  return {
    kind: encounter.difficulty === 'boss'
      ? 'combat_boss'
      : encounter.difficulty === 'elite'
      ? 'combat_elite'
      : 'combat_normal',
    label: encounter.name,
    encounter,
  };
}

function nonCombatOffer(kind: NonCombatKind): SceneOffer {
  return { kind, label: NON_COMBAT_LABEL[kind] };
}

// Produces a fresh set of 3 scene offers for the given node index.
// - Node index 6 (0-based): forced elite (single offer)
// - Node index 7 (0-based): forced boss (single offer)
// - Otherwise: 2 normal combats + 1 random non-combat.
export function generateSceneOffers(sceneIndex: number, rng: () => number): SceneOffer[] {
  if (sceneIndex >= RUN_LENGTH - 1) {
    return [combatOffer(pickOne(BOSS_ENCOUNTERS, rng))];
  }
  if (sceneIndex === RUN_LENGTH - 2) {
    return [combatOffer(pickOne(ELITE_ENCOUNTERS, rng))];
  }
  // Mixed offers. Bias by node:
  //  - 1st few nodes: more combat
  //  - mid nodes: more variety
  //  - last regular node before elite: include a fire
  const offers: SceneOffer[] = [];

  // Always at least one combat
  const combats = sampleWithoutReplacement(NORMAL_ENCOUNTERS, 2, rng);
  offers.push(combatOffer(combats[0]!));

  // A second offer: chance of another combat or a non-combat
  const variety = sceneIndex >= 1 ? 0.7 : 0.3;
  if (rng() < variety) {
    offers.push(nonCombatOffer(pickNonCombat(NON_COMBAT_KINDS, rng)));
  } else {
    offers.push(combatOffer(combats[1]!));
  }

  // Third offer: prefer non-combat to vary the pacing
  const remainingNonCombat: typeof NON_COMBAT_KINDS = NON_COMBAT_KINDS.filter(
    k => !offers.some(o => o.kind === k),
  );
  if (remainingNonCombat.length > 0 && rng() < 0.8) {
    offers.push(nonCombatOffer(pickNonCombat(remainingNonCombat, rng)));
  } else {
    const more = sampleWithoutReplacement(NORMAL_ENCOUNTERS, 1, rng);
    offers.push(combatOffer(more[0]!));
  }

  // Last regular node before the elite — make sure a fire is available
  // so the player can heal up.
  if (sceneIndex === RUN_LENGTH - 3 && !offers.some(o => o.kind === 'fire')) {
    offers[offers.length - 1] = nonCombatOffer('fire');
  }

  return offers;
}

function sampleWithoutReplacement<T>(pool: readonly T[], n: number, rng: () => number): T[] {
  const remaining = [...pool];
  const out: T[] = [];
  for (let i = 0; i < n && remaining.length > 0; i++) {
    const idx = Math.floor(rng() * remaining.length);
    out.push(remaining.splice(idx, 1)[0]!);
  }
  return out;
}

// Used by the UI: a verb-phrase fragment for the run-sentence string after
// the player picks an offer. "AND FOUGHT A GOBLIN", "AND RESTED BY A CAMPFIRE", etc.
export function runSentenceFragment(offer: SceneOffer, isFinal: boolean): string {
  if (isFinal) {
    return `, AND FACED ${offer.label}`;
  }
  switch (offer.kind) {
    case 'combat_normal':
    case 'combat_elite':
    case 'combat_boss':
      return `, AND FOUGHT ${offer.label}`;
    case 'shop':   return `, AND VISITED ${offer.label}`;
    case 'shrine': return `, AND KNELT AT ${offer.label}`;
    case 'fire':   return `, AND RESTED BY ${offer.label}`;
    case 'mirror': return `, AND PEERED INTO ${offer.label}`;
  }
}

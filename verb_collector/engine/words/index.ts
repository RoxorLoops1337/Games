import {
  AdjectiveId,
  ConnectorId,
  NounId,
  VerbId,
  Word,
  WordKind,
} from '../types';
import { ADJECTIVES } from './adjectives';
import { CONNECTORS } from './connectors';
import { NOUNS } from './nouns';
import { VERBS } from './verbs';

export { VERBS } from './verbs';
export { NOUNS } from './nouns';
export { ADJECTIVES, ADJECTIVE_INTERACTIONS, findInteraction } from './adjectives';
export type { AdjectiveInteraction, InteractionResult } from './adjectives';
export { CONNECTORS, STARTER_CONNECTORS } from './connectors';

// Resolves an uppercase token to the matching Word definition, or null. Used
// by the parser to classify each token in a composed sentence. Non-addressable
// nouns (multi-word drops like BIG GOBLIN) are intentionally skipped so the
// parser can't reference them yet.
export function lookup(token: string): Word | null {
  const t = token.toUpperCase();
  if (t in VERBS)      return VERBS[t as VerbId];
  if (t in NOUNS) {
    const n = NOUNS[t as NounId];
    return n.addressable ? n : null;
  }
  if (t in ADJECTIVES) return ADJECTIVES[t as AdjectiveId];
  if (t in CONNECTORS) return CONNECTORS[t as ConnectorId];
  return null;
}

export function wordKind(token: string): WordKind | null {
  return lookup(token)?.kind ?? null;
}

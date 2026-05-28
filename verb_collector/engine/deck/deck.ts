import { AdjectiveId, VerbId } from '../types';
import { Card } from '../combat/state';

let cardCounter = 0;
function nextId(prefix: string): string {
  cardCounter++;
  return `${prefix}_${cardCounter}`;
}

function verb(id: VerbId, n: number): Card[] {
  return Array.from({ length: n }, () => ({ id: nextId(id), kind: 'verb', word: id }));
}

function adj(id: AdjectiveId, n: number): Card[] {
  return Array.from({ length: n }, () => ({ id: nextId(id), kind: 'adjective', word: id }));
}

// The Wanderer's 10-card starter deck per the design doc.
export function wandererStarterDeck(): Card[] {
  return [
    ...verb('WALK', 2),
    ...verb('LOOK', 2),
    ...verb('HIT', 3),
    ...verb('GRAB', 1),
    ...verb('MAKE', 2),
    ...adj('WEAK', 1),
    ...adj('STRONG', 1),
  ];
}

// Mulberry32 — small deterministic PRNG so we can seed for replays / tests.
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const ai = a[i];
    const aj = a[j];
    if (ai === undefined || aj === undefined) continue;
    a[i] = aj;
    a[j] = ai;
  }
  return a;
}

// Draws `n` cards. If the deck runs out, shuffles the discard back in.
export function drawCards(
  deck: Card[],
  discard: Card[],
  n: number,
  rng: () => number,
): { drawn: Card[]; deck: Card[]; discard: Card[] } {
  let workingDeck = deck;
  let workingDiscard = discard;
  const drawn: Card[] = [];
  for (let i = 0; i < n; i++) {
    if (workingDeck.length === 0) {
      if (workingDiscard.length === 0) break;
      workingDeck = shuffle(workingDiscard, rng);
      workingDiscard = [];
    }
    const top = workingDeck[0];
    if (top === undefined) break;
    drawn.push(top);
    workingDeck = workingDeck.slice(1);
  }
  return { drawn, deck: workingDeck, discard: workingDiscard };
}

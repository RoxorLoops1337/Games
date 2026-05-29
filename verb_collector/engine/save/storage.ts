// LocalStorage persistence. Versioned blob so future shape changes can
// invalidate rather than crash. The save key is intentionally per-version
// so old saves don't collide.

import { GameState } from '../combat/state';

const SAVE_VERSION = 1;
const SAVE_KEY = `verb_collector:save:v${SAVE_VERSION}`;
const META_KEY = `verb_collector:meta:v${SAVE_VERSION}`;

interface SaveBlob {
  version: number;
  savedAt: number;
  state: GameState;
}

interface MetaBlob {
  version: number;
  runs: number;
  wins: number;
  bestSentenceLength: number;
  wordsCollectedEver: string[];
}

const defaultMeta: MetaBlob = {
  version: SAVE_VERSION,
  runs: 0,
  wins: 0,
  bestSentenceLength: 0,
  wordsCollectedEver: [],
};

// ---- Save ----------------------------------------------------------------

export function saveState(state: GameState): void {
  if (typeof localStorage === 'undefined') return;
  // Title screen and end-of-run screens don't need persistence — the latter
  // gets a chance to update meta in finalizeRun() below, and we don't want
  // to overwrite a juicy mid-run save with a "you just won" screen blob.
  if (state.phase === 'title') return;
  try {
    const blob: SaveBlob = {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      state,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
  } catch {
    // Quota / privacy mode / etc. — fail silently; gameplay continues.
  }
}

export function loadState(): GameState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw) as SaveBlob;
    if (blob.version !== SAVE_VERSION) return null;
    return blob.state;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(SAVE_KEY); } catch { /* noop */ }
}

export function hasSave(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try { return localStorage.getItem(SAVE_KEY) !== null; } catch { return false; }
}

// ---- Meta progression ----------------------------------------------------

export function loadMeta(): MetaBlob {
  if (typeof localStorage === 'undefined') return { ...defaultMeta };
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return { ...defaultMeta };
    const blob = JSON.parse(raw) as MetaBlob;
    if (blob.version !== SAVE_VERSION) return { ...defaultMeta };
    return blob;
  } catch {
    return { ...defaultMeta };
  }
}

function saveMeta(meta: MetaBlob): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* noop */ }
}

// Called by the reducer when a run ends — bumps run/win counters and tracks
// the longest sentence ever composed in this run.
export function finalizeRun(args: { won: boolean; longestSentence: number; collectedWords: string[] }): void {
  const meta = loadMeta();
  meta.runs += 1;
  if (args.won) meta.wins += 1;
  if (args.longestSentence > meta.bestSentenceLength) meta.bestSentenceLength = args.longestSentence;
  const merged = new Set([...meta.wordsCollectedEver, ...args.collectedWords]);
  meta.wordsCollectedEver = [...merged];
  saveMeta(meta);
}

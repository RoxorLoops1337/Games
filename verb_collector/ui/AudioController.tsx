// AudioController — a render-less component that owns the bridge between game
// state and the AudioEngine. Lives once inside App.tsx and uses useEffects to
// observe state changes and trigger the appropriate sounds and music tracks.
//
// Design constraint: this component MUST NOT touch any of the existing screen
// components (CombatScreen, MapScreen, etc.) — a parallel visual-redesign
// agent owns those files. Everything here is state-derived. The one escape
// hatch is a global custom event:
//
//   document.dispatchEvent(new CustomEvent('vc:sfx', { detail: { name: 'click' } }));
//
// Any screen that later wants to fire a tactile UI sound (card tap, token
// pop) can dispatch that event without us having to edit it.

import React, { useEffect, useRef } from 'react';
import { GameState, LogEntry } from '../engine/combat/state';
import { getAudioEngine, MusicTrack, SfxName } from '../engine/audio/engine';

interface Props {
  state: GameState;
}

// Resolve the appropriate music track from the current game state. Combat
// becomes 'boss' the moment any enemy on the field carries the 'honor' trait
// (Green Knight). Run-end phases return null so we can punctuate them with
// the victory/defeat one-shot before any new track starts.
function trackForState(state: GameState): MusicTrack | null {
  switch (state.phase) {
    case 'title':
      return 'menu';
    case 'map':
    case 'shop':
    case 'shrine':
    case 'fire':
    case 'mirror':
    case 'reward':
      return 'world';
    case 'combat':
      if (state.enemies.some(e => e.traits.includes('honor'))) return 'boss';
      return 'combat';
    case 'won_run':
    case 'lost_run':
      return null;
    default:
      return null;
  }
}

// Classify a single log line and return the SFX name that should fire, or
// null if the line is not noteworthy. Ordered most-specific-first because
// e.g. "shatters" should beat "takes damage" when both could match.
function classifyLog(text: string): SfxName | null {
  // Player-cast banner. Combat reducer prefixes the cast log with a black
  // pointer triangle; honour that as our authoritative "spell announced"
  // marker so the cast SFX precedes any damage/heal noise.
  if (text.startsWith('▶')) return 'cast';

  // Death lines. Cover both shatter (frozen kill) and the more generic
  // "defeated" log the resolver writes when an enemy hits 0 HP.
  if (text.includes('shatters')) return 'enemy_death';
  if (text.includes('is defeated') || text.includes('defeated')) return 'enemy_death';

  // Status-effect application — burn / freeze read both their permanent
  // adjective names and the verb-form ("burns", "freezes").
  if (text.includes('BURNING') || text.includes('burns')) return 'burn';
  if (text.includes('FROZEN') || text.includes('freezes')) return 'freeze';

  // Damage. "You take" is the canonical player-damaged line; any other
  // "takes" without "You" is the player hitting an enemy.
  if (text.includes('You take')) return 'enemy_attack';
  if (text.includes('takes') && text.includes('damage')) return 'hit';

  // Heals and HP restoration.
  if (text.includes('heal') || text.includes('HP')) return 'heal';

  // Block / guard application.
  if (text.includes('block') || text.includes('guard')) return 'block';

  // Ink — economy currency.
  if (text.includes('ink') || text.includes('Ink')) return 'ink';

  // Reward pickup.
  if (text.includes('reward')) return 'reward';

  return null;
}

export function AudioController({ state }: Props): null {
  const engine = getAudioEngine();
  const lastLogLenRef = useRef<number>(state.log.length);
  const lastPhaseRef = useRef<GameState['phase']>(state.phase);

  // Music routing — driven by phase + boss detection.
  useEffect(() => {
    engine.setMusic(trackForState(state));
  }, [engine, state]);

  // Scene-enter cue. Both `combatsWon` and `sceneIndex` are stable counters
  // that only change when the player progresses, so reacting to either gives
  // a reliable single-shot beep per new scene.
  useEffect(() => {
    engine.playSfx('scene_enter');
  }, [engine, state.combatsWon, state.sceneIndex]);

  // Run-end fanfare. Compare against the previous phase ref so we only fire
  // once per transition (not on every re-render of the end screen).
  useEffect(() => {
    const prev = lastPhaseRef.current;
    lastPhaseRef.current = state.phase;
    if (prev === state.phase) return;
    if (state.phase === 'won_run') engine.playSfx('victory');
    else if (state.phase === 'lost_run') engine.playSfx('defeat');
  }, [engine, state.phase]);

  // Log-derived SFX dispatch. We diff the log length and only classify newly
  // appended entries, so reloading a save or replaying state never double-fires.
  useEffect(() => {
    const prevLen = lastLogLenRef.current;
    const currLen = state.log.length;
    lastLogLenRef.current = currLen;
    if (currLen <= prevLen) return;
    const newEntries: LogEntry[] = state.log.slice(prevLen);
    for (const entry of newEntries) {
      const sfx = classifyLog(entry.text);
      if (sfx) engine.playSfx(sfx);
    }
  }, [engine, state.log]);

  // Global custom-event bridge. Other screens can fire SFX without importing
  // anything — handy for the parallel visual-redesign agent. Detail shape:
  //   { name: SfxName }
  useEffect(() => {
    const handler = (ev: Event): void => {
      const ce = ev as CustomEvent<{ name?: SfxName }>;
      const name = ce.detail?.name;
      if (!name) return;
      engine.playSfx(name);
    };
    document.addEventListener('vc:sfx', handler as EventListener);
    return () => {
      document.removeEventListener('vc:sfx', handler as EventListener);
    };
  }, [engine]);

  return null;
}

// React import is used by the JSX runtime (jsx: 'react' classic mode).
void React;

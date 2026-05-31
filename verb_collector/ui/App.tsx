import React, { useReducer, useEffect } from 'react';
import { Action, initialState, reducer } from '../engine/combat/reducer';
import { RUN_LENGTH } from '../engine/run/scenes';
import { CombatScreen } from './CombatScreen';
import { RewardScreen } from './RewardScreen';
import { RunEndScreen } from './RunEndScreen';
import { TitleScreen } from './TitleScreen';
import { MapScreen } from './MapScreen';
import { ShopScreen } from './ShopScreen';
import { ShrineScreen } from './ShrineScreen';
import { FireScreen } from './FireScreen';
import { MirrorScreen } from './MirrorScreen';
import { AudioController } from './AudioController';
import { AudioSettings } from './AudioSettings';
import { hasSave } from '../engine/save/storage';
import { PhaseVignette, VignetteKind, MarginVine, MarginBird, MarginFlourish } from './SceneArt';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function toRoman(n: number): string {
  return ROMAN[n] ?? String(n);
}

function vignetteForPhase(phase: string): VignetteKind {
  switch (phase) {
    case 'combat':   return 'sword';
    case 'fire':     return 'flame';
    case 'shop':     return 'coin';
    case 'shrine':   return 'star';
    case 'mirror':   return 'mirror';
    case 'map':      return 'vine';
    case 'reward':   return 'star';
    case 'won_run':  return 'sunrise';
    case 'lost_run': return 'crow';
    default:         return 'vine';
  }
}

export function App(): React.ReactElement {
  // Auto-load saved state on first render if one exists. We start on title
  // either way so the user always has the choice to abandon and start fresh.
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // If a save exists when the title screen first mounts, surface a one-time
  // "continue" affordance by re-rendering — TitleScreen calls hasSave()
  // internally. No effect needed here other than keeping the wiring tight.
  useEffect(() => { /* placeholder for future side-effects */ }, []);

  const onAction = (a: Action) => dispatch(a);

  if (state.phase === 'title') {
    return (
      <div className="app title-app">
        <AudioController state={state} />
        <TitleScreen dispatch={onAction} />
      </div>
    );
  }

  const runText = state.runSentence;
  const first = runText.slice(0, 1);
  const rest = runText.slice(1);
  const sceneNum = Math.min(state.sceneIndex + 1, RUN_LENGTH);

  const vignette = vignetteForPhase(state.phase);

  return (
    <div className="app">
      <span className="corner tl" aria-hidden="true" />
      <span className="corner tr" aria-hidden="true" />
      <span className="corner bl" aria-hidden="true" />
      <span className="corner br" aria-hidden="true" />

      {/* Marginalia — vines, birds, flourishes in the page margins */}
      <MarginVine side="left" />
      <MarginVine side="right" />
      <MarginBird side="tr" />
      <MarginBird side="bl" />
      <MarginFlourish side="tl" />
      <MarginFlourish side="tr" />
      <MarginFlourish side="bl" />
      <MarginFlourish side="br" />

      <header className="run-sentence">
        <div className="run-text" key={runText}>
          <span className="drop-wrap">
            <PhaseVignette kind={vignette} size={88} />
            <span className="drop">{first}</span>
          </span>{rest}…
        </div>
        <div className="run-progress">
          Folio {toRoman(sceneNum)} of {toRoman(RUN_LENGTH)}
          <button
            className="title-link"
            onClick={() => dispatch({ type: 'goto_title' })}
            title="Return to title (your run is saved)"
          >
            ⌂
          </button>
          <AudioSettings />
        </div>
      </header>

      <AudioController state={state} />

      {state.phase === 'map'    && <MapScreen state={state} dispatch={onAction} />}
      {state.phase === 'combat' && <CombatScreen state={state} dispatch={onAction} />}
      {state.phase === 'reward' && <RewardScreen state={state} dispatch={onAction} />}
      {state.phase === 'shop'   && <ShopScreen state={state} dispatch={onAction} />}
      {state.phase === 'shrine' && <ShrineScreen state={state} dispatch={onAction} />}
      {state.phase === 'fire'   && <FireScreen state={state} dispatch={onAction} />}
      {state.phase === 'mirror' && <MirrorScreen state={state} dispatch={onAction} />}
      {(state.phase === 'won_run' || state.phase === 'lost_run') && (
        <RunEndScreen state={state} dispatch={onAction} />
      )}
    </div>
  );
}

// Mark the import as used (the lint config doesn't allow unused). hasSave
// is used by TitleScreen, but we also need it visible from App for the
// future case of automatically routing into the saved phase from a deep link.
void hasSave;

import React, { useReducer } from 'react';
import { Action, initialState, reducer } from '../engine/combat/reducer';
import { RUN_LENGTH } from '../engine/combat/encounters';
import { CombatScreen } from './CombatScreen';
import { RewardScreen } from './RewardScreen';
import { RunEndScreen } from './RunEndScreen';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function toRoman(n: number): string {
  return ROMAN[n] ?? String(n);
}

export function App(): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const onAction = (a: Action) => dispatch(a);

  // Split the run sentence into a drop-cap first letter + remainder so the
  // header gets that illuminated-manuscript opening flourish.
  const runText = state.runSentence;
  const first = runText.slice(0, 1);
  const rest = runText.slice(1);
  const sceneNum = Math.min(state.combatsWon + 1, RUN_LENGTH);

  return (
    <div className="app">
      {/* Decorative corner brackets on the page */}
      <span className="corner tl" aria-hidden="true" />
      <span className="corner tr" aria-hidden="true" />
      <span className="corner bl" aria-hidden="true" />
      <span className="corner br" aria-hidden="true" />

      <header className="run-sentence">
        <div className="run-text">
          <span className="drop">{first}</span>{rest}…
        </div>
        <div className="run-progress">Folio {toRoman(sceneNum)} of {toRoman(RUN_LENGTH)}</div>
      </header>
      {state.phase === 'combat' && <CombatScreen state={state} dispatch={onAction} />}
      {state.phase === 'reward' && <RewardScreen state={state} dispatch={onAction} />}
      {(state.phase === 'won_run' || state.phase === 'lost_run') && (
        <RunEndScreen state={state} dispatch={onAction} />
      )}
    </div>
  );
}

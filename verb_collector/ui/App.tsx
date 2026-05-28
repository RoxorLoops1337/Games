import React, { useReducer } from 'react';
import { Action, initialState, reducer } from '../engine/combat/reducer';
import { RUN_LENGTH } from '../engine/combat/encounters';
import { CombatScreen } from './CombatScreen';
import { RewardScreen } from './RewardScreen';
import { RunEndScreen } from './RunEndScreen';

export function App(): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const onAction = (a: Action) => dispatch(a);

  return (
    <div className="app">
      <header className="run-sentence">
        <div className="run-text">{state.runSentence}…</div>
        <div className="run-progress">scene {Math.min(state.combatsWon + 1, RUN_LENGTH)} / {RUN_LENGTH}</div>
      </header>
      {state.phase === 'combat' && <CombatScreen state={state} dispatch={onAction} />}
      {state.phase === 'reward' && <RewardScreen state={state} dispatch={onAction} />}
      {(state.phase === 'won_run' || state.phase === 'lost_run') && (
        <RunEndScreen state={state} dispatch={onAction} />
      )}
    </div>
  );
}

import React, { useReducer } from 'react';
import { Action, initialState, reducer } from '../engine/combat/reducer';
import { CombatScreen } from './CombatScreen';

export function App(): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const onAction = (a: Action) => dispatch(a);

  return (
    <div className="app">
      <header className="run-sentence">
        <span>THE HERO ENTERED THE FOREST AND</span>
        <span className="blank"> FOUGHT A GOBLIN</span>
      </header>
      <CombatScreen state={state} dispatch={onAction} />
    </div>
  );
}

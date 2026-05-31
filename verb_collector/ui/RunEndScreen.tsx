import React from 'react';
import { Action } from '../engine/combat/reducer';
import { GameState } from '../engine/combat/state';
import { EndVignette } from './SceneArt';

interface Props {
  state: GameState;
  dispatch: (a: Action) => void;
}

export function RunEndScreen({ state, dispatch }: Props): React.ReactElement {
  const won = state.phase === 'won_run';
  return (
    <div className="endgame">
      <div className="endgame-banner" aria-hidden="true">
        <EndVignette won={won} />
      </div>
      <h2>{won ? 'THE STORY ENDS' : 'YOU FELL'}</h2>
      <p className="end-flavor">
        {won
          ? 'You walk out of the forest. The sentence is complete.'
          : 'The story ends mid-sentence.'}
      </p>
      <div className="final-sentence">{state.runSentence}.</div>
      <button className="primary" onClick={() => dispatch({ type: 'start_new_run' })}>
        new run
      </button>
    </div>
  );
}

import React from 'react';
import { VERBS } from '../engine/words';
import { Action } from '../engine/combat/reducer';
import { GameState } from '../engine/combat/state';

interface Props {
  state: GameState;
  dispatch: (a: Action) => void;
}

export function RewardScreen({ state, dispatch }: Props): React.ReactElement {
  return (
    <div className="reward-screen">
      <h2>VICTORY</h2>
      <p className="reward-flavor">
        You defeated {state.encounterName ? state.encounterName.toLowerCase() : 'your foe'}. The forest offers a word.
      </p>

      <div className="reward-cards">
        {state.rewardOffered.map((verbId) => {
          const v = VERBS[verbId];
          return (
            <button
              key={verbId}
              className="card verb reward-card"
              onClick={() => dispatch({ type: 'pick_reward', verb: verbId })}
            >
              <div className="card-cost">{v.cost}</div>
              <div className="card-name">{v.id}</div>
              <div className="card-desc">{v.desc}</div>
            </button>
          );
        })}
      </div>

      <div className="reward-skip">
        <button className="skip" onClick={() => dispatch({ type: 'skip_reward' })}>
          take nothing
        </button>
      </div>
    </div>
  );
}

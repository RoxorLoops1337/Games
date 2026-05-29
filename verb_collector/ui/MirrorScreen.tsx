import React, { useState } from 'react';
import { Action } from '../engine/combat/reducer';
import { GameState, Card } from '../engine/combat/state';
import { VERBS, ADJECTIVES } from '../engine/words';

interface Props {
  state: GameState;
  dispatch: (a: Action) => void;
}

export function MirrorScreen({ state, dispatch }: Props): React.ReactElement {
  const [pickedId, setPickedId] = useState<string | null>(null);
  return (
    <div className="scene-screen mirror-screen">
      <header className="scene-header">
        <h2>THE MIRROR</h2>
        <p className="scene-flavor">
          A flat black surface set in oak. Choose a word; its twin will follow you.
        </p>
      </header>

      <div className="mirror-cards">
        {state.permanentDeck.map((c: Card) => {
          const info = c.kind === 'verb' ? VERBS[c.word] : ADJECTIVES[c.word];
          return (
            <button
              key={c.id}
              className={`mirror-card ${c.kind} ${pickedId === c.id ? 'picked' : ''}`}
              onClick={() => setPickedId(c.id)}
            >
              <div className="mirror-card-name">{c.word}</div>
              <div className="mirror-card-desc">{info.desc}</div>
            </button>
          );
        })}
      </div>

      <div className="scene-footer">
        {pickedId ? (
          <button
            className="scene-confirm"
            onClick={() => {
              dispatch({ type: 'mirror_duplicate', cardId: pickedId });
              dispatch({ type: 'scene_done' });
            }}
          >
            duplicate this word
          </button>
        ) : (
          <button className="scene-leave" onClick={() => dispatch({ type: 'scene_done' })}>
            leave
          </button>
        )}
      </div>
    </div>
  );
}

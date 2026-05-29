import React, { useState } from 'react';
import { Action } from '../engine/combat/reducer';
import { GameState, Card } from '../engine/combat/state';
import { VERBS } from '../engine/words';

interface Props {
  state: GameState;
  dispatch: (a: Action) => void;
}

export function ShrineScreen({ state, dispatch }: Props): React.ReactElement {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const verbCards = state.permanentDeck.filter((c): c is Extract<Card, { kind: 'verb' }> => c.kind === 'verb' && !c.upgraded);

  return (
    <div className="scene-screen shrine-screen">
      <header className="scene-header">
        <h2>THE SHRINE</h2>
        <p className="scene-flavor">
          A flat stone in a grove. Older than the trees. Lay one word upon it
          to have it rewritten in heavier ink.
        </p>
      </header>

      <section className="shrine-deck">
        {verbCards.length === 0 ? (
          <p className="empty">All your words have already been honoured here.</p>
        ) : (
          <div className="shrine-cards">
            {verbCards.map((c) => {
              const v = VERBS[c.word];
              const cost = c.costOverride ?? v.cost;
              return (
                <button
                  key={c.id}
                  className={`shrine-card ${pickedId === c.id ? 'picked' : ''}`}
                  onClick={() => setPickedId(c.id)}
                >
                  <div className="shrine-card-cost">{cost}</div>
                  <div className="shrine-card-name">{c.word}</div>
                  <div className="shrine-card-desc">{v.desc}</div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {pickedId && (
        <div className="shrine-modes">
          <button
            className="shrine-mode"
            onClick={() => dispatch({ type: 'shrine_upgrade', cardId: pickedId, mode: 'cost' })}
          >
            <div className="shrine-mode-label">SHARPEN</div>
            <div className="shrine-mode-desc">Reduce its energy cost by 1.</div>
          </button>
          <button
            className="shrine-mode"
            onClick={() => dispatch({ type: 'shrine_upgrade', cardId: pickedId, mode: 'effect' })}
          >
            <div className="shrine-mode-label">DEEPEN</div>
            <div className="shrine-mode-desc">Boost its effect strength.</div>
          </button>
        </div>
      )}

      <div className="scene-footer">
        <button className="scene-leave" onClick={() => dispatch({ type: 'scene_done' })}>
          {pickedId ? 'skip' : 'leave'}
        </button>
      </div>
    </div>
  );
}

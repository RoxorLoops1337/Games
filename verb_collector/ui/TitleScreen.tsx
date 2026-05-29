import React from 'react';
import { Action } from '../engine/combat/reducer';
import { hasSave, loadMeta } from '../engine/save/storage';

interface Props {
  dispatch: (a: Action) => void;
}

export function TitleScreen({ dispatch }: Props): React.ReactElement {
  const canContinue = hasSave();
  const meta = loadMeta();
  return (
    <div className="title-screen">
      <div className="title-mark" aria-hidden="true">
        <svg viewBox="0 0 120 60" width="180" height="90">
          <path
            d="M10 50 L40 10 L55 30 L70 10 L85 30 L110 10"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="40" cy="10" r="1.8" fill="currentColor" />
          <circle cx="110" cy="10" r="1.8" fill="currentColor" />
        </svg>
      </div>
      <h1 className="title-name">VERB COLLECTOR</h1>
      <p className="title-flavor">
        a story written in ink and forest
      </p>

      <div className="title-actions">
        {canContinue && (
          <button
            className="title-btn primary"
            onClick={() => dispatch({ type: 'continue_run' })}
          >
            continue
          </button>
        )}
        <button
          className={`title-btn ${canContinue ? 'secondary' : 'primary'}`}
          onClick={() => dispatch({ type: 'start_new_run' })}
        >
          {canContinue ? 'new run' : 'begin'}
        </button>
      </div>

      <div className="title-meta">
        <div><span className="title-meta-label">runs</span> {meta.runs}</div>
        <div><span className="title-meta-label">wins</span> {meta.wins}</div>
        {meta.bestSentenceLength > 0 && (
          <div><span className="title-meta-label">longest sentence</span> {meta.bestSentenceLength}</div>
        )}
      </div>
    </div>
  );
}

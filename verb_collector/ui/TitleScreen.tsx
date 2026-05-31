import React from 'react';
import { Action } from '../engine/combat/reducer';
import { hasSave, loadMeta } from '../engine/save/storage';
import { TitleBanner } from './SceneArt';

interface Props {
  dispatch: (a: Action) => void;
}

export function TitleScreen({ dispatch }: Props): React.ReactElement {
  const canContinue = hasSave();
  const meta = loadMeta();
  return (
    <div className="title-screen">
      <div className="title-banner-wrap" aria-hidden="true">
        <TitleBanner />
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

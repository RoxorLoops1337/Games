import React from 'react';
import { Eye, EyeOff, Coins } from 'lucide-react';
import { Action } from '../engine/combat/reducer';
import { GameState } from '../engine/combat/state';
import { RUN_LENGTH, SceneOffer } from '../engine/run/scenes';
import { EnemyIcon } from './EnemyIcon';

interface Props {
  state: GameState;
  dispatch: (a: Action) => void;
}

const SCENE_ICON: Record<SceneOffer['kind'], string> = {
  combat_normal: '⚔',
  combat_elite:  '☠',
  combat_boss:   '♛',
  shop:          '⚖',
  shrine:        '✶',
  fire:          '✺',
  mirror:        '◐',
};

const SCENE_LEAD: Record<SceneOffer['kind'], string> = {
  combat_normal: 'FOUGHT',
  combat_elite:  'FACED',
  combat_boss:   'STOOD AGAINST',
  shop:          'VISITED',
  shrine:        'KNELT AT',
  fire:          'RESTED BY',
  mirror:        'PEERED INTO',
};

export function MapScreen({ state, dispatch }: Props): React.ReactElement {
  const isFinal = state.sceneIndex === RUN_LENGTH - 1;
  const canPeek = state.ink >= 2 && !state.peekedScene && state.sceneIndex < RUN_LENGTH - 1;
  const canHide = state.ink >= 4 && !state.hideNext && state.sceneIndex < RUN_LENGTH - 1;

  return (
    <div className="map-screen">
      <div className="map-intro">
        <span className="map-prompt">…AND THEN ___</span>
      </div>

      <div className="map-offers">
        {state.sceneOptions.map((offer, i) => (
          <SceneCard
            key={`${state.sceneIndex}_${i}`}
            offer={offer}
            isFinal={isFinal}
            onPick={() => dispatch({ type: 'enter_scene', offerIndex: i })}
          />
        ))}
      </div>

      <div className="map-ink-bar">
        <div className="ink-amount">
          <Coins size={14} strokeWidth={2} /> {state.ink} ink
        </div>
        <button
          className="ink-action"
          disabled={!canPeek}
          onClick={() => dispatch({ type: 'spend_ink', action: 'peek' })}
          title="See one scene ahead (2 ink)"
        >
          <Eye size={12} /> peek <span className="cost">2</span>
        </button>
        <button
          className="ink-action"
          disabled={!canHide}
          onClick={() => dispatch({ type: 'spend_ink', action: 'hide' })}
          title="Skip the next scene entirely (4 ink)"
        >
          <EyeOff size={12} /> hide <span className="cost">4</span>
        </button>
      </div>

      {state.peekedScene && state.peekedScene.length > 0 && (
        <div className="peek-panel">
          <div className="peek-label">beyond, you glimpse…</div>
          <div className="peek-list">
            {state.peekedScene.map((p, i) => (
              <span key={i} className="peek-chip">
                <span className="peek-glyph">{SCENE_ICON[p.kind]}</span> {p.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {state.hideNext && (
        <div className="hide-banner">the next page is torn out (HIDE active)</div>
      )}

      <div className="map-progress">
        Folio {state.sceneIndex + 1} of {RUN_LENGTH}
      </div>
    </div>
  );
}

function SceneCard({ offer, isFinal, onPick }: { offer: SceneOffer; isFinal: boolean; onPick: () => void }) {
  const lead = SCENE_LEAD[offer.kind];
  const glyph = SCENE_ICON[offer.kind];
  const isCombat = offer.kind.startsWith('combat_');
  const enemyNoun = offer.encounter?.enemies[0];
  return (
    <button className={`scene-card scene-${offer.kind}`} onClick={onPick}>
      <div className="scene-art">
        {isCombat && enemyNoun ? (
          <EnemyIcon noun={enemyNoun as never} size={64} />
        ) : (
          <span className="scene-glyph">{glyph}</span>
        )}
      </div>
      <div className="scene-lead">
        {isFinal ? 'STOOD AGAINST' : lead}
      </div>
      <div className="scene-label">{offer.label}</div>
    </button>
  );
}

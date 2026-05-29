import React, { useMemo, useState } from 'react';
import { Action } from '../engine/combat/reducer';
import { GameState } from '../engine/combat/state';
import { commonRelicIds, uncommonRelicIds, RELICS, RelicId } from '../engine/relics/relics';
import { makeRng } from '../engine/deck/deck';

interface Props {
  state: GameState;
  dispatch: (a: Action) => void;
}

function fireRng(state: GameState): () => number {
  return makeRng(0xF1AE0000 + state.sceneIndex);
}

function pickN<T>(pool: readonly T[], n: number, rng: () => number): T[] {
  const remaining = [...pool];
  const out: T[] = [];
  for (let i = 0; i < n && remaining.length > 0; i++) {
    const idx = Math.floor(rng() * remaining.length);
    out.push(remaining.splice(idx, 1)[0]!);
  }
  return out;
}

export function FireScreen({ state, dispatch }: Props): React.ReactElement {
  const [mode, setMode] = useState<'choice' | 'relic'>('choice');
  const relics = useMemo(() => {
    const rng = fireRng(state);
    const pool = [...commonRelicIds(), ...uncommonRelicIds()].filter(
      r => !state.relics.includes(r),
    );
    return pickN(pool, Math.min(3, pool.length), rng);
  }, [state.sceneIndex, state.relics]);

  const healAmt = Math.floor(state.player.maxHp * 0.3);

  if (mode === 'relic') {
    return (
      <div className="scene-screen fire-screen">
        <header className="scene-header">
          <h2>THE FIRE</h2>
          <p className="scene-flavor">
            Embers shape themselves into a relic in the cooling ash.
          </p>
        </header>
        <div className="fire-relic-list">
          {relics.length === 0 ? (
            <p className="empty">The ash holds nothing for you.</p>
          ) : (
            relics.map((r: RelicId) => {
              const def = RELICS[r];
              return (
                <button
                  key={r}
                  className="fire-relic"
                  onClick={() => {
                    dispatch({ type: 'fire_take_relic', relic: r });
                    dispatch({ type: 'scene_done' });
                  }}
                >
                  <div className="fire-relic-name">{def?.name ?? r}</div>
                  <div className="fire-relic-desc">{def?.desc ?? ''}</div>
                </button>
              );
            })
          )}
        </div>
        <div className="scene-footer">
          <button className="scene-leave" onClick={() => dispatch({ type: 'scene_done' })}>
            leave empty-handed
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="scene-screen fire-screen">
      <header className="scene-header">
        <h2>THE FIRE</h2>
        <p className="scene-flavor">
          A small blaze of brittle wood. You can warm yourself or sift the ash
          for a relic — not both.
        </p>
      </header>
      <div className="fire-choices">
        <button
          className="fire-choice"
          onClick={() => {
            dispatch({ type: 'fire_heal' });
            dispatch({ type: 'scene_done' });
          }}
        >
          <div className="fire-choice-label">REST</div>
          <div className="fire-choice-desc">Recover {healAmt} HP.</div>
        </button>
        <button
          className="fire-choice"
          onClick={() => setMode('relic')}
        >
          <div className="fire-choice-label">SIFT THE ASH</div>
          <div className="fire-choice-desc">Choose a relic from three.</div>
        </button>
      </div>
    </div>
  );
}

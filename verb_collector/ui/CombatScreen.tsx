import React, { useMemo } from 'react';
import { VERBS, ADJECTIVES, STARTER_CONNECTORS, NOUNS } from '../engine/words';
import { parse } from '../engine/parser/grammar';
import { resolve } from '../engine/resolver/resolve';
import { intentLabel } from '../engine/combat/enemies';
import { Action } from '../engine/combat/reducer';
import { Card, Enemy, GameState } from '../engine/combat/state';

interface Props {
  state: GameState;
  dispatch: (a: Action) => void;
}

const PERMANENT_NOUNS: Array<'SELF' | 'ENEMY' | 'ROOM' | 'IT'> = ['SELF', 'ENEMY', 'ROOM', 'IT'];

export function CombatScreen({ state, dispatch }: Props): React.ReactElement {
  const preview = useMemo(() => buildPreview(state), [state]);

  // Collected enemy nouns that the player has unlocked (defeated at least
  // once). Used as additional tappable nouns in the strip.
  const collectedNouns = state.unlockedNouns.filter(
    (n) => !PERMANENT_NOUNS.includes(n as never),
  );

  return (
    <div className="combat">
      <section className="enemies">
        {state.enemies.map((e) =>
          e.hp <= 0 ? null : <EnemyPortrait key={e.id} enemy={e} dispatch={dispatch} />,
        )}
      </section>

      <section className="player">
        <div className="portrait you">
          <div className="portrait-name">YOU</div>
          <div className="hp-bar">
            <div className="hp-fill" style={{ width: `${(state.player.hp / state.player.maxHp) * 100}%` }} />
            <span className="hp-text">{state.player.hp} / {state.player.maxHp}</span>
          </div>
          <div className="stats-row">
            <span>energy {state.player.energy}/{state.player.maxEnergy}</span>
            <span>block {state.player.block}</span>
            <span>attack {state.player.attack}</span>
          </div>
          {state.player.adjectives.length > 0 && (
            <div className="adj-tags">
              {state.player.adjectives.map((a) => (
                <span key={a.id} className="tag">
                  {a.id}{a.turns !== 'permanent' ? `·${a.turns}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="sentence-area">
        <div className="sentence-bar">
          {state.composing.length === 0 ? (
            <span className="placeholder">tap a verb to begin a sentence…</span>
          ) : (
            state.composing.map((tok, i) => (
              <button
                key={`${tok}_${i}`}
                className="token"
                onClick={() => dispatch({ type: 'remove_from_sentence', index: i })}
                title="remove"
              >
                {tok}
              </button>
            ))
          )}
        </div>
        <div className="preview">{preview}</div>
        <div className="sentence-actions">
          <button onClick={() => dispatch({ type: 'clear_sentence' })} disabled={state.composing.length === 0}>
            clear
          </button>
          <button className="primary" onClick={() => dispatch({ type: 'cast_sentence' })} disabled={state.composing.length === 0}>
            cast
          </button>
        </div>
      </section>

      <section className="permanent-strip">
        <div className="strip-label">nouns</div>
        {PERMANENT_NOUNS.map((n) => (
          <button key={n} className="word noun" onClick={() => dispatch({ type: 'add_to_sentence', token: n })}>
            {n}
          </button>
        ))}
        {collectedNouns.map((n) => (
          <button key={n} className="word noun collected" onClick={() => dispatch({ type: 'add_to_sentence', token: n })}>
            {n}
          </button>
        ))}
        <div className="strip-divider" />
        <div className="strip-label">conn</div>
        {STARTER_CONNECTORS.map((c) => (
          <button key={c} className="word connector" onClick={() => dispatch({ type: 'add_to_sentence', token: c })}>
            {c}
          </button>
        ))}
      </section>

      <section className="hand">
        {state.hand.map((card) => (
          <CardView
            key={card.id}
            card={card}
            disabled={!canAfford(card, state)}
            onClick={() => dispatch({ type: 'add_to_sentence', token: card.word })}
          />
        ))}
        {state.hand.length === 0 && <div className="empty-hand">hand empty — end turn to redraw</div>}
      </section>

      <section className="footer">
        <button className="primary end-turn" onClick={() => dispatch({ type: 'end_turn' })}>
          end turn
        </button>
        <div className="piles">
          <span>deck {state.deck.length}</span>
          <span>discard {state.discard.length}</span>
        </div>
      </section>

      <section className="log">
        {state.log.slice(-8).map((entry, i) => (
          <div key={i} className="log-line">
            <span className="log-turn">T{entry.turn}</span>
            <span className="log-text">{entry.text}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

function EnemyPortrait({ enemy, dispatch }: { enemy: Enemy; dispatch: (a: Action) => void }) {
  return (
    <div
      className="portrait enemy"
      onClick={() => dispatch({ type: 'add_to_sentence', token: enemy.noun })}
      title={`tap to add ${enemy.noun} to the sentence`}
    >
      <div className="portrait-name">{enemy.displayName}</div>
      <div className="hp-bar">
        <div className="hp-fill" style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }} />
        <span className="hp-text">{enemy.hp} / {enemy.maxHp}</span>
      </div>
      <div className="intent">Intent: {intentLabel(enemy.intent)}</div>
      {enemy.adjectives.length > 0 && (
        <div className="adj-tags">
          {enemy.adjectives.map((a) => (
            <span key={a.id} className="tag">
              {a.id}{a.turns !== 'permanent' ? `·${a.turns}` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CardView({ card, disabled, onClick }: { card: Card; disabled: boolean; onClick: () => void }) {
  if (card.kind === 'verb') {
    const v = VERBS[card.word];
    return (
      <button className={`card verb ${disabled ? 'disabled' : ''}`} onClick={onClick} title={v.desc} disabled={disabled}>
        <div className="card-cost">{v.cost}</div>
        <div className="card-name">{v.id}</div>
        <div className="card-desc">{v.desc}</div>
      </button>
    );
  }
  const a = ADJECTIVES[card.word];
  return (
    <button className={`card adjective ${disabled ? 'disabled' : ''}`} onClick={onClick} title={a.desc} disabled={disabled}>
      <div className="card-cost">·</div>
      <div className="card-name">{a.id}</div>
      <div className="card-desc">{a.desc}</div>
    </button>
  );
}

function canAfford(card: Card, state: GameState): boolean {
  if (card.kind !== 'verb') return true;
  return VERBS[card.word].cost <= state.player.energy;
}

function buildPreview(state: GameState): string {
  if (state.composing.length === 0) return ' ';
  const parsed = parse(state.composing);
  if (!parsed.ok) return `· ${parsed.reason}`;
  const result = resolve(parsed.sentence, state);
  const pieces: string[] = [];
  let damage = 0;
  let heal = 0;
  const adjs: string[] = [];
  for (const e of result.effects) {
    if (e.kind === 'damage' && e.target.kind !== 'self') damage += e.amount;
    if (e.kind === 'heal') heal += e.amount;
    if (e.kind === 'add_adjective') adjs.push(`apply ${e.adjective}`);
    if (e.kind === 'gain_block') pieces.push(`gain ${e.amount} block`);
    if (e.kind === 'reveal') pieces.push('reveal target');
    if (e.kind === 'queue_next_turn_bonus') pieces.push('+1 energy, +1 card next turn');
  }
  if (damage > 0) pieces.unshift(`${damage} damage`);
  if (heal > 0) pieces.unshift(`${heal} heal`);
  if (adjs.length > 0) pieces.push(...adjs);
  const cost = result.energyCost;
  const target = describeTarget(state, parsed.sentence.first.object?.noun);
  const prefix = target ? `→ ${target}: ` : '→ ';
  const affordable = cost <= state.player.energy ? '' : ' (NOT ENOUGH ENERGY)';
  return `${prefix}${pieces.join(', ') || 'no effect'} · costs ${cost}${affordable}`;
}

function describeTarget(state: GameState, nounId?: string): string | null {
  if (!nounId) return null;
  if (nounId === 'SELF') return 'YOU';
  if (nounId === 'ROOM') return 'the room';
  if (nounId === 'ENEMY' || nounId === 'IT') {
    const live = state.enemies.find((e) => e.hp > 0);
    return live ? live.displayName : 'no target';
  }
  const live = state.enemies.find((e) => e.noun === nounId && e.hp > 0);
  if (live) return live.displayName;
  const n = NOUNS[nounId as keyof typeof NOUNS];
  return n ? n.id : null;
}

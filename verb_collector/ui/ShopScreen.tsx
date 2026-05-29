import React, { useMemo } from 'react';
import { Coins } from 'lucide-react';
import { Action } from '../engine/combat/reducer';
import { GameState } from '../engine/combat/state';
import { VERBS } from '../engine/words';
import { VerbId } from '../engine/types';
import { commonRelicIds, uncommonRelicIds, RELICS } from '../engine/relics/relics';
import { POTIONS, V1_POTION_IDS, PotionId } from '../engine/potions/potions';
import { makeRng } from '../engine/deck/deck';

interface Props {
  state: GameState;
  dispatch: (a: Action) => void;
}

// Deterministic shop inventory: seed by scene index so the same shop shows
// the same wares if the player navigates back/forward. (The player can't
// actually go back in v1, but the determinism makes save/load consistent.)
function shopRng(state: GameState): () => number {
  return makeRng(0xCAFE0000 + state.sceneIndex);
}

const VERB_PRICES: Partial<Record<VerbId, number>> = {
  HIT: 4, WALK: 3, LOOK: 3, GRAB: 3,
  MAKE: 5, WAIT: 3, PUSH: 4, BURN: 6, BLOCK: 4,
  BREAK: 6, FREEZE: 6, HEAL: 6,
};

const POTION_PRICE = 5;
const COMMON_RELIC_PRICE = 8;
const UNCOMMON_RELIC_PRICE = 12;

function pickN<T>(pool: readonly T[], n: number, rng: () => number): T[] {
  const remaining = [...pool];
  const out: T[] = [];
  for (let i = 0; i < n && remaining.length > 0; i++) {
    const idx = Math.floor(rng() * remaining.length);
    out.push(remaining.splice(idx, 1)[0]!);
  }
  return out;
}

export function ShopScreen({ state, dispatch }: Props): React.ReactElement {
  const inv = useMemo(() => {
    const rng = shopRng(state);
    const allVerbs = Object.keys(VERBS) as VerbId[];
    const verbsForSale = pickN(allVerbs, 3, rng);
    const potionsForSale = pickN(V1_POTION_IDS, 2, rng);
    const relicPool = [...commonRelicIds(), ...uncommonRelicIds()].filter(
      r => !state.relics.includes(r),
    );
    const relicsForSale = pickN(relicPool, Math.min(2, relicPool.length), rng);
    return { verbsForSale, potionsForSale, relicsForSale };
  }, [state.sceneIndex, state.relics]);

  return (
    <div className="scene-screen shop-screen">
      <header className="scene-header">
        <h2>THE MERCHANT</h2>
        <p className="scene-flavor">
          A figure in a heavy cloak unrolls a pouch of bottled words.
        </p>
        <div className="ink-balance"><Coins size={14} /> {state.ink} ink</div>
      </header>

      <section className="shop-section">
        <div className="shop-section-label">words</div>
        <div className="shop-items">
          {inv.verbsForSale.map((v) => {
            const price = VERB_PRICES[v] ?? 4;
            const v_ = VERBS[v];
            const canAfford = state.ink >= price;
            return (
              <button
                key={v}
                className={`shop-item ${canAfford ? '' : 'unaffordable'}`}
                disabled={!canAfford}
                onClick={() => dispatch({ type: 'shop_buy_word', verb: v, price })}
              >
                <div className="shop-item-name">{v}</div>
                <div className="shop-item-desc">{v_.desc}</div>
                <div className="shop-item-price"><Coins size={11} /> {price}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="shop-section">
        <div className="shop-section-label">potions</div>
        <div className="shop-items">
          {inv.potionsForSale.map((p: PotionId) => {
            const def = POTIONS[p];
            const canAfford = state.ink >= POTION_PRICE;
            return (
              <button
                key={p}
                className={`shop-item ${canAfford ? '' : 'unaffordable'}`}
                disabled={!canAfford}
                onClick={() => dispatch({ type: 'shop_buy_potion', potion: p, price: POTION_PRICE })}
              >
                <div className="shop-item-name">{def?.label ?? p}</div>
                <div className="shop-item-desc">{def?.sentence ?? p}</div>
                <div className="shop-item-price"><Coins size={11} /> {POTION_PRICE}</div>
              </button>
            );
          })}
        </div>
      </section>

      {inv.relicsForSale.length > 0 && (
        <section className="shop-section">
          <div className="shop-section-label">relics</div>
          <div className="shop-items">
            {inv.relicsForSale.map((r) => {
              const def = RELICS[r];
              const price = def?.rarity === 'uncommon' ? UNCOMMON_RELIC_PRICE : COMMON_RELIC_PRICE;
              const canAfford = state.ink >= price;
              return (
                <button
                  key={r}
                  className={`shop-item ${canAfford ? '' : 'unaffordable'}`}
                  disabled={!canAfford}
                  onClick={() => dispatch({ type: 'shop_buy_relic', relic: r, price })}
                >
                  <div className="shop-item-name">{def?.name ?? r}</div>
                  <div className="shop-item-desc">{def?.desc ?? ''}</div>
                  <div className="shop-item-price"><Coins size={11} /> {price}</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="scene-footer">
        <button className="scene-leave" onClick={() => dispatch({ type: 'scene_done' })}>
          leave
        </button>
      </div>
    </div>
  );
}

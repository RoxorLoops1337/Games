import React from 'react';
import { PotionId, POTIONS, POTION_SLOT_COUNT, potionLabel, potionSentence } from '../engine/potions/potions';

interface Props {
  potions: Array<PotionId | null>;
  onUse: (slot: number) => void;
  disabled?: boolean;  // greyed out during non-combat phases
}

// A horizontal row of fixed potion slots. Empty slots show a dotted outline;
// filled slots show the potion's encoded sentence as a wax-seal vial. The
// foundation agent wires this into CombatScreen.tsx in Phase C; it isn't
// rendered anywhere yet.
export function PotionTray({ potions, onUse, disabled = false }: Props): React.ReactElement {
  // Always render exactly POTION_SLOT_COUNT slots, regardless of the
  // incoming array length — the underlying state should match, but being
  // defensive keeps the layout stable across save migrations.
  const slots: Array<PotionId | null> = [];
  for (let i = 0; i < POTION_SLOT_COUNT; i++) {
    slots.push(potions[i] ?? null);
  }

  return (
    <div className="potion-tray" role="toolbar" aria-label="Potion tray">
      {slots.map((id, slot) => {
        if (id === null) {
          return (
            <div
              key={slot}
              className="potion-slot potion-slot-empty"
              aria-label={`Empty potion slot ${slot + 1}`}
            >
              <span className="potion-empty-label">empty</span>
            </div>
          );
        }
        const def = POTIONS[id];
        const label = def?.label ?? potionLabel(id);
        const sentence = def?.sentence ?? potionSentence(id);
        return (
          <button
            key={slot}
            type="button"
            className="potion-slot potion-slot-filled"
            onClick={() => { if (!disabled) onUse(slot); }}
            disabled={disabled}
            title={label}
            aria-label={`Drink ${label}`}
          >
            <span className="potion-sentence">{sentence}</span>
          </button>
        );
      })}
    </div>
  );
}

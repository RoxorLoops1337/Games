// Player afflictions (design/ENEMY_DEPTH.md): Rejection, Infection, Numb, Unpicked, Cadence Lock, Leaden and friends.
// Hooks are called from engine/combat.js; the afflictions engineer fills this module in. Poison, Brittle, Dread and
// Stagefright are plain status hooks in data/statuses_aff.js (turnStart / turnEnd / cardPlayed / blockBroken).
// Rejection (prices trigger twice) and Infection (Strain +N) are already implemented in combat.js itself.

// The inst the spec is built from this combat. Unpicked drops one live patch; Numb mutes the boons of the top grafted card.
export function afflInst(c, card) { return card.inst; }
// Adjust a card's effective cost (Leaden: highest-cost card costs +1).
export function afflCost(c, card, k) { return k; }
// After the new hand is drawn (apply Numb/Unpicked marks decided by enemies last phase).
export function afflStartTurn(c) { /* expire last turn's marks */ }
// Before the hand is discarded at end of turn.
export function afflEndTurn(c) { /* clear per-turn marks */ }

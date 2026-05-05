// Encounter generator: produces the foe roster for a given round.
// Each entry is { defId, col, row } in foe-half coordinates (cols 4..7).
window.Decktest = window.Decktest || {};

(function () {
  // Rosters are tuned to escalate; design rather than random for predictability.
  const ROSTERS = {
    1: [['hihat', 6, 1], ['hihat', 6, 2], ['snare', 7, 1]],
    2: [['kick', 5, 1], ['hihat', 6, 1], ['hihat', 6, 2], ['snare', 7, 2]],
    3: [['kick', 5, 1], ['kick', 5, 2], ['snare', 6, 1], ['snare', 6, 2], ['vocal', 7, 0]],
    4: [['kick', 5, 1], ['snare', 5, 2], ['hihat', 6, 1], ['hihat', 6, 2], ['vocal', 7, 0], ['snare', 7, 3]],
    5: [['kick', 4, 1], ['kick', 5, 2], ['snare', 5, 1], ['snare', 6, 2], ['hihat', 6, 1], ['vocal', 7, 0], ['bass', 7, 2]],
    6: [['kick', 4, 1], ['kick', 4, 2], ['snare', 5, 1], ['snare', 5, 2], ['hihat', 6, 0], ['hihat', 6, 3], ['vocal', 7, 1], ['bass', 7, 2]],
    7: [['kick', 4, 1], ['kick', 4, 2], ['snare', 5, 1], ['snare', 5, 2], ['hihat', 6, 0], ['hihat', 6, 3], ['vocal', 7, 0], ['bass', 7, 2], ['bass', 7, 3]],
    8: [['kick', 4, 0], ['kick', 4, 3], ['snare', 4, 1], ['snare', 4, 2], ['hihat', 5, 0], ['hihat', 5, 3], ['vocal', 6, 1], ['vocal', 6, 2], ['bass', 7, 1], ['bass', 7, 2]],
  };

  // Stat scaling applied to foe units for harder rounds.
  // Multiplier on hp and atk; round 1 = baseline.
  function foeBuff(round) {
    if (round <= 3) return { hpMul: 1.0, atkMul: 1.0 };
    if (round <= 5) return { hpMul: 1.15, atkMul: 1.10 };
    if (round <= 7) return { hpMul: 1.30, atkMul: 1.20 };
    return { hpMul: 1.5, atkMul: 1.3 };
  }

  function rosterForRound(round) {
    const r = Math.max(1, Math.min(round, 8));
    return ROSTERS[r];
  }

  Decktest.encounters = { rosterForRound, foeBuff };
})();

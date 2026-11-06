// Round 11 (agent 12): a coach line on the loss screen that reacts to HOW the run ended (only for new players, and
// only with rules they have already met). Pure: takes the run result and the save, returns a sentence or ''.
export const COACH_UNTIL = 5;   // stages cleared before the coach stays quiet
export function deathCoach(r, save) {
  if (!r || r.won || r.mode || r.hard || (save && (save.cleared || 0) >= COACH_UNTIL)) return '';
  const pct = Math.floor((r.progress || 0) * 100), t = r.time || 0, picks = r.picks || 0, kills = r.kills || 0;
  if (pct >= 70) return '';                                   // the close call line already says it
  if (picks === 0 && t >= 12) return 'No upgrade this time: pop a yellow cell, it carries one';
  if (t < 25 && kills < 6) return 'The face came fast: slide under it and shoot early';
  if (!(r.chests > 0) && t >= 40) return 'A pink gift cell drops a chest: worth a shot or two';
  if (picks > 0 && pct < 45) return 'Every upgrade counts: take the next yellow cell too';
  return '';
}

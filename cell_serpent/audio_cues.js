// Audio cues derived from the live game: boss phases (by how much of the boss chain is left), the perfect clear
// stinger, the music flavour per species and when the music should be muffled. Pure helpers plus one small tracker.
import { skinFor } from './sim.js';

// Boss phase 0..2 from the share of boss cells still alive: phase 1 below 66 percent, phase 2 below 33 percent.
export function bossPhaseOf(g) {
  let alive = 0, total = 0;
  for (const sn of g.snakes || []) if (sn.boss) for (let i = 1; i < sn.segs.length; i++) { total++; if (sn.segs[i].hp > 0) alive++; }
  if (!total) return 0;
  const f = alive / total;
  return f < 0.33 ? 2 : f < 0.66 ? 1 : 0;
}
// Three stars in the sim's own terms: no revive and the face never got past 80 percent of the path.
export const perfectClear = g => !g.mode && !g.hard && g.revivesUsed === 0 && !g.revived && g.faceMax < 0.8;
// The music should sit behind a lowpass while a card choice or the pause screen is up.
export const wantsMuffle = (mode, g) => mode === 'pause' || (mode === 'play' && !!g && g.phase === 'levelup');

// Which ui sound a screen change deserves: sheets that slide over the game open and close with a soft sweep.
const SHEETS = new Set(['pause', 'settings', 'panel', 'boxModal']);
export const sheetSound = (prev, next) => (next === prev ? null : SHEETS.has(next) ? 'open' : SHEETS.has(prev) && (next === '' || next === 'hub' || next === 'title') ? 'close' : null);

export function createCues(audio) {
  let gRef = null, phase = 0, base = 0, cleared = false;
  return {
    // call once per play frame; returns the boss phase for audio.mix
    tick(g) {
      if (g !== gRef) { gRef = g; phase = 0; cleared = false; base = 0; }
      if (g.phase === 'clear' && !cleared) { cleared = true; if (perfectClear(g)) audio.play('perfect'); }
      let bp = 0;
      if (g.phase === 'play' || g.phase === 'levelup') { bp = bossPhaseOf(g); if (bp > phase) { phase = bp; audio.play('bossphase', { n: bp }); } }
      return Math.max(phase, bp);
    },
    skin: g => (g.snakes && g.snakes[0] && g.snakes[0].skin) || skinFor(g.stage),
  };
}

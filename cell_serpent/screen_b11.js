import { virusName } from './sim.js';
// Screen moments round 11: ACT banners every 5 stages, the stage 50 finale credits, the boss-down dizzy head
// and the game over cause hint. Pure helpers, no canvas, no sim writes.
export const ACTS = ['Sound Check', 'Warm-Up Set', 'Barnyard Beats', 'Snack Bar Jam', 'Moonlight Mix', 'Kitten Chorus', 'Puppy Drop', 'Midnight Loops', 'Golden Hour', 'The Encore'];
export const actOf = n => Math.min(ACTS.length, Math.max(1, Math.floor(((n | 0) - 1) / 5) + 1));
// A new act starts on stage 1, 6, 11 ... 46 (the boss stages 5, 10 ... close the act before)
export const isActStart = n => n >= 1 && n <= 50 && (n - 1) % 5 === 0;
export const actTitle = n => 'ACT ' + actOf(n) + '  -  ' + ACTS[actOf(n) - 1].toUpperCase();
export const FINALE_STAGE = 50;
export const isFinale = (n, boss) => n === FINALE_STAGE && !!boss;
// Credits scroll on the stage 50 clear card: [size, text, colour] per line, [0] is a gap.
export const CREDITS = [
  [50, 'THE SHOW IS OVER', '#ffd84d'], [0], [40, 'ROXORLOOPS', '#9fb4ff'], [50, 'beatbox and loops', '#ffffff'], [0],
  [40, 'JASMIN', '#ff9ad6'], [50, 'voice and sparkle', '#ffffff'], [0],
  [40, 'THE SNAKES', '#9dff6d'], [50, 'all 50 stages, every one', '#ffffff'], [0],
  [40, 'YOU', '#6fe3ff'], [50, 'kept the beat going', '#ffffff'], [0], [44, 'THANK YOU FOR PLAYING', '#ffd84d'],
];
export const creditsHeight = lineH => CREDITS.reduce((a, l) => a + (l[0] ? lineH : lineH * 0.6), 0);

// What ended the run: { head, sub } text for the game over banner, from the live game state.
export function deathCause(g, stageName) {
  if (!g || g.mode) return null;
  const nm = String(stageName || '').toUpperCase();
  const boss = !!(g.snakes && g.snakes.some(sn => sn.boss));
  if (g.ring) return { head: boss ? 'THE BOSS CLOSED THE CIRCLE' : 'THE CIRCLE CLOSED IN', sub: 'keep popping the front cells' };
  if (boss) return { head: (nm ? nm + ' ' : 'THE BOSS ') + 'TOOK THE STAGE', sub: 'body first, then the shielded face' };
  if (g.snakes && g.snakes.length > 1) return { head: 'TWO SNAKES, ONE LINE', sub: 'the nearer face needs your shots first' };
  return { head: (nm ? nm + ' ' : 'THE SNAKE ') + 'REACHED THE LINE', sub: 'the face pops when it is alone' };
}
export const deathCauseOf = g => deathCause(g, virusName(g.stage));

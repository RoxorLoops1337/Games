// Audio round 7 helpers (pure, so the offline tests can check them without ears): the choir regrow hum per species, the
// tapped snake squeak per cell, the ambient hub bed chord and the small tracker that finds the regrowing choir cells.
import { CHOIR_REACH } from './sim.js';

// One hum per snake species: root note (midi), waveform, chord intervals, length and volume. The choir hum is quiet on
// purpose (it plays under the whole mix); the species decide the colour: love is warm, grumpy is gruff, frosty is glassy.
export const HUM = {
  love:   { m: 64, w: 'sine',     iv: [0, 4, 7],  dur: 1.3, v: 0.016 },
  rust:   { m: 57, w: 'triangle', iv: [0, 3, 7],  dur: 1.3, v: 0.018 },
  sneezy: { m: 69, w: 'sine',     iv: [0, 2, 7],  dur: 1.1, v: 0.016 },
  grumpy: { m: 52, w: 'sawtooth', iv: [0, 3, 7],  dur: 1.4, v: 0.008 },
  sleepy: { m: 59, w: 'sine',     iv: [0, 7, 12], dur: 1.7, v: 0.017 },
  disco:  { m: 67, w: 'triangle', iv: [0, 4, 9],  dur: 1.1, v: 0.016 },
  sour:   { m: 62, w: 'triangle', iv: [0, 3, 6],  dur: 1.2, v: 0.016 },
  mighty: { m: 48, w: 'sawtooth', iv: [0, 7, 12], dur: 1.5, v: 0.009 },
  frosty: { m: 76, w: 'sine',     iv: [0, 4, 11], dur: 1.5, v: 0.013 },
  gloomy: { m: 50, w: 'triangle', iv: [0, 3, 8],  dur: 1.6, v: 0.019 },
};
export const humOf = skin => HUM[skin] || HUM.love;
export const HUM_EVERY = 1100;   // ms between hum swells while a choir cell is regrowing its neighbours (they overlap a little)

// How many cells the living choir cells are regrowing right now (hurt, not flashing from a hit, inside the choir reach).
export function choirRegrowing(g) {
  let n = 0;
  for (const sn of g.snakes || []) {
    const segs = sn.segs; if (!segs) continue;
    for (let i = 1; i < segs.length; i++) if (segs[i].choir && segs[i].hp > 0) {
      for (let j = Math.max(1, i - CHOIR_REACH); j <= Math.min(segs.length - 1, i + CHOIR_REACH); j++) {
        const q = segs[j]; if (j !== i && q.hp > 0 && q.hp < q.max && !(q.flash > 0)) n++;
      }
    }
  }
  return n;
}

// The cell you poke on the title snake squeaks at its own pitch: a pentatonic ladder from the head (low, a round "oh") up the tail.
const PENTA = [0, 2, 4, 7, 9];
export function squeakHz(i) {
  const k = Math.max(0, i | 0), m = 72 + PENTA[k % 5] + 12 * Math.min(2, Math.floor(k / 5));
  return 440 * Math.pow(2, (m - 69) / 12);
}

// Ambient hub bed: a soft major seventh pad (hz) plus a twinkle ladder (midi), both far below the in-run music.
export const HUB_CHORD = [130.81, 196.0, 246.94, 329.63];
export const HUB_TWINKLE = [76, 79, 81, 83, 86, 88];
export const HUB_GAIN = 0.05;   // level of the whole bed on the music bus

// Tracker: call once per play frame with the game and a clock in ms. Plays one hum swell per HUM_EVERY while cells regrow.
export function createLife(audio) {
  let gRef = null, nextHum = 0;
  return {
    tick(g, nowMs) {
      if (g !== gRef) { gRef = g; nextHum = 0; }
      if (g.phase !== 'play' || nowMs < nextHum) return;
      nextHum = nowMs + HUM_EVERY / 2;   // look again soon, but only hum every HUM_EVERY
      const n = choirRegrowing(g); if (!n) return;
      nextHum = nowMs + HUM_EVERY;
      const sn = g.snakes && g.snakes[0];
      audio.play('choirhum', { skin: (sn && sn.skin) || 'love', n });
    },
  };
}

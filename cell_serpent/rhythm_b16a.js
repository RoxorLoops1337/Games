// Rhythm Core (batch 16a): the beat lane under the duo, the timing feedback and the DROP look.
// Everything is read from the sim (beatPhase / pStreak / dropT); nothing here changes the game. Canvas ops are plain fills and strokes,
// no gradients and no allocations per frame; words go through the caller's baked text().
import { beatPeriod, beatOffset, RHY_FROM, DROP_AT, DROP_LEN, BEAT_PERFECT, BEAT_WIN } from './sim.js';

const TAU = Math.PI * 2;
export const LANE_X = 508, LANE_Y = 1242, LANE_HALF = 104, PX_PER_S = 210, AHEAD = LANE_HALF / PX_PER_S;   // dots slide in from both ends and meet in the middle on the beat
const COL = { 2: '#ffe36b', 1: '#9bffe0', '-1': '#7fc8ff', '-2': '#ffb070' };
const WORD = { 2: 'PERFECT', 1: 'GOOD', '-1': 'EARLY', '-2': 'LATE' };
export const LANE = { t: -9, j: 0, off: 0, n: 0, dropT: -9, endT: -9 };   // the last judgement, for the lane

export function laneEvent(e, now) {
  if (e.t === 'rhy') { LANE.t = now; LANE.j = e.j; LANE.off = e.off; LANE.n = e.n; }
  else if (e.t === 'rdrop') LANE.dropT = now;
  else if (e.t === 'rdropend') LANE.endT = now;
}
export const laneOn = g => !!g && g.phase === 'play' && g.stage >= RHY_FROM && !g.mode;
export const wordOf = j => WORD[j] || '';
export const colorOf = j => COL[j] || '#cfe8ff';
// the dots of the lane as numbers, for the drawing and for the tests: seconds until each upcoming beat inside the lane
export function laneBeats(g, out) {
  const T = beatPeriod(g), ph = g.t % T, first = ph === 0 ? 0 : T - ph;
  out.length = 0;
  for (let tau = first; tau <= AHEAD; tau += T) out.push(tau);
  return out;
}
const _b = [];
export function drawLane(ctx, g, nowT, text, reduceMotion) {
  if (!laneOn(g)) return;
  const cx = LANE_X, y = LANE_Y, drop = g.dropT > 0, T = beatPeriod(g), off = beatOffset(g), near = Math.abs(off) <= BEAT_WIN;
  ctx.save();
  // track
  ctx.globalAlpha = 0.62; ctx.fillStyle = '#0b0e20'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx - LANE_HALF - 18, y - 20, 2 * LANE_HALF + 36, 40, 20) : ctx.rect(cx - LANE_HALF, y - 20, 2 * LANE_HALF, 40); ctx.fill();
  ctx.globalAlpha = 0.5; ctx.strokeStyle = drop ? '#ff9ad6' : '#9fb4ff'; ctx.lineWidth = 3; ctx.stroke();
  // the perfect and good zones in the middle
  ctx.globalAlpha = 0.28; ctx.fillStyle = '#9bffe0'; ctx.fillRect(cx - BEAT_WIN * PX_PER_S, y - 13, 2 * BEAT_WIN * PX_PER_S, 26);
  ctx.globalAlpha = 0.42; ctx.fillStyle = '#ffe36b'; ctx.fillRect(cx - BEAT_PERFECT * PX_PER_S, y - 13, 2 * BEAT_PERFECT * PX_PER_S, 26);
  // upcoming beats slide in from both ends
  const bs = laneBeats(g, _b);
  for (let i = 0; i < bs.length; i++) {
    const tau = bs[i], d = tau * PX_PER_S, a = 1 - tau / AHEAD * 0.7, r = 7 + 4 * (1 - tau / AHEAD);
    ctx.globalAlpha = a; ctx.fillStyle = drop ? '#ffd0ee' : '#e8f1ff';
    ctx.beginPath(); ctx.arc(cx - d, y, r, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + d, y, r, 0, TAU); ctx.fill();
  }
  // the beat marker in the middle breathes on the beat and takes the colour of the last shot for a moment
  const since = nowT - LANE.t, hot = since < 0.45 && since >= 0, pulse = near ? 1.18 : 1 + (reduceMotion ? 0 : 0.05 * Math.sin(nowT * 6));
  ctx.globalAlpha = 1; ctx.lineWidth = 5; ctx.strokeStyle = hot ? COL[LANE.j] || '#fff' : near ? '#ffffff' : '#cfe8ff';
  ctx.beginPath(); ctx.arc(cx, y, 17 * pulse, 0, TAU); ctx.stroke();
  // where the last shot landed against the beat: a small tick on the track that fades out
  if (hot) { const tx = cx + Math.max(-LANE_HALF, Math.min(LANE_HALF, LANE.off * PX_PER_S)); ctx.globalAlpha = 1 - since / 0.45; ctx.fillStyle = COL[LANE.j] || '#fff'; ctx.fillRect(tx - 3, y - 18, 6, 36); }
  // streak notches under the lane: the drop is charged when they are full, then the bar drains while the chorus lasts
  const fill = drop ? g.dropT / DROP_LEN : Math.min(1, g.pStreak / DROP_AT), bw = 2 * LANE_HALF;
  ctx.globalAlpha = 0.6; ctx.fillStyle = '#0b0e20'; ctx.fillRect(cx - LANE_HALF, y + 24, bw, 7);
  ctx.globalAlpha = 1; ctx.fillStyle = drop ? '#ff7eb6' : fill >= 0.75 ? '#ffe36b' : '#9bffe0'; ctx.fillRect(cx - LANE_HALF, y + 24, bw * fill, 7);
  // the word for the last shot, and the DROP banner
  if (drop && text) { text('DROP!', cx, y - 36, 26, '#ffd0ee', '#5a1d4a'); }
  else if (hot && text) { ctx.globalAlpha = 1; text(WORD[LANE.j] + (LANE.j === 2 && LANE.n >= 3 ? ' x' + LANE.n : ''), cx, y - 34 - since * 12, LANE.j === 2 ? 24 : 20, COL[LANE.j] || '#fff', '#10131c'); }
  ctx.restore();
}
// the DROP look: a pulsing pink frame round the playfield while the chorus lasts (two strokes, no gradient)
export function drawDropFrame(ctx, g, nowT, W, H) {
  if (!(g.dropT > 0)) return;
  const k = Math.min(1, g.dropT * 3, (DROP_LEN - g.dropT) * 8 + 0.3), beat = Math.pow(1 - ((g.t % beatPeriod(g)) / beatPeriod(g)), 2);
  ctx.save(); ctx.strokeStyle = '#ff7eb6'; ctx.globalAlpha = k * (0.3 + 0.35 * beat); ctx.lineWidth = 16; ctx.strokeRect(8, 8, W - 16, H - 16);
  ctx.globalAlpha = k * (0.18 + 0.3 * beat); ctx.strokeStyle = '#ffe36b'; ctx.lineWidth = 5; ctx.strokeRect(20, 20, W - 40, H - 40); ctx.restore();
}

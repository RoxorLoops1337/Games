// 02-animal-art (round 9): little bits of life around the duo while they slide.
// 1) petFollow: the two pets trot after the duo on a springy leash (they lag, overshoot, lean into the turn) instead of being glued on.
// 2) SCARE_CALL: when a snake head gets close each pet reacts in its own voice once (the turtle tucks into its shell).
// 3) Dust: tiny dust puffs kick up under the duo's feet while sliding and a bigger skid when they reverse.
// Pure maths plus one fixed-size pool: nothing is allocated per frame.

// ---- springy pets -------------------------------------------------------------------------------------------------
const K = 120, C = 13;   // spring stiffness and damping (about 0.6 damping ratio: a visible but short overshoot)
export function newLeash() { return { x: 0, v: 0, t: -1, lean: 0, stretch: 0 }; }
// st: leash state, tx: where the pet wants to stand, t: seconds. Returns st (x, lean in radians, stretch 0..1).
export function petFollow(st, tx, t) {
  if (st.t < 0 || t - st.t > 0.25 || Math.abs(tx - st.x) > 260) { st.x = tx; st.v = 0; st.t = t; st.lean = 0; st.stretch = 0; return st; }   // first frame, a pause or a teleport: snap
  let dt = t - st.t; st.t = t; if (dt <= 0) return st; if (dt > 0.034) dt = 0.034;
  const a = K * (tx - st.x) - C * st.v;
  st.v += a * dt; st.x += st.v * dt;
  const sp = Math.min(1, Math.abs(st.v) / 520);
  st.lean += ((st.v / 520) * 0.32 - st.lean) * Math.min(1, dt * 14);
  st.stretch += (sp - st.stretch) * Math.min(1, dt * 12);
  return st;
}

// ---- a call for every pet ---------------------------------------------------------------------------------------
export const SCARE_CALL = { kitten: 'Hss!', puppy: 'Grr!', piglet: 'Oink!', lamb: 'Baa!', hamster: 'Eek!', turtle: '...' };
export const SCARE_COL = { kitten: '#ffb36b', puppy: '#ffd24a', piglet: '#ff9ac6', lamb: '#e8e4ff', hamster: '#ffe9a8', turtle: '#9dff6d' };
export const SCARE_GAP = 7;   // seconds before the same pet calls out again
// rising edge of "a head is close": true when this pet should call out now. st gets {sc, call}
export function scareEdge(st, scared, t) {
  const was = !!st.sc; st.sc = scared;
  if (!scared || was) return false;
  if (st.call !== undefined && t - st.call < SCARE_GAP) return false;
  st.call = t; return true;
}
// the turtle pulls its head in while a snake is close (a sprite mood the pets already have: 7, eyes shut)
export const tuckMood = (id, scared) => (id === 'turtle' && scared ? 7 : -1);

// ---- dust under the feet ----------------------------------------------------------------------------------------
const N = 18;
export function createDust() {
  const d = { n: N, x: new Float32Array(N), y: new Float32Array(N), vx: new Float32Array(N), life: new Float32Array(N), max: new Float32Array(N), r: new Float32Array(N), i: 0, acc: 0, prev: 0 };
  return d;
}
export function dustPuff(d, x, y, vx, r, life) {
  const i = d.i; d.i = (i + 1) % N;
  d.x[i] = x; d.y[i] = y; d.vx[i] = vx; d.r[i] = r; d.life[i] = life; d.max[i] = life;
}
// d: pool, px/py: feet, mx: the duo's move input -1..1, dt seconds. Spawns trail puffs while sliding and a skid when reversing.
export function dustStep(d, px, py, mx, dt) {
  const m = Math.abs(mx);
  if (m > 0.55 && d.prev * mx < -0.2 && Math.abs(d.prev) > 0.55) {   // reversed at speed: skid
    for (let k = 0; k < 4; k++) dustPuff(d, px - Math.sign(d.prev) * 6 + (k - 1.5) * 5, py, -Math.sign(d.prev) * (60 + k * 26), 8 + k * 1.5, 0.6);
  }
  d.prev = mx;
  d.acc += dt * m;
  if (d.acc > 0.075) { d.acc = 0; dustPuff(d, px - Math.sign(mx) * 22, py, -Math.sign(mx) * 30, 6 + Math.random() * 3, 0.45); }
  for (let i = 0; i < N; i++) if (d.life[i] > 0) { d.life[i] -= dt; d.x[i] += d.vx[i] * dt; d.vx[i] *= 0.93; }
}
export function dustDraw(ctx, d) {
  let any = false;  for (let i = 0; i < N; i++) {
    const l = d.life[i]; if (l <= 0) continue;
    const u = 1 - l / d.max[i];
    if (!any) { any = true; ctx.save(); ctx.fillStyle = '#efe3d0'; }
    ctx.globalAlpha = 0.6 * (1 - u);
    ctx.beginPath(); ctx.ellipse(d.x[i], d.y[i] - u * 10, d.r[i] * (0.7 + u * 1.2), d.r[i] * (0.5 + u * 0.7), 0, 0, 6.2832); ctx.fill();
  }
  if (any) ctx.restore();
}

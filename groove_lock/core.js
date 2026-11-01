// Groove Lock: pure game rules (no DOM, no audio). Shared by the browser game and the headless tests.
//
// THE PUZZLE. A vinyl ring has N slots. Each slot is one step of a loop (a bar of music). The ring turns under a fixed
// dock at the bottom and a fixed speaker at the top (step 0 = the downbeat). Ghost cubes on the ring show which sound
// each empty slot needs. Lorries hold stacks of cubes, only the top cube can be sent. Tap a lorry: its top cube drops
// into the slot that is at the dock, and only if that slot's ghost wants that sound. Turning the ring costs one move
// per notch. The groove is LOCKED when every ghost is filled AND the ring is back home (rot = 0), because the sound
// plays the cube that sits at each step. Some levels start with the earlier layers already on the ring (locked cubes,
// scrambled out of sync), and some belts only turn one way, so lap planning matters.
//
// Coordinates: slot j sits at step (j + rot) mod N, so turning the ring clockwise (rot + 1) moves every cube one step
// later in time. The dock sits at step `dock`, so the slot at the dock is (dock - rot) mod N.

export const mod = (a, n) => ((a % n) + n) % n;

export const TYPES = {
  kick:  { id: 'kick',  label: 'B',  name: 'Boom',  color: '#ff5a4e', role: 'perc', who: 'roxor' },
  snare: { id: 'snare', label: 'K',  name: 'Snare', color: '#ffc93c', role: 'perc', who: 'roxor' },
  hat:   { id: 'hat',   label: 'T',  name: 'Tss',   color: '#35d6ff', role: 'perc', who: 'roxor' },
  bass:  { id: 'bass',  label: 'W',  name: 'Wub',   color: '#8d63ff', role: 'bass', who: 'roxor' },
  ah:    { id: 'ah',    label: 'Ah', name: 'Ah',    color: '#ff78c4', role: 'vox',  who: 'jasmin' },
  oh:    { id: 'oh',    label: 'Oh', name: 'Oh',    color: '#ff9f6e', role: 'vox',  who: 'jasmin' },
  ee:    { id: 'ee',    label: 'Ee', name: 'Ee',    color: '#7dff9c', role: 'vox',  who: 'jasmin' },
};
export const TYPE_IDS = Object.keys(TYPES);
// One letter per sound, used by the level patterns.
export const CHAR = { k: 'kick', s: 'snare', h: 'hat', b: 'bass', a: 'ah', o: 'oh', e: 'ee' };
export const JAM_TYPES = TYPE_IDS.slice();

// A level:
//   steps, bpm   ring size and tempo (one lap of the ring is one bar of 4 beats)
//   pattern      the whole groove, one char per home step ('.' = silence)
//   show         the chars that exist in this level; lock = the subset that starts locked on the ring
//   stacks       lorries, each a string listing its cubes TOP FIRST
//   rot0         how far the ring starts turned (locked layers start out of sync)
//   oneWay       the belt only turns clockwise
export function parsePattern(p) { return [...p].map((c) => (c === '.' ? null : CHAR[c] || null)); }

export class Game {
  constructor(level) { this.lv = level; this.reset(); }

  reset() {
    const lv = this.lv, N = lv.steps;
    this.N = N;
    this.dock = lv.dock == null ? N / 2 : lv.dock;
    this.oneWay = !!lv.oneWay;
    this.jam = !!lv.jam;
    this.rot = mod(lv.rot0 || 0, N);
    this.moves = 0;
    this.ring = Array(N).fill(null);
    this.locked = Array(N).fill(false);
    this.ghost = Array(N).fill(null);
    this.goal = Array(N).fill(null);
    if (!this.jam) {
      const pat = [...lv.pattern];
      for (let j = 0; j < N; j++) {
        const c = pat[j];
        if (!c || c === '.' || !(lv.show || '').includes(c)) continue;
        this.goal[j] = CHAR[c];
        if ((lv.lock || '').includes(c)) { this.ring[j] = CHAR[c]; this.locked[j] = true; } else this.ghost[j] = CHAR[c];
      }
    }
    // stored bottom -> top, so the top cube is the last element
    this.stacks = this.jam ? JAM_TYPES.map((t) => [t]) : (lv.stacks || []).map((s) => [...s].reverse().map((c) => CHAR[c]));
    this.history = [];
  }

  dockSlot() { return mod(this.dock - this.rot, this.N); }
  stepOf(slot) { return mod(slot + this.rot, this.N); }
  // what the speaker plays at loop step s
  stepType(s) { return this.ring[mod(s - this.rot, this.N)]; }
  goalType(s) { return this.goal[s]; }
  synced() { return this.rot === 0; }
  topOf(i) { const s = this.stacks[i]; return s && s.length ? s[s.length - 1] : null; }

  remaining() { let n = 0; for (let j = 0; j < this.N; j++) if (this.ghost[j] && !this.ring[j]) n++; return n; }
  totalGhosts() { let n = 0; for (let j = 0; j < this.N; j++) if (this.ghost[j]) n++; return n; }
  isSolved() { return !this.jam && this.rot === 0 && this.remaining() === 0; }
  // slots whose cube already matches the goal at the current turn
  inTune(slot) { return !!this.ring[slot] && this.goal[this.stepOf(slot)] === this.ring[slot]; }

  snapshot() { return { rot: this.rot, moves: this.moves, ring: this.ring.slice(), stacks: this.stacks.map((s) => s.slice()) }; }
  restore(s) { this.rot = s.rot; this.moves = s.moves; this.ring = s.ring.slice(); this.stacks = s.stacks.map((x) => x.slice()); }
  push() { this.history.push(this.snapshot()); if (this.history.length > 500) this.history.shift(); }
  canUndo() { return this.history.length > 0; }
  undo() { if (!this.history.length) return false; this.restore(this.history.pop()); return true; }

  canRotate(dir) { return dir === 1 || (dir === -1 && !this.oneWay); }
  // merge: true keeps a drag gesture as ONE undo step
  rotate(dir, merge = false) {
    if (!this.canRotate(dir)) return { ok: false, reason: 'oneWay' };
    if (!merge) this.push();
    this.rot = mod(this.rot + dir, this.N);
    if (!this.jam) this.moves++;
    return { ok: true, rot: this.rot };
  }

  drop(i) {
    const j = this.dockSlot();
    if (this.jam) {
      const type = JAM_TYPES[i];
      if (!type) return { ok: false, reason: 'empty' };
      if (this.ring[j]) return { ok: false, reason: 'occupied', slot: j };
      this.push(); this.ring[j] = type;
      return { ok: true, slot: j, type, stack: i };
    }
    const st = this.stacks[i];
    if (!st || !st.length) return { ok: false, reason: 'empty' };
    const type = st[st.length - 1];
    if (this.ring[j]) return { ok: false, reason: 'occupied', slot: j };
    if (this.ghost[j] !== type) return { ok: false, reason: this.ghost[j] ? 'wrongType' : 'noGhost', slot: j, need: this.ghost[j], type };
    this.push(); st.pop(); this.ring[j] = type;
    return { ok: true, slot: j, type, stack: i };
  }

  // Jam mode only: pick a cube back up.
  take(slot) {
    if (!this.jam || !this.ring[slot] || this.locked[slot]) return { ok: false };
    this.push(); const type = this.ring[slot]; this.ring[slot] = null;
    return { ok: true, slot, type };
  }
  clearJam() { if (!this.jam) return; this.push(); this.ring.fill(null); }
}

export function starsFor(moves, par) {
  if (par == null || moves <= par) return 3;
  return moves <= Math.ceil(par * 1.3) ? 2 : 1;
}

// ---------------------------------------------------------------------------------------------------------------
// Solver: 0-1 BFS over (ring turn, which ghosts are filled, how many cubes each lorry has given). A drop is free,
// a notch of the ring costs 1, and the goal is "all filled and home". Gives the true minimum (par) and the path (hints).
// Returns null if the state space is too big or there is no solution.
export function solve(game, limit = 3.5e6) {
  const N = game.N, dock = game.dock, oneWay = game.oneWay;
  if (game.jam) return null;
  const tid = (t) => TYPE_IDS.indexOf(t);
  const gi = new Int16Array(N).fill(-1), gt = [];
  for (let j = 0; j < N; j++) if (game.ghost[j] && !game.ring[j]) { gi[j] = gt.length; gt.push(tid(game.ghost[j])); }
  const G = gt.length;
  const S = game.stacks.map((s) => s.slice().reverse().map(tid)); // top first
  const K = S.length, radix = S.map((s) => s.length + 1), mult = [];
  let P = 1;
  for (let k = 0; k < K; k++) { mult.push(P); P *= radix[k]; }
  const total = (1 << G) * P * N;
  if (total > limit) return null;
  const full = (1 << G) - 1;
  const dist = new Uint16Array(total).fill(65535), par = new Int32Array(total).fill(-1), act = new Int8Array(total);
  const start = ((0 * P + 0) * N) + game.rot;
  dist[start] = 0;
  let cur = [start], d = 0;
  while (cur.length) {
    const next = [];
    for (let qi = 0; qi < cur.length; qi++) {
      const s = cur[qi];
      if (dist[s] !== d) continue;
      const rot = s % N, rest = (s - rot) / N, pk = rest % P, mask = (rest - pk) / P;
      if (mask === full && rot === 0) {
        const acts = [];
        for (let x = s; x !== start; x = par[x]) acts.push(act[x]);
        acts.reverse();
        return { cost: d, actions: acts.map((a) => (a === 0 ? { t: 'rot', dir: 1 } : a === 1 ? { t: 'rot', dir: -1 } : { t: 'drop', stack: a - 2 })) };
      }
      const g = gi[mod(dock - rot, N)];
      if (g >= 0 && !((mask >> g) & 1)) {
        for (let k = 0; k < K; k++) {
          const p = Math.floor(pk / mult[k]) % radix[k];
          if (p < S[k].length && S[k][p] === gt[g]) {
            const ns = (((mask | (1 << g)) * P + pk + mult[k]) * N) + rot;
            if (dist[ns] > d) { dist[ns] = d; par[ns] = s; act[ns] = 2 + k; cur.push(ns); }
          }
        }
      }
      const base = (mask * P + pk) * N;
      for (const dir of oneWay ? [1] : [1, -1]) {
        const ns = base + mod(rot + dir, N);
        if (dist[ns] > d + 1) { dist[ns] = d + 1; par[ns] = s; act[ns] = dir === 1 ? 0 : 1; next.push(ns); }
      }
    }
    cur = next; d++;
  }
  return null;
}

const parCache = new Map();
export function parOf(level) {
  if (!parCache.has(level.id)) { const r = level.jam ? null : solve(new Game(level)); parCache.set(level.id, r ? r.cost : null); }
  return parCache.get(level.id);
}

// The next thing to do, as a human step: turn the ring n notches (dir), then drop from lorry `stack`.
export function hintFor(game) {
  if (game.isSolved()) return { done: true };
  const r = solve(game);
  if (!r) return { stuck: true };
  const a = r.actions;
  let i = 0, dir = 0, n = 0;
  while (i < a.length && a[i].t === 'rot' && (dir === 0 || a[i].dir === dir)) { dir = a[i].dir; n++; i++; }
  const drop = i < a.length && a[i].t === 'drop' ? a[i].stack : null;
  return { dir, n, drop, cost: r.cost, last: i >= a.length };
}

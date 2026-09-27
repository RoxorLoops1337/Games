// No Room For Heroes trailer: shared world-space scene pieces (camera, the
// corridor, heroes walking it) that several shots reuse.
'use strict';

// put world point (cx, cy) at the frame centre, K screen px per world px
function camera(g, cx, cy, K, rot = 0, ox = 0, oy = 0) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.translate(W / 2 + ox, H / 2 + oy);
  if (rot) g.rotate(rot);
  g.scale(K, K);
  g.translate(-cx, -cy);
}
// camera whose centre lands on screen point (sx, sy) instead of the frame centre
function camAt(g, sx, sy, cx, cy, K, rot = 0) {
  g.translate(sx, sy); if (rot) g.rotate(rot); g.scale(K, K); g.translate(-cx, -cy);
}
// a tiny pixel skull (the kill marker), centred on x,y, s = pixel size
function pixSkull(g, x, y, s, a = 1) {
  const rows = ['.XXXXX.', 'XXXXXXX', 'X..X..X', 'X..X..X', 'XXX.XXX', '.XXXXX.', '.X.X.X.'];
  g.save(); g.globalAlpha *= a;
  rows.forEach((r, j) => [...r].forEach((c, i) => {
    if (c !== 'X') return;
    g.fillStyle = '#1a0f14'; g.fillRect(x + (i - 3.5) * s - s * .25, y + (j - 3.5) * s - s * .25, s * 1.5, s * 1.5);
  }));
  rows.forEach((r, j) => [...r].forEach((c, i) => { if (c === 'X') { g.fillStyle = '#f2ead8'; g.fillRect(x + (i - 3.5) * s, y + (j - 3.5) * s, s, s); } }));
  g.restore();
}
// lerp a camera between keys [{t, x, y, k, r}] with easing per segment (key.e)
function camPath(keys, t) {
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) {
      const u = (b.e || E.inOutCubic)((t - a.t) / (b.t - a.t));
      return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), k: a.k * Math.pow(b.k / a.k, u), r: lerp(a.r || 0, b.r || 0, u) };
    }
  }
  return keys[keys.length - 1];
}

const FOOT = FLOOR - LIFT;

// the full corridor: arena sky, floor, gaps, rooms, throne (+ optional boss).
// rooms: array of {type, e, broken, drop (0..1 slam-in progress), alpha}
// returns `front` (trap parts that draw over the actors) — call flush(front) after actors
function corridor(g, now, rooms, o = {}) {
  const slots = rooms.length;
  const worldRight = (slots + 1) * ROOM_W + 20;
  g.fillStyle = '#0c0916'; g.fillRect(-2000, -1000, 6000, 3000);
  drawArena(g, worldRight + (o.arenaShift || 0));
  if (o.lightning) arenaBolt(g, worldRight, o.lightning);
  // floor shade + band (drawDungeon)
  g.fillStyle = 'rgba(18,12,30,.34)'; g.fillRect(-2000, FLOOR, 6000, 400);
  const gr = g.createLinearGradient(0, FLOOR, 0, FLOOR + 160);
  gr.addColorStop(0, 'rgba(10,6,20,.6)'); gr.addColorStop(1, 'rgba(6,3,12,1)');
  g.fillStyle = gr; g.fillRect(-2000, FLOOR + 10, 6000, 900);
  drawGaps(g, slots);
  const front = [];
  rooms.forEach((r, i) => {
    if (!r) return;
    const d = r.drop == null ? 1 : r.drop;
    if (d <= 0) return;
    g.save();
    if (d < 1) { g.translate(0, -(1 - d) * 420); }
    if (r.alpha != null) g.globalAlpha *= r.alpha;
    drawRoom(g, now, i, r, front);
    g.restore();
  });
  if (o.throne !== false) drawThrone(g, slots, o.throne || 'purple');
  if (o.boss) {
    const bx = slots * ROOM_W + ROOM_W * .6;
    const b = o.boss;
    demonAura(g, now / 1000, bx, FLOOR, 250, BOSS_H, false, b.aura || 1);
    drawBoss(g, b.key || 'azzaroth', b.clip || 'idle', b.t != null ? b.t : now / 1000, bx, FLOOR + 2, BOSS_H * (b.scale || 1), b);
    demonAura(g, now / 1000, bx, FLOOR, 250, BOSS_H, true);
  }
  return front;
}
function flush(front) { for (const f of front) f(); }

// the arena's lightning (drawArenaFX) — purple underglow + white core, at the castle
function arenaBolt(g, worldRight, a) {
  const bgH = 420 * 1.16, bgW = bgH * 2171 / 724, x0 = worldRight - bgW, top = FLOOR - .76 * bgH;
  const bx = x0 + .885 * bgW, by = top + .02 * bgH;
  g.save(); g.globalAlpha *= a;
  bolt(g, bx, by, bx - 30, top + .42 * bgH, 99, '#b163ff', 5, 9, 30);
  g.restore();
}

// ground dust puff in world space (for slams / footfalls)
function dust(g, age, x, y, seed, n = 18, spread = 120, sz = 1, alpha = .8) {
  burst(g, age, { x, y, n, seed, speed: [30, spread * 2], angle: [Math.PI + .15, Math.PI * 2 - .15], life: [.5, 1.1], size: [4 * sz, 11 * sz], gy: -30, drag: 3.5, cols: ['#6d6154', '#8a7d6c', '#4a4038'], add: false, shape: 'dot', alpha });
}
// stone debris (smashDoorway colours)
function debris(g, age, x, y, seed, n = 22, pw = 1) {
  burst(g, age, { x, y, n, seed, speed: [120 * pw, 420 * pw], angle: [-Math.PI * .95, -Math.PI * .05], life: [.7, 1.4], size: [3, 8], gy: 900, drag: .6, cols: ['#9aa4b2', '#6d6154', '#3a3430'], add: false, shape: 'shard', spin: 30 });
}

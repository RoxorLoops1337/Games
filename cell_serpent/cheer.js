// 02-animal-art (round 4): the pets cheer when the duo is on a kill streak (5, 10, 20, 35, 50 in a row),
// and the outfit hat gets its own idle life (pumpkin glow, shades glint, falling petals, snowflakes, confetti).
// Pure drawing helpers: render.js owns the context and passes it in. No allocations per frame (fixed pool).
const TAU = Math.PI * 2;
export const STREAKS = [5, 10, 20, 35, 50];

export function createCheer() {
  let prev = 0, lastT = -1, t = 0, tier = -1;
  const pool = Array.from({ length: 36 }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, kind: 0, r: 6, rot: 0 }));
  function spawn(x, y, kind, vx, vy, r) {
    for (const q of pool) if (!q.on) { q.on = true; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.kind = kind; q.r = r; q.life = q.max = 0.9 + Math.random() * 0.5; q.rot = Math.random() * 6; return q; }
    return null;
  }
  return {
    get t() { return t; }, get tier() { return tier; },
    // call once per frame with the live game and the frame time; returns true on the frame a milestone is hit
    step(g, dt) {
      if (!g) return false;
      if (g.t < lastT - 1) { prev = 0; t = 0; tier = -1; for (const q of pool) q.on = false; }   // a new run
      lastT = g.t;
      const c = g.combo || 0, alive = g.t - (g.lastKill || -99) < 2.2;
      let hit = false;
      if (alive && c > prev) { for (let i = STREAKS.length - 1; i >= 0; i--) if (prev < STREAKS[i] && c >= STREAKS[i]) { tier = i; t = 1; hit = true; break; } }
      prev = alive ? c : 0;
      if (t > 0) t = Math.max(0, t - dt / 1.5);
      return hit;
    },
    // how far through the cheer (0 start .. 1 end), for a pet that starts `delay` seconds late
    u(delay) { return t > 0 ? Math.min(1, Math.max(0, 1 - t - delay / 1.5)) : 1; },
    // extra hop height (px), a rotation for the flip and the happy flag for one pet
    pet(i, s2) {
      if (t <= 0) return null;
      const u = this.u(i * 0.12); if (u >= 1 || u <= 0) return null;
      const amp = 20 + tier * 6, n = 3 + (tier > 2 ? 1 : 0);
      const y = Math.abs(Math.sin(u * Math.PI * n)) * amp * (1 - u * 0.5);
      const flip = tier >= 2 ? s2 * TAU * Math.min(1, u * 2.2) : 0;
      return { y, flip, sq: 1 + Math.sin(u * Math.PI * n * 2) * 0.05 };
    },
    burst(x, y, tierN, petId) {
      const n = 5 + tierN * 2, sig = EMOTE[petId];   // 02-animal-art r5: every pet cheers with its own emote
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4; spawn(x, y, sig && i % 2 === 0 ? sig : (i + tierN) % 3, Math.cos(a) * (70 + Math.random() * 110), Math.sin(a) * (110 + Math.random() * 120), 6 + Math.random() * 4); }
    },
    // the duo itself hops with its arms up on a streak: extra lift (px), a little sway and a squash
    duo(tm) {
      if (t <= 0) return null;
      const u = this.u(0.05); if (u >= 1 || u <= 0) return null;
      const n = 2 + (tier > 1 ? 1 : 0), w = Math.abs(Math.sin(u * Math.PI * n)) * (1 - u * 0.4);
      return { y: w * (12 + tier * 3), rot: Math.sin(u * Math.PI * n * 2) * 0.05, sq: 1 + w * 0.05 };
    },
    draw(ctx, dt, kit, sparkleAt, blit) {
      for (const q of pool) {
        if (!q.on) continue;
        q.life -= dt; if (q.life <= 0) { q.on = false; continue; }
        q.vy += 260 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.985; q.rot += dt * 4;
        const f = q.life / q.max, a = Math.min(1, f * 2.5);
        ctx.save(); ctx.globalAlpha *= a;
        if (q.kind === 0) heart(ctx, q.x, q.y, q.r * (0.8 + 0.3 * f), '#ff7eb6');
        else if (q.kind === 1) { const nt = kit && kit.SPR.note(false); if (nt) blit(nt, q.x, q.y, 34, Math.sin(q.rot) * 0.4); }
        else if (q.kind === 2) sparkleAt(q.x, q.y, q.r * 1.5);
        else EMOTE_DRAW[q.kind](ctx, q.x, q.y, q.r, q.rot);
        ctx.restore();
      }
    },
  };
}

// pet signature emotes (particle kinds 3..8): kitten paw print, puppy bone, piglet nose heart, lamb cloud, hamster seed, turtle star
export const EMOTE = { kitten: 3, puppy: 4, piglet: 5, lamb: 6, hamster: 7, turtle: 8 };
const INKC = '#3a1d33';
const EMOTE_DRAW = {
  3(ctx, x, y, r, rot) {   // paw print
    ctx.translate(x, y); ctx.rotate(Math.sin(rot) * 0.4); ctx.fillStyle = '#ffb04d'; ctx.strokeStyle = INKC; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.ellipse(0, 3, r * 0.9, r * 0.75, 0, 0, TAU); ctx.fill(); ctx.stroke();
    for (const [dx, dy] of [[-1.1, -0.8], [-0.4, -1.5], [0.4, -1.5], [1.1, -0.8]]) { ctx.beginPath(); ctx.ellipse(dx * r * 0.8, dy * r * 0.8 - 1, r * 0.32, r * 0.4, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
  },
  4(ctx, x, y, r, rot) {   // bone
    ctx.translate(x, y); ctx.rotate(Math.sin(rot) * 0.8); ctx.fillStyle = '#fff4dc'; ctx.strokeStyle = INKC; ctx.lineWidth = 1.8; const L = r * 1.1, k = r * 0.5;
    ctx.beginPath(); ctx.rect(-L, -k * 0.45, L * 2, k * 0.9); ctx.fill();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * L, sy * k * 0.6, k * 0.62, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.rect(-L, -k * 0.45, L * 2, k * 0.9); ctx.fillStyle = '#fff4dc'; ctx.fill();
  },
  5(ctx, x, y, r) { heart(ctx, x, y, r * 0.9, '#ff5a8a'); },
  6(ctx, x, y, r) {   // fluffy cloud
    ctx.translate(x, y); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#8aa0d0'; ctx.lineWidth = 1.8;
    ctx.beginPath(); for (const [dx, dy, rr] of [[-0.9, 0.3, 0.7], [0, -0.3, 0.95], [0.95, 0.3, 0.7]]) { ctx.moveTo(dx * r + rr * r, dy * r); ctx.arc(dx * r, dy * r, rr * r, 0, TAU); } ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, r * 0.2, r * 0.62, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
  },
  7(ctx, x, y, r, rot) {   // sunflower seed
    ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = '#e9e2cf'; ctx.strokeStyle = INKC; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.55, r * 0.95, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#6a5a4a'; ctx.beginPath(); ctx.moveTo(0, -r * 0.7); ctx.lineTo(0, r * 0.7); ctx.stroke();
  },
  8(ctx, x, y, r, rot) {   // little green star
    ctx.translate(x, y); ctx.rotate(rot * 0.5); ctx.fillStyle = '#9dff6d'; ctx.strokeStyle = INKC; ctx.lineWidth = 1.8; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, rr = i % 2 ? r * 0.5 : r * 1.1; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  },
};

export function drawEmote(ctx, x, y, r, rot, kind) { const f = EMOTE_DRAW[kind]; if (f) f(ctx, x, y, r, rot); }
export function heart(ctx, x, y, k, col) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = col; ctx.strokeStyle = '#4a1a33'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(0, k); ctx.bezierCurveTo(-k * 2, -k * 0.6, -k * 0.8, -k * 1.8, 0, -k * 0.6); ctx.bezierCurveTo(k * 0.8, -k * 1.8, k * 2, -k * 0.6, 0, k); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---- hat idle animations. Drawn in hat space: (0,0) is the middle of the brim (the baked sprite is 96 wide on screen,
// the hat art is about 60 units wide, so one hat unit is 1.116 px and the brim sits about 9px below the sprite centre).
const K = 1.116, OY = 8.9;
const hx = x => x * K, hy = y => y * K + OY;
function glint(ctx, x, y, r, a) { ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.22, y - r * 0.22); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.22, y + r * 0.22); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.22, y + r * 0.22); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.22, y - r * 0.22); ctx.closePath(); ctx.fill(); ctx.restore(); }
function dot(ctx, x, y, r, col, a) { ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore(); }
const saw = (t, p, o = 0) => ((t / p + o) % 1 + 1) % 1;

export const HAT_FX = {
  '🎃': (ctx, t, e) => {   // the carved face glows like a candle and sends up embers
    const fl = 0.55 + 0.25 * Math.sin(t * 9) + 0.15 * Math.sin(t * 23.7) + e * 0.4;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const s of [-1, 1]) { const g = ctx.createRadialGradient(hx(s * 9), hy(-8), 0, hx(s * 9), hy(-8), 15); g.addColorStop(0, `rgba(255,225,90,${0.85 * fl})`); g.addColorStop(1, 'rgba(255,150,30,0)'); ctx.fillStyle = g; ctx.fillRect(hx(s * 9) - 16, hy(-8) - 16, 32, 32); }
    const g2 = ctx.createRadialGradient(hx(0), hy(6), 0, hx(0), hy(6), 18); g2.addColorStop(0, `rgba(255,200,60,${0.75 * fl})`); g2.addColorStop(1, 'rgba(255,120,20,0)'); ctx.fillStyle = g2; ctx.fillRect(hx(0) - 20, hy(6) - 16, 40, 32);
    ctx.restore();
    for (let i = 0; i < 2; i++) { const f = saw(t, 1.6, i * 0.5); dot(ctx, hx(-6 + i * 12) + Math.sin(f * 7 + i) * 4, hy(-24) - f * 26, 2 * (1 - f) + 0.6, '#ffd84d', Math.sin(f * Math.PI)); }
  },
  '🕶️': (ctx, t) => {   // a glint slides across both lenses every few seconds
    const f = saw(t, 3.2); if (f > 0.35) return; const u = f / 0.35;
    ctx.save(); ctx.globalAlpha = Math.sin(u * Math.PI) * 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    for (const c of [-12, 12]) { const x = hx(c - 8 + u * 16); ctx.beginPath(); ctx.moveTo(x - 2, hy(-4)); ctx.lineTo(x + 2, hy(4)); ctx.stroke(); }
    ctx.restore(); glint(ctx, hx(26), hy(-14), 6 + Math.sin(u * Math.PI) * 3, Math.sin(u * Math.PI));
  },
  '🌸': (ctx, t) => {   // petals loosen and drift down past the face
    for (let i = 0; i < 3; i++) { const f = saw(t, 3.4, i / 3), x = hx(-18 + i * 18) + Math.sin(f * 9 + i * 2) * 8, y = hy(0) + f * 52;
      ctx.save(); ctx.globalAlpha = Math.sin(f * Math.PI) * 0.95; ctx.translate(x, y); ctx.rotate(f * 8 + i); ctx.fillStyle = i % 2 ? '#ffb3cf' : '#fff4dc'; ctx.strokeStyle = '#7a3a5a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(0, 0, 4.2, 2.6, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore(); }
  },
  '✨': (ctx, t) => {   // the tip twinkles and little confetti dots fall off the brim
    glint(ctx, hx(0), hy(-36), 7 + Math.sin(t * 6) * 3, 0.6 + 0.4 * Math.sin(t * 6));
    const cols = ['#ff7eb6', '#6fe3ff', '#ffe14a'];
    for (let i = 0; i < 3; i++) { const f = saw(t, 1.9, i / 3), s = i % 2 ? 1 : -1; dot(ctx, hx(s * (12 + i * 5)) + Math.sin(f * 6 + i) * 5, hy(6) + f * 44, 2.2, cols[i], Math.sin(f * Math.PI)); }
  },
  '⛄': (ctx, t) => {   // soft snowflakes
    for (let i = 0; i < 4; i++) { const f = saw(t, 3.0, i / 4), x = hx(-24 + i * 16) + Math.sin(f * 6 + i * 1.7) * 6, y = hy(-24) + f * 62; dot(ctx, x, y, 2.4 - f * 0.8, '#fff', Math.sin(f * Math.PI) * 0.95); }
  },
  '🌈': (ctx, t) => {   // a colour shimmer runs along the puffs
    const cols = ['#ff5a78', '#ff9a2e', '#ffe14a', '#7ad04a', '#4fc8ff', '#b06cff'];
    const f = saw(t, 2.4), a = Math.PI + f * Math.PI, c = cols[Math.floor(f * 6) % 6];
    glint(ctx, hx(Math.cos(a) * 22), hy(Math.sin(a) * 18 + 2), 6, Math.sin(f * Math.PI)); dot(ctx, hx(Math.cos(a) * 22), hy(Math.sin(a) * 18 + 2), 3, c, 0.5 * Math.sin(f * Math.PI));
  },
  '🎩': (ctx, t, e) => {   // a gleam rolls up the crown; on a streak the hat is doffed by render.js
    const f = saw(t, 3.6); if (f < 0.3) { const u = f / 0.3; ctx.save(); ctx.globalAlpha = Math.sin(u * Math.PI) * 0.8; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx(-10), hy(2 - u * 26)); ctx.lineTo(hx(-10), hy(-4 - u * 26)); ctx.stroke(); ctx.restore(); }
    if (e > 0.2) glint(ctx, hx(14), hy(-24), 7 * e, e);
  },
  '🌾': (ctx, t) => {   // a golden seed pops off the wheat and a butterfly passes by
    const f = saw(t, 2.2); dot(ctx, hx(15) + Math.sin(f * 5) * 5, hy(-16) - f * 24, 2.6, '#ffe14a', Math.sin(f * Math.PI));
    const b = saw(t, 7); if (b < 0.5) { const u = b / 0.5, x = hx(-34 + u * 68), y = hy(-24) + Math.sin(u * 9) * 8 - u * 6, w = Math.abs(Math.sin(t * 22)) * 5 + 1;
      ctx.save(); ctx.translate(x, y); ctx.globalAlpha = Math.sin(u * Math.PI); ctx.fillStyle = '#ffb04d'; ctx.strokeStyle = '#4a2a1a'; ctx.lineWidth = 1.2; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * w * 0.7, -1, w, 3.4, s * 0.5, 0, TAU); ctx.fill(); ctx.stroke(); } ctx.restore(); }
  },
};

// the hat reaction on a kill streak: a hop, a tilt and (top hat) a doff lifted off the head. e = 0..1 how strong right now
export function hatPose(hat, e, t) {
  if (e <= 0) return { dy: 0, rot: 0, sx: 1 };
  const w = Math.sin(e * Math.PI);
  if (hat === '🎩') return { dy: -w * 20, rot: -w * 0.6, sx: 1 };
  return { dy: -w * 8 - Math.abs(Math.sin(t * 22)) * e * 3, rot: Math.sin(t * 26) * 0.12 * e, sx: 1 + w * 0.08 };
}

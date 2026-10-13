// Ludus Maximus 3D fight camera director. Pure math, no three.js dependency, ES module, runs in Node.
//
// Coordinates: arena plane (x, y) in meters, arena center (0,0), radius 8.6. World mapping used here:
//   world X = x, world Y = up, world Z = y.  (If your scene maps y to -z, flip at the call site.)
// Usage:
//   const dir = new FightDirector({ aspect: innerWidth / innerHeight });
//   dir.setShot('establishing');                       // then 'gate', 'follow' ...
//   const pose = dir.update(realDt, units);            // units: [{id, x, y, vx, vy, team, alive}]
//   camera.position.set(pose.pos.x, pose.pos.y, pose.pos.z); camera.lookAt(pose.look.x, pose.look.y, pose.look.z);
//   camera.fov = pose.fov; camera.updateProjectionMatrix();  simDt = realDt * pose.timeScale;
// Pose fields: pos, look, fov (VERTICAL degrees), timeScale (slow-mo cue 0.15..1), shake (0..1 trauma), shot (name), done (shot finished).

const D2R = Math.PI / 180, TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const wrap = (a) => { a %= TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a; };
const angDelta = (from, to) => wrap(to - from);

// Critically damped spring (Unity SmoothDamp). vel stored in obj[key+'V'].
function sd(o, k, target, smooth, dt, maxSpeed = Infinity) {
  smooth = Math.max(1e-4, smooth); const w = 2 / smooth, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let ch = o[k] - target; const lim = maxSpeed * smooth; ch = clamp(ch, -lim, lim);
  const t2 = o[k] - ch, tmp = (o[k + 'V'] + w * ch) * dt; o[k + 'V'] = (o[k + 'V'] - w * tmp) * e;
  let out = t2 + (ch + tmp) * e; if ((target - o[k] > 0) === (out > target)) { out = target; o[k + 'V'] = 0; } o[k] = out;
}
function sdAngle(o, k, target, smooth, dt, maxSpeed) { const cur = o[k]; const t = cur + angDelta(cur, target); sd(o, k, t, smooth, dt, maxSpeed); o[k] = wrap(o[k]); }

// ---------- camera math ----------
// PERF: update() asks for a handful of (yaw, pitch) bases per frame (needD, camPos, recenter, both candidate yaws of _pickYaw): a ring of 8 pooled entries memoised on the
// exact arguments, so a steady frame allocates none. Callers only read the result and never hold it across other basis() calls.
const _BR = []; let _bN = 0;
for (let i = 0; i < 8; i++) _BR.push({ y: NaN, p: NaN, f: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0] });
function basis(yaw, pitch) { // forward looks along horizontal yaw, pitched DOWN by pitch (negative = looks up)
  for (let i = 0; i < 8; i++) { const e = _BR[i]; if (e.y === yaw && e.p === pitch) return e; }
  const e = _BR[_bN]; _bN = (_bN + 1) & 7; const f = e.f, r = e.r, u = e.u;
  const cp = Math.cos(pitch); f[0] = cp * Math.cos(yaw); f[1] = -Math.sin(pitch); f[2] = cp * Math.sin(yaw);
  const rx = -f[2], rz = f[0]; let l = Math.sqrt(rx * rx + rz * rz); if (!l) l = 1; r[0] = rx / l; r[1] = 0; r[2] = rz / l; // cross(f, up)
  u[0] = r[1] * f[2] - r[2] * f[1]; u[1] = r[2] * f[0] - r[0] * f[2]; u[2] = r[0] * f[1] - r[1] * f[0];
  e.y = yaw; e.p = pitch; return e;
}
// Fix: r = cross(f, up) = (-f.z, 0, f.x) normalised; u = cross(r, f). Verified in tests.

// Points for fit: per unit foot + head, lateral/vertical padding handled in needD.
// PERF: one pooled list of pooled [x, y, z] triples (rewritten each call; the result is only valid until the next unitPts call, the director uses one per frame).
const _PP = []; let _PL = 0; const _PTS = [];
function ptAdd(x, y, z) { let q = _PP[_PL]; if (!q) q = _PP[_PL] = [0, 0, 0]; _PL++; q[0] = x; q[1] = y; q[2] = z; _PTS[_PTS.length] = q; }
function unitPts(units, lead, h = 2.2) {
  _PL = 0; _PTS.length = 0;
  for (let i = 0; i < units.length; i++) { const u = units[i], x = u.x + (u.vx || 0) * lead, z = u.y + (u.vy || 0) * lead; ptAdd(x, 0, z); ptAdd(x, u.h || h, z); if (u.r) { ptAdd(x + u.r, 0, z); ptAdd(x - u.r, 0, z); ptAdd(x, 0, z + u.r); ptAdd(x, 0, z - u.r); } } // BEAST: u.h / u.r = big beast height and body radius
  return _PTS;
}
function centroid(pts, c) { c = c || [0, 0, 0]; let sx = 0, sy = 0, sz = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i]; sx += p[0]; sy += p[1]; sz += p[2]; } const n = pts.length || 1; c[0] = sx / n; c[1] = sy / n; c[2] = sz / n; return c; }

// Re-center on the screen-space middle of the points (symmetric framing for any direction). out: optional result array.
const _RC = [0, 0, 0];
function recenter(pts, yaw, pitch, out) {
  const B = basis(yaw, pitch), r = B.r, u = B.u, o = centroid(pts, _RC); let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
  const o0 = o[0], o1 = o[1], o2 = o[2], r0 = r[0], r2 = r[2], u0 = u[0], u1 = u[1], u2 = u[2];
  for (let i = 0; i < pts.length; i++) { const p = pts[i], x = (p[0] - o0) * r0 + (p[2] - o2) * r2, y = (p[0] - o0) * u0 + (p[1] - o1) * u1 + (p[2] - o2) * u2; if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y; }
  const cr = (a + b) / 2, cu = (c + d) / 2; out = out || [0, 0, 0];
  out[0] = o0 + r0 * cr + u0 * cu; out[1] = o1 + u1 * cu; out[2] = o2 + r2 * cr + u2 * cu; return out;
}
// Minimal camera distance so every point (padded) is inside |ndc| <= margin.
function needD(pts, c, yaw, pitch, tanV, tanH, margin, padX, padY) {
  const B = basis(yaw, pitch), f = B.f, r = B.r, u = B.u; let d = 0; const mh = margin * tanH, mv = margin * tanV, c0 = c[0], c1 = c[1], c2 = c[2], f0 = f[0], f1 = f[1], f2 = f[2], r0 = r[0], r2 = r[2], u0 = u[0], u1 = u[1], u2 = u[2];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], x = p[0] - c0, y = p[1] - c1, z = p[2] - c2;
    let rr = x * r0 + z * r2; if (rr < 0) rr = -rr; rr += padX; let uu = x * u0 + y * u1 + z * u2; if (uu < 0) uu = -uu; uu += padY; const ff = x * f0 + y * f1 + z * f2;
    const d1 = rr / mh - ff, d2 = uu / mv - ff; if (d1 > d) d = d1; if (d2 > d) d = d2;
  }
  return d;
}
const camPos = (c, yaw, pitch, d, out) => { const f = basis(yaw, pitch).f; out = out || [0, 0, 0]; out[0] = c[0] - f[0] * d; out[1] = c[1] - f[1] * d; out[2] = c[2] - f[2] * d; return out; };

export class FightDirector {
  constructor(o = {}) {
    this.R = o.radius ?? 8.6; this.wallMargin = o.wallMargin ?? 0.35; this.aspect = o.aspect ?? 16 / 9;
    this.maxD = o.maxDist ?? 60; this.minHeight = o.minHeight ?? 0.55; this.gateAngle = o.gateAngle ?? Math.PI; this.freeTimeout = o.freeTimeout ?? 6;
    this.units = []; this.living = [];
    this.s = { yaw: 0, yawV: 0, pitch: 0.4, pitchV: 0, cx: 0, cxV: 0, cy: 1, cyV: 0, cz: 0, czV: 0, d: 14, dV: 0, fov: 50, fovV: 0 }; // smoothed state
    this.pose = { pos: { x: 0, y: 8, z: 12 }, look: { x: 0, y: 1, z: 0 }, fov: 50, timeScale: 1, shake: 0, shot: '', done: false };
    this.shot = null; this.base = null; this.t = 0; this.blend = 1; this.blendDur = 0.8; this.from = null; this.trauma = 0; this.free = null; this.lastYaw = 0; this.started = false;
    this.setShot('establishing', {}, 0);
  }
  setAspect(a) { this.aspect = clamp(a, 0.3, 4); }
  get portrait() { return this.aspect < 1; }
  // aspect factor: 0 = wide landscape, 1 = tall phone
  get tall() { return 1 - ease((this.aspect - 0.5) / 0.9); }

  // ----- shot control -----
  // names: establishing | gate | follow | duel | ultimate | kill | victory. params per shot below.
  setShot(name, params = {}, blend) {
    const prev = this.shot; this.shot = { name, p: params, t0: 0 }; this.t = 0;
    if (!['ultimate', 'kill'].includes(name)) this.base = this.shot;
    this.blendDur = blend ?? { establishing: 0, gate: 0.4, follow: 0.9, duel: 0.9, ultimate: 0.18, kill: 0.25, victory: 1.0 }[name] ?? 0.8;
    this.blend = this.blendDur <= 0 || !this.started ? 1 : 0; this.from = this.blend < 1 ? { ...this.s } : null;
    this.pose.done = false; if (name === 'follow' || name === 'duel') this.lastYawKeep = true; return prev;
  }
  // Transient shots that return to the previous base shot. ultimate: {unit, target} (ids) ; kill: {victim, killer}
  cue(name, params = {}) { const back = this.base; this.setShot(name, { ...params, back }); }
  kick(a = 0.5) { this.trauma = Math.min(1, this.trauma + a); }
  // Player free orbit override (drag = nudge). release() returns to the director shot.
  freeOrbit(dYaw = 0, dPitch = 0, dZoom = 0) {
    if (!this.free) this.free = { yaw: this.s.yaw, pitch: this.s.pitch, d: this.s.d, idle: 0 };
    const f = this.free; f.yaw = wrap(f.yaw + dYaw); f.pitch = clamp(f.pitch + dPitch, 4 * D2R, 80 * D2R); f.d = clamp(f.d * (1 + dZoom), 3, 40); f.idle = 0;
  }
  /** INTRO: continue from an authored camera pose (pos/look/fov) so the hand-off to the first director shot has no jump */
  seedFromPose(pose) {
    const fx = pose.look.x - pose.pos.x, fy = pose.look.y - pose.pos.y, fz = pose.look.z - pose.pos.z, d = Math.hypot(fx, fy, fz) || 1, s = this.s;
    s.yaw = Math.atan2(fz, fx); s.pitch = -Math.asin(clamp(fy / d, -1, 1)); s.cx = pose.look.x; s.cy = pose.look.y; s.cz = pose.look.z; s.d = d; s.fov = pose.fov;
    s.yawV = s.pitchV = s.cxV = s.cyV = s.czV = s.dV = s.fovV = 0; this.started = true;
  }
  release() { this.free = null; this.blend = 0; this.blendDur = 0.9; this.from = { ...this.s }; }

  // ----- per frame -----
  update(dt, units) {
    dt = clamp(dt, 0, 0.1); this.units = units || this.units;
    // smoothed velocities (look-ahead must not jump when a fighter dashes or stops)
    // PERF: the smoothed copies are pooled objects (one per unit id, fields rewritten) and the two lists are reused arrays: no spread, map or filter per frame
    const k = 1 - Math.exp(-dt / 0.3); const sv = this.sv || (this.sv = new Map()), src = this.units, ua = this._ua || (this._ua = []), la = this._la || (this._la = []);
    let nu = 0, nl = 0;
    for (let i = 0; i < src.length; i++) {
      const u = src[i]; let v = sv.get(u.id); if (!v) { v = { x: u.vx || 0, y: u.vy || 0, o: {} }; sv.set(u.id, v); }
      v.x += ((u.vx || 0) - v.x) * k; v.y += ((u.vy || 0) - v.y) * k; const o = v.o;
      o.id = u.id; o.x = u.x; o.y = u.y; o.team = u.team; o.alive = u.alive; o.h = u.h; o.r = u.r; o.vx = v.x; o.vy = v.y;
      ua[nu++] = o; if (o.alive !== false) la[nl++] = o;
    }
    ua.length = nu; la.length = nl; this.units = ua; this.living = la;
    this.t += dt; this.trauma = this.trauma - dt * 1.6 > 0 ? this.trauma - dt * 1.6 : 0;
    if (this.free) { this.free.idle += dt; if (this.freeTimeout && this.free.idle > this.freeTimeout) this.release(); }
    const w = this._want(dt);
    // blend params from snapshot (PERF: scalars, no spread objects; same arithmetic)
    const wst = w.st; let tyaw = w.yaw, tpitch = w.pitch, tcx = w.c[0], tcy = w.c[1], tcz = w.c[2], td = w.d, tfov = w.fov, kk = 1;
    if (this.blend < 1 && this.from) {
      this.blend = Math.min(1, this.blend + dt / Math.max(0.01, this.blendDur)); const k = ease(this.blend), f = this.from;
      tyaw = f.yaw + angDelta(f.yaw, w.yaw) * k; tpitch = lerp(f.pitch, w.pitch, k); tcx = lerp(f.cx, w.c[0], k); tcy = lerp(f.cy, w.c[1], k); tcz = lerp(f.cz, w.c[2], k); td = lerp(f.d, w.d, k); tfov = lerp(f.fov, w.fov, k);
      kk = 0.5;
    }
    const s = this.s, st = wst;
    if (!this.started) { s.yaw = tyaw; s.pitch = tpitch; s.cx = tcx; s.cy = tcy; s.cz = tcz; s.d = td; s.fov = tfov; this.started = true; }
    sdAngle(s, 'yaw', tyaw, st.yaw * kk, dt, st.yawMax ?? Infinity); sd(s, 'pitch', tpitch, st.pitch * kk, dt);
    sd(s, 'cx', tcx, st.c * kk, dt); sd(s, 'cy', tcy, st.c * kk, dt); sd(s, 'cz', tcz, st.c * kk, dt);
    sd(s, 'fov', tfov, st.fov * kk, dt);
    sd(s, 'd', td, (td > s.d ? st.dUp : st.d) * kk, dt); // expand fast, contract slow
    // ---- hard safety: guarantee framing + stay inside the bowl ----
    const c = this._cc || (this._cc = [0, 0, 0]); c[0] = s.cx; c[1] = s.cy; c[2] = s.cz; let pitch = s.pitch, d = s.d;
    const tanV = Math.tan(s.fov * D2R / 2), tanH = tanV * this.aspect;
    if (w.pts) { const nd = needD(w.pts, c, s.yaw, pitch, tanV, tanH, w.margin, w.padX, w.padY); if (nd > d) d = nd; }
    d = clamp(d, 1.5, this.maxD);
    const rMax = w.rMax ?? this.R - this.wallMargin; const pos = camPos(c, s.yaw, pitch, d, this._cp || (this._cp = [0, 0, 0])); // soft limit lives in the (smoothed) target; this is only the emergency clamp just inside the wall
    let pr = Math.sqrt(pos[0] * pos[0] + pos[2] * pos[2]);
    if (!w.noWall && pr > rMax + 0.25) { const q = this._lift(w.pts, c, s.yaw, pitch, d, tanV, tanH, w.margin, w.padX, w.padY, rMax + 0.25); pitch = q.pi; d = q.d; camPos(c, s.yaw, pitch, d, pos); pr = Math.sqrt(pos[0] * pos[0] + pos[2] * pos[2]); }
    if (pr > rMax && !w.pts) { const k = rMax / pr; pos[0] *= k; pos[2] *= k; } // unframed shots: push in
    if (pos[1] < this.minHeight) pos[1] = this.minHeight;
    const P = this.pose; P.pos.x = pos[0]; P.pos.y = pos[1]; P.pos.z = pos[2]; P.look.x = c[0]; P.look.y = c[1]; P.look.z = c[2]; P.fov = s.fov;
    P.timeScale = w.timeScale ?? 1; P.shake = this.trauma * this.trauma; P.shot = this.free ? 'free' : this.shot.name; this.lastYaw = s.yaw;
    return P;
  }

  // Smallest pitch >= pitch0 at which the camera sits inside the bowl (bisection, so it is continuous in the inputs).
  _lift(pts, c, yaw, pitch0, dMin, tanV, tanH, margin, padX, padY, rMax, extra = 0) {
    const q = this._lq || (this._lq = { pi: 0, d: 0, r: 0 }), P = this._lp || (this._lp = [0, 0, 0]);
    this._liftAt(q, P, pts, c, yaw, pitch0, dMin, tanV, tanH, margin, padX, padY, extra); if (q.r <= rMax) return q;
    let lo = pitch0, hi = 86 * D2R; this._liftAt(q, P, pts, c, yaw, hi, dMin, tanV, tanH, margin, padX, padY, extra); if (q.r > rMax) return q;
    let bp = hi, bd = q.d;   // best (smallest pitch inside the bowl) so far
    for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; this._liftAt(q, P, pts, c, yaw, m, dMin, tanV, tanH, margin, padX, padY, extra); if (q.r <= rMax) { hi = m; bp = m; bd = q.d; } else lo = m; }
    q.pi = bp; q.d = bd; return q;
  }
  _liftAt(q, P, pts, c, yaw, pi, dMin, tanV, tanH, margin, padX, padY, extra) { // camera distance and ground radius at pitch pi
    let d = dMin; if (pts) { const nd = needD(pts, c, yaw, pi, tanV, tanH, margin, padX, padY) + extra; if (nd > d) d = nd; } if (d > this.maxD) d = this.maxD;
    camPos(c, yaw, pi, d, P); q.pi = pi; q.d = d; q.r = Math.sqrt(P[0] * P[0] + P[2] * P[2]);
  }
  _fov(base) { return base + this.tall * 10; } // phones: wider vertical fov so a narrow horizontal view still sees the action
  // Choose yaw (+pi alternative) to minimise forced pitch raise; sticky to current yaw.
  _pickYaw(pts, yaw, pitch, fov) {
    let best = yaw, bestScore = 1e9;
    const tanV = Math.tan(fov * D2R / 2), tanH = tanV * this.aspect, c = this._pc || (this._pc = [0, 0, 0]), pos = this._pp || (this._pp = [0, 0, 0]);
    for (let i = 0; i < 2; i++) {
      const y = i ? yaw + Math.PI : yaw; recenter(pts, y, pitch, c); const d = needD(pts, c, y, pitch, tanV, tanH, 0.9, 0.6, 0.3); camPos(c, y, pitch, d, pos);
      const over0 = Math.sqrt(pos[0] * pos[0] + pos[2] * pos[2]) - (this.R - this.wallMargin), over = over0 > 0 ? over0 : 0, stick = Math.abs(angDelta(this.s.yaw, y)) / Math.PI * 10;
      if (bestScore > over + stick) { bestScore = over + stick; best = y; }
    }
    return best;
  }

  _want(dt) {
    if (this.free) return this._free();
    const sh = this.shot, p = sh.p, t = this.t, L = this.living, tall = this.tall;
    const fovF = this._fov(48), ST = (yaw, pitch, c, d, dUp, fov) => ({ yaw, pitch, c, d, dUp, fov });
    const ctx = { L, t, tall, p };
    switch (sh.name) {
      case 'establishing': return this._establishing(ctx);
      case 'gate': return this._gate(ctx);
      case 'ultimate': return this._ultimate(ctx);
      case 'kill': return this._kill(ctx);
      case 'victory': return this._victory(ctx);
      case 'duel': { const r = this._duel(ctx); if (r) return r; return this._follow(ctx, fovF); }
      default: return this._follow(ctx, fovF);
    }
  }
  _endIf(dur, next) { if (this.t >= dur && !this.pose.done) { this.pose.done = true; if (next) { const n = typeof next === 'function' ? next() : next; if (n) this.setShot(n.name, n.p, n.blend); } } }
  _frame({ pts, yaw, pitch, fov, margin = 0.9, minD = 3, padX = 0.6, padY = 0.3, extra = 0, st, timeScale, recen = true, c0, rMax, noWall }) {
    const tanV = Math.tan(fov * D2R / 2), tanH = tanV * this.aspect;
    const c = recen ? recenter(pts, yaw, pitch, this._fc || (this._fc = [0, 0, 0])) : c0;
    let pi = pitch; const nd = needD(pts, c, yaw, pi, tanV, tanH, margin, padX, padY); let d = (minD > nd ? minD : nd) + extra;
    if (!noWall) { const q = this._lift(pts, c, yaw, pitch, minD, tanV, tanH, margin, padX, padY, rMax ?? this.R - this.wallMargin, extra); pi = q.pi; d = q.d; }
    return { yaw, pitch: pi, c, d: Math.min(d, this.maxD), fov, pts, margin, padX, padY, st, timeScale, rMax, noWall };
  }
  _free() {
    const f = this.free, L = this.living, c = L.length ? centroid(unitPts(L, 0, 1.4), this._fr || (this._fr = [0, 0, 0])) : [0, 1, 0]; c[1] = 1.2;
    return { yaw: f.yaw, pitch: f.pitch, c, d: f.d, fov: this._fov(48), st: { yaw: 0.08, pitch: 0.08, c: 0.3, d: 0.1, dUp: 0.1, fov: 0.3 } };
  }
  _establishing({ t, tall }) {
    const dur = this.shot.p.dur ?? 4.5, k = clamp(t / dur, 0, 1), ring = []; const rr = 7 + 1.2 * (1 - k);
    for (let i = 0; i < 8; i++) ring.push([Math.cos(i * TAU / 8) * rr, 0, Math.sin(i * TAU / 8) * rr]);
    const yaw = (this.shot.p.yaw0 ?? 0.6) + t * (this.shot.p.speed ?? 0.5), pitch = lerp(32, 22, easeOut(k)) * D2R + tall * 10 * D2R;
    const r = this._frame({ pts: ring, yaw, pitch, fov: this._fov(52), margin: 0.82, minD: 6, padX: 0.5, padY: 0.5, recen: false, c0: [0, 1.2, 0], st: { yaw: 0.05, pitch: 0.3, c: 0.2, d: 0.4, dUp: 0.3, fov: 0.4 } });
    this._endIf(dur, this.shot.p.next ?? { name: 'gate' }); return r;
  }
  _gate({ L, t, p, tall }) {
    const dur = p.dur ?? 2.8, k = easeOut(t / dur), g = p.gateAngle ?? this.gateAngle, pts = L.length ? unitPts(L, 0.2) : [[0, 0, 0], [0, 2, 0]];
    const yaw = g + Math.PI + Math.sin(k * Math.PI) * 0.12, pitch = lerp(3, 13, k) * D2R + tall * 8 * D2R;
    const r = this._frame({ pts, yaw, pitch, fov: this._fov(46), margin: 0.9, minD: 4, extra: lerp(7, 0, k), recen: true, rMax: 12.5, noWall: false, st: { yaw: 0.15, pitch: 0.3, c: 0.3, d: 0.08, dUp: 0.08, fov: 0.3 } });
    this._endIf(dur, p.next ?? { name: 'follow' }); return r;
  }
  _follow({ L, t, tall }, fov) {
    const pts = unitPts(L.length ? L : [{ x: 0, y: 0 }], 0.25);
    // principal spread axis: landscape = side-on to the spread, portrait = along it (spread runs up the screen)
    let sx = 0, sy = 0, cx = 0, cy = 0; for (let i = 0; i < L.length; i++) { cx += L[i].x; cy += L[i].y; } cx /= L.length || 1; cy /= L.length || 1;
    for (let i = 0; i < L.length; i++) { const u = L[i]; sx += (u.x - cx) * (u.x - cx) - (u.y - cy) * (u.y - cy); sy += 2 * (u.x - cx) * (u.y - cy); }
    const phi = L.length > 1 && Math.sqrt(sx * sx + sy * sy) > 1e-3 ? 0.5 * Math.atan2(sy, sx) : this.s.yaw - Math.PI / 2;
    // PHONE (tall): spread runs up the screen but dead-on it stacks the fighters into one column, so the view is turned ~30 degrees off the spread axis (they separate sideways
    // and read as bodies, not a blob); a lower pitch (34, was 42 and then lifted to 48+ at 3v3 by the bowl limit) and tighter side padding / margin keep the camera
    // close enough that the bowl limit no longer forces a near top-down view, and the limit itself is 1.2 m looser on a phone (the camera clears the 3 m podium wall).
    let yaw = phi + (Math.PI / 2) * (1 - tall) + tall * 0.52; const pitch = lerp(24, 30, tall) * D2R + tall * 4 * D2R;
    yaw = this._pickYaw(pts, yaw, pitch, fov);
    return this._frame({ pts, yaw, pitch, fov, margin: lerp(0.86, 0.9, tall), minD: 7.5 - 1.5 * tall, padX: lerp(1.5, 0.8, tall), padY: 0.5, rMax: this.R - this.wallMargin + tall * 1.2, st: { yaw: 0.6, yawMax: 1.1, pitch: 0.5, c: 0.28, d: 0.7, dUp: 0.14, fov: 0.5 } });
  }
  _duel({ L, p, tall }) {
    const a = L.find((u) => u.id === p.a) || L[0], b = L.find((u) => u.id === p.b) || L.find((u) => u !== a); if (!a || !b) return null;
    const dx = b.x - a.x, dy = b.y - a.y, sep = Math.hypot(dx, dy) || 1, yaw0 = Math.atan2(dy, dx);
    const shoulder = (p.side ?? 1) * lerp(22, 14, tall) * D2R, pts = unitPts([a, b], 0.2), pitch = lerp(9, 16, tall) * D2R + tall * 6 * D2R;
    const fov = this._fov(46), r = this._frame({ pts, yaw: this._pickYawKeep(yaw0 + shoulder), pitch, fov, margin: 0.84, minD: sep / 2 + 2.4, padX: 0.8, st: { yaw: 0.35, pitch: 0.4, c: 0.2, d: 0.5, dUp: 0.12, fov: 0.4 } });
    return r;
  }
  _pickYawKeep(y) { return y; }
  _ultimate({ L, t, p, tall }) {
    const dur = p.dur ?? 1.6, u = this.units.find((x) => x.id === p.unit) || L[0], tg = this.units.find((x) => x.id === p.target);
    if (!u) return this._follow({ L, t, tall }, this._fov(48));
    const a = tg ? Math.atan2(tg.y - u.y, tg.x - u.x) : Math.atan2(-u.y, -u.x), k = easeOut(t / dur);
    if (p._side === undefined) { // pick the shoulder whose camera spot lies deeper inside the bowl
      const rad = (s) => Math.hypot(u.x + Math.cos(a + s) * 4, u.y + Math.sin(a + s) * 4); p._side = rad(50 * D2R) <= rad(-50 * D2R) ? 1 : -1; }
    const camA = a + p._side * 50 * D2R, yaw = camA + Math.PI;
    const c0 = [u.x, 1.45 + 0.1 * k, u.y], pts = [[u.x, 0, u.y], [u.x, 2.4, u.y]];
    const r = this._frame({ pts, yaw, pitch: lerp(-9, -3, k) * D2R, fov: lerp(46, 36, k) + tall * 6, margin: lerp(0.82, 0.7, tall), minD: lerp(4.4, 3.4, k), padX: 1.1, padY: 0.4, recen: false, c0, noWall: true, st: { yaw: 0.05, pitch: 0.1, c: 0.05, d: 0.1, dUp: 0.1, fov: 0.12 } });
    // slow-mo: hold ~0.2x then ramp back to 1
    r.timeScale = t < 0.45 ? 0.2 : lerp(0.2, 1, ease((t - 0.45) / (dur - 0.45)));
    this._endIf(dur, () => (p.back ? { name: p.back.name, p: p.back.p, blend: 0.45 } : { name: 'follow' })); this.pose.timeScale = r.timeScale; return r;
  }
  // Kill cam: side-on to the blow axis so the strike and the fall both read. Starts tight on killer and victim, then widens to take in the
  // flung limb and the fall spot (a point beyond the victim along the blow). Slow, short orbit (no whip), slow-mo through the fall.
  _kill({ L, t, p, tall }) {
    const dur = p.dur ?? 2.9, v = this.units.find((x) => x.id === p.victim) || p.at, kl = this.units.find((x) => x.id === p.killer);
    const vx = v?.x ?? 0, vy = v?.y ?? 0, near = !!(kl && Math.hypot(kl.x - vx, kl.y - vy) < 5);
    let bx = near ? vx - kl.x : vx, by = near ? vy - kl.y : vy; { const l = Math.hypot(bx, by) || 1; bx /= l; by /= l; } // blow direction (killer to victim)
    if (p._yaw0 === undefined) { // the shoulder whose camera spot lies deeper inside the bowl
      const a0 = Math.atan2(by, bx), spot = (sd) => Math.hypot(vx - Math.cos(a0 + sd * Math.PI / 2) * 6, vy - Math.sin(a0 + sd * Math.PI / 2) * 6);
      p.side = p.side ?? (spot(1) <= spot(-1) ? 1 : -1); p._yaw0 = a0 + p.side * Math.PI / 2; }
    const k = easeOut(t / dur), yaw = p._yaw0 + p.side * 0.5 * k, pitch = lerp(7, 15, k) * D2R + tall * 8 * D2R;
    const pts = [[vx, 0, vy], [vx, 1.9, vy], [vx + bx * 0.5, 1.3, vy + by * 0.5]];
    if (near) pts.push([kl.x, 0.2, kl.y], [kl.x, 2.2, kl.y]);
    const fall = ease((t - 0.25) / 0.9); pts.push([vx + bx * (0.6 + 1.5 * fall), 0.1, vy + by * (0.6 + 1.5 * fall)]); // the body going down
    if (p.extra && t > 0.5) for (const q of p.extra) if (Math.hypot(q[0] - vx, q[2] - vy) < 5.5) pts.push(q); // gore: keep the flung limb in frame once it is in the air (never pull wide for a far one)
    // tight (execution): the pair only, close and low, so a phone still sees the kneel, the blade and the blood (padX 0.9 would pull the camera back to 8 m on a 9:16 screen)
    const tt = p.tight ? 1 : 0, fallIdx = near ? 5 : 3, r = this._frame({ pts: tt ? pts.filter((_, i) => i !== fallIdx) : pts, yaw, pitch: tt ? pitch * 0.8 : pitch, fov: this._fov(38) + 2 * k, margin: tt ? 0.88 : lerp(0.8, 0.72, tall), minD: tt ? 2.6 : lerp(3.0, 3.8, k), padX: tt ? 0.4 : 0.9, padY: tt ? 0.25 : 0.3, st: { yaw: 0.12, pitch: 0.3, c: 0.22, d: 0.35, dUp: 0.18, fov: 0.3 } });
    r.timeScale = lerp(0.25, 1, ease((t - 0.7) / (dur - 0.7))); this.pose.timeScale = r.timeScale;
    this._endIf(dur, p.next ?? null); return r;
  }
  _victory({ L, t, p, tall }) {
    if (p.yaw0 === undefined) p.yaw0 = this.s.yaw; // latched once: a target of (current yaw + k*t) runs away from the camera and spins faster the longer the shot lasts
    const pts = unitPts(L.length ? L : [{ x: 0, y: 0 }], 0, 2.4), yaw = p.yaw0 + Math.min(t, 40) * 0.1 * ease(t / 2.5), pitch = lerp(9, 17, ease(t / 6)) * D2R + tall * 8 * D2R;
    // BANNER: the DOM VICTORY / DEFEAT title sits in the top third, so the winner is framed LOWER: the look point is raised along the camera up axis (subjects slide down the
    // screen) and the fit margin is tightened to match. The hard framing check keeps working because the reported margin covers the shifted bottom edge (margin + shift).
    const sh = lerp(0.3, 0.26, tall), mg = lerp(0.66, 0.62, tall), r = this._frame({ pts, yaw, pitch, fov: this._fov(44), margin: mg, minD: 4.8, padX: 0.9, st: { yaw: 0.05, pitch: 0.4, c: 0.35, d: 0.6, dUp: 0.2, fov: 0.5 } });
    const tv = Math.tan(r.fov * D2R / 2), u = basis(r.yaw, r.pitch).u, dl = sh * r.d * tv; r.c[0] += u[0] * dl; r.c[1] += u[1] * dl; r.c[2] += u[2] * dl; r.margin = mg + sh;
    return r;
  }
}

// Project a world point with a pose (for tests/nameplates without three.js). Returns ndc {x,y,z(depth in m)}.
export function projectPose(pose, aspect, p) {
  const f = [pose.look.x - pose.pos.x, pose.look.y - pose.pos.y, pose.look.z - pose.pos.z], fl = Math.hypot(...f); f[0] /= fl; f[1] /= fl; f[2] /= fl;
  let r = [-f[2], 0, f[0]]; const rl = Math.hypot(r[0], r[2]) || 1; r = [r[0] / rl, 0, r[2] / rl];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const x = p[0] - pose.pos.x, y = p[1] - pose.pos.y, z = p[2] - pose.pos.z, depth = x * f[0] + y * f[1] + z * f[2];
  const tv = Math.tan(pose.fov * D2R / 2);
  return { x: (x * r[0] + z * r[2]) / (depth * tv * aspect), y: (x * u[0] + y * u[1] + z * u[2]) / (depth * tv), depth };
}
export { basis, needD, recenter };

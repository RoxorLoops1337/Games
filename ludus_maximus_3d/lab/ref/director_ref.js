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
function basis(yaw, pitch) { // forward looks along horizontal yaw, pitched DOWN by pitch (negative = looks up)
  const cp = Math.cos(pitch), f = [cp * Math.cos(yaw), -Math.sin(pitch), cp * Math.sin(yaw)];
  let r = [-f[2], 0, f[0]]; const l = Math.hypot(r[0], r[2]) || 1; r = [r[0] / l, 0, r[2] / l]; // cross(f, up)
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { f, r, u };
}
// Fix: r = cross(f, up) = (-f.z, 0, f.x) normalised; u = cross(r, f). Verified in tests.

// Points for fit: per unit foot + head, lateral/vertical padding handled in needD.
function unitPts(units, lead, h = 2.2) {
  const p = [];
  for (const u of units) { const x = u.x + (u.vx || 0) * lead, z = u.y + (u.vy || 0) * lead; p.push([x, 0, z], [x, h, z]); }
  return p;
}
function centroid(pts) { const c = [0, 0, 0]; for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } const n = pts.length || 1; return [c[0] / n, c[1] / n, c[2] / n]; }

// Re-center on the screen-space middle of the points (symmetric framing for any direction).
function recenter(pts, yaw, pitch) {
  const { r, u } = basis(yaw, pitch), o = centroid(pts); let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
  for (const p of pts) { const x = (p[0] - o[0]) * r[0] + (p[2] - o[2]) * r[2], y = (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1] + (p[2] - o[2]) * u[2]; a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); }
  const cr = (a + b) / 2, cu = (c + d) / 2;
  return [o[0] + r[0] * cr + u[0] * cu, o[1] + u[1] * cu, o[2] + r[2] * cr + u[2] * cu];
}
// Minimal camera distance so every point (padded) is inside |ndc| <= margin.
function needD(pts, c, yaw, pitch, tanV, tanH, margin, padX, padY) {
  const { f, r, u } = basis(yaw, pitch); let d = 0;
  for (const p of pts) {
    const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
    const rr = Math.abs(x * r[0] + z * r[2]) + padX, uu = Math.abs(x * u[0] + y * u[1] + z * u[2]) + padY, ff = x * f[0] + y * f[1] + z * f[2];
    d = Math.max(d, rr / (margin * tanH) - ff, uu / (margin * tanV) - ff);
  }
  return d;
}
const camPos = (c, yaw, pitch, d) => { const { f } = basis(yaw, pitch); return [c[0] - f[0] * d, c[1] - f[1] * d, c[2] - f[2] * d]; };

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
  release() { this.free = null; this.blend = 0; this.blendDur = 0.9; this.from = { ...this.s }; }

  // ----- per frame -----
  update(dt, units) {
    dt = clamp(dt, 0, 0.1); this.units = units || this.units;
    // smoothed velocities (look-ahead must not jump when a fighter dashes or stops)
    const k = 1 - Math.exp(-dt / 0.3); this.sv = this.sv || new Map();
    this.units = this.units.map((u) => { const v = this.sv.get(u.id) || { x: u.vx || 0, y: u.vy || 0 }; v.x += ((u.vx || 0) - v.x) * k; v.y += ((u.vy || 0) - v.y) * k; this.sv.set(u.id, v); return { ...u, vx: v.x, vy: v.y }; });
    this.living = this.units.filter((u) => u.alive !== false);
    this.t += dt; this.trauma = Math.max(0, this.trauma - dt * 1.6);
    if (this.free) { this.free.idle += dt; if (this.freeTimeout && this.free.idle > this.freeTimeout) this.release(); }
    const w = this._want(dt);
    // blend params from snapshot
    let tgt = w;
    if (this.blend < 1 && this.from) {
      this.blend = Math.min(1, this.blend + dt / Math.max(0.01, this.blendDur)); const k = ease(this.blend), f = this.from;
      tgt = { ...w, yaw: f.yaw + angDelta(f.yaw, w.yaw) * k, pitch: lerp(f.pitch, w.pitch, k), cx: lerp(f.cx, w.c[0], k), cy: lerp(f.cy, w.c[1], k), cz: lerp(f.cz, w.c[2], k), d: lerp(f.d, w.d, k), fov: lerp(f.fov, w.fov, k) };
      tgt.st = { ...w.st, k: 0.5 };
    } else tgt = { ...w, cx: w.c[0], cy: w.c[1], cz: w.c[2], st: { ...w.st, k: 1 } };
    const s = this.s, st = tgt.st, kk = tgt.st.k;
    if (!this.started) { s.yaw = tgt.yaw; s.pitch = tgt.pitch; s.cx = tgt.cx; s.cy = tgt.cy; s.cz = tgt.cz; s.d = tgt.d; s.fov = tgt.fov; this.started = true; }
    sdAngle(s, 'yaw', tgt.yaw, st.yaw * kk, dt, st.yawMax ?? Infinity); sd(s, 'pitch', tgt.pitch, st.pitch * kk, dt);
    sd(s, 'cx', tgt.cx, st.c * kk, dt); sd(s, 'cy', tgt.cy, st.c * kk, dt); sd(s, 'cz', tgt.cz, st.c * kk, dt);
    sd(s, 'fov', tgt.fov, st.fov * kk, dt);
    sd(s, 'd', tgt.d, (tgt.d > s.d ? st.dUp : st.d) * kk, dt); // expand fast, contract slow
    // ---- hard safety: guarantee framing + stay inside the bowl ----
    const c = [s.cx, s.cy, s.cz]; let pitch = s.pitch, d = s.d;
    const tanV = Math.tan(s.fov * D2R / 2), tanH = tanV * this.aspect;
    if (w.pts) { d = Math.max(d, needD(w.pts, c, s.yaw, pitch, tanV, tanH, w.margin, w.padX, w.padY)); }
    d = clamp(d, 1.5, this.maxD);
    const rMax = w.rMax ?? this.R - this.wallMargin; let pos;
    pos = camPos(c, s.yaw, pitch, d); // soft limit lives in the (smoothed) target; this is only the emergency clamp just inside the wall
    if (!w.noWall && Math.hypot(pos[0], pos[2]) > rMax + 0.25) { const q = this._lift(w.pts, c, s.yaw, pitch, d, tanV, tanH, w.margin, w.padX, w.padY, rMax + 0.25); pitch = q.pi; d = q.d; pos = camPos(c, s.yaw, pitch, d); }
    if (Math.hypot(pos[0], pos[2]) > rMax && !w.pts) { const k = rMax / Math.hypot(pos[0], pos[2]); pos[0] *= k; pos[2] *= k; } // unframed shots: push in
    if (pos[1] < this.minHeight) pos[1] = this.minHeight;
    const P = this.pose; P.pos.x = pos[0]; P.pos.y = pos[1]; P.pos.z = pos[2]; P.look.x = c[0]; P.look.y = c[1]; P.look.z = c[2]; P.fov = s.fov;
    P.timeScale = w.timeScale ?? 1; P.shake = this.trauma * this.trauma; P.shot = this.free ? 'free' : this.shot.name; this.lastYaw = s.yaw;
    return P;
  }

  // Smallest pitch >= pitch0 at which the camera sits inside the bowl (bisection, so it is continuous in the inputs).
  _lift(pts, c, yaw, pitch0, dMin, tanV, tanH, margin, padX, padY, rMax, extra = 0) {
    const at = (pi) => { let d = Math.max(dMin, pts ? needD(pts, c, yaw, pi, tanV, tanH, margin, padX, padY) + extra : dMin); d = Math.min(d, this.maxD); const q = camPos(c, yaw, pi, d); return { pi, d, r: Math.hypot(q[0], q[2]) }; };
    let a = at(pitch0); if (a.r <= rMax) return a; let lo = pitch0, hi = 86 * D2R, h = at(hi); if (h.r > rMax) return h;
    for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2, x = at(m); if (x.r <= rMax) { hi = m; h = x; } else lo = m; } return h;
  }
  _fov(base) { return base + this.tall * 10; } // phones: wider vertical fov so a narrow horizontal view still sees the action
  // Choose yaw (+pi alternative) to minimise forced pitch raise; sticky to current yaw.
  _pickYaw(pts, yaw, pitch, fov) {
    const alt = [yaw, yaw + Math.PI]; let best = 0, bestScore = 1e9;
    const tanV = Math.tan(fov * D2R / 2), tanH = tanV * this.aspect;
    alt.forEach((y, i) => { const c = recenter(pts, y, pitch), d = needD(pts, c, y, pitch, tanV, tanH, 0.9, 0.6, 0.3), pos = camPos(c, y, pitch, d);
      const over = Math.max(0, Math.hypot(pos[0], pos[2]) - (this.R - this.wallMargin)), stick = Math.abs(angDelta(this.s.yaw, y)) / Math.PI * 10; bestScore > over + stick && ((bestScore = over + stick), (best = i)); });
    return alt[best];
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
    const c = recen ? recenter(pts, yaw, pitch) : c0;
    let pi = pitch, d = Math.max(minD, needD(pts, c, yaw, pi, tanV, tanH, margin, padX, padY)) + extra;
    if (!noWall) { const q = this._lift(pts, c, yaw, pitch, minD, tanV, tanH, margin, padX, padY, rMax ?? this.R - this.wallMargin, extra); pi = q.pi; d = q.d; }
    return { yaw, pitch: pi, c, d: Math.min(d, this.maxD), fov, pts, margin, padX, padY, st, timeScale, rMax, noWall };
  }
  _free() {
    const f = this.free, L = this.living, c = L.length ? centroid(unitPts(L, 0, 1.4)) : [0, 1, 0]; c[1] = 1.2;
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
    let sx = 0, sy = 0, cx = 0, cy = 0; for (const u of L) { cx += u.x; cy += u.y; } cx /= L.length || 1; cy /= L.length || 1;
    for (const u of L) { sx += (u.x - cx) * (u.x - cx) - (u.y - cy) * (u.y - cy); sy += 2 * (u.x - cx) * (u.y - cy); }
    const phi = L.length > 1 && Math.hypot(sx, sy) > 1e-3 ? 0.5 * Math.atan2(sy, sx) : this.s.yaw - Math.PI / 2;
    let yaw = phi + (Math.PI / 2) * (1 - tall); const pitch = lerp(24, 30, tall) * D2R + tall * 12 * D2R;
    yaw = this._pickYaw(pts, yaw, pitch, fov);
    return this._frame({ pts, yaw, pitch, fov, margin: lerp(0.86, 0.8, tall), minD: 7.5, padX: 0.7, st: { yaw: 0.6, yawMax: 1.1, pitch: 0.5, c: 0.28, d: 0.7, dUp: 0.14, fov: 0.5 } });
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
  _kill({ L, t, p, tall }) {
    const dur = p.dur ?? 2.8, v = this.units.find((x) => x.id === p.victim) || p.at, kl = this.units.find((x) => x.id === p.killer);
    const vx = v?.x ?? 0, vy = v?.y ?? 0; if (p._yaw0 === undefined) p._yaw0 = (kl ? Math.atan2(vy - kl.y, vx - kl.x) : 0) + (p.side ?? 1) * Math.PI / 2;
    const yaw = p._yaw0 + t * 0.5 * (p.side ?? 1), pitch = lerp(6, 16, easeOut(t / dur)) * D2R + tall * 8 * D2R;
    const pts = [[vx, 0, vy], [vx, 1.9, vy]]; if (kl && Math.hypot(kl.x - vx, kl.y - vy) < 4.5) pts.push([kl.x, 0, kl.y], [kl.x, 2.2, kl.y]);
    const r = this._frame({ pts, yaw, pitch, fov: this._fov(40), margin: lerp(0.8, 0.72, tall), minD: 3.4, padX: 0.9, st: { yaw: 0.05, pitch: 0.3, c: 0.25, d: 0.4, dUp: 0.2, fov: 0.3 } });
    r.timeScale = lerp(0.25, 1, ease((t - 0.6) / (dur - 0.6))); this.pose.timeScale = r.timeScale;
    this._endIf(dur, p.next ?? null); return r;
  }
  _victory({ L, t, p, tall }) {
    const pts = unitPts(L.length ? L : [{ x: 0, y: 0 }], 0, 2.4), yaw = (p.yaw0 ?? this.s.yaw) + t * 0.38, pitch = lerp(9, 17, ease(t / 6)) * D2R + tall * 8 * D2R;
    return this._frame({ pts, yaw, pitch, fov: this._fov(44), margin: lerp(0.8, 0.74, tall), minD: 4.8, padX: 0.9, st: { yaw: 0.05, pitch: 0.4, c: 0.35, d: 0.6, dUp: 0.2, fov: 0.5 } });
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

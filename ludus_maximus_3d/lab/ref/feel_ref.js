// Ludus Maximus 3D: game-feel reference (camera trauma shake, hit-stop, slow-mo, FOV punch, screen flash, rumble).
// No three.js import needed: it only touches camera.position/quaternion/fov through duck typing.
//
// Per frame (real dt in seconds, NOT scaled):
//   const t = feel.update(realDt);        // t.dt = scaled game dt for sim + fx, t.scale = current time scale
//   sim.step(t.dt); fx.update(t.dt, camera);
//   director.placeCamera(camera);         // director writes camera pos/quat/fov FIRST
//   feel.apply(camera);                   // then feel adds shake/kick/fov on top (never fight the director)
// Shake, flash, fov and rumble run on REAL time so they keep moving during a hit-stop freeze.

// ---------- 1D gradient noise (smooth, deterministic) ----------
function hash(n) { n = (n << 13) ^ n; return 1 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824; }
export function noise1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * f * (f * (f * 6 - 15) + 10);
  const a = hash(i) * f, b = hash(i + 1) * (f - 1);
  return (a + (b - a) * u) * 2; // approx -1..1
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);

// Tuned numbers (see SKILL.md). trauma is 0..1, shake amplitude = trauma^2.
export const FEEL = {
  // trauma added per event
  trauma: { hitMed: 0.16, hitHeavy: 0.3, crit: 0.34, taken: 0.1, kill: 0.55, finalKill: 0.8, ultCast: 0.3, aoe: 0.2, aoeBig: 0.5, meteor: 0.85, roar: 0.2, land: 0.12, clash: 0.12 },
  // hit-stop (real ms) by damage class
  hitstop: { light: 0, med: 30, heavy: 55, crit: 75, kill: 110, finalKill: 140, ult: 90, meteor: 120 },
  // slow-mo: scale, hold (real s), in/out ramp (real s)
  slowmo: {
    kill: { scale: 0.45, hold: 0.25, inT: 0.04, outT: 0.25 },
    finalKill: { scale: 0.22, hold: 0.85, inT: 0.05, outT: 0.45 },
    ultCast: { scale: 0.35, hold: 0.35, inT: 0.08, outT: 0.25 },
    meteor: { scale: 0.3, hold: 0.6, inT: 0.05, outT: 0.4 },
  },
  fov: { crit: 2.2, heavy: 1.4, kill: 4, ult: 5, meteor: 7 }, // degrees of punch-in (negative fov delta)
  flash: { crit: [1, 0.95, 0.8, 0.12], kill: [1, 1, 1, 0.3], ult: null /* use element color, 0.28 */, meteor: [1, 0.8, 0.5, 0.5], revive: [1, 0.9, 0.5, 0.3] },
  maxShakePos: 0.6, // world units at trauma 1 (camera ~14 units from action)
  maxShakeRot: 3 * Math.PI / 180, // radians (yaw, pitch), roll is 60% of this
  traumaDecay: 1.15, // trauma/s
  freq: 17, // noise Hz at trauma 1 (scaled down for low trauma)
};

export function createFeel(opts = {}) {
  const cfg = { ...FEEL, ...(opts.cfg || {}) };
  const S = {
    intensity: opts.intensity ?? 1, // user setting 0..1 (accessibility): scales shake + flash + fov
    reducedMotion: !!opts.reducedMotion, // forces shake 0.25x, flash 0.3x, no fov punch, keeps hit-stop
    trauma: 0, t: 0, seed: opts.seed || 1,
    // time scale
    freeze: 0, freezeMax: 0, recent: [], // hit-stop (real s)
    slow: null, // {scale, hold, inT, outT, age}
    userScale: 1,
    // directional kick (world vec) decays quickly
    kx: 0, ky: 0, kz: 0,
    // fov
    fov0: opts.fov ?? null, fovV: 0, fovO: 0,
    // flash
    flashCol: [1, 1, 1], flashA: 0, flashDecay: 4,
    // post uniforms for the grade pass
    post: { flash: 0, flashColor: [1, 1, 1], chroma: 0, radial: 0, vignette: 0, zoom: 0 },
    // outputs
    shakeOff: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 },
    timeScale: 1,
    rumble: opts.onRumble || defaultRumble,
    overlay: null,
  };
  if (opts.overlay !== false && typeof document !== 'undefined') {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:50;mix-blend-mode:normal;background:#fff';
    (opts.overlayParent || document.body).appendChild(d); S.overlay = d;
  }
  const scl = () => (S.reducedMotion ? 0.25 : 1) * S.intensity;

  const api = {
    state: S, cfg, post: S.post,
    addTrauma(v) { S.trauma = Math.min(1, S.trauma + v); },
    // directional kick: camera shoved along (dx,dy,dz) in world space, springs back (hit direction feels weighty)
    kick(dx, dy, dz, mag = 0.12) { const l = Math.hypot(dx, dy, dz) || 1; const m = mag * scl(); S.kx += dx / l * m; S.ky += dy / l * m; S.kz += dz / l * m; },
    // Hit-stop: ms of REAL time with timeScale ~0. Takes the max (never sums), caps at 160ms, and self-limits
    // when the last 0.6 s was already >35% frozen (prevents "stutter lock" in multi-hit flurries).
    hitStop(ms) {
      if (ms <= 0) return;
      let frozen = 0; for (const r of S.recent) frozen += r.d; if (frozen > 0.21) ms *= 0.4;
      const s = Math.min(160, ms) / 1000; if (s > S.freeze) { S.freezeMax = s; S.freeze = s; }
      S.recent.push({ t: S.t, d: s });
    },
    // Slow-mo envelope on real time: ramp in, hold, ramp out. A stronger (lower) request replaces a weaker one.
    slowmo(scale, hold, inT = 0.05, outT = 0.3) {
      if (S.slow && S.slow.scale < scale && S.slow.age < S.slow.inT + S.slow.hold) return;
      S.slow = { scale, hold, inT, outT, age: 0 };
    },
    fovPunch(deg) { if (S.reducedMotion) return; S.fovV -= deg * scl() * 22 * Math.E; /* impulse into a critically damped spring: peak offset = deg */ },
    flash(r, g, b, a, decay = 4) { const k = (S.reducedMotion ? 0.3 : 1) * S.intensity; S.flashCol = [r, g, b]; S.flashA = Math.max(S.flashA, a * k); S.flashDecay = decay; },
    flashHex(hex, a, decay) { const c = parseInt(hex.slice(1), 16); api.flash(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, a, decay); },
    setBaseFov(f) { S.fov0 = f; },
    setUserScale(s) { S.userScale = s; }, // game speed x1/x2 buttons

    // Named presets. cls: 'hit' (dmgFrac = dmg/maxhp, crit), 'kill', 'finalKill', 'ult', 'meteor', 'aoe', 'roar', 'revive'
    impact(cls, o = {}) {
      const T = cfg.trauma, H = cfg.hitstop, d = o.dir || [0, 0, 0];
      switch (cls) {
        case 'hit': {
          const f = o.dmgFrac || 0;
          if (o.crit) { api.addTrauma(T.crit); api.hitStop(H.crit); api.fovPunch(cfg.fov.crit); api.flash(...cfg.flash.crit.slice(0, 3), cfg.flash.crit[3], 9); api.rumble(0.6, 0.9, 90); api.post.chroma = Math.max(api.post.chroma, 0.6); }
          else if (f > 0.18) { api.addTrauma(T.hitHeavy); api.hitStop(H.heavy); api.fovPunch(cfg.fov.heavy); api.rumble(0.4, 0.6, 70); }
          else if (f > 0.08) { api.addTrauma(T.hitMed); api.hitStop(H.med); api.rumble(0.2, 0.4, 40); }
          if (o.mine) api.addTrauma(T.taken); // damage taken by the player's side shakes a bit more
          if (d[0] || d[2]) api.kick(d[0], d[1], d[2], o.crit ? 0.2 : f > 0.18 ? 0.14 : 0.06);
          break;
        }
        case 'kill': api.addTrauma(T.kill); api.hitStop(H.kill); api.slowmo(...sm(cfg.slowmo.kill)); api.fovPunch(cfg.fov.kill); api.flash(1, 1, 1, cfg.flash.kill[3], 5); api.rumble(0.9, 0.9, 160); break;
        case 'finalKill': api.addTrauma(T.finalKill); api.hitStop(H.finalKill); api.slowmo(...sm(cfg.slowmo.finalKill)); api.fovPunch(cfg.fov.kill * 1.5); api.flash(1, 1, 1, 0.4, 3.5); api.rumble(1, 1, 260); api.post.radial = 1; break;
        case 'ult': api.addTrauma(T.ultCast); api.hitStop(H.ult * 0.5); api.slowmo(...sm(cfg.slowmo.ultCast)); api.fovPunch(cfg.fov.ult); if (o.color) api.flashHex(o.color, 0.28, 4); api.rumble(0.5, 0.8, 140); break;
        case 'meteor': api.addTrauma(T.meteor); api.hitStop(H.meteor); api.slowmo(...sm(cfg.slowmo.meteor)); api.fovPunch(cfg.fov.meteor); api.flash(...cfg.flash.meteor.slice(0, 3), cfg.flash.meteor[3], 2.8); api.rumble(1, 1, 320); api.post.radial = 0.8; api.post.chroma = 1; break;
        case 'aoe': api.addTrauma(o.big ? T.aoeBig : T.aoe); if (o.big) { api.hitStop(H.ult); api.fovPunch(cfg.fov.heavy); api.rumble(0.7, 0.5, 120); } break;
        case 'roar': api.addTrauma(T.roar); api.rumble(0.3, 0.3, 300); break;
        case 'revive': api.addTrauma(0.3); api.flash(...cfg.flash.revive.slice(0, 3), cfg.flash.revive[3], 3); break;
        default: break;
      }
    },
    rumble(strong, weak, ms) { if (S.reducedMotion) return; S.rumble(strong * S.intensity, weak * S.intensity, ms); },

    update(realDt) {
      realDt = Math.min(realDt, 0.1); S.t += realDt;
      // trauma decay (linear, as in Eiserloh's talk)
      S.trauma = Math.max(0, S.trauma - cfg.traumaDecay * realDt);
      // recent hitstop window
      while (S.recent.length && S.t - S.recent[0].t > 0.6) S.recent.shift();
      // time scale
      let ts = S.userScale;
      if (S.freeze > 0) { S.freeze -= realDt; ts *= S.freeze > 0 ? 0.02 : 1; }
      if (S.slow) {
        const s = S.slow; s.age += realDt; let k;
        if (s.age < s.inT) k = smooth(s.age / s.inT); else if (s.age < s.inT + s.hold) k = 1; else if (s.age < s.inT + s.hold + s.outT) k = 1 - smooth((s.age - s.inT - s.hold) / s.outT); else { k = 0; S.slow = null; }
        ts *= 1 + (s.scale - 1) * k;
      }
      S.timeScale = ts;
      // shake offsets from noise, amplitude trauma^2
      const sh = S.trauma * S.trauma * scl(), f = cfg.freq * (0.35 + 0.65 * S.trauma), x = S.t * f, sd = S.seed * 37.1;
      const o = S.shakeOff;
      o.x = noise1(x + sd) * sh * cfg.maxShakePos; o.y = noise1(x + sd + 11.3) * sh * cfg.maxShakePos * 0.8; o.z = noise1(x + sd + 23.7) * sh * cfg.maxShakePos * 0.4;
      o.yaw = noise1(x + sd + 31.1) * sh * cfg.maxShakeRot; o.pitch = noise1(x + sd + 47.9) * sh * cfg.maxShakeRot; o.roll = noise1(x + sd + 59.3) * sh * cfg.maxShakeRot * 0.6;
      // kick decay (exponential, ~120ms half life)
      const kd = Math.exp(-realDt * 11); S.kx *= kd; S.ky *= kd; S.kz *= kd;
      // fov spring: critically damped toward 0
      const w = 22, ex = Math.exp(-w * realDt), tmp = S.fovV + w * S.fovO; S.fovO = (S.fovO + tmp * realDt) * ex; S.fovV = (S.fovV - w * tmp * realDt) * ex; // exact critically damped step
      if (Math.abs(S.fovO) < 1e-4 && Math.abs(S.fovV) < 1e-3) { S.fovO = 0; S.fovV = 0; }
      // flash
      S.flashA = Math.max(0, S.flashA - S.flashDecay * realDt * Math.max(0.15, S.flashA));
      if (S.flashA < 0.004) S.flashA = 0;
      // post uniforms
      const P = S.post; P.flash = S.flashA; P.flashColor = S.flashCol; P.chroma = Math.max(P.chroma - realDt * 3.2, S.trauma * 0.5 * S.intensity); P.radial = Math.max(0, P.radial - realDt * 2.2); P.vignette = S.trauma * 0.4; P.zoom = clamp(-S.fovO * 0.004, 0, 0.06);
      if (S.overlay) { S.overlay.style.opacity = S.flashA.toFixed(3); S.overlay.style.background = `rgb(${S.flashCol.map((c) => Math.round(clamp(c, 0, 1) * 255)).join(',')})`; }
      return { dt: realDt * ts, scale: ts, real: realDt };
    },

    // Apply shake + kick + fov on top of whatever the director set this frame.
    apply(cam) {
      const o = S.shakeOff;
      cam.position.x += o.x + S.kx; cam.position.y += o.y + S.ky; cam.position.z += o.z + S.kz;
      // rotate in camera-local axes using small-angle quaternion multiply (duck typed, needs cam.quaternion.multiply)
      if (cam.quaternion && (o.yaw || o.pitch || o.roll)) {
        const hx = o.pitch / 2, hy = o.yaw / 2, hz = o.roll / 2, sx = Math.sin(hx), cx = Math.cos(hx), sy = Math.sin(hy), cy = Math.cos(hy), sz = Math.sin(hz), cz = Math.cos(hz);
        const bx = sx * cy * cz + cx * sy * sz, by = cx * sy * cz - sx * cy * sz, bz = cx * cy * sz + sx * sy * cz, bw = cx * cy * cz - sx * sy * sz;
        const q = cam.quaternion, ax = q.x, ay = q.y, az = q.z, aw = q.w; // q = q * b (local axes)
        q.set(aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz);
      }
      if (S.fov0 == null) S.fov0 = cam.fov;
      if (cam.fov !== undefined) { const f = S.fov0 + S.fovO; if (Math.abs(cam.fov - f) > 1e-3) { cam.fov = f; if (cam.updateProjectionMatrix) cam.updateProjectionMatrix(); } }
    },
    reset() { S.trauma = 0; S.freeze = 0; S.slow = null; S.kx = S.ky = S.kz = 0; S.fovO = S.fovV = 0; S.flashA = 0; S.recent.length = 0; },
    dispose() { if (S.overlay && S.overlay.parentNode) S.overlay.parentNode.removeChild(S.overlay); },
  };
  return api;
}
const sm = (o) => [o.scale, o.hold, o.inT, o.outT];

// Default rumble: gamepad dual-rumble if present, else navigator.vibrate on phones (throttled, short).
let lastVib = 0;
export function defaultRumble(strong, weak, ms) {
  try {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.vibrationActuator && p.vibrationActuator.playEffect) p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: clamp(strong, 0, 1), weakMagnitude: clamp(weak, 0, 1) });
    const now = performance.now();
    if (navigator.vibrate && now - lastVib > 120 && strong > 0.45) { lastVib = now; navigator.vibrate(Math.min(ms, 80)); }
  } catch (e) { /* ignore */ }
}

// GLSL chunk for the single grade pass: radial blur + shockwave distortion + chroma pulse + flash.
// uniforms: tDiffuse, uShock[4] (vec4: uv.x, uv.y, radius uv, strength), uRadial (0..1), uChroma (0..1), uFlash (vec4 rgb,a)
export const GRADE_FX_GLSL = /* glsl */ `
uniform vec4 uShock[4]; uniform float uRadial; uniform float uChroma; uniform vec4 uFlash;
vec3 sceneFx(sampler2D tex, vec2 uv, float aspect){
  vec2 duv = vec2(0.0);
  for(int i=0;i<4;i++){ vec4 s=uShock[i]; if(s.w>0.0){ vec2 d=uv-s.xy; d.x*=aspect; float r=length(d); float band=exp(-pow((r-s.z)/0.035,2.0)); duv += normalize(d+1e-5)*band*s.w*0.03*vec2(1.0/aspect,1.0); } }
  vec2 u = uv + duv;
  vec2 c = u-0.5; float ch = uChroma*0.004 + length(duv)*0.6;
  vec3 col = vec3(texture2D(tex,u+c*ch).r, texture2D(tex,u).g, texture2D(tex,u-c*ch).b);
  if(uRadial>0.0){ vec3 acc=col; for(int k=1;k<6;k++){ acc+=texture2D(tex,0.5+c*(1.0-uRadial*0.035*float(k))).rgb; } col=acc/6.0; }
  col = mix(col, uFlash.rgb, uFlash.a);
  return col;
}`;

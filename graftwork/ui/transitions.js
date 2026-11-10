// Presentation layer: screen wipes, boss/elite intro plates, boss phase beats, the graft stitching beats and the Temper hammer beats.
// No screen imports this: main.js installs it (installTransitions) and exposes it as app.shared.transitions; screens feature-detect.
//
//   installTransitions(app)       wraps app.go: the OLD frame (captured at the end of every frame) is wiped away over the live new screen.
//                                 The new screen is live and clickable from frame one, the wipe is only an overlay (350 to 500 ms).
//   drawTransitions(app)          call once per frame from app.overlay: captures the frame, draws the wipe, the intro plate, the phase strip.
//   drawTransitions(app, true)    the same picture with no time passing: core.js paints it once into the snapshot under a modal (the wipe, the
//                                 plate and the strip belong to the screen that is frozen there, and go on when the modal closes).
//   introCard(app, {name, sub, kind})   name plate slam + swinging lamp + music bump. kind 'boss' | 'elite'. Click skips.
//   watchPhases(app, combat)      call each frame in combat: fires phaseBeat when a boss/elite enemy.data.phase goes up.
//   phaseBeat(app, label)         freeze flash + shockwave + a strip across the screen.
//   stitchBeat / clunkBeat / overloadBeat / shatterBeat / gaugeGlow   graft ceremony beats (fx is the screen's Fx).
//   TEMPER, temperUpdate, hammerPose, temperTint, temperRivets        Forge hammer sequence.
// Everything is a no-op without a DOM / post / audio, and short under reduced motion (a 160 ms cross-fade, no shake).
import { FX_OPTS } from './fx.js';

const W = 1280, H = 720;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const eOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const eIn = (t) => { t = clamp(t, 0, 1); return t * t * t; };
const eInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const eBack = (t) => { t = clamp(t, 0, 1); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const reduced = () => !!FX_OPTS.reduced;
const INK = '#0b0807', WAX = '#8e1f2c', GOLD = '#c9a227', VELLUM = '#E8DCC4';

export const WIPE = { ink: 0.42, seal: 0.48, thread: 0.4, fade: 0.16 };

const post = (app, fn, ...a) => { const p = app && app.post; if (p && typeof p[fn] === 'function') { try { p[fn](...a); } catch (e) { /* post is optional */ } } };
const sfx = (app, n, o) => { const a = app && app.shared && app.shared.audio; if (a && typeof a.sfx === 'function') { try { a.sfx(n, o); } catch (e) { /* audio is optional */ } } };
const audioCall = (app, fn, ...a) => { const au = app && app.shared && app.shared.audio; if (au && typeof au[fn] === 'function') { try { return au[fn](...a); } catch (e) { return undefined; } } return undefined; };

function state(app) {
  if (!app.tr) app.tr = { on: true, snap: null, snapCtx: null, haveSnap: false, wipe: null, intro: null, phase: null, started: 0, finished: 0, intros: 0, phases: 0 };
  return app.tr;
}

// which wipe a destination gets
export function wipeKind(from, to, run) {
  if (to === 'combat') return 'seal';
  if (to === 'graft' || to === 'forge') return 'thread';
  return 'ink';
}

export function installTransitions(app) {
  if (app.tr && app.tr.installed) return app.tr;
  const T = state(app); T.installed = true;
  const orig = app.go;
  app.go = (name, params) => {
    // The snapshot the wipe fades from is taken HERE, once per screen change (round 2): a full-canvas copy every 4th frame was the top single cost of a frame on a
    // software raster. Outside the draw phase the canvas still holds the last complete frame; inside it (a button click) the rest of the tick still draws the old screen,
    // so the copy waits for drawTransitions at the end of this tick.
    if (T.on && !T.wipe && app.current && app.current !== name && app.frame >= 3) { if (app.inDraw) T.snapNext = true; else capture(app, T); }
    try { beginWipe(app, app.current, name, params); } catch (e) { T.wipe = null; T.err = String(e && e.stack); }
    return orig(name, params);
  };
  return T;
}

function ensureSnap(app, T) {
  if (T.snap) return T.snap;
  if (typeof document === 'undefined' || !document.createElement) return null;
  const cv = document.createElement('canvas');
  if (!cv) return null;
  cv.width = 2; cv.height = 2; T.snap = cv; T.snapCtx = cv.getContext && cv.getContext('2d');
  return T.snapCtx ? cv : null;
}
function capture(app, T) {
  const cv = ensureSnap(app, T); if (!cv) return;
  const src = app.canvas; if (!src || !(src.width > 0)) return;
  if (cv.width !== src.width || cv.height !== src.height) { cv.width = src.width; cv.height = src.height; }
  try { T.snapCtx.setTransform(1, 0, 0, 1, 0, 0); T.snapCtx.drawImage(src, 0, 0); T.haveSnap = true; } catch (e) { T.haveSnap = false; }
}

function beginWipe(app, from, to, params) {
  const T = state(app);
  if (!T.on || !from || from === to || app.frame < 3 || !(T.haveSnap || T.snapNext) || T.wipe) return;
  const kind = wipeKind(from, to, app.shared && app.shared.run);
  const rd = reduced();
  const run = app.shared && app.shared.run;
  const fk = run && run.pending && run.pending.fightKind;
  const hot = to === 'combat' && (fk === 'boss' || fk === 'final' || fk === 'elite');
  T.wipe = { kind: rd ? 'fade' : kind, t: 0, life: rd ? WIPE.fade : WIPE[kind], from, to, hot, seed: Math.random() * 100 };
  T.started++;
  if (!rd) {
    if (kind === 'seal') { sfx(app, 'graftScar', { vol: 0.6, pitch: 0.9 }); post(app, 'shockwave', 640, 360, hot ? 0.7 : 0.45, 600); post(app, 'aberration', hot ? 3 : 1.5, 220); if (hot) post(app, 'flash', WAX, 0.25); }
    else if (kind === 'thread') { sfx(app, 'seamExtend', { len: 3, vol: 0.7 }); post(app, 'vignette', 0.3, 300); }
    else { sfx(app, 'shuffle', { vol: 0.5 }); post(app, 'vignette', 0.25, 300); }
  }
}

// ---------------------------------------------------------------- wipe drawing (all cheap: one snapshot blit, a clip, a gradient, a polyline)
function wavyX(edge, y, seed, t) { return edge + Math.sin(y * 0.031 + t * 9 + seed) * 13 + Math.sin(y * 0.077 + seed * 2) * 7; }

function drawWipe(app, w) {
  const T = app.tr, ctx = app.ctx, k = clamp(w.t / w.life, 0, 1);
  const snap = T.snap;
  if (!snap || !ctx) return;
  ctx.save();
  if (w.kind === 'fade') {
    ctx.globalAlpha = 1 - eInOut(k); ctx.drawImage(snap, 0, 0, W, H);
  } else if (w.kind === 'ink') {
    const e = eInOut(k), edge = -320 + (W + 640) * e;
    ctx.beginPath(); ctx.moveTo(W + 10, -10); ctx.lineTo(wavyX(edge, -10, w.seed, w.t), -10);
    for (let y = 0; y <= H + 24; y += 24) ctx.lineTo(wavyX(edge, y, w.seed, w.t), y);
    ctx.lineTo(W + 10, H + 24); ctx.closePath();
    ctx.save(); ctx.clip(); ctx.drawImage(snap, 0, 0, W, H); ctx.restore();
    // the ink band behind the leading edge
    ctx.beginPath(); ctx.moveTo(edge - 320, -10); ctx.lineTo(wavyX(edge, -10, w.seed, w.t), -10);
    for (let y = 0; y <= H + 24; y += 24) ctx.lineTo(wavyX(edge, y, w.seed, w.t), y);
    ctx.lineTo(edge - 320, H + 24); ctx.closePath();
    const g = ctx.createLinearGradient(edge - 320, 0, edge, 0); g.addColorStop(0, 'rgba(11,8,7,0)'); g.addColorStop(0.7, 'rgba(11,8,7,0.82)'); g.addColorStop(1, INK);
    ctx.fillStyle = g; ctx.fill();
    // stitched edge + drips
    ctx.setLineDash([10, 8]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(232,220,196,.75)'; ctx.beginPath();
    for (let y = -10; y <= H + 24; y += 24) { const x = wavyX(edge, y, w.seed, w.t) - 7; if (y < 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = INK;
    for (let i = 0; i < 7; i++) { const y = ((i * 131 + w.seed * 13) % H), len = 14 + ((i * 53) % 40); ctx.beginPath(); ctx.ellipse(wavyX(edge, y, w.seed, w.t) + 6, y, len, 5 + (i % 3), 0, 0, 6.283); ctx.fill(); }
  } else if (w.kind === 'seal') {
    const hold = 0.22, press = clamp(k / hold, 0, 1);
    const col = w.hot ? WAX : GOLD;
    const r0 = 74 * eBack(press);
    const r = k < hold ? 0 : r0 + Math.pow((k - hold) / (1 - hold), 1.7) * 880;
    ctx.beginPath(); ctx.rect(0, 0, W, H);
    if (k >= hold) ctx.arc(640, 360, r, 0, 6.283, true);
    ctx.save(); ctx.clip('evenodd'); ctx.drawImage(snap, 0, 0, W, H); ctx.restore();
    if (k < hold) { // wax seal pressed onto the old scene
      ctx.save(); ctx.translate(640, 360 + (1 - eOut(press)) * -40); ctx.rotate(-0.12);
      ctx.fillStyle = col; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 24;
      ctx.beginPath(); for (let i = 0; i < 18; i++) { const a = i / 18 * 6.283, rr = r0 * (1 + (i % 2 ? 0.07 : -0.03)); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r0 * 0.66, 0, 6.283); ctx.stroke();
      ctx.restore();
    } else { // the rim of the opening: wax ring over a dark ring
      const fade = 1 - clamp((k - 0.8) / 0.2, 0, 1);
      ctx.globalAlpha = fade; ctx.lineWidth = 34; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(640, 360, r + 17, 0, 6.283); ctx.stroke();
      ctx.lineWidth = 7; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(640, 360, r - 1, 0, 6.283); ctx.stroke();
    }
  } else if (w.kind === 'thread') {
    const hw = eInOut(k) * 690;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, Math.max(0, 640 - hw), H); ctx.rect(640 + hw, 0, W, H); ctx.clip(); ctx.drawImage(snap, 0, 0, W, H); ctx.restore();
    if (hw > 2 && k < 0.96) {
      const g = ctx.createLinearGradient(640 - hw - 40, 0, 640 - hw, 0); g.addColorStop(0, 'rgba(11,8,7,0)'); g.addColorStop(1, 'rgba(11,8,7,.7)');
      ctx.fillStyle = g; ctx.fillRect(640 - hw - 40, 0, 40, H);
      const g2 = ctx.createLinearGradient(640 + hw, 0, 640 + hw + 40, 0); g2.addColorStop(0, 'rgba(11,8,7,.7)'); g2.addColorStop(1, 'rgba(11,8,7,0)');
      ctx.fillStyle = g2; ctx.fillRect(640 + hw, 0, 40, H);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.strokeStyle = VELLUM;
      for (const sd of [-1, 1]) {
        const x = 640 + sd * hw;
        ctx.beginPath(); ctx.moveTo(x, 0); for (let y = 0; y <= H; y += 36) ctx.lineTo(x + (y % 72 ? 9 : -9) * -sd, y); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(179,38,58,.9)'; ctx.lineWidth = 2;
      for (const sd of [-1, 1]) { const x = 640 + sd * hw; ctx.beginPath(); for (let y = 0; y < H; y += 36) { ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y + 18); } ctx.stroke(); }
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- intro plate
// name plate slam + swinging lamp. 1.3 s (elite 1.1 s): it is gone by the time the combat queue releases, so the first telegraph is never under the dim. A click skips to the exit.
export const INTRO_LIFE = 1.3;
export function introCard(app, o) {
  const T = state(app); if (!T.on) return null;
  const name = String((o && o.name) || '???'), kind = (o && o.kind) || 'boss';
  const rd = reduced();
  const au = audioCall(app, 'audioState');
  const prev = au && typeof au.intensity === 'number' ? au.intensity : 0;
  const it = { name, sub: String((o && o.sub) || (kind === 'elite' ? 'ELITE' : 'BOSS')), kind, t: 0, life: rd ? 1.0 : kind === 'elite' ? INTRO_LIFE - 0.2 : INTRO_LIFE, slammed: false, sparks: [], lampId: -1, prev, rd };
  T.intro = it; T.intros++;
  audioCall(app, 'setIntensity', kind === 'boss' ? 0.95 : 0.75);
  if (app.after) app.after(it.life * 1000 + 300, () => { if (T.intro === it || !T.intro) audioCall(app, 'setIntensity', it.prev); });
  return it;
}
function lampPos(it) { // pendulum hanging from the top, amplitude decays
  const swing = Math.sin(it.t * 4.6) * 0.55 * Math.exp(-it.t * 0.9);
  return { x: 640 + Math.sin(swing) * 170, y: Math.cos(swing) * 170, a: swing };
}
function stepIntro(app, T, dt) {
  const it = T.intro; if (!it) return;
  if (app.mouse && app.mouse.pressed && it.t > 0.15 && it.t < it.life - 0.28) it.t = it.life - 0.28; // skip to the exit
  it.t += dt;
  const slamAt = it.rd ? 0.1 : 0.24;
  if (!it.slammed && it.t >= slamAt) {
    it.slammed = true;
    if (!it.rd) {
      post(app, 'shockwave', 640, 330, it.kind === 'boss' ? 0.85 : 0.55, 600); post(app, 'aberration', it.kind === 'boss' ? 4 : 2.5, 260);
      post(app, 'flash', it.kind === 'boss' ? '#ff4a5a' : '#ffd98a', 0.3); post(app, 'vignette', 0.5, 700);
      for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, s = 160 + Math.random() * 420; it.sparks.push({ x: 640 + (Math.random() - 0.5) * 520, y: 330, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 120, life: 0.5 + Math.random() * 0.5, age: 0 }); }
      sfx(app, 'bossIntro'); sfx(app, 'hitHeavy', { pitch: 0.7 });
    }
    // a lamp light that swings with the pendulum (renders wherever the screen uses the light registry)
    try { if (!it.rd && app.lightsApi && app.lightsApi.add) it.lampId = app.lightsApi.add({ x: 640, y: 170, r: 380, color: '#ffcf80', intensity: 1.1, flicker: 0.3 }); } catch (e) { it.lampId = -1; }
  }
  try { if (it.lampId >= 0 && app.lightsApi) { const p = lampPos(it); app.lightsApi.set(it.lampId, { x: p.x, y: p.y + 20 }); } } catch (e) { /* lights are optional */ }
  for (const s of it.sparks) { s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 900 * dt; }
  if (it.t >= it.life) {
    try { if (it.lampId >= 0 && app.lightsApi) app.lightsApi.remove(it.lampId); } catch (e) { /* ignore */ }
    T.intro = null; T.finished++;
  }
}
function drawIntro(app, it) {
  const ctx = app.ctx, k = it.t / it.life;
  const slamAt = it.rd ? 0.1 : 0.24;
  const inK = clamp(it.t / slamAt, 0, 1), outK = clamp((it.t - (it.life - 0.28)) / 0.28, 0, 1);
  const col = it.kind === 'boss' ? '#B3263A' : '#F2C14E';
  ctx.save();
  // letterbox bars + dim
  ctx.globalAlpha = (1 - outK) * 0.55 * eOut(clamp(it.t / 0.2, 0, 1)); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1 - outK;
  const bar = 70 * eOut(clamp(it.t / 0.25, 0, 1)); ctx.fillStyle = INK; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
  // plate drop: falls from above, overshoots with a jolt after the slam
  const py = lerp(-160, 330, eIn(inK)) - outK * 460;
  const jolt = it.slammed ? Math.sin((it.t - slamAt) * 55) * 9 * Math.exp(-(it.t - slamAt) * 9) * (it.rd ? 0 : 1) : 0;
  const pw = 760, ph = 150;
  ctx.translate(640 + jolt, py + Math.abs(jolt) * 0.4);
  ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 30;
  ctx.fillStyle = '#1d1613'; ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 10); ctx.fill();
  ctx.shadowBlur = 0; ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.stroke();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(232,220,196,.35)'; ctx.beginPath(); ctx.roundRect(-pw / 2 + 10, -ph / 2 + 10, pw - 20, ph - 20, 6); ctx.stroke();
  for (const [rx, ry] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.fillStyle = '#9aa3a8'; ctx.beginPath(); ctx.arc(rx * (pw / 2 - 18), ry * (ph / 2 - 18), 5, 0, 6.283); ctx.fill(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 20px "Trebuchet MS", system-ui, sans-serif'; ctx.fillStyle = col; ctx.fillText(it.sub.split('').join(' '), 0, -ph / 2 + 30);
  let fs = 62; const FONT = 'Georgia, "Iowan Old Style", serif';
  ctx.font = `bold ${fs}px ${FONT}`; while (ctx.measureText(it.name).width > pw - 70 && fs > 28) { fs -= 4; ctx.font = `bold ${fs}px ${FONT}`; }
  ctx.lineJoin = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.strokeText(it.name, 0, 16); ctx.fillStyle = VELLUM; ctx.fillText(it.name, 0, 16);
  ctx.restore();
  // the lamp (not under reduced motion): chain from the ceiling, shade, additive glow over the plate
  if (!it.rd) {
    const p = lampPos(it); ctx.save(); ctx.globalAlpha = 1 - outK;
    ctx.strokeStyle = '#4a4540'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(640, 0); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.translate(p.x, p.y); ctx.rotate(p.a);
    ctx.fillStyle = '#2a2420'; ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(22, 0); ctx.lineTo(34, 30); ctx.lineTo(-34, 30); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 34, 4, 0, 34, 260); g.addColorStop(0, 'rgba(255,207,128,.55)'); g.addColorStop(1, 'rgba(255,207,128,0)');
    ctx.fillStyle = g; ctx.fillRect(-260, -230, 520, 520); ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const s of it.sparks) { const a = 1 - s.age / s.life; if (a <= 0) continue; ctx.globalAlpha = a; ctx.fillStyle = '#ffd98a'; ctx.fillRect(s.x - 2, s.y - 2, 4, 4); }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- boss phase beats
export function phaseBeat(app, label) {
  const T = state(app); if (!T.on) return;
  T.phase = { t: 0, life: reduced() ? 0.9 : 1.5, label: String(label || 'PHASE II') }; T.phases++;
  if (!reduced()) { post(app, 'flash', '#ffffff', 0.45); post(app, 'shockwave', 640, 40, 0.9, 700); post(app, 'aberration', 5, 300); post(app, 'vignette', 0.6, 800); sfx(app, 'bossIntro', { pitch: 0.8 }); sfx(app, 'seamPop'); }
  audioCall(app, 'setIntensity', 1);
}
export function watchPhases(app, c) {
  if (!c || !c.enemies) return;
  const T = state(app);
  for (const e of c.enemies) {
    const def = e.def || {}; if (def.kind !== 'boss' && def.kind !== 'final' && def.kind !== 'elite') continue;
    if (!(e.hp > 0)) continue;
    const ph = (e.data && e.data.phase) || 1;
    if (e._phSeen === undefined) { e._phSeen = ph; continue; }
    if (ph > e._phSeen) { e._phSeen = ph; phaseBeat(app, ph === 2 ? 'SECOND FITTING' : 'PHASE ' + ph); }
  }
  void T;
}
function drawPhase(app, p) {
  const ctx = app.ctx, k = p.t / p.life, a = k < 0.1 ? k / 0.1 : k > 0.75 ? (1 - k) / 0.25 : 1;
  ctx.save(); ctx.globalAlpha = clamp(a, 0, 1) * 0.9;
  // top band: the strip hangs from the top edge (over the header), never across the play area
  const CY = 32, hh = 60 * eOut(clamp(k * 6, 0, 1)); ctx.fillStyle = 'rgba(14,6,8,.85)'; ctx.fillRect(0, CY - hh / 2, W, hh);
  ctx.fillStyle = '#B3263A'; ctx.fillRect(0, CY - hh / 2, W, 3); ctx.fillRect(0, CY + hh / 2 - 3, W, 3);
  ctx.globalAlpha = clamp(a, 0, 1); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 36px Georgia, serif'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
  const sl = (1 - eOut(clamp(k * 5, 0, 1))) * 140; ctx.strokeStyle = INK; ctx.strokeText(p.label, 640 + sl, CY + 2); ctx.fillStyle = VELLUM; ctx.fillText(p.label, 640 + sl, CY + 2);
  ctx.restore();
}

// ---------------------------------------------------------------- per-frame driver
export function drawTransitions(app, still) {
  const T = state(app); if (!T.on) return;
  if (still) { if (T.wipe) drawWipe(app, T.wipe); if (T.intro) drawIntro(app, T.intro); if (T.phase) drawPhase(app, T.phase); return; }
  const dt = Math.min(app.dt || 0.016, 0.05);
  if (T.snapNext) { T.snapNext = false; capture(app, T); } // a screen change started during this tick's draw: the canvas now holds the complete old frame
  if (T.wipe) {
    const w = T.wipe; w.t += dt;
    if (app.mouse && app.mouse.pressed && w.t > 0.08) w.t = w.life; // a click skips; the click still reaches the new screen
    if (w.t >= w.life) { T.wipe = null; T.finished++; } else drawWipe(app, w);
  }
  if (T.intro) { stepIntro(app, T, dt); if (T.intro) drawIntro(app, T.intro); }
  if (T.phase) { T.phase.t += dt; if (T.phase.t >= T.phase.life) T.phase = null; else drawPhase(app, T.phase); }
}
export function busy(app) { const T = app.tr; return !!(T && (T.wipe || T.intro || T.phase)); }

// ---------------------------------------------------------------- graft ceremony beats (fx = the screen's Fx)
// stitch i of n: needle tick with rising pitch, a thread spark, a tiny strain shiver
export function stitchBeat(app, fx, x, y, i, n, col, over) {
  sfx(app, 'seamExtend', { len: i, vol: 0.8 });
  if (fx) { fx.emit({ x, y, n: over ? 9 : 5, colors: [col, '#ffffff', '#F2C14E'], speed: 150 + i * 14, life: 0.45, size: 2.6, glow: true, gravity: 260 }); }
  if (fx && over && !reduced()) fx.shake(0.06 + 0.02 * i);
}
// the staple lands: gauge reaction + shockwave scaled by how far the deck is stretched
export function clunkBeat(app, st, strainInfo, x, y) {
  const bad = strainInfo && strainInfo.strain > 0;
  st.strainK = 1; st.strainBad = !!bad;
  if (!reduced()) { post(app, 'shockwave', x, y, bad ? 0.5 : 0.3, 500); if (bad) { post(app, 'aberration', 2, 180); post(app, 'vignette', 0.25, 400); } }
  sfx(app, bad ? 'tithe' : 'upgrade', { vol: 0.5 });
}
export function overloadBeat(app, fx, x, y, shatterPct) {
  if (!reduced()) { post(app, 'shockwave', x, y, 1, 800); post(app, 'aberration', 6, 380); post(app, 'flash', '#ff3a2a', 0.4); post(app, 'vignette', 0.7, 900); }
  sfx(app, 'overload'); sfx(app, 'hitCrush', { vol: 0.7 });
  if (fx) {
    fx.float('OVERLOAD', x, y - 110, { color: '#ff7a5a', size: 52, big: true, life: 1.6 });
    fx.float('numbers x1.5', x, y - 60, { color: '#ffd98a', size: 24, life: 1.5 });
    if (shatterPct) fx.float(`${shatterPct}% Shatter on first play`, x, y - 28, { color: '#ffb3b3', size: 22, life: 1.6 });
    fx.ring(x, y, '#ff5a3a', 260, 0.7, 0.08);
  }
}
// Shatter in combat: the card resolves, then breaks. Call next to the screen's own burst.
export function shatterBeat(app, x, y) {
  if (!reduced()) { post(app, 'shockwave', x, y, 0.85, 700); post(app, 'aberration', 5, 320); post(app, 'flash', '#ffe9a8', 0.2); post(app, 'vignette', 0.3, 450); }
  sfx(app, 'hitCrush', { vol: 0.6, pitch: 1.3 });
}
// strain gauge reaction: shake offset while st.strainK > 0, plus a glow rect; call decay each frame with dt
export function gaugeOffset(st, t) { const k = st.strainK || 0; return k > 0 && !reduced() ? { x: Math.sin(t * 70) * 5 * k * (st.strainBad ? 1 : 0.3), y: 0 } : { x: 0, y: 0 }; }
export function gaugeGlow(app, st, x, y, w, h) {
  const k = st.strainK || 0; if (!(k > 0)) return;
  const ctx = app.ctx; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k * 0.5;
  ctx.fillStyle = st.strainBad ? '#ff3a3a' : '#F2C14E'; ctx.beginPath(); ctx.roundRect(x - 8, y - 8, w + 16, h + 16, 10); ctx.fill(); ctx.restore();
}
export function decay(st, dt) { if (st.strainK > 0) st.strainK = Math.max(0, st.strainK - dt * 1.8); }

// ---------------------------------------------------------------- temper (forge hammer)
// heat 0..0.5 s, three strikes, rivets pop, cool to steel blue, then the line of text.
export const TEMPER = { dur: 2.3, heat: [0.05, 0.55], strikes: [0.65, 0.83, 1.01], pop: 1.17, cool: [1.25, 1.85] };
export function temperUpdate(app, a, fx, dt) {
  a.t += dt;
  const rd = reduced();
  a.hit = a.hit || [];
  TEMPER.strikes.forEach((s, i) => {
    if (a.t >= s && !a.hit[i]) {
      a.hit[i] = true;
      sfx(app, 'hitHeavy', { pitch: 0.85 + i * 0.12, vol: 0.8 }); sfx(app, 'blockBreak', { vol: 0.25, pitch: 1.4 });
      if (fx) {
        fx.hitstop(30); if (!rd) fx.shake(0.3 + i * 0.15);
        fx.burst(640, 330, 'spark', { n: 18 + i * 8, speed: 420 + i * 60 }); fx.burst(640, 330, 'ember', { n: 6 }); fx.ring(640, 330, '#ffb347', 150 + i * 40, 0.4);
        if (i === 2) fx.flash('#ffd9a0', 0.15, 0.2);
      }
      if (!rd) post(app, 'shockwave', 640, 330, 0.3 + i * 0.15, 450);
    }
  });
  if (a.t >= TEMPER.pop && !a.popped) {
    a.popped = true; sfx(app, 'graftAttach', { vol: 0.9 });
    if (fx) { fx.burst(640, 330, 'spark', { n: 24, speed: 300 }); fx.hitstop(30); }
  }
  if (a.t >= TEMPER.cool[0] && !a.cooled) { a.cooled = true; sfx(app, 'block', { vol: 0.7 }); if (fx) fx.burst(640, 330, 'dust', { n: 8 }); }
  if (a.t >= TEMPER.cool[1] && !a.done) { a.done = true; sfx(app, 'upgrade', { vol: 0.8 }); if (fx) fx.flash('#9fc4d8', 0.2, 0.3); }
  return a.t >= TEMPER.dur;
}
// 0 cold, 1 white-orange hot, back to 0
export function heatAt(t) {
  if (t < TEMPER.heat[0]) return 0;
  if (t < TEMPER.heat[1]) return eOut((t - TEMPER.heat[0]) / (TEMPER.heat[1] - TEMPER.heat[0])) * 0.8;
  const last = TEMPER.strikes[2];
  if (t < last) return 0.8 + 0.2 * (t - TEMPER.heat[1]) / (last - TEMPER.heat[1]);
  if (t < TEMPER.cool[0]) return 1;
  return clamp(1 - (t - TEMPER.cool[0]) / (TEMPER.cool[1] - TEMPER.cool[0]), 0, 1);
}
export function steelAt(t) { return clamp((t - TEMPER.cool[0]) / (TEMPER.cool[1] - TEMPER.cool[0]), 0, 1); }
// hammer: { y offset, angle } for forge.drawHammer(g, 800, 220 + dy, ang)
export function hammerPose(t) {
  // wind-up (eIn) to each strike, then a short recoil bounce back up (eOut) before the next wind-up: no teleporting between strikes
  const S = TEMPER.strikes, UP = -0.75, DOWN = 0.4, REC = 0.09;
  let i = 0; while (i < S.length && t >= S[i]) i++;
  if (i >= S.length) { const k = clamp((t - S[2]) / 0.5, 0, 1), d = clamp((t - S[2] - 0.5) / 0.8, 0, 1); return { dy: lerp(40, -20, eOut(k)) - 90 * eInOut(d), ang: lerp(DOWN, UP, eOut(k)) - 0.2 * eInOut(d) }; } // lifts clear, then drifts up and away while the card cools
  if (i > 0 && t < S[i - 1] + REC) { const k = eOut((t - S[i - 1]) / REC); return { dy: lerp(40, -14, k), ang: lerp(DOWN, UP + 0.3, k) }; }
  const s0 = i > 0 ? S[i - 1] + REC : 0.1, k = clamp((t - s0) / (S[i] - s0), 0, 1);
  return i > 0 ? { dy: lerp(-14, 40, eIn(k)), ang: lerp(UP + 0.3, DOWN, eIn(k)) } : { dy: lerp(-30, 40, eIn(k)), ang: lerp(UP, DOWN, eIn(k)) };
}
// tint over the card rect (cx, cy centre, w x h); rivets pop at the corners of the patch zone
export function temperTint(app, a, cx, cy, w, h) {
  const g = app.ctx, heat = heatAt(a.t), steel = steelAt(a.t);
  g.save();
  if (heat > 0.02) { g.globalCompositeOperation = 'source-over'; g.globalAlpha = heat * 0.5; g.fillStyle = heat > 0.85 ? '#ff8a2a' : '#e8501a'; g.beginPath(); g.roundRect(cx - w / 2, cy - h / 2, w, h, 14); g.fill(); }
  if (steel > 0 && steel < 1.001) { g.globalCompositeOperation = 'source-over'; g.globalAlpha = Math.sin(steel * Math.PI) * 0.35; g.fillStyle = '#7fa8c4'; g.beginPath(); g.roundRect(cx - w / 2, cy - h / 2, w, h, 14); g.fill(); }
  g.restore();
}
export function temperRivets(app, a, cx, cy, w, h, n) {
  if (!(a.t >= TEMPER.pop)) return;
  const g = app.ctx, k = eBack(clamp((a.t - TEMPER.pop) / 0.12, 0, 1)), cnt = clamp(n || 2, 1, 4);
  const spots = [[-0.4, 0.12], [0.4, 0.12], [-0.4, 0.38], [0.4, 0.38]];
  g.save();
  for (let i = 0; i < cnt; i++) {
    const x = cx + spots[i][0] * w, y = cy + spots[i][1] * h, r = 7 * k;
    g.fillStyle = '#c9d2d6'; g.strokeStyle = '#2b2f33'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, 6.283); g.fill();
  }
  g.restore();
}

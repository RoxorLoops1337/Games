// WebGL2 post-processing layer: bloom, shockwave warp, chromatic aberration, per-act grade, vignette, grain, flash.
//
// Architecture: every screen keeps drawing to the 2D canvas (app.canvas). installPost puts a GL canvas exactly over it
// (same CSS box, pointer-events:none, so mouse and touch keep reaching the 2D canvas whose pixels stay readable). Each
// app.afterFrame the 2D canvas is uploaded and run through: soft-knee threshold -> dual-filter downsamples -> additive
// tent upsample -> composite. Quality 'off' (or no WebGL2, or a lost context) means no GL canvas: the 2D canvas shows.
//
// API (always safe to call; no-ops when off / reduced motion). Logical coordinates are the 1280x720 space.
//   app.post.shockwave(x, y, strength, ms)  strength 0..1 (1 = ~24 logical px peak warp), ms ring life. Up to 4 at once.
//   app.post.aberration(amount, ms)         amount in logical px at the screen edge (2 to 3 for heavy hits)
//   app.post.flash(color, a)                '#rrggbb' or [r,g,b] 0..1, a 0..1, decays in ~200 ms
//   app.post.vignette(a, ms)                extra vignette that decays over ms
//   app.post.setBloom(k, threshold?)        k 0..1.5 (default .5), threshold 0.8..1 (default .94, keep >= .88 or vellum blows out)
//   app.post.setGrade(name, ms)             'ward'|'market'|'theatre'|'boss'|'title'|'neutral' (auto-selected per screen)
//   app.post.setMaskRects([[x,y,w,h],...])  up to 8 rects where warp and aberration are zeroed
//   app.post.setQuality('off'|'low'|'high')
//   app.staticFrame = true                  optional hint from a screen: the 2D canvas did not change, skip the upload
// Not thread-safe (main thread only). The frame loop (update/render) allocates nothing.
import { flashGate } from './fx.js';
import { VS, FS_THRESH, FS_DOWN, FS_UP, FS_COMP, GRADES } from './post_shaders.js';

const W = 1280, H = 720;
const EMPTY = Object.freeze({});
const TIERS = ['off', 'low', 'high'];
const COMBAT_RECTS = [[0, 0, 1280, 56], [140, 540, 1000, 180]];
const BOSS_KINDS = { boss: 1, final: 1 };
const ACT_GRADE = { 1: 'ward', 2: 'market', 3: 'theatre' };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function parseColor(c, out) {
  if (Array.isArray(c)) { out[0] = +c[0] || 0; out[1] = +c[1] || 0; out[2] = +c[2] || 0; return; }
  let s = typeof c === 'string' ? c.trim() : '#ffffff';
  if (s[0] === '#') s = s.slice(1);
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16);
  if (!(n >= 0)) { out[0] = out[1] = out[2] = 1; return; }
  out[0] = ((n >> 16) & 255) / 255; out[1] = ((n >> 8) & 255) / 255; out[2] = (n & 255) / 255;
}

export function installPost(app) {
  const canvas = app.canvas;
  const hasDom = typeof document !== 'undefined' && typeof window !== 'undefined' && canvas && canvas.parentNode && typeof canvas.parentNode.insertBefore === 'function' && typeof document.createElement === 'function';
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ---- effect state (plain preallocated typed arrays) ----
  const sw = { x: new Float32Array(4), y: new Float32Array(4), str: new Float32Array(4), age: new Float32Array(4), ms: new Float32Array(4), n: 0 };
  const swA = new Float32Array(16), swB = new Float32Array(16);
  const ab = { amt: 0, age: 0, ms: 1 };
  const vg = { a: 0, age: 0, ms: 1 };
  const fl = { a: 0, rate: 5, c: new Float32Array([1, 1, 1]) };
  const bl = { k: 0.6, thr: 0.94, knee: 0.06 };
  const gCur = new Float32Array(GRADES.neutral), gFrom = new Float32Array(GRADES.neutral), gTo = new Float32Array(GRADES.neutral);
  const g = { t: 1, ms: 1, name: 'neutral', autoKey: '' };
  const userRects = new Float32Array(32); let nUser = 0;
  const maskU = new Float32Array(32);
  const stats = { ms: 0, avgFrame: 16.7, frames: 0, tier: 'off', ceiling: 'high', drops: 0, rises: 0 };

  const S = { tier: 'off', ceiling: 'high', noGL: !hasDom, lost: false, gradeInit: false, dirty: true, errors: 0, auto: true, lastWant: undefined, lastNow: 0, lastChange: 0, fastSince: 0, lastGrain: 0 };
  const ring = new Float32Array(60); let ringI = 0, ringN = 0, ringSum = 0;
  const R = { cv: null, gl: null, P: null, tex: null, texW: 0, texH: 0, T: [], U: [], levels: 0, vao: null, half: false, sw: 0, sh: 0, glW: 0, glH: 0, sLeft: '', sTop: '', sWidth: '', sHeight: '', ignoreLoss: false };

  // ---- GL resource management ----
  function compile(gl, src, type) {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('post shader: ' + gl.getShaderInfoLog(sh));
    return sh;
  }
  function program(gl, fs, names) {
    const pr = gl.createProgram();
    gl.attachShader(pr, compile(gl, VS, gl.VERTEX_SHADER)); gl.attachShader(pr, compile(gl, fs, gl.FRAGMENT_SHADER));
    gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('post link: ' + gl.getProgramInfoLog(pr));
    const u = { pr };
    for (const n of names) u[n] = gl.getUniformLocation(pr, n);
    return u;
  }
  function mkTex(gl) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function destroyTargets() {
    const gl = R.gl; if (!gl) return;
    for (const t of R.T) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    for (const t of R.U) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    R.T = []; R.U = [];
  }
  function allocTargets() {
    const gl = R.gl; destroyTargets();
    const shift = R.glW > 1800 ? 2 : 1;
    let cw = Math.max(2, R.glW >> shift), ch = Math.max(2, R.glH >> shift);
    const want = S.tier === 'high' ? 5 : 3;
    for (let pass = 0; pass < 2; pass++) { // pass 0: try half float; pass 1: RGBA8 fallback
      const half = pass === 0 && R.half; let ok = true; let w = cw, h = ch;
      for (let i = 0; i < want; i++) {
        const tex = mkTex(gl); gl.texStorage2D(gl.TEXTURE_2D, 1, half ? gl.RGBA16F : gl.RGBA8, w, h);
        const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) ok = false;
        R.T.push({ tex, fb, w, h, ipx: 1 / w, ipy: 1 / h });
        if (i < want - 1) { // upsample accumulator for this level (the smallest level is its own accumulator)
          const tex2 = mkTex(gl); gl.texStorage2D(gl.TEXTURE_2D, 1, half ? gl.RGBA16F : gl.RGBA8, w, h);
          const fb2 = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb2); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex2, 0);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) ok = false;
          R.U.push({ tex: tex2, fb: fb2, w, h });
        } else R.U.push(R.T[i]);
        w = Math.max(2, w >> 1); h = Math.max(2, h >> 1);
      }
      if (ok) { R.levels = want; R.bloomTex = R.U[0].tex; gl.bindFramebuffer(gl.FRAMEBUFFER, null); return; }
      destroyTargets();
    }
    throw new Error('post: no complete framebuffer');
  }
  function allocSource() {
    const gl = R.gl; if (R.tex) gl.deleteTexture(R.tex);
    R.texW = canvas.width | 0; R.texH = canvas.height | 0;
    R.tex = mkTex(gl); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, Math.max(1, R.texW), Math.max(1, R.texH));
  }
  function glSize() {
    const dpr = S.tier === 'low' ? (app.dpr || 1) : 1;
    R.glW = Math.max(2, Math.round((canvas.width | 0) / dpr)); R.glH = Math.max(2, Math.round((canvas.height | 0) / dpr));
  }
  function syncBox() {
    const st = canvas.style, cs = R.cv.style;
    R.sLeft = st.left; R.sTop = st.top; R.sWidth = st.width; R.sHeight = st.height;
    cs.left = st.left; cs.top = st.top; cs.width = st.width; cs.height = st.height;
  }
  function onLost(e) { if (e.target !== R.cv) return; e.preventDefault(); if (R.ignoreLoss) return; S.lost = true; stats.tier = 'lost'; post.on = false; if (R.cv) R.cv.style.visibility = 'hidden'; }
  function onRestored(e) {
    if (R.ignoreLoss || e.target !== R.cv) return;
    try { buildGL(); S.lost = false; R.cv.style.visibility = 'visible'; post.on = true; stats.tier = S.tier; S.dirty = true; } catch (err) { goOff(true); }
  }
  function buildGL() {
    const gl = R.gl;
    R.half = !!(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
    R.P = {
      thresh: program(gl, FS_THRESH, ['t', 'px', 'thr', 'knee']),
      down: program(gl, FS_DOWN, ['t', 'px']),
      up: program(gl, FS_UP, ['t', 'skip', 'px']),
      comp: program(gl, FS_COMP, ['t', 'bloom', 'bloomK', 'caK', 'vig', 'grain', 'seed', 'flashA', 'gamma', 'sat', 'flashC', 'lift', 'gain', 'res', 'swA', 'swB', 'mask', 'nMask']),
    };
    R.vao = gl.createVertexArray(); gl.bindVertexArray(R.vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    glSize(); R.cv.width = R.glW; R.cv.height = R.glH;
    allocSource(); allocTargets();
  }
  function createGL() {
    if (S.noGL || !hasDom) return false;
    try {
      const cv = document.createElement('canvas');
      const gl = cv.getContext && cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
      if (!gl || typeof gl.createShader !== 'function' || typeof gl.texStorage2D !== 'function') { S.noGL = true; return false; }
      const cs = cv.style; cs.position = 'absolute'; cs.display = 'block'; cs.pointerEvents = 'none'; cs.zIndex = '1'; cs.outline = 'none'; cs.imageRendering = 'auto';
      cv.setAttribute && cv.setAttribute('aria-hidden', 'true');
      R.cv = cv; R.gl = gl;
      cv.addEventListener('webglcontextlost', onLost); cv.addEventListener('webglcontextrestored', onRestored);
      buildGL(); syncBox();
      canvas.parentNode.insertBefore(cv, canvas.nextSibling || null);
      return true;
    } catch (err) {
      destroyGL(); S.noGL = true; return false;
    }
  }
  function destroyGL() {
    const cv = R.cv, gl = R.gl;
    R.ignoreLoss = true;
    try { if (gl) { const ext = gl.getExtension && gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } } catch (e) { /* ignore */ }
    try { if (cv && cv.parentNode) cv.parentNode.removeChild(cv); } catch (e) { /* ignore */ }
    R.cv = null; R.gl = null; R.P = null; R.tex = null; R.T = []; R.U = []; R.levels = 0; R.ignoreLoss = false; S.lost = false;
  }
  function goOff(permanent) {
    destroyGL(); post.on = false; S.tier = permanent ? 'off' : 'off'; stats.tier = 'off';
    if (permanent) S.noGL = true;
  }
  function setTier(q) {
    if (!TIERS.includes(q)) return;
    if (q === 'off' || S.noGL || !hasDom) { if (S.tier !== 'off' || R.cv) goOff(false); S.tier = 'off'; stats.tier = 'off'; return; }
    const prev = S.tier; S.tier = q;
    if (!R.cv) { if (!createGL()) { S.tier = 'off'; post.on = false; stats.tier = 'off'; return; } }
    else if (prev !== q) { try { glSize(); R.cv.width = R.glW; R.cv.height = R.glH; allocTargets(); } catch (err) { goOff(true); return; } }
    post.on = !S.lost; stats.tier = q; S.dirty = true;
  }

  // ---- public API ----
  const post = {
    on: false, autoQuality: true,
    setQuality(q) { if (!TIERS.includes(q)) return; S.ceiling = q; stats.ceiling = q; setTier(q); resetRing(); },
    setGrade(name, ms) {
      const to = GRADES[name]; if (!to) return;
      for (let i = 0; i < 9; i++) { gFrom[i] = gCur[i]; gTo[i] = to[i]; }
      g.name = name; g.t = 0; g.ms = Math.max(1, ms === undefined ? 700 : +ms || 1); S.dirty = true;
    },
    setBloom(k, threshold) { if (typeof k === 'number' && k === k) bl.k = clamp(k, 0, 1.5); if (typeof threshold === 'number' && threshold === threshold) bl.thr = clamp(threshold, 0.5, 1.2); S.dirty = true; },
    shockwave(x, y, strength, ms) {
      if (S.tier === 'off' || reduced() || !(strength > 0)) return;
      let i = sw.n; if (i >= 4) { i = 0; for (let j = 1; j < 4; j++) if (sw.age[j] / sw.ms[j] > sw.age[i] / sw.ms[i]) i = j; } else sw.n++;
      sw.x[i] = (+x || 0) / W; sw.y[i] = (+y || 0) / H; sw.str[i] = clamp(+strength, 0, 1.5) * 0.034; sw.ms[i] = Math.max(80, +ms || 600); sw.age[i] = 0;
    },
    aberration(amount, ms) {
      if (S.tier !== 'high' || !(amount > 0)) return;
      const a = clamp(+amount, 0, 8) * (reduced() ? 0.2 : 1);
      if (a >= ab.amt * (1 - ab.age / ab.ms)) { ab.amt = a; ab.age = 0; ab.ms = Math.max(30, +ms || 120); }
    },
    flash(color, a) {
      if (S.tier === 'off' || !(a > 0) || (app.shared && app.shared.meta && app.shared.meta.settings && app.shared.meta.settings.flashes === false) || !flashGate()) return;
      parseColor(color, fl.c); fl.a = clamp(+a, 0, 1) * (reduced() ? 0.2 : 1); fl.rate = fl.a / 0.2;
    },
    vignette(a, ms) { if (S.tier === 'off' || !(a > 0)) return; vg.a = clamp(+a, 0, 1); vg.age = 0; vg.ms = Math.max(30, +ms || 300); },
    setMaskRects(rects) {
      nUser = 0; if (!rects) return;
      for (let i = 0; i < rects.length && nUser < 8; i++) {
        const r = rects[i]; if (!r) continue;
        const o = nUser * 4; userRects[o] = r[0] / W; userRects[o + 1] = r[1] / H; userRects[o + 2] = (r[0] + r[2]) / W; userRects[o + 3] = (r[1] + r[3]) / H; nUser++;
      }
    },
    stats,
    // advance effect timers by dt seconds (render() calls this with the real frame time)
    update(dt) {
      const ms = dt * 1000;
      for (let i = 0; i < sw.n;) {
        sw.age[i] += ms;
        if (sw.age[i] >= sw.ms[i]) { const l = --sw.n; sw.x[i] = sw.x[l]; sw.y[i] = sw.y[l]; sw.str[i] = sw.str[l]; sw.age[i] = sw.age[l]; sw.ms[i] = sw.ms[l]; } else i++;
      }
      if (ab.amt > 0) { ab.age += ms; if (ab.age >= ab.ms) ab.amt = 0; }
      if (vg.a > 0) { vg.age += ms; if (vg.age >= vg.ms) vg.a = 0; }
      if (fl.a > 0) { fl.a = Math.max(0, fl.a - fl.rate * dt); }
      if (g.t < 1) { g.t = Math.min(1, g.t + ms / g.ms); const e = g.t * g.t * (3 - 2 * g.t); for (let i = 0; i < 9; i++) gCur[i] = gFrom[i] + (gTo[i] - gFrom[i]) * e; }
    },
    render: () => renderFrame(),
  };
  app.post = post;

  // ---- settings, auto grade, auto quality ----
  function settings() { const m = app.shared && app.shared.meta; return (m && m.settings) || EMPTY; }
  function reduced() { return settings().reducedMotion === true; }
  function resetRing() { ringN = 0; ringI = 0; ringSum = 0; S.lastChange = now(); S.fastSince = 0; }
  function autoGrade() {
    const cur = app.current, run = app.shared && app.shared.run;
    let name;
    if (!cur || cur === 'title' || !run) name = cur === 'title' || !run ? 'title' : 'neutral';
    else if (cur === 'combat' && run.pending && BOSS_KINDS[run.pending.fightKind] === 1) name = 'boss';
    else name = ACT_GRADE[run.act] || 'neutral';
    if (S.autoKey !== name) { S.autoKey = name; post.setGrade(name, S.gradeInit ? 700 : 1); S.gradeInit = true; }
  }
  function maskCount() {
    let n = 0;
    if (app.current === 'combat') {
      for (let i = 0; i < 2; i++) { const r = COMBAT_RECTS[i], o = n * 4; maskU[o] = r[0] / W; maskU[o + 1] = r[1] / H; maskU[o + 2] = (r[0] + r[2]) / W; maskU[o + 3] = (r[1] + r[3]) / H; n++; }
    }
    if (app.tip && app.mouse) { // rough tooltip box (core.js drawTip: 324 wide, flips at the right/bottom edges)
      let x = app.mouse.x + 18, y = app.mouse.y + 18; if (x + 336 > W) x = app.mouse.x - 336 - 12; if (y + 260 > H) y = H - 268;
      const o = n * 4; maskU[o] = x / W; maskU[o + 1] = y / H; maskU[o + 2] = (x + 336) / W; maskU[o + 3] = (y + 260) / H; n++;
    }
    for (let i = 0; i < nUser && n < 8; i++, n++) for (let k = 0; k < 4; k++) maskU[n * 4 + k] = userRects[i * 4 + k];
    return n;
  }
  S.autoKey = '';
  function autoQuality(t, frameMs) {
    ringSum += frameMs - ring[ringI]; ring[ringI] = frameMs; ringI = (ringI + 1) % 60; if (ringN < 60) ringN++;
    stats.frames++;
    if (ringN < 60) return;
    const avg = ringSum / 60; stats.avgFrame = avg;
    if (post.autoQuality === false || t - S.lastChange < 5000) { if (avg >= 12) S.fastSince = 0; return; }
    const ti = TIERS.indexOf(S.tier);
    if (avg > 18 && ti > 0 && (ti > 1 || avg > 24)) { setTier(TIERS[ti - 1]); stats.drops++; resetRing(); return; }
    if (avg < 12) { if (!S.fastSince) S.fastSince = t; else if (t - S.fastSince > 10000 && ti < TIERS.indexOf(S.ceiling)) { setTier(TIERS[ti + 1]); stats.rises++; resetRing(); } } else S.fastSince = 0;
  }

  // ---- frame ----
  function fxActive() { return sw.n > 0 || ab.amt > 0 || vg.a > 0 || fl.a > 0 || g.t < 1; }
  function renderFrame() {
    const t0 = now();
    const frameMs = S.lastNow ? Math.min(100, t0 - S.lastNow) : 16.7; S.lastNow = t0;
    const dt = frameMs / 1000;
    const st = settings();
    const want = st.quality;
    if (want !== S.lastWant) { S.lastWant = want; if (TIERS.includes(want)) { S.ceiling = want; stats.ceiling = want; if (want !== S.tier) setTier(want); resetRing(); } }
    post.update(dt);
    autoGrade();
    autoQuality(t0, frameMs);
    if (S.tier === 'off' || S.lost || !R.cv) return;
    const gl = R.gl, rm = st.reducedMotion === true;
    try {
      // follow the 2D canvas box and size
      const cs = canvas.style;
      if (R.texW !== (canvas.width | 0) || R.texH !== (canvas.height | 0)) {
        glSize(); R.cv.width = R.glW; R.cv.height = R.glH; allocSource(); allocTargets(); S.dirty = true;
      }
      if (cs.left !== R.sLeft || cs.top !== R.sTop || cs.width !== R.sWidth || cs.height !== R.sHeight) syncBox();
      const high = S.tier === 'high';
      const grainOn = high && !rm && st.grain !== false;
      const active = fxActive();
      const stat = app.staticFrame === true && !S.dirty;
      let grainDue = false;
      if (grainOn && stat && t0 - S.lastGrain >= 50) grainDue = true;
      if (stat && !active && !grainDue) return;
      if (grainOn && (!stat || grainDue)) S.lastGrain = t0;
      const P = R.P, T = R.T, L = R.levels;
      gl.bindVertexArray(R.vao);
      if (!stat) {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.tex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      }
      const doBloom = bl.k > 0 && (!stat || S.dirty);
      if (doBloom) {
        gl.useProgram(P.thresh.pr); gl.bindFramebuffer(gl.FRAMEBUFFER, T[0].fb); gl.viewport(0, 0, T[0].w, T[0].h);
        gl.bindTexture(gl.TEXTURE_2D, R.tex); gl.uniform1i(P.thresh.t, 0); gl.uniform2f(P.thresh.px, 1 / R.texW, 1 / R.texH);
        gl.uniform1f(P.thresh.thr, bl.thr); gl.uniform1f(P.thresh.knee, bl.knee); gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.useProgram(P.down.pr); gl.uniform1i(P.down.t, 0);
        for (let i = 1; i < L; i++) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, T[i].fb); gl.viewport(0, 0, T[i].w, T[i].h);
          gl.bindTexture(gl.TEXTURE_2D, T[i - 1].tex); gl.uniform2f(P.down.px, T[i - 1].ipx, T[i - 1].ipy); gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        gl.useProgram(P.up.pr); gl.uniform1i(P.up.t, 0); gl.uniform1i(P.up.skip, 1);
        const U = R.U;
        for (let i = L - 2; i >= 0; i--) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, U[i].fb); gl.viewport(0, 0, T[i].w, T[i].h);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T[i].tex); gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, U[i + 1].tex); gl.uniform2f(P.up.px, T[i + 1].ipx, T[i + 1].ipy); gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      }
      // composite uniforms
      for (let i = 0; i < 4; i++) {
        const o = i * 4;
        if (i < sw.n) {
          const k = sw.age[i] / sw.ms[i], inv = 1 - k;
          swA[o] = sw.x[i]; swA[o + 1] = sw.y[i]; swA[o + 2] = (1 - inv * inv) * 0.9; swA[o + 3] = sw.str[i] * inv * inv;
          swB[o] = 0.05 + 0.07 * k; swB[o + 1] = 0; swB[o + 2] = 0; swB[o + 3] = 0;
        } else { swA[o + 3] = 0; swB[o] = 0.1; }
      }
      const nM = maskCount();
      let caK = 0;
      if (high) { caK = 2 * 0.4 / R.glW; if (ab.amt > 0) { const k = 1 - ab.age / ab.ms; caK += 2 * ab.amt * k * k / W; } }
      const vgn = clamp(gCur[8] + (vg.a > 0 ? vg.a * (1 - vg.age / vg.ms) : 0), 0, 0.95);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, R.glW, R.glH);
      gl.useProgram(P.comp.pr);
      const u = P.comp;
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.U[0].tex); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.tex);
      gl.uniform1i(u.t, 0); gl.uniform1i(u.bloom, 1);
      gl.uniform1f(u.bloomK, bl.k); gl.uniform1f(u.caK, caK); gl.uniform1f(u.vig, vgn);
      gl.uniform1f(u.grain, grainOn ? 0.05 : 0); gl.uniform1f(u.seed, Math.floor(app.t * 24) % 997); gl.uniform2f(u.res, R.glW, R.glH);
      gl.uniform1f(u.flashA, fl.a); gl.uniform3f(u.flashC, fl.c[0], fl.c[1], fl.c[2]);
      gl.uniform3f(u.lift, gCur[0], gCur[1], gCur[2]); gl.uniform3f(u.gain, gCur[3], gCur[4], gCur[5]); gl.uniform1f(u.gamma, gCur[6]); gl.uniform1f(u.sat, gCur[7]);
      gl.uniform4fv(u.swA, swA); gl.uniform4fv(u.swB, swB); gl.uniform4fv(u.mask, maskU); gl.uniform1i(u.nMask, nM);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      S.dirty = false;
      S.errors = 0;
    } catch (err) {
      if (++S.errors >= 3) goOff(true);
    }
    stats.ms += (now() - t0 - stats.ms) * 0.05; // smoothed JS cost of the pass in ms
  }

  // ---- DOM wiring ----
  if (hasDom) {
    window.addEventListener('resize', () => { if (R.cv) syncBox(); });
    if (typeof document.addEventListener === 'function') document.addEventListener('fullscreenchange', () => { if (R.cv) syncBox(); });
    const prev = app.afterFrame;
    app.afterFrame = (a) => { if (prev) prev(a); renderFrame(); };
    const q = settings().quality;
    S.lastWant = q;
    const start = TIERS.includes(q) ? q : 'high';
    S.ceiling = start; stats.ceiling = start;
    setTier(start);
    S.lastChange = now();
  } else {
    // no DOM (node tests): the API keeps working, nothing renders; tests may call app.post.render() themselves
    S.tier = 'off';
  }
}

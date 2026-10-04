// Clawspire 2.0 trailer: timeline + frame driver.
// Shots register with shot({id, t0, t1, draw(g, lt, P, t), post(lt, P, t)}) and
// paint in list order (later shots on top) whenever t is inside [t0, t1).
'use strict';

const SHOTS = [];
// the 16:9 master and the vertical cut each have their own shot list (shots_v.js marks its shots vert: true)
function shot(def) { if (!!def.vert === VERT) SHOTS.push(def); return def; }
const POSTFX = [];
function postfx(fn) { POSTFX.push(fn); }

const sceneCv = makeCanvas(CW, CH);
const g = sceneCv.getContext('2d', { alpha: false, willReadFrequently: true });
const outCv = document.getElementById('out');
outCv.width = CW; outCv.height = CH;
const post = makePost(outCv, CW, CH);

function resetCtx() {
  base(g);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'medium';
  g.letterSpacing = '0px';
}
function paint(t, P) {
  resetCtx();
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  for (const s of SHOTS) {
    if (t >= s.t0 && t < s.t1) {
      g.save();
      s.draw(g, t - s.t0, P, t);
      g.restore();
      resetCtx();
    }
  }
}
function postParams(t) {
  const P = POST_DEFAULTS();
  P.K = 4; P.shutter = .5;
  for (const s of SHOTS) if (t >= s.t0 && t < s.t1 && s.post) s.post(t - s.t0, P, t);
  for (const f of POSTFX) f(t, P);
  return P;
}
// FRAME_T: the frame's own time (footage frame picks may read it so motion blur
// never cross-fades two unrelated stills); cameras and particles read sub-frame time
let FRAME_T = 0;
function renderFrame(t, Kover) {
  FRAME_T = t;
  const P = postParams(t);
  const K = Kover || P.K;
  let lo = 0, hi = DUR - 1e-6;
  for (const s of SHOTS) if (t >= s.t0 && t < s.t1 && s.cut !== false) { lo = Math.max(lo, s.t0); hi = Math.min(hi, s.t1 - 1e-6); }
  post.begin(K);
  for (let i = 0; i < K; i++) {
    const ts = K === 1 ? t : t + ((i + .5) / K - .5) * P.shutter / FPS;
    paint(clamp(ts, lo, hi), P);
    post.add(sceneCv);
  }
  post.finish(P, t);
}
// render-mode frame: paint, and if any footage frame was missing, load and repaint
async function renderReady(t, Kover) {
  for (let tries = 0; tries < 6; tries++) {
    MISS.clear();
    renderFrame(t, Kover);
    if (!MISS.size) break;
    await awaitMisses();
  }
  prefetch();
}
window.frameJpeg = async (t, q = .95) => { await renderReady(t); return outCv.toDataURL('image/jpeg', q); };
window.contactSheet = async (ts, cols = 6) => {
  const cw = VERT ? 180 : 320, ch = VERT ? 320 : 180, rows = Math.ceil(ts.length / cols);
  const sh = makeCanvas(cols * cw, rows * (ch + 18)); const sg = sh.getContext('2d');
  sg.fillStyle = '#111'; sg.fillRect(0, 0, sh.width, sh.height); sg.imageSmoothingEnabled = true;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    await renderReady(t);
    const x = (i % cols) * cw, y = Math.floor(i / cols) * (ch + 18);
    sg.drawImage(outCv, x, y, cw, ch);
    sg.fillStyle = '#ff0'; sg.font = '13px monospace';
    sg.fillText(t.toFixed(2) + 's  b' + (t / BEAT).toFixed(1), x + 4, y + ch + 14);
  }
  return sh.toDataURL('image/jpeg', .9);
};

window.trailerReady = false;
window.addEventListener('load', () => Promise.all([assetsReady(), fontsReady(), loadScenes()]).then(() => {
  window.trailerReady = true;
  if (location.hash === '#play' || location.hash === '') live();
}));

// live preview loop (the real thing is the frame-stepped render)
function live() {
  const hud = document.getElementById('hud');
  let start = performance.now(), audio = null;
  document.body.addEventListener('click', () => {
    try { if (audio) audio.pause(); audio = new Audio('../../clawspire/trailer.mp4'); audio.play().catch(() => {}); } catch (e) { /* no film yet */ }
    start = performance.now();
  });
  hud.textContent = 'click to restart (with sound once the film exists)';
  const loop = () => {
    const t = ((performance.now() - start) / 1000) % DUR;
    MISS.clear();
    renderFrame(t, 1);
    prefetch(12);
    requestAnimationFrame(loop);
  };
  loop();
}

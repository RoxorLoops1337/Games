// No Room For Heroes trailer: timeline + frame driver.
// Shots register with shot({id, t0, t1, draw(g, lt, P, t), K}) and paint in
// list order (later shots on top) whenever t is inside [t0, t1).
'use strict';

const DUR = 15;
const SHOTS = [];
function shot(def) { SHOTS.push(def); return def; }
// global post hooks: fn(t, P) run after the shots' own post tweaks (beat kicks, fades)
const POSTFX = [];
function postfx(fn) { POSTFX.push(fn); }

const sceneCv = document.createElement('canvas');
sceneCv.width = W; sceneCv.height = H;
// willReadFrequently keeps this canvas on CPU Skia: headless Chromium has no GPU, and CPU
// raster beats SwiftShader-emulated GPU raster several times over for 2D work
const g = sceneCv.getContext('2d', { alpha: false, willReadFrequently: true });

const outCv = document.getElementById('out');
outCv.width = W; outCv.height = H;
const post = makePost(outCv, W, H);

function paint(t, P) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  for (const s of SHOTS) {
    if (t >= s.t0 && t < s.t1) {
      g.save();
      s.draw(g, t - s.t0, P, t);
      g.restore();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
    }
  }
}

function postParams(t) {
  const P = POST_DEFAULTS();
  P.K = 4;            // sub-frames per frame (motion blur quality)
  P.shutter = 0.5;    // fraction of the frame interval the shutter is open (180 degrees)
  for (const s of SHOTS) if (t >= s.t0 && t < s.t1 && s.post) s.post(t - s.t0, P, t);
  for (const f of POSTFX) f(t, P);
  return P;
}

// FRAME_T: the frame's own time. Sprite animation reads it (so motion blur
// never cross-fades two animation cells); cameras and particles read the
// sub-frame time they are painted at.
let FRAME_T = 0;
function renderFrame(t, Kover) {
  FRAME_T = t;
  const P = postParams(t);
  const K = Kover || P.K;
  // the shutter never straddles a hard cut: sub-samples stay inside the shot
  // that owns this frame (a cut on an exact frame would otherwise double-expose)
  let lo = 0, hi = DUR - 1e-6;
  for (const s of SHOTS) if (t >= s.t0 && t < s.t1) { lo = Math.max(lo, s.t0); hi = Math.min(hi, s.t1 - 1e-6); }
  post.begin(K);
  for (let i = 0; i < K; i++) {
    const ts = K === 1 ? t : t + ((i + .5) / K - .5) * P.shutter / FPS;
    paint(clamp(ts, lo, hi), P);
    post.add(sceneCv);
  }
  post.finish(P, t);
}

window.frameJpeg = (t, q = .96) => { renderFrame(t); return outCv.toDataURL('image/jpeg', q); };
window.contactSheet = (ts) => {
  const cols = 6, cw = 320, ch = 180, rows = Math.ceil(ts.length / cols);
  const sh = document.createElement('canvas'); sh.width = cols * cw; sh.height = rows * (ch + 18);
  const sg = sh.getContext('2d'); sg.fillStyle = '#111'; sg.fillRect(0, 0, sh.width, sh.height);
  sg.imageSmoothingEnabled = true;
  ts.forEach((t, i) => {
    renderFrame(t);
    const x = (i % cols) * cw, y = Math.floor(i / cols) * (ch + 18);
    sg.drawImage(outCv, x, y, cw, ch);
    sg.fillStyle = '#ff0'; sg.font = '13px monospace'; sg.fillText(t.toFixed(2) + 's', x + 4, y + ch + 14);
  });
  return sh.toDataURL('image/jpeg', .9);
};

// ---- boot
window.trailerReady = false;
// wait for 'load' so every shot script has already queued its art
window.addEventListener('load', () => Promise.all([assetsReady(), fontsReady()]).then(() => {
  window.trailerReady = true;
  if (location.hash === '#play' || location.hash === '') live();
}));

// live preview (the real thing is the frame-stepped render; this is for eyeballing)
function live() {
  const hud = document.getElementById('hud');
  let start = null, audio = null;
  const go = () => {
    hud.textContent = '';
    // the soundtrack rides along from the published film (no separate audio file to keep in sync)
    try { audio = new Audio(ART + 'trailer.mp4'); audio.play().catch(() => {}); } catch (e) {}
    start = performance.now();
  };
  document.body.addEventListener('click', () => { if (audio) { audio.pause(); audio.currentTime = 0; } go(); });
  hud.textContent = 'click to play with sound';
  start = performance.now();
  const loop = () => {
    const t = ((performance.now() - start) / 1000) % DUR;
    if (audio && t < 0.05 && audio.currentTime > 1) { audio.currentTime = 0; }
    renderFrame(t, 1);
    requestAnimationFrame(loop);
  };
  loop();
}

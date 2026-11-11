// Wide phones (about 2.16:1) show the 16:9 stage with black bars on both sides. The stage and every layout stay 16:9 (the safe area: all UI lives
// inside it), and this module fills the bars with the picture continuing outward: the outermost columns of the stage are smeared sideways and
// shaded down to black at the screen edge, so the scene and its backdrop seem to run on while nothing interactive ever sits in the bars.
// Two small canvases (one per bar) sit under the stage canvas; each frame (every second one) copies a 2 device pixel column of the stage into them.
// No DOM, no wide screen or app.wing under WING_MIN logical px: nothing is created or drawn. app.wing is set by app.resize in core.js.
const WING_MIN = 6;

export function installWings(app) {
  const canvas = app.canvas;
  if (typeof document === 'undefined' || !canvas || !canvas.parentNode || typeof document.createElement !== 'function') return null;
  const mk = () => { const c = document.createElement('canvas'); const s = c.style; s.position = 'absolute'; s.top = '0'; s.display = 'none'; s.pointerEvents = 'none'; s.zIndex = '0'; c.setAttribute && c.setAttribute('aria-hidden', 'true'); canvas.parentNode.insertBefore(c, canvas); return { c, g: c.getContext('2d'), w: 0, h: 0 }; };
  const L = mk(), R = mk();
  let key = '', n = 0, shown = false;
  const fit = (side, left, w, h, dpr) => {
    const s = side.c.style; s.left = left + 'px'; s.width = w + 'px'; s.height = h + 'px';
    side.c.width = Math.max(1, Math.round(w * dpr)); side.c.height = Math.max(1, Math.round(h * dpr)); side.w = side.c.width; side.h = side.c.height;
  };
  const paint = (side, right) => {
    const g = side.g, w = side.w, h = side.h; if (!g || !(w > 0)) return;
    const col = Math.max(2, Math.round(app.px)), sx = right ? canvas.width - col : 0;
    g.globalCompositeOperation = 'source-over';
    g.drawImage(canvas, sx, 0, col, canvas.height, 0, 0, w, h);
    const gr = g.createLinearGradient(right ? 0 : w, 0, right ? w : 0, 0); // from the stage edge (soft) to the screen edge (black)
    gr.addColorStop(0, 'rgba(8,6,5,.38)'); gr.addColorStop(0.55, 'rgba(8,6,5,.72)'); gr.addColorStop(1, 'rgba(8,6,5,.96)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  };
  const draw = () => {
    const iw = window.innerWidth, ih = window.innerHeight, bar = app.offX, on = bar >= WING_MIN * app.scale && !!app.px;
    if (!on) { if (shown) { L.c.style.display = R.c.style.display = 'none'; shown = false; key = ''; } return; }
    const k = [iw, ih, bar, canvas.style.width, app.dpr].join('|');
    if (k !== key) {
      key = k; const cw = parseFloat(canvas.style.width) || 0;
      fit(L, 0, bar, ih, app.dpr); fit(R, bar + cw, Math.max(1, iw - bar - cw), ih, app.dpr);
      L.c.style.display = R.c.style.display = 'block'; shown = true; n = 0;
    }
    if ((n++ & 1) === 0) { paint(L, false); paint(R, true); }
  };
  const prev = app.afterFrame;
  app.afterFrame = (a) => { if (prev) prev(a); draw(); };
  return { draw, left: L.c, right: R.c };
}

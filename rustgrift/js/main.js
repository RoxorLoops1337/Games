'use strict';
// ===================== MAIN LOOP =====================
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  G.time += dt;
  G.boil = G.settings.boil ? Math.floor(G.time * 7) % 3 : 0;
  if (G.hitstop > 0) G.hitstop = Math.max(0, G.hitstop - dt);
  const sdt = G.hitstop > 0 ? dt * 0.05 : dt;
  try {
    updateTrans(dt);
    if (G.scene && G.scene.update) G.scene.update(sdt);
    if (G.modal && G.modal.update) G.modal.update(dt);
    updateFx(sdt);
    render();
  } catch (e) {
    console.error(e);
    if (!G._err) { G._err = String(e && e.stack || e); }
  }
  In.click = null; In.wheel = 0;
  UI.endFrame();
}
function render() {
  const c = ctx;
  c.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  c.fillStyle = '#120c08'; c.fillRect(0, 0, W, H);
  G.tip = null;
  c.save();
  // camera: shake + zoom punch
  if (G.shake > 0.1) c.translate(rnd(-G.shake, G.shake), rnd(-G.shake, G.shake));
  if (G.zoomPunch > .01) { const z = 1 + G.zoomPunch * .012; c.translate(W / 2, H / 2); c.scale(z, z); c.translate(-W / 2, -H / 2); }
  UI.enabled = !G.modal && !G.trans;
  if (G.scene) G.scene.draw(c);
  if (typeof drawAmbient === 'function') drawAmbient(c);
  drawFx(c);
  c.restore();
  if (typeof postFx === 'function') postFx(c);
  if (G.flash > .02) { c.fillStyle = `rgba(255,250,220,${G.flash})`; c.fillRect(0, 0, W, H); }
  if (G.settings.bloom !== 0) bloomPass();
  drawTipLayer(c);
  if (G.modal) { UI.enabled = !G.trans; G.modal.draw(c); drawTipLayer(c); }
  drawTrans(c);
  if (G._err) { c.fillStyle = 'rgba(120,0,0,.85)'; c.fillRect(0, 0, W, 90); c.fillStyle = '#fff'; c.font = '14px monospace'; G._err.split('\n').slice(0, 4).forEach((l, i) => c.fillText(l.slice(0, 160), 10, 20 + i * 18)); }
}
function drawTipLayer(c) { drawTip(c); G.tip = null; }

// boot
SPR.init(); SPR.load();
document.fonts && document.fonts.load('800 20px "Baloo 2"');
document.fonts && document.fonts.load('20px "Permanent Marker"');
document.fonts && document.fonts.load('20px Bangers');
document.fonts && document.fonts.load('20px "Patrick Hand"');
setScene(new MenuScene());
requestAnimationFrame(frame);
// debug hooks
window.__G = G;
// debug: advance the simulation without rendering
window.stepN = (n, dt = 1 / 30, rend = false) => {
  for (let i = 0; i < n; i++) {
    G.time += dt; G.boil = G.settings.boil ? Math.floor(G.time * 7) % 3 : 0;
    if (G.hitstop > 0) G.hitstop = Math.max(0, G.hitstop - dt);
    const sdt = G.hitstop > 0 ? dt * 0.05 : dt;
    updateTrans(dt); if (G.scene && G.scene.update) G.scene.update(sdt); if (G.modal && G.modal.update) G.modal.update(dt);
    updateFx(sdt); if (rend) render(); In.click = null;
  }
};

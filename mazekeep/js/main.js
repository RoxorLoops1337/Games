// MAZEKEEP boot + game loop + canvas input. Wires the modules together:
// initialises UI, translates pointer events into tile build/select actions,
// and runs the fixed-ish timestep loop that advances the engine, redraws the
// canvas and refreshes the HUD.
(function () {
  'use strict';
  const TD = (window.TD = window.TD || {});

  let canvas, hover = null;

  function tileFromEvent(ev) {
    const G = TD.G; if (!G) return null;
    const rect = canvas.getBoundingClientRect();
    const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
    const cy = (ev.touches ? ev.touches[0].clientY : ev.clientY) - rect.top;
    const x = Math.floor((cx / rect.width) * G.cols);
    const y = Math.floor((cy / rect.height) * G.rows);
    if (x < 0 || y < 0 || x >= G.cols || y >= G.rows) return null;
    return { x, y };
  }

  function onTap(ev) {
    const G = TD.G; if (!G || G.phase === 'lost') return;
    const t = tileFromEvent(ev); if (!t) return;
    ev.preventDefault();
    const i = TD.engine.tileIndex(t.x, t.y);
    if (G.towers[i]) { // select existing tower
      G.selectedTile = { x: t.x, y: t.y };
      TD.ui.refreshInfo();
    } else { // try to build
      const spawn = G.grid.spawns.some((s) => s.x === t.x && s.y === t.y);
      const core = G.grid.cores.some((c) => c.x === t.x && c.y === t.y);
      const rock = G.grid.rock[i];
      if (spawn || core || rock) { G.selectedTile = null; TD.ui.refreshInfo(); return; }
      const ok = TD.engine.placeTower(t.x, t.y, G.selectedTower);
      if (ok) { G.selectedTile = null; TD.ui.refreshInfo(); }
      else if (TD.audio) TD.audio.play('error');
    }
  }

  function onMove(ev) {
    const t = tileFromEvent(ev);
    hover = t ? { x: t.x, y: t.y, towerId: TD.G ? TD.G.selectedTower : 'arrow' } : null;
  }
  function onLeave() { hover = null; }

  function onKey(ev) {
    const G = TD.G; if (!G || TD.ui.speed === undefined) return;
    const keys = { '1': 'arrow', '2': 'cannon', '3': 'frost', '4': 'tesla', '5': 'venom', '6': 'sniper', '7': 'flame', '8': 'pylon', '9': 'mint', '0': 'wall' };
    if (keys[ev.key]) { G.selectedTower = keys[ev.key]; G.selectedTile = null; TD.ui.rebuildSidebar(); }
    else if (ev.key === ' ' && G.phase === 'build') { ev.preventDefault(); TD.engine.startWave(); TD.ui.rebuildSidebar(); }
    else if (ev.key === 'Escape') { G.selectedTile = null; TD.ui.refreshInfo(); }
  }

  let last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    if (TD.G) {
      const steps = TD.ui.speed || 1;
      for (let s = 0; s < steps; s++) TD.engine.update(dt);
      if (hover) hover.towerId = TD.G.selectedTower;
      TD.render.draw(TD.G.phase === 'build' || TD.G.phase === 'wave' ? hover : null);
      TD.ui.tick();
    }
  }

  function boot() {
    canvas = document.getElementById('game');
    canvas.addEventListener('mousedown', onTap);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('touchstart', onTap, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', () => { if (TD.G && TD.render) TD.render.resize(); });
    // Kick the audio context alive on first interaction (autoplay policy).
    const wake = () => { if (TD.audio) TD.audio.init(); window.removeEventListener('pointerdown', wake); };
    window.addEventListener('pointerdown', wake);
    if (TD.sprites) TD.sprites.load(); // start fetching sprite art immediately
    TD.ui.init(canvas);
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

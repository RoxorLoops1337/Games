// MAZEKEEP canvas renderer. Pure drawing — reads TD.G, never mutates game state
// (except cheap cached visuals). Draws the grid/maze, a faint flow-field hint so
// players can read how their maze bends the enemy path, towers (with tier pips
// and range preview), enemies with HP/shield/status, projectiles, beams,
// particles, damage floaters and the wave banner.
(function () {
  'use strict';
  const TD = (window.TD = window.TD || {});
  let canvas, ctx, T;

  function attach(cv) { canvas = cv; ctx = cv.getContext('2d'); }

  function resize() {
    const G = TD.G; if (!G || !canvas) return;
    T = G.tile;
    canvas.width = G.cols * T;
    canvas.height = G.rows * T;
  }

  // Convert tile coords (float) → pixel center.
  const px = (x) => x * T + T / 2;

  function draw(hover) {
    const G = TD.G; if (!G || !ctx) return;
    if (canvas.width !== G.cols * T) resize();
    const th = G.theme;
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid(G, th);
    drawFlowHint(G, th);
    drawSpawnsCores(G, th);
    if (hover) drawPlacementPreview(G, hover);
    drawTowers(G);
    drawBeams(G);
    drawEnemies(G);
    drawProjectiles(G);
    drawParticles(G);
    drawFloaters(G);
    drawSelected(G);
    drawBanner(G);
  }

  function drawGrid(G, th) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = th.grid;
    for (let x = 0; x <= G.cols; x++) { ctx.beginPath(); ctx.moveTo(x * T, 0); ctx.lineTo(x * T, G.rows * T); ctx.stroke(); }
    for (let y = 0; y <= G.rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * T); ctx.lineTo(G.cols * T, y * T); ctx.stroke(); }
    // rocks
    for (let i = 0; i < G.grid.rock.length; i++) {
      if (!G.grid.rock[i]) continue;
      const x = (i % G.cols) * T, y = ((i / G.cols) | 0) * T;
      ctx.fillStyle = th.rock;
      roundRect(x + 3, y + 3, T - 6, T - 6, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      roundRect(x + 3, y + 3, T - 6, (T - 6) / 2, 6); ctx.fill();
    }
  }

  // Subtle directional arrows along the actual enemy route, so the maze you
  // build is legible at a glance.
  function drawFlowHint(G, th) {
    if (!G.field) return;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = th.accent;
    ctx.lineWidth = 2;
    for (let i = 0; i < G.field.next.length; i++) {
      const ni = G.field.next[i];
      if (ni < 0) continue;
      const x = i % G.cols, y = (i / G.cols) | 0;
      if (G.grid.blocked[i]) continue;
      const nx = ni % G.cols, ny = (ni / G.cols) | 0;
      const cx = px(x), cy = px(y), tx = px(nx), ty = px(ny);
      const mx = cx + (tx - cx) * 0.5, my = cy + (ty - cy) * 0.5;
      const a = Math.atan2(ty - cy, tx - cx);
      ctx.beginPath();
      ctx.moveTo(mx - Math.cos(a) * 5, my - Math.sin(a) * 5);
      ctx.lineTo(mx + Math.cos(a) * 5, my + Math.sin(a) * 5);
      ctx.lineTo(mx + Math.cos(a - 2.5) * 5, my + Math.sin(a - 2.5) * 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSpawnsCores(G, th) {
    const tt = (performance.now() / 1000);
    for (const s of G.grid.spawns) {
      const x = px(s.x), y = px(s.y);
      ctx.fillStyle = 'rgba(248,113,113,0.18)'; roundRect(s.x * T + 2, s.y * T + 2, T - 4, T - 4, 6); ctx.fill();
      ctx.fillStyle = '#f87171'; ctx.font = `${T * 0.5}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('☠', x, y);
    }
    for (const c of G.grid.cores) {
      const x = px(c.x), y = px(c.y);
      const pulse = 0.5 + 0.5 * Math.sin(tt * 3);
      ctx.fillStyle = 'rgba(74,222,128,0.12)'; roundRect(c.x * T + 2, c.y * T + 2, T - 4, T - 4, 6); ctx.fill();
      ctx.save();
      ctx.shadowColor = th.accent; ctx.shadowBlur = 8 + pulse * 12;
      ctx.fillStyle = th.accent; ctx.beginPath(); ctx.arc(x, y, T * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#04140c'; ctx.font = `bold ${T * 0.32}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('♥', x, y + 1);
    }
  }

  function drawPlacementPreview(G, hover) {
    const { x, y, towerId } = hover;
    if (x < 0 || y < 0 || x >= G.cols || y >= G.rows) return;
    const ok = TD.engine.canPlace(x, y, towerId);
    const def = TD.engine.towerDef(towerId);
    ctx.save();
    ctx.fillStyle = ok ? 'rgba(74,222,128,0.25)' : 'rgba(239,68,68,0.28)';
    roundRect(x * T + 2, y * T + 2, T - 4, T - 4, 6); ctx.fill();
    if (def && def.range > 0) {
      ctx.beginPath(); ctx.arc(px(x), px(y), def.range * T, 0, Math.PI * 2);
      ctx.strokeStyle = ok ? 'rgba(74,222,128,0.5)' : 'rgba(239,68,68,0.5)';
      ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = ok ? 'rgba(74,222,128,0.06)' : 'rgba(239,68,68,0.06)'; ctx.fill();
    }
    if (def) { ctx.fillStyle = ok ? '#fff' : '#fca5a5'; ctx.font = `${T * 0.5}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(def.glyph, px(x), px(y)); }
    ctx.restore();
  }

  function drawTowers(G) {
    for (const t of Object.values(G.towers)) {
      const x = px(t.x), y = px(t.y), d = t.def;
      // base
      ctx.fillStyle = shade(d.color, -0.45);
      roundRect(t.x * T + 4, t.y * T + 4, T - 8, T - 8, 7); ctx.fill();
      ctx.fillStyle = d.color;
      roundRect(t.x * T + 6, t.y * T + 6, T - 12, T - 12, 5); ctx.fill();
      if (t.buffed) { ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2; roundRect(t.x * T + 4, t.y * T + 4, T - 8, T - 8, 7); ctx.stroke(); }
      // glyph (rotate attackers toward target)
      ctx.save(); ctx.translate(x, y);
      if (d.attacks && d.projSpeed !== undefined) ctx.rotate(t.angle + Math.PI / 2);
      ctx.fillStyle = '#0a0a0a'; ctx.font = `${T * 0.46}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(d.glyph, 0, 0);
      ctx.restore();
      // tier pips
      for (let p = 0; p < t.tier; p++) { ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(t.x * T + 9 + p * 7, t.y * T + T - 7, 2.4, 0, Math.PI * 2); ctx.fill(); }
      // pylon aura
      if (d.effect === 'buff') { ctx.strokeStyle = 'rgba(253,224,71,0.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, (d.range + 0.5) * T, 0, Math.PI * 2); ctx.stroke(); }
    }
  }

  function drawSelected(G) {
    if (!G.selectedTile) return;
    const { x, y } = G.selectedTile; const i = TD.engine.tileIndex(x, y); const t = G.towers[i];
    ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2.5;
    roundRect(x * T + 3, y * T + 3, T - 6, T - 6, 7); ctx.stroke();
    if (t && t.def.range > 0) { ctx.beginPath(); ctx.arc(px(x), px(y), t.range * T, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(253,224,71,0.5)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = 'rgba(253,224,71,0.05)'; ctx.fill(); }
  }

  function drawEnemies(G) {
    const hideHp = G.waveOmens && G.waveOmens.hideHp;
    for (const e of G.enemies) {
      const x = px(e.x), y = px(e.y), r = e.size * T;
      // spawn pop-in
      const sc = e.spawnT < 0.25 ? e.spawnT / 0.25 : 1;
      const rr = r * sc;
      // body
      ctx.save();
      if (e.isBoss) { ctx.shadowColor = e.color; ctx.shadowBlur = 16; }
      ctx.fillStyle = e.hitFlash > 0 ? '#fff' : e.color;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // glyph
      ctx.fillStyle = e.flying ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.6)';
      ctx.font = `${rr * 1.3}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(e.glyph, x, y);
      // status rings
      if (e.slowT > 0) { ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, rr + 2, 0, Math.PI * 2); ctx.stroke(); }
      if (e.burn) { ctx.fillStyle = 'rgba(249,115,22,0.6)'; ctx.beginPath(); ctx.arc(x + rr * 0.6, y - rr * 0.6, 2.5, 0, Math.PI * 2); ctx.fill(); }
      if (e.poison) { ctx.fillStyle = 'rgba(134,239,172,0.7)'; ctx.beginPath(); ctx.arc(x - rr * 0.6, y - rr * 0.6, 2.5, 0, Math.PI * 2); ctx.fill(); }
      if (e.flying) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + rr + 4, rr * 0.7, rr * 0.3, 0, 0, Math.PI * 2); ctx.fill(); }
      // hp / shield bar
      if (!hideHp && (e.hp < e.maxHp || e.shield > 0 || e.isBoss)) {
        const bw = Math.max(rr * 2.2, e.isBoss ? 60 : 16), bh = e.isBoss ? 5 : 3;
        const bx = x - bw / 2, by = y - rr - (e.isBoss ? 12 : 7);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        ctx.fillStyle = e.isBoss ? '#f43f5e' : '#4ade80'; ctx.fillRect(bx, by, bw * clamp01(e.hp / e.maxHp), bh);
        if (e.maxShield > 0) { ctx.fillStyle = '#7dd3fc'; ctx.fillRect(bx, by - bh - 1, bw * clamp01(e.shield / e.maxShield), bh); }
      }
    }
  }

  function drawProjectiles(G) {
    for (const p of G.projectiles) {
      ctx.save(); ctx.translate(px(p.x), px(p.y));
      if (p.splash > 0) { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.rotate(p.angle || 0); ctx.fillStyle = p.color; ctx.fillRect(-5, -1.6, 10, 3.2); ctx.fillStyle = '#fff'; ctx.fillRect(2, -1, 4, 2); }
      ctx.restore();
    }
  }

  function drawBeams(G) {
    for (const b of G.beams) {
      const a = b.t / b.life;
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = b.color; ctx.lineWidth = 2 + a * 2; ctx.shadowColor = b.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(px(b.x1), px(b.y1)); ctx.lineTo(px(b.x2), px(b.y2)); ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles(G) {
    for (const p of G.particles) {
      const a = clamp01(p.t / p.life);
      ctx.globalAlpha = a; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(px(p.x), px(p.y), p.r * a + 0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters(G) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of G.floaters) {
      const a = clamp01(f.t / 0.8);
      ctx.globalAlpha = a;
      ctx.font = `bold ${f.big ? 16 : 12}px monospace`;
      ctx.fillStyle = '#000'; ctx.fillText(f.text, px(f.x) + 1, px(f.y) + 1);
      ctx.fillStyle = f.color; ctx.fillText(f.text, px(f.x), px(f.y));
    }
    ctx.globalAlpha = 1;
  }

  function drawBanner(G) {
    if (!G.banner) return;
    const b = G.banner; const a = clamp01(b.t / 1.6);
    ctx.save();
    ctx.globalAlpha = Math.min(1, a * 2);
    ctx.font = `bold ${Math.min(46, canvas.width * 0.07)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const y = canvas.height * 0.32;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(b.text, canvas.width / 2 + 2, y + 2);
    ctx.fillStyle = b.color; ctx.fillText(b.text, canvas.width / 2, y);
    ctx.restore();
  }

  // helpers
  function roundRect(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function shade(hex, amt) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex;
    let n = parseInt(m[1], 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = clamp01((r / 255) + amt) * 255; g = clamp01((g / 255) + amt) * 255; b = clamp01((b / 255) + amt) * 255;
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  TD.render = { attach, resize, draw };
})();

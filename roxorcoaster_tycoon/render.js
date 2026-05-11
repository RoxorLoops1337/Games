// Rendering: isometric tile + entity renderer onto a 2D canvas.
import { TILE_W, TILE_H, HEIGHT_UNIT, SURFACE_COLORS, SURFACE_DARK, tileToScreen, rot, tile, tileAvgHeight } from './world.js';
import { pathConnections } from './paths.js';

// Cached canvas reference
let canvas, ctx;

export function initRenderer(canvasEl) {
  canvas = canvasEl;
  ctx = canvasEl.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

export function resize() {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function clear() {
  ctx.fillStyle = '#1a2030';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Sky gradient
function sky() {
  const w = window.innerWidth, h = window.innerHeight;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3a5fa0');
  g.addColorStop(0.7, '#88a8d8');
  g.addColorStop(1, '#cfd8e8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// Tile rendering. Each tile renders as a polygon of 4 corners with shading by slope.
export function renderWorld(state) {
  const { terrain, cam, rides, peeps, staff, coasters, ui, time } = state;
  clear();
  sky();
  const cw = window.innerWidth, ch = window.innerHeight;

  // Build a render queue of all renderable items sorted by depth.
  // We sort by (rotated tile sum) for tiles, augmented with z/sublayer for entities.
  const queue = [];
  const size = terrain.size;

  // Determine visible tile bounds (loose) by projecting canvas corners into tile space and using bounding box.
  // For simplicity loop over all tiles when map is small.
  // We'll compute approximate viewport tile range from camera.
  // Always cull tiles whose screen rect is offscreen.

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = terrain.tiles[y * size + x];
      // depth: in rotated space, sum tx+ty for back-to-front
      const r = rot(cam.rotation, x, y, size);
      const depth = r.tx + r.ty;
      // approximate screen y for culling
      const avgH = (t.hN + t.hE + t.hS + t.hW) / 4;
      const sc = tileToScreen(x, y, avgH, cam);
      if (sc.sx < -TILE_W * cam.zoom * 2 || sc.sx > cw + TILE_W * cam.zoom * 2) continue;
      if (sc.sy < -TILE_H * cam.zoom * 2 - 200 || sc.sy > ch + TILE_H * cam.zoom * 2 + 200) continue;
      queue.push({ kind: 'tile', x, y, t, depth, subdepth: 0 });
    }
  }

  // Rides — depth based on footprint center
  for (const rd of rides) {
    if (rd.demolished) continue;
    const cx = rd.tx + (rd.w - 1) / 2;
    const cy = rd.ty + (rd.h - 1) / 2;
    const r = rot(cam.rotation, cx, cy, size);
    queue.push({ kind: 'ride', ride: rd, depth: r.tx + r.ty, subdepth: 2 });
  }

  // Coaster track pieces (each piece occupies a tile)
  for (const co of coasters) {
    if (co.demolished) continue;
    for (const p of co.pieces) {
      const r = rot(cam.rotation, p.tx, p.ty, size);
      queue.push({ kind: 'coaster-piece', coaster: co, piece: p, depth: r.tx + r.ty, subdepth: 1.5 });
    }
    for (const train of co.trains) {
      // depth based on current piece position
      const piece = co.pieces[train.pieceIdx];
      if (!piece) continue;
      const r = rot(cam.rotation, piece.tx, piece.ty, size);
      queue.push({ kind: 'coaster-train', coaster: co, train, piece, depth: r.tx + r.ty, subdepth: 2.5 });
    }
  }

  // Peeps
  for (const p of peeps) {
    if (!p.alive) continue;
    if (p.state === 'on-ride') continue; // hidden while on ride
    const tx = p.x, ty = p.y;
    const r = rot(cam.rotation, tx, ty, size);
    queue.push({ kind: 'peep', peep: p, depth: r.tx + r.ty, subdepth: 3 });
  }
  // Staff
  for (const s of staff) {
    if (!s.alive) continue;
    const tx = s.x, ty = s.y;
    const r = rot(cam.rotation, tx, ty, size);
    queue.push({ kind: 'staff', staff: s, depth: r.tx + r.ty, subdepth: 3 });
  }

  queue.sort((a, b) => (a.depth - b.depth) || (a.subdepth - b.subdepth));

  for (const item of queue) {
    if (item.kind === 'tile') drawTile(item.t, item.x, item.y, cam, state);
    else if (item.kind === 'ride') drawRide(item.ride, cam, state);
    else if (item.kind === 'coaster-piece') drawCoasterPiece(item.coaster, item.piece, cam, state);
    else if (item.kind === 'coaster-train') drawCoasterTrain(item.coaster, item.train, item.piece, cam, state);
    else if (item.kind === 'peep') drawPeep(item.peep, cam, state);
    else if (item.kind === 'staff') drawStaffMember(item.staff, cam, state);
  }

  // Overlays: tool ghost, selection highlight
  drawOverlay(state);
}

function drawTile(t, x, y, cam, state) {
  // Draw the tile as a quad over 4 corners. Each corner has a height — project each corner separately.
  // Corner pixel positions:
  const cN = tileToScreen(x, y, t.hN, cam);
  const cE = tileToScreen(x + 1, y, t.hE, cam);
  const cS = tileToScreen(x + 1, y + 1, t.hS, cam);
  const cW = tileToScreen(x, y + 1, t.hW, cam);

  // Determine surface color
  let baseColor = SURFACE_COLORS[t.surface];
  let darkColor = SURFACE_DARK[t.surface];
  if (t.water) {
    // skip surface draw — water draws instead
    drawWaterTile(t, x, y, cam);
    return;
  }
  // Shade based on slope (normal facing): tilt brightens/darkens
  // average slope direction approximated
  const slopeShade = 1 - ((t.hE - t.hW) * 0.03 + (t.hS - t.hN) * 0.02);
  ctx.fillStyle = shadeColor(baseColor, slopeShade);
  // Cliffs / edges: if a corner is much higher than the same corner of E or S neighbor, draw a wall
  drawTileTop(cN, cE, cS, cW);

  // Mowed/litter overlay
  if (t.litter > 30) {
    ctx.fillStyle = `rgba(50,30,10,${Math.min(t.litter / 400, 0.4)})`;
    drawTileTop(cN, cE, cS, cW, false);
  }

  // Draw cliff edges (south & east faces only, since they're the visible ones in iso back-to-front order)
  drawCliffSouth(t, x, y, cam, darkColor);
  drawCliffEast(t, x, y, cam, darkColor);

  // Hover highlight
  if (state.ui.hoverTile && state.ui.hoverTile.tx === x && state.ui.hoverTile.ty === y) {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cN.sx, cN.sy);
    ctx.lineTo(cE.sx, cE.sy);
    ctx.lineTo(cS.sx, cS.sy);
    ctx.lineTo(cW.sx, cW.sy);
    ctx.closePath();
    ctx.stroke();
  }

  // Ownership not owned — gray-out
  if (!t.owned) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    drawTileTop(cN, cE, cS, cW, false);
  }

  // Render path on top of tile
  if (t.path) drawPath(t, x, y, cam, state);

  // Render scenery on top
  if (t.scenery) drawScenery(t, x, y, cam, state);
}

function drawTileTop(cN, cE, cS, cW, stroke = true) {
  ctx.beginPath();
  ctx.moveTo(cN.sx, cN.sy);
  ctx.lineTo(cE.sx, cE.sy);
  ctx.lineTo(cS.sx, cS.sy);
  ctx.lineTo(cW.sx, cW.sy);
  ctx.closePath();
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
}

function drawWaterTile(t, x, y, cam) {
  const wh = t.water || 2;
  const cN = tileToScreen(x, y, wh, cam);
  const cE = tileToScreen(x + 1, y, wh, cam);
  const cS = tileToScreen(x + 1, y + 1, wh, cam);
  const cW = tileToScreen(x, y + 1, wh, cam);
  ctx.fillStyle = '#3a78c8';
  drawTileTop(cN, cE, cS, cW, false);
  // ripple highlight
  const phase = Math.sin(performance.now() * 0.002 + x * 0.5 + y * 0.7) * 0.5 + 0.5;
  ctx.fillStyle = `rgba(255,255,255,${0.04 + phase * 0.08})`;
  drawTileTop(cN, cE, cS, cW, false);
}

function drawCliffSouth(t, x, y, cam, color) {
  // South face: between this tile's S/W corners and tile below's N/E? Actually between S corner of (x,y) and S corner of (x+? ...) and N corner of (x, y+1). In our model (x,y).S == (x,y+1).N, so this is the face when the heights differ between (x,y) and (x,y+1).
  // The south face visible polygon has corners: this tile's W (at hW), this tile's S (at hS), neighbor's N corners which are this tile's S, W's S? Actually simpler: cliff exists only when this tile's S height > the south neighbor's S? Let's compute via heights directly.
  // We draw a face under the bottom-left & bottom-right edges where the tile's bottom corners are above the neighbor tile's top corners.
  // In our screen model: tile (x, y+1)'s top is its hN corner which equals this tile's hS.  No drop here.
  // Drop happens between this tile's hS (which == neighbor's hN, same height) — fine.
  // But the south-edge cliff is created by terrain step where this tile's average is higher than the south-neighbor's average. Visually, we draw the wall that fills from this tile's south edge down to the south neighbor's north edge — but they share corners, so there's actually no gap.
  // Cliffs in RCT come from corner heights differing within a tile (slope). For our needs, just draw south + east edge skirts where the tile sits "on top" of ground that's lower — using a skirt height of (avgH - 0) so we have visual contrast.
  // Simpler: draw skirts for the two visible edges using min corner heights, anchored to ground.
  const baseH = 0;
  const cS = tileToScreen(x + 1, y + 1, t.hS, cam);
  const cW = tileToScreen(x, y + 1, t.hW, cam);
  const bS = tileToScreen(x + 1, y + 1, baseH, cam);
  const bW = tileToScreen(x, y + 1, baseH, cam);
  if (t.hS <= 0 && t.hW <= 0) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cW.sx, cW.sy);
  ctx.lineTo(cS.sx, cS.sy);
  ctx.lineTo(bS.sx, bS.sy);
  ctx.lineTo(bW.sx, bW.sy);
  ctx.closePath();
  ctx.fill();
}

function drawCliffEast(t, x, y, cam, color) {
  const baseH = 0;
  const cE = tileToScreen(x + 1, y, t.hE, cam);
  const cS = tileToScreen(x + 1, y + 1, t.hS, cam);
  const bE = tileToScreen(x + 1, y, baseH, cam);
  const bS = tileToScreen(x + 1, y + 1, baseH, cam);
  if (t.hE <= 0 && t.hS <= 0) return;
  ctx.fillStyle = shadeColor(color, 0.85);
  ctx.beginPath();
  ctx.moveTo(cE.sx, cE.sy);
  ctx.lineTo(cS.sx, cS.sy);
  ctx.lineTo(bS.sx, bS.sy);
  ctx.lineTo(bE.sx, bE.sy);
  ctx.closePath();
  ctx.fill();
}

function drawPath(t, x, y, cam, state) {
  const h = t.path.height;
  const cN = tileToScreen(x, y, h, cam);
  const cE = tileToScreen(x + 1, y, h, cam);
  const cS = tileToScreen(x + 1, y + 1, h, cam);
  const cW = tileToScreen(x, y + 1, h, cam);
  ctx.fillStyle = t.path.type === 'queue' ? '#c0884a' : '#cfb990';
  ctx.beginPath();
  ctx.moveTo(cN.sx, cN.sy); ctx.lineTo(cE.sx, cE.sy);
  ctx.lineTo(cS.sx, cS.sy); ctx.lineTo(cW.sx, cW.sy);
  ctx.closePath(); ctx.fill();
  // edge stripes by connection mask
  const mask = pathConnections(state.terrain, x, y);
  ctx.strokeStyle = '#5a4322';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (!(mask & 1)) { ctx.moveTo(cN.sx, cN.sy); ctx.lineTo(cE.sx, cE.sy); }
  if (!(mask & 2)) { ctx.moveTo(cE.sx, cE.sy); ctx.lineTo(cS.sx, cS.sy); }
  if (!(mask & 4)) { ctx.moveTo(cS.sx, cS.sy); ctx.lineTo(cW.sx, cW.sy); }
  if (!(mask & 8)) { ctx.moveTo(cW.sx, cW.sy); ctx.lineTo(cN.sx, cN.sy); }
  ctx.stroke();
  // queue dashed line
  if (t.path.type === 'queue') {
    ctx.strokeStyle = '#7a4a1a';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    const cx = (cN.sx + cS.sx) / 2;
    const cy = (cN.sy + cS.sy) / 2;
    ctx.arc(cx, cy, 4 * cam.zoom, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawScenery(t, x, y, cam, state) {
  const baseH = Math.round(tileAvgHeight(t));
  const c = tileToScreen(x + 0.5, y + 0.5, baseH, cam);
  const z = cam.zoom;
  switch (t.scenery.type) {
    case 'tree': {
      // trunk
      ctx.fillStyle = '#6b4520';
      ctx.fillRect(c.sx - 2 * z, c.sy - 14 * z, 4 * z, 14 * z);
      // canopy
      ctx.fillStyle = '#2f7a36';
      ctx.beginPath();
      ctx.arc(c.sx, c.sy - 18 * z, 9 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f9046';
      ctx.beginPath();
      ctx.arc(c.sx - 3 * z, c.sy - 22 * z, 6 * z, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'bush': {
      ctx.fillStyle = '#2c6a30';
      ctx.beginPath();
      ctx.arc(c.sx, c.sy - 4 * z, 7 * z, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'bench': {
      ctx.fillStyle = '#7a5a30';
      ctx.fillRect(c.sx - 8 * z, c.sy - 6 * z, 16 * z, 3 * z);
      ctx.fillRect(c.sx - 8 * z, c.sy - 3 * z, 2 * z, 4 * z);
      ctx.fillRect(c.sx + 6 * z, c.sy - 3 * z, 2 * z, 4 * z);
      break;
    }
    case 'bin': {
      ctx.fillStyle = '#444c5e';
      ctx.fillRect(c.sx - 4 * z, c.sy - 9 * z, 8 * z, 9 * z);
      ctx.fillStyle = '#666e80';
      ctx.fillRect(c.sx - 4 * z, c.sy - 10 * z, 8 * z, 2 * z);
      break;
    }
    case 'lamp': {
      ctx.fillStyle = '#3a3a48';
      ctx.fillRect(c.sx - 1 * z, c.sy - 18 * z, 2 * z, 18 * z);
      ctx.fillStyle = '#ffd76b';
      ctx.beginPath();
      ctx.arc(c.sx, c.sy - 19 * z, 3 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,215,107,0.25)';
      ctx.beginPath();
      ctx.arc(c.sx, c.sy - 19 * z, 9 * z, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'fountain': {
      ctx.fillStyle = '#bcc4d6';
      ctx.beginPath();
      ctx.ellipse(c.sx, c.sy - 2 * z, 12 * z, 6 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5fa4dd';
      ctx.beginPath();
      ctx.ellipse(c.sx, c.sy - 3 * z, 9 * z, 4 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cfe6ff';
      ctx.beginPath();
      ctx.arc(c.sx, c.sy - 12 * z, 4 * z, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

function drawRide(rd, cam, state) {
  const z = cam.zoom;
  // Footprint center on top
  const cx = rd.tx + rd.w / 2 - 0.5;
  const cy = rd.ty + rd.h / 2 - 0.5;
  // Top corners of footprint at peak height (average of tile heights under it)
  let avgH = 0, n = 0;
  for (let yy = 0; yy < rd.h; yy++) for (let xx = 0; xx < rd.w; xx++) {
    const t = tile(state.terrain, rd.tx + xx, rd.ty + yy);
    if (t) { avgH += tileAvgHeight(t); n++; }
  }
  avgH = n ? avgH / n : 0;
  const baseH = Math.round(avgH);

  // Draw footprint base (concrete)
  const corners = [
    tileToScreen(rd.tx, rd.ty, baseH, cam),
    tileToScreen(rd.tx + rd.w, rd.ty, baseH, cam),
    tileToScreen(rd.tx + rd.w, rd.ty + rd.h, baseH, cam),
    tileToScreen(rd.tx, rd.ty + rd.h, baseH, cam),
  ];
  ctx.fillStyle = '#6a7088';
  ctx.beginPath();
  ctx.moveTo(corners[0].sx, corners[0].sy);
  for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].sx, corners[i].sy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Render ride based on kind
  const sc = tileToScreen(cx + 0.5, cy + 0.5, baseH, cam);
  const t = state.time;
  drawRideArt(rd, sc.sx, sc.sy, z, baseH, cam, t);
  // Color band per status
  if (rd.status === 'broken') {
    ctx.fillStyle = 'rgba(255,80,80,0.4)';
    ctx.fillRect(sc.sx - 12 * z, sc.sy - 36 * z, 24 * z, 4 * z);
  }
  // Entrance/exit markers — small flags
  if (rd.entranceTx != null) {
    const e = state.terrain.tiles[rd.entranceTy * state.terrain.size + rd.entranceTx];
    const sh = Math.round(tileAvgHeight(e));
    const ep = tileToScreen(rd.entranceTx + 0.5, rd.entranceTy + 0.5, sh, cam);
    ctx.fillStyle = '#3b7be0';
    ctx.fillRect(ep.sx - 1 * z, ep.sy - 14 * z, 2 * z, 14 * z);
    ctx.fillStyle = '#5a9bff';
    ctx.fillRect(ep.sx, ep.sy - 14 * z, 7 * z, 5 * z);
  }
  if (rd.exitTx != null) {
    const e = state.terrain.tiles[rd.exitTy * state.terrain.size + rd.exitTx];
    const sh = Math.round(tileAvgHeight(e));
    const ep = tileToScreen(rd.exitTx + 0.5, rd.exitTy + 0.5, sh, cam);
    ctx.fillStyle = '#a04b3a';
    ctx.fillRect(ep.sx - 1 * z, ep.sy - 14 * z, 2 * z, 14 * z);
    ctx.fillStyle = '#d96a4a';
    ctx.fillRect(ep.sx, ep.sy - 14 * z, 7 * z, 5 * z);
  }
}

function drawRideArt(rd, sx, sy, z, baseH, cam, time) {
  const ph = (time * 0.001 + rd.id * 0.7);
  switch (rd.kind) {
    case 'carousel': {
      // base
      ctx.fillStyle = '#c33a3a';
      ctx.beginPath(); ctx.ellipse(sx, sy - 4 * z, 28 * z, 14 * z, 0, 0, Math.PI * 2); ctx.fill();
      // poles
      ctx.fillStyle = '#daa520';
      for (let i = 0; i < 6; i++) {
        const a = ph + i * Math.PI / 3;
        ctx.beginPath();
        const px = sx + Math.cos(a) * 20 * z;
        const py = sy - 4 * z + Math.sin(a) * 10 * z;
        ctx.fillRect(px - 1 * z, py - 18 * z, 2 * z, 18 * z);
        ctx.fillStyle = ['#fff', '#ffeb3b', '#3a7bd0', '#e63a3a'][i % 4];
        // horse
        ctx.fillRect(px - 4 * z, py - 14 * z, 8 * z, 8 * z);
        ctx.fillStyle = '#daa520';
      }
      // roof
      ctx.fillStyle = '#3a7bd0';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 36 * z);
      ctx.lineTo(sx + 30 * z, sy - 24 * z);
      ctx.lineTo(sx, sy - 18 * z);
      ctx.lineTo(sx - 30 * z, sy - 24 * z);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd76b';
      ctx.beginPath(); ctx.arc(sx, sy - 38 * z, 3 * z, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'ferris': {
      const a = ph;
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 2 * z;
      // base supports
      ctx.beginPath(); ctx.moveTo(sx - 16 * z, sy); ctx.lineTo(sx, sy - 24 * z); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx + 16 * z, sy); ctx.lineTo(sx, sy - 24 * z); ctx.stroke();
      // wheel
      ctx.strokeStyle = '#c0c4d0';
      ctx.beginPath(); ctx.arc(sx, sy - 36 * z, 22 * z, 0, Math.PI * 2); ctx.stroke();
      // gondolas
      for (let i = 0; i < 8; i++) {
        const ang = a + i * Math.PI / 4;
        const gx = sx + Math.cos(ang) * 22 * z;
        const gy = sy - 36 * z + Math.sin(ang) * 22 * z;
        ctx.strokeStyle = '#888';
        ctx.beginPath(); ctx.moveTo(sx, sy - 36 * z); ctx.lineTo(gx, gy); ctx.stroke();
        ctx.fillStyle = ['#e63a3a', '#3a7bd0', '#ffd76b', '#2f7a36'][i % 4];
        ctx.fillRect(gx - 3 * z, gy, 6 * z, 5 * z);
      }
      break;
    }
    case 'swinger': {
      const swing = Math.sin(ph * 1.4) * 0.8;
      // mast
      ctx.fillStyle = '#888';
      ctx.fillRect(sx - 2 * z, sy - 32 * z, 4 * z, 32 * z);
      // arm
      ctx.save();
      ctx.translate(sx, sy - 28 * z);
      ctx.rotate(swing);
      ctx.fillStyle = '#c33a3a';
      ctx.fillRect(-3 * z, 0, 6 * z, 22 * z);
      // boat
      ctx.fillStyle = '#daa520';
      ctx.beginPath();
      ctx.moveTo(-12 * z, 22 * z); ctx.lineTo(12 * z, 22 * z); ctx.lineTo(8 * z, 28 * z); ctx.lineTo(-8 * z, 28 * z);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      break;
    }
    case 'twist': {
      ctx.fillStyle = '#c33a3a';
      ctx.beginPath(); ctx.ellipse(sx, sy - 4 * z, 26 * z, 13 * z, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const a = ph * 2 + i * Math.PI * 2 / 3;
        const px = sx + Math.cos(a) * 18 * z;
        const py = sy - 4 * z + Math.sin(a) * 9 * z;
        ctx.fillStyle = ['#ffeb3b', '#3a7bd0', '#fff'][i];
        ctx.beginPath(); ctx.arc(px, py - 6 * z, 7 * z, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'topspin': {
      const t = Math.sin(ph * 2);
      ctx.fillStyle = '#444';
      ctx.fillRect(sx - 16 * z, sy - 22 * z, 4 * z, 22 * z);
      ctx.fillRect(sx + 12 * z, sy - 22 * z, 4 * z, 22 * z);
      ctx.save();
      ctx.translate(sx, sy - 22 * z);
      ctx.rotate(t * 0.6);
      ctx.fillStyle = '#a02fd0';
      ctx.fillRect(-18 * z, -4 * z, 36 * z, 8 * z);
      ctx.fillStyle = '#ffd76b';
      for (let i = 0; i < 6; i++)
        ctx.fillRect(-15 * z + i * 5 * z, -3 * z, 3 * z, 6 * z);
      ctx.restore();
      break;
    }
    case 'haunted': {
      ctx.fillStyle = '#3a2a1f';
      ctx.fillRect(sx - 28 * z, sy - 32 * z, 56 * z, 32 * z);
      ctx.fillStyle = '#5a3a26';
      ctx.beginPath();
      ctx.moveTo(sx - 30 * z, sy - 32 * z);
      ctx.lineTo(sx, sy - 48 * z);
      ctx.lineTo(sx + 30 * z, sy - 32 * z);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffaa3b';
      ctx.fillRect(sx - 4 * z, sy - 18 * z, 8 * z, 16 * z);
      ctx.fillStyle = '#ffd76b';
      for (let i = 0; i < 3; i++) {
        const ex = sx - 16 * z + i * 14 * z;
        ctx.beginPath(); ctx.arc(ex, sy - 26 * z, 2 * z, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    // Shops
    case 'burger': drawShopBuilding(sx, sy, z, '#c33a3a', '#ffd76b', 'B'); break;
    case 'drink': drawShopBuilding(sx, sy, z, '#3a7bd0', '#fff', 'D'); break;
    case 'icecream': drawShopBuilding(sx, sy, z, '#e89bcd', '#fff', 'I'); break;
    case 'bathroom': drawShopBuilding(sx, sy, z, '#5a8a6a', '#fff', 'WC'); break;
    case 'info': drawShopBuilding(sx, sy, z, '#daa520', '#3a2a1f', '?'); break;
  }
}

function drawShopBuilding(sx, sy, z, body, accent, text) {
  ctx.fillStyle = body;
  ctx.fillRect(sx - 16 * z, sy - 22 * z, 32 * z, 22 * z);
  ctx.fillStyle = accent;
  ctx.fillRect(sx - 16 * z, sy - 26 * z, 32 * z, 4 * z);
  ctx.fillStyle = '#3a2a1f';
  ctx.fillRect(sx - 4 * z, sy - 14 * z, 8 * z, 14 * z);
  ctx.fillStyle = body;
  ctx.font = `bold ${10 * z}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = accent === '#fff' ? '#3a2a1f' : '#fff';
  ctx.fillText(text, sx, sy - 27 * z + 3 * z);
}

function drawCoasterPiece(co, p, cam, state) {
  const z = cam.zoom;
  const t = tile(state.terrain, p.tx, p.ty);
  if (!t) return;
  const baseH = (p.h !== undefined) ? p.h : Math.round(tileAvgHeight(t));
  // start and end points of this piece in screen space
  const start = pieceEndpoint(p, 'start', cam);
  const end = pieceEndpoint(p, 'end', cam);
  // supports (vertical column down to terrain)
  const groundStart = tileToScreen(p.tx + 0.5, p.ty + 0.5, 0, cam);
  ctx.strokeStyle = '#666c7a';
  ctx.lineWidth = 1.5 * z;
  ctx.beginPath();
  ctx.moveTo(start.sx, start.sy);
  ctx.lineTo(start.sx, groundStart.sy);
  ctx.stroke();
  // rail
  const railColor = co.type === 'wooden' ? '#8b5a2b' : '#888c9c';
  ctx.strokeStyle = railColor;
  ctx.lineWidth = 3 * z;
  ctx.beginPath();
  if (p.kind === 'station') {
    // station: wider, draw a platform
    ctx.fillStyle = '#888c9c';
    const pa = tileToScreen(p.tx, p.ty, baseH, cam);
    const pb = tileToScreen(p.tx + 1, p.ty, baseH, cam);
    const pc = tileToScreen(p.tx + 1, p.ty + 1, baseH, cam);
    const pd = tileToScreen(p.tx, p.ty + 1, baseH, cam);
    ctx.beginPath();
    ctx.moveTo(pa.sx, pa.sy); ctx.lineTo(pb.sx, pb.sy);
    ctx.lineTo(pc.sx, pc.sy); ctx.lineTo(pd.sx, pd.sy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = railColor;
    ctx.beginPath();
    ctx.moveTo(start.sx, start.sy);
    ctx.lineTo(end.sx, end.sy);
    ctx.stroke();
  } else if (p.kind === 'curve-l' || p.kind === 'curve-r') {
    // bezier through mid
    const cx = (start.sx + end.sx) / 2;
    const cy = (start.sy + end.sy) / 2;
    ctx.moveTo(start.sx, start.sy);
    ctx.quadraticCurveTo(cx, cy, end.sx, end.sy);
    ctx.stroke();
  } else {
    ctx.moveTo(start.sx, start.sy);
    ctx.lineTo(end.sx, end.sy);
    ctx.stroke();
  }
  // ties
  ctx.strokeStyle = '#3a2a1f';
  ctx.lineWidth = 1 * z;
  const segs = 4;
  for (let i = 1; i < segs; i++) {
    const tx = start.sx + (end.sx - start.sx) * i / segs;
    const ty = start.sy + (end.sy - start.sy) * i / segs;
    ctx.beginPath();
    ctx.moveTo(tx - 3 * z, ty - 1 * z); ctx.lineTo(tx + 3 * z, ty + 1 * z);
    ctx.stroke();
  }
}

function pieceEndpoint(p, which, cam) {
  // Each piece occupies one tile. Entry/exit at tile center for now.
  const tx = p.tx + 0.5;
  const ty = p.ty + 0.5;
  const h = p.h !== undefined ? p.h : 0;
  return tileToScreen(tx, ty, h, cam);
}

function drawCoasterTrain(co, train, piece, cam, state) {
  const z = cam.zoom;
  // train's pieceProgress 0–1 along piece
  const start = pieceEndpoint(piece, 'start', cam);
  const next = co.pieces[(train.pieceIdx + 1) % co.pieces.length];
  const end = next ? pieceEndpoint(next, 'start', cam) : pieceEndpoint(piece, 'end', cam);
  const t = train.pieceProgress;
  const x = start.sx + (end.sx - start.sx) * t;
  const y = start.sy + (end.sy - start.sy) * t;
  ctx.fillStyle = co.color || '#e63a3a';
  ctx.fillRect(x - 8 * z, y - 8 * z, 16 * z, 8 * z);
  ctx.fillStyle = '#3a2a1f';
  ctx.fillRect(x - 7 * z, y - 4 * z, 14 * z, 2 * z);
  // riders
  if (train.passengers && train.passengers.length) {
    ctx.fillStyle = '#ffd76b';
    for (let i = 0; i < Math.min(3, train.passengers.length); i++) {
      ctx.beginPath(); ctx.arc(x - 5 * z + i * 5 * z, y - 8 * z, 1.5 * z, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawPeep(p, cam, state) {
  const z = cam.zoom;
  const t = tile(state.terrain, Math.floor(p.x), Math.floor(p.y));
  const h = t && t.path ? t.path.height : (t ? tileAvgHeight(t) : 0);
  const sc = tileToScreen(p.x, p.y, h, cam);
  // body
  ctx.fillStyle = p.shirtColor;
  ctx.fillRect(sc.sx - 2 * z, sc.sy - 9 * z, 4 * z, 5 * z);
  // legs
  ctx.fillStyle = p.pantsColor;
  ctx.fillRect(sc.sx - 2 * z, sc.sy - 4 * z, 4 * z, 4 * z);
  // head
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath();
  ctx.arc(sc.sx, sc.sy - 11 * z, 2 * z, 0, Math.PI * 2);
  ctx.fill();
  // hat
  if (p.hat) {
    ctx.fillStyle = p.hat;
    ctx.fillRect(sc.sx - 2 * z, sc.sy - 13 * z, 4 * z, 1.5 * z);
  }
  // balloon
  if (p.balloon) {
    ctx.fillStyle = p.balloon;
    ctx.beginPath();
    ctx.arc(sc.sx + 4 * z, sc.sy - 18 * z, 3 * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(sc.sx + 4 * z, sc.sy - 15 * z); ctx.lineTo(sc.sx + 2 * z, sc.sy - 11 * z);
    ctx.stroke();
  }
  // selection ring
  if (state.ui.selectedPeepId === p.id) {
    ctx.strokeStyle = '#ffd76b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sc.sx, sc.sy - 5 * z, 8 * z, 0, Math.PI * 2);
    ctx.stroke();
  }
  // emote bubble for recent thought
  if (p.thoughtFlash > 0 && p.recentThought) {
    const tw = ctx.measureText(p.recentThought).width;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(sc.sx + 5 * z, sc.sy - 22 * z, tw + 6, 12);
    ctx.fillStyle = '#fff';
    ctx.font = '9px sans-serif';
    ctx.fillText(p.recentThought, sc.sx + 8 * z, sc.sy - 13 * z);
  }
}

function drawStaffMember(s, cam, state) {
  const z = cam.zoom;
  const t = tile(state.terrain, Math.floor(s.x), Math.floor(s.y));
  const h = t && t.path ? t.path.height : (t ? tileAvgHeight(t) : 0);
  const sc = tileToScreen(s.x, s.y, h, cam);
  const color = { handyman: '#3a8a3a', mechanic: '#3a7bd0', security: '#444c5e', entertainer: '#e63a8a' }[s.kind] || '#888';
  ctx.fillStyle = color;
  ctx.fillRect(sc.sx - 2 * z, sc.sy - 9 * z, 4 * z, 5 * z);
  ctx.fillStyle = '#3a2a1f';
  ctx.fillRect(sc.sx - 2 * z, sc.sy - 4 * z, 4 * z, 4 * z);
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath();
  ctx.arc(sc.sx, sc.sy - 11 * z, 2 * z, 0, Math.PI * 2);
  ctx.fill();
  // hat
  ctx.fillStyle = color;
  ctx.fillRect(sc.sx - 2 * z, sc.sy - 13 * z, 4 * z, 1 * z);
}

function drawOverlay(state) {
  const { ui, cam } = state;
  if (!ui.ghost) return;
  // draw a translucent preview at hover tile
  const ht = ui.hoverTile;
  if (!ht) return;
  const t = tile(state.terrain, ht.tx, ht.ty);
  if (!t) return;
  const h = Math.round(tileAvgHeight(t));
  if (ui.ghost.kind === 'ride' || ui.ghost.kind === 'shop') {
    const w = ui.ghost.w, hd = ui.ghost.h;
    const corners = [
      tileToScreen(ht.tx, ht.ty, h, cam),
      tileToScreen(ht.tx + w, ht.ty, h, cam),
      tileToScreen(ht.tx + w, ht.ty + hd, h, cam),
      tileToScreen(ht.tx, ht.ty + hd, h, cam),
    ];
    ctx.fillStyle = ui.ghost.valid ? 'rgba(100,220,120,0.35)' : 'rgba(255,100,100,0.35)';
    ctx.beginPath();
    ctx.moveTo(corners[0].sx, corners[0].sy);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].sx, corners[i].sy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (ui.ghost.kind === 'path' || ui.ghost.kind === 'queue') {
    const cN = tileToScreen(ht.tx, ht.ty, h, cam);
    const cE = tileToScreen(ht.tx + 1, ht.ty, h, cam);
    const cS = tileToScreen(ht.tx + 1, ht.ty + 1, h, cam);
    const cW = tileToScreen(ht.tx, ht.ty + 1, h, cam);
    ctx.fillStyle = ui.ghost.valid ? 'rgba(220,200,140,0.5)' : 'rgba(255,80,80,0.4)';
    ctx.beginPath();
    ctx.moveTo(cN.sx, cN.sy); ctx.lineTo(cE.sx, cE.sy);
    ctx.lineTo(cS.sx, cS.sy); ctx.lineTo(cW.sx, cW.sy);
    ctx.closePath(); ctx.fill();
  } else if (ui.ghost.kind === 'coaster') {
    // a single track piece preview at hover
    const cx = ht.tx + 0.5, cy = ht.ty + 0.5;
    const a = tileToScreen(cx - 0.4, cy, h + (ui.ghost.h ?? 0), cam);
    const b = tileToScreen(cx + 0.4, cy, h + (ui.ghost.h ?? 0), cam);
    ctx.strokeStyle = ui.ghost.valid ? '#6bd97c' : '#ff6b78';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
  } else if (ui.ghost.kind === 'scenery') {
    const c = tileToScreen(ht.tx + 0.5, ht.ty + 0.5, h, cam);
    ctx.fillStyle = ui.ghost.valid ? 'rgba(100,220,120,0.6)' : 'rgba(255,100,100,0.6)';
    ctx.beginPath();
    ctx.arc(c.sx, c.sy - 8 * cam.zoom, 6 * cam.zoom, 0, Math.PI * 2);
    ctx.fill();
  }
}

function shadeColor(hex, factor) {
  // hex #rrggbb -> shaded
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

// Convert screen pixel to a tile coord by sampling ground heights (good enough for picking).
export function pickTile(sx, sy, state) {
  const { cam, terrain } = state;
  // Iterate candidate tiles around an approximate guess; pick the one whose top quad contains the point and is highest.
  // Approximate: try z values up to 12 and find a match.
  let best = null, bestDepth = -1;
  for (let z = 0; z <= 14; z++) {
    const guess = approxTile(sx, sy, z, cam);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const tx = guess.tx + dx, ty = guess.ty + dy;
      const t = tile(terrain, tx, ty);
      if (!t) continue;
      if (pointInTileTop(sx, sy, tx, ty, t, cam)) {
        const r = rot(cam.rotation, tx, ty, terrain.size);
        const depth = r.tx + r.ty + z * 0.001;
        if (depth > bestDepth) { bestDepth = depth; best = { tx, ty, t }; }
      }
    }
  }
  return best;
}

function approxTile(sx, sy, z, cam) {
  const s = cam.zoom;
  const wx = (sx + cam.x) / ((TILE_W / 2) * s);
  const wy = (sy + cam.y + z * HEIGHT_UNIT * s) / ((TILE_H / 2) * s);
  const rtx = (wx + wy) / 2;
  const rty = (wy - wx) / 2;
  const size = cam.mapSize;
  let tx, ty;
  switch (cam.rotation & 3) {
    case 0: tx = rtx; ty = rty; break;
    case 1: tx = size - 1 - rty; ty = rtx; break;
    case 2: tx = size - 1 - rtx; ty = size - 1 - rty; break;
    case 3: tx = rty; ty = size - 1 - rtx; break;
  }
  return { tx: Math.floor(tx), ty: Math.floor(ty) };
}

function pointInTileTop(sx, sy, tx, ty, t, cam) {
  const cN = tileToScreen(tx, ty, t.hN, cam);
  const cE = tileToScreen(tx + 1, ty, t.hE, cam);
  const cS = tileToScreen(tx + 1, ty + 1, t.hS, cam);
  const cW = tileToScreen(tx, ty + 1, t.hW, cam);
  return pointInQuad(sx, sy, cN, cE, cS, cW);
}

function pointInQuad(px, py, a, b, c, d) {
  // triangle test
  return pointInTri(px, py, a, b, c) || pointInTri(px, py, a, c, d);
}
function pointInTri(px, py, a, b, c) {
  const v0x = c.sx - a.sx, v0y = c.sy - a.sy;
  const v1x = b.sx - a.sx, v1y = b.sy - a.sy;
  const v2x = px - a.sx, v2y = py - a.sy;
  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;
  const inv = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * inv;
  const v = (dot00 * dot12 - dot01 * dot02) * inv;
  return u >= 0 && v >= 0 && u + v <= 1;
}

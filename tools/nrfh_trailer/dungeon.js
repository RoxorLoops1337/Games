// No Room For Heroes trailer: the dungeon corridor, drawn with the game's own
// math (index.html drawRoomArt / drawCandles / drawTrapPart / drawGlow /
// strikeIdx / drawGaps / drawRoomBg) and rooms/layout.json, on a virtual clock.
// Units are WORLD px (FLOOR=330, a room is 200 wide); a camera maps them to
// the 1920x1080 frame.
'use strict';

const FLOOR = 330, ROOM_W = 200, ROOM_ART_DROP = 12, LIFT = 14, BOSS_ROOM_SCALE = 1.2, BOSS_H = 167;
const TRAP_RISE = 110, TRAP_FALL = 480;
const TRAP_TIMING = { maul: { rise: 55, fall: 560 }, arrow: { rise: 420, fwd: true }, frost: { rise: 200, fall: 680 },
  gallows: { rise: 90, fall: 600 }, hexward: { rise: 240, fall: 520 }, tesla: { rise: 45, fall: 240 }, spike: { rise: 70, fall: 430 } };
const TRAP_ANIM = { venom: 'loop', oil: 'loop', runestone: 'loop' };
const LIGHT_COL = { candle: '#ffb45e', heat: '#ff7a2e', vapor: '#5ae06a', frost: '#5ec8ff', tesla: '#ffe14d', hexward: '#b163ff', corrode: '#9ee84d', magebane: '#b163ff', hexbrand: '#ff5470', bombard: '#ffb050' };
const TRAP_COL = { flame: '#ff7a2e', frost: '#9adfff', tesla: '#fff34d', venom: '#7bdc6b', spike: '#9aa4b2', maul: '#9aa4b2', arrow: '#caa15e', bombard: '#e0823a', corrode: '#b6e84d', hexbrand: '#ff5470', magebane: '#b163ff', hexward: '#4dc3ff' };
const seqN = (pre, n, pad) => Array.from({ length: n }, (_, i) => 'rooms/traps/' + pre + (pad ? String(i + 1).padStart(2, '0') : (i + 1)) + '.png');
const TRAP_FR = {
  spike: seqN('spike_', 5, 1), flame: seqN('flame_', 9, 1), poison1: seqN('poison1_', 8, 1), poison2: seqN('poison2_', 5, 1),
  maul: seqN('maul_', 4), arrow: seqN('arrow_', 5), frost: seqN('frost_', 5), gallows: seqN('gallows_', 8), hexward: seqN('hexward_', 5),
  tesla: seqN('tesla_', 6), oil: seqN('oil_', 7), corrode: seqN('corrode_', 4), magebane: seqN('magebane_', 5), bombard: seqN('bombard_', 6),
  hexbrand: seqN('hexbrand_', 5), runestone: seqN('runestone_', 7),
};
const TRAP_IMG = {};
for (const k in TRAP_FR) TRAP_IMG[k] = TRAP_FR[k].map(p => img(p));
const CANDLE = [1, 2, 3, 4, 5, 6].map(i => img('rooms/fx/candle_0' + i + '.png'));
const ROOMIMG = {};
['empty', 'empty_broken', 'empty_broken2', 'gap', 'throne_red', 'throne_purple', 'throne_green', 'lair'].forEach(k => ROOMIMG[k] = img('rooms/' + k + '.png'));
const ARENA = img('arena/bg.png');

let LAYOUT = null;
_pending.push(fetch(ART + 'rooms/layout.json').then(r => r.json()).then(j => {
  LAYOUT = j; LAYOUT._lights = {};
  for (const l of j.lights) LAYOUT._lights[l.attach] = l;
}));

// smoothing only when the art is being shrunk; upscaled pixel art stays crisp
function blit(g, im, sx, sy, sw, sh, dx, dy, dw, dh) {
  if (!ok(im)) return;
  const m = g.getTransform();
  const scr = Math.hypot(m.a, m.b) * Math.abs(dw) / sw;
  const [mi, f] = mip(im, scr);
  g.imageSmoothingEnabled = scr < .98;
  g.imageSmoothingQuality = 'medium';
  g.drawImage(mi, sx / f, sy / f, sw / f, sh / f, dx, dy, dw, dh);
}
function blitAll(g, im, dx, dy, dw, dh) { if (ok(im)) blit(g, im, 0, 0, im.naturalWidth, im.naturalHeight, dx, dy, dw, dh); }

function drawGlowW(g, cx, cy, r, col, a) {
  if (!(a > 0.01) || !(r > 2)) return;
  const gr = g.createRadialGradient(cx, cy, 1, cx, cy, r);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, a); g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2); g.restore();
}
function strikeIdx(N, e, type) {
  if (e == null || e < 0) return 0;
  const t = TRAP_TIMING[type], rise = t ? t.rise : TRAP_RISE, fall = t ? t.fall : TRAP_FALL;
  if (e < rise) return clamp(Math.floor(e / rise * N), 0, N - 1);
  if (t && t.fwd) return 0;
  if (e < rise + fall) return clamp(N - 1 - Math.floor((e - rise) / fall * N), 0, N - 1);
  return 0;
}

// the trailer needs "hold at peak" too: e may be given as {hold:idx}
function drawTrapPart(g, now, x0, type, p, pi, cell, e, opt) {
  const id = p.art || type, frames = TRAP_IMG[id];
  if (!frames) return;
  const w = ROOM_W, mode = p.mode || TRAP_ANIM[type];
  const n = p.n || 1, gap = p.gap || .2, seed = cell * 3 + pi * 4 + 1, N = frames.length;
  const partAlpha = opt.alpha != null ? opt.alpha : (p.alpha != null ? p.alpha : (type === 'flame' ? .78 : 1));
  for (let c = 0; c < n; c++) {
    let idx;
    if (mode === 'loop') idx = Math.floor(now / 110 + seed + c * 3) % N;
    else if (type === 'bombard') idx = e == null || e < 0 ? 0 : clamp(Math.floor(e / 95), 0, N - 1);   // fire forward once
    else idx = strikeIdx(N, e == null ? null : e - c * 70, type);
    const im = frames[idx]; if (!ok(im)) continue;
    const inten = idx / (N - 1);
    const dh = p.h || 100, dw = dh * (im.naturalWidth / im.naturalHeight);
    const fx = (p.fx != null ? p.fx : .5) + (c - (n - 1) / 2) * gap;
    const px0 = x0 + w * fx - dw / 2, py = FLOOR - (p.fy || 0) - dh;
    g.save();
    g.globalAlpha *= partAlpha;
    if (p.flip) { g.translate(px0 + dw / 2, 0); g.scale(-1, 1); blitAll(g, im, -dw / 2, py, dw, dh); }
    else blitAll(g, im, px0, py, dw, dh);
    g.restore();
    const gm = opt.glow != null ? opt.glow : 1;
    const L = a => LAYOUT._lights[a];
    const acc = (attach, col, a) => {
      const l = L(attach);
      const cx = x0 + w * (l && l.fx != null ? l.fx : fx), cy = FLOOR - (l && l.fy != null ? l.fy : ((p.fy || 0) + (p.h || 100) * .5));
      drawGlowW(g, cx, cy, (l && l.r) ? l.r : (p.h || 100) * .55, col, a * ((l && l.a) || 1) * gm);
    };
    if (type === 'flame') { const l = L('flame'); drawGlowW(g, x0 + w * fx, FLOOR - (l.fy || 70), l.r || 56, LIGHT_COL.heat, .55 * Math.pow(inten, 1.3) * (l.a || 1) * gm); }
    else if (type === 'venom') { const l = L('venom' + pi); if (l) drawGlowW(g, x0 + w * l.fx, FLOOR - l.fy, l.r, LIGHT_COL.vapor, .32 * (l.a || 1) * (.825 + .175 * Math.sin(now / 260 + seed * 2.1)) * gm); }
    else if (type === 'frost') acc('frost', LIGHT_COL.frost, .16 + .34 * inten);
    else if (type === 'tesla') acc('tesla', LIGHT_COL.tesla, (.14 + .40 * inten) * (.62 + .38 * Math.abs(Math.sin(now / 55 + seed))));
    else if (type === 'hexward') acc('hexward', LIGHT_COL.hexward, (.16 + .30 * inten) * (.78 + .22 * Math.sin(now / 430 + seed)));
    else if (type === 'corrode') acc('corrode', LIGHT_COL.corrode, (.18 + .30 * inten) * (.85 + .15 * Math.sin(now / 180 + seed)));
    else if (type === 'magebane') acc('magebane', LIGHT_COL.magebane, (.16 + .30 * inten) * (.74 + .26 * Math.sin(now / 380 + seed)));
    else if (type === 'hexbrand') drawGlowW(g, x0 + w * fx, py + dh * .5, 70, LIGHT_COL.hexbrand, (.2 + .9 * inten) * gm);
    else if (type === 'bombard') drawGlowW(g, x0 + w * .38, FLOOR - 50, 80, LIGHT_COL.bombard, (idx === 2 ? 2.2 : idx === 3 ? 1 : idx === 1 ? .4 : 0) * gm);
  }
}

function drawCandles(g, now, x0, cell) {
  if (!LAYOUT) return;
  LAYOUT.candles.forEach((e, c) => {
    const im = CANDLE[Math.floor(now / 110 + (cell * 3 + c * 5 + 1)) % 6];
    if (!ok(im)) return;
    const dh = e.h || 26, dw = Math.max(6, dh * (im.naturalWidth / im.naturalHeight));
    blitAll(g, im, x0 + ROOM_W * e.fx - dw / 2, FLOOR - (e.fy || 118) - dh, dw, dh);
    const l = LAYOUT._lights['candle' + c];
    if (l) {
      const sd = cell * 2.7 + c * 1.3, fl = (Math.sin(now / 91 + sd) + Math.sin(now / 37 + sd * 1.7)) * .25 + .5;
      drawGlowW(g, x0 + ROOM_W * l.fx, FLOOR - l.fy, l.r || 34, LIGHT_COL.candle, (.18 + .16 * fl) * (l.a || 1));
    }
  });
}

function drawRoomArt(g, x0, im) {
  if (!ok(im)) return;
  const dh = Math.round(ROOM_W * (im.naturalHeight / im.naturalWidth));
  blitAll(g, im, x0, FLOOR + ROOM_ART_DROP - dh, ROOM_W, dh);
}

// room: {type | types:[...], e (ms since fired, or null), broken, art, glow, alpha}
// front: array; parts above heroLayer are pushed there to draw over heroes
function drawRoom(g, now, cell, room, front) {
  const x0 = cell * ROOM_W;
  const art = room.art || (room.broken ? ROOMIMG[cell % 2 ? 'empty_broken2' : 'empty_broken'] : ROOMIMG.empty);
  drawRoomArt(g, x0, art);
  if (!room.broken) drawCandles(g, now, x0, cell);
  const types = room.types || (room.type ? [room.type] : []);
  if (!types.length || !LAYOUT) return;
  const items = [];
  types.forEach(type => LAYOUT.traps[type].forEach((p, pi) => items.push({ type, p, pi, layer: p.layer != null ? p.layer : 1 })));
  items.sort((a, b) => a.layer - b.layer);
  for (const it of items) {
    const f = () => drawTrapPart(g, now, x0, it.type, it.p, it.pi, cell, room.e, room);
    if (front && it.layer > LAYOUT.heroLayer) front.push(f); else f();
  }
}

function drawGaps(g, slots) {
  const im = ROOMIMG.gap; if (!ok(im) || !ok(ROOMIMG.empty)) return;
  const gh = ROOM_W * ROOMIMG.empty.naturalHeight / ROOMIMG.empty.naturalWidth, gw = gh * im.naturalWidth / im.naturalHeight;
  for (let i = 1; i <= slots; i++) blitAll(g, im, i * ROOM_W - gw / 2, FLOOR + ROOM_ART_DROP - gh, gw, gh);
}

function drawThrone(g, cell, color) {
  const im = ROOMIMG['throne_' + color]; if (!ok(im)) return;
  const x0 = cell * ROOM_W, tw = ROOM_W * BOSS_ROOM_SCALE, th = tw * im.naturalHeight / im.naturalWidth;
  blitAll(g, im, x0 + ROOM_W * .5 - tw / 2, FLOOR + ROOM_ART_DROP - th, tw, th);
}

// arena panorama in world space; right edge pinned at worldRight
function drawArena(g, worldRight, parallax = 0, camX = 0) {
  if (!ok(ARENA)) return;
  const bgH = 420 * 1.16, bgW = bgH * ARENA.naturalWidth / ARENA.naturalHeight;
  blitAll(g, ARENA, worldRight - bgW + camX * parallax, FLOOR - .76 * bgH, bgW, bgH);
}

// jagged lightning in world space, deterministic per seed
function bolt(g, x1, y1, x2, y2, seed, col = '#fff34d', lw = 2.2, segs = 7, jit = 18) {
  const r = rng(seed);
  g.beginPath(); g.moveTo(x1, y1);
  for (let i = 1; i < segs; i++) { const t = i / segs; g.lineTo(x1 + (x2 - x1) * t + (r() - .5) * jit, y1 + (y2 - y1) * t + (r() - .5) * jit * .8); }
  g.lineTo(x2, y2);
  g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = lw * 3.4; g.globalAlpha *= .32; g.stroke();
  g.globalAlpha /= .32; g.lineWidth = lw; g.stroke();
  g.strokeStyle = '#ffffff'; g.lineWidth = lw * .45; g.stroke();
  g.restore();
}

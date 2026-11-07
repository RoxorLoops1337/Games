// GRAFTWORK Ward kit lab: a standalone isometric renderer for the MODULAR room kit (assets/ward_kit/). No build step, plain ES module.
// The game DRAWS the geometry (floor diamond with an affine mapped texture, wall slabs with a texture and a coping line, wall pieces, props)
// and uses AI art only for surfaces and objects. Projection constants are the Ward's (ui/ward_iso.js: TW 92, TH 48), copied here so this page
// has no dependency on the game bundle. A room is a 4 x 4 grid of sub-tiles (23 x 12 world px each).
//
// Draw order: rooms back to front by x + y; per room: slab, floor, walls (shared walls belong to the room in front), wall pieces, prop shadows,
// then props and actors in one pass sorted by depth (u + v of the feet), then the room's darkness overlay. Time of day is a multiply tint plus glows.
const TW = 92, TH = 48, HW = TW / 2, HH = TH / 2, SUB = 4, WALL = 46, LOW = 15, DOOR_H = 36, DOOR_S0 = 0.2, DOOR_S1 = 0.8;
const KIT = '../assets/ward_kit/', WARD = '../assets/ward/';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

// ---------------- asset loading (every failure is collected and shown, nothing throws) ----------------
const failed = new Set();
const IMGS = new Map();
function img(url) {
  let e = IMGS.get(url);
  if (!e) {
    e = { img: new Image(), ok: false, bad: false };
    e.img.onload = () => { e.ok = true; };
    e.img.onerror = () => { e.bad = true; failed.add(url); showBanner(); };
    e.img.src = url;
    IMGS.set(url, e);
  }
  return e.ok ? e.img : null;
}
const small = () => Math.min(innerWidth, innerHeight) < 520;
let KITM = null, WARDM = null;
function showBanner(extra) {
  const b = $('banner'); const msgs = [];
  if (extra) msgs.push(extra);
  if (failed.size) msgs.push(failed.size + ' image file(s) failed to load, placeholders are drawn instead: ' + [...failed].slice(0, 4).map((u) => u.split('/').slice(-2).join('/')).join(', ') + (failed.size > 4 ? ', ...' : ''));
  b.style.display = msgs.length ? 'block' : 'none'; b.textContent = msgs.join(' | ');
}
async function getJson(url) { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }
const kitImg = (kind, id) => { const d = KITM && KITM[kind] && KITM[kind][id]; return d ? img(KIT + (small() ? d.file1x : d.file2x)) : null; };

// ---------------- mip chains: textures are pre-shrunk so a pattern never aliases when the camera zooms out ----------------
const MIPS = new Map(), PATS = new Map();
function mipLevel(src, key, wantPx) {
  let ch = MIPS.get(key);
  if (!ch) {
    ch = []; let c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); ch.push(c);
    while (ch[ch.length - 1].width > 32) { const p = ch[ch.length - 1], n = document.createElement('canvas'); n.width = p.width / 2; n.height = p.height / 2; const x = n.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(p, 0, 0, n.width, n.height); ch.push(n); }
    MIPS.set(key, ch);
  }
  let pick = ch[0]; for (const c of ch) if (c.width >= wantPx) pick = c; // smallest level that is still at least the wanted size
  return pick;
}
let ZOOM = 1; const DPR = () => Math.min(2.5, devicePixelRatio || 1);
// fill the current path with texture `src` mapped by an affine transform: texture unit square -> (ox,oy) + u * ux,uy + v * vx,vy (world px)
function texFill(g, src, key, ox, oy, ux, uy, vx, vy, fallback) {
  if (!src) { g.fillStyle = fallback; g.fill(); return; }
  const want = Math.max(Math.hypot(ux, uy), Math.hypot(vx, vy)) * ZOOM * DPR();
  const lv = mipLevel(src, key, want), S = lv.width, pk = key + '|' + S;
  let pat = PATS.get(pk); if (!pat) { pat = g.createPattern(lv, 'repeat'); PATS.set(pk, pat); }
  pat.setTransform(new DOMMatrix([ux / S, uy / S, vx / S, vy / S, ox, oy]));
  g.fillStyle = pat; g.fill();
}

// ---------------- geometry ----------------
const cellTop = (x, y) => ({ x: (x - y) * HW, y: (x + y) * HH }); // top vertex of cell (x, y); cell (0,0) has its top vertex at the origin
const subPt = (gu, gv) => ({ x: (gu - gv) * HW / SUB, y: (gu + gv) * HH / SUB }); // global sub-tile coordinates -> world
const wallPt = (T, side, s) => (side === 'L' ? { x: T.x - HW + s * HW, y: T.y + HH - s * HH } : { x: T.x + s * HW, y: T.y + s * HH }); // s: 0 left to 1 right along the base
function poly(g, pts) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); }

// ---------------- room kinds (props: [id, u, v, flip]; pieces: [id, wall, s]) ----------------
const KINDS = {
  sawmill: { name: 'Sawmill', floor: 'wood', wall: 'wood', power: true,
    props: [['planks', 0, 0], ['crate', 0, 1], ['toolrack', 2, 0], ['shelf', 3, 0], ['sawbench', 1, 2], ['bed', 3, 1, 1], ['bucket', 0, 3], ['stool', 3, 3]],
    pieces: [['window', 'L', 0.5], ['sconce', 'L', 0.14], ['banner', 'R', 0.47], ['sconce', 'R', 0.84]] },
  ward: { name: 'Ward', floor: 'wood', wall: 'wood', power: true,
    props: [['bed', 0, 0], ['bed', 2, 0], ['bed', 0, 2, 1], ['stool', 1, 2], ['shelf', 3, 1], ['bucket', 3, 3]],
    pieces: [['window', 'L', 0.5], ['sconce', 'L', 0.14], ['banner', 'R', 0.5], ['sconce', 'R', 0.86]] },
  quarry: { name: 'Quarry', floor: 'stone', wall: 'stone', power: true,
    props: [['rocks', 0, 0], ['crate', 2, 0], ['bucket', 3, 0], ['rocks', 2, 2], ['bucket', 0, 3]],
    pieces: [['sconce', 'L', 0.3], ['sconce', 'R', 0.7], ['banner', 'L', 0.75]] },
  generator: { name: 'Generator', floor: 'stone', wall: 'wood', power: false,
    props: [['generator', 1, 1], ['crate', 0, 0], ['crate', 3, 0], ['bucket', 3, 3]],
    pieces: [['sconce', 'L', 0.2], ['window', 'R', 0.5], ['sconce', 'R', 0.85]] },
  store: { name: 'Store', floor: 'wood', wall: 'stone', power: true,
    props: [['shelf', 0, 0], ['shelf', 1, 0], ['shelf', 2, 0], ['crate', 3, 1], ['crate', 0, 2], ['stool', 1, 3]],
    pieces: [['sconce', 'L', 0.25], ['banner', 'R', 0.5], ['sconce', 'R', 0.85]] },
  corridor: { name: 'Corridor', floor: 'stone', wall: 'wood', power: true,
    props: [['bucket', 0, 0], ['stool', 3, 3]],
    pieces: [['sconce', 'L', 0.2], ['banner', 'R', 0.5], ['sconce', 'R', 0.82]] },
};
const HOSPITAL = [[0, 0, 'sawmill'], [1, 0, 'corridor'], [2, 0, 'quarry'], [3, 0, 'generator'], [0, 1, 'ward'], [1, 1, 'corridor'], [2, 1, 'store'], [0, 2, 'quarry'], [1, 2, 'sawmill'], [2, 2, 'ward']];
const LINKS = ['0,0-1,0', '1,0-2,0', '2,0-3,0', '0,0-0,1', '2,0-2,1', '0,1-1,1', '1,1-2,1', '1,1-1,2', '0,2-1,2', '1,2-2,2'];
const MONSTERS = { '0,0': ['gauze_mummy'], '1,0': ['stitch_rat'], '2,0': ['crutchling', 'bedpan_slime'], '3,0': ['pill_swarm'], '0,1': ['fever_moth'], '1,1': ['leech_jar'], '2,1': ['orderly'], '0,2': ['iron_lung'], '1,2': ['night_nurse', 'stitch_rat'], '2,2': ['bedpan_slime'] };

function mkRoom(x, y, kind) {
  const k = KINDS[kind];
  return { x, y, kind, name: k.name, floor: k.floor, wall: k.wall, power: k.power, props: k.props.map(([id, u, v, f]) => ({ id, u, v, flip: !!f })), pieces: k.pieces.map(([id, wall, s]) => ({ id, wall, s })), doors: { L: false, R: false } };
}
function mkScene(list, links) {
  const rooms = new Map();
  for (const [x, y, k] of list) rooms.set(x + ',' + y, mkRoom(x, y, k));
  for (const l of links || []) {
    const [a, b] = l.split('-').map((s) => s.split(',').map(Number)); const A = rooms.get(a.join(',')), B = rooms.get(b.join(','));
    if (!A || !B) continue;
    if (b[0] === a[0] + 1) B.doors.L = true; else if (b[1] === a[1] + 1) B.doors.R = true; // B is in front of A: the shared wall is B's back wall
  }
  return rooms;
}
const propDef = (id) => KITM && KITM.props[id];
const pieceDef = (id) => KITM && KITM.pieces[id];
const fpOf = (p) => { const d = propDef(p.id), f = d ? d.footprint : [1, 1]; return p.flip ? [f[1], f[0]] : [f[0], f[1]]; };
function occupied(room) {
  const o = Array.from({ length: SUB }, () => Array(SUB).fill(false));
  for (const p of room.props) { const [c, r] = fpOf(p); for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) if (o[p.u + i] && o[p.u + i][p.v + j] !== undefined) o[p.u + i][p.v + j] = true; }
  return o;
}

// ---------------- scene state ----------------
const S = {
  scene: 'compare', rooms: new Map(), actors: [], wallMode: 'full', time: 1, auto: false, power: true, debug: false, t: 0,
  cam: { x: 0, y: 0, z: 1 }, camAuto: true, wallH: new Map(), build: { tool: 'prop', sel: 'sawbench', flip: false, hover: null, sub: 'sawmill' },
};
const LIGHT = [ // morning, midday, evening, night: multiply tint, lamp glow, how blue the shadows are
  { r: 206, g: 224, b: 242, a: 0.5, glow: 0.2 }, { r: 255, g: 250, b: 236, a: 0.0, glow: 0.0 },
  { r: 240, g: 158, b: 82, a: 0.74, glow: 0.62 }, { r: 60, g: 84, b: 160, a: 0.72, glow: 1.0 }];
const PHASES = ['Morning', 'Midday', 'Evening', 'Night'];
function lightAt(t) { const i = Math.floor(t) % 4, f = t - Math.floor(t), k = f * f * (3 - 2 * f), A = LIGHT[i], B = LIGHT[(i + 1) % 4], o = {}; for (const key of ['r', 'g', 'b', 'a', 'glow']) o[key] = lerp(A[key], B[key], k); return o; }

// ---------------- actors (existing art: assets/ward/actors, walk frames, feet anchor) ----------------
function mkActor(id, key, kind, gu, gv, o = {}) {
  return { id, kind, home: key, gu, gv, path: [], wait: Math.random() * 2, face: 1, speed: o.speed === undefined ? (kind === 'hero' ? 1.7 : 0.7) : o.speed, h: kind === 'hero' ? 44 : 31, ph: Math.random() * 6, walk: 0, still: !!o.still };
}
const roomAt = (gu, gv) => S.rooms.get(Math.floor(gu / SUB) + ',' + Math.floor(gv / SUB));
function blocked(gu, gv) {
  const r = roomAt(gu, gv); if (!r) return true;
  const u = gu - r.x * SUB, v = gv - r.y * SUB; return occupied(r)[u][v];
}
function canStep(a, b) { // a -> b, 4-neighbour sub-tiles; between rooms only through a door (rows or columns 1 and 2 of the shared wall)
  const ra = roomAt(a[0], a[1]), rb = roomAt(b[0], b[1]); if (!ra || !rb) return false;
  if (ra === rb) return true;
  if (b[0] !== a[0]) { const F = b[0] > a[0] ? rb : ra, row = a[1] - F.y * SUB; return F.doors.L && row >= 1 && row <= 2; }
  const F = b[1] > a[1] ? rb : ra, col = a[0] - F.x * SUB; return F.doors.R && col >= 1 && col <= 2;
}
function bfs(from, homeKey, goalFn) {
  const seen = new Map([[from.join(','), null]]), q = [from], out = [];
  while (q.length) {
    const c = q.shift(); out.push(c);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = [c[0] + dx, c[1] + dy], k = n.join(',');
      if (seen.has(k) || blocked(n[0], n[1]) || !canStep(c, n)) continue;
      if (homeKey && (Math.floor(n[0] / SUB) + ',' + Math.floor(n[1] / SUB)) !== homeKey) continue;
      seen.set(k, c); q.push(n);
    }
  }
  return { seen, reach: out };
}
function pathTo(seen, goal) { const p = []; let c = goal; while (c) { p.push(c); c = seen.get(c.join(',')); } p.pop(); return p.reverse(); }
function stepActor(a, dt) {
  if (a.still) return;
  const cell = [Math.floor(a.gu), Math.floor(a.gv)];
  if (blocked(cell[0], cell[1])) { // a prop was built on top of it: stand it on the nearest free sub-tile of its room
    const r = S.rooms.get(a.home) || roomAt(a.gu, a.gv); if (!r) return;
    const occ = occupied(r); for (let u = 0; u < SUB; u++) for (let v = 0; v < SUB; v++) if (!occ[u][v]) { a.gu = r.x * SUB + u + 0.5; a.gv = r.y * SUB + v + 0.5; a.path = []; return; }
    return;
  }
  if (a.path.length) {
    const t = a.path[0], tx = t[0] + 0.5, ty = t[1] + 0.5, dx = tx - a.gu, dy = ty - a.gv, d = Math.hypot(dx, dy), st = a.speed * dt;
    if (d <= st) { a.gu = tx; a.gv = ty; a.path.shift(); if (!a.path.length) a.wait = 1 + Math.random() * 3; } else { a.gu += dx / d * st; a.gv += dy / d * st; }
    if (Math.abs(dx - dy) > 0.01) a.face = dx - dy >= 0 ? 1 : -1;
    a.walk += dt; return;
  }
  a.wait -= dt; if (a.wait > 0) return;
  const home = a.kind === 'hero' ? null : a.home, { seen, reach } = bfs(cell, home);
  if (reach.length > 1) { const goal = reach[1 + Math.floor(Math.random() * (reach.length - 1))]; a.path = pathTo(seen, goal); } else a.wait = 2;
}
function drawActor(g, a) {
  const man = WARDM && WARDM.actors[a.id]; if (!man) return;
  const alt = a.path.length && Math.floor(a.walk * 7) % 2 === 1;
  const f1 = alt ? (man.walk1x || man.file1x) : man.file1x, f2 = alt ? (man.walk2x || man.file2x) : man.file2x;
  const im = img(WARD + (small() ? f1 : f2)); const p = subPt(a.gu, a.gv);
  const sz = a.h * (man.scale || 1), s = sz / man.h, moving = a.path.length;
  const bob = moving ? Math.abs(Math.sin(a.walk * 7 + a.ph)) * 2.2 : Math.abs(Math.sin(S.t * 1.8 + a.ph)) * 0.7;
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(p.x, p.y + 1, sz * 0.3, sz * 0.11, 0, 0, 6.2832); g.fill();
  if (!im) { g.fillStyle = '#c9a227'; g.fillRect(p.x - 4, p.y - 18, 8, 18); return; }
  g.save(); g.translate(p.x, p.y - bob); g.scale(a.face, 1);
  g.drawImage(im, -man.anchorX * s, -man.anchorY * s, man.w * s, man.h * s); g.restore();
}

// ---------------- drawing a room ----------------
const WOODC = { wood: '#7a5a3c', stone: '#9b968c' };
function wallHeight(room, side) {
  const shared = side === 'L' ? S.rooms.has((room.x - 1) + ',' + room.y) : S.rooms.has(room.x + ',' + (room.y - 1));
  const want = S.wallMode === 'full' ? WALL : S.wallMode === 'low' ? LOW : shared ? LOW : WALL;
  const k = room.x + ',' + room.y + side; let h = S.wallH.get(k); if (h === undefined) h = want;
  h += (want - h) * Math.min(1, S.dt * 9); if (Math.abs(want - h) < 0.1) h = want; S.wallH.set(k, h); return h;
}
function drawSlab(g, room, T) { // the floor's thickness on the open front edges: a wooden plinth with a lit top rim
  const L = { x: T.x - HW, y: T.y + HH }, B = { x: T.x, y: T.y + TH }, R = { x: T.x + HW, y: T.y + HH }, th = 6;
  const side = (p, q, c0, c1) => {
    poly(g, [[p.x, p.y], [q.x, q.y], [q.x, q.y + th], [p.x, p.y + th]]); const gr = g.createLinearGradient(0, p.y, 0, p.y + th + HH); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fill();
    g.strokeStyle = '#0d0907'; g.lineWidth = 1; g.stroke(); g.strokeStyle = 'rgba(255,214,150,.28)'; g.beginPath(); g.moveTo(p.x, p.y + 0.6); g.lineTo(q.x, q.y + 0.6); g.stroke();
  };
  if (!S.rooms.has(room.x + ',' + (room.y + 1))) side(L, B, '#6a4a30', '#3a2616');
  if (!S.rooms.has((room.x + 1) + ',' + room.y)) side(B, R, '#4e3522', '#2a190e');
}
function drawFloor(g, room, T) {
  const tex = kitImg('floors', room.floor);
  g.beginPath(); g.moveTo(T.x, T.y - 0.3); g.lineTo(T.x + HW + 0.3, T.y + HH); g.lineTo(T.x, T.y + TH + 0.3); g.lineTo(T.x - HW - 0.3, T.y + HH); g.closePath();
  // one texture tile = the whole room: texture x runs along u (down-right), texture y along v (down-left)
  texFill(g, tex, 'f:' + room.floor + (small() ? 's' : 'l'), T.x, T.y, HW, HH, -HW, HH, room.floor === 'wood' ? '#5a3a22' : '#6b665e');
  g.strokeStyle = 'rgba(10,6,3,.55)'; g.lineWidth = 0.8; g.stroke();
}
function wallSolid(g, room, T, side, s0, s1, hb, H) {
  if (H <= hb + 0.2) return;
  const a = wallPt(T, side, s0), b = wallPt(T, side, s1);
  const pts = [[a.x, a.y - hb], [b.x, b.y - hb], [b.x, b.y - H], [a.x, a.y - H]];
  poly(g, pts);
  const o = wallPt(T, side, 0), tex = kitImg('walls', room.wall);
  if (side === 'L') texFill(g, tex, 'w:' + room.wall + (small() ? 's' : 'l'), o.x, o.y - WALL, HW, -HH, 0, WALL, '#4a3424');
  else texFill(g, tex, 'w:' + room.wall + (small() ? 's' : 'l'), o.x, o.y - WALL, HW, HH, 0, WALL, '#4a3424');
  // light from the upper left: the left wall is a little brighter, the right one darker; both darken toward the floor
  const gr = g.createLinearGradient(0, a.y - H, 0, a.y); gr.addColorStop(0, side === 'L' ? 'rgba(255,214,150,.07)' : 'rgba(0,0,0,.12)'); gr.addColorStop(1, side === 'L' ? 'rgba(0,0,0,.34)' : 'rgba(0,0,0,.46)');
  poly(g, pts); g.fillStyle = gr; g.fill();
  // coping: a lighter capping strip on the top edge
  const cp = 3.6; poly(g, [[a.x, a.y - H], [b.x, b.y - H], [b.x, b.y - H - cp], [a.x, a.y - H - cp]]); g.fillStyle = WOODC[room.wall]; g.fill();
  g.strokeStyle = 'rgba(255,225,170,.35)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(a.x, a.y - H - cp + 0.4); g.lineTo(b.x, b.y - H - cp + 0.4); g.stroke();
  g.strokeStyle = '#0d0907'; g.lineWidth = 1; g.beginPath(); g.moveTo(a.x, a.y - H - cp); g.lineTo(b.x, b.y - H - cp); g.moveTo(a.x, a.y - H); g.lineTo(b.x, b.y - H); g.stroke();
  g.beginPath(); g.moveTo(a.x, a.y - hb); g.lineTo(a.x, a.y - H - cp); g.moveTo(b.x, b.y - hb); g.lineTo(b.x, b.y - H - cp); g.stroke();
}
function drawWall(g, room, T, side) {
  const H = wallHeight(room, side), door = room.doors[side];
  if (!door) wallSolid(g, room, T, side, 0, 1, 0, H);
  else { wallSolid(g, room, T, side, 0, DOOR_S0, 0, H); wallSolid(g, room, T, side, DOOR_S1, 1, 0, H); wallSolid(g, room, T, side, DOOR_S0, DOOR_S1, DOOR_H, H); }
  return H;
}
function post(g, x, y, H, wood) { g.fillStyle = wood === 'stone' ? '#6f6a61' : '#4a3322'; g.fillRect(x - 1.8, y - H - 4, 3.6, H + 4); g.strokeStyle = '#0d0907'; g.lineWidth = 1; g.strokeRect(x - 1.8, y - H - 4, 3.6, H + 4); g.fillStyle = 'rgba(255,225,170,.25)'; g.fillRect(x - 1.8, y - H - 4, 1.2, H + 4); }
// a flat sprite on a wall: sheared so its horizontal edges follow the wall direction
function wallSprite(g, def, im, T, side, s, H, alpha) {
  const base = wallPt(T, side, s), sc = 1 / (def.pxu || 10); // sprite px -> world units
  const up = def.wallSlot === 'floor' ? 0 : WALL * 0.55;
  const top = up + (def.h - def.anchorY) * sc; // highest point above the base line
  const vis = clamp((H - top + 8) / 8, 0, 1) * alpha; if (vis <= 0.01) return null;
  g.save(); g.globalAlpha *= vis; g.transform(1, side === 'L' ? -HH / HW : HH / HW, 0, 1, base.x, base.y - up);
  if (im) g.drawImage(im, -def.anchorX * sc, -def.anchorY * sc, def.w * sc, def.h * sc); else { g.fillStyle = '#c9a22788'; g.fillRect(-6, -8, 12, 16); }
  g.restore();
  return { x: base.x, y: base.y - up, top };
}
function drawPieces(g, room, T, Hs, lights, dark, alpha = 1) {
  const L = lightAt(S.time);
  for (const side of ['L', 'R']) {
    const H = Hs[side];
    if (room.doors[side]) { const d = pieceDef('door'); if (d) wallSprite(g, { ...d, pxu: 10 }, kitImg('pieces', 'door'), T, side, 0.5, H, clamp((H - 30) / 8, 0, 1)); }
    for (const p of room.pieces) {
      if (p.wall !== side) continue; if (room.doors[side] && Math.abs(p.s - 0.5) < 0.3) continue;
      const d = pieceDef(p.id); if (!d) continue;
      const r = wallSprite(g, { ...d, pxu: 10 }, kitImg('pieces', p.id), T, side, p.s, H, alpha);
      if (r && !dark && (p.id === 'sconce' || p.id === 'window') && L.glow > 0.02) lights.push([r.x, r.y, p.id === 'sconce' ? 20 : 30, p.id === 'sconce' ? L.glow * 0.7 : L.glow * 0.45]);
    }
  }
}
function propPos(p, T) { const [c, r] = fpOf(p), cu = p.u + c / 2, cv = p.v + r / 2, q = subPt(cu, cv); return { x: T.x + q.x, y: T.y + q.y, key: cu + cv }; }
function drawProp(g, p, T, alpha = 1, tintBad = false) {
  const d = propDef(p.id); if (!d) return;
  const im = kitImg('props', p.id), P = propPos(p, T), k = d.sw / d.w;
  g.save(); g.globalAlpha *= alpha; g.translate(P.x, P.y);
  if (p.flip) g.scale(-1, 1);
  if (im) g.drawImage(im, -d.anchorX * k, -d.anchorY * k, d.w * k, d.h * k); else { g.fillStyle = '#c9a22788'; g.fillRect(-8, -14, 16, 14); }
  if (tintBad) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(220,40,40,.5)'; g.fillRect(-d.anchorX * k, -d.anchorY * k, d.w * k, d.h * k); }
  g.restore();
}
function propShadow(g, p, T) {
  const [c, r] = fpOf(p), P = propPos(p, T), w = (c + r) * HW / SUB * 0.36 + 1.5;
  g.save(); g.beginPath(); g.moveTo(T.x, T.y); g.lineTo(T.x + HW, T.y + HH); g.lineTo(T.x, T.y + TH); g.lineTo(T.x - HW, T.y + HH); g.closePath(); g.clip(); // never spill past the floor
  g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(48,28,16,.5)'; g.beginPath(); g.ellipse(P.x + 1.5, P.y + 1, w, w * 0.46, 0, 0, 6.2832); g.fill(); g.restore();
}
function drawRoom(g, room, lights, byRoom, ghost) {
  const T = cellTop(room.x, room.y), key = room.x + ',' + room.y, L = lightAt(S.time);
  const dark = room.power && !S.power;
  drawSlab(g, room, T); drawFloor(g, room, T);
  const Hs = { L: drawWall(g, room, T, 'L'), R: drawWall(g, room, T, 'R') };
  post(g, T.x, T.y, Math.max(Hs.L, Hs.R), room.wall); post(g, T.x - HW, T.y + HH, Hs.L, room.wall); post(g, T.x + HW, T.y + HH, Hs.R, room.wall);
  drawPieces(g, room, T, Hs, lights, dark);
  if (ghost && ghost.piece) { const d = pieceDef(ghost.piece.id); if (d) wallSprite(g, { ...d, pxu: 10 }, kitImg('pieces', ghost.piece.id), T, ghost.piece.wall, ghost.piece.s, Hs[ghost.piece.wall], 0.6); }
  for (const p of room.props) propShadow(g, p, T);
  const items = room.props.map((p) => ({ k: propPos(p, T).key, f: () => drawProp(g, p, T) }));
  for (const a of byRoom.get(key) || []) items.push({ k: a.gu + a.gv, f: () => drawActor(g, a) });
  if (ghost && ghost.prop) { const [c, r] = fpOf(ghost.prop); items.push({ k: ghost.prop.u + ghost.prop.v + (c + r) / 2 + 0.01, f: () => drawProp(g, ghost.prop, T, 0.62, !ghost.ok) }); }
  items.sort((a, b) => a.k - b.k); for (const it of items) it.f();
  if (!dark && L.glow > 0.02) lights.push([T.x, T.y + HH - 14, 40, L.glow * 0.2]);
  if (dark) { // unpowered: a cold, dark multiply over the room's own floor and walls, no lamp glow
    g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#39416a';
    for (const pts of [[[T.x, T.y], [T.x + HW, T.y + HH], [T.x, T.y + TH], [T.x - HW, T.y + HH]], [[T.x - HW, T.y + HH], [T.x, T.y], [T.x, T.y - Hs.L - 4], [T.x - HW, T.y + HH - Hs.L - 4]], [[T.x, T.y], [T.x + HW, T.y + HH], [T.x + HW, T.y + HH - Hs.R - 4], [T.x, T.y - Hs.R - 4]]]) { poly(g, pts); g.fill(); }
    g.restore();
  }
  if (S.debug) debugRoom(g, room, T, Hs);
}
function debugRoom(g, room, T, Hs) {
  g.save(); g.lineWidth = 0.8;
  g.strokeStyle = 'rgba(255,255,255,.5)'; poly(g, [[T.x, T.y], [T.x + HW, T.y + HH], [T.x, T.y + TH], [T.x - HW, T.y + HH]]); g.stroke();
  const occ = occupied(room);
  for (let u = 0; u < SUB; u++) for (let v = 0; v < SUB; v++) {
    const a = subPt(room.x * SUB + u, room.y * SUB + v), b = subPt(room.x * SUB + u + 1, room.y * SUB + v), c = subPt(room.x * SUB + u + 1, room.y * SUB + v + 1), d = subPt(room.x * SUB + u, room.y * SUB + v + 1);
    poly(g, [[a.x, a.y], [b.x, b.y], [c.x, c.y], [d.x, d.y]]); g.strokeStyle = occ[u][v] ? 'rgba(255,90,80,.9)' : 'rgba(80,200,255,.28)'; if (occ[u][v]) { g.fillStyle = 'rgba(255,60,50,.22)'; g.fill(); } g.stroke();
  }
  for (const side of ['L', 'R']) {
    const a = wallPt(T, side, 0), b = wallPt(T, side, 1); g.strokeStyle = '#6fe36f'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    if (room.doors[side]) { const d0 = wallPt(T, side, DOOR_S0), d1 = wallPt(T, side, DOOR_S1); g.strokeStyle = '#ffd34a'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(d0.x, d0.y); g.lineTo(d1.x, d1.y); g.stroke(); }
  }
  g.restore();
}

// ---------------- scenes ----------------
function paintedRoom(g, cx, cy, kind) { // the shipped painted diorama, placed exactly like ui/ward_iso.js drawSprite
  const d = WARDM && WARDM.rooms['rm_' + kind]; if (!d) return false;
  const im = img(WARD + (small() ? d.file1x : d.file2x)); if (!im) return true;
  const s = TW / d.floorW; g.drawImage(im, cx - d.floorCx * s, cy - d.floorCy * s, d.w * s, d.h * s); return true;
}
const SCENES = {
  compare: { name: 'Painted vs Modular',
    note: 'Left: the shipped painted Sawmill (one baked picture, the walls are part of the image). Right: the same room composed from kit pieces: a texture-filled floor, two wall slabs, a window, a banner, sconces and ten separate props. The painted picture already has its figures baked in; in the modular room the two figures are live sprites, so you can see them step behind the bench.',
    judge: ['Does the modular room feel like the same family as the painting?', 'Props are separate, so the nurse and the mummy can pass behind and in front of the bench.', 'Toggle wall height: the painted room cannot do this.'] },
  build: { name: 'Build a room',
    note: 'A design toy. Pick a prop or a wall piece in the palette, then click the floor (props snap to the 4 x 4 sub-tile grid) or the wall (pieces snap along it). Tool Erase removes the item you click. Marrow wanders around what you build.',
    judge: ['Does the palette let you dress a believable room in under a minute?', 'Do props of different sizes sit at one scale?', 'Does Marrow walk behind and in front of the furniture?'] },
  hospital: { name: 'Hospital',
    note: 'Ten modular rooms on the grid. Walls are shared between neighbours, doors only where rooms connect. Monsters stay in their rooms, Marrow and a nurse walk through the doors. Switch the wall mode to see the difference.',
    judge: ['Full: shared walls hide the back rooms, like Theme Hospital.', 'Low: everything is visible, rooms read as one floor plan.', 'Cutaway: only outer walls stay tall.'] },
  day: { name: 'Day cycle',
    note: 'Six rooms with the time of day: a multiply tint, warm lamp pools and window glow from the sconces and windows. Cut the Generator and the powered rooms go cold and dark, only the generator room keeps its light.',
    judge: ['Do evening and night look warm and readable?', 'Does a dark room still show its furniture?', 'Does the tint fit the painted Ward lighting?'] },
};
function setupScene(id) {
  S.scene = id; S.actors = []; S.wallH.clear(); S.camAuto = true; S.build.hover = null;
  if (id === 'compare') {
    S.rooms = mkScene([[0, 0, 'sawmill']]); S.rooms.get('0,0').doors = { L: false, R: false };
    S.cmp = { dx: 112 };
    S.actors = [mkActor('gauze_mummy', '0,0', 'monster', 2.5, 1.5, { still: true }), mkActor('marrow', '0,0', 'hero', 0.5, 2.5, { still: true })];
    S.time = 1; S.auto = false;
  } else if (id === 'build') {
    S.rooms = mkScene([[0, 0, 'sawmill']]); const r = S.rooms.get('0,0'); r.props = r.props.filter((p) => ['sawbench', 'bucket'].includes(p.id)); r.pieces = r.pieces.filter((p) => p.id === 'window');
    S.actors = [mkActor('marrow', '0,0', 'hero', 0.5, 0.5, { speed: 1.4 })]; S.time = 1; S.auto = false;
  } else if (id === 'hospital') {
    S.rooms = mkScene(HOSPITAL, LINKS); S.time = 1; S.auto = false; S.power = true; populate();
  } else {
    S.rooms = mkScene(HOSPITAL.filter(([x, y]) => (y === 0) || (y === 1 && x < 2)), LINKS); S.time = 2.15; S.auto = true; S.power = true; populate(true);
  }
  S.dt = 0.016; renderScenes(); renderBar(); renderNote(); fitCam(true);
}
function populate(few) {
  for (const [key, room] of S.rooms) {
    const ids = MONSTERS[key] || []; const occ = occupied(room);
    ids.forEach((id, i) => { let u, v, n = 0; do { u = Math.floor(hash(key + id + n) * SUB); v = Math.floor(hash(key + id + 'v' + n) * SUB); n++; } while (occ[u][v] && n < 30); S.actors.push(mkActor(id, key, 'monster', room.x * SUB + u + 0.5, room.y * SUB + v + 0.5)); });
  }
  const first = [...S.rooms.values()][0], hero = (r, id, u, v) => S.actors.push(mkActor(id, null, 'hero', r.x * SUB + u + 0.5, r.y * SUB + v + 0.5, id === 'marrow' ? {} : { speed: 1.2 }));
  const c = S.rooms.get('1,0') || first; hero(c, 'marrow', 1, 1); hero(c, 'npc_nurse', 2, 2);
  for (const a of S.actors) if (a.kind === 'hero') a.h = a.id === 'marrow' ? 44 : 38;
}

// ---------------- camera ----------------
const cv = $('cv'), g = cv.getContext('2d');
let W = 0, H = 0;
function resize() { const r = cv.getBoundingClientRect(), d = DPR(); W = r.width; H = r.height; cv.width = Math.max(1, Math.round(W * d)); cv.height = Math.max(1, Math.round(H * d)); }
function sceneBounds() {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const add = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const r of S.rooms.values()) { const T = cellTop(r.x, r.y); add(T.x - HW, T.y + TH + 10); add(T.x + HW, T.y + TH + 10); add(T.x, T.y - WALL - 12); add(T.x - HW, T.y - WALL + HH); }
  if (S.scene === 'compare') { add(-HW - S.cmp.dx, -WALL - 12); add(HW - S.cmp.dx, TH + 10); add(-S.cmp.dx, -WALL - 40); }
  return { x0, y0, x1, y1 };
}
function fitCam(snap) {
  const note = $('note'), padR = note.classList.contains('hidden') ? 0 : Math.min(330, W * 0.44) + 16, aw = Math.max(200, W - padR), pad = 0.92;
  const b = sceneBounds(), z = clamp(Math.min(aw * pad / (b.x1 - b.x0), H * pad / (b.y1 - b.y0)), 0.5, 6);
  const tx = (b.x0 + b.x1) / 2 + padR / 2 / z, ty = (b.y0 + b.y1) / 2; S.camTarget = { x: tx, y: ty, z };
  if (snap) { S.cam.x = tx; S.cam.y = ty; S.cam.z = z; }
}
const toWorld = (sx, sy) => ({ x: (sx - W / 2) / S.cam.z + S.cam.x, y: (sy - H / 2) / S.cam.z + S.cam.y });
function zoomAt(f, sx, sy) { const w0 = toWorld(sx, sy), z = clamp(S.cam.z * f, 0.4, 8); S.cam.z = z; S.cam.x = w0.x - (sx - W / 2) / z; S.cam.y = w0.y - (sy - H / 2) / z; S.camAuto = false; }

// ---------------- frame ----------------
function frame(now) {
  const dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now; S.dt = dt; S.t += dt;
  if (S.auto) { S.time = (S.time + dt * 0.12) % 4; const sl = $('timeSl'); if (sl) sl.value = S.time; syncPhase(); }
  for (const a of S.actors) stepActor(a, dt);
  if (S.camAuto && S.camTarget) { const k = Math.min(1, dt * 6); S.cam.x += (S.camTarget.x - S.cam.x) * k; S.cam.y += (S.camTarget.y - S.cam.y) * k; S.cam.z += (S.camTarget.z - S.cam.z) * k; }
  ZOOM = S.cam.z;
  const d = DPR(); g.setTransform(d, 0, 0, d, 0, 0);
  const bg = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, Math.max(W, H) * 0.7); bg.addColorStop(0, '#2a1d14'); bg.addColorStop(1, '#0c0807'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.save(); g.translate(W / 2, H / 2); g.scale(S.cam.z, S.cam.z); g.translate(-S.cam.x, -S.cam.y);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const lights = [], byRoom = new Map();
  for (const a of S.actors) { const k = Math.floor(a.gu / SUB) + ',' + Math.floor(a.gv / SUB); if (!byRoom.has(k)) byRoom.set(k, []); byRoom.get(k).push(a); }
  const rooms = [...S.rooms.values()].sort((a, b) => (a.x + a.y) - (b.x + b.y) || a.x - b.x);
  let labels = [];
  if (S.scene === 'compare') {
    const cx = -S.cmp.dx, cy = HH; // painted cell centre
    g.save(); g.translate(0, 0);
    paintedRoomDraw(g, cx, cy); g.restore(); labels = [['Painted', cx, -WALL - 34], ['Modular', 0, -WALL - 34]];
  }
  for (const r of rooms) { const ghost = S.scene === 'build' ? buildGhost(r) : null; drawRoom(g, r, lights, byRoom, ghost); }
  g.restore();
  // time of day: multiply tint over everything, then additive lamp light on top
  const L = lightAt(S.time);
  if (L.a > 0.01) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(${L.r | 0},${L.g | 0},${L.b | 0},${L.a})`; g.fillRect(0, 0, W, H); g.restore(); }
  if (lights.length) {
    g.save(); g.translate(W / 2, H / 2); g.scale(S.cam.z, S.cam.z); g.translate(-S.cam.x, -S.cam.y); g.globalCompositeOperation = 'lighter';
    const spr = glowSprite();
    for (const [x, y, r, a] of lights) { const fl = 0.9 + 0.1 * Math.sin(S.t * 6 + x * 0.7); g.globalAlpha = clamp(a * fl, 0, 1); g.drawImage(spr, x - r, y - r, r * 2, r * 2); }
    g.restore();
  }
  g.font = 'bold 13px Georgia, serif'; g.textAlign = 'center'; g.fillStyle = '#e9d6a0'; g.strokeStyle = 'rgba(10,6,3,.85)'; g.lineWidth = 3;
  for (const [t, x, y] of labels) { const sx = (x - S.cam.x) * S.cam.z + W / 2, sy = (y - S.cam.y) * S.cam.z + H / 2; g.strokeText(t, sx, sy); g.fillText(t, sx, sy); }
  requestAnimationFrame(frame);
}
function paintedRoomDraw(g, cx, cy) {
  const ok = paintedRoom(g, cx, cy, 'sawmill');
  if (!ok) { g.fillStyle = '#5a3a22'; poly(g, [[cx, cy - HH], [cx + HW, cy], [cx, cy + HH], [cx - HW, cy]]); g.fill(); }
}
let GLOW = null;
function glowSprite() {
  if (GLOW) return GLOW; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 2, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,214,140,1)'); gr.addColorStop(0.35, 'rgba(255,190,100,.42)'); gr.addColorStop(1, 'rgba(255,170,80,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return (GLOW = c);
}

// ---------------- the build toy ----------------
function localSub(room, w) { const T = cellTop(room.x, room.y), diff = (w.x - T.x) * SUB / HW, sum = (w.y - T.y) * SUB / HH; return { u: (sum + diff) / 2, v: (sum - diff) / 2 }; }
function wallHit(room, w) {
  const T = cellTop(room.x, room.y);
  let s = (w.x - (T.x - HW)) / HW, by = T.y + HH - s * HH; if (s >= 0 && s <= 1 && w.y <= by + 2 && w.y >= by - WALL - 4) return { wall: 'L', s };
  s = (w.x - T.x) / HW; by = T.y + s * HH; if (s >= 0 && s <= 1 && w.y <= by + 2 && w.y >= by - WALL - 4) return { wall: 'R', s };
  return null;
}
function buildGhost(room) {
  const B = S.build; if (!B.hover || B.tool === 'erase') return null; const w = B.hover;
  if (B.tool === 'prop') {
    const p = { id: B.sel, u: 0, v: 0, flip: B.flip }, [c, r] = fpOf(p), q = localSub(room, w);
    p.u = clamp(Math.round(q.u - c / 2), 0, SUB - c); p.v = clamp(Math.round(q.v - r / 2), 0, SUB - r);
    if (q.u < -0.6 || q.v < -0.6 || q.u > SUB + 0.6 || q.v > SUB + 0.6) return null;
    const occ = occupied(room); let ok = true; for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) if (occ[p.u + i][p.v + j]) ok = false;
    for (const a of S.actors) { const au = Math.floor(a.gu) - room.x * SUB, av = Math.floor(a.gv) - room.y * SUB; if (au >= p.u && au < p.u + c && av >= p.v && av < p.v + r) ok = false; }
    B.ghostProp = ok ? p : null; return { prop: p, ok };
  }
  const h = wallHit(room, w); if (!h) { B.ghostPiece = null; return null; }
  const d = pieceDef(B.sel); const lo = d && d.wallSlot === 'floor' ? 0.5 : 0.125;
  const piece = { id: B.sel, wall: h.wall, s: clamp(Math.round(h.s * 8) / 8, lo, 1 - lo) }; B.ghostPiece = piece; return { piece, ok: true };
}
function buildClick(sx, sy) {
  const B = S.build, room = S.rooms.get('0,0'), w = toWorld(sx, sy); B.hover = w; if (!room) return;
  if (B.tool === 'erase') {
    const T = cellTop(0, 0); let best = null, bk = -1;
    for (const p of room.props) { const d = propDef(p.id), P = propPos(p, T), k = d.sw / d.w; let lx = (w.x - P.x) / k; if (p.flip) lx = -lx; const ly = (w.y - P.y) / k; if (lx >= -d.anchorX && lx <= d.w - d.anchorX && ly >= -d.anchorY && ly <= d.h - d.anchorY && P.key > bk) { best = { prop: p }; bk = P.key; } }
    if (!best) for (const p of room.pieces) { const d = pieceDef(p.id), b = wallPt(T, p.wall, p.s), up = d.wallSlot === 'floor' ? 0 : WALL * 0.55, k = (d.h / 10) / d.h, sh = (p.wall === 'L' ? -HH / HW : HH / HW) * (w.x - b.x); const lx = (w.x - b.x) / k, ly = (w.y - sh - (b.y - up)) / k; if (lx >= -d.anchorX && lx <= d.w - d.anchorX && ly >= -d.anchorY && ly <= d.h - d.anchorY) best = { piece: p }; }
    if (best && best.prop) room.props.splice(room.props.indexOf(best.prop), 1); else if (best) room.pieces.splice(room.pieces.indexOf(best.piece), 1);
    return;
  }
  const gh = buildGhost(room); if (!gh || !gh.ok) return;
  if (gh.prop) room.props.push({ ...gh.prop }); else room.pieces.push({ ...gh.piece });
}

// ---------------- UI ----------------
function btn(label, on, fn, cls) { const b = document.createElement('button'); b.textContent = label; if (on) b.classList.add('on'); if (cls) b.className += ' ' + cls; b.onclick = fn; return b; }
function grp(label) { const d = document.createElement('div'); d.className = 'grp'; if (label) { const l = document.createElement('span'); l.className = 'lbl'; l.textContent = label; d.appendChild(l); } return d; }
function renderScenes() { const n = $('scenes'); n.textContent = ''; for (const [id, s] of Object.entries(SCENES)) n.appendChild(btn(s.name, S.scene === id, () => { setupScene(id); renderScenes(); })); }
function syncPhase() { const el = $('phase'); if (el) el.textContent = PHASES[Math.floor(S.time + 0.5) % 4]; }
function wallGroup(bar) { const g1 = grp('Walls'); for (const m of ['full', 'low', 'cutaway']) g1.appendChild(btn(m === 'cutaway' ? 'Cutaway front' : m[0].toUpperCase() + m.slice(1), S.wallMode === m, () => { S.wallMode = m; renderBar(); })); bar.appendChild(g1); }
function timeGroup(bar) {
  const g1 = grp('Time'); const sl = document.createElement('input'); sl.type = 'range'; sl.min = 0; sl.max = 3.99; sl.step = 0.01; sl.id = 'timeSl'; sl.value = S.time;
  sl.oninput = () => { S.time = +sl.value; S.auto = false; renderAutoBtn(); syncPhase(); }; g1.appendChild(sl);
  const ph = document.createElement('span'); ph.id = 'phase'; ph.className = 'lbl'; ph.style.minWidth = '56px'; g1.appendChild(ph);
  const ab = btn('Auto', S.auto, () => { S.auto = !S.auto; renderAutoBtn(); }); ab.id = 'autoBtn'; g1.appendChild(ab);
  for (const [i, n] of PHASES.entries()) g1.appendChild(btn(n.slice(0, 3), false, () => { S.time = i; S.auto = false; sl.value = i; renderAutoBtn(); syncPhase(); }));
  bar.appendChild(g1); syncPhase();
}
function renderAutoBtn() { const b = $('autoBtn'); if (b) b.classList.toggle('on', S.auto); }
function renderBar() {
  const bar = $('bar'); bar.textContent = '';
  if (S.scene === 'build') {
    const tools = grp('Tool'); for (const [id, n] of [['prop', 'Place'], ['erase', 'Erase']]) tools.appendChild(btn(n, S.build.tool === id, () => { S.build.tool = id; renderBar(); }));
    tools.appendChild(btn(S.build.flip ? 'Flipped' : 'Flip', S.build.flip, () => { S.build.flip = !S.build.flip; renderBar(); })); bar.appendChild(tools);
    const props = grp('Props'); for (const [id, d] of Object.entries(KITM ? KITM.props : {})) props.appendChild(thumb(d, id, 'prop'));
    bar.appendChild(props);
    const pcs = grp('Wall'); for (const [id, d] of Object.entries(KITM ? KITM.pieces : {})) if (id !== 'door') pcs.appendChild(thumb(d, id, 'piece')); bar.appendChild(pcs);
    const room = S.rooms.get('0,0'), th = grp('Floor'); for (const [id, d] of Object.entries(KITM ? KITM.floors : {})) th.appendChild(btn(d.name, room.floor === id, () => { room.floor = id; renderBar(); }));
    const tw = grp('Wall'); for (const [id, d] of Object.entries(KITM ? KITM.walls : {})) tw.appendChild(btn(d.name, room.wall === id, () => { room.wall = id; renderBar(); }));
    bar.appendChild(th); bar.appendChild(tw);
    const dr = grp('Doors'); dr.appendChild(btn(room.doors.L ? 'Left: on' : 'Left: off', room.doors.L, () => { room.doors.L = !room.doors.L; renderBar(); })); dr.appendChild(btn(room.doors.R ? 'Right: on' : 'Right: off', room.doors.R, () => { room.doors.R = !room.doors.R; renderBar(); })); bar.appendChild(dr);
    wallGroup(bar);
    const ex = grp(); ex.appendChild(btn('Sawmill', false, () => { const k = KINDS[S.build.sub]; room.props = k.props.map(([id, u, v, f]) => ({ id, u, v, flip: !!f })); room.pieces = k.pieces.map(([id, wall, s]) => ({ id, wall, s })); }));
    ex.appendChild(btn('Clear', false, () => { room.props = []; room.pieces = []; })); bar.appendChild(ex);
  } else if (S.scene === 'compare') {
    wallGroup(bar);
    const t = grp('Light'); for (const [i, n] of PHASES.entries()) t.appendChild(btn(n, Math.round(S.time) === i && !S.auto, () => { S.time = i; renderBar(); })); bar.appendChild(t);
  } else {
    wallGroup(bar); timeGroup(bar);
    const p = grp('Power'); p.appendChild(btn(S.power ? 'Generator on' : 'Generator off', !S.power, () => { S.power = !S.power; renderBar(); })); bar.appendChild(p);
  }
  const dbg = grp(); dbg.appendChild(btn('Structure', S.debug, () => { S.debug = !S.debug; renderBar(); })); bar.appendChild(dbg);
  const f = $('hint'); f.textContent = S.scene === 'build' ? 'click: place or erase, wheel or pinch: zoom, drag: pan' : 'wheel or pinch: zoom, drag: pan';
}
function thumb(d, id, kind) {
  const b = document.createElement('button'); b.className = 'thumb'; b.title = d.name; if (S.build.sel === id) b.classList.add('on');
  const i = new Image(); i.src = KIT + d.file1x; i.alt = d.name; b.appendChild(i);
  b.onclick = () => { S.build.sel = id; S.build.tool = kind === 'piece' ? 'piece' : 'prop'; renderBar(); }; return b;
}
function renderNote() {
  const sc = SCENES[S.scene], n = $('note'), hid = n.classList.contains('hidden');
  const sw = (c) => `<div class="sw" style="background:${c}"></div>`;
  n.innerHTML = `<h2>${sc.name}</h2><p>${sc.note}</p><p class="judge"><b>What to judge</b><br>${sc.judge.map((j) => '- ' + j).join('<br>')}</p>
  <div class="legend">${sw('#7a5a3c')}<span>Floor and wall: code-drawn geometry with a seamless texture</span>${sw('#c9a227')}<span>Wall pieces: door, window, banner, sconce</span>${sw('#8a6a48')}<span>Props: separate sprites, depth sorted with actors</span>${sw('#e8dcc0')}<span>Actors: the existing Ward art</span>
  ${sw('#6fe36f')}<span>Structure: wall base</span>${sw('#ffd34a')}<span>Structure: door opening</span>${sw('#ff5a50')}<span>Structure: blocked sub-tile</span></div>`;
  if (hid) n.classList.add('hidden');
}

// ---------------- input ----------------
const ptrs = new Map(); let drag = null, pinch = null;
cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY }); if (ptrs.size === 1) drag = { x: e.offsetX, y: e.offsetY, moved: 0 }; else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; } });
cv.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId);
  if (S.scene === 'build') S.build.hover = toWorld(e.offsetX, e.offsetY);
  if (!p) return; const dx = e.offsetX - p.x, dy = e.offsetY - p.y; p.x = e.offsetX; p.y = e.offsetY;
  if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); zoomAt(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch.d = d; return; }
  if (drag) { drag.moved += Math.abs(dx) + Math.abs(dy); if (drag.moved > 6) { cv.classList.add('drag'); S.cam.x -= dx / S.cam.z; S.cam.y -= dy / S.cam.z; S.camAuto = false; } }
});
const up = (e) => { const was = drag; ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; cv.classList.remove('drag'); if (was && was.moved <= 6 && S.scene === 'build' && e.type === 'pointerup') buildClick(e.offsetX, e.offsetY); drag = null; };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('pointerleave', () => { if (S.scene === 'build' && !drag) S.build.hover = null; });
cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); }, { passive: false });
$('zin').onclick = () => zoomAt(1.3, W / 2, H / 2); $('zout').onclick = () => zoomAt(1 / 1.3, W / 2, H / 2); $('zfit').onclick = () => { S.camAuto = true; fitCam(false); };
$('infoBtn').onclick = () => { $('note').classList.toggle('hidden'); if (S.camAuto) fitCam(false); };
addEventListener('resize', () => { resize(); if (S.camAuto) fitCam(false); });
addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') { S.build.flip = !S.build.flip; renderBar(); } if (e.key === 'c' || e.key === 'C') { S.camAuto = true; fitCam(false); } });

// ---------------- boot ----------------
async function boot() {
  resize(); if (innerHeight < 560 || innerWidth < 700) $('note').classList.add('hidden');
  renderScenes();
  try { KITM = await getJson(KIT + 'manifest.json'); } catch (e) { showBanner('The kit manifest could not be loaded (' + e.message + '). Scenes that need kit art are blank.'); KITM = { floors: {}, walls: {}, pieces: {}, props: {} }; }
  try { WARDM = await getJson(WARD + 'manifest.json'); } catch (e) { showBanner('The Ward manifest could not be loaded (' + e.message + '). Painted rooms and actors are missing.'); WARDM = { rooms: {}, actors: {} }; }
  for (const k of ['floors', 'walls', 'pieces', 'props']) for (const [id] of Object.entries(KITM[k] || {})) kitImg(k, id);
  setupScene('compare'); renderScenes(); resize(); fitCam(true);
  window.__lab = { S, setupScene, failed };
  requestAnimationFrame(frame);
}
boot().catch((e) => showBanner('Lab failed to start: ' + e.message));

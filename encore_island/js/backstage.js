'use strict';
// Encore Island — the Backstage: an underground greenroom under the home island. A stairway (HATCH, SW corner of the plaza) shows up
// once BACKSTAGE_SHOW lands are open and is paid for from BACKSTAGE_OPEN lands; stand still on the open stairs to go down.
// The room is a rectangle far away in world space (BACKSTAGE in world.js) with three doorways in its back wall. Feature modules
// claim a doorway with regDoor({ id, name, icon, hint, unlocked(), enter() }) (features.js); frames nobody has claimed show the
// chained placeholders below, which tease the content that is planned for them (docs/ROADMAP_ENCORE_ISLAND.md).
const BS_HOLD = 0.6, BS_DOOR_W = 84, BS_DOOR_H = 112;
const BS_PLACEHOLDERS = [
  { id: 'merch', name: 'Merch Workshop', icon: 'gift', hint: 'Turn drops into merchandise', unlocked: () => false, enter() {} },
  { id: 'defense', name: 'Watchtower', icon: 'tower', hint: 'Hordes will come for the island', unlocked: () => false, enter() {} },
  { id: 'vip', name: 'VIP Lounge', icon: 'star', hint: '???', unlocked: () => false, enter() {} },
];
const BS = { doors: null, doorsN: -1, cool: 0, dust: null, bg: null, bgKey: '' };
function bsDoorPos(i) { return { x: BACKSTAGE.x + BACKSTAGE.w * (0.25 + 0.25 * i), y: BACKSTAGE.y + 70 }; } // the doorway sill, on the back wall
function bsDoors() { // the three frames: registered doors first, then the placeholders they did not replace
  if (BS.doors && BS.doorsN === DOORS.length) return BS.doors;
  const out = DOORS.slice(0, 3);
  for (const ph of BS_PLACEHOLDERS) if (out.length < 3 && !out.some(d => d.id === ph.id)) out.push(ph);
  BS.doors = out; BS.doorsN = DOORS.length; return out;
}
function bsDoorAt(x, y) { // which doorway the hero is standing in (the strip of floor just below the sill), or -1
  if (y > BACKSTAGE.y + 140) return -1;
  for (let i = 0; i < 3; i++) if (Math.abs(x - bsDoorPos(i).x) < BS_DOOR_W * 0.5) return i;
  return -1;
}
function bsPlateCost() { return Math.ceil(1200 * helmVal(BACKSTAGE_OPEN)); }
function enterBackstage() {
  const p = S.player; S.place = 'backstage'; S.bsHold = 0; BS.cool = 1;
  ringFx(p.x, p.y, 100, '#ff9ac8', 0.4);
  p.x = BS_STAIRS.x; p.y = BS_STAIRS.y - 64; p.vx = p.vy = 0; p.warpT = 0; p.face = 1;
  S.comp.x = p.x - 70; S.comp.y = p.y + 24; CAM.init = false; // a cut, not a 20000 px pan
  ringFx(p.x, p.y, 100, '#ff9ac8', 0.4); sfx('warp', true); fEmit('backstage', true);
}
function exitBackstage() {
  const p = S.player; S.place = 'hub'; S.bsHold = 0; BS.cool = 1;
  p.x = HATCH.x; p.y = HATCH.y + 74; p.vx = p.vy = 0; p.warpT = 0;
  S.comp.x = p.x - 70; S.comp.y = p.y + 24; CAM.init = false;
  ringFx(p.x, p.y, 100, '#ff9ac8', 0.4); sfx('warp', true); fEmit('backstage', false);
}
// hub side: the stairway plate and the hold-to-descend; room side: the stairs up and the doorways
function tickBackstage(dt) {
  const p = S.player, n = S.lands.length; BS.cool = Math.max(0, BS.cool - dt);
  if (S.place === 'backstage') {
    if (!inBackstage(p.x, p.y)) { S.place = 'hub'; S.bsHold = 0; return; } // something else moved the hero (a warp, a challenge, fainting, a tour)
    const still = !p.moving && BS.cool <= 0;
    if (still && dist2(p.x, p.y, BS_STAIRS.x, BS_STAIRS.y) < BS_STAIRS.r * BS_STAIRS.r) { S.bsHold += dt; if (S.bsHold >= BS_HOLD) exitBackstage(); return; }
    const di = still ? bsDoorAt(p.x, p.y) : -1;
    if (di >= 0) {
      S.bsHold += dt;
      if (S.bsHold >= BS_HOLD) {
        const d = bsDoors()[di]; S.bsHold = 0; BS.cool = 1.6;
        if (d.unlocked()) { sfx('unlock', true); d.enter(); }
        else { const dp = bsDoorPos(di); float(dp.x, dp.y - 40, d.hint === '???' ? 'Coming soon' : d.hint, '#c6a8ff', true); sfx('ui_close'); buzz(20); }
      }
    } else S.bsHold = Math.max(0, S.bsHold - dt * 2);
    return;
  }
  if (n < BACKSTAGE_SHOW) return;
  const bp = S.bsPlate; if (!bp.cost) bp.cost = bsPlateCost();
  if (!bp.built) {
    if (n >= BACKSTAGE_OPEN && dist2(p.x, p.y, HATCH.x, HATCH.y) < 60 * 60) {
      bp.x = HATCH.x; bp.y = HATCH.y;
      if (pay(bp, dt, 'backstage')) { bp.built = true; float(HATCH.x, HATCH.y - 90, 'BACKSTAGE OPEN!', '#ff9ac8', true); sfx('unlock', true); buzz([40, 30, 80]); ringFx(HATCH.x, HATCH.y, 140, '#ff9ac8', 0.7); starBurst(HATCH.x, HATCH.y - 20, 18, ['#ff9ac8', '#c6a8ff', '#ffe98a'], 280); }
    }
    return;
  }
  if (!p.moving && BS.cool <= 0 && dist2(p.x, p.y, HATCH.x, HATCH.y) < HATCH.r * HATCH.r) { S.bsHold += dt; if (S.bsHold >= BS_HOLD) enterBackstage(); }
  else S.bsHold = Math.max(0, S.bsHold - dt * 2);
}
// ---- drawing ----
function drawBackstageBg() { // screen space: the dark around the room
  const key = vw + 'x' + vh;
  if (BS.bgKey !== key) { const g = ctx.createLinearGradient(0, 0, 0, vh); g.addColorStop(0, '#120a2a'); g.addColorStop(1, '#1e1040'); BS.bg = g; BS.bgKey = key; }
  ctx.fillStyle = BS.bg; ctx.fillRect(0, 0, vw, vh);
}
function bsFloorPat() { return groundPat('bsfloor', ['#4a2c2a', '#4a2c2a'], 'rgba(20,8,10,0.55)', null, 'plank'); }
function bsRugPat() { return groundPat('bsrug', ['#8a2a5a', '#8a2a5a'], '#a8386e', null, 'cobble'); }
function paintBsWall() { // one 256 px tile of the back wall: dark velvet curtain folds
  ctx.translate(-128, -128); ctx.fillStyle = '#2a1850'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) { const x = i * 32; ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.05)'; ctx.fillRect(x, 0, 32, 256); ctx.fillStyle = 'rgba(255,126,182,0.08)'; ctx.fillRect(x + 12, 0, 6, 256); }
}
function bsWallPat() { let p = PAT.get('bswall'); if (p !== undefined) return p; p = null; const c = sprite('gt_bswall', 256, paintBsWall); if (c && ctx.createPattern) { try { p = ctx.createPattern(c, 'repeat'); } catch (e) { p = null; } } PAT.set('bswall', p); return p; }
function drawBsDoor(i, d) {
  const dp = bsDoorPos(i), x = dp.x, y = dp.y, w = BS_DOOR_W, h = BS_DOOR_H, open = d.unlocked(), near = Math.abs(S.player.x - x) < 90 && S.player.y < BACKSTAGE.y + 170;
  ctx.fillStyle = HV.line; rr(x - w / 2 - 8, y - h - 8, w + 16, h + 10, 12); ctx.fill();
  ctx.translate(0, y - h - 4); ctx.fillStyle = vgrad(h + 4, '#b08a5a', '#6a4a2a'); rr(x - w / 2 - 5, 0, w + 10, h + 4, 9); ctx.fill(); ctx.translate(0, h + 4 - y); // the wooden frame
  if (open) { ctx.translate(0, y - h); ctx.fillStyle = vgrad(h, '#ffb0d8', '#6a2a8a'); rr(x - w / 2, 0, w, h, 6); ctx.fill(); ctx.translate(0, h - y);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(S.t * 3 + i); ctx.translate(x, y - h / 2); ctx.fillStyle = ggrad(10, w, '#ff9ac8'); ctx.beginPath(); ctx.arc(0, 0, w, 0, TAU); ctx.fill(); ctx.translate(-x, h / 2 - y); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  else { ctx.translate(0, y - h); ctx.fillStyle = vgrad(h, '#1a0f33', '#0c0620'); rr(x - w / 2, 0, w, h, 6); ctx.fill(); ctx.translate(0, h - y);
    ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.setLineDash([7, 5]); // the chains
    ctx.beginPath(); ctx.moveTo(x - w / 2, y - h + 14); ctx.lineTo(x + w / 2, y - 14); ctx.moveTo(x + w / 2, y - h + 14); ctx.lineTo(x - w / 2, y - 14); ctx.stroke(); ctx.setLineDash([]);
    drawIcon('lock', x, y - h / 2 + 4, 40); }
  drawIcon(d.icon, x, y - h - 30, 34); // the sign above the frame
  labelPill(d.name, x, y + 18, open ? '#ffe98a' : '#e6dcff', open ? '#f0b422' : '#a99ad8', 11);
  if (near) labelPill(open ? 'stand still to enter' : (d.hint === '???' ? 'Coming soon' : d.hint), x, y + 40, '#ffffff', '#dccaff', 10);
}
function drawBsStairs() {
  const x = BS_STAIRS.x, y = BACKSTAGE.y + BACKSTAGE.h, w = 120, hold = S.place === 'backstage' && dist2(S.player.x, S.player.y, BS_STAIRS.x, BS_STAIRS.y) < BS_STAIRS.r * BS_STAIRS.r ? S.bsHold : 0;
  ctx.fillStyle = HV.line; rr(x - w / 2 - 6, y - 70, w + 12, 76, 10); ctx.fill();
  for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? '#5a4a8a' : '#6a5a9a'; rr(x - w / 2 + i * 4, y - 66 + i * 13, w - i * 8, 12, 3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - w / 2 + i * 4 + 3, y - 66 + i * 13 + 1, w - i * 8 - 6, 2); }
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45; ctx.translate(x, y); ctx.fillStyle = ggrad(4, 70, '#ffe98a'); ctx.beginPath(); ctx.ellipse(0, 0, 90, 40, 0, Math.PI, 0); ctx.fill(); ctx.translate(-x, -y); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; // daylight from above
  if (hold > 0) { ctx.strokeStyle = '#ffe98a'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.ellipse(x, y - 40, 70, 34, 0, -Math.PI / 2, -Math.PI / 2 + Math.min(1, hold / BS_HOLD) * TAU); ctx.stroke(); }
  labelPill('EXIT  stand still', x, y - 86, '#ffe98a', '#f0b422', 11);
}
function drawBsFurniture() {
  const X = BACKSTAGE.x, Y = BACKSTAGE.y, W = BACKSTAGE.w;
  // mirror with bulbs (left of the doors)
  const mx = X + W * 0.1, my = Y + 68; ctx.fillStyle = HV.line; rr(mx - 40, my - 100, 80, 96, 10); ctx.fill(); ctx.translate(0, my - 97); ctx.fillStyle = vgrad(90, '#dff4ff', '#8ab8d8'); rr(mx - 37, 0, 74, 90, 8); ctx.fill(); ctx.translate(0, 97 - my);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(mx - 30, my - 20); ctx.lineTo(mx - 10, my - 92); ctx.lineTo(mx + 2, my - 92); ctx.lineTo(mx - 18, my - 20); ctx.fill();
  for (let i = 0; i < 10; i++) { const a = i / 9, bx = mx - 40 + a * 80, on = ((S.t * 4) | 0) % 2 === i % 2; ctx.fillStyle = on ? '#fff4c0' : '#ffd84d'; ctx.beginPath(); ctx.arc(bx, my - 104, on ? 4 : 3, 0, TAU); ctx.fill(); if (i < 5) { const by = my - 100 + i * 20; ctx.beginPath(); ctx.arc(mx - 44, by, 3, 0, TAU); ctx.arc(mx + 44, by, 3, 0, TAU); ctx.fill(); } }
  // outfit rack (right of the doors)
  const rx = X + W * 0.9, ry = Y + 68; ctx.fillStyle = HV.line; ctx.fillRect(rx - 44, ry - 96, 6, 96); ctx.fillRect(rx + 38, ry - 96, 6, 96); rr(rx - 48, ry - 102, 96, 8, 4); ctx.fill();
  const RC = ['#ff7eb6', '#3fcf6a', '#ffd84d', '#a77bff', '#2ec4b6'];
  for (let i = 0; i < 5; i++) { const cx = rx - 34 + i * 17, sw = Math.sin(S.t * 1.5 + i) * 1.5; ctx.fillStyle = HV.line; rr(cx - 8 + sw, ry - 92, 16, 56, 5); ctx.fill(); ctx.fillStyle = RC[i]; rr(cx - 6 + sw, ry - 90, 12, 52, 4); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.3)'; rr(cx - 4 + sw, ry - 88, 3, 46, 2); ctx.fill(); }
  // neon sign over the middle door
  const nx = X + W / 2, ny = Y - 86 + Math.sin(S.t * 1.2) * 1.5, pu = 0.8 + 0.2 * Math.sin(S.t * 7);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 * pu; ctx.translate(nx, ny - 8); ctx.fillStyle = ggrad(20, 150, '#ff7eb6'); ctx.beginPath(); ctx.ellipse(0, 0, 150, 50, 0, 0, TAU); ctx.fill(); ctx.translate(-nx, 8 - ny); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  stickerText('BACKSTAGE', nx, ny, 30, '#ffc9de', '#ff5fa6', 0);
  // string lights along the top of the wall
  for (let i = 0; i < 24; i++) { const a = (i + 0.5) / 24, lx = X + a * W, ly = Y - 118 + Math.sin(a * Math.PI * 6) * 6, on = ((S.t * 3) | 0) % 3 === i % 3; ctx.fillStyle = on ? '#fff4c0' : ['#ff9ac8', '#9af0b4', '#c6a8ff'][i % 3]; ctx.beginPath(); ctx.arc(lx, ly, on ? 4.5 : 3.5, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = 'rgba(255,244,230,0.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = 0; i <= 48; i++) { const a = i / 48, lx = X + a * W, ly = Y - 126 + Math.sin(a * Math.PI * 6) * 6; if (i) ctx.lineTo(lx, ly); else ctx.moveTo(lx, ly); } ctx.stroke();
}
function drawBsCouch() { // along the bottom wall, left of the stairs
  const x = BACKSTAGE.x + 150, y = BACKSTAGE.y + BACKSTAGE.h - 18;
  shadow(x, y + 4, 80, 0.3);
  ctx.fillStyle = HV.line; rr(x - 86, y - 56, 172, 60, 14); ctx.fill(); ctx.translate(0, y - 53); ctx.fillStyle = vgrad(54, '#c84a8a', '#7a2a5a'); rr(x - 83, 0, 166, 54, 12); ctx.fill(); ctx.translate(0, 53 - y);
  for (let i = 0; i < 3; i++) { ctx.fillStyle = HV.line; rr(x - 76 + i * 52, y - 30, 48, 26, 8); ctx.fill(); ctx.fillStyle = '#e06aa8'; rr(x - 74 + i * 52, y - 28, 44, 22, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.3)'; rr(x - 70 + i * 52, y - 26, 36, 6, 3); ctx.fill(); }
  for (const dx of [-80, 80]) { ctx.fillStyle = HV.line; rr(x + dx - 12, y - 50, 24, 48, 9); ctx.fill(); ctx.fillStyle = '#d85a98'; rr(x + dx - 9, y - 47, 18, 42, 7); ctx.fill(); }
}
function drawBsFridge() { // bottom right: the rider
  const x = BACKSTAGE.x + BACKSTAGE.w - 110, y = BACKSTAGE.y + BACKSTAGE.h - 18, hum = Math.sin(S.t * 30) * 0.4;
  shadow(x, y + 4, 44, 0.3);
  ctx.fillStyle = HV.line; rr(x - 34 + hum, y - 100, 68, 104, 10); ctx.fill(); ctx.translate(0, y - 97); ctx.fillStyle = vgrad(98, '#bfeaf2', '#6fb2c8'); rr(x - 31 + hum, 0, 62, 98, 8); ctx.fill(); ctx.translate(0, 97 - y);
  ctx.strokeStyle = HV.line; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 31, y - 60); ctx.lineTo(x + 31, y - 60); ctx.stroke();
  ctx.fillStyle = HV.line; rr(x + 16, y - 90, 7, 24, 3); ctx.fill(); rr(x + 16, y - 52, 7, 40, 3); ctx.fill();
  ctx.fillStyle = '#ff7eb6'; ctx.beginPath(); ctx.arc(x - 8, y - 78, 9, 0, TAU); ctx.fill(); ctx.fillStyle = '#3fcf6a'; rr(x - 22, y - 40, 14, 22, 4); ctx.fill(); ctx.fillStyle = '#ffd84d'; rr(x - 4, y - 36, 20, 18, 4); ctx.fill(); // magnets & snacks
}
function drawBackstage() { // world space; the camera follows the hero around the room
  const X = BACKSTAGE.x, Y = BACKSTAGE.y, W = BACKSTAGE.w, H = BACKSTAGE.h;
  // back wall (a vertical surface above the floor line) and the floor
  ctx.fillStyle = HV.line; rr(X - 10, Y - 140, W + 20, H + 150, 18); ctx.fill();
  const wp = bsWallPat(); ctx.fillStyle = wp || '#2a1850'; ctx.fillRect(X, Y - 132, W, 202);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(X, Y + 56, W, 14); // skirting shadow
  const fp = bsFloorPat(); ctx.fillStyle = fp || '#4a2c2a'; ctx.fillRect(X, Y + 70, W, H - 70);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(X, Y + 70, BACKSTAGE.pad, H - 70); ctx.fillRect(X + W - BACKSTAGE.pad, Y + 70, BACKSTAGE.pad, H - 70); // side walls
  const rx = X + W / 2, ry = Y + 70 + (H - 70) * 0.52, rp = bsRugPat(); // the rug
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.ellipse(rx, ry, 236, 96, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8a2a5a'; ctx.beginPath(); ctx.ellipse(rx, ry, 230, 90, 0, 0, TAU); ctx.fill();
  if (rp) { ctx.save(); ctx.beginPath(); ctx.ellipse(rx, ry, 230, 90, 0, 0, TAU); ctx.clip(); ctx.fillStyle = rp; ctx.fillRect(rx - 240, ry - 100, 480, 200); ctx.restore(); }
  ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(rx, ry, 212, 76, 0, 0, TAU); ctx.stroke();
  drawIcon('star', rx, ry, 70);
  drawBsFurniture();
  const doors = bsDoors(); for (let i = 0; i < 3; i++) drawBsDoor(i, doors[i]);
  // y-sorted: couch, fridge, stairs, companion, hero
  ysN = 0;
  ysAdd(Y + H - 18, drawBsCouch); ysAdd(Y + H - 18, drawBsFridge); ysAdd(Y + H - 30, drawBsStairs); ysAdd(S.comp.y, drawCompanion); ysAdd(S.player.y, drawHero);
  YS.length = ysN; YS.sort(ysCmp);
  for (let i = 0; i < ysN; i++) { const e = YS[i]; e.f(e.a, e.b, e.c); }
  // the hold ring under the hero while a doorway charges
  if (S.bsHold > 0 && bsDoorAt(S.player.x, S.player.y) >= 0) { const p = S.player; ctx.strokeStyle = '#ff9ac8'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, 30, 14, 0, -Math.PI / 2, -Math.PI / 2 + Math.min(1, S.bsHold / BS_HOLD) * TAU); ctx.stroke(); }
  drawFeaturesWorld();
  drawFx(); drawFloats();
}

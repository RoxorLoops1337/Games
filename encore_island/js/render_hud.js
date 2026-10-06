'use strict';
// Encore Island — HUD: player card, currencies, minimap, objective guide, combo + groove, dock, action buttons, toasts, level-up cards, title.
const JUICE_HUD = { w: null, pulse: 0, prev: 0, t: 0 };
let leftBottom = 130;
function hitRect(x, y, w, h, act) { hits.push({ x, y, w, h, act }); }
function drawPlayerCard() {
  const p = S.player, x0 = 10, y0 = 10, sk = activeSkin().art;
  plaque(x0 + 22, y0 + 6, 152, 62, 14); artHead(sk, x0 + 30, y0 + 38, 28);
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(x0 + 52, y0 + 62, 11, 0, TAU); ctx.fill(); ctx.fillStyle = '#a77bff'; ctx.beginPath(); ctx.arc(x0 + 52, y0 + 62, 9, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = font(10); ctx.textAlign = 'center'; ctx.fillText(S.level, x0 + 52, y0 + 66);
  const cx = x0 + 68; ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(cx, y0 + 12, 100, 20, 10); ctx.fill(); drawIcon('coin', cx + 10, y0 + 22, 24);
  const dtv = Math.min(0.1, Math.max(0, S.t - JUICE_HUD.t)); JUICE_HUD.t = S.t; if (JUICE_HUD.w === null) JUICE_HUD.w = S.wallet;
  if (S.wallet > JUICE_HUD.prev) JUICE_HUD.pulse = 1; JUICE_HUD.prev = S.wallet;
  JUICE_HUD.w += (S.wallet - JUICE_HUD.w) * Math.min(1, dtv * 12); if (Math.abs(S.wallet - JUICE_HUD.w) < 1) JUICE_HUD.w = S.wallet; JUICE_HUD.pulse = Math.max(0, JUICE_HUD.pulse - dtv * 3);
  ctx.save(); ctx.translate(cx + 26, y0 + 28); const ps = 1 + 0.16 * JUICE_HUD.pulse; ctx.scale(ps, ps); ctx.fillStyle = JUICE_HUD.pulse > 0.2 ? '#fff6c0' : '#ffd94a'; ctx.font = font(16); ctx.textAlign = 'left'; ctx.fillText(fmt(Math.round(JUICE_HUD.w)), 0, 0); ctx.restore();
  const hpf = Math.max(0, p.hp / p.maxHp); gbar(cx, y0 + 38, 100, 13, hpf, hpf > 0.35 ? '#ff9ac8' : '#ff8a5a', hpf > 0.35 ? '#e8407f' : '#d1301f'); drawIcon('hp', cx + 8, y0 + 44.5, 20);
  ctx.fillStyle = '#fff'; ctx.font = font(9); ctx.textAlign = 'center'; ctx.fillText(Math.ceil(p.hp) + ' / ' + p.maxHp, cx + 56, y0 + 48);
  gbar(cx, y0 + 55, 100, 6, Math.min(1, S.xp / xpNeed(S.level)), '#c6ffa0', '#3fcf6a');
  hitRect(x0, y0, 174, 70, () => openSheet('goals', 'records'));
  let cx2 = x0; const cy2 = y0 + 76;
  const chip = (icon, txt, col, act, pip) => { const w = 76; plaque(cx2, cy2, w, 24, 12); if (icon === 'gem') drawGemIcon(cx2 + 13, cy2 + 12, 0.9); else drawIcon(icon, cx2 + 13, cy2 + 12, 22); ctx.fillStyle = col; ctx.font = font(13); ctx.textAlign = 'left'; ctx.fillText(txt, cx2 + 28, cy2 + 17); if (pip) { ctx.fillStyle = '#ffd94a'; ctx.beginPath(); ctx.arc(cx2 + w - 4, cy2 + 3, 3.5 + Math.sin(S.t * 6) * 0.7, 0, TAU); ctx.fill(); } if (act) hitRect(cx2, cy2, w, 24, act); cx2 += w + 6; };
  if (S.gems > 0 || S.gemUp.magnet + S.gemUp.crit + S.gemUp.coin > 0) chip('gem', fmt(S.gems), '#6ee0d8', () => openSheet('heroes', 'critters'), S.gems >= eggCost(S.stats.hatches));
  if (S.crowns > 0 || S.prestiges > 0) chip('crown', fmt(S.crowns), '#ffd94a', () => openSheet('perks'), S.crowns > 0);
  leftBottom = cy2 + 34;
}
function drawRankPill() {
  const rk = heroRank(), nx = nextRank(), left = 196, right = vw - 102; if (right - left < 96) return;
  const rw = clamp(right - left, 96, 150), rx = left + (right - left - rw) / 2, ry = 10;
  plaque(rx, ry, rw, 30, 9); ctx.fillStyle = '#ffd94a'; ctx.font = font(11); ctx.textAlign = 'center'; ctx.fillText(rk.name, rx + rw / 2, ry + 14);
  if (nx) { const f = Math.min(1, (renown() - rk.at) / (nx.at - rk.at)); ctx.fillStyle = 'rgba(255,255,255,0.14)'; rr(rx + 10, ry + 20, rw - 20, 4, 2); ctx.fill(); ctx.fillStyle = '#6ecb5a'; rr(rx + 10, ry + 20, (rw - 20) * f, 4, 2); ctx.fill(); }
  hitRect(rx, ry, rw, 30, () => openSheet('goals', 'records'));
}
function drawMinimap() {
  const r = 42, cx = vw - 12 - r, cy = 12 + r;
  const ex = worldExtent(S.lands.length), W = Math.max(ex.x1 - ex.x0, ex.y1 - ex.y0), sc = (r * 1.7) / W, mx = (ex.x0 + ex.x1) / 2, my = (ex.y0 + ex.y1) / 2;
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(cx, cy + 1.5, r + 4, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, r); g.addColorStop(0, '#8fe3f0'); g.addColorStop(1, '#4fb4d4'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
  const P = (x, y) => [cx + (x - mx) * sc, cy + (y - my) * sc];
  ctx.strokeStyle = '#f6e7c8'; ctx.lineWidth = Math.max(2, PATH_HALF * 2 * sc); ctx.lineCap = 'round';
  for (const z of S.lands) { ctx.beginPath(); z.g.path.forEach((q, i) => { const [x, y] = P(q.x, q.y); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); }
  const blob = (gg, col) => { ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i <= 28; i++) { const a = i / 28 * TAU, rad = radiusAt(gg, a), [x, y] = P(gg.x + Math.cos(a) * rad, gg.y + Math.sin(a) * rad); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); ctx.fill(); };
  blob(HUB_GEO, '#ffd9ea'); for (const z of S.lands) blob(z.g, biomeOf(z.k).g[0]);
  const ng = geoOf(S.lands.length + 1); ctx.globalAlpha = 0.5; blob(ng, '#ffffff'); ctx.globalAlpha = 1;
  const gt = guideTarget(); if (gt) { const [x, y] = P(gt.x, gt.y); ctx.fillStyle = '#ffd84d'; ctx.strokeStyle = HV.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 4 + Math.sin(S.t * 6), 0, TAU); ctx.fill(); ctx.stroke(); }
  const [hx, hy] = P(S.player.x, S.player.y); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ff4d8d'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(hx, hy, 3.6, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.restore(); ctx.strokeStyle = HV.cream; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
}
// what to do next: sell, collect, pay a plate, or fight
function guideTarget() {
  const p = S.player;
  if (p.helmets.length >= Math.max(3, cap() * 0.6) || (p.helmets.length && S.pallet <= 0 && S.wallet < 30)) return { x: SELL.x, y: SELL.y, label: 'Sell your loot' };
  if (S.pallet > 0 && (S.pallet >= S.wallet * 0.25 || S.wallet < 40)) return { x: VAULT.x, y: VAULT.y, label: 'Collect coins' };
  let best = null, bd = 1e18; const consider = (x, y, rem, label) => { if (rem > 0 && rem <= S.wallet) { const d = dist2(p.x, p.y, x, y); if (d < bd) { bd = d; best = { x, y, label }; } } };
  for (const key in UPG) consider(UPG_POS[key].x, UPG_POS[key].y, upgCost(key, S.up[key]) - S.upPaid[key], 'Upgrade ' + UPG[key].name);
  const u = S.unlockPlate; if (u) consider(u.x, u.y, u.cost - u.paid, 'Open a new land');
  for (const z of S.lands) for (const pl of z.plates) if (!pl.built) consider(pl.x, pl.y, pl.cost - pl.paid, 'Build ' + pl.name);
  if (best) return best;
  if (S.pallet > 0) return { x: VAULT.x, y: VAULT.y, label: 'Collect coins' };
  let fo = null, fd = 1e18; for (const e of S.enemies) { const d = dist2(p.x, p.y, e.x, e.y); if (d < fd) { fd = d; fo = e; } }
  if (fo && fd > 300 * 300) return { x: fo.x, y: fo.y, label: 'Hunt creatures' };
  return null;
}
function drawGuide() {
  const g = guideTarget(); if (!g || S.sheet || S.modal) return;
  const dx = g.x - CAM.x, dy = g.y - CAM.y;
  if (dx * dx + dy * dy < 200 * 200) return;
  const a = Math.atan2(dy, dx), rad = Math.min(vw, vh) * 0.34, ax = vw / 2 + Math.cos(a) * rad, ay = vh * 0.46 + Math.sin(a) * rad, pu = 1 + Math.sin(S.t * 6) * 0.12;
  ctx.save(); ctx.translate(ax, ay); ctx.rotate(a); ctx.scale(pu, pu); ctx.lineJoin = 'round'; ctx.strokeStyle = HV.line; ctx.lineWidth = 5; ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.moveTo(17, 0); ctx.lineTo(-8, -12); ctx.lineTo(-3, 0); ctx.lineTo(-8, 12); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
  labelPill(g.label, ax, ay + 30, '#ffe98a', '#f0b422', 11);
}
function drawCombo() {
  if (S.combo < 3) return;
  const mul = comboMul(), col = comboColor(), cx = vw / 2, cy = 112, sc = 1 + (S.comboFlash > 0 ? S.comboFlash * 0.6 : 0) + Math.sin(S.t * 12) * 0.02;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); stickerText('x' + mul, 0, 0, 30, mixc(col, '#ffffff', 0.5), col, 0); ctx.font = font(12); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(S.combo + ' COMBO', 0, 18); ctx.restore();
  const w = 96, f = Math.max(0, S.comboT / comboWindow()); ctx.fillStyle = 'rgba(0,0,0,0.45)'; rr(cx - w / 2, cy + 26, w, 5, 2); ctx.fill(); ctx.fillStyle = col; rr(cx - w / 2, cy + 26, w * f, 5, 2); ctx.fill();
}
// the groove meter: kills landed on the beat fill it; when full the band plays an ENCORE
function drawGroove(y) {
  const w = Math.min(230, vw - 200), x = vw / 2 - w / 2, h = 22, beat = beatNow() % 1, pu = Math.max(0, 1 - beat * 4);
  const enc = encoreOn();
  plaque(x, y, w, h, 11);
  const f = enc ? S.encoreT / ENCORE_TIME : S.groove / GROOVE_NEED;
  const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, enc ? '#ffe98a' : '#ff9ac8'); g.addColorStop(1, enc ? '#ff9a2e' : '#9af0b4');
  ctx.fillStyle = g; rr(x + 3, y + 3, Math.max(h - 6, (w - 6) * f), h - 6, (h - 6) / 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.38)'; rr(x + 5, y + 4, Math.max(8, (w - 10) * f), 5, 3); ctx.fill();
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(x + 14, y + h / 2, 13 + pu * 2.5, 0, TAU); ctx.fill(); ctx.fillStyle = enc ? '#ffd84d' : '#ff7eb6'; ctx.beginPath(); ctx.arc(x + 14, y + h / 2, 10.5 + pu * 2.5, 0, TAU); ctx.fill(); drawIcon('groove', x + 14, y + h / 2, 17 + pu * 4);
  ctx.fillStyle = '#fff'; ctx.font = font(11); ctx.textAlign = 'center'; ctx.fillText(enc ? 'ENCORE! x2 coins' : 'GROOVE ' + S.groove + '/' + GROOVE_NEED, x + w / 2 + 8, y + h / 2 + 4);
  if (enc) { for (let i = 0; i < 3; i++) spark(x + w * (0.2 + 0.3 * i) + Math.sin(S.t * 3 + i) * 8, y - 5 - Math.abs(Math.sin(S.t * 4 + i)) * 6, 6, 0.9); }
}
const DOCK = [['town', 'home', 'Town'], ['heroes', 'mic', 'Heroes'], ['goals', 'trophy', 'Goals'], ['perks', 'crown', 'Perks'], ['more', 'menu', 'More']];
function dockPips() { return { town: S.pop.length < popCap() && S.wallet >= recruitCost(), heroes: S.gems >= eggCost(S.stats.hatches), goals: S.dailies.concat(S.quests).some(q => q.done && false) || S.dailies.some(q => !q.done) && false, perks: S.crowns > 0, more: loginReady() || S.gems >= SPIN_COST }; }
const DOCK_H = 62;
function drawDock() {
  const y = vh - DOCK_H - 6, x = 8, w = vw - 16, pips = dockPips();
  plaque(x, y, w, DOCK_H, 18); const bw = w / DOCK.length;
  DOCK.forEach(([id, icon, label], i) => {
    const bx = x + i * bw, on = S.sheet && S.sheet.id === id;
    if (on) { pill(bx + 5, y + 5, bw - 10, DOCK_H - 10, '#ffe98a', '#f0b422'); }
    const bob = on ? -2 : 0; drawIcon(icon, bx + bw / 2, y + 24 + bob, 34);
    ctx.fillStyle = on ? '#3a2410' : '#e6dcff'; ctx.font = font(10); ctx.textAlign = 'center'; ctx.fillText(label, bx + bw / 2, y + DOCK_H - 9);
    if (pips[id]) { ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(bx + bw / 2 + 17, y + 12, 7.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff4d7a'; ctx.beginPath(); ctx.arc(bx + bw / 2 + 17, y + 12, 5.5 + Math.sin(S.t * 6) * 0.6, 0, TAU); ctx.fill(); }
    hitRect(bx, y, bw, DOCK_H, () => { if (S.sheet && S.sheet.id === id) closeSheet(); else openSheet(id); sfx('ui_open'); });
  });
}
function drawActionButtons(baseY) {
  const p = S.player, r = 34;
  const bx = vw - 52, by = baseY, ready = p.dashCd <= 0;
  if (ready) disc(bx, by, r, '#7cf09a', '#25a84f'); else disc(bx, by, r, '#8a7ac0', '#4a3a88');
  if (!ready) { ctx.strokeStyle = '#fff4e6'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(bx, by, r - 3, -Math.PI / 2, -Math.PI / 2 + (1 - p.dashCd / dashCdMax()) * TAU); ctx.stroke(); } else { ctx.strokeStyle = 'rgba(255,244,230,' + (0.5 + Math.sin(S.t * 6) * 0.3) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx, by, r - 3, 0, TAU); ctx.stroke(); }
  drawIcon('speed', bx, by - 5, 38); ctx.fillStyle = ready ? '#fff4e6' : '#cfc6ee'; ctx.font = font(9); ctx.textAlign = 'center'; ctx.fillText('DASH', bx, by + 25); hitRect(bx - r, by - r, r * 2, r * 2, dashAbility);
  const ux = 52, uy = baseY, uReady = ultReady();
  if (uReady) disc(ux, uy, r, '#ff9ac8', '#f0599a'); else disc(ux, uy, r, '#8a7ac0', '#4a3a88');
  ctx.strokeStyle = uReady ? 'rgba(255,233,138,' + (0.6 + Math.sin(S.t * 6) * 0.35) + ')' : '#c9873f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(ux, uy, r - 3, -Math.PI / 2, -Math.PI / 2 + ultFrac() * TAU); ctx.stroke();
  drawIcon('crit', ux, uy - 5, 38); ctx.fillStyle = uReady ? '#fff' : '#cfc6ee'; ctx.font = font(9); ctx.fillText(uReady ? 'BLAST!' : Math.floor(ultFrac() * 100) + '%', ux, uy + 25); if (uReady) hitRect(ux - r, uy - r, r * 2, r * 2, castUlt);
  const ap = activePet();
  if (ap) { const px = ux, py = uy - 76, pr = 28, pr2 = petAbilityReady(); if (pr2) disc(px, py, pr, '#c6a8ff', '#9a70ff'); else disc(px, py, pr, '#8a7ac0', '#4a3a88');
    ctx.strokeStyle = pr2 ? 'rgba(154,240,180,' + (0.5 + Math.sin(S.t * 6) * 0.3) + ')' : '#9af0b4'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(px, py, pr - 3, -Math.PI / 2, -Math.PI / 2 + (pr2 ? 1 : 1 - S.petCd / PET_CD) * TAU); ctx.stroke();
    artDraw(ap.art, 'idle', (S.t * 4) | 0, px, py + 20, 0.3, false); ctx.fillStyle = '#fff4e6'; ctx.font = font(8); ctx.textAlign = 'center'; ctx.fillText(pr2 ? 'READY' : Math.ceil(S.petCd) + 's', px, py + 25); if (pr2) hitRect(px - pr, py - pr, pr * 2, pr * 2, petAbility); }
}
function drawToasts() {
  let ty = Math.max(150, vh * 0.2);
  for (const to of S.toasts.slice(0, 2)) {
    const a = Math.min(1, 4 * Math.min(to.t, 3 - to.t)), slide = (1 - Math.min(1, to.t * 5)) * 30; ctx.globalAlpha = Math.max(0, a); ctx.font = font(13);
    const tw = Math.min(vw - 20, Math.max(220, ctx.measureText(to.txt).width + 62)), x = vw / 2 - tw / 2;
    plaque(x, ty - slide, tw, 34, 12); ctx.strokeStyle = '#ffd94a'; ctx.lineWidth = 1.5; rr(x, ty - slide, tw, 34, 12); ctx.stroke();
    if (to.ic) drawIcon(to.ic, x + 20, ty - slide + 17, 26); ctx.fillStyle = '#ffd94a'; ctx.textAlign = 'left'; ctx.fillText(to.txt, x + 38, ty - slide + 22); ctx.globalAlpha = 1; ty += 40;
  }
}
function drawCardsDraft() {
  if (!S.cards) return;
  const sg = ctx.createLinearGradient(0, vh - 250, 0, vh); sg.addColorStop(0, 'rgba(30,16,70,0)'); sg.addColorStop(0.35, 'rgba(30,16,70,0.8)'); sg.addColorStop(1, 'rgba(30,16,70,0.94)'); ctx.fillStyle = sg; ctx.fillRect(0, vh - 250, vw, 250);
  const bw = 210, by0 = vh - 226; pill(vw / 2 - bw / 2, by0, bw, 30, '#ffe98a', '#f0b422'); ctx.fillStyle = '#3a2410'; ctx.font = font(14); ctx.textAlign = 'center'; ctx.fillText('LEVEL ' + S.level + '!  pick one', vw / 2, by0 + 20);
  const n = S.cards.length, cw = Math.min(124, (vw - 36) / n - 8), gap = 8, x0 = (vw - (n * cw + (n - 1) * gap)) / 2;
  for (let i = 0; i < n; i++) {
    const c = S.cards[i], cx = x0 + i * (cw + gap), ch = 150, cy = vh - 186 + Math.sin(S.t * 3 + i * 1.3) * 2;
    card(cx, cy, cw, ch, 14);
    const hg = ctx.createLinearGradient(0, cy, 0, cy + 46); hg.addColorStop(0, '#c6a8ff'); hg.addColorStop(1, '#8a5cf0'); ctx.save(); rr(cx, cy, cw, ch, 14); ctx.clip(); ctx.fillStyle = hg; ctx.fillRect(cx, cy, cw, 48); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(cx, cy, cw, 12); ctx.restore();
    disc(cx + cw / 2, cy + 32, 24, '#fff8f0', '#ffd9ea'); drawIcon(c.icon, cx + cw / 2, cy + 32, 34);
    ctx.font = font(12); ctx.fillStyle = '#4a2a7a'; ctx.textAlign = 'center'; ctx.fillText(c.name, cx + cw / 2, cy + 76); ctx.font = font(10, false); ctx.fillStyle = '#6a5a8a'; wrapText(c.d, cx + cw / 2, cy + 94, cw - 14, 12);
    const owned = pk(c.id); if (owned > 0) { ctx.fillStyle = '#a8265f'; ctx.font = font(10); ctx.fillText('owned x' + owned, cx + cw / 2, cy + ch - 8); }
    hitRect(cx, cy, cw, ch, () => pickCard(i));
  }
}
function wrapText(txt, cx, y, maxW, lh) { const words = txt.split(' '); let line = '', yy = y; for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, cx, yy); line = w; yy += lh; } else line = test; } if (line) ctx.fillText(line, cx, yy); return yy; }
function drawTitle() {
  const cx = vw / 2, t = S.t, u = Math.min(1.15, vh / 800);
  const bg = ctx.createLinearGradient(0, 0, 0, vh); bg.addColorStop(0, 'rgba(70,40,150,0.88)'); bg.addColorStop(0.55, 'rgba(120,70,190,0.7)'); bg.addColorStop(1, 'rgba(30,16,70,0.9)'); ctx.fillStyle = bg; ctx.fillRect(0, 0, vw, vh);
  const sp = ctx.createRadialGradient(cx, vh * 0.58, 10, cx, vh * 0.58, Math.min(vw, vh) * 0.65); sp.addColorStop(0, 'rgba(255,233,168,0.55)'); sp.addColorStop(1, 'rgba(255,233,168,0)'); ctx.fillStyle = sp; ctx.fillRect(0, 0, vw, vh);
  ctx.save(); ctx.globalAlpha = 0.10; ctx.fillStyle = '#fff4c0'; for (const [bx, w] of [[0.22, 70], [0.5, 90], [0.78, 70]]) { ctx.beginPath(); ctx.moveTo(vw * bx - 8, -10); ctx.lineTo(vw * bx + 8, -10); ctx.lineTo(vw * bx + w + Math.sin(t * 0.6 + bx * 9) * 14, vh * 0.8); ctx.lineTo(vw * bx - w + Math.sin(t * 0.6 + bx * 9) * 14, vh * 0.8); ctx.fill(); } ctx.restore();
  for (let i = 0; i <= 14; i++) { const x = (i / 14) * vw, y = 12 + Math.sin((i / 14) * Math.PI) * 26; ctx.fillStyle = [HV.pink, HV.green, HV.gold, HV.violet][i % 4]; ctx.strokeStyle = HV.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.lineTo(x, y + 18 + Math.sin(t * 2 + i) * 1.5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; for (let i = 0; i < 9; i++) { const ph = (t * 0.09 + i / 9) % 1, x = vw * (0.08 + 0.84 * ((i * 0.381) % 1)) + Math.sin(t * 0.9 + i) * 16, y = vh * (0.95 - ph * 0.9); ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.5; ctx.fillStyle = [HV.pink, '#9af0b4', HV.gold][i % 3]; (fillRaw || ctx.fillText).call(ctx, i % 3 ? '♪' : '♫', x, y); } ctx.globalAlpha = 1;
  const fs = Math.min(70, vw / 5.6), ty = vh * 0.19, bounce = Math.sin(t * 2.4) * 3;
  stickerText('ENCORE', cx, ty + bounce, fs, '#ffc9de', '#ff5fa6', -0.04); stickerText('ISLAND', cx, ty + fs * 0.98 - bounce, fs, '#d9fff0', '#35c46a', 0.03);
  labelPill('the loop continues', cx, ty + fs * 1.62, '#ffe98a', '#f0b422', 13);
  const bf = (i) => ((t * 5 + i) | 0);
  artDraw('kappa', 'idle', bf(1), cx - 132 * u, vh * 0.69, 0.78 * u, false); artDraw('oni_cub', 'idle', bf(2), cx + 136 * u, vh * 0.69, 0.78 * u, true);
  artDraw('roxor', 'idle', bf(0), cx + 54 * u, vh * 0.7, 1.25 * u, true); artDraw('jasmin', 'idle', bf(2), cx - 54 * u, vh * 0.72, 1.3 * u, false);
  const lines = ['Defeat the Soundlands critters, sell their helmets,', 'stack the coins, grow a glittering island —', 'and keep the beat for the loudest ENCORE.'];
  const ly = vh * 0.765, lw = Math.min(vw - 32, 360); plaque(cx - lw / 2, ly, lw, 74, 16); ctx.fillStyle = HV.cream; ctx.font = font(13, false); ctx.textAlign = 'center'; lines.forEach((l, i) => ctx.fillText(l, cx, ly + 22 + i * 18));
  const pulse = 1 + Math.sin(t * 4) * 0.05; ctx.save(); ctx.translate(cx, vh * 0.92); ctx.scale(pulse, pulse); pill(-120, -28, 240, 56, '#ff9ac8', '#f0599a'); ctx.fillStyle = '#fff'; ctx.font = font(24); ctx.textAlign = 'center'; ctx.fillText('TAP TO PLAY', 0, 9); ctx.restore();
}
function drawHudTop() {
  if (!S.started) return;
  drawPlayerCard(); drawRankPill(); drawMinimap(); drawCombo();
  if (!S.sheet && !S.modal) drawGuide();
}
function drawHudBottom() {
  if (!S.started) return;
  const sheetOpen = !!S.sheet, dockY = vh - DOCK_H - 6;
  if (!S.cards) { if (!sheetOpen) { drawGroove(dockY - 32); drawActionButtons(dockY - 84); } drawDock(); }
  drawToasts(); drawCardsDraft();
  if (S.goldPulse > 0) { ctx.strokeStyle = 'rgba(255,217,74,' + S.goldPulse * 0.9 + ')'; ctx.lineWidth = 10; rr(5, 5, vw - 10, vh - 10, 18); ctx.stroke(); }
  if (S.offlineMsg > 0 && S.offlineAmt > 0) { plaque(vw / 2 - 150, 100, 300, 50, 12); ctx.fillStyle = '#ffd94a'; ctx.font = font(14); ctx.textAlign = 'center'; ctx.fillText('While you were away…', vw / 2, 120); ctx.fillText('+' + fmt(S.offlineAmt) + ' coins piled up in the Vault!', vw / 2, 140); }
  if (S.stick && !sheetOpen) { ctx.globalAlpha = 0.4; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(S.stick.ax, S.stick.ay, 46, 0, TAU); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(S.stick.ax + S.stick.dx * 42, S.stick.ay + S.stick.dy * 42, 20, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
}

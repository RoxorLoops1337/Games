'use strict';
// Encore Island — actors, effects, and the main world draw (camera, culling, y-sorting).
function heroArtName(skin) { return (skin || activeSkin()).art; }
function drawHero() {
  const p = S.player, sk = activeSkin(), nm = sk.art, hk = 0.62;
  const bob = p.moving ? Math.abs(Math.sin(S.t * 12)) * 2 : 0;
  if (sk.glow) { ctx.fillStyle = 'rgba(255,217,74,' + (0.2 + Math.sin(S.t * 3) * 0.07) + ')'; ctx.beginPath(); ctx.ellipse(p.x, p.y - 40, 40, 58, 0, 0, TAU); ctx.fill(); }
  if (encoreOn()) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gl = ctx.createRadialGradient(p.x, p.y - 36, 6, p.x, p.y - 36, 84); gl.addColorStop(0, 'rgba(255,126,182,0.55)'); gl.addColorStop(1, 'rgba(255,126,182,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p.x, p.y - 36, 84, 0, TAU); ctx.fill(); ctx.restore(); }
  shadow(p.x, p.y + 4, 24, 0.3);
  if (p.invuln > 0 && ((S.t * 14) | 0) % 2) ctx.globalAlpha = 0.5;
  const ult = S.ultCasting > 0, cheer = (p.cheerT || 0) > 0, hur = p.hurtT > 0, atk = p.atkT > 0;
  const anim = hur ? 'hurt' : ult ? 'cast' : cheer ? 'cheer' : atk ? 'attack' : p.moving ? 'walk' : 'idle';
  const fr = hur ? 0 : ult ? Math.min(3, ((1.4 - S.ultCasting) * 5) | 0) : cheer ? (S.t * 8) | 0 : atk ? Math.min(3, ((0.4 - p.atkT) * 10) | 0) : p.moving ? (S.t * 12) | 0 : (S.t * 5) | 0;
  const sq = 1 + Math.sin(beatNow() * TAU) * 0.012;
  if (!artDraw(nm, anim, fr, p.x, p.y + 4 - bob, hk, p.face < 0)) { ctx.fillStyle = '#ff9ac8'; rr(p.x - 11, p.y - 40, 22, 40, 8); ctx.fill(); }
  ctx.globalAlpha = 1;
  const fm = flowMul(); if (S.flowKey !== null && fm >= 2) { const pu = 1 + Math.sin(S.t * 10) * 0.1; ctx.save(); ctx.translate(p.x + 34, p.y - 56 - bob); ctx.scale(pu, pu); ctx.fillStyle = '#ffd94a'; ctx.font = font(15); ctx.textAlign = 'left'; ctx.fillText('x' + fmt(Math.round(fm)), 0, 0); ctx.restore(); }
}
function drawCompanion() {
  const c = S.comp, nm = activeSkin().comp, bob = (c.mv || 0) > 0 ? Math.abs(Math.sin(S.t * 12)) * 2 : 0;
  shadow(c.x, c.y + 4, 20, 0.28);
  const anim = (c.drop || 0) > 0 ? 'attack' : (c.mv || 0) > 0 ? 'walk' : 'idle', fr = (c.drop || 0) > 0 ? Math.min(3, ((0.35 - c.drop) * 11) | 0) : (c.mv || 0) > 0 ? (S.t * 12) | 0 : (S.t * 5 + 2) | 0;
  artDraw(nm, anim, fr, c.x, c.y + 4 - bob, 0.54, c.face < 0);
  // RoxorLoops hauls the loot: the stack rides on the companion's back (Jasmin just sings and fights)
  const lean = -c.face * 15;
  for (let i = 0; i < S.player.helmets.length; i++) { const sway = Math.sin(S.t * 5 + i * 0.8) * (0.5 + i * 0.4) * (((c.mv || 0) > 0) ? 1.6 : 0.6); drawStackEntry(S.player.helmets[i], c.x + lean + sway, c.y - 40 - bob - i * 9, 1.0); }
  if (S.player.helmets.length) labelPill(S.player.helmets.length + '/' + cap(), c.x + lean, c.y - 54 - bob - S.player.helmets.length * 9, S.player.helmets.length >= cap() ? '#ffe98a' : '#ffffff', S.player.helmets.length >= cap() ? '#f0b422' : '#dccaff', 11);
}
function drawFoe(e) {
  const k = e.r * (e.boss ? 4.4 : 5.2) / (e.boss ? 178 : 128), nm = foeArtName(e.k, e.boss), bob = Math.abs(Math.sin(S.t * 7 + e.sway)) * 2.2;
  const grow = easeBack(clamp(e.born, 0, 1)) * 0.6 + 0.4 * e.born;
  shadow(e.x, e.y + e.r * 0.78, e.r * 1.05, 0.3);
  if (e.elite) { const gl = 0.4 + Math.sin(S.t * 5) * 0.25; ctx.fillStyle = 'rgba(255,215,90,' + gl * 0.4 + ')'; ctx.beginPath(); ctx.ellipse(e.x, e.y - e.r * 0.8, e.r + 12, e.r * 1.6, 0, 0, TAU); ctx.fill(); }
  if (e.gold) { ctx.fillStyle = 'rgba(255,217,74,0.35)'; ctx.beginPath(); ctx.ellipse(e.x, e.y - e.r * 0.8, e.r * 1.1, e.r * 1.6, 0, 0, TAU); ctx.fill(); }
  const sq = e.hurt > 0 ? 1 + e.hurt * 1.2 : 1, fy = e.y + e.r * 0.78 - bob * 0.5;
  ctx.save(); ctx.translate(e.x, fy); ctx.scale(grow / sq, grow * sq); ctx.translate(-e.x, -fy);
  const anim = e.hurt > 0 ? 'hurt' : e.atkCd > 0.55 ? 'attack' : 'idle', fr = e.hurt > 0 ? 0 : e.atkCd > 0.55 ? (S.t * 8) | 0 : ((S.t * 4 + e.sway) | 0);
  const ok = artDraw(nm, anim, fr, e.x, fy, k, e.face > 0);
  ctx.restore();
  if (!ok) { ctx.fillStyle = foeCol(e.k); ctx.beginPath(); ctx.arc(e.x, e.y - e.r, e.r, 0, TAU); ctx.fill(); }
  if (e.elite) drawIcon('star', e.x, e.y - e.r * 3.9, 24);
  if (e.hp < e.max) { const f = e.hp / e.max, w = e.boss ? 74 : 40, by = e.y - e.r * (e.boss ? 4.2 : 3.6) - bob; ctx.fillStyle = 'rgba(58,26,58,0.8)'; rr(e.x - w / 2 - 1.5, by - 1.5, w + 3, (e.boss ? 9 : 6) + 3, 4); ctx.fill(); ctx.fillStyle = f > 0.4 ? '#7fe36a' : '#ff6a8a'; rr(e.x - w / 2, by, Math.max(3, w * f), e.boss ? 9 : 6, 3); ctx.fill(); }
  if (e.boss) labelPill(BOSS_NAMES[foeAct(e.k)], e.x, e.y - e.r * 4.9, '#ffb0c0', '#ff5a7a', 12);
}
function drawDeadFoe(d) {
  const u = d.t / 0.7, k = d.r * (d.boss ? 4.4 : 5.2) / (d.boss ? 178 : 128), nm = foeArtName(d.k, d.boss), fr = u < 0.32 ? 0 : u < 0.55 ? 1 : 2;
  artDraw(nm, 'die', fr, d.x, d.y + d.r * 0.78, k * (fr === 2 ? 1.1 + u * 0.4 : 1), d.face > 0, clamp(1.3 - u, 0, 1));
}
function drawFan(f) {
  const bob = f.mv > 0 ? Math.abs(Math.sin(S.t * 12 + f.ph)) * 2 : 0; shadow(f.x, f.y + 3, 13, 0.28);
  ctx.strokeStyle = f.role === 'fight' ? '#7fe36a' : '#6ac8ff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(f.x, f.y + 2, 11, 4, 0, 0, TAU); ctx.stroke();
  const anim = (f.atkT || 0) > 0 ? 'attack' : f.mv > 0 ? 'walk' : 'idle', fr = (f.atkT || 0) > 0 ? ((0.3 - f.atkT) * 12) | 0 : f.mv > 0 ? (S.t * 11 + f.ph * 3) | 0 : (S.t * 4 + f.ph * 3) | 0;
  artDraw(f.art, anim, fr, f.x, f.y + 3 - bob * 0.5, 0.34, f.face < 0);
  for (let i = 0; i < f.carry.length; i++) drawStackEntry(f.carry[i], f.x + Math.sin(S.t * 6 + i) * 1.4, f.y - 44 - bob - i * 6, 0.75);
}
function drawItemWorld(it) {
  const rar = it.gem || it.crown ? 3 : it.bar ? 2 : (it.k >= 7 ? 3 : it.k >= 4 ? 2 : 1), wob = Math.sin(S.t * 3 + it.x) * 1.5, air = it.t < 0.45;
  const col = it.gem ? '#6ee0d8' : it.crown ? '#ffd84d' : METALS[((it.k || 1) - 1) % 8].col;
  shadow(it.x, it.y + 8, air ? 6 : 10 + Math.sin(S.t * 3 + it.x) * 0.8, 0.28);
  if (rar >= 2 && !air) {
    const bh = 54 + rar * 12, pl = 0.7 + 0.3 * Math.sin(S.t * 4 + it.x), bg = ctx.createLinearGradient(0, it.y - bh, 0, it.y + 6); bg.addColorStop(0, 'rgba(255,255,255,0)'); bg.addColorStop(1, col);
    ctx.save(); ctx.globalAlpha = 0.34 * pl; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(it.x - 3, it.y - bh); ctx.lineTo(it.x + 3, it.y - bh); ctx.lineTo(it.x + 10, it.y + 6); ctx.lineTo(it.x - 10, it.y + 6); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.5 * pl; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(it.x, it.y + 6, 14 + Math.sin(S.t * 5) * 2, 5, 0, 0, TAU); ctx.stroke(); ctx.restore();
  }
  let sx = 1, sy = 1, lift = wob;
  if (!air) { const lt = it.t - 0.45; if (lt < 0.22) { const k2 = Math.sin(lt / 0.22 * Math.PI); sx = 1 + 0.28 * k2; sy = 1 - 0.28 * k2; } lift = wob - Math.abs(Math.sin(S.t * 2.6 + it.x)) * (rar > 1 ? 3 : 1.5); }
  ctx.save(); ctx.translate(it.x, it.y + 8); ctx.scale(sx, sy);
  if (it.gem) drawGemIcon(0, -12 + lift, 1.25); else drawStackEntry(it, 0, -12 + lift, 1.15);
  ctx.restore();
  if (rar >= 1 && !air) { const ph = ((S.t * 2 + it.x) % 3) / 0.35; if (ph < 1) spark(it.x + 8, it.y - 16, 5 * Math.sin(ph * Math.PI), 0.9); }
}
function drawChest(c) {
  const bob = Math.sin(S.t * 3) * 2.5, pl = 0.5 + 0.5 * Math.sin(S.t * 4); shadow(c.x, c.y + 18, 26, 0.28);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let r = 0; r < 8; r++) { const a = S.t * 0.6 + r * 0.785; ctx.globalAlpha = 0.16 + 0.1 * pl; ctx.fillStyle = '#ffe98a'; ctx.beginPath(); ctx.moveTo(c.x, c.y - 6 + bob); ctx.lineTo(c.x + Math.cos(a - 0.1) * 70, c.y - 6 + bob + Math.sin(a - 0.1) * 70); ctx.lineTo(c.x + Math.cos(a + 0.1) * 70, c.y - 6 + bob + Math.sin(a + 0.1) * 70); ctx.closePath(); ctx.fill(); }
  ctx.restore(); drawIcon('chest', c.x, c.y - 6 + bob, 62);
}
function drawShots() {
  for (const sh of S.shots) {
    if (!vis(sh.x, sh.y, 40)) continue;
    if (sh.boulder) { ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(sh.x, sh.y, 12, 0, TAU); ctx.fill(); ctx.fillStyle = '#a77bff'; ctx.beginPath(); ctx.arc(sh.x, sh.y, 9, 0, TAU); ctx.fill(); drawIcon('groove', sh.x, sh.y, 14); continue; }
    const wob = Math.sin(S.t * 18 + sh.x * 0.1) * 0.25, nc = sh.crit ? '#ff9a2e' : sh.ally ? '#3fcf6a' : sh.tower ? '#a77bff' : '#ff7eb6', sz = sh.crit ? 1.4 : 1;
    ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(wob); ctx.scale(sz, sz);
    ctx.fillStyle = HV.line; ctx.beginPath(); ctx.ellipse(-2, 5, 7.5, 5.5, -0.4, 0, TAU); ctx.fill(); ctx.fillRect(3.2, -13, 4.6, 18); ctx.beginPath(); ctx.moveTo(3.2, -13); ctx.quadraticCurveTo(14, -8, 12, 2); ctx.lineTo(7.6, -2); ctx.lineTo(7.6, -13); ctx.fill();
    ctx.fillStyle = nc; ctx.beginPath(); ctx.ellipse(-2, 5, 5.2, 3.5, -0.4, 0, TAU); ctx.fill(); ctx.fillRect(4, -12, 2.5, 16); ctx.beginPath(); ctx.moveTo(4, -12); ctx.quadraticCurveTo(11, -8, 9.5, -1); ctx.lineTo(6.5, -4); ctx.lineTo(6.5, -12); ctx.fill();
    ctx.restore();
  }
  for (const es of S.eshots) { if (!vis(es.x, es.y, 40)) continue; const er = es.big ? 11 : 7; ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(es.x, es.y, er + 2, 0, TAU); ctx.fill(); ctx.fillStyle = foeCol(es.k); ctx.beginPath(); ctx.arc(es.x, es.y, er, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(es.x - er * 0.3, es.y - er * 0.3, er * 0.4, 0, TAU); ctx.fill(); }
}
function drawFly() {
  for (const f of S.fly) {
    const u = (f.t - f.delay) / f.dur; if (u < 0) continue;
    const e = easeInOut(clamp(u, 0, 1)), x = f.x0 + (f.x1 - f.x0) * e, y = f.y0 + (f.y1 - f.y0) * e - Math.sin(e * Math.PI) * f.arc;
    if (!vis(x, y, 60)) continue;
    for (let g = 3; g >= 1; g--) { const ue = Math.max(0, e - g * 0.07), tx = f.x0 + (f.x1 - f.x0) * ue, ty = f.y0 + (f.y1 - f.y0) * ue - Math.sin(ue * Math.PI) * f.arc; ctx.globalAlpha = 0.16 * (4 - g); ctx.fillStyle = f.kind === 'gem' ? '#8ff6ee' : '#ffe98a'; ctx.beginPath(); ctx.arc(tx, ty, 4.5 - g * 0.8, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1; const shrink = 1 - 0.35 * e;
    if (f.kind === 'coin') { ctx.save(); ctx.translate(x, y); ctx.scale(Math.cos(f.spin * f.t * 3), 1); drawIcon('coin', 0, 0, 24 * shrink); ctx.restore(); }
    else if (f.kind === 'gem') drawGemIcon(x, y, 1 * shrink); else if (f.entry) drawStackEntry(f.entry, x, y, 0.95 * shrink);
  }
  ctx.globalAlpha = 1;
}
function drawFx() {
  for (const q of S.fx) {
    const f = 1 - q.t / q.dur;
    if (q.kind === 'zap') { ctx.strokeStyle = 'rgba(190,150,255,' + f + ')'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.beginPath(); for (let i = 0; i < q.pts.length; i++) { const pt = q.pts[i], jx = i === 0 ? 0 : (vrnd() - 0.5) * 14, jy = i === 0 ? 0 : (vrnd() - 0.5) * 14; if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x + jx, pt.y + jy); } ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,' + f + ')'; ctx.lineWidth = 1.6; ctx.stroke(); }
    else if (q.kind === 'ring') { const u = q.t / q.dur, r0 = q.r * (0.25 + 0.75 * easeOut(u)); ctx.globalAlpha = Math.max(0, f); ctx.lineWidth = 7 * f + 1; ctx.strokeStyle = q.col; ctx.beginPath(); ctx.arc(q.x, q.y, r0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (q.kind === 'boom') { ctx.strokeStyle = 'rgba(255,126,182,' + f + ')'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1 - f * 0.6), 0, TAU); ctx.stroke(); }
  }
  if (S.settings.particles) for (const q of S.parts) {
    if (!vis(q.x, q.y, 20)) continue; ctx.globalAlpha = 1 - q.t / q.dur; ctx.fillStyle = q.color;
    if (q.star) { const r = q.r * (0.6 + 0.4 * (1 - q.t / q.dur)); ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.t * 6); ctx.beginPath(); ctx.moveTo(0, -r * 1.6); ctx.lineTo(r * 0.4, -r * 0.4); ctx.lineTo(r * 1.6, 0); ctx.lineTo(r * 0.4, r * 0.4); ctx.lineTo(0, r * 1.6); ctx.lineTo(-r * 0.4, r * 0.4); ctx.lineTo(-r * 1.6, 0); ctx.lineTo(-r * 0.4, -r * 0.4); ctx.closePath(); ctx.fill(); ctx.restore(); }
    else if (q.r >= 3) { ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 0.6, 0, TAU); ctx.fill(); } else ctx.fillRect(q.x - q.r / 2, q.y - q.r / 2, q.r, q.r);
  }
  ctx.globalAlpha = 1;
}
const HIT_WORDS = ['POW!', 'BAM!', 'ZAP!', 'BOP!'];
function drawFloats() {
  for (const f of S.floats) {
    const life = f.big ? 1.6 : 0.8; ctx.globalAlpha = Math.min(1, 3 * (1 - f.t / life));
    if (f.crit) { const pop = 1 + Math.max(0, 0.14 - f.t) * 7, sz = 24 * pop; ctx.save(); ctx.translate(f.x, f.y); ctx.font = font(sz); ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(45,23,15,0.9)'; ctx.strokeText(f.txt, 0, 0); ctx.fillStyle = '#fff2b0'; (fillRaw || ctx.fillText).call(ctx, f.txt, 0, 0); ctx.fillStyle = '#ff7eb6'; ctx.font = font(sz * 0.5); ctx.rotate(-0.12); ctx.fillText(HIT_WORDS[Math.abs((f.x * 7 + f.y * 3) | 0) % 4], 0, -sz * 0.78); ctx.restore(); }
    else {
      const pop = 1 + Math.max(0, 0.12 - f.t) * 5; ctx.save(); ctx.translate(f.x, f.y); ctx.scale(pop, pop); ctx.font = font(f.big ? 20 : 14); ctx.textAlign = 'center';
      const coinF = f.txt[0] === '+' && f.color === '#ffd94a'; if (coinF) { const tw = ctx.measureText(f.txt).width; drawIcon('coin', -tw / 2 - 11, -5, f.big ? 22 : 18); ctx.translate(9, 0); }
      ctx.fillStyle = f.color; ctx.fillText(f.txt, 0, 0); ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}
// ---- the world pass ----
function drawWorld() {
  const n = S.lands.length, lands = [];
  for (let k = 1; k <= n; k++) lands.push(S.lands[k - 1]);
  const all = [HUB_GEO].concat(lands.map(z => z.g));
  for (const g of all) if (landVisible(g)) drawIslandBase(g, g.k === 0 ? BIOMES[0] : biomeOf(g.k));
  drawPaths(n);
  for (const g of all) if (landVisible(g)) drawIslandTop(g, g.k === 0 ? BIOMES[0] : biomeOf(g.k), g.k === 0 ? 0 : (g.k - 1) % 8, g.k === 0 ? undefined : S.lands[g.k - 1].born);
  drawMist(n + 1);
  if (landVisible(HUB_GEO)) { drawHubFloor(); }
  for (const z of lands) if (landVisible(z.g)) drawDen(z);
  // ground-level furniture
  if (landVisible(HUB_GEO)) { drawHubSign(); drawHubPlates(); drawUnlockPlate(); }
  else drawUnlockPlate();
  for (const z of lands) if (landVisible(z.g)) drawLandPlates(z);
  // y-sorted actors
  const A = [];
  const add = (y, f) => A.push({ y, f });
  if (landVisible(HUB_GEO)) {
    add(SELL.y + 30, drawStall); add(VAULT.y + 30, drawVault); add(MONU.y + 30, drawMonument); add(FORGE.y + 40, drawForgeArea);
    for (const l of HUBLAMPS) if (vis(l.x, l.y, 90)) add(l.y, () => drawLamp(l));
    for (const d of HUBDECOR) if (vis(d.x, d.y, 80)) add(d.y, () => drawProp(d, BIOMES[0], 0));
  }
  for (const z of lands) if (landVisible(z.g)) {
    const bi = (z.k - 1) % 8, B = BIOMES[bi];
    for (const d of decorOf(z.g)) if (vis(d.x, d.y, 80)) add(d.y, () => drawProp(d, B, bi));
    for (const tw of z.towers) add(tw.y + 30, () => drawTower(tw));
  }
  for (const it of S.items) if (vis(it.x, it.y, 60)) add(it.y, () => drawItemWorld(it));
  for (const e of S.enemies) if (vis(e.x, e.y, 120)) add(e.y, () => drawFoe(e));
  for (const d of S.dead) if (vis(d.x, d.y, 120)) add(d.y, () => drawDeadFoe(d));
  for (const f of S.pop) if (vis(f.x, f.y, 80)) add(f.y, () => drawFan(f));
  if (S.chest && vis(S.chest.x, S.chest.y, 80)) add(S.chest.y, () => drawChest(S.chest));
  add(S.comp.y, drawCompanion); add(S.player.y, drawHero);
  A.sort((a, b) => a.y - b.y); for (const a of A) a.f();
  drawUnlockBanner();
  drawShots(); drawFly(); drawFx(); drawFloats();
}

// drifting petals/leaves in screen space — pure ambience, biome tinted
function drawPetals() {
  const kk = nearestLandIdx(CAM.x, CAM.y), B = kk === 0 ? BIOMES[0] : biomeOf(kk), cols = [B.flowers[1], B.flowers[2], B.tree[0], '#ffffff'];
  ctx.save();
  for (let i = 0; i < 16; i++) {
    const ph = (S.t * (0.045 + (i % 5) * 0.008) + i * 0.137) % 1, x = vw * (((i * 0.6180339) % 1) + 0.06 * Math.sin(S.t * 0.7 + i)) - ph * 60 + 30, y = -20 + ph * (vh + 40), rot = S.t * 1.3 + i;
    ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.55; ctx.fillStyle = cols[i % 4]; ctx.save(); ctx.translate(((x % vw) + vw) % vw, y); ctx.rotate(rot); ctx.scale(1, 0.55 + 0.45 * Math.sin(S.t * 2 + i)); ctx.beginPath(); ctx.ellipse(0, 0, 6, 3.2, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}

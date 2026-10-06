'use strict';
// Encore Island — boot, camera, main draw, game loop, autosave. Exposes window.EI for tests.
let cvs = null, sclBase = 1;
const ZOOM = { k: 1 };
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1); vw = window.innerWidth; vh = window.innerHeight;
  cvs.width = Math.round(vw * dpr); cvs.height = Math.round(vh * dpr); cvs.style.width = vw + 'px'; cvs.style.height = vh + 'px';
  sclBase = clamp(Math.min(vw / 620, vh / 880), 0.5, 1.45); scl = sclBase * ZOOM.k;
}
function updateCamera(dt) {
  const inHub = landAt(S.player.x, S.player.y, S.lands.length) <= 0; ZOOM.k += ((inHub ? 0.8 : 1) - ZOOM.k) * Math.min(1, dt * 3); scl = sclBase * ZOOM.k;
  const p = S.player, tx = p.x + p.vx * 0.28, ty = p.y + p.vy * 0.2 - 30;
  if (!CAM.init) { CAM.x = tx; CAM.y = ty; CAM.init = true; }
  const k = Math.min(1, dt * 5.5); CAM.x += (tx - CAM.x) * k; CAM.y += (ty - CAM.y) * k;
}
function drawVignette() {
  if (JUICE.flash > 0) { ctx.fillStyle = 'rgba(255,240,170,' + (JUICE.flash * 0.45) + ')'; ctx.fillRect(0, 0, vw, vh); JUICE.flash = Math.max(0, JUICE.flash - 0.03); }
  const r = Math.hypot(vw, vh) * 0.62, g = ctx.createRadialGradient(vw / 2, vh * 0.46, r * 0.45, vw / 2, vh * 0.46, r); g.addColorStop(0, 'rgba(60,30,120,0)'); g.addColorStop(1, 'rgba(60,30,120,0.24)'); ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
  const t = ctx.createLinearGradient(0, 0, 0, vh * 0.4); t.addColorStop(0, 'rgba(255,240,200,0.12)'); t.addColorStop(1, 'rgba(255,240,200,0)'); ctx.fillStyle = t; ctx.fillRect(0, 0, vw, vh * 0.4);
}
function draw(dt) {
  hits = []; PLATE_POS.length = 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateCamera(dt || 0.016);
  drawWater();
  ctx.save();
  const shk = JUICE.shake > 0 && S.settings.shake, sx = shk ? (vrnd() - 0.5) * JUICE.shake : 0, sy = shk ? (vrnd() - 0.5) * JUICE.shake : 0; JUICE.shake = Math.max(0, JUICE.shake - (dt || 0.016) * 22);
  const oy = vh * 0.46; ctx.translate(vw / 2 + sx, oy + sy); ctx.scale(scl, scl); ctx.translate(-CAM.x, -CAM.y);
  vL = CAM.x - vw / 2 / scl - 120; vR = CAM.x + vw / 2 / scl + 120; vT = CAM.y - oy / scl - 120; vB = CAM.y + (vh - oy) / scl + 120;
  drawWorld(); ctx.restore();
  if (S.settings.particles) drawPetals();
  drawVignette();
  if (!S.started) { drawTitle(); return; }
  if (S.cards) S.sheet = null;
  drawHudTop(); drawSheet(); drawHudBottom(); drawModal();
}
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ts - (frame.last || ts)) / 1000 || 0.016); frame.last = ts;
  keyStick(); tick(dt); draw(dt);
}
let saveCd = 10;
function autosave(dt) { saveCd -= dt; if (S.started && saveCd <= 0) { saveCd = 10; save(); } }
function boot() {
  cvs = document.getElementById('game'); setupCtx(cvs.getContext('2d')); resize(); window.addEventListener('resize', resize);
  initGame(true); S.t = 0; loadArt();
  cvs.addEventListener('pointerdown', onDown); cvs.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', (e) => onKey(e, true)); window.addEventListener('keyup', (e) => onKey(e, false));
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.started) save(); });
  window.addEventListener('beforeunload', () => { if (S.started) save(); });
  setInterval(() => autosave(1), 1000);
  requestAnimationFrame(frame);
}
if (typeof window.__EI_HEADLESS__ === 'undefined') boot();
window.EI = { get S() { return S; }, set S(v) { S = v; }, initGame, newState, tick, draw, save, loadSave, serialize, applySave, resetAll, setupCtx, resize, tickFx, boot,
  fmt, rnd, seedMain, hash01, walkable, landAt, genLand, geoOf, radiusAt, routeBetween, openNextLand, addLand, spawnEnemy, killEnemy, hurtEnemy, dropItem, pay, prestige, recruit, buyHouse, setFans, hatchEgg, spinWheel, claimLogin, castUlt, dashAbility, petAbility, buySkin, buyCperk, pickCard, drawCards, grantXp, startEncore, questEvent, openSheet, closeSheet, guideTarget,
  helmVal, foeHp, unlockCost, bcost, foeName, foeArtName, metal, entryVal, coinMul, pDmg, pRate, cap, popCap, flowMul, crownsToGain, BIOMES, SKINS, PETS, CARDS, ACH, QDEFS, UPG, GEMU, UPG_POS, GEM_POS, SELL, VAULT, FORGE, TRAY, STAGE, MONU, HUB_GEO, LAND_GEO, hits: () => hits };

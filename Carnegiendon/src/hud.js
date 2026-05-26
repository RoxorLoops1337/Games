// All DOM/HUD updates live here. Game state is read-only as far as HUD
// is concerned.
const HUD = (() => {
  const el = (id) => document.getElementById(id);

  const time = el("hud-time");
  const score = el("hud-score");
  const kills = el("hud-kills");
  const combo = el("hud-combo");
  const hpFill = el("hp-fill");
  const nitroFill = el("nitro-fill");
  const speedoText = el("speedo-text");
  const speedoArc = el("speedo-arc");
  const speedoNeedle = el("speedo-needle");
  const minimap = el("minimap");
  const minimapCtx = minimap.getContext("2d");
  const powerupList = el("powerup-list");
  const comboPopup = el("combo-popup");
  const bigMessage = el("big-message");

  function update(state) {
    time.textContent = U.formatTime(state.timeLeft);
    score.textContent = state.score.toLocaleString();
    kills.textContent = state.kills;
    combo.textContent = "x" + state.combo;

    const hpPct = U.clamp(state.player.car.hp / state.player.car.maxHp, 0, 1);
    hpFill.style.width = (hpPct * 100) + "%";
    hpFill.style.background = hpPct > 0.4
      ? "linear-gradient(90deg, #ff0000, #ff8800)"
      : "linear-gradient(90deg, #ff0000, #ff4444)";

    const np = U.clamp(state.player.nitro / state.player.maxNitro, 0, 1);
    nitroFill.style.width = (np * 100) + "%";

    const mph = U.toMph(state.player.car.speed);
    speedoText.textContent = Math.abs(Math.round(mph)) + " MPH";
    const sp01 = U.clamp(Math.abs(state.player.car.speed) / 760, 0, 1);
    speedoArc.style.strokeDashoffset = (160 * (1 - sp01)).toFixed(1);
    // needle: -90deg = idle (pointing up), +90deg = max
    const deg = -90 + sp01 * 180;
    speedoNeedle.setAttribute("transform", `rotate(${deg} 60 60)`);

    // power-up list
    const active = [];
    if (state.player.nitroActive) active.push("NITRO");
    if (state.player.powerups.spike > 0)     active.push(`SPIKES ${state.player.powerups.spike.toFixed(1)}s`);
    if (state.player.powerups.bloodlust > 0) active.push(`BLOODLUST ${state.player.powerups.bloodlust.toFixed(1)}s`);
    if (state.player.powerups.armor > 0)     active.push(`ARMOR ${state.player.powerups.armor.toFixed(1)}s`);
    if (state.player.powerups.bigwheels > 0) active.push(`BIG WHEELS ${state.player.powerups.bigwheels.toFixed(1)}s`);
    if (state.player.powerups.repair > 0)    active.push(`REPAIRING ${state.player.powerups.repair.toFixed(1)}s`);
    powerupList.innerHTML = active.map(a => `<div class="powerup-active">${a}</div>`).join("");

    drawMinimap(state);
  }

  function drawMinimap(state) {
    const { w, h } = World.size();
    const W = minimap.width, H = minimap.height;
    minimapCtx.fillStyle = "#000";
    minimapCtx.fillRect(0, 0, W, H);
    const sx = W / w;
    const sy = H / h;

    // Sketch the road tiles with a light fill.
    minimapCtx.fillStyle = "#333";
    const TILE = World.size().tile;
    for (let y = 0; y < World.size().rows; y++) {
      for (let x = 0; x < World.size().cols; x++) {
        if (World.isRoadAt(x * TILE + TILE/2, y * TILE + TILE/2)) {
          minimapCtx.fillRect(x * TILE * sx, y * TILE * sy, TILE * sx, TILE * sy);
        }
      }
    }

    // Pedestrians as tiny white dots.
    minimapCtx.fillStyle = "#fff";
    for (const p of state.peds) {
      if (p.dead) continue;
      minimapCtx.fillRect(p.x * sx - 0.5, p.y * sy - 0.5, 1, 1);
    }
    // Enemies red.
    minimapCtx.fillStyle = "#f33";
    for (const e of state.enemies) {
      if (e.dead) continue;
      minimapCtx.fillRect(e.car.x * sx - 1, e.car.y * sy - 1, 3, 3);
    }
    // Power-ups gold.
    minimapCtx.fillStyle = "#ffd700";
    for (const u of state.powerups) {
      if (u.taken) continue;
      minimapCtx.fillRect(u.x * sx - 1, u.y * sy - 1, 2, 2);
    }
    // Player green.
    minimapCtx.fillStyle = "#0f0";
    const px = state.player.car.x * sx, py = state.player.car.y * sy;
    minimapCtx.fillRect(px - 2, py - 2, 4, 4);
    // Player view direction.
    minimapCtx.strokeStyle = "#0f0";
    minimapCtx.beginPath();
    minimapCtx.moveTo(px, py);
    minimapCtx.lineTo(px + Math.cos(state.player.car.angle) * 8,
                     py + Math.sin(state.player.car.angle) * 8);
    minimapCtx.stroke();

    // Border.
    minimapCtx.strokeStyle = "#a00";
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  let comboTimer = 0;
  function flashCombo(text, color = "#ff2222") {
    comboPopup.textContent = text;
    comboPopup.style.color = color;
    comboPopup.style.opacity = 1;
    comboPopup.style.transform = "translate(-50%, -50%) scale(1.4)";
    comboTimer = 0.5;
  }
  function tickCombo(dt) {
    if (comboTimer > 0) {
      comboTimer -= dt;
      const t = U.clamp(comboTimer / 0.5, 0, 1);
      comboPopup.style.opacity = t;
      comboPopup.style.transform = `translate(-50%, -50%) scale(${1 + (1-t)*0.4})`;
    } else {
      comboPopup.style.opacity = 0;
    }
  }

  let bigTimer = 0;
  function bigMsg(text, ms = 1.6) {
    bigMessage.textContent = text;
    bigMessage.style.opacity = 1;
    bigTimer = ms;
  }
  function tickBig(dt) {
    if (bigTimer > 0) {
      bigTimer -= dt;
      bigMessage.style.opacity = U.clamp(bigTimer / 0.6, 0, 1);
    }
  }

  function show(id)   { el(id).classList.remove("hidden"); }
  function hide(id)   { el(id).classList.add("hidden"); }
  function showHUD()  { el("hud").classList.remove("hidden"); }
  function hideHUD()  { el("hud").classList.add("hidden"); }

  return { update, flashCombo, tickCombo, bigMsg, tickBig, show, hide, showHUD, hideHUD };
})();

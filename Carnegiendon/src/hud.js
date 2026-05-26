// HUD updates (DOM overlay on top of the WebGL canvas). Reads game state
// each frame and shoves it into the right elements; also projects
// world-space score popups onto screen space using the active camera.
const HUD = (() => {
  const el = (id) => document.getElementById(id);

  const time = el("hud-time");
  const score = el("hud-score");
  const kills = el("hud-kills");
  const combo = el("hud-combo");
  const wanted = el("hud-wanted");
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
  const hudRoot = el("hud");

  // Cheap pool of DOM nodes for the floating "+points" popups.
  const popupPool = [];
  function getPopupEl() {
    for (const p of popupPool) if (!p._live) { p._live = true; p.style.opacity = 1; return p; }
    const d = document.createElement("div");
    d.className = "world-popup";
    d._live = true;
    hudRoot.appendChild(d);
    popupPool.push(d);
    return d;
  }

  function update(state) {
    time.textContent = U.formatTime(state.timeLeft);
    score.textContent = state.score.toLocaleString();
    kills.textContent = state.kills;
    combo.textContent = "x" + state.combo;
    const w = state.wanted ?? 0;
    wanted.textContent = "★".repeat(w) + "☆".repeat(5 - w);
    wanted.style.color = w >= 4 ? "#ff2222" : w >= 2 ? "#ff8800" : "#888";

    const hpPct = U.clamp(state.player.car.hp / state.player.car.maxHp, 0, 1);
    hpFill.style.width = (hpPct * 100) + "%";
    hpFill.style.background = hpPct > 0.4
      ? "linear-gradient(90deg, #ff0000, #ff8800)"
      : "linear-gradient(90deg, #ff0000, #ff4444)";

    const np = U.clamp(state.player.nitro / state.player.maxNitro, 0, 1);
    nitroFill.style.width = (np * 100) + "%";

    // Convert engine "units/sec" into a believable speedo reading.
    const mph = Math.abs(state.player.car.speed) * 2.5;
    speedoText.textContent = Math.round(mph) + " MPH";
    const sp01 = U.clamp(Math.abs(state.player.car.speed) / 70, 0, 1);
    speedoArc.style.strokeDashoffset = (160 * (1 - sp01)).toFixed(1);
    speedoNeedle.setAttribute("transform", `rotate(${-90 + sp01 * 180} 60 60)`);

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
    // Map world coordinate (xz centered at origin) to minimap px.
    const sx = W / w, sy = H / h;
    const tx = (x) => (x + w / 2) * sx;
    const ty = (z) => (z + h / 2) * sy;

    // Sketch roads — sample tile grid.
    minimapCtx.fillStyle = "#333";
    const { rows, cols, tile } = World.size();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cx = x * tile + tile/2 - w/2;
        const cz = y * tile + tile/2 - h/2;
        if (World.isRoadAt(cx, cz)) {
          minimapCtx.fillRect(tx(cx) - tile*sx/2, ty(cz) - tile*sy/2, tile * sx, tile * sy);
        }
      }
    }
    minimapCtx.fillStyle = "#fff";
    for (const p of state.peds) {
      if (p.dead) continue;
      minimapCtx.fillRect(tx(p.x) - 0.5, ty(p.y) - 0.5, 1, 1);
    }
    for (const e of state.enemies) {
      if (e.dead) continue;
      minimapCtx.fillStyle = e.kind === "cop" ? "#33aaff" : "#f33";
      minimapCtx.fillRect(tx(e.car.x) - 1, ty(e.car.y) - 1, 3, 3);
    }
    minimapCtx.fillStyle = "#888";
    for (const t of (state.traffic || [])) {
      if (t.dead) continue;
      minimapCtx.fillRect(tx(t.car.x) - 1, ty(t.car.y) - 1, 2, 2);
    }
    minimapCtx.fillStyle = "#ffd700";
    for (const u of state.powerups) {
      if (u.taken) continue;
      minimapCtx.fillRect(tx(u.x) - 1, ty(u.y) - 1, 2, 2);
    }
    minimapCtx.fillStyle = "#0f0";
    const ppx = tx(state.player.car.x), ppy = ty(state.player.car.y);
    minimapCtx.fillRect(ppx - 2, ppy - 2, 4, 4);
    minimapCtx.strokeStyle = "#0f0";
    minimapCtx.beginPath();
    minimapCtx.moveTo(ppx, ppy);
    minimapCtx.lineTo(ppx + Math.cos(state.player.car.angle) * 8,
                     ppy + Math.sin(state.player.car.angle) * 8);
    minimapCtx.stroke();
    minimapCtx.strokeStyle = "#a00";
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  // World-space "+score" popups: project the world point through the
  // camera and place a DOM element at the resulting screen coordinate.
  const v3 = (typeof THREE !== "undefined") ? new THREE.Vector3() : null;
  function tickPopups(dt, popups, camera) {
    if (!camera || !v3) { return; }
    // Mark all pool entries as candidates for retirement; we'll re-mark live ones.
    for (const e of popupPool) e._used = false;
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.life -= dt;
      p.y += dt * 1.5;
      if (p.life <= 0) { popups.splice(i, 1); continue; }
      v3.set(p.x, p.y, p.z);
      v3.project(camera);
      if (v3.z > 1 || v3.z < -1) continue; // behind camera or far past
      const sx = (v3.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-v3.y * 0.5 + 0.5) * window.innerHeight;
      const e = getPopupEl();
      e._used = true;
      e.textContent = p.text;
      e.style.color = p.color;
      e.style.left = sx + "px";
      e.style.top = sy + "px";
      e.style.opacity = U.clamp(p.life / 1.2, 0, 1);
    }
    for (const e of popupPool) {
      if (!e._used && e._live) { e._live = false; e.style.opacity = 0; }
    }
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

  function show(id) { el(id).classList.remove("hidden"); }
  function hide(id) { el(id).classList.add("hidden"); }
  function showHUD() { el("hud").classList.remove("hidden"); }
  function hideHUD() { el("hud").classList.add("hidden"); }

  return { update, flashCombo, tickCombo, bigMsg, tickBig, tickPopups, show, hide, showHUD, hideHUD };
})();

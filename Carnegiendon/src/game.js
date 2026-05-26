// Game orchestration: state machine, main loop, collisions, scoring.
const Game = (() => {
  const STATE = { MENU: "menu", PLAYING: "playing", PAUSED: "paused", GAMEOVER: "gameover", VICTORY: "victory" };

  let canvas, ctx;
  let state = STATE.MENU;
  let mode = "carnage";
  let levelIndex = 0;

  // Game state container — read by HUD via the `state.*` shape it expects.
  let G = null;

  // Camera tracks the player with a bit of look-ahead.
  let cam = { x: 0, y: 0, shake: 0 };

  // Slow-motion multiplier (1 = normal). Decays back to 1.
  let timeScale = 1;

  // Score popups in world space (separate from particles for legibility).
  let popups = [];

  function pushPopup(x, y, text, color) {
    popups.push({ x, y, text, color, life: 1.2, vy: -40 });
  }

  function loadHighScores() {
    try {
      const raw = localStorage.getItem("carnegiendon-hi");
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { score: 0, kills: 0 };
  }
  function saveHighScores(hi) {
    try { localStorage.setItem("carnegiendon-hi", JSON.stringify(hi)); } catch (e) {}
  }

  function start(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    fitCanvas();
    window.addEventListener("resize", fitCanvas);

    const hi = loadHighScores();
    document.getElementById("hi-score").textContent = hi.score.toLocaleString();
    document.getElementById("hi-kills").textContent = hi.kills.toString();

    requestAnimationFrame(loop);
  }

  function fitCanvas() {
    // Render at a fixed virtual resolution scaled to fit the viewport.
    const ratio = Math.min(window.innerWidth / 1024, window.innerHeight / 640);
    canvas.style.width = (1024 * ratio) + "px";
    canvas.style.height = (640 * ratio) + "px";
  }

  function newGame(selectedMode) {
    mode = selectedMode;
    levelIndex = 0;
    setupLevel(0);
    state = STATE.PLAYING;
    HUD.hide("menu");
    HUD.hide("gameover");
    HUD.hide("victory");
    HUD.hide("pause");
    HUD.showHUD();
    Audio.init();
    Audio.resume();
    Audio.startEngine();
    Audio.startMusic();
    const intro = mode === "carnage"  ? `KILL ${G.targetKills} TO ESCAPE` :
                  mode === "survival" ? "SURVIVE THE STREETS" :
                                        "ENJOY YOURSELF";
    HUD.bigMsg(intro, 2.2);
  }

  function setupLevel(idx) {
    Particles.reset();
    popups = [];
    timeScale = 1;
    cam = { x: 0, y: 0, shake: 0 };

    World.generate(idx, "city");
    Particles.initDecals(World.size().w, World.size().h);

    // Spawn the player on a road tile near the center.
    const { w, h, tile } = World.size();
    let px = w / 2, py = h / 2;
    // Snap to a nearby road.
    outer:
    for (let r = 0; r < 12; r++) {
      for (let a = 0; a < 8; a++) {
        const ang = a * (U.TAU / 8);
        const cx = w/2 + Math.cos(ang) * r * tile;
        const cy = h/2 + Math.sin(ang) * r * tile;
        if (World.isRoadAt(cx, cy)) { px = cx; py = cy; break outer; }
      }
    }

    const player = Player.make(px, py);
    const peds = [];
    const numPeds = 80 + idx * 25;
    const spawns = World.getSpawns();
    for (let i = 0; i < numPeds; i++) {
      const s = U.pick(spawns);
      peds.push(Pedestrian.make(s.x + U.rand(-8, 8), s.y + U.rand(-8, 8)));
    }

    const enemies = [];
    const numEnemies = 3 + idx * 2;
    for (let i = 0; i < numEnemies; i++) {
      // spawn enemies away from player
      let tries = 30, x = 0, y = 0;
      while (tries-- > 0) {
        x = U.rand(60, w - 60);
        y = U.rand(60, h - 60);
        if (World.isRoadAt(x, y) && U.dist(x, y, player.car.x, player.car.y) > 400) break;
      }
      enemies.push(Enemy.make(x, y));
    }

    const powerups = [];
    for (let i = 0; i < 14; i++) {
      let tries = 20, x = 0, y = 0;
      while (tries-- > 0) {
        x = U.rand(40, w - 40);
        y = U.rand(40, h - 40);
        const t = World.tileAt(x, y);
        if (t === World.T.ROAD || t === World.T.SIDEWALK) break;
      }
      powerups.push(Powerup.make(x, y));
    }

    const targetKills = mode === "survival" ? 9999 :
                        mode === "freeplay" ? 9999 :
                        30 + idx * 15;
    const timeLeft = mode === "survival" ? 9999 :
                     mode === "freeplay" ? 9999 :
                     90;

    // Civilian traffic: slow non-aggressive cars that drive around. Stored
    // as Enemy entities with kind="racer" but a flag to keep them docile —
    // simpler than introducing a third entity type.
    const traffic = [];
    const numTraffic = 4 + idx;
    for (let i = 0; i < numTraffic; i++) {
      let tries = 30, x = 0, y = 0;
      while (tries-- > 0) {
        x = U.rand(60, World.size().w - 60);
        y = U.rand(60, World.size().h - 60);
        if (World.isRoadAt(x, y) && U.dist(x, y, player.car.x, player.car.y) > 350) break;
      }
      const t = Enemy.make(x, y, "racer");
      t.civilian = true;
      // Tone them down: slower, less hp, lighter colors.
      t.car.maxSpeed = 220;
      t.car.accel = 180;
      t.car.hp = 50;
      t.car.maxHp = 50;
      traffic.push(t);
    }

    G = {
      player, peds, enemies, powerups, traffic,
      score: 0, kills: 0, combo: 1, comboTimer: 0,
      timeLeft, totalTime: 0,
      targetKills,
      multiKillWindow: 0,
      multiKillCount: 0,
      level: idx,
      paused: false,
      wanted: 0,            // 0..5 stars
      wantedHeat: 0,        // accumulates from chaos, raises wanted when high
      wantedCooldown: 0,    // ticks down — wanted drops when 0
      copSpawnTimer: 4,
      _siren: 0,
    };
  }

  function getIntent() {
    if (state !== STATE.PLAYING) return { throttle: 0, steer: 0, handbrake: false, nitro: false };
    let throttle = 0, steer = 0;
    if (Input.isDown("UP")) throttle += 1;
    if (Input.isDown("DOWN")) throttle -= 1;
    if (Input.isDown("LEFT")) steer -= 1;
    if (Input.isDown("RIGHT")) steer += 1;
    let handbrake = Input.isDown("SPACE");
    let nitro = Input.isDown("SHIFT");

    // Touch overrides — only apply when the touch UI is active so we don't
    // zero out a keyboard input that happens to be at rest.
    const t = Touch.getOverride();
    if (t) {
      if (t.throttle !== 0) throttle = t.throttle;
      if (t.steer !== 0)    steer    = t.steer;
      if (t.handbrake)      handbrake = true;
      if (t.nitro)          nitro    = true;
    }
    return { throttle, steer, handbrake, nitro };
  }

  let last = performance.now();
  function loop(now) {
    const rawDt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // Pause input.
    if (Input.wasPressed("P") || Input.wasPressed("ESC")) {
      if (state === STATE.PLAYING) { state = STATE.PAUSED; HUD.show("pause"); }
      else if (state === STATE.PAUSED) { state = STATE.PLAYING; HUD.hide("pause"); }
    }
    if (Input.wasPressed("M")) {
      const m = Audio.toggleMuted();
      HUD.bigMsg(m ? "MUTED" : "UNMUTED", 1.2);
    }

    if (state === STATE.PLAYING) {
      // Slow-mo bleeds back to normal.
      timeScale = U.lerp(timeScale, 1, U.clamp(rawDt * 4, 0, 1));
      const dt = rawDt * timeScale;
      tick(dt);
    }

    render();
    Input.endFrame();
    requestAnimationFrame(loop);
  }

  function tick(dt) {
    if (!G) return;
    G.totalTime += dt;

    if (mode === "carnage") G.timeLeft -= dt;
    if (G.timeLeft <= 0 && mode === "carnage") {
      finishLevel();
      return;
    }


    // --- Player update ---
    Player.update(G.player, dt, getIntent);
    clampToWorld(G.player.car);

    // --- Pedestrians ---
    for (const p of G.peds) {
      Pedestrian.update(p, dt, G.player.car);
      clampPed(p);
    }

    // --- Enemies ---
    for (const e of G.enemies) {
      Enemy.update(e, dt, G.player, G.peds);
      clampToWorld(e.car);
    }
    // --- Traffic ---
    for (const t of G.traffic) {
      Enemy.update(t, dt, G.player, G.peds);
      clampToWorld(t.car);
    }

    // --- Wanted level ---
    updateWanted(dt);

    // --- Power-ups ---
    for (const u of G.powerups) Powerup.update(u, dt);

    // --- Collisions ---
    collidePedestrians();
    collideEnemies();
    collideObstacles();
    collidePowerups();

    // --- Particles ---
    Particles.update(dt);
    World.updateHydrants(dt);

    // --- Combo decay ---
    if (G.comboTimer > 0) {
      G.comboTimer -= dt;
      if (G.comboTimer <= 0) {
        G.combo = 1;
        G.multiKillCount = 0;
      }
    }

    // --- Score popups ---
    for (let i = popups.length - 1; i >= 0; i--) {
      const pp = popups[i];
      pp.life -= dt; pp.y += pp.vy * dt; pp.vy *= 0.95;
      if (pp.life <= 0) popups.splice(i, 1);
    }

    // --- Camera ---
    updateCamera(dt);

    // --- Player death ---
    if (G.player.car.hp <= 0) {
      gameOver();
      return;
    }

    // --- Victory ---
    if (mode === "carnage" && G.kills >= G.targetKills) {
      finishLevel();
      return;
    }

    // --- Respawn peds slowly so the world doesn't empty out ---
    if (G.peds.filter(p => !p.dead).length < 40) {
      const spawns = World.getSpawns();
      for (let i = 0; i < 4; i++) {
        // Spawn somewhere off-screen-ish.
        let tries = 8;
        while (tries-- > 0) {
          const s = U.pick(spawns);
          if (U.dist(s.x, s.y, G.player.car.x, G.player.car.y) > 480) {
            G.peds.push(Pedestrian.make(s.x, s.y));
            break;
          }
        }
      }
    }

    // --- Spawn rare ambient siren wail ---
    G._siren -= dt;
    if (G._siren <= 0) {
      G._siren = U.rand(15, 30);
      if (Math.random() < 0.5) Audio.siren();
    }

    // --- HUD updates ---
    HUD.update(G);
    HUD.tickCombo(dt);
    HUD.tickBig(dt);
  }

  // Cops are added to the regular `enemies` array so the collision logic
  // doesn't need to know about them specially. The wanted level just
  // governs how many we maintain on the streets.
  function updateWanted(dt) {
    G.wantedCooldown -= dt;
    if (G.wantedCooldown < 0) G.wantedCooldown = 0;

    // Wanted decays when out of trouble for a while.
    if (G.wantedCooldown === 0 && G.wanted > 0) {
      G.wantedHeat -= dt * 0.5;
      if (G.wantedHeat <= -5) {
        G.wanted = Math.max(0, G.wanted - 1);
        G.wantedHeat = 0;
        HUD.bigMsg("WANTED LEVEL: " + "★".repeat(G.wanted) + "☆".repeat(5 - G.wanted));
      }
    }

    if (G.wanted > 0) {
      const desiredCops = G.wanted; // 1..5 cops at once
      let copsAlive = 0;
      for (const e of G.enemies) if (e.kind === "cop" && !e.dead) copsAlive++;
      G.copSpawnTimer -= dt;
      if (copsAlive < desiredCops && G.copSpawnTimer <= 0) {
        spawnCop();
        G.copSpawnTimer = 4;
      }
    }
  }

  function raiseHeat(amount, points = 0) {
    G.wantedHeat += amount;
    G.wantedCooldown = 8; // postpone decay
    const thresholds = [0, 3, 8, 16, 28, 45];
    let newWanted = G.wanted;
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (G.wantedHeat >= thresholds[i]) { newWanted = i; break; }
    }
    if (newWanted > G.wanted) {
      G.wanted = newWanted;
      HUD.bigMsg("WANTED LEVEL UP: " + "★".repeat(G.wanted) + "☆".repeat(5 - G.wanted));
      Audio.comboLevelUp(2);
    }
  }

  function spawnCop() {
    const { w, h } = World.size();
    let tries = 20, x = 0, y = 0;
    while (tries-- > 0) {
      x = U.rand(40, w - 40);
      y = U.rand(40, h - 40);
      if (World.isRoadAt(x, y) && U.dist(x, y, G.player.car.x, G.player.car.y) > 400) break;
    }
    const cop = Enemy.make(x, y, "cop");
    G.enemies.push(cop);
  }

  function clampToWorld(car) {
    const { w, h } = World.size();
    const m = 24;
    if (car.x < m) { car.x = m; if (car.vx < 0) car.speed *= 0.5; }
    if (car.y < m) { car.y = m; if (car.vy < 0) car.speed *= 0.5; }
    if (car.x > w - m) { car.x = w - m; car.speed *= 0.5; }
    if (car.y > h - m) { car.y = h - m; car.speed *= 0.5; }
  }
  function clampPed(p) {
    const { w, h } = World.size();
    p.x = U.clamp(p.x, 4, w - 4);
    p.y = U.clamp(p.y, 4, h - 4);
  }

  // ---- COLLISIONS ----------------------------------------------------
  function collidePedestrians() {
    const c = G.player.car;
    const speed = Math.abs(c.speed);
    // Player vs peds
    for (const p of G.peds) {
      if (p.dead) continue;
      const carR = Car.radius(c);
      if (U.circleOverlap(c.x, c.y, carR, p.x, p.y, p.r, 1)) {
        // Need some forward motion to actually run someone over.
        if (speed > 24) {
          handlePedKill(p, c, "player");
        } else {
          // Slow nudge: small push.
          const ang = U.angleTo(c.x, c.y, p.x, p.y);
          p.x += Math.cos(ang) * 1.2;
          p.y += Math.sin(ang) * 1.2;
        }
      }
    }
    // Enemies vs peds
    for (const e of G.enemies) {
      if (e.dead) continue;
      const carR = Car.radius(e.car);
      for (const p of G.peds) {
        if (p.dead) continue;
        if (U.circleOverlap(e.car.x, e.car.y, carR, p.x, p.y, p.r, 1)) {
          if (Math.abs(e.car.speed) > 60) {
            handlePedKill(p, e.car, "enemy");
          }
        }
      }
    }
  }

  function handlePedKill(p, killerCar, who) {
    const speed = Math.abs(killerCar.speed);
    const bonus = (who === "player" && G.player.powerups.bloodlust > 0) ? 2 : 1;
    const spikeBonus = (who === "player" && G.player.powerups.spike > 0) ? 1.5 : 1;
    Pedestrian.kill(p, speed, killerCar.x, killerCar.y, bonus * spikeBonus);

    if (who !== "player") return;

    G.kills += 1;
    G.combo = Math.min(64, G.combo + 1);
    G.comboTimer = 3.0;
    G.multiKillCount += 1;
    G.multiKillWindow = 0.6;

    const base = 100;
    const speedMul = U.clamp(speed / 200, 0.5, 3);
    const points = Math.floor(base * speedMul * G.combo * bonus * spikeBonus);
    G.score += points;

    pushPopup(p.x, p.y - 14, "+" + points, "#ffdd00");

    // Multi-kill messages.
    if (G.multiKillCount === 2) { HUD.flashCombo("DOUBLE KILL!"); Audio.comboLevelUp(1); }
    else if (G.multiKillCount === 3) { HUD.flashCombo("TRIPLE KILL!", "#ff8800"); Audio.comboLevelUp(2); }
    else if (G.multiKillCount === 5) { HUD.flashCombo("MASSACRE!", "#ff00ff"); Audio.comboLevelUp(3); slowMo(0.5, 0.5); }
    else if (G.multiKillCount === 8) { HUD.flashCombo("BLOODBATH!", "#ff0000"); Audio.comboLevelUp(4); slowMo(0.3, 0.7); shake(20); }
    else if (G.multiKillCount === 12){ HUD.flashCombo("UNHINGED!", "#ffaa00"); Audio.comboLevelUp(5); slowMo(0.25, 1.0); shake(28); }

    shake(U.clamp(speed * 0.025, 2, 8));

    // Add some bonus time on kills in carnage mode.
    if (mode === "carnage") G.timeLeft += 0.6;

    // Killing draws police heat.
    raiseHeat(0.6);
  }

  function collideEnemies() {
    // Player vs enemy (cops + rivals + traffic all flow through here)
    const pc = G.player.car;
    const pr = Car.radius(pc);
    const allOpponents = G.enemies.concat(G.traffic);
    for (const e of allOpponents) {
      if (e.dead) continue;
      const er = Car.radius(e.car);
      if (U.circleOverlap(pc.x, pc.y, pr, e.car.x, e.car.y, er, 0)) {
        // Resolve overlap.
        const ang = U.angleTo(pc.x, pc.y, e.car.x, e.car.y);
        const overlap = (pr + er) - U.dist(pc.x, pc.y, e.car.x, e.car.y);
        const push = overlap / 2 + 0.5;
        pc.x -= Math.cos(ang) * push;
        pc.y -= Math.sin(ang) * push;
        e.car.x += Math.cos(ang) * push;
        e.car.y += Math.sin(ang) * push;
        const rel = Math.abs(pc.speed - e.car.speed) + 50;

        const playerInvincible = Player.isInvincible(G.player) || G.player.powerups.bigwheels > 0;
        const dmgToPlayer = playerInvincible ? 0 : rel * 0.04;
        const dmgToEnemy = (G.player.powerups.bigwheels > 0 ? 2 : 1) * rel * 0.05;

        pc.hp -= dmgToPlayer;
        e.car.hp -= dmgToEnemy;
        Audio.crash();
        Car.impact(pc, e.car.x, e.car.y, rel);
        Car.impact(e.car, pc.x, pc.y, rel);
        for (let i = 0; i < 6; i++) Particles.spark((pc.x + e.car.x)/2, (pc.y + e.car.y)/2);
        shake(U.clamp(rel * 0.03, 3, 10));

        if (e.car.hp <= 0) {
          wreckEnemy(e);
        }
      }
    }

    // Cross-faction (enemy vs enemy / traffic) just pushes them apart so
    // they don't pile up in the same tile.
    const all = G.enemies.concat(G.traffic);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        if (a.dead || b.dead) continue;
        const ar = Car.radius(a.car), br = Car.radius(b.car);
        if (U.circleOverlap(a.car.x, a.car.y, ar, b.car.x, b.car.y, br, 0)) {
          const ang = U.angleTo(a.car.x, a.car.y, b.car.x, b.car.y);
          const overlap = (ar + br) - U.dist(a.car.x, a.car.y, b.car.x, b.car.y);
          a.car.x -= Math.cos(ang) * (overlap/2 + 0.5);
          a.car.y -= Math.sin(ang) * (overlap/2 + 0.5);
          b.car.x += Math.cos(ang) * (overlap/2 + 0.5);
          b.car.y += Math.sin(ang) * (overlap/2 + 0.5);
          a.car.speed *= 0.85; b.car.speed *= 0.85;
        }
      }
    }
  }

  function wreckEnemy(e) {
    e.dead = true;
    Particles.explosion(e.car.x, e.car.y);
    Audio.explosion();
    shake(18);
    const reward = e.kind === "cop" ? 800 : (e.civilian ? 300 : 500);
    G.score += reward;
    pushPopup(e.car.x, e.car.y - 14, "+" + reward, "#ff8800");
    HUD.bigMsg(e.kind === "cop" ? "COP DOWN" : e.civilian ? "CIVILIAN WASTED" : "RIVAL WASTED");
    slowMo(0.4, 0.4);
    // Big heat consequences for killing the law or a civilian.
    if (e.kind === "cop") raiseHeat(6);
    else if (e.civilian) raiseHeat(2);
  }

  function collideObstacles() {
    for (const o of World.getObstacles()) {
      if (o.destroyed) continue;
      checkCarVsObstacle(G.player.car, o, "player");
      for (const e of G.enemies) {
        if (!e.dead) checkCarVsObstacle(e.car, o, "enemy");
      }
      for (const t of G.traffic) {
        if (!t.dead) checkCarVsObstacle(t.car, o, "enemy");
      }
    }
  }

  function checkCarVsObstacle(car, o, who) {
    const cr = Car.radius(car);
    if (!U.circleOverlap(car.x, car.y, cr, o.x, o.y, o.r, 0)) return;
    const ang = U.angleTo(car.x, car.y, o.x, o.y);

    if (o.ramp) {
      // No collision — give a forward speed boost + bounce.
      car.speed = Math.min(car.maxSpeed * 1.1, car.speed + 200);
      Car.setBounce(car, 6);
      Particles.spark(o.x, o.y);
      return;
    }

    const overlap = (cr + o.r) - U.dist(car.x, car.y, o.x, o.y);
    car.x -= Math.cos(ang) * (overlap + 0.5);
    car.y -= Math.sin(ang) * (overlap + 0.5);
    const speed = Math.abs(car.speed);
    const dmgToCar = (who === "player" && Player.isInvincible(G.player)) ? 0 : speed * 0.04;
    car.hp -= dmgToCar;
    car.speed *= 0.55;
    Car.impact(car, o.x, o.y, speed + 50);
    for (let i = 0; i < 4; i++) Particles.spark(o.x, o.y);
    Audio.crash();
    if (speed > 80) shake(U.clamp(speed * 0.02, 2, 8));

    if (o.hp < 999) {
      o.hp -= 1;
      if (o.hp <= 0) destroyObstacle(o, who);
    }
  }

  function destroyObstacle(o, who) {
    o.destroyed = true;
    if (who === "player") {
      G.score += o.score;
      pushPopup(o.x, o.y - 8, "+" + o.score, "#ffaa66");
    }
    Particles.spark(o.x, o.y);
    for (let i = 0; i < 6; i++) Particles.spark(o.x, o.y);

    if (o.kind === "hydrant") {
      o.spewing = true;
      o.solid = false;
    }
    if (o.explosive) {
      Particles.explosion(o.x, o.y);
      Audio.explosion();
      shake(14);
      // Splash damage to nearby cars and peds.
      const RANGE = 90;
      if (U.dist(o.x, o.y, G.player.car.x, G.player.car.y) < RANGE && !Player.isInvincible(G.player)) {
        G.player.car.hp -= 40;
        Car.impact(G.player.car, o.x, o.y, 200);
      }
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (U.dist(o.x, o.y, e.car.x, e.car.y) < RANGE) {
          e.car.hp -= 60;
          Car.impact(e.car, o.x, o.y, 200);
          if (e.car.hp <= 0) wreckEnemy(e);
        }
      }
      for (const p of G.peds) {
        if (p.dead) continue;
        if (U.dist(o.x, o.y, p.x, p.y) < RANGE) {
          Pedestrian.kill(p, 250, o.x, o.y);
          if (who === "player") {
            G.kills += 1; G.score += 120; G.combo = Math.min(64, G.combo + 1); G.comboTimer = 3;
          }
        }
      }
    }
    if (o.kind === "parked_car") {
      Particles.explosion(o.x, o.y);
      Audio.explosion();
      shake(10);
    }
  }

  function collidePowerups() {
    const pc = G.player.car;
    const pr = Car.radius(pc);
    for (const u of G.powerups) {
      if (u.taken) continue;
      if (U.circleOverlap(pc.x, pc.y, pr, u.x, u.y, u.r, 0)) {
        u.taken = true;
        Audio.powerupGet();
        Player.applyPickup(G.player, u.kind);
        HUD.bigMsg(u.label);
        pushPopup(u.x, u.y - 12, u.label, "#ffd700");
      }
    }
    // Drip new powerups in as old ones get taken.
    const remaining = G.powerups.filter(u => !u.taken).length;
    if (remaining < 8 && Math.random() < 0.02) {
      const { w, h } = World.size();
      let tries = 12, x = 0, y = 0;
      while (tries-- > 0) {
        x = U.rand(60, w - 60);
        y = U.rand(60, h - 60);
        const t = World.tileAt(x, y);
        if ((t === World.T.ROAD || t === World.T.SIDEWALK) &&
            U.dist(x, y, G.player.car.x, G.player.car.y) > 200) break;
      }
      G.powerups.push(Powerup.make(x, y));
    }
  }

  // ---- CAMERA --------------------------------------------------------
  function updateCamera(dt) {
    const pc = G.player.car;
    // Look-ahead: aim the camera slightly in the direction of motion.
    const ahead = 90;
    const tx = pc.x + (pc.vx / Math.max(1, Math.abs(pc.speed))) * ahead;
    const ty = pc.y + (pc.vy / Math.max(1, Math.abs(pc.speed))) * ahead;
    const targetX = tx - canvas.width / 2;
    const targetY = ty - canvas.height / 2;
    cam.x = U.lerp(cam.x, targetX, U.clamp(dt * 6, 0, 1));
    cam.y = U.lerp(cam.y, targetY, U.clamp(dt * 6, 0, 1));
    const { w, h } = World.size();
    cam.x = U.clamp(cam.x, 0, w - canvas.width);
    cam.y = U.clamp(cam.y, 0, h - canvas.height);
    cam.shake *= Math.exp(-8 * dt);
  }

  function shake(amount) { cam.shake = Math.max(cam.shake, amount); }
  function slowMo(scale, duration) {
    timeScale = Math.min(timeScale, scale);
    setTimeout(() => { timeScale = 1; }, duration * 1000);
  }

  // ---- RENDER --------------------------------------------------------
  function render() {
    if (state === STATE.MENU) {
      // Render a slow, dim "demo" view as the menu backdrop.
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawTitleBg();
      return;
    }

    if (!G) return;
    ctx.save();

    const shakeX = (Math.random() - 0.5) * cam.shake;
    const shakeY = (Math.random() - 0.5) * cam.shake;
    ctx.translate(-cam.x + shakeX, -cam.y + shakeY);

    // Background tiles
    World.draw(ctx, { x: 0, y: 0 });
    Particles.drawDecals(ctx, { x: 0, y: 0 });

    // Obstacles
    World.drawObstacles(ctx);

    // Power-ups
    for (const u of G.powerups) Powerup.draw(ctx, u);

    // Pedestrians (sorted by y for vague depth)
    const sortedPeds = G.peds.slice().sort((a, b) => a.y - b.y);
    for (const p of sortedPeds) Pedestrian.draw(ctx, p);

    // Traffic (drawn under enemies — they're background filler)
    for (const t of G.traffic) Enemy.draw(ctx, t);
    // Enemies
    for (const e of G.enemies) Enemy.draw(ctx, e);

    // Player
    Player.draw(ctx, G.player);

    // Particles on top
    Particles.draw(ctx);

    // Score popups
    for (const pp of popups) {
      const a = U.clamp(pp.life / 1.2, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = pp.color;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.strokeText(pp.text, pp.x, pp.y);
      ctx.fillText(pp.text, pp.x, pp.y);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Vignette
    const grad = ctx.createRadialGradient(
      canvas.width/2, canvas.height/2, canvas.height * 0.3,
      canvas.width/2, canvas.height/2, canvas.height * 0.8);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Red flash when player just took damage
    if (G.player.car.hp / G.player.car.maxHp < 0.3) {
      const pulse = (Math.sin(performance.now() / 120) + 1) / 2;
      ctx.fillStyle = "rgba(255,0,0," + (0.04 + pulse * 0.07) + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawTitleBg() {
    // Animated specks of "blood" drifting upward — pure decoration.
    const t = performance.now() / 1000;
    ctx.fillStyle = "#150505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 60; i++) {
      const x = ((i * 137 + t * 30) % canvas.width);
      const y = (canvas.height - (i * 87 + t * 50) % canvas.height);
      const a = ((Math.sin(i + t) + 1) / 2) * 0.4;
      ctx.fillStyle = `rgba(180,0,0,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 2 + (i % 3), 0, U.TAU);
      ctx.fill();
    }
  }

  // ---- ENDGAME -------------------------------------------------------
  function gameOver() {
    state = STATE.GAMEOVER;
    Particles.explosion(G.player.car.x, G.player.car.y);
    Audio.explosion();
    Audio.stopEngine();
    Audio.stopMusic();
    shake(30);

    const hi = loadHighScores();
    let recordScore = false, recordKills = false;
    if (G.score > hi.score) { hi.score = G.score; recordScore = true; }
    if (G.kills > hi.kills) { hi.kills = G.kills; recordKills = true; }
    saveHighScores(hi);
    document.getElementById("hi-score").textContent = hi.score.toLocaleString();
    document.getElementById("hi-kills").textContent = hi.kills.toString();

    const stats = document.getElementById("gameover-stats");
    stats.innerHTML = `
      <div><b>SCORE</b>${G.score.toLocaleString()}${recordScore ? "  <span style='color:#ffd700'>NEW RECORD!</span>" : ""}</div>
      <div><b>KILLS</b>${G.kills}${recordKills ? "  <span style='color:#ffd700'>NEW RECORD!</span>" : ""}</div>
      <div><b>TIME</b>${U.formatTime(G.totalTime)}</div>
      <div><b>LEVEL</b>${G.level + 1}</div>
    `;
    HUD.show("gameover");
  }

  function finishLevel() {
    state = STATE.VICTORY;
    const hi = loadHighScores();
    if (G.score > hi.score) { hi.score = G.score; }
    if (G.kills > hi.kills) { hi.kills = G.kills; }
    saveHighScores(hi);
    document.getElementById("hi-score").textContent = hi.score.toLocaleString();
    document.getElementById("hi-kills").textContent = hi.kills.toString();

    const stats = document.getElementById("victory-stats");
    stats.innerHTML = `
      <div><b>SCORE</b>${G.score.toLocaleString()}</div>
      <div><b>KILLS</b>${G.kills}</div>
      <div><b>TIME LEFT</b>${U.formatTime(G.timeLeft)}</div>
      <div><b>LEVEL</b>${G.level + 1} CLEARED</div>
    `;
    HUD.show("victory");
  }

  function nextLevel() {
    levelIndex += 1;
    setupLevel(levelIndex);
    state = STATE.PLAYING;
    HUD.hide("victory");
  }

  function quitToMenu() {
    state = STATE.MENU;
    Audio.stopEngine();
    Audio.stopMusic();
    HUD.hideHUD();
    HUD.hide("pause");
    HUD.hide("gameover");
    HUD.hide("victory");
    HUD.show("menu");
  }

  function retry() {
    setupLevel(levelIndex);
    state = STATE.PLAYING;
    HUD.hide("gameover");
    Audio.startEngine();
    Audio.startMusic();
  }

  return {
    start, newGame, nextLevel, quitToMenu, retry,
    getState: () => state, STATE,
  };
})();

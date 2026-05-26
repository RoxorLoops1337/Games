// Game orchestration in 3D: owns the THREE renderer/scene/camera, the
// frame loop, collisions, scoring, wanted-level, and the state machine.
const Game = (() => {
  const STATE = { MENU: "menu", PLAYING: "playing", PAUSED: "paused", GAMEOVER: "gameover", VICTORY: "victory" };

  let canvas, renderer, scene, camera;
  let state = STATE.MENU;
  let mode = "carnage";
  let levelIndex = 0;
  let G = null;
  let timeScale = 1;
  let popups = [];   // floating world-space score text rendered via the HUD overlay
  let shake = 0;

  function loadHi() {
    try { const r = localStorage.getItem("carnegiendon-hi3d"); if (r) return JSON.parse(r); } catch (e) {}
    return { score: 0, kills: 0 };
  }
  function saveHi(h) { try { localStorage.setItem("carnegiendon-hi3d", JSON.stringify(h)); } catch (e) {} }

  function start(canvasEl) {
    canvas = canvasEl;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x0a0a14, 1);

    camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 800);
    camera.position.set(0, 8, 16);

    fit();
    window.addEventListener("resize", fit);

    const hi = loadHi();
    document.getElementById("hi-score").textContent = hi.score.toLocaleString();
    document.getElementById("hi-kills").textContent = hi.kills.toString();
    document.getElementById("loading").classList.add("hidden");

    requestAnimationFrame(loop);
  }

  function fit() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
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
    Audio.init(); Audio.resume();
    Audio.startEngine(); Audio.startMusic();
    HUD.bigMsg(mode === "carnage" ? `KILL ${G.targetKills} TO ESCAPE` :
               mode === "survival" ? "SURVIVE THE STREETS" : "ENJOY YOURSELF", 2.2);
  }

  function setupLevel(idx) {
    // Tear down the previous scene if we have one.
    if (scene) {
      while (scene.children.length) scene.remove(scene.children[0]);
    }
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x18141c, 80, 260);
    scene.background = new THREE.Color(0x18141c);

    // Lighting: a warm-ish ambient + a slightly bluish "moonlight" key.
    scene.add(new THREE.AmbientLight(0x6b6680, 0.85));
    const sun = new THREE.DirectionalLight(0xfff0d0, 0.9);
    sun.position.set(60, 90, 30);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x445080, 0.4);
    fill.position.set(-30, 60, -20);
    scene.add(fill);

    Particles.init(scene);
    Particles.reset();
    popups = [];
    shake = 0; timeScale = 1;

    World.generate(idx, scene);

    // Spawn player on or near a road tile in the middle.
    const { w, h } = World.size();
    let px = 0, py = 0;
    outer:
    for (let r = 0; r < 16; r++) {
      for (let a = 0; a < 8; a++) {
        const ang = a * (U.TAU / 8);
        const cx = Math.cos(ang) * r * 4;
        const cz = Math.sin(ang) * r * 4;
        if (World.isRoadAt(cx, cz)) { px = cx; py = cz; break outer; }
      }
    }
    const player = Player.make(px, py);
    Car.addToScene(player.car, scene);

    const peds = [];
    const numPeds = 60 + idx * 20;
    const spawns = World.getSpawns();
    for (let i = 0; i < numPeds; i++) {
      const s = U.pick(spawns);
      const p = Pedestrian.make(s.x + U.rand(-1, 1), s.y + U.rand(-1, 1));
      scene.add(p.mesh);
      peds.push(p);
    }

    const enemies = [];
    const numEnemies = 3 + idx * 2;
    for (let i = 0; i < numEnemies; i++) {
      let tries = 30, x = 0, z = 0;
      while (tries-- > 0) {
        x = U.rand(-w/2 + 8, w/2 - 8);
        z = U.rand(-h/2 + 8, h/2 - 8);
        if (World.isRoadAt(x, z) && U.dist(x, z, player.car.x, player.car.y) > 50) break;
      }
      const e = Enemy.make(x, z);
      scene.add(e.car.mesh);
      enemies.push(e);
    }

    const traffic = [];
    const numTraffic = 4 + idx;
    for (let i = 0; i < numTraffic; i++) {
      let tries = 30, x = 0, z = 0;
      while (tries-- > 0) {
        x = U.rand(-w/2 + 8, w/2 - 8);
        z = U.rand(-h/2 + 8, h/2 - 8);
        if (World.isRoadAt(x, z) && U.dist(x, z, player.car.x, player.car.y) > 40) break;
      }
      const t = Enemy.make(x, z, "racer");
      t.civilian = true;
      t.car.maxSpeed = 18; t.car.accel = 14; t.car.hp = 50; t.car.maxHp = 50;
      scene.add(t.car.mesh);
      traffic.push(t);
    }

    const powerups = [];
    for (let i = 0; i < 14; i++) {
      let tries = 20, x = 0, z = 0;
      while (tries-- > 0) {
        x = U.rand(-w/2 + 6, w/2 - 6);
        z = U.rand(-h/2 + 6, h/2 - 6);
        const t = World.tileAt(x, z);
        if (t === World.T.ROAD || t === World.T.SIDEWALK) break;
      }
      const u = Powerup.make(x, z);
      scene.add(u.mesh);
      u.mesh.position.set(x, 0, z);
      powerups.push(u);
    }

    const targetKills = mode === "survival" ? 9999 :
                        mode === "freeplay" ? 9999 :
                        25 + idx * 12;
    const timeLeft = mode === "survival" ? 9999 :
                     mode === "freeplay" ? 9999 :
                     90;

    G = {
      player, peds, enemies, traffic, powerups,
      score: 0, kills: 0, combo: 1, comboTimer: 0,
      multiKillCount: 0, multiKillWindow: 0,
      timeLeft, totalTime: 0, targetKills, level: idx,
      wanted: 0, wantedHeat: 0, wantedCooldown: 0, copSpawnTimer: 4,
      _siren: 0,
    };

    // Snap the camera so we don't see the world wipe.
    Player.updateCamera(player, camera, 1);
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

    if (Input.wasPressed("P") || Input.wasPressed("ESC")) {
      if (state === STATE.PLAYING) { state = STATE.PAUSED; HUD.show("pause"); }
      else if (state === STATE.PAUSED) { state = STATE.PLAYING; HUD.hide("pause"); }
    }
    if (Input.wasPressed("C") && G && state === STATE.PLAYING) {
      Player.cycleView(G.player);
    }
    if (Input.wasPressed("M")) {
      const m = Audio.toggleMuted();
      HUD.bigMsg(m ? "MUTED" : "UNMUTED", 1.2);
    }

    if (state === STATE.PLAYING) {
      timeScale = U.lerp(timeScale, 1, U.clamp(rawDt * 4, 0, 1));
      tick(rawDt * timeScale);
    }

    if (scene && camera) renderer.render(scene, camera);
    Input.endFrame();
    requestAnimationFrame(loop);
  }

  function tick(dt) {
    if (!G) return;
    G.totalTime += dt;
    if (mode === "carnage") G.timeLeft -= dt;
    if (G.timeLeft <= 0 && mode === "carnage") { finishLevel(); return; }

    const intent = getIntent();
    Player.update(G.player, dt, intent);
    clampToWorld(G.player.car);

    for (const p of G.peds) {
      if (p.dead) continue;
      Pedestrian.update(p, dt, G.player.car);
      clampPed(p);
    }
    for (const e of G.enemies) {
      if (e.dead) continue;
      Enemy.update(e, dt, G.player, G.peds);
      clampToWorld(e.car);
    }
    for (const t of G.traffic) {
      if (t.dead) continue;
      Enemy.update(t, dt, G.player, G.peds);
      clampToWorld(t.car);
    }
    for (const u of G.powerups) Powerup.update(u, dt);

    updateWanted(dt);
    collidePedestrians();
    collideOpponents();
    collideObstacles();
    collidePowerups();
    Particles.update(dt);
    World.updateHydrants(dt);

    if (G.comboTimer > 0) {
      G.comboTimer -= dt;
      if (G.comboTimer <= 0) { G.combo = 1; G.multiKillCount = 0; }
    }

    // Apply camera shake by jittering the camera after Player.updateCamera.
    Player.updateCamera(G.player, camera, dt);
    if (shake > 0.01) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.4;
      camera.position.y += (Math.random() - 0.5) * shake * 0.2;
      camera.position.z += (Math.random() - 0.5) * shake * 0.4;
      shake *= Math.exp(-8 * dt);
    }

    if (G.player.car.hp <= 0) { gameOver(); return; }
    if (mode === "carnage" && G.kills >= G.targetKills) { finishLevel(); return; }

    // Re-stock peds if the streets are emptying.
    const liveCount = G.peds.reduce((a, p) => a + (p.dead ? 0 : 1), 0);
    if (liveCount < 35) {
      const spawns = World.getSpawns();
      for (let i = 0; i < 3; i++) {
        const s = U.pick(spawns);
        if (U.dist(s.x, s.y, G.player.car.x, G.player.car.y) > 60) {
          const p = Pedestrian.make(s.x, s.y);
          scene.add(p.mesh);
          G.peds.push(p);
        }
      }
    }

    G._siren -= dt;
    if (G._siren <= 0) {
      G._siren = U.rand(18, 32);
      if (G.wanted > 0 && Math.random() < 0.5) Audio.siren();
    }

    HUD.update(G);
    HUD.tickCombo(dt);
    HUD.tickBig(dt);
    HUD.tickPopups(dt, popups, camera);
  }

  // --- Wanted level (same shape as the 2D version) -------------------
  function updateWanted(dt) {
    G.wantedCooldown -= dt;
    if (G.wantedCooldown < 0) G.wantedCooldown = 0;
    if (G.wantedCooldown === 0 && G.wanted > 0) {
      G.wantedHeat -= dt * 0.5;
      if (G.wantedHeat <= -5) {
        G.wanted = Math.max(0, G.wanted - 1);
        G.wantedHeat = 0;
        HUD.bigMsg("WANTED LEVEL: " + "★".repeat(G.wanted) + "☆".repeat(5 - G.wanted));
      }
    }
    if (G.wanted > 0) {
      const desired = G.wanted;
      let alive = 0;
      for (const e of G.enemies) if (e.kind === "cop" && !e.dead) alive++;
      G.copSpawnTimer -= dt;
      if (alive < desired && G.copSpawnTimer <= 0) {
        spawnCop();
        G.copSpawnTimer = 4;
      }
    }
  }
  function raiseHeat(amount) {
    G.wantedHeat += amount;
    G.wantedCooldown = 8;
    const thresholds = [0, 3, 8, 16, 28, 45];
    let nw = G.wanted;
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (G.wantedHeat >= thresholds[i]) { nw = i; break; }
    }
    if (nw > G.wanted) {
      G.wanted = nw;
      HUD.bigMsg("WANTED: " + "★".repeat(G.wanted) + "☆".repeat(5 - G.wanted));
      Audio.comboLevelUp(2);
    }
  }
  function spawnCop() {
    const { w, h } = World.size();
    let tries = 20, x = 0, z = 0;
    while (tries-- > 0) {
      x = U.rand(-w/2 + 4, w/2 - 4);
      z = U.rand(-h/2 + 4, h/2 - 4);
      if (World.isRoadAt(x, z) && U.dist(x, z, G.player.car.x, G.player.car.y) > 60) break;
    }
    const cop = Enemy.make(x, z, "cop");
    scene.add(cop.car.mesh);
    G.enemies.push(cop);
  }

  // --- World bounds --------------------------------------------------
  function clampToWorld(car) {
    const { w, h } = World.size();
    const mx = w / 2 - 3, mz = h / 2 - 3;
    if (car.x < -mx) { car.x = -mx; car.speed *= 0.5; }
    if (car.y < -mz) { car.y = -mz; car.speed *= 0.5; }
    if (car.x >  mx) { car.x =  mx; car.speed *= 0.5; }
    if (car.y >  mz) { car.y =  mz; car.speed *= 0.5; }
    Car.syncMesh(car);
  }
  function clampPed(p) {
    const { w, h } = World.size();
    const mx = w / 2 - 1, mz = h / 2 - 1;
    p.x = U.clamp(p.x, -mx, mx);
    p.y = U.clamp(p.y, -mz, mz);
    Pedestrian.syncMesh(p);
  }

  // --- Collisions ----------------------------------------------------
  function collidePedestrians() {
    const pc = G.player.car;
    const speed = Math.abs(pc.speed);
    const pr = Car.radius(pc);
    for (const p of G.peds) {
      if (p.dead) continue;
      if (U.circleOverlap(pc.x, pc.y, pr, p.x, p.y, p.r, 0.2)) {
        if (speed > 2) handlePedKill(p, pc, "player");
        else { // gentle nudge
          const ang = U.angleTo(pc.x, pc.y, p.x, p.y);
          p.x += Math.cos(ang) * 0.1;
          p.y += Math.sin(ang) * 0.1;
        }
      }
    }
    for (const e of G.enemies) {
      if (e.dead) continue;
      const r = Car.radius(e.car);
      for (const p of G.peds) {
        if (p.dead) continue;
        if (U.circleOverlap(e.car.x, e.car.y, r, p.x, p.y, p.r, 0.2)) {
          if (Math.abs(e.car.speed) > 5) handlePedKill(p, e.car, "enemy");
        }
      }
    }
    for (const t of G.traffic) {
      if (t.dead) continue;
      const r = Car.radius(t.car);
      for (const p of G.peds) {
        if (p.dead) continue;
        if (U.circleOverlap(t.car.x, t.car.y, r, p.x, p.y, p.r, 0.2)) {
          if (Math.abs(t.car.speed) > 5) handlePedKill(p, t.car, "enemy");
        }
      }
    }
  }
  function handlePedKill(p, killerCar, who) {
    const speed = Math.abs(killerCar.speed);
    const bonus     = (who === "player" && G.player.powerups.bloodlust > 0) ? 2 : 1;
    const spikeMul  = (who === "player" && G.player.powerups.spike > 0) ? 1.5 : 1;
    Pedestrian.kill(p, speed, killerCar.x, killerCar.y, bonus * spikeMul);

    if (who !== "player") return;

    G.kills += 1;
    G.combo = Math.min(64, G.combo + 1);
    G.comboTimer = 3;
    G.multiKillCount += 1;
    const base = 100;
    const speedMul = U.clamp(speed / 15, 0.5, 3);
    const points = Math.floor(base * speedMul * G.combo * bonus * spikeMul);
    G.score += points;
    popups.push({ x: p.x, y: 2, z: p.y, life: 1.2, text: "+" + points, color: "#ffdd00" });

    if (G.multiKillCount === 2) { HUD.flashCombo("DOUBLE KILL!"); Audio.comboLevelUp(1); }
    else if (G.multiKillCount === 3) { HUD.flashCombo("TRIPLE KILL!", "#ff8800"); Audio.comboLevelUp(2); }
    else if (G.multiKillCount === 5) { HUD.flashCombo("MASSACRE!", "#ff00ff"); Audio.comboLevelUp(3); slowMo(0.5, 0.5); }
    else if (G.multiKillCount === 8) { HUD.flashCombo("BLOODBATH!", "#ff0000"); Audio.comboLevelUp(4); slowMo(0.3, 0.7); shake = 5; }
    else if (G.multiKillCount === 12){ HUD.flashCombo("UNHINGED!", "#ffaa00"); Audio.comboLevelUp(5); slowMo(0.25, 1); shake = 7; }

    shake = Math.max(shake, U.clamp(speed * 0.04, 0.6, 2.2));
    if (mode === "carnage") G.timeLeft += 0.6;
    raiseHeat(0.6);
  }

  function collideOpponents() {
    const pc = G.player.car;
    const pr = Car.radius(pc);
    const all = G.enemies.concat(G.traffic);
    for (const e of all) {
      if (e.dead) continue;
      const er = Car.radius(e.car);
      if (U.circleOverlap(pc.x, pc.y, pr, e.car.x, e.car.y, er, 0)) {
        const ang = U.angleTo(pc.x, pc.y, e.car.x, e.car.y);
        const overlap = (pr + er) - U.dist(pc.x, pc.y, e.car.x, e.car.y);
        pc.x -= Math.cos(ang) * (overlap/2 + 0.05);
        pc.y -= Math.sin(ang) * (overlap/2 + 0.05);
        e.car.x += Math.cos(ang) * (overlap/2 + 0.05);
        e.car.y += Math.sin(ang) * (overlap/2 + 0.05);
        const rel = Math.abs(pc.speed - e.car.speed) + 5;
        const playerInv = Player.isInvincible(G.player) || G.player.powerups.bigwheels > 0;
        const dmgP = playerInv ? 0 : rel * 0.3;
        const dmgE = (G.player.powerups.bigwheels > 0 ? 2 : 1) * rel * 0.4;
        pc.hp -= dmgP;
        e.car.hp -= dmgE;
        Audio.crash();
        Car.impact(pc, e.car.x, e.car.y, rel);
        Car.impact(e.car, pc.x, pc.y, rel);
        for (let i = 0; i < 6; i++) Particles.spark((pc.x + e.car.x)/2, 1.2, (pc.y + e.car.y)/2);
        shake = Math.max(shake, U.clamp(rel * 0.3, 1, 3));
        if (e.car.hp <= 0) wreckOpponent(e);
      }
    }
    // Resolve overlaps between non-player cars.
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        if (a.dead || b.dead) continue;
        const ar = Car.radius(a.car), br = Car.radius(b.car);
        if (U.circleOverlap(a.car.x, a.car.y, ar, b.car.x, b.car.y, br, 0)) {
          const ang = U.angleTo(a.car.x, a.car.y, b.car.x, b.car.y);
          const overlap = (ar + br) - U.dist(a.car.x, a.car.y, b.car.x, b.car.y);
          a.car.x -= Math.cos(ang) * (overlap/2 + 0.05);
          a.car.y -= Math.sin(ang) * (overlap/2 + 0.05);
          b.car.x += Math.cos(ang) * (overlap/2 + 0.05);
          b.car.y += Math.sin(ang) * (overlap/2 + 0.05);
          a.car.speed *= 0.85; b.car.speed *= 0.85;
        }
      }
    }
  }
  function wreckOpponent(e) {
    e.dead = true;
    Particles.explosion(e.car.x, 1.2, e.car.y);
    Audio.explosion();
    shake = Math.max(shake, 4);
    const reward = e.kind === "cop" ? 800 : (e.civilian ? 300 : 500);
    G.score += reward;
    popups.push({ x: e.car.x, y: 2, z: e.car.y, life: 1.4, text: "+" + reward, color: "#ff8800" });
    HUD.bigMsg(e.kind === "cop" ? "COP DOWN" : e.civilian ? "CIVILIAN WASTED" : "RIVAL WASTED");
    slowMo(0.4, 0.4);
    if (e.kind === "cop") raiseHeat(6);
    else if (e.civilian) raiseHeat(2);
    // Visually wreck the car: tilt + black smoke.
    e.car.mesh.rotation.z = U.rand(-0.6, 0.6);
    e.car.mesh.traverse((m) => {
      if (m.material && m.material.color && m.material !== m.material.transparent) {
        m.material.color.multiplyScalar(0.3);
      }
    });
  }

  function collideObstacles() {
    for (const o of World.getObstacles()) {
      if (o.destroyed) continue;
      checkCarVsObstacle(G.player.car, o, "player");
      for (const e of G.enemies) if (!e.dead) checkCarVsObstacle(e.car, o, "enemy");
      for (const t of G.traffic) if (!t.dead) checkCarVsObstacle(t.car, o, "enemy");
    }
  }
  function checkCarVsObstacle(car, o, who) {
    const cr = Car.radius(car);
    if (!U.circleOverlap(car.x, car.y, cr, o.x, o.y, o.r, 0)) return;
    const ang = U.angleTo(car.x, car.y, o.x, o.y);
    if (o.ramp) {
      car.speed = Math.min(car.maxSpeed * 1.1, car.speed + 14);
      Car.setBounce(car, 3);
      car.airborne = 0.6;
      Particles.spark(o.x, 1, o.y);
      return;
    }
    const overlap = (cr + o.r) - U.dist(car.x, car.y, o.x, o.y);
    car.x -= Math.cos(ang) * (overlap + 0.05);
    car.y -= Math.sin(ang) * (overlap + 0.05);
    const speed = Math.abs(car.speed);
    const dmg = (who === "player" && Player.isInvincible(G.player)) ? 0 : speed * 0.4;
    car.hp -= dmg;
    car.speed *= 0.55;
    Car.impact(car, o.x, o.y, speed + 5);
    for (let i = 0; i < 4; i++) Particles.spark(o.x, 1, o.y);
    Audio.crash();
    if (speed > 8) shake = Math.max(shake, U.clamp(speed * 0.2, 1, 2.5));
    if (o.hp < 999) {
      o.hp -= 1;
      if (o.hp <= 0) destroyObstacle(o, who);
    }
  }
  function destroyObstacle(o, who) {
    o.destroyed = true;
    if (who === "player") {
      G.score += o.score;
      if (o.score > 0) popups.push({ x: o.x, y: 1.5, z: o.y, life: 1.2, text: "+" + o.score, color: "#ffaa66" });
    }
    for (let i = 0; i < 6; i++) Particles.spark(o.x, 1, o.y);
    World.destroyObstacleVisual(o);
    if (o.kind === "hydrant") { o.spewing = true; o.solid = false; }
    if (o.explosive) {
      Particles.explosion(o.x, 1, o.y);
      Audio.explosion();
      shake = Math.max(shake, 4);
      const RANGE = 12;
      if (U.dist(o.x, o.y, G.player.car.x, G.player.car.y) < RANGE && !Player.isInvincible(G.player)) {
        G.player.car.hp -= 40;
        Car.impact(G.player.car, o.x, o.y, 30);
      }
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (U.dist(o.x, o.y, e.car.x, e.car.y) < RANGE) {
          e.car.hp -= 60;
          Car.impact(e.car, o.x, o.y, 30);
          if (e.car.hp <= 0) wreckOpponent(e);
        }
      }
      for (const p of G.peds) {
        if (p.dead) continue;
        if (U.dist(o.x, o.y, p.x, p.y) < RANGE) {
          Pedestrian.kill(p, 25, o.x, o.y);
          if (who === "player") { G.kills++; G.score += 120; G.combo = Math.min(64, G.combo + 1); G.comboTimer = 3; }
        }
      }
    }
    if (o.kind === "parked_car") {
      Particles.explosion(o.x, 1, o.y);
      Audio.explosion();
      shake = Math.max(shake, 3);
    }
  }

  function collidePowerups() {
    const pc = G.player.car;
    const pr = Car.radius(pc);
    for (const u of G.powerups) {
      if (u.taken) continue;
      if (U.circleOverlap(pc.x, pc.y, pr, u.x, u.y, u.r, 0)) {
        Powerup.take(u);
        Audio.powerupGet();
        Player.applyPickup(G.player, u.kind);
        HUD.bigMsg(u.label);
      }
    }
    const remaining = G.powerups.reduce((a, u) => a + (u.taken ? 0 : 1), 0);
    if (remaining < 8 && Math.random() < 0.02) {
      const { w, h } = World.size();
      let tries = 12, x = 0, z = 0;
      while (tries-- > 0) {
        x = U.rand(-w/2 + 6, w/2 - 6);
        z = U.rand(-h/2 + 6, h/2 - 6);
        const t = World.tileAt(x, z);
        if ((t === World.T.ROAD || t === World.T.SIDEWALK) &&
            U.dist(x, z, G.player.car.x, G.player.car.y) > 25) break;
      }
      const u = Powerup.make(x, z);
      u.mesh.position.set(x, 0, z);
      scene.add(u.mesh);
      G.powerups.push(u);
    }
  }

  function slowMo(scale, duration) {
    timeScale = Math.min(timeScale, scale);
    setTimeout(() => { timeScale = 1; }, duration * 1000);
  }

  // --- Endgame -------------------------------------------------------
  function gameOver() {
    state = STATE.GAMEOVER;
    Particles.explosion(G.player.car.x, 1, G.player.car.y);
    Audio.explosion();
    Audio.stopEngine(); Audio.stopMusic();
    shake = 8;
    const hi = loadHi();
    let recScore = false, recKills = false;
    if (G.score > hi.score) { hi.score = G.score; recScore = true; }
    if (G.kills > hi.kills) { hi.kills = G.kills; recKills = true; }
    saveHi(hi);
    document.getElementById("hi-score").textContent = hi.score.toLocaleString();
    document.getElementById("hi-kills").textContent = hi.kills.toString();
    document.getElementById("gameover-stats").innerHTML = `
      <div><b>SCORE</b>${G.score.toLocaleString()}${recScore ? "  <span style='color:#ffd700'>NEW RECORD!</span>" : ""}</div>
      <div><b>KILLS</b>${G.kills}${recKills ? "  <span style='color:#ffd700'>NEW RECORD!</span>" : ""}</div>
      <div><b>TIME</b>${U.formatTime(G.totalTime)}</div>
      <div><b>LEVEL</b>${G.level + 1}</div>
    `;
    HUD.show("gameover");
  }
  function finishLevel() {
    state = STATE.VICTORY;
    const hi = loadHi();
    if (G.score > hi.score) hi.score = G.score;
    if (G.kills > hi.kills) hi.kills = G.kills;
    saveHi(hi);
    document.getElementById("hi-score").textContent = hi.score.toLocaleString();
    document.getElementById("hi-kills").textContent = hi.kills.toString();
    document.getElementById("victory-stats").innerHTML = `
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
  function retry() {
    setupLevel(levelIndex);
    state = STATE.PLAYING;
    HUD.hide("gameover");
    Audio.startEngine(); Audio.startMusic();
  }
  function quitToMenu() {
    state = STATE.MENU;
    Audio.stopEngine(); Audio.stopMusic();
    HUD.hideHUD();
    HUD.hide("pause"); HUD.hide("gameover"); HUD.hide("victory");
    HUD.show("menu");
  }

  return { start, newGame, nextLevel, quitToMenu, retry,
           getState: () => state, getCamera: () => camera, getScene: () => scene };
})();

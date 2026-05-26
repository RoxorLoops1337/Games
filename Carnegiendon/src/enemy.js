// Rival drivers + cops + civilian traffic. All share the Car mesh; cops
// get a lightbar bolted on top and a flashing red/blue strobe.
const Enemy = (() => {
  const PALETTE = [
    { color: 0x226699, trim: 0x88ddff },
    { color: 0x229933, trim: 0xddff88 },
    { color: 0xaa66cc, trim: 0xffaaff },
    { color: 0xcc8822, trim: 0xffe088 },
    { color: 0x444444, trim: 0x888888 },
  ];

  function make(x, z, kind) {
    const k = kind ?? U.weighted([["rammer", 4], ["racer", 3], ["ped_hunter", 2]]);
    let color, trim, accel, maxSpeed, hp;
    if (k === "cop") {
      color = 0x1a1a3a; trim = 0xffffff;
      accel = 36; maxSpeed = 40; hp = 100;
    } else {
      const c = U.pick(PALETTE);
      color = c.color; trim = c.trim;
      accel = 24 + (k === "racer" ? 6 : 0);
      maxSpeed = 32 + (k === "racer" ? 8 : 0);
      hp = 80;
    }
    const car = Car.make({ x, y: z, color, trim, accel, maxSpeed, hp, maxHp: hp });

    const e = {
      car, kind: k,
      stateTimer: 0,
      target: { x, y: z },
      lastHonk: 0,
      sirenTimer: 0,
      dead: false,
      lightBar: null, lightL: null, lightR: null,
      civilian: false,
    };
    if (k === "cop") attachLightbar(e);
    return e;
  }

  function attachLightbar(e) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.25, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x111111 }),
    );
    bar.position.set(-0.2, 2.45, 0);
    const lL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.45),
                             new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    lL.position.set(-0.45, 2.5, 0);
    const lR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.45),
                             new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    lR.position.set(0.05, 2.5, 0);
    e.car.mesh.add(bar, lL, lR);
    e.lightBar = bar; e.lightL = lL; e.lightR = lR;
  }

  function pickWanderPoint(e) {
    const { w, h } = World.size();
    const half = w / 2 - 4;
    const halfH = h / 2 - 4;
    e.target = {
      x: U.clamp(e.car.x + U.rand(-30, 30), -half, half),
      y: U.clamp(e.car.y + U.rand(-30, 30), -halfH, halfH),
    };
    e.stateTimer = U.rand(2, 4);
  }

  function update(e, dt, player, peds) {
    if (e.dead) return;
    e.stateTimer -= dt;

    let tx = e.target.x, tz = e.target.y;
    let throttle = 0.7, steer = 0;

    if (e.kind === "rammer" || e.kind === "cop") {
      tx = player.car.x + player.car.vx * 0.2;
      tz = player.car.y + player.car.vy * 0.2;
      throttle = 1;
    } else if (e.kind === "racer") {
      if (e.stateTimer <= 0) pickWanderPoint(e);
      const d = U.dist(e.car.x, e.car.y, player.car.x, player.car.y);
      if (d < 18) {
        tx = player.car.x; tz = player.car.y; throttle = 1;
      }
    } else if (e.kind === "ped_hunter") {
      let best = null, bestD = Infinity;
      for (const p of peds) {
        if (p.dead) continue;
        const d = U.dist2(p.x, p.y, e.car.x, e.car.y);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best) { tx = best.x; tz = best.y; throttle = 1; }
      else if (e.stateTimer <= 0) pickWanderPoint(e);
    }

    const desired = U.angleTo(e.car.x, e.car.y, tx, tz);
    const diff = U.angleDiff(e.car.angle, desired);
    steer = U.clamp(diff * 2, -1, 1);
    if (Math.abs(diff) > 1.4) throttle *= 0.4;

    // Probe ahead for obstacles & swerve.
    const probeDist = 8 + Math.abs(e.car.speed) * 0.15;
    const px = e.car.x + Math.cos(e.car.angle) * probeDist;
    const pz = e.car.y + Math.sin(e.car.angle) * probeDist;
    for (const o of World.getObstacles()) {
      if (o.destroyed || !o.solid) continue;
      if (U.dist2(px, pz, o.x, o.y) < (o.r + 3) * (o.r + 3)) {
        steer += diff > 0 ? -0.6 : 0.6;
        throttle *= 0.7;
        break;
      }
    }

    Car.update(e.car, dt, { throttle, steer: U.clamp(steer, -1, 1) });
    Car.maybeTireTracks(e.car, dt);
    Car.emitTrails(e.car, dt);

    if (e.kind === "cop") {
      // Strobe the lightbar.
      const t = performance.now() / 100;
      const flash = Math.floor(t) % 2 === 0;
      e.lightL.material.color.setHex(flash ? 0xff0000 : 0x330033);
      e.lightR.material.color.setHex(flash ? 0x110022 : 0x2255ff);
      e.sirenTimer -= dt;
      if (e.sirenTimer <= 0) {
        e.sirenTimer = U.rand(1.4, 2.6);
        if (U.dist2(e.car.x, e.car.y, player.car.x, player.car.y) < 60 * 60) Audio.siren();
      }
    } else {
      e.lastHonk -= dt;
      if (e.lastHonk <= 0 && U.dist2(e.car.x, e.car.y, player.car.x, player.car.y) < 25 * 25) {
        e.lastHonk = U.rand(3, 7);
        if (Math.random() < 0.4) Audio.honk();
      }
    }
  }

  return { make, update };
})();

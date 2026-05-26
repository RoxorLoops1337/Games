// Rival drivers. Three personalities:
//   "rammer" — bears down on the player, swerves into them
//   "racer"  — drives fast laps, mostly avoids player but will sideswipe
//   "ped_hunter" — chases nearest pedestrian, ignores the player
const Enemy = (() => {
  const colors = [
    { color: "#226699", trim: "#88ddff" },
    { color: "#229933", trim: "#ddff88" },
    { color: "#aa66cc", trim: "#ffaaff" },
    { color: "#cc8822", trim: "#ffe088" },
    { color: "#444444", trim: "#888888" },
  ];

  function make(x, y, kind) {
    const k = kind ?? U.weighted([["rammer", 4], ["racer", 3], ["ped_hunter", 2]]);
    let color, trim, accel, maxSpeed, hp, brake = 480, turnRate = 2.4;
    if (k === "cop") {
      color = "#1a1a3a"; trim = "#ffffff";
      accel = 360; maxSpeed = 480; hp = 100; turnRate = 2.7;
    } else {
      const c = U.pick(colors);
      color = c.color; trim = c.trim;
      accel = 280 + (k === "racer" ? 80 : 0);
      maxSpeed = 420 + (k === "racer" ? 100 : 0);
      hp = 80;
    }
    const car = Car.make({
      x, y, color, trim,
      accel, maxSpeed, brake, turnRate,
      hp, maxHp: hp,
    });
    return {
      car,
      kind: k,
      stateTimer: 0,
      wanderAngle: Math.random() * U.TAU,
      target: { x, y },
      lastHonk: 0,
      sirenTimer: 0,
      dead: false,
    };
  }

  function pickWanderPoint(e) {
    const { w, h } = World.size();
    e.target = {
      x: U.clamp(e.car.x + U.rand(-300, 300), 80, w - 80),
      y: U.clamp(e.car.y + U.rand(-300, 300), 80, h - 80),
    };
    e.stateTimer = U.rand(2, 4);
  }

  function update(e, dt, player, peds) {
    if (e.dead) return;

    e.stateTimer -= dt;

    let tx = e.target.x, ty = e.target.y;
    let throttle = 0.7;
    let steer = 0;

    if (e.kind === "rammer" || e.kind === "cop") {
      tx = player.car.x + player.car.vx * 0.3;
      ty = player.car.y + player.car.vy * 0.3;
      throttle = 1;
    } else if (e.kind === "racer") {
      if (e.stateTimer <= 0) pickWanderPoint(e);
      // Sideswipe attempt if player is nearby.
      const d = U.dist(e.car.x, e.car.y, player.car.x, player.car.y);
      if (d < 180) {
        tx = player.car.x;
        ty = player.car.y;
        throttle = 1;
      }
    } else if (e.kind === "ped_hunter") {
      let best = null, bestD = Infinity;
      for (const p of peds) {
        if (p.dead) continue;
        const d = U.dist2(p.x, p.y, e.car.x, e.car.y);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best) { tx = best.x; ty = best.y; throttle = 1; }
      else if (e.stateTimer <= 0) pickWanderPoint(e);
    }

    // Steering: turn toward target.
    const desired = U.angleTo(e.car.x, e.car.y, tx, ty);
    const diff = U.angleDiff(e.car.angle, desired);
    steer = U.clamp(diff * 2, -1, 1);

    // Slow down when basically pointing the wrong way.
    if (Math.abs(diff) > 1.4) throttle *= 0.4;

    // Crude obstacle avoidance: probe ahead, steer away from solid stuff.
    const probeDist = 80 + Math.abs(e.car.speed) * 0.2;
    const px = e.car.x + Math.cos(e.car.angle) * probeDist;
    const py = e.car.y + Math.sin(e.car.angle) * probeDist;
    for (const o of World.getObstacles()) {
      if (o.destroyed || !o.solid) continue;
      if (U.dist2(px, py, o.x, o.y) < (o.r + 30) * (o.r + 30)) {
        steer += diff > 0 ? -0.6 : 0.6;
        throttle *= 0.7;
        break;
      }
    }

    Car.update(e.car, dt, { throttle, steer: U.clamp(steer, -1, 1) });
    Car.maybeTireTracks(e.car, dt);
    Car.emitTrails(e.car, dt);

    // Occasional siren for cops, honk for civilians.
    if (e.kind === "cop") {
      e.sirenTimer -= dt;
      if (e.sirenTimer <= 0) {
        e.sirenTimer = U.rand(1.4, 2.6);
        if (U.dist2(e.car.x, e.car.y, player.car.x, player.car.y) < 500 * 500) Audio.siren();
      }
    } else {
      e.lastHonk -= dt;
      if (e.lastHonk <= 0 && U.dist2(e.car.x, e.car.y, player.car.x, player.car.y) < 200*200) {
        e.lastHonk = U.rand(3, 7);
        if (Math.random() < 0.4) Audio.honk();
      }
    }
  }

  function draw(ctx, e) {
    if (e.dead) return;
    Car.draw(ctx, e.car);
    ctx.save();
    ctx.translate(e.car.x, e.car.y);
    ctx.rotate(e.car.angle);
    if (e.kind === "cop") {
      // Flashing red/blue lightbar mounted on the roof.
      const flash = Math.floor(performance.now() / 120) % 2 === 0;
      ctx.fillStyle = "#111";
      ctx.fillRect(-6, -8, 12, 4);
      ctx.fillStyle = flash ? "#ff0000" : "#0033ff";
      ctx.fillRect(-5, -7, 5, 2);
      ctx.fillStyle = flash ? "#0033ff" : "#ff0000";
      ctx.fillRect( 0, -7, 5, 2);
      // White door panel for the iconic black & white look.
      ctx.fillStyle = "#fff";
      ctx.fillRect(-2, -e.car.width/2, 4, e.car.width);
    } else {
      // Faction sticker on the roof so players can read them at a glance.
      ctx.fillStyle = e.kind === "rammer" ? "#ff2222" :
                      e.kind === "racer"  ? "#00ddff" :
                                            "#ffaa00";
      ctx.fillRect(-3, -3, 6, 6);
    }
    ctx.restore();
  }

  return { make, update, draw };
})();

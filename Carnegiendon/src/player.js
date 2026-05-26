// Player car: wraps a Car instance plus nitro state and the active
// power-ups dictionary.
const Player = (() => {
  function make(x, y) {
    const car = Car.make({
      x, y, color: "#cc0000", trim: "#ffcc00",
      accel: 380, maxSpeed: 540, brake: 580, turnRate: 2.9,
      grip: 6.5, driftGrip: 1.4, hp: 120, maxHp: 120,
    });
    return {
      car,
      kills: 0,
      maxNitro: 100, nitro: 100,
      nitroActive: false,
      powerups: {
        spike: 0,     // remaining seconds
        bloodlust: 0, // x2 score
        armor: 0,     // invincibility
        bigwheels: 0, // car crush enemies
        repair: 0,    // gradual heal
      },
    };
  }

  function update(p, dt, getIntent) {
    const intent = getIntent();
    // Nitro: drains over time, recharges slowly when not in use.
    const wantsBoost = intent.nitro && p.nitro > 0 && intent.throttle > 0;
    if (wantsBoost) {
      if (!p.nitroActive) Audio.nitroBoost();
      p.nitroActive = true;
      p.nitro = Math.max(0, p.nitro - dt * 45);
      p.car.maxSpeed = 760;
      p.car.accel = 620;
      const [fx, fy] = U.rotate(-p.car.length/2, 0, p.car.angle);
      Particles.fire(p.car.x + fx, p.car.y + fy, { vx: -Math.cos(p.car.angle) * 80, vy: -Math.sin(p.car.angle) * 80 });
    } else {
      p.nitroActive = false;
      p.car.maxSpeed = 540;
      p.car.accel = 380;
      p.nitro = Math.min(p.maxNitro, p.nitro + dt * 8);
    }

    // Powerup countdown.
    for (const k of Object.keys(p.powerups)) {
      if (p.powerups[k] > 0) p.powerups[k] = Math.max(0, p.powerups[k] - dt);
    }
    if (p.powerups.repair > 0) {
      p.car.hp = Math.min(p.car.maxHp, p.car.hp + dt * 25);
    }

    Car.update(p.car, dt, intent);
    Car.maybeTireTracks(p.car, dt);
    Car.emitTrails(p.car, dt);

    // Engine audio pegged to actual speed.
    const sp01 = U.clamp(Math.abs(p.car.speed) / p.car.maxSpeed, 0, 1);
    Audio.updateEngine(sp01 * (p.nitroActive ? 1.2 : 1));
  }

  function applyPickup(p, kind) {
    switch (kind) {
      case "nitro":     p.nitro = p.maxNitro; break;
      case "spike":     p.powerups.spike = 12; break;
      case "bloodlust": p.powerups.bloodlust = 12; break;
      case "repair":
        p.car.hp = Math.min(p.car.maxHp, p.car.hp + 50);
        p.powerups.repair = 5;
        break;
      case "armor":     p.powerups.armor = 8; break;
      case "bigwheels": p.powerups.bigwheels = 10; break;
    }
  }

  function isInvincible(p) { return p.powerups.armor > 0; }

  function draw(ctx, p) {
    Car.draw(ctx, p.car);
    // armor glow halo
    if (isInvincible(p)) {
      ctx.strokeStyle = "rgba(255,255,180,0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.car.x, p.car.y, Car.radius(p.car) + 6 + Math.sin(performance.now() / 100) * 2, 0, U.TAU);
      ctx.stroke();
    }
    // spike wheels
    if (p.powerups.spike > 0) {
      ctx.fillStyle = "#888";
      for (const [dx, dy] of [[-p.car.length/2+8,-p.car.width/2],[-p.car.length/2+8,p.car.width/2],
                              [ p.car.length/2-8,-p.car.width/2],[ p.car.length/2-8,p.car.width/2]]) {
        const [wx, wy] = U.rotate(dx, dy, p.car.angle);
        ctx.beginPath();
        ctx.arc(p.car.x + wx, p.car.y + wy, 5, 0, U.TAU);
        ctx.fill();
      }
    }
  }

  return { make, update, applyPickup, isInvincible, draw };
})();

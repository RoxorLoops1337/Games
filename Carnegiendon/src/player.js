// The player. Wraps a Car with nitro state, power-ups, and the chase
// camera. The camera follows the car with a smoothed look-ahead so
// hard turns don't feel like a whip.
const Player = (() => {
  const VIEW = { THIRD: 0, FIRST: 1, FAR: 2 };

  function make(x, z) {
    const car = Car.make({
      x, y: z,
      color: 0xcc0000, trim: 0xffcc00,
      accel: 30, maxSpeed: 42, brake: 50, turnRate: 2.6,
      grip: 6.5, driftGrip: 1.4, hp: 120, maxHp: 120,
    });
    return {
      car,
      kills: 0,
      maxNitro: 100, nitro: 100,
      nitroActive: false,
      powerups: {
        spike: 0, bloodlust: 0, armor: 0, bigwheels: 0, repair: 0,
      },
      view: VIEW.THIRD,
      // Smoothed camera target so we ease rather than snap.
      camPos: new THREE.Vector3(0, 8, -16),
      camLook: new THREE.Vector3(0, 1, 0),
    };
  }

  function update(p, dt, intent) {
    const wantsBoost = intent.nitro && p.nitro > 0 && intent.throttle > 0;
    if (wantsBoost) {
      if (!p.nitroActive) Audio.nitroBoost();
      p.nitroActive = true;
      p.nitro = Math.max(0, p.nitro - dt * 45);
      p.car.maxSpeed = 70;
      p.car.accel = 50;
      // Exhaust particles trail behind.
      const bx = p.car.x - Math.cos(p.car.angle) * 2.4;
      const bz = p.car.y - Math.sin(p.car.angle) * 2.4;
      Particles.fire(bx, 0.8, bz, -Math.cos(p.car.angle) * 6, -Math.sin(p.car.angle) * 6);
    } else {
      p.nitroActive = false;
      p.car.maxSpeed = 42;
      p.car.accel = 30;
      p.nitro = Math.min(p.maxNitro, p.nitro + dt * 8);
    }

    for (const k of Object.keys(p.powerups)) {
      if (p.powerups[k] > 0) p.powerups[k] = Math.max(0, p.powerups[k] - dt);
    }
    if (p.powerups.repair > 0) {
      p.car.hp = Math.min(p.car.maxHp, p.car.hp + dt * 25);
    }

    Car.update(p.car, dt, intent);
    Car.maybeTireTracks(p.car, dt);
    Car.emitTrails(p.car, dt);

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
        p.powerups.repair = 5; break;
      case "armor":     p.powerups.armor = 8; break;
      case "bigwheels": p.powerups.bigwheels = 10; break;
    }
  }

  function isInvincible(p) { return p.powerups.armor > 0; }

  function cycleView(p) {
    p.view = (p.view + 1) % 3;
  }

  // Compute and apply this frame's camera placement. Called from game.js
  // each tick. `camera` is the shared THREE.PerspectiveCamera.
  function updateCamera(p, camera, dt) {
    const car = p.car;
    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);
    let off, height, ahead, lookHeight;
    if (p.view === VIEW.THIRD) {
      off = 12; height = 6; ahead = 14; lookHeight = 1.5;
    } else if (p.view === VIEW.FIRST) {
      // In-car: just above the dashboard, looking forward.
      off = -0.5; height = 1.8; ahead = 20; lookHeight = 1.8;
    } else {
      off = 22; height = 14; ahead = 18; lookHeight = 0;
    }
    const wantX = car.x - cos * off;
    const wantZ = car.y - sin * off;
    const wantY = height;
    const lookX = car.x + cos * ahead;
    const lookZ = car.y + sin * ahead;

    // Faster ease when in first-person so we don't see "through" the car.
    const t = U.clamp(dt * (p.view === VIEW.FIRST ? 16 : 5), 0, 1);
    p.camPos.x = U.lerp(p.camPos.x, wantX, t);
    p.camPos.y = U.lerp(p.camPos.y, wantY, t);
    p.camPos.z = U.lerp(p.camPos.z, wantZ, t);
    p.camLook.x = U.lerp(p.camLook.x, lookX, t);
    p.camLook.y = U.lerp(p.camLook.y, lookHeight, t);
    p.camLook.z = U.lerp(p.camLook.z, lookZ, t);

    camera.position.copy(p.camPos);
    camera.lookAt(p.camLook);

    // Hide the player's own car when in first-person so we don't see the
    // chassis floating in front of us.
    car.mesh.visible = (p.view !== VIEW.FIRST);
  }

  return { make, update, applyPickup, isInvincible, cycleView, updateCamera, VIEW };
})();

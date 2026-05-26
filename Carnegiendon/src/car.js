// Generic arcade car physics + rendering. Used by Player and Enemy.
// Movement is decomposed into a "forward" velocity along the car's heading
// and a "lateral" velocity perpendicular to it. Lateral velocity decays
// fast (grip) so the car feels planted, slower while handbraking (drift).
const Car = (() => {
  function make(opts = {}) {
    return {
      x: opts.x ?? 0,
      y: opts.y ?? 0,
      angle: opts.angle ?? -Math.PI / 2,
      vx: 0, vy: 0,
      speed: 0,            // signed forward speed (px/s)
      lateral: 0,          // perpendicular drift speed (px/s)
      // physics tuning
      accel: opts.accel ?? 320,
      brake: opts.brake ?? 520,
      reverseAccel: opts.reverseAccel ?? 180,
      maxSpeed: opts.maxSpeed ?? 520,
      reverseMax: opts.reverseMax ?? 220,
      drag: opts.drag ?? 0.7,            // forward drag (per second)
      grip: opts.grip ?? 6.5,            // lateral velocity decay
      driftGrip: opts.driftGrip ?? 1.4,
      turnRate: opts.turnRate ?? 2.6,    // rad/s at full speed
      // chassis
      length: opts.length ?? 48,
      width: opts.width ?? 26,
      color: opts.color ?? "#cc0000",
      trim: opts.trim ?? "#ffaa00",
      windowColor: opts.windowColor ?? "#88ccff",
      // state
      hp: opts.hp ?? 100,
      maxHp: opts.maxHp ?? 100,
      driver: opts.driver ?? "player",
      handbrake: false,
      smoking: false,
      onFire: false,
      // tire-track timing
      lastTrack: 0,
      // bouncing visuals
      bounce: 0,
    };
  }

  // Apply driver intents (throttle [-1..1], steer [-1..1], handbrake bool)
  // and integrate one timestep.
  function update(car, dt, intent) {
    const throttle = U.clamp(intent.throttle ?? 0, -1, 1);
    const steer = U.clamp(intent.steer ?? 0, -1, 1);
    car.handbrake = !!intent.handbrake;

    // Forward thrust.
    if (throttle > 0) {
      // accelerate forward — when reversing, this acts as a brake.
      if (car.speed < 0) car.speed += car.brake * dt;
      else car.speed += car.accel * throttle * dt;
    } else if (throttle < 0) {
      if (car.speed > 0) car.speed -= car.brake * dt;
      else car.speed += car.reverseAccel * throttle * dt;
    } else {
      // engine drag/coast
      const sign = Math.sign(car.speed);
      car.speed -= sign * car.drag * 60 * dt;
      if (Math.sign(car.speed) !== sign) car.speed = 0;
    }
    car.speed = U.clamp(car.speed, -car.reverseMax, car.maxSpeed);

    // Steering — scales with speed so parked cars don't pirouette.
    const speedFactor = U.clamp(Math.abs(car.speed) / 200, 0, 1);
    const dir = car.speed < 0 ? -1 : 1;
    car.angle += steer * car.turnRate * speedFactor * dt * dir;

    // Convert speed/lateral into world velocity using the heading.
    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);
    car.vx = cos * car.speed + (-sin) * car.lateral;
    car.vy = sin * car.speed + ( cos) * car.lateral;

    // When handbraking we shed grip → the steering input bleeds into the
    // lateral channel, producing a slide.
    const gripK = car.handbrake ? car.driftGrip : car.grip;
    if (car.handbrake && Math.abs(car.speed) > 60) {
      car.lateral += steer * Math.abs(car.speed) * 1.4 * dt;
    }
    car.lateral *= Math.exp(-gripK * dt);

    // Integrate position.
    car.x += car.vx * dt;
    car.y += car.vy * dt;

    // Visual bounce decays.
    car.bounce *= Math.exp(-6 * dt);

    // Smoking / fire from low HP — handled by caller via setStatus().
    if (car.hp < car.maxHp * 0.4) car.smoking = true;
    if (car.hp < car.maxHp * 0.18) car.onFire = true;
  }

  function setBounce(car, amt = 4) {
    car.bounce = Math.max(car.bounce, amt);
  }

  // Emit smoke/fire trails based on damage state. Called by game.js.
  function emitTrails(car, dt) {
    if (car.smoking) {
      if (Math.random() < dt * 30) {
        const [bx, by] = U.rotate(-car.length/2, 0, car.angle);
        Particles.smoke(car.x + bx, car.y + by, { color: "rgba(40,40,40,0.7)" });
      }
    }
    if (car.onFire) {
      if (Math.random() < dt * 35) {
        const [bx, by] = U.rotate(-car.length/2, 0, car.angle);
        Particles.fire(car.x + bx, car.y + by);
      }
    }
  }

  // Lay rubber when sliding hard or handbraking at speed.
  function maybeTireTracks(car, dt) {
    car.lastTrack -= dt;
    if (car.lastTrack > 0) return;
    const sliding = car.handbrake && Math.abs(car.speed) > 80;
    const skidding = Math.abs(car.lateral) > 80;
    if (!sliding && !skidding) return;
    car.lastTrack = 0.018;
    Particles.tireTrack(car.x, car.y, car.angle, car.width + 4);
  }

  // OBB approx: use car length/width as bounding circle radius.
  function radius(car) { return Math.max(car.length, car.width) * 0.42; }

  // Apply a collision impulse from a point hit. Reduces speed and adds
  // some lateral kick depending on impact angle.
  function impact(car, fromX, fromY, force) {
    const ang = U.angleTo(fromX, fromY, car.x, car.y);
    const rel = U.angleDiff(car.angle, ang);
    car.speed *= 0.65;
    car.lateral += Math.sin(rel) * force * 0.5;
    setBounce(car, U.clamp(force * 0.05, 1, 8));
  }

  function draw(ctx, car) {
    const { x, y, angle, length, width, color, trim, windowColor, bounce } = car;
    ctx.save();
    // shadow
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.save();
    ctx.rotate(angle);
    ctx.fillRect(-length/2 + 2, -width/2 + 3, length, width);
    ctx.restore();
    // body
    ctx.rotate(angle);
    const yScale = 1 + bounce * 0.04;
    ctx.scale(1, yScale);
    ctx.fillStyle = color;
    ctx.fillRect(-length/2, -width/2, length, width);
    // bumper & detail
    ctx.fillStyle = "#222";
    ctx.fillRect(length/2 - 4, -width/2, 4, width);
    ctx.fillRect(-length/2, -width/2, 4, width);
    // wheels
    ctx.fillStyle = "#111";
    ctx.fillRect(-length/2 + 4, -width/2 - 2, 8, 4);
    ctx.fillRect(-length/2 + 4,  width/2 - 2, 8, 4);
    ctx.fillRect(length/2 - 12, -width/2 - 2, 8, 4);
    ctx.fillRect(length/2 - 12,  width/2 - 2, 8, 4);
    // windshield
    ctx.fillStyle = windowColor;
    ctx.fillRect(length/2 - 18, -width/2 + 4, 8, width - 8);
    ctx.fillRect(-length/2 + 10, -width/2 + 4, 8, width - 8);
    // hood stripe
    ctx.fillStyle = trim;
    ctx.fillRect(-length/2 + 18, -2, length - 36, 4);
    // outline
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-length/2, -width/2, length, width);

    // damage cracks: more = more damage
    const dmg = 1 - U.clamp(car.hp / car.maxHp, 0, 1);
    if (dmg > 0.2) {
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-length/4, -width/4);
      ctx.lineTo( length/4,  width/4);
      ctx.moveTo(-length/3,  width/4);
      ctx.lineTo( length/4, -width/3);
      ctx.stroke();
    }
    if (dmg > 0.55) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(-length/3, -width/3, 6, 6);
      ctx.fillRect( length/6,  width/4, 6, 4);
    }

    ctx.restore();
  }

  return { make, update, emitTrails, maybeTireTracks, draw, radius, impact, setBounce };
})();

// 3D car: a Group of meshes (chassis, cabin, hood, windows, wheels) plus
// the same arcade physics model as before. Positions live in (x, y) where
// y is world-Z; meshes are synced each frame.
const Car = (() => {
  function makeMesh(color, trim) {
    const g = new THREE.Group();
    const bodyMat   = new THREE.MeshLambertMaterial({ color });
    const trimMat   = new THREE.MeshLambertMaterial({ color: trim });
    const cabinMat  = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const wheelMat  = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const glassMat  = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.85 });
    const lightMatF = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
    const lightMatR = new THREE.MeshBasicMaterial({ color: 0xff3322 });

    // Chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.0, 2.2), bodyMat);
    chassis.position.y = 0.85;
    g.add(chassis);
    // Hood stripe
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.06, 0.4), trimMat);
    stripe.position.set(0.4, 1.4, 0);
    g.add(stripe);
    // Cabin (offset slightly back)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 1.9), bodyMat);
    cabin.position.set(-0.2, 1.85, 0);
    g.add(cabin);
    // Windshield + back window as colored quads on the cabin.
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.85), glassMat);
    windshield.position.set(1.05, 1.95, 0);
    windshield.rotation.y = Math.PI / 2;
    windshield.rotation.z = -Math.PI / 8;
    g.add(windshield);
    const backWin = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.85), glassMat);
    backWin.position.set(-1.45, 1.95, 0);
    backWin.rotation.y = -Math.PI / 2;
    backWin.rotation.z = -Math.PI / 8;
    g.add(backWin);
    // Side windows on each cabin face
    for (const z of [-0.96, 0.96]) {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), glassMat);
      sw.position.set(-0.2, 1.95, z);
      sw.rotation.y = z > 0 ? Math.PI : 0;
      g.add(sw);
    }
    // Wheels — keep refs so we can spin them visually.
    const wheels = [];
    for (const [dx, dz] of [[-1.6, -1.15], [1.6, -1.15], [-1.6, 1.15], [1.6, 1.15]]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.45, 10), wheelMat);
      wh.rotation.x = Math.PI / 2;
      wh.position.set(dx, 0.5, dz);
      g.add(wh);
      wheels.push(wh);
    }
    // Headlights
    const lhL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.4), lightMatF);
    lhL.position.set(2.32, 1.0, -0.7);
    const lhR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.4), lightMatF);
    lhR.position.set(2.32, 1.0, 0.7);
    g.add(lhL, lhR);
    // Brakelights
    const brL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.4), lightMatR);
    brL.position.set(-2.32, 1.0, -0.7);
    const brR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.4), lightMatR);
    brR.position.set(-2.32, 1.0, 0.7);
    g.add(brL, brR);

    return { group: g, wheels };
  }

  function make(opts = {}) {
    const carMesh = makeMesh(opts.color ?? 0xcc0000, opts.trim ?? 0xffaa00);
    const car = {
      x: opts.x ?? 0, y: opts.y ?? 0,    // world XZ
      angle: opts.angle ?? 0,
      vx: 0, vy: 0,
      speed: 0, lateral: 0,
      accel: opts.accel ?? 26,
      brake: opts.brake ?? 42,
      reverseAccel: opts.reverseAccel ?? 14,
      maxSpeed: opts.maxSpeed ?? 38,
      reverseMax: opts.reverseMax ?? 16,
      drag: opts.drag ?? 0.5,
      grip: opts.grip ?? 6.5,
      driftGrip: opts.driftGrip ?? 1.4,
      turnRate: opts.turnRate ?? 2.6,
      length: 4.6, width: 2.2,
      color: opts.color ?? 0xcc0000,
      hp: opts.hp ?? 100, maxHp: opts.maxHp ?? 100,
      handbrake: false,
      smoking: false, onFire: false,
      bounce: 0,
      yawTilt: 0, rollTilt: 0,
      airborne: 0,
      mesh: carMesh.group,
      wheels: carMesh.wheels,
      wheelSpin: 0,
      lastTrack: 0,
    };
    return car;
  }

  function update(car, dt, intent) {
    const throttle = U.clamp(intent.throttle ?? 0, -1, 1);
    const steer = U.clamp(intent.steer ?? 0, -1, 1);
    car.handbrake = !!intent.handbrake;

    if (throttle > 0) {
      if (car.speed < 0) car.speed += car.brake * dt;
      else car.speed += car.accel * throttle * dt;
    } else if (throttle < 0) {
      if (car.speed > 0) car.speed -= car.brake * dt;
      else car.speed += car.reverseAccel * throttle * dt;
    } else {
      const sign = Math.sign(car.speed);
      car.speed -= sign * car.drag * dt * 6;
      if (Math.sign(car.speed) !== sign) car.speed = 0;
    }
    car.speed = U.clamp(car.speed, -car.reverseMax, car.maxSpeed);

    const speedFactor = U.clamp(Math.abs(car.speed) / 12, 0, 1);
    const dir = car.speed < 0 ? -1 : 1;
    car.angle += steer * car.turnRate * speedFactor * dt * dir;

    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);
    car.vx = cos * car.speed + (-sin) * car.lateral;
    car.vy = sin * car.speed + ( cos) * car.lateral;

    const gripK = car.handbrake ? car.driftGrip : car.grip;
    if (car.handbrake && Math.abs(car.speed) > 4) {
      car.lateral += steer * Math.abs(car.speed) * 1.4 * dt;
    }
    car.lateral *= Math.exp(-gripK * dt);

    car.x += car.vx * dt;
    car.y += car.vy * dt;

    // Visual tilts (purely cosmetic): roll into turns, pitch under accel.
    const targetRoll = -steer * U.clamp(Math.abs(car.speed) / car.maxSpeed, 0, 1) * 0.2;
    const targetPitch = U.clamp(throttle * 0.05 - (car.speed * 0.001) * 0, -0.1, 0.1);
    car.rollTilt = U.lerp(car.rollTilt, targetRoll, U.clamp(dt * 6, 0, 1));
    car.yawTilt = U.lerp(car.yawTilt, targetPitch, U.clamp(dt * 4, 0, 1));

    car.bounce *= Math.exp(-6 * dt);
    if (car.airborne > 0) car.airborne = Math.max(0, car.airborne - dt);

    car.wheelSpin += car.speed * dt * 1.6;
    for (const wh of car.wheels) wh.rotation.x = Math.PI / 2 + car.wheelSpin;
    // Front wheels also steer.
    if (car.wheels.length >= 4) {
      car.wheels[1].rotation.y = steer * 0.4;
      car.wheels[3].rotation.y = steer * 0.4;
    }

    if (car.hp < car.maxHp * 0.4) car.smoking = true;
    if (car.hp < car.maxHp * 0.18) car.onFire = true;

    syncMesh(car);
  }

  function syncMesh(car) {
    car.mesh.position.x = car.x;
    car.mesh.position.z = car.y;
    car.mesh.position.y = car.airborne * 0.6 + car.bounce * 0.15;
    car.mesh.rotation.y = -car.angle;
    // Roll/pitch are applied via the mesh's local rotation Z/X. To get the
    // right axis after the Y rotation, we set rotation order and use
    // separate values.
    car.mesh.rotation.order = "YXZ";
    car.mesh.rotation.x = car.yawTilt;
    car.mesh.rotation.z = car.rollTilt;
  }

  function emitTrails(car, dt) {
    if (car.smoking) {
      if (Math.random() < dt * 25) {
        const bx = car.x - Math.cos(car.angle) * 2.4;
        const bz = car.y - Math.sin(car.angle) * 2.4;
        Particles.smoke(bx, 1.2, bz);
      }
    }
    if (car.onFire) {
      if (Math.random() < dt * 35) {
        const bx = car.x - Math.cos(car.angle) * 2.4;
        const bz = car.y - Math.sin(car.angle) * 2.4;
        Particles.fire(bx, 1.0, bz);
      }
    }
  }

  function maybeTireTracks(car, dt) {
    car.lastTrack -= dt;
    if (car.lastTrack > 0) return;
    const sliding = car.handbrake && Math.abs(car.speed) > 6;
    const skidding = Math.abs(car.lateral) > 5;
    if (!sliding && !skidding) return;
    car.lastTrack = 0.04;
    // Lay marks under each wheel.
    for (const [dx, dz] of [[-1.6,-1.15],[1.6,-1.15],[-1.6,1.15],[1.6,1.15]]) {
      const c = Math.cos(car.angle), s = Math.sin(car.angle);
      const wx = car.x + dx * c - dz * s;
      const wz = car.y + dx * s + dz * c;
      World.paintTireMark(wx, wz);
    }
  }

  function radius(car) { return Math.max(car.length, car.width) * 0.5; }

  function impact(car, fromX, fromZ, force) {
    const ang = U.angleTo(fromX, fromZ, car.x, car.y);
    const rel = U.angleDiff(car.angle, ang);
    car.speed *= 0.65;
    car.lateral += Math.sin(rel) * force * 0.4;
    car.bounce = Math.max(car.bounce, U.clamp(force * 0.05, 0.8, 6));
  }

  function setBounce(car, amt = 1.5) { car.bounce = Math.max(car.bounce, amt); }

  function addToScene(car, scene) { scene.add(car.mesh); }
  function removeFromScene(car) {
    if (car.mesh && car.mesh.parent) car.mesh.parent.remove(car.mesh);
  }

  return {
    make, update, emitTrails, maybeTireTracks, syncMesh,
    radius, impact, setBounce, addToScene, removeFromScene,
  };
})();

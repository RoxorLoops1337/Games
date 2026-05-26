// 3D pedestrians. Each one is a small Group of meshes — boots/pants
// (box), torso/shirt (box), head (sphere). Cheap geometry but enough
// silhouette to read at car speed. The same wander/panic/flee AI as
// before; positions are 2D (x, y where y is world-Z).
const Pedestrian = (() => {
  const STATE = { WANDER: 0, PANIC: 1, FLEE: 2 };

  const SHIRT_COLORS = [
    0x3366aa, 0xaa3333, 0xaa9933, 0x338866, 0xcc6622, 0xff66aa, 0x222222,
    0xddee33, 0x55ccff, 0xff8800,
  ];
  const SKIN_COLORS = [0xf3c69b, 0xcaa07a, 0xe3b58a, 0xa47a55, 0xd5a37e, 0xb08868];
  const PANT_COLORS = [0x222222, 0x444444, 0x1b3a1b, 0x552233, 0x222266, 0x778877];

  function make(x, z) {
    const type = U.weighted([
      ["normal", 8], ["fat", 2], ["kid", 2], ["clown", 1], ["jogger", 2],
    ]);
    let scale = 1, bodyScale = 1;
    let shirt = U.pick(SHIRT_COLORS);
    let pants = U.pick(PANT_COLORS);
    if (type === "fat") { bodyScale = 1.4; }
    if (type === "kid") { scale = 0.7; }
    if (type === "clown") { shirt = 0xff44aa; pants = 0x44ccff; }
    if (type === "jogger") { shirt = 0x33dd33; pants = 0x111111; }
    const skin = U.pick(SKIN_COLORS);

    const group = new THREE.Group();
    const pantsMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5 * bodyScale, 0.9, 0.4),
      new THREE.MeshLambertMaterial({ color: pants }),
    );
    pantsMesh.position.y = 0.45;
    const shirtMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.55 * bodyScale, 0.8, 0.45),
      new THREE.MeshLambertMaterial({ color: shirt }),
    );
    shirtMesh.position.y = 1.3;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshLambertMaterial({ color: skin }),
    );
    head.position.y = 2.0;
    group.add(pantsMesh, shirtMesh, head);
    if (type === "clown") {
      const nose = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }),
      );
      nose.position.set(0.25, 2.0, 0);
      group.add(nose);
      const hat = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.4, 8),
        new THREE.MeshLambertMaterial({ color: 0xffff33 }),
      );
      hat.position.y = 2.35;
      group.add(hat);
    }
    group.scale.set(scale, scale, scale);

    return {
      x, y: z,
      vx: 0, vy: 0,
      angle: Math.random() * U.TAU,
      speed: U.rand(3.0, 5.5),
      state: STATE.WANDER,
      stateTimer: U.rand(1, 3),
      target: { x, y: z },
      r: 0.5,
      bobPhase: Math.random() * U.TAU,
      bobSpeed: U.rand(7, 12),
      dead: false,
      panicScreamed: false,
      type,
      mesh: group,
      parts: { legs: pantsMesh, torso: shirtMesh, head },
    };
  }

  function pickNewTarget(p) {
    const spawns = World.getSpawns();
    if (!spawns.length) return;
    let tries = 8;
    while (tries-- > 0) {
      const s = U.pick(spawns);
      if (U.dist2(s.x, s.y, p.x, p.y) < 60 * 60) {
        p.target = { x: s.x + U.rand(-2, 2), y: s.y + U.rand(-2, 2) };
        return;
      }
    }
    p.target = U.pick(spawns);
  }

  function setPanic(p, threatX, threatZ) {
    p.state = STATE.FLEE;
    p.stateTimer = U.rand(1.5, 3);
    const ang = U.angleTo(threatX, threatZ, p.x, p.y);
    const dist = U.dist(threatX, threatZ, p.x, p.y);
    p.target = {
      x: p.x + Math.cos(ang) * (dist + 22),
      y: p.y + Math.sin(ang) * (dist + 22),
    };
    if (!p.panicScreamed && Math.random() < 0.3) {
      Audio.scream();
      p.panicScreamed = true;
    }
  }

  function update(p, dt, threat) {
    if (p.dead) return;

    if (threat) {
      const d = U.dist(p.x, p.y, threat.x, threat.y);
      const threatRange = 10 + Math.min(Math.abs(threat.speed) * 0.4, 16);
      if (d < threatRange) setPanic(p, threat.x, threat.y);
      else if (d < 22 && Math.random() < 0.01) p.state = STATE.PANIC;
    }

    p.stateTimer -= dt;
    if (p.stateTimer <= 0) {
      if (p.state === STATE.FLEE) {
        p.state = STATE.WANDER;
        p.panicScreamed = false;
      }
      p.stateTimer = U.rand(1.4, 3.2);
      if (p.state !== STATE.FLEE) pickNewTarget(p);
    }

    if (p.target.x === p.x && p.target.y === p.y) pickNewTarget(p);

    const dx = p.target.x - p.x;
    const dz = p.target.y - p.y;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) {
      pickNewTarget(p);
    } else {
      const speedMul = p.state === STATE.FLEE ? 2.1 :
                       p.state === STATE.PANIC ? 1.4 : 1;
      p.angle = Math.atan2(dz, dx);
      p.vx = (dx / d) * p.speed * speedMul;
      p.vy = (dz / d) * p.speed * speedMul;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.bobPhase += p.bobSpeed * dt * speedMul;
    }

    syncMesh(p);
  }

  function syncMesh(p) {
    p.mesh.position.x = p.x;
    p.mesh.position.z = p.y;
    // Animate a tiny walk bob in the torso.
    const bob = Math.sin(p.bobPhase) * 0.08;
    p.parts.torso.position.y = 1.3 + bob;
    p.parts.head.position.y = 2.0 + bob;
    p.mesh.rotation.y = -p.angle + Math.PI / 2;
    // Tip forward when fleeing.
    p.mesh.rotation.x = p.state === STATE.FLEE ? 0.15 : 0;
  }

  function kill(p, force, hitX, hitZ, bonusMult = 1) {
    if (p.dead) return 0;
    p.dead = true;
    const intensity = U.clamp(force / 18, 0.5, 2.4);
    // Paint blood on the ground + a shower of red particles.
    World.paintBlood(p.x, p.y, intensity);
    Particles.bloodBurst(p.x, 1, p.y, intensity);
    // Send the body parts flying.
    flingBody(p, hitX, hitZ, force);
    Audio.splat();
    if (Math.random() < 0.7) Audio.scream();
    return Math.floor(100 * intensity * bonusMult);
  }

  // The corpse: detach each body mesh from the ped group, lift it into
  // world space, and hand it to the particle system as physics debris.
  // Each chunk tumbles, falls, and bleeds the ground where it lands.
  function flingBody(p, hitX, hitZ, force) {
    const parent = p.mesh.parent;       // the THREE.Scene
    if (!parent) return;
    const partsArr = [p.parts.legs, p.parts.torso, p.parts.head];
    const ang = U.angleTo(hitX, hitZ, p.x, p.y);
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    for (const part of partsArr) {
      // Capture world transform before reparenting (after add(), the
      // local transform becomes the world transform since parent is the
      // scene root).
      part.getWorldPosition(worldPos);
      part.getWorldQuaternion(worldQuat);
      parent.add(part);                  // Three.js auto-detaches from p.mesh
      part.position.copy(worldPos);
      part.quaternion.copy(worldQuat);
      Particles.addDebris(part, {
        vx: Math.cos(ang) * U.rand(8, 18) + U.rand(-3, 3),
        vy: U.rand(6, 12),
        vz: Math.sin(ang) * U.rand(8, 18) + U.rand(-3, 3),
        rx: U.rand(-6, 6), ry: U.rand(-6, 6), rz: U.rand(-6, 6),
        life: U.rand(1.5, 3),
        bloody: true,
      });
    }
    parent.remove(p.mesh);
  }

  return { make, update, syncMesh, kill, STATE };
})();

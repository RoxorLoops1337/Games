// 3D particle effects. Three flavors live here:
//   - Short-lived sprite-ish bits (blood drops, smoke puffs, sparks, fire)
//     rendered as small unlit cubes that scale + fade as they age.
//   - Persistent "debris" objects that are existing meshes (body parts
//     from squished peds) which keep their full geometry while tumbling.
//   - A water-jet emitter used by destroyed fire hydrants.
// All of them go through update(dt) which advances physics and prunes
// dead entries.
const Particles = (() => {
  let scene = null;
  const live = [];   // sprite-ish particles
  const debris = []; // existing meshes flung through the air

  function init(sceneRef) { scene = sceneRef; }

  function reset() {
    for (const p of live) if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
    for (const d of debris) if (d.mesh && d.mesh.parent) d.mesh.parent.remove(d.mesh);
    live.length = 0;
    debris.length = 0;
  }

  function makeQuick(x, y, z, color, size, life) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }),
    );
    m.position.set(x, y, z);
    scene.add(m);
    const p = {
      mesh: m, x, y, z, vx: 0, vy: 0, vz: 0,
      drag: 0.92, gravity: 0, size, color,
      life, maxLife: life, growth: 0, spin: 0,
    };
    live.push(p);
    return p;
  }

  function bloodBurst(x, y, z, intensity = 1) {
    const drops = 14 + Math.floor(intensity * 18);
    for (let i = 0; i < drops; i++) {
      const a = Math.random() * U.TAU;
      const sp = U.rand(4, 12) * intensity;
      const p = makeQuick(x, y, z,
        U.pick([0xc00000, 0xa00000, 0xff2222, 0x800000]),
        U.rand(0.15, 0.35),
        U.rand(0.4, 0.9));
      p.vx = Math.cos(a) * sp;
      p.vy = U.rand(2, 7);
      p.vz = Math.sin(a) * sp;
      p.gravity = -22;
      p.drag = 0.96;
    }
  }

  function smoke(x, y, z, opts = {}) {
    const p = makeQuick(x, y, z, 0x404040, 0.9, U.rand(0.8, 1.4));
    p.mesh.material.color.setHex(opts.color ?? 0x404040);
    p.vx = U.rand(-2, 2) + (opts.vx ?? 0);
    p.vy = U.rand(2, 4);
    p.vz = U.rand(-2, 2) + (opts.vz ?? 0);
    p.growth = 1.6;
    p.drag = 0.94;
    p.mesh.material.opacity = 0.6;
  }

  function fire(x, y, z, vx = 0, vz = 0) {
    const p = makeQuick(x, y, z,
      U.pick([0xffcc00, 0xff8800, 0xff4400, 0xff0000]),
      U.rand(0.3, 0.7),
      U.rand(0.25, 0.55));
    p.vx = U.rand(-2, 2) + vx;
    p.vy = U.rand(1, 4);
    p.vz = U.rand(-2, 2) + vz;
    p.growth = -0.8;
    p.drag = 0.92;
  }

  function spark(x, y, z) {
    const a = Math.random() * U.TAU;
    const sp = U.rand(6, 14);
    const p = makeQuick(x, y, z,
      U.pick([0xffffaa, 0xffaa00, 0xffffff]),
      U.rand(0.08, 0.18),
      U.rand(0.15, 0.35));
    p.vx = Math.cos(a) * sp;
    p.vy = U.rand(2, 6);
    p.vz = Math.sin(a) * sp;
    p.gravity = -20;
  }

  function explosion(x, y, z) {
    for (let i = 0; i < 26; i++) fire(x, y, z);
    for (let i = 0; i < 16; i++) spark(x, y, z);
    for (let i = 0; i < 12; i++) smoke(x, y, z);
    World.paintBlood(x, z, 1.8);   // scorch + blood mark
  }

  function water(x, y, z) {
    const p = makeQuick(x + U.rand(-0.4, 0.4), y, z + U.rand(-0.4, 0.4),
      0x4cb4ff, U.rand(0.1, 0.2), U.rand(0.4, 0.8));
    p.vx = U.rand(-2, 2);
    p.vy = U.rand(7, 10);
    p.vz = U.rand(-2, 2);
    p.gravity = -22;
    p.mesh.material.opacity = 0.7;
  }

  function addDebris(mesh, opts) {
    debris.push({
      mesh,
      vx: opts.vx ?? 0, vy: opts.vy ?? 0, vz: opts.vz ?? 0,
      rx: opts.rx ?? 0, ry: opts.ry ?? 0, rz: opts.rz ?? 0,
      life: opts.life ?? 2, maxLife: opts.life ?? 2,
      bloody: !!opts.bloody, settled: false,
    });
    // Tint the debris red if it's a piece of a person.
    if (opts.bloody && mesh.material) {
      if (Array.isArray(mesh.material)) {
        for (const m of mesh.material) m.color.lerp(new THREE.Color(0x880000), 0.4);
      } else {
        mesh.material.color.lerp(new THREE.Color(0x880000), 0.4);
      }
    }
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
        live.splice(i, 1);
        continue;
      }
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy += (p.gravity ?? 0) * dt;
      p.vz *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy = -p.vy * 0.4; if (Math.abs(p.vy) < 1) p.vy = 0; }
      const grow = p.growth * dt;
      const scaleMul = 1 + grow / Math.max(0.01, p.size);
      if (scaleMul > 0) p.mesh.scale.multiplyScalar(scaleMul);
      p.size += grow;
      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.material.opacity = U.clamp(p.life / p.maxLife, 0, 1);
    }

    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.life -= dt;
      if (d.life <= 0) {
        if (d.mesh.parent) d.mesh.parent.remove(d.mesh);
        debris.splice(i, 1);
        continue;
      }
      if (d.settled) continue;
      d.vy += -22 * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      d.mesh.rotation.x += d.rx * dt;
      d.mesh.rotation.y += d.ry * dt;
      d.mesh.rotation.z += d.rz * dt;
      if (d.mesh.position.y < 0.1) {
        d.mesh.position.y = 0.1;
        d.vy = -d.vy * 0.3;
        d.vx *= 0.5; d.vz *= 0.5;
        d.rx *= 0.5; d.ry *= 0.5; d.rz *= 0.5;
        if (Math.abs(d.vy) < 0.5) { d.settled = true; d.vy = 0; }
        if (d.bloody) {
          World.paintBlood(d.mesh.position.x, d.mesh.position.z, 0.8);
        }
      }
    }
  }

  function count() { return live.length + debris.length; }

  // Compatibility shims used elsewhere.
  function bodyChunks(x, y, z, n = 6) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(U.rand(0.15, 0.35), U.rand(0.15, 0.35), U.rand(0.15, 0.35)),
        new THREE.MeshLambertMaterial({ color: U.pick([0xa04040, 0x702020, 0x601010, 0xeed4a0]) }),
      );
      m.position.set(x, y + 1, z);
      scene.add(m);
      const a = Math.random() * U.TAU;
      const sp = U.rand(6, 14);
      addDebris(m, {
        vx: Math.cos(a) * sp, vy: U.rand(4, 9), vz: Math.sin(a) * sp,
        rx: U.rand(-6, 6), ry: U.rand(-6, 6), rz: U.rand(-6, 6),
        life: U.rand(1.5, 3), bloody: true,
      });
    }
  }

  return {
    init, reset, bloodBurst, bodyChunks, smoke, fire, spark, explosion,
    water, addDebris, update, count,
  };
})();

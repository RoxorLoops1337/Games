// Power-up crates: a rotating cube of colored material with a glowing
// ground disk underneath. Same pickup behavior as before — driving over
// triggers Player.applyPickup.
const Powerup = (() => {
  const KINDS = [
    { id: "nitro",     color: 0x00ddff, label: "NITRO" },
    { id: "spike",     color: 0x999999, label: "SPIKE WHEELS" },
    { id: "bloodlust", color: 0xff0044, label: "BLOODLUST" },
    { id: "repair",    color: 0x22dd44, label: "REPAIR KIT" },
    { id: "armor",     color: 0xffdd00, label: "ARMOR" },
    { id: "bigwheels", color: 0xcc66ff, label: "BIG WHEELS" },
  ];

  function make(x, z, kind) {
    const k = kind ?? U.pick(KINDS).id;
    const def = KINDS.find(d => d.id === k) ?? KINDS[0];
    const group = new THREE.Group();
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.4, 1.4),
      new THREE.MeshLambertMaterial({ color: def.color }),
    );
    crate.position.y = 1.2;
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(1.8, 16),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.45 }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.05;
    group.add(crate, halo);

    return {
      x, y: z, kind: k, label: def.label,
      r: 1.4, phase: Math.random() * U.TAU, taken: false,
      mesh: group, crate, halo,
    };
  }

  function update(u, dt) {
    u.phase += dt * 3;
    u.crate.rotation.y = u.phase;
    u.crate.rotation.x = Math.sin(u.phase) * 0.2;
    u.crate.position.y = 1.2 + Math.sin(u.phase) * 0.2;
    u.halo.material.opacity = 0.3 + Math.abs(Math.sin(u.phase * 0.7)) * 0.3;
  }

  function take(u) {
    u.taken = true;
    if (u.mesh.parent) u.mesh.parent.remove(u.mesh);
  }

  return { make, update, take, KINDS };
})();

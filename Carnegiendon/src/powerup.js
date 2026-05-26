// Power-ups: spawn on the world, sit on the ground, bob & spin, give the
// player something fun when they're driven over.
const Powerup = (() => {
  const KINDS = [
    { id: "nitro",     color: "#00ddff", label: "NITRO" },
    { id: "spike",     color: "#999999", label: "SPIKE WHEELS" },
    { id: "bloodlust", color: "#ff0044", label: "BLOODLUST" },
    { id: "repair",    color: "#22dd44", label: "REPAIR KIT" },
    { id: "armor",     color: "#ffdd00", label: "ARMOR" },
    { id: "bigwheels", color: "#cc66ff", label: "BIG WHEELS" },
  ];

  function make(x, y, kind) {
    const k = kind ?? U.pick(KINDS).id;
    const def = KINDS.find(d => d.id === k) ?? KINDS[0];
    return {
      x, y, kind: k, label: def.label, color: def.color,
      r: 14, phase: Math.random() * U.TAU, taken: false,
    };
  }

  function update(u, dt) {
    u.phase += dt * 3;
  }

  function draw(ctx, u) {
    if (u.taken) return;
    const bob = Math.sin(u.phase) * 3;
    ctx.save();
    ctx.translate(u.x, u.y + bob);
    // ground glow
    ctx.fillStyle = u.color + "44";
    ctx.beginPath(); ctx.arc(0, 6, 18, 0, U.TAU); ctx.fill();
    // crate
    ctx.fillStyle = u.color;
    ctx.fillRect(-12, -12, 24, 24);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillRect(-12, -12, 24, 4);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(-12, 8, 24, 4);
    // symbol
    ctx.fillStyle = "#000";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const sym = { nitro:"N", spike:"X", bloodlust:"B", repair:"+", armor:"A", bigwheels:"O" }[u.kind] || "?";
    ctx.fillText(sym, 0, 0);
    ctx.restore();
  }

  return { make, update, draw, KINDS };
})();

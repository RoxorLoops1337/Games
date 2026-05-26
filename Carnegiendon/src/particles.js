// Particle system: blood splatter, body chunks, smoke, sparks, fire,
// pavement decals (blood stains + tire tracks that persist for the level).
const Particles = (() => {
  // Live particles drawn above the ground each frame.
  const live = [];
  // Decals are baked to an offscreen canvas the size of the map so they
  // persist cheaply without an ever-growing particle array.
  let decalCanvas = null;
  let decalCtx = null;
  let mapW = 0, mapH = 0;

  function initDecals(w, h) {
    mapW = w; mapH = h;
    decalCanvas = document.createElement("canvas");
    decalCanvas.width = w;
    decalCanvas.height = h;
    decalCtx = decalCanvas.getContext("2d");
  }

  function reset() {
    live.length = 0;
    if (decalCtx) decalCtx.clearRect(0, 0, mapW, mapH);
  }

  function add(p) {
    p.life = p.life ?? 1;
    p.maxLife = p.life;
    p.vx = p.vx ?? 0;
    p.vy = p.vy ?? 0;
    p.drag = p.drag ?? 0.92;
    p.gravity = p.gravity ?? 0;
    p.size = p.size ?? 3;
    p.color = p.color ?? "#fff";
    p.type = p.type ?? "circle";
    live.push(p);
  }

  // Blood: a fountain of red drops + a permanent stain on the ground.
  function bloodBurst(x, y, intensity = 1) {
    const drops = 12 + Math.floor(intensity * 18);
    for (let i = 0; i < drops; i++) {
      const a = Math.random() * U.TAU;
      const sp = U.rand(60, 240) * intensity;
      add({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        size: U.rand(2, 5),
        color: U.pick(["#c00000", "#a00000", "#ff2222", "#800000"]),
        life: U.rand(0.4, 0.9),
        drag: 0.88, gravity: 0,
        type: "blood",
      });
    }
    // Permanent stain.
    if (decalCtx) {
      const blots = 4 + Math.floor(intensity * 5);
      for (let i = 0; i < blots; i++) {
        const a = Math.random() * U.TAU;
        const r = U.rand(2, 14 * intensity);
        const px = x + Math.cos(a) * U.rand(0, 18 * intensity);
        const py = y + Math.sin(a) * U.rand(0, 18 * intensity);
        decalCtx.fillStyle = `rgba(${U.randInt(100,180)},0,0,${U.rand(0.5,0.9)})`;
        decalCtx.beginPath();
        decalCtx.arc(px, py, r, 0, U.TAU);
        decalCtx.fill();
      }
    }
  }

  function bodyChunks(x, y, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * U.TAU;
      const sp = U.rand(120, 320);
      add({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        size: U.rand(3, 7),
        color: U.pick(["#a04040", "#702020", "#601010", "#ffeeaa"]),
        life: U.rand(0.5, 1.1), drag: 0.9,
        type: "chunk",
      });
    }
  }

  function smoke(x, y, opts = {}) {
    add({
      x: x + U.rand(-4, 4), y: y + U.rand(-4, 4),
      vx: U.rand(-30, 30) + (opts.vx ?? 0),
      vy: U.rand(-30, 30) + (opts.vy ?? 0) - 20,
      size: U.rand(6, 14), color: opts.color ?? "rgba(80,80,80,0.7)",
      life: U.rand(0.6, 1.4), drag: 0.92, growth: U.rand(20, 40),
      type: "smoke",
    });
  }

  function fire(x, y, opts = {}) {
    add({
      x, y,
      vx: U.rand(-20, 20) + (opts.vx ?? 0),
      vy: U.rand(-40, -10) + (opts.vy ?? 0),
      size: U.rand(4, 9),
      color: U.pick(["#ffcc00", "#ff8800", "#ff4400", "#ff0000"]),
      life: U.rand(0.25, 0.6), drag: 0.9, growth: -8,
      type: "fire",
    });
  }

  function spark(x, y) {
    const a = Math.random() * U.TAU;
    const sp = U.rand(80, 220);
    add({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      size: U.rand(1, 2.5),
      color: U.pick(["#ffffaa", "#ffaa00", "#ffffff"]),
      life: U.rand(0.15, 0.35), drag: 0.85,
      type: "spark",
    });
  }

  function explosion(x, y) {
    for (let i = 0; i < 30; i++) fire(x, y);
    for (let i = 0; i < 18; i++) spark(x, y);
    for (let i = 0; i < 14; i++) smoke(x, y);
    // shockwave decal
    if (decalCtx) {
      decalCtx.fillStyle = "rgba(20,20,20,0.6)";
      decalCtx.beginPath();
      decalCtx.arc(x, y, 36, 0, U.TAU);
      decalCtx.fill();
    }
  }

  // A pair of tire stripes baked to the decal layer. Called by cars when
  // the handbrake bites or speed differential exceeds a threshold.
  function tireTrack(x, y, angle, width = 18, color = "rgba(20,20,20,0.5)") {
    if (!decalCtx) return;
    const half = width / 2;
    const [lx, ly] = U.rotate(0, -half, angle);
    const [rx, ry] = U.rotate(0,  half, angle);
    decalCtx.fillStyle = color;
    decalCtx.beginPath();
    decalCtx.arc(x + lx, y + ly, 2.2, 0, U.TAU);
    decalCtx.fill();
    decalCtx.beginPath();
    decalCtx.arc(x + rx, y + ry, 2.2, 0, U.TAU);
    decalCtx.fill();
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.life -= dt;
      if (p.life <= 0) { live.splice(i, 1); continue; }
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.growth) p.size = Math.max(0.5, p.size + p.growth * dt);
    }
  }

  function drawDecals(ctx, cam) {
    if (!decalCanvas) return;
    ctx.drawImage(decalCanvas, -cam.x, -cam.y);
  }

  function draw(ctx) {
    for (const p of live) {
      const a = p.life / p.maxLife;
      ctx.globalAlpha = a;
      if (p.type === "spark") {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, U.TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function count() { return live.length; }

  return {
    initDecals, reset, bloodBurst, bodyChunks, smoke, fire, spark, explosion,
    tireTrack, update, drawDecals, draw, count,
  };
})();

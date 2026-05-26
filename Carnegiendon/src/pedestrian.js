// Pedestrians. Each one has a personality (color, size, gait), wanders the
// sidewalks, panics when a car approaches, and dies horribly on impact.
const Pedestrian = (() => {
  const STATE = { WANDER: 0, PANIC: 1, FLEE: 2 };

  function make(x, y) {
    const palette = [
      { skin: "#f3c69b", shirt: "#3366aa", pants: "#222"  },
      { skin: "#caa07a", shirt: "#aa3333", pants: "#444"  },
      { skin: "#e3b58a", shirt: "#aa9933", pants: "#1b3a1b" },
      { skin: "#a47a55", shirt: "#338866", pants: "#552233" },
      { skin: "#d5a37e", shirt: "#cc6622", pants: "#222266" },
      { skin: "#ffcc99", shirt: "#ff66aa", pants: "#552288" },
      { skin: "#b08868", shirt: "#222222", pants: "#778877" },
    ];
    const pal = U.pick(palette);

    return {
      x, y,
      vx: 0, vy: 0,
      angle: Math.random() * U.TAU,
      speed: U.rand(28, 55),
      state: STATE.WANDER,
      stateTimer: U.rand(1, 3),
      target: { x, y },
      r: 6,
      pal,
      bobPhase: Math.random() * U.TAU,
      bobSpeed: U.rand(7, 12),
      dead: false,
      panicScreamed: false,
      type: U.weighted([
        ["normal", 8],
        ["fat", 2],
        ["kid", 2],
        ["clown", 1],
        ["jogger", 2],
      ]),
    };
  }

  function pickNewTarget(p) {
    const spawns = World.getSpawns();
    if (!spawns.length) return;
    // Pick a target within a smallish radius so the ped doesn't teleport
    // across the map all at once.
    let tries = 8;
    while (tries-- > 0) {
      const s = U.pick(spawns);
      if (U.dist2(s.x, s.y, p.x, p.y) < 400 * 400) {
        p.target = { x: s.x + U.rand(-12, 12), y: s.y + U.rand(-12, 12) };
        return;
      }
    }
    p.target = U.pick(spawns);
  }

  function setPanic(p, threatX, threatY) {
    p.state = STATE.FLEE;
    p.stateTimer = U.rand(1.5, 3);
    const ang = U.angleTo(threatX, threatY, p.x, p.y);
    const dist = U.dist(threatX, threatY, p.x, p.y);
    p.target = {
      x: p.x + Math.cos(ang) * (dist + 200),
      y: p.y + Math.sin(ang) * (dist + 200),
    };
    if (!p.panicScreamed && Math.random() < 0.3) {
      Audio.scream();
      p.panicScreamed = true;
    }
  }

  function update(p, dt, threat) {
    if (p.dead) return;

    // Threat awareness: if the player is close + moving fast, freak out.
    if (threat) {
      const d = U.dist(p.x, p.y, threat.x, threat.y);
      const threatRange = 90 + Math.min(threat.speed * 0.3, 80);
      if (d < threatRange) {
        setPanic(p, threat.x, threat.y);
      } else if (d < 200 && Math.random() < 0.01) {
        p.state = STATE.PANIC;
      }
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

    // Initialize target lazily.
    if (p.target.x === p.x && p.target.y === p.y) pickNewTarget(p);

    const dx = p.target.x - p.x;
    const dy = p.target.y - p.y;
    const d = Math.hypot(dx, dy);

    if (d < 4) {
      pickNewTarget(p);
    } else {
      const speedMul = p.state === STATE.FLEE ? 2.1 :
                       p.state === STATE.PANIC ? 1.4 : 1;
      p.angle = Math.atan2(dy, dx);
      p.vx = (dx / d) * p.speed * speedMul;
      p.vy = (dy / d) * p.speed * speedMul;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.bobPhase += p.bobSpeed * dt * speedMul;
    }
  }

  // The kill: blood, body parts, screen shake, score event. Returns the
  // score awarded (used by combo system).
  function kill(p, force, hitX, hitY, bonusMult = 1) {
    if (p.dead) return 0;
    p.dead = true;
    const intensity = U.clamp(force / 200, 0.5, 2.4);
    Particles.bloodBurst(p.x, p.y, intensity);
    Particles.bodyChunks(p.x, p.y, U.randInt(5, 10));
    Audio.splat();
    if (Math.random() < 0.7) Audio.scream();
    return Math.floor(100 * intensity * bonusMult);
  }

  function draw(ctx, p) {
    if (p.dead) return;
    const bob = Math.sin(p.bobPhase) * 1.6;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);

    let bodyW = 9, bodyH = 14, headR = 4.5;
    if (p.type === "fat")   { bodyW = 13; bodyH = 16; headR = 5.5; }
    if (p.type === "kid")   { bodyW = 7;  bodyH = 10; headR = 4; }
    if (p.type === "clown") { bodyW = 10; bodyH = 14; headR = 5; }
    if (p.type === "jogger"){ bodyW = 8;  bodyH = 13; headR = 4.5; }

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(0, 0, bodyW/2 + 1, 3, 0, 0, U.TAU); ctx.fill();

    // pants/feet bob
    ctx.fillStyle = p.pal.pants;
    ctx.fillRect(-bodyW/2 + 1, -bodyH/2 + bob, bodyW - 2, bodyH/2);
    // shirt
    let shirt = p.pal.shirt;
    if (p.type === "clown") shirt = "#ff44aa";
    if (p.type === "jogger") shirt = "#33dd33";
    ctx.fillStyle = shirt;
    ctx.fillRect(-bodyW/2, -bodyH/2 - 1, bodyW, bodyH/2);
    // head
    ctx.fillStyle = p.pal.skin;
    ctx.beginPath(); ctx.arc(bodyW/2, 0, headR, 0, U.TAU); ctx.fill();
    if (p.type === "clown") {
      ctx.fillStyle = "#ff2222";
      ctx.beginPath(); ctx.arc(bodyW/2 + 2, 0, 1.4, 0, U.TAU); ctx.fill();
      ctx.fillStyle = "#ffff33";
      ctx.fillRect(bodyW/2 - 2, -headR - 2, 4, 1.5);
    }

    // panic indicator
    if (p.state === STATE.FLEE) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px monospace";
      ctx.fillText("!", -3, -bodyH);
    }
    ctx.restore();
  }

  return { make, update, kill, draw, STATE };
})();

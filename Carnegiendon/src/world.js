// 3D city: a flat textured ground plane (road/sidewalk grid painted into
// a CanvasTexture) with extruded building boxes, plus standalone obstacle
// meshes (hydrants, dumpsters, lampposts, trees, parked cars, ramps,
// barrels). Pedestrian spawn points are sampled from sidewalk + park
// tiles. All entity positions are 2D (x, y) — meshes are placed at
// (x, y_offset, y) and rotated around the Y axis.
const World = (() => {
  const TILE = 12; // 3D units per tile

  const T = { GRASS: 0, ROAD: 1, SIDEWALK: 2, BUILDING: 3, PARK: 4, WATER: 5 };

  let grid = [];
  let cols = 0, rows = 0;
  let w = 0, h = 0;
  let obstacles = [];
  let spawnPoints = [];
  let group = null;        // root group containing all static world geometry
  let groundMesh = null;
  let textureCanvas = null;

  function size() { return { w, h, cols, rows, tile: TILE }; }
  function getObstacles() { return obstacles; }
  function getSpawns() { return spawnPoints; }
  function getGroup() { return group; }

  function tileAt(px, py) {
    const cx = Math.floor((px + w / 2) / TILE);
    const cy = Math.floor((py + h / 2) / TILE);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return T.BUILDING;
    return grid[cy][cx];
  }
  function isRoadAt(px, py) { return tileAt(px, py) === T.ROAD; }

  function generate(seed, scene) {
    cols = 36; rows = 28;
    w = cols * TILE;
    h = rows * TILE;
    grid = [];
    obstacles = [];
    spawnPoints = [];

    // Tile layout: roads carved every 5/6 tiles with sidewalk borders.
    for (let y = 0; y < rows; y++) {
      const row = [];
      for (let x = 0; x < cols; x++) row.push(T.BUILDING);
      grid.push(row);
    }
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        if (y % 5 === 2 || x % 6 === 3) grid[y][x] = T.ROAD;
      }
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (grid[y][x] !== T.BUILDING) continue;
        for (const [nx, ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1],
                                 [x-1,y-1],[x+1,y-1],[x-1,y+1],[x+1,y+1]]) {
          if (nx<0||ny<0||nx>=cols||ny>=rows) continue;
          if (grid[ny][nx] === T.ROAD) { grid[y][x] = T.SIDEWALK; break; }
        }
      }
    }
    const parkBlocks = [[6, 6], [22, 18], [14, 4]];
    for (const [px, py] of parkBlocks) {
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
        const xx = px + dx, yy = py + dy;
        if (xx < cols && yy < rows && grid[yy][xx] === T.BUILDING) grid[yy][xx] = T.PARK;
      }
    }
    // Sidewalk + park spawn points.
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (grid[y][x] === T.SIDEWALK || grid[y][x] === T.PARK) {
          spawnPoints.push({
            x: x * TILE + TILE/2 - w/2,
            y: y * TILE + TILE/2 - h/2,
          });
        }
      }
    }

    // Build scene group.
    group = new THREE.Group();

    // --- Ground -------------------------------------------------------
    bakeGroundTexture();
    const groundTex = new THREE.CanvasTexture(textureCanvas);
    groundTex.wrapS = groundTex.wrapT = THREE.ClampToEdgeWrapping;
    groundTex.minFilter = THREE.LinearFilter;
    groundTex.magFilter = THREE.LinearFilter;
    groundTex.needsUpdate = true;
    const groundGeo = new THREE.PlaneGeometry(w, h);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshLambertMaterial({ map: groundTex });
    groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.position.y = 0;
    group.add(groundMesh);

    // --- Buildings ---------------------------------------------------
    // One material reused across all building boxes (cheap perf-wise).
    const bMat = new THREE.MeshLambertMaterial({ color: 0x3a3a44 });
    const wMat = new THREE.MeshBasicMaterial({ color: 0xffdc8e });
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (grid[y][x] !== T.BUILDING && grid[y][x] !== T.WATER) continue;
        const isWater = grid[y][x] === T.WATER;
        const px = x * TILE + TILE/2 - w/2;
        const pz = y * TILE + TILE/2 - h/2;
        if (isWater) {
          // Low slab of water.
          const g = new THREE.BoxGeometry(TILE, 0.15, TILE);
          const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x143452 }));
          m.position.set(px, 0.08, pz);
          group.add(m);
          continue;
        }
        // Vary heights so the skyline isn't flat.
        const hgt = 6 + ((x * 17 + y * 31) % 11);
        const g = new THREE.BoxGeometry(TILE - 1.2, hgt, TILE - 1.2);
        const m = new THREE.Mesh(g, bMat);
        m.position.set(px, hgt / 2, pz);
        group.add(m);
        // Lit windows: a few small emissive quads on each face.
        addWindows(group, px, pz, hgt, TILE - 1.2, wMat);
      }
    }

    // --- Curb edges (thin sidewalk lift) -----------------------------
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (grid[y][x] !== T.SIDEWALK) continue;
        const px = x * TILE + TILE/2 - w/2;
        const pz = y * TILE + TILE/2 - h/2;
        const g = new THREE.BoxGeometry(TILE, 0.4, TILE);
        const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x666666 }));
        m.position.set(px, 0.2, pz);
        group.add(m);
      }
    }

    // --- Park tiles slight green raise -------------------------------
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (grid[y][x] !== T.PARK) continue;
        const px = x * TILE + TILE/2 - w/2;
        const pz = y * TILE + TILE/2 - h/2;
        const g = new THREE.BoxGeometry(TILE, 0.2, TILE);
        const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x215020 }));
        m.position.set(px, 0.1, pz);
        group.add(m);
      }
    }

    // --- Decorative obstacles ---------------------------------------
    const sideTiles = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (grid[y][x] === T.SIDEWALK) sideTiles.push([x, y]);
    }
    for (let i = 0; i < 70; i++) {
      if (!sideTiles.length) break;
      const [tx, ty] = U.pick(sideTiles);
      const kind = U.weighted([
        ["hydrant", 3], ["lamp", 4], ["dumpster", 2],
        ["bin", 3], ["barrel", 2],
      ]);
      const wx = tx * TILE + TILE/2 + U.rand(-2, 2) - w/2;
      const wz = ty * TILE + TILE/2 + U.rand(-2, 2) - h/2;
      const o = makeObstacle(wx, wz, kind);
      o.mesh = buildObstacleMesh(o);
      o.mesh.position.set(wx, o.yOffset || 0, wz);
      group.add(o.mesh);
      obstacles.push(o);
    }
    // Parked cars on a few sidewalk-adjacent road edges.
    for (let i = 0; i < 24; i++) {
      const [tx, ty] = U.pick(sideTiles);
      const wx = tx * TILE + TILE/2 - w/2;
      const wz = ty * TILE + TILE/2 - h/2;
      const o = makeObstacle(wx, wz, "parked_car");
      o.mesh = buildObstacleMesh(o);
      o.mesh.position.set(wx, 0.6, wz);
      o.mesh.rotation.y = Math.random() < 0.5 ? 0 : Math.PI / 2;
      group.add(o.mesh);
      obstacles.push(o);
    }
    // Trees scattered through parks.
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (grid[y][x] === T.PARK && Math.random() < 0.45) {
        const wx = x * TILE + TILE/2 + U.rand(-3, 3) - w/2;
        const wz = y * TILE + TILE/2 + U.rand(-3, 3) - h/2;
        const o = makeObstacle(wx, wz, "tree");
        o.mesh = buildObstacleMesh(o);
        o.mesh.position.set(wx, 0, wz);
        group.add(o.mesh);
        obstacles.push(o);
      }
    }
    // Fountains in park centers.
    for (const [px, py] of parkBlocks) {
      const wx = (px + 1) * TILE + TILE/2 - w/2;
      const wz = (py + 1) * TILE + TILE/2 - h/2;
      const o = makeObstacle(wx, wz, "fountain");
      o.mesh = buildObstacleMesh(o);
      o.mesh.position.set(wx, 0, wz);
      group.add(o.mesh);
      obstacles.push(o);
    }
    // Random ramps on roads.
    for (let i = 0; i < 5; i++) {
      const x = U.randInt(4, cols - 5);
      const y = U.randInt(4, rows - 5);
      if (grid[y][x] === T.ROAD) {
        const wx = x * TILE + TILE/2 - w/2;
        const wz = y * TILE + TILE/2 - h/2;
        const o = makeObstacle(wx, wz, "ramp");
        o.mesh = buildObstacleMesh(o);
        o.mesh.position.set(wx, 0, wz);
        o.mesh.rotation.y = U.pick([0, Math.PI/2, Math.PI, -Math.PI/2]);
        group.add(o.mesh);
        obstacles.push(o);
      }
    }

    scene.add(group);
  }

  // --- 2D background painter (drawn once into the ground texture) -----
  function bakeGroundTexture() {
    const SCALE = 32;            // texels per tile
    textureCanvas = document.createElement("canvas");
    textureCanvas.width = cols * SCALE;
    textureCanvas.height = rows * SCALE;
    const c = textureCanvas.getContext("2d");

    const PAL = {
      [T.ROAD]: "#202024",
      [T.SIDEWALK]: "#5a5a5a",
      [T.BUILDING]: "#2c2c34",
      [T.PARK]: "#214d20",
      [T.WATER]: "#143452",
    };

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const t = grid[y][x];
        c.fillStyle = PAL[t] || "#222";
        c.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
        if (t === T.ROAD) {
          // road speckle
          c.fillStyle = "rgba(255,255,255,0.04)";
          for (let i = 0; i < 6; i++) {
            c.fillRect(x*SCALE + Math.random()*SCALE, y*SCALE + Math.random()*SCALE, 1, 1);
          }
          // lane markings only when road extends along an axis
          const hasN = y > 0 && grid[y-1][x] === T.ROAD;
          const hasS = y < rows-1 && grid[y+1][x] === T.ROAD;
          const hasE = x < cols-1 && grid[y][x+1] === T.ROAD;
          const hasW = x > 0 && grid[y][x-1] === T.ROAD;
          c.fillStyle = "rgba(255,220,80,0.7)";
          if (hasN && hasS && !(hasE && hasW)) {
            for (let i = 0; i < 4; i++) c.fillRect(x*SCALE + SCALE/2 - 1, y*SCALE + i*8 + 1, 2, 4);
          } else if (hasE && hasW && !(hasN && hasS)) {
            for (let i = 0; i < 4; i++) c.fillRect(x*SCALE + i*8 + 1, y*SCALE + SCALE/2 - 1, 4, 2);
          }
        } else if (t === T.SIDEWALK) {
          c.strokeStyle = "rgba(0,0,0,0.25)";
          c.lineWidth = 1;
          c.strokeRect(x*SCALE + 0.5, y*SCALE + 0.5, SCALE - 1, SCALE - 1);
          c.beginPath();
          c.moveTo(x*SCALE + SCALE/2, y*SCALE);
          c.lineTo(x*SCALE + SCALE/2, y*SCALE + SCALE);
          c.moveTo(x*SCALE, y*SCALE + SCALE/2);
          c.lineTo(x*SCALE + SCALE, y*SCALE + SCALE/2);
          c.stroke();
        }
      }
    }
  }

  // Paint a permanent splat onto the ground texture so blood / wreckage
  // marks persist for the level without per-frame cost. Called by the
  // particle/death paths.
  function paintGroundDecal(worldX, worldZ, radius, color) {
    if (!textureCanvas || !groundMesh) return;
    const SCALE = 32;
    const u = (worldX + w / 2) / TILE * SCALE;
    const v = (worldZ + h / 2) / TILE * SCALE;
    const c = textureCanvas.getContext("2d");
    c.fillStyle = color;
    c.beginPath();
    c.arc(u, v, radius, 0, Math.PI * 2);
    c.fill();
    groundMesh.material.map.needsUpdate = true;
  }

  function paintBlood(worldX, worldZ, intensity = 1) {
    const blots = 5 + Math.floor(intensity * 6);
    for (let i = 0; i < blots; i++) {
      const a = Math.random() * Math.PI * 2;
      const off = U.rand(0, 3 * intensity);
      const ox = worldX + Math.cos(a) * off;
      const oz = worldZ + Math.sin(a) * off;
      const r = U.rand(2, 8 * intensity);
      paintGroundDecal(ox, oz, r, `rgba(${U.randInt(110,180)},0,0,${U.rand(0.5,0.9)})`);
    }
  }

  function paintTireMark(worldX, worldZ) {
    paintGroundDecal(worldX, worldZ, 2, "rgba(20,20,20,0.55)");
  }

  // --- Window highlights on building faces -----------------------------
  function addWindows(parent, cx, cz, hgt, edge, mat) {
    const cols = 3, rows = Math.max(1, Math.floor(hgt / 2.4));
    const wWidth = edge / 5, wHeight = 0.6;
    const half = edge / 2 + 0.02;
    for (let face = 0; face < 4; face++) {
      for (let r = 0; r < rows; r++) {
        for (let cc = 0; cc < cols; cc++) {
          if (Math.random() < 0.5) continue;
          const offset = ((cc - 1) * (edge / 3));
          const yy = 1.2 + r * 2.4;
          if (yy + wHeight > hgt - 0.5) continue;
          const g = new THREE.PlaneGeometry(wWidth, wHeight);
          const m = new THREE.Mesh(g, mat);
          if (face === 0) { m.position.set(cx + offset, yy, cz + half); }
          else if (face === 1) { m.position.set(cx + offset, yy, cz - half); m.rotation.y = Math.PI; }
          else if (face === 2) { m.position.set(cx + half, yy, cz + offset); m.rotation.y = Math.PI / 2; }
          else { m.position.set(cx - half, yy, cz + offset); m.rotation.y = -Math.PI / 2; }
          parent.add(m);
        }
      }
    }
  }

  // --- Obstacles ------------------------------------------------------
  function makeObstacle(x, z, kind) {
    const base = {
      x, y: z,                  // store as 2D (x, y where y is world Z)
      kind, hp: 1, destroyed: false, solid: true, score: 0, mesh: null,
    };
    switch (kind) {
      case "hydrant":    return { ...base, r: 1.5, hp: 1, score: 25, spewing: false };
      case "lamp":       return { ...base, r: 1.0, hp: 1, score: 15 };
      case "dumpster":   return { ...base, r: 2.4, hp: 3, score: 40 };
      case "bin":        return { ...base, r: 1.2, hp: 1, score: 15 };
      case "barrel":     return { ...base, r: 1.5, hp: 1, score: 50, explosive: true };
      case "tree":       return { ...base, r: 1.8, hp: 4, score: 20 };
      case "fountain":   return { ...base, r: 4.5, hp: 999, score: 0 };
      case "parked_car": return { ...base, r: 2.6, hp: 5, score: 100,
                                  color: U.pick([0x3366aa, 0xaa3333, 0x66aa33, 0xaa8833, 0x883377, 0x444444]) };
      case "ramp":       return { ...base, r: 4.5, hp: 999, score: 0, solid: false, ramp: true };
    }
    return base;
  }

  function buildObstacleMesh(o) {
    const g = new THREE.Group();
    switch (o.kind) {
      case "hydrant": {
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.7, 0.8, 1.3, 8),
          new THREE.MeshLambertMaterial({ color: 0xcc2222 }),
        );
        body.position.y = 0.65;
        const top = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.5, 0.4, 8),
          new THREE.MeshLambertMaterial({ color: 0xffaa00 }),
        );
        top.position.y = 1.5;
        g.add(body, top);
        break;
      }
      case "lamp": {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, 4, 6),
          new THREE.MeshLambertMaterial({ color: 0x111111 }),
        );
        pole.position.y = 2;
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.4, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xffffaa }),
        );
        head.position.y = 4;
        g.add(pole, head);
        break;
      }
      case "dumpster": {
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(4, 1.8, 2.4),
          new THREE.MeshLambertMaterial({ color: 0x2a5a2a }),
        );
        body.position.y = 0.9;
        g.add(body);
        break;
      }
      case "bin": {
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.9, 0.8, 1.4, 10),
          new THREE.MeshLambertMaterial({ color: 0x333333 }),
        );
        body.position.y = 0.7;
        g.add(body);
        break;
      }
      case "barrel": {
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.9, 0.9, 1.6, 12),
          new THREE.MeshLambertMaterial({ color: 0xbb3333 }),
        );
        body.position.y = 0.8;
        const stripe = new THREE.Mesh(
          new THREE.CylinderGeometry(0.91, 0.91, 0.15, 12),
          new THREE.MeshBasicMaterial({ color: 0xffcc00 }),
        );
        stripe.position.y = 0.8;
        g.add(body, stripe);
        break;
      }
      case "tree": {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.5, 1.2, 6),
          new THREE.MeshLambertMaterial({ color: 0x5a3a1a }),
        );
        trunk.position.y = 0.6;
        const leaves = new THREE.Mesh(
          new THREE.SphereGeometry(1.8, 8, 6),
          new THREE.MeshLambertMaterial({ color: 0x2a6a2a }),
        );
        leaves.position.y = 2.6;
        g.add(trunk, leaves);
        break;
      }
      case "fountain": {
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(4.4, 4.4, 0.6, 16),
          new THREE.MeshLambertMaterial({ color: 0x666666 }),
        );
        base.position.y = 0.3;
        const water = new THREE.Mesh(
          new THREE.CylinderGeometry(3.8, 3.8, 0.4, 16),
          new THREE.MeshLambertMaterial({ color: 0x1a4a7a, transparent: true, opacity: 0.85 }),
        );
        water.position.y = 0.6;
        const spout = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.4, 1.6, 8),
          new THREE.MeshLambertMaterial({ color: 0x888888 }),
        );
        spout.position.y = 1.4;
        g.add(base, water, spout);
        break;
      }
      case "parked_car": {
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(4.6, 1.2, 2.2),
          new THREE.MeshLambertMaterial({ color: o.color }),
        );
        body.position.y = 0.7;
        const top = new THREE.Mesh(
          new THREE.BoxGeometry(2.6, 0.9, 1.9),
          new THREE.MeshLambertMaterial({ color: o.color }),
        );
        top.position.y = 1.55;
        const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
        for (const [dx, dz] of [[-1.7,-1.05],[1.7,-1.05],[-1.7,1.05],[1.7,1.05]]) {
          const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 10), wheelMat);
          wh.rotation.x = Math.PI / 2;
          wh.position.set(dx, 0.45, dz);
          g.add(wh);
        }
        g.add(body, top);
        break;
      }
      case "ramp": {
        // A simple wedge: scale a box along Y/Z to make a triangle-ish ramp.
        const ramp = new THREE.Mesh(
          new THREE.BoxGeometry(8, 1.8, 4),
          new THREE.MeshLambertMaterial({ color: 0xffcc00 }),
        );
        ramp.rotation.x = -Math.PI / 14;
        ramp.position.y = 1;
        g.add(ramp);
        // Hazard stripes
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        for (let i = -3; i <= 3; i += 2) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 4.05), stripeMat);
          s.position.set(i, 1.92, 0);
          s.rotation.x = -Math.PI / 14;
          g.add(s);
        }
        break;
      }
    }
    return g;
  }

  function dispose(scene) {
    if (group) scene.remove(group);
    group = null;
    obstacles.length = 0;
    spawnPoints.length = 0;
  }

  // Hydrant spew is a particle effect handled by particles.js — keep API
  // surface for legacy callers.
  function updateHydrants(dt) {
    for (const o of obstacles) {
      if (o.kind === "hydrant" && o.destroyed && o.spewing) {
        Particles.water(o.x, 0.6, o.y);
      }
    }
  }

  function destroyObstacleVisual(o) {
    if (!o.mesh) return;
    if (o.kind === "parked_car") {
      // Lay it on its side a bit and darken — looks wrecked.
      o.mesh.rotation.z = U.rand(-0.4, 0.4);
      o.mesh.position.y = 0.3;
      o.mesh.traverse((m) => {
        if (m.material && m.material.color) m.material.color.multiplyScalar(0.3);
      });
    } else if (o.kind === "lamp") {
      o.mesh.rotation.z = 1.1;
      o.mesh.position.y = 0;
    } else if (o.kind === "tree") {
      o.mesh.rotation.z = U.rand(0.5, 1.0);
      o.mesh.position.y = 0;
    } else if (o.kind === "hydrant") {
      // Topple it.
      o.mesh.rotation.x = Math.PI / 2;
      o.mesh.position.y = 0.3;
    } else if (o.mesh.parent) {
      o.mesh.parent.remove(o.mesh);
    }
  }

  return {
    generate, dispose, size, getObstacles, getSpawns, getGroup,
    tileAt, isRoadAt, T, paintBlood, paintTireMark, destroyObstacleVisual,
    updateHydrants,
  };
})();

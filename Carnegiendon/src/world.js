// The world / map: a tiled city with roads, buildings, parks, sidewalks,
// fire hydrants, dumpsters, parked cars, ramps. Provides:
//  - rendering of the static background
//  - a list of solid obstacles for collision
//  - spawn candidate points (sidewalks) for pedestrians
//  - bounds + size
const World = (() => {
  const TILE = 64;

  // Tile codes
  const T = {
    GRASS: 0,
    ROAD: 1,
    SIDEWALK: 2,
    BUILDING: 3,
    PARK: 4,
    WATER: 5,
  };

  let grid = [];          // 2D tile grid [y][x]
  let cols = 0, rows = 0;
  let w = 0, h = 0;
  let obstacles = [];     // {x,y,r,kind,hp,destroyed,...}
  let bgCanvas = null;    // pre-rendered static background
  let bgCtx = null;
  let spawnPoints = [];   // pedestrian spawn locations (sidewalks)
  let theme = "city";

  function size() { return { w, h, cols, rows, tile: TILE }; }
  function getObstacles() { return obstacles; }
  function getSpawns() { return spawnPoints; }

  function tileAt(px, py) {
    const cx = Math.floor(px / TILE);
    const cy = Math.floor(py / TILE);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return T.BUILDING;
    return grid[cy][cx];
  }

  function isRoadAt(px, py) {
    const t = tileAt(px, py);
    return t === T.ROAD;
  }

  // Build a city block layout: regular grid of roads with building blocks
  // in between, some parks, some water/grass at edges.
  function generate(seed = 0, themeName = "city") {
    theme = themeName;
    cols = 36;
    rows = 28;
    w = cols * TILE;
    h = rows * TILE;
    grid = [];
    obstacles = [];
    spawnPoints = [];

    // Fill with building blocks initially.
    for (let y = 0; y < rows; y++) {
      const row = [];
      for (let x = 0; x < cols; x++) row.push(T.BUILDING);
      grid.push(row);
    }

    // Carve roads every 5 tiles, with sidewalk strips on each side.
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        const onHRoad = (y % 5 === 2);
        const onVRoad = (x % 6 === 3);
        if (onHRoad || onVRoad) grid[y][x] = T.ROAD;
      }
    }
    // Sidewalk band around each road tile.
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (grid[y][x] !== T.BUILDING) continue;
        const neighbors = [
          [x-1,y],[x+1,y],[x,y-1],[x,y+1],
          [x-1,y-1],[x+1,y-1],[x-1,y+1],[x+1,y+1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx<0||ny<0||nx>=cols||ny>=rows) continue;
          if (grid[ny][nx] === T.ROAD) { grid[y][x] = T.SIDEWALK; break; }
        }
      }
    }

    // A couple of parks: a 3x3 block of grass with a fountain in the middle.
    const parkBlocks = [[6, 6], [22, 18], [14, 4]];
    for (const [px, py] of parkBlocks) {
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          const xx = px + dx, yy = py + dy;
          if (xx >= cols || yy >= rows) continue;
          if (grid[yy][xx] === T.BUILDING) grid[yy][xx] = T.PARK;
        }
      }
    }

    // Outer edge: water (for snow theme, this becomes ice).
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (x === 0 || y === 0 || x === cols-1 || y === rows-1) {
          if (grid[y][x] === T.BUILDING) grid[y][x] = T.WATER;
        }
      }
    }

    // Collect sidewalk spawn points.
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (grid[y][x] === T.SIDEWALK || grid[y][x] === T.PARK) {
          spawnPoints.push({ x: x * TILE + TILE/2, y: y * TILE + TILE/2 });
        }
      }
    }

    // Obstacles: hydrants, dumpsters, lampposts on sidewalks.
    const sideTiles = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (grid[y][x] === T.SIDEWALK) sideTiles.push([x, y]);
      }
    }
    for (let i = 0; i < 60; i++) {
      if (sideTiles.length === 0) break;
      const [tx, ty] = U.pick(sideTiles);
      const kind = U.weighted([
        ["hydrant", 3], ["lamp", 4], ["dumpster", 2], ["bin", 3], ["barrel", 2],
      ]);
      obstacles.push(makeObstacle(
        tx * TILE + TILE/2 + U.rand(-12, 12),
        ty * TILE + TILE/2 + U.rand(-12, 12),
        kind,
      ));
    }

    // Parked cars sprinkled along the road edges.
    for (let i = 0; i < 22; i++) {
      const [tx, ty] = U.pick(sideTiles);
      const carX = tx * TILE + TILE/2;
      const carY = ty * TILE + TILE/2;
      obstacles.push(makeObstacle(carX, carY, "parked_car"));
    }

    // Park trees on park tiles + fountains in center of each park.
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (grid[y][x] === T.PARK && Math.random() < 0.4) {
          obstacles.push(makeObstacle(
            x * TILE + TILE/2 + U.rand(-16, 16),
            y * TILE + TILE/2 + U.rand(-16, 16),
            "tree",
          ));
        }
      }
    }
    for (const [px, py] of parkBlocks) {
      const cx = (px + 1) * TILE + TILE / 2;
      const cy = (py + 1) * TILE + TILE / 2;
      obstacles.push(makeObstacle(cx, cy, "fountain"));
    }

    // A couple of ramps on roads — visually painted, give a speed boost.
    for (let i = 0; i < 4; i++) {
      const x = U.randInt(4, cols - 5);
      const y = U.randInt(4, rows - 5);
      if (grid[y][x] === T.ROAD) {
        obstacles.push(makeObstacle(
          x * TILE + TILE/2, y * TILE + TILE/2, "ramp",
        ));
      }
    }

    bakeBackground();
  }

  function makeObstacle(x, y, kind) {
    const base = { x, y, kind, hp: 1, destroyed: false, solid: true, score: 0 };
    switch (kind) {
      case "hydrant":   return { ...base, r: 10, hp: 1, score: 25, spewing: false };
      case "lamp":      return { ...base, r: 8,  hp: 1, score: 15 };
      case "dumpster":  return { ...base, r: 18, hp: 3, score: 40 };
      case "bin":       return { ...base, r: 10, hp: 1, score: 15 };
      case "barrel":    return { ...base, r: 12, hp: 1, score: 50, explosive: true };
      case "tree":      return { ...base, r: 14, hp: 4, score: 20 };
      case "fountain":  return { ...base, r: 36, hp: 999, score: 0 };
      case "parked_car":return { ...base, r: 20, hp: 5, score: 100,
                                 color: U.pick(["#3366aa","#aa3333","#66aa33","#aa8833","#883377","#444"]),
                                 angle: Math.random() < 0.5 ? 0 : Math.PI/2 };
      case "ramp":      return { ...base, r: 30, hp: 999, score: 0, solid: false, ramp: true };
    }
    return base;
  }

  // Pre-render the entire static map into an offscreen canvas. The road
  // tiles, sidewalks, grass and water never change, so we draw once and
  // blit per frame.
  function bakeBackground() {
    bgCanvas = document.createElement("canvas");
    bgCanvas.width = w;
    bgCanvas.height = h;
    bgCtx = bgCanvas.getContext("2d");

    const PAL = {
      [T.GRASS]:    "#1b3818",
      [T.ROAD]:     "#2a2a2a",
      [T.SIDEWALK]: "#666666",
      [T.BUILDING]: "#2c2c34",
      [T.PARK]:     "#214d20",
      [T.WATER]:    "#143452",
    };

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const t = grid[y][x];
        bgCtx.fillStyle = PAL[t];
        bgCtx.fillRect(x * TILE, y * TILE, TILE, TILE);

        if (t === T.ROAD) {
          // Asphalt speckle
          bgCtx.fillStyle = "rgba(255,255,255,0.025)";
          for (let i = 0; i < 6; i++) {
            bgCtx.fillRect(x*TILE + U.rand(0,TILE), y*TILE + U.rand(0,TILE), 1, 1);
          }
          // Lane dashes when there's road in both x and y on neighbors
          const hasNorth = y > 0 && grid[y-1][x] === T.ROAD;
          const hasSouth = y < rows-1 && grid[y+1][x] === T.ROAD;
          const hasEast  = x < cols-1 && grid[y][x+1] === T.ROAD;
          const hasWest  = x > 0 && grid[y][x-1] === T.ROAD;
          bgCtx.fillStyle = "rgba(255,220,80,0.65)";
          if (hasNorth && hasSouth && !(hasEast && hasWest)) {
            for (let i = 0; i < 4; i++) {
              bgCtx.fillRect(x*TILE + TILE/2 - 1, y*TILE + i*16 + 2, 2, 8);
            }
          } else if (hasEast && hasWest && !(hasNorth && hasSouth)) {
            for (let i = 0; i < 4; i++) {
              bgCtx.fillRect(x*TILE + i*16 + 2, y*TILE + TILE/2 - 1, 8, 2);
            }
          }
        } else if (t === T.SIDEWALK) {
          // grid lines for sidewalk texture
          bgCtx.strokeStyle = "rgba(0,0,0,0.18)";
          bgCtx.lineWidth = 1;
          bgCtx.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
          bgCtx.beginPath();
          bgCtx.moveTo(x*TILE + TILE/2, y*TILE);
          bgCtx.lineTo(x*TILE + TILE/2, y*TILE + TILE);
          bgCtx.moveTo(x*TILE,         y*TILE + TILE/2);
          bgCtx.lineTo(x*TILE + TILE,  y*TILE + TILE/2);
          bgCtx.stroke();
        } else if (t === T.BUILDING) {
          // Buildings: lighter top edge + window grid for top-down look.
          bgCtx.fillStyle = "#3a3a44";
          bgCtx.fillRect(x*TILE + 4, y*TILE + 4, TILE - 8, TILE - 8);
          bgCtx.fillStyle = "rgba(255,220,140,0.4)";
          for (let wy = 0; wy < 3; wy++) {
            for (let wx = 0; wx < 3; wx++) {
              if (Math.random() < 0.55) {
                bgCtx.fillRect(
                  x*TILE + 10 + wx * 16,
                  y*TILE + 10 + wy * 16,
                  6, 6);
              }
            }
          }
          bgCtx.strokeStyle = "rgba(0,0,0,0.7)";
          bgCtx.lineWidth = 2;
          bgCtx.strokeRect(x*TILE + 4, y*TILE + 4, TILE - 8, TILE - 8);
        } else if (t === T.PARK) {
          // sparse grass texture
          bgCtx.fillStyle = "rgba(255,255,255,0.05)";
          for (let i = 0; i < 4; i++) {
            bgCtx.fillRect(x*TILE + U.rand(0,TILE), y*TILE + U.rand(0,TILE), 2, 2);
          }
        } else if (t === T.WATER) {
          // simple wave ticks
          bgCtx.strokeStyle = "rgba(255,255,255,0.15)";
          bgCtx.lineWidth = 1;
          for (let i = 0; i < 3; i++) {
            bgCtx.beginPath();
            bgCtx.moveTo(x*TILE + U.rand(2, TILE-12), y*TILE + U.rand(8, TILE-8));
            bgCtx.lineTo(x*TILE + U.rand(10, TILE-4),  y*TILE + U.rand(8, TILE-8));
            bgCtx.stroke();
          }
        }
      }
    }

    // Add an outer perimeter shadow.
    bgCtx.strokeStyle = "rgba(0,0,0,0.5)";
    bgCtx.lineWidth = 8;
    bgCtx.strokeRect(0, 0, w, h);
  }

  function draw(ctx, cam) {
    if (!bgCanvas) return;
    ctx.drawImage(bgCanvas, -cam.x, -cam.y);
  }

  function drawObstacles(ctx) {
    for (const o of obstacles) {
      if (o.destroyed) {
        // small wreckage marker
        if (o.kind === "parked_car") {
          ctx.fillStyle = "#221";
          ctx.beginPath();
          ctx.arc(o.x, o.y, 16, 0, U.TAU);
          ctx.fill();
        }
        continue;
      }
      drawObstacle(ctx, o);
    }
  }

  function drawObstacle(ctx, o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    switch (o.kind) {
      case "hydrant":
        ctx.fillStyle = "#cc2222";
        ctx.fillRect(-5, -8, 10, 16);
        ctx.fillStyle = "#ffaa00";
        ctx.fillRect(-6, -10, 12, 4);
        ctx.fillStyle = "#000";
        ctx.fillRect(-2, -2, 4, 4);
        break;
      case "lamp":
        ctx.fillStyle = "#111";
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, U.TAU); ctx.fill();
        ctx.fillStyle = "#ffff99";
        ctx.beginPath(); ctx.arc(0, -4, 3, 0, U.TAU); ctx.fill();
        ctx.fillStyle = "rgba(255,255,180,0.15)";
        ctx.beginPath(); ctx.arc(0, -4, 18, 0, U.TAU); ctx.fill();
        break;
      case "dumpster":
        ctx.fillStyle = "#2a5a2a";
        ctx.fillRect(-18, -12, 36, 24);
        ctx.fillStyle = "#1a3a1a";
        ctx.fillRect(-18, -12, 36, 4);
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
        ctx.strokeRect(-18, -12, 36, 24);
        break;
      case "bin":
        ctx.fillStyle = "#333";
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, U.TAU); ctx.fill();
        ctx.fillStyle = "#555";
        ctx.beginPath(); ctx.arc(0, -1, 7, 0, U.TAU); ctx.fill();
        break;
      case "barrel":
        ctx.fillStyle = "#b33";
        ctx.beginPath(); ctx.arc(0, 0, 11, 0, U.TAU); ctx.fill();
        ctx.fillStyle = "#fc0";
        ctx.fillRect(-6, -1, 12, 2);
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      case "tree":
        ctx.fillStyle = "#0d2a0d";
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, U.TAU); ctx.fill();
        ctx.fillStyle = "#2a5a2a";
        ctx.beginPath(); ctx.arc(0, 0, 11, 0, U.TAU); ctx.fill();
        ctx.fillStyle = "#3a7a3a";
        ctx.beginPath(); ctx.arc(-3, -3, 5, 0, U.TAU); ctx.fill();
        break;
      case "fountain":
        ctx.fillStyle = "#444";
        ctx.beginPath(); ctx.arc(0, 0, 34, 0, U.TAU); ctx.fill();
        ctx.fillStyle = "#1a4a7a";
        ctx.beginPath(); ctx.arc(0, 0, 28, 0, U.TAU); ctx.fill();
        ctx.fillStyle = "#3a7aaa";
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, U.TAU); ctx.fill();
        break;
      case "parked_car":
        ctx.rotate(o.angle);
        ctx.fillStyle = o.color;
        ctx.fillRect(-20, -10, 40, 20);
        ctx.fillStyle = "#000";
        ctx.fillRect(-14, -10, 28, 4);
        ctx.fillRect(-14,   6, 28, 4);
        ctx.fillStyle = "#88ccff";
        ctx.fillRect(8, -7, 8, 14);
        ctx.fillRect(-16, -7, 8, 14);
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
        ctx.strokeRect(-20, -10, 40, 20);
        break;
      case "ramp":
        ctx.fillStyle = "#fc0";
        ctx.beginPath();
        ctx.moveTo(-30, -16);
        ctx.lineTo(30, -16);
        ctx.lineTo(30, 16);
        ctx.lineTo(-30, 16);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#000";
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(-30 + i * 16, -16, 8, 32);
        }
        break;
    }
    ctx.restore();
  }

  // Hydrant spewing water visualizer (called from game.js once destroyed).
  function updateHydrants(dt) {
    for (const o of obstacles) {
      if (o.kind === "hydrant" && o.destroyed && o.spewing) {
        Particles.add({
          x: o.x + U.rand(-3, 3), y: o.y + U.rand(-3, 3),
          vx: U.rand(-40, 40), vy: U.rand(-100, -40),
          size: U.rand(2, 4),
          color: "rgba(120,200,255,0.7)",
          life: U.rand(0.4, 0.8), drag: 0.95,
          type: "circle", gravity: 80,
        });
      }
    }
  }

  return {
    generate, draw, drawObstacles, updateHydrants,
    size, getObstacles, getSpawns, tileAt, isRoadAt, T,
  };
})();

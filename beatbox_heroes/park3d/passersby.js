// PASSERS-BY: people strolling along a world's paths (the park first). Full characters with random looks (char_cast.js crowdLook), walk clip with
// a per-person pace, each keeps to the right on its own lane of the path; now and then someone stops to look around. They give way to the player (slow down, step aside)
// and turn around at the open end of a path.
//   const pb = createPassersby(ctx, terrain, { count, seed, minLen })   terrain.paths = [{ id, w, points:[{x,z}...] }], terrain.heightAt(x, z) optional
//   pb.group (add to the scene), pb.update(dt, t, playerPos), pb.walkers (debug: { c, path, s, dir, speed, lane, pause }), pb.dispose()
// Cost: ~3.5k tris and ~3 draws per person (characters.js TRI_BUDGET), so the world picks the count per quality. No em dashes.
import { THREE, disposeTree } from './kit.js';
import { createCharacter } from './characters.js';
import { crowdLook } from './char_cast.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// a path as an arc-length polyline: at(s) -> { x, z, tx, tz } (position + unit tangent)
function polyline(p) {
  const pts = p.points, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const len = cum[cum.length - 1], closed = pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z) < 0.05;
  const at = (s, out) => {
    s = closed ? ((s % len) + len) % len : clamp(s, 0, len);
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const a = pts[i - 1], b = pts[i], seg = Math.max(1e-6, cum[i] - cum[i - 1]), k = (s - cum[i - 1]) / seg, tx = (b.x - a.x) / seg, tz = (b.z - a.z) / seg;
    out.x = a.x + (b.x - a.x) * k; out.z = a.z + (b.z - a.z) * k; out.tx = tx; out.tz = tz; return out;
  };
  return { id: p.id, w: p.w || 2, len, closed, at };
}

export function createPassersby(ctx, terrain, opts) {
  opts = opts || {}; const group = new THREE.Group(); group.name = 'passersby';
  const minLen = opts.minLen || 8, paths = (terrain.paths || []).filter((p) => p.points && p.points.length >= 2).map(polyline).filter((p) => p.len >= minLen);
  const walkers = []; let seed = (opts.seed || 5) >>> 0; const R = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  if (!paths.length) return { group, walkers, update() {}, dispose() {} };
  const total = paths.reduce((a, p) => a + p.len, 0), P = { x: 0, z: 0, tx: 0, tz: 1 };
  const pickPath = () => { let r = R() * total; for (const p of paths) { if ((r -= p.len) <= 0) return p; } return paths[0]; };   // longer paths get more people
  const hY = (x, z) => (terrain.heightAt ? terrain.heightAt(x, z) || 0 : 0);
  for (let i = 0; i < (opts.count || 0); i++) {
    const c = createCharacter(ctx, crowdLook(i, 300 + (opts.seed || 5))); c.object.name = 'passerby' + i;
    const path = pickPath(), w = {
      c, path, s: R() * path.len, dir: R() < 0.5 ? 1 : -1, speed: 0.85 + R() * 0.5, lane: path.w * (0.1 + R() * 0.18), side: 0, slow: 1,
      pause: 0, nextPause: 8 + R() * 18, yaw: 0, look: R() < 0.5 ? -1 : 1,
    };
    path.at(w.s, P); w.yaw = Math.atan2(P.tx * w.dir, P.tz * w.dir);
    c.object.position.set(P.x - P.tz * w.lane, hY(P.x, P.z), P.z + P.tx * w.lane); c.object.rotation.y = w.yaw; c.play('walk', { speed: w.speed });
    group.add(c.object); walkers.push(w);
  }

  function update(dt, t, pp) {
    dt = Math.min(dt, 0.1);
    for (const w of walkers) {
      const c = w.c, o = c.object;
      // occasional stop: idle, glance to one side, walk on
      if (w.pause > 0) { w.pause -= dt; if (w.pause <= 0) { w.nextPause = 10 + R() * 22; c.play('walk', { speed: w.speed }); } }
      else if ((w.nextPause -= dt) <= 0) { w.pause = 1.6 + R() * 2.2; w.look = -w.look; c.play('idle', {}); }
      // give way to the player: slow down when they are in front, step aside when they are close
      let want = 1, sideWant = 0;
      if (pp) {
        const dx = pp.x - o.position.x, dz = pp.z - o.position.z, d = Math.hypot(dx, dz), fx = Math.sin(w.yaw), fz = Math.cos(w.yaw), ahead = dx * fx + dz * fz, lat = dx * fz - dz * fx;
        if (d < 2.2 && ahead > -0.3) { want = clamp((d - 0.7) / 1.5, 0.25, 1); sideWant = (lat > 0 ? 1 : -1) * clamp(1.4 - d, 0, 0.9); }
      }
      w.slow += (want - w.slow) * Math.min(1, dt * 4); w.side += (sideWant - w.side) * Math.min(1, dt * 3);
      const v = w.pause > 0 ? 0 : w.speed * w.slow;
      w.s += v * w.dir * dt;
      if (!w.path.closed && (w.s <= 0.3 || w.s >= w.path.len - 0.3)) { w.s = clamp(w.s, 0.3, w.path.len - 0.3); w.dir = -w.dir; w.pause = Math.max(w.pause, 0.8 + R()); c.play('idle', {}); }   // end of the path: stop, turn around
      w.path.at(w.s, P);
      const lane = w.lane + w.side, x = P.x - P.tz * lane * w.dir, z = P.z + P.tx * lane * w.dir;
      o.position.set(x, hY(x, z), z);
      const target = Math.atan2(P.tx * w.dir, P.tz * w.dir) + (w.pause > 0 ? 0.5 * w.look : 0);
      w.yaw += wrapA(target - w.yaw) * Math.min(1, dt * (w.pause > 0 ? 2.5 : 5)); o.rotation.y = w.yaw;
      if (w.pause <= 0) c.play('walk', { speed: Math.max(0.2, v) });
      c.update(dt, t);
    }
  }
  // dispose frees the whole tree first (skeleton bone textures, materials): the character's own dispose detaches the object, so the host's
  // scene-wide disposeTree would never reach it afterwards
  return { group, walkers, update, dispose() { for (const w of walkers) { try { disposeTree(w.c.object); w.c.dispose && w.c.dispose(); } catch (e) { /* ignore */ } } } };
}

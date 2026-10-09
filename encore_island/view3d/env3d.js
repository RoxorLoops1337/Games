// Encore Island 3D environment: everything that is the world itself (light + mood, sky, sea, islands, hub paving, boardwalks, decor, ambience).
// It SELF-SYNCS from the game state: every frame it compares S.lands with what is built and builds / disposes lands incrementally (the hub
// is built synchronously in init). Pieces live in env_*.js; this file is the conductor.
//   init(V) -> { update(dt, t, focus), getMood(), setMoodOverride(mood|null, blend), heightAt(x, z), dispose() }
import * as THREE from 'three';
import * as kit from './kit.js';
import { W, WY, biomeIdx, radiusSafe, runSync } from './env_util.js';
import { BIOME_MOODS, parseMood, newMood, copyMood, mixMood, toKit, seasonWash } from './env_mood.js';
import { createWater } from './env_water.js';
import { buildIslandG } from './env_island.js';
import { buildHubFloorG, hubBlocked } from './env_hub.js';
import { buildDecorG } from './env_decor.js';
import { buildWalkG } from './env_walk.js';
import { createSky } from './env_sky.js';
import { createAmbient, createMist } from './env_fx.js';

const easeBack = (u) => { const c1 = 1.70158, c3 = c1 + 1, x = Math.min(1, Math.max(0, u)) - 1; return 1 + c3 * x * x * x + c1 * x * x; };

export function init(V) {
  const { scene, camera, rig, LOOK } = V, Q = V.quality || kit.Q, root = new THREE.Group(); root.name = 'env3d'; (V.world || scene).add(root);
  const biomeMoods = BIOME_MOODS.map((m) => parseMood(m));
  const cur = newMood(), tgt = newMood(), tmp = newMood(); copyMood(cur, biomeMoods[0]);
  let over = null, overBlend = 0, kitMood = null, kitStamp = -1, frame = 0, warned = false;
  const water = createWater(V); root.add(water.mesh);
  const sky = createSky(V); root.add(sky.root);
  const amb = createAmbient(V); root.add(amb.points);
  const mist = createMist(V); root.add(mist.group);
  const recs = new Map(); // land index (0 = hub) -> { k, g, grp, parts: [], ready }
  const queue = []; // build tasks, run within a per-frame time budget
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const guard = (fn) => { try { return fn(); } catch (e) { if (!warned) { warned = true; console.warn('[env3d]', e); } } };

  // ---------------------------------------------------------------- lands
  /** generator: builds land k in small steps (yield between), adds it to the scene at the end; the driver decides how many steps fit in a frame */
  function* buildLandG(k) {
    const g = geoOf(k), bi = biomeIdx(k), B = k === 0 ? BIOMES[0] : BIOMES[bi], rec = { k, g, bi, B, grp: new THREE.Group(), isl: null, born: null, ready: false };
    rec.grp.name = 'land' + k; const dec = (V.quality && V.quality.decor !== undefined) ? V.quality.decor : 1;
    const isl = yield* buildIslandG(g, B, bi); rec.isl = isl; rec.grp.add(isl.grp); yield;
    if (k === 0) { rec.grp.add(yield* buildHubFloorG()); isl.grp.add(yield* buildDecorG(g, B, 0, HUBDECOR, { hub: true, density: dec, blocked: hubBlocked, keep: HUB_KEEP.map((o) => ({ x: o.x, y: o.y, r: o.r * 0.6 })) })); }
    else {
      const keep = [landPadSpot(g), g.den, unlockSpot(k + 1)].concat(landPlateDefs(k, g)).map((o) => ({ x: o.x, y: o.y, r: 95 }));
      for (let i = 0; i < g.path.length; i += 1) keep.push({ x: g.path[i].x, y: g.path[i].y, r: 105 });
      isl.grp.add(yield* buildDecorG(g, B, bi, decorOf(g), { keep, density: dec })); yield; rec.walk = yield* buildWalkG(g); rec.grp.add(rec.walk);
    }
    if (recs.has(k)) return null; // a duplicate raced in: drop this one
    root.add(rec.grp); recs.set(k, rec); rec.ready = true; return rec;
  }
  guard(() => runSync(buildLandG(0)));

  function disposeLand(k) {
    const rec = recs.get(k); if (!rec) return; root.remove(rec.grp);
    rec.grp.traverse((n) => { if (n.geometry && !n.userData.sharedGeo) n.geometry.dispose(); }); recs.delete(k);
  }

  function syncLands() {
    const n = (typeof S !== 'undefined' && S.lands) ? S.lands.length : 0;
    for (const k of [...recs.keys()]) if (k > n) disposeLand(k);
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].k > n) queue.splice(i, 1);
    for (let k = 1; k <= n; k++) if (!recs.has(k) && !queue.some((q) => q.k === k)) queue.push({ k, gen: buildLandG(k) });
    // shore map follows the lands: re-bake whenever the set changes
    mist.set(n + 1 <= 60 ? n + 1 : -1);
    const key = 'n' + n; if (water.key !== key) { const ex = worldExtent(n); sky.setWorld((ex.x0 + ex.x1) / 2 * W, (ex.y0 + ex.y1) / 2 * W, Math.hypot(ex.x1 - ex.x0, ex.y1 - ex.y0) / 2 * W); water.key = key; const geos = [HUB_GEO]; for (let k = 1; k <= n; k++) geos.push(geoOf(k)); water.request(geos, worldExtent(n), key); }
  }
  function runQueue(ms) {
    const t0 = now();
    while (queue.length && now() - t0 < ms) {
      const q = queue[0]; let r = null; try { r = q.gen.next(); } catch (e) { r = { done: true, value: null }; if (!warned) { warned = true; console.warn('[env3d]', e); } }
      if (r.done) { queue.shift(); const rec = r.value; if (rec && rec.k > 0) { const z = S.lands[rec.k - 1]; if (z && typeof z.born === 'number' && S.t - z.born < 1.2 && S.t > 2) rec.born = z.born; } }
    }
  }

  // ---------------------------------------------------------------- mood
  function nearestK(fx, fz) { const x = fx / W, y = fz / W; return typeof nearestLandIdx === 'function' ? nearestLandIdx(x, y) : 0; }
  function updateMood(dt, focus) {
    const k = nearestK(focus.x, focus.z); copyMood(tgt, biomeMoods[biomeIdx(k)]);
    guard(() => { if (typeof seasCur === 'function' && S.feat && S.feat.seasons && !S.feat.seasons.off) seasonWash(tgt, seasCur()); });
    if (over && overBlend > 0) mixMood(tgt, tgt, over, overBlend);
    mixMood(cur, cur, tgt, 1 - Math.exp(-dt * 1.7));
    rig.apply(cur); LOOK.cloud.value = cur.cloud; scene.fog && (scene.fog.color.copy(cur.fog));
    if (V.lab && V.renderer) V.renderer.toneMappingExposure = cur.exposure;
  }

  // ---------------------------------------------------------------- frame
  const _f = { x: 0, z: 0 };
  // distance culling: an island (and its boardwalk) beyond the fog is not drawn at all
  function cull() {
    const cp = camera.position, far = cur.fogFar * 1.04;
    for (const rec of recs.values()) { const dx = rec.g.x * W - cp.x, dz = rec.g.y * W - cp.z, d = Math.hypot(dx, dz) - rec.g.r * W * 1.3 - (rec.k ? 30 : 0); rec.grp.visible = d < far; }
  }
  function update(dt, t, focus) {
    dt = Math.min(dt || 0.016, 0.1); frame++; const f = focus || _f;
    guard(syncLands); runQueue(4);
    guard(() => water.work(2));
    guard(() => updateMood(dt, f));
    guard(() => water.update(dt, t, camera, cur));
    guard(() => sky.update(dt, t, camera, cur));
    guard(() => amb.update(dt, t, f, camera, biomeIdx(nearestK(f.x, f.z)), V.renderer));
    guard(() => mist.update(dt, t, cur, camera));
    guard(() => cull());
    // island grow-in for the newest land
    for (const rec of recs.values()) if (rec.born !== null && rec.isl) {
      const u = (S.t - rec.born) / 1.1, s = u >= 1 ? 1 : Math.max(0.04, easeBack(u)); rec.isl.grp.scale.setScalar(s);
      if (u >= 1) { rec.born = null; water.grow(0, 0, 1, 1); } else water.grow(rec.g.x * W, rec.g.y * W, rec.isl.R, Math.min(1, Math.max(0, s)));
    }
  }

  function heightAt(x, z) {
    const px = x / W, py = z / W, n = (typeof S !== 'undefined' && S.lands) ? S.lands.length : 0;
    if (radiusSafe(HUB_GEO, px, py) > 0) return 0;
    for (let k = 1; k <= n; k++) { const g = geoOf(k); if (radiusSafe(g, px - g.x, py - g.y) > 0) return 0; const P = g.path; for (let i = 0; i < P.length - 1; i++) { const ax = P[i].x, ay = P[i].y, vx = P[i + 1].x - ax, vy = P[i + 1].y - ay, tt = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1))); if (Math.hypot(px - ax - vx * tt, py - ay - vy * tt) < PATH_HALF) return 0; } }
    return WY;
  }

  return {
    update, heightAt, water,
    /** the live blended mood (colours are THREE.Color, which rig.apply / setClearColor / Color.set all accept); getMood('css') returns the kit's string form */
    getMood(form) { if (form === 'css') { if (kitStamp !== frame) { kitMood = toKit(cur); kitStamp = frame; } return kitMood; } return cur; },
    setMoodOverride(m, blend = 1) { if (!m) { over = null; overBlend = 0; return; } over = parseMood(m, toKit(biomeMoods[0])); overBlend = Math.min(1, Math.max(0, blend)); },
    dispose() { for (const k of [...recs.keys()]) disposeLand(k); water.dispose(); sky.dispose(); amb.dispose(); mist.dispose(); root.parent && root.parent.remove(root); },
  };
}

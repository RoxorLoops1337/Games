// World module: NEON ROW (W-STREET), the long walk corridor of Neon City. 70 x 22 m, walk strip = the shop-side sidewalk z -3..3 (the road is not walkable), doors in x order along the north side:
//   park gate -29, home stoop -15, thrift shop 0, sound lab 13, bar 27, plus the bus stop map board (spot `map`, x 6). See PORT_PLAN section 3.
// create(ctx, args) -> { terrain, flora, npcSpecs:[bouncer], profile:'out', update?, setSpotState, setWeather, dispose }.
//   args.from = place id the player arrives from (start next to that door), args.locks = { shop:true, bar:true } initial locked doors (the game also calls world.setSpotState).
// Door states: setSpotState(id, { locked }) swaps the open look (lit window, neon on, door glow) for the closed look (dark window, red CLOSED sign, padlock plate).
// Contract extras for tests: terrain.doors { id -> {x,z} }, terrain.state(id) -> 'open'|'closed', terrain.stats() -> { tris, parts }.
import { THREE, flatMat } from './kit.js';
import { makeStore, makeToggler, glowMaterial, decalMaterial, signMaterial, haloMaterial, puddleMaterial, SIDE_TOP as G, Z0 } from './street_kit.js';
import { makeStreetAtlas } from './street_atlas.js';
import { DOORS, MAPSPOT, buildPark, buildHome, buildShop, buildStudio, buildBar, buildAlleys, buildFillers } from './street_row.js';
import { buildGround, buildLamps, buildCars, buildCart, buildBusStop, buildFurniture, buildPuddles, buildCat, buildBunting, buildMats, buildTraffic, VENTS, LANE } from './street_props.js';
import { buildSkyline } from './flora_sky.js';
import { buildLife } from './flora_life.js';

const BOUNCER = { name: 'Rex', body: 'boy', skin: '#6b4026', hair: { style: 'bald', color: '#1a1420' }, eyes: { style: 'sharp', color: '#1c1620' }, facial: 'stubble', glasses: { id: 'shades', color: '#17141f' }, top: { id: 'turtleneck', color: '#17141f' }, bottom: { id: 'techpants', color: '#17141f' }, shoes: { id: 'timbs', color: '#17141f' }, hat: { id: 'none' }, acc: { neck: { id: 'cubanchain', color: '#d4a017' } } };
const BOUNCER_AT = { x: 31.6, z: -2.55, rot: 0.2 }, FOXY_AT = { x: -13.3, z: -0.6, rot: 0.6 }; // Foxy waits at the home stoop for the first-run dialog (args.foxy)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function guard(name, fn) { try { fn(); } catch (e) { console.error('[street] ' + name + ' failed: ' + (e && e.stack || e)); } }

export default function create(ctx, args) {
  args = args || {}; const t0 = performance.now();
  const group = new THREE.Group(); group.name = 'street';
  const S = makeStore(); S.atlas = makeStreetAtlas();
  guard('ground', () => buildGround(S)); guard('park', () => buildPark(S)); guard('home', () => buildHome(S)); guard('shop', () => buildShop(S)); guard('studio', () => buildStudio(S)); guard('bar', () => buildBar(S));
  guard('alleys', () => buildAlleys(S)); guard('fillers', () => buildFillers(S)); guard('lamps', () => buildLamps(S)); guard('cars', () => buildCars(S)); guard('cart', () => buildCart(S)); guard('busstop', () => buildBusStop(S));
  guard('furniture', () => buildFurniture(S)); guard('puddles', () => buildPuddles(S)); guard('bunting', () => buildBunting(S)); guard('mats', () => buildMats(S));

  // ---- merge the stores into seven meshes
  const geos = {}, meshes = {}, add = (key, buf, mat, o) => { o = o || {}; if (!buf.p.length) return null; const geo = buf.geometry(false); geos[key] = geo; const m = new THREE.Mesh(geo, mat); m.name = 'street_' + key.toLowerCase(); m.castShadow = !!o.cast; m.receiveShadow = o.receive !== false; m.frustumCulled = false; if (o.order) m.renderOrder = o.order; group.add(m); meshes[key] = m; return m; };
  const mats = { B: flatMat(), GLOW: glowMaterial(0.62, 'a'), DEC: decalMaterial(S.atlas.tex), SIGN: signMaterial(S.atlas.tex, 0.95), FX: haloMaterial(S.atlas.glow), FXP: haloMaterial(S.atlas.glow), PUD: puddleMaterial() };
  add('B', S.B, mats.B, { cast: true }); if (S.BF) add('BF', S.BF, mats.B, { cast: false }); add('GLOW', S.GLOW, mats.GLOW, { receive: false }); add('DEC', S.DEC, mats.DEC, { order: 2 }); add('SIGN', S.SIGN, mats.SIGN, { order: 3, receive: false });
  add('PUD', S.PUD, mats.PUD, { order: 4, receive: false }); add('FXP', S.FXP, mats.FXP, { order: 6, receive: false }); add('FX', S.FX, mats.FX, { order: 7, receive: false });
  const tog = makeToggler(S, geos);
  // doors start open; closed looks collapsed until a door is locked
  const doorIds = Object.keys(DOORS); doorIds.forEach((id) => { tog.set('open_' + id, true); tog.set('closed_' + id, false); });
  const locks = args.locks || {};

  // ---- live things
  const cat = buildCat(-33.3, 1.5, Z0 - 0.4, -0.25); group.add(cat.group);
  const recLens = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), new THREE.MeshBasicMaterial({ color: '#ff3a30', toneMapped: false })); recLens.position.set(DOORS.studio.x, G + 2.7, Z0 + 0.4); recLens.name = 'rec_lamp'; group.add(recLens);
  let traffic = null; guard('traffic', () => { traffic = buildTraffic(S.atlas.glow); group.add(traffic.group); });
  const NP = 8, puffs = VENTS.length * NP, steamMat = new THREE.MeshBasicMaterial({ color: '#f4eefc', transparent: true, opacity: 0.3, depthWrite: false });
  const steam = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), steamMat, puffs); steam.frustumCulled = false; steam.renderOrder = 8; steam.name = 'steam'; group.add(steam);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

  // ---- skyline + pigeons
  let sky = null; guard('skyline', () => { sky = buildSkyline(ctx, { minX: -35, maxX: 35, minZ: -4, maxZ: 8 }, ctx.kit.rng(31337), null); group.add(sky.group); });
  const hit = S.hit; let buildMs = 0;
  const heightAt = (x, z) => (z < 3.0 ? G : z < 3.4 ? G * (1 - smooth(3.0, 3.4, z)) : 0);
  // Walkable = the shop-side sidewalk from the building line to the kerb (z -3.0..2.95, x +-34.3) minus the props. The road, the parked cars and the far pavement are not.
  // A* cost (terrain.pathCost, read by controls): the clear walk lane is cheapest, the kerb strip a little dearer, the frontage (door bays) dearer still, so routes run
  // along the lane and only turn in at the door they are going to. Doors carry `intent` (spots.js): walking past a door never enters it.
  const SIDE1 = 2.95;
  const blocked = (x, z) => z < -3.0 || z > SIDE1 || x < -34.3 || x > 34.3 || hit.test(x, z);
  const pathCost = (x, z) => (z < LANE.z0 ? 1.8 : z > LANE.z1 ? 1.3 : 1);
  const free = (x, z) => z > -2.6 && z < 2.4 && x > -33 && x < 33 && !hit.test(x, z);
  let life = null; guard('pigeons', () => { life = buildLife(ctx, { pigeonHomes: [{ x: -21, z: 0.5, n: 3 }, { x: 4, z: 1.2, n: 3 }, { x: 22, z: 0.4, n: 3 }] }, free, [], heightAt); });
  const flora = { group: life ? life.group : new THREE.Group(), update: (dt, t) => { if (life) life.update(dt, t); }, stats: {} };

  // ---- terrain contract
  const from = args.from && DOORS[args.from] ? DOORS[args.from] : DOORS.home;
  // arrival: on the walk lane right in front of the door you came out of, facing the street (outside the door's release radius so it cannot fire again)
  const start = { x: from.x, z: from.z + 2.45, rot: 0 };
  const spotDefs = doorIds.map((id) => { const d = DOORS[id]; return { id, x: d.x, z: d.z, label: d.label, icon: d.icon, color: d.color, color2: d.color2, kind: 'door', intent: { dwell: 0.35, nx: 0, nz: 1 }, ring: 1.3, radius: 1.4, release: 2.2, iconY: 2.5, iconK: 0.82, pillar: 3.2, cine: { snap: false, face: 'toward', clip: 'wave', zoom: 0.12 } }; });
  spotDefs.push({ id: 'map', x: MAPSPOT.x, z: MAPSPOT.z, label: 'MAP', icon: 'map', color: '#2ee6ff', color2: '#ffe14d', ring: 1.2, radius: 1.3, release: 2.0, iconY: 2.3, iconK: 0.8, pillar: 2.8, cine: { snap: false, face: 'toward', clip: 'wave', zoom: 0.14 } });
  const terrain = {
    // the sun stays on the camera side of the street: from behind the shops the facades' shadow (their height is off screen) read as a mystery square sliding along the sidewalk
    sunAzOffset: 180,
    group, bounds: { minX: -35, maxX: 35, minZ: -11, maxZ: 11 }, blocked, pathCost, heightAt, pathDist: (x, z) => (z > -3.2 && z < 3.2 ? 0 : 12), keepout: (x, z, r) => blocked(x, z) || blocked(x + (r || 0.3), z) || blocked(x - (r || 0.3), z), paths: [],
    spotDefs, camera: { mode: 'corridor', hWidth: 11.5, dist: 20, fov: 40, pitch: 42, lockZ: 0.0, walkZ: [-3, 3], lateralK: 0.22 },
    // lighting reads these: lamps for the glow cards and cones; graffiti and busk anchors parked far away because the street draws its own neon halos
    anchors: { start, lamps: S.lamps.slice(), graffiti: { x: 0, z: -90 }, buskSpot: { x: 0, z: -90 }, fountain: { x: 6, z: 2 }, gate: { x: -28, z: 3, rot: 0 }, door: { x: from.x, z: from.z }, bouncer: BOUNCER_AT },
    doors: DOORS, map: MAPSPOT, state: (id) => (tog.get('closed_' + id) ? 'closed' : 'open'),
    stats() { let tris = 0; for (const k in geos) tris += geos[k].attributes.position.count / 3; return { tris: Math.round(tris), parts: Object.keys(geos).length, buildMs: Math.round(buildMs), skyline: sky ? { buildings: sky.buildings } : null }; },
  };
  hit.circle(BOUNCER_AT.x, BOUNCER_AT.z, 0.45);

  // ---- door state: open look vs closed look
  function setDoor(id, locked) {
    if (!DOORS[id]) return; tog.set('open_' + id, !locked); tog.set('closed_' + id, locked);
    if (id === 'studio') recLens.visible = !locked;
    if (id === 'shop') tog.set('shop_blade', !locked); if (id === 'park') tog.set('park_lights', !locked); if (id === 'home' || id === 'bar') { /* covered by the sections */ }
  }
  Object.keys(locks).forEach((id) => setDoor(id, !!locks[id]));

  // ---- per-frame
  let placedNpc = false, tLast = 0, flick = 1;
  const state = () => { const w = ctx.host && ctx.host.world; return w && w.lighting && w.lighting.getState ? w.lighting.getState() : null; };
  terrain.update = (dt, t) => {
    tLast = t; const st = state(), neon = st ? st.neon : 0.7, night = st ? st.night : 0.5, rain = st ? st.rain || 0 : 0;
    if (!placedNpc && ctx.npcs && ctx.npcs.length) { placedNpc = true; for (const n of ctx.npcs) { const at = n.id === 'bouncer' ? BOUNCER_AT : n.id === 'foxy' ? FOXY_AT : null; if (at && n.place) { n.place(at.x, at.z, at.rot); if (n.play) n.play('idle'); } } }
    // neon buzz: now and then the big signs dip for a few frames
    const f = Math.sin(t * 47.0) * Math.sin(t * 3.7); flick = f > 0.93 ? 0.55 : 1;
    mats.FX.color.setScalar((0.03 + 0.62 * clamp(neon, 0, 1)) * flick * (1 + 0.04 * Math.sin(t * 9)));
    mats.FXP.color.setScalar(clamp(rain * 1.2 + night * 0.28, 0, 1.4) * (0.7 + 0.3 * flick));
    mats.PUD.opacity = clamp(0.22 + rain * 0.7 + night * 0.12, 0, 1);
    // REC lamp blink (1.1 Hz), brighter at night
    recLens.material.color.setRGB(1, 0.16, 0.12).multiplyScalar(((t * 1.1) % 1) < 0.55 ? 1.3 + night * 2.4 : 0.22);
    cat.update(t); if (traffic) traffic.update(t, night);
    for (let v = 0; v < VENTS.length; v++) for (let k = 0; k < NP; k++) {
      const ph = ((t * 0.26 + k / NP + v * 0.37) % 1), vt = VENTS[v], sc = (0.16 + ph * 0.95) * (1 - smooth(0.65, 1, ph)) * (0.75 + 0.25 * Math.sin(v * 3 + k * 2));
      _p.set(vt.x + Math.sin(ph * 6 + k * 1.7 + v) * 0.2 * ph + ph * ph * 1.3, vt.y + 0.1 + ph * 2.4, vt.z + Math.cos(ph * 5 + k * 2.1) * 0.22 * ph + ph * 0.4); _q.setFromEuler(_e.set(k, ph * 3, 0)); _s.set(sc * 1.15, sc, sc); steam.setMatrixAt(v * NP + k, _m.compose(_p, _q, _s));
    }
    steam.instanceMatrix.needsUpdate = true; steamMat.opacity = 0.3 - 0.06 * night + 0.06 * rain;
  };

  buildMs = performance.now() - t0;
  return {
    terrain, flora, npcSpecs: args.foxy ? [{ id: 'bouncer', look: BOUNCER }, { id: 'foxy' }] : [{ id: 'bouncer', look: BOUNCER }], profile: 'out',
    setSpotState(id, st) { if (!st || !DOORS[id]) return; if ('locked' in st) setDoor(id, !!st.locked); },
    setWeather() { /* lighting drives rain; puddles read its state each frame */ },
    dispose() { /* the host frees the scene graph; nothing external to release */ },
  };
}

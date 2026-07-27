// The material library: every surface in the level, generated at boot.
//
// Nothing is downloaded. Each surface is synthesised as four maps — albedo,
// tangent-space normal, and an occlusion/roughness/metalness pack — from noise
// fields in `materials/surfaces.js`, uploaded as DataTextures and wrapped in a
// MeshStandardMaterial that has been patched (see `materials/shader.js`) for
// world-space projection, a close-range detail normal and macro tile breakup.
//
// The three decisions that shape this file:
//
// * **One ORM texture per surface.** three reads occlusion from red, roughness
//   from green and metalness from blue, so all three maps are the same object:
//   one upload, one sampler, one third of the memory.
// * **Bake cost is paid where it shows.** The surfaces that fill the most
//   pixels get full resolution; everything else is generated at half and leans
//   on the shared detail normal, which is what carries close range anyway. The
//   long tail is baked lazily on first use, and warmed in the background while
//   the player is still on the menu.
// * **`get()` never returns undefined.** An unknown name falls back to
//   concrete. A level that asks for a surface nobody wrote yet gets a wall, not
//   a crash.

import * as THREE from 'three';
import { SURFACE } from '../core/constants.js';
import { RECIPES, detailNormal } from './materials/surfaces.js';
import { installSurfaceShader } from './materials/shader.js';

// metres: world size of one texture tile — the single number that sets texel
// density, and the reason a crate and a hangar wall look like the same concrete.
// tiles: detail-normal repeats inside one base tile. strength/near/far: how hard
// the detail is blended and over what distance it fades out.
const DEFS = {
  concrete:  { metres: 2.6, tri: 1, detail: 'grit',  tiles: 10, strength: 0.75, macro: 0.42, ns: 1.0 },
  metal:     { metres: 2.2, tri: 1, detail: 'metal', tiles: 9,  strength: 0.55, macro: 0.30, ns: 0.9 },
  rust:      { metres: 2.2, tri: 1, detail: 'metal', tiles: 9,  strength: 0.70, macro: 0.36, ns: 1.0 },
  gunmetal:  { metres: 0.5, tri: 0, detail: 'metal', tiles: 5,  strength: 0.50, macro: 0.12, ns: 0.8 },
  sand:      { metres: 3.4, tri: 1, detail: 'grit',  tiles: 15, strength: 0.85, macro: 0.34, ns: 0.8 },
  sandFloor: { metres: 5.0, tri: 1, detail: 'grit',  tiles: 18, strength: 0.90, macro: 0.45, ns: 1.0 },
  wood:      { metres: 2.0, tri: 1, detail: 'grit',  tiles: 8,  strength: 0.50, macro: 0.28, ns: 1.0 },
  glass:     { metres: 1.8, tri: 0, detail: 'grit',  tiles: 4,  strength: 0.15, macro: 0.10, ns: 0.4,
               opts: { transparent: true, opacity: 1, side: THREE.DoubleSide, envMapIntensity: 1.6 } },
  paint:     { metres: 2.4, tri: 1, detail: 'grit',  tiles: 10, strength: 0.60, macro: 0.30, ns: 1.0 },
  dark:      { metres: 1.2, tri: 0, detail: 'grit',  tiles: 6,  strength: 0.50, macro: 0.18, ns: 1.0 },
  asphalt:   { metres: 4.0, tri: 1, detail: 'grit',  tiles: 13, strength: 0.70, macro: 0.40, ns: 1.0 },
  flesh:     { metres: 1.0, tri: 0, detail: 'grit',  tiles: 6,  strength: 0.40, macro: 0.18, ns: 0.9 },
  gantry:    { metres: 1.0, tri: 0, detail: 'metal', tiles: 4,  strength: 0.40, macro: 0.10, ns: 1.0,
               opts: { alphaTest: 0.5, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide } },
};

// What the collision surface ids should look like. Ballistics and footsteps
// already speak in these; this keeps the level from having to invent a mapping.
const BY_SURFACE = {
  [SURFACE.CONCRETE]: 'concrete', [SURFACE.METAL]: 'metal', [SURFACE.SAND]: 'sandFloor',
  [SURFACE.WOOD]: 'wood', [SURFACE.GLASS]: 'glass', [SURFACE.FLESH]: 'flesh',
  [SURFACE.FOLIAGE]: 'wood', [SURFACE.WATER]: 'glass', [SURFACE.RUBBER]: 'dark',
};

// Baked at boot because the level is made of them; the rest of the table is
// generated on first request and warmed in the background afterwards.
const EAGER = ['concrete', 'sandFloor', 'metal', 'paint', 'dark'];

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export async function createMaterials(G, engine) {
  const t0 = now();
  const q = Math.max(0, Math.min(3, (G && G.settings && G.settings.quality) | 0));
  // Sizes are powers of two — the field code wraps with a mask, and mipmapping
  // a 2048² of every surface would cost more upload bandwidth than it buys
  // detail that the detail normal is already providing.
  const HERO = q >= 2 ? 512 : 256;
  const STD = q >= 2 ? 256 : 128;
  const DET = q >= 2 ? 256 : 128;

  const maxAniso = (engine && engine.caps && engine.caps.aniso) || 1;
  let aniso = Math.min((engine && engine.tier && engine.tier.aniso) || 1, maxAniso);

  const cache = new Map();        // name → material
  const texCache = new Map();     // key → { map, normal, orm, lum }
  const textures = [];
  const stats = { bakedMs: 0, baked: 0, texels: 0 };

  function makeTex(data, size, srgb) {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // Albedo is the only map that holds colour. Putting a normal or a roughness
    // through the sRGB decode is the classic way to get shading that is subtly,
    // inexplicably wrong everywhere.
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = aniso;
    t.needsUpdate = true;
    textures.push(t);
    return t;
  }

  // Detail normals are shared by every surface that asks for the same family —
  // one 256² map tiled 10× inside every base tile, which is why it can be this
  // small and still be the thing that holds up at 30 cm.
  const details = {};
  function detail(kind) {
    if (details[kind]) return details[kind];
    const t = now();
    const tex = makeTex(detailNormal(DET, kind), DET, false);
    stats.bakedMs += now() - t;
    return (details[kind] = tex);
  }

  function bake(name) {
    if (texCache.has(name)) return texCache.get(name);
    const rec = RECIPES[name];
    if (!rec) return null;
    const size = rec.hero ? HERO : STD;
    const t = now();
    const r = rec.fn(size, 1009 + name.length * 131 + name.charCodeAt(0) * 7);
    // Mean luminance feeds the macro breakup term, which multiplies around it;
    // measuring it here beats guessing a constant per surface.
    let sum = 0, n = 0;
    for (let i = 0; i < r.albedo.length; i += 64) {
      sum += (0.2126 * r.albedo[i] + 0.7152 * r.albedo[i + 1] + 0.0722 * r.albedo[i + 2]) / 255;
      n++;
    }
    const set = {
      map: makeTex(r.albedo, size, true),
      normal: makeTex(r.normal, size, false),
      orm: makeTex(r.orm, size, false),
      lum: n ? sum / n : 0.35,
      alpha: r.alpha,
      size,
    };
    stats.bakedMs += now() - t;
    stats.baked++;
    stats.texels += size * size * 3;
    texCache.set(name, set);
    return set;
  }

  function build(name, over) {
    const def = DEFS[name] || DEFS.concrete;
    const set = bake(RECIPES[name] ? name : 'concrete');
    const repeat = over && over.repeat;
    const tri = over && over.triplanar != null ? !!over.triplanar : !!def.tri;
    const metres = (over && over.metres) || def.metres;

    let map = set.map, normal = set.normal, orm = set.orm;
    if (repeat && repeat !== 1) {
      // A repeat lives on the texture, not the material, so a second tiling
      // needs its own view of the same pixels. `clone()` shares the image and
      // costs one extra upload — cheap, but not free, hence the cache.
      map = map.clone(); normal = normal.clone(); orm = orm.clone();
      for (const t of [map, normal, orm]) { t.repeat.set(repeat, repeat); t.needsUpdate = true; textures.push(t); }
    }

    const m = new THREE.MeshStandardMaterial(Object.assign({
      color: 0xffffff,
      map,
      normalMap: normal,
      // Absolute values live in the map; the scalars stay at 1 so nothing is
      // multiplied twice.
      roughnessMap: orm, roughness: 1,
      metalnessMap: orm, metalness: 1,
      aoMap: orm, aoMapIntensity: 1,
      normalScale: new THREE.Vector2(def.ns || 1, def.ns || 1),
      envMapIntensity: 1,
      dithering: true,
    }, def.opts || {}, (over && over.material) || {}));
    m.name = 'bs-' + name;
    m.userData.surface = name;

    const shaderOpts = {
      triplanar: tri,
      metres,
      detailMap: detail(def.detail || 'grit'),
      detailTiles: def.tiles || 8,
      detailStrength: q > 0 ? (def.strength != null ? def.strength : 0.6) : 0,
      detailNear: 1.2, detailFar: 11,
      macroScale: 7.3,
      macroStrength: def.macro != null ? def.macro : 0.3,
      meanLum: set.lum,
    };
    installSurfaceShader(m, shaderOpts);

    // `Material.copy` does not carry `onBeforeCompile`, so anything that clones
    // one of these — the level does, to turn vertex colours on per chunk —
    // would silently get a flat UV-mapped version with none of the projection
    // or detail work. Cloning has to re-arm the patch, and so do clones of
    // clones.
    const reclone = function () {
      const c = THREE.MeshStandardMaterial.prototype.clone.call(this);
      installSurfaceShader(c, shaderOpts);
      c.clone = reclone;
      return c;
    };
    m.clone = reclone;
    return m;
  }

  function get(name) {
    let m = cache.get(name);
    if (m) return m;
    if (!DEFS[name]) name = 'concrete';
    m = cache.get(name) || build(name);
    cache.set(name, m);
    return m;
  }

  for (const name of EAGER) get(name);

  // The tail of the table, warmed while the player is reading the main menu.
  // Doing it here rather than at boot keeps the first frame close, and doing it
  // at all keeps the first grenade from stalling on a 40 ms bake.
  let idleHandle = 0;
  const rest = Object.keys(DEFS).filter((k) => !cache.has(k));
  function warmNext() {
    idleHandle = 0;
    // At least one per callback, then as many more as fit: a single surface
    // already overruns any idle budget, so the rule is "one, then stop".
    const t = now();
    do { get(rest.shift()); } while (rest.length && now() - t < 8);
    schedule();
  }
  function schedule() {
    if (!rest.length || typeof window === 'undefined') return;
    idleHandle = window.requestIdleCallback
      ? window.requestIdleCallback(warmNext, { timeout: 2000 })
      : setTimeout(warmNext, 60);
  }
  schedule();

  const bootMs = now() - t0;

  let appliedAniso = aniso;
  let time = 0;

  return {
    cache,
    stats: Object.assign(stats, { bootMs, hero: HERO, std: STD }),

    get,

    // Same materials, on request with a different tiling or projection. Used
    // for anything whose geometry already has good UVs, or that moves — a
    // world-space projection swims on a moving object.
    getTextured(name, opts = {}) {
      const key = name + '|' + (opts.repeat || 1) + '|' + (opts.triplanar ? 1 : 0) + '|' + (opts.metres || 0);
      let m = cache.get(key);
      if (m) return m;
      if (!DEFS[name]) name = 'concrete';
      m = build(name, opts);
      cache.set(key, m);
      return m;
    },

    // Surface id (the one ballistics and footsteps already use) → material.
    forSurface(id) { return get(BY_SURFACE[id] || 'concrete'); },

    names: Object.keys(DEFS),

    // Nothing here animates, so this is only a hook: it keeps filtering in step
    // with a quality change made from the settings menu, which otherwise leaves
    // every texture at the anisotropy it happened to be built with.
    update(dt) {
      time += dt || 0;
      const want = Math.min((engine && engine.tier && engine.tier.aniso) || 1, maxAniso);
      if (want !== appliedAniso) {
        appliedAniso = aniso = want;
        for (const t of textures) { t.anisotropy = want; t.needsUpdate = true; }
      }
    },

    dispose() {
      if (idleHandle && typeof window !== 'undefined') {
        (window.cancelIdleCallback || window.clearTimeout)(idleHandle);
      }
      for (const t of textures) t.dispose();
      for (const m of cache.values()) m.dispose();
      textures.length = 0; cache.clear(); texCache.clear();
    },
  };
}

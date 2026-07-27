// The viewmodel's material set, plus the little environment it needs to look
// like metal.
//
// The world materials come in through `materials.get()` so the weapon shares
// whatever the materials agent decides steel and polymer are made of, but they
// are cloned and re-tuned before use: a world material is authored for a wall
// two metres wide, and its maps tile at a scale that turns into visible noise on
// a part five centimetres across. So the clone keeps the physical setup (env map
// intensity, colour space, side) and drops the world-scale maps for a small,
// tight wear map generated here.
//
// Colour lives in vertex colours (see geometry.js), which is why every material
// below is white with `vertexColors` on. That is what lets a whole rifle — blued
// steel, phosphate, anodised rail, tan polymer — be four draw calls.

import * as THREE from 'three';

// A gun's finish is not uniform. Parkerising is blotchy, anodising is even but
// scuffed, and both pick up fine directional scratches from being carried. One
// small greyscale map driving roughness gets all of that for 256² of memory.
function wearTexture(size = 256) {
  let cv;
  try {
    cv = document.createElement('canvas');
    cv.width = cv.height = size;
  } catch { return null; }
  const ctx = cv.getContext('2d');
  if (!ctx) return null;

  // Base: mottled blotches, low contrast — this is the finish itself.
  ctx.fillStyle = '#d6d6d6';
  ctx.fillRect(0, 0, size, size);
  let seed = 0x2f6e2b1;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 700; i++) {
    const r = 3 + rnd() * 26;
    const v = 214 + (rnd() - 0.5) * 70;
    ctx.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},0.10)`;
    ctx.beginPath();
    ctx.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Scratches: long, shallow, mostly aligned with the bore because that is the
  // direction the weapon gets dragged in and out of a rack.
  ctx.lineCap = 'round';
  for (let i = 0; i < 190; i++) {
    const x = rnd() * size, y = rnd() * size;
    const a = (rnd() < 0.72 ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.5;
    const len = 6 + rnd() * 70;
    const bright = rnd() < 0.5;
    ctx.strokeStyle = bright ? 'rgba(255,255,255,0.22)' : 'rgba(90,90,90,0.18)';
    ctx.lineWidth = 0.6 + rnd() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// A soft red dot with a faint halo. The halo matters more than the dot: a bare
// disc reads as a decal stuck on the glass, whereas a dot with a bloom around it
// reads as a light source floating behind it, which is what a collimated sight
// actually looks like.
function reticleTexture(size = 64, style = 'dot') {
  let cv;
  try { cv = document.createElement('canvas'); cv.width = cv.height = size; }
  catch { return null; }
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.00, 'rgba(255,255,255,1)');
  g.addColorStop(0.10, 'rgba(255,110,70,1)');
  g.addColorStop(0.24, 'rgba(255,40,20,0.55)');
  g.addColorStop(0.55, 'rgba(255,25,10,0.10)');
  g.addColorStop(1.00, 'rgba(255,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.fill();
  if (style === 'chevron') {
    ctx.strokeStyle = 'rgba(255,70,40,0.85)';
    ctx.lineWidth = size * 0.055;
    ctx.beginPath();
    ctx.moveTo(c - size * 0.20, c - size * 0.16);
    ctx.lineTo(c, c + size * 0.12);
    ctx.lineTo(c + size * 0.20, c - size * 0.16);
    ctx.stroke();
  } else if (style === 'cross') {
    ctx.strokeStyle = 'rgba(20,20,22,0.9)';
    ctx.lineWidth = size * 0.03;
    ctx.beginPath();
    ctx.moveTo(0, c); ctx.lineTo(size * 0.36, c);
    ctx.moveTo(size, c); ctx.lineTo(size * 0.64, c);
    ctx.moveTo(c, 0); ctx.lineTo(c, size * 0.36);
    ctx.moveTo(c, size); ctx.lineTo(c, size * 0.64);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The view scene is its own scene, so it gets none of the world's IBL for free.
// Without an environment a low-roughness metal has nothing to reflect and comes
// back flat charcoal, which is exactly the "pasted on" look to avoid. Build a
// cheap sky/ground gradient probe as a floor, and swap to the world's real env
// map the moment the sky agent produces one.
function fallbackEnv(engine) {
  try {
    const w = 32, h = 16;
    const data = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      const t = 1 - y / (h - 1);            // 1 at the top
      // Sky above, warm bounce below, and a brighter band at the horizon: three
      // tones is enough for a curved barrel to show a readable gradient.
      const sky = [0.95, 1.15, 1.55], grd = [0.42, 0.36, 0.28], hor = [1.55, 1.44, 1.26];
      const band = Math.exp(-Math.pow((t - 0.5) * 6, 2));
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const m = t > 0.5 ? sky : grd;
        data[i] = m[0] * (1 - band) + hor[0] * band;
        data[i + 1] = m[1] * (1 - band) + hor[1] * band;
        data[i + 2] = m[2] * (1 - band) + hor[2] * band;
        data[i + 3] = 1;
      }
    }
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.needsUpdate = true;
    const pm = new THREE.PMREMGenerator(engine.renderer);
    const rt = pm.fromEquirectangular(tex);
    pm.dispose();
    tex.dispose();
    return rt.texture;
  } catch {
    return null;   // no probe is survivable; a black screen is not
  }
}

export function createGunMaterials(G, engine, materials) {
  const wear = wearTexture(256);

  // Clone from the world set so the weapon inherits whatever global decisions
  // the materials agent has made, then strip the world-scale maps.
  const from = (name, over) => {
    let base;
    try { base = materials && materials.get ? materials.get(name) : null; } catch { base = null; }
    // A world material may carry a shader hook authored for a two-metre wall.
    // On a four-centimetre receiver that is worse than no material at all.
    if (base && !base.isMeshStandardMaterial) base = null;
    const m = base && base.clone ? base.clone() : new THREE.MeshStandardMaterial();
    m.onBeforeCompile = () => {};
    m.customProgramCacheKey = () => 'blacksite-vm';
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'bumpMap', 'displacementMap', 'alphaMap']) {
      if (k in m) m[k] = null;
    }
    m.color = new THREE.Color(0xffffff);
    m.vertexColors = true;
    m.side = THREE.FrontSide;
    m.transparent = false;
    m.roughnessMap = wear;
    Object.assign(m, over);
    m.needsUpdate = true;
    return m;
  };

  const mats = {
    // Blued/anodised receiver steel. Low roughness so the chamfers throw a hard
    // specular line; the wear map breaks it up so it is not a mirror.
    steel: from('metal', { roughness: 0.31, metalness: 0.92, envMapIntensity: 1.9 }),
    // Phosphate on the barrel and the bolt carrier — same alloy, matte finish.
    phos: from('metal', { roughness: 0.58, metalness: 0.88, envMapIntensity: 1.45 }),
    // Furniture. Glass-filled nylon is a dielectric and much rougher; getting
    // this contrast right is most of what makes the metal look like metal.
    poly: from('dark', { roughness: 0.74, metalness: 0.04, envMapIntensity: 1.0 }),
    // Grip pads, buttpad, sling loops.
    rubber: from('dark', { roughness: 0.92, metalness: 0.0, envMapIntensity: 0.55 }),
    // Nomex glove. Slightly sheened where the palm is worn smooth.
    glove: from('dark', { roughness: 0.80, metalness: 0.0, envMapIntensity: 0.75 }),
  };

  // The lens is not glass in the usual sense — it is a coated element, which
  // means it is nearly black in diffuse and throws one bright coloured smear of
  // whatever is behind the shooter. Physical transmission would be honest and
  // also invisible, so this fakes it with a dark, very smooth metal.
  mats.lens = new THREE.MeshStandardMaterial({
    color: 0x18303f, roughness: 0.05, metalness: 0.80,
    envMapIntensity: 3.4, side: THREE.FrontSide,
  });

  const dotTex = reticleTexture(64, 'dot');
  const chevTex = reticleTexture(64, 'chevron');
  const crossTex = reticleTexture(64, 'cross');

  // Additive, depth-tested against nothing. A reticle that can be occluded by
  // its own lens flickers as the weapon moves; a reticle that respects depth
  // against the world would vanish against a bright wall. Additive over the top
  // is what every shipped optic does.
  const reticleMat = (tex, color) => new THREE.MeshBasicMaterial({
    map: tex, color, transparent: true, blending: THREE.AdditiveBlending,
    depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });

  mats.reticleDot = reticleMat(dotTex, 0xff4a2a);
  mats.reticleChevron = reticleMat(chevTex, 0xff6a30);
  mats.reticleCross = reticleMat(crossTex, 0xff8a40);

  // Tritium/fibre inserts on the iron sights. Tiny, but they are the difference
  // between irons that read as sights and irons that read as bumps.
  mats.tritium = new THREE.MeshBasicMaterial({ color: 0x9fffcf, toneMapped: false });
  mats.foresight = new THREE.MeshBasicMaterial({ color: 0xff7a1a, toneMapped: false });

  const env = { fallback: null, current: null };

  return {
    mats,
    // Called every frame; almost always a no-op after the first.
    syncEnvironment(view, scene) {
      const world = scene ? scene.environment : null;
      if (world) {
        if (env.current !== world) { env.current = world; view.environment = world; }
      } else {
        if (!env.fallback) env.fallback = fallbackEnv(engine);
        if (env.fallback && env.current !== env.fallback) { env.current = env.fallback; view.environment = env.fallback; }
      }
      if ('environmentIntensity' in view) view.environmentIntensity = 1.0;
    },
    dispose() {
      for (const k in mats) if (mats[k] && mats[k].dispose) mats[k].dispose();
      if (wear) wear.dispose();
      if (env.fallback) env.fallback.dispose();
    },
  };
}

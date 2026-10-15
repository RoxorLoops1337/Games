// Gladiator portraits: a bust / three-quarter render of the real 3D gladiator (createGladiator) in a tiny studio scene.
//   const P = createPortraitRenderer({ tier, renderer? });   // renderer given => renders into a render target of THAT renderer (state restored)
//   P.portrait(glad, { w, h, pose, style })  -> HTMLCanvasElement (filled now when cached, else blank and filled when its turn comes)
//   P.portraitAsync(glad, opts)              -> Promise<HTMLCanvasElement> (own copy)
//   P.portraitSync(glad, opts)               -> cached canvas copy or null (callers then fall back to styleBadge)
//   P.dataURL(glad, opts) -> Promise<string>, P.flush(n) renders queued jobs now (tests), P.pending, P.stats, P.dispose()
// opts.style = framing: 'bust' (default), 'three' (to the belt), 'full'. opts.pose = 'idle' (default) | 'victory' | 'taunt' | 'block' | 'guard'.
// Queue: at most ONE render per animation frame, never inside the caller's frame; ~10 to 25 ms each (rig build included).
import * as THREE from 'three';
import { createGladiator } from './gladiator.js';
import { createBeast } from './beast.js'; // BEAST: bestiary portraits

/** module level fallback: no renderer available, so callers keep the style badge */
export const portraitSync = () => null;

const FRAMES = {
  bust: { fov: 19, dist: 2.95, y: 1.6, tx: 0.0, yaw: 0.5 },
  three: { fov: 24, dist: 4.4, y: 1.25, tx: 0.0, yaw: 0.45 },
  full: { fov: 28, dist: 5.4, y: 0.98, tx: 0.0, yaw: 0.4 },
};
/** camera for a beast portrait: bust = the head and mane three-quarter (aimed a little behind the head joint so the mane is in frame), three / full = the whole animal (sizes follow rig.nameH) */
const BUST_AIM = { lion: [0.02, 0.15], nemean: [0.02, 0.15], wolf: [0.03, 0.16], bear: [0.0, 0.17], boar: [0.0, 0.17], elephant: [-0.12, 0.45] };
function beastFrame(rig, style) {
  const k = rig.nameH, hd = rig.joints.head; rig.root.updateMatrixWorld(true); const hp = new THREE.Vector3(); hd.getWorldPosition(hp);
  if (style === 'full' || style === 'three') return { fov: 26, dist: k * 1.9 + 1.6, y: k * 0.42, tx: 0, yaw: 0.85 };
  const s = rig.size || 1, yaw = 0.8, c = Math.cos(yaw), sn = Math.sin(yaw), aim = BUST_AIM[rig.beast] || [0, -0.05], ax = hp.x + (aim[1] * s) * 0, az = hp.z + aim[1] * s * (rig.beast === 'elephant' ? 1.4 : 1);
  const x1 = ax * c + az * sn, z1 = -ax * sn + az * c;
  return { fov: 24, dist: z1 + (rig.portraitD || 2.2), y: hp.y + aim[0] * s - 0.02 * s, tx: x1, yaw };
}
/** portrait expression per beast (animator.setMood): predators growl with the teeth showing, the boar and the elephant scowl */
const BEAST_MOOD = { lion: 'growl', nemean: 'growl', wolf: 'snarl', bear: 'growl', boar: 'angry', elephant: 'angry' };
const POSES = { idle: null, guard: null, victory: 'victory', taunt: 'taunt', block: 'block' };
const key = (g, o) => {
  const gear = g.gear || {}, gs = Object.keys(gear).sort().map((k) => { const it = gear[k]; return it ? k + ':' + (it.id || it.name || '') + ':' + (typeof it.rar === 'number' ? it.rar : it.r) : k + ':-'; }).join(',');
  return [g.id, g.lvl, g.style, g.name, g.skin, g.hair, g.plume, g.color, g.face, g.beard, g.hairStyle, gs, (g.scars || []).join('+'), g.look ? JSON.stringify(g.look) : '', /* FIGHTERS */ (g.wounds || []).filter((w) => w.w > 0 || w.w == null).map((w) => w.part || w.id).sort().join('+'), o.w, o.h, o.pose, o.style].join('|');
};
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

function backdrop(style, w, h) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128 * (h / w) | 0 || 128;
  const x = c.getContext('2d'), W = c.width, H = c.height;
  const tint = mix('#5a1f5e', style || '#b5532f', 0.28).getStyle();
  const lg = x.createLinearGradient(0, 0, 0, H); lg.addColorStop(0, '#2a2540'); lg.addColorStop(0.55, tint); lg.addColorStop(1, '#1d1830');
  x.fillStyle = lg; x.fillRect(0, 0, W, H);
  const rg = x.createRadialGradient(W * 0.62, H * 0.42, 2, W * 0.62, H * 0.42, W * 0.75);
  rg.addColorStop(0, 'rgba(242,193,78,.55)'); rg.addColorStop(0.45, 'rgba(217,178,124,.18)'); rg.addColorStop(1, 'rgba(42,37,64,0)');
  x.fillStyle = rg; x.fillRect(0, 0, W, H);
  const vg = x.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.78); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(29,24,48,.55)');
  x.fillStyle = vg; x.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createPortraitRenderer({ renderer = null, tier = 'medium', maxCache = 64 } = {}) {
  const shared = !!renderer; let own = null, rt = null, rtW = 0, rtH = 0;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(20, 1, 0.1, 60);
  const key1 = new THREE.DirectionalLight(0xffc27a, shared ? 2.6 : 3.4), rim = new THREE.DirectionalLight(0x8fb2ff, shared ? 2.2 : 2.8), fill = new THREE.HemisphereLight(0x9db4e8, 0xb8743f, shared ? 0.85 : 1.0);
  key1.position.set(2.4, 2.4, 3.2); rim.position.set(-3, 2.4, -2.4);
  scene.add(key1, rim, fill);
  const cache = new Map(), inflight = new Map(), queue = [];
  let raf = 0, disposed = false, rendered = 0, lastMs = 0, ctxLost = false;
  const dpr = tier === 'low' ? 1 : 1;
  const caps = { w: tier === 'low' ? 160 : 256 };

  function getOwn() {
    if (own) return own;
    const cv = document.createElement('canvas');
    own = new THREE.WebGLRenderer({ canvas: cv, antialias: tier !== 'low', alpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    own.setPixelRatio(1); own.toneMapping = THREE.ACESFilmicToneMapping; own.toneMappingExposure = 0.95; own.outputColorSpace = THREE.SRGBColorSpace;
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ctxLost = true; });
    cv.addEventListener('webglcontextrestored', () => { ctxLost = false; });
    return own;
  }

  function draw(g, o) {
    let fr = FRAMES[o.style] || FRAMES.bust; const w = o.w, h = o.h, t0 = performance.now();
    const rig = g.beast ? createBeast(g, { detail: 'high', noShells: true }) : createGladiator(g, { seg: 8 }); // BEAST: the high tier face (sculpted lips, teeth, nostrils, brows) and 300 mane cards, but no fur shells (a bust does not show them and the program count stays lower)
    if (rig.beast) { fr = beastFrame(rig, o.style); rig.animator.setMood(BEAST_MOOD[rig.beast] || 'growl'); } // BEAST: a menacing expression (brows down, lips back, teeth) for the VS splash and the bestiary
    rig.root.rotation.y = fr.yaw; scene.add(rig.root);
    const clip = POSES[o.pose];
    // bust: arms relaxed so the weapon and shield hang below the frame instead of covering the face ('guard' keeps them raised)
    if (o.pose !== 'guard' && o.pose !== 'block' && (o.style || 'bust') === 'bust') { rig.animator.setWeapon('unarmed'); rig.animator.armed = 0; }
    if (clip === 'block' || clip === 'taunt') { rig.animator.play(clip); }
    else if (clip) rig.animator.setState(clip);
    for (let i = 0; i < 14; i++) rig.update(1 / 20);
    rig.update(0.02); rig.resetSecondary(); rig.update(0.016);
    scene.background = backdrop(rig.g && globalThis.LM_D ? globalThis.LM_D.STYLES[rig.style].c : null, w, h);
    cam.aspect = w / h; cam.fov = fr.fov; if (w < h) cam.fov = fr.fov * Math.min(1.5, h / w * 0.9);
    cam.position.set(fr.tx, fr.y + 0.06, fr.dist); cam.lookAt(fr.tx, fr.y, 0); cam.updateProjectionMatrix();
    const out = document.createElement('canvas'); out.width = w; out.height = h; const x = out.getContext('2d');
    if (!shared) {
      const r = getOwn(); r.setSize(w, h, false); r.render(scene, cam); x.drawImage(r.domElement, 0, 0, w, h);
    } else {
      if (!rt || rtW !== w || rtH !== h) { if (rt) rt.dispose(); rt = new THREE.WebGLRenderTarget(w, h, { samples: tier === 'low' ? 0 : 4, colorSpace: THREE.SRGBColorSpace }); rtW = w; rtH = h; }
      const R = renderer, prev = { rt: R.getRenderTarget(), ac: R.autoClear, tm: R.toneMapping, xr: R.xr.enabled, sm: R.shadowMap.autoUpdate, calls: R.info.render.calls, tris: R.info.render.triangles };
      const cc = new THREE.Color(); R.getClearColor(cc); const ca = R.getClearAlpha();
      R.xr.enabled = false; R.shadowMap.autoUpdate = false; R.autoClear = true; R.toneMapping = THREE.ACESFilmicToneMapping;
      R.setRenderTarget(rt); R.render(scene, cam);
      const px = new Uint8Array(w * h * 4); R.readRenderTargetPixels(rt, 0, 0, w, h, px);
      R.setRenderTarget(prev.rt); R.autoClear = prev.ac; R.toneMapping = prev.tm; R.xr.enabled = prev.xr; R.shadowMap.autoUpdate = prev.sm; R.setClearColor(cc, ca);
      R.info.render.calls = prev.calls; R.info.render.triangles = prev.tris;
      const img = x.createImageData(w, h), rowB = w * 4;
      for (let yy = 0; yy < h; yy++) img.data.set(px.subarray((h - 1 - yy) * rowB, (h - yy) * rowB), yy * rowB);
      x.putImageData(img, 0, 0);
    }
    scene.remove(rig.root); scene.background.dispose(); scene.background = null; rig.dispose && rig.dispose();
    lastMs = performance.now() - t0; rendered++;
    return out;
  }

  const norm = (o = {}) => {
    let w = Math.max(32, Math.min(caps.w * 2, Math.round(o.w || 128))), h = Math.max(32, Math.min(caps.w * 2, Math.round(o.h || o.w || 128)));
    return { w, h, pose: POSES[o.pose] !== undefined || o.pose === 'idle' ? o.pose : 'idle', style: FRAMES[o.style] ? o.style : 'bust' };
  };
  const copy = (src) => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); return c; };

  function pump() {
    raf = 0; if (disposed) return;
    const job = queue.shift();
    if (job && !ctxLost) {
      let master = null;
      try { master = draw(job.g, job.o); } catch (e) { console.warn('portrait render failed', e && e.message); }
      inflight.delete(job.k);
      if (master) { cache.set(job.k, master); if (cache.size > maxCache) cache.delete(cache.keys().next().value); }
      for (const cb of job.subs) cb(master);
    } else if (job) { queue.push(job); }
    if (queue.length) raf = requestAnimationFrame(pump);
  }
  function enqueue(g, o, k, cb) {
    let job = inflight.get(k);
    if (!job) { job = { g, o, k, subs: [] }; inflight.set(k, job); queue.push(job); }
    job.subs.push(cb);
    if (!raf && !disposed) raf = requestAnimationFrame(pump);
  }

  const api = {
    portrait(g, opts) {
      const o = norm(opts), k = key(g, o), out = document.createElement('canvas'); out.width = o.w; out.height = o.h; out.className = 'lm-portrait-cv';
      const hit = cache.get(k);
      if (hit) { out.getContext('2d').drawImage(hit, 0, 0); out.dataset.ready = '1'; return out; }
      enqueue(g, o, k, (m) => { if (m) { out.getContext('2d').drawImage(m, 0, 0); out.dataset.ready = '1'; out.dispatchEvent(new Event('portrait')); } });
      return out;
    },
    portraitAsync(g, opts) { const o = norm(opts), k = key(g, o); const hit = cache.get(k); if (hit) return Promise.resolve(copy(hit)); return new Promise((res) => enqueue(g, o, k, (m) => res(m ? copy(m) : null))); },
    portraitSync(g, opts) { const hit = cache.get(key(g, norm(opts))); return hit ? copy(hit) : null; },
    dataURL(g, opts) { return api.portraitAsync(g, opts).then((c) => (c ? c.toDataURL('image/png') : null)); },
    flush(n = 99) { while (queue.length && n-- > 0) { const j = queue.shift(); let m = null; try { m = draw(j.g, j.o); } catch (e) { console.warn(e.message); } inflight.delete(j.k); if (m) cache.set(j.k, m); j.subs.forEach((cb) => cb(m)); } },
    get pending() { return queue.length; },
    get stats() { return { rendered, cached: cache.size, queued: queue.length, lastMs: +lastMs.toFixed(1), shared }; },
    clear() { cache.clear(); },
    dispose() { disposed = true; if (raf) cancelAnimationFrame(raf); queue.length = 0; if (rt) rt.dispose(); if (own) { own.dispose(); own.forceContextLoss && own.forceContextLoss(); } cache.clear(); },
  };
  return api;
}

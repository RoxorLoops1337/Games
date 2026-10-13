// Rendered 3D interface style: real three.js PBR renders of buttons, plates, frames, rings and badges, used as 9-slice sprites.
// init() never throws and returns quickly: sprites are rendered one at a time in the background (family by family) and each
// family flips a token on <html data-r3="pill round ..."> when complete, so the CSS fallback look covers the gap or a failed WebGL.
import * as THREE from '../../vendor/three.module.min.js';

const SHEAR = 0.6;                       // oblique projection: how far the extrusion shows below the face (y' = y + SHEAR * z)
const WHITE = new THREE.Color(1, 1, 1), WARM = new THREE.Color('#fff4d8');

// base colours (sRGB, the face mid tone before lighting)
const PAL = {
  green: '#55c735', gold: '#ffbd24', blue: '#3a9fe6', pink: '#f0608f', red: '#ec453d', lilac: '#9577ec', cream: '#fff0cb',
  mint: '#b9f09a', butter: '#ffe27c', sky: '#a9dcf8', rose: '#ffbfd2', grey: '#d8cfba',
  // card plates (pale, slightly tinted)
  cCream: '#fff3d4', cGreen: '#d3f4bd', cGrey: '#ebe3d1', cBlue: '#d2ebfb', cPink: '#ffd9e6', cGold: '#ffe9a0', cLilac: '#e4dbff',
};

// ---------- geometry: a rounded plate (or ring) built as concentric inset contours with a height profile ----------
const M = 10; // segments per rounded corner
function rrContour(s, d) {
  const hx = s.w / 2 - d, hy = Math.max(s.h / 2 - d, 0), rr = Math.max(s.r - d, 0);
  const cx = Math.max(hx - rr, 0), cy = Math.max(hy - rr, 0), pts = [];
  for (let q = 0; q < 4; q++) {
    const ox = q === 0 || q === 3 ? cx : -cx, oy = q < 2 ? cy : -cy;   // q0 top right, q1 top left, q2 bottom left, q3 bottom right (y up)
    for (let i = 0; i <= M; i++) { const a = (q * 90 + (i / M) * 90) * Math.PI / 180; pts.push([ox + rr * Math.cos(a), oy + rr * Math.sin(a)]); }
  }
  return pts;
}
function polyContour(s, d) {
  const pts = [], n = s.n || 120, R = s.R - d;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, k = 1 + (s.sc ? s.sc * Math.cos(a * s.sc_n) : 0);
    pts.push([R * k * Math.cos(a), R * k * Math.sin(a)]);
  }
  return pts;
}
const contour = (s, d) => (s.type === 'poly' ? polyContour(s, d) : rrContour(s, d));

/** levels: array of {d, z, t} from the outside in. Returns geometry with per-vertex meta for colouring. */
function buildBody(shape, levels) {
  const rings = levels.map((l) => contour(shape, l.d)), P = rings[0].length, pos = [], meta = [];
  levels.forEach((l, j) => rings[j].forEach(([x, y]) => { pos.push(x, y, l.z); meta.push(l.d, l.z, y, l.t); }));
  const idx = [], wallIdx = [];
  for (let j = 0; j < levels.length - 1; j++) for (let i = 0; i < P; i++) {
    const a = j * P + i, b = j * P + (i + 1) % P, c = (j + 1) * P + i, e = (j + 1) * P + (i + 1) % P;
    ((levels[j].t === 'w' && levels[j + 1].t === 'w') || (levels[j].t === 'i' && levels[j + 1].t === 'i' && levels[j + 1].z === 0) ? wallIdx : idx).push(a, b, c, b, e, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setIndex([...idx, ...wallIdx]); g.addGroup(0, idx.length, 0); g.addGroup(idx.length, wallIdx.length, 1); g.computeVertexNormals(); g.userData.meta = meta; g.userData.P = P;
  return g;
}
const arc = (n, f) => Array.from({ length: n }, (_, i) => f((i + 1) / n * Math.PI / 2));

/** profile of a solid plate: wall, rounded bevel, then a gently domed face down to the centre */
function solidLevels(o, dmax) {
  const L = [{ d: 0, z: 0, t: 'w' }, { d: 0, z: o.D0, t: 'w' }];
  L.push(...arc(8, (p) => ({ d: o.Rb * (1 - Math.cos(p)), z: o.D0 + o.Rb * Math.sin(p), t: 'b' })));
  const n = 8, d0 = o.Rb, top = o.D0 + o.Rb;
  for (let i = 1; i <= n; i++) { const s = i / n, ss = s * s * (3 - 2 * s); L.push({ d: d0 + (dmax - d0) * s, z: top + o.Hd * ss, t: 'f' }); }
  return L;
}
/** profile of a frame ring (outer wall, rounded top, inner bevel, inner wall) */
function ringLevels(o) {
  const L = [{ d: 0, z: 0, t: 'w' }, { d: 0, z: o.D0, t: 'w' }];
  L.push(...arc(8, (p) => ({ d: o.Rb * (1 - Math.cos(p)), z: o.D0 + o.Rb * Math.sin(p), t: 'b' })));
  const top = o.D0 + o.Rb, a = o.W - o.Rb2;
  L.push({ d: (o.Rb + a) / 2, z: top + o.Hd, t: 'f' });
  L.push(...arc(8, (p) => ({ d: a + o.Rb2 * Math.sin(p), z: o.D0 + o.Rb2 * Math.cos(p) + (top - o.D0 - o.Rb2) * 0, t: 'i' })));
  L.push({ d: o.W, z: o.D0, t: 'i' }, { d: o.W, z: 0, t: 'i' });
  return L;
}

// ---------- colouring ----------
const _h = {};
function tones(hex, pressed) {
  const c = new THREE.Color(hex); c.getHSL(_h, THREE.SRGBColorSpace);
  const h = _h.h, s = _h.s, l = _h.l, k = pressed ? 0.9 : 1, lt = Math.max(0, l - 0.72) / 0.28;   // light colours get a softer, less orange wall
  const mk = (ds, dl) => new THREE.Color().setHSL(h, Math.min(1, Math.max(0, s + ds)), Math.min(1, Math.max(0, (l + dl) * k)), THREE.SRGBColorSpace);
  return {
    top: mk(-0.04, 0.10).lerp(WARM, 0.18), mid: mk(0, 0), low: mk(0.12, -0.10), rim: mk(0.15, -0.30), wall: mk(0.16 - lt * 0.3, -0.24 - lt * 0.12), wallLow: mk(0.16 - lt * 0.3, -0.33 - lt * 0.12), glow: mk(-0.1, 0.16),
  };
}
const _c = new THREE.Color();
function colorize(geo, hex, pressed, o) {
  const t = tones(hex, pressed), m = geo.userData.meta, col = geo.attributes.color, hh = o.faceH;
  for (let v = 0; v < col.count; v++) {
    const d = m[v * 4], z = m[v * 4 + 1], y = m[v * 4 + 2], kind = m[v * 4 + 3];
    if (kind === 'w') { _c.copy(t.wallLow).lerp(t.wall, Math.min(1, z / Math.max(o.D0, 1))); if (o.shade) _c.multiplyScalar(0.92); }
    else if (kind === 'i') _c.copy(t.wall).lerp(t.mid, 0.4);
    else {
      const u = Math.min(1, Math.max(0, (hh / 2 - y) / hh));            // 0 top .. 1 bottom
      const sm = u * u * (3 - 2 * u);
      if (u < 0.5) _c.copy(t.top).lerp(t.mid, sm * 2); else _c.copy(t.mid).lerp(t.low, (sm - 0.5) * 2);
      // saturated darker rim line right at the outer edge, inner glow a little deeper in
      const re = o.rimW; if (d < re) _c.lerp(t.rim, 0.9 * (1 - d / re));
      const gw = o.glowW; if (gw && d > re && d < re + gw) _c.lerp(t.glow, 0.28 * Math.sin(((d - re) / gw) * Math.PI));
      if (kind === 'b' && u > 0.55) _c.lerp(t.glow, 0.18 * u);              // bounce light on the lower lip
    }
    col.setXYZ(v, _c.r, _c.g, _c.b);
  }
  col.needsUpdate = true;
}

// ---------- the studio ----------
let R = null;
function setup() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true }) ||
    canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error('no webgl');
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true });
  renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0); renderer.autoClear = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
  // environment: soft boxes for the clearcoat to reflect (top and left white, right cool, bottom warm bounce)
  const env = new THREE.Scene(); env.background = new THREE.Color(0x9aa4b8);
  const panel = (w, h, pos, color, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
  };
  panel(14, 6, [0, 9, 3], '#ffffff', 4.2); panel(6, 14, [-9, 2, 3], '#fff6e6', 3.0); panel(6, 12, [9, 0, 3], '#bcd8ff', 1.4);
  panel(14, 5, [0, -9, 3], '#ffcf9a', 0.9); panel(10, 10, [0, 0, 10], '#ffffff', 1.1);
  const pm = new THREE.PMREMGenerator(renderer), envTex = pm.fromScene(env, 0.035).texture; pm.dispose();
  env.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.07, envMap: envTex, envMapIntensity: 0.5 });
  const wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, envMap: envTex, envMapIntensity: 0.12 });
  const body = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(-0.55, 0.85, 1); body.add(key);
  const fill = new THREE.DirectionalLight(0xcfe3ff, 0.85); fill.position.set(1, -0.1, 0.6); body.add(fill);
  const rim = new THREE.DirectionalLight(0xffd9b0, 0.7); rim.position.set(0.1, -1, 0.35); body.add(rim);
  body.add(new THREE.HemisphereLight(0xffffff, 0xffe9cf, 1.15));
  return { canvas, renderer, envTex, mat, wallMat, body, key, fill, rim };
}

function decalScene(tex, W, H) {
  const sc = new THREE.Scene();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  m.position.set(W / 2, H / 2, 0); sc.add(m); return { sc, m };
}

const rr2 = (c, x, y, w, h, r) => { r = Math.max(0, Math.min(r, w / 2, h / 2)); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };

// shadow canvas: soft contact shadow of the footprint, drawn under the body (y down, sprite pixels)
function shadowTex(spec, S, W, H, fx, fy, fw, fh, fr, pressed, hole) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const off = pressed ? 1.2 : spec.shOff, blur = pressed ? 3 : spec.shBlur, al = pressed ? 0.3 : spec.shA;
  const draw = (ox, oy, bl, a) => { g.save(); g.shadowColor = `rgba(40,25,10,${a})`; g.shadowBlur = bl * S; g.shadowOffsetX = 10000; g.shadowOffsetY = oy * S; rr2(g, fx - 10000, fy, fw, fh, fr); g.fillStyle = '#000'; g.fill(); g.restore(); };
  if (spec.shA) { draw(0, off, blur, al); draw(0, Math.max(0.8, off * 0.3), Math.max(1.2, blur * 0.25), al * 1.1); }
  if (hole) { g.globalCompositeOperation = 'destination-out'; rr2(g, hole.x, hole.y, hole.w, hole.h, hole.r); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// decal canvas: gloss band, bounce glow and glints on top of the body (these keep a 9-slice stretch safe: all horizontal)
function decalTex(spec, S, W, H, fx, fy, fw, fh, pressed, hex) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const gl = spec.gloss; if (!gl) return null;
  const a = pressed ? 0.55 : 1;
  if (gl.round) {                                   // dome highlight for round plates
    const cx = fx + fw / 2, cy = fy + fh * gl.cy, rx = fw * gl.rx, ry = fh * gl.ry;
    g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.clip();
    const lg = g.createLinearGradient(0, cy - ry, 0, cy + ry); lg.addColorStop(0, `rgba(255,255,255,${0.88 * a})`); lg.addColorStop(1, 'rgba(255,255,255,0.02)');
    g.fillStyle = lg; g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2); g.restore();
  } else {
    const gx = fx + gl.inset * S, gw = fw - gl.inset * 2 * S, gy = fy + gl.top * S, gh = gl.h * S;
    const lg = g.createLinearGradient(0, gy, 0, gy + gh); lg.addColorStop(0, `rgba(255,255,255,${0.92 * a})`); lg.addColorStop(0.55, `rgba(255,255,255,${0.42 * a})`); lg.addColorStop(1, 'rgba(255,255,255,0.03)');
    rr2(g, gx, gy, gw, gh, gh * 0.5); g.fillStyle = lg; g.fill();
  }
  if (gl.bounce) {                                  // soft light from the table bouncing up into the lower lip (fades out toward both ends)
    const t = document.createElement('canvas'); t.width = W; t.height = H; const tg = t.getContext('2d');
    const by = fy + fh - gl.bounce * S, lg = tg.createLinearGradient(0, by, 0, fy + fh - 1.2 * S); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, `rgba(255,255,255,${0.34 * a})`);
    tg.fillStyle = lg; tg.fillRect(fx, by, fw, fh);
    tg.globalCompositeOperation = 'destination-in';
    const ramp = Math.min(fw / 2, gl.binset * 2.2 * S), hg = tg.createLinearGradient(fx, 0, fx + fw, 0), q = ramp / fw;
    hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(q, 'rgba(0,0,0,1)'); hg.addColorStop(1 - q, 'rgba(0,0,0,1)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
    tg.fillStyle = hg; tg.fillRect(0, 0, W, H);
    // keep it inside the rounded face
    tg.globalCompositeOperation = 'destination-in'; rr2(tg, fx + 2 * S, fy + 2 * S, fw - 4 * S, fh - 3.5 * S, spec.r * S - 2 * S); tg.fill();
    g.drawImage(t, 0, 0);
  }
  if (gl.glint && !pressed) {                       // sharp specular glint near the top-left corner
    const [gxx, gyy, gr] = gl.glint; g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(fx + gxx * S, fy + gyy * S, gr * S * 1.25, gr * S * 0.85, -0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(fx + (gxx + gr * 2.3) * S, fy + (gyy + gr * 1.6) * S, gr * 0.42 * S, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const toBlob = (canvas) => new Promise((res) => {
  try { canvas.toBlob((b) => res(b ? URL.createObjectURL(b) : canvas.toDataURL('image/png')), 'image/png'); } catch { try { res(canvas.toDataURL('image/png')); } catch { res(null); } }
});
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---------- sprite specs (css px; everything is multiplied by S when rendered) ----------
const SPEC = {
  pill: { kind: 'solid', fw: 52, fh: 50, r: 22, mt: 3, ml: 4, mr: 4, mb: 12, D0: 8, DP: 3, Rb: 6.5, Hd: 4.5, rimW: 1.1, glowW: 2.6, shOff: 3.2, shBlur: 5, shA: 0.34,
    gloss: { inset: 11, top: 3, h: 17, bounce: 10, binset: 12, glint: [14.5, 8.2, 2.1] } },
  round: { kind: 'solid', fw: 48, fh: 48, r: 24, mt: 3, ml: 4, mr: 4, mb: 12, D0: 8, DP: 3, Rb: 6.5, Hd: 5, rimW: 1.1, glowW: 2.6, shOff: 3.2, shBlur: 5, shA: 0.34,
    gloss: { round: true, cy: 0.27, rx: 0.34, ry: 0.19, bounce: 9, binset: 9, glint: [13, 11, 1.9] } },
  roundL: { kind: 'solid', fw: 66, fh: 66, r: 33, mt: 3, ml: 4, mr: 4, mb: 13, D0: 9, DP: 3.4, Rb: 8, Hd: 6.5, rimW: 1.2, glowW: 3, shOff: 3.6, shBlur: 6, shA: 0.34,
    gloss: { round: true, cy: 0.26, rx: 0.34, ry: 0.19, bounce: 11, binset: 12, glint: [17.5, 14, 2.4] } },
  card: { kind: 'solid', fw: 50, fh: 50, r: 20, mt: 2, ml: 3, mr: 3, mb: 9, D0: 5.5, DP: 2.2, Rb: 4.5, Hd: 2.6, rimW: 1, glowW: 2.2, shOff: 2.5, shBlur: 4.5, shA: 0.26,
    gloss: { inset: 10, top: 2.4, h: 11, bounce: 7, binset: 10, glint: [12, 6, 1.6] } },
  dot: { kind: 'solid', fw: 38, fh: 38, r: 19, mt: 1, ml: 3, mr: 3, mb: 5, D0: 4.5, DP: 2, Rb: 4.2, Hd: 3, rimW: 1.2, glowW: 1.6, shOff: 1.4, shBlur: 2.2, shA: 0.35,
    gloss: { round: true, cy: 0.27, rx: 0.33, ry: 0.17, glint: [11, 9, 1.5] } },
  bar: { kind: 'solid', fw: 16, fh: 12, r: 5, mt: 0, ml: 0, mr: 0, mb: 0, D0: 0.5, DP: 0.5, Rb: 3.6, Hd: 1.4, rimW: 0.8, glowW: 0, shOff: 0, shBlur: 0, shA: 0, shade: true,
    gloss: { inset: 3.4, top: 1.2, h: 3.4 } },
  frame: { kind: 'ring', fw: 78, fh: 78, r: 34, mt: 2, ml: 3, mr: 3, mb: 7, D0: 3.5, Rb: 3.4, Rb2: 2.6, W: 10, Hd: 0.8, rimW: 1.1, glowW: 2.2, shOff: 0, shBlur: 0, shA: 0 },
  ring: { kind: 'ring', fw: 90, fh: 90, r: 45, mt: 0, ml: 0, mr: 0, mb: 0, D0: 1.4, Rb: 3.4, Rb2: 3, W: 9.5, Hd: 0.5, rimW: 1, glowW: 1.8, shOff: 0, shBlur: 0, shA: 0 },
  seal: { kind: 'seal', fw: 100, fh: 100, r: 50, mt: 0, ml: 0, mr: 0, mb: 0, D0: 3, DP: 2, Rb: 7, Hd: 5, rimW: 1.4, glowW: 3, shOff: 0, shBlur: 0, shA: 0,
    gloss: { round: true, cy: 0.27, rx: 0.34, ry: 0.17, glint: [26, 20, 3] } },
};

async function renderSprite(env, name, spec, hex, pressed, S, geoCache) {
  const sc = S, Wc = spec.ml + spec.fw + spec.mr, Hc = spec.mt + spec.fh + spec.mb, W = Math.round(Wc * sc), H = Math.round(Hc * sc);
  const { renderer, canvas, mat, body } = env;
  renderer.setSize(W, H, false);
  const D0 = (pressed && spec.DP != null ? spec.DP : spec.D0) * sc;
  const key = name + (pressed ? ':d' : ':u');
  let geo = geoCache.get(key);
  const faceH = spec.fh * sc;
  if (!geo) {
    const shape = spec.kind === 'seal' ? { type: 'poly', R: spec.fw * sc / 2, sc: 0.045, sc_n: 12, n: 144 } : { type: 'rr', w: spec.fw * sc, h: spec.fh * sc, r: spec.r * sc };
    const dmax = (spec.kind === 'seal' ? spec.fw * sc / 2 : Math.min(spec.fw, spec.fh) * sc / 2) - 0.01;
    const o = { D0, Rb: spec.Rb * sc, Hd: (spec.Hd || 0) * sc, W: (spec.W || 0) * sc, Rb2: (spec.Rb2 || 0) * sc };
    geo = buildBody(shape, spec.kind === 'ring' ? ringLevels(o) : solidLevels(o, dmax)); geoCache.set(key, geo);
  }
  const co = { D0, faceH, rimW: spec.rimW * sc, glowW: spec.glowW * sc, shade: spec.shade };
  colorize(geo, hex, pressed, co);
  const mesh = new THREE.Mesh(geo, [mat, env.wallMat]); mesh.frustumCulled = false;
  // footprint is shifted so that the silhouette (wall top, z = D0) lands exactly on the face rect inside the margins
  const kD = SHEAR * D0, fx = spec.ml * sc, fy = spec.mt * sc;           // face rect, y down
  mesh.position.set(W / 2, H - (fy + faceH / 2) - kD, 0);                 // y up: face centre minus the extrusion shift
  body.add(mesh);
  const cam = new THREE.OrthographicCamera(0, W, H, 0, -2000, 2000); cam.updateProjectionMatrix();
  const plain = cam.clone(); plain.updateProjectionMatrix();
  cam.projectionMatrix.multiply(new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, SHEAR, 0, 0, 0, 1, 0, 0, 0, 0, 1));
  const hole = spec.kind === 'ring' ? { x: fx + spec.W * sc, y: fy + spec.W * sc + kD, w: spec.fw * sc - 2 * spec.W * sc, h: faceH - 2 * spec.W * sc, r: Math.max(spec.r - spec.W, 1) * sc } : null;
  const st = shadowTex(spec, sc, W, H, fx, fy + kD, spec.fw * sc, faceH, spec.r * sc, pressed, hole);
  const dt = decalTex(spec, sc, W, H, fx, fy, spec.fw * sc, faceH, pressed, hex);
  const s1 = decalScene(st, W, H), s3 = dt ? decalScene(dt, W, H) : null;
  renderer.clear();
  renderer.render(s1.sc, plain); renderer.clearDepth();
  renderer.render(body, cam);
  if (s3) renderer.render(s3.sc, plain);
  const urlP = toBlob(canvas);   // the bitmap snapshot is taken synchronously, encoding runs off the main thread while we render the next sprite
  body.remove(mesh); st.dispose(); s1.m.geometry.dispose(); s1.m.material.dispose();
  if (dt) { dt.dispose(); s3.m.geometry.dispose(); s3.m.material.dispose(); }
  return { urlP, W, H };
}

// slice string (unitless sprite px: top right bottom left), css width string and outset for each 9-slice family
function sliceInfo(spec, S, mode) {
  const R = spec.r - (spec.fw === spec.fh && spec.r * 2 === spec.fw && mode === 'round' ? 4 : 0), f = (v) => Math.round(v * S);
  const t = spec.mt + R, r = spec.mr + R, b = spec.mb + R, l = spec.ml + R;
  if (mode === 'bar') { const e = spec.r; return { slice: `${f(e)} ${f(e)} ${f(e)} ${f(e)}`, width: `${e}px`, outset: '0' }; }
  return { slice: `${f(t)} ${f(r)} ${f(b)} ${f(l)}`, width: `${t}px ${r}px ${b}px ${l}px`, outset: `${spec.mt}px ${spec.mr}px ${spec.mb}px ${spec.ml}px` };
}

const PILL_C = ['green', 'gold', 'blue', 'pink', 'red', 'lilac', 'cream'];
const ROUND_C = ['green', 'gold', 'blue', 'pink', 'red', 'lilac', 'cream', 'mint', 'butter', 'sky', 'rose'];
const CARD_C = ['cCream', 'cGreen', 'cGrey', 'cBlue', 'cPink', 'cGold', 'cLilac'];
const DOT_C = ['red', 'green', 'gold', 'blue', 'pink', 'lilac', 'cream'];
const BAR_C = ['gold', 'green', 'blue', 'pink', 'lilac', 'red'];
const BAR_HEX = { gold: '#ffc22e', green: '#5cc23f', blue: '#4aaee6', pink: '#f0719b', lilac: '#9c84e6', red: '#ea4f46' };

const FAMILIES = [
  { id: 'round', spec: 'round', colors: ROUND_C, poses: 2, pre: 'round' },
  { id: 'roundL', spec: 'roundL', colors: ['gold', 'red'], poses: 2, pre: 'roundL' },
  { id: 'pill', spec: 'pill', colors: PILL_C, poses: 2, pre: 'pill' },
  { id: 'card', spec: 'card', colors: CARD_C, poses: 1, pre: 'card', dn: ['cCream', 'cGreen'] },
  { id: 'bar', spec: 'bar', colors: BAR_C, poses: 1, pre: 'bar', hex: BAR_HEX },
  { id: 'dot', spec: 'dot', colors: DOT_C, poses: 1, pre: 'dot' },
  { id: 'frame', spec: 'frame', colors: ['cream'], poses: 1, pre: 'frame', hex: { cream: '#fff4d6' } },
  { id: 'ring', spec: 'ring', colors: ['gold', 'cream'], poses: 1, pre: 'ring', hex: { gold: '#ffc83a', cream: '#fff6e0' } },
  { id: 'seal', spec: 'seal', colors: ['green', 'gold'], poses: 1, pre: 'seal' },
];

/** Renders every sprite. onSprite(varName, cssValue) is called per image, onFamily(id) after each family. Exposed for the lab sheet. */
export async function renderAll({ onSprite, onFamily, isDead = () => false, only } = {}) {
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, S = Math.min(3, Math.max(2, Math.round(dpr)));
  const env = setup(), cache = new Map(), urls = [], jobs = [];
  try {
    onSprite && onSprite('--r3-s', String(S));
    for (const fam of FAMILIES) {
      if (only && !only.includes(fam.id)) continue;
      const spec = SPEC[fam.spec];
      const info = fam.id === 'bar' ? sliceInfo(spec, S, 'bar') : sliceInfo(spec, S, fam.id.startsWith('round') ? 'round' : '');
      onSprite && onSprite(`--r3-${fam.id}-slice`, info.slice); onSprite && onSprite(`--r3-${fam.id}-width`, info.width); onSprite && onSprite(`--r3-${fam.id}-outset`, info.outset);
      for (const c of fam.colors) {
        for (const pressed of fam.poses === 2 ? [false, true] : (fam.dn && fam.dn.includes(c) ? [false, true] : [false])) {
          if (isDead()) return urls;
          const hex = (fam.hex && fam.hex[c]) || PAL[c];
          const r = await renderSprite(env, fam.spec, spec, hex, pressed, S, cache);
          const vn = `--r3-${fam.pre}-${c}${fam.poses === 2 || fam.dn ? (pressed ? '-dn' : '-up') : ''}`;
          jobs.push(r.urlP.then((url) => { if (url) { urls.push(url); onSprite && onSprite(vn, `url("${url}")`, r); } }));
          await tick();
        }
      }
      await Promise.all(jobs); jobs.length = 0;
      onFamily && onFamily(fam.id);
    }
  } finally {
    cache.forEach((g) => g.dispose()); env.mat.dispose(); env.wallMat.dispose(); env.envTex.dispose();
    try { env.renderer.dispose(); env.renderer.forceContextLoss(); } catch { /* ignore */ }
  }
  return urls;
}

// ---------- the style: init / dispose ----------
export default function init({ root }) {
  let dead = false, urls = [];
  const vars = new Set(), done = new Set();
  const set = (k, v) => { try { root.style.setProperty(k, v); vars.add(k); } catch { /* ignore */ } };
  // press feedback: the pressed button tilts toward the finger (CSS reads --r3-rx / --r3-ry in :active)
  const tilt = new WeakMap();
  const down = (e) => {
    const b = e.target && e.target.closest && e.target.closest('.b,.rb,.card,.pill,.gp,#card,.mini-b'); if (!b) return;
    const r = b.getBoundingClientRect(); if (!r.width) return;
    const nx = ((e.clientX - r.left) / r.width - 0.5) * 2, ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
    const k = Math.min(1, 80 / Math.max(r.width, r.height) + 0.25);
    b.style.setProperty('--r3-rx', (-ny * 7 * k).toFixed(1) + 'deg'); b.style.setProperty('--r3-ry', (nx * 7 * k).toFixed(1) + 'deg'); tilt.set(b, 1);
  };
  const up = (e) => {
    const b = e.target && e.target.closest && e.target.closest('.b,.rb,.card,.pill,.gp,#card,.mini-b'); if (!b || !tilt.has(b)) return;
    setTimeout(() => { b.style.removeProperty('--r3-rx'); b.style.removeProperty('--r3-ry'); tilt.delete(b); }, 60);
  };
  document.addEventListener('pointerdown', down, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
  const pending = [];
  (async () => {
    try {
      await tick();
      const t0 = performance.now();
      urls = await renderAll({
        isDead: () => dead,
        onSprite: (k, v) => { if (!dead) set(k, v); },
        onFamily: (id) => { if (dead) return; done.add(id); root.setAttribute('data-r3', [...done].join(' ')); set('--r3-ms', String(Math.round(performance.now() - t0))); },
      });
    } catch (e) { try { console.warn('[render3d] WebGL render failed, using the CSS fallback look', e); } catch { /* ignore */ } }
    if (dead) cleanup();
  })();
  function cleanup() { urls.forEach((u) => { try { if (u.startsWith('blob:')) URL.revokeObjectURL(u); } catch { /* ignore */ } }); urls = []; }
  return function dispose() {
    dead = true;
    document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', up, true);
    root.removeAttribute('data-r3'); vars.forEach((k) => root.style.removeProperty(k)); vars.clear(); pending.length = 0;
    cleanup();
  };
}

// SPOTS module (Gameplay Engineer). Activity spots in the park with glowing world markers, floating icons, proximity prompts. CONTRACT:
//   buildSpots(ctx, terrain) -> { group, spots:[{id,label,icon,x,z,radius,release,color,cine}], update(dt,t,playerPos), nearest(playerPos)->spot|null, activate(id) }
//   Flat (interior) scene: terrain.spotDefs [{id,anchor,label,color,color2,cine,icon}] replaces the park list, ring radius 1.1, icons hover lower. Park ids: busk (crate stage: play a set), bench (rest + talk to BeeAmGee + lesson), run (jog loop start), flyers (gate corner: odd job), gate (leave to the street)
//   activate(id) emits ctx.events 'spot' with {id, scene}. The game bridge (main.js) maps these onto the real game actions; controls.js listens to the same event for the
//   short cinematic (lock input, ease camera, face the spot, play a clip) and unlocks on ctx.events 'spotDone'.
// Look: a pooled glow ring on the ground (additive, pulsing), a slowly rotating dashed outer ring, tiny rising sparkles, and a bobbing billboard icon + label.
// Cost: 2 canvas textures in total (fx atlas, icon atlas), 3 draw calls per spot plus 1 shared sparkle Points draw.
import { THREE } from './kit.js';

// positions come from terrain.anchors, re-read lazily (terrain may still be changing). cine = what controls.js does when the spot is activated.
const DEFS = [
  { id: 'busk', anchor: 'buskSpot', label: 'BUSK', color: '#ff3ea5', color2: '#ffe14d', cine: { snap: true, face: 'rot', clip: 'beatbox', zoom: 0.22 } },
  { id: 'bench', anchor: 'bench', label: 'TALK', color: '#a86bff', color2: '#2ee6ff', cine: { snap: true, exact: true, face: 'rot', clip: 'sit', zoom: 0.2 } },
  { id: 'run', anchor: 'runStart', label: 'RUN', color: '#2ee6ff', color2: '#ffe14d', cine: { snap: true, face: 'rot', clip: 'cheer', zoom: 0.16 } },
  { id: 'flyers', anchor: 'flyers', label: 'FLYERS', color: '#ffe14d', color2: '#ff3ea5', cine: { snap: false, face: 'toward', clip: 'wave', zoom: 0.18 } },
  { id: 'gate', anchor: 'gate', label: 'LEAVE', color: '#9dff4a', color2: '#2ee6ff', cine: { snap: false, face: 'toward', clip: 'wave', zoom: 0.14 } },
];
const ENTER_R = 1.6, RELEASE_R = 2.25, RING_R = 1.55;

// ---------- canvas glyphs (shared with ui3d.js for the prompt button) ----------
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function glyph(g, id, S) {
  g.save(); g.scale(S / 192, S / 192); g.lineJoin = 'round'; g.lineCap = 'round';
  const INK = '#17102b';
  if (id === 'busk') { // microphone, pink grille ball on a yellow handle
    g.rotate(-0.55);
    g.fillStyle = '#ffe14d'; rr(g, -11, 4, 22, 54, 9); g.fill(); g.strokeStyle = INK; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#c9b6e8'; g.fillRect(-14, 0, 28, 8); g.strokeRect(-14, 0, 28, 8);
    g.beginPath(); g.arc(0, -22, 27, 0, 7); g.fillStyle = '#ff3ea5'; g.fill(); g.lineWidth = 6; g.stroke();
    g.save(); g.clip(); g.strokeStyle = 'rgba(23,16,43,.55)'; g.lineWidth = 3; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(-30 + i * 9, -50); g.lineTo(-30 + i * 9 + 22, 6); g.stroke(); g.beginPath(); g.moveTo(30 + i * 9, -50); g.lineTo(30 + i * 9 - 22, 6); g.stroke(); } g.restore();
    g.beginPath(); g.arc(-9, -31, 7, 0, 7); g.fillStyle = 'rgba(255,255,255,.75)'; g.fill();
  } else if (id === 'bench') { // park bench
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#6a4230'; g.fillRect(-42, 2, 10, 46); g.strokeRect(-42, 2, 10, 46); g.fillRect(32, 2, 10, 46); g.strokeRect(32, 2, 10, 46);
    const slat = (y, c) => { g.fillStyle = c; rr(g, -52, y, 104, 14, 4); g.fill(); g.stroke(); };
    slat(-40, '#c07f48'); slat(-22, '#a8693b'); slat(8, '#c07f48');
    g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(30, -52, 7, 0, 7); g.fill(); g.stroke();
  } else if (id === 'run') { // sneaker
    g.lineWidth = 5; g.strokeStyle = INK;
    g.beginPath(); g.moveTo(-50, 8); g.lineTo(-50, -34); g.quadraticCurveTo(-48, -42, -36, -40); g.lineTo(-14, -34); g.quadraticCurveTo(-4, -12, 14, -10); g.lineTo(40, -6); g.quadraticCurveTo(58, -2, 56, 14); g.lineTo(-50, 14); g.closePath(); g.fillStyle = '#2ee6ff'; g.fill(); g.stroke();
    g.fillStyle = '#fff6e8'; rr(g, -54, 14, 114, 16, 7); g.fill(); g.stroke();
    g.strokeStyle = '#ffe14d'; g.lineWidth = 5; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-26 + i * 14, -28 + i * 6); g.lineTo(-14 + i * 14, -20 + i * 6); g.stroke(); }
    g.strokeStyle = '#ff3ea5'; g.lineWidth = 6; g.beginPath(); g.moveTo(-34, 2); g.quadraticCurveTo(0, -14, 34, 4); g.stroke();
    g.strokeStyle = '#fff6e8'; g.lineWidth = 4; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-84, -14 + i * 12); g.lineTo(-62 - i * 6, -14 + i * 12); g.stroke(); }
  } else if (id === 'flyers') { // flyer sheets
    g.lineWidth = 5; g.strokeStyle = INK;
    g.save(); g.rotate(0.22); g.fillStyle = '#fff6e8'; rr(g, -36, -50, 72, 96, 6); g.fill(); g.stroke(); g.restore();
    g.save(); g.rotate(-0.16); g.fillStyle = '#ffe14d'; rr(g, -40, -54, 72, 96, 6); g.fill(); g.stroke();
    g.fillStyle = '#ff3ea5'; g.fillRect(-30, -42, 52, 16); g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(-30, -42, 52, 16);
    g.fillStyle = INK; for (let i = 0; i < 3; i++) g.fillRect(-30, -16 + i * 14, 52 - i * 10, 6);
    g.restore();
  } else if (id === 'gate') { // door with an arrow pointing out
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#6a4230'; rr(g, -50, -54, 56, 108, 5); g.fill(); g.stroke();
    g.fillStyle = '#a8693b'; g.fillRect(-42, -46, 40, 92);
    g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(-12, 4, 5, 0, 7); g.fill();
    g.beginPath(); g.moveTo(8, -12); g.lineTo(34, -12); g.lineTo(34, -30); g.lineTo(64, 0); g.lineTo(34, 30); g.lineTo(34, 12); g.lineTo(8, 12); g.closePath(); g.fillStyle = '#9dff4a'; g.fill(); g.stroke();

  } else if (id === 'booth') { // padded vocal booth with a mic inside and a glowing sign
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#3a2760'; rr(g, -50, -56, 100, 112, 10); g.fill(); g.stroke();
    g.fillStyle = '#ff3ea5'; for (let i = 0; i < 3; i++) { rr(g, -42 + i * 30, -46, 24, 30, 4); g.fill(); g.lineWidth = 3; g.stroke(); }
    g.fillStyle = '#ffe14d'; g.fillRect(-42, -8, 84, 6);
    g.lineWidth = 5; g.fillStyle = '#c9b6e8'; g.beginPath(); g.moveTo(0, -4); g.lineTo(0, 26); g.stroke();
    g.beginPath(); g.arc(0, 14, 15, 0, 7); g.fillStyle = '#2ee6ff'; g.fill(); g.stroke();
    g.fillStyle = '#17102b'; g.beginPath(); g.arc(-4, 12, 2.5, 0, 7); g.arc(5, 12, 2.5, 0, 7); g.arc(0, 19, 2.5, 0, 7); g.fill();
    g.fillStyle = '#ff3a3a'; rr(g, -22, 36, 44, 14, 5); g.fill(); g.lineWidth = 3; g.stroke();
  } else if (id === 'couch') { // couch with a cassette on the cushion
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#7b4fe0'; rr(g, -50, -34, 100, 46, 14); g.fill(); g.stroke();
    g.fillStyle = '#a86bff'; rr(g, -62, -6, 28, 52, 10); g.fill(); g.stroke(); rr(g, 34, -6, 28, 52, 10); g.fill(); g.stroke();
    g.fillStyle = '#8f63ee'; rr(g, -36, 0, 72, 32, 8); g.fill(); g.stroke();
    g.fillStyle = '#17102b'; g.fillRect(-48, 46, 8, 10); g.fillRect(40, 46, 8, 10);
    g.save(); g.rotate(-0.12); g.fillStyle = '#fff6e8'; rr(g, -26, -22, 52, 34, 5); g.fill(); g.stroke(); g.fillStyle = '#ff3ea5'; g.fillRect(-20, -17, 40, 8);
    g.fillStyle = '#17102b'; g.beginPath(); g.arc(-11, 0, 6, 0, 7); g.arc(11, 0, 6, 0, 7); g.fill(); g.restore();
  } else if (id === 'bed') { // bed with a crescent moon
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#6a4230'; rr(g, -56, 0, 112, 52, 6); g.fill(); g.stroke(); g.fillRect(-56, -20, 12, 76); g.strokeRect(-56, -20, 12, 76);
    g.fillStyle = '#2ee6ff'; rr(g, -40, 6, 92, 34, 8); g.fill(); g.stroke();
    g.fillStyle = '#fff6e8'; rr(g, -38, -6, 36, 18, 8); g.fill(); g.stroke();
    g.beginPath(); g.arc(30, -38, 18, 0.5, 5.8); g.arc(38, -42, 14, 5.2, 1.0, true); g.closePath(); g.fillStyle = '#ffe14d'; g.fill(); g.lineWidth = 4; g.stroke();
  } else if (id === 'desk') { // desk with a laptop and a live dot
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#6a4230'; rr(g, -58, 22, 116, 14, 4); g.fill(); g.stroke(); g.fillRect(-50, 36, 10, 22); g.strokeRect(-50, 36, 10, 22); g.fillRect(40, 36, 10, 22); g.strokeRect(40, 36, 10, 22);
    g.fillStyle = '#3a2760'; rr(g, -34, -42, 68, 46, 6); g.fill(); g.stroke(); g.fillStyle = '#2ee6ff'; rr(g, -27, -35, 54, 32, 3); g.fill();
    g.fillStyle = '#c9b6e8'; rr(g, -46, 4, 92, 16, 5); g.fill(); g.stroke();
    g.fillStyle = '#17102b'; g.fillRect(-14, -20, 28, 5); g.fillRect(-14, -10, 18, 5);
    g.beginPath(); g.arc(34, -48, 13, 0, 7); g.fillStyle = '#ff3a3a'; g.fill(); g.lineWidth = 4; g.stroke(); g.beginPath(); g.arc(30, -52, 4, 0, 7); g.fillStyle = 'rgba(255,255,255,.8)'; g.fill();
  } else if (id === 'kitchen') { // plant-based: carrot and a bowl
    g.lineWidth = 5; g.strokeStyle = INK;
    g.save(); g.rotate(0.6); g.fillStyle = '#9dff4a'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.ellipse(i * 11, -52, 7, 16, i * 0.3, 0, 7); g.fill(); g.stroke(); }
    g.fillStyle = '#ff8a2a'; g.beginPath(); g.moveTo(-18, -40); g.lineTo(18, -40); g.lineTo(0, 30); g.closePath(); g.fill(); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(-9, -26); g.lineTo(-2, -26); g.moveTo(3, -12); g.lineTo(10, -12); g.moveTo(-5, 2); g.lineTo(0, 2); g.stroke(); g.restore();
    g.lineWidth = 5; g.fillStyle = '#fff6e8'; g.beginPath(); g.moveTo(-54, 6); g.lineTo(54, 6); g.quadraticCurveTo(50, 54, 0, 54); g.quadraticCurveTo(-50, 54, -54, 6); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#9dff4a'; g.beginPath(); g.ellipse(0, 6, 54, 9, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(-22, 4, 6, 0, 7); g.fill(); g.fillStyle = '#ff3ea5'; g.beginPath(); g.arc(24, 5, 6, 0, 7); g.fill();
  } else if (id === 'wardrobe') { // hoodie on a hanger
    g.lineWidth = 5; g.strokeStyle = INK;
    g.beginPath(); g.moveTo(0, -30); g.lineTo(0, -40); g.arc(0, -50, 10, Math.PI / 2, Math.PI * 2.1); g.stroke();
    g.fillStyle = '#ffe14d'; g.beginPath(); g.moveTo(-14, -30); g.lineTo(-52, -6); g.lineTo(-62, 28); g.lineTo(-44, 32); g.lineTo(-36, 6); g.lineTo(-36, 54); g.lineTo(36, 54); g.lineTo(36, 6); g.lineTo(44, 32); g.lineTo(62, 28); g.lineTo(52, -6); g.lineTo(14, -30); g.quadraticCurveTo(0, -12, -14, -30); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#e63946'; g.beginPath(); g.moveTo(-14, -30); g.quadraticCurveTo(0, -12, 14, -30); g.lineTo(18, -18); g.quadraticCurveTo(0, 0, -18, -18); g.closePath(); g.fill(); g.lineWidth = 4; g.stroke();
    g.fillStyle = '#fff6e8'; rr(g, -18, 22, 36, 18, 6); g.fill(); g.stroke();
  } else if (id === 'door') { // flat door with an arrow leading out
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#3a2760'; rr(g, -52, -56, 58, 112, 5); g.fill(); g.stroke();
    g.fillStyle = '#ff3ea5'; g.fillRect(-44, -48, 42, 96); g.strokeRect(-44, -48, 42, 96);
    g.beginPath(); g.arc(-12, 4, 5, 0, 7); g.fillStyle = '#ffe14d'; g.fill(); g.stroke();
    g.fillStyle = '#17102b'; g.fillRect(-36, -40, 26, 6);
    g.beginPath(); g.moveTo(8, -12); g.lineTo(34, -12); g.lineTo(34, -30); g.lineTo(64, 0); g.lineTo(34, 30); g.lineTo(34, 12); g.lineTo(8, 12); g.closePath(); g.fillStyle = '#9dff4a'; g.fill(); g.stroke();
  }
  g.restore();
}
// badge = dark disc with a neon rim and the glyph in it. Used for the world icon atlas and the DOM prompt button.
export function drawBadge(g, id, color, S) {
  g.save(); g.translate(S / 2, S / 2); const R = S * 0.46;
  g.beginPath(); g.arc(0, 0, R, 0, 7); const gr = g.createRadialGradient(0, -R * 0.3, R * 0.1, 0, 0, R); gr.addColorStop(0, '#4a2f7a'); gr.addColorStop(1, '#201438'); g.fillStyle = gr; g.fill();
  g.lineWidth = S * 0.05; g.strokeStyle = color; g.stroke(); g.lineWidth = S * 0.012; g.strokeStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(0, 0, R - S * 0.035, 0, 7); g.stroke();
  glyph(g, id, S * 0.8); g.restore();
}
export function spotGlyphCanvas(id, color, S) { const c = document.createElement('canvas'); c.width = c.height = S; drawBadge(c.getContext('2d'), id, color, S); return c; }
export const SPOT_DEFS = DEFS;
const INDOOR = { enter: 1.15, release: 1.75, ring: 1.1, iconY: 2.55, iconK: 0.78, pillar: 2.6 };

// soft additive sparkle points (also used by controls.js for the route dots). Per-point size/alpha/colour, no texture.
export function makeSparkles(THREE_, n, base) {
  const geo = new THREE_.BufferGeometry(); geo.setAttribute('position', new THREE_.BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('aColor', new THREE_.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); geo.setAttribute('aSize', new THREE_.BufferAttribute(new Float32Array(n), 1)); geo.setAttribute('aAlpha', new THREE_.BufferAttribute(new Float32Array(n), 1));
  const mat = new THREE_.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE_.AdditiveBlending, uniforms: { uScale: { value: 400 }, uGain: { value: base || 1 } },
    vertexShader: 'attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA; void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=max(1.0, aSize*uScale/-mv.z); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'varying vec3 vC; varying float vA; uniform float uGain; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); float core=smoothstep(0.5,0.0,r); float cr=smoothstep(0.07,0.0,min(abs(d.x),abs(d.y)))*smoothstep(0.5,0.05,r); float a=(core*core+cr*0.8)*vA*uGain; gl_FragColor=vec4(vC*a,a); }' });
  const pts = new THREE_.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 4; return pts;
}
export function updateSparkScale(pts, renderer, camera) { const h = renderer.domElement.height || 800; pts.material.uniforms.uScale.value = h * 0.5 / Math.tan(camera.fov * Math.PI / 360); }

export function buildSpots(ctx, terrain) {
  const THREE_ = THREE, group = new THREE_.Group(); group.name = 'spots';
  const defs = (terrain && terrain.spotDefs && terrain.spotDefs.length ? terrain.spotDefs : DEFS), IN = !!(terrain && terrain.interior);
  const ENTER = IN ? INDOOR.enter : ENTER_R, RELEASE = IN ? INDOOR.release : RELEASE_R, RING = IN ? INDOOR.ring : RING_R, ICON_Y = IN ? INDOOR.iconY : 3.9, ICON_K = IN ? INDOOR.iconK : 1, RK = RING / RING_R;
  // ----- fx atlas (512x256): cell A = glow pool + ring, cell B = dashed ring -----
  const fx = document.createElement('canvas'); fx.width = 512; fx.height = 256; const g = fx.getContext('2d');
  { const cx = 128, cy = 128, H = 124; // cell A
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, H); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.20)'); gr.addColorStop(0.74, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.8, 'rgba(255,255,255,1)'); gr.addColorStop(0.92, 'rgba(255,255,255,1)'); gr.addColorStop(0.97, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, H, 0, 7); g.fill();
    // inner faint tick marks for a UI-hologram feel
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * H * 0.62, cy + Math.sin(a) * H * 0.62); g.lineTo(cx + Math.cos(a) * H * 0.7, cy + Math.sin(a) * H * 0.7); g.stroke(); }
    // cell B dashed ring
    const bx = 384; g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 10; g.lineCap = 'round'; const N = 14; for (let i = 0; i < N; i++) { const a0 = i / N * Math.PI * 2, a1 = a0 + Math.PI * 2 / N * 0.55; g.beginPath(); g.arc(bx, cy, 112, a0, a1); g.stroke(); }
  }
  const fxTex = new THREE_.CanvasTexture(fx); fxTex.colorSpace = THREE_.SRGBColorSpace; fxTex.anisotropy = 4;
  const cellGeo = (u0, u1) => { const p = new THREE_.PlaneGeometry(1, 1); p.rotateX(-Math.PI / 2); const uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), uv.getY(i)); return p; };
  const ringGeo = cellGeo(0, 0.5), dashGeo = cellGeo(0.5, 1);
  const ringSize = RING * 2 / 0.9 * (124 / 128) * 1.0; // ring peak sits at 0.88 of the cell half size
  // ----- icon atlas: 5 cells of 192 x 256 -----
  const IW = 192, IH = 256; const ic = document.createElement('canvas'); ic.width = IW * defs.length; ic.height = IH; const ig = ic.getContext('2d');
  defs.forEach((d, i) => { ig.save(); ig.translate(i * IW, 0); ig.drawImage(spotGlyphCanvas(d.icon || d.id, d.color, 192), 0, 0);
    ig.font = '800 40px system-ui, Arial, sans-serif'; ig.textAlign = 'center'; ig.textBaseline = 'middle'; ig.lineJoin = 'round'; ig.lineWidth = 11; ig.strokeStyle = '#17102b'; ig.strokeText(d.label, IW / 2, 222); ig.fillStyle = '#fff6e8'; ig.fillText(d.label, IW / 2, 222); ig.restore(); });
  const iconTex = new THREE_.CanvasTexture(ic); iconTex.colorSpace = THREE_.SRGBColorSpace; iconTex.anisotropy = 4;
  const sparks = makeSparkles(THREE_, defs.length * 9, 1.0); group.add(sparks);

  const spots = defs.map((d, i) => {
    const col = new THREE_.Color(d.color);
    const root = new THREE_.Group(); root.visible = false; group.add(root);
    const mk = (geo, size, order, gain) => { const m = new THREE_.Mesh(geo, new THREE_.MeshBasicMaterial({ map: fxTex, color: col.clone().multiplyScalar(gain), transparent: true, depthWrite: false, blending: THREE_.AdditiveBlending, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); m.scale.set(size, 1, size); m.position.y = 0.1; m.renderOrder = order; m.castShadow = false; m.receiveShadow = false; root.add(m); return m; };
    const ring = mk(ringGeo, ringSize, 2, 1.7), dash = mk(dashGeo, ringSize * 1.02, 3, 1.9); dash.position.y = 0.12;
    const pg = new THREE_.PlaneGeometry(1.5 * ICON_K, 2.0 * ICON_K); const uv = pg.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, (i + uv.getX(k)) / defs.length, uv.getY(k));
    const icon = new THREE_.Mesh(pg, new THREE_.MeshBasicMaterial({ map: iconTex, transparent: true, depthWrite: false, toneMapped: false, fog: false, alphaTest: 0.02 })); icon.renderOrder = 6; icon.castShadow = false; root.add(icon);
    return { id: d.id, label: d.label, icon: d.icon || d.id, color: d.color, color2: d.color2, cine: d.cine, anchor: d.anchor, x: 0, z: 0, rot: 0, iconY: ICON_Y, radius: ENTER, release: RELEASE, near: false, glow: 0, pop: 0, i, root, ring, dash, iconMesh: icon, seed: Math.random() * 6.28, placed: false };
  });
  const sCol = spots.map((s) => new THREE_.Color(s.color));
  const sp = { life: new Float32Array(spots.length * 9), ang: new Float32Array(spots.length * 9), rad: new Float32Array(spots.length * 9) };
  for (let k = 0; k < sp.life.length; k++) { sp.life[k] = Math.random(); sp.ang[k] = Math.random() * 6.28; sp.rad[k] = (0.3 + Math.random() * 1.2) * RK; }

  // light pillars: ONE merged additive mesh for all spots (vertex colour fades to black at the top = invisible when additive)
  const SEG = 18, PH = IN ? INDOOR.pillar : 4.4, PR = RING * 0.92, VPS = SEG * 6, pg2 = new THREE_.BufferGeometry(), pPos = new Float32Array(spots.length * VPS * 3), pCol = new Float32Array(spots.length * VPS * 3), pBase = [];
  for (let k = 0; k < SEG; k++) { const a0 = k / SEG * 6.2832, a1 = (k + 1) / SEG * 6.2832, c0 = Math.cos(a0) * PR, s0 = Math.sin(a0) * PR, c1 = Math.cos(a1) * PR, s1 = Math.sin(a1) * PR; pBase.push([c0, 0.06, s0, 1], [c1, 0.06, s1, 1], [c1, PH, s1, 0], [c0, 0.06, s0, 1], [c1, PH, s1, 0], [c0, PH, s0, 0]); }
  spots.forEach((s, si) => { const c = sCol[si]; pBase.forEach((v, vi) => { const o = (si * VPS + vi) * 3, f = v[3] * (IN ? 0.2 : 0.34); pCol[o] = c.r * f; pCol[o + 1] = c.g * f; pCol[o + 2] = c.b * f; }); });
  pg2.setAttribute('position', new THREE_.BufferAttribute(pPos, 3)); pg2.setAttribute('color', new THREE_.BufferAttribute(pCol, 3));
  const pillar = new THREE_.Mesh(pg2, new THREE_.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE_.AdditiveBlending, depthWrite: false, side: THREE_.DoubleSide, toneMapped: false, fog: false })); pillar.frustumCulled = false; pillar.renderOrder = 1; group.add(pillar);
  function placePillar(s) { const o0 = s.i * VPS * 3, y = s.root.position.y; pBase.forEach((v, vi) => { const o = o0 + vi * 3; pPos[o] = s.x + v[0]; pPos[o + 1] = y + v[1]; pPos[o + 2] = s.z + v[2]; }); pg2.attributes.position.needsUpdate = true; }
  function place(s) { const AN = terrain && terrain.anchors, a = AN && (AN[s.anchor] || AN[s.id]); if (!a) { s.root.visible = false; return; } if (s.placed && a.x === s.x && a.z === s.z) return; s.x = a.x; s.z = a.z; s.rot = a.rot || 0; s.placed = true; s.root.visible = true; s.root.position.set(s.x, terrain.heightAt ? terrain.heightAt(s.x, s.z) : 0, s.z); placePillar(s); }
  function refresh(p) { if (!p) return; for (const s of spots) { place(s); if (!s.placed) continue; const d = Math.hypot(p.x - s.x, p.z - s.z); if (!s.near && d < s.radius) s.near = true; else if (s.near && d > s.release) s.near = false; } }
  function nearest(p) { refresh(p); let best = null, bd = 1e9; for (const s of spots) if (s.near) { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < bd) { bd = d; best = s; } } return best; }
  function activate(id) { ctx.events.emit('spot', { id, scene: ctx.sceneName || 'park' }); }

  const ease = (a, b, k) => a + (b - a) * k;
  function update(dt, t, p) {
    refresh(p); const cam = ctx.camera, pa = sparks.geometry.attributes; updateSparkScale(sparks, ctx.renderer, cam);
    for (const s of spots) {
      if (!s.placed) continue; const on = s.near ? 1 : 0; s.glow = ease(s.glow, on, 1 - Math.exp(-6 * dt)); s.pop = ease(s.pop, on, 1 - Math.exp(-9 * dt));
      const pulse = Math.sin(t * Math.PI * 2 * (1.2 + s.glow * 0.8) + s.seed), sc = 1 + 0.035 * pulse + 0.05 * s.glow;
      s.ring.scale.set(ringSize * sc, 1, ringSize * sc); s.ring.material.opacity = 0.72 + 0.18 * pulse + 0.25 * s.glow; s.dash.rotation.y = -t * (0.35 + s.glow * 0.5) + s.seed; s.dash.material.opacity = 0.55 + 0.3 * s.glow;
      const bob = Math.sin(t * Math.PI * 2 * 0.8 + s.seed) * 0.1; s.iconMesh.position.set(0, s.iconY + bob + s.pop * 0.15, 0); const k = 1 + 0.28 * s.pop; s.iconMesh.scale.set(k, k, 1); s.iconMesh.quaternion.copy(cam.quaternion); s.iconMesh.parent.updateWorldMatrix(true, false);
      // billboard: cancel the parent rotation (root is only translated, so copying the camera quaternion is enough)
    }
    for (let k = 0; k < sp.life.length; k++) {
      const si = Math.floor(k / 9), s = spots[si]; if (!s.placed) { pa.aAlpha.array[k] = 0; continue; }
      sp.life[k] += dt * (0.4 + 0.3 * s.glow); if (sp.life[k] > 1) { sp.life[k] -= 1; sp.ang[k] = Math.random() * 6.28; sp.rad[k] = (0.25 + Math.random() * 1.25) * RK; }
      const l = sp.life[k], r = sp.rad[k] * (1 - 0.15 * l), a = sp.ang[k] + l * 0.8; const c = sCol[si];
      pa.position.setXYZ(k, s.x + Math.cos(a) * r, 0.15 + l * (IN ? 1.4 : 2.0), s.z + Math.sin(a) * r); pa.aColor.setXYZ(k, c.r * 0.7 + 0.3, c.g * 0.7 + 0.3, c.b * 0.7 + 0.3);
      pa.aSize.array[k] = 0.16 + 0.12 * (1 - l) + 0.06 * s.glow; pa.aAlpha.array[k] = Math.sin(l * Math.PI) * (0.55 + 0.45 * s.glow);
    }
    pa.position.needsUpdate = pa.aColor.needsUpdate = pa.aSize.needsUpdate = pa.aAlpha.needsUpdate = true;
  }
  spots.forEach(place);
  return { group, spots, update, nearest, activate, refresh, ENTER_R: ENTER, RELEASE_R: RELEASE };
}

// SHELL: particles for the creator stage (sparkles + floating notes share one CPU driven Points object, no allocation per frame) and the painted textures of the stage. No em dashes.
import { THREE, canvasTex } from './kit.js';

export function glyphAtlas() {      // 4 cells in one 256x64 strip: soft spark, 4-point star, eighth note, beamed notes (white, tinted per particle)
  return canvasTex(256, 64, (g) => {
    g.clearRect(0, 0, 256, 64); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round';
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? 6 : 28; g.lineTo(96 + Math.cos(a) * rr, 32 + Math.sin(a) * rr); } g.closePath(); g.fill();
    g.beginPath(); g.ellipse(148, 46, 10, 7.5, -0.4, 0, 6.3); g.fill(); g.lineWidth = 5; g.beginPath(); g.moveTo(157, 44); g.lineTo(157, 12); g.quadraticCurveTo(170, 16, 172, 30); g.stroke();
    g.beginPath(); g.ellipse(214, 48, 8, 6, -0.4, 0, 6.3); g.fill(); g.beginPath(); g.ellipse(240, 44, 8, 6, -0.4, 0, 6.3); g.fill(); g.lineWidth = 4.5; g.beginPath(); g.moveTo(221, 46); g.lineTo(221, 14); g.lineTo(247, 8); g.lineTo(247, 42); g.stroke(); g.lineWidth = 7; g.beginPath(); g.moveTo(221, 16); g.lineTo(247, 10); g.stroke();
  });
}

// a vinyl record top (the turntable): grooves, a coloured label, a gold centre spindle
export function vinylTex() {
  return canvasTex(512, 512, (g, W) => {
    const c = W / 2; g.fillStyle = '#17122e'; g.fillRect(0, 0, W, W); g.translate(c, c);
    for (let r = 120; r < c - 6; r += 3.2) { g.strokeStyle = 'rgba(' + (r % 9 < 3 ? '120,110,190' : '60,50,110') + ',' + (0.18 + 0.12 * Math.sin(r * 0.37)) + ')'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); }
    for (let k = 0; k < 3; k++) { const a0 = k * 2.094 + 0.3, gr = g.createLinearGradient(0, 0, Math.cos(a0) * c, Math.sin(a0) * c); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(180,170,255,0.16)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, c - 4, a0, a0 + 0.5); g.closePath(); g.fill(); }
    g.fillStyle = '#ff3ea5'; g.beginPath(); g.arc(0, 0, 96, 0, 7); g.fill(); g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(0, 0, 70, 0, 7); g.fill(); g.fillStyle = '#17122e'; g.beginPath(); g.arc(0, 0, 8, 0, 7); g.fill();
    g.fillStyle = '#2b2160'; g.font = '900 24px "Fredoka","Arial Black",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BBH', 0, -34); g.fillText('HERO', 0, 36);
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, c - 8, 0, 7); g.stroke();
  });
}

export function nameTex(name, col) {
  const t = canvasTex(1024, 256, (g, W, H) => {
    g.clearRect(0, 0, W, H); g.textAlign = 'center'; g.textBaseline = 'middle'; const s = (name || 'NEW HERO').toUpperCase().slice(0, 12); let size = 150; g.font = '900 ' + size + 'px "Fredoka","Arial Black","Trebuchet MS",sans-serif';
    const w = g.measureText(s).width; if (w > W - 80) { size = Math.floor(size * (W - 80) / w); g.font = '900 ' + size + 'px "Fredoka","Arial Black","Trebuchet MS",sans-serif'; }
    g.lineJoin = 'round'; g.shadowColor = col; g.shadowBlur = 34; g.lineWidth = 20; g.strokeStyle = col; g.strokeText(s, W / 2, H / 2); g.shadowBlur = 12; g.lineWidth = 12; g.strokeText(s, W / 2, H / 2); g.shadowBlur = 0; g.lineWidth = 5; g.strokeStyle = '#ffffff'; g.fillStyle = '#17102b'; g.strokeText(s, W / 2, H / 2);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillText(s, W / 2, H / 2);
  });
  return t;
}

// CPU particle pool: add({x,y,z, vx,vy,vz, life, size, r,g,b, cell}) ; cell 0 spark, 1 star, 2 note, 3 notes
export function makeParticles(N, tex) {
  const P = new Float32Array(N * 3), C = new Float32Array(N * 4), Sz = new Float32Array(N), Cell = new Float32Array(N), V = new Float32Array(N * 3), L = new Float32Array(N * 3); // L = age, life, grav
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('aC', new THREE.BufferAttribute(C, 4)); geo.setAttribute('aS', new THREE.BufferAttribute(Sz, 1)); geo.setAttribute('aCell', new THREE.BufferAttribute(Cell, 1));
  const U = { uTex: { value: tex }, uScale: { value: 500 } };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    vertexShader: 'attribute vec4 aC; attribute float aS; attribute float aCell; uniform float uScale; varying vec4 vC; varying float vCell; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vC = aC; vCell = aCell; gl_PointSize = aC.a > 0.001 ? clamp(uScale * aS / max(0.4, -mv.z), 1.0, 160.0) : 0.0; }',
    fragmentShader: 'uniform sampler2D uTex; varying vec4 vC; varying float vCell; void main(){ vec2 uv = vec2((gl_PointCoord.x + vCell) * 0.25, 1.0 - gl_PointCoord.y); float a = texture2D(uTex, uv).a * vC.a; gl_FragColor = vec4(vC.rgb * a * 1.5, a); }' }));
  pts.frustumCulled = false; pts.renderOrder = 10; let head = 0;
  const api = { points: pts, U, count: 0,
    add(o) { const i = head; head = (head + 1) % N; P[i * 3] = o.x; P[i * 3 + 1] = o.y; P[i * 3 + 2] = o.z; V[i * 3] = o.vx || 0; V[i * 3 + 1] = o.vy || 0; V[i * 3 + 2] = o.vz || 0; L[i * 3] = 0; L[i * 3 + 1] = o.life || 1; L[i * 3 + 2] = o.grav || 0; C[i * 4] = o.r; C[i * 4 + 1] = o.g; C[i * 4 + 2] = o.b; C[i * 4 + 3] = 1; Sz[i] = o.size || 0.2; Cell[i] = o.cell || 0; Cell.__d = 1; },
    update(dt, t) {
      for (let i = 0; i < N; i++) { if (C[i * 4 + 3] <= 0.001) continue; const age = L[i * 3] += dt, life = L[i * 3 + 1]; if (age >= life) { C[i * 4 + 3] = 0; continue; }
        V[i * 3 + 1] -= L[i * 3 + 2] * dt; P[i * 3] += V[i * 3] * dt + (Cell[i] >= 2 ? Math.sin(t * 2.2 + i) * 0.004 : 0); P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt; const k = age / life; C[i * 4 + 3] = Math.min(1, k * 8) * (1 - k * k); }
      geo.attributes.position.needsUpdate = true; geo.attributes.aC.needsUpdate = true; geo.attributes.aCell.needsUpdate = true; geo.attributes.aS.needsUpdate = true; },
  };
  return api;
}

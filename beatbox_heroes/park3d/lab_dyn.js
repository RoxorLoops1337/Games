// Dynamic always-lit quads for the Sound Lab (Interior Artist INT-A): VU ladders, rack LEDs, MPC pads and the analog needles share ONE small mesh (1 draw call) whose vertex colours
// (and, for the needles, positions) are rewritten every frame. Unlit basic material, so it glows at every time of day like a real LED.
import { THREE } from './kit.js';

export function makeDyn() {
  const P = [], C = [], count = { n: 0 };
  const api = {
    // quad a,b,c,d (counter clockwise), colour c -> index
    quad(a, b, c, d, color) { const i = count.n++; [a, b, c, a, c, d].forEach((p) => { P.push(p[0], p[1], p[2]); C.push(color[0], color[1], color[2]); }); return i; },
    // a flat rectangle facing +z at (x,y,z) of size w x h, rotated about Y by ry and about X by rx
    rect(x, y, z, w, h, ry, rx, color) {
      const cs = Math.cos(ry), sn = Math.sin(ry), cx = Math.cos(rx || 0), sx = Math.sin(rx || 0), pt = (u, v) => { const yy = v * cx, zz = v * sx; return [x + u * cs + zz * sn, y + yy, z - u * sn + zz * cs]; };
      return api.quad(pt(-w / 2, -h / 2), pt(w / 2, -h / 2), pt(w / 2, h / 2), pt(-w / 2, h / 2), color);
    },
    color(i, c) { for (let k = 0; k < 6; k++) { const o = (i * 6 + k) * 3; api.cArr[o] = c[0]; api.cArr[o + 1] = c[1]; api.cArr[o + 2] = c[2]; } api.dirtyC = true; },
    setQuad(i, a, b, c, d) { [a, b, c, a, c, d].forEach((p, k) => { const o = (i * 6 + k) * 3; api.pArr[o] = p[0]; api.pArr[o + 1] = p[1]; api.pArr[o + 2] = p[2]; }); api.dirtyP = true; },
    finish() {
      api.pArr = new Float32Array(P); api.cArr = new Float32Array(C); const g = new THREE.BufferGeometry();
      const pa = new THREE.BufferAttribute(api.pArr, 3), ca = new THREE.BufferAttribute(api.cArr, 3); pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage); g.setAttribute('position', pa); g.setAttribute('color', ca);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100); api.geo = g;
      const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }); m.userData.dyn = true;
      const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.name = 'lab_dyn'; mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 5; api.mesh = mesh; return mesh;
    },
    flush() { if (api.dirtyC) { api.geo.attributes.color.needsUpdate = true; api.dirtyC = false; } if (api.dirtyP) { api.geo.attributes.position.needsUpdate = true; api.dirtyP = false; } },
    count,
  };
  return api;
}

// The four rift gates, one at the heart of each rift island (the 2D Game scene stands a 'riftgate' sprite there; they are not
// entities, so the entity layer never draws them): a ring of riveted grey stone on two footings round a swirling violet portal.
// The glow they give at night is the light map's (glow.ts). One gate is six draw calls: its stones are merged by material.

import { AdditiveBlending, BoxGeometry, type BufferGeometry, CircleGeometry, DoubleSide, Euler, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, type Scene, ShaderMaterial, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RIFT_ISLANDS, TILE } from '../shared/config';
import type { World } from '../shared/world';

const STONE = [0x585c7c, 0x7a7f9e, 0x9ea4bf];

/** The stones of one gate, by material: the three greys of the ring and footings, and the pale studs. */
function gateParts () {
    const parts: BufferGeometry[][] = [[], [], [], []];
    const m = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3(1, 1, 1);
    const put = (geo: BufferGeometry, k: number, x: number, y: number, z: number, rz: number) => {
        m.compose(p.set(x, y, z), q.setFromEuler(e.set(0, 0, rz)), s);
        parts[k].push(geo.clone().applyMatrix4(m));
    };
    const block = new BoxGeometry(0.42, 0.34, 0.38), stud = new BoxGeometry(0.09, 0.09, 0.06), foot = new BoxGeometry(0.62, 0.3, 0.6);
    // the ring: 16 stones round an upright ellipse, each turned along the ring, every other one with a pale rivet
    for (let k = 0; k < 16; k++) {
        const an = (k / 16) * Math.PI * 2, x = Math.cos(an) * 1.02, y = 1.3 + Math.sin(an) * 1.26;
        put(block, k % 3, x, y, 0, an + Math.PI / 2);
        put(stud, k % 2 ? 3 : 2, x, y, 0.21, an);
    }
    for (const sx of [-1, 1]) put(foot, 0, sx * 0.92, 0.15, 0, 0);
    for (const g of [block, stud, foot]) g.dispose();
    return parts.map((list) => { const g = mergeGeometries(list); for (const x of list) x.dispose(); return g; });
}

export class RiftGates {
    private readonly group = new Group();
    private readonly portal: ShaderMaterial;

    constructor (world: World, scene: Scene) {
        this.group.name = 'riftgates';
        this.portal = new ShaderMaterial({
            uniforms: { uTime: { value: 0 } },
            transparent: true,
            depthWrite: false,
            side: DoubleSide,
            vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            // a vortex: spiral arms turning, a bright eye in the middle, dark violet at the rim
            fragmentShader: `varying vec2 vP; uniform float uTime;
              void main(){ vec2 p = vP / vec2(0.82, 1.05); float r = length(p); if (r > 1.0) discard;
                float a = atan(p.y, p.x); float arms = sin(a * 3.0 + r * 9.0 - uTime * 2.4) * 0.5 + 0.5;
                vec3 deep = vec3(0.16, 0.11, 0.31), vio = vec3(0.62, 0.42, 0.95), pink = vec3(0.97, 0.62, 0.78);
                vec3 c = mix(deep, mix(vio, pink, smoothstep(0.75, 1.0, arms)), smoothstep(0.35, 0.95, arms) * (0.35 + 0.65 * (1.0 - r)));
                c = mix(c, vec3(1.0, 0.97, 0.9), smoothstep(0.22, 0.0, r));
                gl_FragColor = vec4(c * 1.15, 0.96); }`,
        });
        const mats = [...STONE.map((c) => new MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.85 })), new MeshStandardMaterial({ color: 0xcdf4ee, flatShading: true, roughness: 0.4, metalness: 0.3 })];
        const parts = gateParts();
        const disc = new CircleGeometry(1.05, 40), eye = new CircleGeometry(0.5, 24);
        const haloMat = new MeshStandardMaterial({ color: 0x000000, emissive: 0xb48cff, emissiveIntensity: 1.6, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false });
        for (let i = 0; i < RIFT_ISLANDS; i++) {
            const c = world.riftCenter(i), g = new Group();
            parts.forEach((geo, k) => { const m = new Mesh(geo, mats[k]); m.castShadow = k < 3; g.add(m); });
            const d = new Mesh(disc, this.portal);
            d.position.set(0, 1.3, 0);
            d.renderOrder = 8;
            const h = new Mesh(eye, haloMat);
            h.position.set(0, 1.3, 0.02);
            g.add(d, h);
            // it stands where the 2D sprite stands (its foot 12 px south of the island's middle), facing the camera
            g.position.set(c.x / TILE, 0, (c.y + 12) / TILE);
            this.group.add(g);
        }
        scene.add(this.group);
    }

    update (t: number) { this.portal.uniforms.uTime.value = t; }

    dispose () { this.group.removeFromParent(); }
}

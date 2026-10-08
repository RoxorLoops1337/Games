// Ambient life over the island: drifting cloud shadows by day and fireflies at night.
import { AdditiveBlending, BufferAttribute, BufferGeometry, Mesh, PlaneGeometry, Points, PointsMaterial, Scene, ShaderMaterial, Vector2 } from 'three';

export class CloudShadows {
    u = { uTime: { value: 0 }, uAmt: { value: 0.2 }, uOff: { value: new Vector2() } };
    mesh: Mesh<PlaneGeometry, ShaderMaterial>;
    constructor(scene: Scene) {
        const geo = new PlaneGeometry(90, 90, 1, 1).rotateX(-Math.PI / 2);
        const mat = new ShaderMaterial({
            uniforms: this.u,
            transparent: true,
            depthWrite: false,
            fog: false,
            vertexShader: 'varying vec2 vW; uniform vec2 uOff; void main(){ vW = position.xz + uOff; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: `varying vec2 vW; uniform float uTime, uAmt;
              float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
              float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
              void main(){ vec2 p = vW * 0.045 + vec2(uTime * 0.012, uTime * 0.006); float v = n(p) * .55 + n(p * 2.1 + 7.) * .3 + n(p * 4.3 + 3.) * .15;
                float a = smoothstep(.52, .72, v) * uAmt; gl_FragColor = vec4(.10, .16, .28, a); }`
        });
        this.mesh = new Mesh(geo, mat);
        this.mesh.position.y = 0.035;
        this.mesh.renderOrder = 2;
        this.mesh.frustumCulled = false;
        scene.add(this.mesh);
    }
    /** `day` 0..1 (how bright), `cover` 0..1 (rain makes the sky heavier). */
    update(t: number, cx: number, cz: number, day: number, cover: number) {
        const sx = Math.round(cx / 4) * 4, sz = Math.round(cz / 4) * 4;
        this.mesh.position.x = sx;
        this.mesh.position.z = sz;
        this.u.uOff.value.set(sx, sz);
        this.u.uTime.value = t;
        this.u.uAmt.value = day * (0.2 + cover * 0.25);
        this.mesh.visible = this.u.uAmt.value > 0.01;
    }
}
export class Fireflies {
    seed: { x: number; z: number; y: number; ph: number; sp: number }[] = [];
    mat = new PointsMaterial({ color: 0xd8ff7a, size: 0.16, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true, fog: false });
    pos: Float32Array;
    pts: Points;
    constructor(scene: Scene, n = 46) {
        this.pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) this.seed.push({ x: Math.random() * 40, z: Math.random() * 30, y: 0.4 + Math.random() * 1.3, ph: Math.random() * 6.28, sp: 0.2 + Math.random() * 0.5 });
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(this.pos, 3));
        this.pts = new Points(g, this.mat);
        this.pts.frustumCulled = false;
        this.pts.renderOrder = 25;
        scene.add(this.pts);
    }
    update(t: number, cx: number, cz: number, amount: number) {
        this.mat.opacity = amount * (0.55 + Math.sin(t * 3) * 0.1);
        this.pts.visible = amount > 0.02;
        if (!this.pts.visible) return;
        this.seed.forEach((s, i) => {
            const a = t * s.sp + s.ph;
            this.pos[i * 3] = cx - 20 + (s.x + Math.sin(a) * 1.6 + 40) % 40;
            this.pos[i * 3 + 1] = s.y + Math.sin(a * 1.7) * 0.25;
            this.pos[i * 3 + 2] = cz - 15 + (s.z + Math.cos(a * 0.8) * 1.4 + 30) % 30;
        });
        this.pts.geometry.attributes.position.needsUpdate = true;
    }
}

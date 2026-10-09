// Rain, the pool of night lights and the red warning circles of monster attacks.
import { BufferAttribute, BufferGeometry, CircleGeometry, DynamicDrawUsage, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PointLight, RingGeometry, Scene } from 'three';

/** Rain streaks around the camera: line segments falling and wrapping. */
export class Rain {
    seed: { ox: number; oz: number; oy: number; v: number }[] = [];
    mat = new LineBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0, depthWrite: false, fog: false });
    n = 1100;
    pos: Float32Array;
    mesh: LineSegments<BufferGeometry, LineBasicMaterial>;
    constructor(scene: Scene) {
        this.pos = new Float32Array(this.n * 6);
        for (let i = 0; i < this.n; i++) this.seed.push({ ox: Math.random() * 48, oz: Math.random() * 40, oy: Math.random() * 30, v: 22 + Math.random() * 10 });
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
        this.mesh = new LineSegments(g, this.mat);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 30;
        scene.add(this.mesh);
    }
    /** `amount` 0..1; (cx, cz) is the middle of what the camera sees. */
    update(dt: number, cx: number, cz: number, amount: number, wind = 0.12) {
        this.mat.opacity = Math.min(0.34, amount * 0.42);
        this.mesh.visible = amount > 0.02;
        if (!this.mesh.visible) return;
        const live = Math.floor(this.n * Math.min(1, 0.25 + amount));
        for (let i = 0; i < this.n; i++) {
            const s = this.seed[i];
            s.oy -= s.v * dt;
            if (s.oy < 0) s.oy += 30;
            const x = cx - 24 + s.ox, z = cz - 22 + s.oz + (30 - s.oy) * 0, y = s.oy;
            const j = i * 6, on = i < live;
            this.pos[j] = x;
            this.pos[j + 1] = on ? y : -9;
            this.pos[j + 2] = z;
            this.pos[j + 3] = x + wind;
            this.pos[j + 4] = on ? y + 0.65 : -9;
            this.pos[j + 5] = z + 0;
        }
        this.mesh.geometry.attributes.position.needsUpdate = true;
    }
}
/** A light that a lamp, fire or window gives off at night. */
export interface LightSpot { x: number; y: number; z: number; color: number; power: number; range: number }
/** A few point lights handed to the lights nearest the camera each frame. */
export class LightPool {
    lights: PointLight[] = [];
    constructor(scene: Scene, n = 8) {
        for (let i = 0; i < n; i++) {
            const l = new PointLight(0xffb060, 0, 9, 1.6);
            l.castShadow = false;
            scene.add(l);
            this.lights.push(l);
        }
    }
    update(spots: LightSpot[], cx: number, cz: number, night: number, t: number) {
        spots.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
        this.lights.forEach((l, i) => {
            const s = spots[i];
            if (!s || Math.hypot(s.x - cx, s.z - cz) > 22) {
                l.intensity += (0 - l.intensity) * 0.2;
                return;
            }
            const flick = 1 + Math.sin(t * 9 + s.x * 3.1) * 0.05 + Math.sin(t * 13.7 + s.z) * 0.04;
            l.color.setHex(s.color);
            l.position.set(s.x, s.y, s.z);
            l.distance = s.range;
            l.intensity += (s.power * night * flick * 3.2 - l.intensity) * 0.2;
        });
    }
}
/** Red warning circles on the ground where a monster's attack will land. */
export class Telegraphs {
    scene: Scene;
    items: { mesh: Mesh<CircleGeometry | RingGeometry, MeshBasicMaterial>; t: number; max: number }[] = [];
    geo = new CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    ring = new RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    constructor(scene: Scene) {
        this.scene = scene;
    }
    add(x: number, z: number, r: number, t: number, ring = false) {
        const mat = new MeshBasicMaterial({ color: 0xe85d62, transparent: true, opacity: 0.35, depthWrite: false });
        const mesh = new Mesh(ring ? this.ring : this.geo, mat);
        mesh.position.set(x, 0.06, z);
        mesh.scale.setScalar(r);
        mesh.renderOrder = 4;
        this.scene.add(mesh);
        this.items.push({ mesh, t, max: t });
    }
    update(dt: number) {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const it = this.items[i];
            it.t -= dt;
            const m = it.mesh.material, k = 1 - it.t / it.max;
            m.opacity = it.t > 0 ? 0.18 + k * 0.4 + Math.sin(k * 40) * 0.05 : Math.max(0, 0.6 + it.t * 3);
            if (it.t < -0.2) {
                this.scene.remove(it.mesh);
                m.dispose();
                this.items.splice(i, 1);
            }
        }
    }
}

// Rain, the pool of night lights and the red warning circles of monster attacks.
import { AdditiveBlending, BufferAttribute, BufferGeometry, CircleGeometry, DynamicDrawUsage, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PointLight, RingGeometry, Scene } from 'three';

/**
 * Rain streaks around the camera: line segments falling and wrapping. Each streak is long, leans with the wind and fades from a
 * faint tail to a bright head (vertex colours, added onto the picture), so under the steep camera it still reads as falling rain
 * and not as dots. `density` (0..1) is the quality level's share of the streaks.
 */
export class Rain {
    seed: { ox: number; oz: number; oy: number; v: number; l: number }[] = [];
    mat = new LineBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: AdditiveBlending });
    n = 1100;
    density = 1;
    pos: Float32Array;
    mesh: LineSegments<BufferGeometry, LineBasicMaterial>;
    constructor(scene: Scene) {
        this.pos = new Float32Array(this.n * 6);
        const col = new Float32Array(this.n * 6);
        for (let i = 0; i < this.n; i++) {
            this.seed.push({ ox: Math.random() * 48, oz: Math.random() * 40, oy: Math.random() * 30, v: 24 + Math.random() * 10, l: 1.1 + Math.random() * 0.8 });
            const head = 0.7 + Math.random() * 0.3;
            col.set([0.1, 0.12, 0.16, 0.62 * head, 0.7 * head, 0.85 * head], i * 6);
        }
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
        g.setAttribute('color', new BufferAttribute(col, 3));
        this.mesh = new LineSegments(g, this.mat);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 30;
        scene.add(this.mesh);
    }
    /** `amount` 0..1; (cx, cz) is the middle of what the camera sees; `wind` 0..1 leans the streaks. */
    update(dt: number, cx: number, cz: number, amount: number, wind = 0.25) {
        this.mat.opacity = Math.min(0.9, amount * 1.1);
        this.mesh.visible = amount > 0.02;
        if (!this.mesh.visible) return;
        const live = Math.floor(this.n * this.density * Math.min(1, 0.25 + amount));
        const lean = 0.12 + wind * 0.5;
        for (let i = 0; i < this.n; i++) {
            const s = this.seed[i];
            s.oy -= s.v * dt;
            if (s.oy < 0) s.oy += 30;
            const y = s.oy, x = cx - 24 + s.ox + (15 - y) * lean, z = cz - 22 + s.oz;
            const j = i * 6, on = i < live;
            // the tail (up and upwind), then the head
            this.pos[j] = x - lean * s.l;
            this.pos[j + 1] = on ? y + s.l : -9;
            this.pos[j + 2] = z - 0.08 * s.l;
            this.pos[j + 3] = x;
            this.pos[j + 4] = on ? y : -9;
            this.pos[j + 5] = z;
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

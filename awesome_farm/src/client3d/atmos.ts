// The air over the island, for the 2D NightLayer's weather that the prototype did not have: fog banks drifting low over the
// ground (a foggy morning, the Dread Reaches' veil), rain rings on the ground and the water, and the special nights' skies
// (meteors streaking down, fairy lights drifting up). The tints and the darkness are the mood's (mood.ts).

import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Points, PointsMaterial, Quaternion, RingGeometry, type Scene, Vector3 } from 'three';
import { softDisc } from './glow';

/** Soft, wide sheets of mist a little over the ground, drifting with the wind and wrapping round the camera. */
export class FogBanks {
    private readonly items: { mesh: Mesh<PlaneGeometry, MeshBasicMaterial>; x: number; z: number; y: number; s: number; v: number }[] = [];
    readonly color = new Color(0xeef4fa);

    constructor (scene: Scene, n = 14) {
        const geo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
        for (let i = 0; i < n; i++) {
            const mat = new MeshBasicMaterial({ map: softDisc(), color: this.color, transparent: true, opacity: 0, depthWrite: false, fog: false });
            const mesh = new Mesh(geo, mat);
            mesh.renderOrder = 24;
            mesh.frustumCulled = false;
            mesh.visible = false;
            scene.add(mesh);
            this.items.push({ mesh, x: Math.random() * 50, z: Math.random() * 36, y: 0.5 + Math.random() * 1.6, s: 7 + Math.random() * 8, v: 0.25 + Math.random() * 0.45 });
        }
    }

    /** `amount` 0..1: how thick (a fog day's morning, the Dread Reaches, an underground cave is never foggy). */
    update (dt: number, cx: number, cz: number, amount: number) {
        for (const it of this.items) {
            const m = it.mesh;
            m.visible = amount > 0.01;
            if (!m.visible) continue;
            it.x += it.v * dt;
            const x = cx - 25 + ((it.x % 50) + 50) % 50, z = cz - 18 + ((it.z % 36) + 36) % 36;
            // fade in from the edges of the box so a sheet never pops when it wraps
            const edge = Math.min(1, Math.min(x - (cx - 25), cx + 25 - x) / 6);
            m.position.set(x, it.y, z);
            m.scale.set(it.s * 1.6, 1, it.s);
            m.material.color.copy(this.color);
            m.material.opacity = amount * 0.42 * Math.max(0, edge);
        }
    }
}

/** Rings where raindrops land: on the ground they flash and go, on the water they spread. */
export class Splashes {
    private readonly n = 48;
    private readonly mesh: InstancedMesh;
    private readonly items: { x: number; z: number; t: number; y: number }[] = [];
    private readonly m = new Matrix4();
    private readonly q = new Quaternion();
    private readonly p = new Vector3();
    private readonly s = new Vector3();
    private acc = 0;

    constructor (scene: Scene) {
        const mat = new MeshBasicMaterial({ color: 0xd8e6f8, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
        this.mesh = new InstancedMesh(new RingGeometry(0.8, 1, 18).rotateX(-Math.PI / 2), mat, this.n);
        this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 6;
        this.mesh.count = 0;
        scene.add(this.mesh);
    }

    /** `rain` 0..1; `groundAt(x, z)` says whether a spot is land (rings sit on it) or water (rings sit on the sea). */
    update (dt: number, cx: number, cz: number, rain: number, landAt: (x: number, z: number) => boolean, waterY: number) {
        this.acc += dt * rain * 70;
        while (this.acc > 1) {
            this.acc -= 1;
            if (this.items.length >= this.n) this.items.shift();
            const x = cx + (Math.random() - 0.5) * 30, z = cz + (Math.random() - 0.5) * 20;
            this.items.push({ x, z, t: 0, y: landAt(x, z) ? 0.04 : waterY + 0.05 });
        }
        let k = 0;
        for (let i = this.items.length - 1; i >= 0; i--) {
            const it = this.items[i];
            it.t += dt;
            if (it.t > 0.45) { this.items.splice(i, 1); continue; }
            const u = it.t / 0.45, r = 0.05 + u * 0.28;
            this.p.set(it.x, it.y, it.z);
            this.s.set(r, 1, r * 0.8);
            this.m.compose(this.p, this.q, this.s);
            this.mesh.setMatrixAt(k++, this.m);
        }
        (this.mesh.material as MeshBasicMaterial).opacity = 0.45 * Math.min(1, rain * 1.5);
        this.mesh.count = k;
        this.mesh.visible = k > 0;
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}

/** The special nights' skies: meteors streaking down (Meteor Shower) and fairy lights drifting up (Fairy Night). */
export class NightSky {
    private readonly meteors: { x: number; y: number; z: number; t: number }[] = [];
    private readonly lines: LineSegments<BufferGeometry, LineBasicMaterial>;
    private readonly linePos = new Float32Array(12 * 6);
    private readonly fairies: { x: number; y: number; z: number; t: number; ph: number }[] = [];
    private readonly pts: Points<BufferGeometry, PointsMaterial>;
    private readonly ptPos = new Float32Array(60 * 3);

    constructor (scene: Scene) {
        const lg = new BufferGeometry();
        lg.setAttribute('position', new BufferAttribute(this.linePos, 3).setUsage(DynamicDrawUsage));
        this.lines = new LineSegments(lg, new LineBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.95, depthWrite: false, fog: false, blending: AdditiveBlending }));
        this.lines.frustumCulled = false;
        this.lines.renderOrder = 31;
        scene.add(this.lines);
        const pg = new BufferGeometry();
        pg.setAttribute('position', new BufferAttribute(this.ptPos, 3).setUsage(DynamicDrawUsage));
        this.pts = new Points(pg, new PointsMaterial({ color: 0xf8c8ee, size: 0.18, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending, fog: false }));
        this.pts.frustumCulled = false;
        this.pts.renderOrder = 31;
        scene.add(this.pts);
    }

    update (dt: number, cx: number, cz: number, event: string | null, amount: number) {
        if (event === 'meteors' && amount > 0.3 && Math.random() < dt * 0.8 && this.meteors.length < 12) this.meteors.push({ x: cx - 14 + Math.random() * 24, y: 14, z: cz - 14 + Math.random() * 10, t: 0 });
        if (event === 'fairies' && amount > 0.3 && Math.random() < dt * 4 && this.fairies.length < 60) this.fairies.push({ x: cx + (Math.random() - 0.5) * 26, y: 0.3 + Math.random() * 0.6, z: cz + (Math.random() - 0.5) * 16, t: 0, ph: Math.random() * 6.28 });
        let n = 0;
        for (let i = this.meteors.length - 1; i >= 0; i--) {
            const m = this.meteors[i];
            m.t += dt; m.x += 9 * dt; m.y -= 14 * dt; m.z += 3 * dt;
            if (m.y < 0) { this.meteors.splice(i, 1); continue; }
            const j = n++ * 6;
            this.linePos.set([m.x, m.y, m.z, m.x - 1.4, m.y + 2.2, m.z - 0.45], j);
        }
        for (let k = n * 6; k < this.linePos.length; k++) this.linePos[k] = 0;
        this.lines.visible = n > 0;
        this.lines.geometry.attributes.position.needsUpdate = true;
        this.lines.geometry.setDrawRange(0, n * 2);
        let f = 0;
        for (let i = this.fairies.length - 1; i >= 0; i--) {
            const p = this.fairies[i];
            p.t += dt; p.y += 0.6 * dt; p.x += Math.sin(p.t * 3 + p.ph) * 0.4 * dt;
            if (p.t > 4) { this.fairies.splice(i, 1); continue; }
            this.ptPos.set([p.x, p.y, p.z], f++ * 3);
        }
        this.pts.visible = f > 0;
        this.pts.material.opacity = 0.9 * amount;
        this.pts.geometry.attributes.position.needsUpdate = true;
        this.pts.geometry.setDrawRange(0, f);
    }
}

// Rain on the island: the ground darkens and takes a sheen while it rains and dries slowly after, and puddles gather in the low
// spots, mirroring the grey sky. One shared material change (no rebuild, no new program) and one instanced mesh of puddles.
// It only draws: where a puddle lies comes from a hash of the tile, never from the world's rules.

import { CanvasTexture, type Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, type MeshStandardMaterial, PlaneGeometry, Quaternion, type Scene, Vector3 } from 'three';
import { hash2 } from './terrain';

const MAX = 96;
/** How many land tiles in a hundred hold a puddle. */
const SHARE = 0.07;

/** A puddle's shape: a soft-edged blot with a slightly brighter rim where it catches the sky, drawn once in code. */
let tex: CanvasTexture | null = null;
function puddleTex () {
    if (tex) return tex;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const cx = cv.getContext('2d')!;
    const g = cx.createRadialGradient(32, 32, 0, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.84, 'rgba(255,255,255,1)');
    g.addColorStop(0.93, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = g;
    cx.fillRect(0, 0, 64, 64);
    tex = new CanvasTexture(cv);
    return tex;
}

/** How wet the ground is for a rain amount (0..1): eases in fast, dries slowly. Pure, for the tests. */
export function stepWet (wet: number, rain: number, dt: number) {
    const want = rain > 0.04 ? Math.min(1, rain * 1.5) : 0;
    const rate = want > wet ? 0.35 : 0.05;
    const next = wet + Math.sign(want - wet) * Math.min(Math.abs(want - wet), rate * dt);
    return Math.abs(next - want) < 1e-4 ? want : next;
}

export class Wetness {
    /** 0..1: how wet the ground is now. */
    wet = 0;
    readonly mesh: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
    private readonly m = new Matrix4();
    private readonly q = new Quaternion();
    private readonly p = new Vector3();
    private readonly s = new Vector3();
    private laidAt = '';

    constructor (scene: Scene, private readonly ground: MeshStandardMaterial) {
        const mat = new MeshBasicMaterial({ map: puddleTex(), color: 0xb6c4d4, transparent: true, opacity: 0, depthWrite: false, fog: false });
        this.mesh = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, MAX);
        this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 2;
        this.mesh.count = 0;
        this.mesh.visible = false;
        this.mesh.name = 'puddles';
        scene.add(this.mesh);
    }

    /**
     * `rain` 0..1 (0 in winter and underground), `sky` the sky's colour now (the puddles mirror it), `puddles` whether this quality
     * level lays them, `free(tx, ty)` whether a tile is open land (no building, no rock, not water).
     */
    update (dt: number, rain: number, cx: number, cz: number, sky: Color, puddles: boolean, free: (tx: number, ty: number) => boolean) {
        this.wet = stepWet(this.wet, rain, dt);
        const w = this.wet;
        // the ground: darker and less rough while wet (the sun and the lamps catch its facets), as made when dry
        this.ground.color.setScalar(1 - w * 0.2);
        this.ground.roughness = 0.95 - w * 0.4;
        const show = puddles && w > 0.05;
        this.mesh.visible = show;
        if (!show) { this.laidAt = ''; return; }
        const mat = this.mesh.material;
        // still water mirrors the grey sky, a shade darker than the sky itself
        mat.color.copy(sky).multiplyScalar(0.82);
        mat.opacity = Math.min(0.4, w * 0.48);
        // lay them again only when the camera has moved a few tiles
        const gx = Math.round(cx / 4), gz = Math.round(cz / 4), key = `${gx},${gz}`;
        if (key === this.laidAt) return;
        this.laidAt = key;
        let n = 0;
        const x0 = gx * 4 - 22, z0 = gz * 4 - 16;
        for (let tz = z0; tz < z0 + 32 && n < MAX; tz++) for (let tx = x0; tx < x0 + 44 && n < MAX; tx++) {
            if (hash2(tx * 0.913 + 17, tz * 1.37 - 5) > SHARE || !free(tx, tz)) continue;
            const a = hash2(tx * 3.3, tz * 7.1), b = hash2(tx * 5.9 + 2, tz * 2.3);
            this.q.setFromAxisAngle(this.p.set(0, 1, 0), a * Math.PI);
            this.p.set(tx + 0.3 + a * 0.4, 0.035, tz + 0.3 + b * 0.4);
            this.s.set(0.7 + b * 0.7, 1, 0.45 + a * 0.4);
            this.m.compose(this.p, this.q, this.s);
            this.mesh.setMatrixAt(n++, this.m);
        }
        this.mesh.count = n;
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    dispose () {
        this.mesh.removeFromParent();
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.ground.color.setScalar(1);
        this.ground.roughness = 0.95;
    }
}

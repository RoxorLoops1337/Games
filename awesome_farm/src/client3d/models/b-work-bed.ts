// The garden bed and the crop growing in it.
import * as THREE from 'three';
import type { BuildE } from '../../shared/sim/types';
import { CROPS } from '../../shared/data/buildings';
import { wc } from './b-work-util';
import { cropGroup, SOIL_TOP } from './crops';
import { bake, type BOpts, clamp, env, hash, type Model, smooth } from './kit';

export const SOIL = [0x5a3a28, 0x7a5232, 0x946440, 0xb48458];
export function bed(o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    root.add(bake('work.bed', (mb) => {
        const b = mb.main, wd = wc(0.62, 0.3);
        for (const s of [-1, 1]) {
            b.box(1, 0.13, 0.1, wd, { y: 0.065, z: s * 0.45, j: 0.008, v: 0.08 });
            b.box(0.1, 0.11, 0.8, wc(0.55, 0.3), { x: s * 0.45, y: 0.055, j: 0.008, v: 0.08 });
        }
        b.box(0.8, 0.07, 0.8, SOIL[1], { y: 0.035, j: 0.006, v: 0.06 });
        for (const z of [-0.27, 0, 0.27]) {
            b.hull([[-0.39, 0.06, z - 0.12], [0.39, 0.06, z - 0.12], [-0.39, 0.06, z + 0.12], [0.39, 0.06, z + 0.12], [-0.37, 0.108, z], [0.37, 0.108, z]], (_x, y) => y > 0.085 ? SOIL[3] : SOIL[2], { j: 0.008, v: 0.08 });
        }
    }, o.seed));
    let crop: THREE.Group | null = null, key = '', rows: THREE.Object3D[] = [], stage = -1, phase = hash(o.seed, 3.3) * 6.28, amp = 0;
    const clear = () => {
        if (crop) {
            root.remove(crop);
            crop = null;
            rows = [];
        }
        key = '';
        stage = -1;
    };
    return {
        obj: root,
        apply(e) {
            const b = e;
            const c = b.crop ?? -1, plant = b.plant;
            if (c < 0 || !plant) {
                clear();
                return;
            }
            const st = Math.min(2, Math.max(0, c));
            const k = `${plant}|${st}`;
            if (k !== key) {
                clear();
                crop = cropGroup(plant, st);
                key = k;
                stage = st;
                rows = crop.userData.rows ?? [];
                root.add(crop);
            }
            if (crop) {
                const secs = CROPS[plant]?.stageSecs ?? 10;
                const f = b.growT === undefined || stage === 2 ? 1 : smooth(0, 1, clamp(b.growT / secs));
                const s = 0.8 + 0.2 * f;
                crop.scale.setScalar(s);
                crop.position.y = SOIL_TOP * (1 - s);
            }
            amp = stage === 2 ? 0.05 : stage === 1 ? 0.025 : 0;
        },
        update(_dt: number, t: number) {
            if (!amp) return;
            const w = 0.45 + env.wind * 0.9;
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                r.rotation.z = Math.sin(t * 1.5 * w + phase + i * 1.1) * amp * w;
                r.rotation.x = Math.sin(t * 1.1 * w + phase * 1.7 + i * 0.6) * amp * 0.5 * w;
            }
        }
    };
}
export const BED = { bed };

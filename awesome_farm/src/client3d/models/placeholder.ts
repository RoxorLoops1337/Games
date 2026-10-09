// A plain block for anything that has no model yet.
import * as THREE from 'three';
import { Bld, type Model, VC } from './kit';

export const cache = new Map<string, THREE.BufferGeometry>();
/** A plain block for anything that has no model yet. */
export function placeholder(w = 1, h = 1, color = 0xb0b0c0, height = 0.6): Model {

    const key = `${w}|${h}|${color}|${height}`;
    let g = cache.get(key);
    if (!g) {
        g = new Bld(1).slab(w * 0.84, height, h * 0.84, color, { j: 0.02 }).build();
        cache.set(key, g);
    }
    const m = new THREE.Mesh(g, VC);
    m.castShadow = true;
    m.receiveShadow = true;
    return { obj: m };
}

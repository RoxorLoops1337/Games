// Small marks that hang over or lie under a model: a health bar that faces the camera, a ground ring that pulses, a "2+" badge.
import * as THREE from 'three';
import { CAM_EL } from './kit';

const LIME = 0xd4f08a, GOLD = 0xffd966, BERRY = 0xe85d62, INK = 0x2a1d2c, PEBBLE = 0xd5d9e6, CREAM = 0xfff6e0;

const basic = new Map<string, THREE.MeshBasicMaterial>();
/** A flat, unlit material (cached): bars and badges read the same by day and by night. */
export function flat (color: number, opacity = 1, depthTest = false) {
    const k = `${color}|${opacity}|${depthTest}`;
    let m = basic.get(k);
    if (!m) {
        m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest, depthWrite: false, toneMapped: false });
        basic.set(k, m);
    }
    return m;
}
const unit = new THREE.PlaneGeometry(1, 1);
const circleGeo = new THREE.CircleGeometry(1, 20);

/** A health bar `w` tiles wide that faces the camera: lime when healthy, gold under a half, berry under a quarter (as in 2D). */
export function healthBar (w = 1.1, h = 0.13) {
    const g = new THREE.Group();
    g.rotation.x = -CAM_EL;
    const back = new THREE.Mesh(unit, flat(INK, 0.9)), well = new THREE.Mesh(unit, flat(PEBBLE, 0.5)), fill = new THREE.Mesh(unit, flat(LIME));
    back.scale.set(w + 0.06, h + 0.06, 1);
    well.scale.set(w, h, 1);
    well.position.z = 0.001;
    fill.position.z = 0.002;
    back.renderOrder = 20; well.renderOrder = 21; fill.renderOrder = 22;
    for (const m of [back, well, fill]) { m.raycast = () => {}; m.userData.noFlash = true; }
    g.add(back, well, fill);
    g.visible = false;
    return {
        group: g,
        set (frac: number) {
            const f = Math.max(0, Math.min(1, frac));
            g.visible = f < 1;
            fill.scale.set(Math.max(0.01, w * f), h, 1);
            fill.position.x = -w * (1 - f) / 2;
            fill.material = flat(f > 0.5 ? LIME : f > 0.25 ? GOLD : BERRY);
        },
    };
}

const ringGeo = new THREE.RingGeometry(0.94, 1, 40).rotateX(-Math.PI / 2);
/** A ring on the ground: one steady gold line and one that opens and fades (faster once `busy`), radius `r` tiles. */
export function groundRing (r: number) {
    const g = new THREE.Group();
    const steady = new THREE.Mesh(ringGeo, flat(GOLD, 0.5, true).clone()), wave = new THREE.Mesh(ringGeo, flat(CREAM, 0.5, true).clone());
    steady.scale.setScalar(r);
    for (const m of [steady, wave]) { m.position.y = 0.035; m.renderOrder = 2; m.raycast = () => {}; m.userData.noFlash = true; m.castShadow = false; }
    g.add(steady, wave);
    const wm = wave.material as THREE.MeshBasicMaterial;
    return {
        group: g,
        update (t: number, phase: number, busy: boolean) {
            const p = 0.5 + 0.5 * Math.sin(t * 3 + phase);
            (steady.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.3 * p;
            const u = (t * (busy ? 1.5 : 0.8) + phase * 0.37) % 1;
            wave.scale.setScalar(r * (1 + u * 0.7));
            wm.opacity = 0.55 * (1 - u);
        },
    };
}

/** The "2+" badge (a gold coin of a badge, inked round the edge, with an ink 2 and plus, as in 2D) that says a Titan needs friends. Faces the camera. */
export function friendsBadge () {
    const g = new THREE.Group();
    g.rotation.x = -CAM_EL;
    const disc = (r: number, c: number, z: number) => {
        const m = new THREE.Mesh(circleGeo, flat(c));
        m.scale.setScalar(r);
        m.position.z = z;
        m.renderOrder = 23;
        m.raycast = () => {};
        m.userData.noFlash = true;
        g.add(m);
    };
    const plate = (w: number, h: number, c: number, z: number, x = 0, y = 0) => {
        const m = new THREE.Mesh(unit, flat(c));
        m.scale.set(w, h, 1);
        m.position.set(x, y, z);
        m.renderOrder = 24;
        m.raycast = () => {};
        m.userData.noFlash = true;
        g.add(m);
    };
    disc(0.25, INK, 0);
    disc(0.215, GOLD, 0.001);
    disc(0.17, 0xfff3b0, 0.0015);
    // a seven-segment "2": top, upper right, middle, lower left, bottom
    const s = 0.035, L = 0.1, x0 = -0.065, z = 0.002;
    plate(L, s, INK, z, x0, 0.085);
    plate(s, L * 0.95, INK, z, x0 + L / 2 - s / 2, 0.043);
    plate(L, s, INK, z, x0, 0);
    plate(s, L * 0.95, INK, z, x0 - L / 2 + s / 2, -0.043);
    plate(L, s, INK, z, x0, -0.085);
    // the plus
    plate(0.1, s, INK, z, 0.08, 0);
    plate(s, 0.1, INK, z, 0.08, 0);
    return g;
}

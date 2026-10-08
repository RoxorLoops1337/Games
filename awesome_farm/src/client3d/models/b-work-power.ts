// Power and industry: drill, assembler, coal generator, pole, wind turbine, solar panel and battery.
import * as THREE from 'three';
import type { BuildE } from '../../shared/sim/types';
import { BR, dirWrap, ic, IL, isOn, isWorking, puffs, sc, taper, wc } from './b-work-util';
import { bake, Bld, type BOpts, clamp, env, flicker, mix, type Model, smooth, TAU } from './kit';

export const PEBBLE = 0xd5d9e6;
export const DARK = 0x2c2536;
export const PIT = 0x3a3550;
export function housing(b: Bld, h = 0.34, tint = sc(0.62, 0.25), foot = sc(0.2, 0.15), bolts = true) {
    b.box(1.94, 0.15, 1.94, foot, { y: 0.075, j: 0.01 });
    taper(b, 0.92, 0.92, 0.86, 0.86, 0.15, h, tint, { j: 0.01 });
    if (bolts) for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.tet(0.07, ic(0.95), { x: sx * 0.78, y: h + 0.03, z: sz * 0.78, sy: 0.7, j: 0.004, ao: false });
}
export function drill(o: BOpts): Model<BuildE> {
    const inner = new THREE.Group();
    inner.add(bake('work.drill', (mb) => {
        const b = mb.main;
        housing(b, 0.34);
        b.cyl(0.66, 0.68, 0.14, 8, sc(0.75, 0.2), { x: -0.1, y: 0.41, ry: 0.4, j: 0.01 });
        b.cyl(0.5, 0.5, 0.012, 6, PIT, { x: -0.1, y: 0.486, ry: 0.4, ao: false, v: 0 });
        b.box(1.4, 0.05, 0.05, 0xf8a24a, { x: -0.1, y: 0.27, z: 0.9, j: 0.004, v: 0.05 });
        b.box(0.34, 0.24, 0.32, ic(0.7), { x: 0.82, y: 0.46, j: 0.006 });
        b.box(0.1, 0.2, 0.26, BR[1], { x: 0.96, y: 0.46, j: 0.004 });
        b.box(0.12, 0.12, 0.2, DARK, { x: 0.96, y: 0.46, ao: false, v: 0 });
        b.box(0.5, 0.2, 0.3, ic(0.65), { x: -0.5, y: 0.44, z: -0.74, j: 0.006 });
        b.cyl(0.08, 0.08, 0.14, 6, BR[2], { x: -0.5, y: 0.59, z: -0.74, j: 0.003 });
    }));
    const rotor = new THREE.Group();
    rotor.position.set(-0.1, 0.5, 0);
    inner.add(rotor);
    rotor.add(bake('work.drill.rotor', (mb) => {
        const b = mb.main;
        for (let i = 0; i < 2; i++) b.box(1, 0.07, 0.11, ic(0.75 + i * 0.1), { y: 0.04 + i * 0.012, ry: i * Math.PI / 2, j: 0.005 });
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2;
            b.tet(0.1, 0xf8a24a, { x: Math.cos(a) * 0.5, y: 0.09, z: Math.sin(a) * 0.5, sy: 0.9, j: 0.004 });
        }
        b.cyl(0.13, 0.14, 0.12, 6, (_x, y) => y > 0.1 ? 0xffd966 : 0xf8a24a, { y: 0.08, j: 0.004 });
        b.cone(0.1, 0.22, 6, 0xf8a24a, { y: 0.25, j: 0.004 });
    }));
    const dust = puffs({ x: -0.1, y: 0.62, z: 0, rise: 0.4, dx: 0.1, dz: 0.1, size: 0.8, period: 1.6, n: 3, color: 0xdccaa0, spread: 0.2 });
    inner.add(dust.group);
    let working = false;
    return {
        obj: dirWrap(o.rot, inner),
        apply(e) {
            working = isWorking(e);
        },
        update(dt: number, t: number) {
            if (working) {
                rotor.rotation.y -= dt * 3.2;
                inner.position.y = Math.sin(t * 38) * 0.003;
            } else inner.position.y = 0;
            dust.update(t, working);
        }
    };
}
export function assembler(_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    const SLOPE = Math.atan2(0.35, 0.46);
    root.add(bake('work.assembler', (mb) => {
        const b = mb.main;
        housing(b, 0.34);
        b.hull([[-0.98, 0.34, -0.92], [0.18, 0.34, -0.92], [0.18, 0.34, -0.35], [-0.98, 0.34, -0.35], [-0.98, 0.8, -0.92], [0.18, 0.8, -0.92], [0.18, 0.8, -0.7], [-0.98, 0.8, -0.7]], sc(0.5, 0.2), { j: 0.008 });
        b.box(0.98, 0.4, 0.05, ic(0.55), { x: -0.4, y: 0.57, z: -0.52, rx: -SLOPE, j: 0.004 });
        b.box(0.86, 0.3, 0.05, 0x2d4a6a, { x: -0.4, y: 0.575, z: -0.505, rx: -SLOPE, ao: false, v: 0 });
        b.box(1, 0.05, 0.05, 0x4ab2cf, { x: -0.3, y: 0.27, z: 0.9, j: 0.004, v: 0.05 });
        b.box(0.7, 0.04, 0.8, 0x4a4478, { x: -0.3, y: 0.36, z: 0.3, j: 0.004, ao: false });
        b.box(0.5, 0.05, 1.1, ic(0.6), { x: 0.7, y: 0.365, z: -0.05, j: 0.005 });
        for (const [x, c] of [[-0.55, 0x3f8a4c], [-0.35, 0xa8641a], [-0.15, 0xa8841a]]) b.oct(0.06, c, { x: x - 0, y: 0.4, z: 0.8, sy: 0.7, j: 0.003, ao: false });
        b.box(0.28, 0.1, 0.28, ic(0.6), { x: -0.3, y: 0.41, z: 0.3, j: 0.004 });
    }));
    const screenOn = bake('work.assembler.screen', (mb) => {
        mb.glow(0x4ab2cf, 1.7).box(0.84, 0.28, 0.02, (_x, y) => mix(0x2f8fb8, 0xa8e8f0, clamp((y - 0.45) * 2.4)), { x: -0.4, y: 0.585, z: -0.486, rx: -SLOPE, ao: false, v: 0.05 });
    });
    screenOn.visible = false;
    root.add(screenOn);
    const bars: THREE.Group[] = [];
    for (let i = 0; i < 2; i++) {
        const g = bake('work.assembler.bar', (mb) => {
            mb.glow(0xe8fbff, 1.8).box(0.26, 0.04, 0.02, 0xe8fbff, { rx: -SLOPE, ao: false, v: 0 });
        });
        g.visible = false;
        root.add(g);
        bars.push(g);
    }
    const lampsOn = bake('work.assembler.lamps', (mb) => {
        mb.glow(0x92d364, 2).oct(0.065, 0xd4f08a, { x: -0.55, y: 0.405, z: 0.8, sy: 0.7, ao: false });
        mb.glow(0xf8a24a, 2).oct(0.065, 0xf8a24a, { x: -0.35, y: 0.405, z: 0.8, sy: 0.7, ao: false });
        mb.glow(0xffd966, 2).oct(0.065, 0xffd966, { x: -0.15, y: 0.405, z: 0.8, sy: 0.7, ao: false });
    });
    lampsOn.visible = false;
    root.add(lampsOn);
    const shoulder = new THREE.Group();
    shoulder.position.set(-0.3, 0.5, 0.3);
    root.add(shoulder);
    shoulder.add(bake('work.assembler.arm1', (mb) => {
        mb.main.oct(0.1, ic(0.9), { y: 0, j: 0.003 });
        mb.main.box(0.08, 0.34, 0.08, ic(0.75), { y: 0.18, j: 0.004 });
    }));
    const elbow = new THREE.Group();
    elbow.position.set(0, 0.36, 0);
    shoulder.add(elbow);
    elbow.add(bake('work.assembler.arm2', (mb) => {
        mb.main.oct(0.075, BR[2], { j: 0.003 });
        mb.main.box(0.46, 0.07, 0.07, ic(0.9), { x: 0.23, j: 0.004 });
        mb.main.box(0.08, 0.1, 0.08, IL[2], { x: 0.5, y: -0.04, j: 0.003 });
    }));
    shoulder.rotation.y = 0.4;
    elbow.rotation.z = -0.6;
    const cbars: THREE.Group[] = [];
    for (let i = 0; i < 2; i++) {
        const g = bake('work.assembler.cbar', (mb) => {
            mb.main.box(0.42, 0.015, 0.06, IL[3], { ao: false, v: 0.03 });
        });
        root.add(g);
        cbars.push(g);
    }
    let on = false;
    const setCb = (ph: number) => cbars.forEach((g, i) => {
        const k = (ph + i / 2) % 1;
        g.position.set(0.7, 0.395, -0.55 + k * 1);
        g.scale.setScalar(Math.sin(k * Math.PI));
    });
    setCb(0);
    return {
        obj: root,
        apply(e) {
            on = isWorking(e) || isOn(e);
            screenOn.visible = on;
            lampsOn.visible = on;
            for (const g of bars) g.visible = on;
        },
        update(_dt: number, t: number) {
            if (!on) return;
            shoulder.rotation.y = Math.sin(t * 1.3) * 0.9 + 0.2;
            elbow.rotation.z = -0.7 + Math.sin(t * 2.6) * 0.35;
            setCb(t * 0.5 % 1);
            for (let i = 0; i < 2; i++) {
                const k = (t * 0.7 + i * 0.5) % 1;
                bars[i].position.set(-0.4 + (k - 0.5) * 0.5, 0.585 + Math.sin(i * 3 + t) * 0.05, -0.486);
                bars[i].scale.set(0.6 + (i ? 0.5 : 0), 1, 1);
            }
            lampsOn.scale.setScalar(1 + 0.12 * Math.sin(t * 6));
        }
    };
}
export const cc = (k: number) => (x: number, y: number, z: number) => mix(0x8a4a34, 0xe0a07a, clamp(k + (-x - z) * 0.12 + (y - 0.4) * 0.3));
export function coalgen(_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    root.add(bake('work.coalgen', (mb) => {
        const b = mb.main, top = 0.3;
        housing(b, top, cc(0.45), (x, _y, z) => mix(0x5a3a30, 0x8a6a5a, clamp(0.3 + (-x - z) * 0.1)), false);
        b.cyl(0.36, 0.36, 1.2, 8, ic(0.8, 0.25), { x: -0.1, y: top + 0.36, z: -0.5, rz: Math.PI / 2, j: 0.01 });
        for (const x of [-0.5, 0.25]) b.tube(0.375, 0.375, 0.09, 6, BR[2], { x, y: top + 0.36, z: -0.5, rz: Math.PI / 2, j: 0.004 });
        b.cyl(0.1, 0.14, 1, 6, ic(0.55), { x: 0.4, y: top + 1.2, z: -0.5, j: 0.006 });
        b.box(0.34, 0.07, 0.34, BR[2], { x: 0.4, y: top + 1.72, z: -0.5, j: 0.005 });
        b.box(0.95, 0.52, 0.62, cc(0.6), { x: -0.3, y: top + 0.26, z: 0.4, j: 0.01 });
        b.box(1, 0.05, 0.68, ic(0.55), { x: -0.3, y: top + 0.545, z: 0.4, j: 0.006 });
        b.box(0.54, 0.34, 0.04, DARK, { x: -0.3, y: top + 0.22, z: 0.72, ao: false, v: 0 });
        b.box(0.66, 0.05, 0.06, BR[2], { x: -0.3, y: top + 0.42, z: 0.72, j: 0.003 });
        b.box(0.5, 0.46, 0.6, ic(0.75), { x: 0.65, y: top + 0.23, z: 0.4, j: 0.008 });
        for (let i = 0; i < 2; i++) b.box(0.54, 0.07, 0.64, BR[2], { x: 0.65, y: top + 0.1 + i * 0.2, z: 0.4, j: 0.004, v: 0.05 });
        b.ico(0.2, 0, 0x4a4660, { x: 0.78, y: top + 0.07, z: 0.88, sy: 0.55, j: 0.04, v: 0.1 });
    }));
    const lampOn = bake('work.coalgen.lamp', (mb) => {
        mb.glow(0xffd966, 2).oct(0.07, 0xfff3b0, { x: 0.65, y: 0.8, z: 0.4, sy: 0.7, ao: false });
    });
    lampOn.visible = false;
    root.add(lampOn);
    const fireOff = bake('work.coalgen.cold', (mb) => {
        for (const x of [-0.4, -0.2]) mb.main.oct(0.045, 0x8a3a2a, { x, y: 0.42, z: 0.72, sy: 0.6, j: 0.01, ao: false });
    });
    root.add(fireOff);
    const fire = new THREE.Group();
    fire.add(bake('work.coalgen.fire', (mb) => {
        mb.glow(0xf07a22, 2).cone(0.14, 0.3, 5, 0xf07a22, { x: -0.38, y: 0.52, z: 0.74, j: 0.015, ao: false, v: 0.05 });
        mb.glow(0xffb040, 2.2).cone(0.12, 0.28, 5, 0xffb040, { x: -0.2, y: 0.52, z: 0.75, j: 0.015, ao: false, v: 0.05 });
        mb.glow(0xffe08a, 2.4).cone(0.06, 0.18, 4, 0xffe08a, { x: -0.3, y: 0.46, z: 0.76, j: 0.008, ao: false, v: 0.04 });
    }));
    fire.visible = false;
    root.add(fire);
    const smoke = puffs({ x: 0.4, y: 2.1, z: -0.5, rise: 0.8, dx: 0.14, dz: -0.05, size: 1.15, period: 3.2, n: 3, color: 0xdcd8e4 });
    root.add(smoke.group);
    let on = false;
    return {
        obj: root,
        apply(e) {
            on = (e.act ?? 0) > 0;
            fire.visible = on;
            fireOff.visible = !on;
            lampOn.visible = on;
        },
        update(_dt: number, t: number) {
            if (on) fire.scale.set(1, 0.8 + flicker(t, 0.9) * 0.5, 1);
            smoke.update(t, on);
        }
    };
}
export function pole(_o: BOpts): Model<BuildE> {
    return {
        obj: bake('work.pole', (mb) => {
            const b = mb.main;
            for (let i = 0; i < 3; i++) b.oct(0.1, sc(0.4 + i * 0.2, 0.3, i), { x: Math.cos(i * 2.2 + 0.4) * 0.12, y: 0.04, z: Math.sin(i * 2.2 + 0.4) * 0.12, sy: 0.55, sx: 1.2, j: 0.02 });
            b.cyl(0.05, 0.075, 1.75, 6, wc(0.6, 0.35), { y: 0.88, j: 0.012 });
            b.box(0.62, 0.06, 0.07, wc(0.75), { y: 1.55, j: 0.008 });
            b.box(0.4, 0.05, 0.06, wc(0.65), { y: 1.3, j: 0.008 });
            b.rod([0, 1.1, 0.04], [0.2, 1.42, 0], 0.016, 3, wc(0.5));
            b.rod([0, 1.1, 0.04], [-0.2, 1.42, 0], 0.016, 3, wc(0.5));
            for (const x of [-0.27, 0, 0.27]) {
                b.cyl(0.02, 0.03, 0.13, 4, PEBBLE, { x, y: 1.655, j: 0.003, v: 0.04 });
                b.cone(0.04, 0.05, 4, 0x9ea4b9, { x, y: 1.74 });
            }
            for (const x of [-0.27, 0.27]) b.rod([x, 1.72, 0], [x * 1.7, 1.55, 0.02], 0.009, 3, 0x2a1d2c);
            mb.glow(0x7ae0f4, 1.4).oct(0.022, 0xbdf4ee, { y: 1.8, ao: false, v: 0 });
        })
    };
}
export function windturbine(_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    root.add(bake('work.turbine', (mb) => {
        const b = mb.main;
        b.cyl(0.44, 0.52, 0.12, 8, sc(0.6, 0.25), { y: 0.06, ry: 0.4, j: 0.012 });
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 + 0.6;
            b.oct(0.1, sc(0.4 + i % 2 * 0.3, 0.3, i), { x: Math.cos(a) * 0.5, y: 0.07, z: Math.sin(a) * 0.5, sy: 0.6, sx: 1.2, ry: a, j: 0.02 });
        }
        b.cyl(0.07, 0.2, 1.75, 8, (x, y, z) => mix(0xe4c8b4, 0xfffaf0, clamp((-x - z) * 0.9 + 0.55 + (y - 0.9) * 0.1)), { y: 1, ry: 0.2, j: 0.008, v: 0.05 });
        b.box(0.13, 0.24, 0.04, 0x8f5a36, { y: 0.26, z: 0.185, ao: false });
        b.box(0.1, 0.1, 0.03, 0x4a4478, { y: 1.4, z: 0.1, ao: false, v: 0 });
        b.box(0.26, 0.24, 0.52, 0xfff0d2, { y: 1.92, z: -0.02, j: 0.008 });
        b.box(0.28, 0.04, 0.52, 0xe4c8b4, { y: 1.8, z: -0.02 });
    }));
    const tilt = new THREE.Group();
    tilt.position.set(0, 1.92, 0.3);
    tilt.rotation.x = -0.5;
    root.add(tilt);
    const rotor = new THREE.Group();
    rotor.position.z = 0.12;
    tilt.add(rotor);
    rotor.add(bake('work.turbine.blades', (mb) => {
        const b = mb.main;
        for (let i = 0; i < 3; i++) {
            const a = i * TAU / 3;
            const pts = [[-0.05, 0.1, 0], [0.05, 0.1, 0], [-0.12, 0.38, 0.02], [0.12, 0.38, 0.02], [-0.07, 0.7, 0.01], [0.07, 0.7, 0.01], [0, 0.95, 0.005]];
            b.hull(pts, (_x, y) => mix(0xfff0d2, 0xffffff, clamp(y * 1.2)), { rz: a, j: 0.003, v: 0.04, ao: false });
        }
        b.cyl(0.11, 0.11, 0.1, 6, 0xf8a24a, { rx: Math.PI / 2, z: 0.02, j: 0.003 });
        b.cone(0.1, 0.18, 6, 0xf8a24a, { rx: Math.PI / 2, z: 0.14, j: 0.004 });
    }));
    const beacon = bake('work.turbine.beacon', (mb) => {
        mb.glow(0xe85d62, 2.2).oct(0.035, 0xff8a8a, { x: 0, y: 2.06, z: -0.2, ao: false, v: 0 });
    });
    root.add(beacon);
    return {
        obj: root,
        update(dt: number, t: number) {
            rotor.rotation.z -= dt * (0.4 + env.wind * 2.4);
            const blink = t % 2.2 < 0.28 ? 1 : 0.0001;
            beacon.scale.setScalar(blink * (0.5 + env.night * 0.9));
        }
    };
}
export const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
export let glintGeo: THREE.BoxGeometry | null = null;
export function solar(_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.position.y = 0.5;
    tilt.rotation.x = -0.26;
    root.add(tilt);
    root.add(bake('work.solar.legs', (mb) => {
        const b = mb.main;
        for (const sx of [-0.8, 0.8]) {
            b.box(0.09, 0.42, 0.09, ic(0.7), { x: sx, y: 0.21, z: -0.78, j: 0.006 });
            b.box(0.09, 0.2, 0.09, ic(0.7), { x: sx, y: 0.1, z: 0.8, j: 0.006 });
        }
        b.box(0.5, 0.2, 0.4, ic(0.6), { x: 0, y: 0.1, z: -0.06 });
    }));
    tilt.add(bake('work.solar.panels', (mb) => {
        const b = mb.main, g = mb.shiny();
        b.box(1.94, 0.07, 1.94, ic(0.8), { j: 0.006 });
        for (const px of [-0.47, 0.47]) for (const pz of [-0.47, 0.47]) {
            g.box(0.86, 0.04, 0.86, (x, y, z) => mix(0x2d6ea6, 0x56c0dc, clamp(0.3 + (-x - z) * 0.3 + (y - 0.04) * 8)), { x: px, y: 0.045, z: pz, j: 0.004, v: 0.06 });
            b.box(0.86, 0.02, 0.025, 0xcdf4ee, { x: px, y: 0.068, z: pz, ao: false, v: 0.02 });
            b.box(0.025, 0.02, 0.86, 0xcdf4ee, { x: px, y: 0.068, z: pz, ao: false, v: 0.02 });
        }
    }));
    glintGeo ??= new THREE.BoxGeometry(0.2, 0.01, 1.05);
    const glint = new THREE.Mesh(glintGeo, glintMat);
    glint.position.y = 0.075;
    glint.rotation.y = 0.78;
    glint.renderOrder = 4;
    tilt.add(glint);
    const glint2 = new THREE.Mesh(glintGeo, glintMat);
    glint2.position.y = 0.075;
    glint2.rotation.y = 0.78;
    glint2.renderOrder = 4;
    tilt.add(glint2);
    return {
        obj: root,
        update(_dt: number, t: number) {
            const sun = smooth(0.4, 0.75, env.sun);
            glintMat.opacity = 0.45 * sun;
            glint.visible = glint2.visible = sun > 0.01;
            const k = t * 0.28 % 1.6;
            const w = Math.sin(clamp(k, 0, 1) * Math.PI);
            const kk = clamp(k, 0, 1);
            glint.position.set((kk - 0.5) * 0.7, 0.075, 0);
            glint.scale.set(w, 1, 1);
            glint2.position.set((kk - 0.5) * 0.7 - 0.2, 0.075, 0);
            glint2.scale.set(w * 0.4, 1, 1);
        }
    };
}
export function battery(_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    const SEG = [[-0.21, 0xffd966], [-0.07, 0xffd966], [0.07, 0xffd966], [0.21, 0xd4f08a]];
    root.add(bake('work.battery', (mb) => {
        const b = mb.main;
        taper(b, 0.33, 0.3, 0.31, 0.28, 0, 0.58, sc(0.45, 0.25), { j: 0.01 });
        b.box(0.7, 0.05, 0.66, sc(0.8, 0.1), { y: 0.605, j: 0.006 });
        for (const sz of [-1, 1]) b.box(0.74, 0.5, 0.05, BR[1], { y: 0.28, z: sz * 0.3, j: 0.004, v: 0.04 });
        b.cyl(0.075, 0.085, 0.1, 6, ic(0.95), { x: 0.2, y: 0.69, z: -0.17, j: 0.003 });
        b.cyl(0.05, 0.05, 0.05, 6, BR[2], { x: -0.2, y: 0.675, z: -0.17, j: 0.003 });
        b.box(0.6, 0.012, 0.22, DARK, { y: 0.634, z: 0.14, ao: false, v: 0 });
        for (const [x] of SEG) b.box(0.1, 0.014, 0.16, 0x4a475c, { x, y: 0.64, z: 0.14, ao: false, v: 0.02 });
    }));
    const lit = SEG.map(([x, c], i) => {
        const g = bake(`work.battery.seg${i}`, (mb) => {
            mb.glow(c, 2).box(0.1, 0.02, 0.16, c, { x, y: 0.646, z: 0.14, ao: false, v: 0.03 });
        });
        g.visible = false;
        root.add(g);
        return g;
    });
    const low = bake('work.battery.low', (mb) => {
        mb.glow(0xe85d62, 2).box(0.1, 0.02, 0.16, 0xe85d62, { x: -0.21, y: 0.646, z: 0.14, ao: false, v: 0 });
    });
    root.add(low);
    let level = 0;
    return {
        obj: root,
        apply(e) {
            level = clamp(Math.round((e.chg ?? 0) / 1500 * 4), 0, 4);
            lit.forEach((g, i) => {
                g.visible = i < level;
            });
            low.visible = level === 0;
        },
        update(_dt: number, t: number) {
            if (level === 0) low.visible = Math.sin(t * 4) > -0.2;
        }
    };
}
export const POWER = { drill, assembler, coalgen, pole, windturbine, solar, battery };

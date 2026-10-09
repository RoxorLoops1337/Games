// Monster models: slime, skeleton and archer, bat and boar.
import * as THREE from 'three';
import { cos, eye, eyeOn, frac, keys, type MobRig, onEll, PI, ramp4, shade, sheet, sin } from './mobs-rig';
import { at, bake } from './kit';

export const G = () => new THREE.Group();
export const BONE = [0xbfb8a8, 0xe0dac8, 0xf4f0e2, 0xffffff];
export const SLIME_HOP = [[0, 1], [0.2, 0.74], [0.3, 1.25], [0.55, 1.08], [0.7, 0.9], [0.78, 0.7], [1, 1]];
export function slime(seed: number): MobRig {
    const R = [0x5d3a9a, 0x8b5cc8, 0xb48cec, 0xdcc4ff];
    const root = G(), sq = G();
    root.add(sq);
    sq.add(bake('mob.slime', (mb) => {
        const b = mb.main;
        b.lathe([[0, 0], [0.4, 0], [0.45, 0.05], [0.46, 0.14], [0.42, 0.27], [0.33, 0.4], [0.2, 0.5], [0.08, 0.56], [0.0001, 0.58]], 9, shade([R[1], R[1], R[2], R[2], R[3]], -0.1, 0.58, 0.3, 3, 0.1, 0.7), { j: 0.03 });
        b.oct(0.085, R[3], { x: -0.16, y: 0.46, z: -0.02, sx: 1.4, sy: 0.55, rz: 0.5, ao: false, v: 0.02, j: 0.01 });
        const E = { cy: 0.08, rx: 0.46, ry: 0.5, rz: 0.46 };
        eyeOn(b, E, -0.14, 0.4, 0.092, { sy: 1.3 });
        eyeOn(b, E, 0.14, 0.4, 0.092, { sy: 1.3 });
        const mo = onEll(E, 0.01, 0.27);
        b.box(0.13, 0.03, 0.03, 0xc9505a, { x: 0.01, y: 0.27, z: mo.z, rx: mo.rx, ao: false, v: 0.02 });
        for (const s of [-1, 1]) {
            const p = onEll(E, s * 0.28, 0.33);
            b.oct(0.05, 0xf79fc6, { x: s * 0.28, y: 0.33, z: p.z - 0.01, sz: 0.5, rx: p.rx, ao: false, v: 0.03 });
        }
    }, seed));
    let hop = 0;
    return {
        root,
        head: 0.58,
        rad: 0.45,
        accent: 0xb48cec,
        anim(c) {
            const rate = 1.7;
            const prev = hop;
            if (c.moving) hop += c.dt * rate;
            else if (hop % 1 > 0.0001) {
                hop += c.dt * rate * 1.4;
                if (Math.floor(hop) > Math.floor(prev)) hop = Math.floor(hop);
            }
            const p = frac(hop);
            let sy = keys(p, SLIME_HOP);
            const y = p > 0.22 && p < 0.72 ? 0.34 * sin(PI * (p - 0.22) / 0.5) : 0;
            sy *= 1 + 0.035 * sin(c.t * 2.4) * (1 - c.walk);
            sy *= 1 - 0.3 * c.wind + 0.02 * c.wind * sin(c.t * 38) + 0.22 * c.act;
            const sxz = 1 / Math.sqrt(sy);
            sq.scale.set(sxz, sy, sxz);
            sq.position.y = y + 0.1 * c.act;
        }
    };
}
export function boneman(seed: number, archer: boolean): MobRig {
    const K = archer ? 'a' : 's';
    const hipY = 0.45;
    const root = G();
    const hips = at(G(), 0, hipY, 0);
    root.add(hips);
    hips.add(bake('mob.bone.pelvis', (mb) => {
        mb.main.box(0.25, 0.08, 0.14, shade(BONE, -0.1, 0.1, 0.3, 0, 0.07, 0.6), { j: 0.01 });
    }));
    const mkLeg = () => bake('mob.bone.leg', (mb) => {
        const b = mb.main, c = shade(BONE, -hipY * 1.2, 0, 0.35, 0, 0.07, 0.6);
        b.box(0.06, 0.4, 0.06, c, { y: -0.205, j: 0.008 });
        b.box(0.105, 0.05, 0.18, c, { y: -hipY + 0.025, z: 0.05, j: 0.006 });
    });
    const legP = at(mkLeg(), 0.085, 0, 0), legN = at(mkLeg(), -0.085, 0, 0);
    hips.add(legP, legN);
    const torso = at(G(), 0, 0.05, 0);
    hips.add(torso);
    torso.add(bake('mob.bone.torso' + K, (mb) => {
        const b = mb.main, c = shade([BONE[1], BONE[1], BONE[2], BONE[3]], -0.2, 0.4, 0.35, 0, 0.07, 0.6);
        b.box(0.05, 0.32, 0.05, c, { y: 0.16, z: -0.025 });
        for (const [w, y] of [[0.3, 0.13], [0.28, 0.2], [0.24, 0.27]]) b.box(w, 0.04, 0.17, c, { y, v: 0.05, j: 0.008 });
        b.box(0.34, 0.045, 0.08, c, { y: 0.335, z: -0.01 });
        if (archer) {
            b.cyl(0.1, 0.125, 0.07, 6, shade([0x3f7a62, 0x5a9a7a, 0x86cc5c], 0.3, 0.45, 0.3), { y: 0.385, j: 0.01 });
            b.cyl(0.05, 0.042, 0.3, 5, shade(ramp4(0x8f5a36), 0.05, 0.4, 0.3), { x: -0.1, y: 0.22, z: -0.13, rz: 0.28, rx: -0.12 });
        }
    }, seed));
    const mkArm = () => bake('mob.bone.arm', (mb) => {
        const b = mb.main, c = shade(BONE, -0.5, 0, 0.35, 0, 0.07, 0.6);
        b.box(0.05, 0.3, 0.05, c, { y: -0.155 });
        b.oct(0.052, c, { y: -0.315, z: 0.01 });
    });
    const armP = at(mkArm(), 0.19, 0.335, 0), armN = at(mkArm(), -0.19, 0.335, 0);
    torso.add(armP, armN);
    const head = at(G(), 0, 0.385, 0);
    torso.add(head);
    head.add(bake('mob.bone.head', (mb) => {
        const b = mb.main, c = shade(BONE, -0.1, 0.32, 0.3, 0, 0.07, 0.7);
        b.sph(0.17, 6, 4, c, { y: 0.17, sy: 0.92, j: 0.012 });
        b.box(0.15, 0.065, 0.13, c, { y: 0.04, z: 0.035, j: 0.006 });
        eye(b, -0.064, 0.195, 0.134, 0.055, { sy: 1.2 });
        eye(b, 0.064, 0.195, 0.134, 0.055, { sy: 1.2 });
        b.tet(0.024, 0x2a1d2c, { y: 0.135, z: 0.158, rx: PI, ao: false });
    }, seed));
    let tail: THREE.Object3D | null = null, bow: THREE.Object3D | null = null, strU: THREE.Object3D | null = null, strD: THREE.Object3D | null = null, arrow: THREE.Object3D | null = null;
    if (archer) {
        tail = at(bake('mob.scarftail', (mb) => {
            const sc = shade([0x3f7a62, 0x5a9a7a, 0x86cc5c], -0.25, 0, 0.3);
            mb.main.box(0.07, 0.24, 0.016, sc, { y: -0.12, j: 0.006, ao: false });
            mb.main.cone(0.035, 0.07, 3, sc, { y: -0.275, rx: PI, ao: false });
        }, seed), 0.04, 0.37, -0.1);
        torso.add(tail);
        bow = at(G(), 0.36, 0.21, 0.25);
        bow.rotation.y = 0.85;
        torso.add(bow);
        bow.add(bake('mob.bow', (mb) => {
            const b = mb.main, W = shade(ramp4(0x8f5a36), -0.5, 0.5, 0.25, 0, 0.07, 0.3);
            const pts = [[0, 0.5], [0.14, 0.26], [0.16, -0.26], [0, -0.5]];
            for (let i = 0; i < pts.length - 1; i++) b.rod([0, pts[i][1], pts[i][0]], [0, pts[i + 1][1], pts[i + 1][0]], 0.03, 3, i === 1 ? 0x514c63 : W, 0.028, { v: 0.03 });
        }, seed));
        strU = at(G(), 0, 0.5, 0);
        strD = at(G(), 0, -0.5, 0);
        bow.add(strU, strD);
        const half = (dir: number) => bake('mob.bowstring' + dir, (mb) => {
            mb.main.tube(0.01, 0.01, 0.5, 3, 0xf4f0e2, { y: -0.25 * dir, ao: false, v: 0 });
        });
        strU.add(half(1));
        strD.add(half(-1));
        arrow = bake('mob.arrow', (mb) => {
            mb.main.tube(0.016, 0.016, 0.5, 3, 0xe0dac8, { z: 0.05, rx: PI / 2, ao: false, v: 0 });
            mb.main.cone(0.04, 0.1, 3, 0xc4c9dc, { z: 0.34, rx: PI / 2, ao: false });
        }, seed);
        bow.add(arrow);
        arrow.visible = false;
    }
    return {
        root,
        head: 1.2,
        rad: 0.36,
        accent: archer ? 0x86cc5c : 0xe0dac8,
        anim(c) {
            const w = c.walk, f = c.ph * 7.2;
            const sw = sin(f) * 0.62 * w;
            legP.rotation.x = sw;
            legN.rotation.x = -sw;
            hips.position.y = hipY * cos(Math.abs(sw)) - 0.012 * sin(c.t * 1.9) * (1 - w) + 0.015 * c.wind;
            torso.rotation.y = sin(f) * 0.14 * w;
            torso.rotation.x = -0.05 + 0.04 * w + 0.22 * c.act - 0.12 * c.wind;
            head.rotation.x = -0.25 + sin(f * 2) * 0.07 * w + 0.05 * sin(c.t * 1.3) * (1 - w);
            head.rotation.z = sin(f) * 0.05 * w + 0.07 * sin(c.t * 0.9 + 1) * (1 - w);
            if (!archer) {
                armP.rotation.x = -sw * 0.85 - 0.9 * c.wind - 0.7 * c.act;
                armN.rotation.x = sw * 0.85 - 0.9 * c.wind - 0.7 * c.act;
                armP.rotation.z = 0.14 + 0.05 * sin(c.t * 1.7) * (1 - w) + 0.25 * c.wind;
                armN.rotation.z = -0.14 - 0.05 * sin(c.t * 1.7 + 2) * (1 - w) - 0.25 * c.wind;
            } else {
                const pull = c.wind;
                armP.rotation.x = -1.1 + sw * 0.1;
                armP.rotation.z = 0.55;
                armN.rotation.x = -1.2 * pull + sw * 0.85 * (1 - pull) - 0.1 * pull;
                armN.rotation.z = -0.14 + 0.6 * pull;
                bow!.position.y = 0.21 + sw * 0.02;
                const a = 0.5 * pull;
                strU!.rotation.x = a;
                strD!.rotation.x = -a;
                arrow!.visible = pull > 0.3;
                arrow!.position.z = -0.5 * Math.sin(a) * 0.9;
                tail!.rotation.x
 = 0.15 + sin(c.t * 3 + 1) * 0.1 + 0.35 * w;
            }
        }
    };
}
export function bat(seed: number): MobRig {
    const B = ramp4(0x7a64a0);
    const root = G(), fly = at(G(), 0, 0.55, 0);
    root.add(fly);
    const body = G();
    fly.add(body);
    body.add(bake('mob.bat', (mb) => {
        const b = mb.main, c = shade([B[0], B[1], B[1], B[2]], -0.2, 0.2, 0.3, 4, 0.08, 0.7);
        b.sph(0.2, 7, 5, c, { sy: 0.95, sz: 1, j: 0.014 });
        for (const s of [-1, 1]) b.cone(0.065, 0.16, 4, B[2], { x: s * 0.11, y: 0.22, z: -0.01, rz: -s * 0.22, ry: 0.78, j: 0.006 });
        for (const s of [-1, 1]) b.tet(0.032, 0xfffbf4, { x: s * 0.05, y: -0.11, z: 0.17, rx: PI, ao: false });
        for (const s of [-1, 1]) eye(b, s * 0.085, 0.045, 0.172, 0.05, { color: 0xe85d62, sy: 1.15, rx: -0.3 });
        b.tet(0.024, 0xf59a96, { y: -0.025, z: 0.2, ao: false });
    }, seed));
    const wing = (s: number) => bake('mob.batwing' + s, (mb) => {
        const k = 0.85;
        const P = (x: number, y: number, z: number) => [x * s * k, y, z * k];
        const S = P(0, 0, 0.05), W = P(0.3, 0.05, 0.02), T1 = P(0.66, 0.02, -0.1), N1 = P(0.52, 0, -0.1), T2 = P(0.5, -0.02, -0.26), N2 = P(0.37, -0.01, -0.2), T3 = P(0.26, -0.02, -0.3), R = P(0.06, -0.01, -0.2);
        sheet(mb.main, [[W, T1, N1], [W, N1, T2], [W, T2, N2], [W, N2, T3], [W, T3, R], [W, R, S]], (x: number, _y: number, z: number) => B[Math.max(0, Math.min(3, Math.round(1.6 + (-Math.abs(x) * 0.3 + z) * 1.2 + (z > -0.1 ? 0.8 : 0))))]);
        mb.main.rod(S, W, 0.02, 4, B[0], 0.016, { ao: false });
    }, seed);
    const wP = at(wing(1), 0.1, 0.06, 0), wN = at(wing(-1), -0.1, 0.06, 0);
    fly.add(wP, wN);
    return {
        root,
        head: 0.8,
        rad: 0.5,
        accent: 0xb48cec,
        anim(c) {
            const rate = c.moving ? 28 : 21;
            const a = sin(c.t * rate);
            const amp = 0.62 + 0.15 * c.walk;
            wP.rotation.z = a * amp + 0.12;
            wN.rotation.z = -a * amp - 0.12;
            wP.rotation.y = -0.18 * a;
            wN.rotation.y = 0.18 * a;
            fly.position.y = 0.55 + 0.045 * sin(c.t * rate * 0.5 + 1.2) + 0.04 * sin(c.t * 1.3) - 0.08 * c.wind;
            body.rotation.x = -0.3 + 0.55 * c.walk + 0.3 * c.act - 0.35 * c.wind + 0.05 * sin(c.t * 2);
            body.rotation.z = 0.12 * sin(c.t * 1.7 + 0.6) * (0.4 + c.walk);
        }
    };
}
export function boar(seed: number): MobRig {
    const R = ramp4(0x8f5a36), D = ramp4(0x4a2f2a);
    const root = G();
    const bodyG = at(G(), 0, 0.42, 0);
    root.add(bodyG);
    bodyG.add(bake('mob.boar.body', (mb) => {
        const b = mb.main, c = shade([R[0], R[1], R[1], R[2], R[3]], -0.3, 0.3, 0.35, 2, 0.08, 0.7);
        b.sph(1, 8, 5, c, { sx: 0.4, sy: 0.3, sz: 0.43, y: 0, z: -0.03, j: 0.025 });
        b.ico(0.3, 0, c, { y: 0.08, z: 0.15, sx: 1.2, sy: 0.9, j: 0.02 });
        b.hull([[-0.045, 0.2, -0.4], [0.045, 0.2, -0.4], [-0.05, 0.25, 0.2], [0.05, 0.25, 0.2], [0, 0.31, -0.35], [0, 0.4, 0.1], [0, 0.33, 0.22]], D[1], { v: 0.05, ao: false });
        b.cone(0.025, 0.12, 3, 0xe8a0a8, { y: 0.07, z: -0.52, rx: -2.2, ao: false });
    }, seed));
    const head = at(G(), 0, 0.02, 0.4);
    bodyG.add(head);
    head.add(bake('mob.boar.head', (mb) => {
        const b = mb.main, c = shade([R[1], R[1], R[2], R[3]], -0.2, 0.22, 0.3, 5, 0.08, 0.6);
        b.sph(0.24, 7, 5, c, { y: 0, z: 0.06, sy: 0.95, j: 0.014 });
        b.cyl(0.1, 0.125, 0.15, 6, 0xf0a8b0, { y: -0.04, z: 0.26, rx: PI / 2, j: 0.006, v: 0.03 });
        for (const s of [-1, 1]) {
            b.cone(0.036, 0.16, 3, 0xfffbf4, { x: s * 0.12, y: -0.1, z: 0.23, rx: 0.5, rz: -s * 0.35, ao: false, v: 0.03 });
            b.cone(0.085, 0.17, 4, D[1], { x: s * 0.14, y: 0.17, z: 0, rz: -s * 0.5, rx: 0.1, v: 0.05 });
            eye(b, s * 0.11, 0.09, 0.19, 0.055, { sy: 1.15, rx: -0.5 });
        }
    }, seed));
    const legGeo = (key: string, cc: number[]) => bake(key, (mb) => {
        mb.main.box(0.1, 0.34, 0.1, (_x, y) => y < -0.28 ? D[0] : cc[y > -0.1 ? 2 : 1], { y: -0.17, j: 0.008 });
    }, seed);
    const legs = [[-1, 1, 0], [1, 1, 1], [-1, -1, 1], [1, -1, 0]].map(([sx, sz, ph]) => {
        const g = at(legGeo('mob.boar.leg', R), sx * 0.2, 0.34, sz * 0.26);
        root.add(g);
        return { g, ph, sz };
    });
    return {
        root,
        head: 0.72,
        rad: 0.5,
        accent: 0xf8a24a,
        anim(c) {
            const gait = 1 + 0.9 * c.act, f = c.ph * 9 * gait, w = c.walk;
            for (let i = 0; i < 4; i++) legs[i].g.rotation.x = sin(f + legs[i].ph * PI) * 0.7 * w;
            const paw = c.wind * (0.5 + 0.5 * sin(c.t * 16));
            legs[0].g.rotation.x = legs[0].g.rotation.x * (1 - c.wind) - 0.2 * c.wind - paw * 0.9;
            legs[1].g.rotation.x = legs[1].g.rotation.x * (1 - c.wind * 0.6);
            bodyG.position.y = 0.42 + 0.03 * Math.abs(sin(f)) * w + 0.01 * sin(c.t * 2) * (1 - w) - 0.04 * c.act;
            bodyG.rotation.x = -0.14 * c.wind + 0.12 * c.act + 0.03 * sin(f * 2) * w;
            bodyG.rotation.z = 0.04 * sin(f) * w;
            head.rotation.x = -0.2 + 0.07 * sin(f * 2 + 1) * w + 0.04 * sin(c.t * 1.6) * (1 - w) + 0.55 * c.wind + 0.5 * c.act;
            head.position.y = 0.02 - 0.04 * c.act - 0.03 * c.wind;
        }
    };
}
export const SMALL_BUILD = {
    slime,
    skeleton: (s: number) => boneman(s, false),
    archer: (s: number) => boneman(s, true),

    bat,
    boar
};

// Monster models: scarab, wisp, rockling, frostling, bog toad, wraith and knight.
import * as THREE from 'three';
import { cos, EYE, eyeOn, frac, keys, type MobRig, onEll, PI, ramp4, shade, sin } from './mobs-rig';
import { at, bake, TAU } from './kit';

export const G = () => new THREE.Group();
export const TOAD_SY = [[0, 1], [0.22, 0.72], [0.32, 1.22], [0.6, 1.05], [0.72, 0.88], [0.8, 0.74], [1, 1]];
export const TOAD_EXT = [[0, 0], [0.22, -0.5], [0.32, 0.85], [0.6, 0.5], [0.74, -0.2], [1, 0]];
export function scarab(seed: number): MobRig {
    const B = [0x1f5a90, 0x2d7ac0, 0x4ab2cf, 0x9ae0ee], GOLD = [0xb8741a, 0xe0a020, 0xffd966, 0xfff3b0];
    const root = G(), bodyG = at(G(), 0, 0.13, 0);
    root.add(bodyG);
    bodyG.add(bake('mob.scarab.front', (mb) => {
        const b = mb.main;
        b.ico(0.16, 0, shade(B, 0, 0.3, 0.3, 1, 0.1, 0.6), { y: 0.03, z: 0.2, sx: 1.15, sy: 0.75, sz: 1, j: 0.012 });
        b.ico(0.12, 0, shade([0x153a60, 0x1f5a90, 0x2d7ac0], -0.1, 0.2, 0.3), { y: 0, z: 0.37, sy: 0.85, j: 0.01 });
        for (const s of [-1, 1]) {
            b.oct(0.06, GOLD[2], { x: s * 0.075, y: 0.04, z: 0.46, sy: 1.1, sz: 0.8, ao: false, v: 0.02 });
            b.cone(0.022, 0.12, 3, B[3], { x: s * 0.07, y: -0.02, z: 0.5, rx: PI / 2 - 0.2, rz: s * 0.4, ao: false });
            b.rod([s * 0.05, 0.1, 0.43], [s * 0.1, 0.21, 0.56], 0.008, 3, GOLD[1], 0.006, { ao: false });
        }
        b.box(0.1, 0.016, 0.1, GOLD[1], { y: 0.12, z: 0.2, ao: false, v: 0.03 });
    }, seed));
    const half = (s: number) => bake('mob.scarab.shell' + s, (mb) => {
        const b = mb.main, c = shade(B, 0, 0.26, 0.35, 2, 0.1, 0.6);
        b.dome(1, 1, 7, 3, c, { x: s * 0.14, sx: 0.17, sz: 0.34, sy: 0.24, j: 0.014 });
        b.box(0.02, 0.012, 0.3, GOLD[2], { x: s * 0.15, y: 0.25, z: -0.01, rz: s * -0.2, ao: false, v: 0.02 });
    }, seed);
    const shellP = at(half(1), 0.02, 0.03, 0.02), shellN = at(half(-1), -0.02, 0.03, 0.02);
    bodyG.add(shellP, shellN);
    const legs = (flip: number) => bake('mob.scarab.legs' + flip, (mb) => {
        const b = mb.main;
        for (const [side, zz] of [[-1, 0.18], [1, 0], [-1, -0.17]]) {
            const s = side * flip, dz = zz > 0.1 ? 0.08 : zz < -0.1 ? -0.08 : 0.03;
            b.rod([s * 0.14, 0.02, zz], [s * 0.34, -0.11, zz + dz], 0.017, 3, B[0], 0.011, { ao: false });
        }
    }, seed);
    const tripA = legs(1), tripB = legs(-1);
    bodyG.add(tripA, tripB);
    return {
        root,
        head: 0.34,
        rad: 0.38,
        accent: 0x4ab2cf,
        anim(c) {
            const f = c.ph * 16, w = c.walk;
            const a = sin(f), b = -a;
            tripA.position.z = a * 0.045 * w;
            tripB.position.z = b * 0.045 * w;
            tripA.position.y = Math.max(0, cos(f)) * 0.03 * w;
            tripB.position.y = Math.max(0, -cos(f)) * 0.03 * w;
            tripA.rotation.y = a * 0.12 * w;
            tripB.rotation.y = b * 0.12 * w;
            bodyG.position.y = 0.13 + 0.008 * sin(f * 2) * w - 0.03 * c.wind;
            bodyG.rotation.z = sin(f) * 0.04 * w;
            bodyG.rotation.x = -0.18 * c.wind + 0.1 * c.act;
            const tw = Math.pow(Math.max(0, sin(c.t * 1.3 + seed)), 14) + 0.7 * c.wind;
            shellP.rotation.z = -0.26 * tw - 0.01;
            shellN.rotation.z = 0.26 * tw + 0.01;
            shellP.rotation.x = -0.1 * tw;
            shellN.rotation.x = -0.1 * tw;
        }
    };
}
export const haloMat = new THREE.MeshBasicMaterial({ color: 0x60d040, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending });
export const HALO_GEO = new THREE.IcosahedronGeometry(1, 1);
export function wisp(seed: number): MobRig {
    const F = [0x2a6a2a, 0x3a8a30, 0x4aa03a, 0x5cb04f];
    const root = G(), fly = at(G(), 0, 0.5, 0);
    root.add(fly);
    const body = G();
    fly.add(body);
    body.add(bake('mob.wisp', (mb) => {
        const g = mb.glow(0x40c020, 1.5);
        g.lathe([[0.0001, -0.22], [0.1, -0.2], [0.2, -0.1], [0.25, 0.04], [0.21, 0.18], [0.12, 0.3], [0.05, 0.4], [0.0001, 0.5]], 8, shade(F, -0.22, 0.45, 0.25, 6, 0.05, 0.3), { j: 0.015, ao: false, v: 0.04 });
        const b = mb.main, E = { cy: 0, rx: 0.25, ry: 0.3, rz: 0.25 };
        for (const s of [-1, 1]) eyeOn(b, E, s * 0.095, 0.13, 0.078, { sy: 1.25, flat: 0.5, out: 0.01 });
        const mo = onEll(E, 0, 0);
        b.box(0.1, 0.026, 0.02, 0x7a3a46, { y: 0, z: mo.z, rx: mo.rx - 0.2, ao: false, v: 0 });
    }, seed));
    const halo = new THREE.Mesh(HALO_GEO, haloMat);
    halo.scale.set(0.42, 0.5, 0.42);
    halo.position.y = 0.04;
    halo.renderOrder = 3;
    halo.userData.noFlash = true;
    body.add(halo);
    const tongue = (k: number) => bake('mob.wisp.tongue' + k, (mb) => {
        mb.glow(0x40c020, 1.5).cone(0.07 - k * 0.012, 0.3 - k * 0.07, 5, 0x4aa03a, { y: (0.3 - k * 0.07) / 2, ao: false, v: 0.03 });
    }, seed);
    const t1 = at(tongue(0), 0, 0.36, 0), t2 = at(tongue(1), 0.06, 0.28, 0);
    body.add(t1, t2);
    const mkSpark = () => bake('mob.wisp.spark', (mb) => {
        mb.glow(0xb4f070, 2).tet(0.04, 0xb4f070, { ao: false, v: 0 });
    }, seed);
    const sp = [mkSpark(), mkSpark(), mkSpark()];
    for (const g of sp) fly.add(g);
    const haloBase = new THREE.Vector3(0.42, 0.5, 0.42);
    return {
        root,
        head: 1,
        rad: 0.45,
        accent: 0xb4e47a,
        anim(c) {
            const fl = 1 + 0.05 * sin(c.t * 9) + 0.03 * sin(c.t * 15.3) + 0.12 * c.wind * sin(c.t * 22);
            const k = 1 + 0.18 * c.wind;
            body.scale.set(k / Math.sqrt(fl), fl * (1 + 0.15 * c.wind), k / Math.sqrt(fl));
            halo.scale.copy(haloBase).multiplyScalar(1 + 0.14 * c.wind + 0.06 * sin(c.t * 7));
            fly.position.y = 0.5 + 0.06 * sin(c.t * 1.9) + 0.015 * sin(c.t * 5.1) - 0.04 * c.wind;
            body.rotation.x = 0.2 * c.walk + 0.25 * c.act - 0.1 * c.wind;
            body.rotation.z = 0.07 * sin(c.t * 1.4);
            t1.rotation.z = 0.25 * sin(c.t * 5) + 0.2 * c.walk;
            t1.rotation.x = -0.4 * c.walk + 0.15 * sin(c.t * 4 + 1);
            t2.rotation.z = -0.35 * sin(c.t * 6 + 2);
            t2.rotation.x = 0.1 * sin(c.t * 5);
            for (let i = 0; i < 3; i++) {
                const g = sp[i], a = c.t * (1.4 + i * 0.35) + i * 2.1, r = 0.38 + 0.06 * i;
                g.position.set(cos(a) * r, 0.1 + 0.18 * sin(a * 1.3 + i), sin(a) * r);
                g.scale.setScalar(0.55 + 0.45 * Math.abs(sin(c.t * 4 + i * 1.7)));
            }
        }
    };
}
export function rockling(seed: number): MobRig {
    const S = [0x585c7c, 0x7a7f9e, 0x9ea4bf, 0xc4c9dc, 0xe4e7f2];
    const root = G(), bodyG = at(G(), 0, 0.2, 0);
    root.add(bodyG);
    bodyG.add(bake('mob.rockling', (mb) => {
        const b = mb.main, c = shade(S, -0.35, 0.8, 0.45, 8, 0.09, 0.7);
        b.ico(0.5, 1, c, { y: 0.31, sx: 1.05, sy: 0.88, sz: 0.95, j: 0.075 });
        b.ico(0.2, 0, c, { x: -0.22, y: 0.64, z: -0.08, sy: 0.8, j: 0.03 });
        b.ico(0.16, 0, c, { x: 0.26, y: 0.58, z: -0.06, sy: 0.8, j: 0.03 });
        const E = { cy: 0.31, rx: 0.52, ry: 0.44, rz: 0.48 };
        const brow = onEll(E, 0, 0.5);
        b.box(0.5, 0.08, 0.14, S[1], { y: 0.5, z: brow.z - 0.01, rx: brow.rx, j: 0.012, v: 0.05 });
        for (let i = 0; i < 4; i++) b.cone(0.045, 0.17, 3, [0x3f8a4c, 0x5cb04f, 0x86cc5c, 0x5cb04f][i], { x: -0.12 + i * 0.05, y: 0.8 - Math.abs(i - 1.5) * 0.02, z: -0.16 + i % 2 * 0.07, rz: (i - 1.5) * 0.25, ao: false, v: 0.05 });
        const g = mb.glow(0xe8801e, 1.6);
        for (const s of [-1, 1]) {
            const p = onEll(E, s * 0.17, 0.4);
            g.box(0.15, 0.13, 0.07, 0xf09030, { x: s * 0.17, y: 0.4, z: p.z + 0.01, rx: p.rx, ao: false, v: 0.02, j: 0.004 });
        }
        const mo = onEll(E, 0, 0.24);
        b.box(0.2, 0.04, 0.04, S[0], { y: 0.24, z: mo.z, rx: mo.rx, ao: false, v: 0 });
    }, seed));
    const arm = () => bake('mob.rockling.arm', (mb) => {
        mb.main.ico(0.17, 0, shade(S, -0.5, 0.2, 0.4, 3, 0.07, 0.6), { y: -0.2, sy: 1.7, j: 0.035 });
    }, seed);
    const armP = at(arm(), 0.5, 0.52, 0.02), armN = at(arm(), -0.5, 0.52, 0.02);
    bodyG.add(armP, armN);
    const foot = () => bake('mob.rockling.foot', (mb) => {
        mb.main.box(0.22, 0.16, 0.3, shade(S, -0.1, 0.16, 0.4, 5, 0.07, 0.6), { y: 0.08, j: 0.03 });
    }, seed);
    const footP = at(foot(), 0.2, 0, 0.02), footN = at(foot(), -0.2, 0, 0.02);
    root.add(footP, footN);
    return {
        root,
        head: 0.95,
        rad: 0.58,
        accent: 0xf8a24a,
        anim(c) {
            const f = c.ph * 4.4, w = c.walk;
            const sP = sin(f), sN = -sP;
            footP.position.y = Math.max(0, cos(f)) * 0.1 * w;
            footN.position.y = Math.max(0, -cos(f)) * 0.1 * w;
            footP.position.z = 0.02 + sP * 0.07 * w;
            footN.position.z = 0.02 + sN * 0.07 * w;
            const land = Math.pow(Math.max(0, 1 - Math.abs(cos(f))), 3) * w;
            bodyG.position.y = 0.2 + 0.04 * Math.abs(cos(f)) * w - 0.03 * land + 0.01 * sin(c.t * 1.6) * (1 - w) + 0.04 * c.wind;
            const sq = 1 - 0.05 * land + 0.03 * sin(c.t * 1.6) * (1 - w) - 0.08 * c.wind;
            bodyG.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
            bodyG.rotation.z = 0.09 * sin(f) * w;
            bodyG.rotation.x = 0.05 * w + 0.12 * c.act - 0.1 * c.wind;
            armP.rotation.x = -sP * 0.55 * w - 1.2 * c.wind - 0.6 * c.act;
            armN.rotation.x = -sN * 0.55 * w - 1.2 * c.wind - 0.6 * c.act;
            armP.rotation.z = 0.15 + 0.3 * c.wind;
            armN.rotation.z = -0.15 - 0.3 * c.wind;
        }
    };
}
export function frostling(seed: number): MobRig {
    const I = [0x5a8fb8, 0x8ac4e0, 0xbce8f4, 0xe8fbff];
    const root = G(), bodyG = at(G(), 0, 0.03, 0);
    root.add(bodyG);
    bodyG.add(bake('mob.frostling', (mb) => {
        const b = mb.main;
        b.lathe([[0.0001, 0], [0.26, 0], [0.25, 0.08], [0.2, 0.22], [0.14, 0.34], [0.1, 0.4]], 8, shade([I[2], I[2], I[3], I[3]], 0, 0.4, 0.3, 4, 0.08, 0.5), { j: 0.015 });
        b.sph(0.215, 7, 5, shade([I[1], I[2], I[2], I[3]], 0.3, 0.8, 0.28, 5, 0.1, 0.6), { y: 0.57, sy: 0.96, j: 0.014 });
        const E = { cy: 0.57, rx: 0.215, ry: 0.206, rz: 0.215 };
        for (const s of [-1, 1]) eyeOn(b, E, s * 0.085, 0.6, 0.064, { sy: 1.3, out: 0.01 });
        b.box(0.08, 0.02, 0.02, I[0], { y: 0.5, z: 0.205, ao: false, v: 0 });
        for (const s of [-1, 1]) b.oct(0.05, 0xf79fc6, { x: s * 0.15, y: 0.5, z: 0.14, sz: 0.5, ao: false, v: 0.02 });
        const g = mb.glow(0xaee8f0, 1.5);
        const sp = [[0, 0.76, 0, 0.3], [-0.12, 0.73, 0.02, 0.2], [0.12, 0.73, 0.02, 0.2], [-0.07, 0.72, -0.1, 0.18], [0.08, 0.72, -0.09, 0.17]];
        for (const [x, y, z, h] of sp) g.cone(0.055, h, 3, (_x, yy) => yy > y + h * 0.4 ? 0xe8fbff : 0xbce8f4, { x, y: y + h / 2 - 0.02, z, rz: -x * 1.2, rx: z * 1.5, ao: false, v: 0.03, j: 0.004 });
    }, seed));
    const mitt = () => bake('mob.frostling.mitt', (mb) => {
        mb.main.ico(0.065, 0, shade(I, -0.05, 0.1, 0.3, 6, 0.07, 0.6), { j: 0.01 });
    }, seed);
    const handP = at(mitt(), 0.3, 0.33, 0.06), handN = at(mitt(), -0.3, 0.33, 0.06);
    bodyG.add(handP, handN);
    const flake = bake('mob.frostling.flake', (mb) => {
        mb.glow(0xe8fbff, 2).oct(0.04, 0xe8fbff, { sy: 1.3, ao: false, v: 0 });
    }, seed);
    bodyG.add(flake);
    return {
        root,
        head: 1,
        rad: 0.4,
        accent: 0x8ac4e0,
        anim(c) {
            const w = c.walk;
            bodyG.position.y = 0.03 + 0.03 * sin(c.t * 2.3) + 0.02 * sin(c.ph * 5) * w - 0.03 * c.wind;
            bodyG.rotation.z = 0.1 * sin(c.t * 1.7) * (0.5 + w) + 0.06 * sin(c.ph * 4.4) * w;
            bodyG.rotation.x = 0.12 * w + 0.1 * c.act - 0.12 * c.wind;
            handP.position.set(0.3 + 0.04 * sin(c.t * 2.5), 0.33 + 0.2 * c.wind + 0.03 * sin(c.t * 3), 0.06 + 0.12 * c.wind);
            handN.position.set(-0.3 - 0.04 * sin(c.t * 2.5 + 1), 0.33 + 0.2 * c.wind + 0.03 * sin(c.t * 3 + 1), 0.06 + 0.12 * c.wind);
            const a = c.t * 1.6;
            flake.position.set(cos(a) * 0.4, 0.55 + 0.1 * sin(a * 2), sin(a) * 0.4);
            flake.rotation.y = c.t * 3;
            flake.scale.setScalar(0.6 + 0.4 * Math.abs(sin(c.t * 3.1)));
        }
    };
}
export function bogtoad(seed: number): MobRig {
    const G4 = ramp4(0x5cb04f), BELLY = 0xcfe89a;
    const root = G(), sq = G();
    root.add(sq);
    sq.add(bake('mob.toad', (mb) => {
        const b = mb.main, c = shade([G4[0], G4[1], G4[1], G4[2], G4[3]], 0, 0.5, 0.4, 7, 0.1, 0.7);
        const E = { cy: 0.23, rx: 0.48, ry: 0.25, rz: 0.43 };
        b.ico(1, 1, c, { y: 0.23, sx: 0.48, sy: 0.25, sz: 0.43, j: 0.03 });
        b.oct(0.06, G4[0], { x: -0.15, y: 0.4, z: -0.12, sy: 0.7, ao: false, v: 0.03 });
        const mo = onEll(E, 0, 0.2);
        b.box(0.46, 0.035, 0.05, 0x2f5a30, { y: 0.2, z: mo.z - 0.01, rx: mo.rx, ao: false, v: 0 });
        for (const s of [-1, 1]) {
            b.sph(0.1, 6, 4, shade([0xb89a20, 0xe0b820, 0xffd966, 0xfff3b0], 0.3, 0.6, 0.2, 2, 0.07, 0.4), { x: s * 0.17, y: 0.44, z: 0.22, j: 0.006 });
            b.oct(0.062, EYE, { x: s * 0.17, y: 0.45, z: 0.3, sz: 0.55, sy: 1.3, ao: false, v: 0.02 });
            b.tet(0.026, 0xffffff, { x: s * 0.17 - 0.02, y: 0.47, z: 0.325, ao: false, v: 0, j: 0 });
        }
    }, seed));
    const throat = at(bake('mob.toad.throat', (mb) => {
        mb.main.ico(0.14, 0, shade([0xb4d47a, BELLY, 0xe8f4b4], -0.1, 0.12, 0.3, 3, 0.05, 0.4), { j: 0.015 });
    }, seed), 0, 0.15, 0.34);
    sq.add(throat);
    const thigh = () => bake('mob.toad.thigh', (mb) => {
        const b = mb.main;
        b.ico(0.17, 0, shade(G4, -0.15, 0.2, 0.4, 5, 0.07, 0.6), { sx: 0.8, sy: 1, sz: 1.2, j: 0.02 });
        b.box(0.16, 0.05, 0.26, G4[1], { x: 0.02, y: -0.14, z: 0.1, j: 0.01 });
    }, seed);
    const thP = at(thigh(), 0.3, 0.17, -0.12), thN = at(thigh(), -0.3, 0.17, -0.12);
    sq.add(thP, thN);
    const frontLeg = () => bake('mob.toad.fleg', (mb) => {
        mb.main.box(0.09, 0.2, 0.12, G4[1], { y: -0.1, z: 0.02, j: 0.01 });
    }, seed);
    const fP = at(frontLeg(), 0.22, 0.2, 0.3), fN = at(frontLeg(), -0.22, 0.2, 0.3);
    sq.add(fP, fN);
    let hop = 0;
    return {
        root,
        head: 0.58,
        rad: 0.5,
        accent: 0x86cc5c,
        anim(c) {
            const rate = 1.35, prev = hop;
            if (c.moving) hop += c.dt * rate;
            else if (hop % 1 > 0.0001) {
                hop += c.dt * rate * 1.4;
                if (Math.floor(hop) > Math.floor(prev)) hop = Math.floor(hop);
            }
            const p = frac(hop);
            let sy = keys(p, TOAD_SY);
            const y = p > 0.24 && p < 0.74 ? 0.3 * sin(PI * (p - 0.24) / 0.5) : 0;
            sy *= 1 + 0.03 * sin(c.t * 2.2) * (1 - c.walk);
            sy *= 1 - 0.14 * c.wind + 0.015 * c.wind * sin(c.t * 30) + 0.1 * c.act;
            const sxz = 1 / Math.sqrt(sy);
            sq.scale.set(sxz, sy, sxz);
            sq.position.y = y;
            const ext = keys(p, TOAD_EXT);
            thP.rotation.x = ext * 0.7;
            thN.rotation.x = ext * 0.7;
            thP.scale.set(1, 1 + 0.18 * ext, 1 + 0.25 * ext);
            thN.scale.copy(thP.scale);
            fP.rotation.x = -ext * 0.5;
            fN.rotation.x = -ext * 0.5;
            const puff = 1 + 0.12 * sin(c.t * 3.1) + 0.9 * c.wind;
            throat.scale.set(puff, 0.9 + 0.55 * c.wind + 0.06 * sin(c.t * 3.1), puff);
            throat.position.y = 0.15 - 0.02 * c.wind;
        }
    };
}
export function wraith(seed: number): MobRig {
    const R = [0x4a4278, 0x6a56a0, 0x8b5cc8, 0xb48cec];
    const root = G(), fly = at(G(), 0, 0.42, 0);
    root.add(fly);
    const body = G();
    fly.add(body);
    body.add(bake('mob.wraith', (mb) => {
        const b = mb.main, c = shade([R[0], R[1], R[1], R[2], R[3]], -0.3, 0.75, 0.4, 3, 0.1, 0.6);
        b.lathe([[0.0001, -0.25], [0.26, -0.22], [0.3, -0.06], [0.25, 0.12], [0.19, 0.28]], 8, c, { j: 0.02 });
        b.sph(0.24, 8, 5, c, { y: 0.45, sy: 1.12, j: 0.018 });
        b.cone(0.15, 0.24, 5, c, { y: 0.72, z: -0.1, rx: -0.45, j: 0.012 });
        const E = { cy: 0.45, rx: 0.24, ry: 0.27, rz: 0.24 };
        const fz = onEll(E, 0, 0.45);
        b.ico(0.17, 0, 0x231d3c, { y: 0.45, z: fz.z - 0.1, sx: 1, sy: 1.05, sz: 0.8, rx: -0.3, ao: false, j: 0.008, v: 0.02 });
        const g = mb.glow(0x6ad8e0, 1.5);
        for (const s of [-1, 1]) {
            const p = onEll(E, s * 0.08, 0.5);
            g.ico(0.065, 0, 0x8ae8f0, { x: s * 0.08, y: 0.5, z: p.z - 0.01, sy: 1.25, sz: 0.5, rx: p.rx, ao: false, v: 0.02 });
        }
    }, seed));
    const hem = (k: number) => bake('mob.wraith.hem' + k, (mb) => {
        const n = 3;
        for (let i = 0; i < n; i++) {
            const a = (i + k * 0.5) / n * TAU * 0.5 + (k ? PI : 0) + 0.4, r = 0.25, len = 0.26 + 0.1 * ((i + k) % 2);
            mb.main.cone(0.095, len, 3, shade([R[0], R[1], R[2]], -0.3, -0.1, 0.4, i + 3 * k), { x: Math.cos(a) * r, y: -0.22 - len / 2 + 0.05, z: Math.sin(a) * r, rx: PI, ry: a, j: 0.012 });
        }
    }, seed);
    const hem1 = hem(0), hem2 = hem(1);
    body.add(hem1, hem2);
    const tails = [0, 1].map((k) => at(bake('mob.wraith.tail' + k, (mb) => {
        mb.main.cone(0.085 - k * 0.02, 0.7 - k * 0.15, 3, shade([R[1], R[2], R[3]], -0.5, 0, 0.3, k, 0.07, 0.3), { y: 0, z: -0.36, rx: -PI / 2 + 0.25, ao: false, j: 0.01 });
    }, seed), k ? 0.12 : -0.12, -0.12, -0.18));
    for (const t2 of tails) body.add(t2);
    const sleeve = (s: number) => bake('mob.wraith.sleeve' + s, (mb) => {
        mb.main.cone(0.1, 0.34, 5, shade(R, -0.34, 0, 0.4, 2, 0.07, 0.6), { y: -0.17, rx: PI, j: 0.012 });
        mb.main.oct(0.075, 0xcdd9f4, { y: -0.36, ao: false, v: 0.03 });
    }, seed);
    const armP = at(sleeve(1), 0.27, 0.22, 0.04), armN = at(sleeve(-1), -0.27, 0.22, 0.04);
    body.add(armP, armN);
    const gl = bake('mob.wraith.orb', (mb) => {
        mb.glow(0x9a6ae0, 1.6).oct(0.07, 0xb48cec, { ao: false, v: 0 });
    }, seed);
    gl.visible = false;
    body.add(gl);
    return {
        root,
        head: 1.2,
        rad: 0.45,
        accent: 0xb48cec,
        anim(c) {
            const w = c.walk;
            fly.position.y = 0.42 + 0.06 * sin(c.t * 1.8) + 0.02 * sin(c.t * 4.3) - 0.03 * c.wind;
            body.rotation.x = 0.2 * w + 0.25 * c.act - 0.12 * c.wind;
            body.rotation.z = 0.08 * sin(c.t * 1.3) + 0.06 * sin(c.ph * 3.1) * w;
            body.rotation.y = 0.08 * sin(c.t * 0.9);
            hem1.rotation.x = 0.16 * sin(c.t * 3.1) + 0.2 * w;
            hem1.rotation.z = 0.12 * sin(c.t * 2.3 + 1);
            hem2.rotation.x = 0.16 * sin(c.t * 3.1 + 2.1) + 0.2 * w;
            hem2.rotation.z = 0.12 * sin(c.t * 2.7 + 3);
            hem1.scale.y = 1 + 0.12 * sin(c.t * 3.7);
            hem2.scale.y = 1 + 0.12 * sin(c.t * 3.7 + 2);
            for (let i = 0; i < 2; i++) {
                tails[i].rotation.y = (i ? 0.35 : -0.35) + 0.3 * sin(c.t * 2.6 + i * 2) * (0.6 + w);
                tails[i].rotation.x = -0.1 + 0.15 * sin(c.t * 3.1 + i) - 0.3 * w;
            }
            armP.rotation.x = -0.35 - 0.7 * c.wind - 0.2 * c.act + 0.08 * sin(c.t * 2 + 1);
            armN.rotation.x = -0.35 - 0.7 * c.wind - 0.2 * c.act + 0.08 * sin(c.t * 2.3);
            armP.rotation.z = -0.4 - 0.2 * c.wind + 0.05 * sin(c.t * 1.5);
            armN.rotation.z = 0.4 + 0.2 * c.wind - 0.05 * sin(c.t * 1.5 + 1);
            gl.visible = c.wind > 0.15;
            gl.position.set(0, 0.2 + 0.05 * sin(c.t * 8), 0.42);
            gl.scale.setScalar(c.wind * (1 + 0.25 * sin(c.t * 14)));
        }
    };
}
export function knight(seed: number): MobRig {
    const A = [0x7a809c, 0x9ea4bf, 0xc4c9dc, 0xe8ecf6], RED = [0xc9505a, 0xe85d62, 0xf59a96];
    const root = G(), hipY = 0.5;
    const hips = at(G(), 0, hipY, 0);
    root.add(hips);
    hips.add(bake('mob.knight.hips', (mb) => {
        const b = mb.main;
        b.box(0.3, 0.12, 0.2, shade(A, -0.1, 0.2, 0.3, 1, 0.08, 0.7), { y: 0, j: 0.01 });
        b.box(0.34, 0.1, 0.22, shade(A, -0.2, 0.1, 0.3, 2, 0.08, 0.7), { y: -0.09, j: 0.01 });
    }, seed));
    const leg = () => bake('mob.knight.leg', (mb) => {
        const b = mb.main, c = shade(A, -hipY * 1.4, 0, 0.35, 3, 0.08, 0.7);
        b.box(0.12, 0.38, 0.13, c, { y: -0.27, j: 0.008 });
        b.oct(0.085, A[2], { y: -0.29, z: 0.06, sy: 0.9 });
        b.box(0.14, 0.09, 0.24, shade(A, -hipY, -0.3, 0.3, 4), { y: -hipY + 0.045 + 0.07, z: 0.04, j: 0.008 });
    }, seed);
    const legP = at(leg(), 0.1, -0.07, 0), legN = at(leg(), -0.1, -0.07, 0);
    hips.add(legP, legN);
    const torso = at(G(), 0, 0.03, 0);
    hips.add(torso);
    torso.add(bake('mob.knight.torso', (mb) => {
        const b = mb.main, c = shade(A, -0.3, 0.5, 0.3, 5, 0.09, 0.7);
        b.hull([[-0.17, 0, -0.1], [0.17, 0, -0.1], [0.17, 0, 0.1], [-0.17, 0, 0.1], [-0.23, 0.38, -0.12], [0.23, 0.38, -0.12], [0.23, 0.38, 0.13], [-0.23, 0.38, 0.13]], c, { j: 0.008 });
        b.box(0.04, 0.3, 0.02, A[3], { y: 0.2, z: 0.135, ao: false, v: 0.03 });
        for (const s of [-1, 1]) b.ico(0.13, 0, shade(A, 0.3, 0.55, 0.3, 6, 0.07, 0.6), { x: s * 0.27, y: 0.38, sy: 0.8, sz: 1.1, j: 0.012 });
        b.cyl(0.11, 0.14, 0.07, 6, A[1], { y: 0.41, j: 0.008 });
    }, seed));
    const arm = (s: number) =>
 bake('mob.knight.arm' + s, (mb) => {
        const b = mb.main, c = shade(A, -0.7, 0, 0.35, 7, 0.08, 0.7);
        b.box(0.085, 0.3, 0.09, c, { y: -0.16, j: 0.008 });
        b.box(0.1, 0.13, 0.11, A[2], { y: -0.34, j: 0.008 });
    }, seed);
    const armP = at(arm(1), 0.28, 0.36, 0), armN = at(arm(-1), -0.28, 0.36, 0);
    torso.add(armP, armN);
    const sword = at(bake('mob.knight.sword', (mb) => {
        const b = mb.main;
        b.box(0.055, 0.5, 0.016, shade([0x9496ae, 0xc4c9dc, 0xe4e8f4], -0.1, 0.5, 0.2, 1), { y: 0.3, z: 0, j: 0.004 });
        b.cone(0.03, 0.08, 3, 0xe4e8f4, { y: 0.59, ry: 0.5 });
        b.box(0.2, 0.035, 0.05, 0x8a5a18, { y: 0.045 });
        b.box(0.04, 0.12, 0.04, 0x6a432f, { y: -0.04 });
    }, seed), 0, -0.36, 0.04);
    sword.rotation.x = -0.35;
    armP.add(sword);
    const head = at(G(), 0, 0.46, 0);
    torso.add(head);
    head.add(bake('mob.knight.head', (mb) => {
        const b = mb.main, c = shade(A, -0.1, 0.4, 0.3, 8, 0.1, 0.7);
        b.sph(0.17, 7, 5, c, { y: 0.16, sy: 1.05, j: 0.01 });
        b.box(0.22, 0.06, 0.04, 0x25222f, { y: 0.17, z: 0.155, ao: false, v: 0 });
        mb.glow(0xe8801e, 1.6).box(0.19, 0.035, 0.03, 0xf09030, { y: 0.17, z: 0.17, ao: false, v: 0.02 });
        b.box(0.03, 0.11, 0.025, 0x25222f, { y: 0.07, z: 0.165, ao: false, v: 0 });
    }, seed));
    const plume = at(bake('mob.knight.plume', (mb) => {
        const b = mb.main;
        b.hull([[0, 0, 0], [0.06, 0.05, -0.06], [-0.06, 0.05, -0.06], [0, 0.14, -0.02], [0.04, -0.03, -0.17], [-0.04, -0.03, -0.17], [0, -0.06, -0.13]], (_x, y) => y > 0.05 ? RED[2] : RED[1], { ao: false, v: 0.04, j: 0.006 });
    }, seed), 0, 0.4, -0.03);
    head.add(plume);
    return {
        root,
        head: 1.15,
        rad: 0.42,
        accent: 0xf8a24a,
        anim(c) {
            const w = c.walk, f = c.ph * 5.2;
            const sw = sin(f) * 0.5 * w;
            legP.rotation.x = sw;
            legN.rotation.x = -sw;
            hips.position.y = hipY * cos(Math.abs(sw)) + 0.012 * sin(c.t * 1.7) * (1 - w);
            torso.rotation.y = sin(f) * 0.1 * w;
            torso.rotation.z = sin(f) * 0.03 * w;
            torso.rotation.x = -0.05 + 0.03 * w + 0.14 * c.act - 0.15 * c.wind;
            armN.rotation.x = sw * 0.7 - 0.2 * c.act;
            armP.rotation.x = -sw * 0.5 - 0.5 * c.wind - 0.4 * c.act;
            armN.rotation.z = -0.08;
            armP.rotation.z = 0.1 + 0.15 * c.wind;
            sword.rotation.x = -0.35 - 0.3 * c.wind - 0.2 * c.act;
            head.rotation.x = -0.22 + sin(f * 2) * 0.05 * w - 0.05 * c.wind;
            head.rotation.y = 0.06 * sin(c.t * 0.8) * (1 - w);
            plume.rotation.x = 0.1 + 0.2 * w + 0.12 * sin(c.t * 2.2) + 0.2 * sin(f * 2) * w;
        }
    };
}
export const MORE_BUILD = { scarab, wisp, rockling, frostling, bogtoad, wraith, knight };

// Boss models: slime king, colossus, frost giant, witch, pharaoh and the old heart.
import * as THREE from 'three';
import { cos, EYE, frac, goofyEye, keys, makeRageRing, type MobRig, PI, ramp4, shade, sin } from './mobs-rig';
import { at, bake, E, MB, TAU } from './kit';

export const G = () => new THREE.Group();
export const GOLD = [0xa86a10, 0xd89018, 0xf0b030, 0xffd966];
export const clampv = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const KING_HOP = [[0, 1], [0.24, 0.72], [0.34, 1.22], [0.58, 1.06], [0.72, 0.9], [0.8, 0.7], [1, 1]];
export const HEART_BEAT = [[0, 0], [0.06, 1], [0.16, 0.1], [0.24, 0.65], [0.36, 0], [1, 0]];
export function slimeking(seed: number): MobRig {
    const R = [0x5d3a9a, 0x8b5cc8, 0xb48cec, 0xdcc4ff];
    const root = G(), sq = G();
    root.add(sq);
    sq.add(bake('mob.sk.body', (mb) => {
        const b = mb.main;
        b.lathe([[0, 0], [0.95, 0], [1.08, 0.1], [1.12, 0.32], [1, 0.62], [0.78, 0.9], [0.48, 1.1], [0.2, 1.2], [0.0001, 1.24]], 11, shade([0x6a44a8, R[1], R[1], R[2], R[3]], -0.2, 1.25, 0.3, 3, 0.1, 0.4), { j: 0.06 });
        b.oct(0.2, R[3], { x: -0.42, y: 1, z: -0.1, sx: 1.5, sy: 0.55, rz: 0.55, ao: false, v: 0.02, j: 0.02 });
        b.oct(0.1, R[3], { x: -0.12, y: 1.12, z: -0.14, sx: 1.4, sy: 0.55, ao: false, v: 0.02, j: 0.01 });
        for (const [x, z, r] of [[0.95, 0.4, 0.2], [-0.9, 0.5, 0.17], [-0.3, -1, 0.2]]) b.ico(r, 0, shade(R, 0, 0.3, 0.3, 4, 0.07, 0.5), { x, y: r * 0.75, z, sy: 0.75, j: 0.03 });
        for (const [x, z] of [[0.82, 0.62], [-0.7, 0.78], [0.1, 1.03]]) b.cone(0.07, 0.3, 3, R[1], { x, y: 0.5, z, rx: PI, v: 0.05 });
        goofyEye(b, -0.34, 0.8, 0.8, 0.22, 0.3, { sy: 1.2, rx: -0.55 });
        goofyEye(b, 0.34, 0.8, 0.8, 0.22, 0.3, { sy: 1.2, rx: -0.55 });
        const m = 0x3a2433;
        const sm = [[-0.5, 0.58, 0.9], [-0.28, 0.5, 0.99], [0, 0.47, 1.03], [0.28, 0.5, 0.99], [0.5, 0.58, 0.9]];
        for (let i = 0; i < sm.length - 1; i++) b.rod(sm[i], sm[i + 1], 0.03, 3, m, 0.03, { ao: false, v: 0 });
        for (const s of [-1, 1]) b.oct(0.085, 0xf79fc6, { x: s * 0.62, y: 0.7, z: 0.8, sz: 0.5, rx: -0.4, ao: false, v: 0.03 });
    }, seed));
    const brows = bake('mob.sk.brows', (mb) => {
        for (const s of [-1, 1]) mb.main.box(0.34, 0.07, 0.06, 0x3a2455, { x: s * 0.36, y: 1.07, z: 0.82, rz: s * -0.4, rx: -0.5, ao: false, v: 0.02, j: 0.006 });
    }, seed);
    brows.visible = false;
    sq.add(brows);
    const crown = bake('mob.sk.crown', (mb) => {
        const b = mb.shiny(), col = (_x: number, y: number) => GOLD[Math.max(1, Math.min(3, Math.round((y + 0.05) * 7)))];
        b.cyl(0.46, 0.5, 0.2, 8, col, { y: 0.1, j: 0.01, v: 0.04 });
        for (let i = 0; i < 5; i++) {
            const a = i / 5 * TAU + 0.3;
            b.cone(0.12, 0.32, 3, GOLD[2], { x: Math.cos(a) * 0.4, y: 0.36, z: Math.sin(a) * 0.4, v: 0.04, j: 0.008 });
        }
        mb.glow(0xe85d62, 1.7).oct(0.1, 0xf59a96, { y: 0.12, z: 0.5, sy: 1.2, ao: false, v: 0.03 });
        for (const s of [-1, 1]) mb.main.oct(0.06, 0xffffff, { x: s * 0.36, y: 0.12, z: 0.33, ry: s * 0.9, ao: false });
    }, seed);
    root.add(crown);
    const ring = makeRageRing(1.5);
    root.add(ring);
    let hop = 0;
    return {
        root,
        head: 1.62,
        rad: 1.1,
        accent: 0xb48cec,
        anim(c) {
            const rate = 1.05 + 0.35 * c.rage, prev = hop;
            if (c.moving) hop += c.dt * rate;
            else if (hop % 1 > 0.0001) {
                hop += c.dt * rate * 1.5;
                if (Math.floor(hop) > Math.floor(prev)) hop = Math.floor(hop);
            }
            const p = frac(hop);
            let sy = keys(p, KING_HOP);
            const y = p > 0.26 && p < 0.74 ? 0.55 * sin(PI * (p - 0.26) / 0.48) : 0;
            sy *= 1 + 0.03 * sin(c.t * 1.8) * (1 - c.walk) + 0.012 * sin(c.t * 5.3);
            sy *= 1 - 0.28 * c.wind + 0.02 * c.wind * sin(c.t * 30) + 0.2 * c.act;
            const sxz = 1 / Math.sqrt(sy), shrink = 0.86 + 0.14 * c.hpf;
            sq.scale.set(sxz * shrink, sy * shrink, sxz * shrink);
            sq.position.y = y + 0.25 * c.act;
            sq.rotation.z = 0.025 * sin(c.t * 1.3);
            brows.visible = c.phase >= 1;
            const top = 1.14 * sy * shrink + sq.position.y;
            crown.position.set(0.04 * sin(c.t * 1.8), top + 0.02, -0.06);
            crown.rotation.z = 0.12 * sin(c.t * 1.8 + 1.5) + 0.2 * (sy - 1) * sin(c.t * 9);
            crown.rotation.x = -0.08 + 0.1 * sin(c.t * 1.3);
            ring.visible = c.phase >= 2;
            ring.scale.setScalar(1.5 * (1 + 0.05 * sin(c.t * 3)));
        }
    };
}
/** A stone giant's look: its key, stone and fist ramps, eye colours and glow, accent, and extra decoration per part. */
export interface GiantLook { key: string; stone: number[]; fist: number[]; eye: number; eyeE: number; eyeBase: number; accent: number; deco(mb: MB, part: string): void }
export function giant(seed: number, L: GiantLook): MobRig {
    const S = L.stone, k = L.key;
    const root = G(), hipY = 1;
    const hips = at(G(), 0, hipY, 0);
    root.add(hips);
    const leg = () => bake(`mob.${k}.leg`, (mb) => {
        const b = mb.main, c = shade(S, -hipY * 1.5, 0.1, 0.45, 3, 0.08, 0.6);
        b.box(0.66, 0.98, 0.7, c, { y: -0.5, j: 0.05 });
        b.ico(0.4, 0, c, { y: -0.45, z: 0.3, sy: 0.8, j: 0.04 });
        b.box(0.86, 0.26, 1.02, shade(S, -hipY, -0.5, 0.45, 4, 0.08, 0.6), { y: -hipY + 0.13, z: 0.12, j: 0.05 });
    }, seed);
    const legP = at(leg(), 0.42, 0, 0), legN = at(leg(), -0.42, 0, 0);
    hips.add(legP, legN);
    const torso = at(G(), 0, 0.02, 0);
    hips.add(torso);
    torso.add(bake(`mob.${k}.torso`, (mb) => {
        const b = mb.main, c = shade(S, -0.9, 1.5, 0.4, 5, 0.09, 0.6);
        b.hull([[-0.55, 0, -0.38], [0.55, 0, -0.38], [0.55, 0, 0.45], [-0.55, 0, 0.45], [-1, 1.35, -0.55], [1, 1.35, -0.55], [1, 1.35, 0.4], [-1, 1.35, 0.4], [-0.6, 1.55, -0.1], [0.6, 1.55, -0.1]], c, { j: 0.06 });
        b.ico(0.5, 0, shade(S, 0.8, 1.6, 0.4, 6, 0.08, 0.6), { x: -0.88, y: 1.38, sy: 0.8, j: 0.05 });
        b.ico(0.5, 0, shade(S, 0.8, 1.6, 0.4, 7, 0.08, 0.6), { x: 0.88, y: 1.38, sy: 0.8, j: 0.05 });
        L.deco(mb, 'torso');
    }, seed));
    const arm = (s: number) => bake(`mob.${k}.arm${s}`, (mb) => {
        const b = mb.main, c = shade(S, -1.8, 0.2, 0.45, 8, 0.08, 0.6);
        b.box(0.56, 0.9, 0.58, c, { y: -0.4, j: 0.05 });
        b.ico(0.5, 1, shade(L.fist, -1.7, -0.9, 0.45, 9, 0.08, 0.6), { y: -1.1, sx: 1.1, sy: 0.95, j: 0.06 });
        L.deco(mb, 'arm');
    }, seed);
    const armP = at(arm(1), 1.12, 1.18, 0), armN = at(arm(-1), -1.12, 1.18, 0);
    torso.add(armP, armN);
    const head = at(G(), 0, 1.45, 0.1);
    torso.add(head);
    head.add(bake(`mob.${k}.head`, (mb) => {
        const b = mb.main, c = shade(S, -0.5, 0.8, 0.4, 10, 0.09, 0.6);
        b.hull([[-0.42, 0, -0.38], [0.42, 0, -0.38], [0.44, 0, 0.4], [-0.44, 0, 0.4], [-0.5, 0.7, -0.4], [0.5, 0.7, -0.4], [0.5, 0.7, 0.36], [-0.5, 0.7, 0.36]], c, { j: 0.04 });
        b.box(0.92, 0.16, 0.2, shade(S, 0.3, 0.8, 0.3, 11, 0.07, 0.6), { y: 0.5, z: 0.4, rx: 0.12, j: 0.02 });
        b.box(0.34, 0.07, 0.04, 0x25222f, { y: 0.14, z: 0.41, ao: false, v: 0 });
        const g = mb.glow(L.eye, L.eyeE);
        for (const s of [-1, 1]) {
            g.box(0.19, 0.15, 0.08, L.eyeBase, { x: s * 0.22, y: 0.35, z: 0.4, ao: false, v: 0.02, j: 0.004 });
            b.oct(0.04, 0xffffff, { x: s * 0.22 - 0.05, y: 0.4, z: 0.46, ao: false, v: 0, j: 0 });
        }
        L.deco(mb, 'head');
    }, seed));
    const ring = makeRageRing(1.9);
    root.add(ring);
    const redEyes = bake(`mob.${k}.rage`, (mb) => {
        const g = mb.glow(0xe83a30, 1.8);
        for (const s of [-1, 1]) g.box(0.21, 0.17, 0.05, 0xff5a4a, { x: s * 0.22, y: 0.35, z: 0.43, ao: false, v: 0 });
    }, seed);
    redEyes.visible = false;
    head.add(redEyes);
    return {
        root,
        head: 3.1,
        rad: 1.25,
        accent: L.accent,
        anim(c) {
            const w = c.walk, f = c.ph * 3.2;
            const sw = sin(f) * 0.42 * w;
            legP.rotation.x = sw;
            legN.rotation.x = -sw;
            hips.position.y = hipY * cos(Math.abs(sw)) + 0.012 * sin(c.t * 1.2) * (1 - w) - 0.03 * c.wind;
            torso.rotation.z = sin(f) * 0.05 * w + 0.01 * sin(c.t * 0.9);
            torso.rotation.y = -sin(f) * 0.08 * w;
            torso.rotation.x = -0.14 + 0.04 * w + 0.4 * c.act - 0.2 * c.wind;
            torso.scale.y = 1 + 0.018 * sin(c.t * 1.5) * (1 - c.wind);
            const up = -2.75 * c.wind, down = -0.35 * c.act;
            armP.rotation.x = (1 - c.wind) * (-sw * 0.5 + 0.04 * sin(c.t * 1.3)) + up + down * (1 - c.wind);
            armN.rotation.x = (1 - c.wind) * (sw * 0.5 + 0.04 * sin(c.t * 1.3 + 1)) + up + down * (1 - c.wind);
            armP.rotation.z = 0.08 + 0.12 * c.wind + 0.04 * sin(c.t * 1.1);
            armN.rotation.z = -0.08 - 0.12 * c.wind - 0.04 * sin(c.t * 1.1 + 2);
            head.rotation.x = -0.42 + sin(f * 2) * 0.03 * w + 0.02 * sin(c.t * 0.8) - 0.12 * c.wind + 0.3 * c.act;
            head.rotation.y = 0.07 * sin(c.t * 0.6) * (1 - w);
            redEyes.visible = c.phase >= 2 || c.wind > 0.5;
            ring.visible = c.phase >= 2;
            ring.scale.setScalar(1.9 * (1 + 0.05 * sin(c.t * 3)));
        }
    };
}
export function colossus(seed: number): MobRig {
    const ST = [0x585c7c, 0x7a7f9e, 0x9ea4bf, 0xc4c9dc, 0xe4e7f2];
    return giant(seed, {
        key: 'colossus',
        stone: ST,
        fist: ST,
        eye: 0xe8801e,
        eyeE: 1.7,
        eyeBase: 0xf09030,
        accent: 0xf8a24a,
        deco(mb: MB, part: string) {
            const b = mb.main;
            if (part === 'torso') {
                for (const [x, y, z, r] of [[-0.85, 1.62, -0.1, 0.34], [0.5, 1.5, -0.35, 0.28], [-0.3, 1.52, -0.2, 0.22]]) b.oct(r, shade([0x3f8a4c, 0x5cb04f, 0x86cc5c], 0, 0.3, 0.5, 2), { x, y, z, sy: 0.4, j: 0.05, ao: false });
                for (let i = 0; i < 5; i++) b.cone(0.05, 0.22, 3, [0x3f8a4c, 0x5cb04f, 0x86cc5c][i % 3], { x: -0.9 + i * 0.07, y: 1.7, z: -0.1 + i % 2 * 0.1, rz: (i - 2) * 0.2, ao: false });
                b.cyl(0.34, 0.38, 0.12, 7, ST[0], { y: 0.78, z: 0.5, rx: PI / 2, j: 0.02 });
                mb.glow(0xe8801e, 1.6).ico(0.26, 0, (_x: number, y: number) => y > 0.8 ? 0xffd966 : 0xf09030, { y: 0.78, z: 0.56, sz: 0.7, ao: false, v: 0.04, j: 0.01 });
                mb.glow(0xe85d62, 1.5).ico(0.15, 0, 0xe85d62, { y: 0.78, z: 0.64, sz: 0.5, ao: false, v: 0.04 });
            }
            if (part === 'arm') for (let i = 0; i < 3; i++) b.oct(0.14, ST[3], { x: -0.28 + i * 0.28, y: -1.5, z: 0.35, j: 0.03, sy: 0.7 });
        }
    });
}
export const breathMat = new THREE.MeshStandardMaterial({ color: 0xeaf8ff, flatShading: true, roughness: 1, transparent: true, opacity: 0.45, depthWrite: false, emissive: 0x9ad8f0, emissiveIntensity: 0.25 });
export const BREATH_GEO = new THREE.IcosahedronGeometry(1, 0);
export function frostgiant(seed: number): MobRig {
    const I = [0x5a8fb8, 0x8ac4e0, 0xbce8f4, 0xe8fbff], SN = [0xc8d8e8, 0xdce8f2, 0xf0f6fb, 0xffffff];
    const rig = giant(seed, {
        key: 'frost',
        stone: I,
        fist: SN,
        eye: 0x4ac8f0,
        eyeE: 1.7,
        eyeBase: 0x8ae0f8,
        accent: 0x8ac4e0,
        deco(mb: MB, part: string) {
            const b = mb.main;
            if (part === 'torso') {
                b.ico(0.62, 0, shade(SN, 0.2, 0.9, 0.3, 3, 0.07, 0.4), { y: 0.55, z: 0.3, sy: 0.85, sz: 0.7, j: 0.04, ao: false });
                for (const [x, y, z, h, rz] of [[-0.95, 1.7, 0, 0.7, 0.35], [0.95, 1.7, 0, 0.7, -0.35], [-0.55, 1.65, -0.35, 0.6, 0.15], [0.55, 1.65, -0.35, 0.6, -0.15], [0, 1.6, -0.45, 0.8, 0], [-0.3, 1.45, -0.55, 0.5, 0.1], [0.3, 1.45, -0.55, 0.5, -0.1]])
                    b.cone(0.17, h, 4, (_x: number, yy: number) => yy > y + h * 0.55 ? I[3] : I[2], { x, y: y + h / 2 - 0.1, z, rz, v: 0.05, j: 0.015, ao: false });
            }
            if (part === 'head') {
                for (const s of [-1, 1]) b.cone(0.1, 0.52, 4, I[3], { x: s * 0.46, y: 0.85, z: 0, rz: -s * 0.55, v: 0.05, ao: false });
                b.ico(0.34, 0, shade(SN, -0.3, 0.2, 0.3, 4, 0.07, 0.4), { y: -0.05, z: 0.34, sx: 1.25, sy: 0.9, sz: 0.8, j: 0.04, ao: false });
                for (const x of [-0.25, 0, 0.25]) b.cone(0.07, 0.3, 3, SN[3], { x, y: -0.28, z: 0.44, rx: PI, ao: false });
            }
            if (part === 'arm') for (let i = 0; i < 3; i++) b.cone(0.08, 0.24, 3, I[3], { x: -0.28 + i * 0.28, y: -1.52, z: 0.4, rx: PI, ao: false });
        }
    });
    const puffs: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(BREATH_GEO, breathMat);
        m.visible = false;
        m.userData.noFlash = true;
        rig.root.add(m);
        puffs.push(m);
    }
    const inner = rig.anim;
    return {
        ...rig,
        anim(c) {
            inner(c);
            for (let i = 0; i < 3; i++) {
                const m = puffs[i], k = frac(c.t * 0.45 + i / 3), grow = Math.sin(PI * k);
                m.visible = grow > 0.03;
                m.position.set(Math.sin(c.t + i * 2) * 0.1 * k, 2.6 + k * 0.4, 0.85 + k * 1.1);
                m.scale.setScalar((0.1 + 0.3 * k) * (0.5 + 0.5 * grow) * (1 + 0.6 * c.wind));
                m.rotation.y = i * 1.3 + c.t * 0.4;
            }
        }
    };
}
export function witch(seed: number): MobRig {
    const VI = [0x4a3a7a, 0x6a52a6, 0x8f72cc, 0xbba0ee], DK = [0x35305c, 0x5d4a7c, 0x7a64a0, 0x9a84c0], SK = [0x3a7a3a, 0x5cb04f, 0x9ad870];
    const root = G(), hoverY = 0.42;
    const fly = at(G(), 0, hoverY, 0);
    root.add(fly);
    const body = G();
    body.scale.set(1.25, 1, 1.25);
    fly.add(body);
    body.add(bake('mob.witch.robe', (mb) => {
        const b = mb.main, c = shade([DK[0], DK[1], DK[1], DK[2], DK[3]], -0.2, 1.15, 0.4, 3, 0.1, 0.6);
        b.lathe([[0.0001, 0], [0.6, 0], [0.58, 0.2], [0.46, 0.55], [0.38, 0.9], [0.3, 1.08], [0.0001, 1.12]], 9, c, { j: 0.03 });
        b.cyl(0.4, 0.43, 0.09, 7, 0xe0a020, { y: 0.66, j: 0.01, ao: false, v: 0.04 });
        b.box(0.14, 0.12, 0.05, 0xffd966, { y: 0.66, z: 0.44, ao: false, v: 0.03 });
        b.ico(0.38, 0, shade([DK[1], DK[2], DK[3]], 0.9, 1.3, 0.3, 4, 0.07, 0.5), { y: 1.1, sy: 0.55, j: 0.02 });
    }, seed));
    const hem = bake('mob.witch.hem', (mb) => {
        for (let i = 0; i < 8; i++) {
            const a = i / 8 * TAU, len = 0.26 + 0.1 * (i % 3) / 2;
            mb.main.cone(0.1, len, 3, shade([DK[0], DK[1], DK[2]], -0.4, 0, 0.4, i, 0.07, 0.5), { x: Math.cos(a) * 0.56, y: -len / 2 + 0.03, z: Math.sin(a) * 0.56, rx: PI, ry: a, j: 0.015 });
        }
    }, seed);
    body.add(hem);
    const head = at(G(), 0, 1.3, 0);
    body.add(head);
    head.add(bake('mob.witch.head', (mb) => {
        const b = mb.main, c = shade(SK, -0.2, 0.3, 0.3, 5, 0.1, 0.6);
        b.sph(0.27, 8, 5, c, { y: 0.1, sy: 1.05, j: 0.015 });
        b.cone(0.07, 0.24, 4, SK[1], { y: 0, z: 0.3, rx: PI / 2 - 0.35, v: 0.04 });
        b.oct(0.035, 0x3a7a3a, { x: 0.02, y: -0.07, z: 0.4, ao: false });
        for (const s of [-1, 1]) {
            b.ico(0.075, 0, 0xffd966, { x: s * 0.12, y: 0.17, z: 0.22, sy: 1.1, sz: 0.55, rx: -0.2, ao: false, v: 0.02 });
            b.oct(0.04, EYE, { x: s * 0.12, y: 0.17, z: 0.25, sz: 0.5, sy: 1.5, rx: -0.2, ao: false });
            b.oct(0.02, 0xffffff, { x: s * 0.12 - 0.02, y: 0.2, z: 0.27, ao: false, v: 0, j: 0 });
        }
        b.box(0.16, 0.025, 0.04, EYE, { y: -0.1, z: 0.25, rz: 0.1, ao: false, v: 0 });
        b.cone(0.014, 0.05, 3, 0xfffbf4, { x: -0.04, y: -0.12, z: 0.255, rx: PI, ao: false });
        for (let i = 0; i < 7; i++) {
            const a = -2.4 + i * 0.8;
            b.cone(0.05, 0.45 - i % 2 * 0.1, 3, [0x2d6a50, 0x3f8a4c, 0x25222f][i % 3], { x: Math.sin(a) * 0.26, y: -0.08, z: -Math.abs(Math.cos(a)) * 0.2, rx: PI, rz: Math.sin(a) * 0.3, ao: false, v: 0.05, j: 0.015 });
        }
    }, seed));
    const hat = at(G(), 0, 0.34, -0.08);
    head.add(hat);
    hat.add(bake('mob.witch.hat', (mb) => {
        const b = mb.main, c = shade(VI, 0, 0.9, 0.3, 6, 0.1, 0.5);
        b.cyl(0.46, 0.5, 0.06, 8, shade(VI, 0, 0.2, 0.3, 7, 0.07, 0.5), { y: 0, j: 0.015 });
        b.cone(0.34, 0.62, 7, c, { y: 0.34, j: 0.02 });
        b.cyl(0.35, 0.37, 0.1, 7, 0xe0a020, { y: 0.1, ao: false, v: 0.04 });
        b.box(0.12, 0.13, 0.04, 0xffd966, { y: 0.1, z: 0.36, ao: false, v: 0.03 });
    }, seed));
    const tip = at(bake('mob.witch.tip', (mb) => {
        mb.main.cone(0.15, 0.4, 6, shade(VI, 0.3, 0.8, 0.3, 8, 0.07, 0.5), { y: 0.2, rz: 0, j: 0.012 });
    }, seed), 0, 0.64, 0);
    hat.add(tip);
    const sleeve = (s: number) => bake('mob.witch.sleeve' + s, (mb) => {
        mb.main.cone(0.2, 0.66, 5, shade([DK[1], DK[2], VI[1]], -0.66, 0, 0.4, 2, 0.07, 0.5), { y: -0.33, rx: PI, j: 0.02 });
        mb.main.ico(0.1, 0, shade(SK, -0.1, 0.1, 0.3, 3, 0.07, 0.5), { y: -0.7, j: 0.012 });
    }, seed);
    const armP = at(sleeve(1), 0.4, 1.02, 0.05), armN = at(sleeve(-1), -0.4, 1.02, 0.05);
    body.add(armP, armN);
    const orb = at(G(), 0, -0.84, 0.12);
    armP.add(orb);
    orb.add(bake('mob.witch.orb', (mb) => {
        mb.glow(0x40c0c8, 1.5).ico(0.19, 1, (_x, y) => y > 0.05 ? 0xcdf4ee : 0x6ac0c8, { ao: false, v: 0.05 });
    }, seed));
    const sparks: THREE.Group[] = [];
    for (let i = 0; i < 3; i++) {
        const g = bake('mob.witch.spark', (mb) => {
            mb.glow(0x40c020, 2).tet(0.06, 0xb4e47a, { ao: false, v: 0 });
        }, seed);
        g.visible = false;
        armN.add(g);
        sparks.push(g);
    }
    const ring = makeRageRing(1.4);
    root.add(ring);
    return {
        root,
        head: 3,
        rad: 1,
        accent: 0x86cc5c,
        anim(c) {
            const w = c.walk;
            fly.position.y = hoverY + 0.09 * sin(c.t * 1.5) + 0.02 * sin(c.t * 3.7) - 0.06 * c.wind + 0.05 * c.act;
            body.rotation.x = 0.1 * w + 0.22 * c.act - 0.16 * c.wind;
            body.rotation.z = 0.04 * sin(c.t * 1.2) + 0.04 * sin(c.ph * 2.6) * w;
            hem.rotation.x = 0.1 * sin(c.t * 2.6) + 0.15 * w;
            hem.rotation.z = 0.1 * sin(c.t * 2.1 + 1);
            hem.scale.y = 1 + 0.15 * sin(c.t * 3.3);
            head.rotation.x = -0.3 + 0.05 * sin(c.t * 1.3) - 0.08 * c.wind;
            head.rotation.z = 0.05 * sin(c.t * 0.9 + 1);
            tip.rotation.z = 0.5 + 0.18 * sin(c.t * 1.8) + 0.2 * w * sin(c.ph * 3);
            tip.rotation.x = 0.1 * sin(c.t * 1.4);
            hat.rotation.z = -0.08 + 0.04 * sin(c.t * 1.1);
            hat.rotation.x = -0.5 + 0.04 * sin(c.t * 1.4);
            armP.rotation.x = -0.65 - 0.9 * c.wind - 0.2 * c.act + 0.05 * sin(c.t * 1.8);
            armP.rotation.z = -0.5 - 0.3 * c.wind;
            armN.rotation.x = -0.3 - 1.3 * c.wind + 0.06 * sin(c.t * 1.5 + 1);
            armN.rotation.z = 0.4 + 0.5 * c.wind;
            orb.scale.setScalar(1 + 0.09 * sin(c.t * 3.4) + 0.55 * c.wind);
            orb.position.y = -0.84 + 0.03 * sin(c.t * 2.2);
            for (let i = 0; i < 3; i++) {
                const g = sparks[i];
                g.visible = c.wind > 0.2 || c.phase >= 2;
                const a = c.t * 4 + i * 2.1;
                g.position.set(cos(a) * 0.16, -0.8 + 0.12 * sin(a * 1.4), sin(a) * 0.16 + 0.05);
                g.scale.setScalar(0.6 + 0.5 * Math.abs(sin(a * 2)));
            }
            ring.visible = c.phase >= 2;
            ring.scale.setScalar(1.4 * (1 + 0.05 * sin(c.t * 3)));
        }
    };
}
export function pharaoh(seed: number): MobRig {
    const C = [0xd9bfae, 0xecd5bb, 0xfff0d2, 0xfffaf0], BL = [0x1f5a90, 0x2d7ac0, 0x4ab2cf];
    const root = G(), body = G();
    body.scale.set(1.2, 1, 1.2);
    root.add(body);
    body.add(bake('mob.pharaoh.body', (mb) => {
        const b = mb.main;
        const band = (_x: number, y: number, z: number) => C[(Math.floor(y * 9 + z * 0.3) % 2 + 2) % 2 ? 2 : 3];
        b.lathe([[0.0001, 0.06], [0.46, 0.06], [0.5, 0.2], [0.44, 0.42], [0.5, 0.52], [0.42, 0.85], [0.5, 0.95], [0.46, 1.2], [0.56, 1.35], [0.5, 1.6], [0.4, 1.78], [0.0001, 1.8]], 8, band, { j: 0.03, v: 0.05 });
        for (const s of [-1, 1]) b.box(0.3, 0.12, 0.5, 0x666b86, { x: s * 0.2, y: 0.06, z: 0.18, j: 0.01 });
        b.lathe([[0.3, 1.52], [0.62, 1.5], [0.76, 1.56], [0.7, 1.68], [0.3, 1.74]], 8, (_x, y) => GOLD[y > 1.6 ? 2 : 1], { j: 0.01, v: 0.04, ao: false });
        for (let i = 0; i < 5; i++) {
            const a = i / 4 * PI * 0.8 + 0.3;
            b.oct(0.07, BL[2], { x: Math.cos(a + PI / 2) * 0.62, y: 1.6, z: Math.abs(Math.sin(a + PI / 2)) * 0.5 + 0.12, ao: false, v: 0.03, sy: 1.2 });
        }
    }, seed));
    const head = at(G(), 0, 1.84, 0.02);
    body.add(head);
    head.add(bake('mob.pharaoh.head', (mb) => {
        const b = mb.main;
        b.box(0.5, 0.52, 0.42, shade([0xd0a874, 0xe0b884, 0xe8c08a, 0xf0d0a0], 0, 0.55, 0.3, 3, 0.1, 0.6), { y: 0.3, z: 0.03, j: 0.012 });
        b.hull([[-0.3, 0.3, -0.34], [0.3, 0.3, -0.34], [-0.34, 0.62, -0.1], [0.34, 0.62, -0.1], [-0.3, 0.85, -0.3], [0.3, 0.85, -0.3], [-0.26, 0.82, 0.22], [0.26, 0.82, 0.22], [-0.3, 0.55, 0.25], [0.3, 0.55, 0.25]], shade([GOLD[1], GOLD[2], GOLD[2], GOLD[3]], 0.3, 1, 0.2, 4, 0.1, 0.4), { j: 0.012, v: 0.03 });
        for (let i = 0; i < 3; i++) b.box(0.62, 0.035, 0.06, BL[1], { y: 0.86, z: -0.12 + i * 0.12, ao: false, v: 0.03 });
        for (const s of [-1, 1]) {
            b.box(0.16, 0.7, 0.3, shade([GOLD[1], GOLD[2], GOLD[2]], -0.3, 0.6, 0.2, 5, 0.1, 0.5), { x: s * 0.36, y: 0, z: -0.04, j: 0.012 });
            for (let i = 0; i < 2; i++) b.box(0.17, 0.04, 0.31, BL[1], { x: s * 0.36, y: 0.2 - i * 0.2, z: -0.04, ao: false, v: 0.03 });
        }
        b.box(0.11, 0.3, 0.08, BL[1], { y: -0.06, z: 0.24, rx: 0.2, ao: false, v: 0.03 });
        b.cone(0.05, 0.16, 3, 0xe85d62, { y: 0.8, z: 0.24, rx: 0.5, ao: false });
        for (const s of [-1, 1]) b.box(0.15, 0.09, 0.03, EYE, { x: s * 0.12, y: 0.36, z: 0.235, rz: s * 0.12, ao: false, v: 0 });
        b.box(0.14, 0.03, 0.03, 0x7a3a46, { y: 0.14, z: 0.235, ao: false, v: 0 });
        const g = mb.glow(0x6ad8e0, 1.5);
        for (const s of [-1, 1]) g.box(0.07, 0.055, 0.03, 0x8ae8f0, { x: s * 0.12, y: 0.36, z: 0.248, ao: false, v: 0.02 });
    }, seed));
    const redEyes = bake('mob.pharaoh.rage', (mb) => {
        const g = mb.glow(0xe8502a, 1.8);
        for (const s of [-1, 1]) g.box(0.08, 0.06, 0.03, 0xff7a5a, { x: s * 0.12, y: 0.36, z: 0.256, ao: false, v: 0 });
    }, seed);
    redEyes.visible = false;
    head.add(redEyes);
    const mkArm = (k: number) => bake('mob.pharaoh.arm' + k, (mb) => {
        mb.main.box(0.26, 0.85, 0.28, shade(C, -0.85, 0, 0.3, 5 + k, 0.07, 0.5), { y: -0.42, j: 0.02 });
        for (let i = 0; i < 3; i++) mb.main.box(0.28, 0.035, 0.3, C[0], { y: -0.18 - i * 0.24, ao: false, v: 0.03 });
        mb.main.oct(0.14, shade(C, -1, -0.8, 0.3, 6 + k, 0.07, 0.5), { y: -0.9, z: 0.02, j: 0.01 });
    }, seed);
    const armN = at(mkArm(0), -0.62, 1.58, 0), armP = at(mkArm(1), 0.62, 1.58, 0);
    body.add(armN, armP);
    const staff = at(bake('mob.pharaoh.staff', (mb) => {
        const b = mb.main;
        b.rod([0, -1.1, 0], [0, 1.15, 0], 0.045, 5, shade(ramp4(0x8f5a36), -1.1, 1.2, 0.3, 1, 0.07, 0.3), 0.04);
        b.ico(0.17, 0, shade(GOLD, 1.1, 1.5, 0.2, 2, 0.1, 0.4), { y: 1.32, j: 0.01, v: 0.04 });
        b.cone(0.05, 0.16, 3, GOLD[3], { y: 1.6, ao: false });
        mb.glow(0xe85d62, 1.7).oct(0.07, 0xe85d62, { y: 1.33, z: 0.14, ao: false, v: 0.03 });
    }, seed), 0.72, 0.95, 0.36);
    body.add(staff);
    const ring = makeRageRing(1.5);
    root.add(ring);
    return {
        root,
        head: 2.7,
        rad: 1.1,
        accent: 0xffd966,
        anim(c) {
            const w = c.walk, f = c.ph * 3.4;
            body.position.y = 0.04 * Math.abs(sin(f)) * w + 0.015 * sin(c.t * 1.4) * (1 - w);
            body.rotation.z = 0.04 * sin(f) * w + 0.01 * sin(c.t * 0.8);
            body.rotation.x = 0.06 * w + 0.32 * c.act - 0.14 * c.wind;
            body.rotation.y = 0.05 * sin(f) * w;
            head.rotation.x = -0.32 + 0.04 * sin(c.t * 1.1) - 0.1 * c.wind + 0.2 * c.act;
            head.rotation.y = 0.06 * sin(c.t * 0.7) * (1 - w);
            armP.rotation.x = -0.55 - 0.8 * c.wind - 0.2 * c.act;
            armP.rotation.z = 0.05 + 0.1 * c.wind;
            armN.rotation.x = 0.14 * sin(f) * w - 0.05 - 0.5 * c.act;
            armN.rotation.z = -0.08;
            staff.position.set(0.72, 0.95 + 0.25 * c.wind + 0.05 * Math.max(0, sin(f)) * w, 0.36 + 0.1 * c.wind);
            staff.rotation.x = 0.1 * c.act - 0.2 * c.wind;
            staff.rotation.z = 0.03 * sin(c.t * 1.6) - 0.05 * c.wind;
            redEyes.visible = c.phase >= 2 || c.wind > 0.5;
            ring.visible = c.phase >= 2;
            ring.scale.setScalar(1.5 * (1 + 0.05 * sin(c.t * 3)));
        }
    };
}
export function oldheart(seed: number): MobRig {
    const H = [0x7a1a30, 0xb02a44, 0xe8434f, 0xf59aa0], WD = [0x4a2f2a, 0x6a432f, 0x8f5a36, 0xb87a46];
    const root = G(), cy = 1.28;
    const heart = at(G(), 0, cy, 0);
    root.add(heart);
    heart.add(bake('mob.heart', (mb) => {
        const b = mb.main, c = shade([H[1], H[1], H[2], H[2], H[3]], -1.4, 1.2, 0.35, 3, 0.09, 0.6);
        b.ico(0.92, 1, c, { x: -0.72, y: 0.5, z: -0.05, sx: 1, sy: 0.97, sz: 0.85, j: 0.07 });
        b.ico(0.92, 1, c, { x: 0.72, y: 0.5, z: -0.05, sx: 1, sy: 0.97, sz: 0.85, j: 0.07 });
        b.hull([[-1.55, 0.45, -0.5], [1.55, 0.45, -0.5], [-1.35, 0.35, 0.38], [1.35, 0.35, 0.38], [0, -1.35, -0.1], [-0.8, -0.55, 0.12], [0.8, -0.55, 0.12], [-0.75, -0.6, -0.45], [0.75, -0.6, -0.45]], c, { j: 0.06 });
        b.oct(0.38, H[3], { x: -0.95, y: 1, z: 0.3, sx: 1.3, sy: 0.55, rz: 0.4, ao: false, v: 0.03 });
        for (const [x, r] of [[-0.3, 0.2]]) b.cyl(r * 0.9, r, 0.55, 5, shade([H[0], H[1], H[2]], 1, 1.7, 0.3, 4, 0.07, 0.4), { x, y: 1.35, z: -0.1, rz: x * 0.4, j: 0.02 });
        for (let i = 0; i < 3; i++) b.cone(0.06, 0.28, 3, [0x3f8a4c, 0x5cb04f, 0x86cc5c][i], { x: 0.5 + i * 0.1, y: 1.75, z: -0.1, rz: -0.4 - i * 0.4, ao: false });
    }, seed));
    const veins = bake('mob.heart.veins', (mb) => {
        const g = mb.glow(0xe86a20, 1.5);
        const lines = [
            [[-0.95, 1.2, 0.5], [-1.15, 0.6, 0.62], [-1, 0, 0.55], [-0.6, -0.55, 0.4]],
            [[0.95, 1.2, 0.5], [1.15, 0.6, 0.62], [1, 0, 0.55], [0.6, -0.55, 0.4]],
            [[-0.25, 1.1, 0.35], [-0.4, 0.62, 0.58]],
            [[0.25, 1.1, 0.35], [0.4, 0.62, 0.58]]
        ];
        for (const l of lines) for (let i = 0; i < l.length - 1; i++) g.rod(l[i], l[i + 1], 0.05, 3, 0xf08a30, 0.045, { ao: false, v: 0.03 });
    }, seed);
    heart.add(veins);
    const eyeG = at(G(), 0, 0.16, 0.66);
    heart.add(eyeG);
    eyeG.add(bake('mob.heart.eye', (mb) => {
        const b = mb.main;
        mb.custom('sclera', E(0xfff0d0, 0.55)).ico(0.5, 1, (_x, y) => y > 0.1 ? 0xfff6e0 : 0xf0e4c4, { sx: 1.2, sy: 0.95, sz: 0.6, v: 0.02, ao: false });
        mb.glow(0xe0a020, 1.6).ico(0.27, 0, 0xffd966, { z: 0.2, sz: 0.45, ao: false, v: 0.03 });
        b.box(0.07, 0.4, 0.05, EYE, { z: 0.32, ao: false, v: 0 });
        b.oct(0.05, 0xffffff, { x: -0.12, y: 0.12, z: 0.34, ao: false, v: 0, j: 0 });
    }, seed));
    const lid = (s: number) =>
 bake('mob.heart.lid' + s, (mb) => {
        mb.main.ico(0.46, 0, shade([H[0], H[1], H[2]], -0.4, 0.4, 0.3, 5, 0.07, 0.5), { sx: 1.35, sy: 0.38, sz: 0.62, j: 0.015, ao: false });
    }, seed);
    const lidU = at(lid(1), 0, 0.5, 0.12), lidD = at(lid(-1), 0, -0.5, 0.12);
    eyeG.add(lidU, lidD);
    const angry = bake('mob.heart.rage', (mb) => {
        mb.glow(0xe83a30, 1.8).ico(0.18, 0, 0xff4a40, { z: 0.24, sz: 0.4, ao: false, v: 0 });
    }, seed);
    angry.visible = false;
    eyeG.add(angry);
    root.add(bake('mob.heart.roots', (mb) => {
        const b = mb.main, wc = shade([WD[1], WD[2], WD[2], WD[3]], -0.1, 0.5, 0.4, 3, 0.1, 0.5);
        b.ico(0.5, 0, wc, { y: 0.2, sx: 1.6, sy: 0.7, sz: 1.3, j: 0.06 });
        const n = 6;
        for (let i = 0; i < n; i++) {
            const a = i / n * TAU + 0.2, len = 1 + 0.35 * (i * 7 % 3) / 2, r0 = 0.3, bend = i % 2 ? 0.3 : -0.3;
            const p0 = [Math.cos(a) * 0.4, 0.28, Math.sin(a) * 0.4];
            const p1 = [Math.cos(a + bend * 0.3) * (0.4 + len * 0.55), 0.22, Math.sin(a + bend * 0.3) * (0.4 + len * 0.55)];
            const p2 = [Math.cos(a + bend) * (0.4 + len), 0.1, Math.sin(a + bend) * (0.4 + len)];
            b.rod(p0, p1, r0, 4, wc, r0 * 0.72, { j: 0.025 });
            b.rod(p1, p2, r0 * 0.72, 4, wc, r0 * 0.3, { j: 0.02 });
            if (i % 3 === 0) b.cone(0.05, 0.22, 3, 0x5cb04f, { x: p2[0] * 0.8, y: 0.15, z: p2[2] * 0.8, rz: 0.3, ao: false });
        }
    }, seed));
    const ring = makeRageRing(2);
    root.add(ring);
    let blink = 2 + seed % 3, nextBlink = blink;
    return {
        root,
        head: 2.7,
        rad: 1.4,
        accent: 0xe8434f,
        anim(c) {
            const bpm = (0.95 + 0.3 * c.phase * 0.5 + 0.35 * c.walk) * (1 + 0.25 * c.wind);
            const p = frac(c.t * bpm);
            const beat = keys(p, HEART_BEAT);
            const s = 1 + 0.075 * beat;
            heart.scale.set(s, 1 + 0.085 * beat, s);
            heart.rotation.z = 0.02 * sin(c.t * 0.9) + 0.03 * sin(c.ph * 2.2) * c.walk;
            heart.rotation.y = 0.05 * sin(c.t * 0.5);
            heart.rotation.x = -0.4 + 0.05 * c.act - 0.06 * c.wind;
            heart.position.y = cy + 0.03 * sin(c.t * 1.1) + 0.06 * beat - 0.1 * c.wind + 0.05 * c.act;
            veins.scale.setScalar(1 + 0.02 * beat);
            blink -= c.dt;
            if (blink < -0.18) {
                nextBlink = 2.2 + c.t * 7.13 % 3.2;
                blink = nextBlink;
            }
            const closed = blink < 0 ? Math.sin(PI * clampv((blink + 0.18) / 0.18, 0, 1)) : 0;
            const sq = clampv(0.12 * c.wind + 0.1 * c.rage + 0.06 * Math.sin(c.t * 0.8) + closed, 0, 1);
            lidU.position.y = 0.5 - 0.42 * sq;
            lidD.position.y = -0.5 + 0.42 * (closed + 0.06 * c.rage);
            eyeG.position.set(0.05 * sin(c.t * 0.7), 0.16 + 0.03 * sin(c.t * 0.9), 0.66);
            eyeG.scale.setScalar(1 + 0.04 * beat);
            angry.visible = c.phase >= 2 || c.wind > 0.5;
            ring.visible = c.phase >= 2;
            ring.scale.setScalar(2 * (1 + 0.05 * sin(c.t * 3)));
        }
    };
}
export const BOSS_BUILD = { slimeking, colossus, witch, pharaoh, frostgiant, oldheart };

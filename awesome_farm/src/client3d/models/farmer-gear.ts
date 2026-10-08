// What a farmer wears: hats and helmets, body armour and the cloak, bags and charms.
import * as THREE from 'three';
import { Bld, clamp, Col, type ColorFn, hash, MB, mix, Pt } from './kit';
import { bakeCloth, CANVAS, CLOTH, CRYSTAL, CYAN, fbake, GOLD, IRON, LEATHER, LINEN, radiusAt, rampAt, STEEL, STONE, TOP, VIOLET, WOODR, WRAITH } from './farmer-base';

export const PI = Math.PI;
export const SEG = 12;
export const AZ0 = PI / 12;
/** Where a hat's rim sits (height) at each angle around the head. */
export type Rim = (az: number) => number;
/** A shell hugging the head from the rim up: a hat's crown or a helmet. */
export function shellGeo(rim: Rim, off: number, rows: number, crown = TOP + off * 0.7, bandH = 0) {
    const pos: number[] = [];
    const V = (k: number, j: number) => {
        const az = AZ0 + k % SEG * (PI * 2 / SEG);
        if (j >= rows && !bandH) return [0, crown, 0];
        const y0 = rim(az), yt = bandH ? y0 + bandH : TOP, y = y0 + (yt - y0) * (j / rows);
        const r = radiusAt(y) + off;
        return [r * Math.sin(az), y, r * Math.cos(az)];
    };
    const tri = (a: Pt, b: Pt, c: Pt) => {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3 - 0.45, cz = (a[2] + b[2] + c[2]) / 3;
        if (nx * cx + ny * cy + nz * cz < 0) pos.push(...a, ...c, ...b);
        else pos.push(...a, ...b, ...c);
    };
    for (let k = 0; k < SEG; k++) for (let j = 0; j < rows; j++) {
        const a = V(k, j), b = V(k + 1, j), c = V(k + 1, j + 1), d = V(k, j + 1);
        if (j === rows - 1 && !bandH) tri(a, b, d);
        else {
            tri(a, b, c);
            tri(a, c, d);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
}
export const rimStd = (lo = 0.545, hi = 0.2): Rim => (az: number) => lo + hi * Math.pow(0.5 + 0.5 * Math.cos(az), 1.25);
export const azOf = (x: number, z: number) => Math.atan2(x, z);
export function hatCol(R: readonly number[], rim: Rim, band: number | null, bandH = 0.045, k = 0): ColorFn {
    return (x: number, y: number, z: number) => {
        const r0 = rim(azOf(x, z));
        if (band !== null && y < r0 + bandH) return mix(band, R[0], 0.15 + (hash(x * 40, z * 40 + k) - 0.5) * 0.2);
        return rampAt(R, clamp(0.42 + (y - 0.55) * 1.7 + (hash(x * 50 + k, z * 50 + y * 9) - 0.5) * 0.22));
    };
}
export const at = (az: number, y: number, off = 0) => {
    const r = radiusAt(y) + off;
    return { x: r * Math.sin(az), y, z: r * Math.cos(az) };
};
export const HEADS: Record<string, ((b: Bld, mb: MB) => void) | undefined> = {
    cap_cloth(b: Bld) {
        const rim = rimStd(0.535, 0.215);
        b.add(shellGeo(rim, 0.028, 2), hatCol(CLOTH, rim, CLOTH[0], 0.05, 1), { j: 0.004, v: 0.05 });
        for (const s of [-1, 1]) b.ico(0.05, 0, CLOTH[1], { ...at(s * 1.45, 0.575, 0.01), sy: 1.2, sx: 0.8, j: 0.004 });
        b.cone(0.036, 0.1, 5, CLOTH[2], { x: 0, y: TOP + 0.01, z: -0.1, rx: -0.9, ao: false, j: 0.004 });
        return 0.03;
    },
    cap_hide(b: Bld) {
        const rim = rimStd(0.52, 0.22);
        b.add(shellGeo(rim, 0.03, 2), hatCol(LEATHER, rim, 0x3a2418, 0.05, 2), { j: 0.004, v: 0.06 });
        for (const a of [-0.5, -0.17, 0.17, 0.5]) {
            const p = at(a, rim(a) + 0.065, 0.032);
            b.tet(0.014, LEATHER[3], { ...p, ao: false, v: 0 });
        }
        for (const s of [-1, 1]) b.oct(0.065, LEATHER[1], { ...at(s * 1.5, 0.5, 0.02), sx: 0.55, sy: 1.3, sz: 1, ry: s * 0.2, j: 0.006 });
        return 0.032;
    },
    helm_iron(b: Bld) {
        const rim = rimStd(0.54, 0.215);
        b.add(shellGeo(rim, 0.034, 2), hatCol(IRON, rim, IRON[0], 0.05, 3), { j: 0.004, v: 0.05 });
        const n = at(0, 0.71, 0.04);
        b.box(0.034, 0.1, 0.022, IRON[3], { ...n, rx: -0.5, v: 0.04, ao: false });
        for (const s of [-1, 1]) {
            const c = at(s * 1.35, 0.56, 0.03);
            b.box(0.03, 0.12, 0.12, IRON[1], { ...c, ry: s * 1.35, v: 0.05 });
        }
        for (const a of [-0.45, 0.45]) b.tet(0.016, IRON[4], { ...at(a, rim(a) + 0.035, 0.04), ao: false, v: 0 });
        return 0.036;
    },
    helm_steel(b: Bld, mb: MB) {
        const rim = rimStd(0.54, 0.22);
        const M = mb.shiny();
        M.add(shellGeo(rim, 0.04, 2), hatCol(STEEL, rim, GOLD[1], 0.05, 4), { j: 0.003, v: 0.05 });
        for (const s of [-1, 1]) b.hull([[0, 0, 0.12], [0, 0, -0.12], [0, 0.075, 0], [s * 0.025, 0, 0.1], [s * 0.025, 0, -0.1]], STEEL[3], { x: s * 0.07, y: TOP + 0.015, v: 0.04, ao: false });
        for (const s of [-1, 1]) {
            const c = at(s * 1.35, 0.56, 0.035);
            M.box(0.03, 0.13, 0.13, STEEL[2], { ...c, ry: s * 1.35, v: 0.05 });
        }
        return 0.05;
    },
    helm_crystal(b: Bld, mb: MB) {
        const rim = rimStd(0.54, 0.215);
        b.add(shellGeo(rim, 0.036, 2), hatCol(CRYSTAL, rim, CRYSTAL[0], 0.05, 5), { j: 0.004, v: 0.06 });
        const g = mb.glow(0x9a88ff, 1.4);
        for (const [a, y, h, tilt] of [[1, 0.74, 0.3, 0.7], [-1, 0.74, 0.3, -0.7], [2.5, 0.73, 0.24, 0.6], [-2.5, 0.73, 0.24, -0.6], [PI, 0.8, 0.28, 0.1]]) {
            const p = at(a, y, 0.02);
            g.oct(0.06, (_x: number, yy: number) => rampAt(CRYSTAL, clamp(0.55 + (yy - y) * 3)), { ...p, sy: h / 0.06 * 0.85, rz: -Math.sin(a) * tilt, rx: -Math.cos(a) * tilt, j: 0.004, v: 0.08, ao: false });
        }
        g.oct(0.032, 0xf4eeff, { ...at(0, 0.725, 0.05), sy: 1.5, ao: false, v: 0 });
        return 0.04;
    },
    crown_slime(_b: Bld, mb: MB) {
        const rim = (az: number) => 0.62 + 0.11 * Math.pow(0.5 + 0.5 * Math.cos(az), 1.2);
        const M = mb.shiny();
        M.add(shellGeo(rim, 0.04, 1, TOP, 0.07), (_x: number, y: number) => rampAt([0x2f7a44, 0x3fa05a, 0x58b96f, 0x86e098], clamp(0.35 + (y - 0.62) * 5)), { j: 0.004, v: 0.06 });
        for (let i = 0; i < 5; i++) {
            const a = i / 5 * PI * 2 + 0.25, y = rim(a) + 0.055, p = at(a, y, 0.045);
            M.cone(0.052, 0.17, 4, (_x: number, yy: number) => rampAt([0x3fa05a, 0x58b96f, 0x86e098, 0xc8ffd2], clamp(0.3 + (yy - y) * 4)), { ...p, y: p.y + 0.06, rz: -Math.sin(a) * 0.25, rx: Math.cos(a) * 0.25, j: 0.003, ao: false });
        }
        for (const [a, l] of [[1.15, 0.13], [-1.35, 0.16], [PI - 0.45, 0.11]]) {
            const p = at(a, rim(a) - 0.01, 0.05);
            M.cone(0.026, l, 4, 0x58b96f, { ...p, y: p.y - l / 2, rx: PI, ao: false, v: 0.03 });
            M.oct(0.04, 0x86e098, { ...p, y: p.y - l, ao: false });
        }
        return 0.02;
    },
    helm_frost(b: Bld) {
        const rim = rimStd(0.54, 0.215), ICE = [0x4a7fa8, 0x6aaed0, 0x9bd6ec, 0xcdeefa];
        b.add(shellGeo(rim, 0.036, 2), hatCol(ICE, rim, null, 0, 6), { j: 0.004, v: 0.06 });
        b.add(shellGeo(rim, 0.056, 1, TOP, 0.065), (x: number, y: number, z: number) => mix(0xf4fbff, 0xcfe2f0, clamp((0.5 - hash(x * 60, z * 60 + y * 9)) * 1.4)), { j: 0.008, v: 0.05 });
        for (const sg of [-1, 1]) {
            const P = [[sg * 0.3, 0.64], [sg * 0.46, 0.7], [sg * 0.56, 0.86], [sg * 0.5, 1.04]], R = [0.078, 0.057, 0.04];
            for (let i = 0; i < 3; i++) {
                const [x0, y0] = P[i], [x1, y1] = P[i + 1], dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
                b.cone(R[i], len * 1.2, 4, (_x: number, y: number) => rampAt([0xaeb8d0, 0xd2dcec, 0xf2f6ff, 0xffffff], clamp(0.45 + (y - 0.6) * 1.6 + i * 0.1)), { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: 0, rz: -Math.atan2(dx, dy), j: 0.004, v: 0.05 });
            }
        }
        return 0.04;
    },
    helm_rift(b: Bld, mb: MB) {
        const rim = rimStd(0.54, 0.22);
        b.add(shellGeo(rim, 0.036, 2), hatCol(VIOLET, rim, VIOLET[0], 0.05, 7), { j: 0.004, v: 0.06 });
        const g = mb.glow(CYAN, 1.5);
        g.oct(0.034, CYAN, { ...at(0, 0.73, 0.045), sy: 1.5, ao: false, v: 0 });
        for (const s of [-1, 1]) g.box(0.05, 0.012, 0.012, CYAN, { ...at(s * 0.3, 0.735, 0.04), ry: s * 0.3, rz: s * -0.25, ao: false, v: 0 });
        return 0.04;
    }
};
export const skirtPts = (hem: number, top: number) => [[hem, 0.11], [top, 0.31]];
/** A body armour: colour ramp, trim, belt and buckle, glove ramp, skirt profile and shoulder pieces (ball, plate, crystal or rock). */
export interface ArmourSpec {
    ramp: readonly number[]; trim: number; belt: number; buckle: number; glove: readonly number[]; skirt: number[][];
    pauld?: { r: number; y: number; x: number; kind: string };
}
/** An armour: its spec, cuff colour and extra parts. */
export interface Armour { spec: ArmourSpec; cuff: number; extra?(b: Bld, mb: MB): void }
/** A gear piece on the farmer: its object, how high it rides, and an animation tick. */
export interface GearPart { g: THREE.Group; lift?: number; tick?: (T: number, move: number, down: number) => void }
export function armourBase(b: Bld, mb: MB, s: ArmourSpec, k: number) {
    const col = (x: number, y: number, z: number) => rampAt(s.ramp, clamp(0.35 + (y - 0.1) * 1.8 + (hash(x * 40 + k, z * 40 + y * 9) - 0.5) * 0.25));
    const M = s.ramp === STEEL || s.ramp === IRON || s.ramp === CRYSTAL ? mb.shiny() : b;
    M.lathe(s.skirt, SEG, col, { ry: AZ0, j: 0.006, v: 0.06 });
    b.lathe([[radiusAt(0.265) + 0.03, 0.245], [radiusAt(0.29) + 0.034, 0.295]], SEG, s.belt, { ry: AZ0, j: 0.003, v: 0.04, ao: false });
    b.oct(0.05, s.buckle, { x: 0, y: 0.27, z: radiusAt(0.27) + 0.04, sz: 0.5, v: 0.04, ao: false });
    if (s.pauld) {
        const pd = s.pauld;
        for (const sg of [-1, 1]) {
            const az = sg * 1.38;
            if (pd.kind === 'rock') {
                const p = at(az, 0.6, 0.05);
                b.ico(0.12, 0, (x: number, y: number, z: number) => rampAt(STONE, clamp(0.45 + (y - 0.6) * 3 + (hash(x * 30, z * 30) - 0.5) * 0.5)), { ...p, sx: 1.1, sy: 0.85, j: 0.035, v: 0.08 });
                b.oct(0.06, STONE[2], { ...at(az + sg * 0.5, 0.55, 0.05), j: 0.01, v: 0.06 });
                b.oct(0.04, 0x5cb04f, { ...at(az, 0.69, 0.05), sy: 0.6, ao: false, j: 0.01 });
                continue;
            }
            const two = pd.kind === 'plate' || pd.kind === 'crystal';
            for (let i = 0; i < (two ? 2 : 1); i++) {
                const y0 = 0.45 + i * 0.09, y1 = y0 + 0.22 - i * 0.03, off = 0.062 + i * 0.02;
                const prof = [[radiusAt(y0) + off * 0.5, y0], [radiusAt((y0 + y1) / 2) + off + 0.03, (y0 + y1) / 2], [radiusAt(y1) + off * 0.55, y1]];
                M.add(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 3, az - 0.75, 1.5), (x: number, y: number) => y < y0 + 0.028 && two ? s.trim : rampAt(s.ramp, clamp(0.5 + (y - 0.58) * 3 - Math.abs(x) * 0.1)), { j: 0.004, v: 0.06 });
            }
            if (pd.kind === 'crystal') {
                const g = mb.glow(0x9a88ff, 1.3);
                for (const [dz, h] of [[0, 0.2], [0.08, 0.13], [-0.08, 0.13]]) g.oct(0.034, 0xcfc4ff, { x: at(az, 0.7, 0.04).x + sg * 0.02, y: 0.74, z: dz, sy: h / 0.034 * 0.6, rz: -sg * 0.5, ao: false, v: 0.05 });
            }
        }
    }
}
export const ARMOURS: Record<string, Armour | undefined> = {
    tunic_cloth: { spec: { ramp: LINEN, trim: LINEN[2], belt: LEATHER[1], buckle: GOLD[2], glove: LINEN, skirt: skirtPts(0.31, 0.345), pauld: { r: 0.07, y: 0.6, x: 0.31, kind: 'ball' } }, cuff: LINEN[0] },
    tunic_hide: {
        spec: { ramp: LEATHER, trim: LEATHER[3], belt: LEATHER[0], buckle: LEATHER[3], glove: LEATHER, skirt: skirtPts(0.31, 0.345), pauld: { r: 0.07, y: 0.6, x: 0.31, kind: 'ball' } },
        cuff: LEATHER[0],
        extra(b: Bld) {
            for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
                const y0 = 0.63 - i * 0.12, y1 = y0 - 0.12, a0 = s * (1.15 - i * 0.12), a1 = s * (1 - i * 0.2);
                const p0 = at(a0, y0, 0.012), p1 = at(a1, y1, 0.012);
                b.rod([p0.x, p0.y, p0.z], [p1.x, p1.y, p1.z], 0.021, 3, LEATHER[1], 0.021, { ao: false, v: 0.04 });
            }
        }
    },
    mail_iron: {
        spec: { ramp: IRON, trim: IRON[4], belt: IRON[0], buckle: IRON[4], glove: IRON, skirt: skirtPts(0.32, 0.35), pauld: { r: 0.088, y: 0.6, x: 0.32, kind: 'ball' } },
        cuff: IRON[0],
        extra(b: Bld) {
            b.lathe([[radiusAt(0.43) + 0.032, 0.405], [radiusAt(0.46) + 0.036, 0.455]], SEG, IRON[2], { ry: AZ0, j: 0.003, v: 0.07, ao: false });
        }
        // the ringed collar
    },
    plate_steel: {
        spec: { ramp: STEEL, trim: GOLD[2], belt: GOLD[1], buckle: GOLD[3], glove: STEEL, skirt: skirtPts(0.33, 0.355), pauld: { r: 0.1, y: 0.6, x: 0.33, kind: 'plate' } },
        cuff: GOLD[1]
    },
    plate_crystal: {
        spec: { ramp: CRYSTAL, trim: CRYSTAL[3], belt: CRYSTAL[0], buckle: 0xf4eeff, glove: CRYSTAL, skirt: skirtPts(0.33, 0.355), pauld: { r: 0.095, y: 0.6, x: 0.33, kind: 'crystal' } },
        cuff: CRYSTAL[3],
        extra(_b: Bld, mb: MB) {
            const g = mb.glow(0x9a88ff, 1.4);
            for (let i = 0; i < 3; i++) {
                const a = i * 1.1 - 1.1, p = at(a, 0.15, 0.1);
                g.oct(0.03, 0xcfc4ff, { ...p, sy: 2.2, rz: -Math.sin(a) * 0.5, rx: Math.cos(a) * 0.5, ao: false, v: 0.05 });
            }
        }
    },
    plate_colossus: {
        spec: { ramp: STONE, trim: STONE[3], belt: STONE[0], buckle: 0x7af0ff, glove: STONE, skirt: skirtPts(0.345, 0.36), pauld: { r: 0.115, y: 0.6, x: 0.34, kind: 'rock' } },
        cuff: STONE[0],
        extra(_b: Bld, mb: MB) {
            const g = mb.glow(CYAN, 1.4);
            for (const a of [-0.45, 0.45]) g.oct(0.026, CYAN, { ...at(a, 0.17, 0.07), sz: 0.5, ao: false, v: 0 });
        }
    },
    plate_rift: {
        spec: { ramp: VIOLET, trim: CYAN, belt: VIOLET[0], buckle: CYAN, glove: VIOLET, skirt: skirtPts(0.33, 0.355), pauld: { r: 0.098, y: 0.6, x: 0.33, kind: 'plate' } },
        cuff: CYAN,
        extra(_b: Bld, mb: MB) {
            const g = mb.glow(CYAN, 1.8);
            for (const a of [-0.6, 0.6]) g.oct(0.024, CYAN, { ...at(a, 0.17, 0.07), sy: 1.6, sz: 0.5, ao: false, v: 0 });
        }
    },
    cloak_shroud: { spec: { ramp: WRAITH, trim: GOLD[2], belt: WRAITH[0], buckle: GOLD[2], glove: WRAITH, skirt: [] }, cuff: WRAITH[1] }
};
export function capePart(): GearPart {
    const g = new THREE.Group(), pivot = new THREE.Group();
    pivot.position.set(0, 0.72, -0.1);
    g.add(pivot);
    const body = bakeCloth('farmer.cape', (c) => {
        const col = (x: number, y: number, z: number) => rampAt([0x3a3160, 0x544b82, 0x7c72aa, 0xa49ad0], clamp(0.5 + (y - 0.05) * 0.5 + (hash(x * 30, z * 30 + y * 7) - 0.5) * 0.3 + (Math.abs(x) > 0.3 ? 0.08 : 0)));
        const pts = [[0.45, -0.62], [0.41, -0.44], [0.36, -0.26], [0.31, -0.09], [0.27, 0]].map(([r, y]) => new THREE.Vector2(r, y));
        c.add(new THREE.LatheGeometry(pts, 7, PI * 0.5 + 0.35, PI - 0.7), col, { j: 0.025, v: 0.09, z: 0.1 });
    });
    pivot.add(body);
    const clasp = fbake('farmer.cape.clasp', (b: Bld) => {
        b.ico(0.04, 0, GOLD[2], { ao: false });
    });
    clasp.position.set(0, 0.45, 0.35);
    g.add(clasp);
    return {
        g,
        tick: (T: number, move: number, down: number) => {
            pivot.rotation.x = 0.04 + move * (0.24 + 0.06 * Math.sin(T * 7)) + down * 0.2 + Math.sin(T * 1.6) * 0.03;
            pivot.rotation.z = Math.sin(T * 5 + 1) * 0.06 * move + Math.sin(T * 1.3) * 0.02;
        }
    };
}
export const strap = (b: Bld, col: Col, sg: number, y0 = 0.64, y1 = 0.3) => {
    const p0 = at(sg * 1.25, y0, 0.014), p1 = at(sg * 1.05, y1, 0.014);
    b.rod([p0.x, p0.y, p0.z], [p1.x, p1.y, p1.z], 0.024, 3, col, 0.024, { ao: false, v: 0.04 });
};
export const PACKS: Record<string, ((b: Bld, mb: MB) => void) | undefined> = {
    bag_satchel(b: Bld) {
        b.box(0.17, 0.14, 0.085, LEATHER[1], { x: 0.34, y: 0.27, z: 0.1, ry: 0.45, j: 0.004, v: 0.06 });
        b.box(0.18, 0.06, 0.095, LEATHER[0], { x: 0.34, y: 0.325, z: 0.1, ry: 0.45, v: 0.05 });
        b.box(0.035, 0.04, 0.02, GOLD[2], { x: 0.395, y: 0.285, z: 0.14, ry: 0.45, ao: false });
        const a = at(-1.2, 0.62, 0.015), c = at(-0.35, 0.44, 0.02), d = at(0.55, 0.3, 0.03);
        b.rod([a.x, a.y, a.z], [c.x, c.y, c.z], 0.02, 3, LEATHER[0], 0.02, { ao: false, v: 0.04 });
        b.rod([c.x, c.y, c.z], [d.x, d.y, d.z], 0.02, 3, LEATHER[0], 0.02, { ao: false, v: 0.04 });
        b.rod([d.x, d.y, d.z], [0.3, 0.33, 0.1], 0.02, 3, LEATHER[0], 0.02, { ao: false, v: 0.04 });
    },
    bag_rucksack(b: Bld) {
        const col = (x: number, y: number, z: number) => rampAt(LEATHER, clamp(0.5 + (y - 0.5) * 1.2 + (hash(x * 40, z * 40 + y * 5) - 0.5) * 0.3));
        b.ico(0.3, 0, col, { y: 0.5, z: -0.34, sx: 1, sy: 1.15, sz: 0.62, j: 0.02, v: 0.07 });
        b.ico(0.16, 0, col, { y: 0.86, z: -0.32, sx: 1.15, sy: 0.7, sz: 0.7, j: 0.012, v: 0.07 });
        for (const s of [-1, 1]) b.ico(0.085, 0, LEATHER[2], { x: s * 0.27, y: 0.36, z: -0.3, sy: 1.25, sz: 0.8, j: 0.008 });
        b.box(0.26, 0.025, 0.04, LEATHER[0], { y: 0.76, z: -0.46, ao: false });
        for (const s of [-1, 1]) strap(b, LEATHER[1], s);
    },
    bag_pack(b: Bld) {
        const col = (x: number, y: number, z: number) => rampAt(CANVAS, clamp(0.5 + (y - 0.5) * 1.1 + (hash(x * 40, z * 40 + y * 5) - 0.5) * 0.3));
        b.ico(0.33, 0, col, { y: 0.5, z: -0.35, sx: 1.05, sy: 1.15, sz: 0.65, j: 0.02, v: 0.07 });
        b.cyl(0.075, 0.075, 0.5, 5, (x: number, y: number) => rampAt([0x6a4a30, 0x8a6240, 0xb08050, 0xd8a870], clamp(0.5 + y * 0.6 + hash(x * 20, y * 20) * 0.3)), { y: 0.92, z: -0.35, rz: PI / 2, j: 0.008, v: 0.06 });
        for (const s of [-1, 1]) {
            b.oct(0.1, CANVAS[1], { x: s * 0.3, y: 0.35, z: -0.28, sy: 1.3, sz: 0.8, j: 0.008 });
            strap(b, CANVAS[2], s);
        }
    },
    bag_frame(b: Bld, mb: MB) {
        const M = mb.shiny();
        for (const s of [-1, 1]) M.rod([s * 0.24, 0.12, -0.36], [s * 0.24, 1.18, -0.36], 0.026, 3, IRON[2], 0.026, { v: 0.05 });
        for (const y of [0.15, 1.18]) M.rod([-0.24, y, -0.36], [0.24, y, -0.36], 0.022, 3, IRON[1], 0.022, { v: 0.05 });
        b.box(0.4, 0.3, 0.3, (x: number, y: number) => rampAt(WOODR, clamp(0.5 + (y - 0.9) * 2 + (hash(x * 20, y * 20) - 0.5) * 0.4)), { y: 0.95, z: -0.4, j: 0.006, v: 0.07 });
        b.box(0.4, 0.04, 0.32, WOODR[1], { y: 0.95, z: -0.4, ao: false });
        b.cyl(0.14, 0.14, 0.42, 5, (x: number, y: number) => rampAt([0xb8841e, 0xdcaa38, 0xf0cc58, 0xfff0a0], clamp(0.5 + y * 0.5 + hash(x * 20, y * 20) * 0.4)), { y: 0.42, z: -0.42, rz: PI / 2, j: 0.01, v: 0.07 });
        for (const s of [-1, 1]) strap(b, IRON[1], s);
    },
    bag_rift(b: Bld) {
        const col = (x: number, y: number, z: number) => rampAt(VIOLET, clamp(0.5 + (y - 0.5) * 1.1 + (hash(x * 40, z * 40 + y * 5) - 0.5) * 0.3));
        b.ico(0.32, 0, col, { y: 0.52, z: -0.35, sx: 1.05, sy: 1.12, sz: 0.65, j: 0.02, v: 0.07 });
        b.ico(0.15, 0, col, { y: 0.88, z: -0.33, sx: 1.1, sy: 0.7, sz: 0.7, j: 0.012, v: 0.07 });
        for (const s of [-1, 1]) strap(b, VIOLET[2], s);
    }
};
export const CHARM_AT = { x: -0.06, y: 0.3, z: 0.385 };
export const cord = (b: Bld, col: Col) => {
    for (const s of [-1, 1]) b.rod([s * 0.19, 0.38, 0.3], [0, CHARM_AT.y + 0.05, CHARM_AT.z], 0.008, 3, col, 0.008, { ao: false, v: 0 });
};
export const CHARMS: Record<string, ((b: Bld, mb: MB) => void) | undefined> = {
    charm_lucky(b: Bld) {
        cord(b, 0x6a5238);
        for (let i = 0; i < 4; i++) {
            const a = i * PI / 2 + PI / 4;
            b.ico(0.032, 0, (_x: number, y: number) => rampAt([0x3f8a4c, 0x5cb04f, 0x86cc5c, 0xb9e47c], clamp(0.6 + (y - CHARM_AT.y) * 6)), { x: CHARM_AT.x + Math.sin(a) * 0.036, y: CHARM_AT.y + Math.cos(a) * 0.036, z: CHARM_AT.z, sz: 0.6, ao: false });
        }
    },
    charm_swift(b: Bld) {
        cord(b, 0x6a5238);
        b.hull([[0, 0.06, 0], [0.03, 0, 0], [-0.03, 0, 0], [0, -0.07, 0], [0, 0, 0.01]], 0xf4fbff, { ...CHARM_AT, rz: 0.4, ao: false, v: 0.04 });
        b.rod([CHARM_AT.x - 0.01, CHARM_AT.y + 0.05, CHARM_AT.z], [CHARM_AT.x + 0.02, CHARM_AT.y - 0.07, CHARM_AT.z], 0.004, 3, 0xa8d8f0, 0.004, { ao: false });
    },
    charm_vital(b: Bld, mb: MB) {
        cord(b, 0x6a5238);
        const g = mb.shiny();
        for (const s of [-1, 1]) g.ico(0.032, 0, 0xf0a020, { x: CHARM_AT.x + s * 0.026, y: CHARM_AT.y + 0.01, z: CHARM_AT.z, ao: false });
        g.cone(0.05, 0.07, 4, 0xdc8a14, { ...CHARM_AT, y: CHARM_AT.y - 0.045, rx: PI, ao: false });
    },
    charm_hex(b: Bld, mb: MB) {
        cord(b, 0x5a4a6a);
        mb.glow(0xb070ff, 1.3).oct(0.045, 0x9a5ad0, { ...CHARM_AT, sy: 1.4, ao: false, v: 0.06 });
    },
    charm_scarab(b: Bld, mb: MB) {
        cord(b, 0xc8a050);
        mb.shiny().ico(0.045, 0, 0x2fa090, { ...CHARM_AT, sx: 0.85, sy: 1.1, sz: 0.7, ao: false });
        b.box(0.07, 0.014, 0.02, GOLD[2], { ...CHARM_AT, y: CHARM_AT.y + 0.005, z: CHARM_AT.z + 0.03, ao: false });
    },
    charm_rift(b: Bld, mb: MB) {
        cord(b, 0x5a4a8a);
        mb.glow(CYAN, 1.7).oct(0.05, CYAN, { ...CHARM_AT, sy: 1.5, ao: false, v: 0.05 });
    },
    charm_heart(b: Bld, mb: MB) {
        cord(b, 0xc8a050);
        const g = mb.shiny();
        for (const s of [-1, 1]) g.ico(0.034, 0, 0xe85d62, { x: CHARM_AT.x + s * 0.028, y: CHARM_AT.y + 0.01, z: CHARM_AT.z, ao: false });
        g.cone(0.056, 0.075, 4, 0xc9505a, { ...CHARM_AT, y: CHARM_AT.y - 0.045, rx: PI, ao: false });
    },
    charm_fortune(b: Bld, mb: MB) {
        cord(b, 0xc8a050);
        b.box(0.06, 0.07, 0.06, GOLD[1], { ...CHARM_AT, y: CHARM_AT.y - 0.01, ao: false, v: 0.05 });
        b.cone(0.045, 0.04, 4, GOLD[2], { ...CHARM_AT, y: CHARM_AT.y + 0.05, ao: false });
        mb.glow(0xffd966, 1.7).oct(0.022, 0xfff3b0, { ...CHARM_AT, y: CHARM_AT.y - 0.01, z: CHARM_AT.z + 0.02, ao: false, v: 0 });
    }
};
export function headPart(id: string | undefined): GearPart | null {
    const f = id ? HEADS[id] : undefined;
    if (!f) return null;
    const g = fbake(`farmer.head.${id}`, (b: Bld, mb: MB) => {
        f(b, mb);
    });
    const part: GearPart = { g, lift: HEAD_LIFT[id!] ?? 0.03 };
    if (id === 'helm_rift') {
        const shards = fbake('farmer.head.rift.shards', (_b, mb: MB) => {
            const gl = mb.glow(CYAN, 1.7);
            for (let i = 0; i < 3; i++) {
                const a = i * 2.09;
                gl.oct(0.034, CYAN, { x: Math.sin(a) * 0.4, y: 0, z: Math.cos(a) * 0.4, sy: 1.6, ry: a, ao: false, v: 0.05 });
            }
        }, false);
        const pv = new THREE.Group();
        pv.position.y = 0.78;
        pv.add(shards);
        g.add(pv);
        part.tick = (T: number) => {
            pv.rotation.y = T * 0.9;
            pv.position.y = 0.78 + Math.sin(T * 1.7) * 0.03;
        };
    }
    return part;
}
export const HEAD_LIFT: Record<string, number | undefined> = { cap_cloth: 0.03, cap_hide: 0.032, helm_iron: 0.036, helm_steel: 0.05, helm_crystal: 0.04, crown_slime: 0.02, helm_frost: 0.04, helm_rift: 0.04 };
/** The worn body armour: its object (none for a cloak), a cape, the gloves' ramp and the cuff colour. */
export interface BodyPart { g: THREE.Group | null; cape?: GearPart; glove: readonly number[]; cuff: number; tick?: GearPart['tick'] }
export function bodyPart(id: string | undefined): BodyPart | null {
    const a = id ? ARMOURS[id] : undefined;
    if (!a) return null;
    if (id === 'cloak_shroud') return { g: null, cape: capePart(), glove: WRAITH, cuff: WRAITH[1] };
    const g = fbake(`farmer.armour.${id}`, (b: Bld, mb: MB) => {
        armourBase(b, mb, a.spec, 1);
        a.extra?.(b, mb);
    });
    return { g, glove: a.spec.glove, cuff: a.cuff };
}
export function bagPart(id: string | undefined): GearPart | null {
    const f = id ? PACKS[id] : undefined;
    if (!f) return null;
    const g = fbake(`farmer.bag.${id}`, (b: Bld, mb: MB) => f(b, mb));
    const part: GearPart = { g };
    if (id === 'bag_rift') {
        const ring = fbake('farmer.bag.rift.ring', (_b, mb: MB) => {
            mb.glow(CYAN, 1.6).torus(0.15, 0.018, 3, 8, CYAN, { ao: false, v: 0 });
            mb.glow(CYAN, 1.6).oct(0.035, 0xffffff, { x: 0.15, ao: false, v: 0 });
        }, false);
        const pv = new THREE.Group();
        pv.position.set(0, 0.52, -0.52);
        pv.add(ring);
        g.add(pv);
        part.tick = (T: number) => {
            pv.rotation.z = T * 0.8;
            pv.scale.setScalar(1 + Math.sin(T * 2.2) * 0.05);
        };
    }
    return part;
}
export function charmPart(id: string | undefined): GearPart | null {
    const f = id ? CHARMS[id] : undefined;
    if (!f) return null;
    const g = fbake(`farmer.charm.${id}`, (b: Bld, mb: MB) => f(b, mb));
    const pv = new THREE.Group();
    pv.position.set(CHARM_AT.x, CHARM_AT.y + 0.04, CHARM_AT.z);
    pv.scale.setScalar(1.35);
    pv.add(g);
    g.position.set(-CHARM_AT.x, -CHARM_AT.y - 0.04, -CHARM_AT.z);
    return { g: pv, tick: (T: number, move: number) => {
        pv.rotation.x = Math.sin(T * 2.6) * 0.04 + move * 0.18 * Math.sin(T * 12);
    } };
}

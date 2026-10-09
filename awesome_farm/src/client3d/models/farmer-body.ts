// The farmer's body parts: body, eyes, mouth, sprout, scarf, tail, feet and hands.
import * as THREE from 'three';
import { BODY_TONES } from '../../shared/data/look';
import { azAt, EYE_COL, FACE, fbake, LEAFR, lit, MOUTH_COL, PROFILE, radiusAt, ramp4, rampAt, SCARF_Y, surfY, WOODR } from './farmer-base';
import { Bld, clamp, hash, mix, type Pt, smooth } from './kit';

export const BLOSSOM = [0xd9709a, 0xf08cb4, 0xf79fc6, 0xffd0e4];
export const REDR = [0x9a3446, 0xc9505a, 0xe8737a, 0xf59a96];
export const GOLD3 = [0xc58f3e, 0xe0a020, 0xffd966, 0xfff3b0];
export const PI = Math.PI;
export const toneRamp = (tone: number) => {
    if (tone === 0) return [0xd9bfae, 0xecd5bb, 0xfff0d2, 0xfffaf0];
    const c = BODY_TONES[tone].color;
    return [mix(c, 0x8a5a4a, 0.3), mix(c, 0x8a5a4a, 0.1), c, mix(c, 0xffffff, 0.55)];
};
export const bellyRamp = (tone: number) => tone === 0 ? [0xcf9fb8, 0xe2b8cc, 0xefcfdc, 0xf6dde6] : toneRamp(tone).map((c) => mix(c, 0xe28aa8, 0.3));
export const on = (x: number, y: number, off = 0, cone = false) => {
    const s = surfY(azAt(x, y), y, off);
    return { x: s.x, y: s.y, z: s.z, ry: s.ry, rx: cone ? PI / 2 + s.rx : s.rx };
};
export function bodyGroup(tone: number) {
    return fbake(`farmer.body.${tone}`, (b: Bld) => {
        const body = toneRamp(tone), belly = bellyRamp(tone);
        const col = (_x: number, y: number, z: number) => {
            const t = lit(y) * 0.95 + (hash(_x * 31, z * 17 + y * 5) - 0.5) * 0.14;
            return mix(rampAt(body, t), rampAt(belly, t), smooth(0.42, 0.3, y));
        };
        b.lathe(PROFILE, 12, col, { ry: PI / 12, j: 0.012, v: 0.035 });
        for (const s of [-1, 1]) b.cone(0.064, 0.034, 5, 0xf59aa8, { ...on(s * FACE.cheekX, FACE.cheekY, 0.01, true), sx: 1.2, sz: 0.85, ao: false, v: 0.03 });
    });
}
export const EYE_LINE = FACE.eyeY;
export function eyesGroup(style: number) {
    return fbake(`farmer.eyes.${style}`, (b: Bld) => {
        for (const s of [-1, 1]) {
            const ex = s * FACE.eyeX, ey = FACE.eyeY, dy = -EYE_LINE;
            const p = on(ex, ey, 0.004, true);
            const base = { x: p.x, y: p.y + dy, z: p.z, ry: p.ry, rx: p.rx, ao: false, v: 0.02 };
            const at = (ox: number, oy: number, off: number) => {
                const q = on(ex + ox, ey + oy, off);
                return { x: q.x, y: q.y + dy, z: q.z };
            };
            if (style === 1) {
                const q = on(ex, ey - 0.012, 0.014);
                b.add(new THREE.TorusGeometry(0.043, 0.0125, 3, 5, PI), EYE_COL, { x: q.x, y: q.y + dy, z: q.z, ry: q.ry, rx: q.rx, ao: false, v: 0 });
            } else if (style === 2) {
                b.cone(0.05, 0.04, 7, EYE_COL, { ...base, sz: 1.55 });
                b.oct(0.021, 0xffffff, { ...at(-0.03 * s, 0.045, 0.03), ao: false, v: 0 });
                b.tet(0.013, 0xffffff, { ...at(0.03 * s, -0.04, 0.026), ao: false, v: 0 });
                b.oct(0.014, 0x9a7ab0, { ...at(0, -0.075, 0.024), sy: 0.6, ao: false, v: 0 });
            } else if (style === 3) {
                const q = on(ex, ey - 0.01, 0.012);
                b.box(0.09, 0.02, 0.016, EYE_COL, { x: q.x, y: q.y + dy, z: q.z, ry: q.ry, rx: q.rx, rz: s * 0.08, ao: false, v: 0 });
                b.box(0.02, 0.03, 0.014, EYE_COL, { ...at(-s * 0.045, -0.02, 0.012), ry: q.ry, rx: q.rx, ao: false, v: 0 });
            } else {
                b.cone(0.041, 0.04, 6, EYE_COL, { ...base, sz: 1.5 });
                b.tet(0.02, 0xffffff, { ...at(-0.02 * s, 0.04, 0.03), ao: false, v: 0 });
            }
        }
    }, false);
}
export function koEyesGroup() {
    return fbake('farmer.eyes.ko', (b: Bld) => {
        for (const s of [-1, 1]) {
            const q = on(s * FACE.eyeX, FACE.eyeY, 0.016);
            for (const a of [0.78, -0.78]) b.box(0.09, 0.016, 0.014, EYE_COL, { x: q.x, y: q.y - EYE_LINE, z: q.z, ry: q.ry, rx: q.rx, rz: a, ao: false, v: 0 });
        }
    }, false);
}
export function mouthGroup(style: number) {
    return fbake(`farmer.mouth.${style}`, (b: Bld) => {
        const q = on(0, FACE.mouthY, 0.012);
        const base = { x: q.x, y: q.y, z: q.z, ry: 0, rx: q.rx, ao: false, v: 0 };
        if (style === 1) {
            const pts = [[-0.085, 0, 0], [0.085, 0, 0], [-0.08, 0, 0.018], [0.08, 0, 0.018], [-0.062, -0.034, 0.012], [0.062, -0.034, 0.012], [-0.03, -0.062, 0.012], [0.03, -0.062, 0.012], [0, -0.07, 0.01]];
            b.hull(pts, MOUTH_COL, { ...base, y: base.y + 0.03 });
            b.hull([[-0.034, -0.032, 0.006], [0.034, -0.032, 0.006], [-0.03, -0.052, 0.014], [0.03, -0.052, 0.014], [0, -0.062, 0.01], [0, -0.034, 0.02]], 0xe8737a, { ...base, y: base.y + 0.03, z: base.z + 0.004 });
        } else if (style === 2) {
            const P = [[-0.075, 0.012], [-0.04, -0.02], [0, 0.012], [0.04, -0.02], [0.075, 0.012]];
            for (let i = 0; i < 4; i++) b.hull(strip(P[i], P[i + 1], 0.0085), MOUTH_COL, { ...base });
        } else if (style === 3) {
            const qc = on(0, FACE.mouthY, 0.008, true);
            b.cone(0.036, 0.03, 7, MOUTH_COL, { x: qc.x, y: qc.y, z: qc.z, ry: 0, rx: qc.rx, ao: false, v: 0 });
            const qd = on(0, FACE.mouthY - 0.016, 0.014, true);
            b.cone(0.018, 0.03, 5, 0xb86a78, { x: qd.x, y: qd.y, z: qd.z, ry: 0, rx: qd.rx, ao: false, v: 0 });
        } else {
            b.add(new THREE.TorusGeometry(0.052, 0.0105, 3, 4, PI), MOUTH_COL, { ...base, y: base.y + 0.036, rz: PI, z: base.z + 0.002 });
        }
    }, false);
}
export function strip(a: Pt, b: Pt, w: number) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * w, ny = dx / l * w;
    return [[a[0] + nx, a[1] + ny, 0], [a[0] - nx, a[1] - ny, 0], [b[0] + nx, b[1] + ny, 0], [b[0] - nx, b[1] - ny, 0], [a[0], a[1], 0.012], [b[0], b[1], 0.012]];
}
export const leafCol = (y0: number, y1: number, k = 0) => (x: number, y: number, z: number) => rampAt(LEAFR, clamp(0.42 + (y - y0) / (y1 - y0) * 0.5 - x * 0.35 + (hash(x * 40 + k, z * 40 + y * 9) - 0.5) * 0.2));
export function sproutGroup(style: number) {
    return fbake(`farmer.sprout.${style}`, (b: Bld) => {
        const stemTop = style === 3 ? 0.07 : style === 4 ? 0.12 : 0.15;
        const stemCol = style === 4 ? (_x: number, y: number) => rampAt(WOODR, clamp(0.4 + y * 1.2)) : (_x: number, y: number) => rampAt(LEAFR, clamp(0.28 + y * 1.1));
        b.cyl(style === 4 ? 0.022 : 0.02, style === 4 ? 0.034 : 0.032, stemTop + 0.1, 5, stemCol, { y: (stemTop - 0.1) / 2, j: 0.004, v: 0.04 });
        if (style === 0) {
            b.leaf(0.27, 0.07, 0.014, leafCol(0.1, 0.3, 1), { x: -0.01, y: 0.13, ry: -PI / 2 - 0.15, rx: -0.38, j: 0.006 });
            b.leaf(0.27, 0.07, 0.014, leafCol(0.1, 0.35, 2), { x: 0.01, y: 0.15, ry: PI / 2 + 0.1, rx: -0.62, j: 0.006 });
            b.leaf(0.17, 0.052, 0.012, leafCol(0.15, 0.35, 3), { x: 0, y: 0.16, ry: 0.2, rx: -1.25, j: 0.005 });
        } else if (style === 1) {
            b.leaf(0.15, 0.05, 0.012, leafCol(0.05, 0.2, 4), { x: -0.01, y: 0.06, ry: -PI / 2 - 0.2, rx: -0.5, j: 0.004 });
            const fy = 0.215, tilt = 0.42;
            const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
            const qT = new THREE.Quaternion().setFromAxisAngle(X, tilt);
            for (let i = 0; i < 5; i++) {
                const a = i / 5 * PI * 2 + 0.3;
                const q = qT.clone().multiply(new THREE.Quaternion().setFromAxisAngle(Y, a)).multiply(new THREE.Quaternion().setFromAxisAngle(X, -0.22));
                b.leaf(0.135, 0.062, 0.016, (x: number, y: number) => rampAt(BLOSSOM, clamp(0.45 + (y - fy) * 3 + (hash(x * 50, i) - 0.5) * 0.3)), { q, x: 0, y: fy, z: 0, j: 0.004, ao: false });
            }
            b.ico(0.048, 0, (_x: number, y: number) => rampAt(GOLD3, clamp(0.5 + (y - fy) * 6)), { x: 0, y: fy + 0.014, z: 0.012, sy: 0.8, j: 0.004, ao: false });
        } else if (style === 2) {
            const P = [[0.015, 0.13], [0.1, 0.2], [0.2, 0.24], [0.29, 0.2], [0.325, 0.12], [0.285, 0.07]];
            const W = [0.03, 0.06, 0.07, 0.055, 0.037, 0.02];
            for (let i = 0; i < P.length - 1; i++) b.hull(ribbon(P[i], P[i + 1], W[i], W[i + 1], 0.016), leafCol(0.1, 0.3, 5 + i), { j: 0.004, v: 0.07 });
            b.leaf(0.17, 0.05, 0.012, leafCol(0.08, 0.2, 9), { x: -0.01, y: 0.1, ry: -PI / 2 - 0.1, rx: -0.3, j: 0.005 });
        } else if (style === 3) {
            const bl = [[-0.07, 0, 0.3, -0.17, -0.03, 0.026], [-0.03, 0.02, 0.26, -0.06, 0.04, 0.022], [0, -0.03, 0.34, 0, -0.04, 0.024], [0.03, 0.02, 0.27, 0.07, 0.04, 0.022], [0.07, 0, 0.31, 0.17, -0.03, 0.026]];
            bl.forEach(([x, z, h, lx, lz, w], i) => b.blade(x * 0.5, z, h, lx, lz, w * 1.3, leafCol(-0.15, 0.3, i), { y: 0.04, j: 0.006, v: 0.07 }));
        } else {
            const tw = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r0: number, r1: number) => b.rod([x0, y0, z0], [x1, y1, z1], r0, 3, (_x: number, y: number) => rampAt(WOODR, clamp(0.35 + y * 1.4)), r1, { j: 0.004, v: 0.05 });
            tw(0, 0.05, 0, -0.11, 0.22, 0.01, 0.024, 0.014);
            tw(-0.11, 0.22, 0.01, -0.19, 0.3, 0, 0.014, 0.008);
            tw(0.005, 0.08, 0, 0.11, 0.25, -0.01, 0.022, 0.012);
            tw(0.11, 0.25, -0.01, 0.17, 0.31, 0.01, 0.012, 0.007);
            tw(-0.07, 0.15, 0.01, -0.02, 0.27, 0.02, 0.011, 0.006);
            b.oct(0.05, (_x: number, y: number) => rampAt(REDR, clamp(0.55 + (y - 0.3) * 5)), { x: -0.2, y: 0.31, z: 0, j: 0.004, ao: false });
            b.oct(0.046, (_x: number, y: number) => rampAt(REDR, clamp(0.55 + (y - 0.31) * 5)), { x: 0.18, y: 0.32, z: 0.012, j: 0.004, ao: false });
        }
    }, false);
}
export function ribbon(a: Pt, b: Pt, wa: number, wb: number, th: number) {
    return [[a[0], a[1], wa], [a[0], a[1], -wa], [a[0], a[1] + th, 0], [b[0], b[1], wb], [b[0], b[1], -wb], [b[0], b[1] + th, 0]];
}
export const KNOT = { x: 0.18, y: SCARF_Y - 0.005, z: 0.31 };
export function scarfGroup(color: number) {
    return fbake(`farmer.scarf.${color}`, (b: Bld) => {
        const r = ramp4(color);
        const R = radiusAt(SCARF_Y) + 0.002;
        b.lathe([[R - 0.015, SCARF_Y - 0.052], [R + 0.042, SCARF_Y - 0.004], [R - 0.015, SCARF_Y + 0.05]], 12, (_x: number, y: number) => rampAt(r, clamp(0.55 + (y - SCARF_Y) * 8)), { ry: PI / 12, j: 0.006, v: 0.04 });
        b.oct(0.085, (_x: number, y: number) => rampAt(r, clamp(0.6 + (y - KNOT.y) * 3)), { x: KNOT.x, y: KNOT.y, z: KNOT.z, sx: 1, sy: 0.85, sz: 0.95, j: 0.006, v: 0.05 });
    });
}
export function tailGroup(color: number) {
    return fbake(`farmer.tail.${color}`, (b: Bld) => {
        const r = ramp4(color);
        const tail = (len: number, w: number, rz: number, rx: number, x: number, z: number, k: number) => b.hull(
            [[-w * 0.5, 0, 0.012], [w * 0.5, 0, 0.012], [-w * 0.5, 0, -0.012], [w * 0.5, 0, -0.012], [-w * 0.4, -len * 0.85, 0], [w * 0.4, -len * 0.85, 0], [0, -len, 0]],
            (_x: number, y: number) => rampAt(r, clamp(0.78 + y * 1.1 + k * 0.1)),
            { x, z, rz, rx, j: 0.004, v: 0.05 }
        );
        tail(0.26, 0.085, -0.16, 0.12, 0.012, 0.01, 0);
        tail(0.18, 0.07, 0.34, 0.06, 0, -0.005, -1);
    });
}
export function footGroup() {
    return fbake('farmer.foot', (b: Bld) => {
        b.ico(0.1, 0, (_x: number, y: number) => rampAt(WOODR, clamp(0.3 + (y - 0.05) * 5)), { y: 0.065, z: 0.045, sy: 0.66, sz: 1.4, j: 0.006, v: 0.05 });
    });
}
export function handGroup(tone: number, ramp?: readonly number[]) {
    return fbake(`farmer.hand.${tone}.${ramp ? ramp[1] : ''}`, (b: Bld) => {
        const r = ramp ?? toneRamp(tone);
        b.ico(0.074, 0, (x: number, y: number) => rampAt(r, clamp(0.72 + y * 3 - x * 1.5)), { j: 0.004, v: 0.05 });
    });
}

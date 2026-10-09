// Logistics: belts, splitters, sorters, tunnels and inserters, with items riding them.
import * as THREE from 'three';
import type { BuildE } from '../../shared/sim/types';
import { bake, Bld, type BOpts, clamp, Col, E, flicker, MB, mix, type Model, smooth } from './kit';
import { chipPool, dirWrap, ic, IR, isWorking, itemColor, localMask } from './b-work-util';

export const PLATE = 0x3b3668;
export const TOP = 0.06;
export const PEBBLE = 0xd5d9e6;
export const STONE = 0x9ea4b9;
export const SLATE = 0x666b86;
export const SPEED = 1.5;
export const RAILC = (_x: number, y: number) => y > 0.1 ? PEBBLE : STONE;
export function chevron(mb: MB, col = PEBBLE, s = 1) {
    const a = 0.9, L = 0.27 * s;
    for (const sgn of [-1, 1]) mb.main.box(L, 0.016, 0.062 * s, col, { x: 0, y: 0.008, z: sgn * 0.1 * s, ry: sgn * a, j: 0.002, ao: false, v: 0.03 });
}
export const chevMesh = (s = 1, col = PEBBLE) => bake(`belt.chev|${s}|${col}`, (mb) => chevron(mb, col, s));
export const railX = (b: Bld, x0: number, x1: number, z: number) => b.box(x1 - x0, 0.075, 0.085, RAILC, { x: (x0 + x1) / 2, y: 0.095, z, j: 0.004, v: 0.05 });
export const railZ = (b: Bld, z0: number, z1: number, x: number) => b.box(0.085, 0.075, z1 - z0, RAILC, { x, y: 0.095, z: (z0 + z1) / 2, j: 0.004, v: 0.05 });
/** Which way a belt piece bends and which sides have rails stubs. */
export interface BeltShape { curve: boolean; L: boolean; R: boolean }
export function beltBody(mb: MB, sh: BeltShape) {
    const b = mb.main;
    if (!sh.curve) {
        b.box(1, 0.06, 0.9, PLATE, { y: 0.03, j: 0.004, v: 0.05 });
        for (const [side, stub] of [[-1, sh.L], [1, sh.R]] as [number, boolean][]) {
            const z = side * 0.4125;
            if (stub) {
                railX(b, -0.5, -0.22, z);
                railX(b, 0.22, 0.5, z);
                b.box(0.4, 0.06, 0.06, PLATE, { y: 0.03, z: side * 0.48, j: 0.004, v: 0.05 });
                for (const x of [-0.2, 0.2]) railZ(b, Math.min(side * 0.45, side * 0.5), Math.max(side * 0.45, side * 0.5), x);
            } else railX(b, -0.5, 0.5, z);
            if (!stub) for (const bx of [-0.25, 0.25]) b.tet(0.032, 0xeef0f8, { x: bx, y: 0.14, z, sy: 0.7, ao: false, v: 0.04 });
        }
        return;
    }
    b.box(0.95, 0.06, 0.9, PLATE, { x: 0.025, y: 0.03, j: 0.004, v: 0.05 });
    for (const [side, on] of [[-1, sh.L], [1, sh.R]] as [number, boolean][]) if (on) b.box(0.9, 0.06, 0.06, PLATE, { y: 0.03, z: side * 0.48, j: 0.004, v: 0.05 });
    railZ(b, -0.5, 0.5, -0.4125);
    if (sh.L && sh.R) {
        railZ(b, -0.5, -0.37, 0.4125);
        railZ(b, 0.37, 0.5, 0.4125);
        railX(b, 0.37, 0.5, -0.4125);
        railX(b, 0.37, 0.5, 0.4125);
    } else {
        const s = sh.L ? -1 : 1;
        railX(b, -0.45, 0.5, -s * 0.4125);
        railZ(b, s < 0 ? -0.5 : 0.37, s < 0 ? -0.37 : 0.5, 0.4125);
        railX(b, 0.37, 0.5, s * 0.4125);
    }
}
export function makeChevs(n: number, s = 1) {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ g: chevMesh(s) });
    return out;
}
export function belt(o: BOpts): Model<BuildE> {
    const m = localMask(o.mask, o.rot);
    const curve = !m.back && (m.left || m.right);
    const sh = { curve, L: m.left, R: m.right };
    const inner = new THREE.Group();
    inner.add(bake(`belt|${curve ? 'c' : 's'}|${sh.L ? 1 : 0}${sh.R ? 1 : 0}`, (mb) => beltBody(mb, sh)));
    const fadeBack = !m.back && !curve, fadeFwd = !m.fwd;
    const paths: { side: number; list: { g: THREE.Group; }[]; }[] = [];
    if (curve) {
        if (sh.L) paths.push({ side: -1, list: makeChevs(2) });
        if (sh.R) paths.push({ side: 1, list: makeChevs(2) });
    } else paths.push({ side: 0, list: makeChevs(2) });
    for (const p of paths) for (const c of p.list) inner.add(c.g);
    const stubs: { side: number; c: { g: THREE.Group; }; }[] = [];
    if (!curve) {
        if (sh.L) stubs.push({ side: -1, c: { g: chevMesh(0.7) } });
        if (sh.R) stubs.push({ side: 1, c: { g: chevMesh(0.7) } });
    }
    for (const s of stubs) inner.add(s.c.g);
    const chips = chipPool(3, 0.085);
    inner.add(chips.group);
    const pathAt = (p: number) => {
        if (!curve) return [-0.5 + p, 0];
        const side = sh.L ? -1 : 1;
        return p < 0.5 ? [0, side * (0.5 - p)] : [p - 0.5, 0];
    };
    let prevItems: (string | null)[] = [null, null, null];
    const off = [0, 0, 0], cur: (string | null)[] = [null, null, null];
    const putChips = () => {
        for (let i = 0; i < 3; i++) {
            const [x, z] = pathAt((i + 0.5) / 3 + off[i] / 1);
            chips.put(i, x, TOP - 0.005, z, cur[i]);
        }
    };
    const setItems = (list: readonly (string | null)[] | undefined) => {
        for (let i = 0; i < 3; i++) {
            const it = list?.[i] ?? null;
            if (it && prevItems[i] !== it) off[i] = -1 / 3;
            else if (!it) off[i] = 0;
            cur[i] = it;
        }
        prevItems = [cur[0], cur[1], cur[2]];
        putChips();
    };
    setItems(undefined);
    const place = (c: { g: THREE.Group; }, x: number, z: number, ang: number, k: number) => {
        c.g.position.set(x, TOP, z);
        c.g.rotation.y = ang;
        c.g.scale.setScalar(k);
        c.g.visible = k > 0.02;
    };
    return {
        obj: dirWrap(o.rot, inner),
        apply(e) {
            setItems(e.belt);
        },
        update(dt: number, t: number) {
            if (off[0] < 0 || off[1] < 0 || off[2] < 0) {
                for (let i = 0; i < 3; i++) if (off[i] < 0) off[i] = Math.min(0, off[i] + dt * 2.4);
                putChips();
            }
            const s = t * SPEED % 1;
            for (const p of paths) {
                for (let k = 0; k < 2; k++) {
                    const u = (s + k * 0.5) % 1, c = p.list[k];
                    if (!curve) {
                        const x = u - 0.5;
                        let f = 1;
                        if (fadeBack) f = Math.min(f, clamp((x + 0.5) / 0.14));
                        if (fadeFwd) f = Math.min(f, clamp((0.5 - x) / 0.14));
                        place(c, x, 0, 0, f);
                    } else {
                        const side = p.side;
                        let x, z, ang;
                        if (u < 0.5) {
                            x = 0;
                            z = side * (0.5 - u);
                            ang = side < 0 ? -Math.PI / 2 : Math.PI / 2;
                        } else {
                            x = u - 0.5;
                            z = 0;
                            ang = 0;
                        }
                        ang *= 1 - smooth(0.4, 0.6, u);
                        place(c, x, z, ang, fadeFwd ? Math.min(1, clamp((1 - u) / 0.14)) : 1);
                    }
                }
            }
            for (const st of stubs) {
                const u = t * SPEED * 2 % 1;
                place(st.c, 0, st.side * (0.5 - u * 0.24), st.side < 0 ? -Math.PI / 2 : Math.PI / 2, Math.sin(Math.min(1, u * 1.1) * Math.PI));
            }
        }
    };
}
export function arrow(mb: MB, ang: number, col: Col, len = 0.14) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const P = (u: number, w: number, y: number) => [ca * u + sa * w, y, -sa * u + ca * w];
    const mid = 0.2 + len / 2, hx = 0.2 + len;
    mb.main.box(len, 0.02, 0.07, col, { x: ca * mid, y: 0.07, z: -sa * mid, ry: ang, j: 0.002, ao: false, v: 0.04 });
    mb.main.hull([P(hx, -0.1, 0.06), P(hx, 0.1, 0.06), P(hx + 0.13, 0, 0.06), P(hx, -0.1, 0.085), P(hx, 0.1, 0.085), P(hx + 0.13, 0, 0.085)], col, { j: 0.002, ao: false, v: 0.04 });
}
export function junctionPlate(mb: MB, hubCol: number[], sorter: boolean) {
    const b = mb.main;
    b.box(0.96, 0.06, 0.96, PLATE, { y: 0.03, j: 0.004, v: 0.05 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.2, 0.11, 0.2, RAILC, { x: sx * 0.38, y: 0.055, z: sz * 0.38, j: 0.006, v: 0.06 });
    b.box(0.06, 0.1, 0.4, RAILC, { x: -0.465, y: 0.05, z: 0, j: 0.004 });
    arrow(mb, 0, PEBBLE);
    arrow(mb, Math.PI / 2, sorter ? SLATE : PEBBLE);
    arrow(mb, -Math.PI / 2, sorter ? SLATE : PEBBLE);
    void hubCol;
}
export let lampGeoCache: THREE.BufferGeometry | null = null;
export const lampGeometry = () => lampGeoCache ??= new Bld(3).oct(0.07, 0xffffff, { j: 0.004, ao: false, v: 0 }).build();
export function junction(o: BOpts, sorter: boolean): Model<BuildE> {
    const inner = new THREE.Group();
    inner.add(bake(`work.${sorter ? 'sorter' : 'splitter'}`, (mb) => junctionPlate(mb, [0, 0], sorter)));
    const hub = new THREE.Group();
    hub.position.y = 0.06;
    inner.add(hub);
    const lampGeo = lampGeometry();
    let lamp = null;
    if (sorter) {
        hub.add(bake('work.sorter.hub', (mb) => {
            mb.main.cyl(0.17, 0.19, 0.08, 8, (_x, y) => y > 0.1 ? 0x9d6fdb : mix(0x5d4a7c, 0x8f72cc, 0.4), { y: 0.04, ry: 0.4, j: 0.004, v: 0.05 });
            mb.main.box(0.1, 0.025, 0.035, 0xe8dcff, { x: 0.1, y: 0.093, ao: false });
        }));
        lamp = new THREE.Mesh(lampGeo, E(0xe8dcff, 2));
        lamp.position.y = 0.12;
        hub.add(lamp);
    } else {
        hub.add(bake('work.splitter.hub', (mb) => {
            mb.main.cyl(0.17, 0.19, 0.08, 8, (_x, y) => y > 0.1 ? 0xffd966 : mix(0xb8741a, 0xe0a020, 0.5), { y: 0.04, ry: 0.4, j: 0.004, v: 0.05 });
            mb.glow(0xffd966, 1.3).box(0.1, 0.025, 0.035, 0xfff3b0, { x: 0.1, y: 0.093, ao: false });
            mb.main.oct(0.06, 0xe0a020, { y: 0.1, sy: 0.5, j: 0.004 });
        }));
    }
    const pulses: THREE.Group[] = [];
    for (let i = 0; i < 3; i++) {
        const p = bake('work.junction.pulse', (mb) => {
            mb.glow(sorter ? 0xe8dcff : 0xffd966, 1.8).oct(0.035, sorter ? 0xe8dcff : 0xffd966, { sy: 0.5, ao: false, v: 0 });
        });
        inner.add(p);
        pulses.push(p);
    }
    const chips = chipPool(3, 0.085);
    inner.add(chips.group);
    const slot = (i: number) => i === 0 ? [-0.32, 0.055, 0] : i === 1 ? [0, 0.13, 0] : [0.32, 0.055, 0];
    const ANG = [0, Math.PI / 2, -Math.PI / 2];
    return {
        obj: dirWrap(o.rot, inner),
        apply(e) {
            const b = e;
            for (let i = 0; i < 3; i++) {
                const [x, y, z] = slot(i);
                chips.put(i, x, y - 0.055, z, b.belt?.[i] ?? null);
            }
            if (lamp) lamp.material = E(b.flt ? itemColor(b.flt) : 0xe8dcff, 2);
        },
        update(_dt: number, t: number) {
            hub.rotation.y = t * 0.6;
            for (let i = 0; i < 3; i++) {
                const u = (t * 0.9 + i * 0.33) % 1, r = 0.22 + u * 0.26, a = ANG[i];
                pulses[i].position.set(Math.cos(a) * r, 0.085, -Math.sin(a) * r);
                pulses[i].scale.setScalar(sorter && i > 0 ? 0.0001 : Math.sin(u * Math.PI) * 1.2);
            }
            if (lamp) lamp.scale.setScalar(0.9 + 0.2 * flicker(t, 0.7));
        }
    };
}
export function tunnelModel(o: BOpts, exit: boolean): Model<BuildE> {
    const inner = new THREE.Group();
    const key = exit ? 0xcdf4ee : 0xf8a24a;
    inner.add(bake(`work.tunnel|${exit ? 'x' : 'e'}`, (mb) => {
        const b = mb.main;
        b.box(1, 0.06, 0.9, PLATE, { y: 0.03, j: 0.004, v: 0.05 });
        for (const side of [-1, 1]) railX(b, exit ? 0 : -0.5, exit ? 0.5 : 0, side * 0.4125);
        const x0 = exit ? -0.5 : 0, x1 = exit ? 0 : 0.5, cx = (x0 + x1) / 2;
        b.box(0.5, 0.012, 0.64, 0x25222f, { x: cx, y: 0.064, ao: false, v: 0 });
        const nearX = exit ? x1 : x0, farX = exit ? x0 : x1, drop = 0.06;
        const prof = (x: number, d: number) => [[x, 0.06, -0.45], [x, 0.06, 0.45], [x, 0.28 - d, 0.45], [x, 0.28 - d, -0.45], [x, 0.45 - d, 0.3], [x, 0.45 - d, -0.3]];
        b.hull([...prof(nearX, drop), ...prof(farX, 0)], (x, y, z) => mix(0x7e84a2, 0xb9bfd4, clamp((y - 0.1) * 2.2 + (-x - z) * 0.25)), { j: 0.01, v: 0.07 });
        for (const sgn of [-1, 1]) for (const k of [0, 1]) b.box(0.3, 0.025, 0.07, key, { x: cx + (k - 0.5) * 0.2, y: 0.425, z: sgn * 0.1, ry: sgn * 0.9, ao: false, v: 0.03 });
        for (const side of [-1, 1]) b.box(0.5, 0.03, 0.05, key, { x: cx, y: 0.285 - 0, z: side * 0.455, ao: false, v: 0.03 });
    }));
    const keyGlow = bake(`work.tunnel.key|${exit ? 'x' : 'e'}`, (mb) => {
        mb.glow(key, 1.4).box(0.06, 0.02, 0.5, key, { x: exit ? -0.03 : 0.03, y: 0.2, z: 0, ao: false, v: 0 });
    });
    inner.add(keyGlow);
    const chevs = makeChevs(2);
    for (const c of chevs) inner.add(c.g);
    const chips = chipPool(3, 0.085);
    inner.add(chips.group);
    const slotX = [-0.33, 0, 0.33];
    const slotOpen = (i: number) => exit ? i >= 1 : i <= 1;
    return {
        obj: dirWrap(o.rot, inner),
        apply(e) {
            const b = e;
            for (let i = 0; i < 3; i++) chips.put(i, slotX[i], 0.055, 0, slotOpen(i) ? b.belt?.[i] ?? null : null);
        },
        update(_dt: number, t: number) {
            const s = t * SPEED % 1;
            for (let k = 0; k < 2; k++) {
                const x = (s + k * 0.5) % 1 - 0.5, c = chevs[k];
                let f;
                if (!exit) f = x < 0 ? clamp((0 - x) / 0.16) : 0;
                else f = x > 0 ? clamp((x - 0) / 0.16) : 0;
                c.g.position.set(x, TOP, 0);
                c.g.scale.setScalar(f);
                c.g.visible = f > 0.02;
            }
        }
    };
}
export function inserter(o: BOpts): Model<BuildE> {
    const inner = new THREE.Group();
    inner.add(bake('work.inserter', (mb) => {
        const b = mb.main;
        b.box(0.5, 0.1, 0.4, ic(0.5), { y: 0.05, j: 0.006 });
        b.box(0.34, 0.03, 0.28, ic(0.8), { y: 0.115, j: 0.004 });
        for (const sz of [-1, 1]) b.box(0.1, 0.34, 0.05, ic(0.55), { y: 0.27, z: sz * 0.09, j: 0.005 });
        mb.main.box(0.1, 0.1, 0.06, 0x35305c, { y: 0.07, z: 0.19, ao: false });
    }));
    const lampOff = bake('work.inserter.lamp0', (mb) => {
        mb.main.oct(0.035, 0x5d4a7c, { x: 0.15, y: 0.15, z: 0.12, ao: false });
    });
    const lampOn = bake('work.inserter.lamp1', (mb) => {
        mb.glow(0x92d364, 1.9).oct(0.04, 0xd4f08a, { x: 0.15, y: 0.15, z: 0.12, ao: false });
    });
    lampOn.visible = false;
    inner.add(lampOff, lampOn);
    const axle = new THREE.Group();
    axle.position.set(0, 0.36, 0);
    inner.add(axle);
    axle.add(bake('work.inserter.arm', (mb) => {
        const b = mb.main;
        b.cyl(0.055, 0.055, 0.24, 6, ic(0.85), { rx: Math.PI / 2, j: 0.003 });
        b.box(0.52, 0.07, 0.08, 0xf8a24a, { x: 0.28, j: 0.004 });
        b.box(0.14, 0.09, 0.09, 0xc7761c, { x: -0.12, j: 0.004 });
        b.box(0.07, 0.11, 0.1, ic(0.7), { x: 0.56, y: -0.03, j: 0.004 });
        for (const sz of [-1, 1]) b.box(0.1, 0.03, 0.025, IR[3], { x: 0.58, y: -0.1, z: sz * 0.035, rz: sz * 0, j: 0.002 });
    }));
    const chips = chipPool(1, 0.12);
    chips.group.position.set(0.58, -0.16, 0);
    axle.add(chips.group);
    let hand: string | null = null, prog = 0, working = false, demo = false, cur = 0;
    const angleOf = (p: number) => Math.PI * (1 - p);
    axle.rotation.z = angleOf(0);
    return {
        obj: dirWrap(o.rot, inner),
        apply(e) {
            const b = e;
            hand = b.hand ?? null;
            prog = b.prog ?? 0;
            working = isWorking(b);
            demo = !hand && working && prog > 0;
            lampOn.visible = working;
            lampOff.visible = !working;
            chips.put(0, 0, 0, 0, hand);
        },
        update(dt: number, t: number) {
            let target = hand ? clamp(prog) : 0;
            if (demo) {
                target = 0.5 + 0.5 * Math.sin(t * 2.4);
                chips.put(0, 0, 0, 0, target > 0.5 ? 'plank' : null);
            }
            cur += (target - cur) * Math.min(1, dt * (hand ? 14 : 6));
            axle.rotation.z = angleOf(cur);
        }
    };
}
export const LOGI = {
    belt,
    splitter: (o: BOpts) => junction(o, false),
    sorter: (o: BOpts) => junction(o, true),
    tunnel: (o: BOpts) => tunnelModel(o, false),
    tunnelx: (o: BOpts) => tunnelModel(o, true),
    inserter
};

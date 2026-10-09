// Defenses that raiders have hurt (sim/defense.ts: `BuildE.hp` below the kind's `BuildingDef.hp`): cracks run over the wall's faces,
// bites are chipped out of its cap and rubble lies at its foot, more of each as its hit points drop (three stages). The marks are a
// child baked once per stage, look and shape (so every wall at a stage shares one instanced mesh) and swapped when the stage changes;
// it all goes at dawn, when the wall mends and its `hp` is gone. The 2D view shows a small health bar over the piece (an overlay, so
// the 3D view shows it too); this is what the wall itself shows.
import { maxHp } from '../../shared/sim/defense';
import type * as THREE from 'three';
import { BUILDINGS, type BuildingKind } from '../../shared/data/buildings';
import type { BuildE } from '../../shared/sim/types';
import { stamp } from './b-home-util';
import { WALL_CFG } from './b-home-walls';
import { bake, Bld, type Model, seedRand } from './kit';

/** How hurt a defense looks: 0 whole, 1 cracked (under 100%), 2 chipped (two thirds), 3 crumbling (a third). */
export function damageStage (hp: number | undefined, max: number | undefined) {
    if (!max || hp === undefined || hp >= max) return 0;
    const f = hp / max;
    return f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
}

/** What a piece is made of: the dark of its cracks, the fresh colour of a broken edge, and its rubble. */
const LOOK: Record<string, { crack: number; fresh: number; rubble: number[] }> = {
    wood: { crack: 0x2a1810, fresh: 0xdcb487, rubble: [0x8a5a34, 0xa8703f, 0xc58a52] },
    stone: { crack: 0x24222e, fresh: 0xc4c8d6, rubble: [0x7a7f9e, 0x9ea4b9, 0xb4b9cf] },
    brick: { crack: 0x34181a, fresh: 0xd0806a, rubble: [0x9a3c34, 0xb8503e, 0xd5d9e6] },
};
const lookOf = (kind: string) => kind === 'wall_stone' || kind === 'wall_fort' || kind === 'stonewall' ? 'stone' : kind === 'wall_brick' ? 'brick' : 'wood';

/**
 * The marks for one piece at one stage, in the piece's own frame. A wall runs along x unless it only joins north and south (`mask`
 * bits N1 E2 S4 W8); a doorway runs along x, or along z when turned. `hh` is half its thickness, `top` its height.
 */
function marks (kind: string, mask: number, rot: number, stage: number, seed: number) {
    const look = LOOK[lookOf(kind)], door = kind === 'doorway';
    const cfg = WALL_CFG, hh = door ? 0.215 : cfg.hh, top = door ? 1.6 : cfg.top;
    const alongZ = door ? (rot & 1) === 1 : (mask & 10) === 0 && (mask & 5) !== 0;
    const x0 = door ? -0.5 : mask & (alongZ ? 1 : 8) ? -0.5 : -hh, x1 = door ? 0.5 : mask & (alongZ ? 4 : 2) ? 0.5 : hh;
    return bake(`dmg|${kind}|${alongZ ? 1 : 0}|${x0}|${x1}|${stage}|${seed}`, (mb) => {
        const f = new Bld(seed), R = seedRand(seed * 31 + stage * 7 + 3);
        // cracks: crooked lines of thin dark strips on both faces, from a point near the top or a corner, running down
        const cracks = stage === 1 ? 2 : stage === 2 ? 4 : 6;
        for (let c = 0; c < cracks; c++) {
            const side = c % 2 ? 1 : -1, z = side * (hh + 0.024);
            let x = x0 + 0.08 + R() * (x1 - x0 - 0.16), y = (door ? 0.4 : cfg.plinth) + R() * (top - 0.5) + 0.3;
            for (let i = 0; i < 3 + stage; i++) {
                const a = -Math.PI / 2 + (R() - 0.5) * 1.6, len = 0.1 + R() * 0.12;
                const nx = Math.min(x1 - 0.03, Math.max(x0 + 0.03, x + Math.cos(a) * len)), ny = Math.max(0.05, y + Math.sin(a) * len);
                const mx = (x + nx) / 2, my = (y + ny) / 2, l = Math.hypot(nx - x, ny - y);
                f.box(l + 0.012, (stage > 1 ? 0.032 : 0.024) - i * 0.003, 0.008, look.crack, { x: mx, y: my, z, rz: Math.atan2(ny - y, nx - x), ao: false, v: 0.05 });
                // a branch now and then
                if (stage > 1 && R() < 0.35) f.box(0.08, 0.014, 0.008, look.crack, { x: mx + 0.03, y: my - 0.02, z, rz: Math.atan2(ny - y, nx - x) + (R() < 0.5 ? 0.9 : -0.9), ao: false, v: 0.05 });
                x = nx; y = ny;
                if (y <= 0.06) break;
            }
        }
        // bites out of the cap: a dark hollow edged with the fresh colour of the break
        const bites = stage === 1 ? 0 : stage === 2 ? 2 : 4;
        for (let k = 0; k < bites; k++) {
            const bx = x0 + 0.1 + R() * (x1 - x0 - 0.2), side = R() < 0.5 ? -1 : 1, w = 0.1 + R() * 0.08, d = 0.07 + R() * 0.05;
            f.box(w, d, 0.05, look.crack, { x: bx, y: top - d / 2 + 0.004, z: side * (hh + 0.03), ao: false, v: 0.06 });
            f.box(w * 0.7, 0.02, 0.06, look.fresh, { x: bx, y: top - d - 0.005, z: side * (hh + 0.034), rz: (R() - 0.5) * 0.4, ao: false, v: 0.08 });
            f.box(w + 0.02, 0.02, 0.07, look.fresh, { x: bx, y: top + 0.006, z: side * (hh + 0.03), ao: false, v: 0.08 });
        }
        // rubble at its foot, on both sides
        const bits = stage === 1 ? 2 : stage === 2 ? 5 : 9;
        for (let k = 0; k < bits; k++) {
            const side = k % 2 ? 1 : -1, bx = x0 + 0.05 + R() * (x1 - x0 - 0.1), bz = side * (hh + 0.06 + R() * 0.2), s = 0.03 + R() * 0.035 + stage * 0.005;
            f.box(s * 1.4, s * 0.8, s * 1.1, look.rubble[k % look.rubble.length], { x: bx, y: s * 0.3, z: bz, rx: (R() - 0.5) * 0.6, ry: R() * 3, rz: (R() - 0.5) * 0.6, j: 0.08, v: 0.1 });
        }
        stamp(mb.main, f, alongZ ? Math.PI / 2 : 0);
    }, seed);
}

/**
 * A defense's model with its damage shown: the maker's model, plus the marks for its stage (none while it is whole). `apply` reads
 * `BuildE.hp` each time the piece changes; the marks swap only when the stage does.
 */
export function withDamage (kind: string, mask: number, rot: number, seed: number, inner: Model<BuildE>): Model<BuildE> {
    const max = (BUILDINGS[kind as BuildingKind] as { hp?: number } | undefined)?.hp;
    let stage = 0, child: THREE.Object3D | null = null;
    const look = Math.abs(seed) % 2;
    return {
        ...inner,
        apply (e: BuildE) {
            inner.apply?.(e);
            const s = damageStage(e.hp, max && maxHp(e));       // (a tower's perks can raise its health)
            if (s === stage) return;
            stage = s;
            if (child) { inner.obj.remove(child); child = null; }
            if (s) { child = marks(kind, mask, rot, s, look); child.name = 'damage'; inner.obj.add(child); }
        },
    };
}

/** The kinds that take damage and show it (every one has `BuildingDef.hp`). */
export const DAMAGE_KINDS = Object.keys(BUILDINGS).filter((k) => !!(BUILDINGS[k as BuildingKind] as { hp?: number }).hp);

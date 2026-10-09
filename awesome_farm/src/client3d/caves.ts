// The caves under the world in 3D (the 2D TileLayer's `streamCave`): the same map (shared/cave.ts, opened through the World as
// rock is dug) built a chunk at a time round whoever is down there. Rock is a low block of flat-shaded stone, lighter on top, with
// its dark front showing where open floor lies to its south; ore shows as nuggets and flecks (crystal as shards) that catch a
// faint glow of their own, so a vein reads even in the dark. The floor is cool, dark stone with the 2D tiles' features: pebbles,
// little glowing mushrooms, a crack with a crystal glint. The darkness and the light pool round the farmer are the mood's
// (mood.ts); this file is only the ground.

import { DoubleSide, Group, Mesh, MeshStandardMaterial, type Scene } from 'three';
import { CAVE_N, CAVE_ORES } from '../shared/cave';
import { UNDER_Y } from '../shared/config';
import type { World } from '../shared/world';
import { hash2, Soup } from './terrain';

/** Chunk size (tiles) and how far round the camera chunks are kept (tiles). */
const CC = 16;
const RADIUS = 34;
/** How tall a wall of rock stands (tiles): low enough that a one-tile tunnel's floor still shows behind the wall south of it. */
export const ROCK_H = 0.82;

/** The 2D cave art's colours (client/art/storybook-cave.ts): floor, rock seen from above, rock face. */
const FL = [0x413c58, 0x35314b, 0x3c3753, 0x45405e];
const RK = [0x6f6a8a, 0x77729a, 0x66617f, 0x6b6688];
const FC = { light: 0x5f5a80, base: 0x4a4566, dark: 0x35314b, foot: 0x1f1c2e };
/** The lighter lip round a rock's top where it meets open floor (the edge that catches the light), and how deep it is (tiles). */
const LIPS = { south: 0x99a0c4, north: 0x8a86ac, side: 0x827ea4 };
const LIP = 0.16;
const SHROOM =[0x2f8a8a, 0x4fb8ac, 0x7ad6c8, 0xbdf5ea];
/** Ore colours by CAVE_ORES order: coal, iron, copper, gold, crystal (dark, mid, bright). */
const ORE: Record<string, number[]> = {
    coal: [0x12101a, 0x25222f, 0x6a6684],
    iron: [0x9a5640, 0xcc8460, 0xf6c2a0],
    copper: [0xd6762e, 0xf0a05a, 0xffd49a],
    goldore: [0xd8a020, 0xffd966, 0xfff3b0],
    crystal: [0x8a5ad8, 0xb48cf0, 0x8fe6ff],
};

/** The rock and floor: plain flat shading. The glints (ore, mushrooms, crystal) glow faintly in their own colour. */
const caveMat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, side: DoubleSide });
// height grading: the floor sinks into shadow and the rock's top stands out in the light, so the maze reads at a glance even far
// from the light you carry (the 2D cave tiles draw the rock lighter than the floor for the same reason)
caveMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCaveY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCaveY = position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCaveY;')
        .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= mix(0.7, 1.22, clamp(vCaveY / ${ROCK_H.toFixed(2)}, 0.0, 1.0));`);
};
caveMat.customProgramCacheKey = () => 'cave-height';
export const glintMat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5, metalness: 0.1, side: DoubleSide });
glintMat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlint = glint;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlint;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * uGlint;');
};
glintMat.customProgramCacheKey = () => 'cave-glint';
/** How strongly the glints glow (the mood raises it a touch the deeper you are). */
export const glint = { value: 0.35 };

type V3 = number[];
interface Chunk { ground?: Mesh; glints?: Mesh; rock: Uint8Array }

export class CaveTerrain {
    readonly group = new Group();
    private readonly chunks = new Map<number, Chunk>();
    private digs = -1;
    private ready = false;

    constructor (private readonly world: World, scene: Scene) {
        this.group.name = 'caves';
        this.group.visible = false;
        scene.add(this.group);
    }

    private rock (tx: number, ty: number) {
        if (tx < 0 || tx >= CAVE_N || ty < UNDER_Y || ty >= UNDER_Y + CAVE_N) return true;
        return this.world.rockAt(tx, ty);
    }

    /** Keep the chunks round (x, z) built while the camera is down here (`on`); far ones are freed, dug ones rebuilt. */
    update (x: number, z: number, on: boolean) {
        this.group.visible = on;
        const w = this.world;
        if (!w.caveReady) { if (this.ready) this.clear(); return; }
        if (!this.ready) { this.ready = true; this.digs = w.digs; }
        if (!on) return;
        if (w.digs !== this.digs) { this.digs = w.digs; this.recheck(); }
        const cx0 = Math.floor((x - RADIUS) / CC), cx1 = Math.floor((x + RADIUS) / CC);
        const cy0 = Math.floor((z - RADIUS - UNDER_Y) / CC), cy1 = Math.floor((z + RADIUS - UNDER_Y) / CC);
        const maxC = Math.ceil(CAVE_N / CC) - 1;
        let built = 0;
        // nearest first, so the farmer's own chunk is never the one left for next frame
        const fx = Math.floor(x / CC), fy = Math.floor((z - UNDER_Y) / CC);
        const want: [number, number, number][] = [];
        for (let cy = Math.max(0, cy0); cy <= Math.min(maxC, cy1); cy++) for (let cx = Math.max(0, cx0); cx <= Math.min(maxC, cx1); cx++) {
            if (!this.chunks.has(cy * 1000 + cx)) want.push([cx, cy, Math.abs(cx - fx) + Math.abs(cy - fy)]);
        }
        want.sort((a, b) => a[2] - b[2]);
        for (const [cx, cy] of want) {
            if (built++ >= 3) break;
            this.build(cx, cy);
        }
        for (const k of [...this.chunks.keys()]) {
            const cy = Math.floor(k / 1000), cx = k % 1000;
            if (cx < cx0 - 1 || cx > cx1 + 1 || cy < cy0 - 1 || cy > cy1 + 1) this.drop(k);
        }
    }

    /** How many chunks are built (tests, diagnostics). */
    get size () { return this.chunks.size; }

    /** Somebody dug: rebuild the chunks whose rock changed (a tile and the one north of it, whose front now shows). */
    private recheck () {
        for (const [k, c] of [...this.chunks]) {
            const cy = Math.floor(k / 1000), cx = k % 1000;
            if (!this.same(cx, cy, c.rock)) { this.drop(k); this.build(cx, cy); }
        }
    }

    private snapshot (cx: number, cy: number) {
        const out = new Uint8Array(CC * (CC + 1));
        for (let y = 0; y <= CC; y++) for (let x = 0; x < CC; x++) out[y * CC + x] = this.rock(cx * CC + x, UNDER_Y + cy * CC + y) ? 1 : 0;
        return out;
    }

    private same (cx: number, cy: number, was: Uint8Array) {
        for (let y = 0; y <= CC; y++) for (let x = 0; x < CC; x++) if (was[y * CC + x] !== (this.rock(cx * CC + x, UNDER_Y + cy * CC + y) ? 1 : 0)) return false;
        return true;
    }

    private clear () {
        for (const k of [...this.chunks.keys()]) this.drop(k);
        this.ready = false;
    }

    private drop (k: number) {
        const c = this.chunks.get(k);
        if (!c) return;
        for (const m of [c.ground, c.glints]) if (m) { this.group.remove(m); m.geometry.dispose(); }
        this.chunks.delete(k);
    }

    private build (cx: number, cy: number) {
        const s = new Soup(), g = new Soup();
        for (let y = 0; y < CC; y++) for (let x = 0; x < CC; x++) {
            const tx = cx * CC + x, ty = UNDER_Y + cy * CC + y;
            if (tx >= CAVE_N || ty >= UNDER_Y + CAVE_N) continue;
            if (this.rock(tx, ty)) this.rockTile(s, g, tx, ty);
            else this.floorTile(s, g, tx, ty);
        }
        const c: Chunk = { rock: this.snapshot(cx, cy) };
        const geo = s.geometry();
        if (geo) { c.ground = new Mesh(geo, caveMat); c.ground.receiveShadow = true; this.group.add(c.ground); }
        const gg = g.geometry();
        if (gg) { c.glints = new Mesh(gg, glintMat); this.group.add(c.glints); }
        this.chunks.set(cy * 1000 + cx, c);
    }

    /** The top of the rock at a corner: a little bump shared by the four tiles round it, so the rock's top is one rough sheet. */
    private topH (x: number, z: number) { return ROCK_H + (hash2(x * 3.31 + 1, z * 2.17 + 5) - 0.5) * 0.16; }

    private rockTile (s: Soup, g: Soup, tx: number, ty: number) {
        const hA = this.topH(tx, ty), hB = this.topH(tx + 1, ty), hC = this.topH(tx + 1, ty + 1), hD = this.topH(tx, ty + 1);
        const A = [tx, hA, ty], B = [tx + 1, hB, ty], C = [tx + 1, hC, ty + 1], D = [tx, hD, ty + 1];
        const v = hash2(tx * 1.7, ty * 2.3), top = RK[Math.floor(v * RK.length)];
        const sh = (k: number) => 0.9 + hash2(tx * 3.1 + k, ty * 5.7 - k) * 0.16;
        if ((tx + ty) & 1) { s.tri(A, D, B, top, sh(1)); s.tri(B, D, C, top, sh(2)); } else { s.tri(A, D, C, top, sh(3)); s.tri(A, C, B, top, sh(4)); }
        // a worn, lighter lip where the rock's top meets open floor, so every wall reads as a block even far from the light
        const lerpH = (u: number, v: number) => hA * (1 - u) * (1 - v) + hB * u * (1 - v) + hC * u * v + hD * (1 - u) * v + 0.006;
        const lip = (u0: number, v0: number, u1: number, v1: number, col: number) => {
            const P = (u: number, v: number) => [tx + u, lerpH(u, v), ty + v];
            s.quad(P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1), col, 0.96 + v * 0.08);
        };
        if (!this.rock(tx, ty + 1)) lip(0, 1 - LIP, 1, 1, LIPS.south);
        if (!this.rock(tx, ty - 1)) lip(0, 0, 1, LIP * 0.7, LIPS.north);
        if (!this.rock(tx + 1, ty)) lip(1 - LIP * 0.7, 0, 1, 1, LIPS.side);
        if (!this.rock(tx - 1, ty)) lip(0, 0, LIP * 0.7, 1, LIPS.side);
        const oreI = this.world.oreIndex(tx, ty), ore = oreI ? CAVE_ORES[oreI - 1] : null;
        // the front of the wall, where open floor lies to the south: two jagged bands and a dark foot
        if (!this.rock(tx, ty + 1)) {
            const z = ty + 1, wob = (x: number, k: number) => (hash2(x * 9.1, k * 4.3 + ty) - 0.5) * 0.07;
            const mid = ROCK_H * 0.45;
            s.quad([tx, hD, z], [tx + 1, hC, z], [tx + 1, mid, z + 0.04 + wob(tx + 1, 1)], [tx, mid, z + 0.04 + wob(tx, 1)], FC.light, 0.95 + v * 0.1);
            s.quad([tx, mid, z + 0.04 + wob(tx, 1)], [tx + 1, mid, z + 0.04 + wob(tx + 1, 1)], [tx + 1, 0.06, z + 0.1 + wob(tx + 1, 2)], [tx, 0.06, z + 0.1 + wob(tx, 2)], FC.base, 0.92);
            s.quad([tx, 0.06, z + 0.1 + wob(tx, 2)], [tx + 1, 0.06, z + 0.1 + wob(tx + 1, 2)], [tx + 1, 0, z + 0.16], [tx, 0, z + 0.16], FC.foot, 1);
            if (ore) this.faceOre(g, tx, z, ore);
        }
        // the sides, where open floor lies east or west (seen at a slant only when the camera shakes, but they close the block for the lights)
        if (!this.rock(tx + 1, ty)) s.quad([tx + 1, hB, ty], [tx + 1, hC, ty + 1], [tx + 1, 0, ty + 1], [tx + 1, 0, ty], FC.dark, 0.9);
        if (!this.rock(tx - 1, ty)) s.quad([tx, hD, ty + 1], [tx, hA, ty], [tx, 0, ty], [tx, 0, ty + 1], FC.dark, 0.9);
        if (ore) this.topOre(g, tx, ty, ore, (hA + hB + hC + hD) / 4);
    }

    /** Ore on the rock's top: nuggets (little pyramids) in the ore's colours; crystal grows shards. */
    private topOre (g: Soup, tx: number, ty: number, ore: string, y: number) {
        const col = ORE[ore] ?? ORE.coal, rr = (k: number) => hash2(tx * 11.3 + k, ty * 7.9 - k);
        if (ore === 'crystal') {
            for (let k = 0; k < 3; k++) {
                const x = tx + 0.25 + rr(k) * 0.5, z = ty + 0.25 + rr(k + 5) * 0.5, h = 0.22 + rr(k + 9) * 0.22, r = 0.06 + rr(k + 2) * 0.04;
                const lean = (rr(k + 3) - 0.5) * 0.2, tip = [x + lean, y + h, z + lean * 0.5];
                g.tri([x - r, y, z], [x + r, y, z + r * 0.4], tip, col[1], 1.1);
                g.tri([x + r, y, z + r * 0.4], [x, y, z - r], tip, col[2], 1);
                g.tri([x, y, z - r], [x - r, y, z], tip, col[0], 1);
            }
            return;
        }
        for (let k = 0; k < 5; k++) {
            const x = tx + 0.18 + rr(k) * 0.64, z = ty + 0.18 + rr(k + 5) * 0.64, r = 0.06 + rr(k + 8) * 0.07, h = r * (ore === 'coal' ? 0.9 : 1.2);
            const c = col[k % 3], tip = [x, y + h, z];
            g.tri([x - r, y, z + r * 0.5], [x + r, y, z + r * 0.5], tip, c, 1.08);
            g.tri([x + r, y, z + r * 0.5], [x, y, z - r], tip, c, 0.92);
            g.tri([x, y, z - r], [x - r, y, z + r * 0.5], tip, c, 0.98);
        }
    }

    /** Ore showing in the wall's front: a few flecks, lower down, where a miner's light would catch them. */
    private faceOre (g: Soup, tx: number, z: number, ore: string) {
        const col = ORE[ore] ?? ORE.coal, rr = (k: number) => hash2(tx * 5.3 + k, z * 3.9 + k);
        for (let k = 0; k < 4; k++) {
            const x = tx + 0.15 + rr(k) * 0.7, y = 0.15 + rr(k + 4) * ROCK_H * 0.6, r = 0.05 + rr(k + 8) * 0.05, zz = z + 0.1 + (0.45 - y / ROCK_H) * 0.05;
            const out = ore === 'crystal' ? 0.12 : 0.04;
            g.tri([x - r, y - r, zz], [x + r, y - r * 0.6, zz], [x, y + r, zz + out], col[k % 3], 1.05);
            g.tri([x + r, y - r * 0.6, zz], [x + r * 0.2, y + r * 1.2, zz], [x, y + r, zz + out], col[(k + 1) % 3], 0.9);
        }
    }

    /** The floor: cool dark stone; now and then pebbles, a ring of glowing mushrooms, or a crack with a crystal glint (the 2D tiles' features). */
    private floorTile (s: Soup, g: Soup, tx: number, ty: number) {
        const h = hash2(tx * 1.3, ty * 2.9), r = h * 100, variant = r < 28 ? 0 : r < 56 ? 1 : r < 84 ? 2 : r < 90 ? 3 : r < 96 ? 4 : 5;
        const y = (x: number, z: number) => (hash2(x * 7.13 + 3, z * 3.77 + 9) - 0.5) * 0.04;
        const A = [tx, y(tx, ty), ty], B = [tx + 1, y(tx + 1, ty), ty], C = [tx + 1, y(tx + 1, ty + 1), ty + 1], D = [tx, y(tx, ty + 1), ty + 1];
        const base = FL[variant % FL.length], sh = (k: number) => 0.9 + hash2(tx * 3.1 + k, ty * 5.7 - k) * 0.14;
        if ((tx + ty) & 1) { s.tri(A, D, B, base, sh(1)); s.tri(B, D, C, base, sh(2)); } else { s.tri(A, D, C, base, sh(3)); s.tri(A, C, B, base, sh(4)); }
        // a soft shadow where the wall to the north meets the floor
        if (this.rock(tx, ty - 1)) s.quad([tx, 0.004, ty], [tx + 1, 0.004, ty], [tx + 1, 0.004, ty + 0.3], [tx, 0.004, ty + 0.3], 0x231f33, 1);
        const rr = (k: number) => hash2(tx * 11.3 + k, ty * 7.9 - k);
        if (variant === 3) {
            for (let k = 0; k < 3; k++) {
                const x = tx + 0.2 + rr(k) * 0.6, z = ty + 0.2 + rr(k + 4) * 0.6, q = 0.05 + rr(k + 8) * 0.05;
                s.tri([x - q, 0, z], [x + q, 0, z + q * 0.4], [x, q * 1.1, z], 0x6a6684, 1);
                s.tri([x + q, 0, z + q * 0.4], [x, 0, z - q], [x, q * 1.1, z], 0x504b6b, 1);
            }
            this.shroom(s, g, tx + 0.78, ty + 0.25, 0.7);
        } else if (variant === 4) {
            for (let k = 0; k < 3; k++) this.shroom(s, g, tx + 0.25 + rr(k) * 0.5, ty + 0.25 + rr(k + 3) * 0.5, 0.75 + rr(k + 6) * 0.5);
        } else if (variant === 5) {
            // a crack across the floor with a crystal glint in it
            const x0 = tx + 0.15, z0 = ty + 0.3 + rr(1) * 0.4, x1 = tx + 0.85, z1 = ty + 0.3 + rr(2) * 0.4;
            s.quad([x0, 0.006, z0 - 0.03], [x1, 0.006, z1 - 0.03], [x1, 0.006, z1 + 0.03], [x0, 0.006, z0 + 0.03], 0x1b1829, 1);
            const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
            g.tri([mx - 0.05, 0.01, mz], [mx + 0.05, 0.01, mz], [mx + 0.01, 0.16, mz - 0.01], 0x8fe6ff, 1.1);
            g.tri([mx, 0.01, mz - 0.04], [mx + 0.08, 0.01, mz + 0.03], [mx + 0.05, 0.11, mz], 0xb48cf0, 1);
        }
    }

    /** A little glowing mushroom: a pale stem and a teal cap that glows. */
    private shroom (s: Soup, g: Soup, x: number, z: number, k: number) {
        const h = 0.13 * k, w = 0.018 * k, r = 0.07 * k;
        s.tri([x - w, 0, z], [x + w, 0, z], [x, h, z], 0xcfd2e4, 1);
        const top: V3 = [x, h + r * 0.55, z];
        for (let i = 0; i < 5; i++) {
            const a0 = (i / 5) * Math.PI * 2, a1 = ((i + 1) / 5) * Math.PI * 2;
            g.tri([x + Math.cos(a0) * r, h, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, h, z + Math.sin(a1) * r], top, SHROOM[1 + (i % 3)], 1);
        }
    }

    dispose () { this.clear(); this.group.removeFromParent(); }
}

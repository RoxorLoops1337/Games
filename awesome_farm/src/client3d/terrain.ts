// The islands as flat-shaded tiles with cliffs, banks, ore decals and grass, the shallows and shore foam, land rising out of the sea, and the animated sea.
import { BufferGeometry, CircleGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Vector2, Scene } from 'three';
import { PLOT, RIFT_ISLANDS, UNDER_Y } from '../shared/config';
import type { Plot } from '../shared/sim/types';
import type { World } from '../shared/world';

type V3 = number[];

export const WATER_Y = -0.7;
export const SEABED_1 = -1;
export const CH = 16;
export const hash2 = (x: number, y: number) => {
    const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return h - Math.floor(h);
};
export const cornerH = (x: number, z: number) => (hash2(x * 7.13 + 3, z * 3.77 + 9) - 0.5) * 0.09;
/** A biome's ground: tile colours, the cliff bands, the sandy bank and grass tufts. */
export interface Pal { ground: number[]; cliff: number[]; bank: number; tuft: number }
export const PALS: Record<string, Pal | undefined> = {
    meadow: { ground: [0x92d364, 0x86cc5c, 0x9ad96b, 0x7bc25a, 0x92d364, 0x8ad063], cliff: [0xd49a62, 0xb87a46, 0x94603a], bank: 0xe8cf8c, tuft: 0x5cb04f },
    quarry: { ground: [0x7da35b, 0x73994f, 0x86ac64, 0x6c9a49, 0x7da35b, 0x79a056], cliff: [0xa4a9bd, 0x7a7f9e, 0x5d6280], bank: 0xbcc0cc, tuft: 0x4f7a3a },
    goldsand: { ground: [0xf4deaa, 0xeed49c, 0xf8e4b6, 0xe9cd90, 0xf4deaa, 0xf1d8a2], cliff: [0xe6c985, 0xc9a46a, 0xa8854f], bank: 0xf6e2b0, tuft: 0xc9a04a },
    snowcap: { ground: [0xf3f8ff, 0xe8f0fa, 0xfafdff, 0xdde9f6, 0xf3f8ff, 0xeaf2fb], cliff: [0xc4dcec, 0x8ab4d2, 0x6a97bb], bank: 0xe9f2fa, tuft: 0x9cc0dc },
    bog: { ground: [0x6e5d8d, 0x655483, 0x786896, 0x5d4a7c, 0x6e5d8d, 0x6a5a89], cliff: [0x5d4a7c, 0x48385f, 0x372b4a], bank: 0x8a7aa8, tuft: 0x8fb06a },
    rift: { ground: [0xa88ad8, 0x9d7fd0, 0xb398e0, 0x9070c6, 0xa88ad8, 0xa584d4], cliff: [0x7a5cb4, 0x62479a, 0x4c377c], bank: 0xc4a8ec, tuft: 0xe0c8ff }
};
export const ORE_COL: Record<string, number | undefined> = { stone: 0xa3a8bd, coal: 0x45414f, iron: 0xd5d9e6, copper: 0xd98a52, goldore: 0xffd966, clay: 0xdf9a7c, sand: 0xf0d79a, peat: 0x4e3d33, crystal: 0xb48cf0 };
export const FLOWERS = [0xf79fc6, 0xffd966, 0xfff6e0, 0x9d6fdb, 0xf8a24a];
/**
 * Both sides: the soup's triangles are wound every which way (the cliffs' fronts and the vein decals face away from a one-sided
 * material, so they never showed). Flat shading takes its normal from the screen, so either side lights the same.
 */
export const groundMat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, side: DoubleSide });
export const foamMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, opacity: 0.9, side: DoubleSide });
/** A soup of flat-shaded triangles (and see-through foam) for one chunk of land and shore. */
export class Soup {
    pos: number[] = [];
    col: number[] = [];
    foamPos: number[] = [];
    foamCol: number[] = [];
    c = new Color();
    tri(a: V3, b: V3, c: V3, hex: number, shade = 1) {
        this.c.set(hex).multiplyScalar(shade);
        this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
        for (let i = 0; i < 3; i++) this.col.push(this.c.r, this.c.g, this.c.b);
    }
    /** A triangle whose corners carry their own colours (the seabed's slope from sand to deep water). */
    triC(a: SeaCorner, b: SeaCorner, c: SeaCorner, shade = 1) {
        for (const v of [a, b, c]) {
            this.pos.push(v.p[0], v.p[1], v.p[2]);
            this.col.push(v.c.r * shade, v.c.g * shade, v.c.b * shade);
        }
    }
    quad(a: V3, b: V3, c: V3, d: V3, hex: number, shade = 1) {
        this.tri(a, b, c, hex, shade);
        this.tri(a, c, d, hex, shade * 0.985);
    }
    foamQuad(a: V3, b: V3, c: V3, d: V3, aIn: number, aOut: number) {
        const v = (p: V3, al: number) => {
            this.foamPos.push(p[0], p[1], p[2]);
            this.foamCol.push(1, 1, 1, al);
        };
        v(a, aIn);
        v(b, aIn);
        v(c, aOut);
        v(a, aIn);
        v(c, aOut);
        v(d, aOut);
    }
    geometry() {
        if (!this.pos.length) return null;
        const g = new BufferGeometry();
        g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
        g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
        g.computeVertexNormals();
        g.computeBoundingSphere();
        return g;
    }
    foamGeometry() {
        if (!this.foamPos.length) return null;
        const g = new BufferGeometry();
        g.setAttribute('position', new Float32BufferAttribute(this.foamPos, 3));
        g.setAttribute('color', new Float32BufferAttribute(this.foamCol, 4));
        g.computeBoundingSphere();
        return g;
    }
}
/** A corner of the seabed: where it is and its colour. */
export interface SeaCorner { p: V3; c: Color }
/** A land plot rising out of the sea, ring by ring. */
export interface Rising { rings: { mesh: Mesh<BufferGeometry, MeshStandardMaterial>; delay: number }[]; t: number; plot: Plot; onRing?: (x: number, z: number, ring: number) => void; lastRing: number }
/** The islands and the shallows round them, built in chunks of CH x CH tiles near the camera. */
export class Terrain {
    world: World;
    group = new Group();
    chunks = new Map<number, { ground?: Mesh; foam?: Mesh }>();
    /** Tiles that are not drawn yet because their land is still rising. */
    skip = new Set<number>();
    rising: Rising[] = [];
    veins = new Map<number, string>();
    veinsDirty = true;
    foam = foamMat;
    /** How far (in tiles) the corner (vx, vz) is from the nearest land tile, 0 when it touches land; 9 when none is near. Cached while a chunk is built. */
    vcache = new Map<number, number>();
    constructor(world: World, scene: Scene) {
        this.world = world;
        scene.add(this.group);
    }
    idx(tx: number, ty: number) {
        return ty * 100000 + tx;
    }
    /** Land on the surface (the caves below are drawn by caves.ts, so their rows are never land here). */
    landAt(tx: number, ty: number) {
        return ty < UNDER_Y && this.world.isLand(tx, ty) && !this.skip.has(this.idx(tx, ty));
    }
    biomeAt(tx: number, ty: number) {
        const p = this.world.plotAt(tx, ty);
        if (!p || !this.world.isLand(tx, ty)) return RIFT_ISLANDS && this.world.riftAtTile(tx, ty) >= 0 ? 'rift' : 'meadow';
        return p.biome;
    }
    /** The plots changed (bought land, a rising animation ended): rebuild the chunks round them. */
    invalidateAll() {
        this.veinsDirty = true;
        for (const k of [...this.chunks.keys()]) this.dropChunk(k);
    }
    invalidateRect(x0: number, y0: number, x1: number, y1: number) {
        this.veinsDirty = true;
        for (let cy = Math.floor((y0 - 3) / CH); cy <= Math.floor((y1 + 3) / CH); cy++) for (let cx = Math.floor((x0 - 3) / CH); cx <= Math.floor((x1 + 3) / CH); cx++) this.dropChunk(cy * 1000 + cx);
    }
    dropChunk(k: number) {
        const c = this.chunks.get(k);
        if (!c) return;
        for (const m of [c.ground, c.foam]) if (m) {
            this.group.remove(m);
            m.geometry.dispose();
        }
        this.chunks.delete(k);
    }
    rebuildVeins() {
        this.veins.clear();
        for (const p of this.world.plots) if (p.owned || p.dread) for (const v of p.veins ?? []) this.veins.set(this.idx(v[0], v[1]), v[2]);
        this.veinsDirty = false;
    }
    /**
     * Keep the chunks round (x, z) (tile units) built, and the far ones freed. Nearest first: the chunks under the camera (the one it is
     * over and the eight round it) are built at once, the rest three a frame, so the ground under you is there from the first frame even
     * on a slow device (it used to fill in row by row from the far corner, leaving you on open sea for a while).
     */
    update(x: number, z: number, radius = 56) {
        if (this.veinsDirty) this.rebuildVeins();
        const cx0 = Math.floor((x - radius) / CH), cx1 = Math.floor((x + radius) / CH), cy0 = Math.floor((z - radius) / CH), cy1 = Math.floor((z + radius) / CH);
        const fx = Math.floor(x / CH), fz = Math.floor(z / CH), want: [number, number, number][] = [];
        for (let cy = Math.max(0, cy0); cy <= cy1; cy++) for (let cx = Math.max(0, cx0); cx <= cx1; cx++) {
            if (!this.chunks.has(cy * 1000 + cx)) want.push([cx, cy, Math.max(Math.abs(cx - fx), Math.abs(cy - fz))]);
        }
        want.sort((a, b) => a[2] - b[2]);
        let built = 0;
        for (const [cx, cy, d] of want) {
            if (d > 1 && built >= 3) break;
            this.buildChunk(cx, cy, cy * 1000 + cx);
            built++;
        }
        for (const k of [...this.chunks.keys()]) {
            const cy = Math.floor(k / 1000), cx = k % 1000;
            if (cx < cx0 - 2 || cx > cx1 + 2 || cy < cy0 - 2 || cy > cy1 + 2) this.dropChunk(k);
        }
    }
    buildChunk(cx: number, cy: number, key: number) {
        this.vcache.clear();
        const tiles: number[] = [];
        for (let y = cy * CH; y < cy * CH + CH; y++) for (let x = cx * CH; x < cx * CH + CH; x++) tiles.push(x, y);
        const soup = new Soup();
        this.tiles(soup, tiles);
        const entry: { ground?: Mesh; foam?: Mesh } = {};
        const g = soup.geometry();
        if (g) {
            const m = new Mesh(g, groundMat);
            m.castShadow = true;
            m.receiveShadow = true;
            this.group.add(m);
            entry.ground = m;
        }
        const f = soup.foamGeometry();
        if (f) {
            const m = new Mesh(f, foamMat);
            m.renderOrder = 3;
            m.frustumCulled = true;
            this.group.add(m);
            entry.foam = m;
        }
        this.chunks.set(key, entry);
    }
    /** The tile soup for a flat list [x0, y0, x1, y1, ...] of tiles. */
    tiles(s: Soup, list: number[]) {
        for (let i = 0; i < list.length; i += 2) {
            const tx = list[i], ty = list[i + 1];
            if (this.landAt(tx, ty)) this.landTile(s, tx, ty);
            else this.waterTile(s, tx, ty);
        }
    }
    landTile(s: Soup, tx: number, ty: number) {
        const pal = PALS[this.biomeAt(tx, ty)] ?? PALS.meadow!, plot = this.world.plotAt(tx, ty);
        const h = hash2(tx * 1.7, ty * 2.3), r = h * 100, variant = r < 25 ? 0 : r < 50 ? 1 : r < 75 ? 2 : r < 83 ? 3 : r < 92 ? 4 : 5;
        let base = pal.ground[variant];
        const dread = plot?.dread ? 0.55 : 1;
        const shadeOf = (a: number) => dread * (0.94 + hash2(tx * 3.1 + a, ty * 5.7 - a) * 0.12);
        const hA = cornerH(tx, ty), hB = cornerH(tx + 1, ty), hC = cornerH(tx + 1, ty + 1), hD = cornerH(tx, ty + 1);
        const A = [tx, hA, ty], B = [tx + 1, hB, ty], C = [tx + 1, hC, ty + 1], D = [tx, hD, ty + 1];
        if (plot?.dread) base = new Color(base).lerp(new Color(0x4a3d6e), 0.45).getHex();
        if (tx + ty & 1) {
            s.tri(A, D, B, base, shadeOf(1));
            s.tri(B, D, C, base, shadeOf(2));
        } else {
            s.tri(A, D, C, base, shadeOf(3));
            s.tri(A, C, B, base, shadeOf(4));
        }
        if (!this.landAt(tx, ty + 1)) {
            const bands = pal.cliff, top = [hD, hC], y1 = [-0.1, -0.36, -0.68, SEABED_1];
            const wob = (x: number, k: number) => (hash2(x * 9.1, k * 4.3 + ty) - 0.5) * 0.06;
            for (let b = 0; b < 3; b++) {
                const ya = b === 0 ? top : [y1[b], y1[b]], yb = [y1[b + 1], y1[b + 1]];
                const za = ty + 1 + (b === 0 ? 0 : wob(tx, b)), zb = ty + 1 + wob(tx, b + 1), za2 = ty + 1 + (b === 0 ? 0 : wob(tx + 1, b)), zb2 = ty + 1 + wob(tx + 1, b + 1);
                s.quad([tx, ya[0], za], [tx + 1, ya[1], za2], [tx + 1, yb[1], zb2], [tx, yb[0], zb], bands[b], dread * (0.88 + hash2(tx + b, ty) * 0.1));
            }
        }
        const bank = new Color(pal.bank).multiplyScalar(dread).getHex();
        if (!this.landAt(tx + 1, ty)) s.quad([tx + 1, hB, ty], [tx + 1, hC, ty + 1], [tx + 1.32, SEABED_1, ty + 1], [tx + 1.32, SEABED_1, ty], bank, 0.93);
        if (!this.landAt(tx - 1, ty)) s.quad([tx, hD, ty + 1], [tx, hA, ty], [tx - 0.32, SEABED_1, ty], [tx - 0.32, SEABED_1, ty + 1], bank, 0.9);
        if (!this.landAt(tx, ty - 1)) s.quad([tx, hA, ty], [tx + 1, hB, ty], [tx + 1, SEABED_1, ty - 0.32], [tx, SEABED_1, ty - 0.32], bank, 0.96);
        const ore = this.veins.get(this.idx(tx, ty));
        if (ore) this.decal(s, tx, ty, ore, [hA, hB, hC, hD]);
        else if (variant >= 3 && !plot?.dread) this.decor(s, tx, ty, variant, pal, (hA + hB + hC + hD) / 4);
    }
    /**
     * An ore vein on the ground, as the 2D vein tiles paint it: a blob of the ore's colour that reaches out to the neighbours with the
     * same ore, so a vein of several tiles reads as one patch, and a few nuggets standing on it. It follows the ground's own bumps.
     */
    decal(s: Soup, tx: number, ty: number, ore: string, h: number[]) {
        const hex = ORE_COL[ore] ?? 0xa3a8bd, same = (dx: number, dy: number) => this.veins.get(this.idx(tx + dx, ty + dy)) === ore;
        const yAt = (x: number, z: number) => {
            const u = Math.min(1, Math.max(0, x - tx)), v = Math.min(1, Math.max(0, z - ty));
            return h[0] * (1 - u) * (1 - v) + h[1] * u * (1 - v) + h[2] * u * v + h[3] * (1 - u) * v + 0.022;
        };
        const cx = tx + 0.5, cz = ty + 0.5, n = 12, pts: V3[] = [], spin = hash2(tx, ty) * 0.4;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + spin, dx = Math.cos(a), dz = Math.sin(a);
            // reach to (and a little past) the edge toward a neighbour of the same vein; stay inside the tile elsewhere
            const ex = Math.abs(dx) > 0.38 ? Math.sign(dx) : 0, ez = Math.abs(dz) > 0.38 ? Math.sign(dz) : 0;
            const joins = (ex || ez) && same(ex, ez) && (!ex || !ez || (same(ex, 0) && same(0, ez)));
            const rr = joins ? 0.62 / Math.max(Math.abs(dx), Math.abs(dz)) : 0.34 + hash2(tx * 5 + i, ty * 7) * 0.1;
            const x = cx + dx * rr, z = cz + dz * rr;
            pts.push([x, yAt(x, z), z]);
        }
        const mid: V3 = [cx, yAt(cx, cz) + 0.004, cz];
        for (let i = 0; i < n; i++) s.tri(mid, pts[(i + 1) % n], pts[i], hex, 0.94 + (i % 3) * 0.035);
        for (let k = 0; k < 3; k++) {
            const a = hash2(tx + k * 3, ty - k) * 6.28, r = 0.08 + k * 0.1, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, y = yAt(x, z), q = 0.07 + hash2(tx - k, ty + k) * 0.05;
            const c = ore === 'coal' ? 0x4a4658 : new Color(hex).lerp(new Color(0xffffff), 0.25).getHex();
            s.tri([x - q, y, z + q * 0.7], [x + q, y, z + q * 0.5], [x, y + q * 1.4, z], c, 1.12);
            s.tri([x + q, y, z + q * 0.5], [x, y, z - q], [x, y + q * 1.4, z], c, 0.92);
            s.tri([x, y, z - q], [x - q, y, z + q * 0.7], [x, y + q * 1.4, z], c, 1);
        }
    }
    decor(s: Soup, tx: number, ty: number, variant: number, pal: Pal, y: number) {
        const rr = (k: number) => hash2(tx * 11.3 + k, ty * 7.9 - k);
        if (variant === 3) {
            for (let k = 0; k < 3; k++) {
                const x = tx + 0.2 + rr(k) * 0.6, z = ty + 0.2 + rr(k + 5) * 0.6, hgt = 0.22 + rr(k + 9) * 0.16, lean = (rr(k + 2) - 0.5) * 0.12;
                s.tri([x - 0.045, y, z], [x + 0.045, y, z], [x + lean, y + hgt, z + 0.02], pal.tuft, 0.95 + k * 0.08);
                s.tri([x, y, z - 0.045], [x, y, z + 0.045], [x + lean * 0.5, y + hgt * 0.8, z + lean], pal.tuft, 1.05);
            }
        } else if (variant === 4) {
            const x = tx + 0.25 + rr(1) * 0.5, z = ty + 0.25 + rr(2) * 0.5, c = FLOWERS[Math.floor(rr(3) * FLOWERS.length)];
            s.tri([x - 0.012, y, z], [x + 0.012, y, z], [x, y + 0.2, z], 0x5cb04f);
            const hy = y + 0.2;
            s.tri([x - 0.07, hy, z], [x + 0.07, hy, z], [x, hy + 0.07, z], c, 1.1);
            s.tri([x - 0.07, hy, z], [x, hy - 0.06, z + 0.02], [x + 0.07, hy, z], c, 0.9);
            s.tri([x, hy, z - 0.07], [x, hy, z + 0.07], [x, hy + 0.06, z], c, 1);
        } else {
            for (let k = 0; k < 2; k++) {
                const x = tx + 0.2 + rr(k) * 0.6, z = ty + 0.2 + rr(k + 4) * 0.6, r = 0.07 + rr(k + 8) * 0.06;
                s.tri([x - r, y, z], [x + r, y, z + r * 0.4], [x, y + r * 1.2, z], 0xb4b9cf, 1);
                s.tri([x + r, y, z + r * 0.4], [x, y, z - r], [x, y + r * 1.2, z], 0x8e93ad, 1);
                s.tri([x, y, z - r], [x - r, y, z], [x, y + r * 1.2, z], 0x9ea4b9, 1);
            }
        }
    }
    vdist(vx: number, vz: number) {
        const k = vz * 100000 + vx, hit = this.vcache.get(k);
        if (hit !== undefined) return hit;
        let best = 9;
        for (let b = vz - 5; b <= vz + 4; b++) for (let a = vx - 5; a <= vx + 4; a++) {
            if (!this.landAt(a, b)) continue;
            const d = Math.hypot(Math.max(a - vx, 0, vx - (a + 1)), Math.max(b - vz, 0, vz - (b + 1)));
            if (d < best) best = d;
        }
        this.vcache.set(k, best);
        return best;
    }
    /** A water tile near land: the seabed seen through the water, sloping from sand at the shore to deep teal, and the foam along the shore. */
    waterTile(s: Soup, tx: number, ty: number) {
        let near = false, adj = false;
        for (let dy = -4; dy <= 4 && !adj; dy++) for (let dx = -4; dx <= 4; dx++) {
            if (!this.landAt(tx + dx, ty + dy)) continue;
            near = true;
            if (Math.max(Math.abs(dx), Math.abs(dy)) <= 1) {
                adj = true;
                break;
            }
        }
        if (!near) return;
        const corner = (x: number, z: number): SeaCorner => {
            const d = Math.min(4, this.vdist(x, z)), u = d / 4, sm = u * u * (3 - 2 * u);
            const y = SEABED_1 - sm * 1.5 + (hash2(x * 3.7, z * 5.1) - 0.5) * 0.05;
            const c = new Color(0xeedaa0).lerp(new Color(0x7fd6c6), Math.min(1, d / 1.4)).lerp(new Color(0x2f86b8), Math.max(0, (d - 1.4) / 2.6));
            return { p: [x, y, z], c };
        };
        const A = corner(tx, ty), B = corner(tx + 1, ty), C = corner(tx + 1, ty + 1), D = corner(tx, ty + 1);
        if (A.c.r + B.c.r + C.c.r + D.c.r < 0) return;
        const j = 0.95 + hash2(tx * 2.9, ty * 1.3) * 0.08;
        if (tx + ty & 1) {
            s.triC(A, D, B, j);
            s.triC(B, D, C, j * 0.97);
        } else {
            s.triC(A, D, C, j);
            s.triC(A, C, B, j * 0.97);
        }
        if (adj) {
            const fy = WATER_Y + 0.035, W = 0.46;
            if (this.landAt(tx - 1, ty)) s.foamQuad([tx, fy, ty], [tx, fy, ty + 1], [tx + W, fy, ty + 1], [tx + W, fy, ty], 0.95, 0);
            if (this.landAt(tx + 1, ty)) s.foamQuad([tx + 1, fy, ty + 1], [tx + 1, fy, ty], [tx + 1 - W, fy, ty], [tx + 1 - W, fy, ty + 1], 0.95, 0);
            if (this.landAt(tx, ty - 1)) s.foamQuad([tx + 1, fy, ty], [tx, fy, ty], [tx, fy, ty + W], [tx + 1, fy, ty + W], 0.95, 0);
            if (this.landAt(tx, ty + 1)) s.foamQuad([tx, fy, ty + 1], [tx + 1, fy, ty + 1], [tx + 1, fy, ty + 1 - W], [tx, fy, ty + 1 - W], 0.95, 0);
            const cornerFoam = (lx: number, lz: number, ox: number, oz: number) => {
                if (this.landAt(tx + lx, ty + lz) && !this.landAt(tx + lx, ty) && !this.landAt(tx, ty + lz)) {
                    const cx = tx + (lx > 0 ? 1 : 0), cz = ty + (lz > 0 ? 1 : 0);
                    s.foamQuad([cx, fy, cz], [cx + ox * 0, fy, cz], [cx + ox * W, fy, cz + oz * W * 0.5], [cx, fy, cz + oz * W], 0.9, 0);
                }
            };
            cornerFoam(-1, -1, 1, 1);
            cornerFoam(1, -1, -1, 1);
            cornerFoam(-1, 1, 1, -1);
            cornerFoam(1, 1, -1, -1);
        }
    }
    // ── land rising out of the sea ──────────────────────────────────────────
    /** A plot was just bought: hide its tiles, then raise them ring by ring from the middle. */
    rise(plot: Plot, onRing?: (x: number, z: number, ring: number) => void) {
        const o = this.world.plotOrigin(plot), cx = o.tx + PLOT / 2, cz = o.ty + PLOT / 2;
        const byRing = new Map<number, number[]>();
        for (let y = 0; y < PLOT; y++) for (let x = 0; x < PLOT; x++) {
            const tx = o.tx + x, ty = o.ty + y;
            if (!this.world.isLand(tx, ty)) continue;
            this.skip.add(this.idx(tx, ty));
            const ring = Math.floor(Math.max(Math.abs(tx + 0.5 - cx), Math.abs(ty + 0.5 - cz)));
            if (!byRing.has(ring)) byRing.set(ring, []);
            byRing.get(ring)!.push(tx, ty);
        }
        this.invalidateRect(o.tx - 1, o.ty - 1, o.tx + PLOT, o.ty + PLOT);
        const saved = new Set(this.skip);
        this.skip.clear();
        const rings: Rising['rings'] = [];
        for (const [ring, list] of [...byRing.entries()].sort((a, b) => a[0] - b[0])) {
            const soup = new Soup();
            this.tiles(soup, list);
            const g = soup.geometry();
            if (!g) continue;
            const mesh = new Mesh(g, groundMat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.position.y = -3;
            this.group.add(mesh);
            rings.push({ mesh, delay: ring * 0.07 });
        }
        for (const k of saved) this.skip.add(k);
        this.rising.push({ rings, t: 0, plot, onRing, lastRing: -1 });
    }
    animate(dt: number) {
        foamMat.opacity = 0.7 + Math.sin(performance.now() / 700) * 0.2;
        for (let i = this.rising.length - 1; i >= 0; i--) {
            const r = this.rising[i];
            r.t += dt;
            let done = true;
            r.rings.forEach((g, k) => {
                const u = (r.t - g.delay) / 0.55;
                if (u < 1) done = false;
                const c = Math.min(1, Math.max(0, u)), e = 1 + 2.2 * Math.pow(c - 1, 3) + 1.2 * Math.pow(c - 1, 2);
                g.mesh.position.y = -3 * (1 - e);
                if (u >= 0 && k > r.lastRing) {
                    r.lastRing = k;
                    const o = this.world.plotOrigin(r.plot);
                    r.onRing?.(o.tx + PLOT / 2, o.ty + PLOT / 2, k);
                }
            });
            if (done) {
                const o = this.world.plotOrigin(r.plot);
                for (const g of r.rings) {
                    this.group.remove(g.mesh);
                    g.mesh.geometry.dispose();
                }
                for (let y = 0; y < PLOT; y++) for (let x = 0; x < PLOT; x++) this.skip.delete(this.idx(o.tx + x, o.ty + y));
                this.invalidateRect(o.tx - 1, o.ty - 1, o.tx + PLOT, o.ty + PLOT);
                this.rising.splice(i, 1);
            }
        }
    }
}
export class Sea {
    u = { uTime: { value: 0 }, uOff: { value: new Vector2() }, uSun: { value: 1 } };
    mesh: Mesh<PlaneGeometry, MeshStandardMaterial>;
    abyss: Mesh<CircleGeometry, MeshStandardMaterial>;
    constructor(scene: Scene) {
        const geo = new PlaneGeometry(220, 220, 110, 110);
        geo.rotateX(-Math.PI / 2);
        const mat = new MeshStandardMaterial({ color: 0x2b94d4, emissive: 0x0f5c9c, emissiveIntensity: 0.55, transparent: true, opacity: 0.8, flatShading: true, roughness: 0.4, metalness: 0, depthWrite: false });
        mat.onBeforeCompile = (sh) => {
            sh.uniforms.uTime = this.u.uTime;
            sh.uniforms.uOff = this.u.uOff;
            sh.uniforms.uSun = this.u.uSun;
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uOff; varying vec2 vSea;').replace('#include <begin_vertex>', `#include <begin_vertex>
                  vec2 w = position.xz + uOff; vSea = w;
                  transformed.y += sin(w.x * 0.9 + uTime * 1.2) * 0.035 + sin(w.y * 1.1 + uTime * 1.6) * 0.03 + sin((w.x - w.y) * 1.7 + uTime * 2.2) * 0.018;`);
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSea; uniform float uTime; uniform float uSun;').replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
                  float g1 = sin(vSea.x * 2.7 + uTime * 1.5) * sin(vSea.y * 3.1 - uTime * 1.2);
                  float g2 = sin(vSea.x * 4.9 - uTime * 2.1) * sin(vSea.y * 4.3 + uTime * 1.7);
                  totalEmissiveRadiance += vec3(1.0, 0.95, 0.8) * pow(max(0.0, g1 * g2), 6.0) * 1.7 * uSun;`);
        };
        this.mesh = new Mesh(geo, mat);
        this.mesh.position.y = WATER_Y;
        this.mesh.receiveShadow = true;
        this.mesh.renderOrder = 1;
        scene.add(this.mesh);
        const abyss = new Mesh(new CircleGeometry(900, 24).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: 0x1d6aa8, roughness: 0.8, flatShading: true }));
        abyss.position.y = -2.4;
        abyss.name = 'abyss';
        scene.add(abyss);
        this.abyss = abyss;
    }
    follow(x: number, z: number, t: number) {
        const sx = Math.round(x / 2) * 2, sz = Math.round(z / 2) * 2;
        this.mesh.position.x = sx;
        this.mesh.position.z = sz;
        this.abyss.position.x = sx;
        this.abyss.position.z = sz;
        this.u.uOff.value.set(sx, sz);
        this.u.uTime.value = t;
    }
}

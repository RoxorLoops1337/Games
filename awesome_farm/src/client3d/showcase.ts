// The showcase farmstead the prototype builds round a new farmer.
import { TILE } from '../shared/config';
import type { ItemId } from '../shared/data/items';
import type { MobKind } from '../shared/data/mobs';
import type { DevOp } from '../shared/sim/dev';
import type { Sim } from '../shared/sim/sim';
import type { BuildE, Cmd, CritE, PlayerS } from '../shared/sim/types';
import { type BuildingKind, BUILDINGS, CROPS } from '../shared/data/buildings';
import { SPECIES, type SpeciesId } from '../shared/data/creatures';
import { MOBS } from '../shared/data/mobs';
import { tryBuild } from '../shared/sim/economy';
import { spawnMob } from '../shared/sim/mobs';

/** What the showcase built: where (the farmer's tile), how many pieces, and the ones that would not go down (with why). */
export interface Staged { ax: number; ay: number; placed: number; failed: string[] }
/** Build a little farmstead round the new farmer (a cosy house, crops, a yard of creatures, a few monsters and drops) so the
 * 3D view has something to show at once. Uses the developer ops and the real build rules. */
export function stageShowcase(sim: Sim, p: PlayerS): Staged {
    const ax = Math.floor(p.x / TILE), ay = Math.floor(p.y / TILE);
    const out: Staged = { ax, ay, placed: 0, failed: [] };
    const dev = (c: { op: DevOp; n?: number; on?: boolean; id?: string }) => sim.command(p.id, { t: 'devdo', ...c } as Cmd);
    dev({ op: 'levelTo', n: 18 });
    dev({ op: 'skills' });
    dev({ op: 'medals' });
    dev({ op: 'kit' });
    dev({ op: 'gear' });
    dev({ op: 'coins', n: 4200 });
    dev({ op: 'god', on: true });
    dev({ op: 'heal' });
    for (const e of Object.values(sim.s.ents)) {
        if (e.k !== 'node') continue;
        const dx = e.tx - ax, dy = e.ty - ay;
        if (dx >= -8 && dx <= 7 && dy >= -9 && dy <= 6) sim.remove(e.id);
    }
    const pack = { ...p.inv };
    const stock = (r: ItemId, n3 = 999) => {
        p.inv[r] = Math.max(p.inv[r] ?? 0, n3);
    };
    for (const d of Object.values(BUILDINGS)) for (const r of Object.keys(d.cost) as ItemId[]) stock(r);
    const at = (dx: number, dy: number) => ({ tx: ax + dx, ty: ay + dy });
    p.x = (ax + 5.5) * TILE;
    p.y = (ay + 7.5) * TILE;
    p.warp = (p.warp ?? 0) + 1;
    const put = (kind: BuildingKind, dx: number, dy: number, rot = 0): BuildE | null => {
        const { tx, ty } = at(dx, dy);
        const r = tryBuild(sim, p, kind, tx, ty, rot, 99);
        if (!r.ok) {
            out.failed.push(`${kind}@${dx},${dy}: ${r.why}`);
            return null;
        }
        out.placed++;
        return r.b ?? null;
    };
    const rect = (kind: BuildingKind, x0: number, y0: number, x1: number, y1: number) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(kind, x, y);
    };
    const line = (kind: BuildingKind, x0: number, y0: number, x1: number, y1: number, rot = 0) => {
        const n3 = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let i = 0; i <= n3; i++) put(kind, x0 + Math.round((x1 - x0) * i / Math.max(1, n3)), y0 + Math.round((y1 - y0) * i / Math.max(1, n3)), rot);
    };
    const hx0 = -8, hx1 = -3, hy0 = -8, hy1 = -4;
    rect('carpet', hx0 + 1, hy0 + 1, hx1 - 1, hy0 + 2);
    rect('planks', hx0, hy0, hx1, hy1);
    for (let x = hx0; x <= hx1; x++) {
        put(x === hx0 + 1 || x === hx1 - 1 ? 'wall_window' : 'wall_brick', x, hy0);
    }
    for (let y = hy0 + 1; y < hy1; y++) {
        put(y === hy0 + 2 ? 'wall_window' : 'wall_brick', hx0, y);
        put(y === hy0 + 2 ? 'wall_window' : 'wall_brick', hx1, y);
    }
    for (let x = hx0; x <= hx1; x++) put(x === hx0 + 2 || x === hx0 + 3 ? 'wall_brick' : x === hx0 + 1 || x === hx1 - 1 ? 'wall_window' : 'wall_brick', x, hy1);
    put('doorway', hx0 + 2, hy1);
    put('kitchen', hx0 + 1, hy0 + 1);
    put('workbench', hx0 + 2, hy0 + 1);
    put('loom', hx0 + 3, hy0 + 1);
    put('chest', hx1 - 1, hy0 + 1);
    put('table', hx0 + 2, hy0 + 3);
    put('bench', hx0 + 1, hy0 + 3);
    put('barrel', hx1 - 1, hy0 + 3);
    put('lantern', hx1 - 1, hy0 + 2);
    rect('roof_tile', hx0, hy0, hx1, hy1);
    const fx0 = -1, fx1 = 6, fy0 = -8, fy1 = -4;
    line('fence', fx0, fy0, fx1, fy0);
    line('fence', fx0, fy0 + 1, fx0, fy1);
    line('fence', fx1, fy0 + 1, fx1, fy1);
    line('fence', fx0 + 1, fy1, fx0 + 2, fy1);
    line('fence', fx1 - 2, fy1, fx1 - 1, fy1);
    const seeds = Object.keys(CROPS) as ItemId[];
    let n = 0;
    for (let y = fy0 + 1; y < fy1; y++) for (let x = fx0 + 1; x < fx1; x++) {
        if (x === fx0 + 3 && y === fy0 + 2) {
            put('scarecrow', x, y);
            continue;
        }
        const b = put('bed', x, y);
        if (!b) continue;
        const seed = seeds[(Math.floor(n / 2) + n) % seeds.length];
        b.plant = seed;
        b.crop = n % 5 === 4 ? 0 : n % 3;
        b.growT = 0;
        sim.touch(b);
        n++;
    }
    put('haybale', fx1 + 1, fy0 + 1);
    put('haybale', fx1 + 1, fy0 + 2);
    put('barrel', fx0 - 1, fy1);
    line('path', hx0 + 2, hy1 + 1, hx0 + 2, 0);
    line('path', -8, 0, 6, 0);
    line('path', 3, fy1 + 1, 3, -1);
    put('lamppost', -2, -1);
    put('lamppost', 4, -1);
    put('lamppost', -4, hy1 + 2);
    put('lamppost', 7, 0);
    put('fountain', 1, 2);
    put('statue', -2, 3);
    put('flowerbed', -1, 2);
    put('flowerbed', 3, 2);
    put('flowerbed', 1, 4);
    put('flowerbed', 1, 1);
    put('campfire', 5, 3);
    put('bench', 4, 3);
    put('bench', 6, 3);
    put('bench', 5, 4);
    put('signpost', 7, -1);
    put('banner', -9, 0);
    put('banner', 8, -2);
    line('hedge', -8, 2, -8, 6);
    line('hedge', 7, 2, 7, 6);
    put('market', -3, 2);
    put('altar', 3, 5);
    put('windturbine', -7, 4);
    put('pole', -5, 4);
    put('drill', -5, 1, 0);
    line('belt', -3, 1, -1, 1, 0);
    put('chest', 0, 1);
    const f = put('furnace', -3, 5);
    if (f) {
        f.inv = { iron: 12 };
        f.fin = { coal: 10 };
        sim.touch(f);
    }
    const f2 = put('furnace', -3, 6);
    if (f2) {
        f2.inv = { clay: 8 };
        f2.fin = { coal: 10 };
        sim.touch(f2);
    }
    put('sawmill', -4, 3);
    put('anvil', -2, 5);
    put('millstone', -1, 5);
    put('chest', 0, 5);
    put('steelchest', 0, 6);
    put('mill', 5, 5);
    put('hatchery', 1, 6);
    put('fortune', -6, 6);
    p.inv = pack;
    p.x = (ax + 0.5) * TILE;
    p.y = (ay + 0.5) * TILE + 6;
    p.warp = (p.warp ?? 0) + 1;
    const yard = ['hopper', 'fuzzle', 'mossback', ...Object.keys(SPECIES).slice(3, 9)] as SpeciesId[];
    yard.forEach((sp, i) => {
        if (!(sp in SPECIES)) return;
        const x = (ax + i % 4 * 2 - 3 + 0.5) * TILE, y = (ay + 1 + Math.floor(i / 4) * 2 + 0.5) * TILE;
        if (!sim.world.isFree(Math.floor(x / TILE), Math.floor(y / TILE))) return;
        sim.add<CritE>({ k: 'crit', sp, x, y, vx: 0, vy: 0, t: i, lv: 3 + i, mode: 0, st: 0, hx: x, hy: y, life: 1000000000, a: 0 });
    });
    const kinds = (Object.keys(MOBS) as MobKind[]).filter((k) => !MOBS[k].boss).slice(0, 3);
    kinds.forEach((k, i) => spawnMob(sim, k, undefined, undefined, { x: (ax + 6 + i) * TILE, y: (ay + 7.5) * TILE, lv: 6, elite: i === 2, pack: false }));
    for (const [res, dx, dy] of [['wood', 2, 6], ['stone', 3, 6], ['seed_wheat', -1, 4], ['coal', 6, 1], ['ironbar', 1, 7]] as [ItemId, number, number][]) sim.spawnDrop(res, (ax + dx + 0.5) * TILE, (ay + dy + 0.5) * TILE);
    dev({ op: 'time', id: 'noon' });
    return out;
}

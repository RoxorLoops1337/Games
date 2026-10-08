// The model library page (dev only: /proto3d-models.html): every node, building, crop, monster, creature, drop and farmer look on labelled shelves.
import * as THREE from 'three';
import { ACESFilmicToneMapping, CanvasTexture, type Object3D, Color, DirectionalLight, Group, HalfFloatType, HemisphereLight, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial, NearestFilter, OrthographicCamera, PCFSoftShadowMap, Plane, PlaneGeometry, Raycaster, RepeatWrapping, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { type BuildingKind, BUILDINGS, CROPS } from '../shared/data/buildings';
import { SPECIES, SPECIES_LIST } from '../shared/data/creatures';
import { type ItemId, ITEMS } from '../shared/data/items';
import type { Look } from '../shared/data/look';
import { BODY_TONES, EYES, MOUTHS, SCARF_COLORS, SPROUTS } from '../shared/data/look';
import { type MobKind, MOBS } from '../shared/data/mobs';
import { type NodeKind, NODES } from '../shared/data/nodes';
import type { BuildE, CritE, Ent, MobE, NodeE } from '../shared/sim/types';
import { buildingModel } from './models/buildings';
import { critterModel } from './models/critters';
import { dropModel } from './models/drops';
import { type Equip, farmerModel } from './models/farmer';
import { countTris, env, hash, type Model } from './models/kit';
import { mobModel } from './models/mobs';
import { nodeModel } from './models/nodes';

window.addEventListener('error', (e) => {
    const i = document.getElementById('info');
    if (i) {
        i.style.cssText += ';max-width:90vw;white-space:pre-wrap;background:#a02030';
        i.textContent += `${e.message} @${e.filename?.split('/').pop()}:${e.lineno}
`;
    }
});
window.addEventListener('unhandledrejection', (e) => {
    const i = document.getElementById('info');
    if (i) i.textContent += `${e.reason}
`;
});
/** What a shelf shows: the object, and the hooks a live model may have. */
export interface ShelfModel { obj: Object3D; update?(dt: number, t: number): void; apply?(e: Ent): void; dispose?(): void }
/** One model on the shelves: its name and caption, footprint in tiles, its section, and how to make it (the model and its per-frame step). */
export interface Entry { name: string; sub: string; w: number; h: number; section: string; make: () => { model: ShelfModel; step: (dt: number, t: number) => void } }
/** A model placed on the stage. */
export interface Placed { entry: Entry; live: ReturnType<Entry['make']>; root: Group; spin: Group; tris: number; x: number; z: number; hp?: number }
export const Q = new URLSearchParams(location.search);
export const SHOT = Q.has('shot');
export const num = (k: string, d: number) => Q.has(k) ? Number(Q.get(k)) : d;
export const GROUPS = ['nodes', 'work', 'home', 'special', 'crops', 'mobs', 'critters', 'drops', 'farmer', 'scene'];
export const TITLES: Record<string, string> = { nodes: 'Nodes', work: 'Work & power', home: 'Home & decor', special: 'Special', crops: 'Crops', mobs: 'Monsters', critters: 'Creatures', drops: 'Drops', farmer: 'Farmer', scene: 'Sample farm' };
export const flags: Record<string, boolean> = { turn: Q.get('turn') === '1', night: Q.get('night') === '1', bloom: Q.get('bloom') !== '0', walk: Q.get('walk') !== '0', hurt: Q.get('hurt') === '1' };
export const fakeNode = (kind: string, hp: number) => ({ id: 1, k: 'node', kind, tx: 0, ty: 0, hp, plot: 0 }) as NodeE;
export const fakeBuild = (kind: string, rot: number, over: Partial<BuildE> = {}) => ({ id: 1, k: 'bld', kind, tx: 0, ty: 0, rot, ...over }) as BuildE;
export const ON_STATE: Partial<BuildE> = { act: 1, pw: 1, fuel: 60, prog: 0.5, chg: 1200 };
export const PLAIN_ON = new Set(['anvil', 'kitchen', 'loom', 'alchemy', 'campfire', 'windturbine', 'fountain', 'altar', 'dock', 'riftforge', 'waystone', 'fortune', 'mill', 'mineshaft', 'lantern', 'lamppost', 'banner', 'hatchery', 'den', 'solar', 'battery']);
export function nodeEntries() {
    const out: Entry[] = [];
    const mk = (kind: string, biome: string, seed: number, gold: boolean, sub: string, section: string) => out.push({
        name: kind,
        sub,
        w: kind === 'tree' ? 2 : 1,
        h: 1,
        section,
        make: () => {
            const m = nodeModel(kind, { biome, gold, seed });
            return { model: m, step: (dt: number, t: number) => m.update?.(dt, t) };
        }
    });
    for (const kind of Object.keys(NODES) as NodeKind[]) {
        const sec = NODES[kind].group;
        if (kind === 'tree') {
            for (const [b, s] of [['meadow', 1], ['meadow', 2], ['meadow', 3], ['meadow', 4], ['snowcap', 1], ['snowcap', 2], ['snowcap', 3], ['bog', 1], ['bog', 2], ['bog', 3], ['bog', 4], ['goldsand', 1], ['goldsand', 2], ['goldsand', 3], ['goldsand', 4], ['quarry', 1], ['quarry', 2], ['quarry', 3]] as [string, number][]) mk(kind, b, s, false, `${b} ${s}`, sec);
            mk(kind, 'meadow', 5, true, 'golden', sec);
        } else if (kind === 'rock' || kind === 'mushroom' || kind === 'sand') {
            for (const b of ['meadow', 'quarry', 'snowcap', 'goldsand', 'bog']) mk(kind, b, 7, false, b, sec);
            mk(kind, 'meadow', 2, true, 'golden', sec);
        } else {
            mk(kind, 'meadow', 3, false, '', sec);
            mk(kind, 'meadow', 3, true, 'golden', sec);
        }
    }
    return out;
}
export const WORK_CATS = new Set(['craft', 'industry', 'power', 'logistics', 'farm', 'storage', 'light']);
export const HOME_CATS = new Set(['home', 'decor']);
export function joins(kind: BuildingKind) {
    const d = BUILDINGS[kind];
    return !!(d.wall || d.roof || d.floor) || kind === 'fence' || kind === 'hedge' || kind === 'stonewall';
}
export const MASKS: [number, string][] = [[0, 'alone'], [2, 'end E'], [10, 'E-W'], [8, 'end W'], [5, 'N-S'], [3, 'N+E'], [6, 'E+S'], [12, 'S+W'], [9, 'W+N'], [7, 'T'], [15, 'cross']];
export function buildingEntry(kind: BuildingKind, rot: number, mask: number, state: string, sub: string, section: string, seed = 1): Entry {
    const d = BUILDINGS[kind];
    const [w, h] = d.size;
    return {
        name: kind,
        sub,
        w,
        h,
        section,
        make: () => {
            const m = buildingModel(kind, { rot, seed, mask });
            const e = fakeBuild(kind, rot, state === 'on' ? kind === 'bed' ? { crop: 2, plant: 'seed_wheat' } : ON_STATE : {});
            m.apply?.(e);
            return { model: m, step: (dt: number, t: number) => m.update?.(dt, t) };
        }
    };
}
export function buildingEntries(cats: Set<string>) {
    const out: Entry[] = [];
    for (const kind of Object.keys(BUILDINGS) as BuildingKind[]) {
        const d = BUILDINGS[kind];
        if (!cats.has(d.cat)) continue;
        const sec = d.cat;
        const stateful = !!(d.proc || d.use || d.gen || d.fuel || d.store || PLAIN_ON.has(kind));
        if (!d.dir && joins(kind)) {
            for (const [mask, label] of MASKS) out.push(buildingEntry(kind, 0, mask, 'off', label, sec));
        } else if (kind === 'belt' || kind === 'tunnel' || kind === 'tunnelx' || kind === 'splitter' || kind === 'sorter') {
            for (let rot = 0; rot < 4; rot++) out.push(buildingEntry(kind, rot, 0, 'off', `rot ${rot}`, sec));
            if (kind === 'belt') for (const [mask, label] of [[10, 'straight E'], [3, 'from N'], [6, 'from S'], [11, 'T']] as [number, string][]) out.push(buildingEntry(kind, 0, mask, 'off', label, sec));
            if (kind === 'tunnel' || kind === 'tunnelx') out.push(buildingEntry(kind, 0, 0, 'on', 'on', sec));
        } else if (d.dir) {
            for (let rot = 0; rot < 4; rot++) out.push(buildingEntry(kind, rot, 0, 'off', `rot ${rot}`, sec));
            if (stateful) out.push(buildingEntry(kind, 0, 0, 'on', 'on', sec));
        } else if (kind === 'bed') {
            out.push(buildingEntry(kind, 0, 0, 'off', 'empty', sec), buildingEntry(kind, 0, 0, 'on', 'ripe wheat', sec));
        } else {
            out.push(buildingEntry(kind, 0, 0, 'off', stateful ? 'off' : '', sec));
            if (stateful) out.push(buildingEntry(kind, 0, 0, 'on', 'on', sec));
        }
    }
    if (cats === HOME_CATS) out.push(...houseEntries());
    return out;
}
export function houseEntries(): Entry[] {
    const W = 7, H = 5;
    const wallKind = (x: number, y: number) => y === 0 && x === 3 ? 'wall_window' : 'wall_wood';
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
    const isWall = (x: number, y: number) => inside(x, y) && (x === 0 || y === 0 || x === W - 1 || y === H - 1);
    const maskAt = (x: number, y: number) => (isWall(x, y - 1) ? 1 : 0) | (isWall(x + 1, y) ? 2 : 0) | (isWall(x, y + 1) ? 4 : 0) | (isWall(x - 1, y) ? 8 : 0);
    const maskAll = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H ? 1 : 0;
    return [{
        name: 'house kit',
        sub: 'walls, doorway, floor, roof',
        w: W,
        h: H,
        section: 'house',
        make: () => {
            const g = new Group(), lives: Model[] = [];
            const put = (kind: BuildingKind, x: number, y: number, rot: number, mask: number) => {
                const m = buildingModel(kind, { rot, seed: x * 7 + y, mask });
                m.obj.position.set(x + 0.5 - W / 2, 0, y + 0.5 - H / 2);
                g.add(m.obj);
                lives.push(m);
                return m;
            };
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const inside2 = x > 0 && y > 0 && x < W - 1 && y < H - 1;
                if (inside2) put(y === 2 && x > 1 && x < 5 ? 'carpet' : 'planks', x, y, 0, 15);
                if (isWall(x, y) && !(y === H - 1 && x === 3)) put(wallKind(x, y), x, y, 0, maskAt(x, y));
            }
            put('doorway', 3, H - 1, 0, 10);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put('roof_tile', x, y, 0, (y > 0 ? 1 : 0) | (x < W - 1 ? 2 : 0) | (y < H - 1 ? 4 : 0) | (x > 0 ? 8 : 0) | (maskAll(x, y) ? 0 : 0));
            const f = put('table', 2, 2, 0, 0);
            f.obj.position.set(2.5 - W / 2 + 0.5, 0, 2.5 - H / 2);
            return { model: { obj: g }, step: (dt: number, t: number) => lives.forEach((m) => m.update?.(dt, t)) };
        }
    }];
}
export function cropEntries() {
    const out: Entry[] = [];
    for (const stage of [2, 1, 0]) for (const [seed, def] of Object.entries(CROPS)) {
        const nm = def.name.toLowerCase();
        out.push({
            name: nm,
            sub: ['sprout', 'leafy', 'ripe'][stage],
            w: 1,
            h: 1,
            section: ['sprouts', 'leafy', 'ripe'][stage],
            make: () => {
                const m = buildingModel('bed', { rot: 0, seed: 3, mask: 0 });
                m.apply?.(fakeBuild('bed', 0, { crop: stage, plant: seed as ItemId, growT: 3 }));
                return { model: m, step: (dt: number, t: number) => m.update?.(dt, t) };
            }
        });
    }
    return out;
}
export const fakeMob = (kind: string, hurt: number) => ({ id: 1, k: 'mob', kind, x: 0, y: 0, hp: 5, mhp: 10, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0, ...hurt ? {} : {} }) as MobE;
export function mobEntries() {
    const out: Entry[] = [];
    for (const kind of Object.keys(MOBS) as MobKind[]) {
        const d = MOBS[kind];
        const size = Math.max(1, Math.ceil(d.r * 2.6 / 16));
        const boss = d.ai === 'boss';
        for (const elite of boss ? [false] : [false, true]) {
            out.push({
                name: kind,
                sub: elite ? 'elite' : boss ? 'boss' : '',
                w: size,
                h: size,
                section: boss ? 'bosses' : `tier ${MOBS[kind].tier}`,
                make: () => {
                    const m = mobModel(kind, { elite, seed: 5 });
                    m.apply?.(fakeMob(kind, 0));
                    let hurt = 0, face = 0;
                    return { model: m, step: (dt: number, t: number) => {
                        m.update?.(dt, t);
                        hurt = flags.hurt ? Math.max(0, 1 - t * 0.9 % 2.2) : 0;
                        face = flags.turn ? 0 : Math.sin(t * 0.7) * 0.5;
                        m.pose!(face, flags.walk, hurt, dt);
                    } };
                }
            });
        }
    }
    return out;
}
export const fakeCrit = (sp: string) => ({ id: 1, k: 'crit', sp, x: 0, y: 0, vx: 0, vy: 0, t: 0, lv: 3, mode: 1 }) as CritE;
export function critterEntries() {
    const out: Entry[] = [];
    for (const sp of SPECIES_LIST) {
        const el = SPECIES[sp].element;
        for (const sleeping of [false, true]) {
            out.push({
                name: sp,
                sub: sleeping ? `sleeping · ${el}` : el,
                w: 1,
                h: 1,
                section: 'species',
                make: () => {
                    const m = critterModel(sp, { seed: 4, stage: 0 });
                    m.apply?.(fakeCrit(sp));
                    return { model: m, step: (dt: number, t: number) => {
                        m.update?.(dt, t);
                        m.pose!(flags.turn ? 0 : Math.sin(t * 0.6) * 0.5, flags.walk && !sleeping, sleeping, dt);
                    } };
                }
            });
        }
    }
    out.push({
        name: 'hopper',
        sub: 'stage 3 (stars)',
        w: 1,
        h: 1,
        section: 'species',
        make: () => {
            const m = critterModel('hopper', { seed: 4, stage: 3 });
            return { model: m, step: (dt: number, t: number) => {
                m.update?.(dt, t);
                m.pose!(0, false, false, dt);
            } };
        }
    });
    return out;
}
export function dropEntries() {
    const out: Entry[] = [];
    const ids = ['coin', ...Object.keys(ITEMS)];
    for (const id of ids) {
        const def = id === 'coin' ? null : ITEMS[id as ItemId];
        const sec = id === 'coin' ? 'coins' : def!.gear ? `gear: ${def!.gear.slot}` : def!.kind;
        out.push({ name: id, sub: '', w: 1, h: 1, section: sec, make: () => {
            const m = dropModel(id);
            return { model: m, step: (dt: number, t: number) => m.update?.(dt, t) };
        } });
    }
    out.sort((a, b) => a.section < b.section ? -1 : a.section > b.section ? 1 : 0);
    return out;
}
export function farmerEntries() {
    const out: Entry[] = [];
    const add = (name: string, sub: string, section: string, look: Look, color: number, equip: Equip, anim = 'idle') => out.push({
        name,
        sub,
        w: 1,
        h: 1,
        section,
        make: () => {
            const f = farmerModel(look, color, equip);
            let swing = 0;
            return {
                model: f,
                step: (dt: number, t: number) => {
                    if (anim === 'swing') swing = t * 1.3 % 1.6 < 1 ? t * 1.3 % 1.6 : 0;
                    const a = flags.turn ? 0 : Math.sin(t * 0.7) * 0.5;
                    f.pose(Math.sin(a), Math.cos(a), anim === 'walk' ? flags.walk : false, anim === 'swing' ? swing : 0, anim === 'down', dt);
                }
            };
        }
    });
    const D: Look = { b: 0, l: 0, e: 0, m: 0 };
    BODY_TONES.forEach((t, i) => add(t.name, 'body', 'body tones', { ...D, b: i }, i % 8, {}));
    SPROUTS.forEach((n, i) => add(n, 'sprout', 'sprouts', { ...D, l: i }, 4, {}));
    EYES.forEach((n, i) => add(n, 'eyes', 'eyes', { ...D, e: i }, 1, {}));
    MOUTHS.forEach((n, i) => add(n, 'mouth', 'mouths', { ...D, m: i }, 6, {}));
    SCARF_COLORS.forEach((_c, i) => add(`scarf ${i}`, '', 'scarves', { b: i % 8, l: i % 5, e: i % 4, m: i % 4 }, i, {}, 'walk'));
    add('idle', '', 'poses', D, 0, {});
    add('walking', '', 'poses', D, 0, {}, 'walk');
    add('swinging', 'club', 'poses', D, 0, { weapon: 'club', tool: 'pick_flint' }, 'swing');
    add('downed', '', 'poses', D, 0, {}, 'down');
    const gear = Object.entries(ITEMS).filter(([, d]) => d.gear);
    for (const [k, d] of gear) {
        const id = k as ItemId;
        const slot = d.gear!.slot;
        if (slot === 'tool') add(id, 'tool', 'tools (swing)', D, 2, { tool: id }, 'swing');
        else if (slot === 'weapon') add(id, d.gear!.wtype ?? '', 'weapons (swing)', D, 5, { weapon: id }, 'swing');
        else if (slot === 'head') add(id, 'head', 'head gear', D, 3, { head: id });
        else if (slot === 'body') add(id, 'body', 'body armour', D, 0, { body: id });
        else if (slot === 'bag') add(id, 'bag', 'bags', D, 1, { bag: id });
    }
    add('full set', 'steel + shield bag', 'outfits', { b: 7, l: 1, e: 2, m: 1 }, 6, { head: 'helm_steel', body: 'plate_steel', weapon: 'sword_steel', bag: 'bag_pack' }, 'swing');
    add('rift set', 'rift', 'outfits', { b: 4, l: 2, e: 1, m: 2 }, 3, { head: 'helm_rift', body: 'plate_rift', weapon: 'sword_rift', bag: 'bag_rift' }, 'walk');
    return out;
}
export function sceneEntries(): Entry[] {
    const W = 26, H = 17;
    return [{
        name: 'sample farm',
        sub: 'everything together',
        w: W,
        h: H,
        section: 'sample',
        make: () => {
            const g = new Group(), lives: ShelfModel[] = [], poses: ((dt: number, t: number) => void)[] = [];
            const at = <T extends ShelfModel>(m: T, x: number, z: number): T => {
                m.obj.position.set(x - W / 2, 0, z - H / 2);
                g.add(m.obj);
                lives.push(m);
                return m;
            };
            const tile = (x: number, z: number): [number, number] => [x + 0.5, z + 0.5];
            const b = (kind: BuildingKind, tx: number, ty: number, o: { rot?: number; mask?: number; on?: boolean; plant?: string; crop?: number } = {}) => {
                const d = BUILDINGS[kind], [w, h] = d.size;
                const m = buildingModel(kind, { rot: o.rot ?? 0, seed: tx * 13 + ty, mask: o.mask ?? 0 });
                if (o.on) m.apply?.(fakeBuild(kind, o.rot ?? 0, ON_STATE));
                if (o.plant) m.apply?.(fakeBuild(kind, 0, { crop: o.crop ?? 2, plant: o.plant as ItemId, growT: 3 }));
                return at(m, tx + w / 2, ty + h / 2);
            };
            for (let z = 8; z < 15; z++) b('path', 6, z, { mask: 5 });
            for (let x = 7; x < 15; x++) b('path', x, 14, { mask: 10 });
            const HW = 7, HH = 5, X0 = 3, Z0 = 3;
            const isW = (x: number, y: number) => x >= 0 && y >= 0 && x < HW && y < HH && (x === 0 || y === 0 || x === HW - 1 || y === HH - 1);
            for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) {
                if (x > 0 && y > 0 && x < HW - 1 && y < HH - 1) b(y === 2 && x > 1 && x < 5 ? 'carpet' : 'planks', X0 + x, Z0 + y, { mask: 15 });
                if (isW(x, y) && !(y === HH - 1 && x === 3)) b(y === 0 && x === 3 || x === HW - 1 && y === 2 ? 'wall_window' : 'wall_wood', X0 + x, Z0 + y, { mask: (isW(x, y - 1) ? 1 : 0) | (isW(x + 1, y) ? 2 : 0) | (isW(x, y + 1) ? 4 : 0) | (isW(x - 1, y) ? 8 : 0) });
            }
            b('doorway', X0 + 3, Z0 + HH - 1, { mask: 10 });
            for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) b('roof_tile', X0 + x, Z0 + y, { mask: (y > 0 ? 1 : 0) | (x < HW - 1 ? 2 : 0) | (y < HH - 1 ? 4 : 0) | (x > 0 ? 8 : 0) });
            b('table', X0 + 2, Z0 + 2);
            b('workbench', X0 + 1, Z0 + 1);
            b('chest', X0 + 5, Z0 + 1);
            const seeds = Object.keys(CROPS);
            for (let i = 0; i < 9; i++) b('bed', 14 + i % 3, 5 + Math.floor(i / 3), { plant: seeds[i], crop: i % 3 === 0 ? 1 : 2 });
            for (let x = 13; x < 18; x++) {
                b('fence', x, 4, { mask: (x > 13 ? 8 : 0) | (x < 17 ? 2 : 0) });
                b('fence', x, 8, { mask: (x > 13 ? 8 : 0) | (x < 17 ? 2 : 0) });
            }
            for (const x of [13, 17]) for (const z of [5, 6, 7]) b('fence', x, z, { mask: 5 });
            b('scarecrow', 15, 9);
            b('hedge', 19, 5, { mask: 4 });
            b('hedge', 19, 6, { mask: 5 });
            b('hedge', 19, 7, { mask: 1 });
            b('flowerbed', 19, 9);
            b('furnace', 9, 11, { on: true });
            b('anvil', 11, 11);
            b('campfire', 8, 13);
            b('sawmill', 11, 9);
            for (let x = 14; x < 20; x++) b('belt', x, 12, { rot: 0, mask: 10 });
            b('inserter', 20, 12, { rot: 0, on: true });
            b('chest', 21, 12);
            b('windturbine', 22, 8, { on: true });
            b('pole', 20, 10);
            b('lamppost', 5, 13);
            b('lantern', 14, 13);
            b('bench', 4, 11);
            b('barrel', 8, 11);
            b('haybale', 20, 14);
            b('market', 16, 15);
            b('signpost', 10, 15);
            b('fountain', 0, 12, {});
            const trees: [number, number, string, number][] = [[22, 1, 'meadow', 1], [23, 2, 'meadow', 2], [21, 3, 'meadow', 3], [24, 4, 'meadow', 4], [20, 1, 'meadow', 5], [24, 0, 'meadow', 6], [23, 5, 'meadow', 7]];
            for (const [x, z, bi, sd] of trees) at(nodeModel('tree', { biome: bi, gold: false, seed: sd }), ...tile(x, z));
            const ores: [number, number, string][] = [[0, 0, 'rock'], [1, 1, 'iron'], [0, 2, 'copper'], [2, 0, 'coal'], [1, 3, 'rock'], [3, 1, 'gold'], [0, 4, 'crystal'], [2, 2, 'rock']];
            for (const [x, z, k] of ores) at(nodeModel(k, { biome: 'quarry', gold: false, seed: x * 7 + z }), ...tile(x, z));
            const plants: [number, number, string][] = [[10, 1, 'bush'], [12, 2, 'flower'], [11, 3, 'mushroom'], [14, 1, 'bush'], [15, 3, 'flower'], [9, 2, 'reeds'], [18, 2, 'cotton'], [13, 0, 'herb'], [16, 1, 'chest'], [17, 11, 'sand'], [2, 8, 'clay'], [1, 9, 'peat']];
            for (const [x, z, k] of plants) at(nodeModel(k, { biome: 'meadow', gold: false, seed: x + z }), ...tile(x, z));
            const farmer = farmerModel({ b: 0, l: 1, e: 2, m: 1 }, 1, { weapon: 'sword_iron', head: 'cap_cloth', bag: 'bag_satchel' });
            at(farmer, ...tile(15, 10));
            poses.push((dt: number, t: number) => farmer.pose(Math.sin(t * 0.5), Math.cos(t * 0.5), false, t % 3 < 0.7 ? t % 3 / 0.7 : 0, false, dt));
            const pet = critterModel('hopper', { seed: 2 });
            at(pet, ...tile(16, 11));
            poses.push((dt: number, t: number) => pet.pose!(0.6 + Math.sin(t) * 0.3, false, false, dt));
            const pet2 = critterModel('fuzzle', { seed: 3 });
            at(pet2, ...tile(13, 10));
            poses.push((dt: number, t: number) => pet2.pose!(-0.5, Math.sin(t * 0.4) > 0.6, false, dt));
            const slime = mobModel('slime', { elite: false, seed: 1 });
            at(slime, ...tile(24, 13));
            poses.push((dt: number) => slime.pose!(-1.2, true, 0, dt));
            const skel = mobModel('skeleton', { elite: true, seed: 1 });
            at(skel, ...tile(23, 15));
            poses.push((dt: number, t: number) => skel.pose!(-2.2, Math.sin(t * 0.3) > -0.4, 0, dt));
            const boar = mobModel('boar', { elite: false, seed: 4 });
            at(boar, ...tile(5, 15));
            poses.push((dt: number) => boar.pose!(1.4, false, 0, dt));
            const drops: [number, number, string][] = [[17, 13, 'coin'], [18, 13, 'wood'], [16, 13, 'ironbar'], [8, 9, 'crystal'], [12, 6, 'seed_wheat'], [7, 9, 'potion_heal']];
            for (const [x, z, id] of drops) at(dropModel(id), ...tile(x, z));
            return { model: { obj: g }, step: (dt: number, t: number) => {
                lives.forEach((m) => m.update?.(dt, t));
                poses.forEach((f) => f(dt, t));
            } };
        }
    }];
}
export function entriesFor(g: string): Entry[] | undefined {
    switch (g) {
        case 'nodes':
            return nodeEntries();
        case 'work':
            return buildingEntries(WORK_CATS);
        case 'home':
            return buildingEntries(HOME_CATS);
        case 'special':
            return buildingEntries(new Set(['special']));
        case 'crops':
            return cropEntries();
        case 'mobs':
            return mobEntries();
        case 'critters':
            return critterEntries();
        case 'drops':
            return dropEntries();
        case 'farmer':
            return farmerEntries();
        case 'scene':
            return sceneEntries();
    }
}
export const host = document.getElementById('c')!;
export const info = document.getElementById('info')!;
export const tabsEl = document.getElementById('tabs')!;
export const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: SHOT });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
host.appendChild(renderer.domElement);
export const scene = new Scene();
scene.background = new Color(0x1b2552);
export const camera = new OrthographicCamera(-10, 10, 6, -6, 0.1, 400);
export const ELEV = MathUtils.degToRad(60);
export const sun = new DirectionalLight(0xfff0d6, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
export const hemi = new HemisphereLight(0xcfe6ff, 0x7a6a50, 0.85);
scene.add(hemi);
export const fill = new DirectionalLight(0xfff4e0, 0.9);
fill.position.set(0.5, 0.45, 1);
scene.add(fill);
export const SUN_DIR = new Vector3(-0.55, 0.78, -0.5).normalize();
export const composer = new EffectComposer(renderer, new WebGLRenderTarget(4, 4, { type: HalfFloatType, samples: 4 }));
export const renderPass = new RenderPass(scene, camera);
export const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.5, 0.55, 1.35);
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(new OutputPass());
export function groundTexture() {
    const S = 64, c = document.createElement('canvas');
    c.width = c.height = S * 2;
    const x = c.getContext('2d')!;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        x.fillStyle = (i + j) % 2 ? '#8ccb5c' : '#92d364';
        x.fillRect(i * S, j * S, S, S);
        x.strokeStyle = 'rgba(60,110,50,.38)';
        x.lineWidth = 2;
        x.strokeRect(i * S + 1, j * S + 1, S - 2, S - 2);
        const r = hash(i * 3.1, j * 7.7);
        x.fillStyle = 'rgba(70,140,60,.16)';
        for (let k = 0; k < 7; k++) x.fillRect(i * S + 6 + (r * 977 + k * 29) % (S - 14), j * S + 6 + (r * 631 + k * 41) % (S - 14), 3, 2);
    }
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.colorSpace = SRGBColorSpace;
    t.magFilter = NearestFilter;
    t.anisotropy = 8;
    return t;
}
export const ground = new Mesh(new PlaneGeometry(400, 400), new MeshStandardMaterial({ map: groundTexture(), roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.material.map!.repeat.set(200, 200);
scene.add(ground);
export const stage = new Group();
scene.add(stage);
export const labels = new Group();
scene.add(labels);
export function labelMesh(text: string, sub: string, w: number, size = 0.3, header = false) {
    const px = 48, cw = Math.max(1.4, w), W = Math.round(cw * px), Hh = Math.round((header ? 0.8 : sub ? 0.86 : 0.5) * px);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = Hh;
    const x = c.getContext('2d')!;
    x.fillStyle = header ? 'rgba(42,29,44,.82)' : 'rgba(42,29,44,.55)';
    const r = 8;
    x.beginPath();
    x.moveTo(r, 0);
    x.arcTo(W, 0, W, Hh, r);
    x.arcTo(W, Hh, 0, Hh, r);
    x.arcTo(0, Hh, 0, 0, r);
    x.arcTo(0, 0, W, 0, r);
    x.closePath();
    x.fill();
    x.textAlign = 'center';
    x.fillStyle = '#fff6e0';
    const fs = header ? 30 : 17;
    x.font = `600 ${fs}px system-ui, sans-serif`;
    let tx = text;
    while (x.measureText(tx).width > W - 10 && tx.length > 3) tx = tx.slice(0, -2);
    if (tx !== text) tx += '…';
    x.fillText(tx, W / 2, header ? Hh / 2 + 10 : sub ? 21 : 24);
    if (sub && !header) {
        x.font = `500 13px system-ui, sans-serif`;
        x.fillStyle = '#e0c890';
        let ts = sub;
        while (x.measureText(ts).width > W - 10 && ts.length > 3) ts = ts.slice(0, -2);
        x.fillText(ts, W / 2, 38);
    }
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new Mesh(new PlaneGeometry(W / px, Hh / px), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 5;
    void size;
    return m;
}
export let placed: Placed[] = [];
export let bounds = { x0: 0, x1: 10, z0: 0, z1: 10 };
export let currentGroup = 'nodes';
export function clearStage() {
    for (const p of placed) {
        p.live.model.dispose?.();
    }
    stage.clear();
    labels.clear();
    placed = [];
}
export function layout(g: string) {
    clearStage();
    currentGroup = g;
    let list = entriesFor(g) ?? [];
    const only = (Q.get('only') ?? '').split(',').filter(Boolean);
    if (only.length) list = list.filter((e) => only.includes(e.name) || only.includes(`${e.name}:${e.sub}`));
    const maxW = only.length ? Q.has('zoom') ? Math.max(3, Math.floor(host.clientWidth / num('zoom', 60)) - 1) : 16 : g === 'drops' ? 24 : 30;
    let x = 1, z = 1, rowH = 0, section = '';
    let x1 = 0;
    const GAP = 0.9;
    for (const e of list) {
        const cell = Math.max(e.w, 1.5) + GAP;
        if (only.length && !section) {
            section = '*';
            z += 0.6;
        }
        if (!only.length && e.section !== section) {
            section = e.section;
            if (x > 1) {
                z += rowH + 1.9;
                x = 1;
                rowH = 0;
            }
            const hd = labelMesh(section.toUpperCase(), '', 5, 0.3, true);
            hd.position.set(1 + 2.5, 0.03, z + 0.5);
            labels.add(hd);
            z += 1.6;
        } else if (x + cell > maxW) {
            z += rowH + 1.9;
            x = 1;
            rowH = 0;
        }
        const live = e.make();
        const root = new Group(), spin = new Group();
        const cx2 = x + cell / 2 - GAP / 2, cz2 = z + e.h / 2;
        root.position.set(cx2, 0, cz2);
        spin.add(live.model.obj);
        root.add(spin);
        stage.add(root);
        root.userData.entry = e;
        const lb = labelMesh(e.name, e.sub, cell - 0.1);
        lb.position.set(cx2, 0.03, z + e.h + 0.45);
        labels.add(lb);
        placed.push({ entry: e, live, root, spin, tris: countTris(live.model.obj), x: cx2, z: cz2 });
        x += cell;
        x1 = Math.max(x1, x);
        rowH = Math.max(rowH, e.h);
    }
    bounds = { x0: 0, x1: Math.max(x1 + 1, 6), z0: 0, z1: z + rowH + 2.2 };
    tabsEl.querySelectorAll<HTMLButtonElement>('button[data-group]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.group === g)));
    const cx = (bounds.x0 + bounds.x1) / 2, cz = (bounds.z0 + bounds.z1) / 2;
    const R = Math.hypot(bounds.x1 - bounds.x0, bounds.z1 - bounds.z0) / 2 + 4;
    sun.target.position.set(cx, 0, cz);
    sun.position.copy(SUN_DIR).multiplyScalar(R * 2.2).add(sun.target.position);
    Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: R * 5 });
    sun.shadow.camera.updateProjectionMatrix();
    fit();
}
export const view = { cx: 8, cz: 6, ppt: 48 };
export function applyCamera() {
    const w = host.clientWidth, h = host.clientHeight;
    camera.left = -w / 2 / view.ppt;
    camera.right = w / 2 / view.ppt;
    camera.top = h / 2 / view.ppt;
    camera.bottom = -h / 2 / view.ppt;
    camera.updateProjectionMatrix();
    camera.position.set(view.cx, Math.sin(ELEV) * 120, view.cz + Math.cos(ELEV) * 120);
    camera.lookAt(view.cx, 0, view.cz);
    camera.updateMatrixWorld();
}
export function fit() {
    const w = host.clientWidth, h = host.clientHeight;
    const bw = bounds.x1 - bounds.x0, bh = (bounds.z1 - bounds.z0) * Math.sin(ELEV) + 2;
    view.ppt = Math.min(110, Math.max(Math.min(w / bw, (h - 90) / bh), 34));
    view.cx = (bounds.x0 + bounds.x1) / 2;
    const half = (h / 2 - 30) / (view.ppt * Math.sin(ELEV));
    view.cz = bounds.z1 - bounds.z0 < 2 * half ? (bounds.z0 + bounds.z1) / 2 + 0.6 : bounds.z0 + half - 1.6;
    if (Q.has('only') && placed.length) {
        let x0 = 1000000000, x1 = -1000000000, z0 = 1000000000, z1 = -1000000000;
        for (const p of placed) {
            x0 = Math.min(x0, p.x - p.entry.w / 2);
            x1 = Math.max(x1, p.x + p.entry.w / 2);
            z0 = Math.min(z0, p.z - p.entry.h / 2);
            z1 = Math.max(z1, p.z + p.entry.h / 2 + 0.8);
        }
        view.cx = (x0 + x1) / 2;
        view.cz = (z0 + z1) / 2 - 0.7;
        if (!Q.has('zoom')) view.ppt = Math.min(160, Math.max(34, Math.min(w / (x1 - x0 + 2), (h - 90) / ((z1 - z0 + 2) * Math.sin(ELEV) + 2))));
    }
    if (Q.has('zoom')) view.ppt = num('zoom', view.ppt);
    if (Q.has('cx')) view.cx = num('cx', view.cx);
    if (Q.has('cz')) view.cz = num('cz', view.cz);
    applyCamera();
}
export function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
    applyCamera();
}
export const ray = new Raycaster();
export const ndc = new Vector2();
export let pinned: Placed | null = null;
export let hover: Placed | null = null;
export function describe(p: Placed) {
    const e = p.entry;
    return `${e.name}${e.sub ? ' · ' + e.sub : ''}   ${e.w}×${e.h} tiles   ${Math.round(p.tris)} tris`;
}
export function pick3(cx: number, cy: number): Placed | null {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(stage.children, true);
    for (const h of hits) {
        let o: Object3D | null = h.object;
        while (o) {
            if (o.userData.entry) return placed.find((p) => p.root === o) ?? null;
            o = o.parent;
        }
    }
    const pt = new Vector3();
    ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), pt);
    let best: Placed | null = null, bd = 1000000000;
    for (const p of placed) {
        const d = Math.hypot(p.x - pt.x, p.z - pt.z);
        if (d < bd && d < Math.max(p.entry.w, p.entry.h) / 2 + 0.4) {
            bd = d;
            best = p;
        }
    }
    return best;
}
export const cv = renderer.domElement;
export let drag: { x: number; y: number; moved: boolean } | null = null;
cv.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: false };
    cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
    if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
        view.cx -= dx / view.ppt;
        view.cz -= dy / (view.ppt * Math.sin(ELEV));
        drag.x = e.clientX;
        drag.y = e.clientY;
        applyCamera();
    } else {
        hover = pick3(e.clientX, e.clientY);
        if (!pinned) info.textContent = hover ? describe(hover) : '';
    }
});
cv.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved) {
        const p = pick3(e.clientX, e.clientY);
        pinned = p === pinned ? null : p;
        info.textContent = pinned ? describe(pinned) : '';
        if (pinned) console.log('model', pinned.entry.name, pinned.entry.sub, pinned.live.model);
    }
    drag = null;
});
cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const before = new Vector3();
    ray.setFromCamera(ndc, camera);
    ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), before);
    view.ppt = Math.min(400, Math.max(10, view.ppt * Math.exp(-e.deltaY * 0.0012)));
    applyCamera();
    const after = new Vector3();
    ray.setFromCamera(ndc, camera);
    ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), after);
    view.cx += before.x - after.x;
    view.cz += before.z - after.z;
    applyCamera();
}, { passive: false });
window.addEventListener('resize', resize);
export function button(label: string, onClick: (b: HTMLButtonElement) => void, group?: string, pressed?: boolean) {
    const b = document.createElement('button');
    b.textContent = label;
    if (group) b.dataset.group = group;
    if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', () => onClick(b));
    tabsEl.appendChild(b);
    return b;
}
for (const g of GROUPS) button(TITLES[g], () => layout(g), g);
export const sep = document.createElement('span');
sep.style.cssText = 'width:14px';
tabsEl.appendChild(sep);
export const toggle = (label: string, key: string, after?: () => void) => button(label, (b) => {
    flags[key] = !flags[key];
    b.setAttribute('aria-pressed', String(flags[key]));
    after?.();
}, undefined, flags[key]);
toggle('Turntable', 'turn');
toggle('Night', 'night', applyNight);
toggle('Bloom', 'bloom', applyNight);
toggle('Walk', 'walk');
toggle('Hurt flash', 'hurt');
button('Hit nodes', () => {
    for (const p of placed) {
        if (currentGroup !== 'nodes') break;
        const max = (NODES[p.entry.name as NodeKind] as { hp: number } | undefined)?.hp ?? 1;
        const hp = (p.hp ?? max) - 1;
        p.hp = hp <= 0 ? max : hp;
        p.live.model.apply?.(fakeNode(p.entry.name, hp <= 0 ? max : hp));
    }
});
button('Fit', () => fit());
export function applyNight() {
    const n = flags.night;
    fill.intensity = n ? 0.35 : 0.9;
    sun.intensity = n ? 1 : 3;
    sun.color.set(n ? 0x8fa8ff : 0xfff0d6);
    hemi.intensity = n ? 0.9 : 0.85;
    hemi.color.set(n ? 0x5a70c0 : 0xcfe6ff);
    hemi.groundColor.set(n ? 0x3a3470 : 0x7a6a50);
    renderer.toneMappingExposure = n ? 1.25 : 0.95;
    scene.background = new Color(n ? 0x0a0f2e : 0x1b2552);
    bloom.strength = flags.bloom ? n ? 0.7 : 0.5 : 0;
    env.night = n ? 1 : 0;
    env.sun = n ? 0 : 1;
}
export let clock = 0;
export function stepAll(dt: number) {
    clock += dt;
    for (const p of placed) {
        p.live.step?.(dt, clock);
        if (flags.turn) p.spin.rotation.y += dt * 0.7;
        else if (p.spin.rotation.y !== 0 && !flags.turn) p.spin.rotation.y *= 0.9;
    }
}
export const DIRECT = Q.has('direct');
export function render() {
    if (DIRECT) renderer.render(scene, camera);
    else composer.render();
}
applyNight();
resize();
export const startGroup = GROUPS.includes(Q.get('group') ?? '') ? Q.get('group')! : 'nodes';
layout(startGroup);
// the debugging handle for tests and the console
(window as unknown as { __gal: unknown }).__gal = {
    layout,
    fit,
    view,
    get placed() {
        return placed;
    },
    flags,
    step: stepAll,
    render,
    THREE,
    scene,
    camera,
    renderer,
    stats: () => ({ models: placed.length, tris: placed.reduce((a, p) => a + p.tris, 0), max: placed.reduce((m, p) => Math.max(m, p.tris), 0), calls: renderer.info.render.calls }),
    over: () => placed.filter((p) => p.tris > ((MOBS as Record<string, { ai: string } | undefined>)[p.entry.name]?.ai === 'boss' ? 800 : 300)).map((p) => `${p.entry.name} ${p.entry.sub} ${Math.round(p.tris)}`)
};
if (SHOT) {
    const T = num('t', 1), n = Math.max(1, Math.round(T * 30));
    for (let i = 0; i < n; i++) stepAll(1 / 30);
    resize();
    render();
    let k = 0;
    const settle = () => {
        render();
        if (++k < 4) requestAnimationFrame(settle);
        else document.title = 'ready';
    };
    requestAnimationFrame(settle);
} else {
    let last = performance.now();
    const loop = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        stepAll(dt);
        render();
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
}

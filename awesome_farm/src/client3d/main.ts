// The low-poly 3D view: renderer, post-processing, camera, input, the solo connection and the frame loop.
import { type Material, type Mesh, type MeshStandardMaterial, type Object3D, OrthographicCamera, Plane, Raycaster, Scene, Vector2, Vector3 } from 'three';
import { NET, TILE, TUNING } from '../shared/config';
import { type BuildingKind, BUILDINGS } from '../shared/data/buildings';
import { SPECIES } from '../shared/data/creatures';
import { type ItemId, ITEMS, type Res } from '../shared/data/items';
import { MOBS } from '../shared/data/mobs';
import { applyPlayerDelta, type PlayerDelta, type PlayerView, type ServerMsg, type TickMsg } from '../shared/net/protocol';
import { placeWhy } from '../shared/placement';
import { seasonDef, seasonOf } from '../shared/season';
import { hotbarOf, hotKind } from '../shared/sim/hotbar';
import { canAfford, countOf, derived, hasUnlock, scaledCost, xpToNext } from '../shared/sim/stats';
import { weatherAt } from '../shared/weather';
import type { BuildE, Cmd, Ent, PlayerS, SimEvent } from '../shared/sim/types';
import { World } from '../shared/world';
import { CloudShadows, Fireflies } from './ambient';
import { Entities } from './entities';
import { Floats, FX, Particles, Sound } from './fx';
import { type BuildCard, Hud } from './hud';
import { iconUrl } from './icons';
import { prewarm } from './models';
import { buildingModel } from './models/buildings';
import { env } from './models/kit';
import { Local } from './net';
import { type Staged, stageShowcase } from './showcase';
import { BASE_VIEW, dprCap, EL, hourOf, makePost, makeRenderer } from './render';
import { Sky } from './sky';
import { Sea, Terrain } from './terrain';
import { LightPool, type LightSpot, Rain, Telegraphs } from './weather';

/** A building being placed: what, its turn, the tile under it, whether it fits (and why not), its see-through ghost, the last tile a drag put one on. */
interface Placing { kind: BuildingKind; rot: number; tx: number; ty: number; ok: boolean; why: string | null; ghost: Object3D | null; lastPut: string }

export const q = new URLSearchParams(location.search);
export const DEBUG = q.has('debug');
export const px = (v: number) => v / TILE;
/** Start the 3D view in the page's #stage: a solo world on the real simulation, the showcase farmstead, the camera, the HUD and the loop. */
export function boot() {
    const stage = document.getElementById('stage')!;
    const renderer = makeRenderer();
    const cap = dprCap();
    let dpr = Math.min(window.devicePixelRatio || 1, cap);
    stage.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'display:block;width:100vw;height:100vh;touch-action:none';
    const scene = new Scene();
    const cam = new OrthographicCamera(-10, 10, 6, -6, 1, 400);
    const sky = new Sky(scene, 2048);
    let staged: Staged = { ax: 0, ay: 0, placed: 0, failed: [] };
    const local = new Local(q.get('seed') ?? 'low-poly-farm', 'Sprout', (sim, p) => {
        staged = stageShowcase(sim, p);
    });
    const youId = local.id;
    // set by the welcome message, before the first frame that draws
    let world!: World;
    let terrain!: Terrain;
    let ents!: Entities;
    let sea!: Sea;
    const E: Record<number, Ent> = {};
    const players: Record<string, PlayerView> = {};
    // your own record (it always comes whole)
    let me!: PlayerS;
    const clock = { time: 0, clock: 0, day: 1, night: false, nightLen: TUNING.nightLength, paused: false };
    let seed = '';
    const particles = new Particles(scene), sound = new Sound(), rain = new Rain(scene), lamps = new LightPool(scene), tele = new Telegraphs(scene), clouds = new CloudShadows(scene), flies = new Fireflies(scene);
    const L = { x: 0, y: 0, fx: 0, fy: 1, kx: 0, ky: 0, warp: -1, sendT: 0, sent: '', moving: false, swingCd: 0, swingT: 0, dust: 0 };
    const smooth = new Map<string, { x: number; y: number }>();
    const swingT = new Map<string, number>();
    const keys = new Set<string>();
    const touch = { mx: 0, my: 0, act: false, take: false };
    let hourOv: number | null = null, mouseHeld = false, mouseAim = 0, hotSel = 0, fps = 0, showFps = false, forceRain = 0, fpsN = 0, fpsT = 0, demoT = 0;
    let placing: Placing | null = null;
    const pointerTile = { tx: 0, ty: 0, x: 0, z: 0, has: false };
    let zoom = innerHeight < 520 ? 1.3 : 1, zoomGoal = zoom, intro = q.has('still') ? 1 : 0;
    const camT = new Vector3(), shake = { x: 0, z: 0, p: 0 };
    const look = { x: 0, z: 0, t: 0 };
    const hud = new Hud(document.body, {
        hot: (i: number) => hotSelect(i),
        act: (d: boolean) => {
            touch.act = d;
            sound.unlock();
        },
        use: () => interact(),
        dash: () => dash(),
        eat: () => local.send({ t: 'eat' }),
        zoom: (d: number) => {
            zoomGoal = Math.max(0.5, Math.min(2.6, zoomGoal * (d > 0 ? 1.25 : 0.8)));
        },
        build: () => {
            if (placing) cancelPlacing();
            else {
                refreshBuild();
                hud.openBuild(!hud.buildOpen);
            }
        },
        pick: (k: string) => startPlacing(k as BuildingKind),
        cancelBuild: () => cancelPlacing(),
        stick: (x: number, y: number) => {
            touch.mx = x;
            touch.my = y;
        },
        dismantle: (d: boolean) => {
            touch.take = d;
        },
        turn: () => rotatePlacing(),
        lab: (a: string) => lab(a)
    });
    const floats = new Floats(hud.floats);
    const { composer, bloom, grade, resize: sizePost } = makePost(renderer, scene, cam);
    function resize() {
        sizePost(innerWidth, innerHeight, dpr);
    }
    addEventListener('resize', resize);
    resize();
    const occupy = (e: Ent) => {
        if (e.k === 'node') world.setOcc(e.tx, e.ty, e.id);
        else if (e.k === 'bld') {
            const d = BUILDINGS[e.kind], [w, h] = d.size;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                if (d.floor) world.setFloor(e.tx + x, e.ty + y, e.id);
                else if (d.roof) world.setRoof(e.tx + x, e.ty + y, e.id);
                else if (d.walk) world.setSoft(e.tx + x, e.ty + y, e.id);
                else if (d.solid !== false) world.setOcc(e.tx + x, e.ty + y, e.id);
            }
        }
    };
    const vacate = (e: Ent) => {
        if (e.k === 'node') {
            if (world.occAt(e.tx, e.ty) === e.id) world.setOcc(e.tx, e.ty, 0);
        } else if (e.k === 'bld') {
            const d = BUILDINGS[e.kind], [w, h] = d.size;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                if (d.floor) world.setFloor(e.tx + x, e.ty + y, 0);
                else if (d.roof) {
                    if (world.roofAt(e.tx + x, e.ty + y) === e.id) world.setRoof(e.tx + x, e.ty + y, 0);
                } else if (d.walk) {
                    if (world.softAt(e.tx + x, e.ty + y) === e.id) world.setSoft(e.tx + x, e.ty + y, 0);
                } else if (world.occAt(e.tx + x, e.ty + y) === e.id) world.setOcc(e.tx + x, e.ty + y, 0);
            }
        }
    };
    const heldItem = () => me ? hotbarOf(me)[hotSel] ?? null : null;
    const dist2b = (b: BuildE, x = L.x, y = L.y - 4) => {
        const [w, h] = BUILDINGS[b.kind].size;
        return Math.hypot(Math.max(b.tx * TILE - x, 0, x - (b.tx + w) * TILE), Math.max(b.ty * TILE - y, 0, y - (b.ty + h) * TILE));
    };
    function welcome(m: Extract<ServerMsg, { t: 'welcome' }>) {
        const st = m.state;
        seed = st.seed;
        world = new World(st.plots, st.seed);
        terrain = new Terrain(world, scene);
        sea = new Sea(scene);
        ents = new Entities(scene, world);
        for (const e of Object.values(st.ents) as Ent[]) {
            E[e.id] = e;
            occupy(e);
        }
        for (const e of Object.values(E)) ents.upsert(e);
        for (const p of Object.values(st.players) as PlayerS[]) players[p.id] = { ...p, mh: derived(p).maxHearts };
        me = st.players[m.you];
        L.x = me.x;
        L.y = me.y;
        L.warp = me.warp;
        Object.assign(clock, { time: st.time, clock: st.clock, day: st.day, night: st.night, nightLen: st.nightLen ?? TUNING.nightLength, paused: false });
        camT.set(px(L.x), 0, px(L.y));
        refreshBuild();
        setTimeout(() => {
            void prewarm(undefined, 6);
        }, 400);
    }
    function tick(m: TickMsg) {
        Object.assign(clock, { time: m.time, clock: m.clock, day: m.day, night: m.night, nightLen: m.nightLen, paused: m.paused });
        if (m.plots.length) {
            const risen: typeof world.plots = [];
            for (const p of m.plots) {
                const old = world.plots[p.i];
                if (!old.owned && p.owned) risen.push(old);
                Object.assign(old, p);
            }
            world.recompute();
            for (const plot of risen) {
                const o = world.plotOrigin(plot);
                look.x = o.tx + 8;
                look.z = o.ty + 8;
                look.t = 3.2;
                let first = true;
                terrain.rise(plot, (x: number, z: number, ring: number) => {
                    if (first) {
                        first = false;
                        sound.play('land');
                    }
                    for (let i = 0; i < 8; i++) {
                        const a = Math.random() * Math.PI * 2;
                        particles.burst(x + Math.cos(a) * ring, 0.1, z + Math.sin(a) * ring, [0xcdf4ee, 0x4ab2cf, 0xfff6e0], 2, 1.6, 2.6, 0.7);
                    }
                    shake.p = Math.max(shake.p, 0.05);
                });
            }
        }
        for (const d of m.players) updatePlayer(d);
        for (const e of m.ev) event(e);
        for (const e of m.ents) {
            const isNew = !E[e.id];
            E[e.id] = e;
            if (isNew) occupy(e);
            ents.upsert(e);
        }
        for (const id of m.gone) {
            const e = E[id];
            if (!e) continue;
            vacate(e);
            delete E[id];
            ents.remove(id);
        }
    }
    function updatePlayer(d: PlayerDelta) {
        const p = applyPlayerDelta(players[d.id], d);
        players[p.id] = p;
        if (p.id === youId) {
            me = p as PlayerS;
            if (p.warp !== L.warp) {
                L.warp = p.warp;
                L.x = p.x;
                L.y = p.y;
                L.kx = L.ky = 0;
                camT.set(px(L.x), 0, px(L.y));
            }
        }
    }
    function event(e: SimEvent) {
        switch (e.e) {
            case 'fx': {
                const spec = FX[e.fx];
                if (!spec) return;
                const x = px(e.x), z = px(e.y) + 0.3, mine = e.by === youId, on = Math.abs(x - camT.x) < 26 && Math.abs(z - camT.z) < 20;
                if (!on) return;
                particles.burst(x, spec.y ?? 0.7, z, spec.colors, spec.n, spec.speed, spec.up, spec.size);
                if (spec.sfx && (mine || on)) sound.play(spec.sfx);
                if (mine && spec.shake) shake.p = Math.max(shake.p, spec.shake);
                return;
            }
            case 'float':
                if ((!e.to || e.to === youId) && performance.now() - t0 > 3000) floats.add(px(e.x), 1.2, px(e.y) + 0.3, e.text, e.color ?? 0xfff6e0);
                return;
            case 'banner':
                if ((!e.to || e.to === youId) && performance.now() - t0 > 3000) hud.banner(e.text, e.sub ?? '', e.color !== undefined ? '#' + e.color.toString(16).padStart(6, '0') : '');
                return;
            case 'toast':
                if (e.to === youId && performance.now() - t0 > 3000) hud.toast(e.text, e.icon ? iconUrl(e.icon.replace(/^i_/, ''), 2) || iconUrl(e.icon, 2) : '', e.color !== undefined ? '#' + e.color.toString(16).padStart(6, '0') : undefined);
                return;
            case 'swing':
                if (e.by !== youId) swingT.set(e.by, 0.28);
                return;
            case 'knock':
                if (e.to === youId) {
                    L.kx = e.vx;
                    L.ky = e.vy;
                    shake.p = Math.max(shake.p, 0.2);
                }
                return;
            case 'tele':
                tele.add(px(e.x), px(e.y), Math.max(0.5, px(e.r)), e.t, e.shape === 'ring');
                return;
            case 'pickup':
                if (e.by === youId) sound.play('pick');
                return;
            default:
                return;
        }
    }
    function updateLocal(dt: number) {
        if (!me) return;
        const downed = me.downed > 0, blocked = hud.buildOpen && false;
        let mx = 0, my = 0;
        if (!downed && !blocked) {
            mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + touch.mx;
            my = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + touch.my;
        }
        const len = Math.hypot(mx, my);
        if (len > 1) {
            mx /= len;
            my /= len;
        }
        const moving = len > 0.15;
        if (moving) {
            L.fx = mx / Math.max(len, 0.000001);
            L.fy = my / Math.max(len, 0.000001);
        }
        const speed = derived(me).speed;
        const dx = (mx * speed + L.kx) * dt, dy = (my * speed + L.ky) * dt;
        L.kx *= Math.pow(0.001, dt);
        L.ky *= Math.pow(0.001, dt);
        if (!world.boxBlocked(L.x + dx, L.y, 4, 3)) L.x += dx;
        if (!world.boxBlocked(L.x, L.y + dy, 4, 3)) L.y += dy;
        L.moving = moving;
        L.dust -= dt;
        if (moving && L.dust <= 0) {
            L.dust = 0.16;
            particles.burst(px(L.x) - L.fx * 0.2, 0.05, px(L.y) - L.fy * 0.2, [0xf4deaa, 0xd49a62], 1, 0.5, 0.9, 0.55);
        }
        L.sendT -= dt;
        const state = `${Math.round(L.x)},${Math.round(L.y)},${moving}`;
        if (L.sendT <= 0 && state !== L.sent && !downed) {
            L.sendT = NET.moveEvery;
            L.sent = state;
            local.send({ t: 'move', x: L.x, y: L.y, fx: L.fx, fy: L.fy, moving });
        }
        L.swingCd -= dt;
        L.swingT = Math.max(0, L.swingT - dt);
        const held = keys.has('Space') || mouseHeld || touch.act;
        if (held && !placing && !downed) {
            const t2 = findTarget();
            if (t2 && L.swingCd <= 0) {
                const d = derived(me);
                L.swingCd = d.swingCd * (t2.k === 'mob' ? d.weapon.cd : 1);
                L.swingT = 0.28;
                local.send({ t: 'swing', id: t2.id });
            }
        }
    }
    const entCenter = (e: Ent) => {
        if (e.k === 'node') return { x: (e.tx + 0.5) * TILE, y: (e.ty + 1) * TILE - 7 };
        if (e.k === 'bld') {
            const [w, h] = BUILDINGS[e.kind].size;
            return { x: (e.tx + w / 2) * TILE, y: (e.ty + h) * TILE - 7 };
        }
        if (e.k === 'mob') return { x: e.x, y: e.y - 4 - Math.min(14, MOBS[e.kind].r * 0.8) };
        return { x: e.x, y: e.y };
    };
    let target: Ent | null = null;
    function findTarget(): Ent | null {
        const dd = derived(me), hx = L.x + L.fx * 4, hy = L.y - 5 + L.fy * 4;
        const aim = mouseAim > 0 && mouseHeld && pointerTile.has ? { x: pointerTile.x * TILE, y: pointerTile.z * TILE } : null;
        let best: Ent | null = null, bs = Infinity;
        for (const e of Object.values(E)) {
            if (!(e.k === 'node' || e.k === 'mob' || e.k === 'bld' && e.kind === 'bed' && e.crop === 2)) continue;
            const c = entCenter(e), d = Math.hypot(c.x - hx, c.y - hy), reach = e.k === 'mob' ? Math.max(dd.reach, dd.weapon.reach) : dd.reach;
            if (d > reach) continue;
            const dot = ((c.x - L.x) * L.fx + (c.y - L.y) * L.fy) / Math.max(d, 1);
            const score = aim ? Math.hypot(c.x - aim.x, c.y - aim.y) : d - dot * 4 + (e.k === 'mob' ? -8 : 0);
            if (score < bs) {
                bs = score;
                best = e;
            }
        }
        return best;
    }
    function nearestBuilding(any = false): BuildE | null {
        const reach = derived(me).reach;
        let best: BuildE | null = null, bd = Infinity;
        for (const e of Object.values(E)) {
            if (e.k !== 'bld') continue;
            const d = BUILDINGS[e.kind];
            if (d.floor || d.roof || !any && (d.wall || d.gate)) continue;
            const dist = dist2b(e), rank = d.grave ? dist - 24 : dist;
            if (dist < reach + 6 && rank < bd) {
                bd = rank;
                best = e;
            }
        }
        return best;
    }
    function plotInFront() {
        const ptx = Math.floor(L.x / TILE), pty = Math.floor((L.y - 2) / TILE);
        const dirs = [[Math.sign(Math.round(L.fx)), Math.sign(Math.round(L.fy))], [1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of dirs) {
            if (!dx && !dy) continue;
            for (const step of [1, 2]) {
                const plot = world.plotAt(ptx + dx * step, pty + dy * step);
                if (plot && world.isPurchasable(plot)) return plot;
            }
        }
        return null;
    }
    function interact() {
        sound.unlock();
        if (!me || me.downed > 0) return;
        if (placing) {
            place();
            return;
        }
        const b = nearestBuilding();
        if (b) {
            const held = heldItem();
            const seedId = b.kind === 'bed' && held && hotKind(held) === 'seed' && countOf(me, held) > 0 ? held : undefined;
            local.send({ t: 'use', id: b.id, ...seedId ? { seed: seedId } : {} });
            return;
        }
        const plot = plotInFront();
        if (plot) local.send({ t: 'buy', plot: plot.i });
    }
    function dash() {
        if (me) local.send({ t: 'dash', fx: L.fx, fy: L.fy });
    }
    function hotSelect(i: number, use = true) {
        if (!me) return;
        hotSel = i;
        sound.unlock();
        const id = hotbarOf(me)[i];
        if (!id) return;
        const k = hotKind(id);
        if (k === 'gear') {
            if (countOf(me, id) > 0) local.send({ t: 'equip', item: id });
        } else if (k === 'use' && use) local.send({ t: 'eat', item: id });
    }
    const LINE = new Set(['fence', 'hedge', 'stonewall', 'path', 'planks', 'brickfloor', 'slatefloor', 'carpet', 'belt', 'wall_wood', 'wall_stone', 'wall_brick', 'wall_window', 'roof_thatch', 'roof_tile', 'roof_slate']);
    function refreshBuild() {
        if (!me) return;
        const cards: BuildCard[] = [];
        for (const [kind, d] of Object.entries(BUILDINGS)) {
            if (d.hidden) continue;
            const cost = scaledCost(me, d.cost), locked = !hasUnlock(me, d.req);
            cards.push({ kind, name: d.name, cat: d.cat, cost: Object.entries(cost) as [string, number][], ok: !locked && canAfford(me, cost), locked, desc: d.desc });
        }
        hud.setBuildList(cards);
    }
    function startPlacing(kind: BuildingKind) {
        cancelPlacing();
        placing = { kind, rot: 0, tx: 0, ty: 0, ok: false, why: null, ghost: null, lastPut: '' };
        rebuildGhost();
        sound.unlock();
    }
    function cancelPlacing() {
        if (placing?.ghost) {
            scene.remove(placing.ghost);
        }
        placing = null;
    }
    function rebuildGhost() {
        if (!placing) return;
        if (placing.ghost) scene.remove(placing.ghost);
        const m = buildingModel(placing.kind, { rot: placing.rot, seed: 7, mask: 0 }), g = m.obj;
        g.traverse((o) => {
            const mesh = o as Mesh;
            if (!mesh.isMesh) return;
            const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const own = list.map((mt: Material) => {
                const c = mt.clone();
                c.transparent = true;
                c.opacity = 0.62;
                c.depthWrite = false;
                return c;
            });
            mesh.material = Array.isArray(mesh.material) ? own : own[0];
            mesh.castShadow = false;
        });
        placing.ghost = g;
        scene.add(g);
    }
    function rotatePlacing() {
        if (placing && BUILDINGS[placing.kind].dir) {
            placing.rot = placing.rot + 1 & 3;
            rebuildGhost();
        }
    }
    const placeEnv = () => ({ world, ent: (id: number) => E[id], x: L.x, y: L.y });
    function updatePlacing() {
        if (!placing) return;
        const d = BUILDINGS[placing.kind], [w, h] = d.size;
        let tx: number, ty: number;
        if (pointerTile.has && mouseAim > 0) {
            tx = pointerTile.tx - (w > 1 ? Math.floor(w / 2) : 0);
            ty = pointerTile.ty - (h > 1 ? Math.floor(h / 2) : 0);
        } else {
            tx = Math.floor(L.x / TILE) + Math.round(L.fx * 2) - (w > 1 ? Math.floor(w / 2) : 0);
            ty = Math.floor((L.y - 2) / TILE) + Math.round(L.fy * 2) - (h > 1 ? Math.floor(h / 2) : 0);
        }
        placing.tx = tx;
        placing.ty = ty;
        placing.why = placeWhy(placeEnv(), placing.kind, tx, ty);
        const ok = placing.why === null && canAfford(me, scaledCost(me, d.cost));
        if (placing.why === null && !ok) placing.why = 'Not enough materials';
        placing.ok = ok;
        const g = placing.ghost!;
        g.position.set(tx + w / 2, 0.02 + Math.sin(performance.now() / 260) * 0.03, ty + h / 2);
        g.traverse((o) => {
            const m = (o as Mesh).material as MeshStandardMaterial | undefined;
            if (m && 'emissive' in m) {
                m.emissive.setHex(ok ? 0x2a8a3a : 0xc03040);
                m.emissiveIntensity = 0.55;
            }
        });
    }
    function place() {
        if (!placing || !placing.ok) {
            if (placing?.why) {
                hud.toast(placing.why, '', '#e85d62');
                sound.play('deny');
            }
            return;
        }
        local.send({ t: 'build', kind: placing.kind, tx: placing.tx, ty: placing.ty, rot: placing.rot });
        placing.lastPut = `${placing.tx},${placing.ty}`;
    }
    function lab(a: string) {
        sound.unlock();
        if (a.startsWith('time:')) {
            local.send({ t: 'devdo', op: 'time', id: a.slice(5) });
            return;
        }
        switch (a) {
            case 'land':
                local.send({ t: 'devdo', op: 'land', n: 1 });
                break;
            case 'mobs':
                local.send({ t: 'devdo', op: 'mob', id: ['slime', 'skeleton', 'bat'].find((k) => k in MOBS) ?? 'slime', n: 3, at: 'front' });
                break;
            case 'killall':
                local.send({ t: 'devdo', op: 'killAll' });
                break;
            case 'critters': {
                const list = Object.keys(SPECIES);
                for (let i = 0; i < 4; i++) local.send({ t: 'devdo', op: 'creature', id: list[Math.random() * list.length | 0], n: 1, lv: 5, at: 'front' });
                break;
            }
            case 'drops':
                for (const r of ['wood', 'stone', 'coal', 'ironbar', 'seed_wheat', 'bread', 'coin'] as Res[]) local.sim.spawnDrop(r, L.x + (Math.random() - 0.5) * 70, L.y + 10 + Math.random() * 40);
                break;
            case 'shadows': {
                const on = !renderer.shadowMap.enabled;
                renderer.shadowMap.enabled = on;
                sky.sun.castShadow = on;
                scene.traverse((o) => {
                    const m = o as Mesh;
                    if (m.material) {
                        const l = Array.isArray(m.material) ? m.material : [m.material];
                        l.forEach((x: Material) => {
                            x.needsUpdate = true;
                        });
                    }
                });
                break;
            }
            case 'bloom':
                bloom.enabled = !bloom.enabled;
                break;
            case 'res':
                dpr = dpr > 1 ? 1 : Math.min(window.devicePixelRatio || 1, cap);
                renderer.setPixelRatio(dpr);
                resize();
                hud.toast(`Render scale ${dpr.toFixed(1)}x`);
                break;
            case 'rain':
                forceRain = forceRain > 0 ? 0 : 0.9;
                break;
            case 'fps':
                showFps = !showFps;
                break;
        }
    }
    const dom = renderer.domElement;
    addEventListener('keydown', (e) => {
        if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
        sound.unlock();
        if (!e.repeat) {
            if (/^Digit[1-8]$/.test(e.code)) hotSelect(Number(e.code.slice(5)) - 1);
            else if (e.code === 'KeyE') interact();
            else if (e.code === 'KeyF') local.send({ t: 'eat' });
            else if (e.code === 'KeyB') {
                if (placing) cancelPlacing();
                else {
                    refreshBuild();
                    hud.openBuild(!hud.buildOpen);
                }
            } else if (e.code === 'KeyR') rotatePlacing();
            else if (e.code === 'Escape') {
                cancelPlacing();
                hud.openBuild(false);
            } else if (e.code === 'KeyH') hud.photo();
            else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') dash();
            else if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomGoal = Math.min(2.6, zoomGoal * 1.2);
            else if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoomGoal = Math.max(0.5, zoomGoal / 1.2);
            else if (e.code === 'Space' && placing) place();
        }
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
        keys.add(e.code);
    });
    addEventListener('keyup', (e) => keys.delete(e.code));
    addEventListener('blur', () => keys.clear());
    dom.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoomGoal = Math.max(0.5, Math.min(2.6, zoomGoal * (e.deltaY < 0 ? 1.12 : 0.89)));
    }, { passive: false });
    dom.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        cancelPlacing();
    });
    const ray = new Raycaster(), plane = new Plane(new Vector3(0, 1, 0), 0), hit = new Vector3(), ndc = new Vector2();
    function aimAt(e: PointerEvent) {
        ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
        ray.setFromCamera(ndc, cam);
        if (ray.ray.intersectPlane(plane, hit)) {
            pointerTile.x = hit.x;
            pointerTile.z = hit.z;
            pointerTile.tx = Math.floor(hit.x);
            pointerTile.ty = Math.floor(hit.z);
            pointerTile.has = true;
            mouseAim = 3;
        }
    }
    dom.addEventListener('pointermove', (e) => {
        aimAt(e);
        if (placing && mouseHeld && LINE.has(placing.kind)) {
            const k = `${pointerTile.tx},${pointerTile.ty}`;
            updatePlacing();
            if (k !== placing.lastPut) place();
        }
    });
    dom.addEventListener('pointerdown', (e) => {
        sound.unlock();
        aimAt(e);
        if (e.button === 2) return;
        if (placing) {
            updatePlacing();
            place();
            mouseHeld = true;
            return;
        }
        mouseHeld = true;
    });
    addEventListener('pointerup', () => {
        mouseHeld = false;
    });
    let last = performance.now(), t0 = last, mapT = 0, hudT = 0, lightsT = 0, roofUnder = false;
    const spots: LightSpot[] = [];
    const proj = new Vector3();
    const project = (x: number, y: number, z: number) => {
        proj.set(x, y, z).project(cam);
        return { x: (proj.x * 0.5 + 0.5) * innerWidth, y: (-proj.y * 0.5 + 0.5) * innerHeight };
    };
    const mapCtx = hud.map.getContext('2d')!;
    const BIOME: Record<string, string | undefined> = { meadow: '#92d364', quarry: '#6c9a49', bog: '#5d4a7c', sand: '#f4deaa', desert: '#f4deaa', snowcap: '#fffbf4', tundra: '#fffbf4', forest: '#5cb04f', rift: '#9d6fdb' };
    function drawMap() {
        const W = hud.map.width, tx0 = Math.floor(px(L.x)) - W / 2, ty0 = Math.floor(px(L.y)) - W / 2;
        const img = mapCtx.createImageData(W, W), d = img.data;
        for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
            const tx = tx0 + x, ty = ty0 + y, i = (y * W + x) * 4;
            let c = '#26588a';
            if (world.isLand(tx, ty)) {
                const p = world.plotAt(tx, ty);
                c = BIOME[p?.biome ?? 'meadow'] ?? '#92d364';
                if (p && !p.owned) c = '#6f8f5a';
            }
            const id = world.occAt(tx, ty) || world.softAt(tx, ty), e = id ? E[id] : undefined;
            if (e?.k === 'bld') c = '#6a402f';
            else if (e?.k === 'node') c = e.kind === 'tree' ? '#2d6a50' : '#9ea4b9';
            const n = parseInt(c.slice(1), 16);
            d[i] = n >> 16;
            d[i + 1] = n >> 8 & 255;
            d[i + 2] = n & 255;
            d[i + 3] = 255;
        }
        mapCtx.putImageData(img, 0, 0);
        for (const e of Object.values(E)) if (e.k === 'mob') {
            const x = px(e.x) - tx0, y = px(e.y) - ty0;
            if (x > 0 && y > 0 && x < W && y < W) {
                mapCtx.fillStyle = '#e85d62';
                mapCtx.fillRect(x - 1, y - 1, 3, 3);
            }
        }
        mapCtx.fillStyle = '#fff';
        mapCtx.fillRect(W / 2 - 2, W / 2 - 2, 4, 4);
        mapCtx.fillStyle = '#2a1d2c';
        mapCtx.fillRect(W / 2 - 1, W / 2 - 1, 2, 2);
    }
    let landT = 1.8, landN = 0;
    function frame(now: number) {
        requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const t2 = (now - t0) / 1000;
        if (!world) {
            for (const m of local.poll(0)) if (m.t === 'welcome') welcome(m);
            if (!world) return;
            document.getElementById('boot')?.remove();
        }
        fpsN++;
        fpsT += dt;
        if (fpsT >= 0.5) {
            fps = Math.round(fpsN / fpsT);
            fpsN = 0;
            fpsT = 0;
        }
        mouseAim = Math.max(0, mouseAim - dt);
        landT -= dt;
        if (landT <= 0 && landN < 2 && !q.has('still')) {
            landT = 1.6;
            landN++;
            lab('land');
        }
        updateLocal(dt);
        for (const m of local.poll(dt)) {
            if (m.t === 'tick') tick(m);
            else if (m.t === 'welcome') welcome(m);
        }
        if (!me) return;
        const inHand = heldItem();
        ents.setFarmer(youId, players[youId] ?? me, px(L.x), px(L.y), L.fx, L.fy, L.moving, L.swingT > 0 ? 1 - L.swingT / 0.28 : 0, inHand && hotKind(inHand) === 'gear' ? inHand : undefined);
        for (const p of Object.values(players)) {
            if (p.id === youId || !p.online) continue;
            const s = smooth.get(p.id) ?? { x: p.x, y: p.y };
            smooth.set(p.id, s);
            s.x += (p.x - s.x) * Math.min(1, dt * 12);
            s.y += (p.y - s.y) * Math.min(1, dt * 12);
            const sw = Math.max(0, (swingT.get(p.id) ?? 0) - dt);
            swingT.set(p.id, sw);
            ents.setFarmer(p.id, p, px(s.x), px(s.y), p.fx, p.fy, p.moving, sw > 0 ? 1 - sw / 0.28 : 0);
        }
        intro = Math.min(1, intro + dt / 3.2);
        zoom += (zoomGoal - zoom) * Math.min(1, dt * 8);
        const ie = 1 - Math.pow(1 - intro, 3), z = zoom * (0.55 + 0.45 * ie);
        look.t = Math.max(0, look.t - dt);
        const lk = look.t > 0 ? Math.min(1, look.t / 0.7, (3.2 - look.t) / 0.7) : 0, lke = lk * lk * (3 - 2 * lk);
        const tx = px(L.x) + (look.x - px(L.x)) * lke * 0.75, tz = px(L.y) - 0.2 + (look.z - px(L.y)) * lke * 0.75;
        camT.x += (tx - camT.x) * Math.min(1, dt * 7);
        camT.z += (tz - camT.z) * Math.min(1, dt * 7);
        shake.p *= Math.pow(0.0004, dt);
        shake.x = (Math.random() - 0.5) * shake.p * 2;
        shake.z = (Math.random() - 0.5) * shake.p * 2;
        const H = BASE_VIEW / (z * (1 - 0.22 * lke)), A = innerWidth / innerHeight;
        cam.left = -H * A / 2;
        cam.right = H * A / 2;
        cam.top = H / 2;
        cam.bottom = -H / 2;
        cam.updateProjectionMatrix();
        cam.position.set(camT.x + shake.x, Math.sin(EL) * 120, camT.z + Math.cos(EL) * 120 + shake.z);
        cam.lookAt(camT.x + shake.x, 0, camT.z + shake.z);
        const hour = hourOv ?? hourOf(clock.clock, clock.nightLen);
        const w = weatherAt(seed, clock.day, clock.clock), rainAmt = Math.max(w.rain, forceRain);
        sky.apply(hour, rainAmt, camT);
        env.night = sky.night;
        env.sun = 1 - sky.night;
        env.wind = Math.min(1, 0.25 + rainAmt * 0.6 + (w.storm ? 0.3 : 0));
        grade.uniforms.uTint.value.copy(sky.tint);
        grade.uniforms.uSat.value = sky.saturation;
        grade.uniforms.uExp.value = sky.exposure;
        rain.update(dt, camT.x, camT.z, rainAmt);
        clouds.update(t2, camT.x, camT.z, 1 - sky.night, rainAmt);
        flies.update(t2, camT.x, camT.z, Math.max(0, sky.night - 0.25) * (1 - rainAmt));
        sea.u.uSun.value = (1 - sky.night) * (1 - rainAmt * 0.7);
        terrain.update(camT.x, camT.z);
        terrain.animate(dt);
        sea.follow(camT.x, camT.z, t2);
        ents.update(dt, t2, camT.x, camT.z);
        const under = world.roofAt(Math.floor(px(L.x)), Math.floor((L.y - 2) / TILE)) !== 0;
        ents.fadeRoofs(under, dt, px(L.x), px(L.y));
        roofUnder = under;
        particles.update(dt);
        tele.update(dt);
        lightsT -= dt;
        if (lightsT <= 0) {
            lightsT = 0.25;
            spots.length = 0;
            for (const e of Object.values(E)) {
                if (e.k !== 'bld') continue;
                const d = BUILDINGS[e.kind];
                if (!d.light) continue;
                const [bw, bh] = d.size, fire = e.kind === 'campfire' || e.kind === 'furnace';
                spots.push({ x: e.tx + bw / 2, y: e.kind === 'lamppost' ? 2.3 : 1.1, z: e.ty + bh / 2, color: fire ? 0xff9a40 : e.kind === 'lamppost' || e.kind === 'lantern' ? 0xffd890 : 0x9fe0ff, power: Math.min(1.4, d.light / 60), range: Math.min(12, 3 + d.light / 12) });
            }
        }
        lamps.update(spots, camT.x, camT.z, Math.max(sky.night, rainAmt * 0.3), t2);
        floats.update(dt, project);
        target = placing || me.downed > 0 ? null : findTarget();
        if (placing) updatePlacing();
        if (keys.has('KeyX') || touch.take) {
            demoT += dt;
            const b = nearestBuilding(true);
            if (b && demoT >= 0.8) {
                demoT = 0;
                local.send({ t: 'demolish', id: b.id });
            }
        } else demoT = 0;
        hudT -= dt;
        if (hudT <= 0) {
            hudT = 0.1;
            const d = derived(me), hb = hotbarOf(me);
            let prompt = '';
            if (placing) prompt = placing.why ? `⚠ ${placing.why}` : `Space Place ${BUILDINGS[placing.kind].name}${BUILDINGS[placing.kind].dir ? '  ·  R Turn' : ''}`;
            else if (demoT > 0) prompt = `X Taking down… ${Math.round(demoT / 0.8 * 100)}%`;
            else if (target) prompt = target.k === 'mob' ? `Space Hit ${MOBS[target.kind].name}` : target.k === 'node' ? `Space Gather` : 'Space Harvest';
            else {
                const b = nearestBuilding();
                if (b) prompt = `E Use ${BUILDINGS[b.kind].name}`;
                else {
                    const pl = plotInFront();
                    if (pl) prompt = `E Raise land · ${Math.round(world.price(pl, me.plotsBought) * d.landMul)} coins`;
                }
            }
            const hour24 = Math.floor(hour), mins = Math.floor((hour - hour24) * 60);
            hud.set({
                name: me.name,
                level: me.level,
                xp: me.xp,
                xpNext: xpToNext(me.level),
                hearts: me.hearts,
                maxHearts: d.maxHearts,
                energy: me.energy,
                maxEnergy: d.maxEnergy,
                coins: me.coins,
                day: clock.day,
                season: seasonDef(clock.day).name,
                clock: `${String(hour24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
                night: sky.night > 0.5,
                rain: rainAmt,
                hot: hb.map((id: ItemId | null) => ({ id, n: id ? countOf(me, id) : 0, name: id ? ITEMS[id].name : '' })),
                sel: hotSel,
                prompt,
                zoom: zoomGoal,
                fps: showFps ? fps : 0,
                downed: me.downed > 0
            });
        }
        mapT -= dt;
        if (mapT <= 0 && !hud.photoMode) {
            mapT = 0.4;
            drawMap();
        }
        composer.render();
    }
    requestAnimationFrame(frame);
    const api = { local, scene, cam, renderer, sky, hud, composer, bloom, staged: () => staged, seasonOf, roofUnder: () => roofUnder, state: () => ({ me, world, E, L, clock, zoom, hotSel, placing: !!placing }), send: (c: Cmd) => local.send(c), lab, startPlacing, project, hour: (h: number) => {
        hourOv = h;
    } };
    // the debugging handle (tests and the console reach the running view through it)
    (window as unknown as { __lp: typeof api }).__lp = api;
    if (DEBUG) console.log('staged', staged.placed, staged.failed);
}
/** Show why the view could not start, over the page. */
export function fail(err: unknown) {
    const d = document.createElement('pre');
    d.style.cssText = 'position:fixed;inset:0;margin:0;padding:20px;background:#2a1d2c;color:#ffd966;font:14px monospace;white-space:pre-wrap;z-index:99';
    d.textContent = 'Low Poly Tiles failed to start\n\n' + (err instanceof Error ? err.stack ?? err.message : String(err));
    document.body.appendChild(d);
    console.error(err);
}

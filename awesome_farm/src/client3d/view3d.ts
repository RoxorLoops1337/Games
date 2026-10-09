// The 3D world view inside the game: the "3D (beta)" view setting. Loaded on demand (its own chunk, with three.js) by
// `loadView3D` in src/client/world/view3d-bridge.ts, which also holds the interface this implements and explains the split:
// the Game scene keeps running (connection, mirror, input, targeting, placing) and feeds this view; the Phaser HUD draws on top.
//
// What it reuses from the prototype (src/client3d): the terrain and sea, the entity layer and the whole model library, the sky,
// rain, lamps, telegraphs, clouds, fireflies, the particles and the post chain. What it does NOT use: the prototype's own HUD,
// its keyboard and pointer handling, its solo connection and its sounds (the game has its own of all of those).
//
// Units: tiles here (x east, z south, y up); sim pixels (TILE per tile) at the seam, converted on the way in and out.

import { Box3, type Color, InstancedMesh, type Material, Mesh, MeshBasicMaterial, type MeshStandardMaterial, type Object3D, PCFShadowMap, PCFSoftShadowMap, Plane, Raycaster, RingGeometry, Scene, Vector2, Vector3 } from 'three';
import { PLOT, TILE, VIEW_H, VIEW_W } from '../shared/config';
import { BUILDINGS, type BuildingKind } from '../shared/data/buildings';
import type { Ent, Plot, SimEvent } from '../shared/sim/types';
import type { World } from '../shared/world';
import type { Quality3D } from '../client/settings';
import type { GroundView, View3D, View3DFrame, View3DHost, View3DPlacing, XY } from '../client/world/view3d-bridge';
import { CloudShadows, Fireflies } from './ambient';
import { CameraRig } from './camera';
import { ContactShadows } from './contact';
import { Batcher } from './batch';
import { fitShadow, Ledger, reach, viewExtent } from './budget';
import { Entities, type View } from './entities';
import { C, FX, type FxDef, Particles } from './fx';
import { buildingModel } from './models/buildings';
import { ROCK_H } from './caves';
import { env } from './models/kit';
import { Mood, type MoodParts } from './mood';
import { AutoStep, deviceInfo, pixelRatio, QUALITY, type QualityLevel, type QualitySpec, resolveQuality, stepDown } from './quality';
import { makePost, makeRenderer } from './render';
import { dressForSeasons, seasonGround } from './seasons';
import { Sky } from './sky';
import { groundMat, Sea, Terrain } from './terrain';
import { groundViewOf } from './groundview';
import { Impacts } from './impacts';
import { Arenas, Warnings } from './marks';
import { LightPool, Rain } from './weather';
import { Wires } from './wires';
import { Wetness } from './wet';

/** A burst for the actions the prototype's table has no entry for yet (every action still gets a visible puff). */
const PUFF: FxDef = { colors: [C.cream, C.gold], n: 6, speed: 1.6, up: 2.2, size: 0.6, sfx: '', shake: 0.02 };
/** How long a swing pose lasts (seconds), as the prototype animates it. */
const SWING = 0.28;
const tiles = (v: number) => v / TILE;

/** The see-through building in hand: one model per kind and turn, its own materials so it can glow green or red. */
interface Ghost { key: string; obj: Object3D; mats: MeshStandardMaterial[] }

export function createView3D (host: View3DHost): View3D {
    return new GameView3D(host);
}

class GameView3D implements View3D {
    private readonly renderer = makeRenderer();
    private readonly scene = new Scene();
    /** The camera (src/client3d/camera.ts): follow, zoom, shake, the Perfect beat, photo mode, the dip into the caves. */
    private readonly rig = new CameraRig();
    private readonly cam = this.rig.cam;
    private readonly post = makePost(this.renderer, this.scene, this.cam);
    private readonly sky = new Sky(this.scene, 2048);
    private readonly sea = new Sea(this.scene);
    private readonly particles = new Particles(this.scene);
    private readonly rain = new Rain(this.scene);
    private readonly lamps = new LightPool(this.scene);
    /** A boss's warnings and arenas painted on the ground, and the power wires (the other world overlays are the 2D code's, laid on this ground). */
    private readonly warnings = new Warnings(this.scene);
    private readonly arenas = new Arenas(this.scene);
    private readonly wires = new Wires(this.scene);
    private readonly clouds = new CloudShadows(this.scene);
    private readonly flies = new Fireflies(this.scene);
    /** The art pass: soft contact shadows under everything that stands, rings and flashes where blows land and dust at running
     * feet, and the ground wet with rain (contact.ts, impacts.ts, wet.ts). */
    private readonly contact = new ContactShadows(this.scene);
    private readonly impacts = new Impacts(this.scene);
    private readonly wet = new Wetness(this.scene, groundMat);
    /** Where a puddle may lie: open land on the surface (no building, no rock, not the sea). */
    private readonly openLand = (tx: number, ty: number) => !!this.terrain?.landAt(tx, ty) && !!this.world?.isFree(tx, ty);
    private readonly canvas: HTMLCanvasElement;
    private readonly hostStyle: { position: string; zIndex: string };
    private world: World | null = null;
    private terrain: Terrain | null = null;
    private ents: Entities | null = null;
    /** Where the camera looks (tiles; the rig moves it), and the view's own clock. */
    private readonly camT = this.rig.target;
    private t = 0;
    /** Swing poses running (seconds left) and where each farmer was last frame (for the walk). */
    private readonly swingT = new Map<string, number>();
    /** The building in hand (first) and the pieces of a blueprint being pasted. */
    private ghosts: Ghost[] = [];
    private readonly ghostList: View3DPlacing[] = [];
    private gv: GroundView | null = null;
    private readonly ring: Mesh<RingGeometry, MeshBasicMaterial>;
    /** The world's mood: sky, light, weather, seasons, the caves and the Dread Reaches (mood.ts). */
    private readonly mood: Mood;
    /** Node models already dressed for the seasons. */
    private readonly dressed = new WeakSet<object>();
    /** The canvas box last laid out (CSS pixels) and its pixel ratio. */
    private box = { l: -1, t: -1, w: 0, h: 0, dpr: 0 };
    private readonly ray = new Raycaster();
    private readonly ground = new Plane(new Vector3(0, 1, 0), 0);
    private readonly rockTop = new Plane(new Vector3(0, 1, 0), -ROCK_H);
    private readonly hit = new Vector3();
    private readonly ndc = new Vector2();
    private readonly proj = new Vector3();
    private readonly tmpBox = new Box3();
    private readonly tmpHit = new Vector3();
    /** Each model's pick box, relative to where it stands (worked out the first time it is pointed at). */
    private readonly pickBoxes = new WeakMap<Object3D, Box3>();
    private disposed = false;
    /** The perf side (src/client3d/batch.ts, budget.ts, quality.ts): instancing, the ledger of what was uploaded, the quality level. */
    private readonly batch = new Batcher();
    private readonly ledger = new Ledger(this.renderer);
    private readonly phone = deviceInfo().phone;
    private spec: QualitySpec = QUALITY.high;
    private qSetting: Quality3D | null = null;
    private readonly auto = new AutoStep();
    private lastNow = 0;
    private dpr = 1;
    private lampsOn = false;
    private readonly sunDir = new Vector3();
    private readonly gvDir = new Vector3();

    constructor (private host: View3DHost) {
        this.canvas = this.renderer.domElement;
        this.canvas.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:0;pointer-events:none;display:block';
        this.canvas.setAttribute('aria-hidden', 'true');
        // the Phaser canvas (transparent, with the HUD) goes on top of this one
        const pc = host.canvas;
        this.hostStyle = { position: pc.style.position, zIndex: pc.style.zIndex };
        pc.style.position = 'relative';
        pc.style.zIndex = '1';
        pc.parentElement?.insertBefore(this.canvas, pc);
        this.ring = new Mesh(new RingGeometry(0.42, 0.52, 40).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.7, depthWrite: false }));
        this.ring.renderOrder = 5;
        this.ring.visible = false;
        this.scene.add(this.ring);
        seasonGround(groundMat);
        this.mood = new Mood({
            scene: this.scene, sky: this.sky, sea: this.sea, rain: this.rain, lamps: this.lamps, clouds: this.clouds, flies: this.flies,
            grade: this.post.grade.uniforms as unknown as MoodParts['grade'],
            surface: () => this.terrain?.group ?? null,
            landAt: (tx, ty) => this.terrain?.landAt(tx, ty) ?? false,
        });
        this.scene.add(this.batch.group);
        this.scene.matrixWorldAutoUpdate = false;              // (frame() updates the world matrices once, before batching)
        this.renderer.info.autoReset = false;                  // (counted per frame, over every pass: the `perf` getter reads it)
        this.setQuality('auto');
        this.layout();
    }

    // ── the world's state ───────────────────────────────────────────────────
    welcome (world: World, ents: Iterable<Ent>) {
        if (this.terrain) { this.terrain.invalidateAll(); this.scene.remove(this.terrain.group); }
        if (this.ents) {
            for (const id of [...this.ents.views.keys()]) this.remove(id);
            for (const id of this.ents.farmerIds()) this.ents.dropFarmer(id);
            this.scene.remove(this.ents.group);
        }
        this.world = world;
        this.terrain = new Terrain(world, this.scene);
        this.ents = new Entities(this.scene, world);
        this.ents.gone = (obj) => this.ledger.dropModel(obj);
        for (const e of ents) this.upsert(e);
        this.mood.welcome(world);
        this.swingT.clear();
        this.rig.reset();
        this.warnings.clear(); this.arenas.clear(); this.wires.clear();
        this.impacts.clear();
    }

    upsert (e: Ent) {
        this.ents?.upsert(e);
        if (e.k === 'node') {
            const obj = this.ents?.views.get(e.id)?.model.obj;
            if (obj && !this.dressed.has(obj)) { this.dressed.add(obj); dressForSeasons(obj); }
        }
    }

    /** A storm's lightning flash (0..1), from the 2D night layer, which keeps the timer and plays the thunder. */
    lightning (k: number) { this.mood.bolt = Math.max(this.mood.bolt, k); }

    remove (id: number) {
        const ents = this.ents, v = ents?.views.get(id);
        if (!ents || !v) return;
        const before = ents.leaving.length;
        ents.remove(id);
        // what only this model used goes back to the GPU now (the model caches' geometries stay for the next one); a monster
        // shrinking away or a drop flying to its farmer is still drawn, so its model goes back when that ends (Entities.gone)
        if (ents.leaving.length === before) this.ledger.dropModel(v.model.obj, v.fade);
        if (v.bar) this.ledger.dropModel(v.bar);
    }

    plots (changed: readonly Plot[], risen: readonly Plot[]) {
        const w = this.world, tr = this.terrain;
        if (!w || !tr) return;
        for (const plot of changed) {
            if (risen.includes(plot)) continue;
            const o = w.plotOrigin(plot);
            tr.invalidateRect(o.tx - 1, o.ty - 1, o.tx + PLOT, o.ty + PLOT);
        }
        for (const plot of risen) {
            tr.rise(plot, (x, z, ring) => {
                for (let i = 0; i < 8; i++) {
                    const a = Math.random() * Math.PI * 2;
                    this.particles.burst(x + Math.cos(a) * ring, 0.1, z + Math.sin(a) * ring, [C.foam, C.sea, C.cream], 2, 1.6, 2.6, 0.7);
                }
            });
        }
    }

    event (e: SimEvent, me: string) {
        switch (e.e) {
            case 'fx': {
                const spec = FX[e.fx] ?? PUFF;
                const x = tiles(e.x), z = tiles(e.y) + 0.3;
                if (Math.abs(x - this.camT.x) > 26 || Math.abs(z - this.camT.z) > 20) return;
                this.particles.burst(x, spec.y ?? 0.7, z, spec.colors, spec.n, spec.speed, spec.up, spec.size);
                this.impacts.fx(e.fx, x, z - 0.3);
                return;             // (the shake is the 2D camera's, read every frame: only your own actions shake your camera)
            }
            case 'tele':
                this.warnings.add(e);
                return;
            case 'swing':
                if (e.by !== me) this.swingT.set(e.by, SWING);
                return;
            default:
                return;
        }
    }

    swing (id: string) { this.swingT.set(id, SWING); }

    // ── a frame ─────────────────────────────────────────────────────────────
    frame (dt: number, f: View3DFrame) {
        if (this.disposed) return;
        this.watchQuality(f.quality ?? 'auto');
        this.layout();
        const world = this.world, ents = this.ents, terrain = this.terrain;
        if (!world || !ents || !terrain) return;
        this.t += dt;
        this.updateCamera(dt, f, world);
        const camT = this.camT;
        // how much ground the camera sees: the ground is built, and things animate, only that far (plus a margin)
        const ext = viewExtent(this.cam);
        // the sky, the light, the weather, the seasons, the caves (mood.ts); the farmers first, so the light you carry is on you
        this.impacts.feet = this.spec.ambient && this.wet.wet < 0.3;
        this.drawFarmers(dt, f);
        const meF = f.farmers.find((p) => p.id === f.me);
        this.mood.frame(dt, this.t, { clock: f.clock, seed: f.seed, me: meF ? { x: tiles(meF.x), z: tiles(meF.y) } : null, ambient: this.spec.ambient }, camT, ents.views);
        // the budget over the mood (quality.ts): the sun casts only while it shines (no shadow pass at night or in the caves), and a
        // low sun throws long shadows in from further away
        const sky = this.sky;
        sky.sun.castShadow = this.spec.shadow > 0 && sky.sun.intensity > 0.05;
        if (sky.sun.castShadow) fitShadow(sky.sun, ext, this.spec.shadow);
        const sunY = this.sunDir.subVectors(sky.sun.position, sky.sun.target.position).normalize().y;
        const throwIn = sky.sun.castShadow ? Math.min(14, Math.max(4, 2.5 / Math.max(0.05, sunY))) : 2;
        const near = reach(ext, throwIn + 1);
        sky.moon.visible = sky.moon.intensity > 0.01;            // (a light at no intensity still costs every lit pixel)
        this.lampsFor(this.mood.dark);
        env.seed = f.seed;                                       // (the weather vane reads the day's wind and forecast from these)
        env.day = f.clock.day;
        // the camera's own grade over the mood's (camera.ts): the Perfect beat drains a little colour; the dip into the caves goes dark
        const grade = this.post.grade.uniforms;
        grade.uSat.value *= 1 - 0.4 * this.rig.beat;
        grade.uExp.value *= 1 - this.rig.fade;
        terrain.update(camT.x, camT.z, near.r + 6);
        terrain.animate(dt);
        this.sea.follow(camT.x, camT.z, this.t);
        // everything else
        ents.update(dt, this.t, camT.x, camT.z, near);
        if (meF) {
            const under = world.roofAt(Math.floor(tiles(meF.x)), Math.floor((meF.y - 2) / TILE)) !== 0;
            ents.fadeRoofs(under, dt, tiles(meF.x), tiles(meF.y));
        }
        this.drawContacts(ents);
        this.wet.update(dt, this.mood.wetRain, camT.x, camT.z, this.scene.background as Color, this.spec.ambient && this.mood.under < 0.5, this.openLand);
        this.particles.update(dt);
        this.impacts.update(dt);
        this.warnings.update(dt);
        this.arenas.update(ents.views.values(), this.t);
        this.wires.update(dt, ents.views.values(), camT.x, camT.z);
                const gl = this.ghostList;
        gl.length = 0;
        if (f.placing) gl.push(f.placing);
        if (f.paste) for (const p of f.paste) gl.push(p);
        this.updateGhosts(gl);
        this.updateRing(f.target);
        // world matrices once a frame, and only for what is shown (a big farm keeps thousands of hidden models out of view)
        for (const c of ents.group.children) c.matrixWorldAutoUpdate = c.visible;
        this.scene.updateMatrixWorld();
        this.batch.run(ents.group, this.cam, throwIn);
        this.renderer.info.reset();
        this.post.composer.render();
    }

    // ── quality (src/client3d/quality.ts) ───────────────────────────────────
    /** The player's 3D quality setting, as the frame carries it; Auto also steps down once frames stay slow. */
    private watchQuality (q: Quality3D) {
        if (q !== this.qSetting) this.setQuality(q);
        const now = performance.now(), ms = this.lastNow ? now - this.lastNow : 0;
        this.lastNow = now;
        if (q === 'auto' && this.spec.level !== 'low' && this.auto.frame(ms)) this.applyLevel(stepDown(this.spec.level));
    }

    private setQuality (q: Quality3D) {
        this.qSetting = q;
        this.applyLevel(resolveQuality(q, deviceInfo()));
    }

    /** Spend what a level spends: pixel ratio, the sun's shadow, soft or hard edges, the glow, multisampling, lamps, ambient life. */
    private applyLevel (level: QualityLevel) {
        const q = QUALITY[level];
        this.spec = q;
        this.dpr = pixelRatio(q, window.devicePixelRatio, this.phone);
        this.box.dpr = -1;                                       // (lay the canvas out again at the new pixel ratio)
        const sun = this.sky.sun;
        sun.castShadow = q.shadow > 0;                           // (and only by day: frame())
        if (q.shadow > 0 && sun.shadow.mapSize.x !== q.shadow) {
            sun.shadow.mapSize.set(q.shadow, q.shadow);
            sun.shadow.map?.dispose();
            sun.shadow.map = null;
        }
        const type = q.softShadow ? PCFSoftShadowMap : PCFShadowMap;
        if (this.renderer.shadowMap.type !== type) {
            this.renderer.shadowMap.type = type;
            for (const m of this.ledger.mats) m.needsUpdate = true;     // (the shadow filter is part of every lit material's program)
        }
        this.post.bloom.enabled = q.bloom;
        this.rain.density = level === 'low' ? 0.45 : level === 'medium' ? 0.75 : 1;
        this.post.setSamples(q.msaa);
        this.showLamps();
        if (!q.ambient) { this.clouds.mesh.visible = false; this.flies.pts.visible = false; }
    }

    /** What the view is spending now, and what it drew last frame (for the perf checks; see tests/view3d.test.ts and DESIGN.md). */
    get perf () {
        const info = this.renderer.info;
        return { level: this.spec.level, dpr: this.dpr, shadow: this.sky.sun.castShadow ? this.spec.shadow : 0, calls: info.render.calls, triangles: info.render.triangles, batch: { ...this.batch.stats }, geometries: info.memory.geometries, textures: info.memory.textures };
    }

    private updateCamera (dt: number, f: View3DFrame, world: World) {
        const c = f.cam;
        this.rig.update({
            dt: c?.realDt ?? dt, x: tiles(f.camX), z: tiles(f.camY), zoom: f.zoom, aspect: this.box.w / Math.max(1, this.box.h),
            under: world.isUnderPx(f.camY), punch: c?.punch, slow: c?.slow, shake: c ? tiles(c.shake) : 0, photo: c?.photo,
        });
    }

    private drawFarmers (dt: number, f: View3DFrame) {
        const ents = this.ents!;
        const seen = new Set<string>();
        for (const p of f.farmers) {
            seen.add(p.id);
            const s = Math.max(0, (this.swingT.get(p.id) ?? 0) - dt);
            this.swingT.set(p.id, s);
            ents.setFarmer(p.id, p.p, tiles(p.x), tiles(p.y), p.fx, p.fy, p.moving, s > 0 ? 1 - s / SWING : 0, p.hold ?? undefined, dt);
            this.impacts.feetOf(p.id, tiles(p.x), tiles(p.y), p.moving && !(p.p.downed > 0), dt);
        }
        for (const id of ents.farmerIds()) if (!seen.has(id)) { ents.dropFarmer(id); this.swingT.delete(id); this.impacts.drop(id); }
    }

    /**
     * Contact shadows under what is shown: softer while the sun casts its own shadows (they add to them as a little ambient
     * occlusion), stronger when it does not (Low quality, night, the caves), so nothing ever floats.
     */
    private drawContacts (ents: Entities) {
        const c = this.contact;
        c.begin(this.mood.under > 0.5 ? 0.46 : this.sky.sun.castShadow ? 0.22 : 0.36);
        c.addViews(ents.views.values());
        for (const fv of ents.farmers.values()) c.add(fv.x, fv.z, 0.72, 0.58);
        c.end();
    }

    /**
     * The night lights' budget (glow.ts gathers and lights them): by day the lamps leave the scene altogether, since every point
     * light costs every lit pixel even at no intensity (the materials keep the program for each light count, so switching at dusk
     * and dawn compiles nothing after the first time); at night only as many as the quality level allows.
     */
    private lampsFor (dark: number) {
        if (this.lampsOn !== (this.lampsOn ? dark > 0.01 : dark > 0.05)) { this.lampsOn = !this.lampsOn; this.showLamps(); }
    }

    private showLamps () {
        const n = this.lampsOn ? this.spec.lamps : 0;
        this.lamps.lights.forEach((l, i) => { l.visible = i < n; if (i >= n) l.intensity = 0; });
        this.mood.glows.carry.visible = this.lampsOn;            // (the light you carry is one more point light: by day it is out too)
    }

    /** The building in hand and a pasted blueprint's pieces, see-through, green where they fit and red where not (the Game scene's rules decide). */
    private updateGhosts (list: readonly View3DPlacing[]) {
        const ghosts = this.ghosts;
        while (ghosts.length > list.length) this.dropGhost(ghosts.pop()!);
        const bob = 0.02 + Math.sin(this.t * 3.8) * 0.03;
        for (let i = 0; i < list.length; i++) {
            const pl = list[i];
            const key = `${pl.kind}|${pl.rot & 3}`;
            let g = ghosts[i];
            if (g?.key !== key) {
                if (g) this.dropGhost(g);
                g = ghosts[i] = this.makeGhost(pl.kind, pl.rot & 3, key);
            }
            const [w, h] = BUILDINGS[pl.kind as BuildingKind].size;
            g.obj.position.set(pl.tx + w / 2, bob, pl.ty + h / 2);
            for (const m of g.mats) { m.emissive.setHex(pl.valid ? 0x2a8a3a : 0xc03040); m.emissiveIntensity = 0.55; }
        }
    }

    private makeGhost (kind: BuildingKind, rot: number, key: string): Ghost {
        const obj = buildingModel(kind, { rot, seed: 7, mask: 0 }).obj;
        const mats: MeshStandardMaterial[] = [];
        obj.traverse((o) => {
            const mesh = o as Mesh;
            if (!mesh.isMesh) return;
            const own = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((mt: Material) => {
                const c = mt.clone();
                c.transparent = true;
                c.opacity = 0.62;
                c.depthWrite = false;
                if ('emissive' in c) mats.push(c as MeshStandardMaterial);
                return c;
            });
            mesh.material = Array.isArray(mesh.material) ? own : own[0];
            mesh.castShadow = false;
        });
        this.scene.add(obj);
        return { key, obj, mats };
    }

    private dropGhost (g: Ghost) {
        this.scene.remove(g.obj);
        for (const m of g.mats) m.dispose();
    }

    /** A soft ring under what a swing would hit. */
    private updateRing (t: View3DFrame['target']) {
        const ring = this.ring;
        ring.visible = !!t;
        if (!t) return;
        const rock = !!this.world?.rockAt(Math.floor(tiles(t.x)), Math.floor(tiles(t.y)));
        ring.position.set(tiles(t.x), rock ? ROCK_H + 0.04 : 0.05, tiles(t.y));
        ring.scale.setScalar(t.r * (1 + Math.sin(this.t * 6) * 0.05));
        ring.material.opacity = 0.55 + Math.sin(this.t * 6) * 0.15;
    }

    // ── the canvas and the pointer ──────────────────────────────────────────
    /** Keep this canvas exactly under the Phaser canvas (same box), at the device's pixel ratio. */
    private layout () {
        const r = this.host.canvas.getBoundingClientRect();
        const dpr = this.dpr;
        const b = this.box;
        if (b.l === r.left && b.t === r.top && b.w === r.width && b.h === r.height && b.dpr === dpr) return;
        this.box = { l: r.left, t: r.top, w: r.width, h: r.height, dpr };
        const s = this.canvas.style;
        s.left = `${r.left}px`; s.top = `${r.top}px`; s.width = `${r.width}px`; s.height = `${r.height}px`;
        if (r.width > 0 && r.height > 0) this.post.resize(r.width, r.height, dpr);
    }

    pointerToWorld (u: number, v: number, out: XY, aim: boolean) {
        if (!this.world) return false;
        this.ndc.set(u * 2 - 1, -(v * 2 - 1));
        this.ray.setFromCamera(this.ndc, this.cam);
        if (aim) {
            const e = this.pick();
            if (e) { const c = this.host.entCenter(e); out.x = c.x; out.y = c.y; return true; }
            if (this.mood.under > 0.5 && this.ray.ray.intersectPlane(this.rockTop, this.hit) && this.world.rockAt(Math.floor(this.hit.x), Math.floor(this.hit.z))) {
                out.x = (Math.floor(this.hit.x) + 0.5) * TILE;
                out.y = (Math.floor(this.hit.z) + 0.5) * TILE;
                return true;
            }
        }
        if (!this.ray.ray.intersectPlane(this.ground, this.hit)) return false;
        out.x = this.hit.x * TILE;
        out.y = this.hit.z * TILE;
        return true;
    }

    /** The nearest thing under the ray that can be aimed at: a node, a monster, a creature, a building (not floors, not a faded roof). */
    private pick (): Ent | null {
        const ents = this.ents;
        if (!ents) return null;
        let best: Ent | null = null, bestD = Infinity;
        const origin = this.ray.ray.origin;
        for (const v of ents.views.values()) {
            if (!this.pickable(v)) continue;
            const obj = v.model.obj;
            let local = this.pickBoxes.get(obj);
            if (!local) {
                obj.updateMatrixWorld(true);
                local = new Box3().setFromObject(obj);
                if (local.isEmpty()) continue;
                local.min.sub(obj.position);
                local.max.sub(obj.position);
                this.pickBoxes.set(obj, local);
            }
            const box = this.tmpBox.copy(local).translate(obj.position);
            if (!this.ray.ray.intersectBox(box, this.tmpHit)) continue;
            const d = this.tmpHit.distanceToSquared(origin);
            if (d < bestD) { bestD = d; best = v.e; }
        }
        return best;
    }

    private pickable (v: View) {
        const e = v.e;
        if (!v.model.obj.visible) return false;
        if (e.k === 'node' || e.k === 'mob' || e.k === 'crit') return true;
        if (e.k !== 'bld') return false;
        const d = BUILDINGS[e.kind];
        return !d.floor && !(d.roof && (v.roofA ?? 1) < 0.5);
    }

    groundView (): GroundView | null {
        // (a photo camera turned about the vertical shears the ground on screen, which a 2D camera cannot copy: the overlays wait
        // until it turns back; tilt and zoom are fine)
        if (!this.rig.placed || Math.abs(this.rig.yaw) > 1e-3) return null;
        // the ground point in the middle of the screen, shake and all: down the camera's own axis to the ground
        const cam = this.cam, p = cam.position, dir = cam.getWorldDirection(this.gvDir);
        const k = dir.y < -1e-6 ? -p.y / dir.y : 0;
        return groundViewOf(cam, { x: p.x + dir.x * k, z: p.z + dir.z * k }, (this.gv ??= { cx: 0, cy: 0, sx: 1, sy: 1, up: 1 }));
    }

    worldToScreen (x: number, y: number): XY {
        this.proj.set(tiles(x), 0, tiles(y)).project(this.cam);
        return { x: (this.proj.x * 0.5 + 0.5) * VIEW_W, y: (-this.proj.y * 0.5 + 0.5) * VIEW_H };
    }

    dispose () {
        if (this.disposed) return;
        this.disposed = true;
        for (const g of this.ghosts) this.dropGhost(g);
        this.ghosts.length = 0;
        this.warnings.clear(); this.arenas.clear(); this.wires.dispose();
        this.contact.dispose(); this.impacts.dispose(); this.wet.dispose();
        this.terrain?.invalidateAll();
        this.batch.dispose();
        this.scene.traverse((o) => { if ((o as InstancedMesh).isInstancedMesh) (o as InstancedMesh).dispose(); });
        this.sky.sun.shadow.dispose();
        // every geometry, material and texture this renderer uploaded: their dispose listeners would otherwise keep it alive
        this.ledger.release();
        this.post.dispose();
        this.mood.dispose();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        this.canvas.remove();
        const pc = this.host.canvas;
        pc.style.position = this.hostStyle.position;
        pc.style.zIndex = this.hostStyle.zIndex;
    }
}

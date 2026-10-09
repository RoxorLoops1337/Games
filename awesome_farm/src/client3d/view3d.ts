// The 3D world view inside the game: the "3D (beta)" view setting. Loaded on demand (its own chunk, with three.js) by
// `loadView3D` in src/client/world/view3d-bridge.ts, which also holds the interface this implements and explains the split:
// the Game scene keeps running (connection, mirror, input, targeting, placing) and feeds this view; the Phaser HUD draws on top.
//
// What it reuses from the prototype (src/client3d): the terrain and sea, the entity layer and the whole model library, the sky,
// rain, lamps, telegraphs, clouds, fireflies, the particles and the post chain. What it does NOT use: the prototype's own HUD,
// its keyboard and pointer handling, its solo connection and its sounds (the game has its own of all of those).
//
// Units: tiles here (x east, z south, y up); sim pixels (TILE per tile) at the seam, converted on the way in and out.

import { Box3, type Material, Mesh, MeshBasicMaterial, type MeshStandardMaterial, type Object3D, OrthographicCamera, Plane, Raycaster, RingGeometry, Scene, Vector2, Vector3 } from 'three';
import { PLOT, TILE, VIEW_H, VIEW_W } from '../shared/config';
import { BUILDINGS, type BuildingKind } from '../shared/data/buildings';
import type { Ent, Plot, SimEvent } from '../shared/sim/types';
import { weatherAt } from '../shared/weather';
import type { World } from '../shared/world';
import type { View3D, View3DFrame, View3DHost, View3DPlacing, XY } from '../client/world/view3d-bridge';
import { CloudShadows, Fireflies } from './ambient';
import { Entities, type View } from './entities';
import { C, FX, type FxDef, Particles } from './fx';
import { buildingModel } from './models/buildings';
import { env } from './models/kit';
import { BASE_VIEW, dprCap, EL, hourOf, makePost, makeRenderer } from './render';
import { Sky } from './sky';
import { Sea, Terrain } from './terrain';
import { LightPool, type LightSpot, Rain, Telegraphs } from './weather';

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
    private readonly cam = new OrthographicCamera(-10, 10, 6, -6, 1, 400);
    private readonly post = makePost(this.renderer, this.scene, this.cam);
    private readonly sky = new Sky(this.scene, 2048);
    private readonly sea = new Sea(this.scene);
    private readonly particles = new Particles(this.scene);
    private readonly rain = new Rain(this.scene);
    private readonly lamps = new LightPool(this.scene);
    private readonly tele = new Telegraphs(this.scene);
    private readonly clouds = new CloudShadows(this.scene);
    private readonly flies = new Fireflies(this.scene);
    private readonly canvas: HTMLCanvasElement;
    private readonly hostStyle: { position: string; zIndex: string };
    private world: World | null = null;
    private terrain: Terrain | null = null;
    private ents: Entities | null = null;
    /** Where the camera looks (tiles), the zoom it glides to, the shake, the view's own clock. */
    private readonly camT = new Vector3();
    private camSet = false;
    private zoom = 1;
    private readonly shake = { x: 0, z: 0, p: 0 };
    private shakeOn = true;
    private t = 0;
    /** Swing poses running (seconds left) and where each farmer was last frame (for the walk). */
    private readonly swingT = new Map<string, number>();
    private ghost: Ghost | null = null;
    private readonly ring: Mesh<RingGeometry, MeshBasicMaterial>;
    private readonly spots: LightSpot[] = [];
    private lightsT = 0;
    /** The canvas box last laid out (CSS pixels) and its pixel ratio. */
    private box = { l: -1, t: -1, w: 0, h: 0, dpr: 0 };
    private readonly ray = new Raycaster();
    private readonly ground = new Plane(new Vector3(0, 1, 0), 0);
    private readonly hit = new Vector3();
    private readonly ndc = new Vector2();
    private readonly proj = new Vector3();
    private readonly tmpBox = new Box3();
    private readonly tmpHit = new Vector3();
    /** Each model's pick box, relative to where it stands (worked out the first time it is pointed at). */
    private readonly pickBoxes = new WeakMap<Object3D, Box3>();
    private disposed = false;

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
        this.layout();
    }

    // ── the world's state ───────────────────────────────────────────────────
    welcome (world: World, ents: Iterable<Ent>) {
        if (this.terrain) { this.terrain.invalidateAll(); this.scene.remove(this.terrain.group); }
        if (this.ents) {
            for (const id of [...this.ents.views.keys()]) this.ents.remove(id);
            for (const id of this.ents.farmerIds()) this.ents.dropFarmer(id);
            this.scene.remove(this.ents.group);
        }
        this.world = world;
        this.terrain = new Terrain(world, this.scene);
        this.ents = new Entities(this.scene, world);
        for (const e of ents) this.ents.upsert(e);
        this.swingT.clear();
        this.camSet = false;
    }

    upsert (e: Ent) { this.ents?.upsert(e); }

    remove (id: number) { this.ents?.remove(id); }

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
                this.shake.p = Math.max(this.shake.p, this.shakeOn ? 0.05 : 0);
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
                if ((e.by === me || e.by === '*') && this.shakeOn && spec.shake) this.shake.p = Math.max(this.shake.p, spec.shake);
                return;
            }
            case 'tele':
                this.tele.add(tiles(e.x), tiles(e.y), Math.max(0.5, tiles(e.r)), e.t, e.shape === 'ring');
                return;
            case 'knock':
                if (e.to === me && !e.soft && this.shakeOn) this.shake.p = Math.max(this.shake.p, 0.2);
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
        this.layout();
        const world = this.world, ents = this.ents, terrain = this.terrain;
        if (!world || !ents || !terrain) return;
        this.t += dt;
        this.shakeOn = f.shake;
        this.updateCamera(dt, f);
        const camT = this.camT;
        // the sky, the weather and the things that live in the air
        const hour = hourOf(f.clock.clock, f.clock.nightLen);
        const w = weatherAt(f.seed, f.clock.day, f.clock.clock);
        const sky = this.sky;
        sky.apply(hour, w.rain, camT);
        env.night = sky.night;
        env.sun = 1 - sky.night;
        env.wind = Math.min(1, 0.25 + w.rain * 0.6 + (w.storm ? 0.3 : 0));
        const grade = this.post.grade.uniforms;
        (grade.uTint.value as { copy (c: unknown): void }).copy(sky.tint);
        grade.uSat.value = sky.saturation;
        grade.uExp.value = sky.exposure;
        this.rain.update(dt, camT.x, camT.z, w.rain);
        this.clouds.update(this.t, camT.x, camT.z, 1 - sky.night, w.rain);
        this.flies.update(this.t, camT.x, camT.z, Math.max(0, sky.night - 0.25) * (1 - w.rain));
        this.sea.u.uSun.value = (1 - sky.night) * (1 - w.rain * 0.7);
        terrain.update(camT.x, camT.z);
        terrain.animate(dt);
        this.sea.follow(camT.x, camT.z, this.t);
        // the farmers (you and everyone online), then everything else
        this.drawFarmers(dt, f);
        ents.update(dt, this.t, camT.x, camT.z);
        const meF = f.farmers.find((p) => p.id === f.me);
        if (meF) {
            const under = world.roofAt(Math.floor(tiles(meF.x)), Math.floor((meF.y - 2) / TILE)) !== 0;
            ents.fadeRoofs(under, dt, tiles(meF.x), tiles(meF.y));
        }
        this.particles.update(dt);
        this.tele.update(dt);
        this.updateLights(dt, sky.night, w.rain);
        this.updateGhost(f.placing);
        this.updateRing(f.target);
        this.post.composer.render();
    }

    private updateCamera (dt: number, f: View3DFrame) {
        const cam = this.cam, camT = this.camT;
        const tx = tiles(f.camX), tz = tiles(f.camY) - 0.2;
        // a warp (respawn, waystone, a new world) jumps; walking glides
        if (!this.camSet || Math.hypot(tx - camT.x, tz - camT.z) > 12) { camT.set(tx, 0, tz); this.camSet = true; }
        camT.x += (tx - camT.x) * Math.min(1, dt * 7);
        camT.z += (tz - camT.z) * Math.min(1, dt * 7);
        this.zoom += (f.zoom - this.zoom) * Math.min(1, dt * 8);
        const sh = this.shake;
        sh.p *= Math.pow(0.0004, dt);
        sh.x = (Math.random() - 0.5) * sh.p * 2;
        sh.z = (Math.random() - 0.5) * sh.p * 2;
        const H = BASE_VIEW / this.zoom, A = this.box.w / Math.max(1, this.box.h);
        cam.left = -H * A / 2;
        cam.right = H * A / 2;
        cam.top = H / 2;
        cam.bottom = -H / 2;
        cam.updateProjectionMatrix();
        cam.position.set(camT.x + sh.x, Math.sin(EL) * 120, camT.z + Math.cos(EL) * 120 + sh.z);
        cam.lookAt(camT.x + sh.x, 0, camT.z + sh.z);
        cam.updateMatrixWorld();
    }

    private drawFarmers (dt: number, f: View3DFrame) {
        const ents = this.ents!;
        const seen = new Set<string>();
        for (const p of f.farmers) {
            seen.add(p.id);
            const s = Math.max(0, (this.swingT.get(p.id) ?? 0) - dt);
            this.swingT.set(p.id, s);
            ents.setFarmer(p.id, p.p, tiles(p.x), tiles(p.y), p.fx, p.fy, p.moving, s > 0 ? 1 - s / SWING : 0, p.hold ?? undefined);
        }
        for (const id of ents.farmerIds()) if (!seen.has(id)) { ents.dropFarmer(id); this.swingT.delete(id); }
    }

    /** Lamps, lanterns and fires light the night: the nearest few get a real light, four times a second. */
    private updateLights (dt: number, night: number, rain: number) {
        this.lightsT -= dt;
        if (this.lightsT <= 0) {
            this.lightsT = 0.25;
            const spots = this.spots;
            spots.length = 0;
            for (const v of this.ents!.views.values()) {
                const e = v.e;
                if (e.k !== 'bld') continue;
                const d = BUILDINGS[e.kind];
                if (!d.light) continue;
                const [bw, bh] = d.size, fire = e.kind === 'campfire' || e.kind === 'furnace';
                if (Math.abs(e.tx - this.camT.x) > 40 || Math.abs(e.ty - this.camT.z) > 40) continue;
                spots.push({ x: e.tx + bw / 2, y: e.kind === 'lamppost' ? 2.3 : 1.1, z: e.ty + bh / 2, color: fire ? 0xff9a40 : e.kind === 'lamppost' || e.kind === 'lantern' ? 0xffd890 : 0x9fe0ff, power: Math.min(1.4, d.light / 60), range: Math.min(12, 3 + d.light / 12) });
            }
        }
        this.lamps.update(this.spots, this.camT.x, this.camT.z, Math.max(night, rain * 0.3), this.t);
    }

    /** The building in hand, see-through, green where it fits and red where it does not (the Game scene's placing rules decide). */
    private updateGhost (pl: View3DPlacing | null) {
        if (!pl) { this.dropGhost(); return; }
        const key = `${pl.kind}|${pl.rot & 3}`;
        if (this.ghost?.key !== key) {
            this.dropGhost();
            const obj = buildingModel(pl.kind, { rot: pl.rot & 3, seed: 7, mask: 0 }).obj;
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
            this.ghost = { key, obj, mats };
            this.scene.add(obj);
        }
        const [w, h] = BUILDINGS[pl.kind as BuildingKind].size;
        this.ghost.obj.position.set(pl.tx + w / 2, 0.02 + Math.sin(this.t * 3.8) * 0.03, pl.ty + h / 2);
        for (const m of this.ghost.mats) { m.emissive.setHex(pl.valid ? 0x2a8a3a : 0xc03040); m.emissiveIntensity = 0.55; }
    }

    private dropGhost () {
        if (!this.ghost) return;
        this.scene.remove(this.ghost.obj);
        for (const m of this.ghost.mats) m.dispose();
        this.ghost = null;
    }

    /** A soft ring under what a swing would hit. */
    private updateRing (t: View3DFrame['target']) {
        const ring = this.ring;
        ring.visible = !!t;
        if (!t) return;
        ring.position.set(tiles(t.x), 0.05, tiles(t.y));
        ring.scale.setScalar(t.r * (1 + Math.sin(this.t * 6) * 0.05));
        ring.material.opacity = 0.55 + Math.sin(this.t * 6) * 0.15;
    }

    // ── the canvas and the pointer ──────────────────────────────────────────
    /** Keep this canvas exactly under the Phaser canvas (same box), at the device's pixel ratio. */
    private layout () {
        const r = this.host.canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, dprCap());
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

    worldToScreen (x: number, y: number): XY {
        this.proj.set(tiles(x), 0, tiles(y)).project(this.cam);
        return { x: (this.proj.x * 0.5 + 0.5) * VIEW_W, y: (-this.proj.y * 0.5 + 0.5) * VIEW_H };
    }

    dispose () {
        if (this.disposed) return;
        this.disposed = true;
        this.dropGhost();
        this.post.composer.dispose();
        this.post.rt.dispose();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        this.canvas.remove();
        const pc = this.host.canvas;
        pc.style.position = this.hostStyle.position;
        pc.style.zIndex = this.hostStyle.zIndex;
    }
}

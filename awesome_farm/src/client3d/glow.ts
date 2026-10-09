// Light in the dark, as the 2D NightLayer's light map has it: the same sources (lamps, lanterns, fires, working furnaces and coal
// generators, waystones and altars, glowing monsters, shots and creatures, Blight nests and raiders, the rift gates, and a little light every farmer carries),
// the same colours. The nearest ones get a real point light (LightPool); every one of them also lays a soft pool of light on the
// ground (one instanced mesh, as cheap for forty lamps as for four), and lamps keep a faint warm halo by day.
// Plus the evening hearth: in the dusk countdown, a dotted circle round each campfire, table and lamp shows where to sit, and a ring
// over the fire fills as company gathers (the 2D Ambience.drawHearth).

import { AdditiveBlending, BufferGeometry, CanvasTexture, CircleGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PointLight, Quaternion, RingGeometry, type Scene, Vector3 } from 'three';
import { RIFT_ISLANDS, TILE, TUNING } from '../shared/config';
import { BUILDINGS } from '../shared/data/buildings';
import { isHearthSpot } from '../shared/data/hearth';
import type { BuildE, Ent } from '../shared/sim/types';
import type { World } from '../shared/world';
import { EL } from './render';
import { WATER_Y } from './terrain';
import type { LightPool, LightSpot } from './weather';

/** The monsters and creatures that shine (the Game scene's LIGHT_MOBS and LIGHT_SPECIES). */
const LIGHT_MOBS = new Set(['wisp', 'wraith', 'oldheart', 'witch']);
const LIGHT_SPECIES = new Set(['glimmoth', 'aurorin', 'cinderkit', 'pyrelion']);

/** A light, in tiles: where (y is its height), its colour, how strong (0..1.4) and how far it reaches; `day`: it keeps a halo by day. */
export interface Glow extends LightSpot { day?: boolean; flicker?: number; /** a slow swell (radians a second): a Blight nest smouldering */ pulse?: number; /** what it moves with (a raider: followed every frame, and sunk with it into the sea) */ of?: { x: number; z: number; wade?: number }; y0?: number; /** the height of the ground its pool lies on */ gy?: number }

/** The colour a building's light has in 2D (ui/night.ts). */
export function lightColor (kind: string) {
    if (kind === 'campfire' || kind === 'furnace' || kind === 'coalgen') return 0xffb070;
    if (kind === 'waystone' || kind === 'altar') return 0xa8d8ff;
    if (kind === 'dock' || kind === 'riftforge') return 0xb48cff;
    if (kind === 'hatchery') return 0xffd6e4;
    return 0xffd890;
}

/** What one entity gives off, if anything (the 2D light map's rules, in tiles). */
export function glowOf (e: Ent, x: number, z: number): Glow | null {
    if (e.k === 'bld') {
        const d = BUILDINGS[e.kind];
        const glow = d.light ?? (e.kind === 'furnace' && (e.prog ?? 0) > 0 ? 36 : e.kind === 'coalgen' && (e.act ?? 0) > 0 ? 44 : 0);
        if (!glow) return null;
        const [w, h] = d.size;
        return {
            x: e.tx + w / 2, y: e.kind === 'lamppost' ? 2.3 : 1.1, z: e.ty + h / 2, color: lightColor(e.kind),
            power: Math.min(1.4, glow / 50), range: Math.min(12, 2.5 + glow / 11), day: true, flicker: e.kind === 'campfire' ? 1 : 0,
        };
    }
    if (e.k === 'node') return e.kind === 'nest' ? { x, y: 0.8, z, color: 0xff7080, power: 0.9, range: 4.5, pulse: 2.4 } : null;      // (a Blight nest smoulders)
    if (e.k === 'proj') return { x, y: 0.6, z, color: 0xc8e6ff, power: 0.7, range: 3 };
    if (e.k === 'mob' && e.rd && !LIGHT_MOBS.has(e.kind)) return { x, y: 0.8, z, color: 0xff8a96, power: 0.85, range: 2.6, day: true };      // (a raider carries the Blight's red glow: you see a raid coming in the dark)
    if (e.k === 'mob' && LIGHT_MOBS.has(e.kind)) return e.kind === 'oldheart' ? { x, y: 1.5, z, color: 0xff7080, power: 1.4, range: 9 } : { x, y: 1, z, color: 0xb8f0c0, power: 0.8, range: 4 };
    if (e.k === 'crit' && LIGHT_SPECIES.has(e.sp)) return { x, y: 0.8, z, color: e.sp === 'cinderkit' || e.sp === 'pyrelion' ? 0xffa060 : 0xe8f0ff, power: e.sp === 'aurorin' ? 1 : 0.7, range: e.sp === 'aurorin' ? 6 : 3.5 };
    return null;
}

/** A soft round spot (white in the middle, nothing at the rim), drawn once in code. */
let disc: CanvasTexture | null = null;
export function softDisc () {
    if (disc) return disc;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const cx = cv.getContext('2d')!;
    const g = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = g;
    cx.fillRect(0, 0, 64, 64);
    disc = new CanvasTexture(cv);
    return disc;
}

const MAX_POOLS = 64;

export class Glows {
    /** The light you carry (2D: everyone carries a little light; brighter at night, much brighter in the caves). */
    readonly carry = new PointLight(0xffe9c8, 0, 5, 1.4);
    private readonly pools: InstancedMesh;
    private readonly spots: Glow[] = [];
    private readonly m = new Matrix4();
    private readonly q = new Quaternion();
    private readonly p = new Vector3();
    private readonly s = new Vector3();
    private readonly c = new Color();
    private listT = 0;
    // the evening hearth
    private readonly hearth = new Group();
    private readonly rings = new Map<number, { dots: Mesh; fill: Mesh<RingGeometry, MeshBasicMaterial>; track: Mesh; flame: Mesh; glow: Mesh; shown: number; at: number }>();
    private readonly dotMat = new MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.4, depthWrite: false });
    private readonly glowMat = new MeshBasicMaterial({ color: 0xf8a24a, transparent: true, opacity: 0.15, depthWrite: false, blending: AdditiveBlending, map: null });

    constructor (scene: Scene, private readonly pool: LightPool) {
        this.carry.castShadow = false;
        scene.add(this.carry);
        const mat = new MeshBasicMaterial({ map: softDisc(), transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
        this.pools = new InstancedMesh(new CircleGeometry(1, 28).rotateX(-Math.PI / 2), mat, MAX_POOLS);
        this.pools.instanceMatrix.setUsage(DynamicDrawUsage);
        this.pools.frustumCulled = false;
        this.pools.renderOrder = 3;
        this.pools.count = 0;
        for (let i = 0; i < MAX_POOLS; i++) this.pools.setColorAt(i, this.c.set(0));
        scene.add(this.pools);
        this.hearth.renderOrder = 4;
        scene.add(this.hearth);
        this.glowMat.map = softDisc();
    }

    /**
     * Gather the lights round the camera (four times a second) and light them: `dark` 0..1 is how dark it is (night, the Dread
     * Reaches, the caves), `under` 0..1 how far into the caves you are, `me` where your farmer stands (tiles).
     */
    update (dt: number, t: number, views: Iterable<{ e: Ent; x: number; z: number }>, world: World | null, cam: { x: number; z: number }, dark: number, under: number, me: { x: number; z: number } | null) {
        this.listT -= dt;
        if (this.listT <= 0) {
            this.listT = 0.25;
            const spots = this.spots;
            spots.length = 0;
            for (const v of views) {
                const e = v.e;
                if (e.k !== 'bld' && e.k !== 'proj' && e.k !== 'mob' && e.k !== 'crit' && !(e.k === 'node' && e.kind === 'nest')) continue;
                const g = glowOf(e, v.x, v.z);
                if (!g || Math.abs(g.x - cam.x) > 30 || Math.abs(g.z - cam.z) > 24) continue;
                if (e.k === 'mob' && e.rd) { g.of = v; g.y0 = g.y; }
                spots.push(g);
            }
            // the rift gates glow all night
            if (world) for (let i = 0; i < RIFT_ISLANDS; i++) {
                const c = world.riftCenter(i), x = c.x / TILE, z = c.y / TILE;
                if (Math.abs(x - cam.x) < 30 && Math.abs(z - cam.z) < 24) spots.push({ x, y: 1.6, z, color: 0xb48cff, power: 1.2, range: 9 });
            }
            spots.sort((a, b) => Math.hypot(a.x - cam.x, a.z - cam.z) - Math.hypot(b.x - cam.x, b.z - cam.z));
        }
        // a raider's glow goes with it, down into the sea as it wades
        for (const g of this.spots) if (g.of) { const w = g.of.wade ?? 0; g.x = g.of.x; g.z = g.of.z; g.gy = 0.06 + WATER_Y * w; g.y = (g.y0 ?? 0.8) + WATER_Y * w; }
        this.pool.update(this.spots, cam.x, cam.z, dark, t);
        // the light you carry
        const carry = this.carry;
        const want = me ? Math.max(Math.min(0.9, dark * 1.3) * 1.6, under * 1.5) : 0;
        carry.intensity += (want - carry.intensity) * Math.min(1, dt * 4);
        carry.distance = 4.5 + under * 2.5;
        carry.color.setHex(0xffe9c8).lerp(this.c.setHex(0xd8dcff), under * 0.7);
        if (me) carry.position.set(me.x, 1.5, me.z + 0.2);
        // pools on the ground: strong at night, a faint warm halo round lamps by day
        let n = 0;
        const day = (1 - dark) * 0.16;
        for (const g of this.spots) {
            if (n >= MAX_POOLS) break;
            const k = Math.max(dark, g.day ? day : 0) * (1 - under * 0.45) * (g.flicker ? 0.92 + Math.sin(t * 9 + g.x * 3.1) * 0.08 : g.pulse ? 0.85 + Math.sin(t * g.pulse + g.x) * 0.15 : 1);
            if (k < 0.01) continue;
            const r = g.range * 0.75;
            this.p.set(g.x, g.gy ?? 0.06, g.z);
            this.s.set(r, 1, r);
            this.m.compose(this.p, this.q, this.s);
            this.pools.setMatrixAt(n, this.m);
            this.pools.setColorAt(n, this.c.set(g.color).multiplyScalar(k * Math.min(1, g.power) * 0.24));
            n++;
        }
        if (me && carry.intensity > 0.02 && n < MAX_POOLS) {
            const r = 2.2 + under * 2.2;
            this.p.set(me.x, 0.06, me.z);
            this.s.set(r, 1, r);
            this.m.compose(this.p, this.q, this.s);
            this.pools.setMatrixAt(n, this.m);
            this.pools.setColorAt(n, this.c.copy(carry.color).multiplyScalar(Math.min(0.9, carry.intensity * (0.12 - under * 0.04))));
            n++;
        }
        this.pools.count = n;
        this.pools.visible = n > 0;
        this.pools.instanceMatrix.needsUpdate = true;
        if (this.pools.instanceColor) this.pools.instanceColor.needsUpdate = true;
    }

    /**
     * The evening hearth (2D Ambience.drawHearth): `clock` the world clock, `night` whether night has fallen, `me` your farmer (tiles).
     * The dotted circle shows in the last minute of the day near you or while it fills; the ring over the fire fills with `hg`.
     */
    updateHearth (dt: number, t: number, views: Iterable<{ e: Ent }>, clock: { clock: number; night: boolean }, me: { x: number; z: number } | null) {
        const left = TUNING.dayLength - clock.clock, on = !clock.night && left > 0 && left <= TUNING.duskWarn[0];
        const seen = new Set<number>();
        if (on || this.rings.size) {
            for (const v of views) {
                const e = v.e;
                if (e.k !== 'bld' || !isHearthSpot(e.kind)) continue;
                const b = e as BuildE, [w, h] = BUILDINGS[b.kind].size, cx = b.tx + w / 2, cz = b.ty + h / 2;
                const want = b.hg ?? 0;
                // the circle shows near you (150 px in 2D) or while company gathers; the ring over the fire while it is kindled
                const near = !!me && Math.hypot(cx - me.x, cz - me.z) <= 9.5;
                let r = this.rings.get(b.id);
                if (!(on && (near || want > 0)) && want <= 0 && (r?.shown ?? 0) <= 0.001) continue;
                if (!r) r = this.makeRing(b.id);
                seen.add(b.id);
                r.shown += (want - r.shown) * Math.min(1, dt * 7);
                if (Math.abs(want - r.shown) < 0.004) r.shown = want;
                const full = r.shown >= 0.999, fill = r.shown;
                // the circle on the ground: where to sit (three tiles from the fire's edge)
                const rx = w / 2 + TUNING.hearthRadius / TILE, rz = h / 2 + TUNING.hearthRadius / TILE;
                r.dots.visible = on && (near || fill > 0);
                r.dots.position.set(cx, 0.05, cz);
                r.dots.scale.set(rx, rz, 1);
                (r.dots.material as MeshBasicMaterial).color.setHex(full ? 0xffd966 : 0xfff6e0);
                (r.dots.material as MeshBasicMaterial).opacity = full ? 0.75 : fill > 0 ? 0.45 + 0.4 * fill : 0.32;
                r.glow.visible = on && full;
                r.glow.position.set(cx, 0.04, cz);
                r.glow.scale.set(rx * 1.1, rz * 1.1, 1);
                // the ring over the fire, filling
                const ringOn = fill > 0.001;
                for (const m of [r.track, r.fill, r.flame]) { m.visible = ringOn; m.position.set(cx, 2.15, cz); }
                if (ringOn && Math.abs(fill - r.at) > 0.004) {
                    r.at = fill;
                    r.fill.geometry.dispose();
                    r.fill.geometry = new RingGeometry(0.22, 0.3, 32, 1, Math.PI / 2, -Math.PI * 2 * Math.max(0.02, fill));
                }
                r.fill.material.color.setHex(full ? 0xffd966 : 0xf8a24a);
                r.fill.scale.setScalar(full ? 1 + Math.sin(t * 6) * 0.06 : 1);
            }
        }
        for (const [id, r] of this.rings) if (!seen.has(id)) { for (const m of [r.dots, r.fill, r.track, r.flame, r.glow]) this.hearth.remove(m); r.fill.geometry.dispose(); (r.dots.material as MeshBasicMaterial).dispose(); r.fill.material.dispose(); this.rings.delete(id); }
    }

    private makeRing (id: number) {
        const dots = new Mesh(this.dashes(), this.dotMat.clone());
        dots.rotation.x = -Math.PI / 2;
        const glow = new Mesh(new CircleGeometry(1, 32), this.glowMat);
        glow.rotation.x = -Math.PI / 2;
        const face = -EL;
        const track = new Mesh(new RingGeometry(0.22, 0.3, 32), new MeshBasicMaterial({ color: 0x2a1d2c, transparent: true, opacity: 0.62, depthTest: false }));
        const fill = new Mesh(new RingGeometry(0.22, 0.3, 32), new MeshBasicMaterial({ color: 0xf8a24a, depthTest: false, transparent: true }));
        const flame = new Mesh(new CircleGeometry(0.1, 3, Math.PI / 2), new MeshBasicMaterial({ color: 0xf8a24a, depthTest: false, transparent: true }));
        for (const m of [track, fill, flame]) { m.rotation.x = face; m.renderOrder = 40; }
        for (const m of [dots, glow, track, fill, flame]) this.hearth.add(m);
        const r = { dots, fill, track, flame, glow, shown: 0, at: -1 };
        this.rings.set(id, r);
        return r;
    }

    /** The dotted circle: 18 dashes (every other slice of 36) of a thin ring, built once. */
    private dashed: BufferGeometry | null = null;
    private dashes () {
        if (this.dashed) return this.dashed;
        const parts: number[] = [], n = 36;
        for (let i = 0; i < n; i += 2) {
            const g = new RingGeometry(0.965, 1, 3, 1, (i / n) * Math.PI * 2, Math.PI * 2 / n).toNonIndexed();
            parts.push(...g.attributes.position.array);
            g.dispose();
        }
        this.dashed = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(parts, 3));
        return this.dashed;
    }

    dispose () {
        this.pools.removeFromParent();
        this.pools.geometry.dispose();
        this.hearth.removeFromParent();
        this.carry.removeFromParent();
    }
}

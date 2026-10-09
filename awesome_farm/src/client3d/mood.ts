// The world's mood in 3D, frame by frame: the 2D NightLayer and Ambience (ui/night.ts, world/ambience.ts) told in light instead of
// overlays. It reads the same pure functions (shared/weather.ts `weatherAt` and `nightEvent`, shared/season.ts, the world's
// caves and Dread plots) and sets the sky, the lights, the fog, the rain or snow, the seasons, the caves and the special nights.
//
//   the caves      under the world (y >= UNDER_Y) the sky, sea and weather go and the dark comes in, tinted by depth as in 2D
//                  (violet near the middle, teal further out, ember at the edge), with the light you carry as the one pool of light
//   Dread Reaches  dim and violet even at noon (the 2D layer darkens by 0.62 there), a violet veil of mist
//   weather        rain (snow in winter) with rings where it lands, fog banks on a foggy morning, a storm's lightning flash
//   seasons        the ground and the plants change colour (seasons.ts), leaves, petals or snow in the air, fireflies on summer nights
//   night          lamps, fires and glowing things light the dark (glow.ts); the Blood Moon reddens it, a Fairy Night turns it blue
//                  and sends lights drifting up, a Meteor Shower streaks the sky
//
// It only draws: nothing here changes the world.

import { Color, FogExp2, type Group, type Scene, type Vector3 } from 'three';
import { TUNING, UNDER_Y } from '../shared/config';
import { caveDepth } from '../shared/cave';
import { seasonOf } from '../shared/season';
import type { Ent } from '../shared/sim/types';
import { nightEvent, weatherAt } from '../shared/weather';
import type { World } from '../shared/world';
import { CloudShadows, Fireflies } from './ambient';
import { FogBanks, NightSky, Splashes } from './atmos';
import { CaveTerrain, glint } from './caves';
import { Glows } from './glow';
import { env } from './models/kit';
import { hourOf } from './render';
import { RiftGates } from './riftgates';
import { SeasonSpecks, stepSeason } from './seasons';
import { MOON, type Sky } from './sky';
import { type Sea, WATER_Y } from './terrain';
import type { LightPool, Rain } from './weather';

/** What the mood is handed every frame (tiles, except the clock). */
export interface MoodFrame {
    clock: { clock: number; day: number; nightLen: number };
    seed: string;
    /** Your farmer (tiles), or null while there is none. */
    me: { x: number; z: number } | null;
    /** Ambient life (cloud shadows, fireflies): off at the Low quality level (quality.ts). Left out: on. */
    ambient?: boolean;
}

/** The parts of the view the mood drives (made by the view, shared with the prototype page). */
export interface MoodParts {
    scene: Scene;
    sky: Sky;
    sea: Sea;
    rain: Rain;
    lamps: LightPool;
    clouds: CloudShadows;
    flies: Fireflies;
    /** The colour grade's uniforms (render.ts makePost). */
    grade: { uTint: { value: Color }; uSat: { value: number }; uExp: { value: number } };
    /** The surface terrain's group (hidden underground) and whether a tile is land (for where rain rings sit). */
    surface: () => Group | null;
    landAt: (tx: number, ty: number) => boolean;
}

const mixHex = (a: number, b: number, t: number) => {
    const c = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
    return (c(16) << 16) | (c(8) << 8) | c(0);
};
/** The caves' colour by depth, as the 2D light map has it: violet near the middle, teal further out, ember at the edge of the map. */
export const caveTone = (depth: number) => mixHex(mixHex(0x2e2c52, 0x24444e, Math.min(1, depth * 2)), 0x5a302c, Math.max(0, Math.min(1, depth * 2 - 1)));

export class Mood {
    readonly glows: Glows;
    private caves: CaveTerrain | null = null;
    private gates: RiftGates | null = null;
    private world: World | null = null;
    private readonly fog: FogBanks;
    private readonly splash: Splashes;
    private readonly specks: SeasonSpecks;
    private readonly nightSky: NightSky;
    /** How far into the caves (0..1) and the Dread Reaches (0..1) the camera is, eased as in 2D. */
    under = 0;
    dread = 0;
    /** 0..1: how dark it is for the lights (night, the Dread Reaches, the caves, heavy rain). */
    dark = 0;
    /** A storm's lightning flash (0..1), set by the view's `lightning` (the 2D night layer keeps the timer and the thunder). */
    bolt = 0;
    /** The rain falling on the ground now, 0..1 (none in winter, when it snows, and none underground): the ground gets wet (wet.ts). */
    wetRain = 0;
    private first = true;
    private readonly c1 = new Color();
    private readonly c2 = new Color();
    private readonly c3 = new Color();
    private readonly white = new Color(0xffffff);

    constructor (private readonly p: MoodParts) {
        this.glows = new Glows(p.scene, p.lamps);
        this.fog = new FogBanks(p.scene);
        this.splash = new Splashes(p.scene);
        this.specks = new SeasonSpecks(p.scene);
        this.nightSky = new NightSky(p.scene);
    }

    /** A world arrived: the caves are its own. */
    welcome (world: World) {
        this.caves?.dispose();
        this.gates?.dispose();
        this.world = world;
        this.caves = new CaveTerrain(world, this.p.scene);
        this.gates = new RiftGates(world, this.p.scene);
        this.first = true;
    }

    /** Is a tile underground? (The caves sit below the surface map in the same coordinates.) */
    private underAt (z: number) { return !!this.world && this.world.isUnder(Math.floor(z)); }

    frame (dt: number, t: number, f: MoodFrame, cam: Vector3, views: ReadonlyMap<number, { e: Ent; x: number; z: number }>) {
        const { sky, sea, rain, clouds, flies, grade, scene } = this.p;
        const world = this.world;
        const night = f.clock.clock >= TUNING.dayLength;
        const hour = hourOf(f.clock.clock, f.clock.nightLen);
        // where the camera is: the caves, the Dread Reaches (eased in and out as the 2D Ambience does)
        const underNow = this.underAt(cam.z);
        const ku = this.first ? 1 : Math.min(1, dt * 3.5);
        this.under += ((underNow ? 1 : 0) - this.under) * ku;
        if (Math.abs((underNow ? 1 : 0) - this.under) < 0.004) this.under = underNow ? 1 : 0;
        const meT = f.me ?? { x: cam.x, z: cam.z };
        const dreadNow = world?.plotAt(Math.floor(meT.x), Math.floor(meT.z))?.dread ? 1 : 0;
        this.dread += (dreadNow - this.dread) * (this.first ? 1 : Math.min(1, dt * (dreadNow ? 1.2 : 0.7)));
        if (Math.abs(dreadNow - this.dread) < 0.004) this.dread = dreadNow;
        const u = this.under, dr = this.dread * (1 - u);
        // the weather (none under the ground) and the season
        const w0 = weatherAt(f.seed, f.clock.day, f.clock.clock);
        const w = u > 0.5 ? { rain: 0, fog: 0, storm: false } : w0;
        const season = seasonOf(f.clock.day), winter = season === 'winter';
        stepSeason(season, dt, this.first);
        const event = night ? nightEvent(f.seed, f.clock.day) : null;
        // the sky, then the moods laid over it
        sky.apply(hour, winter ? w.rain * 0.85 : w.rain, cam);
        const nightK = sky.night;
        const tint = this.c1.copy(sky.tint);
        let exposure = sky.exposure, sat = sky.saturation;
        const fogC = (scene.fog as FogExp2).color, bg = scene.background as Color;
        // special nights
        if (event === 'bloodmoon') {
            sky.hemi.color.lerp(this.c2.setHex(0xb04a62), nightK * 0.45);
            sky.moon.color.setHex(0xff7a7a);
            tint.lerp(this.c2.setHex(0xffc4c8), nightK * 0.55);
            bg.lerp(this.c2.setHex(0x3a0e1c), nightK * 0.7);
        } else {
            sky.moon.color.setHex(MOON);
            if (event === 'fairies') { sky.hemi.color.lerp(this.c2.setHex(0x8a8af0), nightK * 0.5); tint.lerp(this.c2.setHex(0xe0d8ff), nightK * 0.5); }
        }
        // the Dread Reaches: dim and violet even at noon
        if (dr > 0) {
            const k = dr * 0.62;
            sky.sun.intensity *= 1 - k;
            sky.fill.intensity *= 1 - k * 0.7;
            sky.hemi.color.lerp(this.c2.setHex(0x7a5cb0), k);
            sky.hemi.groundColor.lerp(this.c2.setHex(0x2a2040), k);
            bg.lerp(this.c2.setHex(0x2e2448), k);
            fogC.lerp(this.c2.setHex(0x4a3d6e), k);
            tint.lerp(this.c2.setHex(0xd4c4ff), k);
            exposure *= 1 + k * 0.1;
        }
        // the caves: the sky goes black and the dark is tinted by depth
        if (u > 0) {
            const depth = caveDepth(Math.floor(meT.x), Math.floor(meT.z) - UNDER_Y);
            const tone = this.c2.setHex(caveTone(depth));
            sky.sun.intensity *= 1 - u;
            sky.moon.intensity *= 1 - u;
            sky.fill.intensity *= 1 - u;
            sky.hemi.color.lerp(this.c3.copy(tone).lerp(this.white, 0.5), u);
            sky.hemi.groundColor.lerp(tone, u);
            sky.hemi.intensity += (2.1 - sky.hemi.intensity) * u;
            bg.lerp(this.c2.setHex(0x0b0a10), u);
            tint.lerp(this.c2.setRGB(1, 1, 1), u);
            exposure += (1.15 - exposure) * u;
            sat += (1.05 - sat) * u;
            glint.value = 0.3 + depth * 0.25;
        }
        // a lightning flash lifts everything for a moment
        if (this.bolt > 0) { exposure *= 1 + this.bolt * 0.9; tint.lerp(this.c2.setHex(0xe8f0ff), this.bolt * 0.5); }
        grade.uTint.value.copy(tint);
        grade.uSat.value = sat;
        grade.uExp.value = exposure;
        // how dark it is for lamps and windows (the 2D light map: night, the Dread Reaches at 0.62, the caves at 0.9, rain a little)
        this.dark = Math.min(1, Math.max(nightK, dr * 0.62, u * 0.95) + w.rain * 0.25 * (1 - nightK));
        env.night = Math.max(nightK, dr * 0.62, u);
        env.sun = (1 - nightK) * (1 - u);
        env.wind = Math.min(1, 0.25 + w.rain * 0.6 + (w.storm ? 0.3 : 0));
        // fog: a haze (exponential, so the far side of the view goes first) and banks of mist
        const fogAmt = w.fog + dr * 0.55;
        (scene.fog as FogExp2).density = u > 0.5 ? 0 : w.fog * 0.0042 + dr * 0.0028 + w.rain * 0.0012;
        if (w.fog > 0) fogC.lerp(this.c2.setHex(0xdfe8f0), w.fog * (1 - nightK) * 0.7);
        this.fog.color.setHex(dr > w.fog ? 0xb4a4d4 : 0xeef4fa).lerp(this.c2.setHex(0x55607a), nightK * 0.7);
        this.fog.update(dt, cam.x, cam.z, fogAmt * (1 - u));
        // rain (snow in winter: the season's flakes thicken instead) and its rings
        rain.update(dt, cam.x, cam.z, winter ? 0 : w.rain, env.wind);
        this.wetRain = winter ? 0 : w.rain;
        if (!winter && w.rain > 0.05) this.splash.update(dt, cam.x, cam.z, w.rain, (x, z) => this.p.landAt(Math.floor(x), Math.floor(z)), WATER_Y);
        else this.splash.update(dt, cam.x, cam.z, 0, () => true, WATER_Y);
        this.specks.update(dt, cam.x, cam.z, season, 1 - u, winter ? w.rain : 0);
        // life in the air: cloud shadows by day, fireflies on summer nights (a few in spring and autumn)
        if (f.ambient !== false) {
            clouds.update(t, cam.x, cam.z, (1 - nightK) * (1 - u) * (1 - dr), w.rain);
            const fliesK = season === 'summer' ? 1 : season === 'winter' ? 0 : 0.35;
            flies.update(t, cam.x, cam.z, Math.max(0, nightK - 0.25) * (1 - w.rain) * (1 - u) * fliesK);
        } else { clouds.mesh.visible = false; flies.pts.visible = false; }
        this.nightSky.update(dt, cam.x, cam.z, event, nightK * (1 - u));
        // the sea and the surface go away underground; the caves come
        sea.mesh.visible = sea.abyss.visible = u < 0.98;
        sea.u.uSun.value = (1 - nightK) * (1 - w.rain * 0.7) * (1 - dr * 0.7);
        const surf = this.p.surface();
        if (surf) surf.visible = !underNow;
        this.caves?.update(cam.x, cam.z, underNow);
        this.gates?.update(t);
        // the lights
        this.glows.update(dt, t, views.values(), world, cam, this.dark, u, f.me);
        this.glows.updateHearth(dt, t, views.values(), { clock: f.clock.clock, night }, f.me);
        this.bolt = Math.max(0, this.bolt - dt * 4);
        this.first = false;
    }

    /** How many cave chunks are built (diagnostics). */
    get caveChunks () { return this.caves?.size ?? 0; }

    dispose () {
        this.caves?.dispose();
        this.gates?.dispose();
        this.glows.dispose();
    }
}


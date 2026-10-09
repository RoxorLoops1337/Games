// The night: a dark blue veil over the world with soft holes cut out where there is light
// (campfires, lanterns, waystones, altars, you, glowing monsters and projectiles). Plus
// the rain: streaks, splashes, a grey tint, and the odd flash of lightning.

import * as Phaser from 'phaser';
import { PAL } from '../../shared/palette';
import { RIFT_ISLANDS, TILE, TUNING } from '../../shared/config';
import { BUILDINGS } from '../../shared/data/buildings';
import { seasonOf, SEASONS, type SeasonId } from '../../shared/season';
import { nightEvent, weatherAt } from '../../shared/weather';
import type { GameScene } from '../scenes/Game';
import { playSfx } from '../juice/sfx';
import { H, W } from './kit';

interface Drop { x: number; y: number; v: number; len: number }
interface Flake { x: number; y: number; v: number; ph: number; k: number }

/** Multiply two colours (what the MULTIPLY blend does), so a season and the time of day can share one layer. */
function mul (a: number, b: number) {
    const c = (s: number) => Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255);
    return (c(16) << 16) | (c(8) << 8) | c(0);
}

/**
 * The colour of the sun: peach at sunrise, a clean warm white through the day, amber into the evening.
 * Night is handled by the light map, so this only covers the daylight hours.
 */
function sunTint (clock: number) {
    const p = Math.max(0, Math.min(1, clock / TUNING.dayLength));
    if (p < 0.2) return mix(0xffc9a0, 0xfffaf0, p / 0.2);
    if (p < 0.66) return 0xfffaf0;
    return mix(0xfffaf0, 0xffae72, (p - 0.66) / 0.34);
}

function mix (a: number, b: number, t: number) {
    const c = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
    return (c(16) << 16) | (c(8) << 8) | c(0);
}

/**
 * The light map is drawn at this fraction of the HUD's resolution. The pools of light are soft gradients, so 0.5 looks the
 * same; measured on a desktop (121 plots, night) it saved nothing (render 3.0–3.2 ms at 1, 3.2–3.6 at 0.5), so it stays at 1.
 * A phone, where fill rate is the limit, is the place to try 0.5.
 */
const LIGHT_RES = 1;

/**
 * A pool of little squares (motes, petals, snow, fireflies): one image each instead of a Graphics that replays hundreds of
 * fill commands every frame. `put` shows the next one; `done` hides the rest.
 */
class Specks {
    private imgs: Phaser.GameObjects.Image[] = [];
    private n = 0;

    constructor (scene: Phaser.Scene, count: number, depth: number) {
        for (let i = 0; i < count; i++) this.imgs.push(scene.add.image(0, 0, 'px', 0).setOrigin(0).setDepth(depth).setVisible(false));
    }

    put (x: number, y: number, w: number, h: number, tint: number, alpha: number) {
        const im = this.imgs[this.n++];
        if (!im) return;
        im.setPosition(x, y).setDisplaySize(w, h).setTint(tint).setAlpha(alpha).setVisible(true);
    }

    done () {
        for (let i = this.n; i < this.imgs.length; i++) if (this.imgs[i].visible) this.imgs[i].setVisible(false);
        this.n = 0;
    }
}

export class NightLayer {
    private rt: Phaser.GameObjects.RenderTexture;
    private brush: Phaser.GameObjects.Image;
    private rain: Phaser.GameObjects.Graphics;
    private sky: Phaser.GameObjects.Graphics;
    private skyDrawn = false;
    private rainDrawn = false;
    private tint: Phaser.GameObjects.Rectangle;
    private flash: Phaser.GameObjects.Rectangle;
    private fogRect: Phaser.GameObjects.Rectangle;
    private fogBlobs: Phaser.GameObjects.Image[] = [];
    private seasonRect: Phaser.GameObjects.Rectangle;
    private seasonI: Specks;
    private seasonHalo: Specks;
    private seasonColor = 0xffffff;
    private sunColor = 0xfffaf0;
    private vignette: Phaser.GameObjects.Image;
    private halos: Phaser.GameObjects.Image[] = [];
    private motes: Flake[] = [];
    private moteI: Specks;
    private moteHalo: Specks;
    private flakes: Flake[] = [];
    private drops: Drop[] = [];
    private splashes: { x: number; y: number; t: number }[] = [];
    private bolt = 0;
    private thunderIn = -1;
    private nextBolt = 6;
    private t = 0;
    /** Current weather for others to read (music, sim hints). */
    rainLevel = 0;
    /** The special night in progress (for the music). */
    event: ReturnType<typeof nightEvent> = null;
    private meteors: { x: number; y: number; t: number }[] = [];
    stormy = false;
    /** Drawn at all: the 3D view has its own sky, light and weather, so there only the numbers above are kept up. */
    private shown = true;

    constructor (scene: Phaser.Scene, private farm: GameScene) {
        this.rt = scene.add.renderTexture(0, 0, W * LIGHT_RES, H * LIGHT_RES).setOrigin(0).setScale(1 / LIGHT_RES).setDepth(0).setVisible(false).setBlendMode(Phaser.BlendModes.MULTIPLY);
        this.brush = new Phaser.GameObjects.Image(scene, 0, 0, 'light').setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD);
        scene.events.once('shutdown', () => this.brush.destroy());         // (it is on no display list, so nothing else would)
        // the season: a faint colour multiplied over the whole world, and things drifting through the air
        this.seasonRect = scene.add.rectangle(0, 0, W, H, 0xffffff).setOrigin(0).setDepth(0.05).setBlendMode(Phaser.BlendModes.MULTIPLY);
        this.seasonHalo = new Specks(scene, 18, 0.209);
        this.seasonI = new Specks(scene, 56, 0.21);
        for (let i = 0; i < 90; i++) this.flakes.push({ x: Math.random() * W, y: Math.random() * H, v: 0.6 + Math.random() * 0.8, ph: Math.random() * 6.28, k: Math.floor(Math.random() * 4) });
        this.tint = scene.add.rectangle(0, 0, W, H, 0x4a5a78).setOrigin(0).setAlpha(0).setDepth(0.1);
        // a soft warm vignette: the corners fall away a little, like the edge of an illustration
        if (!scene.textures.exists('vignette')) {
            const cv = document.createElement('canvas'); cv.width = 480; cv.height = 270;
            const cx = cv.getContext('2d')!;
            const g = cx.createRadialGradient(240, 135, 70, 240, 135, 300);
            g.addColorStop(0, 'rgba(42,29,44,0)'); g.addColorStop(0.55, 'rgba(42,29,44,0.05)'); g.addColorStop(1, 'rgba(42,29,44,0.5)');
            cx.fillStyle = g; cx.fillRect(0, 0, 480, 270);
            scene.textures.addCanvas('vignette', cv);
        }
        this.vignette = scene.add.image(0, 0, 'vignette').setOrigin(0).setDisplaySize(W, H).setDepth(0.22).setAlpha(0.7);
        // sunlit halos around lamps and fires by day, and motes of pollen drifting through the light
        for (let i = 0; i < 24; i++) this.halos.push(scene.add.image(0, 0, 'light', 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(0.04).setVisible(false));
        for (let i = 0; i < 26; i++) this.motes.push({ x: Math.random() * W, y: Math.random() * H, v: 0.5 + Math.random() * 0.8, ph: Math.random() * 6.28, k: 0 });
        this.moteHalo = new Specks(scene, 26, 0.214);
        this.moteI = new Specks(scene, 26, 0.215);
        this.rain = scene.add.graphics().setDepth(0.2);
        this.sky = scene.add.graphics().setDepth(0.25);
        this.flash = scene.add.rectangle(0, 0, W, H, 0xffffff).setOrigin(0).setAlpha(0).setDepth(0.3);
        this.fogRect = scene.add.rectangle(0, 0, W, H, 0xdfe8f0).setOrigin(0).setAlpha(0).setDepth(0.12);
        for (let i = 0; i < 7; i++) this.fogBlobs.push(scene.add.image(Math.random() * W, 80 + Math.random() * (H - 160), 'light', 0).setTint(0xeef4fa).setAlpha(0).setScale(5 + Math.random() * 4).setDepth(0.13));
        for (let i = 0; i < 160; i++) this.drops.push({ x: Math.random() * W, y: Math.random() * H, v: 520 + Math.random() * 260, len: 6 + Math.random() * 7 });
    }

    /** Hide everything this layer draws (the 3D view is on), or bring back what is always up (the rest shows itself as it is drawn). */
    private show (on: boolean) {
        this.shown = on;
        for (const o of [this.seasonRect, this.tint, this.vignette, this.flash, this.fogRect, this.rain, this.sky, ...this.fogBlobs]) o.setVisible(on);
        if (on) return;
        this.rt.setVisible(false);
        for (const h of this.halos) h.setVisible(false);
        this.seasonI.done(); this.seasonHalo.done(); this.moteI.done(); this.moteHalo.done();
    }

    /** Add a pool of light to the light map (it is multiplied over the world). */
    private light (x: number, y: number, radiusWorld: number, strength = 1, tint = 0xffe9c8) {
        const r = radiusWorld * 3;
        if (x < -r || x > W + r || y < -r || y > H + r) return;
        this.brush.setScale((r * 2 * LIGHT_RES) / this.brush.width);
        this.rt.draw(this.brush, x * LIGHT_RES, y * LIGHT_RES, strength, tint);
    }

    /** Warm halos around lamps, fires and working furnaces by day, so the light reads even in the sun. */
    private drawHalos (f: GameScene, night: number, rain: number) {
        const strength = (1 - night) * (1 - rain * 0.6) * 0.17;
        let n = 0;
        if (strength > 0.01) {
            for (const e of f.lightSources()) {
                if (e.k !== 'bld' || n >= this.halos.length) continue;
                const def = BUILDINGS[e.kind];
                const glow = e.kind === 'furnace' ? ((e.prog ?? 0) > 0 ? 26 : 0) : e.kind === 'coalgen' ? ((e.act ?? 0) > 0 ? 30 : 0) : def.light ? Math.min(34, def.light * 0.7) : 0;
                if (!glow) continue;
                const s = f.worldToScreen((e.tx + def.size[0] / 2) * TILE, (e.ty + def.size[1] / 2) * TILE - 6);
                if (s.x < -60 || s.x > W + 60 || s.y < -60 || s.y > H + 60) continue;
                const h = this.halos[n++];
                const flicker = e.kind === 'campfire' ? 0.9 + Math.sin(this.t * 9 + e.id) * 0.1 : 1;
                h.setVisible(true).setPosition(s.x, s.y).setScale((glow * 2.6 * flicker) / h.width).setTint(e.kind === 'waystone' || e.kind === 'altar' ? 0xbfe0ff : 0xffc27a).setAlpha(strength);
            }
        }
        for (let i = n; i < this.halos.length; i++) this.halos[i].setVisible(false);
    }

    /** Specks of pollen and dust drifting up through the daylight, twinkling as they cross the sun. */
    private drawMotes (dt: number, night: number, rain: number) {
        const vis = (1 - night * 1.4) * (1 - rain * 2);
        if (vis > 0.02) {
            for (const m of this.motes) {
                m.x += (Math.sin(this.t * 0.5 + m.ph) * 8 + 5) * m.v * dt;
                m.y -= (4 + Math.cos(this.t * 0.7 + m.ph * 2) * 3) * m.v * dt;
                if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; }
                if (m.x > W + 6) m.x = -4;
                const tw = 0.25 + 0.75 * Math.abs(Math.sin(this.t * 1.3 + m.ph * 3));
                this.moteI.put(Math.round(m.x), Math.round(m.y), 2, 2, 0xfff0b8, 0.55 * tw * vis);
                this.moteHalo.put(Math.round(m.x) - 1, Math.round(m.y) - 1, 4, 4, 0xfff0b8, 0.12 * tw * vis);
            }
        }
        this.moteI.done(); this.moteHalo.done();
    }

    /** Leaves in autumn, snow in winter, petals in spring, fireflies on summer evenings. */
    private drawSeason (dt: number, season: SeasonId, night: number, rain: number) {
        const g = this.seasonI, halo = this.seasonHalo;
        let n = 0;
        if (season === 'autumn') n = 30;
        else if (season === 'spring') n = 26;
        else if (season === 'winter') n = rain > 0.05 ? 0 : 56;
        else n = night > 0.15 ? Math.round(18 * Math.min(1, night * 1.5)) : 0;
        const leaf = [PAL.berry, PAL.pumpkin, PAL.gold, PAL.wood], petal = [PAL.blossom, PAL.snow, PAL.blossom, PAL.gold], snow = [PAL.snow, PAL.snow, PAL.foam, PAL.snow];
        for (let i = 0; i < n; i++) {
            const p = this.flakes[i];
            if (season === 'summer') {
                p.x += Math.sin(this.t * 0.7 + p.ph) * 14 * dt; p.y += Math.cos(this.t * 0.9 + p.ph * 2) * 10 * dt;
                const tw = 0.35 + 0.65 * Math.abs(Math.sin(this.t * 2 + p.ph * 3));
                g.put(Math.round(p.x), Math.round(p.y), 2, 2, 0xffe88a, tw);
                halo.put(Math.round(p.x) - 1, Math.round(p.y) - 1, 4, 4, 0xffe88a, tw * 0.25);
            } else {
                const fall = season === 'winter' ? 22 : season === 'autumn' ? 30 : 18;
                p.y += fall * p.v * dt;
                p.x += (Math.sin(this.t * (season === 'winter' ? 1.1 : 1.8) + p.ph) * 22 - (season === 'winter' ? 4 : 14)) * dt;
                const col = (season === 'autumn' ? leaf : season === 'spring' ? petal : snow)[p.k];
                const w = season === 'autumn' ? 3 + (Math.floor(this.t * 3 + p.ph) % 2) : 2;
                g.put(Math.round(p.x), Math.round(p.y), w, 2, col, season === 'winter' ? 0.9 : 0.85);
            }
            if (p.y > H + 4) { p.y = -4; p.x = Math.random() * W; }
            if (p.x < -6) p.x = W + 4;
            if (p.x > W + 8) p.x = -4;
        }
        g.done(); halo.done();
    }

    /** `world`: draw the night, the weather and the season over the world (2D). False (3D): only work out the weather and the night's event for the music. */
    update (dt: number, world = true) {
        this.t += dt;
        const f = this.farm;
        if (!world) {
            this.event = f.clock.night ? nightEvent(f.serverSeed(), f.clock.day) : null;
            const w = weatherAt(f.serverSeed(), f.clock.day, f.clock.clock);
            this.rainLevel = f.undergroundAmount() > 0.5 ? 0 : w.rain; this.stormy = w.storm;
            if (this.shown) this.show(false);
            return;
        }
        if (!this.shown) this.show(true);
        // the Dread Reaches are dim and violet even at noon
        const dreadA = f.dreadAmount();
        const underA = f.undergroundAmount();
        const night = Math.max(f.nightAmount(), dreadA * 0.62, underA * 0.9);
        const w0 = weatherAt(f.serverSeed(), f.clock.day, f.clock.clock);
        const w = underA > 0.5 ? { ...w0, rain: 0, fog: 0, storm: false } : w0;          // (no weather under the ground)
        this.event = f.clock.night ? nightEvent(f.serverSeed(), f.clock.day) : null;
        this.rainLevel = w.rain; this.stormy = w.storm;
        this.drawLightMap(night, w.rain, dreadA, underA);
        this.drawSky(dt);
        const season = seasonOf(f.clock.day);
        this.drawDaylight(dt, season, night, w.rain, underA);
        this.drawWeather(dt, w, season, dreadA);
    }

    /** The darkness, with pools of light cut out of it: a tinted fill, then a soft brush at everything that shines. */
    private drawLightMap (night: number, rain: number, dreadA: number, underA: number) {
        const f = this.farm;
        const dark = Math.min(1, night + rain * 0.25);
        if (dark < 0.012) { this.rt.setVisible(false); return; }
        this.rt.setVisible(true);
        // ambient light: white by day, a deep blue at night, greyer in the rain (the fill covers the whole map: no clear before it, that was a second full-screen pass)
        // the caves change colour with depth: violet near the middle, teal further out, ember at the edge of the map
        const dp = underA > 0 ? f.caveDepthHere() : 0;
        const caveTone = mix(mix(0x2e2c52, 0x24444e, Math.min(1, dp * 2)), 0x5a302c, Math.max(0, Math.min(1, dp * 2 - 1)));
        this.rt.fill(mix(mix(mix(0xffffff, 0xaab6cc, rain), this.event === 'bloodmoon' ? 0x5a1a30 : this.event === 'fairies' ? 0x3a3a7a : mix(0x2e3a66, 0x4a2c6e, dreadA), night), caveTone, underA), 1);
        // everyone carries a little light
        const me = f.playerPos;
        const s0 = f.worldToScreen(me.x, me.y - 6);
        this.light(s0.x, s0.y, 34 + (night > 0.3 ? 14 : 0) + underA * 30, Math.min(0.9, night * 1.3));
        for (const e of f.lightSources()) {
            if (e.k === 'bld') {
                const def = BUILDINGS[e.kind];
                const glow = def.light ?? (e.kind === 'furnace' && (e.prog ?? 0) > 0 ? 36 : e.kind === 'coalgen' && (e.act ?? 0) > 0 ? 44 : 0);
                if (!glow) continue;
                const s = f.worldToScreen((e.tx + def.size[0] / 2) * TILE, (e.ty + def.size[1] / 2) * TILE - 4);
                const flicker = e.kind === 'campfire' ? 0.92 + Math.sin(this.t * 9 + e.id) * 0.08 : 1;
                this.light(s.x, s.y, glow * 1.25 * flicker, 1, e.kind === 'campfire' || e.kind === 'furnace' ? 0xffd2a0 : e.kind === 'waystone' || e.kind === 'altar' ? 0xa8d8ff : e.kind === 'dock' || e.kind === 'riftforge' ? 0xb48cff : e.kind === 'hatchery' ? 0xffd6e4 : 0xffe9c8);
            } else if (e.k === 'proj') {
                const s = f.worldToScreen(e.x, e.y - 5);
                this.light(s.x, s.y, 18, 0.9, 0xc8e6ff);
            } else if (e.k === 'mob') {
                const s = f.worldToScreen(e.x, e.y - 8);
                this.light(s.x, s.y, e.kind === 'oldheart' ? 70 : 26, 0.9, e.kind === 'oldheart' ? 0xff7080 : 0xb8f0c0);
            } else if (e.k === 'node') {
                const s = f.worldToScreen((e.tx + 0.5) * TILE, (e.ty + 0.5) * TILE - 6);
                this.light(s.x, s.y, 40 + Math.sin(this.t * 2.4 + e.id) * 5, 0.9, 0xff7080);      // a Blight nest smoulders
            } else if (e.k === 'crit') {
                const s = f.worldToScreen(e.x, e.y - 8);
                this.light(s.x, s.y, e.sp === 'aurorin' ? 44 : 24, 0.85, e.sp === 'cinderkit' || e.sp === 'pyrelion' ? 0xffa060 : 0xe8f0ff);
            }
        }
        // the rift gates glow all night
        for (let i = 0; i < RIFT_ISLANDS; i++) {
            const c = f.world.riftCenter(i);
            const s = f.worldToScreen(c.x, c.y - 12);
            if (s.x > -120 && s.x < W + 120 && s.y > -120 && s.y < H + 120) this.light(s.x, s.y, 64 + Math.sin(this.t * 2 + i) * 4, 1, 0xb48cff);
        }
        this.rt.render();   // Phaser 4 queues texture commands until told to run them
    }

    /** Meteors streaking down and fairy lights drifting up on their nights. */
    private drawSky (dt: number) {
        if (this.event === 'meteors' && Math.random() < dt * 0.8) this.meteors.push({ x: Math.random() * W, y: -10, t: 0 });
        if (this.event === 'fairies' && Math.random() < dt * 4) this.meteors.push({ x: Math.random() * W, y: H * (0.3 + Math.random() * 0.6), t: -1 });
        if (this.meteors.length || this.skyDrawn) this.sky.clear();         // (a clear only when there is, or was, something to wipe)
        this.skyDrawn = this.meteors.length > 0;
        for (let i = this.meteors.length - 1; i >= 0; i--) {
            const m = this.meteors[i];
            if (m.t < 0) {                                    // a drifting fairy light
                m.t -= dt; m.y -= 14 * dt; m.x += Math.sin(m.t * 3) * 10 * dt;
                this.sky.fillStyle(0xf8c8ee, Math.max(0, 0.9 - (-m.t - 1) / 3)).fillRect(Math.round(m.x), Math.round(m.y), 2, 2);
                if (-m.t > 4) this.meteors.splice(i, 1);
            } else {
                m.t += dt; m.x += 260 * dt; m.y += 420 * dt;
                this.sky.lineStyle(2, 0xffe8a0, 1).lineBetween(m.x, m.y, m.x - 34, m.y - 56);
                this.sky.lineStyle(1, 0xffffff, 1).lineBetween(m.x, m.y, m.x - 14, m.y - 22);
                if (m.y > H + 20) this.meteors.splice(i, 1);
            }
        }
    }

    /** The daylight: the season's tint multiplied with the sun's colour, the vignette, and (above ground) halos, motes and the season's specks. */
    private drawDaylight (dt: number, season: SeasonId, night: number, rain: number, underA: number) {
        const f = this.farm;
        this.seasonColor = mix(this.seasonColor, SEASONS[season].tint, Math.min(1, dt * 0.7));
        this.sunColor = mix(this.sunColor, sunTint(f.clock.clock), Math.min(1, dt * 1.5));
        this.seasonRect.setFillStyle(mix(mul(this.seasonColor, this.sunColor), 0xffffff, underA), 1);
        this.vignette.setAlpha(0.62 + night * 0.3 + rain * 0.12);
        if (underA < 0.5) {
            this.drawHalos(f, night, rain);
            this.drawMotes(dt, night, rain);
            this.drawSeason(dt, season, night, rain);
        } else { this.seasonI.done(); this.seasonHalo.done(); this.moteI.done(); this.moteHalo.done(); for (const h of this.halos) h.setVisible(false); }
    }

    /** Fog, rain (snow in winter) with its splashes, and the lightning of a storm. */
    private drawWeather (dt: number, w: { rain: number; fog: number; storm: boolean }, season: SeasonId, dreadA: number) {
        this.fogRect.setAlpha(w.fog * 0.2 + dreadA * 0.1);
        this.fogBlobs.forEach((b, i) => {
            b.setAlpha(w.fog * 0.13 + dreadA * 0.09);
            b.x += (6 + i * 2) * dt;
            if (b.x > W + 260) b.x = -260;
        });
        // ── rain (snow in winter) ──
        const g = this.rain;
        const rl = w.rain;
        if (rl > 0.02 || this.rainDrawn) g.clear();
        this.rainDrawn = rl > 0.02;
        this.tint.setAlpha(rl * 0.16);
        if (rl > 0.02 && season === 'winter') {
            const n = Math.floor(this.drops.length * rl);
            g.fillStyle(0xffffff, 0.9);
            for (let i = 0; i < n; i++) {
                const d = this.drops[i];
                d.y += d.v * 0.11 * dt; d.x += Math.sin(this.t * 1.6 + i) * 18 * dt - 6 * dt;
                if (d.y > H) { d.y = -6; d.x = Math.random() * (W + 60); }
                g.fillRect(Math.round(d.x), Math.round(d.y), 2, 2);
            }
        } else if (rl > 0.02) {
            const n = Math.floor(this.drops.length * rl);
            g.lineStyle(1, 0xc3d6f0, 0.55);
            for (let i = 0; i < n; i++) {
                const d = this.drops[i];
                d.y += d.v * dt; d.x -= d.v * 0.18 * dt;
                if (d.y > H) {
                    if (Math.random() < 0.35 && this.splashes.length < 40) this.splashes.push({ x: d.x, y: H - Math.random() * 80 - 20, t: 0 });
                    d.y = -10; d.x = Math.random() * (W + 120);
                }
                g.lineBetween(Math.round(d.x), Math.round(d.y), Math.round(d.x + d.len * 0.18), Math.round(d.y + d.len));
            }
            for (let i = this.splashes.length - 1; i >= 0; i--) {
                const sp = this.splashes[i];
                sp.t += dt;
                if (sp.t > 0.3) { this.splashes.splice(i, 1); continue; }
                g.lineStyle(1, 0xc3d6f0, 0.5 * (1 - sp.t / 0.3)).strokeEllipse(sp.x, sp.y, 4 + sp.t * 22, 2 + sp.t * 9);
            }
        } else this.splashes.length = 0;
        // ── lightning ──
        if (w.storm) {
            this.nextBolt -= dt;
            if (this.nextBolt <= 0) { this.nextBolt = 5 + Math.random() * 11; this.bolt = 0.22; this.thunderIn = 0.4 + Math.random() * 1.2; }
        }
        if (this.bolt > 0) { this.bolt -= dt; this.flash.setAlpha(Math.max(0, this.bolt / 0.22) * (Math.random() < 0.4 ? 0.5 : 0.28)); } else this.flash.setAlpha(0);
        if (this.thunderIn > 0) { this.thunderIn -= dt; if (this.thunderIn <= 0) playSfx('thunder'); }
    }
}

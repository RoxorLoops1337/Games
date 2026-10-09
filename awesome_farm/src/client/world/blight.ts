// The Blight in the world view: a nest throbs (bigger and darker the higher its level), wears a name plate with its level and a health
// bar once it is hurt; a wall, doorway or tower a raider has hurt shows a small health bar; a raider in the sea wades (sunk to the waist,
// with ripples and splashes); and the towers' shots fly (an arrow, a ballista bolt, a Tesla's jagged zap). Game.ts calls `nest`,
// `defense` and `wade` for the views on screen every frame, `draw` once after them, and `shot` for each tower event.

import * as Phaser from 'phaser';
import { TILE } from '../../shared/config';
import { BUILDINGS } from '../../shared/data/buildings';
import { NEST_KINDS } from '../../shared/data/mobs';
import { PAL } from '../../shared/palette';
import type { BuildE, MobE, NodeE, Plot, SimEvent } from '../../shared/sim/types';
import type { World } from '../../shared/world';
import { ARC, MAX_ARC, ZAP_LINGER, flightTime } from '../../shared/data/shotfx';
import { levelOf, pending, towerType } from '../../shared/data/towerperks';
import { maxHp } from '../../shared/sim/defense';
import { overlay3d } from './view3d-bridge';

type Img = Phaser.GameObjects.Image;
type Txt = Phaser.GameObjects.Text;
interface ViewLike { x: number; y: number; sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite; shadow?: Img }

/** How high (tiles) a tower's shot flies in the 3D view: between the tower's top and the monster's middle. */
export const SHOT_LIFT = 1;

/** How big a nest is drawn at a level (it grows, then levels off). */
export const nestScale = (lv: number) => Math.min(1.9, 0.85 + 0.09 * (Math.max(1, lv) - 1));

/** The five-pointed star's outline. */
function star (cx: number, cy: number, r: number): unknown[] {
    const pts: unknown[] = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r * 0.45 : r; pts.push({ x: cx + Math.cos(a) * k, y: cy + Math.sin(a) * k }); }
    return pts;
}

export class BlightFx {
    private g: Phaser.GameObjects.Graphics;
    /** The wading ripples: 2D only (unmarked, so the 3D view, which draws its own foam on the water in client3d/wade.ts, leaves them out). */
    private wg: Phaser.GameObjects.Graphics;
    private splash: Phaser.GameObjects.Particles.ParticleEmitter;
    /** The short fading trail behind a flying arrow or bolt. */
    private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
    private trail: Phaser.GameObjects.Particles.ParticleEmitter;
    private fireTrail: Phaser.GameObjects.Particles.ParticleEmitter;
    private frostTrail: Phaser.GameObjects.Particles.ParticleEmitter;
    private plates = new Map<number, Txt>();
    private seen = new Set<number>();
    private bars: { x: number; y: number; w: number; f: number }[] = [];
    /** The shots in the air and the light each throws at night (read by the night layer: ui/night.ts). */
    readonly lights = new Set<{ x: number; y: number; r: number; c: number }>();
    private badges = new Map<number, Txt>();
    private seenB = new Set<number>();
    private levels = new Map<number, number>();
    private stars: { x: number; y: number }[] = [];
    private rings: { x: number; y: number; r: number }[] = [];

    constructor (private scene: Phaser.Scene, private world: () => World) {
        this.g = overlay3d(scene.add.graphics().setDepth(9e4));          // (the bars and the nest rings are world overlays: the 3D view shows them too)
        this.wg = scene.add.graphics().setDepth(9e4);
        this.splash = scene.add.particles(0, 0, 'px', {
            emitting: false, speed: { min: 8, max: 26 }, angle: { min: 200, max: 340 }, lifespan: { min: 240, max: 420 },
            scale: { start: 1, end: 0 }, alpha: { start: 0.9, end: 0 }, gravityY: 90, tint: [PAL.foam, PAL.sea, PAL.snow],
        }).setDepth(9e4);
        this.sparks = overlay3d(scene.add.particles(0, 0, 'px', {
            emitting: false, speed: { min: 20, max: 60 }, lifespan: { min: 200, max: 380 }, scale: { start: 1.6, end: 0 }, alpha: { start: 1, end: 0 }, tint: [PAL.gold, PAL.cream, PAL.snow, PAL.plum],
        }).setDepth(8e4), SHOT_LIFT);
        const mkTrail = (tint: number[], scale = 3, up = 0) => overlay3d(scene.add.particles(0, 0, 'px', {
            emitting: false, speed: 0, lifespan: 380, scale: { start: scale, end: 0 }, alpha: { start: 0.95, end: 0 }, tint, blendMode: 'ADD', ...(up ? { gravityY: -up } : {}),
        }).setDepth(8e4 - 1), SHOT_LIFT);
        this.fireTrail = mkTrail([PAL.pumpkin, PAL.gold, PAL.berry], 3.4, 40);
        this.frostTrail = mkTrail([PAL.foam, PAL.sea, PAL.snow], 3);
        this.trail = overlay3d(scene.add.particles(0, 0, 'px', {
            emitting: false, speed: 0, lifespan: 340, scale: { start: 3, end: 0 }, alpha: { start: 0.9, end: 0 }, tint: [PAL.gold, PAL.cream, PAL.snow], blendMode: 'ADD',
        }).setDepth(8e4 - 1), SHOT_LIFT);
    }

    destroy () { this.g.destroy(); this.wg.destroy(); this.splash.destroy(); this.sparks.destroy(); this.trail.destroy(); this.fireTrail.destroy(); this.frostTrail.destroy(); for (const t of this.badges.values()) t.destroy(); this.badges.clear(); for (const t of this.plates.values()) t.destroy(); this.plates.clear(); }

    forget (id: number) { this.plates.get(id)?.destroy(); this.plates.delete(id); this.badges.get(id)?.destroy(); this.badges.delete(id); this.levels.delete(id); }

    /** A nest on screen: throb, grow with its level, and wear its plate (and its health bar once hurt). */
    nest (v: ViewLike, e: NodeE, plot: Plot | undefined, now: number) {
        const lv = Math.max(1, plot?.nl ?? 1), t = now / 1000;
        const beat = Math.max(0, Math.sin(t * (2.2 + lv * 0.05) + e.id));
        const s = nestScale(lv);
        const spr = v.sprite as Phaser.GameObjects.Sprite;
        spr.setScale(s * (1 + beat * 0.05), s * (1 - beat * 0.03));
        if (spr.setFrame) spr.setFrame(beat > 0.6 ? 1 : 0);
        const dark = Math.min(0.3, (lv - 1) * 0.03);
        spr.setTint(Phaser.Display.Color.GetColor(255 - dark * 140, 255 - dark * 160, 255 - dark * 120));
        v.shadow?.setScale(s * 2.2, 1.2);
        this.seen.add(e.id);
        const top = v.y - spr.displayHeight;
        let plate = this.plates.get(e.id);
        const words = `${plot?.nk ? NEST_KINDS[plot.nk].name : 'Blight Nest'}  Lv ${lv}`;
        if (!plate) {
            plate = overlay3d(this.scene.add.text(0, 0, words, { fontFamily: 'Pixelify Sans', fontSize: '20px', color: '#ffc0c8', stroke: '#2a1d2c', strokeThickness: 4 })
                .setResolution(2).setScale(0.25).setOrigin(0.5, 1).setDepth(9e4));
            this.plates.set(e.id, plate);
        } else if (plate.text !== words) plate.setText(words);
        const mhp = e.mhp ?? e.hp, hurt = e.hp < mhp;
        plate.setVisible(true).setPosition(Math.round(v.x), Math.round(top - (hurt ? 6 : 2)));
        if (hurt) this.bars.push({ x: v.x, y: top - 4, w: 30, f: e.hp / mhp });
        // the blight seeps: a dark ring that breathes on the ground round it
        this.rings.push({ x: v.x, y: v.y - 2, r: 14 * s + beat * 2 });
    }

    /** A defense piece a raider has hurt: a small health bar over it until it mends at dawn. */
    defense (v: ViewLike, b: BuildE) {
        const [w, h] = BUILDINGS[b.kind].size;
        const top = v.y - Math.max(h * TILE, v.sprite.displayHeight);
        const max = maxHp(b);
        if (max && b.hp !== undefined && b.hp < max) this.bars.push({ x: (b.tx + w / 2) * TILE, y: top - 3, w: 14, f: b.hp / max });
        if (towerType(b.kind)) this.badge(v, b, top);
    }

    /** A tower's level badge, a pulsing star while a pick waits, and a burst when it levels up. */
    private badge (v: ViewLike, b: BuildE, top: number) {
        const lv = levelOf(b.xp), cx = Math.round(v.x);
        this.seenB.add(b.id);
        const was = this.levels.get(b.id);
        this.levels.set(b.id, lv);
        if (was !== undefined && lv > was) this.sparks.explode(18, cx, top + 6);
        if (lv <= 1 && b.kind === 'spike') { this.badges.get(b.id)?.setVisible(false); return; }
        let t = this.badges.get(b.id);
        if (!t) {
            t = overlay3d(this.scene.add.text(0, 0, '', { fontFamily: 'Pixelify Sans', fontSize: '16px', color: '#fff6e0', stroke: '#2a1d2c', strokeThickness: 4 })
                .setResolution(2).setScale(0.3).setOrigin(0.5, 1).setDepth(9e4));
            this.badges.set(b.id, t);
        }
        const words = `Lv ${lv}`;
        if (t.text !== words) t.setText(words);
        t.setColor(pending(b) > 0 ? '#ffd966' : '#fff6e0').setVisible(true).setPosition(cx, Math.round(top - 3));
        if (pending(b) > 0) this.stars.push({ x: cx, y: top - 14 });
    }

    /** A raider (or anything) standing in the sea wades: sunk to the waist, with ripples and the odd splash. */
    wade (v: ViewLike, e: MobE, dt: number, flies: boolean) {
        const spr = v.sprite as Phaser.GameObjects.Sprite;
        const wet = !flies && !this.world().isLand(Math.floor(v.x / TILE), Math.floor(v.y / TILE));
        if (!wet) { if (spr.isCropped) spr.setCrop(); v.shadow?.setVisible(true); return; }
        const fh = spr.frame.realHeight, fw = spr.frame.realWidth;
        spr.setCrop(0, 0, fw, fh * 0.68);
        spr.y += 3;
        v.shadow?.setVisible(false);
        this.rings.push({ x: v.x, y: v.y - 1, r: -(6 + Math.sin(performance.now() / 160 + e.id) * 1.5) });
        if (Math.hypot(e.vx, e.vy) > 3 && Math.random() < dt * 6) this.splash.explode(2, v.x + (Math.random() - 0.5) * 6, v.y - 1);
    }

    /**
     * A tower fired. The arrow or bolt arcs through the air for a third to two thirds of a second (data/shotfx.ts), turning with its
     * path, leaving a short trail, with a flash at the tower and a spark where it lands; a Tesla zap is brief but glows for 0.3 s.
     * All of it is a world overlay lifted to about a tower's shoulder, so the 3D view shows it too.
     */
    shot (e: Extract<SimEvent, { e: 'shot' }>) {
        const s = this.scene;
        const flash = (x: number, y: number, r: number, col: number) => {
            const c = overlay3d(s.add.circle(x, y, r, col, 0.9).setDepth(8e4), SHOT_LIFT);
            s.tweens.add({ targets: c, scale: 2, alpha: 0, duration: 180, onComplete: () => c.destroy() });
        };
        if (e.k === 'zap') {
            const g = overlay3d(s.add.graphics().setDepth(8e4), SHOT_LIFT);
            let fx = e.x, fy = e.y;
            flash(e.x, e.y, 5, PAL.foam);
            for (const [tx, ty] of e.to) {
                const pts: [number, number][] = [[fx, fy]];
                for (let i = 1; i < 5; i++) pts.push([fx + ((tx - fx) * i) / 5 + (Math.random() - 0.5) * 7, fy + ((ty - fy) * i) / 5 + (Math.random() - 0.5) * 7]);
                pts.push([tx, ty]);
                for (const [col, wdt, al] of [[PAL.plum, 7, 0.28], [PAL.plum, 3, 0.95], [PAL.foam, 1.5, 1]] as const) {
                    g.lineStyle(wdt, col, al);
                    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
                    for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
                    g.strokePath();
                }
                this.sparks.explode(5, tx, ty);
                flash(tx, ty, 4, PAL.plum);
                fx = tx; fy = ty;
            }
            s.tweens.add({ targets: g, alpha: 0, duration: ZAP_LINGER * 1000, onComplete: () => g.destroy() });
            return;
        }
        const [tx, ty] = e.to[0] ?? [e.x, e.y];
        const d = Math.hypot(tx - e.x, ty - e.y);
        const bolt = e.k === 'bolt';
        const arc = Math.min(MAX_ARC, d * ARC[e.k]);
        const img = overlay3d(s.add.image(e.x, e.y, bolt ? 'proj_bolt' : 'proj_arrow', 0).setDepth(8e4).setScale(bolt ? 3.6 : 3), SHOT_LIFT);
        if (e.fx === 'fire') img.setTint(PAL.pumpkin);
        else if (e.fx === 'frost') img.setTint(PAL.sea);
        else if (bolt) img.setTint(PAL.pebble);
        if (e.big) img.setScale(img.scaleX * 1.5);
        const trail = e.fx === 'fire' ? this.fireTrail : e.fx === 'frost' ? this.frostTrail : this.trail;
        flash(e.x, e.y, bolt ? 6 : 4, e.fx === 'fire' ? PAL.berry : e.fx === 'frost' ? PAL.foam : bolt ? PAL.pumpkin : PAL.gold);
        const pos = (t: number) => ({ x: e.x + (tx - e.x) * t, y: e.y + (ty - e.y) * t - Math.sin(Math.PI * t) * arc });
        const t0 = this.scene.time.now, dur = flightTime(e.k, d) * 1000;
        const lamp = { x: e.x, y: e.y, r: bolt ? 30 : 24, c: e.fx === 'fire' ? 0xff8a40 : e.fx === 'frost' ? 0xa8d8ff : 0xffe9c8 };
        this.lights.add(lamp);
        const step = () => {
            const t = Math.min(1, (this.scene.time.now - t0) / dur), p = pos(t), q = pos(Math.min(1, t + 0.02));
            img.setPosition(p.x, p.y).setRotation(Math.atan2(q.y - p.y, q.x - p.x));
            lamp.x = p.x; lamp.y = p.y;
            trail.explode(e.fx ? 2 : 1, p.x, p.y);
            if (t >= 1) {
                this.scene.events.off('update', step);
                img.destroy();
                this.lights.delete(lamp);
                this.sparks.explode(bolt ? 8 : 4, tx, ty);
                flash(tx, ty, bolt ? 6 : 4, PAL.cream);
            }
        };
        this.scene.events.on('update', step);
        step();
    }

    draw () {
        const g = this.g, wg = this.wg;
        g.clear();
        wg.clear();
        for (const r of this.rings) {
            if (r.r > 0) { g.fillStyle(PAL.night, 0.22).fillEllipse(r.x, r.y, r.r * 2.2, r.r * 0.9); g.lineStyle(1, PAL.berry, 0.35).strokeEllipse(r.x, r.y, r.r * 2.2, r.r * 0.9); }
            else { const k = -r.r; wg.lineStyle(1, PAL.foam, 0.75).strokeEllipse(r.x, r.y, k * 2.2, k * 0.8); wg.lineStyle(1, PAL.snow, 0.4).strokeEllipse(r.x, r.y, k * 1.4, k * 0.5); }
        }
        for (const b of this.bars) {
            const x = Math.round(b.x - b.w / 2), y = Math.round(b.y), f = Math.max(0, Math.min(1, b.f));
            g.fillStyle(PAL.ink, 0.9).fillRect(x - 1, y - 1, b.w + 2, 4);
            g.fillStyle(PAL.night, 1).fillRect(x, y, b.w, 2);
            g.fillStyle(f > 0.5 ? PAL.lime : f > 0.25 ? PAL.gold : PAL.berry, 1).fillRect(x, y, Math.max(1, Math.round(b.w * f)), 2);
        }
        const now = performance.now() / 1000;
        for (const s of this.stars) {
            // a gold star that bobs and pulses over a tower with a pick waiting
            const pulse = 0.5 + 0.5 * Math.sin(now * 4 + s.x), y = s.y - 2 - pulse * 2, r = 4 + pulse * 1.5;
            g.fillStyle(PAL.gold, 0.08 + 0.12 * pulse).fillCircle(s.x, y, r * 1.6);
            g.fillStyle(PAL.ink, 1).fillPoints(star(s.x, y, r + 1.2) as Phaser.Math.Vector2[], true);
            g.fillStyle(pulse > 0.5 ? PAL.snow : PAL.gold, 1).fillPoints(star(s.x, y, r) as Phaser.Math.Vector2[], true);
        }
        for (const [id, t] of this.badges) if (!this.seenB.has(id)) t.setVisible(false);
        this.seenB.clear();
        this.stars.length = 0;
        for (const [id, t] of this.plates) if (!this.seen.has(id)) t.setVisible(false);
        this.seen.clear();
        this.bars.length = 0;
        this.rings.length = 0;
    }
}

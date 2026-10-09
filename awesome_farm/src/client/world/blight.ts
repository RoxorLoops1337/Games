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
import { ZAP_LINGER, flightTime } from '../../shared/data/shotfx';
import { aimOf, dir8, noteShot } from '../../shared/data/aim';
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
    private bows = new Map<number, { im: Phaser.GameObjects.Image; cur: number; at: number }>();
    private seenBow = new Set<number>();
    private zapSparks: Phaser.GameObjects.Particles.ParticleEmitter;
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
        this.zapSparks = overlay3d(scene.add.particles(0, 0, 'px', {
            emitting: false, speed: { min: 25, max: 85 }, lifespan: { min: 180, max: 360 }, scale: { start: 1.8, end: 0 }, alpha: { start: 1, end: 0 }, gravityY: 60, tint: [0xffffff, 0xcfe8ff, 0x8fe7ff], blendMode: 'ADD',
        }).setDepth(8e4), SHOT_LIFT);
        this.fireTrail = mkTrail([PAL.pumpkin, PAL.gold, PAL.berry], 3.4, 40);
        this.frostTrail = mkTrail([PAL.foam, PAL.sea, PAL.snow], 3);
        this.trail = overlay3d(scene.add.particles(0, 0, 'px', {
            emitting: false, speed: 0, lifespan: 340, scale: { start: 3, end: 0 }, alpha: { start: 0.9, end: 0 }, tint: [PAL.gold, PAL.cream, PAL.snow], blendMode: 'ADD',
        }).setDepth(8e4 - 1), SHOT_LIFT);
    }

    destroy () { this.g.destroy(); this.wg.destroy(); this.splash.destroy(); this.sparks.destroy(); this.trail.destroy(); this.fireTrail.destroy(); this.zapSparks.destroy(); for (const o of this.bows.values()) o.im.destroy(); this.bows.clear(); this.frostTrail.destroy(); for (const t of this.badges.values()) t.destroy(); this.badges.clear(); for (const t of this.plates.values()) t.destroy(); this.plates.clear(); }

    forget (id: number) { this.plates.get(id)?.destroy(); this.plates.delete(id); this.badges.get(id)?.destroy(); this.badges.delete(id); this.bows.get(id)?.im.destroy(); this.bows.delete(id); this.levels.delete(id); }

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
        const type = towerType(b.kind);
        if (type && type !== 'spike') this.badge(v, b, top);          // (a trap on the floor wears no badge or star: its level lives in its window)
        if (b.kind === 'ballista') this.aim(v, b);
    }

    /** The Ballista's bow turns toward its last target, a step at a time round the eight directions (data/aim.ts says where it last shot). */
    private aim (v: ViewLike, b: BuildE) {
        let o = this.bows.get(b.id);
        if (!o) {
            o = { im: this.scene.add.image(0, 0, 'ballista_bow', 0).setOrigin(0.5, 0.5), cur: dir8(aimOf(b.tx, b.ty)), at: 0 };
            this.bows.set(b.id, o);
        }
        const want = dir8(aimOf(b.tx, b.ty)), now = performance.now();
        if (o.cur !== want && now - o.at > 45) {
            const d = ((want - o.cur + 12) % 8) - 4;          // (the short way round: -4..3 steps)
            o.cur = (o.cur + (d > 0 ? 1 : -1) + 8) % 8;
            o.at = now;
        }
        o.im.setFrame(o.cur).setPosition(Math.round(v.x), Math.round(v.y - 13)).setDepth(v.sprite.depth + 0.01).setVisible(true);
        this.seenBow.add(b.id);
    }

    /** A tower's level badge, a pulsing star while a pick waits, and a burst when it levels up. */
    private badge (v: ViewLike, b: BuildE, top: number) {
        const lv = levelOf(b.xp), cx = Math.round(v.x);
        this.seenB.add(b.id);
        const was = this.levels.get(b.id);
        this.levels.set(b.id, lv);
        if (was !== undefined && lv > was) this.sparks.explode(18, cx, top + 6);
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
        const [ax, ay] = e.to[0] ?? [e.x + 1, e.y];
        noteShot(Math.floor(e.x / TILE), Math.floor((e.y + 10) / TILE), Math.atan2(ay - e.y, ax - e.x), performance.now());       // (the Ballista turns to it, the Tesla Coil's orb swells: data/aim.ts)
        const flash = (x: number, y: number, r: number, col: number) => {
            const c = overlay3d(s.add.circle(x, y, r, col, 0.9).setDepth(8e4), SHOT_LIFT);
            s.tweens.add({ targets: c, scale: 2, alpha: 0, duration: 180, onComplete: () => c.destroy() });
        };
        if (e.k === 'zap') { this.zap(e); return; }
        const [tx, ty] = e.to[0] ?? [e.x, e.y];
        const d = Math.hypot(tx - e.x, ty - e.y);
        const bolt = e.k === 'bolt';
        const trail = e.fx === 'fire' ? this.fireTrail : e.fx === 'frost' ? this.frostTrail : this.trail;
        flash(e.x, e.y, bolt ? 6 : 4, e.fx === 'fire' ? PAL.berry : e.fx === 'frost' ? PAL.foam : bolt ? PAL.pumpkin : PAL.gold);
        const pos = (t: number) => ({ x: e.x + (tx - e.x) * t, y: e.y + (ty - e.y) * t });       // (the arrow itself is a real projectile: sim/defense.ts `fly`)
        const t0 = this.scene.time.now, dur = flightTime(e.k, d) * 1000;
        const lamp = { x: e.x, y: e.y, r: bolt ? 30 : 24, c: e.fx === 'fire' ? 0xff8a40 : e.fx === 'frost' ? 0xa8d8ff : 0xffe9c8 };
        this.lights.add(lamp);
        const step = () => {
            const t = Math.min(1, (this.scene.time.now - t0) / dur), p = pos(t);
            lamp.x = p.x; lamp.y = p.y;
            trail.explode(e.fx ? 2 : 1, p.x, p.y);
            if (t >= 1) {
                this.scene.events.off('update', step);
                this.lights.delete(lamp);
                this.sparks.explode(bolt ? 8 : 4, tx, ty);
                flash(tx, ty, bolt ? 6 : 4, PAL.cream);
            }
        };
        this.scene.events.on('update', step);
        step();
    }

    /** A monster was struck by lightning: the world view flashes it white (set by Game). */
    onZapHit: (x: number, y: number) => void = () => undefined;

    /**
     * A Tesla Coil fires: the orb swells for a moment, then a forked bolt with a bright core and a blue glow flickers from it to each
     * monster in turn; where it lands a shockwave ring runs across the ground, the ground scorches, blue-white sparks fly, the monster
     * flashes white and the night gets a quick pulse of light.
     */
    private zap (e: Extract<SimEvent, { e: 'shot' }>) {
        const s = this.scene, ox = e.x, oy = e.y - 3;
        const glow = overlay3d(s.add.circle(ox, oy, 5, 0x8fe7ff, 0.35).setDepth(8e4).setBlendMode('ADD'), SHOT_LIFT);
        s.tweens.add({ targets: glow, scale: 2.2, alpha: 0.95, duration: 130, ease: 'Quad.easeIn', onComplete: () => glow.destroy() });
        s.time.delayedCall(130, () => {
            const g = overlay3d(s.add.graphics().setDepth(8e4), SHOT_LIFT);
            const hits = e.to;
            const draw = () => {
                g.clear();
                let fx = ox, fy = oy;
                for (const [tx, ty] of hits) {
                    const pts: [number, number][] = [[fx, fy]];
                    const n = 6, len = Math.hypot(tx - fx, ty - fy), jit = Math.min(9, 3 + len / 18);
                    for (let i = 1; i < n; i++) pts.push([fx + ((tx - fx) * i) / n + (Math.random() - 0.5) * 2 * jit, fy + ((ty - fy) * i) / n + (Math.random() - 0.5) * 2 * jit]);
                    pts.push([tx, ty]);
                    const strokeLine = (list: [number, number][], col: number, w: number, a: number) => {
                        g.lineStyle(w, col, a).beginPath().moveTo(list[0][0], list[0][1]);
                        for (const [x, y] of list.slice(1)) g.lineTo(x, y);
                        g.strokePath();
                    };
                    // forks: short side branches off the middle of the bolt
                    const forks: [number, number][][] = [];
                    for (let i = 2; i < n - 1; i++) if (Math.random() < 0.55) {
                        const [px, py] = pts[i], ang = Math.atan2(ty - fy, tx - fx) + (Math.random() - 0.5) * 2.2, l = 8 + Math.random() * 12;
                        forks.push([[px, py], [px + Math.cos(ang) * l * 0.5 + (Math.random() - 0.5) * 4, py + Math.sin(ang) * l * 0.5 + (Math.random() - 0.5) * 4], [px + Math.cos(ang) * l, py + Math.sin(ang) * l]]);
                    }
                    strokeLine(pts, 0x5aa8ff, 9, 0.22);
                    for (const f of forks) strokeLine(f, 0x5aa8ff, 5, 0.22);
                    strokeLine(pts, 0x8fe7ff, 3.5, 0.9);
                    for (const f of forks) strokeLine(f, 0x8fe7ff, 2, 0.85);
                    strokeLine(pts, 0xffffff, 1.5, 1);
                    fx = tx; fy = ty;
                }
            };
            draw();
            s.time.addEvent({ delay: 55, repeat: 4, callback: draw });          // (it flickers: a new bolt on the same path every few frames)
            s.tweens.add({ targets: g, alpha: 0, delay: 120, duration: ZAP_LINGER * 1000 - 120, onComplete: () => g.destroy() });
            this.sparks.explode(4, ox, oy);
            for (const [tx, ty] of hits) {
                this.zapSparks.explode(7, tx, ty);
                this.onZapHit(tx, ty);
                const ring = overlay3d(s.add.ellipse(tx, ty + 5, 8, 4).setStrokeStyle(1.5, 0xcfe8ff, 0.95).setDepth(8e4 - 2), 0);
                s.tweens.add({ targets: ring, scaleX: 5, scaleY: 5, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
                const scorch = overlay3d(s.add.ellipse(tx, ty + 5, 14, 6, 0x2a1d2c, 0.5).setDepth(8e4 - 3), 0);
                s.tweens.add({ targets: scorch, alpha: { from: 0.55, to: 0 }, duration: 520, ease: 'Stepped', easeParams: [6], onComplete: () => scorch.destroy() });
                const lamp = { x: tx, y: ty, r: 46, c: 0xcfe8ff };
                this.lights.add(lamp);
                s.time.delayedCall(160, () => this.lights.delete(lamp));
            }
        });
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
        for (const [id, o] of this.bows) if (!this.seenBow.has(id)) o.im.setVisible(false);
        this.seenBow.clear();
        for (const [id, t] of this.badges) if (!this.seenB.has(id)) t.setVisible(false);
        this.seenB.clear();
        this.stars.length = 0;
        for (const [id, t] of this.plates) if (!this.seen.has(id)) t.setVisible(false);
        this.seen.clear();
        this.bars.length = 0;
        this.rings.length = 0;
    }
}

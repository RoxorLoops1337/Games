// Everything you see in a fight that isn't the sim's state: how monsters move and wind up,
// projectiles in flight, boss warnings painted on the ground, weapon swing effects,
// health bars and the boss arena ring. Game.ts creates one of these and feeds it events.

import { ensureMobArt } from '../art/storybook-mobs';
import * as Phaser from 'phaser';
import type { WeaponType } from '../../shared/data/items';
import { MobKind, MOBS, PROJ } from '../../shared/data/mobs';
import { PAL } from '../../shared/palette';
import type { Ent, MobE, ProjE, SimEvent } from '../../shared/sim/types';

type Img = Phaser.GameObjects.Image;
type Spr = Phaser.GameObjects.Sprite;

/** The slice of Game's EntView that fights need. */
interface MobViewLike {
    ent: Ent;
    sprite: Img | Spr;
    shadow?: Img;
    glow?: Img;
    mark?: Img;
    born?: number;
    x: number;
    y: number;
}

const FILL = Phaser.TintModes.FILL;
const MULTIPLY = Phaser.TintModes.MULTIPLY;
const outBack = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
/** Projectiles that glow and leave a trail of sparks. */
const GLOWING = new Set<string>(['orb', 'frost', 'fire', 'bolt', 'spore']);

// ── monster views ───────────────────────────────────────────────────────────
export function createMob (scene: Phaser.Scene, e: MobE) {
    ensureMobArt(scene);
    const def = MOBS[e.kind];
    const sprite = scene.add.sprite(e.x, e.y, def.tex, 0).setOrigin(0.5, 1).setDepth(e.y);
    const w = Math.max(10, def.r * 2);
    const shadow = scene.add.image(e.x, e.y, 'shadow', 0).setTint(PAL.ink).setAlpha(def.boss ? 0.32 : 0.25).setDepth(-5).setScale(Math.min(5.5, (w / 12) * (def.boss ? 1.35 : 1)), 1);
    return { sprite, shadow };
}

export function createProj (scene: Phaser.Scene, e: ProjE) {
    ensureMobArt(scene);
    const sprite = scene.add.image(e.x, e.y, `proj_${e.kind}`, 0).setDepth(e.y + 40);
    const glow = GLOWING.has(e.kind)
        ? scene.add.image(e.x, e.y, 'dot', 0).setTint(PROJ[e.kind].color).setAlpha(0.35).setScale(1.3).setDepth(e.y + 39).setBlendMode(Phaser.BlendModes.ADD)
        : undefined;
    return { sprite, glow };
}

export function animateProj (v: MobViewLike, e: ProjE, dt: number) {
    // dead-reckon along the velocity, easing towards the authoritative position
    v.x += e.vx * dt; v.y += e.vy * dt;
    const k = Math.min(1, dt * 5);
    v.x += (e.x - v.x) * k; v.y += (e.y - v.y) * k;
    const s = v.sprite as Img;
    s.setPosition(v.x, v.y - 5).setDepth(v.y + 40);
    if (e.kind === 'arrow' || e.kind === 'bolt' || e.kind === 'frost') s.setRotation(Math.atan2(e.vy, e.vx));
    else s.setRotation(s.rotation + dt * (e.kind === 'rock' ? 9 : 3));
    v.glow?.setPosition(v.x, v.y - 5).setScale(1.2 + Math.sin(performance.now() / 90 + e.id) * 0.2);
}

/** Pose a monster's sprite from its state: frames, hops, wind-up crouch, charge stretch, boss leaps. */
export function animateMob (scene: Phaser.Scene, v: MobViewLike, e: MobE, dt: number, now: number) {
    const def = MOBS[e.kind];
    const spr = v.sprite as Spr;
    const k = Math.min(1, dt * (def.boss ? 8 : 12));
    v.x += (e.x - v.x) * k;
    v.y += (e.y - v.y) * k;
    const t = now / 1000;
    const st = e.st ?? 0;
    const moving = Math.hypot(e.vx, e.vy) > 3;
    const big = e.rb ? 1.6 : e.el ? 1.18 : 1;
    let sx = big, sy = big, oy = 0, ox = 0, frame = 0, rot = 0, lift = 0;

    if (v.born !== undefined) {
        const a = Math.min(1, (now - v.born) / 320);
        const s = a < 1 ? Math.max(0.01, outBack(a)) : 1;
        sx *= s; sy *= s;
        if (a >= 1) v.born = undefined;
    }
    if (def.ai === 'hop') {
        if (e.hopT > 0) { const p = 1 - e.hopT / 0.34; oy = -Math.sin(p * Math.PI) * 5; frame = 1; }
    } else if (def.tex === 'oldheart') {
        frame = Math.floor(t * 1.7) % 2;
    } else if (moving || def.boss) {
        frame = Math.floor(t * (def.ai === 'flit' ? 14 : def.boss ? 2.5 : 6) + e.id) % 2;
    }
    if (def.flies) { lift = (def.boss ? 8 : 6) + Math.sin(t * 5 + e.id) * 2; oy -= lift; }
    if (def.boss) sy *= 1 + Math.sin(t * 2.2) * 0.018;

    if (st === 1) {                               // winding up: crouch and tremble
        sx *= 1.07; sy *= 0.9; ox = Math.sin(now / 26) * 0.9;
        if (Math.floor(now / 90) % 2) spr.setTint(0xff8c8c).setTintMode(MULTIPLY); else spr.clearTint();
    } else if (st === 2) {                        // acting: lunge
        if (def.ai === 'charge') { sx *= 1.18; sy *= 0.9; }
        else if (def.boss) { sx *= 1.05; sy *= 0.96; }
        if (spr.isTinted) spr.clearTint();
    } else if (st === 3 || (e.stun ?? 0) > 0) {   // stunned: dizzy
        rot = Math.sin(now / 55) * 0.16;
        if (spr.isTinted) spr.clearTint();
    } else if (spr.isTinted && !(spr.tintMode === FILL)) spr.clearTint();

    if (def.boss && e.pat === 'leap' && (e.pt ?? 0) > 0.75 && (e.pt ?? 0) < 1.15) {
        const p = ((e.pt ?? 0) - 0.75) / 0.4;
        oy -= Math.sin(p * Math.PI) * 34;
        v.shadow?.setAlpha(0.32 * (1 - 0.55 * Math.sin(p * Math.PI)));
    }
    if (def.boss && e.pat === 'charge' && st === 2) { sx *= 1.12; sy *= 0.94; }

    spr.setFrame(Math.min(frame, spr.texture.frameTotal - 2)).setPosition(v.x + ox, v.y + oy).setDepth(v.y).setScale(sx, sy).setRotation(rot);
    if (Math.abs(e.vx) > 4 && def.ai !== 'hop') spr.setFlipX(e.vx < 0);
    v.shadow?.setPosition(v.x, v.y);

    // the little icon above its head: danger, stun, or the elite crown
    const wantMark = st === 1 ? 'mark_alert' : st === 3 || (e.stun ?? 0) > 0 ? 'mark_stun' : e.el ? 'mark_elite' : null;
    if (wantMark) {
        if (!v.mark) v.mark = scene.add.image(0, 0, wantMark, 0).setDepth(9e4);
        else if (v.mark.texture.key !== wantMark) v.mark.setTexture(wantMark, 0);
        v.mark.setVisible(true).setPosition(Math.round(v.x), Math.round(v.y + oy - spr.displayHeight - 3 - (wantMark === 'mark_alert' ? Math.abs(Math.sin(now / 90)) * 2 : 0)));
    } else v.mark?.setVisible(false);
}

// ── overlay: warnings, bars, arena rings, weapon effects ────────────────────
interface Tele { shape: 'circle' | 'line' | 'cone' | 'ring'; x: number; y: number; r: number; t: number; a: number; len: number; age: number; kind?: 'frost' | 'hex' | 'chain' }
/** The colour of a warning: red for a blow, and the co-op patterns in their own (ice blue, curse violet, chain gold). */
const WARN = { frost: PAL.sea, hex: PAL.plum, chain: PAL.gold } as const;

export class CombatFx {
    private g: Phaser.GameObjects.Graphics;
    private teles: Tele[] = [];
    private trails = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();

    constructor (private scene: Phaser.Scene) {
        this.g = scene.add.graphics().setDepth(5.2e4);
    }

    destroy () { this.g.destroy(); for (const t of this.trails.values()) t.destroy(); }

    tele (e: Extract<SimEvent, { e: 'tele' }>) {
        this.teles.push({ shape: e.shape, x: e.x, y: e.y, r: e.r, t: e.t, a: e.a ?? 0, len: e.len ?? 0, age: 0, kind: e.kind });
    }

    /** A weapon swing: a slash, a thrust, a ground pound, an arrow or a bolt. */
    swing (e: Extract<SimEvent, { e: 'swing' }>) {
        const w = e.w;
        if (!w || e.px === undefined || e.py === undefined) return;
        const px = e.px, py = e.py;
        const ang = Math.atan2(e.y - py, e.x - px);
        const dist = Math.hypot(e.x - px, e.y - py);
        const scene = this.scene;
        const draw = (fn: (g: Phaser.GameObjects.Graphics) => void, ms: number, alphaFrom = 1) => {
            const g = scene.add.graphics().setDepth(8e4);
            fn(g);
            g.setAlpha(alphaFrom);
            scene.tweens.add({ targets: g, alpha: 0, duration: ms, onComplete: () => g.destroy() });
            return g;
        };
        switch (w as WeaponType) {
            case 'sword': case 'club': case 'dagger': case 'fist': {
                const half = w === 'sword' ? 1.25 : w === 'dagger' ? 0.55 : 0.9;
                const r = w === 'sword' ? 26 : w === 'dagger' ? 15 : 20;
                const g = draw((gg) => {
                    gg.lineStyle(w === 'sword' ? 3 : 2, w === 'club' || w === 'fist' ? PAL.cream : PAL.snow, 0.95);
                    gg.beginPath(); gg.arc(px, py, r, ang - half, ang + half, false); gg.strokePath();
                    gg.lineStyle(1, PAL.foam, 0.8);
                    gg.beginPath(); gg.arc(px, py, r - 3, ang - half * 0.8, ang + half * 0.8, false); gg.strokePath();
                }, 130);
                scene.tweens.add({ targets: g, scaleX: 1.08, scaleY: 1.08, duration: 130 });
                break;
            }
            case 'spear': {
                const len = Math.max(26, Math.min(48, dist + 10));
                draw((gg) => {
                    const tx = px + Math.cos(ang) * len, ty = py + Math.sin(ang) * len;
                    gg.lineStyle(2, PAL.cream, 0.95).lineBetween(px + Math.cos(ang) * 8, py + Math.sin(ang) * 8, tx, ty);
                    gg.fillStyle(PAL.snow, 1).fillTriangle(tx + Math.cos(ang) * 6, ty + Math.sin(ang) * 6, tx + Math.cos(ang + 2.4) * 4, ty + Math.sin(ang + 2.4) * 4, tx + Math.cos(ang - 2.4) * 4, ty + Math.sin(ang - 2.4) * 4);
                }, 150);
                break;
            }
            case 'hammer': {
                const g = scene.add.graphics().setDepth(8e4).setPosition(px, py + 4);
                g.lineStyle(3, PAL.cream, 0.9).strokeCircle(0, 0, 12).lineStyle(1, PAL.dirt, 0.8).strokeCircle(0, 0, 8);
                scene.tweens.add({ targets: g, scaleX: 3, scaleY: 2.2, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
                break;
            }
            case 'bow': case 'staff': {
                const key = w === 'bow' ? 'proj_arrow' : 'proj_bolt';
                const s = scene.add.image(px, py, key, 0).setDepth(8e4).setRotation(ang);
                const glow = w === 'staff' ? scene.add.image(px, py, 'dot', 0).setTint(PAL.foam).setAlpha(0.5).setScale(1.4).setDepth(7.9e4).setBlendMode(Phaser.BlendModes.ADD) : null;
                scene.tweens.add({
                    targets: glow ? [s, glow] : s, x: e.x, y: e.y, duration: Math.max(60, dist * 1.1), ease: 'Linear',
                    onComplete: () => {
                        s.destroy(); glow?.destroy();
                        if (w === 'staff') {
                            const ring = scene.add.graphics().setDepth(8e4).setPosition(e.x, e.y);
                            ring.lineStyle(2, PAL.foam, 0.9).strokeCircle(0, 0, 10);
                            scene.tweens.add({ targets: ring, scaleX: 2.4, scaleY: 2.4, alpha: 0, duration: 240, onComplete: () => ring.destroy() });
                        }
                    },
                });
                break;
            }
        }
    }

    private trail (kind: string, x: number, y: number) {
        let em = this.trails.get(kind);
        if (!em) {
            em = this.scene.add.particles(0, 0, 'px', {
                emitting: false, speed: { min: 2, max: 10 }, lifespan: { min: 200, max: 360 },
                scale: { start: 1, end: 0 }, alpha: { start: 0.8, end: 0 }, tint: [PROJ[kind as keyof typeof PROJ]?.color ?? PAL.cream],
            }).setDepth(7.9e4);
            this.trails.set(kind, em);
        }
        em.explode(1, x, y);
    }

    draw (dt: number, views: Iterable<MobViewLike>, cam: Phaser.Geom.Rectangle) {
        const g = this.g;
        g.clear();
        for (const v of views) {
            const e = v.ent;
            if (e.k === 'proj') { if (Math.random() < dt * 14 && GLOWING.has(e.kind)) this.trail(e.kind, v.x, v.y - 5); continue; }
            if (e.k !== 'mob') continue;
            const def = MOBS[e.kind as MobKind];
            if (def.boss) {
                // the arena the boss is bound to
                if (e.hx !== undefined && e.hy !== undefined) {
                    const col = def.boss.color;
                    g.fillStyle(col, 0.035).fillCircle(e.hx, e.hy, def.boss.arena);
                    g.lineStyle(1, col, 0.3 + 0.1 * Math.sin(performance.now() / 400));
                    const n = 56;
                    for (let i = 0; i < n; i += 2) {
                        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
                        g.beginPath(); g.arc(e.hx, e.hy, def.boss.arena, a0, a1, false); g.strokePath();
                    }
                }
                continue;
            }
            if (e.hp >= e.mhp) continue;
            if (v.x < cam.x - 20 || v.x > cam.right + 20 || v.y < cam.y - 20 || v.y > cam.bottom + 20) continue;
            const w = Math.max(10, Math.round(def.r * 2 + 4));
            const x = Math.round(v.x - w / 2), y = Math.round(v.y - (v.sprite as Img).displayHeight - (def.flies ? 14 : 5) - (e.el ? 4 : 0));
            const f = Math.max(0, e.hp / e.mhp);
            g.fillStyle(PAL.ink, 0.9).fillRect(x - 1, y - 1, w + 2, 4);
            g.fillStyle(PAL.night, 1).fillRect(x, y, w, 2);
            g.fillStyle(f > 0.5 ? PAL.lime : f > 0.25 ? PAL.gold : PAL.berry, 1).fillRect(x, y, Math.max(1, Math.round(w * f)), 2);
            g.fillStyle(0xffffff, 0.25).fillRect(x, y, Math.max(1, Math.round(w * f)), 1);
        }
        // warnings
        for (let i = this.teles.length - 1; i >= 0; i--) {
            const t = this.teles[i];
            t.age += dt;
            if (t.age > t.t + 0.16) { this.teles.splice(i, 1); continue; }
            this.drawTele(g, t);
        }
    }

    private drawTele (g: Phaser.GameObjects.Graphics, t: Tele) {
        const p = Math.min(1, t.age / t.t);
        const hit = t.age > t.t;                        // the moment it lands: a white flash
        const warn = t.kind ? WARN[t.kind] : PAL.berry;
        const base = hit ? 0xffffff : warn;
        const pulse = 0.5 + 0.5 * Math.sin(t.age * 18);
        switch (t.shape) {
            case 'circle':
                g.fillStyle(base, hit ? 0.5 : 0.1 + 0.08 * pulse).fillCircle(t.x, t.y, t.r);
                g.fillStyle(warn, hit ? 0 : 0.3).fillCircle(t.x, t.y, t.r * p);
                g.lineStyle(1.5, base, 0.9).strokeCircle(t.x, t.y, t.r);
                break;
            case 'ring': {
                const q = 0.35 + 0.65 * p;
                g.lineStyle(2.5, base, (hit ? 0.8 : 0.9 * (1 - p * 0.4))).strokeCircle(t.x, t.y, t.r * q);
                g.lineStyle(1, PAL.snow, 0.4 * (1 - p)).strokeCircle(t.x, t.y, t.r * q * 0.8);
                break;
            }
            case 'cone': {
                const half = 0.96;
                g.fillStyle(base, hit ? 0.5 : 0.1 + 0.08 * pulse);
                g.slice(t.x, t.y, t.r, t.a - half, t.a + half, false).fillPath();
                g.fillStyle(warn, hit ? 0 : 0.3);
                g.slice(t.x, t.y, t.r * p, t.a - half, t.a + half, false).fillPath();
                g.lineStyle(1.5, base, 0.9);
                g.slice(t.x, t.y, t.r, t.a - half, t.a + half, false).strokePath();
                break;
            }
            case 'line': {
                const cx = Math.cos(t.a), cy = Math.sin(t.a), nx = -cy, ny = cx;
                const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
                const quad = (len: number) => [
                    V(t.x + nx * t.r, t.y + ny * t.r), V(t.x + cx * len + nx * t.r, t.y + cy * len + ny * t.r),
                    V(t.x + cx * len - nx * t.r, t.y + cy * len - ny * t.r), V(t.x - nx * t.r, t.y - ny * t.r),
                ];
                g.fillStyle(base, hit ? 0.5 : 0.1 + 0.08 * pulse).fillPoints(quad(t.len), true);
                g.fillStyle(warn, hit ? 0 : 0.32).fillPoints(quad(t.len * p), true);
                g.lineStyle(1.5, base, 0.9).strokePoints([...quad(t.len), quad(t.len)[0]], false);
                break;
            }
        }
    }
}

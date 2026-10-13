// The cottage folk out and about: each resident (`BuildE.res`) is drawn as a little farmer who dawdles round their own doorstep, with
// a name plate over their head. Client-only: the sim knows nothing about them, so they never block you and nothing about them syncs.

import * as Phaser from 'phaser';
import { TILE } from '../../shared/config';
import { BUILDINGS } from '../../shared/data/buildings';
import { BODY_TONES, EYES, MOUTHS, SPROUTS, SCARF_COLORS, type Look } from '../../shared/data/look';
import { PAL } from '../../shared/palette';
import type { BuildE } from '../../shared/sim/types';
import { ensureFarmer } from '../art/storybook-chars';
import { overlay3d } from './view3d-bridge';

interface Folk { sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image; plate: Phaser.GameObjects.Text; name: string; x: number; y: number; tx: number; ty: number; wait: number; t: number }

const ROAM = TILE * 2.2;
const SPEED = 14;

/** A look and scarf colour drawn from a name, so a villager always looks the same. */
export function folkLook (name: string): { look: Look; color: number } {
    let h = 7;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const look: Look = { b: h % BODY_TONES.length, l: (h >> 3) % SPROUTS.length, e: (h >> 5) % EYES.length, m: (h >> 7) % MOUTHS.length };
    return { look, color: (h >> 9) % SCARF_COLORS.length };
}

export class Villagers {
    private folk = new Map<number, Folk>();
    constructor (private scene: Phaser.Scene) {}

    /** Walk everyone one step (adding the newly moved in, dropping those whose cottage is gone). */
    update (dt: number, blds: Iterable<BuildE>) {
        const seen = new Set<number>();
        for (const b of blds) {
            if (b.kind !== 'cottage' || !b.res) continue;
            seen.add(b.id);
            const [w, h] = BUILDINGS[b.kind].size;
            const hx = (b.tx + w / 2) * TILE, hy = (b.ty + h) * TILE + 6;
            let f = this.folk.get(b.id);
            if (!f || f.name !== b.res.n) {
                this.drop(b.id);
                f = this.make(b, hx, hy);
                this.folk.set(b.id, f);
            }
            this.step(f, dt, hx, hy);
        }
        for (const id of [...this.folk.keys()]) if (!seen.has(id)) this.drop(id);
    }

    clear () { for (const id of [...this.folk.keys()]) this.drop(id); }

    private make (b: BuildE, hx: number, hy: number): Folk {
        const name = b.res!.n, { look, color } = folkLook(name);
        const sprite = this.scene.add.sprite(hx, hy, ensureFarmer(this.scene, look, color), 0).setOrigin(0.5, 1);
        const shadow = this.scene.add.image(hx, hy, 'shadow', 0).setTint(PAL.ink).setAlpha(0.28).setDepth(-5).setScale(0.9, 1);
        const plate = overlay3d(this.scene.add.text(0, 0, name, { fontFamily: 'Pixelify Sans', fontSize: '11px', color: '#fff6e0', stroke: '#2a1d2c', strokeThickness: 3 }).setOrigin(0.5, 1).setAlpha(0.85));
        return { sprite, shadow, plate, name, x: hx, y: hy, tx: hx, ty: hy, wait: 1 + Math.random() * 3, t: Math.random() * 10 };
    }

    private step (f: Folk, dt: number, hx: number, hy: number) {
        f.t += dt;
        const dx = f.tx - f.x, dy = f.ty - f.y, d = Math.hypot(dx, dy);
        let moving = false;
        if (d > 1) {
            const s = Math.min(d, SPEED * dt);
            f.x += dx / d * s; f.y += dy / d * s; moving = true;
            if (Math.abs(dx) > 0.5) f.sprite.setFlipX(dx < 0);
        } else if ((f.wait -= dt) <= 0) {
            f.wait = 2 + Math.random() * 5;
            const a = Math.random() * Math.PI * 2, r = Math.random() * ROAM;
            f.tx = hx + Math.cos(a) * r; f.ty = hy + Math.abs(Math.sin(a)) * r * 0.6;
        }
        const hop = moving ? Math.abs(Math.sin(f.t * 9)) * 2 : 0;
        f.sprite.setFrame(moving ? Math.floor(f.t * 8) % 2 : 0).setPosition(f.x, f.y - hop).setDepth(f.y);
        f.shadow.setPosition(f.x, f.y);
        f.plate.setPosition(f.x, f.y - 17 - hop).setDepth(f.y + 1);
    }

    private drop (id: number) {
        const f = this.folk.get(id);
        if (!f) return;
        f.sprite.destroy(); f.shadow.destroy(); f.plate.destroy();
        this.folk.delete(id);
    }
}

// The farmers as drawn: your own (walked here, client-authoritative, and sent to the server) and everyone else's (glided
// toward where the server says they are), with the tool in hand, the gear they wear, the walk, the swing and the fall.

import * as Phaser from 'phaser';
import { NET } from '../../shared/config';
import { iconOf, type ItemId } from '../../shared/data/items';
import type { PlayerView } from '../../shared/net/protocol';
import { PAL } from '../../shared/palette';
import type { Cmd, PlayerS } from '../../shared/sim/types';
import type { World } from '../../shared/world';
import { ensureFarmer } from '../art/storybook-chars';
import { physDown } from '../input/layout';

type Img = Phaser.GameObjects.Image;
type Spr = Phaser.GameObjects.Sprite;
const FILL = Phaser.TintModes.FILL;
const MULTIPLY = Phaser.TintModes.MULTIPLY;

interface PlayerSprite {
    id: string;
    sprite: Spr;
    shadow: Img;
    tool: Img;
    x: number;
    y: number;
    flip: boolean;
    walkT: number;
    swinging: boolean;
    toolId: string;
    /** What is worn, as layers over the sprite (hat, armor, charm), a cloak behind it, and the weapon on the back. */
    worn: { head?: Img; body?: Img; charm?: Img; cloak?: Img; back?: Img; pack?: Img; packBack?: Img };
    look: string;
}

/** Your own farmer's movement, owned by the client: where you are, which way you face, the knockback and what was last sent. */
export interface Local { x: number; y: number; face: { x: number; y: number }; kx: number; ky: number; warp: number; moving: boolean; sendT: number; sentX: number; sentY: number; sentMoving: boolean }
export const freshLocal = (): Local => ({ x: 0, y: 0, face: { x: 0, y: 1 }, kx: 0, ky: 0, warp: -1, moving: false, sendT: 0, sentX: NaN, sentY: NaN, sentMoving: false });

/** The slice of the Game scene the farmers read. */
interface FarmersHost {
    readonly me: string;
    readonly meS: PlayerS | null;
    readonly players: Record<string, PlayerView>;
    readonly world: World;
    readonly local: Local;
    readonly keys: Record<string, Phaser.Input.Keyboard.Key>;
    readonly touch: { mx: number; my: number };
    readonly menuOpen: boolean;
    readonly camTarget: Phaser.Math.Vector2;
    derivedMe (): { speed: number };
    send (c: Cmd): void;
    /** A farmer swung (the 3D view poses its model). */
    swung? (id: string): void;
}

/** A quick squash (or stretch) that springs back: a hit, a pop, a swap. */
export function squash (scene: Phaser.Scene, o: Img | Spr, sx: number, sy: number, ms: number) {
    scene.tweens.killTweensOf(o);
    o.setScale(sx, sy);
    scene.tweens.add({ targets: o, scaleX: 1, scaleY: 1, duration: ms * 2, ease: 'Back.easeOut' });
}

/** A white flash over a sprite for a moment (a hit landing). */
export function flash (scene: Phaser.Scene, o: Img | Spr | undefined, ms = 60) {
    if (!o) return;
    o.setTint(PAL.snow).setTintMode(FILL);
    scene.time.delayedCall(ms, () => { if (o.active) o.clearTint().setTintMode(MULTIPLY); });
}

export class Farmers {
    private views = new Map<string, PlayerSprite>();
    /** Seconds the farmer has stood still (the prompt to pet your companion waits for it). */
    stillT = 0;

    constructor (private scene: Phaser.Scene, private h: FarmersHost) {}

    get (id: string) { return this.views.get(id); }
    values () { return this.views.values(); }

    /** Every sprite goes (a new world is arriving). */
    clear () {
        for (const pv of this.views.values()) this.destroy(pv);
        this.views.clear();
        this.stillT = 0;
    }

    remove (id: string) {
        const pv = this.views.get(id);
        if (pv) { this.destroy(pv); this.views.delete(id); }
    }

    private toolTexture (p: { equip?: PlayerView['equip']; line?: unknown }) {
        return iconOf(p.line ? 'rod' : p.equip?.tool ?? 'pick_flint');
    }

    ensure (p: PlayerView) {
        const s = this.scene, h = this.h;
        let pv = this.views.get(p.id);
        const tool = this.toolTexture(p);
        if (!pv) {
            const x = p.id === h.me ? h.local.x : p.x, y = p.id === h.me ? h.local.y : p.y;
            const shadow = s.add.image(x, y, 'shadow', 0).setTint(PAL.ink).setAlpha(0.28).setDepth(-5).setScale(0.9, 1);
            const sprite = s.add.sprite(x, y, ensureFarmer(s, p.look, p.color), 0).setOrigin(0.5, 1);
            const toolSpr = s.add.image(x, y, tool, 0).setOrigin(0.5, 0.95);
            pv = { id: p.id, sprite, shadow, tool: toolSpr, x, y, flip: false, walkT: 0, swinging: false, toolId: tool, worn: {}, look: '' };
            this.views.set(p.id, pv);
        }
        this.dress(pv, p.equip);
        const fk = ensureFarmer(s, p.look, p.color);            // a new look from the character creator: swap the painted farmer and pop
        if (pv.sprite.texture.key !== fk) { pv.sprite.setTexture(fk); squash(s, pv.sprite, 1.3, 1.3, 180); }
        if (pv.toolId !== tool) {
            pv.toolId = tool;
            pv.tool.setTexture(tool, 0);
            squash(s, pv.tool, 1.6, 1.6, 160);
        }
    }

    /** Lay the farmer's gear over the sprite: hat, armor and charm in front, a cloak behind, the weapon sheathed on the back. */
    private dress (pv: PlayerSprite, equip: PlayerView['equip'] | undefined) {
        const s = this.scene, e = equip ?? {};
        const look = [e.head, e.body, e.charm, e.weapon, e.bag].join('|');
        if (look === pv.look) return;
        const first = pv.look === '';
        pv.look = look;
        const layer = (slot: keyof PlayerSprite['worn'], key: string | null, origin: [number, number], depth: number) => {
            const have = pv.worn[slot];
            if (!key || !s.textures.exists(key)) { have?.destroy(); pv.worn[slot] = undefined; return; }
            if (have) { if (have.texture.key !== key) { have.setTexture(key, 0); if (!first) squash(s, have, 1.25, 1.25, 140); } }
            else {
                const im = s.add.image(pv.x, pv.y, key, 0).setOrigin(origin[0], origin[1]).setDepth(depth);
                pv.worn[slot] = im;
                if (!first) squash(s, im, 1.3, 1.3, 160);
            }
        };
        layer('head', e.head ? `worn_${e.head}` : null, [0.5, 1], pv.y);
        layer('body', e.body ? `worn_${e.body}` : null, [0.5, 1], pv.y);
        layer('charm', e.charm ? `worn_${e.charm}` : null, [0.5, 1], pv.y);
        layer('cloak', e.body ? `worn_back_${e.body}` : null, [0.5, 1], pv.y);
        layer('back', e.weapon ? `i_${e.weapon}` : null, [0.5, 0.5], pv.y);
        layer('pack', e.bag ? `worn_${e.bag}` : null, [0.5, 1], pv.y);
        layer('packBack', e.bag ? `worn_back_${e.bag}` : null, [0.5, 1], pv.y);
        pv.worn.back?.setScale(0.9);
    }

    /** Keep every worn layer on the farmer: same spot, flip, tilt and see-through-ness as the sprite. */
    private placeWorn (pv: PlayerSprite, bob: number, downed: boolean) {
        const w = pv.worn, side = pv.flip ? -1 : 1, angle = downed ? (pv.flip ? -90 : 90) : 0;
        const at = (im: Img | undefined, d: number) => im?.setPosition(pv.x, pv.y + bob).setFlipX(pv.flip).setAngle(angle).setDepth(pv.y + d);
        at(w.cloak, -0.05); at(w.packBack, -0.06);
        at(w.body, 0.04); at(w.head, 0.06); at(w.charm, 0.05); at(w.pack, 0.055);
        if (w.back) w.back.setVisible(!downed && !pv.swinging).setPosition(pv.x - side * 5.5, pv.y - 10 + bob).setFlipX(!pv.flip).setAngle(side * -38).setDepth(pv.y - 0.04);
    }

    private setAlpha (pv: PlayerSprite, a: number) {
        pv.sprite.setAlpha(a);
        for (const im of Object.values(pv.worn)) im?.setAlpha(a);
    }

    private destroy (pv: PlayerSprite) {
        pv.sprite.destroy(); pv.shadow.destroy(); pv.tool.destroy();
        for (const im of Object.values(pv.worn)) im?.destroy();
    }

    private draw (pv: PlayerSprite, moving: boolean, face: { x: number; y: number }, downed: boolean, dt: number) {
        if (moving && Math.abs(face.x) > 0.2) pv.flip = face.x < 0;
        pv.walkT = moving ? pv.walkT + dt : 0;
        const frame = moving ? 1 + (Math.floor(pv.walkT / 0.12) % 2) : 0;
        const bob = moving ? -Math.abs(Math.sin(pv.walkT * 14)) * 1.5 : 0;
        pv.sprite.setFrame(frame).setPosition(pv.x, pv.y + bob).setFlipX(pv.flip).setDepth(pv.y);
        pv.sprite.setAngle(downed ? (pv.flip ? -90 : 90) : 0);
        this.placeWorn(pv, bob, downed);
        pv.shadow.setPosition(pv.x, pv.y);
        const side = pv.flip ? -1 : 1;
        pv.tool.setVisible(!downed).setPosition(pv.x + side * 6, pv.y - 4 + bob).setFlipX(pv.flip).setDepth(pv.y + 0.2);
        if (!pv.swinging) pv.tool.setRotation(this.h.players[pv.id]?.line ? side * 0.15 : side * 0.5);
    }

    /** Everyone else glides toward where the server says they are. */
    updateRemote (dt: number) {
        const h = this.h, k = Math.min(1, dt * 12);
        for (const pv of this.views.values()) {
            if (pv.id === h.me) continue;
            const p = h.players[pv.id];
            if (!p) continue;
            pv.x += (p.x - pv.x) * k;
            pv.y += (p.y - pv.y) * k;
            this.draw(pv, p.moving, { x: p.fx, y: p.fy }, p.downed > 0, dt);
            this.setAlpha(pv, p.downed > 0 ? 0.7 + Math.sin(this.scene.time.now / 150) * 0.2 : 1);
        }
    }

    /** Your own farmer: the keys and the stick move you (the knockback too), the camera follows, and the server hears about it at NET.moveEvery. */
    updateLocal (dt: number) {
        const h = this.h, me = h.meS!, l = h.local, k = h.keys;
        const pv = this.views.get(h.me);
        const downed = me.downed > 0, frozen = me.co?.k === 'frozen';
        let mx = 0, my = 0;
        if (frozen) { l.kx = 0; l.ky = 0; }                                    // (frozen solid: not even a push moves you)
        if (!downed && !frozen && !h.menuOpen) {
            mx = (physDown('KeyD') || k.RIGHT.isDown ? 1 : 0) - (physDown('KeyA') || k.LEFT.isDown ? 1 : 0) + h.touch.mx;
            my = (physDown('KeyS') || k.DOWN.isDown ? 1 : 0) - (physDown('KeyW') || k.UP.isDown ? 1 : 0) + h.touch.my;
        }
        const len = Math.hypot(mx, my);
        if (len > 1) { mx /= len; my /= len; }
        const moving = len > 0.15;
        l.moving = moving;
        this.stillT = moving ? 0 : this.stillT + dt;
        if (moving) { l.face.x = mx / Math.max(len, 1e-6); l.face.y = my / Math.max(len, 1e-6); }
        const speed = h.derivedMe().speed;
        const dx = (mx * speed + l.kx) * dt, dy = (my * speed + l.ky) * dt;
        l.kx *= Math.pow(0.001, dt); l.ky *= Math.pow(0.001, dt);
        if (!h.world.boxBlocked(l.x + dx, l.y, 4, 3)) l.x += dx;
        if (!h.world.boxBlocked(l.x, l.y + dy, 4, 3)) l.y += dy;
        if (pv) {
            pv.x = l.x; pv.y = l.y;
            this.draw(pv, moving, l.face, downed, dt);
            this.setAlpha(pv, downed ? 0.7 : me.invuln > 0 && Math.floor(me.invuln * 12) % 2 === 0 ? 0.35 : 1);
        }
        h.camTarget.set(l.x, l.y - 8);
        l.sendT -= dt;
        const sx = Math.round(l.x), sy = Math.round(l.y);
        if (l.sendT <= 0 && (sx !== l.sentX || sy !== l.sentY || moving !== l.sentMoving) && !downed && !frozen) {
            l.sendT = NET.moveEvery;
            l.sentX = sx; l.sentY = sy; l.sentMoving = moving;
            h.send({ t: 'move', x: l.x, y: l.y, fx: l.face.x, fy: l.face.y, moving });
        }
    }

    /** Swing the tool at something (a weapon shows for the swing at a monster, then the tool comes back). */
    swingAnim (pv: PlayerSprite | undefined, targetX: number, weapon?: ItemId) {
        if (!pv) return;
        const s = this.scene;
        this.h.swung?.(pv.id);
        if (Math.abs(targetX - pv.x) > 2) pv.flip = targetX < pv.x;
        const side = pv.flip ? -1 : 1;
        pv.swinging = true;
        if (weapon) pv.tool.setTexture(iconOf(weapon), 0);
        s.tweens.killTweensOf(pv.tool);
        pv.tool.setRotation(side * -1.1);
        s.tweens.add({
            targets: pv.tool, rotation: side * 1.5, duration: 80, ease: 'Quad.easeIn',
            onComplete: () => s.tweens.add({
                targets: pv.tool, rotation: side * 0.5, duration: 140,
                onComplete: () => { pv.swinging = false; pv.tool.setTexture(pv.toolId, 0); },
            }),
        });
        squash(s, pv.sprite, 1.15, 0.88, 70);
    }
}

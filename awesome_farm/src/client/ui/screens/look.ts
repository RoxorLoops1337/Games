// The character creator: pick how your farmer looks (body tone, scarf, sprout, eyes, mouth). Shown once for a new farmer, and any time
// from the menu. Nothing is sent until you press the button, so you can play with it freely.

import { BODY_TONES, cleanLook, DEFAULT_LOOK, EYES, MOUTHS, randomLook, SCARF_COLORS, SCARF_NAMES, SPROUTS, type Look } from '../../../shared/data/look';
import { PAL } from '../../../shared/palette';
import { ensureFarmer } from '../../art/storybook-chars';
import { button, deviceText, onTap, Win, type Btn } from '../kit';
import { panel, STYLES } from '../px';
import { markWelcomed } from './welcome';
import type { Screen, ScreenCtx } from './types';

/** One colour square you can pick. */
function swatch (s: Phaser.Scene, color: number, size: number, pick: () => void) {
    const root = s.add.container(0, 0), g = s.add.graphics();
    const zone = s.add.zone(0, 0, size, size).setInteractive({ useHandCursor: true });
    root.add([g, zone]);
    onTap(zone, pick);
    const draw = (on: boolean) => {
        g.clear();
        g.fillStyle(on ? PAL.gold : PAL.ink, 1).fillRect(-size / 2 - 2, -size / 2 - 2, size + 4, size + 4);
        g.fillStyle(PAL.ink, 1).fillRect(-size / 2, -size / 2, size, size);
        g.fillStyle(color, 1).fillRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4);
        if (on) { g.fillStyle(0xffffff, 0.55).fillRect(-size / 2 + 2, -size / 2 + 2, size - 4, 4); }
    };
    draw(false);
    return { root, zone, select: draw };
}

export class LookScreen implements Screen {
    private win: Win;
    private look: Look;
    private color: number;
    private first: boolean;
    private sprite: Phaser.GameObjects.Sprite;
    private t = 0;
    private spin = 0;
    private bodies: ReturnType<typeof swatch>[] = [];
    private scarves: ReturnType<typeof swatch>[] = [];
    private chips: { sprout: Btn[]; eyes: Btn[]; mouth: Btn[] } = { sprout: [], eyes: [], mouth: [] };
    private names: Record<string, Phaser.GameObjects.Text> = {};

    constructor (private ctx: ScreenCtx, arg?: unknown) {
        const s = ctx.scene, me = ctx.me();
        this.first = !!(arg as { first?: boolean } | undefined)?.first;
        this.look = { ...(cleanLook(me.look) ?? DEFAULT_LOOK) };
        this.color = me.color % SCARF_COLORS.length;
        this.win = new Win(s, { w: 700, h: 410, title: this.first ? 'Who are you?' : 'Your look', icon: 'k_heart', accent: PAL.blossom, onClose: () => this.done() });
        const w = this.win;
        const g = s.add.graphics();
        w.put(g, 0, 0);

        // the preview, on a little patch of meadow
        panel(g, 14, 32, 236, 318, { ...STYLES.deep, rim: PAL.night });
        // a round patch of meadow for the farmer to stand on, with a few flowers
        g.fillStyle(PAL.ink, 0.18).fillEllipse(132, 302, 196, 50);
        g.fillStyle(PAL.leaf, 1).fillEllipse(132, 298, 190, 46);
        g.fillStyle(PAL.grass, 1).fillEllipse(132, 295, 178, 38);
        [[70, 292, PAL.blossom], [186, 298, PAL.gold], [96, 308, PAL.cream], [170, 288, PAL.cream]].forEach(([x, y, c]) => { g.fillStyle(c, 1).fillRect(x, y, 3, 3); g.fillStyle(PAL.gold, 1).fillRect(x + 1, y + 1, 1, 1); });
        this.sprite = s.add.sprite(0, 0, ensureFarmer(s, this.look, this.color), 0).setOrigin(0.5, 1).setScale(8);
        w.put(this.sprite, 132, 296);
        w.text(me.name, 132, 46, 16, PAL.gold, { origin: [0.5, 0] });
        onTap(this.sprite.setInteractive({ useHandCursor: true }), () => { this.spin = 0.7; this.sprite.setFlipX(!this.sprite.flipX); });
        w.text(deviceText('click me to turn around', 'tap me to turn around'), 132, 326, 11, PAL.pebble, { origin: [0.5, 0], bold: false });

        // the choices
        const X = 270, ROW = 56;
        const section = (i: number, title: string) => {
            const y = 34 + i * ROW;
            w.text(title, X, y, 14, PAL.gold);
            this.names[title] = w.text('', 686 - 16, y + 1, 12, PAL.pebble, { origin: [1, 0], bold: false });
            return y + 22;
        };
        let y = section(0, 'Body');
        BODY_TONES.forEach((t, i) => { const sw = swatch(s, t.color, 30, () => this.set({ b: i })); w.put(sw.root, X + 16 + i * 51, y + 16); this.bodies.push(sw); });
        y = section(1, 'Scarf');
        SCARF_COLORS.forEach((c, i) => { const sw = swatch(s, c, 30, () => { this.color = i; this.refresh(true); }); w.put(sw.root, X + 16 + i * 51, y + 16); this.scarves.push(sw); });
        const row = (idx: number, title: string, names: readonly string[], list: Btn[], key: keyof Look) => {
            const yy = section(idx, title), bw = Math.floor((416 - (names.length - 1) * 6) / names.length);
            names.forEach((n, i) => {
                const b = button(s, 0, 0, bw, 28, n, () => this.set({ [key]: i } as Partial<Look>), { style: STYLES.dark, size: 12, ink: false });
                w.put(b.root, X + bw / 2 + i * (bw + 6), yy + 14);
                list.push(b);
            });
        };
        row(2, 'Sprout', SPROUTS, this.chips.sprout, 'l');
        row(3, 'Eyes', EYES, this.chips.eyes, 'e');
        row(4, 'Mouth', MOUTHS, this.chips.mouth, 'm');

        // the footer: the random pick on the left, the way out on the right, a word between
        w.footer({
            secondary: [{ label: 'Surprise me', onClick: () => this.surprise(), style: STYLES.dark, ink: false, w: 150 }],
            primary: { label: this.first ? 'Start farming!' : 'Done', onClick: () => this.done(true), style: STYLES.lime, w: 220 },
            hint: this.first ? 'You can change all this later from the menu.' : 'Everyone nearby sees the change.',
        });
        this.refresh(false);
    }

    private set (p: Partial<Look>) { this.look = { ...this.look, ...p }; this.refresh(true); }

    private surprise () {
        const r = randomLook(Math.random);
        this.look = r.look; this.color = r.color;
        this.refresh(true);
        this.spin = 0.8;
    }

    private refresh (pop: boolean) {
        const s = this.ctx.scene, l = this.look;
        this.sprite.setTexture(ensureFarmer(s, l, this.color), 0);
        if (pop) { s.tweens.killTweensOf(this.sprite); this.sprite.setScale(8); s.tweens.add({ targets: this.sprite, scaleX: 9, scaleY: 7.2, duration: 90, yoyo: true, ease: 'Sine.easeOut' }); }
        this.bodies.forEach((b, i) => b.select(i === l.b));
        this.scarves.forEach((b, i) => b.select(i === this.color));
        const mark = (list: Btn[], on: number) => list.forEach((b, i) => b.setStyle(i === on ? STYLES.gold : STYLES.dark));
        mark(this.chips.sprout, l.l); mark(this.chips.eyes, l.e); mark(this.chips.mouth, l.m);
        this.names.Body.setText(BODY_TONES[l.b].name);
        this.names.Scarf.setText(SCARF_NAMES[this.color]);
        this.names.Sprout.setText(SPROUTS[l.l]);
        this.names.Eyes.setText(EYES[l.e]);
        this.names.Mouth.setText(MOUTHS[l.m]);
    }

    /** Close: with `save` (the button) the look is sent; closing with the cross keeps the old look, except on the very first time, where it is kept as it stands so this does not come back. */
    private done (save = false) {
        const me = this.ctx.me();
        if (save || this.first || !me.look) this.ctx.send({ t: 'look', look: this.look, color: this.color });
        if (this.first) markWelcomed();                // the tutorial that follows covers what the welcome card said
        this.ctx.close();
    }

    onKey (k: string) {
        if (k === 'Enter') { this.done(true); return true; }
        if (k === 'Escape') { this.done(false); return true; }
        return false;
    }

    update (dt: number) {
        this.t += dt;
        this.spin = Math.max(0, this.spin - dt);
        const walking = this.spin > 0;
        this.sprite.setFrame(walking ? 1 + (Math.floor(this.t / 0.12) % 2) : 0);
        const breathe = walking ? 0 : Math.sin(this.t * 3) * 0.1;
        if (!this.ctx.scene.tweens.isTweening(this.sprite)) this.sprite.setScale(8, 8 + breathe);
    }

    destroy () { this.win.destroy(); }
}

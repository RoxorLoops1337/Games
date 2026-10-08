// The boss health bar: top centre while a boss is awake nearby. Shows its name, a health
// bar with phase notches and a trailing "ghost" that drains after every hit.

import * as Phaser from 'phaser';
import { type BossInfo, type BossPhase, MobKind, MOBS } from '../../shared/data/mobs';

/** What the bar needs to know about what it shows: a boss's own card, or a stand-in for an expedition guardian. */
type BarInfo = Pick<BossInfo, 'title' | 'color'> & { phases: Pick<BossPhase, 'at'>[] };
import { dist } from '../../shared/geom';
import { PAL } from '../../shared/palette';
import type { Ent, MobE } from '../../shared/sim/types';
import { icon, label, W } from './kit';
import { BOSS } from './slots';
import { bar, hex, inset, panel, rect, STYLES } from './px';

const BW = BOSS.w, BH = BOSS.h;

/** The slice of the Game scene the bar reads: every entity (to find the nearest boss) and where you stand. */
interface BossBarHost {
    readonly ents: Record<number, Ent>;
    readonly playerPos: { x: number; y: number };
}

export class BossBar {
    private g: Phaser.GameObjects.Graphics;
    private nameT: Phaser.GameObjects.Text;
    private hpT: Phaser.GameObjects.Text;
    private face: Phaser.GameObjects.Image;
    private alpha = 0;
    private ghost = 1;
    private lastHp = -1;
    private flash = 0;
    private shownId = -1;
    private pulse = 0;
    /** The boss being fought right now (for the music). */
    cur: { phase: number } | null = null;
    /** The bar is on screen (the cards in the top slot give way to it). */
    get visible () { return this.alpha > 0.04; }

    constructor (scene: Phaser.Scene, private farm: BossBarHost) {
        this.g = scene.add.graphics().setDepth(9);
        this.nameT = label(scene, 0, 0, '', 17, PAL.cream, { font: 'head' }).setDepth(10);
        this.hpT = label(scene, 0, 0, '', 11, PAL.cream, { origin: [1, 0.5], stroke: 3 }).setDepth(10);
        this.face = icon(scene, 'slimeking', 0, 0, 1).setDepth(10);
        this.hide();
    }

    private nearest (): MobE | null {
        const me = this.farm.playerPos;
        let best: MobE | null = null, bd = Infinity;
        for (const e of Object.values(this.farm.ents)) {
            if (e.k !== 'mob' || !(MOBS[e.kind as MobKind].boss || e.rb)) continue;
            const d = dist(e.x, e.y, me.x, me.y);
            if (d < bd) { bd = d; best = e; }
        }
        return best;
    }

    private hide () {
        this.g.clear().setVisible(false);
        this.nameT.setVisible(false); this.hpT.setVisible(false); this.face.setVisible(false);
    }

    /** `top`: where the bar's top edge is this frame (the dusk countdown, or an expedition's plaque, may be above it). */
    update (dt: number, top = 8) {
        const b = this.nearest();
        this.cur = b ? { phase: b.ph ?? 0 } : null;
        this.alpha += ((b ? 1 : 0) - this.alpha) * Math.min(1, dt * 7);
        if (!b && this.alpha < 0.02) { this.hide(); this.shownId = -1; return; }
        const e = b ?? (this.farm.ents[this.shownId] as MobE | undefined);
        if (!e) { this.alpha *= 0.8; return; }
        if (b) this.shownId = b.id;
        const def = MOBS[e.kind as MobKind];
        const info: BarInfo = def.boss ?? { title: `${def.name} Guardian`, color: PAL.berry, phases: [{ at: 1 }] };       // (an expedition guardian is a plain monster with a bar)
        const frac = Math.max(0, e.hp / e.mhp);
        if (this.lastHp >= 0 && e.hp < this.lastHp) this.flash = 0.12;
        this.lastHp = e.hp;
        this.flash = Math.max(0, this.flash - dt);
        this.ghost = frac >= this.ghost ? frac : this.ghost + (frac - this.ghost) * Math.min(1, dt * 2.2);
        this.pulse += dt;

        const x = Math.round(W / 2 - BW / 2), y = Math.round(top) + Math.round((1 - this.alpha) * -14);
        const g = this.g;
        g.clear().setVisible(true).setAlpha(this.alpha);
        panel(g, x, y, BW, BH, { ...STYLES.dark, rim: info.color, hi: info.color, shadow: true });
        // portrait well
        inset(g, x + 8, y + 8, 34, 34, PAL.deepSea, PAL.slate);
        // health bar with phase notches
        const bx = x + 50, by = y + 26, bw = BW - 62;
        bar(g, bx, by, bw, 14, frac, frac < 0.25 ? PAL.berry : info.color, { flash: this.flash > 0 });
        if (this.ghost > frac + 0.002) rect(g, bx + 2 + Math.round((bw - 4) * frac), by + 2, Math.round((bw - 4) * (this.ghost - frac)), 10, PAL.cream, 0.55);
        for (const ph of info.phases.slice(1)) rect(g, bx + 2 + Math.round((bw - 4) * ph.at), by + 1, 2, 12, PAL.cream, 0.85);
        // the phase pips
        const n = info.phases.length, cur = e.ph ?? 0;
        for (let i = 0; i < n; i++) {
            const px = x + BW - 14 - (n - 1 - i) * 10, py = y + 11;
            rect(g, px - 3, py - 3, 7, 7, PAL.ink); rect(g, px - 2, py - 2, 5, 5, i <= cur ? info.color : PAL.slate);
        }
        const a = this.alpha;
        this.nameT.setVisible(true).setAlpha(a).setText(e.zone ? `${info.title} · Warden` : info.title).setColor(hex(info.color)).setPosition(x + 50, y + 6);
        this.hpT.setVisible(true).setAlpha(a).setText(`${Math.max(0, Math.ceil(e.hp))} / ${e.mhp}`).setPosition(bx + bw - 6, by + 8);
        this.face.setVisible(true).setAlpha(a).setTexture(def.tex, 0);
        const fr = this.face.frame;
        this.face.setScale(Math.min(1.5, 30 / Math.max(fr.width, fr.height))).setPosition(x + 25, y + 25);
    }
}

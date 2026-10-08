// The expedition plaque: under the boss bar while you are on a rift. Shows the tier, the wave
// pips, how many monsters are left (or the countdown / boon timer) and the boons you hold.

import * as Phaser from 'phaser';
import { BOON_BY_ID, BOON_RARITY, OMEN_MAX, omenMul, omenOf, RIFT_TIERS } from '../../shared/data/rift';
import { PAL } from '../../shared/palette';
import type { PlayerS } from '../../shared/sim/types';
import { label, Slot, tipOn, W } from './kit';
import { hex, panel, rect, RARITY_COLORS, STYLES } from './px';
import { PLAQUE } from './slots';
import { PAPER, WOOD } from './theme';

const PW = PLAQUE.w, PH = PLAQUE.h;
const MAX_CHIPS = 12;

export class RiftHud {
    private g: Phaser.GameObjects.Graphics;
    private nameT: Phaser.GameObjects.Text;
    private subT: Phaser.GameObjects.Text;
    private partyT: Phaser.GameObjects.Text;
    private chips: Slot[] = [];
    private held: string[] = [];
    private omenSlots: Slot[] = [];
    private omenIds: string[] = [];
    private alpha = 0;
    private key = '';
    private pulse = 0;

    constructor (scene: Phaser.Scene) {
        this.g = scene.add.graphics().setDepth(9);
        this.nameT = label(scene, 0, 0, '', 15, PAL.cream, { font: 'head' }).setDepth(10);
        this.subT = label(scene, 0, 0, '', 14, PAL.cream, { origin: [1, 0], font: 'head' }).setDepth(10);
        this.partyT = label(scene, 0, 0, '', 12, PAL.pebble, { origin: [1, 0], bold: false }).setDepth(10);
        for (let i = 0; i < OMEN_MAX; i++) {
            const s = new Slot(scene, 0, 0, 26, { iconScale: 1 });
            s.root.setDepth(10).setVisible(false);
            tipOn(s.interactive, () => {
                const o = omenOf(this.omenIds[i] ?? '');
                return o ? { title: o.name, color: o.color, sub: 'Omen', lines: [{ t: o.desc }, { t: `+${Math.round(o.bonus * 100)}% rewards (all omens: +${Math.round((omenMul(this.omenIds) - 1) * 100)}%)`, c: PAL.gold }], icon: o.icon, foot: 'Chosen at the dock' } : null;
            });
            this.omenSlots.push(s);
        }
        for (let i = 0; i < MAX_CHIPS; i++) {
            const s = new Slot(scene, 0, 0, 26, { iconScale: 1 });
            s.root.setDepth(10).setVisible(false);
            tipOn(s.interactive, () => {
                const b = BOON_BY_ID[this.held[i]];
                return b ? { title: b.name, color: RARITY_COLORS[b.rarity === 2 ? 4 : b.rarity === 1 ? 2 : 0], sub: `${BOON_RARITY[b.rarity]} boon`, icon: b.icon, lines: [{ t: b.desc }], foot: 'Lasts until the expedition ends' } : null;
            });
            this.chips.push(s);
        }
    }

    /** `top`: where the plaque's top edge is this frame (the dusk countdown may be above it). The chips hang under it. */
    update (dt: number, me: PlayerS, top = 8) {
        const r = me.rift;
        this.alpha += ((r ? 1 : 0) - this.alpha) * Math.min(1, dt * 8);
        this.pulse += dt;
        const g = this.g;
        if (!r && this.alpha < 0.02) {
            if (this.key) { g.clear(); this.nameT.setVisible(false); this.subT.setVisible(false); this.partyT.setVisible(false); this.chips.forEach((c) => c.root.setVisible(false)); this.omenSlots.forEach((c) => c.root.setVisible(false)); this.key = ''; }
            return;
        }
        if (!r) return;
        const t = RIFT_TIERS[r.tier];
        const x = Math.round(W / 2 - PW / 2), y = Math.round(top) + Math.round((1 - this.alpha) * -10);
        g.clear().setAlpha(this.alpha);
        panel(g, x, y, PW, PH, { ...STYLES.dark, rim: t.color, hi: t.color, shadow: true });
        // wave pips (the Abyss has none: just how deep you are)
        for (let i = 0; i < (r.waves || 0); i++) {
            const px = x + 12 + i * 16, py = y + 33;
            const done = i + 1 < r.wave || (i + 1 === r.wave && r.ph === 3 && r.win);
            const cur = i + 1 === r.wave && r.ph !== 3;
            const last = i + 1 === r.waves;
            rect(g, px, py, 12, 12, WOOD[0]);
            rect(g, px + 1, py + 1, 10, 10, done ? PAL.lime : cur ? (last ? PAL.berry : t.color) : PAPER.deep);
            if (cur && Math.floor(this.pulse * 3) % 2) rect(g, px + 3, py + 3, 6, 6, PAL.cream, 0.9);
            if (last && !done) rect(g, px + 4, py + 4, 4, 4, WOOD[0], 0.6);
        }
        let sub = '';
        let col: number = PAL.cream;
        if (r.ph === 0) { sub = r.wave <= 1 && r.kills === 0 ? `Starting in ${r.t}` : `Next wave in ${r.t}`; col = PAL.foam; }
        else if (r.ph === 1) { sub = `${r.left} left`; col = r.left <= 3 ? PAL.lime : PAL.cream; }
        else if (r.ph === 2) { sub = `Choose a boon · ${r.t}s`; col = PAL.gold; }
        else sub = r.win ? 'Cleared!' : 'The rift is closing…';
        if (r.ph === 3) col = r.win ? PAL.gold : PAL.berry;
        this.nameT.setVisible(true).setAlpha(this.alpha).setText((r.waves ? t.name : `${t.name} · wave ${r.wave}`) + (r.daily ? '  ★ daily' : '')).setColor(hex(t.color)).setPosition(x + 12, y + 7);
        this.subT.setVisible(true).setAlpha(this.alpha).setText(sub).setColor(hex(col)).setPosition(x + PW - 12, y + 30);
        if (!r.waves) { rect(g, x + 12, y + 33, 6, 12, t.color); rect(g, x + 22, y + 33, 6, 12, t.color, 0.6); rect(g, x + 32, y + 33, 6, 12, t.color, 0.3); }
        this.partyT.setVisible(true).setAlpha(this.alpha).setText(`${r.party} farmer${r.party > 1 ? 's' : ''}`).setPosition(x + PW - 12, y + 9);
        // one row of chips under the plaque: the omens you took, a little gap, then the boons you hold
        this.omenIds = r.omens ?? [];
        this.held = me.boons ?? [];
        const nOm = Math.min(this.omenIds.filter((id) => omenOf(id)).length, this.omenSlots.length), nBo = Math.min(this.held.length, MAX_CHIPS);
        const rowW = (nOm + nBo) * 28 - 2 + (nOm && nBo ? 8 : 0), rx = Math.round(W / 2 - rowW / 2), ry = y + PH + 6;
        this.omenSlots.forEach((c, i) => {
            const o = omenOf(this.omenIds[i] ?? '');
            c.root.setVisible(!!o && i < nOm).setAlpha(this.alpha);
            if (o) { c.set({ icon: o.icon, rarity: 3 }); c.root.setPosition(rx + i * 28, ry); }
        });
        const key = this.held.join(',');
        this.chips.forEach((c, i) => {
            const id = this.held[i];
            const b = id ? BOON_BY_ID[id] : null;
            c.root.setVisible(!!b && i < nBo).setAlpha(this.alpha);
            if (b) { c.set({ icon: b.icon, rarity: b.rarity === 2 ? 4 : b.rarity === 1 ? 2 : 0 }); c.root.setPosition(rx + nOm * 28 + (nOm ? 8 : 0) + i * 28, ry); }
        });
        this.key = key || 'on';
    }
}

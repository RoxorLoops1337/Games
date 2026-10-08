// The Expedition Dock: choose a rift, take on omens for bigger rewards, see who would come along, and launch.

import type * as Phaser from 'phaser';
import { DAILY_BONUS, dailyRift, dailyShards, OMEN_MAX, OMENS, omenMul, omenOf, RIFT_PARTY_MAX, RIFT_TIERS } from '../../../shared/data/rift';
import { MOBS } from '../../../shared/data/mobs';
import { playSfx } from '../../juice/sfx';
import { PAL } from '../../../shared/palette';
import { bossCount } from '../../../shared/sim/rift';
import { countOf, PLAYER_COLORS } from '../../../shared/sim/stats';
import { button, Footer, GAP, icon, label, onTap, Section, shrinkToFit, tipOn, ts, Win } from '../kit';
import { hex, inset, rect, STYLES } from '../px';
import type { Screen, ScreenCtx } from './types';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const ROW_H = 56;
const CHIP_GAP = 4;

/** The omens picked last time stay picked: players tend to run the same challenge again. */
let lastOmens: string[] = [];

export class DockScreen implements Screen {
    private win: Win;
    private id: number;
    private g: Phaser.GameObjects.Graphics;
    private key = '';
    private nameT: Phaser.GameObjects.Text[] = [];
    private blurbT: Phaser.GameObjects.Text[] = [];
    private infoT: Phaser.GameObjects.Text[] = [];
    private numT: Phaser.GameObjects.Text[] = [];
    private go: ReturnType<typeof button>[] = [];
    private partyT: Phaser.GameObjects.Text[] = [];
    private chips: { im: Phaser.GameObjects.Image; name: Phaser.GameObjects.Text; bonus: Phaser.GameObjects.Text }[] = [];
    private omens: string[] = [...lastOmens];
    private dailyT: Phaser.GameObjects.Text;
    private dailyBtn: ReturnType<typeof button>;
    private noteT: Phaser.GameObjects.Text;
    private rifts: Section;
    private party: Section;
    private omenSec: Section;
    private foot: Footer;
    private chipW: number;
    private chipH: number;
    private blurbPx: number;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const s = ctx.scene;
        this.id = (arg as { id: number }).id;
        this.win = new Win(s, { size: 'large', title: 'Expedition Dock', icon: 'dock', accent: PAL.plum, onClose: () => ctx.close() });
        const w = this.win;
        this.foot = w.footer({ info: '', infoW: 150, hint: 'Boons last only for the run. Falling costs nothing: you keep every shard and coin you earned.' });
        const body = w.body;
        this.g = w.put(s.add.graphics(), 0, 0);
        // ── the rift of the day, the same for everyone today ──
        const dail = w.section(body.x, body.y, body.w, 44);
        this.dailyT = w.text('', dail.inner.x, dail.y + 22, ts('body'), PAL.gold, { origin: [0, 0.5], font: 'head' });
        this.dailyBtn = button(s, 0, 0, 150, 28, 'Daily rift', () => {
            const d = dailyRift(ctx.farm.serverSeed(), ctx.farm.clock.day, bossCount(ctx.me()));
            if (d.tier >= 0) ctx.send({ t: 'rift', op: 'launch', id: this.id, tier: d.tier, daily: true });
        }, { style: STYLES.gold, size: 14 });
        w.put(this.dailyBtn.root, dail.x + dail.w - 12 - 75, dail.y + 22);
        // ── the rifts, easiest first ──
        const top = body.y + 44 + GAP, h = body.h - 44 - GAP, rw = 590;
        this.rifts = w.section(body.x, top, rw, h);
        const ri = this.rifts.inner, colW = 186;
        this.blurbPx = ts('cap');
        RIFT_TIERS.forEach((t, i) => {
            const y = ri.y + i * ROW_H;
            this.numT.push(w.text(ROMAN[i] ?? '∞', ri.x + 24, y + 26, 18, PAL.ink, { origin: [0.5, 0.5], font: 'head', shadow: false }));
            this.nameT.push(w.text(t.name, ri.x + 54, y + 4, ts('head'), t.color, { font: 'head' }));
            this.blurbT.push(w.text(t.blurb, ri.x + 54, y + 4 + Math.round(ts('head') * 1.2) + 1, this.blurbPx, PAL.cream, { bold: false, wrap: ri.w - 54 - colW - 100 - 16 }));
            this.infoT.push(w.text('', ri.x + ri.w - 100 - 8, y + 5, ts('cap'), PAL.pebble, { origin: [1, 0], bold: false, align: 'right', wrap: colW }));
            const b = button(s, 0, 0, 96, 28, 'Launch', () => ctx.send({ t: 'rift', op: 'launch', id: this.id, tier: i, ...(this.omens.length ? { omens: this.omens } : {}) }), { style: STYLES.gold, size: 14 });
            w.put(b.root, ri.x + ri.w - 48, y + ROW_H - 16 - 4);
            this.go.push(b);
        });
        // ── right column: the party, and the omens ──
        const px = body.x + rw + GAP, pw = body.x + body.w - px;
        this.party = w.section(px, top, pw, Math.round(ts('head') * 1.2) + 12 + 4 + RIFT_PARTY_MAX * 20 + 14, 'Your party', { right: '' });
        for (let i = 0; i < RIFT_PARTY_MAX; i++) this.partyT.push(w.text('', this.party.inner.x + 20, this.party.inner.y + i * 20, ts('body'), PAL.cream, { bold: false }));
        const oy = top + this.party.h + GAP;
        this.omenSec = w.section(px, oy, pw, top + h - oy, 'Omens', { right: '' });
        const oi = this.omenSec.inner;
        this.chipW = Math.floor((oi.w - CHIP_GAP) / 2);
        const noteH = Math.round(ts('cap') * 1.2) + 4;
        const CHIP_H = this.chipH = Math.max(30, Math.min(38, Math.floor((oi.h - noteH) / Math.ceil(OMENS.length / 2)) - CHIP_GAP));
        OMENS.forEach((o, i) => {
            const x = oi.x + (i % 2) * (this.chipW + CHIP_GAP), y = oi.y + Math.floor(i / 2) * (CHIP_H + CHIP_GAP);
            const im = icon(s, o.icon, 0, 0, 2).setPosition(20, CHIP_H / 2);
            const name = label(s, 38, 1, o.name, ts('body'), PAL.cream, { font: 'head' });
            const bonus = label(s, 38, 1 + Math.round(ts('body') * 1.2), `+${Math.round(o.bonus * 100)}%`, ts('cap'), PAL.pebble, { bold: false });
            const zone = s.add.zone(this.chipW / 2, CHIP_H / 2, this.chipW, CHIP_H).setInteractive({ useHandCursor: true });
            const root = s.add.container(0, 0, [im, name, bonus, zone]);
            w.put(root, x, y);
            this.chips.push({ im, name, bonus });
            tipOn(zone, () => ({ title: o.name, color: o.color, sub: `+${Math.round(o.bonus * 100)}% rewards`, subColor: PAL.gold, icon: o.icon, lines: [{ t: o.desc }], foot: this.omens.includes(o.id) ? 'Click to remove' : 'Click to take on' }));
            onTap(zone, () => {
                const at = this.omens.indexOf(o.id);
                if (at >= 0) this.omens.splice(at, 1);
                else if (this.omens.length < OMEN_MAX) this.omens.push(o.id);
                else { playSfx('deny'); return; }
                lastOmens = [...this.omens];
                playSfx('ui');
                this.key = '';
            });
        });
        this.noteT = w.text('', oi.x, oi.y + Math.ceil(OMENS.length / 2) * (CHIP_H + CHIP_GAP), ts('cap'), PAL.pebble, { bold: false, wrap: oi.w });
    }

    private ent () {
        const e = this.ctx.farm.ents[this.id];
        return e && e.k === 'bld' ? e : null;
    }

    update () {
        const dock = this.ent();
        if (!dock) { this.ctx.close(); return; }
        const me = this.ctx.me();
        const farm = this.ctx.farm;
        const near = Object.values(farm.players).filter((p) => p.id !== me.id && p.online && p.downed <= 0 && Math.hypot(p.x - me.x, p.y - me.y) <= 120).slice(0, RIFT_PARTY_MAX - 1);
        const bosses = bossCount(me);
        const k = JSON.stringify([bosses, me.cnt, me.rift ? 1 : 0, countOf(me, 'rift_shard'), near.map((p) => [p.id, p.level]), this.omens, me.daily, farm.clock.day]);
        if (k === this.key) return;
        this.key = k;
        const g = this.g, ri = this.rifts.inner;
        g.clear();
        RIFT_TIERS.forEach((t, i) => {
            const y = ri.y + i * ROW_H;
            const open = bosses >= t.need;
            const cleared = me.cnt?.[`riftwin:${i}`] ?? 0;
            inset(g, ri.x, y, ri.w, ROW_H - 4, open ? PAL.night : PAL.ink, open ? t.color : PAL.slate);
            rect(g, ri.x + 4, y + 4, 5, ROW_H - 12, open ? t.color : PAL.slate);
            // the numeral medallion
            inset(g, ri.x + 12, y + 10, 24, 28, open ? t.color : PAL.slate, PAL.ink);
            this.numT[i].setColor(hex(PAL.ink));
            this.nameT[i].setColor(hex(open ? t.color : PAL.pebble));
            this.blurbT[i].setColor(hex(open ? PAL.cream : PAL.pebble));
            shrinkLines(this.blurbT[i], ROW_H - 12 - Math.round(ts('head') * 1.2), this.blurbPx);
            const guardian = MOBS[t.guardian].name;
            const lines = open
                ? [t.endless ? `Endless · best: wave ${me.cnt?.abyssbest ?? 0}` : `${t.waves} waves · ${t.shards[0]}–${t.shards[1]} shards`, `${guardian} guardian`, `Recommended level ${t.level}`, t.endless ? 'Deeper pays more' : cleared ? `Cleared ${cleared}×` : `First clear: +${t.points} skill point${t.points > 1 ? 's' : ''}`]
                : [`Defeat ${t.need} boss${t.need > 1 ? 'es' : ''} first`, `(you have ${bosses})`];
            this.infoT[i].setText(lines.slice(0, 3).join('\n')).setColor(hex(open ? (cleared ? PAL.lime : PAL.gold) : PAL.berry));
            this.go[i].root.setVisible(open);
            const locked = this.omens.length > 0 && cleared < 1;
            this.go[i].setEnabled(open && !me.rift && !locked);
            this.go[i].setLabel(me.rift ? 'Away' : locked ? 'Clear first' : this.omens.length ? `Launch +${Math.round((omenMul(this.omens) - 1) * 100)}%` : 'Launch');
        });
        // the party
        const names = [{ n: me.name, c: me.color, l: me.level, you: true }, ...near.map((p) => ({ n: p.name, c: p.color, l: p.level, you: false }))];
        this.party.setRight(`${names.length} / ${RIFT_PARTY_MAX}`);
        const pi = this.party.inner;
        for (let i = 0; i < RIFT_PARTY_MAX; i++) {
            const p = names[i];
            const y = pi.y + i * 20;
            rect(g, pi.x + 2, y + 5, 10, 10, p ? PLAYER_COLORS[p.c] : PAL.slate);
            this.partyT[i].setText(p ? `${p.n}${p.you ? ' (you)' : ''} · Lv ${p.l}` : i === names.length ? 'Stand close to bring a friend' : '').setColor(hex(p ? PAL.cream : PAL.slate));
        }
        // the rift of the day
        const day = farm.clock.day;
        const d = dailyRift(farm.serverSeed(), day, bosses);
        const done = me.daily === day;
        if (d.tier < 0) this.dailyT.setText('Defeat a boss to open the rift of the day.').setColor(hex(PAL.pebble));
        else if (done) this.dailyT.setText('Rift of the day cleared. A new one comes with tomorrow.').setColor(hex(PAL.lime));
        else {
            const pct = Math.round((omenMul(d.omens) - 1 + DAILY_BONUS) * 100);
            this.dailyT.setText(`Rift of the day: ${RIFT_TIERS[d.tier].name} · ${d.omens.map((id) => omenOf(id)?.name).join(' + ')} · +${pct}% · +${dailyShards(d.tier)} shards`).setColor(hex(PAL.gold));
        }
        shrinkToFit(this.dailyT, this.rifts.w + this.party.w - 200, 11);
        this.dailyBtn.root.setVisible(d.tier >= 0);
        this.dailyBtn.setEnabled(d.tier >= 0 && !done && !me.rift);
        this.dailyBtn.setLabel(done ? 'Done today' : me.rift ? 'Away' : 'Daily rift');
        // the omens
        const oi = this.omenSec.inner;
        OMENS.forEach((o, i) => {
            const on = this.omens.includes(o.id);
            const x = oi.x + (i % 2) * (this.chipW + CHIP_GAP), y = oi.y + Math.floor(i / 2) * (this.chipH + CHIP_GAP);
            inset(g, x, y, this.chipW, this.chipH, on ? PAL.ink : PAL.night, on ? o.color : PAL.slate);
            if (on) rect(g, x + 3, y + this.chipH - 5, this.chipW - 6, 2, o.color);
            this.chips[i].name.setColor(hex(on ? o.color : PAL.cream));
            this.chips[i].bonus.setColor(hex(on ? PAL.gold : PAL.pebble));
            this.chips[i].im.setAlpha(on ? 1 : 0.7);
        });
        this.omenSec.setRight(this.omens.length ? `+${Math.round((omenMul(this.omens) - 1) * 100)}% rewards` : '', PAL.gold);
        const lockedAll = RIFT_TIERS.every((t, i) => bosses < t.need || (me.cnt?.[`riftwin:${i}`] ?? 0) < 1);
        this.noteT.setText(lockedAll ? 'Clear a rift once to unlock omens.' : this.omens.length ? `${this.omens.length}/${OMEN_MAX} taken · shared by the party` : `Take up to ${OMEN_MAX} curses for bigger rewards.`).setColor(hex(this.omens.length ? PAL.berry : PAL.pebble));
        const shards = countOf(me, 'rift_shard');
        this.foot.setInfo(`${shards} shard${shards === 1 ? '' : 's'}`, shards ? PAL.gold : PAL.pebble);
    }

    destroy () { this.win.destroy(); }
}

/** Lower a wrapped text's size a notch at a time until it is no taller than `maxH` (not below 11). Reset to `px` first. */
function shrinkLines (t: Phaser.GameObjects.Text, maxH: number, px: number) {
    t.setFontSize(px);
    let p = px;
    while (t.height > maxH && p > 11) t.setFontSize(--p);
}

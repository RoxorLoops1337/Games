// The season wish: three wishes on offer on the first morning of a season, a vote, and the winner that blesses everybody until the
// season ends. Opens by itself when a season begins (waits if something else is open) and from the wish chip beside the buffs.

import type * as Phaser from 'phaser';
import { modLine, type StatKey } from '../../../shared/data/stats';
import { seasonIndex, WISH_BY_ID } from '../../../shared/data/wishes';
import { PAL } from '../../../shared/palette';
import { button, GAP, icon, rowBox, ts, Win, type Btn } from '../kit';
import { STYLES } from '../px';
import type { Screen, ScreenCtx } from './types';

export class WishScreen implements Screen {
    private win: Win;
    private g: Phaser.GameObjects.Graphics;
    private key = '';
    private dyn: Phaser.GameObjects.GameObject[] = [];
    private btns: Btn[] = [];

    constructor (private ctx: ScreenCtx, _arg?: unknown) {
        this.win = new Win(ctx.scene, { size: 'medium', title: 'Season wish', icon: 'k_star', accent: PAL.gold, sub: 'The whole farm chooses one blessing, and it lasts until the season ends.', onClose: () => ctx.close() });
        this.g = this.win.put(ctx.scene.add.graphics(), 0, 0);
        this.win.footer({ hint: 'The vote closes when every farmer online has voted, or when night falls.' });
    }

    update () {
        const f = this.ctx.farm, me = this.ctx.me(), w = f.wishState();
        const k = JSON.stringify([w, me.wish, f.clock.day, Object.values(f.players).map((p) => [p.id, p.name, p.online])]);
        if (k === this.key) return;
        this.key = k;
        const win = this.win, s = this.ctx.scene, g = this.g;
        g.clear();
        for (const o of this.dyn) o.destroy();
        for (const b of this.btns) b.root.destroy();
        this.dyn = []; this.btns = [];
        const body = win.body;
        const season = seasonIndex(f.clock.day);
        if (!w || w.k !== season) {
            this.dyn.push(win.text('There is no wish to make right now.', body.x + body.w / 2, body.y + 60, ts('head'), PAL.gold, { origin: [0.5, 0], font: 'head' }));
            this.dyn.push(win.text(season < 1 ? 'The first season has none. From the second one on, a new wish is offered on every season\'s first morning.' : 'A new wish is offered on the first morning of the next season.', body.x + body.w / 2, body.y + 92, ts('body'), PAL.pebble, { origin: [0.5, 0], wrap: body.w - 80, align: 'center', bold: false }));
            return;
        }
        const gap = GAP, cw = Math.floor((body.w - gap * 2) / 3), ch = body.h - 6;
        const daysLeft = 7 * (w.k + 1) - f.clock.day + 1;
        const mine = w.votes[me.id];
        w.opts.forEach((id, i) => {
            const def = WISH_BY_ID[id];
            if (!def) return;
            const x = body.x + i * (cw + gap), y = body.y;
            const won = w.won === id, closed = w.won !== undefined, picked = mine === id;
            rowBox(g, x, y, cw, ch, { on: won || (!closed && picked), accent: won ? PAL.gold : def.color, off: closed && !won });
            const cx = x + cw / 2;
            const im = win.put(icon(s, def.icon, 0, 0, 3), cx, y + 40);
            if (closed && !won) im.setAlpha(0.45);
            this.dyn.push(im);
            this.dyn.push(win.text(def.name, cx, y + 70, ts('head'), won ? PAL.gold : PAL.cream, { origin: [0.5, 0], font: 'head', wrap: cw - 16, align: 'center' }));
            this.dyn.push(win.text(def.blurb, cx, y + 94, ts('body'), PAL.foam, { origin: [0.5, 0], wrap: cw - 20, align: 'center', bold: false }));
            const stats = (Object.entries(def.mods) as [StatKey, number][]).map(([key, v]) => modLine(key, v)).join('\n');
            this.dyn.push(win.text(stats, cx, y + 94 + Math.round(ts('body') * 1.3) * 3 + 6, ts('body'), PAL.lime, { origin: [0.5, 0], wrap: cw - 16, align: 'center', bold: false }));
            // who voted for it
            const who = Object.entries(w.votes).filter(([, v]) => v === id).map(([pid]) => f.players[pid]?.name ?? 'Someone');
            this.dyn.push(win.text(who.length ? `${who.length} vote${who.length === 1 ? '' : 's'}: ${who.join(', ')}` : 'No votes yet', cx, y + ch - 66, ts('cap'), who.length ? PAL.cream : PAL.pebble, { origin: [0.5, 0], wrap: cw - 16, align: 'center', bold: false }));
            if (closed) {
                this.dyn.push(win.text(won ? `Blesses everyone for ${daysLeft} more day${daysLeft === 1 ? '' : 's'}` : 'Not chosen', cx, y + ch - 30, ts('cap'), won ? PAL.gold : PAL.pebble, { origin: [0.5, 0], wrap: cw - 12, align: 'center', font: won ? 'head' : undefined }));
            } else {
                const b = button(s, 0, 0, cw - 24, 28, picked ? 'Your vote' : mine ? 'Change vote' : 'Vote', () => this.ctx.send({ t: 'wish', id }), { style: picked ? STYLES.lime : STYLES.gold, size: 14 });
                b.setEnabled(!picked);
                win.put(b.root, cx, y + ch - 20);
                this.btns.push(b);
            }
        });
    }

    destroy () { this.win.destroy(); }
}

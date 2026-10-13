// "What needs me": ripe crops, machines out of fuel or power, full outputs and chests, each with how many and how far the nearest
// is (sim/needs.ts). Click a row to ping the nearest one: the ping shows on the ground and on the minimap so you can follow it.

import type * as Phaser from 'phaser';
import { PAL } from '../../../shared/palette';
import { needLine, needsOf, whereText, type Need } from '../../../shared/sim/needs';
import { icon, rowBox, ts, Win, onTap, tipOn, Section } from '../kit';
import type { Screen, ScreenCtx } from './types';

const ROW = 52, GAPY = 6;

export class NeedsScreen implements Screen {
    private win: Win;
    private g: Phaser.GameObjects.Graphics;
    private dyn: Phaser.GameObjects.GameObject[] = [];
    private key = '';
    private sec: Section;
    private scan = 0;

    constructor (private ctx: ScreenCtx) {
        this.win = new Win(ctx.scene, { size: 'medium', title: 'What needs you', icon: 'k_flag', accent: PAL.pumpkin, onClose: () => ctx.close(), sub: 'Click one to ping the nearest, then follow the ping.' });
        const w = this.win;
        this.g = w.put(ctx.scene.add.graphics(), 0, 0);
        this.sec = w.section(w.body.x, w.body.y, w.body.w, w.body.h, 'On your farm', { right: '' });
    }

    update (dt: number) {
        this.scan -= dt;
        if (this.scan > 0 && this.key) return;
        this.scan = 0.6;
        const f = this.ctx.farm, me = this.ctx.me();
        const needs = needsOf(f.buildings(), f.fv.statusEnv, f.local);
        const k = JSON.stringify(needs.map((n) => [n.id, n.count, Math.round(n.dist / 16)])) + me.coins * 0;
        if (k === this.key) return;
        this.key = k;
        this.draw(needs);
    }

    private draw (needs: Need[]) {
        const w = this.win, s = this.ctx.scene, g = this.g, inner = this.sec.inner;
        g.clear();
        for (const o of this.dyn) o.destroy();
        this.dyn = [];
        this.sec.setRight(needs.length ? `${needs.length} thing${needs.length === 1 ? '' : 's'}` : '');
        if (!needs.length) {
            this.dyn.push(w.put(icon(s, 'k_star', 0, 0, 3), inner.x + inner.w / 2, inner.y + 70));
            this.dyn.push(w.text('All quiet', inner.x + inner.w / 2, inner.y + 110, ts('head'), PAL.lime, { origin: [0.5, 0], font: 'head' }));
            this.dyn.push(w.text('No ripe crops, nothing blocked, no chest nearly full. Go and explore.', inner.x + inner.w / 2, inner.y + 138, ts('body'), PAL.pebble, { origin: [0.5, 0], wrap: inner.w - 80, align: 'center', bold: false }));
            return;
        }
        const f = this.ctx.farm;
        const rows = Math.max(1, Math.floor(inner.h / (ROW + GAPY)));
        needs.slice(0, rows).forEach((n, i) => {
            const y = inner.y + i * (ROW + GAPY);
            rowBox(g, inner.x, y, inner.w, ROW, { accent: n.rank === 0 ? PAL.lime : n.rank === 1 ? PAL.berry : PAL.pumpkin });
            this.dyn.push(w.put(icon(s, n.icon, 0, 0, 2), inner.x + 28, y + ROW / 2));
            this.dyn.push(w.text(needLine(n), inner.x + 58, y + 8, ts('head'), PAL.cream, { font: 'head' }));
            this.dyn.push(w.text(n.hint, inner.x + 58, y + 8 + Math.round(ts('head') * 1.25), ts('cap'), PAL.pebble, { bold: false, wrap: inner.w - 58 - 140 }));
            this.dyn.push(w.text(whereText(n.x - f.local.x, n.y - f.local.y), inner.x + inner.w - 12, y + ROW / 2, ts('body'), PAL.gold, { origin: [1, 0.5] }));
            const z = w.put(s.add.zone(0, 0, inner.w, ROW).setOrigin(0).setInteractive({ useHandCursor: true }), inner.x, y);
            onTap(z, () => { this.ctx.send({ t: 'ping', x: n.x, y: n.y }); this.ctx.close(); });
            tipOn(z, () => ({ title: 'Ping the nearest', color: PAL.gold, lines: [{ t: 'Marks it on the ground and the minimap for everyone.', c: PAL.pebble }] }));
            this.dyn.push(z);
        });
    }

    destroy () { this.win.destroy(); }
}

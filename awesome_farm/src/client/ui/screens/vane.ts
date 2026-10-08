// The Weather Vane's window: today and the next three days, one row each (a picture for the day and one for the night, the day,
// the season, what it brings in plain words and a coloured tag for the nights that matter) and one line under them about what to
// do. All of it is read from shared/weather.ts and shared/data/forecast.ts, so it is exactly what will happen. Opening it changes
// nothing in the world.

import type * as Phaser from 'phaser';
import { dayIcon, dayLabel, dayWords, eventTag, forecastHint, nightIcon, seasonLabel } from '../../../shared/data/forecast';
import { PAL } from '../../../shared/palette';
import { forecast } from '../../../shared/weather';
import { icon, rowBox, ts, Win, type Footer } from '../kit';
import { hex, rect } from '../px';
import type { Screen, ScreenCtx } from './types';

const ROWS = 4;
const ROW_GAP = 4;

interface Row { day: Phaser.GameObjects.Text; words: Phaser.GameObjects.Text; season: Phaser.GameObjects.Text; tag: Phaser.GameObjects.Text; sky: Phaser.GameObjects.Image; night: Phaser.GameObjects.Image }

export class VaneScreen implements Screen {
    private win: Win;
    private id: number;
    private g: Phaser.GameObjects.Graphics;
    private foot: Footer;
    private rows: Row[] = [];
    private rowH: number;
    private key = '';

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const s = ctx.scene;
        this.id = (arg as { id: number }).id;
        this.win = new Win(s, { size: 'small', title: 'Weather Vane', icon: 'weathervane', accent: PAL.foam, onClose: () => ctx.close() });
        const w = this.win;
        this.foot = w.footer({ hint: '' });
        this.g = w.put(s.add.graphics(), 0, 0);
        const body = w.body;
        this.rowH = Math.floor((body.h - (ROWS - 1) * ROW_GAP) / ROWS);
        for (let i = 0; i < ROWS; i++) {
            const y = body.y + i * (this.rowH + ROW_GAP), cy = y + this.rowH / 2;
            this.rows.push({
                sky: w.put(icon(s, 'k_sun', 0, 0, 2), body.x + 24, cy),
                night: w.put(icon(s, 'k_moon', 0, 0, 2), body.x + 58, cy),
                day: w.text('', body.x + 86, y + 5, ts('head'), PAL.cream, { font: 'head' }),
                tag: w.text('', body.x + 150, y + 6, ts('cap'), PAL.cream, { font: 'head', dark: true }),
                season: w.text('', body.x + body.w - 10, y + 7, ts('cap'), PAL.pebble, { origin: [1, 0], bold: false }),
                words: w.text('', body.x + 86, y + 5 + Math.round(ts('head') * 1.2) + 1, ts('body'), PAL.cream, { bold: false, wrap: body.w - 86 - 10 }),
            });
        }
    }

    update () {
        const e = this.ctx.farm.ents[this.id];
        if (!e || e.k !== 'bld') { this.ctx.close(); return; }
        const f = this.ctx.farm, c = f.clock;
        const k = `${f.serverSeed()}|${c.day}|${Math.floor(c.clock / 5)}`;
        if (k === this.key) return;
        this.key = k;
        const list = forecast(f.serverSeed(), c.day, ROWS);
        const body = this.win.body, g = this.g;
        g.clear();
        list.forEach((d, i) => {
            const y = body.y + i * (this.rowH + ROW_GAP), r = this.rows[i];
            rowBox(g, body.x, y, body.w, this.rowH, { on: i === 0, accent: PAL.foam });
            r.sky.setTexture(dayIcon(d), 0);
            r.night.setTexture(nightIcon(d), 0).setAlpha(d.night ? 1 : 0.7);
            r.day.setText(dayLabel(d)).setColor(hex(i === 0 ? PAL.gold : PAL.cream));
            r.season.setText(seasonLabel(d));
            // the words use two lines if they must, and shrink a little rather than run out of the row
            const room = this.rowH - Math.round(ts('head') * 1.2) - 9;
            r.words.setFontSize(ts('body')).setText(dayWords(d));
            for (let px = ts('body'); r.words.height > room && px > 10;) r.words.setFontSize(--px);
            const tag = eventTag(d);
            if (tag) {
                const x = body.x + 86 + Math.ceil(r.day.width) + 10, ty = y + 5;
                r.tag.setText(tag.text).setVisible(true).setColor(hex(tag.color === PAL.berry ? PAL.cream : PAL.ink));
                this.win.at(r.tag, x + 6, ty + 2);
                rect(g, x - 1, ty - 1, Math.ceil(r.tag.width) + 14, Math.ceil(r.tag.height) + 6, PAL.ink);
                rect(g, x, ty, Math.ceil(r.tag.width) + 12, Math.ceil(r.tag.height) + 4, tag.color);
            } else r.tag.setVisible(false);
        });
        const blood = list.some((d) => d.night === 'bloodmoon');
        this.foot.setHint(forecastHint(list, c.clock), blood ? PAL.gold : PAL.pebble);
    }

    destroy () { this.win.destroy(); }
}

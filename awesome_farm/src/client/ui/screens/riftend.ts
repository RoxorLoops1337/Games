// The end of an expedition: how it went, what you earned, and the boons you carried.

import { ITEMS, iconOf } from '../../../shared/data/items';
import { clock } from '../../../shared/fmt';
import { BOON_BY_ID, RIFT_TIERS } from '../../../shared/data/rift';
import { PAL } from '../../../shared/palette';
import type { SimEvent } from '../../../shared/sim/types';
import { GAP, Slot, tipOn, ts, Win } from '../kit';
import { hex } from '../px';
import { itemTip } from '../tips';
import type { Screen, ScreenCtx } from './types';

type End = Extract<SimEvent, { e: 'riftend' }>;


export class RiftEndScreen implements Screen {
    private win: Win;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const s = ctx.scene;
        const e = arg as End;
        const tier = RIFT_TIERS[e.tier];
        const col = e.win ? PAL.gold : PAL.berry;
        const line = e.endless ? `You cleared ${e.wave} wave${e.wave === 1 ? '' : 's'}. The deeper you go, the more it pays.` : e.win ? 'The guardian is down. Everything you earned is yours.' : 'You keep everything you earned. Try again when you are ready.';
        this.win = new Win(s, { size: 'medium', title: e.endless ? (e.win ? 'Cashed out' : 'The Abyss') : e.win ? 'Rift cleared!' : 'The rift closes', icon: e.win ? 'k_crown' : 'k_skull', accent: col, sub: `${tier.name}: ${line}`, onClose: () => this.done() });
        const w = this.win;
        w.footer({ primary: { label: 'Back to the dock', w: 200, onClick: () => this.done() }, hint: e.win ? 'Spend your shards at a Rift Forge.' : 'You keep every shard and coin you earned.' });
        const body = w.body;
        // how it went
        const stats: [string, string][] = [['Waves', e.endless ? `${e.wave}` : `${e.wave} / ${e.waves}`], ['Monsters', `${e.kills}`], ['Time', clock(e.secs)], ['Boons', `${e.boons.length}`]];
        const row = w.section(body.x, body.y, body.w, 56);
        const cw = row.inner.w / stats.length;
        stats.forEach(([k, v], i) => {
            const cx = row.inner.x + cw * i + cw / 2;
            w.text(v, cx, row.y + 8, 20, PAL.cream, { origin: [0.5, 0], font: 'head' });
            w.text(k, cx, row.y + 8 + 26, ts('cap'), PAL.pebble, { origin: [0.5, 0], bold: false });
        });
        // what you got
        const spoils = w.section(body.x, body.y + 64, body.w, 124, 'Spoils', { right: e.bonus ? `${e.daily !== undefined ? 'Rift of the day' : 'Omens'}: +${e.bonus}% on everything` : '' });
        spoils.right?.setColor(hex(PAL.berry));
        const items: { icon: string; n: number; rarity: number; id?: string }[] = [
            ...e.loot.map(([id, n]) => ({ icon: iconOf(id), n, rarity: ITEMS[id].rarity, id: id as string })),
            ...(e.coins ? [{ icon: 'i_coin', n: e.coins, rarity: 0 }] : []),
        ];
        const si = spoils.inner;
        items.slice(0, 11).forEach((it, i) => {
            const sl = new Slot(s, 0, 0, 44);
            w.putAt(sl.root, si.x + i * 48, si.y);
            sl.set({ icon: it.icon, count: it.n, rarity: it.rarity });
            if (it.id) tipOn(sl.interactive, () => itemTip(it.id as never, { count: it.n }));
        });
        if (!items.length) w.text('Nothing this time.', si.x, si.y + 12, ts('body'), PAL.pebble, { bold: false });
        const ly = si.y + 50;
        w.text(`+${e.xp} experience`, si.x, ly, ts('body'), PAL.lime, { font: 'head' });
        if (e.first && e.points) w.text(`First clear! +${e.points} skill point${e.points > 1 ? 's' : ''}`, si.x + 170, ly, ts('body'), PAL.gold, { font: 'head' });
        if (e.daily) w.text(`Rift of the day: +${e.daily} bonus shards`, si.x + si.w, ly, ts('body'), PAL.gold, { origin: [1, 0], font: 'head' });
        // the boons you took along
        const by = body.y + 64 + 124 + GAP / 2;
        const boons = w.section(body.x, by, body.w, body.y + body.h - by, 'Boons you carried', { right: `${e.boons.length}` });
        const bi = boons.inner;
        e.boons.slice(0, 16).forEach((id, i) => {
            const b = BOON_BY_ID[id];
            if (!b) return;
            const sl = new Slot(s, 0, 0, 30, { iconScale: 1 });
            w.putAt(sl.root, bi.x + i * 34, bi.y);
            sl.set({ icon: b.icon, rarity: b.rarity === 2 ? 4 : b.rarity === 1 ? 2 : 0 });
            tipOn(sl.interactive, () => ({ title: b.name, icon: b.icon, lines: [{ t: b.desc }] }));
        });
        if (!e.boons.length) w.text('None: you fell before the first choice.', bi.x, bi.y + 4, ts('body'), PAL.pebble, { bold: false });
    }

    private done () {
        this.ctx.send({ t: 'rift', op: 'leave' });
        this.ctx.close();
    }

    update () { /* static: everything is drawn once */ }

    destroy () { this.win.destroy(); }
}

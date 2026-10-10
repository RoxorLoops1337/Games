// Combat Arts: the six moves, which ones you know, and which of the three keys each one is on.

import { ART_CODES, ART_LIST, ART_SLOTS, type ArtDef } from '../../../shared/data/arts';
import { SKILLS } from '../../../shared/data/skills';
import { PAL } from '../../../shared/palette';
import { hasUnlock } from '../../../shared/sim/stats';
import { button, deviceText, icon, label, STYLES, Win } from '../kit';
import type { Screen, ScreenCtx } from './types';

type Btn = ReturnType<typeof button>;
const keyName = (i: number) => ART_CODES[i].slice(3);

export class ArtsScreen implements Screen {
    private win: Win;
    private rows: { def: ArtDef; keys: Btn[]; note: ReturnType<typeof label> }[] = [];
    private key = '';

    constructor (private ctx: ScreenCtx) {
        const s = ctx.scene;
        this.win = new Win(s, { size: 'medium', title: 'Combat Arts', icon: 'k_sword', accent: PAL.berry, onClose: () => ctx.close(), sub: `Learn them in the skill tree (Combat). Three can be ready at once, on the ${ART_CODES.map((_, i) => keyName(i)).join(', ')} keys.` });
        const w = this.win, body = w.body, rowH = Math.floor(body.h / ART_LIST.length);
        ART_LIST.forEach((def, i) => {
            const y = body.y + i * rowH;
            w.put(icon(s, def.icon, 0, 0, 3), body.x + 26, y + rowH / 2);
            w.text(def.name, body.x + 58, y + 4, 15, def.color, { font: 'head' });
            w.text(def.blurb, body.x + 58, y + 22, 11, PAL.pebble, { bold: false, wrap: body.w - 250 });
            const note = w.text('', body.x + 58, y + rowH - 16, 11, PAL.lime, { bold: false });
            const keys: Btn[] = [];
            for (let k = 0; k < ART_SLOTS; k++) {
                const b = button(s, 0, 0, 44, 30, keyName(k), () => ctx.send({ t: 'artbind', slot: k, id: def.id }), { style: STYLES.dark, size: 14 });
                w.put(b.root, body.x + body.w - 150 + k * 50, y + rowH / 2);
                keys.push(b);
            }
            this.rows.push({ def, keys, note });
        });
        w.footer({ info: '', hint: deviceText('Click a key to put an art on it. An art is on one key at a time.', 'Tap a key to put an art on it.') });
    }

    update () {
        const me = this.ctx.me();
        const k = JSON.stringify([me.skills, me.arts, me.energy > 0]);
        if (k === this.key) return;
        this.key = k;
        for (const r of this.rows) {
            const known = hasUnlock(me, r.def.token);
            r.note.setText(known ? `${r.def.cd}s cooldown  ·  ${r.def.energy} energy` : `Learn ${SKILLS[r.def.skill].name} in the skill tree`).setColor(known ? '#92d364' : '#d5d9e6');
            r.keys.forEach((b, i) => {
                b.root.setVisible(known);
                b.setStyle(me.arts?.[i] === r.def.id ? STYLES.lime : STYLES.dark);
            });
        }
    }

    destroy () { this.win.destroy(); }
}

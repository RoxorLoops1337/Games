// What the machine and device windows say about the building: a badge, one plain sentence, what to do about it and how fast
// it goes. Both windows read it from sim/status.ts, so the words match the badges and tooltips in the world.

import type * as Phaser from 'phaser';
import { ITEMS } from '../../shared/data/items';
import { PAL } from '../../shared/palette';
import type { Status } from '../../shared/sim/status';
import { badgeTex } from '../art/badges';
import { STATE_WORDS } from '../world/factoryview';
import { icon, ts, Win } from './kit';
import { hex } from './px';

export class StatusBlock {
    private badge: Phaser.GameObjects.Image;
    private text: Phaser.GameObjects.Text;
    private hint: Phaser.GameObjects.Text;
    private note: Phaser.GameObjects.Text;

    constructor (private win: Win, private x: number, private y: number, private w: number) {
        this.badge = win.put(icon(win.scene, badgeTex('wait'), 0, 0, 2), x + 12, y + 12).setVisible(false);
        this.text = win.text('', x, y, ts('head'), PAL.cream, { font: 'head', wrap: w });
        this.hint = win.text('', x, y, ts('body'), PAL.pebble, { bold: false, wrap: w });
        this.note = win.text('', x, y, ts('body'), PAL.foam, { bold: false, wrap: w });
    }

    /**
     * Show a status. `gap` leaves room under the sentence (for a progress bar); returns the y where the sentence ends, and
     * the y under the last line of text.
     */
    set (st: Status, gap = 0) {
        const [, col] = STATE_WORDS[st.state];
        const indent = st.badge ? 32 : 0;
        this.badge.setVisible(!!st.badge);
        if (st.badge) this.badge.setTexture(badgeTex(st.badge), 0);
        this.text.setWordWrapWidth(this.w - indent);
        this.text.setText(st.text).setColor(hex(st.state === 'working' ? PAL.lime : st.state === 'ok' || st.state === 'idle' ? PAL.cream : col));
        this.win.at(this.text, this.x + indent, this.y + 2);
        this.win.at(this.badge, this.x + 12, this.y + Math.max(12, Math.min(20, this.text.height / 2 + 2)));
        const sentenceEnd = this.y + Math.max(28, Math.ceil(this.text.height) + 6);
        this.hint.setText(st.hint).setColor(hex(st.state === 'working' || st.state === 'idle' || st.state === 'ok' ? PAL.pebble : PAL.gold));
        this.win.at(this.hint, this.x, sentenceEnd + gap);
        const rate = st.rate && st.item ? `About ${Math.round(st.rate)} ${ITEMS[st.item].name} a minute.` : '';
        this.note.setText([rate, st.note ?? ''].filter(Boolean).join('  '));
        const noteY = sentenceEnd + gap + (st.hint ? Math.ceil(this.hint.height) + 6 : 0);
        this.win.at(this.note, this.x, noteY);
        return { sentenceEnd, bottom: noteY + (this.note.text ? Math.ceil(this.note.height) : 0) };
    }
}

// A quick-start card shown the first time you play in a browser: six things to know, in the order you will meet them.

import { guideText } from '../../../shared/data/guide';
import type { Say } from '../../../shared/data/tutorial';
import { LAB } from '../../lab';
import { PAL } from '../../../shared/palette';
import { isTouchUi, keyLabel, moveKeys } from '../../input/layout';
import { deviceText, fit, Win } from '../kit';
import { footButton, footHint, PAD, Pane } from '../menukit';
import { inset, STYLES } from '../px';
import type { Screen, ScreenCtx } from './types';

const KEY = 'awesome_farm_welcome_v1';

export const shouldWelcome = () => { if (LAB) return false; try { return !localStorage.getItem(KEY); } catch { return false; } };
export const markWelcomed = () => { try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ } };

/** [icon, title, text]: a text is a string, or [keyboard, phone] where a phone has buttons instead of keys ({move} is your keys). */
const TIPS: [string, string, Say][] = [
    ['k_fist', 'Move and hit', ['{move} to move. Hold Space (or the mouse) near trees, rocks and berries to harvest them. Drops fly to you.', 'Drag the stick (lower left) to move. Hold ACT near trees, rocks and berries to harvest them. Drops fly to you.']],
    ['k_book', 'Follow the journal', ['The tracker at the top left shows what to do next. Press J for the whole story, daily bounties and medals.', 'The tracker at the top left shows what to do next. Tap it for the whole story, daily bounties and medals.']],
    ['k_anvil', 'Craft and build', ['C opens crafting, B the build menu. Start with a workbench, a chest and a campfire. Every level gives a skill point (K).', 'BUILD opens the build menu, MENU > Crafting the crafting. Start with a workbench, a chest and a campfire. Every level gives a skill point (MENU > Skills).']],
    ['k_moon', 'Nights bite', 'Monsters wander out after dark. Stand by a campfire, fight back, or grow strong enough to take on the bosses.'],
    ['k_paw', 'Make friends', ['Learn Taming in the skill tree, craft pods and throw one (T) at a wild creature. They can fight beside you or work in a den.', 'Learn Taming in the skill tree, craft pods and throw one (POD) at a wild creature. They can fight beside you or work in a den.']],
    ['k_flag', 'Find each other', ['Everyone starts far apart. Walk to the sea edge and press E to raise new land towards your friends. G emotes, Enter chats.', 'Everyone starts far apart. Walk to the sea edge and tap USE to raise new land towards your friends.']],
];

export class WelcomeScreen implements Screen {
    private win: Win;

    constructor (private ctx: ScreenCtx) {
        this.win = new Win(ctx.scene, { size: 'large', title: 'Welcome to Awesome Farm', icon: 'k_sprout', accent: PAL.lime, onClose: () => this.done() });
        const w = this.win, p = new Pane(w);
        // six cards, two columns of three, read left to right and down: the order you will meet them in
        const cw = (w.w - 2 * PAD - 12) / 2, ch = 112, top = 52;
        TIPS.forEach(([ic, title, raw], i) => {
            const text = guideText(raw, isTouchUi(), { move: moveKeys(), fish: keyLabel('KeyQ') });
            const col = i % 2, row = Math.floor(i / 2);
            const x = PAD + col * (cw + 12), y = top + row * (ch + 10);
            p.card(x, y, cw, ch);
            inset(p.g, x + 12, y + 12, 56, 56, PAL.ink, PAL.slate);
            p.icon(ic, x + 40, y + 40, 3);
            p.text(`${i + 1}`, x + 20, y + 76, 12, PAL.pebble, { font: 'head', origin: [0.5, 0] });
            p.text(title, x + 82, y + 10, 16, PAL.gold, { font: 'head' });
            const body = p.text(text, x + 82, y + 36, fit(13), PAL.cream, { bold: false, wrap: cw - 98 });
            for (let px = parseFloat(String(body.style.fontSize)); body.height > ch - 44 && px > 11; ) body.setFontSize(--px);
        });
        footButton(w, 'right', 220, "Let's go!", () => this.done(), { style: STYLES.gold });
        footHint(w, PAD, 560).setText(deviceText('You can read all of this again any time: press H, or Esc then How to play.', 'You can read all of this again any time: MENU > How to play.'));
    }

    private done () { markWelcomed(); this.ctx.close(); }

    onKey (k: string) {
        if (k === 'Enter' || k === ' ' || k === 'Escape') { this.done(); return true; }
        return false;
    }

    update () { /* static */ }
    /** Shown once: leaving it any way at all (a hotkey opening another window too) counts as having seen it. */
    destroy () { markWelcomed(); this.win.destroy(); }
}

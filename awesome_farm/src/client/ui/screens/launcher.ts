// The phone's menu: big tiles for every window, because eight tiny icons are hard to hit with a thumb.
//
// Two rows, what you do on top (backpack, crafting, build, blueprints, skills, creatures) and what you look things up in below
// (journal, map, guide, settings). Each tile says in a few words what is behind it. A tile can carry a count (skill points to spend,
// things waiting in the journal). The grid has room for twelve: a new entry is one more row in TILES.

import type * as Phaser from 'phaser';
import { PAL } from '../../../shared/palette';
import { button, deviceText, icon, label, Win } from '../kit';
import { footHint, PAD } from '../menukit';
import { STYLES } from '../px';
import { journalAlerts } from './journal';
import type { Screen, ScreenCtx } from './types';

const TILES: { id: string; label: string; note: string; icon: string; arg?: unknown }[] = [
    { id: 'inventory', label: 'Backpack', note: 'Items and gear', icon: 'k_bag' },
    { id: 'craft', label: 'Crafting', note: 'Make things', icon: 'k_anvil' },
    { id: 'build', label: 'Build', note: 'Place buildings', icon: 'k_hammer' },
    { id: 'blueprints', label: 'Blueprints', note: 'Factory layouts', icon: 'k_target' },
    { id: 'skills', label: 'Skills', note: 'Spend your points', icon: 'k_star' },
    { id: 'creatures', label: 'Creatures', note: 'Your companions', icon: 'k_paw' },
    { id: 'journal', label: 'Journal', note: 'Story and quests', icon: 'k_book' },
    { id: 'map', label: 'World map', note: 'Land and farmers', icon: 'k_map' },
    { id: 'guide', label: 'How to play', note: 'Guides and tips', icon: 'k_sprout' },
    { id: 'look', label: 'Your look', note: 'Change your farmer', icon: 'k_eye' },
    { id: 'menu', label: 'Settings', note: 'Sound, keys, quit', icon: 'k_gear', arg: { tab: 'settings' } },
];
const COLS = 6, TW = 141, TH = 186, GAP = 10, TOP = 52;

export class LauncherScreen implements Screen {
    private win: Win;
    private badges = new Map<string, { root: Phaser.GameObjects.Container; t: Phaser.GameObjects.Text }>();

    constructor (private ctx: ScreenCtx) {
        const s = ctx.scene;
        this.win = new Win(s, { size: 'large', title: 'Menu', icon: 'k_gear', accent: PAL.gold, onClose: () => ctx.close() });
        const w = this.win;
        TILES.forEach((t, i) => {
            const col = i % COLS, row = Math.floor(i / COLS), gold = t.id === 'inventory';
            const cx = PAD + TW / 2 + col * (TW + GAP), cy = TOP + TH / 2 + row * (TH + GAP);
            const b = button(s, 0, 0, TW, TH, '', () => ctx.open(t.id, t.arg), { style: gold ? STYLES.gold : STYLES.dark, size: 14 });
            w.put(b.root, cx, cy);
            w.put(icon(s, t.icon, 0, 0, 5), cx, cy - 36);
            w.text(t.label, cx, cy + 22, 16, gold ? PAL.ink : PAL.cream, { origin: [0.5, 0.5], font: 'head', dark: true });
            w.text(t.note, cx, cy + 48, 12, gold ? PAL.ink : PAL.pebble, { origin: [0.5, 0.5], bold: false, dark: true, wrap: TW - 16, align: 'center' });
            if (t.id === 'skills' || t.id === 'journal') {
                // a count on the corner: what is waiting behind this tile
                const g = s.add.graphics();
                g.fillStyle(PAL.ink, 1).fillCircle(0, 0, 14).fillStyle(PAL.berry, 1).fillCircle(0, 0, 12);
                const num = label(s, 0, 0, '', 14, PAL.snow, { origin: [0.5, 0.5], font: 'head', dark: true, shadow: false });
                const root = s.add.container(0, 0, [g, num]);
                w.putAt(root, cx + TW / 2 - 14, cy - TH / 2 + 14);
                root.setVisible(false);
                this.badges.set(t.id, { root, t: num });
            }
        });
        footHint(w, w.w / 2, 700, true).setText(deviceText('Click a tile to open it. Settings holds the controls, your farmers and Save & quit.', 'Tap a tile to open it. Settings holds the controls, your farmers and Save & quit.'));
    }

    update () {
        const me = this.ctx.me();
        const counts: Record<string, number> = { skills: me.points, journal: journalAlerts(me, this.ctx.farm.prod()) };
        for (const [id, b] of this.badges) {
            const n = counts[id] ?? 0;
            b.root.setVisible(n > 0); b.t.setText(n > 99 ? '99' : `${n}`);
        }
    }

    destroy () { this.win.destroy(); }
}

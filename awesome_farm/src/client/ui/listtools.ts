// Sort and filter for an item list: a Sort button (it walks through Type, Name, Amount, Value, Rarity), a button that turns the order
// round, and a row of category chips (Ores, Seeds, Food…) that narrow the list to one kind of thing. Each window keeps its own choice,
// remembered between visits. The Backpack, the chests and the Market all use it; the logic is in shared/data/itemsort.ts.

import type * as Phaser from 'phaser';
import { FILTER_CATS } from '../../shared/data/filters';
import { iconOf, ItemId } from '../../shared/data/items';
import { cleanPrefs, DEFAULT_PREFS, filterItems, nextSort, presentCats, SORT_MODES, sortItems, type ListPrefs } from '../../shared/data/itemsort';
import { PAL } from '../../shared/palette';
import { isTouchUi } from '../input/layout';
import { BTN_H, button, hideTip, icon, textWidth, tipOn, ts, Win, type Btn } from './kit';
import { STYLES } from './px';

const KEY = 'awesome_farm_listprefs_v1';

function load (scope: string): ListPrefs {
    try { return cleanPrefs((JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>)[scope]); } catch { return { ...DEFAULT_PREFS }; }
}
function save (scope: string, p: ListPrefs) {
    try { const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>; all[scope] = p; localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode */ }
}

export class ListTools {
    prefs: ListPrefs;
    private sortBtn?: Btn;
    private revBtn?: Btn;
    private revTri?: Phaser.GameObjects.Text;
    private chips = new Map<string, { btn: Btn; icon?: Phaser.GameObjects.Image; name: string; n: number }>();
    private allBtn?: Btn;

    /** `scope` names the window ('backpack', 'chest', 'market') so each remembers its own sorting. `onChange` re-fills the list. */
    constructor (private win: Win, private scope: string, private onChange: () => void, private modes = SORT_MODES.map((m) => m.id)) {
        this.prefs = load(scope);
        if (!modes.includes(this.prefs.sort)) this.prefs.sort = modes[0];
    }

    private commit () { save(this.scope, this.prefs); hideTip(); this.sync(); this.onChange(); }

    /** The Sort button and the button that turns the order round: left edge `x`, centre `cy`. Returns the width used. */
    addSort (x: number, cy: number): number {
        const s = this.win.scene, touch = isTouchUi(), size = touch ? 14 : 13;
        const labels = SORT_MODES.filter((m) => this.modes.includes(m.id));
        const bw = Math.max(...labels.map((m) => Math.ceil(textWidth(s, `Sort: ${m.name}`, size, true)))) + 26;
        this.sortBtn = button(s, 0, 0, bw, BTN_H, '', () => { const i = this.modes.indexOf(this.prefs.sort); this.prefs.sort = this.modes[(i + 1) % this.modes.length] ?? nextSort(this.prefs.sort); this.commit(); }, { style: STYLES.dark, size, ink: false });
        this.win.put(this.sortBtn.root, x + bw / 2, cy);
        tipOn(this.sortBtn.zone, () => {
            const m = SORT_MODES.find((q) => q.id === this.prefs.sort)!;
            return { title: `Sorted by ${m.name.toLowerCase()}`, color: PAL.gold, lines: [{ t: m.hint, c: PAL.pebble }], foot: 'Click for the next way to sort' };
        });
        const rw = touch ? 40 : 30;
        this.revBtn = button(s, 0, 0, rw, BTN_H, '', () => { this.prefs.reverse = !this.prefs.reverse; this.commit(); }, { style: STYLES.dark, size: 12, ink: false, sfx: false });
        this.win.put(this.revBtn.root, x + bw + 4 + rw / 2, cy);
        this.revTri = s.add.text(0, 0, '▲', { fontFamily: 'sans-serif', fontSize: '12px', color: '#fff6e0' }).setOrigin(0.5, 0.5);
        this.revBtn.root.add(this.revTri);
        tipOn(this.revBtn.zone, () => ({ title: this.prefs.reverse ? 'Reversed order' : 'Normal order', color: PAL.gold, lines: [{ t: 'Turn the list upside down.', c: PAL.pebble }], foot: 'Click to turn it round' }));
        this.sync();
        return bw + 4 + rw;
    }

    /** The category chips in a row from `x` (centre `cy`), at most `maxW` wide. Returns the width used. */
    addChips (x: number, cy: number, maxW: number): number {
        const s = this.win.scene, touch = isTouchUi(), cw = touch ? 36 : BTN_H, gap = 3, allW = touch ? 46 : 40;
        const fits = Math.floor((maxW - allW - gap) / (cw + gap));
        const cats = FILTER_CATS.slice(0, Math.max(1, fits));
        this.allBtn = button(s, 0, 0, allW, BTN_H, 'All', () => this.pick('all'), { style: STYLES.dark, size: touch ? 14 : 13, ink: false, sfx: false });
        this.win.put(this.allBtn.root, x + allW / 2, cy);
        tipOn(this.allBtn.zone, () => ({ title: 'Everything', color: PAL.gold, lines: [{ t: 'Show all kinds of things.', c: PAL.pebble }] }));
        let px = x + allW + gap;
        for (const c of cats) {
            const b = button(s, 0, 0, cw, BTN_H, '', () => this.pick(c.id), { style: STYLES.dark, size: 12, ink: false, sfx: false });
            const im = icon(s, iconOf(c.icon), 0, 0, 1.5);
            b.root.add(im);
            this.win.put(b.root, px + cw / 2, cy);
            const rec = { btn: b, icon: im, name: c.name, n: 0 };
            this.chips.set(c.id, rec);
            tipOn(b.zone, () => ({ title: c.name, color: PAL.gold, icon: iconOf(c.icon), lines: [{ t: rec.n ? `${rec.n} kind${rec.n === 1 ? '' : 's'} here. ${c.desc}` : `Nothing of this kind here. ${c.desc}`, c: PAL.pebble }], foot: 'Click to show only these' }));
            px += cw + gap;
        }
        this.sync();
        return px - gap - x;
    }

    private pick (cat: string) { this.prefs.cat = this.prefs.cat === cat ? 'all' : cat; this.commit(); }

    private sync () {
        const m = SORT_MODES.find((q) => q.id === this.prefs.sort)!;
        this.sortBtn?.setLabel(`Sort: ${m.name}`);
        this.revTri?.setText(this.prefs.reverse ? '▼' : '▲');
        this.allBtn?.setStyle(this.prefs.cat === 'all' ? STYLES.gold : STYLES.dark);
        for (const [id, c] of this.chips) { c.btn.setStyle(id === this.prefs.cat ? STYLES.gold : STYLES.dark); c.btn.root.setAlpha(c.n || id === this.prefs.cat ? 1 : 0.4); }
        void ts;
    }

    /** Tell the chips what is in the list now, so the ones with nothing behind them fade. */
    present (list: readonly ItemId[]) {
        const have = new Map(presentCats(list).map((p) => [p.id, p.n] as const));
        for (const [id, c] of this.chips) c.n = have.get(id) ?? 0;
        this.sync();
    }

    /** The list as the window should show it: narrowed to the chosen category, then in the chosen order. */
    apply (list: readonly ItemId[], count: (id: ItemId) => number): ItemId[] {
        return sortItems(filterItems(list, this.prefs.cat), this.prefs.sort, count, this.prefs.reverse);
    }

    /** True when a category is chosen (a window can say "nothing of this kind" instead of "empty"). */
    get filtering () { return this.prefs.cat !== 'all'; }
}

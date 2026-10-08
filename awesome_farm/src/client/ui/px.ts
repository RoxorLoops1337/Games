// Storybook UI drawing: wood frames, parchment, brass studs and a red ribbon, all out of flat fills.
// The HUD camera runs at SS device pixels per unit, so shapes may sit on half units: corners are rounded
// in half-unit steps and every edge stays hard. Callers still pass whole-unit layouts.

import { PAL } from '../../shared/palette';
import { SS } from '../res';
import { BRASS, luminance, mix, NEUTRAL_RIMS, OUTLINE, PAPER, RIBBON, RIBBON_FOLD, wellTone, WOOD } from './theme';

type G = Phaser.GameObjects.Graphics;

/** Snap a coordinate to a whole device pixel. */
const q = (v: number) => Math.round(v * SS) / SS;

export function rect (g: G, x: number, y: number, w: number, h: number, color: number, alpha = 1) {
    const x0 = q(x), y0 = q(y), x1 = q(x + w), y1 = q(y + h);
    if (x1 <= x0 || y1 <= y0) return;
    g.fillStyle(color, alpha).fillRect(x0, y0, x1 - x0, y1 - y0);
}

/**
 * A rectangle with rounded corners of radius `r` units. One draw command per shape: panels are redrawn
 * (or at least replayed) every frame, so the number of commands is what a phone feels.
 */
export function notch (g: G, x: number, y: number, w: number, h: number, color: number, alpha = 1, r = 2) {
    x = q(x); y = q(y); w = q(w); h = q(h);
    if (w <= 0 || h <= 0) return;
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    if (r < 0.5) { rect(g, x, y, w, h, color, alpha); return; }
    g.fillStyle(color, alpha).fillRoundedRect(x, y, w, h, r);
}

export interface PanelStyle {
    fill: number;
    rim: number;          // an accent line inside the frame, when it is not one of the neutral colours
    hi?: number;
    lo?: number;
    outline?: number;
    shadow?: boolean;
    r?: number;
    /** card: wood frame + paper. well: a recess on a page. plank: bare wood. chip: a coloured button face. */
    kind?: 'card' | 'well' | 'plank' | 'chip';
    /** The face colour when this style is used for a button or chip. */
    btn?: number;
}

export const STYLES = {
    dark:   { kind: 'card', fill: PAPER.base, rim: PAL.slate, hi: PAL.dusk, lo: PAL.ink, btn: WOOD[2] } as PanelStyle,
    deep:   { kind: 'well', fill: PAPER.well, rim: PAL.night, hi: PAL.night, lo: PAL.ink, btn: WOOD[1] } as PanelStyle,
    cream:  { kind: 'card', fill: PAPER.base, rim: PAL.sand, hi: PAL.snow, lo: PAL.sand, btn: PAPER.base } as PanelStyle,
    wood:   { kind: 'plank', fill: WOOD[2], rim: WOOD[1], hi: WOOD[3], lo: WOOD[0], btn: WOOD[3] } as PanelStyle,
    gold:   { kind: 'chip', fill: 0xe3b155, rim: PAL.pumpkin, hi: PAL.snow, lo: PAL.pumpkin, btn: 0xe9b95a } as PanelStyle,
    plum:   { kind: 'chip', fill: 0x8b5cc8, rim: PAL.plum, hi: PAL.plum, lo: PAL.ink, btn: 0x8b5cc8 } as PanelStyle,
    lime:   { kind: 'chip', fill: 0x4a9a4a, rim: PAL.pine, hi: PAL.lime, lo: PAL.pine, btn: 0x4a9a4a } as PanelStyle,
    berry:  { kind: 'chip', fill: 0xc9505a, rim: PAL.bark, hi: PAL.blossom, lo: PAL.bark, btn: 0xc9505a } as PanelStyle,
    sea:    { kind: 'chip', fill: 0x3f8fbf, rim: PAL.deepSea, hi: PAL.foam, lo: PAL.deepSea, btn: 0x3f8fbf } as PanelStyle,
};

/** A deterministic scatter: the same panel always gets the same flecks, so nothing shimmers on redraw. */
function scatter (seed: number) {
    let s = (seed ^ 0x9e3779b9) >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** The paper page, with its ruled edge, flecks, an optional accent line and a stitched border. */
function page (g: G, x: number, y: number, w: number, h: number, fill: number, r: number, accent: number | undefined, stitched: boolean) {
    notch(g, x, y, w, h, PAPER.edge, 1, r);
    notch(g, x + 0.5, y + 0.5, w - 1, h - 1, PAPER.lo, 1, r);
    if (accent !== undefined) {
        notch(g, x + 1.5, y + 1.5, w - 3, h - 3, accent, 1, Math.max(0.5, r - 1));
        notch(g, x + 2.5, y + 2.5, w - 5, h - 5, fill, 1, Math.max(0.5, r - 1.5));
    } else {
        notch(g, x + 2, y + 2, w - 4, h - 4, fill, 1, Math.max(0.5, r - 1.5));
    }
    const rnd = scatter(Math.round(w * 131 + h * 977));
    const n = Math.min(26, Math.floor((w * h) / 900));
    const x0 = x + 4, y0 = y + 4, iw = w - 8, ih = h - 8;
    if (iw > 4 && ih > 4) {
        for (let i = 0; i < n; i++) {
            const fx = x0 + Math.floor(rnd() * iw * SS) / SS, fy = y0 + Math.floor(rnd() * ih * SS) / SS, k = rnd();
            rect(g, fx, fy, k < 0.5 ? 1 : 0.5, 0.5, k < 0.5 ? PAPER.hi : PAPER.speck, k < 0.5 ? 0.9 : 0.8);
        }
    }
    if (stitched) {
        // a ruled margin: four hairlines
        const m = 5.5;
        rect(g, x + m, y + m, w - 2 * m, 0.5, PAPER.edge, 0.5); rect(g, x + m, y + h - m - 0.5, w - 2 * m, 0.5, PAPER.edge, 0.5);
        rect(g, x + m, y + m, 0.5, h - 2 * m, PAPER.edge, 0.5); rect(g, x + w - m - 0.5, y + m, 0.5, h - 2 * m, PAPER.edge, 0.5);
    }
}

function stud (g: G, x: number, y: number) {
    rect(g, x, y, 2, 2, BRASS.mid);
    rect(g, x, y, 1, 1, BRASS.hi);
    rect(g, x + 1, y + 1, 1, 1, BRASS.lo);
}

/** A framed card: wood outside, a paper page inside. */
function card (g: G, x: number, y: number, w: number, h: number, s: PanelStyle, r: number) {
    const big = w >= 110 && h >= 56;
    const accent = s.rim !== undefined && !NEUTRAL_RIMS.has(s.rim) ? s.rim : undefined;
    if (s.shadow) notch(g, x + 0.5, y + 2, w, h, OUTLINE, 0.32, r);
    notch(g, x, y, w, h, s.outline ?? WOOD[0], 1, r);
    notch(g, x + 1, y + 1, w - 2, h - 2, WOOD[1], 1, Math.max(0.5, r - 0.5));
    // the frame is lit from the top left
    rect(g, x + r, y + 1, w - 2 * r, 1, WOOD[3]);
    rect(g, x + 1, y + r, 1, h - 2 * r, WOOD[3]);
    if (big) { rect(g, x + r, y + 2, w - 2 * r, 1, WOOD[2]); rect(g, x + 2, y + r, 1, h - 2 * r, WOOD[2]); }
    rect(g, x + r, y + h - 2, w - 2 * r, 1, WOOD[0], 0.7);
    rect(g, x + w - 2, y + r, 1, h - 2 * r, WOOD[0], 0.7);
    const f = big ? 4 : 3;
    const fill = luminance(s.fill) < 0.12 ? PAPER.base : s.fill;
    page(g, x + f, y + f, w - 2 * f, h - 2 * f, fill, Math.max(1, r - 1), accent, big && w >= 150 && h >= 80);
    if (big) { stud(g, x + 2, y + 2); stud(g, x + w - 4, y + 2); stud(g, x + 2, y + h - 4); stud(g, x + w - 4, y + h - 4); }
}

/** A recess: a darker patch of page with a wooden lip. */
function well (g: G, x: number, y: number, w: number, h: number, s: PanelStyle, r: number) {
    const accent = s.rim !== undefined && !NEUTRAL_RIMS.has(s.rim) ? s.rim : undefined;
    if (s.shadow) notch(g, x + 0.5, y + 2, w, h, OUTLINE, 0.28, r);
    notch(g, x, y, w, h, s.outline ?? WOOD[1], 1, r);
    const fill = luminance(s.fill) < 0.12 ? PAPER.well : s.fill;
    if (accent !== undefined) {
        notch(g, x + 1, y + 1, w - 2, h - 2, accent, 1, Math.max(0.5, r - 0.5));
        notch(g, x + 2, y + 2, w - 4, h - 4, fill, 1, Math.max(0.5, r - 1));
    } else {
        notch(g, x + 1, y + 1, w - 2, h - 2, fill, 1, Math.max(0.5, r - 0.5));
    }
    // a little shade along the top and left, a little light along the bottom: pressed into the page
    rect(g, x + r, y + 1.5, w - 2 * r, 1, WOOD[0], 0.14);
    rect(g, x + 1.5, y + r, 1, h - 2 * r, WOOD[0], 0.1);
    rect(g, x + r, y + h - 2.5, w - 2 * r, 1, PAPER.hi, 0.6);
}

function plank (g: G, x: number, y: number, w: number, h: number, s: PanelStyle, r: number) {
    if (s.shadow) notch(g, x + 0.5, y + 2, w, h, OUTLINE, 0.32, r);
    notch(g, x, y, w, h, WOOD[0], 1, r);
    notch(g, x + 1, y + 1, w - 2, h - 2, s.fill, 1, Math.max(0.5, r - 0.5));
    rect(g, x + r, y + 1, w - 2 * r, 1.5, WOOD[3]);
    rect(g, x + r, y + h - 2.5, w - 2 * r, 1.5, WOOD[1]);
}

/** A button face: a lit top edge, a darker lip below and a soft shadow under it. */
export function face (g: G, x: number, y: number, w: number, h: number, base: number, o: { down?: boolean; hover?: boolean; off?: boolean } = {}) {
    if (o.off) base = mix(base, 0xb8a58a, 0.62);
    else if (o.hover) base = mix(base, 0xffffff, 0.14);
    const r = Math.min(2, h / 4);
    if (!o.down) notch(g, x, y + 1.5, w, h, OUTLINE, 0.34, r);
    notch(g, x, y, w, h, mix(base, OUTLINE, 0.62), 1, r);
    notch(g, x + 1, y + 1, w - 2, h - 2, base, 1, Math.max(0.5, r - 0.5));
    if (h >= 14) {
        const lip = Math.min(3, Math.floor(h / 6));
        rect(g, x + 1.5, y + h - 1 - lip, w - 3, lip, mix(base, OUTLINE, 0.18));
        rect(g, x + 1.5, y + h - 2, w - 3, 1, mix(base, OUTLINE, 0.36));
    } else {
        rect(g, x + 1.5, y + h - 2.5, w - 3, 1.5, mix(base, OUTLINE, 0.22));
    }
    rect(g, x + r, y + 1, w - 2 * r, 1, mix(base, 0xffffff, 0.38));
}

/** Frame, rim, fill; the look depends on the style's kind. */
export function panel (g: G, x: number, y: number, w: number, h: number, s: PanelStyle = STYLES.dark) {
    x = q(x); y = q(y); w = q(w); h = q(h);
    const r = s.r ?? 2;
    switch (s.kind ?? 'card') {
        case 'well': well(g, x, y, w, h, s, r); break;
        case 'plank': plank(g, x, y, w, h, s, r); break;
        case 'chip': face(g, x, y, w, h, s.btn ?? s.fill, {}); break;
        default: card(g, x, y, w, h, s, r);
    }
}

/** A recessed well (item slots, picture windows, bars' troughs). Dark-theme fills become paper tones. */
export function inset (g: G, x: number, y: number, w: number, h: number, fill = PAL.ink, border = PAL.night) {
    const accent = !NEUTRAL_RIMS.has(border) ? border : undefined;
    const f = wellTone(fill);
    notch(g, x, y, w, h, WOOD[1], 1, 1);
    if (accent !== undefined) {
        notch(g, x + 1, y + 1, w - 2, h - 2, accent, 1, 0.5);
        notch(g, x + 2, y + 2, w - 4, h - 4, f, 1, 0.5);
    } else {
        notch(g, x + 1, y + 1, w - 2, h - 2, f, 1, 0.5);
    }
    rect(g, x + 1.5, y + 1.5, w - 3, 1, WOOD[0], 0.2);
    rect(g, x + 1.5, y + 1.5, 1, h - 3, WOOD[0], 0.12);
}

/** Rarity: the line under a slot and, on paper, the text colour. Common is a quiet taupe. */
export const RARITY_COLORS = [0xb9a98c, 0x5cb04f, 0x3f8fd8, 0x8b5cc8, 0xe0a020];
export const RARITY_TEXT = [0x6e5038, 0x2a6e34, 0x1a5f94, 0x63379f, 0x8a4e08];

export function slotBox (g: G, x: number, y: number, size: number, rarity = 0, o: { hover?: boolean; empty?: boolean; selected?: boolean; locked?: boolean } = {}) {
    inset(g, x, y, size, size, o.locked ? PAL.ink : o.empty ? PAL.slate : PAL.night, PAL.slate);
    if (!o.empty) {
        const c = RARITY_COLORS[rarity];
        rect(g, x + 3, y + size - 4, size - 6, 1.5, c, rarity ? 1 : 0.7);
        if (rarity >= 2) { rect(g, x + 2.5, y + 2.5, 2, 2, c); rect(g, x + size - 4.5, y + 2.5, 2, 2, c); }
    }
    if (o.hover) g.lineStyle(1.5, WOOD[3], 1).strokeRect(x + 1, y + 1, size - 2, size - 2);
    if (o.selected) g.lineStyle(1.5, BRASS.lo, 1).strokeRect(x + 1, y + 1, size - 2, size - 2);
}

/** A progress bar: a dark wooden trough, a fill with a lit top and a shaded bottom, and tick marks. */
export function bar (g: G, x: number, y: number, w: number, h: number, frac: number, color: number, o: { back?: number; ticks?: number; flash?: boolean } = {}) {
    notch(g, x, y, w, h, WOOD[0], 1, 1);
    notch(g, x + 1, y + 1, w - 2, h - 2, WOOD[1], 1, 0.5);
    rect(g, x + 1.5, y + 1.5, w - 3, h - 3, 0x3a2420);
    const iw = w - 3, fw = Math.round(iw * Math.max(0, Math.min(1, frac)) * SS) / SS;
    if (fw > 0) {
        rect(g, x + 1.5, y + 1.5, fw, h - 3, color);
        rect(g, x + 1.5, y + 1.5, fw, Math.max(1, Math.floor((h - 3) / 3)), 0xffffff, o.flash ? 0.6 : 0.34);
        rect(g, x + 1.5, y + h - 2.5, fw, 1, OUTLINE, 0.28);
    }
    if (o.ticks) for (let i = 1; i < o.ticks; i++) rect(g, x + 1.5 + Math.round((iw * i) / o.ticks), y + 1.5, 0.5, h - 3, OUTLINE, 0.4);
}


/**
 * A red ribbon with folded tails, centred on (cx, cy): the title banner of a window.
 * The band is `w` wide; the tails stick out a little past each end.
 */
export function ribbon (g: G, cx: number, cy: number, w: number, h = 24) {
    const x0 = q(cx - w / 2), y0 = q(cy - h / 2), tail = 15, drop = 4;
    const ol = mix(RIBBON[1], OUTLINE, 0.6);
    for (const side of [-1, 1]) {
        const inner = side < 0 ? x0 + 4 : x0 + w - 4, outer = side < 0 ? x0 - tail : x0 + w + tail;
        const top = y0 + drop, bot = y0 + h + drop - 2, mid = (top + bot) / 2, notchX = outer - side * 5;
        // a swallow-tail: three triangles make the notched end
        g.fillStyle(RIBBON[0], 1);
        g.fillTriangle(inner, top, outer, top, notchX, mid);
        g.fillTriangle(inner, top, notchX, mid, inner, bot);
        g.fillTriangle(notchX, mid, outer, bot, inner, bot);
        g.lineStyle(1, ol, 1);
        g.lineBetween(inner, top, outer, top); g.lineBetween(outer, top, notchX, mid); g.lineBetween(notchX, mid, outer, bot); g.lineBetween(outer, bot, inner, bot);
        // the fold: a dark triangle where the tail tucks behind the band
        const fx = side < 0 ? x0 : x0 + w;
        g.fillStyle(RIBBON_FOLD, 1).fillTriangle(fx, y0 + h, fx - side * 4, y0 + h, fx, y0 + h + drop);
    }
    notch(g, x0 - 1, y0 - 1, w + 2, h + 2, ol, 1, 2);
    notch(g, x0, y0, w, h, RIBBON[1], 1, 1.5);
    rect(g, x0 + 1.5, y0 + 1, w - 3, 1.5, RIBBON[3]);
    rect(g, x0 + 1.5, y0 + 2.5, w - 3, 1.5, RIBBON[2]);
    rect(g, x0 + 1.5, y0 + h - 3, w - 3, 2, RIBBON[0]);
}

export function hex (n: number) { return '#' + n.toString(16).padStart(6, '0'); }

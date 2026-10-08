// The UI kit every screen is built from: the text scale and the small-screen rules, labels, icons and buttons, and (through
// its re-exports) the tooltip (ui/tooltip.ts), the parts (ui/parts.ts), the window (ui/win.ts) and the toasts (ui/toasts.ts).
// Screens live in HudScene (zoom 1, 960×540); nothing here touches the world camera.

import * as Phaser from 'phaser';
import { PAL } from '../../shared/palette';
import { isTouchUi } from '../input/layout';
import { playSfx } from '../juice/sfx';
import { SS } from '../res';
import { touchWords } from './gestures';
import { face, hex, inset, panel, PanelStyle, rect, RARITY_COLORS, STYLES } from './px';
import { luminance, onPaper, PAPER, TEXT, WOOD } from './theme';
import { onTap } from './tooltip';

/** Display face: window titles, buttons and big numbers. Round and friendly, like a storybook. */
const FONT = '"Fredoka", "Trebuchet MS", sans-serif';
/** The chunky pixel face, kept for the logo. */
const FONT_PIXEL = '"Pixelify Sans", "Trebuchet MS", sans-serif';
/**
 * Text face for everything small. Pixelify Sans is not built on a clean pixel grid, so at HUD sizes the
 * browser smooths its edges and the pixel-art scaling then magnifies the smudge. Jersey 15 stays a chunky
 * pixel font but renders with crisp, even strokes. It runs a little smaller than Pixelify, hence the scale.
 */
export const FONT_TEXT = '"Jersey 15", "Pixelify Sans", "Trebuchet MS", sans-serif';
const DISPLAY_MIN = 19;          // this size and up uses the display face
export const TEXT_SCALE = 1.2;
/** The smallest body text on a small screen (a size of 12 draws 14 px tall: about 10 CSS px on a phone). */
const MIN_BODY = 12;
export const W = 960;
export const H = 540;
export type Obj = Phaser.GameObjects.GameObject;
/** A game object a window can place: anything with a position (texts, images, graphics, zones, containers). */
export type Placed = Obj & Pick<Phaser.GameObjects.Components.Transform, 'setPosition'>;

// ── small screens ──────────────────────────────────────────────────────────
// The HUD is laid out in 960×540 and scaled to fit the window, so on a phone every logical unit is under a CSS pixel.
let hudScaleOf: () => number = () => 1;
/** Where the scale comes from (the HUD scene hands over the canvas size). */
export const setHudScaleSource = (f: () => number) => { hudScaleOf = f; };
/** How large the HUD is drawn right now: 1 = one logical unit per CSS pixel, 0.69 on a 667×375 phone. */
const hudScale = () => Math.max(0.2, hudScaleOf());
/** Is the HUD drawn small enough that its 10–12 unit text turns hard to read? */
export const smallScreen = () => hudScale() < 0.85;
/** A text size raised on small screens (about 1.27× at a scale of 0.69): use it for the text people read most, where there is room. */
export const fit = (size: number) => (smallScreen() ? Math.round(size * Math.min(1.6, 0.88 / hudScale())) : size);
type Text = Phaser.GameObjects.Text;

// ── the house style ────────────────────────────────────────────────────────
// Every window is one of three sizes, centred, with the same skeleton: a red ribbon title, the close button in the top-right
// corner, a toolbar row (tabs left, search right) when it needs one, the content in sections, and ONE footer row (secondary
// buttons and notes on the left, the hint between, the primary action in gold on the right). Spacing is an 8-unit grid.
/** The three window sizes: a small dialog, a medium window and a large one that fills nearly the whole 960×540 screen. */
export const WIN_SIZES = { small: { w: 420, h: 300 }, medium: { w: 640, h: 400 }, large: { w: 936, h: 512 } } as const;
export type WinSize = keyof typeof WIN_SIZES;
/** The one text scale: title 20, heading 14, body 12, caption 11. */
const TS = { title: 20, head: 14, body: 12, cap: 11 } as const;
/** A size of the text scale, raised on a small screen so it reads on a phone (the window has room for it). */
export const ts = (k: keyof typeof TS) => (k === 'title' ? TS.title : fit(TS[k]));
/** Space between related things, and between groups (the 8-unit grid). */
export const GAP = 8, PAD = 16;
/** A button's height on a computer (a phone draws it taller: see button()). */
export const BTN_H = 28;
export interface Rect { x: number; y: number; w: number; h: number }

// ── words for the device ────────────────────────────────────────────────────
/** One line for a mouse, one for a finger: hint text names what the player really has. */
export const deviceText = (mouse: string, touch: string) => (isTouchUi() ? touch : mouse);

/** `touchWords` on a phone, the line as it is on a computer. */
export const forDevice = (s: string) => (isTouchUi() ? touchWords(s) : s);

// ── text ───────────────────────────────────────────────────────────────────
export interface LabelOpts {
    /** Draw as text on something dark or coloured (a ribbon, a button, the world): no paper tones, ink shadow. */
    dark?: boolean;
    /** Use the heading face (Fredoka) even at small sizes; 'pixel' keeps the old chunky display face. */
    font?: 'head' | 'pixel';
    stroke?: boolean | number;
    shadow?: boolean;
    align?: 'left' | 'center' | 'right';
    origin?: [number, number];
    wrap?: number;
    bold?: boolean;
    spacing?: number;
}

export function label (scene: Phaser.Scene, x: number, y: number, s: string, size = 14, color: number = PAL.cream, o: LabelOpts = {}): Text {
    const display = o.font === 'head' || o.font === 'pixel' || size >= DISPLAY_MIN;
    const family = o.font === 'pixel' ? FONT_PIXEL : display ? FONT : FONT_TEXT;
    const onPage = !o.dark && !o.stroke;
    // on a small screen the little body text (9–11) is raised to MIN_BODY so it stays readable
    if (!display && size < MIN_BODY && smallScreen()) size = MIN_BODY;
    const t = scene.add.text(Math.round(x), Math.round(y), s, {
        fontFamily: family, fontSize: `${display ? size : Math.round(size * TEXT_SCALE)}px`, fontStyle: display && o.bold !== false ? (o.font === 'pixel' ? 'bold' : '600') : 'normal', color: hex(onPage ? onPaper(color) : color),
        align: o.align ?? 'left', lineSpacing: o.spacing ?? 2,
        wordWrap: o.wrap ? { width: o.wrap } : undefined, resolution: SS,
    });
    if (o.stroke) t.setStroke(hex(PAL.ink), o.stroke === true ? Math.max(3, Math.round(size / 4)) : o.stroke);
    else if (o.shadow !== false) { if (onPage) t.setShadow(0.5, 0.5, hex(PAPER.hi), 0, false, true); else t.setShadow(0.5, 1, hex(WOOD[0]), 0, false, true); }
    t.setOrigin(...(o.origin ?? [0, 0]));
    if (onPage) {
        // screens recolour their text later with setColor(hex(PAL.x)): keep those paper-safe too
        const raw = t.setColor.bind(t);
        t.setColor = ((c: string) => raw(typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? hex(onPaper(parseInt(c.slice(1), 16))) : c)) as typeof t.setColor;
    }
    return t;
}

/** Lower a text's font size a notch at a time until it is no wider than `maxW` (not below `minPx`). Set the size you want first. */
export function shrinkToFit (t: Text, maxW: number, minPx = 12) {
    let px = parseFloat(String(t.style.fontSize));
    while (t.width > maxW && px > minPx) t.setFontSize(--px);
    return t;
}

/** How wide a piece of text comes out (a throw-away text object measures it). */
export function textWidth (scene: Phaser.Scene, s: string, size = 14, head = false): number {
    const t = label(scene, 0, 0, s, size, PAL.cream, head ? { font: 'head' } : { bold: false });
    const w = t.width;
    t.destroy();
    return w;
}

export function icon (scene: Phaser.Scene, key: string, x: number, y: number, scale = 2): Phaser.GameObjects.Image {
    return scene.add.image(Math.round(x), Math.round(y), key, 0).setScale(scale);
}

// ── buttons ────────────────────────────────────────────────────────────────
export interface Btn {
    root: Phaser.GameObjects.Container;
    setLabel (s: string): void;
    setEnabled (on: boolean): void;
    setStyle (s: PanelStyle): void;
    zone: Phaser.GameObjects.Zone;     // the hit area (for tooltips)
    w: number; h: number;
}

export function button (
    scene: Phaser.Scene, x: number, y: number, w: number, h: number, text: string, onClick: () => void,
    o: { style?: PanelStyle; size?: number; icon?: string; iconScale?: number; ink?: boolean; sfx?: boolean } = {},
): Btn {
    let style = o.style ?? STYLES.gold;
    const g = scene.add.graphics();
    const lightFace = (st: PanelStyle) => luminance(st.btn ?? st.fill) > 0.32;
    let ink = o.ink ?? lightFace(style);            // dark lettering on a light face (gold, lime); it follows the face when setStyle changes it
    const t = label(scene, 0, 0, text, o.size ?? 14, ink ? TEXT.ink : TEXT.cream, { origin: [0.5, 0.5], dark: true, font: 'head', shadow: !ink });
    const im = o.icon ? icon(scene, o.icon, 0, 0, o.iconScale ?? 2) : null;
    // on a phone buttons are drawn at least 36 high and can be hit from a 44 × 44 area around their centre
    const touch = isTouchUi();
    const dh = touch ? Math.max(h, 36) : h;
    const zone = scene.add.zone(0, 0, touch ? Math.max(w, 44) : w, touch ? Math.max(h, 44) : h).setInteractive({ useHandCursor: true });
    const root = scene.add.container(x, y, [g, t, ...(im ? [im] : []), zone]);
    let enabled = true, hover = false, down = false;
    const draw = () => {
        g.clear();
        const dy = down ? 1 : 0;
        face(g, -w / 2, -dh / 2 + dy, w, dh, style.btn ?? style.fill, { down, hover, off: !enabled });
        t.setColor(hex(ink || !enabled ? TEXT.ink : TEXT.cream)).setY(dy - 1).setAlpha(enabled ? 1 : 0.6);
        if (im) { im.setY(dy); im.setAlpha(enabled ? 1 : 0.5); }
        if (im) { im.setX(-t.width / 2 - 8); t.setX(12); }
    };
    zone.on('pointerover', () => { hover = true; draw(); });
    zone.on('pointerout', () => { hover = false; down = false; draw(); });
    zone.on('pointerdown', () => { down = true; draw(); });
    zone.on('pointerup', () => { down = false; draw(); });
    onTap(zone, () => { if (!enabled) { playSfx('deny'); return; } if (o.sfx !== false) playSfx('ui'); onClick(); });
    draw();
    return {
        root, w, h, zone,
        setLabel (s) { t.setText(s); draw(); },
        setEnabled (on) { enabled = on; zone.input!.cursor = on ? 'pointer' : 'default'; draw(); },
        setStyle (s) { style = s; ink = o.ink ?? lightFace(s); t.setShadow(0.5, 1, hex(WOOD[0]), 0, false, !ink); draw(); },
    };
}

/** Show or hide a button: hidden ones cannot be pressed either. */
export function showBtn (b: Btn, on: boolean) {
    b.root.setVisible(on);
    if (b.zone.input) b.zone.input.enabled = on;
}

// ── the rest of the kit: tooltips and taps, the parts, the window, the toasts ──
export * from './tooltip';
export * from './parts';
export * from './win';
export * from './toasts';

// re-exports for screens
export { hex, inset, panel, rect, RARITY_COLORS, STYLES };

// Keyboard layouts. Movement (and the fishing key) follow the key POSITIONS, not the letters printed on the
// caps: the "WASD" block is whatever sits there on your keyboard (ZQSD on AZERTY, and so on), so every layout
// plays the same. The layout only changes the hint text, which names the keys you actually have.
//
// Detection, strongest first: your setting, what the browser says the keys are (Chromium's keyboard map),
// letters seen in real key presses (remembered), then a guess from the browser language.

import { KEY_LAYOUTS, type PhysKey } from '../../shared/data/controls';
import { settings } from '../settings';

export type KeyboardSetting = 'auto' | 'qwerty' | 'azerty';
export const KEYBOARD_CHOICES: KeyboardSetting[] = ['auto', 'qwerty', 'azerty'];

/** The physical keys the game cares about, by KeyboardEvent.code. */
type Phys = PhysKey;

const PHYS: Phys[] = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ'];
const QWERTY = KEY_LAYOUTS.qwerty;
const AZERTY = KEY_LAYOUTS.azerty;
const STORE = 'awesome_farm_keys_v1';
// old browsers send no `code`: fall back on the old key codes (these only ever name the QWERTY positions)
const BY_KEYCODE: Record<number, Phys> = { 87: 'KeyW', 65: 'KeyA', 83: 'KeyS', 68: 'KeyD', 81: 'KeyQ' };

const seen: Partial<Record<Phys, string>> = {};   // letters learned from key presses
let mapped: Partial<Record<Phys, string>> = {};   // letters from the browser's keyboard map
try { Object.assign(seen, JSON.parse(localStorage.getItem(STORE) ?? '{}')); } catch { /* private mode / bad JSON */ }

const down = new Set<Phys>();
const fresh = new Set<Phys>();

const isLetter = (s: unknown): s is string => typeof s === 'string' && /^\p{L}$/u.test(s);

function physOf (e: KeyboardEvent): Phys | null {
    if (e.code) return (PHYS as string[]).includes(e.code) ? e.code as Phys : null;
    return BY_KEYCODE[e.keyCode] ?? null;     // no `code` at all: the key is all we have
}

const typing = (e: Event) => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};

function learn (e: KeyboardEvent) {
    if (!e.code || e.ctrlKey || e.metaKey || e.altKey || !isLetter(e.key)) return;
    const p = e.code as Phys;
    if (!PHYS.includes(p)) return;
    const ch = e.key.toUpperCase();
    if (seen[p] === ch) return;
    seen[p] = ch;
    try { localStorage.setItem(STORE, JSON.stringify(seen)); } catch { /* ignore */ }
}

if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
        if (typing(e)) return;
        learn(e);
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const p = physOf(e);
        if (!p) return;
        down.add(p);
        if (!e.repeat) fresh.add(p);
    });
    window.addEventListener('keyup', (e) => { const p = physOf(e); if (p) down.delete(p); });
    window.addEventListener('blur', () => physReset());
    // Chromium can name the keys up front, so a first-time AZERTY player already sees ZQSD
    const nav = navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } };
    nav.keyboard?.getLayoutMap?.().then((m) => {
        const next: Partial<Record<Phys, string>> = {};
        for (const p of PHYS) { const v = m.get(p); if (isLetter(v)) next[p] = v.toUpperCase(); }
        mapped = next;
    }).catch(() => { /* not allowed here (iframe, permissions): the other hints still work */ });
}

/** Is this key position held right now? */
export const physDown = (p: Phys) => down.has(p);
/** Was it pressed since the last check? (consumes the press) */
export function physPressed (p: Phys) { return fresh.delete(p); }
/** Forget held and pending keys (window blur, menus opening/closing). */
export function physReset () { down.clear(); fresh.clear(); }

/** The key position a keyboard event came from, if it is one of ours (for screens that pan with WASD). */
export const physCode = (e?: KeyboardEvent) => (e ? physOf(e) : null);

/** The guess when nothing better is known: French and Belgian browsers are overwhelmingly AZERTY. */
function guessAzerty () {
    const langs = typeof navigator === 'undefined' ? [] : [navigator.language, ...(navigator.languages ?? [])];
    return langs.some((l) => /^fr(-(FR|BE|LU|MC))?$/i.test(l ?? '') || /^nl-BE$/i.test(l ?? ''));
}

// On a phone there is no keyboard: the fishing key is a button called FISH, and hint text should say so.
let touchUi = false;
export const setTouchUi = (on: boolean) => { touchUi = on; };
export const isTouchUi = () => touchUi;

/** The letter printed on the cap at this position, for hint text. */
export function keyLabel (p: Phys): string {
    if (touchUi && p === 'KeyQ') return 'FISH';
    if (settings.keyboard === 'azerty') return AZERTY[p];
    if (settings.keyboard === 'qwerty') return QWERTY[p];
    return mapped[p] ?? seen[p] ?? (guessAzerty() ? AZERTY[p] : QWERTY[p]);
}

/** "WASD" or "ZQSD" or whatever this keyboard has, with spaces between when asked. */
export function moveKeys (sep = '') { return (['KeyW', 'KeyA', 'KeyS', 'KeyD'] as Phys[]).map(keyLabel).join(sep); }

/** What "Auto" currently resolves to, for the settings row. */
export function detectedName () { return moveKeys() === 'ZQSD' ? 'AZERTY' : moveKeys() === 'WASD' ? 'QWERTY' : moveKeys(); }

/**
 * The key of an event for hotkeys. The number row is read by position, so 1–8 work on AZERTY, where the
 * unshifted row types & é " ' ( § è !, and on the numpad.
 */
export function keyOf (e: KeyboardEvent): string {
    const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
    return m && (e.code.startsWith('Digit') || /^\d$/.test(e.key)) ? m[1] : e.key;   // numpad with NumLock off is End, Home…
}

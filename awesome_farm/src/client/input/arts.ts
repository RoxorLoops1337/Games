// The Combat Art keys, read by key POSITION (e.code), so they are the same keys on every layout and never clash with moving
// (AZERTY moves with the keys at the QWERTY W A S D positions; the arts sit on Z, X and N positions). A press is remembered until `artPressed` reads it.

import { ART_CODES } from '../../shared/data/arts';

const fresh = new Set<string>();
let installed = false;

const typing = (e: Event) => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};

export function installArtKeys () {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    window.addEventListener('keydown', (e) => {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e) || !(ART_CODES as readonly string[]).includes(e.code)) return;
        fresh.add(e.code);
    });
    window.addEventListener('blur', () => fresh.clear());
}

/** Was the key of this art slot pressed since last asked? (consumes the press) */
export const artPressed = (slot: number) => fresh.delete(ART_CODES[slot]);
/** Forget pending presses (a menu opened). */
export const artReset = () => fresh.clear();

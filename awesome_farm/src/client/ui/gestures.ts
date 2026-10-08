// What a mouse does with Shift and right-click, a finger does another way: the x1 / x10 / All chips a window shows say how
// many a tap moves, and a long press is the right-click. This file is the plain logic of that and of the words that go
// with it (no Phaser, so a test can check it).

/** What the quantity chips can pick: a number, or the whole stack. */
export type Qty = 1 | 5 | 10 | 'all';

/** How long a finger must stay down on an item for it to count as a right-click (seconds). */
export const HOLD_SECS = 0.4;
/** How far (in HUD units) a held finger may wander before it is a scroll, not a press. */
export const HOLD_SLOP = 14;

export const qtyLabel = (q: Qty) => (q === 'all' ? 'All' : `x${q}`);

/**
 * How many a tap moves. `have` is what there is to move. A chip picks the number ('all' is the whole stack); Shift is
 * "all" as on a computer; with neither, `plain` is what a plain click does in this window (1 for selling, the stack
 * for a chest). Never more than there is, never less than 0.
 */
export function qtyAmount (qty: Qty | undefined, have: number, shift = false, plain: number | 'all' = 1): number {
    const want = shift || qty === 'all' ? 'all' : qty ?? plain;
    const n = want === 'all' ? have : want;
    return Math.max(0, Math.min(Math.floor(have), Math.floor(n)));
}

/** Has a press been held long enough, and still enough, to be a long press? */
export function isLongPress (heldSecs: number, movedUnits: number): boolean {
    return heldSecs >= HOLD_SECS && movedUnits <= HOLD_SLOP;
}

/** The keys a phone has as buttons (R is left out: it turns a piece in one place and wakes you up in another). */
const BUTTON_FOR: Record<string, string> = { E: 'USE', B: 'BUILD', I: 'BAG', F: 'EAT', T: 'POD', X: 'REMOVE' };
/** The windows a phone opens from MENU. */
const MENU_FOR: Record<string, string> = { K: 'MENU > Skills', J: 'MENU > Journal', C: 'MENU > Crafting', P: 'MENU > Creatures', V: 'MENU > Blueprints', M: 'MENU > World map', H: 'MENU > How to play' };

/**
 * A hint line written for a keyboard and mouse, in words for a finger: "Click" is "Tap", right-click is a long press ("Hold"),
 * "press E" is "tap USE", "press K" is "open MENU > Skills". It only knows the plain phrases hints are made of; a line with
 * something odder in it should carry a phone version of its own.
 */
export function touchWords (s: string): string {
    return s
        .replace(/\b(Press|press|Hold|hold) ([EBIFTX])\b/g, (_m, v: string, k: string) => `${v === 'Press' ? 'Tap' : v === 'press' ? 'tap' : v} ${BUTTON_FOR[k]}`)
        .replace(/\b(Press|press) ([KJCPVMH])\b/g, (_m, v: string, k: string) => `${v === 'Press' ? 'Open' : 'open'} ${MENU_FOR[k]}`)
        .replace(/\(([KJCPVMH])\)/g, '(MENU)').replace(/\(([EBIFTX])\)/g, (_m, k: string) => `(${BUTTON_FOR[k]})`)
        .replace(/Right-click/g, 'Hold').replace(/right-click/g, 'hold').replace(/Double-click/g, 'Double-tap').replace(/double-click/g, 'double-tap')
        .replace(/\bClick/g, 'Tap').replace(/\bclick/g, 'tap').replace(/\bR (rotates|turns)\b/g, 'TURN $1');
}

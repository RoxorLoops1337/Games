// First-time hints in the HUD. The rules and wording are in shared/data/hints.ts; here they get a memory
// (which hints this browser has shown, in localStorage) and the names of the player's keys.

import { Hints, HINTS, type HintStore } from '../../shared/data/hints';
import { TIP_PREFIX, TIPS } from '../../shared/data/tips';
import { LAB } from '../lab';
import { keyLabel } from '../input/layout';
import { slots } from './slots';

const KEY = 'awesome_farm_hints_v1';

/** One list for first-time hints and progression tips (`tip:<id>`). Saving only ever adds, so the two runners never wipe each other's entries. */
export const hintStore: HintStore = LAB ? {
    // the Defense Lab: every hint and tip counts as seen, and nothing is written
    load () { return [...HINTS.map((h) => h.id), ...TIPS.map((t) => TIP_PREFIX + t.id)]; },
    save () { /* never */ },
} : {
    load () { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]; } catch { return []; } },       // private mode: they come back each visit
    save (ids) { try { localStorage.setItem(KEY, JSON.stringify([...new Set([...hintStore.load(), ...ids])])); } catch { /* private mode */ } },
};
const store = hintStore;

/** The dusk countdown is up (the pill publishes its rectangle while it shows): hints about later things wait for it to pass. */
const alarmOn = () => !!slots.get('dusk');

export const createHints = (toast: (text: string, icon?: string, color?: number) => void) => new Hints(toast, store, () => ({ fish: keyLabel('KeyQ') }), alarmOn);
export type { Hints };

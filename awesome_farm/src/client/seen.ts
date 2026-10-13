// "New" dots: which kinds of items this browser has already looked at in a window. The first time a profile opens the
// backpack everything it carries counts as seen (no wall of dots on an old save); after that, a kind you gain that you have not
// hovered yet wears a small dot until you point at it. Per browser and per profile slot; never shared, never sent anywhere.

import { SOLO_KEY } from './profile';

const KEY = SOLO_KEY.replace('awesome_farm_solo_v1', 'awesome_farm_seen_v1');
let seen: Set<string> | null = null;
let fresh = false;

function load (): Set<string> {
    if (seen) return seen;
    seen = new Set();
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) for (const s of JSON.parse(raw) as string[]) seen.add(String(s));
        else fresh = true;
    } catch { fresh = true; }
    return seen;
}

function save () {
    try { localStorage.setItem(KEY, JSON.stringify([...(seen ?? [])].slice(-600))); } catch { /* private mode */ }
}

/** Call with what the player carries each time a window lists it: the very first call adopts it all as seen. */
export function adopt (ids: readonly string[]) {
    const s = load();
    if (!fresh) return;
    fresh = false;
    for (const id of ids) s.add(id);
    save();
}

export const isNew = (id: string) => !load().has(id);

export function markSeen (id: string) {
    const s = load();
    if (s.has(id)) return false;
    s.add(id);
    save();
    return true;
}

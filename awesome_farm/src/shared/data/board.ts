// The Request Board: a farmer pins what the farm needs ("plank 50"), paying the reward up front; whoever hands the items in
// collects the coins, and the items go to the one who asked. Words and numbers live here so the window and the sim agree.

import { ITEMS, ITEM_ORDER, type ItemId } from './items';

export const BOARD_MAX = 6;            // requests on one board
export const ASK_MAX = 200;            // most of one thing in one request
export const REWARD_MUL = 1.5;         // coins a unit pays, as a multiple of what the market gives for it
export const BOARD_REACH = 120;

/** What one unit pays the person who hands it in. */
export const rewardEach = (item: ItemId) => Math.max(1, Math.round(ITEMS[item].sell * REWARD_MUL));

/** Read "plank 50", "50 planks" or "Berry Jam x12" into an item and a count (a bare name asks for 10). Null when no item fits. */
export function parseAsk (text: string): { item: ItemId; n: number } | null {
    const raw = text.toLowerCase().replace(/\bx\s*(\d)/g, ' $1').replace(/[^a-z0-9 _']/g, ' ').replace(/\s+/g, ' ').trim();
    if (!raw) return null;
    const num = raw.match(/\b(\d{1,4})\b/);
    const n = num ? Math.max(1, Math.min(ASK_MAX, parseInt(num[1], 10))) : 10;
    const words = raw.replace(/\b\d{1,4}\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (!words) return null;
    const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const w = flat(words), singular = w.replace(/s$/, '');
    const hit = ITEM_ORDER.find((id) => flat(ITEMS[id].name) === w || flat(ITEMS[id].name) === singular || id.replace(/_/g, '') === w || id.replace(/_/g, '') === singular)
        ?? ITEM_ORDER.find((id) => flat(ITEMS[id].name).startsWith(singular) && singular.length >= 3);
    if (!hit || ITEMS[hit].gear) return null;
    return { item: hit, n };
}

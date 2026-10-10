// Where the HUD's overlays may go. Pure geometry and queues (no Phaser, no DOM), so the rules are testable.
//
// The HUD is a fixed 960×540 space scaled to fit the window, so a phone shows exactly the same layout, just smaller.
// Everything has ONE home, and a home is one of a few named zones:
//   · TOP LEFT, identity: the farmer card, then (each only when there is something to show) the companion, the party and the
//     quests, in one column of one width (LEFT);
//   · TOP CENTRE, announcements: the dusk countdown, the boss bar and the expedition plaque stack from the top (topStack); under
//     them is the TOP SLOT (y = 68) where the coach card, the tip cards, the catch card and the big banners take turns;
//   · TOP RIGHT, world info: clock, season, coins, minimap and zoom in ONE frame (worldBlock); the toasts hang under it;
//   · BOTTOM CENTRE: the hotbar, and above it (bottomStack) the status row (buffs, the held item), the chat, prompts and the
//     fishing line, from the bottom up;
//   · BOTTOM RIGHT: on a computer the menu bar; on a phone ACT, USE, EAT and DASH round the thumb with the context buttons
//     beside them, and BAG / BUILD / MENU in a row underneath (THUMB, TOUCH_BAR);
//   · BOTTOM LEFT on a phone: the stick, and nothing else.
// Floating things keep clear of all of it: toasts have a lane, world-anchored plates and captions slide until they are clear,
// and arrows for things off screen stop at the edge of the play area (edgeMarker).

import { VIEW_H, VIEW_W } from '../../shared/config';

export interface Rect { x: number; y: number; w: number; h: number }

export const overlaps = (a: Rect, b: Rect, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
export const within = (r: Rect, box: Rect) => r.x >= box.x && r.y >= box.y && r.x + r.w <= box.x + box.w && r.y + r.h <= box.y + box.h;

/** The first candidate that lies inside `box` and touches no obstacle (with `pad` of air around each). */
export function firstClear (cands: Rect[], obstacles: Rect[], box: Rect, pad = 4): Rect | null {
    return cands.find((c) => within(c, box) && !obstacles.some((o) => overlaps(c, o, pad))) ?? null;
}

/** Ease a number toward where it should be (a frame at a time), so a thing that changes place glides instead of jumping. */
export const glide = (cur: number, target: number, dt: number, rate = 14) => (Math.abs(target - cur) < 0.4 ? target : cur + (target - cur) * (1 - Math.exp(-dt * rate)));

// ── the margin and the left column ───────────────────────────────────────────
/** The gap between the HUD and the edge of the screen. */
export const EDGE = 6;
/** The left column: the farmer card, the companion, the party and the quests all share this x and width. */
export const LEFT = { x: EDGE, w: 262, gap: 6 };
/** The farmer card is this tall with one or two rows of hearts (three rows make it taller; the column below moves with it). */
export const CARD_H = 99;

// ── the top slot ─────────────────────────────────────────────────────────────
/** Where the coach card and the tip cards sit (x, y, width). They share it with the banners and never show together. */
export const TOP_SLOT = { x: 287, y: 68, w: 456 };
/** The tallest a card in the top slot may get, so it never reaches the farmer standing at the middle of the screen. */
export const TOP_SLOT_MAX_H = 128;

// ── the top stack: dusk, boss, expedition ────────────────────────────────────
export const DUSK_H = 26;
export const BOSS = { w: 384, h: 50 };
export const PLAQUE = { w: 384, h: 56 };
export const CHIPS_H = 28;

export interface TopStack { dusk: number; boss: number; plaque: number; chips: number; /** Where the lowest of them ends (0 when nothing shows). */ bottom: number }

/**
 * From the top of the screen down: the dusk countdown, the expedition plaque with its chips, and the boss bar. Only what shows takes
 * room. (On an expedition the guardian's bar comes last, so nothing above it moves when it arrives.)
 */
export function topStack (o: { dusk?: boolean; boss?: boolean; rift?: boolean; chips?: boolean }): TopStack {
    const start = EDGE + 2;
    let y = start;
    const out: TopStack = { dusk: start, boss: start, plaque: start, chips: start, bottom: 0 };
    if (o.dusk) { out.dusk = y; y += DUSK_H + 6; }
    if (o.rift) {
        out.plaque = y; y += PLAQUE.h + 6;
        if (o.chips) { out.chips = y; y += CHIPS_H + 6; }
    }
    if (o.boss) { out.boss = y; y += BOSS.h + 6; }
    out.bottom = y > start ? y - 6 : 0;
    return out;
}

// ── the world block: clock, season, coins, minimap, zoom ─────────────────────
interface WorldBlock {
    /** The whole frame. */
    frame: Rect;
    /** Top of the line with the time, the season and the day. */
    headY: number;
    /** The day dial. */
    sky: Rect;
    /** The middle of the coin row. */
    coinY: number;
    /** The map itself (the plots); it sits in a little frame of its own, 4 units wider all round. */
    map: Rect;
    /** The middle of the row of zoom buttons, and how big they are. */
    zoomY: number;
    btn: number;
}

/** The map shows this many plots around you, each MINI_CELL units wide. */
export const MINI_SPAN = 17;
export const MINI_CELL = 8;

export function worldBlock (touch: boolean): WorldBlock {
    const w = 172, x = VIEW_W - EDGE - w, y = EDGE;
    const btn = touch ? 34 : 26;
    const map: Rect = { x: x + (w - MINI_SPAN * MINI_CELL) / 2, y: y + 76, w: MINI_SPAN * MINI_CELL, h: MINI_SPAN * MINI_CELL };
    const zoomTop = map.y + map.h + 4 + 6;
    return {
        frame: { x, y, w, h: zoomTop + btn + 8 - y },
        headY: y + 7,
        sky: { x: x + 8, y: y + 27, w: w - 16, h: 18 },
        coinY: y + 58,
        map,
        zoomY: zoomTop + btn / 2,
        btn,
    };
}

// ── the hotbar ───────────────────────────────────────────────────────────────
interface HotbarLayout extends Rect { size: number; pitch: number; pad: number }

/** Eight slots along the bottom centre; a phone gets bigger ones to hit. */
export function hotbarLayout (touch: boolean): HotbarLayout {
    const size = touch ? 52 : 44, pitch = size + 3, pad = 6;
    const w = 8 * pitch + 2 * pad - 3, h = size + 2 * pad;
    return { x: Math.round(VIEW_W / 2 - w / 2), y: VIEW_H - EDGE - h, w, h, size, pitch, pad };
}

/** The strip of menu icons at the bottom right of a computer, each with its key under it (a phone has the three big buttons instead). */
export const MENU_BAR = { x: VIEW_W - EDGE - 264, y: VIEW_H - EDGE - 46, w: 264, h: 46, cell: 32 };

// ── the phone's thumb buttons ────────────────────────────────────────────────
interface RoundBtn { x: number; y: number; r: number }

/**
 * Round buttons for the right thumb, round ACT. FISH and TURN share a place, and so do POD and CANCEL (they never show together).
 * REMOVE sits beside USE, over the end of the hotbar.
 */
export const THUMB: Record<'act' | 'use' | 'eat' | 'dash' | 'fish' | 'turn' | 'pod' | 'cancel' | 'take' | 'art0' | 'art1' | 'art2', RoundBtn> = {
    act: { x: 872, y: 432, r: 50 },
    use: { x: 764, y: 460, r: 32 },
    eat: { x: 832, y: 338, r: 28 },
    dash: { x: 902, y: 338, r: 26 },
    fish: { x: 764, y: 390, r: 34 },
    turn: { x: 764, y: 390, r: 30 },
    pod: { x: 768, y: 326, r: 28 },
    cancel: { x: 768, y: 326, r: 28 },
    take: { x: 690, y: 430, r: 30 },
    art0: { x: 702, y: 236, r: 26 },        // the three Combat Art buttons, in a column left of the context buttons (the toast lane keeps left of them) (they show only for the arts that are on a key)
    art1: { x: 702, y: 292, r: 26 },
    art2: { x: 702, y: 348, r: 26 },
};

/** BAG, BUILD and MENU on a phone: centres of three buttons in a row at the bottom right. */
export const TOUCH_BAR = { y: VIEW_H - 25, w: 64, h: 40, xs: [780, 850, 920] };

/**
 * The stick's corner on a phone: any touch in the lower left grabs the stick (`wide`); with a building in hand only a patch
 * round the stick does, so the ground there can be tapped. Published live as the obstacle 'stick', so plates keep out of it.
 */
export const stickZone = (wide: boolean): Rect => (wide ? { x: 0, y: VIEW_H / 2, w: 320, h: VIEW_H / 2 } : { x: 20, y: VIEW_H - 220, w: 210, h: 210 });

export const circleRect = (b: RoundBtn): Rect => ({ x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r });

// ── the furniture of the HUD ─────────────────────────────────────────────────
/** What is always on screen (logical units), by mode. Keep in step with ui/hudlayer.ts and the touch buttons in ui/touchcontrols.ts. */
export function furniture (touch: boolean): Rect[] {
    const out: Rect[] = [
        { x: LEFT.x, y: EDGE, w: LEFT.w, h: CARD_H },     // the farmer card (taller with three rows of hearts: the column below moves with it)
        worldBlock(touch).frame,
        hotbarLayout(touch),
    ];
    if (touch) {
        for (const b of Object.values(THUMB)) out.push(circleRect(b));
        for (const x of TOUCH_BAR.xs) out.push({ x: x - TOUCH_BAR.w / 2, y: TOUCH_BAR.y - TOUCH_BAR.h / 2, w: TOUCH_BAR.w, h: TOUCH_BAR.h });
    } else {
        out.push(MENU_BAR);
    }
    return out;
}

/** Live rectangles (the quest tracker, the card in the top slot, the party list…) added to the fixed furniture. */
class HudSlots {
    touch = false;
    private live = new Map<string, Rect>();

    reset (touch: boolean) { this.touch = touch; this.live.clear(); }
    set (id: string, r: Rect | null) { if (r) this.live.set(id, r); else this.live.delete(id); }
    get (id: string) { return this.live.get(id) ?? null; }

    /** Everything a floating thing must keep clear of (`skip` names live rects to leave out). */
    obstacles (...skip: string[]): Rect[] {
        const out = furniture(this.touch);
        for (const [id, r] of this.live) if (!skip.includes(id)) out.push(r);
        return out;
    }
}

export const slots = new HudSlots();

// ── the bottom stack: what sits above the hotbar ─────────────────────────────
export interface BottomStack {
    /** Top of the status row (buff chips on the left, the name of the held item on the right). */
    status: number;
    /** Where the chat lines end (the lowest line's bottom edge). */
    chatBottom: number;
    /** The middle of the interaction prompt ("E: open"). */
    prompt: number;
    /** Top of the dismantle bar. */
    demolish: number;
    /** Top of the fishing panel. */
    fishing: number;
    /** The middle of the chat input while it is open. */
    input: number;
    /** Top of the emote bar. */
    emote: number;
}

export const CHAT_LINE = 17;
export const CHIP_H = 26;
export const FISH_H = 64;

/** From the hotbar up: the status row, then the chat (and its input), then the prompt, the dismantle bar and the fishing panel. */
export function bottomStack (touch: boolean, o: { status?: boolean; chatLines?: number; typing?: boolean }): BottomStack {
    const hb = hotbarLayout(touch);
    const status = hb.y - 4 - CHIP_H;
    let base = o.status ? status - 4 : hb.y - 6;
    const emote = base - 58;
    let input = 0;
    if (o.typing) { input = base - 17; base -= 38; }
    const chatBottom = base;
    const lines = o.chatLines ?? 0;
    if (lines) base -= lines * CHAT_LINE + 10;
    const prompt = base - 10;
    base -= 22;
    const demolish = base - 12;
    const fishing = base - 10 - FISH_H;
    return { status, chatBottom, prompt, demolish, fishing, input, emote };
}

/**
 * The rectangle the bottom stack takes this frame (published as the obstacle 'bottom', so plates and captions keep out from
 * under the prompt, the chat and the fishing panel): from the highest thing showing down to the hotbar, as wide as the hotbar
 * or the prompt's words, whichever is wider. Null when nothing shows above the hotbar.
 */
export function bottomRect (touch: boolean, s: BottomStack, o: { promptW?: number; chatLines?: number; typing?: boolean; demolish?: boolean; fishing?: boolean }): Rect | null {
    const hb = hotbarLayout(touch);
    let top = Infinity;
    if (o.promptW) top = Math.min(top, s.prompt - 11);
    if (o.chatLines) top = Math.min(top, s.chatBottom - o.chatLines * CHAT_LINE - 10);
    if (o.typing) top = Math.min(top, s.input - 19);
    if (o.demolish) top = Math.min(top, s.demolish);
    if (o.fishing) top = Math.min(top, s.fishing);
    if (!Number.isFinite(top)) return null;
    const w = Math.max(hb.w, (o.promptW ?? 0) + 16);
    return { x: Math.round(VIEW_W / 2 - w / 2), y: Math.round(top), w, h: hb.y - 2 - Math.round(top) };
}

// ── arrows for things off screen ─────────────────────────────────────────────
/** Where arrows for off-screen things (a lost backpack, a friend's ping) may stand: clear of the edge, the top bar and the hotbar. */
export const PLAY: Rect = { x: 30, y: 70, w: VIEW_W - 60, h: 370 };

/**
 * Where a marker for `target` (a screen point) goes. When the target is in the play area and clear of the furniture it is the target
 * itself; otherwise it stands on the line from the middle of the screen toward it, at the edge of the play area, and is pulled
 * back toward the middle until it is clear of everything in `obstacles`. `inside` says it is on the target.
 */
export function edgeMarker (target: { x: number; y: number }, obstacles: Rect[], box: Rect = PLAY, half = 24): { x: number; y: number; inside: boolean } {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const clear = (x: number, y: number) => !obstacles.some((o) => overlaps({ x: x - half, y: y - half, w: 2 * half, h: 2 * half }, o));
    const inBox = target.x >= box.x && target.x <= box.x + box.w && target.y >= box.y && target.y <= box.y + box.h;
    if (inBox && clear(target.x, target.y)) return { x: target.x, y: target.y, inside: true };
    const dx = target.x - cx, dy = target.y - cy;
    // how far along the ray the play area ends (1 = the target itself)
    const kx = dx === 0 ? Infinity : ((dx > 0 ? box.x + box.w : box.x) - cx) / dx;
    const ky = dy === 0 ? Infinity : ((dy > 0 ? box.y + box.h : box.y) - cy) / dy;
    let k = Math.min(1, kx, ky);
    if (!Number.isFinite(k) || k <= 0) return { x: cx, y: cy, inside: false };
    const step = 0.02;
    while (k > 0 && !clear(cx + dx * k, cy + dy * k)) k -= step;
    k = Math.max(0, k);
    return { x: cx + dx * k, y: cy + dy * k, inside: false };
}

// ── toasts ────────────────────────────────────────────────────────────────────
export interface ToastLane { right: number; top: number; bottom: number; maxW: number }

/**
 * The strip toasts stack in. On a computer: the right column under the world block. On a phone that column is full of thumb
 * buttons, so it is the strip to the right of the farmer, under the card in the top slot.
 */
export function toastLane (touch: boolean, cardBottom = 0): ToastLane {
    if (!touch) {
        const b = worldBlock(false).frame;
        return { right: b.x + b.w - 6, top: b.y + b.h + 12, bottom: hotbarLayout(false).y - 2, maxW: 280 };
    }
    return { right: 650, top: Math.max(204, cardBottom + 8), bottom: 396, maxW: 190 };
}

export const TOAST_MAX = 3;
const TOAST_LIFE = 3.8;
const TOAST_LIFE_BUSY = 2.4;
const TOAST_FADE = 0.45;
const TOAST_BACKLOG = 8;
const TOAST_STALE = 25;

/** Toasts about the same thing share one key, so a newer one replaces an older one that is still waiting or on screen. */
export function toastKey (text: string): string {
    if (/^Level \d+!/.test(text)) return 'level';
    if (/^New quest from /.test(text)) return 'quest-from';
    if (/ new quests are waiting/.test(text)) return 'quests-waiting';
    return text;
}

/** Two toasts of one kind become one: level-ups add up their skill points. */
export function mergeToastText (key: string, oldText: string, newText: string): string {
    if (key === 'level') {
        const pts = (s: string) => Number(/\+(\d+) skill point/.exec(s)?.[1] ?? 0);
        const n = pts(oldText) + pts(newText);
        const lv = /^Level \d+!/.exec(newText)?.[0] ?? 'Level up!';
        return n ? `${lv} +${n} skill point${n > 1 ? 's' : ''}  (K)` : newText;
    }
    return newText;
}

export interface ToastItem { id: number; key: string; text: string; icon?: string; color?: number; age: number; end: number; waited: number; bump: number }

/**
 * What the toast stack shows. At most TOAST_MAX are on screen (the oldest ones); the rest wait their turn, and the ones on
 * screen hurry up while others wait. Nothing ages while a window is open (the stack is hidden), so what you missed is still
 * there when it closes, unless it has become stale.
 */
export class ToastQueue {
    items: ToastItem[] = [];
    private nextId = 1;

    push (text: string, icon?: string, color?: number): ToastItem {
        const key = toastKey(text);
        const same = this.items.find((t) => t.key === key);
        if (same) {
            same.text = mergeToastText(key, same.text, text);
            same.icon = icon ?? same.icon; same.color = color ?? same.color;
            same.age = Math.min(same.age, 0.5); same.end = TOAST_LIFE; same.bump++;
            return same;
        }
        const it: ToastItem = { id: this.nextId++, key, text, icon, color, age: 0, end: TOAST_LIFE, waited: 0, bump: 0 };
        this.items.push(it);
        // too many waiting: the oldest of the waiting ones goes
        if (this.items.length > TOAST_MAX + TOAST_BACKLOG) this.items.splice(TOAST_MAX, 1);
        return it;
    }

    /** The ones on screen, newest first. */
    get shown (): ToastItem[] { return this.items.slice(0, TOAST_MAX).reverse(); }
    get waiting () { return Math.max(0, this.items.length - TOAST_MAX); }

    /** `blocked`: a window is open, so the stack is hidden and does not age. */
    update (dt: number, blocked: boolean) {
        this.items.forEach((t, i) => { if (t.age === 0 && (blocked || i >= TOAST_MAX)) t.waited += dt; });
        if (!blocked) {
            const busy = this.waiting > 0;
            for (const t of this.items.slice(0, TOAST_MAX)) {
                if (busy) t.end = Math.min(t.end, Math.max(TOAST_LIFE_BUSY, t.age + TOAST_FADE));
                t.age += dt;
            }
            this.items = this.items.filter((t) => t.age < t.end);
        }
        this.items = this.items.filter((t) => t.age > 0 || t.waited < TOAST_STALE);
    }

    /** 0..1: how opaque a toast is (it pops in, and fades at the end). */
    alpha (t: ToastItem): number {
        return Math.max(0, Math.min(1, t.age / 0.12 + 0.001, (t.end - t.age) / TOAST_FADE));
    }
}

// ── banners ───────────────────────────────────────────────────────────────────
interface BannerItem { text: string; sub?: string; color?: number }

const BANNER_IN = 0.28;
const BANNER_OUT = 0.4;
const BANNER_BACKLOG = 4;
const BANNER_STALE = 20;

/**
 * The big centre banners, one at a time. They wait while a window is open and while a card still holds the top slot, show
 * for a time that fits their words (shorter when more are waiting), and a repeat of one already waiting is dropped.
 */
export class BannerQueue {
    cur: BannerItem | null = null;
    /** Seconds the current banner has been up. */
    t = 0;
    private hold = 0;
    private wait: (BannerItem & { age: number })[] = [];

    get busy () { return !!this.cur || this.wait.length > 0; }
    get pending () { return this.wait.length; }

    push (b: BannerItem) {
        const same = (x: BannerItem) => x.text === b.text && x.sub === b.sub;
        if (this.cur && same(this.cur)) return;
        if (this.wait.some(same)) return;
        // the same headline with other words replaces the one waiting (a countdown banner, say)
        const i = this.wait.findIndex((x) => x.text === b.text);
        if (i >= 0) { this.wait[i] = { ...b, age: 0 }; return; }
        this.wait.push({ ...b, age: 0 });
        if (this.wait.length > BANNER_BACKLOG) this.wait.shift();
    }

    /** How long a banner stays in full view: its words take a moment to read; a queue makes it brisk. */
    static holdFor (b: BannerItem, waiting: number) {
        const read = 1.3 + 0.028 * (b.text.length + (b.sub?.length ?? 0));
        return Math.max(1.3, Math.min(3, read) * (waiting >= 2 ? 0.6 : waiting === 1 ? 0.8 : 1));
    }

    /** `blocked`: a window is open. `slotFree`: nothing else holds the top slot (the cards have faded away). */
    update (dt: number, blocked: boolean, slotFree: boolean) {
        for (const w of this.wait) w.age += dt;
        if (!this.cur) {
            this.wait = this.wait.filter((w) => w.age < BANNER_STALE);
            if (blocked || !slotFree || !this.wait.length) return;
            const w = this.wait.shift()!;
            const next: BannerItem = { text: w.text, sub: w.sub, color: w.color };
            this.cur = next; this.t = 0; this.hold = BannerQueue.holdFor(next, this.wait.length);
            return;
        }
        if (blocked) return;
        this.t += dt;
        if (this.t >= BANNER_IN + this.hold + BANNER_OUT) this.cur = null;
    }

    /** 0..1 opacity of the current banner. */
    get alpha () {
        if (!this.cur) return 0;
        const out = this.t - BANNER_IN - this.hold;
        return Math.max(0, Math.min(1, this.t / BANNER_IN, 1 - out / BANNER_OUT));
    }

    /** 0..1 for the pop-in. */
    get pop () { return Math.min(1, this.t / BANNER_IN); }
}

// ── plates in the world ───────────────────────────────────────────────────────
/**
 * Candidate rectangles for a plate that hugs a shore: first where it wants to be, then slid along the shore to either side,
 * nearest first. `along` is the shore's direction (1, 0) or (0, 1); `reach` is how far it may slide.
 */
export function slideCandidates (r: Rect, along: { x: number; y: number }, reach: number, step = 12): Rect[] {
    const out: Rect[] = [r];
    for (let d = step; d <= reach; d += step) {
        out.push({ ...r, x: r.x + along.x * d, y: r.y + along.y * d }, { ...r, x: r.x - along.x * d, y: r.y - along.y * d });
    }
    return out;
}

/**
 * Where a caption anchored in the world (a creature's job, a friend's name, a Factory-view label) may stand: where it wants to be,
 * else nudged sideways until it is clear of the HUD, else null (hide it for now).
 */
export function clearOfHud (r: Rect, obstacles: Rect[], reach = 90): Rect | null {
    return firstClear(slideCandidates(r, { x: 1, y: 0 }, reach, 10), obstacles, { x: 2, y: 2, w: VIEW_W - 4, h: VIEW_H - 4 }, 2);
}

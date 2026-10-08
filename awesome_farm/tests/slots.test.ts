// The HUD's overlay rules (client/ui/slots.ts): banners queue one at a time, toasts are capped and merged, plates and toasts
// keep clear of the furniture. Pure logic, so it runs headless.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VIEW_H, VIEW_W } from '../src/shared/config';
import { BannerQueue, BOSS, bottomStack, CARD_H, CHIPS_H, circleRect, clearOfHud, DUSK_H, edgeMarker, EDGE, firstClear, furniture, glide, hotbarLayout, LEFT, MENU_BAR, mergeToastText, overlaps, PLAQUE, PLAY, slideCandidates, THUMB, TOAST_MAX, toastKey, toastLane, ToastQueue, TOP_SLOT, TOP_SLOT_MAX_H, topStack, TOUCH_BAR, within, worldBlock, type Rect } from '../src/client/ui/slots';

/** (a function, so TypeScript does not keep what an earlier assert narrowed `q.cur` to) */
const curText = (q: BannerQueue) => q.cur?.text ?? null;
const run = (q: { update: (dt: number, ...a: boolean[]) => void }, secs: number, ...a: boolean[]) => { for (let t = 0; t < secs; t += 0.05) q.update(0.05, ...a); };

test('toasts: three on screen at most, the rest wait their turn', () => {
    const q = new ToastQueue();
    for (let i = 0; i < 7; i++) q.push(`Thing ${i} happened`, 'k_star');
    assert.equal(q.shown.length, TOAST_MAX);
    assert.equal(q.waiting, 4);
    assert.equal(q.shown[0].text, 'Thing 2 happened', 'newest of the three on top');
    // they hurry along while others wait, and the waiting ones come on
    run(q, 2.6, false);
    assert.ok(q.items.every((t) => !/Thing [012] /.test(t.text)), 'the first three are gone');
    assert.equal(q.shown.length, TOAST_MAX);
    run(q, 30, false);
    assert.equal(q.items.length, 0, 'everything shows and goes in the end');
});

test('toasts: repeats merge, and level-ups add their skill points', () => {
    const q = new ToastQueue();
    q.push('Level 7! +1 skill point  (K)', 'k_star');
    q.push('Level 8! +1 skill point  (K)', 'k_star');
    q.push('Level 9! +3 skill points  (K)', 'k_star');
    assert.equal(q.items.length, 1);
    assert.equal(q.items[0].text, 'Level 9! +5 skill points  (K)');
    assert.equal(toastKey('New quest from Ferro: Roof  (J)'), toastKey('New quest from Rocco: Shaft  (J)'));
    assert.notEqual(toastKey('New quest from Ferro: Roof  (J)'), toastKey('3 new quests are waiting in your Journal  (J)'));
    q.push('Medal earned: Handy'); q.push('Medal earned: Handy');
    assert.equal(q.items.length, 2, 'the same words twice are one toast');
    assert.equal(mergeToastText('level', 'Level 1! +1 skill point  (K)', 'Level 2! +1 skill point  (K)'), 'Level 2! +2 skill points  (K)');
});

test('toasts: nothing ages under a window, and stale ones are dropped', () => {
    const q = new ToastQueue();
    q.push('Medal earned: Handy');
    q.update(0.1, false);
    const age = q.items[0].age;
    run(q, 20, true);
    assert.equal(q.items[0].age, age, 'a window stops the clock');
    q.push('Another thing');
    q.push('A third thing'); q.push('A fourth thing');
    q.items.forEach((t) => { t.age = 0; });
    run(q, 40, true);
    assert.equal(q.items.length, 0, 'what never got seen goes stale');
});

test('banners: one at a time, in order, and they wait for a free slot and for windows', () => {
    const q = new BannerQueue();
    q.push({ text: 'The sun is sinking', sub: 'Night falls' });
    q.push({ text: 'Night 1' });
    q.push({ text: 'Night 1' });
    assert.equal(q.pending, 2, 'a repeat is dropped');
    run(q, 3, false, false);
    assert.equal(q.cur, null, 'a card still holds the top slot');
    run(q, 0.2, true, true);
    assert.equal(q.cur, null, 'a window is open');
    q.update(0.05, false, true);
    assert.equal(curText(q), 'The sun is sinking');
    let seen = '';
    for (let t = 0; t < 12; t += 0.05) { q.update(0.05, false, true); const c = curText(q); if (c && !seen.endsWith(c)) seen += c; if (c) assert.ok(q.alpha >= 0 && q.alpha <= 1); }
    assert.equal(seen, 'The sun is sinkingNight 1');
    assert.equal(q.busy, false);
});

test('banners: a window pauses the one on screen, and a pile is capped and brisk', () => {
    const q = new BannerQueue();
    q.push({ text: 'A' }); q.update(0.05, false, true);
    run(q, 1, false, true);
    const t = q.t;
    run(q, 5, true, true);
    assert.equal(q.t, t, 'paused');
    for (let i = 0; i < 9; i++) q.push({ text: `Banner ${i}` });
    assert.ok(q.pending <= 4, 'the queue is capped');
    assert.ok(BannerQueue.holdFor({ text: 'Medal: Handy', sub: 'Craft something with your own hands' }, 3) < BannerQueue.holdFor({ text: 'Medal: Handy', sub: 'Craft something with your own hands' }, 0));
    assert.ok(BannerQueue.holdFor({ text: 'x' }, 0) >= 1.3 && BannerQueue.holdFor({ text: 'x'.repeat(200) }, 0) <= 3, 'short, always');
});

test('layout: the toast lane keeps clear of the minimap, the zoom buttons and the touch buttons', () => {
    for (const touch of [false, true]) {
        const lane = toastLane(touch);
        // three of the tallest toasts (three lines of text) with their gaps
        const box: Rect = { x: lane.right - lane.maxW, y: lane.top, w: lane.maxW, h: Math.min(lane.bottom - lane.top, 3 * 70 + 12) };
        assert.ok(within(box, { x: 0, y: 0, w: VIEW_W, h: VIEW_H }));
        for (const f of furniture(touch)) assert.ok(!overlaps(box, f), `touch=${touch}: the toast lane touches ${JSON.stringify(f)}`);
    }
    // under a tall card the touch lane starts lower
    assert.ok(toastLane(true, 190).top >= 198);
});

test('layout: the top slot holds a card that stops short of the farmer', () => {
    assert.ok(TOP_SLOT.y + TOP_SLOT_MAX_H < VIEW_H / 2 - 40, 'the card ends well above the middle of the screen');
    const slot: Rect = { x: TOP_SLOT.x, y: TOP_SLOT.y, w: TOP_SLOT.w, h: TOP_SLOT_MAX_H };
    for (const touch of [false, true]) for (const f of furniture(touch)) assert.ok(!overlaps(slot, f), `the top slot touches ${JSON.stringify(f)}`);
});

test('plates slide along the shore until they are clear', () => {
    const plate: Rect = { x: 20, y: 200, w: 70, h: 24 };
    const wall: Rect = { x: 0, y: 190, w: 120, h: 60 };            // something in the way, with room above and below
    const box: Rect = { x: 4, y: 4, w: 952, h: 532 };
    const spot = firstClear(slideCandidates(plate, { x: 0, y: 1 }, 200), [wall], box, 4);
    assert.ok(spot && !overlaps(spot, wall, 4) && spot.x === plate.x, 'it slid up or down, and stayed beside the shore');
    assert.equal(firstClear(slideCandidates(plate, { x: 0, y: 1 }, 20), [wall], box, 4), null, 'too far to slide: it hides');
    assert.equal(firstClear([{ x: -10, y: 50, w: 70, h: 24 }], [], box, 4), null, 'never off the screen');
});

// ── the zones ─────────────────────────────────────────────────────────────────

const SCREEN_BOX: Rect = { x: 0, y: 0, w: VIEW_W, h: VIEW_H };

test('zones: every fixed piece of the HUD is on screen, and none of them overlaps another', () => {
    for (const touch of [false, true]) {
        const pieces: [string, Rect][] = [
            ['card', { x: LEFT.x, y: EDGE, w: LEFT.w, h: CARD_H }],
            ['world block', worldBlock(touch).frame],
            ['hotbar', hotbarLayout(touch)],
        ];
        if (touch) {
            // FISH shares a place with TURN, and POD with CANCEL (they never show together)
            for (const [k, b] of Object.entries(THUMB)) if (k !== 'turn' && k !== 'cancel') pieces.push([k, circleRect(b)]);
            TOUCH_BAR.xs.forEach((x, i) => pieces.push([`touch button ${i}`, { x: x - TOUCH_BAR.w / 2, y: TOUCH_BAR.y - TOUCH_BAR.h / 2, w: TOUCH_BAR.w, h: TOUCH_BAR.h }]));
        } else pieces.push(['menu bar', MENU_BAR]);
        for (const [name, r] of pieces) assert.ok(within(r, SCREEN_BOX), `touch=${touch}: ${name} is off the screen`);
        for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
            assert.ok(!overlaps(pieces[i][1], pieces[j][1]), `touch=${touch}: ${pieces[i][0]} overlaps ${pieces[j][0]}`);
        }
        // the shared places do not clash with anything else either
        if (touch) for (const k of ['turn', 'cancel'] as const) for (const [name, r] of pieces) assert.ok(!overlaps(circleRect(THUMB[k]), r) || name === 'fish' || name === 'pod', `touch=${touch}: ${k} overlaps ${name}`);
    }
});

test('zones: the thumb buttons are big enough to hit, and a phone gets a bigger hotbar', () => {
    for (const b of Object.values(THUMB)) assert.ok(b.r >= 26, 'a round button is at least 52 units across (36 CSS px on a 667-wide phone)');
    assert.ok(hotbarLayout(true).size > hotbarLayout(false).size);
    assert.ok(worldBlock(true).btn >= 34 && TOUCH_BAR.h >= 40, 'the zoom buttons and BAG BUILD MENU are finger-sized');
    // the hotbar is centred
    for (const touch of [false, true]) { const h = hotbarLayout(touch); assert.ok(Math.abs(h.x + h.w / 2 - VIEW_W / 2) <= 1); }
});

test('zones: the left column, the top slot and the world block keep apart', () => {
    const left: Rect = { x: LEFT.x, y: EDGE, w: LEFT.w, h: VIEW_H - 2 * EDGE };
    const slot: Rect = { x: TOP_SLOT.x, y: TOP_SLOT.y, w: TOP_SLOT.w, h: TOP_SLOT_MAX_H };
    const boss: Rect = { x: VIEW_W / 2 - BOSS.w / 2, y: EDGE, w: BOSS.w, h: 200 };
    for (const touch of [false, true]) {
        const wb = worldBlock(touch).frame;
        assert.ok(!overlaps(left, slot) && !overlaps(left, boss), 'the column is clear of the top centre');
        assert.ok(!overlaps(slot, wb) && !overlaps(boss, wb), `touch=${touch}: the top centre is clear of the world block`);
        assert.ok(!overlaps(boss, hotbarLayout(touch)), 'the top stack stays above the hotbar');
    }
});

test('the world block holds the clock, the coins, the map and the zoom, in that order', () => {
    for (const touch of [false, true]) {
        const wb = worldBlock(touch);
        assert.ok(within(wb.sky, wb.frame) && within(wb.map, wb.frame));
        assert.ok(wb.sky.y + wb.sky.h < wb.coinY && wb.coinY < wb.map.y && wb.map.y + wb.map.h < wb.zoomY - wb.btn / 2 + 8);
        assert.ok(wb.zoomY + wb.btn / 2 <= wb.frame.y + wb.frame.h);
    }
});

test('the top stack: what shows takes room from the top, in order, and nothing overlaps', () => {
    assert.equal(topStack({}).bottom, 0, 'nothing shows, nothing is reserved');
    const none = topStack({ boss: true });
    assert.equal(none.boss, EDGE + 2);
    const all = topStack({ dusk: true, rift: true, chips: true, boss: true });
    assert.ok(all.dusk + DUSK_H < all.plaque && all.plaque + PLAQUE.h < all.chips && all.chips + CHIPS_H < all.boss, 'dusk, plaque, chips, boss from the top down');
    assert.ok(all.boss + BOSS.h < hotbarLayout(false).y);
    // an expedition keeps its place whether or not the guardian has come (nothing above the boss bar moves when it arrives)
    assert.equal(topStack({ rift: true, chips: true }).plaque, topStack({ rift: true, chips: true, boss: true }).plaque);
    assert.equal(topStack({ rift: true, chips: true }).chips, topStack({ rift: true, chips: true, boss: true }).chips);
});

test('the bottom stack: status row, chat, prompt and fishing panel climb from the hotbar and keep apart', () => {
    for (const touch of [false, true]) {
        const hb = hotbarLayout(touch);
        const bare = bottomStack(touch, {});
        const busy = bottomStack(touch, { status: true, chatLines: 6, typing: true });
        assert.ok(bare.prompt < hb.y && bare.fishing + 64 < bare.prompt);
        assert.ok(busy.status + 26 <= hb.y, 'the status row sits on the hotbar');
        assert.ok(busy.chatBottom <= busy.status && busy.input < busy.status + 26, 'the chat input and the lines sit above the status row');
        assert.ok(busy.prompt < busy.chatBottom - 6 * 17, 'the prompt is above the chat');
        assert.ok(busy.fishing + 64 < busy.prompt, 'the fishing panel is above the prompt');
        assert.ok(busy.emote + 56 <= busy.status, 'the emote bar is above the status row');
        assert.ok(busy.fishing > 70, 'even the fullest stack stays under the top bar');
    }
});

test('markers for things off screen stand at the edge of the play area and never under the HUD', () => {
    const obst = furniture(false);
    // in view and clear: right on the spot
    const spot = { x: 480, y: 250 };
    assert.deepEqual(edgeMarker(spot, obst), { ...spot, inside: true });
    // far to the right, level with the middle: on the right edge of the play area, an arrow
    const east = edgeMarker({ x: 2000, y: 400 }, obst);
    assert.ok(!east.inside && east.x <= PLAY.x + PLAY.w && east.x > PLAY.x + PLAY.w - 40);
    // under the world block (top right) and everywhere else: pulled back out from under the furniture
    for (const target of [{ x: 880, y: 100 }, { x: 40, y: 40 }, { x: 900, y: 460 }, { x: 600, y: 520 }, { x: -50, y: 300 }, { x: 960, y: 0 }]) {
        const m = edgeMarker(target, obst);
        const box = { x: m.x - 24, y: m.y - 24, w: 48, h: 48 };
        for (const o of obst) assert.ok(!overlaps(box, o), `a marker for ${JSON.stringify(target)} stands under ${JSON.stringify(o)}`);
    }
});

test('captions in the world slide out from under the HUD, or wait out of sight', () => {
    const cards = furniture(false);
    const free = clearOfHud({ x: 400, y: 200, w: 80, h: 16 }, cards);
    assert.deepEqual(free, { x: 400, y: 200, w: 80, h: 16 });
    const under = clearOfHud({ x: 240, y: 30, w: 100, h: 16 }, cards);
    assert.ok(under && under.x > 240 && cards.every((o) => !overlaps(under, o, 2)), 'nudged a little, still beside what it belongs to');
    assert.equal(clearOfHud({ x: 20, y: 30, w: 100, h: 16 }, cards), null, 'deep under the card: too far to slide, so hidden for now');
    assert.equal(clearOfHud({ x: 20, y: 30, w: 100, h: 16 }, [{ x: 0, y: 0, w: 900, h: 540 }]), null, 'no room at all: hidden for now');
});

test('glide eases toward a target and settles on it', () => {
    let v = 0;
    for (let i = 0; i < 120; i++) v = glide(v, 100, 1 / 60);
    assert.equal(v, 100);
    assert.ok(glide(0, 100, 1 / 60) > 0 && glide(0, 100, 1 / 60) < 100);
});

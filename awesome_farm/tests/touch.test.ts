// Phones: what a finger does where a mouse has Shift, right-click and hover: the quantity chips, the long press, the words,
// and why a building will not fit where the ghost is (the explanation has to agree with the server's own rules).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import type { BuildingKind } from '../src/shared/data/buildings';
import { ITEMS, type ItemId } from '../src/shared/data/items';
import { SKILL_LIST } from '../src/shared/data/skills';
import { landWhy, placeWhy, tilesBetween, type PlaceEnv } from '../src/shared/placement';
import { tryBuild } from '../src/shared/sim/economy';
import { Sim } from '../src/shared/sim/sim';
import { HOLD_SECS, HOLD_SLOP, isLongPress, qtyAmount, qtyLabel, touchWords } from '../src/client/ui/gestures';

// ── the quantity chips ──────────────────────────────────────────────────────
test('a chip picks how many a tap moves, never more than there is', () => {
    assert.equal(qtyAmount(1, 154), 1);
    assert.equal(qtyAmount(10, 154), 10);
    assert.equal(qtyAmount(10, 7), 7, 'x10 with 7 in the stack moves 7');
    assert.equal(qtyAmount('all', 154), 154);
    assert.equal(qtyAmount('all', 0), 0, 'nothing to move');
    assert.equal(qtyAmount(5, 0), 0);
    assert.equal(qtyAmount(1, 3.9), 1, 'whole items only');
    assert.equal(qtyAmount('all', 3.9), 3);
});

test('with no chip a plain tap does what a plain click does, and Shift is "all" as on a computer', () => {
    assert.equal(qtyAmount(undefined, 50), 1, 'selling: one');
    assert.equal(qtyAmount(undefined, 50, true), 50, 'Shift: all');
    assert.equal(qtyAmount(undefined, 50, false, 'all'), 50, 'a chest: the stack');
    assert.equal(qtyAmount(1, 50, false, 'all'), 1, 'a chip beats the default');
    assert.equal(qtyAmount(1, 50, true), 50, 'Shift still means all');
    assert.equal(qtyLabel(1), 'x1');
    assert.equal(qtyLabel('all'), 'All');
});

test('selling 50 wood is a chip and one tap, not fifty taps', () => {
    const taps = 1 + 1;                                            // pick All, then tap the stack
    assert.equal(qtyAmount('all', 50), 50);
    assert.ok(taps <= 2);
});

test('a long press is a finger that stays put for about 0.4 seconds', () => {
    assert.equal(HOLD_SECS, 0.4);
    assert.ok(!isLongPress(0.1, 0), 'too soon');
    assert.ok(isLongPress(HOLD_SECS, 0));
    assert.ok(isLongPress(1, HOLD_SLOP));
    assert.ok(!isLongPress(1, HOLD_SLOP + 1), 'a finger that wandered is scrolling a list');
});

// ── the words ───────────────────────────────────────────────────────────────
test('mouse words become finger words on a phone', () => {
    assert.equal(touchWords('Click: take all · Right-click: take one'), 'Tap: take all · Hold: take one');
    assert.equal(touchWords('Click to equip'), 'Tap to equip');
    assert.equal(touchWords('Double-click a building to place it fast.'), 'Double-tap a building to place it fast.');
    assert.equal(touchWords('Carries items along. R rotates it; drag to lay a line.'), 'Carries items along. TURN rotates it; drag to lay a line.');
    assert.equal(touchWords('Tap: sell · Hold: sell 10'), 'Tap: sell · Hold: sell 10', 'finger words are left alone');
    assert.equal(touchWords('Their right click'), 'Their right tap', 'only the word click');
    assert.equal(touchWords('Press B for the build menu, pick the Workbench (6 wood) and click on free ground to place it.'), 'Tap BUILD for the build menu, pick the Workbench (6 wood) and tap on free ground to place it.');
    assert.equal(touchWords('Walk up and press E to put things in. A friend can hold E to pick you up.'), 'Walk up and tap USE to put things in. A friend can hold USE to pick you up.');
    assert.equal(touchWords('Open your Backpack (I) and click it. Learn Taming (K) first. Hold X to take it down.'), 'Open your Backpack (BAG) and tap it. Learn Taming (MENU) first. Hold REMOVE to take it down.');
    assert.equal(touchWords('Press K and spend it. Press J for the Journal.'), 'Open MENU > Skills and spend it. Open MENU > Journal for the Journal.');
    assert.equal(touchWords('Press Enter to chat. Press Esc to stop.'), 'Press Enter to chat. Press Esc to stop.', 'only the keys a phone has as buttons');
    assert.equal(touchWords('Press R to wake up at home.'), 'Press R to wake up at home.', 'R means two things: it is left alone');
    assert.equal(touchWords('Level 8! +7 skill points  (K)'), 'Level 8! +7 skill points  (MENU)', 'a key in brackets is the menu on a phone');
    assert.equal(touchWords('New quest: Fresh Soil  (J)'), 'New quest: Fresh Soil  (MENU)');
});

/** Every screen line that names Shift or right-click must have a phone version beside it (deviceText) or be a desktop-only table. */
test('no hint that names Shift or right-click is shown on a phone without a phone version', () => {
    const dir = join(__dirname, '..', 'src', 'client', 'ui');
    const files = [...readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => join(dir, f)), ...readdirSync(join(dir, 'screens')).map((f) => join(dir, 'screens', f))];
    const bad: string[] = [];
    for (const f of files) {
        readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
            const code = line.trim();
            if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
            if (!/[Rr]ight-click|Shift\b/.test(code)) return;
            if (/deviceText\(|isTouchUi\(\)|!touch|touchWords|forDevice/.test(code)) return;
            if (/menu\.ts$/.test(f)) return;                              // the Controls table is a keyboard list
            if (/guide\.ts$/.test(f) && /On a phone/.test(code)) return;  // (already a phone line)
            if (/[Rr]ight-click/.test(code) && !/Shift/.test(code) && /tipOn|itemTip|foot|tip:|lines:/.test(code)) return;     // (tooltips get the generic words: Tooltip.show)
            if (/(grid|kit|gestures)\.ts$/.test(f)) return;               // (the code that does the shift / right-click and the word swap itself)
            if (/(shift|holdIsShift)\b/.test(code) && !/'[^']*(Shift|[Rr]ight-click)[^']*'/.test(code)) return;     // code, not words
            bad.push(`${f.split('ui')[1]}:${i + 1}: ${code.slice(0, 90)}`);
        });
    }
    assert.deepEqual(bad, [], 'wrap the mouse wording in deviceText(mouse, touch)');
});

// ── why a building will not go there ────────────────────────────────────────
/** A player on their island (12 × 11 tiles of land) with room around them, loaded with materials and every unlock. */
function yard (seed: string) {
    const sim = Sim.create(seed, 'h');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 8.5) * TILE; p.y = (o.ty + 8.5) * TILE; p.hearts = 99; p.invuln = 999;
    for (const n of SKILL_LIST) p.skills[n.id] = n.max;                 // (every building is unlocked)
    const stock = () => { for (const id of Object.keys(ITEMS) as ItemId[]) if (ITEMS[id].kind !== 'gear') p.inv[id] = 200; };
    stock();
    const env: PlaceEnv = { world: sim.world, ent: (id) => sim.s.ents[id], get x () { return p.x; }, get y () { return p.y; } };
    return { sim, p, env, o, stock, tx: Math.floor(p.x / TILE), ty: Math.floor(p.y / TILE) };
}

test('a free tile in reach fits; one past the build reach is "too far"', () => {
    const { env, tx, ty } = yard('P-1');
    assert.equal(placeWhy(env, 'chest', tx + 2, ty - 2), null);
    const reach = TUNING.buildRange + 1;
    assert.equal(placeWhy(env, 'chest', tx + reach, ty), null, 'the last tile in reach');
    assert.equal(placeWhy(env, 'chest', tx + reach + 1, ty), 'Too far: step closer');
    assert.equal(placeWhy(env, 'chest', tx + reach + 1, ty, null), null, 'leaving reach out (blueprints have their own)');
});

test('what is in the way is named', () => {
    const { sim, env, tx, ty } = yard('P-2');
    sim.command('a', { t: 'build', kind: 'chest', tx: tx + 2, ty, rot: 0 });
    assert.equal(placeWhy(env, 'chest', tx + 2, ty), 'The Chest is in the way');
    assert.equal(placeWhy(env, 'wall_wood', tx + 2, ty), 'The Chest is in the way');
    sim.command('a', { t: 'build', kind: 'planks', tx: tx - 2, ty, rot: 0 });
    assert.equal(placeWhy(env, 'planks', tx - 2, ty), 'There is a floor here already');
    assert.equal(placeWhy(env, 'chest', tx - 2, ty), null, 'a floor is walked on: things stand on it');
    sim.command('a', { t: 'build', kind: 'roof_thatch', tx: tx - 2, ty, rot: 0 });
    assert.equal(placeWhy(env, 'roof_thatch', tx - 2, ty), 'There is a roof here already');
    sim.command('a', { t: 'build', kind: 'belt', tx, ty: ty + 3, rot: 0 });
    assert.equal(placeWhy(env, 'chest', tx, ty + 3), 'A belt is in the way');
});

test('the farmer\'s own feet are in the way of a solid piece, but not of a floor', () => {
    const { env, tx, ty } = yard('P-3');
    assert.equal(placeWhy(env, 'chest', tx, ty), 'You are standing there: step aside');
    assert.equal(placeWhy(env, 'planks', tx, ty), null);
});

test('open sea, land that is not yours yet and a cut-off corner each say so', () => {
    const { sim, env, o } = yard('P-4');
    const w = sim.world;
    assert.ok(!w.isLand(0, 0));
    assert.match(landWhy(w, 0, 0), /^Open sea/);
    assert.match(landWhy(w, -3, 5), /^Open sea/, 'off the map');
    let forSale = 0;
    for (let y = o.ty - 14; y < o.ty + 26; y++) {
        for (let x = o.tx - 14; x < o.tx + 26; x++) {
            if (w.isLand(x, y)) continue;
            const why = landWhy(w, x, y);
            assert.match(why, /^(Open sea|Not your land|Water)/, 'always a reason');
            assert.equal(placeWhy(env, 'planks', x, y, null), why, `planks at ${x},${y}`);
            if (/^Not your land yet: buy/.test(why)) forSale++;
        }
    }
    assert.ok(forSale > 0, 'a plot beside yours is for sale');
    // the corner of an owned plot is cut away to round the island: water, not "not yours"
    const corner = [[o.tx, o.ty], [o.tx + 11, o.ty], [o.tx, o.ty + 11], [o.tx + 11, o.ty + 11]].find(([x, y]) => !w.isLand(x, y));
    if (corner) assert.match(landWhy(w, corner[0], corner[1]), /^Water/);
});

test('a doorway can be set into a wall', () => {
    const { sim, env, tx, ty } = yard('P-5');
    sim.command('a', { t: 'build', kind: 'wall_wood', tx: tx + 2, ty: ty + 1, rot: 0 });
    assert.equal(placeWhy(env, 'doorway', tx + 2, ty + 1), null);
    assert.equal(placeWhy(env, 'chest', tx + 2, ty + 1), 'The Wooden Wall is in the way');
});

test('the explanation agrees with the server on every tile round the player', () => {
    const { sim, p, env, stock, tx, ty } = yard('P-6');
    // some clutter first, so there is something to be in the way
    for (const [dx, dy, kind] of [[2, 1, 'chest'], [-3, 0, 'planks'], [1, -3, 'wall_wood'], [3, 3, 'belt'], [-2, 3, 'roof_thatch']] as [number, number, BuildingKind][]) sim.command('a', { t: 'build', kind, tx: tx + dx, ty: ty + dy, rot: 0 });
    let fits = 0, refused = 0;
    for (const kind of ['chest', 'planks', 'wall_wood', 'roof_thatch', 'campfire', 'bed', 'furnace', 'doorway', 'belt'] as BuildingKind[]) {
        for (let dy = -9; dy <= 9; dy++) {
            for (let dx = -9; dx <= 9; dx++) {
                stock();
                const why = placeWhy(env, kind, tx + dx, ty + dy);
                const r = tryBuild(sim, p, kind, tx + dx, ty + dy, 0);
                assert.equal(why === null, r.ok, `${kind} at ${dx},${dy}: said "${why}", the server said ${r.ok ? 'yes' : r.why}`);
                if (r.ok) fits++; else refused++;
            }
        }
    }
    assert.ok(fits > 20 && refused > 200, `a fair mix (${fits} fit, ${refused} refused)`);
});

// ── dragging a line ─────────────────────────────────────────────────────────
test('a drag that jumps several tiles is filled in, one step along one axis at a time', () => {
    const a = { tx: 10, ty: 10 };
    for (const b of [{ tx: 15, ty: 10 }, { tx: 10, ty: 4 }, { tx: 14, ty: 13 }, { tx: 6, ty: 8 }, { tx: 10, ty: 10 }, { tx: 11, ty: 10 }]) {
        const path = tilesBetween(a, b);
        assert.equal(path.length, Math.abs(b.tx - a.tx) + Math.abs(b.ty - a.ty), 'no tile skipped, none twice');
        let prev = a;
        for (const t of path) { assert.equal(Math.abs(t.tx - prev.tx) + Math.abs(t.ty - prev.ty), 1, 'never diagonal'); prev = t; }
        if (path.length) assert.deepEqual(path[path.length - 1], b);
    }
    assert.deepEqual(tilesBetween(a, { tx: 13, ty: 10 }), [{ tx: 11, ty: 10 }, { tx: 12, ty: 10 }, { tx: 13, ty: 10 }]);
});

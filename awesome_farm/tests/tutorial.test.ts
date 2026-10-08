// The starting tutorial: every step has its words, nothing throws for any kind of farmer, the steps can be walked in order with
// real commands (a scripted player), the facts in the text match the rules, and a replay counts from where it began.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { TUNING } from '../src/shared/config';
import { BUILDINGS } from '../src/shared/data/buildings';
import { ITEMS } from '../src/shared/data/items';
import { RECIPES } from '../src/shared/data/recipes';
import { advance, nearFacts, say, seasoned, SEASONED_LEVEL, shown, STEPS, stepText, TOTAL, veteran, WORDS, type TutorialView } from '../src/shared/data/tutorial';
import { costWords } from '../src/shared/data/items';
import { Sim } from '../src/shared/sim/sim';
import { countOf, derived } from '../src/shared/sim/stats';
import type { BuildE, PlayerS } from '../src/shared/sim/types';
import { Hints, type HintStore } from '../src/shared/data/hints';
import { TIP_BY_ID, TIP_FIRST, TIP_GAP, TIP_PREFIX, TIPS, TipRunner, due, duskAlarm, tipFacts, type TipGate, type TipView } from '../src/shared/data/tips';
import { SPECIES_LIST } from '../src/shared/data/creatures';
import { seasonOf } from '../src/shared/season';
import { Bot } from './botlib';

type Ui = TutorialView['ui'];

function view (sim: Sim, p: PlayerS, ui: Partial<Ui> = {}, base: Record<string, number> = {}): TutorialView {
    const prices = sim.world.purchasable().map((pl) => Math.max(1, Math.round(sim.world.price(pl, p.plotsBought) * derived(p).landMul)));
    return { me: p, base, clock: { clock: sim.s.clock, night: sim.s.night }, ui: { walked: 0, opened: [], placing: null, ...ui }, near: nearFacts(Object.values(sim.s.ents)), price: prices.length ? Math.min(...prices) : null };
}

const ids = STEPS.map((s) => s.id);

test('every step has an icon, a short title and short words for a keyboard and for a phone', () => {
    assert.ok(TOTAL >= 12 && TOTAL <= 16, `${TOTAL} steps`);
    assert.equal(new Set(ids).size, TOTAL, 'ids are unique');
    const sim = Sim.create('TUT-1', 't');
    const p = sim.join('a', 'A')!;
    const { desktop, touch } = WORDS;
    assert.deepEqual(Object.keys(desktop).sort(), Object.keys(touch).sort(), 'both devices have every word');
    for (const s of STEPS) {
        assert.ok(/^(k_\w+|i_\w+|\w+)$/.test(s.icon), `${s.id}: icon key`);
        if (s.icon.startsWith('i_')) assert.ok(ITEMS[s.icon.slice(2) as keyof typeof ITEMS], `${s.id}: ${s.icon} is a real item`);
        if (s.icon.startsWith('k_')) assert.ok(glyphs.has(s.icon), `${s.id}: ${s.icon} is a glyph the client draws`);
        if (!s.icon.startsWith('k_') && !s.icon.startsWith('i_')) assert.ok(Object.values(BUILDINGS).some((b) => b.tex === s.icon), `${s.id}: ${s.icon} is a building texture`);
        assert.ok(s.title.length >= 6 && s.title.length <= 26, `${s.id}: title "${s.title}"`);
        // try the words in every situation the step can be in: nothing, plenty, a night, a bed ripe…
        const rich = { ...p, inv: { wood: 99, stone: 99, berry: 3, seed_wheat: 2 }, coins: 99, points: 2 } as PlayerS;
        const situations: TutorialView[] = [
            view(sim, p), view(sim, rich), view(sim, rich, { placing: 'campfire', opened: ['inventory'] }),
            { ...view(sim, rich), clock: { clock: TUNING.dayLength - 30, night: false }, near: { bld: { workbench: 1, chest: 1, bed: 1, market: 1 }, beds: { empty: 0, growing: 1, ripe: 1 } } },
            { ...view(sim, p), clock: { clock: TUNING.dayLength + 5, night: true }, price: 50 },
        ];
        for (const v of situations) {
            for (const touchUi of [false, true]) {
                const t = stepText(s, v, touchUi);
                assert.ok(t.length >= 20 && t.length <= 130, `${s.id} (${touchUi ? 'phone' : 'keyboard'}): ${t.length} chars: ${t}`);
                assert.ok(!/\{\w+\}/.test(t), `${s.id}: an unfilled {token} in "${t}"`);
            }
            s.target?.(v); s.progress?.(v); s.urgent?.(v); s.done(v);
        }
    }
});

test('the numbers in the words are the real costs', () => {
    assert.equal(costWords(BUILDINGS.workbench.cost), '6 wood');
    const sim = Sim.create('TUT-2', 't');
    const p = sim.join('a', 'A')!;
    p.inv.wood = 50; p.inv.stone = 50;
    const v = view(sim, p);
    const text = (id: string, over: Partial<TutorialView> = {}) => stepText(STEPS.find((s) => s.id === id)!, { ...v, ...over }, false);
    assert.ok(text('bench').includes(`(${costWords(BUILDINGS.workbench.cost)})`), 'the workbench price');
    assert.ok(text('plank', { near: { bld: { workbench: 1 }, beds: { empty: 0, growing: 0, ripe: 0 } } }).includes(`(${costWords(RECIPES['workbench:plank'].in)})`), 'the plank price');
    assert.ok(text('fire').includes(`(${costWords(BUILDINGS.campfire.cost)})`), 'the campfire price');
    assert.ok(text('chest').includes(`(${costWords(BUILDINGS.chest.cost)})`), 'the chest price');
    assert.ok(text('plant').includes(`(${costWords(BUILDINGS.bed.cost)})`), 'the garden bed price');
    assert.ok(text('sell').includes(`(${costWords(BUILDINGS.market.cost)})`), 'the market stall price');
    // the build menu tab each building sits in is named right
    assert.ok(text('chest').includes('Storage') && text('plant').includes('Farming') && text('sell').includes('Special') && text('fire').includes('Light') && text('bench').includes('Crafting'));
    // a lack is said out loud, and points at what fills it
    p.inv.wood = 2;
    const poor = view(sim, p);
    assert.ok(/You need 6 wood/.test(stepText(STEPS[3], poor, false)));
    assert.deepEqual(STEPS[3].target!(poor), [{ node: 'tree' }]);
    assert.deepEqual(STEPS[3].target!(view(sim, { ...p, inv: { wood: 9 } } as PlayerS)), [{ hud: 'build' }]);
    // the words differ for a phone
    assert.equal(say('{Press} {build} and {tap}', false), 'Press B and click');
    assert.equal(say('{Press} {build} and {tap}', true), 'Tap BUILD and tap');
    assert.equal(say(['a', 'b'], true), 'b');
});

test('the steps can be walked in order with real commands, and each one turns done exactly when it should', () => {
    const bot = new Bot('TUT-3');
    const { sim, p } = bot;
    const open: string[] = [];
    let index = 0, ui: Partial<Ui> = {};
    const v = () => view(sim, p, { opened: open, ...ui });
    const expectStep = (id: string, doIt: () => void) => {
        const i = ids.indexOf(id);
        const r = advance(index, v());
        assert.equal(r.index, i, `before "${id}" the tutorial waits on it (it is on ${ids[r.index]})`);
        assert.ok(!STEPS[i].done(v()), `${id} is not done yet`);
        doIt();
        assert.ok(STEPS[i].done(v()), `${id} is done`);
        index = advance(index, v()).index;
        assert.equal(index, i + 1, `after "${id}" it moves on to ${ids[i + 1] ?? 'the end'}`);
    };
    assert.equal(advance(0, v()).index, 0, 'a brand-new farmer starts at the first step');
    expectStep('walk', () => { ui = { walked: 60 }; });
    expectStep('wood', () => { bot.harvest('tree', 3); });
    assert.ok(countOf(p, 'wood') >= 6);
    expectStep('bag', () => { open.push('inventory'); });
    expectStep('bench', () => { assert.ok(bot.build('workbench')); });
    expectStep('plank', () => { bot.craft('workbench:plank', 1); });
    expectStep('stone', () => { bot.harvest('rock', 3); });
    expectStep('chest', () => {
        bot.harvest('tree', 4);
        assert.ok(bot.build('chest'));
        const chest = sim.buildings('chest')[0];
        bot.goto((chest.tx + 0.5) * 16, (chest.ty + 2) * 16);
        sim.command('bot', { t: 'xfer', id: chest.id, item: 'wood', n: 2, dir: 'put' });
    });
    expectStep('plant', () => {
        bot.harvest('tree', 2);
        assert.ok(bot.build('bed'));
        bot.harvest('flower', 3);
        const bed = sim.buildings('bed')[0] as BuildE;
        bot.goto((bed.tx + 0.5) * 16, (bed.ty + 2) * 16);
        const seed = (['seed_wheat', 'seed_carrot', 'seed_beet', 'seed_corn', 'seed_cotton'] as const).find((s) => countOf(p, s) > 0)!;
        sim.command('bot', { t: 'use', id: bed.id, seed });
    });
    expectStep('harvest', () => {
        bot.run(40);
        const bed = sim.buildings('bed')[0];
        assert.equal(bed.crop, 2, 'ripe');
        assert.equal(v().near.beds.ripe, 1, 'the view sees it ripe');
        sim.command('bot', { t: 'use', id: bed.id });
    });
    expectStep('sell', () => {
        bot.harvest('tree', 4); bot.harvest('rock', 3);
        assert.ok(bot.build('market'));
        const mk = sim.buildings('market')[0];
        bot.goto((mk.tx + 1) * 16, (mk.ty + 2) * 16);
        sim.command('bot', { t: 'sell', item: 'wood', n: 10 });
    });
    expectStep('land', () => { assert.ok(bot.buyPlots(2)); });
    expectStep('fire', () => { bot.harvest('tree', 3); bot.harvest('rock', 2); assert.ok(bot.build('campfire')); });
    expectStep('eat', () => { bot.harvest('bush', 1); p.energy = 20; sim.command('bot', { t: 'eat', item: 'berry' }); });
    expectStep('skill', () => { sim.gainXp(p, 400); sim.command('bot', { t: 'skill', id: 'g_hands' }); });
    expectStep('pin', () => { sim.command('bot', { t: 'hot', slot: 5, item: 'wood' }); });
    expectStep('night', () => { bot.sleepThroughNight(); });
    assert.equal(index, TOTAL, 'all done');
    assert.equal(advance(index, v()).index, TOTAL, 'and it stays done');
});

test('a tutorial cannot throw for any kind of farmer, and a veteran never sees it', () => {
    const sim = Sim.create('TUT-4', 't');
    const p = sim.join('a', 'A')!;
    assert.ok(!veteran(p), 'a new farmer needs it');
    for (const lvl of [1, 3, 4, 40]) {
        const q = { ...p, level: lvl, cnt: lvl > 3 ? { night: 5, 'build:workbench': 3 } : undefined } as PlayerS;
        const vw = view(sim, q);
        assert.equal(veteran(q), lvl > 3);
        for (const s of STEPS) { assert.equal(typeof s.done(vw), 'boolean'); stepText(s, vw, true); }
        assert.ok(shown(0, vw) >= 0);
        advance(0, vw);
    }
    // a farmer with a workbench already starts after it, not at the beginning
    const mid = { ...p, level: 2, cnt: { 'harvest:tree': 4, 'build:workbench': 1, harvest: 4, build: 1 }, inv: { wood: 8 } } as PlayerS;
    const r = advance(0, view(sim, mid));
    assert.equal(ids[r.index], 'plank', 'it starts at the first thing they have not done');
    assert.deepEqual(r.passed.map((i) => ids[i]), ['walk', 'wood', 'bag', 'bench']);
});

test('night falling brings the campfire (and later the night) forward, and no step is forced to wait for dusk', () => {
    const sim = Sim.create('TUT-5', 't');
    const p = sim.join('a', 'A')!;
    const noon = view(sim, p);
    assert.equal(shown(2, noon), 2, 'in the day the order is kept');
    const dusk = { ...noon, clock: { clock: TUNING.dayLength - 40, night: false } };
    assert.equal(ids[shown(2, dusk)], 'fire', 'a farmer still on the backpack is told to light a fire');
    const built = { ...dusk, me: { ...p, cnt: { 'build:campfire': 1 } } as PlayerS };
    assert.equal(shown(2, built), 2, 'once it is lit the order carries on');
    const night = { ...built, clock: { clock: TUNING.dayLength + 2, night: true } };
    assert.equal(ids[shown(2, night)], 'night', 'in the dark the night comes first');
    assert.ok(STEPS.filter((s) => s.urgent).length === 2);
    // the last step only waits for the night itself, never blocks the ones before it
    assert.equal(ids[ids.length - 1], 'night');
});

test('the night passes only its own steps: at dawn the tutorial goes back to the first thing not done, unless the farmer is seasoned', () => {
    const bot = new Bot('TUT-7');
    const { sim, p } = bot;
    bot.harvest('tree', 6); bot.harvest('rock', 3);
    assert.ok(bot.build('workbench'));
    bot.craft('workbench:plank', 1);
    assert.ok(bot.build('campfire'));
    const v = () => view(sim, p, { walked: 60, opened: ['inventory'] });
    assert.equal(ids[advance(0, v()).index], 'chest', 'a farmer still on the chest step when dusk comes');
    bot.sleepThroughNight();
    assert.ok(STEPS[ids.indexOf('fire')].done(v()) && STEPS[ids.indexOf('night')].done(v()), 'the night and its fire are done');
    const r = advance(0, v());
    assert.equal(ids[r.index], 'chest', 'the morning after, the lessons not seen yet are still to come');
    assert.ok(!r.passed.includes(ids.indexOf('plant')) && !r.passed.includes(ids.indexOf('sell')), 'nothing was skipped on the way');
    assert.equal(ids[shown(r.index, v())], 'chest', 'and the card shows the step they are on, not the night');
    // a farmer who has clearly learnt the ropes is let off the rest once they have seen a night through
    assert.ok(!seasoned(p), 'a farmer on their first morning is not seasoned');
    const high = { ...p, level: SEASONED_LEVEL } as PlayerS;
    assert.ok(seasoned(high) && advance(0, { ...v(), me: high }).index === TOTAL, 'a high level with the night done is enough');
    const nights = { ...p, cnt: { ...(p.cnt ?? {}), night: 3 } } as PlayerS;
    assert.ok(seasoned(nights) && advance(0, { ...v(), me: nights }).index === TOTAL, 'so are a few nights seen');
    assert.equal(ids[advance(0, { ...v(), me: { ...high, cnt: { ...(high.cnt ?? {}), night: 0 } } as PlayerS }).index], 'chest', 'but not before the night itself is done');
});

test('a replay counts from where it began, so it asks for things to be done again', () => {
    const bot = new Bot('TUT-6');
    const { sim, p } = bot;
    bot.harvest('tree', 3);
    assert.ok(bot.build('workbench'));
    bot.craft('workbench:plank', 1);
    const first = view(sim, p);
    assert.ok(advance(0, first).index >= 2, 'the first time, old work counts');
    const base = { ...(p.cnt ?? {}) };
    const again = view(sim, p, { walked: 100, opened: ['inventory'] }, base);
    const r = advance(0, again);
    assert.equal(ids[r.index], 'wood', 'a replay wants a tree chopped again');
    bot.harvest('tree', 3);
    assert.equal(ids[advance(0, view(sim, p, { walked: 100, opened: ['inventory'] }, base)).index], 'bench', 'and a new workbench');
});

// ── progression tips ────────────────────────────────────────────────────────
const glyphs = new Set([...readFileSync(new URL('../src/client/art/icons.ts', import.meta.url), 'utf8').matchAll(/^    (k_[a-z]+):/gm)].map((m) => m[1]));
const noFlags = { zoomed: false, fell: false, online: 1, friendDown: false, rain: false, touch: false };

function tipView (sim: Sim, p: PlayerS, over: Partial<Omit<TipView, 'flags'>> = {}, flags: Partial<TipView['flags']> = {}): TipView {
    return { me: p, day: 1, clock: 10, night: false, ...tipFacts(Object.values(sim.s.ents)), ...over, flags: { ...noFlags, ...flags } };
}
const memStore = () => { const mem: string[] = []; const store: HintStore = { load: () => [...mem], save: (ids) => { mem.length = 0; mem.push(...ids); } }; return { mem, store }; };
const calm: TipGate = { quiet: false, fighting: false, tutorial: false, off: false };

test('every tip is short, has a real icon and a trigger that never throws', () => {
    assert.ok(TIPS.length >= 36 && TIPS.length <= 60, `${TIPS.length} tips`);
    assert.equal(new Set(TIPS.map((t) => t.id)).size, TIPS.length, 'ids are unique');
    const sim = Sim.create('TIP-1', 't');
    const p = sim.join('a', 'A')!;
    const vet = { ...p, level: 60, points: 9, inv: { copper: 3, iron: 3, sand: 1, clay: 1, ironbar: 9 }, stats: { ...p.stats, built: 99 } } as PlayerS;
    for (const t of TIPS) {
        assert.ok(t.title.length >= 4 && t.title.length <= 28, `${t.id}: title "${t.title}"`);
        assert.ok(t.text.length >= 40 && t.text.length <= 215, `${t.id}: ${t.text.length} chars`);
        assert.ok(/^(k_\w+|i_\w+)$/.test(t.icon), `${t.id}: icon`);
        if (t.icon.startsWith('i_')) assert.ok(ITEMS[t.icon.slice(2) as keyof typeof ITEMS], `${t.id}: ${t.icon} is an item`);
        else assert.ok(glyphs.has(t.icon), `${t.id}: ${t.icon} is a glyph the client draws`);
        assert.ok(!/\{\w+\}/.test(t.text), `${t.id}: no tokens`);
        for (const me of [p, vet]) assert.equal(typeof t.when(tipView(sim, me, { day: 30, night: true })), 'boolean');
    }
    assert.equal(TIP_BY_ID.copper.title, 'Copper!');
});

test('a tip turns up when it matters, and only for what the farmer has reached', () => {
    const sim = Sim.create('TIP-2', 't');
    const p = sim.join('a', 'A')!;
    const ids = (v: TipView, tut = false) => due(v, new Set(), tut).map((t) => t.id);
    assert.deepEqual(ids(tipView(sim, p)), [], 'nothing to say to a brand-new farmer');
    p.inv.copper = 2;
    assert.ok(ids(tipView(sim, p)).includes('copper'));
    assert.ok(!ids(tipView(sim, { ...p, level: 30 } as PlayerS)).includes('copper'), 'a veteran knows what copper is');
    for (const [lvl, id] of [[5, 'level5'], [10, 'level10'], [20, 'level20']] as const) {
        assert.ok(ids(tipView(sim, { ...p, level: lvl } as PlayerS)).includes(id), `${id} at level ${lvl}`);
        assert.ok(!ids(tipView(sim, { ...p, level: lvl - 1 } as PlayerS)).includes(id), `not before ${lvl}`);
    }
    assert.ok(!ids(tipView(sim, p, {}, { fell: true }), true).includes('fall'), 'while the tutorial card is up a tip waits, even the one about a fall');
    assert.ok(ids(tipView(sim, p, {}, { fell: true })).includes('fall'), 'and is told once it is over');
    assert.ok(ids(tipView(sim, { ...p, points: 2 } as PlayerS)).includes('points'));
    assert.ok(ids(tipView(sim, p, { clock: 245 })).includes('dusk'), 'a minute before dusk');
    assert.ok(!ids(tipView(sim, p, { clock: 100 })).includes('dusk'));
    assert.ok(ids(tipView(sim, { ...p, level: 3 } as PlayerS, { day: 22 })).includes('winter') && seasonOf(22) === 'winter');
    // buildings in view
    const bld = (kind: string, extra = {}) => ({ k: 'bld', kind, tx: 1, ty: 1, rot: 0, ...extra }) as unknown as BuildE;
    const facts = (...es: BuildE[]) => ({ ...tipView(sim, p), ...tipFacts(es) });
    assert.ok(ids(facts(bld('drill'))).includes('drill') && ids(facts(bld('pole'))).includes('pole') && ids(facts(bld('altar'))).includes('altar'));
    assert.ok(!ids(facts(bld('chest', { inv: { wood: 100 } }))).includes('chestFull'));
    assert.ok(ids(facts(bld('chest', { inv: { wood: 380 } }))).includes('chestFull'), 'a chest nearly full (400)');
    assert.ok(ids(facts(bld('chest'), bld('chest'))).includes('sortChests'));
    assert.ok(ids(facts(bld('mineshaft'))).includes('shaft'), 'a mine shaft, whatever it is called, once it exists');
    // a friend down, and the weather
    assert.ok(ids(tipView(sim, p, {}, { friendDown: true })).includes('revive'));
    assert.ok(ids(tipView(sim, p, {}, { rain: true })).includes('rain'));
    // skills that unlock things
    p.skills.c_dash = 1;
    assert.ok(ids(tipView(sim, p)).includes('dash'));
    // while the dusk countdown is on, only the tips about the evening (and a friend in trouble) may show
    const alarm = tipView(sim, { ...p, points: 2, inv: { copper: 2 } } as PlayerS, { clock: TUNING.dayLength - 30 });
    assert.ok(duskAlarm(alarm) && !duskAlarm(tipView(sim, p, { clock: 100 })));
    assert.ok(ids(alarm).includes('dusk') && !ids(alarm).includes('points') && !ids(alarm).includes('copper') && !ids(alarm).includes('dash'), `at dusk: ${ids(alarm).join(', ')}`);
    assert.ok(ids(tipView(sim, { ...p, points: 2 } as PlayerS, { clock: TUNING.dayLength - 30 }, { friendDown: true })).includes('revive'), 'a friend down still is');
    // "a new friend" is for a creature with nothing to do yet, not one that was just given a job
    const pet = (extra = {}) => ({ id: 'p0', sp: SPECIES_LIST[0], name: 'Bean', lv: 1, xp: 0, traits: [], ...extra });
    assert.ok(ids(tipView(sim, { ...p, pets: [pet()] } as PlayerS)).includes('tamed'));
    assert.ok(!ids(tipView(sim, { ...p, pets: [pet({ task: 'farm' })] } as PlayerS)).includes('tamed'), 'a task is a job');
    assert.ok(!ids(tipView(sim, { ...p, pets: [pet({ den: 3 })] } as PlayerS)).includes('tamed'), 'so is a den');
});

test('tips come one at a time, a gap apart, never while busy, and each only once', () => {
    const sim = Sim.create('TIP-3', 't');
    const p = sim.join('a', 'A')!;
    p.inv.copper = 2; p.inv.iron = 2; p.inv.sand = 2; p.level = 2;
    const { mem, store } = memStore();
    const run = new TipRunner(store);
    const v = () => tipView(sim, p);
    const poke = (secs: number, gate: Partial<TipGate> = {}, r = run) => { let got: string | undefined; for (let s = 0; s < secs; s += 1) got = got ?? r.update(1, v(), { ...calm, ...gate })?.id; return got; };
    assert.equal(poke(TIP_FIRST - 5), undefined, 'a quiet start');
    assert.equal(poke(10, { quiet: true }), undefined, 'not while a window is open');
    assert.equal(poke(10, { fighting: true }), undefined, 'not while fighting');
    assert.equal(poke(10, { off: true }), undefined, 'not when switched off');
    const first = poke(10);
    assert.ok(first, 'then the first one');
    assert.deepEqual(mem, [TIP_PREFIX + first], 'remembered, behind its prefix');
    assert.equal(poke(TIP_GAP - 20), undefined, 'a gap before the next');
    const second = poke(40);
    assert.ok(second && second !== first, 'and the next one is different');
    // every tip due is told in the end, once
    const told = [first, second];
    for (let i = 0; i < 12; i++) { const t = poke(TIP_GAP + 2); if (t) { assert.ok(!told.includes(t), `${t} twice`); told.push(t); } }
    assert.ok(told.length >= 3, `${told.join(', ')}`);
    // a new session remembers what was told
    const again = new TipRunner(store);
    for (const id of told) assert.ok(again.has(id!));
    const more = poke(TIP_GAP * 3, {}, again);
    assert.ok(!more || !told.includes(more), 'what was told is not told again');
    // the fall skips the gap, but never talks over the tutorial card
    const fall = new TipRunner(memStore().store);
    assert.equal(fall.update(1, tipView(sim, p, {}, { fell: true }), { ...calm, tutorial: true }), null);
    assert.equal(fall.update(1, tipView(sim, p, {}, { fell: true }), calm)?.id, 'fall');
});

test('the tip list and the first-time hints share one store without wiping each other', () => {
    const sim = Sim.create('TIP-4', 't');
    const p = sim.join('a', 'A')!;
    const mem: string[] = [];
    // an additive store like the client's
    const store: HintStore = { load: () => [...mem], save: (ids) => { const all = [...new Set([...mem, ...ids])]; mem.length = 0; mem.push(...all); } };
    p.inv.copper = 1; p.level = 2;
    const hints = new Hints(() => undefined, store, () => ({ fish: 'Q' }));
    const tips = new TipRunner(store);
    sim.give(p, 'rod', 1);
    hints.update(5, { me: p, prompt: 'Q: Cast your line' }, false);
    assert.equal(hints.cooling, true, 'a hint was just shown');
    for (let i = 0; i < TIP_FIRST + 5; i++) tips.update(1, tipView(sim, p), calm);
    hints.update(60, { me: p, prompt: 'Q: Cast your line' }, false);
    assert.ok(mem.includes('fish') && mem.includes(TIP_PREFIX + 'copper'), `both are kept: ${mem.join(',')}`);
});

test('the numbers and names in the tips are the real ones', () => {
    assert.equal(BUILDINGS.chest.storage, 400); assert.equal(BUILDINGS.steelchest.storage, 1500); assert.equal(BUILDINGS.steelchest.req, 'logistics');
    assert.ok(TIP_BY_ID.chestFull.text.includes('400') && TIP_BY_ID.chestFull.text.includes('1500'));
    assert.equal(RECIPES['furnace:copperbar'].in.copper, 1); assert.equal(RECIPES['anvil:wire'].in.copperbar, 1);
    assert.equal(RECIPES['anvil:helm_iron'].in.ironbar, 4); assert.equal(RECIPES['anvil:mail_iron'].in.ironbar, 8); assert.equal(RECIPES['anvil:mail_iron'].in.cloth, 2);
    assert.ok(TIP_BY_ID.armor.text.includes('4 iron bars') && TIP_BY_ID.armor.text.includes('8 bars and 2 cloth'));
    assert.ok(BUILDINGS.pole.desc.includes('3 tiles') && BUILDINGS.pole.desc.includes('7') && TIP_BY_ID.pole.text.includes('3 tiles') && TIP_BY_ID.pole.text.includes('7 tiles'));
    assert.ok(BUILDINGS.dock.desc.includes('four') && TIP_BY_ID.expedition.text.includes('four'));
    assert.equal(RECIPES['furnace:glass'].in.sand, 2); assert.equal(RECIPES['furnace:brick'].in.clay, 2);
    assert.equal(RECIPES['anvil:pick_gold'].req, 'smithing2', 'the golden pick needs Steelwork');
    assert.ok(BUILDINGS.drill.use !== undefined && BUILDINGS.windturbine.gen !== undefined);
    assert.equal(TUNING.duskWarn[0], 60, 'the dusk tip fires with the dusk countdown');
});

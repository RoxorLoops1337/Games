// The in-game guide and the first-time hints: the text has to fit its page and stay true to the rules it describes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS } from '../src/shared/data/buildings';
import { CAST_RANGE, MAX_STRIKES } from '../src/shared/data/fish';
import { GUIDE, GUIDE_BY_ID, guideText } from '../src/shared/data/guide';
import { ITEMS, STARTER_GEAR } from '../src/shared/data/items';
import { defaultHotbar } from '../src/shared/sim/hotbar';
import { RECIPES } from '../src/shared/data/recipes';
import { TILE } from '../src/shared/config';
import { Hints, HINTS, type HintStore } from '../src/shared/data/hints';
import { FACTORY_VIEW_KEY } from '../src/shared/data/howto';
import { STARTER_LAYOUTS } from '../src/shared/data/layouts';
import { SKILL_LIST } from '../src/shared/data/skills';
import { TUNNEL_RANGE } from '../src/shared/sim/factory';
import { SUPPLY, WIRE_RANGE, wind } from '../src/shared/sim/power';
import { Sim } from '../src/shared/sim/sim';

const recipe = (out: string) => Object.values(RECIPES).find((r) => r.out === out);
/** A guide line as a keyboard player (WASD, Q to fish) or a phone player reads it. */
const KEYS = { move: 'WASD', fish: 'Q' };
const desk = (s: Parameters<typeof guideText>[0]) => guideText(s, false, KEYS);
const phone = (s: Parameters<typeof guideText>[0]) => guideText(s, true, KEYS);

test('every guide topic is complete and short enough for its page', () => {
    assert.ok(GUIDE.length >= 10, 'a topic for each part of the game');
    assert.equal(new Set(GUIDE.map((t) => t.id)).size, GUIDE.length, 'ids are unique');
    for (const t of GUIDE) {
        assert.ok(t.name.length > 2 && t.name.length <= 24, `${t.id}: name fits its button`);
        assert.ok(/^(k_|i_)\w+$/.test(t.icon), `${t.id}: icon key`);
        if (t.icon.startsWith('i_')) assert.ok(ITEMS[t.icon.slice(2) as keyof typeof ITEMS], `${t.id}: ${t.icon} is a real item`);
        assert.ok(t.blurb.length > 10 && t.blurb.length <= 120, `${t.id}: blurb`);
        assert.ok(t.steps.length >= 4 && t.steps.length <= 7, `${t.id}: ${t.steps.length} steps`);
        for (const raw of t.steps) for (const read of [desk, phone]) { const s = read(raw); assert.ok(s.length > 20 && s.length <= 260, `${t.id}: step length ${s.length}: ${s.slice(0, 40)}`); }
        assert.ok(t.tips.length >= 1 && t.tips.length <= 2, `${t.id}: tips`);
        for (const raw of [...t.steps, ...t.tips, t.blurb]) {
            for (const read of [desk, phone]) assert.ok(!/\{\w+\}/.test(read(raw)), `${t.id}: a {token} was left in "${read(raw).slice(0, 50)}"`);
        }
    }
});

test('the first page reads right on a phone: buttons and taps, no keys, no mouse', () => {
    const steps = GUIDE_BY_ID.start.steps.map(phone);
    const tips = GUIDE_BY_ID.start.tips.map(phone);
    const text = [...steps, ...tips].join(' ');
    for (const word of [/\bPress\b/, /\bpress\b/, /WASD/, /\bhover\b/i, /\bclick/i, /\bSpace\b/, /\bEsc\b/, / [BCEJK]\)/]) assert.ok(!word.test(text), `no ${word} in: ${text}`);
    assert.ok(steps[0].includes('ACT') && steps[0].includes('stick'), 'walking and harvesting name the stick and ACT');
    assert.ok(steps[1].includes('BUILD') && steps[1].includes('MENU'), 'building and crafting name BUILD and MENU');
    assert.ok(steps[5].includes('tap USE'), 'buying land is the USE button');
    const keys = GUIDE_BY_ID.start.steps.map(desk).join(' ');
    assert.ok(keys.includes('Use WASD to walk') && keys.includes('Press B') && keys.includes('Press C') && keys.includes('press E'), 'a keyboard still reads the keys');
    assert.ok(guideText('Use {move} to walk', false, { move: 'ZQSD', fish: 'A' }) === 'Use ZQSD to walk', 'an AZERTY keyboard names its keys');
});

test('a guide line may carry a phone version of its own, and gestures are named for the device', () => {
    for (const t of GUIDE) {
        for (const raw of [...t.steps, ...t.tips]) {
            if (typeof raw === 'string') continue;
            assert.equal(raw.length, 2, `${t.id}: a pair is [keyboard, phone]`);
            assert.notEqual(raw[0], raw[1], `${t.id}: the phone line is a different line`);
        }
    }
    // a phone has no right-click and no Shift: where a page says so for a computer, the phone line says what to do instead
    for (const t of GUIDE) {
        for (const raw of [...t.steps, ...t.tips]) {
            if (/right-click|Shift\b/.test(phone(raw))) assert.fail(`${t.id}: a phone is told to right-click or use Shift: ${phone(raw).slice(0, 80)}`);
        }
    }
});

test('the fishing page matches the fishing rules', () => {
    const t = GUIDE_BY_ID.fish.steps.join(' ');
    const rod = recipe('rod')!;
    assert.equal(rod.station, 'workbench');
    assert.ok(t.includes(`${rod.in.wood} wood and ${rod.in.rope} rope`), 'the rod recipe');
    assert.equal(recipe('rope')!.station, 'hand');
    assert.ok(t.includes('{fish}'), 'names the fishing key');
    assert.equal(MAX_STRIKES, 2, 'two slips lose the fish');
    assert.ok(/twice/.test(t));
    const [lo, hi] = [Math.round(CAST_RANGE[0] / TILE), Math.floor(CAST_RANGE[1] / TILE)];
    assert.ok(t.includes(`${lo} to ${hi} tiles`), `the cast range is about ${lo} to ${hi} tiles`);
    assert.equal(recipe('rod_fine')!.station, 'anvil');
    assert.ok(t.includes('Crystal Rod') && recipe('rod_master')!.req === 'smithing3');
    assert.ok(recipe('bait'), 'bait can be made');
});

test('the house, farm and pack pages name things that exist', () => {
    const house = GUIDE_BY_ID.house.steps.map(desk).join(' ');
    for (const k of ['wall_wood', 'doorway', 'roof_tile'] as const) assert.ok(BUILDINGS[k].cat === 'home', `${k} is in the Walls & roofs tab`);
    assert.ok(house.includes('Walls & roofs'), 'the tab name');
    assert.ok(house.includes('60%'), 'the refund on dismantling is 60%');
    const pack = GUIDE_BY_ID.pack.steps.map(desk).join(' ');
    assert.ok(pack.includes('Satchel') && recipe('bag_satchel')!.station === 'workbench');
    assert.ok(pack.includes('Rucksack') && recipe('bag_rucksack')!.station === 'workbench');
    assert.ok(pack.includes('Explorer') && recipe('bag_pack')!.station === 'anvil');
    assert.ok(pack.includes('Hauler') && recipe('bag_frame')!.station === 'anvil');
    assert.ok(pack.includes('Rift Pack') && recipe('bag_rift')!.station === 'riftforge');
    assert.equal(BUILDINGS.bed.cost.wood, 3);
    assert.ok(GUIDE_BY_ID.farm.steps.map(desk).join(' ').includes('3 wood'));
    // the first page names the real starting weapon, in the slot the default hotbar gives it
    const weapon = ITEMS[STARTER_GEAR.weapon!].name;
    const bar = defaultHotbar({ inv: {}, equip: { ...STARTER_GEAR } });
    assert.equal(bar.indexOf(STARTER_GEAR.weapon!), 1, 'the weapon is hotbar slot 2');
    assert.ok(GUIDE_BY_ID.start.steps.map(desk).join(' ').includes(`your ${weapon} (hotbar slot 2)`), `the first page says ${weapon}`);
    assert.ok(!GUIDE_BY_ID.start.steps.map(desk).join(' ').includes('sword'), 'and no weapon a new farmer does not have');
});

test('first-time hints fire once, at the right moment, and not while you are busy', () => {
    const sim = Sim.create('G-1', 'g');
    const p = sim.join('a', 'A')!;
    const ids = (c: { prompt: string }) => HINTS.filter((h) => h.when({ me: p, prompt: c.prompt })).map((h) => h.id);
    assert.deepEqual(ids({ prompt: '' }), [], 'nothing to say at first');
    // a rod and a shore
    sim.give(p, 'rod', 1);
    assert.deepEqual(ids({ prompt: '' }), [], 'a rod away from the water is quiet');
    assert.deepEqual(ids({ prompt: 'Q: Cast your line' }), ['fish']);
    // a full stack, then a pack
    sim.give(p, 'wood', 100000);
    assert.ok(ids({ prompt: '' }).includes('full'), 'pockets full');
    sim.give(p, 'bag_satchel', 1);
    assert.ok(ids({ prompt: '' }).includes('pack'), 'a pack that is not worn');
    p.equip.bag = 'bag_satchel';
    assert.ok(!ids({ prompt: '' }).includes('pack') && !ids({ prompt: '' }).includes('full'), 'no more nagging once you wear one');
    // a floor
    p.cnt = { ...(p.cnt ?? {}), 'build:planks': 1 };
    assert.ok(ids({ prompt: '' }).includes('house'));
    // the Hints runner: one at a time, once each, and quiet while a window is open
    const said: string[] = [];
    const mem: string[] = [];
    const store: HintStore = { load: () => [...mem], save: (ids) => { mem.length = 0; mem.push(...ids); } };
    const h = new Hints((text) => said.push(text), store, () => ({ fish: 'Q' }));
    h.update(10, { me: p, prompt: 'Q: Cast your line' }, true);
    assert.equal(said.length, 0, 'quiet while a window is open');
    h.update(1, { me: p, prompt: 'Q: Cast your line' }, false);
    assert.equal(said.length, 1, 'the first hint');
    assert.ok(said[0].startsWith('Fishing: press Q to cast'), 'it names the key it was given');
    assert.deepEqual(mem, ['fish'], 'and remembers that it spoke');
    h.update(1, { me: p, prompt: 'Q: Cast your line' }, false);
    assert.equal(said.length, 1, 'not two at once');
    h.update(60, { me: p, prompt: 'Q: Cast your line' }, false);
    h.update(1, { me: p, prompt: 'Q: Cast your line' }, false);
    assert.equal(said.length, 2, 'the next one a little later');
    for (let i = 0; i < 20; i++) { h.update(60, { me: p, prompt: 'Q: Cast your line' }, false); h.update(1, { me: p, prompt: 'Q: Cast your line' }, false); }
    assert.ok(said.length <= HINTS.length, 'each hint at most once');
    // the dusk countdown: only a hint about what is happening right now may speak
    const dusk = new Hints((text) => said.push(text), { load: () => [], save: () => undefined }, () => ({ fish: 'Q' }), () => true);
    const n = said.length;
    dusk.update(5, { me: { ...p, level: 3 } as typeof p, prompt: '' }, false);
    assert.equal(said.length, n, 'the mailbox is not mentioned while the dusk alarm is on');
    dusk.update(5, { me: p, prompt: '', titan: true }, false);
    assert.equal(said.length, n + 1, 'a titan in front of you is');
    assert.ok(said[n].startsWith('A Titan!'));
    // "your creatures can work for you" waits until none of them has any job, a task beside you included
    const pets = (tasks: Partial<{ post: unknown; den: number; task: string }>[]) => ({ ...p, pets: tasks.map((t, i) => ({ id: `p${i}`, sp: 'mossling', name: `P${i}`, lv: 1, xp: 0, traits: [], ...t })) }) as unknown as typeof p;
    assert.ok(HINTS.find((h) => h.id === 'post')!.when({ me: pets([{}, {}]), prompt: '' }), 'two idle creatures');
    assert.ok(!HINTS.find((h) => h.id === 'post')!.when({ me: pets([{ task: 'farm' }, {}]), prompt: '' }), 'one of them already has a task');
    // a new session with the same memory stays quiet about what it already said
    const later: string[] = [];
    const again = new Hints((text) => later.push(text), store, () => ({ fish: 'Q' }));
    for (let i = 0; i < 4; i++) { again.update(60, { me: p, prompt: 'Q: Cast your line' }, false); again.update(1, { me: p, prompt: 'Q: Cast your line' }, false); }
    assert.ok(!later.some((t) => t.startsWith('Fishing')), 'the fishing hint is not repeated');
});

test('the automation pages name real skills, buildings, layouts and the true numbers', () => {
    const [factory, belts, power] = ['factory', 'belts', 'power'].map((id) => { const t = GUIDE_BY_ID[id]; assert.ok(t, `${id} page`); return [...t.steps, ...t.tips].join(' '); });
    for (const name of ['Logistics', 'Electricity', 'Mining Machines']) {
        assert.ok(SKILL_LIST.some((s) => s.name === name), `${name} is a skill`);
        assert.ok(factory.includes(name), `the first page names ${name}`);
    }
    for (const name of ['Smelter line', 'Flour mill', 'Mining outpost']) {
        assert.ok(STARTER_LAYOUTS.some((l) => l.name === name), `${name} is a starter layout`);
        assert.ok(factory.includes(name), `the first page names ${name}`);
    }
    assert.ok(factory.includes(`Press ${FACTORY_VIEW_KEY} `) && factory.includes('Press V and open Starter layouts'), 'the keys');
    for (const word of ['green gear', 'yellow hourglass', 'red bolt', 'red flame', 'red cross']) assert.ok(factory.includes(word), `the badge "${word}" is explained`);
    const names = new Set(Object.values(BUILDINGS).map((b) => b.name));
    for (const n of ['Mining Drill', 'Conveyor Belt', 'Inserter', 'Splitter', 'Sorter', 'Tunnel Entrance', 'Wind Turbine', 'Coal Generator', 'Solar Panel', 'Power Pole', 'Furnace', 'Sawmill', 'Millstone', 'Assembler']) {
        assert.ok(names.has(n), `${n} is a building`);
        assert.ok(`${factory} ${belts} ${power}`.includes(n), `${n} is mentioned somewhere`);
    }
    assert.ok(belts.includes(`${TUNNEL_RANGE} tiles`), 'tunnel reach');
    assert.ok(power.includes(`${SUPPLY} tiles`) && power.includes(`${WIRE_RANGE}`), 'pole reach');
    let lo = 1, hi = 0;
    for (let t = 0; t < 4000; t += 3) { const w = wind(t); lo = Math.min(lo, w); hi = Math.max(hi, w); }
    const range = `${Math.round(BUILDINGS.windturbine.gen! * lo)} to ${Math.round(BUILDINGS.windturbine.gen! * hi)} units`;
    assert.ok(power.includes(range), `wind makes ${range}`);
    assert.ok(power.includes(`steady ${BUILDINGS.coalgen.gen}`), 'coal generator output');
    assert.ok(power.includes(`drill uses ${BUILDINGS.drill.use} units, an inserter ${BUILDINGS.inserter.use} and an assembler ${BUILDINGS.assembler.use}`), 'what machines draw');
});

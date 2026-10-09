// Art integrity: every icon and world sprite grid uses only palette characters and has even rows.
import { PERKS } from '../src/shared/data/towerperks';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { iconGrids } from '../src/client/art/icons';
import { checkGrid } from '../src/client/art/pixels';
import { FACTORY_GRIDS } from '../src/client/art/factory';
import { MOB_TEXTURES } from '../src/client/art/storybook-mobs';
import { PAINTED_SPECIES } from '../src/client/art/storybook-critters';
import { SPECIES_LIST } from '../src/shared/data/creatures';
import { BUILDINGS } from '../src/shared/data/buildings';
import { dayIcon, nightIcon, vaneIcon } from '../src/shared/data/forecast';
import { forecast } from '../src/shared/weather';
import { ITEMS } from '../src/shared/data/items';
import { MOBS, type MobKind } from '../src/shared/data/mobs';
import { BOONS } from '../src/shared/data/rift';
import { WISHES } from '../src/shared/data/wishes';
import { SKILL_LIST } from '../src/shared/data/skills';
import { GROUND_VARIANTS, SHORE_FRAMES } from '../src/client/art/storybook-ground';
import { TILE_RIFT_CLIFF, TILE_SHORE, tileGround, tileShore } from '../src/client/art/sprites';
import { BIOMES } from '../src/shared/data/biomes';
import { WORN_BACK, WORN_BAG, WORN_BODY, WORN_CHARM, WORN_HEAD } from '../src/client/art/storybook-worn';

test('every icon and glyph grid is valid palette art', () => {
    const grids = iconGrids();
    for (const [key, rows] of Object.entries(grids)) checkGrid(key, rows);
    for (const [key, rows] of Object.entries(FACTORY_GRIDS)) checkGrid(key, rows);
});

test('every monster and every creature species has painted art', () => {
    for (const k of Object.keys(MOBS)) assert.ok(MOB_TEXTURES.includes(MOBS[k as MobKind].tex), `no art for ${k}`);
    for (const id of SPECIES_LIST) assert.ok(PAINTED_SPECIES.includes(id), `no art for species ${id}`);
});

test('every item has an icon, and every skill glyph exists', () => {
    const grids = iconGrids();
    for (const id of Object.keys(ITEMS)) assert.ok(grids[`i_${id}`], `no icon for item ${id}`);
    for (const s of SKILL_LIST) assert.ok(grids[s.icon], `skill ${s.id} uses missing icon ${s.icon}`);
    for (const b of BOONS) assert.ok(grids[b.icon], `boon ${b.id} uses missing icon ${b.icon}`);
});

test('tile frames line up: ground variants, rift tiles, then one shore frame per side combination', () => {
    assert.equal(tileGround(BIOMES[0], 0), 8);
    assert.equal(tileGround(BIOMES[BIOMES.length - 1], GROUND_VARIANTS - 1), TILE_RIFT_CLIFF - 1);
    assert.equal(TILE_SHORE, TILE_RIFT_CLIFF + 4, 'rift cliff + three rift floors come first');
    assert.equal(tileShore(SHORE_FRAMES - 1), TILE_SHORE + SHORE_FRAMES - 1);
    // east, west, south and the two south corners are five bits
    assert.equal(SHORE_FRAMES, 32);
});

test('every hat, armor and charm has a painted outfit layer for the farmer sprite', () => {
    const worn: Record<string, string[]> = { head: WORN_HEAD, body: WORN_BODY, charm: WORN_CHARM, bag: WORN_BAG };
    for (const [id, d] of Object.entries(ITEMS)) {
        const slot = d.gear?.slot;
        if (slot && worn[slot]) assert.ok(worn[slot].includes(id), `no outfit layer for ${slot} item ${id}`);
    }
    for (const [slot, list] of Object.entries(worn)) for (const id of list) assert.equal(ITEMS[id as keyof typeof ITEMS]?.gear?.slot, slot, `${id} is not a ${slot} item`);
    for (const id of WORN_BACK) assert.ok(WORN_BODY.includes(id), 'a cloak layer goes with a body item');
});

test('every tower perk has an icon', () => {
    const grids = iconGrids();
    for (const p of PERKS) assert.ok(grids[p.icon], `${p.id}: icon ${p.icon}`);
});

test('every season wish has an icon', () => {
    const grids = iconGrids();
    for (const w of WISHES) assert.ok(grids[w.icon], `${w.id}: icon ${w.icon}`);
});

test('every picture the weather vane uses is drawn (shared/data/forecast.ts names them, client/art/icons.ts paints them)', () => {
    const grids = iconGrids();
    const keys = new Set<string>();
    for (const seed of ['vane-1', 'vane-2', 'W-17']) for (const d of forecast(seed, 1, 120)) { keys.add(dayIcon(d)); keys.add(nightIcon(d)); keys.add(vaneIcon(d)); }
    for (const k of ['k_sun', 'k_rain', 'k_storm', 'k_fog', 'k_moon', 'k_blood', 'k_meteor', 'k_fairy']) assert.ok(keys.has(k) && grids[k], `${k} is used and drawn`);
    for (const k of keys) assert.ok(grids[k], `${k} exists`);
    assert.equal(BUILDINGS.chute.tex, 'chute');
    assert.equal(BUILDINGS.weathervane.tex, 'weathervane');
});

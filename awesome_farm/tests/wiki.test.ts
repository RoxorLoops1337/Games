// The player wiki (wiki/index.html, served at /awesome_farm/wiki/) is generated from the game's data by scripts/wiki.ts.
// It must be what the generator makes now (a stale page fails: run `npm run wiki` and commit it), every item, building,
// skill node, creature and monster must have an entry to link to, and the page never shows an em dash.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { BUILDINGS } from '../src/shared/data/buildings';
import { SPECIES_LIST } from '../src/shared/data/creatures';
import { ITEM_ORDER } from '../src/shared/data/items';
import { MOB_KINDS } from '../src/shared/data/mobs';
import { SKILL_LIST } from '../src/shared/data/skills';
import { buildWiki } from '../scripts/wiki';

const html = buildWiki();
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

test('the committed wiki is what the generator makes now (run `npm run wiki` and commit wiki/index.html)', () => {
    const committed = readFileSync(join(__dirname, '..', 'wiki', 'index.html'), 'utf8');
    assert.ok(committed === html, 'wiki/index.html is stale: run `npm run wiki` in awesome_farm and commit it');
});

test('the generator is deterministic', () => {
    assert.equal(buildWiki(), html);
});

test('every item, building, skill node, creature and monster has an anchor', () => {
    for (const id of ITEM_ORDER) assert.ok(ids.has(`item-${id}`), `item ${id}`);
    for (const k of Object.keys(BUILDINGS)) assert.ok(ids.has(`bld-${k}`), `building ${k}`);
    for (const s of SKILL_LIST) assert.ok(ids.has(`skill-${s.id}`), `skill ${s.id}`);
    for (const s of SPECIES_LIST) assert.ok(ids.has(`sp-${s}`), `species ${s}`);
    for (const m of MOB_KINDS) assert.ok(ids.has(`mob-${m}`), `monster ${m}`);
});

test('every link on the page goes somewhere', () => {
    const broken = [...new Set([...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]))].filter((id) => !ids.has(id));
    assert.deepEqual(broken, []);
});

test('ids are unique', () => {
    const all = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(all.length, new Set(all).size, `duplicated: ${all.filter((x, i) => all.indexOf(x) !== i).join(', ')}`);
});

test('the page has no em dash and loads nothing from outside', () => {
    assert.ok(!html.includes('—'), 'an em dash');
    assert.ok(!/<script[^>]+src=/.test(html), 'an external script');
    assert.ok(!/(href|src)="https?:/.test(html), 'an external resource');
});

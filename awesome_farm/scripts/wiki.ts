// The player wiki: ONE self-contained page (wiki/index.html, served at /awesome_farm/wiki/) that explains everything in the game
// and how each thing is unlocked. It is generated from the game's own tables, so it cannot drift: every number, name, cost,
// requirement and list below is read from src/shared; only the explanations come from scripts/wiki-text.ts.
//
//   npm run wiki          writes wiki/index.html
//   tests/wiki.test.ts    fails when the committed page is not what buildWiki() makes now (run `npm run wiki` and commit)

import { PERKS, RARITIES, RARITY_NAME, xpAt, xpStep, type Rarity } from '../src/shared/data/towerperks';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CENTER, DREAD_ZONES, GRID, MAX_PLAYERS, PLOT, RIFT_ISLANDS, TUNING } from '../src/shared/config';
import { CAVE_ORE_BANDS, CAVE_ORES, CHAMBERS } from '../src/shared/cave';
import { BIOME_DEFS, BIOMES, MODS, type Biome } from '../src/shared/data/biomes';
import { AFFECTION_LEVELS, GIFT_AT, giftOdds, GIFTS, PATS_PER_DAY } from '../src/shared/data/bond';
import { BUILD_CATS, BUILD_ORDER, BUILDINGS, CROPS, ORDER_STATIONS, SEED_IDS, STATION_NAMES, type BuildingKind, type ProcId, type StationId } from '../src/shared/data/buildings';
import { KEY_LAYOUTS, keyControls, TOUCH_CONTROLS, type ControlGroup } from '../src/shared/data/controls';
import { CO_INFO } from '../src/shared/data/costatus';
import {
    AREA_INFO, AREA_JOBS, AWAKENINGS, BREED_SECS, BREED_TREATS, catchChance, ELEMENT_COLOR, ELEMENT_NAME, FIELD_INFO, FIELD_TASKS, PET_MAX_LEVEL, petXpNeed, POD_POWER,
    RARITY_NAMES as CRIT_RARITY, SPECIES, SPECIES_LIST, STAR_POWER, STAR_WORK, STATUS_INFO, TRAIT_IDS, TRAITS, WORK_INFO, WORK_KINDS, type SpeciesId, type WorkKind,
} from '../src/shared/data/creatures';
import { cropFacts, fmtSecs } from '../src/shared/data/cropfacts';
import { CAST_RANGE, FISH, MAX_STRIKES, RODS, TUG_WINDOW } from '../src/shared/data/fish';
import { GUIDE, guideText } from '../src/shared/data/guide';
import { HEARTH_SPOTS } from '../src/shared/data/hearth';
import { FACTORY_VIEW_KEY, HOWTO } from '../src/shared/data/howto';
import { FUEL, ITEM_ORDER, ITEMS, RARITY_NAMES, SLOT_NAMES, STARTER_GEAR, type Cost, type GearSlot, type ItemId, type Res } from '../src/shared/data/items';
import { STARTER_LAYOUTS } from '../src/shared/data/layouts';
import {
    BOSS_CRATE, CRATE_ITEM, CRATE_PITY, CRATE_TIERS, CRATES, GAMBLE_MAX_CHAIN, GAMBLE_MAX_COINS, GAMBLE_ODDS, JACKPOT_COIN_MUL, LOOT_POOL, LUCK, MOB_CRATE, TITAN_CRATE,
    WHEEL, WHEEL_FREE_STAKE, WHEEL_JACKPOT_PITY, wheelPrice, type CrateTier,
} from '../src/shared/data/loot';
import { BOSS_ORDER, BOSSES, eliteChance, MOB_KINDS, MOBS, nightCount, pickCave, pickHaunt, pickWild, softHit, tierCap, WILD_KINDS, type BossPhase, type MobKind } from '../src/shared/data/mobs';
import { NODES, TITAN, type NodeKind } from '../src/shared/data/nodes';
import { POSTCARD_SEEDS } from '../src/shared/data/postcards';
import { BOUNTY_POOL, CHAPTERS, GOALS, MEDALS, type Reward } from '../src/shared/data/quests';
import { RECIPE_LIST, type Recipe } from '../src/shared/data/recipes';
import { BOON_RARITY, BOONS, DAILY_BONUS, dailyShards, isBossWave, OMEN_MAX, OMENS, RIFT_PARTY_MAX, RIFT_PICK_SECONDS, RIFT_TIERS, riftReward, waveSpec } from '../src/shared/data/rift';
import { GIVERS, QUEST_BY_ID, QUESTS } from '../src/shared/data/sidequests';
import { BRANCH_ORDER, BRANCHES, SKILL_LIST, SKILL_POINT_TOTAL, SKILLS, UNLOCK_INFO, type SkillNode } from '../src/shared/data/skills';
import { BUFFS, modLine, STAT_INFO, STAT_KEYS, type BuffId, type Mods, type StatKey } from '../src/shared/data/stats';
import { TIPS } from '../src/shared/data/tips';
import { STEPS, type TutorialView } from '../src/shared/data/tutorial';
import { WISH_OPTIONS, WISHES } from '../src/shared/data/wishes';
import { PAL } from '../src/shared/palette';
import { Rng } from '../src/shared/rng';
import { SEASON_DAYS, SEASON_ORDER, SEASONS } from '../src/shared/season';
import { TUNNEL_RANGE, DRILL_BASE, SWING } from '../src/shared/sim/factory';
import { riftCrate } from '../src/shared/sim/fortune';
import { MAIL_CAP, NOTE_MAX, PARCEL_STACKS, PER_SENDER, POSTCARDS_KEPT } from '../src/shared/sim/mail';
import { workSlots } from '../src/shared/sim/petlib';
import { SUPPLY, WIRE_RANGE, wind } from '../src/shared/sim/power';
import { TRADER_POOL } from '../src/shared/sim/shop';
import { MAX_LEVEL, newPlayer, xpToNext } from '../src/shared/sim/stats';
import type { Plot } from '../src/shared/sim/types';
import { NIGHT_EVENTS, SCHOLAR_DAY } from '../src/shared/weather';
import { World } from '../src/shared/world';
import {
    AI_WORDS, BUFF_SOURCES, INTRO, NIGHT_WORDS, PATTERN_WORDS, PROSE, SITE, WEAPON_WORDS,
} from './wiki-text';

// ── small helpers ───────────────────────────────────────────────────────────
const EM = /\s*—\s*/g;
/** The page never shows an em dash: the game's own lines that carry one read as a comma here. */
const clean = (s: string) => s.replace(EM, ', ');
const esc = (s: unknown) => clean(String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
/** A number without needless decimals. */
const num = (n: number, d = 2) => { const p = 10 ** d; const r = Math.round(n * p) / p; return Object.is(r, -0) ? '0' : String(r); };
const pct = (x: number, d = 1) => `${num(x * 100, d)}%`;
const secs = (s: number) => (s < 90 ? `${num(s, 1)} s` : `${Math.floor(s / 60)} min${Math.round(s % 60) ? ` ${Math.round(s % 60)} s` : ''}`);
const range = (a: number, b: number) => (a === b ? `${a}` : `${a}-${b}`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const list = (xs: string[], empty = '') => (xs.length ? xs.join(', ') : empty);
const ul = (xs: string[]) => (xs.length ? `<ul>${xs.map((x) => `<li>${x}</li>`).join('')}</ul>` : '');
const p = (s: string) => `<p>${s}</p>`;
const intro = (k: string) => (INTRO[k] ?? []).map((s) => p(esc(s))).join('');
const kv = (rows: [string, string][]) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
const fill = (s: string) => s.replace(/\{fish\}/g, 'Q');
const DAY = TUNING.dayLength + TUNING.nightLength;

// anchors
const A = {
    item: (id: string) => `item-${id}`, bld: (k: string) => `bld-${k}`, skill: (id: string) => `skill-${id}`, sp: (id: string) => `sp-${id}`,
    mob: (k: string) => `mob-${k}`, unlock: (t: string) => `unlock-${t}`, station: (s: string) => `station-${s}`, node: (k: string) => `node-${k}`,
    biome: (b: string) => `biome-${b}`, buff: (b: string) => `buff-${b}`, stat: (k: string) => `stat-${k}`, rift: (i: number) => `rift-${i}`,
    boon: (b: string) => `boon-${b}`, chapter: (c: string) => `chapter-${c}`, quest: (q: string) => `quest-${q}`, giver: (g: string) => `giver-${g}`,
    branch: (b: string) => `branch-${b}`, layout: (l: string) => `layout-${l}`, guide: (g: string) => `guide-${g}`, crate: (c: string) => `crate-${c}`,
};
const link = (id: string, text: string, cls = '') => `<a href="#${id}"${cls ? ` class="${cls}"` : ''}>${text}</a>`;

const KIND_COLOR: Record<string, number> = { material: PAL.wood, food: PAL.berry, seed: PAL.leaf, potion: PAL.plum, gear: PAL.stone, misc: PAL.gold };
const RARITY_COLOR = [PAL.pebble, PAL.leaf, PAL.sea, PAL.plum, PAL.gold];
const KIND_NAME: Record<string, string> = { material: 'Material', food: 'Food', seed: 'Seed', potion: 'Potion', gear: 'Gear', misc: 'Other' };
const swatch = (id: ItemId) => `<i class="sw" style="--c:${hex(KIND_COLOR[ITEMS[id].kind])};--r:${hex(RARITY_COLOR[ITEMS[id].rarity])}"></i>`;
/** An item's name as a link, with its little swatch, and a count before it. */
const il = (id: ItemId, n?: number) => `${n !== undefined ? `<b>${num(n)}</b> ` : ''}<a class="il" href="#${A.item(id)}">${swatch(id)}${esc(ITEMS[id].name)}</a>`;
const res = (r: Res, n?: number) => (r === 'coin' ? `<span class="coin">${n !== undefined ? `${num(n)} ` : ''}coins</span>` : il(r, n));
const cost = (c: Cost) => list((Object.entries(c) as [Res, number][]).map(([r, n]) => res(r, n)), 'nothing');
const bl = (k: BuildingKind) => link(A.bld(k), esc(BUILDINGS[k].name));
const sl = (id: string) => link(A.skill(id), esc(SKILLS[id].name));
const ml = (k: MobKind) => link(A.mob(k), esc(MOBS[k].name));
const spl = (id: string) => link(A.sp(id), esc(SPECIES[id as SpeciesId].name));
const nl = (k: NodeKind) => link(A.node(k), esc(NODES[k].name));
/** "a Tree", "an Iron vein". */
const an = (name: string, html: string) => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${html}`;
const biomeL = (b: Biome) => link(A.biome(b), esc(BIOME_DEFS[b].name));
const buffL = (b: BuffId) => link(A.buff(b), esc(BUFFS[b].name));
const stationName = (s: StationId | ProcId) => STATION_NAMES[s];
const stationL = (s: StationId | ProcId) => link(A.station(s), esc(stationName(s)));
const modsHtml = (m: Mods | undefined, mul = 1) => (m ? (Object.entries(m) as [StatKey, number][]).map(([k, v]) => `<span class="mod">${esc(modLine(k, v * mul))}</span>`).join(' ') : '');
const rarityTag = (r: number, names: readonly string[] = RARITY_NAMES, colors = RARITY_COLOR) => `<span class="tag" style="--t:${hex(colors[r])}">${esc(names[r])}</span>`;
const tag = (s: string, c: number = PAL.stone) => `<span class="tag" style="--t:${hex(c)}">${esc(s)}</span>`;

/** A table; every body row is a search entry. */
function table (head: string[], rows: string[][], o: { cls?: string; ids?: (string | undefined)[] } = {}) {
    const tr = rows.map((r, i) => `<tr class="f"${o.ids?.[i] ? ` id="${o.ids[i]}"` : ''}>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
    return `<div class="tw${o.cls ? ` ${o.cls}` : ''}"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${tr}</tbody></table></div>`;
}
/** A card: one searchable entry with an anchor. */
const card = (id: string, title: string, meta: string, body: string, cls = '') =>
    `<article class="card f${cls ? ` ${cls}` : ''}" id="${id}"><header><h4>${title}</h4>${meta ? `<div class="meta">${meta}</div>` : ''}</header>${body}</article>`;
const cards = (xs: string[]) => `<div class="cards">${xs.join('')}</div>`;

// the table of contents and the sections
interface TocEntry { id: string; title: string; subs: { id: string; title: string }[] }
let toc: TocEntry[] = [];
function section (id: string, title: string, body: string) {
    const subs: { id: string; title: string }[] = [];
    for (const m of body.matchAll(/<details class="sub" id="([^"]+)"[^>]*><summary><h3>(.*?)<\/h3>/g)) subs.push({ id: m[1], title: m[2] });
    toc.push({ id, title, subs });
    return `<details class="sec" id="${id}" open><summary><h2>${esc(title)}</h2></summary><div class="sb">${body}</div></details>`;
}
const sub = (id: string, title: string, body: string, open = true) =>
    `<details class="sub" id="${id}"${open ? ' open' : ''}><summary><h3>${esc(title)}</h3></summary><div class="sb">${body}</div></details>`;

// ── indexes built once ──────────────────────────────────────────────────────
const RECIPES_BY_STATION = new Map<string, Recipe[]>();
for (const r of RECIPE_LIST) { const l = RECIPES_BY_STATION.get(r.station) ?? []; l.push(r); RECIPES_BY_STATION.set(r.station, l); }
const stationBuilding = (s: StationId | ProcId): BuildingKind | undefined => (Object.keys(BUILDINGS) as BuildingKind[]).find((k) => BUILDINGS[k].station === s || BUILDINGS[k].proc === s);

/** The skill that grants a token, the cheapest path to it from the hub and its total cost in points. */
const best = new Map<string, { cost: number; via: string | null }>();
for (let changed = true; changed;) {
    changed = false;
    for (const n of SKILL_LIST) {
        let pick: { cost: number; via: string | null } | null = null;
        for (const r of n.req) {
            const c = r === 'hub' ? 0 : best.get(r)?.cost;
            if (c === undefined) continue;
            if (!pick || c < pick.cost) pick = { cost: c, via: r === 'hub' ? null : r };
        }
        if (!pick) continue;
        const total = pick.cost + n.cost, cur = best.get(n.id);
        if (!cur || total < cur.cost) { best.set(n.id, { cost: total, via: pick.via }); changed = true; }
    }
}
function pathTo (id: string): SkillNode[] {
    const out: SkillNode[] = [];
    for (let at: string | null = id; at; at = best.get(at)?.via ?? null) out.unshift(SKILLS[at]);
    return out;
}
const tokenSkill = (t: string) => SKILL_LIST.find((s) => s.unlock?.includes(t));
/** "Learn Blacksmithing (Industry)": what a locked thing needs, linked. */
function needs (t: string | undefined): string {
    if (!t) return '';
    const s = tokenSkill(t);
    return s ? `learn ${sl(s.id)} <span class="dim">(${esc(BRANCHES[s.branch].name)})</span>` : esc(UNLOCK_INFO[t] ?? t);
}
const ALL_TOKENS = [...new Set([...Object.keys(UNLOCK_INFO), ...SKILL_LIST.flatMap((s) => s.unlock ?? []), ...RECIPE_LIST.flatMap((r) => (r.req ? [r.req] : [])),
    ...(Object.values(BUILDINGS).flatMap((b) => (b.req ? [b.req] : [])))])];

/** Where every item comes from, and what it is used for (HTML lines). */
const SRC = new Map<ItemId, string[]>(), USE = new Map<ItemId, string[]>();
const addTo = (m: Map<ItemId, string[]>, id: Res, line: string) => { if (id === 'coin') return; const l = m.get(id) ?? []; if (!l.includes(line)) l.push(line); m.set(id, l); };
const src = (id: Res, line: string) => addTo(SRC, id, line);
const use = (id: Res, line: string) => addTo(USE, id, line);
const chanceWords = (c = 1, lo: number, hi: number) => `${range(lo, hi)}${c < 1 ? `, ${pct(c)} chance` : ''}`;
const rewardItems = (r: Reward) => r.items ?? [];

function buildIndexes () {
    for (const [slot, id] of Object.entries(STARTER_GEAR)) if (id) src(id, `Every farmer starts with one (${esc(SLOT_NAMES[slot as GearSlot])}).`);
    const where = (k: NodeKind) => BIOMES.filter((b) => (BIOME_DEFS[b].nodes[k] ?? 0) > 0);
    for (const k of Object.keys(NODES) as NodeKind[]) {
        for (const [r, lo, hi, c] of NODES[k].drops) src(r, `Breaking ${an(NODES[k].name, nl(k))} (${chanceWords(c, lo, hi)})${where(k).length ? ` <span class="dim">in ${list(where(k).map(biomeL))}</span>` : ''}.`);
    }
    for (const ore of CAVE_ORES) src(ore, `Digging ore veins in ${link('s-caves', 'the caves')}.`);
    src('stone', `Digging rock in ${link('s-caves', 'the caves')}.`);
    for (const k of MOB_KINDS) {
        const d = MOBS[k];
        for (const [r, c, lo = 1, hi = lo] of d.drops) src(r, `Dropped by ${ml(k)} (${chanceWords(c, lo, hi)}).`);
        if (d.boss) {
            src(d.boss.trophy, `Defeating ${ml(k)} (always the first time, sometimes after).`);
            d.boss.gear.forEach((g, i) => src(g, `One of ${ml(k)}'s spoils${i === 0 ? ' (the first defeat always gives this one)' : ''}.`));
            use(d.boss.sigil, `Use it at a ${bl('altar')} to summon ${ml(k)}${d.boss.heartOnly ? ' (only on the centre plot)' : ''}.`);
        }
    }
    for (const r of RECIPE_LIST) {
        src(r.out, `Made at the ${stationL(r.station)}: ${r.n > 1 ? `${r.n} from ` : 'from '}${cost(r.in)}${r.time ? ` in ${num(r.time)} s` : ''}${r.req ? ` (${needs(r.req)})` : ''}.`);
        for (const i of Object.keys(r.in) as Res[]) use(i, `${il(r.out)} at the ${stationL(r.station)}.`);
    }
    for (const k of Object.keys(BUILDINGS) as BuildingKind[]) for (const i of Object.keys(BUILDINGS[k].cost) as Res[]) use(i, `Building ${an(BUILDINGS[k].name, bl(k))}.`);
    for (const [rar, rows] of Object.entries(LOOT_POOL)) {
        const crates = CRATE_TIERS.filter((t) => CRATES[t].cls[Number(rar)] > 0).map((t) => link(A.crate(t), esc(CRATES[t].name)));
        for (const row of rows) src(row.item, `Loot crates, ${esc(RARITY_NAMES[Number(rar)])} class (${range(row.min, row.max)} before the crate's bonus): ${list(crates)}.`);
    }
    for (const t of CRATE_TIERS) if (CRATES[t].shard) src('lantern_shard', `A ${link(A.crate(t), esc(CRATES[t].name))} has a ${pct(CRATES[t].shard!)} chance of one on top.`);
    src('lantern_shard', `Buried treasure (${pct(LUCK.shardDig)} chance), golden nodes now and then, and the wheel's jackpot.`);
    MOB_CRATE.forEach(([ct, c], tier) => src(CRATE_ITEM[ct], `Monsters of tier ${tier}${tier > 0 ? ' (or an elite one tier lower)' : ''}: ${pct(c)} chance, doubled for elites.`));
    src(CRATE_ITEM[BOSS_CRATE.guaranteed], 'Every boss leaves one for each farmer who helped.');
    src(CRATE_ITEM[BOSS_CRATE.bonus], `Bosses: a ${pct(BOSS_CRATE.bonusChance)} chance of one more (the Old Heart always gives one).`);
    for (const [ct, c] of TITAN_CRATE) src(CRATE_ITEM[ct], `Felling a Titan node with friends (${pct(c)} base chance per helper).`);
    src(CRATE_ITEM.wood, 'Lucky Finds and golden nodes now and then, and buried treasure.');
    src(CRATE_ITEM.silver, 'Lucky Finds and golden nodes now and then, and buried treasure.');
    RIFT_TIERS.forEach((t) => {
        for (const [it, c, lo, hi] of t.loot) src(it, `Clearing the ${link(A.rift(t.id), esc(t.name))} (${chanceWords(c, lo, hi)}).`);
        if (!t.endless) src(riftCrate(t.id)[0], `Clearing the ${link(A.rift(t.id), esc(t.name))}.`);
    });
    src('rift_shard', `Expeditions: every clear pays shards, and the Abyss pays them by depth.`);
    src('rift_core', 'Deep dives in the Abyss (now and then, every fifth wave).');
    src('crystal', 'Deep dives in the Abyss (now and then, every fifth wave).');
    for (const f of FISH) src(f.id, `${link('s-fishing', 'Fishing')}: ${esc(f.hint)}`);
    src('junk_boot', `${link('s-fishing', 'Fishing')} (junk).`);
    src('pearl', `${link('s-fishing', 'Fishing')} (rare, more with luck).`);
    src('fiber', `${link('s-fishing', 'Fishing')} (weeds).`);
    src('bottle', `${link('s-fishing', 'Fishing')}: a ${pct(LUCK.bottle)} chance per catch that a bottle came up too.`);
    for (const t of TRADER_POOL) src(t.item, `The ${link('s-trader', 'travelling trader')} (from day ${t.minDay}, ${range(t.n[0], t.n[1])} at a time).`);
    for (const c of CHAPTERS) for (const [it, n] of rewardItems(c.reward)) src(it, `Story reward: ${link(A.chapter(c.id), esc(c.title))} (${n}).`);
    for (const q of QUESTS) for (const [it, n] of rewardItems(q.reward)) src(it, `Side quest reward: ${link(A.quest(q.id), esc(q.title))} (${n}).`);
    for (const [lv, rows] of Object.entries(GIFTS)) for (const g of rows) src(g.item, `A gift your companion digs up (${['small', 'nice', 'rare'][Number(lv)]} find, ${range(g.min, g.max)}).`);
    for (const w of WHEEL) {
        for (const [it, n] of w.items ?? []) src(it, `The ${bl('fortune')}'s ${esc(w.label)} wedge (${n}).`);
        if (w.crate) src(CRATE_ITEM[w.crate], `The ${bl('fortune')}'s ${esc(w.label)} wedge.`);
    }
    for (const s of POSTCARD_SEEDS) src(s, `${link('s-multiplayer', 'Postcards')} from the island folk, now and then.`);
    for (const [i, s] of Object.entries(FUEL)) use(i as ItemId, `Fuel: burns for ${s} s in a furnace or generator.`);
    for (const a of AWAKENINGS) for (const [i, n] of Object.entries(a.cost)) use(i as ItemId, `Awakening a creature to star ${AWAKENINGS.indexOf(a) + 1} (${n}).`);
    for (const b of BOUNTY_POOL) if (b.item) use(b.item, `Daily bounty: deliver ${range(b.n[0], b.n[1])} or more (it grows with your level)${b.minLevel ? `, from level ${b.minLevel}` : ''}.`);
    for (const g of GOALS) use(g.item, `Production goal: ${num(g.n)} made by the farm's machines.`);
    for (const q of QUESTS) for (const s of q.steps) if (s.key.startsWith('have:')) use(s.key.slice(5) as ItemId, `Side quest ${link(A.quest(q.id), esc(q.title))}: hold ${s.n}.`);
    for (const [pod, pw] of Object.entries(POD_POWER)) use(pod as ItemId, `Throw it at a wild creature (T) to befriend it: catch power x${pw}.`);
    use('treat', `Breeding: ${BREED_TREATS} per egg at a ${bl('hatchery')}.`);
    use('bait', 'Used up automatically when you cast: bites come sooner and rare fish get likelier.');
    for (const r of RODS) use(r.item, `A tier ${r.tier} fishing rod: hold it and press Q at the water.`);
    for (const s of SEED_IDS) use(s, `Plant it in a ${bl('bed')} to grow ${il(CROPS[s]!.out)}.`);
}

// ── sections ────────────────────────────────────────────────────────────────
function startHere () {
    const me = newPlayer('wiki', 'Farmer', 0, 0, 0);
    for (const id of ITEM_ORDER) me.inv[id] = 999;
    me.energy = TUNING.maxEnergy / 2;
    me.points = 1;
    const view = (night: boolean): TutorialView => ({
        me, base: {}, clock: { clock: 0, night }, ui: { walked: 0, opened: [], placing: null },
        near: { bld: {}, beds: { empty: 0, growing: 0, ripe: 0 }, stock: {} }, price: null,
    });
    const say = (s: string | [string, string], touch: boolean) => (typeof s === 'string' ? s : s[touch ? 1 : 0]);
    const words = (s: string, touch: boolean) => s.replace(/\{(\w+)\}/g, (m, k: string) => {
        const W: Record<string, string> = touch
            ? { move: 'the stick', act: 'ACT', use: 'USE', eat: 'EAT', bag: 'BAG', build: 'BUILD', skills: 'MENU', tap: 'tap', press: 'tap', Press: 'Tap' }
            : { move: 'WASD', act: 'Space', use: 'E', eat: 'F', bag: 'I', build: 'B', skills: 'K', tap: 'click', press: 'press', Press: 'Press' };
        return W[k] ?? m;
    });
    const steps = STEPS.map((s, i) => {
        const t = s.text(view(s.id === 'night'));
        const desk = words(say(t, false), false), phone = words(say(t, true), true);
        return `<li class="f"><b>${i + 1}. ${esc(s.title)}</b><br>${esc(desk)}${phone !== desk ? `<br><span class="dim">On a phone: ${esc(phone)}</span>` : ''}</li>`;
    });
    const first = GUIDE[0];
    const g = (s: Parameters<typeof guideText>[0]) => esc(guideText(s, false, { move: 'WASD', fish: 'Q' }));
    return section('s-start', 'Start here', intro('start')
        + sub('s-tutorial', `The first ten minutes (${STEPS.length} tutorial steps)`, `<ol class="steps">${steps.join('')}</ol>`)
        + sub('s-loop', 'The loop of the whole game', `<ol class="steps">${first.steps.map((s) => `<li class="f">${g(s)}</li>`).join('')}</ol>${ul(first.tips.map(g))}`)
        + sub('s-firsthour', 'Your first hour, chapter by chapter', p(`The Journal's story picks up where the tutorial ends. The first chapters, in order (the full list is in ${link('s-quests', 'Quests')}):`)
            + `<ol class="steps">${CHAPTERS.slice(0, 5).map((c) => `<li class="f"><b>${link(A.chapter(c.id), esc(c.title))}</b>: ${esc(list(c.objectives.map((o) => fill(o.text))))}.</li>`).join('')}</ol>`)
        + controls());
}

function controls () {
    const grp = (gs: ControlGroup[]) => gs.map((gr) => `<h4>${esc(gr.title)}</h4>${table(['Key', 'What it does'], gr.rows.map(([k, d]) => [`<kbd>${esc(k)}</kbd>`, esc(d)]))}`).join('');
    const q = KEY_LAYOUTS.qwerty, az = KEY_LAYOUTS.azerty;
    const moveQ = [q.KeyW, q.KeyA, q.KeyS, q.KeyD].join(' '), moveA = [az.KeyW, az.KeyA, az.KeyS, az.KeyD].join(' ');
    return sub('s-controls', 'Controls', intro('controls')
        + p(`On QWERTY you walk with <kbd>${moveQ}</kbd> and fish with <kbd>${q.KeyQ}</kbd>; on AZERTY the same keys are <kbd>${moveA}</kbd> and <kbd>${az.KeyQ}</kbd>. The game picks your layout by itself (Settings lets you choose).`)
        + `<div class="two"><div><h4 class="lbl">Keyboard</h4>${grp(keyControls(moveQ, q.KeyQ))}</div><div><h4 class="lbl">Phone</h4>${grp(TOUCH_CONTROLS)}</div></div>`);
}

function progression () {
    let cum = 0;
    const rows: string[][] = [];
    for (let l = 1; l <= MAX_LEVEL; l++) {
        const need = l < MAX_LEVEL ? xpToNext(l) : 0;
        rows.push([`${l}`, l < MAX_LEVEL ? num(need) : 'max', num(cum)]);
        cum += need;
    }
    const nodeRows = (Object.keys(NODES) as NodeKind[]).map((k) => [nl(k), num(NODES[k].xp)]);
    const mobRows = WILD_KINDS.map((k) => [ml(k), `${MOBS[k].tier}`, num(MOBS[k].xp)]);
    const bossRows = BOSS_ORDER.map((b) => BOSSES[b].kind).map((k) => [ml(k), num(MOBS[k].xp), num(MOBS[k].boss!.points)]);
    const cropRows = SEED_IDS.map((s) => [il(CROPS[s]!.out), num(CROPS[s]!.xp)]);
    const riftRows = RIFT_TIERS.filter((t) => !t.endless).map((t) => [link(A.rift(t.id), esc(t.name)), num(t.xp), num(t.points)]);
    const questXp = QUESTS.filter((q) => q.reward.xp).map((q) => [link(A.quest(q.id), esc(q.title)), esc(GIVERS[q.giver].name), num(q.reward.xp!)]);
    const xpItems = ITEM_ORDER.filter((i) => ITEMS[i].xpPct);

    // every XP boost in the game, read from the stat ledger's sources
    const boost: string[][] = [];
    const xpMods = (m?: Mods) => (m ? (['xp', 'crewXp'] as StatKey[]).filter((k) => m[k]).map((k) => esc(modLine(k, m[k]!))) : []);
    for (const s of SKILL_LIST) { const l = xpMods(s.mods); if (l.length) boost.push([`Skill ${sl(s.id)} <span class="dim">(${esc(BRANCHES[s.branch].name)})</span>`, `${l.join(', ')} per rank, ${s.max} rank${s.max > 1 ? 's' : ''}`]); }
    for (const b of Object.keys(BUFFS) as BuffId[]) {
        if (b.startsWith('dev')) continue;
        const l = xpMods(BUFFS[b].mods); if (!l.length) continue;
        const items = ITEM_ORDER.filter((i) => ITEMS[i].buff?.id === b);
        boost.push([`Buff ${buffL(b)}`, `${l.join(', ')}: ${list([...items.map((i) => `${il(i)} (${secs(ITEMS[i].buff!.secs)})`), ...(BUFF_SOURCES[b] ? [esc(BUFF_SOURCES[b])] : [])])}`]);
    }
    for (const w of WISHES) { const l = xpMods(w.mods); if (l.length) boost.push([`Season wish ${link('s-wishes', esc(w.name))}`, `${l.join(', ')} for the whole season`]); }
    for (const b of BOONS) { const l = xpMods(b.mods); if (l.length) boost.push([`Expedition boon ${link(A.boon(b.id), esc(b.name))}`, `${l.join(', ')} for the run`]); }
    for (const i of xpItems) boost.push([il(i), `${pct(ITEMS[i].xpPct!, 0)} of what your current level needs, at once (XP boosts count too)`]);
    boost.push([link('s-creaturexp', 'Creatures teach their keeper'), `${pct(TUNING.crewXpShare, 0)} of the XP your creatures earn at work comes to you too, plus every "XP from working creatures" bonus above`]);

    const creatureBoost: string[][] = [];
    for (const s of SKILL_LIST) if (s.mods?.creatureXp) creatureBoost.push([`Skill ${sl(s.id)}`, `${esc(modLine('creatureXp', s.mods.creatureXp))} per rank, ${s.max} rank${s.max > 1 ? 's' : ''}`]);
    for (const b of Object.keys(BUFFS) as BuffId[]) if (BUFFS[b].mods.creatureXp && !b.startsWith('dev')) creatureBoost.push([`Buff ${buffL(b)}`, esc(modLine('creatureXp', BUFFS[b].mods.creatureXp!))]);
    for (const w of WISHES) if (w.mods.creatureXp) creatureBoost.push([`Season wish ${link('s-wishes', esc(w.name))}`, esc(modLine('creatureXp', w.mods.creatureXp))]);
    for (const t of TRAIT_IDS) if (TRAITS[t].xp) creatureBoost.push([`Trait ${link('s-traits', esc(TRAITS[t].name))}`, esc(TRAITS[t].desc)]);

    return section('s-progress', 'Progression', intro('progress')
        + p(`The level cap is ${MAX_LEVEL}. All ${SKILL_LIST.length} skill nodes at every rank cost ${SKILL_POINT_TOTAL} points in all, so choose: you will not have them all from levels alone.`)
        + sub('s-levels', 'The level curve', table(['Level', 'XP to the next level', 'Total XP to reach it'], rows, { cls: 'tall' }), false)
        + sub('s-xpsources', 'Where XP comes from', intro('xpsources')
            + `<div class="two"><div><h4>Breaking resource nodes</h4>${table(['Node', 'XP'], nodeRows)}</div><div><h4>Monsters</h4>${table(['Monster', 'Tier', 'XP'], mobRows)}`
            + p('Elites give more, and a Blood Moon gives more for every kill.') + `<h4>Bosses</h4>${table(['Boss', 'XP', 'Skill points'], bossRows)}</div></div>`
            + `<div class="two"><div><h4>Harvesting crops</h4>${table(['Crop', 'XP'], cropRows)}</div><div><h4>Expeditions (a full clear)</h4>${table(['Rift', 'XP', 'Points (first clear)'], riftRows)}`
            + p('Every wave you clear pays XP too, more on higher tiers and later waves.') + '</div></div>'
            + `<h4>Everything else</h4>${ul([
                `Crafting: every recipe lists its XP in ${link('s-crafting', 'Crafting')}. Machines pay their recipe's XP to whoever owns them while they are online.`,
                'Building anything: a few XP, more for buildings that take more kinds of material.',
                'Buying land, planting seeds, fishing (more for rare and big fish, and pearls), befriending and hatching creatures (more for rarer ones), digging in the caves.',
                `Bounties pay XP worth half their coins; side quests pay the XP below; ${esc(PROSE.crew)}`,
            ])}`
            + `<h4>Side quests that pay XP</h4>${table(['Quest', 'Given by', 'XP'], questXp)}`)
        + sub('s-xpboosts', 'Every XP boost', p('Boosts add up: two +50% boosts make +100%.') + table(['Source', 'Boost'], boost)
            + `<h4 id="s-creaturexp">Creatures learning faster</h4>${table(['Source', 'Boost'], creatureBoost)}`
            + p(esc(PROSE.scholar))));
}

function unlocksSection () {
    const rows = ALL_TOKENS.map((t) => {
        const s = tokenSkill(t), path = s ? pathTo(s.id) : [];
        const recipes = RECIPE_LIST.filter((r) => r.req === t), blds = (Object.keys(BUILDINGS) as BuildingKind[]).filter((k) => BUILDINGS[k].req === t);
        return [
            `<span id="${A.unlock(t)}"></span><b>${s ? sl(s.id) : esc(t)}</b>${s ? `<br><span class="dim">${esc(BRANCHES[s.branch].name)}</span>` : ''}`,
            s ? `${path.map((n) => sl(n.id)).join(' &rarr; ')}<br><span class="dim">${plural(best.get(s.id)!.cost, 'point')} from the hub</span>` : 'Not granted by a skill',
            esc(UNLOCK_INFO[t] ?? ''),
            list([...blds.map((k) => `<b>${bl(k)}</b>`), ...recipes.map((r) => `${il(r.out)} <span class="dim">(${esc(stationName(r.station))})</span>`)], '<span class="dim">no recipe or building</span>'),
        ];
    });
    return section('s-unlocks', 'What unlocks what', intro('unlocks') + table(['Skill', 'Cheapest path from the hub', 'What it says', 'Opens'], rows)
        + p(`A recipe also needs its station: the ${bl('anvil')} needs Blacksmithing, the ${bl('kitchen')} Kitchen Know-How, and so on (see ${link('s-buildings', 'Buildings')}). Menus only list a station once you can use it, and the Build menu hides Logistics and Power until the skill tree opens them.`));
}

function skillsSection () {
    const branches = BRANCH_ORDER.map((b) => {
        const def = BRANCHES[b];
        const nodes = SKILL_LIST.filter((n) => n.branch === b).sort((x, y) => x.u - y.u || x.v - y.v);
        const cs = nodes.map((n) => {
            const reqs = n.req.map((r) => (r === 'hub' ? 'the hub' : sl(r)));
            const unl = (n.unlock ?? []).map((t) => `${link(A.unlock(t), esc(t))}: ${esc(UNLOCK_INFO[t] ?? '')}`);
            const total = best.get(n.id)?.cost ?? n.cost;
            const body = kv([
                ['Ranks', `${n.max} &times; ${plural(n.cost, 'point')}`],
                ['Needs', `${list(reqs)}${n.req.length > 1 ? ' <span class="dim">(any one)</span>' : ''}`],
                ...(n.mods ? [['Per rank', modsHtml(n.mods)] as [string, string]] : []),
                ...(n.mods && n.max > 1 ? [['At max rank', modsHtml(n.mods, n.max)] as [string, string]] : []),
                ...(unl.length ? [['Unlocks', unl.join('<br>')] as [string, string]] : []),
                ['Cheapest path', `${pathTo(n.id).map((x) => sl(x.id)).join(' &rarr; ')} <span class="dim">(${plural(total, 'point')} for the first rank)</span>`],
            ]) + (n.desc ? p(`<i>${esc(n.desc)}</i>`) : '');
            return card(A.skill(n.id), `${esc(n.name)}${n.key ? ' ' + tag('Keystone', PAL.gold) : ''}`, `${esc(def.name)} &middot; ring ${n.u}`, body, n.key ? 'key' : '');
        });
        const pts = nodes.reduce((a, n) => a + n.cost * n.max, 0);
        return `<div id="${A.branch(b)}"></div>` + sub(`s-branch-${b}`, `${def.name} (${nodes.length} nodes, ${pts} points)`, p(`<span class="bar" style="--t:${hex(def.color)}"></span>${esc(def.blurb)}`) + cards(cs));
    });
    return section('s-skills', 'Skill tree', intro('skills') + branches.join(''));
}

function itemCard (id: ItemId) {
    const d = ITEMS[id];
    const eff: [string, string][] = [];
    if (d.food) eff.push(['Energy', `+${d.food}`]);
    if (d.heal) eff.push(['Heals', `${d.heal} &hearts;`]);
    if (d.buff) eff.push(['Buff', `${buffL(d.buff.id)} for ${secs(d.buff.secs)}: ${modsHtml(BUFFS[d.buff.id].mods)}`]);
    if (d.xpPct) eff.push(['XP', `${pct(d.xpPct, 0)} of what your current level needs, at once`]);
    if (d.open) eff.push(['Opens', d.open === 'bottle' ? 'A letter from long ago (and it shows you a buried treasure)' : `Click it in the Backpack: see ${link(A.crate(d.open), esc(CRATES[d.open as CrateTier].name))}`]);
    const g = d.gear;
    if (g) {
        eff.push(['Slot', `${esc(SLOT_NAMES[g.slot])}, tier ${g.tier}`]);
        if (g.power) eff.push(['Pick power', `${g.power} <span class="dim">(breaks nodes up to tool tier ${g.tier})</span>`]);
        if (g.dmg) eff.push(['Weapon', `${num(g.dmg)} damage, ${esc(g.wtype ?? '')} (${esc(WEAPON_WORDS[g.wtype ?? 'fist'] ?? '')}), swing time x${num(g.cd ?? 1)}, reach ${g.reach} px`]);
        if (g.mods) eff.push(['Bonuses', modsHtml(g.mods)]);
    }
    if (FUEL[id]) eff.push(['Fuel', `${FUEL[id]} s of burn time`]);
    const how = SRC.get(id) ?? [], uses = USE.get(id) ?? [];
    const body = (eff.length ? kv(eff) : '') + p(`<i>${esc(d.desc)}</i>`)
        + `<h5>How to get it</h5>${ul(how) || p('<span class="dim">Nothing gives this yet.</span>')}`
        + (uses.length ? `<h5>Used for</h5>${uses.length > 14 ? `<details class="more"><summary>${uses.length} uses</summary>${ul(uses)}</details>` : ul(uses)}` : '');
    return card(A.item(id), `${swatch(id)}${esc(d.name)}`, `${rarityTag(d.rarity)} ${esc(KIND_NAME[d.kind])} &middot; sells for ${d.sell} coin${d.sell === 1 ? '' : 's'}`, body);
}

function itemsSection () {
    const groups: [string, string, (id: ItemId) => boolean][] = [
        ['s-items-materials', 'Materials', (i) => ITEMS[i].kind === 'material'],
        ['s-items-food', 'Food and crops', (i) => ITEMS[i].kind === 'food'],
        ['s-items-seeds', 'Seeds', (i) => ITEMS[i].kind === 'seed'],
        ['s-items-potions', 'Potions', (i) => ITEMS[i].kind === 'potion'],
        ...(['tool', 'weapon', 'head', 'body', 'charm', 'ring', 'bag'] as GearSlot[]).map((s) => [`s-items-${s}`, `Gear: ${SLOT_NAMES[s]}`, (i: ItemId) => ITEMS[i].gear?.slot === s] as [string, string, (id: ItemId) => boolean]),
        ['s-items-relics', 'Relics (for the Relic Satchel)', (i) => !!ITEMS[i].relic],
        ['s-items-misc', 'Other things (pods, rods, sigils, trophies, crates...)', (i) => ITEMS[i].kind === 'misc'],
    ];
    const seen = new Set<ItemId>();
    const body = groups.map(([id, title, f]) => {
        const ids = ITEM_ORDER.filter((i) => f(i) && !seen.has(i));
        ids.forEach((i) => seen.add(i));
        return sub(id, `${title} (${ids.length})`, cards(ids.map(itemCard)), false);
    }).join('');
    const rest = ITEM_ORDER.filter((i) => !seen.has(i));
    return section('s-items', `Items (${ITEM_ORDER.length})`, intro('items') + intro('rings')
        + p(`Swatches: the colour is the kind of item, the ring its rarity (${RARITY_NAMES.map((_, i) => rarityTag(i)).join(' ')}).`)
        + body + (rest.length ? sub('s-items-rest', 'More', cards(rest.map(itemCard))) : ''));
}

function craftingSection () {
    const order: (StationId | ProcId)[] = [...new Set(RECIPE_LIST.map((r) => r.station))];
    const subs = order.map((s) => {
        const rs = RECIPES_BY_STATION.get(s) ?? [];
        const b = stationBuilding(s);
        const timed = rs.some((r) => r.time);
        const head = s === 'hand' ? p('No station needed: press C anywhere.')
            : b ? p(`Build ${an(BUILDINGS[b].name, bl(b))} (${cost(BUILDINGS[b].cost)})${BUILDINGS[b].req ? `: ${needs(BUILDINGS[b].req)}` : ', no skill needed'}.${BUILDINGS[b].work ? ` A creature with ${link('s-jobs', esc(WORK_INFO[BUILDINGS[b].work!].name))} can run it.` : ''}`) : '';
        const rows = rs.map((r) => [il(r.out, r.n), cost(r.in), ...(timed ? [r.time ? `${num(r.time)} s` : ''] : []), num(r.xp), r.req ? needs(r.req) : '<span class="dim">open</span>']);
        return `<div id="${A.station(s)}"></div>` + sub(`s-st-${s}`, `${stationName(s)} (${rs.length})`, head + table(['Makes', 'From', ...(timed ? ['Time'] : []), 'XP', 'Unlock'], rows));
    });
    return section('s-crafting', `Crafting (${RECIPE_LIST.length} recipes)`, intro('crafting') + subs.join(''));
}

function buildingCard (k: BuildingKind) {
    const b = BUILDINGS[k];
    const rows: [string, string][] = [
        ['Size', `${b.size[0]} &times; ${b.size[1]} tiles`],
        ['Cost', cost(b.cost)],
        ['Unlock', b.req ? needs(b.req) : (b.hidden ? 'Made by the world, never built by hand' : 'Open from the start')],
    ];
    if (b.station) rows.push(['Station', `${stationL(b.station)} (${(RECIPES_BY_STATION.get(b.station) ?? []).length} recipes)`]);
    if (b.proc) rows.push(['Machine', `${stationL(b.proc)} (${(RECIPES_BY_STATION.get(b.proc) ?? []).length} recipes)${b.fuel ? ', burns fuel' : ''}`]);
    else if (b.fuel) rows.push(['Fuel', 'Burns coal, wood or peat']);
    if (b.storage) rows.push(['Holds', `${b.storage} items`]);
    if (b.pets) rows.push(['Creatures', `${b.pets} can live and work here`]);
    if (b.use) rows.push(['Power use', `${b.use} units while working`]);
    if (b.gen) rows.push(['Power made', `${b.gen} units${b.solar ? ' in full sun, nothing at night' : k === 'windturbine' ? ' at most (it follows the wind)' : ''}`]);
    if (b.store) rows.push(['Stores power', `${b.store} units`]);
    if (b.light) rows.push(['Light', `${b.light} px radius at night`]);
    if (b.work) rows.push(['Creature job', `${link('s-jobs', esc(WORK_INFO[b.work].name))}${ORDER_STATIONS.includes(b.station as StationId) ? ' (takes orders)' : ' (keeps it running)'}`]);
    const flags = [b.floor && 'a floor (walkable, nothing spawns on it)', b.wall && 'a wall (joins up with its neighbours)', b.roof && 'a roof (fades when you stand under it)',
        b.gate && 'a doorway: you walk through, monsters cannot', b.walk && !b.gate && 'walkable', b.dir && 'has a facing (R turns it)', b.pole && 'a power pole'].filter(Boolean) as string[];
    if (flags.length) rows.push(['Notes', esc(list(flags))]);
    if (HEARTH_SPOTS[k]) rows.push(['Evening hearth', `Farmers gather round it at dusk (${link('s-hearth', 'Hearthside')})`]);
    const how = HOWTO[k];
    return card(A.bld(k), esc(b.name), esc(BUILD_CATS.find((c) => c.id === b.cat)?.name ?? b.cat), kv(rows) + p(`<i>${esc(b.desc)}</i>`) + (how ? p(`<b>${esc(how.role)}.</b> ${esc(how.how)}`) : ''));
}

function buildingsSection () {
    const subs = BUILD_CATS.map((c) => {
        const ks = BUILD_ORDER.filter((k) => BUILDINGS[k].cat === c.id);
        return ks.length ? sub(`s-bc-${c.id}`, `${c.name} (${ks.length})`, cards(ks.map(buildingCard)), false) : '';
    });
    const hidden = (Object.keys(BUILDINGS) as BuildingKind[]).filter((k) => BUILDINGS[k].hidden);
    return section('s-buildings', `Buildings (${BUILD_ORDER.length})`, intro('buildings') + subs.join('')
        + (hidden.length ? sub('s-bc-world', 'Made by the world', cards(hidden.map(buildingCard)), false) : ''));
}

function farmingSection () {
    const env = (s: typeof SEASON_ORDER[number]) => ({ growMul: 1, seasonGrow: SEASONS[s].grow, seasonYield: SEASONS[s].yield, sellMul: 1 });
    const rows = SEED_IDS.map((s) => {
        const c = CROPS[s]!, f = cropFacts(s, env('summer'))!;
        return [il(s), il(c.out), ...SEASON_ORDER.map((se) => fmtSecs(cropFacts(s, env(se))!.secs)), `${range(c.yield[0], c.yield[1])}`, pct(c.seedBack, 0), num(c.xp), `${num(f.coins, 1)} <span class="dim">(${num(f.perMin, 1)}/min)</span>`];
    });
    const seasons = SEASON_ORDER.map((s) => [`<b id="season-${s}">${esc(SEASONS[s].name)}</b>`, `x${num(SEASONS[s].grow)}`, SEASONS[s].yield ? pct(SEASONS[s].yield, 0) : '-', `x${num(SEASONS[s].rain)}`, `x${num(SEASONS[s].night)}`, esc(SEASONS[s].blurb)]);
    const grow = SKILL_LIST.filter((n) => n.mods && (n.mods.grow || n.mods.cropYield || n.mods.seedChance)).map((n) => [sl(n.id), modsHtml(n.mods), `${n.max}`]);
    return section('s-farming', 'Farming', intro('farming')
        + p(`Build a ${bl('bed')} (${cost(BUILDINGS.bed.cost)}), stand by it with a seed and press E to plant; press E again when it is ripe. Rain makes growing beds grow up to ${pct(TUNING.rainGrow, 0)} faster. A companion with the Farm task, or a creature on a Farming post, harvests, replants and waters for you.`)
        + sub('s-crops', 'Crops', p('Time to ripe with no skills, in each season. Value is an average summer harvest at the market, and per minute of bed time.')
            + table(['Seed', 'Crop', ...SEASON_ORDER.map((s) => SEASONS[s].name), 'Yield', 'Seed back', 'XP', 'Value'], rows))
        + sub('s-seasons', 'Seasons', p(`A season lasts ${SEASON_DAYS} days; a year is ${SEASON_ORDER.length} seasons.`) + table(['Season', 'Crop growth', 'Extra crop chance', 'Rain', 'Night length', 'In words'], seasons))
        + sub('s-farmskills', 'Skills that help', table(['Skill', 'Per rank', 'Ranks'], grow)));
}

/** A tiny floor plan of a layout: every piece as a coloured block on a grid. */
function plan (items: { kind: BuildingKind; dx: number; dy: number; rot: number }[], marks: { i: number; t: string }[] = []) {
    const CAT_COLOR: Record<string, number> = { industry: PAL.pumpkin, logistics: PAL.stone, power: PAL.gold, storage: PAL.wood, craft: PAL.leaf };
    const arrow = ['&#9656;', '&#9662;', '&#9666;', '&#9652;'];
    let w = 0, h = 0;
    const boxes = items.map((it) => {
        const [sw, shh] = BUILDINGS[it.kind].size, rw = it.rot % 2 ? shh : sw, rh = it.rot % 2 ? sw : shh;
        w = Math.max(w, it.dx + rw); h = Math.max(h, it.dy + rh);
        return { it, rw, rh };
    });
    const cells = boxes.map(({ it, rw, rh }, i) => {
        const b = BUILDINGS[it.kind], m = marks.find((x) => x.i === i);
        return `<div class="pc" title="${esc(b.name)}${m ? `: ${esc(m.t)}` : ''}" style="grid-column:${it.dx + 1}/span ${rw};grid-row:${it.dy + 1}/span ${rh};--c:${hex(CAT_COLOR[b.cat] ?? PAL.slate)}">${esc(b.name.split(' ').map((x) => x[0]).join('').slice(0, 2))}${b.dir ? arrow[it.rot % 4] : ''}</div>`;
    });
    return `<div class="plan" style="grid-template-columns:repeat(${w},22px);grid-template-rows:repeat(${h},22px)">${cells.join('')}</div>`;
}

function factorySection () {
    const auto = (Object.keys(HOWTO) as BuildingKind[]).map((k) => [bl(k), esc(HOWTO[k]!.role), esc(HOWTO[k]!.how), cost(BUILDINGS[k].cost), BUILDINGS[k].req ? needs(BUILDINGS[k].req) : 'open']);
    let lo = 1, hi = 0;
    for (let t = 0; t < 4000; t += 0.5) { const v = wind(t); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const power = (Object.keys(BUILDINGS) as BuildingKind[]).filter((k) => BUILDINGS[k].gen || BUILDINGS[k].use || BUILDINGS[k].store).map((k) => {
        const b = BUILDINGS[k];
        return [bl(k), b.gen ? (k === 'windturbine' ? `${Math.round(b.gen * lo)} to ${b.gen}` : `${b.gen}${b.solar ? ' (by day)' : ''}`) : '', b.use ? `${b.use}` : '', b.store ? `${b.store}` : '', b.fuel ? 'yes' : ''];
    });
    const fuel = (Object.entries(FUEL) as [ItemId, number][]).map(([i, s]) => [il(i), `${s} s`]);
    const status = (Object.keys(STATUS_INFO) as (keyof typeof STATUS_INFO)[]).map((k) => [`<span class="tag" style="--t:${hex(STATUS_INFO[k].color)}">${esc(STATUS_INFO[k].text)}</span>`, esc(STATUS_INFO[k].hint || 'All good.')]);
    const layouts = STARTER_LAYOUTS.map((l) => {
        const counts = new Map<BuildingKind, number>();
        for (const it of l.items) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
        const total: Cost = {};
        for (const it of l.items) for (const [r, n] of Object.entries(BUILDINGS[it.kind].cost) as [Res, number][]) total[r] = (total[r] ?? 0) + n;
        return card(A.layout(l.id), esc(l.name), `${l.items.length} pieces`, plan(l.items, l.marks) + kv([
            ['What', esc(l.what)], ['Needs', esc(l.need)], ['Where', esc(l.where)], ['Then', esc(l.then)],
            ['Pieces', list([...counts].map(([k, n]) => `${n} &times; ${bl(k)}`))], ['Materials', cost(total)],
        ]));
    });
    return section('s-factory', 'Factory and automation', intro('factory')
        + p(`Factory view key: <kbd>${FACTORY_VIEW_KEY}</kbd>. Badges over machines: green gear working, yellow hourglass waiting for ingredients, red bolt no power, red flame no fuel, red cross blocked.`)
        + sub('s-auto', 'The pieces', table(['Piece', 'Role', 'How to use it', 'Cost', 'Unlock'], auto))
        + sub('s-power', 'Power', p(`A Power Pole wires up machines within ${SUPPLY} tiles and links to poles within ${WIRE_RANGE}; poles that reach each other form one grid. When a grid makes less than its machines want, they all slow down. Wind comes and goes (${Math.round(lo * 100)}% to ${Math.round(hi * 100)}% of a turbine's top output).`)
            + table(['Building', 'Makes', 'Uses', 'Stores', 'Burns fuel'], power) + `<h4>Fuel</h4>${table(['Fuel', 'Burn time'], fuel)}`)
        + sub('s-rates', 'Rates and reach', kv([
            ['Drill', `one item every ${num(DRILL_BASE)} s with all four tiles on ore (slower with fewer); ${link('s-skills', 'Drill Bits')} and Full Automation add more`],
            ['Inserter', `one swing every ${num(SWING)} s`],
            ['Tunnel', `entrance and exit up to ${TUNNEL_RANGE} tiles apart`],
            ['Export Chute', `sells at ${pct(TUNING.chuteCut, 0)} of the market price, paid to whoever built it`],
            ['Machines', `furnace, sawmill, millstone and assembler times are in ${link('s-crafting', 'Crafting')}`],
        ]))
        + sub('s-workstatus', 'What a working creature says', table(['Status', 'What to do'], status))
        + sub('s-layouts', `Starter layouts (${STARTER_LAYOUTS.length})`, p('The Blueprint screen (V) opens with these ready-made lines. Place one with a click; each piece costs its ordinary price.') + cards(layouts)));
}

function worldSection () {
    const biomes = BIOMES.map((b) => {
        const d = BIOME_DEFS[b], tot = Object.values(d.nodes).reduce((a, n) => a + (n ?? 0), 0);
        const nodes = (Object.entries(d.nodes) as [NodeKind, number][]).sort((x, y) => y[1] - x[1]).map(([k, w]) => `${nl(k)} ${pct(w / tot, 0)}`);
        const mobs = new Set<MobKind>();
        for (let i = 0; i < 400; i++) mobs.add(pickWild(b, 80, () => (i + 0.5) / 400));
        return [`<span id="${A.biome(b)}"></span><span class="bar" style="--t:${hex(d.color)}"></span><b>${esc(d.name)}</b>`, `x${num(d.priceMul)}`, list(nodes), list([...mobs].map(ml))];
    });
    const mods = (Object.keys(MODS) as (keyof typeof MODS)[]).map((m) => [`<b id="mod-${m}">${esc(MODS[m].name)}</b>`, esc(MODS[m].desc), `x${num(MODS[m].priceMul)}`]);
    const nodeRows = (Object.keys(NODES) as NodeKind[]).map((k) => {
        const n = NODES[k];
        return [`<span id="${A.node(k)}"></span><b>${esc(n.name)}</b>${n.titan ? ' ' + tag('Titan', PAL.gold) : ''}`, `${n.hp}`, `${n.xp}`, n.minTier ? `${n.minTier}` : '0',
            n.drops.length ? list(n.drops.map(([r, lo, hi, c]) => `${res(r)} ${chanceWords(c, lo, hi)}`)) : 'A treasure roll (see Luck and loot)',
            list(BIOMES.filter((b) => BIOME_DEFS[b].nodes[k]).map(biomeL), '<span class="dim">special</span>')];
    });
    const prices: string[][] = [];
    const plot = { biome: 'meadow', mod: null } as unknown as Plot;
    for (const n of [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, TUNING.landPriceKnee, TUNING.landPriceKnee + 1, 40, 50, 60, 80, 100]) {
        if (prices.some((r) => r[0] === `${n + 1}`)) continue;
        prices.push([`${n + 1}`, num(World.prototype.price.call(null as unknown as World, plot, n))]);
    }
    const bands = CAVE_ORE_BANDS.map((b, i) => {
        const tot = Object.values(b.w).reduce((a, x) => a + x, 0);
        const from = i ? CAVE_ORE_BANDS[i - 1].upTo : 0;
        return [`${pct(from, 0)} to ${Number.isFinite(b.upTo) ? pct(b.upTo, 0) : 'the edge'}`, list(Object.entries(b.w).map(([k, w]) => `${il(CAVE_ORES[Number(k) - 1])} ${pct(w / tot, 0)}`))];
    });
    const cave = new Set<MobKind>(), haunt = new Set<MobKind>();
    for (let i = 0; i < 400; i++) { cave.add(pickCave(80, 1, () => (i + 0.5) / 400)); haunt.add(pickHaunt(80, () => (i + 0.5) / 400)); }
    const nights = (Object.keys(NIGHT_EVENTS) as (keyof typeof NIGHT_EVENTS)[]).map((e) => [`<b>${esc(NIGHT_EVENTS[e].name)}</b>`, esc(NIGHT_EVENTS[e].sub), esc(NIGHT_WORDS[e])]);
    const wishes = WISHES.map((w) => [`<b id="wish-${w.id}">${esc(w.name)}</b>`, esc(w.blurb), modsHtml(w.mods)]);
    return section('s-world', 'World', intro('world')
        + p(`The world is ${GRID} &times; ${GRID} plots of ${PLOT} &times; ${PLOT} tiles. Up to ${MAX_PLAYERS} farmers each get a home island; the plots from the middle out come in rings of biomes, and far out are the wilds. A day is ${secs(TUNING.dayLength)} of daylight and ${secs(TUNING.nightLength)} of night; a warning comes ${TUNING.duskWarn[0]} s before dusk and an alarm ${TUNING.duskWarn[1]} s before.`)
        + sub('s-biomes', 'Biomes', p('Land price multiplier, how often each resource grows, and the monsters that roam there at the highest threat level.') + table(['Biome', 'Price', 'Resources', 'Monsters'], biomes))
        + sub('s-mods', 'Plot modifiers', table(['Modifier', 'What it does', 'Price'], mods))
        + sub('s-nodes', 'Resource nodes', p('Hit points, XP, the pick tier it needs and what it drops. Skills and Bountiful plots add more.') + table(['Node', 'HP', 'XP', 'Pick tier', 'Drops', 'Biomes'], nodeRows)
            + `<h4>Titan nodes</h4>${p(esc(PROSE.titans))}${kv([['Hands', `${TITAN.minHands} or more farmers within ${TITAN.window} s`], ['Bonus', `+${pct(TITAN.handBonus, 0)} for every extra hand, up to ${TITAN.maxHands} hands`], ['Grows', `${pct(TITAN.chance)} of new trees and boulders on owned land, at most ${TITAN.perPlot} per island, once ${TITAN.farmers} farmers have a farm`]])}`)
        + sub('s-land', 'Buying land', p(esc(PROSE.land)) + table(['Your plot number', 'Price on a plain Meadow plot'], prices))
        + sub('s-heart', 'The Old Heart', p(`The plot in the exact middle of the map (plot ${CENTER.gx}, ${CENTER.gy}) belongs to ${ml('oldheart')}. Buy land towards it, build a ${bl('altar')} there and wake it with the ${il('sigil_heart')}.`))
        + sub('s-dread', 'The Dread Reaches', p(esc(PROSE.dread)) + kv([
            ['Blocks', `${DREAD_ZONES}, each 3 &times; 3 plots`],
            ['Haunting', `${TUNING.dreadBase} monsters as soon as somebody walks in, ${TUNING.dreadPerFarmer} more per farmer inside, at most ${TUNING.dreadMax}; one tier tougher than your level calls for`],
            ['Who haunts', list([...haunt].map(ml))],
            ['Warden', `an altar boss with ${TUNING.wardenHp} times the health and ${TUNING.wardenDmg} times the damage; wakes again ${TUNING.wardenRespawnDays} days after it falls`],
            ['Spoils', 'the ordinary boss spoils plus gold crates, rift shards and a chance at a mythic crate'],
        ]))
        + `<div id="s-caves"></div>` + sub('s-caves-sub', 'The caves', p(esc(PROSE.caves)) + kv([
            ['Getting there', `learn ${sl('g_shaft')} and build a ${bl('mineshaft')}`],
            ['Ore by distance from the middle', table(['Distance', 'Ore clusters'], bands)],
            ['Crystal', `needs a tier 2 pick (${il('pick_gold')} or better)`],
            ['Ancient chambers', `${CHAMBERS}, at least a third of the way out`],
            ['What lives there', `${list([...cave].map(ml))}; deeper means nastier. ${TUNING.caveBase} to ${TUNING.caveMax} come for whoever digs.`],
        ]))
        + sub('s-weather', 'Weather and nights', p(esc(PROSE.weather)) + table(['Night', 'What happens', 'When'], nights)
            + p(`<b>${esc(SCHOLAR_DAY.name)}:</b> ${esc(SCHOLAR_DAY.sub)} ${esc(PROSE.scholar)}`))
        + `<div id="s-wishes"></div>` + sub('s-wishes-sub', `Season wishes (${WISHES.length})`, p(esc(PROSE.wish)) + p(`${WISH_OPTIONS} are offered each season.`) + table(['Wish', 'In words', 'Bonus'], wishes)));
}

function phasesTable (phases: BossPhase[]) {
    return table(['From', 'Patterns, in order', 'Rest', 'Speed'], phases.map((ph) => [
        `${pct(ph.at, 0)} health${ph.note ? `<br><span class="dim">"${esc(ph.note)}"</span>` : ''}`,
        ph.patterns.map((x) => `<span class="pat" title="${esc(PATTERN_WORDS[x] ?? '')}">${esc(x)}</span>`).join(' ')
            + (ph.alone ? `<br><span class="dim">alone: ${esc(Object.entries(ph.alone).map(([a, b]) => `${a} becomes ${b}`).join(', '))}</span>` : ''),
        `${num(ph.pause)} s`, ph.speed ? `x${num(ph.speed)}` : 'x1',
    ]));
}

/** The tower levels and perks (data/towerperks.ts). */
function towerPerks () {
    const T = TUNING.towers;
    const names: Record<string, string> = { archer: 'Archer Tower', ballista: 'Ballista', tesla: 'Tesla Coil', spike: 'Spike Trap' };
    const hex: Record<Rarity, string> = { common: 'd5d9e6', uncommon: '5cb04f', rare: '4ab2cf', legendary: 'ffd966' };
    const xp = Array.from({ length: T.maxLevel - 1 }, (_, i) => [`${i + 2}`, `${xpStep(i + 2)}`, `${xpAt(i + 2)}`]);
    const rows = PERKS.map((d) => [`<b>${esc(d.name)}</b>`, `<span class="tag" style="--t:#${hex[d.rarity]}">${RARITY_NAME[d.rarity]}</span>`, esc(d.on.map((t) => names[t]).join(', ')), d.max > 1 ? `up to ${d.max}` : 'once', esc(d.desc)]);
    const odds = RARITIES.map((r) => `${RARITY_NAME[r]} ${T.weights[r]}`).join(', ');
    return p(esc(`Towers and spike traps earn XP from what they kill (the monster's own XP, ${T.eliteXp} times that for an elite). Each level from 2 to ${T.maxLevel} lets you choose one of three upgrades drawn from that tower's own pool: use the tower to see them. The same three are offered every time, so reloading changes nothing. How likely each rarity is: ${odds} (out of ${Object.values(T.weights).reduce((a, b) => a + b, 0)}); a Legendary upgrade can only be offered from level ${T.legendaryFrom} on.`))
        + table(['Level', 'XP for this level', 'XP in total'], xp)
        + table(['Upgrade', 'Rarity', 'Fits', 'Taken', 'What it does'], rows);
}

function combatSection () {
    const firstLevel = (tier: number) => { for (let l = 1; l <= MAX_LEVEL; l++) if (tierCap(l) >= tier) return l; return null; };
    const mobCards = WILD_KINDS.map((k) => {
        const d = MOBS[k];
        const rifts = RIFT_TIERS.filter((t) => t.cap >= d.tier).map((t) => link(A.rift(t.id), esc(t.name)));
        const fl = firstLevel(d.tier);
        const rows: [string, string][] = [
            ['Health', `${d.hp} (more at higher threat levels)`], ['Hits for', `${num(d.dmg)} &hearts;`], ['Speed', `${d.speed}`], ['Behaviour', `${esc(d.ai)}: ${esc(AI_WORDS[d.ai] ?? '')}`],
            ['XP and coins', `${d.xp} XP, ${range(d.coins[0], d.coins[1])} coins`],
            ['Drops', list(d.drops.map(([r, c, lo = 1, hi = lo]) => `${il(r)} ${chanceWords(c, lo, hi)}`), 'nothing')],
            ['Where', `${d.biomes ? list(d.biomes.map(biomeL)) : 'every biome'}${d.group ? `, in packs of ${range(d.group[0], d.group[1])}` : ''}${d.flies ? ', flies' : ''}`],
            ['When', fl ? `at night from threat level ${fl}` : 'never at night'],
        ];
        if (d.shoot) rows.push(['Shoots', `${esc(d.shoot.proj)}${d.shoot.count ? ` x${d.shoot.count}` : ''} every ${num(d.shoot.every)} s, range ${d.shoot.range} px`]);
        if (d.charge) rows.push(['Charges', `winds up ${num(d.charge.wind)} s, then rams ${d.charge.dist} px`]);
        if (rifts.length) rows.push(['Expeditions', list(rifts)]);
        return card(A.mob(k), esc(d.name), `Tier ${d.tier}`, kv(rows) + p(`<i>${esc(d.desc)}</i>`));
    });
    const levels = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 40, 60, 80];
    const threat = levels.map((l) => [`${l}`, `${tierCap(l)}`, `${nightCount(l)}`, pct(softHit(l), 0), pct(eliteChance(l), 1)]);
    const bossCards = BOSS_ORDER.map((id) => {
        const { kind, info } = BOSSES[id], d = MOBS[kind];
        const sig = RECIPE_LIST.find((r) => r.out === info.sigil);
        const body = kv([
            ['Summon', `${il(info.sigil)} at a ${bl('altar')}${info.heartOnly ? ' on the centre plot' : ''}${sig ? `; the sigil is made at the altar from ${cost(sig.in)}` : ''}`],
            ['Health', `${d.hp} (scaled by the party)`], ['Hits for', `${num(d.dmg)} &hearts;`], ['Arena', `${info.arena} px around the altar`],
            ['Calls', info.summon ? ml(info.summon as MobKind) : 'nothing'],
            ['Rewards', `${d.xp} XP, ${range(d.coins[0], d.coins[1])} coins, ${plural(info.points, 'skill point')} for everybody who helped, ${list(d.drops.map(([r, , lo = 1, hi = lo]) => `${il(r)} ${range(lo, hi)}`))}`],
            ['Trophy', `${il(info.trophy)} (always the first time)`],
            ['Signature gear', `one of ${list(info.gear.map((g) => il(g)))} (the first defeat always gives ${il(info.gear[0])})`],
            ['Crates', `a ${il(CRATE_ITEM[BOSS_CRATE.guaranteed])} each${id === 'heart' ? ` and a ${il(CRATE_ITEM.mythic)}` : `, ${pct(BOSS_CRATE.bonusChance, 0)} chance of a ${il(CRATE_ITEM[BOSS_CRATE.bonus])}`}`],
        ]) + p(esc(info.blurb)) + phasesTable(info.phases);
        return card(A.mob(kind), esc(info.title), `Tier ${d.tier}`, body, 'wide');
    });
    const pats = Object.entries(PATTERN_WORDS).map(([k, v]) => [`<span class="pat">${esc(k)}</span>`, esc(v)]);
    const co = (Object.keys(CO_INFO) as (keyof typeof CO_INFO)[]).map((k) => [`<b>${esc(CO_INFO[k].name)}</b>`, esc(CO_INFO[k].tip)]);
    const weapons = ITEM_ORDER.filter((i) => ITEMS[i].gear?.slot === 'weapon').map((i) => {
        const g = ITEMS[i].gear!;
        return [il(i), esc(g.wtype ?? ''), num(g.dmg ?? 0), `x${num(g.cd ?? 1)}`, `${g.reach}`, modsHtml(g.mods)];
    });
    return section('s-combat', 'Combat', intro('combat')
        + sub('s-threat', 'How hard the night is', p(esc(PROSE.threat)) + table(['Threat level', 'Highest monster tier', 'Monsters per farmer each night', 'Damage you take', 'Elite chance'], threat)
            + p(`Farmers within ${TUNING.partyRange} px of each other count as one party. Monsters never appear within ${TUNING.spawnClear} px of a farmer, nor on a floor or inside a closed room. A campfire keeps them ${TUNING.campfireRadius} px away and heals a heart every ${TUNING.campfireHealEvery} s at night.`)
            + `<h4>Elites</h4>${p(esc(PROSE.elites))}`)
        + sub('s-monsters', `Monsters (${WILD_KINDS.length})`, cards(mobCards))
        + sub('s-weapons', 'Weapons', p(Object.entries(WEAPON_WORDS).map(([k, v]) => `<b>${esc(k)}</b>: ${esc(v)}`).join(' ')) + table(['Weapon', 'Type', 'Damage', 'Swing time', 'Reach', 'Bonuses'], weapons))
        + sub('s-bosses', `Bosses (${BOSS_ORDER.length})`, p(esc(PROSE.altar)) + p(esc(PROSE.coop)) + cards(bossCards) + `<h4>Patterns</h4>${table(['Pattern', 'What it does'], pats)}`)
        + sub('s-coop', 'Co-op statuses', table(['Status', 'What happens'], co))
        + sub('s-towerperks', `Tower upgrades (${PERKS.length})`, towerPerks())
        + sub('s-death', 'Going down, and the lost backpack', p(esc(PROSE.death)) + kv([
            ['Waiting for a friend', `${TUNING.downedSeconds} s (${TUNING.downedSoloSeconds} s when nobody can come)`],
            ['Reviving', `hold E beside them for ${TUNING.reviveSeconds} s`],
            ['Waking at home', `costs ${pct(TUNING.deathXpLoss, 0)} of the XP you had towards the next level`],
            ['Lost Backpack', `lies where you fell for ${secs(TUNING.packLife)} (about ${Math.round(TUNING.packLife / DAY)} days)`],
        ]) + p(esc(PROSE.death_tip)))
        + sub('s-dash', 'Dash and the Perfect dash', p(esc(PROSE.perfect)) + kv([
            ['Unlock', `learn ${sl('c_dash')}`], ['Energy', `${TUNING.dashEnergy} per dash (a Perfect dash gives it back)`], ['Invulnerable', `${TUNING.dashInvuln} s`],
            ['Cooldown', `${TUNING.dashCooldown} s`], ['Perfect', `${buffL('perfect')} for ${TUNING.perfectSeconds} s: ${modsHtml(BUFFS.perfect.mods)}`],
        ])));
}

function creaturesSection () {
    const dots = (n?: number) => (n ? `<span class="dots" title="${n} of 5">${'&#9679;'.repeat(n)}<span class="dim">${'&#9675;'.repeat(5 - n)}</span></span>` : '');
    const pods = Object.keys(POD_POWER) as ItemId[];
    const matrix = SPECIES_LIST.map((id) => [spl(id), ...WORK_KINDS.map((w) => dots(SPECIES[id].work[w]))]);
    const spCards = SPECIES_LIST.map((id) => {
        const s = SPECIES[id];
        const body = kv([
            ['Element', `<span class="bar" style="--t:${hex(ELEMENT_COLOR[s.element])}"></span>${esc(ELEMENT_NAME[s.element])}`],
            ['Found', `${s.biomes === 'any' ? 'anywhere' : list(s.biomes.map(biomeL))}${s.when ? `, only by ${s.when}` : ''}${s.flies ? ', flies' : ''}`],
            ['Health and attack', `${s.hp} and ${num(s.atk)} at level 1`],
            ['Work', list((Object.entries(s.work) as [WorkKind, number][]).map(([w, n]) => `${link('s-jobs', esc(WORK_INFO[w].name))} ${dots(n)}`))],
            ['Catch chance', list(pods.map((pd) => `${il(pd)} ${pct(catchChance(s.rarity, 1, POD_POWER[pd], 0), 0)}`))],
        ]) + p(`<i>${esc(s.desc)}</i>`);
        return card(A.sp(id), esc(s.name), rarityTag(s.rarity, CRIT_RARITY, [PAL.pebble, PAL.leaf, PAL.sea, PAL.gold]), body);
    });
    const jobs = WORK_KINDS.map((w) => [`<b>${esc(WORK_INFO[w].name)}</b>`, esc(WORK_INFO[w].desc), FIELD_TASKS.includes(w) ? esc(FIELD_INFO[w]) : '-', AREA_JOBS.includes(w) ? esc(AREA_INFO[w]) : '-',
        list((Object.keys(BUILDINGS) as BuildingKind[]).filter((k) => BUILDINGS[k].work === w).map(bl), '-')]);
    const traits = TRAIT_IDS.map((t) => [`<b>${esc(TRAITS[t].name)}</b>`, esc(TRAITS[t].desc)]);
    const petLv: string[][] = [];
    let cum = 0;
    for (let l = 1; l < PET_MAX_LEVEL; l++) { const n = petXpNeed(l); petLv.push([`${l}`, `${n}`, `${cum}`]); cum += n; }
    const stars = AWAKENINGS.map((a, i) => [`${i + 1}`, `${a.lv}`, cost(a.cost), `+${pct(STAR_POWER[i + 1], 0)}`, `+${pct(STAR_WORK[i + 1], 0)}`]);
    const aff = AFFECTION_LEVELS.map((l) => [`<b>${esc(l.name)}</b>`, `${l.at}`, esc(l.line)]);
    const odds = giftOdds(GIFT_AT), odds100 = giftOdds(100);
    const gifts = ([0, 1, 2] as const).map((lv) => [['Small find', 'Nice find', 'Rare treasure'][lv], list(GIFTS[lv].map((g) => `${res(g.item)} ${range(g.min, g.max)}`))]);
    const slots = workSlots(newPlayer('wiki', 'Farmer', 0, 0, 0));
    const slotSkills = SKILL_LIST.filter((n) => n.mods?.creatureSlots).map((n) => `${sl(n.id)} (+${n.mods!.creatureSlots} per rank)`);
    return section('s-creatures', `Creatures (${SPECIES_LIST.length} species)`, intro('creatures')
        + sub('s-catching', 'Catching', p(`Learn ${sl('t_pod')} (Taming) to craft ${il('pod')}s. ${esc(PROSE.pods)}`) + kv([
            ['Pods', list(pods.map((pd) => `${il(pd)} x${POD_POWER[pd]}${RECIPE_LIST.find((r) => r.out === pd)?.req ? ` (${needs(RECIPE_LIST.find((r) => r.out === pd)!.req)})` : ''}`))],
            ['Wild ones', `at most ${TUNING.wildNear} near a farmer at a time (${TUNING.wildNearFairy} on a Fairy Night); a pod reaches ${TUNING.podRange} px`],
            ['Rare ones', `${sl('t_rare')} makes rare creatures show up more`],
        ]))
        + sub('s-species', 'Species', cards(spCards))
        + sub('s-aptitude', 'Work aptitudes at a glance', table(['Species', ...WORK_KINDS.map((w) => esc(WORK_INFO[w].name))], matrix))
        + `<div id="s-jobs"></div>` + sub('s-jobs-sub', 'Jobs, posts, dens and workshops', p(esc(PROSE.jobs)) + p(`You can have ${slots} creatures at work at once, more with ${list(slotSkills)}. A ${bl('den')} houses ${BUILDINGS.den.pets} that work the land around it. Island workers carry what they get to a chest near the middle of the island; machine keepers fetch from and fill the chests within nine tiles.`)
            + table(['Job', 'In short', 'Beside you (field task)', 'On an island (post)', 'Runs'], jobs))
        + `<div id="s-traits"></div>` + sub('s-traits-sub', 'Traits', table(['Trait', 'Effect'], traits))
        + sub('s-petlevels', 'Levels and stars', p(`Creatures level up to ${PET_MAX_LEVEL} by working, fighting and treats. ${esc(PROSE.awakening)}`)
            + table(['Star', 'Needs level', 'Costs', 'Health and attack', 'Work speed'], stars) + `<h4>Creature XP per level</h4>${table(['Level', 'XP to the next', 'Total'], petLv, { cls: 'tall' })}`)
        + sub('s-breeding', 'Breeding', p(esc(PROSE.breeding)) + kv([['Unlock', `learn ${sl('t_breed')} and build a ${bl('hatchery')}`], ['An egg', `${BREED_TREATS} ${il('treat')}s and ${secs(BREED_SECS)} (faster with ${sl('t_nursery')})`]]))
        + sub('s-bond', 'Companion, petting and gifts', p(esc(PROSE.bond)) + kv([['Pets that count', `${PATS_PER_DAY} a day`], ['Gift odds', `from ${GIFT_AT} affection: ${pct(odds.nice, 0)} nice find and ${pct(odds.rare, 0)} rare treasure, rising to ${pct(odds100.nice, 0)} and ${pct(odds100.rare, 0)} at full affection`]])
            + table(['Affection', 'From', 'What it means'], aff) + table(['Gift', 'What it can be'], gifts)));
}

function riftsSection () {
    const rng = new Rng('wiki');
    const abyss = RIFT_TIERS.find((t) => t.endless);
    const guardians: MobKind[] = [];
    if (abyss) for (let w = 5; w <= 40 && guardians.length < 8; w += 5) if (isBossWave(abyss, w)) { const g = waveSpec(abyss.id, w, 1, rng).find((m) => m.guardian); if (g && !guardians.includes(g.kind)) guardians.push(g.kind); }
    const tiers = RIFT_TIERS.map((t) => {
        const rows: [string, string][] = [
            ['Needs', `${t.need ? `${plural(t.need, 'boss')} defeated` : 'nothing'}; meant for level ${t.level}`],
            ['Waves', t.endless ? 'endless: a guardian every fifth wave' : `${t.waves} (the last is the guardian)`],
            ['Monsters', `up to tier ${t.cap}, x${num(t.hpMul)} health, x${num(t.dm)} damage, ${pct(t.elite, 0)} elites at first`],
            ['Guardian', t.endless ? list(guardians.map(ml)) : `${ml(t.guardian)} with x${t.guardianHp} health${t.escorts ? `, with ${ml(t.escorts)} escorts` : ''}`],
        ];
        if (!t.endless) rows.push(['A clear pays', `${range(t.shards[0], t.shards[1])} ${il('rift_shard')}s, ${t.coins} coins, ${t.xp} XP, a ${il(riftCrate(t.id)[0])}${t.loot.length ? `, ${list(t.loot.map(([it, c, lo, hi]) => `${il(it)} ${chanceWords(c, lo, hi)}`))}` : ''}`]);
        else rows.push(['Cash out', list([10, 20, 30].map((w) => { const r = riftReward(t.id, w, new Rng('wiki'), 1); return `wave ${w}: ${r.shards} shards, ${r.coins} coins, ${r.xp} XP (alone)`; }))]);
        rows.push(['First clear', `${plural(t.points, 'skill point')}${t.endless ? ' (a first dive past wave 10)' : ''}`]);
        return card(A.rift(t.id), esc(t.name), `Tier ${t.id + 1}`, kv(rows) + p(`<i>${esc(t.blurb)}</i>`) + phasesTable(t.phases), 'wide');
    });
    const boons = BOONS.map((b) => [`<b id="${A.boon(b.id)}">${esc(b.name)}</b>`, tag(BOON_RARITY[b.rarity], [PAL.pebble, PAL.sea, PAL.gold][b.rarity]), esc(b.desc), modsHtml(b.mods) || '<span class="dim">special</span>']);
    const omens = OMENS.map((o) => [`<b>${esc(o.name)}</b>`, esc(o.desc), `+${pct(o.bonus, 0)}`]);
    return section('s-rifts', 'Expeditions and rifts', intro('rifts')
        + p(`Learn ${sl('x_exped')} (Explorer) and build ${an(BUILDINGS.dock.name, bl('dock'))} by the water. Up to ${RIFT_PARTY_MAX} farmers go together; there are ${RIFT_ISLANDS} rift islands. You have ${RIFT_PICK_SECONDS} s to pick a boon. ${esc(PROSE.rifts)} ${esc(PROSE.abyss)}`)
        + sub('s-tiers', `Tiers (${RIFT_TIERS.length})`, cards(tiers))
        + sub('s-boons', `Boons (${BOONS.length})`, table(['Boon', 'Rarity', 'What it does', 'Bonus'], boons))
        + sub('s-omens', `Omens (${OMENS.length})`, p(`Take up to ${OMEN_MAX} at the dock once you have cleared a rift; each adds to the coins, XP and shards of the run. The rift of the day has two omens on, +${pct(DAILY_BONUS, 0)} on top, and a one-off bonus of shards on its first clear (${list(RIFT_TIERS.filter((t) => !t.endless).map((t) => `${dailyShards(t.id)} for the ${esc(t.name)}`))}).`) + table(['Omen', 'Curse', 'Reward bonus'], omens)));
}

function fishingSection () {
    const fish = FISH.map((f) => [il(f.id), rarityTag(f.rarity), `${f.size[0]}-${f.size[1]} cm`, f.biomes ? list(f.biomes.map(biomeL)) : 'anywhere',
        [f.when ? `by ${f.when}` : '', f.rain ? 'only in the rain' : ''].filter(Boolean).join(', ') || 'any time', f.minRod ? il(RODS[f.minRod].item) : 'any rod', `${f.fight}`, esc(f.hint)]);
    const rods = RODS.map((r) => [il(r.item), `${num(r.wait[0])}-${num(r.wait[1])} s`, `${num(r.window)} s`, `x${num(r.rare)}`, RECIPE_LIST.find((x) => x.out === r.item) ? `${stationL(RECIPE_LIST.find((x) => x.out === r.item)!.station)}` : '']);
    const skills = SKILL_LIST.filter((n) => n.mods && (n.mods.fishSpeed || n.mods.fishLuck)).map((n) => [sl(n.id), modsHtml(n.mods), `${n.max}`]);
    return `<div id="s-fishing"></div>` + section('s-fishing-sec', 'Fishing', intro('fishing') + kv([
        ['Cast', `${CAST_RANGE[0]} to ${CAST_RANGE[1]} px out`], ['Tugs', `answer each within ${TUG_WINDOW} s; ${MAX_STRIKES} slips and it gets away`],
        ['Bait', `${il('bait')}: one per cast`], ['Bottles', `${pct(LUCK.bottle)} of catches bring up a ${il('bottle')} too`],
    ]) + sub('s-fish', `Fish (${FISH.length})`, table(['Fish', 'Rarity', 'Size', 'Where', 'When', 'Rod', 'Fight', 'Hint'], fish))
        + sub('s-rods', 'Rods', table(['Rod', 'Wait for a bite', 'Time to react', 'Rare fish', 'Made at'], rods))
        + sub('s-fishskills', 'Skills', table(['Skill', 'Per rank', 'Ranks'], skills)));
}

function rewardHtml (r: Reward) {
    return list([...(r.coin ? [`<span class="coin">${r.coin} coins</span>`] : []), ...(r.xp ? [`${r.xp} XP`] : []), ...(r.points ? [plural(r.points, 'skill point')] : []), ...rewardItems(r).map(([i, n]) => il(i, n))]);
}

function questsSection () {
    const chapters = CHAPTERS.map((c, i) => card(A.chapter(c.id), `${i + 1}. ${esc(c.title)}`, `Chapter ${i + 1} of ${CHAPTERS.length}`,
        p(`<i>${esc(c.blurb)}</i>`) + `<ol class="obj">${c.objectives.map((o) => `<li><b>${esc(fill(o.text))}</b>${o.opt ? ' <span class="dim">(optional)</span>' : ''}${o.how ? `<br><span class="dim">${esc(fill(o.how))}</span>` : ''}</li>`).join('')}</ol>`
        + kv([['Reward', rewardHtml(c.reward)]]), 'wide'));
    const givers = Object.values(GIVERS).map((g) => {
        const qs = QUESTS.filter((q) => q.giver === g.id);
        return `<h4 id="${A.giver(g.id)}"><span class="bar" style="--t:${hex(g.color)}"></span>${esc(g.name)} <span class="dim">${esc(g.role)}</span></h4>` + cards(qs.map((q) => card(A.quest(q.id), esc(q.title), esc(list([
            q.minLevel ? `from level ${q.minLevel}` : '', q.after ? `after ${QUEST_BY_ID[q.after]?.title ?? q.after}` : '', q.ch !== undefined ? `story chapter ${q.ch + 1}` : '',
        ].filter(Boolean)) || 'open from the start'),
        p(`<i>"${esc(fill(q.offer))}"</i>`) + `<ol class="obj">${q.steps.map((s) => `<li><b>${esc(fill(s.text))}</b>${s.how ? `<br><span class="dim">${esc(fill(s.how))}</span>` : ''}</li>`).join('')}</ol>`
        + kv([['Reward', rewardHtml(q.reward)], ...(q.after ? [['After', link(A.quest(q.after), esc(QUEST_BY_ID[q.after]?.title ?? q.after))] as [string, string]] : [])]))));
    });
    const bounties = BOUNTY_POOL.map((b) => [esc(b.label(b.n[1]).replace(String(b.n[1]), `${b.n[0]}-${b.n[1]}`)), b.item ? il(b.item) : '', `${num(b.coin)} per thing`, b.minLevel ? `${b.minLevel}` : '1']);
    const goals = GOALS.map((g) => [il(g.item), num(g.n), rewardHtml(g.reward)]);
    const medals = MEDALS.map((m) => [`<b>${esc(m.name)}</b>`, esc(m.desc), rewardHtml(m.reward)]);
    return section('s-quests', 'Quests', intro('quests')
        + sub('s-story', `The story (${CHAPTERS.length} chapters)`, p('A finished chapter pays its reward and opens the next one by itself.') + cards(chapters), false)
        + sub('s-sidequests', `Side quests (${QUESTS.length}, from ${Object.keys(GIVERS).length} people)`, givers.join(''), false)
        + sub('s-bounties', 'Daily bounties', p(esc(PROSE.bounties)) + table(['Bounty', 'Item', 'Coins (before the level bonus)', 'From level'], bounties))
        + sub('s-goals', 'Production goals', p(esc(PROSE.goals)) + table(['Item', 'Made', 'Reward'], goals))
        + sub('s-medals', `Medals (${MEDALS.length})`, table(['Medal', 'How', 'Reward'], medals)));
}

function fortuneSection () {
    const crates = CRATE_TIERS.map((t) => {
        const c = CRATES[t];
        return [`<b id="${A.crate(t)}">${il(CRATE_ITEM[t])}</b>`, range(c.rolls[0], c.rolls[1]), c.cls.map((x, i) => (x ? `${esc(RARITY_NAMES[i])} ${num(x)}%` : '')).filter(Boolean).join(', '), `x${num(c.mul)}`, c.floor !== undefined ? esc(RARITY_NAMES[c.floor]) : '-', c.shard ? pct(c.shard, 0) : '-'];
    });
    const pools = (Object.entries(LOOT_POOL)).map(([r, rows]) => {
        const tot = rows.reduce((a, x) => a + x.w, 0);
        return `<h4>${esc(RARITY_NAMES[Number(r)])} class</h4>` + table(['Prize', 'Amount', 'Chance in this class'], rows.map((x) => [res(x.item), range(x.min, x.max), pct(x.w / tot, 1)]));
    });
    const wtot = WHEEL.reduce((a, w) => a + w.w, 0);
    const wheel = WHEEL.map((w) => [`<b>${esc(w.label)}</b>`, pct(w.w / wtot, 1), w.kind === 'coin' || w.kind === 'bust' ? `${num(w.mul ?? 0)} x the stake in coins` : w.kind === 'crate' ? il(CRATE_ITEM[w.crate!]) : w.kind === 'jackpot' ? `${JACKPOT_COIN_MUL} x the stake, and its odds grow by ${pct(WHEEL_JACKPOT_PITY, 0)} with every paid spin that misses` : list((w.items ?? []).map(([i, n]) => res(i, n)))]);
    const luck = kv([
        ['Lucky Find', `${pct(LUCK.strike)} of every node you break (more with luck): coins, something useful, now and then a crate`],
        ['Golden node', `${pct(LUCK.golden)} of the trees, rocks and ore that grow: x${LUCK.goldenMul} drops and a prize`],
        ['Buried treasure', `each owned island has a ${pct(LUCK.bury, 0)} chance each dawn of a mound with a red X; dig it like a rock`],
        ['Monster crates', list(MOB_CRATE.map(([ct, c], i) => `tier ${i}: ${pct(c)} ${esc(CRATES[ct].name)}`))],
        ['Pity', `silver crates and better: after ${CRATE_PITY} without an Epic, the next one holds one`],
    ]);
    return section('s-fortune', 'Luck and loot', intro('fortune')
        + sub('s-crates', 'Crates', table(['Crate', 'Rolls', 'Odds of each class per roll', 'Stack bonus', 'At least one', 'Lantern Shard'], crates) + luck)
        + sub('s-pools', 'What a roll can give', pools.join(''), false)
        + sub('s-wheel', 'The Fortune Wheel', p(esc(PROSE.wheel)) + kv([
            ['Free spin', `one a day, the coin wedges count a stake of ${WHEEL_FREE_STAKE}`], ['Paid spins', list([0, 1, 2, 3, 4].map((n) => `${wheelPrice(n)}`)) + `... up to ${wheelPrice(999)} coins`],
            ['Double or nothing', `${pct(GAMBLE_ODDS, 0)} to win, up to ${GAMBLE_MAX_CHAIN} in a row, at most ${GAMBLE_MAX_COINS} coins`],
        ]) + table(['Wedge', 'Odds', 'Prize'], wheel))
        + `<div id="s-trader"></div>` + sub('s-trader-sub', 'The travelling trader', p(esc(PROSE.trader)) + table(['Item', 'From day', 'Stock', 'Price'], TRADER_POOL.map((t) => [il(t.item), `${t.minDay}`, range(t.n[0], t.n[1]), `about ${num(t.mul)} x its market price, rising a little as the days go by`]))));
}

function multiplayerSection () {
    return `<div id="s-multiplayer"></div>` + section('s-multi', 'Multiplayer and servers', intro('multiplayer') + p(esc(PROSE.servers))
        + sub('s-coopplay', 'Playing together', ul([
            `Up to ${MAX_PLAYERS} farmers per world. Farmers within ${TUNING.partyRange} px count as a party for how hard the night is.`,
            `A downed friend is picked up by holding E beside them for ${TUNING.reviveSeconds} s.`,
            'Chat with Enter, emotes with G then 1 to 8, ping a spot with the middle mouse button (or Alt+click).',
            'Waystones (Explorer: Waystones) let everybody step between them.',
            'The Journal\'s Chronicle tab is the story of your farm, written as it happens and shared by everybody.',
        ]))
        + `<div id="s-hearth"></div>` + sub('s-hearth-sub', 'The evening hearth', p(esc(PROSE.hearth)) + kv([
            ['Where', list(Object.keys(HEARTH_SPOTS).map((k) => bl(k as BuildingKind)))], ['Kindling', `${TUNING.hearthFill} s of sitting together in the dusk countdown`],
            ['Hearthside', `${modsHtml(BUFFS.hearth.mods)}, a heart every ${TUNING.hearthHealEvery} s, until dawn`],
        ]))
        + sub('s-potluck', 'The potluck table', p(esc(PROSE.potluck)) + kv([['Dishes', `${TUNING.tableDishes} different, ${TUNING.tablePortions} portions each`], ['Feasting', `once every ${TUNING.feastCooldown} s per farmer, within ${TUNING.feastRange} tiles`]]))
        + sub('s-mail', 'Mailbox and postcards', p(esc(PROSE.mail)) + kv([['A parcel', `up to ${PARCEL_STACKS} kinds of things and a note of up to ${NOTE_MAX} letters`], ['Waiting post', `up to ${MAIL_CAP} letters, ${PER_SENDER} from the same friend`], ['Postcards', `the newest ${POSTCARDS_KEPT} are kept`]]))
        + sub('s-wish-vote', 'The season wish', p(esc(PROSE.wish)) + p(`See ${link('s-wishes', 'every wish')}.`)));
}

function buffsSection () {
    const ids = (Object.keys(BUFFS) as BuffId[]).filter((b) => !b.startsWith('dev'));
    const cs = ids.flatMap((b) => {
        const items = ITEM_ORDER.filter((i) => ITEMS[i].buff?.id === b);
        const srcs = [...items.map((i) => `${il(i)} (${secs(ITEMS[i].buff!.secs)})`), ...(BUFF_SOURCES[b] ? [esc(BUFF_SOURCES[b])] : [])];
        if (!srcs.length) return [];
        return [card(A.buff(b), esc(BUFFS[b].name), esc(BUFFS[b].desc), kv([['Effect', modsHtml(BUFFS[b].mods)], ['From', list(srcs)]]))];
    });
    return section('s-buffs', 'Buffs', intro('buffs') + cards(cs));
}

function statsSection () {
    const rows = STAT_KEYS.map((k) => {
        const from = [
            ...SKILL_LIST.filter((n) => n.mods?.[k]).map((n) => sl(n.id)),
            ...ITEM_ORDER.filter((i) => ITEMS[i].gear?.mods?.[k]).map((i) => il(i)),
            ...(Object.keys(BUFFS) as BuffId[]).filter((b) => !b.startsWith('dev') && BUFFS[b].mods[k] && document_has_source(b)).map(buffL),
            ...BOONS.filter((b) => b.mods?.[k]).map((b) => link(A.boon(b.id), esc(b.name))),
            ...WISHES.filter((w) => w.mods[k]).map((w) => link('s-wishes', esc(w.name))),
        ];
        return [`<b id="${A.stat(k)}">${esc(STAT_INFO[k].label)}</b>`, `<code>${k}</code>`, from.length > 18 ? `<details class="more"><summary>${from.length} sources</summary>${list(from)}</details>` : list(from, '-')];
    });
    return section('s-stats', 'Stat glossary', intro('stats') + table(['Stat', 'Key', 'Comes from'], rows));
}
/** A buff something in the game actually hands out (the rest are kept out of the page). */
function document_has_source (b: BuffId) { return !!BUFF_SOURCES[b] || ITEM_ORDER.some((i) => ITEMS[i].buff?.id === b); }

function guideSection () {
    const g = (s: Parameters<typeof guideText>[0]) => esc(guideText(s, false, { move: 'WASD', fish: 'Q' }));
    const topics = GUIDE.map((t) => sub(A.guide(t.id), t.name, p(`<i>${esc(t.blurb)}</i>`) + `<ol class="steps">${t.steps.map((s) => `<li class="f">${g(s)}</li>`).join('')}</ol>${t.tips.length ? `<h5>Tips</h5>${ul(t.tips.map(g))}` : ''}`, false));
    const tips = TIPS.map((t) => [`<b>${esc(t.title)}</b>`, esc(t.text)]);
    return section('s-guide', 'How to play (the in-game guide)', intro('guide') + topics.join('') + sub('s-tips', `Progression tips (${TIPS.length})`, intro('tips') + table(['Tip', 'What it says'], tips), false));
}

// ── the page ────────────────────────────────────────────────────────────────
const CSS = `
@font-face{font-family:Fredoka;src:url(../play/fonts/Fredoka.ttf) format("truetype");font-display:swap}
@font-face{font-family:"Pixelify Sans";src:url(../play/fonts/PixelifySans.ttf) format("truetype");font-display:swap}
:root{--bg:${hex(PAL.cream)};--panel:${hex(PAL.snow)};--ink:${hex(PAL.ink)};--dim:${hex(PAL.slate)};--line:${hex(PAL.sand)};--head:${hex(PAL.pine)};--link:${hex(PAL.deepSea)};
--accent:${hex(PAL.bark)};--hl:${hex(PAL.gold)};--chip:${hex(PAL.sand)};--bar:${hex(PAL.leaf)};color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:${hex(PAL.ink)};--panel:${hex(PAL.night)};--ink:${hex(PAL.cream)};--dim:${hex(PAL.pebble)};--line:${hex(PAL.dusk)};
--head:${hex(PAL.lime)};--link:${hex(PAL.foam)};--accent:${hex(PAL.gold)};--hl:${hex(PAL.plum)};--chip:${hex(PAL.dusk)};color-scheme:dark}}
:root[data-theme=dark]{--bg:${hex(PAL.ink)};--panel:${hex(PAL.night)};--ink:${hex(PAL.cream)};--dim:${hex(PAL.pebble)};--line:${hex(PAL.dusk)};
--head:${hex(PAL.lime)};--link:${hex(PAL.foam)};--accent:${hex(PAL.gold)};--hl:${hex(PAL.plum)};--chip:${hex(PAL.dusk)};color-scheme:dark}
*{box-sizing:border-box}
html{scroll-padding-top:76px}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-wrap:anywhere}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
h1,h2,h3,h4,h5{font-family:Fredoka,system-ui,sans-serif;font-weight:600;color:var(--head);margin:0}
header.top{position:sticky;top:0;z-index:20;background:${hex(PAL.bark)};color:${hex(PAL.cream)};display:flex;gap:10px;align-items:center;padding:8px 16px;box-shadow:0 2px 0 rgba(0,0,0,.15)}
header.top h1{font-family:"Pixelify Sans",Fredoka,sans-serif;color:${hex(PAL.gold)};font-size:22px;white-space:nowrap}
header.top h1 a{color:inherit}
header.top .grow{flex:1;min-width:0;display:flex;gap:8px;align-items:center}
#q{flex:1;min-width:0;max-width:520px;font:inherit;padding:7px 12px;border-radius:999px;border:2px solid ${hex(PAL.wood)};background:${hex(PAL.snow)};color:${hex(PAL.ink)}}
#count{font-size:12px;white-space:nowrap;opacity:.9}
.btn{font:600 13px Fredoka,system-ui,sans-serif;border:0;border-radius:8px;padding:6px 10px;background:${hex(PAL.gold)};color:${hex(PAL.ink)};cursor:pointer;white-space:nowrap}
.btn.ghost{background:transparent;color:${hex(PAL.cream)};border:1px solid rgba(255,246,224,.5)}
#tocbtn,#tocclose{display:none}
.wrap{display:grid;grid-template-columns:250px minmax(0,1fr);gap:24px;max-width:1280px;margin:0 auto;padding:16px}
nav.toc{position:sticky;top:64px;align-self:start;max-height:calc(100vh - 80px);overflow:auto;font-size:13px;padding-right:6px}
nav.toc ol{list-style:none;margin:0;padding:0}nav.toc>ol>li{margin:6px 0}nav.toc>ol>li>a{font-family:Fredoka,system-ui,sans-serif;font-weight:600;color:var(--head)}
nav.toc ol ol{padding-left:10px;border-left:2px solid var(--line);margin:2px 0 4px}nav.toc ol ol a{color:var(--dim)}
main{min-width:0}
.hero{background:var(--panel);border:2px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:16px}
.hero p{margin:6px 0}.hero .stats{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
details.sec{background:var(--panel);border:2px solid var(--line);border-radius:14px;margin:0 0 16px;padding:0 16px}
details.sec>summary{cursor:pointer;padding:12px 0;list-style:none}details.sec>summary::-webkit-details-marker{display:none}
details.sec>summary h2{display:inline;font-size:24px}
details>summary h2::before,details>summary h3::before{content:"\\25B8";display:inline-block;width:1em;color:var(--accent);transition:transform .15s}
details[open]>summary h2::before,details[open]>summary h3::before{transform:rotate(90deg)}
details.sub{border-top:1px dashed var(--line);padding:2px 0}details.sub>summary{cursor:pointer;padding:8px 0;list-style:none}details.sub>summary::-webkit-details-marker{display:none}
details.sub>summary h3{display:inline;font-size:18px}
.sb{padding-bottom:12px}h4{font-size:16px;margin:14px 0 6px}h5{font-size:13px;margin:10px 0 2px;text-transform:uppercase;letter-spacing:.04em;color:var(--dim)}
p{margin:8px 0}ul,ol{margin:6px 0;padding-left:22px}
.dim{color:var(--dim);font-size:.92em}
.tw{overflow-x:auto;margin:8px 0;border:1px solid var(--line);border-radius:10px;max-width:100%}
.tw.tall{max-height:420px;overflow-y:auto}
table{border-collapse:collapse;width:100%;font-size:13.5px;overflow-wrap:normal}
td:first-child{min-width:7em}
th{position:sticky;top:0;background:var(--chip);text-align:left;font-family:Fredoka,system-ui,sans-serif;font-weight:600;padding:6px 8px;white-space:nowrap}
td{padding:6px 8px;border-top:1px solid var(--line);vertical-align:top}
tbody tr:nth-child(even) td{background:color-mix(in srgb,var(--chip) 25%,transparent)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin:10px 0}
.card{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:10px 12px;min-width:0}
.card.key{border:2px solid ${hex(PAL.gold)}}.card.wide{grid-column:1/-1}
.card header h4{margin:0;font-size:17px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.card .meta{font-size:12.5px;color:var(--dim);margin-top:2px}
.card p{margin:6px 0}
dl.kv{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:3px 10px;margin:8px 0;font-size:13.5px}
dl.kv dt{color:var(--dim);font-weight:600}dl.kv dd{margin:0;min-width:0}
.sw{display:inline-block;width:11px;height:11px;border-radius:3px;background:var(--c);box-shadow:0 0 0 2px var(--r);margin:0 5px 0 2px;vertical-align:-1px;flex:none}
a.il{white-space:nowrap}
.tag{display:inline-block;font-size:11.5px;font-weight:600;padding:0 7px;border-radius:999px;background:color-mix(in srgb,var(--t) 30%,transparent);border:1px solid var(--t);color:var(--ink);white-space:nowrap}
.bar{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--t);margin-right:6px}
.mod{display:inline-block;background:var(--chip);border-radius:6px;padding:0 6px;margin:1px 2px 1px 0;font-size:12.5px}
.coin{color:${hex(PAL.pumpkin)};font-weight:600}
.pat{display:inline-block;background:var(--chip);border-radius:6px;padding:0 6px;margin:1px 0;font-family:ui-monospace,monospace;font-size:12px;cursor:help}
kbd{font:600 12px ui-monospace,monospace;background:var(--chip);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;white-space:nowrap}
code{font-size:12px}
.dots{color:${hex(PAL.pumpkin)};letter-spacing:1px;white-space:nowrap}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}.two>div{min-width:0}
.lbl{color:var(--accent)}
ol.steps li,ol.obj li{margin:5px 0}
.plan{display:grid;gap:2px;margin:6px 0 4px;max-width:100%;overflow-x:auto}
.pc{background:var(--c);color:${hex(PAL.ink)};border-radius:4px;font:700 10px/22px ui-monospace,monospace;text-align:center;overflow:hidden;white-space:nowrap}
details.more>summary{cursor:pointer;color:var(--link);font-size:13px}
.flash{animation:flash 1.6s ease-out}@keyframes flash{0%{box-shadow:0 0 0 4px var(--hl)}100%{box-shadow:0 0 0 4px transparent}}
#none{display:none;padding:24px;text-align:center;color:var(--dim)}
footer{max-width:1280px;margin:0 auto;padding:8px 16px 40px;color:var(--dim);font-size:12.5px}
[hidden]{display:none!important}
body.searching .hero{display:none}
@media (max-width:900px){
 .wrap{grid-template-columns:minmax(0,1fr);padding:12px 16px}
 html{scroll-padding-top:112px}
 #tocbtn{display:inline-block}#openall,#theme{display:none}
 #tocclose{display:block;margin:0 0 12px auto}
 nav.toc{display:none;position:fixed;top:0;left:0;right:0;bottom:0;max-height:none;z-index:40;background:var(--panel);padding:16px;font-size:15px}
 body.toc-open nav.toc{display:block}
 .two{grid-template-columns:minmax(0,1fr)}
 .cards{grid-template-columns:minmax(0,1fr)}
 header.top{padding:8px 12px;gap:8px;flex-wrap:wrap}header.top h1{font-size:18px;flex:1}
 header.top .grow{order:3;flex-basis:100%}#q{max-width:none}
 #count{display:none}
 details.sec{padding:0 12px}
}
`;

const JS = `
(function(){
var q=document.getElementById('q'),count=document.getElementById('count'),none=document.getElementById('none');
var entries=[].slice.call(document.querySelectorAll('.f')),text=entries.map(function(e){return e.textContent.toLowerCase()});
var groups=[].slice.call(document.querySelectorAll('details.sec,details.sub'));
groups.forEach(function(d){d.dataset.o=d.open?'1':''});
var tables=[].slice.call(document.querySelectorAll('.tw'));
var timer;
function run(){
 var words=q.value.toLowerCase().trim().split(/\\s+/).filter(Boolean);
 if(!words.length){entries.forEach(function(e){e.hidden=false});tables.forEach(function(t){t.hidden=false});groups.forEach(function(d){d.hidden=false;d.open=!!d.dataset.o});count.textContent='';none.style.display='none';document.body.classList.remove('searching');return}
 document.body.classList.add('searching');
 var n=0;entries.forEach(function(e,i){var ok=words.every(function(w){return text[i].indexOf(w)>=0});e.hidden=!ok;if(ok)n++});
 tables.forEach(function(t){var rows=t.querySelectorAll('tbody tr.f');if(rows.length){var any=false;for(var i=0;i<rows.length;i++)if(!rows[i].hidden){any=true;break}t.hidden=!any}});
 groups.forEach(function(d){var has=d.querySelector('.f:not([hidden])');if(!d.querySelector('.f')){var t=d.textContent.toLowerCase();has=words.every(function(w){return t.indexOf(w)>=0})}d.hidden=!has;if(has)d.open=true});
 count.textContent=n+' match'+(n===1?'':'es');none.style.display=n?'none':'block';
}
q.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(run,90)});
document.addEventListener('keydown',function(e){if(e.key==='/'&&document.activeElement!==q){e.preventDefault();q.focus()}if(e.key==='Escape'&&document.activeElement===q){q.value='';run()}});
function reveal(id,scroll){var el=document.getElementById(id);if(!el)return;
 if(el.hidden||el.closest('[hidden]')){q.value='';run()}
 for(var d=el.closest('details');d;d=d.parentElement&&d.parentElement.closest('details'))d.open=true;
 if(scroll)el.scrollIntoView({block:'start'});el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash')}
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href^="#"]');if(!a)return;var id=decodeURIComponent(a.getAttribute('href').slice(1));if(!id)return;
 e.preventDefault();document.body.classList.remove('toc-open');history.pushState(null,'','#'+id);reveal(id,true)});
window.addEventListener('hashchange',function(){reveal(decodeURIComponent(location.hash.slice(1)),true)});
if(location.hash)setTimeout(function(){reveal(decodeURIComponent(location.hash.slice(1)),true)},0);
document.getElementById('tocbtn').addEventListener('click',function(){document.body.classList.toggle('toc-open')});
document.getElementById('tocclose').addEventListener('click',function(){document.body.classList.remove('toc-open')});
document.getElementById('openall').addEventListener('click',function(){var open=this.dataset.s!=='1';groups.forEach(function(d){if(!d.hidden)d.open=open});this.dataset.s=open?'1':'';this.textContent=open?'Close all':'Open all'});
var tb=document.getElementById('theme');tb.addEventListener('click',function(){var r=document.documentElement,dark=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;r.dataset.theme=dark?'light':'dark';try{localStorage.setItem('afwiki_theme',r.dataset.theme)}catch(_){}});
try{var t=localStorage.getItem('afwiki_theme');if(t)document.documentElement.dataset.theme=t}catch(_){}
})();
`;

/** The whole page, as a string: the same every time for the same game data. */
export function buildWiki (): string {
    toc = [];
    SRC.clear(); USE.clear();
    buildIndexes();
    const body = [
        startHere(), progression(), unlocksSection(), skillsSection(), itemsSection(), craftingSection(), buildingsSection(), farmingSection(), factorySection(),
        worldSection(), combatSection(), creaturesSection(), riftsSection(), fishingSection(), questsSection(), fortuneSection(), multiplayerSection(),
        buffsSection(), statsSection(), guideSection(),
    ].join('\n');
    const nav = `<ol>${toc.map((t) => `<li><a href="#${t.id}">${esc(t.title)}</a>${t.subs.length ? `<ol>${t.subs.map((s) => `<li><a href="#${s.id}">${s.title}</a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>`;
    const stat = (n: number, w: string) => tag(`${n} ${w}`, PAL.wood);
    const hero = `<div class="hero"><p>${esc(SITE.blurb)}</p><p>Search for anything above (press <kbd>/</kbd>), or open a section from the contents. Every name is a link.</p>
<div class="stats">${stat(ITEM_ORDER.length, 'items')}${stat(RECIPE_LIST.length, 'recipes')}${stat(BUILD_ORDER.length, 'buildings')}${stat(SKILL_LIST.length, 'skills')}${stat(SPECIES_LIST.length, 'creatures')}${stat(WILD_KINDS.length, 'monsters')}${stat(BOSS_ORDER.length, 'bosses')}${stat(CHAPTERS.length, 'chapters')}${stat(QUESTS.length, 'side quests')}${stat(MEDALS.length, 'medals')}</div></div>`;
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(SITE.title)}</title>
<meta name="description" content="${esc(SITE.tagline)}">
<link rel="icon" href="../play/favicon.png">
<style>${CSS}</style>
</head>
<body>
<header class="top"><h1><a href="#top">${esc(SITE.title)}</a></h1><div class="grow"><input id="q" type="search" placeholder="Search items, skills, creatures..." aria-label="Search the wiki" autocomplete="off"><span id="count"></span></div>
<button class="btn ghost" id="tocbtn" type="button">Contents</button><button class="btn ghost" id="openall" type="button">Open all</button><button class="btn ghost" id="theme" type="button" aria-label="Switch between light and dark">Theme</button><a class="btn" href="${SITE.play}">Play</a></header>
<div class="wrap" id="top"><nav class="toc" aria-label="Contents"><button class="btn" id="tocclose" type="button">Close</button>${nav}</nav>
<main>${hero}<div id="none">Nothing matches that. Try another word.</div>
${body}
</main></div>
<footer>Generated from the game's own data by scripts/wiki.ts. ${esc(SITE.tagline)}</footer>
<script>${JS}</script>
</body>
</html>
`;
    if (/—/.test(html)) throw new Error('the wiki must not contain an em dash');
    return html;
}

if (process.argv.includes('--write')) {
    const out = join(__dirname, '..', 'wiki', 'index.html');
    const html = buildWiki();
    writeFileSync(out, html);
    console.log(`wrote ${out} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
}

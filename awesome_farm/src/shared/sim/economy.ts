// Player actions that move things around: building, crafting, gear, food, trade, skills.

import { TILE, TUNING } from '../config';
import { BIOME_DEFS, MODS } from '../data/biomes';
import { BUILDINGS, BuildingKind, isBeltLike, SEED_IDS } from '../data/buildings';
import { GearSlot, ITEM_ORDER, ITEMS, ItemId, Res } from '../data/items';
import { RECIPES } from '../data/recipes';
import { SKILLS, UNLOCK_INFO } from '../data/skills';
import { PAL } from '../palette';
import { BLUEPRINT_MAX, BLUEPRINT_RANGE } from '../blueprint';
import { chuteSells } from './chute';
import { tunnelPartner } from './factory';
import * as bed from './bed';
import * as chronicle from './chronicle';
import * as defense from './defense';
import * as gather from './gather';
import * as mail from './mail';
import * as potluck from './potluck';
import * as machines from './machines';
import * as mines from './mines';
import * as quests from './quests';
import * as shop from './shop';
import type { Sim } from './sim';
import { isUber } from './uber';
import { ensureVeins } from './worldgen';
import {
    addItem, addRes, canAfford, canLearn, countOf, derived, hasUnlock, itemCap, learnSkill, MAX_LEVEL, pay, scaledCost, sellValue, takeItem, xpToNext,
} from './stats';
import type { BuildE, Cmd, PlayerS } from './types';

const STATIONS = new Set(['hand', 'workbench', 'anvil', 'kitchen', 'loom', 'alchemy', 'altar', 'riftforge']);

// ── buildings ──────────────────────────────────────────────────────────────
type BuildResult = { ok: true; b: BuildE } | { ok: false; why: string; silent?: boolean };

const isWallOrGate = (sim: Sim, tx: number, ty: number) => { const e = sim.s.ents[sim.world.occAt(tx, ty) || sim.world.softAt(tx, ty)]; return e?.k === 'bld' && (!!BUILDINGS[e.kind].wall || !!BUILDINGS[e.kind].gate); };
/** Which way a doorway set into a wall should face: across a wall that runs north-south, along one that runs east-west. */
const doorwayRot = (sim: Sim, tx: number, ty: number) => ((isWallOrGate(sim, tx, ty - 1) || isWallOrGate(sim, tx, ty + 1)) && !isWallOrGate(sim, tx - 1, ty) && !isWallOrGate(sim, tx + 1, ty) ? 1 : 0);

/** Place one building if every rule allows it. `range` is how far (in tiles) from the player it may be. */
export function tryBuild (sim: Sim, p: PlayerS, kind: BuildingKind, tx: number, ty: number, rot: number, range?: number): BuildResult {
    const def = BUILDINGS[kind];
    if (!def || !Number.isInteger(tx) || !Number.isInteger(ty)) return { ok: false, why: '', silent: true };
    if (def.hidden) return { ok: false, why: '', silent: true };
    if (!hasUnlock(p, def.req)) return { ok: false, why: 'Locked — learn it in the skill tree' };
    const [w, h] = def.size;
    let replace: BuildE | null = null;
    if (sim.world.riftAtTile(tx, ty) >= 0) return { ok: false, why: "Can't build there" };
    const ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
    if (Math.max(Math.abs(tx - ptx), Math.abs(ty - pty)) > (range ?? TUNING.buildRange + Math.max(w, h))) return { ok: false, why: 'Too far away', silent: true };
    if (def.roof) {
        if (!sim.world.isLand(tx, ty) || sim.world.roofAt(tx, ty) !== 0) return { ok: false, why: "Can't build there" };
    } else if (def.floor) {
        const ok = sim.world.isLand(tx, ty) && sim.world.occAt(tx, ty) === 0 && sim.world.floorAt(tx, ty) === 0;
        if (!ok) return { ok: false, why: "Can't build there" };
    } else {
        // a doorway can be set straight into a piece of wall: the wall comes down (and is given back) as the doorway goes in
        const wallHere = def.gate && w === 1 && h === 1 ? sim.s.ents[sim.world.occAt(tx, ty)] : undefined;
        if (wallHere?.k === 'bld' && BUILDINGS[wallHere.kind].wall) replace = wallHere; else replace = null;
        const onBelt = () => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const f = sim.s.ents[sim.world.floorAt(tx + x, ty + y)]; if (f?.k === 'bld' && isBeltLike(f.kind)) return true; } return false; };
        if (!replace && (!sim.world.rectFree(tx, ty, w, h) || onBelt())) return { ok: false, why: "Can't build there" };
        if (def.solid !== false && !def.walk) {
            const blocks = sim.online.some((q) => q.x + 4 > tx * TILE && q.x - 4 < (tx + w) * TILE && q.y > ty * TILE && q.y - 3 < (ty + h) * TILE);
            if (blocks) return { ok: false, why: "Someone's standing there" };
        }
    }
    const cost = scaledCost(p, def.cost);
    if (!canAfford(p, cost)) return { ok: false, why: 'Not enough materials' };
    pay(p, cost);
    if (replace) {
        const rc = sim.center(replace);
        for (const [res, n] of Object.entries(BUILDINGS[replace.kind].cost) as [Res, number][]) if (res !== 'coin') sim.give(p, res, n, rc.x, rc.y);
        sim.remove(replace.id);
        rot = doorwayRot(sim, tx, ty);
    }
    const b = sim.add<BuildE>({
        k: 'bld', kind, tx, ty, rot: rot & 3, by: p.id,
        ...(def.storage ? { inv: {} } : {}),
        ...(def.proc ? { inv: {}, out: {}, fuel: 0, prog: 0 } : {}),
        ...(def.fuel && !def.proc ? { fin: {}, fuel: 0 } : {}),
        ...(kind === 'drill' ? { out: {}, prog: 0 } : {}),
        ...(isBeltLike(kind) ? { belt: [null, null, null] } : {}),
        ...(kind === 'bed' ? { crop: -1 } : {}),
    });
    if (kind === 'sleepbed') bed.setBed(sim, p, b);           // (a new bed is where you wake up now)
    p.stats.built++;
    quests.count(p, `build:${kind}`);
    sim.gainXp(p, 4 + Math.min(10, Object.keys(def.cost).length * 2));
    if (kind === 'mill') {
        const c = sim.center(b);
        sim.fx('win', c.x, c.y - 20, p.id);
        sim.banner('The Golden Windmill turns!', `${p.name} raised a wonder of the farm`, PAL.gold);
        chronicle.note(sim, 'mill', `${p.name} raised the Golden Windmill, and it began to turn.`, 'k_gear');
    }
    return { ok: true, b };
}

export function cmdBuild (sim: Sim, p: PlayerS, kind: BuildingKind, tx: number, ty: number, rot: number) {
    const r = tryBuild(sim, p, kind, tx, ty, rot);
    if (!r.ok) { if (!r.silent) sim.deny(p, r.why); return; }
    const c = sim.center(r.b);
    sim.fx('build', c.x, c.y, p.id);
}

/**
 * Place a whole saved layout around an anchor tile: every piece obeys the ordinary build rules
 * and costs its ordinary price, and the settings (filters, recipes) come along. Pieces that do
 * not fit are skipped; running out of materials stops it. One sound, one summary.
 */
export function cmdBlueprint (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'bp' }>) {
    if (!Array.isArray(c.items) || !c.items.length || c.items.length > BLUEPRINT_MAX || !Number.isInteger(c.tx) || !Number.isInteger(c.ty)) return;
    const ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
    if (Math.max(Math.abs(c.tx - ptx), Math.abs(c.ty - pty)) > BLUEPRINT_RANGE) { sim.deny(p, 'Too far away: step closer'); return; }
    let placed = 0, blocked = 0, locked = 0, broke = false, last: BuildE | null = null;
    for (const it of c.items) {
        if (!it || !BUILDINGS[it.kind] || !Number.isInteger(it.dx) || !Number.isInteger(it.dy) || Math.abs(it.dx) > 60 || Math.abs(it.dy) > 60) continue;
        const r = tryBuild(sim, p, it.kind, c.tx + it.dx, c.ty + it.dy, Number.isInteger(it.rot) ? it.rot : 0, BLUEPRINT_RANGE + 6);
        if (!r.ok) {
            if (r.why === 'Not enough materials') { broke = true; break; }
            if (r.why.startsWith('Locked')) locked++; else blocked++;
            continue;
        }
        placed++; last = r.b;
        if (it.flt !== undefined && (r.b.kind === 'inserter' || r.b.kind === 'sorter' || (r.b.kind === 'chute' && chuteSells(it.flt))) && ITEMS[it.flt]) r.b.flt = it.flt;
        if (it.sel && BUILDINGS[r.b.kind].proc === 'assembler' && RECIPES[it.sel]?.station === 'assembler') r.b.sel = it.sel;
    }
    if (last) {
        const at = sim.center(last);
        sim.fx('build', at.x, at.y, p.id, 0.9 + Math.min(0.5, placed * 0.02));
    }
    const total = c.items.length;
    const notes = [broke ? 'ran out of materials' : '', blocked ? `${blocked} did not fit` : '', locked ? `${locked} still locked` : ''].filter(Boolean).join(' · ');
    if (placed === total) sim.float(p.x, p.y - 26, `Built ${placed} pieces`, PAL.lime, p.id);
    else if (placed) sim.banner(`Built ${placed} of ${total}`, notes, PAL.gold, p.id);
    else sim.deny(p, notes || 'Nothing could be placed there');
}

export function cmdDemolish (sim: Sim, p: PlayerS, id: number) {
    const b = sim.s.ents[id];
    if (!b || b.k !== 'bld' || !sim.inReach(p, b, derived(p).reach + 30)) return;
    const def = BUILDINGS[b.kind];
    if (def.hidden && !def.grave) return;                                   // (a ladder goes with its shaft; a lost backpack can be emptied by taking it down)
    const c = sim.center(b);
    if (b.kind === 'table') potluck.dismantle(sim, p, b);        // (the dishes go back to their cooks)
    // contents and a share of the materials come back
    if (isUber(b)) sim.toast(p.id, 'The Uber Chest\'s store stays safe: every other Uber Chest still opens it', 'chest_b', PAL.gold);
    for (const part of [isUber(b) ? undefined : b.inv, b.out, b.fin]) {
        for (const [item, n] of Object.entries(part ?? {}) as [ItemId, number][]) sim.give(p, item, n, c.x, c.y);
    }
    for (const it of [...(b.belt ?? []), b.hand]) if (it) sim.give(p, it, 1, c.x, c.y);
    for (const [res, n] of Object.entries(def.cost) as [Res, number][]) {
        if (res !== 'coin') sim.give(p, res, Math.floor(n * 0.6), c.x, c.y);
    }
    sim.fx('collect', c.x, c.y, p.id);
    sim.remove(b.id);
}

// ── land ───────────────────────────────────────────────────────────────────
export function cmdBuy (sim: Sim, p: PlayerS, plotIndex: number) {
    const plot = Number.isInteger(plotIndex) ? sim.s.plots[plotIndex] : undefined;      // (an array answers `plots['length']` with a number)
    if (plot?.blight === 1) { sim.deny(p, 'Destroy the Blight nest first'); return; }
    if (!plot || !sim.world.isPurchasable(plot)) return;
    const price = Math.max(1, Math.round(sim.world.price(plot, p.plotsBought) * derived(p).landMul));
    if (p.coins < price) { sim.deny(p, `Needs ${price} coins`); return; }
    p.coins -= price;
    p.plotsBought++;
    quests.count(p, 'buy');
    chronicle.land(sim, p);
    plot.owned = true;
    plot.buyer = p.id;
    delete plot.blight;                                   // (a cleansed nest isle is ordinary land from now on)
    ensureVeins(sim.s.seed, plot);
    sim.world.recompute();
    sim.dirtyPlots.add(plot.i);
    const c = sim.world.plotCenter(plot);
    sim.fx('buyLand', c.x, c.y, p.id);
    const name = BIOME_DEFS[plot.biome].name + (plot.mod ? ` · ${MODS[plot.mod].name}` : '');
    sim.banner(name, `${p.name} raised new land${plot.mod ? ' — ' + MODS[plot.mod].desc : ''}`, BIOME_DEFS[plot.biome].color);
    gather.populate(sim, plot, false, sim.online.map((q) => ({ x: q.x, y: q.y })));
    sim.gainXp(p, 10);
    const groups = sim.countHomeGroups();
    if (groups < sim.homeGroups) {
        sim.fx('win', c.x, c.y, p.id);
        sim.banner('Lands connected!', 'You can walk to each other now', PAL.gold);
        chronicle.note(sim, `lands:${groups}`, `${p.name}'s land reached another island: the farm grew together.`, 'k_flag');
    }
    sim.homeGroups = groups;
    quests.checkMeet(sim);
}

// ── using buildings ────────────────────────────────────────────────────────
export function cmdUse (sim: Sim, p: PlayerS, id: number, seed?: ItemId) {
    const b = sim.s.ents[id];
    if (b?.k === 'bld' && b.kind === 'table') { potluck.use(sim, p, b); return; }       // (a potluck table: its own range, a few tiles)
    if (!b || b.k !== 'bld' || !sim.inReach(p, b, derived(p).reach + 20)) return;
    const def = BUILDINGS[b.kind];
    const c = sim.center(b);
    if (b.kind === 'waystone') { shop.openWaystone(sim, p, b); return; }
    if (b.kind === 'mineshaft') { mines.descend(sim, p, b); return; }
    if (b.kind === 'mineladder') { mines.ascend(sim, p, b); return; }
    if (b.kind === 'mailbox') { mail.open(sim, p, b); return; }
    if (b.kind === 'den') { sim.events.push({ e: 'open', to: p.id, ui: 'den', id: b.id }); return; }
    if (b.kind === 'altar') { sim.events.push({ e: 'open', to: p.id, ui: 'altar', id: b.id }); return; }
    if (b.kind === 'hatchery') { sim.events.push({ e: 'open', to: p.id, ui: 'hatchery', id: b.id }); return; }
    if (b.kind === 'dock') { sim.events.push({ e: 'open', to: p.id, ui: 'dock', id: b.id }); return; }
    if (b.kind === 'fortune') { sim.events.push({ e: 'open', to: p.id, ui: 'fortune', id: b.id }); return; }
    if (def.station) { sim.events.push({ e: 'open', to: p.id, ui: 'station', id: b.id }); return; }
    if (def.proc) { sim.events.push({ e: 'open', to: p.id, ui: 'proc', id: b.id }); return; }
    if (def.storage || def.grave) { sim.events.push({ e: 'open', to: p.id, ui: 'chest', id: b.id }); return; }
    if (b.kind === 'tunnel' || b.kind === 'tunnelx') {
        const other = tunnelPartner((tx, ty) => { const id = sim.world.occAt(tx, ty) || sim.world.floorAt(tx, ty); const f = id ? sim.s.ents[id] : null; return f && f.k === 'bld' ? f : null; }, b);
        sim.float(c.x, c.y - 12, other ? `Linked: ${Math.abs(other.tx - b.tx) + Math.abs(other.ty - b.ty)} tiles` : b.kind === 'tunnel' ? 'No exit ahead' : 'No entrance behind', other ? PAL.lime : PAL.berry, p.id);
        return;
    }
    if (b.kind === 'sleepbed') { bed.setBed(sim, p, b); return; }
    if (def.hp && !def.tower && !def.spike) { if (b.hp !== undefined) defense.repair(sim, p, b); return; }       // (using a hurt wall or doorway mends it for materials)
    if (def.tower || def.spike) { sim.events.push({ e: 'open', to: p.id, ui: 'tower', id: b.id }); return; }
    if (b.kind === 'weathervane') { sim.events.push({ e: 'open', to: p.id, ui: 'vane', id: b.id }); return; }       // (it only shows: nothing changes)
    if (def.dir || def.pole || def.gen || def.store || b.kind === 'drill' || b.kind === 'chute') { if (b.kind !== 'belt') sim.events.push({ e: 'open', to: p.id, ui: 'device', id: b.id }); return; }
    switch (b.kind) {
        case 'market':
            sim.events.push({ e: 'open', to: p.id, ui: 'market', id: b.id });
            return;
        case 'bed': {
            if (b.crop === 2) { machines.harvestBed(sim, p, b); return; }
            if ((b.crop ?? -1) >= 0) { sim.float(c.x, c.y - 12, 'Growing…', PAL.lime, p.id); return; }
            const owned = SEED_IDS.filter((s) => countOf(p, s) > 0);
            if (!owned.length) { sim.deny(p, 'Needs seeds'); return; }
            if (seed === undefined && owned.length > 1) { sim.events.push({ e: 'open', to: p.id, ui: 'bed', id: b.id }); return; }
            const pick = seed && owned.includes(seed) ? seed : owned[0];
            machines.plantBed(sim, p, b, pick);
            return;
        }
        case 'campfire':
            sim.float(c.x, c.y - 12, sim.s.night ? 'Safe and warm' : 'Lights up at night', undefined, p.id);
            return;
        default:
            return;
    }
}

// ── crafting ───────────────────────────────────────────────────────────────
import { affordIn, chestsAround, payFrom } from './pool';

export function cmdCraft (sim: Sim, p: PlayerS, recipeId: string, n: number) {
    const r = RECIPES[recipeId];
    if (!r || !STATIONS.has(r.station)) return;
    n = Math.max(1, Math.min(25, Math.floor(n) || 1));
    if (r.station !== 'hand' && !sim.stationNear(p, (b) => BUILDINGS[b.kind].station === r.station)) {
        sim.deny(p, `Stand next to a ${r.station}`);
        return;
    }
    if (!hasUnlock(p, r.req)) { sim.deny(p, 'Locked — learn it in the skill tree'); return; }
    const d = derived(p);
    let made = 0, fromChests = false;
    // the chests round you count as pockets (pockets first)
    const chests = chestsAround(sim.buildings(), p.x, p.y);
    for (let i = 0; i < n; i++) {
        if (!affordIn(p, chests, r.in)) break;
        const touched = payFrom(p, chests, r.in);
        for (const t of touched) sim.touch(t);
        if (touched.length) fromChests = true;
        if (d.mods.craftSave && sim.rng.chance(d.mods.craftSave)) {
            for (const [res, c] of Object.entries(r.in) as [Res, number][]) addRes(p, res, c);   // free craft!
        }
        sim.give(p, r.out, r.n);
        made += r.n;
        p.stats.crafted++;
        sim.gainXp(p, r.xp);
        autoEquip(sim, p, r.out);
    }
    if (!made) { sim.deny(p, 'Not enough materials'); return; }
    quests.count(p, `craft:${r.out}`, made);
    sim.fx('craft', p.x, p.y - 8, p.id);
    sim.float(p.x, p.y - 24, `+${made} ${ITEMS[r.out].name}`, PAL.cream, p.id, `craft-${r.out}`);
    if (fromChests) sim.float(p.x, p.y - 38, 'from the chests nearby', PAL.lime, p.id, `craft-chest`);
}

/** A freshly crafted piece of gear goes on straight away if it beats what you wear. */
function autoEquip (sim: Sim, p: PlayerS, item: ItemId) {
    const g = ITEMS[item].gear;
    if (!g) return;
    const cur = p.equip[g.slot] ? ITEMS[p.equip[g.slot]!].gear : undefined;
    if (!cur || g.tier > cur.tier) cmdEquip(sim, p, item, true);
}

export function cmdEquip (sim: Sim, p: PlayerS, item: ItemId, quiet = false) {
    const g = ITEMS[item]?.gear;
    if (!g || countOf(p, item) < 1) return;
    const old = p.equip[g.slot];
    takeItem(p, item, 1);
    p.equip[g.slot] = item;
    if (old) sim.give(p, old, 1);
    if (!quiet) sim.fx('equip', p.x, p.y - 8, p.id);
    else sim.toast(p.id, `Equipped ${ITEMS[item].name}`, `i_${item}`, PAL.lime);
}

export function cmdUnequip (sim: Sim, p: PlayerS, slot: GearSlot) {
    const old = p.equip[slot];
    if (!old) return;
    if (countOf(p, old) >= itemCap(p, old)) { sim.deny(p, 'Your pockets are full'); return; }
    delete p.equip[slot];
    addItem(p, old, 1);
    sim.fx('equip', p.x, p.y - 8, p.id);
}

// ── food ───────────────────────────────────────────────────────────────────
export function cmdEat (sim: Sim, p: PlayerS, item?: ItemId) {
    const d = derived(p);
    const missing = d.maxEnergy - p.energy;
    let id = item;
    if (!id) {
        const foods = ITEM_ORDER.filter((i) => ITEMS[i].kind === 'food' && ITEMS[i].food && countOf(p, i) > 0);
        if (missing < 1) { sim.deny(p, 'Not hungry'); return; }
        if (!foods.length) { sim.deny(p, 'No food — try berries'); return; }
        const fits = foods.filter((i) => ITEMS[i].food! <= missing).sort((a, b) => ITEMS[b].food! - ITEMS[a].food!);
        id = fits[0] ?? foods.sort((a, b) => ITEMS[a].food! - ITEMS[b].food!)[0];
    }
    const def = ITEMS[id];
    if (!def || countOf(p, id) < 1 || !(def.food || def.heal || def.buff || def.xpPct)) return;
    if (def.xpPct && p.level >= MAX_LEVEL) { sim.deny(p, 'You already know all there is to know'); return; }
    if (!def.heal && !def.buff && !def.xpPct && missing < 1) { sim.deny(p, 'Not hungry'); return; }
    if (def.heal && p.rift?.omens?.includes('cursed')) { sim.deny(p, 'The curse turns it to dust'); return; }
    if (def.heal && !def.food && !def.buff && p.hearts >= d.maxHearts) { sim.deny(p, 'Already healthy'); return; }
    takeItem(p, id, 1);
    if (def.food) {
        const gain = Math.min(missing, def.food * d.foodMul);
        p.energy += gain;
        if (gain > 0) sim.float(p.x, p.y - 22, `+${Math.round(gain)} energy`, PAL.gold, p.id);
    }
    if (def.heal) sim.heal(p, def.heal);
    if (def.xpPct) {
        const n = xpToNext(p.level) * def.xpPct;
        sim.float(p.x, p.y - 30, `+${Math.round(n * d.xpMul)} XP`, PAL.plum, p.id);
        sim.gainXp(p, n);
    }
    if (def.buff) {
        const secs = def.buff.secs * d.buffMul;
        const have = p.buffs.find((b) => b.id === def.buff!.id);
        if (have) { if (secs > have.t) delete have.by; have.t = Math.max(have.t, secs); } else p.buffs.push({ id: def.buff.id, t: secs });       // (a longer meal of your own takes over from a cook's name)
    }
    sim.fx(def.kind === 'potion' ? 'drink' : 'eat', p.x, p.y - 10, p.id);
    quests.count(p, 'eat');       // (the tutorial counts it)
}

// ── trade ──────────────────────────────────────────────────────────────────
export function cmdSell (sim: Sim, p: PlayerS, item: ItemId, n: number) {
    if (!ITEMS[item] || ITEMS[item].sell <= 0) return;
    if (!sim.stationNear(p, (b) => b.kind === 'market', TUNING.marketRange)) { sim.deny(p, 'Stand next to a market'); return; }
    n = Math.min(Math.floor(n), countOf(p, item));
    if (!(n >= 1)) return;                      // (a NaN from the wire fails this test, and so does an empty sale: `n <= 0` would let both through)
    const coins = Math.max(1, Math.round(sellValue(p, item, n)));
    takeItem(p, item, n);
    p.coins += coins;
    quests.count(p, 'sell', coins);
    sim.fx('sell', p.x, p.y - 10, p.id);
    sim.float(p.x, p.y - 22, `+${coins} coins`, PAL.gold, p.id, 'sell');
}

// ── skills ─────────────────────────────────────────────────────────────────
export function cmdSkill (sim: Sim, p: PlayerS, id: string) {
    const check = canLearn(p, id);
    if (!check.ok) { sim.deny(p, check.why); return; }
    learnSkill(p, id);
    quests.count(p, 'skill');       // (the tutorial counts it)
    const n = SKILLS[id];
    sim.fx('skill', p.x, p.y - 10, p.id);
    if (n.unlock?.length) {
        sim.fx('unlock', p.x, p.y - 10, p.id);
        sim.toast(p.id, UNLOCK_INFO[n.unlock[0]] ?? `Unlocked ${n.name}`, n.icon, PAL.gold);
    }
}



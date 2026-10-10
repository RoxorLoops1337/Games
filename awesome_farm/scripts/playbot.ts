// A bot that plays Awesome Farm through the same commands a person uses (no cheats): gathers, crafts, builds, learns skills, buys land
// when it needs a resource the land it owns lacks, fights at night. It follows a fixed shopping list of goals, in the order a first-time
// player would go for them, and writes down WHEN each first thing happened (first bed, first iron bar, first ring, first gem...).
// The point is the pacing report: what is reachable by which day, what the bot could not get at all (and why), how often it fell.
//   npx tsx scripts/playbot.ts [days=20] [seed=bot]
// The bot is a rough, patient player, not a clever one: it waits at a furnace instead of doing other chores, never fishes or farms for
// food, and never goes into the mines or the rifts. Read its times as "no earlier than a careful beginner", not as the average player.

import { TILE, TUNING } from '../src/shared/config';
import { BUILDINGS, type BuildingKind } from '../src/shared/data/buildings';
import { ITEMS, type ItemId, type Res } from '../src/shared/data/items';
import { NODES, type NodeKind } from '../src/shared/data/nodes';
import { RECIPES, type Recipe } from '../src/shared/data/recipes';
import { satchelDims } from '../src/shared/data/relics';
import { SKILLS } from '../src/shared/data/skills';
import { Sim } from '../src/shared/sim/sim';
import { canLearn, derived, hasUnlock, rankOf } from '../src/shared/sim/stats';
import type { BuildE, MobE, NodeE, PlayerS } from '../src/shared/sim/types';

const STEP = 1 / 20;

/** What a beginner goes for, in order. [item, count] is "have this many in my pockets (or worn)"; { build } is "own one". */
type Goal = { item: ItemId; n: number } | { build: BuildingKind };
export const GOALS: Goal[] = [
    { build: 'workbench' }, { build: 'campfire' }, { build: 'market' }, { item: 'plank', n: 12 }, { build: 'sleepbed' },
    { build: 'furnace' }, { item: 'ironbar', n: 6 }, { item: 'pick_iron', n: 1 }, { item: 'sword_iron', n: 1 },
    { item: 'helm_iron', n: 1 }, { item: 'rope', n: 10 }, { build: 'tower_archer' }, { item: 'ring_copper', n: 1 }, { item: 'ring_iron', n: 1 },
    { item: 'mail_iron', n: 1 }, { build: 'tower_archer' }, { item: 'relic_iron_chip', n: 1 }, { item: 'relic_ember_chip', n: 1 },
    { item: 'ironbar', n: 20 }, { item: 'steel', n: 8 }, { item: 'sword_steel', n: 1 }, { item: 'helm_steel', n: 1 }, { item: 'plate_steel', n: 1 },
    { item: 'ring_steel', n: 1 }, { item: 'ring_gold', n: 1 }, { item: 'goldbar', n: 4 }, { item: 'potion_heal', n: 4 },
];

/** The skills a beginner works towards, in order, as [skill, rank wanted]; the ones they hang from are learned on the way. */
const SKILL_TARGETS: [string, number][] = [
    ['i_smith', 1], ['g_hands', 1], ['c_vit', 2], ['g_stone', 1], ['i_smith2', 1], ['c_vit', 4], ['c_edge', 2], ['c_towers', 1], ['f_alch', 1],
    ['c_hook', 1], ['c_arrow', 1], ['c_vit', 6], ['c_skin', 3], ['c_scorch', 1], ['c_frost', 1], ['f_alch2', 1], ['c_ram', 1], ['c_shroud', 1],
];

const GEAR_SLOT: Record<string, string> = { pick: 'tool', sword: 'weapon', helm: 'head', mail: 'body', plate: 'body', ring: 'ring' };

export interface Report {
    days: number;
    firsts: { at: number; what: string }[];          // sim time in days (day + clock fraction)
    blocked: Record<string, string>;                 // goal -> why the bot could not get it
    deaths: number;
    level: number;
    points: number;
    plots: number;
    coins: number;
    perDay: { day: number; level: number; hearts: number; hurt: number; coins: number; plots: number; blds: number }[];
    nests: string;
}

const stationBuilding = (station: string): BuildingKind | null => {
    for (const [k, d] of Object.entries(BUILDINGS)) if (d.station === station || d.proc === station) return k as BuildingKind;
    return null;
};
const nodesGiving = (res: Res): NodeKind[] => (Object.keys(NODES) as NodeKind[]).filter((k) => !NODES[k].titan && NODES[k].group !== 'chest' && k !== 'nest' && NODES[k].drops.some((d) => d[0] === res));
const recipeFor = (item: ItemId): Recipe | undefined => Object.values(RECIPES).find((r) => r.out === item);

export class Bot {
    readonly firsts: { at: number; what: string }[] = [];
    readonly blocked: Record<string, string> = {};
    deaths = 0;
    hurt = 0;                    // hearts lost in all
    private lastHearts = -1;
    private seen = new Set<string>();
    private stuck = 0;
    private skip = new Set<number>();            // nodes it could not reach
    private tick = 0;
    private waitUntil = 0;
    private foodSince = -1;
    private detour = 0;
    stuckN () { return this.stuck; }
    doing = '';                      // the goal it is working on right now

    constructor (readonly sim: Sim, readonly p: PlayerS) {}

    private now () { return this.sim.s.day + this.sim.s.clock / (TUNING.dayLength + TUNING.nightLength); }
    private first (what: string) { if (!this.seen.has(what)) { this.seen.add(what); this.firsts.push({ at: Math.round(this.now() * 100) / 100, what }); } }
    private cmd (c: Parameters<Sim['command']>[1]) { this.sim.command(this.p.id, c); }
    private have (item: ItemId) { return this.p.inv[item] ?? 0; }
    private home () { return this.sim.world.plotCenter(this.sim.homePlot(this.p.slot)); }
    private blds (kind?: BuildingKind) { return this.sim.buildings().filter((b) => b.by === this.p.id && (!kind || b.kind === kind)); }
    private ownsWorn (item: ItemId) { return Object.values(this.p.equip).includes(item); }

    // ── movement ───────────────────────────────────────────────────────────
    /** One step toward (x, y), sliding round whatever blocks the way. Returns true when within `stop` px. */
    private walk (x: number, y: number, stop = 6): boolean {
        const p = this.p, dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
        if (d <= stop) { this.stuck = 0; return true; }
        const sp = derived(p).speed * STEP;
        let base = Math.atan2(dy, dx);
        if (this.stuck > 120) {                         // boxed in by trees, buildings, water: walk sideways for a few seconds, then try again
            this.detour = (this.detour + 1) % 400;
            if (this.detour === 0) this.stuck = 0;
            base += (Math.floor(this.detour / 100) % 2 ? 1 : -1) * (Math.PI / 2 + (Math.floor(this.detour / 200) * 0.6));
        }
        for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3]) {
            const a = base + off, nx = p.x + Math.cos(a) * sp, ny = p.y + Math.sin(a) * sp;
            if (!this.sim.world.boxBlocked(nx, ny, 4, 3)) {
                this.cmd({ t: 'move', x: nx, y: ny, fx: Math.cos(a), fy: Math.sin(a), moving: true });
                this.stuck = off === 0 ? Math.max(0, this.stuck - 1) : this.stuck + 1;
                return false;
            }
        }
        this.stuck += 3;
        return false;
    }

    // ── the day's work ─────────────────────────────────────────────────────
    /** Call once before every `sim.step`. */
    act () {
        const p = this.p, sim = this.sim;
        this.tick++;
        if (this.lastHearts >= 0 && p.hearts < this.lastHearts) this.hurt += this.lastHearts - p.hearts;
        this.lastHearts = p.hearts;
        if (p.downed > 0) { this.cmd({ t: 'respawn' }); this.deaths++; return; }
        if (this.tick % 40 === 0) this.upkeep();
        p.energy = Math.max(p.energy, 0);
        if (sim.s.night) { this.fight(); return; }
        if (this.waitUntil > sim.s.time) return;
        if (this.food() || p.energy >= 35) this.foodSince = -1;
        else if (this.foodSince < 0) this.foodSince = sim.s.time;
        if (this.foodSince >= 0 && sim.s.time - this.foodSince > 120 && sim.s.time - this.foodSince < 300) { /* no berries found in two minutes: carry on without, as a person would */ }
        else if (p.energy < 35 && !this.food()) {          // swinging costs energy and nothing refills it but food: pick berries (the game's own hint)
            const r = this.gather('berry', 8);
            this.blocked['(food)'] = r === 'acting' ? 'picking berries' : r;
            if (r === 'acting') { this.first('first food run'); return; }
            if (sim.s.time - this.foodSince >= 300) this.foodSince = sim.s.time;      // try again for two minutes
        }
        for (const g of GOALS) {
            const key = 'build' in g ? g.build : `${g.item}${g.n > 1 ? ' x' + g.n : ''}`;
            const r = 'build' in g ? this.wantBuilding(g.build, g === GOALS.find((q) => 'build' in q && q.build === g.build) ? 1 : 2) : this.need(g.item, g.n);
            if (r === 'done') { this.first(key); delete this.blocked[key]; continue; }
            if (r === 'acting') { this.doing = key; return; }
            this.blocked[key] = r;
        }
        this.grind();                                 // nothing to do on the list: gather for xp
    }

    /** Every few seconds: skills, gear, food. */
    private upkeep () {
        const p = this.p;
        for (const [target, rank] of SKILL_TARGETS) {
            if (rankOf(p, target) >= rank) continue;
            const id = this.skillStep(target);
            if (id) { this.cmd({ t: 'skill', id }); this.first(`skill ${SKILLS[id].name}`); }
            break;                                       // (when it cannot be had yet the points wait for it)
        }
        for (const [item, def] of Object.entries(ITEMS) as [ItemId, (typeof ITEMS)[ItemId]][]) {
            if (def.kind !== 'gear' || !this.have(item) || this.ownsWorn(item)) continue;
            const slot = GEAR_SLOT[item.split('_')[0]];
            if (!slot) continue;
            // a tier is "better" when it was made later on the list, which is how the goals are ordered
            this.cmd({ t: 'equip', item });
            this.first(`worn ${item}`);
        }
        for (const item of Object.keys(p.inv) as ItemId[]) {
            if (!item.startsWith('relic_') || !this.have(item)) continue;
            const { w, h } = satchelDims(p.level), n = p.satchel?.length ?? 0;
            for (let y = 0; y < h && (p.satchel?.length ?? 0) === n; y++) for (let x = 0; x < w && (p.satchel?.length ?? 0) === n; x++) this.cmd({ t: 'satchel', op: 'put', item, x, y });
            if ((p.satchel?.length ?? 0) > n) this.first('relic in the satchel');
        }
        for (const w of Object.values(p.equip)) if (w && String(w).startsWith('ring_')) this.first(`ring worn: ${w}`);
        const d = derived(p);
        if (p.energy < 25 && this.food()) this.cmd({ t: 'eat' });
        if (p.hearts < d.maxHearts * 0.5) { if (this.have('potion_heal')) this.cmd({ t: 'eat', item: 'potion_heal' }); else this.cmd({ t: 'eat' }); }
        for (const [item, n] of Object.entries(p.inv)) if ((n ?? 0) > 0) this.first(`got ${item}`);
        for (const b of this.blds()) this.first(`built ${b.kind}`);
        if (this.sim.world.ownedPlots().length > 1) this.first(`land x${this.sim.world.ownedPlots().length}`);
        if (p.level >= 5) this.first('level 5'); if (p.level >= 10) this.first('level 10'); if (p.level >= 15) this.first('level 15'); if (p.level >= 20) this.first('level 20');
    }

    /** A building of this kind, built if not there yet. */
    private wantBuilding (kind: BuildingKind, count: number): string {
        if (this.blds(kind).length >= count) return 'done';
        const def = BUILDINGS[kind];
        if (!hasUnlock(this.p, def.req)) return `needs the ${def.req} skill (${this.skillFor(def.req)})`;
        for (const [res, c] of Object.entries(def.cost) as [Res, number][]) {
            if (res === 'coin') continue;
            const r = this.need(res as ItemId, c);
            if (r !== 'done') return r;
        }
        const h = this.home();
        if (!this.walk(h.x, h.y, 40)) return 'acting';
        const [w, hh] = def.size, htx = Math.floor(h.x / TILE), hty = Math.floor(h.y / TILE);
        let spot: { tx: number; ty: number } | null = null;
        for (let r = 2; r < 9 && !spot; r++) {
            for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || (dx + dy) % 2) continue;       // (every other tile, so there is room to walk)
                if (this.sim.world.rectFree(htx + dx, hty + dy, w, hh)) spot = { tx: htx + dx, ty: hty + dy };
            }
        }
        if (!spot) return 'no free tile near home';
        const before = this.blds().length;
        this.cmd({ t: 'build', kind, tx: spot.tx, ty: spot.ty, rot: 0 });
        return this.blds().length > before ? 'acting' : 'could not place it';
    }

    private food () { return (Object.keys(this.p.inv) as ItemId[]).some((i) => ITEMS[i].kind === 'food' && ITEMS[i].food && this.have(i) > 0); }

    /** The skill to learn now on the way to `target`: the target itself, or the first thing it hangs from that can be had. */
    private skillStep (target: string, depth = 0): string | null {
        if (canLearn(this.p, target).ok) return target;
        const n = SKILLS[target];
        if (!n || depth > 8 || this.p.points < n.cost && n.req.every((r) => r === 'hub' || rankOf(this.p, r) > 0)) return null;
        for (const r of n.req) if (r !== 'hub' && rankOf(this.p, r) === 0) { const x = this.skillStep(r, depth + 1); if (x) return x; }
        return null;
    }

    private skillFor (token?: string) { return Object.values(SKILLS).find((s) => s.unlock?.includes(token ?? ''))?.name ?? token ?? '?'; }

    /** Have `n` of an item: make it, smelt it, gather it. Returns 'done', 'acting' (did something this step), or why it is stuck. */
    private need (item: ItemId, n: number, depth = 0): string {
        if (depth > 8) return `too deep: ${item}`;
        if (this.have(item) >= n || (ITEMS[item].kind === 'gear' && this.ownsWorn(item))) return 'done';
        const r = recipeFor(item);
        if (r) return this.make(r, n - this.have(item), depth);
        return this.gather(item as Res, n - this.have(item));
    }

    private make (r: Recipe, missing: number, depth: number): string {
        const runs = Math.ceil(missing / r.n);
        if (!hasUnlock(this.p, r.req)) return `needs the ${r.req} skill (${this.skillFor(r.req)}), ${this.p.points} points`;
        for (const [res, c] of Object.entries(r.in) as [Res, number][]) {
            const have = this.have(res as ItemId), want = c * runs;
            if (have < want) { const x = this.need(res as ItemId, want, depth + 1); if (x !== 'done') return x; }
        }
        if (r.station === 'hand') { this.cmd({ t: 'craft', recipe: r.id, n: runs }); return this.have(r.out) >= missing ? 'done' : 'acting'; }
        const kind = stationBuilding(r.station);
        if (!kind) return `no building makes ${r.station}`;
        const st = this.blds(kind)[0];
        if (!st) { const x = this.wantBuilding(kind, 1); return x === 'done' ? 'acting' : x; }
        const c = this.sim.center(st);
        if (!this.walk(c.x, c.y, TILE * 1.8)) return 'acting';
        if (BUILDINGS[kind].proc) return this.smelt(st, r, runs);
        this.cmd({ t: 'craft', recipe: r.id, n: Math.min(25, runs) });
        return 'acting';
    }

    /** Load a furnace or sawmill, wait for it, take the result. */
    private smelt (st: BuildE, r: Recipe, runs: number): string {
        const out = (st.out?.[r.out] ?? 0);
        if (out > 0) { this.cmd({ t: 'xfer', id: st.id, item: r.out, n: out, dir: 'take', part: 'out' }); return 'acting'; }
        const inside = Object.values(st.inv ?? {}).reduce((a, b) => a + (b ?? 0), 0);
        if (inside > 0) { this.waitUntil = this.sim.s.time + 1; return 'acting'; }      // still working: wait, as a patient beginner does
        this.cmd({ t: 'load', id: st.id });
        if (!((st.fuel ?? 0) > 0) && !Object.keys(st.fin ?? {}).length) {
            const fuel = (['coal', 'wood'] as ItemId[]).find((f) => this.have(f) > 0);
            if (fuel) this.cmd({ t: 'xfer', id: st.id, item: fuel, n: Math.min(this.have(fuel), 10), dir: 'put', part: 'fuel' });
            else return this.gather('wood', 10);
        }
        this.waitUntil = this.sim.s.time + 1;
        void runs;
        return 'acting';
    }

    /** Break nodes that drop `res` until there are enough; buy land when the land we own has none. */
    private gather (res: Res, n: number): string {
        const kinds = nodesGiving(res);
        if (!kinds.length) return `${res} comes from monsters or the mines, which the bot does not visit`;
        const p = this.p, sim = this.sim, d = derived(p);
        const owned = new Set(sim.s.plots.filter((q) => q.owned).map((q) => q.i));
        let best: NodeE | null = null, bd = Infinity;
        for (const e of Object.values(sim.s.ents)) {
            if (e.k !== 'node' || !kinds.includes(e.kind) || !owned.has(e.plot) || this.skip.has(e.id)) continue;
            const def = NODES[e.kind];
            if (def.minTier !== undefined && d.toolTier < def.minTier) continue;
            const ec = sim.center(e), dd = Math.hypot(ec.x - p.x, ec.y - p.y);
            if (dd < bd) { bd = dd; best = e; }
        }
        if (!best) return this.expand(res, kinds);
        const c = sim.center(best);
        const reach = d.reach - 4;
        if (Math.hypot(c.x - p.x, c.y - p.y) > reach) {
            this.walk(c.x, c.y, reach - 6);
            if (this.stuck > 60) { this.skip.add(best.id); this.stuck = 0; }
            return 'acting';
        }
        this.cmd({ t: 'swing', id: best.id });
        void n;
        return 'acting';
    }

    /** No node of this kind on our land: sell spare things, buy the cheapest plot beside us. */
    private expand (res: Res, kinds: NodeKind[]): string {
        const sim = this.sim, p = this.p;
        const minTier = Math.min(...kinds.map((k) => NODES[k].minTier ?? 0));
        if (derived(p).toolTier < minTier) return `${res} needs a better pick (tier ${minTier})`;
        if (p.plotsBought >= 10) return `${res}: none on the ${sim.world.ownedPlots().length} plots owned (the bot stops buying land at 10 plots bought)`;
        const options = sim.s.plots.filter((q) => sim.world.isPurchasable(q) && q.blight !== 1);
        if (!options.length) return `no land left to buy for ${res}`;
        const cost = Math.min(...options.map((q) => Math.round(sim.world.price(q, p.plotsBought) * derived(p).landMul)));
        if (p.coins < cost) {
            // sell what is not needed, at the market stall (built first, on the list)
            const mk = this.blds('market')[0];
            if (mk) {
                const c = this.sim.center(mk);
                if (!this.walk(c.x, c.y, TILE * 1.8)) return 'acting';
                const KEEP: Partial<Record<ItemId, number>> = { wood: 30, stone: 30, plank: 12, fiber: 12, berry: 10, coal: 10, iron: 12, copper: 6, ironbar: 12 };
                for (const [item, n] of Object.entries(p.inv) as [ItemId, number][]) {
                    const def = ITEMS[item];
                    if (def.kind === 'gear' || def.kind === 'food' && item !== 'berry' || def.sell <= 0 || item.startsWith('relic_') || item.startsWith('gem_')) continue;
                    const spare = n - (KEEP[item] ?? 0);
                    if (spare > 0) this.cmd({ t: 'sell', item, n: spare });
                }
            }
            if (p.coins < cost) return this.grindFor(`${res}: saving for land (${p.coins}/${cost} coins)`);
        }
        const q = options.sort((a, b) => sim.world.price(a, p.plotsBought) - sim.world.price(b, p.plotsBought))[0];
        this.cmd({ t: 'buy', plot: q.i });
        return 'acting';
    }

    /** Work that earns coins/xp while waiting for something: break the nearest plain node. */
    private grindFor (why: string): string { this.grind(); return why; }
    private grind () {
        const kinds: NodeKind[] = ['tree', 'rock', 'bush'];
        const p = this.p, sim = this.sim;
        const owned = new Set(sim.s.plots.filter((q) => q.owned).map((q) => q.i));
        let best: NodeE | null = null, bd = Infinity;
        for (const e of Object.values(sim.s.ents)) {
            if (e.k !== 'node' || !kinds.includes(e.kind) || !owned.has(e.plot) || this.skip.has(e.id)) continue;
            const ec = sim.center(e), dd = Math.hypot(ec.x - p.x, ec.y - p.y);
            if (dd < bd) { bd = dd; best = e; }
        }
        if (!best) return;
        const c = sim.center(best), reach = derived(p).reach - 4;
        if (Math.hypot(c.x - p.x, c.y - p.y) > reach) { this.walk(c.x, c.y, reach - 6); if (this.stuck > 60) { this.skip.add(best.id); this.stuck = 0; } return; }
        this.cmd({ t: 'swing', id: best.id });
    }

    /** At night: stay by the fire, hit what comes close, drink when low. */
    private fight () {
        const p = this.p, sim = this.sim, d = derived(p);
        let best: MobE | null = null, bd = 120;
        for (const e of Object.values(sim.s.ents)) {
            if (e.k !== 'mob') continue;
            const dd = Math.hypot(e.x - p.x, e.y - p.y);
            if (dd < bd) { bd = dd; best = e; }
        }
        if (p.hearts <= d.maxHearts * 0.4 && this.have('potion_heal')) this.cmd({ t: 'eat', item: 'potion_heal' });
        if (!best) { const h = this.home(); this.walk(h.x, h.y + 20, 30); return; }
        const reach = Math.max(d.reach, d.weapon.reach) - 4;
        if (bd > reach) this.walk(best.x, best.y, reach - 4);
        else this.cmd({ t: 'swing', id: best.id });
    }
}

export function play (days: number, seed = 'bot'): Report {
    const sim = Sim.create(seed, 'bot');
    const p = sim.join('bot', 'Bot')!;
    const bot = new Bot(sim, p);
    const perDay: Report['perDay'] = [];
    let lastDay = sim.s.day;
    const end = sim.s.day + days;
    for (let guard = 0; sim.s.day < end && guard < days * (TUNING.dayLength + TUNING.nightLength) * 20 * 1.3; guard++) {
        bot.act();
        sim.step(STEP);
        if (sim.s.day !== lastDay) {
            lastDay = sim.s.day;
            perDay.push({ day: sim.s.day, level: p.level, hearts: derived(p).maxHearts, hurt: Math.round(bot.hurt * 10) / 10, coins: p.coins, plots: sim.world.ownedPlots().length, blds: bot['blds']().length });
        }
    }
    return { days: sim.s.day, firsts: bot.firsts, blocked: bot.blocked, deaths: bot.deaths, level: p.level, points: p.points, plots: sim.world.ownedPlots().length, coins: p.coins, perDay, nests: sim.s.plots.filter((q) => q.blight === 1).map((q) => `lv${q.nl ?? 1}`).join(' ') };
}

const MILESTONES = ['built workbench', 'built market', 'built sleepbed', 'built furnace', 'built anvil', 'level 5', 'level 10', 'level 15', 'ironbar x6', 'pick_iron', 'sword_iron', 'helm_iron', 'ring_copper', 'ring_iron',
    'relic in the satchel', 'steel x8', 'sword_steel', 'plate_steel', 'ring_steel', 'ring_gold', 'goldbar x4', 'potion_heal x4', 'tower_archer', 'skill Watchtowers', 'skill Steelwork', 'skill Vitality'];

if (process.argv[1]?.endsWith('playbot.ts')) {
    const days = Number(process.argv[2] ?? 20), seeds = (process.argv[3] ?? 'bot').split(',');
    if (seeds.length > 1) {
        // several worlds side by side: the day each milestone was first reached ("-" = never within the days)
        const runs = seeds.map((sd) => play(days, sd));
        console.log(`\n${days} days, worlds: ${seeds.join(' ')}\n`);
        console.log('milestone'.padEnd(24) + seeds.map((x) => x.padStart(7)).join(''));
        for (const m of MILESTONES) console.log(m.padEnd(24) + runs.map((r) => String(r.firsts.find((f) => f.what === m)?.at ?? '-').padStart(7)).join(''));
        console.log('level at end'.padEnd(24) + runs.map((r) => String(r.level).padStart(7)).join(''));
        console.log('hearts at end'.padEnd(24) + runs.map((r) => String(r.perDay.at(-1)?.hearts ?? '-').padStart(7)).join(''));
        console.log('falls'.padEnd(24) + runs.map((r) => String(r.deaths).padStart(7)).join(''));
        console.log('hearts lost'.padEnd(24) + runs.map((r) => String(r.perDay.at(-1)?.hurt ?? '-').padStart(7)).join(''));
        console.log('plots'.padEnd(24) + runs.map((r) => String(r.plots).padStart(7)).join(''));
        console.log('nests'.padEnd(24) + runs.map((r) => String(r.nests.split(' ').filter(Boolean).length).padStart(7)).join(''));
        process.exit(0);
    }
    const r = play(days, seeds[0]);
    console.log(`\n${r.days} days. level ${r.level}, ${r.points} unspent skill points, ${r.plots} plots, ${r.coins} coins, fell ${r.deaths} times\n`);
    console.log('FIRSTS (day.fraction)');
    for (const f of r.firsts) console.log(`  ${String(f.at).padStart(6)}  ${f.what}`);
    console.log('\nNEVER GOT (the goal, and what stopped it at the end)');
    for (const [g, why] of Object.entries(r.blocked)) console.log(`  ${g.padEnd(22)} ${why}`);
    console.log(`\nnests at the end: ${r.nests || 'none'}`);
    console.log('PER DAY  day  level  hearts  hurt(total)  coins  plots  buildings');
    for (const d of r.perDay) console.log(`  ${String(d.day).padStart(8)}  ${String(d.level).padStart(4)}  ${String(d.hearts).padStart(5)}  ${String(d.hurt).padStart(10)}  ${String(d.coins).padStart(5)}  ${String(d.plots).padStart(4)}  ${String(d.blds).padStart(6)}`);
}

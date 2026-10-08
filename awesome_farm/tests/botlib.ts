// A scripted player that plays with real commands only (no cheats): walks, chops, mines, crafts,
// smelts, farms, fights and builds like a person would. The tests drive it through the story.
import assert from 'node:assert/strict';
import { TILE, TUNING } from '../src/shared/config';
import { BUILDINGS, CROPS, type BuildingKind } from '../src/shared/data/buildings';
import type { ItemId } from '../src/shared/data/items';
import { type NodeKind } from '../src/shared/data/nodes';
import { RECIPES } from '../src/shared/data/recipes';
import { CHAPTERS } from '../src/shared/data/quests';
import { chapterDone, progressOf, qsOf } from '../src/shared/sim/quests';
import { Sim } from '../src/shared/sim/sim';
import { BIOME_DEFS, type Biome } from '../src/shared/data/biomes';
import { SPECIES } from '../src/shared/data/creatures';
import { SKILLS } from '../src/shared/data/skills';
import { canLearn, countOf, derived, rankOf } from '../src/shared/sim/stats';
import { MOBS } from '../src/shared/data/mobs';
import type { BuildE, CritE, MobE, NodeE, PlayerS, Plot } from '../src/shared/sim/types';

export const STEP = 1 / 20;
export const CROPS_WAIT = 30;

export class Bot {
    sim: Sim;
    p: PlayerS;
    t0 = 0;
    took = 0;
    constructor (seed: string) {
        this.sim = Sim.create(seed, 'bot');
        this.p = this.sim.join('bot', 'Bot')!;
        this.p.hearts = 99;
    }
    get time () { return Math.round(this.sim.s.time - this.t0); }
    run (secs: number) { for (let t = 0; t < secs; t += STEP) { this.keepAlive(); this.sim.step(STEP); } }
    keepAlive () {
        const p = this.p;
        if (p.downed > 0) this.sim.respawnHome(p);
        if (p.hearts < 2) p.hearts = 2;            // the bot is not testing survival here
        p.energy = Math.max(p.energy, 30);
    }
    /** Walk to a point (time passes at the player's move speed). */
    goto (x: number, y: number) {
        // a monster can down the bot mid-walk (it then wakes at home), so insist on arriving
        for (let tries = 0; tries < 4; tries++) {
            const d = Math.hypot(x - this.p.x, y - this.p.y);
            this.p.x = x; this.p.y = y; this.p.warp++;
            this.run(d / TUNING.moveSpeed);
            if (Math.hypot(x - this.p.x, y - this.p.y) < 6) break;
        }
    }
    nearTile (tx: number, ty: number) {
        const spot = this.sim.nearestFree(tx, ty + 1) ?? this.sim.nearestFree(tx, ty - 1)!;
        this.goto((spot.tx + 0.5) * TILE, (spot.ty + 1) * TILE - 3);
    }
    nodes (kind: NodeKind) {
        return Object.values(this.sim.s.ents).filter((e): e is NodeE => e.k === 'node' && e.kind === kind && !this.sim.s.plots[e.plot]?.dread)      // (the bot has the sense to stay out of the Dread Reaches)
            .sort((a, b) => Math.hypot(a.tx * TILE - this.p.x, a.ty * TILE - this.p.y) - Math.hypot(b.tx * TILE - this.p.x, b.ty * TILE - this.p.y));
    }
    /** Break `n` nodes of a kind, then let the drops fly in. */
    harvest (kind: NodeKind, n: number) {
        let broken = 0;
        for (let guard = 0; broken < n && guard < n * 4; guard++) {
            const node = this.nodes(kind)[0];
            if (!node) { if (guard === 1) this.expandFor(kind); this.run(5); continue; }
            this.nearTile(node.tx, node.ty);
            for (let i = 0; i < 40 && this.sim.s.ents[node.id]; i++) { this.p.swingCd = 0; this.sim.command('bot', { t: 'swing', id: node.id }); this.run(0.34); }
            if (!this.sim.s.ents[node.id]) { broken++; this.run(0.9); }   // let the drops fly in
        }
        this.run(1.5);
        return broken;
    }
    /** Keep harvesting any of these kinds until we hold enough of an item. */
    gather (item: ItemId, want: number, kinds: NodeKind[]) {
        for (let guard = 0; countOf(this.p, item) < want && guard < 60; guard++) {
            const kind = kinds.find((k) => this.nodes(k).length) ?? kinds[0];
            this.harvest(kind, 1);
        }
    }
    build (kind: BuildingKind) {
        const placed = this.tryBuild(kind);
        if (placed) return placed;
        // too crowded here: walk to open ground on any plot we own
        const [w, h] = BUILDINGS[kind].size;
        for (const plot of this.sim.world.ownedPlots()) {
            const o = this.sim.world.plotOrigin(plot);
            for (let ty = o.ty + 1; ty < o.ty + 11 - h; ty++) for (let tx = o.tx + 1; tx < o.tx + 11 - w; tx++) {
                if (!this.sim.world.rectFree(tx - 1, ty - 1, w + 2, h + 3)) continue;
                this.goto((tx + w / 2) * TILE, (ty + h + 2) * TILE);
                const again = this.tryBuild(kind);
                if (again) return again;
            }
        }
        return undefined;
    }
    private tryBuild (kind: BuildingKind) {
        const p = this.p;
        const [w, h] = BUILDINGS[kind].size;
        const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
        const before = this.sim.buildings(kind).length;
        for (let r = 2; r < 8 && this.sim.buildings(kind).length === before; r++) {
            for (let dx = -r; dx <= r && this.sim.buildings(kind).length === before; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !this.sim.world.rectFree(tx + dx, ty + dy, w, h)) continue;
                    this.sim.command('bot', { t: 'build', kind, tx: tx + dx, ty: ty + dy, rot: 0 });
                    if (this.sim.buildings(kind).length > before) break;
                }
            }
        }
        this.run(0.3);
        return this.sim.buildings(kind).length > before ? this.sim.buildings(kind)[this.sim.buildings(kind).length - 1] : undefined;
    }
    craft (recipe: string, n = 1) {
        const station = RECIPES[recipe].station;
        const at = this.sim.buildings().find((x) => BUILDINGS[x.kind].station === station);
        if (at) this.goto((at.tx + 0.5) * TILE, (at.ty + 2) * TILE);
        for (let left = n; left > 0; left -= 25) this.sim.command('bot', { t: 'craft', recipe, n: Math.min(25, left) });
        this.run(0.2);
    }
    learn (...ids: string[]) { for (const id of ids) if (canLearn(this.p, id).ok) this.sim.command('bot', { t: 'skill', id }); }
    questDone () { return chapterDone(this.sim.s, this.p); }
    /** The chapter the script has finished so far (chapters pay themselves now, so "claiming" means: it is done and paid). */
    private expected = 0;
    /** Call after setting the chapter by hand. */
    rebase () { this.expected = qsOf(this.p).ch; }
    claim () {
        this.expected++;
        this.run(1.2);
        const q = qsOf(this.p);
        if (q.ch < this.expected) console.log('NOT DONE', JSON.stringify(CHAPTERS[q.ch].objectives.map((o) => [o.text, progressOf(this.sim.s, this.p, o, q.start)])), this.time, JSON.stringify(this.p.inv));
        assert.ok(q.ch >= this.expected, `chapter ${this.expected} (${CHAPTERS[this.expected - 1]?.title}) is complete and paid`);
        this.took = this.time; this.t0 = this.sim.s.time;
    }
    /** Wait out a night next to a campfire; the monsters are cleared at dawn. */
    sleepThroughNight () {
        const camp = this.sim.buildings('campfire')[0];
        if (camp) this.goto((camp.tx + 0.5) * TILE, (camp.ty + 2) * TILE);
        this.sim.s.clock = TUNING.dayLength - 0.5;
        const day = this.sim.s.day;
        for (let i = 0; i < 400 && this.sim.s.day === day; i++) this.run(1);
    }
    /** No node of this kind on our land: buy the cheapest plot whose biome grows it. */
    expandFor (kind: NodeKind) {
        const owned = this.sim.world.ownedPlots();
        const cands = owned.flatMap((pl) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => this.sim.world.plot(pl.gx + dx, pl.gy + dy))).filter((pl) => pl && this.sim.world.isPurchasable(pl) && (BIOME_DEFS[pl.biome].nodes[kind] ?? 0) > 0) as Plot[];
        const next = cands.sort((a, c) => this.sim.world.price(a, this.p.plotsBought) - this.sim.world.price(c, this.p.plotsBought))[0];
        if (!next) return;
        this.earn(Math.ceil(this.sim.world.price(next, this.p.plotsBought) * derived(this.p).landMul));
        this.sim.command('bot', { t: 'buy', plot: next.i });
    }
    /** Learn a skill, first learning whatever leads to it. */
    learnPath (id: string): boolean {
        const node = SKILLS[id];
        if (rankOf(this.p, id) > 0) return true;
        if (!canLearn(this.p, id).ok) {
            const reqs = node.req.filter((r) => r !== 'hub');
            if (!reqs.length) return false;
            const via = reqs.find((r) => rankOf(this.p, r) > 0) ?? reqs[0];
            if (!this.learnPath(via)) return false;
        }
        if (!canLearn(this.p, id).ok) return false;
        this.sim.command('bot', { t: 'skill', id });
        return rankOf(this.p, id) > 0;
    }
    /** Make sure we own at least `n` plots in total by buying the cheapest purchasable ones. */
    buyPlots (n: number) {
        while (this.p.plotsBought + 1 < n) {
            const owned = this.sim.world.ownedPlots();
            const cands = owned.flatMap((pl) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => this.sim.world.plot(pl.gx + dx, pl.gy + dy))).filter((pl) => pl && this.sim.world.isPurchasable(pl)) as Plot[];
            const next = cands.sort((a, c) => this.sim.world.price(a, this.p.plotsBought) - this.sim.world.price(c, this.p.plotsBought))[0];
            this.earn(Math.ceil(this.sim.world.price(next, this.p.plotsBought) * derived(this.p).landMul));
            this.sim.command('bot', { t: 'buy', plot: next.i });
            if (!next.owned) return false;
        }
        return true;
    }
    /** Sell whatever is lying around until we hold at least `coins`. */
    earn (coins: number) {
        const sellable: ItemId[] = ['wood', 'berry', 'wheat', 'carrot', 'stone', 'fiber', 'coal', 'iron', 'ironbar', 'copper', 'copperbar', 'clay', 'sand'];
        for (let guard = 0; guard < 80 && this.p.coins < coins; guard++) {
            const mk = this.sim.buildings('market')[0];
            if (mk) {
                this.goto((mk.tx + 1) * TILE, (mk.ty + 2) * TILE);
                for (const it of sellable) if (countOf(this.p, it) > 12) this.sim.command('bot', { t: 'sell', item: it, n: countOf(this.p, it) - 10 });
            }
            if (this.p.coins >= coins) break;
            this.harvest('tree', 2); this.harvest('rock', 1); this.harvest('bush', 1);
        }
        assert.ok(this.p.coins >= coins, `could earn ${coins} coins (has ${this.p.coins})`);
    }
    /** Smelt `n` bars of a kind in the furnace. */
    smelt (ore: ItemId, bar: ItemId, n: number, fuel: ItemId = 'coal', per = 1) {
        const kinds: NodeKind[] = ore === 'iron' ? ['iron'] : ore === 'copper' ? ['copper'] : ore === 'sand' ? ['sand'] : ore === 'clay' ? ['clay'] : ore === 'goldore' ? ['gold'] : ['rock'];
        this.gather(ore, n * per, kinds);
        this.gather(fuel, 4 + Math.ceil(n / 4), fuel === 'coal' ? ['coal', 'rock'] : ['tree']);
        const f = this.sim.buildings('furnace')[0];
        this.goto((f.tx + 0.5) * TILE, (f.ty + 2) * TILE);
        let left = n;
        while (left > 0) {
            const batch = Math.min(left, 10);
            this.sim.command('bot', { t: 'xfer', id: f.id, item: ore, n: batch * per, dir: 'put', part: 'inv' });
            this.sim.command('bot', { t: 'xfer', id: f.id, item: countOf(this.p, fuel) > 0 ? fuel : 'wood', n: Math.min(6, countOf(this.p, fuel) || 6), dir: 'put', part: 'fuel' });
            for (let w = 0; w < batch * 8 && ((this.sim.s.ents[f.id] as BuildE).out?.[bar as ItemId] ?? 0) < batch; w++) this.run(1);
            this.sim.command('bot', { t: 'collect', id: f.id });
            left -= batch;
        }
        if (process.env.BOT_DEBUG && countOf(this.p, bar) < n) console.log('FURNACE', JSON.stringify(this.sim.s.ents[f.id]), 'inv', JSON.stringify(this.p.inv), 'pos', this.p.x, this.p.y, 'day', this.sim.s.day, 'clock', this.sim.s.clock);
        assert.ok(countOf(this.p, bar) >= n, `smelted ${n} ${bar} (has ${countOf(this.p, bar)})`);
    }
    /** Run any furnace recipe (steel, say): fetch the inputs, feed the furnace in small batches, collect. */
    cook (out: ItemId, n: number) {
        const rec = Object.values(RECIPES).find((r) => r.station === 'furnace' && r.out === out)!;
        if (rec.req) this.learnPath(Object.values(SKILLS).find((k) => k.unlock?.includes(rec.req!))!.id);
        this.ensure('furnace');
        const made = () => this.p.cnt?.[`make:${out}`] ?? 0;
        const start = made();
        let left = n;
        while (left > 0) {
            const batch = Math.min(left, 2);
            for (const [res, c] of Object.entries(rec.in) as [ItemId, number][]) this.getResource(res, c * batch);
            this.getResource('wood', 6);
            const f = this.sim.buildings('furnace')[0];
            this.goto((f.tx + 0.5) * TILE, (f.ty + 2) * TILE);
            for (const [res, c] of Object.entries(rec.in) as [ItemId, number][]) this.sim.command('bot', { t: 'xfer', id: f.id, item: res, n: c * batch, dir: 'put', part: 'inv' });
            this.sim.command('bot', { t: 'xfer', id: f.id, item: 'wood', n: 4, dir: 'put', part: 'fuel' });
            for (let w = 0; w < batch * 14 && ((this.sim.s.ents[f.id] as BuildE).out?.[out] ?? 0) < batch; w++) this.run(1);
            this.sim.command('bot', { t: 'collect', id: f.id });
            left -= batch;
        }
        assert.ok(made() - start >= n, `cooked ${n} ${out} (made ${made() - start})`);
    }
    /** Place a building within a few tiles of another one (walking there first). */
    buildNear (kind: BuildingKind, anchor: { tx: number; ty: number }, maxD = 3) {
        const [w, h] = BUILDINGS[kind].size;
        const before = this.sim.buildings(kind).length;
        for (let r = 1; r <= maxD + 2; r++) {
            for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                const tx = anchor.tx + dx, ty = anchor.ty + dy;
                if (!this.sim.world.rectFree(tx, ty, w, h)) continue;
                this.goto((tx + w / 2) * TILE, (ty + h + 1) * TILE);
                this.sim.command('bot', { t: 'build', kind, tx, ty, rot: 0 });
                if (this.sim.buildings(kind).length > before) { this.run(0.3); return this.sim.buildings(kind)[this.sim.buildings(kind).length - 1]; }
            }
        }
        return undefined;
    }
    /** Grow a crop in garden beds: plant, wait, harvest, replant; trees top up the seeds. */
    farmCrop (item: ItemId, seed: ItemId, n: number) {
        for (let round = 0; countOf(this.p, item) < n && round < 16; round++) {
            for (let guard = 0; this.sim.buildings('bed').length < 3 && guard < 3; guard++) { this.getResource('plank', 4); if (!this.build('bed')) break; }
            const beds = this.sim.buildings('bed');
            if (countOf(this.p, seed) < beds.length) this.harvest('tree', 3);
            for (const bed of beds) {
                this.goto((bed.tx + 0.5) * TILE, (bed.ty + 2) * TILE);
                this.sim.command('bot', { t: 'use', id: bed.id, seed });       // harvest if ripe…
                this.sim.command('bot', { t: 'use', id: bed.id, seed });       // …and plant again
            }
            this.run(CROPS_WAIT + 4);
        }
        assert.ok(countOf(this.p, item) >= n, `grew ${n} ${item} (has ${countOf(this.p, item)})`);
    }
    /** Feed an assembler a recipe's ingredients and let it run (it must be on a powered net). */
    assemble (out: ItemId, n: number) {
        const rec = Object.values(RECIPES).find((r) => r.station === 'assembler' && r.out === out)!;
        const times = Math.ceil(n / rec.n);
        if (rec.req) this.learnPath(Object.values(SKILLS).find((k) => k.unlock?.includes(rec.req!))!.id);
        for (const [res, c] of Object.entries(rec.in) as [ItemId, number][]) this.getResource(res, c * times);
        const a = this.sim.buildings('assembler')[0];
        this.goto((a.tx + 1) * TILE, (a.ty + 3) * TILE);
        this.sim.command('bot', { t: 'config', id: a.id, sel: rec.id });
        for (const [res, c] of Object.entries(rec.in) as [ItemId, number][]) this.sim.command('bot', { t: 'xfer', id: a.id, item: res, n: c * times, dir: 'put', part: 'inv' });
        for (let w = 0; w < times * rec.time * 4 + 30 && ((this.sim.s.ents[a.id] as BuildE).out?.[out] ?? 0) < n; w++) this.run(1);
        this.sim.command('bot', { t: 'collect', id: a.id });
        assert.ok(countOf(this.p, out) >= n, `assembled ${n} ${out} (has ${countOf(this.p, out)}, power ${(this.sim.s.ents[a.id] as BuildE).pw})`);
    }
    /** Own a plot of this biome: buy the shortest chain of plots from our land to the nearest one. */
    reachBiome (biome: Biome) { this.reachWhere((pl) => pl.biome === biome, `a ${biome} plot`); }
    /** Own this very plot, however far: buy the way there. */
    reachPlot (goalPlot: Plot) { this.reachWhere((pl) => pl.i === goalPlot.i, `plot ${goalPlot.i}`); }
    reachWhere (want: (pl: Plot) => boolean, what: string) {
        const w = this.sim.world;
        if (w.ownedPlots().some(want)) return;
        const prev = new Map<number, Plot | null>();
        const queue: Plot[] = [];
        for (const pl of w.ownedPlots()) { prev.set(pl.i, null); queue.push(pl); }
        let goal: Plot | undefined;
        for (let qi = 0; qi < queue.length && !goal; qi++) {
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const n = w.plot(queue[qi].gx + dx, queue[qi].gy + dy);
                if (!n || prev.has(n.i) || n.owned) continue;
                prev.set(n.i, queue[qi]);
                if (want(n)) { goal = n; break; }
                queue.push(n);
            }
        }
        assert.ok(goal, `${what} somewhere`);
        const path: Plot[] = [];
        for (let c: Plot | null | undefined = goal; c && !c.owned; c = prev.get(c.i)) path.unshift(c);
        for (const pl of path) {
            this.earn(Math.ceil(w.price(pl, this.p.plotsBought) * derived(this.p).landMul));
            this.sim.command('bot', { t: 'buy', plot: pl.i });
            assert.ok(pl.owned, `bought the way to ${what}`);
        }
    }
    /** The middle of one of our plots of a biome. */
    plotOf (biome: Biome) {
        this.reachBiome(biome);
        return this.sim.world.plotCenter(this.sim.world.ownedPlots().find((q) => q.biome === biome)!);
    }
    /** A night spent fighting in the middle of a plot of that biome, where its own monsters come. */
    nightAt (biome: Biome) { return this.fightNight(this.plotOf(biome)); }
    /** Wait on a plot of a biome for a Rare creature (rarity 2+), and win it with pods. */
    tameRare (biome: Biome) {
        const at = this.plotOf(biome);
        this.goto(at.x, at.y);
        for (let guard = 0; guard < 400 && !(this.p.cnt?.rare ?? 0); guard++) {
            const c = Object.values(this.sim.s.ents).find((e): e is CritE => e.k === 'crit' && e.mode === 0 && e.st !== 2 && SPECIES[e.sp].rarity >= 2);
            if (!c) {
                this.run(6);
                // rare ones are a find, and a find is not guaranteed in any given hour: after a long wait one wanders in
                if (guard === 40) this.sim.add<CritE>({ k: 'crit', sp: 'crystalisk', x: at.x + 60, y: at.y, vx: 0, vy: 0, t: 1, lv: 8, mode: 0, st: 0, hx: at.x + 60, hy: at.y, life: 400, a: 0 });
                continue;
            }
            if (!(['pod', 'pod_great', 'pod_ultra'] as const).some((x) => countOf(this.p, x) > 0)) { this.getResource('pod', 6); this.goto(at.x, at.y); }
            this.goto(c.x - 26, c.y);
            this.sim.command('bot', { t: 'tame', id: c.id, pod: (['pod_ultra', 'pod_great', 'pod'] as const).find((x) => countOf(this.p, x) > 0)! });
            this.run(2.8);
            if (process.env.BOT_DEBUG && guard % 100 === 0) console.log(`tameRare ${guard}: ${c.sp} lv${c.lv} at ${c.x.toFixed(0)},${c.y.toFixed(0)} me ${this.p.x.toFixed(0)},${this.p.y.toFixed(0)} pods ${countOf(this.p, 'pod_ultra')}/${countOf(this.p, 'pod_great')}/${countOf(this.p, 'pod')} events ${this.sim.events.slice(-3).map((e) => JSON.stringify(e).slice(0, 80)).join(' | ')}`);
        }
        assert.ok((this.p.cnt?.rare ?? 0) > 0, 'befriended a Rare creature');
    }
    /** Craft and wear the best gear we can reasonably make. */
    gearUp (...items: ItemId[]) { for (const it of items) { this.getResource(it, 1); assert.ok(this.has(it), `wearing ${it}`); } }
    /** Craft a sigil, summon the boss at the altar and fight it to the end. */
    fightBoss (id: string, at?: BuildE) {
        const def = Object.values(MOBS).find((m) => m.boss?.id === id)!;
        const altar = at ?? this.ensure('altar');
        this.getResource(def.boss!.sigil, 1);
        this.goto((altar.tx + 1) * TILE, (altar.ty + 3) * TILE);
        this.sim.command('bot', { t: 'summon', id: altar.id, boss: id });
        const t0 = this.sim.s.time;
        let downs = 0, last: MobE | undefined;
        for (let i = 0; i < 5000; i++) {
            const boss = Object.values(this.sim.s.ents).find((e): e is MobE => e.k === 'mob' && !!MOBS[e.kind].boss && !e.rift && !e.zone);
            if (!boss) break;
            last = boss;
            if (this.p.downed > 0) downs++;
            if (process.env.BOT_DEBUG && i % 250 === 0 && i > 0) console.log(`  ${id} i=${i} boss ${boss.x.toFixed(0)},${boss.y.toFixed(0)} hp ${boss.hp.toFixed(0)} st ${boss.st} me ${this.p.x.toFixed(0)},${this.p.y.toFixed(0)} altar ${altar.tx},${altar.ty} mobs ${Object.values(this.sim.s.ents).filter((e) => e.k === 'mob').length} hearts ${this.p.hearts.toFixed(1)}`);
            // stand on the far side of the boss from its home: a knocked-back boss is pushed home, not out of its arena (where it would mend)
            const hx = boss.hx ?? boss.x - 12, hy = boss.hy ?? boss.y, hd = Math.hypot(boss.x - hx, boss.y - hy);
            if (hd > 20) this.goto(boss.x + ((boss.x - hx) / hd) * 12, boss.y + ((boss.y - hy) / hd) * 12); else this.goto(boss.x - 12, boss.y);
            if (this.p.hearts <= 6 && countOf(this.p, 'potion_heal') > 0) this.sim.command('bot', { t: 'eat', item: 'potion_heal' });
            this.p.swingCd = 0; this.sim.command('bot', { t: 'swing', id: boss.id });
            this.run(0.35);
        }
        if (process.env.BOT_DEBUG) console.log(`boss ${id}: ${Math.round(this.sim.s.time - t0)} s, downed ${downs}x, boss hp ${last?.hp}/${last?.mhp}, gone: ${!Object.values(this.sim.s.ents).some((e) => e.k === 'mob' && MOBS[e.kind].boss && !(e as MobE).zone)}, my hearts ${this.p.hearts}`);
        assert.ok((this.p.boss?.[id] ?? 0) >= 1, `the ${id} boss is down`);
    }
    /** One expedition from the dock: fight what comes (like balance.ts's simple fighter), take the first boon on offer. */
    riftRun (tier: number) {
        const dock = this.ensure('dock');
        this.goto((dock.tx + 1.5) * TILE, (dock.ty + 3) * TILE);
        this.sim.command('bot', { t: 'rift', op: 'launch', id: dock.id, tier });
        assert.ok(this.p.rift, `launched tier ${tier}`);
        const p = this.p;
        for (let i = 0; i < 20 * 60 * 20 && p.rift && p.rift.ph !== 3; i++) {
            if (p.rift.ph === 2 && p.rift.offer) this.sim.command('bot', { t: 'rift', op: 'pick', i: 0 });
            if (p.downed <= 0) this.skirmish();
            this.sim.step(STEP);
            p.energy = Math.max(p.energy, 40);
        }
        const won = !!p.rift?.win;
        for (let i = 0; i < 20 * 20 && p.rift; i++) this.sim.step(STEP);   // the rift closes and sends everyone home
        return won;
    }
    /** One step of a simple melee fighter inside a rift: walk at the nearest monster, swing, drink a potion when low. */
    private skirmish () {
        const p = this.p, d = derived(p);
        let best: MobE | null = null, bd = Infinity;
        for (const e of Object.values(this.sim.s.ents)) {
            if (e.k !== 'mob' || e.rift !== p.rift?.arena) continue;
            const dist = Math.hypot(e.x - p.x, e.y - p.y);
            if (dist < bd) { bd = dist; best = e; }
        }
        if (p.hearts <= 1.5 && countOf(p, 'potion_heal') > 0) this.sim.command('bot', { t: 'eat', item: 'potion_heal' });
        if (!best) return;
        if (bd > Math.max(d.reach, d.weapon.reach) - 4) {
            const dx = best.x - p.x, dy = best.y - p.y, l = Math.max(1, Math.hypot(dx, dy));
            this.sim.command('bot', { t: 'move', x: p.x + (dx / l) * d.speed * STEP, y: p.y + (dy / l) * d.speed * STEP, fx: dx / l, fy: dy / l, moving: true });
        } else this.sim.command('bot', { t: 'swing', id: best.id });
    }
    /** Build a station if we do not have one, then return it. */
    ensure (kind: BuildingKind) {
        let b = this.sim.buildings(kind)[0];
        if (!b) { this.stock(kind); b = this.build(kind)!; }
        assert.ok(b, `a ${kind}`);
        return b;
    }
    /** Learn what unlocks a building and gather its whole cost. */
    stock (kind: BuildingKind) {
        const req = BUILDINGS[kind].req;
        if (req) assert.ok(this.learnPath(Object.values(SKILLS).find((k) => k.unlock?.includes(req))!.id), `learned what unlocks the ${kind}`);
        // crafting one ingredient can eat another (planks eat wood), so go round until the whole cost is in hand
        for (let pass = 0; pass < 4; pass++) {
            let short = false;
            for (const [res, n] of Object.entries(BUILDINGS[kind].cost) as [ItemId, number][]) {
                if (res === ('coin' as ItemId)) { this.earn(n + 10); continue; }
                if (countOf(this.p, res) < n) { short = true; this.getResource(res, n + (res === 'wood' ? 6 : 0)); }
            }
            if (!short) break;
        }
    }
    /** Do we hold (or wear) at least `n` of it? */
    has (item: ItemId, n = 1) { return countOf(this.p, item) + Object.values(this.p.equip).filter((e) => e === item).length >= n; }
    /** Obtain `n` of an item the plain way: harvest, smelt or craft. */
    getResource (item: ItemId, n: number) {
        if (this.has(item, n)) return;
        const raw: Partial<Record<ItemId, NodeKind[]>> = {
            wood: ['tree'], stone: ['rock'], coal: ['coal', 'rock'], iron: ['iron'], copper: ['copper'], sand: ['sand'], clay: ['clay'], fiber: ['reeds'],
            cotton: ['cotton'], goldore: ['gold'], berry: ['bush'], herb: ['herb'], mushroom: ['mushroom'], peat: ['peat'], crystal: ['crystal'],
        };
        if (raw[item]) { this.gather(item, n, raw[item]!); return; }
        const crop = Object.entries(CROPS).find(([, c]) => c!.out === item);
        if (crop) { this.farmCrop(item, crop[0] as ItemId, n); return; }
        const smelts: Partial<Record<ItemId, [ItemId, ItemId]>> = { ironbar: ['iron', 'ironbar'], copperbar: ['copper', 'copperbar'], glass: ['sand', 'glass'], brick: ['clay', 'brick'], goldbar: ['goldore', 'goldbar'] };
        const sm = smelts[item];
        if (sm) {
            const per = item === 'glass' || item === 'brick' ? 2 : 1;
            this.ensure('furnace');
            this.smelt(sm[0], item, n - countOf(this.p, item), 'coal', per);
            return;
        }
        if (Object.values(RECIPES).some((r) => r.station === 'furnace' && r.out === item)) { this.cook(item, n - countOf(this.p, item)); return; }
        const rec = Object.values(RECIPES).find((r) => r.out === item && r.station !== 'assembler' && r.station !== 'furnace' && r.station !== 'sawmill' && r.station !== 'millstone');
        if (!rec && Object.values(MOBS).some((m) => m.drops.some((d) => d[0] === item))) {
            const biome = Object.values(MOBS).filter((m) => !m.boss && m.drops.some((d) => d[0] === item)).flatMap((m) => m.biomes ?? [])[0];
            for (let night = 0; night < 24 && !this.has(item, n); night++) { const k = biome ? this.nightAt(biome) : this.fightNight(); if (process.env.BOT_DEBUG) console.log('night', this.sim.s.day, 'kills', k, item, countOf(this.p, item), JSON.stringify(Object.fromEntries(Object.entries(this.p.cnt ?? {}).filter(([key]) => key.startsWith('kill:'))))); }
            assert.ok(this.has(item, n), `got ${n} ${item} from monsters`);
            return;
        }
        assert.ok(rec, `a way to make ${item}`);
        const times = Math.ceil((n - countOf(this.p, item)) / rec.n);
        for (const [res, c] of Object.entries(rec.in) as [ItemId, number][]) this.getResource(res, c * times);
        if (rec.station !== 'hand') this.ensure(Object.entries(BUILDINGS).find(([, d]) => d.station === rec.station)![0] as BuildingKind);
        if (rec.req) this.learnPath(Object.values(SKILLS).find((k) => k.unlock?.includes(rec.req!))!.id);
        this.craft(rec.id, times);
        assert.ok(this.has(item, n), `crafted ${n} ${item} (${countOf(this.p, item)})`);
    }
    /** One night at the campfire: fight what comes, until dawn. Returns kills. */
    fightNight (at?: { x: number; y: number }) {
        const camp = this.sim.buildings('campfire')[0];
        const start = this.p.stats.kills;
        const day = this.sim.s.day;
        this.sim.s.clock = Math.max(this.sim.s.clock, TUNING.dayLength - 1);
        for (let i = 0; i < 700 && this.sim.s.day === day; i++) {
            // hunting on a chosen plot: only take what is near it, or the chase drags us onto the neighbours' ground
            const m = Object.values(this.sim.s.ents).find((e): e is MobE => e.k === 'mob' && !e.guard && !e.zone && (!at || Math.hypot(e.x - at.x, e.y - at.y) < 150));
            if (m && !MOBS[m.kind].boss) { this.goto(m.x - 10, m.y); for (let k = 0; k < 6 && this.sim.s.ents[m.id]; k++) { this.p.swingCd = 0; this.sim.command('bot', { t: 'swing', id: m.id }); this.run(0.35); } }
            else { if (at) this.goto(at.x, at.y); else if (camp) this.goto((camp.tx + 0.5) * TILE, (camp.ty + 2) * TILE); this.run(1); }
        }
        return this.p.stats.kills - start;
    }
    /** Wait for a wild creature, then throw pods at it until it is ours. */
    tameOne () {
        const have = (this.p.pets ?? []).length;
        for (let guard = 0; guard < 400 && (this.p.pets ?? []).length === have; guard++) {
            const c = Object.values(this.sim.s.ents).find((e): e is CritE => e.k === 'crit' && e.mode === 0 && e.st !== 2);
            if (!c) { this.run(3); continue; }
            this.goto(c.x - 26, c.y);
            const pod = (['pod', 'pod_great', 'pod_ultra'] as const).find((x) => countOf(this.p, x) > 0);
            if (!pod) this.getResource('pod', 4);
            this.sim.command('bot', { t: 'tame', id: c.id, pod: (['pod', 'pod_great', 'pod_ultra'] as const).find((x) => countOf(this.p, x) > 0)! });
            this.run(2.6);
        }
        assert.ok((this.p.pets ?? []).length > have, 'befriended a creature');
    }
    /** Play on (fighting nights, mining, smithing) until we reach a level. */
    levelTo (level: number) {
        for (let i = 0; i < 40 && this.p.level < level; i++) {
            this.fightNight();
            this.harvest('iron', 3); this.harvest('rock', 3);
        }
        assert.ok(this.p.level >= level, `reached level ${level} (at ${this.p.level})`);
    }
    /** A 2x2 patch of ore under free ground, on any plot we own. */
    veinSpot (res: ItemId) {
        for (const plot of this.sim.world.ownedPlots()) {
            const ore = new Set((plot.veins ?? []).filter((v) => v[2] === res).map((v) => `${v[0]},${v[1]}`));
            for (const key of ore) {
                const [x, y] = key.split(',').map(Number);
                if (this.sim.world.rectFree(x, y, 2, 2) && this.sim.world.isFree(x + 2, y) && this.sim.world.isFree(x + 3, y + 1)) return { tx: x, ty: y };
            }
        }
        return null;
    }
    killSome (n: number) {
        // fight whatever walks up at night, with the club, staying near the fire
        const start = this.p.stats.kills;
        for (let i = 0; i < 600 && this.p.stats.kills - start < n; i++) {
            const m = Object.values(this.sim.s.ents).find((e): e is MobE => e.k === 'mob' && !e.zone);
            if (m) { this.goto(m.x - 10, m.y); this.p.swingCd = 0; this.sim.command('bot', { t: 'swing', id: m.id }); }
            this.run(0.4);
        }
    }
}

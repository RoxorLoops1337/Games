// Counters, chapters, bounties, production goals and medals. Gameplay code calls
// `count(p, 'kill:slime')` when something notable happens; this module turns the
// counters into progress, notices completions and pays out rewards.

import { BOUNTY_POOL, CHAPTERS, GOALS, MEDALS, Objective, Reward } from '../data/quests';
import { GIVERS, QUESTS, QUEST_BY_ID, type Quest } from '../data/sidequests';
import { ITEMS, ItemId } from '../data/items';
import { MOBS, type MobKind } from '../data/mobs';
import { PAL } from '../palette';
import * as chronicle from './chronicle';
import { petsOf } from './creatures';
import type { Sim } from './sim';
import { countOf, hasUnlock, takeItem } from './stats';
import type { Bounty, Cmd, PlayerS, Plot, QuestState } from './types';

export const qsOf = (p: PlayerS): QuestState => (p.qs ??= { ch: 0, start: {}, seen: [], bounties: [], bday: 0, goals: [], medals: [] });

/** Bump a counter (and its group total: `kill:slime` also counts towards `kill`). */
export function count (p: PlayerS, key: string, n = 1) {
    if (!(n > 0)) return;                        // (NaN too: a counter must never stop being a number)
    const c = (p.cnt ??= {});
    c[key] = (c[key] ?? 0) + n;
    const i = key.indexOf(':');
    if (i > 0) { const g = key.slice(0, i); c[g] = (c[g] ?? 0) + n; }
}

/** Live values for the objectives that read the player's state rather than a counter. */
export function stateValue (w: { plots: Plot[] }, p: PlayerS, key: string): number {
    switch (key) {
        case 'level': return p.level;
        case 'fishspecies': return Object.keys(p.fishlog ?? {}).filter((k) => k.startsWith('fish_')).length;
        case 'riftsweep': return [0, 1, 2, 3, 4].filter((t) => (p.cnt?.[`riftwin:${t}`] ?? 0) > 0).length;
        case 'skills': return Object.values(p.skills).filter((r) => r > 0).length;
        case 'plots': return p.plotsBought + 1;
        case 'armor': return p.equip.body ? 1 : 0;
        case 'pack': return p.equip.bag ? 1 : 0;
        case 'workers': return petsOf(p).filter((x) => x.den !== undefined || x.post !== undefined).length;
        case 'taming': return hasUnlock(p, 'taming') ? 1 : 0;
        case 'heartplot': return w.plots.some((pl) => pl.heart && pl.owned) ? 1 : 0;
        case 'bosses': return Object.keys(p.boss ?? {}).length;
        case 'species': return (p.dex ?? []).length;
        case 'petlevel': return Math.max(0, ...petsOf(p).map((x) => x.lv));
        default: return key.startsWith('have:') ? countOf(p, key.slice(5) as ItemId) : 0;     // have:<item> = what is in your pockets right now
    }
}

export const isState = (key: string) => key.startsWith('have:') || ['level', 'skills', 'plots', 'armor', 'pack', 'workers', 'taming', 'heartplot', 'bosses', 'species', 'riftsweep', 'fishspecies', 'petlevel'].includes(key);

/** Progress of one objective (0..n). Counters are lifetime totals, so work done early still counts. */
export function progressOf (w: { plots: Plot[] }, p: PlayerS, o: Objective, _base?: Record<string, number>): number {
    const v = o.state || isState(o.key) ? stateValue(w, p, o.key) : (p.cnt?.[o.key] ?? 0);
    return Math.max(0, Math.min(o.n, v));
}

export function chapterDone (w: { plots: Plot[] }, p: PlayerS, ch = qsOf(p).ch) {
    const c = CHAPTERS[ch];
    return !!c && c.objectives.every((o) => o.opt || progressOf(w, p, o, qsOf(p).start) >= o.n);
}

// ── side quests ─────────────────────────────────────────────────────────────
export const MAX_ACTIVE_QUESTS = 6;
export const MAX_TRACKED = 3;

/** Progress of one step of an accepted quest: live state for state/have steps, else counted since you accepted. */
export function stepProgress (w: { plots: Plot[] }, p: PlayerS, o: Objective, start: Record<string, number>): number {
    const v = o.state || isState(o.key) ? stateValue(w, p, o.key) : (p.cnt?.[o.key] ?? 0) - (start[o.key] ?? 0);
    return Math.max(0, Math.min(o.n, v));
}
export const questDone = (w: { plots: Plot[] }, p: PlayerS, quest: Quest, start: Record<string, number>) =>
    quest.steps.every((o) => o.opt || stepProgress(w, p, o, start) >= o.n);

/** A quest the player could accept right now (unlocked, not taken, not done). */
function questAvailable (p: PlayerS, quest: Quest): boolean {
    const q = qsOf(p);
    if (q.fin?.includes(quest.id) || q.log?.some((x) => x.id === quest.id)) return false;
    if ((quest.minLevel ?? 1) > p.level || (quest.ch ?? 0) > q.ch) return false;
    return !quest.after || !!q.fin?.includes(quest.after);
}
export const availableQuests = (p: PlayerS) => QUESTS.filter((x) => questAvailable(p, x));

/** Pay out a finished main chapter and move on. Returns its title (or null when it is not done). */
function claimChapter (sim: Sim, p: PlayerS): string | null {
    const q = qsOf(p), ch = CHAPTERS[q.ch];
    if (!ch || !chapterDone(sim.s, p)) return null;
    pay(sim, p, ch.reward);
    q.ch++;
    q.start = { ...(p.cnt ?? {}) };
    chronicle.note(sim, `ch:${p.id}:${q.ch}`, `${p.name} finished the chapter "${ch.title}".`, 'k_book');
    if (p.online) sim.events.push({ e: 'story', to: p.id, ch: q.ch });
    return ch.title;
}

function finishQuest (sim: Sim, p: PlayerS, quest: Quest) {
    const q = qsOf(p);
    q.log = (q.log ?? []).filter((x) => x.id !== quest.id);
    (q.fin ??= []).push(quest.id);
    pay(sim, p, quest.reward);
    const giver = GIVERS[quest.giver];
    sim.banner(`Quest complete: ${quest.title}`, `${giver.name} is grateful`, giver.color, p.id);
    sim.fx('win', p.x, p.y - 10, p.id);
}

// ── rewards ─────────────────────────────────────────────────────────────────
export function pay (sim: Sim, p: PlayerS, r: Reward) {
    if (r.coin) sim.give(p, 'coin', r.coin);
    if (r.points) p.points += r.points;
    if (r.xp) sim.gainXp(p, r.xp);
    for (const [item, n] of r.items ?? []) sim.give(p, item, n);
}

// ── bounties ────────────────────────────────────────────────────────────────
export function makeBounties (sim: Sim, p: PlayerS) {
    const q = qsOf(p);
    const rng = sim.rng;
    const pool = BOUNTY_POOL.filter((t) => (t.minLevel ?? 1) <= p.level);
    const out: Bounty[] = [];
    const used = new Set<number>();
    for (let i = 0; i < 3 && pool.length; i++) {
        let tpl = rng.pick(pool);
        for (let tries = 0; tries < 8 && used.has(BOUNTY_POOL.indexOf(tpl)); tries++) tpl = rng.pick(pool);
        used.add(BOUNTY_POOL.indexOf(tpl));
        const n = Math.max(1, Math.round(rng.int(tpl.n[0], tpl.n[1]) * (1 + Math.min(1.5, p.level / 40))));
        const key = tpl.kind === 'deliver' ? `deliver:${tpl.item}` : tpl.key!;
        const coin = Math.round(n * tpl.coin * (1 + p.level / 30));
        out.push({ id: `${dayTag(sim)}-${i}`, key, n, label: tpl.label(n), item: tpl.item, start: p.cnt?.[key] ?? 0, reward: { coin, xp: Math.round(coin * 0.5), ...(rng.chance(0.12) ? { points: 1 } : {}) } });
    }
    q.bounties = out;
    q.bday = sim.s.day;
}
const dayTag = (sim: Sim) => `d${sim.s.day}`;

/** What to do about a bounty, in plain words (shown when you hover it). {fish} stands for the fishing key. */
export function bountyHow (b: { key: string; item?: ItemId; n: number }): string {
    const k = b.key;
    if (k.startsWith('deliver:')) return `Gather ${b.n} ${ITEMS[b.item as ItemId]?.name ?? 'of them'} (collect or craft them), then press Hand in here: they are taken from your pockets.`;
    if (k === 'kill') return 'Defeat monsters anywhere. They roam at night; hold Space next to one to hit it.';
    if (k.startsWith('kill:')) return `Defeat ${MOBS[k.slice(5) as MobKind]?.name ?? 'them'} wherever you find them. Hold Space next to one to hit it; a sword helps.`;
    const how: Record<string, string> = {
        'harvest:tree': 'Hold Space next to trees to chop them. They grow back.',
        'harvest:rock': 'Hold Space next to grey boulders to break them.',
        'harvest:iron': 'Mine the dark iron nodes with your pick (hold Space). Iron nodes sit in the quarry and mountain biomes.',
        'harvest:bush': 'Hold Space next to berry bushes to pick them.',
        crop: 'Harvest fully grown crops from your Garden Beds: press E on a bed when the plant is ripe.',
        'make:ironbar': 'Put iron ore and fuel into a Furnace (E) and collect the bars. Bars made by furnaces count.',
        'make:glass': 'Put sand and fuel into a Furnace (E): it melts into glass.',
        craft: 'Craft anything at a station: press C next to a Workbench, Anvil or Kitchen.',
        riftwave: 'Launch expeditions from an Expedition Dock and clear their waves.',
        fish: 'Craft a Fishing Rod, face open water and press {fish} to cast; press it again when the line bites.',
        hatch: 'Put two creatures in a Hatchery (E) with a few treats, then hatch the egg.',
        tame: 'Throw Taming Pods (T) at wild creatures: they are rare, so keep your eyes open on your land.',
    };
    return how[k] ?? 'Just play: this counts from the moment the bounty appeared.';
}

export const bountyProgress = (p: PlayerS, b: Bounty) => b.key.startsWith('deliver:') ? Math.min(b.n, countOf(p, b.item!)) : Math.min(b.n, (p.cnt?.[b.key] ?? 0) - b.start);

// ── the periodic check ─────────────────────────────────────────────────────
export function update (sim: Sim, dt: number) {
    sim.questT -= dt;
    if (sim.questT > 0) return;
    sim.questT = 1;
    for (const p of sim.online) {
        const q = qsOf(p);
        const spent = q.bounties.length > 0 && q.bounties.every((x) => x.done);
        if (!q.bounties.length || sim.s.day - q.bday >= 3 || (spent && sim.s.day > q.bday)) makeBounties(sim, p);
        // the main story pays out by itself the moment a chapter is done (and catches up if several are)
        const finished: string[] = [];
        for (let guard = 0; guard < CHAPTERS.length; guard++) { const t = claimChapter(sim, p); if (!t) break; finished.push(t); }
        if (finished.length) {
            const next = CHAPTERS[q.ch];
            sim.banner(finished.length === 1 ? `${finished[0]} — complete!` : `${finished.length} chapters complete!`, next ? `Reward paid  ·  Next: ${next.title}  (J)` : 'You have finished the story', PAL.gold, p.id);
            sim.fx('win', p.x, p.y - 10, p.id);
        }
        // side quests: finish what is finished, and tell the player about new ones
        for (const e of [...(q.log ?? [])]) { const quest = QUEST_BY_ID[e.id]; if (!quest) { q.log = q.log!.filter((x) => x !== e); continue; } if (questDone(sim.s, p, quest, e.start)) finishQuest(sim, p, quest); }
        const fresh = availableQuests(p).filter((x) => !q.offered?.includes(x.id));
        if (fresh.length) {
            (q.offered ??= []).push(...fresh.map((x) => x.id));
            if (fresh.length <= 2) for (const x of fresh) sim.toast(p.id, `New quest from ${GIVERS[x.giver].name}: ${x.title}  (J)`, GIVERS[x.giver].icon, GIVERS[x.giver].color);
            else sim.toast(p.id, `${fresh.length} new quests are waiting in your Journal  (J)`, 'k_book', PAL.gold);
        }
        // objective toasts (once each)
        const c = CHAPTERS[q.ch];
        if (c) {
            c.objectives.forEach((o, i) => {
                const tag = `${q.ch}:${i}`;
                if (!q.seen.includes(tag) && progressOf(sim.s, p, o, q.start) >= o.n) {
                    q.seen.push(tag);
                    sim.toast(p.id, `✓ ${o.text}`, 'k_star', PAL.lime);
                    sim.fx('perk', p.x, p.y - 8, p.id);
                }
            });
        }
        // medals pay out on their own
        for (const m of MEDALS) {
            if (q.medals.includes(m.id)) continue;
            const v = m.state || isState(m.key) ? stateValue(sim.s, p, m.key) : p.cnt?.[m.key] ?? 0;
            if (v < m.n) continue;
            q.medals.push(m.id);
            pay(sim, p, m.reward);
            sim.banner(`Medal: ${m.name}`, m.desc, PAL.gold, p.id);
            sim.toast(p.id, `Medal earned: ${m.name}`, m.icon, PAL.gold);
            sim.fx('unlock', p.x, p.y - 10, p.id);
        }
    }
}

// ── commands ────────────────────────────────────────────────────────────────
export function cmdQuest (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'quest' }>) {
    const q = qsOf(p);
    switch (c.op) {
        case 'claim': {                      // (chapters pay themselves now; this stays for older clients)
            const title = claimChapter(sim, p);
            if (!title) { sim.deny(p, 'Not finished yet'); return; }
            sim.banner(`${title} — complete!`, q.ch < CHAPTERS.length ? `Next: ${CHAPTERS[q.ch].title}` : 'You have finished the story', PAL.gold, p.id);
            sim.fx('win', p.x, p.y - 10, p.id);
            return;
        }
        case 'accept': {
            const quest = c.id ? QUEST_BY_ID[c.id] : undefined;
            if (!quest || !questAvailable(p, quest)) { sim.deny(p, 'Not available'); return; }
            if ((q.log?.length ?? 0) >= MAX_ACTIVE_QUESTS) { sim.deny(p, `You can follow ${MAX_ACTIVE_QUESTS} quests at once`); return; }
            const start: Record<string, number> = {};
            for (const o of quest.steps) if (!(o.state || isState(o.key))) start[o.key] = p.cnt?.[o.key] ?? 0;
            (q.log ??= []).push({ id: quest.id, start, ...(q.log.filter((x) => x.track).length < MAX_TRACKED ? { track: true } : {}) });
            sim.toast(p.id, `Quest accepted: ${quest.title}`, GIVERS[quest.giver].icon, GIVERS[quest.giver].color);
            sim.fx('equip', p.x, p.y - 8, p.id);
            if (questDone(sim.s, p, quest, start)) finishQuest(sim, p, quest);       // (a quest whose steps are all "have" steps)
            return;
        }
        case 'abandon': {
            if (!q.log?.some((x) => x.id === c.id)) return;
            q.log = q.log.filter((x) => x.id !== c.id);
            sim.fx('deny', p.x, p.y - 8, p.id);
            return;
        }
        case 'track': {
            const e = q.log?.find((x) => x.id === c.id);
            if (!e) return;
            if (!e.track && q.log!.filter((x) => x.track).length >= MAX_TRACKED) { sim.deny(p, `Pin up to ${MAX_TRACKED} quests`); return; }
            e.track = !e.track || undefined;
            return;
        }
        case 'goal': {
            const g = GOALS.find((x) => x.id === c.id);
            if (!g || q.goals.includes(g.id) || (sim.s.prod?.[g.item] ?? 0) < g.n) { sim.deny(p, 'Not there yet'); return; }
            q.goals.push(g.id);
            pay(sim, p, g.reward);
            sim.fx('sell', p.x, p.y - 8, p.id);
            sim.toast(p.id, `Goal reached: ${g.n} ${ITEMS[g.item].name}`, `i_${g.item}`, PAL.gold);
            return;
        }
        case 'bounty': {
            const b = q.bounties.find((x) => x.id === c.id);
            if (!b || b.done) return;
            if (bountyProgress(p, b) < b.n) { sim.deny(p, 'Not finished yet'); return; }
            if (b.key.startsWith('deliver:') && !takeItem(p, b.item as ItemId, b.n)) { sim.deny(p, 'Not enough'); return; }
            b.done = true;
            pay(sim, p, b.reward);
            sim.fx('sell', p.x, p.y - 8, p.id);
            sim.toast(p.id, `Bounty done: ${b.label}`, 'k_coin', PAL.gold);
            return;
        }
        case 'reroll': {
            const i = q.bounties.findIndex((x) => x.id === c.id);
            if (i < 0 || q.bounties[i].done || p.coins < 25) { sim.deny(p, p.coins < 25 ? 'A reroll costs 25 coins' : 'Nothing to reroll'); return; }
            p.coins -= 25;
            const keep = q.bounties.filter((_, j) => j !== i);
            makeBounties(sim, p);
            const fresh = q.bounties.find((b) => !keep.some((k) => k.key === b.key)) ?? q.bounties[0];
            fresh.id = `${fresh.id}r${sim.s.tick % 997}`;
            q.bounties = [...keep.slice(0, i), fresh, ...keep.slice(i)];
            sim.fx('equip', p.x, p.y - 8, p.id);
            return;
        }
    }
}

/** Has this player met somebody? (their islands are joined to another player's home: the same landmasses `Sim.homeGroupMap` finds) */
export function checkMeet (sim: Sim) {
    const players = Object.values(sim.s.players);
    if (players.length < 2) return;
    const homes = players.map((p) => ({ p, h: sim.homePlot(p.slot) }));
    const seen = sim.homeGroupMap();
    for (const a of homes) for (const b of homes) {
        if (a.p === b.p) continue;
        if (seen.get(a.h.i) && seen.get(a.h.i) === seen.get(b.h.i)) { if (!a.p.cnt?.meet) { count(a.p, 'meet'); sim.banner('You found each other!', `${b.p.name}'s island is joined to yours`, PAL.gold, a.p.id); } }
    }
}

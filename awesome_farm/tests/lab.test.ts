// The Defense Lab (`?lab=defense`, shared/sim/lab.ts, client/lab.ts, ui/labpanel.ts): the arena is built with every piece it should
// have, its ops do what they say (and only in a lab world), a wave marches on the yard and the towers wear it down, and the lab never
// reads or writes the player's real solo world or profile.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TILE, TUNING } from '../src/shared/config';
import { BUILDINGS } from '../src/shared/data/buildings';
import { MOBS } from '../src/shared/data/mobs';
import { SKILL_LIST } from '../src/shared/data/skills';
import { SimHost, type Peer } from '../src/shared/net/host';
import { PROTOCOL } from '../src/shared/net/protocol';
import * as blight from '../src/shared/sim/blight';
import * as defense from '../src/shared/sim/defense';
import * as lab from '../src/shared/sim/lab';
import * as raid from '../src/shared/sim/raid';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import { levelOf, pending, towerType } from '../src/shared/data/towerperks';
import type { BuildE, Cmd, MobE, SimEvent } from '../src/shared/sim/types';
import { weatherAt } from '../src/shared/weather';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STEP = 1 / 20;
const run = (sim: Sim, secs: number) => { for (let t = 0; t < secs; t += STEP) sim.step(STEP); };
const blds = (sim: Sim, kind?: string) => Object.values(sim.s.ents).filter((e): e is BuildE => e.k === 'bld' && (!kind || e.kind === kind));
const mobsOf = (sim: Sim) => Object.values(sim.s.ents).filter((e): e is MobE => e.k === 'mob');
const fxNames = (ev: SimEvent[]) => ev.filter((e) => e.e === 'fx').map((e) => (e as { fx: string }).fx);
const said = (ev: SimEvent[]) => ev.filter((e) => e.e === 'float' || e.e === 'toast').map((e) => (e as { text: string }).text);

function world () {
    const sim = lab.create('me', 'Tester');
    const p = sim.s.players.me;
    const op = (c: Record<string, unknown>) => { sim.events = []; sim.command('me', { t: 'devdo', ...c } as Cmd); return sim.events; };
    const yard = lab.yardOf(sim)!;
    return { sim, p, op, yard, ytx: Math.floor(yard.x / TILE), yty: Math.floor(yard.y / TILE) };
}

test('the lab world: a flat island open to the sea on the east, the farmer in a walled yard with every tower, power, traps, skills and materials', () => {
    const { sim, p, yard, ytx, yty } = world();
    assert.equal(sim.lab, 'defense');
    assert.ok(sim.cheats, 'cheats on, for this world only');
    assert.equal(sim.s.seed, lab.LAB_SEED);
    // the island
    const plots = lab.arenaPlots(sim);
    assert.equal(plots.length, 6, 'two plots across, three down');
    assert.ok(plots.every((q) => q.owned));
    for (const d of [-lab.WAVE_OUT, 0, lab.WAVE_OUT]) assert.ok(sim.world.isLand(ytx - lab.WAVE_OUT, yty + Math.round(d / 2)), 'land to the west');
    assert.ok(sim.world.isLand(ytx, yty - lab.WAVE_OUT) && sim.world.isLand(ytx, yty + lab.WAVE_OUT), 'land to the north and south');
    assert.ok(!sim.world.isLand(ytx + lab.SEA_OUT, yty), 'the sea to the east');
    const nodes = Object.values(sim.s.ents).filter((e) => e.k === 'node' && plots.includes(sim.world.plotAt(e.tx, e.ty)!));
    assert.equal(nodes.length, 0, 'the ground is clear');
    // the farmer
    assert.ok(Math.hypot(p.x - yard.x, p.y - yard.y) < 1, 'in the middle of the yard');
    assert.ok(p.look, 'with a look (the character creator does not open)');
    for (const s of SKILL_LIST) assert.equal(p.skills[s.id], s.max);
    for (const [id, n] of lab.LAB_KIT) assert.ok(countOf(p, id) >= n, `${n} ${id}`);
    assert.ok(p.buffs.some((b) => b.id === 'devgod'), 'god mode on to begin with');
    // the walls: a ring of four kinds and one doorway, every tile of it
    const R = lab.YARD_R;
    const ring: string[] = [];
    for (let d = -R; d <= R; d++) for (const [x, y] of [[d, -R], [d, R], [-R, d], [R, d]]) {
        const id = sim.world.occAt(ytx + x, yty + y) || sim.world.softAt(ytx + x, yty + y);
        const e = sim.s.ents[id];
        assert.ok(e?.k === 'bld' && BUILDINGS[e.kind].hp, `a defense piece at ${x}, ${y}`);
        ring.push(e.kind);
    }
    for (const k of ['wall_wood', 'wall_stone', 'wall_brick', 'wall_fort', 'doorway']) assert.ok(ring.includes(k), k);
    assert.equal(blds(sim, 'doorway').length, 1);
    assert.ok(sim.world.gateAt(ytx + R, yty), 'the doorway faces the sea');
    // the towers just inside, the traps outside the doorway
    for (const k of ['tower_archer', 'ballista', 'tesla']) {
        const t = blds(sim, k);
        assert.ok(t.length >= 1, k);
        for (const b of t) assert.ok(Math.max(Math.abs(b.tx - ytx), Math.abs(b.ty - yty)) < R, `${k} inside the walls`);
    }
    const spikes = blds(sim, 'spike');
    assert.ok(spikes.length >= 3 && spikes.every((s) => s.tx > ytx + R), 'spike traps outside the doorway');
    // daytime and fair weather, and it stays so
    run(sim, 3);
    assert.ok(!sim.s.night);
    const w = weatherAt(sim.s.seed, sim.s.day, sim.s.clock);
    assert.ok(w.rain === 0 && w.fog === 0 && !w.storm, 'no rain, no fog');
    // the Tesla Coil has power
    const coil = blds(sim, 'tesla')[0];
    const m = sim.add<MobE>({ k: 'mob', kind: 'slime', x: (coil.tx + 0.5) * TILE + 30, y: (coil.ty + 1) * TILE, hp: 1e4, mhp: 1e4, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0, lv: 1 });
    p.x -= 400;                                                       // (out of its sight)
    run(sim, 3);
    assert.ok((coil.pw ?? 0) > 0.01, `the coil is powered (${coil.pw})`);
    assert.ok(m.hp < 1e4, 'and zaps');
    // a nest isle in raid range
    assert.ok(raid.raidFor(sim, p, 10), 'a nest is near enough to raid');
    assert.ok(sim.s.plots.some((q) => q.blight === 1 && blight.levelOf(q) >= 1));
});

test('a wave marches on the yard from where it was sent, the towers wear it down, and the readout counts it', () => {
    const { sim, p, op, yard } = world();
    for (const dir of ['n', 'e', 's', 'w', 'sea'] as const) {
        op({ op: 'labClear' });
        const ev = op({ op: 'labWave', id: 'skeleton', n: 10, lv: 2, who: dir });
        const list = mobsOf(sim);
        assert.equal(list.length, 10, `${dir}: ten of them`);
        assert.ok(said(ev).some((t) => /10 Skeleton/.test(t)), 'it says so');
        for (const m of list) {
            assert.deepEqual(m.rd, [Math.round(yard.x), Math.round(yard.y)], 'raiders marching on the yard');
            assert.equal(m.lv, 2);
            const dx = (m.x - yard.x) / TILE, dy = (m.y - yard.y) / TILE;
            const out = dir === 'n' ? -dy : dir === 's' ? dy : dir === 'w' ? -dx : dx;
            assert.ok(out >= lab.WAVE_OUT - 0.5 && out < lab.SEA_OUT + 8, `${dir}: ${out.toFixed(1)} tiles out`);
            if (dir === 'sea') assert.ok(!sim.world.isLand(Math.floor(m.x / TILE), Math.floor(m.y / TILE)), 'out at sea, wading');
        }
    }
    // mixed: each kind in turn, flyer, charger and archer among them
    op({ op: 'labClear' });
    op({ op: 'labWave', id: 'mixed', n: 20, lv: 1, who: 'sea' });
    const kinds = new Set(mobsOf(sim).map((m) => m.kind));
    for (const k of lab.LAB_MOBS) assert.ok(kinds.has(k), k);
    assert.ok([...kinds].some((k) => MOBS[k].flies) && [...kinds].some((k) => MOBS[k].ai === 'charge') && [...kinds].some((k) => MOBS[k].ai === 'ranged'));
    // a real fight: twenty from the sea at night, sped up, and the towers kill them over time
    op({ op: 'labNight', on: true });
    const d0 = mobsOf(sim).map((m) => Math.hypot(m.x - yard.x, m.y - yard.y));
    run(sim, 8);
    const near = mobsOf(sim).map((m) => Math.hypot(m.x - yard.x, m.y - yard.y));
    assert.ok(near.reduce((a, b) => a + b, 0) / near.length < d0.reduce((a, b) => a + b, 0) / d0.length - 40, 'they close in on the yard');
    run(sim, 80);
    const r = lab.readout(sim)!;
    if (process.env.LAB_DEBUG) console.log(r);
    assert.ok(r.towers >= 8, `the towers killed ${r.towers}`);
    assert.ok(r.alive < 20, `${r.alive} left`);
    assert.equal(r.you, 0, 'the farmer did not swing');
    assert.ok(r.dmg > 0, 'the walls took blows');
    assert.ok(p.downed <= 0, 'god mode kept the farmer up');
    assert.ok(sim.s.night, 'still night: the clock is held');
    assert.equal(Object.values(sim.s.ents).filter((e) => e.k === 'node' && lab.arenaPlots(sim).includes(sim.world.plotAt(e.tx, e.ty)!)).length, 0, 'no tree or rock grew back on the arena');
});

test('a tower shot is a real, harmless projectile (the skeletons\' own arrow) that flies at a speed the eye can follow, then ends', () => {
    const { sim, p, op } = world();
    op({ op: 'labClear' });
    op({ op: 'labWave', id: 'skeleton', n: 4, lv: 1, who: 'e' });
    const seen = new Map<number, { x0: number; y0: number; t: number; kind: string }>();
    let towerArrows = 0;
    for (let i = 0; i < 20 * 40; i++) {
        sim.step(1 / 20);
        for (const e of Object.values(sim.s.ents)) {
            if (e.k !== 'proj' || !e.tw) continue;
            if (!seen.has(e.id)) { seen.set(e.id, { x0: e.x, y0: e.y, t: 0, kind: e.kind }); towerArrows++; assert.equal(e.dmg, 0, 'it hurts nobody'); }
            seen.get(e.id)!.t += 1 / 20;
        }
        assert.ok(p.downed <= 0, 'the shot never hurt the farmer');
    }
    assert.ok(towerArrows >= 3, `${towerArrows} shots flew`);
    for (const v of seen.values()) assert.ok(v.t >= 0.3 && v.t <= 1.2, `in the air ${v.t.toFixed(2)} s: long enough to see`);
    assert.ok([...seen.values()].every((v) => ['arrow', 'bolt', 'fire', 'frost'].includes(v.kind)));
    assert.ok(!Object.values(sim.s.ents).some((e) => e.k === 'proj' && e.tw && e.life > 1), 'none lingers');
});

test('the ops: night, speed, mend, clear and reset', () => {
    const { sim, p, op, yard, ytx, yty } = world();
    // night on and off, held there
    op({ op: 'labNight', on: true });
    run(sim, 30);
    assert.ok(sim.s.night && sim.s.clock > TUNING.dayLength);
    assert.equal(sim.nightSpawns.length, 0, 'no night monsters of its own');
    assert.equal(mobsOf(sim).length, 0);
    assert.equal(sim.s.day, 1, 'no dawn ever comes');
    op({ op: 'labNight' });
    assert.ok(!sim.s.night && sim.s.clock < TUNING.dayLength, 'a bare toggle turns it back');
    // speed: the host steps the world faster
    const host = new SimHost(sim, 'Lab', '', { devOpen: true });
    for (const n of [2, 4, 3, 1]) {
        op({ op: 'labSpeed', n });
        const t0 = sim.s.time;
        for (let i = 0; i < 20; i++) host.update(0.05);
        assert.ok(Math.abs(sim.s.time - t0 - (n === 3 ? 1 : n)) < 0.06, `x${n}: ${sim.s.time - t0}`);
    }
    // god mode is the developer menu's own op
    op({ op: 'god', on: false });
    assert.ok(!lab.readout(sim)!.god);
    op({ op: 'god', on: true });
    assert.ok(lab.readout(sim)!.god);
    // mend: hurt walls whole, broken arena pieces put back
    const wall = sim.s.ents[sim.world.occAt(ytx - lab.YARD_R, yty)] as BuildE;
    const other = sim.s.ents[sim.world.occAt(ytx, yty - lab.YARD_R)] as BuildE;
    wall.hp = 3;
    sim.remove(other.id);
    let ev = op({ op: 'labMend' });
    assert.equal(wall.hp, undefined, 'whole');
    assert.equal((sim.s.ents[sim.world.occAt(ytx, yty - lab.YARD_R)] as BuildE)?.kind, other.kind, 'put back');
    assert.ok(fxNames(ev).length && said(ev).length);
    // clear
    op({ op: 'labWave', id: 'slime', n: 5, lv: 1, who: 'w' });
    ev = op({ op: 'labClear' });
    assert.equal(mobsOf(sim).length, 0);
    assert.ok(said(ev).some((t) => /5 monsters gone/.test(t)));
    // reset: a building of your own goes, the arena is back, the farmer back in the middle with a full backpack
    const spot = sim.nearestFree(ytx - 9, yty, 4)!;
    sim.add<BuildE>({ k: 'bld', kind: 'wall_wood', tx: spot.tx, ty: spot.ty, rot: 0, by: 'me' });
    sim.remove(blds(sim, 'ballista')[0].id);
    p.inv = {};
    p.x += 120;
    op({ op: 'labNight', on: true });
    op({ op: 'labSpeed', n: 4 });
    op({ op: 'labWave', id: 'bat', n: 10, lv: 1, who: 'n' });
    op({ op: 'labReset' });
    assert.ok(!sim.world.occAt(spot.tx, spot.ty), 'your own wall is gone');
    assert.equal(blds(sim, 'ballista').length, 1);
    assert.equal(mobsOf(sim).length, 0);
    assert.ok(countOf(p, 'blightcore') >= 40);
    assert.ok(Math.hypot(p.x - yard.x, p.y - yard.y) < 1);
    assert.ok(!sim.s.night && sim.timeScale === 1);
    assert.equal(blds(sim).filter((b) => b.kind.startsWith('wall_') || b.kind === 'doorway').length, 8 * lab.YARD_R, 'the whole ring');
    // a wave of a monster that is not on the list, or from nowhere, is refused
    for (const bad of [{ id: 'slimeking', who: 'n' }, { id: 'slime', who: 'up' }, { id: 'slime', who: '' }]) {
        assert.ok(fxNames(op({ op: 'labWave', n: 5, lv: 1, ...bad })).includes('deny'), JSON.stringify(bad));
    }
    assert.equal(mobsOf(sim).length, 0);
});

test('the tower tools: XP for every tower, a level at a time, perks reset; the readout lists their levels', () => {
    const { sim, op } = world();
    const towers = () => Object.values(sim.s.ents).filter((e): e is BuildE => e.k === 'bld' && towerType(e.kind) !== null && e.kind !== 'spike');
    assert.ok(towers().length >= 4);
    assert.ok(towers().every((t) => levelOf(t.xp) === 1));
    let ev = op({ op: 'labXp', n: 40 });
    assert.ok(towers().every((t) => t.xp === 40 && levelOf(t.xp) === 2 && pending(t) === 1), 'a chunk of XP for each');
    assert.ok(fxNames(ev).length && said(ev).length);
    op({ op: 'labXp', id: 'level' });
    assert.ok(towers().every((t) => levelOf(t.xp) === 3), 'one level up for each, from wherever it stood');
    const spike = blds(sim, 'spike')[0];
    assert.equal(levelOf(spike.xp), 3, 'the traps too');
    for (let i = 0; i < 12; i++) op({ op: 'labXp', id: 'level' });
    assert.ok(towers().every((t) => levelOf(t.xp) === 10), 'never past the top');
    // take a perk, then reset them: the picks wait again
    const t = towers()[0];
    sim.command('me', { t: 'towerpick', id: t.id, i: 0 } as Cmd);
    assert.equal(t.pk!.length, 1);
    ev = op({ op: 'labPerks' });
    assert.ok(towers().every((x) => x.pk === undefined && pending(x) === 9), 'every perk back to be chosen again');
    assert.ok(said(ev).length);
    const r = lab.readout(sim)!;
    assert.ok(r.levels.length === 4 && r.levels.every((l) => l.lv === 10 && l.pending === 9), JSON.stringify(r.levels));
    // a reset arena starts them over
    op({ op: 'labReset' });
    assert.ok(towers().every((x) => x.xp === undefined && x.pk === undefined));
});

test('the Hurt button damages every wall and tower to 40% and says so', () => {
    const { sim, op } = world();
    const ev = op({ op: 'labHurt' });
    const defs = blds(sim).filter((b) => BUILDINGS[b.kind].hp);
    assert.ok(defs.length > 30);
    assert.ok(defs.every((b) => b.hp !== undefined && b.hp <= 0.41 * defense.maxHp(b) + 1));
    assert.ok(fxNames(ev).length && said(ev).some((t) => /hurt to 40%/.test(t)));
});

test('the lab ops work only in a lab world, and stay locked on a real server like every developer op', () => {
    // an ordinary world with the menu open: refused
    const plain = Sim.create('LAB-PLAIN', 'w');
    plain.join('a', 'Ann');
    plain.devs.add('a');
    const had = mobsOf(plain).length;
    for (const o of ['labWave', 'labNight', 'labMend', 'labClear', 'labSpeed', 'labReset', 'labXp', 'labPerks', 'labHurt']) {
        plain.events = [];
        plain.command('a', { t: 'devdo', op: o, id: 'slime', n: 4, lv: 1, who: 'n', on: true } as Cmd);
        assert.ok(fxNames(plain.events).includes('deny'), `${o} is refused outside the lab`);
    }
    assert.equal(mobsOf(plain).length, had, 'no wave came');
    assert.equal(plain.timeScale, 1);
    // a lab world served by a host with cheats off and nobody unlocked: nothing happens
    const sim = lab.create('a', 'Ann');
    sim.cheats = false;
    const host = new SimHost(sim, 'Test', '', { devKey: 'a-secret-key-1234' });
    const peer: Peer = { send: () => {} };
    host.attach(peer);
    host.receive(peer, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'a', name: 'Ann' }));
    const before = JSON.stringify([Object.keys(sim.s.ents).length, sim.s.night, sim.s.clock]);
    for (const c of [{ op: 'labWave', id: 'mixed', n: 40, lv: 9, who: 'sea' }, { op: 'labNight', on: true }, { op: 'labSpeed', n: 4 }, { op: 'labReset' }, { op: 'labClear' }, { op: 'labMend' }, { op: 'labXp', n: 500 }, { op: 'labPerks' }, { op: 'labHurt' }]) {
        host.receive(peer, JSON.stringify({ t: 'cmd', c: { t: 'devdo', ...c } }));
    }
    assert.equal(JSON.stringify([Object.keys(sim.s.ents).length, sim.s.night, sim.s.clock]), before, 'locked');
    assert.equal(sim.timeScale, 1);
});

test('the lab never touches the real solo world or profile: its own keys, never saved', async () => {
    const store = new Map<string, string>([['awesome_farm_solo_v1', '{"real":"farm"}'], ['awesome_farm_profile_v1', '{"id":"real-id","name":"Real"}']]);
    const g = globalThis as Record<string, unknown>;
    const had = { location: g.location, localStorage: g.localStorage, sessionStorage: g.sessionStorage };
    const fake = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } });
    g.location = { search: '?lab=defense', host: 'x', protocol: 'https:' };
    g.localStorage = fake(store);
    g.sessionStorage = fake(new Map());
    try {
        const { LAB } = await import('../src/client/lab');
        const prof = await import('../src/client/profile');
        assert.equal(LAB, 'defense');
        assert.equal(prof.SOLO_KEY, 'awesome_farm_solo_v1:lab');
        assert.notEqual(prof.profile.id, 'real-id', 'a farmer of its own');
        const { LocalConnection } = await import('../src/client/net/connection');
        const conn = new LocalConnection('defense');
        assert.equal(conn.label, 'Defense Lab');
        for (let i = 0; i < 60; i++) conn.poll(0.05);
        conn.send({ t: 'devdo', op: 'labWave', id: 'slime', n: 5, lv: 1, who: 'w' } as Cmd);
        for (let i = 0; i < 3; i++) conn.poll(0.05);
        assert.equal(lab.readout(conn.debugSim)!.alive, 5, 'cheats on: the panel ops work');
        conn.saveNow();
        conn.close();
        assert.equal(store.get('awesome_farm_solo_v1'), '{"real":"farm"}', 'the real solo world is untouched');
        assert.equal(store.get('awesome_farm_profile_v1'), '{"id":"real-id","name":"Real"}', 'the real profile is untouched');
        assert.ok(!store.has('awesome_farm_solo_v1:lab'), 'and the lab world is never saved');
        assert.deepEqual([...store.keys()].filter((k) => !k.endsWith(':lab')).sort(), ['awesome_farm_profile_v1', 'awesome_farm_solo_v1'], 'nothing else written');
    } finally {
        Object.assign(g, had);
    }
});

test('tower shots stay on screen long enough to be seen: the speed of a skeleton\'s arrow, the zap glow', async () => {
    const { flightTime, SPEED, FLIGHT_MIN, FLIGHT_MAX, ZAP_LINGER } = await import('../src/shared/data/shotfx');
    for (const k of ['arrow', 'bolt'] as const) {
        for (const d of [0, 20, 60, 112, 168, 400]) {
            const t = flightTime(k, d);
            assert.ok(t >= FLIGHT_MIN && t <= FLIGHT_MAX, `${k} over ${d}px: ${t}s`);
        }
        assert.ok(flightTime(k, 112) >= 0.6, `${k} over an Archer's reach is in the air for at least 0.6 s`);
        assert.ok(SPEED[k] <= 160, `${k} flies no faster than the eye can follow`);
        assert.ok(flightTime(k, 400) >= flightTime(k, 10), 'further takes longer');
    }
    assert.ok(SPEED.arrow >= 120, 'at least a skeleton\'s arrow (120)');
    assert.ok(SPEED.bolt < SPEED.arrow && flightTime('bolt', 100) > flightTime('arrow', 100), 'the heavy bolt is slower');
    assert.ok(ZAP_LINGER >= 0.3);
    const src = readFileSync(join(ROOT, 'src/client/world/blight.ts'), 'utf8');
    assert.ok(/flightTime\(e\.k, d\)/.test(src) && /ZAP_LINGER/.test(src), 'blight.ts uses them');
    assert.ok(/overlay3d\(scene\.add\.particles/.test(src), 'trail and sparks are overlays');
});

test('the tower shots are world overlays the 3D view shows too; the panel only sends developer ops', () => {
    const src = readFileSync(join(ROOT, 'src/client/world/blight.ts'), 'utf8');
    const shot = src.slice(src.indexOf('    shot ('), src.indexOf('    draw ()'));
    assert.ok(/overlay3d\(s\.add\.graphics\(\)/.test(shot), 'the zap is marked');
    assert.ok(!/s\.add\.image\(/.test(shot), 'an arrow or a bolt is not drawn here: it is a real projectile (sim/defense.ts), drawn like every other');
    assert.ok(/e\.k === 'proj'/.test(readFileSync(join(ROOT, 'src/client3d/entities.ts'), 'utf8')), 'the 3D view draws projectiles');
    const panel = readFileSync(join(ROOT, 'src/client/ui/labpanel.ts'), 'utf8');
    const sent = [...panel.matchAll(/t: '(\w+)', op: '(\w+)'/g)].map((m) => `${m[1]}:${m[2]}`);
    assert.ok(sent.length >= 7 && sent.every((s) => s.startsWith('devdo:')), sent.join(' '));
    assert.ok(!/\u2014/.test(panel + readFileSync(join(ROOT, 'src/shared/sim/lab.ts'), 'utf8')), 'no em dash');
});

// The 2D / 3D view choice (src/client/world/view3d-bridge.ts): the setting defaults to 2D and is kept, every kind of thing in
// the game is drawn in 3D by a model or by a placeholder somebody chose, the 3D chunk (three.js) is never pulled into the 2D
// bundle by a static import, and the reload that switches the view finds its way back into the same world.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A browser storage stand-in (localStorage, sessionStorage). */
function fakeStorage () {
    const m = new Map<string, string>();
    return {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => { m.set(k, String(v)); },
        removeItem: (k: string) => { m.delete(k); },
        clear: () => m.clear(),
        key: (i: number) => [...m.keys()][i] ?? null,
        get length () { return m.size; },
        map: m,
    };
}

// A few building models paint a soft halo on a 2D canvas when they are first built: give node a stand-in that draws nothing.
if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop () {} }) : () => {}), set: () => true });
    (globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

test('the view setting starts at 2D, keeps 3D once chosen, and reads anything else as 2D', async () => {
    const local = fakeStorage();
    (globalThis as { localStorage?: unknown }).localStorage = local;
    const { settings, saveSettings, parseSettings, SETTINGS_KEY } = await import('../src/client/settings');
    assert.equal(SETTINGS_KEY, 'awesome_farm_settings_v1', 'the storage key never changes (players keep their settings)');
    assert.equal(settings.view, '2d', 'a new player gets the classic view');
    settings.view = '3d';
    saveSettings();
    const saved = JSON.parse(local.getItem(SETTINGS_KEY)!);
    assert.equal(saved.view, '3d', 'the choice is written with the other settings');
    assert.equal(saved.sound, true, 'and nothing else is lost');
    // the next page load reads it back
    assert.equal(parseSettings(local.getItem(SETTINGS_KEY)).view, '3d');
    // older saves (no view yet), junk and a broken store are all 2D
    assert.equal(parseSettings(JSON.stringify({ sound: false, zoom: 4 })).view, '2d');
    assert.equal(parseSettings(JSON.stringify({ sound: false, zoom: 4 })).zoom, 4);
    assert.equal(parseSettings(JSON.stringify({ view: '4d' })).view, '2d');
    assert.equal(parseSettings(JSON.stringify({ view: 3 })).view, '2d');
    assert.equal(parseSettings('{oops').view, '2d');
    assert.equal(parseSettings(null).view, '2d');
    settings.view = '2d';
});

test('the reload that switches the view comes back into the same world, once', async () => {
    (globalThis as { localStorage?: unknown }).localStorage ??= fakeStorage();
    (globalThis as { location?: unknown }).location ??= { search: '', hash: '', protocol: 'http:' };         // (the profile reads ?profile=)
    const session = fakeStorage();
    (globalThis as { sessionStorage?: unknown }).sessionStorage = session;
    const { stashResume, takeResume } = await import('../src/client/net/connection');
    assert.equal(takeResume(), null, 'nothing written: the title screen as usual');
    stashResume({ mode: 'online', addr: 'farm.example:7777', password: 'pw', key: 'secret' });
    assert.deepEqual(takeResume(), { mode: 'online', addr: 'farm.example:7777', password: 'pw', key: 'secret' });
    assert.equal(takeResume(), null, 'read once, then gone (it can hold a password)');
    assert.equal(session.length, 0);
    stashResume({ mode: 'solo' });
    assert.deepEqual(takeResume(), { mode: 'solo' });
    session.setItem('awesome_farm_resume_v1', JSON.stringify({ mode: 'online' }));
    assert.equal(takeResume(), null, 'a server with no address is not a way back');
    session.setItem('awesome_farm_resume_v1', '{not json');
    assert.equal(takeResume(), null);
});

test('every kind of thing in every family has a 3D model of its own (no placeholders)', async () => {
    const { FAMILIES, kindsOf, missing } = await import('../src/client3d/coverage');
    for (const family of FAMILIES) {
        assert.ok(kindsOf(family).length > 0, `${family}: the game has some`);
        assert.deepEqual(missing(family), [], `${family}: no 3D model (add one in src/client3d/models; see src/client3d/coverage.ts)`);
    }
    // the families are read from the data, so new content shows up here by itself
    assert.ok(kindsOf('pattern').includes('leap') && kindsOf('pattern').includes('chain'));
    assert.ok(kindsOf('crop').includes('seed_wheat:2'));
    assert.ok(kindsOf('look').includes('scarf:7'));
});

test('the models that used to be grey blocks are real models now, and every one of them moves', async () => {
    const { buildingModel } = await import('../src/client3d/models/buildings');
    const { placeholder } = await import('../src/client3d/models/placeholder');
    const { nodeModel } = await import('../src/client3d/models/nodes');
    const { countTris, env } = await import('../src/client3d/models/kit');
    const block = countTris(placeholder(1, 1).obj);
    for (const k of ['chute', 'mailbox', 'weathervane'] as const) assert.ok(countTris(buildingModel(k, { rot: 0, seed: 1, mask: 0 }).obj) > block * 10, `${k} is more than a block`);
    for (const biome of ['meadow', 'snowcap']) for (const k of ['titan_oak', 'titan_rock']) assert.ok(countTris(nodeModel(k, { biome, gold: false, seed: 1 }).obj) > 200, `${k} on ${biome}`);
    const bld = (kind: string, extra: object = {}) => ({ id: 1, k: 'bld' as const, kind, tx: 0, ty: 0, rot: 0, ...extra }) as never;
    // the mailbox's flag goes up while post waits
    const mail = buildingModel('mailbox', { rot: 0, seed: 1, mask: 0 });
    const flag = mail.obj.children[1];
    mail.apply!(bld('mailbox'));
    for (let i = 0; i < 60; i++) mail.update!(1 / 30, i / 30);
    const down = flag.rotation.x;
    mail.apply!(bld('mailbox', { flag: 1 }));
    for (let i = 0; i < 60; i++) mail.update!(1 / 30, 2 + i / 30);
    assert.ok(Math.abs(flag.rotation.x - down) > 1, 'the flag swung up');
    // the chute flips a coin when it sells
    const ch = buildingModel('chute', { rot: 0, seed: 1, mask: 0 });
    ch.apply!(bld('chute', { ch: { s: 10, w: [0], p: 0, f: 0, r: 0, t0: 0 } }));
    ch.update!(0.05, 0);
    const shown = () => ch.obj.children.filter((c) => c.name === 'extra.coin' && c.visible).length;
    assert.equal(shown(), 0);
    ch.apply!(bld('chute', { ch: { s: 10, w: [3], p: 0, f: 0, r: 0, t0: 0 } }));
    ch.update!(0.05, 0.05);
    assert.equal(shown(), 1, 'a sale flips a coin out of the hopper');
    // the vane turns with the day's wind and shows tomorrow's weather, which changes with the day
    const vane = buildingModel('weathervane', { rot: 0, seed: 1, mask: 0 });
    env.seed = 'vane-test';
    const icons = new Set<string>();
    for (let d = 1; d < 30; d++) { env.day = d; vane.update!(0.05, d); icons.add(vane.obj.children[2].children[0]?.name ?? ''); }
    assert.ok(icons.size >= 2, `the picture follows the forecast (${[...icons].join(', ')})`);
    // a Titan's health bar shows once it has been struck
    const oak = nodeModel('titan_oak', { biome: 'meadow', gold: false, seed: 3 });
    const bars = () => { let n = 0; oak.obj.traverse((o) => { if (o.type === 'Group' && o.visible && o.children.length === 3 && o.children.every((c) => (c as { userData: { noFlash?: boolean } }).userData.noFlash)) n++; }); return n; };
    oak.apply!({ id: 3, k: 'node', kind: 'titan_oak', tx: 0, ty: 0, hp: 120, plot: 0 } as never);
    assert.equal(bars(), 0, 'no bar while untouched');
    oak.apply!({ id: 3, k: 'node', kind: 'titan_oak', tx: 0, ty: 0, hp: 60, plot: 0 } as never);
    assert.equal(bars(), 1, 'a bar once hit');
});

test('every projectile, crop stage, boss pattern, creature activity and piece of gear builds', async () => {
    const { kindsOf } = await import('../src/client3d/coverage');
    const { countTris } = await import('../src/client3d/models/kit');
    const { shotModel } = await import('../src/client3d/models/shots');
    const { cropGroup } = await import('../src/client3d/models/crops');
    const { PATTERN_POSES, restPose } = await import('../src/client3d/models/mobs-attack');
    const { WORK_PROPS, workProp } = await import('../src/client3d/models/critters-work');
    const { toolPart } = await import('../src/client3d/models/farmer-tools');
    const shapes = new Set<number>();
    for (const k of kindsOf('projectile')) {
        const m = shotModel(k);
        m.apply!({ id: 1, k: 'proj', kind: k, x: 0, y: 0, vx: 10, vy: 0, dmg: 1, life: 1 } as never);
        m.update!(0.016, 1);
        shapes.add(countTris(m.obj));
        assert.ok(countTris(m.obj) > 8, k);
    }
    assert.ok(shapes.size >= kindsOf('projectile').length - 1, 'each projectile kind has its own shape');
    for (const k of kindsOf('crop')) {
        const [seed, n] = k.split(':');
        assert.ok(countTris(cropGroup(seed, Number(n))) > 0, k);
    }
    for (const k of kindsOf('pattern')) {
        const f = PATTERN_POSES[k as keyof typeof PATTERN_POSES];
        let moved = 0;
        for (let u = 0; u <= 3; u += 0.02) {
            const o = restPose({ y: 0, rx: 0, ry: 0, rz: 0, sy: 1 });
            f(u, o);
            for (const v of Object.values(o)) assert.ok(Number.isFinite(v), `${k} at ${u}`);
            moved = Math.max(moved, Math.abs(o.y) + Math.abs(o.rx) + Math.abs(o.ry) + Math.abs(o.rz) + Math.abs(o.sy - 1));
        }
        assert.ok(moved > 0.1, `the boss's body moves in ${k}`);
    }
    for (const k of kindsOf('activity')) {
        if (WORK_PROPS[k] === null) { assert.ok(['idle', 'walk'].includes(k), `${k}: only resting and walking have no prop`); continue; }
        assert.ok(countTris(workProp(k)!) > 0, k);
    }
    for (const k of kindsOf('gear')) {
        const t = toolPart(k);
        if (t) assert.ok(countTris(t.g) > 0, k);
    }
});

test('every character creator choice and scarf looks different from the others', async () => {
    const { kindsOf } = await import('../src/client3d/coverage');
    const { bodyGroup, eyesGroup, mouthGroup, scarfGroup, sproutGroup } = await import('../src/client3d/models/farmer-body');
    const { SCARF_COLORS } = await import('../src/shared/data/look');
    const print = (o: import('three').Object3D) => {
        let s = 0, n = 0;
        o.traverse((c) => {
            const g = (c as import('three').Mesh).geometry;
            if (!g) return;
            const p = g.attributes.position.array, col = g.attributes.color?.array ?? [];
            for (let i = 0; i < p.length; i++) s += p[i] * ((i % 7) + 1);
            for (let i = 0; i < col.length; i++) s += col[i] * ((i % 5) + 3);
            n += p.length;
        });
        return `${n}|${s.toFixed(3)}`;
    };
    const make: Record<string, (i: number) => import('three').Object3D> = { body: bodyGroup, sprout: sproutGroup, eyes: eyesGroup, mouth: mouthGroup, scarf: (i) => scarfGroup(SCARF_COLORS[i]) };
    const seen = new Map<string, string>();
    for (const k of kindsOf('look')) {
        const [part, i] = k.split(':');
        const f = `${part}|${print(make[part](Number(i)))}`;
        assert.ok(!seen.has(f), `${k} is drawn exactly like ${seen.get(f)}`);
        seen.set(f, k);
    }
});

test('the farmer flinches and flashes when hit, blinks while invulnerable and calls for help when down', async () => {
    const { farmerModel } = await import('../src/client3d/models/farmer');
    const f = farmerModel(undefined, 0, {});
    const flashed = () => { let n = 0; f.bodyG.traverse((o) => { if ((o as { userData: { mat0?: unknown } }).userData.mat0) n++; }); return n; };
    f.pose(0, 1, false, 0, false, 0.016); f.react(10, 0, false, 0.016);
    assert.equal(flashed(), 0);
    f.pose(0, 1, false, 0, false, 0.016); f.react(8, 0, false, 0.016);
    assert.ok(flashed() > 0, 'a lost heart flashes the farmer');
    for (let i = 0; i < 30; i++) { f.pose(0, 1, false, 0, false, 0.016); f.react(8, 0, false, 0.016); }
    assert.equal(flashed(), 0, 'and the flash ends');
    const vis = new Set<boolean>();
    for (let t = 1; t > 0; t -= 0.02) { f.react(8, t, false, 0.016); vis.add(f.yawG.visible); }
    assert.deepEqual([...vis].sort(), [false, true], 'invulnerable farmers blink');
    f.react(8, 0, true, 0.016);
    assert.ok(f.helpRing?.visible, 'a downed farmer has a ring calling for help');
    f.react(8, 0, false, 0.016);
    assert.ok(!f.helpRing?.visible);
});

test('the co-op statuses show on the farmer: an ice block, hex wisps, and a chain laid between two', async () => {
    const { farmerModel } = await import('../src/client3d/models/farmer');
    const { layChain, STATUS_MODELS } = await import('../src/client3d/models/costatus');
    const f = farmerModel(undefined, 1, {});
    f.status({ k: 'frozen', b: 1, s: 0, u: 9 });
    assert.ok(f.coObj && f.coObj.parent === f.obj, 'frozen: an ice block');
    const ice = f.coObj;
    f.status({ k: 'frozen', b: 1, s: 0, u: 9, th: 1.2 });
    assert.ok(ice.scale.x < 0.9, 'it shrinks as a friend thaws it');
    f.status({ k: 'hexed', b: 1, s: 0, u: 9 });
    assert.ok(f.coObj !== ice && f.coObj?.parent === f.obj && !ice.parent, 'hexed: the wisps instead');
    f.status({ k: 'tether', b: 1, s: 0, u: 9, w: 'other' });
    assert.equal(f.coObj, null, 'the chain is drawn between the two farmers, not on one');
    f.status(undefined);
    assert.equal(f.coObj, null);
    const links = Array.from({ length: 6 }, () => STATUS_MODELS.tether());
    layChain(links, 0, 0, 6, 0, 1);
    assert.ok(links[0].position.x > 0 && links[5].position.x < 6 && links[2].position.x < links[3].position.x, 'links run from one farmer to the other');
});

test('a boss moves its whole body through an attack, and a working creature holds its tool', async () => {
    const { mobModel } = await import('../src/client3d/models/mobs');
    const { critterModel } = await import('../src/client3d/models/critters');
    const boss = mobModel('slimeking', { elite: false, seed: 1 });
    const atk = boss.obj.children[0];
    const e = { id: 1, k: 'mob', kind: 'slimeking', x: 0, y: 0, hp: 10, mhp: 10, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 };
    boss.apply!({ ...e } as never);
    for (let i = 0; i < 10; i++) boss.pose!(0, false, 0, 0.016);
    assert.ok(Math.abs(atk.position.y) < 1e-6, 'at rest');
    boss.apply!({ ...e, pat: 'leap', pt: 0.9, st: 2 } as never);
    for (let i = 0; i < 4; i++) boss.pose!(0, false, 0, 0.016);
    assert.ok(atk.position.y > 0.5, `leaping (${atk.position.y})`);
    const c = critterModel('mossback', { seed: 2 });
    c.apply!({ id: 2, k: 'crit', sp: 'mossback', x: 0, y: 0, vx: 0, vy: 0, t: 0, lv: 1, mode: 2, st: 3, ac: 'chop', w: 1 } as never);
    c.pose!(0, false, false, 0.016);
    let prop = false;
    c.obj.traverse((o) => { if (o.name === 'crit.work.chop' && o.visible) prop = true; });
    assert.ok(prop, 'a creature chopping holds an axe');
});

// ── the 2D bundle never statically reaches src/client3d (or three.js) ─────────

/** The modules a file imports by value (`import type` / `export type` are left out: they vanish in the build). Dynamic `import()` is not followed. */
function staticImports (file: string): string[] {
    const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const out: string[] = [];
    const re = /^\s*(import|export)\s+(type\s+)?([^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
    for (let m = re.exec(src); m; m = re.exec(src)) {
        if (m[2]) continue;                                    // import type … / export type …
        const clause = m[3] ?? '';
        if (m[1] === 'export' && !clause) continue;            // (export const … is not a re-export)
        // `import { type A, type B } from` brings in nothing at run time either
        const braces = /^\s*\{([^}]*)\}\s+from\s+$/.exec(clause);
        if (braces && braces[1].split(',').map((x) => x.trim()).filter(Boolean).every((x) => x.startsWith('type '))) continue;
        out.push(m[4]);
    }
    return out;
}

function resolveTs (from: string, spec: string): string | null {
    if (!spec.startsWith('.')) return null;                    // a package
    const base = resolve(dirname(from), spec);
    for (const c of [base, `${base}.ts`, join(base, 'index.ts')]) if (existsSync(c) && c.endsWith('.ts')) return c;
    return null;
}

test('the 2D game reaches the 3D view only through a dynamic import', () => {
    const entry = join(ROOT, 'src/main.ts');
    const seen = new Set<string>();
    const packages = new Set<string>();
    const stack = [entry];
    while (stack.length) {
        const f = stack.pop()!;
        if (seen.has(f)) continue;
        seen.add(f);
        for (const spec of staticImports(f)) {
            const r = resolveTs(f, spec);
            if (r) stack.push(r); else if (!spec.startsWith('.')) packages.add(spec.split('/')[0]);
        }
    }
    const rel = [...seen].map((f) => f.slice(ROOT.length + 1));
    assert.ok(rel.includes('src/client/scenes/Game.ts') && rel.includes('src/client/world/view3d-bridge.ts'), 'the walk reaches the game and the bridge');
    assert.deepEqual(rel.filter((f) => f.startsWith('src/client3d/')), [], 'no static import reaches src/client3d');
    assert.ok(!packages.has('three'), 'three.js is not in the 2D bundle');
    // and the way in is there, as a dynamic import of the view
    const bridge = readFileSync(join(ROOT, 'src/client/world/view3d-bridge.ts'), 'utf8');
    assert.match(bridge, /import\(\s*'\.\.\/\.\.\/client3d\/view3d'\s*\)/);
    // the 3D view implements the bridge's interface (a type import: nothing of the 2D side is pulled into the 3D chunk by it)
    const view = readFileSync(join(ROOT, 'src/client3d/view3d.ts'), 'utf8');
    assert.match(view, /import type \{[^}]*View3D[^}]*\} from '\.\.\/client\/world\/view3d-bridge'/);
});

test('the Phaser canvas is see-through only when the game boots in 3D', () => {
    const main = readFileSync(join(ROOT, 'src/client/main.ts'), 'utf8');
    assert.match(main, /transparent:\s*settings\.view === '3d'/, '2D keeps the opaque canvas it always had');
});

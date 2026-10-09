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

test('every building, node, monster, creature and item has a 3D model or a placeholder somebody chose', async () => {
    const { coverage, PLACEHOLDERS, hasModel, kindsOf } = await import('../src/client3d/coverage');
    for (const family of ['building', 'node', 'monster', 'creature', 'item'] as const) {
        const cov = coverage(family);
        const missing = Object.entries(cov).filter(([, c]) => c === 'missing').map(([k]) => k);
        assert.deepEqual(missing, [], `${family}: no 3D model and not listed in PLACEHOLDERS (src/client3d/coverage.ts)`);
        for (const k of PLACEHOLDERS[family]) {
            assert.ok(kindsOf(family).includes(k), `${family} ${k} is listed as a placeholder but the game has no such thing`);
            assert.ok(!hasModel(family, k), `${family} ${k} has a model now: take it off the PLACEHOLDERS list`);
        }
    }
    // and a placeholder still builds (the view never crashes on one)
    const { buildingModel } = await import('../src/client3d/models/buildings');
    const { nodeModel } = await import('../src/client3d/models/nodes');
    const { countTris } = await import('../src/client3d/models/kit');
    for (const k of PLACEHOLDERS.building) assert.ok(countTris(buildingModel(k, { rot: 0, seed: 1, mask: 0 }).obj) > 0, k);
    for (const k of PLACEHOLDERS.node) assert.ok(countTris(nodeModel(k, { biome: 'meadow', gold: false, seed: 1 }).obj) > 0, k);
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

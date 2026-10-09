// The 3D view's budget (src/client3d/quality.ts, batch.ts, budget.ts): the 3D quality setting and what Auto picks on a phone,
// the frame-rate watch that steps Auto down, instancing of the repeated models (one draw for every fence piece in view), and the
// ledger that hands every geometry and material back when the view goes (so switching 3D -> 2D -> 3D leaves no renderer behind).
// The numbers measured in a browser on a big busy world are in DESIGN.md, "Two views of one world".
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, DirectionalLight, Group, Mesh, MeshStandardMaterial, OrthographicCamera, Vector3, type WebGLRenderer } from 'three';
import { Batcher } from '../src/client3d/batch';
import { fitShadow, Ledger, reach, viewExtent } from '../src/client3d/budget';
import { bake } from '../src/client3d/models/kit';
import { AutoStep, pixelRatio, QUALITY, resolveQuality, stepDown } from '../src/client3d/quality';
import { EL } from '../src/client3d/render';

// A few building models paint a soft halo on a 2D canvas when they are first built: give node a stand-in that draws nothing.
if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop () {} }) : () => {}), set: () => true });
    (globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

test('the 3D quality setting: Auto by default, kept when chosen, anything unknown is Auto', async () => {
    const { parseSettings, QUALITY_CHOICES, SETTINGS_KEY } = await import('../src/client/settings');
    assert.equal(SETTINGS_KEY, 'awesome_farm_settings_v1', 'a new field in the same key (no key renamed)');
    assert.deepEqual([...QUALITY_CHOICES], ['auto', 'low', 'medium', 'high']);
    assert.equal(parseSettings(null).quality3d, 'auto');
    assert.equal(parseSettings(JSON.stringify({ view: '3d' })).quality3d, 'auto', 'older settings (no quality yet) are Auto');
    for (const q of ['low', 'medium', 'high'] as const) assert.equal(parseSettings(JSON.stringify({ quality3d: q })).quality3d, q);
    assert.equal(parseSettings(JSON.stringify({ quality3d: 'ultra' })).quality3d, 'auto');
    assert.equal(parseSettings(JSON.stringify({ quality3d: 2 })).quality3d, 'auto');
    assert.equal(parseSettings(JSON.stringify({ quality3d: 'low', view: '4d' })).view, '2d', 'and the view rule still holds');
});

test('Auto is High on a computer, Medium on a phone, Low on a small phone; a chosen level always wins', () => {
    const pc = { phone: false, cores: 8, memory: 8 }, phone = { phone: true, cores: 8, memory: 6 }, small = { phone: true, cores: 4, memory: 0 };
    assert.equal(resolveQuality('auto', pc), 'high');
    assert.equal(resolveQuality(undefined, pc), 'high');
    assert.equal(resolveQuality('auto', phone), 'medium');
    assert.equal(resolveQuality('auto', small), 'low');
    assert.equal(resolveQuality('auto', { phone: true, cores: 0, memory: 2 }), 'low', 'little memory is a small phone too');
    assert.equal(resolveQuality('auto', { phone: true, cores: 0, memory: 0 }), 'medium', 'unknown: a phone gets Medium');
    for (const q of ['low', 'medium', 'high'] as const) { assert.equal(resolveQuality(q, small), q); assert.equal(resolveQuality(q, pc), q); }
    // each level spends less than the one above it
    const [lo, me, hi] = [QUALITY.low, QUALITY.medium, QUALITY.high];
    assert.ok(lo.shadow === 0 && me.shadow > 0 && hi.shadow > me.shadow, 'shadows: none, then a bigger map');
    assert.ok(!lo.bloom && me.bloom && hi.bloom);
    assert.ok(lo.msaa < me.msaa && me.msaa < hi.msaa);
    assert.ok(lo.lamps < me.lamps && me.lamps < hi.lamps);
    assert.ok(lo.dpr < me.dpr && me.dpr < hi.dpr && lo.dprPhone <= me.dprPhone && me.dprPhone < hi.dprPhone);
    assert.equal(stepDown('high'), 'medium');
    assert.equal(stepDown('medium'), 'low');
    assert.equal(stepDown('low'), 'low');
});

test('the pixel ratio is capped per level (a 3x phone screen renders at 1.25x on Medium)', () => {
    assert.equal(pixelRatio(QUALITY.high, 3, false), 2);
    assert.equal(pixelRatio(QUALITY.high, 3, true), 1.5);
    assert.equal(pixelRatio(QUALITY.medium, 3, true), 1.25);
    assert.equal(pixelRatio(QUALITY.low, 3, true), 1);
    assert.equal(pixelRatio(QUALITY.high, 1, false), 1, 'never above the screen');
    assert.equal(pixelRatio(QUALITY.high, 0, false), 1, 'unknown: 1');
});

test('Auto steps down after a few seconds of slow frames, never for gaps or a good frame rate', () => {
    const play = (ms: number, seconds: number) => { const a = new AutoStep(); let stepped = 0; for (let t = 0; t < seconds * 1000; t += ms) if (a.frame(ms)) stepped++; return stepped; };
    assert.equal(play(16.7, 20), 0, '60 fps: stays');
    assert.equal(play(33, 20), 0, '30 fps: stays');
    assert.ok(play(60, 5) >= 1, '16 fps: steps down within five seconds');
    assert.equal(play(400, 60), 0, 'long gaps (a hidden tab, frames stepped by hand) are not counted');
    const a = new AutoStep();
    let stepped = false;
    for (let i = 0; i < 600; i++) stepped ||= a.frame(i % 10 ? 16 : 70);         // the odd slow frame
    assert.equal(stepped, false);
});

/** A row of the same baked fence piece, the way the entity layer holds them (a group per model, the mesh inside). */
function farm (n: number) {
    const root = new Group();
    for (let i = 0; i < n; i++) {
        const g = bake('test|post', (mb) => { mb.main.box(0.2, 1, 0.2, 0xa8703f, { y: 0.5 }); });
        g.position.set(i, 0, 0);
        root.add(g);
    }
    return root;
}

function camera (x: number, z: number) {
    const cam = new OrthographicCamera(-10, 10, 6, -6, 1, 400);
    cam.position.set(x, Math.sin(EL) * 120, z + Math.cos(EL) * 120);
    cam.lookAt(x, 0, z);
    cam.updateMatrixWorld();
    return cam;
}

test('instancing: the same baked model in view is drawn as one instanced mesh, and the members stay where they are', () => {
    const root = farm(12);
    root.updateMatrixWorld(true);
    const b = new Batcher();
    b.run(root, camera(5, 0), 4);
    assert.equal(b.stats.groups, 1, 'one group');
    assert.equal(b.stats.instanced, 12, 'all twelve in it');
    const inst = b.group.children[0] as Mesh & { count: number; instanceMatrix: { array: Float32Array } };
    assert.equal(inst.count, 12);
    assert.equal(inst.instanceMatrix.array[12 * 0 + 12], 0, 'first post at x 0');
    assert.equal(inst.instanceMatrix.array[16 * 11 + 12], 11, 'last post at x 11 (its own world matrix)');
    const posts = root.children.map((g) => g.children[0] as Mesh);
    assert.ok(posts.every((m) => !m.layers.test(camera(0, 0).layers)), 'the members leave the cameras\' layer (not drawn twice)');
    assert.ok(posts.every((m) => m.visible), 'but stay visible to the game (picking, roof fades)');
    // a see-through one is drawn the ordinary way
    const odd = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ transparent: true, opacity: 0.5 }));
    odd.geometry.userData.shared = true;
    root.add(odd);
    root.updateMatrixWorld(true);
    b.run(root, camera(5, 0), 4);
    assert.equal(b.stats.instanced, 12);
    assert.equal(b.stats.plain, 1);
    assert.ok(odd.layers.test(camera(0, 0).layers));
    // far away: nothing is instanced, and a lone member is drawn the ordinary way
    b.run(root, camera(500, 0), 4);
    assert.equal(b.stats.instanced, 0);
    assert.equal(inst.visible, false, 'the empty group draws nothing');
    assert.ok(posts.every((m) => m.layers.test(camera(0, 0).layers)), 'members out of view are back to ordinary (three culls them)');
    root.remove(...root.children.slice(1));
    root.updateMatrixWorld(true);
    b.run(root, camera(0, 0), 4);
    assert.equal(b.stats.groups, 0, 'one alone is not worth a group');
    // off: everything is ordinary again
    const many = farm(5);
    many.updateMatrixWorld(true);
    b.enabled = false;
    b.run(many, camera(2, 0), 4);
    assert.equal(b.stats.instanced, 0);
    assert.ok(many.children.every((g) => g.children[0].layers.test(camera(0, 0).layers)));
    b.dispose();
    assert.equal(b.size, 0);
    assert.equal(b.group.children.length, 0);
});

test('instancing: an idle group is freed after a while, and a group grows past its first size', () => {
    const b = new Batcher();
    const small = farm(3);
    small.updateMatrixWorld(true);
    b.run(small, camera(1, 0), 4);
    assert.equal(b.size, 1);
    const big = farm(40);
    big.updateMatrixWorld(true);
    b.run(big, camera(20, 0), 30);
    assert.equal(b.stats.instanced, 40, 'grows (8, then 64)');
    const empty = new Group();
    for (let i = 0; i < 700; i++) b.run(empty, camera(0, 0), 4);
    assert.equal(b.size, 0, 'freed after ten seconds unused');
    assert.equal(b.group.children.length, 0);
});

test('the ledger hands every drawn geometry and material back, and a model that goes frees only what was its own', () => {
    let drawn = 0;
    const fake = { renderBufferDirect () { drawn++; } } as unknown as WebGLRenderer;
    const ledger = new Ledger(fake);
    const cached = bake('test|ledger', (mb) => { mb.main.box(1, 1, 1, 0xffffff); });
    const cachedMesh = cached.children[0] as Mesh;
    const own = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const fade = new MeshStandardMaterial({ transparent: true });
    for (const m of [cachedMesh, own]) fake.renderBufferDirect(null as never, null as never, m.geometry, m.material as MeshStandardMaterial, m, null);
    fake.renderBufferDirect(null as never, null as never, own.geometry, fade, own, null);
    assert.equal(drawn, 3, 'the renderer still draws');
    assert.equal(ledger.geos.size, 2);
    assert.equal(ledger.mats.size, 3);
    const gone: string[] = [];
    own.geometry.addEventListener('dispose', () => gone.push('own geometry'));
    cachedMesh.geometry.addEventListener('dispose', () => gone.push('cached geometry'));
    fade.addEventListener('dispose', () => gone.push('fade material'));
    (cachedMesh.material as MeshStandardMaterial).addEventListener('dispose', () => gone.push('cached material'));
    // a model leaves: its one-off geometry and its own (fading) material go, the cache's stay for the next model
    const model = new Group();
    model.add(own, cached);
    ledger.dropModel(model, [fade]);
    assert.deepEqual(gone.sort(), ['fade material', 'own geometry']);
    assert.equal(ledger.geos.size, 1);
    // the view goes: everything left is handed back (the objects stay usable: the next view uploads them again)
    gone.length = 0;
    ledger.release();
    assert.deepEqual(gone.sort(), ['cached geometry', 'cached material']);
    assert.equal(ledger.geos.size + ledger.mats.size, 0);
});

test('the sun\'s shadow box fits the view, in steps, and slides in whole texels', () => {
    const cam = new OrthographicCamera(-10, 10, 5.625, -5.625, 1, 400);
    const ext = viewExtent(cam);
    assert.ok(Math.abs(ext.halfW - 10) < 1e-9);
    assert.ok(Math.abs(ext.halfD - 5.625 / Math.sin(EL)) < 1e-9);
    const r = reach(ext, 5);
    assert.ok(r.rx === 15 && r.r === 15);
    const sun = new DirectionalLight();
    const target = new Vector3(123.37, 0, 77.91);
    sun.position.set(-0.6, 1, -0.5).normalize().multiplyScalar(110).add(target);
    sun.target.position.copy(target);
    const half = fitShadow(sun, ext, 1024);
    assert.equal(half % 4, 0, 'in steps of four tiles (the zoom glides without the box breathing)');
    assert.ok(half >= Math.hypot(ext.halfW, ext.halfD) && half < 30, `fits the view (${half}), well inside the old fixed 30`);
    // the texel snap: the target sits on the shadow map's texel grid, and the light moved with it
    const texel = (half * 2) / 1024;
    const fwd = new Vector3().subVectors(sun.target.position, sun.position).normalize();
    const right = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0)).normalize();
    const up = new Vector3().crossVectors(right, fwd);
    for (const a of [sun.target.position.dot(right) / texel, sun.target.position.dot(up) / texel]) assert.ok(Math.abs(a - Math.round(a)) < 1e-6);
    assert.ok(sun.target.position.distanceTo(target) < texel * 1.5, 'by less than a texel or so');
    // zoomed out the box grows
    const wide = viewExtent(new OrthographicCamera(-20, 20, 11.25, -11.25, 1, 400));
    assert.ok(fitShadow(sun, wide, 1024) > half);
});

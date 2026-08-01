// Blacksite — render suite.
//
// The logic suite (blacksite.test.mjs) imports the simulation into Node and
// never touches a GPU. This one does the opposite: it boots the real page in
// headless Chromium on SwiftShader and asserts the things only a real render
// can tell you — that no shader failed to compile, that no module 404'd, that
// the frame is not a flat colour, that no transform went NaN, and that the
// pipeline survives every quality tier and a resize.
//
// SwiftShader is software rendering, so this is slow and is NOT a performance
// measurement. Resolutions are kept small deliberately.
//
// It skips, loudly and with exit 0, when Playwright or a Chromium build is not
// on the machine — `npm run check` has to stay green on a laptop that never
// installed a browser.
//
// Run: node tests/blacksite_render.test.mjs
import { harness } from './no_room_for_heroes_lib.mjs';

const t = harness('blacksite-render');

let serve, launch, findChrome, openGame, pose, frameStats, diagnoseBoot;
try {
  ({ serve, launch, findChrome, openGame, pose, frameStats, diagnoseBoot } =
    await import('../tools/blacksite/shoot.mjs'));
} catch (e) {
  console.log('blacksite-render: SKIPPED — could not load the screenshot rig (' + e.message + ')');
  process.exit(0);
}

if (!findChrome()) {
  console.log('blacksite-render: SKIPPED — no Chromium under PLAYWRIGHT_BROWSERS_PATH');
  process.exit(0);
}

const browser = await launch().catch(() => null);
if (!browser) {
  console.log('blacksite-render: SKIPPED — playwright-core is not installed');
  process.exit(0);
}

const { server, port } = await serve();

// Anything on this list means the page is broken in a way a screenshot would
// not show. Chromium's own SwiftShader chatter is not our problem, and the
// parallel-shader-compile extension is genuinely absent under software GL.
const IGNORE = [
  /KHR_parallel_shader_compile/,
  /Automatic fallback to software WebGL/i,
  /GroupMarkerNotSet/,
  /SwiftShader/i,
  /\[\.WebGL-.*\] GL Driver Message/,
];
const noisy = (text) => IGNORE.some((re) => re.test(text));

// A boot failure has to be reported, not thrown — an uncaught rejection here
// exits before the harness prints anything, which turns a one-line diagnosis
// into a stack trace and a timeout.
async function boot(opts) {
  try {
    return await openGame(browser, port, opts);
  } catch (err) {
    t.ok(false, 'the game boots — ' + err.message);
    await browser.close();
    server.close();
    t.done();
    throw err;
  }
}

// Every module must parse as a module, on its own. This is a separate assertion
// from "the game boots" because it is the one that says *which file* is wrong.
{
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/blacksite/`, { waitUntil: 'domcontentloaded' });
  const bad = await diagnoseBoot(page);
  t.ok(bad.length === 0, 'every module under src/ parses and imports' +
    (bad.length ? ' — ' + bad.map((b) => `${b.file}: ${b.error}`).join(' | ') : ''));
  await page.close();
}

// ─────────────────────────────────────────────────────────── boots at all
{
  const { page, logs } = await boot({ w: 640, h: 360, quality: 2 });

  const api = await page.evaluate(() => {
    const B = window.BLACKSITE;
    return {
      ok: !!B,
      fatal: !document.getElementById('fatal').hidden,
      detail: document.querySelector('#fatal .detail')?.textContent || '',
      statics: B ? B.G.world.statics.length : 0,
      ready: B ? B.G.world.ready : false,
      slots: B ? B.G.weapons.slots.length : 0,
      sceneKids: B ? B.engine.scene.children.length : 0,
    };
  });

  t.ok(api.ok, 'the page boots and publishes window.BLACKSITE');
  t.ok(!api.fatal, 'nothing hit the fatal-error path' + (api.fatal ? ' — ' + api.detail : ''));
  t.ok(api.statics > 0 && api.ready, 'the level built collision geometry');
  t.ok(api.slots > 0, 'the player starts with a weapon');
  t.ok(api.sceneKids > 0, 'something is actually in the scene');

  const bad = logs.filter((l) =>
    (l.type === 'error' || l.type === 'pageerror' || l.type === 'requestfailed') && !noisy(l.text));
  t.ok(bad.length === 0, 'the console stayed clean at boot' +
    (bad.length ? ' — ' + bad.slice(0, 3).map((b) => `[${b.type}] ${b.text}`).join(' | ') : ''));

  // A shader that fails to compile does not throw — Three logs it and carries on
  // drawing nothing, which is exactly the failure a screenshot check misses.
  const shaderErrs = logs.filter((l) => /shader|GLSL|program/i.test(l.text) &&
    /error|fail/i.test(l.text) && !noisy(l.text));
  t.ok(shaderErrs.length === 0, 'every shader compiled' +
    (shaderErrs.length ? ' — ' + shaderErrs[0].text.slice(0, 300) : ''));

  await page.close();
}

// ─────────────────────────────────────────────── the frame has content in it
{
  const { page, logs } = await boot({ w: 800, h: 450, quality: 3 });
  await pose(page, 'overlook', 10);
  const st = await frameStats(page);

  t.ok(st.mean > 3 && st.mean < 250, `the frame is exposed, not black or blown (mean ${st.mean.toFixed(1)})`);
  t.ok(st.std > 6, `the frame has contrast rather than one flat colour (std ${st.std.toFixed(1)})`);
  t.ok(st.occupancy >= 4, `the frame uses a real tonal range (${st.occupancy}/16 buckets)`);

  // Every pose must render something. A camera that ends up inside geometry or
  // outside the level shows up here as a dead frame and nowhere else.
  for (const name of ['spawn', 'corridor', 'sunward', 'ground']) {
    await pose(page, name, 6);
    const s = await frameStats(page);
    t.ok(s.std > 3, `the ${name} pose renders a real image (std ${s.std.toFixed(1)})`);
  }

  const bad = logs.filter((l) =>
    (l.type === 'error' || l.type === 'pageerror') && !noisy(l.text));
  t.ok(bad.length === 0, 'no errors while rendering the poses' +
    (bad.length ? ' — ' + bad[0].text.slice(0, 300) : ''));

  await page.close();
}

// ──────────────────────────────────────────── the simulation stays finite
{
  const { page, logs } = await boot({ w: 480, h: 270, quality: 1 });

  // Drive real input rather than teleporting: hold every movement key at once,
  // spin the view, and fire, for a few simulated seconds. Anything that divides
  // by a zero-length vector or normalises a NaN surfaces as a non-finite
  // position within a hundred ticks.
  const sim = await page.evaluate(async () => {
    const B = window.BLACKSITE, G = B.G;
    G.mode = 'playing';
    const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
    let bad = null, ticks = 0;
    for (let i = 0; i < 900; i++) {
      G.input.move.x = Math.sin(i * 0.11);
      G.input.move.y = Math.cos(i * 0.07);
      G.input.look.x = Math.sin(i * 0.3) * 14;
      G.input.look.y = Math.cos(i * 0.23) * 9;
      G.input.buttons = new Set(i % 60 < 30 ? ['fire'] : ['sprint', 'fire']);
      G.input.pressed = new Set(i % 97 === 0 ? ['jump'] : i % 211 === 0 ? ['reload'] : []);
      B.step(1 / 120);
      G.events.length = 0;
      ticks++;
      if (!finite(G.player.pos) || !finite(G.player.vel) ||
          !Number.isFinite(G.player.yaw) || !Number.isFinite(G.player.pitch)) {
        bad = { i, pos: { ...G.player.pos }, vel: { ...G.player.vel }, yaw: G.player.yaw };
        break;
      }
      for (const e of G.enemies) if (e.alive && !finite(e.pos)) { bad = { i, enemy: e.id }; break; }
      if (bad) break;
    }
    const b = G.world.bounds;
    return {
      bad, ticks,
      pos: { ...G.player.pos },
      inside: G.player.pos.x > b.min.x && G.player.pos.x < b.max.x &&
              G.player.pos.z > b.min.z && G.player.pos.z < b.max.z &&
              G.player.pos.y > b.min.y,
      shots: G.stats.shots,
    };
  });

  t.ok(!sim.bad, 'nothing went NaN over 900 ticks of adversarial input' +
    (sim.bad ? ' — ' + JSON.stringify(sim.bad) : ''));
  t.ok(sim.inside, `the player never left the level (${sim.pos.x.toFixed(1)}, ${sim.pos.y.toFixed(1)}, ${sim.pos.z.toFixed(1)})`);
  t.ok(sim.shots > 0, 'holding the trigger actually fired rounds');

  // And the render layer survives whatever state that left behind.
  const drew = await page.evaluate(async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    return window.BLACKSITE.engine.renderer.info.render.calls;
  });
  t.ok(drew > 0, `the renderer is still issuing draw calls afterwards (${drew})`);

  const bad = logs.filter((l) => (l.type === 'error' || l.type === 'pageerror') && !noisy(l.text));
  t.ok(bad.length === 0, 'the simulation run logged no errors' +
    (bad.length ? ' — ' + bad[0].text.slice(0, 300) : ''));

  await page.close();
}

// ───────────────────────────────── the camera survives a stalled frame
{
  // The camera rig's springs run on the render delta, which the loop clamps to
  // 0.25 s after a stall or an alt-tab. Explicit Euler on a stiff spring
  // diverges at that step size, and when it did, the camera's Y reached 7×10¹²,
  // every mesh fell outside the frustum, and the frame came back as bare sky —
  // with no error logged anywhere. Feed it the worst delta it can legally see
  // and check it is still pointing at the world.
  const { page, logs } = await boot({ w: 400, h: 225, quality: 2 });
  await pose(page, 'spawn', 4);

  const r = await page.evaluate(async () => {
    const B = window.BLACKSITE, e = B.engine;
    const before = e.camera.position.y;
    // Land hard a few times, then hand it nothing but stalled frames.
    for (let i = 0; i < 60; i++) {
      if (i % 12 === 0) e.kickLanding(1);
      e.updateCamera(0.25);
    }
    const dip = e.rig.landDip, sway = e.rig.sway.x;
    // And a pathological one, larger than the loop would ever pass.
    e.updateCamera(5);
    return {
      before, after: e.camera.position.y,
      dip, sway,
      finite: Number.isFinite(e.camera.position.y) && Number.isFinite(e.rig.landDip),
      extreme: e.camera.position.y,
    };
  });

  t.ok(r.finite, 'sixty stalled frames leave the camera finite');
  t.ok(Math.abs(r.dip) < 1, `the landing spring stays bounded (dip ${r.dip.toFixed(4)})`);
  t.ok(Math.abs(r.sway) <= 0.1, `and so does the sway spring (${r.sway.toFixed(4)})`);
  t.ok(Math.abs(r.after - r.before) < 2,
    `the camera does not drift away from the player (${r.before.toFixed(2)} → ${r.after.toFixed(2)})`);

  // The real symptom, asserted directly: after all that, does the world still
  // draw? A camera in orbit renders the sky and nothing else.
  const drew = await page.evaluate(async () => {
    const B = window.BLACKSITE;
    for (let i = 0; i < 3; i++) await new Promise((rf) => requestAnimationFrame(rf));
    let visible = 0;
    const cam = B.engine.camera;
    const f = new B.THREE.Frustum().setFromProjectionMatrix(
      new B.THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    B.level.group.traverse((o) => { if (o.isMesh && f.intersectsObject(o)) visible++; });
    return { visible, calls: B.engine.renderer.info.render.calls };
  });
  t.ok(drew.visible > 0, `the level is still in frame afterwards (${drew.visible} meshes, ${drew.calls} calls)`);

  const bad = logs.filter((l) => (l.type === 'error' || l.type === 'pageerror') && !noisy(l.text));
  t.ok(bad.length === 0, 'and nothing threw' + (bad.length ? ' — ' + bad[0].text.slice(0, 200) : ''));

  await page.close();
}

// ──────────────────────────── every named pose actually frames something
{
  // A pose that renders empty sky is either a camera in the wrong place or a
  // level that moved out from under it. Either way it is worth catching here
  // rather than in a screenshot nobody looks at.
  const { page } = await boot({ w: 400, h: 225, quality: 2 });
  const names = await page.evaluate(() => {
    const L = window.BLACKSITE.level;
    return L && L.poses ? Object.keys(L.poses) : [];
  });
  t.ok(names.length > 0, `the level publishes its own camera poses (${names.length})`);

  for (const name of names) {
    await pose(page, name, 3);
    const r = await page.evaluate(() => {
      const B = window.BLACKSITE, cam = B.engine.camera;
      const f = new B.THREE.Frustum().setFromProjectionMatrix(
        new B.THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      let visible = 0;
      B.level.group.traverse((o) => { if (o.isMesh && f.intersectsObject(o)) visible++; });
      return { visible, y: cam.position.y };
    });
    t.ok(Number.isFinite(r.y) && Math.abs(r.y) < 200, `the ${name} pose keeps the camera in the level (y ${r.y.toFixed(1)})`);
    t.ok(r.visible > 0, `the ${name} pose has something in frame (${r.visible} meshes)`);
  }
  await page.close();
}

// ─────────────────────────────────── a touchscreen can start the game
{
  // The touch layer listens on the document with `passive:false`. Calling
  // preventDefault there for a finger it does not own cancels the click the
  // browser would otherwise synthesise, and every DOM button in the game dies
  // — Deploy included. It shipped that way: no error, no context loss, the
  // render loop still turning over, and completely unplayable. It reads as a
  // crash because a menu that ignores you is indistinguishable from a freeze.
  let ctx = null, page = null;
  try {
    ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    });
    page = await ctx.newPage();
  } catch {
    t.ok(true, 'touch context unavailable in this browser build — skipped');
  }

  if (page) {
    const logs = [];
    page.on('pageerror', (e) => logs.push({ type: 'pageerror', text: String(e.stack || e) }));
    page.on('console', (m) => { if (m.type() === 'error') logs.push({ type: 'error', text: m.text() }); });
    await page.addInitScript(() => { window.__BS_TEST__ = true; });
    await page.goto(`http://127.0.0.1:${port}/blacksite/`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!window.BLACKSITE, null, { timeout: 240000 });

    const detected = await page.evaluate(() => ({
      touchOnly: !!window.BLACKSITE.input.touchOnly,
      controlsShown: document.getElementById('app').classList.contains('touch'),
      mode: window.BLACKSITE.G.mode,
    }));
    t.ok(detected.touchOnly, 'a touch-only context is recognised without waiting for a tap');
    t.ok(detected.controlsShown, 'and the on-screen controls are up before the first touch');

    const box = await page.evaluate(() => {
      const b = [...document.querySelectorAll('#menu button')].find((e) => /deploy/i.test(e.textContent));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    t.ok(!!box, 'the main menu offers a Deploy button');

    if (box) {
      // A real finger, not element.click() — the synthetic path bypasses
      // exactly the listeners that broke this.
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => window.BLACKSITE.G.mode === 'playing', null, { timeout: 15000 })
        .catch(() => {});
      const after = await page.evaluate(() => window.BLACKSITE.G.mode);
      t.ok(after === 'playing', `tapping Deploy starts the game (mode ${after})`);

      // And the game is actually playable afterwards: the stick moves the player.
      const walked = await page.evaluate(async () => {
        const G = window.BLACKSITE.G;
        G.player.pos.x = 0; G.player.pos.z = 44; G.player.yaw = 0;
        G.player.vel.x = G.player.vel.y = G.player.vel.z = 0;
        return G.player.pos.z;
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 78, y: 700, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 78, y: 646, id: 2 }] });
      await page.evaluate(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r)); });
      const z = await page.evaluate(() => window.BLACKSITE.G.player.pos.z);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      t.ok(z < walked - 0.5, `the movement stick walks the player (${walked.toFixed(1)} → ${z.toFixed(1)})`);
    }

    const bad = logs.filter((l) => !noisy(l.text));
    t.ok(bad.length === 0, 'and the touch path logged nothing' +
      (bad.length ? ' — ' + bad[0].text.slice(0, 200) : ''));
    await page.close();
  }
  if (ctx) await ctx.close();
}

// ──────────────────────────────────── every quality tier, and a resize
{
  const { page, logs } = await boot({ w: 480, h: 270, quality: 2 });
  const res = await page.evaluate(async () => {
    const B = window.BLACKSITE;
    const out = [];
    for (const q of [0, 1, 2, 3]) {
      B.engine.setQuality(q);
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
      out.push({ q, calls: B.engine.renderer.info.render.calls });
    }
    // Odd sizes catch the half-resolution buffers that assume an even divisor.
    for (const [w, h] of [[321, 197], [800, 451], [200, 200]]) {
      B.engine.resize(w, h);
      for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r));
      out.push({ size: [w, h], calls: B.engine.renderer.info.render.calls });
    }
    return out;
  });

  for (const r of res) {
    const label = r.size ? `resize to ${r.size[0]}×${r.size[1]}` : `quality tier ${r.q}`;
    t.ok(r.calls > 0, `${label} still renders (${r.calls} draw calls)`);
  }

  const bad = logs.filter((l) => (l.type === 'error' || l.type === 'pageerror') && !noisy(l.text));
  t.ok(bad.length === 0, 'switching tiers and resizing logged no errors' +
    (bad.length ? ' — ' + bad[0].text.slice(0, 300) : ''));

  await page.close();
}

await browser.close();
server.close();
t.done();

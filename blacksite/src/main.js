// Boot and the frame loop.
//
// Simulation runs on a fixed 120 Hz step with an accumulator; rendering runs as
// fast as the display will take it. Everything that affects hit registration
// lives inside the fixed step, everything that only affects how it looks lives
// outside it. That is the whole reason the two are separated: a 144 Hz player
// and a 60 Hz player must get identical bullets.

import * as THREE from 'three';
import { createState, emit } from './core/state.js';
import * as C from './core/constants.js';
import { createInput } from './core/input.js';
import { createEngine } from './render/engine.js';
import { createSky } from './render/sky.js';
import { createMaterials } from './render/materials.js';
import { createLighting } from './render/lighting.js';
import { createPostFX } from './render/postfx.js';
import { buildLevel } from './world/level.js';
import { createWeapons, updateWeapons } from './game/weapons.js';
import { createViewmodel } from './game/viewmodel.js';
import { updatePlayer } from './game/player.js';
import { updateAI } from './game/ai.js';
import { createEnemyRigs } from './game/enemies.js';
import { updateDirector } from './game/director.js';
import { createFX } from './fx/fx.js';
import { createAudio } from './audio/audio.js';
import { createHUD } from './ui/hud.js';
import { createMenu } from './ui/menu.js';

export async function boot(root) {
  const canvas = root.querySelector('#gl');
  const G = createState(0x51ed5eed);
  const loadStatus = root.querySelector('#load-status');
  const say = (s) => { if (loadStatus) loadStatus.textContent = s; };

  say('starting renderer');
  const engine = createEngine(G, canvas);
  if (engine.failed) {
    fatal(root, 'This browser could not create a WebGL context.', engine.error);
    return null;
  }
  engine.resize(root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight);

  say('building materials');
  const materials = await createMaterials(G, engine);

  say('lighting the sky');
  const sky = createSky(G, engine);
  const lighting = createLighting(G, engine, sky);

  say('assembling the level');
  const level = buildLevel(G, engine, materials);
  G.world.ready = true;

  say('loading weapons');
  createWeapons(G);
  const viewmodel = createViewmodel(G, engine, materials);

  say('spawning');
  const enemies = createEnemyRigs(G, engine, materials);
  const fx = createFX(G, engine, materials);

  say('compiling shaders');
  const post = createPostFX(G, engine, sky);
  engine.post = post;

  const audio = createAudio(G);
  const hud = createHUD(G, root);
  const input = createInput(G, canvas, {
    onLockLost() { if (G.mode === 'playing') { G.mode = 'paused'; menu.show('pause'); } },
    onLock() { if (G.mode === 'paused') { G.mode = 'playing'; menu.hide(); } },
  });

  const menu = createMenu(G, root, {
    start() {
      G.mode = 'playing';
      audio.resume();
      input.lock();
    },
    resume() { input.lock(); },
    restart() { restart(); },
    quality(q) { engine.setQuality(q); post.setQuality && post.setQuality(q); },
  });

  function restart() {
    const fresh = createState(0x51ed5eed);
    // Keep the settings the player chose; reset everything else.
    fresh.settings = G.settings;
    fresh.world = G.world;
    for (const k in fresh) if (k !== 'world' && k !== 'settings') G[k] = fresh[k];
    createWeapons(G);
    G.player.pos.x = level.spawn.x; G.player.pos.y = level.spawn.y; G.player.pos.z = level.spawn.z;
    G.player.yaw = level.spawnYaw || 0;
    enemies.reset && enemies.reset();
    fx.reset && fx.reset();
    G.mode = 'playing';
  }

  G.player.pos.x = level.spawn.x; G.player.pos.y = level.spawn.y; G.player.pos.z = level.spawn.z;
  G.player.yaw = level.spawnYaw || 0;

  // Warm the shader cache before the first frame. Without this the first shot,
  // the first blood decal and the first muzzle flash each stall for 50–200 ms
  // as their material compiles — the single most obvious "not AAA" tell there is.
  say('warming shaders');
  await warmup(engine, [engine.scene, engine.view]);

  window.addEventListener('resize', () => {
    engine.resize(root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight);
  });

  // ── the loop ───────────────────────────────────────────────────────────────
  let last = performance.now() / 1000;
  let acc = 0;
  let raf = 0;
  const perf = { fps: 60, ms: 16, smoothed: 16 };

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const t = now / 1000;
    let dt = t - last;
    last = t;
    // A tab that was backgrounded returns with a multi-second dt. Clamp it, or
    // the accumulator spends the next second catching up in fast-forward.
    if (dt > 0.25) dt = 0.25;
    if (dt < 0) dt = 0;
    perf.ms = dt * 1000;
    perf.smoothed += (perf.ms - perf.smoothed) * 0.06;
    perf.fps = 1000 / Math.max(perf.smoothed, 0.001);

    input.sample();

    const running = G.mode === 'playing';
    if (running) {
      acc += dt;
      let steps = 0;
      while (acc >= C.TICK && steps < C.MAX_STEPS) {
        stepSim(C.TICK);
        acc -= C.TICK;
        steps++;
      }
      // If we blew the step budget the machine cannot keep up; drop the debt
      // rather than accumulating a spiral of death.
      if (steps >= C.MAX_STEPS) acc = 0;
      G.time.steps = steps;
    }

    G.time.dt = dt;
    drainEvents();

    engine.updateCamera(dt);
    sky.update(dt);
    lighting.update(dt);
    level.update && level.update(dt);
    enemies.sync(dt);
    viewmodel.update(dt);
    fx.update(dt);
    audio.update(dt);
    hud.update(dt, perf);
    post.update && post.update(dt);

    engine.render();
    input.endFrame();
    G.time.frame++;
  }

  function stepSim(dt) {
    G.time.t += dt;
    updatePlayer(G, dt);
    updateWeapons(G, dt);
    updateAI(G, dt);
    updateDirector(G, dt);
    fx.step(G, dt);
  }

  function drainEvents() {
    const q = G.events;
    for (let i = 0; i < q.length; i++) {
      const e = q[i];
      audio.handle(e);
      fx.handle(e);
      hud.handle(e);
      if (e.type === 'land') engine.kickLanding(e.hard);
      if (e.type === 'playerDied') { menu.show('dead'); input.unlock(); }
    }
    q.length = 0;
  }

  raf = requestAnimationFrame(frame);
  menu.show('main');
  say('');
  root.classList.add('ready');

  // Exposed for the headless render suite: it drives frames deterministically
  // and reads back what the simulation thinks happened.
  const api = {
    G, engine, level, fx, audio, hud, menu, input, materials, sky, lighting, post, enemies, viewmodel,
    perf,
    step: stepSim,
    frame,
    stop() { cancelAnimationFrame(raf); input.dispose(); },
    THREE,
  };
  window.BLACKSITE = api;
  emit(G, 'ready', {});
  return api;
}

// Three compiles a material the first time it is actually drawn. `compileAsync`
// walks the scene graph and does it up front instead.
async function warmup(engine, scenes) {
  for (const s of scenes) {
    try {
      if (engine.renderer.compileAsync) await engine.renderer.compileAsync(s, engine.camera);
      else engine.renderer.compile(s, engine.camera);
    } catch { /* a warm-up failure is not worth failing the boot over */ }
  }
}

function fatal(root, msg, err) {
  const el = root.querySelector('#fatal');
  if (!el) return;
  el.hidden = false;
  el.querySelector('.msg').textContent = msg;
  if (err) el.querySelector('.detail').textContent = String(err && err.message || err);
  root.classList.add('failed');
}

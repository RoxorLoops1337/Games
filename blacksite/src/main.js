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
import { updateAI, resetAI } from './game/ai.js';
import { createEnemyRigs } from './game/enemies.js';
import { updateDirector } from './game/director.js';
import { createFX } from './fx/fx.js';
import { createAudio } from './audio/audio.js';
import { createHUD } from './ui/hud.js';
import { createMenu } from './ui/menu.js';

export async function boot(root) {
  const canvas = root.querySelector('#gl');
  const G = createState(0x51ed5eed);
  // The screenshot rig and the render suite set this before the page loads so
  // they can exercise a specific tier. Without reading it the `--quality` flag
  // was inert and everything was always rendering at ULTRA.
  if (typeof window.__BS_QUALITY__ === 'number') {
    G.settings.quality = Math.max(0, Math.min(3, window.__BS_QUALITY__ | 0));
  } else if (isPhone()) {
    // Decided before the engine exists, because the tier sizes the render
    // targets. A phone will not hold tier 3, and booting it there means a
    // stuttering first impression the player has to go and fix. The menu's
    // saved settings are applied after this and override it.
    G.settings.quality = 1;

    // Two effects off by default on a phone, both on their own merits and both
    // suspects in a dark speckled pattern reported on a real device that does
    // not reproduce under software GL.
    //
    // Grain is the stronger suspect. It is high-frequency by construction, and
    // TAA is what normally averages it into something filmic — so while the
    // view is still it reads as grain, and the moment you turn, TAA rejects its
    // history and the raw pattern is left standing over everything. That is
    // exactly "only when moving". On a small dense screen the effect was never
    // buying much anyway.
    //
    // Motion blur is the other: it is the one pass that does nothing at all
    // until you move, it costs fill rate a phone does not have, and smearing a
    // 6-inch screen is not the same trade as smearing a monitor.
    G.settings.filmGrain = false;
    G.settings.motionBlur = false;
  }
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
  // Hung off the engine so any render module can read the authoritative light
  // state without main.js threading it through every constructor. The viewmodel
  // in particular needs it: it renders in a separate scene, so the only way its
  // key light can agree with the world's is to read the same numbers.
  engine.lighting = lighting;

  say('assembling the level');
  const level = buildLevel(G, engine, materials);
  G.world.ready = true;

  say('loading weapons');
  createWeapons(G);
  const viewmodel = createViewmodel(G, engine, materials);
  // FX needs the muzzle in world space to put the flash and the brass in the
  // right place. Hung off the engine so it can ask directly, rather than
  // reaching through `window.BLACKSITE` and falling back to a constant offset.
  engine.viewmodel = viewmodel;

  say('spawning');
  const enemies = createEnemyRigs(G, engine, materials);
  const fx = createFX(G, engine, materials);

  say('compiling shaders');
  const post = createPostFX(G, engine, sky);
  engine.post = post;
  // The composite pass tone maps with AgX inside its own shader, which the sky
  // cannot detect: it watches `renderer.toneMapping`, and that is deliberately
  // left at NoToneMapping so the world renders into an HDR buffer untouched. Un-
  // told, the dome keeps its own highlight shoulder on and the aureole gets
  // compressed twice — two shoulders in series is how a dusk sky turns to grey
  // felt, and the amber near the sun is the first thing it costs you.
  if (sky.setToneMapped) sky.setToneMapped(true);

  const audio = createAudio(G);
  const hud = createHUD(G, root);
  const input = createInput(G, canvas, {
    root,
    onLockLost() {
      root.classList.remove('locked');
      // On a touchscreen there is no pointer to lose, so losing it must not
      // pause the game — otherwise the first tap pauses it and the second
      // unpauses it, forever.
      if (input && input.usingTouch) return;
      if (G.mode === 'playing') { G.mode = 'paused'; menu.show('pause'); }
    },
    onLock() {
      // The CSS hides the system cursor only while the pointer is locked; without
      // this class the crosshair cursor never switches off during play.
      root.classList.add('locked');
      if (G.mode === 'paused') { G.mode = 'playing'; menu.hide(); }
    },
  });

  // A device with no mouse gets the controls immediately — there is nothing
  // else to play with, and hiding them until the first touch means hiding them
  // until the player has guessed what to do. A laptop that merely has a
  // touchscreen gets them only once a finger actually lands, so it is not
  // handed thumb buttons it will never use.
  if (input.touchOnly) root.classList.add('touch');
  else if (input.touch) {
    window.addEventListener('touchstart',
      () => root.classList.add('touch'), { passive: true, once: true });
  }
  if (input.touch) {
    window.addEventListener('touchstart',
      () => root.classList.add('touched'), { passive: true, once: true });
  }

  const menu = createMenu(G, root, {
    start() {
      G.mode = 'playing';
      audio.resume();
      input.lock();
    },
    resume() { input.lock(); },
    restart() { restart(); },
    // `engine.setQuality` resizes the buffers and re-tiers the renderer; the
    // modules that own their own budgets have to be told separately, because
    // the engine deliberately knows nothing about them.
    quality(q) {
      // `engine.setQuality` already forwards to the post chain, so it is not
      // called again here. The rest do not hang off the engine and have to be
      // told directly.
      engine.setQuality(q);
      lighting.setQuality && lighting.setQuality(q);
      sky.setQuality && sky.setQuality(q);
      materials.setQuality && materials.setQuality(q);
    },
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
    // The AI is self-healing without this, but squad blackboards and in-flight
    // paths would survive one frame into the new run and briefly point men at
    // where the last one ended.
    resetAI(G);
    enemies.reset && enemies.reset();
    fx.reset && fx.reset();
    G.mode = 'playing';
    // Restarting owns re-acquiring the pointer. It is always reached from a
    // click on the death screen, so the gesture requirement is satisfied and
    // the browser will grant it.
    input.lock();
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
  const fixedDt = typeof window.__BS_FIXED_DT__ === 'number' && window.__BS_FIXED_DT__ > 0
    ? Math.min(window.__BS_FIXED_DT__, 0.25) : 0;
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
    // The screenshot rig pins the delta so a capture is reproducible: on
    // software GL a frame genuinely takes over a second, and every spring,
    // decay and accumulator in the game would otherwise see a different
    // timestep on every run and no two captures would match.
    if (fixedDt) dt = fixedDt;
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
    materials.update(dt);
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
      if (enemies.handle) enemies.handle(e);
      if (viewmodel.handle) viewmodel.handle(e);
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

// A coarse pointer on a small screen: an actual phone or small tablet, rather
// than a laptop that happens to have a touchscreen. Only used to pick a
// starting quality tier — the controls themselves appear on a real touch, so
// getting this wrong costs a settings change and never a broken game.
function isPhone() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) <= 820;
  return coarse && small;
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

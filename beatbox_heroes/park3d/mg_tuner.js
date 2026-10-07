// PITCH TUNER in low-poly 3D (Tuner Artist). A night vocal booth, the hero singing at a studio mic, a big glowing pitch ladder with crystal target notes and a
// luminous orb for the sung pitch. Rules, scoring and result fields mirror the 2D tuner (mg_tuner_logic.js). See MINI_PLAN.md for the contract.
//   createTuner(ctx, opts) -> { group, update, render, resize, setLook, setQuality, start, dispose, ...test hooks }
// TEST HOOKS (window.__park.game): start({range:'higher'|'lower', mode:'mic'|'ear', fake:true}), feedPitch(hz | 0 | null), tick(seconds), state(), result(),
//   answer(1|-1) / press('higher'|'lower'), manual(bool), ui, logic. Calling tick() switches the sim to manual time (real frames then only animate the view).
import { THREE } from './kit.js';
import { createCharacter } from './characters.js';
import { createPost } from './fx_post.js';
import { buildSet, BOOTH } from './mg_tuner_set.js';
import { buildRoad, LAD } from './mg_tuner_road.js';
import { buildAura, buildMic } from './mg_tuner_fx.js';
import { createUI } from './mg_tuner_ui.js';
import { createLogic, mf } from './mg_tuner_logic.js';

const DEFAULT_LOOK = { name: 'Tay', body: 'neutral', skin: '#c68b5e', hair: { style: 'twists', color: '#1a1420' }, top: { id: 'oversized', color: '#ffd23f', color2: '#e63946' }, bottom: { id: 'camo', color: '#5a6b3a' }, shoes: { id: 'retro', color: '#f7f2e8' } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const BBH = () => (typeof window !== 'undefined' && window.BBH) || {};
function studioLook(look) { const l = Object.assign({}, DEFAULT_LOOK, look || {}); l.hat = { id: 'none', color: '#17141f' }; l.acc = Object.assign({}, l.acc || {}, { ears: { id: 'hpears', color: '#ff3ea5' } }); if (l.acc.hand && /mic/.test(l.acc.hand.id || '')) l.acc.hand = { id: 'none_hand' }; return l; }

export function createTuner(ctx, opts) {
  opts = opts || {}; const { renderer, scene, camera } = ctx; let tier = opts.quality || ctx.quality || 'high';
  const group = new THREE.Group(); group.name = 'tuner';
  scene.background = new THREE.Color('#150f30'); scene.fog = new THREE.Fog('#1a1238', 14, 34); renderer.toneMappingExposure = 1.12; renderer.info.autoReset = false;
  const set = buildSet(ctx, tier), road = buildRoad(ctx, tier), aura = buildAura();
  group.add(set.group, road.group);

  // ---- the singer: hero with big headphones, a mic rig in front, turned slightly toward the ladder
  const singer = new THREE.Group(); singer.name = 'singer'; singer.position.set(0.1, 0, 0.35); group.add(singer);
  let hero = createCharacter(ctx, studioLook(opts.look)); singer.add(hero.object); hero.play('idle', {}); hero.update(0.016, 0); singer.updateMatrixWorld(true);
  const mp = new THREE.Vector3(); hero.anchors.mouth.getWorldPosition(mp); singer.worldToLocal(mp);
  const mic = buildMic(mp); singer.add(mic.group); singer.add(aura.group); singer.rotation.y = 0.5;
  function setLook(look) { hero.setLook(studioLook(look)); }

  // ---- post: bloom on the neon, tilt shift on high. The grade object is ours (no day/night cycle in the booth).
  const S = { bloom: 0.38, bloomThr: 1.0, vig: 0.5, sat: 1.14, gShadow: new THREE.Color('#e4d8ff'), gHigh: new THREE.Color('#fff0dc'), tilt: 0.55 };
  const post = createPost(ctx, S); post.setQuality(tier);

  // ---- camera: portrait, a touch of sway, a push on hits
  const CAMS = { play: { fov: 52, pos: new THREE.Vector3(0, 2.3, 5.6), look: new THREE.Vector3(0, 1.95, 0) }, menu: { fov: 50, pos: new THREE.Vector3(0.8, 1.3, 4.4), look: new THREE.Vector3(0.1, 0.62, 0.3) }, result: { fov: 50, pos: new THREE.Vector3(0.7, 1.2, 5.0), look: new THREE.Vector3(0.1, 0.12, 0.3) } };
  const cam = { fov: 52, pos: CAMS.play.pos.clone(), look: CAMS.play.look.clone() }; let punch = 0, push = 0, W = 540, Hh = 960, camMix = 1;
  function fitCamera(t, dt) {
    const want = ui.hasCard ? 'result' : ui.hasPicker ? 'menu' : 'play', T = CAMS[want], k0 = 1 - Math.exp(-(dt === undefined ? 1 : dt) * 3.2);
    cam.fov += (T.fov - cam.fov) * k0; cam.pos.lerp(T.pos, k0); cam.look.lerp(T.look, k0);
    const asp = W / Hh, k = Math.max(1, 0.5625 / Math.max(0.3, asp)), fov = 2 * Math.atan(Math.tan(cam.fov * Math.PI / 360) * k) * 180 / Math.PI, sw = want === 'play' ? 1 : 0.35;
    camera.fov = fov - punch * 3 - push * 2; camera.near = 0.3; camera.far = 60; camera.position.set(cam.pos.x + 0.07 * sw * Math.sin(t * 0.37), cam.pos.y + 0.04 * Math.sin(t * 0.51), cam.pos.z - push * 0.35); camera.lookAt(cam.look.x, cam.look.y, cam.look.z); camera.updateProjectionMatrix();
  }

  // ---- audio: plain synth tone (same recipe as the 2D tuner) on the game AudioContext, falling back to our own context
  let ownCtx = null, toneT0 = -9, toneDur = 0;
  function audioCtx() { const A = BBH().Audio; try { if (A && A.ctx && A.ctx.state !== 'closed') return A.ctx; } catch (e) { /* ignore */ } try { if (!ownCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ownCtx = new AC(); } if (ownCtx && ownCtx.state === 'suspended') ownCtx.resume(); return ownCtx; } catch (e) { return null; } }
  function tone(freq, dur, vol) {
    toneT0 = simT; toneDur = dur;
    try { const A = BBH().Audio; A && A.unlock && A.unlock(); const ac = audioCtx(); if (!ac || ac.state !== 'running') return; const o = ac.createOscillator(), o2 = ac.createOscillator(), gn = ac.createGain(), t = ac.currentTime, v = vol || 0.18;
      o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = freq; o2.frequency.value = freq * 2; gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(v, t + 0.04); gn.gain.setValueAtTime(v, t + dur - 0.08); gn.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(gn); o2.connect(gn); gn.connect(ac.destination); o.start(t); o2.start(t); o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02); } catch (e) { /* audio must never break the game */ }
  }
  const sfx = (n) => { try { const A = BBH().Audio; A && A.sfx && A.sfx(n); } catch (e) { /* ignore */ } };

  // ---- rules
  let simT = 0, cheerT = 0, missT = 0, lastResult = null, lastOpts = { range: 'higher', mode: 'mic' }, fake = null, micOpen = false, opening = false, gen = 0;
  const logic = createLogic({ rng: ctx.rng, mus: opts.mus || (opts.stats && opts.stats.mus) || 0, hooks: {
    tone, round() { /* ui polls state */ }, sing() { sfx('click'); },
    hit() { cheerT = 1.1; punch = 1; aura.boost(1); hero.play('cheer', { duration: 1.0, then: 'idle' }); sfx('hit_perfect'); if (logic.S.streak >= 3) sfx('sparkle'); },
    miss() { missT = 0.9; sfx('miss'); },
    done(r) { lastResult = r; sfx('levelup'); hero.play(r.accuracy >= 0.8 ? 'dance' : r.accuracy >= 0.5 ? 'cheer' : 'idle', { bpm: 118 }); try { closeMic(); } catch (e) { /* ignore */ } ui.showResult(r, { again: () => start(lastOpts), done: () => { quit(); } }); ctx.events.emit('minigame', { game: 'tuner', result: r }); },
  } });
  const S0 = logic.S;
  function closeMic() { try { const M = BBH().Mic; if (micOpen && M && M.close) M.close(); } catch (e) { /* ignore */ } micOpen = false; }
  function pitchNow() {
    if (fake) return fake;
    try { const M = BBH().Mic; if (M && M.isOpen && M.isOpen()) return M.pitchNow(); } catch (e) { /* ignore */ }
    return null;
  }
  function levelNow() {
    if (fake) return fake.freq > 0 ? 0.1 + 0.04 * Math.sin(simT * 31) : 0;
    try { const M = BBH().Mic; if (M && M.isOpen && M.isOpen()) return M.level() * 6; } catch (e) { /* ignore */ }
    return 0;
  }
  function begin(o) { lastResult = null; ui.hidePicker(); ui.clearOverlays(); simT0 = simT; road.setRange(o.mode === 'ear' ? 'ear' : o.range); logic.start(o); }
  let simT0 = 0;
  function start(o) {
    o = Object.assign({}, lastOpts, o || {}); lastOpts = { range: o.range === 'lower' ? 'lower' : 'higher', mode: o.mode === 'ear' ? 'ear' : 'mic' }; if (o.manual) manual = true; if (o.fake) fake = fake || { freq: 0, clarity: 0 };
    const my = ++gen; ui.hidePicker(); ui.clearOverlays(); closeMic();
    if (lastOpts.mode === 'mic' && !fake) {
      const M = BBH().Mic; if (!M || !M.open) { ui.flash('NO MIC HERE: EAR TRAINING', '#ffd23f'); lastOpts.mode = 'ear'; begin(lastOpts); return; }
      opening = true; ui.flash('OPENING MIC...', '#2ee6ff');
      Promise.resolve(M.open()).then((r) => { if (my !== gen) { try { M.close(); } catch (e) { /* ignore */ } return; } opening = false; if (!r || !r.ok) { ui.flash('NO MIC: EAR TRAINING', '#ffd23f'); lastOpts.mode = 'ear'; } else micOpen = true; begin(lastOpts); }, () => { if (my !== gen) return; opening = false; lastOpts.mode = 'ear'; begin(lastOpts); });
      return;
    }
    begin(lastOpts);
  }
  function quit() { gen++; closeMic(); ctx.events.emit('minigameQuit'); }
  const ui = createUI(opts.hud || document.body, { back: () => quit(), answer: (d) => answer(d), pick: (o) => start(o) });
  function answer(dir) { return logic.answer(dir); }
  const onKey = (e) => { if (e.key === 'Escape') quit(); else if (e.key === 'ArrowUp' || e.key === 'h') answer(1); else if (e.key === 'ArrowDown' || e.key === 'l') answer(-1); };
  window.addEventListener('keydown', onKey);
  ui.showPicker();

  // ---- the sim step (fixed small steps so tick(seconds) is deterministic) and the view update
  let manual = false, vuL = 0, vuR = 0, tmpV = new THREE.Vector3();
  function step(dt) { simT += dt; let rem = dt; while (rem > 1e-6) { const d = Math.min(rem, 1 / 30); logic.update(d, S0.state === 'play' && S0.phase === 'sing' ? pitchNow() : null); rem -= d; } }
  function view(dt, t) {
    cheerT = Math.max(0, cheerT - dt); missT = Math.max(0, missT - dt); punch = Math.max(0, punch - dt * 3); const lv = levelNow(); const playing = S0.state === 'play';
    const singing = playing && S0.mode === 'mic' && S0.phase === 'sing' && S0.cents !== null;
    road.update(dt, t, { S: S0, level: Math.min(1, lv) });
    // singer reactions: sings (talk clip) while the voice is detected, cheers on a hit, droops a little on a miss, eyes follow the orb
    if (cheerT <= 0) hero.play(singing ? 'talk' : 'idle', {});
    const bounce = cheerT > 0 ? Math.abs(Math.sin(cheerT * 9)) * 0.05 * Math.min(1, cheerT) : singing ? 0.012 * Math.sin(t * 16) : 0; singer.position.y = bounce; singer.rotation.x = missT > 0 ? 0.08 * Math.min(1, missT * 2) : 0;
    const sc = 1 + (singing ? 0.012 * Math.sin(t * 20) : 0); singer.scale.set(sc, 1 / sc, sc);
    tmpV.copy(road.orb.position); road.group.localToWorld(tmpV); hero.lookAt(tmpV.set(tmpV.x * 0.5, tmpV.y, tmpV.z)); hero.update(dt, t);
    aura.update(dt, t, playing ? S0.streak : 0, singing);
    // VU: mic level (or the tone envelope in ear mode), a little different on each side
    const env = simT - toneT0 < toneDur ? 0.55 + 0.25 * Math.sin(t * 24) : 0; const base = clamp(Math.max(lv * 1.1, env * (S0.mode === 'ear' ? 1 : 0.8)), 0, 1);
    vuL += (clamp(base * (0.9 + 0.1 * Math.sin(t * 13)), 0, 1) - vuL) * (1 - Math.exp(-dt * (base > vuL ? 28 : 7))); vuR += (clamp(base * (0.88 + 0.12 * Math.sin(t * 11 + 1)), 0, 1) - vuR) * (1 - Math.exp(-dt * (base > vuR ? 28 : 7)));
    const idle = 0.04 + 0.03 * Math.sin(t * 2.2); set.vu(Math.max(idle, vuL), Math.max(idle, vuR));
    set.update(dt, t, { live: singing, level: base, beat: punch });
    ui.update(S0, { level: base });
    fitCamera(t, dt);
  }
  function update(dt, t) { if (!manual) step(dt); view(dt, t); }
  let tv = 0;
  function render() { post.update(tv); post.render(); }
  const origUpdate = update; const updateT = (dt, t) => { tv = t; origUpdate(dt, t); };

  function resize(w, h, dpr) { W = w; Hh = h; post.resize(w, h, dpr); }
  function setQuality(q) { if (!['low', 'med', 'high'].includes(q)) return; tier = q; ctx.quality = q; post.setQuality(q); set.setQuality(q); road.setQuality(q); }

  const api = {
    group, update: updateT, render, resize, setLook, setQuality, start,
    dispose() { gen++; closeMic(); window.removeEventListener('keydown', onKey); ui.destroy(); post.dispose(); try { if (ownCtx) ownCtx.close(); } catch (e) { /* ignore */ } },
    // ---- test hooks
    feedPitch(hz) { fake = hz === null || hz === undefined ? null : { freq: hz > 0 ? hz : 0, clarity: hz > 0 ? 0.95 : 0 }; },
    tick(sec) { manual = true; let rem = Math.max(0, +sec || 0); while (rem > 1e-6) { const d = Math.min(rem, 0.05); step(d); simView += d; view(d, simView); rem -= d; } return S0.phase; },
    manual(v) { manual = v === undefined ? true : !!v; },
    state() { const o = {}; ['state', 'mode', 'range', 'round', 'rounds', 'score', 'total', 'phase', 'target', 'earA', 'earB', 'hold', 'cents', 'freq', 'streak', 'bestStreak', 'fb', 'inTune'].forEach((k) => { o[k] = S0[k]; }); o.targets = S0.targets.slice(); o.targetHz = S0.mode === 'mic' ? mf(S0.target) : null; o.rt = +S0.rt.toFixed(3); o.quality = tier; o.opening = opening; o.pickerOpen = ui.hasPicker; o.cardOpen = ui.hasCard; o.simT = +simT.toFixed(2); return o; },
    result() { return lastResult; },
    answer, press(x) { return answer(x === 1 || x === 'higher' || x === 'up' || x === 'HIGHER' ? 1 : -1); },
    ui, logic, road, set, aura, hero, post, stats() { return { quality: tier }; },
  };
  let simView = 0;
  if (opts.mode || opts.range || opts.autostart) start({ mode: opts.mode, range: opts.range });
  fitCamera(0, 99);
  return api;
}

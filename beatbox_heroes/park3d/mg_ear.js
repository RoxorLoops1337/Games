// EAR TRAINING in low-poly 3D (TRAIN). The night vocal booth of the tuner, the hero in big headphones at the mic, and a glowing note staff where every
// note you hear rises as a crystal gem: higher note = higher gem, a chord stacks its gems in one column. Beginners SEE the jump they hear.
//   createEar(ctx, opts) -> { group, update, render, resize, setLook, setQuality, start, dispose, setRewards, ...test hooks }
// opts: hud (DOM), look, quality, level (1..8), levels (Core.EAR_LEVELS), question(level, rng) (Core.earQuestion), lesson (default true: the lesson card first),
//   settings (E.settings: muted, sfx), tone(freq, dur, vol) (fallback voice when BBH.Audio has no note / interval / chord), again (default false), embedded.
// Events: 'minigame' {game:'ear', result} when the last round is answered, 'quit' {game:'ear', finished} (+ legacy 'minigameQuit').
// TEST HOOKS (window.__park.game / BBH.R3.world.game): start({level, lesson}), begin() (skip the lesson), state(), result(), answer(choice | index), replay(), next(),
//   example(i), tick(seconds) (manual sim time), manual(bool), plays (every note set played: {notes, chord, via}), ui, logic.
import { THREE, disposeTree } from './kit.js';
import { createCharacter } from './characters.js';
import { createPost } from './fx_post.js';
import { buildSet, glowTex } from './mg_tuner_set.js';
import { buildAura, buildMic } from './mg_tuner_fx.js';
import { createEarLogic } from './mg_ear_logic.js';
import { createUI } from './mg_ear_ui.js';

const DEFAULT_LOOK = { name: 'Tay', body: 'neutral', skin: '#c68b5e', hair: { style: 'twists', color: '#1a1420' }, top: { id: 'oversized', color: '#ffd23f', color2: '#e63946' }, bottom: { id: 'camo', color: '#5a6b3a' }, shoes: { id: 'retro', color: '#f7f2e8' } };
const BBH = () => (typeof window !== 'undefined' && window.BBH) || {};
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
function studioLook(look) { const l = Object.assign({}, DEFAULT_LOOK, look || {}); l.hat = { id: 'none', color: '#17141f' }; l.acc = Object.assign({}, l.acc || {}, { ears: { id: 'hpears', color: '#2ee6ff' } }); if (l.acc.hand && /mic/.test(l.acc.hand.id || '')) l.acc.hand = { id: 'none_hand' }; return l; }
const GEM_COL = ['#2ee6ff', '#ff5cb0', '#ffd23f'];
export const NOTE_GAP = 0.75, NOTE_DUR = 0.6, CHORD_DUR = 1.4;

export function createEar(ctx, opts) {
  opts = opts || {}; const { renderer, scene, camera } = ctx; let tier = opts.quality || ctx.quality || 'high';
  const cfg = () => opts.settings || {};
  const group = new THREE.Group(); group.name = 'ear'; let disposed = false;
  const saved = { exposure: renderer.toneMappingExposure, autoReset: renderer.info.autoReset, bg: scene.background, fog: scene.fog };
  scene.background = new THREE.Color('#150f30'); scene.fog = new THREE.Fog('#1a1238', 14, 34); renderer.toneMappingExposure = 1.12; renderer.info.autoReset = false;
  const set = buildSet(ctx, tier), aura = buildAura(); group.add(set.group);

  // ---- the listener: the hero with headphones at the mic, turned toward the staff
  const singer = new THREE.Group(); singer.name = 'listener'; singer.position.set(-0.62, 0, 0.75); singer.rotation.y = 0.5; group.add(singer);
  const hero = createCharacter(ctx, studioLook(opts.look)); singer.add(hero.object); hero.play('idle', {}); hero.update(0.016, 0); singer.updateMatrixWorld(true);
  const mp = new THREE.Vector3(); try { hero.anchors.mouth.getWorldPosition(mp); singer.worldToLocal(mp); } catch (e) { mp.set(0, 1.45, 0.12); }
  const mic = buildMic(mp); singer.add(mic.group); singer.add(aura.group);
  function setLook(look) { hero.setLook(studioLook(look)); }

  // ---- the note staff: five glowing lines, the gems ride on it (y from pitch)
  const STAFF = { x0: 0.12, x1: 1.62, y0: 1.55, y1: 3.15, z: 0.2 }, Y = (m, lo) => STAFF.y0 + Math.max(0, Math.min(1, (m - lo) / 16)) * (STAFF.y1 - STAFF.y0);
  const staff = new THREE.Group(); staff.name = 'staff'; group.add(staff);
  const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8f7cff').multiplyScalar(0.9), transparent: true, opacity: 0.45, toneMapped: false, depthWrite: false });
  for (let i = 0; i < 5; i++) { const ln = new THREE.Mesh(new THREE.BoxGeometry(STAFF.x1 - STAFF.x0 + 0.4, 0.014, 0.014), lineMat); ln.position.set((STAFF.x0 + STAFF.x1) / 2, STAFF.y0 + i * (STAFF.y1 - STAFF.y0) / 4, STAFF.z - 0.05); staff.add(ln); }
  const haloTex = glowTex();
  const gems = [0, 1, 2].map((i) => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(GEM_COL[i]).multiplyScalar(1.5), toneMapped: false });
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), mat); m.scale.set(1, 1.3, 1);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: new THREE.Color(GEM_COL[i]), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); halo.scale.setScalar(0.9);
    const trail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1, 0.03), new THREE.MeshBasicMaterial({ color: new THREE.Color(GEM_COL[i]), transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    const g = new THREE.Group(); g.add(trail, m, halo); g.visible = false; staff.add(g);
    return { g, m, mat, halo, trail, base: new THREE.Color(GEM_COL[i]), t0: 99, on: false, x: 0, y: 0, born: -1 };
  });
  // a soft arrow line between two melodic gems (the "jump")
  const linkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff6e8'), transparent: true, opacity: 0, toneMapped: false, depthWrite: false }), link = new THREE.Mesh(new THREE.BoxGeometry(1, 0.025, 0.025), linkMat); staff.add(link);

  // ---- post (same grade as the tuner booth)
  const PS = { bloom: 0.42, bloomThr: 1.0, vig: 0.5, sat: 1.36, gShadow: new THREE.Color('#e4d8ff'), gHigh: new THREE.Color('#fff0dc'), tilt: 0.4 };
  const post = createPost(ctx, PS); post.setQuality(tier);

  // ---- camera: framing the listener on the left and the staff on the right; a little push on a right answer
  // two framings: the lesson card covers the lower 64 %, so the staff rides high in the frame; in play it sits between the question and the buttons
  const CAMS = { lesson: { pos: new THREE.Vector3(0.45, 1.5, 5.6), look: new THREE.Vector3(0.45, 1.0, 0) }, play: { pos: new THREE.Vector3(0.35, 2.15, 5.6), look: new THREE.Vector3(0.35, 1.9, 0) } };
  const CAM = { fov: 50, pos: CAMS.lesson.pos.clone(), look: CAMS.lesson.look.clone() }; let W = 540, Hh = 960, punch = 0;
  function fitCamera(t, dt) {
    const T = CAMS[ui.hasLesson || ui.hasCard ? 'lesson' : 'play'], k0 = 1 - Math.exp(-(dt === undefined ? 99 : dt) * 3); CAM.pos.lerp(T.pos, k0); CAM.look.lerp(T.look, k0);
    const asp = W / Hh, k = Math.max(1, 0.5625 / Math.max(0.3, asp)), fov = 2 * Math.atan(Math.tan(CAM.fov * Math.PI / 360) * k) * 180 / Math.PI;
    camera.fov = fov - punch * 2.5; camera.near = 0.3; camera.far = 60; camera.position.set(CAM.pos.x + 0.06 * Math.sin(t * 0.33), CAM.pos.y + 0.04 * Math.sin(t * 0.47), CAM.pos.z); camera.lookAt(CAM.look); camera.updateProjectionMatrix();
  }

  // ---- sound: BBH.Audio (note / interval / chord) when it has them, else the game's E.tone
  const plays = []; const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, ms); timers.add(id); };
  function toneM(m, dur) { if (opts.tone) { try { opts.tone(mf(m), dur, 0.2); } catch (e) { /* ignore */ } } }
  const sfx = (n) => { if (cfg().muted) return; try { const A = BBH().Audio; A && A.sfx && A.sfx(n); } catch (e) { /* ignore */ } };
  function playNotes(notes, chord) {
    const A = BBH().Audio || {}; let via = 'tone';
    try {
      if (chord && notes.length >= 3 && A.chord) { A.chord(notes, CHORD_DUR); via = 'chord'; }
      else if (notes.length === 2 && A.interval) { A.interval(notes[0], notes[1], chord ? { melodic: false, dur: CHORD_DUR / 1.4, timbre: 'keys' } : { melodic: true, harmonic: false, dur: NOTE_DUR, gap: NOTE_GAP - NOTE_DUR, timbre: 'keys' }); via = 'interval'; }   // melodic only: the two notes one after the other, in step with the gems
      else if (chord && A.chord) { A.chord(notes, CHORD_DUR); via = 'chord'; }
      else if (A.note) { notes.forEach((m, i) => later(() => { try { A.note(m, chord ? CHORD_DUR : NOTE_DUR, { timbre: 'keys' }); } catch (e) { /* ignore */ } }, chord ? 0 : i * NOTE_GAP * 1000)); via = 'note'; }
      else notes.forEach((m, i) => later(() => toneM(m, chord ? CHORD_DUR : NOTE_DUR), chord ? 0 : i * NOTE_GAP * 1000));
    } catch (e) { /* audio must never break the game */ }
    plays.push({ notes: notes.slice(), chord: !!chord, via }); if (plays.length > 60) plays.shift();
    showGems(notes, chord);
    return chord ? CHORD_DUR + 0.2 : (notes.length - 1) * NOTE_GAP + NOTE_DUR + 0.2;
  }
  // the gems: each one pops in when its note sounds and rises from the floor of the staff to its pitch height
  let gemT = 0, gemLo = 55, gemNotes = [], gemChord = false, gemMood = 0, gemMoodT = 0;
  function showGems(notes, chord) {
    gemNotes = notes.slice(0, 3); gemChord = !!chord; gemT = 0; gemMood = 0; gemMoodT = 0;
    const lo = Math.min.apply(null, notes), hi = Math.max.apply(null, notes); gemLo = Math.min(lo - 2, Math.round((lo + hi) / 2 - 8));
    gems.forEach((g, i) => {
      const n = gemNotes[i]; g.on = n !== undefined; g.g.visible = g.on; if (!g.on) return;
      g.x = chord ? (STAFF.x0 + STAFF.x1) / 2 : notes.length === 1 ? (STAFF.x0 + STAFF.x1) / 2 : STAFF.x0 + 0.3 + i * ((STAFF.x1 - STAFF.x0 - 0.6) / Math.max(1, gemNotes.length - 1));
      g.y = Y(n, gemLo); g.t0 = chord ? i * 0.05 : i * NOTE_GAP; g.g.position.set(g.x, STAFF.y0 - 0.5, STAFF.z); g.g.scale.setScalar(0.001);
    });
  }
  function moodGems(ok) { gemMood = ok ? 1 : -1; gemMoodT = 1.2; }
  const ease = (u) => 1 - Math.pow(1 - u, 3), back = (u) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
  const tmpC = new THREE.Color();
  function updateGems(dt, t) {
    gemT += dt; gemMoodT = Math.max(0, gemMoodT - dt);
    let pA = null, pB = null;
    gems.forEach((g, i) => {
      if (!g.on) return; const u = Math.max(0, Math.min(1, (gemT - g.t0) / 0.45)), live = gemT >= g.t0;
      const y = live ? (STAFF.y0 - 0.5) + (g.y - (STAFF.y0 - 0.5)) * ease(u) : STAFF.y0 - 0.5, bob = 0.03 * Math.sin(t * 2.2 + i);
      const shake = gemMood < 0 && gemMoodT > 0 ? Math.sin(t * 40) * 0.04 * gemMoodT : 0;
      g.g.position.set(g.x + shake, y + (u >= 1 ? bob : 0) + (gemMood > 0 ? Math.sin(Math.min(1, 1.2 - gemMoodT) * Math.PI) * 0.15 : 0), STAFF.z);
      g.g.scale.setScalar(live ? Math.max(0.001, back(u)) : 0.001); g.m.rotation.y += dt * (gemMood > 0 && gemMoodT > 0 ? 9 : 1.4);
      const ringing = live && gemT - g.t0 < (gemChord ? CHORD_DUR : NOTE_DUR); g.halo.material.opacity = live ? (ringing ? 0.95 : 0.45) + 0.1 * Math.sin(t * 5 + i) : 0; g.halo.scale.setScalar(ringing ? 1.05 + 0.15 * Math.sin(t * 18) : 0.8);
      tmpC.copy(g.base); if (gemMoodT > 0) tmpC.lerp(new THREE.Color(gemMood > 0 ? '#9dff4a' : '#ff4f7a'), Math.min(1, gemMoodT)); g.mat.color.copy(tmpC).multiplyScalar(ringing ? 2.1 : 1.4); g.halo.material.color.copy(tmpC);
      const th = Math.max(0.01, y - (STAFF.y0 - 0.5)); g.trail.scale.set(1, th, 1); g.trail.position.y = -th / 2; g.trail.material.opacity = live ? 0.35 * (1 - u * 0.6) : 0;
      if (live && u >= 1) { if (i === 0) pA = g; else if (i === 1) pB = g; }
    });
    // the jump line between note 1 and note 2 (melodic only): shows how far it moved
    if (!gemChord && pA && pB) { const dx = pB.g.position.x - pA.g.position.x, dy = pB.g.position.y - pA.g.position.y, len = Math.hypot(dx, dy); link.position.set((pA.g.position.x + pB.g.position.x) / 2, (pA.g.position.y + pB.g.position.y) / 2, STAFF.z - 0.02); link.rotation.z = Math.atan2(dy, dx); link.scale.set(Math.max(0.01, len - 0.4), 1, 1); linkMat.opacity = Math.min(0.55, linkMat.opacity + dt * 2); }
    else linkMat.opacity = Math.max(0, linkMat.opacity - dt * 3);
  }

  // ---- rules
  let level = Math.max(1, Math.min(8, opts.level | 0 || 1)), logic = null, lastResult = null, lastRewards = null, cheerT = 0, sadT = 0, listenT = 0;
  function levelDef(l) { const L = opts.levels; return L && L[l - 1] ? L[l - 1] : null; }
  function mkLogic() {
    logic = createEarLogic({ level, levels: opts.levels, question: opts.question, rng: ctx.rng, hooks: {
      play: (q) => { listenT = (q.chord ? CHORD_DUR : (q.notes.length - 1) * NOTE_GAP + NOTE_DUR); return playNotes(q.notes, q.chord); },
      right: () => { cheerT = 1.2; punch = 1; aura.boost(1); moodGems(true); hero.play('cheer', { duration: 1.0, then: 'idle' }); sfx('hit_perfect'); if (logic.S.streak >= 3) sfx('sparkle'); },
      wrong: () => { sadT = 1.4; moodGems(false); hero.play('sad', { duration: 1.2, then: 'idle' }); sfx('miss'); },
      done: (r) => { lastResult = r; lastRewards = null; sfx(r.pass ? 'levelup' : 'confirm'); hero.play(r.pass ? 'dance' : 'idle', { bpm: 112 }); ui.showResult(r, { again: opts.again ? () => start({ level, lesson: false }) : null, done: () => quit() }); ctx.events.emit('minigame', { game: 'ear', result: r }); },
    } });
  }
  function start(o) {
    o = o || {}; if (o.level) level = Math.max(1, Math.min(8, o.level | 0)); if (o.manual) manual = true; lastResult = null;
    mkLogic(); ui.clearCard(); const L = levelDef(level) || logic.L;
    if (o.lesson === false || opts.lesson === false && o.lesson === undefined) begin(); else ui.showLesson(L);
  }
  function begin() { if (!logic) mkLogic(); ui.hideLesson(); if (logic.S.state !== 'play') logic.start(); }
  function example(i) { const L = levelDef(level) || (logic && logic.L), ex = L && L.lesson && L.lesson.examples && L.lesson.examples[i]; if (!ex) return 0; hero.play('talk', { duration: 1.2, then: 'idle' }); return playNotes(ex.notes, !!ex.chord); }
  function quit() { if (disposed) return; ctx.events.emit('quit', { game: 'ear', finished: !!lastResult }); ctx.events.emit('minigameQuit'); }
  const ui = createUI(opts.hud || document.body, { back: () => quit(), start: () => begin(), example, answer: (c) => logic && logic.answer(c), replay: () => logic && logic.replay(), next: () => logic && logic.skip() }, { acts: opts.acts });
  const onKey = (e) => { if (e.key === 'Escape') quit(); else if (logic && logic.S.state === 'play') { const n = parseInt(e.key, 10); if (n >= 1 && n <= logic.S.choices.length) logic.answer(n - 1); else if (e.key === ' ' || e.key === 'l') logic.replay(); } };
  window.addEventListener('keydown', onKey);

  // ---- sim + view
  let manual = false, simV = 0;
  function step(dt) { if (logic) logic.update(dt); }
  function view(dt, t) {
    cheerT = Math.max(0, cheerT - dt); sadT = Math.max(0, sadT - dt); punch = Math.max(0, punch - dt * 3); listenT = Math.max(0, listenT - dt);
    const S = logic ? logic.S : { state: 'lesson', phase: 'lesson', streak: 0, level, name: '', choices: [], ask: '', rounds: 0, round: 0 };
    updateGems(dt, t);
    singer.position.y = cheerT > 0 ? Math.abs(Math.sin(cheerT * 9)) * 0.05 * Math.min(1, cheerT) : 0; singer.rotation.x = sadT > 0 ? 0.07 * Math.min(1, sadT) : 0;
    hero.update(dt, t); aura.update(dt, t, S.state === 'play' ? S.streak : 0, listenT > 0);
    const env = listenT > 0 ? 0.55 + 0.25 * Math.sin(t * 24) : 0, idle = 0.05 + 0.03 * Math.sin(t * 2.2); set.vu(Math.max(idle, env), Math.max(idle, env * 0.9));
    set.update(dt, t, { live: listenT > 0, level: env, beat: punch });
    if (logic) ui.update(S);
    fitCamera(t, dt);
  }
  let tv = 0;
  function update(dt, t) { tv = t; if (!manual) step(dt); view(dt, t); }
  function render() { post.update(tv); post.render(); }
  function resize(w, h, dpr) { W = w; Hh = h; post.resize(w, h, dpr); }
  function setQuality(q) { if (!['low', 'med', 'high'].includes(q)) return; tier = q; ctx.quality = q; post.setQuality(q); set.setQuality(q); }

  const api = {
    group, update, render, resize, setLook, setQuality, start, begin,
    setRewards(rw) { lastRewards = rw || null; ui.setRewards(lastRewards); },
    dispose() {
      if (disposed) return; disposed = true; timers.forEach((id) => clearTimeout(id)); timers.clear(); window.removeEventListener('keydown', onKey); ui.destroy();
      try { post.dispose(); } catch (e) { /* ignore */ }
      try { disposeTree(hero.object); hero.dispose(); } catch (e) { /* ignore */ } disposeTree(group); if (group.parent) group.parent.remove(group);
      renderer.toneMappingExposure = saved.exposure; renderer.info.autoReset = saved.autoReset; scene.background = saved.bg; scene.fog = saved.fog;
    },
    // ---- test hooks
    tick(sec) { manual = true; let rem = Math.max(0, +sec || 0); while (rem > 1e-6) { const d = Math.min(rem, 0.05); step(d); simV += d; view(d, simV); rem -= d; } return logic ? logic.S.phase : 'lesson'; },
    manual(v) { manual = v === undefined ? true : !!v; },
    state() { const S = logic ? logic.S : {}; return { state: S.state, phase: S.phase, level, levelId: S.levelId, round: S.round, rounds: S.rounds, score: S.score, streak: S.streak, bestStreak: S.bestStreak, choices: (S.choices || []).slice(), answer: S.q ? S.q.answer : null, notes: S.q ? S.q.notes.slice() : null, picked: S.picked, ok: S.ok, lessonOpen: ui.hasLesson, cardOpen: ui.hasCard, rewards: lastRewards, plays: plays.length, quality: tier }; },
    result() { return lastResult; },
    answer(c) { return logic ? logic.answer(c) : null; }, replay() { return logic ? logic.replay() : false; }, next() { if (logic) logic.skip(); }, example,
    get plays() { return plays.slice(); }, ui, get logic() { return logic; }, hero, post, stats() { return { quality: tier }; },
  };
  start({ level, lesson: opts.lesson });
  fitCamera(0);
  return api;
}

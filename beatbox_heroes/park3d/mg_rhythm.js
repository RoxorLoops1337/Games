// BUSKING RHYTHM GAME in low-poly 3D (Rhythm Artist). Same rules as the 2D game (beatbox_heroes/rhythm.js): Core.makeChart patterns, Core.windows timing,
// Core.judgeHit grades, Core.summarize result, BBH.Audio groove + drum sounds, BBH.Mic mic mode, battle style orders. Only the presentation is 3D.
//   createRhythm(ctx, opts) -> { group, update(dt,t), render(), resize(w,h,dpr), setLook(look), start(o), dispose(), press(lane), tick(sec), state(), result(), bot(o), quit() }
//   opts: { difficulty 0..1, seed, bars, bpm, style, stats {mus..}, look, time, hud, battle|opp, autostart, mic }   start(o) takes the same keys (+ manual:true to freeze real time).
//   Finishes with ctx.events.emit('minigame', { game:'rhythm', result }) ; the BACK button emits 'minigameQuit'.
// Files: mg_rhythm.js (this: rules, state, camera, input, loop), mg_rhythm_hw.js (note highway), mg_rhythm_world.js (stage, props, pigeons), mg_rhythm_crowd.js, mg_rhythm_fx.js, mg_rhythm_ui.js.
import { THREE } from './kit.js';
import { createCharacter } from './characters.js';
import { buildLighting } from './lighting.js';
import { LANES, HIT_Z, SPAWN_Z, laneX, buildHighway } from './mg_rhythm_hw.js';
import { createFx } from './mg_rhythm_fx.js';
import { buildWorld, STAGE } from './mg_rhythm_world.js';
import { buildCrowd } from './mg_rhythm_crowd.js';
import { buildUI } from './mg_rhythm_ui.js';

const FALLBACK_LOOK = { name: 'Hero', body: 'neutral', skin: '#c68b5e', hair: { style: 'twists', color: '#2a2024' }, top: { id: 'oversized', color: '#f4e04d', color2: '#e63946' }, bottom: { id: 'camo', color: '#2f5d3a' }, shoes: { id: 'retro', color: '#f7f2e8' }, hat: { id: 'fitted', color: '#17141f' }, acc: { neck: { id: 'dogtags', color: '#c9d3e6' }, hand: { id: 'mic', color: '#6b6b80' } } };
const TOD = { day: 0, dusk: 0.5, night: 1 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t;
const BBH = () => (typeof window !== 'undefined' && window.BBH) || {};

// minimal stand-ins so the game still runs if core.js was not loaded (the page normally loads the real one)
function coreOrFallback() {
  const C = BBH().Core; if (C && C.makeChart) return C;
  const HIT = { perfect: 100, good: 60, miss: 0 };
  return { windows: (s) => ({ perfect: 70 + Math.min(40, (s.mus || 0) * 0.5), good: 135 + Math.min(60, (s.mus || 0) * 0.7) }), judgeHit: (d, w) => (Math.abs(d) <= w.perfect ? 'perfect' : Math.abs(d) <= w.good ? 'good' : 'miss'), HIT_SCORE: HIT,
    makeChart: (seed, o) => { const n = []; for (let b = 0; b < (o.bars || 8); b++) ['B', 'T', 'K', 'T'].forEach((c, i) => n.push({ beat: b * 4 + i, lane: 'BTKP'.indexOf(c) })); return n; },
    summarize: (hits, total, best) => { let pts = 0, p = 0, g = 0, m = 0; const lane = [0, 0, 0, 0]; hits.forEach((h) => { pts += HIT[h.grade]; if (h.grade === 'perfect') { p++; lane[h.lane]++; } else if (h.grade === 'good') g++; else m++; }); m += Math.max(0, total - hits.length); const acc = total ? pts / (total * 100) : 0; return { accuracy: acc, perfect: p, good: g, miss: m, total, bestCombo: best, perfectLane: lane, rank: acc >= 0.96 ? 'S' : acc >= 0.88 ? 'A' : acc >= 0.74 ? 'B' : acc >= 0.55 ? 'C' : 'D', score: Math.round(pts * (1 + best / 100)) }; }, STYLES: [] };
}

export function createRhythm(ctx, opts) {
  opts = opts || {}; const { renderer, scene, camera, events } = ctx, q = ctx.quality || 'high', Core = coreOrFallback(), group = new THREE.Group(); group.name = 'rhythm';
  const hudHost = opts.hud || (() => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;inset:0'; (ctx.canvas.parentElement || document.body).appendChild(d); return d; })();

  // ------------------------------------------------------------------ world, lighting, characters
  const R = ctx.kit.rng(opts.seed || 1337), mkLook = (l) => l || (BBH().CATALOG && BBH().CATALOG.DEFAULT_LOOK) || FALLBACK_LOOK;
  const fake = { group: new THREE.Group(), bounds: { minX: -15, maxX: 15, minZ: -18, maxZ: 6 }, blocked: () => false, anchors: { start: { x: 0, z: -4, rot: 0 }, buskSpot: { x: 0, z: STAGE.z }, graffiti: { x: 0, z: STAGE.back - 0.8 }, fountain: { x: 0, z: -5 }, lamps: [{ x: -6.3, y: 3.8, z: -7.5 }, { x: 6.3, y: 3.8, z: -7.5 }, { x: -6.5, y: 3.8, z: 2.4 }, { x: 6.5, y: 3.8, z: 2.4 }] } };
  const lighting = buildLighting(ctx, fake); group.add(lighting.group);
  const todBase = typeof opts.time === 'number' ? opts.time : TOD[opts.time] !== undefined ? TOD[opts.time] : 0.5; lighting.setTimeOfDay(todBase, true); lighting.state.tilt = 0.22;
  const follow = new THREE.Object3D(); follow.position.set(0, 0, -4); group.add(follow); lighting.follow(follow); lighting.setMusic(false);
  const world = buildWorld(ctx, q); group.add(world.group);
  const hw = buildHighway(ctx, q); group.add(hw.group);
  const fx = createFx(ctx, q, camera); group.add(fx.group);
  const crowd = buildCrowd(ctx, q, null); group.add(crowd.group);
  const perf = createCharacter(ctx, mkLook(opts.look)); perf.object.position.set(0, STAGE.h, STAGE.z); perf.object.scale.setScalar(1.75); group.add(perf.object); perf.play('beatbox', { bpm: 100, amp: 0.8 });
  if (q === 'low') perf.object.traverse((o) => { if (o.isMesh) o.castShadow = false; });

  // ------------------------------------------------------------------ state
  const S = { phase: 'idle', T: 0, spb: 0.6, bpm: 100, notes: [], chart: [], hits: [], combo: 0, maxCombo: 0, score: 0, energy: 0, energyShown: 0, press: [0, 0, 0, 0], round: 0, win: Core.windows(opts.stats || { mus: 20 }), approach: 1.43, endBeat: 0, counted: -1, manual: false, audioClock: false, t0: 0, lastA: 0, audioRun: false, cfg: null, result: null, battle: null, myStyle: null, bot: null, uHit: 0, beatSeen: -1, punch: 0, flee: 0, camK: 0, tPlay: 0, lastEmit: 0, ticks: 0 };
  let time = 0, W = 540, H = 960, mic = { on: false, stop: null }, disposed = false, lastTod = todBase;
  const A = () => BBH().Audio || null, sfx = (n, o) => { try { const a = A(); if (a) a.sfx(n, o); } catch (e) { /* audio must never break the game */ } };
  const tv = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3();

  // ------------------------------------------------------------------ UI
  const api = { press: (l, o) => press(l, o), start: (o) => start(o), quit, toggleMic, hasMic: !!(BBH().Mic && BBH().Mic.open) };
  const ui = buildUI(hudHost, api); ui.resize(hudHost.clientWidth || 540, hudHost.clientHeight || 960);
  function showStartCard() { ui.showStart({ difficulty: opts.difficulty === undefined ? 0.5 : opts.difficulty }); }

  // ------------------------------------------------------------------ rounds
  function defaultSeed(o) { return o.seed !== undefined ? o.seed : (Date.now() & 0xffff); }
  function start(o) {
    o = Object.assign({}, opts, o || {}); S.cfg = o; S.manual = !!o.manual; S.result = null; S.hits = []; S.round = 0; S.myStyle = null; S.seed0 = defaultSeed(o); ui.clearCard(); S.stats = o.stats || { mus: 20 };
    const opp = o.opp || (o.battle && (o.battle.opp || o.battle)); S.battle = opp && typeof opp === 'object' ? { opp, roundQ: [], oppStyles: [], tot: { perfects: 0, bestCombo: 0, lane: [0, 0, 0, 0], notes: 0, hits: 0, pts: 0, miss: 0, good: 0, perfect: 0 } } : null;
    S.win = Core.windows(S.stats); try { const a = A(); if (a && a.unlock) a.unlock(); } catch (e) { /* ignore */ }
    if (S.battle) beginPick(); else beginRound();
  }
  function beginPick() {
    const st = Core.STYLES || []; if (!st.length) { beginRound(); return; }
    S.phase = 'pick'; ui.showPicker(st, S.round, S.battle.opp.name || 'Rival', (id) => { S.myStyle = id; beginRound(); });
  }
  function beginRound() {
    const o = S.cfg, B = S.battle, bars = B ? 4 : (o.bars || 8), seed = S.seed0 + S.round * 977, diff = B ? 0.35 + (B.opp.skill || 0.5) * 0.45 : (o.difficulty === undefined ? 0.5 : o.difficulty);
    let chart = Core.makeChart(seed, { bars, difficulty: diff }); if (B && S.myStyle && Core.styleChart) chart = Core.styleChart(chart, S.myStyle, seed);
    const bpm = B ? (B.opp.bpm || 100) : (o.bpm || 100); S.bpm = bpm; S.spb = 60 / bpm; S.chart = chart; ctx.__bpm = bpm; S.hits = []; S.combo = 0; S.maxCombo = 0; S.score = 0; S.counted = -1; S.beatSeen = -1; S.bars = bars; S.seed = seed; S.diff = diff;
    S.approach = Math.max(1.3, (1500 - Math.min(300, bpm * 2)) / 1000 * 1.1); S.phase = 'count'; S.press = [0, 0, 0, 0]; S.uHit = 0;
    let g = null; if (!S.manual) { try { const a = A(); g = a && a.groove.start({ bpm, style: B ? B.opp.style : (o.style || 0), bars: bars + 3 }); } catch (e) { g = null; } }
    S.audioClock = !!(g && typeof g.t0 === 'number' && g.spb); S.audioRun = false; S.lastA = 0; if (S.audioClock) { S.t0 = g.t0; S.spb = g.spb; } S.T = S.audioClock ? 0 : -0.4;
    S.notes = chart.map((n, i) => ({ id: i, lane: n.lane, beat: n.beat + 4, time: (n.beat + 4) * S.spb, state: 0 })); S.endBeat = bars * 4 + 4 + 2; hw.setApproach(S.approach, S.spb);
    if (o.bot || S.bot) { planBot(o.bot || S.bot._o); }
    ui.setScore(0); ui.setCombo(0); fx.clear(); lighting.setMusic(true);
    if (B) ui.toast((S.round === 0 ? (B.opp.taunt || '') : 'vs ' + (B.opp.name || 'Rival')) || ('ROUND ' + (S.round + 1)), 2200);
  }
  function finishRound() {
    const sum = Core.summarize(S.hits, S.chart.length, S.maxCombo); S.sum = sum; try { const a = A(); if (a) a.groove.stop(); } catch (e) { /* ignore */ }
    const B = S.battle;
    if (B) {
      const t = B.tot; t.perfects += sum.perfect; t.bestCombo = Math.max(t.bestCombo, sum.bestCombo); sum.perfectLane.forEach((v, i) => { t.lane[i] += v; }); t.notes += S.chart.length; t.perfect += sum.perfect; t.good += sum.good; t.miss += sum.miss; t.pts += sum.perfect * 100 + sum.good * 60; t.score = (t.score || 0) + sum.score;
      const qd = Math.min(1, sum.accuracy * 0.8 + Math.min(1, sum.bestCombo / Math.max(8, S.chart.length * 0.7)) * 0.2); B.roundQ.push({ q: qd, style: S.myStyle }); try { B.oppStyles.push(Core.opponentStyle ? Core.opponentStyle(B.opp, Math.random) : null); } catch (e) { B.oppStyles.push(null); }
      if (S.round < 2) { S.round++; S.phase = 'between'; setTimeout(() => { if (!disposed && S.phase === 'between') beginPick(); }, S.manual ? 0 : 1200); if (S.manual) beginPick(); return; }
    }
    let res = Object.assign({}, sum);
    if (B) { const t = B.tot; const acc = t.notes ? t.pts / (t.notes * 100) : 0; res = { accuracy: Math.min(1, acc), perfect: t.perfect, good: t.good, miss: t.miss, total: t.notes, bestCombo: t.bestCombo, perfectLane: t.lane, rank: Core.rank ? Core.rank(acc) : sum.rank, score: Math.round(t.score || 0) };
      try { res.battle = Core.resolveBattle({ stats: Object.assign({ mus: 20, tech: 20, show: 20, ori: 20 }, S.stats) }, B.opp, B.roundQ, Math.random, B.oppStyles); } catch (e) { res.battle = { win: res.accuracy > 0.6, forPlayer: 0, votes: [] }; } }
    const result = Object.assign(res, { game: 'rhythm', grade: res.rank, hits: res.perfect + res.good, maxCombo: res.bestCombo, difficulty: S.diff, seed: S.seed, bars: S.bars, bpm: S.bpm, mode: B ? 'battle' : 'perform', liveScore: Math.round(S.score) });
    S.result = result; S.phase = 'result'; S.tPlay = 0; ui.setCombo(0); ui.showResult(result, () => start(Object.assign({}, S.cfg, { seed: S.cfg.seed })));
    sfx(result.grade === 'S' || result.grade === 'A' ? 'win' : 'applause'); const hot = result.grade === 'S' || result.grade === 'A'; fx.confettiBurst(hot ? 90 : 30, 0, 6, -6, 12, 10); if (hot) for (let i = 0; i < 4; i++) setTimeout(() => { if (!disposed) fx.firework((Math.random() - 0.5) * 12, 7.2 + Math.random() * 3, STAGE.z - 4 - Math.random() * 4); }, 250 + i * 380);
    lighting.setMusic(false); try { ctx.events.emit('minigame', { game: 'rhythm', result }); } catch (e) { console.error('[rhythm] result handler failed ' + e); }
  }

  // ------------------------------------------------------------------ input and judging
  function project(x, y, z) { tv.set(x, y, z); camera.updateMatrixWorld(); tv.project(camera); return [(tv.x * 0.5 + 0.5) * W, (-tv.y * 0.5 + 0.5) * H]; }
  function press(lane, o) {
    o = o || {}; if (lane < 0 || lane > 3) return null; if (S.phase === 'idle' && !o.fromUI) { /* free play pads before the set */ }
    if (S.phase !== 'play' && S.phase !== 'count' && S.phase !== 'idle') return null;
    S.press[lane] = 1; if (!o.silent) { try { const a = A(); if (a) a.drum(lane, { vel: 0.9 }); } catch (e) { /* ignore */ } }
    ui.padFlash(lane); performerHit(lane); if (S.phase !== 'play') { fx.burst(laneX(lane), 0.3, HIT_Z, 3, { color: LANES[lane].color, speed: 1.5, up: 1, life: 0.3, size: 0.12 }); return null; }
    const T = S.T - (o.shift || 0), w = S.win; let best = null, bd = 1e9;
    for (let i = 0; i < S.notes.length; i++) { const n = S.notes[i]; if (n.state || n.lane !== lane) continue; const d = (T - n.time) * 1000; if (Math.abs(d) < bd) { bd = Math.abs(d); best = { n, d }; } }
    if (!best || bd > w.good + 20) { fx.burst(laneX(lane), 0.3, HIT_Z, 4, { color: LANES[lane].color, speed: 1.6, up: 0.8, life: 0.25, size: 0.1 }); return { grade: 'ghost', delta: null }; }
    const grade = Core.judgeHit(best.d, w); best.n.state = grade === 'miss' ? 3 : grade === 'perfect' ? 1 : 2; best.n.hitT = T; hit(lane, grade, best.d); return { grade, delta: best.d };
  }
  function performerHit(lane) { const k = LANES[lane].drum; if (lane === 3) { perf.hit('snare', 0.7); perf.hit('hat', 0.8); } else perf.hit(k, 1); if (lane === 0) S.punch = Math.max(S.punch, 0.5); }
  function hit(lane, grade, d) {
    S.hits.push({ lane, grade }); const L = LANES[lane], x = laneX(lane), sp = project(x, 0.9, HIT_Z);
    if (grade === 'miss') { breakCombo(); ui.pop('MISS', 'miss', sp[0], sp[1]); return; }
    S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo); S.score += Core.HIT_SCORE[grade] * (1 + S.combo / 100); ui.setScore(S.score); ui.setCombo(S.combo, true);
    ui.pop(grade === 'perfect' ? 'PERFECT' : 'GOOD', grade, sp[0], sp[1]);
    fx.burst(x, 0.45, HIT_Z, grade === 'perfect' ? 18 : 9, { colors: [L.color, L.hi, '#fff2dc'], speed: grade === 'perfect' ? 3.6 : 2.6, up: 2.4, life: 0.6, size: 0.2, grav: 7 }); fx.ring(x, HIT_Z, L.color, grade === 'perfect' ? 2.1 : 1.5);
    if (grade === 'perfect') S.punch = Math.max(S.punch, 0.45);
    if (S.combo > 0 && S.combo % 10 === 0) { sfx('combo'); const bp = project(0, 2.6, 0); ui.pop(S.combo + ' COMBO', 'perfect', W / 2, H * 0.34, true); S.punch = 1; fx.ring(0, HIT_Z - 0.5, '#fff2dc', 4.5); try { const a = A(); if (a) a.groove.setIntensity(Math.min(1, S.combo / 40)); } catch (e) { /* ignore */ } if (S.energy > 0.45) fx.confettiBurst(24, 0, 6, -6, 9, 8); }
  }
  function breakCombo() { if (S.combo >= 8) sfx('miss'); S.combo = 0; ui.setCombo(0); S.punch = 0; S.shake = 0.35; }

  // keyboard
  function onKey(e) {
    if (e.repeat) return; const c = e.code;
    for (let i = 0; i < 4; i++) if (LANES[i].keys.includes(c)) { e.preventDefault(); press(i); return; }
    if ((c === 'Space' || c === 'Enter') && S.phase === 'idle' && ui.hasCard()) { e.preventDefault(); const go = hudHost.querySelector('.rh .go'); if (go) go.click(); }
  }
  window.addEventListener('keydown', onKey);
  // like the 2D game: leaving the tab mid set abandons it (no rewards), the player can start again
  function onVis() { if (document.hidden && (S.phase === 'play' || S.phase === 'count') && !S.manual) abort(); }
  document.addEventListener('visibilitychange', onVis);
  function abort() { try { const a = A(); if (a) a.groove.stop(); } catch (e) { /* ignore */ } S.phase = 'idle'; S.bot = null; lighting.setMusic(false); ui.setCombo(0); S.combo = 0; ui.toast('Set interrupted.', 2200); showStartCard(); }

  // MIC MODE: like the 2D game. Each detected beatbox hit presses the lane it was classified as.
  function toggleMic() { if (mic.on) stopMic(); else startMic(); }
  async function startMic() {
    const M = BBH().Mic; if (!M || !M.open) { ui.toast('No microphone available', 1800); return; }
    try {
      const o = await M.open(); if (!o.ok) { ui.toast('Mic: ' + (o.error || 'unavailable') + '. Using taps.', 2400); return; }
      let prof = null; try { const by = {}, Sm = BBH().Samples; if (Sm) for (let l = 0; l < 4; l++) { const sm = await Sm.get(opts.slot || 1, l); if (sm) by[l] = sm.f32 || sm.data; } if (Object.keys(by).length) prof = M.makeClassifier(M.trainFromSamples(by, M.sampleRate() || 44100)); } catch (e) { prof = null; }
      mic.stop = M.listen((ev) => micHit(ev), prof ? { classifier: prof } : undefined); mic.on = true; ui.setMic(true); ui.toast('Mic mode: beatbox into your mic!', 2200);
    } catch (e) { ui.toast('Mic mode failed. Using taps.', 2200); }
  }
  function stopMic() { try { if (mic.stop) mic.stop(); mic.stop = null; const M = BBH().Mic; if (M && M.close) M.close(); } catch (e) { /* ignore */ } mic.on = false; ui.setMic(false); }
  function micHit(ev) {
    if (S.phase !== 'play' && S.phase !== 'count') return; let lane = ev.lane;
    if (S.phase === 'play' && (ev.confidence === undefined || ev.confidence < 0.5)) { let best = null, bd = 1e9; for (const n of S.notes) { if (n.state) continue; const d = Math.abs(S.T - n.time); if (d < bd) { bd = d; best = n; } } if (best && bd < 0.2) lane = best.lane; }
    press(lane, { silent: true, shift: 0.04 });
  }
  function quit() { stopMic(); try { const a = A(); if (a) a.groove.stop(); } catch (e) { /* ignore */ } try { events.emit('minigameQuit'); } catch (e) { /* ignore */ } }

  // test bot: plans a press for every note with a gaussian timing error
  function planBot(b) {
    b = b || {}; const r = ctx.kit.rng((S.seed || 1) * 31 + 7), jit = b.jitterMs === undefined ? 25 : b.jitterMs, miss = b.missRate || 0, gauss = () => (r() + r() + r() + r() - 2) * 1.2;
    S.bot = { _o: b, plan: S.notes.map((n) => ({ n, at: n.time + gauss() * jit / 1000 + (b.biasMs || 0) / 1000, skip: r() < miss, done: false })) };
  }

  // ------------------------------------------------------------------ simulation (clock + rules) and visuals
  function sim(dt) {
    if (S.phase === 'idle' || S.phase === 'pick') return;
    if (!S.manual && S.audioClock) { const a = A(); const an = a ? a.now() : 0; if (an > S.lastA + 1e-4 && S.lastA > 0) S.audioRun = true; S.lastA = an || S.lastA; if (S.audioRun) S.T = an - S.t0; else S.T += dt; } else S.T += dt;
    if (S.phase === 'between') return;
    S.tPlay += dt;
    if (S.phase === 'count' || S.phase === 'play') {
      const T = S.T, beatNow = Math.floor(T / S.spb);
      if (S.phase === 'count' && beatNow !== S.counted && beatNow >= 0 && beatNow < 4) { S.counted = beatNow; sfx(beatNow === 3 ? 'go' : 'countdown'); ui.countdown(beatNow === 3 ? 'GO!' : String(3 - beatNow)); }
      if (T >= 4 * S.spb - 0.02) S.phase = 'play';
      if (S.bot) for (const p of S.bot.plan) { if (p.done || p.at > T) continue; p.done = true; if (!p.skip && !p.n.state) press(p.n.lane, { silent: true, bot: true }); }
      for (const n of S.notes) if (!n.state && (T - n.time) * 1000 > S.win.good + 20) { n.state = 3; S.hits.push({ lane: n.lane, grade: 'miss' }); breakCombo(); const sp = project(laneX(n.lane), 0.9, HIT_Z); ui.pop('MISS', 'miss', sp[0], sp[1]); }
      if (T / S.spb > S.endBeat) finishRound();
    }
  }
  const camBase = new THREE.Vector3(0, 6.0, 11.4), camAim = new THREE.Vector3(0, 0.5, -7);
  function vis(dt) {
    time += dt; const t = time, playing = S.phase === 'count' || S.phase === 'play' || S.phase === 'between';
    const beat = S.phase === 'idle' || S.phase === 'pick' ? t * S.bpm / 60 : S.T / S.spb;
    // beat pulses
    const bi = Math.floor(beat); if (bi !== S.beatSeen && (S.phase === 'count' || S.phase === 'play' || S.phase === 'result' || S.phase === 'idle')) { S.beatSeen = bi; S.punch = Math.max(S.punch, bi % 4 === 0 ? 0.55 : 0.22); }
    // energy: follows the combo, rises fast, falls slowly; the final grade sets a celebration level
    let target = S.phase === 'play' || S.phase === 'count' ? clamp(S.combo / 26, 0, 1) * 0.92 + (S.phase === 'play' ? 0.06 : 0.02) : S.phase === 'result' ? (S.result && (S.result.grade === 'S' || S.result.grade === 'A') ? 1 : 0.5) : S.phase === 'between' ? S.energy : 0.18;
    if (S.forceEnergy !== undefined) target = S.forceEnergy; S.energy += (target - S.energy) * (1 - Math.exp(-dt * (target > S.energy ? 3.2 : 0.8)));
    const E = S.energy; S.energyShown = E; for (let i = 0; i < 4; i++) S.press[i] = Math.max(0, S.press[i] - dt * 6.5); S.punch *= Math.exp(-dt * 7); if (S.shake) S.shake *= Math.exp(-dt * 8);
    // high energy effects
    if (playing || S.phase === 'result') {
      if (E > 0.6 && Math.random() < dt * (E - 0.5) * 3.5) fx.confettiBurst(5, (Math.random() - 0.5) * 8, 6.5, -5 + Math.random() * 3, 3, 4);
      if (E > 0.86 && S.phase !== 'result' && (S.fwT = (S.fwT || 0) - dt) <= 0) { S.fwT = 1.1 + Math.random() * 1.0; fx.firework((Math.random() - 0.5) * 14, 7.2 + Math.random() * 2.2, STAGE.z - 4.6 - Math.random() * 6, [['#ff3ea5', '#ffd23f', '#fff2dc'], ['#2ee6ff', '#a86bff', '#fff2dc'], ['#9dff4a', '#ffd23f', '#ff8a3d']][(Math.random() * 3) | 0]); }
    }
    S.flee = E > 0.7 && !S.fled ? (S.fled = true, 1) : 0; if (E < 0.3) S.fled = false;
    // lighting follows the crowd: the sky deepens a touch as the energy rises
    const tod = clamp(todBase + E * 0.13, 0, 1); if (Math.abs(tod - lastTod) > 0.004) { lastTod = tod; lighting.setTimeOfDay(tod); }
    // performer
    perf.play('beatbox', { bpm: S.bpm, phase: beat, amp: 0.7 + 0.3 * E, external: playing || S.phase === 'result' }); perf.lookAt(camera.position); perf.update(dt, t);
    crowd.update(dt, t, E, beat, S.punch); world.update(dt, t, { energy: E, beat, flee: S.flee });
    hw.update({ T: playing || S.phase === 'result' ? S.T : t * S.bpm / 60 * S.spb, spb: S.spb, approach: S.approach, notes: playing ? S.notes : [], press: S.press, energy: E, t });
    fx.update(dt, t); ui.setEnergy(E); updateCamera(dt, t, E);
    lighting.update(dt, t); if (scene.fog) { scene.fog.near = 34; scene.fog.far = 150; }
  }
  // camera: attract/result cam orbits the stage, play cam sits behind and above the highway with a gentle sway and a kick zoom on the beat
  function fovFor(aspect) { return clamp(2 * Math.atan(Math.tan(27 * Math.PI / 180) * (0.5625 / Math.max(0.3, aspect))) * 180 / Math.PI, 38, 72); }
  function updateCamera(dt, t, E) {
    const want = S.phase === 'count' || S.phase === 'play' || S.phase === 'between' ? 1 : 0; S.camK += (want - S.camK) * (1 - Math.exp(-dt * 2.2)); const k = S.camK * S.camK * (3 - 2 * S.camK), sw = 0.4 + E * 0.6;
    const orbit = S.phase === 'result' ? 1 : 0, ox = Math.sin(t * 0.18) * (orbit ? 3.6 : 4.6), oy = (orbit ? 3.2 : 3.9) + Math.sin(t * 0.23) * 0.25, oz = orbit ? 3.2 : 6.0;
    camPos.set(lerp(ox, camBase.x + Math.sin(t * 0.45) * 0.38 * sw, k), lerp(oy, camBase.y + Math.sin(t * 0.33) * 0.14 * sw, k), lerp(oz, camBase.z - S.punch * 0.35, k));
    camLook.set(lerp(0, camAim.x + Math.sin(t * 0.5 + 1) * 0.22 * sw, k), lerp(orbit ? -1.5 : 2.0, camAim.y, k), lerp(orbit ? -11 : STAGE.z, camAim.z, k));
    if (S.shake) { camPos.x += (Math.random() - 0.5) * S.shake * 0.25; camPos.y += (Math.random() - 0.5) * S.shake * 0.2; }
    if (S.camO) { camPos.set(S.camO.p[0], S.camO.p[1], S.camO.p[2]); camLook.set(S.camO.l[0], S.camO.l[1], S.camO.l[2]); }
    camera.position.copy(camPos); camera.lookAt(camLook); camera.rotateZ(Math.sin(t * 0.4) * 0.012 * sw * k);
    const f = S.camO && S.camO.fov ? S.camO.fov : fovFor(W / H) - S.punch * (2.2 + 2.4 * E) * (0.4 + 0.6 * k); if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
  }

  // ------------------------------------------------------------------ public surface
  let acc = 0;
  function update(dt, t) { if (disposed) return; dt = Math.min(dt, 0.05); if (!S.manual) sim(dt); vis(dt); }
  function render() { const S2 = lighting.state; S2.gHigh.set('#fff8ee'); S2.gShadow.set('#f0eaff'); S2.sat = 1.3; S2.bloom += 0.1 * S.energy + 0.1 * S.punch; lighting.post.update(time); lighting.render(); }
  function tick(sec) {
    S.manual = true; const n = Math.max(1, Math.round(sec * 120)), h = sec / n; for (let i = 0; i < n; i++) { sim(h); acc += h; if (acc >= 1 / 30) { vis(acc); acc = 0; } } if (acc > 0) { vis(acc); acc = 0; } S.ticks++;
    return state();
  }
  function state() {
    const T = S.T, up = []; for (const n of S.notes) { if (n.state) continue; const d = (n.time - T) * 1000; if (d > -400 && up.length < 8) up.push({ lane: n.lane, dtMs: Math.round(d * 10) / 10, id: n.id }); }
    let p = 0, g = 0, m = 0; S.hits.forEach((h) => { if (h.grade === 'perfect') p++; else if (h.grade === 'good') g++; else m++; });
    return { phase: S.phase, T, beat: S.spb ? T / S.spb : 0, bpm: S.bpm, spb: S.spb, combo: S.combo, maxCombo: S.maxCombo, score: Math.round(S.score), energy: S.energy, perfect: p, good: g, miss: m, notesTotal: S.notes.length, notesLeft: S.notes.filter((n) => !n.state).length, upcoming: up, round: S.round, windows: S.win, approach: S.approach, manual: S.manual, quality: q, crowd: { near: crowd.near.length, spectators: crowd.spectators }, fxLive: fx.count() };
  }
  function resize(w, h) { W = w; H = h; ui.resize(w, h); lighting.resize(w, h, Math.min(window.devicePixelRatio || 1, 2)); camera.fov = fovFor(w / h); camera.updateProjectionMatrix(); }
  function dispose() { disposed = true; window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis); stopMic(); try { const a = A(); if (a) a.groove.stop(); } catch (e) { /* ignore */ } ui.dispose(); try { lighting.dispose(); } catch (e) { /* ignore */ } crowd.dispose(); perf.dispose(); group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  camera.fov = fovFor(0.5625); camera.near = 0.5; camera.far = 220; camera.updateProjectionMatrix(); update(0.016, 0.016); showStartCard();
  if (opts.autostart) { ui.clearCard(); start(opts); }
  return { group, update, render, resize, setLook(l) { perf.setLook(mkLook(l)); }, start, dispose, press, tick, state, result: () => S.result, bot(b) { S.bot = { _o: b || {} }; if (S.notes.length) planBot(b || {}); return !!S.bot; }, quit, perf, crowd, world, highway: hw, fx, lighting, ui, S, forceEnergy(v) { S.forceEnergy = v; }, cam(p, l, fov) { S.camO = p ? { p, l, fov } : null; } };
}

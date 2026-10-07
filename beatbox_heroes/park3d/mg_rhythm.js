// BUSKING RHYTHM GAME in low-poly 3D (Rhythm Artist). Same rules as the 2D game (beatbox_heroes/rhythm.js): Core.makeChart patterns, Core.windows timing,
// Core.judgeHit grades, Core.summarize result, BBH.Audio drum sounds over a soft shaker metronome (music off), BBH.Mic mic mode, battle style orders. Only the presentation is 3D.
//   createRhythm(ctx, opts) -> { group, update(dt,t), render(), resize(w,h,dpr), setLook(look), start(o), dispose(), press(lane), tick(sec), state(), result(), bot(o), quit() }
//   opts: { difficulty 0..1, seed, bars, bpm, style, stats {mus..}, look, time, hud, battle|opp, autostart, mic }   start(o) takes the same keys (+ manual:true to freeze real time).
//   Finishes with ctx.events.emit('minigame', { game:'rhythm', result }) ; the BACK button emits 'minigameQuit'.
// Files: mg_rhythm.js (this: rules, state, camera, input, loop), mg_rhythm_hw.js (note highway), mg_rhythm_world.js (stage, props, pigeons), mg_rhythm_crowd.js, mg_rhythm_fx.js, mg_rhythm_ui.js.
// RHYTHM GAME in low-poly 3D (Rhythm Artist, MG-RHYTHM). Same rules as the 2D game (beatbox_heroes/rhythm.js): Core.makeChart patterns, Core.windows timing,
// Core.judgeHit grades, Core.summarize result, BBH.Audio drum sounds over a soft shaker metronome (music off), BBH.Mic mic mode, battle style orders, opponent turn, 5 judges. Only the presentation is 3D.
//   createRhythm(ctx, opts) -> { group, update(dt,t), render(), resize(w,h,dpr), setLook(look), start(o), dispose(), press(lane), tick(sec), state(), result(), bot(o), quit(o), pick(styleId), setRewards(rw), ... }
//   opts: { difficulty 0..1, seed, bars, bpm, style, stats {mus..}, look, time, hud, battle|opp, autostart, mic }   start(o) takes the same keys (+ manual:true to freeze real time).
//   GAME CONTRACT (PORT_PLAN 2.11, set by r3/scenes_rhythm.js; the standalone page works without any of these):
//     game:true            embedded in the game: no start card (autostart), the result card shows the real rewards and CONTINUE, BACK asks LEAVE? first
//     mode                 'perform' | 'practice' | 'battle'   kind: 'busk' | 'openmic' | 'showcase' | 'karaoke'   title, sub, you (name for the VS wall), youSub
//     offsetMs             E.settings.offset (positive = you hit late): added to the press time exactly like the 2D game
//     venue                'busk' (default, the park stage) | 'bar' | 'showcase' | 'booth' | 'arena' (battles) : INT-B buildVenue() replaces the street world   theme: 'pink'|'cyan'|'lime'|'gold'
//     resolveBattle(p)     p = { stats, opp, rounds:[{q,style}], oppStyles, perfects, bestCombo, perfectLane, final }  ->  { votes, win, out, rw? }  (the game runs the real Core action here)
//     onContinue(info)     the CONTINUE button of the result / verdict card.   onMic(on) mic toggle persisted by the game.   mic: start with the mic on.
//   result (also in the 'minigame' event): the summarize fields + perfectLane, game, grade, hits, maxCombo, mode; battles add rounds [{q,style}], oppStyles and battle { win, forPlayer, votes, out }.
//   setRewards(rw)       fills the cash / fans / xp chips of the card on screen (also remembered for the next card).
//   Finishes with ctx.events.emit('minigame', { game:'rhythm', result }) ; the BACK button emits 'minigameQuit' (game mode: after the LEAVE? confirm, or quit({force:true})).
// Files: mg_rhythm.js (this: rules, state, camera, input, loop), mg_rhythm_hw.js (note highway), mg_rhythm_world.js (stage, props, pigeons), mg_rhythm_crowd.js, mg_rhythm_fx.js, mg_rhythm_ui.js,
//        mg_rhythm_battle.js (camera director, opponent turn, judge maths) ; venues come from venue.js (INT-B).
//        mg_rhythm_click.js (MUSIC OFF: no scene music, no backing groove, only a soft shaker metronome at the chart bpm, aligned to offsetMs)
//        mg_rhythm_train.js (mode 'train': RHYTHM TRAINING, Core.BEAT_LEVELS, level select, LISTEN call + YOUR TURN, training result card)
//   mode 'train': opts.level (start it, else the level select), opts.progress { unlocked, best:{level:grade} } (setTrainProgress(p) updates it),
//     result adds { mode:'train', level, levelId, q, passed }; the card acts call opts.onContinue({ train:true, act:'next'|'again'|'levels'|'continue', level, result }),
//     a false return value stops the game from going on (the scene leaves instead).
import { THREE, disposeTree } from './kit.js';
import { createCharacter } from './characters.js';
import { buildLighting } from './lighting.js';
import { LANES, HIT_Z, SPAWN_Z, laneX, buildHighway } from './mg_rhythm_hw.js';
import { createFx } from './mg_rhythm_fx.js';
import { buildWorld, STAGE } from './mg_rhythm_world.js';
import { buildCrowd } from './mg_rhythm_crowd.js';
import { buildUI } from './mg_rhythm_ui.js';
import { buildVenue } from './venue.js';
import { createDirector, buildOppTurn, voteView, clashLine } from './mg_rhythm_battle.js';
import { createClick } from './mg_rhythm_click.js';
import { beatLevels, trainChart, buildTrainUI, TRAIN_BARS, UNLOCK_Q } from './mg_rhythm_train.js';

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

const THEME_OF = ['pink', 'cyan', 'lime', 'gold'];
const ease3 = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

export function createRhythm(ctx, opts) {
  opts = opts || {}; const { renderer, scene, camera, events } = ctx, q = ctx.quality || 'high', Core = coreOrFallback(), group = new THREE.Group(); group.name = 'rhythm';
  const game = !!opts.game, reduce = !!opts.reduce;                 // opts.reduce = E.settings.reduce: no camera shake, no bloom pulse
  const hudHost = opts.hud || (() => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;inset:0'; (ctx.canvas.parentElement || document.body).appendChild(d); return d; })();
  const oppOpt = opts.opp || (opts.battle && (opts.battle.opp || opts.battle)) || null, wantsBattle = (!!oppOpt && typeof oppOpt === 'object') || opts.mode === 'battle';
  const venueName = opts.venue === 'busk' ? null : (opts.venue || (wantsBattle ? 'arena' : null));

  // ------------------------------------------------------------------ world or venue, lighting, characters
  const R = ctx.kit.rng(opts.seed || 1337), mkLook = (l) => l || (BBH().CATALOG && BBH().CATALOG.DEFAULT_LOOK) || FALLBACK_LOOK;
  const youName = () => String(opts.you || opts.name || (opts.look && opts.look.name) || 'YOU');
  // INT-B venues (bar, showcase, booth, arena) replace the street world: the highway, fx and performer stay. Arena at 1.6 so the podiums match the 1.75x performer; its deck is sunk so the deck top is the highway plane.
  let venue = null, vy = 0, vk = 1;
  if (venueName) {
    try {
      const vo = { x: 0, z: STAGE.z, stageH: STAGE.h, scale: venueName === 'arena' ? 1.6 : 1, you: youName(), title: opts.title, sub: opts.sub, programme: opts.kind, q, Core: BBH().Core || null };
      if (opts.theme) vo.theme = opts.theme; else if (oppOpt && oppOpt.style !== undefined) vo.theme = THEME_OF[((oppOpt.style | 0) % 4 + 4) % 4]; if (oppOpt) vo.opp = oppOpt;
      venue = buildVenue(ctx, venueName, vo); vk = (venue.options && venue.options.scale) || 1; if (venueName === 'arena' && venue.heights) vy = -venue.heights.deck * vk; venue.group.position.y = vy;
    } catch (e) { console.error('[rhythm] venue ' + venueName + ' failed: ' + (e && e.stack || e)); venue = null; vy = 0; vk = 1; }
  }
  const isArena = !!venue && venueName === 'arena';
  const vw = (p) => ({ x: p.x * vk, y: (p.y || 0) * vk + vy, z: p.z * vk + STAGE.z });                     // venue-local point -> world
  const fake = { group: new THREE.Group(), bounds: { minX: -15, maxX: 15, minZ: -18, maxZ: 6 }, blocked: () => false, anchors: { start: { x: 0, z: -4, rot: 0 }, buskSpot: { x: 0, z: STAGE.z }, graffiti: { x: 0, z: STAGE.back - 0.8 }, fountain: { x: 0, z: -5 }, lamps: [{ x: -6.3, y: 3.8, z: -7.5 }, { x: 6.3, y: 3.8, z: -7.5 }, { x: -6.5, y: 3.8, z: 2.4 }, { x: 6.5, y: 3.8, z: 2.4 }] } };
  if (venue) { const A = venue.anchors || {}; fake.interior = true; fake.profile = (venue.hint && venue.hint.profile) || 'club'; fake.ceilY = ((venue.hint && venue.hint.ceilY) || 10) * vk + vy; if (A.rig) fake.anchors.rig = A.rig.map(vw); if (A.stageCenter) { const c = vw({ x: A.stageCenter.x, y: 0, z: A.stageCenter.z }); fake.anchors.stageCenter = { x: c.x, z: c.z }; } }
  const lighting = buildLighting(ctx, fake); group.add(lighting.group);
  const todBase = typeof opts.time === 'number' ? opts.time : TOD[opts.time] !== undefined ? TOD[opts.time] : 0.5; lighting.setTimeOfDay(todBase, true); lighting.state.tilt = 0.22;
  if (reduce) { try { lighting.setReduce(true); } catch (e) { /* ignore */ } }
  if (venue) { try { lighting.setProfile(fake.profile, true); lighting.setStageTheme(venue.theme, true); venue.onThemeChange = (n) => { try { lighting.setStageTheme(n); } catch (e) { /* ignore */ } }; } catch (e) { /* ignore */ } }
  const follow = new THREE.Object3D(); follow.position.set(0, 0, -4); group.add(follow); lighting.follow(follow); lighting.setMusic(false);
  const world = venue ? null : buildWorld(ctx, q); group.add(venue ? venue.group : world.group);
  const hw = buildHighway(ctx, q); group.add(hw.group);
  const fx = createFx(ctx, q, camera); group.add(fx.group);
  const crowd = venue ? { group: new THREE.Group(), near: [], spectators: venue.crowd && venue.crowd.mesh ? venue.crowd.mesh.count : 0, update() {}, dispose() {} } : buildCrowd(ctx, q, null); group.add(crowd.group);
  const perf = createCharacter(ctx, mkLook(opts.look));
  if (isArena) { perf.object.scale.setScalar(1.75 / vk); try { venue.attachPlayer(perf); } catch (e) { console.error('[rhythm] attachPlayer ' + e); group.add(perf.object); } }
  else { const pa = venue && venue.anchors && venue.anchors.performer; perf.object.position.set(pa ? pa.x : 0, pa ? pa.y : STAGE.h, STAGE.z + (pa ? pa.z : 0)); perf.object.scale.setScalar(1.75); group.add(perf.object); }
  perf.play('beatbox', { bpm: 100, amp: 0.8 });
  if (q === 'low') perf.object.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  let oppChar = isArena ? (venue.opponent || null) : null;

  // ------------------------------------------------------------------ state
  const S = { phase: 'idle', T: 0, spb: 0.6, bpm: 100, notes: [], chart: [], hits: [], combo: 0, maxCombo: 0, score: 0, energy: 0, energyShown: 0, press: [0, 0, 0, 0], round: 0, win: Core.windows(opts.stats || { mus: 20 }), approach: 1.43, endBeat: 0, counted: -1, manual: false, audioClock: false, t0: 0, lastA: 0, audioRun: false, cfg: null, result: null, battle: null, myStyle: null, oppStyleNow: null, bot: null, uHit: 0, beatSeen: -1, punch: 0, flee: 0, camK: 0, tPlay: 0, lastEmit: 0, ticks: 0,
    offset: (opts.offsetMs || 0) / 1000, mode: opts.mode || 'perform', vsT: 0, oppT: 0, oppView: [], oppMeter: 0, oppQ: 0, oppEnd: 0, jT: 0, reveal: -1, tally: { you: 0, opp: 0 }, votes: [], verdict: null, verdictShown: false, pickT: 0, stateT: 0 };
  let time = 0, W = 540, H = 960, mic = { on: false, stop: null }, disposed = false, lastTod = todBase;
  const click = createClick(); click.musicOff();                    // every rhythm game: the scene music is off until dispose
  const A = () => BBH().Audio || null, sfx = (n, o) => { try { const a = A(); if (a) a.sfx(n, o); } catch (e) { /* audio must never break the game */ } };
  const tv = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), dir = createDirector();
  const timers = new Set(), later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, ms); timers.add(id); return id; };

  // ------------------------------------------------------------------ UI
  const api = { press: (l, o) => press(l, o), start: (o) => start(o), quit: (o) => quit(o), toggleMic, hasMic: !!(BBH().Mic && BBH().Mic.open) };
  const ui = buildUI(hudHost, api); ui.resize(hudHost.clientWidth || 540, hudHost.clientHeight || 960); const tui = buildTrainUI(ui);
  function showStartCard() { ui.showStart({ difficulty: opts.difficulty === undefined ? 0.5 : opts.difficulty }); }
  const venueCam = (name) => { const c = venue && venue.cams && venue.cams[name]; if (!c) return null; return { pos: [c.pos[0], c.pos[1] + vy, c.pos[2]], look: [c.look[0], c.look[1] + vy, c.look[2]], fov: c.fov || 0 }; };
  const shot = (name, blend, hold, sway) => { const c = venueCam(name); return c ? { cam: c, blend: blend || 0, hold: hold || 0, sway: sway === undefined ? 0.5 : sway, name } : null; };
  const busy = () => S.phase === 'vs' || S.phase === 'pick' || S.phase === 'count' || S.phase === 'play' || S.phase === 'opp' || S.phase === 'judge';
  const mood = (m) => { try { perf.setMood && perf.setMood(m); } catch (e) { /* ignore */ } try { oppChar && oppChar.setMood && oppChar.setMood(m === 'happy' ? 'sad' : m === 'sad' ? 'happy' : m); } catch (e) { /* ignore */ } };

  // ------------------------------------------------------------------ rounds
  function defaultSeed(o) { return o.seed !== undefined ? o.seed : (Date.now() & 0xffff); }
  function start(o) {
    o = Object.assign({}, opts, o || {}); S.cfg = o; S.manual = !!o.manual; S.result = null; S.hits = []; S.round = 0; S.myStyle = null; S.seed0 = defaultSeed(o); ui.clearCard(); tui.clear(); tui.hidePattern(); ui.hideVs(true); ui.hideJudges(); ui.closeConfirm(); dir.clear(); S.stats = o.stats || { mus: 20 }; S.call = [];
    S.offset = (o.offsetMs || 0) / 1000; S.mode = o.mode || (o.opp || o.battle ? 'battle' : 'perform'); S.verdict = null; S.verdictShown = false; S.votes = []; S.tally = { you: 0, opp: 0 }; S.reveal = -1; S.oppView = []; S.oppStyleNow = null; ui.setBackVisible(true); ui.setMeterName('CROWD'); ui.setHeader([]);
    const opp = o.opp || (o.battle && (o.battle.opp || o.battle)); S.battle = opp && typeof opp === 'object' ? { opp, roundQ: [], oppStyles: [], tot: { perfects: 0, bestCombo: 0, lane: [0, 0, 0, 0], notes: 0, hits: 0, pts: 0, miss: 0, good: 0, perfect: 0 } } : null;
    if (S.battle && isArena && opp !== oppOpt) { try { oppChar = venue.setOpponent(opp) || oppChar; } catch (e) { /* ignore */ } }
    S.win = Core.windows(S.stats); try { const a = A(); if (a && a.unlock) a.unlock(); } catch (e) { /* ignore */ }
    if (o.mic && !mic.on) startMic();
    if (S.battle) beginVs(); else if (S.mode === 'train') beginTrainEntry(o); else beginRound();
  }
  // ---- RHYTHM TRAINING: level select -> LISTEN (the hero plays the pattern once) -> YOUR TURN (count-in) -> 4 bars of gems -> training card
  function beginTrainEntry(o) {
    S.levels = beatLevels(Core); S.prog = Object.assign({ unlocked: 1, best: {} }, S.prog || {}, o.progress || {});
    const lv = o.level | 0; if (lv >= 1 && lv <= S.levels.length && lv <= S.prog.unlocked) beginTrain(lv); else showLevelSelect(lv || S.prog.unlocked);
  }
  function showLevelSelect(cur) {
    click.stop(); S.phase = 'levels'; S.notes = []; S.call = []; ui.setHeader([]); ui.setCombo(0); ui.setBackVisible(true); dir.clear(); mood('neutral'); lighting.setMusic(false);
    tui.showLevels(S.levels, S.prog, Math.min(cur || 1, S.levels.length), (lv) => beginTrain(lv));
  }
  function beginTrain(lv) { S.trainL = S.levels[Math.max(0, Math.min(S.levels.length - 1, lv - 1))]; S.result = null; S.round = 0; S.seed0 = 1000 + lv; ui.setBackVisible(true); tui.clear(); beginRound(); }
  function trainAct(act) {
    const L = S.trainL, nx = S.levels[L.level] || null, go = () => { if (act === 'next' && nx && nx.level <= S.prog.unlocked) beginTrain(nx.level); else if (act === 'again') beginTrain(L.level); else if (act === 'levels') showLevelSelect(nx && S.result && S.result.passed ? nx.level : L.level); else doQuit(); };
    let r = true; if (opts.onContinue) { try { r = opts.onContinue({ train: true, act, level: L.level, result: S.result }); } catch (e) { console.error('[rhythm] train continue ' + e); } }
    if (act === 'continue') { if (!opts.onContinue) doQuit(); return; } if (r === false) return; go();
  }
  function setTrainProgress(p, rw) { if (p) S.prog = Object.assign({ unlocked: 1, best: {} }, S.prog || {}, p); S.trainRw = rw || null; }
  // ---- battle: VS splash (camera whip over the arena, LED wall, DOM names) -> style picker
  function beginVs() {
    const B = S.battle, opp = B.opp; S.phase = 'vs'; S.vsT = 0; S.vsHit = false; S.stateT = 0; sfx('whoosh'); mood('angry'); lighting.setMusic(true);
    ui.showVs({ you: youName(), youSub: S.cfg.youSub || 'CHALLENGER', opp: opp.name || 'RIVAL', sub: 'TIER ' + (opp.tier || 1) + (opp.fav ? '  -  ' + opp.fav.join(' + ').toUpperCase() : ''), taunt: opp.taunt || '', tauntBy: opp.name });
    if (venue && venue.vs) { try { venue.vs({ you: youName(), opp: opp.name || 'RIVAL', round: 1 }); } catch (e) { /* ignore */ } }
    if (oppChar) { try { oppChar.play('battle', { bpm: opp.bpm || 100 }); } catch (e) { /* ignore */ } } try { perf.play('battle', { bpm: opp.bpm || 100 }); } catch (e) { /* ignore */ }
    dir.play([shot('oppClose', 0, 0.85), shot('youClose', 0.4, 0.85), shot('vs', 0.55, 0.95, 0.2), shot('wide', 0.9, 0)]);
  }
  // VHS Story style orders: before each battle round pick a fighting style (rock paper scissors)
  function beginPick() {
    const B = S.battle, st = Core.STYLES || []; S.oppStyleNow = Core.opponentStyle ? Core.opponentStyle(B.opp, Math.random) : null;
    if (!st.length) { beginRound(); return; }
    S.phase = 'pick'; S.pickT = 0; ui.setHeader([{ t: 'ROUND ' + (S.round + 1) + '/3', k: '' }]); ui.setMeterName('CROWD'); dir.play([shot('wide', 1.0, 0, 0.8)]);
    if (venue && venue.setRound) { try { venue.setRound(S.round + 1); } catch (e) { /* ignore */ } }
    ui.showPicker(st, S.round, B.opp, (id) => { S.myStyle = id; sfx('confirm'); beginRound(); }, Core.STYLE_BEATS);
  }
  function pick(id) { if (S.phase !== 'pick') return false; ui.clearCard(); S.myStyle = id; beginRound(); return true; }
  function beginRound() {
    const o = S.cfg, B = S.battle, TL = S.mode === 'train' ? S.trainL : null, bars = B ? 4 : TL ? TRAIN_BARS : (o.bars || 8), seed = S.seed0 + S.round * 977, diff = B ? 0.35 + (B.opp.skill || 0.5) * 0.45 : TL ? 0.2 + TL.level * 0.08 : (o.difficulty === undefined ? 0.5 : o.difficulty);
    let chart = TL ? trainChart(TL, bars) : Core.makeChart(seed, { bars, difficulty: diff }); if (B && S.myStyle && Core.styleChart) chart = Core.styleChart(chart, S.myStyle, seed);
    const bpm = B ? (B.opp.bpm || 100) : TL ? TL.bpm : (o.bpm || 100);
    S.lead = TL ? 12 : 4; S.cIn = S.lead - 4;                         // training: 4 beats LISTEN count, 4 beats the hero's call, 4 beats YOUR TURN count-in
    S.bpm = bpm; S.spb = 60 / bpm; S.chart = chart; ctx.__bpm = bpm; S.hits = []; S.combo = 0; S.maxCombo = 0; S.score = 0; S.counted = -1; S.beatSeen = -1; S.bars = bars; S.seed = seed; S.diff = diff;
    S.approach = Math.max(1.3, (1500 - Math.min(300, bpm * 2)) / 1000 * 1.1); S.phase = 'count'; S.press = [0, 0, 0, 0]; S.uHit = 0; S.oppView = []; dir.clear(); ui.setMeterName('CROWD');
    const g0 = click.start({ bpm, offsetMs: S.offset * 1000 }), g = S.manual ? null : g0;          // music off: the shaker metronome gives the audio clock (no backing groove)
    S.audioClock = !!(g && typeof g.t0 === 'number' && g.spb); S.audioRun = false; S.lastA = 0; if (S.audioClock) { S.t0 = g.t0; S.spb = g.spb; } S.T = S.audioClock ? 0 : -0.4;
    S.notes = chart.map((n, i) => ({ id: i, lane: n.lane, beat: n.beat + S.lead, time: (n.beat + S.lead) * S.spb, state: 0 })); S.endBeat = bars * 4 + S.lead + 2; hw.setApproach(S.approach, S.spb);
    S.call = TL ? TL.notes.map((n, i) => ({ id: 8000 + i, lane: n.lane, step: n.step, time: (4 + n.beat) * S.spb, state: 0, done: false, tint: callTint })) : [];
    if (o.bot || S.bot) { planBot(o.bot || S.bot._o); }
    ui.setScore(0); ui.setCombo(0); fx.clear(); lighting.setMusic(true); mood('neutral');
    if (B) { ui.setHeader([{ t: 'ROUND ' + (S.round + 1) + '/3', k: '' }, { t: 'STYLE: ' + String(S.myStyle || '-').toUpperCase(), k: 's' }]); ui.toast((S.round === 0 ? (B.opp.taunt || '') : 'vs ' + (B.opp.name || 'Rival')) || ('ROUND ' + (S.round + 1)), 2200); }
    else if (TL) { ui.setHeader([]); ui.setMeterName('GROOVE'); tui.showPattern(TL, 'LISTEN'); try { perf.play('beatbox', { bpm, amp: 0.8 }); } catch (e) { /* ignore */ } }
    else { ui.setHeader(o.title ? [{ t: String(o.title).toUpperCase() + (o.sub ? '  -  ' + String(o.sub).toUpperCase() : ''), k: '' }] : []); if (o.tip && S.round === 0) ui.toast('TAP THE LANE AS THE GEMS HIT THE RING', 3200); }
  }
  function finishRound() {
    const sum = Core.summarize(S.hits, S.chart.length, S.maxCombo); S.sum = sum; click.stop();
    const B = S.battle;
    if (B) {
      const t = B.tot; t.perfects += sum.perfect; t.bestCombo = Math.max(t.bestCombo, sum.bestCombo); sum.perfectLane.forEach((v, i) => { t.lane[i] += v; }); t.notes += S.chart.length; t.perfect += sum.perfect; t.good += sum.good; t.miss += sum.miss; t.pts += sum.perfect * 100 + sum.good * 60; t.score = (t.score || 0) + sum.score;
      const qd = Math.min(1, sum.accuracy * 0.8 + Math.min(1, sum.bestCombo / Math.max(8, S.chart.length * 0.7)) * 0.2); B.roundQ.push({ q: qd, style: S.myStyle }); B.oppStyles.push(S.oppStyleNow);
      startOpp(); return;
    }
    if (S.mode === 'train') { finishTrain(sum); return; }
    const result = Object.assign({}, sum, { game: 'rhythm', grade: sum.rank, hits: sum.perfect + sum.good, maxCombo: sum.bestCombo, difficulty: S.diff, seed: S.seed, bars: S.bars, bpm: S.bpm, mode: S.mode === 'battle' ? 'perform' : S.mode, liveScore: Math.round(S.score) });
    S.result = result; S.phase = 'result'; S.tPlay = 0; ui.setCombo(0); ui.setHeader([]); dir.clear();
    ui.showResult(result, () => start(Object.assign({}, S.cfg, { seed: S.cfg.seed })), { game, label: S.cfg.title, onContinue: (r) => { if (opts.onContinue) opts.onContinue(r); } });
    sfx(result.grade === 'S' || result.grade === 'A' ? 'win' : 'applause'); const hot = result.grade === 'S' || result.grade === 'A'; celebrate(hot);
    lighting.setMusic(false); try { ctx.events.emit('minigame', { game: 'rhythm', result }); } catch (e) { console.error('[rhythm] result handler failed ' + e); }
  }
  function finishTrain(sum) {
    const L = S.trainL, nx = S.levels[L.level] || null, q = sum.accuracy, passed = q >= UNLOCK_Q;
    const result = Object.assign({}, sum, { game: 'rhythm', grade: sum.rank, hits: sum.perfect + sum.good, maxCombo: sum.bestCombo, bpm: S.bpm, bars: S.bars, mode: 'train', level: L.level, levelId: L.id, name: L.name, q, passed, liveScore: Math.round(S.score) });
    S.result = result; S.phase = 'result'; S.tPlay = 0; ui.setCombo(0); ui.setHeader([]); dir.clear(); tui.hidePattern();
    const was = S.prog.unlocked; if (!game && passed && nx && L.level >= was) S.prog.unlocked = L.level + 1;                // standalone: unlock locally (the game: Core trainGame, then setTrainProgress)
    const rk = 'SABCD', old = S.prog.best[L.level]; if (!game && (!old || rk.indexOf(result.grade) < rk.indexOf(old))) S.prog.best[L.level] = result.grade;
    sfx(passed ? 'win' : 'applause'); celebrate(result.grade === 'S' || result.grade === 'A'); lighting.setMusic(false);
    const card = () => tui.showTrainResult(result, { L, next: nx, unlocked: !nx ? false : nx.level <= S.prog.unlocked, game, onAct: trainAct });
    if (!game) card(); else ui.setBackVisible(false);
    try { ctx.events.emit('minigame', { game: 'rhythm', result }); } catch (e) { console.error('[rhythm] result handler failed ' + e); }
    if (game) { card(); if (S.trainRw) ui.setRewards(S.trainRw); }                 // the scene ran trainGame in the handler: the card knows the new unlock and the gain
  }
  function celebrate(hot) {
    fx.confettiBurst(hot ? 90 : 30, 0, 6, STAGE.z + 6, 12, 10); if (venue && venue.cheer) { try { venue.cheer(hot ? 2.5 : 1); } catch (e) { /* ignore */ } } if (venue && venue.pyro && hot) { try { venue.pyro(2); } catch (e) { /* ignore */ } }
    if (hot && (!venue || isArena)) for (let i = 0; i < 4; i++) later(() => fx.firework((Math.random() - 0.5) * 12, 7.2 + Math.random() * 3, STAGE.z - 4 - Math.random() * 4), 250 + i * 380);
  }

  // ---- battle: the rival's turn (ghost notes, 2 bars of their own chart, hit with probability opponentRound)
  function startOpp() {
    const B = S.battle, opp = B.opp, T = buildOppTurn(Core, opp, S.round); S.phase = 'opp'; S.oppT = 0; S.oppQ = T.q; S.oppEnd = T.end; S.oppMeter = 0; S.stateT = 0; S.combo = 0; ui.setCombo(0);
    const tint = new THREE.Color(1, 0.62, 0.85); S.oppView = T.notes; S.oppView.forEach((n) => { n.tint = tint; }); S.spb = T.spb; S.bpm = opp.bpm || 100; hw.setApproach(S.approach, S.spb);
    ui.setMeterName('THEM'); ui.setHeader([{ t: 'ROUND ' + (S.round + 1) + '/3', k: '' }, { t: String(opp.name || 'RIVAL').toUpperCase() + "'S TURN", k: 't' }]);
    ui.toast(clashLine(Core, S.myStyle, S.oppStyleNow), 2800); mood('neutral');
    click.start({ bpm: opp.bpm || 100, lead: 1.2, offsetMs: S.offset * 1000 });                                  // the rival beatboxes over the same soft shaker
    try { perf.play('idle', {}); } catch (e) { /* ignore */ } if (oppChar) { try { oppChar.setMood('angry'); } catch (e) { /* ignore */ } }
    dir.play([shot('oppClose', 0.8, 2.3, 0.5)], { clearAtEnd: true });                // then the play camera: the rival's ghost notes run down the highway
  }
  function updateOpp(dt) {
    S.oppT += dt; const T = S.oppT;
    for (const n of S.oppView) if (!n.done && T >= n.time) {
      n.done = true; if (n.hit) { n.state = 1; S.press[n.lane] = 1; try { const a = A(); if (a) a.drum(n.lane, { vel: 0.8 }); } catch (e) { /* ignore */ } fx.burst(laneX(n.lane), 0.45, HIT_Z, 9, { colors: ['#ff3ea5', '#ffc2e2', '#fff2dc'], speed: 2.6, up: 2.2, life: 0.55, size: 0.2, grav: 7 }); fx.ring(laneX(n.lane), HIT_Z, '#ff3ea5', 1.6); if (oppChar) { try { oppChar.hit(LANES[n.lane].drum, 1); } catch (e) { /* ignore */ } } S.punch = Math.max(S.punch, 0.3); } else n.state = 3;
    }
    S.oppMeter = Math.min(S.oppQ, S.oppMeter + dt / 2.4 * S.oppQ);
    if (T > S.oppEnd) {
      click.stop();
      S.round++; S.oppView = []; if (oppChar) { try { oppChar.play('battle', { bpm: S.bpm }); } catch (e) { /* ignore */ } }
      if (S.round >= 3) startJudge(); else beginPick();
    }
  }

  // ---- battle: five judges, one vote every 1.1 s, then the verdict card
  function startJudge() {
    const B = S.battle, o = S.cfg; S.phase = 'judge'; S.jT = 0; S.reveal = -1; S.tally = { you: 0, opp: 0 }; S.verdictShown = false; ui.setMeterName('CROWD'); ui.setHeader([]); mood('neutral');
    const payload = { stats: Object.assign({ mus: 20, tech: 20, show: 20, ori: 20 }, S.stats), opp: o.finalOpp || B.opp, rounds: B.roundQ, oppStyles: B.oppStyles, perfects: B.tot.perfects, bestCombo: B.tot.bestCombo, perfectLane: B.tot.lane, final: o.final || null };
    let vr = null; try { vr = opts.resolveBattle ? opts.resolveBattle(payload) : null; } catch (e) { console.error('[rhythm] resolveBattle failed ' + e); }
    if (!vr) { let out; try { out = Core.resolveBattle({ stats: payload.stats }, B.opp, B.roundQ, Math.random, B.oppStyles); } catch (e) { out = { win: B.tot.pts / Math.max(1, B.tot.notes * 100) > 0.6, forPlayer: 0, votes: [] }; } vr = { votes: out.votes || [], win: !!out.win, out }; }
    S.verdict = vr; const votes = vr.votes || (vr.out && vr.out.votes) || [], J = Core.JUDGES || [];
    S.votes = votes.map((v, i) => voteView(v, J[i])); if (!S.votes.length) { S.votes = []; }
    ui.showJudges(S.votes.map((v) => v.name), youName(), B.opp.name); if (venue && venue.setScores) { try { venue.setScores(null); } catch (e) { /* ignore */ } }
    ui.toast('THE JUDGES: five votes decide it', 1800); lighting.setMusic(false);
    dir.play([shot('judges', 1.2, 0, 0.4)]);
  }
  function revealVote(i) {
    const v = S.votes[i]; if (!v) return; if (v.forPlayer) S.tally.you++; else S.tally.opp++;
    ui.revealJudge(i, v, S.tally); if (venue && venue.reveal) { try { venue.reveal(i, v.score); } catch (e) { /* ignore */ } }
    sfx(v.forPlayer ? 'hit_perfect' : 'miss'); S.shake = Math.max(S.shake || 0, 0.5); if (v.forPlayer && venue && venue.cheer) { try { venue.cheer(0.9); } catch (e) { /* ignore */ } }
    const jc = venue && venue.judges && venue.judges[i]; if (jc) { try { jc.play(v.forPlayer ? 'cheer' : 'point', { fade: 0.1 }); jc.setMood(v.forPlayer ? 'happy' : 'angry'); } catch (e) { /* ignore */ } }
    const jp = venue && venue.anchors && venue.anchors.judges && venue.anchors.judges[i];
    if (jp) { fx.burst(jp.x, jp.y + vy + 1.7 * vk, jp.z + 0.4 * vk, 16, { colors: v.forPlayer ? ['#7af0ff', '#27c8bb', '#fff2dc'] : ['#ff9ad0', '#ff3ea5', '#fff2dc'], speed: 3.2, up: 2.4, life: 0.7, size: 0.3, grav: 4 }); const c = venueCam('judges'); if (c) dir.play([{ cam: { pos: [jp.x * 0.42, 4.6 * vk + vy + 0.6, STAGE.z + 9 * vk], look: [jp.x * 0.88, jp.y + vy + 1.0 * vk, jp.z], fov: c.fov * 0.72 }, blend: 0.55, hold: 0, sway: 0.25 }]); /* high enough to see over the podiums */ }
  }
  function updateJudge(dt) {
    S.jT += dt; const per = 1.1, idx = Math.min(4, Math.floor((S.jT - 0.9) / per));
    while (S.reveal < idx) { S.reveal++; revealVote(S.reveal); }
    if (S.reveal >= 4 && S.jT > 0.9 + 5 * per + 0.7 && !S.verdictShown) showVerdict();
  }
  function showVerdict() {
    S.verdictShown = true; S.phase = 'verdict'; const B = S.battle, vr = S.verdict, out = vr.out || {}, win = !!vr.win, opp = B.opp, forPlayer = out.forPlayer !== undefined ? out.forPlayer : S.tally.you, t = B.tot;
    const acc = t.notes ? t.pts / (t.notes * 100) : 0, rk = Core.rank ? Core.rank(acc) : 'C';
    const result = { accuracy: Math.min(1, acc), perfect: t.perfect, good: t.good, miss: t.miss, total: t.notes, bestCombo: t.bestCombo, perfectLane: t.lane, rank: rk, score: Math.round(t.score || 0), game: 'rhythm', grade: rk, hits: t.perfect + t.good, maxCombo: t.bestCombo, difficulty: S.diff, seed: S.seed0, bars: S.bars, bpm: S.bpm, mode: 'battle', rounds: B.roundQ.slice(), oppStyles: B.oppStyles.slice(), battle: Object.assign({}, out, { win, forPlayer, votes: vr.votes || out.votes || [] }) };
    S.result = result; ui.setBackVisible(false); ui.setCombo(0); dir.play([shot(win ? 'youClose' : 'oppClose', 0.9, 1.6, 0.6), shot('wide', 1.4, 0, 0.8)]);
    ui.showVerdict({ win, forPlayer, line: win ? (opp.defeat || 'Nice set.') : 'Train up and come back stronger.' }, { game, onContinue: (v) => { if (opts.onContinue) opts.onContinue({ win, out, result }); }, onAgain: () => start(Object.assign({}, S.cfg, { seed: S.cfg.seed })) });
    if (vr.rw) ui.setRewards(vr.rw);
    sfx(win ? 'win' : 'lose'); S.shake = 1; mood(win ? 'happy' : 'sad'); try { perf.play(win ? 'cheer' : 'sad', {}); } catch (e) { /* ignore */ } if (oppChar) { try { oppChar.play(win ? 'sad' : 'cheer', {}); } catch (e) { /* ignore */ } }
    if (win) celebrate(true); else if (venue && venue.cheer) { try { venue.cheer(1.2); } catch (e) { /* ignore */ } }
    try { ctx.events.emit('minigame', { game: 'rhythm', result }); } catch (e) { console.error('[rhythm] result handler failed ' + e); }
  }
  function setRewards(rw) { ui.setRewards(rw); }

  // ------------------------------------------------------------------ input and judging
  function project(x, y, z) { tv.set(x, y, z); camera.updateMatrixWorld(); tv.project(camera); return [(tv.x * 0.5 + 0.5) * W, (-tv.y * 0.5 + 0.5) * H]; }
  function press(lane, o) {
    o = o || {}; if (lane < 0 || lane > 3) return null; if (S.phase === 'idle' && !o.fromUI) { /* free play pads before the set */ }
    if (S.phase !== 'play' && S.phase !== 'count' && S.phase !== 'idle' && S.phase !== 'opp') return null;
    if (S.phase === 'opp') { S.press[lane] = 1; ui.padFlash(lane); try { const a = A(); if (a && !o.silent) a.drum(lane, { vel: 0.5 }); } catch (e) { /* ignore */ } return null; }     // pads still tap while the rival plays
    S.press[lane] = 1; if (!o.silent) { try { const a = A(); if (a) a.drum(lane, { vel: 0.9 }); } catch (e) { /* ignore */ } }
    ui.padFlash(lane); performerHit(lane); if (S.phase !== 'play') { fx.burst(laneX(lane), 0.3, HIT_Z, 3, { color: LANES[lane].color, speed: 1.5, up: 1, life: 0.3, size: 0.12 }); return null; }
    const T = S.T + S.offset - (o.shift || 0), w = S.win; let best = null, bd = 1e9;
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
    if (S.combo > 0 && S.combo % 10 === 0) { sfx('combo'); ui.pop(S.combo + ' COMBO', 'perfect', W / 2, H * 0.34, true); S.punch = 1; fx.ring(0, HIT_Z - 0.5, '#fff2dc', 4.5); if (S.energy > 0.45) fx.confettiBurst(24, 0, 6, -6, 9, 8); }
  }
  function breakCombo() { if (S.combo >= 8) sfx('miss'); S.combo = 0; ui.setCombo(0); S.punch = 0; S.shake = 0.35; }

  // keyboard
  function onKey(e) {
    if (e.repeat) return; const c = e.code;
    for (let i = 0; i < 4; i++) if (LANES[i].keys.includes(c)) { e.preventDefault(); press(i); return; }
    if ((c === 'Space' || c === 'Enter') && S.phase === 'idle' && ui.hasCard()) { e.preventDefault(); const go = hudHost.querySelector('.rh .go'); if (go) go.click(); }
  }
  window.addEventListener('keydown', onKey);
  // like the 2D game: leaving the tab mid set abandons it (no rewards). Standalone: back to the start card. In the game: back to the place.
  function onVis() { if (document.hidden && (S.phase === 'play' || S.phase === 'count' || S.phase === 'opp' || S.phase === 'pick') && !S.manual) { if (game) { ui.toast('Set interrupted.', 1500); later(() => doQuit(), 50); } else abort(); } }
  document.addEventListener('visibilitychange', onVis);
  function abort() { click.stop(); S.phase = 'idle'; S.bot = null; dir.clear(); ui.hideVs(true); ui.hideJudges(); ui.setHeader([]); lighting.setMusic(false); ui.setCombo(0); S.combo = 0; ui.toast('Set interrupted.', 2200); showStartCard(); }

  // MIC MODE: like the 2D game. Each detected beatbox hit presses the lane it was classified as.
  function toggleMic() { if (mic.on) { stopMic(); if (opts.onMic) opts.onMic(false); } else startMic(true); }
  async function startMic(user) {
    const M = BBH().Mic, fail = (msg) => { ui.toast(msg, 2400); if (opts.onMic) opts.onMic(false); };
    if (!M || !M.open) { ui.toast('No microphone available', 1800); return; }
    try {
      const o = await M.open(); if (!o.ok) { fail('Mic: ' + (o.error || 'unavailable') + '. Using taps.'); return; } if (disposed) { try { M.close && M.close(); } catch (e) { /* ignore */ } return; }
      let prof = null; try { const by = {}, Sm = BBH().Samples; if (Sm) for (let l = 0; l < 4; l++) { const sm = await Sm.get(opts.slot || (BBH().G && BBH().G.slot) || 1, l); if (sm) by[l] = sm.f32 || sm.data; } if (Object.keys(by).length) prof = M.makeClassifier(M.trainFromSamples(by, M.sampleRate() || 44100)); } catch (e) { prof = null; }
      mic.stop = M.listen((ev) => micHit(ev), prof ? { classifier: prof } : undefined); mic.on = true; ui.setMic(true); ui.toast('Mic mode: beatbox into your mic!', 2200); if (user && opts.onMic) opts.onMic(true);
    } catch (e) { fail('Mic mode failed. Using taps.'); }
  }
  function stopMic() { try { if (mic.stop) mic.stop(); mic.stop = null; const M = BBH().Mic; if (M && M.close) M.close(); } catch (e) { /* ignore */ } mic.on = false; ui.setMic(false); }
  function micHit(ev) {
    if (S.phase !== 'play' && S.phase !== 'count') return; let lane = ev.lane;
    if (S.phase === 'play' && (ev.confidence === undefined || ev.confidence < 0.5)) { let best = null, bd = 1e9; for (const n of S.notes) { if (n.state) continue; const d = Math.abs(S.T - n.time); if (d < bd) { bd = d; best = n; } } if (best && bd < 0.2) lane = best.lane; }
    press(lane, { silent: true, shift: 0.04 });
  }
  function doQuit() { stopMic(); click.stop(); try { events.emit('minigameQuit'); } catch (e) { /* ignore */ } }
  function quit(o) { o = o || {}; if (game && busy() && !o.force) { ui.confirmLeave({ onLeave: doQuit }); return false; } doQuit(); return true; }

  // test bot: plans a press for every note with a gaussian timing error (and picks battle styles by itself)
  function planBot(b) {
    b = b || {}; const r = ctx.kit.rng((S.seed || 1) * 31 + 7), jit = b.jitterMs === undefined ? 25 : b.jitterMs, miss = b.missRate || 0, gauss = () => (r() + r() + r() + r() - 2) * 1.2;
    S.bot = { _o: b, plan: S.notes.map((n) => ({ n, at: n.time + gauss() * jit / 1000 + (b.biasMs || 0) / 1000, skip: r() < miss, done: false })) };
  }

  // ------------------------------------------------------------------ simulation (clock + rules) and visuals
  function sim(dt) {
    if (S.phase === 'idle') return;
    if (S.phase === 'pick') { S.pickT += dt; if (S.bot && S.pickT > 0.35) { const st = (Core.STYLES || []); const id = S.bot._o.style || (st.length ? st[S.round % st.length].id : null); if (id) pick(id); } return; }
    if (S.phase === 'vs') { S.vsT += dt; if (!S.vsHit && S.vsT > 0.55) { S.vsHit = true; S.shake = 1.6; S.punch = 1; sfx('combo'); fx.ring(0, HIT_Z - 1, '#ffe14d', 7); fx.confettiBurst(26, 0, 7, STAGE.z + 4, 10, 8); } if (S.bot && S.vsT > 0.4 && S.bot._o.skipVs !== false) S.vsT = Math.max(S.vsT, 3.4); if (S.vsT > 3.4) { ui.hideVs(); beginPick(); } return; }
    if (S.phase === 'opp') { updateOpp(dt); return; }
    if (S.phase === 'judge') { updateJudge(dt); return; }
    if (S.phase === 'verdict') { S.stateT += dt; return; }
    if (!S.manual && S.audioClock) { const a = A(); const an = a ? a.now() : 0; if (an > S.lastA + 1e-4 && S.lastA > 0) S.audioRun = true; S.lastA = an || S.lastA; if (S.audioRun) S.T = an - S.t0; else S.T += dt; } else S.T += dt;
    S.tPlay += dt;
    if (S.phase === 'count' || S.phase === 'play') {
      const T = S.T, beatNow = Math.floor(T / S.spb);
      const cb = beatNow - (S.cIn || 0);
      if (S.phase === 'count' && beatNow !== S.counted && cb >= 0 && cb < 4) { S.counted = beatNow; sfx(cb === 3 ? 'go' : 'countdown'); ui.countdown(cb === 3 ? 'GO!' : String(3 - cb)); if (S.call.length && cb === 0) tui.patternLabel('YOUR TURN', true); }
      if (S.call.length) callTick(T);
      if (T >= (S.lead || 4) * S.spb - 0.02) S.phase = 'play';
      if (S.bot) for (const p of S.bot.plan) { if (p.done || p.at > T) continue; p.done = true; if (!p.skip && !p.n.state) press(p.n.lane, { silent: true, bot: true }); }
      for (const n of S.notes) if (!n.state && (T + S.offset - n.time) * 1000 > S.win.good + 20) { n.state = 3; S.hits.push({ lane: n.lane, grade: 'miss' }); breakCombo(); const sp = project(laneX(n.lane), 0.9, HIT_Z); ui.pop('MISS', 'miss', sp[0], sp[1]); }
      if (T / S.spb > S.endBeat) finishRound();
    }
  }
  // the hero's call in training: every pattern note sounds (the hero's own beatbox voice), lights its lane and its step in the strip
  const callTint = new THREE.Color(0.75, 1, 0.95);
  function callTick(T) {
    for (const n of S.call) if (!n.done && T >= n.time) {
      n.done = true; n.state = 1; S.press[n.lane] = 1; ui.padFlash(n.lane); performerHit(n.lane); tui.patternStep(n.step);
      try { const a = A(); if (a && !S.manual) a.drum(n.lane, { vel: 0.85 }); } catch (e) { /* ignore */ }
      fx.burst(laneX(n.lane), 0.45, HIT_Z, 8, { colors: [LANES[n.lane].color, '#fff2dc'], speed: 2.2, up: 2, life: 0.5, size: 0.18, grav: 7 }); fx.ring(laneX(n.lane), HIT_Z, LANES[n.lane].color, 1.4);
    }
  }
  const camBase = new THREE.Vector3(0, 6.0, 11.4), camAim = new THREE.Vector3(0, 0.5, -7), camFrom = { p: new THREE.Vector3(), l: new THREE.Vector3(), fov: 50 };
  let dirW = 0, lastDir = null;
  function vis(dt) {
    time += dt; const t = time, playing = S.phase === 'count' || S.phase === 'play' || S.phase === 'between', inOpp = S.phase === 'opp';
    const beat = S.phase === 'idle' || S.phase === 'pick' || S.phase === 'vs' || S.phase === 'judge' || S.phase === 'verdict' ? t * S.bpm / 60 : inOpp ? S.oppT / S.spb : S.T / S.spb;
    // beat pulses
    const bi = Math.floor(beat); if (bi !== S.beatSeen && (S.phase === 'count' || S.phase === 'play' || S.phase === 'result' || S.phase === 'idle' || inOpp || S.phase === 'vs' || S.phase === 'judge' || S.phase === 'verdict')) { S.beatSeen = bi; S.punch = Math.max(S.punch, bi % 4 === 0 ? 0.55 : 0.22); }
    // energy: follows the combo, rises fast, falls slowly; the final grade sets a celebration level
    const won = S.verdict && S.verdict.win;
    let target = S.phase === 'play' || S.phase === 'count' ? clamp(S.combo / 26, 0, 1) * 0.92 + (S.phase === 'play' ? 0.06 : 0.02) : S.phase === 'result' ? (S.result && (S.result.grade === 'S' || S.result.grade === 'A') ? 1 : 0.5) : S.phase === 'between' ? S.energy : inOpp ? 0.3 + 0.55 * S.oppMeter : S.phase === 'vs' ? 0.5 : S.phase === 'judge' ? 0.55 + 0.06 * S.reveal : S.phase === 'verdict' ? (won ? 1 : 0.3) : 0.18;
    if (S.forceEnergy !== undefined) target = S.forceEnergy; S.energy += (target - S.energy) * (1 - Math.exp(-dt * (target > S.energy ? 3.2 : 0.8)));
    const E = S.energy; S.energyShown = E; for (let i = 0; i < 4; i++) S.press[i] = Math.max(0, S.press[i] - dt * 6.5); S.punch *= Math.exp(-dt * 7); if (S.shake) S.shake *= Math.exp(-dt * 8);
    // high energy effects
    if (playing || S.phase === 'result' || S.phase === 'verdict') {
      if (E > 0.6 && Math.random() < dt * (E - 0.5) * 3.5) fx.confettiBurst(5, (Math.random() - 0.5) * 8, 6.5, -5 + Math.random() * 3, 3, 4);
      if (E > 0.86 && S.phase !== 'result' && S.phase !== 'verdict' && (S.fwT = (S.fwT || 0) - dt) <= 0 && (!venue || isArena)) { S.fwT = 1.1 + Math.random() * 1.0; fx.firework((Math.random() - 0.5) * 14, 7.2 + Math.random() * 2.2, STAGE.z - 4.6 - Math.random() * 6, [['#ff3ea5', '#ffd23f', '#fff2dc'], ['#2ee6ff', '#a86bff', '#fff2dc'], ['#9dff4a', '#ffd23f', '#ff8a3d']][(Math.random() * 3) | 0]); }
    }
    S.flee = E > 0.7 && !S.fled ? (S.fled = true, 1) : 0; if (E < 0.3) S.fled = false;
    // lighting follows the crowd: the sky deepens a touch as the energy rises
    const tod = clamp(todBase + E * 0.13, 0, 1); if (Math.abs(tod - lastTod) > 0.004) { lastTod = tod; lighting.setTimeOfDay(tod); }
    // performers
    const ending = S.phase === 'result' && S.result ? (S.result.grade === 'S' || S.result.grade === 'A' ? 'cheer' : S.result.grade === 'D' ? 'sad' : null) : null;
    if (S.phase === 'vs') { /* the VS clip is set once */ }
    else if (S.phase === 'verdict') { /* verdict clip is set once */ }
    else if (ending) perf.play(ending, {});
    else if (inOpp || S.phase === 'judge') perf.play('idle', {});
    else if (S.phase === 'pick') perf.play('battle', { bpm: S.bpm });
    else perf.play('beatbox', { bpm: S.bpm, phase: beat, amp: 0.7 + 0.3 * E, external: playing || S.phase === 'result' });
    if (!isArena) perf.lookAt(camera.position); perf.update(dt, t);
    if (inOpp && oppChar) { try { oppChar.play('beatbox', { bpm: S.bpm, phase: beat, amp: 0.7 + 0.3 * E, external: true }); } catch (e) { /* ignore */ } }
    crowd.update(dt, t, E, beat, S.punch);
    if (venue) venue.update(dt, t, { energy: E, beat, spb: S.spb, approach: S.approach, flee: S.flee }); else world.update(dt, t, { energy: E, beat, flee: S.flee });
    hw.update({ T: inOpp ? S.oppT : playing || S.phase === 'result' ? S.T : t * S.bpm / 60 * S.spb, spb: S.spb, approach: S.approach, notes: inOpp ? S.oppView : playing ? (S.call && S.call.length && S.phase === 'count' ? S.call.concat(S.notes) : S.notes) : [], press: S.press, energy: E, t });
    if (S.mode === 'train' && S.trainL && S.phase === 'play') { const b = S.T / S.spb - S.lead, st = Math.floor((((b % 4) + 4) % 4) * S.trainL.steps / 4 + 0.25); tui.patternStep(st); }
    fx.update(dt, t); ui.setEnergy(E); ui.setHud(S.phase !== 'vs' && S.phase !== 'judge' && S.phase !== 'verdict'); updateCamera(dt, t, E);
    lighting.update(dt, t); if (scene.fog) { scene.fog.near = 34; scene.fog.far = 150; }
  }
  // camera: attract/result cam orbits the stage, play cam sits behind and above the highway with a gentle sway and a kick zoom on the beat. The director (VS whip, judges, verdict) overrides it and eases back.
  function fovFor(aspect) { return clamp(2 * Math.atan(Math.tan(27 * Math.PI / 180) * (0.5625 / Math.max(0.3, aspect))) * 180 / Math.PI, 38, 72); }
  function updateCamera(dt, t, E) {
    const want = S.phase === 'count' && S.call && S.call.length && S.T / S.spb < S.cIn - 0.5 ? 0.3 : S.phase === 'count' || S.phase === 'play' || S.phase === 'between' || S.phase === 'opp' ? 1 : 0;   // training LISTEN: the camera drifts in on the hero S.camK += (want - S.camK) * (1 - Math.exp(-dt * 2.2)); const k = S.camK * S.camK * (3 - 2 * S.camK), sw = 0.4 + E * 0.6;
    const orbit = S.phase === 'result' ? 1 : 0, ox = Math.sin(t * 0.18) * (orbit ? 3.6 : 4.6), oy = (orbit ? 3.2 : 3.9) + Math.sin(t * 0.23) * 0.25, oz = orbit ? 3.2 : 6.0;
    camPos.set(lerp(ox, camBase.x + Math.sin(t * 0.45) * 0.38 * sw, k), lerp(oy, camBase.y + Math.sin(t * 0.33) * 0.14 * sw, k), lerp(oz, camBase.z - S.punch * 0.35, k));
    camLook.set(lerp(0, camAim.x + Math.sin(t * 0.5 + 1) * 0.22 * sw, k), lerp(orbit ? -1.5 : 2.0, camAim.y, k), lerp(orbit ? -11 : STAGE.z, camAim.z, k));
    if (S.shake && !reduce) { camPos.x += (Math.random() - 0.5) * S.shake * 0.25; camPos.y += (Math.random() - 0.5) * S.shake * 0.2; }
    let fov = fovFor(W / H) - S.punch * (2.2 + 2.4 * E) * (0.4 + 0.6 * k), swayZ = sw * k;
    // director shots (battle): blend over the default camera; when a shot list ends (a round starts) the weight decays so the camera glides back to the play cam
    const dc = dir.update(dt);
    if (dc) { lastDir = dc; dirW = 1; } else if (dirW > 0) dirW = Math.max(0, dirW - dt / 0.9);
    if (lastDir && dirW > 0) {
      const e = dc ? 1 : ease3(dirW), L = lastDir, sx = Math.sin(t * 0.35) * 0.25 * L.sway, sy = Math.sin(t * 0.27) * 0.08 * L.sway;
      camPos.set(lerp(camPos.x, L.p[0] + sx + (S.shake && !reduce ? (Math.random() - 0.5) * S.shake * 0.3 : 0), e), lerp(camPos.y, L.p[1] + sy, e), lerp(camPos.z, L.p[2], e)); camLook.set(lerp(camLook.x, L.l[0], e), lerp(camLook.y, L.l[1], e), lerp(camLook.z, L.l[2], e));
      const df = (L.fov || 50) * fovFor(W / H) / fovFor(0.5625); fov = lerp(fov, df, e); swayZ *= 1 - e;
    }
    if (S.camO) { camPos.set(S.camO.p[0], S.camO.p[1], S.camO.p[2]); camLook.set(S.camO.l[0], S.camO.l[1], S.camO.l[2]); }
    camera.position.copy(camPos); camera.lookAt(camLook); camera.rotateZ(Math.sin(t * 0.4) * 0.012 * swayZ);
    const f = S.camO && S.camO.fov ? S.camO.fov : fov; if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
  }

  // ------------------------------------------------------------------ public surface
  let acc = 0;
  function update(dt, t) { if (disposed) return; dt = Math.min(dt, 0.05); if (!S.manual) sim(dt); vis(dt); }
  function render() { const S2 = lighting.state; S2.gHigh.set('#fff8ee'); S2.gShadow.set('#f0eaff'); S2.sat = 1.3; if (!reduce) S2.bloom += 0.1 * S.energy + 0.1 * S.punch; lighting.post.update(time); lighting.render(); }
  function tick(sec) {
    S.manual = true; const n = Math.max(1, Math.round(sec * 120)), h = sec / n; for (let i = 0; i < n; i++) { sim(h); acc += h; if (acc >= 1 / 30) { vis(acc); acc = 0; } } if (acc > 0) { vis(acc); acc = 0; } S.ticks++;
    return state();
  }
  function state() {
    const T = S.phase === 'opp' ? S.oppT : S.T, up = []; for (const n of S.notes) { if (n.state) continue; const d = (n.time - S.T) * 1000; if (d > -400 && up.length < 8) up.push({ lane: n.lane, dtMs: Math.round(d * 10) / 10, id: n.id }); }
    let p = 0, g = 0, m = 0; S.hits.forEach((h) => { if (h.grade === 'perfect') p++; else if (h.grade === 'good') g++; else m++; });
    return { phase: S.phase, T, beat: S.spb ? T / S.spb : 0, bpm: S.bpm, spb: S.spb, combo: S.combo, maxCombo: S.maxCombo, score: Math.round(S.score), energy: S.energy, perfect: p, good: g, miss: m, notesTotal: S.notes.length, notesLeft: S.notes.filter((n) => !n.state).length, upcoming: up, round: S.round, windows: S.win, approach: S.approach, manual: S.manual, quality: q, offset: S.offset, venue: venueName || 'busk', mode: S.mode, audio: click.state(), train: S.mode === 'train' ? { level: S.trainL ? S.trainL.level : 0, unlocked: S.prog ? S.prog.unlocked : 1, best: Object.assign({}, S.prog ? S.prog.best : {}), lead: S.lead, callDone: (S.call || []).filter((n) => n.done).length, callTotal: (S.call || []).length } : null, crowd: { near: crowd.near.length, spectators: crowd.spectators }, fxLive: fx.count(),
      battle: S.battle ? { opp: S.battle.opp.name, myStyle: S.myStyle, oppStyle: S.oppStyleNow, oppQ: S.oppQ, oppMeter: S.oppMeter, oppNotes: S.oppView.length, oppHit: S.oppView.filter((n) => n.state === 1).length, reveal: S.reveal, tally: Object.assign({}, S.tally), roundQ: S.battle.roundQ.map((r) => ({ q: r.q, style: r.style })), verdict: S.verdict ? { win: !!S.verdict.win } : null } : null };
  }
  function resize(w, h) { W = w; H = h; ui.resize(w, h); lighting.resize(w, h, Math.min(window.devicePixelRatio || 1, 2)); camera.fov = fovFor(w / h); camera.updateProjectionMatrix(); }
  function dispose() {
    disposed = true; timers.forEach((id) => clearTimeout(id)); timers.clear(); window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis); stopMic(); click.musicOn(); tui.dispose(); ui.dispose();
    try { if (venue) venue.dispose(); } catch (e) { /* ignore */ } try { lighting.dispose(); } catch (e) { /* ignore */ } try { crowd.dispose(); } catch (e) { /* ignore */ } try { disposeTree(perf.object); perf.dispose(); } catch (e) { /* ignore */ }      // tree first (bone texture), then the character
    try { disposeTree(group); } catch (e) { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  }
  camera.fov = fovFor(0.5625); camera.near = 0.5; camera.far = 220; camera.updateProjectionMatrix(); update(0.016, 0.016); if (!game) showStartCard();
  if (opts.autostart || game) { ui.clearCard(); start(opts); }
  return { group, update, render, resize, setLook(l) { perf.setLook(mkLook(l)); }, start, dispose, press, tick, state, result: () => S.result, bot(b) { S.bot = { _o: b || {} }; if (S.notes.length) planBot(b || {}); return !!S.bot; }, quit, pick, setRewards, setTrainProgress, levels: () => S.levels || beatLevels(Core), click, perf, crowd, world: world || venue, venue, highway: hw, fx, lighting, ui, S, director: dir, forceEnergy(v) { S.forceEnergy = v; }, cam(p, l, fov) { S.camO = p ? { p, l, fov } : null; } };
}

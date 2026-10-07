// SHOWMANSHIP mini game (POSE) in low-poly 3D: a PaRappa style pose Simon Says on the Friday showcase stage.
//   Coach Vibe performs a phrase of moves on the shaker beat (step left, step right, duck, jump, point, spin, freeze, clap), each one called out big with an icon and a word.
//   Then it is YOUR TURN: repeat the phrase in the same order, one move per beat, with the big pads (or arrows, W A S D, Q E F and SPACE). The hero performs every move you press.
//   Timing: |dt| <= COOL 80 ms, GOOD 160 ms, else BAD inside the slot window; a wrong move or no move is a MISS. The crowd HYPE meter rises and falls with you; at zero you are booed off.
//   Each level has 4 rounds that grow (len-2, len-1, len, len remix). Levels come from Core.POSE_LEVELS (len 3..8, the move pool grows, bpm 90..132).
//   q = points / slots (COOL 1, GOOD 0.75, BAD 0.4). In the game the result becomes Core trainGame({stat:'show', game:'pose', level, q}) (r3/scenes_pose.js); q >= 0.7 unlocks the next level.
//   Music is OFF (Audio.gameMode), only the shaker metronome (Audio.shaker, scheduled ahead on the audio clock) and the move sounds play.
// createPose(ctx, opts) -> { group, update(dt,t), render(), resize(w,h,dpr), setLook(look), start(o), press(move), tick(sec), state(), result(), bot(o), select(), quit(), setRewards(rw), setUnlocked(n), dispose() }
//   opts: hud (DOM div), look, unlocked (highest playable level, default 1), level (preselect), autostart (start opts.level at once), embedded, again (false: the card only has CONTINUE),
//         settings (E.settings: muted, reduce), offsetMs, seed
//   events: 'minigame' {game:'pose', result}, 'quit' {game:'pose', finished}, 'minigameQuit'
import { THREE, rng as mkRng } from './kit.js';
import { MOVES, MOVE_IDS, KEYMAP, performMove } from './mg_pose_moves.js';
import { createPoseUI, LEVEL_NAMES } from './mg_pose_ui.js';
import { buildPoseStage, COACH_X, HERO_X, STAGE_H, SCALE } from './mg_pose_stage.js';

export const POSE = { COOL: 0.08, GOOD: 0.16, WIN_MAX: 0.3, WIN_SPB: 0.45, ROUNDS: 4, REVEAL_UPTO: 2, UNLOCK_Q: 0.7, HYPE0: 0.55,
  PTS: { cool: 1, good: 0.75, bad: 0.4, miss: 0, wrong: 0 }, HYPE: { cool: 0.05, good: 0.035, bad: -0.03, miss: -0.12, wrong: -0.2, early: -0.02, perfect: 0.08 } };
const FALLBACK_LEVELS = [3, 3, 4, 5, 5, 6, 7, 8].map((len, i) => ({ level: i + 1, len, moves: MOVE_IDS.slice(0, Math.min(8, 4 + i)), bpm: 90 + i * 6 }));
const BBH = () => (typeof window !== 'undefined' && window.BBH) || {};
export function poseLevels() { const C = BBH().Core; return C && Array.isArray(C.POSE_LEVELS) && C.POSE_LEVELS.length ? C.POSE_LEVELS : FALLBACK_LEVELS; }
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const COACH = 'COACH VIBE';

// the phrase of each round: rounds grow, the first three build on one phrase (Simon), the last one is a remix at full length; no move three times in a row,
// and the level's newest move is always in the phrase
export function makeRounds(L, seed) {
  const R = mkRng((seed || 1) * 7919 + L.level * 131), pool = L.moves.slice(), pick = () => pool[Math.floor(R() * pool.length)], fresh = L.moves[L.moves.length - 1];
  const phrase = (n) => { const s = []; for (let i = 0; i < n; i++) { let m = pick(), g = 0; while (g++ < 12 && i >= 1 && (m === s[i - 1] && (i >= 2 && m === s[i - 2] || R() < 0.6))) m = pick(); s.push(m); }
    if (s.indexOf(fresh) < 0 && n >= 2) s[1 + Math.floor(R() * (n - 1))] = fresh; for (let i = 2; i < n; i++) if (s[i] === s[i - 1] && s[i] === s[i - 2]) s[i] = pool[(pool.indexOf(s[i]) + 1) % pool.length]; return s; };
  const len = Math.max(2, L.len), lens = [Math.max(2, len - 2), Math.max(2, len - 1), len, len].slice(0, POSE.ROUNDS), master = phrase(len), out = [];
  lens.forEach((n, r) => { const remix = r === lens.length - 1 || (r > 0 && n === lens[r - 1]); out.push(remix ? phrase(n) : master.slice(0, n)); });
  return out;
}

export function createPose(ctx, opts) {
  opts = opts || {}; const { camera, events } = ctx, q = ctx.quality || 'high';
  const group = new THREE.Group(); group.name = 'mg_pose';
  const settings = opts.settings || {}, reduce = !!(opts.reduce || settings.reduce), embedded = !!opts.embedded;
  const stage = buildPoseStage(ctx, { look: opts.look, reduce }); group.add(stage.group);   // (the stage adds its group to ctx.scene itself; parenting it here keeps one tree for the host)
  stage.fx.group.position.y = STAGE_H;                                                        // sparks and confetti land on the deck
  const LV = poseLevels();
  const S = { phase: 'select', sub: 'select', level: clamp(opts.level | 0 || 1, 1, LV.length), unlocked: clamp(opts.unlocked | 0 || 1, 1, LV.length), cfg: null, bpm: 96, spb: 0.625, win: 0.28, t: 0, rounds: [], ri: -1, ev: [], evI: 0, tickI: 0, ticks: [],
    hype: POSE.HYPE0, points: 0, slots: 0, counts: { cool: 0, good: 0, bad: 0, miss: 0, wrong: 0, early: 0 }, marks: [], perfectRounds: 0, lost: false, result: null, rewards: null, manual: false, bot: null, doneT: 0, cardShown: false,
    endBeat: 0, offset: (+opts.offsetMs || 0) / 1000, seed: opts.seed || ((Date.now() / 1000) | 0), freeBeat: 0, aLast: 0, taught: 0, presses: 0, lastJudge: null, music: null };
  let clock = 0, disposed = false, W = 540, H = 960;
  const A = () => BBH().Audio || null;
  const sfx = (n, o) => { if (settings.muted) return; try { const a = A(); if (a && a.sfx) a.sfx(n, o); } catch (e) { /* audio must never break the game */ } };
  const drum = (l, o) => { if (settings.muted) return; try { const a = A(); if (a && a.drum) a.drum(l, o); } catch (e) { /* ignore */ } };
  const audioNow = () => { try { const a = A(); return a && a.now ? a.now() || 0 : 0; } catch (e) { return 0; } };
  function gameMode(on) { try { const a = A(); if (a && a.gameMode) a.gameMode(on, on ? { metronome: 0 } : { restore: true }); else if (on && a && a.music) a.music.stop(0.3); } catch (e) { /* ignore */ } }
  function shaker(accent, when) { if (settings.muted) return; try { const a = A(); if (a && a.shaker) a.shaker(!!accent, { when, vol: accent ? 1 : 0.8 }); else if (a && a.drum) a.drum(1, { vel: accent ? 0.5 : 0.3, when }); } catch (e) { /* ignore */ } }
  const ui = createPoseUI(opts.hud || (() => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;inset:0'; (ctx.canvas.parentElement || document.body).appendChild(d); return d; })(), {
    onMove: (id) => press(id, { ui: true }), onQuit: () => back(), onPick: (lv) => start({ level: lv }), onLocked: (lv) => { sfx('error'); ui.banner('LOCKED', 'SCORE 70% ON LEVEL ' + (lv - 1), '#ff9ab8', 1300); },
  });
  gameMode(true);

  // ------------------------------------------------------------------ flow
  function select() {
    S.phase = 'select'; S.sub = 'select'; S.result = null; S.cardShown = false; ui.hideCard(); ui.showSelect(LV, S.unlocked, S.level); stage.cut('sel', { force: true });
    stage.led([{ t: 'SHOWTIME', c: '#ffd23f', k: 1.1 }, { t: 'PICK A LEVEL', c: '#ff9ab8', k: 0.45 }]); stage.hero.setMood('neutral');
  }
  function start(o) {
    o = o || {}; const lv = clamp((o.level | 0) || S.level, 1, LV.length);
    if (lv > S.unlocked && !o.force) { if (ui.selectOpen()) sfx('error'); return false; }
    if (o.look) stage.setLook(o.look); if (o.seed) S.seed = o.seed; if (o.manual !== undefined) S.manual = !!o.manual; if (o.offsetMs !== undefined) S.offset = (+o.offsetMs || 0) / 1000;
    const L = LV[lv - 1]; S.level = lv; S.cfg = L; S.bpm = L.bpm; S.spb = 60 / L.bpm; S.win = Math.min(POSE.WIN_MAX, POSE.WIN_SPB * S.spb);
    const seqs = makeRounds(L, S.seed + (o.retry || 0)); let b = 2; S.rounds = seqs.map((seq, r) => { const n = seq.length, R = { r, seq, n, watch: b, teach: b + 2, cue: b + 2 + n, play: b + 4 + n, judge: b + 4 + 2 * n, end: b + 6 + 2 * n, res: new Array(n).fill(null), botP: new Array(n).fill(0) }; b = R.end; return R; });
    S.endBeat = b; S.slots = S.rounds.reduce((a, R) => a + R.n, 0);
    // timeline events (beats); equal beats fire in list order: deadlines before the judge
    const ev = []; S.rounds.forEach((R) => {
      ev.push({ b: R.watch, k: 'watch', R }); R.seq.forEach((m, i) => ev.push({ b: R.teach + i, k: 'teach', R, i })); ev.push({ b: R.cue, k: 'cue', R }); ev.push({ b: R.play - 0.5, k: 'open', R });
      R.seq.forEach((m, i) => ev.push({ b: R.play + i + S.win / S.spb, k: 'deadline', R, i })); ev.push({ b: R.judge, k: 'judge', R }); ev.push({ b: R.end - 0.001, k: 'roundEnd', R });
    });
    ev.push({ b: S.endBeat, k: 'finish' }); ev.sort((a, c) => a.b - c.b); S.ev = ev; S.evI = 0;
    const acc = {}; S.rounds.forEach((R) => { acc[R.watch] = acc[R.teach] = acc[R.play] = 1; }); S.ticks = []; for (let k = 0; k < S.endBeat; k++) S.ticks.push({ b: k, accent: !!acc[k] || k === 0 }); S.tickI = 0;
    Object.assign(S, { phase: 'run', sub: 'intro', t: -0.0001, ri: -1, hype: POSE.HYPE0, points: 0, counts: { cool: 0, good: 0, bad: 0, miss: 0, wrong: 0, early: 0 }, marks: [], perfectRounds: 0, lost: false, result: null, rewards: null, doneT: 0, cardShown: false, bot: o.bot ? normBot(o.bot) : null, taught: 0, presses: 0, aLast: 0, lastJudge: null });
    ui.hideSelect(); ui.hideCard(); ui.showPlayHud(true); ui.setPads(L.moves, 'wait'); ui.strip([], -1, false);
    ui.banner('LEVEL ' + lv, (LEVEL_NAMES[lv - 1] || '') + '  ' + L.bpm + ' BPM', '#ffd23f', 1500); stage.cut('duo', { blend: 0.7, force: true });
    stage.led([{ t: 'LEVEL ' + lv, c: '#ffd23f', k: 1.1 }, { t: LEVEL_NAMES[lv - 1] || 'SHOWTIME', c: '#ff9ab8', k: 0.45 }]);
    stage.hero.setMood('happy'); stage.coach.setMood('happy'); gameMode(true); sfx('countdown');
    return true;
  }
  function normBot(b) { if (b === true || b === undefined) return { mode: 'perfect' }; if (typeof b === 'string') return { mode: b }; return Object.assign({ mode: b.wrong ? 'wrong' : 'perfect' }, b); }
  function back() {
    if (disposed) return;
    if (!embedded && S.phase === 'run') { select(); return; }                     // standalone page: BACK in a run goes to the level select
    quit();
  }
  function quit() { if (disposed) return; events.emit('quit', { game: 'pose', finished: S.phase === 'done' }); events.emit('minigameQuit'); }

  // ------------------------------------------------------------------ timeline
  const curRound = () => S.rounds[S.ri] || null;
  function fire(e) {
    const R = e.R;
    switch (e.k) {
      case 'watch': {
        S.ri = R.r; S.sub = 'watch'; S.taught = 0; stage.cut('coach'); ui.setPads(S.cfg.moves, 'wait'); ui.strip(R.seq.map(() => ({ move: null, grade: null })), -1, false);
        ui.banner(R.r === S.rounds.length - 1 ? 'REMIX!' : 'WATCH!', COACH + ' SHOWS ' + R.n + ' MOVES', R.r === S.rounds.length - 1 ? '#ff8a3d' : '#2ee6ff', 2 * S.spb * 1000 + 200);
        stage.led([{ t: R.r === S.rounds.length - 1 ? 'REMIX' : 'WATCH', c: '#2ee6ff', k: 1.1 }, { t: 'ROUND ' + (R.r + 1) + ' OF ' + S.rounds.length, c: '#fff6e8', k: 0.45 }]);
        stage.coach.setMood('happy'); break;
      }
      case 'teach': {
        S.sub = 'teach'; const m = R.seq[e.i]; S.taught = e.i + 1; performMove(stage.coach, m, S.spb); moveFx('coach', m, 0.65); ui.callout(m, COACH, 'R'); stage.punch(0.7, m === 'spin' ? 0.6 : 0);
        ui.strip(R.seq.map((mm, i) => ({ move: i <= e.i ? mm : null, grade: null })), e.i, true); stage.led([{ t: MOVES[m].word, c: MOVES[m].color, k: 1.15 }, { t: (e.i + 1) + ' / ' + R.n, c: '#fff6e8', k: 0.42 }]); break;
      }
      case 'cue': {
        S.sub = 'cue'; stage.cut('hero'); ui.setPads(S.cfg.moves, 'live'); ui.strip(R.seq.map((mm) => ({ move: mm, grade: null })), 0, S.level <= POSE.REVEAL_UPTO);
        ui.banner('YOUR TURN!', 'SAME ORDER, ON THE BEAT', '#ffd23f', 2 * S.spb * 1000 + 150); stage.led([{ t: 'YOUR TURN', c: '#ffd23f', k: 1.1 }, { t: R.n + ' MOVES', c: '#fff6e8', k: 0.45 }]);
        stage.coach.play('cheer', { duration: Math.min(0.9, S.spb * 1.4), then: 'pz_groove' }); sfx('swoosh', { vol: 0.6 }); break;
      }
      case 'open': S.sub = 'play'; break;
      case 'deadline': if (!R.res[e.i]) judgeSlot(R, e.i, 'miss', null, null); break;
      case 'judge': {
        S.sub = 'judge'; const g = R.res.map((x) => (x ? x.grade : 'miss')), clean = g.every((x) => x === 'cool' || x === 'good'), allCool = g.every((x) => x === 'cool'), right = g.every((x) => x !== 'miss' && x !== 'wrong');
        S.marks[R.r] = right ? 1 : 0;
        if (clean) {
          S.perfectRounds++; S.hype = clamp(S.hype + POSE.HYPE.perfect, 0, 1); stage.cut('hype'); ui.banner(allCool ? 'PERFECT!' : 'GREAT ROUND!', allCool ? 'EVERY MOVE COOL' : 'THE CROWD LOVES IT', '#7dff6a', 2 * S.spb * 1000);
          confetti(allCool ? 90 : 55); if (stage.venue && stage.venue.cheer) { try { stage.venue.cheer(allCool ? 2.2 : 1.4); } catch (x) { /* ignore */ } } if (stage.front) stage.front.cheer(1.6); sfx('crowd_cheer'); sfx(allCool ? 'levelup' : 'combo', { n: 4 });
          stage.hero.play('cheer', { duration: Math.min(1.1, S.spb * 1.8), then: 'pz_groove' }); stage.coach.play('cheer', { duration: Math.min(1.1, S.spb * 1.8), then: 'pz_groove' }); stage.hero.setMood('happy');
          stage.led([{ t: allCool ? 'PERFECT' : 'GREAT', c: '#7dff6a', k: 1.15 }, { t: 'ROUND ' + (R.r + 1), c: '#fff6e8', k: 0.45 }]);
        } else {
          stage.cut('wide'); ui.banner(right ? 'NICE!' : 'OOPS!', right ? 'TIGHTEN THE TIMING' : 'WATCH THE ORDER', right ? '#2ee6ff' : '#ff9ab8', 2 * S.spb * 1000);
          if (right) sfx('hit_good'); else { stage.coach.setMood('sad'); stage.hero.setMood('sad'); }
        }
        ui.setPads(S.cfg.moves, 'wait'); break;
      }
      case 'roundEnd': stage.hero.setMood('happy'); stage.coach.setMood('happy'); break;
      case 'finish': finish(false); break;
      default: break;
    }
  }
  // slot judgement. grade: cool | good | bad | miss | wrong
  function judgeSlot(R, j, grade, dt, move) {
    if (R.res[j]) return; R.res[j] = { grade, dt, move }; S.counts[grade]++; S.points += POSE.PTS[grade] || 0; S.hype = clamp(S.hype + (POSE.HYPE[grade] || 0), 0, 1); S.lastJudge = { r: R.r, i: j, grade, dt, move };
    const next = R.res.findIndex((x) => !x); ui.strip(R.seq.map((m, i) => ({ move: m, grade: R.res[i] ? R.res[i].grade : null })), next, S.level <= POSE.REVEAL_UPTO);
    ui.judge(grade, grade === 'wrong' ? 'WRONG MOVE' : null, 'L');
    const hx = HERO_X, hy = SCALE * 1.15;
    if (grade === 'cool' || grade === 'good') { stage.fx.burst(hx, hy, 0.4, grade === 'cool' ? 26 : 14, { colors: [MOVES[R.seq[j]].color, '#fff6e8', '#ffd23f'], speed: 3.4, up: 1.6, life: 0.6, size: 0.3, grav: 4 }); if (stage.front && grade === 'cool') stage.front.cheer(0.5); stage.punch(grade === 'cool' ? 1 : 0.6); sfx(grade === 'cool' ? 'hit_perfect' : 'hit_good', { vol: 0.55 }); }
    else if (grade === 'bad') { sfx('hit_good', { vol: 0.35, pitch: 0.7 }); }
    else { sfx(grade === 'wrong' ? 'crowd_boo' : 'miss', { vol: grade === 'wrong' ? 0.55 : 0.8 }); stage.shake(grade === 'wrong' ? 1 : 0.6); stage.hero.setMood('sad'); if (!move) stage.hero.play('hit', { power: 0.5 }); }
    if (S.hype <= 0 && !S.lost && S.phase === 'run') finish(true);
  }
  function confetti(n) { stage.fx.confettiBurst(n, 0, 3.6, 0.8, 7, 3.5); stage.fx.confettiBurst(Math.round(n * 0.5), 0, 3.2, 4.5, 8, 3); }
  function moveFx(who, m, vol) {
    const x = who === 'coach' ? COACH_X : HERO_X, M = MOVES[m], v = vol === undefined ? 1 : vol;
    if (m === 'left' || m === 'right') { drum(0, { vel: 0.55 * v }); sfx('step', { vol: 0.8 * v, pitch: m === 'right' ? 1.2 : 1 }); }
    else if (m === 'duck') sfx('swoosh', { vol: 0.8 * v, pitch: 0.75 });
    else if (m === 'jump') { sfx('whoosh', { vol: 0.6 * v, pitch: 1.5 }); stage.fx.ring(x, 0, M.color, 1.6); }
    else if (m === 'point') { drum(2, { vel: 0.6 * v }); sfx('hit_good', { vol: 0.5 * v, pitch: 1.35 }); stage.fx.burst(x + (who === 'coach' ? -0.75 : -0.6), SCALE * 1.45, 0.3, 10, { colors: [M.color, '#fff6e8'], speed: 2.2, life: 0.45, size: 0.26, grav: 1 }); }
    else if (m === 'spin') { sfx('whoosh', { vol: 0.75 * v }); for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; stage.fx.spark(x + Math.cos(a) * 0.7, 0.4 + (i % 3) * 0.4, Math.sin(a) * 0.7, -Math.sin(a) * 3, 1.2, Math.cos(a) * 3, 0.5, 0.24, M.color, 1, 1.5); } }
    else if (m === 'freeze') { drum(2, { vel: 0.85 * v }); sfx('sparkle', { vol: 0.8 * v }); stage.fx.burst(x, SCALE * 0.9, 0.2, 22, { colors: ['#bff3ff', '#ffffff', '#7fd8ff'], speed: 2.6, up: 0.4, life: 0.7, size: 0.26, grav: 0.5, sphere: true }); if (who === 'hero') ui.flashColor('rgba(160,230,255,.38)'); }
    else if (m === 'clap') { drum(3, { vel: 0.95 * v }); stage.fx.burst(x, SCALE * 1.4, 0.25, 16, { colors: ['#fff2a8', '#ffffff', '#ffd23f'], speed: 3, up: 0.6, life: 0.4, size: 0.24, grav: 2 }); }
  }

  // ------------------------------------------------------------------ input
  function press(move, o) {
    o = o || {}; if (disposed || !MOVES[move]) return null;
    if (S.phase !== 'run' || !S.cfg || S.cfg.moves.indexOf(move) < 0) return null;
    S.presses++; performMove(stage.hero, move, S.spb); moveFx('hero', move, 1); if (!o.ui) ui.pressVisual(move); stage.punch(0.45, move === 'spin' ? -0.7 : 0);
    const R = curRound(); let grade = 'watch', j = -1, dt = 0;
    if (R && (S.sub === 'cue' || S.sub === 'play' || S.sub === 'judge')) {
      j = R.res.findIndex((x) => !x);
      if (j >= 0) { const slotT = (R.play + j) * S.spb; dt = (S.t - S.offset) - slotT; if (dt < -S.win) grade = 'early'; else if (move !== R.seq[j]) grade = 'wrong'; else grade = Math.abs(dt) <= POSE.COOL ? 'cool' : Math.abs(dt) <= POSE.GOOD ? 'good' : 'bad'; }
      else grade = 'done';
    }
    ui.callout(move, 'YOU', 'L');
    if (grade === 'early') { S.counts.early++; S.hype = clamp(S.hype + POSE.HYPE.early, 0, 1); ui.judge('early', null, 'L'); ui.flashPad(move, false); }
    else if (grade === 'watch') { ui.judge('watch', null, 'L'); }
    else if (grade !== 'done') { judgeSlot(R, j, grade, dt, move); ui.flashPad(move, grade !== 'wrong'); if (grade === 'cool' || grade === 'good') stage.hero.setMood('happy'); }
    return { grade, slot: j, dt };
  }
  const onKey = (e) => {
    if (e.repeat) return; const m = KEYMAP[e.code];
    if (m && S.phase === 'run') { e.preventDefault(); press(m); return; }
    if ((e.code === 'Enter' || e.code === 'Space') && S.phase === 'select' && ui.selectOpen()) { e.preventDefault(); start({ level: Math.min(S.unlocked, S.level) }); }
    if (e.code === 'Escape') { e.preventDefault(); back(); }
  };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);

  // ------------------------------------------------------------------ result
  function finish(lost) {
    if (S.phase !== 'run') return; S.phase = 'done'; S.sub = 'done'; S.lost = !!lost; S.doneT = 0;
    const qv = S.slots ? clamp(S.points / S.slots, 0, 1) : 0, passed = !lost && qv >= POSE.UNLOCK_Q, grade = qv >= 0.95 ? 'S' : qv >= 0.85 ? 'A' : qv >= 0.7 ? 'B' : qv >= 0.5 ? 'C' : 'D';
    const unlockedNow = passed && S.level === S.unlocked && S.level < LV.length ? S.level + 1 : 0;
    S.result = { game: 'pose', stat: 'show', level: S.level, q: Math.round(qv * 1000) / 1000, score: Math.round(qv * 100), grade, passed, unlocked: unlockedNow, lost: S.lost, cool: S.counts.cool, good: S.counts.good, bad: S.counts.bad, miss: S.counts.miss, wrong: S.counts.wrong, early: S.counts.early,
      slots: S.slots, rounds: S.rounds.length, roundsPlayed: Math.max(0, S.ri + 1), perfectRounds: S.perfectRounds, bpm: S.bpm, len: S.cfg.len, moves: S.cfg.moves.slice() };
    if (unlockedNow && !embedded) S.unlocked = unlockedNow;                       // standalone: unlock locally; in the game the save (Core trainGame) decides, see setUnlocked
    ui.setPads(S.cfg.moves, 'hidden'); ui.strip([], -1, false); stage.cut(lost ? 'wide' : 'result', { force: true });
    if (lost) { ui.banner('BOOED OFF!', 'KEEP THE ORDER, STAY ON THE BEAT', '#ff5a7a', 1800); sfx('crowd_boo'); sfx('lose'); stage.hero.play('sad', { duration: 6, then: 'idle' }); stage.coach.setMood('sad'); stage.led([{ t: 'BOO!', c: '#ff5a7a', k: 1.1 }, { t: 'TRY AGAIN', c: '#fff6e8', k: 0.45 }]); }
    else { const good = passed; ui.banner(good ? 'SHOWSTOPPER!' : 'SHOW OVER', Math.round(qv * 100) + '%', good ? '#7dff6a' : '#ffd23f', 1800); sfx(good ? 'win' : 'confirm'); if (good) { sfx('applause'); confetti(110); if (stage.venue && stage.venue.pyro) { try { stage.venue.pyro(2.2); } catch (x) { /* ignore */ } } if (stage.front) stage.front.cheer(3); }
      stage.hero.play(good ? 'cheer' : 'idle', { duration: 6, then: 'idle' }); stage.coach.play(good ? 'cheer' : 'talk', { duration: 6, then: 'idle' }); stage.led([{ t: good ? 'SHOWSTOPPER' : 'SHOW OVER', c: good ? '#7dff6a' : '#ffd23f', k: 1.05 }, { t: Math.round(qv * 100) + '%', c: '#fff6e8', k: 0.5 }]); }
    events.emit('minigame', { game: 'pose', result: S.result });                  // the game commits Core trainGame here and hands the real rewards back (setRewards) before the card shows
  }
  function showCard() {
    if (S.cardShown || !S.result) return; S.cardShown = true; const r = S.result;
    const btns = opts.again === false ? [['CONTINUE', () => quit()]] : [['AGAIN', () => start({ level: r.level, retry: (S.presses % 97) + 1 })], ['LEVELS', () => select(), 'alt']];
    if (opts.again !== false && r.unlocked) btns.unshift(['NEXT', () => start({ level: r.unlocked })]);
    ui.card(r, S.rewards, btns);
  }

  // ------------------------------------------------------------------ simulation
  const DT = 1 / 120;
  function step(dt) {
    clock += dt;
    if (S.phase === 'run') {
      S.t += dt;
      // the shaker: scheduled ~0.1 s ahead on the audio clock so it is sample accurate; sim events fire on time
      const aNow = audioNow(), base = aNow - S.t;
      while (S.tickI < S.ticks.length && S.ticks[S.tickI].b * S.spb <= S.t + 0.1) { const k = S.ticks[S.tickI++]; shaker(k.accent, aNow > 0 ? Math.max(aNow, base + k.b * S.spb) : 0); }
      while (S.evI < S.ev.length && S.ev[S.evI].b * S.spb <= S.t) { fire(S.ev[S.evI++]); if (S.phase !== 'run') break; }
      if (S.bot && S.phase === 'run') botStep();
    } else if (S.phase === 'done') { S.doneT += dt; if (S.doneT > 1.6 && !S.cardShown) showCard(); }
    else S.freeBeat += dt * 96 / 60;
  }
  function botStep() {
    const R = curRound(); if (!R || (S.sub !== 'cue' && S.sub !== 'play')) return; const j = R.res.findIndex((x) => !x); if (j < 0 || R.botP[j]) return;
    const at = (R.play + j) * S.spb + S.offset + (S.bot.lag || 0); if (S.t < at) return; R.botP[j] = 1;
    let m = R.seq[j]; if (S.bot.mode === 'wrong') { const pool = S.cfg.moves, alt = R.seq[(j + 1) % R.n]; m = alt !== m ? alt : pool[(pool.indexOf(m) + 1) % pool.length]; }
    else if (S.bot.mode === 'skip') return;
    press(m);
  }
  const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
  function vis(dt) {
    const beat = S.phase === 'run' ? Math.max(0, S.t / S.spb) : S.phase === 'done' ? S.endBeat + S.doneT * S.bpm / 60 : S.freeBeat;
    const active = S.phase === 'run' ? (S.sub === 'watch' || S.sub === 'teach' ? 'coach' : S.sub === 'intro' ? null : 'hero') : S.phase === 'done' ? 'hero' : null;
    stage.coach.anchors.head.getWorldPosition(tv); stage.hero.anchors.head.getWorldPosition(tv2);
    const lookCoach = active === 'hero' ? tv2 : camera.position, lookHero = active === 'coach' ? tv : camera.position;
    stage.update(dt, clock, { beat, energy: S.phase === 'select' ? 0.35 : 0.2 + 0.75 * S.hype, active, bpm: S.phase === 'run' ? S.bpm : 96, lookCoach, lookHero });
    stage.camera(dt, clock, reduce);
    if (S.phase === 'run' || S.phase === 'done') ui.setTop({ level: S.level, bpm: S.bpm, round: S.ri, rounds: S.rounds.length, marks: S.marks, hype: S.hype });
  }
  function advance(sec) { let left = sec; while (left > 1e-7) { const d = Math.min(DT, left); left -= d; step(d); } }
  function stateOut() {
    const R = curRound(), a = A();
    return { phase: S.phase, sub: S.sub, level: S.level, unlocked: S.unlocked, levels: LV.length, bpm: S.bpm, spb: S.spb, win: S.win, t: S.t, beat: S.spb ? S.t / S.spb : 0, endBeat: S.endBeat,
      round: S.ri, rounds: S.rounds.length, seq: R ? R.seq.slice() : [], seqs: S.rounds.map((x) => x.seq.slice()), slot: R ? R.res.findIndex((x) => !x) : -1, results: R ? R.res.map((x) => (x ? x.grade : null)) : [],
      hype: S.hype, points: S.points, slots: S.slots, q: S.slots ? S.points / S.slots : 0, counts: Object.assign({}, S.counts), marks: S.marks.slice(), perfectRounds: S.perfectRounds, lost: S.lost, manual: S.manual, bot: S.bot ? S.bot.mode : null,
      cardOpen: ui.hasCard(), selectOpen: ui.selectOpen(), coachClip: stage.coach.anim.clip, heroClip: stage.hero.anim.clip, shot: stage.shot(), quality: q, offsetMs: Math.round(S.offset * 1000), rewards: S.rewards, embedded,
      music: a && a.music && a.music.current ? a.music.current() : null, gameMode: !!(a && a.isGameMode && a.isGameMode()), lastJudge: S.lastJudge, moves: S.cfg ? S.cfg.moves.slice() : [], taught: S.taught };
  }

  const api = {
    group,
    // manual (tests, screenshots): the run and every animation advance only through tick(), so a state and a frame are deterministic
    update(dt) { if (disposed) return; dt = Math.min(dt || 0, 0.1); if (S.manual && S.phase === 'run') { S.aLast = 0; return; } let d = dt; const now = audioNow(); if (S.phase === 'run' && now > 0 && S.aLast > 0 && now > S.aLast) d = Math.min(0.1, now - S.aLast); S.aLast = now; advance(d); vis(dt); },
    render() { stage.render(); },
    resize(w, h, dpr) { W = w; H = h; stage.resize(w, h, dpr); ui.resize(w, h); },
    setLook(l) { stage.setLook(l); },
    start, press: (m) => press(m), select, quit, back,
    tick(sec) { let left = Math.max(0, sec || 0); do { const d = Math.min(0.05, left); advance(d); vis(d); left -= d; } while (left > 1e-7); },
    bot(o) { S.bot = normBot(o); return S.bot; },
    state: stateOut, result: () => S.result,
    setRewards(rw) { S.rewards = rw || null; if (S.cardShown && S.result) { S.cardShown = false; showCard(); } },
    setUnlocked(n) { S.unlocked = clamp(n | 0 || 1, 1, LV.length); if (S.result && S.result.unlocked && S.unlocked < S.result.unlocked) S.result.unlocked = 0; if (ui.selectOpen()) ui.showSelect(LV, S.unlocked, S.level); },
    stats() { return stage.stats(); }, cut: (n) => stage.cut(n, { force: true }),
    levels: () => LV.map((L) => Object.assign({}, L)), POSE,
    dispose() {
      if (disposed) return; disposed = true; if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
      try { ui.dispose(); } catch (e) { /* ignore */ } try { stage.dispose(); } catch (e) { /* ignore */ } if (group.parent) group.parent.remove(group);
      try { const a = A(); if (a && a.gameMode && a.isGameMode && a.isGameMode()) a.gameMode(false, { restore: true }); } catch (e) { /* ignore */ }
    },
  };
  // preselect / autostart from the caller, else the level select
  S.level = clamp(Math.min(S.level, S.unlocked), 1, LV.length);
  if (opts.autostart && (opts.level | 0) >= 1 && (opts.level | 0) <= S.unlocked) start({ level: opts.level | 0 }); else select();
  vis(0.016);
  return api;
}

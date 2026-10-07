// BEATBOX HEROES r3 -- scenes_train.js (TRAIN). Skill training: the TRAINING MENU, IDLE training and the EAR TRAINING scene (TRAINING_PLAN).
// Classic script, loaded after r3/scenes_mini.js. Works in 3D (?r=3d) and in 2D: the menu is DOM inside the place scene's own sheet, so the camera inset,
// the spot cinematic (the hero stays at the booth while the sheet is open) and the X button all keep working.
//   G.trainMenu(S, where, title?)   open the menu at a training spot (home booth -> 'home', Sound Lab mic -> 'studio'). Pick a skill, then
//       IDLE TRAINING  15 min .. 4 h. The hero practises in the room (a clip that fits the skill), the clock runs fast, "+0.3 MUSICALITY" pops tick up one by one
//                      (one per Core 'trainTick' fx) with a soft chime, a progress ring, STOP any time (only the minutes practised are spent), a summary card.
//                      The real action is Core {t:'trainIdle', stat, minutes, where}; the ticks are previewed on a copy of the save and committed once (STOP commits less).
//       PLAY           the active game at an unlocked level (x2 gains, less time): Musicality -> EAR TRAINING (E.go('ear')) or SINGING (E.go('tuner', {train})),
//                      Technicality -> E.go('rhythm', {mode:'train', level}), Originality -> E.go('seq', {train:true}), Showmanship -> E.go('pose', {level}).
//                      A scene that does not exist yet answers with a "coming soon" toast and the IDLE picker. Results go through Core {t:'trainGame'}.
//                      For rhythm / pose the args also carry onDone(res) / onAbort(): a scene that commits trainGame itself must not call onDone (res.held skips it).
//       2D: the same menu; PLAY uses the 2D games that exist (singing tuner, the old rhythm drill for Technicality and Showmanship, the Beat Maker); ear training is 3D only.
//   E.scenes3d.ear                  world 'ear' (park3d/mg_ear.js): music off (Audio.gameMode), lesson card, rounds, result -> G.doHold({t:'trainGame', stat:'mus', game:'ear', level, q, where}).
//   BBH.Train                       test hooks: speed (idle playback multiplier), last (the last idle session: {stat, minutes, ticks, pops, done}), open, idle, stop, ui.
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH && (BBH.Eng || BBH.E), Core = BBH && BBH.Core;
  if (!E || !Core || !E.h) return;
  const G = BBH.G = BBH.G || {}, h = E.h, R3 = BBH.R3;
  const T = BBH.Train = BBH.Train || {};
  const safe = (fn) => { try { return fn(); } catch (e) { console.error('[train]', e); return undefined; } };
  const is3d = () => !!(R3 && R3.on && document.body.classList.contains('r3'));
  const CFG = () => Core.TRAIN_CFG || { idleMinStep: 15, idleMaxMinutes: 240, playMul: 2, playMinutes: { ear: 20, tune: 20, beat: 20, make: 25, pose: 20 }, levelMax: 8, energyPerHour: 12, unlockQ: 0.7 };
  const STATS = Core.STATS || ['mus', 'tech', 'ori', 'show'], NAME = (st) => (Core.STAT_NAMES && Core.STAT_NAMES[st]) || st;
  const COL = { mus: '#2ee6ff', tech: '#ffd23f', ori: '#ff5cb0', show: '#9dff4a' };
  const SHORT = { mus: 'MUS', tech: 'TECH', ori: 'ORI', show: 'SHOW' };
  const GAME = { mus: 'ear', tech: 'beat', ori: 'make', show: 'pose' };
  const GAME_NAME = { ear: 'Ear training', tune: 'Singing', beat: 'Rhythm training', make: 'Beat Maker', pose: 'Pose game' };
  const PLAY_BLURB = { mus: 'Ear training or singing', tech: 'Real beatbox patterns, in time', ori: 'Make your own beat', show: 'Strike the poses, Simon Says' };
  const IDLE_BLURB = { mus: 'Hum scales and match notes', tech: 'Drill your kicks and snares', ori: 'Scribble beat ideas', show: 'Practise your stage moves' };
  // the hero's practice clips in the 3D room, cycled every few seconds (characters.js clips)
  const CLIPS = { mus: ['talk', 'talk', 'beatbox'], tech: ['beatbox', 'battle', 'beatbox'], ori: ['point', 'beatbox', 'talk'], show: ['dance', 'wave', 'cheer', 'dance'] };
  const MINS = [15, 30, 60, 120, 180, 240];
  T.speed = T.speed || 1; T.TICK = 0.62;
  const icon = (n, px) => (BBH.R3Icons ? BBH.R3Icons.svg(n, px || 22) : '');
  const fmtMin = (m) => (m < 60 ? m + ' min' : (m % 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : (m / 60) + ' h'));
  const clock = (m) => { if (Core.clock) return Core.clock(m); const mm = (((Math.round(m) + 360) % 1440) + 1440) % 1440; return String(Math.floor(mm / 60)).padStart(2, '0') + ':' + String(mm % 60).padStart(2, '0'); };   // save minutes count from 06:00
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const sfx = (n, o) => { try { E.sfx(n, o); } catch (e) { /* ignore */ } };
  const gameMode = (on) => { try { const A = BBH.Audio; if (A && A.gameMode) A.gameMode(on, { metronome: 0 }); else if (on) E.A().music.stop(0.3); } catch (e) { /* ignore */ } };
  const idleGain = (ch, st, m, where) => { try { if (Core.idleGain) return Core.idleGain(ch, st, m, where); } catch (e) { /* ignore */ } return (m / 60) * (1 - ch.stats[st] / 120) * (where === 'studio' ? 1.4 : 1); };
  const playGain = (ch, st, game, lv, q, where) => { try { if (Core.playGain) return Core.playGain(ch, st, game, lv, q, where); } catch (e) { /* ignore */ } return idleGain(ch, st, CFG().playMinutes[game] || 20, where) * 2; };
  const trainLv = (game) => { const tl = G.ch && G.ch.trainLv; return Math.max(1, Math.min(CFG().levelMax || 8, (tl && tl[game]) | 0 || 1)); };
  const hasScene = (n) => !!(E.pickScene && E.pickScene(n));

  /* ------------------------------------------------------------------ CSS (real px via --q = 1 px in #ui units, so the same rules work in 2D and 3D) */
  const CSS = `
.trn{--q:1px;display:flex;flex-direction:column;gap:calc(var(--q)*8);font-family:var(--f3,'Trebuchet MS',system-ui,sans-serif);color:#fff6e8;padding-bottom:calc(var(--q)*4)}
.trn *{box-sizing:border-box}
.trn button{font:inherit;color:inherit;border:0;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.trn button:focus-visible{outline:calc(var(--q)*3) solid #2ee6ff;outline-offset:calc(var(--q)*2)}
.trn .lbl{font-weight:700;font-size:calc(var(--q)*12);letter-spacing:.14em;color:#b9aee6;text-transform:uppercase}
.trn .skills{display:grid;grid-template-columns:repeat(4,1fr);gap:calc(var(--q)*6)}
.trn .sk{position:relative;display:flex;flex-direction:column;align-items:center;gap:calc(var(--q)*1);padding:calc(var(--q)*6) calc(var(--q)*2) calc(var(--q)*6);border-radius:calc(var(--q)*14);background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 calc(var(--q)*1.5) rgba(255,255,255,.12);transition:transform .08s,background .15s}
.trn .sk svg{width:calc(var(--q)*20);height:calc(var(--q)*20)}
.trn .sk b{font-size:calc(var(--q)*12);letter-spacing:.08em}
.trn .sk i{font-style:normal;font-weight:700;font-size:calc(var(--q)*19);line-height:1}
.trn .sk u{display:block;width:80%;height:calc(var(--q)*4);border-radius:9px;background:rgba(0,0,0,.35);overflow:hidden}.trn .sk u s{display:block;height:100%;background:var(--c)}
.trn .sk.on{background:color-mix(in srgb,var(--c) 26%,transparent);box-shadow:inset 0 0 0 calc(var(--q)*2.5) var(--c),0 0 calc(var(--q)*14) color-mix(in srgb,var(--c) 45%,transparent)}
.trn .sk:active{transform:scale(.96)}
.trn .duo{display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--q)*10)}
.trn .big{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:calc(var(--q)*6);min-height:calc(var(--q)*100);padding:calc(var(--q)*9) calc(var(--q)*11) calc(var(--q)*10);border-radius:calc(var(--q)*20);text-align:left;transition:transform .08s}
.trn .big:active{transform:translateY(calc(var(--q)*3))}
.trn .big .ic{flex:none;width:calc(var(--q)*34);height:calc(var(--q)*34);border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.5)}
.trn .big .ic svg{width:calc(var(--q)*22);height:calc(var(--q)*22)}
.trn .big .tx{min-width:0}
.trn .big .tx b{display:block;font-weight:700;font-size:calc(var(--q)*20);letter-spacing:.06em;line-height:1.05}
.trn .big .tx span{display:block;margin-top:calc(var(--q)*3);font-weight:500;font-size:calc(var(--q)*13);line-height:1.25;opacity:.88}
.trn .big .tag{position:absolute;right:calc(var(--q)*9);top:calc(var(--q)*10);padding:calc(var(--q)*4) calc(var(--q)*8);border-radius:99px;font-weight:700;font-size:calc(var(--q)*12);letter-spacing:.06em;background:rgba(26,15,51,.85);color:#ffd23f}
.trn .big.idle{color:#1a0f33;background:linear-gradient(#d9ccff,#9d86f0);box-shadow:0 calc(var(--q)*4) 0 #4c3d8f,0 calc(var(--q)*6) calc(var(--q)*14) rgba(10,5,30,.45)}
.trn .big.play{color:#2a1648;background:linear-gradient(#ffe066,#f5a623);box-shadow:0 calc(var(--q)*4) 0 #8a5a00,0 calc(var(--q)*6) calc(var(--q)*14) rgba(10,5,30,.45)}
.trn .big.dis{filter:grayscale(.8);opacity:.55}
.trn .note{font-weight:500;font-size:calc(var(--q)*12);line-height:1.3;color:#d3c6f4;text-align:center}
.trn .head{display:flex;align-items:center;gap:calc(var(--q)*8)}
.trn .head .bk{flex:none;height:calc(var(--q)*40);padding:0 calc(var(--q)*12);border-radius:calc(var(--q)*12);background:rgba(255,255,255,.1);font-weight:700;font-size:calc(var(--q)*12);letter-spacing:.1em}
.trn .head .ttl{flex:1;min-width:0;font-weight:700;font-size:calc(var(--q)*17);letter-spacing:.06em;color:var(--c)}
.trn .head .ttl small{display:block;font-size:calc(var(--q)*12);letter-spacing:.08em;color:#d3c6f4;font-weight:500}
.trn .chips{display:grid;grid-template-columns:repeat(3,1fr);gap:calc(var(--q)*7)}
.trn .chips.l8{grid-template-columns:repeat(4,1fr)}
.trn .chip{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--q)*1);min-height:calc(var(--q)*52);border-radius:calc(var(--q)*14);background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 calc(var(--q)*1.5) rgba(255,255,255,.14);font-weight:700;font-size:calc(var(--q)*16)}
.trn .chip small{font-size:calc(var(--q)*12);font-weight:700;color:#9dff4a}
.trn .chip.on{background:color-mix(in srgb,var(--c) 30%,transparent);box-shadow:inset 0 0 0 calc(var(--q)*2.5) var(--c)}
.trn .chip.lock{opacity:.4}
.trn .chip.lock small{color:#ff9ad0}
.trn .chip svg{width:calc(var(--q)*14);height:calc(var(--q)*14)}
.trn .seg{display:flex;gap:calc(var(--q)*7)}.trn .seg .chip{flex:1;font-size:calc(var(--q)*14);letter-spacing:.06em}
.trn .sum{display:flex;justify-content:center;flex-wrap:wrap;gap:calc(var(--q)*6) calc(var(--q)*12);font-weight:700;font-size:calc(var(--q)*13);color:#e6dcff}
.trn .sum b{color:#9dff4a}
.trn .go{min-height:calc(var(--q)*56);border-radius:calc(var(--q)*18);font-weight:700;font-size:calc(var(--q)*18);letter-spacing:.1em;color:#2a1648;background:linear-gradient(#ffe066,#f5a623);box-shadow:0 calc(var(--q)*4) 0 #8a5a00,0 calc(var(--q)*6) calc(var(--q)*14) rgba(10,5,30,.45)}
.trn .go.stop{color:#fff6e8;background:linear-gradient(#ff7a9c,#e0376b);box-shadow:0 calc(var(--q)*4) 0 #7d1638}
.trn .go.dis{filter:grayscale(1);opacity:.5}
.trn .go:active{transform:translateY(calc(var(--q)*3))}
.trn .lvinfo{padding:calc(var(--q)*8) calc(var(--q)*12);border-radius:calc(var(--q)*14);background:rgba(46,230,255,.1);box-shadow:inset 0 0 0 calc(var(--q)*1) rgba(46,230,255,.3);font-size:calc(var(--q)*13);line-height:1.3}
.trn .lvinfo b{display:block;font-size:calc(var(--q)*15);color:#8ff3ff}
.trn .tools{display:flex;flex-wrap:wrap;gap:calc(var(--q)*6);justify-content:center}
.trn .tools button{min-height:calc(var(--q)*40);padding:0 calc(var(--q)*12);border-radius:calc(var(--q)*12);background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 calc(var(--q)*1) rgba(255,255,255,.14);font-weight:700;font-size:calc(var(--q)*12);letter-spacing:.06em}
.trn .run{display:flex;align-items:center;gap:calc(var(--q)*14)}
.trn .ring{position:relative;flex:none;width:calc(var(--q)*116);height:calc(var(--q)*116)}
.trn .ring svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
.trn .ring .in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.trn .ring .in b{font-weight:700;font-size:calc(var(--q)*25);letter-spacing:.04em;line-height:1}
.trn .ring .in span{margin-top:calc(var(--q)*3);font-size:calc(var(--q)*11);letter-spacing:.1em;color:#b9aee6;font-weight:700}
.trn .gain{flex:1;min-width:0}
.trn .gain .v{font-weight:700;font-size:calc(var(--q)*38);line-height:1;color:var(--c);text-shadow:0 0 calc(var(--q)*16) color-mix(in srgb,var(--c) 60%,transparent);transition:transform .12s}
.trn .gain .v.pop{transform:scale(1.18)}
.trn .gain .n{font-weight:700;font-size:calc(var(--q)*13);letter-spacing:.12em;color:#e6dcff}
.trn .gain .s{margin-top:calc(var(--q)*6);font-size:calc(var(--q)*12);color:#b9aee6;line-height:1.35}
.trn .done{text-align:center}
.trn .done .k{font-weight:700;font-size:calc(var(--q)*13);letter-spacing:.2em;color:#ff9ad0}
.trn .done .v{margin:calc(var(--q)*4) 0;font-weight:700;font-size:calc(var(--q)*40);line-height:1;color:var(--c);animation:trnpop .5s cubic-bezier(.2,1.5,.4,1) both}
.trn .done .n{font-weight:700;font-size:calc(var(--q)*14);letter-spacing:.12em}
@keyframes trnpop{0%{opacity:0;transform:scale(.4)}60%{opacity:1;transform:scale(1.15)}100%{transform:none}}
.trn-pops{position:absolute;left:0;right:0;top:0;height:60%;pointer-events:none;z-index:16;overflow:hidden}
.trn-pop{--q:1px;position:absolute;left:50%;top:58%;white-space:nowrap;text-align:center;font-family:var(--f3,'Trebuchet MS',system-ui,sans-serif);font-weight:700;line-height:1;color:var(--c);text-shadow:0 calc(var(--q)*3) 0 #17102b,0 0 calc(var(--q)*14) var(--c);animation:trnrise 1.25s cubic-bezier(.2,.9,.3,1) both}
.trn-pop b{display:block;font-size:calc(var(--q)*34);letter-spacing:.02em}
.trn-pop i{display:block;margin-top:calc(var(--q)*2);font-style:normal;font-size:calc(var(--q)*13);letter-spacing:.16em;color:#fff6e8}
@keyframes trnrise{0%{opacity:0;transform:translate(-50%,40%) scale(.4)}16%{opacity:1;transform:translate(-50%,0) scale(1.2)}32%{transform:translate(-50%,-25%) scale(1)}75%{opacity:1}100%{opacity:0;transform:translate(-50%,-190%) scale(.9)}}
@media (prefers-reduced-motion:reduce){.trn-pop{animation-duration:.9s}.trn .done .v{animation:none}}
`;
  function ensureCss() { if (document.getElementById('trn-css')) return; const st = document.createElement('style'); st.id = 'trn-css'; st.textContent = CSS; document.head.appendChild(st); }
  const qpx = () => (1 / Math.max(0.2, E.S || 1)) + 'px';
  function mkRoot() { ensureCss(); const r = h('div.trn'); r.style.setProperty('--q', qpx()); return r; }
  function btn(cls, html, fn, attrs) { const b = h('button' + (cls ? '.' + cls.split(' ').join('.') : ''), Object.assign({ type: 'button', html }, attrs || {})); b.addEventListener('click', (e) => { e.stopPropagation(); try { E.unlockAudio(); } catch (x) { /* ignore */ } fn(e); }); return b; }

  /* ------------------------------------------------------------------ the menu */
  // M = { S, where, title, stat, view: 'main' | 'idle' | 'play', mins, game, level, root }
  let M = null;
  function sheetTitle(t) { safe(() => { const el = M && M.S.sheetEl && M.S.sheetEl.querySelector('.h2'); if (el) el.textContent = t; }); }
  G.trainMenu = T.open = function (S, where, title) {
    where = where === 'studio' ? 'studio' : 'home';
    const ch = G.ch, low = STATS.slice().sort((a, b) => ch.stats[a] - ch.stats[b])[0];
    const prev = T.lastStat && STATS.indexOf(T.lastStat) >= 0 ? T.lastStat : low;
    M = { S, where, title: title || (where === 'studio' ? 'SOUND LAB: TRAIN' : 'VOCAL BOOTH: TRAIN'), stat: prev, view: 'main', mins: T.lastMins || 60, game: null, level: 0, root: mkRoot() };
    S.sheet(M.title, [M.root], { maxH: '330px' });
    render(); return M;
  };
  function render() {
    if (!M) return; const r = M.root; r.innerHTML = ''; r.style.setProperty('--c', COL[M.stat]);
    if (M.view === 'idle') viewIdle(r); else if (M.view === 'play') viewPlay(r); else viewMain(r);
    safe(() => { const sc = M.S.sheetEl && M.S.sheetEl.querySelector('.scroll'); if (sc) sc.scrollTop = 0; });
    safe(() => { const hk = E.hooks && E.hooks.sheetOpen; if (hk && M.S.sheetEl && M.S.w) hk(M.S.sheetEl); });
  }
  function skillTiles(r) {
    const ch = G.ch, g = h('div.skills');
    for (const st of STATS) {
      const v = ch.stats[st], b = btn('sk' + (st === M.stat ? ' on' : ''), icon(st, 22) + '<b>' + SHORT[st] + '</b><i>' + Math.floor(v) + '</i><u><s style="width:' + Math.round(Math.min(1, v / 99) * 100) + '%"></s></u>', () => { M.stat = st; T.lastStat = st; sfx('click'); render(); }, { 'data-stat': st, 'aria-label': NAME(st) });
      b.style.setProperty('--c', COL[st]); g.appendChild(b);
    }
    r.appendChild(h('div.lbl', null, 'Pick a skill')); r.appendChild(g);
  }
  function viewMain(r) {
    sheetTitle(M.title); skillTiles(r);
    const st = M.stat, game = GAME[st], tooTired = G.ch.energy < 6;
    const studio = M.where === 'studio';
    const duo = h('div.duo'); r.appendChild(duo);
    duo.appendChild(btn('big idle' + (tooTired ? ' dis' : ''), '<span class="ic">' + icon('clock', 28) + '</span><span class="tx"><b>IDLE</b><span>' + IDLE_BLURB[st] + '.<br>15 min to 4 h.</span></span>', () => { sfx('click'); M.view = 'idle'; render(); }, { 'data-act': 'idle' }));
    const lv = trainLv(game), soon = !playable(st);
    duo.appendChild(btn('big play' + (soon ? ' dis' : ''), '<span class="ic">' + icon(st === 'mus' ? 'note' : st === 'tech' ? 'mic' : st === 'ori' ? 'sound' : 'star', 28) + '</span><span class="tx"><b>PLAY</b><span>' + PLAY_BLURB[st] + '.<br>' + (soon ? 'Coming soon.' : 'Level ' + lv + ' open.') + '</span></span><span class="tag">x' + (CFG().playMul || 2) + ' GAINS</span>', () => { sfx('click'); if (soon) { E.toast(GAME_NAME[game] + ' is coming soon. Try IDLE training.', 'info'); M.view = 'idle'; render(); return; } M.view = 'play'; M.game = null; M.level = 0; render(); }, { 'data-act': 'play' }));
    r.appendChild(h('div.note', null, studio ? 'Sound Lab: x1.4 gains, $' + Core.STUDIO_FEE + ' per session.' : 'Tip: PLAY gives about twice the gain in less time.'));
    const tools = (G.labRows ? safe(() => G.labRows(M.S, M.where)) || [] : []).filter((b) => !/PITCH TUNER|BEAT MAKER/.test(b.textContent || ''));
    if (tools.length) { const t = h('div.tools'); for (const b of tools) { const le = b.querySelector('.col > div'), lab = ((le && le.textContent) || b.textContent || '').trim(); t.appendChild(btn('', lab, () => b.click())); } r.appendChild(h('div.lbl', null, 'Tools')); r.appendChild(t); }
  }
  // idle: how long, the gain for each choice, what it costs
  function viewIdle(r) {
    const st = M.stat, ch = G.ch, C = CFG(); sheetTitle('IDLE TRAINING');
    const hd = h('div.head'); hd.appendChild(btn('bk', 'BACK', () => { sfx('back'); M.view = 'main'; render(); })); hd.appendChild(h('div.ttl', { html: NAME(st).toUpperCase() + ' ' + f1(ch.stats[st]) + '<small>' + IDLE_BLURB[st] + '</small>' })); r.appendChild(hd);
    r.appendChild(h('div.lbl', null, 'How long?'));
    const g = h('div.chips'), maxM = C.idleMaxMinutes || 240;
    for (const m of MINS) { if (m > maxM) continue; const b = btn('chip' + (m === M.mins ? ' on' : ''), (m < 60 ? m + ' MIN' : m / 60 + ' H') + '<small>+' + f1(idleGain(ch, st, m, M.where)) + '</small>', () => { M.mins = m; T.lastMins = m; sfx('click'); render(); }, { 'data-min': m }); g.appendChild(b); }
    r.appendChild(g);
    const pv = preview(st, M.mins), real = pv.ticks.length * (C.idleMinStep || 15);
    const sum = h('div.sum'); sum.innerHTML = pv.ok ? '<span>Until <b style="color:#fff6e8">' + clock(ch.minutes + real) + '</b></span><span>Energy <b style="color:#ffd23f">-' + Math.round(ch.energy - pv.char.energy) + '</b></span><span>' + NAME(st) + ' <b>+' + f1(pv.gain) + '</b></span>' + (M.where === 'studio' ? '<span>$' + Core.STUDIO_FEE + '</span>' : '') : '<span style="color:#ff9ad0">' + (pv.why || 'You cannot train right now.') + '</span>';
    r.appendChild(sum);
    if (pv.ok && real < M.mins) r.appendChild(h('div.note', null, 'You can only practise ' + fmtMin(real) + ' before you have to stop.'));
    r.appendChild(btn('go' + (pv.ok ? '' : ' dis'), 'START  ' + fmtMin(pv.ok ? real : M.mins).toUpperCase(), () => { if (!pv.ok) { E.toast(pv.why || 'Not now.', 'warn'); sfx('error'); return; } T.idle(M.S, st, real, M.where); }, { 'data-act': 'start-idle' }));
  }
  // play: game (Musicality has two), level, what it gives
  function playable(st) {
    if (st === 'mus') return true;
    if (st === 'tech') return hasScene('rhythm');
    if (st === 'ori') return hasScene('seq');
    if (st === 'show') return hasScene('pose') || !is3d();   // 2D: the rhythm drill stands in
    return false;
  }
  function viewPlay(r) {
    const st = M.stat, ch = G.ch, C = CFG(); sheetTitle('PLAY: ' + NAME(st).toUpperCase());
    if (!M.game) M.game = st === 'mus' ? (is3d() ? 'ear' : 'tune') : GAME[st];
    const game = M.game, top = trainLv(game); if (!M.level || M.level > top) M.level = top;
    const hd = h('div.head'); hd.appendChild(btn('bk', 'BACK', () => { sfx('back'); M.view = 'main'; render(); })); hd.appendChild(h('div.ttl', { html: GAME_NAME[game].toUpperCase() + '<small>x' + (C.playMul || 2) + ' gains, less time: ' + (C.playMinutes[game] || 20) + ' min</small>' })); r.appendChild(hd);
    if (st === 'mus') {
      const seg = h('div.seg');
      seg.appendChild(btn('chip' + (game === 'ear' ? ' on' : '') + (is3d() ? '' : ' lock'), 'EAR TRAINING<small>' + (is3d() ? 'Hear the jump' : '3D only') + '</small>', () => { if (!is3d()) { E.toast('Ear training needs the 3D mode.', 'info'); return; } M.game = 'ear'; M.level = 0; sfx('click'); render(); }, { 'data-game': 'ear' }));
      seg.appendChild(btn('chip' + (game === 'tune' ? ' on' : ''), 'SINGING<small>Sing into the mic</small>', () => { M.game = 'tune'; M.level = 0; sfx('click'); render(); }, { 'data-game': 'tune' }));
      r.appendChild(seg);
    }
    const levels = game === 'ear' ? Core.EAR_LEVELS : game === 'beat' ? Core.BEAT_LEVELS : game === 'pose' ? Core.POSE_LEVELS : null;
    if (levels && levels.length) {
      r.appendChild(h('div.lbl', null, 'Level'));
      const g = h('div.chips.l8');
      for (let l = 1; l <= Math.min(levels.length, C.levelMax || 8); l++) {
        const lock = l > top, b = btn('chip' + (l === M.level ? ' on' : '') + (lock ? ' lock' : ''), (lock ? icon('lock', 14) : '') + l + '<small>' + (lock ? 'LOCKED' : 'x' + f1(Core.levelMul ? Core.levelMul(l) : 1 + 0.18 * (l - 1))) + '</small>', () => { if (lock) { E.toast('Score 70% on level ' + (l - 1) + ' to unlock it.', 'info'); sfx('error'); return; } M.level = l; sfx('click'); render(); }, { 'data-level': l });
        g.appendChild(b);
      }
      r.appendChild(g);
      const L = levels[M.level - 1]; if (L) r.appendChild(h('div.lvinfo', { html: '<b>' + (L.name || ('Level ' + M.level)) + '</b>' + (L.ask || L.tip || (L.say ? 'Pattern: ' + L.say : L.len ? L.len + ' moves in a row' : '')) }));
    }
    const best = playGain(ch, st, game, M.level || 1, 1, M.where), idleSame = idleGain(ch, st, C.playMinutes[game] || 20, M.where);
    r.appendChild(h('div.sum', { html: '<span>Up to <b>+' + f1(best) + '</b> ' + NAME(st) + '</span><span>Idle for the same time: +' + f1(idleSame) + '</span>' }));
    r.appendChild(btn('go', 'PLAY LEVEL ' + (M.level || 1), () => T.play(M.S, st, game, M.level || 1, M.where), { 'data-act': 'start-play' }));
  }

  /* ------------------------------------------------------------------ IDLE training */
  // the ticks come from Core on a copy of the save: exactly what the real action will do (stops at closing time, energy, late night)
  function preview(stat, minutes) {
    let r = null; try { r = Core.apply(G.ch, { t: 'trainIdle', stat, minutes, where: M ? M.where : 'home' }, () => 0.5); } catch (e) { r = null; }
    const ticks = r ? r.fx.filter((f) => f.t === 'trainTick') : [], why = r ? (r.fx.find((f) => f.t === 'toast' && f.kind === 'warn') || {}).text : 'Training is not available.';
    return { ok: ticks.length > 0, ticks, char: r ? r.char : G.ch, gain: ticks.reduce((a, f) => a + f.gain, 0), why };
  }
  let RUN = null;
  T.idle = function (S, stat, minutes, where) {
    if (RUN) return RUN; where = where === 'studio' ? 'studio' : 'home';
    if (!M || M.S !== S) { M = { S, where, title: 'IDLE TRAINING', stat, view: 'idle', mins: minutes, root: mkRoot() }; S.sheet('IDLE TRAINING', [M.root], { maxH: '330px' }); }
    M.where = where; M.stat = stat;
    const pv = preview(stat, minutes); if (!pv.ok) { E.toast(pv.why || 'Not now.', 'warn'); sfx('error'); return null; }
    const ch0 = G.ch, step = CFG().idleMinStep || 15, total = pv.ticks.length;
    RUN = T.last = { S, stat, where, minutes: total * step, ticks: pv.ticks, done: 0, pops: 0, t: -0.35, gain: 0, ch0, m0: ch0.minutes, e0: ch0.energy, s0: ch0.stats[stat], clipI: 0, clipT: 0, finished: false, summary: null };
    sheetTitle('IDLE TRAINING');
    const r = M.root; r.innerHTML = ''; r.style.setProperty('--c', COL[stat]);
    const R = 52, CIRC = 2 * Math.PI * R;
    const ring = h('div.ring', { html: '<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="' + R + '" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="10"/><circle class="arc" cx="60" cy="60" r="' + R + '" fill="none" stroke="' + COL[stat] + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + CIRC.toFixed(1) + '" stroke-dashoffset="' + CIRC.toFixed(1) + '"/></svg><div class="in"><b class="clk">' + clock(ch0.minutes) + '</b><span class="left">' + fmtMin(RUN.minutes).toUpperCase() + '</span></div>' });
    const gain = h('div.gain', { html: '<div class="v">+0.0</div><div class="n">' + NAME(stat).toUpperCase() + '</div><div class="s">' + IDLE_BLURB[stat] + '...<br>Energy <span class="en">' + Math.round(ch0.energy) + '</span></div>' });
    const run = h('div.run'); run.append(ring, gain); r.appendChild(run);
    r.appendChild(btn('go stop', 'STOP', () => T.stop(), { 'data-act': 'stop' }));
    RUN.el = { arc: ring.querySelector('.arc'), clk: ring.querySelector('.clk'), left: ring.querySelector('.left'), v: gain.querySelector('.v'), en: gain.querySelector('.en'), circ: CIRC, root: r };
    RUN.popBox = h('div.trn-pops'); E.add(RUN.popBox);
    safe(() => { const hk = E.hooks && E.hooks.sheetOpen; if (hk && S.sheetEl && S.w) hk(S.sheetEl); });
    pose(); sfx('confirm');
    RUN.last = performance.now(); RUN.iv = setInterval(loop, 40);
    return RUN;
  };
  function pose() { const R = RUN; if (!R) return; const w = R.S.w; if (!w || !w.player || !w.player.play) return; const list = CLIPS[R.stat] || ['idle']; const c = list[R.clipI % list.length]; safe(() => w.player.play(c, { bpm: 96 })); }
  function fakeHud(m, en, sv) {
    safe(() => { const hud = E.hudEl; if (!hud || !hud.update || !G.ch) return; const c = Core.clone(G.ch); c.minutes = m; c.energy = en; c.stats[RUN.stat] = sv; hud.update(c); });
    safe(() => { const w = RUN.S.w; if (w && w.setTime && Core.nightness) { w.setTime(Core.nightness(m)); if (w.setClock) w.setClock({ hour: Core.hourOf(m), day: G.ch.day }); } });
  }
  function loop() {
    const R = RUN; if (!R || R.finished) return;
    const now = performance.now(), dt = Math.min(0.25, (now - R.last) / 1000) * (T.speed || 1); R.last = now;
    // the sheet went away (a tap on the world, a scene change): keep what was practised
    if (!R.el.root.isConnected || E.scene !== R.S) { finish(true); return; }
    R.t += dt; R.clipT += dt; if (R.clipT > 3.2) { R.clipT = 0; R.clipI++; pose(); }
    const step = CFG().idleMinStep || 15;
    while (R.done < R.ticks.length && R.t >= (R.done + 1) * T.TICK) tick();
    const frac = Math.min(1, Math.max(0, R.t / (R.ticks.length * T.TICK))), mNow = R.m0 + frac * R.ticks.length * step;
    R.el.arc.setAttribute('stroke-dashoffset', (R.el.circ * (1 - frac)).toFixed(1)); R.el.clk.textContent = clock(mNow);
    const left = Math.max(0, Math.ceil((R.ticks.length * step - frac * R.ticks.length * step) / 5) * 5); R.el.left.textContent = left > 0 ? fmtMin(left).toUpperCase() + ' LEFT' : 'DONE';
    if (R.done >= R.ticks.length && R.t >= R.ticks.length * T.TICK + 0.5) finish(false);
  }
  function tick() {
    const R = RUN, f = R.ticks[R.done]; R.done++; R.gain += f.gain;
    const step = CFG().idleMinStep || 15, ePer = (CFG().energyPerHour || 12) * step / 60;
    const gt = '+' + (f.gain >= 0.095 ? f1(f.gain) : f.gain.toFixed(2)), p = h('div.trn-pop', { 'data-text': gt + ' ' + NAME(R.stat).toUpperCase() }, h('b', null, gt), h('i', null, NAME(R.stat).toUpperCase()));
    p.style.setProperty('--c', COL[R.stat]); p.style.setProperty('--q', qpx()); p.style.marginLeft = (R.done % 2 ? -72 : 72) / Math.max(0.2, E.S || 1) + 'px'; p.style.marginTop = ((R.done % 4) < 2 ? 0 : -14) / Math.max(0.2, E.S || 1) + 'px'; p.style.animationDuration = Math.max(0.5, 1.25 / Math.max(1, T.speed || 1)).toFixed(2) + 's';
    R.popBox.appendChild(p); R.pops++; setTimeout(() => p.remove(), 1300);
    R.el.v.textContent = '+' + f1(R.gain); R.el.v.classList.add('pop'); setTimeout(() => R.el.v && R.el.v.classList.remove('pop'), 130);
    const en = R.e0 - ePer * R.done; R.el.en.textContent = Math.max(0, Math.round(en));
    sfx('coin', { quiet: true, pitch: 1.2 + Math.min(0.6, R.done * 0.04), vol: 0.35 });
    fakeHud(R.m0 + R.done * step, en, R.s0 + R.gain);
  }
  T.stop = function () { if (RUN && !RUN.finished) { sfx('back'); finish(false); } };
  // commit the minutes actually practised (whole 15 minute steps; nothing when stopped before the first one) and show the summary
  function finish(silent) {
    const R = RUN; if (!R || R.finished) return; R.finished = true; clearInterval(R.iv); RUN = null;
    const step = CFG().idleMinStep || 15, mins = R.done * step;
    if (R.popBox) setTimeout(() => R.popBox && R.popBox.remove(), 1900);
    safe(() => { const w = R.S.w; if (w && w.player && w.player.play) w.player.play('idle', {}); });
    if (!mins) { R.summary = { minutes: 0, gain: 0 }; safe(() => { if (E.hudEl && E.hudEl.update) E.hudEl.update(G.ch); if (R3 && R3.sync) R3.sync(); }); if (!silent && M) { M.view = 'idle'; render(); } return; }
    const pre = G.ch, held = G.doHold ? G.doHold({ t: 'trainIdle', stat: R.stat, minutes: mins, where: R.where }) : (() => { const r = Core.apply(G.ch, { t: 'trainIdle', stat: R.stat, minutes: mins, where: R.where }, Math.random); G.setChar(r.char); return { fx: r.fx, char: r.char, play: (hd) => G.play(r.fx, hd) }; })();
    const post = G.ch, gain = post.stats[R.stat] - pre.stats[R.stat];
    let xp = (post.xp || 0) - (pre.xp || 0); try { for (let l = pre.level; l < post.level; l++) xp += Core.xpNeed(l); } catch (e) { /* ignore */ }
    R.summary = { minutes: post.minutes - pre.minutes >= 0 && post.day === pre.day ? post.minutes - pre.minutes : mins, gain, energy: Math.round(post.energy - pre.energy), xp: Math.round(xp), from: pre.stats[R.stat], to: post.stats[R.stat], cash: post.cash - pre.cash };
    safe(() => { if (E.hudEl && E.hudEl.update) E.hudEl.update(G.ch); if (R3 && R3.sync) R3.sync(); });
    const hand = { trainTick: () => {}, morning: (f) => { G.pendingMorning = f; }, toast: (f) => { if (f.kind !== 'good') E.toast(f.text, f.kind); } };
    if (silent || !M || !M.root.isConnected) { held.play(Object.assign({}, hand, { toast: (f) => E.toast(f.text, f.kind) })); if (G.pendingMorning && E.scene === R.S) E.go('place', { id: 'home', morningFirst: true }); return; }
    held.play(hand); summary(R);
  }
  function summary(R) {
    const s = R.summary, r = M.root; r.innerHTML = ''; r.style.setProperty('--c', COL[R.stat]); sheetTitle('PRACTICE DONE');
    const d = h('div.done', { html: '<div class="k">' + fmtMin(s.minutes).toUpperCase() + ' OF PRACTICE</div><div class="v">+' + f1(s.gain) + '</div><div class="n">' + NAME(R.stat).toUpperCase() + '  ' + f1(s.from) + ' &rarr; ' + f1(s.to) + '</div>' });
    r.appendChild(d);
    r.appendChild(h('div.sum', { html: '<span>Energy <b style="color:#ffd23f">' + s.energy + '</b></span><span>XP <b>+' + s.xp + '</b></span>' + (s.cash ? '<span>Cash <b style="color:#ff9ad0">' + s.cash + '</b></span>' : '') }));
    r.appendChild(h('div.note', null, 'PLAY trains about twice as fast. Give it a try next time.'));
    r.appendChild(btn('go', 'DONE', () => { sfx('confirm'); const S = R.S; S.closeSheet(); M = null; if (G.pendingMorning) E.go('place', { id: 'home', morningFirst: true }); }, { 'data-act': 'done' }));
    sfx('levelup'); safe(() => { if (BBH.R3UI && BBH.R3UI.confetti && is3d()) BBH.R3UI.confetti(undefined, root.innerHeight * 0.35, 40); });
    safe(() => { const hk = E.hooks && E.hooks.sheetOpen; if (hk && R.S.sheetEl && R.S.w) hk(R.S.sheetEl); });
  }

  /* ------------------------------------------------------------------ PLAY routing */
  T.play = function (S, stat, game, level, where) {
    const ch = G.ch, C = CFG(), en = (C.energyPerHour || 12) * (C.playMinutes[game] || 20) / 60;
    if (ch.energy < en) { E.toast('Too tired to train.', 'warn'); sfx('error'); return false; }
    if (where === 'studio' && ch.cash < Core.STUDIO_FEE) { E.toast('The studio costs $' + Core.STUDIO_FEE + '.', 'warn'); sfx('error'); return false; }
    const place = S.id || (where === 'studio' ? 'studio' : 'home'), back = { scene: 'place', args: { id: place } };
    const commit = (q, extra) => G.doHold(Object.assign({ t: 'trainGame', stat, game, level, q, where }, extra || {}));
    const soon = () => { E.toast(GAME_NAME[game] + ' is coming soon. Try IDLE training.', 'info'); if (M) { M.view = 'idle'; render(); } return false; };
    const go = (name, args) => { S.closeSheet(); M = null; E.go(name, args); return true; };
    switch (game) {
      case 'ear': if (!is3d() || !E.scenes3d.ear) return soon(); return go('ear', { level, where, place, back });
      case 'tune': return go('tuner', { back, place, train: { level, where } });
      case 'make': if (!hasScene('seq')) return soon(); return go('seq', { train: true, level, where, place, back });
      case 'beat': {
        if (!hasScene('rhythm')) return soon();
        if (!Core.BEAT_LEVELS || !is3d()) { if (G.places && G.places.startTraining) { S.closeSheet(); M = null; G.places.startTraining(S, 'tech', where); return true; } return soon(); }
        const L = Core.BEAT_LEVELS[level - 1] || {};
        return go('rhythm', { mode: 'train', level, stat, where, place, back, title: 'TECHNICALITY', sub: L.name || 'rhythm training', bpm: L.bpm || 90, bars: 6, stage: 'cyan',
          onDone: (res) => { if (!res || res.held) return; const held = commit(res.q !== undefined ? res.q : res.accuracy); G.finishActivity(held, place); }, onAbort: () => E.go('place', { id: place }) });
      }
      case 'pose':
        if (hasScene('pose')) return go('pose', { level, where, place, back, onDone: (res) => { if (!res || res.held) return; G.finishActivity(commit(res.q !== undefined ? res.q : res.accuracy), place); }, onAbort: () => E.go('place', { id: place }) });
        if (!is3d() && G.places && G.places.startTraining) { S.closeSheet(); M = null; G.places.startTraining(S, 'show', where); return true; }
        return soon();
      default: return soon();
    }
  };

  /* ------------------------------------------------------------------ EAR TRAINING scene (3D) */
  function overlay() {
    const o = document.createElement('div'); o.className = 'mg3-ov'; o.style.cssText = 'position:fixed;z-index:3;pointer-events:none;overflow:hidden;touch-action:none';
    const fit = () => { const g = document.getElementById('glwrap'); if (!g) return; const r = g.getBoundingClientRect(); o.style.left = r.left + 'px'; o.style.top = r.top + 'px'; o.style.width = r.width + 'px'; o.style.height = r.height + 'px'; };
    o.addEventListener('pointerdown', () => { try { E.unlockAudio(); } catch (e) { /* ignore */ } }, true);
    fit(); root.addEventListener('resize', fit); o._fit = fit; document.body.appendChild(o); return o;
  }
  const dropOverlay = (o) => { if (!o) return; try { root.removeEventListener('resize', o._fit); } catch (e) { /* ignore */ } if (o.parentNode) o.parentNode.removeChild(o); };
  function snap(ch) { let xp = ch.xp || 0; try { for (let l = 1; l < ch.level; l++) xp += Core.xpNeed(l); } catch (e) { /* ignore */ } return { xp, energy: ch.energy, mus: ch.stats.mus, minutes: ch.minutes, day: ch.day }; }
  if (E.scenes3d && R3) E.scenes3d.ear = {
    is3d: true, world: 'ear', name: 'ear',
    enter(a) {
      this.a = a || {}; this.held = null; this.gone = false; this.mg = null; this.w = null; this.res = null;
      gameMode(true);
      this.ov = overlay();
      const args = { hud: this.ov, look: G.ch && G.ch.look, level: this.a.level || trainLv('ear'), levels: Core.EAR_LEVELS, question: Core.earQuestion, lesson: this.a.lesson !== false, settings: E.settings, tone: (f, d, v) => E.tone && E.tone(f, d, v), embedded: true, again: false };
      return R3.load('ear', args).then((w) => {
        if (E.scene !== this || !w) return; this.w = w; this.mg = w.game || null; if (!this.mg) return;
        w.events.on('minigame', (r) => { if (!this.gone && E.scene === this) safe(() => this.onResult(r && r.result ? r.result : r)); });
        w.events.on('quit', () => { if (!this.gone && E.scene === this) safe(() => this.onQuit()); });
      });
    },
    leave() { this.gone = true; dropOverlay(this.ov); this.ov = null; this.mg = null; this.w = null; gameMode(false); },
    update() { /* the world host drives the mini game */ }, draw() { /* WebGL */ },
    onResult(r) {
      if (this.held || !r) return; this.res = r;
      const pre = snap(G.ch); this.held = G.doHold({ t: 'trainGame', stat: 'mus', game: 'ear', level: r.level, q: r.q, where: this.a.where === 'studio' ? 'studio' : 'home' }); const post = snap(G.ch);
      const unlocked = this.held.fx.some((f) => f.t === 'levelUp' && f.game === 'ear');
      this.rw = { mus: Math.round((post.mus - pre.mus) * 100) / 100, xp: Math.round(post.xp - pre.xp), energy: Math.round(post.energy - pre.energy), minutes: post.day === pre.day ? post.minutes - pre.minutes : CFG().playMinutes.ear, unlocked };
      safe(() => { if (this.mg && this.mg.setRewards) this.mg.setRewards(this.rw); });
      if (unlocked) safe(() => { if (BBH.R3UI && BBH.R3UI.confetti) BBH.R3UI.confetti(undefined, root.innerHeight * 0.3, 60); });
    },
    onQuit() {
      if (this.gone) return; this.gone = true; const place = this.a.place || 'home';
      if (this.held) G.finishActivity({ fx: this.held.fx, play: (hd) => this.held.play(Object.assign({ levelUp: () => {} }, hd)) }, place);
      else if (this.a.back && this.a.back.scene) E.go(this.a.back.scene, this.a.back.args); else E.go('place', { id: place });
    },
  };
  // 2D: no ear game, back to the place with a note (the menu never routes here in 2D, this is only a guard)
  if (E.scenes && !E.scenes.ear) E.scenes.ear = { enter(a) { E.toast('Ear training needs the 3D mode.', 'info'); setTimeout(() => E.go('place', { id: (a && a.place) || 'home' }), 0); }, update() {}, draw() {} };
})(typeof globalThis !== 'undefined' ? globalThis : this);

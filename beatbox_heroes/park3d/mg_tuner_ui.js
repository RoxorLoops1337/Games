// TUNER UI (Tuner Artist): the DOM layer over the 3D booth. Touch first: thumb sized buttons, safe-area aware. Range picker, HUD, ear training buttons, result card.
import { RANGES, midiName } from './mg_tuner_logic.js';
import { actButtons, gameActs } from './mg_acts.js';

const CSS = `
.tn{position:absolute;inset:0;overflow:hidden;pointer-events:none;font-family:"Trebuchet MS",system-ui,-apple-system,sans-serif;color:#fff6e8;container-type:size;-webkit-tap-highlight-color:transparent;--st:env(safe-area-inset-top,0px);--sb:env(safe-area-inset-bottom,0px)}
.tn *{box-sizing:border-box;-webkit-user-select:none;user-select:none}
.tn button{pointer-events:auto;touch-action:manipulation;cursor:pointer;font:inherit;border:0;color:inherit}
.tn button:focus-visible{outline:3px solid #2ee6ff;outline-offset:2px}
.tn-top{position:absolute;left:12px;right:12px;top:calc(10px + var(--st));display:flex;align-items:center;gap:8px}
.tn-chip{height:44px;padding:0 12px;display:flex;align-items:center;gap:6px;border-radius:14px;background:rgba(23,16,43,.7);box-shadow:0 2px 10px rgba(10,5,30,.4),inset 0 0 0 1px rgba(255,255,255,.1);font-weight:800;font-size:13px;letter-spacing:.06em;white-space:nowrap}
.tn-chip b{color:#ffd23f;font-size:16px}
.tn-back{width:64px;justify-content:center;background:rgba(23,16,43,.78);font-weight:900;font-size:12px;letter-spacing:.08em}
.tn-grow{flex:1}
.tn-streak{color:#ff9ad0;transition:transform .15s}
.tn-streak.pop{transform:scale(1.25)}
.tn-streak.off{opacity:.0}
.tn-call{position:absolute;left:0;right:0;top:calc(66px + var(--st));text-align:center;opacity:0;transition:opacity .2s}
.tn-call.on{opacity:1}
.tn-note{display:inline-block;min-width:112px;padding:2px 18px 4px;border-radius:18px;background:rgba(23,16,43,.62);font-weight:900;font-size:44px;line-height:1.1;letter-spacing:.04em;color:#2ee6ff;text-shadow:0 0 18px rgba(46,230,255,.8),0 3px 0 #0e0a1e;box-shadow:inset 0 0 0 2px rgba(46,230,255,.35)}
.tn button.tn-listen{margin-top:8px;min-height:44px;padding:0 18px;border-radius:16px;background:rgba(46,230,255,.18);box-shadow:inset 0 0 0 2px rgba(46,230,255,.55);font-weight:900;font-size:13px;letter-spacing:.12em;color:#bff7ff}
.tn button.tn-listen:active{transform:translateY(2px)}
.tn-say{margin-top:4px;font-weight:900;font-size:15px;letter-spacing:.14em;color:#fff6e8;text-shadow:0 2px 0 #0e0a1e,0 0 10px rgba(255,210,63,.6)}
.tn-meter{position:absolute;left:24px;right:24px;bottom:calc(26px + var(--sb));opacity:0;transition:opacity .2s;display:flex;flex-direction:column;gap:6px;align-items:center}
.tn-meter.on{opacity:1}
.tn-gauge{position:relative;width:100%;height:26px;border-radius:13px;background:#241a46;box-shadow:inset 0 0 0 2px #0e0a1e,0 2px 10px rgba(10,5,30,.5);overflow:hidden}
.tn-zone{position:absolute;left:25%;width:50%;top:0;bottom:0;background:linear-gradient(90deg,rgba(93,255,122,.12),rgba(93,255,122,.42),rgba(93,255,122,.12))}
.tn-mid{position:absolute;left:50%;top:-2px;bottom:-2px;width:3px;margin-left:-1px;background:#fff6e8}
.tn-mark{position:absolute;top:2px;bottom:2px;width:12px;margin-left:-6px;border-radius:6px;background:#9dff4a;box-shadow:0 0 12px currentColor;opacity:0;left:50%;transition:left .06s linear,background .1s}
.tn-lbl{width:100%;display:flex;justify-content:space-between;font-weight:800;font-size:11px;letter-spacing:.12em;color:#b9aee6}
.tn-cents{font-weight:900;font-size:13px;letter-spacing:.1em;color:#fff6e8;min-height:16px}
.tn-hold{width:100%;height:8px;border-radius:4px;background:#241a46;overflow:hidden;box-shadow:inset 0 0 0 1px #0e0a1e}
.tn-hold i{display:block;height:100%;width:0;background:linear-gradient(90deg,#5dff7a,#d6ff5a);box-shadow:0 0 10px #9dff4a}
.tn-ask{position:absolute;left:14px;right:14px;bottom:calc(22px + var(--sb));display:flex;gap:12px;opacity:0;transform:translateY(24px);transition:opacity .2s,transform .2s;pointer-events:none}
.tn-ask.on{opacity:1;transform:none}
.tn-ask.on button{pointer-events:auto}
.tn-ask button{flex:1;height:84px;border-radius:22px;font-weight:900;font-size:22px;letter-spacing:.08em;color:#1a0f33;box-shadow:0 5px 0 rgba(0,0,0,.35),0 8px 18px rgba(10,5,30,.5);transition:transform .08s}
.tn-ask button:active{transform:translateY(4px) scale(.97)}
.tn-ask small{display:block;font-size:11px;letter-spacing:.14em;opacity:.7;margin-top:2px}
.tn-hi{background:linear-gradient(#9dff6a,#3fd06a)}
.tn-lo{background:linear-gradient(#ff8ac0,#e83e8c)}
.tn-fb{position:absolute;left:0;right:0;top:36%;text-align:center;font-weight:900;font-size:40px;letter-spacing:.06em;opacity:0;pointer-events:none;text-shadow:0 4px 0 #0e0a1e,0 0 24px currentColor}
.tn-fb.go{animation:tnfb 1s cubic-bezier(.2,1.4,.4,1) both}
@keyframes tnfb{0%{opacity:0;transform:scale(.4)}25%{opacity:1;transform:scale(1.15)}70%{opacity:1;transform:scale(1)}100%{opacity:0;transform:translateY(-18px) scale(1)}}
.tn-card{position:absolute;left:14px;right:14px;bottom:calc(16px + var(--sb));padding:16px 16px 14px;border-radius:24px;background:rgba(23,16,43,.9);box-shadow:0 10px 36px rgba(10,5,30,.65),inset 0 0 0 2px rgba(255,255,255,.12);text-align:center;pointer-events:auto;animation:tnpop .38s cubic-bezier(.2,1.5,.4,1) both;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
@keyframes tnpop{0%{transform:translateY(40px) scale(.9);opacity:0}100%{transform:none;opacity:1}}
.tn-card h2{margin:0 0 2px;font-size:15px;letter-spacing:.2em;color:#b9aee6}
.tn-card .big{font-size:44px;font-weight:900;line-height:1.05;color:#ffd23f;text-shadow:0 3px 0 #8a5a00,0 0 20px rgba(255,210,63,.5)}
.tn-grade{display:inline-block;width:52px;height:52px;line-height:52px;border-radius:50%;margin:4px 0 2px;font-size:30px;font-weight:900;color:#1a0f33;background:linear-gradient(#ffe14d,#f0a21a);box-shadow:0 4px 0 #8a5a00}
.tn-rows{margin:8px 0 12px;display:flex;flex-direction:column;gap:6px}
.tn-row{display:flex;justify-content:space-between;font-weight:800;font-size:14px;letter-spacing:.05em}
.tn-row span:first-child{color:#b9aee6}
.tn-dots{display:flex;gap:5px;justify-content:center;margin:2px 0 6px}.tn-dots i{width:20px;height:20px;border-radius:7px;background:#ff3e86;display:block;box-shadow:0 0 8px rgba(255,62,134,.6)}.tn-dots i.ok{background:#5dff7a;box-shadow:0 0 8px rgba(93,255,122,.7)}
.tn-btns{display:flex;gap:10px}
.tn button.tn-btn{flex:1;min-height:56px;padding:0 10px;border-radius:18px;font-weight:900;font-size:16px;letter-spacing:.08em;color:#2a1648;background:linear-gradient(#ffd23f,#f0a21a);box-shadow:0 4px 0 #8a5a00,0 6px 14px rgba(10,5,30,.5);transition:transform .08s}
.tn button.tn-btn:active{transform:translateY(3px)}
.tn button.tn-btn.alt{background:linear-gradient(#cfc2ff,#8d7ad8);box-shadow:0 4px 0 #4c3d8f,0 6px 14px rgba(10,5,30,.5)}
.tn-pick{position:absolute;left:14px;right:14px;bottom:calc(18px + var(--sb));display:flex;flex-direction:column;gap:9px;pointer-events:none}
.tn-pick .ttl{text-align:center;margin-bottom:2px}
.tn-pick .ttl b{display:block;font-size:30px;font-weight:900;letter-spacing:.1em;color:#fff6e8;text-shadow:0 3px 0 #0e0a1e,0 0 22px rgba(255,62,165,.8)}
.tn-pick .ttl span{display:block;margin:6px auto 0;max-width:300px;font-size:13px;font-weight:700;line-height:1.35;color:#e6dcff;text-shadow:0 2px 0 #0e0a1e}
.tn button.tn-opt{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;min-height:64px;padding:8px 18px;border-radius:20px;text-align:left;font-weight:900;font-size:19px;letter-spacing:.07em;color:#1a0f33;box-shadow:0 5px 0 rgba(0,0,0,.35),0 8px 18px rgba(10,5,30,.5);transition:transform .08s}
.tn button.tn-opt:active{transform:translateY(4px) scale(.98)}
.tn button.tn-opt small{font-size:11px;letter-spacing:.06em;font-weight:700;opacity:.75}
.tn button.tn-opt.hi{background:linear-gradient(#ffe97a,#ffb62e)}.tn-opt.lo{background:linear-gradient(#a9c6ff,#6d8cf0)}.tn-opt.ear{background:linear-gradient(#8ff3ff,#35c3e6)}
.tn-pick button.tn-btn{min-height:46px;flex:none}
.tn-opt.sel{outline:3px solid #fff6e8;outline-offset:2px}
.tn-rw{margin-top:-6px;margin-bottom:10px;font-weight:800;font-size:12px;letter-spacing:.08em;color:#ffd23f}
@media (max-height:620px){.tn-note{font-size:34px}.tn-opt{min-height:52px}}
@media (prefers-reduced-motion:reduce){.tn-fb.go,.tn-card{animation-duration:.01s}}
`;

export function createUI(hud, H, uopt) {
  uopt = uopt || {}; let rw = null, curR = null;
  const doc = hud.ownerDocument, root = doc.createElement('div'); root.className = 'tn';
  const st = doc.createElement('style'); st.textContent = CSS; root.appendChild(st);
  const el = (tag, cls, html, par) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; (par || root).appendChild(e); return e; };
  const top = el('div', 'tn-top'); const back = el('button', 'tn-chip tn-back', 'BACK', top); back.setAttribute('aria-label', 'Back'); back.onclick = () => H.back && H.back();
  el('div', 'tn-grow', '', top); const roundC = el('div', 'tn-chip', 'NOTE <b>0</b>/8', top), scoreC = el('div', 'tn-chip', 'SCORE <b>0</b>', top), streakC = el('div', 'tn-chip tn-streak off', 'x<b>0</b>', top);
  const call = el('div', 'tn-call'), noteEl = el('div', 'tn-note', 'C4', call), sayEl = el('div', 'tn-say', 'LISTEN...', call), listenB = el('button', 'tn-listen', 'LISTEN AGAIN', call);
  listenB.setAttribute('data-act', 'listen'); listenB.setAttribute('aria-label', 'Listen to the note again'); listenB.onclick = () => H.listen && H.listen();
  const fb = el('div', 'tn-fb', '');
  const meter = el('div', 'tn-meter'), gauge = el('div', 'tn-gauge', '<div class="tn-zone"></div><div class="tn-mid"></div>', meter), mark = el('div', 'tn-mark', '', gauge);
  const lbl = el('div', 'tn-lbl', '<span>FLAT</span><span>SHARP</span>', meter), cents = el('div', 'tn-cents', '', meter), hold = el('div', 'tn-hold', '<i></i>', meter), holdI = hold.firstChild;
  const ask = el('div', 'tn-ask'), bHi = el('button', 'tn-hi', 'HIGHER<small>or press UP</small>', ask), bLo = el('button', 'tn-lo', 'LOWER<small>or press DOWN</small>', ask);
  bHi.onclick = () => H.answer && H.answer(1); bLo.onclick = () => H.answer && H.answer(-1);
  let pick = null, card = null, lastRound = -1, lastScore = -1, lastStreak = -1, fbKey = null;
  hud.appendChild(root);

  function clearOverlays() { if (pick) { pick.remove(); pick = null; } if (card) { card.remove(); card = null; } curR = null; }
  function showPicker(voice) {
    clearOverlays(); setPlayVisible(false);
    pick = el('div', 'tn-pick', '');
    const t = el('div', 'ttl', '<b>PITCH TUNER</b><span>Listen to the note, then sing it into your microphone. Stay in tune to score. No mic? Try ear training.</span>', pick);
    void t; const mk = (cls, name, sub, fn) => { const b = el('button', 'tn-opt ' + cls, name + '<small>' + sub + '</small>', pick); b.onclick = fn; return b; };
    mk('hi' + (voice === 'higher' ? ' sel' : ''), RANGES.higher.name, RANGES.higher.desc, () => H.pick && H.pick({ range: 'higher', mode: 'mic' }));
    mk('lo' + (voice === 'lower' ? ' sel' : ''), RANGES.lower.name, RANGES.lower.desc, () => H.pick && H.pick({ range: 'lower', mode: 'mic' }));
    mk('ear', 'EAR TRAINING', 'No mic needed. Is the second note higher or lower?', () => H.pick && H.pick({ range: 'higher', mode: 'ear' }));
  }
  function setPlayVisible(v) { [roundC, scoreC, streakC].forEach((e) => { e.style.visibility = v ? 'visible' : 'hidden'; }); }
  function hidePicker() { if (pick) { pick.remove(); pick = null; } setPlayVisible(true); }
  function flash(text, color) { fb.textContent = text; fb.style.color = color; fb.classList.remove('go'); void fb.offsetWidth; fb.classList.add('go'); }

  function update(S, extra) {
    const playing = S.state === 'play';
    if (S.round !== lastRound) { lastRound = S.round; roundC.innerHTML = 'NOTE <b>' + Math.min(S.round, S.rounds) + '</b>/' + S.rounds; }
    if (S.score !== lastScore) { lastScore = S.score; scoreC.innerHTML = 'SCORE <b>' + S.score + '</b>'; }
    if (S.streak !== lastStreak) { streakC.classList.toggle('off', S.streak < 2); streakC.innerHTML = 'x<b>' + S.streak + '</b> STREAK'; if (S.streak > lastStreak) { streakC.classList.add('pop'); setTimeout(() => streakC.classList.remove('pop'), 160); } lastStreak = S.streak; }
    call.classList.toggle('on', playing);
    const mic = S.mode === 'mic';
    if (mic) { noteEl.style.display = ''; noteEl.textContent = midiName(S.target); sayEl.textContent = S.phase === 'count' ? 'GET READY...' : S.phase === 'ref' ? 'LISTEN...' : S.phase === 'sing' ? (S.cents === null ? 'SING IT!' : 'HOLD IT!') : ''; listenB.style.display = playing && (S.phase === 'sing' || S.phase === 'ref') ? '' : 'none'; }
    else { listenB.style.display = 'none'; noteEl.style.display = 'none'; sayEl.textContent = S.phase === 'earA' ? 'NOTE 1' : S.phase === 'earB' ? 'NOTE 2' : S.phase === 'ask' ? 'WAS THE SECOND NOTE...' : ''; }
    meter.classList.toggle('on', playing && mic && S.phase === 'sing');
    if (playing && mic) {
      if (S.cents === null) { mark.style.opacity = 0; cents.textContent = S.phase === 'sing' ? 'WAITING FOR YOUR VOICE...' : ''; }
      else { mark.style.opacity = 1; mark.style.left = (50 + Math.max(-1, Math.min(1, S.cents / 100)) * 50) + '%'; const ok = Math.abs(S.cents) < 50; mark.style.background = ok ? '#9dff4a' : '#ff6b8a'; mark.style.color = ok ? '#9dff4a' : '#ff6b8a'; cents.textContent = (S.cents > 0 ? '+' : '') + Math.round(S.cents) + ' CENTS ' + (ok ? 'IN TUNE' : S.cents > 0 ? 'SHARP' : 'FLAT'); }
      holdI.style.width = Math.min(100, S.hold / 0.9 * 100) + '%';
    }
    ask.classList.toggle('on', playing && S.mode === 'ear' && S.phase === 'ask');
    const key = S.fb ? S.round + S.fb : null; if (key !== fbKey) { fbKey = key; if (S.fb) flash(S.fb, S.fbOk ? '#9dff4a' : '#ff6b8a'); }
    void extra;
  }
  function drawCard() {
    if (!card || !curR) return; const r = curR.r, hh = curR.hh, w = rw, mus = w && w.mus !== undefined ? w.mus : r.musGain;
    const dots = r.log.map((l) => '<i class="' + (l.ok ? 'ok' : '') + '"></i>').join(''), chips = [];
    if (w) { if (w.xp) chips.push('+' + Math.round(w.xp) + ' XP'); if (w.energy) chips.push(Math.round(w.energy) + ' ENERGY'); if (w.mood) chips.push('+' + Math.round(w.mood) + ' MOOD'); }
    card.innerHTML = '<h2>TUNER RESULT</h2><div class="big">' + r.score + ' / ' + r.rounds + '</div><div class="tn-grade">' + r.grade + '</div><div class="tn-dots">' + dots + '</div><div class="tn-rows"><div class="tn-row"><span>Mode</span><span>' + r.mode + '</span></div><div class="tn-row"><span>Quality</span><span style="color:#ffd23f">' + r.qualityPct + '%</span></div><div class="tn-row"><span>Best streak</span><span>' + r.bestStreak + '</span></div>' + (r.modeId === 'mic' ? '<div class="tn-row"><span>Time in tune</span><span>' + (r.inTuneMs / 1000).toFixed(1) + ' s</span></div>' : '') + '<div class="tn-row"><span>Musicality</span><span class="tn-mus" style="color:#9dff4a">+' + (Math.round(mus * 10) / 10).toFixed(1) + '</span></div></div>' + (chips.length ? '<div class="tn-rw">' + chips.join('   ') + '</div>' : '') + '<div class="tn-btns"></div>';
    const bt = card.querySelector('.tn-btns'), acts = gameActs(uopt); if (acts) { bt.style.flexWrap = 'wrap'; actButtons(doc, bt, acts, { row: false, cls: 'tn-btn', alt: 'alt', go: () => hh.done() }); bt.querySelectorAll('.tn-btn').forEach((b) => { b.style.flex = b.dataset.act === 'continue' ? '1 1 100%' : '1 1 40%'; if (b.dataset.act !== 'continue') { b.style.fontSize = '14px'; b.style.whiteSpace = 'nowrap'; } }); return; }
    if (uopt.again !== false) { const b1 = el('button', 'tn-btn alt', 'AGAIN', bt); b1.onclick = () => hh.again(); } const b2 = el('button', 'tn-btn', 'CONTINUE', bt); b2.onclick = () => hh.done();
  }
  function showResult(r, hh) {
    clearOverlays(); ask.classList.remove('on'); meter.classList.remove('on'); call.classList.remove('on');
    card = el('div', 'tn-card', ''); rw = null; curR = { r, hh }; drawCard();
  }
  // the real numbers from the game (G.doHold): { mus, xp, energy, mood }; redraws the open card
  function setRewards(r) { rw = r || null; drawCard(); }
  return { root, update, showPicker, hidePicker, showResult, setRewards, flash, clearOverlays, destroy() { clearOverlays(); root.remove(); }, get hasCard() { return !!card; }, get hasPicker() { return !!pick; }, buttons: { hi: bHi, lo: bLo, back } };
}

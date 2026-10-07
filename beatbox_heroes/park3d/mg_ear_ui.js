// EAR TRAINING UI (TRAIN): the DOM layer over the 3D booth. Touch first, big friendly text for musical beginners.
//   lesson card (title, plain words, PLAY EXAMPLE buttons with a little contour of the notes, START) -> rounds (LISTEN AGAIN, big answer buttons,
//   instant feedback with a one line explanation, NEXT) -> result card (score, grade, unlock line, real rewards from the game, CONTINUE).
import { label, why, PASS_Q } from './mg_ear_logic.js';

const CSS = `
.er{position:absolute;inset:0;overflow:hidden;pointer-events:none;font-family:Fredoka,"Trebuchet MS",system-ui,-apple-system,sans-serif;color:#fff6e8;-webkit-tap-highlight-color:transparent;--st:env(safe-area-inset-top,0px);--sb:env(safe-area-inset-bottom,0px)}
.er *{box-sizing:border-box;-webkit-user-select:none;user-select:none}
.er button{pointer-events:auto;touch-action:manipulation;cursor:pointer;font:inherit;border:0;color:inherit}
.er button:focus-visible{outline:3px solid #2ee6ff;outline-offset:2px}
.er-top{position:absolute;left:10px;right:10px;top:calc(10px + var(--st));display:flex;align-items:center;gap:6px}
.er-chip{height:44px;padding:0 12px;display:flex;align-items:center;gap:6px;border-radius:14px;background:rgba(23,16,43,.72);box-shadow:0 2px 10px rgba(10,5,30,.4),inset 0 0 0 1px rgba(255,255,255,.1);font-weight:700;font-size:13px;letter-spacing:.05em;white-space:nowrap}
.er-chip b{color:#ffd23f;font-size:16px}
.er-back{width:62px;justify-content:center;font-weight:800;font-size:12px;letter-spacing:.08em}
.er-lvl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;justify-content:center;color:#8ff3ff}
.er-streak{color:#ff9ad0;transition:transform .15s,opacity .2s}.er-streak.off{opacity:0}.er-streak.pop{transform:scale(1.25)}
.er-ask{position:absolute;left:16px;right:16px;top:calc(64px + var(--st));text-align:center;opacity:0;transition:opacity .2s}
.er-ask.on{opacity:1}
.er-ask .n{font-weight:700;font-size:12px;letter-spacing:.2em;color:#b9aee6}
.er-ask .q{margin-top:3px;font-weight:700;font-size:19px;line-height:1.25;text-shadow:0 2px 0 #0e0a1e,0 0 14px rgba(46,230,255,.35)}
.er-ask .say{margin-top:6px;display:inline-block;padding:4px 14px;border-radius:99px;font-weight:700;font-size:13px;letter-spacing:.16em;background:rgba(46,230,255,.18);color:#8ff3ff;box-shadow:inset 0 0 0 1px rgba(46,230,255,.4)}
.er-ask .say.go{background:rgba(255,210,63,.2);color:#ffe27a;box-shadow:inset 0 0 0 1px rgba(255,210,63,.45)}
.er-pad{position:absolute;left:12px;right:12px;bottom:calc(14px + var(--sb));display:flex;flex-direction:column;gap:10px;opacity:0;transform:translateY(24px);transition:opacity .2s,transform .2s}
.er-pad.on{opacity:1;transform:none}
.er-pad:not(.on) button{pointer-events:none}
.er-listen{align-self:center;min-height:46px;padding:0 22px;border-radius:99px;font-weight:700;font-size:15px;letter-spacing:.1em;color:#0f2a3a;background:linear-gradient(#a6f6ff,#3fcbe8);box-shadow:0 4px 0 #1d7f99,0 6px 14px rgba(10,5,30,.45);display:flex;align-items:center;gap:8px}
.er-listen i,.er-ex i{display:inline-block;width:0;height:0;border-left:12px solid currentColor;border-top:8px solid transparent;border-bottom:8px solid transparent}
.er-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.er-grid.n5{grid-template-columns:1fr 1fr 1fr}.er-grid.n5 button{height:66px;font-size:16px}
.er-grid button{height:82px;border-radius:22px;font-weight:700;font-size:21px;letter-spacing:.06em;color:#1a0f33;box-shadow:0 5px 0 rgba(0,0,0,.35),0 8px 18px rgba(10,5,30,.5);transition:transform .08s,filter .15s,opacity .2s}
.er-grid button:active{transform:translateY(4px) scale(.97)}
.er-grid button.c0{background:linear-gradient(#9dff6a,#3fd06a)}.er-grid button.c1{background:linear-gradient(#ff8ac0,#e83e8c)}.er-grid button.c2{background:linear-gradient(#ffe97a,#ffb62e)}.er-grid button.c3{background:linear-gradient(#a9c6ff,#6d8cf0)}.er-grid button.c4{background:linear-gradient(#d7a8ff,#9a5cf0)}
.er-grid button.dim{opacity:.35;filter:saturate(.4)}
.er-grid button.right{outline:4px solid #fff6e8;outline-offset:2px}
.er-fb{position:absolute;left:14px;right:14px;top:auto;bottom:calc(178px + var(--sb));text-align:center;pointer-events:none;opacity:0}
.er-fb.on{opacity:1}
.er-fb .big{font-weight:700;font-size:42px;letter-spacing:.04em;text-shadow:0 4px 0 #0e0a1e,0 0 24px currentColor;animation:erpop .5s cubic-bezier(.2,1.5,.4,1) both}
.er-fb .why{margin:8px auto 0;max-width:330px;padding:9px 14px;border-radius:16px;background:rgba(23,16,43,.82);font-weight:500;font-size:16px;line-height:1.3;color:#fff6e8;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.er-fb .row{margin-top:10px;display:flex;gap:8px;justify-content:center}
.er-fb .row button{pointer-events:auto;min-height:44px;padding:0 16px;border-radius:14px;font-weight:700;font-size:13px;letter-spacing:.1em;background:rgba(23,16,43,.85);box-shadow:inset 0 0 0 2px rgba(255,255,255,.18)}
.er-fb .row button.nx{color:#2a1648;background:linear-gradient(#ffd23f,#f0a21a);box-shadow:0 3px 0 #8a5a00}
@keyframes erpop{0%{opacity:0;transform:scale(.4)}60%{opacity:1;transform:scale(1.12)}100%{transform:none}}
.er-card{position:absolute;left:12px;right:12px;bottom:calc(12px + var(--sb));max-height:calc(100% - 76px - var(--st));overflow:auto;overscroll-behavior:contain;padding:16px 16px 14px;border-radius:24px;background:rgba(23,16,43,.9);box-shadow:0 10px 36px rgba(10,5,30,.65),inset 0 0 0 2px rgba(255,255,255,.12);pointer-events:auto;animation:ercard .38s cubic-bezier(.2,1.4,.4,1) both;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
@keyframes ercard{0%{transform:translateY(40px) scale(.94);opacity:0}100%{transform:none;opacity:1}}
.er-card .kick{font-weight:700;font-size:12px;letter-spacing:.22em;color:#ff9ad0}
.er-card.er-lesson{max-height:min(64%,calc(100% - 76px - var(--st)));padding:14px 14px 12px}
.er-card h1{margin:2px 0 6px;font-weight:700;font-size:25px;line-height:1.1;color:#ffd23f;text-shadow:0 3px 0 #6b3d00}
.er-card p{margin:0 0 10px;font-weight:500;font-size:15px;line-height:1.38;color:#f1e9ff}
.er-exs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.er-ex{flex:1 1 calc(50% - 8px);min-width:0;display:flex;align-items:center;gap:8px;min-height:48px;padding:5px 8px 5px 6px;border-radius:16px;text-align:left;background:rgba(46,230,255,.12);box-shadow:inset 0 0 0 2px rgba(46,230,255,.35);font-weight:700;font-size:15px;letter-spacing:.03em;color:#e9fdff;transition:transform .08s,background .15s}
.er-ex:active{transform:scale(.98)}
.er-ex.on{background:rgba(46,230,255,.32)}
.er-ex .pl{flex:none;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;padding-left:4px;background:#2ee6ff;color:#0f2a3a}
.er-ex .pl i{border-left-width:11px;border-top-width:7px;border-bottom-width:7px}
.er-ex .tx{flex:1;min-width:0;font-size:15px;line-height:1.15}
.er-hear{margin:0 0 6px;font-weight:700;font-size:11px;letter-spacing:.18em;color:#8ff3ff}
.er-ex .tx small{display:block;font-size:11px;letter-spacing:.14em;color:#8ff3ff;font-weight:700;opacity:.8}
.er-dots{flex:none;position:relative;width:46px;height:30px}
.er-dots u{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:#ffd23f;box-shadow:0 0 8px #ffd23f}
.er-btns{display:flex;gap:10px}
.er button.er-go{flex:1;min-height:58px;border-radius:18px;font-weight:700;font-size:18px;letter-spacing:.1em;color:#2a1648;background:linear-gradient(#ffd23f,#f0a21a);box-shadow:0 4px 0 #8a5a00,0 6px 14px rgba(10,5,30,.5)}
.er button.er-go:active{transform:translateY(3px)}
.er button.er-go.alt{flex:.6;background:linear-gradient(#cfc2ff,#8d7ad8);box-shadow:0 4px 0 #4c3d8f}
.er-score{font-size:46px;font-weight:700;line-height:1;color:#ffd23f;text-align:center;text-shadow:0 3px 0 #8a5a00,0 0 20px rgba(255,210,63,.5)}
.er-grade{display:block;width:54px;height:54px;line-height:54px;margin:6px auto 4px;border-radius:50%;text-align:center;font-size:30px;font-weight:700;color:#1a0f33;background:linear-gradient(#ffe14d,#f0a21a);box-shadow:0 4px 0 #8a5a00}
.er-rd{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin:4px 0 8px}.er-rd i{width:18px;height:18px;border-radius:6px;background:#ff3e86;display:block}.er-rd i.ok{background:#5dff7a;box-shadow:0 0 8px rgba(93,255,122,.7)}
.er-rows{margin:6px 0 10px;display:flex;flex-direction:column;gap:6px}
.er-row{display:flex;justify-content:space-between;font-weight:700;font-size:15px}.er-row span:first-child{color:#b9aee6;font-weight:500}
.er-unl{margin:0 0 12px;padding:9px 12px;border-radius:14px;text-align:center;font-weight:700;font-size:15px;letter-spacing:.04em}
.er-unl.yes{color:#1a3a10;background:linear-gradient(#c8ff8a,#7be04f);animation:erpop .6s .25s cubic-bezier(.2,1.5,.4,1) both}
.er-unl.no{color:#ffd7e6;background:rgba(255,62,134,.18);box-shadow:inset 0 0 0 1px rgba(255,62,134,.45)}
.er-flash{position:absolute;left:0;right:0;top:42%;text-align:center;font-weight:700;font-size:20px;letter-spacing:.08em;opacity:0;transition:opacity .25s;text-shadow:0 3px 0 #0e0a1e}
.er-flash.on{opacity:1}
@media (max-height:600px){.er-card p{font-size:14px}.er-grid button{height:66px}.er-card h1{font-size:23px}}
@media (prefers-reduced-motion:reduce){.er-card,.er-fb .big,.er-unl.yes{animation-duration:.01s}}
`;

export function createUI(hud, H) {
  H = H || {}; const doc = hud.ownerDocument, root = doc.createElement('div'); root.className = 'er';
  const st = doc.createElement('style'); st.textContent = CSS; root.appendChild(st);
  const el = (tag, cls, html, par) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; (par || root).appendChild(e); return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const top = el('div', 'er-top'), back = el('button', 'er-chip er-back', 'BACK', top); back.setAttribute('aria-label', 'Back'); back.onclick = () => H.back && H.back();
  const lvl = el('div', 'er-chip er-lvl', '', top), roundC = el('div', 'er-chip', '', top), streakC = el('div', 'er-chip er-streak off', '', top);
  const askEl = el('div', 'er-ask', '<div class="n"></div><div class="q"></div><div class="say"></div>'), askN = askEl.children[0], askQ = askEl.children[1], askSay = askEl.children[2];
  const fb = el('div', 'er-fb', '<div class="big"></div><div class="why"></div><div class="row"></div>'), fbBig = fb.children[0], fbWhy = fb.children[1], fbRow = fb.children[2];
  const again = el('button', '', 'HEAR IT AGAIN', fbRow), nextB = el('button', 'nx', 'NEXT', fbRow); again.onclick = () => H.replay && H.replay(); nextB.onclick = () => H.next && H.next();
  const pad = el('div', 'er-pad'), listen = el('button', 'er-listen', '<i></i>LISTEN AGAIN', pad), grid = el('div', 'er-grid', '', pad); listen.onclick = () => H.replay && H.replay();
  const flashEl = el('div', 'er-flash', '');
  let card = null, btns = [], choicesKey = '', last = {}, cardData = null, rw = null, exOn = null;
  hud.appendChild(root);

  function setChoices(choices) {
    const k = choices.join('|'); if (k === choicesKey) return; choicesKey = k; grid.innerHTML = ''; grid.className = 'er-grid' + (choices.length > 2 ? ' n5' : '');
    btns = choices.map((c, i) => { const b = el('button', 'c' + (i % 5), esc(label(c)), grid); b.dataset.choice = c; b.onclick = () => H.answer && H.answer(c); return b; });
  }
  // little contour of an example: one dot per note, height by pitch (a chord stacks them in one column)
  function dots(notes, chord) {
    const lo = Math.min.apply(null, notes), hi = Math.max.apply(null, notes), span = Math.max(4, hi - lo);
    return '<span class="er-dots">' + notes.map((m, i) => '<u style="left:' + (chord ? 23 : 6 + i * (34 / Math.max(1, notes.length - 1))) + 'px;top:' + (25 - (m - lo) / span * 20) + 'px"></u>').join('') + '</span>';
  }
  function clearCard() { if (card) { card.remove(); card = null; } cardData = null; exOn = null; }
  function showLesson(L, o) {
    clearCard(); o = o || {}; pad.classList.remove('on'); askEl.classList.remove('on'); fb.classList.remove('on');
    const ls = L.lesson || { title: L.name, text: L.ask, examples: [] };
    card = el('div', 'er-card er-lesson', '<div class="kick">LEVEL ' + L.level + ' LESSON</div><h1>' + esc(ls.title) + '</h1><p>' + esc(ls.text) + '</p><div class="er-hear">TAP TO HEAR AN EXAMPLE</div><div class="er-exs"></div><div class="er-btns"></div>');
    const exs = card.querySelector('.er-exs');
    (ls.examples || []).forEach((ex, i) => {
      const b = el('button', 'er-ex', '<span class="pl"><i></i></span><span class="tx">' + esc(ex.label) + '</span>' + dots(ex.notes, ex.chord), exs);
      b.onclick = () => { if (exOn) exOn.classList.remove('on'); exOn = b; b.classList.add('on'); const d = H.example ? H.example(i) : 1; setTimeout(() => { if (exOn === b) { b.classList.remove('on'); exOn = null; } }, Math.max(400, (d || 1) * 1000)); };
    });
    const go = el('button', 'er-go', 'START  ' + (L.rounds || 8) + ' ROUNDS', card.querySelector('.er-btns')); go.onclick = () => H.start && H.start();
  }
  function hideLesson() { if (card && card.classList.contains('er-lesson')) clearCard(); }

  function update(S) {
    const playing = S.state === 'play';
    const lk = S.level + S.name; if (last.lk !== lk) { last.lk = lk; lvl.innerHTML = 'LV <b>' + S.level + '</b>&nbsp;' + esc(String(S.name).toUpperCase()); }
    const rk = playing ? S.round + '/' + S.rounds : ''; if (last.rk !== rk) { last.rk = rk; roundC.innerHTML = rk ? '<b>' + S.round + '</b>/' + S.rounds : ''; roundC.style.visibility = rk ? 'visible' : 'hidden'; }
    if (last.streak !== S.streak) { streakC.classList.toggle('off', S.streak < 2); streakC.innerHTML = 'x<b>' + S.streak + '</b>'; if (S.streak > (last.streak || 0) && S.streak >= 2) { streakC.classList.add('pop'); setTimeout(() => streakC.classList.remove('pop'), 170); } last.streak = S.streak; }
    setChoices(S.choices);
    const showAsk = playing && (S.phase === 'listen' || S.phase === 'ask');
    askEl.classList.toggle('on', showAsk);
    if (showAsk) {
      const nk = 'ROUND ' + S.round + ' OF ' + S.rounds; if (askN.textContent !== nk) askN.textContent = nk;
      if (askQ.textContent !== S.ask) askQ.textContent = S.ask;
      const say = S.phase === 'listen' ? 'LISTEN...' : 'YOUR ANSWER?'; if (askSay.textContent !== say) { askSay.textContent = say; askSay.classList.toggle('go', S.phase === 'ask'); }
    }
    pad.classList.toggle('on', playing && S.phase !== 'lesson');
    const fbk = playing && S.phase === 'fb' ? S.round + ':' + S.picked : '';
    if (fbk !== last.fbk) {
      last.fbk = fbk; fb.classList.toggle('on', !!fbk);
      if (fbk) {
        const ph = pad.offsetHeight; if (ph > 40) fb.style.bottom = 'calc(' + (ph + 30) + 'px + var(--sb))';   // the feedback sits just above the answer pad, the gems stay visible
        fbBig.textContent = S.ok ? (S.streak >= 3 ? 'ON FIRE!' : ['NICE!', 'CORRECT!', 'YES!'][S.round % 3]) : 'NOT QUITE'; fbBig.style.color = S.ok ? '#9dff4a' : '#ff8ab0';
        fbBig.style.animation = 'none'; void fbBig.offsetWidth; fbBig.style.animation = '';
        fbWhy.textContent = (S.ok ? '' : 'It was ' + label(S.q.answer) + '. ') + why(S.q.answer);
        again.style.display = S.ok ? 'none' : '';
        btns.forEach((b) => { const c = b.dataset.choice; b.classList.toggle('right', c === S.q.answer); b.classList.toggle('dim', c !== S.q.answer); });
      } else btns.forEach((b) => b.classList.remove('right', 'dim'));
    }
  }
  function drawResult() {
    if (!card || !cardData) return; const r = cardData.r, hh = cardData.hh, w = rw || {};
    const mus = w.mus !== undefined ? w.mus : null, next = r.level + 1, unlocked = w.unlocked || (r.pass && r.level < 8);
    const rows = [['Correct', Math.round(r.q * 100) + '%'], ['Best streak', r.bestStreak]];
    if (mus !== null) rows.push(['Musicality', '<span class="er-mus" style="color:#9dff4a">+' + (Math.round(mus * 10) / 10).toFixed(1) + '</span>']);
    if (w.xp) rows.push(['XP', '+' + Math.round(w.xp)]); if (w.minutes) rows.push(['Time', w.minutes + ' min']); if (w.energy) rows.push(['Energy', Math.round(w.energy)]);
    const unl = r.level >= 8 ? (r.pass ? '<div class="er-unl yes">ALL 8 LEVELS MASTERED!</div>' : '') : unlocked ? '<div class="er-unl yes">LEVEL ' + next + ' UNLOCKED!</div>' : '<div class="er-unl no">Get ' + Math.round(PASS_Q * 100) + '% to unlock level ' + next + '. You got this.</div>';
    card.innerHTML = '<div class="kick" style="text-align:center">EAR TRAINING  LEVEL ' + r.level + '</div><div class="er-score">' + r.score + ' / ' + r.rounds + '</div><span class="er-grade">' + r.grade + '</span><div class="er-rd">' + r.log.map((l) => '<i class="' + (l.ok ? 'ok' : '') + '"></i>').join('') + '</div><div class="er-rows">' + rows.map((x) => '<div class="er-row"><span>' + x[0] + '</span><span>' + x[1] + '</span></div>').join('') + '</div>' + unl + '<div class="er-btns"></div>';
    const bt = card.querySelector('.er-btns');
    if (hh.again) { const b1 = el('button', 'er-go alt', 'AGAIN', bt); b1.onclick = () => hh.again(); }
    const b2 = el('button', 'er-go', 'CONTINUE', bt); b2.onclick = () => hh.done();
  }
  function showResult(r, hh) { clearCard(); pad.classList.remove('on'); askEl.classList.remove('on'); fb.classList.remove('on'); card = el('div', 'er-card er-result', ''); cardData = { r, hh }; rw = null; drawResult(); }
  function setRewards(r) { rw = r || null; drawResult(); }
  function flash(text, color) { flashEl.textContent = text; flashEl.style.color = color || '#fff6e8'; flashEl.classList.add('on'); setTimeout(() => flashEl.classList.remove('on'), 1200); }
  return {
    root, update, showLesson, hideLesson, showResult, setRewards, flash, clearCard,
    destroy() { clearCard(); root.remove(); },
    get hasCard() { return !!(card && card.classList.contains('er-result')); }, get hasLesson() { return !!(card && card.classList.contains('er-lesson')); },
    get buttons() { return { back, listen, next: nextB, again, choices: btns.slice() }; },
  };
}

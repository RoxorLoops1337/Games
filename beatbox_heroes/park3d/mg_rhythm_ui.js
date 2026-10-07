// Busking rhythm game: DOM HUD (score, combo, crowd meter, four big lane pads, popups, start card, count-in, result card).
// Everything scales with one CSS variable --u (hud width / 540) so it is crisp on a phone and on the 9:16 desktop frame.
import { LANES } from './mg_rhythm_hw.js';

const CSS = `
.rh{position:absolute;inset:0;pointer-events:none;font-family:"Trebuchet MS",system-ui,sans-serif;color:#fff2dc;--u:1px;overflow:hidden;-webkit-tap-highlight-color:transparent}
.rh *{box-sizing:border-box;pointer-events:none}
.rh button,.rh .pad,.rh .card,.rh .chip{pointer-events:auto;touch-action:none;font-family:inherit}
.rh .top{position:absolute;left:calc(12*var(--u));right:calc(12*var(--u));top:calc(10*var(--u));display:flex;align-items:flex-start;justify-content:space-between;gap:calc(8*var(--u))}
.rh .rbtn{height:calc(40*var(--u));min-width:calc(40*var(--u));padding:0 calc(12*var(--u));border-radius:calc(20*var(--u));border:calc(2*var(--u)) solid #2b2438;background:linear-gradient(#fff2dc,#f2d7a4);color:#2b2438;font-weight:900;font-size:calc(14*var(--u));letter-spacing:.06em;box-shadow:0 calc(3*var(--u)) 0 #2b2438;cursor:pointer}
.rh .rbtn:active{transform:translateY(calc(2*var(--u)));box-shadow:0 calc(1*var(--u)) 0 #2b2438}
.rh .rbtn.on{background:linear-gradient(#b9ff9a,#6fdc5a)}
.rh .score{flex:1;text-align:center;line-height:1;text-shadow:0 calc(2*var(--u)) 0 #2b2438,0 0 calc(14*var(--u)) rgba(255,160,90,.55)}
.rh .score b{display:block;font-size:calc(38*var(--u));font-weight:900;letter-spacing:.02em;color:#fff2dc;-webkit-text-stroke:calc(1.5*var(--u)) #2b2438;paint-order:stroke fill}
.rh .score i{display:block;font-style:normal;font-size:calc(11*var(--u));font-weight:800;letter-spacing:.2em;color:#ffd27a;margin-top:calc(3*var(--u))}
.rh .meter{position:absolute;left:calc(26*var(--u));right:calc(26*var(--u));top:calc(76*var(--u));height:calc(16*var(--u));border-radius:calc(9*var(--u));background:rgba(43,36,56,.78);border:calc(2*var(--u)) solid #2b2438;overflow:visible}
.rh .meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:calc(7*var(--u));background:linear-gradient(90deg,#35f2e0,#ffd23f 55%,#ff3ea5);width:0%;box-shadow:0 0 calc(10*var(--u)) rgba(255,120,200,.7)}
.rh .meter .tick{position:absolute;top:calc(-4*var(--u));width:calc(3*var(--u));height:calc(24*var(--u));background:#2b2438;border-radius:2px}
.rh .meter .lab{position:absolute;top:calc(20*var(--u));font-size:calc(9*var(--u));font-weight:900;letter-spacing:.12em;color:#ffd7b8;opacity:.55;transform:translateX(-50%);text-shadow:0 1px 0 #2b2438;white-space:nowrap}
.rh .meter .lab.on{opacity:1;color:#fff2dc}
.rh .meter .name{position:absolute;left:calc(8*var(--u));top:calc(-1*var(--u));font-size:calc(10*var(--u));font-weight:900;letter-spacing:.14em;color:#fff2dc;text-shadow:0 1px 0 #2b2438;line-height:calc(16*var(--u))}
.rh .combo{position:absolute;left:0;right:0;top:calc(128*var(--u));text-align:center;font-weight:900;font-size:calc(36*var(--u));letter-spacing:.06em;color:#fff2dc;text-shadow:0 calc(2*var(--u)) 0 #2b2438,0 0 calc(16*var(--u)) rgba(255,210,63,.8);-webkit-text-stroke:calc(1.2*var(--u)) #2b2438;paint-order:stroke fill;opacity:0;transform:scale(1)}
.rh .combo small{display:block;font-size:calc(10*var(--u));letter-spacing:.3em;color:#ffd27a;-webkit-text-stroke:0;margin-top:calc(-2*var(--u))}
.rh .combo.on{opacity:1}.rh .combo.bump{animation:rhbump .18s ease-out}
@keyframes rhbump{0%{transform:scale(1.45)}100%{transform:scale(1)}}
.rh .pops{position:absolute;inset:0}
.rh .pop{position:absolute;transform:translate(-50%,-50%);font-weight:900;font-size:calc(24*var(--u));letter-spacing:.05em;white-space:nowrap;-webkit-text-stroke:calc(2*var(--u)) #2b2438;paint-order:stroke fill;text-shadow:0 calc(3*var(--u)) 0 #2b2438;animation:rhpop .75s ease-out forwards}
.rh .pop.perfect{color:#ffe14d;font-size:calc(27*var(--u))}.rh .pop.good{color:#35f2e0}.rh .pop.miss{color:#ff7b8c;font-size:calc(21*var(--u))}.rh .pop.big{color:#fff2dc;font-size:calc(34*var(--u));letter-spacing:.1em}
@keyframes rhpop{0%{opacity:0;transform:translate(-50%,-30%) scale(.5)}15%{opacity:1;transform:translate(-50%,-60%) scale(1.25)}35%{transform:translate(-50%,-70%) scale(1)}100%{opacity:0;transform:translate(-50%,-190%) scale(1)}}
.rh .pads{position:absolute;left:calc(8*var(--u));right:calc(8*var(--u));bottom:calc(10*var(--u));height:calc(124*var(--u));display:grid;grid-template-columns:repeat(4,1fr);gap:calc(8*var(--u))}
.rh .pad{position:relative;border-radius:calc(18*var(--u));border:calc(3*var(--u)) solid #2b2438;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(2*var(--u));user-select:none;-webkit-user-select:none;transition:transform .05s;overflow:hidden}
.rh .pad::after{content:"";position:absolute;left:8%;right:8%;top:6%;height:30%;border-radius:calc(14*var(--u));background:linear-gradient(rgba(255,255,255,.5),rgba(255,255,255,0))}
.rh .pad svg{width:calc(38*var(--u));height:calc(38*var(--u));filter:drop-shadow(0 calc(2*var(--u)) 0 rgba(43,36,56,.55))}
.rh .pad b{font-size:calc(22*var(--u));font-weight:900;color:#2b2438;line-height:1}
.rh .pad em{font-style:normal;font-size:calc(10*var(--u));font-weight:800;color:rgba(43,36,56,.7);letter-spacing:.14em}
.rh .pad.on{transform:translateY(calc(5*var(--u)) ) scale(.97);filter:brightness(1.25) saturate(1.2)}
.rh .center{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:calc(150*var(--u))}
.rh .count{position:absolute;left:0;right:0;top:34%;text-align:center;font-weight:900;font-size:calc(96*var(--u));color:#fff2dc;-webkit-text-stroke:calc(3*var(--u)) #2b2438;paint-order:stroke fill;text-shadow:0 calc(6*var(--u)) 0 #2b2438,0 0 calc(30*var(--u)) rgba(255,90,170,.8);opacity:0}
.rh .count.on{animation:rhcount .55s ease-out}
@keyframes rhcount{0%{opacity:0;transform:scale(2)}25%{opacity:1;transform:scale(1)}80%{opacity:1}100%{opacity:0;transform:scale(.85)}}
.rh .card{position:relative;width:calc(400*var(--u));max-width:92%;padding:calc(22*var(--u)) calc(20*var(--u)) calc(20*var(--u));border-radius:calc(26*var(--u));background:linear-gradient(#3a2d58,#2b2040);border:calc(4*var(--u)) solid #2b2438;box-shadow:0 calc(8*var(--u)) 0 #17102b,0 0 calc(40*var(--u)) rgba(255,90,170,.35),inset 0 0 0 calc(2*var(--u)) rgba(255,210,122,.35);text-align:center;animation:rhcard .35s cubic-bezier(.2,1.3,.4,1)}
@keyframes rhcard{0%{opacity:0;transform:translateY(calc(30*var(--u))) scale(.9)}100%{opacity:1;transform:none}}
.rh .card h1{margin:0;font-size:calc(30*var(--u));font-weight:900;letter-spacing:.06em;color:#fff2dc;text-shadow:0 calc(3*var(--u)) 0 #2b2438,0 0 calc(18*var(--u)) rgba(255,62,165,.7)}
.rh .card p{margin:calc(8*var(--u)) 0 calc(14*var(--u));font-size:calc(14*var(--u));line-height:1.35;color:#e6d9ff}
.rh .row{display:flex;gap:calc(8*var(--u));justify-content:center;margin:calc(10*var(--u)) 0}
.rh .chip{padding:calc(9*var(--u)) calc(14*var(--u));border-radius:calc(14*var(--u));border:calc(2*var(--u)) solid #2b2438;background:#4a3d6e;color:#e6d9ff;font-weight:900;font-size:calc(13*var(--u));letter-spacing:.08em;cursor:pointer;box-shadow:0 calc(3*var(--u)) 0 #17102b}
.rh .chip.sel{background:linear-gradient(#ffe88a,#ffbf3f);color:#2b2438}
.rh .go{display:block;width:100%;margin-top:calc(8*var(--u));height:calc(56*var(--u));border-radius:calc(28*var(--u));border:calc(3*var(--u)) solid #2b2438;background:linear-gradient(#ff7ab8,#ff3ea5);color:#fff2dc;font-weight:900;font-size:calc(24*var(--u));letter-spacing:.12em;text-shadow:0 calc(2*var(--u)) 0 #8a1f4d;box-shadow:0 calc(5*var(--u)) 0 #8a1f4d;cursor:pointer}
.rh .go:active{transform:translateY(calc(3*var(--u)));box-shadow:0 calc(2*var(--u)) 0 #8a1f4d}
.rh .go.alt{background:linear-gradient(#5ff6ec,#27c8bb);text-shadow:0 calc(2*var(--u)) 0 #0f6a85;box-shadow:0 calc(5*var(--u)) 0 #0f6a85;font-size:calc(18*var(--u));height:calc(46*var(--u))}
.rh .grade{font-size:calc(120*var(--u));font-weight:900;line-height:.95;margin:calc(2*var(--u)) 0 0;-webkit-text-stroke:calc(4*var(--u)) #2b2438;paint-order:stroke fill;text-shadow:0 calc(8*var(--u)) 0 #2b2438}
.rh .gl{font-size:calc(13*var(--u));font-weight:900;letter-spacing:.3em;color:#ffd27a;margin-bottom:calc(10*var(--u))}
.rh .stats{display:grid;grid-template-columns:1fr 1fr;gap:calc(6*var(--u)) calc(14*var(--u));text-align:left;margin:calc(8*var(--u)) 0 calc(6*var(--u));padding:calc(10*var(--u)) calc(14*var(--u));background:rgba(23,16,43,.55);border-radius:calc(14*var(--u))}
.rh .stats span{font-size:calc(12*var(--u));font-weight:800;letter-spacing:.1em;color:#c9b9ec}.rh .stats b{float:right;font-size:calc(15*var(--u));color:#fff2dc}
.rh .lanes{display:flex;gap:calc(6*var(--u));justify-content:center;margin:calc(6*var(--u)) 0 calc(8*var(--u))}
.rh .lanes div{width:calc(56*var(--u));text-align:center;font-weight:900;font-size:calc(11*var(--u));color:#2b2438;border-radius:calc(8*var(--u));padding:calc(4*var(--u)) 0;border:calc(2*var(--u)) solid #2b2438}
.rh .toast{position:absolute;left:50%;top:calc(104*var(--u));transform:translateX(-50%);padding:calc(6*var(--u)) calc(14*var(--u));border-radius:calc(14*var(--u));background:rgba(43,36,56,.9);border:calc(2*var(--u)) solid #ffd27a;color:#fff2dc;font-size:calc(12*var(--u));font-weight:800;letter-spacing:.06em;opacity:0;transition:opacity .25s;white-space:nowrap}
.rh .toast.on{opacity:1}
.rh .flash{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 60%,rgba(255,255,255,.0),rgba(255,255,255,.0));opacity:0}
`;
const SHAPES = [
  '<svg viewBox="0 0 40 40"><polygon points="20,3 35,11.5 35,28.5 20,37 5,28.5 5,11.5" fill="#fff4d6" stroke="#2b2438" stroke-width="3" stroke-linejoin="round"/></svg>',
  '<svg viewBox="0 0 40 40"><polygon points="20,4 37,34 3,34" fill="#fff4d6" stroke="#2b2438" stroke-width="3" stroke-linejoin="round"/></svg>',
  '<svg viewBox="0 0 40 40"><rect x="6" y="6" width="28" height="28" rx="3" fill="#fff4d6" stroke="#2b2438" stroke-width="3" stroke-linejoin="round"/></svg>',
  '<svg viewBox="0 0 40 40"><polygon points="20,2 33,20 20,38 7,20" fill="#fff4d6" stroke="#2b2438" stroke-width="3" stroke-linejoin="round"/></svg>',
];
const GRADE_COL = { S: '#ffe14d', A: '#9dff4a', B: '#35f2e0', C: '#ff9a4a', D: '#ff6b7a' };
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export function buildUI(hud, api) {
  if (!document.querySelector('style[data-rhythm]')) { const s = document.createElement('style'); s.setAttribute('data-rhythm', '1'); s.textContent = CSS; document.head.appendChild(s); }
  const root = el('div', 'rh'); root.setAttribute('data-rhythm', 'hud'); hud.appendChild(root);
  const U = {}; let popsN = 0, toastT = 0, u = 1;
  // top bar
  const top = el('div', 'top'), back = el('button', 'rbtn', 'BACK'), mic = el('button', 'rbtn', 'MIC OFF'), sc = el('div', 'score', '<b>0</b><i>SCORE</i>');
  back.onclick = () => api.quit(); mic.onclick = () => api.toggleMic(); top.append(back, sc, mic); root.appendChild(top); U.score = sc.firstChild; U.mic = mic; U.back = back;
  if (!api.hasMic) mic.style.visibility = 'hidden';
  // crowd meter
  const meter = el('div', 'meter', '<div class="fill"></div><div class="name">CROWD</div>'); U.fill = meter.querySelector('.fill');
  [[0.33, 'LIGHTS'], [0.6, 'CONFETTI'], [0.85, 'FIREWORKS']].forEach(([p, name]) => { const t = el('div', 'tick'); t.style.left = p * 100 + '%'; const l = el('div', 'lab', name); l.style.left = p * 100 + '%'; l.dataset.p = p; meter.append(t, l); });
  root.appendChild(meter); U.meter = meter;
  const combo = el('div', 'combo', '0<small>COMBO</small>'); root.appendChild(combo); U.combo = combo;
  const pops = el('div', 'pops'); root.appendChild(pops); U.pops = pops;
  const count = el('div', 'count', '3'); root.appendChild(count); U.count = count;
  const toast = el('div', 'toast', ''); root.appendChild(toast); U.toast = toast;
  // pads
  const pads = el('div', 'pads'); U.pads = [];
  LANES.forEach((L, i) => {
    const p = el('div', 'pad', SHAPES[i] + '<b>' + L.name + '</b><em>' + L.keys[0].replace('Key', '') + '</em>'); p.style.background = 'linear-gradient(' + L.hi + ',' + L.color + ' 55%,' + L.dark + ')'; p.style.boxShadow = '0 calc(6*var(--u)) 0 #17102b, 0 0 calc(18*var(--u)) ' + L.color + '88, inset 0 calc(-8*var(--u)) 0 ' + L.dark + '55';
    p.addEventListener('pointerdown', (e) => { e.preventDefault(); try { p.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } p.classList.add('on'); api.press(i, { fromUI: true }); });
    const up = () => p.classList.remove('on'); p.addEventListener('pointerup', up); p.addEventListener('pointercancel', up); p.addEventListener('lostpointercapture', up); p.addEventListener('contextmenu', (e) => e.preventDefault());
    pads.appendChild(p); U.pads.push(p);
  });
  root.appendChild(pads);
  let card = null;
  function clearCard() { if (card) { card.remove(); card = null; } }
  function showStart(cfg) {
    clearCard(); const wrap = el('div', 'center'); const c = el('div', 'card'); c.innerHTML = '<h1>BUSKING SET</h1><p>Hit the gems as they reach the glowing ring.<br>Tap the pads or press <b>D F J K</b>. Beatbox into the mic if you like.</p>';
    const row = el('div', 'row'); const levels = [['EASY', 0.2], ['MEDIUM', 0.5], ['HARD', 0.85]]; let sel = cfg.difficulty; const near = levels.reduce((b, l) => (Math.abs(l[1] - sel) < Math.abs(b[1] - sel) ? l : b), levels[1]); sel = near[1];
    const chips = levels.map(([n, v]) => { const b = el('button', 'chip' + (v === sel ? ' sel' : ''), n); b.onclick = () => { sel = v; chips.forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); }; row.appendChild(b); return b; });
    const go = el('button', 'go', 'START'); go.onclick = () => { clearCard(); api.start({ difficulty: sel, fromUI: true }); };
    c.append(row, go); wrap.appendChild(c); root.appendChild(wrap); card = wrap;
  }
  function showResult(r, again) {
    clearCard(); const wrap = el('div', 'center'), c = el('div', 'card'), gc = GRADE_COL[r.grade] || '#fff2dc';
    const praise = r.grade === 'S' ? 'FLAWLESS SET!' : r.grade === 'A' ? 'THE CROWD LOVES YOU' : r.grade === 'B' ? 'NICE GROOVE' : r.grade === 'C' ? 'KEEP PRACTISING' : 'TOUGH CROWD';
    c.innerHTML = '<div class="gl">' + praise + '</div><div class="grade" style="color:' + gc + '">' + r.grade + '</div>' +
      '<div class="stats"><span>SCORE<b>' + r.score + '</b></span><span>ACCURACY<b>' + Math.round(r.accuracy * 100) + '%</b></span><span>PERFECT<b>' + r.perfect + '</b></span><span>GOOD<b>' + r.good + '</b></span><span>MISS<b>' + r.miss + '</b></span><span>BEST COMBO<b>' + r.bestCombo + '</b></span></div>' +
      '<div class="lanes">' + LANES.map((L, i) => '<div style="background:' + L.color + '">' + L.name + ' ' + r.perfectLane[i] + '</div>').join('') + '</div>' + (r.battle ? '<p>' + (r.battle.win ? 'YOU WIN THE BATTLE' : 'YOU LOSE THE BATTLE') + ' (' + r.battle.forPlayer + '/5 judges)</p>' : '');
    const a = el('button', 'go', 'PLAY AGAIN'), b = el('button', 'go alt', 'BACK TO THE PARK'); a.onclick = () => { clearCard(); again(); }; b.onclick = () => api.quit(); c.append(a, b); wrap.appendChild(c); root.appendChild(wrap); card = wrap;
  }
  function showPicker(styles, round, oppName, onPick) {
    clearCard(); const wrap = el('div', 'center'), c = el('div', 'card'); c.innerHTML = '<h1>ROUND ' + (round + 1) + '</h1><p>' + oppName + ' is waiting. Pick a style: BOOM beats HATS beats RIM beats SNARE beats BOOM.</p>';
    styles.forEach((st) => { const b = el('button', 'go alt', st.name.toUpperCase()); b.style.marginTop = 'calc(8*var(--u))'; b.onclick = () => { clearCard(); onPick(st.id); }; c.appendChild(b); }); wrap.appendChild(c); root.appendChild(wrap); card = wrap;
  }
  return {
    root, el: U, showStart, showResult, showPicker, clearCard, hasCard: () => !!card,
    resize(w, h) { u = w / 540; root.style.setProperty('--u', u + 'px'); },
    setScore(v) { U.score.textContent = String(Math.round(v)); },
    setCombo(n, bump) { U.combo.classList.toggle('on', n >= 2); if (n >= 2) { U.combo.firstChild.nodeValue = n; if (bump) { U.combo.classList.remove('bump'); void U.combo.offsetWidth; U.combo.classList.add('bump'); } } },
    setEnergy(e) { U.fill.style.width = Math.round(e * 100) + '%'; U.meter.querySelectorAll('.lab').forEach((l) => l.classList.toggle('on', e >= +l.dataset.p)); },
    pop(text, grade, x, y, big) { if (popsN > 7) return; popsN++; const p = el('div', 'pop ' + grade + (big ? ' big' : ''), text); p.style.left = x + 'px'; p.style.top = y + 'px'; U.pops.appendChild(p); setTimeout(() => { p.remove(); popsN--; }, 760); },
    countdown(txt) { U.count.textContent = txt; U.count.classList.remove('on'); void U.count.offsetWidth; U.count.classList.add('on'); },
    toast(msg, ms) { U.toast.textContent = msg; U.toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => U.toast.classList.remove('on'), ms || 2000); },
    setMic(on) { U.mic.textContent = on ? 'MIC ON' : 'MIC OFF'; U.mic.classList.toggle('on', on); },
    padFlash(i) { const p = U.pads[i]; p.classList.add('on'); setTimeout(() => p.classList.remove('on'), 70); },
    dispose() { root.remove(); },
  };
}

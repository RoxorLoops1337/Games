// RHYTHM TRAINING (TRAINING_PLAN 1 + BEAT): 8 levels of real, known beatbox patterns (Core.BEAT_LEVELS), played in the lab booth with the practice look.
//   Each level: LISTEN (the hero beatboxes the pattern once, the lanes light up, the pattern text and its name show) -> YOUR TURN (count-in) -> 4 bars of gems.
//   Judged with the normal windows; q = accuracy; 70% unlocks the next level (Core trainGame does the real unlock in the game).
// This file: the level list (Core or a fallback), the chart of a level, and the DOM for the level select, the pattern strip and the training result card.
import { LANES } from './mg_rhythm_hw.js';

const FALLBACK = [['bootscats', 'Boots and Cats', 'B.t.K.t.', 80], ['bootsti', 'Boots Ti Ti', 'BttBK.t.', 84], ['eighthhats', 'Running Hats', 'BtttKttt', 88], ['boombap', 'Boom Bap', 'B.tBK.t.', 90], ['doublekick', 'Double Kick', 'BtKBBtKt', 94], ['pfclap', 'Pf Clap', 'BtKtBPKt', 98], ['dnb', 'Drum and Bass', 'B.K..BK.', 150], ['doubletime', 'Double Time Mix', 'BtBtKtBtBBKtPtKt', 92]];
const LANE_OF = { B: 0, b: 0, t: 1, T: 1, h: 1, K: 2, k: 2, P: 3, p: 3 };
export const TRAIN_BARS = 4, UNLOCK_Q = 0.7;

export function beatLevels(Core) {
  const src = Core && Array.isArray(Core.BEAT_LEVELS) && Core.BEAT_LEVELS.length ? Core.BEAT_LEVELS : FALLBACK.map(([id, name, lanes, bpm], i) => ({ level: i + 1, id, name, lanes, bpm, steps: lanes.length, tip: '' }));
  return src.map((L, i) => {
    const lanes = String(L.lanes || ''), steps = L.steps || lanes.length || 8;
    const notes = Array.isArray(L.notes) && L.notes.length ? L.notes.map((n) => ({ step: n.step, beat: n.beat, lane: n.lane })) : lanes.split('').map((c, s) => ({ step: s, beat: s * 4 / steps, lane: LANE_OF[c] === undefined ? -1 : LANE_OF[c] })).filter((n) => n.lane >= 0);
    return { level: L.level || i + 1, id: L.id || 'lv' + (i + 1), name: L.name || 'Level ' + (i + 1), say: L.say || lanes.replace(/\./g, ' . ').replace(/(\w)/g, ' $1 ').trim(), lanes, steps, bpm: L.bpm || 90, tip: L.tip || '', notes };
  });
}
// the gems of one level: the one bar pattern repeated for `bars` bars (beats from 0)
export function trainChart(L, bars) { const out = []; for (let b = 0; b < (bars || TRAIN_BARS); b++) for (const n of L.notes) out.push({ beat: b * 4 + n.beat, lane: n.lane }); return out; }

const CSS = `
.rh.train .meter{opacity:0}
.rh.train .combo{top:calc(236*var(--u))}
.rh .ps{position:absolute;left:calc(16*var(--u));right:calc(16*var(--u));top:calc(62*var(--u));text-align:center;opacity:0;transform:translateY(calc(-8*var(--u)));transition:opacity .25s,transform .25s}
.rh .ps.on{opacity:1;transform:none}
.rh .ps .lbl{display:inline-block;padding:calc(3*var(--u)) calc(12*var(--u));border-radius:calc(10*var(--u));background:#ffe14d;color:#17102b;font-weight:900;font-size:calc(12*var(--u));letter-spacing:.24em;box-shadow:0 calc(3*var(--u)) 0 #17102b}
.rh .ps .lbl.you{background:linear-gradient(#7af0ff,#27c8bb)}
.rh .ps .nm{margin-top:calc(6*var(--u));font-weight:900;font-size:calc(30*var(--u));letter-spacing:.06em;color:#fff2dc;-webkit-text-stroke:calc(1.5*var(--u)) #2b2438;paint-order:stroke fill;text-shadow:0 calc(3*var(--u)) 0 #2b2438,0 0 calc(18*var(--u)) rgba(53,242,224,.65);text-transform:uppercase;white-space:nowrap}
.rh .ps .say{font-weight:900;font-size:calc(17*var(--u));letter-spacing:.12em;color:#ffd27a;text-shadow:0 1px 0 #2b2438;margin-top:calc(2*var(--u))}
.rh .ps .steps{display:flex;gap:calc(4*var(--u));justify-content:center;margin-top:calc(8*var(--u))}
.rh .ps .s{flex:0 0 auto;width:calc(var(--sw)*var(--u));height:calc(34*var(--u));border-radius:calc(8*var(--u));border:calc(2*var(--u)) solid #2b2438;background:rgba(43,36,56,.78);color:#2b2438;font-weight:900;font-size:calc(15*var(--u));line-height:calc(30*var(--u));transition:transform .06s}
.rh .ps .s.r{color:#8a7cae;background:rgba(43,36,56,.5)}
.rh .ps .s.on{transform:translateY(calc(-5*var(--u))) scale(1.12);filter:brightness(1.3);box-shadow:0 0 calc(14*var(--u)) #fff2dc}
.rh .ps .s.r.on{background:rgba(255,242,220,.35)}
.rh .lv{max-width:94%;padding-bottom:calc(14*var(--u))}
.rh .lv h1{font-size:calc(26*var(--u))}
.rh .lv p{margin:calc(4*var(--u)) 0 calc(8*var(--u));font-size:calc(12*var(--u))}
.rh .lv .l{display:flex;align-items:center;gap:calc(10*var(--u));width:100%;margin-top:calc(6*var(--u));padding:calc(6*var(--u)) calc(12*var(--u));border-radius:calc(16*var(--u));border:calc(3*var(--u)) solid #2b2438;background:linear-gradient(#5ff6ec,#27c8bb);color:#17102b;text-align:left;cursor:pointer;box-shadow:0 calc(4*var(--u)) 0 #17102b;font-family:inherit}
.rh .lv .l:active{transform:translateY(calc(2*var(--u)))}
.rh .lv .l.lock{background:#4a3d6e;color:#9d8fc4;cursor:default;box-shadow:0 calc(4*var(--u)) 0 #17102b;opacity:.85}
.rh .lv .l.cur{outline:calc(3*var(--u)) dashed #ffe14d;outline-offset:calc(2*var(--u))}
.rh .lv .l .n{font-size:calc(22*var(--u));font-weight:900;min-width:calc(26*var(--u));text-align:center}
.rh .lv .l .t{flex:1;min-width:0}
.rh .lv .l .t b{display:block;font-size:calc(14*var(--u));font-weight:900;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rh .lv .l .t i{display:block;font-style:normal;font-size:calc(10*var(--u));font-weight:800;letter-spacing:.12em;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rh .lv .l .g{min-width:calc(38*var(--u));height:calc(34*var(--u));border-radius:calc(10*var(--u));border:calc(2*var(--u)) solid #2b2438;background:rgba(23,16,43,.75);color:#fff2dc;font-weight:900;font-size:calc(18*var(--u));line-height:calc(30*var(--u));text-align:center}
.rh .lv .l.lock .g{font-size:calc(10*var(--u));letter-spacing:.06em;color:#9d8fc4}
.rh .tr .gl{margin-bottom:calc(2*var(--u))}
.rh .tr .grade{font-size:calc(96*var(--u))}
.rh .tr .pass{margin:calc(4*var(--u)) 0;font-weight:900;font-size:calc(15*var(--u));letter-spacing:.08em}
.rh .tr .pass.y{color:#9dff4a}.rh .tr .pass.n{color:#ff9a4a}
.rh .tr .tip{margin:calc(8*var(--u)) 0 calc(4*var(--u));padding:calc(8*var(--u)) calc(12*var(--u));border-radius:calc(12*var(--u));background:rgba(23,16,43,.55);text-align:left;font-size:calc(12*var(--u));line-height:1.35;color:#e6d9ff}
.rh .tr .tip b{display:block;font-size:calc(10*var(--u));letter-spacing:.2em;color:#ffd27a;margin-bottom:calc(2*var(--u))}
.rh .tr .row{margin:calc(8*var(--u)) 0 0}.rh .tr .row .go{margin:0;font-size:calc(16*var(--u));height:calc(46*var(--u))}
.rh .tr .go.dim{background:linear-gradient(#ffe88a,#ffbf3f);color:#2b2438;text-shadow:none;box-shadow:0 calc(4*var(--u)) 0 #8a5a08;font-size:calc(15*var(--u));height:calc(40*var(--u))}
`;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (v) => String(v === undefined || v === null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const GRADE_COL = { S: '#ffe14d', A: '#9dff4a', B: '#35f2e0', C: '#ff9a4a', D: '#ff6b7a' };
const TOK = ['B', 't', 'K', 'Pf'];

// ui: the buildUI() object (its root, card helpers). Adds the training pieces next to it.
export function buildTrainUI(ui) {
  if (!document.querySelector('style[data-rhythm-train]')) { const s = document.createElement('style'); s.setAttribute('data-rhythm-train', '1'); s.textContent = CSS; document.head.appendChild(s); }
  const root = ui.root; let ps = null, cells = [], lit = -1, card = null;
  function clear() { if (card) { card.remove(); card = null; } }
  // the pattern strip: label (LISTEN / YOUR TURN), the name, how you say it, one cell per step lit in time
  function showPattern(L, label) {
    hidePattern(); ps = el('div', 'ps'); const byStep = {}; L.notes.forEach((n) => { byStep[n.step] = n.lane; });
    const sw = Math.max(22, Math.min(46, Math.floor(470 / L.steps) - 4)); ps.style.setProperty('--sw', String(sw));
    let cellsHtml = ''; for (let s = 0; s < L.steps; s++) { const ln = byStep[s]; cellsHtml += ln === undefined ? '<div class="s r">.</div>' : '<div class="s" style="background:linear-gradient(' + LANES[ln].hi + ',' + LANES[ln].color + ')">' + (L.steps > 8 ? TOK[ln].slice(0, 1) : TOK[ln]) + '</div>'; }
    ps.innerHTML = '<div class="lbl">' + esc(label || 'LISTEN') + '</div><div class="nm">' + esc(L.name) + '</div><div class="say">"' + esc(L.say) + '"</div><div class="steps">' + cellsHtml + '</div>';
    root.appendChild(ps); root.classList.add('train'); cells = [...ps.querySelectorAll('.s')]; lit = -1; requestAnimationFrame(() => { if (ps) ps.classList.add('on'); });
  }
  function patternLabel(t, you) { if (!ps) return; const l = ps.querySelector('.lbl'); if (l.textContent !== t) { l.textContent = t; l.classList.toggle('you', !!you); } }
  function patternStep(i) { if (i === lit) return; if (cells[lit]) cells[lit].classList.remove('on'); lit = i; if (cells[i]) cells[i].classList.add('on'); }
  function hidePattern() { root.classList.remove('train'); if (ps) { ps.remove(); ps = null; cells = []; lit = -1; } }
  // level select. prog: { unlocked, best: { [level]: grade } }, cur: highlighted level
  function showLevels(levels, prog, cur, onPick) {
    ui.clearCard(); clear(); hidePattern(); const wrap = el('div', 'center'), c = el('div', 'card lv'); wrap.style.alignItems = 'center'; wrap.style.paddingBottom = '0';
    c.innerHTML = '<h1>RHYTHM TRAINING</h1><p>Real beatbox patterns. Listen once, then play it back. Score 70% to unlock the next level.</p>';
    levels.forEach((L) => {
      const open = L.level <= (prog.unlocked || 1), best = prog.best && prog.best[L.level];
      const b = el('button', 'l' + (open ? '' : ' lock') + (L.level === cur ? ' cur' : ''), '<span class="n">' + L.level + '</span><span class="t"><b>' + esc(L.name) + '</b><i>' + esc(L.say) + '  -  ' + L.bpm + ' BPM</i></span><span class="g"' + (best ? ' style="color:' + (GRADE_COL[best] || '#fff2dc') + '"' : '') + '>' + (open ? esc(best || '-') : 'LOCK') + '</span>');
      b.setAttribute('data-level', L.level); if (!open) b.setAttribute('data-locked', '1'); b.onclick = () => { if (!open) { ui.toast('Score 70% on level ' + (L.level - 1) + ' to unlock', 1800); return; } clear(); onPick(L.level); }; c.appendChild(b);
    });
    wrap.appendChild(c); root.appendChild(wrap); card = wrap;
  }
  // training result card. r: result, o: { L, next (level object or null), unlocked (bool, next level open), passed, game, onAct(act) } acts: 'next' | 'again' | 'levels' | 'continue'
  function showTrainResult(r, o) {
    ui.clearCard(); clear(); hidePattern(); const wrap = el('div', 'center'), c = el('div', 'card tr'), gc = GRADE_COL[r.grade] || '#fff2dc', L = o.L, nx = o.next;
    const pass = r.accuracy >= UNLOCK_Q, msg = pass ? (nx ? (o.unlocked ? 'LEVEL ' + nx.level + ' UNLOCKED' : 'LEVEL CLEARED') : 'ALL LEVELS CLEARED!') : 'SCORE 70% TO CLEAR (YOU GOT ' + Math.round(r.accuracy * 100) + '%)';
    const tipL = pass && nx ? nx : L;
    c.innerHTML = '<div class="gl">LEVEL ' + L.level + ' - ' + esc(String(L.name).toUpperCase()) + '</div><div class="grade" style="color:' + gc + '">' + r.grade + '</div>' +
      '<div class="pass ' + (pass ? 'y' : 'n') + '">' + esc(msg) + '</div>' +
      '<div class="stats"><span>ACCURACY<b>' + Math.round(r.accuracy * 100) + '%</b></span><span>BEST COMBO<b>' + r.bestCombo + '</b></span><span>PERFECT<b>' + r.perfect + '</b></span><span>GOOD<b>' + r.good + '</b></span><span>MISS<b>' + r.miss + '</b></span><span>BPM<b>' + L.bpm + '</b></span></div>' +
      '<div class="rw"></div>' + (tipL.tip ? '<div class="tip"><b>' + (tipL === L ? 'TIP' : 'NEXT UP: ' + esc(String(tipL.name).toUpperCase())) + '</b>' + esc(tipL.tip) + '</div>' : '');
    const row = el('div', 'row'), mk = (t, act, cls) => { const b = el('button', 'go' + (cls ? ' ' + cls : ''), t); b.setAttribute('data-act', act); b.onclick = () => { if (b.disabled) return; [...c.querySelectorAll('button')].forEach((x) => { x.disabled = true; }); o.onAct(act); }; return b; };
    if (pass && nx && o.unlocked !== false) row.appendChild(mk('NEXT LEVEL', 'next')); else row.appendChild(mk('TRY AGAIN', 'again'));
    row.appendChild(mk('LEVELS', 'levels', 'alt')); c.appendChild(row);
    if (pass && nx) { const ag = mk('PLAY AGAIN', 'again', 'dim'); ag.style.marginTop = 'calc(8*var(--u))'; c.appendChild(ag); }
    c.appendChild(mk(o.game ? 'CONTINUE' : 'BACK', 'continue', 'alt'));
    wrap.appendChild(c); root.appendChild(wrap); card = wrap;
  }
  return { showPattern, patternLabel, patternStep, hidePattern, showLevels, showTrainResult, clear, hasCard: () => !!card, dispose() { clear(); hidePattern(); } };
}

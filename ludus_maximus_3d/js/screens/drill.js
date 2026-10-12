// Training drill minigames (timing / sprint / combo / reflex), ported from the 2D ACT.drill. Result goes through LM.setDrill.
import { h, U, D, L, portrait, injectCss, addCss, chip, wide } from './ui_common.js';

const CSS = `
.dr{display:grid;gap:12px;justify-items:stretch}
.dr-head{display:flex;gap:12px;align-items:center;min-width:0}
.dr-help{margin:0;font:600 14px/20px var(--lx-sans);color:#4a3550;overflow-wrap:anywhere}
.dr-res{min-height:64px;display:grid;place-items:center;text-align:center;font:900 26px/30px var(--lx-serif);letter-spacing:.06em;text-transform:uppercase;overflow-wrap:anywhere}
.dr-res small{display:block;font:700 13px var(--lx-sans);letter-spacing:.02em;text-transform:none;color:#5a4560;margin-top:2px}
.dr-res.pop{animation:dr-pop .5s var(--lx-ease) both}
.dr-res.good{color:#2f7a3f;text-shadow:0 0 14px rgba(95,174,110,.55)} .dr-res.perfect{color:#b07a10;text-shadow:0 0 18px rgba(242,193,78,.9)} .dr-res.bad{color:#9d2a20}
@keyframes dr-pop{from{transform:scale(.5);opacity:0}60%{transform:scale(1.12)}}
.dr-track{position:relative;height:64px;border-radius:12px;background:linear-gradient(180deg,#2a2540,#140f22);box-shadow:inset 0 3px 8px #000,0 0 0 2px #b8803a;overflow:hidden;touch-action:manipulation;cursor:pointer}
.dr-z{position:absolute;top:0;bottom:0}
.dr-z.z1{left:27.5%;width:45%;background:rgba(95,174,110,.28)} .dr-z.z2{left:35%;width:30%;background:rgba(95,174,110,.5)} .dr-z.z3{left:45%;width:10%;background:linear-gradient(180deg,#ffe08a,#e0a82e);box-shadow:0 0 16px rgba(242,193,78,.9)}
.dr-m{position:absolute;top:-4px;bottom:-4px;width:10px;margin-left:-5px;border-radius:5px;background:linear-gradient(180deg,#fff,#e8dcc0);box-shadow:0 0 12px #fff,0 0 0 2px #1d1830;will-change:left}
.dr-track.hit{animation:dr-flash .4s}
@keyframes dr-flash{30%{box-shadow:inset 0 3px 8px #000,0 0 0 2px #b8803a,0 0 28px 6px rgba(242,193,78,.9)}}
.dr-pad{min-height:150px;width:100%;border-radius:18px;border:0;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none;font:900 32px/1 var(--lx-serif);letter-spacing:.1em;text-transform:uppercase;color:#fff;text-shadow:0 2px 3px rgba(0,0,0,.6);position:relative;overflow:hidden;
  background:linear-gradient(180deg,#e0644f,#9d2a20);box-shadow:0 7px 0 #4a120d,0 12px 20px rgba(0,0,0,.4),inset 0 2px 0 rgba(255,255,255,.4);transition:transform .06s,box-shadow .06s,background .15s}
.dr-pad:active:not(:disabled){transform:translateY(5px);box-shadow:0 2px 0 #4a120d,0 4px 8px rgba(0,0,0,.4)}
.dr-pad:disabled{filter:grayscale(.7) brightness(.8);cursor:default}
.dr-pad:focus-visible{outline:4px solid #5a1f5e;outline-offset:3px}
.dr-pad.wait{background:linear-gradient(180deg,#9a9aa4,#5c6068);box-shadow:0 7px 0 #34363c,0 12px 20px rgba(0,0,0,.4)}
.dr-pad.go{background:linear-gradient(180deg,#6fd08a,#2f8a4f);box-shadow:0 7px 0 #1a4a2a,0 12px 20px rgba(0,0,0,.4),0 0 30px rgba(111,208,138,.8)}
.dr-pad.stop{background:linear-gradient(180deg,#ffe08a,#e0a82e);color:#3b2711;text-shadow:none;box-shadow:0 7px 0 #7a5222,0 12px 20px rgba(0,0,0,.4)}
.dr-rip{position:absolute;border-radius:50%;pointer-events:none;border:4px solid rgba(255,255,255,.85);width:30px;height:30px;margin:-15px;animation:dr-rip .5s ease-out forwards}
@keyframes dr-rip{to{transform:scale(7);opacity:0}}
.dr-count{display:flex;align-items:baseline;justify-content:center;gap:8px;font:900 56px/1 var(--lx-serif);color:#2a1a30}
.dr-count small{font:700 14px var(--lx-sans);color:#7a5222}
.dr-seq{display:flex;gap:10px;justify-content:center}
.dr-tile{width:76px;height:76px;border-radius:14px;display:grid;place-items:center;font:900 44px/1 var(--lx-sans);color:#3b2711;background:linear-gradient(180deg,#fff8e6,#e8d6a8);box-shadow:inset 0 0 0 2px #b8803a,0 3px 0 #7a5222}
.dr-tile.q{color:#9a7a42;background:linear-gradient(180deg,#e8dcc0,#cdb98a)} .dr-tile.ok{background:linear-gradient(180deg,#bfeccb,#7ac28a)} .dr-tile.no{background:linear-gradient(180deg,#f6c0b6,#d8786a)}
.dr-keys{display:flex;gap:12px;justify-content:center}
.dr-key{width:88px;height:88px;border-radius:16px;border:0;font:900 44px/1 var(--lx-sans);cursor:pointer;touch-action:manipulation;color:#fff2d6;text-shadow:0 2px 0 rgba(0,0,0,.5);background:linear-gradient(180deg,#d8a35c,#8a5a26);box-shadow:0 6px 0 #4a2f12,0 10px 14px rgba(0,0,0,.35),inset 0 2px 0 rgba(255,235,190,.5)}
.dr-key:active:not(:disabled){transform:translateY(4px);box-shadow:0 2px 0 #4a2f12}
.dr-key:disabled{filter:grayscale(.8) brightness(.8);cursor:default}
.dr-key:focus-visible{outline:4px solid #5a1f5e;outline-offset:3px}
.dr-time{height:10px}
`;
const ARROWS = ['←', '↑', '→'];

export function open(ctx, g, onDone) {
  injectCss(); addCss(CSS);
  const S = ctx.S, lm = L(), d = D();
  if (!lm.canDrill(S, g)) { ctx.toast('Set a training activity first. One drill per fighter each week.', { kind: 'bad' }); ctx.sfx('uiError'); return; }
  const kind = lm.drillKind(S), stat = d.SN[lm.activity(g).s];
  const TITLES = { timing: 'Timing drill', sprint: 'Sprint drill', combo: 'Combo drill', react: 'Reflex drill' };
  const HELP = {
    timing: `${g.name} drills ${stat}. Stop the marker in the green zone. The gold center is perfect. A better Palaestra slows the marker and adds a little bonus.`,
    sprint: `${g.name} drills ${stat}. Tap as fast as you can for 3 seconds after the first tap. 22 taps is perfect.`,
    combo: `${g.name} drills ${stat}. Memorise the three moves, then repeat them in order.`,
    react: `${g.name} drills ${stat}. Wait for the pad to turn green, then tap as fast as you can. Too early counts as a miss.`,
  };
  let dead = false, done = false; const timers = []; let raf = 0;
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const body = h('div', 'lm-sheetbody dr');
  const m = wide(ctx.sheet({ title: TITLES[kind], body, onClose: () => { dead = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout); document.removeEventListener('keydown', onKey); } }), 520);
  const res = h('div', 'dr-res'); res.setAttribute('role', 'status'); res.setAttribute('aria-live', 'polite');
  body.append(h('div', 'dr-head', [portrait(ctx, g, 56), h('div', 'lm-grow', [h('div', 'lm-name', g.name), h('div', 'lm-chips', [chip(TITLES[kind], 'gold'), chip(stat, 'bronze')])])]), h('p', 'dr-help', HELP[kind]));
  const stage = h('div', 'dr'); body.append(stage, res);
  let keyFn = null;
  const onKey = (e) => { if ((e.key === ' ' || e.key === 'Enter') && keyFn && document.activeElement && document.activeElement.tagName !== 'BUTTON') { e.preventDefault(); keyFn(); } };
  document.addEventListener('keydown', onKey);

  function finish(acc, extra) {
    if (done || dead) return; done = true; cancelAnimationFrame(raf);
    const mult = lm.setDrill(S, g, acc);
    const perfect = mult >= 0.4, great = mult >= 0.25, good = mult >= 0.1;
    res.className = 'dr-res pop ' + (great ? (perfect ? 'perfect' : 'good') : good ? 'good' : 'bad');
    res.replaceChildren(h('div', '', [perfect ? 'Perfect! +40%' : great ? 'Great! +25%' : good ? 'Good. +10%' : 'Missed.', extra ? h('small', '', extra) : null]));
    ctx.sfx(great ? 'levelUp' : good ? 'coin' : 'uiError'); ctx.save();
    stage.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    later(() => { if (dead) return; m.close(); onDone && onDone(mult); }, 1300);
  }
  const ripple = (btn, ev) => { const r = btn.getBoundingClientRect(), i = h('i', 'dr-rip'); i.style.left = (ev.clientX - r.left) + 'px'; i.style.top = (ev.clientY - r.top) + 'px'; btn.append(i); setTimeout(() => i.remove(), 520); };

  if (kind === 'timing') {
    const track = h('div', 'dr-track'), mk = h('i', 'dr-m');
    track.append(h('i', 'dr-z z1'), h('i', 'dr-z z2'), h('i', 'dr-z z3'), mk);
    const btn = h('button', 'dr-pad stop', 'Stop!'); btn.type = 'button';
    stage.append(track, btn);
    const t0 = performance.now(); let p = 0;
    const loop = () => { if (done || dead) return; const t = (performance.now() - t0) / 1000 * lm.drillSpeed(S), ph = t % 2; p = ph < 1 ? ph : 2 - ph; mk.style.left = (p * 100) + '%'; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const stop = () => { if (done) return; track.classList.add('hit'); finish(1 - Math.abs(p - 0.5) * 2); };
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); stop(); }); track.addEventListener('pointerdown', stop); keyFn = stop;
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stop(); } });
    setTimeout(() => btn.focus({ preventScroll: true }), 150);
  } else if (kind === 'sprint') {
    const cnt = h('div', 'dr-count lm-num', [h('span', '', '0'), h('small', '', '/ 22 taps for perfect')]);
    const tbar = U.bar({ value: 3, max: 3, kind: 'xp', height: 10 }); tbar.classList.add('dr-time');
    const btn = h('button', 'dr-pad', 'Tap!'); btn.type = 'button';
    stage.append(cnt, tbar, btn);
    let taps = 0, t1 = 0;
    const tick = () => { if (done || dead) return; const left = Math.max(0, 3 - (performance.now() - t1) / 1000); tbar.set(left, 3); if (left > 0) raf = requestAnimationFrame(tick); };
    const tap = (ev) => { if (done) return; if (!t1) { t1 = performance.now(); later(() => finish(lm.sprintAcc(taps), `${taps} taps`), 3000); raf = requestAnimationFrame(tick); } taps++; cnt.firstChild.textContent = taps; ctx.sfx('uiTap', { gain: 0.6 }); if (ev && ev.clientX != null) ripple(btn, ev); };
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(e); }); keyFn = () => tap();
    btn.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); tap(); } });
    setTimeout(() => btn.focus({ preventScroll: true }), 150);
  } else if (kind === 'combo') {
    const seq = [0, 1, 2].map(() => Math.floor(Math.random() * 3)), tapped = [];
    const tiles = seq.map((x) => h('div', 'dr-tile', ARROWS[x])); const seqEl = h('div', 'dr-seq', tiles);
    const tbar = U.bar({ value: 1.6, max: 1.6, kind: 'stam', height: 10 }); tbar.classList.add('dr-time');
    const keys = h('div', 'dr-keys', ARROWS.map((a, i) => { const b = h('button', 'dr-key', a); b.type = 'button'; b.disabled = true; b.setAttribute('aria-label', ['Left', 'Up', 'Right'][i]); b.addEventListener('pointerdown', (e) => { e.preventDefault(); press(i); }); b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(i); } }); return b; }));
    stage.append(seqEl, tbar, keys);
    const t0 = performance.now();
    const tick = () => { if (done || dead || tapped.length) return; const left = Math.max(0, 1.6 - (performance.now() - t0) / 1000); tbar.set(left, 1.6); if (left > 0) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    later(() => { tiles.forEach((t) => { t.textContent = '?'; t.classList.add('q'); }); keys.querySelectorAll('button').forEach((b) => { b.disabled = false; }); keys.firstChild.focus({ preventScroll: true }); tbar.replaceWith(h('div', 'lm-sub', 'Now repeat the moves!')); }, 1600);
    function press(i) {
      if (done || tapped.length >= 3 || keys.firstChild.disabled) return; tapped.push(i); ctx.sfx('uiTap', { gain: 0.6 });
      const k = tapped.length - 1; tiles[k].textContent = ARROWS[i]; tiles[k].classList.remove('q'); tiles[k].classList.add(i === seq[k] ? 'ok' : 'no');
      if (tapped.length >= 3) finish(lm.comboAcc(seq, tapped), `${tapped.filter((x, j) => x === seq[j]).length} of 3 correct`);
    }
  } else {
    const btn = h('button', 'dr-pad wait', 'Wait...'); btn.type = 'button'; stage.append(btn);
    const readyAt = performance.now() + 1000 + Math.random() * 2000; let on = false;
    const lp = () => { if (done || dead) return; if (performance.now() >= readyAt) { on = true; btn.className = 'dr-pad go'; btn.textContent = 'Now!'; ctx.sfx('uiConfirm', { gain: 0.5 }); } else raf = requestAnimationFrame(lp); };
    raf = requestAnimationFrame(lp);
    const hit = () => {
      if (done) return;
      if (!on) { cancelAnimationFrame(raf); btn.className = 'dr-pad wait'; btn.textContent = 'Too early'; finish(lm.reactAcc(-1), 'You tapped before the signal'); return; }
      const ms = Math.round(performance.now() - readyAt); g.rtBest = Math.min(g.rtBest || 9999, ms);
      finish(lm.reactAcc(ms), `${ms} ms, best ${g.rtBest} ms`);
    };
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); hit(); }); keyFn = hit;
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hit(); } });
    setTimeout(() => btn.focus({ preventScroll: true }), 150);
  }
  return m;
}

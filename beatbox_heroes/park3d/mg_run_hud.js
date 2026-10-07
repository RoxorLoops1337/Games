// RUN mini game DOM HUD: block progress, cadence meter with the green zone, big tap pads, hints, milestone toast, lens glare and the result card.
// The HUD never owns game state: mg_run.js calls hud.set(state) every frame and the pads call back hud.onTap(side).
const CSS = `
.mgr{position:absolute;inset:0;pointer-events:none;font-family:"Trebuchet MS",system-ui,sans-serif;color:#fff0c9;overflow:hidden}
.mgr *{box-sizing:border-box}
.mgr .top{position:absolute;left:12px;right:12px;top:calc(10px + env(safe-area-inset-top,0px));display:flex;flex-direction:column;gap:7px;pointer-events:none}
.mgr .row{display:flex;align-items:center;justify-content:space-between;gap:8px}
.mgr .quit{pointer-events:auto!important;background:rgba(23,16,43,.62);border:2px solid rgba(255,240,201,.35);color:#fff0c9;font:800 12px/1 inherit;font-family:inherit;letter-spacing:.1em;border-radius:14px;padding:8px 12px;cursor:pointer}
.mgr .score{font-weight:900;font-size:15px;letter-spacing:.08em;text-shadow:0 2px 0 #17102b,0 0 12px rgba(23,16,43,.9);text-align:center;flex:1}
.mgr .score b{color:#ffe14d}
.mgr .sub{font-size:10px;letter-spacing:.14em;color:#d9c9ff;font-weight:800;text-shadow:0 1px 0 #17102b}
.mgr .eng{min-width:64px;text-align:right;font-weight:900;font-size:15px;color:#9dff4a;text-shadow:0 2px 0 #17102b,0 0 12px rgba(23,16,43,.9)}
.mgr .segs{display:flex;gap:3px;height:11px}
.mgr .seg{flex:1;border-radius:4px;background:rgba(23,16,43,.55);border:1.5px solid rgba(255,240,201,.28);position:relative;overflow:hidden}
.mgr .seg i{position:absolute;left:0;top:0;bottom:0;width:0;background:#9dff4a}
.mgr .seg.good{background:#9dff4a;border-color:#e6ffc0}.mgr .seg.good i{display:none}
.mgr .seg.bad{background:#7a2a48;border-color:#ff8fb0}.mgr .seg.bad i{display:none}
.mgr .seg.cur i{background:#2ee6ff}
.mgr .seg.mile{box-shadow:0 0 0 2px #ffe14d}
.mgr .meter{position:absolute;left:12px;top:23%;height:36%;width:38px;pointer-events:none}
.mgr .meter .tube{position:absolute;left:6px;top:0;bottom:0;width:26px;border-radius:13px;background:rgba(23,16,43,.78);border:2.5px solid #17102b;box-shadow:0 0 0 1.5px rgba(255,240,201,.35);overflow:hidden}
.mgr .meter .z{position:absolute;left:0;right:0}
.mgr .meter .zb{background:rgba(255,200,60,.55)}.mgr .meter .zg{background:rgba(80,230,120,.62);box-shadow:inset 0 0 0 1.5px rgba(200,255,200,.65)}
.mgr .meter .fill{position:absolute;left:3px;right:3px;bottom:0;border-radius:10px 10px 8px 8px;background:#2ee6ff}
.mgr .meter .cap{position:absolute;left:-2px;right:-2px;height:3px;background:#fff;box-shadow:0 0 6px #fff;border-radius:2px}
.mgr .zonelab{position:absolute;left:12px;top:calc(23% - 24px);width:70px;font-weight:900;font-size:13px;letter-spacing:.14em;text-shadow:0 2px 0 #17102b}
.mgr .mlab{position:absolute;left:42px;transform:translateY(-50%);font-size:9px;font-weight:900;letter-spacing:.1em;color:#fff0c9;text-shadow:0 1px 0 #17102b;opacity:.85}
.mgr .pads{position:absolute;left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom,0px));height:21%;min-height:104px;display:flex;gap:12px;pointer-events:none}
.mgr .pad{flex:1;border-radius:26px;position:relative;pointer-events:auto!important;touch-action:none;cursor:pointer;-webkit-tap-highlight-color:transparent;border:3px solid #17102b;background:linear-gradient(180deg,#46b9d8,#2a8aa6 55%,#1d6a86);box-shadow:0 6px 0 #0f5266,0 10px 22px rgba(10,6,30,.5),inset 0 2px 0 rgba(255,255,255,.45);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#17102b;user-select:none;-webkit-user-select:none;transition:transform .05s}
.mgr .pad .nm{font-weight:900;font-size:26px;letter-spacing:.1em;text-shadow:0 1px 0 rgba(255,255,255,.55)}
.mgr .pad .kk{font-weight:800;font-size:12px;letter-spacing:.2em;opacity:.7}
.mgr .pad.next{animation:mgrp .5s ease-in-out infinite alternate;border-color:#fff0c9}
.mgr .pad.hit{background:linear-gradient(180deg,#e6fdff,#9fefff);transform:translateY(5px);box-shadow:0 1px 0 #0f5266,0 4px 12px rgba(10,6,30,.5)}
.mgr .pad.bad{background:linear-gradient(180deg,#ff8fb0,#c4284f);animation:mgrs .22s}
@keyframes mgrp{from{box-shadow:0 6px 0 #0f5266,0 0 0 0 rgba(157,255,74,.0),inset 0 2px 0 rgba(255,255,255,.45)}to{box-shadow:0 6px 0 #0f5266,0 0 0 6px rgba(157,255,74,.7),inset 0 2px 0 rgba(255,255,255,.45)}}
@keyframes mgrs{25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
.mgr .hint{position:absolute;left:0;right:0;top:36%;text-align:center;font-weight:900;font-size:21px;letter-spacing:.08em;color:#fff0c9;text-shadow:0 3px 0 #17102b,0 0 22px rgba(23,16,43,.95);animation:mgrh 1s ease-in-out infinite alternate;padding:0 24px}
.mgr .hint small{display:block;font-size:12px;letter-spacing:.14em;color:#d9c9ff;margin-top:8px}
.mgr .hint.rdy small{display:none}
@keyframes mgrh{from{opacity:.65;transform:scale(.98)}to{opacity:1;transform:scale(1.03)}}
.mgr .start{position:absolute;left:50%;top:26%;transform:translate(-50%,-50%);pointer-events:auto!important;display:none;flex-direction:column;align-items:center;gap:6px;min-width:210px;min-height:84px;padding:14px 26px;border-radius:26px;border:3px solid #17102b;background:linear-gradient(#b6ff6a,#6fd33a);color:#17102b;font:900 30px/1 "Trebuchet MS",system-ui,sans-serif;letter-spacing:.1em;cursor:pointer;box-shadow:0 6px 0 #3f7a14,0 12px 28px rgba(10,6,30,.55);animation:mgrb 1s ease-in-out infinite alternate}
.mgr .start small{font-size:12px;letter-spacing:.2em;opacity:.75;font-weight:800}
.mgr .start:active{transform:translate(-50%,-46%);box-shadow:0 2px 0 #3f7a14}
.mgr .start:focus-visible{outline:3px solid #2ee6ff;outline-offset:3px}
@keyframes mgrb{from{filter:brightness(1)}to{filter:brightness(1.12)}}
.mgr .rwd{margin-top:2px;color:#ffe14d}
.mgr .mtoast{position:absolute;left:0;right:0;top:30%;text-align:center;font-weight:900;font-size:34px;letter-spacing:.06em;color:#ffe14d;text-shadow:0 3px 0 #17102b,0 0 26px rgba(157,255,74,.9);opacity:0;transform:scale(.6)}
.mgr .mtoast.on{animation:mgrt 1.7s ease-out forwards}
.mgr .mtoast.warn{color:#ff8fb0;font-size:22px;text-shadow:0 3px 0 #17102b}
@keyframes mgrt{0%{opacity:0;transform:scale(.5)}12%{opacity:1;transform:scale(1.15)}22%{transform:scale(1)}78%{opacity:1}100%{opacity:0;transform:translateY(-34px) scale(1)}}
.mgr .glare{position:absolute;left:0;top:0;width:300px;height:300px;margin:-150px 0 0 -150px;border-radius:50%;pointer-events:none;mix-blend-mode:screen;opacity:0;background:radial-gradient(circle,rgba(255,244,214,.95) 0,rgba(255,200,130,.55) 16%,rgba(255,150,120,.22) 38%,rgba(255,140,160,0) 70%)}
.mgr .ghost{position:absolute;left:0;top:0;border-radius:50%;pointer-events:none;mix-blend-mode:screen;opacity:0}
.mgr .card{position:absolute;inset:0;display:flex;align-items:flex-start;padding-top:calc(9% + 20px);justify-content:center;background:rgba(18,13,31,.55);pointer-events:auto!important;opacity:0;transition:opacity .4s}
.mgr .card.on{opacity:1}
.mgr .card .box{width:min(86%,380px);border-radius:28px;background:linear-gradient(180deg,#2c2160,#1a1238);border:3px solid #ffe14d;box-shadow:0 0 0 4px #17102b,0 20px 60px rgba(0,0,0,.6),0 0 40px rgba(255,200,80,.25);padding:16px 20px 16px;text-align:center}
.mgr .card h2{margin:0 0 4px;font-size:26px;letter-spacing:.1em;color:#ffe14d;text-shadow:0 3px 0 #17102b}
.mgr .card .big{font-size:12px;letter-spacing:.16em;color:#d9c9ff;font-weight:800;margin-bottom:8px}
.mgr .card .r{display:flex;justify-content:space-between;align-items:baseline;padding:6px 4px;border-bottom:1.5px solid rgba(255,240,201,.14);font-weight:800;font-size:15px;letter-spacing:.06em}
.mgr .card .r span:last-child{font-size:21px;font-weight:900}
.mgr .card .btns{display:flex;gap:10px;margin-top:14px}
.mgr .card button{pointer-events:auto!important;flex:1;border-radius:16px;border:3px solid #17102b;font:900 15px/1 "Trebuchet MS",system-ui,sans-serif;letter-spacing:.1em;padding:14px 8px;cursor:pointer;color:#17102b;background:#9dff4a;box-shadow:0 4px 0 #4f8a1c}
.mgr .card button.sec{background:#d9c9ff;box-shadow:0 4px 0 #6a5aa0}
`;
const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };

export function createHud(host, cb, C, hopt) {
  hopt = hopt || {}; let rw = null, shown = null;
  if (!host) return { set() {}, toast() {}, card() {}, hideCard() {}, reset() {}, flash() {}, glare() {}, dispose() {}, setRewards() {}, hasCard() { return false; } };
  const st = document.createElement('style'); st.textContent = CSS; host.appendChild(st);
  const root = h('div', 'mgr'); host.appendChild(root);
  // header
  const top = h('div', 'top'); root.appendChild(top);
  const r1 = h('div', 'row'); const quit = h('button', 'quit', 'QUIT'); quit.onclick = () => cb.onQuit(); const score = h('div', 'score'); score.innerHTML = 'GOOD BARS <b>0</b>/' + C.BLOCKS; const eng = h('div', 'eng', 'ENERGY +0'); r1.append(quit, score, eng); top.appendChild(r1);
  const segs = h('div', 'segs'), seg = []; for (let i = 0; i < C.BLOCKS; i++) { const s = h('div', 'seg'); s.appendChild(h('i')); if ((i + 1) % 3 === 0) s.classList.add('mile'); segs.appendChild(s); seg.push(s); } top.appendChild(segs);
  top.appendChild(h('div', 'sub', 'EVERY 3 GOOD BARS = +1 MAX ENERGY'));
  // meter
  const meter = h('div', 'meter'), tube = h('div', 'tube'); const zb = h('div', 'z zb'), zg = h('div', 'z zg'); zb.style.top = '0'; zb.style.height = (100 - C.HI) + '%'; zg.style.top = (100 - C.HI) + '%'; zg.style.height = (C.HI - C.LO) + '%';
  const fill = h('div', 'fill'); tube.append(zb, zg, fill); const cap = h('div', 'cap'); meter.append(tube, cap); root.appendChild(meter);
  const zl = h('div', 'zonelab', 'SLOW'); root.appendChild(zl);
  for (const [t, v] of [['BURN', 92.5], ['GOOD', 72.5], ['SLOW', 30]]) { const l = h('div', 'mlab', t); l.style.top = (100 - v) + '%'; meter.appendChild(l); }
  // pads
  const pads = h('div', 'pads'), pad = {}; for (const side of ['L', 'R']) { const p = h('div', 'pad'); p.append(h('div', 'nm', side === 'L' ? 'LEFT' : 'RIGHT'), h('div', 'kk', side === 'L' ? 'A  F' : 'D  J')); p.addEventListener('pointerdown', (e) => { e.preventDefault(); cb.onTap(side); }); p.addEventListener('contextmenu', (e) => e.preventDefault()); pads.appendChild(p); pad[side] = p; } root.appendChild(pads);
  const hint = h('div', 'hint'); hint.innerHTML = 'TAP LEFT, THEN RIGHT<small>KEEP THE BAR IN THE GREEN. ALTERNATE EVERY STEP.</small>'; root.appendChild(hint);
  const startB = h('button', 'start'); startB.type = 'button'; startB.innerHTML = 'START<small>TAP TO START</small>'; startB.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); startB.style.display = 'none'; if (cb.onStart) cb.onStart(); }); root.appendChild(startB);
  const toast = h('div', 'mtoast'); root.appendChild(toast);
  const glare = h('div', 'glare'); root.appendChild(glare); const ghosts = []; for (const [sz, col] of [[46, 'rgba(255,170,120,.5)'], [26, 'rgba(160,255,200,.4)'], [70, 'rgba(255,120,200,.28)']]) { const g = h('div', 'ghost'); g.style.width = g.style.height = sz + 'px'; g.style.margin = -sz / 2 + 'px 0 0 ' + -sz / 2 + 'px'; g.style.background = 'radial-gradient(circle,' + col + ' 0,rgba(255,255,255,0) 70%)'; root.appendChild(g); ghosts.push(g); }
  const card = h('div', 'card'); root.appendChild(card); card.style.display = 'none';
  let flashT = { L: 0, R: 0 }, lastKey = '';
  // the REAL numbers from the game state (G.doHold): max energy gain is already a row, the rest is a chip line
  function fillRewards() {
    if (!shown || !shown.rb) return; const r = rw, parts = [];
    if (r) { if (r.xp) parts.push('+' + Math.round(r.xp) + ' XP'); if (r.mood) parts.push('+' + Math.round(r.mood) + ' MOOD'); if (r.tech) parts.push('+' + (Math.round(r.tech * 10) / 10) + ' TECH'); if (r.energy) parts.push(Math.round(r.energy) + ' ENERGY'); if (r.cash) parts.push((r.cash > 0 ? '+$' : '-$') + Math.abs(Math.round(r.cash))); if (r.fans) parts.push('+' + Math.round(r.fans) + ' FANS'); }
    shown.rb.textContent = parts.join('   ');
  }
  return {
    root,
    set(s) {
      const key = s.phase + s.blocksDone + ':' + s.good + ':' + s.last + ':' + s.zone + ':' + Math.round(s.bar) + ':' + Math.round(s.blockFrac * 20) + ':' + s.energy; if (key === lastKey && !flashT.L && !flashT.R) return; lastKey = key;
      score.innerHTML = 'GOOD BARS <b>' + s.good + '</b>/' + C.BLOCKS; eng.textContent = 'ENERGY +' + s.energy;
      for (let i = 0; i < seg.length; i++) { const sg = seg[i]; const res = s.results[i]; sg.classList.toggle('good', res === 1); sg.classList.toggle('bad', res === 0); sg.classList.toggle('cur', i === s.blocksDone && s.phase === 'run'); if (i === s.blocksDone && s.phase === 'run') sg.firstChild.style.width = Math.round(s.blockFrac * 100) + '%'; }
      const col = s.zone === 'burn' ? '#ffd23f' : s.zone === 'target' ? '#7be08f' : '#2ee6ff'; fill.style.height = s.bar + '%'; fill.style.background = col; cap.style.bottom = 'calc(' + s.bar + '% - 1px)'; zl.textContent = s.zone === 'burn' ? 'BURN' : s.zone === 'target' ? 'GOOD' : 'SLOW'; zl.style.color = col;
      pad.L.classList.toggle('next', s.phase !== 'done' && s.last !== 'L'); pad.R.classList.toggle('next', s.phase !== 'done' && s.last !== 'R');
      hint.style.display = s.phase === 'ready' || (s.phase === 'run' && s.taps === 0) ? 'block' : 'none'; startB.style.display = s.phase === 'ready' ? 'flex' : 'none';
      hint.style.top = s.phase === 'ready' ? '66%' : ''; hint.classList.toggle('rdy', s.phase === 'ready');
    },
    flash(side, ok) { const p = pad[side]; p.classList.remove('hit', 'bad'); void p.offsetWidth; p.classList.add(ok ? 'hit' : 'bad'); clearTimeout(flashT['t' + side]); flashT['t' + side] = setTimeout(() => p.classList.remove('hit', 'bad'), ok ? 110 : 230); },
    toast(txt, warn) { if (!txt) { toast.className = 'mtoast'; return; } toast.textContent = txt; toast.className = 'mtoast' + (warn ? ' warn' : ''); void toast.offsetWidth; toast.classList.add('on'); },
    glare(x, y, a, cx, cy) { glare.style.opacity = a.toFixed(3); glare.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)'; ghosts.forEach((g, i) => { const k = [0.35, 0.7, 1.15][i]; g.style.opacity = (a * 0.6).toFixed(3); g.style.transform = 'translate(' + (x + (cx - x) * k).toFixed(1) + 'px,' + (y + (cy - y) * k).toFixed(1) + 'px)'; }); },
    card(res, onAgain, onDone) {
      card.innerHTML = ''; card.style.display = 'flex'; const b = h('div', 'box'); b.append(h('h2', '', 'RUN COMPLETE'), h('div', 'big', res.q >= 0.75 ? 'GREAT PACE' : res.q >= 0.4 ? 'STEADY JOG' : 'KEEP MOVING'));
      const row = (a, v, c) => { const r = h('div', 'r'); r.append(h('span', '', a), Object.assign(h('span', '', v), { style: 'color:' + c })); b.appendChild(r); };
      row('DISTANCE', Math.round(res.distance) + ' m', '#fff0c9'); row('GOOD BARS', res.good + ' / ' + C.BLOCKS, '#ffe14d'); row('MAX ENERGY', '+' + (rw && rw.maxEnergy !== undefined ? rw.maxEnergy : res.energy), '#9dff4a'); row('PACE', Math.round(res.q * 100) + '%', '#2ee6ff');
      const rb = h('div', 'rwd'); rb.dataset.rewards = '1'; b.appendChild(rb); shown = { res, rb, b };
      const bt = h('div', 'btns'); const d = h('button', '', 'CONTINUE'); d.onclick = onDone; if (hopt.again !== false) { const a = h('button', 'sec', 'RUN AGAIN'); a.onclick = onAgain; bt.append(a); } bt.append(d); b.appendChild(bt); card.appendChild(b); void card.offsetWidth; card.classList.add('on'); fillRewards();
    },
    setRewards(r) { rw = r || null; fillRewards(); },
    hasCard() { return card.style.display !== 'none' && card.classList.contains('on'); },
    hideCard() { card.classList.remove('on'); card.style.display = 'none'; lastKey = ''; shown = null; },
    reset() { lastKey = ''; },
    dispose() { if (root.parentElement) root.parentElement.removeChild(root); if (st.parentElement) st.parentElement.removeChild(st); },
  };
}

// SHOWMANSHIP HUD (POSE): DOM over the canvas. Portrait first, thumbs at the bottom, everything readable on a phone at arm's length.
//   createPoseUI(host, cb, o) -> { setTop({level, bpm, round, rounds, hype}), callout(move, who), banner(text, sub, color, ms), judge(grade, text), strip(slots, cursor, reveal),
//     setPads(moves, live), flashPad(id, ok), showSelect(levels, unlocked, pick), hideSelect(), card(res, rw, buttons), hideCard(), hasCard(), resize(w,h), dispose() }
//   cb = { onMove(id), onQuit(), onPick(level), onAgain(), onLevels(), onContinue() }
import { MOVES, MOVE_IDS } from './mg_pose_moves.js';

// bold line icons (64 x 64), drawn with currentColor
const ICON = {
  left: '<path d="M36 12 16 32 36 52"/><path d="M19 32H52"/>',
  right: '<path d="M28 12 48 32 28 52"/><path d="M45 32H12"/>',
  duck: '<path d="M32 8V38"/><path d="M18 25 32 39 46 25"/><path d="M12 54H52"/>',
  jump: '<path d="M12 56H52"/><path d="M32 46V12"/><path d="M18 25 32 11 46 25"/>',
  point: '<path d="M14 50 44 20"/><path d="M26 16H48V38"/><path d="M14 14l3 3M50 50l-3-3"/>',
  spin: '<path d="M50 34A18 18 0 1 1 41 17"/><path d="M33 9 43 17 34 26"/>',
  freeze: '<path d="M32 7V57M10 19.5l44 25M10 44.5l44-25"/><path d="M25 10l7 6 7-6M25 54l7-6 7 6"/>',
  clap: '<path d="M22 54 15 30a4 4 0 0 1 7-2l9 20" /><path d="M42 54l7-24a4 4 0 0 0-7-2l-9 20"/><path d="M32 6v9M19 10l4 7M45 10l-4 7"/>',
  lock: '<rect x="15" y="29" width="34" height="26" rx="5"/><path d="M22 29v-7a10 10 0 0 1 20 0v7"/>',
  back: '<path d="M30 14 12 32 30 50"/><path d="M14 32H52"/>',
  star: '<path d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2z"/>',
};
export const iconSvg = (id, px, sw) => '<svg viewBox="0 0 64 64" width="' + (px || 32) + '" height="' + (px || 32) + '" fill="none" stroke="currentColor" stroke-width="' + (sw || 7) + '" stroke-linecap="round" stroke-linejoin="round">' + (ICON[id] || '') + '</svg>';
export const LEVEL_NAMES = ['FIRST STEPS', 'POINT IT', 'SPIN CITY', 'FREEZE FRAME', 'CLAP BACK', 'CROWD PLEASER', 'SHOWSTOPPER', 'HEADLINER'];
const PAD_ORDER = ['left', 'jump', 'duck', 'right', 'point', 'spin', 'freeze', 'clap'];
const GRADE = { cool: ['COOL!', '#7dff6a'], good: ['GOOD', '#2ee6ff'], bad: ['BAD', '#ffb03a'], miss: ['MISS', '#ff5a7a'], wrong: ['WRONG MOVE', '#ff5a7a'], early: ['WAIT FOR IT', '#d9c9ff'], watch: ['WATCH FIRST', '#d9c9ff'] };

const CSS = `
.pz{position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:Fredoka,"Trebuchet MS",system-ui,sans-serif;color:#fff6e8;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;--k:1}
.pz *{box-sizing:border-box}
.pz .pz-tx{text-shadow:0 2px 0 #17102b,0 0 10px rgba(23,16,43,.85)}
.pz .pz-top{position:absolute;z-index:6;left:10px;right:10px;top:calc(8px + env(safe-area-inset-top,0px));display:flex;align-items:center;gap:8px}
.pz .pz-bk{pointer-events:auto;width:44px;height:44px;border-radius:14px;border:2px solid rgba(255,246,232,.35);background:rgba(23,16,43,.62);color:#fff6e8;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none}
.pz .pz-ttl{flex:1;text-align:center;line-height:1}
.pz .pz-ttl b{display:block;font-size:17px;font-weight:700;letter-spacing:.08em}
.pz .pz-ttl i{display:block;font-style:normal;font-size:11px;font-weight:700;letter-spacing:.14em;color:#ffd23f;margin-top:3px}
.pz .pz-pips{display:flex;gap:4px;width:44px;justify-content:flex-end;flex-wrap:wrap}
.pz .pz-pip{width:9px;height:9px;border-radius:50%;background:rgba(255,246,232,.22);box-shadow:inset 0 0 0 1.5px rgba(255,246,232,.4)}
.pz .pz-pip.on{background:#ffd23f;box-shadow:0 0 6px #ffd23f}.pz .pz-pip.ok{background:#7dff6a}.pz .pz-pip.no{background:#ff5a7a}
.pz .pz-hype{position:absolute;left:62px;right:62px;top:calc(58px + env(safe-area-inset-top,0px));height:12px;border-radius:7px;background:rgba(14,9,30,.7);box-shadow:0 0 0 1.5px rgba(255,246,232,.25);overflow:hidden}
.pz .pz-hype i{position:absolute;left:0;top:0;bottom:0;border-radius:7px;background:linear-gradient(90deg,#ff3ea5,#ffd23f 55%,#7dff6a);transition:width .25s}
.pz .pz-hlab{position:absolute;left:0;right:0;top:calc(73px + env(safe-area-inset-top,0px));text-align:center;font-size:10px;font-weight:700;letter-spacing:.24em;color:#d9c9ff}
.pz .pz-call{position:absolute;width:56%;top:24%;display:flex;flex-direction:column;align-items:center;gap:6px;opacity:0;text-align:center}.pz .pz-call.L{left:0}.pz .pz-call.R{right:0}.pz .pz-call.C{left:22%}
.pz .pz-call .pz-ic{width:88px;height:88px;border-radius:28px;display:flex;align-items:center;justify-content:center;color:#17102b;box-shadow:0 6px 0 rgba(0,0,0,.35),0 0 26px currentColor,inset 0 -6px 0 rgba(0,0,0,.18)}
.pz .pz-call .pz-ic svg{color:#17102b}
.pz .pz-call .pz-wd{font-size:36px;font-weight:700;letter-spacing:.04em;line-height:.95;white-space:pre-line;-webkit-text-stroke:2px #17102b;paint-order:stroke fill}
.pz .pz-call .pz-who{font-size:11px;font-weight:700;letter-spacing:.24em;color:#fff6e8;opacity:.9}
.pz .pz-call.go{animation:pzPop .62s cubic-bezier(.2,1.6,.4,1) both}
@keyframes pzPop{0%{opacity:0;transform:scale(.4) rotate(-6deg)}18%{opacity:1;transform:scale(1.14) rotate(2deg)}34%{transform:scale(1)}80%{opacity:1}100%{opacity:0;transform:scale(.96) translateY(-8px)}}
.pz .pz-ban{position:absolute;left:0;right:0;top:calc(96px + env(safe-area-inset-top,0px));text-align:center;opacity:0}
.pz .pz-ban b{display:inline-block;padding:8px 22px 10px;border-radius:16px;background:rgba(23,16,43,.72);font-size:30px;font-weight:700;letter-spacing:.06em;-webkit-text-stroke:1.5px #17102b;paint-order:stroke fill;box-shadow:0 0 0 2px rgba(255,246,232,.2)}
.pz .pz-ban i{display:block;margin-top:6px;font-style:normal;font-size:13px;font-weight:700;letter-spacing:.16em}
.pz .pz-ban.go{animation:pzBan var(--d,1.2s) ease both}
@keyframes pzBan{0%{opacity:0;transform:translateY(14px) scale(.8)}12%{opacity:1;transform:translateY(0) scale(1.06)}22%{transform:scale(1)}82%{opacity:1}100%{opacity:0;transform:translateY(-10px)}}
.pz .pz-jd{position:absolute;width:56%;top:57%;text-align:center;font-size:30px;white-space:nowrap;font-weight:700;letter-spacing:.05em;opacity:0;-webkit-text-stroke:2px #17102b;paint-order:stroke fill}
.pz .pz-jd.L{left:0}.pz .pz-jd.R{right:0}.pz .pz-jd.C{left:22%}
.pz .pz-jd.go{animation:pzJd .55s cubic-bezier(.2,1.5,.4,1) both}
@keyframes pzJd{0%{opacity:0;transform:scale(1.6)}20%{opacity:1;transform:scale(.95)}35%{transform:scale(1)}75%{opacity:1}100%{opacity:0;transform:translateY(-16px)}}
.pz .pz-strip{position:absolute;left:8px;right:8px;bottom:calc(var(--padsH) + 14px);display:flex;justify-content:center;gap:5px}
.pz .pz-chip{width:38px;height:38px;border-radius:12px;background:rgba(23,16,43,.7);box-shadow:0 0 0 2px rgba(255,246,232,.2);display:flex;align-items:center;justify-content:center;color:rgba(255,246,232,.5);font-weight:700;font-size:18px;transition:transform .12s}
.pz .pz-chip.cur{box-shadow:0 0 0 3px #fff6e8,0 0 14px #fff6e8;transform:translateY(-4px) scale(1.08)}
.pz .pz-chip.cool{background:#2b6b2a;box-shadow:0 0 0 2px #7dff6a}.pz .pz-chip.good{background:#145a66;box-shadow:0 0 0 2px #2ee6ff}.pz .pz-chip.bad{background:#6b4a12;box-shadow:0 0 0 2px #ffb03a}.pz .pz-chip.miss,.pz .pz-chip.wrong{background:#6b1730;box-shadow:0 0 0 2px #ff5a7a}
.pz .pz-pads{position:absolute;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
.pz .pz-pad{pointer-events:auto;touch-action:none;height:64px;border-radius:18px;border:0;background:linear-gradient(180deg,var(--c),color-mix(in srgb,var(--c) 62%,#17102b));color:#17102b;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;box-shadow:0 5px 0 color-mix(in srgb,var(--c) 40%,#0b0718),inset 0 2px 0 rgba(255,255,255,.45);cursor:pointer;font-family:inherit;padding:0;transition:transform .06s,filter .15s,opacity .15s}
.pz .pz-pad b{font-size:11px;font-weight:700;letter-spacing:.08em;line-height:1}
.pz .pz-pad u{position:absolute;right:6px;top:4px;text-decoration:none;font-size:8px;font-weight:700;opacity:.55}
.pz .pz-pad{position:relative}
.pz .pz-pad.dn{transform:translateY(4px);box-shadow:0 1px 0 color-mix(in srgb,var(--c) 40%,#0b0718),inset 0 2px 0 rgba(255,255,255,.45);filter:brightness(1.25)}
.pz .pz-pad.off{opacity:.22;filter:grayscale(.8);pointer-events:none}
.pz .pz-pad.wait{filter:saturate(.5) brightness(.75)}
.pz .pz-pad.ok{animation:pzOk .3s}.pz .pz-pad.no{animation:pzNo .3s}
@keyframes pzOk{0%{filter:brightness(2)}100%{filter:none}}
@keyframes pzNo{0%,100%{transform:none}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
.pz .pz-sheet{position:absolute;inset:0;z-index:5;pointer-events:auto;background:radial-gradient(ellipse at 50% 20%,rgba(60,30,110,.55),rgba(14,9,30,.86));display:flex;flex-direction:column;align-items:center;padding:calc(64px + env(safe-area-inset-top,0px)) 14px 14px;overflow-y:auto}
.pz .pz-sheet h1{margin:0;font-size:30px;font-weight:700;letter-spacing:.06em;color:#ffd23f;-webkit-text-stroke:1.5px #17102b;paint-order:stroke fill}
.pz .pz-sheet p{margin:4px 0 12px;font-size:13px;font-weight:500;text-align:center;color:#e8dcff;max-width:300px}
.pz .pz-lvls{display:grid;grid-template-columns:1fr 1fr;gap:9px;width:100%;max-width:400px}
.pz .pz-lv{position:relative;border:0;border-radius:18px;padding:10px 10px 9px 12px;text-align:left;font-family:inherit;color:#fff6e8;background:linear-gradient(160deg,#4a2a86,#2a1856);box-shadow:0 4px 0 #160c30,inset 0 0 0 2px rgba(255,246,232,.14);cursor:pointer;min-height:76px}
.pz .pz-lv b{display:block;font-size:12px;letter-spacing:.14em;color:#ffd23f}
.pz .pz-lv strong{display:block;font-size:16px;font-weight:700;letter-spacing:.03em;margin:2px 0 3px}
.pz .pz-lv i{display:block;font-style:normal;font-size:10px;font-weight:700;letter-spacing:.08em;color:#cbbcf2}
.pz .pz-lv .pz-nw{position:absolute;right:8px;top:8px;width:30px;height:30px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#17102b}
.pz .pz-lv.sel{box-shadow:0 4px 0 #160c30,inset 0 0 0 3px #ffd23f,0 0 16px rgba(255,210,63,.5)}
.pz .pz-lv.lk{background:linear-gradient(160deg,#2b2442,#1b1630);color:#8f86ad}.pz .pz-lv.lk b{color:#8f86ad}.pz .pz-lv.lk .pz-nw{color:#8f86ad;background:none}
.pz .pz-lv.shake{animation:pzNo .35s}
.pz .pz-card{position:absolute;left:14px;right:14px;bottom:calc(12px + env(safe-area-inset-bottom,0px));pointer-events:auto;border-radius:22px;padding:14px 14px 12px;background:rgba(23,16,43,.9);box-shadow:0 0 0 2px rgba(255,246,232,.2),0 12px 30px rgba(0,0,0,.5);text-align:center;animation:pzCard .45s cubic-bezier(.2,1.4,.4,1) both;max-width:420px;margin:0 auto}
@keyframes pzCard{0%{opacity:0;transform:translateY(30px) scale(.9)}100%{opacity:1;transform:none}}
.pz .pz-card .pz-k{font-size:11px;font-weight:700;letter-spacing:.22em;color:#cbbcf2}
.pz .pz-card .pz-g{font-size:64px;line-height:1;font-weight:700;margin:2px 0;-webkit-text-stroke:3px #17102b;paint-order:stroke fill}
.pz .pz-card .pz-pc{font-size:18px;font-weight:700;letter-spacing:.06em}
.pz .pz-card .pz-row{display:flex;justify-content:center;gap:6px;margin:10px 0 6px;flex-wrap:wrap}
.pz .pz-card .pz-c{padding:5px 9px;border-radius:10px;font-size:11px;font-weight:700;letter-spacing:.06em;color:#17102b}
.pz .pz-card .pz-rw{font-size:15px;font-weight:700;margin:6px 0 2px;color:#7dff6a}
.pz .pz-card .pz-rw2{font-size:12px;font-weight:700;color:#e8dcff;letter-spacing:.05em}
.pz .pz-card .pz-un{margin:10px auto 2px;display:inline-block;padding:7px 14px;border-radius:12px;background:#ffd23f;color:#17102b;font-weight:700;letter-spacing:.08em;font-size:14px;animation:pzGlow 1s ease-in-out infinite alternate}
.pz .pz-card .pz-lost{margin:8px 0 0;font-size:13px;font-weight:700;color:#ff9ab8;letter-spacing:.04em}
@keyframes pzGlow{0%{box-shadow:0 0 4px #ffd23f}100%{box-shadow:0 0 18px #ffd23f}}
.pz .pz-btns{display:flex;gap:8px;margin-top:12px}
.pz .pz-btn{flex:1;pointer-events:auto;height:50px;border:0;border-radius:16px;font-family:inherit;font-weight:700;font-size:15px;letter-spacing:.1em;color:#17102b;background:linear-gradient(180deg,#ffe27a,#ffb703);box-shadow:0 5px 0 #a86a00,inset 0 2px 0 rgba(255,255,255,.5);cursor:pointer}
.pz .pz-btn.alt{background:linear-gradient(180deg,#8fe9ff,#2ec4e6);box-shadow:0 5px 0 #136a80,inset 0 2px 0 rgba(255,255,255,.5)}
.pz .pz-btn:active{transform:translateY(3px)}
.pz .pz-flash{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at 50% 45%,rgba(255,255,255,.0),rgba(255,255,255,.0) 40%,var(--fc,rgba(255,90,122,.55)));transition:opacity .35s}
`;

export function createPoseUI(host, cb, o) {
  o = o || {}; cb = cb || {};
  const doc = host.ownerDocument || document, el = (tag, cls, html) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const root = el('div', 'pz'); const style = el('style', null); style.textContent = CSS; root.appendChild(style); host.appendChild(root);
  const tap = (node, fn) => { node.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(e); }); node.addEventListener('click', (e) => { e.preventDefault(); }); };
  // ---- top bar
  const top = el('div', 'pz-top'), bk = el('button', 'pz-bk', iconSvg('back', 22, 7)), ttl = el('div', 'pz-ttl pz-tx', '<b>SHOWMANSHIP</b><i></i>'), pips = el('div', 'pz-pips');
  bk.setAttribute('aria-label', 'Back'); tap(bk, () => cb.onQuit && cb.onQuit()); top.append(bk, ttl, pips); root.appendChild(top);
  const hype = el('div', 'pz-hype', '<i></i>'), hlab = el('div', 'pz-hlab pz-tx', 'CROWD HYPE'); root.append(hype, hlab);
  const call = el('div', 'pz-call'), ban = el('div', 'pz-ban pz-tx'), jd = el('div', 'pz-jd'), strip = el('div', 'pz-strip'), flash = el('div', 'pz-flash'); root.append(flash, call, ban, jd, strip);
  // ---- pads: fixed spots so muscle memory survives the level growing (row 1 = the four basics)
  const pads = el('div', 'pz-pads'), padEl = {};
  PAD_ORDER.forEach((id) => {
    const M = MOVES[id], b = el('button', 'pz-pad', iconSvg(id, 28, 7.5) + '<b>' + M.short + '</b><u>' + M.keyLabel + '</u>'); b.style.setProperty('--c', M.color); b.dataset.move = id; padEl[id] = b; pads.appendChild(b);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('dn'); if (cb.onMove) cb.onMove(id); });
    const up = () => b.classList.remove('dn'); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  });
  root.appendChild(pads);
  let H = 640;
  const padsH = () => pads.getBoundingClientRect().height || 135;
  const restart = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
  let sheet = null, cardEl = null, lastTop = '';
  const api = {
    root,
    setTop(s) {
      const key = [s.level, s.bpm, s.round, s.rounds, (s.marks || []).join(''), Math.round((s.hype || 0) * 50)].join('|'); if (key === lastTop) return; lastTop = key;
      ttl.querySelector('b').textContent = 'LEVEL ' + s.level; ttl.querySelector('i').textContent = (LEVEL_NAMES[s.level - 1] || '') + '  ' + s.bpm + ' BPM';
      let h = ''; for (let i = 0; i < (s.rounds || 0); i++) { const m = (s.marks || [])[i]; h += '<span class="pz-pip' + (m === 1 ? ' ok' : m === 0 ? ' no' : i === s.round ? ' on' : '') + '"></span>'; } pips.innerHTML = h;
      hype.firstChild.style.width = Math.round(Math.max(0, Math.min(1, s.hype || 0)) * 100) + '%';
    },
    showPlayHud(on) { [top, hype, hlab, strip, pads].forEach((n) => { n.style.display = on ? '' : 'none'; }); if (!on) top.style.display = ''; hype.style.display = hlab.style.display = on ? '' : 'none'; },
    callout(id, who, side) {
      const M = MOVES[id]; if (!M) return; call.className = 'pz-call ' + (side || 'C'); call.innerHTML = '<div class="pz-ic" style="background:' + M.color + ';color:' + M.color + '">' + iconSvg(id, 64, 8) + '</div><div class="pz-wd" style="color:' + M.color + '">' + M.word + '!</div>' + (who ? '<div class="pz-who tx">' + who + '</div>' : '');
      restart(call, 'go');
    },
    banner(text, sub, color, ms) { call.classList.remove('go'); ban.innerHTML = '<b style="color:' + (color || '#fff6e8') + '">' + text + '</b>' + (sub ? '<i style="color:' + (color || '#ffd23f') + '">' + sub + '</i>' : ''); ban.style.setProperty('--d', ((ms || 1200) / 1000) + 's'); restart(ban, 'go'); },
    judge(g, txt, side) { const G = GRADE[g] || [String(g).toUpperCase(), '#fff6e8']; jd.className = 'pz-jd ' + (side || 'C'); jd.textContent = txt || G[0]; jd.style.color = G[1]; restart(jd, 'go'); if (g === 'miss' || g === 'wrong') { flash.style.setProperty('--fc', 'rgba(255,60,100,.5)'); flash.style.transition = 'none'; flash.style.opacity = '1'; void flash.offsetWidth; flash.style.transition = 'opacity .45s'; flash.style.opacity = '0'; } },
    flashColor(c) { flash.style.setProperty('--fc', c); flash.style.transition = 'none'; flash.style.opacity = '1'; void flash.offsetWidth; flash.style.transition = 'opacity .6s'; flash.style.opacity = '0'; },
    // slots: [{move, grade|null}], cursor index (-1 none), reveal: true = show the icons, false = '?' until judged
    strip(slots, cursor, reveal) {
      const key = JSON.stringify([slots, cursor, reveal]); if (strip._k === key) return; strip._k = key;
      strip.innerHTML = ''; (slots || []).forEach((s, i) => {
        const M = MOVES[s.move], show = s.move && (reveal || s.grade), c = el('div', 'pz-chip' + (s.grade ? ' ' + s.grade : '') + (i === cursor ? ' cur' : ''), show ? iconSvg(s.move, 22, 8) : '?');
        if (show && M) c.style.color = s.grade ? '#fff6e8' : M.color; strip.appendChild(c);
      });
    },
    setPads(moves, mode) { // mode: 'live' | 'wait' | 'hidden'
      pads.style.display = mode === 'hidden' ? 'none' : ''; PAD_ORDER.forEach((id) => { const b = padEl[id], on = moves.indexOf(id) >= 0; b.classList.toggle('off', !on); b.classList.toggle('wait', on && mode === 'wait'); });
      root.style.setProperty('--padsH', padsH() + 'px');
    },
    flashPad(id, ok) { const b = padEl[id]; if (!b) return; b.classList.remove('ok', 'no'); void b.offsetWidth; b.classList.add(ok ? 'ok' : 'no'); setTimeout(() => b.classList.remove('dn'), 90); },
    pressVisual(id) { const b = padEl[id]; if (!b) return; b.classList.add('dn'); setTimeout(() => b.classList.remove('dn'), 110); },
    // ---- level select
    showSelect(levels, unlocked, sel) {
      api.hideSelect(); sheet = el('div', 'pz-sheet'); const grid = el('div', 'pz-lvls');
      sheet.append(el('h1', null, 'SHOWMANSHIP'), el('p', null, 'Watch Coach Vibe, then copy the moves in the same order, right on the shaker beat.'));
      levels.forEach((L) => {
        const lk = L.level > unlocked, nw = L.moves[L.moves.length - 1], M = MOVES[nw] || MOVES.left, isNew = L.level === 1 || levels[L.level - 2].moves.indexOf(nw) < 0;
        const b = el('button', 'pz-lv' + (lk ? ' lk' : '') + (L.level === sel ? ' sel' : ''), '<b>LEVEL ' + L.level + '</b><strong>' + (LEVEL_NAMES[L.level - 1] || '') + '</strong><i>' + (lk ? '70% ON LEVEL ' + (L.level - 1) : L.len + ' MOVES  ' + L.bpm + ' BPM') + '</i>' +
          '<span class="pz-nw" style="background:' + (lk ? 'none' : isNew ? M.color : 'rgba(255,246,232,.12)') + ';color:' + (lk ? '#8f86ad' : isNew ? '#17102b' : '#fff6e8') + '">' + iconSvg(lk ? 'lock' : isNew ? nw : 'star', 20, 7) + '</span>');
        b.dataset.level = L.level; tap(b, () => { if (lk) { restart(b, 'shake'); if (cb.onLocked) cb.onLocked(L.level); return; } if (cb.onPick) cb.onPick(L.level); }); grid.appendChild(b);
      });
      sheet.appendChild(grid); root.insertBefore(sheet, top.nextSibling); api.showPlayHud(false); call.style.opacity = 0;
    },
    hideSelect() { if (sheet && sheet.parentNode) sheet.parentNode.removeChild(sheet); sheet = null; },
    selectOpen: () => !!sheet,
    // ---- result card. buttons: [['CONTINUE', fn, 'alt'?], ...]
    card(res, rw, buttons) {
      api.hideCard(); const col = { S: '#ffd23f', A: '#7dff6a', B: '#2ee6ff', C: '#fff6e8', D: '#ff7b8e' }[res.grade] || '#fff6e8';
      const c = el('div', 'pz-card');
      const chips = [['COOL', res.cool, '#7dff6a'], ['GOOD', res.good, '#2ee6ff'], ['BAD', res.bad, '#ffb03a'], ['MISS', res.miss + res.wrong, '#ff7b8e']].map((x) => '<span class="pz-c" style="background:' + x[2] + '">' + x[0] + ' ' + x[1] + '</span>').join('');
      const show = rw && typeof rw.show === 'number' ? rw.show : null, xp = rw && typeof rw.xp === 'number' ? rw.xp : null;
      c.innerHTML = '<div class="pz-k">LEVEL ' + res.level + '  ' + (LEVEL_NAMES[res.level - 1] || '') + '</div><div class="pz-g" style="color:' + col + '">' + res.grade + '</div><div class="pz-pc tx">' + Math.round(res.q * 100) + '% SHOWMANSHIP</div>' +
        '<div class="pz-row">' + chips + '</div>' + (res.lost ? '<div class="pz-lost">The crowd booed you off. Keep the order and stay on the beat!</div>' : '') +
        (show !== null ? '<div class="pz-rw sh">+' + (Math.round(show * 10) / 10).toFixed(1) + ' SHOWMANSHIP</div>' : '') + (xp !== null || (rw && rw.minutes) ? '<div class="pz-rw2">' + (xp !== null ? '+' + Math.round(xp) + ' XP' : '') + (rw && rw.energy ? '   ' + Math.round(rw.energy) + ' ENERGY' : '') + '</div>' : '') +
        (res.unlocked ? '<div class="pz-un">LEVEL ' + res.unlocked + ' UNLOCKED!</div>' : !res.passed && res.level < 8 ? '<div class="pz-rw2" style="margin-top:8px">Score 70% to unlock level ' + (res.level + 1) + '</div>' : '');
      const bt = el('div', 'pz-btns'); (buttons || []).forEach((b) => { const x = el('button', 'pz-btn' + (b[2] ? ' ' + b[2] : ''), b[0]); x.addEventListener('click', (e) => { e.preventDefault(); b[1](); }); bt.appendChild(x); }); c.appendChild(bt);
      root.appendChild(c); cardEl = c; pads.style.display = 'none'; strip.style.display = 'none';
    },
    hideCard() { if (cardEl && cardEl.parentNode) cardEl.parentNode.removeChild(cardEl); cardEl = null; },
    hasCard: () => !!cardEl,
    resize(w, h) { H = h || H; const k = Math.max(0.8, Math.min(1.25, Math.min((w || 360) / 360, H / 640))); root.style.setProperty('--k', k); root.style.setProperty('--padsH', padsH() + 'px'); },
    dispose() { if (root.parentNode) root.parentNode.removeChild(root); },
  };
  api.showPlayHud(true); api.setPads(MOVE_IDS, 'wait');
  void o; return api;
}

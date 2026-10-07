// UI3D module (Gameplay Engineer): the DOM overlay on top of the 3D canvas. Self-injecting (styles + elements), so park3d.html stays a thin shell.
//   createUI(ctx, controls, { dom, spots, player, terrain }) -> { update(dt,t), toast(msg), destroy() }
// Pieces: top bar (DAY DUSK NIGHT, LOW MED HIGH, FPS), context prompt button (pops in near a spot), dynamic joystick visual, toast line, 90px circular minimap.
// Demo behaviour: when a spot is activated and nobody else handles it, a toast shows and 'spotDone' is emitted after 2.6 s so control returns.
// Set window.__PARK_AUTODONE = false when the real game bridge takes over and emits 'spotDone' itself.
import { spotGlyphCanvas } from './spots.js';

const CSS = `
.p3{position:absolute;inset:0;overflow:hidden;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;font-family:"Trebuchet MS",system-ui,-apple-system,sans-serif;color:#fff6e8;--g:16px;--st:env(safe-area-inset-top,0px);--sb:env(safe-area-inset-bottom,0px);--sl:env(safe-area-inset-left,0px);--sr:env(safe-area-inset-right,0px)}
.p3 *{box-sizing:border-box;-webkit-user-select:none;user-select:none}
.p3 button{pointer-events:auto;touch-action:manipulation;cursor:pointer;font:inherit;border:0;color:inherit}
.p3-bar{position:absolute;left:calc(var(--g) + var(--sl));right:calc(var(--g) + var(--sr));top:calc(8px + var(--st));display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 8px}
.p3-seg{display:flex;gap:2px;padding:2px;border-radius:14px;background:rgba(23,16,43,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 2px 10px rgba(10,5,30,.35),inset 0 0 0 1px rgba(255,255,255,.08)}
.p3-seg button{min-width:44px;height:44px;padding:0 6px;border-radius:12px;background:transparent;font-weight:800;font-size:11px;letter-spacing:.06em;color:#d9cdf5;transition:background .15s,color .15s,transform .1s}
.p3-seg button:active{transform:scale(.94)}
.p3-seg button.on{background:linear-gradient(#ffd23f,#f0a21a);color:#2a1648;box-shadow:0 1px 0 #8a5a00}
.p3-seg button:focus-visible,.p3-go:focus-visible{outline:3px solid #2ee6ff;outline-offset:2px}
.p3-mini{position:absolute;right:calc(var(--g) + var(--sr));top:calc(60px + var(--st));width:90px;height:90px;border-radius:50%;box-shadow:0 3px 12px rgba(10,5,30,.5);transition:top .2s}
.p3-mini canvas{width:90px;height:90px;display:block;border-radius:50%}
.p3-toast{position:absolute;left:50%;top:calc(60px + var(--st));transform:translate(-50%,-6px);max-width:calc(100% - 150px);padding:8px 14px;border-radius:14px;background:rgba(23,16,43,.78);font-weight:700;font-size:13px;letter-spacing:.02em;text-align:center;opacity:0;transition:opacity .25s,transform .25s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 10px rgba(10,5,30,.4)}
.p3-toast.on{opacity:1;transform:translate(-50%,0)}
.p3 .p3-go{position:absolute;right:calc(var(--g) + var(--sr));bottom:calc(30px + var(--sb));display:flex;align-items:center;gap:10px;width:max-content;min-width:164px;white-space:nowrap;justify-content:center;height:68px;padding:0 22px 0 10px;border-radius:34px;font-weight:900;font-size:24px;letter-spacing:.05em;color:#241240;background:linear-gradient(#ffe14d,#ffb32a);box-shadow:0 5px 0 #8a5a00,0 10px 24px rgba(10,5,30,.5),0 0 0 3px rgba(255,255,255,.55);opacity:0;transform:scale(.4) translateY(30px);pointer-events:none;visibility:hidden;transition:opacity .15s,transform .2s,visibility 0s .2s}
.p3 .p3-go.show{visibility:visible;pointer-events:auto;opacity:1;transform:none;animation:p3pop .42s cubic-bezier(.2,1.5,.4,1) both,p3glow 1.4s ease-in-out .45s infinite;transition:opacity .15s,visibility 0s}
.p3 .p3-go:active{transform:translateY(4px) scale(.97);box-shadow:0 1px 0 #8a5a00,0 6px 16px rgba(10,5,30,.5),0 0 0 3px rgba(255,255,255,.55)}
.p3-go canvas{width:50px;height:50px;flex:none;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))}
.p3-go small{display:none;position:absolute;right:14px;top:-9px;padding:1px 7px;border-radius:8px;background:#17102b;color:#fff6e8;font-size:11px;letter-spacing:0}
@media (hover:hover) and (pointer:fine){.p3-go small{display:block}}
@keyframes p3pop{0%{transform:scale(.4) translateY(30px)}60%{transform:scale(1.12) translateY(-4px)}100%{transform:none}}
@keyframes p3glow{0%,100%{filter:brightness(1)}50%{filter:brightness(1.12) drop-shadow(0 0 10px var(--c,#ffe14d))}}
.p3-stick{position:absolute;left:0;top:0;width:116px;height:116px;margin:-58px 0 0 -58px;border-radius:50%;background:radial-gradient(circle,rgba(255,246,232,.10),rgba(255,246,232,.22));box-shadow:inset 0 0 0 3px rgba(255,246,232,.55),0 0 18px rgba(255,225,77,.25);opacity:0;transform:scale(.6);transition:opacity .15s,transform .15s}
.p3-stick.on{opacity:1;transform:none}
.p3-knob{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff6e8,#ffd27a 55%,#e0a43a);box-shadow:0 3px 8px rgba(10,5,30,.5)}
.p3-fps{position:absolute;left:calc(var(--g) + var(--sl));bottom:calc(10px + var(--sb));font:11px ui-monospace,monospace;color:#9dff4a;background:rgba(23,16,43,.6);padding:3px 6px;border-radius:6px;display:none}
.p3-tag{position:absolute;left:calc(var(--g) + var(--sl));top:calc(60px + var(--st));padding:4px 10px;border-radius:10px;background:rgba(23,16,43,.62);font-weight:900;font-size:11px;letter-spacing:.14em;color:#ffd27a;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.p3-hint{position:absolute;left:50%;bottom:calc(120px + var(--sb));transform:translateX(-50%);font-weight:700;font-size:13px;padding:7px 14px;border-radius:14px;background:rgba(23,16,43,.62);white-space:nowrap;opacity:0;transition:opacity .6s}
.p3-hint.on{opacity:.95}
`;

export function createUI(ctx, ctl, o) {
  const dom = o.dom || document.body, spots = o.spots, player = o.player, terrain = o.terrain, IN = !!(terrain && terrain.interior);
  if (!document.getElementById('p3-style')) { const st = document.createElement('style'); st.id = 'p3-style'; st.textContent = CSS; document.head.appendChild(st); }
  const fixed = dom === document.body; if (!fixed && getComputedStyle(dom).position === 'static') dom.style.position = 'relative';
  const root = document.createElement('div'); root.className = 'p3'; if (fixed) root.style.position = 'fixed'; dom.appendChild(root);
  const q = (cls, tag, parent) => { const e = document.createElement(tag || 'div'); e.className = cls; (parent || root).appendChild(e); return e; };
  const park = () => window.__park;

  // ----- top bar -----
  const bar = q('p3-bar'); const mkSeg = (items, onPick, init) => { const seg = q('p3-seg', 'div', bar), btns = {}; items.forEach(([k, label]) => { const b = q('', 'button', seg); b.textContent = label; b.type = 'button'; b.setAttribute('aria-label', label); b.onclick = () => { onPick(k); Object.keys(btns).forEach((x) => btns[x].classList.toggle('on', x === k)); }; btns[k] = b; }); if (init && btns[init]) btns[init].classList.add('on'); return { seg, btns }; };
  const tag = q('p3-tag'); tag.textContent = IN ? 'FLAT' : 'PARK';
  const timeSeg = mkSeg([['day', 'DAY'], ['dusk', 'DUSK'], ['night', 'NIGHT']], (k) => park() && park().setTime(k), 'dusk');
  ctx.events.on('time', (k) => { if (timeSeg.btns[k]) Object.keys(timeSeg.btns).forEach((x) => timeSeg.btns[x].classList.toggle('on', x === k)); });
  const right = q('p3-seg', 'div', bar); const qBtns = {}; [['low', 'LOW'], ['med', 'MED'], ['high', 'HIGH']].forEach(([k, l]) => { const b = q('', 'button', right); b.textContent = l; b.type = 'button'; b.onclick = () => { park() && park().setQuality(k); Object.keys(qBtns).forEach((x) => qBtns[x].classList.toggle('on', x === k)); }; qBtns[k] = b; });
  const fpsBtn = q('', 'button', right); fpsBtn.textContent = 'FPS'; fpsBtn.type = 'button'; const fpsEl = q('p3-fps'); fpsBtn.onclick = () => { const on = fpsEl.style.display !== 'block'; fpsEl.style.display = on ? 'block' : 'none'; fpsBtn.classList.toggle('on', on); };
  if (qBtns[ctx.quality]) qBtns[ctx.quality].classList.add('on');

  // ----- joystick visual -----
  const stick = q('p3-stick'), knob = q('p3-knob', 'div', stick);
  ctx.events.on('stick', (s) => { stick.classList.toggle('on', !!s.active); if (s.active) { stick.style.left = s.ox + 'px'; stick.style.top = s.oy + 'px'; const dx = s.kx - s.ox, dy = s.ky - s.oy, l = Math.hypot(dx, dy), m = Math.min(l, 58) / (l || 1); knob.style.transform = 'translate(' + dx * m + 'px,' + dy * m + 'px)'; } else knob.style.transform = ''; });

  // ----- toast + hint -----
  const toastEl = q('p3-toast'); let toastT = 0; function toast(msg, ms) { toastEl.textContent = msg; toastEl.classList.add('on'); toastT = (ms || 2200) / 1000; }
  const hint = q('p3-hint'); hint.textContent = 'Drag to walk  -  tap to go'; let hintT = 0, hintDone = false;

  // ----- context button -----
  const go = q('p3-go', 'button'); go.type = 'button'; const goIcon = document.createElement('canvas'); goIcon.width = goIcon.height = 100; go.appendChild(goIcon); const goLabel = document.createElement('span'); go.appendChild(goLabel); const key = document.createElement('small'); key.textContent = 'E'; go.appendChild(key);
  const icons = {}; const iconFor = (n) => { const k = (n.icon || n.id) + n.color; return icons[k] || (icons[k] = spotGlyphCanvas(n.icon || n.id, n.color, 100)); };
  let shownId = null; go.onclick = () => { ctl.interact(); };
  function setPrompt(n) { const id = n ? n.id : null; if (id === shownId) return; shownId = id; if (n) { goLabel.textContent = n.label; go.style.setProperty('--c', n.color); const g = goIcon.getContext('2d'); g.clearRect(0, 0, 100, 100); g.drawImage(iconFor(n), 0, 0); go.classList.remove('show'); void go.offsetWidth; go.classList.add('show'); go.setAttribute('aria-label', n.label); go.tabIndex = 0; } else { go.classList.remove('show'); go.tabIndex = -1; } }

  // ----- demo spot handling -----
  ctx.events.on('spot', (e) => { const s = spots && spots.spots.find((x) => x.id === e.id); toast((s ? s.label : e.id.toUpperCase()) + '!', 2400); if (window.__PARK_AUTODONE !== false) setTimeout(() => ctx.events.emit('spotDone', { id: e.id }), 2600); });

  ctx.events.on('npc', (e) => { if (window.__PARK_AUTODONE === false) return; const n = (ctx.npcs || []).find((x) => x.id === (e && e.id)); toast((n && n.npcName ? n.npcName : e.id) + ': yo, what is up?', 2400); });

  // ----- minimap (player-centred, rotated so screen up = camera forward) -----
  const mini = q('p3-mini'), mc = document.createElement('canvas'), DPR = Math.min(2, window.devicePixelRatio || 1); mc.width = mc.height = Math.round(90 * DPR); mini.appendChild(mc); const mg = mc.getContext('2d');
  let blocked = null, blockedKey = '', gv = -1; const PPU = 5;
  function bakeBlocked() { const b = terrain.bounds, w = Math.ceil((b.maxX - b.minX) * PPU), h = Math.ceil((b.maxZ - b.minZ) * PPU), c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = IN ? '#b98a5e' : '#5cae52'; g.fillRect(0, 0, w, h);
    // paths: use terrain.paths if the artist exposes them, else a guide drawn from the anchors
    const A = terrain.anchors || {}; if (IN) { g.fillStyle = 'rgba(40,24,70,.85)'; const gr0 = ctl.grid; for (let j = 0; j < gr0.nz; j++) for (let i = 0; i < gr0.nx; i++) if (gr0.blk[j * gr0.nx + i]) g.fillRect((gr0.cx(i) - gr0.cs / 2 - b.minX) * PPU, (gr0.cz(j) - gr0.cs / 2 - b.minZ) * PPU, gr0.cs * PPU, gr0.cs * PPU); blocked = c; blockedKey = [b.minX, b.maxX, b.minZ, b.maxZ].join(); return; }
    g.strokeStyle = '#e4c9a0'; g.lineCap = 'round'; g.lineJoin = 'round'; const P = (x, z) => [(x - b.minX) * PPU, (z - b.minZ) * PPU];
    if (terrain.paths) { terrain.paths.forEach((pa) => { g.lineWidth = (pa.w || 2) * PPU; g.beginPath(); pa.points.forEach((pt, i) => { const q2 = P(pt.x, pt.z); i ? g.lineTo(q2[0], q2[1]) : g.moveTo(q2[0], q2[1]); }); g.stroke(); }); }
    else { g.lineWidth = 2.4 * PPU; const ln = (a, b2) => { if (!a || !b2) return; const p0 = P(a.x, a.z), p1 = P(b2.x, b2.z); g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); }; ln(A.gate, A.fountain); ln(A.fountain, A.buskSpot); ln(A.fountain, A.bench); ln(A.fountain, A.graffiti); ln(A.gate, A.runStart); ln(A.gate, A.flyers); }
    if (A.fountain) { const f = P(A.fountain.x, A.fountain.z); g.fillStyle = '#c8bfd6'; g.beginPath(); g.arc(f[0], f[1], 4 * PPU, 0, 7); g.fill(); g.fillStyle = '#5ec6e8'; g.beginPath(); g.arc(f[0], f[1], 2.2 * PPU, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(40,24,70,.85)'; const gr = ctl.grid; for (let j = 0; j < gr.nz; j++) for (let i = 0; i < gr.nx; i++) if (gr.blk[j * gr.nx + i]) { const x = (gr.cx(i) - gr.cs / 2 - b.minX) * PPU, z = (gr.cz(j) - gr.cs / 2 - b.minZ) * PPU; g.fillRect(x, z, gr.cs * PPU, gr.cs * PPU); }
    blocked = c; blockedKey = [b.minX, b.maxX, b.minZ, b.maxZ].join(); }
  let mmT = 0;
  function drawMini(t) {
    const b = terrain.bounds, pp = player.object.position, yaw = ctl.yaw; if (!b) return; if (!blocked || (gv !== ctl.gridVersion && ctl.gridVersion > 0 && (gv = ctl.gridVersion, true))) { try { bakeBlocked(); } catch (e) { blocked = document.createElement('canvas'); } }
    const K = (IN ? Math.min(4.6, 84 / Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ)) : 2.3) * DPR; mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, mc.width, mc.height); mg.save(); mg.beginPath(); mg.arc(mc.width / 2, mc.height / 2, mc.width / 2 - 1, 0, 7); mg.clip(); mg.fillStyle = '#1d1233'; mg.fillRect(0, 0, mc.width, mc.height);
    mg.translate(mc.width / 2, mc.height / 2); mg.rotate(yaw); mg.scale(K, K); if (IN) mg.translate(-(b.minX + b.maxX) / 2, -(b.minZ + b.maxZ) / 2); else mg.translate(-pp.x, -pp.z);
    if (blocked.width) { mg.drawImage(blocked, b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ); mg.strokeStyle = '#ffd27a'; mg.lineWidth = 0.5; mg.strokeRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ); }
    const near = spots.nearest(pp); (spots.spots || []).forEach((s) => { if (s.placed === false) return; const r = (near === s ? 1.7 + 0.35 * Math.sin(t * 8) : 1.45) * (IN ? 0.55 : 1); mg.beginPath(); mg.arc(s.x, s.z, r, 0, 7); mg.fillStyle = s.color; mg.fill(); mg.lineWidth = 0.45; mg.strokeStyle = '#fff6e8'; mg.stroke(); });
    const tg = ctl.target; if (tg) { mg.beginPath(); mg.arc(tg.x, tg.z, 0.9, 0, 7); mg.strokeStyle = '#ffe14d'; mg.lineWidth = 0.4; mg.stroke(); }
    mg.save(); mg.translate(pp.x, pp.z); mg.scale(IN ? 0.65 : 1, IN ? 0.65 : 1); mg.rotate(-ctl.heading + Math.PI); // arrow: character forward is +z (heading from +z), canvas up is -z in this frame
    mg.rotate(0); mg.beginPath(); mg.moveTo(0, -2.6); mg.lineTo(1.7, 1.8); mg.lineTo(0, 0.8); mg.lineTo(-1.7, 1.8); mg.closePath(); mg.fillStyle = '#ffffff'; mg.fill(); mg.lineWidth = 0.5; mg.strokeStyle = '#17102b'; mg.stroke(); mg.restore();
    mg.restore(); mg.setTransform(1, 0, 0, 1, 0, 0); mg.beginPath(); mg.arc(mc.width / 2, mc.height / 2, mc.width / 2 - 1.5 * DPR, 0, 7); mg.lineWidth = 3 * DPR; mg.strokeStyle = 'rgba(255,210,122,.9)'; mg.stroke();
  }

  // ----- keyboard focus hint: show 'E' only on desktop (css media) -----
  let fpsT = 0, barH = 0, frame = 0;
  function update(dt, t) {
    frame++; if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('on'); }
    const n = ctl.locked ? null : spots.nearest(player.object.position); setPrompt(n);
    if (!hintDone) { if (!hintT && !ctl.intro) { hintT = 0.001; hint.classList.add('on'); } if (hintT) { hintT += dt; if (hintT > 5 || ctl.speed > 1) { hint.classList.remove('on'); if (hintT > 5.8 || ctl.speed > 1) hintDone = true; } } }
    if ((frame & 1) === 0) { try { drawMini(t); } catch (e) { /* ignore */ } }
    fpsT += dt; if (fpsT > 0.5) { fpsT = 0; const bh = bar.offsetHeight; if (bh !== barH) { barH = bh; mini.style.top = 'calc(' + (bh + 14) + 'px + var(--st))'; toastEl.style.top = 'calc(' + (bh + 14) + 'px + var(--st))'; } if (fpsEl.style.display === 'block' && park()) { const s = park().stats(); fpsEl.textContent = s.fps + ' fps  ' + s.calls + ' calls  ' + Math.round(s.tris / 1000) + 'k tris'; } }
  }
  return { update, toast, destroy() { root.remove(); } };
}

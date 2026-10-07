// BEATBOX HEROES r3 -- ui_kit3d.js (UI owner)
// The 3D UI kit + the installer. Load order: theme3d.css (or let install() add the <link>), icons3d.js, hud3d.js, ui_kit3d.js.
//   BBH.R3UI.install(opts)    swaps E.toast / E.banner / E.dialog / E.modal / E.iconEl / E.makeHud / E.clearUI for the 3D versions.
//                             Every replacement checks `body.r3 && BBH.R3` at CALL time and falls back to the 2D original otherwise,
//                             so mixed 2D/3D scenes just work. Also lays #stage out for 3D (full height, bottom aligned) and publishes --S.
//   BBH.R3UI.uninstall()      restores everything.
//   BBH.R3UI.hooks            { dialogLine(line, i), dialogEnd(), uiBlock(n) }  (E.hooks.* is honoured too; R3UI.hooks wins)
//   BBH.R3UI.portrait         (look, mood, who) -> Element|null   replace with the 3D bust at M5. Default: Chars.portrait pixel art.
//   BBH.R3UI.hudDefaults      defaults for the E.makeHud wrapper: { nav, goal, menu, map } (all false: stats only)
//   BBH.R3UI.toast/banner/dialog/modal/confetti(x,y,n,colors)   direct calls (no install needed, still need body.r3)
// DOM it owns: #hud3 (HUD, z 3), #r3kit (toasts/banner/dialog/modal/confetti, z 30). Legacy widgets in #ui are skinned by theme3d.css only.
(function (root) {
  'use strict';
  const BBH = root.BBH = root.BBH || {};
  const R3UI = BBH.R3UI = BBH.R3UI || {};
  const BASE = (document.currentScript && document.currentScript.src || '').replace(/[^\/]*$/, '');
  const on = () => !!(document.body && document.body.classList.contains('r3') && BBH.R3);
  const E = () => BBH.Eng || BBH.E;
  const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const icon = (n, px) => (BBH.R3Icons ? BBH.R3Icons.svg(n, px) : '');
  R3UI.hooks = R3UI.hooks || {};
  R3UI.hudDefaults = R3UI.hudDefaults || { nav: false, goal: false, menu: false, map: false };
  R3UI.icon = icon; R3UI.on = on;
  const hook = (name, ...a) => { try { const f = R3UI.hooks[name] || (E() && E().hooks && E().hooks[name]); if (f) return f(...a); } catch (e) { console.error(e); } };
  const sfx = (n, o) => { try { E().sfx(n, o); } catch (e) { /* ignore */ } };
  const reduced = () => { try { return !!E().settings.reduce || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };

  /* ------------------------------------------------------------ containers */
  let kit = null, toastBox, bannerBox, dlgBox, modalBox, confCv;
  function ensureKit() {
    if (kit && kit.isConnected) return kit;
    let host = document.getElementById('r3kit');
    if (!host) { host = mk('div'); host.id = 'r3kit'; document.body.appendChild(host); }
    host.innerHTML = '';
    kit = mk('div', 'k3'); host.appendChild(kit);
    confCv = mk('canvas', 'k3-confetti'); toastBox = mk('div', 'k3-toasts'); bannerBox = mk('div', 'k3-banner'); dlgBox = mk('div', 'k3-lay'); modalBox = mk('div', 'k3-lay');
    [dlgBox, modalBox].forEach((b) => { b.style.cssText = 'position:absolute;inset:0;pointer-events:none'; });
    kit.append(confCv, bannerBox, toastBox, dlgBox, modalBox);
    return kit;
  }

  /* ----------------------------------------------------------------- toast */
  R3UI.toast = function (text, kind) {
    ensureKit();
    const el = mk('div', 'k3-toast' + (kind ? ' ' + kind : ''));
    if (kind === 'good') el.innerHTML = icon('check'); else if (kind === 'warn') el.innerHTML = icon('cross');
    const sp = mk('span'); sp.textContent = text; el.appendChild(sp);
    toastBox.appendChild(el); while (toastBox.children.length > 3) toastBox.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2300);
    return el;
  };

  /* --------------------------------------------------------------- confetti */
  const parts = []; let confRun = false, confCtx = null, confDpr = 1;
  function confSize() { const w = root.innerWidth, h = root.innerHeight; confDpr = Math.min(2, root.devicePixelRatio || 1); if (confCv.width !== Math.round(w * confDpr)) { confCv.width = Math.round(w * confDpr); confCv.height = Math.round(h * confDpr); } }
  R3UI.confetti = function (x, y, n, colors) {
    if (reduced()) return; ensureKit(); confSize();
    const cols = colors || ['#ffd35c', '#ff5cb0', '#2ee6ff', '#9dff4a', '#fff6e8'];
    if (x === undefined) x = root.innerWidth / 2; if (y === undefined) y = root.innerHeight * 0.28;
    for (let i = 0; i < (n || 70); i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, sp = 160 + Math.random() * 360; parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: Math.random() * 6, vr: (Math.random() - 0.5) * 14, w: 6 + Math.random() * 6, h: 4 + Math.random() * 5, c: cols[(Math.random() * cols.length) | 0], life: 1.5 + Math.random() * 0.9, age: 0 }); }
    if (parts.length > 260) parts.splice(0, parts.length - 260);
    if (!confRun) { confRun = true; let t0 = performance.now(); confCtx = confCv.getContext('2d'); const step = (t) => { const dt = Math.min(0.05, (t - t0) / 1000); t0 = t; confCtx.setTransform(1, 0, 0, 1, 0, 0); confCtx.clearRect(0, 0, confCv.width, confCv.height); confCtx.scale(confDpr, confDpr);
      for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.age += dt; if (p.age > p.life) { parts.splice(i, 1); continue; } p.vy += 900 * dt; p.vx *= 0.992; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; confCtx.save(); confCtx.globalAlpha = Math.min(1, (p.life - p.age) * 2); confCtx.translate(p.x, p.y); confCtx.rotate(p.r); confCtx.fillStyle = p.c; confCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 1.7)) + 1); confCtx.restore(); }
      if (parts.length) requestAnimationFrame(step); else { confRun = false; confCtx.clearRect(0, 0, confCv.width, confCv.height); } }; requestAnimationFrame(step); }
  };

  /* ---------------------------------------------------------------- banner */
  const bq = []; let bBusy = false;
  const BK = { levelup: ['LEVEL UP!', '#9dff4a', 'rgba(157,255,74,.35)', 'level'], achievement: ['ACHIEVEMENT', '#ffd35c', 'rgba(255,211,92,.35)', 'trophy'], unlock: ['NEW UNLOCK', '#2ee6ff', 'rgba(46,230,255,.35)', 'star'] };
  R3UI.banner = function (kind, title, sub, pix) { bq.push({ kind, title, sub, pix }); if (!bBusy) nextBanner(); };
  function nextBanner() {
    const b = bq.shift(); if (!b) { bBusy = false; return; } bBusy = true; ensureKit();
    const k = BK[b.kind] || BK.unlock;
    const card = mk('div', 'k3-bcard'); card.style.setProperty('--bc', k[1]); card.style.setProperty('--bg', k[2]);
    card.appendChild(mk('div', 'k3-bkind', k[0]));
    const ib = mk('div', 'k3-bicon');
    if (b.pix && b.pix.w > 20) { try { const c = document.createElement('canvas'); c.width = b.pix.w; c.height = b.pix.h; c.getContext('2d').drawImage(b.pix.canvas(), 0, 0); ib.appendChild(c); } catch (e) { ib.innerHTML = icon(k[3]); } }
    else ib.innerHTML = icon(k[3]);
    card.appendChild(ib); const t = mk('div', 'k3-btitle'); t.textContent = b.title; card.appendChild(t);
    if (b.sub) { const s = mk('div', 'k3-bsub'); s.textContent = b.sub; card.appendChild(s); }
    bannerBox.appendChild(card);
    try { const r = card.getBoundingClientRect(); R3UI.confetti(r.left + r.width / 2, r.top + 30, 56); } catch (e) { /* ignore */ }
    setTimeout(() => { card.classList.add('out'); setTimeout(() => { card.remove(); nextBanner(); }, 320); }, 2500);
  }

  /* ---------------------------------------------------------------- dialog */
  function defaultPortrait(look, mood) {
    try { const C = BBH.Chars; const pix = C.portrait(C.fix(look), mood || 'neutral'); const c = document.createElement('canvas'); c.width = pix.w; c.height = pix.h; c.getContext('2d').drawImage(pix.canvas(), 0, 0); return c; } catch (e) { return null; }
  }
  R3UI.portrait = R3UI.portrait || null;
  let blockN = 0;
  const block = (d) => { const e = E(); blockN += d; if (e) e.uiBlock = Math.max(0, (e.uiBlock || 0) + d); hook('uiBlock', e ? e.uiBlock : blockN); };
  R3UI.dialog = function (lines, onDone) {
    ensureKit(); block(1);
    let i = 0, shown = 0, timer = null, full = '', closed = false;
    const veil = mk('div', 'k3-veil'), box = mk('div', 'k3-dlg');
    const por = mk('div', 'k3-por'), name = mk('div', 'k3-name'), txt = mk('div', 'k3-txt'), cnt = mk('div', 'k3-count'), hint = mk('div', 'k3-hint', icon('right'));
    hint.querySelector('svg').style.cssText = 'width:22px;height:22px;transform:rotate(90deg)';
    box.append(por, name, txt, cnt, hint); dlgBox.append(veil, box);
    function show() {
      const L = lines[i]; if (!L) { finish(); return; }
      const e = E(), npc = L.who && BBH.Core.NPCS[L.who], look = L.look || (npc && npc.look) || null, nm = L.name || (npc && npc.name) || '';
      por.innerHTML = ''; let pe = null;
      if (look) { try { pe = (R3UI.portrait && R3UI.portrait(look, L.mood || 'neutral', L.who)) || defaultPortrait(look, L.mood); } catch (x) { pe = null; } }
      if (pe) por.appendChild(pe); por.style.display = pe ? 'flex' : 'none';
      box.classList.toggle('has-por', !!pe); box.classList.toggle('has-name', !!nm); name.textContent = nm; cnt.textContent = lines.length > 1 ? (i + 1) + '/' + lines.length : '';
      full = String(L.text); shown = 0; txt.textContent = ''; clearInterval(timer); hint.style.opacity = 0;
      hook('dialogLine', L, i);
      timer = setInterval(() => { shown += 1; txt.textContent = full.slice(0, shown); if (shown % 3 === 1 && full[shown - 1] !== ' ') sfx('click', { quiet: true, pitch: 1.4 }); if (shown >= full.length) { clearInterval(timer); hint.style.opacity = 1; } }, 22);
    }
    function adv() { if (closed) return; if (shown < full.length) { clearInterval(timer); shown = full.length; txt.textContent = full; hint.style.opacity = 1; return; } i++; if (i >= lines.length) finish(); else { sfx('click'); show(); } }
    function finish() { if (closed) return; closed = true; clearInterval(timer); veil.remove(); box.remove(); root.removeEventListener('keydown', key, true); block(-1); hook('dialogEnd'); if (onDone) onDone(); }
    function key(ev) { if (ev.code === 'Space' || ev.code === 'Enter') { ev.preventDefault(); ev.stopPropagation(); adv(); } }
    box.addEventListener('click', adv); veil.addEventListener('click', adv); root.addEventListener('keydown', key, true);
    const api = { close: finish, el: box, _quiet() { if (!closed) { closed = true; clearInterval(timer); root.removeEventListener('keydown', key, true); block(-1); } } };
    api.el._api = api; show(); return api;
  };

  /* ----------------------------------------------------------------- modal */
  R3UI.modal = function (o) {
    ensureKit(); block(1);
    const e = E(), veil = mk('div', 'k3-veil dim'), box = mk('div', 'k3-modal'); const inner = mk('div', 'k3-modal-in'); box.appendChild(inner);
    let closed = false;
    function close() { if (closed) return; closed = true; veil.remove(); box.remove(); block(-1); }
    if (o.title) { const t = mk('div', 'k3-mt'); t.textContent = o.title; inner.appendChild(t); }
    const body = mk('div', 'k3-mb'); if (typeof o.body === 'string') body.textContent = o.body; else if (o.body) body.appendChild(o.body); if (o.body) inner.appendChild(body);
    const row = mk('div', 'k3-mbtn');
    (o.buttons || [{ label: 'OK' }]).forEach((b) => row.appendChild(e.btn(b.label, b.cls || '', () => { close(); if (b.fn) b.fn(); })));
    inner.appendChild(row); modalBox.append(veil, box);
    return { close, el: box };
  };

  /* ---------------------------------------------------------- clear on scene */
  function clearKitLayers() { if (!kit) return; kit.querySelectorAll('.k3-lay').forEach((l) => { Array.from(l.children).forEach((c) => { if (c._api) c._api._quiet(); }); l.innerHTML = ''; }); blockN = 0; const e = E(); if (e) { e.uiBlock = 0; hook('uiBlock', 0); } }

  /* ============================================================== installer */
  let installed = false, orig = null, mo = null, stageApplied = false;
  function setS() {
    const e = E(), s = e && e.S || 1; document.documentElement.style.setProperty('--S', String(s));
  }
  function layout() {
    const e = E(); if (!e || !e.stage) return; const stage = e.stage;
    if (on()) {
      setS(); const vh = root.innerHeight, s = e.S || 1;
      // full-height stage: bottom sheets sit on the real screen bottom, x stays centred (the 270 unit column)
      stage.style.height = 'max(480px, calc((' + vh + 'px - env(safe-area-inset-top, 0px)) / ' + s + '))'; stage.style.top = 'env(safe-area-inset-top, 0px)'; stageApplied = true;
      document.body.classList.toggle('r3-reduce', !!e.settings.reduce);
    } else if (stageApplied) {
      stageApplied = false; stage.style.height = ''; document.documentElement.style.removeProperty('--S'); document.body.classList.remove('r3-reduce'); root.dispatchEvent(new Event('resize'));
    }
  }
  function ensureCss() {
    if ([...document.querySelectorAll('link[rel=stylesheet]')].some((l) => /theme3d\.css/.test(l.getAttribute('href') || ''))) return;
    const l = mk('link'); l.rel = 'stylesheet'; l.id = 'r3-theme'; l.href = (BASE || 'r3/') + 'theme3d.css'; document.head.appendChild(l);
  }
  R3UI.install = function (opts) {
    if (installed) return R3UI; const e = E(); if (!e) throw new Error('R3UI.install: engine not loaded');
    opts = opts || {}; if (opts.hooks) Object.assign(R3UI.hooks, opts.hooks); if (opts.hudDefaults) Object.assign(R3UI.hudDefaults, opts.hudDefaults);
    orig = { iconEl: e.iconEl, makeHud: e.makeHud, toast: e.toast, banner: e.banner, dialog: e.dialog, modal: e.modal, clearUI: e.clearUI };
    ensureCss(); ensureKit();
    let hl = document.getElementById('hud3'); if (!hl) { hl = mk('div'); hl.id = 'hud3'; document.body.appendChild(hl); }
    e.iconEl = function (name, scale, extra) { if (!on() || !BBH.R3Icons) return orig.iconEl.apply(this, arguments); const n = BBH.R3Icons.el(name, 'calc(var(--ik, 20px) * ' + (scale || 1) + ' * .85)', extra); return n; };
    e.toast = function (t, k) { return on() ? R3UI.toast(t, k) : orig.toast.apply(this, arguments); };
    e.banner = function (k, t, s, p) { return on() ? R3UI.banner(k, t, s, p) : orig.banner.apply(this, arguments); };
    e.dialog = function (l, d) { return on() ? R3UI.dialog(l, d) : orig.dialog.apply(this, arguments); };
    e.modal = function (o) { return on() ? R3UI.modal(o) : orig.modal.apply(this, arguments); };
    e.clearUI = function () { orig.clearUI.apply(this, arguments); if (on()) clearKitLayers(); };
    e.makeHud = function (G) {
      if (!on() || !R3UI.hud) return orig.makeHud.apply(this, arguments);
      const hud = R3UI.hud.create(G, R3UI.hudDefaults), ph = mk('div', 'nopt'); ph.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none';
      ph.update = (ch) => hud.update(ch); ph.hud = hud; e.hudEl = ph;
      const obs = new MutationObserver(() => { if (!ph.isConnected) { obs.disconnect(); hud.destroy(); } }); obs.observe(e.ui, { childList: true });
      return ph;
    };
    root.addEventListener('resize', layout); mo = new MutationObserver(layout); mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    layout(); installed = true; return R3UI;
  };
  R3UI.uninstall = function () {
    if (!installed) return R3UI; const e = E(); Object.assign(e, orig);
    root.removeEventListener('resize', layout); if (mo) mo.disconnect(); mo = null;
    const h = document.getElementById('hud3'); if (h) h.remove(); const k = document.getElementById('r3kit'); if (k) k.remove(); kit = null;
    const l = document.getElementById('r3-theme'); if (l) l.remove();
    document.body.classList.remove('r3-reduce'); if (stageApplied) { stageApplied = false; e.stage.style.height = ''; root.dispatchEvent(new Event('resize')); }
    document.documentElement.style.removeProperty('--S'); installed = false; return R3UI;
  };
  R3UI.layout = layout;
})(typeof globalThis !== 'undefined' ? globalThis : this);

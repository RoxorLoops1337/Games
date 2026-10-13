// photo.js : Photo mode for the hub and the fight outro. Hides the UI, free camera (drag look, pinch dolly, two-finger pan, wheel, WASD), FOV, time of day,
// edge focus (vignette + soft edge blur), filters (natural, golden, noir, vivid), then a Roman "share card" PNG (frame, ludus name, week, fame, game title)
// saved with canvas.toBlob or handed to navigator.share. All DOM classes are prefixed .lx-photo (rules appended to css/ui.css).
//   const photo = createPhoto(game);   photo.fab (hub HUD button)   photo.open('hub'|'fight')   photo.close()   photo.frame(dt, t)  (call every frame; applies the camera)
//   photo.capture() -> canvas   photo.compose(canvas, info) -> share card canvas   photo.active
// Capture is preserveDrawingBuffer-safe: post.render() runs and the GL canvas is copied with drawImage in the SAME task, before the browser can clear it.
import * as THREE from 'three';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const FILTERS = {
  none: { n: 'Natural', css: 'none' },
  golden: { n: 'Golden', css: 'sepia(0.32) saturate(1.28) hue-rotate(-10deg) contrast(1.06) brightness(1.04)' },
  noir: { n: 'Noir', css: 'grayscale(1) contrast(1.3) brightness(0.96)' },
  vivid: { n: 'Vivid', css: 'saturate(1.5) contrast(1.12) brightness(1.02)' },
};
const PREF_KEY = 'ludus_maximus_3d_prefs';
const prefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch (e) { return {}; } };
const reduced = () => { try { return !!(prefs().rm || document.body.classList.contains('lx-reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
const hourName = (h) => (h < 5.5 || h >= 20.5 ? 'Night' : h < 7.5 ? 'Dawn' : h < 11 ? 'Morning' : h < 14 ? 'Midday' : h < 16.5 ? 'Afternoon' : h < 18.5 ? 'Golden hour' : 'Dusk');
const fmtHour = (h) => { const hh = Math.floor(h) % 24, mm = Math.round((h - Math.floor(h)) * 60) % 60; return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };
const CAM_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>';
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

export function createPhoto(game) {
  const renderer = game.renderer, camera = game.camera, post = game.post, audio = game.audio;
  const glCanvas = renderer.domElement;
  const st = { active: false, mode: 'hub', yaw: 0, pitch: 0, pos: new THREE.Vector3(), fov: 42, fov0: 42, hour: 17, hourTouched: false, focus: 0.35, filter: 'none', saved: null, dirty: true, keys: new Set(), lastCard: null, lastShot: null };
  const sfx = (n, o) => { try { audio && audio.sfx && audio.sfx(n, o); } catch (e) { /* audio optional */ } };
  const S = () => game.S || {};

  // ---------------------------------------------------------------- DOM
  const mkFab = () => { const b = el('button', 'lx-photo-fab'); b.type = 'button'; b.setAttribute('aria-label', 'Photo mode'); b.title = 'Photo mode'; b.innerHTML = CAM_SVG; b.addEventListener('click', (e) => { e.stopPropagation(); sfx('uiTap'); api.open(game.scene === 'fight' ? 'fight' : 'hub'); }); return b; };
  const fab = mkFab(), fabFight = mkFab(); fabFight.classList.add('lx-photo-fab-fight'); fabFight.hidden = true;
  const root = el('div', 'lx-photo'); root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Photo mode');
  const vig = el('div', 'lx-photo-vig'); vig.setAttribute('aria-hidden', 'true');
  const top = el('div', 'lx-photo-top'), title = el('div', 'lx-photo-title', 'PHOTO MODE'), hint = el('div', 'lx-photo-hint', 'Drag to look, pinch or wheel to move, two fingers to pan');
  const closeB = el('button', 'lx-photo-btn lx-photo-x', 'Done'); closeB.type = 'button';
  const eyeB = el('button', 'lx-photo-btn lx-photo-eye', 'Controls'); eyeB.type = 'button';
  top.append(closeB, el('div', 'lx-photo-mid', null), eyeB); top.children[1].append(title, hint);
  const bar = el('div', 'lx-photo-bar');
  const slider = (label, min, max, step, val, on) => {
    const w = el('label', 'lx-photo-row'), l = el('span', 'lx-photo-lab', label), v = el('span', 'lx-photo-val'), r = document.createElement('input');
    r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val; r.setAttribute('aria-label', label);
    const upd = () => { v.textContent = on(+r.value, true) || ''; }; r.addEventListener('input', () => { on(+r.value); upd(); }); w.append(l, r, v); w.upd = upd; w.input = r; return w;
  };
  const fovRow = slider('Lens', 20, 90, 1, 42, (v, q) => { if (!q) { st.fov = v; st.dirty = true; } return Math.round(v) + '°'; });
  const timeRow = slider('Time', 5, 22, 0.1, 17, (v, q) => { if (!q) { st.hour = v; st.hourTouched = true; try { game.hub.setHour(v); } catch (e) { /* stub hub */ } } return fmtHour(v) + ' ' + hourName(v); });
  const focRow = slider('Focus', 0, 100, 1, 35, (v, q) => { if (!q) { st.focus = v / 100; applyLook(); } return v ? Math.round(v) + '%' : 'off'; });
  const chips = el('div', 'lx-photo-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Filter');
  const chipEls = {}; for (const k of Object.keys(FILTERS)) { const c = el('button', 'lx-photo-chip', FILTERS[k].n); c.type = 'button'; c.setAttribute('aria-pressed', k === 'none' ? 'true' : 'false'); c.addEventListener('click', () => { st.filter = k; applyLook(); sfx('uiTap', { gain: 0.5 }); }); chips.append(c); chipEls[k] = c; }
  const shutter = el('button', 'lx-photo-shutter'); shutter.type = 'button'; shutter.setAttribute('aria-label', 'Take photo'); shutter.innerHTML = CAM_SVG;
  const sliders = el('div', 'lx-photo-sliders'); sliders.append(fovRow, timeRow, focRow);
  const foot = el('div', 'lx-photo-foot'); foot.append(chips, shutter);
  bar.append(sliders, foot);
  const flash = el('div', 'lx-photo-flash'); flash.setAttribute('aria-hidden', 'true');
  root.append(vig, top, bar, flash);

  // result dialog
  const res = el('div', 'lx-photo-res'); res.hidden = true; res.setAttribute('role', 'dialog'); res.setAttribute('aria-label', 'Your photo');
  const resCard = el('div', 'lx-photo-rescard'), resImg = el('img', 'lx-photo-img'); resImg.alt = 'Share card preview';
  const resAct = el('div', 'lx-photo-resact');
  const mkBtn = (txt, cls, fn) => { const b = el('button', 'lx-photo-btn ' + cls, txt); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const shareB = mkBtn('Share card', 'lx-photo-gold', () => shareCard(true)), saveB = mkBtn('Save photo', '', () => shareCard(false)), backB = mkBtn('Retake', '', () => { sfx('uiClose'); res.hidden = true; });
  resAct.append(shareB, saveB, backB); resCard.append(resImg, resAct); res.append(resCard); root.append(res);
  const msg = el('div', 'lx-photo-msg'); msg.setAttribute('role', 'status'); root.append(msg);
  const host = () => document.getElementById('ui') || document.body;
  host().append(root);
  const say = (t) => { msg.textContent = t; msg.classList.add('on'); clearTimeout(say.t); say.t = setTimeout(() => msg.classList.remove('on'), 2400); };

  function applyLook() {
    const f = FILTERS[st.filter] || FILTERS.none; glCanvas.style.filter = st.active ? f.css : '';
    for (const k in chipEls) chipEls[k].setAttribute('aria-pressed', k === st.filter ? 'true' : 'false');
    root.style.setProperty('--lx-ph-vig', (0.08 + st.focus * 0.7).toFixed(2)); root.style.setProperty('--lx-ph-blur', (st.focus * 7).toFixed(1) + 'px'); root.classList.toggle('lx-photo-nofocus', st.focus < 0.02);
  }

  // ---------------------------------------------------------------- camera
  const _d = new THREE.Vector3(), _r = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const limits = () => (st.mode === 'fight' ? { xz: 42, y0: 0.7, y1: 40 } : { xz: 150, y0: 1.0, y1: 150 });
  function clampPos() {
    const L = limits(); st.pos.x = clamp(st.pos.x, -L.xz, L.xz); st.pos.z = clamp(st.pos.z, -L.xz, L.xz);
    let y0 = L.y0; if (st.mode === 'hub') { try { const gx = st.pos.x, gz = st.pos.z; const gnd = Math.abs(gx) < 26 && Math.abs(gz) < 21 ? game.hub.groundAt(gx, gz) : (game.hub.env && game.hub.env.groundHeightAt ? game.hub.env.groundHeightAt(gx, gz) : 0); y0 = Math.max(y0, gnd + 0.6); } catch (e) { /* ground unknown */ } }
    st.pos.y = clamp(st.pos.y, y0, L.y1);
  }
  const speedScale = () => clamp(st.pos.y * 0.05 + 0.15, 0.12, 1.6);
  function move(fwd, right, up) {
    _e.set(st.pitch, st.yaw, 0, 'YXZ'); _d.set(0, 0, -1).applyEuler(_e); _r.set(1, 0, 0).applyEuler(_e);
    st.pos.addScaledVector(_d, fwd).addScaledVector(_r, right); st.pos.y += up; clampPos(); st.dirty = true;
  }
  function pull() { camera.getWorldDirection(_d); st.yaw = Math.atan2(-_d.x, -_d.z); st.pitch = Math.asin(clamp(_d.y, -1, 1)); st.pos.copy(camera.position); }
  function push() {
    camera.position.copy(st.pos); _e.set(st.pitch, st.yaw, 0, 'YXZ'); camera.quaternion.setFromEuler(_e);
    if (Math.abs(camera.fov - st.fov) > 0.01) { camera.fov = st.fov; camera.updateProjectionMatrix(); } camera.updateMatrixWorld(true);
  }

  // pointer input (capture phase on the canvas, ahead of the hub / fight handlers; the hub is also switched off while we are open)
  const ptrs = new Map(); let pinch = null;
  const onDown = (e) => { if (!st.active || res.hidden === false) return; e.stopImmediatePropagation(); e.preventDefault(); try { glCanvas.setPointerCapture(e.pointerId); } catch (x) { /* */ } ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, btn: e.button, shift: e.shiftKey }); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; } };
  const onMove = (e) => {
    if (!st.active) return; const p = ptrs.get(e.pointerId); if (!p) return; e.stopImmediatePropagation(); e.preventDefault();
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1) {
      if (p.btn === 2 || p.btn === 1 || p.shift) move(0, -dx * 0.01 * speedScale() * 2, dy * 0.01 * speedScale() * 2);
      else { const k = 0.0045 * (st.fov / 42); st.yaw -= dx * k; st.pitch = clamp(st.pitch - dy * k, -1.45, 1.45); st.dirty = true; }
    } else if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      move((d - pinch.d) * 0.06 * speedScale() * 2, -(mx - pinch.mx) * 0.012 * speedScale() * 2, (my - pinch.my) * 0.012 * speedScale() * 2); pinch.d = d; pinch.mx = mx; pinch.my = my;
    }
  };
  const onUp = (e) => { if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId); try { glCanvas.releasePointerCapture(e.pointerId); } catch (x) { /* */ } if (ptrs.size < 2) pinch = null; if (st.active) e.stopImmediatePropagation(); };
  const onWheel = (e) => { if (!st.active) return; e.stopImmediatePropagation(); e.preventDefault(); move(-e.deltaY * 0.02 * speedScale(), 0, 0); };
  const onKey = (e) => { if (!st.active) return; if (e.key === 'Escape') { if (!res.hidden) { res.hidden = true; } else api.close(); return; } const k = e.key.toLowerCase(); if ('wasdqe'.includes(k) && k.length === 1 && !/INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '')) st.keys.add(k); };
  const onKeyUp = (e) => { st.keys.delete(e.key.toLowerCase()); };
  const onCtx = (e) => { if (st.active) e.preventDefault(); };

  // ---------------------------------------------------------------- open / close
  const api = {
    fab, fabFight, root, get active() { return st.active; }, get state() { return st; }, FILTERS,
    open(mode = 'hub') {
      if (st.active) return; try { game.closeAll && game.closeAll(); } catch (e) { /* */ }
      st.mode = mode === 'fight' ? 'fight' : 'hub'; st.active = true; pull(); st.fov0 = camera.fov; st.fov = camera.fov; st.keys.clear(); st.dirty = true;
      st.saved = { hud: game.hud.style.display, fv: game.fightView && game.fightView.hud ? game.fightView.hud.style.display : null, orb: game.hub && game.hub.orbit ? game.hub.orbit.enabled : null, filter: glCanvas.style.filter };
      game.hud.style.display = 'none'; if (game.fightView && game.fightView.hud) game.fightView.hud.style.display = 'none';
      if (st.mode === 'hub') { try { game.hub.closeCard && game.hub.closeCard(); game.hub.orbit.enabled = false; game.hub.setHover && game.hub.setHover(null); } catch (e) { /* */ } }
      const hubOn = st.mode === 'hub'; timeRow.hidden = !hubOn;
      if (hubOn) { try { st.hour = game.hub.stats().hour || 17; } catch (e) { st.hour = 17; } timeRow.input.value = clamp(st.hour, 5, 22); st.hourTouched = false; }
      fovRow.input.value = Math.round(st.fov); fovRow.upd(); timeRow.upd(); focRow.upd();
      title.textContent = hubOn ? 'PHOTO MODE' : 'PHOTO MODE · ARENA';
      root.hidden = false; root.classList.toggle('lx-photo-calm', reduced()); root.classList.remove('lx-photo-hidebar'); res.hidden = true; applyLook();
      glCanvas.addEventListener('pointerdown', onDown, true); glCanvas.addEventListener('pointermove', onMove, true); glCanvas.addEventListener('pointerup', onUp, true); glCanvas.addEventListener('pointercancel', onUp, true);
      glCanvas.addEventListener('wheel', onWheel, { capture: true, passive: false }); glCanvas.addEventListener('contextmenu', onCtx, true); addEventListener('keydown', onKey, true); addEventListener('keyup', onKeyUp, true);
      sfx('uiOpen'); try { closeB.focus({ preventScroll: true }); } catch (e) { /* */ }
    },
    close() {
      if (!st.active) return; st.active = false; ptrs.clear(); pinch = null; res.hidden = true; root.hidden = true; glCanvas.style.filter = st.saved ? st.saved.filter : '';
      glCanvas.removeEventListener('pointerdown', onDown, true); glCanvas.removeEventListener('pointermove', onMove, true); glCanvas.removeEventListener('pointerup', onUp, true); glCanvas.removeEventListener('pointercancel', onUp, true);
      glCanvas.removeEventListener('wheel', onWheel, true); glCanvas.removeEventListener('contextmenu', onCtx, true); removeEventListener('keydown', onKey, true); removeEventListener('keyup', onKeyUp, true);
      if (st.saved) { if (st.mode === 'hub' || game.scene === 'hub') game.hud.style.display = st.saved.hud || 'flex'; if (game.fightView && game.fightView.hud && st.saved.fv != null) game.fightView.hud.style.display = st.saved.fv; if (game.hub && game.hub.orbit && st.saved.orb != null) game.hub.orbit.enabled = st.saved.orb; }
      if (st.mode === 'hub' && st.hourTouched) { try { game.hub.setHour(null); } catch (e) { /* */ } }
      camera.fov = st.fov0; camera.updateProjectionMatrix(); sfx('uiClose');
    },
    /** call every frame AFTER the scene update (game.frame): keeps the fab states and, while open, overrides the camera */
    frame(dt) {
      const inHub = game.scene === 'hub'; fab.hidden = !(inHub && !st.active); fabFight.hidden = !(game.scene === 'fight' && game.fightView && game.fightView.phase === 'outro' && !st.active);
      if (fabFight.parentNode !== (game.fightView && game.fightView.hud) && game.fightView && game.fightView.hud) game.fightView.hud.append(fabFight);
      if (!st.active) return;
      if (game.scene !== 'hub' && game.scene !== 'fight') return api.close();
      if (st.mode === 'fight') { const fv = game.fightView; if (fv && fv.phase === 'outro') fv.outroT = Math.min(fv.outroT || 0, 1.0); else if (!fv || fv.phase === 'idle') return api.close(); }   // hold the outro open while we shoot
      if (st.keys.size) { const s = speedScale() * 6 * dt, k = st.keys; move(((k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0)) * s, ((k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0)) * s, ((k.has('e') ? 1 : 0) - (k.has('q') ? 1 : 0)) * s); }
      push();
    },
    // ---------------------------------------------------------------- capture + compose
    /** render once and copy the GL canvas in the same task (no preserveDrawingBuffer needed) */
    capture() {
      push(); const w = glCanvas.width, h = glCanvas.height, c = document.createElement('canvas'); c.width = w; c.height = h;
      renderer.info.reset(); post.render(0.0001, performance.now() / 1000); c.getContext('2d').drawImage(glCanvas, 0, 0, w, h);
      return c;
    },
    /** filter + edge focus + vignette on a captured canvas -> new canvas (long side capped at 2048) */
    develop(src, o = {}) {
      const f = FILTERS[o.filter || st.filter] || FILTERS.none, focus = o.focus != null ? o.focus : st.focus, sc = Math.min(1, 2048 / Math.max(src.width, src.height));
      const w = Math.round(src.width * sc), h = Math.round(src.height * sc), c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
      if (f.css !== 'none' && 'filter' in x) { x.filter = f.css; x.drawImage(src, 0, 0, w, h); x.filter = 'none'; }
      else { x.drawImage(src, 0, 0, w, h); if (f.css !== 'none') pixelFilter(x, w, h, o.filter || st.filter); }
      if (focus > 0.02) { // soft edge blur: a 1/9 scale copy scaled back up, shown only toward the edges
        const sm = document.createElement('canvas'); sm.width = Math.max(8, Math.round(w / 9)); sm.height = Math.max(8, Math.round(h / 9)); const sx = sm.getContext('2d'); sx.imageSmoothingQuality = 'high'; sx.drawImage(c, 0, 0, sm.width, sm.height);
        const lay = document.createElement('canvas'); lay.width = w; lay.height = h; const lx = lay.getContext('2d'); lx.imageSmoothingQuality = 'high'; lx.drawImage(sm, 0, 0, w, h);
        lx.globalCompositeOperation = 'destination-in'; const g = lx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.hypot(w, h) * 0.5); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(clamp(0.9 - focus * 0.5, 0.2, 0.9), 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${(0.35 + focus * 0.6).toFixed(2)})`); lx.fillStyle = g; lx.fillRect(0, 0, w, h);
        x.drawImage(lay, 0, 0);
      }
      const va = 0.08 + focus * 0.7 + (o.filter === 'noir' || st.filter === 'noir' ? 0.1 : 0), vg = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.56); vg.addColorStop(0, 'rgba(10,6,20,0)'); vg.addColorStop(1, `rgba(10,6,20,${clamp(va, 0, 0.85).toFixed(2)})`); x.fillStyle = vg; x.fillRect(0, 0, w, h);
      return c;
    },
    /** the Roman share card around a developed photo */
    compose(photo, info = {}) {
      const s = S(), k0 = photo.width < 900 ? Math.min(3, 900 / photo.width) : 1, W0 = Math.round(photo.width * k0), H0 = Math.round(photo.height * k0), u = Math.max(900, W0) / 1000, M = Math.round(38 * u), head = Math.round(168 * u), foot = Math.round(188 * u);   // small captures are scaled up so the card is share-sized
      const W = W0 + 2 * M, H = H0 + head + foot + M, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
      const serif = 'Georgia, "Palatino Linotype", "Times New Roman", serif';
      const bg = x.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#3b2150'); bg.addColorStop(0.5, '#241a3c'); bg.addColorStop(1, '#171229'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
      x.save(); x.globalAlpha = 0.07; for (let i = -H; i < W; i += 14 * u) { x.strokeStyle = '#f2c14e'; x.lineWidth = 1; x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H, H); x.stroke(); } x.restore();
      const gold = (a, b) => { const g = x.createLinearGradient(0, a, 0, b); g.addColorStop(0, '#ffe08a'); g.addColorStop(0.5, '#f2c14e'); g.addColorStop(1, '#b8803a'); return g; };
      x.strokeStyle = gold(0, H); x.lineWidth = 6 * u; x.strokeRect(7 * u, 7 * u, W - 14 * u, H - 14 * u); x.lineWidth = 1.6 * u; x.strokeRect(17 * u, 17 * u, W - 34 * u, H - 34 * u);
      for (const [cx, cy] of [[9 * u, 9 * u], [W - 9 * u, 9 * u], [9 * u, H - 9 * u], [W - 9 * u, H - 9 * u]]) { x.fillStyle = gold(0, H); x.beginPath(); x.arc(cx, cy, 9 * u, 0, 6.2832); x.fill(); }
      // title + meander band
      const spaced = (t, cx, y, sp) => { const w = [...t].map((ch) => x.measureText(ch).width + sp), tot = w.reduce((a, b) => a + b, 0) - sp; let px = cx - tot / 2; [...t].forEach((ch, i) => { x.fillText(ch, px, y); px += w[i]; }); };
      x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.font = `800 ${Math.round(46 * u)}px ${serif}`; x.fillStyle = '#5a3a14'; spaced('LUDUS MAXIMUS', W / 2 + 2 * u, M + 52 * u + 2 * u, 9 * u); x.fillStyle = gold(M, M + 60 * u); spaced('LUDUS MAXIMUS', W / 2, M + 52 * u, 9 * u);
      x.font = `600 ${Math.round(17 * u)}px ${serif}`; x.fillStyle = '#d8c79c'; spaced(String(info.caption || 'A day at the ludus').toUpperCase(), W / 2, M + 82 * u, 5 * u);
      const key = (y0, y1) => { const sz = 14 * u, y = y0; x.strokeStyle = '#f2c14e'; x.lineWidth = 1.7 * u; x.beginPath(); for (let px = M; px < W - M - sz; px += sz) { x.moveTo(px, y + sz * 0.8); x.lineTo(px, y); x.lineTo(px + sz * 0.8, y); x.lineTo(px + sz * 0.8, y + sz * 0.6); x.lineTo(px + sz * 0.3, y + sz * 0.6); x.lineTo(px + sz * 0.3, y + sz * 0.3); } x.stroke(); void y1; };
      key(M + 94 * u, 0);
      // photo in a gold frame
      const px = M, py = head;
      x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 18 * u; x.shadowOffsetY = 6 * u; x.fillStyle = '#000'; x.fillRect(px - 5 * u, py - 5 * u, W0 + 10 * u, H0 + 10 * u); x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetY = 0;
      x.imageSmoothingQuality = 'high'; x.drawImage(photo, px, py, W0, H0); x.strokeStyle = gold(py, py + H0); x.lineWidth = 5 * u; x.strokeRect(px - 2.5 * u, py - 2.5 * u, W0 + 5 * u, H0 + 5 * u);
      // parchment plate: ludus name, season and week, fame
      const fy = py + H0 + 22 * u, fh = foot - 22 * u - 6 * u, pg = x.createLinearGradient(0, fy, 0, fy + fh); pg.addColorStop(0, '#f6ecd0'); pg.addColorStop(1, '#dcc99b');
      x.fillStyle = pg; x.fillRect(M, fy, W0, fh); x.strokeStyle = '#9c7a42'; x.lineWidth = 3 * u; x.strokeRect(M + 1.5 * u, fy + 1.5 * u, W0 - 3 * u, fh - 3 * u); x.strokeStyle = 'rgba(122,82,34,.5)'; x.lineWidth = 1 * u; x.strokeRect(M + 8 * u, fy + 8 * u, W0 - 16 * u, fh - 16 * u);
      const name = String(s.name || 'Ludus Maximus'), week = ((s.week || 1) - 1) % 12 + 1, season = s.season || 1, fame = Math.round(s.fame || 0);
      x.textAlign = 'left'; x.fillStyle = '#2a1a30'; let fs = 44 * u; x.font = `800 ${fs}px ${serif}`; const maxW = W0 * 0.62; while (x.measureText(name).width > maxW && fs > 20 * u) { fs -= 2 * u; x.font = `800 ${fs}px ${serif}`; }
      x.fillText(name, M + 26 * u, fy + 56 * u);
      x.font = `700 ${Math.round(20 * u)}px ${serif}`; x.fillStyle = '#6a4a22'; x.fillText(`SEASON ${season}  ·  WEEK ${week}`, M + 26 * u, fy + 92 * u);
      x.font = `600 ${Math.round(15 * u)}px ${serif}`; x.fillStyle = '#7a6a52'; x.fillText('LUDUS MAXIMUS 3D', M + 26 * u, fy + fh - 22 * u);
      // laurel wreath + fame
      const cx = M + W0 - 150 * u, cy = fy + fh / 2 - 6 * u, rr = 38 * u; x.strokeStyle = '#7a5222'; x.lineWidth = 3.2 * u; x.fillStyle = '#7a8a3a';
      for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) { const a = Math.PI * (0.78 + i * 0.11) * (sd < 0 ? 1 : -1) + (sd < 0 ? 0 : Math.PI), lx = cx + Math.cos(a) * rr, ly = cy + Math.sin(a) * rr; x.save(); x.translate(lx, ly); x.rotate(a + Math.PI / 2 * sd); x.beginPath(); x.ellipse(0, 0, 5.5 * u, 11 * u, 0, 0, 6.2832); x.fill(); x.restore(); }
      x.fillStyle = '#2a1a30'; x.textAlign = 'center'; x.font = `800 ${Math.round(30 * u)}px ${serif}`; x.fillText(fame.toLocaleString('en-US'), cx, cy + 10 * u); x.font = `700 ${Math.round(14 * u)}px ${serif}`; x.fillStyle = '#6a4a22'; x.fillText('FAME', cx, cy + 62 * u);
      return c;
    },
    /** capture -> develop -> compose -> show the result dialog */
    async shoot() {
      if (!st.active) return null; const t0 = performance.now(); sfx('uiSelect'); sfx('coin', { gain: 0.35, pitch: 2 });
      if (!reduced()) { flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); }
      const raw = api.capture(), dev = api.develop(raw), cap = st.mode === 'fight' ? 'In the arena' : hourName(st.hourTouched ? st.hour : (game.hub.stats().hour || 17)) + ' at the ludus';
      const card = api.compose(dev, { caption: cap }); st.lastShot = dev; st.lastCard = card;
      resImg.src = card.toDataURL('image/jpeg', 0.82); res.hidden = false; resImg.style.aspectRatio = card.width + ' / ' + card.height;
      shareB.textContent = canShare() ? 'Share card' : 'Save card'; saveB.hidden = false;
      try { shareB.focus({ preventScroll: true }); } catch (e) { /* */ }
      st.shootMs = Math.round(performance.now() - t0); return card;
    },
  };
  const canShare = () => { try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [new File([new Blob(['x'], { type: 'image/png' })], 'a.png', { type: 'image/png' })] })); } catch (e) { return false; } };
  function pixelFilter(x, w, h, kind) {   // Safari without ctx.filter: close enough per-pixel versions of the CSS filters
    const im = x.getImageData(0, 0, w, h), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2]; const l = 0.299 * r + 0.587 * g + 0.114 * b;
      if (kind === 'noir') { r = g = b = (l - 128) * 1.3 + 124; }
      else if (kind === 'vivid') { r = (l + (r - l) * 1.5 - 128) * 1.12 + 130; g = (l + (g - l) * 1.5 - 128) * 1.12 + 130; b = (l + (b - l) * 1.5 - 128) * 1.12 + 130; }
      else { r = (l + (r - l) * 1.25) * 1.08 + 6; g = (l + (g - l) * 1.25) * 1.0 + 2; b = (l + (b - l) * 1.25) * 0.86; r = (r - 128) * 1.06 + 130; g = (g - 128) * 1.06 + 130; b = (b - 128) * 1.06 + 130; }
      d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
    x.putImageData(im, 0, 0);
  }
  /** PNG via canvas.toBlob, then navigator.share (files) when available, else a download */
  function shareCard(framed) {
    const c = framed ? st.lastCard : st.lastShot; if (!c) return; sfx('uiConfirm');
    c.toBlob(async (blob) => {
      if (!blob) return say('Could not create the picture'); const s = S(), nm = String(s.name || 'ludus').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), fn = `ludus-maximus-${nm}-w${((s.week || 1) - 1) % 12 + 1}${framed ? '-card' : ''}.png`;
      try { const file = new File([blob], fn, { type: 'image/png' }); if (framed && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Ludus Maximus', text: `${s.name || 'My ludus'}, season ${s.season || 1}, week ${((s.week || 1) - 1) % 12 + 1}` }); say('Shared'); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = fn; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); st.lastBlob = blob; st.lastName = fn; say('Saved ' + fn);
    }, 'image/png');
  }
  shutter.addEventListener('click', () => { api.shoot(); });
  closeB.addEventListener('click', () => api.close());
  eyeB.addEventListener('click', () => { root.classList.toggle('lx-photo-hidebar'); sfx('uiTap', { gain: 0.5 }); });
  api.shareCard = shareCard;
  // the hub fab lives in the main HUD (bottom corner)
  try { game.hud.append(fab); } catch (e) { /* hud not built yet */ }
  return api;
}

// Squishy Clay: runtime assets (tileable fingerprint grain, liquid wave mask tiles) + soft-body spring physics.
// One delegated pointer listener on document (capture) squashes any pressed button with volume preservation, dents it toward the finger
// (--px, --py, --dent feed a radial gradient in clay.css) and lets it wobble back with a jelly overshoot. Panels settle with a soft bounce,
// progress fills slosh when their value changes, switches squish via CSS. The rAF loop only runs while something is moving.
export default function init({ root, id }) {
  const noop = () => {};
  try { return start(root); } catch (e) { console.warn('[clay] init failed', e); return noop; }
}

function start(root) {
  const doc = document;
  const PRESS = 'button, .tap, .card, .rowi, .banner, .tb, .uis, .qitem, #card, .pill, .gp';
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || root.dataset.reduce === '1'; } catch { return false; } };
  const set = (k, v) => root.style.setProperty(k, v);

  // ---------- generated assets ----------
  function grain() {
    const N = 128, c = doc.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); if (!g) return;
    let a = new Float32Array(N * N), seed = 1337;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < a.length; i++) a[i] = rnd();
    const blur = (src, r) => { const o = new Float32Array(N * N); // wrapped box blur: the tile stays seamless
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0, n = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { s += src[((y + dy + N) % N) * N + ((x + dx + N) % N)]; n++; } o[y * N + x] = s / n; } return o; };
    const fine = blur(a, 1), soft = blur(a, 3); const img = g.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const v = (fine[i] - 0.5) * 2.6 + (soft[i] - 0.5) * 1.0; // fine pores + soft fingerprint blotches
      const light = v > 0, al = Math.min(1, Math.abs(v)) * 0.13;
      img.data[i * 4] = light ? 255 : 120; img.data[i * 4 + 1] = light ? 250 : 60; img.data[i * 4 + 2] = light ? 252 : 90; img.data[i * 4 + 3] = al * 255;
    }
    g.putImageData(img, 0, 0); set('--clay-grain', `url("${c.toDataURL('image/png')}")`);
  }
  function waveTile(amp) { // 8 x 16 tile; fill is on the left of a sine edge, transparent right of it
    let p = 'M0 0'; for (let i = 0; i <= 16; i++) p += ` L${(4 + amp * Math.sin(i / 16 * Math.PI * 2)).toFixed(2)} ${i}`; p += ' L0 16 Z';
    return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='8' height='16' viewBox='0 0 8 16'><path d='${p}' fill='black'/></svg>`)}")`;
  }
  grain(); set('--clay-wave', waveTile(1.5)); set('--clay-wave2', waveTile(3.3));
  root.dataset.clayJs = '1';

  // ---------- spring solver ----------
  // item: { el, kind, s, v, ts (target), w, z (omega, zeta), d, dv, td (dent), A (squash amount), W (width gain cap), rot, tilt }
  const live = new Set(); let raf = 0, last = 0;
  const geo = (el) => { const r = el.getBoundingClientRect(); return { w: Math.max(r.width, 1), h: Math.max(r.height, 1), r }; };
  function wake() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); } }
  function step(now) {
    raf = 0; const dt0 = Math.min(0.05, (now - last) / 1000); last = now;
    const n = Math.max(1, Math.ceil(dt0 / 0.008)), h = dt0 / n;
    for (const it of Array.from(live)) {
      for (let k = 0; k < n; k++) {
        it.v += (-it.w * it.w * (it.s - it.ts) - 2 * it.z * it.w * it.v) * h; it.s += it.v * h;
        it.dv += (-900 * (it.d - it.td) - 2 * 0.55 * 30 * it.dv) * h; it.d += it.dv * h;
      }
      if (it.s < -0.75) { it.s = -0.75; it.v = 0; }
      const rest = Math.abs(it.s - it.ts) < 0.003 && Math.abs(it.v) < 0.02 && Math.abs(it.d - it.td) < 0.004 && Math.abs(it.dv) < 0.05;
      if (rest && it.ts === 0) { clear(it); live.delete(it); continue; }
      paint(it);
    }
    if (live.size) raf = requestAnimationFrame(step);
  }
  function paint(it) {
    const e = it.el, sy = 1 - it.A * it.s, sx = Math.min(1 / sy, 1 + it.W);
    e.style.scale = `${sx.toFixed(4)} ${sy.toFixed(4)}`;
    e.style.rotate = `${(it.tilt * 2.4 * it.s).toFixed(3)}deg`;
    e.style.setProperty('--dent', Math.max(0, it.d).toFixed(3));
  }
  function clear(it) { const e = it.el; e.style.removeProperty('scale'); e.style.removeProperty('rotate'); e.style.removeProperty('--dent'); e.style.removeProperty('--px'); e.style.removeProperty('--py'); e.classList.remove('clay-down'); }
  const items = new WeakMap();
  function itemFor(el) {
    let it = items.get(el); const { w, h } = geo(el);
    if (!it) { it = { el, s: 0, v: 0, ts: 0, w: 38, z: 0.55, d: 0, dv: 0, td: 0, A: 0, W: 0, tilt: 0 }; items.set(el, it); }
    it.A = Math.max(0.03, Math.min(0.11, 5.8 / h)); it.W = Math.min(0.12, 7 / w);
    return it;
  }

  // ---------- pointer feedback (delegated, one listener set) ----------
  const down = new Map(); // pointerId -> item
  function aim(it, e) { const { r, w, h } = geo(it.el); const x = Math.max(0, Math.min(1, (e.clientX - r.left) / w)), y = Math.max(0, Math.min(1, (e.clientY - r.top) / h));
    it.el.style.setProperty('--px', (x * 100).toFixed(1) + '%'); it.el.style.setProperty('--py', (y * 100).toFixed(1) + '%'); it.tilt = (x - 0.5) * 2; }
  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target && e.target.closest && e.target.closest(PRESS); if (!el || el.disabled || el.classList.contains('off') || el.closest('.off')) return;
    if (el.matches('input, textarea') || el.closest('.sheet.closing')) return;
    const it = itemFor(el); down.set(e.pointerId, it); aim(it, e);
    el.classList.add('clay-down');
    if (reduced()) { it.s = it.ts = 1; it.d = it.td = 1; it.v = it.dv = 0; live.add(it); paint(it); return; }
    it.ts = 1; it.td = 1; it.w = 40; it.z = 0.62; it.v += 9; it.dv += 6; live.add(it); wake();
  }
  function onMove(e) { const it = down.get(e.pointerId); if (it) aim(it, e); }
  function onUp(e) {
    const it = down.get(e.pointerId); if (!it) return; down.delete(e.pointerId);
    it.el.classList.remove('clay-down'); it.ts = 0; it.td = 0;
    if (reduced()) { it.s = it.d = it.v = it.dv = 0; clear(it); live.delete(it); return; }
    it.w = 26; it.z = 0.2; // jelly: underdamped, overshoots into a tall stretch then settles
    if (it.s < 0.5) it.s = 0.5; wake();
  }
  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('pointermove', onMove, { capture: true, passive: true });
  doc.addEventListener('pointerup', onUp, true);
  doc.addEventListener('pointercancel', onUp, true);

  // ---------- panels settle, fills slosh ----------
  function settle(el, strength = 1, delay = 300) {
    if (!el || reduced()) return;
    setTimeout(() => {
      if (!el.isConnected) return; const { w, h } = geo(el); if (w < 20) return;
      const it = itemFor(el); it.A = 0.035 * strength; it.W = 0.02 * strength; it.s = 0.9; it.v = 0; it.ts = 0; it.w = 19; it.z = 0.26; it.tilt = 0; it.d = it.td = it.dv = 0; live.add(it); wake();
    }, delay);
  }
  const sheet = doc.getElementById('sheet'); let wasHidden = sheet ? sheet.hidden : true, lastScreen = sheet ? sheet.dataset.screen : '';
  const mo = new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.target === sheet) {
        const hid = sheet.hidden, scr = sheet.dataset.screen;
        if (!hid && (wasHidden || scr !== lastScreen)) settle(sheet, 1, 420);
        wasHidden = hid; lastScreen = scr;
      } else if (r.type === 'childList') {
        r.addedNodes.forEach((n) => { if (n.nodeType !== 1) return;
          if (n.classList.contains('ov')) settle(n.querySelector('.ov-card'), 1.3, 520);
          else if (n.classList.contains('banner')) settle(n, 1.4, 380);
          else if (n.classList.contains('tb')) settle(n, 1.2, 380); });
      }
    }
  });
  if (sheet) mo.observe(sheet, { attributes: true, attributeFilter: ['hidden', 'class'] });
  mo.observe(doc.body, { childList: true, subtree: true });

  const FILL = '.bar i, .xpb i, #track .qp i, .gp .cap u'; const timers = new Map(), lastAt = new WeakMap();
  const fillMo = new MutationObserver((recs) => {
    if (reduced()) return; const t = performance.now();
    for (const r of recs) { const el = r.target; if (!el.matches || !el.matches(FILL)) continue;
      if (t - (lastAt.get(el) || 0) < 700) continue; lastAt.set(el, t);
      el.classList.add('clay-slosh'); clearTimeout(timers.get(el)); timers.set(el, setTimeout(() => { el.classList.remove('clay-slosh'); timers.delete(el); }, 1000)); }
  });
  for (const s of ['#sheet', '#card', '#track', '#left', '#strip']) { const n = doc.querySelector(s); if (n) fillMo.observe(n, { attributes: true, attributeFilter: ['style'], subtree: true }); }

  // ---------- cleanup ----------
  return function dispose() {
    doc.removeEventListener('pointerdown', onDown, true); doc.removeEventListener('pointermove', onMove, true);
    doc.removeEventListener('pointerup', onUp, true); doc.removeEventListener('pointercancel', onUp, true);
    mo.disconnect(); fillMo.disconnect(); if (raf) cancelAnimationFrame(raf); raf = 0;
    for (const it of live) clear(it); live.clear(); down.clear();
    for (const t of timers.values()) clearTimeout(t); timers.clear();
    doc.querySelectorAll('.clay-slosh').forEach((e) => e.classList.remove('clay-slosh'));
    doc.querySelectorAll('.clay-down').forEach((e) => e.classList.remove('clay-down'));
    for (const k of ['--clay-grain', '--clay-wave', '--clay-wave2']) root.style.removeProperty(k);
    delete root.dataset.clayJs;
  };
}

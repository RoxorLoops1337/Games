// Keycap 3D: tilt toward the pointer, physical press along Z (CSS does the travel), optional permission-free device-orientation parallax,
// and a runtime-generated matte ABS grain (canvas -> data URI in --kc-noise). Only the active key is written, once per animation frame.
export default function init({ root }) {
  const SEL = '.b,.rb,.pill,.gp,#card,.mini-b';
  const MAXHOVER = 6, MAXDOWN = 10;
  let act = null, down = false, rect = null, nx = 0, ny = 0, raf = 0, dirty = false;
  const off = [];
  const on = (t, ev, fn, o) => { try { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); } catch { /* ignore */ } };
  const lowfx = () => !!(document.body && document.body.classList.contains('lowfx'));
  const reduced = () => {
    if (root.dataset.reduce === '1') return true;
    try { return root.dataset.reduce !== '0' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  };
  const find = (t) => { const b = t && t.closest ? t.closest(SEL) : null; return b && !b.classList.contains('off') ? b : null; };
  const clamp = (v, a = -1, b = 1) => (v < a ? a : v > b ? b : v);

  // matte grain, generated once (48x48, soft luminance noise at very low alpha)
  let noiseSet = false;
  try {
    const c = document.createElement('canvas'); c.width = c.height = 48;
    const g = c.getContext('2d'), im = g.createImageData(48, 48);
    let s = 1337;
    for (let i = 0; i < im.data.length; i += 4) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const v = (s >>> 24) & 255, hi = v > 127;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = hi ? 255 : 40;
      im.data[i + 3] = hi ? (v - 127) * 0.06 : (127 - v) * 0.06;
    }
    g.putImageData(im, 0, 0);
    root.style.setProperty('--kc-noise', 'url(' + c.toDataURL('image/png') + ')'); noiseSet = true;
  } catch { /* the css has a fallback */ }

  function write() {
    raf = 0; if (!act || !dirty) return; dirty = false;
    const A = down ? MAXDOWN : MAXHOVER;
    // pointer on the right edge: right edge goes down (rotateY +); pointer near the bottom: bottom goes down (rotateX -)
    act.style.setProperty('--tx', (nx * A).toFixed(2) + 'deg');
    act.style.setProperty('--ty', (-ny * A).toFixed(2) + 'deg');
    act.style.setProperty('--gx', nx.toFixed(3)); act.style.setProperty('--gy', ny.toFixed(3));
  }
  function schedule() { dirty = true; if (!raf) raf = requestAnimationFrame(write); }
  function aim(e) {
    if (!act) return;
    if (!rect) rect = act.getBoundingClientRect();
    const w = rect.width || 1, h = rect.height || 1;
    nx = clamp(((e.clientX - rect.left) / w) * 2 - 1); ny = clamp(((e.clientY - rect.top) / h) * 2 - 1);
    schedule();
  }
  function release() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (act) {
      const b = act; b.classList.remove('kc-live', 'kc-down');
      for (const p of ['--tx', '--ty', '--gx', '--gy']) b.style.removeProperty(p);
      if (!b.getAttribute('style')) b.removeAttribute('style');
    }
    act = null; rect = null; down = false; dirty = false;
  }
  function enter(b) { release(); act = b; rect = b.getBoundingClientRect(); b.classList.add('kc-live'); }

  on(document, 'pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const b = find(e.target); if (!b) return;
    if (lowfx()) { b.classList.add('kc-down'); act = b; down = true; return; }
    if (act !== b) enter(b); down = true; rect = b.getBoundingClientRect();
    b.classList.add('kc-down');
    if (!reduced()) aim(e);
  }, true);
  on(document, 'pointermove', (e) => {
    if (lowfx() || reduced()) return;
    if (down) { if (act) aim(e); return; }
    if (e.pointerType !== 'mouse') return;
    const b = find(e.target);
    if (!b) { if (act) release(); return; }
    if (b !== act) enter(b);
    aim(e);
  }, true);
  const up = () => { if (act) release(); };
  on(document, 'pointerup', up, true); on(document, 'pointercancel', up, true);
  on(document, 'visibilitychange', up); on(window, 'blur', up);
  on(document, 'pointerout', (e) => { if (!down && e.relatedTarget === null && act) release(); }, true);
  // keyboard: Space and Enter press the key physically too
  on(document, 'keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { const b = find(document.activeElement); if (b) b.classList.add('kc-down'); } }, true);
  on(document, 'keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') document.querySelectorAll('.kc-down').forEach((b) => { if (b !== act) b.classList.remove('kc-down'); }); }, true);

  // gentle parallax of the light and shadow from device orientation. Permission-free only: iOS (requestPermission exists) is skipped.
  let oriOn = false, ox = 0, oy = 0, lx = 0, ly = 0, oraf = 0;
  try {
    const DO = window.DeviceOrientationEvent;
    if (DO && typeof DO.requestPermission !== 'function' && matchMedia('(pointer: coarse)').matches) {
      const flush = () => {
        oraf = 0; if (lowfx() || reduced()) return;
        lx += (ox - lx) * 0.35; ly += (oy - ly) * 0.35;
        root.style.setProperty('--kc-ox', lx.toFixed(2)); root.style.setProperty('--kc-oy', ly.toFixed(2));
      };
      on(window, 'deviceorientation', (e) => {
        if (e.gamma == null || e.beta == null) return;
        const nxo = clamp(e.gamma / 35), nyo = clamp((e.beta - 40) / 35);
        if (Math.abs(nxo - ox) < 0.06 && Math.abs(nyo - oy) < 0.06) return;
        ox = nxo; oy = nyo; if (!oraf) oraf = setTimeout(flush, 66);
      });
      oriOn = true;
    }
  } catch { /* ignore */ }

  return function dispose() {
    for (const f of off) { try { f(); } catch { /* ignore */ } }
    off.length = 0; release();
    document.querySelectorAll('.kc-live,.kc-down').forEach((b) => b.classList.remove('kc-live', 'kc-down'));
    if (oraf) clearTimeout(oraf);
    if (noiseSet) root.style.removeProperty('--kc-noise');
    if (oriOn) { root.style.removeProperty('--kc-ox'); root.style.removeProperty('--kc-oy'); }
  };
}

// Dreamy Aurora runtime: a tileable noise grain texture (--au-grain, about 3 percent opacity) and a pointer-following specular glow
// (--mx / --my on the pressed or hovered button, updated with requestAnimationFrame only while a pointer is down or hovering).
const SEL = '.b,.rb,.mini-b,.pill,.gp,#card,.chipb,.shutter,.seg button,button.tab';

export default function init({ root }) {
  const doc = root.ownerDocument || document;
  let raf = 0, cur = null, pressed = false, dirty = false, px = 0, py = 0;
  const cleanups = [];

  // 1) grain: 128px random alpha noise, average alpha about 3 percent, tiled by the css as a top background layer
  try {
    const n = 128, c = doc.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d');
    if (g) {
      const img = g.createImageData(n, n), d = img.data;
      let seed = 1337;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < d.length; i += 4) {
        const v = rnd() < 0.7 ? 255 : 110;         // mostly light specks, a few soft dark ones
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = Math.floor(rnd() * 16);          // 0..15 of 255, mean about 3 percent (mostly light)
      }
      g.putImageData(img, 0, 0);
      root.style.setProperty('--au-grain', 'url("' + c.toDataURL('image/png') + '")');
      cleanups.push(() => root.style.removeProperty('--au-grain'));
    }
  } catch { /* the css has a fallback */ }

  // 2) pointer specular
  const apply = () => {
    raf = 0;
    if (!cur || !dirty) return;
    dirty = false;
    try {
      const r = cur.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const x = Math.max(-10, Math.min(110, ((px - r.left) / r.width) * 100));
        const y = Math.max(-30, Math.min(130, ((py - r.top) / r.height) * 100));
        cur.style.setProperty('--mx', x.toFixed(1) + '%');
        cur.style.setProperty('--my', y.toFixed(1) + '%');
      }
    } catch { /* ignore */ }
  };
  const schedule = () => { dirty = true; if (!raf) raf = requestAnimationFrame(apply); };
  const release = () => {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (cur) { cur.style.removeProperty('--mx'); cur.style.removeProperty('--my'); }
    cur = null; pressed = false; dirty = false;
  };
  const target = (e) => (e.target && e.target.closest ? e.target.closest(SEL) : null);
  const onOver = (e) => {
    const t = target(e);
    if (!t || t === cur) return;
    if (cur) release();
    cur = t; px = e.clientX; py = e.clientY; schedule();
  };
  const onDown = (e) => {
    const t = target(e);
    if (!t) return;
    if (t !== cur) { if (cur) release(); cur = t; }
    pressed = true; px = e.clientX; py = e.clientY; schedule();
  };
  const onMove = (e) => { if (!cur) return; px = e.clientX; py = e.clientY; schedule(); };
  const onUp = (e) => {
    pressed = false;
    if (e.pointerType && e.pointerType !== 'mouse') release();   // a finger has no hover
  };
  const onOut = (e) => {
    if (!cur || pressed) return;
    const to = e.relatedTarget;
    if (to && cur.contains(to)) return;
    release();
  };
  const opts = { capture: true, passive: true };
  for (const [ev, fn] of [['pointerover', onOver], ['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onUp], ['pointerout', onOut]]) {
    doc.addEventListener(ev, fn, opts);
    cleanups.push(() => doc.removeEventListener(ev, fn, opts));
  }
  cleanups.push(release);

  // 3) pause the drifting meshes while the tab is hidden
  const onVis = () => { if (doc.hidden) root.setAttribute('data-au-paused', ''); else root.removeAttribute('data-au-paused'); };
  doc.addEventListener('visibilitychange', onVis);
  cleanups.push(() => { doc.removeEventListener('visibilitychange', onVis); root.removeAttribute('data-au-paused'); });
  onVis();

  return function dispose() { for (const f of cleanups.splice(0).reverse()) { try { f(); } catch { /* ignore */ } } };
}

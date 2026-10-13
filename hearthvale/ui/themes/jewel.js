// Hearthvale interface style "jewel" (Glass Jewel): SVG lighting filters that cut buttons like gemstones.
// Injects a hidden <svg> with four filters that share one recipe (blurred alpha as height map -> diffuse shade, specular pinpoint,
// turbulence caustics + refraction, morphology rim) and differ only in light position and strength:
//   #hv-gem        resting gems, light high on the upper left (follows the device tilt on phones)
//   #hv-gem-press  pressed gems: dimmer body, broad flare
//   #hv-gem-live / #hv-gem-livep  the same for the ONE button under the pointer, whose light sits right under the finger or cursor
// The filters are applied by jewel.css to the ::before layer of small buttons only (never to panels). Everything is cleaned up in dispose.
const NS = 'http://www.w3.org/2000/svg';
const BTN = '.b,.rb,.pill,.gp,#card,.mini-b';

function gemFilter(id, o) {
  const { lx, ly, lz, kd, ks, ex, ss, caus, dark, az = 235, el = 58, k1 = 1.3 } = o;
  const light = (k) => `<fePointLight data-k="${k}" x="${lx}" y="${ly}" z="${lz}"/>`;
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.045 0.07" numOctaves="2" seed="11" result="tn"/>
  <feDisplacementMap in="SourceGraphic" in2="tn" scale="5" xChannelSelector="R" yChannelSelector="G" result="refr"/>
  <feComposite in="refr" in2="SourceAlpha" operator="in" result="body"/>
  <feGaussianBlur in="SourceAlpha" stdDeviation="2.3" result="hm"/>
  <feDiffuseLighting in="hm" surfaceScale="${ss}" diffuseConstant="${kd}" lighting-color="#ffffff" result="dif"><feDistantLight data-k="dd" azimuth="${az}" elevation="${el}"/></feDiffuseLighting>
  <feComposite in="body" in2="dif" operator="arithmetic" k1="${k1}" k2="0" k3="0" k4="0" result="lit"/>
  <feColorMatrix in="tn" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  9 0 0 0 -4.3" result="c1"/>
  <feColorMatrix in="tn" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -9 0 0 0 4.9" result="c2"/>
  <feComposite in="c1" in2="c2" operator="in" result="ridge"/>
  <feMorphology in="SourceAlpha" operator="erode" radius="1.4" result="er"/>
  <feComposite in="ridge" in2="er" operator="in" result="ridgeIn"/>
  <feColorMatrix in="ridgeIn" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${caus} 0" result="cau"/>
  <feComposite in="SourceAlpha" in2="er" operator="out" result="edge"/>
  <feFlood flood-color="#06021f" flood-opacity="${dark}" result="fl"/>
  <feComposite in="fl" in2="edge" operator="in" result="rim"/>
  <feSpecularLighting in="hm" surfaceScale="${ss + 1}" specularConstant="${ks}" specularExponent="${ex}" lighting-color="#ffffff" result="spc">${light('s')}</feSpecularLighting>
  <feComposite in="spc" in2="SourceAlpha" operator="in" result="spcIn"/>
  <feMerge><feMergeNode in="lit"/><feMergeNode in="cau"/><feMergeNode in="rim"/><feMergeNode in="spcIn"/></feMerge>
</filter>`;
}

// Faceted crystal tile (cached as a data URI in --jl-tile): random translucent triangles plus fine sparkle, drawn once on a small canvas.
function makeTile() {
  const S = 144, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); if (!g) return '';
  let s = 1337; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 34; i++) {
    const x = r() * S, y = r() * S, a = 18 + r() * 40, t = r() * 6.28;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(t) * a, y + Math.sin(t) * a); g.lineTo(x + Math.cos(t + 1.1 + r()) * a * 0.8, y + Math.sin(t + 1.1 + r()) * a * 0.8); g.closePath();
    g.fillStyle = r() < 0.55 ? `rgba(255,255,255,${0.015 + r() * 0.03})` : `rgba(10,0,60,${0.04 + r() * 0.07})`; g.fill();
    if (r() < 0.35) { g.strokeStyle = `rgba(230,220,255,${0.05 + r() * 0.08})`; g.lineWidth = 1; g.stroke(); }
  }
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,255,255,${0.12 + r() * 0.3})`; g.fillRect((r() * S) | 0, (r() * S) | 0, 1, 1); }
  return `url("${c.toDataURL('image/png')}")`;
}

export default function init({ root }) {
  const offs = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
  let host = null, tileSet = false, raf = 0, cur = null, down = false, px = 0, py = 0, tiltRaf = 0, tiltT = 0, releaseT = 0;
  try {
    host = document.createElement('div'); host.id = 'hv-jewel-defs'; host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    const base = { kd: 1.0, ks: 1.35, ex: 34, ss: 3.4, caus: 0.34, dark: 0.34 };
    host.innerHTML = `<svg xmlns="${NS}" width="0" height="0" focusable="false">
      ${gemFilter('hv-gem', { ...base, lx: 15, ly: 9, lz: 20, ks: 3.2, ex: 70 })}
      ${gemFilter('hv-gem-press', { ...base, lx: 22, ly: 6, lz: 14, k1: 0.7, ks: 1.5, ex: 16, caus: 0.18, dark: 0.55 })}
      ${gemFilter('hv-gem-live', { ...base, lx: 20, ly: 10, lz: 30, ks: 1.7, ex: 44 })}
      ${gemFilter('hv-gem-livep', { ...base, lx: 20, ly: 10, lz: 12, k1: 0.7, ks: 1.8, ex: 15, caus: 0.18, dark: 0.55 })}
    </svg>`;
    document.body.appendChild(host);
    const q = (id) => [...host.querySelectorAll(`#${id} fePointLight`)];
    const dd = (id) => host.querySelector(`#${id} feDistantLight`);
    const liveDiff = [dd('hv-gem-live'), dd('hv-gem-livep')];
    const still = [...q('hv-gem'), ...q('hv-gem-press')], live = [...q('hv-gem-live'), ...q('hv-gem-livep')];
    const tile = makeTile(); if (tile) { root.style.setProperty('--jl-tile', tile); tileSet = true; }
    root.classList.add('jl-on');

    const lowfx = () => document.body.classList.contains('lowfx');
    const setLive = (b) => {
      if (cur === b) return;
      if (cur) { cur.classList.remove('jl-live'); cur.classList.remove('jl-down'); }
      cur = b; if (cur) cur.classList.add('jl-live');
    };
    const place = () => {
      raf = 0; if (!cur || !cur.isConnected) return;
      const r = cur.getBoundingClientRect(), x = px - r.left - cur.clientLeft, y = py - r.top - cur.clientTop;
      for (const l of live) { l.setAttribute('x', x.toFixed(1)); l.setAttribute('y', y.toFixed(1)); }
      const az = Math.atan2(y - r.height / 2, x - r.width / 2) * 180 / Math.PI;
      for (const d of liveDiff) d.setAttribute('azimuth', az.toFixed(0));
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(place); };
    const pick = (t) => (t && t.closest ? t.closest(BTN) : null);

    // the light follows the pointer only while it is over a button or pressed on it
    on(document, 'pointerover', (e) => { if (lowfx()) return; const b = pick(e.target); if (!b || b.classList.contains('off')) return; clearTimeout(releaseT); setLive(b); px = e.clientX; py = e.clientY; kick(); }, { passive: true, capture: true });
    on(document, 'pointermove', (e) => { if (!cur) return; px = e.clientX; py = e.clientY; kick(); }, { passive: true, capture: true });
    on(document, 'pointerdown', (e) => {
      if (lowfx()) return; const b = pick(e.target); if (!b) return;
      clearTimeout(releaseT); down = true; setLive(b); px = e.clientX; py = e.clientY; b.classList.add('jl-down'); place();
    }, { passive: true, capture: true });
    const release = (e) => {
      down = false; if (!cur) return; const b = cur; b.classList.remove('jl-down');
      if (e.pointerType && e.pointerType !== 'mouse') releaseT = setTimeout(() => { if (!down) setLive(null); }, 260);
    };
    on(document, 'pointerup', release, { passive: true, capture: true });
    on(document, 'pointercancel', release, { passive: true, capture: true });
    on(document, 'pointerout', (e) => { if (!cur || down) return; if (e.relatedTarget && cur.contains(e.relatedTarget)) return; if (pick(e.relatedTarget) === cur) return; setLive(null); }, { passive: true, capture: true });

    // device tilt moves the resting light (throttled; the update re-rasterises the resting gems, so keep it rare)
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
    if (coarse && 'DeviceOrientationEvent' in window) {
      let lx = 15, ly = 9, tx = 15, ty = 9;
      const tilt = () => {
        tiltRaf = 0; if (lowfx() || document.hidden) return;
        if (Math.abs(tx - lx) < 3 && Math.abs(ty - ly) < 3) return;
        lx = tx; ly = ty; for (const l of still) { l.setAttribute('x', lx.toFixed(0)); l.setAttribute('y', ly.toFixed(0)); }
      };
      on(window, 'deviceorientation', (e) => {
        if (e.gamma == null || e.beta == null) return; const now = performance.now(); if (now - tiltT < 160) return; tiltT = now;
        tx = 15 + Math.max(-1, Math.min(1, e.gamma / 40)) * 24; ty = 9 + Math.max(-1, Math.min(1, (e.beta - 45) / 40)) * 12;
        if (!tiltRaf) tiltRaf = requestAnimationFrame(tilt);
      }, { passive: true });
    }
  } catch (err) { try { console.warn('[jewel] init', err); } catch { /* ignore */ } }

  return function dispose() {
    try {
      for (const f of offs) f(); offs.length = 0;
      if (raf) cancelAnimationFrame(raf); if (tiltRaf) cancelAnimationFrame(tiltRaf); clearTimeout(releaseT);
      if (cur) { cur.classList.remove('jl-live'); cur.classList.remove('jl-down'); }
      document.querySelectorAll('.jl-live,.jl-down').forEach((n) => n.classList.remove('jl-live', 'jl-down'));
      root.classList.remove('jl-on'); if (tileSet) root.style.removeProperty('--jl-tile');
      if (host) host.remove();
    } catch { /* ignore */ }
  };
}

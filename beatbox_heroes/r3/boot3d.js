// BEATBOX HEROES r3 -- boot3d.js (PLAT). R3.boot(): decide the graphics mode, probe the device, download the Park3D core, create the host, warm the title world (PORT_PLAN 2.10).
// Runs by itself when the script loads (set window.BBH_R3_NOBOOT = true before it to skip). Meanwhile the 2D 'boot' scene runs as always and its first E.go is held by R3.hold until the verdict.
// Any failure (no WebGL2, small textures, software renderer, chunk error or timeout, renderer throw) leaves the game exactly as the 2D build, persists bbh:r3.fail and shows nothing.
//   Mode:     ?r=3d | ?r=2d | ?r=auto  >  localStorage bbh:r3.mode  >  'auto'.  auto = 2D until R3.AUTO_3D flips (M4).  A stored fail blocks auto, never an explicit 3d.
//   Quality:  ?q=low|med|high (not persisted) > bbh:r3.q > R3Quality.pick(device) + a 3 s frame probe once a 3D scene runs.   ?preserve=1 keeps the GL drawing buffer (tests, screenshots).
//   Core:     http(s): import(window.BBH_R3) = r3/entry.js (ESM, lazy world chunks).  file://: ES modules cannot load there, so the IIFE bundle window.BBH_R3_IIFE (all worlds inline) is used.
(function (root) {
  'use strict';
  const BBH = root.BBH, R3 = BBH && BBH.R3; if (!R3 || !R3._) return;
  const E = BBH.Eng || BBH.E, X = R3._, S = X.S, Q = BBH.R3Quality || { ORDER: ['low', 'med', 'high'], pick: () => ({ q: 'med' }), probe: () => ({ push() {} }) };
  const $ = (id) => document.getElementById(id);
  const IMPORT_MS = 12000, WORLD_MS = 10000;
  const SOFT = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;
  let qs; try { qs = new URLSearchParams(root.location.search); } catch (e) { qs = new URLSearchParams(''); }

  function decide(st) {
    const p = String(qs.get('r') || '').toLowerCase();
    if (p === '3d' || p === '3') return { mode: '3d', src: 'url' }; if (p === '2d' || p === '2') return { mode: '2d', src: 'url' }; if (p === 'auto') return { mode: 'auto', src: 'url' };
    if (st.mode === '3d' || st.mode === '2d' || st.mode === 'auto') return { mode: st.mode, src: 'storage' };
    return { mode: 'auto', src: 'default' };
  }
  function caps() {
    const c = { ok: false, reason: 'no-webgl2', memory: navigator.deviceMemory || 0, cores: navigator.hardwareConcurrency || 0, dpr: root.devicePixelRatio || 1, mobile: /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ''), gpu: '', soft: false, maxTex: 0 };
    let gl = null; try { const cv = document.createElement('canvas'); gl = cv.getContext('webgl2'); } catch (e) { gl = null; }
    if (!gl) return c;
    try {
      c.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0; const d = gl.getExtension('WEBGL_debug_renderer_info'); c.gpu = String((d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '');
      c.soft = SOFT.test(c.gpu); c.ok = c.maxTex >= 4096; c.reason = c.ok ? '' : 'small-texture';
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();   // release the probe context right away
    } catch (e) { c.ok = false; c.reason = 'probe-error'; }
    return c;
  }
  const timeout = (p, ms, what) => new Promise((res, rej) => { const t = setTimeout(() => { const e = new Error(what + ' timed out after ' + ms + ' ms'); e.timeout = true; rej(e); }, ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });
  function loadIIFE() {
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = root.BBH_R3_IIFE || 'park3d.bundle.js';
      s.onload = () => (root.Park3D && root.Park3D.createHost ? res(root.Park3D) : rej(new Error('Park3D bundle has no createHost')));
      s.onerror = () => rej(new Error('Park3D bundle failed to load')); document.head.appendChild(s);
    });
  }
  function loadCore() { return root.location.protocol === 'file:' ? loadIIFE() : import(new URL(root.BBH_R3 || 'r3/entry.js', document.baseURI).href); }

  async function run() {
    const t0 = performance.now(), st = X.read(), d = decide(st); S.mode = d.mode; S.modeSrc = d.src;
    const off = (why, detail) => { S.status = 'off'; S.reason = why; S.detail = detail || ''; return R3; };
    if (d.mode === '2d') return off('mode');
    if (d.mode === 'auto' && !R3.auto3d()) return off('auto-classic');
    const forced = d.mode === '3d';
    if (!forced && st.fail) return off('previous-failure', st.fail.reason);
    S.status = 'booting'; S.reason = ''; X.splash('full', 'LOADING 3D');
    const cap = caps();
    if (!cap.ok) { X.fail(cap.reason, cap.gpu); return R3; }
    if (cap.soft && !forced) { X.fail('software', cap.gpu); return R3; }
    // quality tier: ?q= (session only) > persisted > auto pick (+ probe)
    let q = String(qs.get('q') || '').toLowerCase(), needProbe = false; S.qForced = Q.ORDER.indexOf(q) >= 0;
    if (!S.qForced) { q = st.q; if (Q.ORDER.indexOf(q) < 0) { q = Q.pick(cap).q; needProbe = true; } }
    S.quality = q;
    try { if (BBH.R3UI && BBH.R3UI.install) BBH.R3UI.install(); } catch (e) { console.error('[r3] UI kit install failed', e); }
    let core; try { core = await timeout(loadCore(), IMPORT_MS, 'the 3D core download'); } catch (e) { X.fail(e.timeout ? 'timeout' : 'chunk', e && e.message); return R3; }
    if (S.status !== 'booting') return R3;
    R3.lib = core;                                                     // the core module's other exports (playTape: tape.js)
    let host; try { host = core.createHost($('gl'), { embedded: true, quality: q, preserve: qs.get('preserve') === '1', onLost: onLost }); } catch (e) { X.fail('renderer', e && e.message); return R3; }
    S.host = host; R3.resize(); X.splash('full', 'BUILDING');
    try { const w = await timeout(host.load('title', { time: 'night' }), WORLD_MS, 'the title world'); if (!w) throw new Error('title world was superseded'); } catch (e) { X.fail(e.timeout ? 'timeout' : 'chunk', e && e.message); return R3; }
    if (S.status !== 'booting') return R3;
    X.ready(host, performance.now() - t0);
    if (needProbe) S.probe = Q.probe(q, (next) => { S.probe = null; if (next) R3.setQuality(next); else X.write({ q: S.quality }); });
    return R3;
  }
  function onLost(info) {
    if (info.phase === 'lost') X.hiccup(true); else if (info.phase === 'restored') X.hiccup(false); else if (info.phase === 'demote') R3.demote('lost', info.reason);
  }
  R3.boot = function () { if (!S.bootP) S.bootP = run().catch((e) => { console.error('[r3] boot failed', e); X.fail('boot', e && e.message); return R3; }); return S.bootP; };
  if (!root.BBH_R3_NOBOOT) R3.boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);

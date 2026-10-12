// Cinematic title scene: the real hub at golden hour, a slow dolly driven here (hub.orbit is written every frame while
// game.scene === 'title'), carved-gold logo, Continue / New Game / Settings. Owned by the onboarding team. No em dashes.
//   const title = createTitle(game);  const choice = await title.show({ hasSave });  // 'continue' | 'new'
//   title.drive(dt, t) each frame while scene === 'title' (game.frame does it);  await title.hide() when leaving.
import * as U from './ui_kit.js';

const PREF_KEY = 'ludus_maximus_3d_prefs'; // same key as screens/more.js, never rename
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const PERIOD = 56; // seconds for one full out-and-back of the dolly
const HOUR = 17.7; // golden hour

export function createTitle(game) {
  const { hub, camera, audio } = game;
  let root, resolve, active = false, t0 = 0, fov0 = 42, clock = 0;

  const readPrefs = () => { try { return Object.assign({ master: 0.9, music: 0.7, sfx: 0.9, muted: false, rm: false, big: false }, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { return { master: 0.9, music: 0.7, sfx: 0.9, muted: false, rm: false, big: false }; } };
  const writePrefs = (p) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* storage blocked */ } };

  function build(hasSave) {
    const el = U.h('div', 'lx-ttl');
    const bars = [U.h('i', 'lx-ttl-bar t'), U.h('i', 'lx-ttl-bar b')];
    const embers = U.h('div', 'lx-ttl-embers');
    for (let i = 0; i < 22; i++) { const e = U.h('i'); e.style.cssText = `left:${(i * 37 + 11) % 100}%;--d:${7 + (i * 13) % 9}s;--s:${-((i * 29) % 14)}s;--x:${((i * 17) % 40) - 20}px;--z:${1.5 + (i % 4)}px`; embers.append(e); }
    const logo = U.h('div', 'lx-ttl-logo');
    const word = (txt) => { const w = U.h('div', 'lx-ttl-word', txt); w.dataset.t = txt; return w; };
    const rule = U.h('div', 'lx-ttl-rule', [U.h('i'), U.laurel('lx-ttl-laurel'), U.h('i')]);
    logo.append(U.h('div', 'lx-ttl-kicker', 'Rise from the sand'), word('LUDUS'), word('MAXIMUS'), rule, U.h('div', 'lx-ttl-sub', 'Gladiator School'));
    const menu = U.h('div', 'lx-ttl-menu');
    const mk = (label, icon, variant, v) => U.button({ label, icon, variant, block: true, onClick: () => pick(v) });
    if (hasSave) menu.append(mk('Continue', 'arena', 'gold', 'continue'), mk('New Game', 'ludus', 'bronze', 'new'));
    else menu.append(mk('Begin your ludus', 'ludus', 'gold', 'new'));
    menu.append(mk('Settings', 'gear', 'ghost', 'settings'));
    const foot = U.h('div', 'lx-ttl-foot', 'Drag to look around  ·  Tap Settings for sound');
    el.append(U.h('i', 'lx-ttl-glow'), U.h('i', 'lx-ttl-vig'), embers, ...bars, logo, menu, foot);
    return el;
  }

  function pick(v) {
    if (v === 'settings') { audio.sfx('uiTap'); settings(); return; }
    if (!active) return; audio.sfx('uiConfirm');
    const r = resolve; resolve = null; r && r(v);
  }

  function settings() {
    const p = readPrefs(), body = U.h('div', 'lx-ttl-set');
    const slider = (label, key, apply, sfx) => {
      const i = U.h('input'); i.type = 'range'; i.min = 0; i.max = 100; i.value = Math.round(p[key] * 100); i.setAttribute('aria-label', label);
      i.addEventListener('input', () => { p[key] = i.value / 100; apply(p[key]); }); i.addEventListener('change', () => { writePrefs(p); if (sfx) audio.sfx(sfx); });
      return U.h('label', 'lx-ttl-row', [U.h('span', '', label), i]);
    };
    const toggle = (label, key, apply) => {
      const b = U.h('button', 'lx-ttl-tog'); b.type = 'button'; const paint = () => { b.setAttribute('aria-pressed', !!p[key]); b.textContent = p[key] ? 'On' : 'Off'; }; paint();
      b.addEventListener('click', () => { p[key] = !p[key]; paint(); writePrefs(p); apply(); audio.sfx('uiTap'); });
      return U.h('div', 'lx-ttl-row', [U.h('span', '', label), b]);
    };
    const apply = () => { audio.setMaster(p.muted ? 0 : p.master); audio.setMusic(p.music); audio.setSfx(p.sfx); document.body.classList.toggle('lx-reduce-motion', !!p.rm); document.body.classList.toggle('lx-large-text', !!p.big); };
    body.append(
      slider('Master volume', 'master', (v) => audio.setMaster(p.muted ? 0 : v), 'uiTap'), slider('Music', 'music', (v) => audio.setMusic(v)), slider('Effects and crowd', 'sfx', (v) => audio.setSfx(v), 'swordHit'),
      toggle('Mute everything', 'muted', apply), toggle('Reduced motion', 'rm', apply), toggle('Large text', 'big', apply));
    const m = U.modal({ title: 'Settings', body, actions: [U.button({ label: 'Done', variant: 'gold', block: true, onClick: () => m.close() })] });
  }

  /** camera path: out-and-back dolly along the terraces, low and warm, never touching the orbit limits */
  function drive(dt, t) {
    clock += dt;
    const o = hub.orbit; if (!o) return;
    const u = ease(0.5 - 0.5 * Math.cos((clock / PERIOD) * Math.PI * 2)), k = ease(clamp(clock / 2.5)); // k: gentle start
    const asp = camera.aspect, port = asp < 0.95, wide = clamp((asp - 0.45) / 1.4);
    const dist = lerp(port ? 84 : 66, port ? 62 : 46, u), tz = lerp(port ? 4 : 8, -4, u);
    o.anim = null; o.follow = null; o.vAz = o.vPitch = o.vZoom = 0; o.vPan.set(0, 0, 0); o.idleT = 0;
    o.az = Math.PI + lerp(1.05, 0.38, u) * (port ? 0.8 : 1) + (1 - k) * 0.25;
    o.pitch = lerp(0.3, 0.42, u) + (port ? 0.1 : 0) - (1 - k) * 0.06;
    o.dist = dist * (1 + (1 - wide) * 0.08);
    o.target.set(lerp(port ? 6 : 9, -2, u), lerp(2.2, 5.5, u), tz);
  }

  return {
    get active() { return active; },
    drive,
    show({ hasSave }) {
      if (active && root) return new Promise((res) => { resolve = res; }); // re-arm after a cancelled dialog
      active = true; clock = 0; t0 = performance.now(); fov0 = camera.fov;
      camera.fov = 32; camera.updateProjectionMatrix();
      try { hub.setHour(HOUR); hub.setWeather && hub.setWeather('clear'); } catch (e) { /* hub without hooks */ }
      try { audio.music.setMode('ludus', { fade: 2.5 }); audio.music.setIntensity && audio.music.setIntensity(0.55); } catch (e) { /* audio locked */ }
      if (root) root.remove();
      root = build(hasSave); game.ui.append(root);
      requestAnimationFrame(() => root.classList.add('on'));
      setTimeout(() => { const b = root && root.querySelector('.lx-btn-gold'); b && b.focus && b.focus({ preventScroll: true }); }, 900);
      return new Promise((res) => { resolve = res; });
    },
    /** fade to black, restore camera and sky, drop the overlay. Resolves when the screen is dark so the caller can swap scenes. */
    async hide() {
      if (!root) return; const r = root;
      const shade = U.h('div', 'lx-ttl-shade'); game.ui.append(shade); void shade.offsetWidth; shade.classList.add('on');
      await new Promise((ok) => setTimeout(ok, U.reduced() ? 30 : 520));
      active = false; r.remove(); root = null; camera.fov = fov0; camera.updateProjectionMatrix();
      try { hub.setHour(null); } catch (e) { /* ignore */ }
      try { audio.music.setIntensity && audio.music.setIntensity(0.15); } catch (e) { /* ignore */ }
      return () => { shade.classList.remove('on'); setTimeout(() => shade.remove(), U.reduced() ? 30 : 800); };
    },
  };
}

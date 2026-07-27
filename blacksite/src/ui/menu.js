// Main menu, pause menu, death screen and settings.
//
// Every screen is built once at create time and then shown or hidden. Rebuilding
// innerHTML on each `show()` is the usual shortcut and it costs you three things
// that matter: the focus ring lands nowhere, every listener has to be re-bound,
// and any control mid-drag dies under the player's cursor. Build once, toggle a
// class, keep the DOM identity stable.
//
// The visual language is already set by index.html — amber on near-black, wide
// letter-spacing, hairline rules, uppercase labels. Nothing here invents a new
// one; it extends that with the few primitives the settings panel needs.

import { clamp } from '../core/state.js';
import { DEFAULT_BINDS } from '../core/input.js';
import { injectCSS, el, txt, cls, reducedMotion, play } from './util.js';

// Namespaced, versioned, and not a key any other game in this repo uses. The
// version suffix is what lets a future settings change land without reading a
// stale shape back out of a player's browser.
const STORE_KEY = 'blacksite_settings_v1';

// Only these travel to storage. Persisting the whole settings object would
// happily write back a field some future module put there at runtime.
const PERSIST = [
  'quality', 'fov', 'sens', 'adsSensMul', 'invertY', 'motionBlur', 'filmGrain',
  'chromatic', 'volumetrics', 'shake', 'masterVol', 'dmgNumbers',
];

const QUALITY_NAMES = ['Potato', 'Low', 'High', 'Ultra'];

export function createMenu(G, root, cb) {
  const doc = root.ownerDocument || document;
  const win = doc.defaultView || window;
  const reduce = reducedMotion(win);
  injectCSS(doc, 'bs-menu-css', CSS);

  const host = root.querySelector('#menu');
  if (!host) return { show() {}, hide() {} };
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');

  // Captured before storage is applied, so RESET has somewhere true to go back
  // to: whatever core/state.js decided the defaults are.
  const DEFAULTS = Object.assign({ dmgNumbers: true }, G.settings);
  if (G.settings.dmgNumbers === undefined) G.settings.dmgNumbers = true;

  const syncs = [];      // called to pull every control back in line with G.settings
  const screens = {};
  let current = null;    // the screen on show
  let home = 'main';     // where BACK returns to from a sub-panel

  // ── screens ────────────────────────────────────────────────────────────────
  screens.main = panel('main', 'BLACKSITE', 'containment site 7 · unrestricted', (p) => {
    p.append(
      button('Deploy', () => { hide(); cb.start && cb.start(); }, true),
      button('Settings', () => go('settings')),
      button('Controls', () => go('controls')),
      hint('Mouse to look · click to capture the pointer · Esc releases it'),
    );
  });

  screens.pause = panel('pause', 'Paused', 'operation suspended', (p) => {
    p.append(
      button('Resume', () => { hide(); cb.resume && cb.resume(); }, true),
      button('Settings', () => go('settings')),
      button('Controls', () => go('controls')),
      button('Restart mission', () => { hide(); restart(); }),
      // Abandoning tears the run down before returning to the title, so the
      // scene behind the menu is a fresh level and not a paused corpse of one.
      button('Abandon', () => { if (cb.restart) cb.restart(); show('main'); }, false, 'ghost'),
    );
  });

  const deadStats = el(doc, 'div', 'stats');
  screens.dead = panel('dead', 'Killed in action', '', (p) => {
    p.append(deadStats,
      button('Redeploy', () => { hide(); restart(); }, true),
      button('Settings', () => go('settings')),
      button('Main menu', () => { if (cb.restart) cb.restart(); show('main'); }, false, 'ghost'));
  });
  screens.dead.classList.add('dead');

  screens.settings = panel('settings', 'Settings', 'saved to this browser', (p) => {
    p.classList.add('wide');
    p.append(
      section('Display'),
      rowSelect('Quality preset', QUALITY_NAMES, () => G.settings.quality, (v) => {
        G.settings.quality = v;
        if (cb.quality) cb.quality(v);
      }, 'Shadow resolution, ambient occlusion, bloom, volumetric steps and the particle budget all key off this.'),
      rowRange('Field of view', 65, 115, 1, () => G.settings.fov, (v) => { G.settings.fov = v; }, (v) => v + '°'),
      rowToggle('Motion blur', 'motionBlur'),
      rowToggle('Film grain', 'filmGrain'),
      rowToggle('Chromatic aberration', 'chromatic'),
      rowToggle('Volumetric light', 'volumetrics'),

      section('Aim'),
      rowRange('Sensitivity', 0.0004, 0.0070, 0.0001, () => G.settings.sens,
        (v) => { G.settings.sens = v; }, (v) => (v * 1000).toFixed(2)),
      rowRange('ADS multiplier', 0.30, 1.00, 0.01, () => G.settings.adsSensMul,
        (v) => { G.settings.adsSensMul = v; }, (v) => '×' + v.toFixed(2)),
      rowToggle('Invert vertical', 'invertY'),

      section('Feel'),
      rowRange('Camera shake', 0, 1.5, 0.05, () => G.settings.shake,
        (v) => { G.settings.shake = v; }, pct),
      rowToggle('Damage numbers', 'dmgNumbers'),

      section('Audio'),
      rowRange('Master volume', 0, 1, 0.05, () => G.settings.masterVol,
        (v) => { G.settings.masterVol = v; }, pct),

      button('Reset to defaults', () => {
        Object.assign(G.settings, DEFAULTS);
        if (cb.quality) cb.quality(G.settings.quality);
        for (const s of syncs) s();
        save();
      }, false, 'ghost'),
      button('Back', () => show(home), false, 'ghost'),
    );
  });

  screens.controls = panel('controls', 'Controls', 'keyboard, mouse and gamepad', (p) => {
    p.classList.add('wide');
    p.append(bindsTable(), button('Back', () => show(home), true, 'ghost'));
  });

  for (const k in screens) host.appendChild(screens[k]);

  // ── settings persistence ───────────────────────────────────────────────────
  loadSettings();
  for (const s of syncs) s();
  // The engine was built from whatever quality the state shipped with, so a
  // stored tier only takes effect if it is actually different.
  if (cb.quality && G.settings.quality !== DEFAULTS.quality) cb.quality(G.settings.quality);

  function loadSettings() {
    let raw = null;
    try { raw = win.localStorage.getItem(STORE_KEY); } catch { return; }   // private mode, or storage disabled
    if (!raw) return;
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    if (!data || typeof data !== 'object') return;
    // Validated on the way in, not on the way out: a hand-edited or
    // version-skewed blob must not be able to put the renderer in a state the
    // tier table has no entry for.
    for (const k of PERSIST) {
      const v = data[k];
      if (v === undefined) continue;
      if (typeof DEFAULTS[k] === 'boolean') G.settings[k] = !!v;
      else if (typeof DEFAULTS[k] === 'number' && typeof v === 'number' && Number.isFinite(v)) G.settings[k] = v;
    }
    G.settings.quality = clamp(Math.round(G.settings.quality), 0, 3);
    G.settings.fov = clamp(G.settings.fov, 65, 115);
    G.settings.sens = clamp(G.settings.sens, 0.0002, 0.02);
    G.settings.shake = clamp(G.settings.shake, 0, 2);
    G.settings.masterVol = clamp(G.settings.masterVol, 0, 1);
    G.settings.adsSensMul = clamp(G.settings.adsSensMul, 0.2, 1);
  }

  function save() {
    const out = {};
    for (const k of PERSIST) out[k] = G.settings[k];
    try { win.localStorage.setItem(STORE_KEY, JSON.stringify(out)); } catch { /* nothing to do about it */ }
  }

  // ── control factories ──────────────────────────────────────────────────────
  function panel(id, title, sub, fill) {
    const p = el(doc, 'div', 'panel');
    p.dataset.screen = id;
    p.setAttribute('aria-label', title);
    const h = el(doc, 'h2', null, title);
    p.append(h);
    if (sub) p.append(el(doc, 'p', 'sub', sub));
    fill(p);
    return p;
  }

  function button(label, onClick, primary, extra) {
    const b = el(doc, 'button', (primary ? 'primary' : '') + (extra ? ' ' + extra : ''), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function section(label) { return el(doc, 'div', 'sect', label); }
  function hint(text) { return el(doc, 'p', 'hint', text); }

  function row(label, help) {
    const r = el(doc, 'label', 'row');
    const l = el(doc, 'span', 'lab', label);
    if (help) l.title = help;
    r.append(l);
    return r;
  }

  function rowRange(label, min, max, step, get, set, fmt) {
    const r = row(label);
    const val = el(doc, 'span', 'val');
    const i = el(doc, 'input');
    i.type = 'range'; i.min = min; i.max = max; i.step = step;
    i.setAttribute('aria-label', label);
    const sync = () => {
      const v = get();
      i.value = String(v);
      // aria-valuetext, because "0.0022" read aloud is not a sensitivity.
      i.setAttribute('aria-valuetext', fmt(v));
      txt(val, fmt(v));
    };
    i.addEventListener('input', () => { set(parseFloat(i.value)); sync(); save(); });
    syncs.push(sync);
    r.append(val, i);
    return r;
  }

  function rowToggle(label, key, help) {
    const r = row(label, help);
    const wrap = el(doc, 'span', 'sw');
    const i = el(doc, 'input');
    i.type = 'checkbox';
    i.setAttribute('aria-label', label);
    const state = el(doc, 'span', 'swtxt');
    // The word is not decoration: a switch that says only "on" in amber and
    // "off" in grey is a switch nobody colour-blind can read at a glance.
    const sync = () => { i.checked = !!G.settings[key]; txt(state, i.checked ? 'On' : 'Off'); };
    i.addEventListener('change', () => { G.settings[key] = i.checked; sync(); save(); });
    syncs.push(sync);
    wrap.append(i, state);
    r.append(wrap);
    return r;
  }

  function rowSelect(label, names, get, set, help) {
    const r = row(label, help);
    const s = el(doc, 'select');
    s.setAttribute('aria-label', label);
    names.forEach((n, idx) => {
      const o = el(doc, 'option', null, n);
      o.value = String(idx);
      s.appendChild(o);
    });
    const sync = () => { s.value = String(get()); };
    s.addEventListener('change', () => { set(parseInt(s.value, 10)); sync(); save(); });
    syncs.push(sync);
    r.append(s);
    return r;
  }

  // Built from the real bind table rather than a hand-written list, so the
  // reference cannot drift away from what input.js actually does.
  function bindsTable() {
    const g = el(doc, 'div', 'keys');
    const order = [
      ['Move', ['fwd', 'left', 'back', 'right']], ['Jump', ['jump']], ['Sprint', ['sprint']],
      ['Crouch / slide', ['crouch']], ['Reload', ['reload']], ['Melee', ['melee']],
      ['Grenade', ['grenade']], ['Interact', ['use']], ['Knife', ['knife']],
      ['Lean', ['lean_l', 'lean_r']], ['Weapons', ['slot1', 'slot2', 'slot3']],
      ['Scoreboard', ['scores']], ['Pause', ['pause']],
    ];
    const byAction = {};
    for (const code in DEFAULT_BINDS) (byAction[DEFAULT_BINDS[code]] ||= []).push(keyLabel(code));
    const add = (label, keys) => {
      const r = el(doc, 'div', 'krow');
      r.append(el(doc, 'span', 'kl', label), el(doc, 'b', null, keys));
      g.appendChild(r);
    };
    for (const [label, actions] of order) {
      const keys = [];
      for (const a of actions) for (const k of byAction[a] || []) if (!keys.includes(k)) keys.push(k);
      if (!keys.length) continue;
      // Movement binds two whole sets of keys and reads as noise on one line, so
      // anything long gets split into the letters and the alternates.
      let out = keys.join('  ');
      if (out.length > 16) {
        const single = keys.filter((k) => k.length === 1);
        const rest = keys.filter((k) => k.length !== 1);
        out = [single.join(' '), rest.join(' ')].filter(Boolean).join('   ·   ');
      }
      add(label, out);
    }
    add('Fire', 'Left mouse');
    add('Aim down sights', 'Right mouse');
    add('Debug overlay', 'F3');
    g.appendChild(hint('A connected gamepad is picked up automatically: sticks to move and look, ' +
      'triggers to aim and fire, A to jump, B to crouch, X to reload.'));
    return g;
  }

  // ── death screen stats ─────────────────────────────────────────────────────
  function fillStats() {
    const s = G.stats || {};
    const shots = s.shots || 0;
    const acc = shots > 0 ? (s.hits || 0) / shots : 0;
    const t = G.time.t || 0;
    const rows = [
      ['Kills', String(s.kills || 0)],
      ['Headshots', String(s.headshots || 0)],
      ['Accuracy', shots ? (acc * 100).toFixed(0) + '%' : '—'],
      ['Shots fired', String(shots)],
      ['Damage dealt', String(Math.round(s.damage || 0))],
      ['Damage taken', String(Math.round(s.taken || 0))],
      ['Wave reached', String((G.director && G.director.wave) || 0)],
      ['Time survived', `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`],
    ];
    while (deadStats.firstChild) deadStats.removeChild(deadStats.firstChild);
    for (const [k, v] of rows) {
      const r = el(doc, 'div', 'srow');
      r.append(el(doc, 'span', 'sk', k), el(doc, 'b', null, v));
      deadStats.appendChild(r);
    }
  }

  // Restarting has to hand the pointer back as well as reset the run — a death
  // screen that redeploys you into a game you cannot look around in is worse
  // than no button at all. Both calls happen inside the click, which is the user
  // gesture pointer lock requires.
  function restart() {
    if (cb.restart) cb.restart();
    if (cb.resume) cb.resume();
  }

  // ── navigation ─────────────────────────────────────────────────────────────
  function go(which) {
    home = current === 'settings' || current === 'controls' ? home : current;
    swap(which);
  }

  function swap(which) {
    const next = screens[which];
    if (!next) return;
    for (const k in screens) cls(screens[k], 'on', screens[k] === next);
    current = which;
    if (which === 'dead') fillStats();
    host.setAttribute('aria-label', next.getAttribute('aria-label') || 'Menu');
    play(next, [
      { opacity: 0, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 220, easing: 'cubic-bezier(.2,.9,.25,1)' }, reduce);
    // Focus moves to the panel's first control so the whole menu is reachable
    // from the keyboard without a single click. rAF because a display:none
    // element cannot take focus in the same frame it is revealed.
    const focus = () => {
      const f = next.querySelector('button.primary, button, input, select');
      if (f) try { f.focus({ preventScroll: true }); } catch { f.focus(); }
    };
    if (win.requestAnimationFrame) win.requestAnimationFrame(focus); else focus();
  }

  function show(which) {
    if (which === 'main' || which === 'pause' || which === 'dead') {
      home = which;
      // Showing the title *is* being in the menu — main.js hands the mode back
      // when a button asks it to.
      if (which === 'main') G.mode = 'menu';
    }
    host.classList.add('on');
    host.removeAttribute('aria-hidden');
    swap(which);
  }

  function hide() {
    host.classList.remove('on');
    host.setAttribute('aria-hidden', 'true');
    current = null;
  }

  // Keyboard handling only while the menu is up: Escape backs out of a
  // sub-panel, Tab wraps inside the panel, and the arrows walk the buttons so a
  // gamepad-shaped d-pad or a player who never learned Tab still gets around.
  const onKey = (e) => {
    if (!host.classList.contains('on') || !current) return;
    const p = screens[current];
    if (e.key === 'Escape') {
      if (current === 'settings' || current === 'controls') { e.preventDefault(); e.stopPropagation(); show(home); }
      return;
    }
    if (e.key === 'Tab') {
      const f = focusables(p);
      if (!f.length) return;
      const i = f.indexOf(doc.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // Ranges and selects own the arrow keys — stepping a slider is what the
      // player meant. Only move focus when a button has it.
      const a = doc.activeElement;
      if (a && a.tagName !== 'BUTTON') return;
      const f = focusables(p);
      if (!f.length) return;
      e.preventDefault();
      const i = f.indexOf(a);
      f[(i + (e.key === 'ArrowDown' ? 1 : f.length - 1) + f.length) % f.length].focus();
    }
  };
  doc.addEventListener('keydown', onKey, true);

  hide();
  return {
    show,
    hide,
    dispose() { doc.removeEventListener('keydown', onKey, true); },
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function focusables(p) {
  return Array.prototype.filter.call(
    p.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])'),
    (n) => !n.disabled && n.offsetParent !== null);
}

function pct(v) { return Math.round(v * 100) + '%'; }

// KeyW → W, ShiftLeft → Shift, Digit1 → 1. The raw codes are how the browser
// talks; they are not how a controls screen should talk back.
function keyLabel(code) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return { Up: '↑', Down: '↓', Left: '←', Right: '→' }[code.slice(5)] || code;
  const named = {
    Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl',
    ControlRight: 'R-Ctrl', Tab: 'Tab', Escape: 'Esc', Enter: 'Enter',
  };
  return named[code] || code;
}

// ── styles ───────────────────────────────────────────────────────────────────
// index.html already styles .panel, .row, .keys and the buttons. Everything
// below is either a primitive that stylesheet does not have yet, or a specificity
// bump where a control needs to look like it belongs to the same machine.
const CSS = `
#menu{overflow:auto;padding:28px 20px}
#menu [data-screen]{display:none}
#menu [data-screen].on{display:block;max-height:calc(100vh - 56px);overflow:auto}
#menu .panel.wide{min-width:min(560px,94vw);max-width:min(680px,94vw)}
#menu .panel.wide .row{padding:7px 2px}
#menu [data-screen=main] h2{font-size:23px;letter-spacing:.5em;text-indent:.5em}
#menu .panel h2{position:relative;padding-bottom:12px}
#menu .panel h2::after{content:'';position:absolute;left:0;right:0;bottom:4px;height:1px;
  background:linear-gradient(90deg,var(--amber-dim),transparent)}
#menu .panel.dead h2{color:var(--bad);font-size:18px}
#menu .panel.dead h2::after{background:linear-gradient(90deg,var(--bad),transparent)}

#menu button.primary{border-left-color:var(--amber-dim);background:rgba(255,182,72,.06)}
#menu button.ghost{color:#8d9caa;font-size:12px;padding:9px 16px}
#menu :focus-visible{outline:2px solid var(--amber);outline-offset:2px}
#menu .sw input:focus-visible{outline-offset:3px}

#menu .sect{margin:20px 0 4px;font-size:10px;letter-spacing:.34em;text-transform:uppercase;
  color:var(--amber-dim)}
#menu .sect:first-of-type{margin-top:6px}
#menu .row{cursor:pointer}
#menu .row .lab{flex:1 1 auto}
#menu .row .val{flex:0 0 auto;min-width:62px;text-align:right;color:var(--amber);
  font-variant-numeric:tabular-nums}
#menu .row input[type=range]{flex:0 0 min(200px,40vw);height:18px}

/* The switch reads as a switch and as a word, because colour alone is not a
   state anyone should have to infer. */
#menu .sw{display:flex;align-items:center;gap:9px}
#menu .sw input{appearance:none;-webkit-appearance:none;margin:0;width:34px;height:16px;
  background:rgba(159,176,189,.18);border:1px solid rgba(159,176,189,.28);border-radius:1px;
  position:relative;cursor:pointer;transition:background .14s,border-color .14s}
#menu .sw input::after{content:'';position:absolute;top:1px;left:1px;width:12px;height:12px;
  background:#8d9caa;transition:transform .14s ease,background .14s}
#menu .sw input:checked{background:rgba(255,182,72,.16);border-color:var(--amber-dim)}
#menu .sw input:checked::after{transform:translateX(18px);background:var(--amber)}
#menu .swtxt{min-width:26px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8d9caa}
#menu .sw input:checked+.swtxt{color:var(--amber)}

#menu .stats{margin:2px 0 20px}
#menu .srow{display:flex;justify-content:space-between;gap:16px;padding:7px 2px;
  font-size:12px;letter-spacing:.1em;color:#8d9caa;
  border-bottom:1px solid rgba(159,176,189,.08)}
#menu .srow b{color:var(--amber);font-weight:600;font-variant-numeric:tabular-nums}

#menu .krow{display:flex;justify-content:space-between;gap:18px;align-items:baseline;
  border-bottom:1px solid rgba(159,176,189,.07);padding:2px 0}
#menu .krow .kl{color:#8d9caa;flex:0 0 auto}
#menu .krow b{text-align:right}
#menu .hint{margin:16px 0 0;font-size:10.5px;line-height:1.7;letter-spacing:.08em;color:#6c7a86}
#menu .keys .hint{margin-top:14px}

@media (prefers-reduced-motion:reduce){
  #menu .sw input,#menu .sw input::after{transition:none}
}
`;

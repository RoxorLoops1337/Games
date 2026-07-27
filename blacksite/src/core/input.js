// Input. Keyboard + mouse with pointer lock, and a gamepad path with the
// response curve a stick needs to be usable for aiming.
//
// Nothing here runs at import time — `createInput()` is what touches the DOM, so
// the headless suite can import the module and feed `G.input` synthetically.

const DEFAULT_BINDS = {
  KeyW: 'fwd', KeyS: 'back', KeyA: 'left', KeyD: 'right',
  ArrowUp: 'fwd', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right',
  Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint',
  ControlLeft: 'crouch', KeyC: 'crouch',
  KeyR: 'reload', KeyF: 'melee', KeyG: 'grenade', KeyE: 'use', KeyV: 'knife',
  KeyQ: 'lean_l', KeyZ: 'lean_r',
  Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3',
  Tab: 'scores', Escape: 'pause', KeyP: 'pause',
};

import { createTouch, isTouchCapable } from './touch.js';

export function createInput(G, canvas, opts = {}) {
  const doc = canvas.ownerDocument || document;
  const held = new Set();
  const down = new Set();
  const up = new Set();
  let dx = 0, dy = 0;
  let locked = false;
  let pad = null;

  const binds = Object.assign({}, DEFAULT_BINDS, opts.binds || {});

  const press = (a) => { if (!held.has(a)) down.add(a); held.add(a); };
  const release = (a) => { if (held.has(a)) up.add(a); held.delete(a); };

  const onKey = (e, isDown) => {
    const a = binds[e.code];
    if (!a) return;
    // Tab and Space scroll the page and Escape would leave lock at odd times;
    // once the game has focus it owns all of them.
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (e.repeat) return;
    isDown ? press(a) : release(a);
  };

  const onMouse = (e, isDown) => {
    const a = e.button === 0 ? 'fire' : e.button === 2 ? 'ads' : e.button === 1 ? 'melee' : null;
    if (!a) return;
    e.preventDefault();
    isDown ? press(a) : release(a);
  };

  const onMove = (e) => {
    if (!locked) return;
    // Chrome can deliver a single enormous movement value on the frame the
    // pointer locks. Clamping keeps that from spinning the camera.
    dx += Math.max(-260, Math.min(260, e.movementX || 0));
    dy += Math.max(-260, Math.min(260, e.movementY || 0));
  };

  const onWheel = (e) => { if (locked) { e.preventDefault(); wheel += Math.sign(e.deltaY); } };
  let wheel = 0;

  const onLockChange = () => {
    locked = doc.pointerLockElement === canvas;
    if (!locked) { held.clear(); dx = dy = 0; if (opts.onLockLost) opts.onLockLost(); }
    else if (opts.onLock) opts.onLock();
  };

  const kd = (e) => onKey(e, true), ku = (e) => onKey(e, false);
  const md = (e) => onMouse(e, true), mu = (e) => onMouse(e, false);
  const ctx = (e) => e.preventDefault();
  const blur = () => { held.clear(); dx = dy = 0; };

  doc.addEventListener('keydown', kd);
  doc.addEventListener('keyup', ku);
  doc.addEventListener('mousedown', md);
  doc.addEventListener('mouseup', mu);
  doc.addEventListener('mousemove', onMove);
  doc.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('contextmenu', ctx);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  (canvas.ownerDocument.defaultView || window).addEventListener('blur', blur);

  // A stick needs a deadzone and a curve or fine aim is impossible: the raw
  // linear value spends most of its travel in the range you never want.
  const curve = (v, dead = 0.14, exp = 2.4) => {
    const m = Math.abs(v);
    if (m < dead) return 0;
    const n = (m - dead) / (1 - dead);
    return Math.sign(v) * Math.pow(n, exp);
  };

  // Touch runs alongside the keyboard rather than instead of it: a tablet with
  // a keyboard, or a laptop with a touchscreen, should have both work without
  // the game deciding which one the player meant.
  const touch = isTouchCapable() && opts.root
    ? createTouch(G, opts.root, { press, release })
    : null;

  return {
    get locked() { return locked; },
    get touch() { return touch; },
    get usingTouch() { return !!(touch && touch.active); },

    // Pointer lock does not exist on a touchscreen, and asking for it there
    // either throws or silently never resolves — so the caller has to be told
    // that being "unlocked" is the normal state rather than a paused game.
    lock() {
      if (touch && touch.active) { if (opts.onLock) opts.onLock(); return; }
      if (canvas.requestPointerLock) canvas.requestPointerLock();
    },
    unlock() { if (doc.exitPointerLock) doc.exitPointerLock(); },

    // Called once per rendered frame, before the simulation steps.
    sample() {
      const inp = G.input;
      inp.pressed = down; inp.released = up; inp.buttons = held;

      let mx = 0, my = 0;
      if (held.has('right')) mx += 1;
      if (held.has('left')) mx -= 1;
      if (held.has('fwd')) my += 1;
      if (held.has('back')) my -= 1;

      pad = null;
      const nav = (canvas.ownerDocument.defaultView || window).navigator;
      if (nav && nav.getGamepads) {
        const pads = nav.getGamepads();
        for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
      }
      if (pad) {
        const ax = pad.axes;
        mx += curve(ax[0] || 0, 0.14, 1.6);
        my -= curve(ax[1] || 0, 0.14, 1.6);
        // Stick look is applied as a rate, so it is frame-rate independent and
        // ramps rather than snapping — that ramp is most of what "aim assist"
        // feels like before any target magnetism is involved.
        const lx = curve(ax[2] || 0), ly = curve(ax[3] || 0);
        dx += lx * 900 * (G.time.dt || 0.016);
        dy += ly * 900 * (G.time.dt || 0.016);
        const b = pad.buttons;
        const padBind = { 0: 'jump', 1: 'crouch', 2: 'reload', 3: 'use', 4: 'slot2', 5: 'grenade', 6: 'ads', 7: 'fire', 10: 'sprint' };
        for (const k in padBind) {
          const btn = b[k];
          if (!btn) continue;
          const on = btn.pressed || btn.value > 0.4;
          on ? press(padBind[k]) : release(padBind[k]);
        }
      }

      // The touch stick is already deadzoned and curved, so it is added raw and
      // the clamp below keeps a stick plus a held key from exceeding full speed.
      if (touch) {
        mx += touch.state.move.x;
        my += touch.state.move.y;
        touch.drainLook({ get x() { return dx; }, set x(v) { dx = v; },
                          get y() { return dy; }, set y(v) { dy = v; } });
        touch.refresh();
      }

      const mag = Math.hypot(mx, my);
      if (mag > 1) { mx /= mag; my /= mag; }
      inp.move.x = mx; inp.move.y = my;
      inp.look.x = dx; inp.look.y = dy;
      inp.wheel = wheel;
      dx = 0; dy = 0; wheel = 0;
    },

    // Cleared after the simulation has stepped, so a press is visible for the
    // whole frame no matter how many fixed steps ran.
    endFrame() { down.clear(); up.clear(); G.input.look.x = 0; G.input.look.y = 0; },

    dispose() {
      if (touch) touch.dispose();
      doc.removeEventListener('keydown', kd);
      doc.removeEventListener('keyup', ku);
      doc.removeEventListener('mousedown', md);
      doc.removeEventListener('mouseup', mu);
      doc.removeEventListener('mousemove', onMove);
      doc.removeEventListener('pointerlockchange', onLockChange);
      canvas.removeEventListener('contextmenu', ctx);
      canvas.removeEventListener('wheel', onWheel);
      (canvas.ownerDocument.defaultView || window).removeEventListener('blur', blur);
    },
  };
}

export { DEFAULT_BINDS };

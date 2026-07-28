// Touch controls.
//
// A phone has no pointer lock, no keys and no gamepad, so without this the game
// boots to a menu you can tap and then cannot be played at all.
//
// The layout is the one every mobile shooter converges on, for good reasons:
// a *floating* movement stick on the left (fixed sticks force you to look at
// your thumb to find them, and a thumb that has to look is a thumb that is not
// aiming), free look-drag anywhere on the right, and the action buttons under
// where the right thumb already rests. Nothing important sits in the top third,
// because that is where the hand holding the phone covers the screen.
//
// Nothing here runs at import time. `createTouch()` is what touches the DOM.

// Feature detection, not user-agent sniffing. A Surface has a touchscreen *and*
// a keyboard, so this only reports what the hardware can do — the caller
// decides what to show, and the input layer keeps both paths live at once.
export function isTouchCapable() {
  if (typeof window === 'undefined') return false;
  return (navigator.maxTouchPoints || 0) > 0 ||
    ('ontouchstart' in window) ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

// Touch-capable *and* with no mouse attached. This is the one that decides
// whether to ask for pointer lock, and it has to be answerable before the
// player has touched anything: waiting for the first touch means the game
// requests a lock it cannot get, the request fails, and the failure handler
// pauses the game before it has started. On a phone that is a coin flip
// between "it works" and "it pauses itself the moment you press Engage".
export function isTouchOnly() {
  if (!isTouchCapable()) return false;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return !window.matchMedia('(any-pointer: fine)').matches;
}

// Radians of view rotation per CSS pixel dragged. Deliberately not the mouse
// sensitivity: a thumb drags perhaps 200 px before it runs out of screen, and
// it has to be able to turn a full circle in two or three of those.
const LOOK_PER_PX = 0.0052;

// How far the thumb travels from where it landed before the stick reads full
// deflection. Small enough to reach without shifting grip.
const STICK_RADIUS = 46;
const STICK_DEAD = 0.14;

export function createTouch(G, root, hooks) {
  const canvas = root.querySelector('#gl');
  const layer = root.querySelector('#touch');
  if (!layer) return null;

  const stick = layer.querySelector('#tstick');
  const knob = layer.querySelector('#tstick i');
  const doc = root.ownerDocument || document;

  // Every touch currently down, by identifier. A shooter needs genuine
  // multi-touch: move, look and fire are frequently three fingers at once, and
  // a handler that tracks only one of them makes strafing while shooting
  // impossible — which is most of the game.
  const touches = new Map();
  let moveId = null, lookId = null;
  let stickX = 0, stickY = 0;
  const state = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, active: false };

  const buttons = new Map();
  for (const el of layer.querySelectorAll('[data-act]')) {
    buttons.set(el, { act: el.dataset.act, toggle: el.dataset.toggle === '1', on: false, id: null });
  }

  const rectOf = (el) => el.getBoundingClientRect();

  function buttonAt(x, y) {
    for (const [el] of buttons) {
      if (el.hidden) continue;
      const r = rectOf(el);
      // A generous margin: a finger is about 9 mm across and lands where it
      // feels right rather than where the pixel is. Missing the fire button in
      // a firefight is the single most punishing failure this layer can have.
      const pad = 10;
      if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return el;
    }
    return null;
  }

  function pressButton(el, id) {
    const b = buttons.get(el);
    if (!b) return;
    b.id = id;
    if (b.toggle) {
      b.on = !b.on;
      el.classList.toggle('on', b.on);
      b.on ? hooks.press(b.act) : hooks.release(b.act);
    } else {
      b.on = true;
      el.classList.add('on');
      hooks.press(b.act);
    }
  }

  function releaseButton(el) {
    const b = buttons.get(el);
    if (!b) return;
    b.id = null;
    if (b.toggle) return;                 // a toggle stays where it was put
    b.on = false;
    el.classList.remove('on');
    hooks.release(b.act);
  }

  function onStart(e) {
    for (const t of e.changedTouches) {
      // A finger already being tracked must not be claimed twice. A browser
      // should not deliver that, but a re-registered identifier silently turns
      // the movement thumb into a look thumb and the stick stops working —
      // which is exactly the failure that made a synthetic test report movement
      // as broken when it was not.
      if (touches.has(t.identifier)) continue;
      const x = t.clientX, y = t.clientY;
      state.active = true;

      const el = buttonAt(x, y);
      if (el) {
        touches.set(t.identifier, { kind: 'btn', el });
        pressButton(el, t.identifier);
        continue;
      }

      // Left third of the screen drives movement, the rest looks. A third
      // rather than a half because the right thumb needs the room: look drags
      // are long and the buttons live over there too.
      if (x < window.innerWidth * 0.36 && moveId === null) {
        moveId = t.identifier;
        stickX = x; stickY = y;
        touches.set(t.identifier, { kind: 'move' });
        stick.style.transform = `translate(${x}px, ${y}px)`;
        stick.classList.add('on');
        knob.style.transform = 'translate(-50%,-50%)';
      } else if (lookId === null) {
        lookId = t.identifier;
        touches.set(t.identifier, { kind: 'look', x, y, moved: 0, t0: performance.now() });
      }
    }
    if (touches.size) e.preventDefault();
  }

  function onMove(e) {
    let handled = false;
    for (const t of e.changedTouches) {
      const rec = touches.get(t.identifier);
      if (!rec) continue;
      handled = true;

      if (rec.kind === 'move') {
        let dx = t.clientX - stickX, dy = t.clientY - stickY;
        const d = Math.hypot(dx, dy);
        if (d > STICK_RADIUS) { dx = dx / d * STICK_RADIUS; dy = dy / d * STICK_RADIUS; }
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        let nx = dx / STICK_RADIUS, ny = -dy / STICK_RADIUS;
        const mag = Math.hypot(nx, ny);
        if (mag < STICK_DEAD) { nx = 0; ny = 0; }
        else {
          // Rescale past the dead zone so the first usable position is a slow
          // walk rather than a jump to a third of full speed.
          const s = (mag - STICK_DEAD) / (1 - STICK_DEAD) / mag;
          nx *= s; ny *= s;
        }
        state.move.x = nx; state.move.y = ny;
        // Pushing the stick to its edge is the sprint gesture. A separate
        // sprint button would be a fourth thing for two thumbs to reach.
        if (Math.hypot(nx, ny) > 0.92 && ny > 0.55) hooks.press('sprint');
        else hooks.release('sprint');

      } else if (rec.kind === 'look') {
        const dx = t.clientX - rec.x, dy = t.clientY - rec.y;
        rec.x = t.clientX; rec.y = t.clientY;
        rec.moved += Math.abs(dx) + Math.abs(dy);
        state.look.x += dx;
        state.look.y += dy;
      }
    }
    // Only for fingers this layer actually owns. A blanket preventDefault here
    // stops the page scrolling *and* stops the browser synthesising the click
    // that every DOM button in the game depends on.
    if (handled) e.preventDefault();
  }

  function onEnd(e) {
    let handled = false;
    for (const t of e.changedTouches) {
      const rec = touches.get(t.identifier);
      if (!rec) continue;
      handled = true;
      touches.delete(t.identifier);

      if (rec.kind === 'move') {
        moveId = null;
        state.move.x = 0; state.move.y = 0;
        hooks.release('sprint');
        stick.classList.remove('on');
      } else if (rec.kind === 'look') {
        lookId = null;
        // A tap that never really moved is a shot. This is what makes the game
        // playable one-thumbed for anyone who cannot reach the fire button, and
        // it costs nothing: the threshold is well below a deliberate drag.
        if (rec.moved < 12 && performance.now() - rec.t0 < 260) {
          hooks.press('fire');
          setTimeout(() => hooks.release('fire'), 90);
        }
      } else if (rec.kind === 'btn') {
        releaseButton(rec.el);
      }
    }
    // The important one. `preventDefault` on touchend cancels the click the
    // browser would otherwise synthesise, so doing it unconditionally on a
    // document-level listener kills every button on the page — the menu's
    // Deploy included, which looks exactly like the game having frozen.
    if (handled) e.preventDefault();
  }

  // A touch that is cancelled (a system gesture, a call arriving) must release
  // whatever it was holding, or the player comes back still firing.
  function onCancel(e) {
    for (const t of e.changedTouches) {
      const rec = touches.get(t.identifier);
      if (rec && rec.kind === 'btn') releaseButton(rec.el);
      touches.delete(t.identifier);
    }
    moveId = null; lookId = null;
    state.move.x = 0; state.move.y = 0;
    hooks.release('sprint');
    stick.classList.remove('on');
  }

  const opts = { passive: false };
  canvas.addEventListener('touchstart', onStart, opts);
  layer.addEventListener('touchstart', onStart, opts);
  doc.addEventListener('touchmove', onMove, opts);
  doc.addEventListener('touchend', onEnd, opts);
  doc.addEventListener('touchcancel', onCancel, opts);

  return {
    state,

    // Drained once per frame by the input layer, the same way mouse movement is.
    drainLook(out) {
      out.x += state.look.x * LOOK_PER_PX / (G.settings.sens || 0.0022);
      out.y += state.look.y * LOOK_PER_PX / (G.settings.sens || 0.0022);
      state.look.x = 0; state.look.y = 0;
    },

    get moving() { return state.move.x !== 0 || state.move.y !== 0; },
    get active() { return state.active; },

    // The reload button only earns its space when reloading is on the player's
    // mind. Screen area is the scarcest resource on a phone.
    refresh() {
      const w = G.weapons.slots[G.weapons.active];
      if (!w) return;
      const el = layer.querySelector('[data-act="reload"]');
      if (el) el.hidden = !(w.ammo < w.mag * 0.5 && w.res > 0);
    },

    dispose() {
      canvas.removeEventListener('touchstart', onStart);
      layer.removeEventListener('touchstart', onStart);
      doc.removeEventListener('touchmove', onMove);
      doc.removeEventListener('touchend', onEnd);
      doc.removeEventListener('touchcancel', onCancel);
    },
  };
}

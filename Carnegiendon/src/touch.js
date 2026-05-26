// Touch / mobile controls. Provides an intent override that game.js merges
// with the keyboard input. Layout:
//   - Left thumb area: virtual stick. Up = gas, down = brake/reverse,
//     left/right = steer. Stick deadzone in the center, full lock at ~70px.
//   - Right thumb area: NITRO and HANDBRAKE buttons (held while touched).
//   - Top-right: PAUSE button (tap = pause).
// The whole overlay is invisible until the first touchstart anywhere on
// the page, so desktop users never see it.
const Touch = (() => {
  let enabled = false;
  let stickTouchId = null;
  let stickCenter = { x: 0, y: 0 };
  let stickKnobEl = null;
  let stickEl = null;
  const RADIUS = 70;

  const intent = { throttle: 0, steer: 0, nitro: false, handbrake: false };

  function init() {
    stickEl = document.getElementById("touch-stick");
    stickKnobEl = document.getElementById("touch-stick-knob");
    if (!stickEl) return;

    // Reveal the touch UI the first time the user actually touches anywhere.
    window.addEventListener("touchstart", enable, { passive: true });

    bindStick();
    bindButton("touch-nitro",     (v) => intent.nitro = v);
    bindButton("touch-handbrake", (v) => intent.handbrake = v);
    bindPause();
    bindCam();
  }

  function bindCam() {
    const el = document.getElementById("touch-cam");
    if (!el) return;
    el.addEventListener("touchstart", (e) => {
      e.preventDefault();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keyup",   { key: "c", bubbles: true }));
    }, { passive: false });
  }

  function enable() {
    if (enabled) return;
    enabled = true;
    document.getElementById("touch-ui").classList.add("active");
  }

  function bindStick() {
    stickEl.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      stickTouchId = t.identifier;
      const rect = stickEl.getBoundingClientRect();
      stickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      updateStick(t.clientX, t.clientY);
    }, { passive: false });

    window.addEventListener("touchmove", (e) => {
      if (stickTouchId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === stickTouchId) {
          updateStick(t.clientX, t.clientY);
          e.preventDefault();
          break;
        }
      }
    }, { passive: false });

    const release = (e) => {
      if (stickTouchId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === stickTouchId) {
          stickTouchId = null;
          intent.throttle = 0;
          intent.steer = 0;
          if (stickKnobEl) stickKnobEl.style.transform = "translate(-50%, -50%)";
          break;
        }
      }
    };
    window.addEventListener("touchend", release, { passive: true });
    window.addEventListener("touchcancel", release, { passive: true });
  }

  function updateStick(touchX, touchY) {
    let dx = touchX - stickCenter.x;
    let dy = touchY - stickCenter.y;
    const dist = Math.hypot(dx, dy);
    if (dist > RADIUS) {
      dx = (dx / dist) * RADIUS;
      dy = (dy / dist) * RADIUS;
    }
    // Deadzone keeps the stick from drifting from a resting thumb.
    const dead = 8;
    intent.steer = Math.abs(dx) < dead ? 0 : Math.max(-1, Math.min(1, dx / RADIUS));
    intent.throttle = Math.abs(dy) < dead ? 0 : Math.max(-1, Math.min(1, -dy / RADIUS));
    if (stickKnobEl) {
      stickKnobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
  }

  function bindButton(id, setter) {
    const el = document.getElementById(id);
    if (!el) return;
    const tracked = new Set();
    el.addEventListener("touchstart", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) tracked.add(t.identifier);
      el.classList.add("held");
      setter(true);
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) tracked.delete(t.identifier);
      if (tracked.size === 0) {
        el.classList.remove("held");
        setter(false);
      }
    };
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", end, { passive: true });
  }

  function bindPause() {
    const el = document.getElementById("touch-pause");
    if (!el) return;
    el.addEventListener("touchstart", (e) => {
      e.preventDefault();
      // Synthesize a P keypress so the existing pause-toggle handler in the
      // game loop picks it up next tick.
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keyup",   { key: "p", bubbles: true }));
    }, { passive: false });
  }

  function getOverride() { return enabled ? intent : null; }
  function isEnabled() { return enabled; }

  return { init, getOverride, isEnabled, enable };
})();

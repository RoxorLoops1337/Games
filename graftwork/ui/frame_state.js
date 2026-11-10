// Frozen screens under a modal (pure, no DOM). While a screen pushed with app.push is on top (Pause, Settings, the deck view, ...) every screen
// below it is FROZEN: no update, no draw, no input, and none of its time passes. core.js draws the lower stack ONCE into a snapshot canvas and blits
// that under the modal each frame. This module is the bookkeeping behind it; core.js owns the canvas.
//   retop    who is on top now: the screen that got covered keeps the clock it stopped at, the one that is uncovered gets it back (app.t is the
//            clock of the top screen, so a covered screen resumes at the very instant it stopped)
//   isLive   who owns a tween or a timer: the screen that was on top when it was made. It advances only while that screen is on top, or once the
//            screen has left the stack (nobody owns it any more: it runs out as before)
//   stale    when the snapshot has to be painted again. The reasons (kept in `dirty`, counted in `why`):
//              stack   a screen was pushed, popped or replaced
//              resize  the backing store changed (window size, rotation, fullscreen, a quality tier with another device pixel ratio cap)
//              look    a setting or a cosmetic changed what the frozen screens look like, a picture finished loading, the quality tier moved
//              asked   app.refreshBelow() from a modal
const REASONS = ['stack', 'resize', 'look', 'asked'];
export function createFrameState() {
  const s = { top: null, clocks: new Map(), dirty: 'stack', w: 0, h: 0, snap: null, paints: 0, why: {} };
  s.markDirty = (why) => { if (!s.dirty) s.dirty = REASONS.includes(why) ? why : 'asked'; };
  s.isLive = (owner, stack) => !owner || owner === stack[stack.length - 1] || stack.indexOf(owner) < 0;
  // Call whenever the stack may have changed. clock = { t, sceneT } of the screen that was on top until now, now in ms.
  // Returns null while the same screen is on top, else { covered, uncovered, clock, ms }: covered is the old top when it is still in the stack (it is
  // frozen from here on), uncovered the new top when it was frozen (clock: where it stopped, ms: how long ago).
  s.retop = (stack, clock, now) => {
    const top = stack[stack.length - 1] || null, prev = s.top;
    if (top === prev) return null;
    const out = { covered: null, uncovered: null, clock: null, ms: 0 };
    if (prev && stack.indexOf(prev) >= 0) { s.clocks.set(prev, { t: clock.t, sceneT: clock.sceneT, at: now }); out.covered = prev; }
    for (const k of [...s.clocks.keys()]) if (stack.indexOf(k) < 0) s.clocks.delete(k);
    const c = top && s.clocks.get(top);
    if (c) { s.clocks.delete(top); out.uncovered = top; out.clock = c; out.ms = now - c.at; }
    s.top = top; s.dirty = 'stack';
    return out;
  };
  // app.go: every screen left, nobody is frozen
  s.forget = () => { s.top = null; s.clocks.clear(); s.dirty = 'stack'; };
  // w, h: the backing store now. Returns the reason the snapshot must be painted again, or ''.
  s.stale = (w, h) => { if (!s.dirty && (w !== s.w || h !== s.h)) s.dirty = 'resize'; return s.dirty; };
  s.painted = (w, h) => { if (s.dirty) s.why[s.dirty] = (s.why[s.dirty] || 0) + 1; s.paints++; s.dirty = ''; s.w = w; s.h = h; };
  return s;
}

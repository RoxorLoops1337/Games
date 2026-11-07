// Dirty-frame logic (pure, no DOM). Decides when a whole frame may be SKIPPED: no 2D redraw, no WebGL upload, the last picture stays on screen.
// Round 2 perf. A frame is static only when EVERY source of change is quiet for two frames in a row:
//   input      a pointer move / press / release, a wheel tick, a key, a touch since the last tick (hover, drag, tooltips, focus rings all follow input)
//   tweens     any tween or timer pending (they move numbers the screen draws, or fire callbacks that change state)
//   ripples    tap ripples and other chrome animations
//   transition a screen transition, a modal fade, the overlay hook
//   fx         particles / floats / shake / flash owned by the screen, post-processing effects (shockwave, flash, vignette, grade ease)
//   tip        a tooltip that is showing, fading or waiting for its 0.25 s delay
//   screen     the active screen's own `still(app)` answer: only a screen that knows it has no wall-clock animation says yes.
//              The default is NO, so a screen that never opted in is redrawn every frame exactly as before.
//   forced     markDirty() (settings changes, resize, quality tier change, assets arriving, a screen entering)
// A refresh every `maxSkipMs` redraws anyway (cheap insurance against a time-driven detail nobody declared).
export const FS = { quietFrames: 2, maxSkipMs: 1000 };
export const SOURCES = ['input', 'tweens', 'timers', 'ripples', 'transition', 'fx', 'tip', 'screen', 'forced', 'stack'];
// f: { input, tweens, timers, ripples, transition, fx, tip, screenStill, forced, modalStack } -> the name of the first thing that is not quiet, or '' when all are
export function busyReason(f) {
  if (f.forced) return 'forced';
  if (f.input) return 'input';
  if (f.tweens > 0) return 'tweens';
  if (f.timers > 0) return 'timers';
  if (f.ripples) return 'ripples';
  if (f.transition) return 'transition';
  if (f.fx) return 'fx';
  if (f.tip) return 'tip';
  if (f.screenStill !== true) return 'screen';
  return '';
}
export function createFrameState(o = {}) {
  const s = { quiet: 0, last: '', skipped: 0, drawn: 0, sinceDraw: 0, reasons: {}, quietFrames: o.quietFrames || FS.quietFrames, maxSkipMs: o.maxSkipMs || FS.maxSkipMs, lastDrawAt: 0, forced: false };
  s.markDirty = () => { s.forced = true; };
  // Call once per tick BEFORE drawing. Returns true when this tick may be skipped. `now` in ms.
  s.begin = (f, now) => {
    const why = busyReason(s.forced ? Object.assign({}, f, { forced: true }) : f);
    s.forced = false;
    s.last = why;
    if (why) { s.quiet = 0; s.reasons[why] = (s.reasons[why] || 0) + 1; return s.draw(now); }
    s.quiet++;
    if (s.quiet <= s.quietFrames) return s.draw(now); // the frames right after the last change still have to be painted (and the one that proves it settled)
    if (now - s.lastDrawAt >= s.maxSkipMs) return s.draw(now);
    s.skipped++; return true;
  };
  s.draw = (now) => { s.drawn++; s.lastDrawAt = now; return false; };
  // true while the picture on screen is the last one drawn and nothing is about to change: post.js reads this as app.staticFrame
  s.isStatic = () => s.last === '' && s.quiet > s.quietFrames;
  return s;
}

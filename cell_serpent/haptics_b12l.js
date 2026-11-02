// Round 12 (agent l): one haptic vocabulary for key actions. Every pattern is a short list of vibrate/pause
// milliseconds, kept under 200 ms so nothing buzzes like a phone call. haptic() respects the existing Vibration
// setting (settings.vibrate) and the reduce-motion setting, and never throws on browsers without navigator.vibrate.
export const PATTERNS = {
  tap: 6, tab: 8, select: 10,
  claim: [14, 28, 22],
  good: [10, 24, 10],
  deny: [34, 40, 34],
  warn: [20, 30],
  upgrade: [12, 22, 12, 22, 30],
  chest: [10, 30, 14, 30, 36],
  levelup: [14, 24, 20, 24, 40],
  win: [18, 30, 18, 30, 70],
  lose: [80, 40, 70],
  revive: [40, 30, 60],
  boom: 24,
};

// pure: the pattern for a name ([] when unknown)
export function patternFor(name) { const p = PATTERNS[name]; return p === undefined ? [] : Array.isArray(p) ? p.slice() : [p]; }
// pure: total length of a pattern in ms
export const patternMs = p => (Array.isArray(p) ? p : [p]).reduce((a, b) => a + b, 0);

// buzz a named pattern; settings is the save's settings object, nav defaults to the browser's navigator
export function haptic(name, settings, nav) {
  try {
    const n = nav || (typeof navigator !== 'undefined' ? navigator : null);
    if (!n || typeof n.vibrate !== 'function' || !settings || !settings.vibrate || settings.reduceMotion) return false;
    const p = patternFor(name); if (!p.length) return false;
    return n.vibrate(p.length === 1 ? p[0] : p) !== false;
  } catch (e) { return false; }
}

// toast tone -> haptic name
export const TONE_HAPTIC = { good: 'good', deny: 'deny', warn: 'warn', info: '' };

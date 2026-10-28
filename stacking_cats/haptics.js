// Tiny vibration helper. Safe no-op when unsupported, switched off, or under reduced motion.
const PATTERNS = {
  hit: 10,
  crit: 18,
  ui: 8,
  merge: [14, 30, 22],
  ko: [40, 40, 40],
  boss: [30, 30, 60],
  tick: 6,
  pop: [24, 24, 44],
  jackpot: [30, 40, 30, 40, 30, 40, 90],
};
let enabled = true;
export function setHaptics(on) { enabled = !!on; }
export function hapticPattern(kind) { return PATTERNS[kind] || null; }
function reduced() {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}
let lastAt = 0;
export function buzz(kind) {
  try {
    if (!enabled) return false;
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav || typeof nav.vibrate !== 'function') return false;
    const p = PATTERNS[kind];
    if (!p || reduced()) return false;
    const now = Date.now();
    if (kind === 'hit' && now - lastAt < 120) return false;     // never a constant buzz
    lastAt = now;
    return !!nav.vibrate(p);
  } catch (e) { return false; }
}

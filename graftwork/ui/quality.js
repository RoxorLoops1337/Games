// Quality policy and frame governor. Pure (no DOM, no timers): the frame loop in core.js feeds it real frame deltas and asks it what to do.
//
//  Graphics setting (Settings > Graphics, meta.settings.graphics): 'auto' (default) | 'high' | 'low'.
//    high = tier full always, low = tier minimal always, auto = the controller below picks the tier from MEASURED frame deltas.
//  Tiers:    full    everything as authored (dpr up to 2, WebGL post at the Effects quality setting, motes, scene every frame)
//            lite    title scene refreshed every 3rd frame, no motes, no WebGL post, dpr capped at 1.5
//            minimal as lite, dpr capped at 1, and idle screens are held at 30 fps
//  Auto never looks at JS time alone: the signal is the interval between consecutive rAF ticks (what the player sees), so GPU,
//  raster and compositor stalls count. Hysteresis: drop one tier when half of the last 60 frames are slow; rise only after a long
//  clean stretch, after a lock that doubles with every drop that follows a rise, and never again once a rise was punished twice.
export const TIERS = ['full', 'lite', 'minimal'];
export const GRAPHICS = ['auto', 'high', 'low'];
const DEFAULT_GRAPHICS = 'auto';
export const TIER_SPEC = {
  full: { dprCap: 3, post: true, motes: true, sceneEvery: 1 },
  lite: { dprCap: 1.5, post: false, motes: false, sceneEvery: 3 },
  minimal: { dprCap: 1, post: false, motes: false, sceneEvery: 3 },
};
export const cleanGraphics = (v) => (GRAPHICS.includes(v) ? v : DEFAULT_GRAPHICS);

const RING = 60; // frames in the decision window
export const Q = {
  slowFactor: 1.4, // a frame is slow above expected * 1.4 (expected is never below 16.7 ms)
  dropShare: 0.5, // share of slow frames in a full window that drops a tier
  riseShare: 0.04, // the window must be this clean to count towards a rise
  riseAfterMs: 12000, // clean time needed before trying one tier up
  lockStartMs: 15000, // minimum time since the last drop before a rise; doubles per punished rise
  lockMaxMs: 120000,
  warmFrames: 45, // frames ignored after a tier change, a resize or a stall ...
  warmMs: 1500, // ... or this long, whichever ends first (a device at 3 fps must not wait 15 s to be judged)
  stallMs: 400, // a lone delta above this is a hidden tab / debugger / GC freeze: not a signal; three in a row are a very slow device and DO count
  hardStallMs: 5000, // above this it is never a signal
  panicMs: 70, // the mean of the last 8 frames above this drops straight to minimal
  panicN: 8,
};

export function createQuality(o = {}) {
  const q = {
    mode: cleanGraphics(o.mode), tier: 'full', cap: 'full', // cap: the best tier auto may rise to (lowered when a rise was punished twice)
    frames: 0, ring: new Float32Array(RING), ringN: 0, ringI: 0, slowN: 0, recent: new Float32Array(Q.panicN), recentI: 0, recentN: 0, recentSum: 0,
    warm: Q.warmFrames, warmAt: 0, lastDrop: -1e9, cleanSince: 0, lockMs: Q.lockStartMs, rose: -1e9, punished: 0,
    drops: 0, rises: 0, big: 0, avg: 16.7, reason: '', listeners: [], log: [],
  };
  const idx = (t) => TIERS.indexOf(t);
  function set(tier, why, now) {
    if (tier === q.tier) return;
    const prev = q.tier; q.tier = tier; q.reason = why;
    q.ringN = q.ringI = q.slowN = 0; q.ring.fill(0); q.recentN = q.recentI = q.recentSum = 0; q.recent.fill(0); q.warm = Q.warmFrames; q.warmAt = 0; q.cleanSince = 0;
    if (q.log.length < 40) q.log.push({ at: now, from: prev, to: tier, why });
    for (const f of q.listeners) f(tier, prev, why);
  }
  q.on = (f) => { q.listeners.push(f); return () => { const i = q.listeners.indexOf(f); if (i >= 0) q.listeners.splice(i, 1); }; };
  q.spec = () => TIER_SPEC[q.tier];
  q.setMode = (m, now = 0) => {
    q.mode = cleanGraphics(m);
    if (q.mode === 'high') set('full', 'setting high', now);
    else if (q.mode === 'low') set('minimal', 'setting low', now);
    else { q.cap = 'full'; q.punished = 0; q.lockMs = Q.lockStartMs; q.lastDrop = -1e9; if (q.tier !== 'full') set('full', 'setting auto', now); }
  };
  // Forget the window (screen change, resize, orientation): the next frames are not a verdict on the new content.
  q.warmup = (n = Q.warmFrames) => { q.warm = Math.max(q.warm, n); q.warmAt = 0; q.ringN = q.ringI = q.slowN = 0; q.ring.fill(0); q.cleanSince = 0; };
  // ms: real delta between two game ticks; expected: the interval the loop was aiming for (16.7, or 33.3 while capped); now: ms clock
  q.sample = (ms, expected = 16.7, now = 0) => {
    if (!(ms > 0)) return q.tier;
    if (ms > Q.hardStallMs) { q.big = 0; q.warmup(); return q.tier; }
    if (ms > Q.stallMs) { if (++q.big < 3) { q.warmup(); return q.tier; } } else q.big = 0;
    q.frames++;
    q.avg += (ms - q.avg) * 0.05;
    if (q.mode !== 'auto') return q.tier;
    if (q.warm > 0) { if (!q.warmAt) q.warmAt = now; if (--q.warm > 0 && now - q.warmAt < Q.warmMs) return q.tier; q.warm = 0; if (ms > 0 && q.warmAt) q.warmAt = 0; return q.tier; }
    const lim = Math.max(expected, 16.7) * Q.slowFactor, slow = ms > lim ? 1 : 0;
    q.slowN += slow - q.ring[q.ringI]; q.ring[q.ringI] = slow; q.ringI = (q.ringI + 1) % RING; if (q.ringN < RING) q.ringN++;
    q.recentSum += ms - q.recent[q.recentI]; q.recent[q.recentI] = ms; q.recentI = (q.recentI + 1) % Q.panicN; if (q.recentN < Q.panicN) q.recentN++;
    const t = idx(q.tier);
    if (q.recentN === Q.panicN && q.recentSum / Q.panicN > Q.panicMs && t < 2) { dropped(now, 2, 'panic'); return q.tier; }
    if (q.ringN < RING) return q.tier;
    const share = q.slowN / RING;
    if (share >= Q.dropShare && t < 2) { dropped(now, t + 1, 'slow ' + Math.round(share * 100) + '%'); return q.tier; }
    if (share <= Q.riseShare && t > idx(q.cap)) {
      if (!q.cleanSince) q.cleanSince = now;
      else if (now - q.cleanSince >= Q.riseAfterMs && now - q.lastDrop >= q.lockMs) { q.rises++; q.rose = now; set(TIERS[t - 1], 'clean ' + Math.round((now - q.cleanSince) / 1000) + 's', now); }
    } else if (share > Q.riseShare * 2.5) q.cleanSince = 0;
    return q.tier;
  };
  function dropped(now, to, why) {
    // a drop soon after a rise means the higher tier does not hold: lock longer, and after two of those stop trying
    if (now - q.rose < q.lockMs + 20000 && q.rises > 0) { q.punished++; q.lockMs = Math.min(Q.lockMaxMs, q.lockMs * 2); if (q.punished >= 2) q.cap = TIERS[Math.min(2, to)]; }
    q.drops++; q.lastDrop = now; set(TIERS[to], why, now);
  }
  q.debug = () => `${q.tier}${q.mode === 'auto' ? '' : '*'} ${q.avg.toFixed(1)}ms d${q.drops}/r${q.rises}`;
  if (q.mode === 'high') q.tier = 'full'; else if (q.mode === 'low') q.tier = 'minimal';
  return q;
}

// ---- frame governor: which rAF callbacks actually run a tick ----
// Idle screens (the title) drop to 30 fps after IDLE_AFTER_MS without input or a screen change, and stay at 30 fps in the minimal tier.
// A hidden tab runs nothing. Interactive screens (map, combat, ...) always run every callback.
const IDLE_SCREENS = ['title'];
export const IDLE_AFTER_MS = 4000;
const IDLE_INTERVAL_MS = 1000 / 30;
export function createGovernor(o = {}) {
  const g = { idleAfter: o.idleAfter ?? IDLE_AFTER_MS, interval: o.interval ?? IDLE_INTERVAL_MS, lastInput: 0, enteredAt: 0, screens: o.screens || IDLE_SCREENS, capped: false, skipped: 0, ran: 0 };
  g.input = (now) => { g.lastInput = now; };
  g.enter = (now) => { g.enteredAt = now; };
  // target interval in ms for the current state (0 = every callback)
  // calm: the active screen says nothing on it moves fast (screen.calm(app), round 2): it may idle at 30 fps like the title even though it is not in `screens`
  g.wanted = (now, screen, tier, hidden = false, reduced = false, calm = false) => {
    if (hidden) return Infinity;
    if (!calm && !g.screens.includes(screen)) return 0;
    if (tier === 'minimal') return g.interval;
    return now - Math.max(g.lastInput, g.enteredAt) >= g.idleAfter ? g.interval : 0;
  };
  // true when this rAF callback should run a tick. 3 ms of slack so a 60 Hz display lands on every second vsync instead of slipping to every third.
  g.shouldRun = (now, lastRun, screen, tier, hidden = false, calm = false) => {
    const w = g.wanted(now, screen, tier, hidden, false, calm);
    g.capped = w > 0 && w !== Infinity;
    if (w === Infinity) { g.skipped++; return false; }
    if (w === 0 || now - lastRun >= w - 3) { g.ran++; return true; }
    g.skipped++; return false;
  };
  return g;
}

// stats.js: anonymous, opt-out balance analytics client (server: functions/api/dropbass_stats.js).
// Batches events in memory and sends them with sendBeacon (or fetch keepalive) on run end, pagehide and at most once a minute.
// Nothing is ever sent when settings.analytics === false, when the browser sends Do Not Track, or when nothing was queued.
// Events carry only whitelisted game ids and numbers: no identifiers, no names, no free text.
const ENDPOINT = '/api/dropbass_stats';
const MIN_GAP = 60000, MAX_QUEUE = 40, PER_POST = 20;
let getSettings = () => ({});
let queue = [], lastSend = -Infinity, timer = null, endpoint = ENDPOINT, clock = () => Date.now(), sender = null;

function dnt() {
  try {
    if (typeof navigator === 'undefined') return false;
    const v = navigator.doNotTrack || (typeof window !== 'undefined' && window.doNotTrack) || navigator.msDoNotTrack;
    return v === '1' || v === 'yes' || v === 1 || v === true;
  } catch (e) { return false; }
}
// true when events may be collected and sent right now
export function enabled() {
  let s; try { s = getSettings() || {}; } catch (e) { s = {}; }
  return s.analytics !== false && !dnt();
}
// getter returns the profile settings object; opts is for tests: { endpoint, now, send(url, body) -> bool }
export function init(getter, opts) {
  if (typeof getter === 'function') getSettings = getter;
  if (opts) { if (opts.endpoint) endpoint = opts.endpoint; if (opts.now) clock = opts.now; if (opts.send) sender = opts.send; }
  if (typeof window !== 'undefined' && window.addEventListener && !init.hooked) {
    init.hooked = true;
    window.addEventListener('pagehide', () => flush(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(true); });
  }
}
export function pending() { return queue.length; }
export function reset() { queue = []; lastSend = -Infinity; if (timer) { clearTimeout(timer); timer = null; } }

const ids = (a, n) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, n) : []);
// generic hook: trackEvent('turret_pick', { turret: 'kick', world: 'garage' })
export function trackEvent(k, data) {
  try {
    if (!enabled()) return false;
    if (!k || typeof k !== 'string') return false;
    const e = Object.assign({}, data && typeof data === 'object' ? data : {}, { k });
    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push(e);
    schedule();
    return true;
  } catch (e) { return false; }
}
// run: a sim Run, result: run.result. Tutorial runs are not counted.
export function trackRunEnd(run, result) {
  try {
    if (!run || !result || run.mode === 'tutorial' || result.mode === 'tutorial') return false;
    if (!enabled()) return false;
    const use = (result.recap && result.recap.turretUse) || [];
    const top = use.slice().sort((a, b) => (b.deployed || 0) - (a.deployed || 0)).slice(0, 3).map((u) => u.type);
    const lanes = (result.recap && result.recap.leaksByLane) || [];
    let lane = null, best = 0; lanes.forEach((n, i) => { if (n > best) { best = n; lane = i; } });
    const daily = run.daily && run.daily.id ? [run.daily.id] : [];
    const ev = {
      world: result.world || (run.world && run.world.id), mode: result.mode || run.mode, difficulty: result.difficulty || run.difficulty || 'normal',
      won: !!result.won, wave: Math.max(0, Math.floor(result.wave || 0)), wavesTotal: Math.max(0, Math.floor(run.wavesTotal || 0)), leaks: Math.max(0, Math.floor(result.leaks || 0)),
      loadoutTop3: ids(top, 3), branchIds: ids(Object.keys(run.remix || {}), 12), modifiers: ids(daily, 6), seconds: Math.max(0, Math.min(86400, Math.floor(result.time || 0))),
    };
    if (lane !== null && ev.leaks > 0) ev.leakLane = Math.min(3, lane);
    const ok = trackEvent('run_end', ev);
    if (ok) flush(false, true);   // a run end is a natural moment to send, still limited to once a minute
    return ok;
  } catch (e) { return false; }
}

function schedule() {
  if (timer) return;
  const wait = Math.max(1000, MIN_GAP - (clock() - lastSend));
  timer = setTimeout(() => { timer = null; flush(false); }, wait);
  if (timer && timer.unref) timer.unref();
}
// force: pagehide (ignores the once a minute limit, uses sendBeacon). Returns true when something was sent.
export function flush(force) {
  try {
    if (!queue.length) return false;
    if (!enabled()) { queue = []; return false; }
    const now = clock();
    if (!force && now - lastSend < MIN_GAP) { schedule(); return false; }
    const batch = queue.splice(0, PER_POST);
    lastSend = now;
    const body = JSON.stringify({ v: 1, events: batch });
    if (sender) { sender(endpoint, body); }
    else if (typeof navigator !== 'undefined' && navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' }))) { /* queued by the browser */ }
    else if (typeof fetch === 'function') fetch(endpoint, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
    if (queue.length) schedule();
    return true;
  } catch (e) { return false; }
}

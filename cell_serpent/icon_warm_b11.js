// Batch 11 perf: hub icons are PNG data URLs (toDataURL is the slow part). Encode them one per idle slice after boot, so the first
// hub open finds them cached instead of encoding a dozen in one frame. The caches are the existing ones: only the timing moves.
export function warmIdle(thunks, idle) {
  const run = idle || (typeof requestIdleCallback === 'function' ? (f => requestIdleCallback(f, { timeout: 4000 })) : null);
  if (!run) return 0;
  const q = thunks.slice(); let i = 0;
  const next = () => { if (i >= q.length) return; try { q[i++](); } catch (e) { /* an icon that cannot encode is simply built on demand later */ } run(next); };
  run(next);
  return q.length;
}

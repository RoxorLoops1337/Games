// localStorage persistence. Keys are live URLs for save data: never rename.
import { serializeRun, deserializeRun } from './run.js';
const RUN_KEY = 'graftwork_run_v1';
const mem = {};
const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };
export function lsGet(k) { const s = store(); try { return s ? s.getItem(k) : mem[k] || null; } catch { return mem[k] || null; } }
export function lsSet(k, v) { const s = store(); try { if (s) s.setItem(k, v); else mem[k] = v; } catch { mem[k] = v; } }
export function lsDel(k) { const s = store(); try { if (s) s.removeItem(k); } catch { /* ignore */ } delete mem[k]; }
export function saveRun(run) { if (run && run.phase !== 'dead' && run.phase !== 'won') lsSet(RUN_KEY, serializeRun(run)); else lsDel(RUN_KEY); }
export function loadRun() { const j = lsGet(RUN_KEY); if (!j) return null; try { const r = deserializeRun(j); return r.v === 1 ? mend(r) : null; } catch { return null; } }
// The node map is retired (design/CLEANUP_PLAN.md): only a Ward run or a practice fight can be continued. A run save with no mode (made before
// the Ward existed) or any other mode is a run on the old map; engine/meta.js retireClassicRun closes it and counts its progress.
export const isRetiredRun = (run) => !!run && !run.practice && run.mode !== 'ward';
// Endless used to send a won Ward run to the map screen, which had no map to show: a save left in that state (mode 'ward', phase 'map') has
// its next floor laid out already, so it resumes there.
function mend(run) { if (run.mode === 'ward' && run.phase === 'map' && run.ward) run.phase = 'ward'; return run; }
export function clearRun() { lsDel(RUN_KEY); }
export function hasRun() { return !!lsGet(RUN_KEY); }

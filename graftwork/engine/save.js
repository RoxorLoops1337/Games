// localStorage persistence. Keys are live URLs for save data: never rename.
import { serializeRun, deserializeRun } from './run.js';
const RUN_KEY = 'graftwork_run_v1';
const mem = {};
const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };
export function lsGet(k) { const s = store(); try { return s ? s.getItem(k) : mem[k] || null; } catch { return mem[k] || null; } }
export function lsSet(k, v) { const s = store(); try { if (s) s.setItem(k, v); else mem[k] = v; } catch { mem[k] = v; } }
export function lsDel(k) { const s = store(); try { if (s) s.removeItem(k); } catch { /* ignore */ } delete mem[k]; }
export function saveRun(run) { if (run && run.phase !== 'dead' && run.phase !== 'won') lsSet(RUN_KEY, serializeRun(run)); else lsDel(RUN_KEY); }
export function loadRun() { const j = lsGet(RUN_KEY); if (!j) return null; try { const r = deserializeRun(j); return r.v === 1 ? r : null; } catch { return null; } }
export function clearRun() { lsDel(RUN_KEY); }
export function hasRun() { return !!lsGet(RUN_KEY); }

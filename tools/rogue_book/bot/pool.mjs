// Inkwoven balance bot: runs a list of run configs, in this process (jobs <= 1) or across worker threads. Results come back in
// the order of the task list whatever the number of workers, and a run is a pure function of its config, so any job count gives the
// same records.
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { loadGame } from './game.mjs';
import { playRun } from './driver.mjs';

export function defaultJobs() { return Math.max(1, Math.min(os.cpus().length, 8)); }

export function runSerial(tasks, onProgress) {
  const G = loadGame();
  return tasks.map((cfg, i) => {
    let rec;
    try { rec = playRun(G, cfg); } catch (e) { rec = { error: String((e && e.stack) || e), pair: cfg.heroes.join(','), seed: cfg.seed, trial: cfg.trial, result: 'error', fights: [], picks: [] }; }
    if (onProgress) onProgress(i + 1, tasks.length);
    return rec;
  });
}

export function runPool(tasks, jobs, onProgress) {
  if (jobs <= 1 || tasks.length <= 1) return Promise.resolve(runSerial(tasks, onProgress));
  const n = Math.min(jobs, tasks.length);
  const out = new Array(tasks.length);
  let next = 0, done = 0;
  return new Promise((resolve, reject) => {
    const workers = [];
    const finish = () => { workers.forEach((w) => w.terminate()); resolve(out); };
    for (let k = 0; k < n; k++) {
      const w = new Worker(new URL('./worker.mjs', import.meta.url));
      workers.push(w);
      const feed = () => {
        if (next >= tasks.length) return;
        const id = next++;
        w.postMessage({ id, cfg: tasks[id] });
      };
      w.on('message', (m) => {
        if (m.ready) { feed(); return; }
        const cfg = tasks[m.id];
        out[m.id] = m.error ? { error: m.error, pair: cfg.heroes.join(','), seed: cfg.seed, trial: cfg.trial, result: 'error', fights: [], picks: [] } : m.rec;
        done += 1;
        if (onProgress) onProgress(done, tasks.length);
        if (done === tasks.length) finish(); else feed();
      });
      w.on('error', (e) => { workers.forEach((x) => x.terminate()); reject(e); });
    }
  });
}

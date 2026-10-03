// Inkwoven balance bot: runs a list of run configs, in this process (jobs <= 1) or across worker threads. Results come back in
// the order of the task list whatever the number of workers, and a run is a pure function of its config, so any job count gives the
// same records.
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { loadGame } from './game.mjs';
import { playRun } from './driver.mjs';

export function defaultJobs() { return Math.max(1, Math.min(os.cpus().length, 8)); }
// Heap cap of one worker thread (MB), passed as resourceLimits. A worker holds one booted game and one run at a time (about 150 MB resident),
// so this is a safety net against a runaway, not a working size. NOTE: on the Node builds checked so far (22.x) a worker's resourceLimits are
// NOT reliably enforced, but `node --max-old-space-size=N tools/rogue_book/bot.mjs ...` is, and a worker that hits it dies alone (see runPool).
// Long jobs should always be started with that flag. BOT_WORKER_MB overrides the number here.
export function workerHeapMb() { const v = parseInt(process.env.BOT_WORKER_MB, 10); return v > 0 ? v : 1536; }

// onRecord(i, rec) fires as each run finishes (completion order, i is the index in the task list): the CLI uses it to stream results to
// a file, so a long balance run that is killed half way keeps everything it had finished.
export function runSerial(tasks, onProgress, onRecord) {
  const G = loadGame();
  return tasks.map((cfg, i) => {
    let rec;
    try { rec = playRun(G, cfg); } catch (e) { rec = { error: String((e && e.stack) || e), pair: cfg.heroes.join(','), seed: cfg.seed, trial: cfg.trial, result: 'error', fights: [], picks: [] }; }
    if (onRecord) onRecord(i, rec);
    if (onProgress) onProgress(i + 1, tasks.length);
    return rec;
  });
}

// opts.worker (a URL or path) replaces the worker script: the tests use it to make a worker die on purpose.
export function runPool(tasks, jobs, onProgress, onRecord, opts) {
  if (!tasks.length) return Promise.resolve([]);
  if (jobs <= 1 || tasks.length <= 1) return Promise.resolve(runSerial(tasks, onProgress, onRecord));
  const n = Math.min(jobs, tasks.length);
  const out = new Array(tasks.length);
  let next = 0, done = 0, respawns = 0;
  const errRec = (cfg, error) => ({ error, pair: cfg.heroes.join(','), seed: cfg.seed, trial: cfg.trial, result: 'error', fights: [], picks: [] });
  return new Promise((resolve, reject) => {
    const workers = new Set();
    let finished = false;
    const finish = () => { if (finished) return; finished = true; workers.forEach((w) => w.terminate()); resolve(out); };
    const record = (id, rec) => {
      out[id] = rec;
      if (onRecord) onRecord(id, rec);
      done += 1;
      if (onProgress) onProgress(done, tasks.length);
    };
    const spawn = () => {
      const w = new Worker((opts && opts.worker) || new URL('./worker.mjs', import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: workerHeapMb() } });
      workers.add(w);
      let cur = -1;
      const feed = () => {
        if (next >= tasks.length) { cur = -1; return; }
        cur = next++;
        w.postMessage({ id: cur, cfg: tasks[cur] });
      };
      w.on('message', (m) => {
        if (m.ready) { feed(); return; }
        record(m.id, m.error ? errRec(tasks[m.id], m.error) : m.rec);
        if (done === tasks.length) finish(); else feed();
      });
      // a worker that dies (for example by hitting its heap cap) costs only the run it was playing: that run is recorded as an error and a
      // replacement worker takes over, so one runaway never kills a long job (a few respawns are allowed, then the job stops)
      const died = (e) => {
        if (!workers.has(w) || finished) return;
        workers.delete(w);
        if (cur >= 0 && !out[cur]) record(cur, errRec(tasks[cur], 'worker died: ' + String((e && e.message) || e)));
        if (done === tasks.length) { finish(); return; }
        if (respawns++ < 8 && next < tasks.length) spawn(); else if (!workers.size) reject(e instanceof Error ? e : new Error(String(e)));
      };
      w.on('error', died);
      w.on('exit', (code) => died(new Error('worker exited with code ' + code)));
    };
    for (let k = 0; k < n; k++) spawn();
  });
}

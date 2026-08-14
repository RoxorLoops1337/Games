// FROSTFELL — a fixed pool of pilots.
//
// The probe is the slowest thing in `npm run check` and most arms in it are the
// same shape: play N runs, count what happened. Those are independent, so they
// can run on as many threads as the box has.
//
// Three things make this pay, and all three were measured before they were
// written:
//
//   1. WORKERS ARE REUSED. Loading the game costs ~200ms of eval per thread and
//      a single job is often less work than that. The pool spawns once and keeps
//      the threads alive for the whole call.
//   2. HALF THE CORES, NOT ALL OF THEM. See JOBS below — `cores - 1` is
//      measurably worse than `cores / 2` on the box this was built on.
//   3. THE POOL IS OPTIONAL. `FF_JOBS=1` runs every job inline on this thread,
//      with no worker, no clone and no scheduling. A parallel path that cannot
//      be turned off is one nobody can bisect when an arm disagrees with itself.
//
// WHAT AN ARM MUST SATISFY TO USE IT. Runs must be independent (they are — the
// seed is the only input), and everything the arm reads afterwards must come
// home. The second half is the one that bites: the pilot fills thirteen
// module-level counters as it plays and the tables at the bottom of the probe
// read them expecting to see every run the probe ever did. So the pool absorbs
// each worker's counters exactly once, after its last job, and the run suite
// asserts inline and pooled produce identical counters. An arm whose jobs are
// wildly unequal in size still gains little, because it finishes at the pace of
// its longest job either way.
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { playRun, snapshot, absorb, applyConfig, config } from './frostfell_pilot.mjs';

/* HALF THE CORES, AND THAT IS A MEASUREMENT RATHER THAN A CONVENTION. The
   obvious default is `cores - 1`; on the four-core box this was built on that is
   3, and 3 is measurably worse than 2 — 5.7s against 5.3s on the card arm, with
   4 threads at 7.0s, slower than 2. The main thread is doing work too, every job
   pays structured-clone traffic in both directions, and a pool sized to the core
   count leaves the scheduler nothing to work with. See DESIGN.md for the table. */
export const JOBS = (() => {
  const asked = Number(process.env.FF_JOBS || 0);
  if (asked > 0) return asked;
  return Math.max(1, Math.min(4, Math.floor(((cpus() || []).length || 2) / 2)));
})();

const WORKER = new URL('./frostfell_worker.mjs', import.meta.url);

/** Run `jobs` (each `{tribes, n, base, step, mode, tweak, stats}`) and return one
 *  `{wins, runs, stats}` per job, in the order given. Counters from every worker
 *  are absorbed into this thread before returning, so the caller sees the same
 *  accumulated state it would have seen had it done the work itself.
 *
 *  Falls back to this thread when the pool is off or there is only one job. */
export async function runJobs(jobs) {
  if (JOBS <= 1 || jobs.length <= 1) return jobs.map(inline);
  const cfg = config();
  const out = new Array(jobs.length);
  let next = 0, done = 0;
  const n = Math.min(JOBS, jobs.length);
  const workers = [];
  await new Promise((resolve, reject) => {
    let closing = 0, closed = 0;
    const feed = (w) => {
      if (next >= jobs.length) {
        // this worker is finished: ask for its counters, once
        closing++;
        w.postMessage({ finish: true });
        return;
      }
      const id = next++;
      w.postMessage(Object.assign({ id, config: cfg }, jobs[id]));
    };
    for (let i = 0; i < n; i++) {
      const w = new Worker(WORKER);
      workers.push(w);
      w.on('message', (m) => {
        if (m && m.ready) { feed(w); return; }
        if (m && m.id === -1) {                 // its counters, coming home
          absorb(m.counters);
          if (++closed === closing && done === jobs.length) resolve();
          return;
        }
        if (m.thrown) { reject(new Error('worker: ' + m.thrown)); return; }
        out[m.id] = { wins: m.wins, runs: m.runs, stats: m.stats || [] };
        done++;
        feed(w);
      });
      w.on('error', reject);
    }
  }).finally(() => { for (const w of workers) w.terminate(); });
  return out;
}

function inline(job) {
  applyConfig(job.config);
  let wins = 0, runs = 0;
  const stats = [];
  for (const tribe of job.tribes) {
    for (let i = 0; i < job.n; i++) {
      const st = playRun(tribe, job.base + i * (job.step || 37), job.mode, job.tweak);
      runs++;
      if (st.won) wins++;
      if (job.stats) stats.push(st);
    }
  }
  return { wins, runs, stats };
}

export { snapshot, absorb };

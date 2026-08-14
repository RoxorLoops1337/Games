// FROSTFELL — a fixed pool of pilots.
//
// The probe is the slowest thing in `npm run check` and every arm in it is the
// same shape: play N runs, count the wins. Those are independent, so they can
// run on as many threads as the box has.
//
// Two things make this pay, and both were measured before it was written:
//
//   1. WORKERS ARE REUSED. Loading the game costs ~200ms of eval per thread and
//      a single arm is often less work than that. The pool spawns once and
//      keeps the threads alive for the whole process.
//   2. THE POOL IS OPTIONAL. `FF_JOBS=1` (or a box with two cores) runs every
//      job inline on this thread, with no worker, no clone and no scheduling.
//      A parallel path that cannot be turned off is a parallel path nobody can
//      bisect when an arm disagrees with itself.
//
// It is deliberately NOT wired into every arm. An arm whose jobs are unequal in
// size gains nothing from a pool — it finishes at the pace of its longest job
// either way — and an arm that reads module state the pilot accumulates (which
// card got played, who killed whom) cannot use one at all, because that state
// lives in whichever thread did the work. Only whole-count arms qualify.
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { playRun } from './frostfell_pilot.mjs';

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

/** Run `jobs` (each `{tribes, n, base, step, mode, tweak}`) and return one
 *  `{wins, runs}` per job, in the order given. Falls back to this thread when
 *  the pool is off or there is only one job to do. */
export async function runJobs(jobs) {
  if (JOBS <= 1 || jobs.length <= 1) return jobs.map(inline);
  const out = new Array(jobs.length);
  let next = 0, done = 0;
  const n = Math.min(JOBS, jobs.length);
  const workers = [];
  await new Promise((resolve, reject) => {
    const feed = (w) => {
      if (next >= jobs.length) return;
      const id = next++;
      w.postMessage(Object.assign({ id }, jobs[id]));
    };
    for (let i = 0; i < n; i++) {
      const w = new Worker(WORKER);
      workers.push(w);
      w.on('message', (m) => {
        if (m && m.ready) { feed(w); return; }
        if (m.thrown) { reject(new Error('worker: ' + m.thrown)); return; }
        out[m.id] = { wins: m.wins, runs: m.runs };
        if (++done === jobs.length) resolve();
        else feed(w);
      });
      w.on('error', reject);
    }
  }).finally(() => { for (const w of workers) w.terminate(); });
  return out;
}

function inline(job) {
  let wins = 0, runs = 0;
  for (const tribe of job.tribes) {
    for (let i = 0; i < job.n; i++) {
      const st = playRun(tribe, job.base + i * (job.step || 37), job.mode, job.tweak);
      runs++;
      if (st.won) wins++;
    }
  }
  return { wins, runs };
}

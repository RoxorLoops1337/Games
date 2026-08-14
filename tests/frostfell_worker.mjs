// FROSTFELL — one worker's worth of runs.
//
// It imports the pilot and nothing else, which is the whole reason the pilot
// was lifted out of the probe: importing the probe would run every arm in it.
//
// A job is `{ id, tribes, n, base, step, mode, tweak, config, stats }` and the
// answer is `{ id, wins, runs, stats, counters }`. Everything crosses the thread
// boundary by structured clone, so `tweak` has to be a descriptor — see
// applyTweak in the pilot for why that is a fixed vocabulary and not an escape
// hatch — and `config` carries the switches the arm set before it played.
//
// `counters` is the part that is easy to forget and expensive to get wrong: the
// pilot fills thirteen module-level counters as it plays and every table at the
// bottom of the probe reads them afterwards. Runs done here fill THIS thread's
// copies, so they are snapshotted and sent home to be absorbed. Without that,
// pooling an arm silently subtracts it from a dozen tables and no assertion
// notices.
//
// The worker is stateful on purpose: it loads the game once at import and then
// answers jobs forever. Loading is the expensive part (~200ms of eval), so a
// pool that spawned a worker per job would be slower than doing the work.
import { parentPort } from 'node:worker_threads';
import { playRun, snapshot, applyConfig } from './frostfell_pilot.mjs';

parentPort.on('message', (job) => {
  if (job === null) { parentPort.close(); return; }
  /* COUNTERS COME HOME ONCE PER WORKER, NOT ONCE PER JOB. A worker answers many
     jobs and its counters accumulate across all of them, so reporting them with
     every answer and absorbing each would count the first job once per job that
     followed it. The pool asks for them exactly once, after the last job. */
  if (job.finish) { parentPort.postMessage({ id: -1, counters: snapshot() }); return; }
  let wins = 0, runs = 0, thrown = null;
  const stats = [];
  try {
    applyConfig(job.config);
    for (const tribe of job.tribes) {
      for (let i = 0; i < job.n; i++) {
        const st = playRun(tribe, job.base + i * (job.step || 37), job.mode, job.tweak);
        runs++;
        if (st.won) wins++;
        // Only when asked. A whole-count arm does not want 210 objects back.
        if (job.stats) stats.push(st);
      }
    }
  } catch (e) {
    thrown = (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
  }
  parentPort.postMessage({ id: job.id, wins, runs, stats, thrown });
});
parentPort.postMessage({ ready: true });

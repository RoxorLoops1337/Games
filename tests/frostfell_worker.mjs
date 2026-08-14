// FROSTFELL — one worker's worth of runs.
//
// It imports the pilot and nothing else, which is the whole reason the pilot
// was lifted out of the probe: importing the probe would run every arm in it.
//
// A job is `{ id, tribes, n, base, step, mode, tweak }` and the answer is
// `{ id, wins, runs }`. Both cross the thread boundary by structured clone, so
// `tweak` has to be a descriptor — see applyTweak in the pilot for why that is
// a fixed vocabulary rather than an escape hatch.
//
// The worker is stateful on purpose: it loads the game once at import and then
// answers jobs forever. Loading is the expensive part (~200ms of eval), so a
// pool that spawned a worker per job would be slower than doing the work.
import { parentPort } from 'node:worker_threads';
import { playRun } from './frostfell_pilot.mjs';

parentPort.on('message', (job) => {
  if (job === null) { parentPort.close(); return; }
  let wins = 0, runs = 0, thrown = null;
  try {
    for (const tribe of job.tribes) {
      for (let i = 0; i < job.n; i++) {
        const st = playRun(tribe, job.base + i * (job.step || 37), job.mode, job.tweak);
        runs++;
        if (st.won) wins++;
      }
    }
  } catch (e) {
    thrown = (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
  }
  parentPort.postMessage({ id: job.id, wins, runs, thrown });
});
parentPort.postMessage({ ready: true });

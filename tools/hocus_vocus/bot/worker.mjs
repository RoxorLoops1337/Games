// Echowake balance bot: worker thread. Receives { id, cfg } messages, plays one run each with the real game scripts (booted once per
// worker), and answers { id, rec } or { id, error }. See pool.mjs for the other end.
import { parentPort } from 'node:worker_threads';
import { loadGame } from './game.mjs';
import { playRun } from './driver.mjs';

const G = loadGame();
parentPort.on('message', (m) => {
  if (m === 'exit') { process.exit(0); }
  try {
    parentPort.postMessage({ id: m.id, rec: playRun(G, m.cfg) });
  } catch (e) {
    parentPort.postMessage({ id: m.id, error: String((e && e.stack) || e) });
  }
});
parentPort.postMessage({ ready: true });

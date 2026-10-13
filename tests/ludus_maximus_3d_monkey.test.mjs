// Ludus Maximus 3D: smoke monkey. A short seeded run of the QA monkey (tools/ludus3d_qa_lib.mjs) in headless Chromium at a 390x800 touch viewport with Large text on:
// every screen and tab is opened through the real game.open, audited for overflow, clipped text, 44px tap targets, unnamed controls and unreachable buttons,
// then a few random actions run. Any console error, page error, unhandled rejection or layout finding fails. The long run lives in tools/ludus3d_monkey.mjs.
// SKIPPED (exit 0) when playwright or Chromium is missing.
import { monkey, browserAvailable, stopServer } from '../tools/ludus3d_qa_lib.mjs';
if (!(await browserAvailable())) { console.log('ludus_maximus_3d_monkey: skipped (no Chromium)'); process.exit(0); }
const dog = setTimeout(() => { console.error('FAIL: monkey suite hung'); process.exit(1); }, 175000); dog.unref();
const t0 = Date.now();
const r = await monkey({ vp: 'phone', seed: 11, steps: 3, weeks: 0, glads: 1, quick: true, screens: ['building', 'roster', 'arena', 'market', 'armory', 'more', 'world'], classes: 'lx-large-text' });
stopServer();
const bad = r.findings.filter((f) => f.kind !== 'slow');
for (const f of bad) console.error(`  FAIL: [${f.sev}] ${f.kind} @ ${f.where}: ${f.msg}`);
console.log(`ludus_maximus_3d_monkey: ${r.log.length} steps in ${Math.round((Date.now() - t0) / 1000)}s, ${bad.length} findings, ${r.findings.length - bad.length} informational`);
process.exit(bad.length ? 1 : 0);

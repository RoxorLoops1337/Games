// Ludus Maximus 3D: monkey playtest CLI. Randomised strategies at desktop, phone portrait and phone landscape; writes tools/ludus3d_qa_report.md.
//   node tools/ludus3d_monkey.mjs [--steps 60] [--weeks 2] [--seeds 1,2] [--vp desktop,phone,landscape] [--replay] [--large | --classes 'lx-large-text lx-hc'] [--out tools/ludus3d_qa_report.md]
import { writeFileSync } from 'node:fs';
import { monkey, formatReport } from './ludus3d_qa_lib.mjs';
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const steps = +opt('steps', 60), weeks = +opt('weeks', 2), seeds = opt('seeds', '1').split(',').map(Number), vps = opt('vp', 'desktop,phone,landscape').split(','), out = opt('out', new URL('./ludus3d_qa_report.md', import.meta.url).pathname);
const runs = [], classes = opt('classes', a.includes('--large') ? 'lx-large-text' : '');
for (const vp of vps) for (const seed of seeds) {
  const t0 = Date.now(); process.stdout.write(`monkey ${vp} seed ${seed} ... `);
  const r = await monkey({ vp, seed, steps, weeks, replay: a.includes('--replay'), classes }); r.vp = vp; r.seed = seed; runs.push(r);
  writeFileSync(out, formatReport(runs)); // partial report after every run
  console.log(`${r.findings.length} findings in ${Math.round((Date.now() - t0) / 1000)}s`);
}
writeFileSync(out, formatReport(runs)); console.log('report written to', out);
process.exit(runs.some((r) => r.findings.some((f) => f.sev === 'high')) ? 1 : 0);

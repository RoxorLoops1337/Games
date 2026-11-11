// Graftwork rigs: the POSE ENVELOPE of rig manifest entries, posed by the game's own runtime (graftwork/ui/rig.js), for the auto-fit of
// tools/graftwork_rig_build.py (--fit): the build tool asks how far each limb must reach up into the body, and only ui/rig.js knows the poses.
//
//   node tools/graftwork_rig_pose.mjs --in <entries.json> --out <poses.json>
//     in    { "<key>": { "id": "<character>", "entry": <a manifest rig entry>, "parts": ["legL_up", "torso", ...] } }
//     out   { "<key>": [ { "pose": "<label>", "m": { "<part>": [a, b, c, d, e, f, hx, hs] } } ] }: every part's figure-space matrix (and the hem
//           shear and lift of a cloth part) in every pose of the envelope
// The envelope: the walk on the three floor headings (level and both diagonals the Ward walks), 64 phases of the two-step cycle, at full walk weight
// and at 0.6 (starting and stopping), the idle at eight moments, and the rest pose. The walk pace does not enter a pose (poseRig takes the phase, the
// walk weight and the heading; the pace only changes how fast the phase runs) and mirroring is a negative x scale of the whole figure, so neither
// adds a pose. Writes only the --out file (outside the repo, where the build tool puts it). No em dashes.
import fs from 'node:fs';
import { makeRig, poseRig } from '../graftwork/ui/rig.js';

const args = process.argv.slice(2), opt = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--help' || a === '-h') { console.log('usage: node tools/graftwork_rig_pose.mjs --in <entries.json> --out <poses.json>'); process.exit(0); }
  if (a === '--in' || a === '--out') { opt[a.slice(2)] = args[++i]; continue; }
  console.error('graftwork_rig_pose: unknown option ' + a + ' (see --help)'); process.exit(2);
}
if (!opt.in || !opt.out) { console.error('graftwork_rig_pose: give --in and --out (see --help)'); process.exit(2); }

const HEADS = [[1, 0], [0.886, 0.463], [0.886, -0.463]];
function envelope() {
  const out = [];
  for (const [ux, uy] of HEADS) for (const w of [1, 0.6]) for (let i = 0; i < 64; i++) out.push([`walk ${(i / 32).toFixed(3)} w ${w} heading ${ux},${uy}`, { ph: i / 32, w, t: 0, ux, uy }]);
  for (let i = 0; i < 8; i++) out.push(['idle ' + i, { ph: 0, w: 0, t: i * 0.6, ux: 1, uy: 0 }]);
  out.push(['rest', { ph: 0, w: 0, t: 0, ux: 1, uy: 0, calm: true }]);
  return out;
}
const job = JSON.parse(fs.readFileSync(opt.in, 'utf8')), res = {}, env = envelope(), r4 = (v) => Math.round(v * 1e4) / 1e4;
for (const [key, q] of Object.entries(job)) {
  const rig = makeRig(q.id, q.entry), want = rig.parts.filter((p) => q.parts.includes(p.n));
  res[key] = env.map(([pose, st]) => {
    poseRig(rig, st); const m = {};
    for (const p of want) m[p.n] = [...p.m].map(r4).concat(p.hem === undefined ? [] : [r4(p.hx), r4(p.hs)]);
    return { pose, m };
  });
}
fs.writeFileSync(opt.out, JSON.stringify(res));

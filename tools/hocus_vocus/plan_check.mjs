#!/usr/bin/env node
// Does the re-theme plan (hocus_vocus/plan/HV_*.md) mention every content id? Prints the ids that no plan file contains.
//   node tools/hocus_vocus/plan_check.mjs [--json]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..', '..');
const inv = JSON.parse(execFileSync('node', [path.join(here, 'inventory.mjs'), '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 }));
const dir = path.join(repo, 'hocus_vocus', 'plan');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^HV_.*\.md$/.test(f)) : [];
const text = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const missing = {};
let total = 0, miss = 0;
for (const reg of Object.keys(inv)) {
  if (reg === 'tips') continue;
  for (const r of inv[reg]) {
    total++;
    const re = new RegExp('(^|[^A-Za-z0-9_])' + r.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z0-9_]|$)');
    if (!re.test(text)) { (missing[reg] = missing[reg] || []).push(r.id); miss++; }
  }
}
if (process.argv.includes('--json')) { console.log(JSON.stringify({ files, total, miss, missing })); process.exit(miss ? 1 : 0); }
console.log(`plan files: ${files.join(', ') || '(none)'}\nids checked: ${total}, missing from the plan: ${miss}`);
for (const [reg, ids] of Object.entries(missing)) console.log(`  ${reg} (${ids.length}): ${ids.join(' ')}`);
process.exit(miss ? 1 : 0);

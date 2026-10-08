// Builds tools/levels.json from tools/packs/plan.json (pack order and names) and tools/packs/<id>.jsonl (one puzzle per line).
// Existing lines keep their order so level ids (hard-12...) stay stable; new finds are appended. Usage: node tools/merge_levels.mjs
import fs from 'node:fs';
const plan = JSON.parse(fs.readFileSync('tools/packs/plan.json', 'utf8'));
const out = { plan: [], packs: {} };
const seen = new Set();
for (const p of plan) {
  const f = 'tools/packs/' + p.id + '.jsonl';
  if (!fs.existsSync(f)) continue;
  const list = fs.readFileSync(f, 'utf8').split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l))
    .filter((q) => { const k = q.rows.join(''); if (seen.has(k)) return false; seen.add(k); return true; });
  if (!list.length) continue;
  out.plan.push({ id: p.id, name: p.name });
  out.packs[p.id] = list;
}
fs.writeFileSync('tools/levels.json', JSON.stringify(out));
console.log('levels:', out.plan.map((p) => p.id + ' ' + out.packs[p.id].length + ' (' + [...new Set(out.packs[p.id].map((q) => q.n))].sort((a, b) => a - b).join('/') + ')').join(', '));

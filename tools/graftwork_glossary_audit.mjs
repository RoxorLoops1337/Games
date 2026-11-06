// Lists every glossary term with its definition at n=1 and n=3 (statuses) for a read-through at new-player level.
//   node tools/graftwork_glossary_audit.mjs
import { KEYWORDS, WARD_GLOSSARY, defineTerm } from '../graftwork/ui/tooltips.js';
import { STATUSES } from '../graftwork/data/index.js';
const byName = new Map(Object.values(STATUSES).map((d) => [d.name, d]));
for (const name of Object.keys(KEYWORDS)) {
  const d = byName.get(name);
  if (d) console.log(`${name} [status${d.good === false ? ', bad' : ''}]\n   n=1: ${defineTerm(name, 1)}\n   n=3: ${defineTerm(name, 3)}\n   bare: ${KEYWORDS[name].text}`);
  else console.log(`${name}\n   ${KEYWORDS[name].text}`);
}
console.log('--- ward'); for (const [n, k] of Object.entries(WARD_GLOSSARY)) console.log(`${n}\n   ${k.text}`);

// Coverage report (agent C1): which effect ops, triggers, statuses, keywords etc. used by the data the engine implements.
// node tests/coverage.js [--list]
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const ctx = { console, Math, Date, JSON };
ctx.window = ctx;
ctx.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
vm.createContext(ctx);
const load = f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: path.basename(f) });
const dd = path.join(root, 'src/data');
fs.readdirSync(dd).filter(f => f.endsWith('.js')).sort().forEach(f => load(path.join(dd, f)));
['util', 'content', 'registry', 'card-inst', 'battle', 'battle-ai', 'run', 'rewards', 'map', 'profile', 'shop', 'post', 'nook', 'events-engine'].forEach(n => {
  const f = path.join(root, 'src/engine', n + '.js'); if (fs.existsSync(f)) load(f);
});
fs.readdirSync(path.join(root, 'src/engine')).filter(f => /^ops-.*\.js$/.test(f)).sort().forEach(f => load(path.join(root, 'src/engine', f)));
const SB = ctx.SB; SB.util.quiet = true;
const use = SB.content.scanUsage();
const cats = ['ops', 'triggers', 'statuses', 'keywords', 'targets', 'checks', 'counters', 'actions', 'patterns', 'picks', 'passives', 'conds', 'hazards', 'floorStatuses', 'mods', 'upgradeOps', 'hooks', 'winIf', 'traits', 'flags', 'stats'];
const LIST = process.argv.includes('--list');
let totU = 0, totS = 0;
console.log('category'.padEnd(14) + 'used'.padStart(6) + 'implemented'.padStart(13) + 'missing'.padStart(9));
const missingAll = {};
cats.forEach(cat => {
  const names = Object.keys(use[cat] || {});
  if (!names.length) return;
  const miss = names.filter(n => !SB.content.supported(cat, n));
  totU += names.length; totS += names.length - miss.length;
  missingAll[cat] = miss;
  console.log(cat.padEnd(14) + String(names.length).padStart(6) + String(names.length - miss.length).padStart(13) + String(miss.length).padStart(9));
});
console.log('TOTAL'.padEnd(14) + String(totU).padStart(6) + String(totS).padStart(13) + String(totU - totS).padStart(9) + '  (' + (100 * totS / totU).toFixed(1) + '%)');
console.log('\nUnsupported items (count of uses, first owner):');
Object.keys(missingAll).forEach(cat => missingAll[cat].forEach(n => {
  const u = use[cat][n]; console.log('  ' + cat + ' ' + n + ' x' + u.count + ' (' + (u.owners[0] || '') + ')');
}));
if (LIST) {
  console.log('\nImplemented registries:');
  ['ops', 'triggers', 'checks', 'counters', 'targets', 'statuses', 'keywords'].forEach(k => console.log('  ' + k + ': ' + SB.engine[k].names().length));
}
const v = SB.content.validate();
console.log('\nvalidate: ' + v.errors.length + ' errors, ' + v.warnings.length + ' warnings');

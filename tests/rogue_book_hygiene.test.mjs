// House rules for everything under rogue_book/ and tests/rogue_book_*:
// no em or en dashes anywhere, no Math.random in game code, every script index.html
// lists is a classic script that parses, and utility sanity.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR, scriptFiles } from './rogue_book_lib.mjs';

const t = harness('rogue_book hygiene');
const ROOT = path.join(DIR, '..');
const walk = (d, out = []) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p); } return out; };
const textFiles = walk(DIR).filter((f) => /\.(js|html|css|md|json)$/.test(f))
  .concat(fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.startsWith('rogue_book_')).map((f) => path.join(ROOT, 'tests', f)))
  .concat(fs.existsSync(path.join(ROOT, 'tools', 'rogue_book')) ? walk(path.join(ROOT, 'tools', 'rogue_book')) : []);

t.test('no em or en dashes', () => {
  for (const f of textFiles) {
    const s = fs.readFileSync(f, 'utf8');
    const i = s.search(new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']'));
    t.ok(i < 0, `dash in ${path.relative(ROOT, f)} near "${i >= 0 ? s.slice(Math.max(0, i - 30), i + 30).replace(/\n/g, ' ') : ''}"`);
  }
});
t.test('no Math.random in game code', () => {
  for (const f of walk(path.join(DIR, 'js'))) {
    const s = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    t.ok(!/Math\.random/.test(s), `Math.random in ${path.relative(ROOT, f)} (use U.rng)`);
  }
});
t.test('every existing script parses as a classic script', () => {
  for (const f of scriptFiles()) {
    const p = path.join(DIR, f);
    if (!fs.existsSync(p)) continue;
    try { new Function(fs.readFileSync(p, 'utf8')); } catch (e) { t.ok(false, `${f} does not parse: ${e.message}`); }
  }
  t.ok(true, 'parsed');
});
t.test('U basics', () => {
  const { U } = boot({ only: ['util'] });
  const a = U.rng(7), b = U.rng(7);
  t.eq(a(), b(), 'rng deterministic');
  const r = U.rng(99); r(); r();
  const r2 = U.rng(r.seed());
  t.eq(r(), r2(), 'rng resumable from seed()');
  t.eq(U.roman(3), 'III', 'roman');
  t.eq(U.color.hex(255, 0, 128), '#ff0080', 'colour hex');
  t.ok(U.rng(1).shuffle([1, 2, 3, 4, 5]).length === 5, 'shuffle keeps length');
});
t.test('DATA core loads and heroes validate', () => {
  const { DATA } = boot({ only: ['util', 'data'] });
  const v = DATA.validate('heroes');
  t.eq(v.errors.length, 0, 'heroes valid: ' + v.errors.join('; '));
  t.eq(DATA.LISTS.heroIds.length, 4, 'four heroes');
});
t.done();

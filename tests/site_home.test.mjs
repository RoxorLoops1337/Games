// The home page (root index.html): every game card must point at a folder that exists and has a page to open.
// This is what stands in for the full check when only the home page changed (tools/check-changed.mjs maps index.html here).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.error('  FAIL: ' + m); } };

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const redirects = fs.existsSync(path.join(ROOT, '_redirects')) ? fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8') : '';
const cards = [...html.matchAll(/\{\s*id:\s*'([\w-]+)',\s*href:\s*'([^']+)'/g)].map((m) => ({ id: m[1], href: m[2] }));
ok(cards.length > 20, 'the home page lists its games (' + cards.length + ' cards)');
const seen = new Set();
for (const { id, href } of cards) {
  ok(!seen.has(id), 'card id ' + id + ' is unique'); seen.add(id);
  if (href.startsWith('#')) continue;                                           // an in-page link, nothing to resolve
  const m = /^\/([\w.-]+(?:\/[\w.-]+)*)\/$/.exec(href);                        // /folder/ or /folder/sub/
  if (!m) { ok(false, id + ': href ' + href + ' is not a /folder/ link'); continue; }
  const dir = path.join(ROOT, m[1]);
  ok(fs.existsSync(dir) && fs.statSync(dir).isDirectory(), id + ': folder ' + m[1] + ' exists');
  ok(fs.existsSync(path.join(dir, 'index.html')) || redirects.includes('/' + m[1] + '/'), id + ': ' + m[1] + ' has an index.html (or a redirect)');
}
console.log(`site_home: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

// Writes graftwork/sw-manifest.json: the list of files the offline copy holds, each with a content hash and size, plus one version (sha1 of all of them).
// The service worker (graftwork/sw.js) reads it to download, verify and update the offline copy. Run after ANY change under graftwork/:
//   node tools/graftwork_sw_build.mjs        (tests/graftwork_sw.test.mjs fails while the committed file is stale)
//   node tools/graftwork_sw_build.mjs --check   (exit 1 when stale, writes nothing)
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../graftwork/', import.meta.url));
export const INCLUDE_EXT = new Set(['.html', '.js', '.css', '.json', '.webp', '.png', '.jpg', '.svg', '.woff', '.woff2', '.mp3', '.ogg', '.wav', '.webmanifest', '.ico']);
// dev tools, docs and the files that manage the offline copy itself are never part of it
export const SKIP_DIRS = new Set(['lab', 'design', 'node_modules']);
export const SKIP_FILES = new Set(['sw-manifest.json', 'sw.js', 'sw-logic.js', 'package.json']);
const sha = (b) => createHash('sha1').update(b).digest('hex');

function walk(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out); continue; }
    if (SKIP_FILES.has(e.name) && dir === ROOT.replace(/[\\/]$/, '')) continue;
    if (INCLUDE_EXT.has(extname(e.name).toLowerCase())) out.push(join(dir, e.name));
  }
}
export function buildManifest(root = ROOT) {
  const list = []; walk(root.replace(/[\\/]$/, ''), list);
  const files = {}; let bytes = 0;
  for (const f of list.sort()) {
    const b = readFileSync(f), p = relative(root, f).split(sep).join('/');
    files[p] = { h: sha(b).slice(0, 16), s: b.length }; bytes += b.length;
  }
  const version = sha(Object.entries(files).map(([p, v]) => `${p}:${v.h}`).join('\n')).slice(0, 16);
  return { version, bytes, count: Object.keys(files).length, files };
}
export const serialize = (m) => JSON.stringify(m, null, 1) + '\n';
export const MANIFEST_PATH = join(ROOT, 'sw-manifest.json');

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = serialize(buildManifest()), cur = existsSync(MANIFEST_PATH) ? readFileSync(MANIFEST_PATH, 'utf8') : '';
  if (process.argv.includes('--check')) { if (cur !== text) { console.error('graftwork/sw-manifest.json is stale: run node tools/graftwork_sw_build.mjs'); process.exit(1); } console.log('sw-manifest.json is current'); }
  else { writeFileSync(MANIFEST_PATH, text); const m = JSON.parse(text); console.log(`sw-manifest.json: ${m.count} files, ${(m.bytes / 1048576).toFixed(1)} MB, version ${m.version}`); }
}

#!/usr/bin/env node
// usage: node render.mjs "sheet=mains&w=1600&h=900" out/mains.png   (renders index.html in headless Chromium; prints page errors)
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('/home/user/Games/node_modules/playwright-core');
const [query = 'sheet=all', out = path.join(here, 'out', 'sheet.png')] = process.argv.slice(2);
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
const p = new URLSearchParams(query);
const W = +p.get('w') || 1600, H = +p.get('h') || 900;
const pg = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errs = [];
pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
await pg.goto('file://' + path.join(here, 'index.html') + '?' + query);
await pg.waitForFunction(() => window.__done === true, null, { timeout: 20000 }).catch(() => errs.push('timeout waiting for __done'));
await pg.screenshot({ path: out });
console.log('wrote ' + out + (errs.length ? '\nERRORS:\n' + errs.join('\n') : '\nno errors'));
await b.close();

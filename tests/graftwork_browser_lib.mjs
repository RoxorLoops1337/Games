// Real Chromium for the suites that need a page or pixels: withChromium() serves the repo over http on a free port and launches the browser, and
// says so and returns false when Playwright or Chromium is missing (the suite then skips that check; a node-only machine stays green).
// labVisit() opens the animation lab (graftwork/lab/anim.html) on a scene and hands back what it DID: the controls it built, the readout, the strings
// it drew on the canvas, every request it made and every error it raised, so a suite looks at the page and never at the text of its source.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

export const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.css': 'text/css', '.html': 'text/html' };

export async function withChromium(fn) {
  let chromium = null; const req = createRequire(import.meta.url);
  for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { chromium = req(m).chromium; break; } catch (e) { /* try the next */ } }
  if (!chromium) { console.log('skip: playwright missing'); return false; }
  const srv = http.createServer((q, r) => {
    const f = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'text/html' }); r.end(d); } });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  let br = null;
  try {
    try { br = await chromium.launch(); } catch (e) { console.log('skip: no chromium'); return false; }
    await fn({ br, base: `http://127.0.0.1:${srv.address().port}` });
    return true;
  } finally { if (br) await br.close(); srv.close(); }
}

// Opens the lab on `query` (for example '?scene=rig&who=marrow') and waits until it has built its controls, drawn 30 frames and `ready` (an expression
// evaluated in the page) is true. The result:
//   read()      what the page shows now: ctl (the text of the controls), readout, plant (the walk readout), banner (the visible error banner or ''), drawn
//               (every string the lab put on the canvas), groups (the labels of the select groups), options (every select: [value, text] of each
//               option), titles (the tooltip of each button, by its text)
//   page        the Playwright page, to click or evaluate in; until(expr) waits for an expression of the page to hold (after a click the lab answers a frame later)
//   errors      page errors and console errors; requests: { url, status } of every request
//   close()     closes the page
export async function labVisit(br, base, query, ready = 'true') {
  const page = await br.newPage({ viewport: { width: 1280, height: 720 } }), errors = [], requests = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', (r) => requests.push({ url: r.url().replace(base, ''), status: r.status() }));
  await page.addInitScript(() => {
    window.__drawn = new Set(); const ft = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (s) { window.__drawn.add(String(s)); return ft.apply(this, arguments); };
    window.__frames = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; cb(t); });
  });
  await page.goto(base + '/graftwork/lab/anim.html' + query);
  await page.waitForFunction(`window.__frames > 30 && document.getElementById('ctl').children.length > 0 && (${ready})`, null, { timeout: 60000 });
  const read = () => page.evaluate(() => {
    const el = (id) => document.getElementById(id), banner = el('banner');
    return {
      ctl: el('ctl').textContent, readout: el('read').innerText, plant: el('plant').innerText,
      banner: getComputedStyle(banner).display === 'none' ? '' : banner.innerText,
      drawn: [...window.__drawn], groups: [...document.querySelectorAll('optgroup')].map((o) => o.label),
      options: [...document.querySelectorAll('select')].map((s) => [...s.options].map((o) => [o.value, o.textContent])),
      titles: Object.fromEntries([...document.querySelectorAll('button[title]')].map((b) => [b.textContent.trim(), b.title])),
    };
  });
  return { page, read, errors, requests, until: (expr) => page.waitForFunction(expr, null, { timeout: 60000 }), close: () => page.close() };
}

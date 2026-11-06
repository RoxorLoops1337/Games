// Drop the Bass: untranslated text scan. For da, nl and de it opens the hub tabs, settings, setlist, codex sections, the hint cards, a battle
// (canvas text is captured from fillText/strokeText), the pause sheet and the results screen, collects the visible text and fails when common
// English words from a stoplist show up. Names of gear and proper nouns are on the allow-list (glossary). Skips with exit 0 without Playwright
// (DTB_BROWSER_SKIP=1 too). The three languages run in parallel pages; about 20 s in total.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = (why) => { console.log('drop_the_bass lang browser: SKIPPED (' + why + ')'); process.exit(0); };
if (process.env.DTB_BROWSER_SKIP === '1') skip('DTB_BROWSER_SKIP=1');
let pw = null;
for (const base of [ROOT, '/opt/node-tools', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
  for (const dir of [base, path.join(base, 'node_modules')]) { try { pw = createRequire(path.join(dir, 'x.js'))('playwright'); if (pw && pw.chromium) break; } catch (e) { pw = null; } }
  if (pw) break;
}
if (!pw) skip('playwright not found');

// English function words and UI words that must never appear in a translated screen.
const STOP = ['the', 'and', 'your', 'you', 'with', 'tap', 'pick', 'level', 'upgrade', 'upgrades', 'enemy', 'enemies', 'wave', 'waves', 'coins', 'this', 'that', 'from', 'are', 'not', 'will', 'when', 'next', 'back', 'close', 'buy', 'sell', 'free', 'reward', 'rewards', 'unlock', 'unlocked', 'locked', 'choose', 'select', 'cleared', 'stage', 'turret', 'turrets', 'run', 'new', 'best', 'got', 'get', 'more', 'each', 'every', 'then', 'before', 'after', 'one', 'two', 'three'];
// words that are real words in the language itself (or the same loanword), per language: a stoplist hit on them is not a failure
const OK = {
  da: ['upgrade', 'upgrades', 'for', 'have', 'tap', 'run', 'new', 'best', 'free', 'back', 'one', 'close', 'level', 'get', 'more', 'next', 'stage', 'then', 'after', 'buy'],
  nl: ['upgrade', 'upgrades', 'tap', 'run', 'new', 'best', 'free', 'back', 'level', 'stage', 'close', 'next', 'more', 'get', 'buy', 'one', 'then'],
  de: ['upgrade', 'upgrades', 'will', 'run', 'new', 'best', 'free', 'back', 'level', 'stage', 'close', 'next', 'more', 'get', 'buy', 'one', 'then', 'sell', 'are', 'tap'],
};
// proper nouns and gear names from the glossary: never flagged, even where they contain a stoplist word
const PROPER = ['kick', 'snare', 'hi-hat', 'sub', 'siren', 'arc', 'air', 'vinyl', 'loop', 'cowbell', 'amp', 'choir', 'remix', 'hype', 'combo', 'boss', 'duet', 'studio', 'setlist', 'drop', 'roxorloops', 'jasmin', 'loopy', 'mr. playback', 'endless', 'rush', 'drop the bass', 'the drop'];   // 'The Drop' is a Remix card name that Danish keeps in English

// Keys that are in the code but not yet in a language file show their English fallback until the translator adds them: those texts are "pending"
// and skipped here (tools/dtb_i18n.mjs --stub then makes them visible to the i18n suite instead). Found by reading the t() and tn() literals.
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LIT = "'((?:[^'\\\\]|\\\\.)*)'";
async function pendingPatterns(code) {
  const { default: D } = await import('../drop_the_bass/js/lang/' + code + '.js');
  const out = [], jsDir = path.join(ROOT, 'drop_the_bass/js');
  for (const f of fs.readdirSync(jsDir).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
    const re1 = new RegExp("\\bt\\(\\s*'([a-z0-9_.]+)'\\s*,\\s*" + LIT, 'g'), re2 = new RegExp("\\btn\\(\\s*'([a-z0-9_.]+)'\\s*,[^,]+,\\s*" + LIT + "\\s*,\\s*" + LIT, 'g');
    const add = (k, texts) => { if (k in D) return; for (const x of texts) out.push(new RegExp(esc(x).replace(/\\\{[a-z_0-9]+\\\}/g, '.{0,40}'), 'gi')); };
    for (const m of src.matchAll(re1)) add(m[1], [m[2]]);
    for (const m of src.matchAll(re2)) add(m[1], [m[2], m[3]]);
  }
  return out;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p.startsWith('/api/')) { res.writeHead(204); res.end(); return; }
  fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(d); } });
});
await new Promise((r) => srv.listen(0, r));
let browser;
try { browser = await pw.chromium.launch(); } catch (e) { srv.close(); skip('chromium would not start'); }
const errs = [];

async function scanLang(code) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'en-US' });
  const page = await ctx.newPage();
  const seen = []; // { where, text }
  page.on('pageerror', (e) => errs.push(code + ' PAGEERROR ' + e.message));
  await page.addInitScript(() => {
    window.__cv = new Set();
    const P = CanvasRenderingContext2D.prototype;
    for (const k of ['fillText', 'strokeText']) { const o = P[k]; P[k] = function (s, ...r) { try { if (window.__cv.size < 4000) window.__cv.add(String(s)); } catch (e) { /* ignore */ } return o.call(this, s, ...r); }; }
  });
  await page.goto('http://localhost:' + srv.address().port + '/drop_the_bass/');
  await page.waitForFunction(() => window.__dtbReady, null, { timeout: 15000 });
  const grab = async (where) => {
    const text = await page.evaluate(() => {
      const out = [document.body.innerText];
      for (const n of document.querySelectorAll('[placeholder],[title],[aria-label]')) out.push(n.getAttribute('placeholder') || '', n.getAttribute('title') || '', n.getAttribute('aria-label') || '');
      out.push([...window.__cv].join('\n')); window.__cv.clear();
      return out.join('\n');
    });
    seen.push({ where, text });
  };
  await page.evaluate(async (c) => {
    await __dtb.app.setLangPref(c);
    const a = __dtb.app, p = a.profile, hints = Object.keys((await import('./js/data_story.js')).HINTS);
    p.tutorial.done = true; p.story.intro = true; a.sessionGreeted = true; p.login.lastDay = 99999; p.login.claimedDay = 99999; p.records = 9000; p.diamonds = 900; p.fame = 12; p.name = 'Zoe';
    p.tutorial.hints.lang_offer = true; for (const h of hints) p.tutorial.hints[h] = true;
    for (const w of ['garage', 'busk']) { p.story.worlds[w] = true; p.prog[w].cleared = true; }
    p.seen.bosses = { compressor: true, lowpass: true, silence: true };
    a.openHub('tour');
  }, code);
  await page.waitForTimeout(500);
  await grab('tour');
  for (const [i, n] of [[1, 'studio'], [2, 'band'], [3, 'crates'], [4, 'goals']]) { await page.evaluate((k) => document.querySelectorAll('.tab')[k].click(), i); await page.waitForTimeout(250); await grab(n); }
  await page.evaluate(() => document.querySelectorAll('.tab')[0].click());
  // settings
  await page.evaluate(() => document.querySelector('.iconbtn').click()); await page.waitForTimeout(250); await grab('settings');
  await page.evaluate(() => { document.querySelector('.modal').scrollTop = 99999; }); await grab('settings bottom');
  await page.evaluate(() => document.querySelectorAll('.modal-bg').forEach((e) => e.remove()));
  // codex: every section
  await page.evaluate(async () => { (await import('./js/ui_hub.js')).codexModal(__dtb.app); });
  const nseg = await page.evaluate(() => document.querySelector('.codex-seg').children.length);
  for (let i = 0; i < nseg; i++) { await page.evaluate((k) => document.querySelector('.codex-seg').children[k].click(), i); await grab('codex ' + i); }
  await page.evaluate(() => document.querySelectorAll('.modal-bg').forEach((e) => e.remove()));
  // hint cards
  await page.evaluate(async () => { const m = await import('./js/ui_run.js'); for (const id of ['hint_setlist', 'hint_wardrobe', 'hint_skin_buy', 'hint_studio_scene', 'hint_weekly', 'hint_synergy', 'hint_branch', 'hint_preview', 'hint_reroll', 'hint_bossphase', 'hint_hero_ready', 'fuzz']) m.showHint(__dtb.app, id, () => {}); });
  await grab('hint cards');
  await page.evaluate(() => document.querySelectorAll('.modal-bg').forEach((e) => e.remove()));
  // setlist sheet
  await page.evaluate(() => { __dtb.app.profile.settings.skipSetlist = false; __dtb.app.requestRun({ mode: 'story', world: 'garage', encore: 0 }); });
  await page.waitForTimeout(300); await grab('setlist');
  await page.evaluate(() => { const m = document.querySelector('.modal'); m.scrollTop = 600; }); await grab('setlist mid');
  await page.evaluate(() => { const m = document.querySelector('.modal'); m.scrollTop = 99999; }); await grab('setlist bottom');
  await page.evaluate(() => document.querySelectorAll('.modal-bg').forEach((e) => e.remove()));
  // a battle: canvas text, a selected turret, the pause sheet, how to play, the defeat and results screens
  await page.evaluate(() => { __dtb.app.profile.resume = null; __dtb.app.startRun({ mode: 'story', world: 'garage', encore: 0 }); });
  await page.waitForTimeout(1200); await grab('battle');
  await page.evaluate(() => { const r = __dtb.app.battle.run; r.coins = 3000; for (let i = 0; i < 6; i++) r.deploy(null, { onBeat: false }); const t = r.turrets[0]; if (t) __dtb.app.battle.selected = t.id; });
  await page.waitForTimeout(700); await grab('battle turrets');
  await page.evaluate(async () => { (await import('./js/ui_run.js')).showPause(__dtb.app, __dtb.app.battle); }); await grab('pause');
  await page.evaluate(() => document.querySelectorAll('.modal-bg').forEach((e) => e.remove()));
  await page.evaluate(async () => { (await import('./js/ui_run.js')).showHowTo(__dtb.app); }); await grab('how to play');
  await page.evaluate(() => document.querySelectorAll('.modal-bg').forEach((e) => e.remove()));
  await page.evaluate(() => { const b = __dtb.app.battle, r = b.run; r.cleared = 4; r.wave = 4; r.finish(false); });
  await page.waitForTimeout(3500); await grab('defeat');
  await page.evaluate(() => { [...document.querySelectorAll('.modal .btn')].pop().click(); }); await page.waitForTimeout(900); await grab('results');
  await ctx.close();
  // ---- analyse
  const pending = await pendingPatterns(code);
  const ok = new Set(OK[code]), stop = new Set(STOP.filter((w) => !ok.has(w))), found = new Map();
  for (const { where, text } of seen) {
    let t = text;
    for (const re of pending) t = t.replace(re, ' ');
    t = t.toLowerCase();
    for (const p of [...PROPER].sort((a, b) => b.length - a.length)) t = t.split(p).join(' ');
    for (const m of t.matchAll(/[a-z][a-z'-]*/g)) if (stop.has(m[0])) { const k = found.get(m[0]) || { n: 0, where: new Set(), ctx: t.slice(Math.max(0, m.index - 25), m.index + 30).replace(/\s+/g, ' ') }; k.n++; k.where.add(where); found.set(m[0], k); }
  }
  for (const [w, k] of found) errs.push(code + ': English word "' + w + '" x' + k.n + ' in ' + [...k.where].slice(0, 4).join(', ') + ' (...' + k.ctx + '...)');
  return seen.length;
}

try {
  const counts = await Promise.all(['da', 'nl', 'de'].map((c) => scanLang(c).catch((e) => { errs.push(c + ' TEST ERROR ' + e.message); return 0; })));
  if (counts.some((n) => n < 20)) errs.push('too few screens scanned: ' + counts.join(','));
} catch (e) { errs.push('TEST ERROR ' + e.message); }
await browser.close(); srv.close();
if (errs.length) { console.error('drop_the_bass lang browser FAILED:\n' + errs.join('\n')); process.exit(1); }
console.log('drop_the_bass lang browser: ok');

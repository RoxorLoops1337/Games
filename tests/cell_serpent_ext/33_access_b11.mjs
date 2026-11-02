// 18 accessibility batch 11: the card lock and the sticker prize work without a pointer, the result screen has a screen reader summary
// (stars as one picture, reward rows with their final numbers), a "Bigger buttons" setting, and reduced motion keeps the tab badges and
// the stage curtain still. Browser part skipped without Chromium.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, 'cell_serpent', f), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; };

ok('static: no em dash in the touched files', () => { for (const f of ['a11y_b11.js', 'a11y7.js', 'access.js']) assert.ok(!read(f).includes(String.fromCharCode(8212)), f); assert.ok(!fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').includes(String.fromCharCode(8212))); });

const m = await import('../../cell_serpent/a11y_b11.js');
ok('lock target: only a focused card that has a padlock', () => {
  assert.equal(m.lockTarget([true, true, true], 1), 1);
  assert.equal(m.lockTarget([true, false, true], 1), -1, 'no padlock without a refresh left');
  assert.equal(m.lockTarget([true, true, true], -1), -1, 'no focused card');
  assert.ok(/Kept option 2: Daggers/.test(m.lockSpeech(1, 'Daggers', true)));
  assert.ok(/no longer kept/.test(m.lockSpeech(1, 'Daggers', false)));
});
ok('sticker speech names the sticker, what it is for and where it lives', () => {
  const s = m.stickerSpeech({ name: 'First Gig', hint: 'Play your first run' }, 2);
  assert.ok(/New sticker: First Gig, and 2 more\. Play your first run/.test(s) && /Stats tab/.test(s), s);
  assert.equal(m.stickerSpeech(null, 0), '');
});
ok('result summary: title, ribbon, stars and every reward in one text', () => {
  const t = m.resultSummary({ title: 'STAGE CLEAR!', sub: 'Rusty is down.', stars: 2, rows: ['120 Beats', '3 Ribbons'], ribbon: 'NEW BEST STARS!', goal: 'Unlock a skill' });
  for (const w of ['STAGE CLEAR!', 'New best stars!', 'Rusty is down.', '2 of 3 stars.', 'Rewards: 120 Beats, 3 Ribbons.', 'Next goal: Unlock a skill.']) assert.ok(t.includes(w), w + ' in ' + t);
  const lost = m.resultSummary({ title: 'RUSTY WINS', sub: '', stars: -1, rows: [], ribbon: '', goal: '' });
  assert.ok(!/stars|Rewards|goal/.test(lost), lost);
});
{
  const sim = await import('../../cell_serpent/sim.js');
  ok('the big buttons setting is a boolean in the default save and survives a bad save', () => {
    assert.equal(sim.defaultSave().settings.bigTap, false);
    assert.equal(sim.sanitizeSave({ v: 8, settings: { bigTap: true } }).settings.bigTap, true);
    assert.equal(sim.sanitizeSave({ v: 8, settings: { bigTap: 'yes' } }).settings.bigTap, false);
    assert.equal(sim.sanitizeSave({ v: 8 }).settings.bigTap, false);
  });
}
ok('static: the setting row, the class toggle and the css exist', () => {
  const h = read('index.html');
  assert.ok(/data-k="bigTap"/.test(h) && /html\.bigtap \.tgl/.test(h));
  assert.ok(/classList\.toggle\('bigtap'/.test(read('access.js')));
});

const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('33_access_b11: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 5000, sparkles: 300, cleared: 14, best: 14, runs: 30, eggs: 3, ribbons: 80, xp: 1500, energy: { n: 40, t: 0 }, stars: { 1: 3, 2: 2, 3: 3 } };
    const open = async (vp, extra, settings) => {
      const p = await browser.newPage({ viewport: vp || { width: 390, height: 844 } }); const errs = [];
      p.on('pageerror', e => errs.push(e.message));
      await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, JSON.stringify({ ...SAVE, ...(extra || {}), settings: settings || {} }));
      await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 10000 });
      await p.waitForTimeout(700); return { p, errs };
    };
    const live = p => p.evaluate(() => new Promise(r => setTimeout(() => r(document.getElementById('a11yLive').textContent), 220)));
    try {
      {   // card lock by keyboard
        const { p, errs } = await open();
        await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(3500);
        await p.evaluate(() => { window.CS.g.rerolls = 2; window.CS.g.pending = 1; }); await p.waitForFunction(() => document.querySelector('#levelup.on .card.pick .lockb'), null, { timeout: 6000 }); await p.waitForTimeout(700);
        const lab = await p.evaluate(() => document.querySelector('#cards .card.pick').getAttribute('aria-label'));
        assert.ok(lab.includes(m.LOCK_HINT), 'a lockable card says how to lock it: ' + lab);
        await p.evaluate(() => document.querySelectorAll('#cards .card.pick')[1].focus());
        await p.keyboard.press('l');
        assert.equal(await p.evaluate(() => document.querySelectorAll('#cards .card.pick')[1].classList.contains('kept')), true, 'L keeps the focused card');
        assert.equal(await p.evaluate(() => document.querySelectorAll('#cards .card.pick.kept').length), 1);
        assert.ok(/Kept option 2/.test(await live(p)), 'spoken');
        assert.equal(await p.evaluate(() => window.CS.mode() + ':' + window.CS.g.phase), 'play:levelup', 'L does not pick the card');
        await p.keyboard.press('L');
        assert.equal(await p.evaluate(() => document.querySelectorAll('#cards .card.pick.kept').length), 0, 'L again lets go');
        assert.ok(/no longer kept/.test(await live(p)));
        await p.evaluate(() => document.activeElement.blur()); await p.keyboard.press('l');
        assert.equal(await p.evaluate(() => document.querySelectorAll('#cards .card.pick.kept').length), 0, 'L with no card focused does nothing');
        assert.deepEqual(errs, []); await p.close(); n += 7;
      }
      {   // no refresh left: no hint, L does nothing
        const { p, errs } = await open();
        await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(3500);
        await p.evaluate(() => { window.CS.g.rerolls = 0; window.CS.g.pending = 1; }); await p.waitForFunction(() => document.querySelector('#levelup.on .card.pick'), null, { timeout: 6000 }); await p.waitForTimeout(600);
        assert.equal(await p.evaluate(() => document.querySelectorAll('#cards .lockb').length), 0);
        assert.ok(!(await p.evaluate(() => document.querySelector('#cards .card.pick').getAttribute('aria-label'))).includes('Press L'));
        await p.evaluate(() => document.querySelector('#cards .card.pick').focus()); await p.keyboard.press('l');
        assert.equal(await p.evaluate(() => window.CS.g.phase), 'levelup');
        assert.deepEqual(errs, []); await p.close(); n += 3;
      }
      {   // result is summarised, sticker prize is spoken
        const { p, errs } = await open();
        await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(3500);
        await p.evaluate(() => window.CS.force('dead')); await p.waitForFunction(() => { if (!document.querySelector('#result.on') && document.querySelector('#revive.on')) document.getElementById('rvNo').click(); return document.querySelector('#result.on'); }, null, { timeout: 25000 });
        await p.waitForTimeout(500);
        const r = await p.evaluate(() => ({ d: document.getElementById('result').getAttribute('aria-describedby'), sum: (document.getElementById('a11yResSum') || {}).textContent, rows: [...document.querySelectorAll('#rList .r')].map(e => [e.getAttribute('role'), e.getAttribute('aria-label')]), list: document.getElementById('rList').getAttribute('aria-label') }));
        assert.equal(r.d, 'a11yResSum'); assert.ok(/Rewards: .*Beats/.test(r.sum), r.sum);
        assert.ok(r.rows.length >= 1 && r.rows.every(x => x[0] === 'img' && x[1] && !/undefined/.test(x[1])), JSON.stringify(r.rows));
        assert.ok(!/\+/.test(r.sum), 'no raw plus signs: ' + r.sum);
        assert.equal(r.list, 'Rewards');
        // a prize card: spoken once, hidden from the tree
        await p.evaluate(() => { const e = document.createElement('div'); e.className = 'sp10'; e.setAttribute('role', 'status'); e.innerHTML = '<span class="sp10t"><small>NEW STICKER</small><b>First Gig</b></span>'; document.body.appendChild(e); });
        const said = await live(p); assert.ok(/New sticker: First Gig\. Play your first run/.test(said), said);
        assert.equal(await p.evaluate(() => document.querySelector('.sp10').getAttribute('aria-hidden')), 'true');
        assert.deepEqual(errs, []); await p.close(); n += 7;
      }
      {   // bigger buttons: a real setting, saved, bigger targets
        const { p, errs } = await open({ width: 360, height: 640 });
        const key = '#settings .tgl[data-k="bigTap"]', h = () => p.evaluate(k => document.querySelector(k).getBoundingClientRect().height, key);
        await p.evaluate(() => document.getElementById('setBtnT').click()); await p.waitForTimeout(700); await p.evaluate(() => window.CS.fold.openAll()); await p.waitForTimeout(100);   // b12r: settings groups open
        assert.ok(await h() > 0, 'the row exists');
        await p.evaluate(k => document.querySelector(k).click(), key); await p.waitForTimeout(300);
        assert.equal(await p.evaluate(() => document.documentElement.classList.contains('bigtap')), true);
        assert.ok(await h() >= 52, 'the row is at least 52px: ' + await h());
        assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('cell_serpent_save_v1')).settings.bigTap), true, 'saved');
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');
        await p.evaluate(() => document.getElementById('setClose').click()); await p.waitForTimeout(600);
        await p.evaluate(() => window.CS.openHub('Battle')); await p.waitForTimeout(500);
        const small = await p.evaluate(() => [...document.querySelectorAll('#hub button')].filter(b => { const r = b.getBoundingClientRect(); return b.getClientRects().length && r.height > 0 && r.height < 44 && r.top > 0 && r.bottom < innerHeight; }).map(b => (b.id || b.className) + ':' + Math.round(b.getBoundingClientRect().height)));
        console.log('hub buttons under 44px with bigger buttons on:', small.join(' ') || 'none');
        await p.reload(); await p.waitForFunction(() => window.CS && window.CS.R); await p.waitForTimeout(500);
        assert.equal(await p.evaluate(() => document.documentElement.classList.contains('bigtap')), true, 'still on after a reload');
        assert.deepEqual(errs, []); await p.close(); n += 7;
      }
      {   // reduced motion: tab badges and the curtain stay still
        const { p, errs } = await open(null, null, { reduceMotion: true });
        const motion = () => p.evaluate(() => document.getAnimations().filter(a => { const t = a.effect && a.effect.target, tm = a.effect && a.effect.getComputedTiming(); return t && t.closest && t.closest('.tabs,#curtain10') && a.playState === 'running' && (tm.iterations === Infinity || tm.duration > 60); }).map(a => (a.effect.target.className || a.effect.target.tagName) + ':' + (a.animationName || a.id)).slice(0, 8));
        for (const tab of ['Battle', 'Skills', 'Pets', 'Gear', 'Shop', 'Stats']) {
          await p.evaluate(t => window.CS.openHub(t), tab); await p.waitForTimeout(900);
          assert.deepEqual(await motion(), [], tab + ': tab bar motion with reduce motion');
        }
        await p.evaluate(() => { document.querySelector('.tabs [data-tab="Stats"]').classList.add('lnewhit'); }); await p.waitForTimeout(100);
        assert.deepEqual(await motion(), [], 'the Stats hop is instant');
        await p.evaluate(() => window.CS.openHub('Battle')); await p.waitForTimeout(500);
        await p.evaluate(() => document.getElementById('stGo').click()); await p.waitForTimeout(150);
        assert.equal(await p.evaluate(() => !!document.getElementById('curtain10')), false, 'no curtain with reduce motion');
        assert.deepEqual(errs, []); await p.close(); n += 9;
      }
    } finally { await browser.close(); srv.close(); }
  } else srv.close();
} else console.log('33_access_b11: browser part skipped, no playwright');
console.log(`33_access_b11: ${n} checks ok`);

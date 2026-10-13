// Ludus Maximus 3D: UI accessibility and recovery suite (headless Chromium, swiftshader). Keyboard (Esc closes only the top dialog, Tab trap, arrow keys),
// screen reader labels, text size really scales every screen, high contrast, reduced motion, ultimate cooldown cues, and the damaged-save recovery dialog.
// SKIPPED (exit 0) when playwright or Chromium is missing.
import { createRequire } from 'node:module';
import { launch, browserAvailable, stopServer, openScreen, closeAll, settle, gid } from '../tools/ludus3d_qa_lib.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
if (!(await browserAvailable())) { console.log('ludus_maximus_3d_ui: skipped (no Chromium)'); process.exit(0); }
const dog = setTimeout(() => { console.error('FAIL: ui suite hung'); process.exit(1); }, 170000); dog.unref();
const press = async (h, k, n = 1) => { for (let i = 0; i < n; i++) await h.page.keyboard.press(k); await h.page.waitForTimeout(40); };
const scrims = (h) => h.page.evaluate(() => document.querySelectorAll('.lx-scrim:not(.lx-out)').length);

// ---------------------------------------------------------------- game with a roster
{
  const h = await launch({ vp: 'desktop' });
  await h.page.evaluate(() => { const g = window.__LM3D.game, LM = globalThis.LM, S = g.S; if (!S.glads.length) S.glads.push(LM.makeGlad({ id: S.nextId++, style: 'murmillo', lvl: 4 })); S.flags.tut = { v: 1, done: 1 }; try { g.tutorial.skip(); } catch (e) { /* none */ } g.refresh(); });
  // HUD labels
  const hud = await h.page.evaluate(() => ({ gold: document.querySelector('.lx-c-gold').getAttribute('aria-label'), fame: document.querySelector('.lx-c-fame').getAttribute('aria-label'), week: document.querySelector('.fv-week').getAttribute('aria-label'), adv: document.querySelector('[data-tut=advance]').getAttribute('aria-label'), region: document.querySelector('.lx-hud').getAttribute('aria-label'), cur: document.querySelector('.lx-nav [aria-current]') && document.querySelector('.lx-nav [aria-current]').textContent }));
  ok(/^Gold \d+/.test(hud.gold) && /^Fame \d+/.test(hud.fame), 'HUD counters have screen reader labels: ' + JSON.stringify(hud));
  ok(/^Season \d+, week \d+/.test(hud.week) && /^Advance week/.test(hud.adv) && hud.region, 'week chip, advance button and HUD region are labelled');
  ok(hud.cur === 'Ludus', 'the bottom nav marks the current item');

  // dialog semantics
  await openScreen(h, 'more', { tab: 'settings' });
  const dlg = await h.page.evaluate(() => { const s = document.querySelector('.lx-scrim:not(.lx-out) .lx-sheet'), id = s.getAttribute('aria-labelledby'); return { role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'), title: id && document.getElementById(id) && document.getElementById(id).textContent }; });
  ok(dlg.role === 'dialog' && dlg.modal === 'true' && dlg.title === 'More', 'dialogs are labelled by their title: ' + JSON.stringify(dlg));
  // focus lands inside the dialog
  ok(await h.page.evaluate(() => !!document.activeElement.closest('.lx-scrim')), 'focus moves into the dialog');
  // Tab trap
  await press(h, 'Tab', 60);
  ok(await h.page.evaluate(() => !!document.activeElement.closest('.lx-scrim:not(.lx-out)')), 'Tab never leaves the top dialog (60 presses)');
  await press(h, 'Shift+Tab', 60);
  ok(await h.page.evaluate(() => !!document.activeElement.closest('.lx-scrim:not(.lx-out)')), 'Shift+Tab never leaves the top dialog');
  // arrow keys between the tab buttons
  await h.page.evaluate(() => { const t = [...document.querySelectorAll('.lx-scrim:not(.lx-out) .ax-tab')]; t[0].focus(); });
  await press(h, 'ArrowRight');
  const second = await h.page.evaluate(() => document.activeElement.textContent);
  ok(second === 'Honors', 'ArrowRight moves focus to the next tab (got ' + second + ')');
  await press(h, 'ArrowLeft');
  ok((await h.page.evaluate(() => document.activeElement.textContent)) === 'Ludus', 'ArrowLeft moves back');
  await press(h, 'ArrowDown');
  ok(await h.page.evaluate(() => document.activeElement.closest('.ax') && document.activeElement.tagName === 'BUTTON' && !document.activeElement.classList.contains('ax-tab')), 'ArrowDown moves from the tabs into the content');
  // Esc closes only the top of two stacked dialogs
  await h.page.evaluate(() => { window.__ask = window.__LM3D.game.ask({ title: 'Stack test', body: 'Top dialog', actions: [{ label: 'Fine', value: 'x' }], dismiss: 'esc' }); });
  await h.page.waitForTimeout(350); ok((await scrims(h)) === 2, 'two dialogs stacked');
  await press(h, 'Escape'); await h.page.waitForTimeout(350);
  const left = await h.page.evaluate(async () => ({ n: document.querySelectorAll('.lx-scrim:not(.lx-out)').length, v: await window.__ask, title: (document.querySelector('.lx-scrim:not(.lx-out) .lx-title') || {}).textContent }));
  ok(left.n === 1 && left.v === 'esc' && left.title === 'More', 'Escape closes only the top dialog and resolves it with its dismiss value: ' + JSON.stringify(left));
  await press(h, 'Escape'); await h.page.waitForTimeout(350); ok((await scrims(h)) === 0, 'a second Escape closes the screen');

  // text size: zoom scales px-based screens too. Compare a hard coded px font (profile meter labels) and a var based one
  const gidv = await gid(h);
  await openScreen(h, 'profile', gidv); await settle(h);
  const measure = () => h.page.evaluate(() => { const f = (sel) => { const e = document.querySelector('.lx-scrim:not(.lx-out) ' + sel); if (!e) return 0; const r = e.getBoundingClientRect(); return r.height || 0; }; const fs = (sel) => { const e = document.querySelector('.lx-scrim:not(.lx-out) ' + sel); if (!e) return 0; return parseFloat(getComputedStyle(e).fontSize) * (e.getBoundingClientRect().height / (e.offsetHeight || 1)); }; return { meterLabel: fs('.pf-m'), derivedLabel: fs('.pf-dc span'), sub: fs('.ax-sub, .pf-style'), h: f('.pf-hero') }; });
  const a = await measure(); await h.page.evaluate(() => document.body.classList.add('lx-large-text')); await h.page.waitForTimeout(100); const b = await measure();
  ok(a.meterLabel > 0 && b.meterLabel / a.meterLabel >= 1.1, `hard coded px text scales with Large text (${a.meterLabel} -> ${b.meterLabel})`);
  ok(a.h > 0 && b.h > a.h * 1.05, `the profile hero grows with Large text (${a.h} -> ${b.h})`);
  const ov = await h.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); ok(ov, 'Large text does not create horizontal page scroll');
  await h.page.evaluate(() => document.body.classList.remove('lx-large-text')); await closeAll(h);

  // high contrast through the real toggle, persisted in prefs
  await openScreen(h, 'more', { tab: 'settings' });
  await h.page.evaluate(() => { const sw = [...document.querySelectorAll('.lx-scrim:not(.lx-out) .ax-switch')].find((x) => x.getAttribute('aria-label') === 'High contrast'); sw.click(); });
  await h.page.waitForTimeout(80);
  const hc = await h.page.evaluate(() => ({ cls: document.body.classList.contains('lx-hc'), pref: JSON.parse(localStorage.getItem('ludus_maximus_3d_prefs') || '{}').hc, bg: getComputedStyle(document.querySelector('.lx-scrim:not(.lx-out) .lx-sheet')).backgroundColor, opt: window.__LM3D.game.S.opts.hc }));
  ok(hc.cls && hc.pref === true && hc.opt === true, 'High contrast toggle sets the body class and stores the pref in prefs and in the save: ' + JSON.stringify(hc));
  ok(/rgb\(11, 8, 22\)/.test(hc.bg), 'High contrast sheets are flat and dark (' + hc.bg + ')');
  await h.page.evaluate(() => { const sw = [...document.querySelectorAll('.lx-scrim:not(.lx-out) .ax-switch')].find((x) => x.getAttribute('aria-label') === 'High contrast'); sw.click(); });
  ok(!(await h.page.evaluate(() => document.body.classList.contains('lx-hc'))), 'High contrast turns off again');
  // the on/off state is also text, not only colour and knob position
  const txt = await h.page.evaluate(() => [...document.querySelectorAll('.lx-scrim:not(.lx-out) .ax-switch')].every((s) => /^(ON|OFF)$/.test((s.querySelector('.ax-sw-t') || {}).textContent)));
  ok(txt, 'every switch shows ON or OFF as text'); await closeAll(h);

  // reduced motion: no running finite or infinite UI animation longer than a blink, on every screen
  await h.page.evaluate(() => document.body.classList.add('lx-reduce-motion'));
  let busy = [];
  for (const id of ['building', 'roster', 'recruit', 'arena', 'market', 'armory', 'more', 'world']) {
    if (!(await openScreen(h, id))) continue; await h.page.waitForTimeout(150);
    const bad = await h.page.evaluate(() => document.getAnimations().filter((x) => { const t = x.effect && x.effect.target; const ct = x.effect && x.effect.getComputedTiming(); return t && t.closest && t.closest('#ui, .lx-scrim') && x.playState === 'running' && ct.activeDuration > 50; }).map((x) => (x.animationName || x.transitionProperty || 'anim') + '@' + (x.effect.target.className && x.effect.target.className.baseVal === undefined ? x.effect.target.className : 'svg')).slice(0, 4));
    if (bad.length) busy.push(id + ': ' + bad.join(','));
    await closeAll(h);
  }
  ok(busy.length === 0, 'Reduced motion leaves no running UI animation: ' + busy.join(' | '));
  await h.page.evaluate(() => document.body.classList.remove('lx-reduce-motion'));

  // ultimate cooldown ring: text and label cues, not colour alone
  const ring = await h.page.evaluate(async () => { const U = await import('/ludus_maximus_3d/js/ui_kit.js'); const b = U.cooldownRing({ ult: 'meteor', color: '#e8742a', size: 72, hotkey: 'Q' }); document.body.append(b); const out = {}; b.set(0); out.ready = { label: b.getAttribute('aria-label'), text: b.querySelector('.lx-ult-sec').textContent, disabled: b.disabled }; b.set(0.5, 5); out.cool = { label: b.getAttribute('aria-label'), text: b.querySelector('.lx-ult-sec').textContent, disabled: b.disabled }; b.remove(); return out; });
  ok(ring.ready.text === 'GO' && /ready$/.test(ring.ready.label) && !ring.ready.disabled, 'ready ultimate says GO and is labelled ready: ' + JSON.stringify(ring.ready));
  ok(ring.cool.text === '5' && /ready in 5 seconds/.test(ring.cool.label) && ring.cool.disabled, 'cooling ultimate shows seconds and a spoken label: ' + JSON.stringify(ring.cool));
  ok(h.F.list.filter((f) => f.sev === 'high').length === 0, 'no console errors or page errors: ' + JSON.stringify(h.F.list.filter((f) => f.sev === 'high').slice(0, 3)));
  await h.browser.close();
}

// ---------------------------------------------------------------- damaged save: recovery dialog instead of a dead title
{
  const h = await launch({ vp: 'phone', query: 'tier=low&manual=1', noBoot: true, init: "try { localStorage.setItem('ludus_maximus_3d_v1', '{\"v\":1,\"plots\":[null,null,'); } catch (e) {}" });
  await h.page.waitForSelector('.lx-scrim:not(.lx-out) .lx-sheet', { timeout: 60000 });
  const d = await h.page.evaluate(() => ({ title: document.querySelector('.lx-scrim:not(.lx-out) .lx-title').textContent, btns: [...document.querySelectorAll('.lx-scrim:not(.lx-out) .lx-actions .lx-btn')].map((b) => b.textContent.trim()) }));
  ok(d.title === 'Save damaged' && d.btns.some((t) => /Start fresh/.test(t)) && d.btns.some((t) => /repair/i.test(t)) && d.btns.some((t) => /Download/.test(t)), 'a damaged save opens the recovery dialog: ' + JSON.stringify(d));
  await h.page.waitForTimeout(400);
  await h.page.evaluate(() => [...document.querySelectorAll('.lx-scrim:not(.lx-out) .lx-actions .lx-btn')].find((b) => /repair/i.test(b.textContent)).click());
  await h.page.waitForTimeout(500);
  const again = await h.page.evaluate(() => (document.querySelector('.lx-scrim:not(.lx-out) .lx-title') || {}).textContent);
  ok(again === 'Save damaged', 'a save that cannot be repaired keeps the dialog open instead of crashing (' + again + ')');
  await h.page.evaluate(() => [...document.querySelectorAll('.lx-scrim:not(.lx-out) .lx-actions .lx-btn')].find((b) => /Start fresh/.test(b.textContent)).click());
  await h.page.waitForFunction(() => !document.querySelector('.lx-scrim:not(.lx-out)') && document.querySelector('.lx-ttl'), null, { timeout: 30000 }).catch(() => {});
  const after = await h.page.evaluate(() => ({ title: !!document.querySelector('.lx-ttl'), stash: localStorage.getItem('ludus_maximus_3d_v1_corrupt'), live: localStorage.getItem('ludus_maximus_3d_v1') }));
  ok(after.title && after.stash && after.stash.startsWith('{"v":1') && after.live === null, 'Start fresh keeps the damaged text aside, clears the live key and shows the title: ' + JSON.stringify({ title: after.title, live: after.live }));
  ok(h.F.list.filter((f) => f.sev === 'high').length === 0, 'recovery produced no errors: ' + JSON.stringify(h.F.list.slice(0, 3)));
  await h.browser.close();
}

// ---------------------------------------------------------------- repairable save: truncated by a full disk comes back
{
  const require = createRequire(import.meta.url); globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  require('../ludus_maximus_3d/core/data.js'); const LM = require('../ludus_maximus_3d/core/sim.js'); require('../ludus_maximus_3d/core/ext.js'); require('../ludus_maximus_3d/core/arena.js');
  const S = LM.newGame({ name: 'Ludus Repaired', color: 1 }); S.glads.push(LM.makeGlad({ id: S.nextId++, style: 'thraex', lvl: 3 })); S.diary = 'z'.repeat(2500);
  const full = JSON.stringify(S), cut = full.slice(0, Math.floor(full.length * 0.93));
  const h = await launch({ vp: 'phone', query: 'tier=low&manual=1', noBoot: true, init: `try { localStorage.setItem('ludus_maximus_3d_v1', ${JSON.stringify(cut)}); } catch (e) {}` });
  await h.page.waitForSelector('.lx-scrim:not(.lx-out) .lx-sheet', { timeout: 60000 }); await h.page.waitForTimeout(400);
  await h.page.evaluate(() => [...document.querySelectorAll('.lx-scrim:not(.lx-out) .lx-actions .lx-btn')].find((b) => /repair/i.test(b.textContent)).click());
  await h.page.waitForFunction(() => document.querySelector('.lx-ttl'), null, { timeout: 30000 }).catch(() => {});
  const r = await h.page.evaluate(() => { let o = null; try { o = JSON.parse(localStorage.getItem('ludus_maximus_3d_v1')); } catch (e) { /* invalid */ } return { title: !!document.querySelector('.lx-ttl'), name: o && o.name, v: o && o.v, sv: o && o.sv, glads: o && o.glads.length }; });
  ok(r.title && r.name === 'Ludus Repaired' && r.v === 1 && r.sv >= 2 && r.glads === 1, 'Try to repair rescues a truncated save, rewrites it valid and continues to the title: ' + JSON.stringify(r));
  ok(h.F.list.filter((f) => f.sev === 'high').length === 0, 'repair produced no errors');
  await h.browser.close();
}
stopServer();
console.log(`ludus_maximus_3d_ui: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

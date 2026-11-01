/* End-to-end headless playthrough. usage: node demo/playthrough.js [--phone] [--clan alley] [--seed X] [--tag name]
 * Needs a static server on :8123 (python3 -m http.server 8123) or pass --file. No em dashes. */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const god = !!flag('god', false), phone = !!flag('phone', false), clan = flag('clan', 'alley'), seed = flag('seed', 'PLAYTEST1'), tag = flag('tag', phone ? 'phone' : 'desk');
const url = flag('file', false) ? 'file:///home/claude/nine-lives/index.html' : 'http://localhost:8123/index.html';
const outDir = '/home/claude/nine-lives/demo/shots/';
const errors = [];
let shotN = 0;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } });
  const pg = await ctx.newPage(); pg.setDefaultTimeout(5000);
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  pg.on('pageerror', e => errors.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
  const shot = async (name) => { const f = `${outDir}${tag}-${String(++shotN).padStart(2, '0')}-${name}.png`; await pg.screenshot({ path: f }); return f; };
  const cur = () => pg.evaluate(() => (SB.ui.current && SB.ui.current.name) || null);
  const wait = (ms) => pg.waitForTimeout(ms);
  const log = (...a) => console.log(...a);
  await pg.goto(url); await wait(1500);
  await pg.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await pg.reload(); await wait(1500);
  if (flag('fast', false)) await pg.evaluate(() => { SB.ui.settings.set('fast', 3); SB.ui.settings.set('reduceMotion', true); });
  log('screen', await cur()); await shot('title');
  // title -> new run
  await pg.click('text=New run'); await wait(400);
  if (await pg.$('text=I know this')) { await pg.click('text=I know this'); await wait(500); }
  log('screen', await cur());
  // new run: drive through steps by clicking first available option
  for (let i = 0; i < 12 && (await cur()) === 'newrun'; i++) {
    await shot('newrun' + i);
    const info = await pg.evaluate((clan) => {
      const t = document.querySelector('.nr-tab.on'); return t ? t.textContent : '';
    }, clan);
    const go = await pg.$('text=Go to the Cellar Door');
    if (go && await go.isEnabled()) { await go.click(); break; }
    // pick something in current step
    const sel = await pg.$$('.clan-tile:not(.locked):not(.sel), .champ:not(.locked):not(.sel), .opt-panel:not(.sel)');
    let picked = false;
    if (info.match(/Main/i)) { const e = await pg.$(`[data-tut="clan:${clan}"]`); if (e) { await e.click(); picked = true; } }
    if (!picked && sel.length) { await sel[0].click(); }
    await wait(150);
    const nx = await pg.$('.nr-foot button:not([disabled]):has-text("Next")');
    if (nx) await nx.click();
    await wait(200);
  }
  await wait(800);
  log('after newrun screen', await cur());
  // story screens
  for (let i = 0; i < 8; i++) {
    const c = await cur(); if (c === 'map') break;
    if (c === 'story') { await shot('story'); const skip = await pg.$('.st-skip'); if (skip) await skip.click(); else await pg.keyboard.press('Enter'); await wait(600); }
    else await wait(300);
  }
  log('screen', await cur()); await shot('map');
  // main loop
  let battles = 0, steps = 0, stuck = 0, lastSig = '', seenTypes = new Set();
  while (steps++ < 400) {
    const c = await cur();
    const sig = c + (await pg.evaluate(() => { const r = SB.ui.flow.run; return r ? r.pos + r.status + r.night : ''; })); if (sig === lastSig && ++stuck > 6) { log('STUCK', sig); await shot('stuck'); break; } if (sig !== lastSig) stuck = 0; lastSig = sig;
    if (god && c !== 'summary' && c !== 'gameover') await pg.evaluate(() => { const r = SB.ui.flow.run; if (r && r.status !== 'over') { r.maxWarmth = Math.max(r.maxWarmth, 300); r.warmth = r.maxWarmth; } });
    if (c === 'map') {
      const info = await pg.evaluate(() => { const r = SB.ui.flow.run; const av = SB.run.availableNodes(r); return { av: av.map(id => [id, r.map.nodes[id].type]), act: r.act, night: r.night, w: r.warmth, status: r.status }; });
      log('MAP', JSON.stringify(info));
      // prefer unseen types
      const order = ['battle', 'shop', 'event', 'post', 'nook', 'treasure', 'mystery', 'elite', 'boss'];
      let pick = info.av.slice().sort((a, b) => (seenTypes.has(a[1]) ? 10 : 0) + order.indexOf(a[1]) - ((seenTypes.has(b[1]) ? 10 : 0) + order.indexOf(b[1])))[0];
      if (!pick) { log('no nodes'); break; }
      if (steps === 2) await shot('map-pick');
      seenTypes.add(pick[1]);
      await pg.click(`[data-node="${pick[0]}"]`, { force: true }); await wait(400);
      { const go = await pg.$('button:has-text("Go here")'); if (go) { await go.click(); await wait(600); } }
      log('entered', pick, '->', await cur());
      continue;
    }
    if (c === 'battle') { const r = await playBattle(); log('battle result', r); battles++; continue; }
    if (c === 'reward') { await doReward(); continue; }
    if (['shop', 'event', 'post', 'nook', 'treasure'].includes(c)) { await doNode(c); continue; }
    if (c === 'story' && flag('story', false)) { await shot('story'); await pg.keyboard.press('Space'); await wait(250); await pg.keyboard.press('Space'); await wait(350); continue; }
    if (c === 'story') { const skip = await pg.$('.st-skip'); if (skip) await skip.click(); else await pg.keyboard.press('Enter'); await wait(500); continue; }
    if (c === 'summary' || c === 'gameover') { await shot(c); log('END at', c); const done = await pg.evaluate(() => SB.ui.flow.run && SB.ui.flow.run.status); log('run status', done); if (c === 'gameover') { const btn = await pg.$('.screen button'); if (btn) { await btn.click(); await wait(600); if ((await cur()) !== 'summary') break; continue; } } break; }
    await wait(300);
  }
  log('ERRORS (' + errors.length + ')'); [...new Set(errors)].forEach(e => log('  ' + e));
  await b.close();

  async function playBattle() {
    await wait(1200); await dismiss();
    await shot('battle-start-' + (await pg.evaluate(() => SB.ui.battle && SB.ui.battle.B.state.round)));
    for (let turn = 0; turn < 60; turn++) {
      if ((await cur()) !== 'battle') return 'left';
      const over = await pg.evaluate(() => SB.ui.battle && SB.ui.battle.B.state.turn);
      if (over === 'over') break;
      { const rd = await pg.evaluate(() => SB.ui.battle.B.state.round); if (rd >= 40) { const dump = await pg.evaluate(() => JSON.stringify({ state: SB.ui.battle.B.state }, null, 1)); require('fs').writeFileSync('/tmp/claude-0/stuck-battle-' + Date.now() + '.json', dump); log('BATTLE TOO LONG, dumped'); return 'toolong'; } }
      { const d = await pg.evaluate(() => { const B = SB.ui.battle.B; return { turn: B.state.turn, phase: B.state.phase, round: B.state.round, playing: SB.ui.battle.isPlaying(), log: (B.state.log || []).slice(-4) }; }); if (d.turn !== 'player' && d.turn !== 'over') { log('NOT PLAYER TURN', JSON.stringify(d)); await shot('notplayer'); await wait(1500); const d2 = await pg.evaluate(() => ({ turn: SB.ui.battle.B.state.turn, playing: SB.ui.battle.isPlaying() })); log('after wait', JSON.stringify(d2)); if (d2.turn !== 'player') return 'HUNG'; } }
      // wait for playback
      for (let k = 0; k < 80 && await pg.evaluate(() => SB.ui.battle && SB.ui.battle.isPlaying()); k++) await wait(100);
      // wake napping cats via the real nap button
      for (let k = 0; k < 6; k++) { const nb = await pg.$('.u-nap.on'); if (!nb) break; await nb.click({ force: true, timeout: 2000 }).catch(() => {}); await wait(150); }
      // play cards through real clicks
      for (let n = 0; n < 12; n++) {
        const plan = await pg.evaluate(() => {
          const B = SB.ui.battle.B, s = B.state; if (s.turn !== 'player') return null;
          const order = s.hand.map((e, i) => i).sort((a, b) => { const na = /nap/i.test((B.cardView(s.hand[a].uid) || {}).name || '') ? 1 : 0, nb = /nap/i.test((B.cardView(s.hand[b].uid) || {}).name || '') ? 1 : 0; return na - nb; });
          for (const i of order) { const e = s.hand[i]; const vv = B.cardView(e.uid); if (/nap/i.test((vv || {}).name || '') && s.floors.every(f => f.cats.every(c => c.napping || true)) && s.round % 4 !== 0) continue; const cp = B.canPlay(e.uid); if (cp.ok && (cp.needsTarget === 'none' || cp.targets.length)) {
            const v = B.cardView ? B.cardView(e.uid) : e.card; if (v && v.cost > s.zoomies && false) continue;
            const t = cp.targets[0] || null; return { i, uid: e.uid, need: cp.needsTarget, t, name: (v || {}).name }; } }
          return null;
        });
        if (!plan) break;
        const cards = await pg.$$('.b-hand > *');
        if (!cards[plan.i]) break;
        await dismiss(); await cards[plan.i].click({ force: true, timeout: 2500 }).catch(e => errors.push('card click ' + e.message.slice(0, 60))); await wait(120);
        if (plan.need === 'floor') { const f = plan.t.floor; await pg.click(`.b-floor[data-floor="${f}"]`, { force: true }).catch(e => errors.push('click floor ' + e.message.slice(0, 80))); }
        else if (plan.need === 'pest' || plan.need === 'cat') { const uid = plan.t.pestUid || plan.t.catUid || plan.t.uid; await pg.click(`.u-hit[data-uid="${uid}"]`, { force: true }).catch(e => errors.push('click unit ' + e.message.slice(0, 80))); }
        else { const pl = await pg.$('.b-prompt button:has-text("Play")'); if (pl) await pl.click({ timeout: 2500 }).catch(() => {}); else await cards[plan.i].click({ force: true, timeout: 2500 }).catch(() => {}); }
        await wait(250);
        for (let k = 0; k < 80 && await pg.evaluate(() => SB.ui.battle && SB.ui.battle.isPlaying()); k++) await wait(100);
      }
      if (turn === 0) await shot('battle-played');
      const st = await pg.evaluate(() => SB.ui.battle.B.state.turn);
      if (st === 'over') break;
      await pg.keyboard.press('e'); await wait(200);
      const cf = await pg.$('.modal button:has-text("End turn"), .modal button:has-text("End Turn"), .dialog button:has-text("End")'); if (cf) await cf.click();
      for (let k = 0; k < 150 && await pg.evaluate(() => SB.ui.battle && SB.ui.battle.isPlaying()); k++) await wait(100);
      if (turn === 1) await shot('battle-turn2');
    }
    const res = await pg.evaluate(() => { const r = SB.ui.battle.B.result(); return r && { outcome: r.outcome, warmth: r.warmth }; });
    await wait(800); await shot('battle-end');
    const cont = await pg.$('.b-endbox button:has-text("Continue")'); if (cont) await cont.click({ force: true, timeout: 2500 }).catch(() => {}); await wait(800);
    return res;
  }
  async function doReward() {
    await wait(1000); await shot('reward');
    const warmBefore = await pg.evaluate(() => SB.ui.flow.run.warmth);
    const info = await pg.evaluate(() => ({ cards: !!document.querySelector('.rw-card'), relic: !!document.querySelector('[data-sec=relic]'), charm: !!document.querySelector('[data-sec=charm]'), champ: !!document.querySelector('[data-sec=champion]') }));
    log('reward', JSON.stringify(info), 'warmth', warmBefore);
    const T = { timeout: 3000 };
    const card = await pg.$('.rw-card .rw-card-tap');
    if (card) { await card.click(T).catch(e => errors.push('rw card ' + e.message.slice(0, 60))); await wait(200); const t = await pg.$('.rw-take:not([disabled])'); if (t) await t.click(T).catch(() => {}); await wait(300); }
    if (info.relic) { const r = await pg.$('[data-sec=relic] .rw-relic'); if (r) { await r.click(T).catch(() => {}); await wait(100); const t = await pg.$('[data-sec=relic] .rw-take:not([disabled])'); if (t) await t.click(T).catch(() => {}); await wait(300); } }
    if (info.champ) { const r = await pg.$('[data-sec=champion] .rw-relic'); if (r) { await r.click(T).catch(() => {}); await wait(300); await shot('champ-tier'); } }
    if (info.charm) { const r = await pg.$('[data-sec=charm] .rw-relic'); if (r) { await r.click(T).catch(() => {}); await wait(400); await shot('charm-deck'); const m = await pg.$('.modal-back .card, .modal .card, .dlg .card'); if (m) await m.click(T).catch(() => {}); await wait(300); } await dismiss(); const sk = await pg.$('[data-sec=charm] button:has-text("Skip")'); if (sk) await sk.click(T).catch(() => {}); }
    await dismiss();
    await shot('reward-done');
    const proceed = await pg.$('.rw-proceed');
    if (proceed) { await proceed.click(T).catch(e => errors.push('proceed ' + e.message.slice(0, 60))); await wait(400); const leave = await pg.$('button:has-text("Leave")'); if (leave) await leave.click(T).catch(() => {}); await wait(700); }
    else await wait(500);
  }
  async function dismiss() { for (let i = 0; i < 3; i++) { const x = await pg.$('.modal-back'); if (!x) return; await pg.keyboard.press('Escape'); await wait(200); } }
  async function doNode(c) {
    const T = { timeout: 2500 };
    await wait(800); await shot(c);
    const all = await pg.$$eval('.screen button', bs => bs.map(b => b.textContent.trim().slice(0, 30) + (b.disabled ? '(dis)' : '')));
    log(c, 'buttons', all.join(' | '));
    if (c === 'event') { const ch = await pg.waitForSelector('.screen .ev-choice:not(.locked)', { timeout: 8000 }).catch(() => null); await shot('event-choices'); if (ch) { await ch.click(T).catch(() => {}); await wait(900); await shot('event-after'); const dr = await pg.$('.rw-card .rw-card-tap'); if (dr) { await dr.click(T).catch(() => {}); await wait(300); } } }
    if (c === 'nook') { const o = await pg.$('.nook-opt[data-opt=curl_up]'); if (o) { await o.click(T).catch(() => {}); await wait(900); await shot('nook-after'); } }
    if (c === 'treasure') { const o = await pg.$('.screen button:has-text("Open")'); if (o) { await o.click(T).catch(() => {}); await wait(900); await shot('treasure-after'); } }
    if (c === 'post') { const o = await pg.$('.screen button:has-text("Scratch")'); if (o) { await o.click(T).catch(() => {}); await wait(700); await shot('post-scratch'); await dismiss(); } }
    if (c === 'shop') { await shot('shop-view'); }
    for (let i = 0; i < 4; i++) {
      await dismiss();
      if ((await cur()) !== c) return;
      const leave = await pg.$('.screen button:has-text("Onward"), .screen button:has-text("Into the fight"), .screen button:has-text("Leave"), .screen button:has-text("Continue"), .screen button:has-text("Done"), .screen button:has-text("Back to the map"), .screen button:has-text("Move on")');
      if (leave) { await leave.click(T).catch(e => errors.push('leave ' + e.message.slice(0, 60))); await wait(600); } else { const btns = await pg.$$('.screen button:not([disabled])'); if (btns.length) await btns[btns.length - 1].click(T).catch(() => {}); await wait(600); }
    }
  }
})().catch(e => { console.error('SCRIPT FAIL', e); process.exit(1); });

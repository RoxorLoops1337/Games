/* Edge-case battle scenarios against the REAL engine and UI. usage: node demo/battle-edge.js [--phone] [scenario ...]
 * scenarios: vacuum vet reddot bath flea vase hand relics surrender (default all). Needs python3 -m http.server 8123. No em dashes. */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const args = process.argv.slice(2);
const phone = args.includes('--phone');
const names = args.filter(a => !a.startsWith('--'));
const url = 'http://localhost:8123/index.html';
const outDir = '/home/claude/nine-lives/demo/shots/';
const tagBase = phone ? 'edgeP' : 'edgeD';
const ALL = ['vacuum', 'vet', 'reddot', 'bath', 'flea', 'vase', 'hand', 'relics', 'surrender'];
const run = names.length ? names : ALL;
(async () => {
  const b = await chromium.launch();
  for (const sc of run) {
    const errors = [];
    const ctx = await b.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } });
    const pg = await ctx.newPage();
    pg.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    pg.on('pageerror', e => errors.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
    let n = 0;
    const shot = async (name) => { const f = `${outDir}${tagBase}-${sc}-${String(++n).padStart(2, '0')}-${name}.png`; await pg.screenshot({ path: f }); };
    const wait = ms => pg.waitForTimeout(ms);
    await pg.goto(url); await wait(1500);
    await pg.evaluate(() => { SB.ui.settings.set('fast', 3); SB.ui.settings.set('reduceMotion', true); window.__evs = {}; });
    await pg.evaluate((x) => { window.__sfx = x; }, process.env.SFX || '');
    const info = await pg.evaluate((sc) => {
      const K = SB.ui.flow;
      const clans = { vacuum: ['alley', 'hearth'], vet: ['hearth', 'moon'], reddot: ['moon', 'mischief'], bath: ['mischief', 'alley'], flea: ['hearth', 'alley'], vase: ['mischief', 'alley'], hand: ['alley', 'hearth'], relics: ['alley', 'moon'], surrender: ['alley', 'hearth'] }[sc];
      const run = SB.run.newRun({ seed: 'EDGE' + sc + (window.__sfx || ''), clan: clans[0], side: clans[1], rank: 0 });
      K.run = run; run.status = 'battle';
      const E = SB.data.encounters;
      const bossOf = (act, id) => JSON.parse(JSON.stringify(E['act' + act].boss.find(e => e.bossId === id)));
      let enc, node = { type: 'battle' }, factory = null;
      if (sc === 'vacuum') { enc = bossOf(2, 'pest_boss_vacuum_mk9'); node = { type: 'boss' }; run.act = 2; }
      else if (sc === 'vet') { enc = bossOf(3, 'pest_boss_vet_carrier'); node = { type: 'boss' }; run.act = 3; }
      else if (sc === 'reddot') { enc = bossOf(3, 'pest_boss_red_dot'); node = { type: 'boss' }; run.act = 3; }
      else if (sc === 'bath') { enc = bossOf(3, 'pest_boss_great_bath'); node = { type: 'boss' }; run.act = 3; }
      else {
        enc = JSON.parse(JSON.stringify(E.act1.prowl[0]));
        if (sc === 'flea') enc.waves = [{ round: 1, spawns: [{ id: 'pest_flea', floor: 1, at: 'back', count: 3 }] }, { round: 3, spawns: [{ id: 'pest_tick', floor: 1, at: 'back', count: 1 }] }];
      }
      if (sc === 'relics') { ['relic_spare_whisker', 'relic_plump_wallet'].forEach(() => 0); const ids = SB.content.relics ? SB.content.relics().slice(0, 6).map(r => r.id) : []; run.relics = ids.map(id => ({ id, counter: 0 })); }
      if (sc === 'vase') factory = true;
      window.__enc = enc; window.__node = node; window.__sc = sc;
      return { enc: enc.id, boss: enc.bossId, relics: (run.relics || []).length };
    }, sc);
    console.log('==', sc, JSON.stringify(info));
    await pg.evaluate((sc) => {
      const run = SB.ui.flow.run;
      const factory = (r, enc, opts) => {
        const B = SB.battle.create(r, enc, opts);
        B.on(e => { window.__evs[e.type] = (window.__evs[e.type] || 0) + 1; });
        if (sc === 'vase') { B.createCard('mischief_wobbly_vase', 2, 'hand'); }
        if (sc === 'hand') { B.drawCards(5); B.createCard('neutral_swat', 3, 'hand'); }
        return B;
      };
      SB.ui.go('battle', { run, encounter: window.__enc, node: window.__node, type: window.__node.type, factory, opts: { seed: 'edge' + sc } });
    }, sc);
    await wait(1500); await shot('start');
    if (sc === 'relics') {
      const rel = await pg.$$('.b-relic'); console.log('relic buttons', rel.length);
      if (rel[0]) { await rel[0].hover({ timeout: 2000 }).catch(() => {}); await wait(400); await shot('tip'); if (phone && rel[0]) { await rel[0].click({ timeout: 2000 }).catch(() => {}); await wait(300); await shot('tip-tap'); } }
    }
    if (sc === 'hand') { const hc = await pg.evaluate(() => SB.ui.battle.B.state.hand.length); console.log('hand size', hc); await shot('hand'); }
    if (sc === 'surrender') {
      await pg.click('button[aria-label="Pause menu"]', { timeout: 3000 }).catch(e => console.log('pause click fail')); await wait(500); await shot('menu');
      const sb = await pg.$('button:has-text("Surrender"), button:has-text("Give up")'); console.log('surrender button', !!sb);
      if (sb) { await sb.click({ timeout: 2000 }).catch(() => {}); await wait(500); await shot('confirm'); await pg.getByRole('button', { name: 'Surrender' }).last().click({ timeout: 2000 }).catch(e => errors.push('surr confirm ' + e.message.slice(0, 50))); await wait(1500); await shot('after'); const c = await pg.$('.b-endbox button:has-text("Continue")'); if (c) await c.click({ timeout: 2000 }).catch(() => {}); await wait(1500); await shot('gameover'); console.log('screen after', await pg.evaluate(() => SB.ui.current && SB.ui.current.name)); }
    } else if (sc !== 'relics') {
      const maxTurns = sc === 'hand' ? 2 : (+process.env.TURNS || 14);
      for (let t = 0; t < maxTurns; t++) {
        const st = await pg.evaluate(() => SB.ui.battle && SB.ui.battle.B.state.turn);
        if (st === 'over' || !st) break;
        await waitIdle(pg);
        { const d = await pg.evaluate(() => { const B = SB.ui.battle.B; return { turn: B.state.turn, phase: B.state.phase, round: B.state.round }; }); if (d.turn !== 'player' && d.turn !== 'over') { console.log('NOT PLAYER', JSON.stringify(d)); await shot('hung'); break; } }
        for (let k = 0; k < 10; k++) {
          const plan = await pg.evaluate(() => {
            const B = SB.ui.battle.B, s = B.state; if (s.turn !== 'player') return null;
            // scratch off parasites
            for (const a of (s.attached || [])) { if (a.host) return { scratch: a.host }; }
            for (let i = 0; i < s.hand.length; i++) { const e = s.hand[i]; const v = B.cardView(e.uid) || {}; if (/nap/i.test(v.name || '')) continue; const cp = B.canPlay(e.uid); if (cp.ok && (cp.needsTarget === 'none' || cp.targets.length)) return { i, need: cp.needsTarget, t: cp.targets[0] || null }; }
            // fragile toys
            for (const f of s.floors) for (const r of f.rooms) if (r.kw && r.kw.fragile) return { knock: r.uid, floor: r.floor };
            return null;
          });
          if (!plan) break;
          if (plan.scratch) { await pg.click(`.u-scratch`, { force: true, timeout: 2000 }).catch(e => errors.push('scratch click ' + e.message.slice(0, 60))); await wait(300); await waitIdle(pg); continue; }
          if (plan.knock) { await pg.click(`.b-room.fragile`, { force: true, timeout: 2000 }).catch(e => errors.push('knock click ' + e.message.slice(0, 60))); await wait(300); await waitIdle(pg); const again = await pg.evaluate(() => 0); await shot('knocked'); continue; }
          const cards = await pg.$$('.b-hand > *');
          await cards[plan.i].click({ force: true, timeout: 2000 }).catch(() => {}); await wait(100);
          if (plan.need === 'floor') await pg.click(`.b-floor[data-floor="${plan.t.floor}"]`, { force: true, timeout: 2000 }).catch(e => errors.push('floor click'));
          else if (plan.need === 'pest' || plan.need === 'cat') await pg.click(`.u-hit[data-uid="${plan.t.pestUid || plan.t.catUid || plan.t.uid}"]`, { force: true, timeout: 2000 }).catch(e => errors.push('unit click'));
          else { const pl = await pg.$('.b-prompt button:has-text("Play")'); if (pl) await pl.click({ timeout: 2000 }).catch(() => {}); }
          await wait(150); await waitIdle(pg);
        }
        if (t === 1 || t === 4) await shot('turn' + t);
        if (sc === 'hand') break;
        const st2 = await pg.evaluate(() => SB.ui.battle.B.state.turn); if (st2 === 'over') break;
        await pg.keyboard.press('e'); await wait(200);
        const cf = await pg.$('.modal button:has-text("End turn")'); if (cf) await cf.click({ timeout: 2000 }).catch(() => {});
        await wait(300); await waitIdle(pg);
      }
      await wait(600); await shot('end');
    }
    const evs = await pg.evaluate(() => window.__evs);
    console.log('events seen', JSON.stringify(evs));
    console.log('screen', await pg.evaluate(() => SB.ui.current && SB.ui.current.name));
    { const ft = await pg.$('.fatal pre'); if (ft) console.log('FATAL', (await ft.textContent()).slice(0, 700)); }
    console.log('errors', errors.length ? [...new Set(errors)].join('\n  ') : 'none');
    await ctx.close();
  }
  await b.close();
  async function waitIdle(pg) { for (let k = 0; k < 200; k++) { const p = await pg.evaluate(() => SB.ui.battle ? SB.ui.battle.isPlaying() : false); if (!p) return; await pg.waitForTimeout(100); } }
})().catch(e => { console.error('SCRIPT FAIL', e); process.exit(1); });

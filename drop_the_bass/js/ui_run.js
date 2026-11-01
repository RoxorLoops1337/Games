// ui_run.js: DOM overlays used during and right after a run: Remix/relic pick, pause, hints, defeat, results, how-to-play.
import { WORLDS, WORLD_BY_ID, BOSSES, ENEMIES, RARITY, RARITY_ORDER, COL, ECON, fmt } from './data_core.js';
import { REMIX, RELICS, WAVE_MODS } from './data_run.js';
import { GEAR } from './data_meta.js';
import * as M from './meta.js';
import { HINTS } from './data_story.js';
import { h, canvasOf, icon, gearIcon, enemyIcon, currencyChip, modal, toast, btn, rarClass, rarName, AE } from './ui_core.js';
import { settingsModal } from './ui_hub.js';

// ------------------------------------------------------------------------------------------------ remix / relic pick
export function showChoice(app, run, battle) {
  const body = h('div');
  const m = modal(body, { sticky: true });
  const kind = run.choice.kind;
  const isRelic = kind === 'chest' || kind === 'boss';
  const draw = () => {
    if (!run.choice) { m.close(); return; }
    body.replaceChildren(
      h('h2', { style: 'color:' + (isRelic ? 'var(--gold)' : 'var(--pink)') }, isRelic ? (kind === 'boss' ? 'Boss Loot! Pick Merch' : 'Chest! Pick Merch') : 'Remix! Level ' + run.level),
      h('div', { class: 'sub', style: 'text-align:center;margin:-4px 0 10px' }, isRelic ? 'Merch is unique and lasts the whole run.' : 'Pick one upgrade for this run. Cards stack.'));
    const picks = h('div', { class: 'picks' });
    run.choice.options.forEach((o, i) => {
      const def = o.type === 'relic' ? RELICS[o.id] : REMIX[o.id];
      const owned = o.type === 'remix' ? (run.remix[o.id] || 0) : 0;
      picks.append(h('button', { class: 'pick rar-b-' + def.rarity, style: 'animation-delay:' + i * 70 + 'ms', onclick: () => { run.pick(i); app.audio.play('remix_pick'); m.close(); battle.choiceOpen = false; } },
        h('div', { class: 'ic', style: 'border:3px solid ' + RARITY[def.rarity].color }, icon(def.glyph, 46, RARITY[def.rarity].color)),
        h('div', { class: 'grow' }, h('div', { class: 'nm' }, def.name + (owned ? '  x' + (owned + 1) : '')), h('div', { class: 'ds' }, def.desc)),
        h('div', { class: 'rar ' + rarClass(def.rarity) }, rarName(def.rarity).toUpperCase())));
    });
    body.append(picks);
    const rr = run.rerolls;
    const canGem = app.profile.diamonds >= ECON.rerollCostDiamonds;
    body.append(h('div', { class: 'btnrow' },
      btn(rr > 0 ? [icon('reroll', 22), 'Reroll (' + rr + ')'] : [icon('diamond', 20), 'Reroll ' + ECON.rerollCostDiamonds], () => {
        if (run.rerolls <= 0) { if (!canGem) { toast('No rerolls left.'); return; } app.spendDiamonds(ECON.rerollCostDiamonds); run.rerolls++; }
        run.rerollChoice(); draw();
      }, rr > 0 || canGem ? 'blue' : 'dark off'),
      btn('Skip +' + (40 + run.wave * 12) + ' coins', () => { run.skipChoice(); m.close(); battle.choiceOpen = false; }, 'dark')));
    app.audio.play('chest');
  };
  draw();
  // chained choices (e.g. boss relic then a remix): re-open when the next one appears
  const watcher = setInterval(() => {
    if (!m.el.isConnected) { clearInterval(watcher); return; }
    if (!run.choice) { m.close(); clearInterval(watcher); }
  }, 200);
}

// ------------------------------------------------------------------------------------------------ pause
export function showPause(app, battle) {
  if (battle.paused) return;
  battle.setPause(true);
  const run = battle.run;
  const body = h('div');
  const m = modal(body, { sticky: true, onClose: () => { battle.setPause(false); } });
  const wm = run.wmId ? WAVE_MODS[run.wmId] : null;
  body.append(h('h2', null, 'Paused'),
    h('div', { class: 'statgrid' }, h('div', null, 'Stage', h('b', null, run.world.name)), h('div', null, 'Wave', h('b', null, run.wave + (run.endless ? '' : '/' + run.wavesTotal))),
      h('div', null, 'Kills', h('b', null, fmt(run.kills))), h('div', null, 'Best combo', h('b', null, run.bestCombo)),
      h('div', null, 'Merges', h('b', null, run.merges)), h('div', null, 'Remix level', h('b', null, run.level))),
    run.relics.length ? h('div', { class: 'row', style: 'flex-wrap:wrap;justify-content:center;margin:6px 0' }, run.relics.map((id) => h('div', { title: RELICS[id].name, style: 'text-align:center;width:70px' }, icon(RELICS[id].glyph, 34, RARITY[RELICS[id].rarity].color), h('div', { class: 'sub', style: 'font-size:10px' }, RELICS[id].name)))) : null,
    Object.keys(run.remix).length ? h('div', { class: 'sub', style: 'font-size:13px;text-align:center' }, Object.entries(run.remix).map(([id, n]) => REMIX[id].name + (n > 1 ? ' x' + n : '')).join(', ')) : null,
    h('div', { class: 'pause-btns', style: 'margin-top:12px' },
      btn('Resume', () => m.close(), 'green big'),
      h('div', { class: 'btnrow', style: 'margin-top:0' }, btn('Settings', () => settingsModal(app), 'dark small'), btn('How to play', () => app.showHowTo(), 'dark small')),
      btn('Quit run', () => {
        const q = modal(h('div', null, h('h2', null, 'Quit this run?'), h('div', { class: 'sub', style: 'text-align:center' }, 'You keep the rewards for the waves you cleared. Stars and stage progress need a win.'),
          h('div', { class: 'btnrow' }, btn('Quit', () => { q.close(); m.close(); battle.setPause(false); app.quitRun(battle); }, 'red'), btn('Keep playing', () => q.close(), 'green'))));
      }, 'red small')));
}

// ------------------------------------------------------------------------------------------------ hints
export function showHint(app, id, done) {
  const hint = HINTS[id];
  const isEnemy = !!ENEMIES[id];
  const ic = isEnemy ? enemyIcon(id, 90) : id === 'boss' ? icon('crown', 70) : id === 'chest' ? icon('gift', 70) : id === 'mod' ? icon('bolt', 70) : icon('lock', 70);
  const m = modal(h('div', { class: 'hint-card' }, h('h2', null, isEnemy ? 'New Static: ' + hint.title : hint.title), h('div', { style: 'text-align:center' }, ic), h('p', null, hint.text),
    h('div', { class: 'btnrow' }, btn('Got it!', () => m.close(), 'green'))), { sticky: true, onClose: done });
  app.audio.play('ui_open');
}

// ------------------------------------------------------------------------------------------------ defeat and results
export function showDefeat(app, run, battle, onGiveUp) {
  const body = h('div');
  const m = modal(body, { sticky: true });
  const canRevive = app.profile.diamonds >= ECON.reviveDiamonds && run.mode !== 'tutorial';
  body.append(h('div', { class: 'res-title lose' }, 'DEFEAT'), h('div', { class: 'sub', style: 'text-align:center' }, 'The Static took the stage on wave ' + run.wave + '. But the music is not over...'),
    h('div', { style: 'text-align:center;margin:8px 0' }, canvasOf(120, 120, (ctx, t) => AE.drawGlyph(ctx, 'skull', 60, 60, 80, '#dcd8e8'))),
    h('div', { class: 'btnrow' }, btn([icon('diamond', 22), 'Revive ' + ECON.reviveDiamonds], () => {
      if (!canRevive) { toast('You need ' + ECON.reviveDiamonds + ' diamonds to revive.'); return; }
      app.spendDiamonds(ECON.reviveDiamonds); run.revive(); battle.ended = false; battle.endTimer = 0; battle.queueBanner('ENCORE!', 'Half the stage is back', COL.green, 1.8); m.close();
    }, canRevive ? 'gold' : 'dark off'), btn('Give up', () => { m.close(); onGiveUp(); }, 'dark')));
}

export function showResults(app, run, out, opts = {}) {
  const r = run.result, p = app.profile;
  const win = r.won;
  const body = h('div');
  const m = modal(body, { sticky: true });
  app.audio.musicStart(win ? 'victory' : 'defeat');
  body.append(h('div', { class: 'res-title ' + (win ? 'win' : 'lose') }, win ? (r.mode === 'tutorial' ? 'PRACTICE DONE!' : 'VICTORY!') : r.mode === 'endless' || r.mode === 'daily' ? 'RUN OVER' : 'DEFEAT'));
  if (win && r.mode === 'story') {
    const st = h('div', { class: 'big-stars' });
    for (let i = 0; i < 3; i++) setTimeout(() => { const c = canvasOf(64, 64, (ctx) => { ctx.globalAlpha = i < r.stars ? 1 : 0.25; AE.drawGlyph(ctx, 'star', 32, 32, 60, i < r.stars ? '#ffc83d' : '#8a7cc0'); }); c.className = 'pop'; st.append(c); if (i < r.stars) app.audio.play('star_pop', { pitch: 1 + i * 0.15 }); }, 250 + i * 350);
    body.append(st);
    body.append(h('div', { class: 'sub', style: 'text-align:center' }, r.stars === 3 ? 'Perfect stage!' : r.stars === 2 ? 'Great! Only a few leaks. Hold the line for 3 stars.' : 'Cleared. 3 stars needs 2 or fewer leaks.'));
  }
  const wave = r.mode === 'endless' ? r.cleared + (out.newBestEndless ? ' BEST!' : '') : r.mode === 'daily' ? r.cleared + '' : r.cleared + (r.mode === 'tutorial' ? '/3' : '/' + run.wavesTotal);
  body.append(h('div', { class: 'statgrid' }, h('div', null, r.mode === 'endless' ? 'Wave reached' : 'Waves cleared', h('b', null, wave)), h('div', null, 'Kills', h('b', null, fmt(r.kills))), h('div', null, 'Merges', h('b', null, r.merges)), h('div', null, 'Best combo', h('b', null, r.bestCombo)),
    h('div', null, 'Bosses', h('b', null, r.bossKills)), h('div', null, 'Time', h('b', null, Math.floor(r.time / 60) + 'm ' + Math.round(r.time % 60) + 's'))));
  const rew = h('div', { class: 'rew' });
  const add = (kind, n, i) => rew.append(h('div', { class: 'rewi', style: 'animation-delay:' + (300 + i * 150) + 'ms' }, kind === 'fans' ? icon('fans', 28) : icon(kind === 'records' ? 'record' : 'diamond', 28), '+' + fmt(n)));
  let i = 0;
  if (out.records) add('records', out.records, i++);
  if (out.fans) add('fans', out.fans, i++);
  if (out.diamonds) add('diamonds', out.diamonds, i++);
  body.append(rew);
  if (out.firstClear) body.append(h('div', { style: 'text-align:center;font-weight:900;color:var(--gold)' }, 'First clear bonus!' + (out.unlockedWorld ? ' ' + WORLD_BY_ID[out.unlockedWorld].name + ' unlocked!' : '')));
  if (out.challenge && out.challenge.first) body.append(h('div', { style: 'text-align:center;font-weight:900;color:var(--gold)' }, 'Daily challenge complete!'));
  if (out.firstBosses.length) body.append(h('div', { class: 'sub', style: 'text-align:center' }, 'First time defeating: ' + out.firstBosses.map((b) => BOSSES[b].name).join(', ') + ' (+8 diamonds each)'));
  if (out.loot.length) {
    body.append(h('div', { style: 'text-align:center;font-weight:900;margin-top:6px' }, 'Loot!'), h('div', { class: 'loot' }, out.loot.map((g, k) => { const el = gearIcon(g, 84); el.parentNode; const w = h('div', { class: 'gitem', style: 'border-color:' + RARITY[g.rarity].color + ';animation-delay:' + (700 + k * 250) + 'ms' }, el); return w; })));
    for (const g of out.loot) if (RARITY_ORDER.indexOf(g.rarity) >= 2) app.audio.play('reveal_' + g.rarity);
  }
  for (const lu of out.levelUps) {
    body.append(h('div', { class: 'card', style: 'border-color:var(--pink);margin:8px 0 0;padding:8px;text-align:center' }, h('b', null, 'FAME LEVEL ' + lu.level + '!'),
      h('div', { class: 'row', style: 'justify-content:center' }, lu.reward.diamonds ? currencyChip('diamonds', lu.reward.diamonds) : null, lu.reward.records ? currencyChip('records', lu.reward.records) : null,
        (lu.reward.unlocks || []).map((id) => h('span', { class: 'chip' }, 'New turret available: ' + id)))));
    app.audio.play('levelup');
  }
  if (r.mode === 'tutorial') body.append(h('div', { class: 'card', style: 'margin-top:8px' }, h('div', { class: 'sub', style: 'text-align:center' }, 'Practice complete! You got a free crate and Records. Spend them in the Studio and Crates tabs, then head out on the Tour.')));
  if ((r.mode === 'endless' || r.mode === 'daily') && r.cleared >= 1) {
    const line = h('div', { class: 'sub', style: 'text-align:center;margin-top:6px' });
    body.append(line);
    const submit = () => { line.textContent = 'Posting your score...'; app.submitBoard(run).then((rank) => { line.textContent = rank ? 'Leaderboard rank #' + rank + '!' : 'Leaderboard is offline.'; }); };
    if (p.name) submit();
    else {
      const inp = h('input', { type: 'text', maxlength: 16, placeholder: 'Your name', style: 'flex:1;font:400 20px var(--hand,sans-serif);padding:8px;border-radius:10px;border:3px solid var(--line);min-width:0' });
      const row = h('div', { class: 'row', style: 'margin-top:6px' }, inp, btn('Post score', () => { const nm = inp.value.replace(/[^\w \-.']/g, '').trim().slice(0, 16); if (!nm) return; p.name = nm; app.save(); row.remove(); submit(); }, 'blue small'));
      body.append(row);
    }
  }
  const btns = h('div', { class: 'btnrow' });
  if (win && r.mode === 'story' && out.unlockedWorld) btns.append(btn('Next Stage', () => { m.close(); app.afterResults(run, out, { next: out.unlockedWorld }); }, 'green'));
  btns.append(btn(win && r.mode === 'story' && out.unlockedWorld ? 'Hub' : 'Continue', () => { m.close(); app.afterResults(run, out, {}); }, win && out.unlockedWorld ? 'dark' : 'green'));
  if (r.mode !== 'tutorial') btns.append(btn('Retry', () => { m.close(); app.afterResults(run, out, { retry: true }); }, 'blue'));
  body.append(btns);
}

// ------------------------------------------------------------------------------------------------ how to play
export function showHowTo(app) {
  const sec = (t, ...ps) => h('div', { class: 'card' }, h('h3', null, t), ps.map((p) => h('p', { class: 'sub', style: 'margin:4px 0;font-size:17px;color:#4b4455' }, p)));
  const m = modal(h('div', null, h('h2', null, 'How to Play'),
    sec('The goal', 'The Static walks along the path towards your stage. Stop every one of them. Each one that gets through costs stage health. Survive all the waves, beat the boss and clear the stage for stars.'),
    sec('Drop and merge', 'Tap DROP to place a random turret. Tap an empty tile first to choose exactly where. Two turrets of the same level can be merged: drag one onto the other, or tap one then the other. Every level doubles the power (up to level 7). Different turrets of the same level can remix into a surprise.'),
    sec('Coins and hype', 'Kills give coins, which buy more drops (each drop costs a bit more). Kills also fill the HYPE bar. When it fills you pick a Remix card, a run-long upgrade. Bosses and chests give Merch relics.'),
    sec('Heroes', 'RoxorLoops and Jasmin each have a special move with a cooldown. Beatbox Blast hits everything. Siren Song slows and heals. Use both within 2 seconds for a Duet Finale.'),
    sec('The beat', 'The ring on the DROP button closes in with the music. Drop on the beat for a discount and to keep your streak. Kills in a row make a combo that boosts coins.'),
    sec('Between runs', 'Spend Records in the Studio for permanent upgrades and new turrets. Open crates for gear, equip it on the Band tab, upgrade it and merge duplicates into higher rarities. Do daily quests and the daily challenge for diamonds.'),
    sec('Tips', 'Set turret targeting (First, Last, Strongest, Closest) by tapping a turret. Loop Station and Amp Stack boost their neighbours. Sell weak turrets late to make room. Save hero moves for bosses.'),
    h('div', { class: 'btnrow' }, btn('Got it', () => m.close(), 'green'))), { wide: true });
}

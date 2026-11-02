// ui_run.js: DOM overlays used during and right after a run: Remix/relic pick, pause, hints, defeat, results, how-to-play.
import { WORLD_BY_ID, BOSSES, ENEMIES, TURRETS, RARITY, RARITY_ORDER, COL, ECON, fmt } from './data_core.js';
import { REMIX, RELICS, WAVE_MODS } from './data_run.js';
import { OUTFITS } from './data_meta.js';
import { ENEMY_TIPS as ET, BOSS_TIPS as BT, FIXED_TIPS } from './sim.js';
import { RUN_MODIFIER_BY_ID } from './data_depth.js';
import * as M from './meta.js';
import { HINTS } from './data_story.js';
import { h, canvasOf, icon, gearIcon, enemyIcon, turretIcon, currencyChip, modal, toast, btn, muteButton, rarClass, rarName, AE, AW } from './ui_core.js';
import { settingsModal } from './ui_hub.js';
import { flames } from './ui_setlist.js';
import { makeShareCard, shareCard, shareText } from './share.js';
import { t, tn } from './i18n.js';

// A translated string with DOM nodes in its {placeholders}: tb(t('key', 'Toughest wave: {n}', mk('n')), { n: h('b', null, '5') }) returns an array of text and nodes.
const mk = (...names) => { const m = {}; for (const k of names) m[k] = '\u0001' + k + '\u0001'; return m; };
const tb = (str, vars) => str.split('\u0001').map((p, i) => (i % 2 ? vars[p] : p));

// ------------------------------------------------------------------------------------------------ remix / relic pick
export function showChoice(app, run, battle) {
  const body = h('div');
  const m = modal(body, { sticky: true });
  const kind = run.choice.kind;
  const isRelic = kind === 'chest' || kind === 'boss';
  const draw = () => {
    if (!run.choice) { m.close(); return; }
    body.replaceChildren(
      h('h2', { style: 'color:' + (isRelic ? 'var(--gold)' : 'var(--pink)') }, isRelic ? (kind === 'boss' ? t('run.choice.boss', 'Boss Loot! Pick Merch') : t('run.choice.chest', 'Chest! Pick Merch')) : t('run.choice.remix', 'Remix! Level {n}', { n: run.level })),
      h('div', { class: 'sub', style: 'text-align:center;margin:-4px 0 10px' }, isRelic ? t('run.choice.sub_relic', 'Merch is unique and lasts the whole run.') : t('run.choice.sub_remix', 'Pick one upgrade for this run. Cards stack.')));
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
      btn(rr > 0 ? [icon('reroll', 22), t('run.choice.reroll_n', 'Reroll ({n})', { n: rr })] : [icon('diamond', 20), t('run.choice.reroll_gems', 'Reroll {n}', { n: ECON.rerollCostDiamonds })], () => {
        if (run.rerolls <= 0) { if (!canGem) { toast(t('run.choice.no_rerolls', 'No rerolls left.')); return; } app.spendDiamonds(ECON.rerollCostDiamonds); run.rerolls++; }
        run.rerollChoice(); draw();
      }, rr > 0 || canGem ? 'blue' : 'dark off'),
      btn(t('run.choice.skip', 'Skip +{n} coins', { n: 40 + run.wave * 12 }), () => { run.skipChoice(); m.close(); battle.choiceOpen = false; }, 'dark')));
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
  const m = modal(body, { sticky: true, escClose: true, onClose: () => { battle.setPause(false); } });
  const wm = run.wmId ? WAVE_MODS[run.wmId] : null;
  body.append(h('h2', null, t('run.pause.title', 'Paused')),
    h('div', { class: 'statgrid' }, h('div', null, t('run.stat.stage', 'Stage'), h('b', null, run.world.name)), h('div', null, t('run.stat.wave', 'Wave'), h('b', null, run.wave + (run.endless ? '' : '/' + run.wavesTotal))),
      h('div', null, t('run.stat.kills', 'Kills'), h('b', null, fmt(run.kills))), h('div', null, t('run.stat.best_combo', 'Best combo'), h('b', null, run.bestCombo)),
      h('div', null, t('run.stat.merges', 'Merges'), h('b', null, run.merges)), h('div', null, t('run.stat.remix_level', 'Remix level'), h('b', null, run.level))),
    run.relics.length ? h('div', { class: 'row', style: 'flex-wrap:wrap;justify-content:center;margin:6px 0' }, run.relics.map((id) => h('div', { title: RELICS[id].name, style: 'text-align:center;width:70px' }, icon(RELICS[id].glyph, 34, RARITY[RELICS[id].rarity].color), h('div', { class: 'sub', style: 'font-size:10px' }, RELICS[id].name)))) : null,
    Object.keys(run.remix).length ? h('div', { class: 'sub', style: 'font-size:13px;text-align:center' }, Object.entries(run.remix).map(([id, n]) => REMIX[id].name + (n > 1 ? ' x' + n : '')).join(', ')) : null,
    h('div', { class: 'pause-btns', style: 'margin-top:12px' },
      btn(t('run.pause.resume', 'Resume'), () => m.close(), 'green big'),
      h('div', { class: 'btnrow', style: 'margin-top:0' }, btn(t('run.pause.settings', 'Settings'), () => settingsModal(app), 'dark small'), btn(t('run.pause.howto', 'How to play'), () => app.showHowTo(), 'dark small'), muteButton(app)),
      btn(t('run.pause.quit', 'Quit run'), () => {
        const q = modal(h('div', null, h('h2', null, t('run.pause.quit_title', 'Quit this run?')), h('div', { class: 'sub', style: 'text-align:center' }, run.practice ? t('run.pause.quit_practice', 'Practice has no rewards, so nothing is lost.') : t('run.pause.quit_body', 'You keep the rewards for the waves you cleared. Stars and stage progress need a win.')),
          h('div', { class: 'btnrow' }, btn(t('run.pause.quit_yes', 'Quit'), () => { q.close(); m.close(); battle.setPause(false); app.quitRun(battle); }, 'red'), btn(t('run.pause.keep', 'Keep playing'), () => q.close(), 'green'))));
      }, 'red small')));
}

// ------------------------------------------------------------------------------------------------ hints
// glyph per coach mark (hub hints included); anything unlisted shows the lock
const HINT_ICON = { boss: 'crown', chest: 'gift', mod: 'bolt', hint_setlist: 'mic', hint_wardrobe: 'sparkle', hint_skin_buy: 'diamond', hint_studio_scene: 'speaker', hint_weekly: 'ticket', hint_synergy: 'heart', hint_branch: 'merge', hint_preview: 'eye', hint_reroll: 'reroll', hint_bossphase: 'crown', hint_hero_ready: 'sparkle' };
export function showHint(app, id, done) {
  const hint = HINTS[id];
  const isEnemy = !!ENEMIES[id], bossId = /^boss_/.test(id) && BOSSES[id.slice(5)] ? id.slice(5) : null;   // boss_<id> cards show that boss
  const ic = isEnemy ? enemyIcon(id, 90) : bossId ? enemyIcon(bossId, 96, true) : icon(HINT_ICON[id] || 'lock', 70);
  const m = modal(h('div', { class: 'hint-card' }, h('h2', null, isEnemy ? t('run.hint.new_static', 'New Static: {title}', { title: hint.title }) : bossId ? t('run.hint.new_boss', 'Boss: {title}', { title: hint.title }) : hint.title), h('div', { style: 'text-align:center' }, ic), h('p', null, hint.text),
    h('div', { class: 'btnrow' }, btn(t('run.hint.got_it', 'Got it!'), () => m.close(), 'green'))), { sticky: true, onClose: done });
  app.audio.play('ui_open');
}


// ------------------------------------------------------------------------------------------------ share and recap helpers
// A Share button: draws the crayon brag card, then shares it as a file (phones) or downloads the PNG.
function shareBtn(app, run, small) {
  let busy = false;
  return btn([icon('star', 22), t('run.share.btn', 'Share')], async () => {
    if (busy) return; busy = true;
    try {
      try { if (document.fonts && document.fonts.load) await document.fonts.load('40px "Patrick Hand"'); } catch (e) { /* font optional */ }
      const cv = makeShareCard(run, run.result, app.profile);
      const how = await shareCard(cv, shareText(run.result, run.world));
      if (how === 'downloaded') toast(t('run.share.saved', 'Picture saved. Post it anywhere!'));
      else if (how === 'failed') toast(t('run.share.failed', 'Could not share that picture.'));
    } finally { busy = false; }
  }, 'gold' + (small ? ' small' : ''), { 'data-share': '1' });
}
const arr = (v) => (Array.isArray(v) ? v : []);
const typeIcon = (type, px) => (ENEMIES[type] ? enemyIcon(type, px) : BOSSES[type] ? enemyIcon(type, px, true) : TURRETS[type] ? turretIcon(type, px) : null);
// Recap tips arrive from sim.js as ids (recap.tipIds) next to English sentences (recap.tips). Ids are looked up here first; the sentence matcher below is the fallback for old data. This table (built per call, so a language switch applies) maps each exact sentence to its translation.
const tipTable = () => ({
  'Plain Fuzz piled up: add more turrets and merge them.': t('run.tip.fuzz', 'Plain Fuzz piled up: add more turrets and merge them.'),
  'Fast Glitch Zips slipped past: Sub Bass slows them.': t('run.tip.zip', 'Fast Glitch Zips slipped past: Sub Bass slows them.'),
  'Brickwalls shrug off small hits: try Kick Cannon or Cowbell Sniper.': t('run.tip.brick', 'Brickwalls shrug off small hits: try Kick Cannon or Cowbell Sniper.'),
  'Echoes split when they die: splash turrets clean up the pieces.': t('run.tip.echo', 'Echoes split when they die: splash turrets clean up the pieces.'),
  'Hum Healers keep the Static topped up: burst them down first.': t('run.tip.leech', 'Hum Healers keep the Static topped up: burst them down first.'),
  'Autotune Drones fly straight over the path: long range turrets catch them.': t('run.tip.drone', 'Autotune Drones fly straight over the path: long range turrets catch them.'),
  'Gate Guards soak damage with a shield: pile on big hits.': t('run.tip.gate', 'Gate Guards soak damage with a shield: pile on big hits.'),
  'Feedback screeches jam nearby turrets: keep your turrets spread out.': t('run.tip.squeal', 'Feedback screeches jam nearby turrets: keep your turrets spread out.'),
  'Mute Ghosts ignore slows and stuns: raw damage beats them.': t('run.tip.mute', 'Mute Ghosts ignore slows and stuns: raw damage beats them.'),
  'Glitchbugs speed up when hurt: finish them off quickly.': t('run.tip.rager', 'Glitchbugs speed up when hurt: finish them off quickly.'),
  'The Compressor squashes big hits: many fast small hits beat it.': t('run.tip.compressor', 'The Compressor squashes big hits: many fast small hits beat it.'),
  'Noise Gate shuts out damage now and then: hold your hero moves until it opens.': t('run.tip.noisegate', 'Noise Gate shuts out damage now and then: hold your hero moves until it opens.'),
  'Reverb Titan leaves echoes behind: splash turrets help.': t('run.tip.reverb', 'Reverb Titan leaves echoes behind: splash turrets help.'),
  'DJ Glitch jams the nearest turrets: keep a few spares further from the path.': t('run.tip.djglitch', 'DJ Glitch jams the nearest turrets: keep a few spares further from the path.'),
  'Mr. Playback has three phases: save your heroes for the last one.': t('run.tip.playback', 'Mr. Playback has three phases: save your heroes for the last one.'),
  'The Low-Pass Tide shrugs off weak shots: bring big hits like Kick Cannon and Cowbell Sniper.': t('run.tip.lowpass', 'The Low-Pass Tide shrugs off weak shots: bring big hits like Kick Cannon and Cowbell Sniper.'),
  'Dr. Dead Air mutes and steals turrets: keep spares and save your heroes for the end.': t('run.tip.silence', 'Dr. Dead Air mutes and steals turrets: keep spares and save your heroes for the end.'),
  'You never merged: drag two turrets of the same level together to double their power.': t('run.tip.no_merge', 'You never merged: drag two turrets of the same level together to double their power.'),
  'You never merged past level 3: merge pairs to double power.': t('run.tip.low_merge', 'You never merged past level 3: merge pairs to double power.'),
  'You ended with spare coins: turn them into turrets before the wave.': t('run.tip.spare_coins', 'You ended with spare coins: turn them into turrets before the wave.'),
  'Roxor and Jasmin never played: tap a hero when the stage fills up.': t('run.tip.no_hero', 'Roxor and Jasmin never played: tap a hero when the stage fills up.'),
  'Clean run! Try Hard difficulty or a higher Encore.': t('run.tip.clean', 'Clean run! Try Hard difficulty or a higher Encore.'),
});
const laneTips = () => ({ left: t('run.tip.lane_left', 'Most leaks came from the left lane: build there.'), right: t('run.tip.lane_right', 'Most leaks came from the right lane: build there.'), middle: t('run.tip.lane_middle', 'Most leaks came from the middle lane: build there.') });
// A tip id from sim.js ({ id, vars }) shown from the dictionary; null when the id is unknown (the caller falls back to the sentence).
export function tipById(tip) {
  if (!tip || typeof tip.id !== 'string') return null;
  const v = tip.vars || {};
  if (tip.id === 'lane') {
    if (v.lane && laneTips()[v.lane]) return laneTips()[v.lane];
    if (v.n != null) return t('run.tip.lane_n', 'Most leaks came from the number {n} lane: build there.', { n: v.n });
    return null;
  }
  if (tip.id === 'pair') {
    if (!TURRETS[v.a] || !TURRETS[v.b]) return null;
    return t('run.tip.pair', 'Try pairing {a} with {b} for a synergy bonus.', { a: TURRETS[v.a].name, b: TURRETS[v.b].name });
  }
  const sentence = ET[tip.id] || BT[tip.id] || FIXED_TIPS[tip.id];
  return sentence ? tipTable()[sentence] || null : null;
}
export function tipText(s) {
  s = String(s);
  const fixed = tipTable();
  if (fixed[s]) return fixed[s];
  let m = /^Most leaks came from the (left|right|middle) lane: build there\.$/.exec(s);
  if (m) return laneTips()[m[1]];
  m = /^Most leaks came from the number (\d+) lane: build there\.$/.exec(s);
  if (m) return t('run.tip.lane_n', 'Most leaks came from the number {n} lane: build there.', { n: m[1] });
  m = /^Try pairing (.+) with (.+) for a synergy bonus\.$/.exec(s);
  if (m) return t('run.tip.pair', 'Try pairing {a} with {b} for a synergy bonus.', { a: m[1], b: m[2] });
  return s;
}
const typeName = (type) => (ENEMIES[type] ? ENEMIES[type].name : BOSSES[type] ? BOSSES[type].name : TURRETS[type] ? TURRETS[type].name : String(type));
// 'What happened': leaks per lane as mini bars, the Static that got through, top killers and up to 3 tips. Every field is optional.
export function recapCard(recap) {
  if (!recap || typeof recap !== 'object') return null;
  const parts = [];
  const lanes = arr(recap.leaksByLane).map((n) => Math.max(0, +n || 0));
  const maxLane = Math.max(0, ...lanes);
  if (maxLane > 0) {
    parts.push(h('div', { class: 'rc-row' }, h('div', { class: 'rc-lbl' }, t('run.recap.leaks', 'Leaks per lane')),
      h('div', { class: 'rc-bars' }, lanes.map((n, i) => h('div', { class: 'rc-bar' + (n === maxLane ? ' worst' : ''), title: t('run.recap.lane_n', 'Lane {lane}: {n}', { lane: i + 1, n }) },
        h('b', null, n || ''), h('i', { style: 'height:' + Math.max(n ? 8 : 3, Math.round(n / maxLane * 48)) + 'px' }), h('span', null, i + 1))))));
  }
  const chips = (list, label, cls) => {
    const items = arr(list).filter((x) => x && x.type && typeIcon(x.type, 40) !== null && (+x.count || 0) > 0).slice(0, 5);
    if (!items.length) return null;
    return h('div', { class: 'rc-row' }, h('div', { class: 'rc-lbl' }, label),
      h('div', { class: 'rc-types ' + (cls || '') }, items.map((x) => h('div', { class: 'rc-type', title: typeName(x.type) }, typeIcon(x.type, 40), h('b', null, 'x' + x.count), h('span', null, typeName(x.type))))));
  };
  parts.push(chips(recap.leakTypes, t('run.recap.got_through', 'Got through'), 'bad'));
  if (recap.worstWave > 0) parts.push(h('div', { class: 'rc-line' }, tb(t('run.recap.toughest', 'Toughest wave: {n}', mk('n')), { n: h('b', null, String(recap.worstWave)) })));
  if (recap.bossFinisher && (BOSSES[recap.bossFinisher] || ENEMIES[recap.bossFinisher])) parts.push(h('div', { class: 'rc-line' }, tb(t('run.recap.finished_by', 'Finished by: {name}', mk('name')), { name: h('b', null, typeName(recap.bossFinisher)) })));
  parts.push(chips(recap.topKillers, t('run.recap.top_killers', 'Top killers'), 'good'));
  // ids first (translations keep working when a sentence is reworded), the English sentences when a recap carries no ids
  const ids = arr(recap.tipIds), sentences = arr(recap.tips);
  const tips = (ids.length ? ids.map((x, i) => tipById(x) || (typeof sentences[i] === 'string' ? tipText(sentences[i]) : null)) : sentences.map((x) => (typeof x === 'string' ? tipText(x) : null))).filter((x) => x).slice(0, 3);
  if (tips.length) parts.push(h('div', { class: 'rc-tips' }, tips.map((x) => h('div', { class: 'rc-tip' }, icon('bolt', 20), h('span', null, x)))));
  const kids = parts.filter(Boolean);
  if (!kids.length) return null;
  return h('div', { class: 'recap card' }, h('h3', null, t('run.recap.title', 'What happened')), kids);
}

// ------------------------------------------------------------------------------------------------ defeat and results
export function showDefeat(app, run, battle, onGiveUp) {
  const body = h('div');
  const m = modal(body, { sticky: true });
  const canRevive = app.profile.diamonds >= ECON.reviveDiamonds && run.mode !== 'tutorial';
  body.append(h('div', { class: 'res-title lose' }, t('run.defeat.title', 'DEFEAT')), h('div', { class: 'sub', style: 'text-align:center' }, t('run.defeat.body', 'The Static took the stage on wave {n}. But the music is not over...', { n: run.wave })),
    h('div', { style: 'text-align:center;margin:8px 0' }, canvasOf(120, 120, (ctx, t) => AE.drawGlyph(ctx, 'skull', 60, 60, 80, '#dcd8e8'))),
    recapCard(run.result && run.result.recap),
    h('div', { class: 'btnrow' }, btn([icon('diamond', 22), t('run.defeat.revive', 'Revive {n}', { n: ECON.reviveDiamonds })], () => {
      if (!canRevive) { toast(t('run.defeat.need_gems', 'You need {n} diamonds to revive.', { n: ECON.reviveDiamonds })); return; }
      app.spendDiamonds(ECON.reviveDiamonds); run.revive(); battle.ended = false; battle.endTimer = 0; battle.queueBanner(t('run.defeat.encore', 'ENCORE!'), t('run.defeat.encore_sub', 'Half the stage is back'), COL.green, 1.8); m.close();
    }, canRevive ? 'gold' : 'dark off'), shareBtn(app, run), btn(t('run.defeat.give_up', 'Give up'), () => { m.close(); onGiveUp(); }, 'dark')));
}

// Practice a boss (codex): no rewards, nothing saved. Shows the time to defeat the boss.
export function showPracticeResults(app, run) {
  const r = run.result || {}, pr = r.practice || {}, b = BOSSES[pr.boss];
  const defeated = pr.time != null;
  const body = h('div', { class: 'practice-results' });
  const m = modal(body, { sticky: true });
  app.audio.musicStart(defeated ? 'victory' : 'defeat');
  body.append(h('div', { class: 'res-title ' + (defeated ? 'win' : 'lose') }, defeated ? t('practice.won', 'BOSS DOWN!') : t('practice.lost', 'NOT YET!')),
    h('div', { class: 'sub', style: 'text-align:center;font-weight:900' }, t('practice.vs', 'Practice: {boss}', { boss: b ? b.name : '' })),
    h('div', { style: 'text-align:center;margin:4px 0' }, b ? enemyIcon(pr.boss, 100, true) : null),
    h('div', { class: 'statgrid' },
      h('div', null, t('practice.time', 'Time to defeat'), h('b', { 'data-practice-time': defeated ? String(pr.time) : '' }, defeated ? clock(pr.time) : '-')),
      h('div', null, t('run.stat.kills', 'Kills'), h('b', null, fmt(r.kills || 0))),
      h('div', null, t('run.stat.merges', 'Merges'), h('b', null, r.merges || 0)),
      h('div', null, t('practice.leaks', 'Leaks'), h('b', null, r.leaks || 0))),
    h('div', { class: 'sub', style: 'text-align:center' }, t('practice.no_rewards', 'Practice gives no rewards and changes nothing in your save.')),
    !defeated ? recapCard(r.recap) : null,
    h('div', { class: 'btnrow' }, btn(t('practice.again', 'Try again'), () => { m.close(); app.endPractice({ retry: true }); }, 'green'), btn(t('practice.back', 'Back to the hub'), () => { m.close(); app.endPractice({}); }, 'dark')));
}

function milestoneLine(ms) {
  const d = ms.reward && ms.reward.diamonds, c = ms.reward && ms.reward.cosmetic, n = ms.wave;
  if (d && c) return t('run.results.ms_both', 'Endless wave {n}. +{d} diamonds and a keepsake.', { n, d });
  if (d) return t('run.results.ms_dia', 'Endless wave {n}. +{d} diamonds.', { n, d });
  if (c) return t('run.results.ms_keep', 'Endless wave {n} and a keepsake.', { n });
  return t('run.results.ms_plain', 'Endless wave {n}.', { n });
}

// Personal bests card for the results screen: this run against the profile's previous best for the stage and mode (out.bests from meta.recordBests).
// A beaten best shows gold with what it was; the NEW RECORD! sticker and a small confetti burst (skipped with Reduce motion) mark a record.
const clock = (sec) => t('run.results.time_fmt', '{m}m {s}s', { m: Math.floor(sec / 60), s: Math.round(sec % 60) });
export function bestsCard(app, bests) {
  if (!bests || !bests.run || !bests.now) return null;
  const rows = [
    ['wave', t('run.bests.wave', 'Best wave'), (v) => String(v)],
    ['combo', t('run.stat.best_combo', 'Best combo'), (v) => String(v)],
    ['time', t('run.bests.fastest', 'Fastest clear'), clock],
    ['kills', t('run.stat.kills', 'Kills'), (v) => fmt(v)],
  ];
  const lines = rows.map(([f, label, show]) => {
    const was = bests.prev ? bests.prev[f] : 0, here = bests.run[f];
    if (f === 'time' && !here) return h('div', { class: 'bst-row' }, h('span', { class: 'bst-l' }, label), h('b', null, '-'), h('i', null, bests.now.time ? t('run.bests.best', 'Best: {v}', { v: show(bests.now.time) }) : t('run.bests.win_to_set', 'Win to set one')));
    const hit = bests.beaten[f];
    return h('div', { class: 'bst-row' + (hit ? ' hit' : '') }, h('span', { class: 'bst-l' }, label), h('b', null, show(here)),
      h('i', null, hit ? t('run.bests.was', 'was {v}', { v: show(was) }) : was > 0 ? t('run.bests.best', 'Best: {v}', { v: show(Math.max(was, here)) }) : t('run.bests.first', 'First score')));
  });
  const n = Object.values(bests.beaten).filter(Boolean).length;
  const card = h('div', { class: 'card res-bests' + (bests.record ? ' record' : '') }, h('h3', null, t('run.bests.title', 'Personal bests')), lines,
    bests.record ? h('div', { class: 'nr-sticker' }, t('run.bests.new_record', 'NEW RECORD!')) : null,
    bests.record ? h('div', { class: 'sub bst-count' }, tn('run.bests.count', n, '{n} personal best beaten', '{n} personal bests beaten', { n })) : null);
  if (bests.record) {
    const calm = (app.profile && app.profile.settings && app.profile.settings.reduce) || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (!calm) {
      const cols = ['#ff5fb0', '#43b94a', '#19d3ff', '#ffc83a', '#ff9226', '#7b4fd0'];
      const box = h('div', { class: 'nr-confetti', 'aria-hidden': 'true' }, Array.from({ length: 24 }, (_, i) => h('span', { style: 'left:' + (4 + (i * 41) % 92) + '%;background:' + cols[i % cols.length] + ';animation-delay:' + ((i * 53) % 500) + 'ms;--dx:' + (((i * 29) % 60) - 30) + 'px;--rot:' + (180 + (i * 37) % 360) + 'deg' })));
      card.append(box);
    }
    app.audio.play('record');
  }
  return card;
}

export function showResults(app, run, out, opts = {}) {
  const r = run.result, p = app.profile;
  const win = r.won;
  const body = h('div');
  const m = modal(body, { sticky: true });
  app.audio.musicStart(win ? 'victory' : 'defeat');
  body.append(h('div', { class: 'res-title ' + (win ? 'win' : 'lose') }, win ? (r.mode === 'tutorial' ? t('run.results.practice_done', 'PRACTICE DONE!') : t('run.results.victory', 'VICTORY!')) : r.mode === 'endless' || r.mode === 'daily' ? t('run.results.run_over', 'RUN OVER') : t('run.defeat.title', 'DEFEAT')));
  if (r.mode === 'daily') body.append(h('div', { class: 'res-sub', style: 'text-align:center;font-weight:900;color:var(--pink)' }, r.weekly ? (r.weekId ? t('run.results.weekly_id', 'Weekly Gig {id}', { id: r.weekId }) : t('run.results.weekly', 'Weekly Gig')) : t('run.results.daily', 'Daily Challenge')));
  if (win && r.mode === 'story') {
    const st = h('div', { class: 'big-stars' });
    for (let i = 0; i < 3; i++) setTimeout(() => { const c = canvasOf(64, 64, (ctx) => { ctx.globalAlpha = i < r.stars ? 1 : 0.25; AE.drawGlyph(ctx, 'star', 32, 32, 60, i < r.stars ? '#ffc83d' : '#8a7cc0'); }); c.className = 'pop'; st.append(c); if (i < r.stars) app.audio.play('star_pop', { pitch: 1 + i * 0.15 }); }, 250 + i * 350);
    body.append(st);
    body.append(h('div', { class: 'sub', style: 'text-align:center' }, r.stars === 3 ? t('run.results.stars3', 'Perfect stage!') : r.stars === 2 ? t('run.results.stars2', 'Great! Only a few leaks. Hold the line for 3 stars.') : t('run.results.stars1', 'Cleared. 3 stars needs 2 or fewer leaks.')));
  }
  const wave = r.mode === 'endless' ? (out.newBestEndless ? t('run.results.best_wave', '{n} BEST!', { n: r.cleared }) : String(r.cleared)) : r.mode === 'daily' ? r.cleared + '' : r.cleared + (r.mode === 'tutorial' ? '/3' : '/' + run.wavesTotal);
  body.append(h('div', { class: 'statgrid' }, h('div', null, r.mode === 'endless' ? t('run.results.wave_reached', 'Wave reached') : t('run.results.waves_cleared', 'Waves cleared'), h('b', null, wave)), h('div', null, t('run.stat.kills', 'Kills'), h('b', null, fmt(r.kills))), h('div', null, t('run.stat.merges', 'Merges'), h('b', null, r.merges)), h('div', null, t('run.stat.best_combo', 'Best combo'), h('b', null, r.bestCombo)),
    h('div', null, t('run.results.bosses', 'Bosses'), h('b', null, r.bossKills)), h('div', null, t('run.results.time', 'Time'), h('b', null, t('run.results.time_fmt', '{m}m {s}s', { m: Math.floor(r.time / 60), s: Math.round(r.time % 60) })))));
  if (r.mode !== 'tutorial') body.append(bestsCard(app, out.bests));
  if (!win) body.append(recapCard(r.recap));
  const rew = h('div', { class: 'rew' });
  const add = (kind, n, i) => rew.append(h('div', { class: 'rewi', style: 'animation-delay:' + (300 + i * 150) + 'ms' }, kind === 'fans' ? icon('fans', 28) : icon(kind === 'records' ? 'record' : 'diamond', 28), '+' + fmt(n)));
  let i = 0;
  if (out.records) add('records', out.records, i++);
  if (out.fans) add('fans', out.fans, i++);
  if (out.diamonds) add('diamonds', out.diamonds, i++);
  body.append(rew);
  // run modifiers: what was on and what it paid
  if (out.modifiers && out.modifiers.length && out.modMul) {
    const fl = out.modifiers.reduce((a, id) => a + M.modFlames(id), 0);
    body.append(h('div', { class: 'card res-mods' }, h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px;justify-content:center' }, out.modifiers.map((id) => { const md = RUN_MODIFIER_BY_ID[id]; return md ? h('span', { class: 'chip', title: md.desc }, icon(md.glyph, 18), md.name) : null; })),
      h('div', { style: 'text-align:center;margin-top:4px' }, flames(fl, 18), h('b', null, ' ' + t('run.results.payout', 'Payout x{rec} Records and Fans, x{dia} diamonds', { rec: Math.round(out.modMul.records * 100) / 100, dia: Math.round(out.modMul.diamonds * 100) / 100 })))));
  }
  for (const ms of out.milestones || []) {
    body.append(h('div', { class: 'card res-milestone', style: 'border-color:var(--gold);margin:8px 0 0;padding:8px;text-align:center' }, icon('crown', 34, '#ffc83d'),
      h('div', { style: 'font-weight:900;color:var(--gold)' }, t('run.results.milestone', 'Milestone reached: {name}', { name: ms.name })), h('div', { class: 'sub' }, milestoneLine(ms))));
    app.audio.play('achievement');
  }
  for (const no of out.newOutfits || []) {
    const o = OUTFITS[no.who] && OUTFITS[no.who][no.id];
    if (!o) continue;
    body.append(h('div', { class: 'card res-outfit', style: 'border-color:var(--pink);margin:8px 0 0;padding:8px' }, h('div', { class: 'row' },
      canvasOf(60, 80, (ctx) => AW.drawHero(ctx, no.who, 30, 76, 72, { t: 0.4, outfit: no.id, pose: 'cheer' })),
      h('div', { class: 'grow' }, h('b', null, t('run.results.new_outfit', 'New outfit: {name}', { name: o.name })), h('div', { class: 'sub' }, t('run.results.outfit_where', '{who}. Find it in the Band tab.', { who: no.who === 'roxor' ? 'RoxorLoops' : 'Jasmin' }))))));
    app.audio.play('reveal_epic');
  }
  if (out.firstClear) body.append(h('div', { style: 'text-align:center;font-weight:900;color:var(--gold)' }, out.unlockedWorld ? t('run.results.first_clear_unlock', 'First clear bonus! {name} unlocked!', { name: WORLD_BY_ID[out.unlockedWorld].name }) : t('run.results.first_clear', 'First clear bonus!')));
  if (out.challenge && out.challenge.first) body.append(h('div', { style: 'text-align:center;font-weight:900;color:var(--gold)' }, t('run.results.daily_done', 'Daily challenge complete!')));
  if (out.firstBosses.length) body.append(h('div', { class: 'sub', style: 'text-align:center' }, t('run.results.first_bosses', 'First time defeating: {names} (+8 diamonds each)', { names: out.firstBosses.map((b) => BOSSES[b].name).join(', ') })));
  if (out.loot.length) {
    body.append(h('div', { style: 'text-align:center;font-weight:900;margin-top:6px' }, t('run.results.loot', 'Loot!')), h('div', { class: 'loot' }, out.loot.map((g, k) => { const el = gearIcon(g, 84); el.parentNode; const w = h('div', { class: 'gitem', style: 'border-color:' + RARITY[g.rarity].color + ';animation-delay:' + (700 + k * 250) + 'ms' }, el); return w; })));
    for (const g of out.loot) if (RARITY_ORDER.indexOf(g.rarity) >= 2) app.audio.play('reveal_' + g.rarity);
  }
  for (const lu of out.levelUps) {
    body.append(h('div', { class: 'card', style: 'border-color:var(--pink);margin:8px 0 0;padding:8px;text-align:center' }, h('b', null, t('run.results.fame_level', 'FAME LEVEL {n}!', { n: lu.level })),
      h('div', { class: 'row', style: 'justify-content:center' }, lu.reward.diamonds ? currencyChip('diamonds', lu.reward.diamonds) : null, lu.reward.records ? currencyChip('records', lu.reward.records) : null,
        (lu.reward.unlocks || []).map((id) => h('span', { class: 'chip' }, t('run.results.new_turret', 'New turret available: {name}', { name: TURRETS[id] ? TURRETS[id].name : id }))))));
    app.audio.play('levelup');
  }
  if (r.mode === 'tutorial') body.append(h('div', { class: 'card', style: 'margin-top:8px' }, h('div', { class: 'sub', style: 'text-align:center' }, t('run.results.practice_body', 'Practice complete! You got a free crate and Records. Spend them in the Studio and Crates tabs, then head out on the Tour.'))));
  if ((r.mode === 'endless' || r.mode === 'daily') && r.cleared >= 1) {
    const line = h('div', { class: 'sub', style: 'text-align:center;margin-top:6px' });
    body.append(line);
    const submit = () => { line.textContent = t('run.results.posting', 'Posting your score...'); app.submitBoard(run).then((rank) => { line.textContent = rank ? t('run.results.rank', 'Leaderboard rank #{n}!', { n: rank }) : t('run.results.lb_offline', 'Leaderboard is offline.'); }); };
    if (p.name) submit();
    else {
      const inp = h('input', { type: 'text', maxlength: 16, placeholder: t('run.results.your_name', 'Your name'), style: 'flex:1;font:400 20px var(--hand,sans-serif);padding:8px;border-radius:10px;border:3px solid var(--line);min-width:0' });
      const row = h('div', { class: 'row', style: 'margin-top:6px' }, inp, btn(t('run.results.post_score', 'Post score'), () => { const nm = inp.value.replace(/[^\w \-.']/g, '').trim().slice(0, 16); if (!nm) return; p.name = nm; app.save(); row.remove(); submit(); }, 'blue small'));
      body.append(row);
    }
  }
  const btns = h('div', { class: 'btnrow' });
  if (win && r.mode === 'story' && out.unlockedWorld) btns.append(btn(t('run.results.next_stage', 'Next Stage'), () => { m.close(); app.afterResults(run, out, { next: out.unlockedWorld }); }, 'green'));
  btns.append(btn(win && r.mode === 'story' && out.unlockedWorld ? t('run.results.hub', 'Hub') : t('run.results.continue', 'Continue'), () => { m.close(); app.afterResults(run, out, {}); }, win && out.unlockedWorld ? 'dark' : 'green'));
  if (r.mode !== 'tutorial') btns.append(btn(t('run.results.retry', 'Retry'), () => { m.close(); app.afterResults(run, out, { retry: true }); }, 'blue'));
  if (r.mode !== 'tutorial') btns.append(shareBtn(app, run));
  body.append(btns);
}

// ------------------------------------------------------------------------------------------------ how to play
// true when the device has a mouse or trackpad as its main pointer (a desktop), so a keyboard is likely
export function hasFinePointer() {
  try { return typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches && !matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
}
// the keys battle.js listens to (Battle.key), in the order players need them
const shortcutRows = () => [
  [t('run.keys.drop_k', 'Space / Enter'), t('run.keys.drop', 'Drop a turret')],
  [t('run.keys.merge_k', 'M'), t('run.keys.merge', 'Merge every pair')],
  [t('run.keys.heroes_k', 'Q / W'), t('run.keys.heroes', 'Roxor / Jasmin move')],
  [t('run.keys.wave_k', 'N'), t('run.keys.wave', 'Call the next wave')],
  [t('run.keys.speed_k', 'F'), t('run.keys.speed', 'Change the speed')],
  [t('run.keys.reroll_k', 'R / G'), t('run.keys.reroll', 'Re-roll the next drop (coins / diamonds)')],
  [t('run.keys.preview_k', 'V'), t('run.keys.preview', 'Wave preview')],
  [t('run.keys.path_k', '1 / 2'), t('run.keys.path', 'Pick an upgrade path for the selected turret')],
  [t('run.keys.sell_k', 'S'), t('run.keys.sell', 'Sell the selected turret')],
  [t('run.keys.pause_k', 'Esc / P'), t('run.keys.pause', 'Pause')],
];
export function showHowTo(app) {
  const sec = (title, ...ps) => h('div', { class: 'card' }, h('h3', null, title), ps.map((p) => h('p', { class: 'sub', style: 'margin:4px 0;font-size:17px;color:#4b4455' }, p)));
  const m = modal(h('div', null, h('h2', null, t('run.howto.title', 'How to Play')),
    sec(t('run.howto.goal.title', 'The goal'), t('run.howto.goal.p1', 'The Static walks along the path towards your stage. Stop every one of them. Each one that gets through costs stage health. Survive all the waves, beat the boss and clear the stage for stars.')),
    sec(t('run.howto.drop.title', 'Drop and merge'), t('run.howto.drop.p1', 'Tap DROP to place a random turret. Tap an empty tile first to choose exactly where. Two turrets of the same level can be merged: drag one onto the other, or tap one then the other. Every level doubles the power (up to level 7). Different turrets of the same level can remix into a surprise.')),
    sec(t('run.howto.coins.title', 'Coins and hype'), t('run.howto.coins.p1', 'Kills give coins, which buy more drops (each drop costs a bit more). Kills also fill the HYPE bar. When it fills you pick a Remix card, a run-long upgrade. Bosses and chests give Merch relics.')),
    sec(t('run.howto.heroes.title', 'Heroes'), t('run.howto.heroes.p1', 'RoxorLoops and Jasmin each have a special move with a cooldown. Beatbox Blast hits everything. Siren Song slows and heals. Use both within 2 seconds for a Duet Finale.')),
    sec(t('run.howto.syn.title', 'Synergies'), t('run.howto.syn.p1', 'Turrets help their neighbours. Loop Station and Amp Stack boost the turrets next to them, and some pairs unlock a bonus when they sit side by side. Tap a turret to see what it likes. Plan your board, do not just fill it.')),
    sec(t('run.howto.reroll.title', 'Re-roll the next drop'), t('run.howto.reroll.p1', 'The small box above DROP shows which turret you will get. Do not like it? Tap the re-roll button beside DROP to draw a different one. Re-rolls are limited and get pricier, so save them for the turret you really need.')),
    sec(t('run.howto.preview.title', 'Wave preview'), t('run.howto.preview.p1', 'Before each wave you can see what is coming, including its modifier and any boss. Use the prep time to place the right turrets, such as splash for swarms and heavy hitters for armour.')),
    sec(t('run.howto.diff.title', 'Difficulty'), t('run.howto.diff.p1', 'Each stage has Encore levels. Higher Encores make the Static tougher and pay more Records and Fans. Start at Encore 0, win with 3 stars, then climb. Every stage is a new challenge, so check the hints on the Tour tab.')),
    sec(t('run.howto.beat.title', 'The beat'), t('run.howto.beat.p1', 'The ring on the DROP button closes in with the music. Drop on the beat for a discount and to keep your streak. Kills in a row make a combo that boosts coins.')),
    sec(t('run.howto.between.title', 'Between runs'), t('run.howto.between.p1', 'Spend Records in the Studio for permanent upgrades and new turrets. Open crates for gear, equip it on the Band tab, upgrade it and merge duplicates into higher rarities. Do daily quests and the daily challenge for diamonds.')),
    sec(t('run.howto.defeat.title', 'After a defeat'), t('run.howto.defeat.p1', 'The defeat screen shows what happened: which lane leaked most, which Static got through and a few tips. Press Share to save a picture of your board and show your friends.')),
    hasFinePointer() ? h('div', { class: 'card shortcuts', 'data-shortcuts': '' }, h('h3', null, t('run.keys.title', 'Desktop shortcuts')),
      h('div', { class: 'keys' }, shortcutRows().map(([k, d]) => h('div', { class: 'keyrow' }, h('kbd', null, k), h('span', null, d))))) : null,
    sec(t('run.howto.tips.title', 'Tips'), t('run.howto.tips.p1', 'Set turret targeting (First, Last, Strongest, Closest) by tapping a turret. Sell weak turrets late to make room. Save hero moves for bosses.')),
    h('div', { class: 'btnrow' }, btn(t('run.howto.ok', 'Got it'), () => m.close(), 'green'))), { wide: true });
}

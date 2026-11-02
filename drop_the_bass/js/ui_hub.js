// ui_hub.js: the DOM hub shown between runs. Tabs: Tour (stages), Studio (upgrades), Band (heroes and gear), Shop (crates), Goals (daily).
import { WORLDS, TURRETS, TURRET_IDS, ENEMIES, ENEMY_IDS, BOSSES, BOSS_IDS, RARITY, RARITY_ORDER, ENCORE_MAX, fmt, GAME, SYNERGIES } from './data_core.js';
import { STUDIO, STUDIO_IDS, HERO_MAX, SLOTS, SLOT_NAMES, STATS, SETS, GEAR, CRATES, CRATE_IDS, PITY, LOGIN_REWARDS, ACHIEVEMENTS, STAR_MILESTONES, AUTOMERGE_PRICE, fameReward, BOOSTERS, BOOSTER_IDS, WHEEL, WHEEL_SPIN_PRICE, GEAR_MAX_LEVEL, GEAR_SELL, fameTitle, WEEKLY_REWARD } from './data_meta.js';
import { REMIX, RELICS, DAILY_MODS } from './data_run.js';
import { TURRET_BRANCHES } from './data_depth.js';
import * as M from './meta.js';
import { fetchBoard, boardRows, cleanName, FRIENDS_MAX } from './lb.js';
import { drawStudioScene, studioProps } from './doodle_env.js';
import { t, tn, LANGS, getLangPref } from './i18n.js';
import { resetText } from './countdown.js';
import { setlistSheet } from './ui_setlist.js';
import { wardrobeSection, skinsSection, skinThumb } from './ui_wardrobe.js';
import { canInstall, promptInstall, onInstallChange, isInstalled } from './pwa.js';
export { setlistSheet };
import {
  h, canvasOf, icon, turretIcon, turretLive, gearIcon, enemyIcon, currencyChip, modal, toast, btn, rarClass, rarName, AE, AW, hubHint,
} from './ui_core.js';

const TABS = [['tour', () => t('hub.tab.tour', 'Tour'), 'play'], ['studio', () => t('hub.tab.studio', 'Studio'), 'gear'], ['band', () => t('hub.tab.band', 'Band'), 'mic'], ['shop', () => t('hub.tab.crates', 'Crates'), 'gift'], ['goals', () => t('hub.tab.goals', 'Goals'), 'star']];

export function buildHub(app, startTab) {
  const p = app.profile;
  const state = { tab: startTab || app.hubTab || 'tour', gearSlot: 'all', sel: null };
  const el = h('div', { class: 'screen' });
  const top = h('div', { class: 'hub-top' });
  const main = h('div', { class: 'hub-main' });
  const tabs = h('div', { class: 'tabs' });
  el.append(top, main, tabs);

  const renderTop = () => {
    top.replaceChildren();
    const need = M.fansToNext(p);
    top.append(
      h('div', { class: 'fame', onclick: () => fameInfo(app) },
        h('div', { class: 'lv' }, p.fame),
        h('div', { class: 'bar' }, h('div', { class: 'nm fame-title', title: t('hub.fame_title', 'Fame {n}', { n: p.fame }) }, fameTitle(p.fame)),
          h('div', { class: 'pbar fame-pbar' }, h('i', { style: 'width:' + (need === Infinity ? 100 : Math.min(100, p.fans / need * 100)) + '%' }), h('span', { class: 'fame-cnt' }, fmt(p.fans) + ' / ' + (need === Infinity ? t('common.max', 'MAX') : fmt(need)))))),
      h('div', { class: 'cur', title: t('hub.records', 'Records') }, icon('record', 26), fmt(p.records)),
      h('div', { class: 'cur', title: t('hub.diamonds', 'Diamonds') }, icon('diamond', 26), fmt(p.diamonds)),
      h('button', { class: 'iconbtn', onclick: () => { app.audio.play('ui_open'); settingsModal(app); }, 'aria-label': t('hub.settings', 'Settings') }, icon('gear', 28)),
    );
  };
  const renderTabs = () => {
    tabs.replaceChildren();
    const b = M.readyBadges(p, app.now());
    for (const [id, name, glyph] of TABS) {
      const badge = id === 'goals' ? b.goals : id === 'shop' ? (p.pendingCrates ? p.pendingCrates.length : 0) : id === 'band' ? M.mergeableGear(p).length : 0;
      tabs.append(h('button', { class: 'tab' + (state.tab === id ? ' on' : ''), onclick: () => { state.tab = id; app.hubTab = id; app.audio.play('ui_tab'); render(); main.scrollTop = 0; } },
        icon(glyph, 34), name(), badge ? h('span', { class: 'badge' }, badge) : null));
    }
  };
  const render = () => {
    const sc = main.scrollTop;
    renderTop(); renderTabs();
    main.replaceChildren(TAB_FN[state.tab](app, state, render));
    main.scrollTop = sc;
    app.save();
  };
  state.render = render;
  render();
  // Daily and Weekly countdowns: refresh the text every 20 s while this hub is on screen; a new day rebuilds the cards
  state.day = M.dayOf(app.now());
  const tickCd = () => {
    if (!el.isConnected) { if (el.__seen) clearInterval(cdTimer); return; }
    el.__seen = true;
    const now = app.now();
    if (M.dayOf(now) !== state.day) { state.day = M.dayOf(now); M.ensureDaily(p, now); render(); return; }
    for (const n of el.querySelectorAll('[data-cd]')) { const txt = resetText(n.dataset.cd === 'weekly' ? M.weeklyResetMs(now) : M.dailyResetMs(now)); if (n.textContent !== txt) n.textContent = txt; }
  };
  const cdTimer = setInterval(tickCd, 20000);
  state.tickCd = tickCd;
  return { el, render, state };
}

const TAB_FN = { tour: tourTab, studio: studioTab, band: bandTab, shop: shopTab, goals: goalsTab };

// ================================================================================================ TOUR
function stars(n, of = 3, px = 26) {
  const w = h('span', { class: 'stars' });
  for (let i = 0; i < of; i++) w.append(canvasOf(px, px, (ctx) => { ctx.globalAlpha = i < n ? 1 : 0.25; AE.drawGlyph(ctx, 'star', px / 2, px / 2, px, i < n ? '#ffc83d' : '#8a7cc0'); }));
  return w;
}
function tourTab(app, st, rerender) {
  const p = app.profile;
  const wrap = h('div');
  // loadout
  wrap.append(h('h2', null, t('tour.dropkit', 'Your Dropkit')));
  const lo = h('div', { class: 'card' },
    h('div', { class: 'row', style: 'flex-wrap:wrap' }, p.loadout.map((id) => h('div', { style: 'text-align:center;width:60px' }, turretIcon(id, 50), h('div', { class: 'sub', style: 'font-size:11px' }, TURRETS[id].name.split(' ')[0])))),
    h('div', { class: 'row', style: 'margin-top:8px' }, h('div', { class: 'grow sub' }, t('tour.pool_count', '{n}/{max} turrets in your drop pool.', { n: p.loadout.length, max: M.loadoutSize(p) })), btn(t('common.edit', 'Edit'), () => loadoutModal(app, rerender), 'dark small')));
  wrap.append(lo);
  if (p.tutorial.done) wrap.append(difficultyCard(app, rerender));

  // resume a saved run
  if (p.resume && !M.checkResume(p.resume).ok) { p.resume = null; app.save(); }
  if (p.resume) {
    const rs = M.resumeSummary(p.resume);
    wrap.append(h('div', { class: 'card', style: 'border-color:var(--green)' }, h('div', { class: 'row' }, icon('play', 40, '#9dff3a'),
      h('div', { class: 'grow' }, h('h3', null, t('tour.run_in_progress', 'Run in progress')), h('div', { class: 'sub' }, (rs.mode === 'endless' ? tn('tour.resume_info_endless', rs.turrets, '{stage}, wave {wave}, {n} turret (Endless)', '{stage}, wave {wave}, {n} turrets (Endless)', { stage: rs.stage, wave: rs.wave }) : tn('tour.resume_info', rs.turrets, '{stage}, wave {wave}, {n} turret', '{stage}, wave {wave}, {n} turrets', { stage: rs.stage, wave: rs.wave })))),
      btn(t('tour.resume', 'Resume'), () => app.resumeRun(), 'green small'), btn(t('tour.drop_run', 'Drop'), () => { p.resume = null; app.save(); rerender(); }, 'dark small'))));
  }
  // boosters
  if (p.tutorial.done) {
    p.boosters = p.boosters || {};
    const tot = M.boosterTotal(p);
    const bs = h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' });
    for (const id of BOOSTER_IDS) {
      const b = BOOSTERS[id], on = !!p.boosters[id];
      bs.append(h('button', { class: 'btn small ' + (on ? 'green' : 'dark'), style: 'flex:1 1 45%', title: b.desc, onclick: () => { M.toggleBooster(p, id); app.audio.play('ui_click'); rerender(); } }, icon(b.glyph, 22), b.name, h('span', { class: 'chip' }, icon('diamond', 14), b.price)));
    }
    wrap.append(h('div', { class: 'card' }, h('h3', null, t('tour.boosters', 'Boosters')), h('div', { class: 'sub', style: 'margin-bottom:6px' }, BOOSTER_IDS.filter((id) => p.boosters[id]).map((id) => BOOSTERS[id].desc).join(' ') || t('tour.boosters_hint', 'Optional diamond boosts for your next run. Pick any.')), bs,
      tot ? h('div', { class: 'sub', style: 'margin-top:6px' }, t('tour.boosters_cost', 'Costs {n} diamonds when the run starts.', { n: tot })) : null));
  }
  // daily challenge
  if (p.tutorial.done) {
    const dc = M.dailyChallenge(p, app.now());
    const mod = DAILY_MODS[dc.mod];
    const w = WORLDS.find((x) => x.id === dc.world);
    wrap.append(h('div', { class: 'card', style: 'border-color:var(--gold)' },
      h('div', { class: 'row' }, h('div', { class: 'ic icbox' }, icon(mod.glyph, 38)),
        h('div', { class: 'grow' }, h('h3', null, t('tour.daily_title', 'Daily Challenge: {mod}', { mod: mod.name })), h('div', { class: 'sub' }, mod.desc), h('div', { class: 'sub' }, t('tour.stage_waves', '{stage}, {n} waves', { stage: w.name, n: dc.waves })),
          h('div', { class: 'sub cd', 'data-cd': 'daily' }, resetText(M.dailyResetMs(app.now()))))),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('div', { class: 'grow sub' }, dc.done ? t('tour.daily_done', 'Reward claimed today. Play again for fun (half rewards).') : t('tour.daily_first', 'First clear today: diamonds, Records and fans!')),
        btn(icon('crown', 24), () => boardModal(app, 'daily', t('mode.daily', 'Daily Challenge')), 'dark small', { 'aria-label': t('hub.leaderboard', 'Leaderboard') }),
        btn(dc.done ? t('common.play', 'Play') : t('common.play_bang', 'Play!'), () => app.requestRun({ mode: 'daily', world: dc.world, encore: 0, seed: dc.seed, daily: dc.mod, wavesTotal: dc.waves }), dc.done ? 'dark' : 'gold'))));
    wrap.append(weeklyCard(app));
  }

  if (M.endlessUnlocked(p) && p.prog.arena.cleared) {
    wrap.append(h('div', { class: 'card', style: 'border-color:var(--red)' }, h('div', { class: 'row' }, enemyIcon('playback', 56, true),
      h('div', { class: 'grow' }, h('h3', null, t('mode.rush', 'Boss Rush')), h('div', { class: 'sub' }, t('tour.rush_desc', 'Ten bosses back to back, no breaks. Best: {best}/10. Diamonds for every boss.', { best: p.stats.rushBest || 0 }))),
      btn(t('common.play', 'Play'), () => { const m = modal(h('div', null, h('h2', null, t('mode.rush', 'Boss Rush')), h('div', { class: 'sub', style: 'text-align:center' }, t('tour.rush_pick', 'Pick the stage to fight on.')), h('div', { class: 'col', style: 'margin-top:10px' }, WORLDS.filter((w) => p.prog[w.id].cleared).map((w) => btn(w.name, () => { m.close(); app.requestRun({ mode: 'rush', world: w.id, encore: 0 }); }, 'dark'))))); }, 'red small'))));
  }
  wrap.append(h('h2', null, t('tour.title', 'The Tour')));
  const ts = M.totalStars(p);
  wrap.append(h('div', { class: 'sub', style: 'margin:-4px 2px 8px' }, t('tour.stars_hint', 'Stars {n}/{max}. Clear a stage to unlock the next. Higher Encores are tougher and pay more.', { n: ts, max: WORLDS.length * 3 * (ENCORE_MAX + 1) })));
  WORLDS.forEach((w) => {
    if (w.n === 6) wrap.append(h('h2', { class: 'tour2' }, t('tour.second_tour', 'The Second Tour')), h('div', { class: 'sub', style: 'margin:-4px 2px 8px' }, t('tour.second_tour_hint', 'Two more stages beyond the Mega Arena: a bonfire cove and the Moon.')));
    const unlocked = M.worldUnlocked(p, w.id);
    const pr = p.prog[w.id];
    const enc = st['enc_' + w.id] || 0;
    const boss = BOSSES[w.boss];
    const card = h('div', { class: 'card world' + (unlocked ? '' : '') });
    const art = h('div', { class: 'art' }, canvasOf(504, 92, (ctx) => AW.drawBackdrop(ctx, w.id, 504, 92, 0.5, { thumb: true })),
      h('div', { class: 'ttl', style: 'color:' + w.accent }, w.name), h('div', { class: 'num' }, w.n));
    const body = h('div', { class: 'body' });
    body.append(h('div', { class: 'sub' }, w.blurb));
    body.append(h('div', { class: 'row', style: 'margin:8px 0' }, enemyIcon(w.boss, 48, true),
      h('div', { class: 'grow' }, h('div', { style: 'font-weight:900' }, t('tour.boss', 'Boss: {name}', { name: boss.name })), h('div', { class: 'sub', style: 'font-size:13px' }, boss.trick))));
    const best = pr.stars[enc] || 0;
    const encRow = h('div', { class: 'row' },
      h('div', { class: 'grow' }, stars(best), h('div', { class: 'sub', style: 'font-size:13px' }, t('tour.best_wave', 'Best wave {n}/{total}', { n: pr.bestWave, total: w.wavesTotal }) + (pr.bestEndless ? '  ' + t('tour.best_endless', 'Endless {n}', { n: pr.bestEndless }) : ''))));
    if (pr.cleared) {
      const maxE = ENCORE_MAX;
      const e = h('div', { class: 'enc' },
        h('button', { onclick: () => { st['enc_' + w.id] = Math.max(0, enc - 1); rerender(); }, disabled: enc <= 0 }, '-'),
        h('div', { style: 'min-width:80px;text-align:center;font-weight:900' }, enc === 0 ? t('tour.normal', 'Normal') : t('tour.encore', 'Encore {n}', { n: enc })),
        h('button', { onclick: () => { if (M.encoreUnlocked(p, w.id, enc + 1)) st['enc_' + w.id] = Math.min(maxE, enc + 1); else toast(t('tour.win_encore_first', 'Win Encore {n} first.', { n: enc })); rerender(); }, disabled: enc >= maxE }, '+'));
      encRow.append(e);
    }
    body.append(encRow);
    const acts = h('div', { class: 'btnrow' }, btn(t('tour.play_caps', 'PLAY'), () => app.requestRun({ mode: 'story', world: w.id, encore: enc }), 'green'));
    if (pr.cleared) acts.append(btn(t('tour.endless_caps', 'ENDLESS'), () => app.requestRun({ mode: 'endless', world: w.id, encore: enc }), 'blue'), btn(icon('crown', 24), () => boardModal(app, 'endless:' + w.id, t('tour.stage_endless', '{stage} Endless', { stage: w.name })), 'dark small', { 'aria-label': t('hub.leaderboard', 'Leaderboard') }));
    body.append(acts);
    card.append(art, body);
    if (!unlocked) {
      const prev = WORLDS[w.n - 2];
      card.append(h('div', { class: 'lockbox' }, icon('lock', 44), t('tour.clear_to_unlock', 'Clear {stage} to unlock', { stage: prev.name })));
    }
    wrap.append(card);
  });
  return wrap;
}

function difficultyCard(app, rerender) {
  const p = app.profile, cur = M.difficultyOf(p);
  const seg = h('div', { class: 'seg diff' }, M.DIFFICULTY_IDS.map((id) => h('button', { class: cur === id ? 'on' : '', onclick: () => { if (cur !== id) { p.settings.difficulty = id; app.audio.play('ui_click'); app.save(); } rerender(); } }, M.difficultyInfo(id).name)));
  return h('div', { class: 'card diffcard' }, h('div', { class: 'row' }, h('h3', { style: 'margin:0' }, t('setlist.difficulty', 'Difficulty')), h('div', { class: 'grow sub', style: 'text-align:right' }, M.difficultyInfo(cur).desc)), seg,
    h('div', { class: 'sub', style: 'font-size:12px' }, t('tour.diff_hint', 'Applies to Story, Endless and Boss Rush. The Daily and Weekly Gigs are always Normal, so everyone plays the same run.')));
}
const FX_TEXT = { enemyHp: (v) => t('weekly.fx_hp', 'Static have +{n}% health', { n: Math.round((v - 1) * 100) }), rate: (v) => t('weekly.fx_rate', 'turrets fire {n}% faster', { n: Math.round((v - 1) * 100) }), coin: (v) => t('weekly.fx_coin', '+{n}% coins', { n: Math.round((v - 1) * 100) }), enemySpeed: (v) => t('weekly.fx_speed', 'Static move {n}% faster', { n: Math.round((v - 1) * 100) }) };
function weeklyCard(app) {
  const p = app.profile, wg = M.weeklyGig(p, app.now()), mod = DAILY_MODS[wg.mod], w = WORLDS.find((x) => x.id === wg.world);
  const extra = wg.extra.map(([path, , v]) => (FX_TEXT[path] ? FX_TEXT[path](v) : '')).filter(Boolean).join(', ');
  return h('div', { class: 'card weekly', style: 'border-color:var(--pink)' },
    h('div', { class: 'row' }, h('div', { class: 'ic icbox' }, icon('ticket', 38)),
      h('div', { class: 'grow' }, h('h3', null, t('weekly.title', 'Weekly Gig: {name}', { name: wg.name })), h('div', { class: 'sub' }, mod.name + ': ' + mod.desc + (extra ? ' ' + t('weekly.also', 'Also: {fx}.', { fx: extra }) : '')), h('div', { class: 'sub' }, t('weekly.info2', '{stage}, {n} waves. Same run for everyone.', { stage: w.name, n: wg.waves })),
        h('div', { class: 'sub cd', 'data-cd': 'weekly' }, resetText(M.weeklyResetMs(app.now()))))),
    h('div', { class: 'row', style: 'margin-top:8px' }, h('div', { class: 'grow sub' }, wg.done ? t('weekly.done', 'Reward claimed this week (best {best}/{total}). Replays pay half Records, no bonus.', { best: wg.best, total: wg.waves }) : t('weekly.reward', 'One big reward a week: {n}+ diamonds, Records, fans and a Studio crate for a win.', { n: WEEKLY_REWARD.diamonds + WEEKLY_REWARD.winDiamonds })),
      btn(icon('crown', 24), () => boardModal(app, 'weekly', t('weekly.title', 'Weekly Gig: {name}', { name: wg.name })), 'dark small', { 'aria-label': t('hub.leaderboard', 'Leaderboard') }),
      btn(wg.done ? t('common.play', 'Play') : t('common.play_bang', 'Play!'), () => {
        const go = () => app.requestRun({ mode: 'daily', world: wg.world, encore: 0, seed: wg.seed, daily: wg.mod, wavesTotal: wg.waves, weekly: true, weekId: wg.id, extraFx: wg.extra });
        if (!hubHint(app, 'hint_weekly', go)) go();   // the first Weekly Gig explains itself, then starts
      }, wg.done ? 'dark' : 'gold')));
}
// the next prop the Studio will grow, as a one-line hint under the backstage scene
function studioCaption(p) {
  const sp = studioProps(p.studio);
  const next = [['amps', t('studio.cap.amps', 'Bigger Speakers puts amp stacks on the stage')], ['riser', t('studio.cap.riser', 'Tight Timing builds a drum riser')], ['banner', t('studio.cap.banner', 'Showmanship hangs a banner')], ['lights', t('studio.cap.lights', 'Hype Drive strings up lights')],
    ['jar', t('studio.cap.jar', 'Tip Jar starts a tip jar')], ['truss', t('studio.cap.truss', 'Sturdy Stage raises a truss')], ['van', t('studio.cap.van', 'Roadie Rack buys a tour van')], ['cables', t('studio.cap.cables', 'Long Cables lays out cables')], ['charm', t('studio.cap.charm', 'Lucky Charm hangs a lucky clover')], ['eq', t('studio.cap.eq', 'Keep upgrading to light up the equaliser')]].find(([k]) => !sp[k]);
  if (next) return t('studio.cap.next', 'Next: {what}. Hero levels make Roxor and Jasmin glow.', { what: next[1] });
  return sp.amps >= 4 && sp.riser >= 3 && sp.van >= 3 && sp.lights >= 3 ? t('studio.cap.full', 'A full stage show! Hero levels add sparkles and a crown.') : t('studio.cap.all', 'Every prop is on stage. Keep upgrading to make them bigger.');
}

function loadoutModal(app, rerender) {
  const p = app.profile;
  const body = h('div');
  const m = modal(body);
  const draw = () => {
    body.replaceChildren(h('h2', null, t('loadout.title', 'Drop Pool')), h('div', { class: 'sub', style: 'text-align:center;margin-bottom:8px' }, t('loadout.hint', 'Every DROP picks a random turret from this pool. Choose {n}. Mix attackers with a Loop Station or Amp Stack!', { n: M.loadoutSize(p) })));
    const g = h('div', { class: 'codexgrid' });
    for (const id of TURRET_IDS) {
      const tu = TURRETS[id], own = p.turretsUnlocked[id], on = p.loadout.includes(id);
      g.append(h('div', { class: 'cdx' + (own ? '' : ' unk'), style: on ? 'border-color:var(--green)' : '', onclick: () => { if (!own) { toast(t('loadout.locked', '{name}: Fame {fame} and {records} Records (Studio).', { name: tu.name, fame: tu.unlock.fame, records: fmt(tu.unlock.records) })); return; } if (!M.toggleLoadout(p, id)) toast(t('loadout.full', 'Pool is full or empty. Remove one first.')); else app.audio.play('ui_click'); draw(); rerender(); } },
        turretIcon(id, 64), h('div', { class: 'nm' }, tu.name), h('div', { class: 'ds' }, own ? (on ? t('loadout.in_pool', 'IN POOL') : t('loadout.tap_add', 'tap to add')) : t('loadout.locked_tag', 'locked'))));
    }
    body.append(g, h('div', { class: 'btnrow' }, btn(t('common.done', 'Done'), () => m.close(), 'green')));
  };
  draw();
}

// ================================================================================================ STUDIO
function studioTab(app, st, rerender) {
  const p = app.profile;
  const wrap = h('div');
  wrap.append(h('h2', null, t('studio.title', 'The Studio')), h('div', { class: 'sub', style: 'margin:-4px 2px 8px' }, t('studio.hint', 'Permanent upgrades, bought with Records. They help in every run.')));
  wrap.append(h('div', { class: 'studio-scene' }, canvasOf(504, 170, (ctx, t) => drawStudioScene(ctx, 504, 170, t, p.studio, { heroLv: p.heroLv, outfits: p.outfits.worn }), { live: true }),
    h('div', { class: 'sub studio-cap' }, studioCaption(p))));
  hubHint(app, 'hint_studio_scene');
  const seg = h('div', { class: 'seg' });
  const sec = st.studioSec || 'up';
  for (const [id, name] of [['up', t('studio.sec.upgrades', 'Upgrades')], ['turrets', t('studio.sec.turrets', 'Turrets')], ['heroes', t('studio.sec.heroes', 'Heroes')]]) seg.append(h('button', { class: sec === id ? 'on' : '', onclick: () => { st.studioSec = id; rerender(); } }, name));
  wrap.append(seg);
  if (sec === 'up') {
    for (const id of STUDIO_IDS) {
      const u = STUDIO[id], lv = M.studioLevel(p, id), cost = M.studioCost(p, id);
      const can = cost != null && p.records >= cost;
      wrap.append(h('div', { class: 'card up' }, h('div', { class: 'ic' }, icon(u.glyph, 34)),
        h('div', { class: 'grow' }, h('div', { class: 'nm' }, u.name), h('div', { class: 'ds' }, u.desc), h('div', { class: 'pips', style: 'margin-top:4px' }, Array.from({ length: Math.min(u.max, 20) }, (_, i) => h('i', { class: i < lv ? 'on' : '' })))),
        cost == null ? h('span', { class: 'pill', style: 'color:var(--gold)' }, t('common.max', 'MAX')) : btn([icon('record', 20), fmt(cost)], () => { const r = M.buyStudio(p, id); if (r.ok) { app.audio.play('record'); app.audio.play('levelup', { vol: 0.5 }); } else app.audio.play('error'); rerender(); }, can ? 'green small' : 'dark small off')));
    }
  } else if (sec === 'turrets') {
    wrap.append(h('div', { class: 'sub', style: 'margin:0 2px 8px' }, t('studio.turrets_hint', 'New turrets join your drop pool. They need Fame level and Records.')));
    for (const id of TURRET_IDS) {
      const tu = TURRETS[id], own = p.turretsUnlocked[id];
      const c = M.canUnlockTurret(p, id);
      const perks = Object.entries(tu.perks).map(([l, d]) => t('studio.perk', 'Lv{lv}: {desc}', { lv: l, desc: d })).join('  ');
      wrap.append(h('div', { class: 'card' + (own ? '' : '') },
        h('div', { class: 'tcard' }, h('div', { class: 'ic', style: 'border-color:' + tu.color }, turretLive(id, 5, 52)),
          h('div', { class: 'grow' }, h('div', { class: 'nm', style: 'font-weight:900;font-size:19px' }, tu.name), h('div', { class: 'sub' }, tu.blurb)),
          own ? h('span', { class: 'pill', style: 'color:var(--green)' }, t('common.owned', 'OWNED'))
            : btn(c.ok ? [icon('record', 20), fmt(tu.unlock.records)] : (c.reason === 'fame' ? t('studio.need_fame', 'Fame {n}', { n: tu.unlock.fame }) : [icon('record', 20), fmt(tu.unlock.records)]), () => { const r = M.unlockTurret(p, id); if (r.ok) { app.audio.play('levelup'); toast(t('studio.turret_unlocked', '{name} unlocked and added to your pool!', { name: tu.name })); } else app.audio.play('error'); rerender(); }, c.ok ? 'gold small' : 'dark small off')),
        h('div', { class: 'sub', style: 'font-size:12px;margin-top:6px' }, perks)));
    }
  } else {
    for (const who of ['roxor', 'jasmin']) {
      const lv = p.heroLv[who], cost = M.heroUpgradeCost(p, who);
      const col = who === 'roxor' ? 'var(--green)' : 'var(--pink)';
      const name = who === 'roxor' ? t('hero.roxor.ability', 'RoxorLoops: Beatbox Blast') : t('hero.jasmin.ability', 'Jasmin: Siren Song');
      const desc = who === 'roxor' ? t('hero.roxor.desc', 'Shakes the whole stage. Hits every Static for big damage, stuns and shoves them back, and un-jams your turrets.') : t('hero.jasmin.desc', 'A sung spell. Slows every Static hard, makes them take +20% damage for a few seconds and mends the stage.');
      wrap.append(h('div', { class: 'card', style: 'border-color:' + col },
        h('div', { class: 'herocard' }, canvasOf(90, 120, (ctx, t) => AW.drawHero(ctx, who, 45, 112, 108, { t, outfit: p.outfits.worn[who], pose: 'idle' }), { live: true }),
          h('div', { class: 'grow' }, h('div', { style: 'font-weight:900;font-size:20px;color:' + col }, name), h('div', { class: 'sub' }, desc),
            h('div', { class: 'row', style: 'margin-top:6px' }, h('span', { class: 'pill' }, t('studio.hero_level', 'LEVEL {lv}/{max}', { lv, max: HERO_MAX })), cost == null ? h('span', { class: 'pill', style: 'color:var(--gold)' }, t('common.max', 'MAX')) : btn([icon('record', 20), fmt(cost)], () => { const r = M.upgradeHero(p, who); app.audio.play(r.ok ? 'levelup' : 'error'); rerender(); }, p.records >= cost ? 'green small' : 'dark small off'))))));
    }
    wrap.append(h('div', { class: 'sub', style: 'margin:0 2px' }, t('studio.heroes_hint', 'Hero levels make abilities hit harder and recharge faster.')));
  }
  return wrap;
}

// ================================================================================================ BAND (heroes and gear)
function statText(item) {
  return M.gearStatLines(item).map((l) => STATS[l.stat].label + ' ' + M.fmtStat(l.stat, l.value));
}
function bandTab(app, st, rerender) {
  const p = app.profile;
  const wrap = h('div');
  wrap.append(h('h2', null, t('band.title', 'The Band')));
  // heroes + wardrobe (every outfit drawn on the hero, buy or wear), then the stage skins
  const heroes = h('div', { class: 'row', style: 'gap:8px;margin-bottom:10px' });
  for (const who of ['roxor', 'jasmin']) {
    const col = who === 'roxor' ? 'var(--green)' : 'var(--pink)';
    heroes.append(h('div', { class: 'card grow', style: 'text-align:center;margin:0;border-color:' + col },
      canvasOf(150, 176, (ctx, t) => AW.drawHero(ctx, who, 75, 168, 138, { t, outfit: p.outfits.worn[who], pose: 'cheer' }), { live: true }),
      h('div', { style: 'font-weight:900;color:' + col }, who === 'roxor' ? 'RoxorLoops' : 'Jasmin')));
  }
  wrap.append(heroes);
  wrap.append(wardrobeSection(app, 'roxor', rerender), wardrobeSection(app, 'jasmin', rerender), skinsSection(app, rerender));
  hubHint(app, 'hint_wardrobe');
  if (M.cosmeticAffordable(p)) hubHint(app, 'hint_skin_buy');

  // equipped slots
  wrap.append(h('h3', null, t('band.equipped', 'Equipped')));
  const slots = h('div', { class: 'slots' });
  for (const s of SLOTS) {
    const g = M.gearById(p, p.gear.equipped[s]);
    const b = h('button', { class: 'gslot', 'data-rar': g ? g.rarity : null, style: g ? 'border-color:' + RARITY[g.rarity].color : '', onclick: () => { if (g) gearModal(app, g, rerender); else { st.gearSlot = s; rerender(); } } },
      g ? gearIcon(g, 64) : canvasOf(64, 64, (ctx) => { ctx.globalAlpha = 0.35; AE.drawGear(ctx, s, 'empty', 'common', 32, 32, 40); }), g ? h('span', { class: 'lv' }, g.lvl) : null);
    slots.append(b);
  }
  wrap.append(slots);
  // totals
  const tot = M.gearTotals(p);
  const lines = Object.entries(tot).map(([k, v]) => STATS[k].label + ' ' + M.fmtStat(k, v));
  const sb = M.setBonuses(p);
  wrap.append(h('div', { class: 'card' }, h('div', { class: 'sub' }, lines.length ? lines.join('  |  ') : t('band.no_gear', 'No gear equipped. Open a crate in the Crates tab!')),
    sb.length ? h('div', { style: 'margin-top:6px' }, sb.map((b) => h('div', { style: 'font-size:14px;font-weight:800;color:' + SETS[b.set].color }, t('band.set_bonus', '{name} ({n}): {text}', { name: SETS[b.set].name, n: b.count, text: b.text })))) : null,
    h('div', { class: 'sub', style: 'margin-top:6px;font-size:12px' }, Object.values(SETS).map((s) => t('band.set_pieces', '{name}: 2/3/5 pieces', { name: s.name })).join('   '))));

  // inventory
  wrap.append(h('h3', null, t('band.gear_bag', 'Gear Bag ({n})', { n: p.gear.items.length })));
  const seg = h('div', { class: 'seg' });
  for (const s of ['all'].concat(SLOTS)) seg.append(h('button', { class: st.gearSlot === s ? 'on' : '', onclick: () => { st.gearSlot = s; rerender(); } }, s === 'all' ? t('band.slot.all', 'All') : ({ head: t('band.slot.head', 'Head'), mic: t('band.slot.mic', 'Mic'), body: t('band.slot.body', 'Top'), chain: t('band.slot.chain', 'Bling'), feet: t('band.slot.feet', 'Shoes') })[s]));
  wrap.append(seg);
  const mergeable = M.mergeableGear(p);
  if (mergeable.length) {
    const grp = mergeable[0];
    wrap.append(h('div', { class: 'card', style: 'border-color:var(--gold)' }, h('div', { class: 'row' }, gearIcon(grp[0], 52), h('div', { class: 'grow' }, h('b', null, t('band.merge_ready', 'Merge ready!') + ' '), h('span', { class: 'sub' }, t('band.merge_desc', '3x {name} ({rarity}) make one {next}.', { name: GEAR[grp[0].tpl].name, rarity: rarName(grp[0].rarity), next: rarName(RARITY_ORDER[RARITY_ORDER.indexOf(grp[0].rarity) + 1]) }))),
      btn(t('band.merge_caps', 'MERGE'), () => { const r = M.mergeGear(p, grp.slice().sort((a, b) => (p.gear.equipped[GEAR[a.tpl].slot] === a.uid ? 1 : 0) - (p.gear.equipped[GEAR[b.tpl].slot] === b.uid ? 1 : 0)).slice(0, 3).map((g) => g.uid)); if (r.ok) { app.audio.play('reveal_' + (r.item.rarity)); toast(t('band.merged_into', 'Merged into {rarity} {name}!', { rarity: rarName(r.item.rarity), name: GEAR[r.item.tpl].name })); } rerender(); }, 'gold small'))));
  }
  const items = p.gear.items.filter((g) => st.gearSlot === 'all' || GEAR[g.tpl].slot === st.gearSlot)
    .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || b.lvl - a.lvl);
  const grid = h('div', { class: 'ggrid' });
  const mgKeys = new Set(mergeable.map((l) => l[0].tpl + ':' + l[0].rarity));
  for (const g of items) {
    const eq = p.gear.equipped[GEAR[g.tpl].slot] === g.uid;
    grid.append(h('button', { class: 'gitem', 'data-rar': g.rarity, style: 'border-color:' + RARITY[g.rarity].color, onclick: () => { g.fresh = false; gearModal(app, g, rerender); } },
      gearIcon(g, 64), h('span', { class: 'lv' }, g.lvl), eq ? h('span', { class: 'eq' }, t('common.on', 'ON')) : null, g.fresh ? h('span', { class: 'new' }, t('common.new', 'NEW')) : null, mgKeys.has(g.tpl + ':' + g.rarity) ? h('span', { class: 'mg' }, 'x3') : null));
  }
  if (!items.length) wrap.append(h('div', { class: 'sub', style: 'text-align:center;padding:16px' }, t('band.empty', 'Nothing here yet. Win stages and open crates to find gear.')));
  wrap.append(grid);
  return wrap;
}

export function gearModal(app, g, rerender) {
  const p = app.profile, tpl = GEAR[g.tpl];
  const body = h('div');
  const m = modal(body);
  let scrapArmed = false;
  const draw = () => {
    const eq = p.gear.equipped[tpl.slot] === g.uid;
    const cost = M.upgradeCostOf(g);
    const same = p.gear.items.filter((x) => x.tpl === g.tpl && x.rarity === g.rarity);
    body.replaceChildren(
      h('div', { style: 'text-align:center' }, canvasOf(120, 120, (ctx, t) => { AE.drawRarityFrame(ctx, g.rarity, 60, 60, 108, 108, t); AE.drawGear(ctx, tpl.slot, g.tpl, g.rarity, 60, 60, 80); }, { live: true }),
        h('h2', { style: 'margin:4px 0' }, tpl.name), h('div', { class: rarClass(g.rarity), style: 'font-weight:900' }, t('gear.line', '{rarity}  |  Level {lv}/{max}  |  {slot}', { rarity: rarName(g.rarity), lv: g.lvl, max: GEAR_MAX_LEVEL, slot: SLOT_NAMES[tpl.slot] })),
        tpl.set ? h('div', { style: 'font-weight:800;color:' + SETS[tpl.set].color }, t('gear.set', 'Set: {name}', { name: SETS[tpl.set].name })) : null),
      h('div', { class: 'card', style: 'margin-top:10px' }, M.gearStatLines(g).map((l) => h('div', { style: 'font-weight:900;font-size:19px' }, STATS[l.stat].label + ' ', h('span', { style: 'color:var(--green)' }, M.fmtStat(l.stat, l.value)), l.main ? '' : h('span', { class: 'sub' }, '  ' + t('gear.bonus', '(bonus)')))),
        RARITY_ORDER.indexOf(g.rarity) < 2 ? h('div', { class: 'sub' }, t('gear.epic_bonus', 'Epic and above also give a bonus stat.')) : null),
      h('div', { class: 'btnrow' },
        btn(eq ? t('gear.unequip', 'Unequip') : t('gear.equip', 'Equip'), () => { if (eq) M.unequipSlot(p, tpl.slot); else M.equipGear(p, g.uid); app.audio.play('ui_click'); draw(); rerender(); }, eq ? 'dark' : 'green'),
        cost == null ? btn(t('gear.max_level', 'Max level'), () => {}, 'dark off') : btn([t('gear.upgrade', 'Upgrade') + ' ', icon('record', 20), fmt(cost)], () => { const r = M.upgradeGear(p, g.uid); app.audio.play(r.ok ? 'levelup' : 'error'); draw(); rerender(); }, p.records >= cost ? 'blue' : 'dark off')),
      h('div', { class: 'btnrow' },
        btn(scrapArmed ? t('gear.scrap_confirm', 'Tap again to scrap') : [t('gear.scrap', 'Scrap +'), icon('record', 18), fmt(GEAR_SELL[g.rarity] + Math.round((g.lvl - 1) * 20))], () => { if (!scrapArmed) { scrapArmed = true; draw(); return; } const r = M.scrapGear(p, g.uid); if (r.ok) { app.audio.play('sell'); toast(t('gear.scrapped', 'Scrapped for {n} Records', { n: r.value })); } m.close(); rerender(); }, 'red small'),
        btn(t('common.close', 'Close'), () => m.close(), 'dark small')),
      same.length >= 3 && RARITY_ORDER.indexOf(g.rarity) < RARITY_ORDER.length - 1 ? h('div', { class: 'btnrow' }, btn(t('gear.merge3', 'Merge 3 into {rarity}', { rarity: rarName(RARITY_ORDER[RARITY_ORDER.indexOf(g.rarity) + 1]) }), () => { const uids = same.filter((x) => x.uid !== g.uid).slice(0, 2).map((x) => x.uid).concat([g.uid]); const r = M.mergeGear(p, uids); if (r.ok) { app.audio.play('reveal_' + r.item.rarity); toast(t('gear.merged', 'Merged!')); } m.close(); rerender(); }, 'gold')) : null,
    );
  };
  draw();
}

// ================================================================================================ SHOP (crates)
function oddsRow(tier) {
  return h('div', { class: 'odds' }, M.crateOddsTable(tier).map((o) => h('span', { class: rarClass(o.rarity) }, rarName(o.rarity) + ' ' + (o.pct >= 10 ? o.pct.toFixed(0) : o.pct.toFixed(1)).replace(/\.0$/, '') + '%')));
}
function shopTab(app, st, rerender) {
  const p = app.profile;
  const wrap = h('div');
  wrap.append(h('h2', null, t('shop.title', 'Crates')));
  if (p.pendingCrates && p.pendingCrates.length) {
    wrap.append(h('div', { class: 'card', style: 'border-color:var(--gold);animation:glow 2s infinite' }, h('div', { class: 'row' }, canvasOf(70, 60, (ctx, t) => AE.drawCrate(ctx, p.pendingCrates[0], 35, 32, 56, { t, shake: 0.5 }), { live: true }),
      h('div', { class: 'grow' }, h('b', null, tn('shop.free_crates', p.pendingCrates.length, 'You have {n} free crate!', 'You have {n} free crates!'))),
      btn(t('shop.open', 'Open'), () => { const tier = p.pendingCrates.shift(); if (!p.pendingCrates.length) delete p.pendingCrates; const items = M.openCrateFree(p, tier, app.rng()); crateOpening(app, tier, items, rerender); }, 'gold'))));
  }
  for (const id of CRATE_IDS) {
    const c = CRATES[id];
    const ok = M.canAfford(p, c.price);
    const priceIcon = c.price.records ? 'record' : 'diamond';
    const priceN = c.price.records || c.price.diamonds;
    const crateCv = canvasOf(150, 130, (ctx, t) => AE.drawCrate(ctx, id, 75, 70, 110, { t }), { live: true });
    crateCv.classList.add('cr');
    wrap.append(h('div', { class: 'card cratecard' }, crateCv,
      h('h3', null, c.name), h('div', { class: 'sub' }, c.blurb + (c.items > 1 ? ' ' + t('shop.items_n', '({n} items)', { n: c.items }) : '')), oddsRow(id),
      btn([icon(priceIcon, 24), fmt(priceN)], () => { const r = M.buyCrate(p, id, app.rng()); if (!r.ok) { app.audio.play('error'); toast(c.price.records ? t('shop.no_records', 'Not enough Records.') : t('shop.no_diamonds', 'Not enough diamonds.')); return; } crateOpening(app, id, r.items, rerender); }, ok ? 'gold' : 'dark off')));
  }
  wrap.append(h('div', { class: 'sub', style: 'margin:0 2px 10px' }, t('shop.pity', 'Pity timer: an Epic is guaranteed within {epic} items and a Legendary within {leg}. Items so far since last: Epic {sinceEpic}, Legendary {sinceLeg}. Duplicates are never wasted: merge 3 of the same into the next rarity.', { epic: PITY.epicEvery, leg: PITY.legendaryEvery, sinceEpic: p.crate.sinceEpic, sinceLeg: p.crate.sinceLegend })));
  // special offers
  wrap.append(h('h2', null, t('shop.upgrades', 'Upgrades')));
  wrap.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'ic icbox' }, icon('merge', 38)),
    h('div', { class: 'grow' }, h('h3', null, t('shop.automerge', 'Auto-Merge Rack')), h('div', { class: 'sub' }, t('shop.automerge_desc', 'Unlocks the MERGE button in battle: merges every matching pair with one tap.'))),
    p.autoMerge ? h('span', { class: 'pill', style: 'color:var(--green)' }, t('common.owned', 'OWNED')) : btn([icon('diamond', 22), AUTOMERGE_PRICE], () => { const r = M.buyAutoMerge(p); app.audio.play(r.ok ? 'levelup' : 'error'); if (!r.ok) toast(t('shop.need_diamonds', 'Need {n} diamonds. Win stages and finish quests to earn them!', { n: AUTOMERGE_PRICE })); rerender(); }, p.diamonds >= AUTOMERGE_PRICE ? 'gold small' : 'dark small off'))));
  wrap.append(h('div', { class: 'sub', style: 'margin:0 2px' }, t('shop.diamonds_note', 'Diamonds are earned in the game only: first clears, stars, bosses, quests, stickers and daily rewards. Nothing here costs real money.')));
  return wrap;
}

export function crateOpening(app, tier, items, rerender) {
  const body = h('div', { class: 'opening' });
  const m = modal(body, { sticky: true });
  let phase = 0;
  const best = items.reduce((b, g) => (RARITY_ORDER.indexOf(g.rarity) > RARITY_ORDER.indexOf(b) ? g.rarity : b), 'common');
  const cv = canvasOf(220, 190, (ctx, t) => AE.drawCrate(ctx, tier, 110, 100, 170, { t, shake: phase === 0 ? 1 : 0, open: phase === 1 ? Math.min(1, (performance.now() - (body.__t0 || 0)) / 400) : 0 }), { live: true });
  cv.classList.add('cr'); if (!app.profile.settings.reduce) cv.classList.add('shake');
  body.append(h('h2', null, CRATES[tier].name), cv, h('div', { class: 'sub' }, t('crate.tap', 'Tap the crate!')));
  app.audio.play('crate_shake');
  const reveal = () => {
    if (phase) return; phase = 1; body.__t0 = performance.now();
    app.audio.play('crate_open');
    setTimeout(() => {
      body.replaceChildren(h('h2', null, t('crate.you_got', 'You got!')));
      const row = h('div', { class: 'reveal' });
      body.append(row);
      items.forEach((g, i) => {
        setTimeout(() => {
          app.audio.play('reveal_' + g.rarity);
          row.append(h('div', { class: 'revi' }, gearIcon(g, 120), h('div', { style: 'font-weight:900' }, GEAR[g.tpl].name), h('div', { class: rarClass(g.rarity), style: 'font-weight:900' }, rarName(g.rarity)), h('div', { class: 'sub', style: 'font-size:13px' }, statText(g).join(', '))));
          if (i === items.length - 1) body.append(h('div', { class: 'btnrow', style: 'width:100%' }, btn(t('crate.nice', 'Nice!'), () => { m.close(); rerender && rerender(); }, 'green')));
        }, 500 + i * 650);
      });
    }, 550);
  };
  cv.addEventListener('pointerdown', reveal);
  setTimeout(reveal, 3500);
}

// ================================================================================================ GOALS
function rewardChips(r) {
  return h('span', { class: 'row', style: 'gap:6px' }, r.records ? currencyChip('records', fmt(r.records)) : null, r.diamonds ? currencyChip('diamonds', r.diamonds) : null, r.crate ? h('span', { class: 'chip' }, icon('gift', 18), CRATES[r.crate].name.split(' ')[0]) : null);
}
function goalsTab(app, st, rerender) {
  const p = app.profile, now = app.now();
  M.ensureDaily(p, now);
  const wrap = h('div');
  const off = M.offlineRecords(p, now);
  if (off >= 10) wrap.append(h('div', { class: 'card', style: 'border-color:var(--record)' }, h('div', { class: 'row' }, icon('note', 40), h('div', { class: 'grow' }, h('b', null, t('goals.royalties', 'Streaming Royalties')), h('div', { class: 'sub' }, t('goals.royalties_desc', 'Your songs kept playing while you were away: {n} Records ({rate}/hour, max {hours} hours).', { n: off, rate: M.offlineRate(p), hours: M.offlineCapHours(p) }))),
    btn(t('goals.claim', 'Claim'), () => { M.claimOffline(p, now); app.audio.play('record'); rerender(); }, 'green small'))));
  // lucky wheel
  wrap.append(h('h2', null, t('goals.wheel', 'Lucky Wheel')));
  wrap.append(wheelCard(app, rerender));
  // login
  const ls = M.loginStatus(p, now);
  wrap.append(h('h2', null, t('goals.daily_gig', 'Daily Gig')));
  const cal = h('div', { class: 'cal' });
  LOGIN_REWARDS.forEach((r, i) => {
    const cur = i === ls.idx && ls.claimable, done = (i < ls.idx) || (i === ls.idx && !ls.claimable);
    cal.append(h('div', { class: 'day' + (cur ? ' cur2' : '') + (done ? ' done' : '') }, t('goals.day', 'Day {n}', { n: r.day }), icon(r.crate ? 'gift' : r.diamonds ? 'diamond' : 'record', 30), h('span', { style: 'font-size:11px' }, r.diamonds ? r.diamonds : r.records)));
  });
  wrap.append(h('div', { class: 'card' }, cal, h('div', { class: 'row', style: 'margin-top:8px' }, h('div', { class: 'grow sub' }, tn('goals.streak', Math.max(p.login.streak, 0), 'Streak: {n} day', 'Streak: {n} days')),
    btn(ls.claimable ? t('goals.claim_day', 'Claim Day {n}', { n: ls.reward.day }) : t('goals.come_back', 'Come back tomorrow'), () => { const r = M.claimLogin(p, now, app.rng()); if (r.ok) { app.audio.play('chest'); if (r.loot.length) crateOpening(app, ls.reward.crate, r.loot, rerender); else toast(t('goals.daily_claimed', 'Daily reward claimed!')); } rerender(); }, ls.claimable ? 'gold' : 'dark off'))));
  // quests
  wrap.append(h('h2', null, t('goals.quests', 'Daily Quests')));
  p.daily.quests.forEach((slot) => {
    const q = M.questDef(slot.id), prog = M.questProgress(p, q), done = prog >= q.goal;
    wrap.append(h('div', { class: 'card quest' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { style: 'font-weight:900' }, q.text), h('div', { class: 'pbar' }, h('i', { style: 'width:' + prog / q.goal * 100 + '%' })), h('div', { class: 'sub', style: 'font-size:12px' }, fmt(prog) + ' / ' + fmt(q.goal))), rewardChips(q.reward),
      slot.claimed ? h('span', { class: 'pill' }, t('goals.done_caps', 'DONE')) : btn(done ? t('goals.claim', 'Claim') : t('goals.swap', 'Swap'), () => { if (done) { M.claimQuest(p, q.id); app.audio.play('diamond'); } else { const r = M.rerollQuest(p, q.id, app.rng()); if (!r.ok) toast(t('goals.one_swap', 'One swap per day.')); } rerender(); }, done ? 'gold small' : (p.daily.rerolled ? 'dark small off' : 'dark small')))));
  });
  // star milestones
  wrap.append(h('h2', null, t('goals.star_chests', 'Star Chests')), h('div', { class: 'sub', style: 'margin:-4px 2px 6px' }, t('goals.you_have_stars', 'You have {n} stars.', { n: M.totalStars(p) })));
  const ms = h('div', { class: 'star-ms' });
  for (const m of STAR_MILESTONES) {
    const got = p.starClaimed[m.stars], ready = !got && M.totalStars(p) >= m.stars;
    ms.append(h('div', { class: 'ms' + (ready ? ' ready' : '') + (got ? ' got' : ''), onclick: () => { if (ready) { const r = M.claimStarMilestone(p, m.stars, app.rng()); app.audio.play('chest'); if (r.loot && r.loot.length) crateOpening(app, m.reward.crate, r.loot, rerender); rerender(); } else if (!got) toast(t('goals.collect_stars', 'Collect {n} stars ({have} so far).', { n: m.stars, have: M.totalStars(p) })); } },
      icon('star', 34, got ? '#8a7cc0' : '#ffc83d'), h('div', null, m.stars), rewardChips(m.reward)));
  }
  wrap.append(ms);
  // achievements
  wrap.append(h('h2', null, t('goals.stickers', 'Stickers')));
  const list = ACHIEVEMENTS.slice().sort((a, b) => { const sa = M.achievementState(p, a), sb = M.achievementState(p, b); return (sb.done && !sb.claimed) - (sa.done && !sa.claimed) || (sa.claimed - sb.claimed); });
  for (const a of list) {
    const s = M.achievementState(p, a);
    wrap.append(h('div', { class: 'card ach' + (s.done ? ' done' : ''), style: 'margin-bottom:8px' }, icon(s.claimed ? 'check' : 'star', 36, s.done ? '#ffc83d' : '#8a7cc0'),
      h('div', { class: 'grow' }, h('div', { class: 'nm', style: 'font-weight:900' }, a.name), h('div', { class: 'sub', style: 'font-size:13px' }, a.text), h('div', { class: 'pbar', style: 'height:10px;margin-top:3px' }, h('i', { style: 'width:' + s.value / a.goal * 100 + '%' })), h('div', { class: 'sub', style: 'font-size:11px' }, fmt(s.value) + ' / ' + fmt(a.goal))),
      s.claimed ? h('span', { class: 'pill' }, t('goals.got_caps', 'GOT')) : btn([icon('diamond', 20), a.diamonds], () => { if (M.claimAchievement(p, a.id).ok) app.audio.play('achievement'); rerender(); }, s.done ? 'gold small' : 'dark small off')));
  }
  return wrap;
}

// ================================================================================================ extras: fame info, codex, settings
function fameInfo(app) {
  const p = app.profile;
  const body = h('div');
  const m = modal(body);
  body.append(h('h2', null, t('hub.fame_title', 'Fame {n}', { n: p.fame })), h('div', { class: 'sub', style: 'text-align:center' }, t('fame.hint', 'Earn fans by clearing waves and stages. Each Fame level pays out diamonds and Records, and unlocks turrets in the Studio.')));
  const upcoming = [];
  for (let l = p.fame + 1; l <= Math.min(p.fame + 5, 50); l++) upcoming.push(l);
  for (const l of upcoming) {
    const r = fameReward(l);
    body.append(h('div', { class: 'card', style: 'margin:8px 0 0;padding:8px' }, h('div', { class: 'row' }, h('div', { style: 'font-weight:900;width:70px' }, t('fame.level', 'Level {n}', { n: l })), rewardChips(r), r.unlocks ? h('span', { class: 'chip' }, t('fame.unlocks', 'Unlocks {list}', { list: r.unlocks.map((i) => TURRETS[i].name).join(', ') })) : null)));
  }
  body.append(h('div', { class: 'btnrow' }, btn(t('common.close', 'Close'), () => m.close(), 'dark')));
}

export function codexModal(app) {
  const p = app.profile;
  const body = h('div');
  const m = modal(body, { wide: true });
  let sec = 'turrets';
  const draw = () => {
    body.replaceChildren(h('h2', null, t('codex.title', 'Codex')));
    const seg = h('div', { class: 'seg' });
    for (const [id, nm] of [['turrets', t('codex.turrets', 'Turrets')], ['enemies', t('codex.static', 'Static')], ['bosses', t('codex.bosses', 'Bosses')], ['branches', t('codex.branches', 'Paths')], ['synergies', t('codex.synergies', 'Pairs')], ['remix', t('codex.remix', 'Remix')], ['relics', t('codex.merch', 'Merch')], ['looks', t('codex.looks', 'Looks')]]) seg.append(h('button', { class: sec === id ? 'on' : '', onclick: () => { sec = id; draw(); body.parentElement.scrollTop = 0; } }, nm));
    body.append(seg);
    seg.classList.add('codex-seg');
    const g = h('div', { class: 'codexgrid' });
    if (sec === 'branches') {
      g.classList.add('cdx-list');
      body.append(h('div', { class: 'sub', style: 'text-align:center;margin-bottom:6px' }, t('codex.branches_hint', 'A level 4 turret can pick one of two upgrade paths. The choice is permanent for that turret.')));
      for (const id of TURRET_IDS) {
        const list = TURRET_BRANCHES[id]; if (!list) continue;
        const own = p.turretsUnlocked[id];
        g.append(h('div', { class: 'cdx-row' + (own ? '' : ' unk'), 'data-branches': id }, h('div', { class: 'cdx-who' }, turretIcon(id, 56), h('div', { class: 'nm' }, TURRETS[id].name)),
          h('div', { class: 'cdx-pair' }, list.map((b) => h('div', { class: 'cdx cdx-b', 'data-branch': b.id }, icon(b.glyph, 34, TURRETS[id].color), h('div', { class: 'nm' }, b.name), h('div', { class: 'ds' }, b.desc))))));
      }
    }
    if (sec === 'synergies') {
      g.classList.add('cdx-list');
      body.append(h('div', { class: 'sub', style: 'text-align:center;margin-bottom:6px' }, t('codex.synergies_hint', 'Put these pairs side by side (not diagonal) and they boost each other.')));
      for (const sy of SYNERGIES) {
        const have = p.turretsUnlocked[sy.a] && p.turretsUnlocked[sy.b];
        g.append(h('div', { class: 'cdx cdx-syn' + (have ? '' : ' unk'), 'data-syn': sy.id }, h('div', { class: 'syn-ic' }, turretIcon(sy.a, 46), icon('plus', 20), turretIcon(sy.b, 46)),
          h('div', { class: 'nm' }, sy.name), h('div', { class: 'ds' }, sy.desc), h('div', { class: 'ds syn-who' }, TURRETS[sy.a].name + ' + ' + TURRETS[sy.b].name)));
      }
    }
    if (sec === 'looks') {
      g.classList.add('cdx-list');
      for (const who of ['roxor', 'jasmin']) {
        body.append(h('h3', { style: 'margin:8px 0 4px;color:' + (who === 'roxor' ? 'var(--green)' : 'var(--pink)') }, who === 'roxor' ? 'RoxorLoops' : 'Jasmin'));
        const row = h('div', { class: 'codexgrid' });
        for (const o of M.outfitList(p, who)) row.append(h('div', { class: 'cdx' + (o.owned ? '' : ' unk'), 'data-outfit': who + ':' + o.id }, canvasOf(70, 92, (ctx) => AW.drawHero(ctx, who, 35, 88, 84, { t: 0.4, outfit: o.id, pose: 'idle' })), h('div', { class: 'nm' }, o.name), h('div', { class: 'ds' }, o.desc)));
        body.append(row);
      }
      const row = h('div', { class: 'codexgrid' });
      body.append(h('h3', { style: 'margin:8px 0 4px' }, t('ward.skins', 'Stage skins')));
      for (const sk of M.skinList(p, AW.BOARD_SKINS || null)) row.append(h('div', { class: 'cdx' + (sk.owned ? '' : ' unk'), 'data-skin': sk.id }, skinThumb(sk.id, 70, 98), h('div', { class: 'nm' }, sk.name), h('div', { class: 'ds' }, sk.desc)));
      body.append(row);
    }
    if (sec === 'turrets') for (const id of TURRET_IDS) { const tu = TURRETS[id]; const own = p.turretsUnlocked[id]; g.append(h('div', { class: 'cdx' + (own ? '' : ' unk') }, turretLive(id, 4, 72), h('div', { class: 'nm' }, own ? tu.name : '???'), h('div', { class: 'ds' }, own ? tu.blurb : t('studio.need_fame', 'Fame {n}', { n: tu.unlock.fame })))); }
    if (sec === 'enemies') for (const id of ENEMY_IDS) { const e = ENEMIES[id]; if (e.hidden) continue; const seen = p.seen.enemies[id]; g.append(h('div', { class: 'cdx' + (seen ? '' : ' unk') }, enemyIcon(id, 70), h('div', { class: 'nm' }, seen ? e.name : '???'), h('div', { class: 'ds' }, seen ? e.blurb : t('codex.not_met', 'Not met yet')))); }
    if (sec === 'bosses') for (const id of BOSS_IDS) { const b = BOSSES[id]; const seen = p.seen.bosses[id] || p.bossesSeen[id]; g.append(h('div', { class: 'cdx' + (seen ? '' : ' unk') }, enemyIcon(id, 80, true), h('div', { class: 'nm' }, seen ? b.name : '???'), h('div', { class: 'ds' }, seen ? b.trick : t('codex.not_met', 'Not met yet')))); }
    if (sec === 'remix') for (const c of Object.values(REMIX)) g.append(h('div', { class: 'cdx' }, icon(c.glyph, 44, RARITY[c.rarity].color), h('div', { class: 'nm ' + rarClass(c.rarity) }, c.name), h('div', { class: 'ds' }, c.desc)));
    if (sec === 'relics') for (const c of Object.values(RELICS)) g.append(h('div', { class: 'cdx' }, icon(c.glyph, 44, RARITY[c.rarity].color), h('div', { class: 'nm ' + rarClass(c.rarity) }, c.name), h('div', { class: 'ds' }, c.desc)));
    if (g.children.length) body.append(g);
    body.append(h('div', { class: 'btnrow' }, btn(t('common.close', 'Close'), () => m.close(), 'dark')));
  };
  draw();
}

export function settingsModal(app) {
  const p = app.profile, s = p.settings;
  const body = h('div');
  const m = modal(body);
  const draw = () => {
    body.replaceChildren(h('h2', null, t('settings.title', 'Settings')));
    const slider = (label, key, apply) => h('div', { class: 'rangeRow' }, h('span', { style: 'width:80px' }, label), h('input', { type: 'range', min: 0, max: 100, value: Math.round(s[key] * 100), oninput: (e) => { s[key] = e.target.value / 100; apply(); app.save(); }, onchange: () => app.audio.play('ui_click') }));
    // Install the app: hidden once installed; Safari on iOS has no prompt, so it gets a how-to hint instead
    const installRow = () => {
      if (isInstalled()) return null;
      const row = h('div', { class: 'install-row' });
      const fill = () => {
        row.replaceChildren();
        if (isInstalled()) return;
        if (canInstall()) row.append(h('div', { class: 'toggle' }, t('settings.install_app', 'Install the app'), btn(t('settings.install', 'Install'), async () => { const r = await promptInstall(); if (r === 'accepted') toast(t('settings.installed', 'Installed! Look for it on your home screen.')); fill(); }, 'gold small')));
        else row.append(h('div', { class: 'sub install-hint', style: 'font-size:15px' }, t('settings.install_hint', 'Install: in Safari tap Share, then Add to Home Screen. Chrome and Edge offer an Install button when the game is ready.')));
      };
      fill();
      const off = onInstallChange(() => { if (!row.isConnected) { off(); return; } fill(); });
      return row;
    };
    const help = (txt) => h('div', { class: 'sub set-help' }, txt);
    const tog = (label, key) => h('div', { class: 'toggle' }, label, btn(s[key] ? t('common.on', 'ON') : t('common.off', 'OFF'), () => { s[key] = !s[key]; app.applySettings(); app.save(); draw(); }, s[key] ? 'green small' : 'dark small'));
    body.append(slider(t('settings.music', 'Music'), 'music', () => app.applySettings()), slider(t('settings.sound', 'Sound'), 'sfx', () => app.applySettings()),
      tog(t('settings.shake', 'Screen shake'), 'shake'), tog(t('settings.numbers', 'Damage numbers'), 'numbers'), tog(t('settings.vibration', 'Vibration'), 'vibrate'), tog(t('settings.beat', 'Beat helper (DROP ring)'), 'beat'), tog(t('settings.reduce', 'Reduce motion'), 'reduce'), tog(t('settings.lowfx', 'Low graphics (faster)'), 'lowfx'),
      tog(t('settings.autolow', 'Auto low graphics when slow'), 'autolow'), help(t('settings.autolow_hint', 'If a battle runs slowly for a few seconds, Low graphics turns on by itself.')));
    body.append(h('div', { class: 'hr' }), h('h3', null, t('settings.access', 'Accessibility')),
      tog(t('settings.bigtext', 'Larger text'), 'bigtext'), help(t('settings.bigtext_hint', 'Makes menu and battle text bigger.')),
      tog(t('settings.colorblind', 'Colour-blind cues'), 'colorblind'), help(t('settings.colorblind_hint', 'Adds shapes and marks next to colours: rarity, risk, on and off.')));
    body.append(tog2(t('settings.show_setlist', 'Show the Setlist before a run'), !s.skipSetlist, () => { s.skipSetlist = !s.skipSetlist; app.save(); draw(); }));
    body.append(tog(t('settings.analytics', 'Share anonymous play stats'), 'analytics'), h('div', { class: 'sub set-help' }, t('settings.analytics_hint', 'Helps balance the game. No names or identifiers are sent.')));
    body.append(h('div', { class: 'hr' }), h('h3', null, t('settings.language', 'Language')), langPicker(app, true, draw));
    body.append(installRow());
    if (p.autoMerge) body.append(tog2(t('settings.automerge', 'Auto-merge after each drop'), p.autoMergeOn, () => { p.autoMergeOn = !p.autoMergeOn; app.save(); draw(); }));
    body.append(h('div', { class: 'hr' }), h('h3', null, t('settings.lb_name', 'Leaderboard name')), h('input', { type: 'text', maxlength: 16, value: p.name || '', placeholder: t('settings.name_ph', 'Your name (optional)'), style: 'width:100%;font:400 20px var(--hand,sans-serif);padding:10px;border-radius:10px;border:3px solid var(--line)', oninput: (e) => { p.name = e.target.value.replace(/[^\w \-.']/g, '').slice(0, 16); app.save(); } }));
    body.append(h('div', { class: 'hr' }), h('h3', null, t('settings.save_data', 'Save data')), h('div', { class: 'sub' }, t('settings.save_hint', 'Your progress is saved on this device. Copy the code to move it to another device.')));
    const ta = h('textarea', { class: 'code', readonly: true }, M.exportCode(p));
    body.append(ta, h('div', { class: 'btnrow' }, btn(t('settings.copy_code', 'Copy code'), () => { ta.select(); const fb = () => { try { document.execCommand('copy'); toast(t('settings.copied', 'Copied!')); } catch (e) { toast(t('settings.copy_by_hand', 'Select the code and copy it by hand.')); } }; try { navigator.clipboard.writeText(ta.value).then(() => toast(t('settings.copied', 'Copied!')), fb); } catch (e) { fb(); } }, 'blue small'),
      btn(t('settings.import_code', 'Import code'), () => importModal(app), 'dark small')));
    body.append(h('div', { class: 'btnrow' }, btn(t('settings.how_to', 'How to play'), () => { m.close(); app.showHowTo(); }, 'dark small'), btn(t('codex.title', 'Codex'), () => { m.close(); codexModal(app); }, 'dark small')));
    body.append(h('div', { class: 'btnrow' }, btn(t('settings.replay_intro', 'Replay intro'), () => { m.close(); app.playCutscene('intro', () => app.openHub()); }, 'dark small'), btn(t('settings.reset', 'Reset game'), () => resetModal(app), 'red small')));
    body.append(h('div', { class: 'credit', style: 'text-align:center;margin-top:10px;font-size:12px;color:var(--dim)' }, t('settings.credit', '{title} by RoxorLoops & Jasmin. Keyboard: Space drop, M merge all, Q/W heroes, N next wave, F speed, Esc pause.', { title: GAME.title })));
    body.append(h('div', { class: 'btnrow' }, btn(t('common.close', 'Close'), () => m.close(), 'green')));
  };
  draw();
}
function tog2(label, on, fn) { return h('div', { class: 'toggle' }, label, btn(on ? t('common.on', 'ON') : t('common.off', 'OFF'), fn, on ? 'green small' : 'dark small')); }
function importModal(app) {
  const ta = h('textarea', { class: 'code', placeholder: t('import.placeholder', 'Paste your save code here (it starts with DTB1.)') });
  const body = h('div');
  const m = modal(body);
  const ask = () => body.replaceChildren(h('h2', null, t('import.title', 'Import save')), h('div', { class: 'sub' }, t('import.hint', 'This replaces the progress on this device. Your current save is kept as a backup first.')), ta,
    h('div', { class: 'btnrow' }, btn(t('import.check', 'Check code'), () => {
      const np = M.importCode(ta.value, app.now());
      if (!np) { toast(t('import.bad', 'That code did not work. Copy the whole code, from DTB1 to the end.'), 3600); app.audio.play('error'); return; }
      body.replaceChildren(h('h2', null, t('import.found', 'Found a save')), h('div', { class: 'sub', style: 'text-align:center' }, t('import.summary', 'Fame {fame} ({title}), {records} Records, {diamonds} diamonds, {stages} stages cleared.', { fame: np.fame, title: fameTitle(np.fame), records: fmt(np.records), diamonds: fmt(np.diamonds), stages: M.clearedCount(np) })),
        h('div', { class: 'btnrow' }, btn(t('import.replace', 'Replace my save'), () => { app.replaceProfile(np); m.close(); toast(t('import.done', 'Save imported!')); }, 'green'), btn(t('common.back', 'Back'), ask, 'dark')));
    }, 'green'), btn(t('common.cancel', 'Cancel'), () => m.close(), 'dark')));
  ask();
}
function resetModal(app) {
  const m = modal(h('div', null, h('h2', null, t('reset.title', 'Reset everything?')), h('div', { class: 'sub', style: 'text-align:center' }, t('reset.hint', 'This deletes all progress on this device. It cannot be undone.')),
    h('div', { class: 'btnrow' }, btn(t('reset.delete', 'Delete it all'), () => { app.replaceProfile(M.newProfile(app.now())); m.close(); app.showTitle(); }, 'red'), btn(t('reset.keep', 'Keep playing'), () => m.close(), 'green'))));
}

// ================================================================================================ lucky wheel and leaderboard
function wheelCard(app, rerender) {
  const p = app.profile, now = app.now();
  const st = M.wheelState(p, now);
  const seg = Math.PI * 2 / WHEEL.length;
  const wlab = (w) => (w.id === 'c1' ? t('wheel.crate', 'Crate') : w.id === 'c2' ? t('wheel.studio', 'Studio') : w.label);
  const anim = { a: 0, from: 0, to: 0, t0: 0, dur: 0, spinning: false };
  const cv = canvasOf(240, 250, (ctx, t) => {
    if (anim.spinning) { const k = Math.min(1, (performance.now() - anim.t0) / anim.dur); const e = 1 - Math.pow(1 - k, 3); anim.a = anim.from + (anim.to - anim.from) * e; if (k >= 1) anim.spinning = false; }
    ctx.save(); ctx.translate(120, 135);
    ctx.save(); ctx.rotate(anim.a);
    WHEEL.forEach((w, i) => {
      const a0 = -Math.PI / 2 + i * seg, a1 = a0 + seg;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 108, a0, a1); ctx.closePath();
      ctx.fillStyle = ['#ff8cc6', '#b79af0', '#7fd6f5', '#ffd95a'][i % 4]; ctx.fill(); ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = '#2b2733'; ctx.stroke();
      ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(43,39,51,0.16)'; ctx.lineWidth = 2; ctx.beginPath(); for (let k = -120; k < 120; k += 9) { ctx.moveTo(k, -110); ctx.lineTo(k + 60, 110); } ctx.stroke(); ctx.restore();
      ctx.save(); ctx.rotate(a0 + seg / 2); AE.drawGlyph(ctx, w.glyph, 74, 0, 26, '#fff');
      ctx.translate(48, 0); ctx.rotate(Math.PI / 2 * 0); ctx.fillStyle = '#fff'; ctx.font = '400 16px "Patrick Hand","Comic Sans MS",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeStyle = '#2b2733'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeText(wlab(w), 0, 0); ctx.fillText(wlab(w), 0, 0); ctx.restore();
    });
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fillStyle = '#ffd60a'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#2b2733'; ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(120, 36); ctx.lineTo(108, 10); ctx.lineTo(132, 10); ctx.closePath(); ctx.fillStyle = '#e8403f'; ctx.fill(); ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = '#2b2733'; ctx.stroke();
  }, { live: true });
  const label = h('div', { class: 'sub', style: 'text-align:center' }, st.free ? t('wheel.free_ready', 'Your free daily spin is ready!') : t('wheel.come_back', 'Come back tomorrow for a free spin, or spin for {n} diamonds.', { n: WHEEL_SPIN_PRICE }));
  let busy = false;
  const spin = btn(st.free ? t('wheel.spin_free', 'SPIN!') : [icon('diamond', 20), t('wheel.spin_paid', '{n} Spin', { n: WHEEL_SPIN_PRICE })], () => {
    if (busy) return;
    const r = M.spinWheel(p, now, app.rng());
    if (!r.ok) { app.audio.play('error'); toast(t('wheel.need', 'Need {n} diamonds.', { n: WHEEL_SPIN_PRICE })); return; }
    busy = true; app.audio.play('crate_shake');
    anim.from = anim.a % (Math.PI * 2); anim.to = anim.from + Math.PI * 2 * 5 + ((-(r.index * seg + seg / 2) - anim.from) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); anim.t0 = performance.now(); anim.dur = 3600; anim.spinning = true;
    let ticks = 0; const tk = setInterval(() => { if (!anim.spinning) { clearInterval(tk); return; } app.audio.play('tick', { vol: 0.4, pitch: 1 + (ticks++ % 3) * 0.05 }); }, 140);
    setTimeout(() => { app.audio.play('reveal_' + (r.seg.reward.crate || r.seg.reward.diamonds >= 10 ? 'epic' : 'rare')); toast(r.seg.reward.records ? t('wheel.won_records', 'You won {n} Records!', { n: r.seg.label }) : r.seg.reward.diamonds ? t('wheel.won_diamonds', 'You won {n} diamonds!', { n: r.seg.label }) : t('wheel.won_crate', 'You won a crate!'), 2600); if (r.loot && r.loot.length) crateOpening(app, r.seg.reward.crate, r.loot, rerender); else rerender(); }, 3800);
  }, st.free ? 'gold big' : 'blue');
  return h('div', { class: 'card', style: 'text-align:center' }, cv, label, h('div', { style: 'margin-top:8px' }, spin));
}

export function boardModal(app, id, title) {
  const p = app.profile;
  const state = { tab: 'all', top: undefined, msg: '' };
  const body = h('div');
  const m = modal(body);
  const addFriend = (name) => {
    const r = M.addFriend(p, name);
    state.msg = r.ok ? t('board.added', 'Added {name} to your friends.', { name: r.name }) : ({ empty: t('board.err_empty', 'Type a name first.'), self: t('board.err_self', 'That is you!'), dup: t('board.err_dup', 'Already a friend.'), full: t('board.err_full', 'Your friend list is full ({max}).', { max: FRIENDS_MAX }) })[r.reason];
    if (r.ok) app.audio.play('ui_click'); else app.audio.play('error');
    app.save(); draw();
  };
  const draw = () => {
    body.replaceChildren(h('h2', null, title));
    const seg = h('div', { class: 'seg' });
    for (const [tid, nm] of [['all', t('board.all', 'All')], ['friends', t('board.friends', 'Friends ({n})', { n: p.friends.length })]]) seg.append(h('button', { class: state.tab === tid ? 'on' : '', onclick: () => { state.tab = tid; state.msg = ''; draw(); } }, nm));
    body.append(seg);
    if (state.top === undefined) body.append(h('div', { class: 'sub', style: 'text-align:center;padding:14px' }, t('board.loading', 'Loading...')));
    else {
      if (!state.top) body.append(h('div', { class: 'sub', style: 'text-align:center;padding:10px' }, t('board.offline', 'The leaderboard is offline right now. Your own best is still saved.')));
      else if (!state.top.length) body.append(h('div', { class: 'sub', style: 'text-align:center;padding:10px' }, t('board.empty', 'No scores yet. Be the first!')));
      const rows = boardRows(state.top || [], p.friends, p.name, state.tab);
      if (state.tab === 'friends' && !p.friends.length) body.append(h('div', { class: 'sub', style: 'text-align:center;padding:10px' }, t('board.no_friends', 'Add friends by name to follow their scores here.')));
      rows.forEach((e) => {
        const top3 = e.rank > 0 && e.rank <= 3;
        const act = e.me ? null : e.friend ? h('button', { class: 'lb-x', 'aria-label': t('board.remove_friend', 'Remove friend'), title: t('board.remove_friend', 'Remove friend'), onclick: () => { M.removeFriend(p, e.name); state.msg = ''; app.save(); draw(); } }, 'x')
          : h('button', { class: 'lb-add', 'aria-label': t('board.add_friend', 'Add friend'), title: t('board.add_friend', 'Add friend'), onclick: () => addFriend(e.name) }, '+');
        body.append(h('div', { class: 'row lb-row' + (e.me ? ' me' : '') + (e.friend ? ' friend' : '') + (e.missing ? ' missing' : '') },
          h('div', { class: 'lb-rank', style: top3 ? 'color:#c77d00' : '' }, e.rank > 0 ? '#' + e.rank : '-'),
          h('div', { class: 'grow lb-name' }, e.name, e.me ? h('span', { class: 'lb-tag you' }, t('board.you', 'YOU')) : null, e.friend ? h('span', { class: 'lb-tag fr' }, t('board.friend', 'FRIEND')) : null),
          h('div', { class: 'lb-score' }, e.score == null ? '-' : e.score), act));
      });
    }
    const inp = h('input', { type: 'text', maxlength: 16, placeholder: t('board.add_ph', 'Add a friend by name'), class: 'lb-input', 'aria-label': t('board.friend_name', 'Friend name'), onkeydown: (ev) => { if (ev.key === 'Enter') addFriend(inp.value); } });
    body.append(h('div', { class: 'row lb-addrow' }, inp, btn(t('board.add', 'Add'), () => addFriend(cleanName(inp.value)), 'blue small')));
    if (state.msg) body.append(h('div', { class: 'sub', style: 'font-size:13px;text-align:center' }, state.msg));
    body.append(h('div', { class: 'sub', style: 'font-size:12px;text-align:center;margin-top:8px' }, p.name ? t('board.you_appear', 'You appear as {name}.', { name: p.name }) : t('board.set_name', 'Set your name in Settings to join the board.')), h('div', { class: 'btnrow' }, btn(t('common.close', 'Close'), () => m.close(), 'green')));
  };
  draw();
  fetchBoard(id).then((top) => { state.top = top; draw(); });
}

// language picker: text buttons with the native names (no flags). withAuto adds 'Auto' (follow the device); the title screen leaves it out.
export function langPicker(app, withAuto, redraw) {
  const cur = getLangPref(), now = withAuto ? cur : (cur === 'auto' ? app.langNow() : cur);
  const opts = (withAuto ? [{ code: 'auto', name: t('settings.lang_auto', 'Auto') }] : []).concat(LANGS);
  return h('div', { class: 'seg langpick', style: 'flex-wrap:wrap' }, opts.map((o) => h('button', { style: 'flex:none;white-space:nowrap;padding-left:10px;padding-right:10px', class: now === o.code ? 'on' : '', lang: o.code === 'auto' ? undefined : o.code, onclick: () => { app.audio.play('ui_click'); app.setLangPref(o.code); if (redraw) redraw(); } }, o.name)));
}

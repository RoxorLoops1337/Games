// ui_hub.js: the DOM hub shown between runs. Tabs: Tour (stages), Studio (upgrades), Band (heroes and gear), Shop (crates), Goals (daily).
import {
  WORLDS, TURRETS, TURRET_IDS, ENEMIES, ENEMY_IDS, BOSSES, BOSS_IDS, RARITY, RARITY_ORDER, COL, ENCORE_MAX, fmt, MAX_LEVEL, GAME,
} from './data_core.js';
import {
  STUDIO, STUDIO_IDS, HERO_MAX, SLOTS, SLOT_NAMES, STATS, SETS, GEAR, CRATES, CRATE_IDS, PITY, OUTFITS, LOGIN_REWARDS, ACHIEVEMENTS,
  STAR_MILESTONES, AUTOMERGE_PRICE, fansForLevel, fameReward, BOOSTERS, BOOSTER_IDS, WHEEL, WHEEL_SPIN_PRICE, GEAR_MAX_LEVEL, GEAR_SELL,
} from './data_meta.js';
import { REMIX, RELICS, DAILY_MODS } from './data_run.js';
import * as M from './meta.js';
import { fetchBoard, rankOf } from './lb.js';
import {
  h, canvasOf, icon, turretIcon, turretLive, gearIcon, enemyIcon, currencyChip, modal, toast, btn, rarClass, rarName, AE, AW,
} from './ui_core.js';

const TABS = [['tour', 'Tour', 'play'], ['studio', 'Studio', 'gear'], ['band', 'Band', 'mic'], ['shop', 'Crates', 'gift'], ['goals', 'Goals', 'star']];

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
        h('div', { class: 'bar' }, h('div', { class: 'nm' }, 'FAME  ' + fmt(p.fans) + ' / ' + (need === Infinity ? 'MAX' : fmt(need))),
          h('div', { class: 'pbar' }, h('i', { style: 'width:' + (need === Infinity ? 100 : Math.min(100, p.fans / need * 100)) + '%' })))),
      h('div', { class: 'cur', title: 'Records' }, icon('record', 26), fmt(p.records)),
      h('div', { class: 'cur', title: 'Diamonds' }, icon('diamond', 26), fmt(p.diamonds)),
      h('button', { class: 'iconbtn', onclick: () => { app.audio.play('ui_open'); settingsModal(app); }, 'aria-label': 'Settings' }, icon('gear', 28)),
    );
  };
  const renderTabs = () => {
    tabs.replaceChildren();
    const b = M.readyBadges(p, app.now());
    for (const [id, name, glyph] of TABS) {
      const badge = id === 'goals' ? b.goals : id === 'shop' ? (p.pendingCrates ? p.pendingCrates.length : 0) : id === 'band' ? M.mergeableGear(p).length : 0;
      tabs.append(h('button', { class: 'tab' + (state.tab === id ? ' on' : ''), onclick: () => { state.tab = id; app.hubTab = id; app.audio.play('ui_tab'); render(); main.scrollTop = 0; } },
        icon(glyph, 34), name, badge ? h('span', { class: 'badge' }, badge) : null));
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
  wrap.append(h('h2', null, 'Your Dropkit'));
  const lo = h('div', { class: 'card' },
    h('div', { class: 'row', style: 'flex-wrap:wrap' }, p.loadout.map((id) => h('div', { style: 'text-align:center;width:60px' }, turretIcon(id, 50), h('div', { class: 'sub', style: 'font-size:11px' }, TURRETS[id].name.split(' ')[0])))),
    h('div', { class: 'row', style: 'margin-top:8px' }, h('div', { class: 'grow sub' }, p.loadout.length + '/' + M.loadoutSize(p) + ' turrets in your drop pool.'), btn('Edit', () => loadoutModal(app, rerender), 'dark small')));
  wrap.append(lo);

  // resume a saved run
  if (p.resume) {
    const rw = WORLDS.find((x) => x.id === p.resume.world);
    wrap.append(h('div', { class: 'card', style: 'border-color:var(--green)' }, h('div', { class: 'row' }, icon('play', 40, '#9dff3a'),
      h('div', { class: 'grow' }, h('h3', null, 'Run in progress'), h('div', { class: 'sub' }, rw.name + ', wave ' + p.resume.wave + (p.resume.mode === 'endless' ? ' (Endless)' : ''))),
      btn('Resume', () => app.resumeRun(), 'green small'), btn('Drop', () => { p.resume = null; app.save(); rerender(); }, 'dark small'))));
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
    wrap.append(h('div', { class: 'card' }, h('h3', null, 'Boosters'), h('div', { class: 'sub', style: 'margin-bottom:6px' }, BOOSTER_IDS.filter((id) => p.boosters[id]).map((id) => BOOSTERS[id].desc).join(' ') || 'Optional diamond boosts for your next run. Pick any.'), bs,
      tot ? h('div', { class: 'sub', style: 'margin-top:6px' }, 'Costs ' + tot + ' diamonds when the run starts.') : null));
  }
  // daily challenge
  if (p.tutorial.done) {
    const dc = M.dailyChallenge(p, app.now());
    const mod = DAILY_MODS[dc.mod];
    const w = WORLDS.find((x) => x.id === dc.world);
    wrap.append(h('div', { class: 'card', style: 'border-color:var(--gold)' },
      h('div', { class: 'row' }, h('div', { class: 'ic', style: 'width:54px;height:54px;border-radius:12px;background:#12082b;display:flex;align-items:center;justify-content:center' }, icon(mod.glyph, 38)),
        h('div', { class: 'grow' }, h('h3', null, 'Daily Challenge: ' + mod.name), h('div', { class: 'sub' }, mod.desc), h('div', { class: 'sub' }, w.name + ', 15 waves'))),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('div', { class: 'grow sub' }, dc.done ? 'Reward claimed today. Play again for fun (half rewards).' : 'First clear today: diamonds, Records and fans!'),
        btn(dc.done ? 'Play' : 'Play!', () => app.startRun({ mode: 'daily', world: dc.world, encore: 0, seed: dc.seed, daily: dc.mod, wavesTotal: dc.waves }), dc.done ? 'dark' : 'gold'))));
  }

  if (M.endlessUnlocked(p) && p.prog.arena.cleared) {
    wrap.append(h('div', { class: 'card', style: 'border-color:var(--red)' }, h('div', { class: 'row' }, enemyIcon('playback', 56, true),
      h('div', { class: 'grow' }, h('h3', null, 'Boss Rush'), h('div', { class: 'sub' }, 'Ten bosses back to back, no breaks. Best: ' + (p.stats.rushBest || 0) + '/10. Diamonds for every boss.')),
      btn('Play', () => { const m = modal(h('div', null, h('h2', null, 'Boss Rush'), h('div', { class: 'sub', style: 'text-align:center' }, 'Pick the stage to fight on.'), h('div', { class: 'col', style: 'margin-top:10px' }, WORLDS.filter((w) => p.prog[w.id].cleared).map((w) => btn(w.name, () => { m.close(); app.startRun({ mode: 'rush', world: w.id, encore: 0 }); }, 'dark'))))); }, 'red small'))));
  }
  wrap.append(h('h2', null, 'The Tour'));
  const ts = M.totalStars(p);
  wrap.append(h('div', { class: 'sub', style: 'margin:-4px 2px 8px' }, 'Stars ' + ts + '/' + (WORLDS.length * 3 * (ENCORE_MAX + 1)) + '. Clear a stage to unlock the next. Higher Encores are tougher and pay more.'));
  WORLDS.forEach((w) => {
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
      h('div', { class: 'grow' }, h('div', { style: 'font-weight:900' }, 'Boss: ' + boss.name), h('div', { class: 'sub', style: 'font-size:13px' }, boss.trick))));
    const best = pr.stars[enc] || 0;
    const encRow = h('div', { class: 'row' },
      h('div', { class: 'grow' }, stars(best), h('div', { class: 'sub', style: 'font-size:13px' }, 'Best wave ' + pr.bestWave + '/' + w.wavesTotal + (pr.bestEndless ? '  Endless ' + pr.bestEndless : ''))));
    if (pr.cleared) {
      const maxE = ENCORE_MAX;
      const e = h('div', { class: 'enc' },
        h('button', { onclick: () => { st['enc_' + w.id] = Math.max(0, enc - 1); rerender(); }, disabled: enc <= 0 }, '-'),
        h('div', { style: 'min-width:80px;text-align:center;font-weight:900' }, enc === 0 ? 'Normal' : 'Encore ' + enc),
        h('button', { onclick: () => { if (M.encoreUnlocked(p, w.id, enc + 1)) st['enc_' + w.id] = Math.min(maxE, enc + 1); else toast('Win Encore ' + enc + ' first.'); rerender(); }, disabled: enc >= maxE }, '+'));
      encRow.append(e);
    }
    body.append(encRow);
    const acts = h('div', { class: 'btnrow' }, btn('PLAY', () => app.startRun({ mode: 'story', world: w.id, encore: enc }), 'green'));
    if (pr.cleared) acts.append(btn('ENDLESS', () => app.startRun({ mode: 'endless', world: w.id, encore: enc }), 'blue'), btn(icon('crown', 24), () => boardModal(app, 'endless:' + w.id, w.name + ' Endless'), 'dark small', { 'aria-label': 'Leaderboard' }));
    body.append(acts);
    card.append(art, body);
    if (!unlocked) {
      const prev = WORLDS[w.n - 2];
      card.append(h('div', { class: 'lockbox' }, icon('lock', 44), 'Clear ' + prev.name + ' to unlock'));
    }
    wrap.append(card);
  });
  return wrap;
}

function loadoutModal(app, rerender) {
  const p = app.profile;
  const body = h('div');
  const m = modal(body);
  const draw = () => {
    body.replaceChildren(h('h2', null, 'Drop Pool'), h('div', { class: 'sub', style: 'text-align:center;margin-bottom:8px' }, 'Every DROP picks a random turret from this pool. Choose ' + M.loadoutSize(p) + '. Mix attackers with a Loop Station or Amp Stack!'));
    const g = h('div', { class: 'codexgrid' });
    for (const id of TURRET_IDS) {
      const t = TURRETS[id], own = p.turretsUnlocked[id], on = p.loadout.includes(id);
      g.append(h('div', { class: 'cdx' + (own ? '' : ' unk'), style: on ? 'border-color:var(--green)' : '', onclick: () => { if (!own) { toast(t.name + ': Fame ' + t.unlock.fame + ' and ' + fmt(t.unlock.records) + ' Records (Studio).'); return; } if (!M.toggleLoadout(p, id)) toast('Pool is full or empty. Remove one first.'); else app.audio.play('ui_click'); draw(); rerender(); } },
        turretIcon(id, 64), h('div', { class: 'nm' }, t.name), h('div', { class: 'ds' }, own ? (on ? 'IN POOL' : 'tap to add') : 'locked')));
    }
    body.append(g, h('div', { class: 'btnrow' }, btn('Done', () => m.close(), 'green')));
  };
  draw();
}

// ================================================================================================ STUDIO
function studioTab(app, st, rerender) {
  const p = app.profile;
  const wrap = h('div');
  wrap.append(h('h2', null, 'The Studio'), h('div', { class: 'sub', style: 'margin:-4px 2px 8px' }, 'Permanent upgrades, bought with Records. They help in every run.'));
  const seg = h('div', { class: 'seg' });
  const sec = st.studioSec || 'up';
  for (const [id, name] of [['up', 'Upgrades'], ['turrets', 'Turrets'], ['heroes', 'Heroes']]) seg.append(h('button', { class: sec === id ? 'on' : '', onclick: () => { st.studioSec = id; rerender(); } }, name));
  wrap.append(seg);
  if (sec === 'up') {
    for (const id of STUDIO_IDS) {
      const u = STUDIO[id], lv = M.studioLevel(p, id), cost = M.studioCost(p, id);
      const can = cost != null && p.records >= cost;
      wrap.append(h('div', { class: 'card up' }, h('div', { class: 'ic' }, icon(u.glyph, 34)),
        h('div', { class: 'grow' }, h('div', { class: 'nm' }, u.name), h('div', { class: 'ds' }, u.desc), h('div', { class: 'pips', style: 'margin-top:4px' }, Array.from({ length: Math.min(u.max, 20) }, (_, i) => h('i', { class: i < lv ? 'on' : '' })))),
        cost == null ? h('span', { class: 'pill', style: 'color:var(--gold)' }, 'MAX') : btn([icon('record', 20), fmt(cost)], () => { const r = M.buyStudio(p, id); if (r.ok) { app.audio.play('record'); app.audio.play('levelup', { vol: 0.5 }); } else app.audio.play('error'); rerender(); }, can ? 'green small' : 'dark small off')));
    }
  } else if (sec === 'turrets') {
    wrap.append(h('div', { class: 'sub', style: 'margin:0 2px 8px' }, 'New turrets join your drop pool. They need Fame level and Records.'));
    for (const id of TURRET_IDS) {
      const t = TURRETS[id], own = p.turretsUnlocked[id];
      const c = M.canUnlockTurret(p, id);
      const perks = Object.entries(t.perks).map(([l, d]) => 'Lv' + l + ': ' + d).join('  ');
      wrap.append(h('div', { class: 'card' + (own ? '' : '') },
        h('div', { class: 'tcard' }, h('div', { class: 'ic', style: 'border-color:' + t.color }, turretLive(id, 5, 52)),
          h('div', { class: 'grow' }, h('div', { class: 'nm', style: 'font-weight:900;font-size:19px' }, t.name), h('div', { class: 'sub' }, t.blurb)),
          own ? h('span', { class: 'pill', style: 'color:var(--green)' }, 'OWNED')
            : btn(c.ok ? [icon('record', 20), fmt(t.unlock.records)] : (c.reason === 'fame' ? 'Fame ' + t.unlock.fame : [icon('record', 20), fmt(t.unlock.records)]), () => { const r = M.unlockTurret(p, id); if (r.ok) { app.audio.play('levelup'); toast(t.name + ' unlocked and added to your pool!'); } else app.audio.play('error'); rerender(); }, c.ok ? 'gold small' : 'dark small off')),
        h('div', { class: 'sub', style: 'font-size:12px;margin-top:6px' }, perks)));
    }
  } else {
    for (const who of ['roxor', 'jasmin']) {
      const lv = p.heroLv[who], cost = M.heroUpgradeCost(p, who);
      const col = who === 'roxor' ? 'var(--green)' : 'var(--pink)';
      const name = who === 'roxor' ? 'RoxorLoops: Beatbox Blast' : 'Jasmin: Siren Song';
      const desc = who === 'roxor' ? 'Shakes the whole stage. Hits every Static for big damage, stuns and shoves them back, and un-jams your turrets.' : 'A sung spell. Slows every Static hard, makes them take +20% damage for a few seconds and mends the stage.';
      wrap.append(h('div', { class: 'card', style: 'border-color:' + col },
        h('div', { class: 'herocard' }, canvasOf(90, 120, (ctx, t) => AW.drawHero(ctx, who, 45, 112, 108, { t, outfit: p.outfits.worn[who], pose: 'idle' }), { live: true }),
          h('div', { class: 'grow' }, h('div', { style: 'font-weight:900;font-size:20px;color:' + col }, name), h('div', { class: 'sub' }, desc),
            h('div', { class: 'row', style: 'margin-top:6px' }, h('span', { class: 'pill' }, 'LEVEL ' + lv + '/' + HERO_MAX), cost == null ? h('span', { class: 'pill', style: 'color:var(--gold)' }, 'MAX') : btn([icon('record', 20), fmt(cost)], () => { const r = M.upgradeHero(p, who); app.audio.play(r.ok ? 'levelup' : 'error'); rerender(); }, p.records >= cost ? 'green small' : 'dark small off'))))));
    }
    wrap.append(h('div', { class: 'sub', style: 'margin:0 2px' }, 'Hero levels make abilities hit harder and recharge faster.'));
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
  wrap.append(h('h2', null, 'The Band'));
  // heroes + outfits
  const heroes = h('div', { class: 'row', style: 'gap:8px;margin-bottom:10px' });
  for (const who of ['roxor', 'jasmin']) {
    const col = who === 'roxor' ? 'var(--green)' : 'var(--pink)';
    heroes.append(h('div', { class: 'card grow', style: 'text-align:center;margin:0;border-color:' + col },
      canvasOf(150, 176, (ctx, t) => AW.drawHero(ctx, who, 75, 168, 138, { t, outfit: p.outfits.worn[who], pose: 'cheer' }), { live: true }),
      h('div', { style: 'font-weight:900;color:' + col }, who === 'roxor' ? 'RoxorLoops' : 'Jasmin'),
      h('div', { class: 'row', style: 'justify-content:center;margin-top:6px' }, btn(p.outfits.worn[who] === 'onesie' ? 'Classic' : (p.outfits.owned[who].includes('onesie') ? 'Onesie' : [icon('diamond', 18), OUTFITS[who].onesie.price]),
        () => { const target = p.outfits.worn[who] === 'onesie' ? 'default' : 'onesie'; const r = M.buyOutfit(p, who, target); if (!r.ok) { toast('Need ' + OUTFITS[who].onesie.price + ' diamonds for the ' + OUTFITS[who].onesie.name + '.'); app.audio.play('error'); } else app.audio.play('reveal_rare'); rerender(); }, 'dark small'))));
  }
  wrap.append(heroes);

  // equipped slots
  wrap.append(h('h3', null, 'Equipped'));
  const slots = h('div', { class: 'slots' });
  for (const s of SLOTS) {
    const g = M.gearById(p, p.gear.equipped[s]);
    const b = h('button', { class: 'gslot', style: g ? 'border-color:' + RARITY[g.rarity].color : '', onclick: () => { if (g) gearModal(app, g, rerender); else { st.gearSlot = s; rerender(); } } },
      g ? gearIcon(g, 64) : canvasOf(64, 64, (ctx) => { ctx.globalAlpha = 0.35; AE.drawGear(ctx, s, 'empty', 'common', 32, 32, 40); }), g ? h('span', { class: 'lv' }, g.lvl) : null);
    slots.append(b);
  }
  wrap.append(slots);
  // totals
  const tot = M.gearTotals(p);
  const lines = Object.entries(tot).map(([k, v]) => STATS[k].label + ' ' + M.fmtStat(k, v));
  const sb = M.setBonuses(p);
  wrap.append(h('div', { class: 'card' }, h('div', { class: 'sub' }, lines.length ? lines.join('  |  ') : 'No gear equipped. Open a crate in the Crates tab!'),
    sb.length ? h('div', { style: 'margin-top:6px' }, sb.map((b) => h('div', { style: 'font-size:14px;font-weight:800;color:' + SETS[b.set].color }, SETS[b.set].name + ' (' + b.count + '): ' + b.text))) : null,
    h('div', { class: 'sub', style: 'margin-top:6px;font-size:12px' }, Object.values(SETS).map((s) => s.name + ': 2/3/5 pieces').join('   '))));

  // inventory
  wrap.append(h('h3', null, 'Gear Bag (' + p.gear.items.length + ')'));
  const seg = h('div', { class: 'seg' });
  for (const s of ['all'].concat(SLOTS)) seg.append(h('button', { class: st.gearSlot === s ? 'on' : '', onclick: () => { st.gearSlot = s; rerender(); } }, s === 'all' ? 'All' : ({ head: 'Head', mic: 'Mic', body: 'Top', chain: 'Bling', feet: 'Shoes' })[s]));
  wrap.append(seg);
  const mergeable = M.mergeableGear(p);
  if (mergeable.length) {
    const grp = mergeable[0];
    wrap.append(h('div', { class: 'card', style: 'border-color:var(--gold)' }, h('div', { class: 'row' }, gearIcon(grp[0], 52), h('div', { class: 'grow' }, h('b', null, 'Merge ready! '), h('span', { class: 'sub' }, '3x ' + GEAR[grp[0].tpl].name + ' (' + rarName(grp[0].rarity) + ') make one ' + rarName(RARITY_ORDER[RARITY_ORDER.indexOf(grp[0].rarity) + 1]) + '.')),
      btn('MERGE', () => { const r = M.mergeGear(p, grp.slice().sort((a, b) => (p.gear.equipped[GEAR[a.tpl].slot] === a.uid ? 1 : 0) - (p.gear.equipped[GEAR[b.tpl].slot] === b.uid ? 1 : 0)).slice(0, 3).map((g) => g.uid)); if (r.ok) { app.audio.play('reveal_' + (r.item.rarity)); toast('Merged into ' + rarName(r.item.rarity) + ' ' + GEAR[r.item.tpl].name + '!'); } rerender(); }, 'gold small'))));
  }
  const items = p.gear.items.filter((g) => st.gearSlot === 'all' || GEAR[g.tpl].slot === st.gearSlot)
    .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || b.lvl - a.lvl);
  const grid = h('div', { class: 'ggrid' });
  const mgKeys = new Set(mergeable.map((l) => l[0].tpl + ':' + l[0].rarity));
  for (const g of items) {
    const eq = p.gear.equipped[GEAR[g.tpl].slot] === g.uid;
    grid.append(h('button', { class: 'gitem', style: 'border-color:' + RARITY[g.rarity].color, onclick: () => { g.fresh = false; gearModal(app, g, rerender); } },
      gearIcon(g, 64), h('span', { class: 'lv' }, g.lvl), eq ? h('span', { class: 'eq' }, 'ON') : null, g.fresh ? h('span', { class: 'new' }, 'NEW') : null, mgKeys.has(g.tpl + ':' + g.rarity) ? h('span', { class: 'mg' }, 'x3') : null));
  }
  if (!items.length) wrap.append(h('div', { class: 'sub', style: 'text-align:center;padding:16px' }, 'Nothing here yet. Win stages and open crates to find gear.'));
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
        h('h2', { style: 'margin:4px 0' }, tpl.name), h('div', { class: rarClass(g.rarity), style: 'font-weight:900' }, rarName(g.rarity) + '  |  Level ' + g.lvl + '/' + GEAR_MAX_LEVEL + '  |  ' + SLOT_NAMES[tpl.slot]),
        tpl.set ? h('div', { style: 'font-weight:800;color:' + SETS[tpl.set].color }, 'Set: ' + SETS[tpl.set].name) : null),
      h('div', { class: 'card', style: 'margin-top:10px' }, M.gearStatLines(g).map((l) => h('div', { style: 'font-weight:900;font-size:19px' }, STATS[l.stat].label + ' ', h('span', { style: 'color:var(--green)' }, M.fmtStat(l.stat, l.value)), l.main ? '' : h('span', { class: 'sub' }, '  (bonus)'))),
        RARITY_ORDER.indexOf(g.rarity) < 2 ? h('div', { class: 'sub' }, 'Epic and above also give a bonus stat.') : null),
      h('div', { class: 'btnrow' },
        btn(eq ? 'Unequip' : 'Equip', () => { if (eq) M.unequipSlot(p, tpl.slot); else M.equipGear(p, g.uid); app.audio.play('ui_click'); draw(); rerender(); }, eq ? 'dark' : 'green'),
        cost == null ? btn('Max level', () => {}, 'dark off') : btn(['Upgrade ', icon('record', 20), fmt(cost)], () => { const r = M.upgradeGear(p, g.uid); app.audio.play(r.ok ? 'levelup' : 'error'); draw(); rerender(); }, p.records >= cost ? 'blue' : 'dark off')),
      h('div', { class: 'btnrow' },
        btn(scrapArmed ? 'Tap again to scrap' : ['Scrap +', icon('record', 18), fmt(GEAR_SELL[g.rarity] + Math.round((g.lvl - 1) * 20))], () => { if (!scrapArmed) { scrapArmed = true; draw(); return; } const r = M.scrapGear(p, g.uid); if (r.ok) { app.audio.play('sell'); toast('Scrapped for ' + r.value + ' Records'); } m.close(); rerender(); }, 'red small'),
        btn('Close', () => m.close(), 'dark small')),
      same.length >= 3 && RARITY_ORDER.indexOf(g.rarity) < RARITY_ORDER.length - 1 ? h('div', { class: 'btnrow' }, btn('Merge 3 into ' + rarName(RARITY_ORDER[RARITY_ORDER.indexOf(g.rarity) + 1]), () => { const uids = same.filter((x) => x.uid !== g.uid).slice(0, 2).map((x) => x.uid).concat([g.uid]); const r = M.mergeGear(p, uids); if (r.ok) { app.audio.play('reveal_' + r.item.rarity); toast('Merged!'); } m.close(); rerender(); }, 'gold')) : null,
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
  wrap.append(h('h2', null, 'Crates'));
  if (p.pendingCrates && p.pendingCrates.length) {
    wrap.append(h('div', { class: 'card', style: 'border-color:var(--gold);animation:glow 2s infinite' }, h('div', { class: 'row' }, canvasOf(70, 60, (ctx, t) => AE.drawCrate(ctx, p.pendingCrates[0], 35, 32, 56, { t, shake: 0.5 }), { live: true }),
      h('div', { class: 'grow' }, h('b', null, 'You have ' + p.pendingCrates.length + ' free crate' + (p.pendingCrates.length > 1 ? 's' : '') + '!')),
      btn('Open', () => { const tier = p.pendingCrates.shift(); if (!p.pendingCrates.length) delete p.pendingCrates; const items = M.openCrateFree(p, tier, app.rng()); crateOpening(app, tier, items, rerender); }, 'gold'))));
  }
  for (const id of CRATE_IDS) {
    const c = CRATES[id];
    const ok = M.canAfford(p, c.price);
    const priceIcon = c.price.records ? 'record' : 'diamond';
    const priceN = c.price.records || c.price.diamonds;
    const crateCv = canvasOf(150, 130, (ctx, t) => AE.drawCrate(ctx, id, 75, 70, 110, { t }), { live: true });
    crateCv.classList.add('cr');
    wrap.append(h('div', { class: 'card cratecard' }, crateCv,
      h('h3', null, c.name), h('div', { class: 'sub' }, c.blurb + (c.items > 1 ? ' (' + c.items + ' items)' : '')), oddsRow(id),
      btn([icon(priceIcon, 24), fmt(priceN)], () => { const r = M.buyCrate(p, id, app.rng()); if (!r.ok) { app.audio.play('error'); toast('Not enough ' + (c.price.records ? 'Records' : 'diamonds') + '.'); return; } crateOpening(app, id, r.items, rerender); }, ok ? 'gold' : 'dark off')));
  }
  wrap.append(h('div', { class: 'sub', style: 'margin:0 2px 10px' }, 'Pity timer: an Epic is guaranteed within ' + PITY.epicEvery + ' items and a Legendary within ' + PITY.legendaryEvery + '. Items so far since last: Epic ' + p.crate.sinceEpic + ', Legendary ' + p.crate.sinceLegend + '. Duplicates are never wasted: merge 3 of the same into the next rarity.'));
  // special offers
  wrap.append(h('h2', null, 'Upgrades'));
  wrap.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'ic', style: 'width:54px;height:54px;border-radius:12px;background:#12082b;display:flex;align-items:center;justify-content:center' }, icon('merge', 38)),
    h('div', { class: 'grow' }, h('h3', null, 'Auto-Merge Rack'), h('div', { class: 'sub' }, 'Unlocks the MERGE button in battle: merges every matching pair with one tap.')),
    p.autoMerge ? h('span', { class: 'pill', style: 'color:var(--green)' }, 'OWNED') : btn([icon('diamond', 22), AUTOMERGE_PRICE], () => { const r = M.buyAutoMerge(p); app.audio.play(r.ok ? 'levelup' : 'error'); if (!r.ok) toast('Need ' + AUTOMERGE_PRICE + ' diamonds. Win stages and finish quests to earn them!'); rerender(); }, p.diamonds >= AUTOMERGE_PRICE ? 'gold small' : 'dark small off'))));
  wrap.append(h('div', { class: 'sub', style: 'margin:0 2px' }, 'Diamonds are earned in the game only: first clears, stars, bosses, quests, stickers and daily rewards. Nothing here costs real money.'));
  return wrap;
}

export function crateOpening(app, tier, items, rerender) {
  const body = h('div', { class: 'opening' });
  const m = modal(body, { sticky: true });
  let phase = 0;
  const best = items.reduce((b, g) => (RARITY_ORDER.indexOf(g.rarity) > RARITY_ORDER.indexOf(b) ? g.rarity : b), 'common');
  const cv = canvasOf(220, 190, (ctx, t) => AE.drawCrate(ctx, tier, 110, 100, 170, { t, shake: phase === 0 ? 1 : 0, open: phase === 1 ? Math.min(1, (performance.now() - (body.__t0 || 0)) / 400) : 0 }), { live: true });
  cv.classList.add('cr'); if (!app.profile.settings.reduce) cv.classList.add('shake');
  body.append(h('h2', null, CRATES[tier].name), cv, h('div', { class: 'sub' }, 'Tap the crate!'));
  app.audio.play('crate_shake');
  const reveal = () => {
    if (phase) return; phase = 1; body.__t0 = performance.now();
    app.audio.play('crate_open');
    setTimeout(() => {
      body.replaceChildren(h('h2', null, 'You got!'));
      const row = h('div', { class: 'reveal' });
      body.append(row);
      items.forEach((g, i) => {
        setTimeout(() => {
          app.audio.play('reveal_' + g.rarity);
          row.append(h('div', { class: 'revi' }, gearIcon(g, 120), h('div', { style: 'font-weight:900' }, GEAR[g.tpl].name), h('div', { class: rarClass(g.rarity), style: 'font-weight:900' }, rarName(g.rarity)), h('div', { class: 'sub', style: 'font-size:13px' }, statText(g).join(', '))));
          if (i === items.length - 1) body.append(h('div', { class: 'btnrow', style: 'width:100%' }, btn('Nice!', () => { m.close(); rerender && rerender(); }, 'green')));
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
  if (off >= 10) wrap.append(h('div', { class: 'card', style: 'border-color:var(--record)' }, h('div', { class: 'row' }, icon('note', 40), h('div', { class: 'grow' }, h('b', null, 'Streaming Royalties'), h('div', { class: 'sub' }, 'Your songs kept playing while you were away: ' + off + ' Records (' + M.offlineRate(p) + '/hour, max ' + M.offlineCapHours(p) + ' hours).')),
    btn('Claim', () => { M.claimOffline(p, now); app.audio.play('record'); rerender(); }, 'green small'))));
  // lucky wheel
  wrap.append(h('h2', null, 'Lucky Wheel'));
  wrap.append(wheelCard(app, rerender));
  // login
  const ls = M.loginStatus(p, now);
  wrap.append(h('h2', null, 'Daily Gig'));
  const cal = h('div', { class: 'cal' });
  LOGIN_REWARDS.forEach((r, i) => {
    const cur = i === ls.idx && ls.claimable, done = (i < ls.idx) || (i === ls.idx && !ls.claimable);
    cal.append(h('div', { class: 'day' + (cur ? ' cur2' : '') + (done ? ' done' : '') }, 'Day ' + r.day, icon(r.crate ? 'gift' : r.diamonds ? 'diamond' : 'record', 30), h('span', { style: 'font-size:11px' }, r.diamonds ? r.diamonds : r.records)));
  });
  wrap.append(h('div', { class: 'card' }, cal, h('div', { class: 'row', style: 'margin-top:8px' }, h('div', { class: 'grow sub' }, 'Streak: ' + Math.max(p.login.streak, 0) + ' day' + (p.login.streak === 1 ? '' : 's')),
    btn(ls.claimable ? 'Claim Day ' + ls.reward.day : 'Come back tomorrow', () => { const r = M.claimLogin(p, now, app.rng()); if (r.ok) { app.audio.play('chest'); if (r.loot.length) crateOpening(app, ls.reward.crate, r.loot, rerender); else toast('Daily reward claimed!'); } rerender(); }, ls.claimable ? 'gold' : 'dark off'))));
  // quests
  wrap.append(h('h2', null, 'Daily Quests'));
  p.daily.quests.forEach((slot) => {
    const q = M.questDef(slot.id), prog = M.questProgress(p, q), done = prog >= q.goal;
    wrap.append(h('div', { class: 'card quest' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { style: 'font-weight:900' }, q.text), h('div', { class: 'pbar' }, h('i', { style: 'width:' + prog / q.goal * 100 + '%' })), h('div', { class: 'sub', style: 'font-size:12px' }, fmt(prog) + ' / ' + fmt(q.goal))), rewardChips(q.reward),
      slot.claimed ? h('span', { class: 'pill' }, 'DONE') : btn(done ? 'Claim' : 'Swap', () => { if (done) { M.claimQuest(p, q.id); app.audio.play('diamond'); } else { const r = M.rerollQuest(p, q.id, app.rng()); if (!r.ok) toast('One swap per day.'); } rerender(); }, done ? 'gold small' : (p.daily.rerolled ? 'dark small off' : 'dark small')))));
  });
  // star milestones
  wrap.append(h('h2', null, 'Star Chests'), h('div', { class: 'sub', style: 'margin:-4px 2px 6px' }, 'You have ' + M.totalStars(p) + ' stars.'));
  const ms = h('div', { class: 'star-ms' });
  for (const m of STAR_MILESTONES) {
    const got = p.starClaimed[m.stars], ready = !got && M.totalStars(p) >= m.stars;
    ms.append(h('div', { class: 'ms' + (ready ? ' ready' : '') + (got ? ' got' : ''), onclick: () => { if (ready) { const r = M.claimStarMilestone(p, m.stars, app.rng()); app.audio.play('chest'); if (r.loot && r.loot.length) crateOpening(app, m.reward.crate, r.loot, rerender); rerender(); } else if (!got) toast('Collect ' + m.stars + ' stars (' + M.totalStars(p) + ' so far).'); } },
      icon('star', 34, got ? '#8a7cc0' : '#ffc83d'), h('div', null, m.stars), rewardChips(m.reward)));
  }
  wrap.append(ms);
  // achievements
  wrap.append(h('h2', null, 'Stickers'));
  const list = ACHIEVEMENTS.slice().sort((a, b) => { const sa = M.achievementState(p, a), sb = M.achievementState(p, b); return (sb.done && !sb.claimed) - (sa.done && !sa.claimed) || (sa.claimed - sb.claimed); });
  for (const a of list) {
    const s = M.achievementState(p, a);
    wrap.append(h('div', { class: 'card ach' + (s.done ? ' done' : ''), style: 'margin-bottom:8px' }, icon(s.claimed ? 'check' : 'star', 36, s.done ? '#ffc83d' : '#8a7cc0'),
      h('div', { class: 'grow' }, h('div', { class: 'nm', style: 'font-weight:900' }, a.name), h('div', { class: 'sub', style: 'font-size:13px' }, a.text), h('div', { class: 'pbar', style: 'height:10px;margin-top:3px' }, h('i', { style: 'width:' + s.value / a.goal * 100 + '%' })), h('div', { class: 'sub', style: 'font-size:11px' }, fmt(s.value) + ' / ' + fmt(a.goal))),
      s.claimed ? h('span', { class: 'pill' }, 'GOT') : btn([icon('diamond', 20), a.diamonds], () => { if (M.claimAchievement(p, a.id).ok) app.audio.play('achievement'); rerender(); }, s.done ? 'gold small' : 'dark small off')));
  }
  return wrap;
}

// ================================================================================================ extras: fame info, codex, settings
function fameInfo(app) {
  const p = app.profile;
  const body = h('div');
  const m = modal(body);
  body.append(h('h2', null, 'Fame ' + p.fame), h('div', { class: 'sub', style: 'text-align:center' }, 'Earn fans by clearing waves and stages. Each Fame level pays out diamonds and Records, and unlocks turrets in the Studio.'));
  const upcoming = [];
  for (let l = p.fame + 1; l <= Math.min(p.fame + 5, 50); l++) upcoming.push(l);
  for (const l of upcoming) {
    const r = fameReward(l);
    body.append(h('div', { class: 'card', style: 'margin:8px 0 0;padding:8px' }, h('div', { class: 'row' }, h('div', { style: 'font-weight:900;width:70px' }, 'Level ' + l), rewardChips(r), r.unlocks ? h('span', { class: 'chip' }, 'Unlocks ' + r.unlocks.map((i) => TURRETS[i].name).join(', ')) : null)));
  }
  body.append(h('div', { class: 'btnrow' }, btn('Close', () => m.close(), 'dark')));
}

export function codexModal(app) {
  const p = app.profile;
  const body = h('div');
  const m = modal(body, { wide: true });
  let sec = 'turrets';
  const draw = () => {
    body.replaceChildren(h('h2', null, 'Codex'));
    const seg = h('div', { class: 'seg' });
    for (const [id, nm] of [['turrets', 'Turrets'], ['enemies', 'Static'], ['bosses', 'Bosses'], ['remix', 'Remix'], ['relics', 'Merch']]) seg.append(h('button', { class: sec === id ? 'on' : '', onclick: () => { sec = id; draw(); } }, nm));
    body.append(seg);
    const g = h('div', { class: 'codexgrid' });
    if (sec === 'turrets') for (const id of TURRET_IDS) { const t = TURRETS[id]; const own = p.turretsUnlocked[id]; g.append(h('div', { class: 'cdx' + (own ? '' : ' unk') }, turretLive(id, 4, 72), h('div', { class: 'nm' }, own ? t.name : '???'), h('div', { class: 'ds' }, own ? t.blurb : 'Fame ' + t.unlock.fame))); }
    if (sec === 'enemies') for (const id of ENEMY_IDS) { const e = ENEMIES[id]; if (e.hidden) continue; const seen = p.seen.enemies[id]; g.append(h('div', { class: 'cdx' + (seen ? '' : ' unk') }, enemyIcon(id, 70), h('div', { class: 'nm' }, seen ? e.name : '???'), h('div', { class: 'ds' }, seen ? e.blurb : 'Not met yet'))); }
    if (sec === 'bosses') for (const id of BOSS_IDS) { const b = BOSSES[id]; const seen = p.seen.bosses[id] || p.bossesSeen[id]; g.append(h('div', { class: 'cdx' + (seen ? '' : ' unk') }, enemyIcon(id, 80, true), h('div', { class: 'nm' }, seen ? b.name : '???'), h('div', { class: 'ds' }, seen ? b.trick : 'Not met yet'))); }
    if (sec === 'remix') for (const c of Object.values(REMIX)) g.append(h('div', { class: 'cdx' }, icon(c.glyph, 44, RARITY[c.rarity].color), h('div', { class: 'nm ' + rarClass(c.rarity) }, c.name), h('div', { class: 'ds' }, c.desc)));
    if (sec === 'relics') for (const c of Object.values(RELICS)) g.append(h('div', { class: 'cdx' }, icon(c.glyph, 44, RARITY[c.rarity].color), h('div', { class: 'nm ' + rarClass(c.rarity) }, c.name), h('div', { class: 'ds' }, c.desc)));
    body.append(g, h('div', { class: 'btnrow' }, btn('Close', () => m.close(), 'dark')));
  };
  draw();
}

export function settingsModal(app) {
  const p = app.profile, s = p.settings;
  const body = h('div');
  const m = modal(body);
  const draw = () => {
    body.replaceChildren(h('h2', null, 'Settings'));
    const slider = (label, key, apply) => h('div', { class: 'rangeRow' }, h('span', { style: 'width:80px' }, label), h('input', { type: 'range', min: 0, max: 100, value: Math.round(s[key] * 100), oninput: (e) => { s[key] = e.target.value / 100; apply(); app.save(); }, onchange: () => app.audio.play('ui_click') }));
    const tog = (label, key) => h('div', { class: 'toggle' }, label, btn(s[key] ? 'ON' : 'OFF', () => { s[key] = !s[key]; app.applySettings(); app.save(); draw(); }, s[key] ? 'green small' : 'dark small'));
    body.append(h('div', { class: 'toggle' }, 'Visual style', h('div', { class: 'row', style: 'gap:6px' },
      btn('Doodle', () => { s.style = 'doodle'; app.applySettings(); app.save(); draw(); app.hub && app.hub.render(); }, s.style === 'classic' ? 'dark small' : 'green small'),
      btn('Classic', () => { s.style = 'classic'; app.applySettings(); app.save(); draw(); app.hub && app.hub.render(); }, s.style === 'classic' ? 'green small' : 'dark small'))));
    body.append(slider('Music', 'music', () => app.applySettings()), slider('Sound', 'sfx', () => app.applySettings()),
      tog('Screen shake', 'shake'), tog('Damage numbers', 'numbers'), tog('Vibration', 'vibrate'), tog('Beat helper (DROP ring)', 'beat'), tog('Reduce motion', 'reduce'), tog('Low graphics (faster)', 'lowfx'));
    if (p.autoMerge) body.append(tog2('Auto-merge after each drop', p.autoMergeOn, () => { p.autoMergeOn = !p.autoMergeOn; app.save(); draw(); }));
    body.append(h('div', { class: 'hr' }), h('h3', null, 'Leaderboard name'), h('input', { type: 'text', maxlength: 16, value: p.name || '', placeholder: 'Your name (optional)', style: 'width:100%;font:800 18px sans-serif;padding:10px;border-radius:10px;border:3px solid var(--line);background:#12082b;color:#fff', oninput: (e) => { p.name = e.target.value.replace(/[^\w \-.']/g, '').slice(0, 16); app.save(); } }));
    body.append(h('div', { class: 'hr' }), h('h3', null, 'Save data'), h('div', { class: 'sub' }, 'Your progress is saved on this device. Copy the code to move it to another device.'));
    const ta = h('textarea', { class: 'code', readonly: true }, M.exportCode(p));
    body.append(ta, h('div', { class: 'btnrow' }, btn('Copy code', () => { ta.select(); try { navigator.clipboard.writeText(ta.value); toast('Copied!'); } catch (e) { document.execCommand('copy'); toast('Copied!'); } }, 'blue small'),
      btn('Import code', () => importModal(app), 'dark small')));
    body.append(h('div', { class: 'btnrow' }, btn('How to play', () => { m.close(); app.showHowTo(); }, 'dark small'), btn('Codex', () => { m.close(); codexModal(app); }, 'dark small')));
    body.append(h('div', { class: 'btnrow' }, btn('Replay intro', () => { m.close(); app.playCutscene('intro', () => app.openHub()); }, 'dark small'), btn('Reset game', () => resetModal(app), 'red small')));
    body.append(h('div', { class: 'credit', style: 'text-align:center;margin-top:10px;font-size:12px;color:var(--dim)' }, GAME.title + ' by RoxorLoops & Jasmin. Keyboard: Space drop, M merge all, Q/W heroes, N next wave, F speed, Esc pause.'));
    body.append(h('div', { class: 'btnrow' }, btn('Close', () => m.close(), 'green')));
  };
  draw();
}
function tog2(label, on, fn) { return h('div', { class: 'toggle' }, label, btn(on ? 'ON' : 'OFF', fn, on ? 'green small' : 'dark small')); }
function importModal(app) {
  const ta = h('textarea', { class: 'code', placeholder: 'Paste your save code here' });
  const m = modal(h('div', null, h('h2', null, 'Import save'), h('div', { class: 'sub' }, 'This replaces the progress on this device.'), ta,
    h('div', { class: 'btnrow' }, btn('Import', () => { const np = M.importCode(ta.value, app.now()); if (!np) { toast('That code did not work.'); return; } app.replaceProfile(np); m.close(); toast('Save imported!'); }, 'green'), btn('Cancel', () => m.close(), 'dark'))));
}
function resetModal(app) {
  const m = modal(h('div', null, h('h2', null, 'Reset everything?'), h('div', { class: 'sub', style: 'text-align:center' }, 'This deletes all progress on this device. It cannot be undone.'),
    h('div', { class: 'btnrow' }, btn('Delete it all', () => { app.replaceProfile(M.newProfile(app.now())); m.close(); app.showTitle(); }, 'red'), btn('Keep playing', () => m.close(), 'green'))));
}

// ================================================================================================ lucky wheel and leaderboard
function wheelCard(app, rerender) {
  const p = app.profile, now = app.now();
  const st = M.wheelState(p, now);
  const seg = Math.PI * 2 / WHEEL.length;
  const anim = { a: 0, from: 0, to: 0, t0: 0, dur: 0, spinning: false };
  const cv = canvasOf(240, 250, (ctx, t) => {
    if (anim.spinning) { const k = Math.min(1, (performance.now() - anim.t0) / anim.dur); const e = 1 - Math.pow(1 - k, 3); anim.a = anim.from + (anim.to - anim.from) * e; if (k >= 1) anim.spinning = false; }
    ctx.save(); ctx.translate(120, 135);
    ctx.save(); ctx.rotate(anim.a);
    WHEEL.forEach((w, i) => {
      const a0 = -Math.PI / 2 + i * seg, a1 = a0 + seg;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 108, a0, a1); ctx.closePath();
      ctx.fillStyle = ['#ff5fb0', '#7a5cff', '#2fe6ff', '#ffc83d'][i % 4]; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.strokeStyle = '#12082b'; ctx.stroke();
      ctx.save(); ctx.rotate(a0 + seg / 2); AE.drawGlyph(ctx, w.glyph, 74, 0, 26, '#fff');
      ctx.translate(48, 0); ctx.rotate(Math.PI / 2 * 0); ctx.fillStyle = '#fff'; ctx.font = '900 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeStyle = '#12082b'; ctx.lineWidth = 3; ctx.strokeText(w.label, 0, 0); ctx.fillText(w.label, 0, 0); ctx.restore();
    });
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fillStyle = '#12082b'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(120, 36); ctx.lineTo(108, 10); ctx.lineTo(132, 10); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#12082b'; ctx.stroke();
  }, { live: true });
  const label = h('div', { class: 'sub', style: 'text-align:center' }, st.free ? 'Your free daily spin is ready!' : 'Come back tomorrow for a free spin, or spin for ' + WHEEL_SPIN_PRICE + ' diamonds.');
  let busy = false;
  const spin = btn(st.free ? 'SPIN!' : [icon('diamond', 20), WHEEL_SPIN_PRICE + ' Spin'], () => {
    if (busy) return;
    const r = M.spinWheel(p, now, app.rng());
    if (!r.ok) { app.audio.play('error'); toast('Need ' + WHEEL_SPIN_PRICE + ' diamonds.'); return; }
    busy = true; app.audio.play('crate_shake');
    anim.from = anim.a % (Math.PI * 2); anim.to = anim.from + Math.PI * 2 * 5 + ((-(r.index * seg + seg / 2) - anim.from) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); anim.t0 = performance.now(); anim.dur = 3600; anim.spinning = true;
    let ticks = 0; const tk = setInterval(() => { if (!anim.spinning) { clearInterval(tk); return; } app.audio.play('tick', { vol: 0.4, pitch: 1 + (ticks++ % 3) * 0.05 }); }, 140);
    setTimeout(() => { app.audio.play('reveal_' + (r.seg.reward.crate || r.seg.reward.diamonds >= 10 ? 'epic' : 'rare')); toast('You won ' + r.seg.label + (r.seg.reward.records ? ' Records' : r.seg.reward.diamonds ? ' diamonds' : ' crate') + '!', 2600); if (r.loot && r.loot.length) crateOpening(app, r.seg.reward.crate, r.loot, rerender); else rerender(); }, 3800);
  }, st.free ? 'gold big' : 'blue');
  return h('div', { class: 'card', style: 'text-align:center' }, cv, label, h('div', { style: 'margin-top:8px' }, spin));
}

export function boardModal(app, id, title) {
  const p = app.profile;
  const body = h('div', null, h('h2', null, title), h('div', { class: 'sub', style: 'text-align:center' }, 'Loading...'));
  const m = modal(body);
  fetchBoard(id).then((top) => {
    body.replaceChildren(h('h2', null, title));
    if (!top) { body.append(h('div', { class: 'sub', style: 'text-align:center;padding:14px' }, 'The leaderboard is offline right now. Your own best is still saved.')); }
    else if (!top.length) body.append(h('div', { class: 'sub', style: 'text-align:center;padding:14px' }, 'No scores yet. Be the first!'));
    else top.slice(0, 20).forEach((e, i) => body.append(h('div', { class: 'row', style: 'padding:6px 4px;border-bottom:2px solid #12082b' + (e.name === p.name ? ';background:#3b2a7a55' : '') }, h('div', { style: 'width:34px;font-weight:900;color:' + (i < 3 ? 'var(--gold)' : 'var(--dim)') }, '#' + (i + 1)), h('div', { class: 'grow', style: 'font-weight:800' }, e.name), h('div', { style: 'font-weight:900' }, e.score))));
    body.append(h('div', { class: 'sub', style: 'font-size:12px;text-align:center;margin-top:8px' }, p.name ? 'You appear as ' + p.name + '.' : 'Set your name in Settings to join the board.'), h('div', { class: 'btnrow' }, btn('Close', () => m.close(), 'green')));
  });
}

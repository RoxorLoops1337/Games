// Midnight Mog town screen: the rooftop grid (screen id 'town').
//
// Plots sit on the spiral grid from data/buildings.js (plotCoord). Tap an empty plot to build (a strip of buildings, an
// adjacency PREVIEW of what the neighbours would gain or lose before you commit), tap a building for its detail sheet (output,
// storage fill, level table, neighbour bonuses, upgrade x1 / x10, move, Catnip Garden options). Tap the glowing next plot to
// unlock it. COLLECT ALL pays every building with a fly-in of fish, yarn and gems into the currency strip (the strip only
// counts up when the icons land, so what you see is what you were paid). Welcome-back panel for offline gains, check-in streak,
// visitors, storage meters.
//
// Screen contract (docs/UI.md): id 'town'
//   enter(app, params)  params: {offline?: {fish,yarn,seconds,capped,...}}  (when main already applied the offline gain, pass it
//                       so the panel can show it; otherwise the screen applies it once per session via sim/offline.applyOffline)
//   update(app, dt, ui) / draw(ctx, app, ui) / exit(app)
// App needs: profile, setProfile, save, now() (ms), dayIndex(), router.go('crates'), audio (optional).
import { PAL, RARITY, rgba, shade, glow } from '../palette.js';
import { drawText, formatNum, formatTime } from '../render/text.js';
import * as ICONS from '../render/icons.js';
import * as WORLD from '../render/world.js';
import * as FX from '../render/fx.js';
import {
  BUILDINGS, BUILDING_BY_ID, STATS, CHECKIN, TABLE_LEVELS, plotCoord, adjacency, statsAt, outputPerSecond, tierName, tierOf, upgradeCost,
  streakBonus, DISTRICT_CHOICES, hash32,
} from '../data/buildings.js';
import { DISTRICT_BY_ID } from '../data/districts.js';
import { cost } from '../sim/economy.js';
import {
  plotInfo, canBuild, build, upgrade, upgradeInfo, plotUnlockInfo, unlockPlot, swap, setOpt, collect, visitorState, claimVisitor,
  production, perMinute, townStats,
} from '../sim/town.js';
import { applyOffline } from '../sim/offline.js';
import { clamp, fin, lerp, outBack, outCubic, inOutSine, chamfer, vgrad, hash01 } from './shell.js';

const TAU = Math.PI * 2;
const CHECKED = new WeakSet();                 // apps whose offline gain this module already applied
const MAX_FLY = 72, MAX_POP = 24;
const CUR_COL = { fish: PAL.bone, yarn: PAL.magenta, gems: PAL.cyan, tokens: PAL.lime, xp: PAL.violetHi, keys: PAL.lime };
const STRIP = ['fish', 'yarn', 'gems', 'tokens'];

const STAT_LABEL = {
  fishPerSec: 'Fish output', yarnPerSec: 'Yarn output', xpPerSec: 'Training xp', gemsPerHour: 'Gem output', offlineCapHours: 'Offline cap',
  offlineEffAdd: 'Offline efficiency', buffPct: 'District buff', keysPerDay: 'Crate keys per day', pityCredit: 'Pity credit', deckSlots: 'Deck slots',
  cardCostDiscount: 'Card level discount', mapsUnlocked: 'Maps', mapRewardPct: 'Map rewards', shardPct: 'Shard bonus', echoAdd: 'Echo clears',
  keepAdd: 'Levels kept on rebirth', energyRegenPct: 'Energy regen', startEnergyAdd: 'Start energy', storageSecondsAdd: 'Extra storage',
  streakGrace: 'Streak grace days', battleFishPct: 'Battle fish', battleYarnPct: 'Battle yarn', lootLuckPct: 'Loot luck',
  visitorIntervalCut: 'Faster visitors', townOutputPct: 'Town output', baseHpPct: 'Base HP', baseRegenPct: 'Base regen', catLevelDiscount: 'Cat level discount',
};

// ------------------------------------------------------------------------------------------------ pure helpers (exported for tests and lab)
const num = (n, d) => formatNum(fin(n), { decimals: d === undefined ? 1 : d });
const pctText = (x) => { const v = x * 100; return (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')) + '%'; };
const signedPct = (x) => (x >= 0 ? '+' : '-') + pctText(Math.abs(x));

/** Human text of one stat value: statText('fishPerSec', 0.45) -> '0.45 fish/s'. */
export function statText(stat, v) {
  v = fin(v);
  const spec = STATS[stat] || { unit: '' };
  switch (spec.unit) {
    case 'fish/s': return num(v, 2) + ' fish/s';
    case 'yarn/s': return num(v, 2) + ' yarn/s';
    case 'xp/s': return num(v, 2) + ' xp/s';
    case 'gems/h': return num(v, 2) + ' gems/h';
    case 'fraction': return '+' + pctText(v);
    case 'hours': return v.toFixed(1) + 'h';
    case 'seconds': return formatTime(v);
    case 'keys/day': return v.toFixed(2) + '/day';
    case 'slots': case 'pulls': case 'maps': case 'energy': case 'days': return '+' + Math.round(v);
    default: return num(v, 2);
  }
}

/** 'Sardine Smokehouse' for 'id:smokehouse', 'a noisy building' for 'tag:noisy', and so on. */
export function srcName(src) {
  if (src === 'empty') return 'an empty plot';
  if (src === 'void') return 'open sky';
  if (src === 'any') return 'any building';
  if (src.startsWith('id:')) { const d = BUILDING_BY_ID[src.slice(3)]; return d ? d.name : src.slice(3); }
  if (src.startsWith('tag:')) return 'a ' + src.slice(4) + ' building';
  return src;
}

function plotsOf(profile) { return (profile && profile.town && Array.isArray(profile.town.plots)) ? profile.town.plots : []; }
const copyPlots = (pl) => pl.map((p) => (p && p.b ? { ...p } : {}));

/**
 * Adjacency PREVIEW of putting building `b` on empty plot `i` (level 1). Returns
 * {self:{potency, bonus, parts, stats}, others:[{i, b, name, level, before, after, delta, rateBefore, rateAfter, cur}], gain, loss}.
 * Pure: reads the same adjacency() the sim pays with, so the numbers shown are the numbers earned.
 */
export function previewBuild(profile, i, b) {
  const before = plotsOf(profile), def = BUILDING_BY_ID[b];
  const after = copyPlots(before);
  if (!def || !(i >= 0 && i < after.length)) return { self: { potency: 1, bonus: 0, parts: [], stats: {} }, others: [], gain: 0, loss: 0 };
  after[i] = { b, level: 1 };
  return diffPlots(before, after, i);
}

/** Preview of swapping the contents of plots a and c (a free move): same shape as previewBuild, `self` is the plot a lands on. */
export function previewSwap(profile, a, c) {
  const before = plotsOf(profile);
  if (!(a >= 0 && a < before.length && c >= 0 && c < before.length) || a === c) return { self: { potency: 1, bonus: 0, parts: [], stats: {} }, others: [], gain: 0, loss: 0 };
  const after = copyPlots(before);
  const tmp = after[a]; after[a] = after[c]; after[c] = tmp;
  return diffPlots(before, after, c);
}

function diffPlots(before, after, selfIdx) {
  const out = { self: null, others: [], gain: 0, loss: 0 };
  const sp = after[selfIdx];
  const sdef = sp && sp.b ? BUILDING_BY_ID[sp.b] : null;
  const sadj = adjacency(after, selfIdx);
  out.self = { potency: sadj.potency, bonus: sadj.bonus, parts: sadj.parts, stats: sdef ? statsAt(sdef, sp.level, sadj.potency) : {} };
  for (let j = 0; j < after.length; j++) {
    if (j === selfIdx || !after[j] || !after[j].b) continue;
    const def = BUILDING_BY_ID[after[j].b];
    if (!def) continue;
    const a0 = adjacency(before, j), a1 = adjacency(after, j);
    const d = a1.potency - a0.potency;
    if (Math.abs(d) < 1e-9) continue;
    const r0 = outputPerSecond(def, after[j].level, a0.potency), r1 = outputPerSecond(def, after[j].level, a1.potency);
    const cur = r1.fish > 0 ? 'fish' : r1.yarn > 0 ? 'yarn' : r1.xp > 0 ? 'xp' : r1.gems > 0 ? 'gems' : '';
    out.others.push({ i: j, b: after[j].b, name: def.name, level: after[j].level, before: a0.potency, after: a1.potency, delta: d, cur, rateBefore: cur ? r0[cur] : 0, rateAfter: cur ? r1[cur] : 0 });
    if (d > 0) out.gain += d; else out.loss += d;
  }
  return out;
}

/** Totals of what is waiting in the buildings: {fish, yarn, xp, gems, keys, fullest, full}. Reads plotInfo (no multipliers). */
export function readyTotals(infos) {
  const t = { fish: 0, yarn: 0, xp: 0, gems: 0, keys: 0, fullest: 0, full: 0 };
  for (const inf of infos) {
    if (!inf || inf.empty || !inf.cur) continue;
    t[inf.cur] = (t[inf.cur] || 0) + fin(inf.pending);
    t.fullest = Math.max(t.fullest, fin(inf.fill));
    if (inf.full) t.full++;
  }
  return t;
}

/** Grid facts: rows to draw and the coordinate of the next plot to unlock. */
export function gridFacts(profile) {
  const n = plotsOf(profile).length;
  let maxY = 4;
  for (let i = 0; i <= n; i++) maxY = Math.max(maxY, plotCoord(i).y);
  return { count: n, rows: maxY + 1, next: plotCoord(n) };
}

// ------------------------------------------------------------------------------------------------ the screen
export function createTownScreen() {
  const S = {
    app: null, ui: null, params: null, t: 0, ready: false,
    sel: -1, sheet: null, sheetT: 0, tab: 'info', pick: '', optDistrict: DISTRICT_CHOICES[0], optStrain: 'dmg', times: 1,
    moveFrom: -1, moveTo: -1,
    welcome: null, welcomeT: 0, welcomeClaimed: false,
    hold: { fish: 0, yarn: 0, gems: 0, tokens: 0 }, shown: { fish: 0, yarn: 0, gems: 0, tokens: 0 }, stripPulse: { fish: 0, yarn: 0, gems: 0, tokens: 0 },
    infos: [], infoT: 0, infoProfile: null, totals: readyTotals([]),
    prev: null, prevKey: '', bsOrder: [], bsKey: null,
    fly: [], pops: [], flash: [], fx: null, fxW: 0, fxH: 0, tile: { w: 56, h: 56 },
    geo: { strip: { x: 0, y: 0, w: 0, h: 0 }, chips: [], area: { x: 0, y: 0, w: 0, h: 0 }, cell: 60, gx: 0, rows: 5, bar: { x: 0, y: 0, w: 0, h: 0 }, sheet: { x: 0, y: 0, w: 0, h: 0 }, sheetH: 0 },
    follow: false, bodyH: 400, listH: 400, collects: 0, lastCollectProfile: null, deltas: new Map(), scrollP: 0, clipY: undefined,
  };
  for (let i = 0; i < MAX_FLY; i++) S.fly.push({ on: false, cur: 'fish', x0: 0, y0: 0, x1: 0, y1: 0, t: 0, delay: 0, dur: 0.8, share: 0, seed: 0, bend: 0 });
  for (let i = 0; i < MAX_POP; i++) S.pops.push({ on: false, text: '', x: 0, y: 0, t: 0, col: PAL.bone, big: false });
  const G = S.geo;

  const audio = () => (S.app && S.app.audio) || null;
  function sfx(name, o) { const a = audio(); if (a && a.sfx) { try { a.sfx(name, o); } catch (e) { /* optional */ } } }
  const now = () => (S.app && S.app.now ? S.app.now() : 0);
  const day = () => (S.app && S.app.dayIndex ? S.app.dayIndex() : Math.floor(now() / 86400000));
  const reduced = () => !!(S.ui && S.ui.reduceMotion);

  function ensureFx(ui) {
    if (!S.fx) S.fx = FX.createFx(hash32('town', ui.w));
    if (S.fxW !== ui.w || S.fxH !== ui.h) {
      const k = clamp(ui.w / 390, 0.9, 1.4);
      S.tile.w = 56 * k; S.tile.h = 56 * k;
      FX.setLayout(S.fx, { w: ui.w, h: ui.h, field: { x: 0, y: 0, w: ui.w, h: ui.h }, tile: () => S.tile });
      S.fxW = ui.w; S.fxH = ui.h;
    }
    S.fx.reducedMotion = reduced();
  }

  // ---- profile-derived caches
  function refreshInfos(force) {
    const p = S.app.profile;
    const every = S.infos.length > 60 ? 1.5 : 0.5;                 // big towns refresh less often
    if (!force && S.infoProfile === p && S.t - S.infoT < every) return;
    S.infoProfile = p; S.infoT = S.t;
    const n = plotsOf(p).length;
    S.infos.length = 0;
    for (let i = 0; i < n; i++) S.infos.push(plotInfo(p, i, now()));
    S.totals = readyTotals(S.infos);
  }

  function popText(text, x, y, col, big) {
    for (let i = 0; i < MAX_POP; i++) {
      const q = S.pops[i];
      if (!q.on) { q.on = true; q.text = text; q.x = x; q.y = y; q.t = 0; q.col = col || PAL.bone; q.big = !!big; return; }
    }
  }

  function stripCell(cur) {
    const i = STRIP.indexOf(cur);
    const r = G.strip, gap = 6, w = (r.w - gap * (STRIP.length - 1)) / STRIP.length;
    const k = i < 0 ? 0 : i;
    return { x: r.x + k * (w + gap) + r.h * 0.5, y: r.y + r.h / 2 };
  }

  /** Spawn flying icons worth `total` of `cur` from (x,y). The strip holds the amount back until each icon lands. */
  function spawnFly(cur, x, y, total, n) {
    total = Math.floor(fin(total));
    if (total <= 0) return;
    const target = STRIP.indexOf(cur) >= 0 ? stripCell(cur) : null;
    if (!target || reduced()) { return; }
    n = clamp(n, 1, 8);
    let left = total;
    S.hold[cur] += total;
    for (let k = 0; k < n; k++) {
      let slot = null;
      for (let i = 0; i < MAX_FLY; i++) if (!S.fly[i].on) { slot = S.fly[i]; break; }
      const share = k === n - 1 ? left : Math.floor(total / n);
      left -= share;
      if (!slot) { S.hold[cur] -= share; continue; }          // pool full: pay instantly instead of losing the icon
      slot.on = true; slot.cur = cur; slot.x0 = x; slot.y0 = y; slot.x1 = target.x; slot.y1 = target.y; slot.t = 0;
      slot.delay = k * 0.07 + hash01('fd' + k + cur) * 0.08; slot.dur = 0.7 + hash01('fu' + k + cur) * 0.25; slot.share = share;
      slot.bend = (hash01('fb' + k + cur) - 0.5) * 160;
    }
  }

  // ---------------------------------------------------------------------------------------------- actions
  function commit(res) { S.app.setProfile(res.profile); if (S.app.save) S.app.save(); refreshInfos(true); }

  function doCollect() {
    const app = S.app, ui = S.ui;
    const res = collect(app.profile, now(), day());
    if (!res.ok) { ui.toast('Cannot collect right now', 'warn'); return; }
    const g = res.gained, keys = Object.values(g.keys || {}).reduce((s, v) => s + v, 0);
    const total = g.fish + g.yarn + g.gems + g.xp + keys;
    if (total <= 0) { ui.toast('Nothing to collect yet. Buildings are still working.', 'info'); sfx('deny'); return; }
    // hold back the strip BEFORE the profile changes, so the numbers never jump
    const before = app.profile;
    commit(res);
    void before;
    S.collects++;
    // icons fly from the producing plots
    const sumBy = { fish: 0, yarn: 0, gems: 0, xp: 0 };
    for (const r of res.plots) if (sumBy[r.cur] !== undefined) sumBy[r.cur] += r.amount;
    for (const cur of ['fish', 'yarn', 'gems']) {
      const t = g[cur];
      if (t <= 0) continue;
      let given = 0, lastPlot = -1;
      const rows = res.plots.filter((r) => r.cur === cur && r.amount > 0);
      for (const r of rows) lastPlot = r.i;
      for (const r of rows) {
        const share = r.i === lastPlot ? t - given : Math.floor(t * (r.amount / Math.max(1e-9, sumBy[cur])));
        given += share;
        const c = plotCenter(r.i);
        spawnFly(cur, c.x, c.y, share, 2 + Math.round(3 * r.fill));
        popText('+' + num(share, 0), c.x, c.y - 10, CUR_COL[cur]);
      }
      if (!rows.length) spawnFly(cur, G.area.x + G.area.w / 2, G.area.y + G.area.h / 2, t, 4);
    }
    if (res.tip.fish + res.tip.yarn > 0) popText('Daily tip!', G.area.x + G.area.w / 2, G.area.y - 6, PAL.cyan, true);
    if (res.streak && res.streak.fresh) S.ui.toast('Streak day ' + res.streak.days + ': +' + pctText(res.streak.bonus) + ' on every collect', 'reward');
    if (g.xp > 0) popText('+' + num(g.xp, 0) + ' xp', G.area.x + G.area.w * 0.5, G.area.y + G.area.h + 8, PAL.violetHi, true);
    if (keys > 0) S.ui.toast('+' + keys + ' crate key' + (keys === 1 ? '' : 's'), 'reward');
    if (res.fullCount > 0) popText('Full bowl bonus!', G.area.x + G.area.w / 2, G.area.y + 14, PAL.lime, true);
    sfx('reward_tick');
  }

  function plotCenter(i) {
    const c = plotCoord(i), cell = G.cell;
    return { x: G.gx + c.x * cell + cell / 2, y: (S.clipY === undefined ? G.area.y : S.clipY) + c.y * cell + 9 + (cell - 6) * 0.6 - (S.scrollP || 0) };
  }

  function doBuild() {
    const app = S.app, ui = S.ui;
    if (!S.pick || S.sel < 0) return;
    const def = BUILDING_BY_ID[S.pick];
    const opt = def && def.choices ? { district: S.optDistrict, strain: S.optStrain } : undefined;
    const res = build(app.profile, S.pick, S.sel, now(), opt);
    if (!res.ok) { ui.toast(reasonText(res.reason, def), 'warn'); sfx('deny'); return; }
    commit(res);
    celebrate(S.sel, 1);
    ui.toast(def.name + ' built', 'ok');
    sfx('reward_key');
    S.sheet = 'detail'; S.tab = 'info'; S.times = 1;
  }

  function doUpgrade(times) {
    const app = S.app, ui = S.ui;
    if (S.sel < 0) return;
    const res = upgrade(app.profile, S.sel, now(), times);
    if (!res.ok) { ui.toast(res.reason === 'need_fish' ? 'Not enough fish' : res.reason === 'maxed' ? 'Maxed out' : 'Cannot upgrade', 'warn'); sfx('deny'); return; }
    commit(res);
    celebrate(S.sel, res.levels);
    ui.toast('Level ' + plotsOf(app.profile)[S.sel].level + (res.levels > 1 ? ' (+' + res.levels + ')' : ''), 'ok');
    sfx('reward_key');
  }

  function celebrate(i, levels) {
    const c = plotCenter(i);
    S.flash[i] = S.t;
    if (S.fx) FX.burstAt(S.fx, c.x, c.y, PAL.cyan, 14 + Math.min(10, levels * 2), { speed: 130, life: 0.6, gravity: 80, ringR: 60, flash: true, shape: 'star' });
  }

  function reasonText(reason, def) {
    switch (reason) {
      case 'locked': return (def ? def.name : 'This') + ' unlocks at stage ' + (def ? def.unlockStage : '?');
      case 'limit': return 'You already have the most ' + (def ? def.name : 'of these') + ' allowed';
      case 'need_fish': return 'Not enough fish';
      case 'need_gems': return 'Not enough gems';
      case 'occupied': return 'That plot is taken';
      default: return 'Cannot build here';
    }
  }

  function openPlot(i) {
    const p = S.app.profile, pl = plotsOf(p);
    if (S.moveFrom >= 0) {
      if (i === S.moveFrom) { S.moveFrom = -1; S.moveTo = -1; return; }
      S.moveTo = i; sfx('card_select');
      return;
    }
    S.sel = i; S.follow = true;
    const has = pl[i] && pl[i].b;
    S.sheet = has ? 'detail' : 'build';
    if (has) { S.tab = 'info'; S.times = 1; const d = BUILDING_BY_ID[pl[i].b]; if (d && d.choices && pl[i].opt) { S.optDistrict = pl[i].opt.district; S.optStrain = pl[i].opt.strain; } }
    else S.pick = '';
    S.prevKey = '';
  }

  function closeSheet() { S.sheet = null; S.sel = -1; S.pick = ''; S.prev = null; S.prevKey = ''; }

  // ---------------------------------------------------------------------------------------------- lifecycle
  const screen = {
    id: 'town',
    enter(app, params) {
      S.app = app; S.params = params || {}; S.t = 0; S.ready = false;
      closeSheet(); S.moveFrom = -1; S.moveTo = -1; S.tab = 'info'; S.welcome = null; S.welcomeClaimed = false; S.welcomeT = 0;
      for (const k of STRIP) S.hold[k] = 0;
      for (const f of S.fly) f.on = false;
      for (const q of S.pops) q.on = false;
      S.flash.length = 0;
      let gain = S.params.offline || null;
      if (!gain && !CHECKED.has(app)) {
        CHECKED.add(app);
        try {
          const r = applyOffline(app.profile, now());
          if (r.profile !== app.profile) { app.setProfile(r.profile); if (app.save) app.save(); }
          gain = r.gain;
        } catch (e) { gain = null; }
      }
      if (gain && gain.seconds >= 60 && (gain.fish > 0 || gain.yarn > 0)) {
        S.welcome = { fish: Math.floor(gain.fish), yarn: Math.floor(gain.yarn), seconds: gain.seconds, capped: !!gain.capped, efficiency: gain.efficiency, capSeconds: gain.capSeconds };
        S.hold.fish += S.welcome.fish; S.hold.yarn += S.welcome.yarn;   // the strip waits for the claim
      }
      const a = audio(); if (a && a.music) { try { a.music('town'); } catch (e) { /* optional */ } }
    },
    update(app, dt, ui) {
      S.app = app; S.ui = ui;
      dt = clamp(fin(dt, 1 / 60), 0, 0.1);
      S.t += dt;
      ensureFx(ui);
      ui.toastY = G.chips.length ? G.chips[0].y + 46 : undefined;      // toasts sit under the chips so the strip stays readable
      FX.update(S.fx, dt);
      refreshInfos(false);
      // sheet easing
      const want = S.sheet ? 1 : 0;
      S.sheetT += (want - S.sheetT) * Math.min(1, dt * (reduced() ? 60 : 12));
      if (Math.abs(S.sheetT - want) < 0.002) S.sheetT = want;
      if (S.welcome && !S.welcomeClaimed) S.welcomeT += dt;
      for (const k of STRIP) S.stripPulse[k] = Math.max(0, S.stripPulse[k] - dt * 3);
      // fly-in particles
      for (let i = 0; i < MAX_FLY; i++) {
        const f = S.fly[i];
        if (!f.on) continue;
        if (f.delay > 0) { f.delay -= dt; continue; }
        f.t += dt / f.dur;
        if (f.t >= 1) {
          f.on = false;
          S.hold[f.cur] = Math.max(0, S.hold[f.cur] - f.share);
          S.stripPulse[f.cur] = 1;
          FX.burstAt(S.fx, f.x1, f.y1, CUR_COL[f.cur], 4, { speed: 70, life: 0.3, ring: false });
          sfx('reward_tick');
        }
      }
      for (let i = 0; i < MAX_POP; i++) { const q = S.pops[i]; if (q.on) { q.t += dt; if (q.t > 1.3) q.on = false; } }
    },
    exit() { closeSheet(); S.moveFrom = -1; if (S.ui) S.ui.toastY = undefined; },
    draw(ctx, app, ui) {
      S.app = app; S.ui = ui;
      ensureFx(ui);
      refreshInfos(false);
      layout(ui);
      const p = app.profile, t = ui.t;
      ui.clear(PAL.void);
      WORLD.drawTownBackdrop(ctx, ui.w, ui.h, t, { districtId: (p.progress && p.progress.district && districtName(p.progress.district)) || 'rooftop_row' });
      for (const k of STRIP) S.shown[k] = Math.max(0, fin(p.cur && p.cur[k]) - S.hold[k]);
      drawTop(ctx, ui, p);
      drawGrid(ctx, ui, p);
      FX.draw(ctx, S.fx, t);
      drawFly(ctx, ui);
      drawPops(ctx, ui);
      drawBottom(ctx, ui, p);
      if (S.sheetT > 0.01 && S.sheet) drawSheet(ctx, ui, p);
      if (S.moveFrom >= 0) drawMoveBar(ctx, ui, p);
      if (S.welcome && !S.welcomeClaimed) drawWelcome(ctx, ui);
      ui.vignette(0.35);
    },
    get state() { return S; },
    // lab and test hooks
    openPlot, closeSheet, doCollect, doBuild, doUpgrade, askUnlock,
  };

  function districtName(d) { const order = ['rooftop_row', 'alley_alamo', 'sewer_sprawl', 'laser_lights', 'appliance_heights', 'bathtub_bay']; return order[clamp((d | 0) - 1, 0, 5)] || 'rooftop_row'; }

  // ---------------------------------------------------------------------------------------------- layout
  function layout(ui) {
    const c = ui.content, p = S.app.profile, facts = gridFacts(p);
    const L = WORLD.layoutFor(ui.w, ui.h, 'town');
    G.strip.x = c.x + 12; G.strip.y = ui.safe.top + 10; G.strip.w = c.w - 24; G.strip.h = 32;
    const cy = G.strip.y + 40;
    G.chips.length = 0;
    const cols = ui.cols({ x: c.x + 12, y: cy, w: c.w - 24, h: 38 }, [1, 1.35, 1], 6);
    for (const r of cols) G.chips.push(r);
    const barH = 56;
    G.bar.x = c.x + 12; G.bar.w = c.w - 24; G.bar.h = barH; G.bar.y = c.y + c.h - 12 - barH;
    // sheet
    const ease = inOutSine(S.sheetT);
    G.sheetH = Math.min(ui.h * (S.sheet === 'build' ? 0.56 : 0.58), 470);
    G.sheet.x = c.x; G.sheet.w = c.w; G.sheet.h = G.sheetH; G.sheet.y = ui.h - ui.safe.bottom - G.sheetH * ease + (1 - ease) * 4;
    const chipsBottom = G.chips[0].y + 38 + 10;
    const top = lerp(Math.max(chipsBottom, Math.min(L.town.rect.y + 26, ui.h * 0.4)), chipsBottom, ease);
    const bottomFree = ease > 0 ? G.sheet.y - 8 : G.bar.y - 8;
    const barBottom = G.bar.y - 8;
    const availH = Math.max(120, Math.min(bottomFree, barBottom) - top);
    G.rows = facts.rows;
    const byW = (c.w - 12) / 5;
    const visRows = Math.min(5, facts.rows);
    G.cell = Math.max(44, Math.min(byW, availH / visRows, 150));
    G.gx = c.x + c.w / 2 - (G.cell * 5) / 2;
    G.area.x = c.x; G.area.w = c.w; G.area.y = top; G.area.h = availH;
  }

  // ---------------------------------------------------------------------------------------------- top: strip and chips
  function drawTop(ctx, ui, p) {
    const tapped = ui.currencyStrip(G.strip, S.shown, { show: STRIP });
    void tapped;
    // pulse rings on landed currencies
    for (const k of STRIP) {
      if (S.stripPulse[k] > 0.02) { const c = stripCell(k); glow(ctx, c.x, c.y, 30 * S.stripPulse[k] + 10, CUR_COL[k], 0.5 * S.stripPulse[k]); }
    }
    const ch = G.chips, t = ui.t;
    // streak
    const town = p.town || {}, st = town.streak || { days: 0, last: -1 };
    const today = day(), doneToday = st.last === today;
    chip(ctx, ui, ch[0], 'streak', 'DAY ' + Math.max(0, st.days | 0), doneToday ? 'checked in' : 'collect to keep', PAL.cyan, !doneToday && st.days > 0, (c2, x, y, s) => flame(c2, x, y, s, t));
    // visitor
    const vs = visitorState(p, now());
    if (!vs.claimed && !vs.stale) {
      if (chip(ctx, ui, ch[1], 'visitor', vs.kind.name.toUpperCase(), 'tap to greet', PAL.lime, true, (c2, x, y, s) => cat(c2, x, y, s, t))) {
        const r = claimVisitor(p, now(), day());
        if (r.ok) {
          commit(r);
          const rw = r.reward;
          for (const cur of ['fish', 'yarn', 'gems']) spawnFly(cur, ch[1].x + ch[1].w / 2, ch[1].y + ch[1].h, rw[cur] || (cur === 'gems' ? r.gemsGranted : 0), 5);
          ui.toast(r.visitor.name + ' left a gift' + rewardText(rw, r.gemsGranted), 'reward');
          sfx('reward_key');
        } else ui.toast('Visitor is not ready', 'warn');
      }
    } else chip(ctx, ui, ch[1], 'visitor', 'NEXT VISITOR', formatTime(vs.secondsLeft), PAL.slate, false, (c2, x, y, s) => cat(c2, x, y, s, t));
    // income
    const pm = perMinute(p);
    chip(ctx, ui, ch[2], 'income', '+' + num(pm.fish, 0) + ' /min', num(pm.yarn, 0) + ' yarn /min', PAL.bone, false, (c2, x, y, s) => ICONS.drawCurrency(c2, 'fish', x, y, s * 1.2, t));
  }

  function rewardText(rw, gems) {
    const parts = [];
    if (rw.fish) parts.push(num(rw.fish, 0) + ' fish');
    if (rw.yarn) parts.push(num(rw.yarn, 0) + ' yarn');
    if (rw.xp) parts.push(num(rw.xp, 0) + ' xp');
    if (gems) parts.push(gems + ' gems');
    const k = Object.entries(rw.keys || {}).reduce((s, e) => s + e[1], 0);
    if (k) parts.push(k + ' key');
    return parts.length ? ': ' + parts.join(', ') : '';
  }

  function flame(c, x, y, s, t) {
    c.save(); c.translate(x, y); c.scale(s / 18, s / 18);
    const w = 1 + 0.06 * Math.sin(t * 9);
    c.scale(w, 1);
    c.fillStyle = PAL.cyan; c.strokeStyle = PAL.ink; c.lineWidth = 2; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(0, -9); c.quadraticCurveTo(8, -1, 5, 6); c.quadraticCurveTo(0, 11, -5, 6); c.quadraticCurveTo(-8, 0, -3, -4); c.quadraticCurveTo(-2, -1, 0, -2); c.quadraticCurveTo(-1, -6, 0, -9); c.closePath(); c.stroke(); c.fill();
    c.fillStyle = PAL.bone; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(3, 3, 1, 7); c.quadraticCurveTo(-3, 6, 0, 0); c.fill();
    c.restore();
  }
  function cat(c, x, y, s, t) {
    c.save(); c.translate(x, y); c.scale(s / 18, s / 18);
    c.fillStyle = PAL.lime; c.strokeStyle = PAL.ink; c.lineWidth = 2; c.lineJoin = 'round';
    c.beginPath(); c.ellipse(0, 2 + Math.sin(t * 3) * 0.6, 8, 7, 0, 0, TAU); c.stroke(); c.fill();
    for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 7, -3); c.quadraticCurveTo(sx * 9, -9, sx * 4, -10); c.quadraticCurveTo(sx * 4, -6, sx * 2, -5); c.closePath(); c.stroke(); c.fill(); }
    c.fillStyle = PAL.ink; c.fillRect(-4, 0, 2, 2.4); c.fillRect(2, 0, 2, 2.4);
    c.restore();
  }

  function chip(ctx, ui, r, id, title, sub, col, hot, icon) {
    const st = ui.region('chip:' + id, r, { focus: hot, label: title + ' ' + sub });
    const pulse = hot ? 0.5 + 0.5 * Math.sin(ui.t * 4) : 0;
    ctx.save(); ctx.translate(r.x, r.y + (st.down ? 1.5 : 0));
    if (hot) glow(ctx, r.w / 2, r.h / 2, r.w * 0.7, col, 0.2 + 0.2 * pulse);
    chamfer(ctx, 0, 0, r.w, r.h, 6); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.fillStyle = vgrad(ctx, 'tchip', r.h, PAL.ink3, PAL.ink); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(col, hot ? 0.95 : 0.5); ctx.stroke();
    icon(ctx, 17, r.h / 2, 18);
    drawText(ctx, title, 32, r.h / 2 - 2, { size: 13, kind: 'display', color: hot ? PAL.bone : PAL.boneDim, maxWidth: r.w - 38, stroke: 3 });
    drawText(ctx, sub, 32, r.h / 2 + 13, { size: 12, kind: 'body', weight: 700, color: hot ? col : PAL.boneDim, maxWidth: r.w - 38, stroke: 3 });
    ctx.restore();
    return st.tap;
  }

  // ---------------------------------------------------------------------------------------------- grid
  function drawGrid(ctx, ui, p) {
    const pl = plotsOf(p), cell = G.cell, area = G.area, t = ui.t;
    const facts = gridFacts(p);
    const contentH = facts.rows * cell + 8;
    const clipR = { x: area.x, y: area.y - 6, w: area.w, h: area.h + 10 };
    const prev = S.moveFrom >= 0 && S.moveTo >= 0 ? previewSwap(p, S.moveFrom, S.moveTo) : S.sheet === 'build' && S.pick && S.sel >= 0 ? S.prev : null;
    const deltas = S.deltas;                                                             // reused, only filled while previewing
    deltas.clear();
    if (prev) for (const o of prev.others) deltas.set(o.i, o.delta);
    const ss = ui.state('scr:town:grid', { p: 0, v: 0, drag: false });
    if (S.sheet && S.sel >= 0 && S.follow && !ss.drag) {
      const view = clipR.h, maxP = Math.max(0, contentH + 6 - view);
      const tgt = clamp((plotCoord(S.sel).y + 0.5) * cell + 9 - view / 2, 0, maxP);
      ss.p += (tgt - ss.p) * Math.min(1, ui.dt * 9); ss.v = 0;
    } else if (ss.drag) S.follow = false;
    const sc = ui.scroll('town:grid', clipR, facts.rows <= 5 ? Math.min(contentH + 6, clipR.h) : contentH + 6, (cc) => {
      for (let i = 0; i <= pl.length; i++) {
        const co = plotCoord(i);
        const x = G.gx - area.x + co.x * cell + 3, y = co.y * cell + 9, w = cell - 6, h = cell - 6;
        const rect = { x, y, w, h };
        const isNext = i === pl.length;
        const owned = !isNext;
        const inf = owned ? S.infos[i] : null;
        const st = ui.region('plot:' + i, rect, { focus: true, label: owned ? (inf && !inf.empty ? BUILDING_BY_ID[inf.b].name + ' level ' + inf.level : 'empty plot ' + (i + 1)) : 'unlock next plot' });
        const selected = (S.sel === i && S.sheet) || S.moveFrom === i || S.moveTo === i;
        const fl = S.flash[i] !== undefined ? clamp(1 - (S.t - S.flash[i]) / 0.8, 0, 1) : 0;
        if (isNext) {
          WORLD.drawPlot(cc, { x: G.gx - area.x + co.x * cell + 3, y: y - 2, w, h }, { locked: true, hover: st.hover }, t);
          drawText(cc, 'UNLOCK', x + w / 2, y + h * 0.62, { size: Math.max(11, cell * 0.17), kind: 'display', align: 'center', color: PAL.cyan, maxWidth: w - 6, stroke: 3 });
          const pu = plotUnlockInfo(p);
          drawText(cc, num(pu.fish, 0), x + w / 2, y + h * 0.82, { size: Math.max(11, cell * 0.16), kind: 'body', weight: 800, align: 'center', color: pu.reason === 'need_fish' ? PAL.magenta : PAL.bone, maxWidth: w - 6, stroke: 3 });
          if (st.tap) askUnlock();
          continue;
        }
        const empty = !inf || inf.empty;
        const fill = empty ? 0 : fin(inf.fill);
        if (fl > 0) glow(cc, x + w / 2, y + h * 0.6, w * (0.7 + 0.5 * (1 - fl)), PAL.cyan, 0.5 * fl);
        WORLD.drawPlot(cc, rect, { b: empty ? null : inf.b, level: empty ? 0 : inf.level, selected, hover: st.hover, ready: !empty && fill >= 0.5 && !!inf.cur }, t);
        if (!empty) {
          drawText(cc, 'Lv' + inf.level, x + 4, y + h * 0.3 + 14, { size: Math.max(10, cell * 0.15), kind: 'body', weight: 800, color: PAL.bone, stroke: 3 });
          if (inf.cur && inf.rate > 0) {                                                   // storage fill meter
            const bw = w - 16, bx = x + 8, by = y + h - 3;
            cc.fillStyle = rgba(PAL.ink, 0.9); cc.fillRect(bx - 1, by - 1, bw + 2, 5);
            cc.fillStyle = fill >= 0.9 ? PAL.lime : PAL.cyan; cc.fillRect(bx, by, bw * fill, 3);
            if (fill >= 0.9) { cc.fillStyle = rgba(PAL.bone, 0.4 + 0.3 * Math.sin(t * 8)); cc.fillRect(bx, by, bw * fill, 1); }
          }
        }
        if (deltas.has(i)) previewChip(cc, x + w - 2, y + 8, deltas.get(i), cell);
        if (prev && S.sheet === 'build' && S.sel === i) potencyChip(cc, x + w / 2, y + h * 0.3 - 4, prev.self.potency, cell);
        if (S.moveTo === i && prev) potencyChip(cc, x + w / 2, y + h * 0.3 - 4, prev.self.potency, cell);
        if (S.moveFrom === i) { cc.save(); cc.globalAlpha = 0.5 + 0.3 * Math.sin(t * 6); cc.strokeStyle = PAL.magenta; cc.lineWidth = 2; cc.setLineDash([5, 4]); cc.strokeRect(x - 2, y + h * 0.3 - 2, w + 4, h * 0.7 + 4); cc.restore(); }
        if (st.tap) {
          if (S.moveFrom >= 0) openPlot(i);
          else if (S.sel === i && S.sheet) closeSheet();
          else openPlot(i);
          sfx('card_select');
        }
      }
    });
    S.scrollP = sc.p; S.clipY = clipR.y;
  }

  function previewChip(cc, x, y, delta, cell) {
    const txt = (delta >= 0 ? '+' : '') + Math.round(delta * 100) + '%';
    const fs = Math.max(11, cell * 0.17), w = txt.length * fs * 0.6 + 10, col = delta >= 0 ? PAL.lime : PAL.magenta;
    cc.save(); cc.translate(x - w, y - fs * 0.7);
    chamfer(cc, 0, 0, w, fs + 6, 3); cc.lineWidth = 4; cc.strokeStyle = PAL.ink; cc.stroke(); cc.fillStyle = shade(col, -0.62); cc.fill(); cc.lineWidth = 1.2; cc.strokeStyle = col; cc.stroke();
    drawText(cc, txt, w / 2, fs + 1, { size: fs, kind: 'body', weight: 800, align: 'center', color: delta >= 0 ? PAL.lime : PAL.bone, stroke: 2 });
    cc.restore();
  }
  function potencyChip(cc, x, y, pot, cell) {
    const txt = 'x' + pot.toFixed(2), fs = Math.max(11, cell * 0.17), w = txt.length * fs * 0.62 + 12;
    cc.save(); cc.translate(x - w / 2, y - fs);
    chamfer(cc, 0, 0, w, fs + 7, 3); cc.lineWidth = 4; cc.strokeStyle = PAL.ink; cc.stroke(); cc.fillStyle = shade(PAL.cyan, -0.6); cc.fill(); cc.lineWidth = 1.5; cc.strokeStyle = PAL.cyan; cc.stroke();
    drawText(cc, txt, w / 2, fs + 2, { size: fs, kind: 'body', weight: 800, align: 'center', color: PAL.bone, stroke: 2 });
    cc.restore();
  }

  function askUnlock() {
    const ui = S.ui, p = S.app.profile, u = plotUnlockInfo(p);
    if (u.reason === 'max_plots') { ui.toast('Every plot is unlocked', 'info'); return; }
    if (u.reason === 'locked') { ui.dialog({ id: 'unlock', title: 'PLOT LOCKED', text: 'Reach stage ' + u.needStage + ' to unlock the next plot. It costs ' + num(u.fish, 0) + ' fish.', buttons: [{ id: 'ok', label: 'OK', kind: 'secondary' }] }); return; }
    ui.confirm('UNLOCK PLOT', 'Open a new plot for ' + num(u.fish, 0) + ' fish? New plots also change which buildings touch each other.', () => {
      const r = unlockPlot(S.app.profile, now());
      if (r.ok) { commit(r); celebrate(r.plotIndex, 1); ui.toast('Plot unlocked', 'ok'); sfx('reward_key'); } else { ui.toast(r.reason === 'need_fish' ? 'Need ' + num(u.fish - S.app.profile.cur.fish, 0) + ' more fish' : 'Cannot unlock yet', 'warn'); sfx('deny'); }
    }, { yesLabel: 'UNLOCK' });
  }

  // ---------------------------------------------------------------------------------------------- fly-in and pops
  function drawFly(ctx, ui) {
    ctx.save();
    for (let i = 0; i < MAX_FLY; i++) {
      const f = S.fly[i];
      if (!f.on || f.delay > 0) continue;
      const e = outCubic(f.t < 0.25 ? f.t * 0.6 : 0.15 + (f.t - 0.25) / 0.75 * 0.85);
      const mx = (f.x0 + f.x1) / 2 + f.bend, my = Math.min(f.y0, f.y1) - 40;
      const a = 1 - e, x = a * a * f.x0 + 2 * a * e * mx + e * e * f.x1, y = a * a * f.y0 + 2 * a * e * my + e * e * f.y1;
      glow(ctx, x, y, 16, CUR_COL[f.cur], 0.35);
      ICONS.drawCurrency(ctx, f.cur, x, y, 20 * (1 - 0.3 * e), ui.t + i);
    }
    ctx.restore();
  }
  function drawPops(ctx) {
    for (let i = 0; i < MAX_POP; i++) {
      const q = S.pops[i];
      if (!q.on) continue;
      const k = q.t / 1.3, y = q.y - 30 * outCubic(k), a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
      drawText(ctx, q.text, q.x, y, { size: q.big ? 20 : 14, kind: 'display', align: 'center', color: q.col, glow: 5, glowColor: q.col, scale: 0.8 + 0.2 * outBack(k * 3), maxWidth: q.big ? 200 : 64 });
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------------------------- bottom bar
  function drawBottom(ctx, ui, p) {
    const bar = G.bar, T = S.totals;
    const ready = T.fish + T.yarn + T.gems + T.xp + T.keys;
    const parts = ready > 0 ? [T.fish > 0.5 ? num(T.fish, 0) + ' fish' : '', T.yarn > 0.5 ? num(T.yarn, 0) + ' yarn' : '', T.gems >= 1 ? Math.floor(T.gems) + ' gems' : ''].filter(Boolean) : [];
    const sub = parts.length ? 'ready: ' + parts.join(', ') : 'buildings are working';
    const ks = Object.values((p.town && p.town.keys) || {}).reduce((s, v) => s + v, 0);
    const w1 = bar.w - 104 - 8;
    const dim = S.moveFrom >= 0 || (S.welcome && !S.welcomeClaimed);
    if (ui.button('collect', { x: bar.x, y: bar.y, w: w1, h: bar.h }, 'COLLECT ALL', { kind: 'positive', sub, pulse: T.fullest >= 0.9 || ready > 0 && T.fullest >= 0.5, size: 21, disabled: dim }) && !dim) doCollect();
    if (ui.button('crates', { x: bar.x + w1 + 8, y: bar.y, w: 96, h: bar.h }, 'CRATES', { kind: 'primary', size: 16, badge: ks > 0 ? ks : undefined, disabled: dim }) && !dim) { if (S.app.router) S.app.router.go('crates'); }
    // full bowl meter above the button
    if (T.fullest > 0.01) {
      const bx = bar.x + 4, by = bar.y - 7, bw = bar.w - 8;
      ctx.fillStyle = rgba(PAL.ink, 0.85); ctx.fillRect(bx, by, bw, 4);
      ctx.fillStyle = T.fullest >= 0.9 ? PAL.lime : PAL.cyan; ctx.fillRect(bx, by, bw * T.fullest, 4);
    }
  }

  // ---------------------------------------------------------------------------------------------- move bar
  function drawMoveBar(ctx, ui, p) {
    const c = ui.content, y = G.chips[0].y;
    ui.pushLayer();
    const r = { x: c.x + 12, y, w: c.w - 24, h: 44 };
    ctx.save(); chamfer(ctx, r.x, r.y, r.w, r.h, 6); ctx.fillStyle = PAL.ink2; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = PAL.magenta; ctx.stroke(); ctx.restore();
    const pl = plotsOf(p), from = pl[S.moveFrom];
    const name = from && from.b ? BUILDING_BY_ID[from.b].name : 'plot';
    const pv = S.moveTo >= 0 ? previewSwap(p, S.moveFrom, S.moveTo) : null;
    const g = pv ? Math.round(pv.gain * 100) : 0, l = pv ? Math.round(pv.loss * 100) : 0;
    const line1 = pv ? 'Next door: ' + (g || l ? (g ? '+' + g + '% ' : '') + (l ? l + '%' : '') : 'no change') : 'Move ' + name;
    const line2 = pv ? 'This plot: x' + pv.self.potency.toFixed(2) + ' power' : 'tap a plot to swap with it';
    drawText(ctx, line1, r.x + 10, r.y + 19, { size: 14, kind: 'body', weight: 800, color: PAL.bone, maxWidth: r.w - 206, stroke: 3 });
    drawText(ctx, line2, r.x + 10, r.y + 36, { size: 12, kind: 'body', weight: 700, color: pv && pv.self.potency < 0.999 ? PAL.magenta : PAL.boneDim, maxWidth: r.w - 206, stroke: 3 });
    if (ui.button('move:cancel', { x: r.x + r.w - 190, y: r.y + 2, w: 90, h: 40 }, 'CANCEL', { kind: 'secondary', size: 14 }) || ui.keyHit('escape')) { ui.eatKey('escape'); S.moveFrom = -1; S.moveTo = -1; }
    if (ui.button('move:ok', { x: r.x + r.w - 96, y: r.y + 2, w: 92, h: 40 }, 'SWAP', { kind: 'positive', size: 14, disabled: S.moveTo < 0 })) {
      const res = swap(S.app.profile, S.moveFrom, S.moveTo, now());
      if (res.ok) { commit(res); celebrate(S.moveTo, 1); S.flash[S.moveFrom] = S.t; ui.toast('Swapped', 'ok'); sfx('card_play'); S.sel = S.moveTo; S.moveFrom = -1; S.moveTo = -1; S.sheet = 'detail'; } else ui.toast('Cannot swap', 'warn');
    }
    ui.popLayer();
  }
  // ---------------------------------------------------------------------------------------------- sheets
  function drawSheet(ctx, ui, p) {
    const r = G.sheet;
    ui.pushLayer();
    ui.region('sheet:panel', r, null);
    const inner = ui.panel(r, { title: S.sheet === 'build' ? 'BUILD' : 'BUILDING', color: PAL.violetHi, glow: true });
    if (S.sheet === 'build') drawBuildSheet(ctx, ui, p, inner, r);
    else drawDetailSheet(ctx, ui, p, inner, r);
    if (ui.button('sheet:close', { x: r.x + r.w - 52, y: r.y - 14, w: 44, h: 44 }, '', { kind: 'icon', icon: 'close', aria: 'Close' }) || ui.keyHit('escape')) { ui.eatKey('escape'); closeSheet(); }
    ui.popLayer();
  }

  function buildOrder(p) {
    if (S.bsKey === p) return S.bsOrder;
    S.bsKey = p;
    const arr = BUILDINGS.map((d, i) => ({ d, i, ok: canBuild(p, d.id, Math.max(0, S.sel)) }));
    const rank = (x) => (x.ok.ok ? 0 : x.ok.reason === 'need_fish' || x.ok.reason === 'need_gems' ? 1 : x.ok.reason === 'limit' ? 3 : 2);
    arr.sort((a, b) => rank(a) - rank(b) || a.d.unlockStage - b.d.unlockStage || a.i - b.i);
    S.bsOrder = arr;
    return arr;
  }

  function drawBuildSheet(ctx, ui, p, inner, r) {
    const t = ui.t, order = buildOrder(p);
    if (!S.pick) { const f = order.find((o) => o.ok.ok) || order.find((o) => o.ok.reason === 'need_fish') || order[0]; S.pick = f.d.id; }
    if (S.sel < 0) return;
    const key = p === S.prevKey.p && S.pick === S.prevKey.b && S.sel === S.prevKey.i;
    if (!key) { S.prev = previewBuild(p, S.sel, S.pick); S.prevKey = { p, b: S.pick, i: S.sel }; }
    const prev = S.prev, def = BUILDING_BY_ID[S.pick], chk = canBuild(p, S.pick, S.sel);
    // strip of buildings
    const tw = 82, th = 100, gap = 6;
    const listR = { x: inner.x - 2, y: inner.y + 2, w: inner.w + 4, h: th };
    ui.scroll('bs:list', listR, order.length * (tw + gap), (cc) => {
      for (let k = 0; k < order.length; k++) {
        const o = order[k], x = k * (tw + gap), on = o.d.id === S.pick;
        const st = ui.region('bld:' + o.d.id, { x, y: 0, w: tw, h: th }, { focus: true, label: o.d.name });
        const locked = !o.ok.ok && o.ok.reason === 'locked', blocked = !o.ok.ok;
        cc.save(); cc.translate(x, 0);
        if (on) glow(cc, tw / 2, th / 2, tw, PAL.cyan, 0.3);
        chamfer(cc, 0, 0, tw, th, 6); cc.lineJoin = 'round'; cc.lineWidth = 5; cc.strokeStyle = PAL.ink; cc.stroke();
        cc.fillStyle = vgrad(cc, 'bsl', th, on ? PAL.ink3 : PAL.ink2, PAL.ink); cc.fill();
        cc.lineWidth = on ? 2.5 : 1.5; cc.strokeStyle = on ? PAL.cyan : st.hover ? PAL.violetHi : PAL.violet; cc.stroke();
        cc.globalAlpha = locked ? 0.35 : blocked ? 0.65 : 1;
        ICONS.drawBuilding(cc, o.d.id, 1, tw / 2, 36, 56, t);
        cc.globalAlpha = 1;
        drawText(cc, o.d.name, tw / 2, 70, { size: 11, kind: 'display', align: 'center', color: PAL.bone, maxWidth: tw - 8, stroke: 3 });
        if (locked) drawText(cc, 'Stage ' + o.d.unlockStage, tw / 2, 90, { size: 12, kind: 'body', weight: 800, align: 'center', color: PAL.slate, stroke: 3 });
        else if (o.ok.reason === 'limit') drawText(cc, 'MAX BUILT', tw / 2, 90, { size: 12, kind: 'body', weight: 800, align: 'center', color: PAL.slate, stroke: 3 });
        else drawText(cc, num(o.ok.cost.fish, 0) + (o.ok.cost.gems ? ' +' + o.ok.cost.gems + 'g' : ''), tw / 2, 90, { size: 13, kind: 'body', weight: 800, align: 'center', color: o.ok.ok ? PAL.bone : PAL.magenta, maxWidth: tw - 6, stroke: 3 });
        cc.restore();
        if (st.tap) { S.pick = o.d.id; S.prevKey = ''; }
      }
    }, { axis: 'x' });
    // detail body
    const bodyR = { x: inner.x, y: listR.y + th + 8, w: inner.w, h: inner.h - th - 8 - 60 };
    ui.scroll('bs:body', bodyR, S.bodyH, (cc, w) => { S.bodyH = Math.max(120, buildBody(cc, ui, def, prev, w) + 10); });
    // build button
    const by = inner.y + inner.h - 52;
    let label = 'BUILD', sub = num(chk.cost.fish, 0) + ' fish' + (chk.cost.gems ? ' + ' + chk.cost.gems + ' gems' : '');
    if (!chk.ok && chk.reason === 'locked') { label = 'LOCKED'; sub = 'unlocks at stage ' + chk.needStage; }
    else if (!chk.ok && chk.reason === 'limit') { label = 'AT LIMIT'; sub = 'max ' + def.limit + ' allowed'; }
    if (ui.button('bs:build', { x: inner.x, y: by, w: inner.w, h: 50 }, label, { kind: chk.ok ? 'positive' : 'secondary', sub, disabled: !chk.ok, pulse: chk.ok, size: 20 })) doBuild();
    else if (!chk.ok && ui.tapId === 'bs:build') ui.toast(reasonText(chk.reason, def), 'warn');
  }

  // Draws the build details in local coordinates, returns height.
  function buildBody(cc, ui, def, prev, w) {
    let y = 2;
    const text = (str, o) => {
      const fs = (o && o.size) || 13;
      const lines = ui.wrap(str, w - 4 - ((o && o.indent) || 0), { size: fs, kind: 'body', weight: (o && o.weight) || 600 });
      for (const l of lines) { y += fs + 5; drawText(cc, l, 2 + ((o && o.indent) || 0), y, { size: fs, kind: 'body', weight: (o && o.weight) || 600, color: (o && o.color) || PAL.boneDim, stroke: 3 }); }
    };
    y += 18; drawText(cc, def.name, 2, y, { size: 20, kind: 'display', color: PAL.bone, stroke: 4 });
    drawText(cc, def.tags.join(' / '), w - 2, y, { size: 12, kind: 'body', weight: 700, align: 'right', color: PAL.violetHi, stroke: 3 });
    text(def.blurb, { color: PAL.bone });
    // output at this spot
    y += 8;
    for (const e of def.effects) {
      const v = prev.self.stats[e.stat];
      y += 18;
      drawText(cc, STAT_LABEL[e.stat] || e.stat, 2, y, { size: 13, kind: 'body', weight: 700, color: PAL.boneDim, stroke: 3 });
      drawText(cc, statText(e.stat, v), w - 2, y, { size: 14, kind: 'mono', weight: 800, align: 'right', color: PAL.bone, stroke: 3 });
    }
    y += 6;
    y += 18;
    const pot = prev.self.potency;
    drawText(cc, 'Neighbour power at this spot', 2, y, { size: 13, kind: 'body', weight: 700, color: PAL.boneDim, stroke: 3 });
    drawText(cc, 'x' + pot.toFixed(2), w - 2, y, { size: 14, kind: 'mono', weight: 800, align: 'right', color: pot > 1.001 ? PAL.lime : pot < 0.999 ? PAL.magenta : PAL.bone, stroke: 3 });
    for (const part of prev.self.parts) { y += 17; drawText(cc, part.name + (part.count > 1 ? ' x' + part.count : ''), 12, y, { size: 12, kind: 'body', weight: 700, color: part.value >= 0 ? PAL.lime : PAL.magenta, maxWidth: w - 90, stroke: 3 }); drawText(cc, signedPct(part.value), w - 2, y, { size: 12, kind: 'mono', weight: 800, align: 'right', color: part.value >= 0 ? PAL.lime : PAL.magenta, stroke: 3 }); }
    if (!prev.self.parts.length) text('No neighbours help here yet.', { size: 12 });
    // what it does to the neighbours
    if (prev.others.length) {
      y += 10; y += 16; drawText(cc, 'Changes next door', 2, y, { size: 14, kind: 'display', color: PAL.cyan, stroke: 3 });
      for (const o of prev.others) {
        y += 17;
        drawText(cc, o.name + ' Lv' + o.level, 12, y, { size: 12, kind: 'body', weight: 700, color: PAL.bone, maxWidth: w - 120, stroke: 3 });
        const rate = o.cur ? ' (' + (o.rateAfter - o.rateBefore >= 0 ? '+' : '') + num(o.rateAfter - o.rateBefore, 2) + ' ' + o.cur + '/s)' : '';
        drawText(cc, (o.delta >= 0 ? '+' : '') + Math.round(o.delta * 100) + '%' + rate, w - 2, y, { size: 12, kind: 'mono', weight: 800, align: 'right', color: o.delta >= 0 ? PAL.lime : PAL.magenta, maxWidth: 140, stroke: 3 });
      }
    }
    // likes and dislikes (all rules of this building)
    y += 10; y += 16; drawText(cc, 'Likes and dislikes', 2, y, { size: 14, kind: 'display', color: PAL.violetHi, stroke: 3 });
    for (const r of def.receives) {
      y += 17;
      const col = r.add >= 0 ? PAL.boneDim : PAL.magenta;
      drawText(cc, srcName(r.src) + (r.mode === 'row' ? ' in the row' : r.mode === 'col' ? ' in the column' : ' beside'), 12, y, { size: 12, kind: 'body', weight: 600, color: col, maxWidth: w - 70, stroke: 3 });
      drawText(cc, (r.add >= 0 ? '+' : '') + pctText(r.add) + ' each', w - 2, y, { size: 12, kind: 'mono', weight: 800, align: 'right', color: r.add >= 0 ? PAL.lime : PAL.magenta, stroke: 3 });
    }
    // Catnip Garden options
    if (def.choices) {
      y += 12; y += 16; drawText(cc, 'Pick a district and strain', 2, y, { size: 14, kind: 'display', color: PAL.lime, stroke: 3 });
      y = optionPickers(cc, ui, y + 6, w, 'b');
    }
    return y + 10;
  }

  // district and strain buttons (inside a scroll or not), returns the new y
  function optionPickers(cc, ui, y, w, pre) {
    const dw = (w - 4 - 8) / 3, dh = 38;
    DISTRICT_CHOICES.forEach((id, i) => {
      const x = 2 + (i % 3) * (dw + 4), yy = y + Math.floor(i / 3) * (dh + 4);
      const nm = (DISTRICT_BY_ID[id] && DISTRICT_BY_ID[id].name) || id;
      if (ui.button(pre + ':d:' + id, { x, y: yy, w: dw, h: dh }, nm, { kind: 'secondary', toggled: S.optDistrict === id, size: 12, noSound: false })) { S.optDistrict = id; if (pre === 'o') applyOpt(); }
    });
    y += 2 * (dh + 4) + 4;
    const sw = (w - 4 - 8) / 3;
    ['dmg', 'rate', 'hp'].forEach((id, i) => {
      const lab = id === 'dmg' ? 'DAMAGE' : id === 'rate' ? 'ATTACK SPEED' : 'HEALTH';
      if (ui.button(pre + ':s:' + id, { x: 2 + i * (sw + 4), y, w: sw, h: 38 }, lab, { kind: 'info', toggled: S.optStrain === id, size: 12 })) { S.optStrain = id; if (pre === 'o') applyOpt(); }
    });
    return y + 42;
  }
  function applyOpt() {
    if (S.sel < 0) return;
    const r = setOpt(S.app.profile, S.sel, { district: S.optDistrict, strain: S.optStrain });
    if (r.ok) { commit(r); S.ui.toast('Garden set', 'ok'); } else S.ui.toast('Cannot set garden', 'warn');
  }

  function drawDetailSheet(ctx, ui, p, inner, r) {
    const pl = plotsOf(p), pp = pl[S.sel];
    if (!pp || !pp.b) { closeSheet(); return; }
    const def = BUILDING_BY_ID[pp.b], inf = S.infos[S.sel] && !S.infos[S.sel].empty ? S.infos[S.sel] : plotInfo(p, S.sel, now());
    const t = ui.t;
    // header: icon, name, level
    ICONS.drawBuilding(ctx, pp.b, pp.level, inner.x + 30, inner.y + 30, 62, t);
    drawText(ctx, inf.tierName || def.name, inner.x + 68, inner.y + 20, { size: 19, kind: 'display', color: PAL.bone, maxWidth: inner.w - 130, stroke: 4 });
    const tr = tierOf(pp.level);
    drawText(ctx, 'LEVEL ' + pp.level + '   TIER ' + tr, inner.x + 68, inner.y + 40, { size: 13, kind: 'body', weight: 800, color: PAL.cyan, stroke: 3 });
    const tabs = [{ id: 'info', label: 'INFO' }, { id: 'levels', label: 'LEVELS' }];
    if (def.choices) tabs.push({ id: 'opts', label: 'GARDEN' });
    if (!tabs.some((x) => x.id === S.tab)) S.tab = 'info';
    S.tab = ui.tabs('ds:tabs', { x: inner.x, y: inner.y + 52, w: inner.w, h: 34 }, tabs, S.tab);
    const bodyR = { x: inner.x, y: inner.y + 92, w: inner.w, h: inner.h - 92 - 62 };
    ui.scroll('ds:body:' + S.tab, bodyR, S.bodyH, (cc, w) => {
      let h;
      if (S.tab === 'info') h = infoBody(cc, ui, def, inf, pp, w);
      else if (S.tab === 'levels') h = levelsBody(cc, ui, def, pp, w);
      else h = optsBody(cc, ui, def, w);
      S.bodyH = Math.max(80, h + 10);
    });
    // footer: upgrade and move
    const by = inner.y + inner.h - 54, bh = 50;
    const ui2 = upgradeInfo(p, S.sel), maxed = ui2.maxed;
    const fish = (p.cur && p.cur.fish) || 0;
    const afford = !maxed && fish >= ui2.fish;
    const w1 = (inner.w - 8 * 2) * 0.5, w2 = (inner.w - 8 * 2) * 0.22, w3 = inner.w - 16 - w1 - w2;
    if (ui.button('ds:up', { x: inner.x, y: by, w: w1, h: bh }, maxed ? 'MAXED' : 'UPGRADE', { kind: 'primary', sub: maxed ? '' : 'Lv ' + pp.level + ' to ' + (pp.level + 1) + '  ' + num(ui2.fish, 0), disabled: !afford, pulse: afford, size: 18 })) doUpgrade(1);
    else if (!afford && !maxed && ui.tapId === 'ds:up') ui.toast('Need ' + num(ui2.fish - fish, 0) + ' more fish', 'warn');
    if (ui.button('ds:x10', { x: inner.x + w1 + 8, y: by, w: w2, h: bh }, 'x10', { kind: 'info', disabled: !afford, size: 18 })) doUpgrade(10);
    if (ui.button('ds:move', { x: inner.x + w1 + w2 + 16, y: by, w: w3, h: bh }, 'MOVE', { kind: 'secondary', size: 16 })) { S.moveFrom = S.sel; S.moveTo = -1; S.sheet = null; S.sel = -1; }
  }

  function infoBody(cc, ui, def, inf, pp, w) {
    let y = 0;
    const row = (label, val, col) => { y += 20; drawText(cc, label, 2, y, { size: 13, kind: 'body', weight: 700, color: PAL.boneDim, stroke: 3 }); drawText(cc, val, w - 2, y, { size: 14, kind: 'mono', weight: 800, align: 'right', color: col || PAL.bone, maxWidth: w * 0.62, stroke: 3 }); };
    const text = (str, o) => { const fs = (o && o.size) || 13; for (const l of ui.wrap(str, w - 4, { size: fs, kind: 'body', weight: 600 })) { y += fs + 5; drawText(cc, l, 2, y, { size: fs, kind: 'body', weight: 600, color: (o && o.color) || PAL.boneDim, stroke: 3 }); } };
    text(def.blurb, { color: PAL.bone });
    y += 6;
    if (inf.cur) {
      const sec = inf.capSeconds || 0, fill = fin(inf.fill);
      y += 6;
      const bar = { x: 2, y: y + 4, w: w - 4, h: 14 };
      ui.bar(bar, fill, { kind: fill >= 0.9 ? 'progress' : 'energy', label: Math.round(fill * 100) + '% full' });
      y += 24;
      row('Waiting', num(inf.pending, 1) + ' ' + inf.cur + (fill >= 0.9 ? '  (full bowl +' + Math.round(CHECKIN.fillBonus * 100) + '%)' : ''), fill >= 0.9 ? PAL.lime : PAL.bone);
      row('Output', num(inf.rate, 2) + ' ' + inf.cur + '/s  =  ' + num(inf.rate * 3600, 0) + '/h');
      row('Storage', formatTime(sec) + ' of work' + (fill < 1 ? ', full in ' + formatTime(sec * (1 - fill)) : ', FULL'), fill >= 1 ? PAL.lime : PAL.bone);
    }
    y += 8; y += 16; drawText(cc, 'THIS LEVEL TO NEXT', 2, y, { size: 14, kind: 'display', color: PAL.cyan, stroke: 3 });
    const adj = adjacency(plotsOf(S.app.profile), S.sel);
    const nowS = statsAt(def, pp.level, adj.potency), nextS = statsAt(def, pp.level + 1, adj.potency);
    for (const e of def.effects) row(STAT_LABEL[e.stat] || e.stat, statText(e.stat, nowS[e.stat]) + '  >  ' + statText(e.stat, nextS[e.stat]), PAL.bone);
    y += 8; y += 16; drawText(cc, 'NEIGHBOURS', 2, y, { size: 14, kind: 'display', color: PAL.lime, stroke: 3 });
    row('Power', 'x' + adj.potency.toFixed(2), adj.potency > 1.001 ? PAL.lime : adj.potency < 0.999 ? PAL.magenta : PAL.bone);
    for (const part of adj.parts) { y += 17; drawText(cc, part.name + (part.count > 1 ? ' x' + part.count : ''), 12, y, { size: 12, kind: 'body', weight: 700, color: part.value >= 0 ? PAL.lime : PAL.magenta, maxWidth: w - 90, stroke: 3 }); drawText(cc, signedPct(part.value), w - 2, y, { size: 12, kind: 'mono', weight: 800, align: 'right', color: part.value >= 0 ? PAL.lime : PAL.magenta, stroke: 3 }); }
    if (!adj.parts.length) text('Nothing beside it helps yet. Try a swap with MOVE.', { size: 12 });
    y += 8;
    for (const rr of def.receives) {
      const got = adj.parts.some((pt) => pt.name === rr.name);
      if (got) continue;
      y += 16; drawText(cc, 'Could use: ' + srcName(rr.src) + (rr.add < 0 ? ' (avoid)' : ''), 12, y, { size: 12, kind: 'body', weight: 600, color: rr.add < 0 ? rgba(PAL.magenta, 0.8) : PAL.boneDim, maxWidth: w - 70, stroke: 3 });
      drawText(cc, (rr.add >= 0 ? '+' : '') + pctText(rr.add), w - 2, y, { size: 12, kind: 'mono', weight: 800, align: 'right', color: rr.add >= 0 ? PAL.lime : PAL.magenta, stroke: 3 });
    }
    return y + 6;
  }

  function levelsBody(cc, ui, def, pp, w) {
    let y = 0;
    const stats = def.effects.slice(0, 2);
    y += 18;
    drawText(cc, 'LV', 6, y, { size: 12, kind: 'body', weight: 800, color: PAL.boneDim, stroke: 3 });
    stats.forEach((e, i) => drawText(cc, STAT_LABEL[e.stat] || e.stat, 44 + i * ((w - 150) / 2), y, { size: 11, kind: 'body', weight: 800, color: PAL.boneDim, maxWidth: (w - 150) / 2 - 4, stroke: 3 }));
    drawText(cc, 'COST TO NEXT', w - 4, y, { size: 11, kind: 'body', weight: 800, align: 'right', color: PAL.boneDim, stroke: 3 });
    let curRow = 0;
    for (let i = 0; i < TABLE_LEVELS.length; i++) if (TABLE_LEVELS[i] <= pp.level) curRow = i;
    for (let i = 0; i < def.table.length; i++) {
      const row = def.table[i];
      y += 28;
      const on = i === curRow, passed = row.level <= pp.level;
      if (on) { cc.fillStyle = rgba(PAL.cyan, 0.16); cc.fillRect(0, y - 20, w, 26); cc.fillStyle = PAL.cyan; cc.fillRect(0, y - 20, 3, 26); }
      drawText(cc, String(row.level), 6, y - 2, { size: 14, kind: 'mono', weight: 800, color: passed ? PAL.bone : PAL.boneDim, stroke: 3 });
      stats.forEach((e, k) => drawText(cc, statText(e.stat, row.stats[e.stat]), 44 + k * ((w - 150) / 2), y - 2, { size: 12, kind: 'mono', weight: 700, color: passed ? PAL.bone : PAL.boneDim, maxWidth: (w - 150) / 2 - 4, stroke: 3 }));
      drawText(cc, num(upgradeCost(def, row.level, cost), 0), w - 4, y - 2, { size: 12, kind: 'mono', weight: 700, align: 'right', color: PAL.boneDim, stroke: 3 });
    }
    y += 18;
    for (const l of ui.wrap('Base values before neighbour bonuses. Every 20 levels is a new tier with a new look; every 25 levels production gets a milestone boost.', w - 4, { size: 12, kind: 'body', weight: 600 })) { y += 17; drawText(cc, l, 2, y, { size: 12, kind: 'body', weight: 600, color: PAL.boneDim, stroke: 3 }); }
    return y + 4;
  }

  function optsBody(cc, ui, def, w) {
    let y = 0;
    y += 16; drawText(cc, 'Cats fighting in the chosen district get the buzz (a third of it elsewhere).', 2, y, { size: 12, kind: 'body', weight: 600, color: PAL.boneDim, maxWidth: w - 4, stroke: 3 });
    const gb = townStats(S.app.profile);
    y += 14; drawText(cc, 'Total buff now: ' + pctText(gb.buffPct || 0), 2, y + 8, { size: 13, kind: 'body', weight: 800, color: PAL.lime, stroke: 3 });
    y = optionPickers(cc, ui, y + 22, w, 'o');
    return y;
  }

  // ---------------------------------------------------------------------------------------------- welcome back
  function drawWelcome(ctx, ui) {
    const wb = S.welcome, c = ui.content;
    ui.pushLayer();
    ctx.save(); ctx.fillStyle = rgba(PAL.void, 0.8); ctx.fillRect(0, 0, ui.w, ui.h); ctx.restore();
    ui.region('wb:block', { x: 0, y: 0, w: ui.w, h: ui.h }, null);
    const w = Math.min(c.w - 28, 380), h = 330, x = ui.w / 2 - w / 2, y = Math.max(ui.safe.top + 40, ui.h / 2 - h / 2 - 20);
    const k = reduced() ? 1 : outBack(clamp(S.welcomeT / 0.35, 0, 1));
    ctx.save(); ctx.translate(ui.w / 2, y + h / 2); ctx.scale(0.88 + 0.12 * k, 0.88 + 0.12 * k); ctx.translate(-ui.w / 2, -(y + h / 2));
    glow(ctx, ui.w / 2, y + h / 2, w * 0.8, PAL.violetHi, 0.25);
    const inner = ui.panel({ x, y, w, h }, { title: 'WELCOME BACK', color: PAL.cyan, glow: true });
    // sleeping cat
    sleepCat(ctx, x + w / 2, y + 62, 56, ui.t);
    drawText(ctx, 'Your cats kept the rooftop going for', x + w / 2, y + 112, { size: 14, kind: 'body', weight: 700, align: 'center', color: PAL.boneDim, stroke: 3, maxWidth: w - 24 });
    drawText(ctx, formatTime(wb.seconds), x + w / 2, y + 142, { size: 30, kind: 'display', align: 'center', gradient: [PAL.bone, PAL.cyan], glow: 8, glowColor: PAL.cyan });
    const rows = [['fish', wb.fish], ['yarn', wb.yarn]];
    rows.forEach(([cur, val], i) => {
      const ry = y + 158 + i * 44;
      chamfer(ctx, x + 24, ry, w - 48, 38, 6); ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.stroke(); ctx.fillStyle = PAL.ink; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(CUR_COL[cur], 0.7); ctx.stroke();
      ICONS.drawCurrency(ctx, cur, x + 48, ry + 19, 28, ui.t);
      const shown = ui.ticker('wb:' + cur, val, { from: 0, rate: 2.4, min: Math.max(1, val / 60) });
      drawText(ctx, '+' + num(shown, 0), x + w - 36, ry + 26, { size: 22, kind: 'display', align: 'right', color: CUR_COL[cur], stroke: 4 });
    });
    const eff = fin(wb.efficiency);
    const note = (eff > 0 ? 'Napping pays ' + Math.round(eff * 100) + '% of active income.' : '') + (wb.capped ? ' Capped at ' + formatTime(wb.capSeconds) + ': a Nap Dome stretches it.' : '');
    const lines = ui.wrap(note, w - 48, { size: 12, kind: 'body', weight: 600 });
    lines.slice(0, 2).forEach((l, i) => drawText(ctx, l, x + w / 2, y + 252 + i * 15, { size: 12, kind: 'body', weight: 600, align: 'center', color: PAL.boneDim, stroke: 3 }));
    if (ui.button('wb:ok', { x: x + 24, y: y + h - 58, w: w - 48, h: 48 }, 'COLLECT', { kind: 'positive', size: 20, pulse: true }) || ui.keyHit('enter')) {
      ui.eatKey('enter');
      S.welcomeClaimed = true;
      const from = { x: ui.w / 2, y: y + 190 };
      // the amounts are already in the profile; the strip was waiting, so release it as icons land
      S.hold.fish = Math.max(0, S.hold.fish - wb.fish); S.hold.yarn = Math.max(0, S.hold.yarn - wb.yarn);
      spawnFly('fish', from.x, from.y, wb.fish, 6);
      spawnFly('yarn', from.x, from.y + 30, wb.yarn, 6);
      sfx('reward_key');
    }
    ctx.restore();
    ui.popLayer();
  }

  function sleepCat(ctx, x, y, s, t) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 56, s / 56);
    glow(ctx, 0, 6, 46, PAL.violetHi, 0.3);
    ctx.fillStyle = PAL.ink2; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.ellipse(0, 8, 26, 14, 0, 0, TAU); ctx.stroke(); ctx.fill();
    ctx.beginPath(); ctx.arc(-14, 0, 11, 0, TAU); ctx.stroke(); ctx.fill();
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-14 + sx * 9, -5); ctx.quadraticCurveTo(-14 + sx * 13, -16, -14 + sx * 5, -12); ctx.closePath(); ctx.stroke(); ctx.fill(); }
    ctx.strokeStyle = PAL.cyan; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-18, 0, 3, 0.2, Math.PI - 0.2); ctx.arc(-10, 0, 3, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.5 + i / 3) % 1;
      ctx.save(); ctx.globalAlpha = (1 - ph) * 0.9;
      drawText(ctx, 'z', x + 14 + ph * 22, y - 12 - ph * 30, { size: 12 + i * 4, kind: 'display', color: PAL.cyan, stroke: 3 });
      ctx.restore();
    }
  }

  return screen;
}

export const townScreen = createTownScreen();
export default townScreen;

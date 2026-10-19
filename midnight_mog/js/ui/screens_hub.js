// Midnight Mog hub: the screen you land on, the persistent bottom navigation bar, the "next best thing to do" engine and the
// More menu. Owner: integrator (main.js). Screen ids: 'hub' and 'more'.
//
// Pure helpers (headless testable): suggestions(profile, nowMs, day), navBadges(profile, nowMs, day), activeTabOf(screenId).
// Drawing: drawNav(ctx, ui, app, active, badges) paints the bar inside the bottom NAV_H pixels and returns the tapped tab id or ''.
//
// App needs: profile, router.go, now(), dayIndex(), nav(tabId) (optional, falls back to router.go).
import { PAL, rgba, glow, mix } from '../palette.js';
import { drawText, formatNum, wrapText } from '../render/text.js';
import * as ICONS from '../render/icons.js';
import * as CATART from '../render/catart.js';
import * as ENEMYART from '../render/enemyart.js';
import * as WORLD from '../render/world.js';
import { chamfer, clamp, fin, vgrad } from './shell.js';
import { pageHeader, catLevelCost, catBudget } from './screens_deck.js';
import { claimableCounts } from './screens_meta.js';
import { readyTotals } from './screens_town.js';
import { plotInfo, upgradeInfo } from '../sim/town.js';
import { stageInfo, stageMode, stageRewards, toGlobal, isEchoStage } from '../sim/progression.js';
import { canNineLives } from '../sim/economy.js';
import { CRATES } from '../sim/loot.js';
import { crateCost } from '../sim/economy.js';
import { CAT_BY_ID } from '../data/cats.js';
import { CARD_BY_ID } from '../data/cards.js';
import { BUILDING_BY_ID } from '../data/buildings.js';
import { ENEMY_BY_ID } from '../data/enemies.js';

export const NAV_H = 64;
export const NAV_TABS = [
  { id: 'battle', label: 'BATTLE', screen: 'hub' },
  { id: 'deck', label: 'DECK', screen: 'deck' },
  { id: 'town', label: 'TOWN', screen: 'town' },
  { id: 'crates', label: 'CRATES', screen: 'crates' },
  { id: 'more', label: 'MORE', screen: 'more' },
];
const TAB_OF = { hub: 'battle', deck: 'deck', roster: 'deck', relics: 'deck', town: 'town', crates: 'crates' };
/** Which nav tab lights up for a screen id. */
export function activeTabOf(screenId) { return TAB_OF[screenId] || 'more'; }

const sumKeys = (p) => Object.values((p.town && p.town.keys) || {}).reduce((s, v) => s + (v | 0), 0);
const fmt = (n) => formatNum(Math.max(0, Math.floor(fin(n))));

// ------------------------------------------------------------------------------------------------ town and upgrade queries
function townInfos(p, nowMs) {
  const out = [];
  const plots = (p.town && p.town.plots) || [];
  for (let i = 0; i < plots.length; i++) if (plots[i] && plots[i].b) out.push(plotInfo(p, i, nowMs));
  return out;
}
/** Cheapest affordable building upgrade: {index, b, name, level, fish} or null. */
function bestBuildingUpgrade(p) {
  const plots = (p.town && p.town.plots) || [];
  let best = null;
  for (let i = 0; i < plots.length; i++) {
    if (!plots[i] || !plots[i].b) continue;
    const u = upgradeInfo(p, i);
    if (u.maxed || !(u.fish <= p.cur.fish)) continue;
    if (!best || u.fish < best.fish) best = { index: i, b: plots[i].b, name: (BUILDING_BY_ID[plots[i].b] || {}).name || plots[i].b, level: plots[i].level, fish: u.fish };
  }
  return best;
}
/** Cheapest affordable cat level up among owned cats: {id, name, level, yarn} or null. */
function bestCatUpgrade(p) {
  let best = null;
  const budget = catBudget(p);
  for (const id of Object.keys(p.cats || {})) {
    const c = CAT_BY_ID[id];
    if (!c) continue;
    const pr = catLevelCost(p, id);
    if (!Number.isFinite(pr) || pr > budget) continue;
    if (!best || pr < best.yarn) best = { id, name: c.name, level: p.cats[id].level, yarn: pr };
  }
  return best;
}
/** Best crate the player can pay for with fish or yarn right now: {id, name, cur, price} or null. */
function bestAffordableCrate(p) {
  const opens = (p.stats && p.stats.crateOpens) | 0;
  let best = null;
  for (const def of CRATES) {
    const c = crateCost(def.id, opens);
    if (c.cur === 'gems' || !((p.cur[c.cur] || 0) >= c.price)) continue;
    if (!best || c.price > best.price) best = { id: def.id, name: def.name, cur: c.cur, price: c.price };
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ the suggestion engine
/**
 * Ranked list of things worth doing, best first. Always ends with a battle suggestion, so the list is never empty.
 * Each item: {id, kind, score, title, text, cta, go:{screen, params}, color}.
 */
export function suggestions(p, nowMs, day) {
  const out = [];
  const cl = claimableCounts(p, day);
  if (cl.total > 0) out.push({ id: 'claim', kind: 'claim', score: 100, title: 'Claim ' + cl.total + (cl.total === 1 ? ' reward' : ' rewards'), text: 'Finished quests are waiting for you.', cta: 'CLAIM', go: { screen: 'quests', params: {} }, color: PAL.lime });
  const keys = (p.town && p.town.keys) || {};
  const keyCrate = Object.keys(keys).find((k) => (keys[k] | 0) > 0);
  if (keyCrate) {
    const n = sumKeys(p);
    out.push({ id: 'key', kind: 'key', score: 90, title: 'Free crate key', text: n + (n === 1 ? ' key' : ' keys') + ' ready. Free loot.', cta: 'OPEN', go: { screen: 'crates', params: { crate: keyCrate } }, color: PAL.cyan });
  }
  const t = readyTotals(townInfos(p, nowMs));
  const waiting = t.fish + t.yarn + t.xp + t.gems;
  const streak = (p.town && p.town.streak) || { days: 0, last: -1 };
  const streakAtRisk = streak.days > 0 && streak.last < day;
  if (t.fullest >= 0.2 && waiting >= 1) {
    const bits = [];
    if (t.fish >= 1) bits.push(fmt(t.fish) + ' fish');
    if (t.yarn >= 1) bits.push(fmt(t.yarn) + ' yarn');
    if (!bits.length) bits.push('a stash');
    out.push({
      id: 'collect', kind: 'collect', score: t.fullest >= 0.9 ? 88 : 62, title: t.fullest >= 0.9 ? 'Buildings are full' : 'Collect your town',
      text: bits.join(' and ') + ' waiting' + (streakAtRisk ? '. Keep your ' + streak.days + ' day streak alive.' : '.'), cta: 'COLLECT', go: { screen: 'town', params: {} }, color: PAL.lime,
    });
  } else if (streakAtRisk) {
    out.push({ id: 'streak', kind: 'collect', score: 58, title: 'Keep your streak', text: 'Collect once today to hold your ' + streak.days + ' day streak.', cta: 'TOWN', go: { screen: 'town', params: {} }, color: PAL.lime });
  }
  const cat = bestCatUpgrade(p);
  if (cat) out.push({ id: 'cat', kind: 'upgrade', score: 70, title: 'Level up ' + cat.name, text: 'Lv ' + cat.level + ' to ' + (cat.level + 1) + ' for ' + fmt(cat.yarn) + ' yarn.', cta: 'UPGRADE', go: { screen: 'roster', params: { cat: cat.id } }, color: PAL.magenta });
  const bld = bestBuildingUpgrade(p);
  if (bld) out.push({ id: 'building', kind: 'upgrade', score: 66, title: 'Upgrade ' + bld.name, text: 'Lv ' + bld.level + ' to ' + (bld.level + 1) + ' for ' + fmt(bld.fish) + ' fish.', cta: 'UPGRADE', go: { screen: 'town', params: {} }, color: PAL.cyan });
  const cr = bestAffordableCrate(p);
  if (cr && !keyCrate) out.push({ id: 'crate', kind: 'crate', score: 55, title: 'Open ' + cr.name, text: fmt(cr.price) + ' ' + cr.cur + ' buys a fresh roll of cats and cards.', cta: 'OPEN', go: { screen: 'crates', params: { crate: cr.id } }, color: PAL.cyan });
  if (canNineLives(p)) out.push({ id: 'nine', kind: 'meta', score: 40, title: 'Nine Lives is ready', text: 'Reset for shards and a permanent income boost.', cta: 'LOOK', go: { screen: 'nine_lives', params: {} }, color: PAL.magenta });
  const gs = toGlobal(p.progress.district, p.progress.stage);
  out.push({ id: 'battle', kind: 'battle', score: 10, title: 'Win stage ' + gs, text: 'Every win pays fish, yarn and a step up the skyline.', cta: 'PLAY', go: { screen: 'battle', params: { returnTo: 'hub' } }, color: PAL.magenta });
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** Notification counts per nav tab: {battle, deck, town, crates, more}. */
export function navBadges(p, nowMs, day) {
  const b = { battle: 0, deck: 0, town: 0, crates: 0, more: 0 };
  try {
    b.more = claimableCounts(p, day).total;
    const t = readyTotals(townInfos(p, nowMs));
    b.town = t.full > 0 ? t.full : (t.fullest >= 0.5 ? 1 : 0);
    b.crates = sumKeys(p);
    if (!b.crates) { const cr = bestAffordableCrate(p); if (cr) b.crates = 1; }
    b.deck = bestCatUpgrade(p) ? 1 : 0;
  } catch (e) { /* badges are a nicety */ }
  return b;
}

// ------------------------------------------------------------------------------------------------ nav bar
function navIcon(ctx, id, cx, cy, s, on, t) {
  const col = on ? PAL.cyan : PAL.boneDim;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (id === 'battle') {
    // paw print
    const k = s / 28;
    ctx.fillStyle = PAL.ink; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 4;
    const paw = (fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.ellipse(cx, cy + 5 * k, 7.5 * k, 6 * k, 0, 0, Math.PI * 2); ctx.fill();
      for (const [dx, dy, rr] of [[-9, -2, 3.2], [-3.5, -8, 3.4], [3.5, -8, 3.4], [9, -2, 3.2]]) { ctx.beginPath(); ctx.ellipse(cx + dx * k, cy + dy * k, rr * k, rr * 1.25 * k, 0, 0, Math.PI * 2); ctx.fill(); }
    };
    paw(PAL.ink); ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(0, 0); ctx.lineWidth = 3.4; ctx.strokeStyle = PAL.ink;
    ctx.beginPath(); ctx.ellipse(cx, cy + 5 * k, 7.5 * k, 6 * k, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    paw(on ? PAL.magenta : col);
  } else if (id === 'deck') {
    const k = s / 28;
    for (let i = 1; i >= 0; i--) {
      ctx.save(); ctx.translate(cx + (i ? 4 : -4) * k, cy + 1 * k); ctx.rotate((i ? 0.18 : -0.14));
      chamfer(ctx, -7 * k, -10 * k, 14 * k, 20 * k, 2.5 * k);
      ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.fillStyle = i ? (on ? mix(PAL.violet, PAL.cyan, 0.5) : PAL.violet) : PAL.ink3; ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = col; ctx.stroke();
      if (i) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 2.6 * k, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  } else if (id === 'town') {
    try { ICONS.drawBuilding(ctx, 'tuna_cannery', 1, cx, cy + s * 0.34, s * 1.05, t); } catch (e) { /* optional */ }
  } else if (id === 'crates') {
    try { ICONS.drawCrate(ctx, 'alley_crate', cx, cy + 1, s * 0.98, { t, glow: on ? 0.7 : 0.25 }); } catch (e) { /* optional */ }
  } else {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.arc(cx + i * 8 * (s / 28), cy, 3.2 * (s / 28), 0, Math.PI * 2);
      ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.stroke(); ctx.fillStyle = col; ctx.fill();
    }
  }
  ctx.restore();
}

/** Draw the bottom nav bar. base = the real safe-area bottom (the bar sits above it). Returns the tapped tab id, or ''. */
export function drawNav(ctx, ui, app, active, badges, baseBottom) {
  const sb = baseBottom || 0;
  const barY = ui.h - sb - NAV_H;
  const c = ui.col;
  let tapped = '';
  ctx.save();
  // bar background spans the whole width, buttons live in the column
  const g = ctx.createLinearGradient(0, barY, 0, ui.h);
  g.addColorStop(0, rgba(PAL.ink2, 0.97)); g.addColorStop(1, rgba(PAL.void, 1));
  ctx.fillStyle = g; ctx.fillRect(0, barY, ui.w, NAV_H + sb);
  ctx.fillStyle = rgba(PAL.violet, 0.9); ctx.fillRect(0, barY, ui.w, 2);
  ctx.fillStyle = rgba(PAL.cyan, 0.35); ctx.fillRect(0, barY + 2, ui.w, 1);
  ctx.restore();
  const n = NAV_TABS.length, tw = c.w / n;
  for (let i = 0; i < n; i++) {
    const tab = NAV_TABS[i];
    const r = { x: c.x + i * tw, y: barY + 3, w: tw, h: NAV_H - 3 };
    const on = tab.id === active;
    const st = ui.region('nav:' + tab.id, r, { focus: true, label: tab.label });
    const cx = r.x + r.w / 2;
    if (on) {
      ctx.save();
      glow(ctx, cx, r.y + 26, 34, PAL.cyan, 0.22);
      ctx.fillStyle = PAL.cyan; ctx.fillRect(cx - tw * 0.3, r.y - 1, tw * 0.6, 3);
      ctx.restore();
    } else if (st.hover || st.down) {
      ctx.fillStyle = rgba(PAL.violetHi, 0.14); ctx.fillRect(r.x + 4, r.y + 2, r.w - 8, r.h - 4);
    }
    const bob = on && !ui.reduceMotion ? Math.sin(ui.t * 3) * 1.2 : 0;
    navIcon(ctx, tab.id, cx, r.y + 24 + bob + (st.down ? 2 : 0), 30, on, ui.t);
    drawText(ctx, tab.label, cx, r.y + r.h - 8, { size: 11, kind: 'display', align: 'center', color: on ? PAL.bone : PAL.boneDim, stroke: 3, maxWidth: tw - 6 });
    const b = badges && badges[tab.id];
    if (b > 0) ui.badge(cx + 17, r.y + 12, b > 9 ? '9+' : b, { color: tab.id === 'crates' ? PAL.lime : PAL.magenta });
    if (st.focus) { ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = PAL.cyan; ctx.lineWidth = 2; ctx.strokeRect(r.x + 3, r.y + 1, r.w - 6, r.h - 3); ctx.restore(); }
    if (st.tap) tapped = tab.id;
  }
  return tapped;
}

// ------------------------------------------------------------------------------------------------ hub
const PREVIEW = { gs: -1, ref: null, rewards: null };
function rewardPreview(p, gs) {
  if (PREVIEW.gs === gs && PREVIEW.ref === p.cur && PREVIEW.rewards) return PREVIEW.rewards;
  let r = { fish: 0, yarn: 0, gems: 0 };
  try { r = stageRewards(p, { won: true, gs }).rewards; } catch (e) { /* preview only */ }
  PREVIEW.gs = gs; PREVIEW.ref = p.cur; PREVIEW.rewards = r;
  return r;
}

function deckCats(p) {
  const out = [];
  for (const cid of p.deck || []) {
    const card = CARD_BY_ID[cid];
    if (card && card.effect && card.effect.kind === 'summon' && p.cats && p.cats[card.effect.cat] && !out.includes(card.effect.cat)) out.push(card.effect.cat);
    if (out.length >= 3) break;
  }
  if (!out.length) out.push(...Object.keys(p.cats || {}).slice(0, 3));
  return out;
}

function chip(ctx, x, y, label, color, h = 26) {
  const w = drawTextWidth(ctx, label) + 20;
  ctx.save();
  chamfer(ctx, x, y, w, h, 5); ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.stroke();
  ctx.fillStyle = rgba(PAL.ink2, 0.95); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(color, 0.85); ctx.stroke();
  ctx.restore();
  drawText(ctx, label, x + 10, y + h / 2 + 5, { size: 13, kind: 'body', weight: 800, color: PAL.bone, stroke: 2.5 });
  return w;
}
function drawTextWidth(ctx, s) { ctx.save(); ctx.font = '800 13px Trebuchet MS, sans-serif'; const w = ctx.measureText(s).width; ctx.restore(); return w; }

export function createHubScreen() {
  const S = { t: 0, sug: [], sugAt: -9, enterT: 0, lastFrame: -1 };
  const screen = {
    id: 'hub',
    state: S,
    enter(app) {
      S.t = 0; S.sugAt = -9; S.enterT = 0;
      const a = app.audio;
      if (a && a.music) { try { a.music('town'); } catch (e) { /* optional */ } }
    },
    update(app, dt) { S.t += dt; },
    draw(ctx, app, ui) {
      const p = app.profile, c = ui.content, t = S.t;
      const now = app.now ? app.now() : 0, day = app.dayIndex ? app.dayIndex() : 0;
      const gs = toGlobal(p.progress.district, p.progress.stage);
      const info = stageInfo(null, gs);
      const dId = info.district.id;
      ui.clear(PAL.void);
      ui.background(dId, { dim: 0.3 });
      const X = c.x + 12, W = c.w - 24;
      let y = c.y + 8;
      // ---- title row
      drawText(ctx, 'MIDNIGHT MOG', X + 2, y + 31, { size: 25, kind: 'display', gradient: [PAL.bone, PAL.cyan], glow: 10, glowColor: PAL.cyan, maxWidth: W - 60 });
      if (ui.button('hub:settings', { x: X + W - 44, y, w: 44, h: 44 }, '', { kind: 'icon', icon: 'gear', aria: 'Settings' })) app.router.go('settings');
      y += 48;
      const tapped = ui.currencyStrip({ x: X, y, w: W, h: 28 }, p.cur);
      if (tapped === 'gems' || tapped === 'tokens') app.router.go('crates');
      y += 34;
      // ---- suggestions (refreshed twice a second, cheap enough but no need every frame)
      if (S.sugAt < 0 || t - S.sugAt > 0.5 || S.lastProfile !== p) { S.sug = suggestions(p, now, day); S.sugAt = t; S.lastProfile = p; }
      const sug = S.sug;
      const top = sug.find((s) => s.kind !== 'battle') || sug[0];
      const others = sug.filter((s) => s !== top && s.kind !== 'battle').slice(0, 2);
      const compact = ui.h < 700;
      const B = {
        info, gs, p, t, top, others,
        bigH: top.kind === 'battle' ? 0 : 82,
        smallH: 48,
        nShown: compact ? 0 : others.length,
        playH: 68, chipsH: 34, minPanel: 150, maxPanel: 330,
      };
      B.nextH = B.top.kind === 'battle' ? 0 : 22 + B.bigH + 8 + B.nShown * (B.smallH + 6);
      const view = { x: c.x, y, w: c.w, h: c.y + c.h - 10 - y };
      const fixed = B.playH + 10 + B.chipsH + B.nextH + 10;
      const panelH = clamp(view.h - fixed, B.minPanel, B.maxPanel);
      const total = panelH + fixed;
      if (total <= view.h + 0.5) this.drawBody(ctx, app, ui, B, X, y, W, panelH);
      else {
        // short screens (a phone on its side): the body scrolls under the fixed header
        B.nShown = 0; B.nextH = B.top.kind === 'battle' ? 0 : 22 + B.bigH + 8;
        const tot2 = B.minPanel + B.playH + 10 + B.chipsH + B.nextH + 10;
        ui.scroll('hub:body', view, tot2, (cx, w) => { this.drawBody(cx, app, ui, B, 12, 0, w - 24 + 0, B.minPanel); });
      }
      ui.vignette(0.3);
    },
    drawBody(ctx, app, ui, B, X, y, W, panelH) {
      const { info, gs, p, t, top, others } = B;
      const P = { x: X, y, w: W, h: panelH };
      this.drawPanel(ctx, app, ui, P, info, gs, p, t);
      y += panelH + 10;
      const echo = isEchoStage(p, gs);
      if (ui.button('hub:play', { x: X, y, w: W, h: B.playH }, echo ? 'ECHO CLEAR' : 'PLAY', { kind: 'primary', size: 32, sub: info.endless ? 'Rift ' + (info.round + 1) : 'Stage ' + info.stageInDistrict + ' of 10', pulse: true })) {
        app.router.go('battle', { returnTo: 'hub' });
      }
      y += B.playH + 8;
      const streak = (p.town && p.town.streak) || { days: 0 };
      let cx = X;
      cx += chip(ctx, cx, y, (streak.days > 0 ? streak.days + ' night streak' : 'No streak yet'), streak.days > 0 ? PAL.lime : PAL.violetHi) + 8;
      cx += chip(ctx, cx, y, 'Best stage ' + Math.max(1, (p.progress.maxCleared | 0)), PAL.cyan) + 8;
      if (ui.button('hub:map', { x: X + W - 88, y: y - 6, w: 88, h: 38 }, 'MAP', { kind: 'secondary', size: 15 })) app.router.go('map');
      y += B.chipsH;
      if (top.kind !== 'battle') {
        drawText(ctx, 'NEXT UP', X + 2, y + 15, { size: 13, kind: 'display', color: PAL.cyan, stroke: 3 });
        y += 22;
        this.drawSuggestion(ctx, app, ui, { x: X, y, w: W, h: B.bigH }, top, true, t);
        y += B.bigH + 8;
        for (let i = 0; i < B.nShown; i++) { this.drawSuggestion(ctx, app, ui, { x: X, y, w: W, h: B.smallH }, others[i], false, t); y += B.smallH + 6; }
      }
    },
    drawPanel(ctx, app, ui, P, info, gs, p, t) {
      const d = info.district;
      ctx.save();
      chamfer(ctx, P.x, P.y, P.w, P.h, 10);
      ctx.lineWidth = 6; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.clip();
      ctx.translate(P.x, P.y);
      const paintSky = (c, w, h, tt) => WORLD.drawSkyline(c, w, h, tt, d.id, { baseY: P.h * 0.74, topY: 36, vignette: false });
      try { if (!ui.cachedDraw('hub:sky:' + d.id, 0, 0, P.w, P.h, 0.12, paintSky)) paintSky(ctx, P.w, P.h, t); } catch (e) { ctx.fillStyle = PAL.ink2; ctx.fillRect(0, 0, P.w, P.h); }
      const footY = P.h * 0.74 + 20;
      // cats on the left of the rooftop line, enemies on the right
      const cats = deckCats(p);
      const csz = clamp(P.h * 0.26, 44, 76);
      for (let i = 0; i < cats.length; i++) {
        const cx = 34 + i * csz * 0.72 + (i % 2) * 6, cy = footY + (i % 2) * 7;
        try { CATART.drawCat(ctx, cats[i], cx, cy, csz, { t: t + i * 0.7, anim: 'idle', animT: (t * 0.4 + i * 0.3) % 1, stars: (p.cats[cats[i]] && p.cats[cats[i]].stars) || 1 }); } catch (e) { /* art is optional */ }
      }
      const foes = info.isBoss && info.boss ? [info.boss.id] : d.enemyPool.slice(0, 2).map((e) => e.id);
      for (let i = 0; i < foes.length; i++) {
        const boss = info.isBoss && info.boss && foes[i] === info.boss.id;
        const sz = boss ? csz * 1.55 : csz * 0.95;
        const ex = P.w - 44 - i * csz * 0.85 - (boss ? 18 : 0), ey = footY + 6 - i * 4;
        try { ENEMYART.drawEnemy(ctx, foes[i], ex, ey, sz, { t: t + i, anim: 'walk', animT: (t * 0.5) % 1, seed: i }); } catch (e) { /* optional */ }
      }
      // headline
      const g = ctx.createLinearGradient(0, 0, 0, 72); g.addColorStop(0, rgba(PAL.void, 0.85)); g.addColorStop(1, rgba(PAL.void, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, P.w, 72);
      drawText(ctx, info.label, 14, 30, { size: 24, kind: 'display', color: PAL.bone, glow: 8, glowColor: PAL.magenta, maxWidth: P.w - 28 });
      const sub = info.isBoss && info.boss ? 'BOSS: ' + info.boss.name.split(',')[0] : d.tagline;
      drawText(ctx, sub, 14, 52, { size: 14, kind: 'body', weight: 700, color: info.isBoss ? PAL.magenta : PAL.boneDim, maxWidth: P.w - 28 });
      // reward strip
      const rw = rewardPreview(p, gs);
      const mode = stageMode(p, gs);
      const parts = [];
      if (rw.fish > 0) parts.push(['fish', rw.fish]);
      if (rw.yarn > 0) parts.push(['yarn', rw.yarn]);
      if (rw.gems > 0) parts.push(['gems', rw.gems]);
      let rx = 14;
      const ry = P.h - 20;
      const gradBar = ctx.createLinearGradient(0, P.h - 40, 0, P.h); gradBar.addColorStop(0, rgba(PAL.void, 0)); gradBar.addColorStop(1, rgba(PAL.void, 0.85));
      ctx.fillStyle = gradBar; ctx.fillRect(0, P.h - 40, P.w, 40);
      drawText(ctx, mode.firstClear ? 'FIRST CLEAR' : mode.echo ? 'ECHO' : 'REPLAY', rx, ry + 5, { size: 11, kind: 'display', color: mode.firstClear ? PAL.lime : PAL.boneDim, stroke: 3 });
      rx += 82;
      for (const [cur, amt] of parts) {
        try { ICONS.drawCurrency(ctx, cur, rx + 8, ry, 18, t); } catch (e) { /* optional */ }
        rx += drawText(ctx, '+' + fmt(amt), rx + 20, ry + 5, { size: 14, kind: 'body', weight: 800, color: PAL.bone, stroke: 3 }) + 34;
      }
      ctx.restore();
      ctx.save();
      chamfer(ctx, P.x, P.y, P.w, P.h, 10); ctx.lineWidth = 2; ctx.strokeStyle = rgba(PAL.cyan, 0.6); ctx.stroke();
      ctx.restore();
    },
    drawSuggestion(ctx, app, ui, r, s, big, t) {
      const st = ui.region('sug:' + s.id, r, { focus: true, label: s.title + '. ' + s.text });
      ctx.save();
      chamfer(ctx, r.x, r.y, r.w, r.h, 8);
      ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.fillStyle = vgrad(ctx, 'sug' + (big ? 'b' : 's'), r.h, big ? PAL.ink3 : PAL.ink2, PAL.ink); ctx.fill();
      ctx.lineWidth = big ? 2.5 : 1.5; ctx.strokeStyle = rgba(s.color, st.hover ? 1 : big ? 0.95 : 0.6); ctx.stroke();
      if (big) { const pulse = 0.5 + 0.5 * Math.sin(t * 3); glow(ctx, r.x + 34, r.y + r.h / 2, 44, s.color, 0.16 + 0.12 * pulse); }
      ctx.restore();
      const ix = r.x + (big ? 34 : 26), iy = r.y + r.h / 2;
      this.sugIcon(ctx, s, ix, iy, big ? 40 : 30, t);
      const bw = big ? 104 : 88, bh = big ? 46 : 38;
      const tx = ix + (big ? 32 : 24), tw = r.w - (tx - r.x) - bw - 22;
      drawText(ctx, s.title, tx, r.y + (big ? 28 : 21), { size: big ? 17 : 15, kind: 'display', color: PAL.bone, maxWidth: tw });
      const lines = wrapText(ctx, s.text, tw, { size: big ? 13 : 12, kind: 'body', weight: 600 });
      const maxLines = big ? 2 : 1;
      for (let i = 0; i < Math.min(maxLines, lines.length); i++) drawText(ctx, lines[i], tx, r.y + (big ? 47 : 38) + i * 15, { size: big ? 13 : 12, kind: 'body', weight: 600, color: PAL.boneDim, maxWidth: tw, stroke: 2 });
      const go = ui.button('sug:go:' + s.id, { x: r.x + r.w - bw - 8, y: r.y + (r.h - bh) / 2, w: bw, h: bh }, s.cta, { kind: s.kind === 'upgrade' || s.kind === 'crate' ? 'info' : 'positive', size: big ? 17 : 14, pulse: big });
      if (go || st.tap) app.router.go(s.go.screen, s.go.params);
    },
    sugIcon(ctx, s, x, y, size, t) {
      try {
        if (s.kind === 'key' || s.kind === 'crate') ICONS.drawCrate(ctx, 'alley_crate', x, y + 2, size * 1.05, { t, glow: 0.6 });
        else if (s.kind === 'collect') ICONS.drawBuilding(ctx, 'tuna_cannery', 1, x, y + size * 0.36, size * 1.1, t);
        else if (s.kind === 'upgrade') { ICONS.drawCurrency(ctx, s.id === 'cat' ? 'yarn' : 'fish', x, y, size * 0.9, t); }
        else if (s.kind === 'claim') ICONS.drawCurrency(ctx, 'gems', x, y, size * 0.9, t);
        else navIcon(ctx, 'battle', x, y, size * 0.8, true, t);
      } catch (e) { /* optional */ }
    },
  };
  return screen;
}

// ------------------------------------------------------------------------------------------------ more
const MORE_ITEMS = [
  { id: 'roster', label: 'CATS', sub: 'Roster and stars', screen: 'roster' },
  { id: 'relics', label: 'RELICS', sub: 'Passive charms', screen: 'relics' },
  { id: 'map', label: 'MAP', sub: 'Pick a stage', screen: 'map' },
  { id: 'quests', label: 'QUESTS', sub: 'Daily and weekly', screen: 'quests' },
  { id: 'bestiary', label: 'BESTIARY', sub: 'Know your foes', screen: 'bestiary' },
  { id: 'nine_lives', label: 'NINE LIVES', sub: 'Reset for power', screen: 'nine_lives' },
  { id: 'settings', label: 'SETTINGS', sub: 'Sound, save, text', screen: 'settings' },
];

export function createMoreScreen() {
  const screen = {
    id: 'more',
    enter(app) { const a = app.audio; if (a && a.music) { try { a.music('town'); } catch (e) { /* optional */ } } },
    update() {},
    draw(ctx, app, ui) {
      const p = app.profile, c = ui.content;
      const day = app.dayIndex ? app.dayIndex() : 0;
      const hd = pageHeader(ui, app, 'MORE', { back: false, district: 'laser_lights' });
      const cl = claimableCounts(p, day);
      const cols = 2, gap = 10, X = c.x + 12, W = c.w - 24;
      const bw = (W - gap) / cols, bh = clamp((c.y + c.h - hd.y - 12 - gap * 3) / 4, 64, 92);
      for (let i = 0; i < MORE_ITEMS.length; i++) {
        const it = MORE_ITEMS[i];
        const col = i % cols, row = Math.floor(i / cols);
        const last = i === MORE_ITEMS.length - 1 && MORE_ITEMS.length % 2 === 1;
        const r = { x: X + (last ? 0 : col * (bw + gap)), y: hd.y + row * (bh + gap), w: last ? W : bw, h: bh };
        const badge = it.id === 'quests' && cl.total > 0 ? cl.total : (it.id === 'nine_lives' && canNineLives(p) ? '!' : undefined);
        if (ui.button('more:' + it.id, r, it.label, { kind: it.id === 'settings' ? 'secondary' : 'info', size: 20, sub: it.sub, badge })) app.router.go(it.screen);
      }
      const fy = hd.y + 4 * (bh + gap) + 6;
      if (fy + 20 < c.y + c.h) {
        drawText(ctx, 'Midnight Mog 1.0. Progress saves itself every few seconds.', c.x + c.w / 2, fy + 14, { size: 12, kind: 'body', weight: 600, align: 'center', color: PAL.boneDim, maxWidth: c.w - 24, stroke: 2 });
      }
      ui.vignette(0.3);
    },
  };
  return screen;
}

export const hubScreen = createHubScreen();
export const moreScreen = createMoreScreen();
export const HUB_SCREENS = [hubScreen, moreScreen];

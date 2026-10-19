// Midnight Mog meta screens, part 2: map, quests and achievements, bestiary, settings, Nine Lives.
// Part 1 (deck builder, roster, relics) lives in screens_deck.js, whose kit this file reuses.
//
// Screen ids: 'map' (params {tab:'campaign'|'obs'}), 'quests' (params {tab}), 'bestiary', 'settings', 'nine_lives'.
// Every action calls the sim function, then app.setProfile(next) and app.save(). Numbers go through formatNum.
//
// App conventions this file adds (all optional, guarded):
//   app.settings   {volume, muted, quality:'low'|'medium'|'high', motion:'auto'|'on'|'off', textSize:'normal'|'large'|'huge'}
//                  created on first use; loadSettings()/saveSettings()/applySettings(app, ui) persist and apply it.
//   app.io         {download(name, text), copy(text)->Promise<bool>, paste()->Promise<string>, pickFile()->Promise<string>}
//                  browser implementations are used when absent; tests pass fakes.
// Exported pure helpers: claimEverything, claimableCounts, seenEnemies, markSeen, buyMetaPerk, perkRows, exportCode, parseSaveText,
//                        defaultSettings, loadSettings, saveSettings, applySettings.
import { PAL, ENEMY_COLOR, rgba, mix, glow } from '../palette.js';
import { drawText, formatNum, formatTime, wrapText, setTextScale } from '../render/text.js';
import * as ICONS from '../render/icons.js';
import * as ENEMYART from '../render/enemyart.js';
import { chamfer, clamp, fin, outBack, outCubic, hash01 } from './shell.js';
import { pageHeader, chip, para, starShape, sfx, commit, toast, needMsg, goBack } from './screens_deck.js';
import { DISTRICTS, DISTRICT_BY_ID, ENDLESS } from '../data/districts.js';
import { ENEMIES, ENEMY_BY_ID } from '../data/enemies.js';
import { CRATE_BY_ID } from '../data/crates.js';
import {  } from '../data/cats.js';
import { ACHIEVEMENT_BY_FAMILY, collectionBonuses, collectionPct, bonusReady, NAMED_TIERS } from '../data/quests.js';
import { META, metaCost, metaLevel, nineLivesMult, offlineCapSeconds, offlineEfficiency, startingFish, bestGlobalStage, NINE_LIVES } from '../sim/economy.js';
import { nineLivesPreview, nineLivesReset, stageInfo, stageMode, stageRewards, wavesPerStage, isStageUnlocked, maxCleared, endlessUnlocked, toGlobal } from '../sim/progression.js';
import * as TOWN from '../sim/town.js';
import { newProfile, serialize, tryDeserialize } from '../sim/profile.js';
import { deckSlots } from '../sim/deck.js';

const TAU = Math.PI * 2;

// =================================================================================================== settings

export const SETTINGS_KEY = 'midnight_mog_settings_v1';
export function defaultSettings() { return { volume: 0.7, muted: false, quality: 'high', motion: 'auto', textSize: 'normal' }; }
const TEXT_SCALE = { normal: 1, large: 1.15, huge: 1.3 };

function pickStorage(storage) { try { return storage || (typeof localStorage !== 'undefined' ? localStorage : null); } catch (e) { return null; } }
export function loadSettings(storage) {
  const out = defaultSettings();
  try {
    const st = pickStorage(storage);
    const raw = st && st.getItem(SETTINGS_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (typeof o.volume === 'number' && Number.isFinite(o.volume)) out.volume = clamp(o.volume, 0, 1);
      if (typeof o.muted === 'boolean') out.muted = o.muted;
      if (['low', 'medium', 'high'].includes(o.quality)) out.quality = o.quality;
      if (['auto', 'on', 'off'].includes(o.motion)) out.motion = o.motion;
      if (TEXT_SCALE[o.textSize]) out.textSize = o.textSize;
    }
  } catch (e) { /* defaults */ }
  return out;
}
export function saveSettings(settings, storage) {
  try { const st = pickStorage(storage); if (st) st.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; } catch (e) { return false; }
}
/** Push the settings into audio and the ui. Safe with null audio. */
export function applySettings(app, ui) {
  const s = getSettings(app);
  try {
    if (app.audio) {
      if (app.audio.setVolume) app.audio.setVolume(s.volume);
      if (app.audio.setMuted) app.audio.setMuted(!!s.muted);
    }
  } catch (e) { /* audio is optional */ }
  if (ui) {
    let rm = s.motion === 'on';
    if (s.motion === 'auto') { try { rm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { rm = false; } }
    if (ui.setReduceMotion) ui.setReduceMotion(rm);
    ui.textScale = TEXT_SCALE[s.textSize] || 1;
    setTextScale(1 + (ui.textScale - 1) * 0.65);   // the canvas layouts are tight: 65% of the nominal step (large x1.10, huge x1.20) keeps labels inside their panels
    ui.quality = s.quality;
  }
  return s;
}
export function getSettings(app) { if (!app.settings) app.settings = defaultSettings(); return app.settings; }

// ---- save text

/** Compact code: MOG1. + base64 of the save JSON. */
export function exportCode(profile) {
  const json = serialize(profile);
  let b64;
  if (typeof btoa === 'function') b64 = btoa(unescape(encodeURIComponent(json)));
  else b64 = Buffer.from(json, 'utf8').toString('base64');
  return 'MOG1.' + b64;
}
/** Accepts the export code or the raw JSON. Returns a profile or null. */
export function parseSaveText(text) {
  let s = String(text || '').trim();
  if (!s || s.length > 12e6) return null;      // a save is at most 8 MB of JSON (about 10.7 MB as a code)
  try {
    if (s.indexOf('MOG1.') === 0) {
      const b64 = s.slice(5).replace(/\s+/g, '');
      s = typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString('utf8');
    }
    return tryDeserialize(s);
  } catch (e) { return null; }
}

function browserIO() {
  return {
    download(name, text) {
      if (typeof document === 'undefined' || typeof Blob === 'undefined') return false;
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
      return true;
    },
    async copy(text) {
      try { if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* fall through */ }
      return false;
    },
    async paste() {
      try { if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) return await navigator.clipboard.readText(); } catch (e) { /* fall through */ }
      if (typeof prompt === 'function') return prompt('Paste your save code') || '';
      return '';
    },
    pickFile() {
      return new Promise((resolve) => {
        if (typeof document === 'undefined') { resolve(''); return; }
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json,.txt,application/json,text/plain';
        inp.onchange = () => {
          const f = inp.files && inp.files[0];
          if (!f) { resolve(''); return; }
          const rd = new FileReader();
          rd.onload = () => resolve(String(rd.result || ''));
          rd.onerror = () => resolve('');
          rd.readAsText(f);
        };
        inp.click();
      });
    },
  };
}
function ioOf(app) { return app.io || (app.io = browserIO()); }

// =================================================================================================== rewards drawing

/** Items of a resolved reward ({fish,yarn,xp,gems,tokens,keys}) as [{kind, id, n}], zero entries removed. */
export function rewardItems(r) {
  const out = [];
  if (!r) return out;
  for (const k of ['fish', 'yarn', 'gems', 'tokens']) if (r[k] > 0) out.push({ kind: 'cur', id: k, n: r[k] });
  if (r.xp > 0) out.push({ kind: 'xp', id: 'xp', n: r.xp });
  if (r.keys) for (const id of Object.keys(r.keys)) if (r.keys[id] > 0) out.push({ kind: 'key', id, n: r.keys[id] });
  return out;
}
/** Draw reward items in a row; right edge at x when align is 'right'. Returns the width. */
export function drawRewardItems(ctx, ui, items, x, cy, align, size) {
  const s = size || 13;
  const widths = items.map((it) => 20 + 4 + (it.kind === 'xp' ? 12 : 0) + String(formatNum(it.n)).length * (s * 0.62) + 8);
  const total = widths.reduce((a, b) => a + b, 0);
  let px = align === 'right' ? x - total : x;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.kind === 'cur') ICONS.drawCurrency(ctx, it.id, px + 10, cy, 20, ui.t);
    else if (it.kind === 'key') ICONS.drawCrate(ctx, it.id, px + 10, cy, 22, { t: ui.t });
    else drawText(ctx, 'XP', px + 2, cy + 4, { size: 11, weight: 800, color: PAL.violetText, stroke: 2.5 });
    drawText(ctx, (it.kind === 'key' ? 'x' : '') + formatNum(it.n), px + 24 + (it.kind === 'xp' ? 12 : 0), cy + s * 0.36, { size: s, weight: 800, color: PAL.bone, stroke: 3 });
    px += widths[i];
  }
  return total;
}
function crateName(id) { const c = CRATE_BY_ID[id]; return c ? c.name : id; }

// =================================================================================================== quests: claim helpers

export function dayOf(app) { return app.dayIndex ? app.dayIndex() : 0; }

/** What can be claimed right now: {daily, weekly, dailyBonus, weeklyBonus, ach, col, total}. */
export function claimableCounts(p, day) {
  const out = { daily: 0, weekly: 0, dailyBonus: 0, weeklyBonus: 0, ach: 0, col: 0, total: 0 };
  for (const kind of ['daily', 'weekly']) {
    for (const v of TOWN.questView(p, kind)) if (v.done && !v.quest.claimed) out[kind]++;
    const block = p.quests && p.quests[kind];
    if (block && bonusReady(block)) out[kind + 'Bonus'] = 1;
  }
  for (const st of TOWN.achievements(p)) out.ach += st.ready;
  for (const e of TOWN.collection(p)) if (e.done && !e.claimed) out.col++;
  out.total = out.daily + out.weekly + out.dailyBonus + out.weeklyBonus + out.ach + out.col;
  return out;
}

/** Claim every ready quest, bonus, achievement tier and collection entry. Returns {profile, count, gems, tokens}. */
export function claimEverything(profile, day) {
  let p = TOWN.refresh(profile, day);
  let count = 0;
  const g0 = p.cur.gems, t0 = p.cur.tokens;
  // rewards can finish other goals (fish earned, gems held), so sweep until a pass claims nothing
  for (let pass = 0; pass < 30; pass++) {
    const c0 = count;
    for (const kind of ['daily', 'weekly']) {
      const block = p.quests && p.quests[kind];
      if (!block) continue;
      for (let i = 0; i < block.quests.length; i++) { const r = TOWN.claimQuest(p, kind, i, day); if (r.ok) { p = r.profile; count++; } }
      const b = TOWN.claimBonus(p, kind, day);
      if (b.ok) { p = b.profile; count++; }
    }
    const a = TOWN.claimAllAchievements(p);
    p = a.profile; count += a.claimed.length;
    for (const e of TOWN.collection(p)) if (e.done && !e.claimed) { const r = TOWN.claimCollection(p, e.id); if (r.ok) { p = r.profile; count++; } }
    if (count === c0) break;
  }
  return { profile: p, count, gems: p.cur.gems - g0, tokens: p.cur.tokens - t0 };
}

// =================================================================================================== bestiary helpers

/** Global stage where an enemy first appears. */
function firstStageOf(enemy) {
  let best = Infinity;
  for (const d of DISTRICTS) {
    if (d.boss === enemy.id) best = Math.min(best, d.bossStage);
    for (const e of d.enemyPool) if (e.id === enemy.id) best = Math.min(best, d.stages[0] + e.from - 1);
  }
  if (best === Infinity) { const d = DISTRICT_BY_ID[enemy.district]; best = d ? d.stages[0] : 1; }
  return best;
}
/** Set of enemy ids the player has met: reached their first stage, or recorded by markSeen. */
export function seenEnemies(p) {
  const reach = Math.max(bestGlobalStage(p), (p.progress && p.progress.maxCleared) | 0);
  const out = new Set();
  for (const e of ENEMIES) if (reach >= firstStageOf(e) || fin(p.stats && p.stats['seen_' + e.id]) > 0) out.add(e.id);
  return out;
}
/** Record enemy ids as met (for the battle screen to call). Returns a new profile. */
export function markSeen(p, ids) {
  const delta = {};
  for (const id of ids) if (ENEMY_BY_ID[id] && !(fin(p.stats && p.stats['seen_' + id]) > 0)) delta['seen_' + id] = 1;
  return Object.keys(delta).length ? TOWN.recordStats(p, delta) : p;
}

// =================================================================================================== meta perks

const PERK_TEXT = {
  offline_cap: { name: 'Long Naps', desc: (p, l) => 'Offline cap ' + formatNum(offlineCapSeconds(withPerk(p, 'offline_cap', l)) / 3600) + 'h' },
  offline_eff: { name: 'Deep Dreams', desc: (p, l) => 'Offline income ' + Math.round(offlineEfficiency(withPerk(p, 'offline_eff', l)) * 100) + '%' },
  start_fish: { name: 'Packed Lunch', desc: (p, l) => 'Start each life with ' + formatNum(startingFish(withPerk(p, 'start_fish', l))) + ' fish' },
  crate_luck: { name: 'Lucky Whiskers', desc: (p, l) => '+' + Math.round(l * 5) + '% weight on rare and better drops' },
  extra_slot: { name: 'Deep Pockets', desc: (p, l) => deckSlots(withPerk(p, 'extra_slot', l)) + ' deck slots' },
};
function withPerk(p, id, l) { return { ...p, meta: { ...(p.meta || {}), [id]: l } }; }
/** Perks the shop should list: extra_slot only while deck.js actually honours it. */
export function perkIds(p) {
  return Object.keys(META).filter((id) => id !== 'extra_slot' || deckSlots(withPerk(p, 'extra_slot', 3)) > deckSlots(withPerk(p, 'extra_slot', 0)));
}
/** [{id, name, level, max, cost, now, next, afford, maxed}] */
export function perkRows(p) {
  return perkIds(p).map((id) => {
    const lvl = metaLevel(p, id), max = META[id].maxLevel, maxed = lvl >= max, c = metaCost(id, lvl);
    const T = PERK_TEXT[id] || { name: id, desc: () => '' };
    return { id, name: T.name, level: lvl, max, cost: c, maxed, afford: !maxed && fin(p.cur.tokens) >= c, now: T.desc(p, lvl), next: maxed ? '' : T.desc(p, lvl + 1) };
  });
}
/** Buy one level of a perk with tokens. reason: unknown | max | poor */
export function buyMetaPerk(p, id) {
  if (!META[id]) return { ok: false, reason: 'unknown', profile: p };
  const lvl = metaLevel(p, id);
  if (lvl >= META[id].maxLevel) return { ok: false, reason: 'max', profile: p };
  const c = metaCost(id, lvl);
  if (!(fin(p.cur.tokens) >= c)) return { ok: false, reason: 'poor', profile: p, need: c - fin(p.cur.tokens) };
  return { ok: true, reason: null, profile: { ...p, cur: { ...p.cur, tokens: p.cur.tokens - c }, meta: { ...(p.meta || {}), [id]: lvl + 1 } }, cost: c };
}

// =================================================================================================== map

const NODE_COLS = 5;
const CARD_H = 218, CARD_GAP = 12;

export function createMapScreen() {
  const S = { tab: 'campaign', sel: 1, riftPage: 0, jump: true, bossFlash: 0 };
  const screen = {
    id: 'map',
    state: S,
    enter(app, params) {
      const p = app.profile;
      S.tab = params && params.tab === 'obs' ? 'obs' : 'campaign';
      const front = toGlobal(p.progress.district, p.progress.stage);
      S.sel = Math.min(front, Math.max(1, params && params.stage ? params.stage : front));
      S.riftPage = Math.max(0, Math.floor((S.sel - ENDLESS.startStage) / 10));
      S.jump = true;
    },
    update() {},
    draw(ctx, app, ui) {
      const p = app.profile;
      const front = toGlobal(p.progress.district, p.progress.stage);
      const dayIdx = dayOf(app);
      const mapCount = Math.floor(TOWN.townStats(p).mapsUnlocked || 0);
      const info = stageInfo(null, S.sel);
      const hd = pageHeader(ui, app, 'MAP', { district: info.district.id, sub: 'Best ' + bestGlobalStage(p) });
      if (hd.back) { goBack(app); return; }
      const c = ui.content, X = c.x + 12, W = c.w - 24;
      let y = hd.y;
      S.tab = ui.tabs('map:tabs', { x: X, y, w: W, h: 36 }, [{ id: 'campaign', label: 'CAMPAIGN' }, { id: 'obs', label: 'OBSERVATORY', badge: mapCount && TOWN.maps(p, dayIdx).some((m) => !m.clearedToday) ? '!' : 0 }], S.tab);
      y += 44;
      const botY = c.y + c.h - 8;
      if (S.tab === 'campaign') {
        const detH = 112, detY = botY - detH;
        this.campaign(ctx, app, ui, { x: X - 4, y, w: W + 8, h: detY - 8 - y }, front);
        this.stageDetail(ctx, app, ui, { x: X, y: detY, w: W, h: detH }, front);
      } else this.observatory(ctx, app, ui, { x: X - 4, y, w: W + 8, h: botY - y }, mapCount, dayIdx);
      ui.vignette(0.4);
    },
    campaign(ctx, app, ui, view, front) {
      const p = app.profile;
      const cleared = maxCleared(p);
      const riftOpen = endlessUnlocked(p) || front > 60;
      const cards = DISTRICTS.length + 1;
      const total = cards * (CARD_H + CARD_GAP) + CARD_GAP;
      if (S.jump) {
        S.jump = false;
        const idx = S.sel > 60 ? DISTRICTS.length : Math.min(DISTRICTS.length - 1, Math.floor((S.sel - 1) / 10));
        const st = ui.state('scr:map:camp', { p: 0, v: 0, drag: false });
        st.p = clamp(CARD_GAP + idx * (CARD_H + CARD_GAP) - 6, 0, Math.max(0, total - view.h));
      }
      ui.scroll('map:camp', view, total, (cx, w) => {
        const lw = w - 8;
        for (let i = 0; i < cards; i++) {
          const y = CARD_GAP + i * (CARD_H + CARD_GAP);
          if (i < DISTRICTS.length) this.districtCard(cx, app, ui, DISTRICTS[i], 4, y, lw, cleared, front);
          else this.riftCard(cx, app, ui, 4, y, lw, cleared, front, riftOpen);
        }
      });
    },
    districtCard(ctx, app, ui, d, x, y, w, cleared, front) {
      const p = app.profile;
      const first = d.stages[0], last = d.stages[1];
      const open = Math.max(front, cleared + 1) >= first;
      const done = Math.max(0, Math.min(10, cleared - first + 1));
      const col = mix(PAL.violet, PAL[d.palette.accent] || PAL.cyan, 0.65);
      const inn = ui.panel({ x, y, w, h: CARD_H }, { color: open ? col : PAL.slate, glow: open && front >= first && front <= last });
      // banner
      const bossE = ENEMY_BY_ID[d.boss];
      ctx.save();
      chamfer(ctx, inn.x, inn.y, inn.w, 66, 6); ctx.clip();
      const g = ctx.createLinearGradient(inn.x, inn.y, inn.x + inn.w, inn.y);
      g.addColorStop(0, rgba(col, open ? 0.5 : 0.15)); g.addColorStop(1, rgba(PAL.ink, 0.1));
      ctx.fillStyle = g; ctx.fillRect(inn.x, inn.y, inn.w, 66);
      if (open && bossE) ENEMYART.drawEnemyPortrait(ctx, bossE.id, inn.x + inn.w - 78, inn.y, 78, 66, { t: ui.t, anim: 'walk', animT: (ui.t * 0.5) % 1 });
      else { ctx.fillStyle = rgba(PAL.void, 0.7); ctx.fillRect(inn.x + inn.w - 78, inn.y, 78, 66); drawText(ctx, '?', inn.x + inn.w - 39, inn.y + 48, { size: 44, kind: 'display', align: 'center', color: PAL.slateText }); }
      ctx.restore();
      drawText(ctx, d.name, inn.x + 4, inn.y + 24, { size: 21, kind: 'display', color: open ? PAL.bone : PAL.slateText, maxWidth: inn.w - 100 });
      drawText(ctx, open ? d.tagline : 'Reach stage ' + first + ' to open', inn.x + 4, inn.y + 42, { size: 12, color: PAL.boneDim, maxWidth: inn.w - 100 });
      ui.bar({ x: inn.x + 4, y: inn.y + 50, w: inn.w - 100, h: 12 }, done / 10, { kind: 'progress', label: done + '/10' });
      // nodes
      const gap = 6, nw = (inn.w - gap * (NODE_COLS - 1)) / NODE_COLS, nh = 44;
      for (let k = 0; k < 10; k++) {
        const gs = first + k;
        const r = { x: inn.x + (k % NODE_COLS) * (nw + gap), y: inn.y + 74 + Math.floor(k / NODE_COLS) * (nh + 8), w: nw, h: nh };
        this.node(ctx, app, ui, gs, r, cleared, front, gs === d.bossStage);
      }
      // modifier line
      if (open) drawText(ctx, d.modifier.text, inn.x + 4, inn.y + inn.h - 2, { size: 11, color: PAL.violetText, weight: 700, stroke: 2, maxWidth: inn.w - 8 });
    },
    riftCard(ctx, app, ui, x, y, w, cleared, front, open) {
      const first = ENDLESS.startStage + S.riftPage * 10;
      const inn = ui.panel({ x, y, w, h: CARD_H }, { color: open ? PAL.magenta : PAL.slate, glow: open });
      const inf = stageInfo(null, first);
      ctx.save();
      chamfer(ctx, inn.x, inn.y, inn.w, 66, 6); ctx.clip();
      const g = ctx.createLinearGradient(inn.x, inn.y, inn.x + inn.w, inn.y + 66);
      g.addColorStop(0, rgba(PAL.magenta, open ? 0.45 : 0.12)); g.addColorStop(1, rgba(PAL.cyan, open ? 0.25 : 0.05));
      ctx.fillStyle = g; ctx.fillRect(inn.x, inn.y, inn.w, 66);
      if (open) { // comet streaks
        for (let i = 0; i < 6; i++) { const px = ((ui.t * (30 + i * 9) + i * 90) % (inn.w + 80)) - 40; ctx.fillStyle = rgba(PAL.bone, 0.5); ctx.fillRect(inn.x + inn.w - px, inn.y + 8 + i * 9, 26 + i * 4, 1.5); }
      }
      ctx.restore();
      drawText(ctx, 'COMET RIFT', inn.x + 4, inn.y + 24, { size: 21, kind: 'display', color: open ? PAL.bone : PAL.slateText, glow: open ? 8 : 0, glowColor: PAL.magenta, maxWidth: inn.w - 100 });
      if (!open) { drawText(ctx, 'Clear stage 60 to open the rift', inn.x + 4, inn.y + 44, { size: 12, color: PAL.boneDim }); return; }
      drawText(ctx, 'Round ' + (inf.round + 1) + '  ' + inf.district.name + '  endless', inn.x + 4, inn.y + 42, { size: 12, color: PAL.boneDim, maxWidth: inn.w - 100 });
      const aff = ENDLESS.affixesByRound(inf.round);
      chip(ctx, inn.x + inn.w, inn.y + 4, aff + (aff > 1 ? ' affixes' : ' affix'), PAL.magenta, { right: true, size: 11, h: 18 });
      if (ui.button('map:rift_prev', { x: inn.x + inn.w - 90, y: inn.y + 26, w: 40, h: 36 }, '', { kind: 'icon', icon: 'back', aria: 'Earlier stages', disabled: S.riftPage <= 0 })) S.riftPage = Math.max(0, S.riftPage - 1);
      if (ui.button('map:rift_next', { x: inn.x + inn.w - 44, y: inn.y + 26, w: 40, h: 36 }, '', { kind: 'icon', icon: 'play', aria: 'Later stages', disabled: first + 10 > Math.max(front, cleared + 1) + 10 })) S.riftPage++;
      ui.bar({ x: inn.x + 4, y: inn.y + 50, w: inn.w - 100, h: 12 }, clamp((cleared - first + 1) / 10, 0, 1), { kind: 'progress', label: 'Stages ' + first + ' to ' + (first + 9) });
      const gap = 6, nw = (inn.w - gap * (NODE_COLS - 1)) / NODE_COLS, nh = 44;
      for (let k = 0; k < 10; k++) {
        const gs = first + k;
        const r = { x: inn.x + (k % NODE_COLS) * (nw + gap), y: inn.y + 74 + Math.floor(k / NODE_COLS) * (nh + 8), w: nw, h: nh };
        this.node(ctx, app, ui, gs, r, cleared, front, stageInfo(null, gs).isBoss);
      }
      drawText(ctx, 'Never ends. Each loop of 60 adds an affix.', inn.x + 4, inn.y + inn.h - 2, { size: 11, color: PAL.violetText, weight: 700, stroke: 2, maxWidth: inn.w - 8 });
    },
    node(ctx, app, ui, gs, r, cleared, front, boss) {
      const p = app.profile;
      const unlocked = isStageUnlocked(p, gs);
      const isDone = gs <= cleared, isFront = gs === front && !isDone;
      const st = ui.region('map:node:' + gs, r, { focus: unlocked, label: 'Stage ' + gs + (boss ? ', boss' : '') + (isDone ? ', cleared' : unlocked ? '' : ', locked') });
      const sel = S.sel === gs;
      const base = boss ? PAL.magenta : isDone ? PAL.lime : isFront ? PAL.cyan : unlocked ? PAL.violetHi : PAL.slate;
      ctx.save(); ctx.translate(r.x, r.y + (st.down ? 2 : 0));
      if ((isFront || sel) && !ui.reduceMotion) glow(ctx, r.w / 2, r.h / 2, r.w * 0.9, sel ? PAL.cyan : base, 0.28 + 0.12 * Math.sin(ui.t * 4));
      chamfer(ctx, 0, 0, r.w, r.h, 6); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.fillStyle = unlocked ? mix(PAL.ink2, base, isDone ? 0.28 : boss ? 0.34 : 0.18) : PAL.ink; ctx.fill();
      ctx.lineWidth = sel ? 2.5 : 1.8; ctx.strokeStyle = sel ? PAL.bone : rgba(base, unlocked ? 0.95 : 0.4); ctx.stroke();
      ctx.restore();
      drawText(ctx, String(gs), r.x + r.w / 2, r.y + r.h / 2 + (boss ? 3 : 7), { size: boss ? 16 : 18, kind: 'display', align: 'center', color: unlocked ? PAL.bone : PAL.slateText, stroke: 3 });
      if (boss) { // crown spikes
        ctx.fillStyle = unlocked ? PAL.magenta : PAL.slate;
        const cx0 = r.x + r.w / 2, cy0 = r.y + 12;
        ctx.beginPath(); ctx.moveTo(cx0 - 10, cy0 + 2); ctx.lineTo(cx0 - 10, cy0 - 6); ctx.lineTo(cx0 - 4, cy0 - 1); ctx.lineTo(cx0, cy0 - 8); ctx.lineTo(cx0 + 4, cy0 - 1); ctx.lineTo(cx0 + 10, cy0 - 6); ctx.lineTo(cx0 + 10, cy0 + 2); ctx.closePath(); ctx.fill();
      }
      if (isDone) { ctx.strokeStyle = PAL.lime; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(r.x + r.w - 16, r.y + 9); ctx.lineTo(r.x + r.w - 12, r.y + 13); ctx.lineTo(r.x + r.w - 6, r.y + 5); ctx.stroke(); }
      if (!unlocked) { ctx.fillStyle = PAL.slate; ctx.fillRect(r.x + r.w - 15, r.y + 8, 9, 7); ctx.strokeStyle = PAL.slate; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(r.x + r.w - 10.5, r.y + 8, 3.2, Math.PI, 0); ctx.stroke(); }
      if (boss && !isDone && unlocked) { ICONS.drawCurrency(ctx, 'gems', r.x + 11, r.y + r.h - 9, 12, ui.t); }
      if (st.tap) { if (unlocked) { S.sel = gs; sfx(app, 'card_select'); } else { sfx(app, 'deny'); toast(app, 'Clear stage ' + Math.max(front, cleared + 1) + ' first', 'warn'); } }
    },
    stageDetail(ctx, app, ui, r, front) {
      const p = app.profile;
      const gs = S.sel, info = stageInfo(null, gs), mode = stageMode(p, gs);
      const unlocked = isStageUnlocked(p, gs);
      const inn = ui.panel(r, { pad: 8, color: info.isBoss ? PAL.magenta : undefined, glow: info.isBoss });
      const bw = Math.min(124, inn.w * 0.36);
      const label = (info.endless ? 'Rift ' + (info.round + 1) + ': ' : '') + info.district.name;
      drawText(ctx, 'STAGE ' + gs, inn.x, inn.y + 16, { size: 20, kind: 'display', color: PAL.bone });
      drawText(ctx, label, inn.x, inn.y + 33, { size: 12, color: PAL.boneDim, weight: 700, maxWidth: inn.w - bw - 12 });
      let tx = inn.x;
      if (info.isBoss && info.boss) tx += chip(ctx, tx, inn.y + 40, 'BOSS ' + info.boss.name.split(',')[0], PAL.magenta, { size: 11, h: 18 }) + 5;
      tx += chip(ctx, tx, inn.y + 40, wavesPerStage(null, gs) + ' waves', PAL.cyan, { size: 11, h: 18 }) + 5;
      if (mode.echo) chip(ctx, tx, inn.y + 40, 'ECHO', PAL.violetHi, { size: 11, h: 18 });
      else if (mode.firstClear) chip(ctx, tx, inn.y + 40, 'FIRST CLEAR', PAL.lime, { size: 11, h: 18 });
      // rewards preview (the exact amounts the win would pay)
      const prev = stageRewards(p, { won: true, gs });
      const items = rewardItems({ fish: prev.rewards.fish, yarn: prev.rewards.yarn, gems: prev.rewards.gems });
      drawRewardItems(ctx, ui, items, inn.x, inn.y + inn.h - 12, 'left', 13);
      const label2 = !unlocked ? 'LOCKED' : mode.echo ? 'ECHO CLEAR' : 'FIGHT';
      if (ui.button('map:fight', { x: inn.x + inn.w - bw, y: inn.y + 2, w: bw, h: inn.h - 4 }, label2, { kind: mode.echo ? 'info' : 'primary', size: 20, disabled: !unlocked, pulse: unlocked && gs === front, sub: unlocked ? (mode.echo ? 'instant' : 'tap to start') : '' })) {
        sfx(app, 'card_play');
        const go = () => app.router && app.router.go('battle', { district: null, stage: gs, returnTo: 'map' });
        if (ui.transition) ui.transition('iris', go); else go();
      }
    },
    observatory(ctx, app, ui, view, mapCount, dayIdx) {
      const p = app.profile;
      const X = view.x + 4, W = view.w - 8;
      if (!mapCount) {
        const inn = ui.panel({ x: X, y: view.y + 16, w: W, h: 214 }, { title: 'OBSERVATORY', pad: 14 });
        drawText(ctx, 'No maps yet', inn.x + inn.w / 2, inn.y + 24, { size: 20, kind: 'display', align: 'center', color: PAL.boneDim });
        para(ctx, 'Build an Observatory in your town to chart daily bonus maps with their own modifiers and bigger rewards. Every map you clear for the first time each day pays a gem.', inn.x, inn.y + 44, inn.w, { size: 14, align: 'left', maxLines: 5, lh: 19 });
        if (ui.button('map:to_town', { x: inn.x + inn.w / 2 - 80, y: inn.y + inn.h - 44, w: 160, h: 44 }, 'TO TOWN', { kind: 'secondary', size: 16 })) { if (app.router) app.router.go('town'); }
        return;
      }
      const list = TOWN.maps(p, dayIdx);
      const rowH = 124;
      ui.scroll('map:obs', view, list.length * (rowH + 10) + 10, () => {
        for (let i = 0; i < list.length; i++) {
          const m = list[i], y = 10 + i * (rowH + 10), d = DISTRICT_BY_ID[m.baseDistrict];
          const inn = ui.panel({ x: 4, y, w: view.w - 8, h: rowH }, { pad: 10, color: m.clearedToday ? PAL.lime : PAL.violetHi, glow: !m.clearedToday });
          drawText(ctx, m.name, inn.x, inn.y + 17, { size: 19, kind: 'display', maxWidth: inn.w - 120 });
          drawText(ctx, d.name + '  stage ' + m.stage + '  ' + m.waves + ' waves', inn.x, inn.y + 34, { size: 12, color: PAL.boneDim, weight: 700, maxWidth: inn.w - 120 });
          para(ctx, m.modifier.text, inn.x, inn.y + 40, inn.w - 120, { size: 12, color: PAL.violetText, maxLines: 2 });
          chip(ctx, inn.x, inn.y + inn.h - 28, 'x' + m.rewardMult.toFixed(2) + ' rewards', PAL.cyan, { size: 11, h: 18 });
          if (m.clearedToday) chip(ctx, inn.x + 100, inn.y + inn.h - 28, 'CLEARED TODAY', PAL.lime, { size: 11, h: 18 });
          else { ICONS.drawCurrency(ctx, 'gems', inn.x + 106, inn.y + inn.h - 19, 15, ui.t); drawText(ctx, '+1 first win today', inn.x + 118, inn.y + inn.h - 14, { size: 11, weight: 800, color: PAL.cyan, stroke: 2.5 }); }
          if (ui.button('map:obs:' + m.id, { x: inn.x + inn.w - 104, y: inn.y + 4, w: 104, h: inn.h - 8 }, 'FIGHT', { kind: 'primary', size: 19, sub: 'stage ' + m.stage })) {
            sfx(app, 'card_play');
            const go = () => app.router && app.router.go('battle', {
              district: null, stage: m.stage, rewardMult: m.rewardMult, noAdvance: true, modifiers: [m.modifier.effect], returnTo: 'map',
              onDone: (res) => {
                if (res && res.won) {
                  const cl = TOWN.claimMapClear(app.profile, m.id, dayOf(app));
                  if (cl.ok) { commit(app, cl.profile); if (cl.gems > 0) toast(app, '+' + cl.gems + ' gem for the first win today', 'reward'); }
                }
                if (app.router) app.router.go('map', { tab: 'obs' });
              },
            });
            if (ui.transition) ui.transition('iris', go); else go();
          }
        }
      });
    },
    exit() {},
  };
  return screen;
}

// =================================================================================================== quests

const QUEST_TABS = [{ id: 'daily', label: 'DAILY' }, { id: 'weekly', label: 'WEEKLY' }, { id: 'goals', label: 'GOALS' }, { id: 'sets', label: 'SETS' }];

export function createQuestsScreen() {
  const S = { tab: 'daily', burst: 0 };
  const screen = {
    id: 'quests',
    state: S,
    enter(app, params) {
      S.tab = params && QUEST_TABS.some((t) => t.id === params.tab) ? params.tab : 'daily';
      const r = TOWN.refresh(app.profile, dayOf(app));
      if (r !== app.profile) { app.setProfile(r); if (app.save) app.save(); }
    },
    update(app, dt) { S.burst = Math.max(0, S.burst - dt); },
    draw(ctx, app, ui) {
      const p = app.profile, day = dayOf(app);
      const cnt = claimableCounts(p, day);
      const hd = pageHeader(ui, app, 'QUESTS', { sub: cnt.total ? cnt.total + ' ready' : '' });
      if (hd.back) { goBack(app); return; }
      const c = ui.content, X = c.x + 12, W = c.w - 24;
      let y = hd.y;
      const tabs = QUEST_TABS.map((t) => ({ ...t, badge: t.id === 'daily' ? cnt.daily + cnt.dailyBonus : t.id === 'weekly' ? cnt.weekly + cnt.weeklyBonus : t.id === 'goals' ? cnt.ach : cnt.col }));
      S.tab = ui.tabs('q:tabs', { x: X, y, w: W, h: 36 }, tabs, S.tab);
      y += 44;
      const barH = 52, barY = c.y + c.h - barH - 8;
      const view = { x: X - 4, y, w: W + 8, h: barY - 8 - y };
      if (S.tab === 'daily' || S.tab === 'weekly') this.block(ctx, app, ui, view, S.tab, day);
      else if (S.tab === 'goals') this.goals(ctx, app, ui, view);
      else this.sets(ctx, app, ui, view);
      // claim all bar
      if (cnt.total > 0) {
        if (ui.button('q:claimall', { x: X, y: barY, w: W, h: barH }, 'CLAIM ALL', { kind: 'positive', size: 20, sub: cnt.total + (cnt.total === 1 ? ' reward waiting' : ' rewards waiting'), pulse: true })) {
          const r = claimEverything(app.profile, day);
          if (r.count) {
            commit(app, r.profile); S.burst = 1; sfx(app, 'reward_key');
            toast(app, 'Claimed ' + r.count + (r.gems ? ', +' + formatNum(r.gems) + ' gems' : '') + (r.tokens ? ', +' + r.tokens + ' tokens' : ''), 'reward');
          }
        }
      } else {
        const left = 86400 - Math.floor(((app.now ? app.now() : 0) / 1000) % 86400);
        drawText(ctx, S.tab === 'weekly' ? 'New weekly quests every 7 days' : 'New quests in ' + formatTime(left), X + W / 2, barY + 30, { size: 14, align: 'center', color: PAL.boneDim, weight: 700 });
      }
      if (S.burst > 0 && !ui.reduceMotion) { // claim sparkle
        const k = 1 - S.burst;
        for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, rr = outCubic(k) * (60 + (i % 3) * 22); ctx.fillStyle = rgba(i % 2 ? PAL.lime : PAL.cyan, S.burst); ctx.fillRect(X + W / 2 + Math.cos(a) * rr - 2, barY + barH / 2 + Math.sin(a) * rr - 2, 4, 4); }
      }
      ui.vignette(0.4);
    },
    claimOne(app, kind, i) {
      const r = TOWN.claimQuest(app.profile, kind, i, dayOf(app));
      if (r.ok) { commit(app, r.profile); sfx(app, 'reward_tick'); S.burst = 0.6; } else { sfx(app, 'deny'); toast(app, 'Not ready', 'warn'); }
    },
    block(ctx, app, ui, view, kind, day) {
      const p = app.profile;
      const rows = TOWN.questView(p, kind), block = p.quests && p.quests[kind];
      if (!block) { drawText(ctx, 'Rolling quests...', view.x + view.w / 2, view.y + 40, { size: 15, align: 'center', color: PAL.boneDim }); return; }
      const pm = TOWN.perMinute(p);
      const rowH = 78;
      const total = (rows.length + 1) * (rowH + 8) + 8;
      ui.scroll('q:' + kind, view, total, () => {
        const w = view.w - 8;
        for (let i = 0; i < rows.length; i++) {
          const v = rows[i], q = v.quest, y = 8 + i * (rowH + 8);
          const ready = v.done && !q.claimed;
          const inn = ui.panel({ x: 4, y, w, h: rowH }, { pad: 10, color: ready ? PAL.lime : q.claimed ? PAL.slate : PAL.violet, glow: ready, alpha: q.claimed ? 0.6 : 0.97 });
          const bw = 82;
          const lines = wrapText(ctx, q.text, inn.w - bw - 10, { size: 14, weight: 700 });
          for (let l = 0; l < Math.min(2, lines.length); l++) drawText(ctx, lines[l], inn.x, inn.y + 14 + l * 16, { size: 14, weight: 700, color: q.claimed ? PAL.boneDim : PAL.bone, stroke: 2.5 });
          ui.bar({ x: inn.x, y: inn.y + 34, w: inn.w - bw - 10, h: 14 }, v.progress / q.target, { kind: ready || q.claimed ? 'progress' : 'xp', label: formatNum(Math.floor(v.progress)) + '/' + formatNum(q.target) });
          drawRewardItems(ctx, ui, rewardItems(resolveSpec(q.reward, pm)), inn.x, inn.y + inn.h - 8, 'left', 12);
          const br = { x: inn.x + inn.w - bw, y: inn.y + 4, w: bw, h: inn.h - 8 };
          if (q.claimed) { ctx.strokeStyle = PAL.lime; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(br.x + br.w / 2 - 12, br.y + br.h / 2); ctx.lineTo(br.x + br.w / 2 - 3, br.y + br.h / 2 + 9); ctx.lineTo(br.x + br.w / 2 + 14, br.y + br.h / 2 - 10); ctx.stroke(); }
          else if (ui.button('q:' + kind + ':' + i, br, ready ? 'CLAIM' : 'LOCKED', { kind: ready ? 'positive' : 'secondary', size: 15, disabled: !ready, pulse: ready })) this.claimOne(app, kind, i);
        }
        // bonus
        const y = 8 + rows.length * (rowH + 8), ready = bonusReady(block), claimed = block.bonus.claimed;
        const inn = ui.panel({ x: 4, y, w, h: rowH }, { pad: 10, title: 'ALL DONE BONUS', color: ready ? PAL.cyan : PAL.violet, glow: ready, alpha: claimed ? 0.6 : 0.97 });
        const done = block.quests.filter((q) => q.claimed).length;
        ui.bar({ x: inn.x, y: inn.y + 8, w: inn.w - 92, h: 14 }, done / block.quests.length, { kind: 'progress', label: done + '/' + block.quests.length + ' claimed' });
        drawRewardItems(ctx, ui, rewardItems(resolveSpec(block.bonus.reward, pm)), inn.x, inn.y + inn.h - 12, 'left', 12);
        const br = { x: inn.x + inn.w - 82, y: inn.y + 2, w: 82, h: inn.h - 6 };
        if (claimed) drawText(ctx, 'DONE', br.x + br.w / 2, br.y + br.h / 2 + 6, { size: 18, kind: 'display', align: 'center', color: PAL.lime });
        else if (ui.button('q:' + kind + ':bonus', br, ready ? 'CLAIM' : 'LOCKED', { kind: ready ? 'positive' : 'secondary', size: 15, disabled: !ready, pulse: ready })) {
          const r = TOWN.claimBonus(app.profile, kind, day);
          if (r.ok) { commit(app, r.profile); sfx(app, 'reward_key'); S.burst = 1; }
        }
      });
    },
    goals(ctx, app, ui, view) {
      const p = app.profile;
      const sts = TOWN.achievements(p).slice().sort((a, b) => (b.ready > 0) - (a.ready > 0) || a.next.tier - b.next.tier || (a.family < b.family ? -1 : 1));
      const pm = TOWN.perMinute(p);
      const rowH = 92;
      ui.scroll('q:goals', view, sts.length * (rowH + 8) + 8, () => {
        const w = view.w - 8;
        for (let i = 0; i < sts.length; i++) {
          const st = sts[i], fam = ACHIEVEMENT_BY_FAMILY[st.family], e = st.next, y = 8 + i * (rowH + 8);
          const ready = st.ready > 0;
          const inn = ui.panel({ x: 4, y, w, h: rowH }, { pad: 10, color: ready ? PAL.lime : PAL.violet, glow: ready });
          const bw = 88;
          drawText(ctx, e.name, inn.x, inn.y + 15, { size: 17, kind: 'display', maxWidth: inn.w - bw - 10 });
          drawText(ctx, e.text, inn.x, inn.y + 32, { size: 12, color: PAL.boneDim, weight: 700, maxWidth: inn.w - bw - 10 });
          ui.bar({ x: inn.x, y: inn.y + 40, w: inn.w - bw - 10, h: 14 }, st.value / e.target, { kind: ready ? 'progress' : 'xp', label: formatNum(st.value) + '/' + formatNum(e.target) });
          // ladder pips: named tiers then an endless counter
          for (let k = 0; k < NAMED_TIERS; k++) { const px = inn.x + 6 + k * 14, py = inn.y + inn.h - 12; starShape(ctx, px, py, 5.5); ctx.fillStyle = k < st.claimed ? PAL.cyan : PAL.ink3; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = k < st.claimed ? PAL.bone : PAL.slate; ctx.stroke(); }
          if (st.claimed >= NAMED_TIERS) drawText(ctx, '+' + (st.claimed - NAMED_TIERS + 1) + ' beyond', inn.x + 80, inn.y + inn.h - 7, { size: 11, weight: 800, color: PAL.cyan, stroke: 2.5 });
          drawRewardItems(ctx, ui, rewardItems(resolveSpec(e.reward, pm)), inn.x + inn.w - bw - 10, inn.y + inn.h - 12, 'right', 11);
          if (ui.button('q:ach:' + fam.id, { x: inn.x + inn.w - bw, y: inn.y + 2, w: bw, h: 44 }, ready ? 'CLAIM' : 'LOCKED', { kind: ready ? 'positive' : 'secondary', size: 15, disabled: !ready, pulse: ready, badge: st.ready > 1 ? st.ready : 0 })) {
            const r = TOWN.claimAchievement(app.profile, fam.id);
            if (r.ok) { commit(app, r.profile); sfx(app, 'reward_tick'); toast(app, r.entry.name, 'reward'); S.burst = 0.6; }
          }
        }
      });
    },
    sets(ctx, app, ui, view) {
      const p = app.profile;
      const entries = TOWN.collection(p).slice().sort((a, b) => ((b.done && !b.claimed) - (a.done && !a.claimed)) || (a.claimed - b.claimed));
      const bonuses = collectionBonuses(p);
      const pm = TOWN.perMinute(p);
      const headH = 86, rowH = 76;
      ui.scroll('q:sets', view, headH + entries.length * (rowH + 8) + 16, () => {
        const w = view.w - 8;
        const hp = ui.panel({ x: 4, y: 8, w, h: headH - 6 }, { pad: 10, title: 'COLLECTION', color: PAL.cyan });
        const pct = collectionPct(p);
        ui.bar({ x: hp.x, y: hp.y + 2, w: hp.w, h: 14 }, pct, { kind: 'progress', label: Math.round(pct * 100) + '% of cats found' });
        const bonusText = bonuses.length ? bonuses.length + ' set bonuses active' : 'Finish a set for a permanent battle bonus';
        drawText(ctx, bonusText, hp.x, hp.y + 38, { size: 13, weight: 700, color: bonuses.length ? PAL.lime : PAL.boneDim, maxWidth: hp.w });
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i], y = headH + 8 + i * (rowH + 8), ready = e.done && !e.claimed;
          const inn = ui.panel({ x: 4, y, w, h: rowH }, { pad: 10, color: ready ? PAL.lime : e.claimed ? PAL.slate : PAL.violet, glow: ready, alpha: e.claimed ? 0.6 : 0.97 });
          const bw = 82;
          drawText(ctx, e.label, inn.x, inn.y + 15, { size: 14, weight: 800, color: e.claimed ? PAL.boneDim : PAL.bone, maxWidth: inn.w - bw - 10 });
          ui.bar({ x: inn.x, y: inn.y + 26, w: inn.w - bw - 10, h: 14 }, e.have / e.need, { kind: e.done ? 'progress' : 'xp', label: formatNum(Math.min(e.have, e.need)) + '/' + formatNum(e.need) });
          drawRewardItems(ctx, ui, rewardItems(resolveSpec(e.reward, pm)), inn.x, inn.y + inn.h - 12, 'left', 12);
          const br = { x: inn.x + inn.w - bw, y: inn.y + 2, w: bw, h: inn.h - 8 };
          if (e.claimed) drawText(ctx, 'DONE', br.x + br.w / 2, br.y + br.h / 2 + 6, { size: 18, kind: 'display', align: 'center', color: PAL.lime });
          else if (ui.button('q:col:' + e.id, br, ready ? 'CLAIM' : 'LOCKED', { kind: ready ? 'positive' : 'secondary', size: 15, disabled: !ready, pulse: ready })) {
            const r = TOWN.claimCollection(app.profile, e.id);
            if (r.ok) { commit(app, r.profile); sfx(app, 'reward_tick'); S.burst = 0.6; }
          }
        }
      });
    },
    exit() {},
  };
  return screen;
}
// resolve a reward spec (fish/yarn/xp as {minutes}, gems, tokens, keys) to amounts
function resolveSpec(spec, pm) {
  const out = { fish: 0, yarn: 0, xp: 0, gems: 0, tokens: 0, keys: {} };
  if (!spec) return out;
  for (const k of ['fish', 'yarn', 'xp']) if (spec[k]) out[k] = Math.floor(fin((pm[k] || 0) * spec[k].minutes));
  out.gems = Math.floor(spec.gems || 0); out.tokens = Math.floor(spec.tokens || 0);
  if (spec.keys) for (const id of Object.keys(spec.keys)) out.keys[id] = Math.floor(spec.keys[id]);
  return out;
}

// =================================================================================================== bestiary

export function createBestiaryScreen() {
  const S = { open: null };
  const screen = {
    id: 'bestiary',
    state: S,
    enter() { S.open = null; },
    update() {},
    draw(ctx, app, ui) {
      const p = app.profile;
      const seen = seenEnemies(p);
      const hd = pageHeader(ui, app, 'BESTIARY', { sub: seen.size + '/' + ENEMIES.length + ' met' });
      if (hd.back) { goBack(app); return; }
      const c = ui.content, X = c.x + 12, W = c.w - 24;
      const y = hd.y;
      const colsN = c.w >= 480 ? 5 : 4, gap = 8, tw = (W - gap * (colsN - 1)) / colsN, th = tw * 1.2;
      const view = { x: X - 4, y, w: W + 8, h: c.y + c.h - y - 6 };
      // layout: one section per district, in order; regular enemies in a grid, the boss as a wide banner
      const secs = DISTRICTS.map((d) => {
        const all = ENEMIES.filter((e) => e.district === d.id).sort((a, b) => a.tier - b.tier);
        return { d, list: all.filter((e) => !e.boss), boss: all.find((e) => e.boss) };
      });
      const bossH = 92;
      let total = 8;
      for (const s of secs) total += 34 + Math.ceil(s.list.length / colsN) * (th + gap) + (s.boss ? bossH + gap : 0) + 10;
      let tapped = null;
      const tile = (e, r, wide) => {
        const known = seen.has(e.id);
        const st = ui.region('bes:' + e.id, r, { focus: true, label: known ? e.name : 'Unknown enemy' });
        ctx.save(); ctx.translate(r.x, r.y + (st.down ? 2 : 0));
        if (known && e.boss) glow(ctx, r.w / 2, r.h / 2, r.w * 0.5, PAL.magenta, 0.3);
        chamfer(ctx, 0, 0, r.w, r.h, 6); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
        ctx.fillStyle = PAL.ink2; ctx.fill();
        ctx.restore();
        const pw = wide ? r.h - 6 : r.w - 6, ph = wide ? r.h - 6 : r.h - 24;
        if (known) ENEMYART.drawEnemyPortrait(ctx, e.id, r.x + 3, r.y + 3, pw, ph, { t: ui.t, anim: 'walk', animT: (ui.t * 0.4 + hash01(e.id)) % 1 });
        else { ctx.fillStyle = PAL.void; ctx.fillRect(r.x + 3, r.y + 3, pw, ph); drawText(ctx, '?', r.x + 3 + pw / 2, r.y + 3 + ph / 2 + 16, { size: 36, kind: 'display', align: 'center', color: PAL.slateText }); }
        ctx.save(); chamfer(ctx, r.x, r.y, r.w, r.h, 6); ctx.lineWidth = 2; ctx.strokeStyle = known ? (e.boss ? PAL.magenta : ENEMY_COLOR[factionOf(e)] || PAL.violetHi) : rgba(PAL.slate, 0.5); ctx.stroke(); ctx.restore();
        if (wide) {
          const tx = r.x + r.h + 6;
          drawText(ctx, known ? e.name : '???', tx, r.y + 28, { size: 18, kind: 'display', color: known ? PAL.bone : PAL.slateText, maxWidth: r.w - r.h - 14 });
          drawText(ctx, known ? 'BOSS  HP ' + formatNum(e.base.hp) : 'BOSS', tx, r.y + 48, { size: 12, weight: 800, color: PAL.magenta, stroke: 2.5 });
          if (known) para(ctx, e.desc, tx, r.y + 54, r.w - r.h - 14, { size: 12, maxLines: 2, lh: 14 });
        } else drawText(ctx, known ? e.name.split(',')[0] : '???', r.x + r.w / 2, r.y + r.h - 7, { size: 11, weight: 800, align: 'center', maxWidth: r.w - 6, stroke: 2.5, color: known ? PAL.bone : PAL.slateText });
        if (st.tap) tapped = e;
      };
      ui.scroll('bes:scroll', view, total, () => {
        let yy = 8;
        for (const s of secs) {
          const everyone = s.list.concat(s.boss ? [s.boss] : []);
          const have = everyone.filter((e) => seen.has(e.id)).length;
          drawText(ctx, s.d.name, 8, yy + 20, { size: 18, kind: 'display', color: have ? PAL.bone : PAL.slateText });
          drawText(ctx, have + '/' + everyone.length, view.w - 12, yy + 20, { size: 13, weight: 800, align: 'right', color: have === everyone.length ? PAL.lime : PAL.boneDim });
          yy += 34;
          for (let i = 0; i < s.list.length; i++) tile(s.list[i], { x: 4 + (i % colsN) * (tw + gap), y: yy + Math.floor(i / colsN) * (th + gap), w: tw, h: th }, false);
          yy += Math.ceil(s.list.length / colsN) * (th + gap);
          if (s.boss) { tile(s.boss, { x: 4, y: yy, w: view.w - 8, h: bossH }, true); yy += bossH + gap; }
          yy += 10;
        }
      });
      if (tapped) { sfx(app, 'card_select'); this.openDialog(ui, tapped, seen.has(tapped.id)); }
      ui.vignette(0.4);
    },
    openDialog(ui, e, known) {
      ui.dialog({
        id: 'enemy', title: known ? e.name.split(',')[0] : 'Unknown', height: 240,
        text: known ? e.desc : 'Reach ' + (DISTRICT_BY_ID[e.district] ? DISTRICT_BY_ID[e.district].name : 'a new district') + ' to meet this enemy.',
        buttons: [{ id: 'ok', label: 'CLOSE', kind: 'secondary' }], cancelId: 'ok',
        body: (c2, r) => {
          if (!known) return;
          ENEMYART.drawEnemyPortrait(c2, e.id, r.x, r.y, 92, 92, { t: ui.t, anim: 'walk', animT: (ui.t * 0.5) % 1 });
          const rows = [['HP', formatNum(e.base.hp)], ['DAMAGE', formatNum(e.base.dmg)], ['SPEED', String(e.base.speed)], ['REWARD', formatNum(e.base.reward) + ' fish']];
          rows.forEach((row, i) => {
            drawText(c2, row[0], r.x + 104, r.y + 16 + i * 20, { size: 12, weight: 800, color: PAL.boneDim, stroke: 2 });
            drawText(c2, row[1], r.x + r.w, r.y + 16 + i * 20, { size: 14, weight: 800, align: 'right', stroke: 3 });
          });
          let tx = r.x, ty = r.y + 100;
          for (const t of e.traits) { const wch = chip(c2, tx, ty, t, e.boss ? PAL.magenta : PAL.violetHi, { size: 11, h: 18 }); tx += wch + 4; if (tx > r.x + r.w - 60) { tx = r.x; ty += 22; } }
          if (e.boss && e.phases.length) {
            let py = ty + 26;
            for (const ph of e.phases.slice(0, 3)) { drawText(c2, ph.name, r.x, py, { size: 12, weight: 800, color: PAL.magenta, stroke: 2.5, maxWidth: r.w }); py += 15; }
          }
        },
      });
    },
    exit() { S.open = null; },
  };
  return screen;
}
function factionOf(e) { return e.traits.includes('flying') ? 'vermin' : e.traits.includes('armored') ? 'feral' : e.traits.includes('ranged') ? 'tech' : 'vermin'; }

// =================================================================================================== settings

export function createSettingsScreen() {
  const S = { busy: '' };
  const screen = {
    id: 'settings',
    state: S,
    enter(app) { getSettings(app); S.busy = ''; },
    update() {},
    draw(ctx, app, ui) {
      const s = getSettings(app);
      const hd = pageHeader(ui, app, 'SETTINGS', {});
      if (hd.back) { goBack(app); return; }
      const c = ui.content, X = c.x + 12, W = c.w - 24;
      const view = { x: X - 4, y: hd.y, w: W + 8, h: c.y + c.h - hd.y - 6 };
      let changed = false;
      ui.scroll('set:scroll', view, 960, () => {
        const w = view.w - 8;
        let y = 12;
        // audio
        let inn = ui.panel({ x: 4, y, w, h: 130 }, { title: 'AUDIO', pad: 12 });
        const v = ui.slider('set:vol', { x: inn.x, y: inn.y, w: inn.w, h: 44 }, s.volume, { min: 0, max: 1, step: 0.05, label: 'Volume', format: (x) => Math.round(x * 100) + '%' });
        if (Math.abs(v - s.volume) > 1e-9) { s.volume = clamp(v, 0, 1); changed = true; }
        const mu = ui.toggle('set:mute', { x: inn.x, y: inn.y + 54, w: inn.w, h: 36 }, s.muted, 'Mute all sound');
        if (mu !== s.muted) { s.muted = mu; changed = true; }
        y += 130 + 22;
        // display
        inn = ui.panel({ x: 4, y, w, h: 236 }, { title: 'DISPLAY', pad: 12 });
        drawText(ctx, 'Quality', inn.x, inn.y + 12, { size: 13, weight: 700, color: PAL.boneDim });
        const q = ui.tabs('set:quality', { x: inn.x, y: inn.y + 18, w: inn.w, h: 34 }, [{ id: 'low', label: 'LOW' }, { id: 'medium', label: 'MEDIUM' }, { id: 'high', label: 'HIGH' }], s.quality);
        if (q !== s.quality) { s.quality = q; changed = true; }
        drawText(ctx, 'Reduce motion', inn.x, inn.y + 76, { size: 13, weight: 700, color: PAL.boneDim });
        const m = ui.tabs('set:motion', { x: inn.x, y: inn.y + 82, w: inn.w, h: 34 }, [{ id: 'auto', label: 'AUTO' }, { id: 'on', label: 'ON' }, { id: 'off', label: 'OFF' }], s.motion);
        if (m !== s.motion) { s.motion = m; changed = true; }
        drawText(ctx, 'Text size', inn.x, inn.y + 140, { size: 13, weight: 700, color: PAL.boneDim });
        const ts = ui.tabs('set:text', { x: inn.x, y: inn.y + 146, w: inn.w, h: 34 }, [{ id: 'normal', label: 'NORMAL' }, { id: 'large', label: 'LARGE' }, { id: 'huge', label: 'HUGE' }], s.textSize);
        if (ts !== s.textSize) { s.textSize = ts; changed = true; }
        y += 236 + 22;
        // save
        inn = ui.panel({ x: 4, y, w, h: 214 }, { title: 'SAVE DATA', pad: 12 });
        const bw = (inn.w - 8) / 2;
        if (ui.button('set:export_file', { x: inn.x, y: inn.y, w: bw, h: 52 }, 'EXPORT FILE', { kind: 'secondary', size: 15, sub: 'download .json' })) this.exportFile(app, ui);
        if (ui.button('set:export_code', { x: inn.x + bw + 8, y: inn.y, w: bw, h: 52 }, 'COPY CODE', { kind: 'secondary', size: 15, sub: 'to clipboard' })) this.exportCode(app, ui);
        if (ui.button('set:import_file', { x: inn.x, y: inn.y + 60, w: bw, h: 52 }, 'IMPORT FILE', { kind: 'info', size: 15, sub: 'choose .json' })) this.importFrom(app, ui, 'file');
        if (ui.button('set:import_code', { x: inn.x + bw + 8, y: inn.y + 60, w: bw, h: 52 }, 'PASTE CODE', { kind: 'info', size: 15, sub: 'from clipboard' })) this.importFrom(app, ui, 'paste');
        para(ctx, 'Your save lives in this browser. Export it before clearing site data or switching devices.', inn.x, inn.y + 120, inn.w, { size: 12, maxLines: 3 });
        y += 214 + 22;
        // danger and about
        inn = ui.panel({ x: 4, y, w, h: 150 }, { title: 'MORE', pad: 12 });
        if (ui.button('set:credits', { x: inn.x, y: inn.y, w: bw, h: 52 }, 'CREDITS', { kind: 'secondary', size: 15 })) this.credits(ui);
        if (ui.button('set:reset', { x: inn.x + bw + 8, y: inn.y, w: bw, h: 52 }, 'RESET SAVE', { kind: 'danger', size: 15 })) this.reset(app, ui);
        drawText(ctx, 'Midnight Mog', inn.x, inn.y + 78, { size: 15, kind: 'display', color: PAL.boneDim });
        drawText(ctx, 'Save v' + (app.profile.v | 0) + '  seed ' + formatNum(app.profile.seed), inn.x, inn.y + 98, { size: 12, color: PAL.slateText, weight: 700 });
      });
      if (changed) { saveSettings(s); applySettings(app, ui); sfx(app, 'ui_toggle'); }
      ui.vignette(0.4);
    },
    exportFile(app, ui) {
      const io = ioOf(app), text = serialize(app.profile);
      const ok = io.download('midnight_mog_save.json', text);
      Promise.resolve(ok).then((r) => ui.toast(r === false ? 'Download is not available here, try the code' : 'Save file exported', r === false ? 'warn' : 'ok'));
    },
    exportCode(app, ui) {
      const io = ioOf(app);
      Promise.resolve(io.copy(exportCode(app.profile))).then((ok) => ui.toast(ok ? 'Save code copied' : 'Clipboard is blocked, use Export File', ok ? 'ok' : 'warn'));
    },
    importFrom(app, ui, how) {
      const io = ioOf(app);
      Promise.resolve(how === 'file' ? io.pickFile() : io.paste()).then((text) => {
        if (!text) { ui.toast('Nothing to import', 'warn'); return; }
        const prof = parseSaveText(text);
        if (!prof) { ui.toast('That is not a Midnight Mog save', 'error'); return; }
        this.confirmImport(app, ui, prof);
      });
    },
    confirmImport(app, ui, prof) {
      const cats = Object.keys(prof.cats || {}).length;
      ui.confirm('Replace your save?', 'The imported save has ' + cats + ' cats, best stage ' + bestGlobalStage(prof) + ' and ' + formatNum(prof.cur.fish) + ' fish. Your current save will be overwritten.', () => {
        commit(app, prof); sfx(app, 'reward_key'); ui.toast('Save imported', 'ok');
      }, { danger: true, yesLabel: 'IMPORT', noLabel: 'KEEP MINE', id: 'import' });
    },
    reset(app, ui) {
      ui.dialog({
        id: 'reset1', title: 'Reset everything?', text: 'This erases every cat, card, building and token. Consider exporting a backup first.',
        buttons: [{ id: 'no', label: 'CANCEL', kind: 'secondary' }, { id: 'yes', label: 'CONTINUE', kind: 'danger' }], cancelId: 'no',
        onPick: (id) => {
          if (id !== 'yes') return;
          ui.dialog({
            id: 'reset2', title: 'Really erase it?', text: 'There is no undo. All progress becomes a fresh save.',
            buttons: [{ id: 'no', label: 'KEEP SAVE', kind: 'primary' }, { id: 'yes', label: 'ERASE', kind: 'danger' }], cancelId: 'no',
            onPick: (id2) => {
              if (id2 !== 'yes') return;
              const now = app.now ? app.now() : 0;
              const fresh = newProfile(((now >>> 0) ^ (app.profile.seed >>> 0) ^ 0x9e3779b9) >>> 0, now);
              commit(app, fresh); ui.toast('Fresh start', 'info'); sfx(app, 'deny');
            },
          });
        },
      });
    },
    credits(ui) {
      const lines = ['MIDNIGHT MOG', 'A neon rooftop tower defense', '', 'Design, code, art and sound', 'all made in one night by a team of 25', '', 'Everything on screen is drawn by code.', 'Every sound is synthesised live.', 'No image files, no audio files.', '', 'Thank you for playing.'];
      ui.dialog({
        id: 'credits', title: 'Credits', height: lines.length * 19 + 8,
        buttons: [{ id: 'ok', label: 'CLOSE', kind: 'secondary' }], cancelId: 'ok',
        body: (c2, r) => { lines.forEach((l, i) => drawText(c2, l, r.x + r.w / 2, r.y + 16 + i * 19, { size: i === 0 ? 20 : 13, kind: i === 0 ? 'display' : 'body', align: 'center', color: i === 0 ? PAL.bone : PAL.boneDim, weight: 700 })); },
      });
    },
    exit() {},
  };
  return screen;
}

// =================================================================================================== nine lives

export function createNineLivesScreen() {
  const S = { phase: 'idle', t: 0, applied: false, before: null, result: null, shake: 0 };
  const screen = {
    id: 'nine_lives',
    state: S,
    enter() { S.phase = 'idle'; S.t = 0; S.applied = false; S.before = null; S.result = null; },
    update(app, dt, ui) {
      if (S.phase === 'ritual') {
        const dur = ui && ui.reduceMotion ? 1.2 : 4.2;
        S.t += dt;
        if (!S.applied && S.t >= dur * 0.4) {
          S.applied = true;
          const r = nineLivesReset(app.profile);
          if (r.ok) { commit(app, r.profile); S.result = { shards: r.shards, count: r.profile.nineLives.count }; sfx(app, 'reward_key'); }
          else S.result = { shards: 0, count: app.profile.nineLives.count };
        }
        if (S.t >= dur) { S.phase = 'done'; S.t = 0; }
      } else if (S.phase === 'done') S.t += dt;
    },
    draw(ctx, app, ui) {
      const p = app.profile;
      const hd = pageHeader(ui, app, 'NINE LIVES', { district: 'laser_lights', dim: 0.55, back: S.phase !== 'ritual' });
      if (hd.back) { goBack(app); return; }
      const c = ui.content, X = c.x + 12, W = c.w - 24;
      const pre = nineLivesPreview(p);
      const nl = p.nineLives || { count: 0, shards: 0 };
      const barH = 64, barY = c.y + c.h - barH - 8;
      const view = { x: X - 4, y: hd.y, w: W + 8, h: barY - 8 - hd.y };
      ui.scroll('nl:scroll', view, 920, () => {
        const w = view.w - 8;
        let y = 4;
        // lives row
        const lp = ui.panel({ x: 4, y, w, h: 120 }, { pad: 10, glow: true, color: PAL.magenta });
        const n = Math.min(9, nl.count | 0);
        for (let i = 0; i < 9; i++) {
          const cx = lp.x + lp.w * ((i + 0.5) / 9), cy = lp.y + 30, lit = i < n;
          this.life(ctx, ui, cx, cy, Math.min(22, lp.w / 9 / 2 - 2), lit, i);
        }
        drawText(ctx, nl.count >= 9 ? 'ASCENDED' : 'LIFE ' + (nl.count + 1) + ' OF 9', lp.x + lp.w / 2, lp.y + 78, { size: 24, kind: 'display', align: 'center', gradient: [PAL.bone, PAL.magenta], glow: 10, glowColor: PAL.magenta });
        drawText(ctx, formatNum(nl.shards) + ' shards held', lp.x + lp.w / 2, lp.y + 98, { size: 13, weight: 700, align: 'center', color: PAL.boneDim });
        y += 120 + 24;
        // preview
        const now = nineLivesMult(nl.shards), aft = nineLivesMult(nl.shards + pre.shards);
        const pp = ui.panel({ x: 4, y, w, h: 190 }, { title: 'IF YOU BURN A LIFE', pad: 12, color: PAL.cyan });
        const rowsP = [
          ['Shards gained', '+' + formatNum(pre.shards), PAL.lime],
          ['Income', 'x' + now.income.toFixed(2) + '  >  x' + aft.income.toFixed(2), PAL.bone],
          ['Damage', 'x' + now.damage.toFixed(2) + '  >  x' + aft.damage.toFixed(2), PAL.bone],
          ['Best stage', String(pre.best), PAL.bone],
          ['Echo clears below', pre.allowed ? 'stage ' + pre.echo : '-', PAL.bone],
        ];
        rowsP.forEach((r, i) => {
          const ry = pp.y + 14 + i * 28;
          drawText(ctx, r[0], pp.x, ry + 5, { size: 14, weight: 700, color: PAL.boneDim });
          drawText(ctx, r[1], pp.x + pp.w, ry + 5, { size: i === 0 ? 20 : 15, kind: i === 0 ? 'display' : 'body', weight: 800, align: 'right', color: r[2], glow: i === 0 && pre.allowed ? 8 : 0, glowColor: PAL.lime });
          ctx.fillStyle = rgba(PAL.bone, 0.07); ctx.fillRect(pp.x, ry + 13, pp.w, 1);
        });
        y += 190 + 24;
        // keeps / resets
        const half = (w - 8) / 2;
        const kp = ui.panel({ x: 4, y, w: half, h: 118 }, { title: 'KEEP', pad: 10, color: PAL.lime });
        ['Cats and cards', 'Relics and deck', 'Gems and tokens', 'Quests and stars'].forEach((t, i) => { drawText(ctx, t, kp.x + 14, kp.y + 12 + i * 22, { size: 12, weight: 700, maxWidth: kp.w - 16 }); ctx.fillStyle = PAL.lime; ctx.fillRect(kp.x, kp.y + 4 + i * 22, 7, 7); });
        const rp = ui.panel({ x: 4 + half + 8, y, w: half, h: 118 }, { title: 'RESET', pad: 10, color: PAL.magenta });
        ['Stage progress', 'Cat and card levels', 'Fish and yarn', 'Building levels (most)'].forEach((t, i) => { drawText(ctx, t, rp.x + 14, rp.y + 12 + i * 22, { size: 12, weight: 700, maxWidth: rp.w - 16 }); ctx.fillStyle = PAL.magenta; ctx.fillRect(rp.x, rp.y + 4 + i * 22, 7, 7); });
        y += 118 + 24;
        // shop
        const rows = perkRows(p);
        const sp = ui.panel({ x: 4, y, w, h: rows.length * 86 + 28 }, { title: 'PERKS', pad: 12, color: PAL.lime });
        ICONS.drawCurrency(ctx, 'tokens', sp.x + sp.w - 52, sp.y + 4, 20, ui.t);
        drawText(ctx, formatNum(p.cur.tokens), sp.x + sp.w - 38, sp.y + 10, { size: 15, weight: 800, stroke: 3 });
        rows.forEach((r, i) => {
          const ry = sp.y + 22 + i * 86;
          drawText(ctx, r.name, sp.x, ry + 14, { size: 16, kind: 'display', color: PAL.bone, maxWidth: sp.w * 0.5 });
          // level pips
          for (let k = 0; k < r.max; k++) { const px = sp.x + k * 11; ctx.fillStyle = k < r.level ? PAL.lime : PAL.ink3; ctx.fillRect(px, ry + 22, 8, 5); }
          drawText(ctx, r.now, sp.x, ry + 46, { size: 12, weight: 700, color: PAL.boneDim, maxWidth: sp.w - 110 });
          if (!r.maxed) drawText(ctx, 'next: ' + r.next, sp.x, ry + 62, { size: 12, weight: 700, color: PAL.lime, maxWidth: sp.w - 110 });
          else drawText(ctx, 'MAXED', sp.x, ry + 62, { size: 12, weight: 800, color: PAL.cyan });
          if (!r.maxed) {
            if (ui.button('nl:buy:' + r.id, { x: sp.x + sp.w - 100, y: ry + 20, w: 100, h: 46 }, 'BUY', { kind: r.afford ? 'positive' : 'secondary', size: 16, sub: formatNum(r.cost) + ' tokens' })) {
              const res = buyMetaPerk(app.profile, r.id);
              if (res.ok) { commit(app, res.profile); sfx(app, 'reward_tick'); toast(app, r.name + ' level ' + (r.level + 1), 'ok'); }
              else { sfx(app, 'deny'); toast(app, needMsg('tokens', p.cur.tokens, r.cost), 'warn'); }
            }
          }
          if (i < rows.length - 1) { ctx.fillStyle = rgba(PAL.bone, 0.07); ctx.fillRect(sp.x, ry + 76, sp.w, 1); }
        });
      });
      // main button
      const need = Math.max(0, NINE_LIVES.minStage - pre.best);
      if (ui.button('nl:go', { x: X, y: barY, w: W, h: barH }, pre.allowed ? 'BURN A LIFE' : 'LOCKED', { kind: pre.allowed ? 'primary' : 'secondary', size: 24, disabled: !pre.allowed || S.phase !== 'idle', pulse: pre.allowed, sub: pre.allowed ? '+' + formatNum(pre.shards) + ' shards' : 'Reach stage ' + NINE_LIVES.minStage + (need ? ' (' + need + ' to go)' : '') })) {
        sfx(app, 'ui_open');
        ui.dialog({
          id: 'nl:confirm', title: 'Burn a life?', height: 96,
          text: 'The city goes dark and you start again, stronger. Stages and levels reset. Your cats, cards and relics stay.',
          buttons: [{ id: 'no', label: 'NOT YET', kind: 'secondary' }, { id: 'yes', label: 'BURN IT', kind: 'primary' }], cancelId: 'no',
          body: (c2, r) => {
            glow(c2, r.x + r.w / 2, r.y + 40, 90, PAL.lime, 0.4);
            drawText(c2, '+' + formatNum(pre.shards), r.x + r.w / 2, r.y + 50, { size: 44, kind: 'display', align: 'center', color: PAL.lime, glow: 14, glowColor: PAL.lime });
            drawText(c2, 'SHARDS AND TOKENS', r.x + r.w / 2, r.y + 76, { size: 13, weight: 800, align: 'center', color: PAL.boneDim });
          },
          onPick: (id) => { if (id === 'yes') { S.phase = 'ritual'; S.t = 0; S.applied = false; S.before = { shards: nl.shards, count: nl.count }; } },
        });
      }
      if (S.phase !== 'idle') this.ritual(ctx, app, ui);
      ui.vignette(0.4);
    },
    life(ctx, ui, cx, cy, r, lit, i) {
      ctx.save();
      if (lit) glow(ctx, cx, cy, r * 1.8, PAL.magenta, 0.45 + 0.15 * Math.sin(ui.t * 3 + i));
      // cat head silhouette with crescent ears
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, -r * 0.2); ctx.quadraticCurveTo(-r * 0.95, -r * 1.05, -r * 0.4, -r * 0.62);
      ctx.quadraticCurveTo(0, -r * 0.78, r * 0.4, -r * 0.62); ctx.quadraticCurveTo(r * 0.95, -r * 1.05, r * 0.8, -r * 0.2);
      ctx.quadraticCurveTo(r * 0.9, r * 0.8, 0, r * 0.82); ctx.quadraticCurveTo(-r * 0.9, r * 0.8, -r * 0.8, -r * 0.2); ctx.closePath();
      ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.fillStyle = lit ? PAL.magenta : PAL.ink3; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = lit ? PAL.bone : PAL.slate; ctx.stroke();
      ctx.fillStyle = lit ? PAL.bone : PAL.slate;
      ctx.fillRect(-r * 0.42, -r * 0.1, r * 0.22, r * 0.12); ctx.fillRect(r * 0.2, -r * 0.1, r * 0.22, r * 0.12);
      ctx.restore();
    },
    ritual(ctx, app, ui) {
      const dur = ui.reduceMotion ? 1.2 : 4.2;
      const k = S.phase === 'ritual' ? clamp(S.t / dur, 0, 1) : 1;
      const w = ui.w, h = ui.h, cx = w / 2, cy = h * 0.42;
      const rm = ui.reduceMotion;
      ctx.save();
      // darkness swells, flashes at the moment of the reset, then fades into the result
      const dark = S.phase === 'ritual' ? Math.min(1, k * 6) : 1;
      ctx.fillStyle = rgba(PAL.void, 0.94 * dark); ctx.fillRect(0, 0, w, h);
      ui.block('nl:block');
      if (S.phase === 'ritual') {
        const rings = rm ? 2 : 7;
        for (let i = 0; i < rings; i++) {
          const kk = (k * 1.6 + i / rings) % 1, rr = outCubic(kk) * Math.max(w, h) * 0.7;
          ctx.globalAlpha = (1 - kk) * 0.7; ctx.lineWidth = 3 + (1 - kk) * 4;
          ctx.strokeStyle = i % 2 ? PAL.cyan : PAL.magenta; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        glow(ctx, cx, cy, 150 + 120 * Math.sin(k * Math.PI), PAL.magenta, 0.6);
        // nine lives winking out one by one
        const before = S.before ? Math.min(9, S.before.count) : 0;
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU - Math.PI / 2 + k * 2, rr = 86 * (1 - 0.35 * k);
          const lit = i <= before ? k < 0.3 + i * 0.03 : false;
          this.life(ctx, ui, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 16, lit || i === before, i);
        }
        const n = S.before ? S.before.count + 1 : 1;
        drawText(ctx, String(Math.min(9, n)), cx, cy + 18, { size: 64, kind: 'display', align: 'center', color: PAL.bone, glow: 20, glowColor: PAL.cyan });
        if (k > 0.4 && S.result) {
          ctx.globalAlpha = clamp((k - 0.4) * 3, 0, 1);
          drawText(ctx, '+' + formatNum(S.result.shards) + ' SHARDS', cx, cy + 150, { size: 30, kind: 'display', align: 'center', color: PAL.lime, glow: 12, glowColor: PAL.lime });
          ctx.globalAlpha = 1;
        }
        const flash = Math.max(0, 1 - Math.abs(k - 0.4) * 10);
        if (flash > 0 && !rm) { ctx.fillStyle = rgba(PAL.bone, flash * 0.8); ctx.fillRect(0, 0, w, h); }
      } else {
        const a = outBack(clamp(S.t / 0.6, 0, 1));
        glow(ctx, cx, cy, 260, PAL.magenta, 0.5);
        ctx.translate(cx, cy); ctx.scale(a, a); ctx.translate(-cx, -cy);
        drawText(ctx, 'REBORN', cx, cy - 30, { size: 52, kind: 'display', align: 'center', gradient: [PAL.bone, PAL.magenta], glow: 18, glowColor: PAL.magenta });
        const res = S.result || { shards: 0, count: 0 };
        drawText(ctx, 'LIFE ' + res.count + ' BURNED', cx, cy + 6, { size: 18, kind: 'display', align: 'center', color: PAL.cyan });
        drawText(ctx, '+' + formatNum(res.shards) + ' shards and tokens', cx, cy + 40, { size: 20, weight: 800, align: 'center', color: PAL.lime, stroke: 4 });
        const m = nineLivesMult(app.profile.nineLives.shards);
        drawText(ctx, 'Income x' + m.income.toFixed(2) + '   Damage x' + m.damage.toFixed(2), cx, cy + 68, { size: 15, weight: 700, align: 'center', color: PAL.bone });
        ctx.setTransform(ui.dpr, 0, 0, ui.dpr, 0, 0);
        if (ui.button('nl:done', { x: cx - 100, y: cy + 100, w: 200, h: 54 }, 'BEGIN AGAIN', { kind: 'primary', size: 20, pulse: true })) {
          S.phase = 'idle';
          if (app.router) app.router.go('town');
        }
      }
      ctx.restore();
    },
    exit() { S.phase = 'idle'; },
  };
  return screen;
}

// =================================================================================================== exports

export const mapScreen = createMapScreen();
export const questsScreen = createQuestsScreen();
export const bestiaryScreen = createBestiaryScreen();
export const settingsScreen = createSettingsScreen();
export const nineLivesScreen = createNineLivesScreen();
export const META_SCREENS = [mapScreen, questsScreen, bestiaryScreen, settingsScreen, nineLivesScreen];

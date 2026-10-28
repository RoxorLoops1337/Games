// Stacking Cats: renderer, effects, HUD and screens. The rules live in sim.js.
import {
  CATS, CAT_BY_ID, SNACK_BY_ID, THEMES, STARTERS, START_CATS, MAX_STACK, MAX_BENCH, BOSS_EVERY, ENEMY_TYPES, NESTS, SPECIAL_TEXT,
  emptyStats, checkUnlocks, mergeRun, unlockProgress,
  ITEM_BY_ID, ITEMS, RARITIES, relicProgress, noteRelics as bookRelics, teamRelics, RELIC_SETS, activeSets, setUps, setHint, relicBookLine, BOXES, BOX_BY_ID, RARITY_CHEER, SET_NEED, SET_DOUBLE, MAX_STASH, FORGE_NEXT, FORGE_COUNT, itemSlots, BUILDINGS, BUILDING_BY_ID, emptyKingdom, buildingLevel, cheapestUpgrade, affordableWonder, nextGoal, titleStackIds, upgradeCost, buyUpgrade, kingdomLevel,
  TEMP_WAVES, CHARM_BY_ID, charmLines, DIFFS, CAT_TAGS, SYNERGIES, synergyText, ROUTE_BY_ID, dayKey, dayInfo, WONDERS, WONDER_BY_ID, buyWonder, ACHIEVEMENTS,
  masteryProgress, masteryMap, masteryBonus, MASTERY_MAX, DIFF_ORDER, LADDER_RULES, LADDER_WAVE, ladderTier, ladderUnlocked, diffAllowed, ladderClears, weekKey, weekInfo,
} from './cats.js';
import { COSMETICS, COSMETIC_BY_ID, SLOTS, SLOT_NAMES, lookOf, lookSig, drawLook, drawCosmetic, canWear, buyCosmetic, toggleWear, isOwned } from './cosmetics.js';
import { createKingdomScene } from './kingdom_scene.js';
import { encodeSave, decodeSave } from './savecode.js';
import { dailyScore, fetchBoard, submitScore, submitRun, rankOf, dailyStreak, passedBest, milestoneLine, bestTag, nameOk, cleanName, suggestName } from './daily.js';
import { drawBuilding } from './art_kingdom.js';
import * as S from './sim.js';
import { drawCat } from './art_cats.js';
import { enemySprite, nestSprite, nestOverlay, makeBackdrop, drawBackdrop, drawRays, drawFront, freeBackdrop, resetWorldArt } from './art_world.js';
import { Sfx } from './audio.js';
import { createPost, ambientFor, lightSprite } from './post.js';
import { boxHero } from './art_boxes.js';
import { mix, outlineCanvas, rimLight, texturize, hash, idleHop, waveProgress, dangerLevel, clearLine, confirmTap, coachAbove, specialLabel, dropAction } from './art_util.js';
import { iconCanvas, iconURL, installGlyphs } from './art_icons.js';
import { canInstall, promptInstall, onInstallChange, isIosSafari } from './pwa.js';
import { buzz, setHaptics } from './haptics.js';
import { shareRun } from './share.js';
import { playIntro, playEpilogue } from './intro.js';
import { freedLineFor, kingdomLine, roadLine, pickLine, nestBannerTitle, nestTitle, titleTag, rescueLine, fallLine, freedToast, catStory, beatToastWanted, finaleDue, finaleGems, chapterDoneLine, chapterOf, FINALE_WAVE, FINALE_TITLE, FINALE_LINES, isChapterStart, chapterTitle, chapterBeat, taunt } from './story.js';

const SAVE_KEY = 'stacking_cats_save_v1';
const W = S.W, H = S.H, GROUND = S.GROUND, SLOT = S.SLOT;
const DISPLAY = '"Lilita One","Baloo 2","Arial Rounded MT Bold",system-ui,sans-serif';
const FONT = '"Baloo 2","Nunito","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
const $ = (id) => document.getElementById(id);
const app = $('app'), cv = $('cv'), ctx = cv.getContext('2d'), screenEl = $('screen');
const sfx = new Sfx();

// ---------------------------------------------------------------- save
// a player whose system asks for reduced motion starts with screen shake and flashes off (they can still turn them on)
const REDUCED_MOTION = (() => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
const DEFAULT_OPT = { shake: REDUCED_MOTION ? 0 : 1, colorblind: false, bigText: false, quality: 'auto', motion: !REDUCED_MOTION, sfxVol: 1, musicVol: 0.7, tutorial: true, haptics: true, meows: true, meowMusic: true, autoSpecial: false, fast: false };
function freshSave() {
  return { v: 1, relics: {}, stats: emptyStats(), unlocked: [...STARTERS], sound: true, music: true, tips: {}, kingdom: emptyKingdom(), meter: true, diff: 'normal', name: '', nameAsked: false, ach: {}, catStats: {}, daily: {}, opt: { ...DEFAULT_OPT }, weekly: {}, ladder: 0, owned: [], wardrobe: {} };
}
// fill in anything an older save does not have yet (new fields are always additive)
function adoptSave(s) {
  const f = freshSave();
  return {
    ...f, ...s,
    stats: { ...f.stats, ...s.stats, lvl3Of: { ...((s.stats && s.stats.lvl3Of) || {}) } },
    unlocked: [...new Set([...STARTERS, ...(s.unlocked || []).filter((id) => CAT_BY_ID[id])])],
    tips: s.tips || {}, opt: { ...DEFAULT_OPT, ...(s.opt || {}) },
    kingdom: { ...f.kingdom, ...(s.kingdom || {}), lv: { ...((s.kingdom && s.kingdom.lv) || {}) }, wonders: { ...((s.kingdom && s.kingdom.wonders) || {}) } },
    relics: Object.fromEntries(Object.keys(s.relics || {}).filter((id) => ITEM_BY_ID[id] && s.relics[id]).map((id) => [id, true])),
    ach: { ...(s.ach || {}) }, catStats: { ...(s.catStats || {}) }, daily: { ...(s.daily || {}) },
    diff: DIFF_ORDER.includes(s.diff) ? s.diff : 'normal', name: String(s.name || ''), nameAsked: !!s.nameAsked,
    weekly: { ...(s.weekly || {}) }, ladder: Math.max(0, Math.min(5, (s.ladder | 0))), owned: (s.owned || []).filter((id) => COSMETIC_BY_ID[id]), wardrobe: { ...(s.wardrobe || {}) },
  };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.stats && Array.isArray(s.unlocked)) return adoptSave(s);
  } catch (e) { /* private mode or damaged save: start fresh */ }
  return freshSave();
}
let save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
sfx.on = save.sound; sfx.musicOn = save.music;
sfx.setVolumes(save.opt.sfxVol, save.opt.musicVol);

// ---------------------------------------------------------------- layout
let res = 1, quality = 1, fxCap = 440, gfx = 3;   // gfx: 3 everything, 2 no bloom or grain, 1 no lighting pass, 0 plain
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
function fit() {
  // on a phone held upright the whole game turns sideways so it can use the full screen
  const upright = coarse && innerHeight > innerWidth * 1.1;
  let k;
  if (upright) {
    k = Math.min(innerHeight / W, innerWidth / H);
    app.style.left = '0px'; app.style.top = '0px';
    app.style.transform = `translate(${(innerWidth + H * k) / 2}px, ${(innerHeight - W * k) / 2}px) rotate(90deg) scale(${k})`;
  } else {
    k = Math.min(innerWidth / W, innerHeight / H);
    app.style.transform = `scale(${k})`;
    app.style.left = (innerWidth - W * k) / 2 + 'px';
    app.style.top = (innerHeight - H * k) / 2 + 'px';
  }
  // render at the real screen resolution (capped) so lines stay sharp on high-DPI screens
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cap = save.opt.quality === 'low' ? 1 : coarse ? 1.25 : 2;
  res = Math.max(quality < 1 ? 0.75 : 1, Math.min(cap, k * dpr * quality));
  const pw = Math.round(W * res);
  if (cv.width !== pw) { cv.width = pw; cv.height = Math.round(H * res); }
}
function applyOptions() {
  const o = save.opt, cl = document.body.classList;
  cl.toggle('cb', !!o.colorblind); cl.toggle('bigtext', !!o.bigText); cl.toggle('nomotion', !o.motion); cl.toggle('touch', coarse);
  setHaptics(o.haptics !== false && !!o.motion);
  sfx.setVolumes(o.sfxVol, o.musicVol);
  sfx.meowsOn = o.meows !== false; sfx.meowMusicOn = o.meowMusic !== false;
  fxCap = o.quality === 'low' ? 180 : 440;
  gfx = o.quality === 'low' ? 0 : coarse ? 2 : 3;      // phones skip the bloom pass by default (it is the most expensive single step)
  quality = 1;
  fit();
}
addEventListener('resize', fit); applyOptions();
installGlyphs(app);

// ---------------------------------------------------------------- sprites
const catSprites = new Map(), silSprites = new Map();
function catSprite(id, variant = 'open', look = null) {
  // the cache key carries the cosmetics signature, so changing what a cat wears makes a fresh sprite (look overrides it for previews)
  const sig = look ? (look.head || '') + '.' + (look.face || '') + '.' + (look.neck || '') : lookSig(save, id);
  const key = (variant === 'open' ? id : id + ':' + variant) + (sig && sig !== '..' ? '|' + sig : '');
  let c = catSprites.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 240;
    const x = c.getContext('2d'); x.scale(2, 2); drawCat(x, CAT_BY_ID[id], variant);
    if (sig && sig !== '..') drawLook(x, look || lookOf(save, id), id);
    texturize(c, { seed: hash(key), len: 7, lw: 1.6, count: 900, alpha: 0.3, amp: 0.09, dir: Math.PI / 2 + 0.25, spread: 1.3 });   // fur
    c = outlineCanvas(rimLight(c, 4, '#fff0c0', 0.45), 3, '#2a1840', 0.8);                // a dark rim so the tower keeps its silhouette on bright backdrops
    catSprites.set(key, c);
  }
  return c;
}
function silSprite(id) {
  let c = silSprites.get(id);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 240;
    const x = c.getContext('2d'); x.drawImage(catSprite(id), 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = '#2d2350'; x.fillRect(0, 0, 240, 240);
    silSprites.set(id, c);
  }
  return c;
}
function paintThumbs(root) {
  root.querySelectorAll('canvas[data-cat]').forEach((c) => {
    const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
    x.drawImage(c.dataset.lock ? silSprite(c.dataset.cat) : catSprite(c.dataset.cat), 0, 0, c.width, c.height);
    if (c.dataset.lock) cageBars(x, c.width, c.height);   // the Gnaw Army has this cat locked up
  });
}
// a little cage drawn over a locked cat's silhouette: top and bottom rails and six bars
function cageBars(x, w, h) {
  x.save(); x.strokeStyle = 'rgba(214,200,240,.75)'; x.lineWidth = Math.max(2, w / 36); x.lineCap = 'round';
  x.beginPath();
  for (let i = 1; i <= 6; i++) { const px = (w * i) / 7; x.moveTo(px, h * 0.1); x.lineTo(px, h * 0.92); }
  x.moveTo(w * 0.08, h * 0.12); x.lineTo(w * 0.92, h * 0.12); x.moveTo(w * 0.08, h * 0.9); x.lineTo(w * 0.92, h * 0.9);
  x.stroke(); x.restore();
}

// ---------------------------------------------------------------- state
let g = null, mode = 'title', paused = false, speed = 1, acc = 0, tAnim = 0, last = performance.now();
let acts = {}, runCommitted = true, pickN = 0, queue = [], rewardChoices = null;
let shake = 0, bd = null, bdIdx = -1, titleScroll = 0;
const fx = [];
const backdrops = new Map();
let titleStack = ['tabby', 'ember', 'sparky', 'mochi', 'buckshot'];

function themeFor(wave) { return (S.stageOf(Math.max(1, wave)) - 1) % THEMES.length; }
function setBackdrop(idx) {
  if (idx === bdIdx && bd) return;
  initAmbient(THEMES[idx].deco);
  if (!backdrops.has(idx)) {
    // only the backdrop in use is kept: every theme is ~15 MB of canvases and phones blank them all when memory runs out
    for (const [k, v] of backdrops) { freeBackdrop(v); backdrops.delete(k); }
    backdrops.set(idx, makeBackdrop(THEMES[idx], idx));
  }
  bd = backdrops.get(idx); bdIdx = idx;
  try { sfx.setTheme(idx); } catch (e) { /* music theme is optional */ }
}

// ---------------------------------------------------------------- screens (DOM)
let coachEl = null, tipHold = false;   // tipHold: a tip is open during a fight, so the game waits for the player to press Got it
// the player pressed Got it (or Enter): the game goes on, and the thing the tip pointed at keeps its ring until it is used
function dismissTip() {
  const held = coachEl && coachEl._held, hl = coachEl && coachEl._hl;
  hideCoach();
  if (held && hl && hl.isConnected && hl.classList) {
    hl.classList.add('tuthl');
    const off = () => hl.classList.remove('tuthl');
    hl.addEventListener('click', off, { once: true }); setTimeout(off, 9000);
  }
}
function hideCoach() {
  tipHold = false;
  if (coachEl) { if (coachEl._hl) coachEl._hl.classList.remove('tuthl'); if (coachEl._ring) coachEl._ring.remove(); coachEl.remove(); coachEl = null; }
}
// the stage rectangle of the tower (it is drawn on the canvas, so there is no element to point at)
const towerRect = () => { const n = Math.max(1, g ? g.cats.length : 1); return { x: (g ? g.towerX : 214) - 55, y: GROUND - SLOT * n - 24, w: 110, h: SLOT * n + 36 }; };
// puts a tip right next to the thing it talks about: the side with the most free room, the little tail pointing at it
function placeCoach(el, hl, at) {
  const ar = app.getBoundingClientRect(), sc = ar.width / W || 1, H2 = ar.height / sc;
  const toStage = (r) => ({ l: (r.left - ar.left) / sc, t: (r.top - ar.top) / sc, r: (r.right - ar.left) / sc, b: (r.bottom - ar.top) / sc });
  let tr;
  if (hl) { if (!hl.isConnected) return; tr = toStage(hl.getBoundingClientRect()); } else tr = { l: at.x, t: at.y, r: at.x + at.w, b: at.y + at.h };
  const bw = el.offsetWidth, bh = el.offsetHeight, gap = 18, cx = (tr.l + tr.r) / 2, cy = (tr.t + tr.b) / 2;
  const blocks = [...document.querySelectorAll('#hud .pill, #tools button, #specials button, #zoom, #screen button, #screen .card, #screen .slot.has, #screen .bag.has, #screen .zone h4, #screen .tile, #screen .report, #screen .sub, #screen h2, #screen .logo, #screen input')]
    .filter((n) => n !== hl && !(hl && hl.contains(n)) && !(n.contains && hl && n.contains(hl))).map((n) => toStage(n.getBoundingClientRect())).filter((r) => r.r - r.l > 2 && r.b - r.t > 2);
  const area = (x, y, r) => Math.max(0, Math.min(x + bw, r.r) - Math.max(x, r.l)) * Math.max(0, Math.min(y + bh, r.b) - Math.max(y, r.t));
  const cands = [];   // each side, slid along the edge a few steps, so a tip can dodge a button next to its target
  [0, -0.3, 0.3, -0.6, 0.6].forEach((k, n) => {
    cands.push({ cls: 'down', x: cx - bw / 2 + k * bw, y: tr.t - bh - gap, n }, { cls: 'up', x: cx - bw / 2 + k * bw, y: tr.b + gap, n });
    cands.push({ cls: 'right', x: tr.l - bw - gap, y: cy - bh / 2 + k * bh, n }, { cls: 'left', x: tr.r + gap, y: cy - bh / 2 + k * bh, n });
  });
  let best = null;
  cands.forEach((c, i) => {
    const x = Math.max(6, Math.min(W - bw - 6, c.x)), y = Math.max(6, Math.min(H2 - bh - 6, c.y));
    let o = 0; for (const k of blocks) o += area(x, y, k);
    const score = o + area(x, y, tr) * 3 + (Math.abs(x - c.x) + Math.abs(y - c.y)) * 60 + (i % 4) * 150 + c.n * 40;
    if (!best || score < best.score) best = { score, cls: c.cls, x, y };
  });
  el.className = 'coach ' + best.cls;
  el.style.right = ''; el.style.transform = 'none'; el.style.left = Math.round(best.x) + 'px'; el.style.top = Math.round(best.y) + 'px';
  if (best.cls === 'up' || best.cls === 'down') el.style.setProperty('--tx', Math.max(-(bw / 2 - 26), Math.min(bw / 2 - 26, cx - (best.x + bw / 2))) + 'px');
  else el.style.setProperty('--ty', Math.max(-(bh / 2 - 22), Math.min(bh / 2 - 22, cy - (best.y + bh / 2))) + 'px');
}
// a friendly speech bubble for the first runs. dir says which way the little tail points.
// opt.target: element (or selector in the screen) to ring with a pulse; opt.wait: stay until the real action (no timer).
function coach(key, html, x, y, dir = 'down', opt = {}) {
  if (!save.opt.tutorial || save.tips[key] || paused) return;   // never float a tip over the pause menu
  hideCoach();
  $('toasts').replaceChildren();   // a tip and a toast in the same spot just hide each other
  save.tips[key] = true; persist();
  let hl = opt.target;
  if (typeof hl === 'string') hl = screenEl.querySelector(hl) || document.querySelector(hl);
  if (hl && hl.classList) hl.classList.add('tuthl'); else hl = null;
  const targeted = !!(hl || opt.at);   // a tip that points at something sits next to it
  const el = document.createElement('div');
  el.className = 'coach ' + dir; el.style.left = x + 'px'; el.style.top = y + 'px';
  el.innerHTML = `<span class="cico">&#128049;</span><div>${html}</div><button>Got it</button>`;
  el.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); sfx.play('ui'); dismissTip(); });
  if (dir === 'right') { el.style.left = 'auto'; el.style.right = (W - x) + 'px'; el.style.transform = 'none'; }   // anchor to the right edge so the bubble keeps its full width
  if (opt.maxW) el.style.maxWidth = opt.maxW + 'px';
  el._hl = hl; el.dataset.key = key;
  if (opt.at) {   // something drawn on the canvas (the tower): a pulsing ring in its place
    const ring = document.createElement('div'); ring.className = 'tutring';
    ring.style.left = opt.at.x + 'px'; ring.style.top = opt.at.y + 'px'; ring.style.width = opt.at.w + 'px'; ring.style.height = opt.at.h + 'px';
    app.appendChild(ring); el._ring = ring;
  }
  app.appendChild(el); coachEl = el;
  // a tip during a fight stops the game until the player presses Got it, so it can be read in peace
  if (mode === 'play' && g && !document.body.classList.contains('scr')) { tipHold = true; el._held = true; el.classList.add('held'); el.querySelector('div').insertAdjacentHTML('beforeend', '<small class="holdnote">The game is paused.</small>'); opt = { ...opt, wait: true }; }
  if (targeted) {
    el.style.visibility = 'hidden';
    const go = () => { if (coachEl === el) { placeCoach(el, hl, opt.at); el.style.visibility = ''; } };
    if (document.body.classList.contains('scr')) setTimeout(go, 480); else go();   // on a menu the cards finish sliding in first
    if (!opt.wait) setTimeout(() => { if (coachEl === el) hideCoach(); }, 16000);
    return;
  }
  // a bubble that would run past the right or bottom edge of the stage gets narrower instead of being cut off
  const room = W - 8 - el.offsetLeft;
  if (dir !== 'right' && el.offsetWidth > room) { el.style.maxWidth = Math.max(150, room) + 'px'; el.dataset.narrow = '1'; }
  if (opt.above && hl) {   // sit right over the target instead of a fixed spot that can cover other buttons
    const sc = app.getBoundingClientRect().width / W || 1;
    const p = coachAbove(hl.getBoundingClientRect(), app.getBoundingClientRect(), sc, el.offsetHeight, W);
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    if (p.side) { el.classList.remove('down'); el.classList.add('left'); }   // the bubble sits right of the target with its tail pointing left
  }
  if (document.body.classList.contains('scr')) {   // wait for the cards to finish sliding in so their real boxes are measured
    el.style.visibility = 'hidden';
    setTimeout(() => { if (coachEl === el) { if (!opt.free) coachClear(el, hl); el.style.visibility = ''; } }, 480);   // opt.free: the caller picked a spot that is known to be clear
  }
  if (!opt.wait) setTimeout(() => { if (coachEl === el) hideCoach(); }, 14000);
}
// on a full screen, move the bubble to the nearest spot that covers no button, card, slot or title (nor its own target);
// the tail then points at the target from above or below, or is dropped when there is none
function coachClear(el, hl) {
  if (el.dataset.narrow) { el.style.maxWidth = ''; delete el.dataset.narrow; }   // a bubble squeezed by its first spot gets its full width back before it looks for a clear one
  const ar = app.getBoundingClientRect(), sc = ar.width / W || 1;
  const toStage = (r) => ({ l: (r.left - ar.left) / sc, t: (r.top - ar.top) / sc, r: (r.right - ar.left) / sc, b: (r.bottom - ar.top) / sc });
  const blocks = [...screenEl.querySelectorAll('button, .card, .slot, .bag, h2, .logo, .tile, input, [role=button]')].map((n) => toStage(n.getBoundingClientRect())).filter((r) => r.r - r.l > 2 && r.b - r.t > 2);
  if (hl) blocks.push(toStage(hl.getBoundingClientRect()));
  const bw = el.offsetWidth, bh = el.offsetHeight, H2 = app.getBoundingClientRect().height / sc;
  const hit = (cx, y) => { let a = 0; const l = cx - bw / 2 - 4, r = cx + bw / 2 + 4, t = y - 4, b = y + bh + 6; for (const k of blocks) { const w = Math.min(r, k.r) - Math.max(l, k.l), h = Math.min(b, k.b) - Math.max(t, k.t); if (w > 0 && h > 0) a += w * h; } return a; };
  const cur = toStage(el.getBoundingClientRect());
  const ox = Math.max(bw / 2 + 4, Math.min(W - bw / 2 - 4, (cur.l + cur.r) / 2)), oy = cur.t;
  if (hit((cur.l + cur.r) / 2, cur.t) === 0) return;   // already in a free spot
  let best = null;
  for (const cx of [ox, W / 2, W * 0.3, W * 0.7, bw / 2 + 8, W - bw / 2 - 8]) {
    const x = Math.max(bw / 2 + 4, Math.min(W - bw / 2 - 4, cx));
    for (let y = 6; y <= H2 - bh - 6; y += 6) {
      const a = hit(x, y), d = Math.abs(x - ox) * 0.6 + Math.abs(y - oy);
      const s = a * 1000 + d;
      if (!best || s < best.s) best = { s, x, y };
    }
  }
  if (!best) return;
  el.className = 'coach ' + (hl ? ((best.y + bh / 2) < (toStage(hl.getBoundingClientRect()).t + toStage(hl.getBoundingClientRect()).b) / 2 ? 'down' : 'up') : 'notail');
  el.style.width = bw + 'px';   // keep the measured width: shrink-to-fit would squeeze a bubble moved near the right edge into a thin column
  el.style.right = ''; el.style.transform = ''; el.style.left = Math.round(best.x) + 'px'; el.style.top = Math.round(best.y) + 'px';
}
let coverScreen = false, coverSkip = 0, coverDt = 0;
function setScreen(html, cls = '') {
  hideCoach();
  if (html) { const bn = document.getElementById('banner'); if (bn) bn.className = ''; }   // a banner left under a blurred panel shows up as a mirrored ghost
  screenEl.innerHTML = html ? `<div class="screen ${cls}">${html}</div>` : '';
  document.body.classList.toggle('scr', !!html);       // the HUD steps back while a menu is open
  coverScreen = !!html && !/\bclear\b/.test(cls);   // a dimmed, blurred menu hides the scene (the title is 'clear' and keeps it moving)
  paintThumbs(screenEl);
  if (html) {   // a labelled dialog that takes focus: keyboard and screen reader players learn that a menu opened
    const s = screenEl.firstElementChild, h = s.querySelector('h2, .logo');
    s.setAttribute('role', 'dialog'); s.setAttribute('aria-label', (h && (h.classList.contains('logo') ? 'Stacking Cats' : h.textContent.trim())) || 'Menu'); s.tabIndex = -1;
    try { s.focus({ preventScroll: true }); } catch (e) { /* focus is a nicety */ }
  }
  // clickable divs (tower slots, items) get button semantics so keyboard and screen reader players can reach them
  for (const el of screenEl.querySelectorAll('[data-act]:not(button)')) { el.setAttribute('role', 'button'); el.tabIndex = 0; }
}
const closeScreen = () => setScreen('');
// press ripple: a small ring where the finger or cursor lands on a button (CSS animates it, skipped under reduced motion)
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest && e.target.closest('.btn, .seg button');
  if (!b || b.hasAttribute('disabled') || !save.opt.motion || document.body.classList.contains('nomotion')) return;
  const r = b.getBoundingClientRect(), sp = document.createElement('span');
  sp.className = 'rip'; sp.setAttribute('aria-hidden', 'true');
  sp.style.left = (e.clientX - r.left) + 'px'; sp.style.top = (e.clientY - r.top) + 'px';
  b.appendChild(sp); setTimeout(() => sp.remove(), 480);
});
screenEl.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-act]:not(button)')) { e.preventDefault(); e.stopPropagation(); e.target.click(); }
});
screenEl.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t || t.hasAttribute('disabled')) return;
  sfx.unlock(); sfx.music(sfx.mode);
  const fn = acts[t.dataset.act];
  if (fn) { sfx.play(t.dataset.act === 'back' ? 'back' : 'ui'); buzz('ui'); fn(t.dataset, t); }
});
let lastHover = null;
screenEl.addEventListener('pointerover', (e) => { const t = e.target.closest('[data-act]'); if (t && t !== lastHover) { lastHover = t; sfx.play('hover'); } });
// cards tilt toward the pointer
screenEl.addEventListener('pointermove', (e) => {
  const c = e.target.closest('.card');
  if (!c) return;
  const r = c.getBoundingClientRect();
  c.style.setProperty('--ry', ((e.clientX - r.left) / r.width - 0.5) * 14 + 'deg');
  c.style.setProperty('--rx', -((e.clientY - r.top) / r.height - 0.5) * 12 + 'deg');
});
screenEl.addEventListener('pointerout', (e) => { const c = e.target.closest && e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); } });

const stars = (n) => '★'.repeat(n);
const owns = (id) => g && [...g.cats, ...g.bench].some((c) => c.id === id && c.lvl === 1);

// ---- helpers that show what a choice does
const STAT_LABEL = { dmg: 'Damage', haste: 'Attack speed', hp: 'Health', crit: 'Crit chance', range: 'Range', dr: 'Less damage taken', waveHeal: 'Healing per wave', slow: 'Mice slowed', curse: 'Mouse weakness', coin: 'Coins' };
const pc = (v, signed = true) => (signed && v >= 0 ? '+' : '') + Math.round(v * 100) + '%';
const num = (v) => (v >= 10000 ? (v / 1000).toFixed(0) + 'k' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)));
const teamDps = (mods) => g.cats.reduce((a, c) => a + S.estDps(c, mods), 0);
function dpsLine(before, after) {
  const d = after - before;
  if (Math.abs(d) < 0.5) return '';
  return `<div class="impact ${d > 0 ? 'up' : 'down'}"><span>Team DPS</span> &asymp; <b>${Math.round(before)}</b> &rarr; <b>${Math.round(after)}</b> <em>(${d > 0 ? '+' : ''}${Math.round((100 * d) / Math.max(1, before))}%)</em></div>`;
}
function catGain(id) {
  const m = S.calcMods(g), twin = [...g.cats, ...g.bench].find((c) => c.id === id && c.lvl === 1);
  const probe = (lvl) => S.estDps({ id, lvl, items: [] }, m);
  if (twin) {
    const gain = probe(2) - S.estDps(twin, m);
    return `<div class="impact up">Merge to Lv 2: <b>+${Math.round(g.cats.includes(twin) ? gain : probe(2))}</b> DPS</div>`;
  }
  if (g.cats.length < S.stackMax(g)) return `<div class="impact up">Adds <b>&asymp;${Math.round(probe(1))}</b> DPS</div>`;
  return `<div class="impact">Goes to the bench (&asymp;${Math.round(probe(1))} DPS)</div>`;
}
function snackImpact(id) {
  const s = SNACK_BY_ID[id], m = S.calcMods(g), sm = m.snackMul;
  if (s.kind === 'instant') {
    const all = g.cats.concat(g.bench);
    const heal = all.reduce((a, c) => a + Math.min(Math.max(0, S.catMaxHp(g, c) - c.hp), S.catMaxHp(g, c) * s.heal * sm), 0);
    return heal < 1 ? '<div class="impact">Everyone is at full health</div>' : `<div class="impact up">Heals <b>${num(heal)}</b> health right now</div>`;
  }
  if (s.nine) return `<div class="impact up">Nine Lives <b>${g.nineLives}</b> &rarr; <b>${g.nineLives + 1}</b></div>`;
  const live = s.kind === 'temp' && g.temp.some((t) => t.id === id);   // eatSnack only refreshes a snack that is already running, it never stacks
  if (live) return `<div class="impact">Already active: runs the full ${TEMP_WAVES} waves again</div>`;
  const m2 = { ...m };
  let lines = '';
  const CAP = { dr: 0.65, slow: 0.6 };   // calcMods caps these, so the preview must too
  for (const k in s.fx) {
    m2[k] = (m2[k] || 0) + s.fx[k] * sm;
    if (CAP[k]) m2[k] = Math.min(CAP[k], m2[k]);
    if (k === 'critMul') continue;   // counted in the Team DPS line, there is no stat row for it
    const sign = k === 'dr' || k === 'slow' ? false : true;
    lines += `<div class="impact"><span>${STAT_LABEL[k] || k}</span> <b>${pc(m[k], sign)}</b> &rarr; <b>${pc(m2[k], sign)}</b></div>`;
  }
  return lines + dpsLine(teamDps(m), teamDps(m2));
}
const rerollBtn = () => (g && g.meta.rerolls > 0 ? `<button class="btn small grey" data-act="reroll" ${g.rerolls > 0 ? '' : 'disabled'}>Reroll (${g.rerolls})</button>` : '');

function catCard(id, o = {}) {
  const d = CAT_BY_ID[id];
  return `<div class="card" data-act="${o.act || 'pickCat'}" data-id="${id}">${o.ribbon ? `<div class="ribbon">${o.ribbon}</div>` : ''}<canvas width="128" height="128" data-cat="${id}"></canvas><h3>${d.name}</h3><div class="ttl">${d.title}</div><div class="role">${d.role}</div><p>${d.desc}</p>${o.gain ? catGain(id) + synHint(id) : ''}</div>`;
}
function snackCard(id) {
  const s = SNACK_BY_ID[id];
  const kind = { perm: 'Whole run', temp: '3 waves', instant: 'Right now' }[s.kind];
  return `<div class="card snack" data-act="pickSnack" data-id="${id}"><div class="ic">${s.icon}</div><h3>${s.name}</h3><div class="kind k-${s.kind}">${kind}</div><p>${s.desc}</p>${snackImpact(id)}</div>`;
}
// the two notes under a relic: its set progress and the cat it helps most (loot cards, shop and shady deal)
function relicNotes(id) {
  if (!g) return '';
  const h = setHint(id, g.cats), r = S.relicGain(g, id), bits = [];
  if (r && r.dps >= 0.01) bits.push(`+${Math.round(r.dps * 100)}% damage`);
  if (r && r.bulk >= 0.03) bits.push(`tougher +${Math.round(r.bulk * 100)}%`);
  return (h ? `<div class="setl">${h}</div>` : '') + (bits.length ? `<div class="gainl">Best on ${CAT_BY_ID[r.cat].name}: ${bits.join(', ')}</div>` : '');
}
function itemCard(id, act = 'none') {
  const it = ITEM_BY_ID[id];
  return `<div class="card item r-${it.rarity}" data-act="${act}" data-id="${id}"><div class="rar">${it.rarity}</div><div class="ic">${it.icon}</div><h3>${it.name}</h3><p>${it.desc}</p>${relicNotes(id)}<div class="impact">Equip it on any cat</div></div>`;
}

const thumbURLs = new Map();
function thumbURL(id) {
  const tk = id + '|' + lookSig(save, id);
  let u = thumbURLs.get(tk);
  if (!u) { const c = document.createElement('canvas'); c.width = c.height = 48; c.getContext('2d').drawImage(catSprite(id), 0, 0, 48, 48); u = c.toDataURL(); thumbURLs.set(tk, u); }
  return u;
}

// the story cutscene: plays full screen over everything, once before the very first run and again from How to play
function watchIntro(then) {
  save.seenIntro = true; persist();
  sfx.unlock();
  playIntro(app, { cat: (id) => catSprite(id), sfx, motion: save.opt.motion, onDone: () => { then(); } });
}

function showTitle() {
  mode = 'title'; paused = false;
  titleStack = titleStackIds(save.unlocked, save.catStats);   // the title shows the player's own team
  const total = save.stats, k = save.kingdom, d = DIFFS[save.diff];
  const can = BUILDINGS.some((b) => buildingLevel(k, b.id) < b.max && k.coins >= upgradeCost(b.id, buildingLevel(k, b.id))) || WONDERS.some((w) => !k.wonders[w.id] && k.gems >= w.cost);
  const day = dayKey(), di = dayInfo(day), played = save.daily[day], streak = dailyStreak(save.daily);
  const trophies = ACHIEVEMENTS.filter((a) => save.ach[a.id]).length;
  setScreen(`
    <h1 class="logo">Stacking<span>Cats</span></h1>
    <div class="tag">${titleTag(!!save.storyDone, save.unlocked.length, CATS.length)}</div>
    <div class="row tgrid g4 gplay"><button class="btn big" data-act="play">Play</button><button class="btn small grey" data-act="diff" title="Change difficulty">${d.icon} ${d.name}</button><button class="btn small grey" data-act="story">Story</button></div>
    <div class="row tgrid g4"><button class="btn pink" data-act="daily">Daily ${di.mod.icon}${streak >= 2 ? `<span class="streak" title="${streak} days in a row">&#128293;${streak}</span>` : ''}${played ? '' : '<i class="bang">!</i>'}</button><button class="btn pink wk" data-act="weekly">Weekly &#127942;${save.weekly[weekKey()] ? '' : '<i class="bang">!</i>'}</button><button class="btn" data-act="dex">Cat Dex ${save.unlocked.length}/${CATS.length}</button><button class="btn" data-act="relics">Relics ${relicProgress(save.relics).got}/${ITEMS.length}</button></div>
    <div class="row tgrid g31"><button class="btn green" data-act="kingdom">Kingdom <span class="badge">&#129689; ${num(k.coins)}${k.gems ? ` &middot; &#128142; ${k.gems}` : ''}</span>${can ? '<i class="bang">!</i>' : ''}</button><button class="btn grey small" data-act="trophies">Trophies ${trophies}/${ACHIEVEMENTS.length}</button><button class="btn grey small" data-act="settings">Settings</button><button class="btn grey small" data-act="how">How to play</button></div>
    <button class="namechip" data-act="ranking" title="Open the ranking list">&#127942; ${save.name ? `${save.name.replace(/[<>&"]/g, '')} &middot; ` : ''}Ranking</button>
    <div class="hint">${total.runs ? `Best wave ${total.bestWave} &middot; ${total.kills} mice defeated &middot; ${total.bossKills} nests destroyed` : (coarse ? 'Tap the big pink Play button to start' : 'Click the big pink Play button, or press Enter, to start')}</div>`, 'clear tpad');
  acts = {
    relics: () => showRelics(showTitle),
    play: () => (save.seenIntro ? startRun() : watchIntro(() => startRun())), dex: () => showDex(showTitle), how: () => showHow(showTitle), kingdom: () => showKingdom(showTitle),
    daily: () => showDaily(showTitle), trophies: () => showTrophies(showTitle), settings: () => showSettings(showTitle),
    weekly: () => showDaily(showTitle, true), story: () => watchIntro(() => showTitle()),
    diff: () => showDiffPicker(showTitle), ranking: () => showRanking(showTitle),
  };
  setBackdrop(0);
  sfx.music('calm');
}

// ---------------------------------------------------------------- settings, with save backup
function showSettings(back, msg) {
  const o = save.opt;
  const seg = (key, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" data-act="opt" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const tog = (key, label, cur, hint = '') => `<button class="tog ${cur ? 'on' : ''}" data-act="tog" data-k="${key}"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><i></i></button>`;
  setScreen(`<h2>Settings</h2><div class="tbody"><div class="setgrid">
      <div class="setcol">
        <div class="setrow"><b>Difficulty</b>${seg('diff', [['cozy', 'Cozy'], ['normal', 'Normal'], ['hard', 'Hard']], save.diff)}<small>${DIFFS[save.diff].desc}</small></div>
        <div class="setrow"><b>Sound effects</b><input type="range" min="0" max="100" value="${Math.round(o.sfxVol * 100)}" data-r="sfxVol"></div>
        <div class="setrow"><b>Music</b><input type="range" min="0" max="100" value="${Math.round(o.musicVol * 100)}" data-r="musicVol"></div>
        <div class="setrow"><b>Screen shake</b>${seg('shake', [[0, 'Off'], [0.5, 'Low'], [1, 'Normal']], o.shake)}</div>
        <div class="setrow"><b>Graphics</b>${seg('quality', [['auto', 'Auto'], ['high', 'High'], ['low', 'Low']], o.quality)}<small>Low is lighter on older phones.</small></div>
      </div>
      <div class="setcol">
        ${tog('motion', 'Flashes and motion', o.motion, 'Turn off for calmer screens')}
        ${tog('colorblind', 'Colorblind friendly colors', o.colorblind, 'Blue, yellow and orange bars')}
        ${tog('bigText', 'Larger text', o.bigText)}
        ${tog('meows', 'Cat meows', o.meows !== false, 'Turn off to silence the cat voices')}
        ${tog('meowMusic', 'Meows in the music', o.meowMusic !== false, 'Turn off for the plain soundtrack')}
        ${tog('haptics', 'Vibration', o.haptics !== false, 'Short buzzes on hits, if your device has them')}
        ${tog('autoSpecial', 'Auto special moves', !!o.autoSpecial, 'Charged specials fire by themselves when mice are close')}
        ${tog('tutorial', 'Tutorial hints', o.tutorial, 'Little tips during your first runs')}
        ${canInstall() ? '<div class="setrow"><b>Install app</b><div class="row"><button class="btn small" data-act="install">Install Stacking Cats</button></div><small>Full screen, works offline.</small></div>' : isIosSafari() ? '<div class="setrow"><b>Install app</b><small>Share, then Add to Home Screen for full screen</small></div>' : ''}
        <div class="setrow"><b>Leaderboard name</b><input type="text" maxlength="12" value="${save.name.replace(/"/g, '')}" placeholder="Your name" data-n="1"></div>
        <div class="setrow"><b>Save backup</b><div class="row"><button class="btn small grey" data-act="export">Copy save code</button><button class="btn small grey" data-act="import">Restore from code</button></div>
        <small>${msg || 'Moves your cats, coins and trophies to another device.'}</small></div>
      </div></div></div>
    <div class="tfoot setfoot"><button class="btn small grey" data-act="tipsreset">Replay tutorial</button><button class="btn big2" data-act="back">Back</button><button class="btn small red" data-act="erase">Erase all progress</button></div>`, 'wide arr');
  screenEl.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => { save.opt[r.dataset.r] = r.value / 100; persist(); sfx.setVolumes(save.opt.sfxVol, save.opt.musicVol); if (r.dataset.r === 'sfxVol') sfx.play('coin'); }));
  screenEl.querySelectorAll('input[data-n]').forEach((r) => r.addEventListener('input', () => { save.name = r.value.replace(/[^\w \-.']/g, '').slice(0, 12); persist(); }));
  let erase = false;
  acts = {
    back,
    // the settings change in place (no rebuild), so the switch glides, the screen keeps its scroll and nothing replays its entrance
    opt: (d, el) => {
      if (d.k === 'diff') save.diff = d.v; else if (d.k === 'quality') { save.opt.quality = d.v; } else save.opt[d.k] = +d.v;
      persist(); applyOptions();
      if (!el || !el.isConnected) { showSettings(back); return; }
      el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
      if (d.k === 'diff') { const note = el.closest('.setrow').querySelector('small'); if (note) note.textContent = DIFFS[save.diff].desc; }
      sfx.play('pick', 1.1);
    },
    tog: (d, el) => {
      const on = !save.opt[d.k]; save.opt[d.k] = on; persist(); applyOptions();
      if (!el || !el.isConnected) { showSettings(back); return; }
      el.classList.toggle('on', on); el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip');
      sfx.play(on ? 'pick' : 'pip', on ? 1.3 : 0.75); buzz('tick');
    },
    install: () => { promptInstall().then(() => showSettings(back)); },
    tipsreset: () => { save.tips = {}; save.opt.tutorial = true; persist(); showSettings(back, 'Tutorial hints will show again.'); },
    export: () => {
      const code = encodeSave(save);
      setScreen(`<h2>Save code</h2><p class="sub">Copy this code and keep it safe. Paste it into Settings on another device to restore.</p><textarea class="code" readonly>${code}</textarea>
        <div class="row"><button class="btn" data-act="copy">Copy</button><button class="btn grey" data-act="download">Download file</button><button class="btn grey" data-act="again">Back</button></div>`);
      acts = {
        copy: () => { try { navigator.clipboard.writeText(code).then(() => toast('Save code copied!'), () => { const t = screenEl.querySelector('textarea'); t.select(); toast('Press Ctrl+C to copy'); }); } catch (e) { screenEl.querySelector('textarea').select(); } },
        download: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' })); a.download = 'stacking-cats-save.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); },
        again: () => showSettings(back),
      };
    },
    import: () => {
      setScreen(`<h2>Restore save</h2><p class="sub">Paste a save code. This replaces the progress on this device.</p><textarea class="code" placeholder="SC1:..."></textarea><div class="row"><button class="btn" data-act="go">Restore</button><button class="btn grey" data-act="again">Back</button></div>`);
      acts = {
        go: () => {
          const r = decodeSave(screenEl.querySelector('textarea').value);
          if (!r.ok) { toast(r.error); return; }
          save = adoptSave(r.save); persist(); applyOptions(); toast('Save restored!'); sfx.play('upgrade'); showSettings(back, 'Restored. Welcome back!');
        },
        again: () => showSettings(back),
      };
    },
    erase: () => {
      if (!erase) { erase = true; toast('Tap again to erase everything'); return; }
      save = freshSave(); persist(); applyOptions(); toast('Fresh start!'); showSettings(back);
    },
  };
}

// ---------------------------------------------------------------- trophies
// progress toward the trophies that count things across runs: id -> [now, goal]
function troProgress(id) {
  const st = save.stats || {};
  const m = {
    first: [st.kills, 1], hunter: [st.kills, 1000], exterm: [st.kills, 10000], nest1: [st.bossKills, 1], nest10: [st.bossKills, 10],
    w10: [st.bestWave, 10], w20: [st.bestWave, 20], w30: [st.bestWave, 30], w50: [st.bestWave, 50], merge5: [st.lvl3, 5],
    rich: [save.kingdom.earned, 5000], build15: [kingdomLevel(save.kingdom), 15], king: [st.bestWave, FINALE_WAVE], coll15: [save.unlocked.length, 15], coll30: [save.unlocked.length, CATS.length],
  }[id];
  return m ? [Math.min(m[1], m[0] || 0), m[1]] : null;
}
function troTier(a) { return a.gems >= 2 ? 'mythic' : a.gems ? 'legendary' : a.coins >= 100 ? 'epic' : a.coins >= 50 ? 'rare' : 'common'; }
function showTrophies(back) {
  const list = ACHIEVEMENTS.slice().sort((a, b) => (save.ach[b.id] ? 1 : 0) - (save.ach[a.id] ? 1 : 0));
  const done = list.filter((a) => save.ach[a.id]).length;
  setScreen(`<h2>Trophies <small class="klv">${done}/${list.length}</small><span class="dexhead"><span class="dexbar" aria-hidden="true"><i style="width:${Math.round(100 * done / list.length)}%"></i></span></span></h2>
    <div class="trophies">${list.map((a) => `<div class="tro t-${troTier(a)} ${save.ach[a.id] ? 'got' : ''}"><span class="medal">${save.ach[a.id] ? '&#127942;' : '&#128274;'}</span><div><b>${a.name}</b><small>${a.desc}</small>${(() => { const pr = !save.ach[a.id] && troProgress(a.id); return pr ? `<span class="tbar"><i style="width:${Math.round(100 * pr[0] / pr[1])}%"></i><u>${pr[0]}/${pr[1]}</u></span>` : ''; })()}</div><em>${a.coins ? `&#129689;${a.coins}` : ''}${a.gems ? ` &#128142;${a.gems}` : ''}</em></div>`).join('')}</div>
    <div class="row"><button class="btn" data-act="back">Back</button></div>`, 'wide');
  acts = { back };
}
function checkAch(run) {
  const out = [], c = { stats: save.stats, run, save, kingdom: save.kingdom };
  for (const a of ACHIEVEMENTS) {
    if (save.ach[a.id]) continue;
    let ok = false;
    try { ok = !!a.check(c); } catch (e) { ok = false; }
    if (ok) { save.ach[a.id] = Date.now(); save.kingdom.coins += a.coins; save.kingdom.earned += a.coins; save.kingdom.gems += a.gems; out.push(a); }
  }
  if (out.length) persist();
  return out;
}

function showHow(back) {
  const row = (ic, html) => `<li><span class="hi">${ic}</span><div>${html}</div></li>`;
  setScreen(`<h2>How to play</h2><ul class="how">
    ${row('\uD83D\uDC31', '<b>Your cats fight by themselves.</b> You do not need to tap to attack. Mice walk in from the right.')}
    ${row('\uD83D\uDEE1', '<b>The bottom cat gets bitten first.</b> Put a tough cat at the bottom and the shooters on top.')}
    ${row('\u26A1', '<b>Special moves.</b> Each cat has a round picture at the bottom right. When it glows, tap it. Tap AUTO to let the game do it.')}
    ${row('\uD83D\uDCA8', '<b>Zoomies.</b> Fighting fills the big round meter at the top right. When it says READY, tap it or press Space. Your cats get much faster for 6 seconds.')}
    ${row('\uD83C\uDFAF', '<b>Pick a target.</b> Tap a mouse and your cats shoot it first.')}
    ${row('\uD83D\uDC00', `<b>Nests.</b> Every ${BOSS_EVERY}th wave you fight a mouse nest. Destroy it to free a cat and win loot.`)}
    ${row('\u2728', `<b>Join two cats.</b> Two of the same cat join into one stronger cat (up to Lv 3). The tower holds ${MAX_STACK} cats and the bench holds ${MAX_BENCH}.`)}
    ${row('\uD83C\uDF81', '<b>Lootboxes.</b> A box holds a relic. A relic is an item that makes one cat stronger. Tap Equip it, then tap the cat that should wear it.')}
    ${row('\uD83E\uDE99', '<b>Coins</b> are saved. Spend them in the <b>Kingdom</b> (on the title screen) to make every new run stronger.')}
    ${row('\uD83D\uDD25', '<b>Cat teams.</b> Cats of the same kind help each other. Small badges next to the wave number show these bonuses.')}
    ${row('\uD83D\uDC3E', '<b>Roads.</b> After each nest you choose the road to walk next. A harder road gives better rewards.')}
    ${row('\u2764', '<b>Pet your cats.</b> Tap a cat to hear it meow. Hold it to hear it purr.')}
    ${row('\uD83C\uDFC6', '<b>Daily Challenge.</b> Everyone plays the same game once a day. Try to reach a high place in the ranking.')}
    ${row('\uD83D\uDC1A', '<b>Dodge.</b> Pearl and the Lucky Shell give a cat a chance to dodge a bite. A dodged bite does no damage.')}</ul>
    <div class="row"><button class="btn" data-act="back">Got it</button><button class="btn grey" data-act="intro">Watch the intro</button></div>`);
  acts = { back, intro: () => watchIntro(() => showHow(back)) };
}

// ---------------------------------------------------------------- the Cat Dex, with how much each cat has done
function showDex(back, sel0) {
  const un = new Set(save.unlocked);
  let sel = sel0 || null;
  const fav = Object.entries(save.catStats).sort((a, b) => b[1].runs - a[1].runs)[0];
  const draw = () => {
    setScreen(`<h2>Cat Dex <span class="dexhead"><small class="klv dexh">${un.size}/${CATS.length}</small><span class="dexbar" aria-hidden="true"><i style="width:${Math.round(100 * un.size / CATS.length)}%"></i></span></span></h2><div class="dex">${CATS.map((d) => {
      const u = un.has(d.id), p = unlockProgress(d, save.stats);
      return `<div class="tile ${u ? '' : 'locked'} ${sel === d.id ? 'sel' : ''}" data-act="tile" data-id="${d.id}"><canvas width="96" height="96" data-cat="${d.id}" ${u ? '' : 'data-lock="1"'}></canvas><b${u && d.name.length > 9 ? ' class="lg"' : ''}>${u ? d.name : '???'}</b>${u ? `<small>${d.role}</small>` : `<small>${p.need > 1 ? `${p.have}/${p.need}` : p.have ? 'Done' : 'Caged'}</small>${p.need > 1 ? `<span class="tpb"><i style="width:${Math.min(100, Math.round(100 * p.have / p.need))}%"></i></span>` : ''}`}${fav && fav[0] === d.id && u ? '<i class="fav">&#10084;</i>' : ''}</div>`;
    }).join('')}</div>
    <div class="detail dexd ${sel ? 'dx' : ''}">${sel ? dexDetail(sel, un.has(sel)) : 'Tap a cat to see how to unlock it, or how it has done for you. Locked cats join the picks once you earn them.'}</div>
    <div class="row"><button class="btn" data-act="back">Back</button></div>`);
  };
  draw();
  acts = { back, tile: (d) => { sel = d.id; draw(); sfx.meow(d.id, 'pick'); }, wardrobe: (d) => showWardrobe(() => showDex(back, d.id), d.id) };
}
// Dex portrait plate: cats have no stored rarity, so the tint follows how hard the cat is to get (starters, then thirds of the unlock list)
const ATK_NAME = { melee: 'Melee', proj: 'Ranged', lob: 'Lobber', cone: 'Flame cone', chain: 'Chain', beam: 'Beam', strike: 'Strike', nova: 'Nova', mine: 'Mines', storm: 'Storm', spread: 'Spread' };
function dexTier(id) {
  const ids = CATS.filter((c) => c.unlock).map((c) => c.id), i = ids.indexOf(id);
  return i < 0 ? 'common' : i < ids.length / 3 ? 'rare' : i < (2 * ids.length) / 3 ? 'epic' : 'legendary';
}
const dexPlate = (id, locked) => `<div class="dxplate dx-${dexTier(id)} ${locked ? 'lock' : ''}"><canvas width="192" height="192" data-cat="${id}" ${locked ? 'data-lock="1"' : ''} aria-hidden="true"></canvas></div>`;
function dexDetail(id, unlocked) {
  const d = CAT_BY_ID[id];
  if (unlocked) {
    const s = save.catStats[id], sp = S.specialInfo(id), tg = (CAT_TAGS[id] || []).map((t) => `<span class="dxtg tag">${SYNERGIES[t].icon} ${SYNERGIES[t].name}</span>`).join('');
    const st = s ? [['Best wave', s.best], ['Runs', s.runs], ['Mice', num(s.kills)]].map(([k, v]) => `<span class="dxstat"><b>${v}</b>${k}</span>`).join('') : '<span class="dxstat dxnone">Not used yet</span>';
    return `${dexPlate(id, false)}<div class="dxtxt"><div class="dxname"><b>${d.name}</b> <span>${d.title}</span></div>
      <div class="dxtags"><span class="dxtg drole">${d.role}</span><span class="dxtg datk">${ATK_NAME[d.atk.t] || d.atk.t}</span>${tg}</div>
      <i class="cstory">${catStory(id)}</i>
      <div class="dxstats">${st}${s ? `<span class="dxstat"><b>${num(s.dmg)}</b>Damage</span>` : ''}</div>
      <small class="spnote">${d.desc} Special: <b>${sp.name}</b>. ${SPECIAL_TEXT[sp.kind] || ''}</small>${masteryHtml(id)}</div><button class="btn small wbtn" data-act="wardrobe" data-id="${id}">Wardrobe</button>`;
  }
  const p = unlockProgress(d, save.stats);
  return `${dexPlate(id, true)}<div class="dxtxt"><div class="dxname"><b>Still caged!</b></div>
    <div class="dxtags"><span class="dxtg lockc">Locked</span></div>
    <span class="cstory">The Gnaw Army locked this cat in a nest. To free it: ${d.unlock.text}${p.need > 1 ? ` (${p.have}/${p.need})` : ''}.</span>
    <div class="dxprog"><div class="pbar"><i style="width:${(100 * p.have) / p.need}%"></i></div><span>${p.need > 1 ? `${p.have} / ${p.need}` : p.have ? 'Done' : 'Not yet'}</span></div></div>`;
}

// ---------------------------------------------------------------- the Relic Book
function showRelics(back, sel0) {
  let sel = sel0 || null;
  const draw = () => {
    const oldTop = (screenEl.querySelector('.relbook') || {}).scrollTop || 0;   // keep the scroll position when a tile is picked
    const pr = relicProgress(save.relics);
    const rows = RARITIES.slice().reverse().map((r) => {
      const tiles = ITEMS.filter((it) => it.rarity === r).map((it) => { const f = !!save.relics[it.id]; return `<button class="rtile r-${r} ${f ? '' : 'locked'} ${sel === it.id ? 'sel' : ''}" data-act="rtile" data-id="${it.id}" aria-label="${f ? `${it.name}, ${r}` : `Unknown ${r} relic`}" title="${f ? it.name : '???'}"><span class="ic">${it.icon}</span></button>`; }).join('');
      return `<div class="rrow"><div class="rlabel r-${r}"><b>${r}</b><small>${pr.by[r].got}/${pr.by[r].total}</small></div><div class="rtiles">${tiles}</div></div>`;
    }).join('');
    const it = sel && ITEM_BY_ID[sel];
    const detail = !it ? 'Tap a relic to read what it does. Relics you have owned in a run are written into the book, the rest are shadows.'
      : save.relics[it.id] ? `<b>${it.icon} ${it.name}</b> <span class="rar ${it.rarity}">${it.rarity}</span><br>${it.desc}.${RELIC_SETS.filter((x) => x.ids.includes(it.id)).map((x) => `<br><small>Set: ${x.name}. Carry ${SET_NEED} of its relics and ${x.desc}, ${SET_DOUBLE} double it.</small>`).join('')}`
        : `<b>A ${it.rarity} relic you have not found yet.</b><br>Relics come out of lootboxes, turn up in shops and deals, and three of a kind forge into the next tier.`;
    setScreen(`<h2>Relic Book <small class="klv">${pr.got}/${pr.total} found</small></h2><div class="relbook">${rows}</div><div class="detail dexd relde">${detail}</div><div class="row"><button class="btn" data-act="back">Back</button></div>`, 'wide');
    const rb = screenEl.querySelector('.relbook'); if (rb && oldTop) rb.scrollTop = oldTop;
  };
  draw();
  acts = { back, rtile: (d) => { sel = d.id; draw(); sfx.play('hover'); } };
}

// ---------------------------------------------------------------- the daily challenge
function showDaily(back, weekly = false) {
  const day = weekly ? weekKey() : dayKey(), di = weekly ? weekInfo(day) : dayInfo(day), mine = (weekly ? save.weekly : save.daily)[day];
  const modsHtml = weekly ? `<div class="wmods">${di.mods.map((m) => `<span class="wmod"><i>${m.icon}</i><b>${m.name}</b><small>${m.desc}</small></span>`).join('')}</div>` : '';
  setScreen(`<h2>${weekly ? 'Weekly Challenge' : 'Daily Challenge'}</h2>
    <div class="dailycols"><div class="dcard ${weekly ? 'weekly' : ''}"><div class="dic">${di.mod.icon}</div><b>${di.mod.name}</b>${weekly ? modsHtml + '<p class="wiron">Mice have 10% more health on top.</p>' : `<p>${di.mod.desc}</p>`}
      <small>${weekly ? 'Everyone gets the same mice and cats all week. Kingdom upgrades are off, so the race is fair.' : 'Everyone gets the same mice and cats today. Kingdom upgrades are off, so the race is fair. Cats: the 3 starters, Yuki, Hawkeye, Boomer, Pudding, Shadow, Ronin, Merlin and Cutlass.'}</small>
      <div class="dstat">${mine ? `Your best ${weekly ? 'this week' : 'today'}: <b>${mine.best}</b> (wave ${mine.wave})` : `You have not played ${weekly ? 'this week' : 'today'} yet. Reach wave ${weekly ? 15 : 12} on your first try to win a gem.`}${!weekly && dailyStreak(save.daily) >= 2 ? ` <span class="streakline">&#128293; ${dailyStreak(save.daily)} days in a row</span>` : ''}</div>
      <div class="row"><button class="btn big" data-act="go">Play ${weekly ? 'weekly' : 'daily'}</button></div></div>
      <div class="board"><h4>${weekly ? "This week's top cats" : "Today's top cats"}</h4><div id="boardBody" class="bbody">Loading...</div></div></div>
    <div class="row"><button class="btn grey" data-act="back">Back</button></div>`);
  acts = { back, go: () => startRun({ daily: !weekly, weekly }) };
  fetchBoard(day, undefined, undefined, weekly).then((r) => {
    const el = $('boardBody');
    if (!el || !el.isConnected) return;
    el.innerHTML = r.ok ? boardHtml(r.top) : '<small>The ranking list cannot load right now. You can still play!</small>';
  });
}
// ---------------------------------------------------------------- username and the ranking list
function showNamePrompt(next) {
  save.nameAsked = true; persist();
  setScreen(`<h2>Pick your name</h2><p class="sub">Your name shows up in the rankings, so everyone can see how high your stack goes.</p>
    <div class="namebox"><input type="text" maxlength="12" value="${save.name.replace(/[<>&"]/g, '')}" placeholder="Your name" data-n="1" autocomplete="off" autocapitalize="words" spellcheck="false"><button class="btn small grey" data-act="suggest">Surprise me</button></div>
    <small class="namemsg" id="nameMsg">2 to 12 letters, numbers, spaces</small>
    <div class="row"><button class="btn big" data-act="savename">Save name</button><button class="btn grey" data-act="later">${save.name ? 'Cancel' : 'Later'}</button></div>`);
  const inp = screenEl.querySelector('input[data-n]'), msg = $('nameMsg');
  const save1 = () => {
    const v = cleanName(inp.value);
    if (!nameOk(v)) { msg.textContent = v.length < 2 ? 'Use at least 2 characters' : 'Please pick a friendlier name'; msg.classList.add('bad'); inp.classList.remove('shakeno'); void inp.offsetWidth; inp.classList.add('shakeno'); sfx.play('nope'); return; }
    save.name = v; persist(); sfx.play('achieve', 1.2); buzz('pop');
    if (motionOn()) { const rc = inp.getBoundingClientRect(); domBurst(rc.left + rc.width / 2, rc.top + rc.height / 2, 22, ['#ffd23f', '#fff', '#ff8fb7'], 'WELCOME!'); }
    setTimeout(next, motionOn() ? 650 : 0);
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save1(); } });
  inp.addEventListener('input', () => { msg.classList.remove('bad'); msg.textContent = '2 to 12 letters, numbers, spaces'; });
  acts = { savename: save1, later: next, suggest: () => { inp.value = suggestName(); msg.classList.remove('bad'); sfx.play('pick'); } };
}
function showRanking(back) {
  const tab = { all: 'All time', day: 'Today', week: 'This week' };
  let cur = 'all', data = null;
  const draw = () => {
    const list = !data ? null : cur === 'all' ? data.all : cur === 'day' ? data.day : data.week;
    const rows = list === null ? 'Loading...' : !list ? '<small>The ranking is offline right now. Your name is saved, so it will show up later.</small>'
      : !list.length ? '<small>Nobody is on this list yet. Be the first!</small>'
        : list.slice(0, 25).map((e, i) => `<div class="brow rk ${e.name === save.name ? 'me' : ''} ${i < 3 ? 'p' + (i + 1) : ''}"><span>${i + 1}</span><b>${String(e.name).replace(/[<>&"]/g, '')}</b><em>wave ${e.wave}</em><strong>${e.score}</strong></div>`).join('');
    const mine = list && save.name ? rankOf(list, save.name) : 0;
    $('rankBody').innerHTML = rows;
    $('rankMe').innerHTML = save.name ? (mine ? `You are <b>#${mine}</b> on this list` : 'Play a run to get on this list') : '<button class="btn small" data-act="rename">Pick a name to join</button>';
    screenEl.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === cur));
  };
  setScreen(`<h2>Ranking</h2><div class="seg rktabs">${Object.entries(tab).map(([k, l]) => `<button class="${k === cur ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="board rkboard"><div id="rankBody" class="bbody rkbody">Loading...</div></div>
    <div class="rkfoot"><span id="rankMe"></span><button class="btn small grey" data-act="rename">${save.name ? `Name: ${save.name.replace(/[<>&"]/g, '')}` : 'Pick a name'}</button></div>
    <div class="row"><button class="btn grey" data-act="back">Back</button></div>`);
  acts = { back, tab: (d) => { cur = d.v; sfx.play('hover'); draw(); }, rename: () => showNamePrompt(() => showRanking(back)) };
  draw();
  Promise.all([fetchBoard(dayKey()), fetchBoard(weekKey(), undefined, undefined, true)]).then(([d, w]) => {
    if (!screenEl.querySelector('#rankBody')) return;
    data = d.ok ? { all: d.all, day: d.top, week: w.ok ? w.top : [] } : { all: false, day: false, week: false };
    draw();
  });
}
function boardHtml(top, me) {
  if (!top.length) return '<small>No scores yet today. Be the first!</small>';
  return top.slice(0, 10).map((e, i) => `<div class="brow ${e.name === (me || save.name) ? 'me' : ''}"><span>${i + 1}</span><b>${e.name}</b><em>wave ${e.wave}</em><strong>${e.score}</strong></div>`).join('');
}

// ================================================================ META 2 screens: difficulty ladder, mastery notes, wardrobe
const ROMAN_N = ['', 'I', 'II', 'III', 'IV', 'V'];
function metaNotes(r) {
  const bits = [];
  if (r.ladderClear) bits.push(`&#9760; Nightmare ${ROMAN_N[r.ladderClear]} cleared!${r.ladderClear < 5 ? ` Nightmare ${ROMAN_N[r.ladderClear + 1]} is open. &#128142; +1` : ' You beat the whole ladder!'}`);
  for (const m of r.mastered || []) bits.push(`&#9733; ${CAT_BY_ID[m.id].name} reached Mastery ${m.lv}${m.lv >= MASTERY_MAX ? ' and earned the Master\'s Medal' : ''}`);
  return bits.length ? `<div class="metanotes">${bits.map((b) => `<span>${b}</span>`).join('')}</div>` : '';
}
function diffLockText(id) {
  const t = ladderTier(id);
  return t === 1 ? `Reach wave ${LADDER_WAVE[0]} on Hard` : `Reach wave ${LADDER_WAVE[t - 1]} on Nightmare ${ROMAN_N[t - 1]}`;
}
function showDiffPicker(back) {
  const card = (id) => {
    const d = DIFFS[id], t = ladderTier(id), ok = diffAllowed(save, id), on = save.diff === id;
    const rules = t ? LADDER_RULES.filter((r) => r.tier <= t).map((r) => `<span class="drule ${r.tier === t ? 'new' : ''}" title="${r.name}"><i>${r.icon}</i>${r.tier === t ? `<b>${r.name}</b>` : ''}</span>`).join('') : '';
    const body = t ? `<small>${d.rule.desc}</small>` : `<small>${d.desc}</small>`;
    return `<button class="dcell ${on ? 'on' : ''} ${ok ? '' : 'locked'} ${t ? 'nm' : ''}" data-act="${ok ? 'pick' : 'locked'}" data-id="${id}"><span class="dci">${ok ? d.icon : '&#128274;'}</span><b>${d.name}</b>${rules ? `<div class="drules">${rules}</div>` : ''}${body}${ok ? '' : `<em>${diffLockText(id)}</em>`}${t && ok ? `<em class="coinx">Coins x${d.coin}</em>` : ''}</button>`;
  };
  setScreen(`<h2>Difficulty</h2><p class="sub">Clear Hard, then climb the Nightmare ladder. Each tier keeps every rule below it.</p>
    <div class="dgrid">${DIFF_ORDER.map(card).join('')}</div>
    <div class="row"><button class="btn" data-act="back">Done</button></div>`);
  acts = {
    back, locked: () => {},
    pick: (d) => { save.diff = d.id; persist(); showDiffPicker(back); },
  };
}

function trimSpritePreviews() {
  for (const k of [...catSprites.keys()]) {
    const i = k.indexOf('|');
    if (i < 0) continue;
    const id = k.slice(0, i).split(':')[0];
    if (k.slice(i + 1) !== lookSig(save, id)) catSprites.delete(k);
  }
}
const starsHtml = (lv) => Array.from({ length: MASTERY_MAX }, (_, i) => `<i class="st ${i < lv ? 'on' : ''}">&#9733;</i>`).join('');
function masteryHtml(id) {
  const p = masteryProgress(save.catStats[id]), b = masteryBonus(p.lv);
  return `<div class="mast"><b>Mastery</b><span class="stars">${starsHtml(p.lv)}</span><div class="mbar"><i style="width:${p.pct}%"></i></div>
    <small>Grows when this cat fights: ${p.to == null ? `${num(p.xp)} points, top level` : `${num(p.xp)} / ${num(p.to)} points`}${p.lv > 1 ? ` &middot; now +${Math.round(b.dmg * 100)}% damage and +${Math.round(b.hp * 100)}% health` : ' &middot; each level gives a little more damage'}${p.lv >= MASTERY_MAX ? ' &middot; Medal unlocked' : ''}</small></div>`;
}
function showWardrobe(back, startCat) {
  const list = CATS.filter((c) => save.unlocked.includes(c.id));
  let cat = startCat && save.unlocked.includes(startCat) ? startCat : list[0].id, slot = 'head';
  const mlv = () => masteryProgress(save.catStats[cat]).lv;
  const draw = () => {
    const look = lookOf(save, cat), k = save.kingdom, lv = mlv();
    const items = COSMETICS.filter((c) => c.slot === slot);
    const tile = (c) => {
      const worn = look[c.slot] === c.id, can = canWear(save, c.id, lv), afford = k.coins >= c.cost;
      const act = c.mastery ? (can ? 'Wear' : `Mastery ${c.mastery}`) : can ? (worn ? 'Take off' : 'Wear') : `Buy &#129689; ${c.cost}`;
      const dis = c.mastery ? !can : (!can && !afford);
      return `<div class="witem ${worn ? 'worn' : ''}"><canvas width="120" height="120" data-try="${c.id}"></canvas><b>${c.name}</b><small>${c.desc}</small><button class="btn small ${can ? (worn ? 'grey' : 'green') : afford ? '' : 'grey'}" data-act="item" data-id="${c.id}" ${dis ? 'disabled' : ''}>${worn ? 'Worn' : act}</button></div>`;
    };
    setScreen(`<h2>Wardrobe</h2><div class="kcoins"><span>&#129689;</span> <b>${num(k.coins)}</b> <small>Outfits are only for looks. They do not make a cat stronger. Each cat can wear one hat, one pair of glasses and one neck piece.</small></div>
      <div class="wstrip">${list.map((c) => `<button class="wcat ${c.id === cat ? 'sel' : ''}" data-act="cat" data-id="${c.id}" title="${c.name}"><canvas width="48" height="48" data-cat="${c.id}"></canvas></button>`).join('')}</div>
      <div class="wcols"><div class="wprev"><canvas width="240" height="240" data-cat="${cat}"></canvas><b>${CAT_BY_ID[cat].name}</b>${masteryHtml(cat)}
        <div class="wworn">${SLOTS.map((s) => `<span>${SLOT_NAMES[s]}: ${look[s] ? COSMETIC_BY_ID[look[s]].name : 'none'}</span>`).join('')}</div>
        <button class="btn small grey" data-act="strip" ${look.head || look.face || look.neck ? '' : 'disabled'}>Take everything off</button></div>
        <div class="wshop"><div class="seg">${SLOTS.map((s) => `<button class="${s === slot ? 'on' : ''}" data-act="slot" data-id="${s}">${SLOT_NAMES[s]}</button>`).join('')}</div>
          <div class="wgrid">${items.map(tile).join('')}</div></div></div>
      <div class="row"><button class="btn" data-act="back">Back</button></div>`, 'wardrobe');
    screenEl.querySelectorAll('canvas[data-try]').forEach((cv2) => {
      const c = COSMETIC_BY_ID[cv2.dataset.try], spr = catSprite(cat, 'open', { ...look, [c.slot]: c.id });
      const x = cv2.getContext('2d'), crop = [24, 8, 192, 192];
      x.drawImage(spr, crop[0], crop[1], crop[2], crop[3], 0, 0, 120, 120);
    });
    // the strip is redrawn on every pick, so keep the chosen cat in view (31 cats do not fit in one row)
    const on = screenEl.querySelector('.wcat.sel'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  };
  draw();
  acts = {
    back: () => { trimSpritePreviews(); back(); },
    cat: (d) => { cat = d.id; trimSpritePreviews(); draw(); sfx.meow(cat, 'pick'); },
    slot: (d) => { slot = d.id; draw(); },
    strip: () => { delete save.wardrobe[cat]; persist(); trimSpritePreviews(); draw(); },
    item: (d) => {
      const c = COSMETIC_BY_ID[d.id];
      if (!canWear(save, d.id, mlv())) {
        if (!buyCosmetic(save, d.id)) return;
        sfx.play('upgrade'); toast(`${c.name} bought!`);
      }
      toggleWear(save, cat, d.id, mlv());
      persist(); trimSpritePreviews(); draw();
    },
  };
}

// ---------------------------------------------------------------- the Cat Kingdom: a village you can tap
let kScene = null, kNav = null, bestShown = false, heartAt = 0, quitArmed = 0;
const worried = new Set();   // cats that already gave their worried mew
const villageCat = () => titleStack[Math.floor(Math.random() * titleStack.length)];   // some cat of the kingdom gives a little cheer
function showKingdom(back, selected) {
  if (kScene) { kScene.stop(); kScene = null; }
  kNav = null;
  const k = save.kingdom;
  let sel = selected || null;
  const detail = () => {
    if (!sel) {
      const up = cheapestUpgrade(k);
      if (up) return `<div class="kd hint2">You have enough coins to upgrade the <b>${BUILDING_BY_ID[up].name}</b> ${BUILDING_BY_ID[up].icon}. Tap it, then tap the green Upgrade button.</div>`;
      const wd = affordableWonder(k);
      if (wd) return `<div class="kd hint2">You have enough gems for the <b>${WONDER_BY_ID[wd].name}</b> ${WONDER_BY_ID[wd].icon}. Tap the floating wonder, then tap the green Buy button.</div>`;
    }
    if (!sel) return `<div class="kd hint2">${kingdomLine(kingdomLevel(k))} Tap a building to see what it does. Tap a floating wonder to buy it with gems.` + (coarse ? '' : ' With a keyboard, use the arrow keys to move and Enter to buy.') + '</div>';
    if (sel.type === 'wonder') {
      const w = WONDER_BY_ID[sel.id], owned = !!k.wonders[w.id], afford = !owned && k.gems >= w.cost;
      return `<div class="kd"><span class="kic">${w.icon}</span><div class="kt"><b>${w.name}</b><small>${w.desc}</small></div><button class="btn small ${afford ? 'green' : 'grey'}" data-act="buyw" data-id="${w.id}" ${afford ? '' : 'disabled'}>${owned ? 'Built' : `Buy &#128142; ${w.cost}`}</button></div>`;
    }
    const b = BUILDING_BY_ID[sel.id], l = buildingLevel(k, b.id), maxed = l >= b.max, cost = maxed ? 0 : upgradeCost(b.id, l), afford = !maxed && k.coins >= cost;
    return `<div class="kd"><span class="kic">${b.icon}</span><div class="kt"><b>${b.name} <span class="pips">${Array.from({ length: b.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</span></b><small>${l ? `Now: ${b.text(l)}` : b.blurb}</small>${maxed ? '<small class="nx">Fully upgraded!</small>' : `<small class="nx">Next: ${b.text(l + 1)}</small>`}</div><button class="btn small ${afford ? 'green' : 'grey'}" data-act="buy" data-id="${b.id}" ${afford ? '' : 'disabled'}>${maxed ? 'Complete' : `${l ? 'Upgrade' : 'Build'} &#129689; ${cost}`}</button></div>`;
  };
  setScreen(`<h2>Cat Kingdom <small class="klv">Lv ${kingdomLevel(k)}</small></h2>
    <div class="kcoins"><span>&#129689;</span> <b>${num(k.coins)}</b> <span class="gem">&#128142;</span> <b>${k.gems}</b> <small>${num(k.earned)} coins earned so far. Coins pay for upgrades. Gems pay for wonders.</small></div>
    <canvas id="kscene" width="1840" height="512" role="img" aria-label="Your cat village. Use the left and right arrow keys to move between buildings and wonders, Enter to buy."></canvas><div id="kdetail" aria-live="polite">${detail()}</div>
    <div class="ktip">${KINGDOM_TIPS[Math.floor(k.earned / 50) % KINGDOM_TIPS.length]}</div>
    <div class="row"><button class="btn" data-act="back">Back</button><button class="btn pink" data-act="wardrobe">Wardrobe</button></div>`, 'kingdom');
  const refresh = () => { const el = $('kdetail'); if (el) el.innerHTML = detail(); };
  kScene = createKingdomScene($('kscene'), () => save.kingdom, (hit) => { sel = hit; sfx.play('ui'); refresh(); });
  if (sel) kScene.select(sel);
  // keyboard: arrows walk through the buildings then the wonders, Enter buys (the buy button is the screen's green button)
  const order = [...BUILDINGS.map((b) => ({ type: 'building', id: b.id })), ...WONDERS.map((w) => ({ type: 'wonder', id: w.id }))];
  kNav = (step) => {
    const at = sel ? order.findIndex((o) => o.type === sel.type && o.id === sel.id) : -1;
    sel = order[at < 0 ? (step > 0 ? 0 : order.length - 1) : (at + step + order.length) % order.length];
    kScene.select(sel); sfx.play('ui'); refresh();
  };
  acts = {
    back: () => { if (kScene) { kScene.stop(); kScene = null; } kNav = null; back(); },
    wardrobe: () => { if (kScene) { kScene.stop(); kScene = null; } kNav = null; showWardrobe(() => showKingdom(back)); },
    buy: (d) => {
      const b = BUILDING_BY_ID[d.id];
      if (buyUpgrade(save.kingdom, d.id)) {
        persist(); sfx.play('upgrade'); sfx.meow(villageCat(), 'cheer', 0.12); toast(`${b.icon} ${b.name} is now Lv ${buildingLevel(save.kingdom, d.id)}!`);
        { const r = (screenEl.querySelector('[data-act=buy]') || screenEl).getBoundingClientRect(); domBurst(r.left + r.width / 2, r.top + r.height / 2, 22, ['#ffd23f', '#fff', '#ff8fb7', '#8fe0b4'], 'LEVEL UP!'); buzz('pop'); }
        const ach = checkAch({ ...(g ? g.run : {}), wave: 0 });
        for (const a of ach) toast(`Trophy: ${a.name}!`);
        kScene.bump(d.id);
        showKingdom(back, { type: 'building', id: d.id });
        if (kScene) kScene.bump(d.id);
      }
    },
    buyw: (d) => {
      const w = WONDER_BY_ID[d.id];
      if (buyWonder(save.kingdom, d.id)) { { const r = (screenEl.querySelector('[data-act=buyw]') || screenEl).getBoundingClientRect(); domBurst(r.left + r.width / 2, r.top + r.height / 2, 30, ['#9fd4ff', '#fff', '#ffd23f', '#e7a0ff'], 'BUILT!'); buzz('jackpot'); } persist(); sfx.play('upgrade'); sfx.meow(villageCat(), 'cheer', 0.12); toast(`${w.icon} ${w.name} built!`); showKingdom(back, { type: 'wonder', id: d.id }); }
    },
  };
}

// ---------------------------------------------------------------- run flow
let startTotal = START_CATS, maxComboRun = 0;
function startRun(opts = {}) {
  worried.clear();
  sfx.unlock();
  const daily = opts.weekly ? weekInfo(weekKey()) : opts.daily ? dayInfo(dayKey()) : null;
  if (!diffAllowed(save, save.diff)) save.diff = 'hard';
  g = S.newGame({ seed: (Math.random() * 2147483647) | 0, unlocked: [...save.unlocked], kingdom: save.kingdom, difficulty: save.diff, daily, mastery: masteryMap(save.catStats) });
  if (opts.weekly) g.run.weekly = true;
  startTotal = START_CATS + g.meta.startPicks;
  setsSeen = {}; runNewRelics = 0; runCommitted = false; bestShown = false; pickN = 0; fx.length = 0; speed = save.opt.fast ? 2 : 1; paused = false; rewardChoices = null;
  combo = 0; multiKill = 0; flawless = 0; maxComboRun = 0; coinShown = 0; dpsHist.length = 0; sfx.setIntensity(0);
  $('bSpeed').textContent = 'x' + speed;
  showPickStart();
}

// a recruited cat bursts out of its card; a merge gets the bigger one
function recruitBurst(el, merged) {
  if (!el || !motionOn()) return;
  const rc = el.getBoundingClientRect();
  domBurst(rc.left + rc.width / 2, rc.top + rc.height / 2, merged ? 30 : 20, merged ? ['#ffd23f', '#fff', '#ff8fb7'] : ['#8fe3ff', '#fff', '#ffd23f'], merged ? 'MERGED!' : 'RECRUITED!');
  buzz(merged ? 'merge' : 'pop');
}
function showPickStart() {
  mode = 'pick';
  rewardChoices = rewardChoices || S.rollCatChoices(g);
  setScreen(`<h2>Choose friend ${pickN + 1} of ${startTotal}</h2><p class="sub">${pickLine(pickN)}</p>
    <div class="cards">${rewardChoices.map((id) => catCard(id, { ribbon: owns(id) ? 'MERGE!' : '', gain: pickN > 0 })).join('')}</div>
    <div class="row hint">${rerollBtn()}</div>`);
  coach('c1', 'Tap a cat card to choose that cat. You choose 3 cats for your team.', 480, 440, 'up', { target: '.card' });
  acts = {
    pickCat: (d, el) => {
      const prev = S.synergyState(g);
      const r = S.addCat(g, d.id);
      if (r.ok !== false) recruitBurst(el, r.merged);
      sfx.play(r.merged ? 'merge' : 'pick'); sfx.meow(d.id, 'pick');
      notifySyn(prev);
      pickN++; rewardChoices = null;
      if (pickN < startTotal) showPickStart();
      else {
        const gift = S.grantStartItem(g);
        if (gift) toast(`${ITEM_BY_ID[gift].icon} Golden Paw: ${ITEM_BY_ID[gift].name} equipped!`);
        queue = Array(g.meta.startSnacks).fill('snack'); mode = 'reward'; nextReward();
      }
    },
    reroll: () => { if (S.useReroll(g)) { rewardChoices = null; sfx.play('reroll'); showPickStart(); } },
  };
}

// every relic the player holds goes into the Relic Book; a new one gets a toast
function noteRelics() {
  if (!g) return;
  if (!save.relics) save.relics = {};
  const ids = g.stash.slice();
  for (const c of g.cats.concat(g.bench)) ids.push(...c.items);
  const fresh = bookRelics(save.relics, ids);
  if (!fresh.length) return;
  runNewRelics += fresh.length;
  persist();
  const first = ITEM_BY_ID[fresh[0]];
  setTimeout(() => toastWhenPlaying(`New relic in your book: ${first.name}${fresh.length > 1 ? ` and ${fresh.length - 1} more` : ''}!`), 1200);
}
// a set that turns on (or doubles) gets a toast, so the player sees why the team got stronger
let setsSeen = {};
let runNewRelics = 0;   // relics added to the Relic Book during this run (shown when the run ends)
function noteSets() {
  if (!g) return;
  const ups = setUps(setsSeen, g.cats);
  if (ups.length) setTimeout(() => { if (mode === 'play' && !paused) sfx.play('synergy', 0.8); toastWhenPlaying(`Relic set: ${ups[0].set.name}${ups[0].mult > 1 ? ' doubled' : ''}! ${ups[0].set.desc[0].toUpperCase()}${ups[0].set.desc.slice(1)}.`); }, 2200);
}
function beginWave() {
  closeScreen();
  noteRelics();
  noteSets();
  S.startWave(g);
  mode = 'play';
  if (motionOn()) { cheerHop = 0.55; dustSweep(); }
  setBackdrop(themeFor(g.wave));
  const boss = g.bossWave;
  const nest = g.enemies.find((e) => e.boss);
  const rt = g.route.id !== 'trail' && !boss ? ` \u00B7 ${g.route.name}` : '';
  banner(boss ? nestBannerTitle(g.wave) : `Wave ${g.wave}`, boss ? nestTitle(g.wave, nest.name) : isChapterStart(g.wave) ? chapterTitle(g.wave, THEMES) : milestoneLine(g.wave) || `${THEMES[bdIdx].name}${rt}`, boss);
  if (beatToastWanted(g.wave, save.opt.tutorial && !save.tips.c2)) setTimeout(() => { if (mode === 'play') toast(chapterBeat(g.wave)); }, 1500);
  if (boss) setTimeout(() => { if (g && g.bossWave) toastWhenPlaying(`King Squeakimus: "${taunt(g.run.bossKills)}"`); }, 1500);
  sfx.play(boss ? 'boss' : 'wave');
  // passing the all-time best wave: one celebration per run
  if (!bestShown && passedBest(g.wave, save.stats.bestWave)) {
    bestShown = true;
    setTimeout(() => { if (mode === 'play') { txtFx(W / 2, 236, 'NEW BEST!', '#ffd23f', 38, 2); confetti(W / 2, 120, 40, 360); sfx.play('win'); toast(`New best: wave ${g.wave}!`); } }, 2600);
  }
  // the banner lands with weight: a nest slams in with a shake, a new chapter gets a gold flash
  if (motionOn()) {
    if (boss) { shake = Math.max(shake, 7); setTimeout(() => { if (mode === 'play') { sfx.play('stamp'); buzz('boss'); } }, 230); }
    else if (isChapterStart(g.wave)) { screenFlash('rgba(255,210,63,.22)', 0.35); ring(W / 2, 190, 260, '#ffd23f', 0.7, 10); buzz('pop'); }
  }
  if (boss) { spawnFx({ k: 'vig', life: 2.6, max: 2.6 }); nestPending = 3; }
  // a short "incoming" strip under the banner: which mice this wave brings and how many
  const inc = new Map(); for (const q of g.queue) { const o = inc.get(q.type) || { n: 0, el: 0 }; o.n++; if (q.elite) o.el++; inc.set(q.type, o); }
  waveTotal = g.queue.length + g.enemies.length;
  incoming = [...inc].map(([type, o]) => ({ type, n: o.n, el: o.el })); incomingEnd = tAnim + 4.6;
  sfx.music(boss ? 'boss' : 'fight');
  dpsHist.length = 0;
  // introduce new mice and the nest's trick the first time they show up
  const intro = [];
  for (const ty of new Set(g.queue.map((q) => q.type))) { const d = ENEMY_TYPES[ty]; if (d && d.hint && !save.tips['m_' + ty]) { save.tips['m_' + ty] = true; intro.push(`New: ${d.name}. ${d.hint}.`); } }
  if (intro.length) { persist(); intro.slice(0, 3).forEach((m, i) => setTimeout(() => toastWhenPlaying(m), 2800 + i * 2600)); }
  if (g.wave === 1) setTimeout(() => { if (mode === 'play' && !coachEl) coach('c2', 'This is your team. Your cats fight by themselves. Mice walk in from the right.', 0, 0, 'down', { at: towerRect() }); }, 1800);
  if (g.wave === 2) setTimeout(() => { if (mode === 'play' && !coachEl) coach('c3', 'The cat at the bottom gets bitten first. Put your toughest cat at the bottom.', 0, 0, 'down', { at: towerRect() }); }, 2600);
}

// a toast that comes due while the pause menu is open waits for the game to resume, so it never covers the menu
function toastWhenPlaying(m) {
  if (mode !== 'play') return;
  if (paused) return setTimeout(() => toastWhenPlaying(m), 1000);
  toast(m);
}

function onClear() {
  mode = 'celebrate';
  noteRelics();
  if (coachEl && coachEl.dataset.key === 'c2') hideCoach();   // the wave 1 tip would sit on top of the cleared banner
  celeb = g.bossWave ? 2.4 : 1.15;
  if (motionOn()) { const pp = $('nestPips'); pp.classList.remove('pipclear'); void pp.offsetWidth; pp.classList.add('pipclear'); }
  sfx.play(g.bossWave ? 'win' : 'waveclear');
  sfx.music('calm');
  banner(g.bossWave ? 'NEST DESTROYED!' : 'WAVE CLEARED!', g.bossWave ? chapterDoneLine(g.wave) : clearLine(g.report), false);
  confetti(g.towerX + 40, GROUND - 120, g.bossWave ? 60 : 26, 380);
  // victory moment: a warm flash, rings from the tower and every cat grinning for a beat
  screenFlash(g.bossWave ? 'rgba(255,240,170,.32)' : 'rgba(255,248,214,.18)', 0.35);
  flashGlow(g.towerX, GROUND - 120, g.bossWave ? 260 : 170, '#ffe9a0', 0.55);
  ring(g.towerX, GROUND - 100, g.bossWave ? 220 : 150, '#fff3b8', 0.7, 8);
  ring(g.towerX, GROUND - 100, g.bossWave ? 150 : 100, '#ffffff', 0.55, 4);
  sparks(g.towerX, GROUND - 120, g.bossWave ? 26 : 14, '#ffe27a', 300, 0.7);
  g.cats.forEach((c, i) => { if (c.hp > 0) { moods.set(c.uid, 1.4); if (i < 3) setTimeout(() => { if (mode === 'celebrate') { sfx.meow(c.id, 'cheer'); const q = catPos(c.uid); if (q) sparks(q.x, q.y - 10, 5, '#fff6b0', 150, 0.4); } }, 160 + i * 140); } });
  if (g.report && g.report.taken < 1 && g.report.kills > 3) {   // nothing got through: a gold FLAWLESS stamp over the tower (visual only)
    flawless++;
    setTimeout(() => { if (mode === 'celebrate') { txtFx(g.towerX + 110, GROUND - 190, flawless > 1 ? `FLAWLESS x${flawless}!` : 'FLAWLESS!', '#ffe27a', 34, 1.6); ring(g.towerX + 100, GROUND - 170, 120, '#ffe27a', 0.6, 6); sfx.play('revealrare'); buzz('pop'); } }, 420);
  } else flawless = 0;
  queue = g.reward.slice();
  if (g.bossWave) queue.splice(queue.length - 1, 0, 'route');
  if (S.eventDue(g)) queue.push('event');
  if (finaleDue(g.wave, !!g.run.finale)) queue.unshift('finale');
  if (g.report && g.report.boxes && g.report.boxes.length) toast(`Lootbox time: ${g.report.boxes.map((b) => BOX_BY_ID[b].name).join(', ')}!`);
}
// the ending: the mouse king falls at the end of the map. Shown once per run, pays a one time gem reward and the run goes on
function showFinale() {
  g.run.finale = true;
  const first = !save.storyDone;
  const gems = finaleGems(first);
  if (first) { save.storyDone = true; save.kingdom.gems += gems; persist(); }
  const trophies = checkAch({ ...g.run, wave: g.wave });   // shown inside the card: a toast would sit on top of its title
  const trophyHtml = trophies.map((a) => `<p class="sub"><b>&#127942; Trophy: ${a.name}!</b></p>`).join('');
  sfx.play('win'); sfx.music('calm');
  g.cats.slice(0, 3).forEach((c, i) => sfx.meow(c.id, 'cheer', 0.2 + i * 0.25));
  const card = () => {
    setScreen(`<h2>${FINALE_TITLE}</h2>${FINALE_LINES.map((l) => `<p class="sub">${l}</p>`).join('')}
      <p class="sub"><b>${gems ? `Royal reward: +${gems} gems!` : 'Paws-itively purr-fect! The kingdom cheers again.'}</b></p>${trophyHtml}
      <div class="row"><button class="btn big" data-act="go">Keep playing</button><button class="btn grey" data-act="ending">Watch the ending</button></div>`);
    acts = { go: () => nextReward(), ending: () => playEpilogue(app, { cat: (id) => catSprite(id), sfx, motion: save.opt.motion, onDone: () => card() }) };
  };
  card();
}
function nextReward() {
  const r = queue.shift();
  rewardChoices = null;
  if (!r) { beginWave(); return; }
  if (r === 'finale') showFinale(); else if (r === 'event') showEvent(); else if (r === 'cat') showCatReward(); else if (r.startsWith('box:')) showBox(r.slice(4)); else if (r === 'route') showRouteReward(); else showSnackReward();
}

function reportHtml() {
  const r = g.report;
  if (!r) return '';
  const max = Math.max(1, ...r.cats.map((c) => c.dmg));
  const shown = r.cats.slice(0, 6);
  const mvp = r.cats[0] && r.cats[0].dmg > 0 ? r.cats[0] : null;
  return `<div class="report"><div class="rh"><b>Wave ${r.wave} report</b><span>Damage <b>${num(r.dmg)}</b></span><span>Mice <b>${r.kills}</b></span><span>Taken <b>${num(r.taken)}</b></span><span>Coins <b>+${Math.floor(r.coins)}</b></span><span>${Math.round(r.time)}s</span></div>
    <div class="rbars">${shown.map((c) => `<div class="rb ${mvp && c.uid === mvp.uid ? 'mvp' : ''}"><img src="${thumbURL(c.id)}" alt=""><div class="bar"><i style="width:${(100 * c.dmg) / max}%"></i></div><span>${num(c.dmg)}${c.heal > 1 ? ` <em>+${num(c.heal)}hp</em>` : ''}</span>${mvp && c.uid === mvp.uid ? '<u>MVP</u>' : ''}</div>`).join('')}</div></div>`;
}

// ---- synergies: tell the player what a cat would start, and celebrate when one switches on
function synHint(id) {
  const st = S.synergyState(g), tags = CAT_TAGS[id] || [];
  let out = '';
  for (const t of tags) {
    const have = st.counts[t] || 0, now = have + 1, tierNow = have >= 3 ? 2 : have >= 2 ? 1 : 0, tierNext = now >= 3 ? 2 : now >= 2 ? 1 : 0;
    const sy = SYNERGIES[t];
    if (tierNext > tierNow) out += `<div class="impact up">${sy.icon} ${sy.name} x${now}: ${synergyText(t, tierNext)}</div>`;
    else out += `<div class="impact">${sy.icon} ${sy.name} ${Math.min(now, 3)}/${now >= 3 ? 3 : now >= 2 ? 3 : 2}</div>`;
  }
  return out;
}
function notifySyn(prev) {
  const now = S.synergyState(g);
  for (const t in now.tiers) if ((now.tiers[t] || 0) > ((prev.tiers && prev.tiers[t]) || 0)) {
    toast(`${SYNERGIES[t].icon} ${SYNERGIES[t].name} ${now.tiers[t] === 2 ? 'MAX' : 'active'}: ${synergyText(t, now.tiers[t])}`);
    sfx.play('synergy'); puff(S.TOWER_X, 330, 16, '#ffd23f', 150, 0.7, 4); zpunch = Math.max(zpunch, 0.015);
  }
}

// ---- event stop between waves: a shop, a shrine, a rest, a shady deal or some training
function eventOptionHtml(o, i) {
  const price = o.cost > 0 ? `<div class="evp ${o.cost > g.run.coins ? 'no' : ''}">&#129689; ${o.cost}</div>` : '';
  const cls = `card ev ${o.sold ? 'sold' : ''} ${o.cost > g.run.coins && !o.sold ? 'poor' : ''}`;
  const head = (ic, name, desc, extra = '') => `<div class="${cls}" data-act="evpick" data-i="${i}"><div class="ic">${ic}</div><h3>${name}</h3><p>${desc}</p>${extra}${price}${o.sold ? '<div class="evsold">Sold</div>' : ''}</div>`;
  const it = o.item ? ITEM_BY_ID[o.item] : null;
  switch (o.k) {
    case 'buy': return head(it.icon, it.name, it.desc, `<div class="rar ${it.rarity}">${it.rarity}</div>${relicNotes(o.item)}`);
    case 'heal': return head('&#128150;', o.cost ? 'Healing Snack' : 'Warm Rest', `Heal the whole team ${Math.round(o.pct * 100)}% and wake fallen cats.`);
    case 'reroll': return head('&#128302;', o.bonusCoins ? 'Stay up late' : 'Reroll Token', o.bonusCoins ? `+1 reroll and +${o.bonusCoins} coins.` : '+1 reroll for later choices.');
    case 'blood': return head(it.icon, 'Offer blood', `Every cat loses ${Math.round(o.hp * 100)}% health. The shrine gives <b>${it.name}</b> (${it.desc}).`, relicNotes(o.item));
    case 'gamble': return head(it.icon, 'Make a wish', `${Math.round(o.chance * 100)}% chance of <b>${it.name}</b> (${it.desc}). Coins are gone either way.`, relicNotes(o.item));
    case 'charm': {
      const ch = CHARM_BY_ID[o.id], ln = charmLines(ch);
      return head(ch.icon, ch.name, `<span class="charm"><span class="boon">${ln.boon.map((x) => `<b>${x}</b>`).join('')}</span><span class="price">${ln.cost.map((x) => `<b>${x}</b>`).join('')}</span></span>`, '<div class="rar rare">whole run</div>');
    }
    case 'snack': { const sn = SNACK_BY_ID[o.id]; return head(sn.icon, sn.name, sn.desc, `<div class="rar ${sn.kind === 'perm' ? 'rare' : 'common'}">${sn.kind === 'perm' ? 'whole run' : sn.kind === 'temp' ? '3 waves' : 'instant'}</div>`); }
    case 'toss': return head('&#129689;', 'Toss ' + o.cost + ' coins', `${Math.round(o.chance * 100)}% chance to get ${o.prize} coins back.`);
    case 'train': { const c = S.findCat(g, o.uid); return head(`<img class="thumb" src="${thumbURL(c.id)}" alt="">`, CAT_BY_ID[c.id].name + ' ' + stars(c.lvl), `Trains hard: +${Math.round(o.bonus * 100)}% damage for the rest of the run.`); }
    default: return head('&#129703;', 'Move on', 'Walk away. Nothing happens.');
  }
}
function showEvent() {
  const ev = g.event || S.rollEvent(g);
  if (!ev) { nextReward(); return; }
  mode = 'reward';
  const draw = () => {
    setScreen(`<h2>${ev.icon} ${ev.name}</h2><p class="sub">${ev.desc}</p>
      <div class="kcoins evcoins"><span>&#129689;</span><b>${num(g.run.coins)}</b><small>run coins</small></div>
      <div class="cards evcards">${ev.options.map(eventOptionHtml).join('')}</div>
      <div class="row hint"><button class="btn small grey" data-act="tower">Arrange tower</button><button class="btn ${ev.done ? 'green' : ''}" data-act="evdone">${ev.done ? 'Continue' : 'Leave'}</button></div>`, 'wide');
  };
  const finish = () => { S.endEvent(g); if (S.overflow(g) > 0) showTower(nextReward); else nextReward(); };
  draw();
  acts = {
    evpick: (d, el) => {
      if (ev.done) return;
      const r = S.chooseEvent(g, +d.i);
      if (!r.ok) { sfx.play('nope'); toast(r.msg); if (el && save.opt.motion) { el.classList.remove('shakeno'); void el.offsetWidth; el.classList.add('shakeno'); } buzz('hit'); return; }   // a refused pick shakes its card
      sfx.play('chest'); toast(r.msg); puff(S.TOWER_X, 330, 10, '#ffd23f', 120, 0.5);
      if (el && el.getBoundingClientRect) { const rc = el.getBoundingClientRect(); domBurst(rc.left + rc.width / 2, rc.top + rc.height / 2, 16, ['#ffd23f', '#fff6b0', '#fff', '#ff9a3a'], ''); buzz('pop'); }   // a taken pick bursts
      if (r.again) { draw(); return; }
      draw();
    },
    tower: () => showTower(() => showEvent()),
    evdone: finish,
  };
  coach('c8', 'Tap a card to choose it. Or tap Leave to skip. Coins you spend here are gone for good.', 480, 402, 'up', { target: '.card.ev' });
}

function showRouteReward() {
  rewardChoices = rewardChoices || S.rollRoutes(g);
  const effects = (r) => [
    r.enemyHp !== 1 ? `Mice health x${r.enemyHp}` : '', r.enemyDmg !== 1 ? `Mice damage x${r.enemyDmg}` : '', r.coin !== 1 ? `Coins x${r.coin}` : '',
    r.chest ? 'More loot chests' : '', r.rare ? 'Better loot' : '', r.speed !== 1 ? `Mice speed x${r.speed}` : '', r.bossHp !== 1 ? `Nest health x${r.bossHp}` : '', r.snackExtra ? '+1 snack choice' : '', r.healNow ? `Heal ${r.healNow * 100}% now` : '',
  ].filter(Boolean).map((x) => `<div class="impact">${x}</div>`).join('');
  setScreen(`<h2>Choose your road</h2><p class="sub">${roadLine(g.wave, THEMES)}</p>
    <div class="cards">${rewardChoices.map((id) => { const r = ROUTE_BY_ID[id]; return `<div class="card route" data-act="pickRoute" data-id="${id}"><div class="ic">${r.icon}</div><h3>${r.name}</h3><p>${r.desc}</p>${effects(r)}</div>`; }).join('')}</div>
    <div class="row hint">${rerollBtn()}</div>`);
  coach('c13', 'Pick the road to walk next. A harder road gives better rewards.', 480, 400, 'up', { target: '.card' });
  acts = {
    pickRoute: (d) => { S.chooseRoute(g, d.id); sfx.play('route'); toast(`${ROUTE_BY_ID[d.id].icon} ${ROUTE_BY_ID[d.id].name}`); nextReward(); },
    reroll: () => { if (S.useReroll(g)) { rewardChoices = null; sfx.play('reroll'); showRouteReward(); } },
  };
}

function showCatReward() {
  rewardChoices = rewardChoices || S.rollCatChoices(g);
  setScreen(`<h2>Nest destroyed!</h2><p class="sub">${rescueLine(g.run.bossKills)} A caged cat is free! Tap a card to add that cat to your team.</p>
    <div class="cards">${rewardChoices.map((id) => catCard(id, { ribbon: owns(id) ? 'MERGE!' : '', gain: true })).join('')}</div>
    <div class="row hint"><button class="btn small grey" data-act="tower">Arrange tower</button>${rerollBtn()}</div>`);
  coach('c12', 'A caged cat is free! Tap a card to add that cat to your team.', 480, 400, 'up', { target: '.card' });
  acts = {
    pickCat: (d, el) => {
      const prev = S.synergyState(g);
      const r = S.addCat(g, d.id);
      if (r.ok !== false) recruitBurst(el, r.merged);
      if (!r.ok) { showFull(d.id); return; }
      sfx.play(r.merged ? 'merge' : 'pick'); sfx.meow(d.id, r.merged ? 'happy' : 'pick');
      notifySyn(prev);
      toast(r.merged ? `${CAT_BY_ID[d.id].name} merged to Lv ${r.cat.lvl}!` : `${CAT_BY_ID[d.id].name} joined${r.benched ? ' the bench' : ' the stack'}!`);
      setTimeout(() => { if (g && mode !== 'title' && mode !== 'over') toast(freedToast(CAT_BY_ID[d.id].name, g.run.bossKills)); }, 1100);
      nextReward();
    },
    tower: () => showTower(showCatReward),
    reroll: () => { if (S.useReroll(g)) { rewardChoices = null; sfx.play('reroll'); showCatReward(); } },
  };
}

// tower and bench are full: the new cat replaces one of the others (or is skipped)
function showFull(newId) {
  const list = [...g.cats, ...g.bench];
  setScreen(`<h2>No room!</h2><p class="sub">Your tower and bench are full. Who steps down so ${CAT_BY_ID[newId].name} can join?</p>
    <div class="row">${list.map((c) => `<div class="slot has bench-slot" data-act="rel" data-uid="${c.uid}" style="width:200px"><canvas width="104" height="104" data-cat="${c.id}"></canvas><div><b>${CAT_BY_ID[c.id].name}</b><small>Lv ${c.lvl}</small></div></div>`).join('')}</div>
    <div class="row"><button class="btn grey" data-act="skip">Keep my team, skip</button></div>`);
  acts = {
    rel: (d) => { const prev = S.synergyState(g); S.releaseCat(g, +d.uid); S.addCat(g, newId); sfx.play('pick'); notifySyn(prev); nextReward(); },
    skip: () => nextReward(),
  };
}

// ---- lootboxes: a chance, not a choice. Shake it, open it, meet the relic.
function showBox(tier) {
  const bx = BOX_BY_ID[tier] || BOXES[0], rars = Object.keys(bx.odds);
  setScreen(`<h2>${bx.icon} ${bx.name}</h2><p class="sub">${bx.blurb}</p>
    <div class="boxstage t-${bx.id}"><div class="boxvig"></div><div class="boxglow"></div><div class="boxbeams"></div><div class="boxsuck">${suckHtml()}</div><div class="boxsparks">${sparksHtml()}</div><div class="boxcrack"></div><div class="boxic t-${bx.id}" data-act="openbox"><img class="boxhero lo" src="${boxHero(bx.id).toDataURL()}" alt="${bx.name}"><img class="boxhero hi" src="${boxHero(bx.id).toDataURL()}" alt="" aria-hidden="true"></div><div class="boxring"></div><div class="boxflash"></div></div>
    <p class="sub boxodds">Might hold ${rars.length > 1 ? `<b>${rars[0]}</b> to <b>${rars[rars.length - 1]}</b>` : `<b>${rars[0]}</b>`} relics</p>
    <div class="row"><button class="btn big" data-act="openbox">Open it!</button></div>
    <div class="row hint"><button class="btn small grey" data-act="tower">Arrange tower</button></div>`);
  coach('c9', 'Tap Open it! to open the box and see what is inside.', 480, 380, 'up', { target: 'button[data-act=openbox]' });
  let opening = false, burst = false;
  const stg = screenEl.querySelector('.boxstage'), root = screenEl.firstElementChild;
  const later = (fn, ms) => setTimeout(() => { if (g && stg && stg.isConnected) fn(); }, ms);
  const doBurst = () => {   // the lid flies, light and confetti fly, and the relic is rolled
    if (burst) return;
    burst = true;
    stg.classList.remove('charging'); stg.classList.add('opening');
    if (save.opt.shake > 0 && root) { root.classList.remove('jolt'); void root.offsetWidth; root.classList.add('jolt'); }
    sfx.play('boxburst'); buzz('pop');
    later(() => { const id = S.openBox(g, tier); rewardChoices = id; showBoxReveal(tier, id); }, save.opt.motion ? 480 : 120);
  };
  acts = {
    openbox: () => {
      if (opening) { doBurst(); return; }   // tapping again skips the wind-up
      opening = true; sfx.unlock(); sfx.play('boxopen');
      const row = screenEl.querySelector('.row'); if (row) row.classList.add('gone');
      if (!save.opt.motion) { later(doBurst, 200); return; }
      sfx.play('boxbuild'); stg.classList.add('charging');
      [200, 420, 600, 740, 850, 930].forEach((ms, i) => later(() => { if (!burst) { sfx.play('boxtick', 1 + i * 0.2); buzz('tick'); } }, ms));
      later(doBurst, 1050);
    },
    tower: () => showTower(() => showBox(tier)),
  };
}
// the burst when a box opens: more and brighter pieces for better relics
const CONFETTI = { common: [8, ['#fff0d0', '#ffd23f']], rare: [14, ['#8ec6ff', '#fff']], epic: [22, ['#e7a0ff', '#fff', '#ffd23f']], legendary: [34, ['#ffd23f', '#fff6b0', '#ff9a3a']], mythic: [46, ['#ff8ac8', '#9a7aff', '#fff', '#ffd23f']] };
// how long the covered card keeps you waiting: a longer pause the rarer it is, and a tap skips it
const REVEAL_WAIT = { common: 380, rare: 650, epic: 950, legendary: 1350, mythic: 1750 };
const REVEAL_SFX = { common: 'chest', rare: 'revealrare', epic: 'revealepic', legendary: 'revealleg', mythic: 'revealmyth' };
const sparksHtml = () => Array.from({ length: 10 }, (_, i) => `<i style="--a:${i * 36 + 12}deg;--d:${62 + (i * 29) % 50}px;--t:${0.36 + (i % 4) * 0.06}s"></i>`).join('');
const suckHtml = () => Array.from({ length: 12 }, (_, i) => `<i style="--a:${i * 30 + (i % 2) * 11}deg;--d:${120 + (i * 23) % 60}px;--t:${(i % 6) * 0.14}s"></i>`).join('');   // bits of light pulled into the box while it charges
function confettiHtml(rarity) {
  const [n, cols] = CONFETTI[rarity] || CONFETTI.common;
  return Array.from({ length: n }, (_, i) => `<i style="--a:${Math.round((360 / n) * i + (i % 2) * 7)}deg;--d:${110 + (i * 37) % 90}px;--c:${cols[i % cols.length]};--t:${(i % 5) * 0.03}s"></i>`).join('');
}
function showBoxReveal(tier, id, again = false) {   // again: coming back from the Arrange screen, so no second wait
  const it = ITEM_BY_ID[id], bx = BOX_BY_ID[tier] || BOXES[0], hi = ['epic', 'legendary', 'mythic'].includes(it.rarity);
  const fresh = !save.relics[id];   // the first time this relic has ever turned up
  const cheerId = g.cats[0] && g.cats[0].id;
  setScreen(`<h2 class="cheer veil r-${it.rarity}">${cheerId ? `<img class="cheercat" src="${thumbURL(cheerId)}" alt="">` : ''}${RARITY_CHEER[it.rarity]}</h2><p class="sub veil">Out of the ${bx.name}:</p>
    <div class="revealstage pending r-${it.rarity}"><div class="revealflash"></div><div class="rays"></div><div class="pedestal"></div><div class="confetti">${confettiHtml(it.rarity)}</div><div class="cardback t-${bx.id}"><img src="${boxHero(bx.id).toDataURL()}" alt=""><b>?</b></div><div class="cards reveal">${itemCard(id)}</div><div class="stamp">${it.rarity}!</div>${fresh ? '<div class="newtag">NEW!</div>' : ''}</div>
    <div class="row veil"><button class="btn big" data-act="take">Equip it</button></div>
    <div class="row hint veil"><button class="btn small grey" data-act="tower">Arrange tower</button></div>`);
  const root = screenEl.firstElementChild, stage = root.querySelector('.revealstage');
  root.classList.add('suspense');
  let flipped = false, leaving = false;
  const flip = (quiet) => {   // the card turns over: light, confetti, a fanfare matched to the rarity, a stamp and (for a first find) a NEW tag
    if (flipped || !stage.isConnected) return;
    flipped = true;
    root.classList.remove('suspense'); stage.classList.remove('pending'); stage.classList.add('flipped');
    if (hi && save.opt.shake > 0) { root.classList.remove('jolt'); void root.offsetWidth; root.classList.add('jolt'); }
    if (quiet === true) return;
    sfx.play(REVEAL_SFX[it.rarity] || 'chest');
    if (it.rarity !== 'common') setTimeout(() => sfx.play('stamp'), 260);
    if (fresh) setTimeout(() => sfx.play('newrelic'), 520);
    setTimeout(() => { if (flipped && stage.isConnected && !leaving) coach('c10', 'This is a relic. It makes one cat stronger. Tap Equip it, then tap the cat that should wear it.', 480, 380, 'up', { target: 'button[data-act=take]' }); }, 1100);
    buzz(hi ? 'jackpot' : 'pop');
    if (hi) { const c0 = g.cats[0]; if (c0) setTimeout(() => sfx.meow(c0.id, 'cheer'), 380); }
  };
  stage.addEventListener('click', () => flip());
  const wait = !again && save.opt.motion ? REVEAL_WAIT[it.rarity] || 400 : 0;
  if (again) { stage.classList.add('again'); flip(true); }
  else { if (wait && it.rarity !== 'common') sfx.play('boxtick', 0.8); setTimeout(() => flip(), wait); }
  acts = {
    take: () => {
      if (!flipped) { flip(); return; }
      if (leaving) return;
      leaving = true; rewardChoices = null;
      const idx = g.stash.lastIndexOf(id);
      if (save.opt.motion) { stage.classList.add('fly'); sfx.play('equip'); setTimeout(() => showTower(() => nextReward(), { item: idx }), 300); }
      else showTower(() => nextReward(), { item: idx });
    },
    tower: () => showTower(() => showBoxReveal(tier, id, true)),
  };
}

function showSnackReward() {
  rewardChoices = rewardChoices || S.rollSnackChoices(g);
  const first = g.wave === 0 || !g.report;
  setScreen(`${first ? '<h2>Snack Stall bonus!</h2><p class="sub">Your kingdom gives you a free snack to start.</p>' : `<h2>Wave ${g.wave} cleared!</h2>`}${first ? '' : reportHtml()}
    <div class="cards">${rewardChoices.map(snackCard).join('')}</div>
    <div class="row hint"><button class="btn small grey" data-act="tower">Arrange tower</button><button class="btn small grey" data-act="stats">Team stats</button>${rerollBtn()}</div>`, first ? '' : 'wide');
  coach('c11', 'Pick one snack. A snack makes your whole team a little stronger.', 480, 400, 'up', { target: '.card' });
  acts = {
    pickSnack: (d, el) => {
      S.eatSnack(g, d.id);
      sfx.play('pick');
      if (el && el.getBoundingClientRect) {   // the snack gets gobbled: a burst in the colour of its kind and a label
        const sn = SNACK_BY_ID[d.id], r = el.getBoundingClientRect();
        domBurst(r.left + r.width / 2, r.top + r.height / 2, sn.kind === 'perm' ? 22 : 16, sn.kind === 'perm' ? ['#ffd23f', '#fff6b0', '#ff9a3a', '#fff'] : sn.kind === 'temp' ? ['#8fe8ff', '#fff', '#c58aff'] : ['#ff8fb7', '#fff', '#ffd1e0'], sn.kind === 'perm' ? 'YUM! FOREVER' : sn.kind === 'temp' ? 'BOOST!' : 'HEALED!');
        buzz('pop');
      }
      toast(`${SNACK_BY_ID[d.id].icon} ${SNACK_BY_ID[d.id].name}!`);
      nextReward();
    },
    tower: () => showTower(showSnackReward),
    stats: () => showStats(showSnackReward),
    reroll: () => { if (S.useReroll(g)) { rewardChoices = null; sfx.play('reroll'); showSnackReward(); } },
  };
}

// team stats: where every bonus comes from, plus what each cat has done
function showStats(back) {
  const rows = S.explainMods(g), m = S.calcMods(g);
  const order = [['dmg', m.dmg], ['haste', m.haste], ['hp', m.hp], ['crit', m.crit], ['range', m.range], ['dr', m.dr], ['waveHeal', m.waveHeal], ['curse', m.curse]];
  const stat = order.filter(([k]) => rows[k] || k === 'crit' || k === 'waveHeal').map(([k, v]) => `<div class="srow"><b>${STAT_LABEL[k]}</b><strong>${pc(v, k !== 'dr')}</strong><span>${(rows[k] || []).map((r) => `<i>${r.label} ${pc(r.v)}</i>`).join('') || '<i>base</i>'}</span></div>`).join('');
  const mods = m, cats = g.cats.concat(g.bench).slice().sort((a, b) => b.dmgDone - a.dmgDone);
  const cs = cats.map((c) => `<div class="srow cat"><img src="${thumbURL(c.id)}" alt=""><b>${CAT_BY_ID[c.id].name} ${stars(c.lvl)}</b><strong>&asymp; ${Math.round(S.estDps(c, mods))} DPS</strong><span><i>${num(c.dmgDone)} damage</i><i>${c.kills} mice</i>${c.healDone > 1 ? `<i>${num(c.healDone)} healed</i>` : ''}${c.items.map((id) => `<i>${ITEM_BY_ID[id].icon}</i>`).join('')}</span></div>`).join('');
  const r = g.run;
  const rl = teamRelics(cats).map((e) => `<div class="srow rel r-${e.rarity}"><b>${e.icon} ${e.name}${e.n > 1 ? ` x${e.n}` : ''}</b><strong></strong><span><i>${e.desc}</i><i>${[...new Set(e.carriers)].map((id) => CAT_BY_ID[id].name).join(', ')}</i></span></div>`).join('');
  const rs = activeSets(g.cats).filter((a) => a.have.length).map((a) => `<div class="srow rel set${a.mult ? ' on' : ''}"><b>${a.set.name}${a.mult > 1 ? ' x2' : ''}</b><strong></strong><span><i>${a.mult ? a.set.desc : `${SET_NEED - a.have.length} more for: ${a.set.desc}`}</i><i>${a.have.length}/${a.set.ids.length}: ${a.have.map((id) => ITEM_BY_ID[id].name).join(', ')}</i></span></div>`).join('');
  setScreen(`<h2>Team stats</h2><div class="statcols"><div>${stat}<div class="srow"><b>Run</b><strong></strong><span><i>${num(r.dmg)} damage</i><i>biggest hit ${num(r.biggest)}</i><i>${num(r.taken)} taken</i><i>${Math.floor(r.coins)} coins</i></span></div></div><div>${cs}</div></div>${rl ? `<h4 class="relh">Relics in play</h4><div class="statcols relcols">${rl}</div>` : ''}${rs ? `<h4 class="relh">Relic sets</h4><div class="statcols relcols">${rs}</div>` : ''}
    <div class="row"><button class="btn" data-act="back">Back</button></div>`, 'wide');
  acts = { back };
}

// ---- drag and drop on the arrange screen: one pointer path for mouse, pen and finger. A press that moves more than a few
// pixels lifts the thing under it (a floating ghost follows the pointer), the hooks say what is under the pointer and what a drop does.
let dragSuppress = 0;
screenEl.addEventListener('click', (e) => { if (performance.now() < dragSuppress) { e.stopPropagation(); e.preventDefault(); } }, true);   // the click that ends a drag is not a tap
// short-lived DOM effects on the stage for the drag and drop: a ring that grows and fades, and a sparkle that drifts down and fades
function dfxRing(cx, cy, cls) {
  if (!save.opt.motion) return;
  const p = stagePoint({ clientX: cx, clientY: cy }), el = document.createElement('i');
  el.className = 'dfx ' + cls; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
  app.appendChild(el); setTimeout(() => el.remove(), 520);
}
function trail(cx, cy) {
  const p = stagePoint({ clientX: cx, clientY: cy }), el = document.createElement('i');
  el.className = 'dfx dtrail'; el.style.left = (p.x + (Math.random() - 0.5) * 14) + 'px'; el.style.top = (p.y + (Math.random() - 0.5) * 14) + 'px';
  el.style.setProperty('--dx', ((Math.random() - 0.5) * 24).toFixed(0) + 'px');
  app.appendChild(el); setTimeout(() => el.remove(), 480);
}
// a burst of confetti and a floating label at a screen point, for the menus (buying an upgrade, a personal best)
function domBurst(cx, cy, n, cols, label) {
  if (!save.opt.motion) return;
  for (let i = 0; i < n; i++) {
    const p = stagePoint({ clientX: cx, clientY: cy }), el = document.createElement('i'), a = (360 / n) * i + Math.random() * 14, d = 50 + Math.random() * 90;
    el.className = 'dfx dconf'; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    el.style.setProperty('--a', a.toFixed(0) + 'deg'); el.style.setProperty('--d', d.toFixed(0) + 'px'); el.style.setProperty('--c', cols[i % cols.length]);
    app.appendChild(el); setTimeout(() => el.remove(), 900);
  }
  if (label) {
    const p = stagePoint({ clientX: cx, clientY: cy }), el = document.createElement('b');
    el.className = 'dfx dlabel'; el.textContent = label; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    app.appendChild(el); setTimeout(() => el.remove(), 1100);
  }
}
function bindDrag(root, h) {
  root.addEventListener('pointerdown', (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || e.isPrimary === false) return;
    const src = h.pick(e);
    if (!src) return;
    const id = e.pointerId, sx = e.clientX, sy = e.clientY, touch = e.pointerType !== 'mouse';
    let on = false, ghost = null, over = null, lastX = 0, tilt = 0, lastSpark = 0;
    try { src.el.setPointerCapture(id); } catch (err) { /* capture is a nicety */ }
    const under = (ev) => h.hit(document.elementFromPoint(ev.clientX, ev.clientY), src);
    const same = (a, b) => (a && b ? a.el === b.el : a === b);
    const move = (ev) => {
      if (ev.pointerId !== id) return;
      if (!on) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 7) return;
        on = true;
        ghost = document.createElement('div'); ghost.className = 'dghost lift'; ghost.innerHTML = h.ghost(src);
        app.appendChild(ghost); h.start(src);
        const sr = src.el.getBoundingClientRect(); dfxRing(sr.left + sr.width / 2, sr.top + sr.height / 2, 'pickring');   // a puff where it was lifted
      }
      const p = stagePoint(ev);
      if (isFinite(p.x) && isFinite(p.y)) {
        ghost.style.left = p.x + 'px'; ghost.style.top = (p.y - (touch ? 34 : 0)) + 'px';
        // the ghost leans into the way it is being carried and leaves a short trail of sparkles
        const vx = p.x - lastX; lastX = p.x; tilt = tilt * 0.7 + Math.max(-16, Math.min(16, vx * 1.1)) * 0.3;
        if (save.opt.motion) { ghost.style.setProperty('--tilt', (tilt - 4).toFixed(1) + 'deg'); if (performance.now() - lastSpark > 38) { lastSpark = performance.now(); trail(ev.clientX, ev.clientY - (touch ? 34 * (cv.getBoundingClientRect().width / W) : 0)); } }
      }
      const t = under(ev);
      if (!same(t, over)) { h.over(t, over, src); over = t; }
    };
    const end = (ev, cancel) => {
      if (ev.pointerId !== id) return;
      for (const [n, f] of [['pointermove', move], ['pointerup', up], ['pointercancel', cn]]) src.el.removeEventListener(n, f);
      if (!on) return;
      dragSuppress = performance.now() + 450;
      const t = cancel ? null : under(ev);
      const ok = !!(t && (h.valid ? h.valid(src, t) : true));
      const gh = ghost;
      if (save.opt.motion) {   // a good drop: it drops in with a ring; a bad one: it flies home to where it was lifted from
        if (ok) { gh.classList.add('dropin'); dfxRing(ev.clientX, ev.clientY, 'dropring'); }
        else { const r = src.el.getBoundingClientRect(), q = stagePoint({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }); gh.classList.add('goback'); gh.style.left = q.x + 'px'; gh.style.top = q.y + 'px'; }
        setTimeout(() => gh.remove(), 240);
      } else gh.remove();
      h.over(null, over, src); h.end(src, t);
    };
    const up = (ev) => end(ev, false), cn = (ev) => end(ev, true);
    src.el.addEventListener('pointermove', move); src.el.addEventListener('pointerup', up); src.el.addEventListener('pointercancel', cn);
  });
}

// arrange the tower: drag a relic onto a cat to equip it (or tap a relic, then a cat), drag cats to swap, merge or move them
function showTower(back, opt = {}) {
  let sel = null, rel = false, selItem = opt.item != null ? opt.item : null, hoverId = null, pend = null;
  const motion = () => save.opt.motion && !document.body.classList.contains('nomotion');
  const gainChip = (c, id) => {   // before and after for one cat wearing relic `id` (null when it would change nothing worth saying)
    const mods = S.calcMods(g), dps = S.estDps(c, mods), items = c.items.slice();
    if (items.length >= itemSlots(c.lvl)) items.shift();
    items.push(id);
    const nd = S.estDps(c, mods, items), df = nd - dps;
    const bk = S.estBulk(g, c, mods, items) / Math.max(1, S.estBulk(g, c, mods, c.items)) - 1, bp = Math.round(bk * 100);
    const better = df > -0.5 && bp >= 0;
    return { cls: better ? 'up' : 'down', html: `&asymp;${Math.round(dps)} &rarr; <b>&asymp;${Math.round(nd)}</b> (${df >= 0 ? '+' : ''}${Math.round((100 * df) / Math.max(1, dps))}%)${bp ? `, ${bp > 0 ? 'tougher +' : 'less tough '}${Math.abs(bp)}%` : ''}` };
  };
  const catRow = (c, zone, i, extra = '') => {
    const d = CAT_BY_ID[c.id], mx = S.catMaxHp(g, c), mods = S.calcMods(g), dps = S.estDps(c, mods);
    const canMerge = sel && sel !== c.uid && (() => { const a = S.findCat(g, sel); return a && a.id === c.id && a.lvl === c.lvl && a.lvl < 3; })();
    const pv = selItem != null && g.stash[selItem] ? gainChip(c, g.stash[selItem]) : null;
    const slots = Array.from({ length: itemSlots(c.lvl) }, (_, k) => {
      const id = c.items[k], it = id && ITEM_BY_ID[id];
      return it ? `<span class="islot full r-${it.rarity}" data-act="unequip" data-uid="${c.uid}" data-i="${k}" aria-label="${it.name}, ${it.rarity}, worn by ${d.name}. Take it off" title="${it.name}: ${it.desc} (tap to take off, or drag it)">${it.icon}</span>` : `<span class="islot ${selItem != null ? 'want' : ''}" aria-hidden="true"></span>`;
    }).join('');
    const worn = c.items.map((id) => ITEM_BY_ID[id].name).join(', ');
    return `<div class="slot has ${sel === c.uid ? 'sel' : ''} ${canMerge ? 'can' : ''} ${selItem != null ? 'eq' : ''}" data-act="slot" data-zone="${zone}" data-i="${i}" data-uid="${c.uid}" aria-label="${d.name}, level ${c.lvl}, ${d.role}, about ${Math.round(dps)} damage per second${worn ? ', wearing ' + worn : ''}"><canvas width="96" height="96" data-cat="${c.id}"></canvas><div class="sc"><b><span class="nm">${d.name}</span> <span class="st">${stars(c.lvl)}</span></b><small><i class="rp">${d.role}</i>${canMerge ? ' MERGE!' : extra}</small><div class="hp"><i style="width:${Math.max(2, (100 * c.hp) / mx)}%"></i></div><em class="pv ${pv ? pv.cls : ''}">${pv ? pv.html : ''}</em></div><div class="islots">${slots}</div><div class="sdps">&asymp;${Math.round(dps)}<small>DPS</small></div></div>`;
  };
  // the detail bar: a relic's name, rarity, effect, set progress and the cat it helps most
  const itemDetail = (id) => {
    const it = ITEM_BY_ID[id], h = setHint(id, g.cats), r = S.relicGain(g, id), bits = [];
    if (r && r.dps >= 0.01) bits.push(`+${Math.round(r.dps * 100)}% damage`);
    if (r && r.bulk >= 0.03) bits.push(`tougher +${Math.round(r.bulk * 100)}%`);
    const best = bits.length ? `Best on ${CAT_BY_ID[r.cat].name}: ${bits.join(', ')}` : '';
    return `<span class="ditem r-${it.rarity}"><i class="dic">${it.icon}</i><span class="dbody"><b class="dnm"><span class="nm">${it.name}</span><em class="drar">${it.rarity}</em></b><span class="dds">${it.desc}</span>${h || best ? `<span class="dex">${h ? `<u>${h}</u>` : ''}${best}</span>` : ''}</span></span>`;
  };
  const sellLabel = (idx) => { const id = g.stash[idx]; return id ? `<b>Sell</b><small>&#129689; +${S.sellValue(g, id)}</small>` : '<b>Sell</b><small>drop a relic</small>'; };
  const forgeLabel = (idx) => {
    const id = g.stash[idx];
    if (!id) return '<b>Forge</b><small>3 of a kind</small>';
    const r = ITEM_BY_ID[id].rarity, same = g.stash.filter((x) => ITEM_BY_ID[x].rarity === r).length;
    return `<b>Forge</b><small>${Math.min(same, FORGE_COUNT)}/${FORGE_COUNT} &rarr; ${FORGE_NEXT[r]}</small>`;
  };
  const draw = () => {
    const tw = [];
    for (let i = S.stackMax(g) - 1; i >= 0; i--) tw.push(g.cats[i] ? catRow(g.cats[i], 'tower', i, i === 0 ? ' · takes the hits' : '') : `<div class="slot" data-act="slot" data-zone="tower" data-i="${i}">&nbsp;Empty spot</div>`);
    const bn = [];
    for (let i = 0; i < S.benchMax(g); i++) bn.push(g.bench[i] ? catRow(g.bench[i], 'bench', i) : `<div class="slot" data-act="slot" data-zone="bench" data-i="${i}">&nbsp;Empty bench spot</div>`);
    const over = S.overflow(g);
    const cell = (id, i) => `<span class="bag ${ITEM_BY_ID[id].rarity} ${selItem === i ? 'sel' : ''} ${i >= MAX_STASH ? 'over' : ''}" data-act="bag" data-i="${i}" aria-label="${ITEM_BY_ID[id].name}, ${ITEM_BY_ID[id].rarity}" title="${ITEM_BY_ID[id].name}: ${ITEM_BY_ID[id].desc}">${ITEM_BY_ID[id].icon}</span>`;
    const bag = g.stash.map(cell).join('') + Array.from({ length: Math.max(0, MAX_STASH - g.stash.length) }, () => '<span class="bag empty"></span>').join('');
    const it = selItem != null && g.stash[selItem] ? ITEM_BY_ID[g.stash[selItem]] : null;
    const plan = it ? S.forgePlan(g, selItem) : null;
    const syn = S.synergyState(g);
    const synChips = Object.entries(syn.counts).sort((a, b) => b[1] - a[1]).map(([t, n]) => { const tier = syn.tiers[t] || 0; return `<span class="schip ${tier ? 't' + tier : ''}" title="${SYNERGIES[t].name}: ${tier ? synergyText(t, tier) : 'needs 2 cats'}">${SYNERGIES[t].icon} ${SYNERGIES[t].name} ${n}/${n >= 3 ? 3 : n >= 2 ? 3 : 2}</span>`; }).join('');
    const msg = over
      ? `<b class="warn">Backpack is over full by ${over}.</b> Sell, forge or equip relics to continue.`
      : sel ? 'Tap another cat to swap, or a matching one to merge. Or drag cats around.' : 'Drag a relic onto a cat to equip it. Drag a cat onto another to swap or merge.';
    const detail = it ? itemDetail(it.id) : msg;
    setScreen(`<h2>Arrange your tower <small class="klv">Team DPS &asymp; ${Math.round(teamDps(S.calcMods(g)))}</small></h2><div class="synrow">${synChips || '<small>Stack cats of the same kind for synergy bonuses!</small>'}</div>
      <div class="tbody"><div class="tower"><div class="col tw"><div class="zone" data-zone="tower"><h4>Tower <small>top to bottom</small></h4>${tw.join('')}</div><button class="btn small red relbtn" data-act="release" data-drop="release" ${sel ? '' : 'disabled'}>${rel ? 'Really release?' : 'Release cat'}</button></div><div class="col"><div class="zone bn" data-zone="bench"><h4>Bench <small>rests, heals fast</small></h4>${bn.join('')}</div>
        <div class="packz" data-drop="bag"><h4>Backpack <span class="${over ? 'warn' : ''}">${g.stash.length}/${MAX_STASH}</span></h4><div class="bagrow">${bag}</div></div></div></div></div>
      <div class="tfoot"><div class="detail slim ${over ? 'bad' : ''}" aria-live="polite">${detail}</div><button class="btn small amber fbtn zbtn" data-act="sell" data-drop="sell" ${it ? '' : 'disabled'}>${sellLabel(selItem)}</button><button class="btn small fbtn zbtn ${plan ? 'purple' : 'grey'}" data-act="forge" data-drop="forge" ${plan ? '' : 'disabled'} title="Melt three relics of one rarity into one of the next">${forgeLabel(selItem)}</button><button class="btn big2" data-act="done" ${over ? 'disabled' : ''}>Done</button></div>`, 'wide arr towerscr');
    screenEl.firstElementChild.dataset.msg = msg;
    bindTower(screenEl.firstElementChild);
    if (selItem != null) coach('c6', 'Now tap the cat that should wear it. The green numbers show how much stronger that cat gets.', 680, 352, 'up', { target: '.slot.has' });
    else coach('c4', 'To swap two cats, drag one cat onto another cat. Two of the same cat join into one stronger cat.', 430, 376, 'up', { target: '.slot.has', wait: true, maxW: 300 });
    if (pend) { const p = pend; pend = null; celebrate(p); }
  };
  // a bounce on what just changed, and a sparkle for a legendary or mythic relic (reduced motion: a still glow only)
  const celebrate = (p) => {
    if (Array.isArray(p)) { p.forEach(celebrate); return; }
    const el = screenEl.querySelector(p.q);
    if (!el) return;
    const m = motion(), cls = m ? 'bump' : 'glow';
    el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 700);
    if (m) {   // every landing sparkles and bursts, bigger and with a label the rarer the relic is
      const RB = { common: [6, ['#fff6b0', '#fff']], rare: [10, ['#8ec6ff', '#fff']], epic: [16, ['#e7a0ff', '#fff', '#ffd23f']], legendary: [22, ['#ffd23f', '#fff6b0', '#ff9a3a']], mythic: [28, ['#ff8ac8', '#9a7aff', '#fff', '#ffd23f']] }[p.rar] || [6, ['#fff']];
      const r = el.getBoundingClientRect();
      if (p.rar !== 'common' || p.label) domBurst(r.left + r.width / 2, r.top + r.height / 2, p.burst || RB[0], RB[1], p.label || '');
    }
    if (m && (p.rar === 'legendary' || p.rar === 'mythic')) {
      const box = document.createElement('span'); box.className = 'sparkle r-' + p.rar;
      box.innerHTML = Array.from({ length: 12 }, (_, i) => `<i style="--a:${i * 30 + 8}deg;--d:${26 + (i * 13) % 22}px;--t:${(i % 4) * 0.04}s"></i>`).join('');
      el.appendChild(box); setTimeout(() => box.remove(), 900);
    }
  };
  const setDetail = (html) => { const d = screenEl.querySelector('.tfoot .detail.slim'); if (d) d.innerHTML = html; };
  const zones = (idx, enable) => {   // Sell and Forge show what they would do with the relic in hand, and light up as drop zones
    const id = idx != null && enable ? g.stash[idx] : null, plan = id ? S.forgePlan(g, idx) : null;
    const s = screenEl.querySelector('[data-act="sell"]'), f = screenEl.querySelector('[data-act="forge"]');
    if (s) { s.innerHTML = sellLabel(id ? idx : null); s.disabled = !id; }
    if (f) { f.innerHTML = forgeLabel(id ? idx : null); f.disabled = !plan; f.classList.toggle('purple', !!plan); f.classList.toggle('grey', !plan); }
  };
  const equipTo = (idx, uid) => {
    const cat = S.findCat(g, uid), id = g.stash[idx];
    if (!cat || !id) return false;
    if (!S.equipItem(g, idx, uid)) return false;
    sfx.play('equip'); buzz('ui'); toast(`${CAT_BY_ID[cat.id].name} equipped!`); puff(S.TOWER_X, 330, 8, '#ffd23f', 120, 0.5);
    if (ITEM_BY_ID[id].rarity === 'legendary' || ITEM_BY_ID[id].rarity === 'mythic') sfx.play('upgrade', 0.5);
    pend = { q: `.slot[data-uid="${uid}"]`, rar: ITEM_BY_ID[id].rarity };
    return true;
  };
  // what is under the pointer: a cat row, an empty spot, a zone, or one of the drop buttons
  const hitOf = (el) => {
    if (!el || !el.closest) return null;
    const row = el.closest('.slot');
    if (row && row.dataset.zone) return row.classList.contains('has') ? { k: 'cat', uid: +row.dataset.uid, zone: row.dataset.zone, el: row } : { k: 'empty', zone: row.dataset.zone, el: row };
    const dz = el.closest('[data-drop]');
    if (dz) return { k: dz.dataset.drop, el: dz };
    const z = el.closest('.zone');
    return z ? { k: 'zone', zone: z.dataset.zone, el: z } : null;
  };
  const catMoveOk = (uid, zone) => {
    const c = S.findCat(g, uid), fromTower = g.cats.includes(c);
    return !!c && (zone === 'tower') !== fromTower && !(fromTower && g.cats.length === 1) && (zone === 'tower' ? g.cats.length < S.stackMax(g) : g.bench.length < S.benchMax(g));
  };
  const validDrop = (src, t) => {
    if (!t) return false;
    const act = dropAction(src, { ...t, self: t.k === 'cat' && t.uid === src.uid });
    if (act === 'forge') return !!S.forgePlan(g, src.i);
    if (act === 'catMove') return catMoveOk(src.uid, t.zone);
    if (act === 'release') return g.cats.length + g.bench.length > 1;
    if (act === 'unequip') return g.stash.length < MAX_STASH;
    return !!act;
  };
  function bindTower(root) {
    bindDrag(root, {
      pick: (e) => {
        const w = e.target.closest('.islot.full'), b = e.target.closest('.bag:not(.empty)'), r = e.target.closest('.slot.has');
        if (w) return { k: 'worn', uid: +w.dataset.uid, i: +w.dataset.i, el: w };
        if (b) return { k: 'bag', i: +b.dataset.i, el: b };
        if (r) return { k: 'cat', uid: +r.dataset.uid, el: r };
        return null;
      },
      hit: (el) => hitOf(el),
      valid: (s, t) => validDrop(s, t),
      ghost: (s) => {
        if (s.k === 'cat') { const c = S.findCat(g, s.uid); return `<span class="gc"><img src="${thumbURL(c.id)}" alt=""><b>${CAT_BY_ID[c.id].name}</b></span>`; }
        const id = s.k === 'bag' ? g.stash[s.i] : S.findCat(g, s.uid).items[s.i];
        return `<span class="gr r-${ITEM_BY_ID[id].rarity}">${ITEM_BY_ID[id].icon}</span>`;
      },
      start: (s) => {
        sfx.play('ui'); buzz('ui');
        root.classList.add('dg-' + (s.k === 'cat' ? 'cat' : s.k === 'bag' ? 'relic' : 'worn'));
        s.el.classList.add('lifted');
        const id = s.k === 'bag' ? g.stash[s.i] : s.k === 'worn' ? S.findCat(g, s.uid).items[s.i] : null;
        if (s.k === 'bag') { s.prev = selItem; selItem = s.i; sel = null; zones(s.i, true); }
        else zones(null, false);
        s.defHtml = root.querySelector('.tfoot .detail.slim').innerHTML;
        if (id) setDetail(itemDetail(id));
      },
      over: (t, prev, s) => {
        if (prev && prev.el) { prev.el.querySelectorAll('.islot.land').forEach((x) => { x.classList.remove('land', 'ghostsock'); if (x.dataset.was != null) { x.innerHTML = x.dataset.was; delete x.dataset.was; } }); }
        if (prev && prev.el) { prev.el.classList.remove('over', 'badt'); const pv = prev.el.querySelector && prev.el.querySelector('.pv'); if (pv && prev.k === 'cat') { pv.textContent = ''; pv.className = 'pv'; } }
        if (!t || !t.el) return;
        const ok = validDrop(s, t);
        t.el.classList.add(ok ? 'over' : 'badt');
        if (ok) sfx.play('hover');
        if (t.k === 'cat' && s.k !== 'cat') {
          const id = s.k === 'bag' ? g.stash[s.i] : S.findCat(g, s.uid).items[s.i], c = S.findCat(g, t.uid), pv = t.el.querySelector('.pv');
          if (c && pv && !(s.k === 'worn' && s.uid === t.uid)) { const gc = gainChip(c, id); pv.className = 'pv ' + gc.cls; pv.innerHTML = gc.html; }
          if (ok && c) {   // show where it lands: the free socket, or the one that gets replaced
            const socks = [...t.el.querySelectorAll('.islot')], at = socks.find((x) => !x.classList.contains('full')) || socks[0];
            if (at) { at.dataset.was = at.innerHTML; at.classList.add('land'); if (!at.classList.contains('full')) { at.classList.add('ghostsock'); at.innerHTML = ITEM_BY_ID[id].icon; } }
          }
        } else if (t.k === 'cat' && s.k === 'cat' && t.uid !== s.uid) {
          const a = S.findCat(g, s.uid), b = S.findCat(g, t.uid), pv = t.el.querySelector('.pv');
          if (a && b && pv) { const mg = a.id === b.id && a.lvl === b.lvl && a.lvl < 3; pv.className = 'pv up'; pv.textContent = mg ? `MERGE to Lv ${a.lvl + 1}!` : 'Swap places'; }
        }
      },
      cancel: () => {},
      end: (s, t) => {
        if (s.k === 'bag') selItem = s.prev;
        const act = validDrop(s, t) ? dropAction(s, { ...t, self: t.k === 'cat' && t.uid === s.uid }) : null;
        if (!act) { if (t && t.k !== 'zone') { sfx.play('nope'); } draw(); return; }
        const prevSyn = S.synergyState(g);
        if (act === 'equip') { equipTo(s.i, t.uid); selItem = null; }
        else if (act === 'moveItem') {
          const id = S.findCat(g, s.uid).items[s.i];
          if (S.moveItem(g, s.uid, s.i, t.uid)) { sfx.play('equip'); buzz('ui'); toast(`${CAT_BY_ID[S.findCat(g, t.uid).id].name} got it`); pend = { q: `.slot[data-uid="${t.uid}"]`, rar: ITEM_BY_ID[id].rarity }; }
        } else if (act === 'unequip') {
          const id = S.findCat(g, s.uid).items[s.i];
          if (S.unequipItem(g, s.uid, s.i)) { sfx.play('pop'); selItem = null; pend = { q: `.bag[data-i="${g.stash.length - 1}"]`, rar: ITEM_BY_ID[id].rarity }; }
        } else if (act === 'sell') { selItem = s.i; acts.sell(); return; }
        else if (act === 'forge') { selItem = s.i; acts.forge(); return; }
        else if (act === 'catSwap') {
          const a = S.findCat(g, s.uid), b = S.findCat(g, t.uid);
          if (a.id === b.id && a.lvl === b.lvl && a.lvl < 3) { S.mergeCats(g, a.uid, b.uid); sfx.play('merge'); sfx.play('upgrade', 0.5); buzz('merge'); mergeFlash(S.TOWER_X, 330, a.lvl >= 3); toast(`Merged! ${CAT_BY_ID[a.id].name} is Lv ${a.lvl}`); pend = { q: `.slot[data-uid="${a.uid}"]`, rar: 'epic', label: `LV ${a.lvl}!`, burst: 24 }; }
          else { S.swapCats(g, a.uid, b.uid); sfx.play('pop'); pend = { q: `.slot[data-uid="${a.uid}"]`, rar: 'common' }; }
          sel = null;
        } else if (act === 'catMove') { if (S.moveCat(g, s.uid, t.zone)) { sfx.play('pop'); pend = { q: `.slot[data-uid="${s.uid}"]`, rar: 'common' }; } sel = null; }
        else if (act === 'release') { sel = s.uid; rel = true; }
        notifySyn(prevSyn);
        draw();
      },
    });
    // desktop: hovering a relic shows its details without a click
    root.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse' || root.classList.contains('dg-relic') || root.classList.contains('dg-worn') || root.classList.contains('dg-cat')) return;
      const w = e.target.closest('.islot.full'), b = e.target.closest('.bag:not(.empty)');
      const id = w ? S.findCat(g, +w.dataset.uid).items[+w.dataset.i] : b ? g.stash[+b.dataset.i] : null;
      if (id) setDetail(itemDetail(id));
    });
    root.addEventListener('pointerout', (e) => {
      if (e.pointerType !== 'mouse' || !e.target.closest('.islot.full, .bag')) return;
      const it = selItem != null && g.stash[selItem] ? itemDetail(g.stash[selItem]) : null;
      if (it) setDetail(it); else if (root.dataset.msg != null) setDetail(root.dataset.msg);
    });
  }
  draw();
  acts = {
    done: () => { if (S.overflow(g) > 0) { toast('Sell, forge or equip relics first'); return; } back(); },
    sell: () => { const v = S.sellItem(g, selItem); if (v) { sfx.play('coin'); toast(`Sold for +${v} coins`); pend = { q: '[data-act="sell"]', rar: 'common' }; } selItem = null; draw(); },
    forge: () => {
      const id = S.forgeItems(g, selItem);
      if (!id) { sfx.play('nope'); toast('Forging needs three relics of one rarity'); draw(); return; }
      sfx.play('merge'); toast(`Forged ${ITEM_BY_ID[id].name} (${ITEM_BY_ID[id].rarity})!`); puff(S.TOWER_X, 330, 14, '#c88aff', 160, 0.6);
      selItem = g.stash.length - 1; pend = [{ q: `.bag[data-i="${selItem}"]`, rar: ITEM_BY_ID[id].rarity }, { q: '[data-act="forge"]', rar: 'common' }]; draw();
    },
    bag: (d) => { selItem = selItem === +d.i ? null : +d.i; sel = null; sfx.play('pop'); draw(); },
    unequip: (d) => { if (S.unequipItem(g, +d.uid, +d.i)) { sfx.play('equip'); draw(); } else toast('Backpack is full: sell something first'); },
    release: () => {
      if (!sel) return;
      if (!rel) { rel = true; draw(); return; }
      if (g.cats.length + g.bench.length > 1) { S.releaseCat(g, sel); sel = null; }
      rel = false; if (!g.cats.length && g.bench.length) S.moveCat(g, g.bench[0].uid, 'tower'); draw();
    },
    slot: (d) => {
      rel = false;
      const zone = d.zone, i = +d.i, list = zone === 'tower' ? g.cats : g.bench, cat = list[i];
      const prevSyn = S.synergyState(g);
      if (selItem != null && cat) {
        equipTo(selItem, cat.uid);
        selItem = null; draw(); return;
      }
      if (!cat) {
        if (sel) {
          const c = S.findCat(g, sel);
          const fromTower = g.cats.includes(c);
          if ((zone === 'tower') !== fromTower && !(fromTower && g.cats.length === 1)) S.moveCat(g, sel, zone);
          sel = null;
        }
      } else if (sel === null) sel = cat.uid;
      else if (sel === cat.uid) sel = null;
      else {
        const a = S.findCat(g, sel);
        if (a.id === cat.id && a.lvl === cat.lvl && a.lvl < 3) { S.mergeCats(g, a.uid, cat.uid); sfx.play('merge'); buzz('merge'); mergeFlash(S.TOWER_X, 330, a.lvl >= 3); toast(`Merged! ${CAT_BY_ID[a.id].name} is Lv ${a.lvl}`); } else S.swapCats(g, sel, cat.uid);
        sel = null;
      }
      notifySyn(prevSyn);
      draw();
    },
  };
}

function recordCatStats(run) {
  const seen = new Set([...g.cats, ...g.bench].map((c) => c.id));
  const row = (id) => save.catStats[id] || (save.catStats[id] = { runs: 0, dmg: 0, kills: 0, best: 0, waves: 0 });
  for (const id of seen) { const s = row(id); s.runs++; s.best = Math.max(s.best, run.wave); s.waves = (s.waves != null ? s.waves : s.runs * 4) + run.wave; }   // waves feed cat mastery
  for (const [id, v] of Object.entries(run.byCat)) { const s = row(id); s.dmg += v.dmg; s.kills += v.kills; }
}
function commitRun() {
  if (runCommitted || !g) return [];
  runCommitted = true;
  const run = g.run, oldNests = save.stats.bossKills;
  run.maxCombo = maxComboRun;
  save.stats = mergeRun(save.stats, run);
  const fresh = checkUnlocks(save.stats, new Set(save.unlocked));
  save.unlocked.push(...fresh);
  run.earned = Math.floor(run.coins);
  save.kingdom.coins += run.earned;
  save.kingdom.earned += run.earned;
  run.gems = Math.floor(save.stats.bossKills / 6) - Math.floor(oldNests / 6);   // one gem for every sixth nest ever destroyed
  if (run.daily) {
    const book = run.weekly ? save.weekly : save.daily;
    const score = dailyScore(run), prev = book[run.daily];
    if (!prev && run.wave >= (run.weekly ? 15 : 12)) run.gems += 1;   // a gem has to be earned: reach wave 12 (15 in the weekly) the first time
    if (!prev || score > prev.best) book[run.daily] = { best: score, wave: run.wave };
    run.dailyScore = score;
  }
  const lt = ladderClears(run);                       // Nightmare ladder: reaching the wave on a tier unlocks the next one
  if (lt && lt > (save.ladder | 0)) { save.ladder = lt; run.ladderClear = lt; run.gems += 1; }
  save.kingdom.gems += run.gems;
  const lvBefore = {};
  for (const id in run.byCat) lvBefore[id] = masteryProgress(save.catStats[id]).lv;
  recordCatStats(run);
  run.mastered = Object.keys(lvBefore).filter((id) => masteryProgress(save.catStats[id]).lv > lvBefore[id]).map((id) => ({ id, lv: masteryProgress(save.catStats[id]).lv }));
  run.ach = checkAch(run);
  for (const a of run.ach) run.gems += a.gems;
  persist();
  return fresh;
}

function onOver() {
  mode = 'over';
  sfx.play('over'); sfx.music('calm');
  showOver(commitRun());
}
function showOver(fresh) {
  const r = g.run, best = save.stats.bestWave, k = save.kingdom, d = DIFFS[r.diff] || DIFFS.normal;
  const by = Object.entries(r.byCat).sort((a, b) => b[1].dmg - a[1].dmg), tot = Math.max(1, by.reduce((a, [, v]) => a + v.dmg, 0)), mx = Math.max(1, by[0] ? by[0][1].dmg : 1);
  const bars = by.slice(0, 6).map(([id, v], i) => `<div class="rb ${i === 0 ? 'mvp' : ''}"><img src="${thumbURL(id)}" alt=""><b>${CAT_BY_ID[id].name}</b><div class="bar"><i style="width:${(100 * v.dmg) / mx}%"></i></div><span>${num(v.dmg)} <em>${Math.round((100 * v.dmg) / tot)}%</em></span></div>`).join('');
  const dailyBox = r.daily ? `<div class="dailybox" id="dailyBox"><b>${(r.weekly ? weekInfo(r.daily) : dayInfo(r.daily)).mod.icon} ${r.weekly ? 'Weekly' : 'Daily'} score ${r.dailyScore}</b><span id="dailyMsg"></span></div>` : '';
  const bookLine = relicBookLine(runNewRelics, relicProgress(save.relics).got, ITEMS.length);
  const chips = (r.ach || []).map((a) => `<span class="tchip">&#127942; ${a.name}</span>`).concat(bookLine ? [`<span class="tchip">&#127873; ${bookLine}</span>`] : []);
  const trophies = chips.length ? `<div class="trow">${chips.join('')}</div>` : '';
  const goal = nextGoal(k), goalB = goal && BUILDING_BY_ID[goal.id];
  const goalLine = goalB ? (goal.need ? ` &middot; ${goalB.icon} ${goalB.name} needs ${num(goal.need)} more` : ` &middot; ${goalB.icon} ${goalB.name} is ready to upgrade`) : '';
  setScreen(`<h2>The stack has fallen</h2><p class="sub">${r.wave >= best && r.wave > 1 ? 'A new personal best!' : fallLine(r.wave)} <small>${d.icon} ${d.name} &middot; Chapter ${chapterOf(r.wave).n}${r.daily ? (r.weekly ? ' &middot; Weekly' : ' &middot; Daily') : ''}</small></p>${metaNotes(r)}
    <div class="overcols"><div><div class="stats"><div><b>${r.wave}</b>Wave reached</div><div><b>${r.kills}</b>Mice defeated</div><div><b>${r.bossKills}</b>Nests destroyed</div><div><b>${r.merges}</b>Merges</div>
      <div><b>${num(r.dmg)}</b>Damage dealt</div><div><b>${num(r.biggest)}</b>Biggest hit</div><div><b>${num(r.taken)}</b>Damage taken</div><div><b>${num(r.healed)}</b>Healed</div></div>
      <div class="earn">&#129689; <b id="earn" data-to="${r.earned}">0</b> <span>coins earned${r.gems ? ` &middot; &#128142; +${r.gems}` : ''}</span><small>Total ${num(k.coins)}${goalLine}</small>${r.daily ? '' : '<small class="rankmsg" id="rankMsg"></small>'}</div>${dailyBox}</div>
      <div class="rbars big"><div class="rh"><b>Who did the work</b></div>${bars || '<small>No damage dealt</small>'}</div></div>
    ${trophies}${fresh.length ? `<p class="sub">${freedLineFor(fresh.length)}</p><div class="newcats">${fresh.map((id) => catCard(id, { act: 'none' })).join('')}</div>` : ''}
    <div class="row overbtns tgrid gover"><button class="btn big" data-act="again">Try again</button><button class="btn green" data-act="kingdom">Kingdom${goal && !goal.need ? '<i class="bang">!</i>' : ''}</button><button class="btn amber" data-act="share">Share</button><button class="btn grey" data-act="title">Title</button></div>`, 'wide');
  acts = {
    share: (d, el) => {
      const ids = (g && g.cats && g.cats.length ? g.cats.map((c) => c.id) : Object.keys(r.byCat));
      if (el) el.textContent = '...';
      shareRun({ wave: r.wave, kills: r.kills, bossKills: r.bossKills, biggest: r.biggest, diff: (DIFFS[r.diff] || DIFFS.normal).name, daily: !!r.daily, cats: ids })
        .then((res) => { if (el && el.isConnected) el.textContent = 'Share'; if (res === 'downloaded') toast('Picture saved!'); });
    },
    setname: () => showNamePrompt(() => showOver(fresh)),
    again: () => startRun({ daily: !!r.daily && !r.weekly, weekly: !!r.weekly }), title: () => { g = null; showTitle(); }, kingdom: () => showKingdom(() => showOver(fresh)), none: () => {},
    sendscore: () => { const inp = screenEl.querySelector('input[data-n]'); if (inp) { save.name = inp.value.replace(/[^\w \-.']/g, '').slice(0, 12); persist(); } postDaily(); },
  };
  if ((r.ach || []).length) sfx.play('achieve');
  // the numbers count up one after another, a personal best gets a burst
  screenEl.querySelectorAll('.overcols .stats > div').forEach((box, i) => {
    box.style.setProperty('--i', i);
    const bn = box.querySelector('b'), to = /^\d+$/.test(bn.textContent) ? +bn.textContent : null;
    if (to && to > 1 && save.opt.motion) {
      const t0 = performance.now() + 120 + i * 90;
      const tk = (now) => { const u = Math.max(0, Math.min(1, (now - t0) / 700)); bn.textContent = Math.round(to * (1 - Math.pow(1 - u, 3))); if (u < 1 && bn.isConnected) requestAnimationFrame(tk); };
      bn.textContent = '0'; requestAnimationFrame(tk);
    }
  });
  // each freed cat flips in one after another with a burst and a meow
  screenEl.querySelectorAll('.newcats .card').forEach((c, i) => {
    c.style.setProperty('--i', i);
    if (!motionOn()) return;
    setTimeout(() => { if (!c.isConnected) return; const rc = c.getBoundingClientRect(); domBurst(rc.left + rc.width / 2, rc.top + rc.height / 2, 18, ['#ffd23f', '#fff', '#8fe3ff'], 'NEW CAT!'); sfx.play('newrelic'); if (fresh[i]) sfx.meow(fresh[i], 'happy'); buzz('pop'); }, 1250 + i * 350);
  });
  if (r.wave >= best && r.wave > 1 && save.opt.motion) setTimeout(() => { const sb = screenEl.querySelector('.sub'); if (!sb || !sb.isConnected) return; const rc = sb.getBoundingClientRect(); domBurst(rc.left + rc.width / 2, rc.top + rc.height / 2, 26, ['#ffd23f', '#fff', '#ff8fb7'], 'NEW BEST!'); sfx.play('achieve', 0.8); buzz('pop'); }, 700);
  const el = $('earn');
  if (el) {
    const to = +el.dataset.to, t0 = performance.now();
    const tick = (now) => { const u = Math.min(1, (now - t0) / 1100); el.textContent = Math.round(to * (1 - Math.pow(1 - u, 3))); if (u < 1 && el.isConnected) { requestAnimationFrame(tick); if (Math.random() < 0.3) sfx.play('coin'); } };
    requestAnimationFrame(tick);
  }
  if (r.daily) postDaily();
  else postRun(r);
}
// an ordinary run joins the all time ranking once, when the player has a name
function postRun(r) {
  const msg = $('rankMsg');
  if (!msg || r.wave < 3) return;
  if (!save.name) { msg.innerHTML = '<button class="linkbtn" data-act="setname">Pick a name to join the ranking</button>'; return; }
  if (r.rankSent) { msg.textContent = r.rankSent; return; }
  submitRun({ name: save.name, score: dailyScore(r), wave: r.wave, kills: r.kills }).then((res) => {
    r.rankSent = res.ok ? (rankOf(res.all, save.name) ? `Ranked #${rankOf(res.all, save.name)} all time` : 'Not in the top 50 yet') : '';
    const el = $('rankMsg');
    if (el && el.isConnected) el.textContent = r.rankSent;
  });
}
// send the daily score once there is a name; otherwise ask for one
function postDaily() {
  const r = g.run, msg = $('dailyMsg');
  if (!msg) return;
  if (!save.name) {
    msg.innerHTML = `<input type="text" maxlength="12" placeholder="Your name" data-n="1"><button class="btn small" data-act="sendscore">Send score</button>`;
    return;
  }
  if (r.sent) { msg.textContent = r.sent; return; }
  msg.textContent = 'Sending your score...';
  submitScore({ name: save.name, score: r.dailyScore, wave: r.wave, kills: r.kills, ...(r.weekly ? { type: 'weekly', week: r.daily } : { day: r.daily }) }).then((res) => {
    const el = $('dailyMsg');
    r.sent = res.ok ? `You are #${rankOf(res.top, save.name) || '?'} ${r.weekly ? 'this week' : 'today'}!` : res.status === 429 ? 'Please wait a few seconds, then tap Send score again.' : 'Could not reach the ranking list. Your score was not sent.';
    if (el && el.isConnected) {
      el.textContent = r.sent;
      // the rank lands like a result: a top three place bursts, first place is shouted
      const rk = res.ok ? rankOf(res.top, save.name) : 0, box = $('dailyBox');
      if (box && rk > 0 && motionOn()) {
        box.classList.remove('rankin'); void box.offsetWidth; box.classList.add('rankin');
        if (rk <= 3) { const rc = box.getBoundingClientRect(); domBurst(rc.left + rc.width / 2, rc.top + rc.height / 2, rk === 1 ? 34 : 20, rk === 1 ? ['#ffd23f', '#fff', '#ff8fb7'] : ['#8fd3ff', '#fff', '#ffd23f'], rk === 1 ? 'NUMBER ONE!' : 'TOP 3!'); sfx.play('achieve', rk === 1 ? 1.2 : 1); buzz('jackpot'); }
      }
    }
  });
}

function showPause() {
  if (!paused) sfx.play('pip', 0.7);   // a low blip as the game holds still
  paused = true;
  $('toasts').replaceChildren();   // old toasts would smear behind the blurred pause menu
  setScreen(`<h2 class="paused">Paused</h2><div class="pstat"><span>Chapter <b>${chapterOf(g.wave).n}</b></span><span>Wave <b>${g.wave}</b></span><span>Mice <b>${num(g.run.kills || 0)}</b></span><span>Coins <b>${num(g.run.coins || 0)}</b></span><span>Cats <b>${g.cats.length + g.bench.length}</b></span></div><div class="row"><button class="btn big" data-act="resume">Resume</button></div><div class="row tgrid g4"><button class="btn grey" data-act="stats">Team stats</button><button class="btn grey" data-act="settings">Settings</button><button class="btn grey" data-act="how">How to play</button><button class="btn red" data-act="quit">Give up</button></div>${matchMedia('(pointer: fine)').matches ? '<div class="hint">Keys: Space zoomies, 1-6 specials, A auto specials, F speed, P pause, M sound</div>' : ''}`);
  acts = {
    resume: () => {
      paused = false; closeScreen(); sfx.play('pick', 1.3);
      // coming back to the fight: a quick GO! and the cats hop, no countdown so the player is never held up
      if (motionOn() && g && mode === 'play') { txtFx(W / 2, 210, 'GO!', '#ffd23f', 44, 0.8); ring(g.towerX, GROUND - 60, 120, '#ffd23f', 0.4, 6); cheerHop = 0.4; buzz('tick'); }
    },
    stats: () => showStats(showPause),
    settings: () => showSettings(showPause),
    how: () => showHow(showPause),
    quit: (d, el) => {
      // one stray tap next to Settings must not end the run: the first tap asks, the second (within 3 s) gives up
      const r = confirmTap(quitArmed, performance.now() / 1000); quitArmed = r.armedAt;
      if (!r.fire) { if (el) { el.textContent = 'Tap again to give up'; setTimeout(() => { if (el.isConnected) el.textContent = 'Give up'; }, 3000); } return; }
      paused = false; if (g.wave > 1) commitRun(); g = null; showTitle();
    },
  };
}


// ---------------------------------------------------------------- HUD
function banner(txt, sub, boss) {
  const b = $('banner');
  b.className = '';
  b.innerHTML = `${txt}${sub ? `<small>${sub}</small>` : ''}`;
  void b.offsetWidth;
  const kind = boss || /NEST DESTROYED/.test(txt) ? ' boss' : /WAVE CLEARED/.test(txt) ? ' clear' : '';
  b.className = 'show' + kind;
  clearTimeout(banner.t);
  // reduced motion drops the animation (and with it the fade-out), so hide the plaque by timer instead
  if (document.body.classList.contains('nomotion')) banner.t = setTimeout(() => { b.className = ''; }, 2200);
}
function toast(txt) {
  if (document.body.classList.contains('scr')) $('toasts').replaceChildren();   // one at a time over a full screen
  sfx.play('pip');
  const el = document.createElement('div');
  el.className = /^Trophy:/.test(txt) ? 'toast trophy' : 'toast'; el.textContent = txt;
  $('toasts').appendChild(el);
  if (/^Trophy:/.test(txt)) { sfx.play('achieve', 0.9); buzz('jackpot'); requestAnimationFrame(() => { const r = el.getBoundingClientRect(); if (r.width) domBurst(r.left + r.width / 2, r.top + r.height / 2, 24, ['#ffd23f', '#fff6b0', '#ff9a3a', '#fff'], '\uD83C\uDFC6'); }); }   // a trophy pops with a gold burst and the cup rises above it
  setTimeout(() => el.remove(), 3300);
  while ($('toasts').children.length > 2) $('toasts').firstChild.remove();
}
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).innerHTML = v; } }
function pulse(id) { const el = $(id); el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
let coinShown = 0, meterT = 0;
const dpsHist = [];
function liveDps() {
  if (dpsHist.length < 2) return 0;
  const a = dpsHist[0], b = dpsHist[dpsHist.length - 1];
  return b.t - a.t > 0.5 ? (b.dmg - a.dmg) / (b.t - a.t) : 0;
}
function updateMeter() {
  const el = $('meter');
  if (!save.meter || !g || mode !== 'play') { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const cats = g.cats.slice().reverse(), max = Math.max(1, ...g.cats.map((c) => c.wDmg));
  el.innerHTML = `<div class="mh"><b>DPS</b><span>${num(liveDps())}</span></div>` + cats.map((c) => `<div class="mr ${c.ko ? 'ko' : ''}"><img src="${thumbURL(c.id)}" alt=""><div class="bar"><i style="width:${(100 * c.wDmg) / max}%"></i></div><span>${num(c.wDmg)}</span></div>`).join('');
}
function updateHud(dt) {
  const inRun = g && g.wave > 0 && mode !== 'title' && mode !== 'pick' && mode !== 'over';
  $('hud').style.display = inRun ? 'block' : 'none';
  if (!inRun) return;
  const playing = mode === 'play';
  setText('waveTxt', `Wave ${g.wave}`);
  { const pw = Math.round(100 * waveProgress(g.queue.length, g.enemies.length, waveTotal)) + '%'; if (hudCache.wprog !== pw) { hudCache.wprog = pw; $('waveProg').style.width = pw; } }
  setText('themeTxt', [THEMES[bdIdx] ? THEMES[bdIdx].name : '', bestTag(save.stats.bestWave)].filter(Boolean).join(' \u00B7 '));
  const inStage = ((g.wave - 1) % BOSS_EVERY) + 1;
  if (hudCache.pips !== inStage) { hudCache.pips = inStage; $('nestPips').innerHTML = Array.from({ length: BOSS_EVERY }, (_, i) => `<i class="${i === BOSS_EVERY - 1 ? 'boss' : ''} ${i + 1 <= inStage ? 'on' : ''} ${i + 1 === inStage ? 'nw' : ''}"></i>`).join(''); }
  const nest = g.enemies.find((e) => e.boss && !e.dead);
  $('bossBar').style.display = playing && nest ? 'block' : 'none';
  if (nest) {
    setText('bossName', nestTitle(g.wave, nest.name));
    setText('bossTrick', (NESTS.find((n) => n.id === nest.kind) || {}).trick || '');
    const pct = Math.max(0, 100 * nest.hp / nest.maxHp).toFixed(1) + '%';
    if (hudCache.bossPct !== pct) {
      const f = nest.hp / nest.maxHp, last = hudCache.bossF == null ? 1 : hudCache.bossF;
      hudCache.bossPct = pct; $('bossHp').style.width = pct; $('bossTrail').style.width = pct;
      if (motionOn() && f < last) {   // the bar flinches on every hit, and a threshold (75, 50, 25 percent) gets a bigger pulse and a sound
        const bb = $('bossBar'), t = performance.now();
        if (t - (hudCache.bossHitAt || 0) > 140) { hudCache.bossHitAt = t; bb.classList.remove('hit'); void bb.offsetWidth; bb.classList.add('hit'); }
        const cross = [0.75, 0.5, 0.25].find((x) => last > x && f <= x);
        if (cross) { bb.classList.remove('phase'); void bb.offsetWidth; bb.classList.add('phase'); sfx.play('stamp'); shake = Math.max(shake, 3); txtFx(nest.x, nest.y - 120, `${Math.round(cross * 100)}% LEFT!`, '#ffb0b0', 24, 1.0); buzz('hit'); }
      }
      hudCache.bossF = f;
    }
  } else { hudCache.bossPct = null; hudCache.bossF = null; }
  const zr = g.zoomT > 0, z = $('zoom');
  z.style.display = playing ? 'flex' : 'none';
  z.style.setProperty('--p', (zr ? 100 * g.zoomT / g.zoomMax : g.zoom) + '%');
  z.className = zr ? 'on' : g.zoom >= 100 ? 'ready' : '';
  if (coachEl && coachEl._hl === z) z.classList.add('tuthl');
  setText('zoomSub', zr ? 'GO!' : g.zoom >= 100 ? 'READY' : Math.floor(g.zoom) + '%');
  // coins count up smoothly, chests show while waiting to be opened
  coinShown += (g.run.coins - coinShown) * Math.min(1, dt * 7);
  if (Math.abs(g.run.coins - coinShown) < 0.5) coinShown = g.run.coins;
  setText('coinTxt', String(Math.floor(coinShown)));
  juiceCoins(dt);
  const ch = g.boxes.length;
  $('chestBox').style.display = ch > 0 ? 'flex' : 'none';
  setText('chestTxt', String(ch));
  if (ch > chestPrev && motionOn()) { const cb = $('chestBox'); cb.classList.remove('cbounce'); void cb.offsetWidth; cb.classList.add('cbounce'); }
  chestPrev = ch;
  const topBox = BOXES.filter((b) => g.boxes.includes(b.id)).pop();
  if (topBox && hudCache.box !== topBox.id) { hudCache.box = topBox.id; $('chestIco').innerHTML = `<img class="gi" alt="" src="${iconURL(topBox.icon)}">`; }
  $('bMeter').classList.toggle('on', !!save.meter);
  if (playing && g.state === 'fight' && g.zoom >= 100 && !zr && !save.tips.c5) coach('c5', 'The Zoomies button is full! Tap it, or press the Space key. Your cats get much faster for a few seconds.', 830, 104, 'right', { target: '#zoom', wait: true });
  const syn = S.synergyState(g), ssig = JSON.stringify(syn.counts) + JSON.stringify(syn.tiers);
  if (hudCache.syn !== ssig) {
    hudCache.syn = ssig;
    $('synBar').innerHTML = Object.entries(syn.counts).filter(([, n]) => n >= 2 || syn.tiers).map(([t, n]) => { const tier = syn.tiers[t] || 0; return tier ? `<span class="schip t${tier}" title="${SYNERGIES[t].name}: ${synergyText(t, tier)}">${SYNERGIES[t].icon} ${n}</span>` : ''; }).join('');
  }
  const csig = [g.route.id, g.daily ? g.daily.mod.id : '', g.diff.name].join('|');
  if (hudCache.chip !== csig) {
    hudCache.chip = csig;
    const bits = [];
    if (g.daily) bits.push(`${g.daily.mod.icon} ${g.daily.mod.name}`);
    else if (g.diff.name !== 'Normal') bits.push(`${g.diff.icon} ${g.diff.name}`);
    if (g.route.id !== 'trail') bits.push(`${g.route.icon} ${g.route.name}`);
    $('modeChip').innerHTML = bits.join(' &middot; '); $('modeChip').style.display = bits.length ? 'block' : 'none';
  }
  const sig = g.perm.join(',') + '|' + g.temp.map((t) => t.id + t.left).join(',');
  if (hudCache.snackSig !== sig) {
    hudCache.snackSig = sig;
    const counts = {};
    for (const id of g.perm) counts[id] = (counts[id] || 0) + 1;
    const chips = Object.entries(counts).map(([id, n]) => `<span class="chip pop" title="${SNACK_BY_ID[id].name}: ${SNACK_BY_ID[id].desc}">${SNACK_BY_ID[id].icon}${n > 1 ? ' x' + n : ''}</span>`)
      .concat(g.temp.map((t) => `<span class="chip temp pop" title="${SNACK_BY_ID[t.id].name}: ${SNACK_BY_ID[t.id].desc}">${SNACK_BY_ID[t.id].icon} ${t.left}w</span>`));
    $('snackBar').innerHTML = chips.join('');
    $('snackBar').style.display = chips.length ? 'flex' : 'none';
  }
  updateSpecials();
  meterT -= dt;
  if (meterT <= 0) { meterT = 0.4; updateMeter(); }
}

// ---------------------------------------------------------------- effects
const MAXFX = 440;
const TAU = Math.PI * 2;
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const glowCache = new Map();
function glowSprite(col, r) {
  const rr = Math.max(8, Math.ceil(r / 8) * 8), key = col + rr;
  let c = glowCache.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = rr * 2;
    const x = c.getContext('2d'), gr = x.createRadialGradient(rr, rr, 0, rr, rr, rr);
    gr.addColorStop(0, hexA(col, 1)); gr.addColorStop(0.3, hexA(col, 0.6)); gr.addColorStop(0.6, hexA(col, 0.18)); gr.addColorStop(1, hexA(col, 0));
    x.fillStyle = gr; x.fillRect(0, 0, rr * 2, rr * 2);
    glowCache.set(key, c);
  }
  return c;
}
function glow(x, y, r, col, a = 1) { ctx.globalAlpha = a; ctx.drawImage(glowSprite(col, r), x - r, y - r, r * 2, r * 2); }
const add = () => { ctx.globalCompositeOperation = 'lighter'; };
const norm = () => { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; };

const moods = new Map();
let nestPending = 0;   // seconds left to wait for the nest to appear after a boss intro
const pops = new Map();   // cats that just merged: a short squash and stretch bounce
const emote = (uid, glyph, life = 1.2) => spawnFx({ k: 'emote', uid, glyph, life, max: life });
function cheerRandom(chance) {
  if (Math.random() > chance) return;
  const al = S.aliveCats(g);
  if (!al.length) return;
  const c = al[Math.floor(Math.random() * al.length)];
  moods.set(c.uid, 1.3);
  if (Math.random() < 0.5) emote(c.uid, '\u2728', 0.9);
  if (Math.random() < 0.35) sfx.meow(c.id, 'happy');
}
let hitstop = 0, timeScale = 1, slowT = 0, zpunch = 0, towerWob = 0;
let combo = 0, comboT = 0, comboPulse = 0, celeb = 0;
let multiKill = 0, lastKillAt = 0, flawless = 0;
const MULTI_KILL = { 3: { t: 'TRIPLE!', c: '#ffd23f', s: 26, k: 2 }, 5: { t: 'MEGA KILL!', c: '#ff9a3a', s: 30, k: 4 }, 8: { t: 'RAMPAGE!', c: '#ff6a6a', s: 34, k: 6 }, 12: { t: 'UNSTOPPABLE!', c: '#ff8fb7', s: 38, k: 8 }, 18: { t: 'LEGENDARY!', c: '#c58aff', s: 42, k: 10 } };
let lastSmallHit = -1;
const hit = (t) => {
  // tiny stops (every swipe) are throttled so fast attackers do not stutter; crits, elites, KOs and bosses always land
  if (t < 0.025) { if (tAnim - lastSmallHit < 0.14) return; lastSmallHit = tAnim; }
  hitstop = Math.max(hitstop, t);
};
const slowmo = (sec, scale) => { slowT = sec; timeScale = scale; };

const spawnFx = (f) => { if (fx.length < Math.min(MAXFX, fxCap)) fx.push(f); };
function puff(x, y, n, col, sp = 90, life = 0.5, r = 4, grav = 120) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7);
    spawnFx({ k: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.3, life, max: life, r: r * (0.5 + Math.random() * 0.7), col, grav });
  }
}
function sparks(x, y, n, col, sp = 220, life = 0.35) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = sp * (0.4 + Math.random() * 0.8);
    spawnFx({ k: 'sp', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: life * (0.6 + Math.random() * 0.6), max: life, col });
  }
}
function smoke(x, y, n, r = 10, col = '#d9d2e6') {
  for (let i = 0; i < n; i++) spawnFx({ k: 'sm', x: x + (Math.random() - 0.5) * 12, y, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, r, life: 0.7, max: 0.7, col });
}
const CONF = ['#ff8fb7', '#ffd23f', '#8fe0b4', '#8fd3ff', '#c9a6ff', '#ffffff'];
const CHEESE = ['#ffd23f', '#fff6b0', '#ffffff', '#ffc02a'];
function confetti(x, y, n, spread = 320, cols = CONF) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = spread * (0.4 + Math.random() * 0.8);
    spawnFx({ k: 'cf', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16, col: cols[i % cols.length], life: 1.4 + Math.random() * 0.8, max: 2.2 });
  }
}
const txtFx = (x, y, t, col = '#fff', size = 15, life = 0.8, pop = true) => spawnFx({ k: 't', x: x + (Math.random() - 0.5) * 14, y, t, col, size, life, max: life, pop });
const ring = (x, y, r, col, life = 0.35, w = 4) => spawnFx({ k: 'r', x, y, r, col, life, max: life, w });
const bolt = (pts, col, w, life = 0.16) => spawnFx({ k: 'l', pts, col, w, life, max: life });
const flashGlow = (x, y, r, col, life = 0.25) => spawnFx({ k: 'g', x, y, r, col, life, max: life });
const screenFlash = (col, life = 0.12) => { if (save.opt.motion) spawnFx({ k: 'flash', life, max: life, col }); };

function catPos(uid) {
  const alive = S.aliveCats(g);
  const i = alive.findIndex((c) => c.uid === uid);
  return { x: g.towerX, y: GROUND - 50 - Math.max(0, i) * SLOT };
}
const atkColor = (id) => (CAT_BY_ID[id] && CAT_BY_ID[id].atk.color) || '#fff2b0';

// a jagged line from (x0,y0) to (x1,y1) for lightning and beams
function jag(x0, y0, x1, y1, n = 8, amp = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const u = i / n, k = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 2 * amp; pts.push({ x: x0 + (x1 - x0) * u + k * 0.4, y: y0 + (y1 - y0) * u + k }); }
  return pts;
}
// each special move gets its own look on top of the shared ring and flash
function specialVfx(e, p, col) {
  const foes = g.enemies.filter((m) => !m.dead && !m.under && m.x > g.towerX && m.x < S.W + 20).sort((a, b) => a.x - b.x);
  const top = p.y - 20;
  switch (e.kind) {
    case 'frenzy':
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; bolt(jag(p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30, p.x + Math.cos(a) * 110, p.y + Math.sin(a) * 110, 3, 6), col, 2.4, 0.22); }
      if (e.id === 'leo') {   // the Royal Roar: golden shockwaves roll across the field
        for (let r = 0; r < 4; r++) ring(p.x + 60 + r * 70, p.y - 10, 90 + r * 40, '#ffe27a', 0.55 + r * 0.08, 6);
        flashGlow(p.x + 40, p.y - 20, 200, '#ffd23f', 0.6); screenFlash('rgba(255,220,120,.22)', 0.16);
      }
      // three claw marks across each of the nearest mice
      for (const m of foes.slice(0, 4)) {
        for (const o of [-9, 0, 9]) bolt([{ x: m.x - 24 + o, y: m.y - 50 }, { x: m.x + 24 + o, y: m.y - 2 }], '#fff6dc', 3, 0.3);
        sparks(m.x, m.y - 26, 4, col, 160, 0.3);
      }
      break;
    case 'fortress':
      for (const r of [80, 112, 146]) ring(p.x, p.y - SLOT * 0.5, r, '#bfe3ff', 0.5 + r / 400, 7);
      flashGlow(p.x, p.y - SLOT * 0.5, 190, '#9ad0ff', 0.6);
      break;
    case 'inferno':
      for (let x = p.x + 50; x < S.W - 40; x += 26) spawnFx({ k: 'f', x, y: GROUND - 10 - Math.random() * 14, vy: -50 - Math.random() * 60, r: 22 + Math.random() * 16, life: 0.55 + Math.random() * 0.5, max: 1.05 });
      flashGlow(p.x + 280, GROUND - 30, 320, '#ff8a2b', 0.5); smoke(p.x + 200, GROUND - 40, 3, 16, '#6a5a60');
      break;
    case 'storm':
      for (const m of foes.slice(0, 8)) { bolt(jag(m.x + (Math.random() - 0.5) * 60, 0, m.x, m.y - 10, 9, 18), '#bfe6ff', 3, 0.28); sparks(m.x, m.y - 10, 5, '#fff6b0', 200, 0.3); flashGlow(m.x, m.y - 10, 50, '#bfe6ff', 0.3); }
      screenFlash('rgba(190,230,255,.28)', 0.14);
      break;
    case 'volley':
      flashGlow(p.x + 24, top, 110, col, 0.6); sparks(p.x + 24, top, 8, '#fff6c8', 260, 0.3);   // muzzle flash
      for (const m of foes.slice(0, 7)) {
        const line = jag(p.x + 24, top, m.x, m.y - 12, 4, 5);
        bolt(line, col, 3.2, 0.22); bolt(line, '#ffffff', 1.2, 0.22);   // a white-hot core inside the coloured tracer
        puff(m.x, m.y - 12, 3, col, 70, 0.3, 3); flashGlow(m.x, m.y - 12, 60, '#fff2c0', 0.4); sparks(m.x, m.y - 12, 4, '#ffe9a8', 180, 0.3);
      }
      break;
    case 'freeze':
      ring(p.x, p.y, 520, '#e6f7ff', 0.55, 12); ring(p.x, p.y, 340, '#bfeaff', 0.45, 8);
      for (const m of foes) { puff(m.x, m.y - 14, 7, '#e6f7ff', 90, 0.6, 3, -20); sparks(m.x, m.y - 14, 4, '#ffffff', 120, 0.45); }
      screenFlash('rgba(190,234,255,.3)', 0.3);
      break;
    case 'snipe': {
      const m = foes.slice().sort((a, b) => b.hp - a.hp)[0];
      if (m) { bolt([{ x: p.x + 30, y: top }, { x: m.x, y: m.y - 14 }], '#ffffff', 4.2, 0.3); ring(m.x, m.y - 14, 60, col, 0.45, 8); sparks(m.x, m.y - 14, 12, col, 260, 0.4); flashGlow(m.x, m.y - 14, 90, col, 0.4); }
      break;
    }
    case 'barrage':
      for (const m of (foes.length ? foes : [{ x: 600, y: GROUND - 20 }]).slice(0, 7)) {
        flashGlow(m.x, m.y - 10, 80, col, 0.4); ring(m.x, m.y - 10, 54, '#ffffff', 0.4, 6); puff(m.x, m.y - 10, 6, col, 140, 0.5, 4);
        if (e.id === 'pearl') puff(m.x, m.y - 24, 8, '#e8fbff', 90, 0.7, 3, -70);   // Tidal Wave: droplets spray upward
      }
      if (e.id === 'pearl') { ring(p.x + 150, GROUND - 10, 140, '#bff4ff', 0.6, 8); ring(p.x + 280, GROUND - 10, 170, '#8fe6ff', 0.6, 6); flashGlow(p.x + 200, GROUND - 20, 200, '#6fd8ff', 0.3); }
      break;
    case 'heal':
      for (let i = 0; i < 12; i++) spawnFx({ k: 'h', x: p.x + (Math.random() - 0.5) * 90, y: p.y + 20 - Math.random() * SLOT * 2.5, life: 1.2 + Math.random() * 0.5, max: 1.7 });
      flashGlow(p.x, p.y - SLOT * 0.6, 170, '#9effc6', 0.7); ring(p.x, p.y, 130, '#c6ffdc', 0.6, 7);
      break;
    case 'meteor': {
      const m = foes[Math.floor(foes.length / 2)] || { x: 600, y: GROUND - 20 };
      bolt([{ x: m.x + 260, y: -30 }, { x: m.x, y: m.y - 6 }], '#ffb040', 7, 0.35); bolt([{ x: m.x + 260, y: -30 }, { x: m.x, y: m.y - 6 }], '#ffffff', 2.5, 0.35);
      ring(m.x, m.y, 150, '#ff9a3a', 0.6, 12); flashGlow(m.x, m.y, 240, '#ff7a20', 0.6); puff(m.x, m.y, 18, '#ff9a3a', 220, 0.7, 6); smoke(m.x, m.y, 4, 18, '#5a4a50'); shake = Math.max(shake, 9);
      break;
    }
    case 'toxin':
      for (const m of foes) { smoke(m.x, m.y - 8, 3, 16, '#7ee08a'); puff(m.x, m.y - 14, 4, '#a8f0b0', 60, 0.6, 3, -30); }
      flashGlow(S.W * 0.6, GROUND - 40, 360, '#5ad07a', 0.5);
      break;
    case 'anthem':
      ring(p.x, p.y, 190, '#ffe08a', 0.6, 6); ring(p.x, p.y, 120, '#fff6c8', 0.5, 5);
      // the song: notes drift up and across the field
      for (let i = 0; i < 12; i++) txtFx(p.x + 20 + i * 38 + Math.random() * 20, p.y + 30 - Math.random() * 90, i % 2 ? '\u266B' : '\u266A', ['#ffe08a', '#ffb3d9', '#bfe6ff', '#c8ffb0'][i % 4], 28, 1.3 + Math.random() * 0.5, false);
      break;
    case 'hex':
      for (const m of foes) { ring(m.x, m.y - 10, 34, '#c9a6ff', 0.6, 4); ring(m.x, m.y - 10, 20, '#e6d4ff', 0.5, 3); sparks(m.x, m.y - 30, 4, '#c9a6ff', 80, 0.5); txtFx(m.x, m.y - m.h - 12, 'HEX!', '#d9b8ff', 20, 1.1); }
      flashGlow(p.x, p.y, 140, '#a070ff', 0.5);
      break;
    case 'phase':
      ring(p.x, p.y - SLOT * 0.5, 120, '#e4dcff', 0.6, 10); flashGlow(p.x, p.y - SLOT * 0.5, 170, '#d8ccff', 0.6);
      for (let i = 0; i < 10; i++) spawnFx({ k: 'p', x: p.x + (Math.random() - 0.5) * 70, y: p.y + 10 - Math.random() * SLOT * 2, vx: 0, vy: -50 - Math.random() * 40, life: 0.8, max: 0.8, r: 3 + Math.random() * 3, col: '#efe9ff', grav: -10 });
      break;
    case 'supernova':
      for (const [r, w] of [[260, 14], [420, 10], [640, 7]]) ring(p.x, p.y, r, '#fff6d0', 0.6 + r / 900, w);
      flashGlow(p.x, p.y, 380, '#fff2b0', 0.7); sparks(p.x, p.y, 28, '#fff2b0', 420, 0.7);
      for (const m of foes) { flashGlow(m.x, m.y - 10, 70, '#fff2b0', 0.4); sparks(m.x, m.y - 10, 4, '#ffffff', 200, 0.35); }
      screenFlash('rgba(255,248,214,.4)', 0.3); shake = Math.max(shake, 10);
      break;
    default: break;
  }
}

function handle(e) {
  switch (e.k) {
    case 'dmg':
      if (e.dot) {   // burn and poison ticks: small, coloured, short, and dropped when the screen is already busy
        if (fx.length < fxCap * 0.7 && e.v >= 0.5) txtFx(e.x, e.y, Math.max(1, Math.round(e.v)), e.dot === 'burn' ? '#ff9a3a' : '#8be05a', 11, 0.55);
        break;
      }
      if (e.v >= 1) txtFx(e.x, e.y, Math.round(e.v), e.crit ? '#ffe14d' : '#ffffff', e.crit ? 24 : 14, e.crit ? 0.95 : 0.65);
      if (e.crit) { sparks(e.x, e.y, 6, '#ffe14d', 180, 0.3); hit(0.03); shake = Math.max(shake, 2.5); buzz('crit'); }
      break;
    case 'kill': {
      if (e.quiet) { puff(e.x, e.y, 3, '#ffffff', 60, 0.4); break; }
      combo++; comboT = 2.4; comboPulse = 1; maxComboRun = Math.max(maxComboRun, combo); cheerRandom(0.12);
      if (combo === 50) for (const a of checkAch({ ...g.run, maxCombo: combo })) toast(`Trophy: ${a.name}!`);
      spawnFx({ k: 'corpse', type: e.type, elite: e.elite, x: e.x, y: e.y, vx: 60 + Math.random() * 90, vy: -230 - Math.random() * 90, rot: 0, vr: 6 + Math.random() * 8, life: 0.7, max: 0.7 });
      puff(e.x, e.y, e.elite ? 14 : 6, e.elite ? '#ffd23f' : '#ffffff', 110, 0.5, 4);
      sparks(e.x, e.y, e.elite ? 12 : 5, e.elite ? '#ffd23f' : '#fff6b0', 190, 0.3);
      spawnFx({ k: 's', x: e.x, y: e.y - 6, life: 0.4, max: 0.4 });
      flashGlow(e.x, e.y - 8, e.elite ? 54 : 34, '#ffffff', 0.32);
      for (let i = 0; i < (e.elite ? 7 : 4); i++) spawnFx({ k: 'sp', x: e.x, y: e.y - 10, vx: (Math.random() - 0.3) * 200, vy: -120 - Math.random() * 140, col: e.elite ? '#ffd23f' : '#ffe9c8', life: 0.55, max: 0.55 });
      if (e.elite) { flashGlow(e.x, e.y, 70, '#ffd23f', 0.35); hit(0.05); shake = Math.max(shake, 4); }
      sfx.play('pop', Math.min(2.2, 1 + combo * 0.035));
      if (combo === 10 || combo === 25 || combo === 50 || combo === 100) { txtFx(g.towerX + 70, 250, combo + ' COMBO!', '#ff8fb7', 30, 1.3); sfx.play('pick'); zpunch = Math.max(zpunch, 0.02); }
      // kills that land in quick succession get a named callout that grows with the streak
      const nowT = performance.now();
      multiKill = nowT - lastKillAt < 650 ? multiKill + 1 : 1; lastKillAt = nowT;
      const MK = MULTI_KILL[multiKill];
      if (MK) {
        txtFx(e.x, e.y - 40, MK.t, MK.c, MK.s, 1.2);
        ring(e.x, e.y - 10, 60 + multiKill * 6, MK.c, 0.45, 5); flashGlow(e.x, e.y - 10, 90, MK.c, 0.4);
        shake = Math.max(shake, MK.k); if (MK.k >= 6) { hit(0.05); screenFlash('rgba(255,240,180,.18)', 0.18); }
        sfx.play('pick', 1 + multiKill * 0.04); buzz('pop');
      }
      break;
    }
    case 'swipe':
      spawnFx({ k: 'a', x: e.x, y: e.y, wide: e.wide, life: 0.2, max: 0.2 });
      sparks(e.x, e.y, 4, '#ffffff', 170, 0.22); hit(0.018);
      sfx.play('swipe'); break;
    case 'flame':
      for (let i = 0; i < 9; i++) spawnFx({ k: 'f', x: e.x + Math.random() * e.len, y: e.y + (Math.random() - 0.5) * (6 + i * 4), vy: -34 - Math.random() * 34, r: 12 + Math.random() * 14, life: 0.38, max: 0.38 });
      sparks(e.x + e.len * (0.4 + Math.random() * 0.6), e.y, 2, '#ffb040', 120, 0.45);
      sfx.play('flame'); break;
    case 'chain': {
      const pts = [];
      for (let i = 0; i < e.pts.length - 1; i++) {
        const a = e.pts[i], b = e.pts[i + 1], n = 6;
        for (let j = 0; j < n; j++) pts.push({ x: a.x + (b.x - a.x) * j / n + (j ? (Math.random() - 0.5) * 14 : 0), y: a.y + (b.y - a.y) * j / n + (j ? (Math.random() - 0.5) * 14 : 0) });
      }
      pts.push(e.pts[e.pts.length - 1]);
      bolt(pts, '#bfe6ff', 3.2, 0.22);
      for (const p of e.pts.slice(1)) { sparks(p.x, p.y, 4, '#fff6a0', 150, 0.25); flashGlow(p.x, p.y, 26, '#bfe6ff', 0.2); }
      sfx.play('zap'); break;
    }
    case 'beam':
      bolt([{ x: e.x, y: e.y }, { x: e.x2, y: e.y2 }], '#ff7be8', 9, 0.26); bolt([{ x: e.x, y: e.y }, { x: e.x2, y: e.y2 }], '#ffffff', 3, 0.26);
      flashGlow(e.x + 10, e.y, 34, '#ff7be8', 0.25); hit(0.03); sfx.play('zap'); break;
    case 'pellet': bolt([{ x: e.x, y: e.y }, { x: e.x2, y: e.y2 }], '#ffd27a', 3, 0.1); bolt([{ x: e.x, y: e.y }, { x: e.x2, y: e.y2 }], '#ffffff', 1.1, 0.1); flashGlow(e.x + 6, e.y, 22, '#ffe9a0', 0.14); sparks(e.x2, e.y2, 2, '#ffe9a0', 150, 0.22); if (Math.random() < 0.5) smoke(e.x2, e.y2 + 4, 1, 5, '#cbbfa0'); break;
    case 'shoot':
      flashGlow(e.x + 16, e.y, e.big ? 40 : 24, atkColor(e.id), e.big ? 0.18 : 0.12);
      if (e.big) { sparks(e.x + 18, e.y, 8, '#ffe9a0', 280, 0.25); smoke(e.x + 24, e.y, 2, 8); shake = Math.max(shake, 4); }
      sfx.play(e.big ? 'bang' : 'shoot'); break;
    case 'boom': {
      const col = e.color || '#ffb02e';
      ring(e.x, e.y, e.r * 1.1, col, 0.4, 6);
      flashGlow(e.x, e.y, e.r * 1.5, '#fff2c0', 0.3); flashGlow(e.x, e.y, e.r * 1.2, col, 0.4);
      sparks(e.x, e.y, 10 + (e.r > 60 ? 8 : 0), col, 260, 0.4);
      puff(e.x, e.y, 6, col, 120, 0.45, 5); smoke(e.x, e.y, e.r > 60 ? 4 : 2, 12, '#b8aab8');
      if (e.r > 60) { shake = Math.max(shake, 6); hit(0.04); }
      sfx.play('boom'); break;
    }
    case 'bolt':
      bolt([{ x: e.x + 10, y: -10 }, { x: e.x - 12, y: e.y * 0.35 }, { x: e.x + 8, y: e.y * 0.65 }, { x: e.x, y: e.y }], '#fff27a', 6, 0.28);
      screenFlash('rgba(255,255,200,.3)', 0.1); flashGlow(e.x, e.y, 50, '#fff27a', 0.3); sparks(e.x, e.y, 8, '#fff27a', 240, 0.3); hit(0.04); shake = Math.max(shake, 3);
      sfx.play('zap'); break;
    case 'star': bolt([{ x: e.x + 90, y: e.y - 160 }, { x: e.x, y: e.y }], '#ffe9a0', 4, 0.25); flashGlow(e.x, e.y, 28, '#ffe9a0', 0.25); break;
    case 'nova': ring(e.x, e.y, e.r, '#bfeaff', 0.5, 10); ring(e.x, e.y, e.r * 0.7, '#ffffff', 0.4, 4); flashGlow(e.x, e.y, e.r * 0.8, '#bfeaff', 0.35); sparks(e.x, e.y, 14, '#e8f8ff', 260, 0.45); shake = Math.max(shake, 4); sfx.play('zap'); break;
    case 'ko': { const kc = S.findCat(g, e.uid); if (kc) sfx.meow(kc.id, 'sad'); emote(e.uid, '\uD83D\uDCAB', 1.6); const p = catPos(e.uid); txtFx(p.x, p.y - 30, 'KO!', '#ff8a8a', 26, 1.2); puff(p.x, p.y, 10, '#ffd1e0', 100, 0.6); sparks(p.x, p.y, 8, '#ff8a8a', 200, 0.4); shake = Math.max(shake, 9); hit(0.1); slowmo(0.5, 0.4); screenFlash('rgba(255,80,80,.22)', 0.25); sfx.play('ko'); buzz('ko'); break; }
    case 'revive': { const rc = S.findCat(g, e.uid); if (rc) { sfx.meow(rc.id, 'happy'); moods.set(e.uid, 1.5); } const p = catPos(e.uid); txtFx(p.x, p.y - 30, 'Back up!', '#fff6b0', 22, 1.2); puff(p.x, p.y, 12, '#fff6b0', 100, 0.7); flashGlow(p.x, p.y, 70, '#fff6b0', 0.5); sfx.play('heal'); break; }
    case 'heal': { if (Math.random() < 0.25) emote(e.uid, '\u2764\uFE0F', 1); const p = catPos(e.uid); txtFx(p.x - 46, p.y - 20, '+' + Math.round(e.v), '#7dffb0', 16, 0.9); break; }
    case 'healfx': for (let i = 0; i < 3; i++) spawnFx({ k: 'h', x: e.x + (Math.random() - 0.5) * 50, y: e.y - 10, life: 0.9, max: 0.9 }); sfx.play('heal'); break;
    case 'cathit': { if (Math.random() < 0.18) emote(e.uid, '\uD83D\uDCA2', 0.8); const p = catPos(e.uid); txtFx(p.x - 56, p.y, Math.round(e.v), '#ff8a8a', 15, 0.7); sparks(p.x + 14, p.y - 8, 4 + Math.min(5, Math.floor(e.v / 12)), '#ff9a8a', 170, 0.3); flashGlow(p.x + 10, p.y - 8, 34, '#ff6a6a', 0.3); ring(p.x + 8, p.y - 8, 28, '#ffb0a0', 0.22, 3); if (e.v >= 8) puff(p.x + 12, p.y - 4, 3, '#e8d4c4', 55, 0.35, 3, 40); towerWob = 1; shake = Math.max(shake, 1.8); sfx.play('hit'); buzz('hit'); break; }
    case 'coin': if (fx.length < 300) { sparks(e.x, e.y - 6, 2, '#ffe27a', 110, 0.25); flashGlow(e.x, e.y - 6, 16, '#ffd23f', 0.25); } if (fx.length < 300) spawnFx({ k: 'fly', x: e.x, y: e.y, sx: e.x, sy: e.y, tx: 52, ty: 72, life: 0.7 + Math.random() * 0.2, max: 0.8, kind: 'coin', ox: (Math.random() - 0.5) * 160, oy: -60 - Math.random() * 60 }); break;
    case 'chest': if (save.opt.motion && !document.body.classList.contains('nomotion')) { const dx = (Math.random() < 0.5 ? -1 : 1) * (22 + Math.random() * 16); spawnFx({ k: 'fly', x: e.x, y: e.y, sx: e.x, sy: e.y, lx: e.x + dx, tx: 150, ty: 72, life: DROP_T, max: DROP_T, kind: 'chest', tier: e.tier, ox: 0, oy: -70, drop: 1, landed: 0 }); } else spawnFx({ k: 'fly', x: e.x, y: e.y, sx: e.x, sy: e.y, tx: 150, ty: 72, life: 1.0, max: 1.0, kind: 'chest', tier: e.tier, ox: 0, oy: -90 }); sparks(e.x, e.y, 14, '#ffd23f', 240, 0.55); ring(e.x, e.y - 6, 54, '#fff3b8', 0.45, 4); flashGlow(e.x, e.y - 10, 70, '#ffe27a', 0.5); spawnFx({ k: 's', x: e.x, y: e.y - 14, life: 0.5, max: 0.5 }); txtFx(e.x, e.y - 20, e.tier ? BOX_BY_ID[e.tier].name : 'Box!', '#ffd23f', 20, 1); sfx.play('chest'); break;
    case 'shieldhit': { const p = catPos(e.uid); ring(p.x, p.y - 10, e.broke ? 70 : 46, '#8fe8ff', e.broke ? 0.5 : 0.28, e.broke ? 6 : 3); if (e.broke) { txtFx(p.x - 46, p.y - 6, 'Barrier down', '#bff4ff', 16, 0.9); sparks(p.x, p.y - 10, 10, '#bff4ff', 190, 0.4); } break; }
    case 'undying': { const p = catPos(e.uid); txtFx(p.x - 56, p.y - 24, 'Second chance!', '#ffe27a', 22, 1.5); ring(p.x, p.y - 10, 100, '#fff2a0', 0.7, 8); flashGlow(p.x, p.y - 10, 140, '#fff2a0', 0.6); sparks(p.x, p.y - 10, 20, '#fff6b0', 260, 0.7); sfx.play('heal'); break; }
    case 'dodge': { const p = catPos(e.uid); txtFx(p.x - 40, p.y, 'Dodge!', '#b9f5ff', 18, 0.8); ring(p.x, p.y - 10, 44, '#d9f8ff', 0.35, 3); sparks(p.x, p.y - 10, 6, '#ffffff', 150, 0.3); break; }
    case 'ehit': sparks(e.x, e.y, 3, '#ffffff', 130, 0.2); break;
    case 'spawn': smoke(e.x, e.y, 1, 7, '#d9c9a0'); puff(e.x, e.y - 10, 3, '#d9c9a0', 50, 0.4, 4); ring(e.x, e.y + 2, 22, '#e8dcb8', 0.28, 3); break;
    case 'roar': shake = Math.max(shake, 13); zpunch = Math.max(zpunch, 0.03); txtFx(e.x, e.y, 'SQUEAK!', '#ff9a9a', 32, 1.1); screenFlash('rgba(255,40,40,.18)', 0.3); sfx.play('roar'); buzz('boss'); break;
    case 'bossDown': {
      ring(e.x, e.y - 60, 200, '#fff6b0', 0.9, 14); ring(e.x, e.y - 60, 120, '#ffffff', 0.6, 8);
      flashGlow(e.x, e.y - 60, 260, '#fff2c0', 0.7);
      puff(e.x, e.y - 60, 40, '#ffd23f', 280, 1, 7); sparks(e.x, e.y - 60, 40, '#fff6b0', 420, 0.8); smoke(e.x, e.y - 40, 8, 22, '#b8aab8');
      const calm = !save.opt.motion;   // reduced motion: only a soft glow and the meow text
      if (!calm) confetti(e.x, e.y - 60, 80, 420, CHEESE);
      // the freed cat: hearts and sparks lift off from where its cage hung (see nestOverlay)
      for (let i = 0; i < (calm ? 3 : 9); i++) spawnFx({ k: 'h', x: e.x + 68 + (Math.random() - 0.5) * 40, y: e.y - 22 - Math.random() * 30, life: 1.3 + Math.random() * 0.6, max: 1.9 });
      sparks(e.x + 68, e.y - 30, calm ? 4 : 16, '#ffe9a8', 260, 0.8);
      txtFx(e.x + 68, e.y - 70, 'Meow!', '#fff3b0', 26, 1.1);
      if (!calm) {
        const nst = g && (g.enemies.find((m) => m.boss) || {}), nk = nst.kind || NESTS[0].id;
        spawnFx({ k: 'nest', x: e.x, y: e.y, kind: nk, life: 0.9, max: 0.9 });   // the nest sprite shakes, sinks and cracks apart
        for (let i = 0; i < 10; i++) spawnFx({ k: 'cf', x: e.x + (Math.random() - 0.5) * 120, y: e.y - 30 - Math.random() * 50, vx: (Math.random() - 0.5) * 240, vy: -60 - Math.random() * 160, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, col: i % 2 ? '#c9a878' : '#8a6c4a', life: 0.9, max: 0.9 });   // crumbs
        spawnFx({ k: 'sil', x: e.x + 68, y: e.y - 20, id: CATS[(g ? g.run.bossKills : 0) % CATS.length].id, life: 1.2, max: 1.2 });   // the caged cat hops out
        shake = 20; zpunch = 0.07; hit(0.16); slowmo(1.2, 0.28); screenFlash('rgba(255,255,230,.6)', 0.4);
      } else flashGlow(e.x, e.y - 60, 200, '#fff6c0', 0.5);
      sfx.play('nestdown'); buzz('boss');
      sfx.meow('caged' + (g ? g.run.bossKills : 0), 'cheer', 0.55);   // the freed cat's happy mew from the broken cage, a different voice each nest
      break;
    }
    case 'zoom': banner('ZOOMIES!', '', false); screenFlash('rgba(255,160,210,.25)', 0.25); zpunch = Math.max(zpunch, 0.03); sfx.play('zoom'); break;
    case 'nine': txtFx(S.TOWER_X + 40, 260, 'NINE LIVES!', '#ffd23f', 36, 1.6); puff(S.TOWER_X, 330, 30, '#ffd23f', 200, 0.9, 6); flashGlow(S.TOWER_X, 330, 200, '#ffd23f', 0.6); screenFlash('rgba(255,230,120,.35)', 0.4); sfx.play('heal'); break;
    case 'special': {
      const p = catPos(e.uid), col = e.color || '#ffd23f';
      ring(p.x, p.y, 120, col, 0.55, 10); ring(p.x, p.y, 70, '#ffffff', 0.4, 5); ring(p.x, p.y, 170, col, 0.7, 4); if (motionOn()) pops.set(e.uid, 0.55);
      flashGlow(p.x, p.y, 120, col, 0.6); sparks(p.x, p.y, 16, col, 300, 0.5);
      txtFx(p.x + 60, p.y - 56, e.name + '!', col, 28, 1.3);
      screenFlash(col.length === 7 ? col + '33' : 'rgba(255,255,255,.2)', 0.22);
      shake = Math.max(shake, 5); hit(0.06); slowmo(0.35, 0.3); sfx.play('special'); sfx.meow(e.id, 'happy');
      specialVfx(e, p, col);
      if (e.kind === 'anthem') for (let i = 0; i < 8; i++) spawnFx({ k: 'h', x: p.x + (Math.random() - 0.3) * 160, y: p.y - 20, life: 1.2, max: 1.2 });
      break;
    }
    case 'shieldbreak': sfx.play('shield');  ring(e.x, e.y, 46, '#8fd0ff', 0.4, 6); sparks(e.x, e.y, 12, '#cfe8ff', 240, 0.4); flashGlow(e.x, e.y, 44, '#8fd0ff', 0.4); sfx.play('pop', 0.6); break;
    case 'leap': puff(e.x, e.y - 8, 6, '#d9c9a0', 90, 0.4, 4); ring(e.x, e.y + 2, 26, '#e8dcb8', 0.25, 3); break;
    case 'dig': puff(e.x, e.y, 14, '#8a6a48', 150, 0.6, 5); ring(e.x, e.y + 4, 42, '#a07a52', 0.35, 5); smoke(e.x, e.y, 2, 10, '#9a7a58'); shake = Math.max(shake, 2); sfx.play('pop', 0.5); break;
    case 'bubble': ring(e.x, e.y, 90, '#cfc0ff', 0.5, 6); flashGlow(e.x, e.y, 110, '#cfc0ff', 0.5); sfx.play('route'); break;
    case 'merge': {
      const mc = S.findCat(g, e.uid), p = catPos(e.uid), max = mc && mc.lvl >= 3;
      if (mc) sfx.meow(mc.id, max ? 'cheer' : 'happy', 0.1);   // a little voice right after the merge chime
      mergeFlash(p.x, p.y, max);
      puff(p.x, p.y, 20, '#ffd23f', 160, 0.7, 5);
      ring(p.x, p.y, max ? 150 : 100, '#ffe38c', 0.5, 9); ring(p.x, p.y, 62, '#ffffff', 0.35, 5);
      flashGlow(p.x, p.y, max ? 190 : 130, '#ffd24a', 0.5);
      for (let i = 0; i < (max ? 10 : 6); i++) { const a = (i / (max ? 10 : 6)) * TAU; spawnFx({ k: 'p', x: p.x, y: p.y, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190 - 60, life: 0.7, max: 0.7, r: 5, col: i % 2 ? '#fff6b0' : '#ffd23f', grav: 160 }); }
      confetti(p.x, p.y - 20, max ? 46 : 24, max ? 380 : 300);
      if (max) txtFx(p.x + 56, p.y - 50, 'MAX LEVEL!', '#ffe14d', 26, 1.2); levelUpFx(p.x, p.y);   // LEVEL UP! comes from levelUpFx
      if (save.opt.motion && !document.body.classList.contains('nomotion')) {   // squash and stretch plus a soft dust puff where the tower meets the ground
        pops.set(e.uid, 0.55);
        puff(p.x, GROUND + 4, 5, '#e6dcc0', 70, 0.45, 3.5, 40); smoke(p.x - 14, GROUND + 6, 1, 7, '#e6dcc0'); smoke(p.x + 14, GROUND + 6, 1, 7, '#e6dcc0');
      }
      moods.set(e.uid, 1.6); emote(e.uid, '\u2B50', 1.2); buzz('merge');
      if (max) { hit(0.05); shake = Math.max(shake, 3); }
      break;
    }
    default: break;
  }
}
function mergeFlash(x, y, big) {   // short bright ring plus a star burst at the merge point; stars are skipped under reduced motion
  ring(x, y, big ? 80 : 56, '#ffffff', 0.2, 8);
  if (save.opt.motion && !document.body.classList.contains('nomotion')) for (let i = 0; i < (big ? 7 : 5); i++) { const a = (i / (big ? 7 : 5)) * TAU + 0.4; txtFx(x + Math.cos(a) * 34, y + Math.sin(a) * 34 - 6, '\u2605', i % 2 ? '#fff6b0' : '#ffd23f', 16, 0.5, false); }
}
// ---- JUICE helpers (cheap: they reuse ring, txtFx, puff and sparks; all skipped or reduced under reduced motion)
const motionOn = () => !!save.opt.motion && !document.body.classList.contains('nomotion');
let cheerHop = 0;   // seconds left of the tiny tower hop at wave start
function levelUpFx(x, y) {   // distinct from mergeFlash: a golden ring, LEVEL UP! over the cat and rising arrows
  ring(x, y - 6, 70, '#ffd23f', 0.6, 7); ring(x, y - 6, 110, '#fff2a0', 0.75, 3);
  txtFx(x, y - 78, 'LEVEL UP!', '#ffd23f', 30, 1.4);
  if (motionOn()) for (let i = -1; i <= 1; i++) txtFx(x + i * 26, y - 30 + Math.abs(i) * 10, '\u25B2', i ? '#fff2a0' : '#ffe14d', 17, 0.9, false);
}
function dustSweep() {   // a low band of dust rolling across the ground
  if (!motionOn() || gfx < 1) return;
  const n = gfx >= 2 ? 9 : 5;
  for (let i = 0; i < n; i++) spawnFx({ k: 'p', x: g.towerX + 30 + i * 70, y: GROUND + 4, vx: 140 + Math.random() * 60, vy: -6 - Math.random() * 10, life: 0.6, max: 0.6, r: 5 + Math.random() * 3, col: '#e6dcc0', grav: 0 });
}
let coinPrev = -1, coinAcc = 0, coinAccT = 0, chestPrev = 0;
function juiceCoins(dt) {   // aggregates coin gains over 300 ms: one gold pop and, for bigger gains, one +N text
  const c = Math.round(g.run.coins || 0);
  if (coinPrev < 0 || c < coinPrev) coinPrev = c;
  if (c > coinPrev) { coinAcc += c - coinPrev; coinPrev = c; if (!coinAccT) coinAccT = 0.3; }
  if (coinAccT > 0) {
    coinAccT -= dt;
    if (coinAccT <= 0) {
      coinAccT = 0;
      const bigGain = coinAcc >= 60;   // a jackpot-sized haul gets a bigger pop, a bigger number and sparks
      if (motionOn()) { const el = $('coinBox'); el.classList.remove('cgain', 'cbig'); void el.offsetWidth; el.classList.add('cgain'); if (bigGain) el.classList.add('cbig'); if (bigGain) { sparks(70, 76, 10, '#ffd23f', 160, 0.4); ring(70, 76, 40, '#ffd23f', 0.4, 4); } }
      if (coinAcc >= 5) txtFx(70, 134, '+' + coinAcc, '#ffd23f', bigGain ? 28 : 18, bigGain ? 1.3 : 0.9);
      coinAcc = 0;
    }
  }
}
function drain() { for (const e of g.ev) handle(e); g.ev.length = 0; }

// Lootbox drop timeline (seconds): arc up and land, one small bounce, rest, fly to the HUD counter.
const DROP_T = 1.6, DROP_LAND = 0.4, DROP_BOUNCE = 0.65, DROP_FLY = 1.1;
const DROP_TINT = { cardboard: ['#fff0d6', 0.3], basket: ['#ffb460', 0.4], silver: ['#bfe4ff', 0.5], golden: ['#ffd23f', 0.8] };
// position of a dropped box at a given age; pure and allocation free (writes into out)
function dropPos(f, age, out) {
  if (age < DROP_LAND) { const u = age / DROP_LAND; out.x = f.sx + (f.lx - f.sx) * u; out.y = f.sy - 62 * 4 * u * (1 - u) + 8 * u * u; out.h = 62 * 4 * u * (1 - u); }
  else if (age < DROP_BOUNCE) { const v = (age - DROP_LAND) / (DROP_BOUNCE - DROP_LAND); out.x = f.lx; out.h = 14 * 4 * v * (1 - v); out.y = f.sy + 8 - out.h; }
  else if (age < DROP_FLY) { out.x = f.lx; out.y = f.sy + 8; out.h = 0; }
  else { const u = (age - DROP_FLY) / (DROP_T - DROP_FLY), e = u * u * (3 - 2 * u); out.x = f.lx + (f.tx - f.lx) * e; out.y = f.sy + 8 + (f.ty - f.sy - 8) * e + f.oy * Math.sin(u * Math.PI); out.h = 0; }
  return out;
}
const _dp = { x: 0, y: 0, h: 0 };
const KINGDOM_TIPS = [
  'Every run gives you a few coins. Small upgrades add up, so keep playing.',
  'Spend your coins here between runs. Upgrades make your next run stronger.',
  'Gems are rare. You get them from nests, trophies and your first daily wins.',
  'No rush. Every run you play makes your kingdom a little stronger.',
];
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.life -= dt;
    if (f.life <= 0) {
      if (f.k === 'fly') { pulse(f.kind === 'coin' ? 'coinBox' : 'chestBox'); if (f.kind === 'coin' && Math.random() < 0.5) sfx.play('coin'); }
      fx[i] = fx[fx.length - 1]; fx.pop(); continue;
    }
    switch (f.k) {
      case 'p': f.vy += f.grav * dt; f.x += f.vx * dt; f.y += f.vy * dt; break;
      case 'sp': f.vy += 380 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 1 - 2 * dt; break;
      case 'sm': f.x += f.vx * dt; f.y += f.vy * dt; f.r += 18 * dt; break;
      case 'cf': f.vy += 520 * dt; f.vx *= 1 - 1.2 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; break;
      case 'corpse': f.vy += 900 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; break;
      case 't': f.y -= 38 * dt; break;
      case 'f': f.y += f.vy * dt; f.r *= 1 - 1.6 * dt; break;
      case 'h': f.y -= 34 * dt; break;
      case 'fly': if (f.drop) { const age = f.max - f.life; dropPos(f, age, _dp); f.x = _dp.x; f.y = _dp.y; if (!f.landed && age >= DROP_LAND) { f.landed = 1; sparks(f.lx, f.sy + 8, 5, '#fff3b8', 90, 0.3); } break; } { const u = 1 - f.life / f.max, e = u * u * (3 - 2 * u); f.x = f.sx + (f.tx - f.sx) * e + f.ox * Math.sin(u * Math.PI) * (1 - u); f.y = f.sy + (f.ty - f.sy) * e + f.oy * Math.sin(u * Math.PI); break; }
      default: break;
    }
  }
}
function drawFx() {
  // pass 1: solid shapes
  for (const f of fx) {
    const a = Math.max(0, f.life / f.max);
    if (f.k === 'p') { ctx.globalAlpha = a; ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.5 + a * 0.5), 0, TAU); ctx.fill(); }
    else if (f.k === 'sm') { ctx.globalAlpha = a * 0.55; ctx.drawImage(lightSprite(f.col), f.x - f.r * 1.3, f.y - f.r * 1.3, f.r * 2.6, f.r * 2.6); }
    else if (f.k === 'cf') { ctx.globalAlpha = Math.min(1, a * 3); ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.scale(1, Math.cos(f.rot * 1.7)); ctx.fillStyle = f.col; ctx.fillRect(-4, -2.5, 8, 5); ctx.restore(); }
    else if (f.k === 'corpse') {
      const sp = enemySprite(f.type, f.elite); ctx.globalAlpha = Math.min(1, a * 1.6); ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.scale(f.elite ? 1.16 : 1, f.elite ? 1.16 : 1);
      ctx.drawImage(sp.c, -sp.ax, -sp.ay, sp.w, sp.h); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a > 0.85 ? 0.9 : a * 0.45; ctx.drawImage(sp.c, -sp.ax, -sp.ay, sp.w, sp.h); ctx.restore();
    } else if (f.k === 's') { ctx.globalAlpha = a; ctx.fillStyle = '#fff6b0'; for (let i = 0; i < 4; i++) { const an = i * 1.57 + (1 - a) * 2, d = (1 - a) * 24 + 4; ctx.beginPath(); ctx.arc(f.x + Math.cos(an) * d, f.y + Math.sin(an) * d, 2.6 * a + 0.6, 0, TAU); ctx.fill(); } }
    else if (f.k === 'a') { ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; for (let i = 0; i < 3; i++) { ctx.lineWidth = 3.4 - i; ctx.beginPath(); ctx.arc(f.x + 16, f.y, (f.wide ? 46 : 28) + i * 6 + (1 - a) * 8, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke(); } }
    else if (f.k === 'fly' && f.drop) {
      const age = f.max - f.life, grounded = age < DROP_FLY, hh = grounded ? Math.max(0, f.sy + 8 - f.y) : 0;
      if (grounded) { const sx = age < DROP_LAND ? f.x : f.lx, sc = 1 / (1 + hh / 50); ctx.globalAlpha = 0.3 * sc; ctx.fillStyle = '#1a1024'; ctx.beginPath(); ctx.ellipse(sx, f.sy + 12, 13 * sc, 4 * sc, 0, 0, TAU); ctx.fill(); }
      const sq = age >= DROP_LAND && age < DROP_LAND + 0.08 ? 0.85 : 1;   // tiny squash on landing
      ctx.globalAlpha = 1; ctx.drawImage(iconSprite(f.tier && BOX_BY_ID[f.tier] ? BOX_BY_ID[f.tier].icon : '🎁'), f.x - 13, f.y + 13 - 26 * sq, 26, 26 * sq);
    }
    else if (f.k === 'fly') { ctx.globalAlpha = 1; if (f.kind === 'coin') { ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#8a5a14'; ctx.lineWidth = 1.4; const cw = 5.5 * Math.abs(Math.cos(f.life * 14)) + 1.2; ctx.beginPath(); ctx.ellipse(f.x, f.y, cw, 5.5, 0, 0, TAU); ctx.fill(); ctx.stroke(); if (cw > 2.6) { ctx.strokeStyle = '#c98a1c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(f.x, f.y, cw * 0.62, 3.4, 0, 0, TAU); ctx.stroke(); } ctx.fillStyle = '#fff8d0'; ctx.fillRect(f.x - cw * 0.5, f.y - 3.6, Math.max(1, cw * 0.35), 2.4); } else ctx.drawImage(iconSprite(f.tier && BOX_BY_ID[f.tier] ? BOX_BY_ID[f.tier].icon : '\uD83C\uDF81'), f.x - 13, f.y - 13, 26, 26); }
    else if (f.k === 'nest') {
      const u = 1 - a, spr = nestSprite(f.kind), sq = 1 - u * 0.55;
      ctx.globalAlpha = Math.min(1, a * 2.2); ctx.save(); ctx.translate(f.x + Math.sin(u * 60) * 5 * a, f.y + u * 14); ctx.scale(1.25 * (1 + u * 0.3), 1.25 * sq);
      ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, 0.7 - u * 2.2); ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h); ctx.restore();
    }
    else if (f.k === 'sil') {
      const u = 1 - a, hp = Math.abs(Math.sin(u * Math.PI * 2.5)) * 34 * (1 - u * 0.4), sx = f.x + u * 120, s = silSprite(f.id);
      ctx.globalAlpha = Math.min(1, a * 3) * (u < 0.1 ? u * 10 : 1); ctx.drawImage(s, sx - 36, f.y - hp - 66, 72, 72);
    }
    else if (f.k === 'h') { ctx.globalAlpha = Math.min(1, a * 2); ctx.drawImage(iconSprite('♥'), f.x - 8, f.y - 12, 16, 16); }
    ctx.globalCompositeOperation = 'source-over';
  }
  // pass 2: additive light
  add();
  for (const f of fx) {
    const a = Math.max(0, f.life / f.max);
    if (f.k === 'g') glow(f.x, f.y, f.r * (1.2 - a * 0.3), f.col, a * 0.62);
    else if (f.k === 'f') glow(f.x, f.y, Math.max(3, f.r) * (1.4 - a * 0.4), a > 0.7 ? '#ffe9a0' : a > 0.4 ? '#ffb040' : '#ff5a1f', a * 0.85);
    else if (f.k === 'sp') { ctx.globalAlpha = a; ctx.strokeStyle = f.col; ctx.lineWidth = 1 + 1.4 * a; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.vx * 0.05, f.y - f.vy * 0.05); ctx.stroke(); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = a * 0.9; ctx.fillRect(f.x - 1, f.y - 1, 2, 2); }
    else if (f.k === 'fly' && f.drop) {
      const age = f.max - f.life, tn = DROP_TINT[f.tier] || DROP_TINT.cardboard, st = tn[1], gold = f.tier === 'golden';
      glow(f.x, f.y, (gold ? 34 : 22) * (age < DROP_FLY ? 1 + 0.12 * Math.sin(age * 9) : 1), tn[0], st * (age < DROP_FLY ? 0.7 : 0.9));
      if (age >= DROP_LAND && age < DROP_FLY) {   // sparkle glint while it rests
        const g2 = Math.sin(((age - DROP_LAND) / (DROP_FLY - DROP_LAND)) * Math.PI), gl = (gold ? 15 : 10) * g2;
        ctx.globalAlpha = 0.9 * g2; ctx.strokeStyle = '#fff6d8'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(f.x + 6 - gl, f.y - 10); ctx.lineTo(f.x + 6 + gl, f.y - 10); ctx.moveTo(f.x + 6, f.y - 10 - gl); ctx.lineTo(f.x + 6, f.y - 10 + gl); ctx.stroke();
      } else if (age >= DROP_FLY) {   // short trail: ghosts of earlier positions on the same path
        for (let i = 1; i <= 4; i++) { dropPos(f, Math.max(DROP_FLY, age - i * 0.035), _dp); glow(_dp.x, _dp.y, 15 - i * 2.2, tn[0], 0.42 - i * 0.08); }
      }
    }
    else if (f.k === 'fly') { const ch = f.kind !== 'coin', u = 1 - a; glow(f.x, f.y, ch ? 24 : 11, ch ? '#ffe27a' : '#ffd23f', ch ? 0.45 + 0.2 * Math.sin(f.life * 20) : 0.32); if (ch) { ctx.globalAlpha = 0.8; ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; const gl = 9 + 5 * Math.sin(f.life * 17); ctx.beginPath(); ctx.moveTo(f.x - gl, f.y - 12); ctx.lineTo(f.x + gl, f.y - 12); ctx.moveTo(f.x, f.y - 12 - gl); ctx.lineTo(f.x, f.y - 12 + gl); ctx.stroke(); } }
    else if (f.k === 'r') { const u = 1 - a; ctx.globalAlpha = a; ctx.strokeStyle = f.col; ctx.lineWidth = f.w * a + 1; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * (0.3 + 0.7 * u), f.r * (0.3 + 0.7 * u) * 0.55, 0, 0, TAU); ctx.stroke(); }
    else if (f.k === 'l') {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const ph = Math.floor(tAnim * 28), last = f.pts.length - 1;
      for (const [wm, al, col] of [[3.2, 0.24, f.col], [1.6, 0.9, f.col], [0.7, 1, '#ffffff']]) { ctx.globalAlpha = a * al; ctx.strokeStyle = col; ctx.lineWidth = f.w * wm; ctx.beginPath(); f.pts.forEach((p, i) => { const j = i && i < last && f.pts.length > 2 ? Math.sin(ph * 12.9 + i * 78.2 + p.x * 0.31) * 5 : 0; if (i) ctx.lineTo(p.x, p.y + j); else ctx.moveTo(p.x, p.y); }); ctx.stroke(); }
    }
  }
  norm();
  // pass 3: overlays and text
  for (const f of fx) {
    const a = Math.max(0, f.life / f.max);
    if (f.k === 'flash') { ctx.globalAlpha = a; ctx.fillStyle = f.col; ctx.fillRect(0, 0, W, H); }
    else if (f.k === 'vig') {   // boss warning: red edges that pulse (steady when motion is off)
      const pulse = save.opt.motion ? 0.55 + 0.45 * Math.sin(tAnim * 7) : 0.8, grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.9);
      grd.addColorStop(0, 'rgba(255,40,70,0)'); grd.addColorStop(1, 'rgba(255,40,70,' + (0.5 * pulse * Math.min(1, a * 2.5)).toFixed(3) + ')');
      ctx.globalAlpha = 1; ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    }
    else if (f.k === 'emote') {
      const p = catPos(f.uid), age = f.max - f.life, sc = 1 + Math.max(0, 0.6 * (1 - age / 0.15));
      ctx.globalAlpha = Math.min(1, a * 3); ctx.drawImage(iconSprite(f.glyph), p.x + 22 - 13 * sc, p.y - 52 - age * 16 - 13 * sc, 26 * sc, 26 * sc);
    }
    else if (f.k === 't') {
      const age = f.max - f.life, sc = f.pop ? 1 + Math.max(0, 0.7 * (1 - age / 0.14)) : 1;
      ctx.globalAlpha = Math.min(1, a * 2.2); ctx.font = `400 ${Math.round((window.innerHeight <= 400 ? Math.max(f.size, 20) : f.size) * sc)}px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#271c33'; ctx.lineJoin = 'round';
      ctx.strokeText(f.t, f.x, f.y); ctx.fillStyle = f.col; ctx.fillText(f.t, f.x, f.y);
    }
  }
  norm();
}

// ambient drifting things that fit each theme
const amb = [];
let ambDeco = '';
function initAmbient(deco) {
  ambDeco = deco; amb.length = 0;
  for (let i = 0; i < 26; i++) amb.push({ x: Math.random() * W, y: Math.random() * H * 0.9, ph: Math.random() * 6, s: 0.6 + Math.random() * 0.8 });
}
let lastScroll = 0;
function drawAmbient(t, dt, scrollNow) {
  const ds = scrollNow - lastScroll; lastScroll = scrollNow;
  const fall = ambDeco === 'leaf' || ambDeco === 'snow' || ambDeco === 'petal';
  for (const a of amb) {
    a.x -= ds * 0.9 + (fall ? -18 : 6) * dt * a.s;
    a.y += (fall ? 26 * a.s : -8 * a.s) * dt + Math.sin(t * 1.3 + a.ph) * 0.25;
    if (a.x < -20) a.x = W + 10; if (a.x > W + 20) a.x = -10;
    if (a.y > H - 20 && fall) a.y = -10; if (a.y < -10 && !fall) a.y = H - 60;
    switch (ambDeco) {
      case 'flower': add(); glow(a.x, a.y, 7 * a.s, '#fff2a0', 0.5 + 0.3 * Math.sin(t * 2 + a.ph)); norm(); break;
      case 'star': add(); glow(a.x, a.y, 9 * a.s, '#b6ffa8', Math.max(0, 0.25 + 0.7 * Math.sin(t * 2.4 + a.ph))); norm(); break;
      case 'hole': add(); glow(a.x, a.y, 5 * a.s, '#ffe9a0', 0.35); norm(); break;
      case 'snow': ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(a.x, a.y, 2.2 * a.s, 0, TAU); ctx.fill(); break;
      case 'leaf': case 'petal': ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(t * 1.6 + a.ph); ctx.fillStyle = ambDeco === 'leaf' ? (a.s > 1 ? '#d9532b' : '#e8a22a') : 'rgba(255,170,205,.9)'; ctx.beginPath(); ctx.ellipse(0, 0, 5 * a.s, 2.4 * a.s, 0, 0, TAU); ctx.fill(); ctx.restore(); break;
      default: break;
    }
  }
}

// ---------------------------------------------------------------- drawing the world
// ---- cast shadows: a soft dark silhouette of each sprite, laid on the ground away from the sun
const shadowCache = new Map();
function shadowOf(key, src) {
  let s = shadowCache.get(key);
  if (!s) {
    s = document.createElement('canvas'); s.width = Math.max(1, src.width >> 1); s.height = Math.max(1, src.height >> 1);
    const x = s.getContext('2d');
    x.drawImage(src, 0, 0, s.width, s.height);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = '#1a1030'; x.fillRect(0, 0, s.width, s.height);
    shadowCache.set(key, s);
  }
  return s;
}
// ox,oy: where the sprite's feet are on the ground; sx,sy,sw,sh: sprite rectangle relative to that point
function castShadow(key, src, ox, oy, sx, sy, sw, sh, a) {
  if (gfx < 2) return;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.transform(1, 0, 0.85, -0.2, 0, 0);   // lay the silhouette down and lean it away from the sun
  ctx.globalAlpha = a;
  ctx.drawImage(shadowOf(key, src), sx, sy, sw, sh);
  ctx.restore();
}
// squishy secondary motion: the sprite is drawn in slices that sway a little more toward the top
function drawJelly(img, dx, dy, dw, dh, t, amp, phase) {
  const n = coarse ? 5 : 8, sh = img.height / n, dsh = dh / n;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), off = Math.sin(t * 2.4 + phase + (1 - u) * 2.2) * amp * (1 - u) * (1 - u * 0.4);
    ctx.drawImage(img, 0, k * sh, img.width, sh + 0.6, dx + off, dy + k * dsh, dw, dsh + 0.7);
  }
}
// soft contact shadow: dark core, feathered edge (one cached radial sprite, scaled per use)
let shadowSpr = null;
function shadow(x, y, rx) {
  if (!shadowSpr) {
    shadowSpr = document.createElement('canvas'); shadowSpr.width = 64; shadowSpr.height = 64;
    const x2 = shadowSpr.getContext('2d'), g2 = x2.createRadialGradient(32, 32, 2, 32, 32, 32);
    g2.addColorStop(0, 'rgba(30,20,50,.42)'); g2.addColorStop(0.55, 'rgba(30,20,50,.22)'); g2.addColorStop(1, 'rgba(30,20,50,0)');
    x2.fillStyle = g2; x2.fillRect(0, 0, 64, 64);
  }
  if (rx > 0.5) ctx.drawImage(shadowSpr, x - rx * 1.25, y - rx * 0.3, rx * 2.5, rx * 0.6);
}
// a little cushion the tower sits on (cached)
let rugSpr = null;
function drawRug(cx, y) {
  if (!rugSpr) {
    rugSpr = document.createElement('canvas'); rugSpr.width = 124; rugSpr.height = 30;
    const r = rugSpr.getContext('2d');
    r.fillStyle = '#7a2e4a'; r.beginPath(); r.ellipse(62, 17, 58, 11, 0, 0, TAU); r.fill();
    r.fillStyle = '#a8456a'; r.beginPath(); r.ellipse(62, 14, 58, 10, 0, 0, TAU); r.fill();
    r.strokeStyle = '#ffd98a'; r.lineWidth = 1.5; r.beginPath(); r.ellipse(62, 14, 48, 7.5, 0, 0, TAU); r.stroke();
    r.fillStyle = 'rgba(255,255,255,.16)'; r.beginPath(); r.ellipse(62, 11, 40, 4, 0, 0, TAU); r.fill();
    r.fillStyle = '#ffd98a'; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; r.beginPath(); r.arc(62 + Math.cos(a) * 53, 14 + Math.sin(a) * 8.5, 1.4, 0, TAU); r.fill(); }
  }
  ctx.drawImage(rugSpr, cx - 62, y - 15);
}

const iconCache = new Map();
function iconSprite(emoji) {
  let c = iconCache.get(emoji);
  if (!c) { c = document.createElement('canvas'); c.width = c.height = 48; c.getContext('2d').drawImage(iconCanvas(emoji), 0, 0, 48, 48); iconCache.set(emoji, c); }
  return c;
}
function drawStack(cx, list, t, marching, hpBars, cheer, zoomies) {
  list.forEach((c, i) => {
    const d = CAT_BY_ID[c.id];
    const sc = 1.0 * (1 + 0.06 * (c.lvl - 1));
    let hop = marching ? Math.abs(Math.sin(t * 9 + i * 0.7)) * 3.2 : Math.sin(t * 2.4 + i) * 1.3;
    if (cheer) hop = Math.abs(Math.sin(t * 8 + i * 0.9)) * 12;
    else if (cheerHop > 0) { const u = Math.max(0, Math.min(1, 1 - cheerHop / 0.55 - i * 0.07)); hop += Math.sin(u * Math.PI) * 9; }
    const below = list[i - 1], bump = below && below.atk > 0 ? Math.sin((below.atk / 0.22) * Math.PI) * 3.5 : 0;
    const feetY = GROUND - i * SLOT - hop - bump;
    const atk = c.atk > 0 ? c.atk / 0.22 : 0;
    const lunge = atk * 7;
    const sway = i * (marching ? Math.sin(t * 9) * 1.5 : Math.sin(t * 1.7 + 0.5) * 0.9) + towerWob * Math.sin(t * 32) * i * 1.6;
    const mood = moods.get(c.uid) || 0;
    const variant = c.flash > 0 ? 'hurt' : mood > 0 || cheer ? 'happy' : (cheer ? 'blink' : ((t * 0.9 + i * 1.37 + (c.seed || 0)) % 4.3 < 0.13 ? 'blink' : 'open'));
    const spr = catSprite(c.id, variant);
    if (i === 0) { shadow(cx, GROUND + 5, 60); drawRug(cx, GROUND + 3); } else shadow(cx + sway, feetY + 1, 30);
    castShadow('cat:' + c.id, catSprite(c.id), cx + lunge * 0.3, GROUND + 2, -60 * sc, feetY - GROUND - 107 * sc, 120 * sc, 120 * sc, 0.30 - i * 0.03);
    if (c.lvl >= 2) { add(); glow(cx + sway, feetY - 44, 58 + c.lvl * 8, c.lvl === 3 ? '#ffd24a' : '#ffe38c', (c.lvl === 3 ? 0.5 : 0.32) + 0.08 * Math.sin(t * 3 + i)); norm(); }
    const squash = c.flash > 0 ? 0.06 : 0;
    for (let k = zoomies ? 2 : 0; k >= 0; k--) {
      ctx.save();
      const hop = !k && !marching && !cheer && save.opt.motion && atk < 0.02 ? idleHop(t, i + (c.seed || 0)) * 7 : 0;
      ctx.translate(cx + lunge + sway - k * 16, feetY - hop);
      // idle breathing: a slow chest rise, out of step between cats, steadier while marching or attacking
      const br = marching || cheer || !save.opt.motion ? 0 : Math.sin(t * 2.1 + i * 1.9 + (c.seed || 0)) * 0.014 * (1 - Math.min(1, atk));
      ctx.scale(1 + atk * 0.05 + squash - br * 0.5, 1 - atk * 0.06 - squash + br);
      const pop = pops.get(c.uid); if (pop) { const u = pop / 0.55, st = Math.sin((1 - u) * Math.PI * 3) * u * 0.2; ctx.scale(1 - st * 0.55, 1 + st); }
      // idle fidget: every 6 to 10 s (out of step per cat) a quick ear-twitch style head wiggle, no redraw
      let fid = 0;
      if (!k && !marching && !cheer && save.opt.motion && atk < 0.02) { const per = 6 + ((i * 7 + (c.seed || 0) * 13) % 5), ph = (t + i * 2.3 + (c.seed || 0) * 3) % per; if (ph < 0.4) fid = Math.sin(ph / 0.4 * Math.PI * 3) * (1 - ph / 0.4) * 0.05; }
      ctx.rotate(fid + Math.sin(t * 2 + i * 1.3) * 0.015 + (marching ? Math.sin(t * 9 + i) * 0.03 : 0) + sway * 0.002);
      ctx.globalAlpha = k ? 0.22 / k : 1;
      if (gfx >= 2 && !k) drawJelly(spr, -60 * sc, -107 * sc, 120 * sc, 120 * sc, t, 0.9 + atk * 2.2 + (marching ? 1.6 : 0) + towerWob * 2.5, i * 1.3 + (c.seed || 0));
      else ctx.drawImage(spr, -60 * sc, -107 * sc, 120 * sc, 120 * sc);
      if (!k && c.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.8, c.flash * 4); ctx.drawImage(spr, -60 * sc, -107 * sc, 120 * sc, 120 * sc); }
      ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (c.lvl === 3) { ctx.fillStyle = '#fff6b0'; for (let k = 0; k < 3; k++) { const an = t * 2 + k * 2.1; ctx.beginPath(); ctx.arc(cx + sway + Math.cos(an) * 40, feetY - 44 + Math.sin(an) * 26, 2.4, 0, TAU); ctx.fill(); } }
    if (hpBars) {
      const bx = cx - 142, by = feetY - 50, bw = 84;
      ctx.font = `400 ${window.innerHeight <= 400 ? 16 : 13}px ${DISPLAY}`; ctx.textAlign = 'left'; ctx.lineWidth = 4; ctx.strokeStyle = '#1b1233'; ctx.lineJoin = 'round';
      ctx.strokeText(d.name, bx, by - 4); ctx.fillStyle = '#fff'; ctx.fillText(d.name, bx, by - 4);
      if (c.lvl > 1) { const nw = ctx.measureText(d.name).width + 4; ctx.strokeText('\u2605'.repeat(c.lvl), bx + nw, by - 4); ctx.fillStyle = '#ffd23f'; ctx.fillText('\u2605'.repeat(c.lvl), bx + nw, by - 4); }
      const r = Math.min(1, Math.max(0, c.hp / c.max));
      const cb = save.opt.colorblind;
      const hc = r > 0.5 ? (cb ? ['#bfe4ff', '#4aa8ff'] : ['#b8ffd0', '#3fcf78']) : r > 0.25 ? ['#ffe9a0', '#f0a81a'] : (Math.sin(t * 14) > 0 ? (cb ? ['#ffd0a0', '#ff8a2a'] : ['#ffc0c0', '#ff5a5a']) : ['#fff0e0', '#ffd9b0']);
      ctx.fillStyle = '#1b1233'; ctx.beginPath(); ctx.roundRect(bx - 2, by - 1, bw + 4, 12, 6); ctx.fill();
      const hg = ctx.createLinearGradient(0, by, 0, by + 10); hg.addColorStop(0, hc[0]); hg.addColorStop(1, hc[1]);
      ctx.fillStyle = hg; ctx.beginPath(); ctx.roundRect(bx, by + 1, Math.max(4, bw * r), 8, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.roundRect(bx + 2, by + 2, Math.max(2, bw * r - 4), 2, 1); ctx.fill();
      if (c.shd > 0.5) { const sr = Math.min(1, c.shd / c.max); ctx.fillStyle = '#3fd2ff'; ctx.beginPath(); ctx.roundRect(bx, by + 1, Math.max(4, bw * sr), 4.5, 2); ctx.fill(); ctx.strokeStyle = '#0f4a6a'; ctx.lineWidth = 1; ctx.stroke(); }   // a relic barrier over the health
      if (c.sp != null && hpBars === true && c.id) {
        // special move charge: a thin bar under the health bar that glows when the move is ready
        const sp = Math.min(1, c.sp), sc = (S.specialInfo(c.id) || {}).color || '#ffd23f';
        ctx.fillStyle = '#1b1233'; ctx.beginPath(); ctx.roundRect(bx - 2, by + 11, bw + 4, 7, 4); ctx.fill();
        ctx.fillStyle = sp >= 1 ? sc : mix(sc, '#6a5aa0', 0.45); ctx.beginPath(); ctx.roundRect(bx, by + 12, Math.max(3, bw * sp), 4, 2); ctx.fill();
        if (sp >= 1) { add(); glow(bx + bw / 2, by + 14, 46, sc, 0.22 + 0.12 * Math.sin(t * 8)); norm(); }
      }
      if (c.items) c.items.forEach((id, k) => ctx.drawImage(iconSprite(ITEM_BY_ID[id].icon), bx + k * 17, by + 20, 16, 16));
    }
  });
}

function drawMound(e, t) {
  // a buried digger: a moving bump of earth and a little dust
  ctx.fillStyle = 'rgba(40,24,14,.35)'; ctx.beginPath(); ctx.ellipse(e.x, e.y + 5, 22, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8a6a48'; ctx.strokeStyle = '#4a3322'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, 17, 7 + Math.sin(t * 9 + e.t) * 1.2, 0, Math.PI, TAU); ctx.fill(); ctx.stroke();
  if (Math.random() < 0.1) smoke(e.x + (Math.random() - 0.5) * 20, e.y, 1, 4, '#9a7a58');
}
// a burning mouse wears flame tongues (more of them on a big mouse) and throws embers, so the burn is seen, not only a tint
function drawFlames(e, y, t) {
  const n = gfx >= 2 ? (e.w > 50 ? 5 : 4) : 2, base = y - e.h * 0.02;
  add(); glow(e.x + Math.sin(t * 20) * 3, y - e.h * 0.55, e.w * 0.6, '#ff6a1f', 0.32); norm();   // a warm halo, kept faint so the mouse is not washed out
  for (let i = 0; i < n; i++) {
    const ph = t * 13 + i * 2.1 + e.uid, bx = e.x + (n === 1 ? 0 : (i / (n - 1) - 0.5)) * e.w * 0.95, h = e.h * (0.85 + 0.3 * Math.sin(ph)), w = Math.max(7, e.w * 0.2), sw = Math.sin(ph * 0.8) * w * 0.8;
    for (const [sc, col, al] of [[1, '#e8480f', 0.92], [0.72, '#ff9a1f', 0.95], [0.4, '#ffe27a', 1]]) {   // red, orange, yellow core: solid colours so they read on pale fur
      ctx.globalAlpha = al; ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(bx - w * sc, base); ctx.quadraticCurveTo(bx - w * 0.9 * sc, base - h * sc * 0.55, bx + sw * sc, base - h * sc); ctx.quadraticCurveTo(bx + w * 0.9 * sc, base - h * sc * 0.55, bx + w * sc, base); ctx.closePath(); ctx.fill();
    }
  }
  norm();
  if (gfx >= 1 && fx.length < fxCap * 0.8 && Math.random() < 0.22) spawnFx({ k: 'sp', x: e.x + (Math.random() - 0.5) * e.w * 0.8, y: y - e.h * (0.4 + Math.random() * 0.6), vx: (Math.random() - 0.5) * 40, vy: -80 - Math.random() * 60, col: Math.random() < 0.5 ? '#ffb347' : '#ff7a2b', life: 0.6, max: 0.6 });
}
function drawEnemy(e, t) {
  if (e.dead) return;
  if (e.under) { drawMound(e, t); return; }
  let y = e.y;
  const walking = !e.boss && !e.fly && e.stun <= 0;
  if (e.fly) y -= e.alt + Math.sin(t * 4 + e.t) * 5;
  const hop = walking ? Math.abs(Math.sin(e.t * 9)) * 3 : 0;
  const pop = e.age < 0.3 ? (() => { const u = e.age / 0.3, c1 = 1.7; return Math.max(0.01, 1 + (c1 + 1) * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2)); })() : 1;
  if (!e.fly) shadow(e.x + e.kb, e.y + 1, (e.boss ? 80 : e.w * 0.5) * pop);
  else shadow(e.x, e.y + 1, e.w * 0.35);
  if (!e.boss && gfx >= 2) { const sp0 = enemySprite(e.type, e.elite), es = (e.elite ? 1.16 : 1) * pop; castShadow('en:' + e.type + (e.elite ? '*' : ''), sp0.c, e.x + e.kb, e.y + 1, -sp0.ax * es, -sp0.ay * es - (e.fly ? e.alt : 0), sp0.w * es, sp0.h * es, e.fly ? 0.14 : 0.26); }
  ctx.save();
  ctx.translate(e.x + e.kb, y - hop);
  const f = e.flash > 0 ? e.flash / 0.1 : 0;
  if (e.boss) {
    const spr = nestSprite(e.kind);
    const pulse = e.swing > 0 ? 1 + e.swing * 0.12 : 1;
    if (e.flash > 0) ctx.translate((Math.random() - 0.5) * 3, 0);
    ctx.scale(1.25 * pulse * pop, 1.25 * (2 - pulse) * pop);
    ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h);
    ctx.save(); ctx.translate(-spr.ax, -spr.ay); nestOverlay(ctx, e.hp / e.maxHp, t, g.wave === FINALE_WAVE); ctx.restore();
    if (e.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h); }
  } else {
    const spr = enemySprite(e.type, e.elite);
    const sc = (e.elite ? 1.16 : 1) * pop;
    ctx.translate(-(e.swing > 0 ? 6 * e.swing / 0.3 : 0), 0);
    ctx.rotate(Math.sin(e.t * 9) * (walking ? 0.05 : 0) - e.kb * 0.012);
    ctx.scale(sc * (1 + f * 0.14), sc * (1 - f * 0.12));
    ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h);
    if (e.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h); }
  }
  ctx.restore();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const top = y - (e.boss ? 150 : e.h * (e.elite ? 1.28 : 1.12));
  const barLift = e.boss ? 0 : e.elite ? 26 : 20;   // bars sit above the ears and crown, not across the eyes
  if (e.shield > 0) { add(); glow(e.x, y - e.h * 0.5, e.w * 0.95, '#6aa8ff', 0.3 + 0.08 * Math.sin(t * 6)); norm(); ctx.strokeStyle = 'rgba(190,220,255,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(e.x - e.w * 0.3, y - e.h * 0.45, e.w * 0.32, e.h * 0.5, 0, 0, TAU); ctx.stroke(); }
  if (e.boss && e.bubble > 0) { ctx.fillStyle = 'rgba(207,192,255,.22)'; ctx.strokeStyle = 'rgba(235,225,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, y - 80, 112 + Math.sin(t * 8) * 3, 0, TAU); ctx.fill(); ctx.stroke(); add(); glow(e.x, y - 80, 120, '#cfc0ff', 0.25); norm(); }
  if (g.hexT > 0 && !e.boss) { add(); glow(e.x, y - e.h * 0.5, e.w * 0.8, '#d28aff', 0.4); norm(); }
  if (g.focus === e.uid) {
    ctx.strokeStyle = '#ff8fb7'; ctx.lineWidth = 2.4; const rr = 15 + Math.sin(t * 8) * 2;
    ctx.beginPath(); ctx.ellipse(e.x, e.y + 4, e.w * 0.55 + rr * 0.3, 7, 0, 0, TAU); ctx.stroke();
    const ty = y - e.h * (e.elite ? 1.4 : 1.2) - 22 - Math.sin(t * 8) * 2;
    ctx.fillStyle = '#ff8fb7'; ctx.strokeStyle = '#271c33'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(e.x - 7, ty - 8); ctx.lineTo(e.x + 7, ty - 8); ctx.lineTo(e.x, ty + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (e.slowT > 0 && e.slow > 0 && !e.boss) { add(); glow(e.x, y - e.h * 0.5, e.w * 0.9, '#8fd3ff', 0.4); norm(); if (Math.random() < 0.06) spawnFx({ k: 'sp', x: e.x + (Math.random() - 0.5) * e.w, y: y - e.h * (0.3 + Math.random() * 0.6), vx: (Math.random() - 0.5) * 50, vy: -20, col: '#dff4ff', life: 0.5, max: 0.5 }); }
  if (e.boss) { add(); glow(e.x, e.y + 2, 120, '#ff3a3a', 0.1 + 0.06 * Math.sin(t * 3) + (1 - e.hp / e.maxHp) * 0.14); norm(); }
  if (e.burn) drawFlames(e, y, t);
  if (e.stun > 0 && !e.boss) { ctx.fillStyle = '#ffe14d'; for (let k = 0; k < 3; k++) { const an = t * 6 + k * 2.1; ctx.beginPath(); ctx.arc(e.x + Math.cos(an) * 10, top + Math.sin(an) * 3, 2.2, 0, TAU); ctx.fill(); } }
  if (e.poison) { ctx.fillStyle = '#8be05a'; ctx.beginPath(); ctx.arc(e.x + 12, y - e.h * 0.9 + Math.sin(t * 6) * 2, 3, 0, TAU); ctx.fill(); }
  if (e.shield > 0 && !e.boss) {
    const w = Math.max(26, e.w) * 0.9, by = top - 12 - barLift;
    ctx.fillStyle = 'rgba(39,28,51,.8)'; ctx.beginPath(); ctx.roundRect(e.x - w / 2 - 1, by, w + 2, 6, 3); ctx.fill();
    ctx.fillStyle = '#6aa8ff'; ctx.beginPath(); ctx.roundRect(e.x - w / 2, by + 1, Math.max(2, w * e.shield / e.maxShield), 4, 2); ctx.fill();
  }
  if ((e.hp < e.maxHp || e.elite) && !e.boss) {
    const w = Math.max(26, e.w) * 0.9, by = top - 6 - barLift;
    ctx.fillStyle = 'rgba(39,28,51,.8)'; ctx.beginPath(); ctx.roundRect(e.x - w / 2 - 1, by, w + 2, 6, 3); ctx.fill();
    ctx.fillStyle = e.elite ? '#ffd23f' : save.opt.colorblind ? '#ff8a2a' : '#ff7a8a'; ctx.beginPath(); ctx.roundRect(e.x - w / 2, by + 1, Math.max(2, w * e.hp / e.maxHp), 4, 2); ctx.fill();
  }
}

const trails = new WeakMap();
function drawProj(p, t, ids) {
  if (p.kind === 'lob') {
    if (Math.random() < 0.45) spawnFx({ k: 'sm', x: p.x, y: p.y, vx: 0, vy: -8, r: 4, life: 0.35, max: 0.35, col: '#cfc6dc' });
    ctx.fillStyle = p.color || '#333'; ctx.strokeStyle = '#271c33'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(p.x - 2, p.y - 2, 2, 0, TAU); ctx.fill();
    add(); glow(p.x, p.y, 16, p.color && p.color.length === 7 && p.color !== '#2c2c36' && p.color !== '#3b3b4f' ? p.color : '#ffb040', 0.45); norm();
    return;
  }
  if (p.kind === 'enemy') {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 10);
    if (p.big) { ctx.fillStyle = '#ffd34a'; ctx.strokeStyle = '#8a5a14'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-9, 6); ctx.lineTo(9, 6); ctx.lineTo(0, -9); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e0a52a'; ctx.beginPath(); ctx.arc(1, 1, 2, 0, TAU); ctx.fill(); }
    else { ctx.fillStyle = '#9a9aa8'; ctx.strokeStyle = '#271c33'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    return;
  }
  const id = ids.get(p.owner), col = p.fx.color || '#ffffff';
  let tr = trails.get(p);
  if (!tr) { tr = []; trails.set(p, tr); }
  tr.push(p.x, p.y); if (tr.length > 14) tr.splice(0, 2);
  add(); ctx.lineCap = 'round';
  for (let i = 2; i < tr.length; i += 2) {
    const u = i / tr.length;
    ctx.globalAlpha = u * 0.7; ctx.strokeStyle = col; ctx.lineWidth = p.r * 1.7 * u;
    ctx.beginPath(); ctx.moveTo(tr[i - 2], tr[i - 1]); ctx.lineTo(tr[i], tr[i + 1]); ctx.stroke();
  }
  glow(p.x, p.y, p.r * 4.5, col, 0.85); norm();
  const sp = Math.hypot(p.vx, p.vy), ux = p.vx / sp, uy = p.vy / sp;
  ctx.save(); ctx.lineCap = 'round';
  if (id === 'shadow') { ctx.translate(p.x, p.y); ctx.rotate(t * 20); ctx.fillStyle = '#dfe6f2'; ctx.strokeStyle = '#271c33'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 2.4 : 7; ctx.lineTo(Math.cos(i * 0.785) * r, Math.sin(i * 0.785) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
  else if (id === 'pudding') { ctx.drawImage(iconSprite('♥'), p.x - 8, p.y - 9, 16, 16); }
  else if (id === 'lyra') { ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#271c33'; ctx.lineWidth = 2.5; ctx.font = `800 18px ${FONT}`; ctx.textAlign = 'center'; ctx.strokeText('♪', p.x, p.y + 6); ctx.fillText('♪', p.x, p.y + 6); }
  else if (id === 'yuki') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#7fc8ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, TAU); ctx.fill(); ctx.stroke(); }
  else if (id === 'hawkeye') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - ux * 34, p.y - uy * 34); ctx.stroke(); }
  else if (id === 'mecha') { ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.fillStyle = '#e0e6f0'; ctx.strokeStyle = '#271c33'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(-8, -3, 14, 6, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ff5d3a'; ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(11, 0); ctx.lineTo(6, 3); ctx.fill(); }
  else if (id === 'boo') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, TAU); ctx.fill(); }
  else { ctx.fillStyle = col; ctx.strokeStyle = '#271c33'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 1, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}

function drawField(t, dt) {
  const ids = new Map();
  for (const c of g.cats) ids.set(c.uid, c.id);
  for (const p of g.pools) {
    const a = Math.min(1, p.t / 1.2);
    ctx.save(); ctx.translate(p.x, GROUND + 14); ctx.scale(1, 0.32); add();
    glow(0, 0, p.r * (1 + 0.06 * Math.sin(t * 8)), '#ff6a2b', 0.8 * a); glow(0, 0, p.r * 0.55, '#ffd23f', 0.8 * a); ctx.restore(); norm();
  }
  for (const m of g.mines) { ctx.fillStyle = '#4a4a5a'; ctx.strokeStyle = '#271c33'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(m.x, GROUND + 10, 13, 6, 0, 0, TAU); ctx.fill(); ctx.stroke(); const on = Math.sin(t * 8) > 0; ctx.fillStyle = on ? '#ff5d5d' : '#7a2a2a'; ctx.beginPath(); ctx.arc(m.x, GROUND + 6, 3, 0, TAU); ctx.fill(); if (on) { add(); glow(m.x, GROUND + 6, 14, '#ff5d5d', 0.6); norm(); } }
  const alive = S.aliveCats(g);
  const list = alive.map((c) => ({ id: c.id, lvl: c.lvl, hp: c.hp, max: S.catMaxHp(g, c), flash: c.flash, atk: c.atk, seed: c.uid * 0.7, items: c.items, uid: c.uid, sp: c.sp, shd: c.shd }));
  const marching = g.marching && g.state === 'fight';
  drawStack(g.towerX, list, t, marching, true, mode === 'celebrate', g.zoomT > 0);
  if (g.fortressT > 0) {
    const a = Math.min(1, g.fortressT) * (0.85 + 0.15 * Math.sin(t * 9));
    ctx.fillStyle = `rgba(150,205,255,${0.16 * a})`; ctx.strokeStyle = `rgba(220,240,255,${0.75 * a})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(g.towerX + 10, GROUND - 105, 74, 160, 0, 0, TAU); ctx.fill(); ctx.stroke();
  }
  if (g.phaseT > 0 && Math.random() < 0.3) spawnFx({ k: 'sm', x: g.towerX + (Math.random() - 0.5) * 60, y: GROUND - 40 - Math.random() * 200, vx: 0, vy: -20, r: 8, life: 0.5, max: 0.5, col: '#cfd8ff' });
  if (marching) { dustT -= dt; if (dustT <= 0) { dustT = 0.11; smoke(g.towerX - 10 + Math.random() * 40, GROUND + 6, 1, 6, '#d8cfae'); } }
  const es = g.enemies.filter((e) => !e.dead).sort((a, b) => a.y - b.y);
  for (const e of es) drawEnemy(e, t);
  for (const p of g.projs) drawProj(p, t, ids);
  if (g.zoomT > 0) {
    ctx.strokeStyle = 'rgba(255,200,230,.5)'; ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) { const y = 60 + ((i * 97 + t * 900) % 380), x = (i * 211 + t * 1400) % (W + 200) - 100; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 90, y); ctx.stroke(); }
  }
}
let dustT = 0;

function drawTitleScene(t) {
  const cx = 100;
  if (gfx >= 1) {
    add();
    for (let i = 0; i < 9; i++) { const fx2 = (i * 107 + Math.sin(t * 0.5 + i) * 30) % W, fy2 = 300 + ((i * 53) % 150) + Math.cos(t * 0.7 + i * 2) * 14; glow(fx2, fy2, 10 + 3 * Math.sin(t * 3 + i), '#ffe58a', 0.3 + 0.25 * Math.sin(t * 2.2 + i * 1.7)); }
    norm();
    ctx.fillStyle = 'rgba(120,200,110,.7)';
    for (let i = 0; i < 6; i++) { const lx = ((i * 170 - t * 28) % (W + 40) + W + 40) % (W + 40) - 20, ly = ((t * 22 + i * 90) % (H + 20)) - 10; ctx.save(); ctx.translate(lx, ly); ctx.rotate(t * 1.5 + i); ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.2, 0, 0, TAU); ctx.fill(); ctx.restore(); }
  }
  const list = titleStack.map((id, i) => ({ id, lvl: i === 0 ? 2 : 1, hp: 1, max: 1, flash: 0, atk: Math.max(0, Math.sin(t * 3 + i) - 0.8), seed: i * 0.9 }));
  drawStack(cx, list, t, true, false, false, false);
  for (let i = 0; i < 5; i++) {
    const x = ((i * 190 - t * 60) % 1000 + 1000) % 1000 + 200;
    const type = ['mouse', 'scout', 'slinger', 'armored', 'mouse'][i];
    const spr = enemySprite(type, false);
    // the mice march on the lower ground, where the menu does not hide them, and get swatted at the cat line
    const y = GROUND + 34 + (i % 3) * 13, sc = 1 + (i % 3) * 0.05;
    const fade = x < 270 ? Math.max(0, (x - 200) / 70) : 1, prev = titleMiceX[i];
    if (prev != null && prev > x && prev >= 205 && x < 205 && prev - x < 40 && fx.length < 200) { puff(205, y - 14, 7, '#fff6d6', 90, 0.45, 4); sparks(205, y - 18, 5, '#ffe27a', 170, 0.35); spawnFx({ k: 's', x: 205, y: y - 22, life: 0.4, max: 0.4 }); }
    titleMiceX[i] = x;
    shadow(x, y, 18 * sc * fade);
    ctx.save(); ctx.globalAlpha = fade; ctx.translate(x, y - Math.abs(Math.sin(t * 9 + i)) * 3 - (1 - fade) * 14); ctx.scale(sc, sc * (0.5 + 0.5 * fade)); ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h); ctx.restore();
  }
}
const titleMiceX = [];

let vig = null, hurtVig = null;
function vignette(t) {
  if (!vig) {
    vig = document.createElement('canvas'); vig.width = W; vig.height = H; const x = vig.getContext('2d');
    const gr = x.createRadialGradient(W / 2, H / 2, H * 0.55, W / 2, H / 2, H * 1.0); gr.addColorStop(0, 'rgba(20,10,40,0)'); gr.addColorStop(1, 'rgba(20,10,40,.45)'); x.fillStyle = gr; x.fillRect(0, 0, W, H);
    hurtVig = document.createElement('canvas'); hurtVig.width = W; hurtVig.height = H; const y = hurtVig.getContext('2d');
    const g2 = y.createRadialGradient(W / 2, H / 2, H * 0.5, W / 2, H / 2, H * 1.0); g2.addColorStop(0, 'rgba(255,60,90,0)'); g2.addColorStop(1, 'rgba(255,60,90,.55)'); y.fillStyle = g2; y.fillRect(0, 0, W, H);
  }
  ctx.drawImage(vig, 0, 0);
  if (g && mode === 'play') {
    const alive = S.aliveCats(g);
    const low = alive.length && alive.some((c) => c.hp / S.catMaxHp(g, c) < 0.25);
    if (low) { ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 6); ctx.drawImage(hurtVig, 0, 0); ctx.globalAlpha = 1; }
    if (g.zoomT > 0) { ctx.globalAlpha = 0.3; ctx.fillStyle = 'rgba(255,140,200,.25)'; ctx.fillRect(0, 0, W, 8); ctx.fillRect(0, H - 8, W, 8); ctx.globalAlpha = 1; }
  }
}

let incoming = [], incomingEnd = 0, waveTotal = 0;
function drawIncoming() {
  const left = incomingEnd - tAnim;
  if (left <= 0 || !incoming.length || mode !== 'play') return;
  const al = Math.min(1, left * 2, (4.6 - left) * 3);
  ctx.save(); ctx.globalAlpha = al; ctx.font = `400 17px ${DISPLAY}`; ctx.textAlign = 'left';
  const items = incoming.slice(0, 6), cw = 74, w = items.length * cw + 22, x0 = W / 2 - w / 2, y0 = 254;
  ctx.fillStyle = 'rgba(27,18,51,.72)'; ctx.beginPath(); ctx.roundRect(x0, y0, w, 58, 29); ctx.fill();
  items.forEach((it, i) => {
    const spr = enemySprite(it.type, false), sc = Math.min(0.95, 38 / ((ENEMY_TYPES[it.type] && ENEMY_TYPES[it.type].h) || 40)), cx = x0 + 18 + i * cw;
    ctx.drawImage(spr.c, cx + 18 - spr.ax * sc, y0 + 50 - spr.ay * sc, spr.w * sc, spr.h * sc);
    if (it.el) {
      // elites in the mix: a little gold crown on the sprite
      const kx = cx + 26, ky = y0 + 9;
      ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#6a4a14'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(kx - 6, ky + 7); ctx.lineTo(kx - 7, ky); ctx.lineTo(kx - 3, ky + 3); ctx.lineTo(kx, ky - 2); ctx.lineTo(kx + 3, ky + 3); ctx.lineTo(kx + 7, ky); ctx.lineTo(kx + 6, ky + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.lineWidth = 3.5; ctx.strokeStyle = '#1b1233'; ctx.lineJoin = 'round';
    ctx.strokeText('\u00D7' + it.n, cx + 40, y0 + 36); ctx.fillStyle = '#fff'; ctx.fillText('\u00D7' + it.n, cx + 40, y0 + 36);
  });
  ctx.restore();
}

// the combo counter heats up with the streak: white, then gold with a glow, then an orange flicker, then a hot pink shake with flames,
// and a thin bar shows how long is left before the streak lapses (so keeping it alive feels urgent)
function comboHeat(c) { return c >= 100 ? 4 : c >= 50 ? 3 : c >= 20 ? 2 : c >= 10 ? 1 : 0; }
const HEAT = [{ c: '#ffffff', g: 0, w: 0 }, { c: '#ffe27a', g: 8, w: 0 }, { c: '#ffb04a', g: 14, w: 1.2 }, { c: '#ff8fb7', g: 20, w: 2.2 }, { c: '#c58aff', g: 26, w: 3.2 }];
function drawCombo(t) {
  if (combo < 3 || mode !== 'play') return;
  const h = comboHeat(combo), H0 = HEAT[h], m = motionOn();
  const s = 1 + comboPulse * 0.35, fade = Math.min(1, comboT * 2);
  const wob = m && H0.w ? Math.sin(t * 38) * H0.w : 0, wob2 = m && H0.w ? Math.cos(t * 31) * H0.w * 0.6 : 0;
  ctx.save(); ctx.translate(18 + wob, 176 + wob2); ctx.scale(s, s); ctx.globalAlpha = fade;
  ctx.font = `400 ${26 + Math.min(18, combo / 4)}px ${DISPLAY}`; ctx.textAlign = 'left'; ctx.lineWidth = 5; ctx.strokeStyle = '#271c33'; ctx.lineJoin = 'round';
  if (m && H0.g) { ctx.shadowColor = H0.c; ctx.shadowBlur = H0.g * (0.8 + 0.2 * Math.sin(t * 9)); }
  ctx.strokeText(`x${combo}`, 0, 0); ctx.fillStyle = H0.c; ctx.fillText(`x${combo}`, 0, 0);
  ctx.shadowBlur = 0;
  ctx.font = `800 13px ${FONT}`; ctx.lineWidth = 3.5; ctx.strokeText('COMBO', 2, 15); ctx.fillStyle = '#ffe3c4'; ctx.fillText('COMBO', 2, 15);
  const frac = Math.max(0, Math.min(1, comboT / 2.4));   // time left before the streak lapses
  ctx.fillStyle = 'rgba(20,10,40,.7)'; ctx.fillRect(2, 21, 70, 5);
  ctx.fillStyle = frac < 0.3 ? '#ff6a6a' : H0.c; ctx.fillRect(2, 21, 70 * frac, 5);
  if (m && h >= 3) {   // flames licking up from the number
    for (let k = 0; k < 5; k++) { const ph = (t * 1.7 + k * 0.37) % 1; ctx.globalAlpha = fade * (1 - ph) * 0.9; ctx.fillStyle = k % 2 ? '#ffd23f' : H0.c; ctx.beginPath(); ctx.arc(10 + k * 12 + Math.sin(t * 7 + k) * 4, -18 - ph * 30, 3.5 * (1 - ph) + 1, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- lighting and post processing
const post = createPost(W, H);
let ambCur = '#ffffff', thunder = 0, duskAmt = 0;
const drops = Array.from({ length: 90 }, () => ({ x: Math.random() * (W + 200), y: Math.random() * H, v: 620 + Math.random() * 300, l: 10 + Math.random() * 14 }));
const flakes = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 24 + Math.random() * 40, p: Math.random() * 6, s: 1 + Math.random() * 2 }));

function ambientTarget() {
  const th = THEMES[bdIdx] || THEMES[0];
  if (!g || mode === 'title') return { color: th.amb[0], dusk: 0 };
  const nest = g.enemies.some((e) => e.boss && !e.dead);
  return ambientFor(th, ((g.wave - 1) % BOSS_EVERY) + 1, BOSS_EVERY, g.bossWave, nest);
}
function gatherLights(t) {
  const th = THEMES[bdIdx] || THEMES[0], night = th.deco === 'star', L = [];
  L.push({ x: 740, y: 120, r: 560, col: night ? '#8fa8ff' : '#fff0c8', a: night ? 0.4 : 0.55 });
  if (g && mode !== 'title') {
    L.push({ x: g.towerX, y: GROUND - 110, r: 200, col: '#ffe9c8', a: 0.5 });
    if (g.zoomT > 0) L.push({ x: W / 2, y: H / 2, r: 640, col: '#ffb8e0', a: 0.4 });
    for (const p of g.projs) {
      if (L.length > 50) break;
      const col = p.kind === 'lob' ? '#ffb040' : p.kind === 'enemy' ? '#c8c8d8' : (p.fx && p.fx.color) || '#ffffff';
      L.push({ x: p.x, y: p.y, r: p.kind === 'enemy' ? 40 : 62, col, a: 0.75 });
    }
    for (const e of g.enemies) {
      if (L.length > 50) break;
      if (e.dead) continue;
      if (e.boss) L.push({ x: e.x, y: e.y - 40, r: 190 + Math.sin(t * 3) * 14, col: '#ff4a4a', a: 0.75 });
      else if (e.elite) L.push({ x: e.x, y: e.y - e.h * 0.5, r: 70, col: '#ffd23f', a: 0.55 });
      else if (e.burn) L.push({ x: e.x, y: e.y - e.h * 0.5, r: 60, col: '#ff7a2b', a: 0.6 });
      else if (e.slowT > 0 && e.slow > 0) L.push({ x: e.x, y: e.y - e.h * 0.5, r: 52, col: '#8fd3ff', a: 0.5 });
    }
    for (const mi of g.mines) if (Math.sin(t * 8) > 0 && L.length < 54) L.push({ x: mi.x, y: GROUND + 6, r: 46, col: '#ff5d5d', a: 0.7 });
    for (const p of g.pools) if (L.length < 54) L.push({ x: p.x, y: GROUND + 14, r: p.r * 1.5, col: '#ff7a2b', a: Math.min(1, p.t / 1.2) * 0.8 });
  } else {
    L.push({ x: 100, y: GROUND - 120, r: 220, col: '#ffe9c8', a: 0.5 });
  }
  for (const f of fx) {
    if (L.length > 58) break;
    const a = Math.max(0, f.life / f.max);
    if (f.k === 'g') L.push({ x: f.x, y: f.y, r: f.r * 1.5, col: f.col, a });
    else if (f.k === 'f') L.push({ x: f.x, y: f.y, r: 56, col: '#ff8a2b', a: a * 0.9 });
    else if (f.k === 'l') { const p = f.pts[Math.floor(f.pts.length / 2)]; L.push({ x: p.x, y: p.y, r: 110, col: f.col, a }); }
    else if (f.k === 'corpse' && f.elite) L.push({ x: f.x, y: f.y, r: 60, col: '#ffd23f', a: a * 0.6 });
  }
  return L;
}
const splashes = [];
function drawWeather(t, dt) {
  const th = THEMES[bdIdx] || THEMES[0];
  if (th.weather === 'rain') {
    ctx.save(); ctx.strokeStyle = 'rgba(190,210,255,.42)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (const d of drops) {
      d.y += d.v * dt; d.x -= d.v * dt * 0.18;
      if (!d.gy) d.gy = GROUND + 4 + Math.random() * 50;
      if (d.y > d.gy) { if (splashes.length < 30) splashes.push({ x: d.x, y: d.gy, t: 0 }); d.y = -20 - Math.random() * 60; d.x = Math.random() * (W + 200); d.gy = 0; }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * 0.18, d.y - d.l);
    }
    ctx.stroke();
    // drops that reach the ground leave a small ring that spreads and fades
    ctx.strokeStyle = 'rgba(210,228,255,.7)'; ctx.lineWidth = 1;
    for (let i = splashes.length - 1; i >= 0; i--) {
      const sp = splashes[i]; sp.t += dt * 3.2;
      if (sp.t >= 1) { splashes[i] = splashes[splashes.length - 1]; splashes.pop(); continue; }
      ctx.globalAlpha = 0.65 * (1 - sp.t); ctx.beginPath(); ctx.ellipse(sp.x, sp.y, 2 + sp.t * 9, (2 + sp.t * 9) * 0.32, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  } else if (th.weather === 'snow') {
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (const f of flakes) { f.y += f.v * dt; f.x += Math.sin(t + f.p) * 14 * dt - 8 * dt; if (f.y > H) { f.y = -4; f.x = Math.random() * W; } if (f.x < -4) f.x = W; ctx.beginPath(); ctx.arc(f.x, f.y, f.s, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
}

function render(dt) {
  const t = tAnim;
  ctx.setTransform(res, 0, 0, res, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  const sk = shake * save.opt.shake, zp = save.opt.motion ? zpunch + (sk > 0.5 ? 0.012 : 0) : 0;
  if (zp > 0.001) { ctx.translate(W / 2, H / 2); ctx.scale(1 + zp, 1 + zp); ctx.translate(-W / 2, -H / 2); }
  zpunch *= Math.exp(-6 * dt);
  if (sk > 0.2) ctx.translate(Math.round(Math.sin(tAnim * 83) * sk * 0.5), Math.round(Math.sin(tAnim * 71 + 1.7) * sk * 0.5));
  shake = Math.max(0, shake - dt * 40);
  if (g && mode !== 'title' && g.wave > 0) setBackdrop(themeFor(g.wave)); else if (!bd) setBackdrop(0);
  const inRun = g && mode !== 'title';
  if (!inRun) titleScroll += dt * 40;
  const sc = inRun ? g.scroll : titleScroll;
  drawBackdrop(ctx, bd, sc, t);
  if (save.opt.quality !== 'low') { drawRays(ctx, bd, t); drawAmbient(t, dt, sc); }
  if (inRun) drawField(t, dt); else drawTitleScene(t);
  drawFront(ctx, bd, sc);
  const th = THEMES[bdIdx] || THEMES[0], lit = gfx >= 1 && save.opt.quality !== 'low';
  const tgt = ambientTarget();
  if (lit) {
    if (th.weather === 'rain' && g && mode === 'play' && save.opt.motion && Math.random() < dt * 0.1) { thunder = 1; screenFlash('rgba(210,220,255,.35)', 0.25); sfx.play('thunder'); }
    thunder *= Math.exp(-3.2 * dt);
    ambCur = mix(ambCur, mix(tgt.color, '#ffffff', Math.min(0.9, thunder)), Math.min(1, dt * 1.6));
    duskAmt += (tgt.dusk - duskAmt) * Math.min(1, dt * 1.2);
    const blobs = th.deco === 'star' ? null : [0, 1, 2].map((i) => ({ x: ((t * 12 + i * 430) % 1350) - 170, y: GROUND + 22 + i * 12, rx: 200, ry: 34, a: 0.16 }));
    post.light(ctx, ambCur, gatherLights(t), blobs, [th.grade[0], th.grade[1], duskAmt]);
  }
  if (gfx >= 2) drawWeather(t, dt);
  drawFx();
  if (mode === 'play' && g && g.cats) {
    // low-health warning: a soft red edge that beats like a pulse while any cat is nearly out of health
    const aliveNow = S.aliveCats(g);
    const dg = dangerLevel(aliveNow.map((c) => ({ hp: c.hp, max: S.catMaxHp(g, c) })));
    // a cat that drops below a third of its health gives one worried mew (and may do it again after it has healed past half)
    for (const lowCat of aliveNow) {
      const r = lowCat.hp / S.catMaxHp(g, lowCat);
      if (r < 1 / 3 && !worried.has(lowCat.uid)) { worried.add(lowCat.uid); sfx.meow(lowCat.id, 'worried'); }
      else if (r >= 0.5) worried.delete(lowCat.uid);
    }
    if (dg > 0) {
      const beat = save.opt.motion ? 0.6 + 0.4 * Math.sin(tAnim * 5) : 0.8, grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
      grd.addColorStop(0, 'rgba(255,40,70,0)'); grd.addColorStop(1, 'rgba(255,40,70,' + (0.5 * dg * beat).toFixed(3) + ')');
      ctx.globalAlpha = 1; ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
      if (tAnim >= heartAt && !paused && !tipHold) { sfx.play('heart', 0.6 + 0.4 * dg); heartAt = tAnim + 1.3 - 0.5 * dg; }   // quicker the closer to zero
    }
  }
  ctx.restore();
  if (gfx >= 3) {
    // glow reads best in dim light, so it is gentle at noon and stronger at dusk, at night and in the rain
    const lum = (parseInt(ambCur.slice(1, 3), 16) + parseInt(ambCur.slice(3, 5), 16) + parseInt(ambCur.slice(5, 7), 16)) / 765;
    post.bloom(ctx, cv, (post.hasFilter ? 0.36 : 0.16) * (1.25 - lum));
  }
  if (gfx >= 3 && th.deco !== 'star') post.flare(ctx, 740, 120, 0.035);
  if (gfx >= 3 && !coarse) post.grain(ctx, t, 0.045);
  if (save.opt.quality !== 'low') vignette(t);
  drawCombo(t);
  drawIncoming();
}

// ---------------------------------------------------------------- input
function togglePause() { if (mode !== 'play') return; if (tipHold) { dismissTip(); return; } if (paused) { paused = false; closeScreen(); sfx.play('pick', 1.3); } else showPause(); }
// ---- special moves and tap focus
const spBtns = new Map();
let autoBtn = null;
function setAutoSpecial(on) { save.opt.autoSpecial = on; persist(); sfx.play('ui'); toast(on ? 'Auto specials on' : 'Auto specials off'); }
function doSpecial(uid) {
  if (mode !== 'play' || paused || tipHold || !g) return;
  const sc = g.cats.find((c) => c.uid === uid);
  if (S.useSpecial(g, uid)) {
    if (coachEl && coachEl.dataset.key === 'c7') hideCoach();
    // the portrait button flashes and bursts in the cat's own colour when the move fires
    const fb = spBtns.get(uid);
    if (fb && sc && motionOn()) { const rc = fb.getBoundingClientRect(), col = S.specialInfo(sc.id).color; fb.classList.remove('fired'); void fb.offsetWidth; fb.classList.add('fired'); domBurst(rc.left + rc.width / 2, rc.top + rc.height / 2, 14, [col, '#fff'], ''); buzz('pop'); }
    drain();
  }
  else sfx.play('nope');
}
function updateSpecials() {
  const box = $('specials');
  if (save.opt.autoSpecial && g && mode === 'play' && !paused && !tipHold && g.state === 'fight') {
    const pick = S.autoSpecialPick(g);   // assist mode, rules live in sim.js
    if (pick) doSpecial(pick.uid);
  }
  const show = g && mode === 'play' && g.state === 'fight';
  box.style.display = show || (g && mode === 'play') ? 'flex' : 'none';
  if (!autoBtn) {
    autoBtn = document.createElement('button'); autoBtn.className = 'autob'; autoBtn.textContent = 'AUTO'; autoBtn.title = 'Auto special moves (key A)'; autoBtn.setAttribute('aria-label', 'Auto special moves');
    autoBtn.addEventListener('click', (e) => { e.stopPropagation(); sfx.unlock(); setAutoSpecial(!save.opt.autoSpecial); });
    box.appendChild(autoBtn);
  }
  autoBtn.classList.toggle('on', !!save.opt.autoSpecial);
  autoBtn.setAttribute('aria-pressed', save.opt.autoSpecial ? 'true' : 'false');
  if (!g) return;
  const cats = g.cats;
  for (const [uid, b] of spBtns) if (!cats.some((c) => c.uid === uid)) { b.remove(); spBtns.delete(uid); }
  cats.forEach((c, i) => {
    let b = spBtns.get(c.uid);
    if (!b) {
      b = document.createElement('button'); b.className = 'spb'; b.dataset.uid = c.uid;
      const info = S.specialInfo(c.id);
      b.title = `${info.name} (key ${i + 1}): ${SPECIAL_TEXT[info.kind] || ''}`;
      b.setAttribute('aria-label', `${CAT_BY_ID[c.id].name}: ${info.name}`);
      b.innerHTML = `<img src="${thumbURL(c.id)}" alt=""><i></i><em>${i + 1}</em><span class="si">${info.icon}</span>`;
      box.appendChild(b); spBtns.set(c.uid, b);
    }
    const ready = S.specialReady(c);
    { const lab = specialLabel(CAT_BY_ID[c.id].name, S.specialInfo(c.id).name, c.sp, ready, c.ko); if (b.getAttribute('aria-label') !== lab) b.setAttribute('aria-label', lab); }
    b.style.setProperty('--p', Math.round(c.sp * 100) + '%');
    b.style.setProperty('--c', S.specialInfo(c.id).color);
    if (ready && !b._was && g.state === 'fight' && motionOn()) {   // just charged: a ring flashes out and a bright ding calls the player
      b.classList.remove('justready'); void b.offsetWidth; b.classList.add('justready'); sfx.play('pip', 1.7);
      const rc = b.getBoundingClientRect(); domBurst(rc.left + rc.width / 2, rc.top + rc.height / 2, 8, [S.specialInfo(c.id).color, '#fff'], '');
    }
    b._was = ready;
    b.classList.toggle('ready', ready);
    b.classList.toggle('down', c.ko);
    b.firstChild.style.opacity = c.ko ? 0.35 : 1;
    b.style.order = String(-i);
    if (ready && !save.tips.c7 && g.state === 'fight') coach('c7', 'This cat is charged! Tap its round picture to use its special move. Tap AUTO and the game does it for you.', 520, 340, 'right', { target: b });
  });
}
$('specials').addEventListener('click', (e) => { const b = e.target.closest('.spb'); if (b) { sfx.unlock(); doSpecial(+b.dataset.uid); } });
// tapping the field: a charged cat fires its special, a mouse becomes the focus target
// where a pointer event landed on the 960x540 stage (the whole game is turned a quarter turn on an upright phone)
function stagePoint(e) {
  const r = cv.getBoundingClientRect();
  const upright = coarse && innerHeight > innerWidth * 1.1;
  if (upright) return { x: ((e.clientY - r.top) / r.height) * W, y: ((r.right - e.clientX) / r.width) * H };
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}
// the title: tap one of the cats in the tower on the left and it meows back
screenEl.addEventListener('pointerdown', (e) => {
  if (mode !== 'title' || e.target.closest('button')) return;
  const { x, y } = stagePoint(e);
  if (!isFinite(x) || !isFinite(y) || x > 160) return;
  const i = Math.round((GROUND - 50 - y) / SLOT);
  if (i < 0 || i >= titleStack.length || Math.abs(GROUND - 50 - i * SLOT - y) > SLOT * 0.55) return;
  sfx.unlock(); sfx.meow(titleStack[i], 'happy'); sparks(100, GROUND - 60 - i * SLOT, 6, '#fff6b0', 120, 0.4);
});
// holding a finger (or the mouse button) on a cat for half a second makes it purr; letting go before that cancels it
let purrTimer = 0;
const stopPurr = () => { clearTimeout(purrTimer); purrTimer = 0; };
addEventListener('pointerup', stopPurr); cv.addEventListener('pointercancel', stopPurr);
cv.addEventListener('contextmenu', (e) => e.preventDefault());   // a long press must not open the browser menu
cv.addEventListener('pointerdown', (e) => {
  if (!g || mode !== 'play' || paused || tipHold || g.state !== 'fight') return;
  const { x, y } = stagePoint(e);
  if (!isFinite(x) || !isFinite(y)) return;
  for (let i = 0; i < g.cats.length; i++) {
    const c = g.cats[i], py = GROUND - 50 - S.aliveCats(g).indexOf(c) * SLOT;
    if (!c.ko && Math.abs(x - g.towerX) < 55 && Math.abs(y - py) < SLOT * 0.5) { if (S.specialReady(c)) doSpecial(c.uid); else { sfx.unlock(); sfx.meow(c.id, 'happy'); moods.set(c.uid, 1.2); emote(c.uid, '\uD83D\uDC96', 0.9); if (motionOn()) pops.set(c.uid, 0.55); spawnFx({ k: 's', x: g.towerX + 18, y: py - 30, life: 0.5, max: 0.5 }); stopPurr(); purrTimer = setTimeout(() => { purrTimer = 0; if (mode === 'play' && !paused) { sfx.play('purr'); moods.set(c.uid, 2.6); emote(c.uid, '\uD83D\uDC96', 1.4); } }, 550); } return; }
  }
  let best = null, bd = 1e9;
  for (const en of g.enemies) {
    if (en.dead || en.under) continue;
    const cy = en.fly ? en.y - en.alt : en.y - en.h * 0.5, dx = Math.abs(x - en.x), dy = Math.abs(y - cy);
    if (dx < en.w * 0.8 + 16 && dy < en.h * 0.8 + 20 && dx + dy < bd) { bd = dx + dy; best = en; }
  }
  if (best) { if (S.setFocus(g, best.uid)) { sfx.play('hover'); ring(best.x, best.y, 34, '#ff8fb7', 0.3, 4); } } else if (g.focus) g.focus = 0;
});
function doZoomies() { if (mode === 'play' && !paused && !tipHold && S.useZoomies(g)) { if (coachEl && coachEl.dataset.key === 'c5') hideCoach(); drain(); } }
// full screen: the Fullscreen API where the browser has it (Android, desktop); iPhone Safari has none, so the button stays hidden there
const fsEl = document.documentElement;
const fsReq = fsEl.requestFullscreen || fsEl.webkitRequestFullscreen;
function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function toggleFull() {
  try {
    if (isFull()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const r = fsReq.call(fsEl);
    const lock = () => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* not supported */ } };
    if (r && r.then) r.then(lock, () => {}); else lock();
  } catch (e) { /* refused */ }
}
if (fsReq && !matchMedia('(display-mode: standalone)').matches) {
  $('bFull').hidden = false;
  $('bFull').addEventListener('click', () => { sfx.unlock(); sfx.play('ui'); buzz('tick'); toggleFull(); });
  const syncFull = () => $('bFull').classList.toggle('on', isFull());
  document.addEventListener('fullscreenchange', () => { syncFull(); fit(); });
  document.addEventListener('webkitfullscreenchange', () => { syncFull(); fit(); });
}
function toggleSpeed() { speed = speed === 1 ? 2 : 1; $('bSpeed').textContent = 'x' + speed; save.opt.fast = speed === 2; persist(); sfx.play('ui', speed === 2 ? 1.35 : 0.8); buzz('tick'); }   // every HUD button answers a press: faster rises, slower falls
$('bPause').addEventListener('click', () => { sfx.unlock(); togglePause(); });
$('bSpeed').addEventListener('click', () => { sfx.unlock(); toggleSpeed(); });
$('bSound').addEventListener('click', () => { sfx.unlock(); save.sound = !save.sound; sfx.on = save.sound; persist(); if (save.sound) sfx.play('pick', 1.2); buzz('tick'); toast(save.sound ? 'Sound on' : 'Sound off'); });
$('zoom').addEventListener('click', () => { sfx.unlock(); doZoomies(); });
$('bMeter').addEventListener('click', () => { sfx.unlock(); save.meter = !save.meter; persist(); meterT = 0; sfx.play('ui', save.meter ? 1.25 : 0.8); buzz('tick'); });
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (tipHold && (k === 'enter' || k === ' ' || k === 'escape')) { e.preventDefault(); sfx.play('ui'); dismissTip(); return; }   // Enter, Space or Esc press Got it
  if (document.body.classList.contains('scr') && k >= '1' && k <= '9' && !(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) {
    // on a pick screen the number keys choose the nth card
    const card = [...screenEl.querySelectorAll('.cards > .card[data-act]')][+k - 1];
    if (card) { e.preventDefault(); card.click(); }
    return;
  }
  if (k === 'enter' && document.body.classList.contains('scr') && !(e.target && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(e.target.tagName)) && !(e.target && e.target.matches && e.target.matches('[data-act]'))) {
    // Enter presses the screen's main button (Play, Resume, Try again, Continue)
    const main = screenEl.querySelector('.btn.big:not([disabled]), .btn.green:not([disabled])');
    if (main) { e.preventDefault(); main.click(); }
    return;
  }
  if (kNav && kScene && $('kscene') && document.body.classList.contains('scr') && (k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === 'arrowdown')) {
    e.preventDefault(); kNav(k === 'arrowleft' || k === 'arrowup' ? -1 : 1); return;
  }
  if ((k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === 'arrowdown') && document.body.classList.contains('scr') && !(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) {
    // arrow keys walk the focus through the cards of a pick screen
    const cards = [...screenEl.querySelectorAll('.cards > .card[data-act]')];
    if (cards.length) {
      e.preventDefault();
      const at = cards.indexOf(document.activeElement), step = k === 'arrowleft' || k === 'arrowup' ? -1 : 1;
      const to = cards[at < 0 ? (step > 0 ? 0 : cards.length - 1) : (at + step + cards.length) % cards.length];
      to.focus(); sfx.play('hover');
      return;
    }
  }
  if (k === 'escape' && document.body.classList.contains('scr')) {
    // Escape backs out of a sub screen (settings, how to play, dex, trophies, Kingdom); the pause screen still resumes
    const back = screenEl.querySelector('[data-act="back"]:not([disabled])');
    if (back) { e.preventDefault(); back.click(); return; }
  }
  if (k === ' ') { e.preventDefault(); doZoomies(); }
  else if (k === 'p' || k === 'escape') togglePause();
  else if (k === 'f') toggleSpeed();
  else if (k >= '1' && k <= '6' && g && g.cats[+k - 1]) doSpecial(g.cats[+k - 1].uid);
  else if (k === 'g' && !$('bFull').hidden) toggleFull();
  else if (k === 'd') { save.meter = !save.meter; persist(); meterT = 0; }
  else if (k === 'a') setAutoSpecial(!save.opt.autoSpecial);
  else if (k === 'm') { save.sound = !save.sound; sfx.on = save.sound; persist(); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play' && !paused) showPause();
  // phones may discard canvas contents while the tab is in the background: rebuild everything that is cached
  if (!document.hidden) {
    catSprites.clear(); silSprites.clear(); iconCache.clear(); shadowCache.clear(); glowCache.clear();
    for (const [k, v] of backdrops) { freeBackdrop(v); backdrops.delete(k); }
    resetWorldArt(); bd = null; bdIdx = -1;
  }
});
addEventListener('pagehide', () => { if (g && mode !== 'over' && g.wave > 1) commitRun(); });

// ---------------------------------------------------------------- main loop
let frameEma = 16, slowFrames = 0, fastFrames = 0, refreshMs = 16.7, calmNeed = 300, lastDrop = -99;
// adaptive quality: step down when frames run long, step back up after a calm stretch (with back-off so it cannot flap).
// The limit follows the real refresh rate, so a 30 Hz or battery saver display is not mistaken for a slow device.
function adaptQuality(rawMs) {
  if (save.opt.quality !== 'auto' || document.hidden || paused || tipHold || rawMs > 120) { slowFrames = fastFrames = 0; return; }
  refreshMs = Math.min(refreshMs + 0.02, rawMs);
  frameEma = frameEma * 0.95 + rawMs * 0.05;
  const limit = Math.max(26, refreshMs * 1.55);
  if (frameEma > limit && (gfx > 0 || quality > 0.61)) {
    fastFrames = 0;
    if (++slowFrames > 90) {
      slowFrames = 0;
      if (tAnim - lastDrop < 40) calmNeed = Math.min(2400, calmNeed * 2);
      lastDrop = tAnim;
      if (gfx > 1) gfx--; else if (quality > 0.61) { quality *= 0.78; fit(); } else gfx = 0;
    }
  } else {
    slowFrames = 0;
    if (frameEma < limit * 0.62 && (gfx < (coarse ? 2 : 3) || quality < 1)) {
      if (++fastFrames > calmNeed) {
        fastFrames = 0;
        if (gfx < 1) gfx = 1; else if (quality < 1) { quality = Math.min(1, quality / 0.78); fit(); } else gfx++;
      }
    } else fastFrames = 0;
  }
}
function frame(ts) {
  const raw = (ts - last) / 1000;
  const dt = Math.min(0.05, raw);
  last = ts;
  tAnim += dt;
  adaptQuality(Math.min(100, raw * 1000));
  if (slowT > 0) { slowT -= dt; if (slowT <= 0) slowT = 0; } else timeScale += (1 - timeScale) * Math.min(1, dt * 5);
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
  comboPulse *= Math.exp(-8 * dt); towerWob *= Math.exp(-5 * dt);
  for (const [k, v] of moods) { if (v - dt <= 0) moods.delete(k); else moods.set(k, v - dt); }
  if (cheerHop > 0) cheerHop = Math.max(0, cheerHop - dt);
  for (const [k, v] of pops) { if (v - dt <= 0) pops.delete(k); else pops.set(k, v - dt); }
  sfx.setIntensity(Math.min(1, combo / 30));
  if (g && mode === 'play' && !paused && !tipHold) {
    let sd = dt * speed * timeScale, fd = sd;
    if (hitstop > 0) { hitstop -= dt; sd = 0; fd = dt * 0.1; }
    acc += sd;
    let n = 0;
    while (acc >= S.DT && n < 8) {
      S.step(g, S.DT); acc -= S.DT; n++;
      if (g.state === 'clear' || g.state === 'over') break;
    }
    if (n >= 8) acc = 0;
    drain();
    if (nestPending > 0) {
      nestPending -= dt;
      const nest = g.state === 'fight' && g.enemies.find((m) => m.boss && !m.dead);
      if (nest) {   // the nest slams down when the fight starts
        nestPending = 0;
        puff(nest.x, GROUND, 28, '#cdb89a', 190, 0.8, 6); smoke(nest.x, GROUND - 10, 5, 22, '#b8a890');
        ring(nest.x, GROUND - 4, 190, '#e8d4a8', 0.6, 10); ring(nest.x, GROUND - 4, 110, '#ffffff', 0.4, 6);
        shake = Math.max(shake, 12); hit(0.06); sfx.play('boom');
      }
    }
    if (g.state === 'fight' && (!dpsHist.length || g.t - dpsHist[dpsHist.length - 1].t > 0.25)) { dpsHist.push({ t: g.t, dmg: g.run.dmg }); while (dpsHist.length > 16) dpsHist.shift(); }
    updateFx(fd);
    if (g.state === 'clear') onClear(); else if (g.state === 'over') onOver();
  } else if (g && mode === 'celebrate') {
    g.ev.length = 0;
    updateFx(dt * Math.max(0.35, timeScale));
    celeb -= dt;
    if (celeb > 0.3 && Math.random() < dt * 14) confetti(120 + Math.random() * 700, -10, 2, 120);
    if (celeb <= 0) { mode = 'reward'; nextReward(); }
  } else {
    if (g && g.ev.length) g.ev.length = 0;
    updateFx(paused || tipHold ? 0 : dt);
  }
  // under a dimmed menu the scene only needs a third of the frames: the GPU skips two re-blurs out of three and a phone runs cooler
  coverDt += dt;
  if (coverScreen && (paused || mode !== 'play') && ++coverSkip % 3) { updateHud(dt); requestAnimationFrame(frame); return; }
  render(coverDt); coverDt = 0;
  updateHud(dt);
  requestAnimationFrame(frame);
}

window.stackingCats = { setCombo: (n) => { combo = n; comboT = 2.4; }, get sfx() { return sfx; }, coach, beginWave, showFinale, get g() { return g; }, get mode() { return mode; }, S, save: () => save, hideCoach, startRun, toast, get res() { return res; }, get fxCount() { return fx.length; }, showTower, showBox, showEvent, showRouteReward, showCatReward, showSnackReward, doSpecial, showBoxReveal, showStats, showPause, showOver, showFull, showTitle, banner, clearChoices: () => { rewardChoices = null; }, get gfx() { return gfx; }, set gfx(v) { gfx = v; } };
showTitle();
// the boot splash (in index.html) covers the half-built first frame; it stays long enough for the three slams, then lifts onto the title
{
  const boot = document.getElementById('boot');
  if (boot) {
    const wait = motionOn() ? Math.max(0, 1500 - performance.now()) : 0;
    setTimeout(() => { boot.classList.add('gone'); setTimeout(() => boot.remove(), 600); }, wait);
    // a new player picks a name once, right after the intro (Later is remembered, the Ranking button asks again)
    if (!save.name && !save.nameAsked) setTimeout(() => { if (mode === 'title' && !save.name) showNamePrompt(showTitle); }, wait + 700);
  }
}
requestAnimationFrame(frame);
void ENEMY_TYPES;
